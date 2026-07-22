import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MES_MODULE_BLUEPRINT_REGISTRY } from "../src/module_registry.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationRoot = join(repositoryRoot, "experiments", "react-migration");
const ledger = JSON.parse(await readFile(join(migrationRoot, "cutover-ledger.json"), "utf8"));
const commandMatrix = JSON.parse(await readFile(join(migrationRoot, "command-parity-matrix.json"), "utf8"));
const runtimePolicyText = await readFile(join(repositoryRoot, "react-runtime-policy.json"), "utf8");
const runtimePolicy = JSON.parse(runtimePolicyText);
const runtimePolicySha256 = createHash("sha256").update(runtimePolicyText).digest("hex");
const indexHtml = await readFile(join(repositoryRoot, "index.html"), "utf8");
const liveVisualOverrides = await readFile(join(repositoryRoot, "styles", "visual-overrides.live.css"), "utf8");

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

assert.equal(ledger.schemaVersion, 3, "cutover ledger schema must be explicit");
assert.equal(ledger.designSystem, "mes-line", "React cutover must retain the MES Line design system");
assert.equal(ledger.updatedAt, "2026-07-22", "cutover ledger date must match the accelerated implementation checkpoint");
assert.equal(ledger.baselineProgress, 46, "the pre-rollout audited baseline must remain explicit");
assert.equal(ledger.implementationProgress, 98, "accelerated implementation progress must remain separate from evidence-weighted acceptance");
assert.equal(ledger.implementationProgressUpdatedAt, "2026-07-22", "implementation progress must name its checkpoint date");
assert.equal(ledger.implementationProgressBasis, "16/16 top-level routes have React UI: 11 complete (Dispatch is production-backed read-only), 4 partial and 1 explicit prototype; Dispatch no longer loads its rollback renderer on the normal path, bringing accelerated implementation to 98%, while strict Pilot acceptance remains separate at 50%.", "implementation progress must retain its auditable route basis");
assert(ledger.implementationProgress >= ledger.currentProgress, "implementation progress may not understate evidence-weighted acceptance");
assert.equal(ledger.acceptedPilotRelease, "v.1.500.26-097d66c", "permanent Pilot evidence must name the immutable active release");
assert.equal(ledger.acceptedPilotPreviousRelease, "v.1.500.25-1f8369c", "permanent Pilot evidence must name its immutable immediate rollback release");
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
assert.deepEqual(Object.fromEntries(ledger.criteria.map((criterion) => [criterion.id, criterion.earned])), {
  "typed-scope": 14,
  "functional-parity": 18,
  "pilot-acceptance": 9,
  "permanent-runtime": 2,
  "legacy-consolidation": 2,
  "quality-controls": 5,
}, "the Weekly acceptance may add only two legacy-consolidation points");
const computedProgress = ledger.criteria.reduce((sum, criterion) => sum + criterion.earned, 0);
assert.equal(computedProgress, ledger.currentProgress, "reported progress must equal the evidence-weighted criterion total");
const auditedWeeklyModule = ledger.modules.find((module) => module.id === "weeklyProductionControl");
const weeklyAcceptedRuntimeEvidence = auditedWeeklyModule?.acceptedRuntimeEvidence;
const weeklyLegacyConsolidationAccepted = auditedWeeklyModule?.runtimeLegacyModelDependency === false
  && auditedWeeklyModule?.normalLegacyPath === false
  && auditedWeeklyModule?.productionReady === true
  && weeklyAcceptedRuntimeEvidence?.status === "accepted-live"
  && weeklyAcceptedRuntimeEvidence?.release === "v.1.500.26-097d66c"
  && weeklyAcceptedRuntimeEvidence?.gitCommit === "097d66c416ef61e091099c63b8bc272841c364f5"
  && weeklyAcceptedRuntimeEvidence?.pilotPublication === "verified"
  && weeklyAcceptedRuntimeEvidence?.freshRead === "verified"
  && weeklyAcceptedRuntimeEvidence?.rollbackReactivationDrill === "verified";
