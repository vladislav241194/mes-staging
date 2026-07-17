#!/usr/bin/env bash
# Reversible rollback for Specifications 2.0 attachment server commands.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/50-specifications2-attachments.conf"
READINESS_URL="http://127.0.0.1:4175/api/v1/domain-readiness"

rm -f "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

readiness="$(curl --fail --silent --show-error -H 'Host: mes-internal' "$READINESS_URL")"
node -e 'const value = JSON.parse(process.argv[1]); if (value?.readiness?.commands?.specifications2AttachmentUpload?.enabled === true) process.exit(1);' "$readiness" \
  || { echo "Attachment capability remained enabled; inspect service configuration." >&2; exit 1; }

echo "Specifications 2.0 attachment upload and download are disabled."
