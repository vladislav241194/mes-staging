import { inspectEmployeeAuthSession } from "./employee-auth-guard.mjs";
import { getCurrentDirectoryAuthorization } from "./nomenclature-command-authorization.mjs";

// Live System Domains already grants Specifications 2.0 `edit` to the
// technologist role. Publication and create-from-revision are both actions in
// that editor, so they share this exact contract. Requiring `approve` or an
// additional Planning grant would lock out every currently assigned
// technologist; weakening this to `view` would grant production writes to
// read-only roles.
export const SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT = Object.freeze({
  moduleId: "specifications2",
  resourceId: "specifications2",
  action: "edit",
});

const EMPLOYEE_AUTH_INFRASTRUCTURE_REASONS = new Set([
  "employee-auth-not-configured",
  "employee-auth-storage-not-configured",
  "employee-auth-storage-unavailable",
]);

const SYSTEM_DOMAINS_INFRASTRUCTURE_REASONS = new Set([
  "system-domains-storage-not-configured",
  "system-domains-unavailable",
  "system-domains-storage-unavailable",
]);

export function isSpecifications2AuthorizationInfrastructureReason(reason = "") {
  const normalized = String(reason || "");
  return EMPLOYEE_AUTH_INFRASTRUCTURE_REASONS.has(normalized)
    || SYSTEM_DOMAINS_INFRASTRUCTURE_REASONS.has(normalized);
}

function denied(reason, { principal = null, revision = 0 } = {}) {
  return Object.freeze({
    allowed: false,
    reason: String(reason || "specifications2-authorization-denied"),
    principal,
    revision: Number(revision || 0),
    decision: null,
    viewDecision: null,
    infrastructureUnavailable: isSpecifications2AuthorizationInfrastructureReason(reason),
    contract: SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT,
  });
}

export async function getCurrentSpecifications2Authorization(employeePrincipal, {
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory,
  now = () => new Date(),
} = {}) {
  const authorization = await getCurrentDirectoryAuthorization(employeePrincipal, {
    databaseUrl,
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
    moduleId: SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT.moduleId,
    resourceId: SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT.resourceId,
    action: SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT.action,
  });
  return Object.freeze({
    ...authorization,
    infrastructureUnavailable: isSpecifications2AuthorizationInfrastructureReason(authorization.reason),
    contract: SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT,
  });
}

export async function resolveSpecifications2CommandAuthorization(req, {
  env = process.env,
  employeeAuthRepositoryFactory,
  domainsRepositoryFactory,
  now = () => new Date(),
} = {}) {
  const session = await inspectEmployeeAuthSession(req, env, {
    ...(employeeAuthRepositoryFactory ? { repositoryFactory: employeeAuthRepositoryFactory } : {}),
    now,
  });
  if (!session.principal) return denied(session.reason);

  return getCurrentSpecifications2Authorization(session.principal, {
    databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
  });
}