const expectedProgress = weeklyLegacyConsolidationAccepted ? 50 : 48;
assert.equal(computedProgress, expectedProgress, "Weekly legacy-consolidation credit requires accepted-live runtime isolation, fresh Pilot read and rollback/reactivation evidence");
assert.equal(
  ledger.criteria.find((criterion) => criterion.id === "legacy-consolidation")?.earned,
  weeklyLegacyConsolidationAccepted ? 2 : 0,
  "legacy-consolidation points must follow the complete accepted-live Weekly evidence",
);
assert.equal(weeklyLegacyConsolidationAccepted, true, "the audited ledger must retain the complete accepted-live Weekly consolidation proof");
assert.equal(Object.hasOwn(auditedWeeklyModule, "candidateRuntimeLegacyModelDependency"), false, "accepted Weekly evidence may not retain a pending candidate dependency field");
assert.equal(Object.hasOwn(auditedWeeklyModule, "candidateEvidence"), false, "accepted Weekly evidence may not retain a pending candidate evidence field");
assert.deepEqual(weeklyAcceptedRuntimeEvidence?.proof, [
  "strict-typecheck",
  "model-parity",
  "import-graph",
  "production-shell",
  "authenticated-pilot-read",
  "previous-release-rollback-reactivation",
], "accepted Weekly evidence must retain its local and Pilot proof chain");
assert.equal(weeklyAcceptedRuntimeEvidence?.sourceTreeSha256, "5e18604248301baac1226a16f7107efb88ad699687efc85a6c2d8c1853197845");
assert.equal(weeklyAcceptedRuntimeEvidence?.distTreeSha256, "af65df86efa81557f3d2f5d4a805d1c1da9f40f57b0a4ee8d7ad5b3bcd1485d2");
assert.deepEqual(weeklyAcceptedRuntimeEvidence?.rowTextParity, {
  baselineRelease: "v.1.500.25-1f8369c",
  status: "exact-identical",
}, "accepted Weekly row text must exactly match the immutable previous release");

