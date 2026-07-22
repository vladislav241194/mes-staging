export const MES_REACT_COMPLETION_STATES = Object.freeze({
  COMPLETE: "react-complete",
  PARTIAL: "react-partial",
  LEGACY: "legacy",
} as const);

export const MES_REACT_VERIFICATION_STATES = Object.freeze({
  ACCEPTED: "accepted",
  DEFERRED: "deferred",
} as const);

export type MesReactCompletionState = typeof MES_REACT_COMPLETION_STATES[keyof typeof MES_REACT_COMPLETION_STATES];
export type MesReactVerificationState = typeof MES_REACT_VERIFICATION_STATES[keyof typeof MES_REACT_VERIFICATION_STATES];

export type MesReactCompletionSurfaceId =
  | "authPicker"
  | "boards"
  | "componentTypes"
  | "contourAdmin"
  | "dispatch"
  | "employeeDesktop"
  | "gantt"
  | "marking"
  | "nomenclature"
  | "nomenclatureTypes"
  | "operations"
  | "planningWorkbench"
  | "roles"
  | "shiftMasterBoard"
  | "shiftWorkOrders"
  | "specifications2"
  | "statuses"
  | "structureEmployees"
  | "structureEquipment"
  | "structureMigrationDiagnostics"
  | "structureOrgUnits"
  | "structurePositions"
  | "structureResponsibilityPolicies"
  | "structureWorkCenters"
  | "timesheet"
  | "weeklyProductionControl";

export type MesReactCompletionModuleId =
  | "nomenclature"
  | "specifications2"
  | "planning"
  | "gantt"
  | "weeklyProductionControl"
  | "shiftMasterBoard"
  | "shiftWorkOrders"
  | "dispatch"
  | "productionStructureMatrix"
  | "timesheet"
  | "roles"
  | "contourAdmin"
  | "directories"
  | "authPrototype"
  | "authSessionPrototype"
  | "marking";

type MesReactCompletionEntryId = MesReactCompletionSurfaceId | MesReactCompletionModuleId;

export interface MesReactCompletionDefinition<TId extends MesReactCompletionEntryId = MesReactCompletionEntryId> {
  readonly id: TId;
  readonly status: MesReactCompletionState;
  readonly verification: MesReactVerificationState;
  readonly surfaceIds: readonly MesReactCompletionSurfaceId[];
}

interface MesReactCompletionEntryInput<TId extends MesReactCompletionEntryId> {
  id: TId;
  status: MesReactCompletionState;
  verification?: MesReactVerificationState;
  surfaceIds?: readonly MesReactCompletionSurfaceId[];
}

const { COMPLETE, PARTIAL, LEGACY } = MES_REACT_COMPLETION_STATES;
const { ACCEPTED, DEFERRED } = MES_REACT_VERIFICATION_STATES;
const COMPLETION_STATE_VALUES: readonly unknown[] = [COMPLETE, PARTIAL, LEGACY];
const VERIFICATION_STATE_VALUES: readonly unknown[] = [ACCEPTED, DEFERRED];

