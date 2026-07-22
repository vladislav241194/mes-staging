import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAccessControlService,
  normalizeResponsibilityScopes,
} from "../src/modules/access_control/service.js";
import { SYSTEM_DOMAIN_REGISTRY_NAMES } from "../src/modules/system_domains/service.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationRoot = join(repositoryRoot, "experiments", "react-migration");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const migrationNames = (await readdir(join(repositoryRoot, "db", "migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationSources = await Promise.all(migrationNames.map(async (name) => (
  readFile(join(repositoryRoot, "db", "migrations", name), "utf8")
)));
const allMigrations = migrationSources.join("\n");

const [
  ledger,
  commandMatrix,
  appSource,
  rolesScenarioSource,
  rolesFunctionalQaSource,
  rolesRendererSource,
  operationalRuntimeSource,
  appConstantsSource,
  releaseStageSource,
  serverPreflightSource,
  repositorySource,
  coreSchemaSource,
  packageJson,
] = await Promise.all([
  readFile(join(migrationRoot, "cutover-ledger.json"), "utf8").then(JSON.parse),
  readFile(join(migrationRoot, "command-parity-matrix.json"), "utf8").then(JSON.parse),
  readFile(join(repositoryRoot, "src", "app.js"), "utf8"),
  readFile(join(migrationRoot, "src", "modules", "roles", "RolesScenario.tsx"), "utf8"),
  readFile(join(repositoryRoot, "scripts", "roles-react-island-functional-qa.mjs"), "utf8"),
  readFile(join(repositoryRoot, "src", "modules", "access_roles", "render.js"), "utf8"),
  readFile(join(repositoryRoot, "src", "modules", "operational_runtime", "service.js"), "utf8"),
  readFile(join(repositoryRoot, "src", "app_constants.js"), "utf8"),
  readFile(join(repositoryRoot, "scripts", "release-stage.mjs"), "utf8"),
  readFile(join(repositoryRoot, "scripts", "server-preflight.mjs"), "utf8"),
  readFile(join(repositoryRoot, "scripts", "domain-system-domains-repository.mjs"), "utf8"),
  readFile(join(repositoryRoot, "db", "migrations", "011_system_domains_core.sql"), "utf8"),
  readFile(join(repositoryRoot, "package.json"), "utf8").then(JSON.parse),
]);

const rolesLedger = ledger.islands.find((island) => island.id === "roles");
assert(rolesLedger, "Roles must remain explicit in the cutover ledger");
assert(rolesLedger.commands.implemented.includes("set-default-scope"), "Role default scope command must remain implemented");
assert.deepEqual(
  rolesLedger.commands.supportedVariants,
  ["role-default-scope:self"],
  "Role-default self scope must be classified as an implemented command variant",
);
assert.deepEqual(
  rolesLedger.commands.guarded,
  ["deactivate-assigned-role", "deactivate-current-role", "reset-access-control"],
  "Assigned/current-role deactivation and protected access-control reset must be classified as guarded invariants",
);
assert.deepEqual(
  rolesLedger.commands.missing,
  [
    "effective-window-persistence",
    "subject-responsibility-scope-persistence",
    "assignment-responsibility-scope-persistence",
    "read-only-role-persistence",
  ],
  "Roles missing scope must name only real owner or durable-persistence gaps",
);
assert(rolesLedger.commands.implemented.includes("add-immediate-assignment"), "Exact immediate second-role assignment must be classified as implemented");
for (const gap of [
  "effective-window-persistence",
  "subject-responsibility-scope-persistence",
  "assignment-responsibility-scope-persistence",
  "read-only-role-persistence",
]) {
  assert(
    rolesLedger.commands.blockedBy[gap]?.includes("schema-migration"),
    `${gap} must not claim durable parity before its schema migration`,
  );
}
for (const staleClassification of ["personal-scope", "read-only-lifecycle", "assigned-role-lifecycle"]) {
  assert(!rolesLedger.commands.missing.includes(staleClassification), `${staleClassification} must not remain an inflated parity gap`);
}

