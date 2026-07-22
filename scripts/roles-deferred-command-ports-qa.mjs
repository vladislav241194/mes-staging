import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

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
  assert.doesNotMatch(app, new RegExp(`case "${command}"`), `${command} must remain fail-closed while the backend owner is absent`);
}

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

await Promise.all([
  transform(scenario, { loader: "tsx", format: "esm", target: "es2022" }),
  transform(adapter, { loader: "ts", format: "esm", target: "es2022" }),
  transform(ports, { loader: "ts", format: "esm", target: "es2022" }),
]);

console.log("Roles deferred command ports QA passed");
console.log("- multiple assignments / effective window typed controls: pass");
console.log("- subject and assignment responsibility scope typed controls: pass");
console.log("- read-only role typed control: pass");
console.log("- exact-true capability gates and owner absence: pass");
