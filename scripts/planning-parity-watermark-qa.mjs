import { inspectPlanningProjectionSafety, readPlanningProjectionSafely } from "./domain-api.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeItem({
  plannedStart = "2026-07-18T08:00:00.000Z",
  plannedEnd = "2026-07-18T09:00:00.000Z",
  updatedAt = "2026-07-18T08:00:00.000Z",
} = {}) {
  return {
    id: "route-1",
    number: "WO-001",
    name: "Изделие",
    designation: "АБВГ.001",
    quantity: 10,
    unit: "шт.",
    lifecycleStatus: "released",
    planningStatus: "scheduled",
    revision: 3,
    concurrencyRevision: 3,
    operationCount: 1,
    scheduledOperationCount: 1,
    updatedAt,
    metadata: { id: "route-1", specificationName: "Изделие", planningQuantity: 10, updatedAt },
    operations: [{
      id: "operation-1",
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "D3",
      nextWorkCenterId: "D4",
      quantityMultiplier: 1,
      executionContext: { calculationType: "normative", unitsPerHour: 55 },
      labor: { setupMin: 4 },
      metadata: { id: "operation-1", routeId: "route-1", stepOrder: 1 },
      slot: {
        id: "slot-1",
        plannedStart,
        plannedEnd,
        status: "planned",
        quantity: 10,
        isLocked: false,
        metadata: { id: "slot-1", routeId: "route-1", routeStepId: "operation-1" },
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

function createRepository({ backend, itemRef, healthRef, counters, markerRef = null, hooks = {} }) {
  const metadata = {
    storageMode: backend === "postgresql" ? "postgres" : "snapshot-adapter",
    storageBackend: backend,
    configured: true,
  };
  const repository = {
    async health() {
      counters.health += 1;
      return { ...metadata, ...healthRef.current };
    },
    async list() {
      counters.list += 1;
      await hooks.onList?.();
      return { ...metadata, ...healthRef.current, items: [listItem(itemRef.current)] };
    },
    async get(id) {
      counters.get += 1;
      return { ...metadata, ...healthRef.current, item: String(id) === "route-1" ? itemRef.current : null };
    },
  };
  if (markerRef) {
    repository.getPlanningProjectionParityState = async () => {
      counters.markerRead += 1;
      if (markerRef.throwOnRead) throw new Error("marker unavailable");
      return { ...markerRef.current };
    };
    repository.markPlanningProjectionParity = async ({ primaryRevision, snapshotFingerprint, contractVersion }) => {
      counters.markerWrite += 1;
      if (Number(primaryRevision) !== Number(markerRef.current.primaryRevision)) return false;
      markerRef.current = {
        ...markerRef.current,
        verifiedPrimaryRevision: Number(primaryRevision),
        verifiedSnapshotFingerprint: String(snapshotFingerprint),
        verifiedContractVersion: Number(contractVersion),
      };
      return true;
    };
  }
  return repository;
}

const snapshotLocalStart = "2026-07-18T08:00:00";
const snapshotLocalEnd = "2026-07-18T09:00:00";
const primaryUtcStart = new Date(snapshotLocalStart).toISOString();
const primaryUtcEnd = new Date(snapshotLocalEnd).toISOString();
const primaryItem = { current: makeItem({ plannedStart: primaryUtcStart, plannedEnd: primaryUtcEnd, updatedAt: "2026-07-18T08:00:00.000Z" }) };
const snapshotItem = { current: makeItem({ plannedStart: snapshotLocalStart, plannedEnd: snapshotLocalEnd, updatedAt: "2026-07-18T08:00:00.123Z" }) };
const primaryHealth = { current: { revision: 4, updatedAt: "2026-07-18T08:00:00.000Z" } };
const snapshotHealth = {
  current: {
    revision: 10,
    updatedAt: "2026-07-18T08:00:00.000Z",
    planningProjectionFingerprint: "sha256:planning-a",
  },
};
const primaryCounters = { health: 0, list: 0, get: 0, markerRead: 0, markerWrite: 0 };
const snapshotCounters = { health: 0, list: 0, get: 0, markerRead: 0, markerWrite: 0 };
const markerRef = {
  current: {
    primaryRevision: 7,
    verifiedPrimaryRevision: null,
    verifiedSnapshotFingerprint: "",
    verifiedContractVersion: 0,
  },
  throwOnRead: false,
};
const primaryHooks = {};
const primary = createRepository({ backend: "postgresql", itemRef: primaryItem, healthRef: primaryHealth, counters: primaryCounters, markerRef, hooks: primaryHooks });
const snapshot = createRepository({ backend: "file", itemRef: snapshotItem, healthRef: snapshotHealth, counters: snapshotCounters });
const factory = async ({ env }) => String(env.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? snapshot : primary;

async function inspect(filePath) {
  return inspectPlanningProjectionSafety({
    primary,
    primaryHealth: await primary.health(),
    env: { MES_DOMAIN_STORAGE: "postgres" },
    filePath,
    createRepository: factory,
  });
}

// Legacy strings intentionally omit an offset, while PostgreSQL returns the
// same instant in canonical UTC.  Both granular details and the reconstructed
// runtime projection must treat that representation-only difference as equal.
// First visit has no proof: it must perform the full comparison and write an
// epoch/fingerprint checkpoint only after it succeeds.
const first = await inspect("planning-parity-watermark-initial");
assert(first.repository === primary && first.parity.matches, "equivalent local and UTC slot timestamps must use PostgreSQL");
assert(first.readVerification?.primaryRevision === 7, "successful full proof must bind a verification token to the primary epoch");
assert(primaryCounters.list === 1 && primaryCounters.get === 1, "initial proof must execute aggregate list/detail reads");
assert(markerRef.current.verifiedPrimaryRevision === 7 && markerRef.current.verifiedSnapshotFingerprint === "sha256:planning-a", "successful proof must persist the exact epoch and planning fingerprint");
assert(markerRef.current.verifiedContractVersion === 5, "marker must bind the current parity contract");

// An unrelated shared-state version bump must not re-run full parity: only the
// planning payload fingerprint participates in the durable checkpoint.
snapshotHealth.current = { ...snapshotHealth.current, revision: 11, updatedAt: "2026-07-18T08:02:00.000Z" };
const beforeTrustedReads = { primaryList: primaryCounters.list, primaryGet: primaryCounters.get };
const trusted = await inspect("planning-parity-watermark-unrelated-snapshot-change");
assert(trusted.repository === primary && trusted.parity.skipped === "verified-projection-marker", "valid marker must skip the costly full comparison");
assert(primaryCounters.list === beforeTrustedReads.primaryList && primaryCounters.get === beforeTrustedReads.primaryGet, "trusted marker must not call aggregate list/detail reads");

// The bounded runtime projection makes split-slot selection deterministic.
// A durable marker from the unordered v4 detail contract cannot skip the
// proof even when its epoch and fingerprint still match exactly.
markerRef.current = { ...markerRef.current, verifiedContractVersion: 4 };
const beforeContractUpgradeReads = { primaryList: primaryCounters.list, primaryGet: primaryCounters.get };
const contractUpgrade = await inspect("planning-parity-watermark-contract-upgrade");
assert(contractUpgrade.repository === primary && contractUpgrade.parity.matches && contractUpgrade.parity.skipped !== "verified-projection-marker", "an earlier projection contract marker must force a fresh parity proof");
assert(primaryCounters.list === beforeContractUpgradeReads.primaryList + 1 && primaryCounters.get === beforeContractUpgradeReads.primaryGet + 1, "an earlier projection contract marker must not bypass aggregate verification");
assert(markerRef.current.verifiedContractVersion === 5, "fresh parity proof must replace an earlier projection contract marker");

// A planning-value replacement invalidates the marker even if the global
// snapshot version is not the signal being trusted.  Full parity refreshes it.
snapshotHealth.current = { ...snapshotHealth.current, planningProjectionFingerprint: "sha256:planning-b" };
const beforeSnapshotChangeReads = primaryCounters.list;
const refreshed = await inspect("planning-parity-watermark-planning-change");
assert(refreshed.repository === primary && refreshed.parity.matches, "matching changed planning payload must re-prove before PostgreSQL is used");
assert(primaryCounters.list === beforeSnapshotChangeReads + 1, "planning fingerprint change must trigger a full comparison");
assert(markerRef.current.verifiedSnapshotFingerprint === "sha256:planning-b", "fresh full proof must replace the checkpoint fingerprint");

// A direct PostgreSQL planning write increments the trigger epoch.  It cannot
// reuse an old proof, and a changed slot start must drive a snapshot fallback.
markerRef.current = { ...markerRef.current, primaryRevision: 8 };
primaryItem.current = makeItem({ plannedStart: "2026-07-18T12:00:00.000Z" });
const stale = await inspect("planning-parity-watermark-primary-change");
assert(stale.repository === snapshot && stale.fallbackReason === "postgres-projection-stale", "primary epoch change with a moved slot must fail closed to snapshot");
assert(stale.parity?.mismatches?.[0]?.operations?.[0]?.fields?.includes("slot.plannedStart"), "slot start differences must be part of the durable parity proof");

// A marker read failure is never trusted. Even a complete comparison cannot
// bind a later endpoint read to its proof without a durable checkpoint, so
// the compatibility snapshot remains the fail-closed source.
primaryItem.current = snapshotItem.current;
markerRef.current = { ...markerRef.current, primaryRevision: 9 };
markerRef.throwOnRead = true;
const beforeUnavailableReads = primaryCounters.list;
const unavailable = await inspect("planning-parity-watermark-marker-unavailable");
assert(unavailable.repository === snapshot && unavailable.fallbackReason === "postgres-projection-stale", "unavailable marker storage must fail closed to the snapshot");
assert(primaryCounters.list === beforeUnavailableReads + 1, "unavailable marker storage must not skip parity reads");

// A matching marker is only an admission ticket for the primary read, not a
// proof for bytes returned later. Simulate a direct PostgreSQL write exactly
// while a trusted endpoint is reading its list: the wrapper must discard the
// changed primary result, force a fresh proof and return the snapshot.
markerRef.throwOnRead = false;
primaryItem.current = makeItem({ plannedStart: "2026-07-18T08:00:00.000Z" });
snapshotItem.current = makeItem({ plannedStart: "2026-07-18T08:00:00.000Z" });
markerRef.current = {
  primaryRevision: 10,
  verifiedPrimaryRevision: 10,
  verifiedSnapshotFingerprint: "sha256:planning-b",
  verifiedContractVersion: 5,
};
let mutateDuringPrimaryRead = true;
primaryHooks.onList = async () => {
  if (!mutateDuringPrimaryRead) return;
  mutateDuringPrimaryRead = false;
  primaryItem.current = { ...makeItem({ plannedStart: "2026-07-18T12:00:00.000Z" }), quantity: 99 };
  markerRef.current = { ...markerRef.current, primaryRevision: 11 };
};
const beforeReadSafety = await inspect("planning-parity-watermark-read-race");
assert(beforeReadSafety.repository === primary && beforeReadSafety.readVerification, "matching marker must issue a read verification token");
let forcedProofs = 0;
const guardedRead = await readPlanningProjectionSafely({
  planningSafety: beforeReadSafety,
  getPlanningSafety: async ({ forceFullParity = false } = {}) => {
    if (forceFullParity) forcedProofs += 1;
    return inspect("planning-parity-watermark-read-race");
  },
  read: (repository) => repository.list(),
});
assert(forcedProofs === 1, "a marker move during the primary read must force a fresh proof");
assert(guardedRead.planningSafety.fallbackReason === "postgres-projection-stale", "a changed primary result must fail closed after revalidation");
assert(guardedRead.result.items?.[0]?.quantity === 10, "the stale primary response must be discarded in favour of the snapshot");
primaryHooks.onList = null;

console.log("Planning parity watermark QA: OK");
