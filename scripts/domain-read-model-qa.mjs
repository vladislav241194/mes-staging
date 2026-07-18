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
    if (String(_url).includes("/bootstrap")) {
      if (responseKind === "unchanged-bootstrap") return { status: 304, ok: false, headers: { get: () => '"bootstrap-7"' } };
      return {
        status: 200,
        ok: true,
        headers: { get: () => '"bootstrap-7"' },
        json: async () => ({
          ok: true,
          items: [{ id: "route-1", number: "WO-001", quantity: 12, concurrencyRevision: 7 }],
          activeId: "route-1",
          item: { id: "route-1", operations: [{ id: "step-1", operationId: "OP-1" }] },
        }),
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
const callsBeforeBootstrap = calls;
const bootstrap = await readModel.refreshWorkbenchBootstrap("WO-001");
assert(bootstrap.ok && bootstrap.changed && bootstrap.activeId === "route-1" && bootstrap.item?.operations?.[0]?.id === "step-1", "workbench bootstrap must atomically return list and selected detail");
assert(calls === callsBeforeBootstrap + 1 && requests.at(-1)?.url.includes("/bootstrap?active=WO-001"), "workbench bootstrap must make exactly one request instead of list then detail");
assert(readModel.getItems()[0]?.id === "route-1" && readModel.getDetail("route-1")?.id === "route-1", "workbench bootstrap must populate both read-model caches");
await readModel.refreshWorkbenchBootstrap("route-1");
assert(calls === callsBeforeBootstrap + 1, "fresh workbench bootstrap must reuse its cached selected aggregate across ID and number aliases");
const changedQuantity = await readModel.changeQuantity("route-1", 24, 7);
assert(changedQuantity.ok && changedQuantity.item?.concurrencyRevision === 8 && readModel.getItems()[0]?.quantity === 24, "quantity command must update the read-through cache after a successful conditional write");
const scheduled = await readModel.changeSlotSchedule("route-1", "step-1", "2026-07-18T08:00:00.000Z", 8);
assert(scheduled.ok && scheduled.item?.concurrencyRevision === 9 && requests.at(-1)?.options?.headers?.["If-Match"] === '"8"', "slot schedule command must use the aggregate ETag and update the cache");
await readModel.refresh();
assert(calls === 7, "fresh list read model must not refetch during its TTL");
clock += 31_000;
responseKind = "unchanged";
const unchanged = await readModel.refresh();
assert(unchanged.ok && !unchanged.changed && requests[7]?.options?.headers?.["If-None-Match"] === '"9"', "a mutation must advance the cache ETag before stale data is revalidated");
clock += 31_000;
responseKind = "offline";
const offline = await readModel.refresh();
assert(!offline.ok && readModel.getItems().length === 1, "offline API must retain snapshot-compatible cached projection");

// Selection must never reuse a direct detail as if it had come from the
// atomic bootstrap. This models a user clicking another work order after the
// first tree is ready.
const selectionRequests = [];
const selectionModel = createWorkOrdersReadModel({
  fetchImpl: async (rawUrl) => {
    const requestUrl = String(rawUrl);
    selectionRequests.push(requestUrl);
    if (requestUrl.includes("/bootstrap")) {
      const requested = new URL(requestUrl, "https://mes.local").searchParams.get("active") || "route-a";
      return {
        status: 200,
        ok: true,
        headers: { get: () => `"bootstrap-${requested}"` },
        json: async () => ({
          ok: true,
          items: [{ id: "route-a", number: "WO-A" }, { id: "route-b", number: "WO-B" }],
          activeId: requested,
          item: { id: requested, source: `bootstrap-${requested}`, operations: [] },
        }),
      };
    }
    if (requestUrl.includes("/route-b?view=workbench")) return {
      status: 200,
      ok: true,
      headers: { get: () => '"detail-b"' },
      json: async () => ({ ok: true, item: { id: "route-b", source: "direct-b-stale", operations: [] } }),
    };
    throw new Error(`Unexpected selection request: ${requestUrl}`);
  },
});
await selectionModel.refreshWorkbenchBootstrap("route-a");
await selectionModel.refreshDetail("route-b");
const selectedB = await selectionModel.refreshWorkbenchBootstrap("route-b");
assert(selectedB.ok && selectedB.item?.source === "bootstrap-route-b", "a new selection must refresh through its own atomic bootstrap instead of reusing a direct detail");
assert(selectionRequests.filter((url) => url.includes("/bootstrap")).length === 2, "a changed selection must issue its own one-request bootstrap");

function deferred() {
  let resolve;
  return { promise: new Promise((done) => { resolve = done; }), resolve };
}
const pendingA = deferred();
const pendingB = deferred();
const concurrentModel = createWorkOrdersReadModel({
  fetchImpl: async (rawUrl) => {
    const selected = new URL(String(rawUrl), "https://mes.local").searchParams.get("active");
    if (selected === "route-a") return pendingA.promise;
    if (selected === "route-b") return pendingB.promise;
    throw new Error(`Unexpected concurrent bootstrap request: ${rawUrl}`);
  },
});
const lateA = concurrentModel.refreshWorkbenchBootstrap("route-a");
const currentB = concurrentModel.refreshWorkbenchBootstrap("route-b");
pendingB.resolve({
  status: 200,
  ok: true,
  headers: { get: () => '"bootstrap-b"' },
  json: async () => ({ ok: true, items: [{ id: "route-a" }, { id: "route-b" }], activeId: "route-b", item: { id: "route-b", source: "bootstrap-b", operations: [] } }),
});
const bResult = await currentB;
pendingA.resolve({
  status: 200,
  ok: true,
  headers: { get: () => '"bootstrap-a"' },
  json: async () => ({ ok: true, items: [{ id: "route-a" }, { id: "route-b" }], activeId: "route-a", item: { id: "route-a", source: "bootstrap-a", operations: [] } }),
});
const aResult = await lateA;
assert(bResult.ok && bResult.changed && concurrentModel.getDetail("route-b")?.source === "bootstrap-b", "the newest bootstrap selection must populate its own detail cache");
assert(aResult.ok && !aResult.changed && concurrentModel.getDetail("route-b")?.source === "bootstrap-b", "a late older bootstrap must not replace the newest selection state");

const pendingBeforeMutation = deferred();
const mutationRaceModel = createWorkOrdersReadModel({
  fetchImpl: async (rawUrl) => {
    const requestUrl = String(rawUrl);
    if (requestUrl.includes("/bootstrap")) return pendingBeforeMutation.promise;
    if (requestUrl.includes("/route-a?view=workbench")) return {
      status: 200,
      ok: true,
      headers: { get: () => '"detail-new"' },
      json: async () => ({ ok: true, item: { id: "route-a", source: "direct-new", operations: [] } }),
    };
    throw new Error(`Unexpected mutation race request: ${requestUrl}`);
  },
});
const staleBeforeMutation = mutationRaceModel.refreshWorkbenchBootstrap("route-a");
await mutationRaceModel.refreshDetail("route-a", { force: true });
pendingBeforeMutation.resolve({
  status: 200,
  ok: true,
  headers: { get: () => '"bootstrap-old"' },
  json: async () => ({ ok: true, items: [{ id: "route-a" }], activeId: "route-a", item: { id: "route-a", source: "bootstrap-old", operations: [] } }),
});
const staleAfterMutation = await staleBeforeMutation;
assert(staleAfterMutation.ok && !staleAfterMutation.changed && mutationRaceModel.getDetail("route-a")?.source === "direct-new", "a bootstrap response older than a direct refresh or write must never overwrite fresh detail data");
console.log("Domain read model QA: OK");
