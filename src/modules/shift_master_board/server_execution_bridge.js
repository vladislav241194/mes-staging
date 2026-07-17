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
  return {
    type: "fact",
    assignmentId,
    idempotencyKey: stableKey("shift-fact", assignmentId, updatedAt),
    payload: {
      actualQuantity: Number(fact.actualQuantity || 0), defectQuantity: Number(fact.defectQuantity || 0),
      laborMinutes: Number(fact.laborMinutes || 0), executorCount: Number(fact.executorCount || 0),
      comment: text(fact.comment), deviationComment: text(fact.deviationComment), reportedAt: updatedAt,
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
  return {
    type: "carryover",
    idempotencyKey: stableKey("shift-carryover", sourceAssignmentId, dateKey, carryover.remainingQuantity, carryover.createdAt),
    payload: {
      sourceAssignmentId, sourceSlotId, workOrderId, operationId, workCenterId, dateKey,
      remainingQuantity: Number(carryover.remainingQuantity || 0), reason: text(carryover.reason),
    },
  };
}

export async function executeShiftMasterBoardServerWrite(commands, write) {
  if (!commands || !write) throw new Error("Shift execution server command adapter is unavailable");
  if (write.type === "create") return commands.createAssignment(write.payload);
  if (write.type === "update") return commands.updateAssignment(write.assignmentId, write.payload);
  if (write.type === "fact") return commands.recordFact(write.assignmentId, { ...write.payload, idempotencyKey: write.idempotencyKey });
  if (write.type === "carryover") return commands.createCarryover({ ...write.payload, idempotencyKey: write.idempotencyKey });
  throw new Error(`Unsupported shift execution write: ${write.type}`);
}
