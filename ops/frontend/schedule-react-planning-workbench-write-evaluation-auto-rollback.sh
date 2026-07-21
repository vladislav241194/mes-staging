#!/usr/bin/env bash
# Arm the mandatory 15-minute rollback for the narrow Planning evaluation.
set -euo pipefail
set +x

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

readonly FIXED_HELPER_ROOT="/usr/local/libexec/mes/active-bundle"
readonly LOCK_WRAPPER="${FIXED_HELPER_ROOT}/with-pilot-release-authority-lock.sh"
readonly SEAL_HELPER="${FIXED_HELPER_ROOT}/release-root-seal-verify.mjs"
readonly AUTHORITY_LOCK="/run/lock/mes/mes-authority-rollout.lock"
readonly ACTIVE_POINTER="/srv/mes/pilot/app"
readonly RELEASES_ROOT="/srv/mes/pilot/releases"
readonly AUTO_UNIT="mes-planning-start-date-evaluation-auto-rollback"
readonly SERVICE="mes-pilot"
readonly DROPIN_FILE="/run/systemd/system/${SERVICE}.service.d/87-react-planning-workbench-write-evaluation.conf"
readonly PERSISTENT_DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/87-react-planning-workbench-write-evaluation.conf"

[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 73; }
if [[ "${1:-}" != "--locked" ]]; then
  exec /bin/bash "$LOCK_WRAPPER" \
    --operation=planning-start-date-evaluation-auto-rollback \
    --busy-policy=fail \
    -- /bin/bash "$0" --locked
