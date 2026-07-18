import { createPlanningPeriodReadModel } from "../src/modules/domain_api/planning_period_read_model.js";
import {
  buildWeeklyPlanningPeriodRows,
  buildWeeklyPlanningPeriodRowsFromCompact,
  weeklyPlanningRowsEquivalent,
} from "../src/modules/weekly_production_control/planning_period_rows.js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

let clock = 1_000;
let mode = "fresh";
const requests = [];
const projection = {
  routes: [{ id: "route-1", name: "Заказ-наряд", planningQuantity: 12, unit: "шт." }],
  routeSteps: [{ id: "step-1", routeId: "route-1", workCenterId: "D3", operationName: "Монтаж", executionContext: { resourceId: "line-1" } }],
  slots: [{ id: "slot-1", routeId: "route-1", routeStepId: "step-1", plannedStart: "2026-07-20T05:00:00.000Z", plannedEnd: "2026-07-20T06:00:00.000Z", quantity: 12 }],
};
const model = createPlanningPeriodReadModel({
  now: () => clock,
  fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    if (mode === "offline") throw new Error("offline");
    if (mode === "not-modified") return { status: 304, ok: false, headers: { get: () => '"period-1"' } };
    return {
      status: 200,
      ok: true,
      headers: { get: () => '"period-1"' },
      json: async () => ({ ok: true, period: { from: "2026-07-20", to: "2026-07-27" }, projection, fallbackReason: "" }),
    };
  },
});

const first = await model.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(first.ok && first.changed && first.projection?.slots?.[0]?.id === "slot-1", "first planning period response must populate a bounded cache");
assert(requests[0]?.url.endsWith("from=2026-07-20&to=2026-07-27"), "planning period request must use exact calendar bounds");
assert(!model.shouldRefresh({ from: "2026-07-20", to: "2026-07-27" }), "fresh Weekly period cache must not schedule a redundant revalidation");
await model.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(requests.length === 1, "fresh planning period cache must not refetch during TTL");
clock += 31_000;
assert(model.shouldRefresh({ from: "2026-07-20", to: "2026-07-27" }), "expired Weekly period cache must schedule ETag revalidation for an open screen");
mode = "not-modified";
const unchanged = await model.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(unchanged.ok && !unchanged.changed && requests.at(-1)?.options?.headers?.["If-None-Match"] === '"period-1"', "stale planning period must revalidate through ETag");
clock += 31_000;
mode = "offline";
const offline = await model.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(!offline.ok && offline.projection?.slots?.[0]?.id === "slot-1", "failed period refresh must retain its previous projection without replacing local UI state");
assert(!(await model.refresh({ from: "invalid", to: "2026-07-27" })).ok, "invalid period bounds must reject before requesting network data");

const instantRequests = [];
const instantModel = createPlanningPeriodReadModel({
  fetchImpl: async (url) => {
    instantRequests.push(String(url));
    return {
      status: 200,
      ok: true,
      headers: { get: () => '"instant-period-1"' },
      json: async () => ({ ok: true, period: { fromAt: "2026-07-19T21:00:00.000Z", toAt: "2026-07-26T21:00:00.000Z" }, projection }),
    };
  },
});
const instant = await instantModel.refresh({ fromAt: "2026-07-19T21:00:00.000Z", toAt: "2026-07-26T21:00:00.000Z" });
assert(instant.ok && instantRequests[0]?.includes("fromAt=2026-07-19T21%3A00%3A00.000Z"), "Weekly local calendar boundaries must use exact UTC instants rather than UTC dates");
assert(!(await instantModel.refresh({ fromAt: "2026-07-19T21:00:00.000Z", toAt: "invalid" })).ok, "invalid instant period bounds must reject before requesting network data");

