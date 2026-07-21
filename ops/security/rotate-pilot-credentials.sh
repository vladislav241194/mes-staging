#!/usr/bin/env bash
# Rotates both PostgreSQL role passwords and every Pilot session-signing secret
# without printing a secret or changing usernames/password hashes/feature flags.
set -euo pipefail
set +x

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly APP_DIR="${MES_PILOT_APP_DIR:-/srv/mes/pilot/app}"
confirm_rotate=0
trusted_staged_release_id=""
for argument in "$@"; do
  case "$argument" in
    --confirm-rotate-all) confirm_rotate=1 ;;
    --trusted-staged-release-id=*) trusted_staged_release_id="${argument#--trusted-staged-release-id=}" ;;
    *) echo "Usage: $0 --confirm-rotate-all [--trusted-staged-release-id=<id>]" >&2; exit 2 ;;
  esac
done
[[ $confirm_rotate -eq 1 ]] || { echo "Explicit --confirm-rotate-all is required." >&2; exit 2; }
[[ -z "$trusted_staged_release_id" || "$trusted_staged_release_id" =~ ^[A-Za-z0-9._-]{1,96}$ ]] || { echo "Unsafe staged release id." >&2; exit 2; }

readonly ROOT_SEAL_HELPER="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
readonly PUBLIC_RELEASE_VERIFIER="/usr/local/libexec/mes/active-bundle/release-verify.mjs"
readonly RELEASES_DIR="/srv/mes/pilot/releases"
readonly ACTIVE_TARGET="$(readlink -f "$APP_DIR")"
readonly ACTIVE_RELEASE_ID="$(basename "$(dirname "$ACTIVE_TARGET")")"
readonly SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || true)"
[[ "$ACTIVE_RELEASE_ID" =~ ^[A-Za-z0-9._-]{1,96}$ && "$ACTIVE_TARGET" == "${RELEASES_DIR}/${ACTIVE_RELEASE_ID}/app" && -f "$ROOT_SEAL_HELPER" && -f "$PUBLIC_RELEASE_VERIFIER" ]] \
  || { echo "Active release trust anchor is unavailable." >&2; exit 1; }
/usr/bin/node "$ROOT_SEAL_HELPER" release --releases-root="$RELEASES_DIR" --release-id="$ACTIVE_RELEASE_ID" --app="$ACTIVE_TARGET" >/dev/null
/usr/bin/node "$ROOT_SEAL_HELPER" pointer --pointer="$APP_DIR" --expected-target="$ACTIVE_TARGET" >/dev/null
if [[ "$SCRIPT_PATH" != "${ACTIVE_TARGET}/ops/security/rotate-pilot-credentials.sh" ]]; then
  [[ -n "$trusted_staged_release_id" ]] || { echo "Non-active rotation script requires an exact sealed staged release id." >&2; exit 1; }
  trusted_staged_app="${RELEASES_DIR}/${trusted_staged_release_id}/app"
  [[ "$SCRIPT_PATH" == "${trusted_staged_app}/ops/security/rotate-pilot-credentials.sh" ]] || { echo "Rotation script path does not match the staged release." >&2; exit 1; }
  /usr/bin/node "$ROOT_SEAL_HELPER" release --releases-root="$RELEASES_DIR" --release-id="$trusted_staged_release_id" --app="$trusted_staged_app" >/dev/null
  /usr/sbin/runuser -u mes-stage -- /usr/bin/env \
    HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    /usr/bin/node "$PUBLIC_RELEASE_VERIFIER" \
    --manifest="${RELEASES_DIR}/${trusted_staged_release_id}/release-manifest.json" \
    --app-root="$trusted_staged_app" --expected-release-id="$trusted_staged_release_id" \
    --public-only >/dev/null
elif [[ -n "$trusted_staged_release_id" ]]; then
  echo "Do not pass a staged release id when rotating from the active immutable release." >&2
  exit 1
fi

if [[ ${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0} != 1 ]]; then
  exec "${APP_DIR}/ops/shared-state/with-authority-rollout-lock.sh" "$0" "$@"
