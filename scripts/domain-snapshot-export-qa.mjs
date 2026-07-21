import { exportPlanningSnapshot, compareDomainExports } from "./domain-snapshot-export.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const snapshot = {
  version: 12,
  updatedAt: "2026-07-17T10:00:00.000Z",
  values: {
    "mes-planning-prototype-state-v2": JSON.stringify({
      routes: [{
        id: "route-1", name: "Плата", designation: "АБВГ.001", planningQuantity: 20,
        lifecycleStatus: "released", planningStatus: "scheduled", revision: 2,
        planningStartDate: "2026-07-18",
        sourceSpecifications2EntryId: "spec-1", unit: "шт.",
        workOrderSnapshot: { id: "WO-001", quantity: 20 },
      }],
      routeSteps: [{ id: "step-1", routeId: "route-1", stepOrder: 1, operationId: "OP-1", operationName: "Монтаж", workCenterId: "SMT", quantityMultiplier: 4, calculationType: "normative", unitsPerHour: 60, setupMin: 5, boardsPerPanel: 2, secondsPerPanel: 30, resourceId: "line-1", labor: { mode: "unit", minutesPerUnit: 2 } }],
      slots: [{ id: "slot-1", routeStepId: "step-1", plannedStart: "2026-07-18T08:00:00Z", plannedEnd: "2026-07-18T09:00:00Z", status: "planned", quantity: 15, locked: true }],
      workCenters: [{ id: "SMT", workSchedule: "2/2", calendarShiftWindow: "08:00-20:00", isActive: true }],
    }),
  },
};

const first = exportPlanningSnapshot(snapshot, { exportedAt: "2026-07-17T10:01:00.000Z" });
const second = exportPlanningSnapshot(snapshot, { exportedAt: "2026-07-17T10:02:00.000Z" });
assert(first.workOrders.length === 1 && first.workOrderOperations.length === 1 && first.planningSlots.length === 1, "Export must preserve one complete order chain");
assert(first.workCenterCalendars.length === 1 && first.workCenterCalendars[0].timezone === "Europe/Moscow", "Export must preserve a server-ready work-center calendar");
assert(first.productionResources.length > 0 && first.productionResources.every((row) => row.id && row.work_center_id), "Export must include the canonical production-resource projection");
assert(first.workOrders[0].source_kind === "specifications2", "Export must preserve the Specifications 2.0 source boundary");
assert(first.workOrders[0].metadata?.sourceSpecifications2EntryId === "spec-1", "Export must retain route rendering metadata for the server projection");
assert(first.workOrders[0].planning_start_date === "2026-07-18", "Export must carry the exact planning start-date column");
assert(first.workOrderOperations[0].work_order_id === first.workOrders[0].id, "Operation must point to exported work order");
assert(first.workOrderOperations[0].quantity_multiplier === 4, "Export must preserve the source quantity multiplier for each operation");
assert(first.workOrderOperations[0].execution_context.calculationType === "normative" && first.workOrderOperations[0].execution_context.unitsPerHour === 60, "Export must preserve portable execution context");
assert(first.workOrderOperations[0].metadata?.operationName === "Монтаж", "Export must retain operation rendering metadata for the server projection");
assert(first.planningSlots[0].work_order_operation_id === first.workOrderOperations[0].id, "Slot must point to exported operation");
assert(first.planningSlots[0].quantity === 15 && first.planningSlots[0].is_locked === true, "Export must preserve slot quantity and its manual lock");
assert(first.planningSlots[0].metadata?.locked === true, "Export must retain slot rendering metadata for the server projection");
assert(compareDomainExports(first, second).equal, "Export comparison must ignore metadata timestamp and preserve domain rows");

const duplicateSequence = structuredClone(snapshot);
duplicateSequence.values["mes-planning-prototype-state-v2"] = JSON.stringify({
  ...JSON.parse(duplicateSequence.values["mes-planning-prototype-state-v2"]),
  routeSteps: [
    { id: "step-1", routeId: "route-1", stepOrder: 1, operationId: "OP-1", operationName: "Монтаж", workCenterId: "SMT" },
    { id: "step-2", routeId: "route-1", stepOrder: 1, operationId: "OP-2", operationName: "Контроль", workCenterId: "QA" },
  ],
  slots: [],
});
const normalized = exportPlanningSnapshot(duplicateSequence);
assert(normalized.workOrderOperations.map((row) => row.sequence_no).join(",") === "1,2", "Export must make equal legacy stepOrder values unique per work order");

const impossibleStartDate = structuredClone(snapshot);
const impossibleStartDatePlanning = JSON.parse(impossibleStartDate.values["mes-planning-prototype-state-v2"]);
impossibleStartDatePlanning.routes[0].planningStartDate = "2026-02-31";
impossibleStartDate.values["mes-planning-prototype-state-v2"] = JSON.stringify(impossibleStartDatePlanning);
assert(exportPlanningSnapshot(impossibleStartDate).workOrders[0].planning_start_date === null,
  "Export must not normalise an impossible compatibility date into a different PostgreSQL day");

const invalid = structuredClone(snapshot);
invalid.values["mes-planning-prototype-state-v2"] = JSON.stringify({
  routes: [{ id: "route-1", name: "Плата", planningQuantity: 1 }],
  routeSteps: [], slots: [{ id: "slot-x", routeStepId: "missing" }],
});
let invalidError = null;
try {
  exportPlanningSnapshot(invalid);
} catch (error) {
  invalidError = error;
}
assert(/unknown operation/.test(String(invalidError?.message || "")), "Export must reject orphaned planning slots");

console.log("Domain snapshot export QA: OK");
