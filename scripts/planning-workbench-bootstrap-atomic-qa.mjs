import { handleDomainApiRequest } from "./domain-api.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = String(body);
    },
  };
}

function header(headers = {}, name = "") {
  const expected = String(name).toLowerCase();
  const actual = Object.keys(headers).find((key) => key.toLowerCase() === expected);
  return actual ? headers[actual] : undefined;
}

function assertBootstrapTiming(headers = {}, message) {
  const entries = String(header(headers, "server-timing") || "").split(/\s*,\s*/).filter(Boolean);
  assert(entries.length === 4, `${message}: bootstrap must expose four timing metrics`);
  assert(entries.map((entry) => entry.split(";", 1)[0]).join(",") === "planning-safety,planning-parity,planning-bootstrap,total", `${message}: timing metric order must remain stable`);
  assert(entries.every((entry) => /^(?:planning-safety|planning-parity|planning-bootstrap|total);dur=\d+(?:\.\d+)?$/.test(entry)), `${message}: timing values must remain numeric only`);
}

function resetCounters(counters = {}) {
  Object.keys(counters).forEach((key) => { counters[key] = 0; });
}

function item({ quantity = 12, slotMetadata = { source: "fixture" } } = {}) {
  return {
    id: "route-1",
    number: "WO-001",
    name: "Изделие",
    designation: "АБВГ.001",
    quantity,
    unit: "шт.",
    lifecycleStatus: "released",
    planningStatus: "scheduled",
    revision: 4,
    concurrencyRevision: 4,
    source: "specifications2",
    updatedAt: "2026-07-18T18:00:00.000Z",
    operationCount: 1,
    scheduledOperationCount: 1,
    metadata: { id: "route-1", planningQuantity: quantity },
    operations: [{
      id: "step-1",
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "D3",
      nextWorkCenterId: "D4",
      quantityMultiplier: 1,
      executionContext: { calculationType: "productivity", unitsPerHour: 40 },
      labor: {},
      metadata: { id: "step-1", routeId: "route-1" },
      slot: {
        id: "slot-1",
        plannedStart: "2026-07-18T08:00:00.000Z",
        plannedEnd: "2026-07-18T09:00:00.000Z",
        status: "planned",
        quantity,
        isLocked: false,
        metadata: slotMetadata,
      },
    }],
  };
}

function bootstrapResult(selectedItem, { storageMode = "postgres", storageBackend = "postgresql", revision = 9 } = {}) {
  return {
    storageMode,
    storageBackend,
    configured: true,
    revision,
    updatedAt: "2026-07-18T18:00:00.000Z",
    items: [{
      id: selectedItem.id,
      number: selectedItem.number,
      name: selectedItem.name,
      designation: selectedItem.designation,
      quantity: selectedItem.quantity,
      unit: selectedItem.unit,
      lifecycleStatus: selectedItem.lifecycleStatus,
      planningStatus: selectedItem.planningStatus,
      revision: selectedItem.revision,
      concurrencyRevision: selectedItem.concurrencyRevision,
      source: selectedItem.source,
      updatedAt: selectedItem.updatedAt,
      operationCount: selectedItem.operationCount,
      scheduledOperationCount: selectedItem.scheduledOperationCount,
      metadata: selectedItem.metadata,
    }],
    activeId: selectedItem.id,
    item: selectedItem,
  };
}

const observedMarker = {
  primaryRevision: 9,
  verifiedPrimaryRevision: 9,
  verifiedSnapshotFingerprint: "sha256:fixture",
  verifiedSnapshotGeneration: 12,
  verifiedContractVersion: 5,
  observationAvailable: true,
  snapshotGeneration: 12,
  snapshotObservationState: "observed",
  observedSnapshotFingerprint: "sha256:fixture",
};

