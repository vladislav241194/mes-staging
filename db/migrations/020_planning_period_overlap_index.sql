-- Weekly control reads only slots intersecting a bounded half-open period.
-- The existing operation-first index cannot efficiently serve that global
-- time-range query, so keep a separate additive range index. It intentionally
-- excludes incomplete slots because they can never appear in the period read.

CREATE INDEX IF NOT EXISTS planning_slots_period_overlap_idx
  ON planning_slots
  USING GIST (tstzrange(planned_start, planned_end, '[)'))
  WHERE planned_start IS NOT NULL AND planned_end IS NOT NULL;

INSERT INTO mes_schema_migrations(version) VALUES ('020_planning_period_overlap_index') ON CONFLICT (version) DO NOTHING;
