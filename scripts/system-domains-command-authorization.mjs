import { inspectEmployeeAuthSession } from "./employee-auth-guard.mjs";
import { getCurrentDirectoryAuthorization } from "./nomenclature-command-authorization.mjs";

export const SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT = Object.freeze({
  moduleId: "productionStructureMatrix",
  resourceId: "production-structure",
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

export function isSystemDomainsProductionStructureAuthorizationInfrastructureReason(reason = "") {
  const normalized = String(reason || "");
  return EMPLOYEE_AUTH_INFRASTRUCTURE_REASONS.has(normalized)
    || SYSTEM_DOMAINS_INFRASTRUCTURE_REASONS.has(normalized);
}

function denied(reason, { principal = null, revision = 0 } = {}) {
  return Object.freeze({
    allowed: false,
    reason: String(reason || "production-structure-authorization-denied"),
    principal,
    revision: Number(revision || 0),
    decision: null,
    viewDecision: null,
    infrastructureUnavailable: isSystemDomainsProductionStructureAuthorizationInfrastructureReason(reason),
    contract: SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT,
  });
}

export async function getCurrentSystemDomainsProductionStructureAuthorization(employeePrincipal, {
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory,
  now = () => new Date(),
} = {}) {
  const authorization = await getCurrentDirectoryAuthorization(employeePrincipal, {
    databaseUrl,
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
    moduleId: SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT.moduleId,
    resourceId: SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT.resourceId,
    action: SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT.action,
  });
  return Object.freeze({
    ...authorization,
    infrastructureUnavailable: isSystemDomainsProductionStructureAuthorizationInfrastructureReason(authorization.reason),
    contract: SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT,
  });
}

export async function resolveSystemDomainsProductionStructureAuthorization(req, {
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

  return getCurrentSystemDomainsProductionStructureAuthorization(session.principal, {
    databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
  });
}

export function projectSystemDomainsProductionStructureAuthorization(value = {}) {
  const employeeId = String(value?.principal?.employeeId || "").trim();
  const principalId = String(value?.principal?.id || "").trim();
  const principal = value?.principal?.scope === "employee"
    && employeeId
    && principalId === `employee:${employeeId}`
    ? Object.freeze({
      id: principalId,
      employeeId,
      displayName: String(value.principal.displayName || ""),
      personnelNumber: String(value.principal.personnelNumber || ""),
      scope: "employee",
    })
    : null;
  return Object.freeze({
    authenticated: Boolean(principal),
    authorized: value?.allowed === true && Boolean(principal),
    canEdit: value?.allowed === true && Boolean(principal),
    actor: principal,
    reason: String(value?.reason || (principal ? "production-structure-write-forbidden" : "employee-session-required")),
    revision: Number(value?.revision || 0),
    infrastructureUnavailable: value?.infrastructureUnavailable === true,
    contract: SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT,
  });
}
