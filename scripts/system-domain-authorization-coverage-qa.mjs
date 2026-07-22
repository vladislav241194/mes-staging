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

const [app, structureScenario, structureAdapter, timesheetScenario, timesheetAdapter, roles, rolesAdapter, rolesHost, directories, events, server, publicAuth, domainApi, sharedState] = await Promise.all([
  source("src/app.js"),
  source("experiments/react-migration/src/modules/structure-employees/StructureEmployeesScenario.tsx"),
  source("experiments/react-migration/src/modules/structure-employees/adapter.ts"),
  source("experiments/react-migration/src/modules/timesheet/TimesheetScenario.tsx"),
  source("experiments/react-migration/src/modules/timesheet/adapter.ts"),
  source("experiments/react-migration/src/modules/roles/RolesScenario.tsx"),
  source("experiments/react-migration/src/modules/roles/adapter.ts"),
  source("src/modules/access_roles/react_island_host.ts"),
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
  ["syncResponsibilityPolicyFromCompatibilityState", 'authorizeSystemDomainAction("productionStructureMatrix", "assign"'],
  ["canEditDirectorySection", 'authorizeSystemDomainAction("directories", "edit"'],
];
expectations.forEach(([functionName, guard]) => {
  assert(functionSource(app, functionName).includes(guard), `${functionName} is missing ${guard}`);
});

assert(functionSource(app, "canEditSystemDomainRegistry").includes('service?.can(subject, "productionStructureMatrix", "edit"'), "Structure mutations are not guarded by canonical can().");
assert(structureAdapter.includes("canCreateEdit: capabilities.createEdit === true"), "Structure React adapter must fail closed without an explicit create/edit capability.");
assert(structureAdapter.includes("canArchive: capabilities.archive === true"), "Structure React adapter must fail closed without an explicit archive capability.");
assert(structureScenario.includes("disabled={!model.canCreateEdit}"), "Structure React create action does not fail closed without the projected capability.");
assert(structureScenario.includes("selected && model.canCreateEdit"), "Structure React mutation actions do not fail closed without the projected capability.");
assert(timesheetScenario.includes("disabled={!canEditSchedule}"), "Timesheet schedule action does not fail closed without the projected capability.");
assert(timesheetScenario.includes("disabled={!canEditDay}"), "Timesheet attendance action does not fail closed without the projected capability.");
assert(!timesheetScenario.includes("onRequestLegacy"), "Timesheet must not expose an action fallback to the removed renderer.");
assert(timesheetAdapter.includes("canEditAttendance: editableEmployeeIds.has(id)"), "Timesheet attendance writes do not require an explicit projected employee capability.");
assert(timesheetAdapter.includes("canEditSchedule: scheduleEditableEmployeeIds.has(id)"), "Timesheet schedule writes do not require an explicit projected employee capability.");
assert(roles.includes('data-react-parity-status="partial"'), "Access Roles React UI must remain explicitly partial.");
assert(rolesAdapter.includes("canEditMetadata: capabilities.metadataEdit === true"), "Access Roles writes must require an explicit projected capability.");
assert(rolesHost.includes("canFallbackToLegacy: () => false"), "Access Roles runtime must fail closed without a same-release renderer.");
assert(!rolesHost.includes("requestLegacyRender"), "Access Roles host must not expose a legacy callback.");
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