assert.equal(ledger.permanentPilotEvidence?.release, ledger.acceptedPilotRelease, "permanent Pilot evidence must bind the accepted immutable release");
assert.equal(ledger.permanentPilotEvidence?.gitCommit, "097d66c416ef61e091099c63b8bc272841c364f5", "permanent Pilot evidence must bind the exact source commit");
assert.equal(ledger.permanentPilotEvidence?.sourceTreeSha256, "5e18604248301baac1226a16f7107efb88ad699687efc85a6c2d8c1853197845", "permanent Pilot evidence must bind the exact source tree");
assert.equal(ledger.permanentPilotEvidence?.distTreeSha256, "af65df86efa81557f3d2f5d4a805d1c1da9f40f57b0a4ee8d7ad5b3bcd1485d2", "permanent Pilot evidence must bind the exact built tree");
const acceptedSurfaceIds = sorted(ledger.scenarioAcceptance.filter((scenario) => scenario.defaultOn).map((scenario) => scenario.id));
const evidenceAcceptedSurfaceIds = sorted(ledger.permanentPilotEvidence?.reactSurfaces || []);
assert.deepEqual(acceptedSurfaceIds, evidenceAcceptedSurfaceIds, "accepted IDs must be derived from matching scenario default-on and permanent Pilot evidence");
assert.equal(acceptedSurfaceIds.length, 2, "the accepted Pilot baseline must retain exactly two permanent React surfaces");
assert.equal(ledger.permanentPilotEvidence?.runtimePolicySha256, "bf7af8065ad83206742725a003c5cc11f6eefaf21b314220f45f6c24480674b4", "permanent Pilot evidence must bind the exact runtime policy");
assert.deepEqual(ledger.permanentPilotEvidence?.activeEvaluationSurfaces, [], "permanent acceptance may not depend on an evaluation surface");
assert.equal(ledger.permanentPilotEvidence?.evaluationFlags, "absent", "permanent acceptance may not depend on evaluation flags");
assert.equal(ledger.permanentPilotEvidence?.evaluationDropins, 0, "permanent acceptance may not depend on evaluation drop-ins");
assert.deepEqual(ledger.permanentPilotEvidence?.health, { local: "ok", public: "ok", sharedState: "ready" }, "local/public health and shared-state readiness must be recorded");
assert.deepEqual(ledger.permanentPilotEvidence?.commandOwnerHashes, {
  baselineRelease: "v.1.500.25-1f8369c",
  comparison: "unchanged",
}, "Weekly-only rollout must retain byte-identical command-owner configuration");
const diagnosticsPilotEvidence = ledger.permanentPilotEvidence?.authenticatedPilot?.structureMigrationDiagnostics;
assert.equal(diagnosticsPilotEvidence?.evidenceRelease, "v.1.500.21-8fb92d9", "Diagnostics browser evidence remains historical and may not masquerade as a .26 recheck");
assert.equal(diagnosticsPilotEvidence?.tableRows, 152, "authenticated Diagnostics Pilot table must retain all legacy rows");
assert.equal(diagnosticsPilotEvidence?.tableHeaders, 5, "authenticated Diagnostics Pilot table must retain the accepted header count");
assert.equal(diagnosticsPilotEvidence?.sourceFields, 51, "authenticated Diagnostics Pilot evidence must retain the legacy source-field count");
assert.deepEqual(diagnosticsPilotEvidence?.metrics, [152, 76, 19, 49, 0, 0], "authenticated Diagnostics Pilot metrics must match the current owner projection");
assert.equal(diagnosticsPilotEvidence?.issueGroups, 4, "authenticated Diagnostics Pilot evidence must retain all issue groups");
assert.equal(diagnosticsPilotEvidence?.registryLinks, 7, "authenticated Diagnostics Pilot evidence must cover every adjacent registry link");
assert.deepEqual(diagnosticsPilotEvidence?.viewports, ["desktop"], "current-release Diagnostics evidence may only claim the verified desktop viewport");
assert.equal(diagnosticsPilotEvidence?.narrowViewport, "not-reverified-platform-limitation", "unverified current-release narrow evidence must remain explicit");
assert.equal(diagnosticsPilotEvidence?.queryIsolation, "verified", "authenticated Diagnostics acceptance must prove query isolation");
assert.equal(diagnosticsPilotEvidence?.adjacentRegistryNavigation, "verified", "authenticated Diagnostics acceptance must prove adjacent legacy navigation");
assert.equal(diagnosticsPilotEvidence?.inputCount, 0, "read-only Diagnostics may not expose inputs");
assert.equal(diagnosticsPilotEvidence?.writeControlCount, 0, "read-only Diagnostics may not expose write controls");
assert.equal(diagnosticsPilotEvidence?.ariaBusy, false, "ready Diagnostics must clear its busy state");
assert.equal(diagnosticsPilotEvidence?.console, "clean", "authenticated Diagnostics acceptance must retain a clean browser console");

const weeklyPilotEvidence = ledger.permanentPilotEvidence?.authenticatedPilot?.weeklyProductionControl;
assert.equal(weeklyPilotEvidence?.evidenceRelease, ledger.acceptedPilotRelease, "Weekly browser evidence must bind the active immutable release");
assert.equal(weeklyPilotEvidence?.comparisonRelease, ledger.acceptedPilotPreviousRelease, "Weekly browser parity must bind the immutable previous release");
assert.equal(weeklyPilotEvidence?.tableRows, 25, "authenticated Weekly Pilot table must retain the accepted row count");
assert.equal(weeklyPilotEvidence?.tableHeaders, 11, "authenticated Weekly Pilot table must retain the accepted header count");
assert.equal(weeklyPilotEvidence?.rowTextParity, "exact-identical", "every Weekly row must exactly match the previous-release baseline");
assert.deepEqual(weeklyPilotEvidence?.viewports, ["desktop"], "current-release Weekly evidence may only claim the reverified desktop viewport");
assert.equal(weeklyPilotEvidence?.historicalNarrowAcceptanceRelease, "v.1.500.19-53022a2", "Weekly narrow acceptance must remain bound to its actual release");
assert.equal(weeklyPilotEvidence?.queryIsolation, "not-rechecked", "the .26 acceptance must not claim a query-isolation check that was not repeated");
assert.equal(weeklyPilotEvidence?.inputCount, 0, "read-only Weekly may not expose inputs");
assert.equal(weeklyPilotEvidence?.writeControlCount, 0, "read-only Weekly may not expose write controls");
assert.equal(weeklyPilotEvidence?.ariaBusy, false, "ready Weekly must clear its busy state");
assert.equal(weeklyPilotEvidence?.liveDomErrorState, "clean", "authenticated Weekly acceptance must retain a clean live DOM/error state");
assert.equal(weeklyPilotEvidence?.liveConsole, "not-captured", "the live console must stay explicitly unclaimed when it was not captured");
assert.equal(weeklyPilotEvidence?.localProductionShellConsole, "clean", "the separately verified local production-shell console must remain explicit");

