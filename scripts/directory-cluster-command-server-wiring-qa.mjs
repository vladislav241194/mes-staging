import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderRuntimeConfigScript } from "./shared-state-storage.mjs";

const [serverSource, previewSource, commandSource, authorizationSource, sharedStateSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("./preview-dist.mjs", import.meta.url), "utf8"),
  readFile(new URL("./domain-directory-cluster-command.mjs", import.meta.url), "utf8"),
  readFile(new URL("./nomenclature-command-authorization.mjs", import.meta.url), "utf8"),
  readFile(new URL("./shared-state-endpoint.mjs", import.meta.url), "utf8"),
]);

for (const [entrypoint, source] of [["source server", serverSource], ["production preview", previewSource]]) {
  const publicAuthIndex = source.indexOf("handlePublicAuthRequest(req");
  const employeeAuthIndex = source.indexOf("handleEmployeeAuthRequest(req");
  const directoryCommandIndex = source.indexOf("handleDirectoryClusterCommandRequest(req");
  const nomenclatureCommandIndex = source.indexOf("handleNomenclatureCommandRequest(req");
  const domainApiIndex = source.indexOf("handleDomainApiRequest(req");
  assert(publicAuthIndex >= 0, `${entrypoint}: public authentication must remain the Pilot perimeter`);
  assert(employeeAuthIndex > publicAuthIndex, `${entrypoint}: employee auth routes must run after the public perimeter`);
  assert(directoryCommandIndex > employeeAuthIndex, `${entrypoint}: Directory commands must run after employee auth routes`);
  assert(nomenclatureCommandIndex > directoryCommandIndex, `${entrypoint}: Directory and Nomenclature narrow owners must have deterministic order`);
  assert(domainApiIndex > nomenclatureCommandIndex, `${entrypoint}: narrow command owners must run before the generic domain API`);

  const wiring = source.slice(directoryCommandIndex, nomenclatureCommandIndex);
  assert.match(wiring, /env:\s*process\.env/, `${entrypoint}: exact process environment`);
  assert.match(wiring, /filePath:\s*sharedStatePaths\.filePath/, `${entrypoint}: shared-state path`);
  assert.match(wiring, /backupDir:\s*sharedStatePaths\.backupDir/, `${entrypoint}: backup path`);
  assert.match(wiring, /auditLogPath:\s*sharedStatePaths\.auditLogPath/, `${entrypoint}: audit path`);
  assert.match(wiring, /inspectEmployeeAuthSession\(req, process\.env\)/, `${entrypoint}: signed employee session`);
  assert.match(wiring, /getCurrentDirectoryAuthorization\(session\.principal/, `${entrypoint}: current Directory RBAC`);
  assert.match(wiring, /moduleId:\s*surface === "boards" \? "nomenclature" : "directories"/, `${entrypoint}: surface-owned RBAC module`);
  assert.match(wiring, /resourceId:\s*resource/, `${entrypoint}: route-owned resource id`);
  assert.match(wiring, /employee-auth-storage-unavailable/, `${entrypoint}: auth storage failure`);
  assert.match(wiring, /\(\?:unavailable\|not-configured\)\$/, `${entrypoint}: RBAC infrastructure failure`);
  assert.match(wiring, /throw new Error\("Current Directory RBAC projection is unavailable"\)/, `${entrypoint}: fail-closed RBAC error`);
  assert.doesNotMatch(wiring, /(?:payload|body)\.(?:actor|role|employeeId)/iu, `${entrypoint}: request body must not grant authority`);
}

assert.match(authorizationSource, /export async function getCurrentDirectoryAuthorization/);
assert.match(authorizationSource, /moduleId = "directories"/);
assert.match(authorizationSource, /resourceId = "nomenclature"/);
assert.match(authorizationSource, /explainCan\(subject, normalizedModuleId, "edit", resource\)/);
assert.match(authorizationSource, /moduleId: "nomenclature"/);
assert.match(commandSource, /MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS/);
assert.match(commandSource, /\/api\/v1\/directory\/nomenclature-types\/capabilities/);
assert.match(commandSource, /\/api\/v1\/directory\/boards\/capabilities/);
assert.match(commandSource, /hasSameOriginRequestContext/);
assert.match(commandSource, /parseIfMatch/);
assert.match(commandSource, /receiptKey/);
assert.match(commandSource, /updateSharedStateSnapshot/);
assert.match(commandSource, /backupSharedStateFile/);
assert.match(commandSource, /appendSharedStateAudit/);
assert.match(commandSource, /superseded-idempotent-replay/);
assert.match(sharedStateSource, /DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY/);
assert.match(sharedStateSource, /validateDirectoryClusterServerAuthorityWrite/);
assert.match(sharedStateSource, /directory-cluster-command-required/);

const publicRuntime = renderRuntimeConfigScript({
  MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "must-not-leak",
});
assert.match(publicRuntime, /"MES_DIRECTORY_CLUSTER_SERVER_COMMANDS_PRIMARY":true/,
  "browser bootstrap must publish the non-secret server-primary ownership boolean so outages fail closed");
assert.doesNotMatch(publicRuntime, /MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS|must-not-leak/,
  "browser bootstrap must not expose the internal environment variable or employee-auth secret");
assert.doesNotMatch(`${serverSource}\n${previewSource}\n${commandSource}`, /@blueprintjs|Blueprint UI/iu);

console.log("Directory cluster command server wiring QA: OK");
console.log("- source and production preview entrypoints share the authenticated owner wiring: pass");
console.log("- current route-owned RBAC, CAS, receipts and destructive recovery primitives: pass");
console.log("- generic legacy authority guard and public fail-closed ownership boolean: pass");
