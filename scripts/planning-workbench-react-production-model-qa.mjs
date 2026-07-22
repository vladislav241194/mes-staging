import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-planning-workbench-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = new URL("../experiments/react-migration/src/modules/planning-workbench/adapter.ts", import.meta.url);
  const productionModelPath = new URL("../experiments/react-migration/src/modules/planning-workbench/production-model.ts", import.meta.url);
  await build({ entryPoints: [adapterPath.pathname], outfile: output, bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "silent" });
  const { adaptPlanningWorkbench } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const item = {
    id: "route-a",
    number: "WO-1042",
    name: "Контроллер КТ-7",
    quantity: 120,
    unit: "шт.",
    lifecycleStatus: "released",
    planningStatus: "scheduled",
    planningStartDate: "2026-07-24",
    concurrencyRevision: 9,
    revision: 7,
    operationCount: 3,
    scheduledOperationCount: 2,
    metadata: {
      planningStartDate: "1999-01-01",
      routeDocumentKind: "main",
      sourceSpecifications2EntryId: "spec-a",
      documentRevisionSnapshot: { specificationRevision: 7 },
    },
    operations: [
      {
        id: "step-1",
        name: "Монтаж",
        workCenterId: "D3",
        sequenceNo: 1,
        quantityMultiplier: 1,
        executionContext: { calculationType: "manual", unitsPerHour: 60 },
        metadata: { routeId: "route-a", specTaskId: "task-main", specTaskName: "Контроллер КТ-7", specTaskQuantity: 1, specTaskUnit: "шт." },
        slot: { id: "slot-1", plannedStart: "2026-07-25T06:00:00.000Z", plannedEnd: "2026-07-25T08:00:00.000Z", quantity: 120 },
      },
      {
        id: "step-2",
        name: "Контроль",
        workCenterId: "D4",
        sequenceNo: 2,
        quantityMultiplier: 1,
        labor: { minutesPerUnit: 0.5 },
        metadata: { routeId: "route-a", specTaskId: "task-main", specTaskName: "Контроллер КТ-7", specTaskQuantity: 1, specTaskUnit: "шт." },
        slot: { id: "slot-2", plannedStart: "2026-07-25T08:00:00.000Z", plannedEnd: "2026-07-25T09:00:00.000Z", quantity: 120 },
      },
      {
        id: "step-3",
        name: "Упаковка",
        workCenterId: "D1",
        sequenceNo: 3,
        quantityMultiplier: 1,
        executionContext: { isWarehouseOperation: true, fixedMinutes: 20 },
        metadata: { routeId: "route-a", specTaskId: "task-pack", specTaskName: "Комплект упаковки", specTaskQuantity: 1, specTaskUnit: "компл." },
      },
    ],
  };
  const bootstrapModel = adaptPlanningWorkbench({
    productionModel: {
      bootstrap: {
        storageMode: "postgres",
        storageBackend: "postgresql",
        activeId: "route-a",
        items: [
          { ...item, operations: undefined },
          { id: "route-b", number: "WO-1041", name: "Модуль питания", quantity: 80, unit: "шт.", lifecycleStatus: "draft", planningStatus: "draft", concurrencyRevision: 2, operationCount: 1, scheduledOperationCount: 0, metadata: {} },
        ],
        item,
      },
      workCenters: [{ id: "D3", name: "Ручной монтаж" }, { id: "D4", name: "ОТК" }, { id: "D1", name: "Склад" }],
      selectedItem: "step:step-2",
      shiftOrders: [{ id: "shift-a", routeId: "route-a" }],
    },
    capabilities: { startDateEdit: true },
  });
  assert.equal(bootstrapModel.projectionSource, "server");
  assert.equal(bootstrapModel.planningStartDate, "2026-07-24", "canonical PostgreSQL date must override stale metadata");
  assert.equal(bootstrapModel.concurrencyRevision, 9);
  assert.equal(bootstrapModel.serverScheduledStartDate, "2026-07-25");
  assert.equal(bootstrapModel.queue.length, 2);
  assert.equal(bootstrapModel.metrics.length, 5);
  assert.equal(bootstrapModel.rows.length, 5, "two task rows and three operation rows must be projected");
  assert.equal(bootstrapModel.rows.find((row) => row.id === "step:step-2")?.selected, true);
  assert.equal(bootstrapModel.rows.find((row) => row.id === "step:step-3")?.context, "склад");
  assert.equal(bootstrapModel.metrics.find((metric) => metric.id === "schedule")?.value, "2/3");
  assert.equal(bootstrapModel.metrics.find((metric) => metric.id === "shifts")?.value, "1");
  assert.equal(bootstrapModel.readModelCoverage?.deferred.length, 4);

  const runtimeModel = adaptPlanningWorkbench({
    productionModel: {
      activeRouteId: "runtime-route",
      projection: {
        routes: [{ id: "runtime-route", name: "Runtime маршрут", planningQuantity: 20, unit: "шт.", domainConcurrencyRevision: 4, operationCount: 1, metadata: {} }],
        routeSteps: [{ id: "runtime-step", routeId: "runtime-route", operationName: "AOI", workCenterId: "D4", labor: { unitsPerHour: 20 }, specTaskId: "runtime-task", specTaskName: "Плата" }],
        slots: [{ id: "runtime-slot", routeId: "runtime-route", routeStepId: "runtime-step", plannedStart: "2026-07-26T06:00:00.000Z", plannedEnd: "2026-07-26T07:00:00.000Z", quantity: 20 }],
      },
    },
  });
  assert.equal(runtimeModel.projectionSource, "runtime-projection");
  assert.equal(runtimeModel.rows.length, 2);
  assert.equal(runtimeModel.quantity, 20);
  assert.equal(runtimeModel.rows[0]?.title, "Плата");
  assert.equal(runtimeModel.metrics.find((metric) => metric.id === "schedule")?.value, "1/1");
  assert.equal(runtimeModel.planningStartDateSource, "unavailable", "runtime fallback must not pretend to own the canonical DATE");

  const compactModel = adaptPlanningWorkbench({
    productionModel: { bootstrap: { storageMode: "postgres", activeId: "route-a", items: [{ ...item, operations: undefined }] } },
  });
  assert.equal(compactModel.detailLoading, true);
  assert.equal(compactModel.canActivate, false, "compact list alone must wait for selected aggregate detail");

  const fixtureModel = adaptPlanningWorkbench({
    model: {
      activeRouteId: "fixture-route",
      activeQuantity: 5,
      projectionSource: "server",
      queue: [{ id: "fixture-route", title: "Fixture", meta: "Основной · 5 шт.", operationCount: 1, status: { label: "В плане", tone: "ok" }, active: true }],
      overview: {
        planningQuantity: 5,
        decision: { title: "Fixture decision", subtitle: "Fixture subtitle", tone: "ok", isReady: true },
        metrics: ["supply", "chain", "duration", "schedule", "shifts"].map((id) => ({ id, label: id, value: "ok", meta: "fixture", tone: "ok" })),
        rows: [{ id: "task:fixture", kind: "task", level: 0, title: "Fixture row", quantity: 5, unit: "шт.", status: { label: "готово", tone: "ok" } }],
      },
    },
  });
  assert.equal(fixtureModel.activeRouteId, "fixture-route");
  assert.equal(fixtureModel.decision.title, "Fixture decision", "existing fixture/model payload must retain adapter compatibility");
  assert.equal(fixtureModel.rows[0]?.title, "Fixture row");

  const clearedDateModel = adaptPlanningWorkbench({
    productionModel: {
      bootstrap: {
        storageMode: "postgres",
        activeId: "route-clear",
        items: [{ id: "route-clear", name: "Clear", quantity: 1, planningStartDate: null, metadata: { planningStartDate: "2026-01-01" }, operationCount: 1 }],
        item: { id: "route-clear", name: "Clear", quantity: 1, planningStartDate: null, metadata: { planningStartDate: "2026-01-01" }, operations: [{ id: "clear-step", workCenterId: "D4", labor: { fixedMinutes: 1 }, metadata: { routeId: "route-clear" } }] },
      },
    },
  });
  assert.equal(clearedDateModel.planningStartDate, "", "explicit PostgreSQL null must remain cleared");

  const [adapterSource, productionSource] = await Promise.all([readFile(adapterPath, "utf8"), readFile(productionModelPath, "utf8")]);
  assert.doesNotMatch(`${adapterSource}\n${productionSource}`, /src\/modules\/planning_workbench|render\.js|server_projection_adapter/, "typed read model must not import a legacy Planning renderer or adapter");

  console.log("Planning Workbench React production model QA: OK");
  console.log("- PostgreSQL bootstrap, runtime projection and canonical DATE clear: pass");
  console.log("- fixture adapter compatibility and explicit deferred coverage: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
