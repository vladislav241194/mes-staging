import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  isSystemDomainsAssignmentActiveOnDate,
  systemDomainsAssignmentContinuesAfterDate,
  toSystemDomainsBusinessDate,
} from "../src/domain/system_domains_lifecycle.js";

const root = process.cwd();
const appSource = await readFile(join(root, "src", "app.js"), "utf8");
const hostSource = await readFile(join(root, "src", "modules", "production_structure_matrix", "react_island_host.js"), "utf8");
const capabilitiesSource = await readFile(join(root, "src", "modules", "production_structure_matrix", "server_capabilities.js"), "utf8");
const lifecycleSource = await readFile(join(root, "src", "domain", "system_domains_lifecycle.js"), "utf8");
const authPickerSource = await readFile(join(root, "experiments", "react-migration", "src", "modules", "auth-picker", "AuthPickerScenario.tsx"), "utf8");
const authPickerAdapterSource = await readFile(join(root, "experiments", "react-migration", "src", "modules", "auth-picker", "adapter.ts"), "utf8");
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
assert.equal(policy.surfaces.structureMigrationDiagnostics, "react", "structureMigrationDiagnostics: signed policy must select permanent React");
assert.match(hostSource, /canFallbackToLegacy: \(\) => false/);
assert.doesNotMatch(hostSource, /requestLegacyRender|onRequestLegacy/);
assert.match(hostSource, /onNavigateRegistry: \(registryId\) => navigateRegistry\?\.\(registryId\)/);

const routeStart = appSource.indexOf("    productionStructureMatrix: {");
const routeEnd = appSource.indexOf("    timesheet: {", routeStart);
const routeSource = appSource.slice(routeStart, routeEnd);
assert(routeStart > 0 && routeEnd > routeStart, "Production Structure route block must remain discoverable");
assert.match(routeSource, /getProductionStructureMatrixActiveRegistry\(\) === "migrationDiagnostics"\) ensureProductionStructureDiagnosticsData\(\)/);
assert.match(routeSource, /activeReactHost\.prepareRender\(\);\s*return activeReactHost\.renderTarget\(\);/);
assert.match(routeSource, /bind: \(\) => \{\}/);
assert.doesNotMatch(routeSource, /reactDecision|isReactEligible|ensureProductionStructureMatrixModule|renderProductionStructureMatrixPage|bindProductionStructureMatrixEvents|ensureLegacyProductionStructure|productionStructureMatrixData/);
assert.doesNotMatch(appSource, /function ensureProductionStructureMatrixModule|function initializeProductionStructureMatrixModule|import\("\.\/modules\/production_structure_matrix\/render\.js"\)/);
assert.match(appSource, /function ensureProductionStructureDiagnosticsData\(\)[\s\S]*import\("\.\/production_structure_matrix_data\.js"\)/, "Diagnostics may load raw baseline data without the legacy renderer/model");
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
assert.match(lifecycleSource, /SYSTEM_DOMAINS_BUSINESS_TIME_ZONE = "Europe\/Moscow"/);
assert.match(lifecycleSource, /return inclusive \? validTo >= businessDate : validTo > businessDate/);
assert.match(appSource, /from "\.\/domain\/system_domains_lifecycle\.js"/);
assert.doesNotMatch(appSource, /modules\/production_structure_matrix\/lifecycle\.js/);

const businessDate = "2026-07-22";
assert.equal(toSystemDomainsBusinessDate(new Date("2026-07-22T21:30:00.000Z")), "2026-07-23", "Structure lifecycle must use the Europe/Moscow business date");
assert.equal(isSystemDomainsAssignmentActiveOnDate({ validTo: businessDate }, businessDate), true, "validTo is inclusive for dependency guards");
assert.equal(isSystemDomainsAssignmentActiveOnDate({ validTo: "2026-07-21" }, businessDate), false, "an assignment ending before the business date must not block archive");
assert.equal(isSystemDomainsAssignmentActiveOnDate({ validTo: "not-a-date" }, businessDate), true, "malformed dates must fail closed as active");
assert.equal(isSystemDomainsAssignmentActiveOnDate({ isActive: false, validTo: "" }, businessDate), false, "an explicitly inactive assignment must not block archive");
assert.equal(systemDomainsAssignmentContinuesAfterDate({ validTo: businessDate }, businessDate), false, "an assignment already capped today needs no archive rewrite");
assert.equal(systemDomainsAssignmentContinuesAfterDate({ validTo: "2026-07-23" }, businessDate), true, "a future primary assignment must be capped on employee archive");

assert.equal((appSource.match(/isSystemDomainsAssignmentActiveOnDate\(/g) || []).length >= 5, true, "employee, schedule, position, org-unit and work-center guards must share the common inclusive lifecycle policy");
assert.match(appSource, /row\.employeeId === employeeId && row\.isPrimary === false && isSystemDomainsAssignmentActiveOnDate\(row, businessDate\)/, "employee archive must block an active secondary assignment");
assert.match(appSource, /row\.employeeId === employeeId && isSystemDomainsAssignmentActiveOnDate\(row, businessDate\)/, "employee archive must block an active schedule assignment");
assert.match(appSource, /assignment\.positionId === positionId && isSystemDomainsAssignmentActiveOnDate\(assignment, businessDate\)/, "position archive guard must use inclusive assignment lifecycle semantics");
assert.match(appSource, /row\.orgUnitId === orgUnitId && isSystemDomainsAssignmentActiveOnDate\(row, toSystemDomainsBusinessDate\(new Date\(\)\)\)/, "org-unit archive guard must use the shared Pilot business date");
assert.match(appSource, /row\.workCenterId === workCenterId && isSystemDomainsAssignmentActiveOnDate\(row, toSystemDomainsBusinessDate\(new Date\(\)\)\)/, "work-center archive guard must use the shared Pilot business date");
const archiveSource = appSource.slice(appSource.indexOf("function archiveSystemDomainEntity"), appSource.indexOf("function getProductionStructureWorkCenters"));
assert.match(archiveSource, /assignment\.employeeId === normalizedEntityId && assignment\.isPrimary !== false\s*&& systemDomainsAssignmentContinuesAfterDate\(assignment, archiveDate\)/, "employee archive must cap only continuing primary assignments");
assert.match(archiveSource, /\? \{ \.\.\.assignment, validTo: archiveDate \}/, "employee archive must preserve hidden assignment fields while capping validTo");
assert.doesNotMatch(archiveSource, /\.\.\.assignment, validTo: archiveDate, updatedAt/, "employee archive must not invent a transient assignment timestamp");
assert.match(appSource, /returnModule === "productionStructureMatrix"[\s\S]*\? "production-structure"/, "Structure PIN elevation must expose only the allowlisted owning module target");
assert.match(authPickerAdapterSource, /rawElevationTarget === "planning" \|\| rawElevationTarget === "production-structure"[\s\S]*: "nomenclature"/, "Auth picker adapter must fail unknown elevation targets back to Nomenclature");
assert.match(authPickerSource, /"production-structure": \{[\s\S]*eyebrow: "Структура и сотрудники"[\s\S]*серверные команды производственной структуры/, "Structure PIN elevation must identify and describe its command scope truthfully");
assert.match(authPickerSource, /model\.elevation \? elevationCopy\.eyebrow/);
assert.match(authPickerSource, /model\.elevation \? elevationCopy\.description/);
assert.doesNotMatch(authPickerSource, /model\.elevation \? "Номенклатура"/, "Auth picker must not hard-code Nomenclature for every protected module");
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
