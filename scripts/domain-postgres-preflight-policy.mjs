export const FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS = Object.freeze([
  "009_specifications2_revision_read_model",
  "014_shift_execution_command_idempotency",
  "022_shift_execution_carryover_lifecycle",
  "023_system_domains_postgres_primary_authority",
  "026_system_responsibility_policy_lifecycle",
]);

export const EMPLOYEE_AUTH_MIGRATION = "027_employee_auth_credentials";
export const SPECIFICATIONS2_ATTACHMENT_MIGRATION = "019_specifications2_attachment_blobs";
export const SPECIFICATIONS2_PUBLICATION_IDEMPOTENCY_MIGRATION = "028_specifications2_publication_idempotency";
export const SPECIFICATIONS2_REVISION_IDENTITY_BACKFILL_MIGRATION = "029_specifications2_revision_identity_backfill";
export const SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION = "030_specifications2_legacy_revision_identity_guard";
export const SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION = "031_specifications2_guard_function_repair";
export const PLANNING_START_DATE_COMMAND_MIGRATION = "032_planning_work_order_start_date";
export const SHIFT_EXECUTION_SERVER_COMMAND_REQUIRED_MIGRATIONS = Object.freeze([
  "008_shift_execution_read_model",
  "014_shift_execution_command_idempotency",
  "015_shift_execution_assignment_revisions",
  "016_shift_execution_fact_idempotency",
  "017_shift_execution_carryover_idempotency",
  "022_shift_execution_carryover_lifecycle",
  "025_shift_execution_postgres_authority",
]);
export const SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS = Object.freeze([
  SPECIFICATIONS2_PUBLICATION_IDEMPOTENCY_MIGRATION,
  SPECIFICATIONS2_REVISION_IDENTITY_BACKFILL_MIGRATION,
  SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION,
  SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION,
]);
// Compatibility alias for existing preflight consumers. Migrations 030/031
// protect both publication and Work Order creation, so new callers should use
// the command-surface name above.
export const SPECIFICATIONS2_PUBLICATION_REQUIRED_MIGRATIONS = SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS;

function enabled(value) {
  return String(value ?? "").trim() === "1";
}

export function requiresEmployeeAuthMigration(env = process.env) {
  return enabled(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS)
    || enabled(env.MES_ENABLE_EMPLOYEE_AUTH)
    || enabled(env.MES_EMPLOYEE_AUTH_ENABLED)
    || Boolean(String(env.MES_EMPLOYEE_AUTH_SESSION_SECRET || "").trim());
}

export function requiresSpecifications2ServerCommandMigrations(env = process.env) {
  return enabled(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS)
    || enabled(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS);
}

export function requiresSpecifications2AttachmentMigration(env = process.env) {
  return enabled(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS);
}

export function requiresShiftExecutionServerCommandMigrations(env = process.env) {
  return enabled(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS);
}

export function requiresPlanningStartDateCommandMigration(env = process.env) {
  return enabled(env.MES_ENABLE_PLANNING_START_DATE_COMMANDS);
}

export function requiresSpecifications2PublicationIdempotencyMigration(env = process.env) {
  return requiresSpecifications2ServerCommandMigrations(env);
}

export function getRequiredDomainMigrations(env = process.env) {
  const required = new Set(FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS);
  if (requiresEmployeeAuthMigration(env)) required.add(EMPLOYEE_AUTH_MIGRATION);
  if (requiresSpecifications2AttachmentMigration(env)) required.add(SPECIFICATIONS2_ATTACHMENT_MIGRATION);
  if (requiresSpecifications2ServerCommandMigrations(env)) {
    SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS.forEach((migration) => required.add(migration));
  }
  if (requiresShiftExecutionServerCommandMigrations(env)) {
    SHIFT_EXECUTION_SERVER_COMMAND_REQUIRED_MIGRATIONS.forEach((migration) => required.add(migration));
  }
  if (requiresPlanningStartDateCommandMigration(env)) required.add(PLANNING_START_DATE_COMMAND_MIGRATION);
  return [...required];
}
