import { createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";
import {
  isSystemDomainsAssignmentActiveOnDate,
  systemDomainsAssignmentContinuesAfterDate,
  toSystemDomainsBusinessDate,
} from "../src/domain/system_domains_lifecycle.js";

function rows(domains, registryName) {
  return Array.isArray(domains?.registries?.[registryName]) ? domains.registries[registryName] : [];
}

function activeEntity(item) {
  return Boolean(item) && item.isActive !== false;
}

function archivedEntityIds(current, candidate, registryName) {
  const next = new Map(rows(candidate, registryName).map((item) => [String(item?.id || ""), item]));
  return rows(current, registryName)
    .filter(activeEntity)
    .filter((item) => !activeEntity(next.get(String(item?.id || ""))))
    .map((item) => String(item.id || ""))
    .filter(Boolean);
}

function activeEmploymentAssignment(item, today) {
  // Employment assignments do not have an isActive field in the System
  // Domains contract. Their end date is inclusive: an assignment ending
  // today still owns the Position through the current business day.
  return isSystemDomainsAssignmentActiveOnDate(item, today);
}

function primaryAssignmentContinuesAfterEmployeeArchive(item, today) {
  // Employee archive is effective after the current business day, so the
  // normal atomic lifecycle may cap an assignment/schedule at today. Other
  // structure entities still remain owned through today and use the stricter
  // inclusive activeEmploymentAssignment check above.
  return systemDomainsAssignmentContinuesAfterDate(item, today);
}

const STABLE_LIFECYCLE_REGISTRIES = Object.freeze([
  "orgUnits", "workCenters", "positions", "employees", "equipment", "accessRoles", "responsibilityPolicies",
]);
const ARCHIVED_AT_LIFECYCLE_REGISTRIES = Object.freeze([
  "orgUnits", "workCenters", "positions", "employees", "equipment", "responsibilityPolicies",
]);

function validArchivedAt(value) {
  const source = String(value || "").trim();
  return Boolean(source) && !Number.isNaN(new Date(source).getTime());
}

function candidateFinalStructureConflicts(current, candidate, today) {
  const activeIds = new Map([
    "orgUnits", "workCenters", "positions", "employees", "equipment", "accessRoles",
  ].map((registry) => [registry, new Set(rows(candidate, registry).filter(activeEntity).map((item) => String(item.id || "")).filter(Boolean))]));
  const conflicts = [];
  const requireActiveParent = (item, registry, kind, parentRegistry, parentId, extra = {}) => {
    const normalizedParentId = String(parentId || "");
    if (!normalizedParentId || activeIds.get(parentRegistry)?.has(normalizedParentId)) return;
    conflicts.push({
      owner: "system-domains",
      registry,
      kind,
      id: String(item?.id || ""),
      parentRegistry,
      parentId: normalizedParentId,
      ...extra,
    });
  };

  for (const registry of STABLE_LIFECYCLE_REGISTRIES) {
    const candidateIds = new Set(rows(candidate, registry).map((item) => String(item?.id || "")).filter(Boolean));
    for (const item of rows(current, registry)) {
      const id = String(item?.id || "");
      if (id && !candidateIds.has(id)) {
        conflicts.push({
          owner: "system-domains",
          registry,
          kind: "hard-delete-omission",
          id,
        });
      }
    }
  }

  for (const registry of ARCHIVED_AT_LIFECYCLE_REGISTRIES) {
    const currentById = new Map(rows(current, registry).map((item) => [String(item?.id || ""), item]));
    for (const item of rows(candidate, registry)) {
      const prior = currentById.get(String(item?.id || ""));
      const nextActive = activeEntity(item);
      const priorActive = prior ? activeEntity(prior) : null;
      const archivedAt = String(item?.archivedAt || "").trim();
      // Unchanged pre-033 inactive rows without a marker are grandfathered for
      // read compatibility. Every new lifecycle transition must be auditable.
      if (!nextActive && (priorActive === true || priorActive === null) && !validArchivedAt(archivedAt)) {
        conflicts.push({ owner: "system-domains", registry, kind: "missing-archived-at", id: String(item?.id || "") });
      }
      if (nextActive && (priorActive === false || priorActive === null) && archivedAt) {
        conflicts.push({ owner: "system-domains", registry, kind: "active-with-archived-at", id: String(item?.id || "") });
      }
    }
  }

  const activePolicyBySubject = new Map();
  for (const item of rows(candidate, "responsibilityPolicies").filter(activeEntity)) {
    const subjectEmployeeId = String(item.subjectEmployeeId || "");
    const prior = activePolicyBySubject.get(subjectEmployeeId);
    if (subjectEmployeeId && prior) {
      conflicts.push({
        owner: "system-domains",
        registry: "responsibilityPolicies",
        kind: "duplicate-active-responsibility-policy",
        id: String(item.id || ""),
        conflictingId: String(prior.id || ""),
        employeeId: subjectEmployeeId,
      });
    } else if (subjectEmployeeId) activePolicyBySubject.set(subjectEmployeeId, item);
  }

  for (const item of rows(candidate, "employmentAssignments")) {
    const blocksEmployeeArchive = item.isPrimary !== false
      ? primaryAssignmentContinuesAfterEmployeeArchive(item, today)
      : activeEmploymentAssignment(item, today);
    if (blocksEmployeeArchive) {
      requireActiveParent(item, "employmentAssignments", "continuing-employment-assignment", "employees", item.employeeId, {
        employeeId: String(item.employeeId || ""), validTo: String(item.validTo || ""),
      });
    }
    if (!activeEmploymentAssignment(item, today)) continue;
    requireActiveParent(item, "employmentAssignments", "active-employment-assignment", "positions", item.positionId, {
      positionId: String(item.positionId || ""), employeeId: String(item.employeeId || ""), validTo: String(item.validTo || ""),
    });
    requireActiveParent(item, "employmentAssignments", "active-employment-assignment", "orgUnits", item.orgUnitId, {
      orgUnitId: String(item.orgUnitId || ""), employeeId: String(item.employeeId || ""), validTo: String(item.validTo || ""),
    });
    requireActiveParent(item, "employmentAssignments", "active-employment-assignment", "workCenters", item.workCenterId, {
      workCenterId: String(item.workCenterId || ""), employeeId: String(item.employeeId || ""), validTo: String(item.validTo || ""),
    });
  }
  for (const item of rows(candidate, "scheduleAssignments")) {
    if (activeEmploymentAssignment(item, today)) {
      requireActiveParent(item, "scheduleAssignments", "continuing-schedule-assignment", "employees", item.employeeId, {
        employeeId: String(item.employeeId || ""), validTo: String(item.validTo || ""),
      });
    }
  }
  for (const item of rows(candidate, "roleAssignments")) {
    requireActiveParent(item, "roleAssignments", "active-role-assignment", "employees", item.employeeId || item.subjectId, {
      employeeId: String(item.employeeId || item.subjectId || ""), roleId: String(item.roleId || ""),
    });
    requireActiveParent(item, "roleAssignments", "active-role-assignment", "accessRoles", item.roleId, {
      employeeId: String(item.employeeId || item.subjectId || ""), roleId: String(item.roleId || ""),
    });
  }
  for (const item of rows(candidate, "responsibilityPolicies").filter(activeEntity)) {
    requireActiveParent(item, "responsibilityPolicies", "active-responsibility-policy", "employees", item.subjectEmployeeId, {
      employeeId: String(item.subjectEmployeeId || ""),
    });
    for (const employeeId of item.targetEmployeeIds || []) {
      requireActiveParent(item, "responsibilityPolicies", "active-responsibility-target", "employees", employeeId, {
        employeeId: String(employeeId || ""),
      });
    }
  }
  for (const item of rows(candidate, "orgUnits").filter(activeEntity)) {
    requireActiveParent(item, "orgUnits", "active-child-org-unit", "orgUnits", item.parentOrgUnitId, { orgUnitId: String(item.parentOrgUnitId || "") });
  }
  for (const item of rows(candidate, "workCenters").filter(activeEntity)) {
    requireActiveParent(item, "workCenters", "active-work-center", "orgUnits", item.orgUnitId, { orgUnitId: String(item.orgUnitId || "") });
    requireActiveParent(item, "workCenters", "active-child-work-center", "workCenters", item.parentWorkCenterId, { workCenterId: String(item.parentWorkCenterId || "") });
  }
  for (const item of rows(candidate, "positions").filter(activeEntity)) {
    requireActiveParent(item, "positions", "active-position", "orgUnits", item.orgUnitId, { orgUnitId: String(item.orgUnitId || "") });
    requireActiveParent(item, "positions", "active-position", "workCenters", item.workCenterId, { workCenterId: String(item.workCenterId || "") });
  }
  for (const item of rows(candidate, "equipment").filter(activeEntity)) {
    requireActiveParent(item, "equipment", "active-equipment", "orgUnits", item.orgUnitId, { orgUnitId: String(item.orgUnitId || "") });
    requireActiveParent(item, "equipment", "active-equipment", "workCenters", item.workCenterId, { workCenterId: String(item.workCenterId || "") });
  }
  return conflicts;
}

function finalStateConflictResponse(conflicts) {
  if (conflicts.some((item) => item.kind === "hard-delete-omission")) return {
    code: "production-structure-hard-delete-forbidden",
    error: "Production Structure lifecycle rows must be archived and cannot be omitted from a whole-aggregate command",
  };
  if (conflicts.some((item) => item.kind === "duplicate-active-responsibility-policy")) return {
    code: "duplicate-active-responsibility-policy",
    error: "An employee cannot have more than one active responsibility policy",
  };
  if (conflicts.some((item) => ["missing-archived-at", "active-with-archived-at"].includes(item.kind))) return {
    code: "production-structure-lifecycle-marker-invalid",
    error: "Production Structure lifecycle transitions require an exact archivedAt marker state",
  };
  const parentRegistry = conflicts[0]?.parentRegistry;
  if (parentRegistry === "employees") return {
    code: "employee-active-lifecycle-dependency",
    error: "An inactive employee cannot retain a continuing assignment, schedule, role or responsibility",
  };
  if (parentRegistry === "orgUnits") return {
    code: "org-unit-active-dependency",
    error: "An inactive organizational unit cannot retain an active structural dependency",
  };
  if (parentRegistry === "workCenters") return {
    code: "work-center-active-dependency",
    error: "An inactive work center cannot retain an active structural dependency",
  };
  if (parentRegistry === "positions") return {
    code: "position-active-assignment",
    error: "An inactive position cannot retain an active employment assignment",
  };
  return {
    code: "production-structure-invalid-final-state",
    error: "Production Structure candidate contains an active dependency on an inactive parent",
  };
}

function normalizeExternalDependencies(value, owner) {
  const items = Array.isArray(value?.items) ? value.items : [];
  return items.slice(0, 100).map((item) => ({
    owner,
    kind: String(item?.kind || "active-resource-reference"),
    id: String(item?.id || ""),
    equipmentId: String(item?.equipmentId || item?.resourceId || ""),
    workOrderId: String(item?.workOrderId || ""),
    operationId: String(item?.operationId || ""),
    status: String(item?.status || ""),
  }));
}

export async function validateSystemDomainsProductionStructureImpact({
  current,
  candidate,
  workOrdersRepository,
  shiftExecutionReadRepositoryFactory = createShiftExecutionReadRepository,
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  now = () => new Date(),
} = {}) {
  const today = toSystemDomainsBusinessDate(now());
  // Validate the complete final candidate, not only active -> archived
  // transitions. A direct whole-aggregate PUT may create or reactivate a child
  // under an already inactive parent just as easily as it may archive one.
  const structureDependencies = candidateFinalStructureConflicts(current, candidate, today);
  if (structureDependencies.length) {
    const conflict = finalStateConflictResponse(structureDependencies);
    return Object.freeze({
      ok: false,
      unavailable: false,
      code: conflict.code,
      error: conflict.error,
      dependencies: structureDependencies,
    });
  }

  const archivedEquipment = archivedEntityIds(current, candidate, "equipment");
  if (!archivedEquipment.length) return Object.freeze({ ok: true, dependencies: [] });
  if (!databaseUrl
    || typeof workOrdersRepository?.findActiveResourceDependencies !== "function"
    || typeof shiftExecutionReadRepositoryFactory !== "function") {
    return Object.freeze({
      ok: false,
      unavailable: true,
      code: "equipment-impact-owner-unavailable",
      error: "Equipment dependency owners are unavailable",
      dependencies: [],
    });
  }

  let shifts;
  try {
    shifts = shiftExecutionReadRepositoryFactory({ databaseUrl });
    if (typeof shifts?.findActiveResourceDependencies !== "function") throw new Error("Shift Execution resource dependency reader is unavailable");
    const [planning, shiftExecution] = await Promise.all([
      workOrdersRepository.findActiveResourceDependencies(archivedEquipment),
      shifts.findActiveResourceDependencies(archivedEquipment),
    ]);
    const dependencies = [
      ...normalizeExternalDependencies(planning, "planning"),
      ...normalizeExternalDependencies(shiftExecution, "shift-execution"),
    ];
    if (dependencies.length) {
      return Object.freeze({
        ok: false,
        unavailable: false,
        code: "equipment-active-resource-dependency",
        error: "Equipment with an active scheduling or execution dependency cannot be archived",
        dependencies,
      });
    }
    return Object.freeze({ ok: true, dependencies: [] });
  } catch {
    return Object.freeze({
      ok: false,
      unavailable: true,
      code: "equipment-impact-owner-unavailable",
      error: "Equipment dependency owners are unavailable",
      dependencies: [],
    });
  } finally {
    await shifts?.close?.();
  }
}
