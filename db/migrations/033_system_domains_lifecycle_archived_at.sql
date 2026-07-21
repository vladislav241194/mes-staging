BEGIN;

ALTER TABLE system_org_units
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE system_work_centers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE system_positions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE system_employees
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE system_equipment
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

INSERT INTO mes_schema_migrations(version)
VALUES ('033_system_domains_lifecycle_archived_at')
ON CONFLICT (version) DO NOTHING;

COMMIT;
