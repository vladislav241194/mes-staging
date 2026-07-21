BEGIN;

-- Employee authentication is deliberately separate from the public contour
-- password. The session token stores only an employee id and auth_version;
-- roles and permissions remain authoritative in System Domains.
CREATE TABLE IF NOT EXISTS system_employee_auth_credentials (
  employee_id TEXT PRIMARY KEY
    REFERENCES system_employees(id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,
  pin_hash TEXT NOT NULL
    CHECK (pin_hash ~ '^scrypt:v1:[^:]+:[0-9a-fA-F]{128}$'),
  auth_version BIGINT NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  pin_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_employee_auth_credentials_locked_until_idx
  ON system_employee_auth_credentials(locked_until)
  WHERE locked_until IS NOT NULL;

INSERT INTO mes_schema_migrations(version)
VALUES ('027_employee_auth_credentials')
ON CONFLICT (version) DO NOTHING;

COMMIT;
