import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const marks = [];
const primary = {
  async listPendingSnapshotSyncs() {
    return [{ id: 1, aggregateId: "WO-1", aggregateRevision: 6, commandType: "change_quantity", payload: { expectedRevision: 5, quantity: 30 } }];
  },
  async get() {
    return { item: { concurrencyRevision: 6, operations: [{ slot: { id: "slot-1", quantity: 30 } }] } };
  },
  async markSnapshotSync(id, mark) { marks.push({ id, ...mark }); },
};
const snapshot = {
  async applyServerQuantityProjection(id, projection) {
    assert(id === "WO-1" && projection.expectedRevision === 5 && projection.targetRevision === 6, "sync must preserve the command concurrency boundary");
    return { applied: true, conflict: false };
  },
};
const result = await syncPendingSnapshotChanges({ primary, snapshot });
assert(result.applied === 1 && result.conflicts === 0 && marks[0]?.state === "applied", "successful delivery must close the outbox row");

const conflict = await syncPendingSnapshotChanges({
  primary: { ...primary, async get() { return { item: { concurrencyRevision: 7, operations: [] } }; } },
  snapshot,
});
assert(conflict.conflicts === 1 && marks.at(-1)?.state === "conflict", "a changed authoritative revision must not overwrite a newer snapshot");

const scheduleMarks = [];
const scheduleResult = await syncPendingSnapshotChanges({
  primary: {
    async listPendingSnapshotSyncs() {
      return [{ id: 2, aggregateId: "WO-1", aggregateRevision: 7, commandType: "change_slot_schedule", payload: { expectedRevision: 6, operationId: "op-1", plannedStart: "2026-07-18T08:00:00.000Z" } }];
    },
    async get() {
      return { item: { concurrencyRevision: 7, operations: [{ id: "op-1", slot: { id: "slot-1", plannedStart: "2026-07-18T08:00:00.000Z", plannedEnd: "2026-07-18T10:00:00.000Z" } }] } };
    },
    async markSnapshotSync(id, mark) { scheduleMarks.push({ id, ...mark }); },
  },
  snapshot: {
    async applyServerSlotScheduleProjection(id, projection) {
      assert(id === "WO-1" && projection.expectedRevision === 6 && projection.targetRevision === 7, "schedule sync must preserve its concurrency boundary");
      assert(projection.slot?.id === "slot-1" && projection.slot?.plannedEnd === "2026-07-18T10:00:00.000Z", "schedule sync must mirror the authoritative slot projection");
      return { applied: true, conflict: false };
    },
  },
});
assert(scheduleResult.applied === 1 && scheduleMarks[0]?.state === "applied", "slot schedule delivery must close its outbox row");

const createMarks = [];
const createResult = await syncPendingSnapshotChanges({
  primary: {
    async listPendingSnapshotSyncs() { return [{ id: 3, aggregateId: "WO-S2-1", aggregateRevision: 1, commandType: "create_from_specifications2_revision", payload: { sourceEntryId: "spec-entry", sourceRevision: 6, routeSourceDraftId: "draft-1" } }]; },
    async get() { return { item: { id: "WO-S2-1", quantity: 12, concurrencyRevision: 1, operations: [{ id: "op-1", operationId: "OP-1", name: "Монтаж", workCenterId: "D1", labor: { mode: "unit", minutesPerUnit: 5 } }] } }; },
    async markSnapshotSync(id, mark) { createMarks.push({ id, ...mark }); },
  },
  snapshot: {
    async applyServerWorkOrderProjection(id, projection) {
      assert(id === "WO-S2-1" && projection.targetRevision === 1 && projection.source.quantity === 12, "create sync must mirror the authoritative order projection");
      assert(projection.source.sourceEntryId === "spec-entry" && projection.operations.length === 1, "create sync must preserve immutable source linkage");
      return { applied: true, conflict: false };
    },
  },
});
assert(createResult.applied === 1 && createMarks[0]?.state === "applied", "create-order delivery must close its outbox row");

console.log("Domain snapshot sync QA: OK");
