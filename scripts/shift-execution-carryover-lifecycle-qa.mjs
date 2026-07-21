import { createShiftExecutionCommandRepository } from "./domain-shift-execution-repository.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const state = {
  assignments: new Map([["assignment-1", {
    id: "assignment-1",
    source_slot_id: "slot-1",
    work_order_id: "WO-1",
    work_order_operation_id: "OP-1",
    work_center_id: "D5",
  }]]),
  carryovers: new Map(),
  carryoverRequests: new Map(),
  cancellationRequests: new Map(),
};
const calls = [];
const now = () => new Date("2026-07-18T12:00:00.000Z");

function activeCarryover(sourceAssignmentId, dateKey) {
  return [...state.carryovers.values()].find((item) => (
    item.source_assignment_id === sourceAssignmentId
      && item.date_key === dateKey
      && !item.canceled_at
  )) || null;
}

const sql = (strings, ...values) => {
  const query = strings.join("?").replace(/\s+/g, " ").trim();
  calls.push({ query, values });
  if (/SELECT request_fingerprint, shift_carryover_id FROM shift_execution_carryover_requests/.test(query)) {
    const item = state.carryoverRequests.get(values[0]);
    return Promise.resolve(item ? [{ ...item }] : []);
  }
  if (/SELECT id, source_slot_id, work_order_id, work_order_operation_id, work_center_id FROM shift_assignments WHERE id = \? FOR SHARE/.test(query)) {
    const item = state.assignments.get(values[0]);
    return Promise.resolve(item ? [{ ...item }] : []);
  }
  if (/INSERT INTO shift_carryovers/.test(query)) {
    const [id, sourceAssignmentId, sourceSlotId, workOrderId, operationId, dateKey, remainingQuantity, reason, workCenterId, sourcePayload] = values;
    if (activeCarryover(sourceAssignmentId, dateKey)) return Promise.resolve([]);
    const item = {
      id,
      source_assignment_id: sourceAssignmentId,
      source_slot_id: sourceSlotId,
      work_order_id: workOrderId,
      work_order_operation_id: operationId,
      date_key: dateKey,
      remaining_quantity: remainingQuantity,
      reason,
      work_center_id: workCenterId,
      source_payload: sourcePayload,
      created_at: now(),
      canceled_at: null,
      canceled_by: "",
      cancellation_reason: "",
    };
    state.carryovers.set(id, item);
    return Promise.resolve([{ ...item }]);
  }
  if (/SELECT \* FROM shift_carryovers WHERE source_assignment_id = \? AND date_key = \? AND canceled_at IS NULL LIMIT 1/.test(query)) {
    const item = activeCarryover(values[0], values[1]);
    return Promise.resolve(item ? [{ ...item }] : []);
  }
  if (/INSERT INTO shift_execution_carryover_requests/.test(query)) {
    const [idempotencyKey, requestFingerprint, shiftCarryoverId, actorId] = values;
    state.carryoverRequests.set(idempotencyKey, { request_fingerprint: requestFingerprint, shift_carryover_id: shiftCarryoverId, actor_id: actorId });
    return Promise.resolve([]);
  }
  if (/SELECT request_fingerprint, shift_carryover_id FROM shift_execution_carryover_cancellation_requests/.test(query)) {
    const item = state.cancellationRequests.get(values[0]);
    return Promise.resolve(item ? [{ ...item }] : []);
  }
  if (/SELECT \* FROM shift_carryovers WHERE id = \? FOR UPDATE/.test(query)) {
    const item = state.carryovers.get(values[0]);
    return Promise.resolve(item ? [{ ...item }] : []);
  }
  if (/UPDATE shift_carryovers SET canceled_at = now\(\), canceled_by = \?, cancellation_reason = \? WHERE id = \? AND canceled_at IS NULL RETURNING \*/.test(query)) {
    const [actorId, reason, id] = values;
    const item = state.carryovers.get(id);
    if (!item || item.canceled_at) return Promise.resolve([]);
    item.canceled_at = now();
    item.canceled_by = actorId;
    item.cancellation_reason = reason;
    return Promise.resolve([{ ...item }]);
  }
  if (/INSERT INTO shift_execution_carryover_cancellation_requests/.test(query)) {
    const [idempotencyKey, requestFingerprint, shiftCarryoverId, actorId] = values;
    state.cancellationRequests.set(idempotencyKey, { request_fingerprint: requestFingerprint, shift_carryover_id: shiftCarryoverId, actor_id: actorId });
    return Promise.resolve([]);
  }
  if (/SELECT \* FROM shift_carryovers WHERE id = \? LIMIT 1/.test(query)) {
    const item = state.carryovers.get(values[0]);
    return Promise.resolve(item ? [{ ...item }] : []);
  }
  throw new Error(`Unexpected SQL: ${query}`);
};
sql.begin = async (callback) => callback(sql);
sql.json = (value) => value;

