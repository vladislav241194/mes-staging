import { createWorkOrdersReadModel } from "../src/modules/domain_api/work_orders_read_model.js";

function assert(value, message) { if (!value) throw new Error(message); }

let clock = 1_000;
let calls = 0;
let responseKind = "fresh";
const requests = [];
const readModel = createWorkOrdersReadModel({
  now: () => clock,
  fetchImpl: async (_url, options) => {
    calls += 1;
    requests.push({ url: String(_url), options });
    if (responseKind === "offline") throw new Error("offline");
    if (options?.method === "PATCH" && String(_url).endsWith("/slot")) return {
      status: 200,
      ok: true,
      headers: { get: () => '"9"' },
      json: async () => ({ ok: true, item: { id: "route-1", quantity: 24, concurrencyRevision: 9 } }),
    };
    if (options?.method === "PATCH") return {
      status: 200,
      ok: true,
      headers: { get: () => '"8"' },
      json: async () => ({ ok: true, item: { id: "route-1", quantity: 24, concurrencyRevision: 8 } }),
    };
    if (String(_url).endsWith("/summary")) {
      if (responseKind === "unchanged-summary") return { status: 304, ok: false, headers: { get: () => '"7"' } };
      return {
        status: 200,
        ok: true,
        headers: { get: () => '"7"' },
        json: async () => ({ ok: true, summary: { workOrderCount: 1, totalQuantity: 12, operationCount: 1, scheduledOperationCount: 1, unscheduledOperationCount: 0 } }),
      };
    }
    if (String(_url).includes("/route-1?view=workbench")) return {
      status: 200,
      ok: true,
      headers: { get: () => '"7"' },
      json: async () => ({ ok: true, item: { id: "route-1", operations: [{ id: "step-1", operationId: "OP-1" }] } }),
    };
    if (responseKind === "unchanged") return { status: 304, ok: false, headers: { get: () => '"7"' } };
    return {
      status: 200,
      ok: true,
      headers: { get: () => '"7"' },
      json: async () => ({ ok: true, items: [{ id: "route-1", quantity: 12, concurrencyRevision: 7 }] }),
    };
  },
});

const fresh = await readModel.refresh();
assert(fresh.ok && fresh.changed && readModel.getItems()[0]?.id === "route-1", "first response must populate projection cache");
const summary = await readModel.refreshSummary();
assert(summary.ok && summary.changed && readModel.getSummary()?.totalQuantity === 12, "summary response must populate its compact projection cache");
await readModel.refreshSummary();
assert(calls === 2, "fresh summary must not refetch during its TTL");
clock += 31_000;
responseKind = "unchanged-summary";
const unchangedSummary = await readModel.refreshSummary();
assert(unchangedSummary.ok && !unchangedSummary.changed && requests.at(-1)?.options?.headers?.["If-None-Match"] === '"7"', "stale summary must revalidate with its own ETag");
responseKind = "fresh";
const detail = await readModel.refreshDetail("route-1");
assert(detail.ok && detail.item?.operations?.[0]?.id === "step-1" && readModel.getDetail("route-1")?.id === "route-1", "detail projection must be cached separately by work-order id");
assert(requests.at(-1)?.url.endsWith("/route-1?view=workbench"), "detail request must use the compact workbench projection");
const changedQuantity = await readModel.changeQuantity("route-1", 24, 7);
assert(changedQuantity.ok && changedQuantity.item?.concurrencyRevision === 8 && readModel.getItems()[0]?.quantity === 24, "quantity command must update the read-through cache after a successful conditional write");
const scheduled = await readModel.changeSlotSchedule("route-1", "step-1", "2026-07-18T08:00:00.000Z", 8);
assert(scheduled.ok && scheduled.item?.concurrencyRevision === 9 && requests.at(-1)?.options?.headers?.["If-Match"] === '"8"', "slot schedule command must use the aggregate ETag and update the cache");
await readModel.refresh();
assert(calls === 6, "fresh list read model must not refetch during its TTL");
clock += 31_000;
responseKind = "unchanged";
const unchanged = await readModel.refresh();
assert(unchanged.ok && !unchanged.changed && requests[6]?.options?.headers?.["If-None-Match"] === '"9"', "a mutation must advance the cache ETag before stale data is revalidated");
clock += 31_000;
responseKind = "offline";
const offline = await readModel.refresh();
assert(!offline.ok && readModel.getItems().length === 1, "offline API must retain snapshot-compatible cached projection");
console.log("Domain read model QA: OK");