fi
root_lock_library="${SCRIPT_DIR}/pilot-root-identity-lock.sh"
[[ -f "$root_lock_library" && ! -L "$root_lock_library" ]] || { echo "Root identity lock helper is unavailable." >&2; exit 1; }
# shellcheck source=pilot-root-identity-lock.sh
source "$root_lock_library"
if [[ ${MES_PILOT_IDENTITY_LOCK_HELD:-0} == 1 ]]; then
  pilot_assert_root_identity_lock_held || { echo "Inherited Pilot identity lock proof is invalid." >&2; exit 1; }
else
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
fi
pilot_remove_stale_app_verification_intent

readonly APP_ROLE="${MES_DOMAIN_APP_ROLE:-mes_app}"
readonly MIGRATOR_ROLE="${MES_DOMAIN_MIGRATOR_ROLE:-mes_migrator}"
readonly DB_NAME="${MES_DOMAIN_DB_NAME:-mes_pilot}"
[[ "$APP_ROLE" == mes_app && "$MIGRATOR_ROLE" == mes_migrator && "$DB_NAME" == mes_pilot ]] || {
  echo "Pilot credential rotation supports only the journaled mes_pilot/mes_app/mes_migrator contract." >&2
  exit 1
}
readonly DOMAIN_ENV="/etc/mes/mes-pilot-domain.env"
readonly MIGRATOR_ENV="/etc/mes/mes-pilot-domain-migrator.env"
readonly ADMIN_ENV="/etc/mes/mes-pilot-admin-auth.env"
readonly PUBLIC_ENV="/etc/mes/mes-pilot-public-auth.env"
readonly EMPLOYEE_ENV="/etc/mes/mes-pilot-employee-auth.env"
readonly SERVICE="mes-pilot.service"
readonly INTERNAL_HEALTH="http://127.0.0.1:4175/healthz"
readonly PUBLIC_HEALTH="${MES_PILOT_PUBLIC_HEALTH_URL:-https://pilot.mes-line.ru/healthz}"
readonly JOURNAL_LIBRARY="${SCRIPT_DIR}/pilot-credential-rotation-journal.sh"
readonly JOURNAL_PARENT="/var/lib/mes"
readonly BACKUP_DIR="${JOURNAL_PARENT}/pilot-credential-rotation"
[[ -f "$JOURNAL_LIBRARY" && ! -L "$JOURNAL_LIBRARY" ]] || { echo "Credential rotation journal library is unavailable." >&2; exit 1; }
# shellcheck source=pilot-credential-rotation-journal.sh
source "$JOURNAL_LIBRARY"
[[ -d /var/lib && ! -L /var/lib && "$(readlink -f -- /var/lib)" == /var/lib ]] \
  || { echo "/var/lib must be a canonical real directory." >&2; exit 1; }
if [[ -e "$JOURNAL_PARENT" || -L "$JOURNAL_PARENT" ]]; then
  [[ -d "$JOURNAL_PARENT" && ! -L "$JOURNAL_PARENT" && "$(readlink -f -- "$JOURNAL_PARENT")" == "$JOURNAL_PARENT" \
    && "$(stat -c '%u:%g' "$JOURNAL_PARENT")" == 0:0 ]] || { echo "Unsafe credential journal parent." >&2; exit 1; }
  chmod 0700 "$JOURNAL_PARENT"
else
  install -d -o root -g root -m 0700 "$JOURNAL_PARENT"
fi
pilot_journal_assert_directory "$JOURNAL_PARENT"
# PostgreSQL is untouched until the prepared directory is atomically renamed
# to BACKUP_DIR. A leftover .prepare tree therefore contains only old copies.
while IFS= read -r -d '' abandoned; do
  [[ -d "$abandoned" && ! -L "$abandoned" && "$(stat -c '%u:%g' "$abandoned")" == 0:0 ]] \
    || { echo "Unsafe abandoned credential journal: $abandoned" >&2; exit 1; }
  find "$abandoned" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$abandoned"