assert.equal(ledger.permanentPilotEvidence?.rollbackDrill?.status, "previous-release-verified", "permanent acceptance must distinguish real previous-release rollback from legacy dry-run");
assert.deepEqual(ledger.permanentPilotEvidence?.rollbackDrill?.previous?.sequence, [
  "v.1.500.26-097d66c",
  "v.1.500.25-1f8369c",
  "v.1.500.26-097d66c",
], "previous rollback must restore and reactivate the exact immutable releases");
assert.equal(ledger.permanentPilotEvidence?.rollbackDrill?.previous?.status, "verified", "the .26 -> .25 -> .26 drill was a real rollback/reactivation");
assert.equal(ledger.permanentPilotEvidence?.rollbackDrill?.previous?.weeklyRowTextParity, "exact-identical", "rollback and reactivation must retain exact Weekly rows");
assert.deepEqual(ledger.permanentPilotEvidence?.rollbackDrill?.legacyBaseline, {
  mode: "dry-run",
  resolvedRelease: "v.1.500.18-93d02ed",
  runtimePolicyReactSurfaces: [],
  status: "dry-run-verified",
  activated: false,
}, "pinned legacy evidence must record only the verified dry-run resolution and zero-surface manifest");
assert.equal(ledger.permanentPilotEvidence?.rollbackDrill?.finalRelease, ledger.acceptedPilotRelease, "rollback drill must finish on the accepted release");
assert.equal(ledger.permanentPilotEvidence?.rollbackDrill?.finalPreviousRelease, ledger.acceptedPilotPreviousRelease, "rollback drill must restore the accepted release's immediate predecessor");

assert.equal(Object.hasOwn(ledger, "livePilotEvidence"), false, "the superseded .25 evaluation may not masquerade as the active .26 release");
const historicalPilotWriteEvidence = ledger.historicalPilotWriteEvidence;
assert.equal(historicalPilotWriteEvidence?.release, "v.1.500.25-1f8369c", "historical Nomenclature evidence must retain its actual evaluation release");
assert.equal(historicalPilotWriteEvidence?.previousRelease, "v.1.500.24-200ba06", "historical write evidence must retain its immediate rollback release");
assert.equal(historicalPilotWriteEvidence?.legacyRollbackRelease, ledger.legacyRollbackRelease, "historical write evidence must retain the pinned immutable legacy rollback");
assert.equal(historicalPilotWriteEvidence?.gitCommit, "1f8369cb6725a53e029acd0d66d57a764289a79d", "historical write evidence must bind the exact commit");
assert.equal(historicalPilotWriteEvidence?.sourceTreeSha256, "b78458eda659099c50957b29c96a396adcaa6667497caa329a24f96cba12bc20", "historical write evidence must bind the exact source tree");
assert.equal(historicalPilotWriteEvidence?.distTreeSha256, "dc12962a4ec775d247f6750eb9a8bb5002c1e1c39e9428e89829da8b6726b4b3", "historical write evidence must bind the exact dist tree");
assert.equal(historicalPilotWriteEvidence?.runtimePolicySha256, ledger.permanentPilotEvidence?.runtimePolicySha256, "temporary evaluation may not alter the accepted permanent runtime policy");
assert.deepEqual(sorted(historicalPilotWriteEvidence?.reactSurfaces || []), acceptedSurfaceIds, "historical evaluation release must retain only the accepted permanent React surfaces after cleanup");
assert.deepEqual(historicalPilotWriteEvidence?.health, { local: "ok", public: "ok" }, "historical Pilot write release must have been healthy after cleanup");
assert.deepEqual(historicalPilotWriteEvidence?.evaluationAfterCleanup, {
  activeEvaluationSurfaces: [],
  evaluationFlags: "absent",
  evaluationDropins: 0,
  rollbackTimer: "inactive",
  temporaryEmployeeCredentials: 0,
  temporaryPinFiles: 0,
}, "temporary Nomenclature evaluation must leave no authorization, flag, timer or credential residue");
const historicalNomenclatureEvidence = historicalPilotWriteEvidence?.authenticatedEvaluation?.nomenclature;
assert.equal(historicalNomenclatureEvidence?.recordId, "nom-70a3f62d-93d0-46d3-b012-2c56def8e0d7", "Nomenclature lifecycle must bind the exact disposable row");
assert.equal(historicalNomenclatureEvidence?.article, "MOCK-QA-V25-20260721-0740", "Nomenclature lifecycle must bind the exact disposable article");
assert.equal(historicalNomenclatureEvidence?.writeLifecycle, "create-readback-edit-reload-readback-delete-cleanup", "Nomenclature evaluation must prove the complete lifecycle");
assert.equal(historicalNomenclatureEvidence?.ownerReadback, "verified", "Nomenclature evaluation must include authoritative owner readback");
assert(historicalNomenclatureEvidence?.eachActionDelayExceededSeconds >= 5, "live QA must prove capability refresh beyond its five-second cache TTL");
assert.deepEqual(historicalNomenclatureEvidence?.deleteImpact, { specifications: 0, bomRows: 0 }, "disposable delete must have zero cross-owner impact");
assert.equal(historicalNomenclatureEvidence?.initialRows, 0);
assert.equal(historicalNomenclatureEvidence?.finalRows, 0);
assert.equal(historicalNomenclatureEvidence?.exactIdMatchesAfterCleanup, 0);
assert.equal(historicalNomenclatureEvidence?.exactArticleMatchesAfterCleanup, 0);
assert.equal(historicalNomenclatureEvidence?.defaultOn, false, "evaluation evidence may not masquerade as permanent default-on acceptance");
assert.equal(historicalNomenclatureEvidence?.progressDelta, 0, "temporary evaluation alone may not raise global cutover progress");

