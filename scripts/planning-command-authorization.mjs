import { inspectEmployeeAuthSession } from "./employee-auth-guard.mjs";
import { getCurrentDirectoryAuthorization } from "./nomenclature-command-authorization.mjs";

// Planning quantity and slot mutations are already exposed by the same
// workbench/Gantt permission on the client. The server must independently
// enforce that exact current System Domains contract; a public perimeter
// session, URL flag, or browser-provided actor is never sufficient.
export const PLANNING_COMMAND_AUTHORIZATION_CONTRACT = Object.freeze({
  moduleId: "planning",
  resourceId: "planning",
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

export function isPlanningAuthorizationInfrastructureReason(reason = "") {
  const normalized = String(reason || "");
  return EMPLOYEE_AUTH_INFRASTRUCTURE_REASONS.has(normalized)
    || SYSTEM_DOMAINS_INFRASTRUCTURE_REASONS.has(normalized);
}

function denied(reason, { principal = null, revision = 0 } = {}) {
  return Object.freeze({
    allowed: false,
    reason: String(reason || "planning-authorization-denied"),
    principal,
    revision: Number(revision || 0),
    decision: null,
    viewDecision: null,
    infrastructureUnavailable: isPlanningAuthorizationInfrastructureReason(reason),
    contract: PLANNING_COMMAND_AUTHORIZATION_CONTRACT,
  });
}

export async function getCurrentPlanningAuthorization(employeePrincipal, {
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory,
  now = () => new Date(),
} = {}) {
  const authorization = await getCurrentDirectoryAuthorization(employeePrincipal, {
    databaseUrl,
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
    moduleId: PLANNING_COMMAND_AUTHORIZATION_CONTRACT.moduleId,
    resourceId: PLANNING_COMMAND_AUTHORIZATION_CONTRACT.resourceId,
    action: PLANNING_COMMAND_AUTHORIZATION_CONTRACT.action,
  });
  return Object.freeze({
    ...authorization,
    infrastructureUnavailable: isPlanningAuthorizationInfrastructureReason(authorization.reason),
    contract: PLANNING_COMMAND_AUTHORIZATION_CONTRACT,
  });
}

export async function resolvePlanningCommandAuthorization(req, {
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

  return getCurrentPlanningAuthorization(session.principal, {
    databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
  });
}
