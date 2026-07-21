#!/usr/bin/env bash
# Stage 2: back up shared-state, then enable the authenticated server command owner.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SERVICE_USER="${MES_PILOT_SERVICE_USER:-deploy}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/68-nomenclature-command-owner.conf"
SOURCE_FILE="${APP_DIR}/ops/auth/mes-pilot-nomenclature-command-owner.conf"
backup_dir="$(mktemp -d /root/.mes-pilot-nomenclature-command-owner.XXXXXX)"
had_previous=0
configuration_changed=0
completed=0

request_health() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"; }
request_capabilities() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"; }
request_command_denial() {
  curl --silent --show-error --connect-timeout 2 --max-time 5 \
    -X POST \
    -H 'Host: mes-internal' \
    -H 'Content-Type: application/json' \
    -H 'Sec-Fetch-Site: same-origin' \
    -H 'Origin: http://mes-internal' \
    -H 'Idempotency-Key: root-readiness-denial-probe' \
    -H 'If-Match: "0"' \
    --data '{}' \
    "http://127.0.0.1:${PORT}/api/v1/nomenclature"
}

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then rm -rf "$backup_dir"; return; fi
  if [[ $had_previous -eq 1 ]]; then cp -a "$backup_dir/previous.conf" "$DROPIN_FILE"; else rm -f "$DROPIN_FILE"; fi
  systemctl daemon-reload
  systemctl restart "$SERVICE" || true
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

[[ -f "$SOURCE_FILE" ]] || { echo "Missing command-owner drop-in artifact." >&2; exit 1; }
pre_capabilities="$(request_capabilities)"
/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.operatorReadiness !== true || value.employeeAuthConfigured !== true || value.employeeAuthSchemaReady !== true) throw new Error("Employee-auth Stage 1 is not ready");
  if (value.capabilities?.serverCommandsConfigured === true) throw new Error("Nomenclature command owner is already configured");
' "$pre_capabilities"

other_owners="$(grep -RIl --exclude='68-nomenclature-command-owner.conf' '^Environment=MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1$' "$DROPIN_DIR" 2>/dev/null || true)"
[[ -z "$other_owners" ]] || { echo "Another drop-in owns Nomenclature commands; refusing ambiguous activation." >&2; printf '%s\n' "$other_owners" >&2; exit 1; }

backup_output="$(/usr/sbin/runuser -u "$SERVICE_USER" -- env \
  APP_ENV=pilot \
  MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state \
  MES_BACKUP_DIR=/srv/mes/pilot/backups \
  MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log \
  /usr/bin/node "$APP_DIR/scripts/backup-shared-state.mjs" \
    --reason=before-nomenclature-command-owner-enable --actor=root-rollout)"
grep -Fq 'Shared state backup created:' <<<"$backup_output" || { echo "Shared-state backup was not confirmed; commands remain off." >&2; exit 1; }
printf '%s\n' "$backup_output"

install -d -m 0755 "$DROPIN_DIR"
if [[ -f "$DROPIN_FILE" ]]; then
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" || { echo "Refusing to overwrite an unrecognized command-owner drop-in." >&2; exit 1; }
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
  command_denial="$(request_command_denial 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" && /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.operatorReadiness !== true || value.employeeAuthConfigured !== true || value.employeeAuthSchemaReady !== true) process.exit(1);
    if (value.capabilities?.serverCommandsConfigured !== true || value.capabilities?.serverCommandsEnabled !== false) process.exit(1);
  ' "$capabilities" && /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.ok !== false || !["nomenclature-write-forbidden", "employee-principal-required"].includes(value.code)) process.exit(1);
  ' "$command_denial"; then completed=1; break; fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Command owner did not become ready; the exact prior drop-in will be restored with commands OFF." >&2; exit 1; }
echo "Nomenclature server command owner is configured; live writes still require a signed employee session and current RBAC."
