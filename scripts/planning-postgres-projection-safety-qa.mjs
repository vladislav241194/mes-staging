import { handleDomainApiRequest, inspectPlanningProjectionSafety } from "./domain-api.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function makeItem(resourceId) {
  return {
    id: "route-1",
    number: "WO-001",
    name: "Изделие",
    designation: "АБВГ.001",
    quantity: 10,
    unit: "шт.",
    revision: 3,
    concurrencyRevision: 3,
    operationCount: 1,
    scheduledOperationCount: 1,
    metadata: { id: "route-1", planningQuantity: 10 },
    operations: [{
      id: "operation-1",
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "D3",
      nextWorkCenterId: "D4",
      quantityMultiplier: 1,
      executionContext: { resourceId, calculationType: "normative", unitsPerHour: 55 },
      metadata: { id: "operation-1", routeId: "route-1" },
      slot: {
        id: "slot-1",
        plannedStart: "2026-07-18T08:00:00.000Z",
        plannedEnd: "2026-07-18T09:00:00.000Z",
        status: "planned",
        quantity: 10,
        isLocked: false,
        metadata: { id: "slot-1", routeId: "route-1", routeStepId: "operation-1" },
      },
    }],
  };
}

function createFixtureRepository({ storageMode, storageBackend, health, itemRef, writes, nativePeriodReads = null, nativeRuntimeProjectionReads = null, nativeGanttWindowReads = null, aggregateReads = null, markerRef = null, hooks = {} }) {
  const metadata = { storageMode, storageBackend, configured: true };
  const listProjection = () => {
    const item = itemRef.current;
    return {
      id: item.id,
      number: item.number,
      name: item.name,
      designation: item.designation,
      quantity: item.quantity,
      revision: item.revision,
      concurrencyRevision: item.concurrencyRevision,
      operationCount: item.operationCount,
      scheduledOperationCount: item.scheduledOperationCount,
      metadata: item.metadata,
    };
  };
  const repository = {
    async health() { return { ...metadata, ...health.current }; },
    async list() {
      if (aggregateReads) aggregateReads.list += 1;
      return { ...metadata, ...health.current, items: [listProjection()] };
    },
    async summary() {
      return {
        ...metadata,
        ...health.current,
        summary: {
          workOrderCount: 1,
          totalQuantity: itemRef.current.quantity,
          operationCount: 1,
          scheduledOperationCount: 1,
          unscheduledOperationCount: 0,
          byPlanningStatus: { scheduled: 1 },
          byLifecycleStatus: { released: 1 },
        },
      };
    },
    async get(id) {
      if (aggregateReads) aggregateReads.get += 1;
      await hooks.onGet?.();
      const item = String(id) === "route-1" || String(id) === "WO-001" ? itemRef.current : null;
      return { ...metadata, ...health.current, item };
    },
    async changeQuantity() {
      writes.quantity += 1;
      throw new Error("write must have been blocked by parity guard");
    },
    async changeSlotSchedule() {
      writes.slot += 1;
      throw new Error("write must have been blocked by parity guard");
    },
    async listPendingSnapshotSyncs() { return []; },
  };
  if (nativePeriodReads) {
    repository.listPeriod = async () => {
      nativePeriodReads.full += 1;
      return { ...metadata, ...health.current, items: [itemRef.current] };
    };
    repository.listWeeklyPeriodRows = async () => {
      nativePeriodReads.weekly += 1;
      const item = itemRef.current;
      const operation = item.operations[0] || {};
      const slot = operation.slot || {};
      return {
        ...metadata,
        ...health.current,
        rows: [{
          id: String(slot.id || ""),
          routeId: String(item.id || ""),
          routeStepId: String(operation.id || ""),
          plannedStart: String(slot.plannedStart || ""),
          plannedEnd: String(slot.plannedEnd || ""),
          quantity: Number(slot.quantity || item.quantity || 0),
          unit: String(item.unit || "шт."),
          workCenterId: String(operation.workCenterId || ""),
          resourceId: String(operation.executionContext?.resourceId || ""),
          status: String(slot.status || "planned"),
          locked: Boolean(slot.isLocked),
        }],
      };
    };
  }
  if (nativeRuntimeProjectionReads) {
    repository.listRuntimeProjection = async () => {
      nativeRuntimeProjectionReads.count += 1;
      return { ...metadata, ...health.current, items: [itemRef.current] };
    };
  }
  if (nativeGanttWindowReads) {
    repository.listGanttWindow = async ({ fromAt = "", toAt = "" } = {}) => {
      nativeGanttWindowReads.count += 1;
      const item = itemRef.current;
      const operation = item.operations[0] || {};
      const sourceSlot = operation.slot || {};
      const slot = {
        id: String(sourceSlot.id || ""),
        routeId: String(item.id || ""),
        routeStepId: String(operation.id || ""),
        plannedStart: String(sourceSlot.plannedStart || ""),
        plannedEnd: String(sourceSlot.plannedEnd || ""),
        status: String(sourceSlot.status || "planned"),
        quantity: Number(sourceSlot.quantity || item.quantity || 0),
        locked: Boolean(sourceSlot.isLocked),
        workCenterId: String(operation.workCenterId || ""),
        resourceId: String(operation.executionContext?.resourceId || ""),
        continuesFromPrevious: Date.parse(String(sourceSlot.plannedStart || "")) < Date.parse(String(fromAt || "")),
        continuesAfterWindow: Date.parse(String(sourceSlot.plannedEnd || "")) > Date.parse(String(toAt || "")),
      };
      return {
        ...metadata,
        ...health.current,
        window: {
          routes: [{
            id: String(item.id || ""),
            number: String(item.number || item.id || ""),
            name: String(item.name || "Заказ-наряд"),
            designation: String(item.designation || ""),
            planningQuantity: Number(item.quantity || 0),
            unit: String(item.unit || "шт."),
            lifecycleStatus: String(item.lifecycleStatus || "draft"),
            planningStatus: String(item.planningStatus || "draft"),
            domainConcurrencyRevision: Number(item.concurrencyRevision || 0),
          }],
          routeSteps: [{
            id: String(operation.id || ""),
            routeId: String(item.id || ""),
            operationId: String(operation.operationId || ""),
            operationName: String(operation.name || "Операция"),
            workCenterId: String(operation.workCenterId || ""),
            nextWorkCenterId: String(operation.nextWorkCenterId || ""),
            sequenceNo: 1,
            quantityMultiplier: Number(operation.quantityMultiplier || 1),
          }],
          slots: [slot],
          boundaryContinuations: {
            entering: slot.continuesFromPrevious ? [{ id: slot.id, routeId: slot.routeId, routeStepId: slot.routeStepId }] : [],
            leaving: slot.continuesAfterWindow ? [{ id: slot.id, routeId: slot.routeId, routeStepId: slot.routeStepId }] : [],
          },
        },
      };
    };
  }
  if (markerRef) {
    repository.getPlanningProjectionParityState = async () => ({ ...markerRef.current });
    repository.markPlanningProjectionParity = async ({ primaryRevision, snapshotFingerprint, contractVersion }) => {
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

async function request(pathname, { method = "GET", body = null, headers = {} } = {}) {
  const res = makeResponse();
  const commandHeaders = method === "PATCH"
    ? { host: "mes.local", origin: "http://mes.local", "sec-fetch-site": "same-origin", "content-type": "application/json" }
    : {};
  const handled = await handleDomainApiRequest(
    { method, body, headers: { ...commandHeaders, ...headers } },
    res,
    new URL(`http://mes.local${pathname}`),
    {
      filePath: "planning-postgres-projection-safety-fixture",
      env: { MES_DOMAIN_STORAGE: "postgres", MES_ENABLE_PLANNING_SERVER_COMMANDS: "1" },
      workOrdersRepositoryFactory: async ({ env }) => (
        String(env.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? snapshot : primary
      ),
      // Authorization behavior has its own signed-session/RBAC contract QA.
      // This fixture isolates marker/parity ordering with an explicit injected
      // employee principal and never enables a live URL/query bypass.
      planningAuthorizationResolver: async () => ({
        allowed: true,
        reason: "allowed",
        principal: { id: "employee:planning-safety-qa", employeeId: "planning-safety-qa", scope: "employee" },
        revision: 1,
      }),
    },
  );
  return {
    handled,
    statusCode: res.statusCode,
    headers: res.headers,
    json: JSON.parse(res.body || "{}"),
  };
}

const primaryHealth = { current: { revision: 4, updatedAt: "2026-07-18T08:00:00.000Z" } };
const snapshotHealth = { current: { revision: 7, updatedAt: "2026-07-18T08:01:00.000Z", planningProjectionFingerprint: "sha256:snapshot-a" } };
const primaryItem = { current: makeItem("resource-D3_L1-matrix-missing") };
const snapshotItem = { current: makeItem("") };
const writes = { quantity: 0, slot: 0 };
const primaryPeriodReads = { full: 0, weekly: 0 };
const primaryRuntimeProjectionReads = { count: 0 };
const primaryGanttWindowReads = { count: 0 };
const snapshotGanttWindowReads = { count: 0 };
const primaryAggregateReads = { list: 0, get: 0 };
const markerRef = { current: {
  primaryRevision: 4,
  verifiedPrimaryRevision: null,
  verifiedSnapshotFingerprint: "",
  verifiedContractVersion: 0,
} };
const primaryHooks = {};
const primary = createFixtureRepository({
  storageMode: "postgres", storageBackend: "postgresql", health: primaryHealth, itemRef: primaryItem, writes, nativePeriodReads: primaryPeriodReads, nativeRuntimeProjectionReads: primaryRuntimeProjectionReads, nativeGanttWindowReads: primaryGanttWindowReads, aggregateReads: primaryAggregateReads, markerRef, hooks: primaryHooks,
});
const snapshot = createFixtureRepository({
  storageMode: "snapshot-adapter", storageBackend: "shared-state", health: snapshotHealth, itemRef: snapshotItem, writes, nativeGanttWindowReads: snapshotGanttWindowReads,
});

const factory = async ({ env }) => (
  String(env.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? snapshot : primary
);

const staleSafety = await inspectPlanningProjectionSafety({
  primary,
  primaryHealth: await primary.health(),
  env: { MES_DOMAIN_STORAGE: "postgres" },
  filePath: "planning-postgres-projection-safety-helper-fixture",
  createRepository: factory,
});
assert(staleSafety.fallbackReason === "postgres-projection-stale", "executionContext parity mismatch must activate PostgreSQL fallback");
assert(staleSafety.repository === snapshot, "stale PostgreSQL projection must read from the snapshot adapter");
assert(staleSafety.parity?.mismatches?.[0]?.operations?.[0]?.fields?.includes("executionContext"), "parity diagnostics must identify an executionContext field mismatch");

const staleList = await request("/api/v1/planning/work-orders");
assert(staleList.handled && staleList.statusCode === 200, "planning list must remain readable during a stale PostgreSQL projection");
assert(staleList.json.fallbackReason === "postgres-projection-stale" && staleList.json.primaryStorageBackend === "postgresql", "planning list must explicitly expose the safe fallback state");
assert(staleList.json.storageMode === "snapshot-adapter", "planning list must read the compatible snapshot rather than stale PostgreSQL");

const staleSummary = await request("/api/v1/planning/work-orders/summary");
assert(staleSummary.statusCode === 200 && staleSummary.json.fallbackReason === "postgres-projection-stale", "planning summary must use and expose the same safe fallback");

const staleDetail = await request("/api/v1/planning/work-orders/WO-001");
assert(staleDetail.statusCode === 200 && staleDetail.json.fallbackReason === "postgres-projection-stale", "selected work-order detail must not leak stale PostgreSQL operation data");
assert(staleDetail.json.item?.operations?.[0]?.executionContext?.resourceId === "", "selected work-order detail must come from the snapshot fallback");

const staleProjection = await request("/api/v1/planning/work-orders/projection");
assert(staleProjection.statusCode === 200 && staleProjection.json.fallbackReason === "postgres-projection-stale", "planning runtime projection must use and expose the same safe fallback");
assert(primaryRuntimeProjectionReads.count === 0, "stale PostgreSQL projection must not bypass the snapshot fallback through the batch runtime capability");

const stalePeriod = await request("/api/v1/planning/period?from=2026-07-18&to=2026-07-19");
assert(stalePeriod.statusCode === 200 && stalePeriod.json.fallbackReason === "postgres-projection-stale", "bounded planning period must honor the same safe fallback");
const staleWeeklyPeriod = await request("/api/v1/planning/period?from=2026-07-18&to=2026-07-19&view=weekly");
assert(staleWeeklyPeriod.statusCode === 200 && staleWeeklyPeriod.json.fallbackReason === "postgres-projection-stale" && staleWeeklyPeriod.json.projection, "stale compact Weekly request must retain the snapshot projection fallback");
assert(primaryPeriodReads.full === 0 && primaryPeriodReads.weekly === 0, "stale PostgreSQL projection must not bypass the snapshot fallback through any native period read");
const staleGanttWindow = await request("/api/v1/planning/gantt-window?from=2026-07-18&to=2026-07-19");
assert(staleGanttWindow.statusCode === 200 && staleGanttWindow.json.fallbackReason === "postgres-gantt-window-physical-slots-unverified" && staleGanttWindow.json.ganttWindow?.slots?.[0]?.resourceId === "", "stale Gantt window must read the compatible snapshot contract rather than stale PostgreSQL");
assert(primaryGanttWindowReads.count === 0 && snapshotGanttWindowReads.count === 1, "stale Gantt window must not invoke the PostgreSQL-native window read");

const parity = await request("/api/v1/planning/work-orders/parity");
assert(parity.statusCode === 200 && parity.json.ok === false, "parity endpoint must remain a primary-vs-snapshot diagnostic while fallback is active");
assert(parity.json.primary?.storageMode === "postgres" && parity.json.snapshot?.storageMode === "snapshot-adapter", "parity endpoint must not self-compare the snapshot fallback");

const staleWrite = await request("/api/v1/planning/work-orders/WO-001", {
  method: "PATCH",
  body: { quantity: 20, expectedRevision: 3 },
});
assert(staleWrite.statusCode === 409 && staleWrite.json.fallbackReason === "postgres-projection-stale", "planning write must reject rather than diverge while PostgreSQL is stale");
assert(writes.quantity === 0 && writes.slot === 0, "stale projection guard must reject before any repository write");

const staleSlotWrite = await request("/api/v1/planning/work-orders/WO-001/operations/operation-1/slot", {
  method: "PATCH",
  body: { plannedStart: "2026-07-18T10:00:00.000Z", expectedRevision: 3 },
});
assert(staleSlotWrite.statusCode === 409 && staleSlotWrite.json.fallbackReason === "postgres-projection-stale", "slot schedule writes must reject rather than diverge while PostgreSQL is stale");
assert(writes.quantity === 0 && writes.slot === 0, "slot write must also stop before the repository command");

const readiness = await request("/api/v1/domain-readiness");
assert(readiness.statusCode === 200 && readiness.json.readiness?.workOrders?.sourceSynchronized === false, "readiness must mark a stale PostgreSQL projection as unsynchronized");
assert(readiness.json.readiness?.workOrders?.fallbackReason === "postgres-projection-stale", "readiness must surface the fallback reason for operators");

// A changed primary revision invalidates the short cache. Once the erroneous
// legacy resource ID is removed, PostgreSQL becomes the normal read path
// again, without requiring a process restart.
primaryItem.current = makeItem("");
primaryHealth.current = { revision: 5, updatedAt: "2026-07-18T08:02:00.000Z" };
markerRef.current = { ...markerRef.current, primaryRevision: 5 };
snapshotHealth.current = { revision: 8, updatedAt: "2026-07-18T08:02:00.000Z", planningProjectionFingerprint: "sha256:snapshot-b" };
const recoveredList = await request("/api/v1/planning/work-orders");
assert(recoveredList.statusCode === 200 && !recoveredList.json.fallbackReason, "parity recovery must restore the configured PostgreSQL read path");
assert(recoveredList.json.storageMode === "postgres", "healthy PostgreSQL must retain its normal read path");

const recoveredPeriod = await request("/api/v1/planning/period?from=2026-07-18&to=2026-07-19");
assert(recoveredPeriod.statusCode === 200 && !recoveredPeriod.json.fallbackReason, "healthy PostgreSQL period read must keep the normal authority");
assert(primaryPeriodReads.full === 1, "healthy PostgreSQL projection read must use the native bounded repository capability");

const recoveredWeeklyPeriod = await request("/api/v1/planning/period?from=2026-07-18&to=2026-07-19&view=weekly");
assert(recoveredWeeklyPeriod.statusCode === 200 && !recoveredWeeklyPeriod.json.fallbackReason, "healthy compact Weekly read must retain PostgreSQL authority");
assert(recoveredWeeklyPeriod.json.view === "weekly" && recoveredWeeklyPeriod.json.rows?.[0]?.id === "slot-1", "healthy compact Weekly read must return the narrow rows contract");
assert(primaryPeriodReads.weekly === 1, "healthy compact Weekly read must use its dedicated bounded repository capability");

primaryGanttWindowReads.count = 0;
snapshotGanttWindowReads.count = 0;
const recoveredGanttWindow = await request("/api/v1/planning/gantt-window?from=2026-07-18&to=2026-07-19");
assert(recoveredGanttWindow.statusCode === 200 && recoveredGanttWindow.json.fallbackReason === "postgres-gantt-window-physical-slots-unverified" && recoveredGanttWindow.json.storageMode === "snapshot-adapter", "healthy aggregate parity must not over-authorize PostgreSQL Gantt physical slots");
assert(recoveredGanttWindow.json.ganttWindow?.routeSteps?.[0]?.id === "operation-1" && recoveredGanttWindow.json.ganttWindow?.slots?.[0]?.id === "slot-1", "healthy Gantt window must retain its isolated route-step and physical-slot contract");
assert(primaryGanttWindowReads.count === 0 && snapshotGanttWindowReads.count === 1, "healthy aggregate parity must keep the Gantt window on snapshot authority until physical-slot parity exists");

// After the recovered primary has established its marker-backed safety cache,
// the full runtime projection must take its bounded PostgreSQL capability
// directly rather than repeating the old list + get-per-order path.
primaryRuntimeProjectionReads.count = 0;
primaryAggregateReads.list = 0;
primaryAggregateReads.get = 0;
const recoveredRuntimeProjection = await request("/api/v1/planning/work-orders/projection");
assert(recoveredRuntimeProjection.statusCode === 200 && !recoveredRuntimeProjection.json.fallbackReason && recoveredRuntimeProjection.json.storageMode === "postgres", "healthy runtime projection must retain PostgreSQL authority");
assert(recoveredRuntimeProjection.json.projection?.routes?.[0]?.id === "route-1" && recoveredRuntimeProjection.json.projection?.routeSteps?.[0]?.id === "operation-1" && recoveredRuntimeProjection.json.projection?.slots?.[0]?.id === "slot-1", "healthy runtime projection must retain the route, operation and slot transport contract");
assert(primaryRuntimeProjectionReads.count === 1, "healthy runtime projection must use the PostgreSQL batch capability exactly once");
assert(primaryAggregateReads.list === 0 && primaryAggregateReads.get === 0, "healthy runtime projection must not fall back to list plus per-order detail reads");

// The same marker revalidation also protects a command's pre-read. A direct
// planning mutation that lands after the route's initial marker check must
// turn the PATCH into a parity conflict instead of starting a new write.
let mutateDuringCommandRead = true;
primaryHooks.onGet = async () => {
  if (!mutateDuringCommandRead) return;
  mutateDuringCommandRead = false;
  primaryItem.current = makeItem("resource-primary-changed-during-command");
  markerRef.current = { ...markerRef.current, primaryRevision: 6 };
};
const protectedWrite = await request("/api/v1/planning/work-orders/WO-001", {
  method: "PATCH",
  body: { quantity: 20, expectedRevision: 3 },
});
assert(protectedWrite.statusCode === 409 && protectedWrite.json.fallbackReason === "postgres-projection-stale", "a marker move during PATCH pre-read must reject the command");
assert(writes.quantity === 0, "a command must not execute after its parity proof moved");
primaryHooks.onGet = null;

console.log("Planning PostgreSQL projection safety QA: OK");