const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
const dependencyNames = Object.keys({
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {}),
  ...(packageJson.optionalDependencies || {}),
});
assert.equal(dependencyNames.some((name) => name.startsWith("@blueprintjs/")), false, "the abandoned Blueprint UI library must not enter MES Line");
assert.equal(indexHtml.includes("base-blueprint"), false, "the abandoned Blueprint visual theme must not be selectable");
assert.equal(liveVisualOverrides.includes("base-blueprint"), false, "the abandoned Blueprint visual theme CSS must not remain in the live bundle");
assert(indexHtml.includes('new Set(["base-glass", "base-industrial"])'), "live visual themes must use an explicit MES-owned allowlist");

const registeredModuleIds = MES_MODULE_BLUEPRINT_REGISTRY.map((module) => module.id);
const ledgerModuleIds = ledger.modules.map((module) => module.id);
assert.equal(registeredModuleIds.length, 16, "the top-level MES registry must retain sixteen audited routes");
assert(unique(ledgerModuleIds), "every top-level route must appear exactly once in the cutover ledger");
assert.deepEqual(sorted(ledgerModuleIds), sorted(registeredModuleIds), "cutover ledger must cover every top-level MES route and no invented route");
const registryById = new Map(MES_MODULE_BLUEPRINT_REGISTRY.map((module) => [module.id, module]));

