import { projectShiftExecutionServerProjection } from "../src/modules/shift_master_board/server_projection_adapter.js";

function assert(value, message) { if (!value) throw new Error(message); }

const projection = projectShiftExecutionServerProjection([{
  id: "assignment-1", sourceRowId: "row-1", sourceSlotId: "slot-1", workOrderId: "WO-1", operationId: "OP-1", workCenterId: "D5",
  plannedQuantity: "10", assignedQuantity: "8", unit: "шт.", status: "issued", revision: "2", issuedAt: "2026-07-17T08:00:00.000Z",
  sourcePayload: { routeId: "route-1", planningOrderId: "order-1", stepId: "step-1" }, executors: [{ employeeId: "worker-1", quantity: 8 }],
  facts: [{ id: "fact-1", actualQuantity: "7", defectQuantity: "1", laborMinutes: "35", executorCount: "1", reportedAt: "2026-07-17T12:00:00.000Z" }],
  carryovers: [{ id: "carry-1", sourceSlotId: "slot-1", workOrderId: "WO-1", operationId: "OP-1", workCenterId: "D5", dateKey: "2026-07-18", remainingQuantity: "2", reason: "Не завершено" }],
}]);
assert(projection.assignments["row-1"].issued === true && projection.assignments["row-1"].revision === 2, "server assignment must preserve issued state and revision");
assert(projection.facts["row-1"].actualQuantity === 7 && projection.facts["row-1"].defectQuantity === 1, "latest fact must map to the legacy board row");
assert(projection.carryovers["carry-1"].remainingQuantity === 2 && projection.carryovers["carry-1"].sourceRowId === "row-1", "carryover must retain its server relation");
assert(Object.keys(projectShiftExecutionServerProjection(null).assignments).length === 0, "invalid server response must not leak into the board state");
console.log("Shift master board server projection QA: OK");
