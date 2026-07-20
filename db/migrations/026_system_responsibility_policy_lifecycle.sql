BEGIN;

ALTER TABLE system_responsibility_policies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

INSERT INTO mes_schema_migrations(version)
VALUES ('026_system_responsibility_policy_lifecycle')
ON CONFLICT (version) DO NOTHING;

COMMIT;
