#!/usr/bin/env bash
# Reversible rollback/downshift for System Domains command ownership. Disabling
# writers is also permitted under a durable PostgreSQL-primary tombstone so a
# newer immutable release can be activated safely. It never restores a
# compatibility payload or changes PostgreSQL authority.
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

usage() {
  cat >&2 <<'EOF'
Usage: deactivate-system-domains-command-surfaces.sh [--to=disabled|production-structure|timesheet]

Partial downshift is limited to compatibility-snapshot authority. --to=disabled
is also a reversible PostgreSQL-primary writer suspension: it preserves the
durable tombstone and can be followed by the reviewed primary recovery script.
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

SCRIPT_APP_DIR="$(readlink -f "$(dirname "${BASH_SOURCE[0]}")/../..")"
APP_DIR="${MES_PILOT_APP_DIR:-$SCRIPT_APP_DIR}"
if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SYNC_TIMER="mes-pilot-domain-snapshot-sync.timer"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
ACTOR_POLICY_FILE="/etc/mes/mes-pilot-system-domains-command-actors.env"
ACTOR_POLICY_DROPIN_FILE="${DROPIN_DIR}/49-system-domains-command-actors.conf"
PRODUCTION_DROPIN_FILE="${DROPIN_DIR}/50-system-domains-production-structure.conf"
LEGACY_PRODUCTION_DROPIN_FILE="${DROPIN_DIR}/60-system-domains-production-structure.conf"
TIMESHEET_DROPIN_FILE="${DROPIN_DIR}/61-system-domains-timesheet.conf"
ACCESS_CONTROL_DROPIN_FILE="${DROPIN_DIR}/62-system-domains-access-control.conf"
# A pre-policy 60-* drop-in may still be present on a pilot upgraded in place.
# Treat it as managed state so a downshift cannot leave a higher legacy surface
# effective after the reviewed files are removed.
DROPIN_FILES=("$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$LEGACY_PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE")
INTERNAL_ORIGIN="http://127.0.0.1:4175"

verify_active_release_contract() {
  local active_target source_target release_path release_id active_release_id manifest
  [[ -L "$ACTIVE_APP_DIR" ]] || return 1
  active_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
  source_target="$(readlink -f "$APP_DIR" 2>/dev/null || true)"
  release_path="$(dirname "$source_target")"
  release_id="$(basename "$release_path")"
  active_release_id="$(basename "$(dirname "$active_target")")"
  manifest="${release_path}/release-manifest.json"
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || return 1
  [[ "$source_target" == "${RELEASES_DIR}/${release_id}/app" ]] || return 1
  [[ "$active_target" == "${RELEASES_DIR}/${active_release_id}/app" ]] || return 1
  [[ -f "$manifest" ]] || return 1
  local root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs" active_record="${RELEASES_DIR}/active-release.json"
  [[ -f "$root_seal_helper" && -f "$active_record" ]] || return 1
  /usr/bin/node "$root_seal_helper" bundle >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" release --releases-root="$RELEASES_DIR" --release-id="$active_release_id" --app="$active_target" >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" pointer --pointer="$ACTIVE_APP_DIR" --expected-target="$active_target" >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" artifact --trusted-root="$RELEASES_DIR" --artifact="$active_record" >/dev/null || return 1
  /usr/bin/node --input-type=module -e 'import { readFile } from "node:fs/promises"; const [path, id] = process.argv.slice(1); const record = JSON.parse(await readFile(path, "utf8")); if (record?.releaseId !== id) process.exit(1);' "$active_record" "$active_release_id" || return 1
  /usr/bin/node "$root_seal_helper" release --releases-root="$RELEASES_DIR" --release-id="$release_id" --app="$source_target" >/dev/null || return 1
  /usr/sbin/runuser -u mes-stage -- /usr/bin/env \
    HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /usr/bin/node "${source_target}/scripts/release-server-command-contract-verify.mjs" \
    --app="$source_target" --manifest="$manifest" \
    --expected-release-id="$release_id" --contract=system-domains --public-only >/dev/null
}

verify_active_release_contract \
  || { echo "Operator release provenance or manifest-bound System Domains command-surface contract is invalid." >&2; exit 1; }

# Restart completion precedes listener readiness. Retry the loopback proof so
# a healthy staged rollback is not itself rolled back merely because Node is
# still binding its port.
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

assert_safe_authority_state() {
  local consistency
  consistency="$(request_internal_api /api/v1/system-domains/consistency)"
  node -e '
    const value = JSON.parse(process.argv[1]);
    const target = process.argv[2];
    const expectedMode = process.argv[3] || "";
    const reconciliation = value?.consistency?.details?.reconciliation?.promotion || {};
    const authority = value?.consistency?.details?.authority?.mode;
    const compatibilityReady = authority === "compatibility-snapshot" && value?.consistency?.matches === true;
    const primarySuspendReady = authority === "postgres-primary" && reconciliation?.retirementEligible === true;
    if (value?.consistency?.ok !== true || reconciliation?.readEligible !== true
      || (!compatibilityReady && !primarySuspendReady) || (expectedMode && authority !== expectedMode)) process.exit(1);
    process.stdout.write(authority);
  ' "$consistency" "$TARGET" "${EXPECTED_AUTHORITY_MODE:-}" || {
    echo "Refusing command-surface change without stable compatibility parity or a durable PostgreSQL-primary tombstone." >&2
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

EXPECTED_AUTHORITY_MODE=""
EXPECTED_AUTHORITY_MODE="$(assert_safe_authority_state)"
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
rm -f "$ACTOR_POLICY_DROPIN_FILE" "$PRODUCTION_DROPIN_FILE" "$LEGACY_PRODUCTION_DROPIN_FILE" "$TIMESHEET_DROPIN_FILE" "$ACCESS_CONTROL_DROPIN_FILE"
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
  } else if (entries.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS === "1"
    || String(entries.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES || "").trim()) process.exit(1);
' "$runtime_environment" "$EXPECTED_CSV" || {
  echo "The running service did not receive the requested rollback command configuration." >&2
  exit 1
}

