#!/usr/bin/env node
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = ["-o", "ControlMaster=auto", "-o", "ControlPersist=60", "-o", `ControlPath=${sshControlPath}`];

const CONTOURS = {
  pilot: { appPath: "/srv/mes/pilot/app", releasesPath: "/srv/mes/pilot/releases", service: "mes-pilot.service", url: "https://pilot.mes-line.ru", port: "4175" },
  staging: { appPath: "/srv/mes/dev/app", releasesPath: "/srv/mes/dev/releases", service: "mes-dev.service", url: "https://staging.mes-line.ru", port: "4174" },
};

function shellQuote(value) { return `'${String(value).replace(/'/g, "'\\''")}'`; }
function formatDuration(ms) { return `${(ms / 1000).toFixed(2)}s`; }
function parseArgs(argv) {
  const args = { contour: "pilot", remote: "mes-line", dryRun: false, target: "previous" };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else if (key === "target") args.target = String(value);
    else throw new Error(`Unknown option: --${key}`);
  }
  if (!["previous", "legacy-baseline"].includes(args.target)) throw new Error("--target must be previous or legacy-baseline");
  return args;
}

function safeReleaseId(value) {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(normalized)) throw new Error("Active release record contains an unsafe release id");
  return normalized;
}

async function run(command, args, { input = "", allowFailure = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (code !== 0 && !allowFailure) {
        const error = new Error(`${[command, ...args].join(" ")} failed with code ${code}`);
        error.result = result;
        reject(error);
      } else resolve(result);
    });
    child.stdin.end(input);
  });
}

function remoteBashArgs(remote, values) {
  return [...sshOptions, remote, `bash -s -- ${values.map(shellQuote).join(" ")}`];
}

function assertSafeRestoreTarget(record, contour, targetMode) {
  safeReleaseId(record?.releaseId);
  const selected = targetMode === "legacy-baseline" ? record?.legacyBaseline : record?.previous;
  if (!selected || !["release-pointer", "legacy-directory"].includes(selected.kind)) {
    throw new Error(targetMode === "legacy-baseline"
      ? "Active release record has no pinned legacy baseline"
      : "Active release record has no rollback-eligible previous runtime");
  }
  if (selected.kind === "release-pointer") {
    const releaseId = safeReleaseId(selected.releaseId || String(selected.target || "").split("/").at(-2));
    const target = String(selected.target || "");
    if (target !== `${contour.releasesPath}/${releaseId}/app`) {
      throw new Error("Active release record contains an unsafe release rollback target");
    }
  } else {
    const legacyPath = String(selected.legacyPath || "");
    if (!legacyPath.startsWith(`${contour.releasesPath}/legacy-app-pre-`) || legacyPath.includes("/../")) {
      throw new Error("Active release record contains an unsafe legacy-directory rollback path");
    }
  }
  return selected;
}

