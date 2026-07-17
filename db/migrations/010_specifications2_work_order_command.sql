-- A work order is created from exactly one immutable Specifications 2.0
-- revision and route document. The idempotency key allows a client to safely
-- retry a failed command without multiplying production orders.

CREATE TABLE IF NOT EXISTS specifications2_work_order_sources (
  work_order_id TEXT PRIMARY KEY REFERENCES work_orders(id) ON DELETE RESTRICT,
  specification_revision_id TEXT NOT NULL REFERENCES specifications2_revisions(id) ON DELETE RESTRICT,
  route_document_id TEXT NOT NULL REFERENCES specifications2_route_documents(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (specification_revision_id, route_document_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS specifications2_work_order_sources_revision_idx
  ON specifications2_work_order_sources (specification_revision_id, route_document_id);

INSERT INTO mes_schema_migrations(version) VALUES ('010_specifications2_work_order_command') ON CONFLICT (version) DO NOTHING;
