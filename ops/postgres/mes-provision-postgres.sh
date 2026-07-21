#!/usr/bin/env bash
# One-time root bootstrap for the MES pilot PostgreSQL foundation.
# This script is intentionally not called by deploy scripts. Its two credential
# files are one crash-repairable transaction backed by a durable root journal.
set -euo pipefail
set +x

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo /usr/local/sbin/mes-provision-postgres" >&2
  exit 1
fi

readonly DB_NAME="${MES_DOMAIN_DB_NAME:-mes_pilot}"
readonly APP_ROLE="${MES_DOMAIN_APP_ROLE:-mes_app}"
readonly MIGRATOR_ROLE="${MES_DOMAIN_MIGRATOR_ROLE:-mes_migrator}"
readonly RUNTIME_ENV_FILE="/etc/mes/mes-pilot-domain.env"
readonly MIGRATOR_ENV_FILE="/etc/mes/mes-pilot-domain-migrator.env"
readonly JOURNAL_PARENT="/var/lib/mes"
readonly JOURNAL_DIR="${JOURNAL_PARENT}/pilot-postgres-provision"
readonly RUNTIME_JOURNAL_FILE="${JOURNAL_DIR}/files/runtime.env"
readonly MIGRATOR_JOURNAL_FILE="${JOURNAL_DIR}/files/migrator.env"

[[ "$DB_NAME" == mes_pilot && "$APP_ROLE" == mes_app && "$MIGRATOR_ROLE" == mes_migrator ]] || {
  echo "Initial Pilot provisioning supports only mes_pilot/mes_app/mes_migrator; custom identifiers are not journaled." >&2
  exit 1
}

assert_root_directory() {
  local path="$1" mode="$2"
  [[ -d "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" \
    && "$(stat -c '%u:%g:%a' "$path")" == "0:0:${mode}" ]] \
    || { echo "Unsafe provisioning directory: $path" >&2; return 1; }
}

assert_root_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" && "$(readlink -f -- "$path")" == "$path" \
    && "$(stat -c '%u:%g:%a:%h' "$path")" == 0:0:600:1 ]] \
    || { echo "Unsafe provisioning file: $path" >&2; return 1; }
}

ensure_journal_parent() {
  [[ -d /var/lib && ! -L /var/lib && "$(readlink -f -- /var/lib)" == /var/lib \
    && "$(stat -c '%u:%g' /var/lib)" == 0:0 ]] \
    || { echo "Unsafe /var/lib provisioning parent." >&2; return 1; }
  if [[ -e "$JOURNAL_PARENT" || -L "$JOURNAL_PARENT" ]]; then
    [[ -d "$JOURNAL_PARENT" && ! -L "$JOURNAL_PARENT" \
      && "$(readlink -f -- "$JOURNAL_PARENT")" == "$JOURNAL_PARENT" \
      && "$(stat -c '%u:%g' "$JOURNAL_PARENT")" == 0:0 ]] \
      || { echo "Unsafe PostgreSQL provisioning journal parent." >&2; return 1; }
    chmod 0700 "$JOURNAL_PARENT"
  else
    install -d -o root -g root -m 0700 "$JOURNAL_PARENT"
  fi
  assert_root_directory "$JOURNAL_PARENT" 700
}

set_journal_phase() {
  local phase="$1" temporary
  [[ "$phase" =~ ^(prepared|database-ready|runtime-installed|pair-installed|committed)$ ]] \
    || { echo "Invalid PostgreSQL provisioning journal phase." >&2; return 1; }
  assert_root_directory "$JOURNAL_DIR" 700
  temporary="$(mktemp "$JOURNAL_DIR/.phase.XXXXXX")"
  printf '%s\n' "$phase" > "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -fT -- "$temporary" "$JOURNAL_DIR/phase"
  sync -f "$JOURNAL_DIR"
}

