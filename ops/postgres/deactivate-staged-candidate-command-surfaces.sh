#!/usr/bin/env bash
# Pre-activation bridge: disable every legacy-incompatible live command owner
# using only a complete, manifest-verified staged release as the policy source.
set -Eeuo pipefail
umask 022

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

usage() {
  echo "Usage: deactivate-staged-candidate-command-surfaces.sh --release-id=<staged-release-id>" >&2
  exit 2
}

RELEASE_ID=""
for argument in "$@"; do
  case "$argument" in
    --release-id=*) RELEASE_ID="${argument#--release-id=}" ;;
    *) usage ;;
  esac
done
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || usage

RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
SERVICE="${MES_PILOT_SERVICE:-mes-pilot}"
PORT="${MES_PILOT_PORT:-4175}"
CANDIDATE_RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
CANDIDATE_APP_DIR="${CANDIDATE_RELEASE_DIR}/app"
MANIFEST="${CANDIDATE_RELEASE_DIR}/release-manifest.json"
EXPECTED_SCRIPT="${CANDIDATE_APP_DIR}/ops/postgres/deactivate-staged-candidate-command-surfaces.sh"
ROOT_SEAL_HELPER="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || true)"
ACTIVE_TARGET="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
ACTIVE_RELEASE_DIR="$(dirname "$ACTIVE_TARGET")"
ACTIVE_RELEASE_ID="$(basename "$ACTIVE_RELEASE_DIR")"

[[ -x /usr/bin/node && -f "$ROOT_SEAL_HELPER" ]] || {
  echo "The fixed root-owned release seal verifier is unavailable." >&2
  exit 1
}
[[ "$ACTIVE_RELEASE_ID" =~ ^[A-Za-z0-9._-]{1,96}$ \
  && "$ACTIVE_TARGET" == "${RELEASES_DIR}/${ACTIVE_RELEASE_ID}/app" ]] || {
  echo "The active runtime is not an exact release in the canonical release store." >&2
  exit 1
}

# This fixed helper is installed from a clean published Git blob into a
# root-owned libexec path. It verifies its own trusted path, the complete
# canonical store chain and both recursive release trees before this bridge
# invokes any active or candidate release code.
/usr/bin/node "$ROOT_SEAL_HELPER" bundle >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" release \
  --releases-root="$RELEASES_DIR" --release-id="$ACTIVE_RELEASE_ID" \
  --app="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" pointer \
  --pointer="$ACTIVE_APP_DIR" --expected-target="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" artifact \
  --trusted-root="$RELEASES_DIR" --artifact="$RELEASES_DIR/active-release.json" >/dev/null
/usr/bin/node --input-type=module -e 'import { readFile } from "node:fs/promises"; const [path, id] = process.argv.slice(1); const record = JSON.parse(await readFile(path, "utf8")); if (record?.releaseId !== id) process.exit(1);' \
  "$RELEASES_DIR/active-release.json" "$ACTIVE_RELEASE_ID"
/usr/bin/node "$ROOT_SEAL_HELPER" release \
  --releases-root="$RELEASES_DIR" --release-id="$RELEASE_ID" \
  --app="$CANDIDATE_APP_DIR" >/dev/null

[[ "$SCRIPT_PATH" == "$EXPECTED_SCRIPT" ]] || {
  echo "The bridge must be executed from the exact staged release path: $EXPECTED_SCRIPT" >&2
  exit 1
}
[[ -d "$CANDIDATE_APP_DIR" && -f "$MANIFEST" && "$ACTIVE_TARGET" != "$CANDIDATE_APP_DIR" ]] || {
  echo "The requested immutable staged candidate is missing or already active." >&2
  exit 1
}
# Candidate code is eligible only after the out-of-band fixed root-seal trust
# boundary above. The candidate's manifest verifier now proves its content and
# every versioned command contract.
/usr/sbin/runuser -u mes-stage -- /usr/bin/env \
  HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  /usr/bin/node "${CANDIDATE_APP_DIR}/scripts/release-server-command-contract-verify.mjs" \
  --app="$CANDIDATE_APP_DIR" --manifest="$MANIFEST" \
  --expected-release-id="$RELEASE_ID" --contract=all --public-only >/dev/null

