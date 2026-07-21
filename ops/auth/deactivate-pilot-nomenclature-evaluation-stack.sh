#!/usr/bin/env bash
# Root fail-safe for the complete temporary Nomenclature evaluation stack.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_APP_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)"
APP_DIR="${MES_PILOT_APP_DIR:-$DEFAULT_APP_DIR}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
managed_dropins=(
  "${DROPIN_DIR}/71-react-nomenclature-write-evaluation.conf"
  "${DROPIN_DIR}/68-nomenclature-command-owner.conf"
  "${DROPIN_DIR}/67-employee-auth.conf"
)
rollback_failures=()

request_health() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"
}

request_capabilities() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"
}

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

run_rollback_step() {
  local label="$1"
  local script="$2"
  if ! MES_PILOT_APP_DIR="$APP_DIR" "$script"; then
    rollback_failures+=("$label")
    echo "WARNING: ${label} rollback step failed; continuing toward the safer all-OFF state." >&2
  fi
}

# Do not change this order: UI write permission, backend command authority,
# then employee authentication. Each component script is independently
# idempotent and refuses to delete an unrecognized managed drop-in.
run_rollback_step "React write evaluation" "${APP_DIR}/ops/frontend/deactivate-react-nomenclature-write-evaluation.sh"
run_rollback_step "Nomenclature command owner" "${APP_DIR}/ops/auth/deactivate-pilot-nomenclature-command-owner.sh"
run_rollback_step "employee authentication" "${APP_DIR}/ops/auth/deactivate-pilot-employee-auth.sh"

health="$(request_health 2>/dev/null || true)"
capabilities="$(request_capabilities 2>/dev/null || true)"
grep -Fq '"status":"ok"' <<<"$health" \
  || { echo "Evaluation stack rollback did not leave the Pilot service healthy." >&2; exit 1; }

live_main_pid="$(main_pid 2>/dev/null || true)"
[[ "$live_main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/${live_main_pid}/environ" ]] \
  || { echo "Evaluation stack rollback cannot inspect the live service environment." >&2; exit 1; }

/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.ok !== true || value.operatorReadiness !== true) process.exit(1);
  if (value.employeeAuthStorageConfigured !== true || value.employeeAuthSchemaReady !== true) process.exit(1);
  if (value.capabilities?.serverCommandsConfigured === true || value.capabilities?.serverCommandsEnabled === true) process.exit(1);
' "$capabilities" \
  || { echo "Evaluation stack rollback could not prove Nomenclature commands OFF." >&2; exit 1; }

for dropin in "${managed_dropins[@]}"; do
  [[ ! -e "$dropin" ]] || { echo "Evaluation stack rollback left a managed drop-in: $dropin" >&2; exit 1; }
done

other_evaluations="$(find "$DROPIN_DIR" -maxdepth 1 -type f -name '*-evaluation.conf' -print 2>/dev/null || true)"
if [[ -n "$other_evaluations" ]] || effective_evaluation_enabled; then
  echo "Evaluation stack rollback found another active React evaluation." >&2
  [[ -z "$other_evaluations" ]] || printf '%s\n' "$other_evaluations" >&2
  exit 1
fi

for flag in \
  MES_REACT_NOMENCLATURE \
  MES_REACT_NOMENCLATURE_WRITE_EVALUATION \
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS \
  MES_ENABLE_EMPLOYEE_AUTH; do
  effective_flag_enabled "$flag" \
    && { echo "Evaluation stack rollback left ${flag}=1 in the live service." >&2; exit 1; }
done

if (( ${#rollback_failures[@]} > 0 )); then
  printf 'Evaluation stack is proven OFF despite recoverable step warnings: %s\n' "${rollback_failures[*]}" >&2
fi
echo "Pilot Nomenclature evaluation stack is OFF: React evaluation, command authority and employee-auth are disabled."
