#!/usr/bin/env bash
set -euo pipefail

# Controlled, one-shot PostgreSQL -> compatibility snapshot promotion. This is
# deliberately root-only and does not enable System Domains command surfaces.
# The Node command still requires a dry-run proof, explicit --apply and
# --confirm-postgres-authority; this wrapper only supplies the protected DB
# environment and the second environment gate.
if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash ops/postgres/promote-system-domains-snapshot.sh <proof arguments>" >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
ENV_FILE="${MES_PILOT_DOMAIN_ENV_FILE:-/etc/mes/mes-pilot-domain.env}"

[[ -d "${APP_DIR}" ]] || { echo "Missing application directory: ${APP_DIR}" >&2; exit 1; }
[[ -r "${ENV_FILE}" ]] || { echo "Missing domain environment file: ${ENV_FILE}" >&2; exit 1; }

cd "${APP_DIR}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
# The domain-only environment intentionally contains database credentials but
# does not duplicate the pilot service's shared-state paths.  Promotion has
# to operate on that active compatibility snapshot, never on an implicit
# `.mes-shared-state.json` inside the immutable release artifact.
export APP_ENV="${APP_ENV:-pilot}"
export MES_SHARED_STATE_DIR="${MES_SHARED_STATE_DIR:-/srv/mes/pilot/shared-state}"
export MES_BACKUP_DIR="${MES_BACKUP_DIR:-/srv/mes/pilot/backups}"
export MES_AUDIT_LOG_PATH="${MES_AUDIT_LOG_PATH:-/srv/mes/pilot/audit/audit.log}"
export MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_PROMOTION=1

exec /usr/bin/npm run domain:system-domains:promote-snapshot -- "$@"
