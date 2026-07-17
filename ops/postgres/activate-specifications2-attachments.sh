#!/usr/bin/env bash
# Controlled upload/download rollout for Specifications 2.0 production files.
# Run once as root on the pilot VM after the application source is deployed.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/50-specifications2-attachments.conf"
SOURCE_FILE="${APP_DIR}/ops/postgres/mes-pilot-specifications2-attachments.conf"
READINESS_URL="http://127.0.0.1:4175/api/v1/domain-readiness"

[[ -f "$SOURCE_FILE" ]] || { echo "Missing rollout artifact: $SOURCE_FILE" >&2; exit 1; }

# No browser path is changed until migration 019 is visible through the live
# API. This avoids creating published references to unavailable blobs.
readiness="$(curl --fail --silent --show-error -H 'Host: mes-internal' "$READINESS_URL")"
node -e 'const value = JSON.parse(process.argv[1]); if (value?.readiness?.commands?.specifications2AttachmentUpload?.schemaReady !== true) process.exit(1);' "$readiness" \
  || { echo "Specifications 2.0 attachment schema is not ready." >&2; exit 1; }

install -d -m 0755 "$DROPIN_DIR"
install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

readiness="$(curl --fail --silent --show-error -H 'Host: mes-internal' "$READINESS_URL")"
node -e 'const value = JSON.parse(process.argv[1]); const status = value?.readiness?.commands?.specifications2AttachmentUpload; if (status?.enabled !== true || status?.schemaReady !== true) process.exit(1);' "$readiness" \
  || { echo "Attachment capability did not become ready; remove the drop-in and inspect service logs." >&2; exit 1; }

echo "Specifications 2.0 attachment upload and download are enabled."
