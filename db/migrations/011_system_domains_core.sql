-- Normalized authority for the organization, personnel and access domains.
-- This deliberately keeps compatibility-only source provenance in JSONB, but
-- keeps every operational relation in a first-class table with foreign keys.

CREATE TABLE IF NOT EXISTS system_domain_sets (
  id TEXT PRIMARY KEY,
  schema_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  migrated_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_org_units (
  id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  kind TEXT NOT NULL, parent_org_unit_id TEXT REFERENCES system_org_units(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true, valid_from DATE, valid_to DATE,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_work_centers (
  id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  org_unit_id TEXT REFERENCES system_org_units(id) ON DELETE RESTRICT,
  parent_work_center_id TEXT REFERENCES system_work_centers(id) ON DELETE RESTRICT,
  participates_in_planning BOOLEAN NOT NULL DEFAULT false, can_plan_directly BOOLEAN NOT NULL DEFAULT false,
  show_in_gantt BOOLEAN NOT NULL DEFAULT true, availability_source TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true, source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_schedule_templates (
  id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '', subtract_lunch BOOLEAN NOT NULL DEFAULT false,
  pattern_offset INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS system_positions (
  id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '',
  org_unit_id TEXT REFERENCES system_org_units(id) ON DELETE RESTRICT,
  work_center_id TEXT REFERENCES system_work_centers(id) ON DELETE RESTRICT,
  default_schedule_template_id TEXT REFERENCES system_schedule_templates(id) ON DELETE RESTRICT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb, operation_classes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true, source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_employees (
  id TEXT PRIMARY KEY, personnel_number TEXT NOT NULL DEFAULT '', display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_employment_assignments (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES system_employees(id) ON DELETE RESTRICT,
  position_id TEXT REFERENCES system_positions(id) ON DELETE RESTRICT,
  org_unit_id TEXT REFERENCES system_org_units(id) ON DELETE RESTRICT,
  work_center_id TEXT REFERENCES system_work_centers(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT false, valid_from DATE, valid_to DATE,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_equipment (
  id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  org_unit_id TEXT REFERENCES system_org_units(id) ON DELETE RESTRICT,
  work_center_id TEXT REFERENCES system_work_centers(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  schedule_template_id TEXT REFERENCES system_schedule_templates(id) ON DELETE RESTRICT,
  participates_in_planning BOOLEAN NOT NULL DEFAULT false, availability_source TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true, source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_schedule_assignments (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES system_employees(id) ON DELETE RESTRICT,
  schedule_template_id TEXT NOT NULL REFERENCES system_schedule_templates(id) ON DELETE RESTRICT,
  pattern_offset INTEGER NOT NULL DEFAULT 0, valid_from DATE, valid_to DATE, source TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS system_attendance_events (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES system_employees(id) ON DELETE RESTRICT,
  event_date DATE NOT NULL, event_type TEXT NOT NULL DEFAULT 'work', start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '', overtime_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT '', source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_access_roles (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT 'factory',
  default_module_id TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT true,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_access_grants (
  id TEXT PRIMARY KEY, role_id TEXT NOT NULL REFERENCES system_access_roles(id) ON DELETE RESTRICT,
  resource_type TEXT NOT NULL DEFAULT 'module', resource_id TEXT NOT NULL, action_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')), source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_role_assignments (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES system_employees(id) ON DELETE RESTRICT,
  role_id TEXT NOT NULL REFERENCES system_access_roles(id) ON DELETE RESTRICT, source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_responsibility_policies (
  id TEXT PRIMARY KEY, subject_employee_id TEXT NOT NULL REFERENCES system_employees(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL, updated_at_source TEXT NOT NULL DEFAULT '', source_ref JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS system_responsibility_targets (
  policy_id TEXT NOT NULL REFERENCES system_responsibility_policies(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES system_employees(id) ON DELETE RESTRICT,
  PRIMARY KEY (policy_id, employee_id)
);

CREATE INDEX IF NOT EXISTS system_org_units_parent_idx ON system_org_units(parent_org_unit_id);
CREATE INDEX IF NOT EXISTS system_work_centers_org_unit_idx ON system_work_centers(org_unit_id);
CREATE INDEX IF NOT EXISTS system_employment_assignments_employee_idx ON system_employment_assignments(employee_id);
CREATE INDEX IF NOT EXISTS system_schedule_assignments_employee_idx ON system_schedule_assignments(employee_id);
CREATE INDEX IF NOT EXISTS system_attendance_events_employee_date_idx ON system_attendance_events(employee_id, event_date);

INSERT INTO mes_schema_migrations(version) VALUES ('011_system_domains_core') ON CONFLICT (version) DO NOTHING;
