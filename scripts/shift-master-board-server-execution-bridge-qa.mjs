import {
  buildShiftMasterBoardAssignmentWrite,
  buildShiftMasterBoardFactWrite,
  buildShiftMasterBoardCarryoverWrite,
  buildShiftMasterBoardCarryoverCancelWrite,
  executeShiftMasterBoardServerWrite,
} from "../src/modules/shift_master_board/server_execution_bridge.js";

function assert(value, message) { if (!value) throw new Error(message); }

const row = { id: "row-1", slotId: "slot-1", route: { id: "WO-1" }, step: { id: "OP-1" }, workCenterId: "D5", plannedQuantity: 12, unit: "шт." };
const assignment = { masterId: "master-1", executors: [{ employeeId: "worker-1", quantity: 12 }], updatedAt: "2026-07-17T08:00:00.000Z" };
const create = buildShiftMasterBoardAssignmentWrite(row, assignment);
assert(create.type === "create" && create.payload.sourceSlotId === "slot-1", "new board assignment must map to a server create command");
const update = buildShiftMasterBoardAssignmentWrite(row, assignment, { id: "shift-1", revision: 2 });
assert(update.type === "update" && update.assignmentId === "shift-1" && update.payload.expectedRevision === 2, "existing server assignment must use its optimistic revision");
const fact = buildShiftMasterBoardFactWrite(row, { actualQuantity: 11, defectQuantity: 1, laborMinutes: 60, executorCount: 1, updatedAt: "2026-07-17T16:00:00.000Z" }, { id: "shift-1" });
assert(fact.type === "fact" && fact.payload.actualQuantity === 11, "board fact must map to a server fact command");
const carryover = buildShiftMasterBoardCarryoverWrite({ sourceSlotId: "slot-1", routeId: "WO-1", stepId: "OP-1", workCenterId: "D5", dateKey: "2026-07-18", remainingQuantity: 2, createdAt: "2026-07-17T16:00:00.000Z" }, { id: "shift-1", workOrderId: "WO-1", operationId: "OP-1", workCenterId: "D5" });
assert(carryover.type === "carryover" && carryover.payload.sourceAssignmentId === "shift-1", "carryover must reference the server assignment");
assert(carryover.payload.idempotencyKey === carryover.idempotencyKey, "carryover retry payload must preserve its idempotency key for the local outbox");
const cancelCarryover = buildShiftMasterBoardCarryoverCancelWrite({ id: "carryover-local", serverId: "carryover-server" }, { reason: "Fact corrected" });
assert(cancelCarryover.type === "carryover-cancel" && cancelCarryover.carryoverId === "carryover-server", "carryover cancellation must target only the canonical server id");
let provisionalCancelError = "";
try { buildShiftMasterBoardCarryoverCancelWrite({ id: "carryover-local" }); } catch (error) { provisionalCancelError = error.message; }
assert(/Server carryover id/.test(provisionalCancelError), "a provisional browser carryover must never be cancelled against the server");
const sent = [];
await executeShiftMasterBoardServerWrite({ createAssignment: async (payload) => { sent.push(payload); return { ok: true }; } }, create);
assert(sent.length === 1 && sent[0].workOrderId === "WO-1", "bridge must execute the mapped command exactly once");
const canceled = [];
await executeShiftMasterBoardServerWrite({ cancelCarryover: async (id, payload) => { canceled.push({ id, payload }); return { ok: true }; } }, cancelCarryover);
assert(canceled[0]?.id === "carryover-server" && canceled[0]?.payload?.idempotencyKey === cancelCarryover.idempotencyKey, "bridge must execute a canonical carryover cancellation exactly once");
console.log("Shift master board server execution bridge QA: OK");
