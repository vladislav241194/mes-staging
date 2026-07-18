#!/usr/bin/env bash
# Explicit recovery of command surfaces after an already-completed
# PostgreSQL-primary cutover. This never restores a compatibility snapshot.
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
ACTOR_POLICY_FILE="/etc/mes/mes-pilot-system-domains-command-actors.env"
ACTOR_POLICY_DROPIN_FILE="${DROPIN_DIR}/49-system-domains-command-actors.conf"
PRODUCTION_DROPIN_FILE="${DROPIN_DIR}/50-system-domains-production-structure.conf"
TIMESHEET_DROPIN_FILE="${DROPIN_DIR}/61-system-domains-timesheet.conf"
ACCESS_CONTROL_DROPIN_FILE="${DROPIN_DIR}/62-system-domains-access-control.conf"
DROPIN_FILES=("$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE")
EXPECTED_CSV="production-structure,timesheet,access-control"

for file in \
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-command-actors.conf" \
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-access-control.conf"; do
  [[ -f "$file" ]] || { echo "Missing recovery artifact: $file" >&2; exit 1; }
done
[[ -r "$ACTOR_POLICY_FILE" ]] || { echo "Missing protected System Domains actor policy: $ACTOR_POLICY_FILE" >&2; exit 1; }
node -e '
  const fs = require("node:fs");
  const stat = fs.statSync(process.argv[1]);
  if (stat.uid !== 0 || (stat.mode & 0o077) !== 0) throw new Error("System Domains actor policy must be root-owned and mode 0600");
  const prefix = "MES_SYSTEM_DOMAINS_COMMAND_ACTORS=";
  const entries = fs.readFileSync(process.argv[1], "utf8").split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.startsWith(prefix));
  const value = entries.length === 1 ? entries[0].slice(prefix.length).trim() : "";
  if (!/^public:[^,\s]+(?:,public:[^,\s]+)*$/.test(value)) throw new Error("System Domains actor policy must contain one non-empty comma-separated public:* allowlist");
' "$ACTOR_POLICY_FILE"

# This is deliberately the inverse authority check of the pre-cutover scripts:
# recovery is permitted only when a durable PostgreSQL-primary tombstone proof
# is already readable. It must never be used to force a new cutover.
consistency="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/consistency)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const reconciliation = value?.consistency?.details?.reconciliation?.promotion || {};
  if (value?.consistency?.ok !== true
    || value?.consistency?.details?.authority?.mode !== "postgres-primary"
    || reconciliation?.readEligible !== true
    || reconciliation?.retirementEligible !== true) process.exit(1);
' "$consistency" || {
  echo "Refusing primary command-surface recovery without a durable PostgreSQL-primary tombstone proof." >&2
  exit 1
}

BACKUP_DIR="$(mktemp -d /root/.mes-system-domains-primary-recovery.XXXXXX)"
APPLIED=0
restore_on_failure() {
  local status=$?
  if [[ "$status" -ne 0 && "$APPLIED" -eq 1 ]]; then
    echo "Primary command-surface recovery failed; restoring prior systemd drop-ins." >&2
    for file in "${DROPIN_FILES[@]}"; do
      local name
      name="$(basename "$file")"
      rm -f "$file"
      [[ -f "${BACKUP_DIR}/${name}" ]] && install -m 0644 "${BACKUP_DIR}/${name}" "$file"
    done
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  rm -rf "$BACKUP_DIR"
  return "$status"
}
trap restore_on_failure EXIT
for file in "${DROPIN_FILES[@]}"; do
  [[ -f "$file" ]] && install -m 0644 "$file" "${BACKUP_DIR}/$(basename "$file")"
done

install -d -m 0755 "$DROPIN_DIR"
rm -f "$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-system-domains-command-actors.conf" "$ACTOR_POLICY_DROPIN_FILE"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-system-domains-access-control.conf" "$ACCESS_CONTROL_DROPIN_FILE"
APPLIED=1
systemctl daemon-reload
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"

MAIN_PID="$(systemctl show --property=MainPID --value "$SERVICE")"
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ ]] || { echo "Could not determine the running ${SERVICE} MainPID." >&2; exit 1; }
runtime_environment="$(tr '\0' '\n' < "/proc/${MAIN_PID}/environ")"
node -e '
  const entries = Object.fromEntries(process.argv[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
  }));
  const username = String(entries.MES_PUBLIC_AUTH_USERNAME || "user").trim();
  const expectedPrincipal = `public:${username}`;
  const actors = String(entries.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (entries.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS !== "1"
    || entries.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES !== process.argv[2]
    || !/^public:[^,\s]+(?:,public:[^,\s]+)*$/.test(entries.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "")
    || !username
    || !actors.includes(expectedPrincipal)) process.exit(1);
' "$runtime_environment" "$EXPECTED_CSV" || {
  echo "The running service did not receive the complete PostgreSQL-primary System Domains command configuration for its active public principal." >&2
  exit 1
}

capabilities="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/capabilities)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const expected = process.argv[2].split(",");
  const capability = value?.capabilities || {};
  const actual = capability.configuredServerCommandSurfaces || [];
  if (capability.primaryPostgres !== true
    || capability.serverCommandsConfigured !== true
    || capability.actorAuthorization?.policyConfigured !== true
    || capability.consistency?.details?.authority?.mode !== "postgres-primary"
    || actual.length !== expected.length
    || actual.some((surface, index) => surface !== expected[index])) process.exit(1);
' "$capabilities" "$EXPECTED_CSV" || {
  echo "PostgreSQL-primary command capability did not return with all required surfaces." >&2
  exit 1
}

post_consistency="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/consistency)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const reconciliation = value?.consistency?.details?.reconciliation?.promotion || {};
  if (value?.consistency?.ok !== true
    || value?.consistency?.details?.authority?.mode !== "postgres-primary"
    || reconciliation?.readEligible !== true
    || reconciliation?.retirementEligible !== true) process.exit(1);
' "$post_consistency" || { echo "PostgreSQL-primary authority proof was not preserved during command-surface recovery." >&2; exit 1; }

APPLIED=0
rm -rf "$BACKUP_DIR"
trap - EXIT
echo "All PostgreSQL-primary System Domains command surfaces are recovered; the retired compatibility snapshot remains untouched."
