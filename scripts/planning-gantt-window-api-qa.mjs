import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleDomainApiRequest } from "./domain-api.mjs";

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

async function request(filePath, pathname, headers = {}, { env = undefined, workOrdersRepositoryFactory = undefined } = {}) {
  const res = makeResponse();
  const handled = await handleDomainApiRequest(
    { method: "GET", headers },
    res,
    new URL(`http://mes.local${pathname}`),
    { filePath, env, workOrdersRepositoryFactory },
  );
  return {
    handled,
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
    json: JSON.parse(res.body || "{}"),
  };
}

function createGanttWindowFixtureRepository({
  storageMode,
  storageBackend,
  configured = true,
  window,
  reads,
} = {}) {
  const metadata = { storageMode, storageBackend, configured };
  return {
    async health() {
      return { ...metadata, revision: 9, updatedAt: "2026-07-18T12:00:00.000Z" };
    },
    async listGanttWindow() {
      reads.count += 1;
      return { ...metadata, revision: 9, updatedAt: "2026-07-18T12:00:00.000Z", window };
    },
  };
}

const dir = await mkdtemp(join(tmpdir(), "mes-planning-gantt-window-api-qa-"));
const filePath = join(dir, "state.json");

try {
  const planning = {
    routes: [
      {
        id: "route-alpha",
        specificationName: "Альфа",
        designation: "АБВГ.001",
        planningQuantity: 12,
        unit: "плата",
        planningStatus: "scheduled",
        lifecycleStatus: "released",
        domainConcurrencyRevision: 8,
        workOrderSnapshot: { id: "WO-ALPHA", quantity: 12 },
        // The window contract must never leak full document/labour payloads.
        planningLaborByStepId: { "step-split": { sentinel: "window-must-stay-compact".repeat(500) } },
      },
      { id: "route-out", name: "Вне окна", planningQuantity: 1, workOrderSnapshot: { id: "WO-OUT", quantity: 1 } },
    ],
    routeSteps: [
      { id: "step-split", routeId: "route-alpha", operationId: "OP-SMT", operationName: "SMT монтаж", workCenterId: "D3", nextWorkCenterId: "D4", stepOrder: 10, resourceId: "D3-L1" },
      { id: "step-leaving", routeId: "route-alpha", operationId: "OP-AOI", operationName: "Оптическая инспекция", workCenterId: "D4", stepOrder: 20 },
      { id: "step-out", routeId: "route-out", operationId: "OP-OUT", operationName: "Вне окна", workCenterId: "D5", stepOrder: 1 },
    ],
    slots: [
      // One physical step is split across three records. The entry and exit
      // flags prove that a bounded view can draw bars crossing either edge.
      { id: "slot-entering", routeId: "route-alpha", routeStepId: "step-split", plannedStart: "2026-07-16T23:00:00.000Z", plannedEnd: "2026-07-17T01:00:00.000Z", status: "planned", quantity: 3, workCenterId: "D3_L1", resourceId: "D3-L1" },
      { id: "slot-split-middle", routeId: "route-alpha", routeStepId: "step-split", plannedStart: "2026-07-18T08:00:00.000Z", plannedEnd: "2026-07-18T10:00:00.000Z", status: "planned", quantity: 4 },
      { id: "slot-leaving", routeId: "route-alpha", routeStepId: "step-leaving", plannedStart: "2026-07-23T23:00:00.000Z", plannedEnd: "2026-07-24T02:00:00.000Z", status: "planned", quantity: 5, locked: true },
      // Exact half-open boundary exclusions.
      { id: "slot-before", routeId: "route-out", routeStepId: "step-out", plannedStart: "2026-07-16T22:00:00.000Z", plannedEnd: "2026-07-17T00:00:00.000Z", status: "planned", quantity: 1 },
      { id: "slot-after", routeId: "route-out", routeStepId: "step-out", plannedStart: "2026-07-24T00:00:00.000Z", plannedEnd: "2026-07-24T02:00:00.000Z", status: "planned", quantity: 1 },
    ],
  };
  await writeFile(filePath, JSON.stringify({
    version: 41,
    updatedAt: "2026-07-18T12:00:00.000Z",
    values: { "mes-planning-prototype-state-v2": JSON.stringify(planning) },
  }), "utf-8");

  const window = await request(filePath, "/api/v1/planning/gantt-window?from=2026-07-17&to=2026-07-24");
  assert(window.handled && window.statusCode === 200, "bounded Gantt window must return 200");
  assert(window.json.storageMode === "snapshot-adapter" && window.json.storageBackend === "file", "snapshot primary must provide a compatibility Gantt window without PostgreSQL");
  assert(window.json.period?.fromAt === "2026-07-17T00:00:00.000Z" && window.json.period?.toAt === "2026-07-24T00:00:00.000Z", "Gantt window must canonicalize date bounds to half-open UTC instants");
  assert(!Object.hasOwn(window.json, "projection") && !Object.hasOwn(window.json, "item"), "Gantt window must remain an isolated read contract rather than overwrite a global planning projection");
  assert(window.json.ganttWindow?.routes?.map((route) => route.id).join(",") === "route-alpha", "Gantt window must include only routes with a physical slot overlapping the visible range");
  assert(window.json.ganttWindow?.routeSteps?.map((step) => step.id).join(",") === "step-split,step-leaving", "Gantt window must deduplicate route steps while retaining their schedule order");
  assert(window.json.ganttWindow?.slots?.map((slot) => slot.id).join(",") === "slot-entering,slot-split-middle,slot-leaving", "Gantt window must retain every overlapping physical slot and obey half-open bounds");
  assert(window.json.ganttWindow?.slots?.[0]?.continuesFromPrevious === true && window.json.ganttWindow?.slots?.[2]?.continuesAfterWindow === true, "physical slots crossing either range edge must carry continuation flags");
  assert(window.json.ganttWindow?.boundaryContinuations?.entering?.map((entry) => entry.id).join(",") === "slot-entering", "Gantt window must expose the entering continuation identity");
  assert(window.json.ganttWindow?.boundaryContinuations?.leaving?.map((entry) => entry.id).join(",") === "slot-leaving", "Gantt window must expose the leaving continuation identity");
  assert(window.json.ganttWindow?.slots?.[0]?.workCenterId === "D3_L1" && window.json.ganttWindow?.slots?.[0]?.resourceId === "D3-L1", "Gantt window must retain compact resolved slot placement fields");
  assert(!window.body.includes("window-must-stay-compact"), "Gantt window must not transfer route labour/document payloads");

  const unchanged = await request(filePath, "/api/v1/planning/gantt-window?from=2026-07-17&to=2026-07-24", { "if-none-match": window.headers.ETag });
  assert(unchanged.statusCode === 304 && unchanged.body === "", "unchanged Gantt window must support conditional GET");

  const instant = await request(filePath, "/api/v1/planning/gantt-window?fromAt=2026-07-16T21%3A00%3A00.000Z&toAt=2026-07-23T21%3A00%3A00.000Z");
  assert(instant.statusCode === 200 && instant.json.ganttWindow?.slots?.some((slot) => slot.id === "slot-entering"), "Gantt window must accept canonical instant bounds for a local calendar horizon");

  const invalid = await request(filePath, "/api/v1/planning/gantt-window?from=2026-07-24&to=2026-07-17");
  assert(invalid.statusCode === 400 && /after/.test(invalid.json.error || ""), "Gantt window must reject reversed bounds before reading storage");

  // The legacy marker proves only the first slot of an operation. Model a
  // PostgreSQL aggregate with an additional physical split slot that the
  // compatibility snapshot does not have: this must remain snapshot-backed
  // until a dedicated physical-slot parity marker is added.
  const snapshotWindow = {
    routes: [{ id: "route-split", number: "WO-SPLIT", name: "Совместимый маршрут", designation: "", planningQuantity: 1, unit: "шт.", lifecycleStatus: "released", planningStatus: "scheduled", domainConcurrencyRevision: 9 }],
    routeSteps: [{ id: "step-split", routeId: "route-split", operationId: "OP-SPLIT", operationName: "Разделённая операция", workCenterId: "D3", nextWorkCenterId: "", sequenceNo: 1, quantityMultiplier: 1 }],
    slots: [{ id: "slot-primary", routeId: "route-split", routeStepId: "step-split", plannedStart: "2026-07-18T08:00:00.000Z", plannedEnd: "2026-07-18T09:00:00.000Z", status: "planned", quantity: 1, locked: false, workCenterId: "D3", resourceId: "", continuesFromPrevious: false, continuesAfterWindow: false }],
    boundaryContinuations: { entering: [], leaving: [] },
  };
  const postgresWindow = {
    ...snapshotWindow,
    slots: [...snapshotWindow.slots, { id: "slot-hidden-split", routeId: "route-split", routeStepId: "step-split", plannedStart: "2026-07-18T10:00:00.000Z", plannedEnd: "2026-07-18T11:00:00.000Z", status: "planned", quantity: 1, locked: false, workCenterId: "D3", resourceId: "", continuesFromPrevious: false, continuesAfterWindow: false }],
  };
  const primaryReads = { count: 0 };
  const compatibilityReads = { count: 0 };
  const splitPrimary = createGanttWindowFixtureRepository({ storageMode: "postgres", storageBackend: "postgresql", window: postgresWindow, reads: primaryReads });
  const splitSnapshot = createGanttWindowFixtureRepository({ storageMode: "snapshot-adapter", storageBackend: "file", window: snapshotWindow, reads: compatibilityReads });
  const splitFactory = async ({ env: repositoryEnv = {} } = {}) => (
    String(repositoryEnv.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? splitSnapshot : splitPrimary
  );
  const physicalSplitFallback = await request("split-slot-fixture", "/api/v1/planning/gantt-window?from=2026-07-18&to=2026-07-19", {}, {
    env: { MES_DOMAIN_STORAGE: "postgres" },
    workOrdersRepositoryFactory: splitFactory,
  });
  assert(physicalSplitFallback.statusCode === 200 && physicalSplitFallback.json.fallbackReason === "postgres-gantt-window-physical-slots-unverified", "a PostgreSQL Gantt window must disclose that old aggregate parity cannot prove physical split slots");
  assert(physicalSplitFallback.json.ganttWindow?.slots?.map((slot) => slot.id).join(",") === "slot-primary", "unverified PostgreSQL split slots must not leak into the compatibility Gantt window");
  assert(primaryReads.count === 0 && compatibilityReads.count === 1, "a compatibility snapshot must remain Gantt-window authority until physical-slot parity exists");

  // In a PostgreSQL-only contour there is no snapshot shape to compare, so
  // the native bounded query is the only available and therefore safe source.
  const postgresOnlyReads = { count: 0 };
  const absentSnapshotReads = { count: 0 };
  const postgresOnlyPrimary = createGanttWindowFixtureRepository({ storageMode: "postgres", storageBackend: "postgresql", window: postgresWindow, reads: postgresOnlyReads });
  const absentSnapshot = createGanttWindowFixtureRepository({ storageMode: "snapshot-adapter", storageBackend: "unconfigured", configured: false, window: snapshotWindow, reads: absentSnapshotReads });
  const postgresOnlyFactory = async ({ env: repositoryEnv = {} } = {}) => (
    String(repositoryEnv.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot" ? absentSnapshot : postgresOnlyPrimary
  );
  const postgresOnly = await request("postgres-only-fixture", "/api/v1/planning/gantt-window?from=2026-07-18&to=2026-07-19", {}, {
    env: { MES_DOMAIN_STORAGE: "postgres" },
    workOrdersRepositoryFactory: postgresOnlyFactory,
  });
  assert(postgresOnly.statusCode === 200 && !postgresOnly.json.fallbackReason && postgresOnly.json.storageMode === "postgres", "a PostgreSQL-only contour may use the native Gantt-window read directly");
  assert(postgresOnly.json.ganttWindow?.slots?.map((slot) => slot.id).join(",") === "slot-primary,slot-hidden-split", "PostgreSQL-only Gantt window must retain all physical split slots");
  assert(postgresOnlyReads.count === 1 && absentSnapshotReads.count === 0, "PostgreSQL-only Gantt window must not invoke an unavailable snapshot adapter");

  console.log("Planning Gantt window API QA: OK");
} finally {
  await rm(dir, { recursive: true, force: true });
}
