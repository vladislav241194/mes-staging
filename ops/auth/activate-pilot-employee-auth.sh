#!/usr/bin/env bash
# Stage 1: enable employee sessions while Nomenclature commands remain OFF.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/67-employee-auth.conf"
SOURCE_FILE="${APP_DIR}/ops/auth/mes-pilot-employee-auth.conf"
ENV_FILE="/etc/mes/mes-pilot-employee-auth.env"
backup_dir="$(mktemp -d /root/.mes-pilot-employee-auth-activation.XXXXXX)"
had_previous=0
configuration_changed=0
completed=0

request_health() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"; }
request_capabilities() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"; }

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then rm -rf "$backup_dir"; return; fi
  if [[ $had_previous -eq 1 ]]; then cp -a "$backup_dir/previous.conf" "$DROPIN_FILE"; else rm -f "$DROPIN_FILE"; fi
  systemctl daemon-reload
  systemctl restart "$SERVICE" || true
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

[[ -f "$SOURCE_FILE" ]] || { echo "Missing employee-auth drop-in artifact." >&2; exit 1; }
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { echo "Install the root-owned employee-auth env first." >&2; exit 1; }
[[ "$(stat -c '%u:%g:%a' "$ENV_FILE")" == "0:0:600" ]] || { echo "Employee-auth env must be root:root 0600." >&2; exit 1; }

pre_capabilities="$(request_capabilities)"
/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.operatorReadiness !== true || value.employeeAuthSchemaReady !== true) throw new Error("Migration 027 or foundation readiness is missing");
  if (value.capabilities?.serverCommandsConfigured === true) throw new Error("Nomenclature commands must remain off during Stage 1");
' "$pre_capabilities"

install -d -m 0755 "$DROPIN_DIR"
if [[ -f "$DROPIN_FILE" ]]; then
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" || { echo "Refusing to overwrite an unrecognized employee-auth drop-in." >&2; exit 1; }
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
fi
configuration_changed=1
install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  health="$(request_health 2>/dev/null || true)"
  capabilities="$(request_capabilities 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" && /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.operatorReadiness !== true || value.employeeAuthConfigured !== true || value.employeeAuthSchemaReady !== true) process.exit(1);
    if (value.capabilities?.serverCommandsConfigured === true || value.capabilities?.serverCommandsEnabled === true) process.exit(1);
  ' "$capabilities"; then completed=1; break; fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Employee-auth Stage 1 did not become ready; the exact prior drop-in will be restored." >&2; exit 1; }
echo "Pilot employee authentication is enabled; Nomenclature server commands remain disabled."