const repository = createShiftExecutionCommandRepository({ sql });
const createInput = {
  sourceAssignmentId: "assignment-1",
  sourceSlotId: "slot-1",
  workOrderId: "WO-1",
  operationId: "OP-1",
  workCenterId: "D5",
  authorizedWorkCenterId: "D5",
  dateKey: "2026-07-19",
  remainingQuantity: 4,
  reason: "Остаток после смены",
  actorId: "employee:master",
};

const created = await repository.createCarryover({ ...createInput, idempotencyKey: "carryover-create-1" });
assert(created.created && created.item?.id, "first carryover command must create one active obligation");
const carryoverId = created.item.id;
assert(activeCarryover("assignment-1", "2026-07-19")?.id === carryoverId, "created carryover must become the active assignment/date obligation");

const semanticRetry = await repository.createCarryover({ ...createInput, idempotencyKey: "carryover-create-semantic-retry" });
assert(!semanticRetry.created && semanticRetry.item?.id === carryoverId, "same active carryover with a fresh retry key must return its canonical row without duplication");
assert([...state.carryovers.values()].filter((item) => !item.canceled_at).length === 1, "semantic retries must keep one active carryover");

const conflict = await repository.createCarryover({ ...createInput, idempotencyKey: "carryover-create-conflict", remainingQuantity: 3 });
assert(conflict.conflict && conflict.item?.id === carryoverId, "a different carryover must be rejected until the active one is explicitly canceled");

const canceled = await repository.cancelCarryover({
  idempotencyKey: "carryover-cancel-1",
  carryoverId,
  reason: "Факт скорректирован: операция закрыта",
  actorId: "employee:master",
  authorizedWorkCenterId: "D5",
});
assert(canceled.created && canceled.item?.canceled_at && canceled.item?.canceled_by === "employee:master", "cancellation must preserve a durable employee-attributed audit state");
assert(/скорректирован/.test(canceled.item?.cancellation_reason || ""), "cancellation must retain its reason for audit");
assert(!activeCarryover("assignment-1", "2026-07-19"), "canceled carryovers must no longer be active dispatch obligations");

const cancellationReplay = await repository.cancelCarryover({
  idempotencyKey: "carryover-cancel-1",
  carryoverId,
  reason: "Факт скорректирован: операция закрыта",
  actorId: "employee:master",
  authorizedWorkCenterId: "D5",
});
assert(!cancellationReplay.created && cancellationReplay.item?.canceled_at, "cancellation retry must replay the same audited result without another write");

let conflictingCancellationKey = "";
try {
  await repository.cancelCarryover({ idempotencyKey: "carryover-cancel-1", carryoverId, reason: "Другая причина", actorId: "employee:master", authorizedWorkCenterId: "D5" });
} catch (error) {
  conflictingCancellationKey = error.message;
}
assert(/already used/.test(conflictingCancellationKey), "a cancellation idempotency key must never be repurposed for another audit reason");

const replacement = await repository.createCarryover({ ...createInput, idempotencyKey: "carryover-create-replacement", remainingQuantity: 2, reason: "Скорректированный остаток" });
assert(replacement.created && replacement.item?.id !== carryoverId, "a corrected carryover may be created only after cancellation, preserving both history rows");
assert([...state.carryovers.values()].filter((item) => !item.canceled_at).length === 1, "replacement must restore exactly one active carryover for the assignment/date");
assert(calls.some((call) => /ON CONFLICT \(source_assignment_id, date_key\) WHERE canceled_at IS NULL DO NOTHING/.test(call.query)), "repository must delegate concurrent single-active enforcement to the partial unique index");
assert(calls.some((call) => /shift_execution_carryover_cancellation_requests/.test(call.query)), "cancellation must persist an idempotency/audit ledger entry");

console.log("Shift execution carryover lifecycle QA: OK");
