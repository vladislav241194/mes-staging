import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MES_MODULE_BLUEPRINT_REGISTRY } from "../src/module_registry.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationRoot = join(repositoryRoot, "experiments", "react-migration");
const ledger = JSON.parse(await readFile(join(migrationRoot, "cutover-ledger.json"), "utf8"));
const commandMatrix = JSON.parse(await readFile(join(migrationRoot, "command-parity-matrix.json"), "utf8"));

const unique = (values) => new Set(values).size === values.length;
const sorted = (values) => [...values].sort();
async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return paths.flat();
}

assert.equal(ledger.schemaVersion, 2, "cutover ledger schema must be explicit");
assert.equal(ledger.designSystem, "mes-line", "React cutover must retain the MES Line design system");
assert.equal(ledger.updatedAt, "2026-07-21", "cutover ledger date must match the audited baseline");
assert.equal(ledger.baselineProgress, 46, "the pre-rollout audited baseline must remain explicit");
assert.equal(ledger.activePilotRelease, "v.1.500.19-53022a2", "Pilot evidence must name the immutable accepted release");
assert.equal(ledger.legacyRollbackRelease, "v.1.500.18-93d02ed", "Pilot evidence must retain the pinned legacy rollback release");

const criteriaIds = ledger.criteria.map((criterion) => criterion.id);
assert.deepEqual(criteriaIds, [
  "typed-scope",
  "functional-parity",
  "pilot-acceptance",
  "permanent-runtime",
  "legacy-consolidation",
  "quality-controls",
]);
assert(unique(criteriaIds), "cutover criteria must be unique");
assert(ledger.criteria.every((criterion) => Number.isInteger(criterion.maximum) && criterion.maximum > 0));
assert(ledger.criteria.every((criterion) => Number.isInteger(criterion.earned) && criterion.earned >= 0 && criterion.earned <= criterion.maximum));
assert.equal(ledger.criteria.reduce((sum, criterion) => sum + criterion.maximum, 0), 100, "cutover criteria must total 100 points");
const computedProgress = ledger.criteria.reduce((sum, criterion) => sum + criterion.earned, 0);
assert.equal(computedProgress, ledger.currentProgress, "reported progress must equal the evidence-weighted criterion total");
assert.equal(computedProgress, 48, "one permanent Pilot surface raises the audited cutover progress conservatively to 48%");

assert.deepEqual(ledger.permanentPilotEvidence?.reactSurfaces, ["weeklyProductionControl"], "only Weekly Production Control is permanently React on Pilot");
assert.deepEqual(ledger.permanentPilotEvidence?.activeEvaluationSurfaces, [], "permanent acceptance may not depend on an evaluation surface");
assert.equal(ledger.permanentPilotEvidence?.evaluationFlags, "absent", "permanent acceptance may not depend on evaluation flags");
assert.equal(ledger.permanentPilotEvidence?.evaluationDropins, 0, "permanent acceptance may not depend on evaluation drop-ins");
assert.deepEqual(ledger.permanentPilotEvidence?.health, { local: "ok", public: "ok" }, "both local and public Pilot health must be recorded");
assert.equal(ledger.permanentPilotEvidence?.authenticatedPilot?.tableRows, 25, "authenticated Weekly Pilot table must retain the accepted row count");
assert.equal(ledger.permanentPilotEvidence?.authenticatedPilot?.tableHeaders, 11, "authenticated Weekly Pilot table must retain the accepted header count");
assert.deepEqual(ledger.permanentPilotEvidence?.authenticatedPilot?.viewports, ["desktop", "narrow"], "authenticated Weekly acceptance must cover desktop and narrow viewports");
assert.equal(ledger.permanentPilotEvidence?.authenticatedPilot?.queryIsolation, "verified", "authenticated Weekly acceptance must prove query isolation");
assert.equal(ledger.permanentPilotEvidence?.authenticatedPilot?.console, "clean", "authenticated Weekly acceptance must retain a clean browser console");
assert.deepEqual(ledger.permanentPilotEvidence?.rollbackDrill, {
  status: "verified",
  target: "v.1.500.18-93d02ed",
  reactivation: "verified",
}, "permanent Weekly acceptance must include rollback to the pinned legacy release and reactivation");

const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const dependencyNames = Object.keys({
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {}),
  ...(packageJson.optionalDependencies || {}),
});
assert.equal(dependencyNames.some((name) => name.startsWith("@blueprintjs/")), false, "the abandoned Blueprint UI library must not enter MES Line");

