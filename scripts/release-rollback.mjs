#!/usr/bin/env node
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = ["-o", "ControlMaster=auto", "-o", "ControlPersist=60", "-o", `ControlPath=${sshControlPath}`];
const FIXED_ROOT_ROLLBACK_RUNNER = "/usr/local/libexec/mes/active-bundle/release-rollback-root.mjs";
const FIXED_ROOT_SEAL_HELPER = "/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs";
const FIXED_ROOT_SWITCH_JOURNAL_HELPER = "/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs";
const FIXED_ROOT_AUTHORITY_WRAPPER = "/usr/local/libexec/mes/active-bundle/with-pilot-release-authority-lock.sh";

const CONTOURS = {
  pilot: { appPath: "/srv/mes/pilot/app", releasesPath: "/srv/mes/pilot/releases", service: "mes-pilot.service", url: "https://pilot.mes-line.ru", port: "4175" },
  staging: { appPath: "/srv/mes/dev/app", releasesPath: "/srv/mes/dev/releases", service: "mes-dev.service", url: "https://staging.mes-line.ru", port: "4174" },
};

function shellQuote(value) { return `'${String(value).replace(/'/g, "'\\''")}'`; }
function formatDuration(ms) { return `${(ms / 1000).toFixed(2)}s`; }
function parseArgs(argv) {
  const args = { contour: "pilot", remote: "mes-line-root", dryRun: false, target: "previous", rootLocal: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else if (key === "target") args.target = String(value);
    else if (key === "root-local") args.rootLocal = true;
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

async function assertFixedRootRunner(expectedPath) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    throw new Error("Fixed release rollback runner requires uid 0");
  }
  if (await realpath(process.argv[1]) !== await realpath(expectedPath)) {
    throw new Error(`Release rollback root-local mode must execute ${expectedPath}`);
  }
  await run("/usr/bin/node", [FIXED_ROOT_SEAL_HELPER, "bundle"]);
}

function fixedRootRunnerCommand(path, args) {
  return `/usr/bin/node ${shellQuote(path)} ${args.map(shellQuote).join(" ")}`;
}

function assertSafeRestoreTarget(record, contour, targetMode) {
  safeReleaseId(record?.releaseId);
  const selected = targetMode === "legacy-baseline" ? record?.legacyBaseline : record?.previous;
  if (!selected || selected.kind !== "release-pointer") {
    throw new Error(targetMode === "legacy-baseline"
      ? "Active release record has no pinned attested immutable legacy release pointer"
      : "Active release record has no rollback-eligible attested immutable previous release pointer");
  }
  const releaseId = safeReleaseId(selected.releaseId || String(selected.target || "").split("/").at(-2));
  const target = String(selected.target || "");
  if (target !== `${contour.releasesPath}/${releaseId}/app`) {
    throw new Error("Active release record contains an unsafe release rollback target");
  }
  return selected;
}

