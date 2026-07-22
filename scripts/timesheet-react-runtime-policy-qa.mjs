import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

const { createTimesheetReactIslandHost } = await withBundledTypeScriptClient(
  new URL("../src/modules/timesheet/react_island_host.ts", import.meta.url),
  (hostModule) => hostModule,
  { prefix: "mes-timesheet-react-host-qa-" },
);

const [policy, ledger, appSource, hostSource, islandSource, scenarioSource, completionSource] = await Promise.all([
  readFile(new URL("../react-runtime-policy.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../experiments/react-migration/cutover-ledger.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/timesheet/react_island_host.ts", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/timesheet-island.tsx", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/timesheet/TimesheetScenario.tsx", import.meta.url), "utf8"),
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

const makeHost = (accessMode, { featureFlagEnabled = true, serverReadReady = true, serverReadFailure = "", runtimeMode = "react" } = {}) => createTimesheetReactIslandHost({
  getActivation: () => ({ accessMode, featureFlagEnabled, policyId: "qa", runtimeMode, serverReadFailure, serverReadReady }),
  getPayload: () => ({}),
  getTargetRoot: () => null,
});
const permanentPending = makeHost("react", { serverReadReady: false });
assert.deepEqual(permanentPending.prepareRender(), { activateReact: true, reason: "eligible" });
assert.match(permanentPending.renderTarget(), /data-react-island-runtime-mode="react"[^]*data-react-island-state="loading"/);
const disabledHost = makeHost("legacy", { featureFlagEnabled: false, runtimeMode: "legacy" });
assert.deepEqual(disabledHost.prepareRender(), { activateReact: false, reason: "react-required" });
assert.match(disabledHost.renderTarget(), /data-react-island-runtime-mode="react"[^]*data-react-island-state="error"[^]*react-required/);

assert.equal(policy.surfaces.timesheet, "react", "Timesheet ordinary route must select permanent React UI");
assert.equal(ledger.candidatePolicy.surfaceIds.includes("timesheet"), true, "Timesheet permanent policy must remain an unaccepted Pilot candidate");
const island = ledger.islands.find((entry) => entry.id === "timesheet");
const module = ledger.modules.find((entry) => entry.id === "timesheet");
const timesheetHostStart = appSource.indexOf("const timesheetReactIslandHost");
const timesheetHostEnd = appSource.indexOf("function getPlanningWorkbenchReactLocalQaOverrides", timesheetHostStart);
const timesheetAppSlice = appSource.slice(timesheetHostStart, timesheetHostEnd);
const coreAdaptersStart = appSource.indexOf("const coreAdapters = {");
const timesheetRouteStart = appSource.indexOf("    timesheet: {", coreAdaptersStart);
const timesheetRouteEnd = appSource.indexOf("    roles: {", timesheetRouteStart);
const timesheetRouteSlice = appSource.slice(timesheetRouteStart, timesheetRouteEnd);
assert.equal(island?.normalActionFallback, false, "Timesheet permanent UI must not return actions to the legacy renderer");
assert.deepEqual(island?.commands?.missing, [], "Timesheet implementation must expose every bounded command through the owner surface");
assert.equal(module?.runtimeMode, "react");
assert.equal(module?.functionalStatus, "complete", "Timesheet implementation is complete while Pilot verification remains separately deferred");
assert.equal(module?.visibleLegacyRendererPath, false);
assert.equal(module?.runtimeLegacyModelDependency, false);
assert.equal(module?.normalLegacyPath, false, "ordinary Timesheet must use its independent typed calendar model");
assert.equal(module?.productionReady, false, "Pilot lifecycle and rollback acceptance remain deferred");
assert.match(appSource, /surfaceId:\s*"timesheet"/);
assert.match(appSource, /runtimeActivation\.runtimeMode === "react"\s*\? "react"/);
assert.match(timesheetRouteSlice, /renderModals:\s*\(\) => ""/);
assert.match(timesheetRouteSlice, /bind:\s*\(\) => \{\}/);
assert.match(hostSource, /canFallbackToLegacy:\s*\(\) => false/);
assert.match(hostSource, /if \(activation\.accessMode === "react"\) return ""/);
assert.doesNotMatch(hostSource, /requestLegacyRender|onRequestLegacy/);
assert.doesNotMatch(hostSource, /runtimeMode[^\n]*"legacy"/, "Timesheet shell must never advertise same-release legacy ownership");
assert.match(hostSource, /reason: "react-required"/, "invalid activation must fail closed with a deterministic reason");
assert.doesNotMatch(islandSource, /onRequestLegacy/, "Timesheet entrypoint must not advertise a legacy action port");
assert.doesNotMatch(scenarioSource, /onRequestLegacy|резервном интерфейсе/, "Timesheet scenario must not advertise a same-release fallback");
assert.match(scenarioSource, /disabled=\{!canEditSchedule\}/, "permanent schedule affordance must fail closed without the projected capability");
assert.match(scenarioSource, /disabled=\{!canEditDay\}/, "permanent day affordance must fail closed without the projected capability");
assert.match(timesheetAppSlice, /productionModel:\s*\{ domains: systemDomainsState/);
assert.match(timesheetAppSlice, /saveAttendanceEvent\(events/);
assert.match(appSource, /\.\.\.rows\.filter\(\(row\) => row\.id !== assignmentId\),\s*canonical,/s, "schedule upsert must preserve unrelated historical and future assignments");
assert.doesNotMatch(appSource, /\.\.\.rows\.filter\(\(row\) => row\.employeeId !== employeeId\),\s*canonical,/s, "schedule upsert must never replace every assignment owned by an employee");
assert.match(appSource, /!normalizedAssignmentId\s*\|\|\s*!currentAssignment/, "schedule removal must require one concrete existing assignment id");
assert.doesNotMatch(timesheetAppSlice, /buildTimesheetAttendanceEventsFromFormData/);
assert.doesNotMatch(timesheetAppSlice, /\bmoveTimesheetPeriod\(/);
assert.doesNotMatch(timesheetAppSlice, /getTimesheetModel|requestLegacyRender|openTimesheetEditor/);
assert.doesNotMatch(appSource, /modules\/timesheet\/render\.js|ensureTimesheetModule|initializeTimesheetModule|renderTimesheetPage|renderTimesheetEditorModal|bindTimesheetEvents/);
await assert.rejects(access(new URL("../src/modules/timesheet/render.js", import.meta.url)), /ENOENT/, "same-release Timesheet renderer must be physically absent");
assert.match(timesheetRouteSlice, /timesheetReactIslandHost\.prepareRender\(\);\s*return timesheetReactIslandHost\.renderTarget\(\);/);
assert.doesNotMatch(timesheetRouteSlice, /permanentReact|ensureProductionStructureMatrixModule|isReactEligible|renderTimesheet/);
assert.match(appSource, /function getTimesheetCell\(\) \{[\s\S]*availabilityStatus: "unknown"[\s\S]*hours: 0/);
assert.match(completionSource, /id: "timesheet", status: COMPLETE/);
console.log("Timesheet React runtime policy QA passed: React-only current route, fail-closed shell, owner commands, release rollback.");