prepare_journal() {
  local app_password="$1" migrator_password="$2" temporary abandoned
  ensure_journal_parent
  [[ ! -e "$JOURNAL_DIR" && ! -L "$JOURNAL_DIR" ]] \
    || { echo "PostgreSQL provisioning journal already exists." >&2; return 1; }
  while IFS= read -r -d '' abandoned; do
    [[ -d "$abandoned" && ! -L "$abandoned" && "$(stat -c '%u:%g:%a' "$abandoned")" == 0:0:700 ]] \
      || { echo "Unsafe abandoned provisioning journal: $abandoned" >&2; return 1; }
    find "$abandoned" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
    rm -rf -- "$abandoned"
  done < <(find "$JOURNAL_PARENT" -xdev -mindepth 1 -maxdepth 1 -type d -name 'pilot-postgres-provision.prepare.*' -print0)

  temporary="$(mktemp -d "${JOURNAL_DIR}.prepare.XXXXXX")"
  chown root:root "$temporary"
  chmod 0700 "$temporary"
  install -d -o root -g root -m 0700 "$temporary/files"
  printf '# Managed by mes-provision-postgres. Do not commit this file.\nDATABASE_URL=postgresql://mes_app:%s@127.0.0.1:5432/mes_pilot\n' \
    "$app_password" > "$temporary/files/runtime.env"
  printf '# Managed by mes-provision-postgres. Do not commit this file.\nMES_DOMAIN_MIGRATOR_DATABASE_URL=postgresql://mes_migrator:%s@127.0.0.1:5432/mes_pilot\n' \
    "$migrator_password" > "$temporary/files/migrator.env"
  printf 'prepared\n' > "$temporary/phase"
  chown root:root "$temporary/files/runtime.env" "$temporary/files/migrator.env" "$temporary/phase"
  chmod 0600 "$temporary/files/runtime.env" "$temporary/files/migrator.env" "$temporary/phase"
  sync -f "$temporary/files/runtime.env"
  sync -f "$temporary/files/migrator.env"
  sync -f "$temporary/phase"
  sync -f "$temporary/files"
  sync -f "$temporary"
  mv -T -- "$temporary" "$JOURNAL_DIR"
  sync -f "$JOURNAL_PARENT"
}

clear_journal() {
  local clearing="${JOURNAL_DIR}.clearing.$$"
  assert_root_directory "$JOURNAL_DIR" 700
  mv -T -- "$JOURNAL_DIR" "$clearing"
  sync -f "$JOURNAL_PARENT"
  find "$clearing" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$clearing"
  sync -f "$JOURNAL_PARENT"
}

for target in "$RUNTIME_ENV_FILE" "$MIGRATOR_ENV_FILE"; do
  [[ ! -L "$target" ]] || { echo "Refusing a symlink credential target: $target" >&2; exit 1; }
done
ensure_journal_parent
while IFS= read -r -d '' abandoned; do
  [[ -d "$abandoned" && ! -L "$abandoned" && "$(stat -c '%u:%g:%a' "$abandoned")" == 0:0:700 ]] \
    || { echo "Unsafe abandoned provisioning cleanup journal: $abandoned" >&2; exit 1; }
  find "$abandoned" -xdev -type f -exec shred -u -- {} + 2>/dev/null || true
  rm -rf -- "$abandoned"
done < <(find "$JOURNAL_PARENT" -xdev -mindepth 1 -maxdepth 1 -type d \
  \( -name 'pilot-postgres-provision.prepare.*' -o -name 'pilot-postgres-provision.clearing.*' \) -print0)
if [[ ! -e "$JOURNAL_DIR" && ! -L "$JOURNAL_DIR" ]]; then
  if [[ -e "$RUNTIME_ENV_FILE" || -e "$MIGRATOR_ENV_FILE" ]]; then
    if [[ -e "$RUNTIME_ENV_FILE" && -e "$MIGRATOR_ENV_FILE" ]]; then
      echo "Pilot database credentials already exist; use rotate-pilot-credentials.sh instead of provisioning again." >&2
    else
      echo "A partial credential pair exists without its durable provisioning journal; refusing to guess passwords." >&2
    fi
    exit 1
  fi
  prepare_journal "$(openssl rand -hex 32)" "$(openssl rand -hex 32)"
fi

assert_root_directory "$JOURNAL_DIR" 700
assert_root_directory "$JOURNAL_DIR/files" 700
assert_root_file "$RUNTIME_JOURNAL_FILE"
assert_root_file "$MIGRATOR_JOURNAL_FILE"
assert_root_file "$JOURNAL_DIR/phase"
provision_phase="$(tr -d '[:space:]' < "$JOURNAL_DIR/phase")"
[[ "$provision_phase" =~ ^(prepared|database-ready|runtime-installed|pair-installed|committed)$ ]] \
  || { echo "Unknown PostgreSQL provisioning journal phase." >&2; exit 1; }
