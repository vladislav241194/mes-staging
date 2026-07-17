-- Versioned assignment mutations make the server side safe for editing an
-- already issued shift task without overwriting a concurrent master change.
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS shift_execution_mutation_requests (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  shift_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id) ON DELETE RESTRICT,
  resulting_revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mes_schema_migrations(version) VALUES ('015_shift_execution_assignment_revisions') ON CONFLICT (version) DO NOTHING;
