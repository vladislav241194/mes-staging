import { exportShiftExecutionSnapshot } from "./domain-shift-execution-export.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const assignment = {
  slotId: "slot-1", sourceRowId: "row-1", routeId: "route-1", stepId: "step-1", workCenterId: "D5", masterId: "master-1",
  plannedQuantity: 10, assignedQuantity: 10, unit: "шт.", status: "issued", issuedAt: "2026-07-17T08:00:00.000Z", createdAt: "2026-07-17T07:00:00.000Z", updatedAt: "2026-07-17T08:00:00.000Z",
  executors: [{ employeeId: "worker-1", quantity: 10, note: "Первая смена" }],
};
const exported = exportShiftExecutionSnapshot({ sharedUi: {
  shiftMasterBoardAssignments: { "row-1": assignment },
  shiftMasterBoardFacts: { "row-1": { actualQuantity: 9, defectQuantity: 1, laborMinutes: 120, executorCount: 1, updatedAt: "2026-07-17T16:00:00.000Z" } },
  shiftMasterBoardCarryovers: { "carryover-1": { id: "carryover-1", sourceRowId: "row-1", sourceSlotId: "slot-1", routeId: "route-1", stepId: "step-1", workCenterId: "D5", dateKey: "2026-07-18", remainingQuantity: 2, createdAt: "2026-07-17T16:00:00.000Z" } },
} });
assert(exported.shiftAssignments.length === 1 && exported.shiftAssignmentExecutors.length === 1, "Exporter must preserve assignment and executor");
assert(exported.shiftFacts[0]?.shift_assignment_id === exported.shiftAssignments[0]?.id, "Fact must reference its assignment");
assert(exported.shiftCarryovers[0]?.source_assignment_id === exported.shiftAssignments[0]?.id, "Carryover must reference its assignment");
let orphanError = "";
try { exportShiftExecutionSnapshot({ sharedUi: { shiftMasterBoardFacts: { orphan: { updatedAt: "2026-07-17T16:00:00.000Z" } } } }); } catch (error) { orphanError = String(error.message); }
assert(/has no assignment/.test(orphanError), "Exporter must reject orphan facts");
console.log("Shift execution export QA: OK");
