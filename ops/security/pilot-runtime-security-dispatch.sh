#!/usr/bin/env bash
# Stable ABI-v1 bridge from systemd into one complete immutable runtime-security
# bundle. This file is installed once and is never rewritten in place.
set -euo pipefail
set +x

readonly LIBEXEC_ROOT="/usr/local/libexec/mes"
readonly BUNDLES_ROOT="${LIBEXEC_ROOT}/runtime-security-bundles"
readonly ACTIVE_BUNDLE="${LIBEXEC_ROOT}/runtime-security-active"
readonly MANIFEST_NAME="runtime-security-manifest.sha256"

die() {
  echo "Pilot runtime-security dispatch refused an unsafe bundle: $*" >&2
  exit 76
}

[[ $# -ge 1 ]] || die "missing artifact name"
artifact="$1"
shift

case "$artifact" in
  pilot-root-identity-lock.sh|pilot-runtime-transition-gate.sh|pilot-credential-rotation-journal.sh|\
  recover-pilot-uid-cutover.sh|recover-pilot-credential-rotation.sh|check-postgres-credential.mjs) ;;
  *) die "unknown artifact $artifact" ;;
esac
if [[ "$artifact" == check-postgres-credential.mjs ]]; then
  caller_name="$(/usr/bin/id -un)"
  case "$caller_name" in
    mes-pilot)
      expected_uid="$(/usr/bin/id -u mes-pilot)"
      [[ ${EUID} -ne 0 && "${EUID}" == "$expected_uid" && $# -eq 2 \
        && "$1" == --variable=DATABASE_URL && "$2" == --expected-role=mes_app ]] \
        || die "mes-pilot credential-check invocation is not exact"
      ;;
    mes-pilot-migrator)
      expected_uid="$(/usr/bin/id -u mes-pilot-migrator)"
      [[ ${EUID} -ne 0 && "${EUID}" == "$expected_uid" && $# -eq 2 \
        && "$1" == --variable=MES_DOMAIN_MIGRATOR_DATABASE_URL && "$2" == --expected-role=mes_migrator ]] \
        || die "mes-pilot-migrator credential-check invocation is not exact"
      ;;
    *) die "credential checks require an exact dedicated service identity" ;;
  esac
elif [[ ${EUID} -ne 0 ]]; then
  die "root execution is required for $artifact"
fi

for directory in "$LIBEXEC_ROOT" "$BUNDLES_ROOT"; do
  [[ -d "$directory" && ! -L "$directory" && "$(readlink -f -- "$directory")" == "$directory" ]] \
    || die "non-canonical directory $directory"
  [[ "$(stat -c '%u:%g:%a' "$directory")" == 0:0:755 ]] || die "unsafe directory metadata $directory"
done
[[ -L "$ACTIVE_BUNDLE" && "$(stat -c '%u:%g' "$ACTIVE_BUNDLE")" == 0:0 ]] \
  || die "active pointer is not a root-owned symlink"
active_link="$(readlink -- "$ACTIVE_BUNDLE")"
[[ "$active_link" =~ ^runtime-security-bundles/([0-9a-f]{64})$ ]] \
  || die "active pointer is not an exact relative bundle target"
bundle_id="${BASH_REMATCH[1]}"
bundle_dir="${BUNDLES_ROOT}/${bundle_id}"
[[ "$(readlink -f -- "$ACTIVE_BUNDLE")" == "$bundle_dir" \
  && -d "$bundle_dir" && ! -L "$bundle_dir" \
  && "$(stat -c '%u:%g:%a' "$bundle_dir")" == 0:0:555 ]] \
  || die "active bundle directory is unsafe"

expected_names="check-postgres-credential.mjs
pilot-credential-rotation-journal.sh
pilot-root-identity-lock.sh
pilot-runtime-transition-gate.sh
recover-pilot-credential-rotation.sh
recover-pilot-uid-cutover.sh
$MANIFEST_NAME"
actual_names="$(find "$bundle_dir" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)"
[[ "$actual_names" == "$expected_names" ]] || die "bundle membership differs from the ABI-v1 manifest"
manifest="${bundle_dir}/${MANIFEST_NAME}"
[[ -f "$manifest" && ! -L "$manifest" && "$(stat -c '%u:%g:%a:%h' "$manifest")" == 0:0:444:1 ]] \
  || die "manifest metadata is unsafe"
[[ "$(sha256sum "$manifest" | awk '{print $1}')" == "$bundle_id" ]] \
  || die "manifest digest does not match the bundle id"
for name in check-postgres-credential.mjs pilot-credential-rotation-journal.sh \
  pilot-root-identity-lock.sh pilot-runtime-transition-gate.sh \
  recover-pilot-credential-rotation.sh recover-pilot-uid-cutover.sh; do
  path="${bundle_dir}/${name}"
  [[ -f "$path" && ! -L "$path" && "$(stat -c '%u:%g:%a:%h' "$path")" == 0:0:555:1 ]] \
    || die "artifact metadata is unsafe: $name"
done
(cd "$bundle_dir" && sha256sum --check --strict --status "$MANIFEST_NAME") \
  || die "artifact digest verification failed"

export MES_PILOT_RUNTIME_SECURITY_BUNDLE_DIR="$bundle_dir"
if [[ "$artifact" == check-postgres-credential.mjs ]]; then
  exec /usr/bin/node "${bundle_dir}/${artifact}" "$@"
fi
exec "${bundle_dir}/${artifact}" "$@"
