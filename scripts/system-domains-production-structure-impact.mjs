import { createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";

const EMPLOYMENT_ASSIGNMENT_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!item) return false;
  const validTo = String(item.validTo || "").trim();
  // Employment assignments do not have an isActive field in the System
  // Domains contract. Their end date is inclusive: an assignment ending
  // today still owns the Position through the current business day.
  return !EMPLOYMENT_ASSIGNMENT_DATE.test(validTo) || validTo >= today;
}

function positionDependencyConflicts(current, positionIds, today) {
  const ids = new Set(positionIds);
  if (!ids.size) return [];
  const activeEmployees = new Set(rows(current, "employees").filter(activeEntity).map((item) => String(item.id || "")));
  return rows(current, "employmentAssignments")
    .filter((item) => activeEmploymentAssignment(item, today))
    .filter((item) => ids.has(String(item.positionId || "")))
    .map((item) => ({
      owner: "system-domains",
      kind: "active-employment-assignment",
      id: String(item.id || ""),
      positionId: String(item.positionId || ""),
      employeeId: String(item.employeeId || ""),
      employeeActive: activeEmployees.has(String(item.employeeId || "")),
    }));
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
  const today = now().toISOString().slice(0, 10);
  const archivedPositions = archivedEntityIds(current, candidate, "positions");
  const positionDependencies = positionDependencyConflicts(current, archivedPositions, today);
  if (positionDependencies.length) {
    return Object.freeze({
      ok: false,
      unavailable: false,
      code: "position-active-assignment",
      error: "A position with an active employment assignment cannot be archived",
      dependencies: positionDependencies,
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
