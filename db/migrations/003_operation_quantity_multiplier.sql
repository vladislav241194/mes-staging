-- Keep the source multiplier next to an operation. A server command can then
-- derive slot quantity from the order quantity deterministically instead of
-- scaling previously stored values.

ALTER TABLE work_order_operations
  ADD COLUMN IF NOT EXISTS quantity_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (quantity_multiplier > 0);

INSERT INTO mes_schema_migrations(version) VALUES ('003_operation_quantity_multiplier') ON CONFLICT (version) DO NOTHING;
