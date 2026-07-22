import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appSource = await readFile(join(repositoryRoot, "src", "app.js"), "utf8");
const inputSource = await readFile(join(repositoryRoot, "src", "modules", "weekly_production_control", "production_read_input.js"), "utf8");
const hostSource = await readFile(join(repositoryRoot, "src", "modules", "weekly_production_control", "react_island_host.js"), "utf8");
const adapterPath = join(repositoryRoot, "experiments", "react-migration", "src", "modules", "weekly-production-control", "adapter.ts");
const adapterSource = await readFile(adapterPath, "utf8");
const modelSource = await readFile(join(repositoryRoot, "experiments", "react-migration", "src", "modules", "weekly-production-control", "production-read-model.ts"), "utf8");
const ledger = JSON.parse(await readFile(join(repositoryRoot, "experiments", "react-migration", "cutover-ledger.json"), "utf8"));

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const productionInputBoundary = between(
  appSource,
  "function getWeeklyProductionControlReadModelInput()",
  "const weeklyProductionControlReactIslandHost",
);
const weeklyHydrationBoundary = between(
  appSource,
  "function hydrateWeeklyPlanningPeriod()",
  "const PRODUCTION_STRUCTURE_REGISTRY_IDS",
);

assert.match(productionInputBoundary, /periodRows:\s*weeklyPlanningPeriodState\.rows/,
  "production DTO must consume the bounded Planning Period owner projection");
assert.match(productionInputBoundary, /projectSystemDomainWorkCenters\(systemDomainsState, \[\]\)/,
  "production DTO must project canonical work centers without a legacy fallback seed");
assert.match(productionInputBoundary, /projectSystemDomainResources\(systemDomainsState, \[\], \[\]\)/,
  "production DTO must project canonical resources without a legacy fallback seed");
for (const forbidden of [
  "getPlanningTableSlotRows",
  "getWeeklyPlanningTableSlotRows",
  "getProductionStructureWorkCenters",
  "getProductionStructureResources",
  "getLegacyProductionStructure",
  "getWeeklyProductionControlLegacyRuntimeInstance",
  "getWeeklyProductionControlModel",
]) {
  assert.equal(productionInputBoundary.includes(forbidden), false,
    `production DTO boundary must not call ${forbidden}`);
}

assert.match(appSource, /getPayload:\s*\(\)\s*=>\s*\(\{\s*productionInput:\s*getWeeklyProductionControlReadModelInput\(\)\s*\}\)/,
  "React host must receive the strict production DTO rather than a legacy model");
