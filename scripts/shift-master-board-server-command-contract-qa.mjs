import { buildShiftMasterBoardAssignmentCommand } from "../src/modules/shift_master_board/server_command_contract.js";

function assert(value, message) { if (!value) throw new Error(message); }

const command = buildShiftMasterBoardAssignmentCommand({
  id: "shift-row-1", slotId: "slot-1", route: { id: "WO-1" }, step: { id: "OP-1" },
  workCenterId: "D5", plannedQuantity: 20, unit: "шт.", dateKey: "2026-07-17",
}, {
  masterId: "master-1", resourceId: "D5-LINE-1", issued: true,
  executors: [{ employeeId: "employee-2", quantity: 8 }, { employeeId: "employee-1", quantity: 12, note: "Наставник" }],
}, { idempotencyKey: "shift-row-1:issued" });

assert(command.workOrderId === "WO-1" && command.operationId === "OP-1", "board route and step must map to server work-order identifiers");
assert(command.sourceRowId === "shift-row-1" && command.sourceSlotId === "slot-1", "command must retain stable board and schedule references");
assert(command.assignedQuantity === 20 && command.executors[0].employeeId === "employee-1", "executor quantities must be preserved in stable order");
let invalid = "";
try {
  buildShiftMasterBoardAssignmentCommand({ id: "row", slotId: "slot", route: { id: "WO" }, step: { id: "OP" }, workCenterId: "D5", plannedQuantity: 1 }, { executors: [{ employeeId: "employee", quantity: 2 }] }, { idempotencyKey: "key" });
} catch (error) { invalid = error.message; }
assert(/must not exceed/.test(invalid), "bridge must reject an over-assignment before sending a server command");
console.log("Shift master board server command contract QA: OK");
