import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-gantt-production-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = new URL("../experiments/react-migration/src/modules/gantt/adapter.ts", import.meta.url);
  const productionModelPath = new URL("../experiments/react-migration/src/modules/gantt/production-model.ts", import.meta.url);
  const scenarioPath = new URL("../experiments/react-migration/src/modules/gantt/GanttScenario.tsx", import.meta.url);
  const appPath = new URL("../src/app.js", import.meta.url);
  await build({
    entryPoints: [adapterPath.pathname],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });
  const { adaptGanttPayload } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const projection = {
    revision: 11,
    routes: [{ id: "route-1", number: "WO-1042", name: "Контроллер КТ-7", designation: "КТ-7", planningQuantity: 24, unit: "шт." }],
    routeSteps: [
      { id: "step-1", routeId: "route-1", stepOrder: 1, operationName: "Монтаж", workCenterId: "D5" },
      { id: "step-2", routeId: "route-1", stepOrder: 2, operationName: "Контроль", workCenterId: "D6" },
    ],
    slots: [
      { id: "slot-1", routeId: "route-1", routeStepId: "step-1", plannedStart: "2026-07-22T06:00:00.000Z", plannedEnd: "2026-07-22T10:00:00.000Z", status: "planned", quantity: 24, workCenterId: "D5" },
      { id: "slot-2", routeId: "route-1", routeStepId: "step-2", plannedStart: "2026-07-22T11:00:00.000Z", plannedEnd: "2026-07-22T13:00:00.000Z", status: "planned", quantity: 24, workCenterId: "D6", locked: true },
    ],
  };
  const model = adaptGanttPayload({
    productionModel: {
      projection,
      workCenters: [{ id: "D5", code: "MNT", name: "Монтаж" }, { id: "D6", code: "QA", name: "ОТК" }],
      ui: { scale: "hours", windowStart: "2026-07-22", ganttZoom: 1, expandedRouteIds: ["route-1"], ganttShowQuantity: true, activeRouteId: "route-1", selectedSlotId: "slot-1" },
    },
    capabilities: { scheduleEdit: true },
  });
  assert.equal(model.projectionSource, "server");
  assert.equal(model.scale, "hours");
  assert.equal(model.zoomLabel, "100%");
  assert.equal(model.routeCount, 1);
  assert.equal(model.activeRouteId, "route-1", "typed model must preserve the active Planning route");
  assert.equal(model.selectedSlotId, "slot-1", "typed model must preserve the selected physical slot");
  assert.equal(model.rows.length, 3, "expanded route must contain one route row and two resource rows");
  assert.equal(model.rows[0]?.type, "route");
  assert.equal(model.rows[1]?.label, "Монтаж");
  assert.equal(model.rows[2]?.label, "ОТК");
  assert.equal(model.rows.flatMap((row) => row.slots).filter((slot) => !slot.aggregate).length, 2);
  assert.equal(model.rows.flatMap((row) => row.slots).find((slot) => slot.id === "slot-1")?.canReschedule, true);
  assert.equal(model.rows.flatMap((row) => row.slots).find((slot) => slot.id === "slot-2")?.canReschedule, false);
  assert.equal(model.dependencies.length, 1);
  assert.equal(model.dependencies[0]?.gapMinutes, 60);
  assert.equal(model.readModelCoverage?.contract, "postgres-gantt-read-v1");
  assert.equal(model.readModelCoverage?.deferred.length, 4);

  const collapsed = adaptGanttPayload({
    productionModel: { projection, ui: { scale: "days", windowStart: "2026-07-22", expandedRouteIds: [], ganttShowQuantity: false } },
  });
  assert.equal(collapsed.rows.length, 1, "collapsed route must retain its aggregate row without legacy geometry");
  assert.equal(collapsed.allRoutesExpanded, false);
  assert.equal(collapsed.showQuantity, false);
  assert.equal(collapsed.dependencies.length, 0);

  const fixture = adaptGanttPayload({
    model: {
      projectionSource: "fixture",
      scale: "days",
      rows: [{ id: "fixture-row", label: "Fixture", height: 68, slots: [{ id: "fixture-slot", routeId: "fixture-route", operationId: "fixture-step", plannedStart: "2026-07-22T00:00:00.000Z", plannedEnd: "2026-07-23T00:00:00.000Z", width: 20, height: 26 }] }],
      ticks: [],
      dependencies: [],
      timelineWidth: 100,
      totalHeight: 68,
    },
  });
  assert.equal(fixture.rows[0]?.id, "fixture-row", "isolated typed fixture adapter must remain available for unit QA");

  const [adapterSource, productionSource, scenarioSource, appSource] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(productionModelPath, "utf8"),
    readFile(scenarioPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);
  assert.doesNotMatch(`${adapterSource}\n${productionSource}`, /gantt_runtime\/render\.js|getGanttReactModel|buildRows\(/, "typed production model must not import or call the legacy Gantt model");
  assert.match(scenarioSource, /data-react-prototype-marker[^>]*>[\s\S]*?React TS · прототип/, "Gantt cutover must expose the visible React TS prototype marker without claiming full command parity");
  assert.match(appSource, /productionModel: ganttReactModel/, "permanent Gantt payload must select the typed production adapter");
  assert.match(appSource, /planningRuntimeProjectionReadModel\?\.getProjection\?\.\(\)/, "permanent Gantt must read the PostgreSQL projection directly");
  assert.match(appSource, /const projectionReady = hasGanttPlanningProjectionReady\(\);[\s\S]*ganttReactModel = projectionReady \? getGanttReactProductionInput\(\) : null;[\s\S]*ganttReactIslandHost\.prepareRender\(\);[\s\S]*ganttReactIslandHost\.mount\(\);[\s\S]*return;/,
    "the Gantt route must mount the typed React payload and return without a legacy branch");
  assert.doesNotMatch(appSource, /ganttRuntime|createLazyGanttRuntimeModule|data-gantt-shell/,
    "the normal application graph must not retain the deleted Gantt runtime");

  console.log("Gantt React production model QA: OK");
  console.log("- PostgreSQL projection -> typed route/resource rows, simplified geometry and dependencies: pass");
  console.log("- permanent React-only route with no same-release legacy runtime: pass");
  console.log("- isolated fixture compatibility and explicit deferred parity: pass");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
