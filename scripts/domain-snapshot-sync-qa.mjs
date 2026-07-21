import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";
import { inspectDomainSnapshotSyncOutcome } from "./domain-snapshot-sync-runner.mjs";
import { createWorkOrdersRepository, PLANNING_STATE_KEY } from "./domain-work-orders-repository.mjs";

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

const startDateMarks = [];
const startDateResult = await syncPendingSnapshotChanges({
  primary: {
    async listPendingSnapshotSyncs() {
      return [{ id: 4, aggregateId: "WO-1", aggregateRevision: 8, commandType: "change_start_date", payload: { expectedRevision: 7, planningStartDate: "2026-07-22" } }];
    },
    async get() { return { item: { concurrencyRevision: 8, planningStartDate: "2026-07-22", operations: [] } }; },
    async markSnapshotSync(id, mark) { startDateMarks.push({ id, ...mark }); },
  },
  snapshot: {
    async applyServerStartDateProjection(id, projection) {
      assert(id === "WO-1" && projection.expectedRevision === 7 && projection.targetRevision === 8, "start-date sync must preserve its concurrency boundary");
      assert(projection.planningStartDate === "2026-07-22", "start-date sync must mirror the authoritative anchor without moving slots");
      return { applied: true, conflict: false };
    },
  },
});
assert(startDateResult.applied === 1 && startDateMarks[0]?.state === "applied", "start-date delivery must close its outbox row");

const clearDateMarks = [];
const clearDateResult = await syncPendingSnapshotChanges({
  primary: {
    async listPendingSnapshotSyncs() {
      return [{ id: 41, aggregateId: "WO-1", aggregateRevision: 9, commandType: "change_start_date", payload: { expectedRevision: 8, planningStartDate: null } }];
    },
    async get() { return { item: { concurrencyRevision: 9, planningStartDate: null, operations: [] } }; },
    async markSnapshotSync(id, mark) { clearDateMarks.push({ id, ...mark }); },
  },
  snapshot: {
    async applyServerStartDateProjection(id, projection) {
      assert(id === "WO-1" && projection.expectedRevision === 8 && projection.targetRevision === 9,
        "clear sync must preserve its concurrency boundary");
      assert(Object.prototype.hasOwnProperty.call(projection, "planningStartDate") && projection.planningStartDate === null,
        "clear sync must propagate explicit null without collapsing it to missing/empty");
      return { applied: true, conflict: false };
    },
  },
});
assert(clearDateResult.applied === 1 && clearDateMarks[0]?.state === "applied",
  "nullable start-date delivery must close its outbox row");

for (const payload of [{ expectedRevision: 9 }, { expectedRevision: 9, planningStartDate: "" }, { expectedRevision: 9, planningStartDate: 20260722 }]) {
  let projectionCalls = 0;
  const invalidMarks = [];
  const invalidClearResult = await syncPendingSnapshotChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 42, aggregateId: "WO-1", aggregateRevision: 10, commandType: "change_start_date", payload }]; },
      async get() { return { item: { concurrencyRevision: 10, planningStartDate: null } }; },
      async markSnapshotSync(id, mark) { invalidMarks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerStartDateProjection() { projectionCalls += 1; return { applied: true }; } },
  });
  assert(invalidClearResult.conflicts === 1 && projectionCalls === 0 && invalidMarks[0]?.state === "conflict",
    "missing, empty and non-string outbox values must not be interpreted as a clear");
}

let impossibleProjectionCalls = 0;
const impossibleStartDateMarks = [];
const impossibleStartDateResult = await syncPendingSnapshotChanges({
  primary: {
    async listPendingSnapshotSyncs() {
      return [{ id: 5, aggregateId: "WO-1", aggregateRevision: 9, commandType: "change_start_date", payload: { expectedRevision: 8, planningStartDate: "2026-02-31" } }];
    },
    async get() { return { item: { concurrencyRevision: 9, planningStartDate: "2026-03-03" } }; },
    async markSnapshotSync(id, mark) { impossibleStartDateMarks.push({ id, ...mark }); },
  },
  snapshot: {
    async applyServerStartDateProjection() { impossibleProjectionCalls += 1; return { applied: true }; },
  },
});
assert(impossibleStartDateResult.conflicts === 1 && impossibleProjectionCalls === 0
  && impossibleStartDateMarks[0]?.state === "conflict",
"an impossible date in the outbox must fail closed instead of being normalised into snapshot storage");

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

