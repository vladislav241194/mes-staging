#!/usr/bin/env bash
# One-time root bootstrap for the MES pilot PostgreSQL foundation.
# This script is intentionally not called by deploy scripts.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo /usr/local/sbin/mes-provision-postgres" >&2
  exit 1
fi

DB_NAME="${MES_DOMAIN_DB_NAME:-mes_pilot}"
APP_ROLE="${MES_DOMAIN_APP_ROLE:-mes_app}"
MIGRATOR_ROLE="${MES_DOMAIN_MIGRATOR_ROLE:-mes_migrator}"
ENV_FILE="/etc/mes/mes-pilot-domain.env"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client
systemctl enable --now postgresql

# Hex is safe inside a PostgreSQL connection URL without encoding.
app_password="$(openssl rand -hex 32)"
migrator_password="$(openssl rand -hex 32)"

sudo -u postgres psql --set=ON_ERROR_STOP=1 \
  --set=db_name="$DB_NAME" \
  --set=app_role="$APP_ROLE" \
  --set=app_password="$app_password" \
  --set=migrator_role="$MIGRATOR_ROLE" \
  --set=migrator_password="$migrator_password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_role', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'migrator_role', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migrator_role') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'migrator_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
SQL

# The database is an application-internal service, never a public endpoint.
sudo -u postgres psql --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
ALTER SYSTEM SET listen_addresses = '127.0.0.1,::1';
SQL
systemctl restart postgresql

sudo -u postgres psql --set=ON_ERROR_STOP=1 --dbname="$DB_NAME" \
  --set=app_role="$APP_ROLE" --set=migrator_role="$MIGRATOR_ROLE" <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT USAGE, CREATE ON SCHEMA public TO :"migrator_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator_role" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
SQL

install -d -m 0750 /etc/mes
umask 077
cat > "$ENV_FILE" <<EOF
# Managed by mes-provision-postgres. Do not commit this file.
# Storage mode is intentionally absent: the application defaults to snapshot.
# The explicit systemd activation drop-in is the only PostgreSQL opt-in.
DATABASE_URL=postgresql://${APP_ROLE}:${app_password}@127.0.0.1:5432/${DB_NAME}
MES_DOMAIN_MIGRATOR_DATABASE_URL=postgresql://${MIGRATOR_ROLE}:${migrator_password}@127.0.0.1:5432/${DB_NAME}
EOF
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

echo "MES PostgreSQL foundation is ready."
echo "Next: install the migration unit, run domain preflight/import, then explicitly switch MES_DOMAIN_STORAGE to postgres."
