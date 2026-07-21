#!/usr/bin/env bash
# One-time, root-only Pilot cutover from the SSH deploy UID to dedicated,
# locked runtime and migrator identities. It removes command flags found in the
# legacy combined credential env, but leaves reviewed command drop-ins for the
# separate staged OFF bridge. It does not change the active release pointer.
set -euo pipefail
set +x

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

usage() {
  echo "Usage: $0 --release-id=<sealed-staged-release-id>" >&2
  exit 2
}
candidate_release_id=""
for argument in "$@"; do
  case "$argument" in
    --release-id=*) candidate_release_id="${argument#--release-id=}" ;;
    *) usage ;;
  esac
done
[[ "$candidate_release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || usage

readonly RELEASES_DIR="/srv/mes/pilot/releases"
readonly ACTIVE_APP_DIR="/srv/mes/pilot/app"
readonly ACTIVE_TARGET="$(readlink -f "$ACTIVE_APP_DIR")"
readonly ACTIVE_RELEASE_ID="$(basename "$(dirname "$ACTIVE_TARGET")")"
readonly CANDIDATE_RELEASE_DIR="${RELEASES_DIR}/${candidate_release_id}"
readonly CANDIDATE_APP_DIR="${CANDIDATE_RELEASE_DIR}/app"
readonly CANDIDATE_MANIFEST="${CANDIDATE_RELEASE_DIR}/release-manifest.json"
readonly ROOT_SEAL_HELPER="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
readonly PUBLIC_RELEASE_VERIFIER="/usr/local/libexec/mes/active-bundle/release-verify.mjs"
readonly SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || true)"
readonly EXPECTED_SCRIPT="${CANDIDATE_APP_DIR}/ops/security/install-pilot-runtime-uid-isolation.sh"
readonly SERVICE="mes-pilot.service"
readonly SERVICE_FILE="/etc/systemd/system/${SERVICE}"
readonly DROPIN_DIR="/etc/systemd/system/${SERVICE}.d"
readonly BOOTSTRAP_BIND_DROPIN="${DROPIN_DIR}/06-bootstrap-snapshot-bind.conf"
readonly OPERATIONAL_BOOTSTRAP="/srv/mes/pilot/runtime/bootstrap-snapshot.json"
readonly SEALED_BOOTSTRAP_DIR="/srv/mes/pilot/bootstrap-recovery"
readonly SEALED_BOOTSTRAP="${SEALED_BOOTSTRAP_DIR}/bootstrap-snapshot.json"
readonly DOMAIN_ENV="/etc/mes/mes-pilot-domain.env"
readonly MIGRATOR_ENV="/etc/mes/mes-pilot-domain-migrator.env"
readonly ADMIN_ENV="/etc/mes/mes-pilot-admin-auth.env"
readonly PUBLIC_ENV="/etc/mes/mes-pilot-public-auth.env"
readonly EMPLOYEE_ENV="/etc/mes/mes-pilot-employee-auth.env"
readonly BASE_ENV="/etc/mes/mes-pilot.env"
readonly ADMIN_DROPIN="${DROPIN_DIR}/20-admin-auth.conf"
readonly PUBLIC_DROPIN="${DROPIN_DIR}/30-public-auth.conf"
readonly TRANSITION_DROPIN="${DROPIN_DIR}/05-runtime-transition-recovery.conf"
readonly WRITER_TRANSITION_DROPIN_NAME="05-runtime-transition-recovery.conf"
readonly RELEASE_RECOVERY_DEPENDENCY_DROPIN_NAME="10-credential-rotation-recovery.conf"
readonly RELEASE_RECOVERY_APP_DROPIN_DIR="/etc/systemd/system/mes-pilot-release-recovery-app.service.d"
readonly RELEASE_RECOVERY_WRITER_DROPIN_DIR="/etc/systemd/system/mes-pilot-release-recovery-writer.service.d"
readonly RELEASE_RECOVERY_APP_DEPENDENCY_DROPIN="${RELEASE_RECOVERY_APP_DROPIN_DIR}/${RELEASE_RECOVERY_DEPENDENCY_DROPIN_NAME}"
readonly RELEASE_RECOVERY_WRITER_DEPENDENCY_DROPIN="${RELEASE_RECOVERY_WRITER_DROPIN_DIR}/${RELEASE_RECOVERY_DEPENDENCY_DROPIN_NAME}"
readonly UID_CUTOVER_JOURNAL_PARENT="/var/lib/mes"
readonly UID_CUTOVER_JOURNAL="${UID_CUTOVER_JOURNAL_PARENT}/pilot-uid-cutover"
readonly WRITER_QUIESCE_MARKER="/run/lock/mes/pilot-runtime-writers-quiesced"
readonly SCRIPT_DIR="${CANDIDATE_APP_DIR}/ops/security"
readonly REPO_ROOT="$CANDIDATE_APP_DIR"
readonly BOOTSTRAP_BIND_SOURCE="${REPO_ROOT}/ops/frontend/mes-pilot-bootstrap-snapshot-bind.conf"
readonly LIBEXEC_ROOT="/usr/local/libexec/mes"
readonly RUNTIME_BUNDLES_ROOT="${LIBEXEC_ROOT}/runtime-security-bundles"
readonly RUNTIME_ACTIVE_BUNDLE="${LIBEXEC_ROOT}/runtime-security-active"
readonly RUNTIME_DISPATCHER="${LIBEXEC_ROOT}/pilot-runtime-security-dispatch"
readonly RUNTIME_BUNDLE_MANIFEST="runtime-security-manifest.sha256"
readonly -a RUNTIME_BUNDLE_FILES=(
  check-postgres-credential.mjs
  pilot-credential-rotation-journal.sh
  pilot-root-identity-lock.sh
  pilot-runtime-transition-gate.sh
  recover-pilot-credential-rotation.sh
  recover-pilot-uid-cutover.sh
)

[[ -x /usr/bin/node && -f "$ROOT_SEAL_HELPER" && -f "$PUBLIC_RELEASE_VERIFIER" ]] || { echo "Fixed release verifiers are unavailable." >&2; exit 1; }
[[ "$ACTIVE_RELEASE_ID" =~ ^[A-Za-z0-9._-]{1,96}$ \
  && "$ACTIVE_TARGET" == "${RELEASES_DIR}/${ACTIVE_RELEASE_ID}/app" ]] || {
  echo "Active Pilot pointer does not select an exact canonical release." >&2
  exit 1
}
[[ "$SCRIPT_PATH" == "$EXPECTED_SCRIPT" && "$CANDIDATE_APP_DIR" != "$ACTIVE_TARGET" ]] || {
  echo "UID cutover must execute from the exact non-active staged candidate: $EXPECTED_SCRIPT" >&2
  exit 1
}

# The immutable verifier is installed out-of-band under a root-only path. It
# validates the full /srv chain, active pointer, active release and candidate
# release (including the node_modules-only symlink policy) before candidate
# code is trusted as an operations source.
/usr/bin/node "$ROOT_SEAL_HELPER" release \
  --releases-root="$RELEASES_DIR" --release-id="$ACTIVE_RELEASE_ID" --app="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" pointer \
  --pointer="$ACTIVE_APP_DIR" --expected-target="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" release \
  --releases-root="$RELEASES_DIR" --release-id="$candidate_release_id" --app="$CANDIDATE_APP_DIR" >/dev/null
/usr/sbin/runuser -u mes-stage -- /usr/bin/env \
  HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
  /usr/bin/node "$PUBLIC_RELEASE_VERIFIER" \
  --manifest="$CANDIDATE_MANIFEST" --app-root="$CANDIDATE_APP_DIR" \
  --expected-release-id="$candidate_release_id" --public-only >/dev/null

if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${CANDIDATE_APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi

# Stage one complete immutable runtime-security bundle. The active bundle is
# switched only once, atomically, while fd8 owns the identity lock. Fixed
# systemd bridges are installed atomically afterwards, so every crash prefix is
# either the complete old contract or the complete new contract, never a mix of
# helper schemas. These candidate files are covered by the root-seal proof.
for source in \
  "${CANDIDATE_APP_DIR}/ops/security/pilot-root-identity-lock.sh" \
  "${CANDIDATE_APP_DIR}/ops/security/pilot-runtime-transition-gate.sh" \
  "${CANDIDATE_APP_DIR}/ops/security/pilot-credential-rotation-journal.sh" \
  "${CANDIDATE_APP_DIR}/ops/security/recover-pilot-uid-cutover.sh" \
  "${CANDIDATE_APP_DIR}/ops/security/recover-pilot-credential-rotation.sh" \
  "${CANDIDATE_APP_DIR}/ops/security/check-postgres-credential.mjs" \
  "${CANDIDATE_APP_DIR}/ops/security/pilot-runtime-security-dispatch.sh" \
  "${CANDIDATE_APP_DIR}/ops/security/mes-pilot-credential-rotation-recovery.service" \
  "${CANDIDATE_APP_DIR}/ops/security/mes-pilot-release-recovery-app-credential-recovery.conf" \
  "${CANDIDATE_APP_DIR}/ops/security/mes-pilot-release-recovery-writer-credential-recovery.conf" \
  "${CANDIDATE_APP_DIR}/ops/security/mes-pilot-runtime-transition-recovery.conf" \
  "${CANDIDATE_APP_DIR}/ops/security/mes-pilot-writer-transition-recovery.conf"; do
  [[ -f "$source" && ! -L "$source" ]] || { echo "Missing early recovery artifact: $source" >&2; exit 1; }
done
install -d -o root -g root -m 0755 /usr/local/libexec "$LIBEXEC_ROOT" "$RUNTIME_BUNDLES_ROOT"
for directory in /usr/local/libexec "$LIBEXEC_ROOT" "$RUNTIME_BUNDLES_ROOT"; do
  [[ -d "$directory" && ! -L "$directory" && "$(readlink -f -- "$directory")" == "$directory" \
    && "$(stat -c '%u:%g:%a' "$directory")" == 0:0:755 ]] \
    || { echo "Unsafe runtime bundle directory: $directory" >&2; exit 1; }
done

runtime_bundle_stage="$(mktemp -d "${RUNTIME_BUNDLES_ROOT}/.prepare.XXXXXX")"
chown root:root "$runtime_bundle_stage"
chmod 0755 "$runtime_bundle_stage"
for name in "${RUNTIME_BUNDLE_FILES[@]}"; do
  install -o root -g root -m 0555 "${SCRIPT_DIR}/${name}" "${runtime_bundle_stage}/${name}"
done
(
  cd "$runtime_bundle_stage"
  LC_ALL=C sha256sum "${RUNTIME_BUNDLE_FILES[@]}" > "$RUNTIME_BUNDLE_MANIFEST"
)
chown root:root "${runtime_bundle_stage}/${RUNTIME_BUNDLE_MANIFEST}"
chmod 0444 "${runtime_bundle_stage}/${RUNTIME_BUNDLE_MANIFEST}"
for name in "${RUNTIME_BUNDLE_FILES[@]}" "$RUNTIME_BUNDLE_MANIFEST"; do sync -f "${runtime_bundle_stage}/${name}"; done
sync -f "$runtime_bundle_stage"
runtime_bundle_id="$(sha256sum "${runtime_bundle_stage}/${RUNTIME_BUNDLE_MANIFEST}" | awk '{print $1}')"
[[ "$runtime_bundle_id" =~ ^[0-9a-f]{64}$ ]] || { echo "Cannot derive runtime bundle id." >&2; exit 1; }
runtime_bundle_target="${RUNTIME_BUNDLES_ROOT}/${runtime_bundle_id}"
chmod 0555 "$runtime_bundle_stage"

verify_runtime_bundle_target() {
  local target="$1" expected_id="$2" name
  [[ "$expected_id" =~ ^[0-9a-f]{64}$ \
    && "$target" == "${RUNTIME_BUNDLES_ROOT}/${expected_id}" \
    && -d "$target" && ! -L "$target" \
    && "$(stat -c '%u:%g:%a' "$target")" == 0:0:555 \
    && "$(find "$target" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)" == "$(printf '%s\n' "${RUNTIME_BUNDLE_FILES[@]}" "$RUNTIME_BUNDLE_MANIFEST" | LC_ALL=C sort)" ]] \
    || return 1
  [[ -f "${target}/${RUNTIME_BUNDLE_MANIFEST}" && ! -L "${target}/${RUNTIME_BUNDLE_MANIFEST}" \
    && "$(stat -c '%u:%g:%a:%h' "${target}/${RUNTIME_BUNDLE_MANIFEST}")" == 0:0:444:1 \
    && "$(sha256sum "${target}/${RUNTIME_BUNDLE_MANIFEST}" | awk '{print $1}')" == "$expected_id" ]] \
    || return 1
  for name in "${RUNTIME_BUNDLE_FILES[@]}"; do
    [[ -f "${target}/${name}" && ! -L "${target}/${name}" \
      && "$(stat -c '%u:%g:%a:%h' "${target}/${name}")" == 0:0:555:1 ]] || return 1
  done
  (cd "$target" && sha256sum --check --strict --status "$RUNTIME_BUNDLE_MANIFEST")
}

if [[ -e "$runtime_bundle_target" || -L "$runtime_bundle_target" ]]; then
  verify_runtime_bundle_target "$runtime_bundle_target" "$runtime_bundle_id" \
    || { echo "Existing runtime bundle target is unsafe or corrupt." >&2; exit 1; }
  rm -rf -- "$runtime_bundle_stage"
else
  mv -T -- "$runtime_bundle_stage" "$runtime_bundle_target"
  sync -f "$RUNTIME_BUNDLES_ROOT"
fi
verify_runtime_bundle_target "$runtime_bundle_target" "$runtime_bundle_id" \
  || { echo "Staged runtime bundle failed exact pre-publication verification." >&2; exit 1; }

install_root_file_atomically() {
  local source="$1" target="$2" mode="$3" temporary
  temporary="$(mktemp "${target}.install.XXXXXX")"
  install -o root -g root -m "$mode" "$source" "$temporary"
  sync -f "$temporary"
  mv -fT -- "$temporary" "$target"
  sync -f "$(dirname "$target")"
}

ensure_root_systemd_dropin_directory() {
  local directory="$1"
  [[ -d /etc/systemd/system && ! -L /etc/systemd/system \
    && "$(readlink -f -- /etc/systemd/system)" == /etc/systemd/system \
    && "$(stat -c '%u:%g:%a' /etc/systemd/system)" == 0:0:755 ]] \
    || { echo "Unsafe systemd unit root." >&2; exit 1; }
  if [[ ! -e "$directory" && ! -L "$directory" ]]; then
    install -d -o root -g root -m 0755 "$directory"
    sync -f "$(dirname "$directory")"
  fi
  [[ -d "$directory" && ! -L "$directory" \
    && "$(readlink -f -- "$directory")" == "$directory" \
    && "$(stat -c '%u:%g:%a' "$directory")" == 0:0:755 ]] \
    || { echo "Unsafe release-recovery dependency drop-in directory: $directory" >&2; exit 1; }
}

install_persistent_release_recovery_dependency() {
  local source="$1" target="$2" directory
  directory="$(dirname "$target")"
  ensure_root_systemd_dropin_directory "$directory"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" && ! -L "$target" \
      && "$(readlink -f -- "$target")" == "$target" \
      && "$(stat -c '%u:%g:%a:%h' "$target")" == 0:0:644:1 \
      && -f "$source" && ! -L "$source" ]] \
      || { echo "Unsafe release-recovery dependency drop-in: $target" >&2; exit 1; }
    cmp -s "$source" "$target" \
      || { echo "Existing release-recovery dependency drop-in differs: $target" >&2; exit 1; }
  else
    install_root_file_atomically "$source" "$target" 0644
  fi
  [[ -f "$target" && ! -L "$target" \
    && "$(readlink -f -- "$target")" == "$target" \
    && "$(stat -c '%u:%g:%a:%h' "$target")" == 0:0:644:1 ]] \
    || { echo "Installed release-recovery dependency drop-in is unsafe: $target" >&2; exit 1; }
  cmp -s "$source" "$target" \
    || { echo "Installed release-recovery dependency drop-in failed verification: $target" >&2; exit 1; }
}

# The dispatcher is an invariant ABI-v1 bridge. Once present it must be an
# exact byte-for-byte match; it is never upgraded in place around an active
# pointer.
if [[ -e "$RUNTIME_DISPATCHER" || -L "$RUNTIME_DISPATCHER" ]]; then
  [[ -f "$RUNTIME_DISPATCHER" && ! -L "$RUNTIME_DISPATCHER" \
    && "$(stat -c '%u:%g:%a:%h' "$RUNTIME_DISPATCHER")" == 0:0:755:1 ]] \
    || { echo "Installed runtime-security dispatcher differs from ABI v1." >&2; exit 1; }
  cmp -s "${SCRIPT_DIR}/pilot-runtime-security-dispatch.sh" "$RUNTIME_DISPATCHER" \
    || { echo "Installed runtime-security dispatcher differs from ABI v1." >&2; exit 1; }
else
  install_root_file_atomically "${SCRIPT_DIR}/pilot-runtime-security-dispatch.sh" "$RUNTIME_DISPATCHER" 0755
fi

readonly ROOT_LOCK_LIBRARY="${SCRIPT_DIR}/pilot-root-identity-lock.sh"
[[ -f "$ROOT_LOCK_LIBRARY" && ! -L "$ROOT_LOCK_LIBRARY" ]] \
  || { echo "Sealed candidate identity lock helper is unavailable." >&2; exit 1; }
# shellcheck source=pilot-root-identity-lock.sh
source "$ROOT_LOCK_LIBRARY"
set +e
pilot_open_root_identity_lock "$0" "$@"
lock_status=$?
set -e
case "$lock_status" in
  0) export MES_PILOT_IDENTITY_LOCK_HELD=1 ;;
  "$PILOT_IDENTITY_LOCK_BUSY") echo "Another Pilot identity or credential operation is active." >&2; exit 1 ;;
  "$PILOT_IDENTITY_LOCK_UNSAFE") echo "Pilot identity lock path is unsafe." >&2; exit 1 ;;
  *) echo "Pilot identity lock failed with unknown status $lock_status." >&2; exit 1 ;;
