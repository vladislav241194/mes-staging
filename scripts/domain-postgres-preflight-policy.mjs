export const FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS = Object.freeze([
  "009_specifications2_revision_read_model",
  "014_shift_execution_command_idempotency",
  "022_shift_execution_carryover_lifecycle",
  "023_system_domains_postgres_primary_authority",
  "026_system_responsibility_policy_lifecycle",
]);

export const EMPLOYEE_AUTH_MIGRATION = "027_employee_auth_credentials";

function enabled(value) {
  return String(value ?? "").trim() === "1";
}

export function requiresEmployeeAuthMigration(env = process.env) {
  return enabled(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS)
    || enabled(env.MES_ENABLE_EMPLOYEE_AUTH)
    || enabled(env.MES_EMPLOYEE_AUTH_ENABLED)
    || Boolean(String(env.MES_EMPLOYEE_AUTH_SESSION_SECRET || "").trim());
}

export function getRequiredDomainMigrations(env = process.env) {
  return requiresEmployeeAuthMigration(env)
    ? [...FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS, EMPLOYEE_AUTH_MIGRATION]
    : [...FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS];
}
