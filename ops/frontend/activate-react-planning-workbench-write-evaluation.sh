#!/usr/bin/env bash
# Enable the narrow, signed Planning start-date React evaluation on Pilot.
set -euo pipefail
set +x

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

readonly FIXED_HELPER_ROOT="/usr/local/libexec/mes/active-bundle"
readonly LOCK_WRAPPER="${FIXED_HELPER_ROOT}/with-pilot-release-authority-lock.sh"
readonly SEAL_HELPER="${FIXED_HELPER_ROOT}/release-root-seal-verify.mjs"
readonly AUTHORITY_LOCK="/run/lock/mes/mes-authority-rollout.lock"
readonly ACTIVE_POINTER="/srv/mes/pilot/app"
readonly RELEASES_ROOT="/srv/mes/pilot/releases"
readonly SERVICE="mes-pilot"
readonly PORT="4175"
readonly DROPIN_DIR="/run/systemd/system/${SERVICE}.service.d"
readonly DROPIN_FILE="${DROPIN_DIR}/87-react-planning-workbench-write-evaluation.conf"
readonly PERSISTENT_DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/87-react-planning-workbench-write-evaluation.conf"
readonly EMPLOYEE_AUTH_ENV="/etc/mes/mes-pilot-employee-auth.env"
readonly AUTO_UNIT="mes-planning-start-date-evaluation-auto-rollback"

[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 73; }
if [[ "${1:-}" != "--locked" ]]; then
  exec /bin/bash "$LOCK_WRAPPER" \
    --operation=planning-start-date-evaluation-activate \
    --busy-policy=fail \
    -- /bin/bash "$0" --locked
fi
[[ $# -eq 1 ]] || { echo "Unexpected activation arguments." >&2; exit 2; }

assert_authority_lock() {
  [[ "${MES_RELEASE_AUTHORITY_LOCK_HELD:-}" == "1" && "${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == "9" \
    && -f "$AUTHORITY_LOCK" && ! -L "$AUTHORITY_LOCK" \
    && "$(readlink -f -- "$AUTHORITY_LOCK")" == "$AUTHORITY_LOCK" \
    && "$(stat -Lc '%u:%g:%a:%h' -- "$AUTHORITY_LOCK")" == "0:0:600:1" \
    && -e /proc/$$/fd/9 \
    && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9)" == "$(stat -Lc '%d:%i' -- "$AUTHORITY_LOCK")" ]] \
    || { echo "Planning evaluation requires the canonical inherited authority lock on fd9." >&2; exit 74; }
  local authority_inode
  authority_inode="$(stat -Lc '%i' -- "$AUTHORITY_LOCK")"
  awk -v owner_pid="$$" -v lock_inode="$authority_inode" '
    $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
      split($7, identity, ":"); if (identity[3] == lock_inode) found = 1
    }
    END { exit(found ? 0 : 1) }
  ' /proc/$$/fdinfo/9 \
    || { echo "Planning evaluation could not prove authority-lock ownership." >&2; exit 74; }
}

assert_authority_lock
/usr/bin/node "$SEAL_HELPER" bundle >/dev/null

[[ -L "$ACTIVE_POINTER" ]] || { echo "Pilot app pointer is not a sealed release symlink." >&2; exit 74; }
app_dir="$(readlink -f -- "$ACTIVE_POINTER")"
release_path="$(dirname -- "$app_dir")"
release_id="$(basename -- "$release_path")"
[[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ && "$app_dir" == "${RELEASES_ROOT}/${release_id}/app" ]] \
  || { echo "Pilot app pointer does not target an immutable release app." >&2; exit 74; }
/usr/bin/node "$SEAL_HELPER" release \
  --releases-root="$RELEASES_ROOT" --release-id="$release_id" --app="$app_dir" >/dev/null
/usr/bin/node "$SEAL_HELPER" pointer \
  --pointer="$ACTIVE_POINTER" --expected-target="$app_dir" >/dev/null
readonly APP_DIR="$app_dir"
readonly RELEASE_ID="$release_id"
readonly SOURCE_FILE="${APP_DIR}/ops/frontend/mes-pilot-react-planning-workbench-write-evaluation.conf"
readonly DEACTIVATE_SCRIPT="${APP_DIR}/ops/frontend/deactivate-react-planning-workbench-write-evaluation.sh"
[[ "$(readlink -f -- "$0")" == "${APP_DIR}/ops/frontend/activate-react-planning-workbench-write-evaluation.sh" ]] \
  || { echo "Activation must execute from the sealed active release." >&2; exit 74; }
for artifact in "$SOURCE_FILE" "$DEACTIVATE_SCRIPT" \
  "${APP_DIR}/scripts/domain-postgres-preflight.mjs" \
  "${APP_DIR}/scripts/planning-workbench-write-rollout-readiness.mjs"; do
  /usr/bin/node "$SEAL_HELPER" artifact --trusted-root="$APP_DIR" --artifact="$artifact" >/dev/null
done

[[ -f "$EMPLOYEE_AUTH_ENV" && ! -L "$EMPLOYEE_AUTH_ENV" \
  && "$(readlink -f -- "$EMPLOYEE_AUTH_ENV")" == "$EMPLOYEE_AUTH_ENV" \
  && "$(stat -Lc '%u:%g:%a:%h' -- "$EMPLOYEE_AUTH_ENV")" == "0:0:600:1" ]] \
  || { echo "Employee-auth environment must be a root:root 0600 regular file." >&2; exit 74; }

required_source_lines=(
  'EnvironmentFile=/etc/mes/mes-pilot-employee-auth.env'
  'Environment=MES_DOMAIN_STORAGE=postgres'
  'Environment=MES_ENABLE_EMPLOYEE_AUTH=1'
  'Environment=MES_ENABLE_PLANNING_START_DATE_COMMANDS=1'
  'Environment=MES_REACT_PLANNING_WORKBENCH=1'
  'Environment=MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION=1'
)
for line in "${required_source_lines[@]}"; do
  [[ "$(grep -Fxc -- "$line" "$SOURCE_FILE")" == "1" ]] \
    || { echo "Narrow evaluation artifact is missing an exact line: $line" >&2; exit 76; }
done
if grep -Eq 'MES_ENABLE_PLANNING_SERVER_COMMANDS|MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION|MES_REQUIRE_EMPLOYEE_AUTH_GATE' "$SOURCE_FILE"; then
  echo "Narrow start-date evaluation must not enable quantity, slot, read-only or global auth-gate flags." >&2
  exit 76
fi

effective_environment="$(systemctl show "$SERVICE" --property=Environment --value)"
unexpected_react_flags="$(tr ' ' '\n' <<<"$effective_environment" \
  | grep -E '^MES_REACT_[A-Z0-9_]+=1$' \
  | grep -Ev '^(MES_REACT_PLANNING_WORKBENCH|MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION)=1$' || true)"
[[ -z "$unexpected_react_flags" ]] || {
  echo "Another React evaluation is active; deactivate it first." >&2
  printf '%s\n' "$unexpected_react_flags" >&2
  exit 75
}
if tr ' ' '\n' <<<"$effective_environment" | grep -Fxq 'MES_ENABLE_PLANNING_SERVER_COMMANDS=1'; then
  echo "Quantity/slot Planning server commands must be OFF for this narrow evaluation." >&2
  exit 75
fi

request_internal() {
  local path="$1"
  curl --fail --silent --show-error --connect-timeout 2 --max-time 30 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}${path}"
}

