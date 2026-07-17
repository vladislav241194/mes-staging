-- Immutable read model for Specifications 2.0.  This migration does not alter
-- planning data: a released work order remains a historical projection of the
-- revision that created it.

CREATE TABLE IF NOT EXISTS specifications2_documents (
  id TEXT PRIMARY KEY,
  source_entry_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS specifications2_revisions (
  id TEXT PRIMARY KEY,
  specification_id TEXT NOT NULL REFERENCES specifications2_documents(id) ON DELETE RESTRICT,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  fingerprint TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (specification_id, revision_no),
  UNIQUE (specification_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS specifications2_revision_items (
  id TEXT PRIMARY KEY,
  specification_revision_id TEXT NOT NULL REFERENCES specifications2_revisions(id) ON DELETE CASCADE,
  source_row_id TEXT NOT NULL,
  parent_source_row_id TEXT NOT NULL DEFAULT '',
  designation TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  item_kind TEXT NOT NULL DEFAULT 'item',
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'шт.',
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (specification_revision_id, source_row_id)
);

CREATE TABLE IF NOT EXISTS specifications2_route_documents (
  id TEXT PRIMARY KEY,
  specification_revision_id TEXT NOT NULL REFERENCES specifications2_revisions(id) ON DELETE RESTRICT,
  source_draft_id TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT '',
  product_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (specification_revision_id, source_draft_id)
);

CREATE TABLE IF NOT EXISTS specifications2_route_operations (
  id TEXT PRIMARY KEY,
  route_document_id TEXT NOT NULL REFERENCES specifications2_route_documents(id) ON DELETE CASCADE,
  source_operation_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  operation_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  work_center_id TEXT NOT NULL DEFAULT '',
  next_work_center_id TEXT NOT NULL DEFAULT '',
  changes_property BOOLEAN NOT NULL DEFAULT true,
  input_state TEXT NOT NULL DEFAULT '',
  output_state TEXT NOT NULL DEFAULT '',
  labor_norm JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (route_document_id, source_operation_id),
  UNIQUE (route_document_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS specifications2_revisions_document_idx
  ON specifications2_revisions (specification_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS specifications2_revision_items_revision_idx
  ON specifications2_revision_items (specification_revision_id, parent_source_row_id);
CREATE INDEX IF NOT EXISTS specifications2_route_documents_revision_idx
  ON specifications2_route_documents (specification_revision_id, status);
CREATE INDEX IF NOT EXISTS specifications2_route_operations_document_idx
  ON specifications2_route_operations (route_document_id, sequence_no);

INSERT INTO mes_schema_migrations(version) VALUES ('009_specifications2_revision_read_model') ON CONFLICT (version) DO NOTHING;
