-- A carryover is an active obligation for a specific assignment and future
-- shift date.  Facts may be corrected after the obligation was created, so
-- removal must be a durable, attributable state transition rather than a
-- destructive delete.  This preserves the audit trail while keeping active
-- workshop reads free of superseded work.
ALTER TABLE shift_carryovers
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NOT NULL DEFAULT '';

-- Older compatibility writes could create more than one row for the same
-- source assignment/date.  Retain every row, but close older active copies
-- before enforcing the single-active-obligation invariant below.
WITH ranked_active_carryovers AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY source_assignment_id, date_key
           ORDER BY created_at DESC, id DESC
         ) AS active_rank
  FROM shift_carryovers
  WHERE canceled_at IS NULL
)
UPDATE shift_carryovers AS carryover
SET canceled_at = now(),
    canceled_by = 'migration:022',
    cancellation_reason = 'Superseded duplicate normalized during carryover lifecycle migration'
FROM ranked_active_carryovers AS ranked
WHERE carryover.id = ranked.id
  AND ranked.active_rank > 1
  AND carryover.canceled_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shift_carryovers_active_assignment_date_key
  ON shift_carryovers (source_assignment_id, date_key)
  WHERE canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS shift_carryovers_active_dispatch_idx
  ON shift_carryovers (date_key, work_center_id, created_at DESC, id DESC)
  WHERE canceled_at IS NULL;

-- A cancellation must be safely retryable independently from the original
-- creation request.  The ledger records the server actor and makes retries
-- return the already-canceled canonical row without another mutation.
CREATE TABLE IF NOT EXISTS shift_execution_carryover_cancellation_requests (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  shift_carryover_id TEXT NOT NULL REFERENCES shift_carryovers(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mes_schema_migrations(version)
VALUES ('022_shift_execution_carryover_lifecycle')
ON CONFLICT (version) DO NOTHING;
