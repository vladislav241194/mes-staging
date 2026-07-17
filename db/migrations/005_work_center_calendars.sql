-- Working time is an independent domain projection. Operation timing must not
-- depend on a browser-only copy of work-center schedules.

CREATE TABLE IF NOT EXISTS work_center_calendars (
  work_center_id TEXT PRIMARY KEY,
  work_schedule TEXT NOT NULL,
  work_mode TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_center_calendars_active_idx ON work_center_calendars (is_active, work_center_id);

INSERT INTO mes_schema_migrations(version) VALUES ('005_work_center_calendars') ON CONFLICT (version) DO NOTHING;