if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${CANDIDATE_APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi

SYSTEMD_ROOT="${MES_RELEASE_GUARD_SYSTEMD_ROOT:-/etc/systemd/system}"
PROC_ROOT="${MES_RELEASE_GUARD_PROC_ROOT:-/proc}"
DROPIN_DIR="${SYSTEMD_ROOT}/${SERVICE}.service.d"
POLICY="${CANDIDATE_APP_DIR}/scripts/release-staged-command-deactivation-policy.mjs"
INTERNAL_ORIGIN="http://127.0.0.1:${PORT}"
MANAGED_DROPINS=(
  "${DROPIN_DIR}/49-system-domains-command-actors.conf"
  "${DROPIN_DIR}/50-system-domains-production-structure.conf"
  "${DROPIN_DIR}/60-system-domains-production-structure.conf"
  "${DROPIN_DIR}/61-system-domains-timesheet.conf"
  "${DROPIN_DIR}/62-system-domains-access-control.conf"
  "${DROPIN_DIR}/50-specifications2-attachments.conf"
  "${DROPIN_DIR}/63-specifications2-work-orders.conf"
  "${DROPIN_DIR}/64-specifications2-publication.conf"
  "${DROPIN_DIR}/50-shift-execution-commands.conf"
  # Exact pre-immutable-release Pilot filename retained only so the staged
  # bridge can disable the already-running legacy Shift owner before switch.
  "${DROPIN_DIR}/50-shift-execution-server-commands.conf"
  "${DROPIN_DIR}/68-nomenclature-command-owner.conf"
  "${DROPIN_DIR}/50-directory-cluster-commands.conf"
)

request_internal_api() {
  curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
    -H 'Host: mes-internal' "${INTERNAL_ORIGIN}$1"
}

# The predecessor may predate the read-only Directory capability routes. A
# strict 404 is still a valid command-OFF proof because the bridge already
# rejected every unmanaged enable flag and the running process environment is
# checked independently below. Any other response remains fail-closed.
request_optional_directory_capability() {
  local endpoint="$1" body status
  body="$(mktemp /tmp/mes-directory-capability.XXXXXX)"
  status="$(curl --silent --show-error --connect-timeout 2 --max-time 5 \
    -o "$body" -w '%{http_code}' -H 'Host: mes-internal' \
    "${INTERNAL_ORIGIN}${endpoint}" || true)"
  case "$status" in
    200) cat "$body" ;;
    404) printf '%s' '{"ok":true,"capabilities":{"serverCommandsConfigured":false},"compatibility":"predecessor-route-unavailable"}' ;;
    *) rm -f "$body"; return 1 ;;
  esac
  rm -f "$body"
}

pre_consistency="$(request_internal_api /api/v1/system-domains/consistency)"
/usr/bin/node "$POLICY" system-domains-primary-tombstone "$pre_consistency" || {
  echo "Refusing pre-activation deactivation without the durable PostgreSQL-primary System Domains tombstone proof." >&2
  exit 1
}

configured_dropins="$(grep -RIl -E 'MES_ENABLE_(SPECIFICATIONS2_(SERVER_(COMMANDS|PUBLISH_COMMANDS)|ATTACHMENT_COMMANDS)|NOMENCLATURE_SERVER_COMMANDS|SYSTEM_DOMAINS_SERVER_COMMANDS|SHIFT_EXECUTION_SERVER_COMMANDS|DIRECTORY_CLUSTER_SERVER_COMMANDS)=1|MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=[^"[:space:]]+' "$DROPIN_DIR" 2>/dev/null || true)"
while IFS= read -r configured; do
  [[ -z "$configured" ]] && continue
  managed=0
  for expected in "${MANAGED_DROPINS[@]}"; do
    [[ "$configured" == "$expected" ]] && managed=1
  done
  [[ $managed -eq 1 ]] || {
    echo "Refusing to disable an unreviewed command owner: $configured" >&2
    exit 1
  }
