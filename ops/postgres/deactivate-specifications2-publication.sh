#!/usr/bin/env bash
# Reversible rollback for Specifications 2.0 revision publication commands.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/64-specifications2-publication.conf"
READINESS_URL="http://127.0.0.1:4175/api/v1/domain-readiness"
backup_dir="$(mktemp -d /root/.mes-specifications2-publication-rollback.XXXXXX)"
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
    systemctl daemon-reload
    systemctl restart "$SERVICE" || true
  fi
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

if [[ -f "$DROPIN_FILE" ]]; then
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
fi
configuration_changed=1
rm -f "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

readiness=""
for attempt in $(seq 1 12); do
  if readiness="$(request_readiness 2>/dev/null)" && node -e '
    const value = JSON.parse(process.argv[1]);
    if (value?.readiness?.commands?.specifications2RevisionPublication?.enabled === true) process.exit(1);
  ' "$readiness"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Publication capability remained enabled; prior service configuration will be restored." >&2; exit 1; }
echo "Specifications 2.0 revision publication is disabled; immutable PostgreSQL revisions are preserved."