assert_v7_parity() {
  /usr/bin/node --input-type=module - "$1" <<'NODE'
const value = JSON.parse(process.argv[2]);
const marker = value?.marker || {};
if (value?.ok !== true || value?.parity?.matches !== true || value?.fallbackReason) throw new Error("full Planning parity failed");
if (marker.observationAvailable !== true
  || marker.snapshotObservationState !== "observed"
  || Number(marker.verifiedContractVersion) !== 7
  || Number(marker.verifiedPrimaryRevision) !== Number(marker.primaryRevision)
  || Number(marker.verifiedSnapshotGeneration) !== Number(marker.snapshotGeneration)
  || Number(marker.snapshotGeneration) <= 0
  || Number(marker.observedSnapshotVersion) <= 0
  || !String(marker.observedSnapshotFingerprint || "")
  || String(marker.verifiedSnapshotFingerprint || "") !== String(marker.observedSnapshotFingerprint || "")) {
  throw new Error("Planning v7 observed-generation marker is not exact");
}
NODE
}

health="$(request_internal /healthz)"
grep -Fq '"status":"ok"' <<<"$health" || { echo "Pilot is not healthy before evaluation." >&2; exit 75; }
baseline_runtime="$(request_internal /)"
for disabled_flag in \
  MES_REACT_PLANNING_WORKBENCH \
  MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION \
  MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION \
  MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY \
  MES_LEGACY_DOMAIN_WRITES_QUIESCED \
  MES_PLANNING_LEGACY_WRITES_QUIESCED; do
  grep -Fq "\"${disabled_flag}\":false" <<<"$baseline_runtime" \
    || { echo "Planning evaluation baseline is not OFF: ${disabled_flag}." >&2; exit 75; }
