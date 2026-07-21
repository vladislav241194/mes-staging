import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function order({ id, number, updatedAt, aggregateRevision, metadata = {} }) {
  return {
    id,
    number,
    name: `Изделие ${number}`,
    designation: `АБВГ.${number}`,
    quantity: 12,
    unit: "шт.",
    lifecycle_status: "released",
    planning_status: "scheduled",
    source_revision: 3,
    aggregate_revision: aggregateRevision,
    source_kind: "specifications2",
    updated_at: new Date(updatedAt),
    metadata: {
      id,
      name: `Маршрут ${number}`,
      planningQuantity: 12,
      planningLaborByStepId: { [`${id}-step-1`]: { source: "labor-sentinel" } },
      documentRevisionSnapshot: { specificationRevision: 3, routeRevision: 4, product: { name: `Продукт ${number}` } },
      workOrderSnapshot: { id: number, quantity: 12 },
      ...metadata,
    },
  };
}

function operation({ id, workOrderId, sequenceNo, metadata = {} }) {
  return {
    id,
    work_order_id: workOrderId,
    operation_id: `OP-${id}`,
    name: `Операция ${id}`,
    work_center_id: "D3",
    next_work_center_id: "D4",
    sequence_no: sequenceNo,
    quantity_multiplier: 1,
    execution_context: { calculationType: "productivity", unitsPerHour: 42, resourceId: "D3-L1" },
    labor: { setupMin: 5, unitsPerHour: 42 },
    metadata: { id, routeId: workOrderId, stepOrder: sequenceNo, operationSentinel: `operation-${id}`, ...metadata },
  };
}

function slot({ id, operationId, plannedStart, plannedEnd, locked = false, metadata = {} }) {
  return {
    id,
    work_order_operation_id: operationId,
    planned_start: new Date(plannedStart),
    planned_end: new Date(plannedEnd),
    status: "planned",
    quantity: 12,
    is_locked: locked,
    metadata: { id, routeStepId: operationId, slotSentinel: `slot-${id}`, ...metadata },
  };
}

const orderRows = [
  order({ id: "route-new", number: "WO-NEW", updatedAt: "2026-07-18T10:00:00.000Z", aggregateRevision: 9 }),
  order({ id: "route-old", number: "WO-OLD", updatedAt: "2026-07-18T09:00:00.000Z", aggregateRevision: 7 }),
];
const operationRows = [
  operation({ id: "route-new-step-1", workOrderId: "route-new", sequenceNo: 1 }),
  operation({ id: "route-new-step-2", workOrderId: "route-new", sequenceNo: 2 }),
  operation({ id: "route-old-step-1", workOrderId: "route-old", sequenceNo: 1 }),
];
const slotRows = [
  // A split operation is retained in persistence. The legacy full-runtime
  // contract exposes one slot, so the earliest one must be chosen stably.
  slot({ id: "slot-new-early", operationId: "route-new-step-1", plannedStart: "2026-07-19T08:00:00.000Z", plannedEnd: "2026-07-19T09:00:00.000Z", metadata: { routeId: "route-new" } }),
  slot({ id: "slot-new-late", operationId: "route-new-step-1", plannedStart: "2026-07-19T10:00:00.000Z", plannedEnd: "2026-07-19T11:00:00.000Z", locked: true, metadata: { routeId: "route-new" } }),
  slot({ id: "slot-old", operationId: "route-old-step-1", plannedStart: "2026-07-20T08:00:00.000Z", plannedEnd: "2026-07-20T09:00:00.000Z", metadata: { routeId: "route-old" } }),
];

const calls = [];
const transactions = [];
const sql = (strings, ...values) => {
  const query = strings.join("?");
  calls.push({ query, values });
  if (/FROM work_orders AS wo/.test(query) && !/JOIN work_order_operations/.test(query)) return Promise.resolve(orderRows);
  if (/FROM work_order_operations AS op/.test(query)) return Promise.resolve(operationRows);
  if (/FROM planning_slots AS ps/.test(query)) return Promise.resolve(slotRows);
  throw new Error(`Unexpected SQL: ${query}`);
};
sql.begin = async (options, callback) => {
  transactions.push(options);
  return callback(sql);
};

