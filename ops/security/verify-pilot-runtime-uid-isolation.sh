#!/usr/bin/env bash
# Read-only, adversarial live verification of the Pilot UID and secret split.
# It prints key names and identity metadata only; secret values are never read
# into stdout or command-line arguments.
set -euo pipefail
set +x

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

require_command_flags_off=0
if [[ $# -gt 1 || ( $# -eq 1 && ${1:-} != --require-command-flags-off ) ]]; then
  echo "Usage: $0 [--require-command-flags-off]" >&2
  exit 2
fi
[[ ${1:-} == --require-command-flags-off ]] && require_command_flags_off=1

readonly SERVICE="mes-pilot.service"
readonly DROPIN_DIR="/etc/systemd/system/${SERVICE}.d"
readonly DOMAIN_ENV="/etc/mes/mes-pilot-domain.env"
readonly MIGRATOR_ENV="/etc/mes/mes-pilot-domain-migrator.env"
readonly ADMIN_ENV="/etc/mes/mes-pilot-admin-auth.env"
readonly PUBLIC_ENV="/etc/mes/mes-pilot-public-auth.env"
readonly EMPLOYEE_ENV="/etc/mes/mes-pilot-employee-auth.env"
readonly BASE_ENV="/etc/mes/mes-pilot.env"
readonly ROOT_SEAL_HELPER="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"
readonly RUNTIME_DISPATCHER="/usr/local/libexec/mes/pilot-runtime-security-dispatch"
readonly RELEASE_RECOVERY_APP_DEPENDENCY_DROPIN="/etc/systemd/system/mes-pilot-release-recovery-app.service.d/10-credential-rotation-recovery.conf"
readonly RELEASE_RECOVERY_WRITER_DEPENDENCY_DROPIN="/etc/systemd/system/mes-pilot-release-recovery-writer.service.d/10-credential-rotation-recovery.conf"

fail() { echo "Pilot runtime isolation verification failed: $*" >&2; exit 1; }

assert_locked_identity() {
  local user="$1"
  local expected_group="$2"
  local expected_groups="$3"
  local password_state uid gid home shell actual_groups
  getent passwd "$user" >/dev/null || fail "missing account $user"
  uid="$(id -u "$user")"; gid="$(id -g "$user")"
  [[ "$uid" =~ ^[1-9][0-9]*$ && "$gid" =~ ^[1-9][0-9]*$ ]] || fail "$user has a zero or invalid UID/GID"
  [[ "$(id -gn "$user")" == "$expected_group" ]] || fail "$user has unexpected primary group"
  home="$(getent passwd "$user" | cut -d: -f6)"
  shell="$(getent passwd "$user" | cut -d: -f7)"
  [[ "$home" == /nonexistent ]] || fail "$user has an unexpected home"
  [[ "$shell" == /usr/sbin/nologin ]] || fail "$user does not use nologin"
  password_state="$(passwd -S "$user" | awk '{print $2}')"
  [[ "$password_state" == L || "$password_state" == LK ]] || fail "$user password is not locked"
  actual_groups="$(id -nG "$user" | tr ' ' '\n' | sort -u | paste -sd, -)"
  [[ "$actual_groups" == "$expected_groups" ]] || fail "$user has non-exact groups: $actual_groups"
}

assert_root_secret_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" ]] || fail "$path is not a canonical regular file"
  [[ "$(stat -c '%u:%g:%a:%h' "$path")" == 0:0:600:1 ]] || fail "$path must be root:root 0600 with one link"
  if runuser -u deploy -- test -r "$path"; then fail "deploy can read $path"; fi
}

env_keys() {
  awk -F= '/^[A-Z][A-Z0-9_]*=/{print $1}' "$1" | sort
}

assert_exact_keys() {
  local path="$1"
  shift
  local actual expected
  actual="$(env_keys "$path")"
  expected="$(printf '%s\n' "$@" | sort)"
  [[ "$actual" == "$expected" ]] || fail "$path has unexpected keys: $(env_keys "$path" | paste -sd, -)"
}

assert_release_recovery_dependency_dropin() {
  local path="$1" expected actual
  [[ -f "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" ]] \
    || fail "$path is not a canonical regular file"
  [[ "$(stat -c '%u:%g:%a:%h' "$path")" == 0:0:644:1 ]] \
    || fail "$path must be root:root 0644 with one link"
  expected="$(printf '%s\n' \
    '[Unit]' \
    'Requires=mes-pilot-credential-rotation-recovery.service' \
    'After=mes-pilot-credential-rotation-recovery.service')"
  actual="$(<"$path")"
  [[ "$actual" == "$expected" ]] || fail "$path has an unexpected dependency contract"
}

assert_systemd_word_property() {
  local unit="$1" property="$2" expected="$3"
  systemctl show "$unit" --property="$property" --value | tr ' ' '\n' | grep -Fxq "$expected" \
    || fail "$unit effective $property omits $expected"
}

assert_locked_identity mes-pilot mes-pilot mes-pilot,mes-pilot-data
assert_locked_identity mes-pilot-migrator mes-pilot-migrator mes-pilot-data,mes-pilot-migrator
runtime_uid="$(id -u mes-pilot)"; migrator_uid="$(id -u mes-pilot-migrator)"; deploy_uid="$(id -u deploy)"
runtime_gid="$(getent group mes-pilot | cut -d: -f3)"
migrator_gid="$(getent group mes-pilot-migrator | cut -d: -f3)"
data_gid="$(getent group mes-pilot-data | cut -d: -f3)"
[[ "$runtime_uid" != "$migrator_uid" && "$runtime_uid" != "$deploy_uid" && "$migrator_uid" != "$deploy_uid" \
  && "$runtime_gid" =~ ^[1-9][0-9]*$ && "$migrator_gid" =~ ^[1-9][0-9]*$ && "$data_gid" =~ ^[1-9][0-9]*$ \
  && "$runtime_gid" != "$migrator_gid" && "$runtime_gid" != "$data_gid" && "$migrator_gid" != "$data_gid" ]] \
  || fail "service identities/groups do not have distinct nonzero numeric IDs"
if id -nG deploy | tr ' ' '\n' | grep -qxE 'mes-pilot|mes-pilot-migrator|mes-pilot-data'; then fail "deploy belongs to a service group"; fi

assert_root_secret_file "$DOMAIN_ENV"
assert_root_secret_file "$MIGRATOR_ENV"
assert_root_secret_file "$ADMIN_ENV"
assert_root_secret_file "$PUBLIC_ENV"
assert_root_secret_file "$EMPLOYEE_ENV"
assert_root_secret_file "$BASE_ENV"

assert_exact_keys "$DOMAIN_ENV" DATABASE_URL
assert_exact_keys "$MIGRATOR_ENV" MES_DOMAIN_MIGRATOR_DATABASE_URL
assert_exact_keys "$ADMIN_ENV" MES_ADMIN_USERNAME MES_ADMIN_PASSWORD_HASH MES_ADMIN_SESSION_SECRET
assert_exact_keys "$PUBLIC_ENV" MES_PUBLIC_AUTH_HOSTS MES_PUBLIC_AUTH_LABEL MES_PUBLIC_AUTH_DESCRIPTION MES_PUBLIC_AUTH_USERNAME MES_PUBLIC_AUTH_PASSWORD_HASH MES_PUBLIC_AUTH_SESSION_SECRET MES_PUBLIC_AUTH_SESSION_TTL_SECONDS
assert_exact_keys "$EMPLOYEE_ENV" MES_EMPLOYEE_AUTH_HOSTS MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS MES_EMPLOYEE_AUTH_MAX_ATTEMPTS MES_EMPLOYEE_AUTH_LOCK_SECONDS MES_EMPLOYEE_AUTH_SESSION_SECRET
if grep -Eq '^MES_ENABLE_.*COMMAND' "$DOMAIN_ENV" "$MIGRATOR_ENV"; then fail "a command flag leaked into a credential env"; fi
if grep -Eq '(^|[[:space:]])MES_(ADMIN|PUBLIC|EMPLOYEE).*(PASSWORD_HASH|SESSION_SECRET)=' "$BASE_ENV"; then fail "an auth secret leaked into the base env"; fi

[[ "$(systemctl show "$SERVICE" --property=User --value)" == mes-pilot ]] || fail "app service does not run as mes-pilot"
[[ "$(systemctl show "$SERVICE" --property=Group --value)" == mes-pilot ]] || fail "app service group is not mes-pilot"
[[ "$(systemctl show mes-pilot-domain-migrate.service --property=User --value)" == mes-pilot-migrator ]] || fail "migration unit has wrong UID"
[[ "$(systemctl show mes-pilot-domain-import.service --property=User --value)" == mes-pilot-migrator ]] || fail "import unit has wrong UID"
[[ "$(systemctl show mes-pilot-domain-snapshot-sync.service --property=User --value)" == mes-pilot ]] || fail "snapshot sync has wrong UID"

assert_release_recovery_dependency_dropin "$RELEASE_RECOVERY_APP_DEPENDENCY_DROPIN"
assert_release_recovery_dependency_dropin "$RELEASE_RECOVERY_WRITER_DEPENDENCY_DROPIN"
[[ "$(systemctl show mes-pilot-credential-rotation-recovery.service --property=LoadState --value)" == loaded ]] \
  || fail "credential recovery unit is not loaded"
for release_recovery_unit in mes-pilot-release-recovery-app.service mes-pilot-release-recovery-writer.service; do
  [[ "$(systemctl show "$release_recovery_unit" --property=LoadState --value)" == loaded ]] \
    || fail "$release_recovery_unit is not loaded"
  assert_systemd_word_property "$release_recovery_unit" Requires mes-pilot-credential-rotation-recovery.service
  assert_systemd_word_property "$release_recovery_unit" After mes-pilot-credential-rotation-recovery.service
done

grep -Fq 'EnvironmentFile=/etc/mes/mes-pilot-domain-migrator.env' /etc/systemd/system/mes-pilot-domain-migrate.service || fail "migration unit lacks isolated env"
grep -Fq 'EnvironmentFile=/etc/mes/mes-pilot-domain-migrator.env' /etc/systemd/system/mes-pilot-domain-import.service || fail "import unit lacks isolated env"
grep -Fq 'EnvironmentFile=/etc/mes/mes-pilot-domain.env' /etc/systemd/system/mes-pilot-domain-snapshot-sync.service || fail "snapshot sync lacks runtime env"
if grep -Fq 'mes-pilot-domain-migrator.env' /etc/systemd/system/mes-pilot.service "$DROPIN_DIR"/*.conf; then fail "app unit receives the migrator env"; fi
if grep -REq 'Environment=.*MES_(ADMIN|PUBLIC|EMPLOYEE).*(PASSWORD_HASH|SESSION_SECRET)=' /etc/systemd/system/mes-pilot.service "$DROPIN_DIR"; then
  fail "a secret is still inline in a world-readable systemd unit"
fi
grep -Fq 'EnvironmentFile=/etc/mes/mes-pilot-admin-auth.env' "$DROPIN_DIR/20-admin-auth.conf" || fail "admin auth is not file-backed"
grep -Fq 'EnvironmentFile=/etc/mes/mes-pilot-public-auth.env' "$DROPIN_DIR/30-public-auth.conf" || fail "public auth is not file-backed"

main_pid="$(systemctl show "$SERVICE" --property=MainPID --value)"
[[ "$main_pid" =~ ^[1-9][0-9]*$ && -r "/proc/${main_pid}/environ" ]] || fail "app MainPID is unavailable"
[[ "$(stat -c %U "/proc/${main_pid}")" == mes-pilot ]] || fail "app process owner is not mes-pilot"
grep -zq '^DATABASE_URL=' "/proc/${main_pid}/environ" || fail "app process lacks runtime DATABASE_URL"
if grep -zq '^MES_DOMAIN_MIGRATOR_DATABASE_URL=' "/proc/${main_pid}/environ"; then fail "app process contains migrator credentials"; fi
if [[ $require_command_flags_off -eq 1 ]] && grep -ziEq '^MES_ENABLE_[^=]*COMMAND[^=]*=(1|true|yes|on)$' "/proc/${main_pid}/environ"; then
  fail "a server command flag remains enabled after the staged OFF bridge"
fi
grep -zq '^MES_ADMIN_SESSION_SECRET=' "/proc/${main_pid}/environ" || fail "app process lacks protected admin session configuration"
grep -zq '^MES_PUBLIC_AUTH_SESSION_SECRET=' "/proc/${main_pid}/environ" || fail "app process lacks protected public session configuration"
if [[ -f "$DROPIN_DIR/67-employee-auth.conf" ]]; then
  grep -zq '^MES_EMPLOYEE_AUTH_SESSION_SECRET=' "/proc/${main_pid}/environ" || fail "enabled employee auth lacks its protected session secret"
fi
if runuser -u deploy -- /bin/cat "/proc/${main_pid}/environ" >/dev/null 2>&1; then
  fail "deploy can read the dedicated app process environment"
fi

active_target="$(readlink -f /srv/mes/pilot/app)"
[[ "$active_target" == /srv/mes/pilot/releases/*/app ]] || fail "active app is not an immutable release"
active_release_id="$(basename "$(dirname "$active_target")")"
[[ "$active_release_id" =~ ^[A-Za-z0-9._-]{1,96}$ && -f "$ROOT_SEAL_HELPER" ]] || fail "fixed release seal verifier is unavailable"
/usr/bin/node "$ROOT_SEAL_HELPER" release \
  --releases-root=/srv/mes/pilot/releases --release-id="$active_release_id" --app="$active_target" >/dev/null \
  || fail "active release root seal verification failed"