done
# Force a candidate-v7 full proof now. A v6 marker from the previous release is
# intentionally rejected by the readiness gate below.
parity="$(request_internal '/api/v1/planning/work-orders/parity?refresh-marker=1')"
assert_v7_parity "$parity"

service_user="$(systemctl show "$SERVICE" --property=User --value)"
service_group="$(systemctl show "$SERVICE" --property=Group --value)"
[[ -n "$service_user" && "$service_user" != "root" && -n "$service_group" ]] \
  || { echo "Pilot service must run as a dedicated non-root user before evaluation." >&2; exit 74; }
readiness_unit="mes-planning-start-date-readiness-$$"
systemd-run --quiet --wait --pipe --collect --unit="$readiness_unit" \
  --property="User=${service_user}" --property="Group=${service_group}" \
  --property="EnvironmentFile=/etc/mes/mes-pilot-domain.env" \
  --property="EnvironmentFile=${EMPLOYEE_AUTH_ENV}" \
  --setenv=MES_DOMAIN_STORAGE=postgres \
  --setenv=MES_ENABLE_EMPLOYEE_AUTH=1 \
  --setenv=MES_ENABLE_PLANNING_SERVER_COMMANDS=0 \
  --setenv=MES_ENABLE_PLANNING_START_DATE_COMMANDS=1 \
  /bin/bash -ceu '/usr/bin/node "$1" --require; /usr/bin/node "$2" --require-no-unresolved' bash \
  "${APP_DIR}/scripts/domain-postgres-preflight.mjs" \
  "${APP_DIR}/scripts/planning-workbench-write-rollout-readiness.mjs"

clear_stale_auto_rollback_units() {
  local timer_load_state service_load_state attempt
  systemctl stop "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
  systemctl reset-failed "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
  for attempt in $(seq 1 20); do
    timer_load_state="$(systemctl show "${AUTO_UNIT}.timer" --property=LoadState --value 2>/dev/null || true)"
    service_load_state="$(systemctl show "${AUTO_UNIT}.service" --property=LoadState --value 2>/dev/null || true)"
    if [[ ( -z "$timer_load_state" || "$timer_load_state" == "not-found" ) \
      && ( -z "$service_load_state" || "$service_load_state" == "not-found" ) ]]; then
      return 0
    fi
    sleep 0.1
  done
  echo "A stale Planning auto-rollback unit could not be collected safely." >&2
  return 75
}

arm_auto_rollback() {
  clear_stale_auto_rollback_units
  systemd-run --quiet --collect --unit="$AUTO_UNIT" --on-active=15m \
    --property=Restart=on-failure \
    --property=RestartSec=5s \
    --property=StartLimitIntervalSec=0 \
    /bin/bash "$DEACTIVATE_SCRIPT" --auto >/dev/null
  systemctl is-active --quiet "${AUTO_UNIT}.timer" \
    || { echo "Mandatory Planning evaluation auto-rollback timer was not armed." >&2; return 75; }
  [[ "$(systemctl show "${AUTO_UNIT}.service" --property=Restart --value)" == "on-failure" ]] \
    || { echo "Planning auto-rollback service is not retrying." >&2; return 75; }
}

runtime_is_proven_off() {
  local rollback_health rollback_home
  rollback_health="$(request_internal /healthz 2>/dev/null || true)"
  rollback_home="$(request_internal / 2>/dev/null || true)"
  grep -Fq '"status":"ok"' <<<"$rollback_health" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH":false' <<<"$rollback_home" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION":false' <<<"$rollback_home" \
    && grep -Fq '"MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY":false' <<<"$rollback_home" \
    && grep -Fq '"MES_LEGACY_DOMAIN_WRITES_QUIESCED":false' <<<"$rollback_home" \
    && grep -Fq '"MES_PLANNING_LEGACY_WRITES_QUIESCED":false' <<<"$rollback_home"
}

stop_pilot_fail_closed() {
  systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  if systemctl is-active --quiet "$SERVICE"; then
    systemctl kill --kill-whom=all --signal=KILL "$SERVICE" >/dev/null 2>&1 || true
    systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  fi
  ! systemctl is-active --quiet "$SERVICE"
}

# The permission itself lives under /run, so a reboot removes it. The retrying
# rollback is armed before the permission is installed, closing the SIGKILL and
# power-loss window between enabling writes and scheduling cleanup.
[[ ! -e "$PERSISTENT_DROPIN_FILE" && ! -L "$PERSISTENT_DROPIN_FILE" ]] \
  || { echo "A persistent Planning evaluation permission exists; deactivate it before reactivation." >&2; exit 75; }
