import { createPlanningPeriodReadModel } from "../src/modules/domain_api/planning_period_read_model.js";
import { buildWeeklyPlanningPeriodRows } from "../src/modules/weekly_production_control/planning_period_rows.js";

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

const rows = buildWeeklyPlanningPeriodRows(projection, {
  getWorkCenter: (id) => id === "D3" ? { id, name: "SMT-монтаж" } : null,
  getResource: (id) => id === "line-1" ? { id, name: "Линия 1" } : null,
});
assert(rows.length === 1 && rows[0].id === "slot-1", "period projection must create exactly one Weekly row");
assert(rows[0].workCenterLabel === "SMT-монтаж" && rows[0].resourceLabel === "Линия 1", "Weekly row labels must resolve through existing structure lookups");
assert(rows[0].quantity === 12 && rows[0].unit === "шт.", "Weekly row must preserve its plan quantity and unit");
console.log("Planning period read-model QA: OK");
