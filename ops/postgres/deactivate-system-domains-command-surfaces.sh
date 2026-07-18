#!/usr/bin/env bash
# Reversible rollback/downshift for a pre-cutover System Domains rollout.
# It never restores a compatibility payload or changes PostgreSQL authority.
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

usage() {
  cat >&2 <<'EOF'
Usage: deactivate-system-domains-command-surfaces.sh [--to=disabled|production-structure|timesheet]

This rollback is intentionally limited to the compatibility-snapshot phase.
After PostgreSQL-primary cutover it refuses to run: use a separately reviewed
disaster-recovery procedure instead of restoring or stranding legacy data.
EOF
  exit 2
}

TARGET="disabled"
for argument in "$@"; do
  case "$argument" in
    --to=*) TARGET="${argument#--to=}" ;;
    *) usage ;;
  esac
done
case "$TARGET" in disabled|production-structure|timesheet) ;; *) usage ;; esac

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SYNC_TIMER="mes-pilot-domain-snapshot-sync.timer"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
ACTOR_POLICY_FILE="/etc/mes/mes-pilot-system-domains-command-actors.env"
ACTOR_POLICY_DROPIN_FILE="${DROPIN_DIR}/49-system-domains-command-actors.conf"
PRODUCTION_DROPIN_FILE="${DROPIN_DIR}/50-system-domains-production-structure.conf"
TIMESHEET_DROPIN_FILE="${DROPIN_DIR}/61-system-domains-timesheet.conf"
ACCESS_CONTROL_DROPIN_FILE="${DROPIN_DIR}/62-system-domains-access-control.conf"
DROPIN_FILES=("$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE")

case "$TARGET" in
  disabled)
    EXPECTED_CSV=""
    TARGET_SOURCE=""
    TARGET_FILE=""
    ;;
  production-structure)
    EXPECTED_CSV="production-structure"
    TARGET_SOURCE="${APP_DIR}/ops/postgres/mes-pilot-system-domains-production-structure.conf"
    TARGET_FILE="$PRODUCTION_DROPIN_FILE"
    ;;
  timesheet)
    EXPECTED_CSV="production-structure,timesheet"
    TARGET_SOURCE="${APP_DIR}/ops/postgres/mes-pilot-system-domains-timesheet.conf"
    TARGET_FILE="$TIMESHEET_DROPIN_FILE"
    ;;
esac

assert_compatibility_parity() {
  local consistency
  consistency="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/consistency)"
  node -e '
    const value = JSON.parse(process.argv[1]);
    const reconciliation = value?.consistency?.details?.reconciliation?.promotion || {};
    const authority = value?.consistency?.details?.authority?.mode;
    if (value?.consistency?.matches !== true || reconciliation?.readEligible !== true || authority !== "compatibility-snapshot") process.exit(1);
  ' "$consistency" || {
    echo "Refusing command-surface rollback outside stable compatibility-snapshot authority; PostgreSQL-primary requires the separate disaster-recovery procedure." >&2
    exit 1
  }
}

validate_actor_policy() {
  [[ -r "$ACTOR_POLICY_FILE" ]] || { echo "Cannot downshift to a writer surface without the protected actor policy." >&2; exit 1; }
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
}

assert_compatibility_parity
if [[ "$TARGET" != "disabled" ]]; then
  [[ -f "${APP_DIR}/ops/postgres/mes-pilot-system-domains-command-actors.conf" && -f "$TARGET_SOURCE" ]] || {
    echo "Missing rollback artifact in ${APP_DIR}/ops/postgres." >&2
    exit 1
  }
  validate_actor_policy
fi

BACKUP_DIR="$(mktemp -d /root/.mes-system-domains-command-surfaces.XXXXXX)"
APPLIED=0
restore_on_failure() {
  local status=$?
  if [[ "$status" -ne 0 && "$APPLIED" -eq 1 ]]; then
    echo "Command-surface rollback failed; restoring the prior systemd drop-ins." >&2
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
if [[ "$TARGET" != "disabled" ]]; then
  install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-system-domains-command-actors.conf" "$ACTOR_POLICY_DROPIN_FILE"
  install -m 0644 "$TARGET_SOURCE" "$TARGET_FILE"
fi
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
  const expected = process.argv[2];
  if (expected) {
    const username = String(entries.MES_PUBLIC_AUTH_USERNAME || "user").trim();
    const expectedPrincipal = `public:${username}`;
    const actors = String(entries.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (entries.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS !== "1"
      || entries.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES !== expected
      || !/^public:[^,\s]+(?:,public:[^,\s]+)*$/.test(entries.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "")
      || !username
      || !actors.includes(expectedPrincipal)) process.exit(1);
  } else if (entries.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS === "1") process.exit(1);
' "$runtime_environment" "$EXPECTED_CSV" || {
  echo "The running service did not receive the requested rollback command configuration." >&2
  exit 1
}

capabilities="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/capabilities)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const expected = process.argv[2].split(",").filter(Boolean);
  const capability = value?.capabilities || {};
  const actual = capability.configuredServerCommandSurfaces || [];
  if (expected.length === 0) {
    if (capability.serverCommandsConfigured === true || actual.length !== 0) process.exit(1);
  } else if (capability.primaryPostgres !== true
    || capability.serverCommandsConfigured !== true
    || capability.actorAuthorization?.policyConfigured !== true
    || capability.consistency?.matches !== true
    || actual.length !== expected.length
    || actual.some((surface, index) => surface !== expected[index])) process.exit(1);
' "$capabilities" "$EXPECTED_CSV" || {
  echo "System Domains command capability does not match the requested rollback state." >&2
  exit 1
}
assert_compatibility_parity

if [[ "$TARGET" == "disabled" && "${MES_DISABLE_COMPATIBILITY_OUTBOX_ON_ROLLBACK:-0}" == "1" ]]; then
  systemctl disable --now "$SYNC_TIMER" || true
fi
APPLIED=0
rm -rf "$BACKUP_DIR"
trap - EXIT
echo "System Domains command surfaces are now ${TARGET}; no compatibility snapshot data was restored."
