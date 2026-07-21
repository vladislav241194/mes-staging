#!/usr/bin/env node
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];
const FIXED_ROOT_ACTIVATE_RUNNER = "/usr/local/libexec/mes/active-bundle/release-activate-root.mjs";
const FIXED_ROOT_SEAL_HELPER = "/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs";
const FIXED_PUBLIC_RELEASE_VERIFIER = "/usr/local/libexec/mes/active-bundle/release-verify.mjs";
const FIXED_ROOT_SWITCH_JOURNAL_HELPER = "/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs";
const FIXED_ROOT_AUTHORITY_WRAPPER = "/usr/local/libexec/mes/active-bundle/with-pilot-release-authority-lock.sh";

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
  const args = { contour: "pilot", remote: "mes-line-root", releaseId: "", dryRun: false, pinLegacyBaseline: false, rootLocal: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "release-id") args.releaseId = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else if (key === "pin-legacy-baseline") args.pinLegacyBaseline = true;
    else if (key === "root-local") args.rootLocal = true;
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

async function assertFixedRootRunner(expectedPath) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    throw new Error("Fixed release activation runner requires uid 0");
  }
  if (await realpath(process.argv[1]) !== await realpath(expectedPath)) {
    throw new Error(`Release activation root-local mode must execute ${expectedPath}`);
  }
  await run("/usr/bin/node", [FIXED_ROOT_SEAL_HELPER, "bundle"]);
}

function fixedRootRunnerCommand(path, args) {
  return `/usr/bin/node ${shellQuote(path)} ${args.map(shellQuote).join(" ")}`;
}

