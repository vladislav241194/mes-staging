import assert from "node:assert/strict";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
import { createAuthEventsModule } from "../src/modules/auth_render/events.js";
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

let task = { id: "task-1", rowId: "row-1", employeeId: "employee-1", employeeName: "Исполнитель QA", assignedQuantity: 10, minutesPerUnit: 2, isDone: false, isStarted: false };
let patch = null; let persists = 0; let notifications = 0; let renders = 0; let rejectBoardFact = false; const drafts = {}; const uiState = { authSessionFactDrafts: drafts }; const boardFacts = [];
const events = createAuthEventsModule({
  getAuthSessionPrototypeModel: () => ({ allTasks: [task], authPerson: { id: "employee-1" } }),
  getAuthSessionFactDraft: (taskId) => ({ actualQuantity: 0, defectQuantity: 0, deviationComment: "", status: "", updatedAt: "", ...(drafts[taskId] || {}) }),
  setAuthSessionFactDraft: (taskId, nextPatch) => { patch = nextPatch; drafts[taskId] = { ...(drafts[taskId] || {}), ...nextPatch }; task = { ...task, isStarted: drafts[taskId].status === "in_progress", isDone: Boolean(drafts[taskId].updatedAt) }; return drafts[taskId]; },
  doesAuthSessionFactNeedDeviationComment: (sourceTask, draft) => Math.max(0, Number(draft.actualQuantity || 0) - Number(draft.defectQuantity || 0)) < Number(sourceTask.assignedQuantity || 0) * .95,
  getAuthSessionTaskGoodQuantity: (_sourceTask, draft) => Math.max(0, Number(draft.actualQuantity || 0) - Number(draft.defectQuantity || 0)),
  getAuthSessionFactDeviationPercent: () => 0,
  normalizePlainRecord: (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
  normalizePlanningLaborPositiveNumber: (value) => Math.max(0, Number(value || 0)),
  formatShiftWorkOrderPersonName: (value) => String(value || ""),
  saveShiftMasterBoardFact: async (rowId, fact) => { if (rejectBoardFact) return null; boardFacts.push({ rowId, fact }); return { fact }; },
  persistUiState: () => { persists += 1; }, notifySaveSuccess: () => { notifications += 1; }, render: () => { renders += 1; }, getUi: () => uiState,
});
assert.equal(events.startAuthSessionTask("missing", { renderOnChange: false }), false, "missing task must fail closed");
task = { ...task, isDone: true };
assert.equal(events.startAuthSessionTask("task-1", { renderOnChange: false }), false, "completed task must fail closed");
task = { ...task, employeeId: "employee-2", isDone: false };
assert.equal(events.startAuthSessionTask("task-1", { renderOnChange: false }), false, "task owned by another authenticated employee must fail closed");
task = { ...task, employeeId: "employee-1", isDone: false, isStarted: false };
assert.equal(events.startAuthSessionTask("task-1", { renderOnChange: false }), true, "available owned task must start through the existing owner");
assert.equal(patch?.status, "in_progress"); assert.match(String(patch?.startedAt), /^\d{4}-\d{2}-\d{2}T/); assert.equal(persists, 1); assert.equal(notifications, 1); assert.equal(renders, 0, "React owner call must defer the host rerender");
assert.equal(events.startAuthSessionTask("task-1", { renderOnChange: false }), false, "already-started task must not persist twice"); assert.equal(persists, 1);
assert.equal(await events.saveAuthSessionTaskFact("task-1", { fact: { actualQuantity: 3, defectQuantity: 4 }, renderOnChange: false }), false, "defect above actual must fail closed");
assert.equal(boardFacts.length, 0, "invalid fact must not reach the Shift Master Board owner");
assert.equal(await events.saveAuthSessionTaskFact("task-1", { fact: { actualQuantity: 5, defectQuantity: 0, deviationComment: "" }, renderOnChange: false }), false, "large negative deviation must require a comment");
assert.equal(boardFacts.length, 0, "fact without a required deviation comment must not be recorded");
rejectBoardFact = true; const originalConsoleError = console.error; console.error = () => {}; try { assert.equal(await events.saveAuthSessionTaskFact("task-1", { fact: { actualQuantity: 10, defectQuantity: 0, deviationComment: "" }, renderOnChange: false }), false, "unavailable aggregation owner must fail closed"); } finally { console.error = originalConsoleError; } assert.equal(drafts["task-1"].updatedAt || "", "", "failed aggregate save must restore the recoverable in-progress draft"); rejectBoardFact = false;
assert.equal(await events.saveAuthSessionTaskFact("task-1", { fact: { actualQuantity: 10, defectQuantity: 0, deviationComment: "" }, renderOnChange: false }), true, "valid fact must use the existing aggregation owner");
assert.equal(boardFacts.length, 1); assert.equal(boardFacts[0].rowId, "row-1"); assert.equal(boardFacts[0].fact.actualQuantity, 10); assert.equal(boardFacts[0].fact.defectQuantity, 0); assert.equal(boardFacts[0].fact.laborMinutes, 20); assert.match(String(drafts["task-1"].updatedAt), /^\d{4}-\d{2}-\d{2}T/); assert.equal(renders, 0, "React fact owner call must defer the host rerender");
console.log("Employee Desktop React runtime policy QA passed.");
