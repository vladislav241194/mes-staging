#!/usr/bin/env bash
# Fail-safe Stage 2 rollback. Command authority is removed before any release rollback.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/68-nomenclature-command-owner.conf"
SOURCE_FILE="${APP_DIR}/ops/auth/mes-pilot-nomenclature-command-owner.conf"
backup_dir="$(mktemp -d /root/.mes-pilot-nomenclature-command-owner-rollback.XXXXXX)"
had_previous=0
command_authority_removed=0
completed=0

request_health() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"; }
request_capabilities() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"; }

report_failure_backup() {
  if [[ $completed -eq 1 ]]; then rm -rf "$backup_dir"; return; fi
  if [[ $command_authority_removed -eq 1 ]]; then
    if [[ $had_previous -eq 1 ]]; then
      echo "Managed command drop-in remains removed, but commands-OFF readiness was not proven. Exact former drop-in backup: $backup_dir/previous.conf" >&2
    else
      echo "Managed command drop-in is absent, but commands-OFF readiness was not proven; no prior managed drop-in existed." >&2
      rm -rf "$backup_dir"
    fi
    # Never automatically restore an enabling writer during rollback failure.
    trap - EXIT
    return
  fi
  rm -rf "$backup_dir"
}
trap report_failure_backup EXIT

other_owners="$(grep -RIl --exclude='68-nomenclature-command-owner.conf' '^Environment=MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1$' "$DROPIN_DIR" 2>/dev/null || true)"
[[ -z "$other_owners" ]] || { echo "Cannot prove commands OFF while another drop-in owns the flag:" >&2; printf '%s\n' "$other_owners" >&2; exit 1; }

if [[ -f "$DROPIN_FILE" ]]; then
  [[ -f "$SOURCE_FILE" ]] || { echo "Current release command-owner artifact is missing; refusing deletion." >&2; exit 1; }
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" || { echo "Refusing to delete an unrecognized or operator-modified command-owner drop-in." >&2; exit 1; }
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
  rm -f "$DROPIN_FILE"
fi
command_authority_removed=1
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  health="$(request_health 2>/dev/null || true)"
  capabilities="$(request_capabilities 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" && /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.ok !== true || value.operatorReadiness !== true) process.exit(1);
    if (value.employeeAuthStorageConfigured !== true || value.employeeAuthSchemaReady !== true) process.exit(1);
    if (value.capabilities?.serverCommandsConfigured === true || value.capabilities?.serverCommandsEnabled === true) process.exit(1);
  ' "$capabilities"; then completed=1; break; fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Commands were removed, but service health/readiness was not confirmed. Do not roll back the release until the current service is healthy." >&2; exit 1; }
rm -rf "$backup_dir"
trap - EXIT
echo "Nomenclature command authority is OFF. It is now safe to deactivate employee-auth or prepare an immutable release rollback."
