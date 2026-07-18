#!/usr/bin/env bash
# Controlled staged rollout for System Domains server-side command surfaces.
#
# This does not retire the compatibility snapshot. It only swaps a reviewed
# systemd writer configuration after proving exact parity. PostgreSQL-primary
# cutover remains the separate root-only proof/backup/tombstone procedure.
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

usage() {
  cat >&2 <<'EOF'
Usage: activate-system-domains-command-surfaces.sh --through=production-structure|timesheet|access-control [--confirm-staged-rollout]

The only permitted order is disabled → production-structure → timesheet →
access-control. Advancing to timesheet or access-control requires
--confirm-staged-rollout after the preceding live checks are accepted. This
command never retires the compatibility snapshot.
EOF
  exit 2
}

THROUGH=""
CONFIRM_STAGED_ROLLOUT=0
for argument in "$@"; do
  case "$argument" in
    --through=*) THROUGH="${argument#--through=}" ;;
    --confirm-staged-rollout) CONFIRM_STAGED_ROLLOUT=1 ;;
    *) usage ;;
  esac
done
case "$THROUGH" in production-structure|timesheet|access-control) ;; *) usage ;; esac
if [[ "$THROUGH" != "production-structure" && "$CONFIRM_STAGED_ROLLOUT" != "1" ]]; then
  echo "Refusing to skip the staged command-surface acknowledgement. Re-run with --confirm-staged-rollout after accepting the prior live stage." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SYNC_SERVICE="mes-pilot-domain-snapshot-sync.service"
SYNC_TIMER="mes-pilot-domain-snapshot-sync.timer"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
ACTOR_POLICY_FILE="/etc/mes/mes-pilot-system-domains-command-actors.env"
ACTOR_POLICY_DROPIN_FILE="${DROPIN_DIR}/49-system-domains-command-actors.conf"
PRODUCTION_DROPIN_FILE="${DROPIN_DIR}/50-system-domains-production-structure.conf"
LEGACY_PRODUCTION_DROPIN_FILE="${DROPIN_DIR}/60-system-domains-production-structure.conf"
TIMESHEET_DROPIN_FILE="${DROPIN_DIR}/61-system-domains-timesheet.conf"
ACCESS_CONTROL_DROPIN_FILE="${DROPIN_DIR}/62-system-domains-access-control.conf"
# The pre-policy rollout used a 60-* production drop-in. Include it in both
# the backup and removal set so an old file cannot silently broaden a new
# staged rollout through lexical systemd override order.
DROPIN_FILES=("$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$LEGACY_PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE")
INTERNAL_ORIGIN="http://127.0.0.1:4175"

# systemctl reports the unit active before its Node listener has necessarily
# bound the loopback port. A one-shot curl here used to convert that normal
# startup gap into a needless rollback of a valid staged configuration.
# Keep the retry bounded and retain a final verbose request for diagnosis.
request_internal_api() {
  local path="$1" response="" attempt
  for attempt in $(seq 1 12); do
    if systemctl is-active --quiet "$SERVICE" \
      && response="$(curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "${INTERNAL_ORIGIN}${path}" 2>/dev/null)"; then
      printf '%s' "$response"
      return 0
    fi
    sleep 1
  done
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "${INTERNAL_ORIGIN}${path}"
}

case "$THROUGH" in
  production-structure)
    EXPECTED_CSV="production-structure"
    PREDECESSOR_CSV=""
    TARGET_SOURCE="${APP_DIR}/ops/postgres/mes-pilot-system-domains-production-structure.conf"
    TARGET_FILE="$PRODUCTION_DROPIN_FILE"
    ;;
  timesheet)
    EXPECTED_CSV="production-structure,timesheet"
    PREDECESSOR_CSV="production-structure"
    TARGET_SOURCE="${APP_DIR}/ops/postgres/mes-pilot-system-domains-timesheet.conf"
    TARGET_FILE="$TIMESHEET_DROPIN_FILE"
    ;;
  access-control)
    EXPECTED_CSV="production-structure,timesheet,access-control"
    PREDECESSOR_CSV="production-structure,timesheet"
    TARGET_SOURCE="${APP_DIR}/ops/postgres/mes-pilot-system-domains-access-control.conf"
    TARGET_FILE="$ACCESS_CONTROL_DROPIN_FILE"
    ;;
esac

required_files=(
  "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.service"
  "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.timer"
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-command-actors.conf"
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-production-structure.conf"
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-timesheet.conf"
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-access-control.conf"
)
for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || { echo "Missing rollout artifact: $file" >&2; exit 1; }
done