esac
pilot_remove_stale_app_verification_intent

old_runtime_link=""
if [[ -e "$RUNTIME_ACTIVE_BUNDLE" && ! -L "$RUNTIME_ACTIVE_BUNDLE" ]]; then
  echo "Runtime-security active pointer is not a symlink." >&2
  exit 1
fi
if [[ -L "$RUNTIME_ACTIVE_BUNDLE" ]]; then
  old_runtime_link="$(readlink -- "$RUNTIME_ACTIVE_BUNDLE")"
  [[ "$old_runtime_link" =~ ^runtime-security-bundles/[0-9a-f]{64}$ ]] \
    || { echo "Existing runtime-security pointer is unsafe." >&2; exit 1; }
  "$RUNTIME_DISPATCHER" pilot-root-identity-lock.sh \
    || { echo "Existing runtime-security pointer does not select a verified bundle." >&2; exit 1; }
fi
runtime_pointer_temporary="${RUNTIME_ACTIVE_BUNDLE}.new.$$"
[[ ! -e "$runtime_pointer_temporary" && ! -L "$runtime_pointer_temporary" ]] \
  || { echo "Runtime-security temporary pointer already exists." >&2; exit 1; }
ln -s "runtime-security-bundles/${runtime_bundle_id}" "$runtime_pointer_temporary"
chown -h root:root "$runtime_pointer_temporary"
sync -f "$LIBEXEC_ROOT"
mv -Tf -- "$runtime_pointer_temporary" "$RUNTIME_ACTIVE_BUNDLE"
sync -f "$LIBEXEC_ROOT"
set +e
"$RUNTIME_DISPATCHER" pilot-root-identity-lock.sh
runtime_dispatch_status=$?
set -e
if [[ $runtime_dispatch_status -ne 0 ]]; then
  if [[ -n "$old_runtime_link" ]]; then
    runtime_pointer_rollback="${RUNTIME_ACTIVE_BUNDLE}.rollback.$$"
    ln -s "$old_runtime_link" "$runtime_pointer_rollback"
    chown -h root:root "$runtime_pointer_rollback"
    sync -f "$LIBEXEC_ROOT"
    mv -Tf -- "$runtime_pointer_rollback" "$RUNTIME_ACTIVE_BUNDLE"
  else
    rm -f -- "$RUNTIME_ACTIVE_BUNDLE"
  fi
  sync -f "$LIBEXEC_ROOT"
  if [[ -n "$old_runtime_link" ]]; then
    "$RUNTIME_DISPATCHER" pilot-root-identity-lock.sh \
      || { echo "Runtime bundle publication and rollback validation both failed." >&2; exit 1; }
  fi
  echo "Runtime bundle publication failed validation; the previous pointer state was restored." >&2
  exit 1