for evaluation_root in /etc/systemd/system/${SERVICE}.service.d /run/systemd/system/${SERVICE}.service.d; do
  if [[ -d "$evaluation_root" ]] \
      && find "$evaluation_root" -maxdepth 1 \( -type f -o -type l \) \
        -name '*-evaluation.conf' -print -quit | grep -q .; then
    echo "Another evaluation drop-in is present under ${evaluation_root}; deactivate it first." >&2
    exit 75
  fi
done
[[ ! -e "$DROPIN_FILE" && ! -L "$DROPIN_FILE" ]] \
  || { echo "Planning evaluation permission already exists; deactivate it before reactivation." >&2; exit 75; }
arm_auto_rollback
timer_scheduled=1

configuration_changed=0
completed=0
restore_on_failure() {
  local exit_status=$? permission_removed=0 manager_reloaded=0 runtime_safe=0 attempt
  [[ $completed -eq 1 ]] && return "$exit_status"
  # Do not let a second failure recurse through this EXIT handler. The armed
  # retrying timer remains the final safety net until permission removal,
  # daemon-reload and either public OFF or an inactive Pilot are all proven.
  trap - EXIT
  if [[ $configuration_changed -eq 1 ]]; then
    if rm -f -- "$DROPIN_FILE"; then permission_removed=1; fi
    if [[ $permission_removed -eq 1 ]] && systemctl daemon-reload; then
      manager_reloaded=1
      if systemctl restart "$SERVICE"; then
        for attempt in $(seq 1 20); do
          if runtime_is_proven_off; then runtime_safe=1; break; fi
          sleep 1
        done
      fi
    fi
    if [[ $runtime_safe -ne 1 ]] && stop_pilot_fail_closed; then
      runtime_safe=1
    fi
  else
    permission_removed=1
    manager_reloaded=1
    runtime_safe=1
  fi
  if [[ $timer_scheduled -eq 1 && $permission_removed -eq 1 \
      && $manager_reloaded -eq 1 && $runtime_safe -eq 1 ]]; then
    systemctl stop "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
    systemctl reset-failed "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
  fi
  if [[ $permission_removed -ne 1 || $manager_reloaded -ne 1 || $runtime_safe -ne 1 ]]; then
    echo "CRITICAL: activation rollback could not prove permission removal plus runtime OFF/inactive; the retrying auto-rollback safety net was left armed." >&2
    exit 77
  fi
  return "$exit_status"
}
trap restore_on_failure EXIT

install -d -o root -g root -m 0755 "$DROPIN_DIR"
configuration_changed=1
install -o root -g root -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

ready=0
for _attempt in $(seq 1 20); do
  health="$(request_internal /healthz 2>/dev/null || true)"
  home="$(request_internal / 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH":true' <<<"$home" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION":true' <<<"$home" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION":false' <<<"$home" \
    && grep -Fq '"MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY":true' <<<"$home" \
    && grep -Fq '"MES_LEGACY_DOMAIN_WRITES_QUIESCED":true' <<<"$home" \
    && grep -Fq '"MES_PLANNING_LEGACY_WRITES_QUIESCED":true' <<<"$home" \
    && grep -Fq '"MES_EMPLOYEE_AUTH_AVAILABLE":true' <<<"$home" \
    && grep -Fq '"MES_EMPLOYEE_AUTH_REQUIRED":false' <<<"$home"; then
    ready=1
    break
  fi
  sleep 1
done
[[ $ready -eq 1 ]] || { echo "Narrow Planning start-date evaluation did not become ready." >&2; exit 75; }

parity="$(request_internal '/api/v1/planning/work-orders/parity?refresh-marker=1')"
assert_v7_parity "$parity"

systemctl is-active --quiet "${AUTO_UNIT}.timer" \
  || { echo "Planning permission is ready but its mandatory auto-rollback timer is no longer active." >&2; exit 75; }

completed=1
trap - EXIT
echo "Planning start-date React evaluation is enabled for release ${RELEASE_ID}."
echo "MES_LEGACY_DOMAIN_WRITES_QUIESCED=true: for this 15-minute window all browser legacy domain-value writes are paused system-wide; reads and navigation remain available, domain-backed sharedUi writes are blocked, and only the compatibility-safe ganttDependencyRoutes preference plus the signed React start-date command remain writable."
echo "Open an explicit employee session: /?module=planning&react-planning-workbench-write-evaluation=1"
echo "Auto-rollback is armed for 15 minutes; OFF plus a page refresh restores legacy edits."