const rolesMatrix = commandMatrix.scenarios.find((scenario) => scenario.id === "roles");
assert(rolesMatrix?.nextVerticalScope.includes("role-default self scope is implemented"));
assert(rolesMatrix?.nextVerticalScope.includes("assigned/current-role deactivation is a guarded invariant"));
assert(rolesMatrix?.nextVerticalScope.includes("access-control reset on protected contours is a guarded invariant"));
assert(rolesMatrix?.nextVerticalScope.includes("durable owner/schema contracts"));

for (const classification of ["implemented", "missing"]) {
  assert(
    !rolesLedger.commands[classification].includes("reset-access-control"),
    `Access-control reset must not be classified as ${classification}`,
  );
}

const domainReset = section(appSource, "function resetAccessControlConfiguration", "function syncResponsibilityPolicyFromCompatibilityState");
const domainResetGuardIndex = domainReset.indexOf("blockProtectedDestructiveAction(");
const domainResetMutationIndex = domainReset.indexOf("buildCanonicalAccessRegistries(");
assert(
  domainResetGuardIndex >= 0 && domainResetGuardIndex < domainResetMutationIndex,
  "Domain access-control reset must stop at the destructive-action guard before building or committing replacement registries",
);
assert(domainReset.includes('authorizeSystemDomainAction("roles", "configure")'), "Domain reset must retain its configure authorization guard");
assert(domainReset.includes(")) return false;"), "A blocked domain reset must report failure to the compatibility renderer");

const legacyReset = section(operationalRuntimeSource, "function resetAccessRoleConfiguration", "function formatDateTimeShort");
const legacyResetGuardIndex = legacyReset.indexOf("blockProtectedDestructiveAction(");
const legacyResetMutationIndex = legacyReset.indexOf("ui.accessRoleProfiles = []");
assert(
  legacyResetGuardIndex >= 0 && legacyResetGuardIndex < legacyResetMutationIndex,
  "Legacy access-role reset must stop at the destructive-action guard before clearing profiles or assignments",
);

assert(rolesRendererSource.includes('data-access-roles-reset'), "Compatibility Roles renderer must retain the existing reset control");
assert(rolesRendererSource.includes("domainWriter: resetAccessControlConfiguration"), "Compatibility reset must delegate to the guarded domain callback in domain mode");
assert(rolesRendererSource.includes("legacyWriter: () => resetAccessRoleConfiguration()"), "Compatibility reset must delegate to the guarded legacy callback in legacy mode");
assert(!rolesScenarioSource.includes("reset-access-control"), "React Roles must not advertise the protected reset as an implemented command");

assert(
  appConstantsSource.includes('new Set(["pilot", "staging", "user-testing", "production"])'),
  "The destructive-action invariant must cover every protected runtime contour",
);
assert(
  appConstantsSource.includes("MES_RUNTIME_CONFIG.MES_ALLOW_DESTRUCTIVE_ACTIONS === true"),
  "Protected reset may be allowed only by the explicit destructive-action runtime policy",
);
assert(
  releaseStageSource.includes('MES_ALLOW_DESTRUCTIVE_ACTIONS: "false"'),
  "Staged releases must keep destructive actions disabled by default",
);
assert(
  serverPreflightSource.includes("MES_ALLOW_DESTRUCTIVE_ACTIONS=true is not allowed for protected contours by default"),
  "Protected-contour preflight must reject a default destructive-action enablement",
);

assert(
  rolesScenarioSource.includes('scope: "factory" | "department" | "workCenter" | "self"'),
  "Typed Roles command must retain self as a supported role-default scope",
);
assert(
  rolesScenarioSource.includes('<option value="self">Только свои записи</option>'),
  "React Roles must expose self in the role-default scope control",
);
assert(
  rolesFunctionalQaSource.includes('scope === "self"')
    && rolesFunctionalQaSource.includes("legacy Roles did not read back React default scope")
    && rolesFunctionalQaSource.includes("default-scope cleanup"),
  "Functional QA must prove self-scope save, legacy read-back and cleanup",
);

