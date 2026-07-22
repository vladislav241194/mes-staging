import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const [policy, ledger, appSource, hostSource, completionSource] = await Promise.all([
  readFile(new URL("../react-runtime-policy.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../experiments/react-migration/cutover-ledger.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/timesheet/react_island_host.js", import.meta.url), "utf8"),
  readFile(new URL("../src/react_completion_registry.js", import.meta.url), "utf8"),
]);

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_TIMESHEET, false);
assert.equal(disabled.MES_REACT_TIMESHEET_READ_ONLY_EVALUATION, false);

const enabled = getPublicRuntimeConfig({ MES_REACT_TIMESHEET: "1", MES_REACT_TIMESHEET_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.equal(enabled.MES_REACT_TIMESHEET, true);
assert.equal(enabled.MES_REACT_TIMESHEET_READ_ONLY_EVALUATION, true);

const script = renderRuntimeConfigScript({ MES_REACT_TIMESHEET: "1", MES_REACT_TIMESHEET_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.match(script, /"MES_REACT_TIMESHEET":true/);
assert.match(script, /"MES_REACT_TIMESHEET_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);

assert.equal(policy.surfaces.timesheet, "react", "Timesheet ordinary route must select permanent React UI");
assert.equal(ledger.candidatePolicy.surfaceIds.includes("timesheet"), true, "Timesheet permanent policy must remain an unaccepted Pilot candidate");
const island = ledger.islands.find((entry) => entry.id === "timesheet");
const module = ledger.modules.find((entry) => entry.id === "timesheet");
assert.equal(island?.normalActionFallback, false, "Timesheet permanent UI must not return actions to the legacy renderer");
assert.deepEqual(island?.commands?.missing, ["production-write-rollout"], "unapproved production writes must remain explicit");
assert.equal(module?.runtimeMode, "react");
assert.equal(module?.functionalStatus, "partial", "Timesheet must not claim complete write parity before owner rollout acceptance");
assert.equal(module?.visibleLegacyRendererPath, false);
assert.equal(module?.runtimeLegacyModelDependency, true);
assert.equal(module?.normalLegacyPath, true, "aggregate legacy-model dependency must remain honest");
assert.match(appSource, /surfaceId:\s*"timesheet"/);
assert.match(appSource, /runtimeActivation\.runtimeMode === "react"\s*\? "react"/);
assert.match(appSource, /renderModals:\s*\(\) => timesheetReactIslandHost\.isReactEligible\(\) \? ""/);
assert.match(hostSource, /canFallbackToLegacy:\s*\(activation\) => activation\.accessMode !== "react"/);
assert.match(hostSource, /if \(activation\.accessMode === "react"\) return ""/);
assert.match(hostSource, /onRequestLegacy:\s*getActivation\?\.\(\)\.accessMode === "react" \? undefined/);
assert.match(completionSource, /id: "timesheet", status: PARTIAL/);
console.log("Timesheet React runtime policy QA passed: permanent fail-closed UI, deferred production writes.");
