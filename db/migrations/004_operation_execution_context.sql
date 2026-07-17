-- Snapshot the deterministic operation inputs used by the planning engine.
-- Calendars remain a separate domain, but these values make duration
-- calculation portable from the browser to a server-side worker.

ALTER TABLE work_order_operations
  ADD COLUMN IF NOT EXISTS execution_context JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO mes_schema_migrations(version) VALUES ('004_operation_execution_context') ON CONFLICT (version) DO NOTHING;