const activationScript = String.raw`#!/usr/bin/env bash
set -euo pipefail
umask 022

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
rollback_pointer_path="$app_path.rollback-$timestamp"
health_body_path="$release_path/activation-health-$timestamp.json"
bootstrap_body_path="$release_path/activation-bootstrap-$timestamp.json"
activation_record_path="$release_path/activation.json"
activation_record_backup_path="$release_path/activation.json.before-$timestamp"
activation_phase="initializing"
diagnostics_emitted=0
runtime_switched=0
activation_record_had_previous=0
activation_record_replaced=0
authority_lock_parent="/run/lock/mes"
authority_lock_file="$authority_lock_parent/mes-authority-rollout.lock"
authority_intent_file="$authority_lock_parent/mes-release-operation.intent"
authority_app_intent_file="$authority_lock_parent/mes-release-app-verification.intent"
authority_lock_held=0
target_specifications2_command_compatible=0
previous_specifications2_command_compatible=0
target_nomenclature_command_compatible=0
previous_nomenclature_command_compatible=0
target_system_domains_command_compatible=0
previous_system_domains_command_compatible=0
target_shift_execution_command_compatible=0
previous_shift_execution_command_compatible=0
target_directory_cluster_command_compatible=0
previous_directory_cluster_command_compatible=0
switch_operation="activation"
root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
public_release_verifier="/usr/local/libexec/mes/active-bundle/release-verify.mjs"
journal_helper="/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs"

if [ "$(id -u)" -ne 0 ]; then
  echo "Release activation must run through the approved root SSH boundary." >&2
  exit 1
fi

release_authority_lock() {
  rm -f -- "$authority_app_intent_file"
}
trap release_authority_lock EXIT

write_release_app_verification_intent() {
  [ "$contour_name" = "pilot" ] || return 0
  local operation="$1" expected_target="$2" journal_kind="$3" journal_id="$4" journal_phase="$5"
  local start_ticks intent_next
  start_ticks="$(awk '{print $22}' "/proc/$$/stat")"
  intent_next="$authority_app_intent_file.next.$$"
  {
    printf 'PID=%s\n' "$$"
    printf 'START_TICKS=%s\n' "$start_ticks"
    printf 'INTENT=release-app-verification\n'
    printf 'OPERATION=%s\n' "$operation"
    printf 'EXPECTED_TARGET=%s\n' "$expected_target"
    printf 'JOURNAL_KIND=%s\n' "$journal_kind"
    printf 'JOURNAL_ID=%s\n' "$journal_id"
    printf 'JOURNAL_PHASE=%s\n' "$journal_phase"
  } > "$intent_next"
  chown root:root "$intent_next"
  chmod 0600 "$intent_next"
  sync -f "$intent_next"
  mv -Tf "$intent_next" "$authority_app_intent_file"
  sync -f "$authority_lock_parent"
}

verify_pilot_bootstrap_recovery_invariant() {
  [ "$contour_name" = "pilot" ] || { printf '%s' ""; return 0; }
  local current_app="$1" current_manifest="$2" target_app="$3" target_manifest="$4"
  local legacy_app="$5" legacy_manifest="$6"
  local recovery_dir="/srv/mes/pilot/bootstrap-recovery"
  local recovery_path="$recovery_dir/bootstrap-snapshot.json"
  local current_sha target_sha legacy_sha app expected_sha actual_sha
  bootstrap_digest_from_manifest() {
    /usr/bin/node --input-type=module - "$1" <<'NODE'
import { readFile } from "node:fs/promises";
const [manifestPath] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artifacts = manifest?.compatibilityArtifacts;
if (manifest?.schemaVersion !== 3 || !Array.isArray(artifacts) || artifacts.length !== 1) process.exit(76);
const descriptor = artifacts[0];
const expectedKeys = ["generatedPaths", "id", "operationalPath", "sha256", "stagedPaths"];
if (JSON.stringify(Object.keys(descriptor || {}).sort()) !== JSON.stringify(expectedKeys)
  || descriptor.id !== "bootstrap-snapshot"
  || descriptor.operationalPath !== "/srv/mes/pilot/runtime/bootstrap-snapshot.json"
  || !/^[a-f0-9]{64}$/i.test(String(descriptor.sha256 || ""))) process.exit(76);
process.stdout.write(descriptor.sha256);
NODE
  }
  current_sha="$(bootstrap_digest_from_manifest "$current_manifest")" || return 1
  target_sha="$(bootstrap_digest_from_manifest "$target_manifest")" || return 1
  legacy_sha="$(bootstrap_digest_from_manifest "$legacy_manifest")" || return 1
  [ "$current_sha" = "$target_sha" ] && [ "$current_sha" = "$legacy_sha" ] || return 1
  [ -d "$recovery_dir" ] && [ ! -L "$recovery_dir" ] \
    && [ "$(readlink -f -- "$recovery_dir")" = "$recovery_dir" ] \
    && [ "$(stat -Lc '%u:%g:%a' -- "$recovery_dir")" = "0:0:700" ] \
    || return 1
  for app in "$current_app" "$target_app" "$legacy_app"; do
    if [ "$app" = "$current_app" ]; then expected_sha="$current_sha"
    elif [ "$app" = "$target_app" ]; then expected_sha="$target_sha"
    else expected_sha="$legacy_sha"
    fi
    [ -f "$app/bootstrap-snapshot.json" ] && [ ! -L "$app/bootstrap-snapshot.json" ] \
      && [ "$(readlink -f -- "$app/bootstrap-snapshot.json")" = "$app/bootstrap-snapshot.json" ] \
      && [ "$(stat -Lc '%u:%g:%h' -- "$app/bootstrap-snapshot.json")" = "0:0:1" ] \
      || return 1
    actual_sha="$(sha256sum "$app/bootstrap-snapshot.json" | awk '{print $1}')"
    [ "$actual_sha" = "$expected_sha" ] || return 1
  done
  [ -f "$recovery_path" ] && [ ! -L "$recovery_path" ] \
    && [ "$(readlink -f -- "$recovery_path")" = "$recovery_path" ] \
    && [ "$(stat -Lc '%u:%g:%a:%h' -- "$recovery_path")" = "0:0:444:1" ] \
    || return 1
  [ "$(stat -Lc '%u:%g:%a:%h' -- "$recovery_path")" = "0:0:444:1" ] \
    && [ "$(sha256sum "$recovery_path" | awk '{print $1}')" = "$target_sha" ] \
    || return 1
  printf '%s' "$target_sha"
}

clear_release_app_verification_intent() {
  rm -f -- "$authority_app_intent_file"
  sync -f "$authority_lock_parent"
}

assert_no_pilot_runtime_transition_state() {
  [ "$contour_name" = "pilot" ] || return 0
  local path stale_prepare
  for path in /var /var/lib /var/lib/mes; do
    [ -d "$path" ] && [ ! -L "$path" ] \
      && [ "$(readlink -f -- "$path")" = "$path" ] \
      && [ "$(stat -Lc '%u:%g' -- "$path")" = "0:0" ] \
      && ! find "$path" -maxdepth 0 -perm /022 -print -quit | grep -q . \
      || return 1
  done
  for path in \
    /var/lib/mes/pilot-credential-rotation \
    /var/lib/mes/pilot-uid-cutover \
    /run/lock/mes/pilot-runtime-writers-quiesced; do
    [ ! -e "$path" ] && [ ! -L "$path" ] || return 1
  done
  stale_prepare="$(find /var/lib/mes -xdev -mindepth 1 -maxdepth 1 \
    \( -name 'pilot-credential-rotation.prepare.*' -o -name 'pilot-uid-cutover.prepare.*' \) \
    -print -quit)" || return 1
  [ -z "$stale_prepare" ]
}

assert_no_active_evaluation() {
  local systemd_root dropin_dir main_pid evaluation_units
  for systemd_root in /etc/systemd/system /run/systemd/system; do
    dropin_dir="$systemd_root/"$service".d"
    if [ -d "$dropin_dir" ] \
        && find "$dropin_dir" -maxdepth 1 \( -type f -o -type l \) \
          -name '*-evaluation.conf' -print -quit | grep -q .; then
      echo "Release activation is blocked while an evaluation drop-in is present in $systemd_root." >&2
      return 1
    fi
  done
  if [ "$contour_name" = "pilot" ]; then
    evaluation_units="$(systemctl list-units --all --plain --no-legend --no-pager \
      --type=timer --type=service 2>/dev/null \
      | awk '$1 ~ /-evaluation-auto-rollback\.(timer|service)$/ { print $1 }' || true)"
    if [ -n "$evaluation_units" ]; then
      echo "Release activation is blocked while an evaluation auto-rollback unit is loaded." >&2
      printf '%s\n' "$evaluation_units" >&2
      return 1
    fi
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] && [ -r "/proc/$main_pid/environ" ] \
    && tr '\0' '\n' < "/proc/$main_pid/environ" | grep -Eq '^MES_REACT_[A-Z0-9_]*EVALUATION=1$'; then
    echo "Release activation is blocked while an evaluation permission is active." >&2
    return 1
  fi
}

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
for command_name in node curl flock install runuser sha256sum sudo sync systemctl; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    fail_activation 1 "required_command_unavailable_$command_name"
  }
done
[ -x /usr/bin/node ] && [ -f "$root_seal_helper" ] && [ -f "$public_release_verifier" ] || {
  echo "The fixed root-owned release seal verifier is unavailable." >&2
  fail_activation 1 "root_seal_verifier_unavailable"
}

activation_phase="authority-rollout-lock"
[ "\${MES_RELEASE_AUTHORITY_LOCK_HELD:-0}" = "1" \
  ] && [ "\${MES_RELEASE_AUTHORITY_LOCK_FD:-}" = "9" \
  ] && [ -f "$authority_lock_file" ] && [ ! -L "$authority_lock_file" \
  ] && [ -e /proc/$$/fd/9 \
  ] && [ "$(stat -Lc '%d:%i' -- /proc/$$/fd/9 2>/dev/null || true)" = "$(stat -Lc '%d:%i' -- "$authority_lock_file" 2>/dev/null || true)" ] \
  || fail_activation 1 "authority_rollout_lock_not_inherited"
authority_lock_inode="$(stat -Lc '%i' -- "$authority_lock_file")"
awk -v owner_pid="$$" -v lock_inode="$authority_lock_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":");
    if (identity[3] == lock_inode) found = 1;
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || fail_activation 1 "authority_rollout_lock_owner_unproved"
authority_lock_held=1

case "$app_path:$releases_path:$service" in
  /srv/mes/pilot/app:/srv/mes/pilot/releases:mes-pilot.service) contour_name="pilot" ;;
  /srv/mes/dev/app:/srv/mes/dev/releases:mes-dev.service) contour_name="staging" ;;
  *) fail_activation 1 "release_switch_contour_untrusted" ;;
esac
assert_no_pilot_runtime_transition_state \
  || fail_activation 1 "pilot_runtime_transition_recovery_pending"
assert_no_active_evaluation \
  || fail_activation 1 "active_react_evaluation"
/usr/bin/node "$root_seal_helper" artifact \
  --trusted-root="/usr/local/libexec/mes" --artifact="$journal_helper" >/dev/null \
  || fail_activation 1 "release_switch_journal_helper_untrusted"
activation_phase="recover-incomplete-switch"
/usr/bin/node "$journal_helper" recover --contour="$contour_name" >/dev/null \
  || fail_activation 1 "incomplete_release_switch_recovery_failed"

activation_phase="release-artifact-validation"
/usr/bin/node "$root_seal_helper" release \
  --releases-root="$releases_path" --release-id="$release_id" \
  --app="$release_app_path" >/dev/null \
  || fail_activation 1 "candidate_release_root_seal_invalid"
test -d "$release_app_path"
test -f "$release_path/release-manifest.json"
test -f "$release_app_path/dist/index.html"
test -f "$release_app_path/package-lock.json"
release_app_target="$(readlink -f "$release_app_path")"

activation_phase="active-runtime-inspection"
previous_release_id=""
previous_release_path=""
if [ -L "$app_path" ]; then
  previous_kind="release-pointer"
  previous_target="$(readlink -f "$app_path")"
  test -d "$previous_target"
  previous_release_path="$(dirname "$previous_target")"
  previous_release_id="$(basename "$previous_release_path")"
  /usr/bin/node "$root_seal_helper" release \
    --releases-root="$releases_path" --release-id="$previous_release_id" \
    --app="$previous_target" >/dev/null \
    || fail_activation 1 "active_release_root_seal_invalid"
  /usr/bin/node "$root_seal_helper" pointer \
    --pointer="$app_path" --expected-target="$previous_target" >/dev/null \
    || fail_activation 1 "active_release_pointer_root_seal_invalid"
elif [ -d "$app_path" ]; then
  echo "Unmanifested legacy directories are not eligible for release activation because new-inode origin cannot be attested." >&2
  echo "Use the pinned, root-reinoded and attested immutable legacy release pointer instead." >&2
  fail_activation 1 "unattested_legacy_directory_ineligible"
else
  echo "Active application path is neither a directory nor a release pointer: $app_path" >&2
  fail_activation 1 "active_runtime_unavailable"
fi

previous_manifest_verification='{}'
run_fixed_public_verifier() {
  runuser -u mes-stage -- /usr/bin/env \
    HOME=/nonexistent \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /usr/bin/node "$public_release_verifier" "$@"
}
if [ "$previous_kind" = "release-pointer" ]; then
  [ "$previous_target" = "$releases_path/$previous_release_id/app" ] \
    || fail_activation 1 "active_release_pointer_outside_release_store"
  test -f "$previous_release_path/release-manifest.json"
  previous_manifest_verification="$(run_fixed_public_verifier \
    --app-root="$previous_target" \
    --manifest="$previous_release_path/release-manifest.json" \
    --expected-release-id="$previous_release_id" \
    --json --public-only)"
fi

activation_phase="active-record-pointer-consistency"
if [ "$previous_kind" = "release-pointer" ]; then
  /usr/bin/node "$root_seal_helper" artifact \
    --trusted-root="$releases_path" --artifact="$releases_path/active-release.json" >/dev/null \
    || fail_activation 1 "active_release_record_root_seal_invalid"
  node --input-type=module - \
    "$releases_path/active-release.json" \
    "$previous_release_id" <<'NODE'
import { readFile } from "node:fs/promises";
const [activeRecordPath, previousReleaseId] = process.argv.slice(2);
const activeRecord = JSON.parse(await readFile(activeRecordPath, "utf8"));
if (activeRecord?.releaseId !== previousReleaseId) {
  throw new Error("Active release record does not match the current release pointer");
}
NODE
fi

if [ "$previous_kind" = "release-pointer" ] && [ "$previous_target" = "$release_app_target" ]; then
  echo "Requested release is already active." >&2
  fail_activation 1 "release_already_active"
fi

# Both the candidate and the currently serving runtime have now been proved
# recursively root-sealed by the fixed out-of-band verifier. Candidate code is
# not executed before that complete two-sided trust boundary.
cd "$release_app_path"
activation_phase="manifest-verification"
manifest_verification="$(run_fixed_public_verifier \
  --app-root="$release_app_path" \
  --manifest="$release_path/release-manifest.json" \
  --expected-release-id="$release_id" \
  --json --public-only)"
printf '%s\n' "$manifest_verification"
runtime_policy_sha="$(node --input-type=module -e '
  const verification = JSON.parse(process.argv[1]);
  process.stdout.write(String(verification.runtimePolicySha256 || ""));
' "$manifest_verification")"
release_app_version="$(node --input-type=module -e '
  const verification = JSON.parse(process.argv[1]);
  process.stdout.write(String(verification.appVersion || ""));
' "$manifest_verification")"
[ -n "$release_app_version" ] || fail_activation 1 "candidate_release_version_missing"
runtime_policy_has_react="$(node --input-type=module -e '
  const verification = JSON.parse(process.argv[1]);
  process.stdout.write(Array.isArray(verification.reactSurfaces) && verification.reactSurfaces.length ? "true" : "false");
' "$manifest_verification")"

activation_phase="legacy-baseline-preflight"
if [ "$runtime_policy_has_react" = "true" ] || [ "$pin_legacy_baseline" = "true" ]; then
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

verified_release_pointer_has_v6_specifications2_command_compatibility() {
  local marker="$1/ops/postgres/specifications2-server-command-compatibility.json"
  local manifest="$2"
  [ -f "$marker" ] && [ -f "$manifest" ] && node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFile } from "node:fs/promises";
    const markerSource = await readFile(process.argv[1], "utf8");
    const marker = JSON.parse(markerSource);
    const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
    const required = [
      "019_specifications2_attachment_blobs",
      "028_specifications2_publication_idempotency",
      "029_specifications2_revision_identity_backfill",
      "030_specifications2_legacy_revision_identity_guard",
      "031_specifications2_guard_function_repair",
    ];
    if (manifest?.schemaVersion < 3
      || !Array.isArray(manifest?.runtimeIncludes)
      || !manifest.runtimeIncludes.includes("ops")
      || marker?.schemaVersion !== 1
      || marker?.contract !== "specifications2-server-commands"
      || marker?.publicationFingerprintAdapterVersion !== 6
      || marker?.workOrderRevisionIdentityVersion !== 1
      || marker?.workOrderRequestFingerprintVersion !== 1
      || marker?.workOrderAggregateIdentityVersion !== 1
      || marker?.attachmentCommandVersion !== 1
      || marker?.authenticatedActorVersion !== 1
      || marker?.rbacAuthorizationVersion !== 1
      || marker?.requestSecurityVersion !== 1
      || marker?.outboxEnvelopeVersion !== 1
      || marker?.controlledRootExclusivity?.required !== true
      || marker?.controlledRootExclusivity?.lockName !== "mes-authority-rollout.lock"
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify([
        "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS",
        "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS",
        "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS",
      ])
      || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(required)) process.exit(1);
    const expected = {
      schemaVersion: 1,
      path: "ops/postgres/specifications2-server-command-compatibility.json",
      sha256: createHash("sha256").update(markerSource).digest("hex"),
      contract: marker.contract,
      controlledRootExclusivity: marker.controlledRootExclusivity,
    };
    if (JSON.stringify(manifest?.specifications2CommandCompatibility) !== JSON.stringify(expected)) process.exit(1);
  ' "$marker" "$manifest"
}

verified_release_pointer_has_nomenclature_command_compatibility() {
  local marker="$1/ops/auth/nomenclature-server-command-compatibility.json"
  local manifest="$2"
  [ -f "$marker" ] && [ -f "$manifest" ] && node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFile } from "node:fs/promises";
    const markerSource = await readFile(process.argv[1], "utf8");
    const marker = JSON.parse(markerSource);
    const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
    const required = ["027_employee_auth_credentials"];
    if (manifest?.schemaVersion < 3
      || !Array.isArray(manifest?.runtimeIncludes)
      || !manifest.runtimeIncludes.includes("ops")
      || marker?.schemaVersion !== 1
      || marker?.contract !== "nomenclature-server-commands"
      || marker?.authorityTransitionVersion !== 1
      || marker?.revisionConcurrencyVersion !== 1
      || marker?.idempotencyReceiptVersion !== 1
      || marker?.authenticatedRbacVersion !== 1
      || marker?.controlledRootExclusivity?.required !== true
      || marker?.controlledRootExclusivity?.lockName !== "mes-authority-rollout.lock"
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify([
        "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS",
      ])
      || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(required)) process.exit(1);
    const expected = {
      schemaVersion: 1,
      path: "ops/auth/nomenclature-server-command-compatibility.json",
      sha256: createHash("sha256").update(markerSource).digest("hex"),
      contract: marker.contract,
      controlledRootExclusivity: marker.controlledRootExclusivity,
    };
    if (JSON.stringify(manifest?.nomenclatureCommandCompatibility) !== JSON.stringify(expected)) process.exit(1);
  ' "$marker" "$manifest"
}

verified_release_pointer_has_system_domains_command_compatibility() {
  local marker="$1/ops/postgres/system-domains-server-command-compatibility.json"
  local manifest="$2"
  [ -f "$marker" ] && [ -f "$manifest" ] && node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFile } from "node:fs/promises";
    const markerSource = await readFile(process.argv[1], "utf8");
    const marker = JSON.parse(markerSource);
    const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
    const surfaces = ["production-structure", "timesheet", "access-control"];
    const required = [
      "011_system_domains_core",
      "012_system_domains_metadata_parity",
      "013_system_domains_command_idempotency",
      "023_system_domains_postgres_primary_authority",
      "026_system_responsibility_policy_lifecycle",
    ];
    if (manifest?.schemaVersion < 3
      || !Array.isArray(manifest?.runtimeIncludes)
      || !manifest.runtimeIncludes.includes("ops")
      || marker?.schemaVersion !== 1
      || marker?.contract !== "system-domains-server-commands"
      || marker?.commandSurfaceVersion !== 1
      || marker?.actorPolicyVersion !== 1
      || marker?.authorizationSnapshotVersion !== 1
      || marker?.authorityTransitionVersion !== 1
      || JSON.stringify(marker?.supportedSurfaces) !== JSON.stringify(surfaces)
      || marker?.controlledRootExclusivity?.required !== true
      || marker?.controlledRootExclusivity?.lockName !== "mes-authority-rollout.lock"
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify([
        "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS",
      ])
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresEmptyValues) !== JSON.stringify([
        "MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES",
      ])
      || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(required)) process.exit(1);
    const expected = {
      schemaVersion: 1,
      path: "ops/postgres/system-domains-server-command-compatibility.json",
      sha256: createHash("sha256").update(markerSource).digest("hex"),
      contract: marker.contract,
      supportedSurfaces: marker.supportedSurfaces,
      controlledRootExclusivity: marker.controlledRootExclusivity,
    };
    if (JSON.stringify(manifest?.systemDomainsCommandCompatibility) !== JSON.stringify(expected)) process.exit(1);
  ' "$marker" "$manifest"
}

verified_release_pointer_has_shift_execution_command_compatibility() {
  local marker="$1/ops/postgres/shift-execution-server-command-compatibility.json"
  local manifest="$2"
  [ -f "$marker" ] && [ -f "$manifest" ] && node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFile } from "node:fs/promises";
    const markerSource = await readFile(process.argv[1], "utf8");
    const marker = JSON.parse(markerSource);
    const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
    const required = [
      "008_shift_execution_read_model",
      "014_shift_execution_command_idempotency",
      "015_shift_execution_assignment_revisions",
      "016_shift_execution_fact_idempotency",
      "017_shift_execution_carryover_idempotency",
      "022_shift_execution_carryover_lifecycle",
      "025_shift_execution_postgres_authority",
    ];
    if (manifest?.schemaVersion < 3
      || !Array.isArray(manifest?.runtimeIncludes)
      || !manifest.runtimeIncludes.includes("ops")
      || marker?.schemaVersion !== 1
      || marker?.contract !== "shift-execution-server-commands"
      || marker?.commandSurfaceVersion !== 2
      || marker?.authenticatedActorVersion !== 2
      || marker?.revisionConcurrencyVersion !== 1
      || marker?.idempotencyReceiptVersion !== 1
      || marker?.authorityTransitionVersion !== 1
      || marker?.controlledRootExclusivity?.required !== true
      || marker?.controlledRootExclusivity?.lockName !== "mes-authority-rollout.lock"
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify([
        "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS",
      ])
      || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify(required)) process.exit(1);
    const expected = {
      schemaVersion: 1,
      path: "ops/postgres/shift-execution-server-command-compatibility.json",
      sha256: createHash("sha256").update(markerSource).digest("hex"),
      contract: marker.contract,
      controlledRootExclusivity: marker.controlledRootExclusivity,
    };
    if (JSON.stringify(manifest?.shiftExecutionCommandCompatibility) !== JSON.stringify(expected)) process.exit(1);
  ' "$marker" "$manifest"
}

verified_release_pointer_has_directory_cluster_command_compatibility() {
  local marker="$1/ops/shared-state/directory-cluster-server-command-compatibility.json"
  local manifest="$2"
  [ -f "$marker" ] && [ -f "$manifest" ] && node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFile } from "node:fs/promises";
    const markerSource = await readFile(process.argv[1], "utf8");
    const marker = JSON.parse(markerSource);
    const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
    const surfaces = ["nomenclature-types", "boards"];
    if (manifest?.schemaVersion < 3
      || !Array.isArray(manifest?.runtimeIncludes)
      || !manifest.runtimeIncludes.includes("ops")
      || marker?.schemaVersion !== 1
      || marker?.contract !== "directory-cluster-server-commands"
      || marker?.commandSurfaceVersion !== 1
      || marker?.authenticatedActorVersion !== 1
      || marker?.authorizationSnapshotVersion !== 1
      || marker?.concurrencyVersion !== 1
      || marker?.idempotencyReceiptVersion !== 1
      || marker?.destructiveRecoveryVersion !== 1
      || JSON.stringify(marker?.supportedSurfaces) !== JSON.stringify(surfaces)
      || marker?.storageAuthority !== "shared-state-file"
      || marker?.controlledRootExclusivity?.required !== true
      || marker?.controlledRootExclusivity?.lockName !== "mes-authority-rollout.lock"
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify([
        "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS",
      ])
      || JSON.stringify(marker?.requiredMigrations) !== JSON.stringify([])) process.exit(1);
    const expected = {
      schemaVersion: 1,
      path: "ops/shared-state/directory-cluster-server-command-compatibility.json",
      sha256: createHash("sha256").update(markerSource).digest("hex"),
      contract: marker.contract,
      supportedSurfaces: marker.supportedSurfaces,
      storageAuthority: marker.storageAuthority,
      controlledRootExclusivity: marker.controlledRootExclusivity,
    };
    if (JSON.stringify(manifest?.directoryClusterCommandCompatibility) !== JSON.stringify(expected)) process.exit(1);
  ' "$marker" "$manifest"
}

target_has_v6_specifications2_command_compatibility() {
  verified_release_pointer_has_v6_specifications2_command_compatibility \
    "$release_app_path" "$release_path/release-manifest.json"
}

previous_has_v6_specifications2_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_v6_specifications2_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

target_has_nomenclature_command_compatibility() {
  verified_release_pointer_has_nomenclature_command_compatibility \
    "$release_app_path" "$release_path/release-manifest.json"
}

previous_has_nomenclature_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_nomenclature_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

target_has_system_domains_command_compatibility() {
  verified_release_pointer_has_system_domains_command_compatibility \
    "$release_app_path" "$release_path/release-manifest.json"
}

previous_has_system_domains_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_system_domains_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

target_has_shift_execution_command_compatibility() {
  verified_release_pointer_has_shift_execution_command_compatibility \
    "$release_app_path" "$release_path/release-manifest.json"
}

previous_has_shift_execution_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_shift_execution_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

target_has_directory_cluster_command_compatibility() {
  verified_release_pointer_has_directory_cluster_command_compatibility \
    "$release_app_path" "$release_path/release-manifest.json"
}

previous_has_directory_cluster_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_directory_cluster_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

# SPECIFICATIONS2_RELEASE_SWITCH_GUARD_BEGIN
assert_legacy_incompatible_specifications2_commands_disabled() {
  local systemd_root proc_root dropin_dir configured_dropins main_pid process_environment process_environment_values
  systemd_root="$(printenv MES_RELEASE_GUARD_SYSTEMD_ROOT 2>/dev/null || true)"
  proc_root="$(printenv MES_RELEASE_GUARD_PROC_ROOT 2>/dev/null || true)"
  [ -n "$systemd_root" ] || systemd_root="/etc/systemd/system"
  [ -n "$proc_root" ] || proc_root="/proc"
  dropin_dir="$systemd_root/"$service".d"
  configured_dropins="$(grep -RIl -E 'MES_ENABLE_SPECIFICATIONS2_(SERVER_(COMMANDS|PUBLISH_COMMANDS)|ATTACHMENT_COMMANDS)=1' "$dropin_dir" 2>/dev/null || true)"
  if [ -n "$configured_dropins" ]; then
    echo "Release $switch_operation is blocked while a legacy-incompatible Specifications 2.0 command is configured ON." >&2
    printf '%s\n' "$configured_dropins" >&2
    echo "Deactivate Work Orders and publication with the active release's root-owned scripts, prove both commands enabled=false, then retry the release switch." >&2
    return 1
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if ! [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be proved Specifications 2.0 command-OFF (invalid MainPID)." >&2
    return 1
  fi
  process_environment="$proc_root/$main_pid/environ"
  if [ ! -r "$process_environment" ]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be read to prove Specifications 2.0 command-OFF." >&2
    return 1
  fi
  if ! process_environment_values="$(tr '\0' '\n' < "$process_environment")"; then
    echo "Release $switch_operation is blocked: the running service environment changed while proving Specifications 2.0 command-OFF." >&2
    return 1
  fi
  if printf '%s\n' "$process_environment_values" \
      | grep -Eq '^MES_ENABLE_SPECIFICATIONS2_(SERVER_(COMMANDS|PUBLISH_COMMANDS)|ATTACHMENT_COMMANDS)=1$'; then
    echo "Release $switch_operation is blocked while the running service still has a legacy-incompatible Specifications 2.0 command ON." >&2
    echo "Deactivate Work Orders and publication and prove both commands enabled=false before retrying the release switch." >&2
    return 1
  fi
}
# SPECIFICATIONS2_RELEASE_SWITCH_GUARD_END

# NOMENCLATURE_RELEASE_SWITCH_GUARD_BEGIN
assert_legacy_incompatible_nomenclature_commands_disabled() {
  local systemd_root proc_root dropin_dir configured_dropins main_pid process_environment process_environment_values
  systemd_root="$(printenv MES_RELEASE_GUARD_SYSTEMD_ROOT 2>/dev/null || true)"
  proc_root="$(printenv MES_RELEASE_GUARD_PROC_ROOT 2>/dev/null || true)"
  [ -n "$systemd_root" ] || systemd_root="/etc/systemd/system"
  [ -n "$proc_root" ] || proc_root="/proc"
  dropin_dir="$systemd_root/"$service".d"
  configured_dropins="$(grep -RIl -E 'MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1' "$dropin_dir" 2>/dev/null || true)"
  if [ -n "$configured_dropins" ]; then
    echo "Release $switch_operation is blocked while a legacy-incompatible Nomenclature command owner is configured ON." >&2
    printf '%s\n' "$configured_dropins" >&2
    echo "Deactivate the Nomenclature command owner with the active release's root-owned script, prove enabled=false, then retry the release switch." >&2
    return 1
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if ! [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be proved Nomenclature command-OFF (invalid MainPID)." >&2
    return 1
  fi
  process_environment="$proc_root/$main_pid/environ"
  if [ ! -r "$process_environment" ]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be read to prove Nomenclature command-OFF." >&2
    return 1
  fi
  if ! process_environment_values="$(tr '\0' '\n' < "$process_environment")"; then
    echo "Release $switch_operation is blocked: the running service environment changed while proving Nomenclature command-OFF." >&2
    return 1
  fi
  if printf '%s\n' "$process_environment_values" | grep -Eq '^MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1$'; then
    echo "Release $switch_operation is blocked while the running service still has a legacy-incompatible Nomenclature command owner ON." >&2
    echo "Deactivate the Nomenclature command owner and prove enabled=false before retrying the release switch." >&2
    return 1
  fi
}
# NOMENCLATURE_RELEASE_SWITCH_GUARD_END

# SYSTEM_DOMAINS_RELEASE_SWITCH_GUARD_BEGIN
assert_legacy_incompatible_system_domains_commands_disabled() {
  local systemd_root proc_root dropin_dir configured_dropins main_pid process_environment process_environment_values
  systemd_root="$(printenv MES_RELEASE_GUARD_SYSTEMD_ROOT 2>/dev/null || true)"
  proc_root="$(printenv MES_RELEASE_GUARD_PROC_ROOT 2>/dev/null || true)"
  [ -n "$systemd_root" ] || systemd_root="/etc/systemd/system"
  [ -n "$proc_root" ] || proc_root="/proc"
  dropin_dir="$systemd_root/"$service".d"
  configured_dropins="$(grep -RIl -E 'MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1|MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=[^\"[:space:]]+' "$dropin_dir" 2>/dev/null || true)"
  if [ -n "$configured_dropins" ]; then
    echo "Release $switch_operation is blocked while a legacy-incompatible System Domains command surface is configured ON." >&2
    printf '%s\n' "$configured_dropins" >&2
    echo "Deactivate every System Domains command surface with the active release's root-owned script, prove the surface list empty, then retry." >&2
    return 1
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if ! [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be proved System Domains command-OFF (invalid MainPID)." >&2
    return 1
  fi
  process_environment="$proc_root/$main_pid/environ"
  if [ ! -r "$process_environment" ]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be read to prove System Domains command-OFF." >&2
    return 1
  fi
  if ! process_environment_values="$(tr '\0' '\n' < "$process_environment")"; then
    echo "Release $switch_operation is blocked: the running service environment changed while proving System Domains command-OFF." >&2
    return 1
  fi
  if printf '%s\n' "$process_environment_values" \
      | grep -Eq '^MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1$|^MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=.+$'; then
    echo "Release $switch_operation is blocked while the running service still has a legacy-incompatible System Domains command surface ON." >&2
    return 1
  fi
}
# SYSTEM_DOMAINS_RELEASE_SWITCH_GUARD_END

# SHIFT_EXECUTION_RELEASE_SWITCH_GUARD_BEGIN
assert_legacy_incompatible_shift_execution_commands_disabled() {
  local systemd_root proc_root dropin_dir configured_dropins main_pid process_environment process_environment_values
  systemd_root="$(printenv MES_RELEASE_GUARD_SYSTEMD_ROOT 2>/dev/null || true)"
  proc_root="$(printenv MES_RELEASE_GUARD_PROC_ROOT 2>/dev/null || true)"
  [ -n "$systemd_root" ] || systemd_root="/etc/systemd/system"
  [ -n "$proc_root" ] || proc_root="/proc"
  dropin_dir="$systemd_root/"$service".d"
  configured_dropins="$(grep -RIl -E 'MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=1' "$dropin_dir" 2>/dev/null || true)"
  if [ -n "$configured_dropins" ]; then
    echo "Release $switch_operation is blocked while a legacy-incompatible Shift Execution command owner is configured ON." >&2
    printf '%s\n' "$configured_dropins" >&2
    echo "Deactivate the Shift Execution command owner with the controlled root procedure, prove enabled=false, then retry." >&2
    return 1
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if ! [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be proved Shift Execution command-OFF (invalid MainPID)." >&2
    return 1
  fi
  process_environment="$proc_root/$main_pid/environ"
  if [ ! -r "$process_environment" ]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be read to prove Shift Execution command-OFF." >&2
    return 1
  fi
  if ! process_environment_values="$(tr '\0' '\n' < "$process_environment")"; then
    echo "Release $switch_operation is blocked: the running service environment changed while proving Shift Execution command-OFF." >&2
    return 1
  fi
  if printf '%s\n' "$process_environment_values" | grep -Eq '^MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=1$'; then
    echo "Release $switch_operation is blocked while the running service still has a legacy-incompatible Shift Execution command owner ON." >&2
    return 1
  fi
}
# SHIFT_EXECUTION_RELEASE_SWITCH_GUARD_END

# DIRECTORY_CLUSTER_RELEASE_SWITCH_GUARD_BEGIN
assert_legacy_incompatible_directory_cluster_commands_disabled() {
  local systemd_root proc_root dropin_dir configured_dropins main_pid process_environment process_environment_values
  systemd_root="$(printenv MES_RELEASE_GUARD_SYSTEMD_ROOT 2>/dev/null || true)"
  proc_root="$(printenv MES_RELEASE_GUARD_PROC_ROOT 2>/dev/null || true)"
  [ -n "$systemd_root" ] || systemd_root="/etc/systemd/system"
  [ -n "$proc_root" ] || proc_root="/proc"
  dropin_dir="$systemd_root/"$service".d"
  configured_dropins="$(grep -RIl -E 'MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=1' "$dropin_dir" 2>/dev/null || true)"
  if [ -n "$configured_dropins" ]; then
    echo "Release $switch_operation is blocked while a legacy-incompatible Directory Cluster command owner is configured ON." >&2
    printf '%s\n' "$configured_dropins" >&2
    echo "Deactivate the Directory Cluster command owner with the controlled root procedure, prove enabled=false, then retry." >&2
    return 1
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if ! [[ "$main_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be proved Directory Cluster command-OFF (invalid MainPID)." >&2
    return 1
  fi
  process_environment="$proc_root/$main_pid/environ"
  if [ ! -r "$process_environment" ]; then
    echo "Release $switch_operation is blocked: the running service environment cannot be read to prove Directory Cluster command-OFF." >&2
    return 1
  fi
  if ! process_environment_values="$(tr '\0' '\n' < "$process_environment")"; then
    echo "Release $switch_operation is blocked: the running service environment changed while proving Directory Cluster command-OFF." >&2
    return 1
  fi
  if printf '%s\n' "$process_environment_values" | grep -Eq '^MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=1$'; then
    echo "Release $switch_operation is blocked while the running service still has a legacy-incompatible Directory Cluster command owner ON." >&2
    return 1
  fi
}
# DIRECTORY_CLUSTER_RELEASE_SWITCH_GUARD_END

if previous_has_v6_specifications2_command_compatibility; then
  previous_specifications2_command_compatible=1
else
  assert_legacy_incompatible_specifications2_commands_disabled \
    || fail_activation 1 "legacy_incompatible_previous_specifications2_command_enabled"
fi

if target_has_v6_specifications2_command_compatibility; then
  target_specifications2_command_compatible=1
else
  assert_legacy_incompatible_specifications2_commands_disabled \
    || fail_activation 1 "legacy_incompatible_specifications2_command_enabled"
fi

if previous_has_nomenclature_command_compatibility; then
  previous_nomenclature_command_compatible=1
else
  assert_legacy_incompatible_nomenclature_commands_disabled \
    || fail_activation 1 "legacy_incompatible_previous_nomenclature_command_enabled"
fi

if target_has_nomenclature_command_compatibility; then
  target_nomenclature_command_compatible=1
else
  assert_legacy_incompatible_nomenclature_commands_disabled \
    || fail_activation 1 "legacy_incompatible_nomenclature_command_enabled"
fi

if previous_has_system_domains_command_compatibility; then
  previous_system_domains_command_compatible=1
else
  assert_legacy_incompatible_system_domains_commands_disabled \
    || fail_activation 1 "legacy_incompatible_previous_system_domains_command_enabled"
fi

if target_has_system_domains_command_compatibility; then
  target_system_domains_command_compatible=1
else
  assert_legacy_incompatible_system_domains_commands_disabled \
    || fail_activation 1 "legacy_incompatible_system_domains_command_enabled"
fi

if previous_has_shift_execution_command_compatibility; then
  previous_shift_execution_command_compatible=1
else
  assert_legacy_incompatible_shift_execution_commands_disabled \
    || fail_activation 1 "legacy_incompatible_previous_shift_execution_command_enabled"
fi

if target_has_shift_execution_command_compatibility; then
  target_shift_execution_command_compatible=1
else
  assert_legacy_incompatible_shift_execution_commands_disabled \
    || fail_activation 1 "legacy_incompatible_shift_execution_command_enabled"
fi

if previous_has_directory_cluster_command_compatibility; then
  previous_directory_cluster_command_compatible=1
else
  assert_legacy_incompatible_directory_cluster_commands_disabled \
    || fail_activation 1 "legacy_incompatible_previous_directory_cluster_command_enabled"
fi

if target_has_directory_cluster_command_compatibility; then
  target_directory_cluster_command_compatible=1
else
  assert_legacy_incompatible_directory_cluster_commands_disabled \
    || fail_activation 1 "legacy_incompatible_directory_cluster_command_enabled"
fi

if ! { [ "$previous_specifications2_command_compatible" = "1" ] \
      && [ "$previous_nomenclature_command_compatible" = "1" ] \
      && [ "$previous_system_domains_command_compatible" = "1" ] \
      && [ "$previous_shift_execution_command_compatible" = "1" ] \
      && [ "$previous_directory_cluster_command_compatible" = "1" ]; } \
  && ! { [ "$target_specifications2_command_compatible" = "1" ] \
      && [ "$target_nomenclature_command_compatible" = "1" ] \
      && [ "$target_system_domains_command_compatible" = "1" ] \
      && [ "$target_shift_execution_command_compatible" = "1" ] \
      && [ "$target_directory_cluster_command_compatible" = "1" ]; }; then
  fail_activation 1 "no_universally_compatible_command_recovery_runtime"
fi

if [ "$dry_run" = "true" ]; then
  activation_phase="dry-run-runtime-inspection"
  printf 'DRY_RUN current_kind=%s current_target=%s next=%s policy_sha=%s pin_legacy_baseline=%s\n' \
    "$previous_kind" "$previous_target" "$release_app_path" "$runtime_policy_sha" "$pin_legacy_baseline"
  exit 0
fi

legacy_bootstrap_target="$previous_target"
legacy_bootstrap_manifest="$previous_release_path/release-manifest.json"
if [ "$contour_name" = "pilot" ]; then
  legacy_bootstrap_target="$(node --input-type=module - \
    "$releases_path/active-release.json" "$releases_path" "$previous_target" <<'NODE'
import { readFile } from "node:fs/promises";
const [recordPath, releasesPath, currentTarget] = process.argv.slice(2);
const record = JSON.parse(await readFile(recordPath, "utf8"));
const baseline = record?.legacyBaseline;
if (!baseline) process.stdout.write(currentTarget);
else if (baseline.kind === "release-pointer"
  && /^[A-Za-z0-9._-]{1,96}$/.test(String(baseline.releaseId || ""))
  && baseline.target === releasesPath + "/" + baseline.releaseId + "/app") process.stdout.write(baseline.target);
else process.exit(76);
NODE
)" || fail_activation 1 "legacy_bootstrap_baseline_invalid"
  legacy_bootstrap_release_path="$(dirname -- "$legacy_bootstrap_target")"
  legacy_bootstrap_release_id="$(basename -- "$legacy_bootstrap_release_path")"
  legacy_bootstrap_manifest="$legacy_bootstrap_release_path/release-manifest.json"
  /usr/bin/node "$root_seal_helper" release \
    --releases-root="$releases_path" --release-id="$legacy_bootstrap_release_id" \
    --app="$legacy_bootstrap_target" >/dev/null \
    || fail_activation 1 "legacy_bootstrap_release_root_seal_invalid"
  run_fixed_public_verifier --app-root="$legacy_bootstrap_target" \
    --manifest="$legacy_bootstrap_manifest" \
    --expected-release-id="$legacy_bootstrap_release_id" --json --public-only >/dev/null \
    || fail_activation 1 "legacy_bootstrap_release_manifest_invalid"
fi
activation_phase="verify-bootstrap-recovery-invariant"
target_bootstrap_sha="$(verify_pilot_bootstrap_recovery_invariant \
  "$previous_target" "$previous_release_path/release-manifest.json" \
  "$release_app_path" "$release_path/release-manifest.json" \
  "$legacy_bootstrap_target" "$legacy_bootstrap_manifest")" \
  || fail_activation 1 "bootstrap_recovery_invariant_failed"

activation_phase="prepare-switch-journal"
/usr/bin/node "$journal_helper" prepare \
  --contour="$contour_name" \
  --operation=activation \
  --from-release-id="$previous_release_id" \
  --to-release-id="$release_id" >/dev/null \
  || fail_activation 1 "release_switch_journal_prepare_failed"

restore_failed_activation_records() {
  if [ "$activation_record_had_previous" = "1" ] && [ -e "$activation_record_backup_path" ]; then
    mv -f "$activation_record_backup_path" "$activation_record_path"
  elif [ "$activation_record_replaced" = "1" ]; then
    rm -f "$activation_record_path"
  fi
  rm -f "$releases_path/active-release.json.next" "$release_path/activation.json.next"
}

rollback() {
  trap - ERR
  set +e
  clear_release_app_verification_intent
  previous_command_owners_safe_for_rollback() {
    { [ "$previous_specifications2_command_compatible" = "1" ] || assert_legacy_incompatible_specifications2_commands_disabled; } \
      && { [ "$previous_nomenclature_command_compatible" = "1" ] || assert_legacy_incompatible_nomenclature_commands_disabled; } \
      && { [ "$previous_system_domains_command_compatible" = "1" ] || assert_legacy_incompatible_system_domains_commands_disabled; } \
      && { [ "$previous_shift_execution_command_compatible" = "1" ] || assert_legacy_incompatible_shift_execution_commands_disabled; } \
      && { [ "$previous_directory_cluster_command_compatible" = "1" ] || assert_legacy_incompatible_directory_cluster_commands_disabled; }
  }
  if ! previous_command_owners_safe_for_rollback; then
    echo "Activation failed after the runtime switch; refusing automatic rollback because a command owner required by the incompatible previous runtime is not proved OFF." >&2
    echo "The manifest-compatible candidate pointer remains active as the fail-closed safety runtime. active-release.json remains on the prior record until an operator reconciles the failed activation." >&2
    restore_failed_activation_records
    runtime_switched=0
    return 0
  fi
  if ! /usr/bin/node "$root_seal_helper" release \
      --releases-root="$releases_path" --release-id="$release_id" \
      --app="$release_app_path" >/dev/null \
    || ! /usr/bin/node "$root_seal_helper" pointer \
      --pointer="$app_path" --expected-target="$release_app_path" >/dev/null; then
    echo "Activation failed after the runtime switch; refusing automatic rollback because the active candidate seal or pointer cannot be reproved." >&2
    restore_failed_activation_records
    runtime_switched=0
    return 0
  fi
  if [ "$previous_kind" = "release-pointer" ]; then
    if ! /usr/bin/node "$root_seal_helper" release \
        --releases-root="$releases_path" --release-id="$previous_release_id" \
        --app="$previous_target" >/dev/null; then
      echo "Activation failed after the runtime switch; refusing automatic rollback to an unsealed previous release." >&2
      restore_failed_activation_records
      runtime_switched=0
      return 0
    fi
  elif [ -z "$legacy_path" ] || [ ! -d "$legacy_path/app" ] \
    || ! /usr/bin/node "$root_seal_helper" tree --tree="$legacy_path/app" >/dev/null; then
    echo "Activation failed after the runtime switch; refusing automatic rollback to an unsealed legacy tree." >&2
    restore_failed_activation_records
    runtime_switched=0
    return 0
  fi
  echo "Activation failed after the runtime switch; restoring previous runtime." >&2
  if [ "$previous_kind" = "release-pointer" ]; then
    ln -s "$previous_target" "$rollback_pointer_path"
    if ! /usr/bin/node "$root_seal_helper" pointer \
        --pointer="$rollback_pointer_path" --expected-target="$previous_target" >/dev/null; then
      rm -f "$rollback_pointer_path"
      echo "Activation failed after the runtime switch; refusing an unsealed automatic rollback pointer." >&2
      restore_failed_activation_records
      runtime_switched=0
      return 0
    fi
    if [ -L "$app_path" ]; then
      mv -T "$app_path" "$failed_pointer_path"
    fi
    mv -Tf "$rollback_pointer_path" "$app_path"
  else
    if [ -L "$app_path" ]; then
      mv -T "$app_path" "$failed_pointer_path"
    fi
    if [ -n "$legacy_path" ] && [ -d "$legacy_path/app" ]; then
      mv "$legacy_path/app" "$app_path"
    fi
  fi
  restore_failed_activation_records
  /usr/bin/node "$journal_helper" recover --contour="$contour_name" >/dev/null 2>&1 || true
  sudo -n /usr/bin/systemctl stop "$service" >/dev/null 2>&1 || true
  echo "Automatic rollback restored the previous pointer and left the service stopped for explicit verified recovery." >&2
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

/usr/bin/node "$journal_helper" mark --contour="$contour_name" --phase=pointer-switched >/dev/null \
  || fail_activation 1 "release_switch_journal_pointer_mark_failed"

activation_phase="restart-service"
write_release_app_verification_intent activation "$release_app_path" switch pilot pointer-switched
if ! sudo -n /usr/bin/systemctl restart "$service"; then
  clear_release_app_verification_intent
  emit_failure_diagnostics 1 "service_restart_failed"
  rollback
  exit 1
fi
if [ "$target_specifications2_command_compatible" != "1" ] \
  && ! assert_legacy_incompatible_specifications2_commands_disabled; then
  emit_failure_diagnostics 1 "legacy_incompatible_specifications2_command_became_enabled"
  rollback
  exit 1
fi
if [ "$target_nomenclature_command_compatible" != "1" ] \
  && ! assert_legacy_incompatible_nomenclature_commands_disabled; then
  emit_failure_diagnostics 1 "legacy_incompatible_nomenclature_command_became_enabled"
  rollback
  exit 1
fi
if [ "$target_system_domains_command_compatible" != "1" ] \
  && ! assert_legacy_incompatible_system_domains_commands_disabled; then
  emit_failure_diagnostics 1 "legacy_incompatible_system_domains_command_became_enabled"
  rollback
  exit 1
fi
if [ "$target_shift_execution_command_compatible" != "1" ] \
  && ! assert_legacy_incompatible_shift_execution_commands_disabled; then
  emit_failure_diagnostics 1 "legacy_incompatible_shift_execution_command_became_enabled"
  rollback
  exit 1
fi
if [ "$target_directory_cluster_command_compatible" != "1" ] \
  && ! assert_legacy_incompatible_directory_cluster_commands_disabled; then
  emit_failure_diagnostics 1 "legacy_incompatible_directory_cluster_command_became_enabled"
  rollback
  exit 1
fi

check_health() {
  local health_url="$1"
  local expected_policy_sha="$2"
  local expected_version="$3"
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
          const expectedVersion = String(process.argv[3] || "");
          if (!expectedVersion || health?.version !== expectedVersion) process.exit(1);
          if (expectedPolicySha && health?.reactRuntime?.sha256 !== expectedPolicySha) process.exit(1);
          if (Array.isArray(health?.reactRuntime?.activeEvaluationSurfaces) && health.reactRuntime.activeEvaluationSurfaces.length) process.exit(1);
        ' "$health_body_path" "$expected_policy_sha" "$expected_version"; then
        return 0
      fi
    fi
    sleep "$attempt"
  done
  return 1
}

check_served_bootstrap() {
  local expected_sha="$1" attempt http_code actual_sha
  [ "$contour_name" = "pilot" ] || return 0
  [ -n "$expected_sha" ] || return 1
  for attempt in $(seq 1 12); do
    if systemctl is-active --quiet "$service"; then
      http_code="$(curl -sS --max-time 10 -o "$bootstrap_body_path" -w '%{http_code}' \
        "http://localhost:$port/bootstrap-snapshot.json" || true)"
      if [ "$http_code" = "200" ]; then
        actual_sha="$(sha256sum "$bootstrap_body_path" | awk '{print $1}')"
        if [ "$actual_sha" = "$expected_sha" ]; then
          rm -f -- "$bootstrap_body_path"
          return 0
        fi
      fi
    fi
    sleep "$attempt"
  done
  rm -f -- "$bootstrap_body_path"
  return 1
}

activation_phase="local-healthcheck"
if ! check_health "http://localhost:$port/healthz" "$runtime_policy_sha" "$release_app_version"; then
  emit_failure_diagnostics 1 "local_healthcheck_failed"
  rollback
  exit 1
fi

activation_phase="bootstrap-healthcheck"
if ! check_served_bootstrap "$target_bootstrap_sha"; then
  emit_failure_diagnostics 1 "manifest_bound_bootstrap_healthcheck_failed"
  rollback
  exit 1
fi

activation_phase="public-healthcheck"
if ! check_health "$public_health_url" "$runtime_policy_sha" "$release_app_version"; then
  emit_failure_diagnostics 1 "public_healthcheck_failed"
  rollback
  exit 1
fi
clear_release_app_verification_intent

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
import { open, readFile } from "node:fs/promises";
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
for (const [path, value] of [[activePath, record], [activationPath, record]]) {
  const handle = await open(path, "wx", 0o644);
  await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
  await handle.sync();
  await handle.close();
}
NODE
if [ -e "$activation_record_path" ] || [ -L "$activation_record_path" ]; then
  activation_record_had_previous=1
  mv -f "$activation_record_path" "$activation_record_backup_path"
fi
mv -f "$release_path/activation.json.next" "$activation_record_path"
activation_record_replaced=1
sync -f "$activation_record_path"
sync -f "$release_path"
mv -f "$releases_path/active-release.json.next" "$releases_path/active-release.json"
runtime_switched=0
if ! /usr/bin/node "$journal_helper" mark --contour="$contour_name" --phase=record-committed >/dev/null; then
  sudo -n /usr/bin/systemctl stop "$service" >/dev/null 2>&1 || true
  fail_activation 1 "release_switch_journal_record_mark_failed_service_stopped"
fi
/usr/bin/node "$journal_helper" clear-committed --contour="$contour_name" >/dev/null \
  || fail_activation 1 "release_switch_journal_clear_failed"
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

  if (args.rootLocal) {
    await assertFixedRootRunner(FIXED_ROOT_ACTIVATE_RUNNER);
    const result = await run(FIXED_ROOT_AUTHORITY_WRAPPER, [
      "--operation=activation",
      "--busy-policy=fail",
      "--",
      "/usr/bin/bash", "-s", "--",
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
    ], { input: activationScript });
    if (result.stdout.trim()) console.log(result.stdout.trim());
    return;
  }

  console.log(`MES release activation${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- release: ${releaseId}`);
  console.log(`- candidate: ${releaseAppPath}`);

  const fixedArgs = [
    "--root-local",
    `--contour=${args.contour}`,
    `--release-id=${releaseId}`,
    ...(args.dryRun ? ["--dry-run"] : []),
    ...(args.pinLegacyBaseline ? ["--pin-legacy-baseline"] : []),
  ];
  const result = await run("ssh", [
    ...sshOptions,
    args.remote,
    fixedRootRunnerCommand(FIXED_ROOT_ACTIVATE_RUNNER, fixedArgs),
  ]);
  if (result.stdout.trim()) console.log(result.stdout.trim());
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result?.stdout) console.error(error.result.stdout.trim());
  if (error.result?.stderr) console.error(error.result.stderr.trim());
  process.exit(1);
});
