-- A System Domains cutover is a durable, server-controlled state change.
-- The compatibility snapshot may be retired only after a stable two-store
-- proof has been recorded here.  `transition-pending` is intentionally a
-- fail-closed intermediate state: if the filesystem update or final DB
-- commit is interrupted, public commands remain disabled until the
-- controlled retirement command resumes or rolls back the transition.
CREATE TABLE IF NOT EXISTS system_domain_authority_state (
  id text PRIMARY KEY CHECK (id = 'primary'),
  mode text NOT NULL CHECK (mode IN ('transition-pending', 'postgres-primary')),
  transition_id text NOT NULL UNIQUE,
  proof_postgres_revision integer NOT NULL CHECK (proof_postgres_revision > 0),
  proof_postgres_fingerprint text NOT NULL,
  proof_snapshot_version bigint NOT NULL CHECK (proof_snapshot_version >= 0),
  proof_snapshot_fingerprint text NOT NULL,
  actor_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_domain_authority_state_mode_idx
  ON system_domain_authority_state (mode);

INSERT INTO mes_schema_migrations(version)
VALUES ('023_system_domains_postgres_primary_authority')
ON CONFLICT (version) DO NOTHING;
