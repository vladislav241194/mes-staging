#!/usr/bin/env bash
# Controlled PostgreSQL-primary publication rollout for Specifications 2.0.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/64-specifications2-publication.conf"
SOURCE_FILE="${APP_DIR}/ops/postgres/mes-pilot-specifications2-publication.conf"
READINESS_URL="http://127.0.0.1:4175/api/v1/domain-readiness"
backup_dir="$(mktemp -d /root/.mes-specifications2-publication.XXXXXX)"
had_previous=0
completed=0
configuration_changed=0

request_readiness() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "$READINESS_URL"
}

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then
    rm -rf "$backup_dir"
    return
  fi
  if [[ $had_previous -eq 1 ]]; then
    install -m 0644 "$backup_dir/previous.conf" "$DROPIN_FILE"
  else
    rm -f "$DROPIN_FILE"
  fi
  systemctl daemon-reload
  systemctl restart "$SERVICE" || true
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

[[ -f "$SOURCE_FILE" ]] || { echo "Missing rollout artifact: $SOURCE_FILE" >&2; exit 1; }

readiness="$(request_readiness)"
node -e 'const value = JSON.parse(process.argv[1]); if (value?.readiness?.commands?.specifications2RevisionPublication?.schemaReady !== true) process.exit(1);' "$readiness" \
  || { echo "Specifications 2.0 publication schema is not ready." >&2; exit 1; }

install -d -m 0755 "$DROPIN_DIR"
if [[ -f "$DROPIN_FILE" ]]; then
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
fi
configuration_changed=1
install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

readiness=""
for attempt in $(seq 1 12); do
  if readiness="$(request_readiness 2>/dev/null)" && node -e '
    const value = JSON.parse(process.argv[1]);
    const status = value?.readiness?.commands?.specifications2RevisionPublication;
    if (status?.enabled !== true || status?.schemaReady !== true) process.exit(1);
  ' "$readiness"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Publication capability did not become ready; prior service configuration will be restored." >&2; exit 1; }
echo "Specifications 2.0 PostgreSQL-primary revision publication is enabled."
