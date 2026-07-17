-- Preserve the planning-only fields that the current workbench still needs
-- while its read path moves from the shared snapshot to PostgreSQL. The
-- canonical relational columns remain the command surface; metadata is an
-- auditable rendering projection, never a second write model.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE work_order_operations
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE planning_slots
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO mes_schema_migrations(version) VALUES ('018_planning_projection_metadata') ON CONFLICT (version) DO NOTHING;