const allowedReactSurfaces = new Set(["production-island", "mock-island", "missing"]);
const allowedFunctionalStatuses = new Set(["complete", "partial", "read-only-complete", "placeholder", "mock"]);
const allowedRuntimeModes = new Set(["legacy-default", "legacy-placeholder", "react-mock", "react-candidate", "react"]);
for (const module of ledger.modules) {
  assert.equal(module.navigationScope, registryById.get(module.id)?.navigation.scope, `${module.id}: navigation scope must match the runtime registry`);
  assert(allowedReactSurfaces.has(module.reactSurface), `${module.id}: unsupported React surface`);
  assert(allowedFunctionalStatuses.has(module.functionalStatus), `${module.id}: unsupported functional status`);
  assert(allowedRuntimeModes.has(module.runtimeMode), `${module.id}: unsupported runtime mode`);
  assert.equal(typeof module.visibleLegacyRendererPath, "boolean", `${module.id}: visible legacy renderer path must be explicit`);
  assert.equal(typeof module.runtimeLegacyModelDependency, "boolean", `${module.id}: runtime legacy-model dependency must be explicit`);
  assert.equal(typeof module.normalLegacyPath, "boolean", `${module.id}: normal legacy path must be explicit`);
  assert.equal(module.normalLegacyPath, module.visibleLegacyRendererPath || module.runtimeLegacyModelDependency,
    `${module.id}: aggregate legacy path must include both renderer and runtime-model dependencies`);
  assert.equal(typeof module.productionReady, "boolean", `${module.id}: production readiness must be explicit`);
  assert(Array.isArray(module.remainingScopes), `${module.id}: remaining scope must be explicit`);
  if (!module.productionReady) {
    assert(module.remainingScopes.length > 0, `${module.id}: remaining scope must stay visible before production acceptance`);
  }
  if (module.productionReady) {
    assert.equal(module.reactSurface, "production-island", `${module.id}: production-ready route must have a production React surface`);
    assert(["complete", "read-only-complete"].includes(module.functionalStatus), `${module.id}: production-ready route must have complete functional parity`);
    assert.equal(module.runtimeMode, "react", `${module.id}: production-ready route must be permanently React`);
    assert.equal(module.visibleLegacyRendererPath, false, `${module.id}: production-ready route may not expose a visible legacy renderer`);
    assert.equal(module.runtimeLegacyModelDependency, false, `${module.id}: production-ready route may not execute a legacy model factory`);
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
assert.equal(ledger.islands.length, 26, "all twenty-six React island entries must be audited");
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
assert.deepEqual(ledger.islands.filter((island) => island.disposition === "mock-not-production").map((island) => island.id), ["marking"], "Marking must remain the only explicit non-production React prototype");
assert(ledger.islands.filter((island) => island.normalActionFallback).length <= 19, "accelerated cutover must not add normal user-action fallback to legacy");
for (const island of ledger.islands) {
  const module = ledger.modules.find((candidate) => candidate.id === island.routeId);
  if (island.commands.missing.length || island.normalActionFallback || island.disposition !== "migration-required") {
    assert.equal(module.productionReady, false, `${island.id}: incomplete or fallback surface cannot be production-ready`);
  }
}

assert.deepEqual(
  ledger.modules.filter((module) => module.reactSurface === "missing").map((module) => module.id),
  [],
  "Every registered route must now have a React surface, including explicit prototypes",
);
assert.deepEqual(
  ledger.modules.filter((module) => module.reactSurface === "mock-island").map((module) => module.id),
  ["marking"],
  "Marking must remain explicitly non-production until it has owners, APIs and persistence",
);
const reactRuntimeModules = ledger.modules.filter((module) => module.runtimeMode === "react");
assert(reactRuntimeModules.some((module) => module.id === "weeklyProductionControl"), "the accepted Weekly React route must remain permanent");
for (const module of reactRuntimeModules) {
  assert(module.scenarios.every((surfaceId) => runtimePolicy.surfaces?.[surfaceId] === "react"), `${module.id}: every permanent UI route surface must be signed React`);
}
assert.deepEqual(
  ledger.modules.filter((module) => module.productionReady).map((module) => module.id),
  auditedWeeklyModule?.runtimeLegacyModelDependency ? [] : ["weeklyProductionControl"],
  "Weekly Production Control becomes production-ready only after its runtime model is independent of legacy",
);
const productionStructureModule = ledger.modules.find((module) => module.id === "productionStructureMatrix");
assert.equal(productionStructureModule?.runtimeMode, "react", "all seven Structure destinations must use the signed React UI route");
assert.equal(productionStructureModule?.visibleLegacyRendererPath, false, "the complete Structure UI route may not expose a legacy renderer");
assert.equal(productionStructureModule?.normalLegacyPath, false, "the permanent Structure route must not load its rollback renderer/model");
assert.equal(productionStructureModule?.productionReady, false, "deferred Pilot lifecycle acceptance must remain separate from the completed React UI route");

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
assert.equal(ledger.scenarioAcceptance.filter((scenario) => scenario.historicalPilotRead === "accepted").length, 21, "historical Pilot read evidence is 21/25 across releases");
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.historicalPilotRead === "pending").map((scenario) => scenario.id),
  ["boards", "structureResponsibilityPolicies", "contourAdmin", "dispatch"],
  "the four historically missing Pilot read scenarios must stay explicit",
);
const currentReleaseAcceptedSurfaceIds = sorted(ledger.scenarioAcceptance.filter((scenario) => scenario.currentReleaseRead === "accepted").map((scenario) => scenario.id));
assert.deepEqual(currentReleaseAcceptedSurfaceIds, ["weeklyProductionControl"], "only Weekly has a fresh authenticated browser read on .26");
assert.deepEqual(sorted(Object.keys(ledger.permanentPilotEvidence?.authenticatedPilot || {})), acceptedSurfaceIds, "permanent authenticated Pilot evidence must exist only for accepted IDs");
for (const surfaceId of currentReleaseAcceptedSurfaceIds) {
  const acceptance = ledger.scenarioAcceptance.find((scenario) => scenario.id === surfaceId);
  assert.equal(acceptance?.currentReleaseRead, "accepted", `${surfaceId}: current-release acceptance must be explicit`);
  assert.equal(acceptance?.readEvidenceRelease, ledger.acceptedPilotRelease, `${surfaceId}: current-release evidence must bind the immutable active release`);
}
const diagnosticsAcceptance = ledger.scenarioAcceptance.find((scenario) => scenario.id === "structureMigrationDiagnostics");
assert.equal(diagnosticsAcceptance?.currentReleaseRead, "pending", "Diagnostics was not freshly browser-rechecked on .26");
assert.equal(diagnosticsAcceptance?.readEvidenceRelease, "v.1.500.21-8fb92d9", "Diagnostics acceptance must remain bound to its actual historical release");
assert.equal(diagnosticsPilotEvidence?.evidenceRelease, diagnosticsAcceptance?.readEvidenceRelease, "Diagnostics browser evidence and acceptance row must name the same historical release");
assert.equal(weeklyPilotEvidence?.evidenceRelease, ledger.scenarioAcceptance.find((scenario) => scenario.id === "weeklyProductionControl")?.readEvidenceRelease, "Weekly browser evidence and acceptance row must name the same current release");
const candidatePolicy = ledger.candidatePolicy ?? null;
const candidateSurfaceIds = candidatePolicy ? sorted(candidatePolicy.surfaceIds || []) : [];
const expectedRuntimeReactSurfaceIds = sorted([...new Set([...acceptedSurfaceIds, ...candidateSurfaceIds])]);
const runtimeReactSurfaceIds = sorted(Object.entries(runtimePolicy.surfaces || {})
  .filter(([, mode]) => mode === "react")
  .map(([surfaceId]) => surfaceId));
