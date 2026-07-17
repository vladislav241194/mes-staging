-- PostgreSQL remains the command authority. A row is marked pending until its
-- calculated projection has been durably mirrored into the legacy snapshot.

ALTER TABLE domain_change_log
  ADD COLUMN IF NOT EXISTS snapshot_sync_state TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS snapshot_sync_error TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS snapshot_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS domain_change_log_snapshot_sync_idx
  ON domain_change_log (snapshot_sync_state, created_at, id);

INSERT INTO mes_schema_migrations(version) VALUES ('007_snapshot_sync_outbox') ON CONFLICT (version) DO NOTHING;
