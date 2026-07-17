-- A browser may retry a timed-out System Domains command. Keep the command
-- key separate from the aggregate revision so the retry cannot create a
-- second revision or a second snapshot-outbox delivery.
CREATE TABLE IF NOT EXISTS system_domain_command_requests (
  idempotency_key TEXT PRIMARY KEY,
  source_fingerprint TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  resulting_revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mes_schema_migrations(version) VALUES ('013_system_domains_command_idempotency') ON CONFLICT (version) DO NOTHING;
