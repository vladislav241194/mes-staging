import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionSource(fileSource, functionName) {
  const start = fileSource.indexOf(`function ${functionName}(`);
  assert(start >= 0, `Missing function ${functionName}`);
  const next = fileSource.indexOf("\nfunction ", start + 10);
  return fileSource.slice(start, next >= 0 ? next : fileSource.length);
}

const [app, structure, timesheet, roles, directories, events, server, publicAuth, domainApi, sharedState] = await Promise.all([
  source("src/app.js"),
  source("src/modules/production_structure_matrix/render.js"),
  source("src/modules/timesheet/render.js"),
  source("src/modules/access_roles/render.js"),
  source("src/modules/app_interactions/render.js"),
  source("src/modules/app_events/service.js"),
  source("server.js"),
  source("scripts/public-auth-guard.mjs"),
  source("scripts/domain-api.mjs"),
  source("scripts/shared-state-endpoint.mjs"),
]);

const expectations = [
  ["saveAttendanceEvent", 'authorizeSystemDomainAction("timesheet", "edit"'],
  ["removeAttendanceEvents", 'authorizeSystemDomainAction("timesheet", "edit"'],
  ["saveScheduleAssignment", 'authorizeSystemDomainAction("timesheet", "edit"'],
  ["removeScheduleAssignment", 'authorizeSystemDomainAction("timesheet", "edit"'],
  ["updateAccessRole", 'authorizeSystemDomainAction("roles", "configure"'],
  ["setAccessGrant", 'authorizeSystemDomainAction("roles", "configure"'],
  ["setSubjectRoleAssignment", 'authorizeSystemDomainAction("roles", "assign"'],
  ["setResponsibilityScope", 'authorizeSystemDomainAction("roles", "configure"'],
  ["resetAccessControlConfiguration", 'authorizeSystemDomainAction("roles", "configure"'],
  ["syncResponsibilityPolicyFromCompatibilityState", 'authorizeSystemDomainAction("productionStructureMatrix", "assign"'],
  ["canEditDirectorySection", 'authorizeSystemDomainAction("directories", "edit"'],
];
expectations.forEach(([functionName, guard]) => {
  assert(functionSource(app, functionName).includes(guard), `${functionName} is missing ${guard}`);
});

assert(functionSource(app, "canEditSystemDomainRegistry").includes('service?.can(subject, "productionStructureMatrix", "edit"'), "Structure mutations are not guarded by canonical can().");
assert(structure.includes("canEditSystemDomainRegistry(registryId) === true"), "Structure UI does not consume the edit guard.");
assert(timesheet.includes("canEditTimesheetEmployee(employee.timesheetId) === true"), "Timesheet editor does not expose read-only mode.");
assert(timesheet.includes('reason: "access_denied"'), "Timesheet handlers do not fail closed on denied writes.");
assert(roles.includes("adapter.canConfigure(accessSubject, accessResourceContext)"), "Access roles UI does not evaluate configure permission.");
assert(directories.includes('sectionId === "statuses"') && directories.includes("readOnly: true"), "Status contracts are not hard read-only.");
assert(directories.includes("!canEditDirectorySection(sectionId)"), "Directory renderer does not apply authorization.");
assert(events.includes("!canEditDirectorySection(sectionId)"), "Directory mutation service does not fail closed.");

const publicGuardIndex = server.indexOf("handlePublicAuthRequest(req, res");
const sharedStateRouteIndex = server.indexOf('url.pathname === "/api/shared-state"');
assert(publicGuardIndex >= 0 && sharedStateRouteIndex > publicGuardIndex, "Shared-state route must stay behind the public auth guard.");
assert(publicAuth.includes("if (hasValidSession(req, env)) return false;"), "Public auth guard does not validate the server session.");
assert(publicAuth.includes("export function getPublicAuthPrincipal"), "Public auth guard does not expose a server-derived authenticated principal.");
assert(publicAuth.includes("if (!isPublicAuthHost(req, env)) return null;"), "Public command principal must not be accepted on an internal host.");
assert(domainApi.includes("const actor = getPublicAuthPrincipal(req, env);"), "Specifications 2.0 command does not derive an authenticated actor server-side.");
assert(domainApi.includes("actorId: actor.id"), "Specifications 2.0 command does not persist its server-derived actor.");
assert(sharedState.includes("baseVersion !== currentVersion"), "Shared-state writes are missing optimistic concurrency.");
assert(sharedState.includes("destructive-action-disabled"), "Protected shared-state destructive actions are not denied.");
assert(sharedState.includes("backupSharedStateFile"), "Shared-state write path has no server backup hook.");

console.log("System Domain Authorization Coverage QA");
console.log(`- canonical mutation callbacks guarded: ${expectations.length + 1}`);
console.log("- structure, timesheet, roles and directories UI fail closed: pass");
console.log("- shared-state route authenticated, versioned and backup-capable: pass");
