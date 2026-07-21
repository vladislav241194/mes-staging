#!/usr/bin/env bash
# Controlled PostgreSQL-primary Work Order rollout for Specifications 2.0.
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
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN_FILE="${DROPIN_DIR}/63-specifications2-work-orders.conf"
SOURCE_FILE="${APP_DIR}/ops/postgres/mes-pilot-specifications2-work-orders.conf"
COMPATIBILITY_MARKER="${APP_DIR}/ops/postgres/specifications2-server-command-compatibility.json"
READINESS_URL="http://127.0.0.1:4175/api/v1/domain-readiness"
backup_dir="$(mktemp -d /root/.mes-specifications2-work-orders.XXXXXX)"
had_previous=0
completed=0
configuration_changed=0

request_readiness() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "$READINESS_URL"
}

validate_compatibility_marker() {
  node --input-type=module -e '
    import { readFile } from "node:fs/promises";
    const marker = JSON.parse(await readFile(process.argv[1], "utf8"));
    const required = [
      "019_specifications2_attachment_blobs",
      "028_specifications2_publication_idempotency",
      "029_specifications2_revision_identity_backfill",
      "030_specifications2_legacy_revision_identity_guard",
      "031_specifications2_guard_function_repair",
    ];
    if (marker?.schemaVersion !== 1
      || marker?.contract !== "specifications2-server-commands"
      || marker?.publicationFingerprintAdapterVersion !== 6
      || marker?.workOrderRevisionIdentityVersion !== 1
      || marker?.workOrderRequestFingerprintVersion !== 1
      || marker?.workOrderAggregateIdentityVersion !== 1
      || marker?.attachmentCommandVersion !== 1
      || marker?.authenticatedActorVersion !== 1
      || marker?.rbacAuthorizationVersion !== 1
      || marker?.requestSecurityVersion !== 1
      || marker?.outboxEnvelopeVersion !== 1
      || marker?.controlledRootExclusivity?.required !== true
      || marker?.controlledRootExclusivity?.lockName !== "mes-authority-rollout.lock"
      || JSON.stringify(marker?.controlledRootExclusivity?.incompatibleTargetRequiresDisabledFlags) !== JSON.stringify([
        "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS",
        "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS",
        "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS",
      ])
      || !required.every((migration) => marker?.requiredMigrations?.includes(migration))) process.exit(1);
  ' "$COMPATIBILITY_MARKER"
}

verify_active_release_contract() {
  local active_target release_path release_id manifest
  [[ -L "$ACTIVE_APP_DIR" ]] || {
    echo "Specifications 2.0 Work Order activation requires an immutable active release pointer." >&2
    return 1
  }
  active_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
  release_path="$(dirname "$active_target")"
  release_id="$(basename "$release_path")"
  manifest="${release_path}/release-manifest.json"
  [[ "$release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || return 1
  [[ "$active_target" == "${RELEASES_DIR}/${release_id}/app" ]] || return 1
  [[ -f "$manifest" ]] || return 1
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
    --contract=specifications2 --public-only >/dev/null
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
[[ -f "$COMPATIBILITY_MARKER" ]] || { echo "Missing Specifications 2.0 command compatibility marker: $COMPATIBILITY_MARKER" >&2; exit 1; }
verify_active_release_contract \
  || { echo "Active release provenance or manifest-bound Specifications 2.0 command contract is invalid." >&2; exit 1; }
source_app_target="$(readlink -f "$APP_DIR" 2>/dev/null || true)"
active_app_target="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
[[ -n "$source_app_target" && "$source_app_target" == "$active_app_target" ]] || {
  echo "Specifications 2.0 Work Order activation must run from the active, manifest-verified candidate release." >&2
  exit 1
}
validate_compatibility_marker \
  || { echo "Specifications 2.0 command compatibility marker is invalid." >&2; exit 1; }

readiness="$(request_readiness)"
node "${APP_DIR}/scripts/specifications2-rollout-readiness-policy.mjs" work-orders-schema-ready "$readiness" || {
  echo "Specifications 2.0 Work Order authority or required revision-identity migrations are not ready." >&2
  exit 1
}

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
  if readiness="$(request_readiness 2>/dev/null)" \
    && node "${APP_DIR}/scripts/specifications2-rollout-readiness-policy.mjs" work-orders-ready "$readiness"; then
    completed=1
    break
  fi
  sleep 1
done

[[ $completed -eq 1 ]] || { echo "Specifications 2.0 Work Order command did not become ready; prior service configuration will be restored." >&2; exit 1; }
echo "Specifications 2.0 PostgreSQL-primary Work Order creation is enabled."
