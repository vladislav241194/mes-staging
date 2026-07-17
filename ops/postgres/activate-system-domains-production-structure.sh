#!/usr/bin/env bash
# Controlled first writer rollout for MES Pilot.
# Run once as root on the pilot VM after the application source has been deployed.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SYNC_SERVICE="mes-pilot-domain-snapshot-sync.service"
SYNC_TIMER="mes-pilot-domain-snapshot-sync.timer"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/50-system-domains-production-structure.conf"

required_files=(
  "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.service"
  "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.timer"
  "${APP_DIR}/ops/postgres/mes-pilot-system-domains-production-structure.conf"
)
for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || { echo "Missing rollout artifact: $file" >&2; exit 1; }
done

# The command path must not be enabled if a browser snapshot can still diverge
# from PostgreSQL. This endpoint is read-only and intentionally available on
# the internal host.
consistency="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/consistency)"
node -e 'const value = JSON.parse(process.argv[1]); if (value?.consistency?.matches !== true) process.exit(1);' "$consistency" \
  || { echo "System Domains PostgreSQL projection does not match the compatibility snapshot." >&2; exit 1; }

install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.service" "/etc/systemd/system/${SYNC_SERVICE}"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-domain-snapshot-sync.timer" "/etc/systemd/system/${SYNC_TIMER}"
install -d -m 0755 "$DROPIN_DIR"
install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-system-domains-production-structure.conf" "$DROPIN_FILE"

systemctl daemon-reload
systemctl enable --now "$SYNC_TIMER"
systemctl restart "$SERVICE"

capabilities="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/capabilities)"
node -e 'const value = JSON.parse(process.argv[1]); if (value?.capabilities?.serverCommandsEnabled !== true || !value?.capabilities?.serverCommandSurfaces?.includes("production-structure")) process.exit(1);' "$capabilities" \
  || { echo "Command capability did not become ready; remove the drop-in and inspect service logs." >&2; exit 1; }

systemctl --no-pager --full status "$SYNC_TIMER"
echo "System Domains production-structure command path is enabled."