done < <(find "$JOURNAL_PARENT" -xdev -mindepth 1 -maxdepth 1 -type d -name 'pilot-credential-rotation.prepare.*' -print0)
journal_recovery_pending=0
if [[ -e "$BACKUP_DIR" || -L "$BACKUP_DIR" ]]; then journal_recovery_pending=1; fi
cleanup_secret_backup() {
  [[ -d "$BACKUP_DIR" ]] || return 0
  pilot_journal_clear "$BACKUP_DIR"
}

for file in "$DOMAIN_ENV" "$MIGRATOR_ENV" "$ADMIN_ENV" "$PUBLIC_ENV" "$EMPLOYEE_ENV"; do
  [[ -f "$file" && ! -L "$file" && "$(readlink -f -- "$file")" == "$file" \
    && "$(stat -c '%u:%g:%a' "$file")" == 0:0:600 ]] || {
    echo "Credential rotation requires a canonical root:root 0600 file: $file" >&2
    exit 1
  }
done

runtime_line="$(grep -m1 '^DATABASE_URL=' "$DOMAIN_ENV")"
migrator_line="$(grep -m1 '^MES_DOMAIN_MIGRATOR_DATABASE_URL=' "$MIGRATOR_ENV")"
old_runtime_url="${runtime_line#DATABASE_URL=}"
old_migrator_url="${migrator_line#MES_DOMAIN_MIGRATOR_DATABASE_URL=}"
runtime_pattern="^postgresql://${APP_ROLE}:([0-9a-f]{64})@127\\.0\\.0\\.1:5432/${DB_NAME}$"
migrator_pattern="^postgresql://${MIGRATOR_ROLE}:([0-9a-f]{64})@127\\.0\\.0\\.1:5432/${DB_NAME}$"
[[ "$old_runtime_url" =~ $runtime_pattern ]] || { echo "Runtime URL does not match the managed local PostgreSQL contract." >&2; exit 1; }
old_app_password="${BASH_REMATCH[1]}"
[[ "$old_migrator_url" =~ $migrator_pattern ]] || { echo "Migrator URL does not match the managed local PostgreSQL contract." >&2; exit 1; }
old_migrator_password="${BASH_REMATCH[1]}"

new_app_password="$(openssl rand -hex 32)"
new_migrator_password="$(openssl rand -hex 32)"
new_runtime_url="postgresql://${APP_ROLE}:${new_app_password}@127.0.0.1:5432/${DB_NAME}"
new_migrator_url="postgresql://${MIGRATOR_ROLE}:${new_migrator_password}@127.0.0.1:5432/${DB_NAME}"

write_root_env_atomically() {
  local target="$1"
  local key="$2"
  local value="$3"
  local temporary
  temporary="$(mktemp "${target}.tmp.XXXXXX")"
  chmod 0600 "$temporary"
  chown root:root "$temporary"
  printf '# Root-owned MES Pilot credential. Managed atomically; do not edit inline in systemd.\n%s=%s\n' "$key" "$value" > "$temporary"
  sync -f "$temporary"
  mv -fT "$temporary" "$target"
  sync -f "$(dirname "$target")"
}

alter_roles() {
  local app_password="$1"
  local migrator_password="$2"
  MES_ROTATE_APP_ROLE="$APP_ROLE" \
  MES_ROTATE_MIGRATOR_ROLE="$MIGRATOR_ROLE" \
  MES_ROTATE_APP_PASSWORD="$app_password" \
  MES_ROTATE_MIGRATOR_PASSWORD="$migrator_password" \
    runuser -u postgres --preserve-environment -- /usr/bin/psql --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
\getenv app_role MES_ROTATE_APP_ROLE
\getenv migrator_role MES_ROTATE_MIGRATOR_ROLE
\getenv app_password MES_ROTATE_APP_PASSWORD
\getenv migrator_password MES_ROTATE_MIGRATOR_PASSWORD
BEGIN;
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'app_role', :'app_password') \gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'migrator_role', :'migrator_password') \gexec
COMMIT;
SQL
}

