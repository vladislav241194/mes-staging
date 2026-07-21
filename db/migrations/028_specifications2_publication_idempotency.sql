-- Specifications 2.0 publication retries are commands, not global content
-- aliases. The original document/fingerprint uniqueness prevented a valid
-- A -> B -> A history and allowed a stale request to resolve an old revision.

-- The migration runner owns one outer transaction. Fail quickly instead of
-- queueing DDL behind a live writer, and cap the complete index/DDL operation.
-- Publication must remain disabled while this migration is applied.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $migration$
BEGIN
  -- The current runner opens every numbered file on every invocation. The
  -- marker is transactionally committed with this DDL, so an applied migration
  -- must become a true no-op and never reacquire ACCESS EXCLUSIVE on restart.
  IF NOT EXISTS (
    SELECT 1 FROM mes_schema_migrations
    WHERE version = '028_specifications2_publication_idempotency'
  ) THEN
    -- Build the replacement lookup while the old UNIQUE index still exists.
    -- The SHARE lock used by this non-concurrent build permits ordinary reads.
    CREATE INDEX IF NOT EXISTS specifications2_revisions_document_fingerprint_idx
      ON specifications2_revisions (specification_id, fingerprint, revision_no DESC);

    CREATE TABLE IF NOT EXISTS specifications2_publication_requests (
      idempotency_key TEXT PRIMARY KEY,
      request_fingerprint TEXT NOT NULL,
      source_entry_id TEXT NOT NULL
        REFERENCES specifications2_documents(source_entry_id) ON DELETE RESTRICT,
      expected_previous_revision INTEGER NOT NULL CHECK (expected_previous_revision >= 0),
      resulting_revision_id TEXT NOT NULL UNIQUE
        REFERENCES specifications2_revisions(id) ON DELETE RESTRICT,
      actor_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS specifications2_publication_requests_source_idx
      ON specifications2_publication_requests (source_entry_id, created_at DESC);

    -- Take ACCESS EXCLUSIVE only at the end of the runner-owned transaction,
    -- after every potentially long index scan has completed.
    ALTER TABLE specifications2_revisions
      ADD COLUMN IF NOT EXISTS revision_title TEXT,
      ADD COLUMN IF NOT EXISTS revision_designation TEXT,
      ADD COLUMN IF NOT EXISTS revision_identity_state TEXT NOT NULL DEFAULT 'legacy-unverified',
      DROP CONSTRAINT IF EXISTS specifications2_revisions_specification_id_fingerprint_key;

    INSERT INTO mes_schema_migrations(version)
    VALUES ('028_specifications2_publication_idempotency');
  END IF;
END
$migration$;
