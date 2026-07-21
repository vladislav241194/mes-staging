import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const appSource = await readFile(join(root, "src", "app.js"), "utf8");
const hostSource = await readFile(join(root, "src", "modules", "production_structure_matrix", "react_island_host.js"), "utf8");
const capabilitiesSource = await readFile(join(root, "src", "modules", "production_structure_matrix", "server_capabilities.js"), "utf8");
const lifecycleSource = await readFile(join(root, "src", "modules", "production_structure_matrix", "lifecycle.js"), "utf8");
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
assert.match(capabilitiesSource, /state\.configured === true/);
assert.match(capabilitiesSource, /state\.primaryAuthority === true/);
assert.match(capabilitiesSource, /state\.actorAuthorized === true/);
assert.match(capabilitiesSource, /productionStructureWriteEnabled/);
assert.match(capabilitiesSource, /productionStructureAuthorization/);
assert.match(capabilitiesSource, /authorization\.revision !== revision/);
assert.match(capabilitiesSource, /state\.consistencyRevision !== revision/);
assert.match(capabilitiesSource, /authorization\.actor\.id !== `employee:\$\{employeeId\}`/);
assert.match(capabilitiesSource, /ELEVATABLE_EMPLOYEE_SESSION_REASONS/);
assert.doesNotMatch(capabilitiesSource.slice(capabilitiesSource.indexOf("export function getProductionStructureWriteDecision")), /state\.enabled|state\.surfaces/, "Structure permission must not inherit umbrella command enablement");
const structureDecisionSource = appSource.slice(appSource.indexOf("function getProductionStructureRegistryWriteDecision"), appSource.indexOf("function canRequestProductionStructureEmployeeElevation"));
assert.doesNotMatch(structureDecisionSource, /systemDomainsServerCommandState\.enabled|systemDomainsServerCommandState\.surfaces/);
const elevationDecisionSource = appSource.slice(appSource.indexOf("function canRequestProductionStructureEmployeeElevation"), appSource.indexOf("function getProductionStructureWriteUnavailableReason"));
assert.doesNotMatch(elevationDecisionSource, /isEmployeeServerAuthAvailable/);
assert.match(appSource, /beginNomenclatureEmployeeElevation\("productionStructureMatrix", registryId\)/);
assert.equal((appSource.match(/command\.type === "request-elevation"/g) || []).length >= 8, true, "six Structure registries plus existing permanent consumers must expose typed elevation commands");
assert.match(appSource, /resetSystemDomainsServerCapabilities\(\);/);
assert.match(appSource, /forceRehydrateSystemDomainsServerCapabilities\(returnModule, \{ refreshRead: true \}\)/);
assert.match(appSource, /isSystemDomainsCapabilitiesResponseCurrent\(\{/);
const commitSource = appSource.slice(appSource.indexOf("function commitSystemDomainsCandidate"), appSource.indexOf("function activateSystemDomains"));
assert.match(commitSource, /localCanEdit: canEditSystemDomainRegistry\(registryName\)/, "final pre-PUT Structure decision must re-check current local RBAC");
assert.doesNotMatch(commitSource, /localCanEdit: true/, "central Structure commit must not replace local RBAC with a constant");
assert.match(lifecycleSource, /validTo >= calendarDate/);
assert.match(appSource, /endActivePrimaryEmploymentAssignments\(/);
assert.equal((appSource.match(/isAssignmentActiveOnDate\(row\)/g) || []).length >= 4, true, "employee, schedule, org-unit and work-center dependency guards must share inclusive assignment lifecycle semantics");
assert.match(appSource, /positionId === positionId && isAssignmentActiveOnDate\(assignment\)/, "position archive guard must share inclusive assignment lifecycle semantics");
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