timer_was_active=0
systemctl is-active --quiet mes-pilot-domain-snapshot-sync.timer && timer_was_active=1
for unit in mes-pilot-domain-migrate.service mes-pilot-domain-import.service; do
  writer_main_pid="$(systemctl show "$unit" --property=MainPID --value 2>/dev/null || true)"
  [[ "$writer_main_pid" =~ ^[0-9]+$ ]] || { echo "Cannot classify $unit MainPID." >&2; exit 1; }
  [[ "$writer_main_pid" -eq 0 ]] || { echo "Refusing rotation while $unit has a live MainPID." >&2; exit 1; }
done

rotation_committed=0
units_masked=0
wipe_backup() {
  cleanup_secret_backup
}
unmask_units() {
  if [[ $units_masked -eq 1 ]]; then
    systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
    units_masked=0
  fi
}
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
wait_for_health() {
  for _ in $(seq 1 20); do
    if curl --fail --silent --show-error --connect-timeout 2 --max-time 5 -H 'Host: mes-internal' "$INTERNAL_HEALTH" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
recover_interrupted_rotation() {
  local phase timer_before backup_runtime_line backup_migrator_line
  local backup_runtime_url backup_migrator_url recovery_app_password recovery_migrator_password
  phase="$(pilot_journal_phase "$BACKUP_DIR")" || return 1
  timer_before="$(pilot_journal_timer_was_active "$BACKUP_DIR")" || return 1
  if [[ "$phase" == committed ]]; then
    systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || return 1
    units_masked=0
    restore_timer_state "$timer_before" || return 1
    cleanup_secret_backup
    recovery_result=committed
    echo "Cleared the journal from an already verified credential rotation." >&2
    return 0
  fi
  backup_runtime_line="$(grep -m1 '^DATABASE_URL=' "$BACKUP_DIR/files/$(basename "$DOMAIN_ENV")")"
  backup_migrator_line="$(grep -m1 '^MES_DOMAIN_MIGRATOR_DATABASE_URL=' "$BACKUP_DIR/files/$(basename "$MIGRATOR_ENV")")"
  backup_runtime_url="${backup_runtime_line#DATABASE_URL=}"
  backup_migrator_url="${backup_migrator_line#MES_DOMAIN_MIGRATOR_DATABASE_URL=}"
  [[ "$backup_runtime_url" =~ $runtime_pattern ]] || { echo "Journal runtime credential is invalid." >&2; return 1; }
  recovery_app_password="${BASH_REMATCH[1]}"
  [[ "$backup_migrator_url" =~ $migrator_pattern ]] || { echo "Journal migrator credential is invalid." >&2; return 1; }
  recovery_migrator_password="${BASH_REMATCH[1]}"

  echo "Recovering an interrupted Pilot credential rotation from the durable root journal." >&2
  pilot_stop_running_consumer mes-pilot-domain-migrate.service || return 1
  pilot_stop_running_consumer mes-pilot-domain-import.service || return 1
  pilot_stop_running_consumer mes-pilot-domain-snapshot-sync.service || return 1
  pilot_stop_running_consumer "$SERVICE" || return 1
  systemctl mask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null || return 1
  units_masked=1
  alter_roles "$recovery_app_password" "$recovery_migrator_password" >/dev/null || return 1
  pilot_journal_restore_files "$BACKUP_DIR" "$DOMAIN_ENV" "$MIGRATOR_ENV" "$ADMIN_ENV" "$PUBLIC_ENV" "$EMPLOYEE_ENV" || return 1
  unmask_units
  systemctl daemon-reload || return 1
  systemctl reset-failed mes-pilot-domain-runtime-credential-check.service mes-pilot-domain-migrator-credential-check.service || true
  systemctl start mes-pilot-domain-runtime-credential-check.service || return 1
  systemctl start mes-pilot-domain-migrator-credential-check.service || return 1
  pilot_write_app_verification_intent || return 1
  systemctl start "$SERVICE" || return 1
  wait_for_health || return 1
  pilot_clear_app_verification_intent || return 1
  restore_timer_state "$timer_before" || return 1
  cleanup_secret_backup || return 1
  recovery_result=rolled-back
  unset recovery_app_password recovery_migrator_password backup_runtime_url backup_migrator_url
  echo "Interrupted credential rotation recovered to the previous verified credentials." >&2
}

if [[ $journal_recovery_pending -eq 1 ]]; then
  recovery_result=""
  recover_interrupted_rotation || {
    echo "Automatic credential recovery failed; durable journal retained at $BACKUP_DIR." >&2
    exit 1
  }
  if [[ "$recovery_result" == committed ]]; then
    echo "The prior Pilot credential rotation had already committed successfully."
    exit 0
  fi
  exec "$0" "$@"
fi

# The complete old credential/session set and timer state are atomically
# renamed and fsynced before PostgreSQL or any live env file is changed.
pilot_journal_prepare "$BACKUP_DIR" "$timer_was_active" \
  "$DOMAIN_ENV" "$MIGRATOR_ENV" "$ADMIN_ENV" "$PUBLIC_ENV" "$EMPLOYEE_ENV"
rollback_rotation() {
  local exit_code=$?
  trap - ERR INT TERM
  if [[ $rotation_committed -eq 1 ]]; then exit "$exit_code"; fi
  set +e
  recover_interrupted_rotation
  recovery_status=$?
  set -e
  if [[ $recovery_status -ne 0 ]]; then
    echo "Credential rollback did not complete; durable journal retained at $BACKUP_DIR for the next root recovery run." >&2
  fi
  exit "$exit_code"
}
trap rollback_rotation ERR INT TERM

[[ $timer_was_active -eq 1 ]] && systemctl stop mes-pilot-domain-snapshot-sync.timer
pilot_stop_running_consumer mes-pilot-domain-migrate.service
pilot_stop_running_consumer mes-pilot-domain-import.service
pilot_stop_running_consumer mes-pilot-domain-snapshot-sync.service
pilot_stop_running_consumer "$SERVICE"
systemctl mask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null
units_masked=1

alter_roles "$new_app_password" "$new_migrator_password" >/dev/null
pilot_journal_set_phase "$BACKUP_DIR" roles-updated
write_root_env_atomically "$DOMAIN_ENV" DATABASE_URL "$new_runtime_url"
write_root_env_atomically "$MIGRATOR_ENV" MES_DOMAIN_MIGRATOR_DATABASE_URL "$new_migrator_url"
pilot_journal_set_phase "$BACKUP_DIR" env-updated
/usr/bin/node "${SCRIPT_DIR}/pilot-secret-env-rewrite.mjs" --mode=rotate-sessions >/dev/null
pilot_journal_set_phase "$BACKUP_DIR" sessions-updated

systemctl reset-failed mes-pilot-domain-runtime-credential-check.service mes-pilot-domain-migrator-credential-check.service || true
systemctl start mes-pilot-domain-runtime-credential-check.service
systemctl start mes-pilot-domain-migrator-credential-check.service
pilot_write_app_verification_intent
systemctl start "$SERVICE"
wait_for_health
curl --fail --silent --show-error --connect-timeout 3 --max-time 10 "$PUBLIC_HEALTH" >/dev/null
"${SCRIPT_DIR}/verify-pilot-runtime-uid-isolation.sh" >/dev/null
pilot_clear_app_verification_intent
pilot_journal_set_phase "$BACKUP_DIR" verified

unmask_units
restore_timer_state "$timer_was_active"
pilot_journal_set_phase "$BACKUP_DIR" committed
rotation_committed=1
trap - ERR INT TERM
wipe_backup
unset old_app_password old_migrator_password new_app_password new_migrator_password old_runtime_url old_migrator_url new_runtime_url new_migrator_url
echo "Pilot database passwords and admin/public/employee session secrets were rotated; usernames and password hashes were preserved."
