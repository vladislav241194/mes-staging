#!/usr/bin/env bash
# Stage 1 rollback. Refuses to run until command authority is proven OFF.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/67-employee-auth.conf"
SOURCE_FILE="${APP_DIR}/ops/auth/mes-pilot-employee-auth.conf"
backup_dir="$(mktemp -d /root/.mes-pilot-employee-auth-rollback.XXXXXX)"
had_previous=0
configuration_changed=0
completed=0

request_health() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"; }
request_capabilities() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"; }

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then rm -rf "$backup_dir"; return; fi
  if [[ $had_previous -eq 1 ]]; then cp -a "$backup_dir/previous.conf" "$DROPIN_FILE"; fi
  systemctl daemon-reload
  systemctl restart "$SERVICE" || true
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

pre_capabilities="$(request_capabilities)"
/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.capabilities?.serverCommandsConfigured === true || value.capabilities?.serverCommandsEnabled === true) {
    throw new Error("Deactivate Nomenclature command owner before employee-auth");
  }
' "$pre_capabilities"
if grep -RIl '^Environment=MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1$' "$DROPIN_DIR" 2>/dev/null | grep -q .; then
  echo "A command-owner drop-in remains. Run deactivate-pilot-nomenclature-command-owner.sh first." >&2
  exit 1
fi

if [[ -f "$DROPIN_FILE" ]]; then
  [[ -f "$SOURCE_FILE" ]] || { echo "Current release employee-auth artifact is missing; refusing deletion." >&2; exit 1; }
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" || { echo "Refusing to delete an unrecognized or operator-modified employee-auth drop-in." >&2; exit 1; }
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
  configuration_changed=1
  rm -f "$DROPIN_FILE"
fi
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  health="$(request_health 2>/dev/null || true)"
  service_environment="$(systemctl show "$SERVICE" --property=Environment --value 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" \
    && ! grep -Eq '(^| )MES_ENABLE_EMPLOYEE_AUTH=1( |$)' <<<"$service_environment" \
    && ! grep -Eq '(^| )MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1( |$)' <<<"$service_environment"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Employee-auth did not turn off cleanly; the exact prior auth drop-in will be restored. Commands remain OFF." >&2; exit 1; }
echo "Employee-auth service configuration is disabled. The root-owned secret file and credential hashes were preserved."
