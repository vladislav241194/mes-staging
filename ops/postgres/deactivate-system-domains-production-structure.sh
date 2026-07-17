#!/usr/bin/env bash
# Immediate, reversible rollback for the first System Domains command surface.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SYNC_TIMER="mes-pilot-domain-snapshot-sync.timer"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/50-system-domains-production-structure.conf"

rm -f "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

# The compatibility outbox is safe to leave enabled: it only delivers pending
# PostgreSQL records to the legacy snapshot and never accepts browser writes.
if [[ "${MES_DISABLE_COMPATIBILITY_OUTBOX_ON_ROLLBACK:-0}" == "1" ]]; then
  systemctl disable --now "$SYNC_TIMER" || true
fi

capabilities="$(curl --fail --silent --show-error -H 'Host: mes-internal' http://127.0.0.1:4175/api/v1/system-domains/capabilities)"
node -e 'const value = JSON.parse(process.argv[1]); if (value?.capabilities?.serverCommandsEnabled === true) process.exit(1);' "$capabilities" \
  || { echo "System Domains command capability is still active after rollback." >&2; exit 1; }

echo "System Domains production-structure command path is disabled; compatibility snapshot mode remains available."