fi

install -d -o root -g root -m 0755 "$DROPIN_DIR"
install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-credential-rotation-recovery.service" \
  /etc/systemd/system/mes-pilot-credential-rotation-recovery.service 0644
# Root-trust bootstrap intentionally publishes release-recovery units with an
# ordering edge only, because this credential-recovery service does not exist
# on the first bootstrap. Publish both persistent hard-dependency drop-ins now,
# before the first daemon-reload and before any identity or journal mutation.
# The service file is installed first, so every power-loss/reboot prefix that
# contains a Requires edge also contains its required unit.
install_persistent_release_recovery_dependency \
  "${SCRIPT_DIR}/mes-pilot-release-recovery-app-credential-recovery.conf" \
  "$RELEASE_RECOVERY_APP_DEPENDENCY_DROPIN"
install_persistent_release_recovery_dependency \
  "${SCRIPT_DIR}/mes-pilot-release-recovery-writer-credential-recovery.conf" \
  "$RELEASE_RECOVERY_WRITER_DEPENDENCY_DROPIN"
install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-runtime-transition-recovery.conf" "$TRANSITION_DROPIN" 0644
for unit in mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service; do
  writer_dropin_dir="/etc/systemd/system/${unit}.d"
  install -d -o root -g root -m 0755 "$writer_dropin_dir"
  install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-writer-transition-recovery.conf" \
    "${writer_dropin_dir}/${WRITER_TRANSITION_DROPIN_NAME}" 0644