done <<< "$configured_dropins"

BACKUP_DIR="$(mktemp -d /root/.mes-staged-command-deactivation.XXXXXX)"
APPLIED=0
COMPLETED=0
restore_on_failure() {
  local status=$?
  if [[ $status -ne 0 && $APPLIED -eq 1 ]]; then
    echo "Staged command deactivation failed; restoring every prior managed drop-in." >&2
    for file in "${MANAGED_DROPINS[@]}"; do
      name="$(basename "$file")"
      rm -f "$file"
      [[ -f "${BACKUP_DIR}/${name}" ]] && install -m 0644 "${BACKUP_DIR}/${name}" "$file"
    done
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  rm -rf "$BACKUP_DIR"
  return "$status"
}
trap restore_on_failure EXIT

for file in "${MANAGED_DROPINS[@]}"; do
  [[ -f "$file" ]] && install -m 0644 "$file" "${BACKUP_DIR}/$(basename "$file")"
done
rm -f "${MANAGED_DROPINS[@]}"
APPLIED=1
systemctl daemon-reload
systemctl restart "$SERVICE"

for attempt in $(seq 1 12); do
  main_pid="$(systemctl show --property=MainPID --value "$SERVICE" 2>/dev/null || true)"
  [[ "$main_pid" =~ ^[1-9][0-9]*$ ]] || { sleep 1; continue; }
  process_environment="$(tr '\0' '\n' < "${PROC_ROOT}/${main_pid}/environ" 2>/dev/null || true)"
  readiness="$(request_internal_api /api/v1/domain-readiness 2>/dev/null || true)"
  system_capabilities="$(request_internal_api /api/v1/system-domains/capabilities 2>/dev/null || true)"
  shift_capabilities="$(request_internal_api /api/v1/workshop/shift-execution/capabilities 2>/dev/null || true)"
  directory_types_capabilities="$(request_optional_directory_capability /api/v1/directory/nomenclature-types/capabilities 2>/dev/null || true)"
  directory_boards_capabilities="$(request_optional_directory_capability /api/v1/directory/boards/capabilities 2>/dev/null || true)"
  post_consistency="$(request_internal_api /api/v1/system-domains/consistency 2>/dev/null || true)"
  payload="$(/usr/bin/node --input-type=module -e '
    const [readiness, systemDomainsCapabilities, shiftCapabilities, directoryNomenclatureTypesCapabilities, directoryBoardsCapabilities, processEnvironment] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({
      readinessPayload: JSON.parse(readiness),
      systemDomainsCapabilitiesPayload: JSON.parse(systemDomainsCapabilities),
      shiftCapabilitiesPayload: JSON.parse(shiftCapabilities),
      directoryNomenclatureTypesCapabilitiesPayload: JSON.parse(directoryNomenclatureTypesCapabilities),
      directoryBoardsCapabilitiesPayload: JSON.parse(directoryBoardsCapabilities),
      processEnvironment,
    }));
  ' "$readiness" "$system_capabilities" "$shift_capabilities" "$directory_types_capabilities" "$directory_boards_capabilities" "$process_environment" 2>/dev/null || true)"
  if [[ -n "$payload" ]] \
    && /usr/bin/node "$POLICY" all-command-surfaces-disabled "$payload" \
    && /usr/bin/node "$POLICY" system-domains-primary-tombstone "$post_consistency"; then
    COMPLETED=1
    break
  fi
  sleep 1
done

[[ $COMPLETED -eq 1 ]] || {
  echo "Command-OFF, schema readiness, or PostgreSQL-primary tombstone preservation could not be proved; prior drop-ins will be restored." >&2
  exit 1
}

APPLIED=0
rm -rf "$BACKUP_DIR"
trap - EXIT
echo "All manifest-incompatible command owners are disabled; PostgreSQL-primary data, authority and the System Domains tombstone are preserved."
