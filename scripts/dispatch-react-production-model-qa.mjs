import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const repositoryRoot = join(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-dispatch-production-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = join(repositoryRoot, "experiments/react-migration/src/modules/dispatch/adapter.ts");
  await build({ entryPoints: [adapterPath], outfile: output, bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "silent" });
  const { adaptDispatchPayload } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const model = adaptDispatchPayload({
    productionModel: {
      planning: {
        routes: [{ id: "route-a", number: "ЗН-1042", name: "Контроллер КТ-7", planningQuantity: 120, unit: "шт." }],
        routeSteps: [
          { id: "step-mount", routeId: "route-a", operationName: "Монтаж", workCenterId: "D5" },
          { id: "step-control", routeId: "route-a", operationName: "Контроль", workCenterId: "D4" },
        ],
        slots: [
          { id: "slot-mount", routeId: "route-a", routeStepId: "step-mount", plannedStart: "2026-07-22T06:00:00.000Z", plannedEnd: "2026-07-22T09:00:00.000Z", quantity: 120, unit: "шт." },
          { id: "slot-control", routeId: "route-a", routeStepId: "step-control", plannedStart: "2026-07-22T10:00:00.000Z", plannedEnd: "2026-07-22T12:00:00.000Z", quantity: 80, unit: "шт." },
          { id: "slot-next-day", routeId: "route-a", routeStepId: "step-control", plannedStart: "2026-07-23T10:00:00.000Z", plannedEnd: "2026-07-23T12:00:00.000Z", quantity: 80, unit: "шт." },
        ],
      },
      shiftExecution: {
        items: [{
          id: "assignment-mount",
          sourceRowId: "slot-mount::2026-07-22",
          sourceSlotId: "slot-mount",
          workOrderId: "route-a",
          operationId: "step-mount",
          workCenterId: "D5",
          plannedQuantity: 120,
          assignedQuantity: 80,
          unit: "шт.",
          updatedAt: "2026-07-22T08:00:00.000Z",
          executors: [{ employeeId: "employee-a", quantity: 80 }],
          facts: [{ id: "fact-a", actualQuantity: 60, defectQuantity: 2, reportedAt: "2026-07-22T09:00:00.000Z" }],
        }],
        carryovers: [
          { id: "carryover-a", sourceAssignmentId: "assignment-mount", sourceRowId: "slot-mount::2026-07-22", sourceSlotId: "slot-mount", dateKey: "2026-07-22", remainingQuantity: 62, reason: "Остаток смены" },
          { id: "carryover-standalone", sourceAssignmentId: "assignment-previous", sourceRowId: "slot-previous::2026-07-21", sourceSlotId: "slot-previous", workOrderId: "route-a", operationId: "step-control", workCenterId: "D4", dateKey: "2026-07-22", remainingQuantity: 7, reason: "Переходящий остаток без текущего слота" },
        ],
        scope: { dateKey: "2026-07-22" },
      },
      systemDomains: { registries: {
        employees: [{ id: "employee-a", displayName: "Иванов Иван Иванович" }],
        workCenters: [{ id: "D-MANUAL", name: "Ручной монтаж" }, { id: "D-QC", name: "ОТК" }],
      } },
      window: { dateKey: "2026-07-22", start: "2026-07-22T00:00:00.000Z", end: "2026-07-23T00:00:00.000Z", label: "22.07.2026 · 1 смена" },
      readState: { status: "ready", productionBacked: true, planningRevision: 17, coverageComplete: true, serverAuthoritative: true },
    },
    capabilities: { readOnly: true },
  });

  assert.equal(model.productionBacked, true);
  assert.equal(model.rows.length, 3, "current-window Planning slots and standalone server carryovers must become Dispatch rows");
  assert.equal(model.rows[0]?.sourceRowId, "slot-mount::2026-07-22");
  assert.equal(model.rows[0]?.workCenterLabel, "Ручной монтаж", "legacy planning work-center IDs must resolve through System Domains aliases");
  assert.deepEqual(model.rows[0]?.executors.map((executor) => executor.name), ["Иванов Иван"]);
  assert.deepEqual([model.rows[0]?.factQuantity, model.rows[0]?.defectQuantity, model.rows[0]?.remainingQuantity], [58, 2, 62]);
  assert.deepEqual([model.rows[0]?.status.id, model.rows[1]?.status.id], ["carryover", "planned"]);
  const standaloneCarryover = model.rows.find((row) => row.carryoverId === "carryover-standalone");
  assert(standaloneCarryover, "a date-scoped API carryover outside current Planning rows must remain visible");
  assert.deepEqual(
    [standaloneCarryover.sourceRowId, standaloneCarryover.plannedQuantity, standaloneCarryover.remainingQuantity, standaloneCarryover.status.id],
    ["slot-previous::2026-07-21", 7, 7, "carryover"],
  );
  assert.deepEqual(model.totals, { planned: 207, assigned: 80, fact: 58, defects: 2, remaining: 149 });
  assert.deepEqual(model.counts, { planned: 3, assigned: 1, withFact: 1, carryovers: 2 });
  assert.equal(model.readModelCoverage.contract, "postgres-dispatch-read-v1");
  assert.equal(model.readModelCoverage.planningRevision, 17);
  assert.equal(model.readModelCoverage.deferred.includes("assignment and fact commands"), true);

  const carryoverOnly = adaptDispatchPayload({ productionModel: {
    planning: {
      routes: [{ id: "route-carryover", number: "ЗН-ПЕРЕНОС", name: "Переходящее изделие", unit: "шт." }],
      routeSteps: [{ id: "step-carryover", routeId: "route-carryover", operationName: "Контроль", workCenterId: "D4" }],
      slots: [],
    },
    shiftExecution: {
      items: [],
      carryovers: [{ id: "carryover-only", sourceAssignmentId: "assignment-old", sourceRowId: "slot-old::2026-07-21", sourceSlotId: "slot-old", workOrderId: "route-carryover", operationId: "step-carryover", workCenterId: "D4", dateKey: "2026-07-22", remainingQuantity: 5, reason: "Нет текущего Planning slot" }],
      scope: { dateKey: "2026-07-22" },
    },
    systemDomains: { registries: { workCenters: [{ id: "D-QC", name: "ОТК" }] } },
    window: { dateKey: "2026-07-22", start: "2026-07-22T00:00:00.000Z", end: "2026-07-23T00:00:00.000Z" },
    readState: { status: "ready", productionBacked: true, planningRevision: 17, coverageComplete: true, serverAuthoritative: true },
  } });
  assert.deepEqual(
    [carryoverOnly.rows.length, carryoverOnly.rows[0]?.carryoverId, carryoverOnly.totals.planned, carryoverOnly.totals.remaining],
    [1, "carryover-only", 5, 5],
    "a server-provided carryover must remain visible even when no current Planning slot matches it",
  );
  const partialModel = adaptDispatchPayload({ productionModel: {
    planning: { routes: [], routeSteps: [], slots: [] },
    shiftExecution: { items: [], carryovers: [], scope: { dateKey: "2026-07-22" } },
    window: { dateKey: "2026-07-22" },
    readState: { status: "ready", productionBacked: true, coverageComplete: false, serverAuthoritative: false },
  } });
  assert.equal(partialModel.productionBacked, false, "a partial PostgreSQL overlay must not expose the production marker");

  const [adapterSource, productionSource, scenarioSource, runtimeSource, hostSource, appSource, ledger, policy] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(join(repositoryRoot, "experiments/react-migration/src/modules/dispatch/production-model.ts"), "utf8"),
    readFile(join(repositoryRoot, "experiments/react-migration/src/modules/dispatch/DispatchScenario.tsx"), "utf8"),
    readFile(join(repositoryRoot, "src/modules/dispatch/runtime.js"), "utf8"),
    readFile(join(repositoryRoot, "src/modules/dispatch/react_island_host.ts"), "utf8"),
    readFile(join(repositoryRoot, "src/app.js"), "utf8"),
    readFile(join(repositoryRoot, "experiments/react-migration/cutover-ledger.json"), "utf8").then(JSON.parse),
    readFile(join(repositoryRoot, "react-runtime-policy.json"), "utf8").then(JSON.parse),
  ]);
  assert.doesNotMatch(`${adapterSource}\n${productionSource}`, /mock|fixture|placeholder|renderDispatchModulePage|modules\/dispatch\/render/u, "typed Dispatch model must have no demo or legacy renderer fallback");
  assert.match(scenarioSource, /data-react-production-marker="dispatch"[^>]*>React TS · read-only</u);
  assert.doesNotMatch(scenarioSource, /fetch\(|localStorage|sessionStorage|onRequestLegacy/u);
  assert.doesNotMatch(runtimeSource, /\.\/render\.js|renderDispatchModulePage/u, "normal Dispatch graph must not import the rollback renderer");
  assert.match(runtimeSource, /ensureDispatchReactProduction/u);
  assert.match(hostSource, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/u);
  assert.match(hostSource, /data-react-island-runtime-mode="react"/u);
  assert.match(appSource, /getDispatchReactProductionPayload/u);
  assert.match(appSource, /shiftExecutionDispatchReadModel\.refresh\(\{ \.\.\.scope, force \}\)/u);
  assert.match(appSource, /DISPATCH_REACT_PRODUCTION_MAX_AGE_MS\s*=\s*30_000/u, "Dispatch cache must expire after 30 seconds");
  assert.match(appSource, /function scheduleDispatchReactProductionRefresh\(\)/u, "an open Dispatch module must schedule its next bounded refresh");
  assert.match(appSource, /clearTimeout\(dispatchReactProductionRefreshTimer\)/u, "Dispatch refresh scheduling must deduplicate timers");
  assert.match(appSource, /if \(ui\?\.activeModule !== "dispatch"\) return;[\s\S]*ensureDispatchReactProduction\(\{ force: true \}\)/u, "the refresh timer must stop after route exit and force a fresh read only while Dispatch remains active");
  assert.match(appSource, /\["ready", "error"\]\.includes\(dispatchReactProductionState\.status\)\) scheduleDispatchReactProductionRefresh\(\)/u, "ready and failed reads must both receive one bounded follow-up refresh");
  assert.match(appSource, /dispatchReactProductionState\.coverageComplete === true[\s\S]*currentScopeReady[\s\S]*cacheFresh/u, "the ready short-circuit must require authority, exact scope and a fresh cache");
  assert.match(appSource, /status === "error" && failedScopeStillCurrent && cacheFresh/u, "failed reads must use the same bounded cooldown instead of a render retry loop");
  assert.match(appSource, /if \(result\.coverageComplete !== true\)/u, "a partial Shift Execution response must fail closed");
  assert.doesNotMatch(appSource, /emptyScope:\s*true,\s*coverageComplete:\s*true/u, "an empty Planning scope must not claim complete server authority");
  assert.match(appSource, /getDispatchReactActivation,/u);
  assert.equal(ledger.islands.find((entry) => entry.id === "dispatch")?.disposition, "migration-required");
  assert.equal(ledger.modules.find((entry) => entry.id === "dispatch")?.functionalStatus, "read-only-complete");
  assert.equal(ledger.modules.find((entry) => entry.id === "dispatch")?.productionReady, false, "Pilot acceptance must remain deferred");
  assert.equal(policy.surfaces.dispatch, "react");

  console.log("Dispatch React production model QA: OK");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
