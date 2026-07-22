import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccessControlService, normalizeResponsibilityScopes } from "../src/modules/access_control/service.js";
import { SYSTEM_DOMAIN_REGISTRY_NAMES } from "../src/modules/system_domains/service.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFile(join(root, path), "utf8");
const section = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `missing source range ${startMarker} -> ${endMarker}`);
  return source.slice(start, end);
};

const migrations = (await readdir(join(root, "db/migrations"))).filter((name) => name.endsWith(".sql")).sort();
const allMigrations = (await Promise.all(migrations.map((name) => read(`db/migrations/${name}`)))).join("\n");
const [ledger, matrix, app, host, scenario, repository, schema, domainApi, rollout] = await Promise.all([
  read("experiments/react-migration/cutover-ledger.json").then(JSON.parse),
  read("experiments/react-migration/command-parity-matrix.json").then(JSON.parse),
  read("src/app.js"),
  read("src/modules/access_roles/react_island_host.js"),
  read("experiments/react-migration/src/modules/roles/RolesScenario.tsx"),
  read("scripts/domain-system-domains-repository.mjs"),
  read("db/migrations/011_system_domains_core.sql"),
  read("scripts/domain-api.mjs"),
  read("ops/postgres/activate-system-domains-command-surfaces.sh"),
]);

await assert.rejects(access(join(root, "src/modules/access_roles/render.js")), { code: "ENOENT" });
await assert.rejects(access(join(root, "src/modules/access_roles/service.js")), { code: "ENOENT" });

const island = ledger.islands.find((item) => item.id === "roles");
const module = ledger.modules.find((item) => item.id === "roles");
const parity = matrix.scenarios.find((item) => item.id === "roles");
assert(island && module && parity, "Roles must remain explicit in every cutover registry");
assert.equal(module.functionalStatus, "partial");
assert.equal(module.productionReady, false);
assert.equal(module.runtimeMode, "react");
assert.equal(module.normalLegacyPath, false);
assert.equal(island.implementationMarker, "React TS · PARTIAL · server writes blocked");
assert.deepEqual(island.commands.implemented, [], "no Roles write may be classified as server-owned");
assert(island.commands.clientImplemented.includes("save-metadata"));
assert(island.commands.clientImplemented.includes("add-immediate-assignment"));
assert.deepEqual(island.commands.serverBlocked, island.commands.clientImplemented);
assert(island.commands.missing.includes("access-control-server-write-owner"));
assert(island.commands.blockedBy["access-control-server-write-owner"].includes("bounded-delta-invariants"));
assert(module.remainingScopes.includes("access-control server authorization and bounded delta owner"));
assert.equal(parity.readParity, "permanent-react-fail-closed");
assert.equal(parity.sliceParity, "partial-owner-blocked");
assert.match(parity.nextVerticalScope, /all access-control writes remain server-blocked/);

assert.doesNotMatch(app, /ensureAccessRolesModule|renderAccessRolesPage|bindAccessRolesEvents|requestLegacyRender\s*:/);
assert.doesNotMatch(host, /requestLegacyRender|onRequestLegacy/);
assert.match(host, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/);
assert(scenario.includes('data-react-parity-status="partial"'));
assert(!scenario.includes("data-react-complete-marker"));

assert.match(domainApi, /if \(surface === "access-control"\)[\s\S]*?system-domains-surface-not-server-authorized/);
assert.match(rollout, /Access\s+Control remains unavailable until its server authorization and delta[\s\S]*?invariants are implemented/);
assert.match(rollout, /access-control\)[\s\S]*?exit 1/);

const accessRoleTable = section(schema, "CREATE TABLE IF NOT EXISTS system_access_roles", "CREATE TABLE IF NOT EXISTS system_access_grants");
const assignmentTable = section(schema, "CREATE TABLE IF NOT EXISTS system_role_assignments", "CREATE TABLE IF NOT EXISTS system_responsibility_policies");
assert.doesNotMatch(accessRoleTable, /read_only/i, "readOnly persistence must remain unclaimed");
assert.doesNotMatch(assignmentTable, /(?:valid|effective)_(?:from|to)/i, "assignment windows must remain unclaimed");
assert.doesNotMatch(allMigrations, /system_responsibility_scopes/i, "responsibility-scope persistence must remain unclaimed");