fi
[[ $# -eq 1 ]] || { echo "Unexpected auto-rollback arguments." >&2; exit 2; }
[[ "${MES_RELEASE_AUTHORITY_LOCK_HELD:-}" == "1" && "${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == "9" \
  && -f "$AUTHORITY_LOCK" && ! -L "$AUTHORITY_LOCK" \
  && "$(stat -Lc '%u:%g:%a:%h' -- "$AUTHORITY_LOCK")" == "0:0:600:1" \
  && -e /proc/$$/fd/9 \
  && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9)" == "$(stat -Lc '%d:%i' -- "$AUTHORITY_LOCK")" ]] \
  || { echo "Auto-rollback scheduling requires the canonical inherited authority lock on fd9." >&2; exit 74; }
authority_inode="$(stat -Lc '%i' -- "$AUTHORITY_LOCK")"
awk -v owner_pid="$$" -v lock_inode="$authority_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":"); if (identity[3] == lock_inode) found = 1
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 || { echo "Auto-rollback scheduler could not prove authority-lock ownership." >&2; exit 74; }
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
readonly DEACTIVATE_SCRIPT="${app_dir}/ops/frontend/deactivate-react-planning-workbench-write-evaluation.sh"
readonly SOURCE_FILE="${app_dir}/ops/frontend/mes-pilot-react-planning-workbench-write-evaluation.conf"
[[ "$(readlink -f -- "$0")" == "${app_dir}/ops/frontend/schedule-react-planning-workbench-write-evaluation-auto-rollback.sh" ]] \
  || { echo "Auto-rollback scheduler must execute from the sealed active release." >&2; exit 74; }
/usr/bin/node "$SEAL_HELPER" artifact --trusted-root="$app_dir" --artifact="$DEACTIVATE_SCRIPT" >/dev/null
/usr/bin/node "$SEAL_HELPER" artifact --trusted-root="$app_dir" --artifact="$SOURCE_FILE" >/dev/null

[[ -f "$DROPIN_FILE" && ! -L "$DROPIN_FILE" \
  && "$(stat -Lc '%u:%g:%a' -- "$DROPIN_FILE")" == "0:0:644" ]] \
  || { echo "The reboot-ephemeral Planning evaluation permission is not installed safely." >&2; exit 75; }
[[ ! -e "$PERSISTENT_DROPIN_FILE" && ! -L "$PERSISTENT_DROPIN_FILE" ]] \
  || { echo "A persistent Planning evaluation permission exists; deactivate it instead of re-arming." >&2; exit 75; }
cmp -s -- "$SOURCE_FILE" "$DROPIN_FILE" \
  || { echo "The active Planning permission does not match this sealed release." >&2; exit 76; }

# A failed/expired transient instance must never make a re-arm look successful.
# Stop and collect both units first, then create a fresh retrying timer/service.
safety_net_removed=0
rearm_complete=0
fail_closed_on_rearm_error() {
  local exit_status=$?
  [[ $rearm_complete -eq 1 ]] && return "$exit_status"
  trap - EXIT
  if [[ $safety_net_removed -eq 1 ]]; then
    echo "Re-arm failed after the former safety net was removed; disabling the write evaluation immediately." >&2
    # The canonical lock is owned by this scheduler PID; a child cannot pass
    # the deactivator's /proc/locks same-PID proof. Release fd9 and its marker,
    # then let the normal wrapper reacquire the same lock for deactivation.
    exec 9>&-
    unset MES_RELEASE_AUTHORITY_LOCK_HELD MES_RELEASE_AUTHORITY_LOCK_FD
    if /bin/bash "$DEACTIVATE_SCRIPT" --auto; then
      return "$exit_status"
    fi
    # The release-anchored deactivator removes the permission before its
    # nonessential parity/auth proofs. If it nevertheless cannot complete,
    # prove there is no live write window before returning a critical failure.
    systemctl stop "$SERVICE" >/dev/null 2>&1 || true
    if systemctl is-active --quiet "$SERVICE"; then
      systemctl kill --kill-whom=all --signal=KILL "$SERVICE" >/dev/null 2>&1 || true
      systemctl stop "$SERVICE" >/dev/null 2>&1 || true
    fi
    if systemctl is-active --quiet "$SERVICE"; then
      echo "CRITICAL: re-arm and deactivation failed, and Pilot could not be stopped." >&2
      exit 77
    fi
    echo "Re-arm failed; the deactivator did not complete, so Pilot remains stopped for operator recovery." >&2
    exit 76
  fi
  return "$exit_status"
}
trap fail_closed_on_rearm_error EXIT
safety_net_removed=1
systemctl stop "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
systemctl reset-failed "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
for _attempt in $(seq 1 20); do
  timer_load_state="$(systemctl show "${AUTO_UNIT}.timer" --property=LoadState --value 2>/dev/null || true)"
  service_load_state="$(systemctl show "${AUTO_UNIT}.service" --property=LoadState --value 2>/dev/null || true)"
  if [[ ( -z "$timer_load_state" || "$timer_load_state" == "not-found" ) \
    && ( -z "$service_load_state" || "$service_load_state" == "not-found" ) ]]; then
    break
  fi
  sleep 0.1
done
[[ ( -z "$timer_load_state" || "$timer_load_state" == "not-found" ) \
  && ( -z "$service_load_state" || "$service_load_state" == "not-found" ) ]] \
  || { echo "Stale Planning auto-rollback units could not be collected." >&2; exit 75; }
systemd-run --quiet --collect --unit="$AUTO_UNIT" --on-active=15m \
  --property=Restart=on-failure \
  --property=RestartSec=5s \
  --property=StartLimitIntervalSec=0 \
  /bin/bash "$DEACTIVATE_SCRIPT" --auto >/dev/null
systemctl is-active --quiet "${AUTO_UNIT}.timer" \
  || { echo "Planning auto-rollback timer was not armed." >&2; exit 75; }
[[ "$(systemctl show "${AUTO_UNIT}.service" --property=Restart --value)" == "on-failure" ]] \
  || { echo "Planning auto-rollback service is not retrying." >&2; exit 75; }
rearm_complete=1
trap - EXIT
echo "Planning start-date evaluation auto-rollback is armed for 15 minutes."
