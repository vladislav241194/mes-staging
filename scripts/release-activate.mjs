#!/usr/bin/env node
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];

const CONTOURS = {
  pilot: {
    appPath: "/srv/mes/pilot/app",
    releasesPath: "/srv/mes/pilot/releases",
    service: "mes-pilot.service",
    url: "https://pilot.mes-line.ru",
    port: "4175",
  },
  staging: {
    appPath: "/srv/mes/dev/app",
    releasesPath: "/srv/mes/dev/releases",
    service: "mes-dev.service",
    url: "https://staging.mes-line.ru",
    port: "4174",
  },
};

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseArgs(argv) {
  const args = { contour: "pilot", remote: "mes-line", releaseId: "", dryRun: false, pinLegacyBaseline: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "release-id") args.releaseId = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else if (key === "pin-legacy-baseline") args.pinLegacyBaseline = true;
    else throw new Error(`Unknown option: --${key}`);
  }
  return args;
}

function safeReleaseId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) throw new Error("--release-id is required");
  return normalized;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function run(command, args, { cwd = projectRoot, allowFailure = false, input = "" } = {}) {
  const startedAt = performance.now();
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { command: [command, ...args].join(" "), code, stdout, stderr, durationMs: performance.now() - startedAt };
      if (code !== 0 && !allowFailure) {
        const error = new Error(`${result.command} failed with code ${code}`);
        error.result = result;
        reject(error);
        return;
      }
      resolvePromise(result);
    });
    child.stdin.end(input);
  });
}

function remoteBashArgs(remote, scriptArguments) {
  const command = `bash -s -- ${scriptArguments.map(shellQuote).join(" ")}`;
  return [...sshOptions, remote, command];
}