assert.doesNotMatch(appSource, /getPayload:\s*\(\)\s*=>\s*\(\{\s*model:\s*getWeeklyProductionControlRuntimeInstance/,
  "React host may not execute the legacy Weekly model factory");
assert.doesNotMatch(appSource, /modules\/weekly_production_control\/render\.js|selectWeeklyProductionControlRuntime|getWeeklyProductionControlLegacyRuntimeInstance|getWeeklyProductionControlRuntimeInstance|weeklyProductionControlLoadingInstance|createWeeklyProductionControlRuntimeInstance/,
  "current Weekly runtime must not retain a renderer loader, selector, loading instance, or factory");
assert.match(appSource, /initialize:\s*\(\)\s*=>\s*weeklyProductionControlProductionRuntimeInstance/,
  "factory-lazy public ports must resolve to the pure production formatter instance");
assert.match(appSource, /weeklyProductionControlReactIslandHost\.prepareRender\(\);\s*return weeklyProductionControlReactIslandHost\.renderTarget\(\)/,
  "current Weekly route must always render its React fail-closed shell");
assert.match(appSource, /weeklyProductionControl:\s*\{[\s\S]{0,900}bind:\s*\(\)\s*=>\s*\{\}/,
  "current Weekly route must not bind renderer events");
assert.match(hostSource, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/,
  "current Weekly host must fail closed for every activation mode");
assert.doesNotMatch(hostSource, /requestLegacyRender|onRequestLegacy/,
  "current Weekly host must not expose a renderer fallback callback");

assert.match(weeklyHydrationBoundary, /const typedReactRead = weeklyReactAccessMode === "react" \|\| weeklyReactAccessMode === "read-only-evaluation"/);
assert.match(weeklyHydrationBoundary, /getWeeklyPlanningPeriodLookups\(\{ canonicalOnly: typedReactRead \}\)/);
assert.match(weeklyHydrationBoundary, /typedReactRead \? \{\} : \{ resolveSlotPresentation: resolveWeeklyCompactSlotPresentation \}/,
  "canonical Weekly hydration must not invoke the compatibility slot presenter");
assert.match(weeklyHydrationBoundary, /typedReactRead \|\| !\(typeof weeklyPlanningRowsEquivalent/,
  "canonical Weekly hydration must short-circuit before the legacy local-row comparison");

assert.doesNotMatch(inputSource, /^\s*import\s/m, "raw production DTO builder must have no renderer import graph");
for (const forbidden of ["render.js", "getPlanningTableSlotRows", "getLegacyProductionStructure", "getWeeklyProductionControlModel"]) {
  assert.equal(inputSource.includes(forbidden), false, `raw production DTO builder must not reference ${forbidden}`);
}
assert.match(adapterSource, /from "\.\/production-read-model"/);
assert.match(adapterSource, /buildWeeklyProductionControlReadModel\(root\.productionInput\)/);
assert.doesNotMatch(adapterSource, /render\.js|getWeeklyProductionControlModel/);
assert.doesNotMatch(modelSource, /^\s*import\s/m, "strict Weekly model must be a self-contained pure transform");

const buildResult = await build({
  entryPoints: [adapterPath],
  bundle: true,
  write: false,
  metafile: true,
  format: "esm",
  platform: "browser",
  logLevel: "silent",
});
const adapterInputs = Object.keys(buildResult.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
assert(adapterInputs.some((path) => path.endsWith("/weekly-production-control/adapter.ts")));
assert(adapterInputs.some((path) => path.endsWith("/weekly-production-control/production-read-model.ts")));
assert.equal(adapterInputs.some((path) => path.endsWith("/src/modules/weekly_production_control/render.js")), false,
  "bundled strict adapter import graph must exclude the legacy Weekly renderer");
assert.equal(adapterInputs.some((path) => path.endsWith("/src/app.js")), false,
  "bundled strict adapter import graph must exclude the mixed application shell");

const weekly = ledger.modules.find((module) => module.id === "weeklyProductionControl");
assert(weekly);
assert.equal(weekly.visibleLegacyRendererPath, false);
assert.equal(weekly.runtimeLegacyModelDependency, false,
  "accepted-live Weekly must use the runtime-independent production read-model");
assert.equal(weekly.normalLegacyPath, false,
  "accepted-live Weekly current runtime must be React-only; rollback belongs to an immutable release");
assert.equal(weekly.productionReady, true);
assert.equal(weekly.acceptedRuntimeEvidence?.status, "accepted-live");
assert.equal(weekly.acceptedRuntimeEvidence?.release, "v.1.500.26-097d66c");
assert.equal(weekly.acceptedRuntimeEvidence?.gitCommit, "097d66c416ef61e091099c63b8bc272841c364f5");
assert.equal(weekly.acceptedRuntimeEvidence?.freshRead, "verified");
assert.equal(weekly.acceptedRuntimeEvidence?.rollbackReactivationDrill, "verified");
assert.equal(Object.hasOwn(weekly, "candidateRuntimeLegacyModelDependency"), false);
assert.equal(Object.hasOwn(weekly, "candidateEvidence"), false);
assert.equal(ledger.currentProgress, 50, "accepted-live consolidation must earn exactly two legacy-consolidation points");

console.log("Weekly Production Control runtime consolidation QA: OK (React-only current runtime; immutable-release rollback retained; global 50%)");
