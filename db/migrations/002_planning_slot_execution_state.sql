-- Keep the executable planning projection complete in the domain store.
-- A slot quantity and lock flag are needed to safely revise a work-order
-- quantity without rewriting completed or manually fixed work.

ALTER TABLE planning_slots
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO mes_schema_migrations(version) VALUES ('002_planning_slot_execution_state') ON CONFLICT (version) DO NOTHING;
