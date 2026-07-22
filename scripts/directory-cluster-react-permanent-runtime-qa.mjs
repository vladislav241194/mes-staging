import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPublicRuntimeConfig } from "./shared-state-storage.mjs";
import { getPublicReactRuntimePolicy, loadReactRuntimePolicy } from "./react-runtime-policy.mjs";
import { resolveReactRuntimeActivation } from "../src/modules/react_runtime_policy.js";
import {
  createDirectoryComponentTypesReactIslandHost,
  createDirectoryNomenclatureTypesReactIslandHost,
  createDirectoryOperationsReactIslandHost,
  createDirectoryStatusesReactIslandHost,
} from "../src/modules/directories/react_island_host.js";

const projectRoot = join(import.meta.dirname, "..");
const surfaceIds = ["componentTypes", "operations", "nomenclatureTypes", "statuses"];
const policySource = await readFile(join(projectRoot, "react-runtime-policy.json"), "utf8");
const policySha256 = createHash("sha256").update(policySource).digest("hex");
const policy = await loadReactRuntimePolicy({ projectRoot, env: { APP_ENV: "local" } });
const publicPolicy = getPublicReactRuntimePolicy(policy);
const runtimeConfig = getPublicRuntimeConfig({
  MES_REACT_DIRECTORY_COMPONENT_TYPES: "1",
  MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION: "1",
  MES_REACT_DIRECTORY_OPERATIONS: "1",
  MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: "1",
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: "1",
  MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: "1",
  MES_REACT_DIRECTORY_STATUSES: "1",
  MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: "1",
}, { reactRuntimePolicy: publicPolicy });

for (const surfaceId of surfaceIds) {
  assert.equal(policy.surfaces[surfaceId], "react", `${surfaceId}: signed policy must select permanent React`);
  assert.deepEqual(
    resolveReactRuntimeActivation({ surfaceId, runtimeConfig, evaluationFeatureEnabled: true, evaluationRequested: true, localQaEnabled: true }),
    { runtimeMode: "react", featureFlagEnabled: true, accessMode: "react" },
    `${surfaceId}: evaluation and query flags may not downgrade permanent React`,
  );
}
for (const key of [
  "MES_REACT_DIRECTORY_COMPONENT_TYPES",
  "MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION",
  "MES_REACT_DIRECTORY_OPERATIONS",
  "MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION",
  "MES_REACT_DIRECTORY_NOMENCLATURE_TYPES",
  "MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION",
  "MES_REACT_DIRECTORY_STATUSES",
  "MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION",
]) assert.equal(runtimeConfig[key], false, `${key}: obsolete evaluation flag must be masked in permanent mode`);