done
systemctl daemon-reload

# Identity creation is an idempotent, inert pre-journal phase. A SIGKILL can
# leave only locked accounts behind; the next run repairs and verifies their
# exact group contract before any journal or runtime mutation can exist.
getent group mes-pilot >/dev/null || groupadd --system mes-pilot
getent group mes-pilot-migrator >/dev/null || groupadd --system mes-pilot-migrator
getent group mes-pilot-data >/dev/null || groupadd --system mes-pilot-data
getent passwd mes-pilot >/dev/null \
  || useradd --system --gid mes-pilot --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin mes-pilot
getent passwd mes-pilot-migrator >/dev/null \
  || useradd --system --gid mes-pilot-migrator --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin mes-pilot-migrator
usermod --gid mes-pilot --groups mes-pilot-data --lock --shell /usr/sbin/nologin --home /nonexistent mes-pilot
usermod --gid mes-pilot-migrator --groups mes-pilot-data --lock --shell /usr/sbin/nologin --home /nonexistent mes-pilot-migrator

assert_exact_identity() {
  local user="$1" primary_group="$2" expected_groups="$3"
  local uid gid home shell password_state actual_groups
  uid="$(id -u "$user")"; gid="$(id -g "$user")"
  [[ "$uid" =~ ^[1-9][0-9]*$ && "$gid" =~ ^[1-9][0-9]*$ ]] \
    || { echo "$user must have nonzero numeric UID/GID." >&2; return 1; }
  [[ "$(id -gn "$user")" == "$primary_group" ]] \
    || { echo "$user has an unexpected primary group." >&2; return 1; }
  IFS=: read -r _ _ _ _ _ home shell < <(getent passwd "$user")
  [[ "$home" == /nonexistent && "$shell" == /usr/sbin/nologin ]] \
    || { echo "$user must be a locked nologin identity with /nonexistent home." >&2; return 1; }
  password_state="$(passwd -S "$user" | awk '{print $2}')"
  [[ "$password_state" == L || "$password_state" == LK ]] \
    || { echo "$user password is not locked." >&2; return 1; }
  actual_groups="$(id -nG "$user" | tr ' ' '\n' | sort -u | paste -sd, -)"
  [[ "$actual_groups" == "$expected_groups" ]] \
    || { echo "$user groups are not exact: $actual_groups" >&2; return 1; }
}
assert_exact_identity mes-pilot mes-pilot mes-pilot,mes-pilot-data
assert_exact_identity mes-pilot-migrator mes-pilot-migrator mes-pilot-data,mes-pilot-migrator
runtime_uid="$(id -u mes-pilot)"; migrator_uid="$(id -u mes-pilot-migrator)"; deploy_uid="$(id -u deploy)"
runtime_gid="$(getent group mes-pilot | cut -d: -f3)"
migrator_gid="$(getent group mes-pilot-migrator | cut -d: -f3)"
data_gid="$(getent group mes-pilot-data | cut -d: -f3)"
[[ "$runtime_gid" =~ ^[1-9][0-9]*$ && "$migrator_gid" =~ ^[1-9][0-9]*$ && "$data_gid" =~ ^[1-9][0-9]*$ \
  && "$runtime_uid" != "$migrator_uid" && "$runtime_uid" != "$deploy_uid" && "$migrator_uid" != "$deploy_uid" \
  && "$runtime_gid" != "$migrator_gid" && "$runtime_gid" != "$data_gid" && "$migrator_gid" != "$data_gid" ]] \
  || { echo "Pilot service identities/groups must have distinct nonzero numeric IDs." >&2; exit 1; }
if id -nG deploy | tr ' ' '\n' | grep -qxE 'mes-pilot|mes-pilot-migrator|mes-pilot-data'; then
  echo "deploy must not be a member of any service identity group." >&2
  exit 1
fi

# No direct writer may pass the recovery gate while this root lock is held.
# Runtime masks are ephemeral across reboot; the root-only marker lets the
# fixed pre-start recovery unmask and restore the prior timer in the same boot.
timer_was_active=0
systemctl is-active --quiet mes-pilot-domain-snapshot-sync.timer && timer_was_active=1
for unit in mes-pilot-domain-migrate.service mes-pilot-domain-import.service; do
  writer_main_pid="$(systemctl show "$unit" --property=MainPID --value 2>/dev/null || true)"
  [[ "$writer_main_pid" =~ ^[0-9]+$ ]] || { echo "Cannot classify $unit MainPID." >&2; exit 1; }
  [[ "$writer_main_pid" -eq 0 ]] || { echo "Refusing identity cutover while $unit has a live MainPID." >&2; exit 1; }
done
[[ ! -e "$WRITER_QUIESCE_MARKER" && ! -L "$WRITER_QUIESCE_MARKER" ]] \
  || { echo "Unresolved writer-quiesce marker exists; run fixed recovery before retrying." >&2; exit 1; }
marker_temporary="$(mktemp "${WRITER_QUIESCE_MARKER}.XXXXXX")"
printf 'TIMER_WAS_ACTIVE=%s\n' "$timer_was_active" > "$marker_temporary"
chown root:root "$marker_temporary"
chmod 0600 "$marker_temporary"
sync -f "$marker_temporary"
mv -fT -- "$marker_temporary" "$WRITER_QUIESCE_MARKER"
sync -f "$(dirname "$WRITER_QUIESCE_MARKER")"
[[ $timer_was_active -eq 1 ]] && systemctl stop mes-pilot-domain-snapshot-sync.timer
pilot_stop_running_consumer mes-pilot-domain-migrate.service
pilot_stop_running_consumer mes-pilot-domain-import.service
pilot_stop_running_consumer mes-pilot-domain-snapshot-sync.service
systemctl mask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null
units_masked=1
writers_quiesced=1

restore_timer_state() {
  local expected="$1"
  [[ "$expected" =~ ^[01]$ ]] || return 1
  if [[ "$expected" -eq 1 ]]; then
    systemctl start mes-pilot-domain-snapshot-sync.timer
    systemctl is-active --quiet mes-pilot-domain-snapshot-sync.timer
  else
    systemctl stop mes-pilot-domain-snapshot-sync.timer
    ! systemctl is-active --quiet mes-pilot-domain-snapshot-sync.timer
  fi
}

