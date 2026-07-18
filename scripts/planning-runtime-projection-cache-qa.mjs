import { gunzipSync } from "node:zlib";

import { handleDomainApiRequest, resetPlanningRuntimeProjectionCache } from "./domain-api.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getHeader(headers = {}, name = "") {
  const expected = String(name).toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === expected);
  return key ? headers[key] : undefined;
}

function makeResponse(acceptEncoding = "") {
  return {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    __mesAcceptEncoding: acceptEncoding,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    },
  };
}

function parseResponseBody(response) {
  if (!response.body?.byteLength) return {};
  const encoded = String(getHeader(response.headers, "content-encoding") || "").toLowerCase();
  const body = encoded === "gzip" ? gunzipSync(response.body) : response.body;
  return JSON.parse(body.toString("utf-8"));
}

function assertCacheTiming(headers = {}, cacheState, message) {
  const value = String(getHeader(headers, "server-timing") || "");
  assert(
    new RegExp(`^planning-projection-cache;cache=${cacheState};dur=\\d+(?:\\.\\d+)?$`).test(value),
    `${message} must expose only the safe runtime-projection cache timing marker`,
  );
}

function makeMarker(revision) {
  return {
    observationAvailable: true,
    primaryRevision: revision,
    verifiedPrimaryRevision: revision,
    verifiedSnapshotFingerprint: `sha256:compat-${revision}`,
    verifiedSnapshotGeneration: revision,
    verifiedContractVersion: 5,
    snapshotGeneration: revision,
    snapshotObservationState: "observed",
    observedSnapshotFingerprint: `sha256:compat-${revision}`,
  };
}

function makeItem({
  id = "route-1",
  number = "WO-001",
  quantity = 10,
  concurrencyRevision = 1,
  source = "primary",
} = {}) {
  return {
    id,
    number,
    name: "Изделие",
    designation: "АБВГ.001",
    quantity,
    unit: "шт.",
    lifecycleStatus: "released",
    planningStatus: "scheduled",
    revision: 3,
    concurrencyRevision,
    updatedAt: "2026-07-18T09:00:00.000Z",
    metadata: {
      id,
      source,
      planningQuantity: quantity,
      workOrderSnapshot: { id: number, quantity },
      // Ensure the cached response crosses the shared JSON gzip threshold.
      largeRouteMetadata: "cache-compression-check-".repeat(90),
    },
    operations: [{
      id: `operation-${id}`,
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "D3",
      nextWorkCenterId: "D4",
      quantityMultiplier: 1,
      executionContext: { calculationType: "normative", unitsPerHour: 55 },
      metadata: { id: `operation-${id}`, routeId: id, source },
      slot: {
        id: `slot-${id}`,
        plannedStart: "2026-07-18T08:00:00.000Z",
        plannedEnd: "2026-07-18T09:00:00.000Z",
        status: "planned",
        quantity,
        isLocked: false,
        metadata: { id: `slot-${id}`, routeId: id, routeStepId: `operation-${id}`, source },
      },
    }],
  };
}

const state = {
  revision: 10,
  primaryItem: makeItem({ source: "primary" }),
  snapshotItem: makeItem({ source: "snapshot" }),
  marker: makeMarker(10),
  primaryRuntimeReads: 0,
  primaryAggregateReads: 0,
  snapshotAggregateReads: 0,
};

const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
const snapshotMetadata = { storageMode: "snapshot-adapter", storageBackend: "shared-state", configured: true };

