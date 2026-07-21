#!/usr/bin/env bash
# Must run from the current foundation release before switching to an immutable old release.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
EVALUATION_DROPIN="${DROPIN_DIR}/71-react-nomenclature-write-evaluation.conf"
COMMAND_DROPIN="${DROPIN_DIR}/68-nomenclature-command-owner.conf"
AUTH_DROPIN="${DROPIN_DIR}/67-employee-auth.conf"

main_pid() {
  systemctl show "$SERVICE" --property=MainPID --value
}

effective_flag_enabled() {
  local flag="$1"
  local pid
  pid="$(main_pid 2>/dev/null || true)"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ -r "/proc/${pid}/environ" ]] || return 1
  tr '\0' '\n' < "/proc/${pid}/environ" | grep -Fx "${flag}=1" >/dev/null
}

effective_evaluation_enabled() {
  local pid
  pid="$(main_pid 2>/dev/null || true)"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  [[ -r "/proc/${pid}/environ" ]] || return 1
  tr '\0' '\n' < "/proc/${pid}/environ" | grep -E '^MES_REACT_.*EVALUATION=1$' >/dev/null
}

# Ordering is a safety contract: an old immutable release may not understand
# the new flags, endpoint or receipts, so remove every evaluation layer while
# the current release can still prove it is OFF.
"${APP_DIR}/ops/frontend/deactivate-react-nomenclature-write-evaluation.sh"

other_evaluations="$(find "$DROPIN_DIR" -maxdepth 1 -type f -name '*-evaluation.conf' -print 2>/dev/null || true)"
if [[ -n "$other_evaluations" ]] || effective_evaluation_enabled; then
  echo "Refusing release rollback: another React evaluation remains active." >&2
  [[ -z "$other_evaluations" ]] || printf '%s\n' "$other_evaluations" >&2
  exit 1
fi

if [[ -f "$COMMAND_DROPIN" ]] || effective_flag_enabled MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS; then
  "${APP_DIR}/ops/auth/deactivate-pilot-nomenclature-command-owner.sh"
fi
if [[ -f "$AUTH_DROPIN" ]] || effective_flag_enabled MES_ENABLE_EMPLOYEE_AUTH; then
  "${APP_DIR}/ops/auth/deactivate-pilot-employee-auth.sh"
fi

live_main_pid="$(main_pid 2>/dev/null || true)"
[[ "$live_main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/${live_main_pid}/environ" ]] \
  || { echo "Refusing release rollback: the live service environment cannot be inspected." >&2; exit 1; }

if [[ -f "$EVALUATION_DROPIN" ]] || effective_flag_enabled MES_REACT_NOMENCLATURE_WRITE_EVALUATION; then
  echo "Refusing release rollback: React Nomenclature write evaluation is still enabled." >&2
  exit 1
fi
if effective_flag_enabled MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS; then
  echo "Refusing release rollback: Nomenclature command authority is still enabled." >&2
  exit 1
fi
if effective_flag_enabled MES_ENABLE_EMPLOYEE_AUTH; then
  echo "Refusing release rollback: employee-auth drop-in is still enabled." >&2
  exit 1
fi
if [[ -e "$COMMAND_DROPIN" || -e "$AUTH_DROPIN" ]]; then
  echo "Refusing release rollback: a managed Nomenclature rollout drop-in remains." >&2
  exit 1
fi

health="$(curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz")"
grep -Fq '"status":"ok"' <<<"$health" || { echo "Current release is not healthy; do not change the release pointer." >&2; exit 1; }

echo "Current release is healthy with React evaluation, Nomenclature commands and employee-auth OFF. Immutable release rollback may now begin."