async function request({ primary, snapshot, counters, pathname = "/api/v1/planning/work-orders/bootstrap?active=WO-001", headers = {}, env = { MES_DOMAIN_STORAGE: "postgres" } }) {
  const res = makeResponse();
  const handled = await handleDomainApiRequest(
    { method: "GET", headers },
    res,
    new URL(`http://mes.local${pathname}`),
    {
      filePath: "planning-workbench-bootstrap-atomic-qa",
      env,
      workOrdersRepositoryFactory: async ({ env: requestedEnv }) => {
        if (String(requestedEnv?.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot") {
          counters.snapshotFactory += 1;
          return snapshot;
        }
        counters.primaryFactory += 1;
        return primary;
      },
    },
  );
  return {
    handled,
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
    json: res.body ? JSON.parse(res.body) : {},
  };
}

const counters = {
  primaryFactory: 0,
  snapshotFactory: 0,
  atomic: 0,
  health: 0,
  marker: 0,
  normalBootstrap: 0,
  snapshotHealth: 0,
  snapshotBootstrap: 0,
};
const primaryItem = item({ quantity: 12 });
const primary = {
  async health() {
    counters.health += 1;
    return { storageMode: "postgres", storageBackend: "postgresql", configured: true, revision: 9, updatedAt: "2026-07-18T18:00:00.000Z" };
  },
  async getPlanningProjectionParityState() {
    counters.marker += 1;
    return { ...observedMarker };
  },
  async markPlanningProjectionParity() { return true; },
  async beginPlanningSnapshotObservation() { return null; },
  async recordPlanningSnapshotObservation() { return true; },
  async listWorkbenchBootstrap() {
    counters.normalBootstrap += 1;
    return bootstrapResult(primaryItem);
  },
  async readObservedWorkbenchBootstrap(activeId, { contractVersion } = {}) {
    counters.atomic += 1;
    assert(activeId === "WO-001", "atomic route must pass the selected work-order identity unchanged");
    assert(contractVersion === 5, "atomic route must pass the current parity contract version");
    return {
      admitted: true,
      markerState: { ...observedMarker },
      result: bootstrapResult(primaryItem),
      timing: { parityGuardMs: 1.25, bootstrapReadMs: 2.5 },
    };
  },
};
const snapshotItem = item({ quantity: 7, slotMetadata: { source: "snapshot" } });
const snapshot = {
  async health() {
    counters.snapshotHealth += 1;
    return { storageMode: "snapshot-adapter", storageBackend: "file", configured: true, revision: 33, updatedAt: "2026-07-18T18:00:00.000Z", planningProjectionFingerprint: "sha256:fixture" };
  },
  async listWorkbenchBootstrap() {
    counters.snapshotBootstrap += 1;
    return bootstrapResult(snapshotItem, { storageMode: "snapshot-adapter", storageBackend: "file", revision: 33 });
  },
};

const admitted = await request({ primary, snapshot, counters });
assert(admitted.handled && admitted.statusCode === 200 && admitted.json.item?.quantity === 12, "admitted atomic route must preserve the public bootstrap payload");
assert(!Object.hasOwn(admitted.json.item?.operations?.[0]?.slot || {}, "metadata"), "admitted atomic route must retain the compact workbench slot boundary");
assert(counters.atomic === 1 && counters.health === 0 && counters.marker === 0 && counters.normalBootstrap === 0, "admitted atomic route must bypass ordinary health, marker and bootstrap reads");
assert(counters.snapshotFactory === 0 && counters.snapshotHealth === 0 && counters.snapshotBootstrap === 0, "admitted atomic route must not instantiate or read the compatibility snapshot");
assertBootstrapTiming(admitted.headers, "admitted atomic route");

const notModified = await request({ primary, snapshot, counters, headers: { "if-none-match": header(admitted.headers, "etag") } });
assert(notModified.statusCode === 304 && notModified.body === "", "admitted atomic route must preserve its ETag/304 contract");
assertBootstrapTiming(notModified.headers, "atomic 304 route");

const fallbackCounters = { primaryFactory: 0, snapshotFactory: 0, atomic: 0, health: 0, marker: 0, normalBootstrap: 0, snapshotHealth: 0, snapshotBootstrap: 0 };
const pendingPrimary = {
  ...primary,
  async health() {
    fallbackCounters.health += 1;
    return { storageMode: "postgres", storageBackend: "postgresql", configured: true, revision: 9, updatedAt: "2026-07-18T18:00:00.000Z" };
  },
  async getPlanningProjectionParityState() {
    fallbackCounters.marker += 1;
    return { ...observedMarker, snapshotObservationState: "pending" };
  },
  async listWorkbenchBootstrap() {
    fallbackCounters.normalBootstrap += 1;
    return bootstrapResult(item({ quantity: 99 }));
  },
  async readObservedWorkbenchBootstrap() {
    fallbackCounters.atomic += 1;
    return {
      // The API must validate this itself rather than trust the repository
      // method blindly during a rolling deployment.
      admitted: true,
      markerState: { ...observedMarker, snapshotObservationState: "pending" },
      result: bootstrapResult(item({ quantity: 99 })),
      timing: { parityGuardMs: 1, bootstrapReadMs: 1 },
    };
  },
};
const pendingSnapshot = {
  async health() {
    fallbackCounters.snapshotHealth += 1;
    return { storageMode: "snapshot-adapter", storageBackend: "file", configured: true, revision: 33, updatedAt: "2026-07-18T18:00:00.000Z", planningProjectionFingerprint: "sha256:fixture" };
  },
  async listWorkbenchBootstrap() {
    fallbackCounters.snapshotBootstrap += 1;
    return bootstrapResult(snapshotItem, { storageMode: "snapshot-adapter", storageBackend: "file", revision: 33 });
  },
};
const pending = await request({ primary: pendingPrimary, snapshot: pendingSnapshot, counters: fallbackCounters });
assert(pending.statusCode === 200 && pending.json.item?.quantity === 7 && pending.json.fallbackReason === "postgres-projection-stale", "invalid admitted marker must discard primary bytes and use the established snapshot fallback");
assert(fallbackCounters.atomic === 1 && fallbackCounters.health === 1 && fallbackCounters.marker >= 1, "rejected atomic admission must resume the ordinary primary safety gate");
assert(fallbackCounters.snapshotFactory === 1 && fallbackCounters.snapshotHealth === 1 && fallbackCounters.snapshotBootstrap === 1, "rejected atomic admission must obtain a fresh compatible snapshot result");
assert(pending.headers.ETag !== admitted.headers.ETag, "snapshot fallback must not reuse the atomic primary response ETag");
assertBootstrapTiming(pending.headers, "atomic fallback route");

resetCounters(fallbackCounters);
pendingPrimary.readObservedWorkbenchBootstrap = async () => {
  fallbackCounters.atomic += 1;
  return { admitted: false, reason: "atomic-read-unavailable" };
};
const unavailable = await request({ primary: pendingPrimary, snapshot: pendingSnapshot, counters: fallbackCounters });
assert(unavailable.statusCode === 200 && unavailable.json.item?.quantity === 7 && unavailable.json.fallbackReason === "postgres-projection-stale", "non-admitted atomic read must resume the established snapshot fallback");
assert(fallbackCounters.atomic === 1 && fallbackCounters.health === 1 && fallbackCounters.snapshotBootstrap === 1, "non-admitted atomic read must not leave the route without a generic safety result");

resetCounters(fallbackCounters);
pendingPrimary.readObservedWorkbenchBootstrap = async () => {
  fallbackCounters.atomic += 1;
  throw new Error("atomic read transient failure");
};
const thrownAtomic = await request({ primary: pendingPrimary, snapshot: pendingSnapshot, counters: fallbackCounters });
assert(thrownAtomic.statusCode === 200 && thrownAtomic.json.item?.quantity === 7 && thrownAtomic.json.fallbackReason === "postgres-projection-stale", "thrown atomic read must be caught before the same safe fallback");
assert(fallbackCounters.atomic === 1 && fallbackCounters.health === 1 && fallbackCounters.snapshotBootstrap === 1, "thrown atomic read must preserve generic fallback availability");

const observerOffCounters = { primaryFactory: 0, snapshotFactory: 0, atomic: 0, health: 0, marker: 0, normalBootstrap: 0, snapshotHealth: 0, snapshotBootstrap: 0 };
const observerOffPrimary = {
  ...primary,
  async health() {
    observerOffCounters.health += 1;
    return { storageMode: "postgres", storageBackend: "postgresql", configured: true, revision: 9, updatedAt: "2026-07-18T18:00:00.000Z" };
  },
  async getPlanningProjectionParityState() {
    observerOffCounters.marker += 1;
    return { ...observedMarker };
  },
  async listWorkbenchBootstrap() {
    observerOffCounters.normalBootstrap += 1;
    return bootstrapResult(primaryItem);
  },
  async readObservedWorkbenchBootstrap() {
    observerOffCounters.atomic += 1;
    throw new Error("observer-disabled route must not call atomic bootstrap");
  },
};
const observerOffSnapshot = {
  async health() {
    observerOffCounters.snapshotHealth += 1;
    return { storageMode: "snapshot-adapter", storageBackend: "file", configured: true, revision: 33, updatedAt: "2026-07-18T18:00:00.000Z", planningProjectionFingerprint: "sha256:fixture" };
  },
  async listWorkbenchBootstrap() {
    observerOffCounters.snapshotBootstrap += 1;
    return bootstrapResult(snapshotItem, { storageMode: "snapshot-adapter", storageBackend: "file", revision: 33 });
  },
};
const observerOff = await request({
  primary: observerOffPrimary,
  snapshot: observerOffSnapshot,
  counters: observerOffCounters,
  env: { MES_DOMAIN_STORAGE: "postgres", MES_ENABLE_PLANNING_SNAPSHOT_OBSERVER: "off" },
});
assert(observerOff.statusCode === 200 && observerOff.json.item?.quantity === 12, "disabled observer must retain the established generic PostgreSQL route");
assert(observerOffCounters.atomic === 0 && observerOffCounters.health === 1 && observerOffCounters.normalBootstrap === 1, "disabled observer must not call the atomic route");
assert(observerOffCounters.snapshotFactory === 1 && observerOffCounters.snapshotHealth >= 1, "disabled observer must retain snapshot-health parity verification");

console.log("Planning workbench atomic bootstrap QA: OK");
