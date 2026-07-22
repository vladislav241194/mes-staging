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
}

const hostSource = await readFile(join(projectRoot, "src/modules/directories/react_island_host.js"), "utf8");
assert.equal((hostSource.match(/allowPermanentReact:\s*true/g) || []).length, 4, "all four Directory hosts must fail closed inside permanent React");
assert.match(hostSource, /canFallbackToLegacy:\s*\(activation\)\s*=>\s*!\(allowPermanentReact && activation\.accessMode === "react"\)/);
assert.match(hostSource, /onRequestLegacy:\s*allowPermanentReact && getActivation\?\.\(\)\.accessMode === "react"\s*\?\s*undefined/);
assert.match(hostSource, /onNavigateSection:\s*allowPermanentReact[\s\S]*getActivation\?\.\(\)\.accessMode === "react"/, "direct section navigation must be permanent-only while evaluation retains its isolated legacy-return contract");

const appSource = await readFile(join(projectRoot, "src/app.js"), "utf8");
for (const surfaceId of surfaceIds) assert.match(appSource, new RegExp(`surfaceId: "${surfaceId}"`), `${surfaceId}: app must resolve signed activation`);
assert.equal((appSource.match(/navigateSection:\s*navigateDirectoryReactSection/g) || []).length, 4, "every Directory island must use direct React section navigation");
assert.match(appSource, /getReactRuntimeMode\(surfaceId\) === "react" \|\| localWriteEvaluation === true/);
assert.match(appSource, /&& !isNomenclatureServerCommandsPrimary\(\)/, "generic Directory writes must fail closed while Nomenclature commands own the monolithic projection");
assert.match(appSource, /const reactDecision = activeReactHost\?\.prepareRender\(\);[\s\S]*if \(reactDecision\?\.activateReact\) return activeReactHost\.renderTarget\(\);[\s\S]*ensureRoutesRenderModule\(\);/, "permanent Directory routes must choose React before loading the rollback renderer");

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
