import { inspectPlanningProjectionSafety, readPlanningProjectionSafely } from "./domain-api.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const CONTRACT_VERSION = 5;
const FINGERPRINT = "sha256:planning-observed";

function makeItem({ quantity = 10 } = {}) {
  return {
    id: "route-observed",
    number: "WO-OBSERVED",
    name: "Изделие",
    designation: "АБВГ.024",
    quantity,
    unit: "шт.",
    lifecycleStatus: "released",
    planningStatus: "scheduled",
    revision: 3,
    concurrencyRevision: 3,
    operationCount: 1,
    scheduledOperationCount: 1,
    metadata: { id: "route-observed", planningQuantity: quantity },
    operations: [{
      id: "operation-observed",
      operationId: "OP-OBSERVED",
      name: "Монтаж",
      workCenterId: "D3",
      nextWorkCenterId: "D4",
      quantityMultiplier: 1,
      executionContext: { calculationType: "normative", unitsPerHour: 40, setupMin: 0, boardsPerPanel: 1, secondsPerPanel: 0, resourceId: "", bomListId: "", isWarehouseOperation: false },
      labor: {},
      metadata: { id: "operation-observed" },
      slot: {
        id: "slot-observed",
        plannedStart: "2026-07-18T08:00:00.000Z",
        plannedEnd: "2026-07-18T09:00:00.000Z",
        status: "planned",
        quantity,
        isLocked: false,
        metadata: { id: "slot-observed" },
      },
    }],
  };
}

function listItem(item) {
  return {
    id: item.id,
    number: item.number,
    name: item.name,
    designation: item.designation,
    quantity: item.quantity,
    unit: item.unit,
    lifecycleStatus: item.lifecycleStatus,
    planningStatus: item.planningStatus,
    revision: item.revision,
    concurrencyRevision: item.concurrencyRevision,
    operationCount: item.operationCount,
    scheduledOperationCount: item.scheduledOperationCount,
    metadata: item.metadata,
  };
}