function defineCompletionEntry<const TId extends MesReactCompletionEntryId>({
  id,
  status,
  verification = DEFERRED,
  surfaceIds = [],
}: MesReactCompletionEntryInput<TId>): Readonly<MesReactCompletionDefinition<TId>> {
  const normalizedId = String(id || "").trim() as TId;
  if (!normalizedId) throw new Error("React completion entry id is required");
  if (!COMPLETION_STATE_VALUES.includes(status)) {
    throw new Error(`Unsupported React completion state for ${normalizedId}: ${status}`);
  }
  if (!VERIFICATION_STATE_VALUES.includes(verification)) {
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
export const MES_REACT_COMPLETION_SURFACE_REGISTRY: readonly MesReactCompletionDefinition<MesReactCompletionSurfaceId>[] = Object.freeze([
  defineCompletionEntry({ id: "authPicker", status: COMPLETE }),
  defineCompletionEntry({ id: "boards", status: COMPLETE }),
  defineCompletionEntry({ id: "componentTypes", status: COMPLETE }),
  defineCompletionEntry({ id: "contourAdmin", status: COMPLETE }),
  defineCompletionEntry({ id: "dispatch", status: COMPLETE }),
  defineCompletionEntry({ id: "employeeDesktop", status: COMPLETE }),
  defineCompletionEntry({ id: "gantt", status: PARTIAL }),
  defineCompletionEntry({ id: "marking", status: PARTIAL }),
  defineCompletionEntry({ id: "nomenclature", status: COMPLETE }),
  defineCompletionEntry({ id: "nomenclatureTypes", status: COMPLETE }),
  defineCompletionEntry({ id: "operations", status: COMPLETE }),
  defineCompletionEntry({ id: "planningWorkbench", status: PARTIAL }),
  defineCompletionEntry({ id: "roles", status: PARTIAL }),
  defineCompletionEntry({ id: "shiftMasterBoard", status: COMPLETE }),
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
  defineCompletionEntry({ id: "timesheet", status: COMPLETE }),
  defineCompletionEntry({ id: "weeklyProductionControl", status: COMPLETE, verification: ACCEPTED }),
]);

export const MES_REACT_COMPLETION_MODULE_REGISTRY: readonly MesReactCompletionDefinition<MesReactCompletionModuleId>[] = Object.freeze([
  defineCompletionEntry({ id: "nomenclature", status: COMPLETE, surfaceIds: ["nomenclature", "boards"] }),
  defineCompletionEntry({ id: "specifications2", status: PARTIAL, surfaceIds: ["specifications2"] }),
  defineCompletionEntry({ id: "planning", status: PARTIAL, surfaceIds: ["planningWorkbench"] }),
  defineCompletionEntry({ id: "gantt", status: PARTIAL, surfaceIds: ["gantt"] }),
  defineCompletionEntry({ id: "weeklyProductionControl", status: COMPLETE, verification: ACCEPTED, surfaceIds: ["weeklyProductionControl"] }),
  defineCompletionEntry({ id: "shiftMasterBoard", status: COMPLETE, surfaceIds: ["shiftMasterBoard"] }),
  defineCompletionEntry({ id: "shiftWorkOrders", status: COMPLETE, surfaceIds: ["shiftWorkOrders"] }),
  defineCompletionEntry({ id: "dispatch", status: COMPLETE, surfaceIds: ["dispatch"] }),
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
  defineCompletionEntry({ id: "timesheet", status: COMPLETE, surfaceIds: ["timesheet"] }),
  defineCompletionEntry({ id: "roles", status: PARTIAL, surfaceIds: ["roles"] }),
  defineCompletionEntry({ id: "contourAdmin", status: COMPLETE, surfaceIds: ["contourAdmin"] }),
  defineCompletionEntry({
    id: "directories",
    status: COMPLETE,
    surfaceIds: ["componentTypes", "operations", "nomenclatureTypes", "statuses"],
  }),
  defineCompletionEntry({ id: "authPrototype", status: COMPLETE, surfaceIds: ["authPicker"] }),
  defineCompletionEntry({ id: "authSessionPrototype", status: COMPLETE, surfaceIds: ["employeeDesktop"] }),
  defineCompletionEntry({ id: "marking", status: PARTIAL, surfaceIds: ["marking"] }),
]);

export type MesReactCompletionSurfaceDefinition = MesReactCompletionDefinition<MesReactCompletionSurfaceId>;
export type MesReactCompletionModuleDefinition = MesReactCompletionDefinition<MesReactCompletionModuleId>;

const SURFACE_BY_ID = new Map<string, MesReactCompletionSurfaceDefinition>(MES_REACT_COMPLETION_SURFACE_REGISTRY.map((entry) => [entry.id, entry] as const));
const MODULE_BY_ID = new Map<string, MesReactCompletionModuleDefinition>(MES_REACT_COMPLETION_MODULE_REGISTRY.map((entry) => [entry.id, entry] as const));

export function getMesReactCompletionSurfaceDefinition(surfaceId: unknown = ""): MesReactCompletionSurfaceDefinition | null {
  return SURFACE_BY_ID.get(String(surfaceId || "").trim()) || null;
}

export function getMesReactCompletionModuleDefinition(moduleId: unknown = ""): MesReactCompletionModuleDefinition | null {
  return MODULE_BY_ID.get(String(moduleId || "").trim()) || null;
}

export function getMesReactCompletionModuleStatus(moduleId: unknown = ""): MesReactCompletionState | null {
  return getMesReactCompletionModuleDefinition(moduleId)?.status || null;
}

export function isMesReactCompleteModule(moduleId: unknown = ""): boolean {
  return getMesReactCompletionModuleStatus(moduleId) === COMPLETE;
}
