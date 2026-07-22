import { readFile } from "node:fs/promises";

import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

const disabled = getPublicRuntimeConfig({ APP_ENV: "pilot" });
assert(disabled.MES_REACT_ROLES === false, "Roles React rollout must be disabled by default");
assert(disabled.MES_REACT_ROLES_READ_ONLY_EVALUATION === false, "Roles evaluation must be disabled by default");

const enabled = getPublicRuntimeConfig({
  APP_ENV: "pilot",
  MES_REACT_ROLES: "1",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(enabled.MES_REACT_ROLES === true, "explicit Roles rollout must reach the browser bootstrap");
assert(enabled.MES_REACT_ROLES_READ_ONLY_EVALUATION === true, "explicit Roles evaluation permission must reach the browser bootstrap");

const nonExact = getPublicRuntimeConfig({
  MES_REACT_ROLES: "true",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "yes",
});
assert(nonExact.MES_REACT_ROLES === false, "non-exact Roles rollout values must fail closed");
assert(nonExact.MES_REACT_ROLES_READ_ONLY_EVALUATION === false, "non-exact Roles evaluation values must fail closed");

const script = renderRuntimeConfigScript({
  MES_REACT_ROLES: "1",
  MES_REACT_ROLES_READ_ONLY_EVALUATION: "1",
  DATABASE_URL: "must-not-leak",
});
assert(script.includes('"MES_REACT_ROLES":true'), "public runtime script must contain the Roles rollout boolean");
assert(script.includes('"MES_REACT_ROLES_READ_ONLY_EVALUATION":true'), "public runtime script must contain the Roles evaluation boolean");
assert(!script.includes("must-not-leak"), "public runtime script must never expose deployment secrets");

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const hostSource = await readFile(new URL("../src/modules/access_roles/react_island_host.js", import.meta.url), "utf8");
const scenarioSource = await readFile(new URL("../experiments/react-migration/src/modules/roles/RolesScenario.tsx", import.meta.url), "utf8");
const adapterSource = await readFile(new URL("../experiments/react-migration/src/modules/roles/adapter.ts", import.meta.url), "utf8");
const multipleAssignmentOwnerSource = await readFile(new URL("../src/modules/access_roles/multiple_assignment_owner.js", import.meta.url), "utf8");
const runtimePolicy = JSON.parse(await readFile(new URL("../react-runtime-policy.json", import.meta.url), "utf8"));
assert(runtimePolicy.surfaces.roles === "react", "Roles normal route must be permanently React in the candidate policy");
assert(appSource.includes('surfaceId: "roles"'), "Roles host activation must resolve the signed runtime policy");
assert(appSource.includes('const permanentReact = getReactRuntimeMode("roles") === "react";'), "Roles route must identify its permanent runtime before loading compatibility code");
assert(appSource.includes("if (!permanentReact) ensureAccessRolesModule();"), "Roles permanent route must not load the legacy renderer or event binder");
assert(hostSource.includes('canFallbackToLegacy: (activation) => activation.accessMode !== "react"'), "Roles permanent mount/read/render failure must fail closed instead of opening legacy");
assert(hostSource.includes('if (!activation.serverReadReady)'), "Roles permanent shell must retain an explicit PostgreSQL loading state");
assert(hostSource.includes('if (activation.serverReadFailure)'), "Roles permanent shell must retain an explicit PostgreSQL error state");
assert(appSource.includes("const writeEnabled = permanentReact || localQa.writeEvaluation;"), "Existing owner-backed commands must remain available in permanent React when RBAC permits them");
assert(appSource.includes("multipleAssignmentsEdit: assignmentReady"), "Immediate additional assignments must require the existing assign capability");
assert(appSource.includes('command.type === "add-assignment"'), "The typed additional-assignment command must reach its targeted owner");
assert(appSource.includes('authorizeSystemDomainAction("roles", "assign", getAccessControlEmployeeContext(employeeId))'), "Additional assignments must retain employee-scoped RBAC");
assert(appSource.includes('surface: "access-control"'), "Additional assignments must use the revision-CAS access-control command surface");
assert(multipleAssignmentOwnerSource.includes("expectedAssignmentIds"), "The owner must bind the command to the exact assignment set shown by React");
assert(multipleAssignmentOwnerSource.includes("duplicate-role"), "The owner must reject a duplicate employee-role pair");
assert(appSource.includes("Замена заблокирована для нескольких назначений"), "Single-role replacement must remain fail-closed when an employee has multiple assignments");
assert(appSource.includes("сервер ещё не поддерживает сохранение периода действия назначения"), "Effective windows must fail closed without durable persistence");
for (const blockedOperation of [
  "effective-window-persistence",
  "subject-responsibility-scope-persistence",
  "assignment-responsibility-scope-persistence",
  "read-only-role-persistence",
]) {
  assert(appSource.includes(`"${blockedOperation}"`), `${blockedOperation} must be declared as blocked by the host`);
  assert(adapterSource.includes(`"${blockedOperation}"`), `${blockedOperation} must have a typed visible blocked-state projection`);
}
assert(scenarioSource.includes("Операции, ожидающие серверный контракт"), "Roles React UI must show its exact blocked server operations");
assert(!scenarioSource.includes("legacy"), "Roles React UI must not direct actions into a legacy renderer");
assert(!scenarioSource.includes("data-react-complete-marker"), "Roles must remain explicitly partial while durable owner gaps remain");
assert(scenarioSource.includes('data-react-parity-status="partial"'), "Roles must expose an honest partial parity marker");
assert(appSource.includes("if (!reactivate && roleAssignments.length)"), "Roles lifecycle host must reject assigned-role deactivation");
assert(appSource.includes("if (!reactivate && currentRoleIds.includes(roleId))"), "Roles lifecycle host must reject deactivation of the current effective role");
assert(appSource.includes("confirmRoleId !== roleId"), "Roles lifecycle host must keep confirmation bound to the exact stable role ID");

console.log("Roles React runtime policy QA: OK");