/usr/bin/node "$ROOT_SEAL_HELPER" pointer \
  --pointer=/srv/mes/pilot/app --expected-target="$active_target" >/dev/null \
  || fail "active release pointer seal verification failed"
if runuser -u deploy -- test -w /srv/mes/pilot || runuser -u deploy -- test -w /srv/mes/pilot/releases || runuser -u deploy -- test -w "$active_target"; then
  fail "deploy can replace the active application path"
fi

[[ "$(stat -c '%U:%G:%a' /srv/mes/pilot/shared-state)" == mes-pilot:mes-pilot-data:2750 ]] || fail "shared-state ownership/mode is too broad or lacks setgid inheritance"
[[ "$(stat -c '%U:%G:%a' /srv/mes/pilot/backups)" == mes-pilot:mes-pilot-data:2770 ]] || fail "backup ownership/mode does not permit only runtime plus controlled importer with setgid inheritance"
[[ "$(stat -c '%U:%G:%a' /srv/mes/pilot/audit)" == mes-pilot:mes-pilot:750 ]] || fail "audit ownership/mode is too broad"
[[ "$(stat -c '%U:%G:%a' /srv/mes/pilot/runtime)" == mes-pilot:mes-pilot:750 ]] || fail "runtime ownership/mode is too broad"
state_file=/srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json
[[ -f "$state_file" ]] || fail "active shared-state snapshot is missing"
runuser -u mes-pilot-migrator -- test -r "$state_file" || fail "migrator cannot read the controlled import source"
runuser -u mes-pilot-migrator -- test -w /srv/mes/pilot/backups || fail "migrator cannot write the controlled import output directory"
import_export_file=/srv/mes/pilot/backups/domain-export-initial.json
if [[ -f "$import_export_file" ]]; then
  runuser -u mes-pilot-migrator -- test -w "$import_export_file" || fail "migrator cannot replace the existing controlled import export"
