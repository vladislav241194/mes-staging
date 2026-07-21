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

export async function getCurrentNomenclatureAuthorization(employeePrincipal, {
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  domainsRepositoryFactory = createSystemDomainsRepository,
  now = () => new Date(),
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
    const resource = { resourceId: "nomenclature" };
    const viewDecision = service.explainCan(subject, "directories", "view", resource);
    const decision = service.explainCan(subject, "directories", "edit", resource);
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