readonly BACKUP_DIR="$(mktemp -d /root/.mes-pilot-runtime-uid-cutover.XXXXXX)"
cleanup_secret_backup() {
  [[ -d "$BACKUP_DIR" ]] || return 0
  find "$BACKUP_DIR" -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$BACKUP_DIR" || true
  if [[ ${writers_quiesced:-0} -eq 1 && ! -d ${UID_CUTOVER_JOURNAL:-/nonexistent} \
    && ${cutover_committed:-0} -eq 0 ]]; then
    systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
    if restore_timer_state "${timer_was_active:-0}" >/dev/null 2>&1; then
      rm -f -- "${WRITER_QUIESCE_MARKER:-/run/lock/mes/nonexistent}" || true
      sync -f "$(dirname "${WRITER_QUIESCE_MARKER:-/run/lock/mes/nonexistent}")" || true
      writers_quiesced=0
    else
      echo "Writer-quiesce marker retained because the timer state was not restored." >&2
    fi
  fi
}
trap cleanup_secret_backup EXIT

assert_real_directory() {
  local path="$1"
  [[ -d "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" ]] \
    || { echo "Pilot runtime path must be a canonical real directory: $path" >&2; exit 1; }
}
assert_real_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" ]] \
    || { echo "Pilot runtime path must be a canonical regular file: $path" >&2; exit 1; }
}
assert_optional_real_file() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then assert_real_file "$path"; fi
}
assert_plain_tree() {
  local path="$1"
  local unsafe
  unsafe="$(find "$path" -xdev \( ! -type d -a ! -type f \) -print -quit)"
  [[ -z "$unsafe" ]] || { echo "Pilot mutable tree contains a symlink or special node: $unsafe" >&2; exit 1; }
  unsafe="$(find "$path" -xdev -type f -links +1 -print -quit)"
  [[ -z "$unsafe" ]] || { echo "Pilot mutable tree contains a multiply-linked file: $unsafe" >&2; exit 1; }
}
chown_tree_from_to() {
  local old_user="$1"
  local old_group="$2"
  local new_owner="$3"
  shift 3
  local path
  for path in "$@"; do
    # The preflight has already rejected symlinks, special files and hardlinks.
    # -xdev still prevents a nested mount from expanding the cutover boundary.
    find "$path" -xdev -user "$old_user" -group "$old_group" \
      -exec chown "$new_owner" -- {} +
  done
}

# Verify every mutable bind path before stat/install/chown or systemd receives
# it as ReadWritePaths. Runtime may be absent on the first cutover; create only
# that exact leaf after the fixed verifier proved the canonical parent chain.
for path in /srv/mes/pilot/shared-state /srv/mes/pilot/backups /srv/mes/pilot/audit; do assert_real_directory "$path"; done
if [[ ! -e /srv/mes/pilot/runtime && ! -L /srv/mes/pilot/runtime ]]; then mkdir --mode=0700 /srv/mes/pilot/runtime; fi
assert_real_directory /srv/mes/pilot/runtime
for path in /srv/mes/pilot/shared-state /srv/mes/pilot/backups /srv/mes/pilot/audit /srv/mes/pilot/runtime; do assert_plain_tree "$path"; done
assert_real_file /srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json
assert_real_file "$OPERATIONAL_BOOTSTRAP"
assert_real_directory "$SEALED_BOOTSTRAP_DIR"
assert_real_file "$SEALED_BOOTSTRAP"
[[ "$(stat -c '%u:%g:%a:%h' "$OPERATIONAL_BOOTSTRAP")" == "0:0:444:1" ]] \
  || { echo "Operational bootstrap snapshot must be root:root 0444 with one link." >&2; exit 1; }
/usr/sbin/runuser -u deploy -- test -r "$OPERATIONAL_BOOTSTRAP" \
  || { echo "deploy cannot read the pre-cutover operational bootstrap snapshot." >&2; exit 1; }
[[ "$(stat -c '%u:%g:%a' "$SEALED_BOOTSTRAP_DIR")" == "0:0:700" \
  && "$(stat -c '%u:%g:%a:%h' "$SEALED_BOOTSTRAP")" == "0:0:444:1" ]] \
  || { echo "Sealed bootstrap bind source metadata is invalid." >&2; exit 1; }
cmp -s "$OPERATIONAL_BOOTSTRAP" "$SEALED_BOOTSTRAP" \
  || { echo "Sealed bootstrap bind source differs from the operational snapshot." >&2; exit 1; }
for identity in deploy mes-stage; do
  if /usr/sbin/runuser -u "$identity" -- test -r "$SEALED_BOOTSTRAP" \
    || /usr/sbin/runuser -u "$identity" -- test -w "$SEALED_BOOTSTRAP_DIR"; then
    echo "$identity can access or replace the sealed bootstrap bind source." >&2
    exit 1
  fi
done
assert_optional_real_file /srv/mes/pilot/backups/domain-export-initial.json
assert_optional_real_file /srv/mes/pilot/audit/audit.log
assert_optional_real_file /srv/mes/pilot/shared-state/.shift-execution-authority-rollback.json
assert_real_file "$SERVICE_FILE"
assert_real_file "$DOMAIN_ENV"
assert_real_file "$PUBLIC_ENV"
assert_real_file "$EMPLOYEE_ENV"
assert_real_file "$ADMIN_DROPIN"
for path in \
  "$MIGRATOR_ENV" "$ADMIN_ENV" "$BASE_ENV" "$PUBLIC_DROPIN" "$TRANSITION_DROPIN" \
  "${DROPIN_DIR}/10-hardening.conf" \
  /etc/systemd/system/mes-pilot-domain-migrate.service \
  /etc/systemd/system/mes-pilot-domain-import.service \
  /etc/systemd/system/mes-pilot-domain-snapshot-sync.service \
  /etc/systemd/system/mes-pilot-domain-snapshot-sync.timer \
  /etc/systemd/system/mes-pilot-domain-runtime-credential-check.service \
  /etc/systemd/system/mes-pilot-domain-migrator-credential-check.service \
  /etc/systemd/system/mes-pilot-credential-rotation-recovery.service \
  "$RELEASE_RECOVERY_APP_DEPENDENCY_DROPIN" \
  "$RELEASE_RECOVERY_WRITER_DEPENDENCY_DROPIN" \
  "$RUNTIME_DISPATCHER"; do
  assert_optional_real_file "$path"
done
assert_real_file "$BOOTSTRAP_BIND_DROPIN"
assert_real_file "$BOOTSTRAP_BIND_SOURCE"
cmp -s "$BOOTSTRAP_BIND_SOURCE" "$BOOTSTRAP_BIND_DROPIN" \
  || { echo "Installed bootstrap bind drop-in differs from the sealed candidate contract." >&2; exit 1; }

# Defense in depth after the fixed helper's recursive release/pointer proof.
if runuser -u deploy -- test -w /srv/mes/pilot \
  || runuser -u deploy -- test -w /srv/mes/pilot/releases \
  || runuser -u deploy -- test -w /srv/mes/pilot/app \
  || runuser -u deploy -- test -w "$ACTIVE_TARGET"; then
  echo "deploy can replace or write the active application; seal the release first." >&2
  exit 1
