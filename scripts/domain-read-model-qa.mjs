import { createWorkOrdersReadModel, inspectPlanningCompatibilityResult } from "../src/modules/domain_api/work_orders_read_model.js";

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
      json: async () => ({
        ok: true,
        item: { id: "route-1", quantity: 24, concurrencyRevision: 9 },
        slot: { id: responseKind === "wrong-slot" ? "slot-neighbor" : "slot-1", plannedStart: "2026-07-18T08:00:00.000Z" },
        compatibilityReceipt: responseKind === "slot-pending"
          ? { found: true, exact: true, ready: false, state: "pending", unresolvedCount: 1 }
          : { found: true, exact: true, ready: true, state: "applied", unresolvedCount: 0 },
      }),
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
const scheduled = await readModel.changeSlotSchedule("route-1", "step-1", "slot-1", "2026-07-18T08:00:00.000Z", 8);
assert(scheduled.ok && scheduled.compatibilityReady === true && scheduled.item?.concurrencyRevision === 9 && scheduled.slot?.id === "slot-1" && requests.at(-1)?.options?.headers?.["If-Match"] === '"8"', "slot schedule command must use the exact physical slot, aggregate ETag and applied rollback receipt before success");
assert(JSON.parse(requests.at(-1)?.options?.body || "{}").slotId === "slot-1", "slot schedule request must carry the selected physical slot id");
responseKind = "slot-pending";
const pendingSlotMirror = await readModel.changeSlotSchedule("route-1", "step-1", "slot-1", "2026-07-18T08:30:00.000Z", 9);
assert(pendingSlotMirror.ok && pendingSlotMirror.compatibilityReady === false, "a committed slot with a pending rollback mirror must not expose plain compatibility success");
responseKind = "wrong-slot";
const wrongSlot = await readModel.changeSlotSchedule("route-1", "step-1", "slot-1", "2026-07-18T09:00:00+03:00", 9);
assert(!wrongSlot.ok && wrongSlot.kind === "unavailable", "client must fail closed when the owner returns a neighboring physical slot");
responseKind = "fresh";
await readModel.refresh();
assert(calls === 9, "fresh list read model must not refetch during its TTL");
clock += 31_000;
responseKind = "unchanged";
const unchanged = await readModel.refresh();
assert(unchanged.ok && !unchanged.changed && requests[9]?.options?.headers?.["If-None-Match"] === '"9"', "a mutation must advance the cache ETag before stale data is revalidated");
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

const collisionRequests = [];
const collisionModel = createWorkOrdersReadModel({
  fetchImpl: async (rawUrl) => {
    const requestUrl = String(rawUrl);
    collisionRequests.push(requestUrl);
    if (requestUrl.includes("/bootstrap")) return { status: 404, ok: false, headers: { get: () => "" } };
    if (requestUrl.includes("/route-exact?view=workbench")) return {
      status: 200,
      ok: true,
      headers: { get: () => '"detail-exact"' },
      json: async () => ({ ok: true, item: { id: "route-exact", operations: [] } }),
    };
    if (requestUrl.endsWith("/api/v1/planning/work-orders")) return {
      status: 200,
      ok: true,
      headers: { get: () => '"collision-list"' },
      json: async () => ({ ok: true, items: [
        { id: "route-alias", number: "route-exact" },
        { id: "route-exact", number: "WO-EXACT" },
      ] }),
    };
    throw new Error(`Unexpected collision request: ${requestUrl}`);
  },
});
await collisionModel.refresh();
const collisionSelection = await collisionModel.refreshWorkbenchBootstrap("route-exact");
assert(collisionSelection.activeId === "route-exact" && collisionSelection.item?.id === "route-exact",
  "legacy-compatible client fallback must prefer an exact aggregate id over a colliding number alias");
assert(collisionRequests.some((url) => url.includes("/route-exact?view=workbench"))
  && !collisionRequests.some((url) => url.includes("/route-alias?view=workbench")),
"client pre-read and read-back must remain bound to the canonical aggregate under id/number collisions");

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

