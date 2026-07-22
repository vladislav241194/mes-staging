import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
import { REACT_RUNTIME_PERMANENT_CONSUMERS } from "./react-runtime-policy.mjs";

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_SPECIFICATIONS2, false);
assert.equal(disabled.MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_SPECIFICATIONS2: "1", MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.equal(enabled.MES_REACT_SPECIFICATIONS2, true);
assert.equal(enabled.MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_SPECIFICATIONS2: "1", MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.match(script, /"MES_REACT_SPECIFICATIONS2":true/);
assert.match(script, /"MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak|ADMIN_PASSWORD/);

const [appSource, hostSource, scenarioSource, policy, ledger] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/specifications2/react_island_host.js", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/specifications2/Specifications2Scenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../react-runtime-policy.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../experiments/react-migration/cutover-ledger.json", import.meta.url), "utf8").then(JSON.parse),
]);
const refreshSource = appSource.match(/async function refreshSpecifications2PublishedRevision\(sourceEntryId,[\s\S]*?\n\}/)?.[0] || "";
const hydrationSource = appSource.match(/function hydrateSpecifications2PublishedRevision\(entry\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(refreshSource, /completionChangesEligibility/);
assert.match(refreshSource, /refreshBySource\?\.\(normalizedSourceEntryId, \{ force \}\)/);
assert.match(refreshSource, /result\.changed \|\| completionChangesEligibility/);
assert.match(hydrationSource, /refreshSpecifications2PublishedRevision\(entry\.id\)/);
assert.match(appSource, /refreshSpecifications2PublishedRevision\(entryId, \{ force: true \}\)/);
assert.equal(policy.surfaces.specifications2, "react", "ordinary Specifications 2.0 route must be signed permanent React");
assert(REACT_RUNTIME_PERMANENT_CONSUMERS.includes("specifications2"), "Specifications 2.0 must be explicitly wired as a permanent consumer");
assert.match(appSource, /surfaceId: "specifications2"/);
assert.match(appSource, /runtimeActivation\.runtimeMode === "react"/);
assert.match(appSource, /canEditSpecifications2WithSignedRole/);
assert.match(hostSource, /canFallbackToLegacy: \(activation\) => activation\.accessMode !== "react"/);
assert.match(hostSource, /if \(activation\.accessMode === "react"\) return ""/);
assert.doesNotMatch(scenarioSource, /onRequestLegacy|Открываем legacy|Вложения в legacy/);
for (const label of ["Загрузить XLSX · недоступно", "Структура строк · недоступна", "Маршруты и нормы · недоступны", "Вложения · недоступны"]) {
  assert(scenarioSource.includes(label), `unsupported owner action must stay explicit: ${label}`);
}
const island = ledger.islands.find((entry) => entry.id === "specifications2");
const module = ledger.modules.find((entry) => entry.id === "specifications2");
assert.equal(island.normalActionFallback, false);
assert.deepEqual(island.commands.missing, ["add-row", "remove-row", "reparent-row", "bind-attachment", "edit-route"]);
assert.equal(module.runtimeMode, "react");
assert.equal(module.visibleLegacyRendererPath, false);
assert.equal(module.functionalStatus, "partial", "owner gaps must keep the completion marker partial");
assert.equal(ledger.currentProgress, 50, "implementation cutover must not inflate audited Pilot progress");
console.log("Specifications 2.0 React runtime policy QA: OK");
