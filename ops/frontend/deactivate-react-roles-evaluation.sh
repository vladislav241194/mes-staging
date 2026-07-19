#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"; PORT="${MES_PILOT_PORT:-4175}"; DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/84-react-roles-evaluation.conf"
backup_dir="$(mktemp -d /root/.mes-react-roles-deactivation.XXXXXX)"; had_previous=0; configuration_changed=0; completed=0
request_home() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/"; }
request_health() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"; }
restore_on_failure() { if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then rm -rf "$backup_dir"; return; fi; if [[ $had_previous -eq 1 ]]; then install -m 0644 "$backup_dir/previous.conf" "$DROPIN_FILE"; fi; systemctl daemon-reload; systemctl restart "$SERVICE" || true; rm -rf "$backup_dir"; }
trap restore_on_failure EXIT
if [[ -f "$DROPIN_FILE" ]]; then cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"; had_previous=1; configuration_changed=1; rm -f "$DROPIN_FILE"; fi
systemctl daemon-reload; systemctl restart "$SERVICE"
for attempt in $(seq 1 12); do health="$(request_health 2>/dev/null || true)"; home="$(request_home 2>/dev/null || true)"; if grep -Fq '"status":"ok"' <<<"$health" && grep -Fq '"MES_REACT_ROLES":false' <<<"$home" && grep -Fq '"MES_REACT_ROLES_READ_ONLY_EVALUATION":false' <<<"$home"; then completed=1; break; fi; sleep 1; done
[[ $completed -eq 1 ]] || { echo "React Roles evaluation did not turn off cleanly; prior configuration will be restored." >&2; exit 1; }
echo "React Roles evaluation is disabled; every session uses legacy."
