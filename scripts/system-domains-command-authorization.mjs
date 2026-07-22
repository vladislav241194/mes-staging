import { inspectEmployeeAuthSession } from "./employee-auth-guard.mjs";
import { getCurrentDirectoryAuthorization } from "./nomenclature-command-authorization.mjs";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { createAccessControlService } from "../src/modules/access_control/service.js";
import {
  getSystemDomainAccessSubject,
  toAccessControlAssignments,
  toAccessControlRoles,
} from "../src/modules/system_domains/runtime_adapter.js";

export const SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT = Object.freeze({
  moduleId: "productionStructureMatrix",
  resourceId: "production-structure",
  action: "edit",
});

export const SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT = Object.freeze({
  moduleId: "timesheet",
  resourceId: "timesheet",
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

function denied(reason, {
  principal = null,
  revision = 0,
  contract = SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT,
  targetEmployeeId = "",
} = {}) {
  return Object.freeze({
    allowed: false,
    reason: String(reason || "production-structure-authorization-denied"),
    principal,
    revision: Number(revision || 0),
    decision: null,
    viewDecision: null,
    infrastructureUnavailable: isSystemDomainsProductionStructureAuthorizationInfrastructureReason(reason),
    contract,
    targetEmployeeId: String(targetEmployeeId || "").trim(),
  });
}

function normalizeEmployeeActor(principal = null) {
  const employeeId = String(principal?.employeeId || "").trim();
  const id = String(principal?.id || "").trim();
  if (principal?.scope !== "employee" || !employeeId || id !== `employee:${employeeId}`) return null;
  return Object.freeze({
    id,
    employeeId,
    displayName: String(principal.displayName || ""),
    personnelNumber: String(principal.personnelNumber || ""),
    scope: "employee",
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

export async function getCurrentSystemDomainsTimesheetAuthorization(employeePrincipal, {
  targetEmployeeId = "",
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory = createSystemDomainsRepository,
  accessControlServiceFactory = createAccessControlService,
  now = () => new Date(),
} = {}) {
  const principal = normalizeEmployeeActor(employeePrincipal);
  const normalizedTargetEmployeeId = String(targetEmployeeId || "").trim();
  const deniedOptions = {
    principal,
    contract: SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT,
    targetEmployeeId: normalizedTargetEmployeeId,
  };
  if (!principal) return denied("employee-session-required", deniedOptions);
  if (!normalizedTargetEmployeeId) return denied("timesheet-target-required", deniedOptions);
  if (!databaseUrl) return denied("system-domains-storage-not-configured", deniedOptions);

  let repository;
  try {
    repository = domainsRepositoryFactory({ databaseUrl });
    const current = await repository.get();
    const revision = Number(current?.revision || 0);
    if (!current?.item) return denied("system-domains-unavailable", { ...deniedOptions, revision });
    const subject = getSystemDomainAccessSubject(current.item, principal.employeeId);
    const target = getSystemDomainAccessSubject(current.item, normalizedTargetEmployeeId);
    if (!target.id || !target.active) {
      return denied("timesheet-target-unavailable", { ...deniedOptions, revision });
    }
    const service = accessControlServiceFactory({
      accessRoles: toAccessControlRoles(current.item),
      subjectRoleAssignments: toAccessControlAssignments(current.item),
      now,
    });
    const resourceContext = {
      resourceId: SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT.resourceId,
      targetSubjectId: target.id,
      employeeId: target.id,
      departmentIds: target.departmentIds,
      workCenterIds: target.workCenterIds,
    };
    const viewDecision = service.explainCan(subject, SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT.moduleId, "view", resourceContext);
    const decision = service.explainCan(
      subject,
      SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT.moduleId,
      SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT.action,
      resourceContext,
    );
    const allowed = Boolean(viewDecision.allowed && decision.allowed);
    return Object.freeze({
      allowed,
      reason: viewDecision.allowed ? decision.reason : viewDecision.reason,
      principal,
      revision,
      decision: Object.freeze({ ...decision }),
      viewDecision: Object.freeze({ ...viewDecision }),
      infrastructureUnavailable: false,
      contract: SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT,
      targetEmployeeId: normalizedTargetEmployeeId,
    });
  } catch {
    return denied("system-domains-storage-unavailable", deniedOptions);
  } finally {
    await repository?.close?.();
  }
}

export async function resolveSystemDomainsTimesheetAuthorization(req, {
  env = process.env,
  employeeAuthRepositoryFactory,
  domainsRepositoryFactory,
  accessControlServiceFactory,
  targetEmployeeId = "",
  now = () => new Date(),
} = {}) {
  const session = await inspectEmployeeAuthSession(req, env, {
    ...(employeeAuthRepositoryFactory ? { repositoryFactory: employeeAuthRepositoryFactory } : {}),
    now,
  });
  if (!session.principal) {
    return denied(session.reason, {
      contract: SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT,
      targetEmployeeId,
    });
  }
  if (!String(targetEmployeeId || "").trim()) {
    return denied("timesheet-target-required", {
      principal: normalizeEmployeeActor(session.principal),
      contract: SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT,
    });
  }
  return getCurrentSystemDomainsTimesheetAuthorization(session.principal, {
    targetEmployeeId,
    databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    ...(accessControlServiceFactory ? { accessControlServiceFactory } : {}),
    now,
  });
}

export function projectSystemDomainsProductionStructureAuthorization(value = {}) {
  const principal = normalizeEmployeeActor(value?.principal);
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

export function projectSystemDomainsTimesheetAuthorization(value = {}) {
  const principal = normalizeEmployeeActor(value?.principal);
  const targetEmployeeId = String(value?.targetEmployeeId || "").trim();
  return Object.freeze({
    authenticated: Boolean(principal),
    authorized: value?.allowed === true && Boolean(principal) && Boolean(targetEmployeeId),
    canEdit: value?.allowed === true && Boolean(principal) && Boolean(targetEmployeeId),
    actor: principal,
    targetEmployeeId,
    reason: String(value?.reason || (principal ? "timesheet-write-forbidden" : "employee-session-required")),
    revision: Number(value?.revision || 0),
    infrastructureUnavailable: value?.infrastructureUnavailable === true,
    contract: SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT,
  });
}