fi

for source in \
  "${REPO_ROOT}/deploy/systemd/mes-pilot.service" \
  "${REPO_ROOT}/deploy/env/mes-pilot.env.example" \
  "${REPO_ROOT}/ops/postgres/mes-pilot-domain-migrate.service" \
  "${REPO_ROOT}/ops/postgres/mes-pilot-domain-import.service" \
  "${REPO_ROOT}/ops/postgres/mes-pilot-domain-snapshot-sync.service" \
  "${REPO_ROOT}/ops/postgres/mes-pilot-domain-snapshot-sync.timer" \
  "${SCRIPT_DIR}/mes-pilot-domain-runtime-credential-check.service" \
  "${SCRIPT_DIR}/mes-pilot-domain-migrator-credential-check.service" \
  "${SCRIPT_DIR}/mes-pilot-admin-auth.conf" \
  "${SCRIPT_DIR}/mes-pilot-public-auth.conf" \
  "${SCRIPT_DIR}/check-postgres-credential.mjs" \
  "${SCRIPT_DIR}/pilot-root-identity-lock.sh" \
  "${SCRIPT_DIR}/pilot-runtime-security-dispatch.sh" \
  "${SCRIPT_DIR}/pilot-runtime-transition-gate.sh" \
  "${SCRIPT_DIR}/pilot-credential-rotation-journal.sh" \
  "${SCRIPT_DIR}/recover-pilot-uid-cutover.sh" \
  "${SCRIPT_DIR}/recover-pilot-credential-rotation.sh" \
  "${SCRIPT_DIR}/mes-pilot-credential-rotation-recovery.service" \
  "${SCRIPT_DIR}/mes-pilot-release-recovery-app-credential-recovery.conf" \
  "${SCRIPT_DIR}/mes-pilot-release-recovery-writer-credential-recovery.conf" \
  "${SCRIPT_DIR}/mes-pilot-runtime-transition-recovery.conf" \
  "${SCRIPT_DIR}/mes-pilot-writer-transition-recovery.conf" \
  "${SCRIPT_DIR}/pilot-base-env-migrate.mjs" \
  "${SCRIPT_DIR}/pilot-secret-env-rewrite.mjs" \
  "${SCRIPT_DIR}/verify-pilot-runtime-uid-isolation.sh" \
  "${SCRIPT_DIR}/rotate-pilot-credentials.sh"; do
  [[ -f "$source" && ! -L "$source" ]] || { echo "Missing trusted cutover artifact: $source" >&2; exit 1; }
done
[[ -f "$BOOTSTRAP_BIND_SOURCE" && ! -L "$BOOTSTRAP_BIND_SOURCE" ]] \
  || { echo "Missing trusted bootstrap bind contract: $BOOTSTRAP_BIND_SOURCE" >&2; exit 1; }

# The immutable bundle pointer, invariant dispatcher, recovery unit, persistent
# release-recovery dependency bridges and every app/writer gate were installed
# before identity creation. They intentionally stay in place across legacy
# rollback so any durable journal is recovered before a later boot or direct
# writer start.

install -d -o root -g root -m 0700 /etc/mes "$BACKUP_DIR"

managed_paths=(
  "$SERVICE_FILE"
  "$DOMAIN_ENV"
  "$MIGRATOR_ENV"
  "$ADMIN_ENV"
  "$PUBLIC_ENV"
  "$EMPLOYEE_ENV"
  "$BASE_ENV"
  "${DROPIN_DIR}/10-hardening.conf"
  "$ADMIN_DROPIN"
  "$PUBLIC_DROPIN"
  "$BOOTSTRAP_BIND_DROPIN"
  "/etc/systemd/system/mes-pilot-domain-migrate.service"
  "/etc/systemd/system/mes-pilot-domain-import.service"
  "/etc/systemd/system/mes-pilot-domain-snapshot-sync.service"
  "/etc/systemd/system/mes-pilot-domain-snapshot-sync.timer"
  "/etc/systemd/system/mes-pilot-domain-runtime-credential-check.service"
  "/etc/systemd/system/mes-pilot-domain-migrator-credential-check.service"
  "/etc/systemd/system/mes-pilot-credential-rotation-recovery.service"
)
for path in "${managed_paths[@]}"; do
  if [[ -e "$path" || -L "$path" ]]; then
    install -d -m 0700 "${BACKUP_DIR}$(dirname "$path")"
    cp -a -- "$path" "${BACKUP_DIR}${path}"
  fi
done

state_file="/srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json"
import_export_file="/srv/mes/pilot/backups/domain-export-initial.json"
shared_mode="$(stat -c %a /srv/mes/pilot/shared-state)"
backup_mode="$(stat -c %a /srv/mes/pilot/backups)"
audit_mode="$(stat -c %a /srv/mes/pilot/audit)"
runtime_mode="$(stat -c %a /srv/mes/pilot/runtime)"
shared_owner="$(stat -c %u:%g /srv/mes/pilot/shared-state)"
backup_owner="$(stat -c %u:%g /srv/mes/pilot/backups)"
audit_owner="$(stat -c %u:%g /srv/mes/pilot/audit)"
runtime_owner="$(stat -c %u:%g /srv/mes/pilot/runtime)"
state_mode=""
import_export_mode=""
state_owner=""
import_export_owner=""
[[ -f "$state_file" ]] && { state_mode="$(stat -c %a "$state_file")"; state_owner="$(stat -c %u:%g "$state_file")"; }
[[ -f "$import_export_file" ]] && { import_export_mode="$(stat -c %a "$import_export_file")"; import_export_owner="$(stat -c %u:%g "$import_export_file")"; }
cutover_committed=0

