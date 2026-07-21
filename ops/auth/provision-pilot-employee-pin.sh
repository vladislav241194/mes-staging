#!/usr/bin/env bash
# Root wrapper that keeps a PIN out of argv, environment and command logs.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR_INPUT="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
APP_DIR="$(readlink -f "$APP_DIR_INPUT" 2>/dev/null || true)"
[[ -n "$APP_DIR" && -d "$APP_DIR" ]] || { echo "Cannot resolve the current immutable Pilot release." >&2; exit 1; }
DATABASE_ENV_FILE="${MES_PILOT_DOMAIN_ENV_FILE:-/etc/mes/mes-pilot-domain.env}"
ACTION="${1:-}"
EMPLOYEE_ID="${2:-}"
[[ -n "$EMPLOYEE_ID" ]] || { echo "Usage: $0 set-pin|set-pin-file|revoke-sessions EMPLOYEE_ID [credential-file]" >&2; exit 2; }

case "$ACTION" in
  set-pin)
    read -r -s -p "Employee PIN: " employee_pin
    printf '\n' >&2
    read -r -s -p "Repeat PIN: " employee_pin_repeat
    printf '\n' >&2
    [[ "$employee_pin" == "$employee_pin_repeat" ]] || { unset employee_pin employee_pin_repeat; echo "PIN values do not match." >&2; exit 1; }
    printf '%s\n' "$employee_pin" \
      | /usr/bin/node "$APP_DIR/scripts/employee-auth-credential-admin.mjs" set-pin \
        "--employee-id=$EMPLOYEE_ID" --pin-stdin "--database-env-file=$DATABASE_ENV_FILE"
    unset employee_pin employee_pin_repeat
    ;;
  set-pin-file)
    CREDENTIAL_FILE="${3:-}"
    [[ -n "$CREDENTIAL_FILE" ]] || { echo "A root-owned private credential file is required." >&2; exit 2; }
    /usr/bin/node "$APP_DIR/scripts/employee-auth-credential-admin.mjs" set-pin \
      "--employee-id=$EMPLOYEE_ID" "--credential-file=$CREDENTIAL_FILE" "--database-env-file=$DATABASE_ENV_FILE"
    ;;
  revoke-sessions)
    /usr/bin/node "$APP_DIR/scripts/employee-auth-credential-admin.mjs" revoke-sessions \
      "--employee-id=$EMPLOYEE_ID" "--database-env-file=$DATABASE_ENV_FILE"
    ;;
  *) echo "Usage: $0 set-pin|set-pin-file|revoke-sessions EMPLOYEE_ID [credential-file]" >&2; exit 2 ;;
esac
