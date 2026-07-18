#!/usr/bin/env bash
set -euo pipefail

# Controlled reconciliation for the staged migration. PostgreSQL is not made
# authoritative here: this imports the current compatibility snapshot into
# both domain projections, then proves that the read models agree.
if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash ops/postgres/refresh-domain-projections-from-snapshot.sh" >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
STATE_FILE="${MES_SHARED_STATE_FILE:-/srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json}"
ENV_FILE="${MES_PILOT_DOMAIN_ENV_FILE:-/etc/mes/mes-pilot-domain.env}"
IMPORT_SERVICE="${MES_PILOT_DOMAIN_IMPORT_SERVICE:-mes-pilot-domain-import.service}"
PILOT_SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
INTERNAL_ORIGIN="http://127.0.0.1:4175"
INTERNAL_HOST="mes-internal"

[[ -d "${APP_DIR}" ]] || { echo "Missing application directory: ${APP_DIR}" >&2; exit 1; }
[[ -f "${STATE_FILE}" ]] || { echo "Missing shared-state snapshot: ${STATE_FILE}" >&2; exit 1; }
[[ -r "${ENV_FILE}" ]] || { echo "Missing domain environment file: ${ENV_FILE}" >&2; exit 1; }

request_json() {
  local path="$1"
  local attempt
  for attempt in {1..12}; do
    if curl -fsS --max-time 12 -H "Host: ${INTERNAL_HOST}" "${INTERNAL_ORIGIN}${path}"; then
      return 0
    fi
    sleep 1
  done
  echo "MES API did not become ready for the controlled reconciliation: ${path}" >&2
  return 1
}

# A reverse import is only valid while PostgreSQL is a proven byte-for-byte
# compatibility projection.  Starting the generic import unit first would be
# too late: it could replace newer PostgreSQL facts from a stale snapshot.
system_domains_guard="$(request_json "/api/v1/system-domains/consistency")"
node -e '
  const payload = JSON.parse(process.argv[1]);
  if (payload?.consistency?.matches !== true) {
    throw new Error("Refusing reverse import: System Domains PostgreSQL projection is not a proven exact compatibility match");
  }
' "${system_domains_guard}"

# The existing service exports and imports the work-order/operation/slot
# projection under the deploy account and its hardened systemd environment.
systemctl start "${IMPORT_SERVICE}"
systemctl is-failed --quiet "${IMPORT_SERVICE}" && {
  systemctl --no-pager --full status "${IMPORT_SERVICE}" >&2
  exit 1
}

# System Domains use a separate aggregate. The importer is now allowed only
# after the API has proven that the current compatibility snapshot is exact.
cd "${APP_DIR}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
/usr/bin/npm run domain:postgres:import-system-domains -- "--input=${STATE_FILE}" --apply

# The API process imports its repository adapters at boot. Restart it after a
# reconciliation so the following parity probes validate the same code and
# projection that users will receive, rather than an older in-memory module.
systemctl restart "${PILOT_SERVICE}"

work_order_parity="$(request_json "/api/v1/planning/work-orders/parity")"
system_domains_consistency="$(request_json "/api/v1/system-domains/consistency")"
readiness="$(request_json "/api/v1/domain-readiness")"

node -e '
  const [parity, consistency, readiness] = process.argv.slice(1).map(JSON.parse);
  if (parity?.parity?.matches !== true) throw new Error("Work-order PostgreSQL projection does not match the compatibility snapshot");
  if (consistency?.consistency?.matches !== true) throw new Error("System Domains PostgreSQL projection does not match the compatibility snapshot");
  if (readiness?.status !== "ready") throw new Error("Domain readiness is not ready after reconciliation");
' "${work_order_parity}" "${system_domains_consistency}" "${readiness}"

echo "Domain projections are reconciled with the compatibility snapshot."
