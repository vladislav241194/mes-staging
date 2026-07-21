#!/usr/bin/env bash
# Root ExecStartPre gate shared by the Pilot app and every direct PostgreSQL
# writer. Writers never bypass a held identity lock. The app may start only for
# the lock owner's explicit, root-only, kernel-flock-proved verification intent.
set -euo pipefail
set +x

[[ ${EUID} -eq 0 ]] || { echo "Pilot runtime transition gate must run as root." >&2; exit 1; }
[[ $# -eq 1 ]] || { echo "Usage: $0 --consumer=app|writer" >&2; exit 2; }
case "$1" in
  --consumer=app) consumer=app ;;
  --consumer=writer) consumer=writer ;;
  *) echo "Usage: $0 --consumer=app|writer" >&2; exit 2 ;;
esac

readonly BUNDLE_DIR="${MES_PILOT_RUNTIME_SECURITY_BUNDLE_DIR:-}"
[[ "$BUNDLE_DIR" =~ ^/usr/local/libexec/mes/runtime-security-bundles/[0-9a-f]{64}$ ]] \
  || { echo "Runtime transition gate must be entered through the fixed bundle dispatcher." >&2; exit 1; }
readonly ROOT_LOCK_LIBRARY="${BUNDLE_DIR}/pilot-root-identity-lock.sh"
[[ -f "$ROOT_LOCK_LIBRARY" && ! -L "$ROOT_LOCK_LIBRARY" \
  && "$(stat -c '%u:%g:%a' "$ROOT_LOCK_LIBRARY")" == 0:0:555 ]] \
  || { echo "Fixed root identity lock helper is unavailable." >&2; exit 1; }
# shellcheck source=pilot-root-identity-lock.sh
source "$ROOT_LOCK_LIBRARY"

set +e
pilot_open_root_identity_lock "$0" "$@"
lock_status=$?
set -e
case "$lock_status" in
  0)
    pilot_remove_stale_app_verification_intent
    exit 0
    ;;
  "$PILOT_IDENTITY_LOCK_BUSY")
    if [[ "$consumer" == app ]] && pilot_validate_app_verification_intent; then
      echo "Pilot app start admitted only for the proved root lock-owner verification intent." >&2
      exit 0
    fi
    echo "Pilot $consumer start is blocked by an active identity/credential transition." >&2
    exit 1
    ;;
  "$PILOT_IDENTITY_LOCK_UNSAFE")
    echo "Pilot $consumer start is blocked because the identity lock path is unsafe." >&2
    exit 1
    ;;
  *)
    echo "Pilot $consumer start is blocked by an unknown identity lock failure ($lock_status)." >&2
    exit 1
    ;;
esac
