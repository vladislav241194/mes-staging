#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

usage() {
  cat >&2 <<'EOF'
Usage: cleanup-disposable-production-structure.sh \
  --token=MOCK-QA-PSM-... \
  --confirm-token=MOCK-QA-PSM-...

Both exact tokens must be identical. The command removes only the one sealed
Pilot disposable Structure aggregate after PostgreSQL and dependency proofs.
EOF
  exit 2
}

TOKEN=""
CONFIRM_TOKEN=""
for argument in "$@"; do
  case "$argument" in
    --token=*) [[ -z "$TOKEN" ]] || usage; TOKEN="${argument#--token=}" ;;
    --confirm-token=*) [[ -z "$CONFIRM_TOKEN" ]] || usage; CONFIRM_TOKEN="${argument#--confirm-token=}" ;;
    *) usage ;;
  esac
done

[[ "$TOKEN" =~ ^MOCK-QA-PSM-[A-Za-z0-9][A-Za-z0-9._-]{5,79}$ ]] || usage
[[ "$CONFIRM_TOKEN" == "$TOKEN" ]] || {
  echo "--confirm-token must exactly equal --token." >&2
  exit 1
}

ACTIVE_APP_DIR="${MES_PILOT_ACTIVE_APP_DIR:-/srv/mes/pilot/app}"
RELEASES_DIR="${MES_PILOT_RELEASES_DIR:-/srv/mes/pilot/releases}"
ENV_FILE="${MES_PILOT_DOMAIN_ENV_FILE:-/etc/mes/mes-pilot-domain.env}"
ROOT_SEAL_HELPER="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
ACTIVE_RECORD="${RELEASES_DIR}/active-release.json"

if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${ACTIVE_APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi

[[ -L "$ACTIVE_APP_DIR" ]] || { echo "Cleanup requires the immutable active release pointer." >&2; exit 1; }
ACTIVE_TARGET="$(readlink -f "$ACTIVE_APP_DIR" 2>/dev/null || true)"
RELEASE_PATH="$(dirname "$ACTIVE_TARGET")"
RELEASE_ID="$(basename "$RELEASE_PATH")"
MANIFEST="${RELEASE_PATH}/release-manifest.json"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || { echo "Unsafe active release id." >&2; exit 1; }
[[ "$ACTIVE_TARGET" == "${RELEASES_DIR}/${RELEASE_ID}/app" ]] || { echo "Active pointer is outside the release root." >&2; exit 1; }
[[ -f "$MANIFEST" && -f "$ROOT_SEAL_HELPER" && -f "$ACTIVE_RECORD" ]] || { echo "Active release seal artifacts are missing." >&2; exit 1; }

/usr/bin/node "$ROOT_SEAL_HELPER" bundle >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" release --releases-root="$RELEASES_DIR" --release-id="$RELEASE_ID" --app="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" pointer --pointer="$ACTIVE_APP_DIR" --expected-target="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" artifact --trusted-root="$RELEASES_DIR" --artifact="$ACTIVE_RECORD" >/dev/null
/usr/bin/node --input-type=module -e '
  import { readFile } from "node:fs/promises";
  const [path, expected] = process.argv.slice(1);
  const record = JSON.parse(await readFile(path, "utf8"));
  if (record?.releaseId !== expected) process.exit(1);
' "$ACTIVE_RECORD" "$RELEASE_ID"
/usr/sbin/runuser -u mes-stage -- /usr/bin/env \
  HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  /usr/bin/node "${ACTIVE_TARGET}/scripts/release-server-command-contract-verify.mjs" \
  --app="$ACTIVE_TARGET" \
  --manifest="$MANIFEST" \
  --expected-release-id="$RELEASE_ID" \
  --contract=system-domains \
  --public-only >/dev/null

[[ -f "$ENV_FILE" && -r "$ENV_FILE" ]] || { echo "Missing protected Pilot domain environment: $ENV_FILE" >&2; exit 1; }
/usr/bin/node --input-type=module -e '
  import { stat } from "node:fs/promises";
  const value = await stat(process.argv[1]);
  if (!value.isFile() || value.uid !== 0 || (value.mode & 0o077) !== 0) process.exit(1);
' "$ENV_FILE" || { echo "Pilot domain environment must be a root-owned private file." >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export APP_ENV="${APP_ENV:-pilot}"
[[ "$APP_ENV" == "pilot" ]] || { echo "Cleanup is restricted to APP_ENV=pilot." >&2; exit 1; }
export MES_DOMAIN_STORAGE=postgres
export MES_DISPOSABLE_STRUCTURE_CLEANUP_SEALED_APP="$ACTIVE_TARGET"
export MES_DISPOSABLE_STRUCTURE_CLEANUP_RELEASE_ID="$RELEASE_ID"

cd "$ACTIVE_TARGET"
exec /usr/bin/node "${ACTIVE_TARGET}/scripts/system-domains-disposable-structure-cleanup.mjs" \
  "--token=${TOKEN}" \
  "--confirm-token=${CONFIRM_TOKEN}"
