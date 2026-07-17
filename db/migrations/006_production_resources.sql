-- Resource capacity is required for deterministic operation duration.
-- Resources are imported from the production-structure projection, not a
-- browser-local cache.

CREATE TABLE IF NOT EXISTS production_resources (
  id TEXT PRIMARY KEY,
  work_center_id TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  capacity_hours NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (capacity_hours >= 0),
  units_per_hour NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (units_per_hour >= 0),
  participates_in_calculation BOOLEAN NOT NULL DEFAULT TRUE,
  participates_in_planning BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_kind TEXT NOT NULL DEFAULT 'matrixWorkCenter',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_resources_work_center_idx ON production_resources (work_center_id, is_active);

INSERT INTO mes_schema_migrations(version) VALUES ('006_production_resources') ON CONFLICT (version) DO NOTHING;
