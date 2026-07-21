import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MES_REACT_COMPLETION_MODULE_REGISTRY,
  MES_REACT_COMPLETION_STATES,
  MES_REACT_COMPLETION_SURFACE_REGISTRY,
  MES_REACT_VERIFICATION_STATES,
} from "../src/react_completion_registry.js";
import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  MES_MODULE_NAVIGATION_REGISTRY,
} from "../src/module_registry.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const [ledger, policy, runtimeSource, navigationCss] = await Promise.all([
  readFile(join(repositoryRoot, "experiments/react-migration/cutover-ledger.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "react-runtime-policy.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "src/modules/operational_runtime/service.js"), "utf8"),
  readFile(join(repositoryRoot, "styles/ui/app-navigation.css"), "utf8"),
]);

const { COMPLETE, PARTIAL, LEGACY } = MES_REACT_COMPLETION_STATES;
const { ACCEPTED, DEFERRED } = MES_REACT_VERIFICATION_STATES;
const allowedStates = new Set([COMPLETE, PARTIAL, LEGACY]);
const allowedVerificationStates = new Set([ACCEPTED, DEFERRED]);
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));
const unique = (values) => new Set(values).size === values.length;

const surfaceIds = MES_REACT_COMPLETION_SURFACE_REGISTRY.map((entry) => entry.id);
const moduleIds = MES_REACT_COMPLETION_MODULE_REGISTRY.map((entry) => entry.id);
const islandIds = ledger.islands.map((entry) => entry.id);
const ledgerModuleIds = ledger.modules.map((entry) => entry.id);
const blueprintModuleIds = MES_MODULE_BLUEPRINT_REGISTRY.map((entry) => entry.id);

assert(unique(surfaceIds), "React completion surface ids must be unique");
assert(unique(moduleIds), "React completion module ids must be unique");
assert.deepEqual(sorted(surfaceIds), sorted(islandIds), "completion surface registry must cover every audited React island exactly once");
assert.deepEqual(sorted(moduleIds), sorted(ledgerModuleIds), "completion module registry must cover every cutover-ledger route exactly once");
assert.deepEqual(sorted(moduleIds), sorted(blueprintModuleIds), "completion module registry must cover every runtime route exactly once");
assert(MES_REACT_COMPLETION_SURFACE_REGISTRY.every((entry) => allowedStates.has(entry.status)), "surface registry must use the closed completion vocabulary");
assert(MES_REACT_COMPLETION_MODULE_REGISTRY.every((entry) => allowedStates.has(entry.status)), "module registry must use the closed completion vocabulary");
assert(MES_REACT_COMPLETION_SURFACE_REGISTRY.every((entry) => allowedVerificationStates.has(entry.verification)), "surface registry must use the closed verification vocabulary");
assert(MES_REACT_COMPLETION_MODULE_REGISTRY.every((entry) => allowedVerificationStates.has(entry.verification)), "module registry must use the closed verification vocabulary");
assert(MES_REACT_COMPLETION_SURFACE_REGISTRY.every((entry) => entry.verification !== ACCEPTED || entry.status === COMPLETE), "an accepted surface must also be implementation-complete");
assert(MES_REACT_COMPLETION_MODULE_REGISTRY.every((entry) => entry.verification !== ACCEPTED || entry.status === COMPLETE), "an accepted route must also be implementation-complete");

const islandById = new Map(ledger.islands.map((entry) => [entry.id, entry]));
const scenarioById = new Map(ledger.scenarioAcceptance.map((entry) => [entry.id, entry]));
const completionSurfaceById = new Map(MES_REACT_COMPLETION_SURFACE_REGISTRY.map((entry) => [entry.id, entry]));

for (const entry of MES_REACT_COMPLETION_SURFACE_REGISTRY) {
  const island = islandById.get(entry.id);
  const scenario = scenarioById.get(entry.id);
  const permanentlyReact = policy.surfaces?.[entry.id] === "react";
  const hasNoNormalFallback = island?.normalActionFallback === false;
  const isProductionSurface = island?.disposition === "migration-required";
  const hasNoMissingCommands = Array.isArray(island?.commands?.missing) && island.commands.missing.length === 0;
  const expectedStatus = permanentlyReact && hasNoNormalFallback && isProductionSurface && hasNoMissingCommands
    ? COMPLETE
    : PARTIAL;
  const expectedVerification = scenario?.defaultOn === true
    && scenario?.historicalPilotRead === "accepted"
    ? ACCEPTED
    : DEFERRED;

  assert.equal(
    entry.status,
    expectedStatus,
    `${entry.id}: react-complete requires policy=react, production disposition, zero normal-action fallback and zero missing commands`,
  );
  assert.equal(entry.verification, expectedVerification, `${entry.id}: Pilot verification must remain separate from implementation completion`);
}