validate_actor_policy() {
  [[ -r "$ACTOR_POLICY_FILE" ]] || {
    echo "Missing protected System Domains actor policy: $ACTOR_POLICY_FILE" >&2
    exit 1
  }
  node -e '
    const fs = require("node:fs");
    const filePath = process.argv[1];
    const stat = fs.statSync(filePath);
    if (stat.uid !== 0 || (stat.mode & 0o077) !== 0) throw new Error("System Domains actor policy must be root-owned and mode 0600");
    const prefix = "MES_SYSTEM_DOMAINS_COMMAND_ACTORS=";
    const entries = fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.startsWith(prefix));
    const value = entries.length === 1 ? entries[0].slice(prefix.length).trim() : "";
    if (!/^public:[^,\s]+(?:,public:[^,\s]+)*$/.test(value)) throw new Error("System Domains actor policy must contain one non-empty comma-separated public:* allowlist");
  ' "$ACTOR_POLICY_FILE"
}

assert_compatibility_parity() {
  local consistency
  consistency="$(request_internal_api /api/v1/system-domains/consistency)"
  node -e '
    const value = JSON.parse(process.argv[1]);
    const reconciliation = value?.consistency?.details?.reconciliation?.promotion || {};
    const authority = value?.consistency?.details?.authority?.mode;
    if (value?.consistency?.matches !== true || reconciliation?.readEligible !== true || authority !== "compatibility-snapshot") process.exit(1);
  ' "$consistency" || {
    echo "System Domains must have stable compatibility parity and compatibility-snapshot authority before advancing a command surface." >&2
    exit 1
  }
}

validate_actor_policy
assert_compatibility_parity

# The current stage is taken from the running service, not from files on disk.
# A target may be re-run idempotently, but skipped stages are rejected.
pre_capabilities="$(request_internal_api /api/v1/system-domains/capabilities)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const expected = process.argv[2].split(",").filter(Boolean);
  const predecessor = process.argv[3].split(",").filter(Boolean);
  const capability = value?.capabilities || {};
  const current = capability.serverCommandsConfigured === true ? (capability.configuredServerCommandSurfaces || []) : [];
  const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
  if (!same(current, expected) && !same(current, predecessor)) process.exit(1);
' "$pre_capabilities" "$EXPECTED_CSV" "$PREDECESSOR_CSV" || {
  echo "Requested stage is not the next permitted command-surface stage for the running service." >&2
  exit 1
}

BACKUP_DIR="$(mktemp -d /root/.mes-system-domains-command-surfaces.XXXXXX)"
APPLIED=0
restore_on_failure() {
  local status=$?
  if [[ "$status" -ne 0 && "$APPLIED" -eq 1 ]]; then
    echo "Command-surface rollout failed; restoring the prior systemd drop-ins." >&2
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
rm -f "$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$LEGACY_PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-system-domains-command-actors.conf" "$ACTOR_POLICY_DROPIN_FILE"
install -m 0644 "$TARGET_SOURCE" "$TARGET_FILE"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.service" "/etc/systemd/system/${SYNC_SERVICE}"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.timer" "/etc/systemd/system/${SYNC_TIMER}"
APPLIED=1
systemctl daemon-reload
systemctl enable --now "$SYNC_TIMER"
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"

# A file-level check is insufficient: prove the actual service process received
# the exact flags and an actor policy after systemd has reloaded it.
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
  echo "The running service did not receive the exact requested System Domains command configuration for its active public principal." >&2
  exit 1
}

capabilities="$(request_internal_api /api/v1/system-domains/capabilities)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const expected = process.argv[2].split(",").filter(Boolean);
  const capability = value?.capabilities || {};
  const actual = capability.configuredServerCommandSurfaces || [];
  if (capability.primaryPostgres !== true
    || capability.serverCommandsConfigured !== true
    || capability.actorAuthorization?.policyConfigured !== true
    || capability.consistency?.matches !== true
    || actual.length !== expected.length
    || actual.some((surface, index) => surface !== expected[index])) process.exit(1);
' "$capabilities" "$EXPECTED_CSV" || {
  echo "System Domains command capability did not become ready with exactly the requested surfaces." >&2
  exit 1
}
assert_compatibility_parity

APPLIED=0
rm -rf "$BACKUP_DIR"
trap - EXIT
echo "System Domains command surfaces are enabled through ${THROUGH}; compatibility snapshot remains authoritative until the separate PostgreSQL-primary retirement procedure."
