#!/usr/bin/env bash
# Reversible rollback for Specifications 2.0 attachment server commands.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/50-specifications2-attachments.conf"
READINESS_URL="http://127.0.0.1:4175/api/v1/domain-readiness"
backup_dir="$(mktemp -d /root/.mes-specifications2-attachments-rollback.XXXXXX)"
had_previous=0
completed=0
configuration_changed=0

verify_active_release_contract() {
  local active_target source_target release_path release_id manifest
  [[ -L "$ACTIVE_APP_DIR" ]] || return 1
  active_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
  source_target="$(readlink -f "$APP_DIR" 2>/dev/null || true)"
  release_path="$(dirname "$active_target")"
  release_id="$(basename "$release_path")"
  manifest="${release_path}/release-manifest.json"
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || return 1
  [[ "$active_target" == "${RELEASES_DIR}/${release_id}/app" && "$source_target" == "$active_target" && -f "$manifest" ]] || return 1
  /usr/bin/node "${active_target}/scripts/release-server-command-contract-verify.mjs" \
    --app="$active_target" --manifest="$manifest" \
    --expected-release-id="$release_id" --contract=specifications2 >/dev/null
}
verify_active_release_contract || { echo "Active release provenance or manifest-bound Specifications 2.0 attachment contract is invalid." >&2; exit 1; }

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
  if readiness="$(request_readiness 2>/dev/null)" \
    && node "${APP_DIR}/scripts/specifications2-rollout-readiness-policy.mjs" attachments-disabled "$readiness"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Attachment capability remained enabled; prior service configuration will be restored." >&2; exit 1; }

echo "Specifications 2.0 attachment upload and download are disabled."