const startDateRequests = [];
let startDatePatchCount = 0;
const startDateModel = createWorkOrdersReadModel({
  fetchImpl: async (rawUrl, options = {}) => {
    const requestUrl = String(rawUrl);
    startDateRequests.push({ url: requestUrl, options });
    if (options.method === "PATCH" && requestUrl.endsWith("/route-start/start-date")) {
      startDatePatchCount += 1;
      if (startDatePatchCount === 2) return {
        status: 409,
        ok: false,
        headers: { get: () => '"13"' },
        json: async () => ({
          ok: false,
          code: "superseded-idempotent-replay",
          superseded: true,
          idempotentReplay: true,
          item: {
            id: "route-start",
            number: "WO-START",
            planningStartDate: "2026-08-04",
            concurrencyRevision: 13,
          },
        }),
      };
      if (startDatePatchCount === 3) return {
        status: 409,
        ok: false,
        headers: { get: () => '"14"' },
        json: async () => ({
          ok: false,
          conflict: true,
          item: {
            id: "route-start",
            number: "WO-START",
            planningStartDate: "2026-08-06",
            concurrencyRevision: 14,
          },
        }),
      };
      if (startDatePatchCount === 4) return {
        status: 409,
        ok: false,
        headers: { get: () => '"parity-pending"' },
        json: async () => ({
          ok: false,
          fallbackReason: "postgres-snapshot-parity-mismatch",
          error: "Planning write is temporarily unavailable while parity converges",
        }),
      };
      if (startDatePatchCount === 5) return {
        status: 409,
        ok: false,
        headers: { get: () => '"schema-pending"' },
        json: async () => ({
          ok: false,
          code: "planning-start-date-schema-not-ready",
          error: "Planning start-date owner schema is not ready",
        }),
      };
      if (startDatePatchCount === 6) return {
        status: 200,
        ok: true,
        headers: { get: () => '"15"' },
        json: async () => ({
          ok: true,
          idempotentReplay: true,
          compatibilityReceipt: { found: true, exact: true, ready: true, state: "applied", unresolvedCount: 0 },
          item: {
            id: "route-start",
            number: "WO-START",
            planningStartDate: null,
            concurrencyRevision: 15,
          },
        }),
      };
      return {
        status: 200,
        ok: true,
        headers: { get: () => '"12"' },
        json: async () => ({
          ok: true,
          idempotentReplay: true,
          snapshotSync: { applied: 0, conflicts: 0, failed: 1, skipped: 0 },
          item: {
            id: "route-start",
            number: "WO-START",
            planningStartDate: "2026-08-03",
            concurrencyRevision: 12,
          },
        }),
      };
    }
    if (!options.method) return {
      status: 200,
      ok: true,
      headers: { get: () => '"11"' },
      json: async () => ({
        ok: true,
        items: [{
          id: "route-start",
          number: "WO-START",
          planningStartDate: "2026-08-01",
          concurrencyRevision: 11,
        }],
      }),
    };
    throw new Error(`Unexpected start-date read-model request: ${requestUrl}`);
  },
});
await startDateModel.refresh();
const callsBeforeInvalidStartDates = startDateRequests.length;
for (const invalidDate of ["2026-02-29", "0000-01-01", "", "   ", 20260801, undefined]) {
  const invalidResult = await startDateModel.changeStartDate("route-start", invalidDate, 11, {
    idempotencyKey: `planning-start-date:invalid:${invalidDate}`,
  });
  assert(!invalidResult.ok && invalidResult.kind === "invalid", `${invalidDate} must be rejected by the client calendar boundary`);
}
assert(startDateRequests.length === callsBeforeInvalidStartDates, "invalid start dates must not invoke fetch");

const startDateKey = "planning-start-date:domain-read-model-qa";
const changedStartDate = await startDateModel.changeStartDate("route-start", "2026-08-03", 11, {
  idempotencyKey: startDateKey,
});
const startDateRequest = startDateRequests.at(-1);
assert(changedStartDate.ok && changedStartDate.idempotentReplay === true && changedStartDate.compatibilityReady === false,
  "start-date command must surface both an idempotent owner replay and a deferred compatibility mirror");
assert(changedStartDate.item?.planningStartDate === "2026-08-03" && startDateModel.getItems()[0]?.concurrencyRevision === 12,
  "start-date command must update the read-through cache with the authoritative item");
assert(startDateRequest.url.endsWith("/route-start/start-date") && startDateRequest.options?.method === "PATCH",
  "start-date command must target the dedicated owner endpoint");
assert(startDateRequest.options?.headers?.["If-Match"] === '"11"'
  && startDateRequest.options?.headers?.["Idempotency-Key"] === startDateKey,
"start-date command must preserve revision and idempotency headers");
assert(JSON.stringify(JSON.parse(startDateRequest.options?.body || "{}")) === JSON.stringify({ planningStartDate: "2026-08-03", expectedRevision: 11 }),
  "start-date command body must contain only the canonical date and expected revision");

