#!/usr/bin/env bash
# Schedule a root-owned one-shot fail-safe without copying rollout secrets.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
delay="20m"

for argument in "$@"; do
  case "$argument" in
    --delay=*) delay="${argument#--delay=}" ;;
    *) echo "Usage: $0 [--delay=20m]" >&2; exit 2 ;;
  esac
done

[[ "$delay" =~ ^[1-9][0-9]*(s|sec|m|min|h|hr)$ ]] \
  || { echo "Delay must be a positive duration such as 900s, 20m or 1h." >&2; exit 2; }

resolved_app_dir="$(readlink -f "$APP_DIR")"
[[ -n "$resolved_app_dir" && -d "$resolved_app_dir" ]] \
  || { echo "Cannot resolve the current immutable Pilot release." >&2; exit 1; }
rollback_script="${resolved_app_dir}/ops/auth/deactivate-pilot-nomenclature-evaluation-stack.sh"
[[ -x "$rollback_script" ]] \
  || { echo "The immutable release does not contain an executable evaluation rollback helper." >&2; exit 1; }

unit_name="mes-pilot-nomenclature-evaluation-auto-rollback-$(date -u +%Y%m%dT%H%M%SZ)-$$"
/usr/bin/systemd-run \
  --unit="$unit_name" \
  --on-active="$delay" \
  --property=Type=oneshot \
  --description="Fail-safe rollback of the temporary Pilot Nomenclature evaluation" \
  "$rollback_script"

systemctl is-active --quiet "${unit_name}.timer" \
  || { echo "The auto-rollback timer was not activated." >&2; exit 1; }

echo "AUTO_ROLLBACK_TIMER=${unit_name}.timer"
echo "AUTO_ROLLBACK_SERVICE=${unit_name}.service"
echo "AUTO_ROLLBACK_DELAY=${delay}"
echo "AUTO_ROLLBACK_SCRIPT=${rollback_script}"
echo "Cancel before it fires only with: systemctl stop ${unit_name}.timer"