const rollbackScript = String.raw`#!/usr/bin/env bash
set -euo pipefail

app_path="$1"
releases_path="$2"
service="$3"
port="$4"
public_health_url="$5"
current_release_id="$6"
previous_kind="$7"
restore_path="$8"
dry_run="$9"
shift 9
target_mode="$1"
previous_target=""
legacy_path=""
if [ "$previous_kind" = "release-pointer" ]; then
  previous_target="$restore_path"
else
  legacy_path="$restore_path"
fi

current_target="$releases_path/$current_release_id/app"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
rolled_pointer="$releases_path/rolled-back-pointer-$timestamp"
failed_runtime="$releases_path/failed-rollback-runtime-$timestamp"
health_body="$releases_path/rollback-health-$timestamp.json"
switched=0
restore_policy_sha=""
restore_verification='{}'

restore_current() {
  set +e
  [ "$switched" = "1" ] || return 0
  if [ "$previous_kind" = "legacy-directory" ]; then
    if [ -d "$app_path" ] && [ ! -L "$app_path" ]; then
      mkdir -p "$legacy_path"
      mv "$app_path" "$legacy_path/app"
    fi
  elif [ -e "$app_path" ] || [ -L "$app_path" ]; then
    mv -T "$app_path" "$failed_runtime"
  fi
  if [ -L "$rolled_pointer" ]; then
    mv -T "$rolled_pointer" "$app_path"
  else
    ln -s "$current_target" "$app_path.restore"
    mv -Tf "$app_path.restore" "$app_path"
  fi
  sudo -n /usr/bin/systemctl restart "$service" >/dev/null 2>&1 || true
}
trap 'code=$?; restore_current; exit $code' ERR

test -L "$app_path"
actual_current="$(readlink -f "$app_path")"
[ "$actual_current" = "$current_target" ] || { echo "Active runtime does not match active-release.json" >&2; exit 1; }

if [ "$previous_kind" = "release-pointer" ]; then
  test -d "$previous_target"
  previous_release_path="$(dirname "$previous_target")"
  previous_release_id="$(basename "$previous_release_path")"
  test -f "$previous_release_path/release-manifest.json"
  test -f "$previous_target/scripts/release-verify.mjs"
  restore_verification="$(cd "$previous_target" && node scripts/release-verify.mjs --manifest="$previous_release_path/release-manifest.json" --expected-release-id="$previous_release_id" --json)"
  printf '%s\n' "$restore_verification"
  restore_policy_sha="$(node --input-type=module -e '
    const verification = JSON.parse(process.argv[1]);
    process.stdout.write(String(verification.runtimePolicySha256 || ""));
  ' "$restore_verification")"
else
  test -d "$legacy_path/app"
  test -f "$legacy_path/app/dist/index.html"
fi

if [ "$dry_run" = "true" ]; then
  printf 'DRY_RUN target_mode=%s current=%s restore_kind=%s restore_target=%s legacy_path=%s policy_sha=%s\n' "$target_mode" "$current_target" "$previous_kind" "$previous_target" "$legacy_path" "$restore_policy_sha"
  exit 0
fi

mv -T "$app_path" "$rolled_pointer"
if [ "$previous_kind" = "release-pointer" ]; then
  ln -s "$previous_target" "$app_path.next"
  mv -Tf "$app_path.next" "$app_path"
else
  mv "$legacy_path/app" "$app_path"
fi
switched=1
sudo -n /usr/bin/systemctl restart "$service"

check_health() {
  local health_url="$1" expected_policy_sha="$2" attempt health_code
  for attempt in $(seq 1 12); do
    if systemctl is-active --quiet "$service"; then
      health_code="$(curl -sS --max-time 10 -o "$health_body" -w '%{http_code}' "$health_url" || true)"
      if [ "$health_code" = "200" ] && node --input-type=module -e '
        import { readFile } from "node:fs/promises";
        const health = JSON.parse(await readFile(process.argv[1], "utf8"));
        if (health?.status !== "ok" || health?.sharedState !== "ready") process.exit(1);
        const expectedPolicySha = String(process.argv[2] || "");
        if (expectedPolicySha && health?.reactRuntime?.sha256 !== expectedPolicySha) process.exit(1);
      ' "$health_body" "$expected_policy_sha"; then return 0; fi
    fi
    sleep "$attempt"
  done
  return 1
}

check_health "http://localhost:$port/healthz" "$restore_policy_sha"
check_health "$public_health_url" "$restore_policy_sha"

node --input-type=module - \
  "$releases_path/active-release.json.next" \
  "$releases_path/$current_release_id/rollback-$timestamp.json.next" \
  "$releases_path/active-release.json" \
  "$previous_kind" "$previous_target" "$legacy_path" "$current_release_id" "$timestamp" \
  "$target_mode" "$restore_verification" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
const [activePath, rollbackPath, currentActivePath, previousKind, previousTarget, legacyPath, rolledBackReleaseId, rolledBackAt, targetMode, restoreVerificationJson] = process.argv.slice(2);
const currentActive = JSON.parse(await readFile(currentActivePath, "utf8"));
const restoreVerification = JSON.parse(restoreVerificationJson);
const runtimePolicyFromVerification = (value) => ({
  schemaVersion: 1,
  policyId: String(value?.runtimePolicyId || "implicit-legacy"),
  sha256: value?.runtimePolicySha256 || null,
  reactSurfaces: Array.isArray(value?.reactSurfaces) ? value.reactSurfaces : [],
});
let restored;
if (previousKind === "release-pointer") {
  const previousReleasePath = previousTarget.slice(0, -4);
  restored = JSON.parse(await readFile(previousReleasePath + "/activation.json", "utf8"));
  restored = {
    ...restored,
    schemaVersion: 2,
    runtimePolicy: restored.runtimePolicy || runtimePolicyFromVerification(restoreVerification),
    legacyBaseline: currentActive.legacyBaseline || restored.legacyBaseline || null,
    health: { local: "ok", public: "ok" },
  };
} else {
  restored = {
    schemaVersion: 2,
    releaseId: "legacy-pre-" + rolledBackAt,
    activatedAt: rolledBackAt,
    previous: null,
    legacyBaseline: currentActive.legacyBaseline || null,
    runtimePolicy: runtimePolicyFromVerification(null),
    manifest: null,
    health: { local: "ok", public: "ok" },
  };
}
restored.rollback = { fromReleaseId: rolledBackReleaseId, rolledBackAt, previousKind, targetMode };
const report = { schemaVersion: 2, rolledBackReleaseId, rolledBackAt, targetMode, restored: { kind: previousKind, target: previousTarget, legacyPath: legacyPath || null }, runtimePolicy: restored.runtimePolicy, legacyBaseline: restored.legacyBaseline, health: { local: "ok", public: "ok" } };
await writeFile(activePath, JSON.stringify(restored, null, 2) + "\n");
await writeFile(rollbackPath, JSON.stringify(report, null, 2) + "\n");
NODE
mv -f "$releases_path/$current_release_id/rollback-$timestamp.json.next" "$releases_path/$current_release_id/rollback-$timestamp.json"
mv -f "$releases_path/active-release.json.next" "$releases_path/active-release.json"
switched=0
printf 'ROLLED_BACK release=%s target_mode=%s restored_kind=%s restored_target=%s\n' "$current_release_id" "$target_mode" "$previous_kind" "$previous_target"
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);
  const activeRecordPath = `${contour.releasesPath}/active-release.json`;
  const recordResult = await run("ssh", [...sshOptions, args.remote, `cat ${shellQuote(activeRecordPath)}`]);
  const record = JSON.parse(recordResult.stdout);
  const activeReleaseId = safeReleaseId(record.releaseId);
  const restoreTarget = assertSafeRestoreTarget(record, contour, args.target);
  const startedAt = performance.now();

  console.log(`MES release rollback${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- active release: ${activeReleaseId}`);
  console.log(`- target: ${args.target}`);
  console.log(`- restore kind: ${restoreTarget.kind}`);

  const result = await run("ssh", remoteBashArgs(args.remote, [
    contour.appPath, contour.releasesPath, contour.service, contour.port, `${contour.url}/healthz`,
    activeReleaseId,
    restoreTarget.kind,
    restoreTarget.kind === "release-pointer" ? restoreTarget.target : restoreTarget.legacyPath,
    String(args.dryRun),
    args.target,
  ]), { input: rollbackScript });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result?.stdout) console.error(error.result.stdout.trim());
  if (error.result?.stderr) console.error(error.result.stderr.trim());
  process.exit(1);
});
