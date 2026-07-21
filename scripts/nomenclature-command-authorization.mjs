import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { createAccessControlService } from "../src/modules/access_control/service.js";
import {
  getSystemDomainAccessSubject,
  toAccessControlAssignments,
  toAccessControlRoles,
} from "../src/modules/system_domains/runtime_adapter.js";

function denied(reason, principal = null, revision = 0) {
  return Object.freeze({
    allowed: false,
    reason,
    principal,
    revision: Number(revision || 0),
    decision: null,
    viewDecision: null,
  });
}

export async function getCurrentDirectoryAuthorization(employeePrincipal, {
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory = createSystemDomainsRepository,
  now = () => new Date(),
  moduleId = "directories",
  resourceId = "nomenclature",
} = {}) {
  if (!employeePrincipal?.employeeId || employeePrincipal.scope !== "employee") {
    return denied("employee-session-required");
  }
  if (!databaseUrl) return denied("system-domains-storage-not-configured", employeePrincipal);

  let repository;
  try {
    repository = domainsRepositoryFactory({ databaseUrl });
    const current = await repository.get();
    if (!current?.item) return denied("system-domains-unavailable", employeePrincipal, current?.revision);
    const subject = getSystemDomainAccessSubject(current.item, employeePrincipal.employeeId);
    const service = createAccessControlService({
      accessRoles: toAccessControlRoles(current.item),
      subjectRoleAssignments: toAccessControlAssignments(current.item),
      now,
    });
    const normalizedModuleId = String(moduleId || "").trim().slice(0, 160);
    const normalizedResourceId = String(resourceId || "").trim().slice(0, 160);
    if (!normalizedModuleId) return denied("directory-module-required", employeePrincipal, current.revision);
    if (!normalizedResourceId) return denied("directory-resource-required", employeePrincipal, current.revision);
    const resource = { resourceId: normalizedResourceId };
    const viewDecision = service.explainCan(subject, normalizedModuleId, "view", resource);
    const decision = service.explainCan(subject, normalizedModuleId, "edit", resource);
    return Object.freeze({
      allowed: Boolean(decision.allowed),
      reason: decision.reason,
      principal: employeePrincipal,
      revision: Number(current.revision || 0),
      decision: Object.freeze({ ...decision }),
      viewDecision: Object.freeze({ ...viewDecision }),
    });
  } catch {
    return denied("system-domains-storage-unavailable", employeePrincipal);
  } finally {
    await repository?.close?.();
  }
}

export async function getCurrentNomenclatureAuthorization(employeePrincipal, options = {}) {
  return getCurrentDirectoryAuthorization(employeePrincipal, {
    ...options,
    moduleId: "nomenclature",
    resourceId: "nomenclature",
  });
}