const primary = {
  async health() {
    return { ...metadata, revision: state.revision, updatedAt: `2026-07-18T09:${String(state.revision).padStart(2, "0")}:00.000Z` };
  },
  async getPlanningProjectionParityState() {
    return { ...state.marker };
  },
  async markPlanningProjectionParity() { return true; },
  async beginPlanningSnapshotObservation() { return null; },
  async recordPlanningSnapshotObservation() { return false; },
  async listRuntimeProjection() {
    state.primaryRuntimeReads += 1;
    return { ...metadata, revision: state.revision, updatedAt: `2026-07-18T09:${String(state.revision).padStart(2, "0")}:00.000Z`, items: [state.primaryItem] };
  },
  async list() {
    state.primaryAggregateReads += 1;
    return { ...metadata, revision: state.revision, items: [state.primaryItem] };
  },
  async get(id) {
    state.primaryAggregateReads += 1;
    const match = String(id) === "route-1" || String(id) === "WO-001";
    return { ...metadata, revision: state.revision, item: match ? state.primaryItem : null };
  },
  async changeQuantity(id, { quantity, expectedRevision }) {
    const match = String(id) === "route-1" || String(id) === "WO-001";
    if (!match || Number(expectedRevision) !== Number(state.primaryItem.concurrencyRevision)) {
      return { ...metadata, revision: state.revision, conflict: true, item: state.primaryItem };
    }
    state.revision += 1;
    state.primaryItem = makeItem({ quantity, concurrencyRevision: state.primaryItem.concurrencyRevision + 1, source: "primary" });
    state.snapshotItem = makeItem({ quantity, concurrencyRevision: state.primaryItem.concurrencyRevision, source: "snapshot" });
    state.marker = makeMarker(state.revision);
    return { ...metadata, revision: state.revision, item: state.primaryItem };
  },
  async changeSlotSchedule() {
    throw new Error("slot write is outside this projection-cache fixture");
  },
};

const snapshot = {
  async health() {
    return {
      ...snapshotMetadata,
      revision: state.revision,
      updatedAt: `2026-07-18T09:${String(state.revision).padStart(2, "0")}:00.000Z`,
      planningProjectionFingerprint: `sha256:compat-${state.revision}`,
    };
  },
  async list() {
    state.snapshotAggregateReads += 1;
    return { ...snapshotMetadata, revision: state.revision, items: [state.snapshotItem] };
  },
  async get(id) {
    state.snapshotAggregateReads += 1;
    const match = String(id) === "route-1" || String(id) === "WO-001";
    return { ...snapshotMetadata, revision: state.revision, item: match ? state.snapshotItem : null };
  },
};

