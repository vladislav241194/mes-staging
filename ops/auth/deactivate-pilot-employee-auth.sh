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
request_system_domains_capabilities() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/system-domains/capabilities"; }

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
system_domains_capabilities="$(request_system_domains_capabilities)"
/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  const capability = value?.capabilities || {};
  const configured = capability.configuredServerCommandSurfaces || [];
  if (configured.includes("production-structure") || capability.productionStructureWriteEnabled === true) {
    throw new Error("Deactivate System Domains command surfaces before employee-auth");
  }
' "$system_domains_capabilities"
if grep -RIl '^Environment=MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1$' "$DROPIN_DIR" 2>/dev/null | grep -q .; then
  echo "A command-owner drop-in remains. Run deactivate-pilot-nomenclature-command-owner.sh first." >&2
  exit 1
fi
if grep -RIEq '^Environment=MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1$|^Environment=MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=.+$' "$DROPIN_DIR" 2>/dev/null; then
  echo "System Domains command surfaces remain configured. Run deactivate-system-domains-command-surfaces.sh --to=disabled first." >&2
  exit 1
fi
MAIN_PID="$(systemctl show --property=MainPID --value "$SERVICE")"
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ && -r "/proc/${MAIN_PID}/environ" ]] || { echo "Could not prove the running command owners are OFF." >&2; exit 1; }
/usr/bin/node -e '
  const fs = require("node:fs");
  const entries = Object.fromEntries(fs.readFileSync(process.argv[1]).toString("utf8").split("\0").filter(Boolean).map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
  }));
  if (entries.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS === "1"
    || entries.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS === "1"
    || String(entries.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES || "").trim()) process.exit(1);
' "/proc/${MAIN_PID}/environ" || {
  echo "A running command owner still depends on employee-auth. Disable Nomenclature and System Domains command owners first." >&2
  exit 1
}

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
    && ! grep -Eq '(^| )MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1( |$)' <<<"$service_environment" \
    && ! grep -Eq '(^| )MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1( |$)' <<<"$service_environment" \
    && ! grep -Eq '(^| )MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=[^ ]+( |$)' <<<"$service_environment"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Employee-auth did not turn off cleanly; the exact prior auth drop-in will be restored. Commands remain OFF." >&2; exit 1; }
echo "Employee-auth service configuration is disabled. The root-owned secret file and credential hashes were preserved."
