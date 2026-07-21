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
Usage: activate-system-domains-command-surfaces.sh --through=production-structure

Timesheet and Access Control server writes remain intentionally unavailable
until target-scoped employee RBAC and server delta invariants are implemented.
This command never retires the compatibility snapshot.
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
if [[ "$THROUGH" != "production-structure" ]]; then
  echo "Timesheet and Access Control server writes remain disabled until their employee-session RBAC and server delta invariants are implemented." >&2
  exit 1
fi
APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
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
INTERNAL_ORIGIN="http://127.0.0.1:${PORT}"

verify_active_release_contract() {
  local active_target source_target release_path release_id manifest
  [[ -L "$ACTIVE_APP_DIR" ]] || {
    echo "System Domains command activation requires an immutable active release pointer." >&2
    return 1
  }
  active_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
  source_target="$(readlink -f "$APP_DIR" 2>/dev/null || true)"
  release_path="$(dirname "$active_target")"
  release_id="$(basename "$release_path")"
  manifest="${release_path}/release-manifest.json"
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || return 1
  [[ "$active_target" == "${RELEASES_DIR}/${release_id}/app" ]] || return 1
  [[ "$source_target" == "$active_target" && -f "$manifest" ]] || return 1
  local root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs" active_record="${RELEASES_DIR}/active-release.json"
  [[ -f "$root_seal_helper" && -f "$active_record" ]] || return 1
  /usr/bin/node "$root_seal_helper" bundle >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" release --releases-root="$RELEASES_DIR" --release-id="$release_id" --app="$active_target" >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" pointer --pointer="$ACTIVE_APP_DIR" --expected-target="$active_target" >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" artifact --trusted-root="$RELEASES_DIR" --artifact="$active_record" >/dev/null || return 1
  /usr/bin/node --input-type=module -e 'import { readFile } from "node:fs/promises"; const [path, id] = process.argv.slice(1); const record = JSON.parse(await readFile(path, "utf8")); if (record?.releaseId !== id) process.exit(1);' "$active_record" "$release_id" || return 1
  /usr/sbin/runuser -u mes-stage -- /usr/bin/env \
    HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /usr/bin/node "${active_target}/scripts/release-server-command-contract-verify.mjs" \
    --app="$active_target" \
    --manifest="$manifest" \
    --expected-release-id="$release_id" \
    --contract=system-domains --public-only >/dev/null
}

verify_active_release_contract \
  || { echo "Active release provenance or manifest-bound System Domains command-surface contract is invalid." >&2; exit 1; }

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
  "${APP_DIR}/ops/auth/assert-pilot-employee-auth-readiness.sh"
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

assert_employee_auth_readiness() {
  MES_PILOT_APP_DIR="$APP_DIR" MES_PILOT_SERVICE="$SERVICE" MES_PILOT_PORT="$PORT" \
    "${APP_DIR}/ops/auth/assert-pilot-employee-auth-readiness.sh" >/dev/null
}

assert_system_domains_authority_readiness() {
  local consistency
  consistency="$(request_internal_api /api/v1/system-domains/consistency)"
  node -e '
    const value = JSON.parse(process.argv[1]);
    const reconciliation = value?.consistency?.details?.reconciliation?.promotion || {};
    const authority = value?.consistency?.details?.authority?.mode;
    const compatibilityReady = authority === "compatibility-snapshot" && value?.consistency?.matches === true;
    const primaryReady = authority === "postgres-primary" && reconciliation?.retirementEligible === true;
    if (value?.consistency?.ok !== true || reconciliation?.readEligible !== true || (!compatibilityReady && !primaryReady)) process.exit(1);
  ' "$consistency" || {
    echo "System Domains requires either stable compatibility parity or a durable PostgreSQL-primary tombstone before configuring command surfaces." >&2
    exit 1
  }
}

validate_actor_policy
assert_employee_auth_readiness
assert_system_domains_authority_readiness

# The current stage is taken from the running service, not from files on disk.
# A target may be re-run idempotently, but skipped stages are rejected.
pre_capabilities="$(request_internal_api /api/v1/system-domains/capabilities)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const expected = process.argv[2].split(",").filter(Boolean);
  const predecessor = process.argv[3].split(",").filter(Boolean);
  const capability = value?.capabilities || {};
  if (capability.primaryPostgres !== true || capability.schemaReady !== true) process.exit(1);
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
assert_employee_auth_readiness

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
  const consistency = capability.consistency || {};
  if (capability.primaryPostgres !== true
    || capability.schemaReady !== true
    || capability.serverCommandsConfigured !== true
    || capability.actorAuthorization?.policyConfigured !== true
    || consistency?.ok !== true
    || consistency?.details?.reconciliation?.promotion?.readEligible !== true
    || actual.length !== expected.length
    || actual.some((surface, index) => surface !== expected[index])) process.exit(1);
' "$capabilities" "$EXPECTED_CSV" || {
  echo "System Domains command capability did not become ready with exactly the requested surfaces." >&2
  exit 1
}
assert_system_domains_authority_readiness

APPLIED=0
rm -rf "$BACKUP_DIR"
trap - EXIT
echo "System Domains command surfaces are enabled through ${THROUGH}; the existing System Domains authority mode was preserved."