const registeredModuleIds = MES_MODULE_BLUEPRINT_REGISTRY.map((module) => module.id);
const ledgerModuleIds = ledger.modules.map((module) => module.id);
assert.equal(registeredModuleIds.length, 16, "the top-level MES registry must retain sixteen audited routes");
assert(unique(ledgerModuleIds), "every top-level route must appear exactly once in the cutover ledger");
assert.deepEqual(sorted(ledgerModuleIds), sorted(registeredModuleIds), "cutover ledger must cover every top-level MES route and no invented route");
const registryById = new Map(MES_MODULE_BLUEPRINT_REGISTRY.map((module) => [module.id, module]));

const allowedReactSurfaces = new Set(["production-island", "mock-island", "missing"]);
const allowedFunctionalStatuses = new Set(["complete", "partial", "read-only-complete", "placeholder", "mock"]);
const allowedRuntimeModes = new Set(["legacy-default", "legacy-placeholder", "react-mock", "react"]);
for (const module of ledger.modules) {
  assert.equal(module.navigationScope, registryById.get(module.id)?.navigation.scope, `${module.id}: navigation scope must match the runtime registry`);
  assert(allowedReactSurfaces.has(module.reactSurface), `${module.id}: unsupported React surface`);
  assert(allowedFunctionalStatuses.has(module.functionalStatus), `${module.id}: unsupported functional status`);
  assert(allowedRuntimeModes.has(module.runtimeMode), `${module.id}: unsupported runtime mode`);
  assert.equal(typeof module.normalLegacyPath, "boolean", `${module.id}: normal legacy path must be explicit`);
  assert.equal(typeof module.productionReady, "boolean", `${module.id}: production readiness must be explicit`);
  assert(Array.isArray(module.remainingScopes), `${module.id}: remaining scope must be explicit`);
  if (!module.productionReady) {
    assert(module.remainingScopes.length > 0, `${module.id}: remaining scope must stay visible before production acceptance`);
  }
  if (module.productionReady) {
    assert.equal(module.reactSurface, "production-island", `${module.id}: production-ready route must have a production React surface`);
    assert(["complete", "read-only-complete"].includes(module.functionalStatus), `${module.id}: production-ready route must have complete functional parity`);
    assert.equal(module.runtimeMode, "react", `${module.id}: production-ready route must be permanently React`);
    assert.equal(module.normalLegacyPath, false, `${module.id}: production-ready route may not use legacy in the normal path`);
  }
}

const aliasIds = ledger.aliases.map((alias) => alias.id);
assert(unique(aliasIds), "deep-link aliases must be unique");
assert(ledger.aliases.every((alias) => ledgerModuleIds.includes(alias.routeId)), "every alias must resolve to a registered top-level route");
const planningCoreSource = await readFile(join(repositoryRoot, "src", "modules", "planning_core", "service.js"), "utf8");
for (const alias of ledger.aliases) {
  assert(planningCoreSource.includes(`${alias.id}: "${alias.routeId}"`), `${alias.id}: ledger alias must match the deep-link resolver`);
}

const islandIds = ledger.islands.map((island) => island.id);
const islandEntries = ledger.islands.map((island) => island.entry);
assert.equal(ledger.islands.length, 25, "all twenty-five React island entries must be audited");
assert(unique(islandIds), "React island IDs must be unique");
assert(unique(islandEntries), "React island entries must be unique");
assert(ledger.islands.every((island) => ledgerModuleIds.includes(island.routeId)), "every React island must map to a registered route");
assert(ledger.islands.every((island) => ["migration-required", "mock-not-production"].includes(island.disposition)), "React island disposition must use the closed vocabulary");
assert(ledger.islands.every((island) => typeof island.normalActionFallback === "boolean"), "normal-action fallback must be explicit for every island");
assert(ledger.islands.every((island) => Array.isArray(island.commands?.implemented) && Array.isArray(island.commands?.missing)), "implemented and missing commands must be explicit for every island");
const discoveredIslandEntries = (await listFiles(join(migrationRoot, "src")))
  .filter((path) => path.endsWith("-island.tsx"))
  .map((path) => path.slice(repositoryRoot.length + 1));
assert.deepEqual(sorted(islandEntries), sorted(discoveredIslandEntries), "every built React island entry must appear exactly once in the cutover ledger");
assert.deepEqual(ledger.islands.filter((island) => island.disposition === "mock-not-production").map((island) => island.id), ["marking"], "Marking is the only explicitly non-production MOCK island");
assert.equal(ledger.islands.filter((island) => island.normalActionFallback).length, 21, "twenty-one island surfaces still expose normal user-action fallback to legacy");
for (const island of ledger.islands) {
  const module = ledger.modules.find((candidate) => candidate.id === island.routeId);
  if (island.commands.missing.length || island.normalActionFallback || island.disposition !== "migration-required") {
    assert.equal(module.productionReady, false, `${island.id}: incomplete or fallback surface cannot be production-ready`);
  }
}