assert.deepEqual(
  runtimeReactSurfaceIds,
  expectedRuntimeReactSurfaceIds,
  candidatePolicy
    ? "runtime React IDs must equal accepted IDs plus the declared candidate IDs"
    : "runtime React IDs must equal accepted IDs when no candidate policy is declared",
);
if (candidatePolicy) {
  assert.equal(candidatePolicy.status, "awaiting-pilot-acceptance", "candidate status must make pending acceptance explicit");
  assert.deepEqual(candidateSurfaceIds, [
    "authPicker",
    "boards",
    "componentTypes",
    "contourAdmin",
    "dispatch",
    "employeeDesktop",
    "gantt",
    "nomenclature",
    "nomenclatureTypes",
    "operations",
    "planningWorkbench",
    "roles",
    "shiftMasterBoard",
    "shiftWorkOrders",
    "specifications2",
    "statuses",
    "structureEmployees",
    "structureEquipment",
    "structureOrgUnits",
    "structurePositions",
    "structureResponsibilityPolicies",
    "structureWorkCenters",
    "timesheet",
  ], "the current candidate must contain every accelerated permanent React surface awaiting Pilot acceptance");
  assert(unique(candidateSurfaceIds) && candidateSurfaceIds.length > 0, "candidate surface IDs must be non-empty and unique");
  assert(candidateSurfaceIds.every((surfaceId) => acceptanceIds.includes(surfaceId)), "every candidate must map to an audited scenario");
  assert.equal(candidatePolicy.runtimePolicySha256, runtimePolicySha256, "candidate must bind the exact current runtime policy SHA-256");
  assert.notEqual(candidatePolicy.runtimePolicySha256, ledger.permanentPilotEvidence.runtimePolicySha256, "candidate bytes must not masquerade as the already accepted policy bytes");
  assert.equal(candidatePolicy.baseAcceptedRelease, ledger.acceptedPilotRelease, "candidate must extend the current accepted release");
  assert.deepEqual(candidatePolicy.requiredEvidence, [
    "current-release-read",
    "create-edit-readback-delete-cleanup",
    "rollback-reactivation",
  ], "candidate may be accepted only after read, full disposable lifecycle, cleanup and rollback/reactivation evidence");
  assert.equal(Object.hasOwn(candidatePolicy, "pilotEvidence"), false, "awaiting candidate must not contain Pilot acceptance evidence");
  assert.equal(computedProgress, expectedProgress, "awaiting candidate must not receive progress credit");
  for (const surfaceId of candidateSurfaceIds) {
    const acceptance = ledger.scenarioAcceptance.find((scenario) => scenario.id === surfaceId);
    assert.equal(acceptance?.defaultOn, false, `${surfaceId}: candidate must remain outside accepted default-on IDs`);
    assert.equal(acceptance?.currentReleaseRead, "pending", `${surfaceId}: candidate current-release read must remain pending`);
    assert(!acceptedSurfaceIds.includes(surfaceId), `${surfaceId}: candidate must be disjoint from accepted IDs`);
    assert.equal(ledger.permanentPilotEvidence?.authenticatedPilot?.[surfaceId], undefined, `${surfaceId}: candidate must have no permanent Pilot evidence yet`);
  }
} else {
  assert.equal(runtimePolicySha256, ledger.permanentPilotEvidence.runtimePolicySha256, "without a candidate, current policy bytes must match the accepted policy evidence");
}
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.pilotWrite === "accepted").map((scenario) => scenario.id),
  ["nomenclature"],
  "Nomenclature evaluation write evidence must remain separate from permanent default-on acceptance",
);
const nomenclatureAcceptance = ledger.scenarioAcceptance.find((scenario) => scenario.id === "nomenclature");
assert.equal(nomenclatureAcceptance?.readEvidenceRelease, historicalPilotWriteEvidence.release, "latest Nomenclature read evidence must bind its historical evaluation release");
assert.equal(nomenclatureAcceptance?.writeEvidenceRelease, historicalPilotWriteEvidence.release, "latest Nomenclature write evidence must bind its historical evaluation release");
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.cleanup === "verified").map((scenario) => scenario.id),
  ["nomenclature"],
  "only Nomenclature has verified Pilot cleanup on this baseline",
);
assert.deepEqual(
  ledger.scenarioAcceptance.filter((scenario) => scenario.pilotWrite === "not-applicable").map((scenario) => scenario.id),
  ["structureMigrationDiagnostics", "weeklyProductionControl", "dispatch"],
  "only the three read-only scenarios may skip Pilot write acceptance",
);

if (computedProgress === 100) {
  assert(ledger.modules.every((module) => module.productionReady), "100% requires every in-scope route to be production-ready");
  assert(ledger.scenarioAcceptance.every((scenario) => scenario.currentReleaseRead === "accepted"), "100% requires complete same-release Pilot read acceptance");
  assert(ledger.scenarioAcceptance.every((scenario) => ["accepted", "not-applicable"].includes(scenario.pilotWrite)), "100% requires complete Pilot write acceptance");
}

console.log(`React cutover ledger QA passed: ${ledger.modules.length} routes, ${commandScenarioIds.length} scenarios, ${computedProgress}% audited progress, ${acceptedSurfaceIds.length} accepted permanent React surfaces, 21/25 historical Pilot reads, ${currentReleaseAcceptedSurfaceIds.length}/25 current-release reads, 1/22 historical Pilot writes; active release ${ledger.acceptedPilotRelease}; ${candidatePolicy ? `${candidateSurfaceIds.join(", ")} acceptance pending` : "no candidate policy"}.`);
