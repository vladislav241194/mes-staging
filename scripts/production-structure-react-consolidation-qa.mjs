import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const appSource = await readFile(join(root, "src", "app.js"), "utf8");
const hostSource = await readFile(join(root, "src", "modules", "production_structure_matrix", "react_island_host.js"), "utf8");
const policy = JSON.parse(await readFile(join(root, "react-runtime-policy.json"), "utf8"));
const registries = [
  ["employees", "structureEmployees"],
  ["positions", "structurePositions"],
  ["org-units", "structureOrgUnits"],
  ["work-centers", "structureWorkCenters"],
  ["equipment", "structureEquipment"],
  ["responsibility-policies", "structureResponsibilityPolicies"],
];

for (const [, surfaceId] of registries) assert.equal(policy.surfaces[surfaceId], "react", `${surfaceId}: signed candidate policy must select permanent React`);
assert.match(hostSource, /canFallbackToLegacy: \(activation\) => activation\.accessMode !== "react"/);
assert.match(hostSource, /onNavigateRegistry: \(registryId\) => navigateRegistry\?\.\(registryId\)/);
assert.doesNotMatch(hostSource.slice(0, hostSource.indexOf("const STRUCTURE_MIGRATION_DIAGNOSTICS_FAILURE_REASONS")), /onRequestLegacy/);

const routeStart = appSource.indexOf("    productionStructureMatrix: {");
const routeEnd = appSource.indexOf("    timesheet: {", routeStart);
const routeSource = appSource.slice(routeStart, routeEnd);
assert(routeStart > 0 && routeEnd > routeStart, "Production Structure route block must remain discoverable");
assert.match(routeSource, /getProductionStructureMatrixActiveRegistry\(\) === "migrationDiagnostics"\) ensureProductionStructureMatrixModule\(\)/);
assert.match(routeSource, /if \(reactDecision\.activateReact\) return activeReactHost\.renderTarget\(\);\s*ensureProductionStructureMatrixModule\(\);/);
assert.doesNotMatch(routeSource, /ensureLegacyProductionStructure|productionStructureMatrixData/);
assert.match(appSource, /resolveReactRuntimeActivation\(\{\s*surfaceId,/);
assert.match(appSource, /systemDomainsServerCommandState\.configured === true/);
assert.match(appSource, /systemDomainsServerCommandState\.primaryAuthority === true/);
assert.match(appSource, /systemDomainsServerCommandState\.consistencyMatches === true/);
assert.match(appSource, /systemDomainsServerCommandState\.actorAuthorized === true/);
assert.match(appSource, /beginNomenclatureEmployeeElevation\("productionStructureMatrix", registryId\)/);
assert.equal((appSource.match(/command\.type === "request-elevation"/g) || []).length >= 8, true, "six Structure registries plus existing permanent consumers must expose typed elevation commands");
assert.match(appSource, /resetSystemDomainsServerCapabilities\(\);/);
assert.match(appSource, /hydrateSystemDomainsServerRead\(returnModule, \{ fallbackToLegacy: false, force: true \}\)/);
assert.equal((appSource.match(/navigateRegistry: navigateProductionStructureRegistry/g) || []).length, 6);

for (const [moduleId] of registries) {
  const island = await readFile(join(root, "experiments", "react-migration", "src", `structure-${moduleId}-island.tsx`), "utf8");
  const moduleRoot = join(root, "experiments", "react-migration", "src", "modules", `structure-${moduleId}`);
  const scenario = await readFile(join(moduleRoot, `Structure${moduleId.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}Scenario.tsx`), "utf8");
  const readScenario = await readFile(join(moduleRoot, `Structure${moduleId.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}ReadScenario.tsx`), "utf8");
  const viewModel = await readFile(join(moduleRoot, "view-model.ts"), "utf8");
  for (const source of [island, scenario, readScenario]) {
    assert.match(source, /onNavigateRegistry/);
    assert.doesNotMatch(source, /onRequestLegacy/);
  }
  assert.match(scenario, /"request-elevation"/);
  assert.match(scenario, /Подтвердить PIN/);
  assert.doesNotMatch(viewModel, /"legacy" as const/);
}

console.log("Production Structure consolidation QA passed: signed permanent route, typed navigation, no normal legacy-data dependency.");
