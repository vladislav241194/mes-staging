function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required for a shift assignment command`);
  return normalized;
}

function nonNegative(value, label) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be non-negative`);
  return normalized;
}

function stableExecutors(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item = {}) => ({
      employeeId: String(item.employeeId || "").trim(),
      quantity: nonNegative(item.quantity, "executor quantity"),
      note: String(item.note || "").trim(),
    }))
    .filter((item) => item.employeeId)
    .sort((left, right) => left.employeeId.localeCompare(right.employeeId))
    .map((item) => {
      if (seen.has(item.employeeId)) throw new Error(`executor ${item.employeeId} is duplicated`);
      seen.add(item.employeeId);
      return item;
    });
}

// Converts the board's presentation model to the stable command vocabulary.
// It intentionally does not send the command: callers must first check the
// server capability and keep the snapshot fallback while migration is active.
export function buildShiftMasterBoardAssignmentCommand(row = {}, assignment = {}, { idempotencyKey = "" } = {}) {
  const workOrderId = required(row.route?.id || row.routeId || row.planningOrderId, "workOrderId");
  const operationId = required(row.step?.id || row.stepId, "operationId");
  const sourceRowId = required(row.id || assignment.sourceRowId, "sourceRowId");
  const sourceSlotId = required(row.slotId || row.slot?.id || assignment.slotId, "sourceSlotId");
  const workCenterId = required(row.workCenterId || assignment.workCenterId, "workCenterId");
  const plannedQuantity = nonNegative(row.plannedQuantity ?? assignment.plannedQuantity, "plannedQuantity");
  const executors = stableExecutors(assignment.executors);
  const assignedQuantity = executors.reduce((sum, item) => sum + item.quantity, 0);
  if (assignedQuantity > plannedQuantity) throw new Error("assignedQuantity must not exceed plannedQuantity");
  const unit = String(row.unit || assignment.unit || "шт.").trim() || "шт.";
  const sourcePayload = {
    routeId: String(row.route?.id || row.routeId || ""),
    stepId: String(row.step?.id || row.stepId || ""),
    dateKey: String(row.dateKey || assignment.dateKey || ""),
    note: String(assignment.note || ""),
    issued: assignment.issued === true,
    issuedAt: String(assignment.issuedAt || ""),
  };
  return {
    idempotencyKey: required(idempotencyKey, "idempotencyKey"),
    workOrderId, operationId, sourceRowId, sourceSlotId, workCenterId,
    resourceId: String(assignment.resourceId || row.resourceId || ""),
    masterId: String(assignment.masterId || row.masterProfile?.id || ""),
    plannedQuantity, assignedQuantity, unit, status: assignment.issued === true ? "issued" : "draft",
    issuedAt: String(assignment.issuedAt || ""), executors, sourcePayload,
  };
}
