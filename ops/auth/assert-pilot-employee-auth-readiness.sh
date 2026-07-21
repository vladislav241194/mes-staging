#!/usr/bin/env bash
# Root/operator readiness proof for command surfaces that require employee RBAC.
# This intentionally does not require or manufacture a signed browser actor.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
REQUIRED_HOST="${MES_EMPLOYEE_AUTH_REQUIRED_HOST:-pilot.mes-line.ru}"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/67-employee-auth.conf"
SOURCE_FILE="${APP_DIR}/ops/auth/mes-pilot-employee-auth.conf"
ENV_FILE="/etc/mes/mes-pilot-employee-auth.env"
READINESS_POLICY="${APP_DIR}/scripts/employee-auth-readiness-policy.mjs"

[[ -f "$SOURCE_FILE" ]] || { echo "Current release employee-auth drop-in artifact is missing." >&2; exit 1; }
[[ -f "$DROPIN_FILE" && ! -L "$DROPIN_FILE" ]] || { echo "Employee-auth systemd drop-in is not installed." >&2; exit 1; }
cmp -s "$SOURCE_FILE" "$DROPIN_FILE" || { echo "Employee-auth systemd drop-in differs from the verified release artifact." >&2; exit 1; }
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { echo "Root-owned employee-auth environment is missing." >&2; exit 1; }
[[ "$(stat -c '%u:%g:%a' "$ENV_FILE")" == "0:0:600" ]] || { echo "Employee-auth environment must be root:root 0600." >&2; exit 1; }
[[ -f "$READINESS_POLICY" && ! -L "$READINESS_POLICY" ]] || { echo "Employee-auth readiness policy is missing." >&2; exit 1; }

MAIN_PID="$(systemctl show --property=MainPID --value "$SERVICE")"
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ && -r "/proc/${MAIN_PID}/environ" ]] || { echo "Could not inspect the running ${SERVICE} process." >&2; exit 1; }
/usr/bin/node "$READINESS_POLICY" "$ENV_FILE" "/proc/${MAIN_PID}/environ" "$REQUIRED_HOST" \
  || { echo "The running service does not exactly match the protected employee-auth configuration." >&2; exit 1; }

capabilities="$(curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities")"
/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.operatorReadiness !== true
    || value.employeeAuthConfigured !== true
    || value.employeeAuthStorageConfigured !== true
    || value.employeeAuthSchemaReady !== true) process.exit(1);
' "$capabilities" || { echo "Employee-auth route, storage or migration 027 is not ready." >&2; exit 1; }

echo "Employee-auth root readiness is proven (release drop-in, private env, process flags, storage, schema and loopback route)."