// A transient first delivery failure must not poison the next revision. On a
// later run the immutable start-date jobs are replayed in order into the real
// legacy-compatible snapshot adapter, even though PostgreSQL is already at
// the newest revision. Exact route ids win over colliding legacy numbers.
const recoveryDirectory = await mkdtemp(join(tmpdir(), "mes-planning-start-date-backlog-"));
const recoveryFile = join(recoveryDirectory, "shared-state.json");
try {
  const canonicalRouteId = "route-canonical";
  const aliasRouteId = "legacy-alias";
  const canonicalSlotStart = "2026-07-22T08:00:00.000Z";
  const canonicalSlotEnd = "2026-07-22T09:00:00.000Z";
  const recoveredSlotStart = "2026-07-22T10:00:00.000Z";
  const recoveredSlotEnd = "2026-07-22T11:00:00.000Z";
  const planning = {
    routes: [
      {
        id: aliasRouteId,
        name: "Коллизия legacy number",
        planningQuantity: 5,
        planningStartDate: "2026-06-01",
        domainConcurrencyRevision: 99,
        workOrderSnapshot: { id: canonicalRouteId, quantity: 5 },
      },
      {
        id: canonicalRouteId,
        name: "Канонический заказ",
        planningQuantity: 10,
        planningStartDate: "2026-07-21",
        domainConcurrencyRevision: 7,
        workOrderSnapshot: { id: "WO-CANONICAL", quantity: 10 },
      },
    ],
    routeSteps: [
      { id: "step-alias", routeId: aliasRouteId, operationId: "OP-A", operationName: "Alias" },
      { id: "step-canonical", routeId: canonicalRouteId, operationId: "OP-C", operationName: "Canonical" },
    ],
    slots: [
      { id: "slot-shared", routeId: aliasRouteId, routeStepId: "step-alias", plannedStart: "2026-06-01T08:00:00.000Z", plannedEnd: "2026-06-01T09:00:00.000Z", quantity: 5 },
      { id: "slot-shared", routeId: canonicalRouteId, routeStepId: "step-canonical", plannedStart: canonicalSlotStart, plannedEnd: canonicalSlotEnd, quantity: 10 },
    ],
  };
  await writeFile(recoveryFile, JSON.stringify({ version: 1, values: { [PLANNING_STATE_KEY]: JSON.stringify(planning) } }), "utf8");
  const recoverySnapshot = createWorkOrdersRepository({ filePath: recoveryFile });
  const backlog = [
    { id: 81, aggregateType: "work_order", aggregateId: canonicalRouteId, aggregateRevision: 8, commandType: "change_start_date", payload: { expectedRevision: 7, planningStartDate: "2026-07-24" } },
    { id: 82, aggregateType: "work_order", aggregateId: canonicalRouteId, aggregateRevision: 9, commandType: "change_quantity", payload: { expectedRevision: 8, quantity: 12 } },
    { id: 83, aggregateType: "work_order", aggregateId: canonicalRouteId, aggregateRevision: 10, commandType: "change_start_date", payload: { expectedRevision: 9, planningStartDate: "2026-07-25" } },
    { id: 84, aggregateType: "work_order", aggregateId: canonicalRouteId, aggregateRevision: 11, commandType: "change_slot_schedule", payload: { expectedRevision: 10, operationId: "step-canonical", plannedStart: "2026-07-22T10:00:00.000Z" } },
    { id: 85, aggregateType: "work_order", aggregateId: canonicalRouteId, aggregateRevision: 12, commandType: "change_start_date", payload: { expectedRevision: 11, planningStartDate: null } },
  ];
  const recoveryMarks = [];
  const recoveryBulkMarks = [];
  const recoveryPrimary = {
    async listPendingSnapshotSyncs() { return backlog; },
    async listPendingSnapshotSyncsForAggregate() { return backlog; },
    async get() {
      return {
        item: {
          id: canonicalRouteId,
          quantity: 12,
          concurrencyRevision: 12,
          planningStartDate: null,
          operations: [{
            id: "step-canonical",
            slot: {
              id: "slot-shared",
              quantity: 12,
              plannedStart: recoveredSlotStart,
              plannedEnd: recoveredSlotEnd,
              status: "planned",
              isLocked: false,
            },
          }],
        },
      };
    },
    async markSnapshotSync(id, mark) { recoveryMarks.push({ id, ...mark }); },
    async markSnapshotSyncs(ids, mark) {
      recoveryBulkMarks.push({ ids: [...ids], ...mark });
      recoveryMarks.push(...ids.map((id) => ({ id, ...mark })));
    },
  };
  let firstProjection = true;
  const firstAttempt = await syncPendingSnapshotChanges({
    primary: recoveryPrimary,
    snapshot: {
      ...recoverySnapshot,
      async applyServerAggregateProjection(...args) {
        if (firstProjection) { firstProjection = false; throw new Error("temporary compatibility outage"); }
        return recoverySnapshot.applyServerAggregateProjection(...args);
      },
    },
  });
  assert(firstAttempt.failed === 1 && firstAttempt.skipped === 4
    && recoveryMarks.length === 1 && recoveryMarks[0]?.id === 81 && recoveryMarks[0]?.state === "pending",
  "a retryable earlier revision must leave every later revision for the same aggregate pending");

  recoveryMarks.length = 0;
  const recoveredBacklog = await syncPendingSnapshotChanges({ primary: recoveryPrimary, snapshot: recoverySnapshot });
  const canonicalReadBack = await recoverySnapshot.get(canonicalRouteId);
  const aliasReadBack = await recoverySnapshot.get(aliasRouteId);
  assert(recoveredBacklog.applied === 5 && recoveredBacklog.conflicts === 0
    && recoveryMarks.map((mark) => `${mark.id}:${mark.state}`).join(",") === "81:applied,82:applied,83:applied,84:applied,85:applied",
  "a safe latest-state rebase must recover interleaved date, quantity and slot revisions without terminal conflicts");
  assert(recoveryBulkMarks.length === 1 && recoveryBulkMarks[0].ids.join(",") === "81,82,83,84,85",
    "a coalesced compatibility page must close through one atomic PostgreSQL receipt update");
  assert(canonicalReadBack.item?.planningStartDate === null
    && canonicalReadBack.item?.quantity === 12
    && canonicalReadBack.item?.concurrencyRevision === 12
    && canonicalReadBack.item?.operations?.[0]?.slot?.quantity === 12
    && canonicalReadBack.item?.operations?.[0]?.slot?.plannedStart === recoveredSlotStart
    && canonicalReadBack.item?.operations?.[0]?.slot?.plannedEnd === recoveredSlotEnd,
  "legacy-compatible snapshot read-back must expose the complete newest nullable owner aggregate after an interleaved backlog");
  const recoveredState = JSON.parse(JSON.parse(await readFile(recoveryFile, "utf8")).values[PLANNING_STATE_KEY]);
  const recoveredRoute = recoveredState.routes.find((route) => route.id === canonicalRouteId);
  assert(recoveredRoute && !Object.prototype.hasOwnProperty.call(recoveredRoute, "planningStartDate"),
    "set -> clear snapshot recovery must remove the legacy route field instead of storing null/empty");
  assert(aliasReadBack.item?.planningStartDate === "2026-06-01" && aliasReadBack.item?.concurrencyRevision === 99,
    "an exact canonical route id must win over a colliding legacy work-order number");

  const mirroredQuantity = await recoverySnapshot.applyServerQuantityProjection(canonicalRouteId, {
    expectedRevision: 12,
    targetRevision: 13,
    quantity: 12,
    operations: [{ slot: { id: "slot-shared", quantity: 12, plannedStart: recoveredSlotStart, plannedEnd: recoveredSlotEnd } }],
  });
  const mirroredSlot = await recoverySnapshot.applyServerSlotScheduleProjection(canonicalRouteId, {
    expectedRevision: 13,
    targetRevision: 14,
    slot: { id: "slot-shared", plannedStart: recoveredSlotStart, plannedEnd: recoveredSlotEnd },
  });
  const collisionSnapshot = JSON.parse(await readFile(recoveryFile, "utf8"));
  const collisionPlanning = JSON.parse(collisionSnapshot.values[PLANNING_STATE_KEY]);
  const aliasRoute = collisionPlanning.routes.find((route) => route.id === aliasRouteId);
  const aliasSlot = collisionPlanning.slots.find((slot) => slot.routeId === aliasRouteId);
  assert(mirroredQuantity.applied && mirroredSlot.applied
    && aliasRoute?.planningQuantity === 5 && aliasRoute?.domainConcurrencyRevision === 99
    && aliasSlot?.quantity === 5 && aliasSlot?.plannedStart === "2026-06-01T08:00:00.000Z",
  "quantity and slot mirrors must also update only the exact resolved route under id/number collisions");
} finally {
  await rm(recoveryDirectory, { recursive: true, force: true });
}