const repository = createPostgresWorkOrdersRepository({ sql });
const result = await repository.listRuntimeProjection();

assert(transactions.length === 1 && transactions[0] === "isolation level repeatable read read only", "runtime projection must use one repeatable read-only PostgreSQL snapshot");
assert(calls.length === 3, "runtime projection must use three fixed PostgreSQL reads instead of list + 3N aggregate reads");
assert(/FROM work_orders AS wo/.test(calls[0].query), "first runtime query must read work orders");
assert(/FROM work_order_operations AS op/.test(calls[1].query), "second runtime query must read operations");
assert(/FROM planning_slots AS ps/.test(calls[2].query), "third runtime query must read slots");
assert(calls.every((call) => call.values.length === 0), "runtime projection must not interpolate caller input into its bounded reads");

assert(result.storageBackend === "postgresql" && result.revision === 9 && result.updatedAt === "2026-07-18T10:00:00.000Z", "runtime projection must retain aggregate revision metadata");
assert(result.items.map((item) => item.id).join(",") === "route-new,route-old", "runtime projection must retain work-order list order");
assert(result.items[0]?.operations?.map((item) => item.id).join(",") === "route-new-step-1,route-new-step-2", "runtime projection must retain operation sequence order");
assert(result.items[0]?.operations?.[0]?.slot?.id === "slot-new-early" && result.items[0]?.operations?.[0]?.slot?.isLocked === false, "runtime projection must choose the earliest split slot deterministically");
assert(result.items[0]?.operations?.[1]?.slot === null, "runtime projection must retain unscheduled operations");
assert(result.items[0]?.operationCount === 2 && result.items[0]?.scheduledOperationCount === 2, "runtime projection must preserve persisted operation and slot counts");
assert(result.items[0]?.metadata?.planningLaborByStepId?.["route-new-step-1"]?.source === "labor-sentinel", "runtime projection must retain route labour metadata");
assert(result.items[0]?.operations?.[0]?.metadata?.operationSentinel === "operation-route-new-step-1", "runtime projection must retain operation metadata");
assert(result.items[0]?.operations?.[0]?.slot?.metadata?.slotSentinel === "slot-slot-new-early", "runtime projection must retain slot metadata");

// The endpoint still passes detail aggregates through the established runtime
// builder. Compare the new bounded aggregate with one legacy get() result so
// a mapper/default/metadata drift cannot silently alter that API contract.
const legacyCalls = [];
const legacyOrder = {
  ...orderRows[0],
  operation_count: 2,
  scheduled_operation_count: 2,
};
const legacySql = (strings, ...values) => {
  const query = strings.join("?");
  legacyCalls.push({ query, values });
  if (/FROM work_orders wo\s+WHERE wo\.id = \? OR wo\.number = \?/.test(query)) {
    assert(/ORDER BY CASE WHEN wo\.id = \? THEN 0 ELSE 1 END, wo\.id\s+LIMIT 1/.test(query),
      "legacy-compatible detail must retain exact-id-first canonical selection");
    return Promise.resolve([legacyOrder]);
  }
  if (/SELECT \* FROM work_order_operations WHERE/.test(query)) return Promise.resolve(operationRows.filter((row) => row.work_order_id === "route-new"));
  if (/FROM planning_slots ps/.test(query)) return Promise.resolve(slotRows.filter((row) => row.work_order_operation_id.startsWith("route-new")));
  throw new Error(`Unexpected legacy SQL: ${query}`);
};
const legacy = await createPostgresWorkOrdersRepository({ sql: legacySql }).get("route-new");
assert(legacyCalls.length === 3, "legacy detail fixture must execute its established three aggregate reads");
assert(JSON.stringify(result.items[0]) === JSON.stringify(legacy.item), "bounded runtime aggregate must preserve the existing detail mapper contract exactly");

console.log("Planning PostgreSQL runtime projection repository QA: OK");
