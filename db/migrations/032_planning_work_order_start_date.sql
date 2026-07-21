-- Make the Planning Workbench start-date control a real work-order command.
--
-- The date is the pre-placement anchor used by the established scheduler. It
-- deliberately does not move an existing planning slot; slot rescheduling is
-- a separate revision-checked command with different calendar semantics.

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS planning_start_date DATE;

-- Preserve the compatibility value during the first PostgreSQL rollout. Bad
-- or absent legacy strings remain NULL instead of being guessed by migration.
WITH candidate AS MATERIALIZED (
  SELECT
    id,
    metadata ->> 'planningStartDate' AS value,
    substring(metadata ->> 'planningStartDate' FROM 1 FOR 4)::int AS year_value,
    substring(metadata ->> 'planningStartDate' FROM 6 FOR 2)::int AS month_value,
    substring(metadata ->> 'planningStartDate' FROM 9 FOR 2)::int AS day_value
  FROM work_orders
  WHERE planning_start_date IS NULL
    AND COALESCE(metadata ->> 'planningStartDate', '')
      ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'
), normalized AS MATERIALIZED (
  SELECT
    id,
    value,
    (make_date(year_value, month_value, 1) + ((day_value - 1) * INTERVAL '1 day'))::date AS date_value
  FROM candidate
  WHERE year_value BETWEEN 1 AND 9999
), exact_date AS (
  SELECT id, date_value AS value
  FROM normalized
  WHERE to_char(date_value, 'YYYY-MM-DD') = value
)
UPDATE work_orders AS work_order
SET planning_start_date = exact_date.value
FROM exact_date
WHERE work_order.id = exact_date.id;

-- Planning start-date retries must not advance the aggregate twice after a
-- lost HTTP response. The key is actor-scoped across domain commands so reuse
-- with different coordinates can fail closed.
ALTER TABLE domain_change_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS domain_change_log_actor_idempotency_uidx
  ON domain_change_log (actor_id, idempotency_key)
  WHERE actor_id IS NOT NULL AND idempotency_key IS NOT NULL;

INSERT INTO mes_schema_migrations(version)
VALUES ('032_planning_work_order_start_date')
ON CONFLICT (version) DO NOTHING;
