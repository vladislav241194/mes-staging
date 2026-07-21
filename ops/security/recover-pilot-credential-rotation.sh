#!/usr/bin/env bash
# Fixed root recovery gate executed before mes-pilot.service. A live rotation
# owns the identity lock and may start Pilot for verification; after a crash or
# reboot the released lock lets this script restore the durable old pair first.
set -euo pipefail
set +x

[[ ${EUID} -eq 0 ]] || { echo "Run as root." >&2; exit 1; }

readonly JOURNAL_DIR="/var/lib/mes/pilot-credential-rotation"
readonly BUNDLE_DIR="${MES_PILOT_RUNTIME_SECURITY_BUNDLE_DIR:-}"
readonly RELEASE_AUTHORITY_LOCK="/run/lock/mes/mes-authority-rollout.lock"
[[ "$BUNDLE_DIR" =~ ^/usr/local/libexec/mes/runtime-security-bundles/[0-9a-f]{64}$ ]] \
  || { echo "Credential recovery must be entered through the fixed bundle dispatcher." >&2; exit 1; }
[[ ${MES_RELEASE_AUTHORITY_LOCK_HELD:-0} == 1 \
  && ${MES_RELEASE_AUTHORITY_LOCK_FD:-} == 9 \
  && -f "$RELEASE_AUTHORITY_LOCK" && ! -L "$RELEASE_AUTHORITY_LOCK" \
  && -e /proc/$$/fd/9 \
  && "$(stat -Lc '%d:%i' -- /proc/$$/fd/9 2>/dev/null || true)" == "$(stat -Lc '%d:%i' -- "$RELEASE_AUTHORITY_LOCK" 2>/dev/null || true)" ]] \
  || { echo "Credential recovery requires the canonical inherited release authority fd9." >&2; exit 1; }
authority_lock_inode="$(stat -Lc '%i' -- "$RELEASE_AUTHORITY_LOCK")"
awk -v owner_pid="$$" -v lock_inode="$authority_lock_inode" '
  $1 == "lock:" && $3 == "FLOCK" && $5 == "WRITE" && $6 == owner_pid {
    split($7, identity, ":");
    if (identity[3] == lock_inode) found = 1;
  }
  END { exit(found ? 0 : 1) }
' /proc/$$/fdinfo/9 \
  || { echo "Credential recovery did not inherit exact ownership of release authority fd9." >&2; exit 1; }
readonly JOURNAL_LIBRARY="${BUNDLE_DIR}/pilot-credential-rotation-journal.sh"
readonly ROOT_LOCK_LIBRARY="${BUNDLE_DIR}/pilot-root-identity-lock.sh"
readonly DOMAIN_ENV="/etc/mes/mes-pilot-domain.env"
readonly MIGRATOR_ENV="/etc/mes/mes-pilot-domain-migrator.env"
readonly ADMIN_ENV="/etc/mes/mes-pilot-admin-auth.env"
readonly PUBLIC_ENV="/etc/mes/mes-pilot-public-auth.env"
readonly EMPLOYEE_ENV="/etc/mes/mes-pilot-employee-auth.env"

[[ -f "$JOURNAL_LIBRARY" && ! -L "$JOURNAL_LIBRARY" \
  && "$(stat -c '%u:%g:%a' "$JOURNAL_LIBRARY")" == 0:0:555 ]] \
  || { echo "Fixed credential recovery library is unavailable." >&2; exit 1; }
[[ -f "$ROOT_LOCK_LIBRARY" && ! -L "$ROOT_LOCK_LIBRARY" \
  && "$(stat -c '%u:%g:%a' "$ROOT_LOCK_LIBRARY")" == 0:0:555 ]] \
  || { echo "Fixed root identity lock helper is unavailable." >&2; exit 1; }
# shellcheck source=pilot-credential-rotation-journal.sh
source "$JOURNAL_LIBRARY"
# shellcheck source=pilot-root-identity-lock.sh
source "$ROOT_LOCK_LIBRARY"
[[ -e "$JOURNAL_DIR" || -L "$JOURNAL_DIR" ]] || exit 0