let releaseCoalescedRequest;
let coalescedRequests = 0;
const coalescedModel = createPlanningPeriodReadModel({
  fetchImpl: () => {
    coalescedRequests += 1;
    return new Promise((resolve) => { releaseCoalescedRequest = resolve; });
  },
});
const coalescedFirst = coalescedModel.refresh({ from: "2026-07-20", to: "2026-07-27" });
const coalescedSecond = coalescedModel.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(coalescedRequests === 1, "concurrent Weekly hydration must share one bounded HTTP request");
releaseCoalescedRequest({
  status: 200,
  ok: true,
  headers: { get: () => '"coalesced-period-1"' },
  json: async () => ({ ok: true, projection }),
});
const [coalescedLeft, coalescedRight] = await Promise.all([coalescedFirst, coalescedSecond]);
assert(coalescedLeft.ok && coalescedRight.ok && coalescedLeft.projection === coalescedRight.projection, "coalesced Weekly readers must receive one shared projection");

const compactRows = [{
  id: "slot-1",
  routeId: "route-1",
  routeStepId: "step-1",
  plannedStart: "2026-07-20T05:00:00.000Z",
  plannedEnd: "2026-07-20T06:00:00.000Z",
  quantity: 12,
  unit: "шт.",
  workCenterId: "D3",
  resourceId: "line-1",
  status: "planned",
  locked: false,
  sourceWorkCenterId: "D3",
  sourceResourceId: "line-1",
  sourceUnit: "",
  sourceComment: "Монтаж SMT линии 1",
  sourceOperationName: "Монтаж",
  sourceSpecificationId: "spec-1",
  sourceProjectId: "project-1",
  sourcePlanningOrderId: "route-1",
  sourceBatchId: "batch-1",
  sourceRouteId: "route-1",
}];
const weeklyRequests = [];
let weeklyMode = "valid";
const weeklyModel = createPlanningPeriodReadModel({
  view: "weekly",
  fetchImpl: async (url) => {
    weeklyRequests.push(String(url));
    return {
      status: 200,
      ok: true,
      headers: { get: () => '"weekly-period-1"' },
      json: async () => weeklyMode === "malformed"
        ? ({ ok: true, view: "weekly", rows: [{}] })
        : ({ ok: true, view: "weekly", rows: compactRows }),
    };
  },
});
const compactResult = await weeklyModel.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(compactResult.ok && compactResult.rows === compactRows && !compactResult.projection, "Weekly read model must accept its direct compact rows contract");
assert(weeklyRequests[0]?.endsWith("from=2026-07-20&to=2026-07-27&view=weekly"), "Weekly read model must explicitly request the compact view");
assert(weeklyModel.getRows({ from: "2026-07-20", to: "2026-07-27" }) === compactRows, "Weekly direct rows must remain in the bounded TTL cache");
weeklyMode = "malformed";
const malformedCompact = await weeklyModel.refresh({ from: "2026-07-20", to: "2026-07-27", force: true });
assert(!malformedCompact.ok && malformedCompact.rows === compactRows, "a malformed compact row must preserve the last verified Weekly cache rather than clear the dashboard");
assert(weeklyModel.getRows({ from: "2026-07-20", to: "2026-07-27" }) === compactRows, "a malformed compact response must not replace the bounded Weekly cache");

const emptyWeeklyModel = createPlanningPeriodReadModel({
  view: "weekly",
  fetchImpl: async () => ({
    status: 200,
    ok: true,
    headers: { get: () => '"weekly-empty-1"' },
    json: async () => ({ ok: true, view: "weekly", rows: [] }),
  }),
});
const emptyWeek = await emptyWeeklyModel.refresh({ from: "2026-07-27", to: "2026-08-03" });
assert(emptyWeek.ok && Array.isArray(emptyWeek.rows) && emptyWeek.rows.length === 0, "an empty week must remain a valid compact Weekly answer");

const weeklyFallbackModel = createPlanningPeriodReadModel({
  view: "weekly",
  fetchImpl: async () => ({
    status: 200,
    ok: true,
    headers: { get: () => '"weekly-fallback-1"' },
    json: async () => ({ ok: true, projection }),
  }),
});
const compactFallback = await weeklyFallbackModel.refresh({ from: "2026-07-20", to: "2026-07-27" });
assert(compactFallback.ok && !compactFallback.rows && compactFallback.projection === projection, "Weekly read model must preserve the proven projection fallback while PostgreSQL is unavailable");