capabilities="$(request_internal_api /api/v1/system-domains/capabilities)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const expected = process.argv[2].split(",").filter(Boolean);
  const capability = value?.capabilities || {};
  const actual = capability.configuredServerCommandSurfaces || [];
  if (expected.length === 0) {
    if (capability.serverCommandsConfigured === true || actual.length !== 0) process.exit(1);
  } else {
    const consistency = capability.consistency || {};
    const authority = consistency?.details?.authority?.mode;
    const promotion = consistency?.details?.reconciliation?.promotion || {};
    const compatibilityReady = authority === "compatibility-snapshot" && consistency?.matches === true;
    const primaryReady = authority === "postgres-primary" && promotion?.retirementEligible === true;
    if (capability.primaryPostgres !== true
      || capability.serverCommandsConfigured !== true
      || capability.actorAuthorization?.policyConfigured !== true
      || consistency?.ok !== true
      || promotion?.readEligible !== true
      || (!compatibilityReady && !primaryReady)
      || actual.length !== expected.length
      || actual.some((surface, index) => surface !== expected[index])) process.exit(1);
  }
' "$capabilities" "$EXPECTED_CSV" || {
  echo "System Domains command capability does not match the requested rollback state." >&2
  exit 1
}
assert_safe_authority_state >/dev/null

if [[ "$TARGET" == "disabled" && "${MES_DISABLE_COMPATIBILITY_OUTBOX_ON_ROLLBACK:-0}" == "1" ]]; then
  systemctl disable --now "$SYNC_TIMER" || true
fi
APPLIED=0
rm -rf "$BACKUP_DIR"
trap - EXIT
echo "System Domains command surfaces are now ${TARGET}; ${EXPECTED_AUTHORITY_MODE} authority and its snapshot/tombstone state were preserved."