const activationScript = String.raw`#!/usr/bin/env bash
set -euo pipefail

app_path="$1"
releases_path="$2"
release_path="$3"
release_app_path="$4"
release_id="$5"
service="$6"
port="$7"
public_health_url="$8"
dry_run="$9"
shift 9
pin_legacy_baseline="$1"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
legacy_path=""
failed_pointer_path="$release_path/failed-active-pointer-$timestamp"
health_body_path="$release_path/activation-health-$timestamp.json"
activation_record_path="$release_path/activation.json"
activation_record_backup_path="$release_path/activation.json.before-$timestamp"
activation_phase="initializing"
diagnostics_emitted=0
runtime_switched=0
activation_record_had_previous=0
activation_record_replaced=0

redact_diagnostics() {
  # Service output can include application log text. Keep diagnostics useful
  # while omitting common credential-bearing lines and URL credentials.
  sed -E \
    -e '/([Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Pp][Aa][Ss][Ss][Ww][Dd]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Aa][Uu][Tt][Hh][Oo][Rr][Ii][Zz][Aa][Tt][Ii][Oo][Nn]|[Cc][Oo][Oo][Kk][Ii][Ee]|[Aa][Pp][Ii][_-]?[Kk][Ee][Yy]|[Pp][Rr][Ii][Vv][Aa][Tt][Ee][_-]?[Kk][Ee][Yy])/d' \
    -e 's#([[:alpha:]][[:alnum:]+.-]*://)[^[:space:]@/]+:[^[:space:]@/]+@#\1[REDACTED]@#g' \
    -e 's/(Bearer|Basic)[[:space:]]+[A-Za-z0-9._~+\/=+-]+/\1 [REDACTED]/g'
}

describe_active_runtime() {
  if [ -L "$app_path" ]; then
    printf 'kind=release-pointer target=%s\n' "$(readlink -f "$app_path" 2>/dev/null || printf '<unresolved>')"
  elif [ -d "$app_path" ]; then
    printf 'kind=legacy-directory target=%s\n' "$app_path"
  else
    printf 'kind=missing target=<unavailable>\n'
  fi
}

emit_failure_diagnostics() {
  local failure_code="$1"
  local failure_reason="$2"
  [ "$diagnostics_emitted" = "1" ] && return 0
  diagnostics_emitted=1

  {
    echo "ACTIVATION_DIAGNOSTICS_BEGIN"
    printf 'phase=%s\n' "$activation_phase"
    printf 'reason=%s\n' "$failure_reason"
    printf 'exit_code=%s\n' "$failure_code"
    printf 'requested_release=%s\n' "$release_id"
    printf 'active_runtime='
    describe_active_runtime
    printf 'service=%s active=' "$service"
    if systemctl is-active --quiet "$service"; then
      echo 'active'
    else
      echo 'inactive-or-unavailable'
    fi
    echo 'systemctl_status_begin'
    systemctl status "$service" --no-pager --full --lines=12 2>&1 | redact_diagnostics || true
    echo 'systemctl_status_end'
    if command -v journalctl >/dev/null 2>&1; then
      echo 'service_journal_begin'
      journalctl -u "$service" --no-pager --output=short-iso --lines=30 2>&1 | redact_diagnostics || true
      echo 'service_journal_end'
    else
      echo 'service_journal_unavailable'
    fi
    echo 'ACTIVATION_DIAGNOSTICS_END'
  } >&2
}

fail_activation() {
  local failure_code="$1"
  local failure_reason="$2"
  emit_failure_diagnostics "$failure_code" "$failure_reason"
  exit "$failure_code"
}

trap 'failure_code=$?; emit_failure_diagnostics "$failure_code" "unexpected_shell_failure_line_$LINENO"; exit "$failure_code"' ERR

activation_phase="required-command-check"
for command_name in node curl sha256sum sudo systemctl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    fail_activation 1 "required_command_unavailable_$command_name"
  }
done

activation_phase="release-artifact-validation"
test -d "$release_app_path"
test -f "$release_path/release-manifest.json"
test -f "$release_app_path/dist/index.html"
test -f "$release_app_path/package-lock.json"
test -f "$release_app_path/scripts/release-verify.mjs"
release_app_target="$(readlink -f "$release_app_path")"

cd "$release_app_path"
activation_phase="manifest-verification"
manifest_verification="$(node scripts/release-verify.mjs \
  --manifest="$release_path/release-manifest.json" \
  --expected-release-id="$release_id" \
  --json)"
printf '%s\n' "$manifest_verification"
runtime_policy_sha="$(node --input-type=module -e '
  const verification = JSON.parse(process.argv[1]);
  process.stdout.write(String(verification.runtimePolicySha256 || ""));
' "$manifest_verification")"
runtime_policy_has_react="$(node --input-type=module -e '
  const verification = JSON.parse(process.argv[1]);
  process.stdout.write(Array.isArray(verification.reactSurfaces) && verification.reactSurfaces.length ? "true" : "false");
' "$manifest_verification")"

activation_phase="active-runtime-inspection"
if [ -L "$app_path" ]; then
  previous_kind="release-pointer"
  previous_target="$(readlink -f "$app_path")"
  test -d "$previous_target"
elif [ -d "$app_path" ]; then
  previous_kind="legacy-directory"
  previous_target="$app_path"
else
  echo "Active application path is neither a directory nor a release pointer: $app_path" >&2
  fail_activation 1 "active_runtime_unavailable"
fi

previous_release_id=""
previous_manifest_verification='{}'
if [ "$previous_kind" = "release-pointer" ]; then
  previous_release_path="$(dirname "$previous_target")"
  previous_release_id="$(basename "$previous_release_path")"
  test -f "$previous_release_path/release-manifest.json"
  test -f "$previous_target/scripts/release-verify.mjs"
  previous_manifest_verification="$(cd "$previous_target" && node scripts/release-verify.mjs \
    --manifest="$previous_release_path/release-manifest.json" \
    --expected-release-id="$previous_release_id" \
    --json)"
fi

if [ "$previous_kind" = "release-pointer" ] && [ "$previous_target" = "$release_app_target" ]; then
  echo "Requested release is already active." >&2
  fail_activation 1 "release_already_active"
fi

assert_no_active_evaluation() {
  local dropin_dir="/etc/systemd/system/"$service".d"
  local main_pid=""
  if [ -d "$dropin_dir" ] && find "$dropin_dir" -maxdepth 1 \( -type f -o -type l \) -name '*-evaluation.conf' -print -quit | grep -q .; then
    echo "Permanent React activation is blocked while an evaluation drop-in is present." >&2
    return 1
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] && [ -r "/proc/$main_pid/environ" ] \
    && tr '\0' '\n' < "/proc/$main_pid/environ" | grep -Eq '^MES_REACT_[A-Z0-9_]*EVALUATION=1$'; then
    echo "Permanent React activation is blocked while an evaluation permission is active." >&2
    return 1
  fi
}

activation_phase="legacy-baseline-preflight"
if [ "$runtime_policy_has_react" = "true" ] || [ "$pin_legacy_baseline" = "true" ]; then
  assert_no_active_evaluation || fail_activation 1 "active_react_evaluation"
  node --input-type=module - \
    "$releases_path/active-release.json" \
    "$releases_path" \
    "$previous_kind" \
    "$previous_target" \
    "$previous_release_id" \
    "$previous_manifest_verification" \
    "$pin_legacy_baseline" <<'NODE'
import { readFile } from "node:fs/promises";
const [activeRecordPath, releasesPath, previousKind, previousTarget, previousReleaseId, previousVerificationJson, pinRequested] = process.argv.slice(2);
let activeRecord = null;
try { activeRecord = JSON.parse(await readFile(activeRecordPath, "utf8")); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const safeReleaseId = (value) => /^[A-Za-z0-9._-]{1,96}$/.test(String(value || ""));
const assertReleaseTarget = (releaseId, target, label) => {
  if (!safeReleaseId(releaseId) || target !== releasesPath + "/" + releaseId + "/app") throw new Error(label + " release target is unsafe");
};
if (previousKind === "release-pointer") assertReleaseTarget(previousReleaseId, previousTarget, "Current");
if (activeRecord?.releaseId && previousKind === "release-pointer" && activeRecord.releaseId !== previousReleaseId) {
  throw new Error("Active release record does not match the current release pointer");
}
if (activeRecord?.legacyBaseline) {
  const baseline = activeRecord.legacyBaseline;
  if (baseline.kind === "release-pointer") assertReleaseTarget(baseline.releaseId, baseline.target, "Legacy baseline");
  else if (baseline.kind !== "legacy-directory" || !String(baseline.legacyPath || "").startsWith(releasesPath + "/legacy-app-pre-")) throw new Error("Legacy baseline is unsafe");
} else {
  if (pinRequested !== "true") throw new Error("Permanent React activation requires --pin-legacy-baseline on the first cutover");
  if (previousKind !== "release-pointer") throw new Error("Pinning a new legacy baseline requires an immutable current release pointer");
  const previousVerification = JSON.parse(previousVerificationJson);
  if (Array.isArray(previousVerification.reactSurfaces) && previousVerification.reactSurfaces.length) {
    throw new Error("The current release already has permanent React surfaces and cannot become a legacy baseline");
  }
}
NODE
fi

if [ "$dry_run" = "true" ]; then
  activation_phase="dry-run-runtime-inspection"
  printf 'DRY_RUN current_kind=%s current_target=%s next=%s policy_sha=%s pin_legacy_baseline=%s\n' \
    "$previous_kind" "$previous_target" "$release_app_path" "$runtime_policy_sha" "$pin_legacy_baseline"
  exit 0
fi

rollback() {
  trap - ERR
  set +e
  echo "Activation failed after the runtime switch; restoring previous runtime." >&2
  if [ "$previous_kind" = "release-pointer" ]; then
    if [ -L "$app_path" ]; then
      mv -T "$app_path" "$failed_pointer_path"
    fi
    ln -s "$previous_target" "$app_path.rollback"
    mv -Tf "$app_path.rollback" "$app_path"
  else
    if [ -L "$app_path" ]; then
      mv -T "$app_path" "$failed_pointer_path"
    fi
    if [ -n "$legacy_path" ] && [ -d "$legacy_path/app" ]; then
      mv "$legacy_path/app" "$app_path"
    fi
  fi
  if [ "$activation_record_had_previous" = "1" ] && [ -e "$activation_record_backup_path" ]; then
    mv -f "$activation_record_backup_path" "$activation_record_path"
  elif [ "$activation_record_replaced" = "1" ]; then
    rm -f "$activation_record_path"
  fi
  rm -f "$releases_path/active-release.json.next" "$release_path/activation.json.next"
  sudo -n /usr/bin/systemctl restart "$service" >/dev/null 2>&1 || true
  runtime_switched=0
}

trap 'failure_code=$?; emit_failure_diagnostics "$failure_code" "unexpected_shell_failure_line_$LINENO"; if [ "$runtime_switched" = "1" ]; then rollback; fi; exit "$failure_code"' ERR

activation_phase="switch-active-runtime"
if [ "$previous_kind" = "release-pointer" ]; then
  ln -s "$release_app_path" "$app_path.next"
  if ! mv -Tf "$app_path.next" "$app_path"; then
    echo "Unable to switch the active release pointer." >&2
    fail_activation 1 "active_pointer_switch_failed"
  fi
  runtime_switched=1
else
  legacy_path="$releases_path/legacy-app-pre-$timestamp"
  mkdir -p "$legacy_path"
  ln -s "$release_app_path" "$app_path.next"
  if ! mv "$app_path" "$legacy_path/app"; then
    echo "Unable to preserve the current legacy runtime." >&2
    fail_activation 1 "legacy_runtime_preservation_failed"
  fi
  if ! mv -Tf "$app_path.next" "$app_path"; then
    mv "$legacy_path/app" "$app_path" || true
    echo "Unable to create the active release pointer; the legacy runtime was restored." >&2
    fail_activation 1 "active_pointer_creation_failed"
  fi
  runtime_switched=1
fi

activation_phase="restart-service"
if ! sudo -n /usr/bin/systemctl restart "$service"; then
  emit_failure_diagnostics 1 "service_restart_failed"
  rollback
  exit 1
fi

check_health() {
  local health_url="$1"
  local expected_policy_sha="$2"
  local attempt health_code
  for attempt in $(seq 1 12); do
    if systemctl is-active --quiet "$service"; then
      health_code="$(curl -sS --max-time 10 -o "$health_body_path" -w '%{http_code}' "$health_url" || true)"
      if [ "$health_code" = "200" ] \
        && node --input-type=module -e '
          import { readFile } from "node:fs/promises";
          const health = JSON.parse(await readFile(process.argv[1], "utf8"));
          if (health?.status !== "ok" || health?.sharedState !== "ready") process.exit(1);
          const expectedPolicySha = String(process.argv[2] || "");
          if (expectedPolicySha && health?.reactRuntime?.sha256 !== expectedPolicySha) process.exit(1);
          if (Array.isArray(health?.reactRuntime?.activeEvaluationSurfaces) && health.reactRuntime.activeEvaluationSurfaces.length) process.exit(1);
        ' "$health_body_path" "$expected_policy_sha"; then
        return 0
      fi
    fi
    sleep "$attempt"
  done
  return 1
}

activation_phase="local-healthcheck"
if ! check_health "http://localhost:$port/healthz" "$runtime_policy_sha"; then
  emit_failure_diagnostics 1 "local_healthcheck_failed"
  rollback
  exit 1
fi

activation_phase="public-healthcheck"
if ! check_health "$public_health_url" "$runtime_policy_sha"; then
  emit_failure_diagnostics 1 "public_healthcheck_failed"
  rollback
  exit 1
fi

activation_phase="record-activation"
node --input-type=module - \
  "$releases_path/active-release.json.next" \
  "$release_path/activation.json.next" \
  "$releases_path/active-release.json" \
  "$release_path/release-manifest.json" \
  "$release_id" \
  "$previous_kind" \
  "$previous_target" \
  "$previous_release_id" \
  "$previous_manifest_verification" \
  "$legacy_path" \
  "$timestamp" \
  "$manifest_verification" \
  "$pin_legacy_baseline" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
const [
  activePath,
  activationPath,
  priorActivePath,
  manifestPath,
  releaseId,
  previousKind,
  previousTarget,
  previousReleaseId,
  previousVerificationJson,
  legacyPath,
  activatedAt,
  verificationJson,
  pinLegacyBaseline,
] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let priorActive = null;
try { priorActive = JSON.parse(await readFile(priorActivePath, "utf8")); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const verification = JSON.parse(verificationJson);
const previousVerification = JSON.parse(previousVerificationJson);
const runtimePolicyFromVerification = (value) => ({
  schemaVersion: 1,
  policyId: String(value?.runtimePolicyId || "implicit-legacy"),
  sha256: value?.runtimePolicySha256 || null,
  reactSurfaces: Array.isArray(value?.reactSurfaces) ? value.reactSurfaces : [],
});
const manifestSummary = (value) => value ? ({
  gitCommit: value.gitCommit,
  appVersion: value.appVersion,
  sourceTreeSha256: value.sourceTreeSha256,
  distTreeSha256: value.distTreeSha256,
  runtimePolicySha256: value.runtimePolicy?.sha256 || null,
}) : null;
let previousManifest = null;
if (previousKind === "release-pointer") {
  previousManifest = JSON.parse(await readFile(previousTarget.slice(0, -4) + "/release-manifest.json", "utf8"));
}
const previousRuntimePolicy = priorActive?.runtimePolicy || runtimePolicyFromVerification(previousVerification);
const previous = {
  kind: previousKind,
  releaseId: previousReleaseId || null,
  target: previousTarget,
  legacyPath: legacyPath || null,
  runtimePolicy: previousRuntimePolicy,
};
let legacyBaseline = priorActive?.legacyBaseline || null;
if (!legacyBaseline && pinLegacyBaseline === "true") {
  legacyBaseline = {
    schemaVersion: 1,
    kind: previousKind,
    releaseId: previousReleaseId || null,
    target: previousKind === "release-pointer" ? previousTarget : null,
    legacyPath: previousKind === "legacy-directory" ? legacyPath : null,
    pinnedAt: activatedAt,
    manifest: manifestSummary(previousManifest),
    runtimePolicy: previousRuntimePolicy,
  };
}
const record = {
  schemaVersion: 2,
  releaseId,
  activatedAt,
  previous,
  legacyBaseline,
  runtimePolicy: runtimePolicyFromVerification(verification),
  manifest: manifestSummary(manifest),
  health: { local: "ok", public: "ok" },
};
await writeFile(activePath, JSON.stringify(record, null, 2) + "\n");
await writeFile(activationPath, JSON.stringify(record, null, 2) + "\n");
NODE
if [ -e "$activation_record_path" ] || [ -L "$activation_record_path" ]; then
  activation_record_had_previous=1
  mv -f "$activation_record_path" "$activation_record_backup_path"
fi
mv -f "$release_path/activation.json.next" "$activation_record_path"
activation_record_replaced=1
mv -f "$releases_path/active-release.json.next" "$releases_path/active-release.json"
runtime_switched=0
rm -f "$activation_record_backup_path"

printf 'ACTIVATED release=%s previous_kind=%s previous_target=%s\n' "$release_id" "$previous_kind" "$previous_target"
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);
  const releaseId = safeReleaseId(args.releaseId);
  const releasePath = `${contour.releasesPath}/${releaseId}`;
  const releaseAppPath = `${releasePath}/app`;
  const startedAt = performance.now();

  console.log(`MES release activation${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- release: ${releaseId}`);
  console.log(`- candidate: ${releaseAppPath}`);

  const result = await run(
    "ssh",
    remoteBashArgs(args.remote, [
      contour.appPath,
      contour.releasesPath,
      releasePath,
      releaseAppPath,
      releaseId,
      contour.service,
      contour.port,
      `${contour.url}/healthz`,
      String(args.dryRun),
      String(args.pinLegacyBaseline),
    ]),
    { input: activationScript },
  );
  if (result.stdout.trim()) console.log(result.stdout.trim());
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result?.stdout) console.error(error.result.stdout.trim());
  if (error.result?.stderr) console.error(error.result.stderr.trim());
  process.exit(1);
});
