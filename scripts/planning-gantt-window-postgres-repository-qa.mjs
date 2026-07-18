import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function row({
  routeId = "route-alpha",
  number = "WO-ALPHA",
  stepId,
  operationId,
  operationName,
  sequenceNo,
  slotId,
  start,
  end,
  slotWorkCenterId = "D3_L1",
  resourceId = "D3-L1",
  locked = false,
} = {}) {
  return {
    gantt_route_id: routeId,
    gantt_route_number: number,
    gantt_route_name: "Альфа",
    gantt_route_designation: "АБВГ.001",
    gantt_route_quantity: 12,
    gantt_route_unit: "плата",
    gantt_route_lifecycle_status: "released",
    gantt_route_planning_status: "scheduled",
    gantt_route_aggregate_revision: 9,
    aggregate_revision: 9,
    updated_at: new Date("2026-07-18T08:00:00.000Z"),
    gantt_route_step_id: stepId,
    gantt_operation_id: operationId,
    gantt_operation_name: operationName,
    gantt_operation_work_center_id: "D3",
    gantt_operation_next_work_center_id: "D4",
    gantt_operation_sequence_no: sequenceNo,
    gantt_operation_quantity_multiplier: 1,
    gantt_slot_id: slotId,
    gantt_slot_planned_start: new Date(start),
    gantt_slot_planned_end: new Date(end),
    gantt_slot_status: "planned",
    gantt_slot_quantity: 6,
    gantt_slot_is_locked: locked,
    gantt_slot_work_center_id: slotWorkCenterId,
    gantt_slot_resource_id: resourceId,
  };
}

const rows = [
  row({
    stepId: "step-split", operationId: "OP-SMT", operationName: "SMT монтаж", sequenceNo: 10,
    slotId: "slot-entering", start: "2026-07-16T23:00:00.000Z", end: "2026-07-17T01:00:00.000Z",
  }),
  row({
    stepId: "step-split", operationId: "OP-SMT", operationName: "SMT монтаж", sequenceNo: 10,
    slotId: "slot-middle", start: "2026-07-18T08:00:00.000Z", end: "2026-07-18T09:00:00.000Z",
  }),
  row({
    stepId: "step-aoi", operationId: "OP-AOI", operationName: "Оптическая инспекция", sequenceNo: 20,
    slotId: "slot-leaving", start: "2026-07-23T23:00:00.000Z", end: "2026-07-24T02:00:00.000Z", locked: true,
    slotWorkCenterId: "D4", resourceId: "",
  }),
];
const calls = [];
const sql = (strings, ...values) => {
  calls.push({ query: strings.join("?"), values });
  return Promise.resolve(rows);
};

const repository = createPostgresWorkOrdersRepository({ sql });
const result = await repository.listGanttWindow({
  fromAt: "2026-07-17T00:00:00.000Z",
  toAt: "2026-07-24T00:00:00.000Z",
});

assert(calls.length === 1, "native PostgreSQL Gantt window must issue one bounded query");
assert(calls[0].query.includes("tstzrange(ps.planned_start, ps.planned_end, '[)')"), "Gantt window query must use half-open overlap semantics and the period GiST index");
assert(calls[0].values.length === 2 && calls[0].values[0]?.toISOString?.() === "2026-07-17T00:00:00.000Z" && calls[0].values[1]?.toISOString?.() === "2026-07-24T00:00:00.000Z", "Gantt window query must bind exact visible-window instants");
assert(!/wo\.metadata\s+AS|op\.metadata\s+AS|ps\.metadata\s+AS/.test(calls[0].query), "Gantt window query must not transfer full JSONB documents");
assert(calls[0].query.includes("ps.metadata ->> 'planningWorkCenterId'") && calls[0].query.includes("op.execution_context ->> 'resourceId'"), "Gantt window query must retain compact resolved placement scalars");

assert(result.storageBackend === "postgresql" && result.revision === 9, "Gantt window must retain PostgreSQL metadata");
assert(result.window?.routes?.map((route) => route.id).join(",") === "route-alpha", "Gantt window must include only matching route identities");
assert(result.window?.routeSteps?.map((step) => step.id).join(",") === "step-split,step-aoi", "Gantt window must deduplicate split operation steps");
assert(result.window?.slots?.map((slot) => slot.id).join(",") === "slot-entering,slot-middle,slot-leaving", "Gantt window must retain every physical slot in schedule order");
assert(result.window?.slots?.[0]?.continuesFromPrevious === true && result.window?.slots?.[2]?.continuesAfterWindow === true, "Gantt window must mark bars crossing either visible boundary");
assert(result.window?.boundaryContinuations?.entering?.[0]?.id === "slot-entering" && result.window?.boundaryContinuations?.leaving?.[0]?.id === "slot-leaving", "Gantt window must expose entering and leaving physical continuations");
assert(result.window?.slots?.[0]?.workCenterId === "D3_L1" && result.window?.slots?.[0]?.resourceId === "D3-L1" && result.window?.slots?.[2]?.locked === true, "Gantt window must retain resolved placement and lock state without metadata documents");

let invalid = "";
try {
  await repository.listGanttWindow({ fromAt: "2026-07-24T00:00:00.000Z", toAt: "2026-07-17T00:00:00.000Z" });
} catch (error) {
  invalid = String(error?.message || "");
}
assert(/valid ordered ISO instants/.test(invalid), "Gantt window repository must reject reversed bounds before opening PostgreSQL");
assert(calls.length === 1, "invalid Gantt window bounds must not execute PostgreSQL");

console.log("Planning Gantt window PostgreSQL repository QA: OK");