const accessService = createAccessControlService({
  accessRoles: [
    { id: "self-role", scope: "self", grants: { desktop: ["view", "edit"] } },
    { id: "read-only-role", readOnly: true, scope: "factory", grants: { audit: ["view", "edit", "print"] } },
    { id: "second-role", scope: "factory", grants: { desktop: ["view"] } },
  ],
  subjectRoleAssignments: [
    { id: "self-assignment", subjectId: "employee-self", roleId: "self-role" },
    { id: "read-only-assignment", subjectId: "employee-auditor", roleId: "read-only-role" },
    { id: "multi-first", subjectId: "employee-multi", roleId: "self-role" },
    { id: "multi-second", subjectId: "employee-multi", roleId: "second-role" },
  ],
  now: () => new Date("2026-07-21T12:00:00.000Z"),
});
assert(accessService.can({ id: "employee-self" }, "desktop", "edit", { targetSubjectId: "employee-self" }), "Self scope must allow the same subject");
assert(!accessService.can({ id: "employee-self" }, "desktop", "edit", { targetSubjectId: "employee-other" }), "Self scope must reject another subject");
assert(accessService.can({ id: "employee-auditor" }, "audit", "view"), "Read-only role must retain view");
assert(accessService.can({ id: "employee-auditor" }, "audit", "print"), "Read-only role must retain print");
assert(!accessService.can({ id: "employee-auditor" }, "audit", "edit"), "Read-only role must fail closed for mutation");
assert.equal(
  accessService.getEffectiveSubjectRoleAssignments({ id: "employee-multi" }).length,
  2,
  "Domain access semantics may evaluate multiple explicit roles even though no management owner exists",
);

const modeledScopes = normalizeResponsibilityScopes([
  { id: "subject-scope", subjectId: "employee-self", roleId: "self-role", scope: "self" },
  { id: "assignment-scope", assignmentId: "multi-first", scope: "workCenter", workCenterIds: ["wc-1"] },
], { roleIds: ["self-role", "second-role"] });
assert(modeledScopes.some((scope) => scope.subjectId === "employee-self"), "Access-control domain must retain subject-specific scope semantics");
assert(modeledScopes.some((scope) => scope.assignmentId === "multi-first"), "Access-control domain must retain assignment-specific scope semantics");
assert(!SYSTEM_DOMAIN_REGISTRY_NAMES.includes("responsibilityScopes"), "Modeled responsibility scopes must not masquerade as a durable System Domains registry");

const accessRoleTable = section(
  coreSchemaSource,
  "CREATE TABLE IF NOT EXISTS system_access_roles",
  "CREATE TABLE IF NOT EXISTS system_access_grants",
);
const roleAssignmentTable = section(
  coreSchemaSource,
  "CREATE TABLE IF NOT EXISTS system_role_assignments",
  "CREATE TABLE IF NOT EXISTS system_responsibility_policies",
);
assert.match(accessRoleTable, /scope TEXT NOT NULL/);
assert.doesNotMatch(accessRoleTable, /read_only/i, "PostgreSQL role table must not be credited with readOnly persistence before migration");
assert.doesNotMatch(roleAssignmentTable, /(?:valid|effective)_(?:from|to)/i, "PostgreSQL assignment table must not be credited with effective-window persistence before migration");
assert.doesNotMatch(allMigrations, /ALTER TABLE\s+system_access_roles/i, "A later migration must trigger an explicit readOnly ledger review");
assert.doesNotMatch(allMigrations, /ALTER TABLE\s+system_role_assignments/i, "A later migration must trigger an explicit effective-window ledger review");
assert.doesNotMatch(allMigrations, /system_responsibility_scopes/i, "A responsibility-scope table must trigger an explicit ledger review");

const roleWriteProjection = section(
  repositorySource,
  'for (const item of rows(domains, "accessRoles"))',
  'for (const item of rows(domains, "grants"))',
);
const assignmentWriteProjection = section(
  repositorySource,
  'for (const item of rows(domains, "roleAssignments"))',
  'for (const item of rows(domains, "responsibilityPolicies"))',
);
const roleReadProjection = section(
  repositorySource,
  "accessRoles: accessRoles.map",
  "responsibilityPolicies: policies.map",
);
assert.doesNotMatch(roleWriteProjection, /readOnly|read_only/, "Repository write must not be credited with readOnly persistence");
assert.doesNotMatch(roleReadProjection, /readOnly|read_only/, "Repository read must not be credited with readOnly persistence");
assert.doesNotMatch(assignmentWriteProjection, /(?:valid|effective)(?:From|To)|(?:valid|effective)_(?:from|to)/, "Repository write must not be credited with effective-window persistence");
assert.doesNotMatch(roleReadProjection, /roleAssignments:[^\n]*(?:valid|effective)/, "Repository read must not be credited with effective-window persistence");

