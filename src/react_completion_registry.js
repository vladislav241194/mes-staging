export const MES_REACT_COMPLETION_STATES = Object.freeze({
  COMPLETE: "react-complete",
  PARTIAL: "react-partial",
  LEGACY: "legacy",
});

export const MES_REACT_VERIFICATION_STATES = Object.freeze({
  ACCEPTED: "accepted",
  DEFERRED: "deferred",
});

const { COMPLETE, PARTIAL, LEGACY } = MES_REACT_COMPLETION_STATES;
const { ACCEPTED, DEFERRED } = MES_REACT_VERIFICATION_STATES;

function defineCompletionEntry({ id, status, verification = DEFERRED, surfaceIds = [] }) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("React completion entry id is required");
  if (![COMPLETE, PARTIAL, LEGACY].includes(status)) {
    throw new Error(`Unsupported React completion state for ${normalizedId}: ${status}`);
  }
  if (![ACCEPTED, DEFERRED].includes(verification)) {
    throw new Error(`Unsupported React verification state for ${normalizedId}: ${verification}`);
  }
  return Object.freeze({
    id: normalizedId,
    status,
    verification,
    surfaceIds: Object.freeze([...surfaceIds]),
  });
}

// This registry is deliberately explicit. `react-complete` means that the
// normal-path UI implementation is React + TypeScript and has no legacy
// renderer/action fallback. Transitional data owners/models stay explicit in
// the cutover ledger. Pilot/global acceptance is tracked separately through
// `verification`, so deferred QA does not block accelerated implementation.
// Contract QA binds both declarations to the ledger and runtime policy.
export const MES_REACT_COMPLETION_SURFACE_REGISTRY = Object.freeze([
  defineCompletionEntry({ id: "authPicker", status: COMPLETE }),
  defineCompletionEntry({ id: "boards", status: COMPLETE }),
  defineCompletionEntry({ id: "componentTypes", status: COMPLETE }),
  defineCompletionEntry({ id: "contourAdmin", status: PARTIAL }),
  defineCompletionEntry({ id: "employeeDesktop", status: PARTIAL }),
  defineCompletionEntry({ id: "gantt", status: PARTIAL }),
  defineCompletionEntry({ id: "marking", status: PARTIAL }),
  defineCompletionEntry({ id: "nomenclature", status: COMPLETE }),
  defineCompletionEntry({ id: "nomenclatureTypes", status: COMPLETE }),
  defineCompletionEntry({ id: "operations", status: COMPLETE }),
  defineCompletionEntry({ id: "planningWorkbench", status: PARTIAL }),
  defineCompletionEntry({ id: "roles", status: PARTIAL }),
  defineCompletionEntry({ id: "shiftMasterBoard", status: PARTIAL }),
  defineCompletionEntry({ id: "shiftWorkOrders", status: COMPLETE }),
  defineCompletionEntry({ id: "specifications2", status: PARTIAL }),
  defineCompletionEntry({ id: "statuses", status: COMPLETE }),
  defineCompletionEntry({ id: "structureEmployees", status: COMPLETE }),
  defineCompletionEntry({ id: "structureEquipment", status: COMPLETE }),
  defineCompletionEntry({ id: "structureMigrationDiagnostics", status: COMPLETE, verification: ACCEPTED }),
  defineCompletionEntry({ id: "structureOrgUnits", status: COMPLETE }),
  defineCompletionEntry({ id: "structurePositions", status: COMPLETE }),
  defineCompletionEntry({ id: "structureResponsibilityPolicies", status: COMPLETE }),
  defineCompletionEntry({ id: "structureWorkCenters", status: COMPLETE }),
  defineCompletionEntry({ id: "timesheet", status: PARTIAL }),
  defineCompletionEntry({ id: "weeklyProductionControl", status: COMPLETE, verification: ACCEPTED }),
]);

export const MES_REACT_COMPLETION_MODULE_REGISTRY = Object.freeze([
  defineCompletionEntry({ id: "nomenclature", status: COMPLETE, surfaceIds: ["nomenclature", "boards"] }),
  defineCompletionEntry({ id: "specifications2", status: PARTIAL, surfaceIds: ["specifications2"] }),
  defineCompletionEntry({ id: "planning", status: PARTIAL, surfaceIds: ["planningWorkbench"] }),
  defineCompletionEntry({ id: "gantt", status: PARTIAL, surfaceIds: ["gantt"] }),
  defineCompletionEntry({ id: "weeklyProductionControl", status: COMPLETE, verification: ACCEPTED, surfaceIds: ["weeklyProductionControl"] }),
  defineCompletionEntry({ id: "shiftMasterBoard", status: PARTIAL, surfaceIds: ["shiftMasterBoard"] }),
  defineCompletionEntry({ id: "shiftWorkOrders", status: COMPLETE, surfaceIds: ["shiftWorkOrders"] }),
  defineCompletionEntry({ id: "dispatch", status: LEGACY }),
  defineCompletionEntry({
    id: "productionStructureMatrix",
    status: COMPLETE,
    surfaceIds: [
      "structureEmployees",
      "structurePositions",
      "structureOrgUnits",
      "structureWorkCenters",
      "structureEquipment",
      "structureResponsibilityPolicies",
      "structureMigrationDiagnostics",
    ],
  }),
  defineCompletionEntry({ id: "timesheet", status: PARTIAL, surfaceIds: ["timesheet"] }),
  defineCompletionEntry({ id: "roles", status: PARTIAL, surfaceIds: ["roles"] }),
  defineCompletionEntry({ id: "contourAdmin", status: PARTIAL, surfaceIds: ["contourAdmin"] }),
  defineCompletionEntry({
    id: "directories",
    status: COMPLETE,
    surfaceIds: ["componentTypes", "operations", "nomenclatureTypes", "statuses"],
  }),
  defineCompletionEntry({ id: "authPrototype", status: COMPLETE, surfaceIds: ["authPicker"] }),
  defineCompletionEntry({ id: "authSessionPrototype", status: PARTIAL, surfaceIds: ["employeeDesktop"] }),
  defineCompletionEntry({ id: "marking", status: PARTIAL, surfaceIds: ["marking"] }),
]);

const SURFACE_BY_ID = new Map(MES_REACT_COMPLETION_SURFACE_REGISTRY.map((entry) => [entry.id, entry]));
const MODULE_BY_ID = new Map(MES_REACT_COMPLETION_MODULE_REGISTRY.map((entry) => [entry.id, entry]));

export function getMesReactCompletionSurfaceDefinition(surfaceId = "") {
  return SURFACE_BY_ID.get(String(surfaceId || "").trim()) || null;
}

export function getMesReactCompletionModuleDefinition(moduleId = "") {
  return MODULE_BY_ID.get(String(moduleId || "").trim()) || null;
}

export function getMesReactCompletionModuleStatus(moduleId = "") {
  return getMesReactCompletionModuleDefinition(moduleId)?.status || null;
}

export function isMesReactCompleteModule(moduleId = "") {
  return getMesReactCompletionModuleStatus(moduleId) === COMPLETE;
}
