import assert from "node:assert/strict";

import { getCurrentDirectoryAuthorization } from "./nomenclature-command-authorization.mjs";

const domains = {
  registries: {
    employees: [
      { id: "employee-directories", displayName: "Directory editor", isActive: true },
      { id: "employee-nomenclature", displayName: "Nomenclature editor", isActive: true },
    ],
    employmentAssignments: [],
    accessRoles: [
      { id: "role-directories", label: "Directory editor", scope: "factory", isActive: true },
      { id: "role-nomenclature", label: "Nomenclature editor", scope: "factory", isActive: true },
    ],
    grants: [
      { id: "grant-directories-view", roleId: "role-directories", resourceId: "directories", actionId: "view", effect: "allow" },
      { id: "grant-directories-edit", roleId: "role-directories", resourceId: "directories", actionId: "edit", effect: "allow" },
      { id: "grant-nomenclature-view", roleId: "role-nomenclature", resourceId: "nomenclature", actionId: "view", effect: "allow" },
      { id: "grant-nomenclature-edit", roleId: "role-nomenclature", resourceId: "nomenclature", actionId: "edit", effect: "allow" },
    ],
    roleAssignments: [
      { id: "assignment-directories", employeeId: "employee-directories", roleId: "role-directories" },
      { id: "assignment-nomenclature", employeeId: "employee-nomenclature", roleId: "role-nomenclature" },
    ],
  },
};

let closeCount = 0;
const domainsRepositoryFactory = () => ({
  get: async () => ({ item: domains, revision: 27 }),
  close: async () => { closeCount += 1; },
});
const options = {
  databaseUrl: "postgres://qa.invalid/mes",
  domainsRepositoryFactory,
  now: () => new Date("2026-07-21T08:00:00.000Z"),
};

const directoryPrincipal = {
  id: "employee:employee-directories",
  employeeId: "employee-directories",
  scope: "employee",
};
const nomenclaturePrincipal = {
  id: "employee:employee-nomenclature",
  employeeId: "employee-nomenclature",
  scope: "employee",
};

const typesAllowed = await getCurrentDirectoryAuthorization(directoryPrincipal, {
  ...options,
  moduleId: "directories",
  resourceId: "nomenclatureTypes",
});
assert.equal(typesAllowed.allowed, true, "directories/edit must authorize Nomenclature Types");
assert.equal(typesAllowed.decision.moduleId, "directories");

const boardsDenied = await getCurrentDirectoryAuthorization(directoryPrincipal, {
  ...options,
  moduleId: "nomenclature",
  resourceId: "boards",
});
assert.equal(boardsDenied.allowed, false, "directories/edit must not authorize Boards/BOM");
assert.equal(boardsDenied.reason, "action-not-granted");
assert.equal(boardsDenied.decision.moduleId, "nomenclature");

const boardsAllowed = await getCurrentDirectoryAuthorization(nomenclaturePrincipal, {
  ...options,
  moduleId: "nomenclature",
  resourceId: "boards",
});
assert.equal(boardsAllowed.allowed, true, "nomenclature/edit must authorize Boards/BOM");
assert.equal(boardsAllowed.decision.moduleId, "nomenclature");

const typesDenied = await getCurrentDirectoryAuthorization(nomenclaturePrincipal, {
  ...options,
  moduleId: "directories",
  resourceId: "nomenclatureTypes",
});
assert.equal(typesDenied.allowed, false, "nomenclature/edit must not authorize Nomenclature Types");
assert.equal(typesDenied.reason, "action-not-granted");

assert.equal(closeCount, 4, "every RBAC read must close its repository");
console.log("Directory cluster authorization QA: OK");
console.log("- Nomenclature Types use directories/edit: pass");
console.log("- Boards/BOM use nomenclature/edit and reject directories-only actors: pass");