function createFixture({ state = "observed", recordSucceeds = true } = {}) {
  const primaryItem = { current: makeItem() };
  const snapshotItem = { current: makeItem() };
  const counters = {
    primaryHealth: 0,
    primaryList: 0,
    primaryGet: 0,
    bootstrap: 0,
    markerRead: 0,
    markerBegin: 0,
    markerRecord: 0,
    markerMark: 0,
    snapshotHealth: 0,
    snapshotList: 0,
    snapshotGet: 0,
  };
  const marker = {
    current: {
      observationAvailable: true,
      primaryRevision: 31,
      verifiedPrimaryRevision: state === "observed" ? 31 : null,
      verifiedSnapshotFingerprint: state === "observed" ? FINGERPRINT : "",
      verifiedSnapshotGeneration: state === "observed" ? 17 : null,
      verifiedContractVersion: state === "observed" ? CONTRACT_VERSION : 0,
      snapshotGeneration: 17,
      snapshotObservationState: state,
      observedSnapshotVersion: 44,
      observedSnapshotFingerprint: FINGERPRINT,
    },
  };
  let mutatePrimaryDuringRead = false;
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true, revision: 3, updatedAt: "2026-07-18T08:00:00.000Z" };
  const primary = {
    async health() { counters.primaryHealth += 1; return metadata; },
    async getPlanningProjectionParityState() { counters.markerRead += 1; return { ...marker.current }; },
    async beginPlanningSnapshotObservation() {
      counters.markerBegin += 1;
      marker.current = {
        ...marker.current,
        snapshotGeneration: Number(marker.current.snapshotGeneration || 0) + 1,
        snapshotObservationState: "pending",
        observedSnapshotVersion: null,
        observedSnapshotFingerprint: "",
        verifiedPrimaryRevision: null,
        verifiedSnapshotFingerprint: "",
        verifiedSnapshotGeneration: null,
        verifiedContractVersion: 0,
      };
      return { primaryRevision: marker.current.primaryRevision, snapshotGeneration: marker.current.snapshotGeneration };
    },
    async recordPlanningSnapshotObservation({ snapshotGeneration, snapshotVersion, snapshotFingerprint }) {
      counters.markerRecord += 1;
      if (!recordSucceeds || Number(snapshotGeneration) !== Number(marker.current.snapshotGeneration) || marker.current.snapshotObservationState !== "pending") return false;
      marker.current = {
        ...marker.current,
        snapshotObservationState: "observed",
        observedSnapshotVersion: Number(snapshotVersion),
        observedSnapshotFingerprint: String(snapshotFingerprint),
      };
      return true;
    },
    async markPlanningProjectionParity({ primaryRevision, snapshotGeneration, snapshotFingerprint, contractVersion }) {
      counters.markerMark += 1;
      if (Number(primaryRevision) !== Number(marker.current.primaryRevision)
        || Number(snapshotGeneration) !== Number(marker.current.snapshotGeneration)
        || marker.current.snapshotObservationState !== "observed"
        || String(snapshotFingerprint) !== String(marker.current.observedSnapshotFingerprint)) return false;
      marker.current = {
        ...marker.current,
        verifiedPrimaryRevision: Number(primaryRevision),
        verifiedSnapshotGeneration: Number(snapshotGeneration),
        verifiedSnapshotFingerprint: String(snapshotFingerprint),
        verifiedContractVersion: Number(contractVersion),
      };
      return true;
    },
    async list() {
      counters.primaryList += 1;
      if (mutatePrimaryDuringRead) {
        mutatePrimaryDuringRead = false;
        marker.current = { ...marker.current, primaryRevision: marker.current.primaryRevision + 1, verifiedPrimaryRevision: null, verifiedSnapshotGeneration: null, verifiedSnapshotFingerprint: "", verifiedContractVersion: 0 };
        primaryItem.current = makeItem({ quantity: 99 });
      }
      return { ...metadata, items: [listItem(primaryItem.current)] };
    },
    async get(id) { counters.primaryGet += 1; return { ...metadata, item: String(id) === primaryItem.current.id ? primaryItem.current : null }; },
    async listWorkbenchBootstrap() { counters.bootstrap += 1; return { ...metadata, items: [listItem(primaryItem.current)], activeId: primaryItem.current.id, item: primaryItem.current }; },
  };
  const snapshotMetadata = { storageMode: "snapshot-adapter", storageBackend: "file", configured: true, revision: 44, updatedAt: "2026-07-18T08:00:00.000Z" };
  const snapshot = {
    async health() { counters.snapshotHealth += 1; return { ...snapshotMetadata, planningProjectionFingerprint: FINGERPRINT }; },
    async list() { counters.snapshotList += 1; return { ...snapshotMetadata, items: [listItem(snapshotItem.current)] }; },
    async get(id) { counters.snapshotGet += 1; return { ...snapshotMetadata, item: String(id) === snapshotItem.current.id ? snapshotItem.current : null }; },
    async listWorkbenchBootstrap() { return { ...snapshotMetadata, items: [listItem(snapshotItem.current)], activeId: snapshotItem.current.id, item: snapshotItem.current }; },
  };
  const factory = async ({ env }) => String(env.MES_DOMAIN_STORAGE || "") === "snapshot" ? snapshot : primary;
  const inspect = (forceFullParity = false) => inspectPlanningProjectionSafety({
    primary,
    primaryHealth: metadata,
    env: { MES_DOMAIN_STORAGE: "postgres", MES_ENABLE_PLANNING_SNAPSHOT_OBSERVER: "1" },
    filePath: "planning-snapshot-observation-watermark-qa",
    createRepository: factory,
    forceFullParity,
  });
  return {
    primary,
    snapshot,
    marker,
    counters,
    inspect,
    setMutatePrimaryDuringRead(value) { mutatePrimaryDuringRead = Boolean(value); },
  };
}