const supersededStartDate = await startDateModel.changeStartDate("route-start", "2026-08-03", 11, {
  idempotencyKey: startDateKey,
});
assert(!supersededStartDate.ok
  && supersededStartDate.kind === "superseded"
  && supersededStartDate.code === "superseded-idempotent-replay",
"a lost-response replay superseded by another actor must be decoded before generic 409 conflict handling");
assert(supersededStartDate.item?.planningStartDate === "2026-08-04"
  && startDateModel.getItems()[0]?.concurrencyRevision === 13,
"a superseded replay must replace the read-through cache with the current canonical item");

const conflictedStartDate = await startDateModel.changeStartDate("route-start", "2026-08-05", 13, {
  idempotencyKey: "planning-start-date:domain-read-model-conflict",
});
assert(!conflictedStartDate.ok && conflictedStartDate.kind === "conflict"
  && conflictedStartDate.item?.concurrencyRevision === 14,
"an ordinary 409 must expose the authoritative item for a deliberate new command");
assert(startDateModel.getItems()[0]?.planningStartDate === "2026-08-06"
  && startDateModel.getItems()[0]?.concurrencyRevision === 14,
"the 409 item must update the cache even if the follow-up GET is unavailable");

const parityPendingStartDate = await startDateModel.changeStartDate("route-start", "2026-08-05", 13, {
  idempotencyKey: "planning-start-date:domain-read-model-parity-pending",
});
assert(!parityPendingStartDate.ok
  && parityPendingStartDate.kind === "unavailable"
  && parityPendingStartDate.reconciliationPending === true
  && parityPendingStartDate.code === "planning-parity-not-ready",
"a pre-receipt parity 409 must preserve the exact retry intent instead of masquerading as an aggregate conflict");
const schemaPendingStartDate = await startDateModel.changeStartDate("route-start", "2026-08-05", 13, {
  idempotencyKey: "planning-start-date:domain-read-model-schema-pending",
});
assert(!schemaPendingStartDate.ok
  && schemaPendingStartDate.kind === "unavailable"
  && schemaPendingStartDate.reconciliationPending === true
  && schemaPendingStartDate.code === "planning-start-date-schema-not-ready",
"a pre-receipt schema 409 must retain the command until owner readiness returns");

const clearStartDateKey = "planning-start-date:domain-read-model-clear";
const clearedStartDate = await startDateModel.changeStartDate("route-start", null, 14, {
  idempotencyKey: clearStartDateKey,
});
const clearStartDateRequest = startDateRequests.at(-1);
assert(clearedStartDate.ok && clearedStartDate.idempotentReplay === true && clearedStartDate.compatibilityReady === true,
  "nullable clear must surface the exact ready compatibility receipt");
assert(clearedStartDate.item?.planningStartDate === null
  && startDateModel.getItems()[0]?.planningStartDate === null
  && startDateModel.getItems()[0]?.concurrencyRevision === 15,
"nullable clear must update the read-through cache without coercing null to an old date");
assert(JSON.stringify(JSON.parse(clearStartDateRequest.options?.body || "{}")) === JSON.stringify({ planningStartDate: null, expectedRevision: 14 }),
  "client transport must retain explicit null in the owner command body");

const conflictedReceipt = inspectPlanningCompatibilityResult({
  snapshotSync: { total: 0, applied: 0, conflicts: 0, failed: 0, skipped: 0 },
  compatibilityReceipt: { found: true, exact: true, ready: false, state: "conflict", unresolvedCount: 1 },
});
assert(conflictedReceipt.compatibilityReady === false,
  "total=0 must not hide a terminal conflict for the exact command receipt");
const beyondPageReceipt = inspectPlanningCompatibilityResult({
  snapshotSync: { total: 20, applied: 20, conflicts: 0, failed: 0, skipped: 0 },
  compatibilityReceipt: { found: true, exact: true, ready: false, state: "pending", unresolvedCount: 1 },
});
assert(beyondPageReceipt.compatibilityReady === false,
  "an all-applied worker page must not approve a target command that remains pending beyond the page");
const appliedReceipt = inspectPlanningCompatibilityResult({
  snapshotSync: { total: 0, applied: 0, conflicts: 0, failed: 0, skipped: 0 },
  compatibilityReceipt: { found: true, exact: true, ready: true, state: "applied", unresolvedCount: 0 },
});
assert(appliedReceipt.compatibilityReady === true,
  "only the exact applied receipt with no unresolved aggregate rows may approve rollback readiness");
console.log("Domain read model QA: OK");