set +e
pilot_open_root_identity_lock "$0" "$@"
lock_status=$?
set -e
case "$lock_status" in
  0) ;;
  "$PILOT_IDENTITY_LOCK_BUSY")
    if pilot_validate_app_verification_intent; then
      echo "Active root credential/identity verification intent proved; only the app gate may continue." >&2
      exit 0
    fi
    echo "Credential recovery is busy without a valid app-verification intent." >&2
    exit 1
    ;;
  "$PILOT_IDENTITY_LOCK_UNSAFE")
    echo "Credential recovery refused an unsafe identity lock path." >&2
    exit 1
    ;;
  *)
    echo "Credential recovery failed to classify the identity lock ($lock_status)." >&2
    exit 1
    ;;
esac
pilot_remove_stale_app_verification_intent

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

phase="$(pilot_journal_phase "$JOURNAL_DIR")"
timer_was_active="$(pilot_journal_timer_was_active "$JOURNAL_DIR")"
if [[ "$phase" == committed ]]; then
  systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
  restore_timer_state "$timer_was_active"
  pilot_journal_clear "$JOURNAL_DIR"
  echo "Cleared the journal from an already verified Pilot credential rotation."
  exit 0
fi

backup_domain="$JOURNAL_DIR/files/$(basename "$DOMAIN_ENV")"
backup_migrator="$JOURNAL_DIR/files/$(basename "$MIGRATOR_ENV")"
runtime_line="$(grep -m1 '^DATABASE_URL=' "$backup_domain")"
migrator_line="$(grep -m1 '^MES_DOMAIN_MIGRATOR_DATABASE_URL=' "$backup_migrator")"
runtime_url="${runtime_line#DATABASE_URL=}"
migrator_url="${migrator_line#MES_DOMAIN_MIGRATOR_DATABASE_URL=}"
runtime_pattern='^postgresql://mes_app:([0-9a-f]{64})@127\.0\.0\.1:5432/mes_pilot$'
migrator_pattern='^postgresql://mes_migrator:([0-9a-f]{64})@127\.0\.0\.1:5432/mes_pilot$'
[[ "$runtime_url" =~ $runtime_pattern ]] || { echo "Journal runtime credential is invalid." >&2; exit 1; }
old_app_password="${BASH_REMATCH[1]}"
[[ "$migrator_url" =~ $migrator_pattern ]] || { echo "Journal migrator credential is invalid." >&2; exit 1; }
old_migrator_password="${BASH_REMATCH[1]}"

# Direct starts of migrate/import/sync can invoke this gate while Pilot is
# already running. Stop only units with a real MainPID. A MainPID=0 unit can be
# the queued requester whose dependency is this recovery service; stopping it
# here would cancel the safe post-recovery start transaction.
pilot_stop_running_consumer mes-pilot-domain-migrate.service
pilot_stop_running_consumer mes-pilot-domain-import.service
pilot_stop_running_consumer mes-pilot-domain-snapshot-sync.service
pilot_stop_running_consumer mes-pilot.service

MES_ROTATE_APP_PASSWORD="$old_app_password" \
MES_ROTATE_MIGRATOR_PASSWORD="$old_migrator_password" \
  runuser -u postgres --preserve-environment -- /usr/bin/psql --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
\getenv app_password MES_ROTATE_APP_PASSWORD
\getenv migrator_password MES_ROTATE_MIGRATOR_PASSWORD
BEGIN;
SELECT format('ALTER ROLE %I WITH PASSWORD %L', 'mes_app', :'app_password') \gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', 'mes_migrator', :'migrator_password') \gexec
COMMIT;
SQL

pilot_journal_restore_files "$JOURNAL_DIR" \
  "$DOMAIN_ENV" "$MIGRATOR_ENV" "$ADMIN_ENV" "$PUBLIC_ENV" "$EMPLOYEE_ENV"
systemctl unmask --runtime mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl reset-failed mes-pilot-domain-runtime-credential-check.service mes-pilot-domain-migrator-credential-check.service || true
systemctl start mes-pilot-domain-runtime-credential-check.service
systemctl start mes-pilot-domain-migrator-credential-check.service
# Leave any queued Pilot requester alone. It may have ActiveState=activating,
# but it must not have a database-consuming MainPID before recovery completes.
app_main_pid="$(systemctl show mes-pilot.service --property=MainPID --value 2>/dev/null || true)"
[[ "$app_main_pid" == 0 ]] || { echo "Pilot unexpectedly has a live MainPID during credential recovery." >&2; exit 1; }
restore_timer_state "$timer_was_active"
pilot_journal_clear "$JOURNAL_DIR"
unset old_app_password old_migrator_password runtime_url migrator_url
echo "Recovered the interrupted Pilot credential rotation before application start."