fi
if runuser -u deploy -- test -r "$state_file" || runuser -u deploy -- test -w /srv/mes/pilot/backups; then fail "deploy retained Pilot data-group access"; fi

[[ -f "$RUNTIME_DISPATCHER" && ! -L "$RUNTIME_DISPATCHER" \
  && "$(stat -c '%u:%g:%a:%h' "$RUNTIME_DISPATCHER")" == 0:0:755:1 ]] \
  || fail "runtime-security dispatcher is not the fixed root-owned ABI-v1 bridge"
"$RUNTIME_DISPATCHER" pilot-root-identity-lock.sh >/dev/null \
  || fail "runtime-security active bundle verification failed"
grep -Fq 'pilot-runtime-security-dispatch pilot-runtime-transition-gate.sh --consumer=app' \
  "$DROPIN_DIR/05-runtime-transition-recovery.conf" || fail "app transition gate bypasses the runtime bundle"
for unit in mes-pilot-domain-migrate.service mes-pilot-domain-import.service mes-pilot-domain-snapshot-sync.service; do
  grep -Fq 'pilot-runtime-security-dispatch pilot-runtime-transition-gate.sh --consumer=writer' \
    "/etc/systemd/system/${unit}.d/05-runtime-transition-recovery.conf" \
    || fail "$unit transition gate bypasses the runtime bundle"
done

echo "Pilot runtime UID isolation: OK"
echo "runtime-env-keys=$(env_keys "$DOMAIN_ENV" | paste -sd, -)"
echo "migrator-env-keys=$(env_keys "$MIGRATOR_ENV" | paste -sd, -)"
echo "auth-env-key-names-only=admin,public,employee"
[[ $require_command_flags_off -eq 1 ]] && echo "server-command-flags=all-off"
