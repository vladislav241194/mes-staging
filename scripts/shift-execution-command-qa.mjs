import { buildShiftAssignmentCommand, buildShiftAssignmentUpdateCommand, buildShiftFactCommand, buildShiftCarryoverCommand, buildShiftCarryoverCancelCommand } from "../src/domain/shift_execution_assignment.js";

function assert(value, message) { if (!value) throw new Error(message); }

const input = {
  idempotencyKey: "shift-command-1", workOrderId: "WO-1", operationId: "OP-1",
  sourceRowId: "row-1", sourceSlotId: "slot-1", workCenterId: "D5",
  plannedQuantity: 20, assignedQuantity: 12, unit: "шт.", masterId: "master-1",
  executors: [{ employeeId: "employee-2", quantity: 5, note: "" }, { employeeId: "employee-1", quantity: 7, note: "Стажёр" }],
};
const first = buildShiftAssignmentCommand(input);
const retry = buildShiftAssignmentCommand(input);
assert(first.assignment.id === retry.assignment.id, "same idempotency key and payload must keep a stable assignment identity");
assert(first.assignment.status === "draft" && first.assignment.assignedQuantity === 12, "command must preserve assignment quantity and start in draft state");
const issued = buildShiftAssignmentCommand({ ...input, idempotencyKey: "shift-command-issued", issued: true, issuedAt: "2026-07-17T08:00:00.000Z" });
assert(issued.assignment.status === "issued" && issued.assignment.issuedAt === "2026-07-17T08:00:00.000Z", "command must preserve an issued assignment state");
assert(first.assignment.executors.map((item) => item.employeeId).join(",") === "employee-1,employee-2", "command must preserve the complete executor allocation in a stable order");
let invalid = "";
try { buildShiftAssignmentCommand({ ...input, assignedQuantity: 21 }); } catch (error) { invalid = error.message; }
assert(/must not exceed/.test(invalid), "command must reject an assignment above its planned quantity");
let missing = "";
try { buildShiftAssignmentCommand({ ...input, sourceSlotId: "" }); } catch (error) { missing = error.message; }
assert(/sourceSlotId/.test(missing), "command must require a stable source slot reference");
let duplicateExecutor = "";
try { buildShiftAssignmentCommand({ ...input, executors: [{ employeeId: "employee-1", quantity: 1 }, { employeeId: "employee-1", quantity: 1 }] }); } catch (error) { duplicateExecutor = error.message; }
assert(/duplicate employee/.test(duplicateExecutor), "command must reject duplicate executor allocations");
const update = buildShiftAssignmentUpdateCommand({ ...input, assignmentId: "shift-1", expectedRevision: 3 });
assert(update.assignmentId === "shift-1" && update.expectedRevision === 3, "update command must carry optimistic revision metadata");
let badRevision = "";
try { buildShiftAssignmentUpdateCommand({ ...input, assignmentId: "shift-1", expectedRevision: 0 }); } catch (error) { badRevision = error.message; }
assert(/positive integer/.test(badRevision), "update command must reject an unsafe revision");
const fact = buildShiftFactCommand({ idempotencyKey: "fact-1", assignmentId: "shift-1", actualQuantity: 12, defectQuantity: 1, laborMinutes: 45, executorCount: 2, reportedAt: "2026-07-17T12:00:00.000Z" });
assert(fact.fact.assignmentId === "shift-1" && fact.fact.defectQuantity === 1, "fact command must preserve execution evidence");
let badFact = "";
try { buildShiftFactCommand({ idempotencyKey: "fact-2", assignmentId: "shift-1", actualQuantity: 1, defectQuantity: 2, laborMinutes: 0, executorCount: 0, reportedAt: "2026-07-17T12:00:00.000Z" }); } catch (error) { badFact = error.message; }
assert(/must not exceed/.test(badFact), "fact command must reject an impossible defect quantity");
const carryover = buildShiftCarryoverCommand({ idempotencyKey: "carryover-1", sourceAssignmentId: "shift-1", sourceSlotId: "slot-1", workOrderId: "WO-1", operationId: "OP-1", workCenterId: "D5", dateKey: "2026-07-18", remainingQuantity: 8, reason: "Не завершено до конца смены" });
assert(carryover.carryover.sourceAssignmentId === "shift-1" && carryover.carryover.remainingQuantity === 8, "carryover command must preserve the remaining work reference");
let badCarryover = "";
try { buildShiftCarryoverCommand({ idempotencyKey: "carryover-2", sourceAssignmentId: "shift-1", sourceSlotId: "slot-1", workOrderId: "WO-1", operationId: "OP-1", workCenterId: "D5", dateKey: "2026-07-18", remainingQuantity: 0 }); } catch (error) { badCarryover = error.message; }
assert(/must be positive/.test(badCarryover), "carryover command must reject an empty carryover");
const canceledCarryover = buildShiftCarryoverCancelCommand({ idempotencyKey: "carryover-cancel-1", carryoverId: "shift-carryover-1", reason: "Факт скорректирован" });
assert(canceledCarryover.carryoverId === "shift-carryover-1" && canceledCarryover.cancellationReason === "Факт скорректирован" && canceledCarryover.requestFingerprint, "carryover cancellation must preserve its audited target and reason");
let badCancel = "";
try { buildShiftCarryoverCancelCommand({ idempotencyKey: "carryover-cancel-2" }); } catch (error) { badCancel = error.message; }
assert(/carryoverId is required/.test(badCancel), "carryover cancellation must reject a missing target");
console.log("Shift execution command QA: OK");
