-- A compatibility snapshot can still be changed by legacy modules while
-- PostgreSQL becomes the planning read authority.  A full aggregate-by-
-- aggregate comparison is safe, but too expensive to run repeatedly once the
-- two projections have been proven equal.  This singleton stores a monotonic
-- PostgreSQL epoch and the exact planning snapshot fingerprint which was last
-- checked against it.
--
-- Every mutation of the planning projection bumps the epoch, invalidating the
-- proof before a later read can trust it.  A snapshot-side change invalidates
-- the proof because its fingerprint no longer matches.  Thus a missing or
-- stale row never fails open: the API falls back to the existing full parity
-- comparison.

CREATE TABLE IF NOT EXISTS planning_projection_parity_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  primary_revision BIGINT NOT NULL DEFAULT 0 CHECK (primary_revision >= 0),
  primary_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_primary_revision BIGINT,
  verified_snapshot_fingerprint TEXT NOT NULL DEFAULT '',
  verified_contract_version INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ
);

ALTER TABLE planning_projection_parity_state
  ADD COLUMN IF NOT EXISTS verified_contract_version INTEGER NOT NULL DEFAULT 0;

INSERT INTO planning_projection_parity_state (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION mes_bump_planning_projection_parity_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE planning_projection_parity_state
  SET primary_revision = primary_revision + 1,
      primary_updated_at = clock_timestamp(),
      verified_primary_revision = NULL,
      verified_snapshot_fingerprint = '',
      verified_contract_version = 0,
      verified_at = NULL
  WHERE singleton = TRUE;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS planning_projection_parity_work_orders_trigger ON work_orders;
CREATE TRIGGER planning_projection_parity_work_orders_trigger
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON work_orders
FOR EACH STATEMENT EXECUTE FUNCTION mes_bump_planning_projection_parity_revision();

DROP TRIGGER IF EXISTS planning_projection_parity_operations_trigger ON work_order_operations;
CREATE TRIGGER planning_projection_parity_operations_trigger
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON work_order_operations
FOR EACH STATEMENT EXECUTE FUNCTION mes_bump_planning_projection_parity_revision();

DROP TRIGGER IF EXISTS planning_projection_parity_slots_trigger ON planning_slots;
CREATE TRIGGER planning_projection_parity_slots_trigger
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON planning_slots
FOR EACH STATEMENT EXECUTE FUNCTION mes_bump_planning_projection_parity_revision();

INSERT INTO mes_schema_migrations(version)
VALUES ('021_planning_projection_parity_watermark')
ON CONFLICT (version) DO NOTHING;
