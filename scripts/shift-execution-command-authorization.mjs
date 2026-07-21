import { inspectEmployeeAuthSession } from "./employee-auth-guard.mjs";
import { getCurrentDirectoryAuthorization } from "./nomenclature-command-authorization.mjs";

export const SHIFT_EXECUTION_COMMAND_AUTHORIZATION_CONTRACTS = Object.freeze({
  assignment: Object.freeze({
    moduleId: "shiftMasterBoard",
    resourceId: "shiftMasterBoard",
    action: "assign",
  }),
  fact: Object.freeze({
    moduleId: "shiftMasterBoard",
    resourceId: "shiftMasterBoard",
    action: "edit",
  }),
  carryover: Object.freeze({
    moduleId: "shiftMasterBoard",
    resourceId: "shiftMasterBoard",
    action: "edit",
  }),
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

export function isShiftExecutionAuthorizationInfrastructureReason(reason = "") {
  const normalized = String(reason || "");
  return EMPLOYEE_AUTH_INFRASTRUCTURE_REASONS.has(normalized)
    || SYSTEM_DOMAINS_INFRASTRUCTURE_REASONS.has(normalized);
}

function denied(reason, { principal = null, revision = 0, contract = null, workCenterId = "" } = {}) {
  return Object.freeze({
    allowed: false,
    reason: String(reason || "shift-execution-authorization-denied"),
    principal,
    revision: Number(revision || 0),
    decision: null,
    viewDecision: null,
    workCenterId: String(workCenterId || ""),
    infrastructureUnavailable: isShiftExecutionAuthorizationInfrastructureReason(reason),
    contract,
  });
}

function getContract(commandKind = "") {
  return SHIFT_EXECUTION_COMMAND_AUTHORIZATION_CONTRACTS[String(commandKind || "").trim()] || null;
}

export async function getCurrentShiftExecutionAuthorization(employeePrincipal, {
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory,
  now = () => new Date(),
  commandKind = "",
  workCenterId = "",
} = {}) {
  const contract = getContract(commandKind);
  const canonicalWorkCenterId = String(workCenterId || "").trim();
  if (!contract) return denied("shift-execution-command-kind-required");
  if (!canonicalWorkCenterId) return denied("shift-execution-work-center-required", { principal: employeePrincipal, contract });
  const authorization = await getCurrentDirectoryAuthorization(employeePrincipal, {
    databaseUrl,
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
    moduleId: contract.moduleId,
    resourceId: contract.resourceId,
    action: contract.action,
    resourceContext: { workCenterId: canonicalWorkCenterId },
  });
  return Object.freeze({
    ...authorization,
    workCenterId: canonicalWorkCenterId,
    infrastructureUnavailable: isShiftExecutionAuthorizationInfrastructureReason(authorization.reason),
    contract,
  });
}

export async function inspectShiftExecutionCommandSession(req, {
  env = process.env,
  employeeAuthRepositoryFactory,
  now = () => new Date(),
} = {}) {
  const session = await inspectEmployeeAuthSession(req, env, {
    ...(employeeAuthRepositoryFactory ? { repositoryFactory: employeeAuthRepositoryFactory } : {}),
    now,
  });
  return Object.freeze({
    ...session,
    infrastructureUnavailable: isShiftExecutionAuthorizationInfrastructureReason(session.reason),
  });
}

export async function resolveShiftExecutionCommandAuthorization(req, {
  env = process.env,
  employeeAuthRepositoryFactory,
  domainsRepositoryFactory,
  now = () => new Date(),
  commandKind = "",
  workCenterId = "",
} = {}) {
  const contract = getContract(commandKind);
  if (!contract) return denied("shift-execution-command-kind-required");
  const session = await inspectShiftExecutionCommandSession(req, { env, employeeAuthRepositoryFactory, now });
  if (!session.principal) return denied(session.reason, { contract, workCenterId });
  return getCurrentShiftExecutionAuthorization(session.principal, {
    databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
    ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
    now,
    commandKind,
    workCenterId,
  });
}
