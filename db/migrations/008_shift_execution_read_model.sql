-- Read-only foundation for the workshop migration.  The legacy shift board
-- keeps writing its sharedUi snapshot until the exporter/importer parity is
-- proven.  These tables preserve the original slot/route references and do
-- not alter planning_slots or existing facts in place.

CREATE TABLE IF NOT EXISTS shift_assignments (
  id TEXT PRIMARY KEY,
  source_row_id TEXT NOT NULL,
  source_slot_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  work_order_operation_id TEXT NOT NULL REFERENCES work_order_operations(id) ON DELETE RESTRICT,
  work_center_id TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  master_id TEXT NOT NULL DEFAULT '',
  planned_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
  assigned_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (assigned_quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'шт.',
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_row_id)
);

CREATE TABLE IF NOT EXISTS shift_assignment_executors (
  shift_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (shift_assignment_id, employee_id)
);

CREATE TABLE IF NOT EXISTS shift_facts (
  id TEXT PRIMARY KEY,
  shift_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE RESTRICT,
  actual_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  defect_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (defect_quantity >= 0),
  labor_minutes NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (labor_minutes >= 0),
  executor_count INTEGER NOT NULL DEFAULT 0 CHECK (executor_count >= 0),
  comment TEXT NOT NULL DEFAULT '',
  deviation_comment TEXT NOT NULL DEFAULT '',
  reported_at TIMESTAMPTZ NOT NULL,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS shift_carryovers (
  id TEXT PRIMARY KEY,
  source_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE RESTRICT,
  source_slot_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  work_order_operation_id TEXT NOT NULL REFERENCES work_order_operations(id) ON DELETE RESTRICT,
  date_key DATE NOT NULL,
  remaining_quantity NUMERIC(14, 3) NOT NULL CHECK (remaining_quantity > 0),
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- The final index needs the work center for workshop read models.  Keep the
-- migration idempotent on databases that were provisioned before this column
-- existed by adding it here instead of rewriting the create statement above.
ALTER TABLE shift_carryovers ADD COLUMN IF NOT EXISTS work_center_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS shift_assignments_operation_idx ON shift_assignments (work_order_operation_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS shift_facts_assignment_idx ON shift_facts (shift_assignment_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS shift_carryovers_date_idx ON shift_carryovers (date_key, work_center_id);

INSERT INTO mes_schema_migrations(version) VALUES ('008_shift_execution_read_model') ON CONFLICT (version) DO NOTHING;
