-- Binary production documents are deliberately separate from immutable
-- Specifications 2.0 revisions.  A revision holds only metadata and a blob
-- reference, so browser-local base64 copies cannot inflate domain snapshots.

CREATE TABLE IF NOT EXISTS specifications2_attachment_blobs (
  id TEXT PRIMARY KEY,
  content_digest TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 1048576),
  content BYTEA NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS specifications2_attachment_blobs_created_idx
  ON specifications2_attachment_blobs (created_at DESC, id);

INSERT INTO mes_schema_migrations(version) VALUES ('019_specifications2_attachment_blobs') ON CONFLICT (version) DO NOTHING;