runtime_line="$(grep -m1 '^DATABASE_URL=' "$RUNTIME_JOURNAL_FILE")"
migrator_line="$(grep -m1 '^MES_DOMAIN_MIGRATOR_DATABASE_URL=' "$MIGRATOR_JOURNAL_FILE")"
runtime_url="${runtime_line#DATABASE_URL=}"
migrator_url="${migrator_line#MES_DOMAIN_MIGRATOR_DATABASE_URL=}"
runtime_pattern='^postgresql://mes_app:([0-9a-f]{64})@127\.0\.0\.1:5432/mes_pilot$'
migrator_pattern='^postgresql://mes_migrator:([0-9a-f]{64})@127\.0\.0\.1:5432/mes_pilot$'
[[ "$runtime_url" =~ $runtime_pattern ]] || { echo "Provisioning runtime journal URL is invalid." >&2; exit 1; }
app_password="${BASH_REMATCH[1]}"
[[ "$migrator_url" =~ $migrator_pattern ]] || { echo "Provisioning migrator journal URL is invalid." >&2; exit 1; }
migrator_password="${BASH_REMATCH[1]}"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client
systemctl enable --now postgresql

# Secrets are inherited by psql through a protected root -> postgres
# environment, never exposed in argv. Reruns use the same journaled pair.
MES_PROVISION_APP_PASSWORD="$app_password" \
MES_PROVISION_MIGRATOR_PASSWORD="$migrator_password" \
  runuser -u postgres --preserve-environment -- /usr/bin/psql --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
\getenv app_password MES_PROVISION_APP_PASSWORD
\getenv migrator_password MES_PROVISION_MIGRATOR_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', 'mes_app', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mes_app') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', 'mes_migrator', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mes_migrator') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', 'mes_app', :'app_password') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', 'mes_migrator', :'migrator_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', 'mes_pilot', 'mes_migrator')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'mes_pilot') \gexec
SQL

# The database is an application-internal service, never a public endpoint.
runuser -u postgres -- /usr/bin/psql --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
ALTER SYSTEM SET listen_addresses = '127.0.0.1,::1';
SQL
systemctl restart postgresql

runuser -u postgres -- /usr/bin/psql --set=ON_ERROR_STOP=1 --dbname=mes_pilot <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO mes_app;
GRANT USAGE, CREATE ON SCHEMA public TO mes_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mes_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mes_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mes_app;
SQL
set_journal_phase database-ready

install -d -o root -g root -m 0700 /etc/mes
umask 077
install_env_from_journal() {
  local source="$1" target="$2" temporary
  assert_root_file "$source"
  if [[ -e "$target" || -L "$target" ]]; then
    assert_root_file "$target"
    cmp -s -- "$source" "$target" \
      || { echo "Existing credential target diverges from its provisioning journal: $target" >&2; return 1; }
    return 0
  fi
  temporary="$(mktemp "${target}.tmp.XXXXXX")"
  cp --reflink=never -- "$source" "$temporary"
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -T -- "$temporary" "$target"
  sync -f "$(dirname "$target")"
}

# Runtime and schema credentials are deliberately never stored in one file.
# Command flags also do not belong here: each command owner is controlled only
# by its reviewed root-owned systemd drop-in.
# Storage mode is intentionally absent: the explicit root-owned systemd
# activation drop-in remains the only PostgreSQL authority opt-in.
install_env_from_journal "$RUNTIME_JOURNAL_FILE" "$RUNTIME_ENV_FILE"
set_journal_phase runtime-installed
install_env_from_journal "$MIGRATOR_JOURNAL_FILE" "$MIGRATOR_ENV_FILE"
set_journal_phase pair-installed
assert_root_file "$RUNTIME_ENV_FILE"
assert_root_file "$MIGRATOR_ENV_FILE"
cmp -s -- "$RUNTIME_JOURNAL_FILE" "$RUNTIME_ENV_FILE"
cmp -s -- "$MIGRATOR_JOURNAL_FILE" "$MIGRATOR_ENV_FILE"
set_journal_phase committed
clear_journal
unset app_password migrator_password runtime_url migrator_url provision_phase

echo "MES PostgreSQL foundation is ready with a crash-repairable split runtime/migrator credential pair."
echo "Next: install the migration unit, run domain preflight/import, then explicitly switch MES_DOMAIN_STORAGE to postgres."