const factories = {
  componentTypes: createDirectoryComponentTypesReactIslandHost,
  operations: createDirectoryOperationsReactIslandHost,
  nomenclatureTypes: createDirectoryNomenclatureTypesReactIslandHost,
  statuses: createDirectoryStatusesReactIslandHost,
};
for (const [surfaceId, factory] of Object.entries(factories)) {
  const host = factory({
    getActivation: () => ({ featureFlagEnabled: true, activeSection: surfaceId, accessMode: "react", runtimeMode: "react" }),
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(host.prepareRender(), { activateReact: true, reason: "eligible" }, `${surfaceId}: permanent host must be eligible`);
  assert.match(host.renderTarget(), new RegExp(`data-react-directory-${surfaceId === "componentTypes" ? "component-types" : surfaceId === "nomenclatureTypes" ? "nomenclature-types" : surfaceId}-island`));
  assert.match(host.renderTarget(), /data-react-island-state="loading"/, `${surfaceId}: eligible host must expose its React loading target`);

  const disabledHost = factory({
    getActivation: () => ({ featureFlagEnabled: false, activeSection: surfaceId, accessMode: "legacy", runtimeMode: "disabled" }),
    getPayload: () => ({}),
    getTargetRoot: () => null,
  });
  assert.deepEqual(disabledHost.prepareRender(), { activateReact: false, reason: "disabled" }, `${surfaceId}: disabled activation must remain ineligible`);
  assert.match(disabledHost.renderTarget(), /data-react-island-state="error"/, `${surfaceId}: an ineligible active route must render a deterministic error shell`);
  assert.match(disabledHost.renderTarget(), /Код ошибки: disabled/, `${surfaceId}: fail-closed shell must expose the bounded policy reason`);
  assert.equal(await disabledHost.mount(), false, `${surfaceId}: an ineligible active route must not mount or fall back to legacy`);
}

const hostSource = await readFile(join(projectRoot, "src/modules/directories/react_island_host.js"), "utf8");
assert.match(hostSource, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/, "all four Directory hosts must fail closed for every activation mode");
assert.match(hostSource, /getShellState:\s*\(activation\)[\s\S]*state:\s*"error"/, "the active host must own its ineligibility shell");
assert.doesNotMatch(hostSource, /allowPermanentReact|requestLegacyRender|onRequestLegacy|legacy-directory/, "the shared Directory host must not expose a same-release legacy bridge");
assert.match(hostSource, /onNavigateSection:\s*typeof navigateSection === "function"/, "direct typed section navigation must remain available without a legacy-return branch");

const appSource = await readFile(join(projectRoot, "src/app.js"), "utf8");
await assert.rejects(
  readFile(join(projectRoot, "src/modules/routes/render.js"), "utf8"),
  (error) => error?.code === "ENOENT",
  "the retired Routes renderer source must stay absent",
);
await assert.rejects(
  readFile(join(projectRoot, "src/modules/routes/directory_presentation.js"), "utf8"),
  (error) => error?.code === "ENOENT",
  "the orphan Directory presentation source must stay absent",
);
assert.doesNotMatch(appSource, /ensureRoutesRenderModule|routesRenderModuleLoad|modules\/routes\/render\.js/, "application boot must not retain the retired Routes renderer loader");
for (const surfaceId of surfaceIds) assert.match(appSource, new RegExp(`surfaceId: "${surfaceId}"`), `${surfaceId}: app must resolve signed activation`);
assert.equal((appSource.match(/navigateSection:\s*navigateDirectoryReactSection/g) || []).length, 4, "every Directory island must use direct React section navigation");
assert.match(appSource, /getReactRuntimeMode\(surfaceId\) === "react" \|\| localWriteEvaluation === true/);
assert.match(appSource, /&& !isNomenclatureServerCommandsPrimary\(\)/, "generic Directory writes must fail closed while Nomenclature commands own the monolithic projection");
assert.doesNotMatch(appSource, /directoryReactLegacyOverride|legacy-directory/, "application hosts must not retain a same-release Directory legacy bridge");
const runtimeStart = appSource.indexOf("function initializeModuleRuntime()");
const directoryRouteStart = appSource.indexOf("directories: {", runtimeStart);
const directoryRouteEnd = appSource.indexOf("specifications2: {", directoryRouteStart);
const directoryRouteSource = appSource.slice(directoryRouteStart, directoryRouteEnd);
assert(runtimeStart >= 0 && directoryRouteStart > runtimeStart && directoryRouteEnd > directoryRouteStart, "Directory route boundary must be discoverable");
assert.match(directoryRouteSource, /activeReactHost\.prepareRender\(\);\s*return activeReactHost\.renderTarget\(\);/, "the route must always select the active fail-closed React host");
assert.match(directoryRouteSource, /bind:\s*\(\)\s*=>\s*\{\}/, "the permanent Directory route must not bind legacy DOM events");
assert.doesNotMatch(directoryRouteSource, /ensureRoutesRenderModule|renderDirectoryPage|bindDirectoryEvents/, "the permanent Directory route must not enter the same-release routes renderer");

const scenarioPaths = [
  "modules/component-types/ComponentTypesScenario.tsx",
  "modules/operations/OperationsScenario.tsx",
  "modules/nomenclature-types/NomenclatureTypesScenario.tsx",
  "modules/statuses/StatusesScenario.tsx",
];
for (const relativePath of scenarioPaths) {
  const source = await readFile(join(projectRoot, "experiments/react-migration/src", relativePath), "utf8");
  assert.doesNotMatch(source, /onRequestLegacy|legacy-контур|legacy-directory/, `${relativePath}: completed TS surface must not expose a legacy-return action`);
  assert.match(source, /data-react-complete-marker/, `${relativePath}: React TS completion marker must remain visible`);
  assert.match(source, /DirectorySectionNavigation/, `${relativePath}: typed deep-link navigation must remain intact`);
  assert.match(source, /onCommand/, `${relativePath}: shared command owner bridge must remain intact`);
}
for (const relativePath of ["component-types-island.tsx", "operations-island.tsx", "nomenclature-types-island.tsx", "statuses-island.tsx"]) {
  const source = await readFile(join(projectRoot, "experiments/react-migration/src", relativePath), "utf8");
  assert.doesNotMatch(source, /onRequestLegacy/, `${relativePath}: TS mount bridge must not accept a legacy callback`);
  assert.match(source, /onNavigateSection/, `${relativePath}: TS mount bridge must preserve typed navigation`);
  assert.match(source, /onCommand/, `${relativePath}: TS mount bridge must preserve commands`);
}

const ledger = JSON.parse(await readFile(join(projectRoot, "experiments/react-migration/cutover-ledger.json"), "utf8"));
const directoryModule = ledger.modules.find((module) => module.id === "directories");
assert.equal(directoryModule?.runtimeMode, "react");
assert.equal(directoryModule?.visibleLegacyRendererPath, false);
assert.equal(directoryModule?.runtimeLegacyModelDependency, false, "permanent Directory routes must not load the legacy renderer/model");
assert.equal(directoryModule?.normalLegacyPath, false, "normal Directory navigation and commands must remain in React");
for (const surfaceId of surfaceIds) {
  assert.equal(ledger.islands.find((island) => island.id === surfaceId)?.normalActionFallback, false, `${surfaceId}: normal UI action fallback must be removed`);
  assert(ledger.candidatePolicy.surfaceIds.includes(surfaceId), `${surfaceId}: permanent rollout must remain an unaccepted candidate until Pilot verification`);
}
assert.equal(ledger.candidatePolicy.runtimePolicySha256, policySha256, "candidate ledger must bind the exact signed policy bytes");

console.log("Directory cluster permanent React runtime QA: OK");
console.log("- componentTypes, operations, nomenclatureTypes, statuses: signed React, direct React navigation, fail-closed renderer");
console.log("- normal routes avoid the rollback renderer; deferred Pilot verification remains explicit");