const rollbackScript = String.raw`#!/usr/bin/env bash
set -euo pipefail
umask 022

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
[ "$previous_kind" = "release-pointer" ] || {
  echo "Rollback requires a root-reinoded, attested immutable release pointer; unmanifested legacy directories are ineligible." >&2
  exit 1
}
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
restore_app_version=""
restore_verification='{}'
authority_lock_parent="/run/lock/mes"
authority_lock_file="$authority_lock_parent/mes-authority-rollout.lock"
authority_intent_file="$authority_lock_parent/mes-release-operation.intent"
authority_app_intent_file="$authority_lock_parent/mes-release-app-verification.intent"
authority_lock_held=0
target_specifications2_command_compatible=0
current_specifications2_command_compatible=0
target_nomenclature_command_compatible=0
current_nomenclature_command_compatible=0
target_system_domains_command_compatible=0
current_system_domains_command_compatible=0
target_shift_execution_command_compatible=0
current_shift_execution_command_compatible=0
target_directory_cluster_command_compatible=0
current_directory_cluster_command_compatible=0
switch_operation="rollback"
root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
journal_helper="/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs"

if [ "$(id -u)" -ne 0 ]; then
  echo "Release rollback must run through the approved root SSH boundary." >&2
  exit 1
fi
[ -x /usr/bin/node ] && [ -f "$root_seal_helper" ] || {
  echo "The fixed root-owned release seal verifier is unavailable." >&2
  exit 1
}
for command_name in flock install runuser sync; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

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
      echo "Release rollback is blocked while an evaluation drop-in is present in $systemd_root." >&2
      return 1
    fi
  done
  if [ "$contour_name" = "pilot" ]; then
    evaluation_units="$(systemctl list-units --all --plain --no-legend --no-pager \
      --type=timer --type=service 2>/dev/null \
      | awk '$1 ~ /-evaluation-auto-rollback\.(timer|service)$/ { print $1 }' || true)"
    if [ -n "$evaluation_units" ]; then
      echo "Release rollback is blocked while an evaluation auto-rollback unit is loaded." >&2
      printf '%s\n' "$evaluation_units" >&2
      return 1
    fi
  fi
  main_pid="$(systemctl show "$service" --property=MainPID --value 2>/dev/null || true)"
  if [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] && [ -r "/proc/$main_pid/environ" ] \
    && tr '\0' '\n' < "/proc/$main_pid/environ" | grep -Eq '^MES_REACT_[A-Z0-9_]*EVALUATION=1$'; then
    echo "Release rollback is blocked while an evaluation permission is active." >&2
    return 1
  fi
}

[ "\${MES_RELEASE_AUTHORITY_LOCK_HELD:-0}" = "1" \
  ] && [ "\${MES_RELEASE_AUTHORITY_LOCK_FD:-}" = "9" \
  ] && [ -f "$authority_lock_file" ] && [ ! -L "$authority_lock_file" \
  ] && [ -e /proc/$$/fd/9 \
  ] && [ "$(stat -Lc '%d:%i' -- /proc/$$/fd/9 2>/dev/null || true)" = "$(stat -Lc '%d:%i' -- "$authority_lock_file" 2>/dev/null || true)" ] \
  || { echo "Rollback did not inherit the canonical release authority fd9." >&2; exit 1; }
authority_lock_inode="$(stat -Lc '%i' -- "$authority_lock_file")"
awk -v owner_pid="$$" -v lock_inode="$authority_lock_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":");
    if (identity[3] == lock_inode) found = 1;
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || { echo "Rollback could not prove exact release authority ownership." >&2; exit 1; }
authority_lock_held=1

case "$app_path:$releases_path:$service" in
  /srv/mes/pilot/app:/srv/mes/pilot/releases:mes-pilot.service) contour_name="pilot" ;;
  /srv/mes/dev/app:/srv/mes/dev/releases:mes-dev.service) contour_name="staging" ;;
  *) echo "Release-switch contour paths are not trusted." >&2; exit 1 ;;
esac
assert_no_pilot_runtime_transition_state \
  || { echo "Pilot credential/UID recovery state blocks rollback." >&2; exit 1; }
assert_no_active_evaluation \
  || { echo "Deactivate the evaluation and collect its auto-rollback unit before rollback." >&2; exit 1; }
/usr/bin/node "$root_seal_helper" artifact \
  --trusted-root="/usr/local/libexec/mes" --artifact="$journal_helper" >/dev/null
/usr/bin/node "$journal_helper" recover --contour="$contour_name" >/dev/null

restore_current() {
  set +e
  [ "$switched" = "1" ] || return 0
  clear_release_app_verification_intent
  if ! /usr/bin/node "$root_seal_helper" release \
      --releases-root="$releases_path" --release-id="$current_release_id" \
      --app="$current_target" >/dev/null \
    || ! /usr/bin/node "$root_seal_helper" pointer \
      --pointer="$rolled_pointer" --expected-target="$current_target" >/dev/null; then
    echo "Rollback recovery is fail-closed: the prior current release seal or preserved pointer cannot be reproved." >&2
    switched=0
    return 0
  fi
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
  if ! /usr/bin/node "$journal_helper" recover --contour="$contour_name" >/dev/null; then
    sudo -n /usr/bin/systemctl stop "$service" >/dev/null 2>&1 || true
    echo "Rollback recovery journal could not be reconciled; service remains stopped." >&2
    return 1
  fi
  sudo -n /usr/bin/systemctl stop "$service" >/dev/null 2>&1 || true
  echo "Rollback recovery restored the prior pointer and left the service stopped for explicit verified recovery." >&2
}
trap 'code=$?; restore_current; exit $code' ERR

test -L "$app_path"
/usr/bin/node "$root_seal_helper" release \
  --releases-root="$releases_path" --release-id="$current_release_id" \
  --app="$current_target" >/dev/null
/usr/bin/node "$root_seal_helper" pointer \
  --pointer="$app_path" --expected-target="$current_target" >/dev/null
/usr/bin/node "$root_seal_helper" artifact \
  --trusted-root="$releases_path" --artifact="$releases_path/active-release.json" >/dev/null
actual_current="$(readlink -f "$app_path")"
[ "$actual_current" = "$current_target" ] || { echo "Active runtime does not match active-release.json" >&2; exit 1; }
current_release_path="$releases_path/$current_release_id"
test -f "$current_release_path/release-manifest.json"
test -f "$current_target/scripts/release-verify.mjs"

if [ "$previous_kind" = "release-pointer" ]; then
  test -d "$previous_target"
  previous_release_path="$(dirname "$previous_target")"
  previous_release_id="$(basename "$previous_release_path")"
  /usr/bin/node "$root_seal_helper" release \
    --releases-root="$releases_path" --release-id="$previous_release_id" \
    --app="$previous_target" >/dev/null
  test -f "$previous_release_path/release-manifest.json"
  test -f "$previous_target/scripts/release-verify.mjs"
else
  /usr/bin/node "$root_seal_helper" tree --tree="$legacy_path/app" >/dev/null
  test -d "$legacy_path/app"
  test -f "$legacy_path/app/dist/index.html"
fi

# Seal both the serving and selected rollback runtimes before executing code
# from either release. Their manifests are content proofs only after this
# fixed-helper trust boundary.
run_candidate_node() {
  runuser -u mes-stage -- /usr/bin/env \
    HOME=/nonexistent \
    PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /usr/bin/node "$@"
}
(cd "$current_target" && run_candidate_node scripts/release-verify.mjs \
  --manifest="$current_release_path/release-manifest.json" \
  --expected-release-id="$current_release_id" \
  --json) >/dev/null
if [ "$previous_kind" = "release-pointer" ]; then
  restore_verification="$(cd "$previous_target" && run_candidate_node scripts/release-verify.mjs --manifest="$previous_release_path/release-manifest.json" --expected-release-id="$previous_release_id" --json)"
  printf '%s\n' "$restore_verification"
  restore_policy_sha="$(node --input-type=module -e '
    const verification = JSON.parse(process.argv[1]);
    process.stdout.write(String(verification.runtimePolicySha256 || ""));
  ' "$restore_verification")"
  restore_app_version="$(node --input-type=module -e '
    const verification = JSON.parse(process.argv[1]);
    process.stdout.write(String(verification.appVersion || ""));
  ' "$restore_verification")"
  [ -n "$restore_app_version" ] || { echo "Selected rollback release has no verified application version." >&2; exit 1; }
fi

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

verified_release_pointer_has_v6_specifications2_command_compatibility() {
  local target_app="$1" manifest="$2" marker
  marker="$target_app/ops/postgres/specifications2-server-command-compatibility.json"
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
  local target_app="$1" manifest="$2" marker
  marker="$target_app/ops/auth/nomenclature-server-command-compatibility.json"
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
  local target_app="$1" manifest="$2" marker
  marker="$target_app/ops/postgres/system-domains-server-command-compatibility.json"
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
  local target_app="$1" manifest="$2" marker
  marker="$target_app/ops/postgres/shift-execution-server-command-compatibility.json"
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
  local target_app="$1" manifest="$2" marker
  marker="$target_app/ops/shared-state/directory-cluster-server-command-compatibility.json"
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
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_v6_specifications2_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

current_has_v6_specifications2_command_compatibility() {
  verified_release_pointer_has_v6_specifications2_command_compatibility \
    "$current_target" "$current_release_path/release-manifest.json"
}

target_has_nomenclature_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_nomenclature_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

current_has_nomenclature_command_compatibility() {
  verified_release_pointer_has_nomenclature_command_compatibility \
    "$current_target" "$current_release_path/release-manifest.json"
}

target_has_system_domains_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_system_domains_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

current_has_system_domains_command_compatibility() {
  verified_release_pointer_has_system_domains_command_compatibility \
    "$current_target" "$current_release_path/release-manifest.json"
}

target_has_shift_execution_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_shift_execution_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

current_has_shift_execution_command_compatibility() {
  verified_release_pointer_has_shift_execution_command_compatibility \
    "$current_target" "$current_release_path/release-manifest.json"
}

target_has_directory_cluster_command_compatibility() {
  [ "$previous_kind" = "release-pointer" ] \
    && verified_release_pointer_has_directory_cluster_command_compatibility \
      "$previous_target" "$previous_release_path/release-manifest.json"
}

current_has_directory_cluster_command_compatibility() {
  verified_release_pointer_has_directory_cluster_command_compatibility \
    "$current_target" "$current_release_path/release-manifest.json"
}

if target_has_v6_specifications2_command_compatibility; then
  target_specifications2_command_compatible=1
else
  assert_legacy_incompatible_specifications2_commands_disabled
fi
if current_has_v6_specifications2_command_compatibility; then
  current_specifications2_command_compatible=1
fi
if target_has_nomenclature_command_compatibility; then
  target_nomenclature_command_compatible=1
else
  assert_legacy_incompatible_nomenclature_commands_disabled
fi
if current_has_nomenclature_command_compatibility; then
  current_nomenclature_command_compatible=1
fi
if target_has_system_domains_command_compatibility; then
  target_system_domains_command_compatible=1
else
  assert_legacy_incompatible_system_domains_commands_disabled
fi
if current_has_system_domains_command_compatibility; then
  current_system_domains_command_compatible=1
fi
if target_has_shift_execution_command_compatibility; then
  target_shift_execution_command_compatible=1
else
  assert_legacy_incompatible_shift_execution_commands_disabled
fi
if current_has_shift_execution_command_compatibility; then
  current_shift_execution_command_compatible=1
fi
if target_has_directory_cluster_command_compatibility; then
  target_directory_cluster_command_compatible=1
else
  assert_legacy_incompatible_directory_cluster_commands_disabled
fi
if current_has_directory_cluster_command_compatibility; then
  current_directory_cluster_command_compatible=1
fi
if ! { [ "$target_specifications2_command_compatible" = "1" ] \
      && [ "$target_nomenclature_command_compatible" = "1" ] \
      && [ "$target_system_domains_command_compatible" = "1" ] \
      && [ "$target_shift_execution_command_compatible" = "1" ] \
      && [ "$target_directory_cluster_command_compatible" = "1" ]; } \
  && ! { [ "$current_specifications2_command_compatible" = "1" ] \
      && [ "$current_nomenclature_command_compatible" = "1" ] \
      && [ "$current_system_domains_command_compatible" = "1" ] \
      && [ "$current_shift_execution_command_compatible" = "1" ] \
      && [ "$current_directory_cluster_command_compatible" = "1" ]; }; then
  echo "Rollback is blocked because neither the current nor selected runtime carries every manifest-bound server-command contract required for fail-safe recovery." >&2
  exit 1
fi

if [ "$dry_run" = "true" ]; then
  printf 'DRY_RUN target_mode=%s current=%s restore_kind=%s restore_target=%s legacy_path=%s policy_sha=%s\n' "$target_mode" "$current_target" "$previous_kind" "$previous_target" "$legacy_path" "$restore_policy_sha"
  exit 0
fi

/usr/bin/node "$journal_helper" prepare \
  --contour="$contour_name" \
  --operation=rollback \
  --from-release-id="$current_release_id" \
  --to-release-id="$previous_release_id" >/dev/null

ln -s "$current_target" "$rolled_pointer"
/usr/bin/node "$root_seal_helper" pointer \
  --pointer="$rolled_pointer" --expected-target="$current_target" >/dev/null
ln -s "$previous_target" "$app_path.next"
/usr/bin/node "$root_seal_helper" pointer \
  --pointer="$app_path.next" --expected-target="$previous_target" >/dev/null
mv -Tf "$app_path.next" "$app_path"
switched=1
/usr/bin/node "$journal_helper" mark --contour="$contour_name" --phase=pointer-switched >/dev/null
if [ "$previous_kind" = "release-pointer" ]; then
  /usr/bin/node "$root_seal_helper" pointer \
    --pointer="$app_path" --expected-target="$previous_target" >/dev/null
else
  /usr/bin/node "$root_seal_helper" tree --tree="$app_path" >/dev/null
fi
write_release_app_verification_intent rollback "$previous_target" switch pilot pointer-switched
sudo -n /usr/bin/systemctl restart "$service"
if [ "$target_specifications2_command_compatible" != "1" ]; then
  assert_legacy_incompatible_specifications2_commands_disabled
fi
if [ "$target_nomenclature_command_compatible" != "1" ]; then
  assert_legacy_incompatible_nomenclature_commands_disabled
fi
if [ "$target_system_domains_command_compatible" != "1" ]; then
  assert_legacy_incompatible_system_domains_commands_disabled
fi
if [ "$target_shift_execution_command_compatible" != "1" ]; then
  assert_legacy_incompatible_shift_execution_commands_disabled
fi
if [ "$target_directory_cluster_command_compatible" != "1" ]; then
  assert_legacy_incompatible_directory_cluster_commands_disabled
fi

check_health() {
  local health_url="$1" expected_policy_sha="$2" expected_version="$3" attempt health_code
  for attempt in $(seq 1 12); do
    if systemctl is-active --quiet "$service"; then
      health_code="$(curl -sS --max-time 10 -o "$health_body" -w '%{http_code}' "$health_url" || true)"
      if [ "$health_code" = "200" ] && node --input-type=module -e '
        import { readFile } from "node:fs/promises";
        const health = JSON.parse(await readFile(process.argv[1], "utf8"));
        if (health?.status !== "ok" || health?.sharedState !== "ready") process.exit(1);
        const expectedPolicySha = String(process.argv[2] || "");
        const expectedVersion = String(process.argv[3] || "");
        if (!expectedVersion || health?.version !== expectedVersion) process.exit(1);
        if (expectedPolicySha && health?.reactRuntime?.sha256 !== expectedPolicySha) process.exit(1);
      ' "$health_body" "$expected_policy_sha" "$expected_version"; then return 0; fi
    fi
    sleep "$attempt"
  done
  return 1
}

check_health "http://localhost:$port/healthz" "$restore_policy_sha" "$restore_app_version"
check_health "$public_health_url" "$restore_policy_sha" "$restore_app_version"
clear_release_app_verification_intent

node --input-type=module - \
  "$releases_path/active-release.json.next" \
  "$releases_path/$current_release_id/rollback-$timestamp.json.next" \
  "$releases_path/active-release.json" \
  "$previous_kind" "$previous_target" "$legacy_path" "$current_release_id" "$timestamp" \
  "$target_mode" "$restore_verification" "$current_target" <<'NODE'
import { open, readFile } from "node:fs/promises";
const [activePath, rollbackPath, currentActivePath, previousKind, previousTarget, legacyPath, rolledBackReleaseId, rolledBackAt, targetMode, restoreVerificationJson, currentTarget] = process.argv.slice(2);
const currentActive = JSON.parse(await readFile(currentActivePath, "utf8"));
const restoreVerification = JSON.parse(restoreVerificationJson);
const runtimePolicyFromVerification = (value) => ({
  schemaVersion: 1,
  policyId: String(value?.runtimePolicyId || "implicit-legacy"),
  sha256: value?.runtimePolicySha256 || null,
  reactSurfaces: Array.isArray(value?.reactSurfaces) ? value.reactSurfaces : [],
});
if (previousKind !== "release-pointer") {
  throw new Error("Only an attested immutable release pointer may become the restored runtime");
}
const targetManifest = JSON.parse(await readFile(previousTarget.slice(0, -4) + "/release-manifest.json", "utf8"));
if (targetManifest.releaseId !== restoreVerification.releaseId) {
  throw new Error("Restored manifest identity differs from the verified release");
}
const restored = {
  schemaVersion: 2,
  releaseId: targetManifest.releaseId,
  activatedAt: rolledBackAt,
  previous: {
    kind: "release-pointer",
    releaseId: rolledBackReleaseId,
    target: currentTarget,
    legacyPath: null,
    runtimePolicy: currentActive.runtimePolicy || runtimePolicyFromVerification(null),
  },
  legacyBaseline: currentActive.legacyBaseline || null,
  runtimePolicy: runtimePolicyFromVerification(restoreVerification),
  manifest: {
    gitCommit: targetManifest.gitCommit,
    appVersion: targetManifest.appVersion,
    sourceTreeSha256: targetManifest.sourceTreeSha256,
    distTreeSha256: targetManifest.distTreeSha256,
    runtimePolicySha256: targetManifest.runtimePolicy?.sha256 || null,
  },
  health: { local: "ok", public: "ok" },
};
restored.rollback = { fromReleaseId: rolledBackReleaseId, rolledBackAt, previousKind, targetMode };
const report = { schemaVersion: 2, rolledBackReleaseId, rolledBackAt, targetMode, restored: { kind: previousKind, target: previousTarget, legacyPath: legacyPath || null }, runtimePolicy: restored.runtimePolicy, legacyBaseline: restored.legacyBaseline, health: { local: "ok", public: "ok" } };
for (const [path, value] of [[activePath, restored], [rollbackPath, report]]) {
  const handle = await open(path, "wx", 0o644);
  await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
  await handle.sync();
  await handle.close();
}
NODE
mv -f "$releases_path/$current_release_id/rollback-$timestamp.json.next" "$releases_path/$current_release_id/rollback-$timestamp.json"
sync -f "$releases_path/$current_release_id/rollback-$timestamp.json"
sync -f "$releases_path/$current_release_id"
mv -f "$releases_path/active-release.json.next" "$releases_path/active-release.json"
switched=0
if ! /usr/bin/node "$journal_helper" mark --contour="$contour_name" --phase=record-committed >/dev/null; then
  sudo -n /usr/bin/systemctl stop "$service" >/dev/null 2>&1 || true
  echo "Rollback active record could not be journal-committed; service was stopped." >&2
  exit 1
fi
/usr/bin/node "$journal_helper" clear-committed --contour="$contour_name" >/dev/null
printf 'ROLLED_BACK release=%s target_mode=%s restored_kind=%s restored_target=%s\n' "$current_release_id" "$target_mode" "$previous_kind" "$previous_target"
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);
  if (!args.rootLocal) {
    const fixedArgs = [
      "--root-local",
      `--contour=${args.contour}`,
      `--target=${args.target}`,
      ...(args.dryRun ? ["--dry-run"] : []),
    ];
    const result = await run("ssh", [
      ...sshOptions,
      args.remote,
      fixedRootRunnerCommand(FIXED_ROOT_ROLLBACK_RUNNER, fixedArgs),
    ]);
    if (result.stdout.trim()) console.log(result.stdout.trim());
    return;
  }
  await assertFixedRootRunner(FIXED_ROOT_ROLLBACK_RUNNER);
  const activeRecordPath = `${contour.releasesPath}/active-release.json`;
  const record = JSON.parse(await readFile(activeRecordPath, "utf8"));
  const activeReleaseId = safeReleaseId(record.releaseId);
  const restoreTarget = assertSafeRestoreTarget(record, contour, args.target);
  const startedAt = performance.now();

  console.log(`MES release rollback${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- active release: ${activeReleaseId}`);
  console.log(`- target: ${args.target}`);
  console.log(`- restore kind: ${restoreTarget.kind}`);

  const result = await run(FIXED_ROOT_AUTHORITY_WRAPPER, [
    "--operation=rollback",
    "--busy-policy=fail",
    "--",
    "/usr/bin/bash", "-s", "--",
    contour.appPath, contour.releasesPath, contour.service, contour.port, `${contour.url}/healthz`,
    activeReleaseId,
    restoreTarget.kind,
    restoreTarget.kind === "release-pointer" ? restoreTarget.target : restoreTarget.legacyPath,
    String(args.dryRun),
    args.target,
  ], { input: rollbackScript });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result?.stdout) console.error(error.result.stdout.trim());
  if (error.result?.stderr) console.error(error.result.stderr.trim());
  process.exit(1);
});
