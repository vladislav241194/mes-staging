function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positive(value, label, { allowZero = true } = {}) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) throw new Error(`Shift export: ${label} must be ${allowZero ? "non-negative" : "positive"}`);
  return number;
}

function text(value, label, { required = false } = {}) {
  const result = String(value || "").trim();
  if (required && !result) throw new Error(`Shift export: ${label} is required`);
  return result;
}

function iso(value, label, { required = false } = {}) {
  const raw = text(value, label, { required });
  if (!raw) return null;
  if (Number.isNaN(Date.parse(raw))) throw new Error(`Shift export: ${label} must be an ISO timestamp`);
  return new Date(raw).toISOString();
}

function dateKey(value, label) {
  const raw = text(value, label, { required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Shift export: ${label} must be YYYY-MM-DD`);
  return raw;
}

function unique(rows, label) {
  const seen = new Set();
  rows.forEach((row) => {
    if (seen.has(row.id)) throw new Error(`Shift export: duplicate ${label} id ${row.id}`);
    seen.add(row.id);
  });
}

// Converts the current sharedUi maps into relational rows.  The source row id
// remains the aggregate id: it makes a later dual-read parity check exact and
// avoids inventing a new identifier while the legacy board is still live.
export function exportShiftExecutionSnapshot(snapshot = {}) {
  const sharedUi = record(snapshot.sharedUi);
  const assignmentsById = record(sharedUi.shiftMasterBoardAssignments);
  const factsById = record(sharedUi.shiftMasterBoardFacts);
  const carryoversById = record(sharedUi.shiftMasterBoardCarryovers);
  const shiftAssignments = [];
  const shiftAssignmentExecutors = [];
  const assignmentIdByRow = new Map();

  Object.entries(assignmentsById).forEach(([rowId, raw]) => {
    const assignment = record(raw);
    const id = text(assignment.id || `shift-assignment:${rowId}`, "assignment.id", { required: true });
    const sourceRowId = text(assignment.sourceRowId || rowId, "assignment.sourceRowId", { required: true });
    const row = {
      id,
      source_row_id: sourceRowId,
      source_slot_id: text(assignment.slotId, "assignment.slotId", { required: true }),
      work_order_id: text(assignment.routeId, "assignment.routeId", { required: true }),
      work_order_operation_id: text(assignment.stepId, "assignment.stepId", { required: true }),
      work_center_id: text(assignment.workCenterId, "assignment.workCenterId", { required: true }),
      resource_id: text(assignment.resourceId, "assignment.resourceId"),
      master_id: text(assignment.masterId, "assignment.masterId"),
      planned_quantity: positive(assignment.plannedQuantity, "assignment.plannedQuantity"),
      assigned_quantity: positive(assignment.assignedQuantity, "assignment.assignedQuantity"),
      unit: text(assignment.unit || "шт.", "assignment.unit", { required: true }),
      status: text(assignment.status || "draft", "assignment.status", { required: true }),
      issued_at: iso(assignment.issuedAt, "assignment.issuedAt"),
      created_at: iso(assignment.createdAt || assignment.updatedAt, "assignment.createdAt", { required: true }),
      updated_at: iso(assignment.updatedAt || assignment.createdAt, "assignment.updatedAt", { required: true }),
      source_payload: assignment,
    };
    assignmentIdByRow.set(sourceRowId, id);
    shiftAssignments.push(row);
    (Array.isArray(assignment.executors) ? assignment.executors : []).forEach((executor) => {
      const employeeId = text(record(executor).employeeId, "executor.employeeId", { required: true });
      shiftAssignmentExecutors.push({
        shift_assignment_id: id,
        employee_id: employeeId,
        quantity: positive(record(executor).quantity, "executor.quantity"),
        note: text(record(executor).note, "executor.note"),
      });
    });
  });
  unique(shiftAssignments, "assignment");

  const shiftFacts = Object.entries(factsById).map(([rowId, raw]) => {
    const fact = record(raw);
    const assignmentId = assignmentIdByRow.get(rowId);
    if (!assignmentId) throw new Error(`Shift export: fact ${rowId} has no assignment`);
    return {
      id: text(fact.id || `shift-fact:${rowId}`, "fact.id", { required: true }),
      shift_assignment_id: assignmentId,
      actual_quantity: positive(fact.actualQuantity, "fact.actualQuantity"),
      defect_quantity: positive(fact.defectQuantity, "fact.defectQuantity"),
      labor_minutes: positive(fact.laborMinutes, "fact.laborMinutes"),
      executor_count: Math.max(0, Math.round(positive(fact.executorCount, "fact.executorCount"))),
      comment: text(fact.comment, "fact.comment"),
      deviation_comment: text(fact.deviationComment, "fact.deviationComment"),
      reported_at: iso(fact.updatedAt, "fact.updatedAt", { required: true }),
      source_payload: fact,
    };
  });
  unique(shiftFacts, "fact");

  const shiftCarryovers = Object.entries(carryoversById).map(([id, raw]) => {
    const carryover = record(raw);
    const assignmentId = assignmentIdByRow.get(text(carryover.sourceRowId, "carryover.sourceRowId", { required: true }));
    if (!assignmentId) throw new Error(`Shift export: carryover ${id} has no assignment`);
    return {
      id: text(carryover.id || id, "carryover.id", { required: true }),
      source_assignment_id: assignmentId,
      source_slot_id: text(carryover.sourceSlotId, "carryover.sourceSlotId", { required: true }),
      work_order_id: text(carryover.routeId, "carryover.routeId", { required: true }),
      work_order_operation_id: text(carryover.stepId, "carryover.stepId", { required: true }),
      work_center_id: text(carryover.workCenterId, "carryover.workCenterId", { required: true }),
      date_key: dateKey(carryover.dateKey, "carryover.dateKey"),
      remaining_quantity: positive(carryover.remainingQuantity, "carryover.remainingQuantity", { allowZero: false }),
      reason: text(carryover.reason, "carryover.reason"),
      created_at: iso(carryover.createdAt, "carryover.createdAt", { required: true }),
      source_payload: carryover,
    };
  });
  unique(shiftCarryovers, "carryover");
  return { schemaVersion: "008_shift_execution_read_model", shiftAssignments, shiftAssignmentExecutors, shiftFacts, shiftCarryovers };
}
