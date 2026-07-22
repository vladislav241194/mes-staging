import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { prepareAdditionalRoleAssignment } from "../src/modules/access_roles/multiple_assignment_owner.js";

const [scenario, adapter, ports, app] = await Promise.all([
  readFile(new URL("../experiments/react-migration/src/modules/roles/RolesScenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/roles/adapter.ts", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/roles/ports.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
]);

for (const command of [
  "add-assignment",
  "update-assignment-window",
  "set-subject-responsibility-scope",
  "set-assignment-responsibility-scope",
  "set-role-read-only",
]) {
  assert.match(ports, new RegExp(`type: "${command}"`), `${command} must have a module-specific typed port`);
  assert.match(scenario, new RegExp(`type: "${command}"`), `${command} must have an explicit React control`);
}
assert.match(app, /command\.type === "add-assignment"/, "immediate additional assignment must reach the current access-control owner");
for (const command of [
  "update-assignment-window",
  "set-subject-responsibility-scope",
  "set-assignment-responsibility-scope",
  "set-role-read-only",
]) assert.doesNotMatch(app, new RegExp(`command\\.type === "${command}"`), `${command} must remain fail-closed while its durable owner is absent`);

for (const capability of [
  "multipleAssignmentsEdit",
  "effectiveWindowEdit",
  "subjectResponsibilityScopeEdit",
  "assignmentResponsibilityScopeEdit",
  "readOnlyRoleEdit",
]) {
  assert.match(ports, new RegExp(`capabilities\\.${capability} === true`), `${capability} must require the exact true value`);
}

for (const marker of [
  "data-react-role-add-assignment",
  "data-react-role-update-effective-window",
  "data-react-role-subject-scope",
  "data-react-role-assignment-scope",
  "data-react-role-read-only-control",
]) {
  assert.match(scenario, new RegExp(marker), `${marker} must identify the typed React control`);
}

assert.match(adapter, /deferredCapabilities: adaptRolesDeferredCapabilities\(capabilities\)/);
assert.match(adapter, /validFrom: text\(assignment\.validFrom \|\| assignment\.effectiveFrom\)/);
assert.match(adapter, /responsibilityScope: readResponsibilityScope\(assignment\)/);
assert.match(scenario, /canExecuteRolesDeferredCommand\(model\.deferredCapabilities, command\) !== true/);
assert.doesNotMatch(`${scenario}\n${adapter}\n${ports}`, /setSubjectRoleAssignment|updateAccessRole|ensureAccessRolesModule|modules\/access_roles\/service/);
assert.doesNotMatch(scenario, /data-react-complete-marker/, "partial Roles parity must not publish a completion marker");
assert.match(scenario, /data-react-parity-status="partial"/);

const assignments = [
  { id: "assignment:employee-1:role-a", employeeId: "employee-1", roleId: "role-a", serverOnlyMarker: "preserve" },
  { id: "assignment:employee-2:role-b", employeeId: "employee-2", roleId: "role-b" },
];
const prepared = prepareAdditionalRoleAssignment({
  assignments,
  confirmEmployeeId: "employee-1",
  employeeId: "employee-1",
  expectedAssignmentIds: ["assignment:employee-1:role-a"],
  roleId: "role-b",
});
assert.equal(prepared.ok, true);
assert.deepEqual(prepared.assignment, {
  id: "access-role-assignment:employee-1:role-b",
  employeeId: "employee-1",
  roleId: "role-b",
  source: "access-control",
  sourceRef: { system: "access-control", command: "add-assignment" },
});
assert.equal(assignments[0].serverOnlyMarker, "preserve", "preparation must not mutate an existing assignment row");
assert.equal(prepareAdditionalRoleAssignment({
  assignments,
  confirmEmployeeId: "employee-other",
  employeeId: "employee-1",
  expectedAssignmentIds: ["assignment:employee-1:role-a"],
  roleId: "role-b",
}).code, "employee-confirmation-mismatch");
assert.equal(prepareAdditionalRoleAssignment({
  assignments,
  confirmEmployeeId: "employee-1",
  employeeId: "employee-1",
  expectedAssignmentIds: [],
  roleId: "role-b",
}).code, "assignment-set-changed");
assert.equal(prepareAdditionalRoleAssignment({
  assignments,
  confirmEmployeeId: "employee-1",
  employeeId: "employee-1",
  expectedAssignmentIds: ["assignment:employee-1:role-a"],
  roleId: "role-a",
}).code, "duplicate-role");

await Promise.all([
  transform(scenario, { loader: "tsx", format: "esm", target: "es2022" }),
  transform(adapter, { loader: "ts", format: "esm", target: "es2022" }),
  transform(ports, { loader: "ts", format: "esm", target: "es2022" }),
]);

console.log("Roles deferred command ports QA passed");
console.log("- immediate multiple-assignment owner with exact set/ID guards: pass");
console.log("- effective window typed control remains fail-closed: pass");
console.log("- subject and assignment responsibility scope typed controls: pass");
console.log("- read-only role typed control: pass");
console.log("- exact-true capability gates and owner absence: pass");
