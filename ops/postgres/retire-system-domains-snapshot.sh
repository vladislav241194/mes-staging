#!/usr/bin/env bash
set -euo pipefail

# Controlled, one-shot System Domains cutover.  The Node command requires a
# dry-run proof, explicit --apply and matching fingerprints; this wrapper
# supplies only the protected runtime environment and the second gate.
if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash ops/postgres/retire-system-domains-snapshot.sh <proof arguments>" >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
ENV_FILE="${MES_PILOT_DOMAIN_ENV_FILE:-/etc/mes/mes-pilot-domain.env}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"

verify_active_release_contract() {
  local active_target source_target release_path release_id manifest
  [[ -L "$ACTIVE_APP_DIR" ]] || return 1
  active_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
  source_target="$(readlink -f "$APP_DIR" 2>/dev/null || true)"
  release_path="$(dirname "$active_target")"
  release_id="$(basename "$release_path")"
  manifest="${release_path}/release-manifest.json"
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || return 1
  [[ "$active_target" == "${RELEASES_DIR}/${release_id}/app" ]] || return 1
  [[ "$source_target" == "$active_target" && -f "$manifest" ]] || return 1
  /usr/bin/node "${active_target}/scripts/release-server-command-contract-verify.mjs" \
    --app="$active_target" --manifest="$manifest" \
    --expected-release-id="$release_id" --contract=system-domains >/dev/null
}

verify_active_release_contract \
  || { echo "Active release provenance or manifest-bound System Domains authority contract is invalid." >&2; exit 1; }

[[ -d "${APP_DIR}" ]] || { echo "Missing application directory: ${APP_DIR}" >&2; exit 1; }
[[ -r "${ENV_FILE}" ]] || { echo "Missing domain environment file: ${ENV_FILE}" >&2; exit 1; }

cd "${APP_DIR}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# This root command is intentionally outside the systemd service, while the
# final command-surface flags and actor allowlist are installed as service
# drop-ins. Read the *running* service environment so a shell-local export or
# an outdated base env file cannot accidentally approve a PostgreSQL-primary
# cutover that the actual API would refuse.
MAIN_PID="$(systemctl show --property=MainPID --value "${SERVICE}")"
[[ "${MAIN_PID}" =~ ^[1-9][0-9]*$ && -r "/proc/${MAIN_PID}/environ" ]] || {
  echo "Cannot inspect a running ${SERVICE} service for System Domains command coverage" >&2
  exit 1
}
for key in MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES MES_SYSTEM_DOMAINS_COMMAND_ACTORS; do
  value="$(tr '\0' '\n' < "/proc/${MAIN_PID}/environ" | sed -n "s/^${key}=//p" | tail -n 1 || true)"
  [[ -n "${value}" ]] || {
    echo "Running ${SERVICE} service is missing required ${key}; activate all command surfaces and the protected actor policy first" >&2
    exit 1
  }
  export "${key}=${value}"
done

# Do not equate a syntactically valid systemd drop-in with a live writer.
# The public authentication principal is deliberately derived from the running
# service (the guard defaults it to "user" if it is omitted), then required in
# the actual allowlist before this irreversible tombstone procedure can start.
runtime_environment="$(tr '\0' '\n' < "/proc/${MAIN_PID}/environ")"
EXPECTED_SURFACES="production-structure,timesheet,access-control"
node -e '
  const entries = Object.fromEntries(process.argv[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
  }));
  const expectedSurfaces = process.argv[2];
  const username = String(entries.MES_PUBLIC_AUTH_USERNAME || "user").trim();
  const principal = `public:${username}`;
  const actors = String(entries.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (entries.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS !== "1"
    || entries.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES !== expectedSurfaces
    || !username
    || !actors.includes(principal)) process.exit(1);
' "$runtime_environment" "$EXPECTED_SURFACES" || {
  echo "Running ${SERVICE} service does not authorize its active public principal for every required System Domains command surface." >&2
  exit 1
}

# Loopback has no browser session, so `serverCommandsEnabled` is expected to be
# false there. `serverCommandsConfigured` proves the same authenticated path
# would be enabled for the exact principal verified above. Re-check both the
# live capability and the stable compatibility proof immediately before the
# root procedure mutates the shared-state snapshot.
capabilities="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/capabilities)"
consistency="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/consistency)"
node -e '
  const capabilityResponse = JSON.parse(process.argv[1]);
  const consistencyResponse = JSON.parse(process.argv[2]);
  const expected = process.argv[3].split(",").filter(Boolean);
  const capability = capabilityResponse?.capabilities || {};
  const actual = capability.configuredServerCommandSurfaces || [];
  const reconciliation = consistencyResponse?.consistency?.details?.reconciliation?.promotion || {};
  if (capability.primaryPostgres !== true
    || capability.serverCommandsConfigured !== true
    || capability.actorAuthorization?.policyConfigured !== true
    || actual.length !== expected.length
    || actual.some((surface, index) => surface !== expected[index])
    || consistencyResponse?.consistency?.ok !== true
    || consistencyResponse?.consistency?.details?.authority?.mode !== "compatibility-snapshot"
    || reconciliation?.readEligible !== true
    || consistencyResponse?.consistency?.matches !== true) process.exit(1);
' "$capabilities" "$consistency" "$EXPECTED_SURFACES" || {
  echo "Refusing System Domains snapshot retirement: live command capability or compatibility proof is not ready." >&2
  exit 1
}
export APP_ENV="${APP_ENV:-pilot}"
export MES_SHARED_STATE_DIR="${MES_SHARED_STATE_DIR:-/srv/mes/pilot/shared-state}"
export MES_BACKUP_DIR="${MES_BACKUP_DIR:-/srv/mes/pilot/backups}"
export MES_AUDIT_LOG_PATH="${MES_AUDIT_LOG_PATH:-/srv/mes/pilot/audit/audit.log}"
export MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_RETIREMENT=1

exec /usr/bin/npm run domain:system-domains:retire-snapshot -- "$@"