// A compatibility projection is itself the durable cross-store receipt. This
// proves both pagination beyond the worker limit and recovery from the old
// failure mode where a process stopped after marking only the first N rows.
const receiptDirectory = await mkdtemp(join(tmpdir(), "mes-planning-snapshot-receipt-"));
const receiptFile = join(receiptDirectory, "shared-state.json");
try {
  const routeId = "route-receipt";
  const initialPlanning = {
    routes: [{
      id: routeId,
      name: "Receipt QA",
      planningQuantity: 7,
      planningStartDate: "2026-07-21",
      domainConcurrencyRevision: 7,
      workOrderSnapshot: { id: "WO-RECEIPT", quantity: 7 },
    }],
    routeSteps: [{ id: "step-receipt", routeId, operationId: "OP-R", operationName: "Receipt" }],
    slots: [{
      id: "slot-receipt",
      routeId,
      routeStepId: "step-receipt",
      plannedStart: "2026-07-21T08:00:00.000Z",
      plannedEnd: "2026-07-21T09:00:00.000Z",
      quantity: 7,
      status: "planned",
      locked: false,
    }],
  };
  await writeFile(receiptFile, JSON.stringify({ version: 1, values: { [PLANNING_STATE_KEY]: JSON.stringify(initialPlanning) } }), "utf8");
  const receiptSnapshot = createWorkOrdersRepository({ filePath: receiptFile });
  const finalItem = {
    id: routeId,
    quantity: 37,
    concurrencyRevision: 37,
    planningStartDate: "2026-08-20",
    operations: [{
      id: "step-receipt",
      slot: {
        id: "slot-receipt",
        quantity: 37,
        plannedStart: "2026-08-20T10:00:00.000Z",
        plannedEnd: "2026-08-20T11:00:00.000Z",
        status: "planned",
        isLocked: false,
      },
    }],
  };
  const allJobs = Array.from({ length: 30 }, (_, index) => {
    const targetRevision = index + 8;
    const commandType = ["change_start_date", "change_quantity", "change_slot_schedule"][index % 3];
    const payload = commandType === "change_start_date"
      ? { expectedRevision: targetRevision - 1, planningStartDate: `2026-08-${String((index % 28) + 1).padStart(2, "0")}` }
      : commandType === "change_quantity"
        ? { expectedRevision: targetRevision - 1, quantity: targetRevision }
        : { expectedRevision: targetRevision - 1, operationId: "step-receipt", plannedStart: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z` };
    return { id: 200 + index, aggregateType: "work_order", aggregateId: routeId, aggregateRevision: targetRevision, commandType, payload };
  });
  const pendingIds = new Set(allJobs.map((job) => job.id));
  const bulkReceipts = [];
  const pagedPrimary = {
    async listPendingSnapshotSyncs(limit) { return allJobs.filter((job) => pendingIds.has(job.id)).slice(0, limit); },
    async listPendingSnapshotSyncsForAggregate() { return allJobs.filter((job) => pendingIds.has(job.id)); },
    async get() { return { item: structuredClone(finalItem) }; },
    async markSnapshotSync(id, mark) {
      if (mark.state === "applied") pendingIds.delete(id);
    },
    async markSnapshotSyncs(ids, mark) {
      bulkReceipts.push([...ids]);
      if (mark.state === "applied") ids.forEach((id) => pendingIds.delete(id));
    },
  };
  const pageOne = await syncPendingSnapshotChanges({ primary: pagedPrimary, snapshot: receiptSnapshot, limit: 20 });
  const pageTwo = await syncPendingSnapshotChanges({ primary: pagedPrimary, snapshot: receiptSnapshot, limit: 20 });
  const pagedReadBack = await receiptSnapshot.get(routeId);
  assert(pageOne.applied === 30 && pageTwo.applied === 0
    && pageOne.conflicts === 0 && pageTwo.conflicts === 0 && pendingIds.size === 0,
  "a bounded runner page must expand to the complete aggregate chain, and a second invocation must remain clean");
  assert(bulkReceipts.length === 1 && bulkReceipts[0].length === 30,
    "the complete aggregate chain must close with one atomic outbox receipt instead of jumping beyond the fetched tail");
  assert(pagedReadBack.item?.concurrencyRevision === 37
    && pagedReadBack.item?.planningStartDate === finalItem.planningStartDate
    && pagedReadBack.item?.quantity === finalItem.quantity
    && pagedReadBack.item?.operations?.[0]?.slot?.plannedStart === finalItem.operations[0].slot.plannedStart,
  "an exact current compatibility projection must admit the next page as already applied");

  // Reset to the old snapshot and emulate an interrupted historical worker:
  // projection succeeds, then only the first two marks become visible before
  // the receipt call throws. The retry sees an exact snapshot receipt and
  // closes the remaining contiguous tail without reverting the first marks.
  await writeFile(receiptFile, JSON.stringify({ version: 1, values: { [PLANNING_STATE_KEY]: JSON.stringify(initialPlanning) } }), "utf8");
  const faultJobs = allJobs.slice(0, 5).map((job, index) => ({
    ...job,
    id: 400 + index,
    aggregateRevision: 8 + index,
    payload: { ...job.payload, expectedRevision: 7 + index },
  }));
  const faultFinalItem = { ...finalItem, concurrencyRevision: 12 };
  const faultPending = new Set(faultJobs.map((job) => job.id));
  let injectPartialFailure = true;
  const faultPrimary = {
    async listPendingSnapshotSyncs(limit) { return faultJobs.filter((job) => faultPending.has(job.id)).slice(0, limit); },
    async listPendingSnapshotSyncsForAggregate() { return faultJobs.filter((job) => faultPending.has(job.id)); },
    async get() { return { item: structuredClone(faultFinalItem) }; },
    async markSnapshotSync() {},
    async markSnapshotSyncs(ids, mark) {
      if (injectPartialFailure) {
        injectPartialFailure = false;
        ids.slice(0, 2).forEach((id) => faultPending.delete(id));
        throw new Error("injected failure after two historical marks");
      }
      if (mark.state === "applied") ids.forEach((id) => faultPending.delete(id));
    },
  };
  const interrupted = await syncPendingSnapshotChanges({ primary: faultPrimary, snapshot: receiptSnapshot, limit: 20 });
  const resumed = await syncPendingSnapshotChanges({ primary: faultPrimary, snapshot: receiptSnapshot, limit: 20 });
  assert(interrupted.failed === 1 && faultPending.size === 0 && resumed.applied === 3 && resumed.conflicts === 0,
    "a failure after N historical marks must converge through exact snapshot receipt read-back on retry");
} finally {
  await rm(receiptDirectory, { recursive: true, force: true });
}

const planningConflictOutcome = inspectDomainSnapshotSyncOutcome({
  failed: 0,
  workOrders: { conflicts: 2, jobs: [{ id: 701, state: "conflict" }, { id: 702, state: "conflict" }] },
  specifications2: { conflicts: 0, jobs: [] },
});
assert(planningConflictOutcome.serviceFailure === true
  && planningConflictOutcome.planningConflictIds.join(",") === "701,702"
  && planningConflictOutcome.planningConflictMessage.includes("701,702"),
"terminal Planning compatibility conflicts must fail the worker and name their outbox IDs");
const specificationsConflictOutcome = inspectDomainSnapshotSyncOutcome({
  failed: 0,
  workOrders: { conflicts: 0, jobs: [] },
  specifications2: { conflicts: 1, jobs: [{ id: 801, state: "conflict" }] },
});
assert(specificationsConflictOutcome.serviceFailure === false,
  "Planning observability must not silently redefine the established Specifications2 conflict policy");
assert(inspectDomainSnapshotSyncOutcome({ failed: 1, workOrders: { conflicts: 0, jobs: [] } }).serviceFailure === true,
  "retryable delivery failures must continue to fail the worker invocation");

console.log("Domain snapshot sync QA: OK");