assert.deepEqual(
  ledger.modules.filter((module) => module.reactSurface === "missing").map((module) => module.id),
  ["dispatch"],
  "Dispatch must remain an explicit missing React surface until scoped or excluded",
);
assert.deepEqual(
  ledger.modules.filter((module) => module.reactSurface === "mock-island").map((module) => module.id),
  ["marking"],
  "Marking must remain explicitly MOCK until it has an owner, API and persistence",
);
assert.deepEqual(
  ledger.modules.filter((module) => module.runtimeMode === "react").map((module) => module.id),
  ["weeklyProductionControl"],
  "Weekly Production Control is the only permanent React module on the accepted Pilot release",
);
assert.deepEqual(
  ledger.modules.filter((module) => module.productionReady).map((module) => module.id),
  ["weeklyProductionControl"],
  "Weekly Production Control is the only production-ready route on the accepted Pilot release",
);

const commandScenarioIds = commandMatrix.scenarios.map((scenario) => scenario.id);
const acceptanceIds = ledger.scenarioAcceptance.map((scenario) => scenario.id);
const mappedScenarioIds = ledger.modules.flatMap((module) => module.scenarios);
assert(unique(acceptanceIds), "scenario acceptance rows must be unique");
assert(unique(mappedScenarioIds), "each command scenario must map to exactly one top-level route");
assert.deepEqual(sorted(acceptanceIds), sorted(commandScenarioIds), "every command scenario needs a Pilot acceptance row");
assert.deepEqual(sorted(mappedScenarioIds), sorted(commandScenarioIds), "every command scenario needs one top-level route owner");

const allowedPilotReads = new Set(["accepted", "pending"]);
const allowedPilotWrites = new Set(["accepted", "pending", "not-applicable"]);
const allowedCleanupStatuses = new Set(["verified", "pending", "not-applicable"]);
assert(ledger.scenarioAcceptance.every((scenario) => allowedPilotReads.has(scenario.historicalPilotRead)), "historical Pilot read status must use the closed vocabulary");
assert(ledger.scenarioAcceptance.every((scenario) => allowedPilotReads.has(scenario.currentReleaseRead)), "current-release Pilot read status must use the closed vocabulary");
assert(ledger.scenarioAcceptance.every((scenario) => allowedPilotWrites.has(scenario.pilotWrite)), "Pilot write status must use the closed vocabulary");
assert(ledger.scenarioAcceptance.every((scenario) => allowedCleanupStatuses.has(scenario.cleanup)), "cleanup status must use the closed vocabulary");
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.defaultOn).map((scenario) => scenario.id),
  ["weeklyProductionControl"],
  "only Weekly Production Control may claim permanent default-on acceptance",
);
assert.equal(ledger.scenarioAcceptance.filter((scenario) => scenario.historicalPilotRead === "accepted").length, 21, "historical Pilot read evidence is 21/24 across releases");
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.historicalPilotRead === "pending").map((scenario) => scenario.id),
  ["boards", "structureResponsibilityPolicies", "contourAdmin"],
  "the three historically missing Pilot read scenarios must stay explicit",
);
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.currentReleaseRead === "accepted").map((scenario) => scenario.id),
  ["weeklyProductionControl"],
  "only Weekly Production Control has read evidence on the current accepted release",
);
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.pilotWrite === "accepted").map((scenario) => scenario.id),
  ["nomenclature"],
  "only Nomenclature has a proven Pilot write lifecycle on this baseline",
);
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.cleanup === "verified").map((scenario) => scenario.id),
  ["nomenclature"],
  "only Nomenclature has verified Pilot cleanup on this baseline",
);
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.pilotWrite === "not-applicable").map((scenario) => scenario.id),
  ["structureMigrationDiagnostics", "weeklyProductionControl"],
  "only the two read-only scenarios may skip Pilot write acceptance",
);

if (computedProgress === 100) {
  assert(ledger.modules.every((module) => module.productionReady), "100% requires every in-scope route to be production-ready");
  assert(ledger.scenarioAcceptance.every((scenario) => scenario.currentReleaseRead === "accepted"), "100% requires complete same-release Pilot read acceptance");
  assert(ledger.scenarioAcceptance.every((scenario) => ["accepted", "not-applicable"].includes(scenario.pilotWrite)), "100% requires complete Pilot write acceptance");
}

console.log(`React cutover ledger QA passed: ${ledger.modules.length} routes, ${commandScenarioIds.length} scenarios, ${computedProgress}% audited progress, 1 permanent React surface, 21/24 historical Pilot reads, 1/24 current-release reads, 1/22 Pilot writes.`);
