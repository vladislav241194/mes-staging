-- A Planning read can safely skip compatibility-snapshot I/O only after the
-- snapshot itself has been observed by the same durable marker that protects
-- the PostgreSQL projection.  The observation is deliberately a generation,
-- not a timestamp: every managed planning snapshot mutation first makes the
-- state pending, so a failed or overlapping write can never leave a stale
-- projection trusted.

ALTER TABLE planning_projection_parity_state
  ADD COLUMN IF NOT EXISTS snapshot_generation BIGINT NOT NULL DEFAULT 0 CHECK (snapshot_generation >= 0),
  ADD COLUMN IF NOT EXISTS snapshot_observation_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK (snapshot_observation_state IN ('unknown', 'pending', 'observed', 'failed')),
  ADD COLUMN IF NOT EXISTS observed_snapshot_version BIGINT,
  ADD COLUMN IF NOT EXISTS observed_snapshot_fingerprint TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observed_snapshot_source TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observed_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observed_snapshot_error TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verified_snapshot_generation BIGINT;

-- Replace the v021 trigger function in-place.  A primary mutation does not
-- alter the observed snapshot, but it must invalidate the cross-store proof
-- before any later Planning read can use PostgreSQL without re-proving it.
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
      verified_snapshot_generation = NULL,
      verified_contract_version = 0,
      verified_at = NULL
  WHERE singleton = TRUE;
  RETURN NULL;
END;
$$;

INSERT INTO mes_schema_migrations(version)
VALUES ('024_planning_snapshot_observation_guard')
ON CONFLICT (version) DO NOTHING;
