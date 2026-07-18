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
  weeklyWorkCenterId = "D3",
  weeklyResourceId = "D3-L1",
  weeklyUnit = "шт.",
  sourceWorkCenterId = "D3",
  sourceResourceId = "D3-L1",
  sourceUnit = "",
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
    weekly_slot_id: slotId,
    weekly_route_id: orderId,
    weekly_route_step_id: operationId,
    weekly_planned_start: new Date(start),
    weekly_planned_end: new Date(end),
    weekly_quantity: 5,
    weekly_unit: weeklyUnit,
    weekly_work_center_id: weeklyWorkCenterId,
    weekly_resource_id: weeklyResourceId,
    weekly_status: "planned",
    weekly_locked: false,
    weekly_source_work_center_id: sourceWorkCenterId,
    weekly_source_resource_id: sourceResourceId,
    weekly_source_unit: sourceUnit,
    weekly_source_comment: "Монтаж SMT линии 1",
    weekly_source_operation_name: operationName,
    weekly_source_specification_id: "spec-alpha",
    weekly_source_project_id: "project-alpha",
    weekly_source_planning_order_id: orderId,
    weekly_source_batch_id: "batch-alpha",
    weekly_source_route_id: orderId,
  };
}

const calls = [];
const rows = [
  makeRow({
    operationId: "step-alpha-early", operationCode: "OP-A1", operationName: "Ранняя операция", sequenceNo: 1,
    start: "2026-07-19T21:30:00.000Z", end: "2026-07-19T22:30:00.000Z",
    // An SMT operation can be routed to a concrete line while its persisted
    // slot still keeps the parent operation work centre. The direct contract
    // must retain both values for the client presentation resolver.
    weeklyWorkCenterId: "D3_L1", weeklyResourceId: "D3-L1", weeklyUnit: "плата",
    sourceWorkCenterId: "D3", sourceResourceId: "D3-L1",
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

const weekly = await repository.listWeeklyPeriodRows({
  fromAt: "2026-07-19T21:00:00.000Z",
  toAt: "2026-07-26T21:00:00.000Z",
});
assert(calls.length === 2, "compact Weekly period read must execute one additional bounded query");
assert(calls[1].query.includes("tstzrange(ps.planned_start, ps.planned_end, '[)')"), "compact Weekly query must retain half-open overlap semantics");
assert(!calls[1].query.includes("wo.*"), "compact Weekly query must not select the full work-order aggregate");
assert(calls[1].query.includes("ps.metadata ->> 'workCenterId'"), "compact Weekly query must retain the scalar source work centre for the existing SMT resolver");
assert(calls[1].query.includes("ps.metadata ->> 'resourceId'"), "compact Weekly query must retain the scalar source resource for the existing SMT resolver");
assert(!/ps\.metadata\s+AS|op\.metadata\s+AS|wo\.metadata\s+AS/.test(calls[1].query), "compact Weekly query must never transfer route, operation or slot metadata documents");
assert(weekly.storageBackend === "postgresql" && weekly.revision === 7, "compact Weekly read must retain PostgreSQL metadata");
assert(weekly.rows.map((row) => row.id).join(",") === "slot-step-alpha-early,slot-step-alpha-early-split,slot-step-alpha-late", "compact Weekly read must retain every matching split slot in SQL order");
assert(weekly.rows[0]?.resourceId === "D3-L1" && weekly.rows[0]?.workCenterId === "D3_L1", "compact Weekly rows must retain resolved persisted work-centre placement");
assert(weekly.rows[0]?.sourceWorkCenterId === "D3" && weekly.rows[0]?.sourceResourceId === "D3-L1" && weekly.rows[0]?.unit === "плата", "compact Weekly rows must retain scalar source placement and unit for legacy-equivalent presentation");
assert(!JSON.stringify(weekly).includes("must not reach a weekly projection"), "compact Weekly read must not transfer order labour payloads");

let invalidBounds = "";
try {
  await repository.listPeriod({ fromAt: "2026-07-26T21:00:00.000Z", toAt: "2026-07-19T21:00:00.000Z" });
} catch (error) {
  invalidBounds = String(error?.message || "");
}
assert(/valid ordered ISO instants/.test(invalidBounds), "repository must reject reversed direct period bounds");
assert(calls.length === 2, "invalid direct period bounds must not execute a database query");

console.log("Planning PostgreSQL period repository QA: OK");
