-- Shift execution becomes server-owned only after a command can be safely
-- retried. This ledger prevents duplicated assignments when a master retries
-- a timed-out request while the legacy snapshot bridge is still being rolled out.
CREATE TABLE IF NOT EXISTS shift_execution_command_requests (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  shift_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mes_schema_migrations(version) VALUES ('014_shift_execution_command_idempotency') ON CONFLICT (version) DO NOTHING;