const roleWrite = section(repository, 'for (const item of rows(domains, "accessRoles"))', 'for (const item of rows(domains, "grants"))');
const assignmentWrite = section(repository, 'for (const item of rows(domains, "roleAssignments"))', 'for (const item of rows(domains, "responsibilityPolicies"))');
const roleRead = section(repository, "accessRoles: accessRoles.map", "responsibilityPolicies: policies.map");
assert.doesNotMatch(roleWrite, /readOnly|read_only/);
assert.doesNotMatch(roleRead, /readOnly|read_only/);
assert.doesNotMatch(assignmentWrite, /(?:valid|effective)(?:From|To)|(?:valid|effective)_(?:from|to)/);

const rolesHost = section(app, "const rolesReactIslandHost", "function getDirectoryComponentTypesReactLocalQaOverrides");
const assignmentCommand = section(rolesHost, 'if (command.type === "set-assignment")', 'if (!authorizeSystemDomainAction("roles", "configure"))');
const assignmentWriteIndex = assignmentCommand.indexOf("await setSubjectRoleAssignment");
assert(assignmentWriteIndex >= 0);
for (const guard of ["if (assignments.length > 1)", "assignment.validFrom", "assignment.validTo"]) {
  const guardIndex = assignmentCommand.indexOf(guard);
  assert(guardIndex >= 0 && guardIndex < assignmentWriteIndex, `${guard} must precede the client owner call`);
}

const lifecycleCommand = section(rolesHost, 'if (command.type === "deactivate-role"', 'if (command.type === "set-default-scope")');
const lifecycleWriteIndex = lifecycleCommand.indexOf("await updateAccessRole");
for (const guard of ["if (!reactivate && roleAssignments.length)", "if (!reactivate && currentRoleIds.includes(roleId))"]) {
  const guardIndex = lifecycleCommand.indexOf(guard);
  assert(guardIndex >= 0 && guardIndex < lifecycleWriteIndex, `${guard} must precede the client owner call`);
}

const accessService = createAccessControlService({
  accessRoles: [
    { id: "self-role", scope: "self", grants: { desktop: ["view", "edit"] } },
    { id: "read-only-role", readOnly: true, scope: "factory", grants: { audit: ["view", "edit", "print"] } },
  ],
  subjectRoleAssignments: [
    { id: "self-assignment", subjectId: "employee-self", roleId: "self-role" },
    { id: "auditor-assignment", subjectId: "employee-auditor", roleId: "read-only-role" },
  ],
  now: () => new Date("2026-07-21T12:00:00.000Z"),
});
assert(accessService.can({ id: "employee-self" }, "desktop", "edit", { targetSubjectId: "employee-self" }));
assert(!accessService.can({ id: "employee-self" }, "desktop", "edit", { targetSubjectId: "employee-other" }));
assert(accessService.can({ id: "employee-auditor" }, "audit", "print"));
assert(!accessService.can({ id: "employee-auditor" }, "audit", "edit"));

const modeledScopes = normalizeResponsibilityScopes([
  { id: "subject-scope", subjectId: "employee-self", roleId: "self-role", scope: "self" },
], { roleIds: ["self-role"] });
assert(modeledScopes.some((scope) => scope.subjectId === "employee-self"));
assert(!SYSTEM_DOMAIN_REGISTRY_NAMES.includes("responsibilityScopes"));

console.log("Roles cutover classification QA: OK");
console.log("- renderer retired; immutable-release rollback remains external to the active source tree");
console.log("- client commands present, real server write owner blocked");
console.log("- durable schema gaps and PARTIAL classification retained");
