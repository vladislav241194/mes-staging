SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $migration$
BEGIN
  -- The migration runner owns the outer transaction and invokes every file on
  -- each run. Once the marker is committed, this file is a true no-op.
  IF NOT EXISTS (
    SELECT 1 FROM mes_schema_migrations
    WHERE version = '034_shift_execution_issue_reports'
  ) THEN
    -- Employee Desktop reports are part of Shift Execution audit history.
    -- actor_employee_id intentionally has no system_employees FK: assignments
    -- may still carry legacy executor ids and the immutable audit record must
    -- survive later employee archival or authority reconciliation.
    CREATE TABLE shift_issue_reports (
      id TEXT PRIMARY KEY,
      shift_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE RESTRICT,
      assignment_revision INTEGER NOT NULL CHECK (assignment_revision >= 1),
      work_order_id TEXT NOT NULL,
      work_order_operation_id TEXT NOT NULL,
      work_center_id TEXT NOT NULL,
      actor_employee_id TEXT NOT NULL,
      actor_display_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      photo_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (char_length(description) <= 1200),
      CHECK (jsonb_typeof(photo_payload) = 'object'),
      CHECK (octet_length(photo_payload::text) <= 340000),
      CHECK (status IN ('new', 'acknowledged', 'closed'))
    );

    CREATE INDEX shift_issue_reports_assignment_created_idx
      ON shift_issue_reports (shift_assignment_id, created_at DESC, id DESC);

    CREATE TABLE shift_execution_report_requests (
      idempotency_key TEXT PRIMARY KEY,
      request_fingerprint TEXT NOT NULL,
      shift_report_id TEXT NOT NULL UNIQUE REFERENCES shift_issue_reports(id) ON DELETE RESTRICT,
      actor_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO mes_schema_migrations(version)
    VALUES ('034_shift_execution_issue_reports');
  END IF;
END
$migration$;
