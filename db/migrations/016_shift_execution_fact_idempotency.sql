CREATE TABLE IF NOT EXISTS shift_execution_fact_requests (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  shift_fact_id TEXT NOT NULL REFERENCES shift_facts(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mes_schema_migrations(version) VALUES ('016_shift_execution_fact_idempotency') ON CONFLICT (version) DO NOTHING;