const env = { MES_DOMAIN_STORAGE: "postgres", DATABASE_URL: "postgresql://cache-qa" };
const factory = async ({ env: requestedEnv }) => (
  String(requestedEnv?.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? snapshot : primary
);

async function request(pathname, { method = "GET", body = null, headers = {} } = {}) {
  const response = makeResponse(headers["accept-encoding"] || headers["Accept-Encoding"] || "");
  const handled = await handleDomainApiRequest(
    { method, body, headers },
    response,
    new URL(`http://mes.cache-qa${pathname}`),
    { filePath: "planning-runtime-projection-cache-qa", env, workOrdersRepositoryFactory: factory },
  );
  return {
    handled,
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body,
    json: parseResponseBody(response),
  };
}

resetPlanningRuntimeProjectionCache();

const cold = await request("/api/v1/planning/work-orders/projection");
assert(cold.handled && cold.statusCode === 200 && cold.json.projection?.routes?.[0]?.source === "primary", "cold safe-primary projection must return the PostgreSQL graph");
assert(state.primaryRuntimeReads === 1, "cold projection must read PostgreSQL exactly once");
assert(!getHeader(cold.headers, "content-encoding") && !getHeader(cold.headers, "vary"), "uncompressed cold projection must retain the normal response headers");
assertCacheTiming(cold.headers, "miss", "cold projection");
const firstEtag = getHeader(cold.headers, "etag");
assert(/^"[A-Za-z0-9_-]{24}"$/.test(String(firstEtag || "")), "safe-primary projection must expose an opaque marker-backed ETag");

const cached = await request("/api/v1/planning/work-orders/projection");
assert(cached.statusCode === 200 && cached.headers.ETag === firstEtag && cached.json.projection?.routes?.[0]?.id === "route-1", "cache hit must preserve the projection contract and ETag");
assert(state.primaryRuntimeReads === 1, "cache hit must not repeat the PostgreSQL runtime graph query");
assertCacheTiming(cached.headers, "hit", "cache hit");

const notModified = await request("/api/v1/planning/work-orders/projection", { headers: { "if-none-match": firstEtag } });
assert(notModified.statusCode === 304 && notModified.body.byteLength === 0 && notModified.headers.ETag === firstEtag, "validated cache hit must return the existing conditional GET 304 contract");
assert(state.primaryRuntimeReads === 1, "validated 304 must avoid the PostgreSQL runtime graph query");
assertCacheTiming(notModified.headers, "hit", "validated 304");

const gzipCached = await request("/api/v1/planning/work-orders/projection", { headers: { "accept-encoding": "gzip" } });
assert(gzipCached.statusCode === 200 && getHeader(gzipCached.headers, "content-encoding") === "gzip" && getHeader(gzipCached.headers, "vary") === "Accept-Encoding", "cached projection must still negotiate gzip and Vary per request");
assert(gzipCached.headers.ETag === firstEtag && gzipCached.json.projection?.routes?.[0]?.id === "route-1", "gzip cache hit must retain the same payload and ETag");
assert(state.primaryRuntimeReads === 1, "gzip cache hit must reuse the logical payload instead of reading PostgreSQL again");
assertCacheTiming(gzipCached.headers, "hit", "gzip cache hit");

// A new durable marker/revision invalidates the cached response before the
// conditional request can return 304.
state.revision = 11;
state.primaryItem = makeItem({ quantity: 11, source: "primary" });
state.snapshotItem = makeItem({ quantity: 11, source: "snapshot" });
state.marker = makeMarker(11);
const markerChanged = await request("/api/v1/planning/work-orders/projection", { headers: { "if-none-match": firstEtag } });
assert(markerChanged.statusCode === 200 && markerChanged.headers.ETag !== firstEtag && markerChanged.json.projection?.routes?.[0]?.planningQuantity === 11, "changed marker/revision must bypass the old ETag and rebuild the projection");
assert(state.primaryRuntimeReads === 2, "marker/revision change must invalidate the runtime projection cache");
assertCacheTiming(markerChanged.headers, "miss", "marker invalidation");

// Direct API writes invalidate immediately even before a later reader has a
// chance to observe the trigger-maintained marker change.
const write = await request("/api/v1/planning/work-orders/WO-001", {
  method: "PATCH",
  headers: { "if-match": '"1"' },
  body: { quantity: 22, expectedRevision: 1 },
});
assert(write.statusCode === 200 && write.json.item?.quantity === 22, "quantity command must succeed in the safe-primary fixture");
const afterWrite = await request("/api/v1/planning/work-orders/projection");
assert(afterWrite.statusCode === 200 && afterWrite.json.projection?.routes?.[0]?.planningQuantity === 22, "projection after a direct write must contain the new aggregate value");
assert(state.primaryRuntimeReads === 3, "successful direct write must invalidate the process-local projection cache");
assertCacheTiming(afterWrite.headers, "miss", "write invalidation");

// Pending observation is an explicit compatibility fallback. It must neither
// reuse the primary cache nor admit the snapshot response into that cache.
state.marker = { ...makeMarker(state.revision), snapshotObservationState: "pending" };
state.snapshotItem = makeItem({ quantity: 77, source: "snapshot-fallback" });
const fallback = await request("/api/v1/planning/work-orders/projection", { headers: { "if-none-match": afterWrite.headers.ETag } });
assert(fallback.statusCode === 200 && fallback.json.fallbackReason === "postgres-projection-stale" && fallback.json.projection?.routes?.[0]?.source === "snapshot-fallback", "snapshot fallback must not return a stale primary 304 or payload");
assert(state.primaryRuntimeReads === 3 && state.snapshotAggregateReads === 2, "fallback must avoid PostgreSQL runtime reads and use the established snapshot list/detail path");
assertCacheTiming(fallback.headers, "miss", "snapshot fallback");
const fallbackAgain = await request("/api/v1/planning/work-orders/projection");
assert(fallbackAgain.statusCode === 200 && fallbackAgain.json.fallbackReason === "postgres-projection-stale", "fallback response must preserve its established transport contract");
assert(state.snapshotAggregateReads === 4, "snapshot fallback must never be admitted into the runtime projection cache");

// `listRuntimeProjection().revision` is the maximum aggregate revision, not
// a global epoch. A lower-revision order can therefore change while that list
// value stays fixed. The projection ETag must follow the marker epoch instead
// of returning an incorrect 304 after cache invalidation.
const lowerRevisionState = {
  epoch: 100,
  maxAggregateRevision: 9,
  high: makeItem({ id: "route-high", number: "WO-HIGH", quantity: 100, concurrencyRevision: 9, source: "primary-high" }),
  low: makeItem({ id: "route-low", number: "WO-LOW", quantity: 2, concurrencyRevision: 2, source: "primary-low" }),
  runtimeReads: 0,
};
lowerRevisionState.marker = makeMarker(lowerRevisionState.epoch);

const lowerRevisionPrimary = {
  async health() {
    return { ...metadata, revision: lowerRevisionState.epoch, updatedAt: `2026-07-18T10:${String(lowerRevisionState.epoch - 100).padStart(2, "0")}:00.000Z` };
  },
  async getPlanningProjectionParityState() { return { ...lowerRevisionState.marker }; },
  async markPlanningProjectionParity() { return true; },
  async beginPlanningSnapshotObservation() { return null; },
  async recordPlanningSnapshotObservation() { return false; },
  async listRuntimeProjection() {
    lowerRevisionState.runtimeReads += 1;
    return {
      ...metadata,
      // Deliberately fixed at the highest order revision even after `low`
      // changes below.
      revision: lowerRevisionState.maxAggregateRevision,
      updatedAt: "2026-07-18T10:00:00.000Z",
      items: [lowerRevisionState.high, lowerRevisionState.low],
    };
  },
};
const lowerRevisionSnapshot = {
  async health() {
    return {
      ...snapshotMetadata,
      revision: lowerRevisionState.epoch,
      planningProjectionFingerprint: `sha256:compat-${lowerRevisionState.epoch}`,
    };
  },
};
const lowerRevisionEnv = { MES_DOMAIN_STORAGE: "postgres", DATABASE_URL: "postgresql://cache-qa-lower-revision" };
const lowerRevisionFactory = async ({ env: requestedEnv }) => (
  String(requestedEnv?.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? lowerRevisionSnapshot : lowerRevisionPrimary
);
async function lowerRevisionRequest(headers = {}) {
  const response = makeResponse(headers["accept-encoding"] || headers["Accept-Encoding"] || "");
  const handled = await handleDomainApiRequest(
    { method: "GET", headers },
    response,
    new URL("http://mes.cache-qa/api/v1/planning/work-orders/projection"),
    {
      filePath: "planning-runtime-projection-lower-revision-qa",
      env: lowerRevisionEnv,
      workOrdersRepositoryFactory: lowerRevisionFactory,
    },
  );
  return {
    handled,
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body,
    json: parseResponseBody(response),
  };
}

resetPlanningRuntimeProjectionCache();
const lowerRevisionFirst = await lowerRevisionRequest();
const lowerRevisionEtag = getHeader(lowerRevisionFirst.headers, "etag");
assert(lowerRevisionFirst.statusCode === 200 && lowerRevisionFirst.json.revision === 9 && lowerRevisionState.runtimeReads === 1, "two-order fixture must expose the fixed maximum aggregate revision on its first read");
lowerRevisionState.epoch = 101;
lowerRevisionState.low = makeItem({ id: "route-low", number: "WO-LOW", quantity: 3, concurrencyRevision: 3, source: "primary-low" });
lowerRevisionState.marker = makeMarker(lowerRevisionState.epoch);
const lowerRevisionChanged = await lowerRevisionRequest({ "if-none-match": lowerRevisionEtag });
assert(lowerRevisionChanged.statusCode === 200 && lowerRevisionChanged.json.revision === 9 && lowerRevisionChanged.headers.ETag !== lowerRevisionEtag, "lower-revision change must not receive a stale 304 when the maximum aggregate revision remains fixed");
assert(lowerRevisionChanged.json.projection?.routes?.find((route) => route.id === "route-low")?.planningQuantity === 3, "lower-revision change must return the rebuilt projection payload");
assert(lowerRevisionState.runtimeReads === 2, "marker epoch change must rebuild the complete projection after cache invalidation");
assertCacheTiming(lowerRevisionChanged.headers, "miss", "lower-revision ETag invalidation");

console.log("Planning runtime projection cache QA: OK");
