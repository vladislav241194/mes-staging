import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function order({ id, number, updatedAt, aggregateRevision }) {
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
    operation_count: id === "route-old" ? 1 : 2,
    scheduled_operation_count: id === "route-old" ? 1 : 2,
    metadata: {
      id,
      name: `Маршрут ${number}`,
      planningQuantity: 12,
      planningLaborByStepId: { [`${id}-step-1`]: { source: "labor-sentinel" } },
      documentRevisionSnapshot: { specificationRevision: 3, routeRevision: 4, product: { name: `Продукт ${number}` } },
      workOrderSnapshot: { id: number, quantity: 12 },
      largeDocumentPayload: "x".repeat(20_000),
    },
  };
}

const orders = [
  order({ id: "route-new", number: "WO-NEW", updatedAt: "2026-07-18T10:00:00.000Z", aggregateRevision: 9 }),
  order({ id: "route-old", number: "WO-OLD", updatedAt: "2026-07-18T09:00:00.000Z", aggregateRevision: 7 }),
];
const compactOrders = orders.map(({ metadata, ...row }) => ({
  ...row,
  metadata: {
    id: metadata.id,
    name: metadata.name,
    planningQuantity: metadata.planningQuantity,
  },
}));
const operations = [{
  id: "route-old-step-1",
  work_order_id: "route-old",
  operation_id: "OP-OLD-1",
  name: "Монтаж",
  work_center_id: "D3",
  next_work_center_id: "D4",
  sequence_no: 1,
  quantity_multiplier: 1,
  execution_context: { calculationType: "productivity", unitsPerHour: 42, resourceId: "D3-L1" },
  labor: { setupMin: 5, unitsPerHour: 42 },
  metadata: { id: "route-old-step-1", routeId: "route-old", routeStepKind: "operation" },
}];
const slots = [{
  id: "slot-old",
  work_order_operation_id: "route-old-step-1",
  planned_start: new Date("2026-07-20T08:00:00.000Z"),
  planned_end: new Date("2026-07-20T09:00:00.000Z"),
  status: "planned",
  quantity: 12,
  is_locked: false,
  metadata: { id: "slot-old", routeId: "route-old", source: "manual" },
}];

const calls = [];
const transactions = [];
const sql = (strings, ...values) => {
  const query = strings.join("?");
  calls.push({ query, values });
  if (/jsonb_object_agg\(list_metadata_field\.name/.test(query)) return Promise.resolve(compactOrders);
  if (/SELECT wo\.\*/.test(query) && /WHERE wo\.id = \?/.test(query)) return Promise.resolve(orders.filter((item) => item.id === values[0]));
  if (/SELECT \* FROM work_order_operations WHERE/.test(query)) return Promise.resolve(operations);
  if (/FROM planning_slots ps/.test(query)) return Promise.resolve(slots);
  throw new Error(`Unexpected SQL: ${query}`);
};
sql.begin = async (options, callback) => {
  transactions.push(options);
  return callback(sql);
};

const repository = createPostgresWorkOrdersRepository({ sql });
const result = await repository.listWorkbenchBootstrap("WO-OLD");

assert(transactions.length === 1 && transactions[0] === "isolation level repeatable read read only", "workbench bootstrap must use one repeatable read-only PostgreSQL snapshot");
assert(calls.length === 4, "workbench bootstrap must use compact list, selected detail, selected operations and selected slots reads");
const compactListQuery = calls.find((call) => /jsonb_object_agg\(list_metadata_field\.name/.test(call.query));
const selectedDetailQuery = calls.find((call) => /SELECT wo\.\*/.test(call.query) && /WHERE wo\.id = \?/.test(call.query));
const operationsQuery = calls.find((call) => /work_order_operations WHERE/.test(call.query));
const slotsQuery = calls.find((call) => /SELECT ps\.\* FROM planning_slots ps/.test(call.query));
assert(compactListQuery && compactListQuery.values.length === 0, "first bootstrap wave must use a compact list without caller interpolation");
assert(/SELECT\s+wo\.id,/.test(compactListQuery.query) && !/SELECT wo\.\*/.test(compactListQuery.query), "compact list must select explicit work-order scalar columns instead of raw work_order rows");
assert(/jsonb_typeof\(COALESCE\(wo\.metadata, '\{\}'::jsonb\)\) = 'object'/.test(compactListQuery.query), "compact list must preserve only the allowed metadata field presence");
assert(/GROUP BY op\.work_order_id/.test(compactListQuery.query) && !/\(SELECT count\(\*\) FROM work_order_operations/.test(compactListQuery.query), "compact list must preaggregate operation counts instead of using per-row correlated counts");
assert(selectedDetailQuery?.values[0] === "route-old", "selected detail must target the canonical route ID after compact list selection");
assert(operationsQuery?.values[0] === "route-old", "selected operation query must target the same canonical order");
assert(slotsQuery?.values[0] === "route-old", "selected slot query must target the same canonical order");
assert(result.items.map((item) => item.id).join(",") === "route-new,route-old", "bootstrap must preserve compact list ordering");
assert(result.items[0]?.metadata?.planningQuantity === 12 && !Object.hasOwn(result.items[0]?.metadata || {}, "planningLaborByStepId"), "compact list must retain whitelisted metadata while excluding selected-detail-only fields");
assert(!Object.hasOwn(result.items[0]?.metadata || {}, "largeDocumentPayload"), "bootstrap list must not transfer full document metadata");
assert(result.activeId === "route-old" && result.item?.id === "route-old", "bootstrap must resolve a work-order number to its canonical route ID");
assert(result.items[1]?.operationCount === 1 && result.item?.scheduledOperationCount === 1, "preaggregated compact counts must preserve list and selected-detail count parity");
assert(result.item?.operations?.[0]?.slot?.id === "slot-old", "bootstrap must join selected operations with their planning slots");
assert(result.item?.metadata?.planningLaborByStepId?.["route-old-step-1"]?.source === "labor-sentinel", "bootstrap detail must retain selected-order labour metadata");

console.log("Planning workbench PostgreSQL bootstrap repository QA: OK");