prepare_uid_cutover_journal() {
  local temporary path present import_metadata
  [[ -d /var/lib && ! -L /var/lib && "$(readlink -f -- /var/lib)" == /var/lib \
    && "$(stat -c '%u:%g' /var/lib)" == 0:0 ]] || { echo "Unsafe /var/lib for UID-cutover journal." >&2; return 1; }
  if [[ -e "$UID_CUTOVER_JOURNAL_PARENT" || -L "$UID_CUTOVER_JOURNAL_PARENT" ]]; then
    [[ -d "$UID_CUTOVER_JOURNAL_PARENT" && ! -L "$UID_CUTOVER_JOURNAL_PARENT" \
      && "$(readlink -f -- "$UID_CUTOVER_JOURNAL_PARENT")" == "$UID_CUTOVER_JOURNAL_PARENT" \
      && "$(stat -c '%u:%g' "$UID_CUTOVER_JOURNAL_PARENT")" == 0:0 ]] || return 1
    chmod 0700 "$UID_CUTOVER_JOURNAL_PARENT"
  else
    install -d -o root -g root -m 0700 "$UID_CUTOVER_JOURNAL_PARENT"
  fi
  [[ ! -e "$UID_CUTOVER_JOURNAL" && ! -L "$UID_CUTOVER_JOURNAL" ]] \
    || { echo "Unresolved Pilot UID-cutover journal exists; start Pilot recovery before retrying." >&2; return 1; }
  while IFS= read -r -d '' abandoned; do
    [[ -d "$abandoned" && ! -L "$abandoned" && "$(stat -c '%u:%g' "$abandoned")" == 0:0 ]] || return 1
    find "$abandoned" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
    rm -rf -- "$abandoned"
  done < <(find "$UID_CUTOVER_JOURNAL_PARENT" -xdev -mindepth 1 -maxdepth 1 -type d -name 'pilot-uid-cutover.prepare.*' -print0)

  temporary="$(mktemp -d "${UID_CUTOVER_JOURNAL}.prepare.XXXXXX")"
  chown root:root "$temporary"
  chmod 0700 "$temporary"
  install -d -o root -g root -m 0700 "$temporary/files"
  cp -a -- "$BACKUP_DIR"/. "$temporary/files"/
  : > "$temporary/managed-paths"
  for path in "${managed_paths[@]}"; do
    present=0
    [[ -e "${BACKUP_DIR}${path}" || -L "${BACKUP_DIR}${path}" ]] && present=1
    printf '%s|%s\n' "$present" "$path" >> "$temporary/managed-paths"
  done
  import_metadata=absent
  [[ -f "$import_export_file" ]] && import_metadata="$(stat -c '%u:%g:%a' "$import_export_file")"
  {
    printf 'SHARED=%s\n' "$(stat -c '%u:%g:%a' /srv/mes/pilot/shared-state)"
    printf 'BACKUPS=%s\n' "$(stat -c '%u:%g:%a' /srv/mes/pilot/backups)"
    printf 'AUDIT=%s\n' "$(stat -c '%u:%g:%a' /srv/mes/pilot/audit)"
    printf 'RUNTIME=%s\n' "$(stat -c '%u:%g:%a' /srv/mes/pilot/runtime)"
    printf 'STATE=%s\n' "$(stat -c '%u:%g:%a' "$state_file")"
    printf 'IMPORT_EXPORT=%s\n' "$import_metadata"
    printf 'TIMER_WAS_ACTIVE=%s\n' "$timer_was_active"
  } > "$temporary/metadata"
  printf '%s\n' prepared > "$temporary/phase"
  chown root:root "$temporary/managed-paths" "$temporary/metadata" "$temporary/phase"
  chmod 0600 "$temporary/managed-paths" "$temporary/metadata" "$temporary/phase"
  find "$temporary" -xdev -type f -exec sync -f -- {} \;
  sync -f "$temporary/files"
  sync -f "$temporary"
  mv -T -- "$temporary" "$UID_CUTOVER_JOURNAL"
  sync -f "$UID_CUTOVER_JOURNAL_PARENT"
}

set_uid_cutover_journal_phase() {
  local phase="$1" temporary
  [[ "$phase" =~ ^(prepared|committed)$ ]] || return 1
  temporary="$(mktemp "$UID_CUTOVER_JOURNAL/.phase.XXXXXX")"
  printf '%s\n' "$phase" > "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -fT -- "$temporary" "$UID_CUTOVER_JOURNAL/phase"
  sync -f "$UID_CUTOVER_JOURNAL"
}

clear_uid_cutover_journal() {
  [[ -d "$UID_CUTOVER_JOURNAL" && ! -L "$UID_CUTOVER_JOURNAL" ]] || return 0
  local clearing="${UID_CUTOVER_JOURNAL}.clearing.$$"
  mv -T -- "$UID_CUTOVER_JOURNAL" "$clearing"
  sync -f "$UID_CUTOVER_JOURNAL_PARENT"
  find "$clearing" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$clearing"
  sync -f "$UID_CUTOVER_JOURNAL_PARENT"
}

prepare_uid_cutover_journal

wipe_backup() {
  cleanup_secret_backup
}

unmask_units() {
  if [[ $units_masked -eq 1 ]]; then
    systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
    units_masked=0
  fi
}

restore_on_failure() {
  local exit_code=$?
  trap - ERR INT TERM
  if [[ $cutover_committed -eq 1 ]]; then
    exit "$exit_code"
  fi
  echo "Pilot identity cutover failed; restoring the previous service contract." >&2
  pilot_stop_running_consumer "$SERVICE" >/dev/null 2>&1 || true
  for path in "${managed_paths[@]}"; do
    if [[ -e "${BACKUP_DIR}${path}" || -L "${BACKUP_DIR}${path}" ]]; then
      cp -a -- "${BACKUP_DIR}${path}" "$path"
    else
      rm -f -- "$path"
    fi
  done
  chown_tree_from_to mes-pilot mes-pilot deploy:deploy \
    /srv/mes/pilot/audit /srv/mes/pilot/runtime 2>/dev/null || true
  chown_tree_from_to mes-pilot mes-pilot-data deploy:deploy \
    /srv/mes/pilot/shared-state /srv/mes/pilot/backups 2>/dev/null || true
  chmod "$shared_mode" /srv/mes/pilot/shared-state || true
  chmod "$backup_mode" /srv/mes/pilot/backups || true
  chmod "$audit_mode" /srv/mes/pilot/audit || true
  chmod "$runtime_mode" /srv/mes/pilot/runtime || true
  chown "$shared_owner" /srv/mes/pilot/shared-state || true
  chown "$backup_owner" /srv/mes/pilot/backups || true
  chown "$audit_owner" /srv/mes/pilot/audit || true
  chown "$runtime_owner" /srv/mes/pilot/runtime || true
  [[ -n "$state_mode" && -f "$state_file" ]] && chmod "$state_mode" "$state_file" || true
  [[ -n "$state_owner" && -f "$state_file" ]] && chown "$state_owner" "$state_file" || true
  [[ -n "$import_export_mode" && -f "$import_export_file" ]] && chmod "$import_export_mode" "$import_export_file" || true
  [[ -n "$import_export_owner" && -f "$import_export_file" ]] && chown "$import_export_owner" "$import_export_file" || true
  unmask_units
  systemctl daemon-reload || true
  rollback_healthy=0
  if pilot_write_app_verification_intent && systemctl start "$SERVICE"; then
    for _ in $(seq 1 20); do
      if curl --fail --silent --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' http://127.0.0.1:4175/healthz >/dev/null; then rollback_healthy=1; break; fi
      sleep 1
    done
  fi
  if [[ $rollback_healthy -eq 1 ]]; then
    if restore_timer_state "$timer_was_active"; then
      pilot_clear_app_verification_intent || true
      clear_uid_cutover_journal || true
      rm -f -- "$WRITER_QUIESCE_MARKER" || true
      sync -f "$(dirname "$WRITER_QUIESCE_MARKER")" || true
      writers_quiesced=0
    else
      echo "Previous Pilot contract is healthy, but timer restoration failed; durable recovery state retained." >&2
    fi
  else
    echo "Previous Pilot contract did not become healthy; durable UID-cutover journal retained." >&2
  fi
  wipe_backup
  exit "$exit_code"
}
trap restore_on_failure ERR INT TERM

pilot_stop_running_consumer "$SERVICE"

# Extract only the two database URLs from the old combined file, explicitly
# drop every old command flag, and rotate all session-signing secrets. Password
# hashes are preserved so users are not locked out; existing sessions expire.
/usr/bin/node "${SCRIPT_DIR}/pilot-secret-env-rewrite.mjs" --mode=split-and-rotate

