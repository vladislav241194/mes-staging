#!/usr/bin/env bash
# Stage 2: back up shared-state, then enable the authenticated server command owner.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "Run as root." >&2; exit 1; fi

APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
SERVICE_USER="${MES_PILOT_SERVICE_USER:-deploy}"
PORT="${MES_PILOT_PORT:-4175}"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/68-nomenclature-command-owner.conf"
SOURCE_FILE="${APP_DIR}/ops/auth/mes-pilot-nomenclature-command-owner.conf"
COMPATIBILITY_MARKER="${APP_DIR}/ops/auth/nomenclature-server-command-compatibility.json"
backup_dir="$(mktemp -d /root/.mes-pilot-nomenclature-command-owner.XXXXXX)"
had_previous=0
configuration_changed=0
completed=0

request_health() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/healthz"; }
request_capabilities() { curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "http://127.0.0.1:${PORT}/api/v1/nomenclature/capabilities"; }
request_command_denial() {
  curl --silent --show-error --connect-timeout 2 --max-time 5 \
    -X POST \
    -H 'Host: mes-internal' \
    -H 'Content-Type: application/json' \
    -H 'Sec-Fetch-Site: same-origin' \
    -H 'Origin: http://mes-internal' \
    -H 'Idempotency-Key: root-readiness-denial-probe' \
    -H 'If-Match: "0"' \
    --data '{}' \
    "http://127.0.0.1:${PORT}/api/v1/nomenclature"
}

verify_active_release_contract() {
  local active_target source_target release_path release_id manifest
  [[ -L "$ACTIVE_APP_DIR" ]] || {
    echo "Nomenclature command activation requires an immutable active release pointer." >&2
    return 1
  }
  active_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
  source_target="$(readlink -f "$APP_DIR" 2>/dev/null || true)"
  release_path="$(dirname "$active_target")"
  release_id="$(basename "$release_path")"
  manifest="${release_path}/release-manifest.json"
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || return 1
  [[ "$active_target" == "${RELEASES_DIR}/${release_id}/app" ]] || return 1
  [[ "$source_target" == "$active_target" && -f "$manifest" && -f "$COMPATIBILITY_MARKER" ]] || return 1
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
    --app="$active_target" \
    --manifest="$manifest" \
    --expected-release-id="$release_id" \
    --contract=nomenclature --public-only >/dev/null
}

restore_on_failure() {
  if [[ $completed -eq 1 || $configuration_changed -eq 0 ]]; then rm -rf "$backup_dir"; return; fi
  if [[ $had_previous -eq 1 ]]; then cp -a "$backup_dir/previous.conf" "$DROPIN_FILE"; else rm -f "$DROPIN_FILE"; fi
  systemctl daemon-reload
  systemctl restart "$SERVICE" || true
  rm -rf "$backup_dir"
}
trap restore_on_failure EXIT

[[ -f "$SOURCE_FILE" ]] || { echo "Missing command-owner drop-in artifact." >&2; exit 1; }
verify_active_release_contract \
  || { echo "Active release provenance or manifest-bound Nomenclature command contract is invalid." >&2; exit 1; }
pre_capabilities="$(request_capabilities)"
/usr/bin/node -e '
  const value = JSON.parse(process.argv[1]);
  if (value.operatorReadiness !== true || value.employeeAuthConfigured !== true || value.employeeAuthSchemaReady !== true) throw new Error("Employee-auth Stage 1 is not ready");
  if (value.capabilities?.serverCommandsConfigured === true) throw new Error("Nomenclature command owner is already configured");
' "$pre_capabilities"

other_owners="$(grep -RIl --exclude='68-nomenclature-command-owner.conf' '^Environment=MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1$' "$DROPIN_DIR" 2>/dev/null || true)"
[[ -z "$other_owners" ]] || { echo "Another drop-in owns Nomenclature commands; refusing ambiguous activation." >&2; printf '%s\n' "$other_owners" >&2; exit 1; }

backup_output="$(/usr/sbin/runuser -u "$SERVICE_USER" -- env \
  APP_ENV=pilot \
  MES_SHARED_STATE_DIR=/srv/mes/pilot/shared-state \
  MES_BACKUP_DIR=/srv/mes/pilot/backups \
  MES_AUDIT_LOG_PATH=/srv/mes/pilot/audit/audit.log \
  /usr/bin/node "$APP_DIR/scripts/backup-shared-state.mjs" \
    --reason=before-nomenclature-command-owner-enable --actor=root-rollout)"
grep -Fq 'Shared state backup created:' <<<"$backup_output" || { echo "Shared-state backup was not confirmed; commands remain off." >&2; exit 1; }
printf '%s\n' "$backup_output"

install -d -m 0755 "$DROPIN_DIR"
if [[ -f "$DROPIN_FILE" ]]; then
  cmp -s "$SOURCE_FILE" "$DROPIN_FILE" || { echo "Refusing to overwrite an unrecognized command-owner drop-in." >&2; exit 1; }
  cp -a "$DROPIN_FILE" "$backup_dir/previous.conf"
  had_previous=1
fi
configuration_changed=1
install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  health="$(request_health 2>/dev/null || true)"
  capabilities="$(request_capabilities 2>/dev/null || true)"
  command_denial="$(request_command_denial 2>/dev/null || true)"
  if grep -Fq '"status":"ok"' <<<"$health" && /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.operatorReadiness !== true || value.employeeAuthConfigured !== true || value.employeeAuthSchemaReady !== true) process.exit(1);
    if (value.capabilities?.serverCommandsConfigured !== true || value.capabilities?.serverCommandsEnabled !== false) process.exit(1);
  ' "$capabilities" && /usr/bin/node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.ok !== false || !["nomenclature-write-forbidden", "employee-principal-required"].includes(value.code)) process.exit(1);
  ' "$command_denial"; then completed=1; break; fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Command owner did not become ready; the exact prior drop-in will be restored with commands OFF." >&2; exit 1; }
echo "Nomenclature server command owner is configured; live writes still require a signed employee session and current RBAC."
