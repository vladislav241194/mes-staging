import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
import { createEmployeeDesktopCommandOwner } from "../src/modules/employee_desktop/command_owner.js";
import { createEmployeeDesktopReactIslandHost } from "../src/modules/auth_render/employee_desktop_react_island_host.js";
const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_EMPLOYEE_DESKTOP, false);
assert.equal(disabled.MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_EMPLOYEE_DESKTOP: "1", MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.equal(enabled.MES_REACT_EMPLOYEE_DESKTOP, true);
assert.equal(enabled.MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_EMPLOYEE_DESKTOP: "1", MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION: "1", DATABASE_URL: "must-not-leak" });
assert.match(script, /"MES_REACT_EMPLOYEE_DESKTOP":true/);
assert.match(script, /"MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);

const writeHost = createEmployeeDesktopReactIslandHost({ getActivation: () => ({ featureFlagEnabled: true, serverReadReady: true, accessMode: "write-evaluation" }), getPayload: () => ({}), getTargetRoot: () => null });
assert.deepEqual(writeHost.prepareRender(), { activateReact: true, reason: "eligible" }, "Employee Desktop must accept only the explicit write-evaluation host mode");
const permanentHost = createEmployeeDesktopReactIslandHost({ getActivation: () => ({ featureFlagEnabled: true, runtimeMode: "react", serverReadReady: true, accessMode: "react" }), getPayload: () => ({}), getTargetRoot: () => null });
assert.deepEqual(permanentHost.prepareRender(), { activateReact: true, reason: "eligible" }, "Employee Desktop permanent policy must activate React without URL flags");
const pendingPermanentHost = createEmployeeDesktopReactIslandHost({ getActivation: () => ({ featureFlagEnabled: true, runtimeMode: "react", serverReadReady: false, accessMode: "react" }), getPayload: () => ({}), getTargetRoot: () => null });
assert.deepEqual(pendingPermanentHost.prepareRender(), { activateReact: true, reason: "eligible" }, "Employee Desktop permanent route must retain a React loading/error shell instead of legacy");
const [scenarioSource, hostSource] = await Promise.all([
  readFile(join(import.meta.dirname, "..", "experiments", "react-migration", "src", "modules", "employee-desktop", "EmployeeDesktopScenario.tsx"), "utf8"),
  readFile(join(import.meta.dirname, "..", "src", "modules", "auth_render", "employee_desktop_react_island_host.js"), "utf8"),
]);
assert.doesNotMatch(scenarioSource, /onRequestLegacy/, "Employee Desktop actions must not navigate to legacy UI");
assert.doesNotMatch(hostSource, /requestLegacyRender|onRequestLegacy/, "Employee Desktop host must not retain a same-release legacy handoff");
assert.match(hostSource, /canFallbackToLegacy:\s*\(\) => false/, "Employee Desktop runtime failures must stay in the fail-closed React shell");
assert.match(scenarioSource, /data-react-complete-marker/, "completed Employee Desktop must expose the visible completion marker");
assert.match(scenarioSource, /React TS ·/, "completed Employee Desktop marker must use the shared React TS label");
const appSource = await readFile(join(import.meta.dirname, "..", "src", "app.js"), "utf8");
assert.doesNotMatch(appSource, /^import[^\n]*employee_desktop\/command_owner\.js/m, "Employee Desktop command owner must not remain in the startup import graph");
const employeeDesktopOwnerLoaderStart = appSource.indexOf("function ensureEmployeeDesktopCommandOwner()");
const employeeDesktopHostStart = appSource.indexOf("const employeeDesktopReactIslandHost");
const employeeDesktopOwnerLoaderSource = appSource.slice(employeeDesktopOwnerLoaderStart, employeeDesktopHostStart);
assert(employeeDesktopOwnerLoaderStart >= 0 && employeeDesktopOwnerLoaderStart < employeeDesktopHostStart, "Employee Desktop command owner lazy boundary must be discoverable before the host");
assert.match(employeeDesktopOwnerLoaderSource, /import\("\.\/modules\/employee_desktop\/command_owner\.js"\)/, "Employee Desktop command owner must load through a dynamic import");
assert.match(employeeDesktopOwnerLoaderSource, /if \(employeeDesktopCommandOwnerLoad\) return employeeDesktopCommandOwnerLoad/, "concurrent Employee Desktop commands must share one cached module load");
const employeeDesktopOwnerSlice = appSource.slice(
  appSource.indexOf("const employeeDesktopReactIslandHost"),
  appSource.indexOf("const markingReactIslandHost"),
);
assert.match(employeeDesktopOwnerSlice, /const commandOwner = requiresCommandOwner \? await ensureEmployeeDesktopCommandOwner\(\) : null/, "owner-backed Employee Desktop commands must await the lazy owner");
assert(employeeDesktopOwnerSlice.indexOf("await ensureEmployeeDesktopCommandOwner()") < employeeDesktopOwnerSlice.indexOf("commandOwner.startTask(task)"), "Employee Desktop owner must be ready before a command can execute");
assert.match(employeeDesktopOwnerSlice, /shiftExecutionCommands\.recordIssueReport\(/, "permanent Employee Desktop Report must use the PostgreSQL owner client");
assert.match(employeeDesktopOwnerSlice, /await hydrateEmployeeDesktopIssueReports\(task, \{ force: true \}\)/, "Report completion must force a signed owner read-back");
assert.doesNotMatch(employeeDesktopOwnerSlice, /getAuthSessionPrototypeModel\(/, "permanent Employee Desktop payload and commands must not read the legacy auth renderer model");
assert.doesNotMatch(employeeDesktopOwnerSlice, /startAuthSessionTask\(|saveAuthSessionTaskFact\(|prepareAuthSessionReportPhoto\(/, "permanent Employee Desktop commands must use the independent command owner");
assert.doesNotMatch(employeeDesktopOwnerSlice, /saveAuthSessionTaskReport\(/, "permanent Employee Desktop Report must not write the browser UI store");
assert.doesNotMatch(employeeDesktopOwnerSlice, /const canSaveReport = localQa\.writeEvaluation/, "Report capability must not remain local-QA-only");
assert.match(employeeDesktopOwnerSlice, /model\.authPerson\?\.id && task\.employeeId !== model\.authPerson\.id/, "Employee Desktop writes must remain scoped to the authenticated employee");
assert.match(employeeDesktopOwnerSlice, /getAccessRoleModulePermission\(model\.role\?\.id, "authSessionPrototype", "edit"\)/, "Employee Desktop writes must remain RBAC-gated");
assert.match(employeeDesktopOwnerSlice, /getShiftExecutionServerAssignment\(task\.row\)/, "Report writes must resolve the canonical assignment from the shared task row");
assert.match(appSource, /shiftExecutionCommands\.readIssueReports\(assignment\.id\)/, "Report data must be loaded only through the signed on-demand endpoint");
const activationSlice = appSource.slice(appSource.indexOf("function getEmployeeDesktopReactActivation"), appSource.indexOf("const employeeDesktopReactIslandHost"));
assert.doesNotMatch(activationSlice, /authModulesReady/, "Employee Desktop React readiness must not wait for the legacy auth renderer");
const employeeDesktopRouteSlice = appSource.slice(appSource.indexOf("authSessionPrototype: {"), appSource.indexOf("marking: {", appSource.indexOf("authSessionPrototype: {")));
assert.match(employeeDesktopRouteSlice, /employeeDesktopReactIslandHost\.prepareRender\(\)/, "Employee Desktop route must prepare its React owner");
assert.match(employeeDesktopRouteSlice, /return employeeDesktopReactIslandHost\.renderTarget\(\)/, "Employee Desktop route must always render the React shell");
assert.doesNotMatch(employeeDesktopRouteSlice, /ensureAuthModules|renderAuthSessionPrototypePage|renderAuthSessionModal|bindAuthPrototypeEvents|bindAuthSessionEvents/, "Employee Desktop route must not retain legacy Auth render or event wiring");
assert.doesNotMatch(appSource, /auth_render\/(?:render|events)\.js|ensureAuthModules/, "current application runtime must not load the retired Auth chunks");
const issueHydrationSlice = appSource.slice(appSource.indexOf("async function hydrateEmployeeDesktopIssueReports"), appSource.indexOf("async function flushShiftExecutionOutbox"));
assert.doesNotMatch(issueHydrationSlice, /getAuthSessionPrototypeModel\(/, "signed Report hydration must read the production runtime state");
const runtimeRowsSlice = appSource.slice(appSource.indexOf("function buildEmployeeDesktopStoredAssignmentRow"), appSource.indexOf("function getEmployeeDesktopRuntimeState"));
assert.match(runtimeRowsSlice, /ui\.shiftMasterBoardAssignments/, "runtime commands must include assignments absent from the current board window");
assert.match(runtimeRowsSlice, /buildEmployeeDesktopStoredAssignmentRow/, "stored-only assignments must receive an actionable synthetic row without auth_render");
const runtimeStateSlice = appSource.slice(appSource.indexOf("function getEmployeeDesktopRuntimeState"), appSource.indexOf("function getEmployeeDesktopProductionPayload"));
assert.match(runtimeStateSlice, /const rows = getEmployeeDesktopRuntimeRows\(boardModel\)/, "RBAC, capabilities, Report and commands must share the stored-aware row projection");
const operationFactSlice = appSource.slice(appSource.indexOf("async function executeEmployeeDesktopOperationFactCommand"), appSource.indexOf("function getShiftWorkOrdersReactLocalQaOverrides"));
assert.match(operationFactSlice, /getEmployeeDesktopRuntimeState\(\)/, "aggregate fact resolution must accept a stored-only task row from the same runtime projection");

let task = { id: "task-1", rowId: "row-1", employeeId: "employee-1", employeeName: "Исполнитель QA", assignedQuantity: 10, minutesPerUnit: 2, isDone: false, isStarted: false };
let persists = 0; let rejectBoardFact = false; let drafts = {}; const boardFacts = [];
const owner = createEmployeeDesktopCommandOwner({
  getFactDrafts: () => drafts,
  setFactDrafts: (next) => { drafts = next; },
  persist: () => { persists += 1; },
  makeId: (prefix) => `${prefix}-qa`,
});
assert.equal(owner.startTask(null).ok, false, "missing task must fail closed");
task = { ...task, isDone: true };
assert.equal(owner.startTask(task).ok, false, "completed task must fail closed");
task = { ...task, isDone: false, isStarted: false };
assert.equal(owner.startTask(task).ok, true, "available task must start through the independent owner");
assert.equal(drafts[task.id].status, "in_progress"); assert.match(String(drafts[task.id].startedAt), /^\d{4}-\d{2}-\d{2}T/); assert.equal(persists, 1);
task = { ...task, isStarted: true };
assert.equal(owner.startTask(task).ok, false, "already-started task must not persist twice"); assert.equal(persists, 1);
const saveOperationFact = async (fact) => { if (rejectBoardFact) return { ok: false }; boardFacts.push(fact); return { ok: true }; };
assert.equal((await owner.saveFact({ task, siblingTasks: [task], fact: { actualQuantity: 3, defectQuantity: 4 }, saveOperationFact })).ok, false, "defect above actual must fail closed");
assert.equal(boardFacts.length, 0, "invalid fact must not reach the operation owner");
assert.equal((await owner.saveFact({ task, siblingTasks: [task], fact: { actualQuantity: 5, defectQuantity: 0, deviationComment: "" }, saveOperationFact })).ok, false, "large negative deviation must require a comment");
rejectBoardFact = true;
assert.equal((await owner.saveFact({ task, siblingTasks: [task], fact: { actualQuantity: 10, defectQuantity: 0, deviationComment: "" }, saveOperationFact })).ok, false, "unavailable aggregate owner must fail closed");
assert.equal(drafts[task.id].updatedAt || "", "", "failed aggregate save must preserve the recoverable in-progress draft");
assert.equal(drafts[task.id].status, "in_progress", "failed aggregate save must not claim that the employee fact is complete");
assert.deepEqual([drafts[task.id].actualQuantity, drafts[task.id].defectQuantity], [10, 0], "failed aggregate save must retain the entered quantities for retry");
rejectBoardFact = false;
assert.equal((await owner.saveFact({ task, siblingTasks: [task], fact: { actualQuantity: 10, defectQuantity: 0, deviationComment: "" }, saveOperationFact })).ok, true, "valid fact must use the operation owner");
assert.equal(boardFacts.length, 1); assert.equal(boardFacts[0].rowId, "row-1"); assert.equal(boardFacts[0].actualQuantity, 10); assert.equal(boardFacts[0].defectQuantity, 0); assert.equal(boardFacts[0].laborMinutes, 20); assert.match(String(drafts[task.id].updatedAt), /^\d{4}-\d{2}-\d{2}T/);
console.log("Employee Desktop React runtime policy QA passed.");
