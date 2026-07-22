import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createAccessControlService } from "../src/modules/access_control/service.js";
import { getSystemDomainAccessSubject, toAccessControlAssignments, toAccessControlRoles } from "../src/modules/system_domains/runtime_adapter.js";

const domains = {
  registries: {
    accessRoles: [
      { id: "master", label: "Мастер", scope: "workCenter", defaultModuleId: "shiftMasterBoard", isActive: true },
      { id: "auditor", label: "Аудитор", scope: "factory", readOnly: true, isActive: true },
    ],
    grants: [
      { id: "master-view", roleId: "master", resourceId: "shiftMasterBoard", actionId: "view", effect: "allow" },
      { id: "master-edit", roleId: "master", resourceId: "shiftMasterBoard", actionId: "edit", effect: "allow" },
      { id: "auditor-view", roleId: "auditor", resourceId: "roles", actionId: "view", effect: "allow" },
      { id: "auditor-edit", roleId: "auditor", resourceId: "roles", actionId: "edit", effect: "allow" },
    ],
    roleAssignments: [
      { id: "assignment-master", employeeId: "employee-master", roleId: "master" },
      { id: "assignment-auditor", employeeId: "employee-auditor", roleId: "auditor" },
    ],
    employees: [
      { id: "employee-master", isActive: true },
      { id: "employee-auditor", isActive: true },
    ],
    employmentAssignments: [
      { id: "employment-master", employeeId: "employee-master", workCenterId: "wc-smt", isPrimary: true },
    ],
  },
};

const roles = toAccessControlRoles(domains);
const assignments = toAccessControlAssignments(domains);
const service = createAccessControlService({ accessRoles: roles, subjectRoleAssignments: assignments });
const master = getSystemDomainAccessSubject(domains, "employee-master");
const auditor = getSystemDomainAccessSubject(domains, "employee-auditor");

assert.equal(roles.length, 2);
assert.equal(assignments.length, 2);
assert.deepEqual(master.workCenterIds, ["wc-smt"]);
assert(service.can(master, "shiftMasterBoard", "view", { workCenterId: "wc-smt" }));
assert(service.can(master, "shiftMasterBoard", "edit", { workCenterId: "wc-smt" }));
assert(!service.can(master, "shiftMasterBoard", "edit", { workCenterId: "wc-other" }), "work-center scope must fail closed");
assert(service.can(auditor, "roles", "view"));
assert(!service.can(auditor, "roles", "edit"), "read-only roles must deny mutating actions");

const [adapter, scenario, app, domainApi] = await Promise.all([
  readFile(new URL("../experiments/react-migration/src/modules/roles/adapter.ts", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/roles/RolesScenario.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("./domain-api.mjs", import.meta.url), "utf8"),
]);
assert(adapter.includes('if (!id || id === "authPrototype") return []'), "React projection must exclude the auth system screen");
assert(adapter.includes("canEditMetadata: capabilities.metadataEdit === true"), "write capabilities must be explicit booleans");
assert(scenario.includes('data-react-parity-status="partial"'));
assert(!scenario.includes("data-react-complete-marker"));
assert(app.includes('systemDomainsServerCommandState.surfaces.includes("access-control")'), "client writes must require a server capability");
assert.match(domainApi, /if \(surface === "access-control"\)[\s\S]*?system-domains-surface-not-server-authorized/);

console.log("Access Roles domain/React integration QA: OK");
console.log("- canonical reads and access semantics: pass");
console.log("- React commands: fail closed without the real access-control server owner");
