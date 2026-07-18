import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeRow({
  orderId = "route-alpha",
  number = "WO-ALPHA",
  operationId,
  operationCode,
  operationName,
  start,
  end,
  sequenceNo,
  slotId = `slot-${operationId}`,
} = {}) {
  return {
    id: orderId,
    number,
    name: "Альфа",
    designation: "АБВГ.001",
    quantity: 5,
    unit: "шт.",
    lifecycle_status: "released",
    planning_status: "scheduled",
    source_revision: 3,
    aggregate_revision: 7,
    source_kind: "specifications2",
    updated_at: new Date("2026-07-18T08:00:00.000Z"),
    metadata: {
      id: orderId,
      name: "Маршрутная карта · Альфа",
      planningQuantity: 5,
      planningLaborByStepId: { [operationId]: { large: "must not reach a weekly projection" } },
      documentRevisionSnapshot: { specificationRevision: 3, routeRevision: 3, product: { name: "Альфа" } },
      workOrderSnapshot: { id: number, quantity: 5 },
    },
    period_operation_id: operationId,
    period_operation_code: operationCode,
    period_operation_name: operationName,
    period_operation_work_center_id: "D3",
    period_operation_next_work_center_id: "D4",
    period_operation_sequence_no: sequenceNo,
    period_operation_quantity_multiplier: 1,
    period_operation_execution_context: { calculationType: "productivity", unitsPerHour: 42, resourceId: "D3-L1" },
    period_operation_labor: { calculationType: "productivity" },
    period_operation_metadata: { id: operationId, routeId: orderId, stepOrder: sequenceNo },
    period_slot_id: slotId,
    period_slot_planned_start: new Date(start),
    period_slot_planned_end: new Date(end),
    period_slot_status: "planned",
    period_slot_quantity: 5,
    period_slot_is_locked: false,
    period_slot_metadata: { id: slotId, routeId: orderId, routeStepId: operationId },
  };
}

const calls = [];
const rows = [
  makeRow({
    operationId: "step-alpha-early", operationCode: "OP-A1", operationName: "Ранняя операция", sequenceNo: 1,
    start: "2026-07-19T21:30:00.000Z", end: "2026-07-19T22:30:00.000Z",
  }),
  makeRow({
    operationId: "step-alpha-early", operationCode: "OP-A1", operationName: "Ранняя операция", sequenceNo: 1,
    slotId: "slot-step-alpha-early-split", start: "2026-07-20T00:00:00.000Z", end: "2026-07-20T01:00:00.000Z",
  }),
  makeRow({
    operationId: "step-alpha-late", operationCode: "OP-A2", operationName: "Поздняя операция", sequenceNo: 2,
    start: "2026-07-20T08:00:00.000Z", end: "2026-07-20T09:00:00.000Z",
  }),
];

const sql = (strings, ...values) => {
  calls.push({ query: strings.join("?"), values });
  return Promise.resolve(rows);
};

const repository = createPostgresWorkOrdersRepository({ sql });
const result = await repository.listPeriod({
  fromAt: "2026-07-19T21:00:00.000Z",
  toAt: "2026-07-26T21:00:00.000Z",
});

assert(calls.length === 1, "native PostgreSQL period read must execute one bounded query");
assert(calls[0].query.includes("tstzrange(ps.planned_start, ps.planned_end, '[)')"), "period query must use half-open overlap semantics");
assert(calls[0].values.length === 2, "period query must bind exactly the from/to instants");
assert(calls[0].values[0]?.toISOString?.() === "2026-07-19T21:00:00.000Z", "period query must preserve an exact Moscow-week lower boundary");
assert(calls[0].values[1]?.toISOString?.() === "2026-07-26T21:00:00.000Z", "period query must preserve an exact Moscow-week upper boundary");
assert(result.storageBackend === "postgresql" && result.revision === 7, "period result must retain PostgreSQL metadata");
assert(result.items.length === 1 && result.items[0]?.id === "route-alpha", "period rows must group matching operations by order");
assert(result.items[0]?.operations?.map((operation) => operation.id).join(",") === "step-alpha-early,step-alpha-early,step-alpha-late", "period result must retain all selected operations in SQL order");
assert(result.items[0]?.operations?.[0]?.slot?.plannedStart === "2026-07-19T21:30:00.000Z", "period result must serialize slot instants canonically");
assert(result.items[0]?.operations?.map((operation) => operation.slot?.id).join(",") === "slot-step-alpha-early,slot-step-alpha-early-split,slot-step-alpha-late", "period result must retain split-operation slots rather than silently collapsing them");
assert(!Object.hasOwn(result.items[0]?.metadata || {}, "planningLaborByStepId"), "period result must not transfer order labour maps");

let invalidBounds = "";
try {
  await repository.listPeriod({ fromAt: "2026-07-26T21:00:00.000Z", toAt: "2026-07-19T21:00:00.000Z" });
} catch (error) {
  invalidBounds = String(error?.message || "");
}
assert(/valid ordered ISO instants/.test(invalidBounds), "repository must reject reversed direct period bounds");
assert(calls.length === 1, "invalid direct period bounds must not execute a database query");

console.log("Planning PostgreSQL period repository QA: OK");