const ledgerModuleById = new Map(ledger.modules.map((entry) => [entry.id, entry]));
for (const entry of MES_REACT_COMPLETION_MODULE_REGISTRY) {
  const ledgerModule = ledgerModuleById.get(entry.id);
  assert(entry.surfaceIds.every((surfaceId) => completionSurfaceById.has(surfaceId)), `${entry.id}: every declared surface must exist`);
  assert.equal(
    entry.surfaceIds.every((surfaceId) => islandById.get(surfaceId)?.routeId === entry.id),
    true,
    `${entry.id}: every declared surface must belong to this route in the ledger`,
  );

  const allSurfacesComplete = entry.surfaceIds.length > 0
    && entry.surfaceIds.every((surfaceId) => completionSurfaceById.get(surfaceId)?.status === COMPLETE);
  const implementationComplete = ledgerModule?.runtimeMode === "react"
    && ["complete", "read-only-complete"].includes(ledgerModule?.functionalStatus)
    && ledgerModule?.normalLegacyPath === false
    && ledgerModule?.visibleLegacyRendererPath === false
    && ledgerModule?.runtimeLegacyModelDependency === false
    && allSurfacesComplete;
  const routeLegacy = ledgerModule?.reactSurface === "missing";
  const expectedStatus = implementationComplete ? COMPLETE : routeLegacy ? LEGACY : PARTIAL;
  const allSurfacesAccepted = entry.surfaceIds.length > 0
    && entry.surfaceIds.every((surfaceId) => completionSurfaceById.get(surfaceId)?.verification === ACCEPTED);
  const expectedVerification = ledgerModule?.productionReady === true && allSurfacesAccepted
    ? ACCEPTED
    : DEFERRED;

  assert.equal(
    entry.status,
    expectedStatus,
    `${entry.id}: route marker must follow permanent React mode, complete functional implementation and removal of the normal legacy path`,
  );
  assert.equal(entry.verification, expectedVerification, `${entry.id}: route acceptance must remain deferred until production evidence is accepted`);
}

const navigationById = new Map(MES_MODULE_NAVIGATION_REGISTRY.map((entry) => [entry.id, entry]));
for (const entry of MES_REACT_COMPLETION_MODULE_REGISTRY) {
  assert.equal(navigationById.get(entry.id)?.reactCompletionStatus, entry.status, `${entry.id}: navigation must consume the source-of-truth completion registry`);
  assert.equal(navigationById.get(entry.id)?.reactVerificationStatus, entry.verification, `${entry.id}: navigation must consume the separate verification state`);
}

assert(runtimeSource.includes('if (moduleItem.reactCompletionStatus !== "react-complete") return "";'), "sidebar marker must be omitted for partial and legacy routes");
assert(runtimeSource.includes("data-react-complete-marker"), "sidebar must expose the visible React completion marker");
assert(runtimeSource.includes("data-react-completion-status"), "sidebar tabs must expose their machine-readable completion state");
assert(runtimeSource.includes("data-react-verification-status"), "sidebar tabs must expose deferred/accepted verification separately");
assert(runtimeSource.includes("Код переведён на React + TypeScript"), "completion marker must explain its implementation-only meaning");
assert(navigationCss.includes(".module-react-complete-marker"), "completion marker must use the existing navigation stylesheet");

const completedModules = MES_REACT_COMPLETION_MODULE_REGISTRY.filter((entry) => entry.status === COMPLETE).map((entry) => entry.id);
const completedSurfaces = MES_REACT_COMPLETION_SURFACE_REGISTRY.filter((entry) => entry.status === COMPLETE).map((entry) => entry.id);
console.log(`React completion marker contract: modules=${completedModules.join(",") || "none"}; surfaces=${completedSurfaces.join(",") || "none"}`);
