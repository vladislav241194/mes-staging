#!/usr/bin/env bash
# Reversible Directory Cluster command deactivation.
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi
APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_FILE="/etc/systemd/system/${SERVICE}.service.d/50-directory-cluster-commands.conf"

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
  local root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs" active_record="${RELEASES_DIR}/active-release.json"
  [[ -f "$root_seal_helper" && -f "$active_record" ]] || return 1
  /usr/bin/node "$root_seal_helper" bundle >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" release --releases-root="$RELEASES_DIR" --release-id="$release_id" --app="$active_target" >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" pointer --pointer="$ACTIVE_APP_DIR" --expected-target="$active_target" >/dev/null || return 1
  /usr/bin/node "$root_seal_helper" artifact --trusted-root="$RELEASES_DIR" --artifact="$active_record" >/dev/null || return 1
  /usr/bin/node --input-type=module -e 'import { readFile } from "node:fs/promises"; const [path, id] = process.argv.slice(1); const record = JSON.parse(await readFile(path, "utf8")); if (record?.releaseId !== id) process.exit(1);' "$active_record" "$release_id" || return 1
  /usr/sbin/runuser -u mes-stage -- /usr/bin/env \
    HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /usr/bin/node "${active_target}/scripts/release-server-command-contract-verify.mjs" \
    --app="$active_target" --manifest="$manifest" \
    --expected-release-id="$release_id" --contract=directory-cluster --public-only >/dev/null
}
verify_active_release_contract || { echo "Active release provenance or manifest-bound Directory Cluster contract is invalid." >&2; exit 1; }

request_capability() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "http://127.0.0.1:${PORT}$1"
}

backup_dir="$(mktemp -d /root/.mes-directory-cluster-command-rollback.XXXXXX)"
had_previous=0
applied=0
completed=0
restore_on_failure() {
  local status=$?
  if [[ $status -ne 0 && $applied -eq 1 && $had_previous -eq 1 ]]; then
    install -m 0644 "$backup_dir/previous.conf" "$DROPIN_FILE"
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  rm -rf "$backup_dir"
  return "$status"
}
trap restore_on_failure EXIT
[[ -f "$DROPIN_FILE" ]] && { install -m 0644 "$DROPIN_FILE" "$backup_dir/previous.conf"; had_previous=1; }
rm -f "$DROPIN_FILE"
applied=1
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  main_pid="$(systemctl show --property=MainPID --value "$SERVICE" 2>/dev/null || true)"
  types="$(request_capability /api/v1/directory/nomenclature-types/capabilities 2>/dev/null || true)"
  boards="$(request_capability /api/v1/directory/boards/capabilities 2>/dev/null || true)"
  if [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] \
    && ! tr '\0' '\n' < "/proc/${main_pid}/environ" | grep -qx 'MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=1' \
    && /usr/bin/node -e '
      for (const source of process.argv.slice(1)) {
        const payload = JSON.parse(source);
        if (payload?.ok !== true || payload?.capabilities?.serverCommandsConfigured !== false) process.exit(1);
      }
    ' "$types" "$boards"; then completed=1; break; fi
  sleep 1
done
[[ $completed -eq 1 ]] || { echo "Directory Cluster command ownership could not be proved disabled; prior configuration will be restored." >&2; exit 1; }
echo "Directory Cluster server commands are disabled; shared-state data and receipts are preserved."
