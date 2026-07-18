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
  if (/FROM work_orders wo/.test(query)) return Promise.resolve(orders);
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
assert(calls.length === 3, "workbench bootstrap must use exactly list, selected operations and selected slots reads");
assert(/FROM work_orders wo/.test(calls[0].query) && calls[0].values.length === 0, "first bootstrap query must be the compact list without caller interpolation");
assert(/work_order_operations WHERE/.test(calls[1].query) && calls[1].values[0] === "route-old", "second bootstrap query must target the selected canonical order");
assert(/FROM planning_slots ps/.test(calls[2].query) && calls[2].values[0] === "route-old", "third bootstrap query must target slots of the same selected order");
assert(result.items.map((item) => item.id).join(",") === "route-new,route-old", "bootstrap must preserve compact list ordering");
assert(!Object.hasOwn(result.items[0]?.metadata || {}, "largeDocumentPayload"), "bootstrap list must not transfer full document metadata");
assert(result.activeId === "route-old" && result.item?.id === "route-old", "bootstrap must resolve a work-order number to its canonical route ID");
assert(result.item?.operations?.[0]?.slot?.id === "slot-old", "bootstrap must join selected operations with their planning slots");
assert(result.item?.metadata?.planningLaborByStepId?.["route-old-step-1"]?.source === "labor-sentinel", "bootstrap detail must retain selected-order labour metadata");

console.log("Planning workbench PostgreSQL bootstrap repository QA: OK");