const rows = buildWeeklyPlanningPeriodRows(projection, {
  getWorkCenter: (id) => id === "D3" ? { id, name: "SMT-монтаж" } : null,
  getResource: (id) => id === "line-1" ? { id, name: "Линия 1" } : null,
});
assert(rows.length === 1 && rows[0].id === "slot-1", "period projection must create exactly one Weekly row");
assert(rows[0].workCenterLabel === "SMT-монтаж" && rows[0].resourceLabel === "Линия 1", "Weekly row labels must resolve through existing structure lookups");
assert(rows[0].quantity === 12 && rows[0].unit === "шт.", "Weekly row must preserve its plan quantity and unit");

let compactSourceSlot = null;
const directRows = buildWeeklyPlanningPeriodRowsFromCompact(compactRows, {
  getWorkCenter: (id) => id === "D3_L1" ? { id, name: "SMT линия 1" } : null,
  getResource: (id) => id === "line-1" ? { id, name: "Линия 1" } : null,
  resolveSlotPresentation: (slot) => {
    compactSourceSlot = slot;
    return {
      workCenterId: "D3_L1",
      workCenter: { id: "D3_L1", name: "SMT линия 1" },
      resourceId: "line-1",
      resource: { id: "line-1", name: "Линия 1" },
      unit: "плата",
    };
  },
});
assert(directRows.length === 1 && directRows[0]?.slot?.id === "slot-1", "compact Weekly transport must retain the small slot envelope used by fact aggregation");
assert(compactSourceSlot?.workCenterId === "D3" && compactSourceSlot?.resourceId === "line-1" && compactSourceSlot?.routeId === "route-1", "compact Weekly transport must retain raw slot scalar fields for SMT line resolution");
assert(directRows[0]?.workCenterLabel === "SMT линия 1" && directRows[0]?.resourceLabel === "Линия 1" && directRows[0]?.unit === "плата", "compact Weekly rows must reuse the existing SMT line, resource and task-unit presentation resolver");

// After a local planning write, a cached or 304 server answer must not take
// visual authority until it actually represents the same scheduled slot.
// The two shapes intentionally differ (legacy row carries route/step objects;
// the bounded API row carries a compact slot), so this proves the comparison
// remains projection-based rather than object-identity-based.
const equivalentLegacyRows = [{
  id: "slot-1",
  slot: {
    id: "slot-1",
    routeId: "route-1",
    routeStepId: "step-1",
    plannedStart: "2026-07-20T05:00:00.000Z",
    plannedEnd: "2026-07-20T06:00:00.000Z",
    quantity: 12,
    status: "planned",
    isLocked: false,
  },
  step: { id: "step-1", routeId: "route-1", workCenterId: "D3", executionContext: { resourceId: "line-1" } },
  route: { id: "route-1", unit: "шт." },
  plannedStart: new Date("2026-07-20T05:00:00.000Z"),
  plannedEnd: new Date("2026-07-20T06:00:00.000Z"),
  quantity: 12,
  unit: "шт.",
  workCenterId: "D3",
  resourceId: "line-1",
}];
assert(weeklyPlanningRowsEquivalent(rows, equivalentLegacyRows), "equivalent bounded and legacy rows must allow Weekly to resume its compact server read");
const equivalentResolvedLegacyRows = equivalentLegacyRows.map((row) => ({
  ...row,
  slot: { ...row.slot, workCenterId: "D3_L1", resourceId: "line-1", unit: "плата" },
  step: { ...row.step, workCenterId: "D3_L1" },
  unit: "плата",
  workCenterId: "D3_L1",
  resourceId: "line-1",
}));
assert(weeklyPlanningRowsEquivalent(directRows, equivalentResolvedLegacyRows), "equivalent direct and legacy rows must preserve local-write authority semantics after SMT line resolution");
const staleServerRows = rows.map((row) => ({ ...row, quantity: 11, slot: { ...row.slot, quantity: 11 } }));
assert(!weeklyPlanningRowsEquivalent(staleServerRows, equivalentLegacyRows), "a stale server projection must not overwrite a locally changed Weekly row");
const shiftedServerRows = rows.map((row) => ({ ...row, plannedStart: new Date("2026-07-20T05:01:00.000Z") }));
assert(!weeklyPlanningRowsEquivalent(shiftedServerRows, equivalentLegacyRows), "a shifted server slot must not overwrite a locally changed Weekly row");
console.log("Planning period read-model QA: OK");
