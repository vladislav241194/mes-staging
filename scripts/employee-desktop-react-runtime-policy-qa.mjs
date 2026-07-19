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

let task = { id: "task-1", employeeId: "employee-1", isDone: false, isStarted: false };
let patch = null; let persists = 0; let notifications = 0; let renders = 0;
const events = createAuthEventsModule({
  getAuthSessionPrototypeModel: () => ({ allTasks: [task], authPerson: { id: "employee-1" } }),
  setAuthSessionFactDraft: (_taskId, nextPatch) => { patch = nextPatch; task = { ...task, isStarted: nextPatch.status === "in_progress" }; },
  persistUiState: () => { persists += 1; }, notifySaveSuccess: () => { notifications += 1; }, render: () => { renders += 1; }, getUi: () => ({}),
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
console.log("Employee Desktop React runtime policy QA passed.");
