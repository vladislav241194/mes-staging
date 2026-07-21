#!/usr/bin/env bash
# Disable the narrow Planning start-date evaluation and prove compatibility.
set -euo pipefail
set +x

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

readonly FIXED_HELPER_ROOT="/usr/local/libexec/mes/active-bundle"
readonly LOCK_WRAPPER="${FIXED_HELPER_ROOT}/with-pilot-release-authority-lock.sh"
readonly SEAL_HELPER="${FIXED_HELPER_ROOT}/release-root-seal-verify.mjs"
readonly AUTHORITY_LOCK="/run/lock/mes/mes-authority-rollout.lock"
readonly RELEASES_ROOT="/srv/mes/pilot/releases"
readonly SERVICE="mes-pilot"
readonly PORT="4175"
readonly DROPIN_FILE="/run/systemd/system/${SERVICE}.service.d/87-react-planning-workbench-write-evaluation.conf"
readonly PERSISTENT_DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/87-react-planning-workbench-write-evaluation.conf"
readonly EMPLOYEE_AUTH_ENV="/etc/mes/mes-pilot-employee-auth.env"
readonly AUTO_UNIT="mes-planning-start-date-evaluation-auto-rollback"

[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 73; }
if [[ "${1:-}" != "--locked" ]]; then
  auto_mode=0
  if [[ "${1:-}" == "--auto" && $# -eq 1 ]]; then
    auto_mode=1
  elif [[ $# -ne 0 ]]; then
    echo "Unexpected deactivation arguments." >&2
    exit 2
  fi
  wrapped_arguments=(--locked)
  [[ $auto_mode -eq 0 ]] || wrapped_arguments+=(--auto)
  exec /bin/bash "$LOCK_WRAPPER" \
    --operation=planning-start-date-evaluation-deactivate \
    --busy-policy=fail \
    -- /bin/bash "$0" "${wrapped_arguments[@]}"
fi
shift
auto_mode=0
if [[ "${1:-}" == "--auto" ]]; then
  auto_mode=1
  shift
fi
[[ $# -eq 0 ]] || { echo "Unexpected deactivation arguments." >&2; exit 2; }

[[ "${MES_RELEASE_AUTHORITY_LOCK_HELD:-}" == "1" && "${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == "9" \
  && -f "$AUTHORITY_LOCK" && ! -L "$AUTHORITY_LOCK" \
  && "$(readlink -f -- "$AUTHORITY_LOCK")" == "$AUTHORITY_LOCK" \
  && "$(stat -Lc '%u:%g:%a:%h' -- "$AUTHORITY_LOCK")" == "0:0:600:1" \
  && -e /proc/$$/fd/9 \
  && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9)" == "$(stat -Lc '%d:%i' -- "$AUTHORITY_LOCK")" ]] \
  || { echo "Planning deactivation requires the canonical inherited authority lock on fd9." >&2; exit 74; }
authority_inode="$(stat -Lc '%i' -- "$AUTHORITY_LOCK")"
awk -v owner_pid="$$" -v lock_inode="$authority_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":"); if (identity[3] == lock_inode) found = 1
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || { echo "Planning deactivation could not prove authority-lock ownership." >&2; exit 74; }

request_internal() {
  local path="$1"
  curl --fail --silent --show-error --connect-timeout 2 --max-time 30 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}${path}"
}

stop_pilot_fail_closed() {
  systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  if systemctl is-active --quiet "$SERVICE"; then
    systemctl kill --kill-whom=all --signal=KILL "$SERVICE" >/dev/null 2>&1 || true
    systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  fi
  ! systemctl is-active --quiet "$SERVICE"
}

expected_dropin_content="$(printf '%s\n' \
  '[Service]' \
  'EnvironmentFile=/etc/mes/mes-pilot-employee-auth.env' \
  'Environment=MES_DOMAIN_STORAGE=postgres' \
  'Environment=MES_ENABLE_EMPLOYEE_AUTH=1' \
  'Environment=MES_ENABLE_PLANNING_START_DATE_COMMANDS=1' \
  'Environment=MES_REACT_PLANNING_WORKBENCH=1' \
  'Environment=MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION=1')"
forensic_paths=()
permission_removed=0
permission_mismatch=0
completed=0
report_failure() {
  local exit_status=$?
  if [[ $completed -eq 1 ]]; then
    return "$exit_status"
  fi
  if [[ $permission_removed -eq 1 ]]; then
    echo "The bounded write permission remains disabled. Quarantined former artifacts (if any) must not be restored:" >&2
    printf '  %s\n' "${forensic_paths[@]}" >&2
    trap - EXIT
  fi
  return "$exit_status"
}
trap report_failure EXIT

# Permission removal is the first action after proving uid 0 and the canonical
# authority lock. Neither a rotated auth file, a stale release seal nor a
# readiness outage may keep the 15-minute write window open. Rename the exact
# bounded paths without following symlinks; an unexpected artifact is still
# removed from systemd's *.conf namespace and preserved for forensics.
quarantine_stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
dropin_index=0
for candidate_dropin in "$DROPIN_FILE" "$PERSISTENT_DROPIN_FILE"; do
  [[ -e "$candidate_dropin" || -L "$candidate_dropin" ]] || continue
  dropin_parent="$(dirname -- "$candidate_dropin")"
  if [[ ! -d "$dropin_parent" || -L "$dropin_parent" \
      || "$(readlink -f -- "$dropin_parent")" != "$dropin_parent" \
      || "$(stat -Lc '%u:%g' -- "$dropin_parent")" != "0:0" ]] \
      || find "$dropin_parent" -maxdepth 0 -perm /022 -print -quit | grep -q .; then
    stop_pilot_fail_closed \
      || { echo "CRITICAL: Pilot could not be stopped after an unsafe permission parent was detected." >&2; exit 77; }
    echo "Planning permission parent is unsafe; Pilot was stopped fail-closed: ${dropin_parent}" >&2
    exit 76
  fi
  known_permission=0
  if [[ -f "$candidate_dropin" && ! -L "$candidate_dropin" \
      && "$(stat -Lc '%u:%g:%a' -- "$candidate_dropin")" == "0:0:644" \
      && "$(cat -- "$candidate_dropin")" == "$expected_dropin_content" ]]; then
    known_permission=1
  else
    permission_mismatch=1
  fi
  quarantined_path="${candidate_dropin}.disabled-${quarantine_stamp}-${dropin_index}"
  [[ ! -e "$quarantined_path" && ! -L "$quarantined_path" ]] \
    || { stop_pilot_fail_closed || { echo "CRITICAL: Pilot could not be stopped after a quarantine collision." >&2; exit 77; }; echo "Planning quarantine target already exists; Pilot was stopped fail-closed." >&2; exit 76; }
  mv -T -- "$candidate_dropin" "$quarantined_path" \
    || { stop_pilot_fail_closed || { echo "CRITICAL: Pilot could not be stopped after quarantine failed." >&2; exit 77; }; echo "Planning permission could not be quarantined; Pilot was stopped fail-closed." >&2; exit 76; }
  forensic_paths+=("$quarantined_path")
  permission_removed=1
  dropin_index=$((dropin_index + 1))
  [[ $known_permission -eq 1 ]] || echo "Unexpected Planning permission was quarantined fail-closed: ${quarantined_path}" >&2
done
systemctl stop "${AUTO_UNIT}.timer" >/dev/null 2>&1 || true
if [[ $auto_mode -eq 0 ]]; then
  systemctl stop "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
  systemctl reset-failed "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service" >/dev/null 2>&1 || true
fi
restart_required=$permission_removed
if [[ $restart_required -eq 0 ]]; then
  current_health="$(request_internal /healthz 2>/dev/null || true)"
  current_home="$(request_internal / 2>/dev/null || true)"
  if ! grep -Fq '"status":"ok"' <<<"$current_health" \
      || ! grep -Fq '"MES_REACT_PLANNING_WORKBENCH":false' <<<"$current_home" \
      || ! grep -Fq '"MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION":false' <<<"$current_home" \
      || ! grep -Fq '"MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY":false' <<<"$current_home" \
      || ! grep -Fq '"MES_LEGACY_DOMAIN_WRITES_QUIESCED":false' <<<"$current_home" \
      || ! grep -Fq '"MES_PLANNING_LEGACY_WRITES_QUIESCED":false' <<<"$current_home"; then
    restart_required=1
  fi
fi
if [[ $restart_required -eq 1 ]]; then
  systemctl daemon-reload
  if ! systemctl restart "$SERVICE"; then
    stop_pilot_fail_closed \
      || { echo "CRITICAL: Pilot restart failed and the old runtime could not be stopped." >&2; exit 77; }
    echo "Planning permission was quarantined, but Pilot could not restart OFF and remains stopped." >&2
    exit 75
  fi
fi

off=0
for _attempt in $(seq 1 20); do
  health="$(request_internal /healthz 2>/dev/null || true)"
  home="$(request_internal / 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH":false' <<<"$home" \
    && grep -Fq '"MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION":false' <<<"$home" \
    && grep -Fq '"MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY":false' <<<"$home" \
    && grep -Fq '"MES_LEGACY_DOMAIN_WRITES_QUIESCED":false' <<<"$home" \
    && grep -Fq '"MES_PLANNING_LEGACY_WRITES_QUIESCED":false' <<<"$home"; then
    off=1
    break
  fi
  sleep 1
done
if [[ $off -ne 1 ]]; then
  stop_pilot_fail_closed \
    || { echo "CRITICAL: runtime OFF was unproved and Pilot could not be stopped." >&2; exit 77; }
  echo "Planning permission was quarantined, but runtime OFF was not proven; Pilot remains stopped." >&2
  exit 75
fi
[[ $permission_mismatch -eq 0 ]] \
  || { echo "Runtime is OFF, but an unexpected permission artifact requires forensic review." >&2; exit 76; }

# Compatibility/parity proof starts only after the runtime is demonstrably OFF.
/usr/bin/node "$SEAL_HELPER" bundle >/dev/null
script_path="$(readlink -f -- "$0")"
app_dir="$(dirname -- "$(dirname -- "$(dirname -- "$script_path")")")"
release_path="$(dirname -- "$app_dir")"
release_id="$(basename -- "$release_path")"
[[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ && "$app_dir" == "${RELEASES_ROOT}/${release_id}/app" ]] \
  || { echo "Planning deactivation is not executing from an immutable release app." >&2; exit 74; }
/usr/bin/node "$SEAL_HELPER" release \
  --releases-root="$RELEASES_ROOT" --release-id="$release_id" --app="$app_dir" >/dev/null
readonly APP_DIR="$app_dir"
readonly SOURCE_FILE="${APP_DIR}/ops/frontend/mes-pilot-react-planning-workbench-write-evaluation.conf"
[[ "$(readlink -f -- "$0")" == "${APP_DIR}/ops/frontend/deactivate-react-planning-workbench-write-evaluation.sh" ]] \
  || { echo "Deactivation must execute from its sealed immutable release." >&2; exit 74; }
for artifact in "$SOURCE_FILE" \
  "${APP_DIR}/scripts/planning-workbench-write-rollout-readiness.mjs"; do
  /usr/bin/node "$SEAL_HELPER" artifact --trusted-root="$APP_DIR" --artifact="$artifact" >/dev/null
done
[[ "$(cat -- "$SOURCE_FILE")" == "$expected_dropin_content" ]] \
  || { echo "Sealed Planning permission source does not match the fail-safe contract." >&2; exit 76; }
[[ -f "$EMPLOYEE_AUTH_ENV" && ! -L "$EMPLOYEE_AUTH_ENV" \
  && "$(readlink -f -- "$EMPLOYEE_AUTH_ENV")" == "$EMPLOYEE_AUTH_ENV" \
  && "$(stat -Lc '%u:%g:%a:%h' -- "$EMPLOYEE_AUTH_ENV")" == "0:0:600:1" ]] \
  || { echo "Employee-auth environment is unavailable after permission removal; runtime remains OFF." >&2; exit 74; }

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

# The owner flags are checked before auth/repository construction. These
# internal, unsigned probes therefore prove that old signed browser sessions
# cannot keep any Planning PATCH route alive after deactivation.
assert_patch_off() {
  local path="$1" body="$2" expected_code="$3" response http_status
  response="$(mktemp /tmp/mes-planning-off.XXXXXX)"
  http_status="$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
    --connect-timeout 2 --max-time 10 \
    -H 'Host: mes-internal' -H 'Origin: http://mes-internal' \
    -H 'Sec-Fetch-Site: same-origin' -H 'Content-Type: application/json' \
    --request PATCH --data "$body" "http://127.0.0.1:${PORT}${path}")"
  [[ "$http_status" == "503" ]] \
    && /usr/bin/node -e 'const value=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(value.code!==process.argv[2]) process.exit(1)' "$response" "$expected_code" \
    || { rm -f -- "$response"; echo "Planning PATCH owner OFF proof failed for $path." >&2; exit 75; }
  rm -f -- "$response"
}
assert_patch_off '/api/v1/planning/work-orders/rollout-proof' '{"quantity":1,"expectedRevision":1}' 'planning-command-owner-disabled'
assert_patch_off '/api/v1/planning/work-orders/rollout-proof/operations/operation-proof/slot' '{"plannedStart":"2026-07-21T08:00:00.000Z","expectedRevision":1}' 'planning-command-owner-disabled'
assert_patch_off '/api/v1/planning/work-orders/rollout-proof/start-date' '{"planningStartDate":"2026-07-21","expectedRevision":1}' 'planning-start-date-owner-disabled'

# Writes are now quiesced. Drain the compatibility outbox, then generate a
# fresh v7 observed-generation proof against the exact post-drain snapshot.
systemctl start mes-pilot-domain-snapshot-sync.service
systemctl is-failed --quiet mes-pilot-domain-snapshot-sync.service \
  && { echo "Planning compatibility snapshot sync failed." >&2; exit 75; }
parity="$(request_internal '/api/v1/planning/work-orders/parity?refresh-marker=1')"
assert_v7_parity "$parity"

service_user="$(systemctl show "$SERVICE" --property=User --value)"
service_group="$(systemctl show "$SERVICE" --property=Group --value)"
[[ -n "$service_user" && "$service_user" != "root" && -n "$service_group" ]] \
  || { echo "Pilot service must run as a dedicated non-root user." >&2; exit 74; }
readiness_unit="mes-planning-start-date-off-readiness-$$"
systemd-run --quiet --wait --pipe --collect --unit="$readiness_unit" \
  --property="User=${service_user}" --property="Group=${service_group}" \
  --property="EnvironmentFile=/etc/mes/mes-pilot-domain.env" \
  --property="EnvironmentFile=${EMPLOYEE_AUTH_ENV}" \
  --setenv=MES_DOMAIN_STORAGE=postgres \
  --setenv=MES_ENABLE_EMPLOYEE_AUTH=1 \
  --setenv=MES_ENABLE_PLANNING_SERVER_COMMANDS=0 \
  --setenv=MES_ENABLE_PLANNING_START_DATE_COMMANDS=1 \
  /usr/bin/node "${APP_DIR}/scripts/planning-workbench-write-rollout-readiness.mjs" --require-no-unresolved

completed=1
for quarantined_path in "${forensic_paths[@]}"; do
  rm -f -- "$quarantined_path"
done
trap - EXIT
echo "Planning start-date React evaluation is OFF; quantity, slot and start-date server writes are disabled."
echo "MES_LEGACY_DOMAIN_WRITES_QUIESCED=false: browser legacy domain-value edits and domain-backed sharedUi writes are restored system-wide; refresh already-open Pilot tabs before editing."
echo "PostgreSQL/snapshot parity and a clean Planning outbox are proven at v7."
echo "Before approving a release rollback, an operator must still open the previous immutable release UI and verify the changed start date there."