const rolesHost = section(appSource, "const rolesReactIslandHost", "function getDirectoryComponentTypesReactLocalQaOverrides");
const assignmentCommand = section(rolesHost, 'if (command.type === "set-assignment")', 'if (!authorizeSystemDomainAction("roles", "configure"))');
const assignmentWriteIndex = assignmentCommand.indexOf("await setSubjectRoleAssignment");
assert(assignmentWriteIndex >= 0, "Roles assignment command must retain its existing owner delegation");
for (const guard of ["if (assignments.length > 1)", "assignment.validFrom", "assignment.validTo", "assignment.effectiveFrom", "assignment.effectiveTo"]) {
  const guardIndex = assignmentCommand.indexOf(guard);
  assert(guardIndex >= 0 && guardIndex < assignmentWriteIndex, `${guard} must fail closed before the assignment owner write`);
}
assert(rolesFunctionalQaSource.includes("dated assignment guard must reject before PUT"), "Dated assignment fail-closed behavior must have executable zero-PUT evidence");

const lifecycleCommand = section(rolesHost, 'if (command.type === "deactivate-role"', 'if (command.type === "set-default-scope")');
const lifecycleWriteIndex = lifecycleCommand.indexOf("await updateAccessRole");
for (const guard of ["if (!reactivate && roleAssignments.length)", "if (!reactivate && currentRoleIds.includes(roleId))"]) {
  const guardIndex = lifecycleCommand.indexOf(guard);
  assert(guardIndex >= 0 && guardIndex < lifecycleWriteIndex, `${guard} must remain a pre-write lifecycle invariant`);
}
assert(rolesScenarioSource.includes("selected.active && selected.assignedEmployees.length > 0"), "Assigned-role deactivation must be disabled in the React UI");
assert(rolesFunctionalQaSource.includes("assigned role rejection must happen before PUT"), "Assigned-role invariant must have executable zero-PUT evidence");

const assignmentOwner = section(appSource, "function setSubjectRoleAssignment", "function setResponsibilityScope");
assert(assignmentOwner.includes("rows.filter((assignment) => assignment.employeeId !== normalizedSubjectId)"), "Current owner must remain explicitly replace-all for one employee");
assert(assignmentOwner.includes("id: `access-role-assignment:${normalizedSubjectId}`"), "Current owner must remain a single immediate-assignment owner");

for (const serviceFactory of ["function rebuildSystemDomainsAccessControlService", "function getAccessControlService"]) {
  const nextFunctionStart = appSource.indexOf("\nfunction ", appSource.indexOf(serviceFactory) + serviceFactory.length);
  const factorySource = appSource.slice(appSource.indexOf(serviceFactory), nextFunctionStart);
  assert(!factorySource.includes("responsibilityScopes"), `${serviceFactory} must not be credited with live responsibility-scope wiring`);
}

assert(
  packageJson.scripts["qa:roles-react-island"]?.includes("roles-cutover-classification-qa.mjs"),
  "Roles island QA must execute the cutover classification regression",
);
assert(
  packageJson.scripts["qa:react-cutover"]?.includes("roles-cutover-classification-qa.mjs"),
  "Global cutover QA must execute the Roles classification regression",
);

console.log("Roles cutover classification QA: OK");
console.log("- role-default self scope: implemented and enforced");
console.log("- assigned/current-role deactivation: guarded before write");
console.log("- access-control reset: compatibility-only and guarded before mutation on protected contours");
console.log("- exact immediate second-role assignment: owner-backed with assignment-set guards");
console.log("- effective-window, responsibility-scope and readOnly PostgreSQL parity: not claimed");
