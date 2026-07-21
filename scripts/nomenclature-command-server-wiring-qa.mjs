import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getPublicRuntimeConfig,
  renderRuntimeConfigScript,
} from "./shared-state-storage.mjs";

const [serverSource, previewSource, commandSource, authorizationSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("./preview-dist.mjs", import.meta.url), "utf8"),
  readFile(new URL("./domain-nomenclature-command.mjs", import.meta.url), "utf8"),
  readFile(new URL("./nomenclature-command-authorization.mjs", import.meta.url), "utf8"),
]);

for (const [entrypoint, source] of [["source server", serverSource], ["production preview", previewSource]]) {
  const publicAuthIndex = source.indexOf("handlePublicAuthRequest(req");
  const employeeAuthIndex = source.indexOf("handleEmployeeAuthRequest(req");
  const commandIndex = source.indexOf("handleNomenclatureCommandRequest(req");
  const domainApiIndex = source.indexOf("handleDomainApiRequest(req");
  assert(publicAuthIndex >= 0, `${entrypoint}: public authentication must remain the Pilot perimeter`);
  assert(employeeAuthIndex > publicAuthIndex, `${entrypoint}: employee auth routes must run after the public perimeter`);
  assert(commandIndex > employeeAuthIndex, `${entrypoint}: Nomenclature commands must run after employee auth routes`);
  assert(domainApiIndex > commandIndex, `${entrypoint}: the narrow command owner must run before the generic domain API`);

  const commandWiring = source.slice(commandIndex, domainApiIndex);
  assert.match(commandWiring, /env:\s*process\.env/, `${entrypoint}: command env`);
  assert.match(commandWiring, /filePath:\s*sharedStatePaths\.filePath/, `${entrypoint}: shared-state path`);
  assert.match(commandWiring, /backupDir:\s*sharedStatePaths\.backupDir/, `${entrypoint}: backup path`);
  assert.match(commandWiring, /auditLogPath:\s*sharedStatePaths\.auditLogPath/, `${entrypoint}: audit path`);
  assert.match(commandWiring, /inspectEmployeeAuthSession\(req, process\.env\)/, `${entrypoint}: signed employee session`);
  assert.match(commandWiring, /getCurrentNomenclatureAuthorization\(session\.principal/, `${entrypoint}: current RBAC`);
  assert.match(commandWiring, /employee-auth-storage-unavailable/, `${entrypoint}: auth storage failure`);
  assert.match(commandWiring, /\(\?:unavailable\|not-configured\)\$/, `${entrypoint}: RBAC infrastructure failure`);
  assert.match(commandWiring, /throw new Error\("(?:Employee authorization storage|Current Nomenclature RBAC projection) is unavailable"\)/, `${entrypoint}: fail-closed infrastructure error`);
  assert.doesNotMatch(commandWiring, /(?:payload|body)\.(?:actor|role|employeeId)/i, `${entrypoint}: server wiring must never derive command authority from request payload`);
}
assert.match(authorizationSource, /system-domains-storage-not-configured/);
assert.match(authorizationSource, /system-domains-storage-unavailable/);
assert.match(commandSource, /nomenclature-authorization-unavailable/);
assert.match(commandSource, /sendJson\(res, 503,/, "authorization callback/storage failures must fail closed with HTTP 503");

const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY, false);
assert.equal(disabled.MES_EMPLOYEE_AUTH_AVAILABLE, false);
assert.equal(disabled.MES_EMPLOYEE_AUTH_REQUIRED, false);

const commandPrimary = getPublicRuntimeConfig({ MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1" });
assert.equal(commandPrimary.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY, true);
assert.equal(commandPrimary.MES_EMPLOYEE_AUTH_AVAILABLE, false, "command primary does not publish missing employee-auth infrastructure as available");
assert.equal(commandPrimary.MES_EMPLOYEE_AUTH_REQUIRED, false, "server-primary commands must not replace the normal MES login gate");

const explicitEmployeeAuth = getPublicRuntimeConfig({
  MES_ENABLE_EMPLOYEE_AUTH: "1",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "configured-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "pilot.mes-line.ru",
});
assert.equal(explicitEmployeeAuth.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY, false);
assert.equal(explicitEmployeeAuth.MES_EMPLOYEE_AUTH_AVAILABLE, true);
assert.equal(explicitEmployeeAuth.MES_EMPLOYEE_AUTH_REQUIRED, false, "Stage 1 auth availability must keep normal MES login unchanged");
assert.equal(getPublicRuntimeConfig({
  MES_EMPLOYEE_AUTH_ENABLED: "1",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "configured-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "pilot.mes-line.ru",
}).MES_EMPLOYEE_AUTH_AVAILABLE, true, "the compatibility auth flag must publish the same availability");
const requiredEmployeeAuth = getPublicRuntimeConfig({ MES_REQUIRE_EMPLOYEE_AUTH_GATE: "1" });
assert.equal(requiredEmployeeAuth.MES_EMPLOYEE_AUTH_REQUIRED, true, "only the explicit gate flag may require employee auth globally");

const nonExact = getPublicRuntimeConfig({
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "true",
  MES_ENABLE_EMPLOYEE_AUTH: "yes",
  MES_EMPLOYEE_AUTH_ENABLED: "enabled",
});
assert.equal(nonExact.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY, false);
assert.equal(nonExact.MES_EMPLOYEE_AUTH_AVAILABLE, false);
assert.equal(nonExact.MES_EMPLOYEE_AUTH_REQUIRED, false, "non-exact rollout values must fail closed");

const runtimeScript = renderRuntimeConfigScript({
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  MES_ENABLE_EMPLOYEE_AUTH: "1",
  MES_EMPLOYEE_AUTH_HOSTS: "pilot.mes-line.ru",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "employee-secret-must-not-leak",
  MES_DOMAIN_DATABASE_URL: "postgres://must-not-leak",
});
assert.match(runtimeScript, /"MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY":true/);
assert.match(runtimeScript, /"MES_EMPLOYEE_AUTH_AVAILABLE":true/);
assert.match(runtimeScript, /"MES_EMPLOYEE_AUTH_REQUIRED":false/);
assert.doesNotMatch(runtimeScript, /employee-secret-must-not-leak|postgres:\/\/must-not-leak/);

console.log("Nomenclature command server wiring QA: OK");
console.log("- route order, server-derived employee authorization and storage-failure 503: pass");
console.log("- shared-state backup/audit paths: pass");
console.log("- non-secret command-primary, scoped auth availability and explicit global gate flags: pass");
