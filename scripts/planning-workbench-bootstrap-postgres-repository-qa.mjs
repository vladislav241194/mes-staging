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

const observedMarker = {
  primary_revision: 9,
  primary_updated_at: new Date("2026-07-18T10:00:00.000Z"),
  verified_primary_revision: 9,
  verified_snapshot_fingerprint: "sha256:planning-fixture",
  verified_snapshot_generation: 14,
  verified_contract_version: 5,
  verified_at: new Date("2026-07-18T10:00:00.000Z"),
  snapshot_generation: 14,
  snapshot_observation_state: "observed",
  observed_snapshot_version: 101,
  observed_snapshot_fingerprint: "sha256:planning-fixture",
  observed_snapshot_source: "qa",
  observed_snapshot_at: new Date("2026-07-18T10:00:00.000Z"),
  observed_snapshot_error: "",
};

const calls = [];
const transactions = [];
let markerRow = { ...observedMarker };
let lockError = null;
let markerError = null;
const sql = (strings, ...values) => {
  const query = strings.join("?");
  calls.push({ query, values });
  if (/LOCK TABLE work_orders, work_order_operations, planning_slots IN SHARE MODE NOWAIT/.test(query)) {
    if (lockError) throw lockError;
    return Promise.resolve([]);
  }
  if (/FROM planning_projection_parity_state/.test(query)) {
    if (markerError) throw markerError;
    return Promise.resolve(markerRow ? [{ ...markerRow }] : []);
  }
  if (/jsonb_object_agg\(list_metadata_field\.name/.test(query)) return Promise.resolve(compactOrders);
  if (/SELECT wo\.\*/.test(query) && /WHERE wo\.id = \?/.test(query)) return Promise.resolve(orders.filter((item) => item.id === values[0]));
  if (/SELECT \* FROM work_order_operations WHERE/.test(query)) return Promise.resolve(operations);
  if (/FROM planning_slots ps/.test(query)) return Promise.resolve(slots);
  throw new Error(`Unexpected SQL: ${query}`);
};
sql.begin = async (options, callback) => {
  const handler = typeof options === "function" ? options : callback;
  transactions.push(typeof options === "function" ? null : options);
  return handler(sql);
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

calls.length = 0;
transactions.length = 0;
const observedResult = await repository.readObservedWorkbenchBootstrap("WO-OLD", { contractVersion: 5 });

assert(observedResult.admitted === true, "current observed marker must admit the atomic workbench bootstrap");
assert(transactions.length === 1 && transactions[0] === null, "atomic workbench bootstrap must use one default read-write transaction rather than a read-only snapshot");
assert(calls.length === 6, "atomic workbench bootstrap must lock source tables, read the marker, then issue the four compact bootstrap reads");
assert(/LOCK TABLE work_orders, work_order_operations, planning_slots IN SHARE MODE NOWAIT/.test(calls[0]?.query || ""), "atomic bootstrap must try-lock all trigger-covered source tables before reading the marker");
assert(/FROM planning_projection_parity_state/.test(calls[1]?.query || "") && /FOR SHARE NOWAIT/.test(calls[1]?.query || ""), "atomic bootstrap must try-lock the parity marker inside the same transaction after source tables");
assert(/jsonb_object_agg\(list_metadata_field\.name/.test(calls[2]?.query || ""), "atomic bootstrap must retain the compact list as its first aggregate read");
assert(observedResult.markerState?.snapshotGeneration === 14 && observedResult.markerState?.verifiedContractVersion === 5, "atomic bootstrap must expose the exact observed marker that admitted its result");
assert(observedResult.result.activeId === "route-old" && observedResult.result.item?.operations?.[0]?.slot?.id === "slot-old", "atomic bootstrap must preserve the established selected aggregate shape");
assert(observedResult.result.items[0]?.metadata?.planningQuantity === 12 && !Object.hasOwn(observedResult.result.items[0]?.metadata || {}, "planningLaborByStepId"), "atomic bootstrap must retain the compact-list metadata boundary");

calls.length = 0;
transactions.length = 0;
markerRow = { ...observedMarker, snapshot_observation_state: "pending" };
const pendingResult = await repository.readObservedWorkbenchBootstrap("WO-OLD", { contractVersion: 5 });
assert(pendingResult.admitted === false && pendingResult.reason === "observed-marker-not-current", "pending observation must never admit PostgreSQL bootstrap bytes");
assert(calls.length === 2 && !calls.some((call) => /jsonb_object_agg\(list_metadata_field\.name/.test(call.query)), "untrusted atomic marker must stop before every bootstrap query");

calls.length = 0;
markerRow = { ...observedMarker, verified_contract_version: 4 };
const outdatedContractResult = await repository.readObservedWorkbenchBootstrap("WO-OLD", { contractVersion: 5 });
assert(outdatedContractResult.admitted === false && calls.length === 2, "contract-version mismatch must fall through before reading primary aggregate rows");

calls.length = 0;
markerRow = { ...observedMarker };
markerError = Object.assign(new Error("column does not exist"), { code: "42703" });
const schemaUnavailableResult = await repository.readObservedWorkbenchBootstrap("WO-OLD", { contractVersion: 5 });
markerError = null;
assert(schemaUnavailableResult.admitted === false && schemaUnavailableResult.reason === "atomic-read-unavailable", "missing additive observation columns must fail closed to the generic compatibility guard");

calls.length = 0;
lockError = Object.assign(new Error("lock not available"), { code: "55P03" });
const lockContentionResult = await repository.readObservedWorkbenchBootstrap("WO-OLD", { contractVersion: 5 });
lockError = null;
assert(lockContentionResult.admitted === false && lockContentionResult.reason === "atomic-read-unavailable", "source-lock contention must not return an unverified primary bootstrap");

console.log("Planning workbench PostgreSQL bootstrap repository QA: OK");
