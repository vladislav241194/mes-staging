-- PostgreSQL 15+. The migration is intentionally not auto-run by the pilot.
-- It becomes active only after DATABASE_URL and a migration runner are configured.

CREATE TABLE IF NOT EXISTS mes_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'шт.',
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  lifecycle_status TEXT NOT NULL,
  planning_status TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_revision INTEGER NOT NULL DEFAULT 1 CHECK (source_revision > 0),
  aggregate_revision BIGINT NOT NULL DEFAULT 1 CHECK (aggregate_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_order_operations (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  work_center_id TEXT NOT NULL,
  next_work_center_id TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  labor JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (work_order_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS planning_slots (
  id TEXT PRIMARY KEY,
  work_order_operation_id TEXT NOT NULL REFERENCES work_order_operations(id) ON DELETE CASCADE,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned',
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)
);

CREATE TABLE IF NOT EXISTS domain_change_log (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_revision BIGINT NOT NULL,
  command_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, aggregate_revision)
);

CREATE INDEX IF NOT EXISTS work_orders_planning_status_idx ON work_orders (planning_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS work_order_operations_order_idx ON work_order_operations (work_order_id, sequence_no);
CREATE INDEX IF NOT EXISTS planning_slots_operation_idx ON planning_slots (work_order_operation_id, planned_start);
CREATE INDEX IF NOT EXISTS domain_change_log_aggregate_idx ON domain_change_log (aggregate_type, aggregate_id, aggregate_revision DESC);

INSERT INTO mes_schema_migrations(version) VALUES ('001_domain_core') ON CONFLICT (version) DO NOTHING;
