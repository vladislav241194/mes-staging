import { buildShiftMasterBoardAssignmentCommand } from "./server_command_contract.js";

function text(value) { return String(value || "").trim(); }
function stableKey(prefix, ...parts) { return [prefix, ...parts.map(text)].join(":"); }

// The board keeps its visual/snapshot contract while the server rollout is
// disabled. This adapter is the only place that translates it into server
// writes, making dual-write temporary and removable without touching UI code.
export function buildShiftMasterBoardAssignmentWrite(row = {}, assignment = {}, serverAssignment = null) {
  const revision = Number(serverAssignment?.revision || 0);
  const idempotencyKey = stableKey(
    serverAssignment?.id ? "shift-update" : "shift-create",
    serverAssignment?.id || row.id || assignment.sourceRowId,
    assignment.updatedAt || assignment.issuedAt || assignment.createdAt,
  );
  const command = buildShiftMasterBoardAssignmentCommand(row, assignment, { idempotencyKey });
  if (!serverAssignment?.id) return { type: "create", idempotencyKey, payload: command };
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Server assignment revision is required for a safe update");
  return { type: "update", assignmentId: serverAssignment.id, idempotencyKey, payload: { ...command, expectedRevision: revision } };
}

export function buildShiftMasterBoardFactWrite(row = {}, fact = {}, serverAssignment = null) {
  const assignmentId = text(serverAssignment?.id);
  if (!assignmentId) throw new Error("Server assignment is required before recording a shift fact");
  const updatedAt = text(fact.updatedAt);
  if (!updatedAt) throw new Error("Fact timestamp is required before recording a shift fact");
  const idempotencyKey = stableKey("shift-fact", assignmentId, updatedAt);
  return {
    type: "fact",
    assignmentId,
    idempotencyKey,
    payload: {
      actualQuantity: Number(fact.actualQuantity || 0), defectQuantity: Number(fact.defectQuantity || 0),
      laborMinutes: Number(fact.laborMinutes || 0), executorCount: Number(fact.executorCount || 0),
      comment: text(fact.comment), deviationComment: text(fact.deviationComment), reportedAt: updatedAt, idempotencyKey,
    },
  };
}

export function buildShiftMasterBoardCarryoverWrite(carryover = {}, serverAssignment = null) {
  const sourceAssignmentId = text(serverAssignment?.id);
  if (!sourceAssignmentId) throw new Error("Server assignment is required before creating a carryover");
  const sourceSlotId = text(carryover.sourceSlotId);
  const workOrderId = text(serverAssignment?.workOrderId || carryover.routeId || carryover.planningOrderId);
  const operationId = text(serverAssignment?.operationId || carryover.stepId);
  const workCenterId = text(carryover.workCenterId || serverAssignment?.workCenterId);
  const dateKey = text(carryover.dateKey);
  if (!sourceSlotId || !workOrderId || !operationId || !workCenterId || !dateKey) throw new Error("Carryover is missing a stable server reference");
  const idempotencyKey = stableKey("shift-carryover", sourceAssignmentId, dateKey, carryover.remainingQuantity, carryover.createdAt);
  return {
    type: "carryover",
    idempotencyKey,
    payload: {
      sourceAssignmentId, sourceSlotId, workOrderId, operationId, workCenterId, dateKey,
      remainingQuantity: Number(carryover.remainingQuantity || 0), reason: text(carryover.reason), idempotencyKey,
    },
  };
}

export function buildShiftMasterBoardCarryoverCancelWrite(carryover = {}, { reason = "" } = {}) {
  // A provisional browser id has never been accepted by PostgreSQL.  Only a
  // dispatch projection is allowed to mark the id as canonical and cancel it.
  const carryoverId = text(carryover.serverId);
  if (!carryoverId) throw new Error("Server carryover id is required before cancelling a carryover");
  const idempotencyKey = stableKey("shift-carryover-cancel", carryoverId);
  return {
    type: "carryover-cancel",
    carryoverId,
    idempotencyKey,
    payload: { idempotencyKey, reason: text(reason) },
  };
}

export async function executeShiftMasterBoardServerWrite(commands, write) {
  if (!commands || !write) throw new Error("Shift execution server command adapter is unavailable");
  if (write.type === "create") return commands.createAssignment(write.payload);
  if (write.type === "update") return commands.updateAssignment(write.assignmentId, write.payload);
  if (write.type === "fact") return commands.recordFact(write.assignmentId, { ...write.payload, idempotencyKey: write.idempotencyKey });
  if (write.type === "carryover") return commands.createCarryover({ ...write.payload, idempotencyKey: write.idempotencyKey });
  if (write.type === "carryover-cancel") return commands.cancelCarryover(write.carryoverId, { ...write.payload, idempotencyKey: write.idempotencyKey });
  throw new Error(`Unsupported shift execution write: ${write.type}`);
}