// An observed/verified marker must remove *all* compatibility snapshot I/O on
// the healthy read path.  The selected bootstrap remains a single compact
// PostgreSQL aggregate read and only the durable marker is rechecked after it.
const healthy = createFixture();
const healthySafety = await healthy.inspect();
assert(healthySafety.repository === healthy.primary && healthySafety.parity.skipped === "verified-snapshot-observation-marker", "observed marker must select PostgreSQL without snapshot health");
assert(healthy.counters.snapshotHealth === 0 && healthy.counters.snapshotList === 0 && healthy.counters.snapshotGet === 0, "healthy observed marker must perform zero snapshot reads before the target query");
const healthyRead = await readPlanningProjectionSafely({
  planningSafety: healthySafety,
  getPlanningSafety: () => healthy.inspect(true),
  read: (repository) => repository.listWorkbenchBootstrap(),
});
assert(healthyRead.result.item?.quantity === 10, "healthy observed marker must return the compact primary bootstrap");
assert(healthy.counters.bootstrap === 1 && healthy.counters.primaryList === 0 && healthy.counters.primaryGet === 0, "healthy observed marker must not run an aggregate parity proof");
assert(healthy.counters.snapshotHealth === 0 && healthy.counters.snapshotList === 0 && healthy.counters.snapshotGet === 0, "post-read revalidation must stay snapshot-free");
assert(healthy.counters.markerRead === 2, "healthy observed marker must read the durable marker once before and once after the target query");

// An unknown migration state must never skip the established full proof.  The
// proof itself creates a pending generation, records the snapshot only after
// comparison, and writes the verified generation atomically.
const unknown = createFixture({ state: "unknown" });
const recovered = await unknown.inspect();
assert(recovered.repository === unknown.primary && recovered.parity.matches, "unknown observation must recover only through a full parity proof");
assert(unknown.counters.snapshotHealth >= 2 && unknown.counters.primaryList === 1 && unknown.counters.primaryGet === 1, "unknown observation must retain detailed snapshot parity before trust");
assert(unknown.counters.markerBegin === 1 && unknown.counters.markerRecord === 1 && unknown.counters.markerMark === 1, "recovery must bind generation, observed fingerprint and parity marker in order");
assert(unknown.marker.current.snapshotObservationState === "observed" && unknown.marker.current.verifiedSnapshotGeneration === unknown.marker.current.snapshotGeneration, "successful recovery must leave one observed verified generation");

// If snapshot observation cannot be recorded after the comparison, fail
// closed.  The snapshot remains the read source rather than a primary result
// whose source observation is still pending.
const recordFailure = createFixture({ state: "unknown", recordSucceeds: false });
const failed = await recordFailure.inspect();
assert(failed.repository === recordFailure.snapshot && failed.fallbackReason === "postgres-projection-stale", "unrecorded snapshot observation must select the compatibility snapshot");
assert(recordFailure.marker.current.snapshotObservationState === "pending", "failed recording must keep the generation pending for a later safe recovery");

// A primary change during an admitted read invalidates the marker.  The
// returned primary bytes are discarded, the re-proof runs once, and the
// snapshot wins when the projections no longer match.
const raced = createFixture();
const racedSafety = await raced.inspect();
raced.setMutatePrimaryDuringRead(true);
let forcedProofs = 0;
const racedRead = await readPlanningProjectionSafely({
  planningSafety: racedSafety,
  getPlanningSafety: ({ forceFullParity = false } = {}) => {
    if (forceFullParity) forcedProofs += 1;
    return raced.inspect(forceFullParity);
  },
  read: (repository) => repository.list(),
});
assert(forcedProofs === 1, "marker movement during the target read must force one fresh proof");
assert(racedRead.planningSafety.fallbackReason === "postgres-projection-stale" && racedRead.result.items?.[0]?.quantity === 10, "racing primary bytes must be discarded for the compatibility snapshot");

console.log("Planning snapshot-observation watermark QA: OK");
