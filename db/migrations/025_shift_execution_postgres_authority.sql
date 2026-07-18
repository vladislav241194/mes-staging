CREATE TABLE IF NOT EXISTS shift_execution_authority (
  authority_key text PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('transition-pending', 'postgres-primary', 'rollback-pending')),
  transition_id text NOT NULL,
  source_snapshot_version bigint NOT NULL CHECK (source_snapshot_version >= 0),
  source_digest text NOT NULL,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_export_path text NOT NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (authority_key = 'shared-ui-shift-execution-v1'),
  CHECK (char_length(transition_id) BETWEEN 1 AND 160),
  CHECK (char_length(source_digest) = 64)
);

CREATE TABLE IF NOT EXISTS shift_execution_compatibility_archive (
  transition_id text PRIMARY KEY,
  source_digest text NOT NULL,
  source_payload jsonb NOT NULL,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(transition_id) BETWEEN 1 AND 160),
  CHECK (char_length(source_digest) = 64)
);

INSERT INTO mes_schema_migrations(version)
VALUES ('025_shift_execution_postgres_authority')
ON CONFLICT (version) DO NOTHING;