/usr/bin/node "${SCRIPT_DIR}/pilot-base-env-migrate.mjs" \
  --defaults="${REPO_ROOT}/deploy/env/mes-pilot.env.example" \
  --unit="$SERVICE_FILE" --hardening="${DROPIN_DIR}/10-hardening.conf" \
  --existing="$BASE_ENV" --output="$BASE_ENV"
for env_file in "$DOMAIN_ENV" "$MIGRATOR_ENV" "$ADMIN_ENV" "$PUBLIC_ENV" "$EMPLOYEE_ENV" "$BASE_ENV"; do
  [[ -f "$env_file" && ! -L "$env_file" ]] || { echo "Refusing non-regular env file $env_file" >&2; false; }
  chown root:root "$env_file"
  chmod 0600 "$env_file"
done

install -d -o mes-pilot -g mes-pilot-data -m 2750 /srv/mes/pilot/shared-state
install -d -o mes-pilot -g mes-pilot-data -m 2770 /srv/mes/pilot/backups
install -d -o mes-pilot -g mes-pilot -m 0750 /srv/mes/pilot/audit /srv/mes/pilot/runtime
chown_tree_from_to deploy deploy mes-pilot:mes-pilot-data /srv/mes/pilot/shared-state /srv/mes/pilot/backups
chown_tree_from_to deploy deploy mes-pilot:mes-pilot /srv/mes/pilot/audit /srv/mes/pilot/runtime
chown root:root "$OPERATIONAL_BOOTSTRAP"
chmod 0444 "$OPERATIONAL_BOOTSTRAP"
[[ "$(stat -c '%u:%g:%a:%h' "$OPERATIONAL_BOOTSTRAP")" == "0:0:444:1" ]] \
  || { echo "Operational bootstrap snapshot metadata changed during UID cutover." >&2; false; }
/usr/sbin/runuser -u mes-pilot -- test -r "$OPERATIONAL_BOOTSTRAP" \
  || { echo "mes-pilot cannot read the operational bootstrap snapshot after UID cutover." >&2; false; }
if /usr/sbin/runuser -u deploy -- test -r "$OPERATIONAL_BOOTSTRAP" \
  || /usr/sbin/runuser -u mes-stage -- test -r "$OPERATIONAL_BOOTSTRAP"; then
  echo "deploy or mes-stage can read the operational bootstrap snapshot after UID cutover." >&2
  false
fi
if /usr/sbin/runuser -u mes-pilot -- test -w "$SEALED_BOOTSTRAP_DIR" \
  || /usr/sbin/runuser -u mes-pilot -- test -w "$SEALED_BOOTSTRAP"; then
  echo "mes-pilot can replace or mutate the sealed bootstrap bind source." >&2
  false
fi
[[ -f "$state_file" ]] && chmod 0640 "$state_file"
[[ -f "$import_export_file" ]] && chmod 0660 "$import_export_file"

install_root_file_atomically "${REPO_ROOT}/deploy/systemd/mes-pilot.service" "$SERVICE_FILE" 0644
install -d -o root -g root -m 0755 "$DROPIN_DIR"
rm -f -- "${DROPIN_DIR}/10-hardening.conf"
install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-admin-auth.conf" "$ADMIN_DROPIN" 0644
install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-public-auth.conf" "$PUBLIC_DROPIN" 0644
install_root_file_atomically "$BOOTSTRAP_BIND_SOURCE" "$BOOTSTRAP_BIND_DROPIN" 0644
install_root_file_atomically "${REPO_ROOT}/ops/postgres/mes-pilot-domain-migrate.service" /etc/systemd/system/mes-pilot-domain-migrate.service 0644
install_root_file_atomically "${REPO_ROOT}/ops/postgres/mes-pilot-domain-import.service" /etc/systemd/system/mes-pilot-domain-import.service 0644
install_root_file_atomically "${REPO_ROOT}/ops/postgres/mes-pilot-domain-snapshot-sync.service" /etc/systemd/system/mes-pilot-domain-snapshot-sync.service 0644
install_root_file_atomically "${REPO_ROOT}/ops/postgres/mes-pilot-domain-snapshot-sync.timer" /etc/systemd/system/mes-pilot-domain-snapshot-sync.timer 0644
install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-domain-runtime-credential-check.service" /etc/systemd/system/mes-pilot-domain-runtime-credential-check.service 0644
install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-domain-migrator-credential-check.service" /etc/systemd/system/mes-pilot-domain-migrator-credential-check.service 0644

systemctl daemon-reload
systemctl reset-failed "$SERVICE" mes-pilot-domain-runtime-credential-check.service mes-pilot-domain-migrator-credential-check.service || true
systemctl start mes-pilot-domain-runtime-credential-check.service
systemctl start mes-pilot-domain-migrator-credential-check.service
pilot_write_app_verification_intent
systemctl start "$SERVICE"

for _ in $(seq 1 20); do
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' http://127.0.0.1:4175/healthz >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' http://127.0.0.1:4175/healthz >/dev/null
"${SCRIPT_DIR}/verify-pilot-runtime-uid-isolation.sh"
pilot_clear_app_verification_intent

# The UID/env split is now independently healthy. Commit and discard the outer
# pre-cutover backup before entering the nested password transaction: a later
# ERR/KILL must never restore old env files after that child commits new DB
# role passwords. The durable rotation journal owns all rollback from here.
set_uid_cutover_journal_phase committed
cutover_committed=1
trap - ERR INT TERM
wipe_backup

# Rotate database passwords after the UID/env split has proven healthy. This
# helper also rotates all three session secrets again and rolls itself back if
# either credential check or the application health check fails.
set +e
MES_PILOT_IDENTITY_LOCK_HELD=1 "${SCRIPT_DIR}/rotate-pilot-credentials.sh" \
  --confirm-rotate-all --trusted-staged-release-id="$candidate_release_id"
rotation_status=$?
set -e

finalize_committed_cutover() {
  if [[ -e /var/lib/mes/pilot-credential-rotation || -L /var/lib/mes/pilot-credential-rotation ]]; then
    echo "Credential journal is unresolved; committed UID journal and writer marker remain for fixed recovery." >&2
    return 1
  fi
  unmask_units
  restore_timer_state "$timer_was_active"
  pilot_clear_app_verification_intent
  clear_uid_cutover_journal
  rm -f -- "$WRITER_QUIESCE_MARKER"
  sync -f "$(dirname "$WRITER_QUIESCE_MARKER")"
  writers_quiesced=0
}

finalize_status=0
finalize_committed_cutover || finalize_status=$?
if [[ $rotation_status -ne 0 ]]; then
  [[ $finalize_status -eq 0 ]] \
    || echo "Nested credential rotation failed closed; boot recovery must resolve its durable journal." >&2
  exit "$rotation_status"
fi
[[ $finalize_status -eq 0 ]] || exit "$finalize_status"

echo "Pilot now runs under isolated locked runtime/migrator identities."
echo "The command flag embedded in the old combined domain env was removed; reviewed command drop-ins were left unchanged for the staged OFF bridge."
echo "After that bridge restarts Pilot, run: ${SCRIPT_DIR}/verify-pilot-runtime-uid-isolation.sh --require-command-flags-off"
