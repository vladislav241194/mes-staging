import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createEmployeeSessionCookie } from "./employee-auth-guard.mjs";
import {
  SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT,
  projectSystemDomainsTimesheetAuthorization,
  resolveSystemDomainsTimesheetAuthorization,
} from "./system-domains-command-authorization.mjs";

const now = new Date("2026-07-22T09:00:00.000Z");
const env = {
  DATABASE_URL: "postgres://timesheet-auth-qa/not-used",
  MES_PUBLIC_AUTH_HOSTS: "mes.local",
  MES_PUBLIC_AUTH_USERNAME: "user",
  MES_PUBLIC_AUTH_SESSION_SECRET: "timesheet-public-qa-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "mes.local",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "timesheet-employee-qa-secret",
  MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: "3600",
};

assert.deepEqual(SYSTEM_DOMAINS_TIMESHEET_AUTHORIZATION_CONTRACT, {
  moduleId: "timesheet",
  resourceId: "timesheet",
  action: "edit",
});

function publicCookie() {
  const issuedAt = Math.floor(now.getTime() / 1000) - 1;
  const body = Buffer.from(JSON.stringify({ user: "user", scope: "public", iat: issuedAt, exp: issuedAt + 3600 }), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.MES_PUBLIC_AUTH_SESSION_SECRET).update(body).digest("base64url");
  return `mes_user_session=${encodeURIComponent(`${body}.${signature}`)}`;
}

function employeeCookie() {
  return createEmployeeSessionCookie({
    employeeId: "employee-master",
    authVersion: 4,
    publicPrincipalId: "public:user",
  }, env, now).split(";", 1)[0];
}

function request({ includeEmployee = true } = {}) {
  const cookies = [publicCookie()];
  if (includeEmployee) cookies.push(employeeCookie());
  return { headers: { host: "mes.local", cookie: cookies.join("; ") } };
}

let employeeMode = "valid";
function employeeAuthRepositoryFactory() {
  return {
    async inspectSession({ employeeId, authVersion }) {
      if (employeeMode === "throw") throw new Error("employee owner unavailable");
      if (employeeMode === "revoked") return { valid: false, reason: "revoked-session" };
      if (employeeId !== "employee-master" || authVersion !== 4) return { valid: false, reason: "employee-session-rejected" };
      return { valid: true, employeeId, authVersion, displayName: "Master QA", personnelNumber: "M-001" };
    },
    async close() {},
  };
}

let roleId = "work-center-editor";
let domainsMode = "ready";
function domainsRepositoryFactory() {
  return {
    async get() {
      if (domainsMode === "throw") throw new Error("System Domains owner unavailable");
      return {
        revision: 17,
        item: {
          registries: {
            employees: [
              { id: "employee-master", displayName: "Master QA", isActive: true },
              { id: "employee-same", displayName: "Same Work Center", isActive: true },
              { id: "employee-other", displayName: "Other Work Center", isActive: true },
              { id: "employee-archived", displayName: "Archived", isActive: false },
            ],
            employmentAssignments: [
              { id: "employment-master", employeeId: "employee-master", positionId: "position-master", orgUnitId: "department-a", workCenterId: "work-center-a", isPrimary: true },
              { id: "employment-same", employeeId: "employee-same", positionId: "position-worker", orgUnitId: "department-a", workCenterId: "work-center-a", isPrimary: true },
              { id: "employment-other", employeeId: "employee-other", positionId: "position-worker", orgUnitId: "department-b", workCenterId: "work-center-b", isPrimary: true },
            ],
            accessRoles: [
              { id: "work-center-editor", label: "Work Center Editor", scope: "workCenter", isActive: true },
              { id: "self-editor", label: "Self Editor", scope: "self", isActive: true },
              { id: "viewer", label: "Viewer", scope: "factory", isActive: true },
            ],
            grants: [
              { id: "work-center-view", roleId: "work-center-editor", resourceId: "timesheet", actionId: "view", effect: "allow" },
              { id: "work-center-edit", roleId: "work-center-editor", resourceId: "timesheet", actionId: "edit", effect: "allow" },
              { id: "self-view", roleId: "self-editor", resourceId: "timesheet", actionId: "view", effect: "allow" },
              { id: "self-edit", roleId: "self-editor", resourceId: "timesheet", actionId: "edit", effect: "allow" },
              { id: "viewer-view", roleId: "viewer", resourceId: "timesheet", actionId: "view", effect: "allow" },
            ],
            roleAssignments: [{ id: "role-assignment", employeeId: "employee-master", roleId }],
          },
        },
      };
    },
    async close() {},
  };
}

const options = {
  env,
  employeeAuthRepositoryFactory,
  domainsRepositoryFactory,
  now: () => now,
};

const sessionOnly = projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), options));
assert.equal(sessionOnly.authenticated, true);
assert.equal(sessionOnly.authorized, false);
assert.equal(sessionOnly.reason, "timesheet-target-required");

const sameWorkCenter = projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-same",
}));
assert.equal(sameWorkCenter.authorized, true);
assert.equal(sameWorkCenter.actor?.id, "employee:employee-master");
assert.equal(sameWorkCenter.targetEmployeeId, "employee-same");
assert.equal(sameWorkCenter.revision, 17);

const editWithoutView = projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-same",
  accessControlServiceFactory() {
    return {
      explainCan(_subject, _moduleId, action) {
        return { allowed: action === "edit", reason: action === "edit" ? "allowed" : "action-not-granted" };
      },
    };
  },
}));
assert.equal(editWithoutView.authorized, false);
assert.equal(editWithoutView.reason, "action-not-granted");

const otherWorkCenter = projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-other",
}));
assert.equal(otherWorkCenter.authorized, false);
assert.equal(otherWorkCenter.reason, "outside-responsibility-scope");

roleId = "self-editor";
assert.equal(projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-master",
})).authorized, true);
assert.equal(projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-same",
})).authorized, false);

roleId = "viewer";
assert.equal(projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-master",
})).reason, "action-not-granted");
assert.equal(projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-archived",
})).reason, "timesheet-target-unavailable");

assert.equal(projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request({ includeEmployee: false }), {
  ...options,
  targetEmployeeId: "employee-master",
})).authenticated, false);

employeeMode = "revoked";
assert.equal(projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-master",
})).reason, "revoked-session");
employeeMode = "valid";

domainsMode = "throw";
const ownerOutage = projectSystemDomainsTimesheetAuthorization(await resolveSystemDomainsTimesheetAuthorization(request(), {
  ...options,
  targetEmployeeId: "employee-master",
}));
assert.equal(ownerOutage.infrastructureUnavailable, true);
assert.equal(ownerOutage.authorized, false);

console.log("System Domains Timesheet command authorization QA: OK");
console.log("- signed employee session, work-center/self target scope and revision binding: pass");
console.log("- edit-without-view, missing/revoked session, archived target and owner outage fail closed: pass");
