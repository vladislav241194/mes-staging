import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { createEmployeeSessionCookie } from "./employee-auth-guard.mjs";
import {
  SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT,
  projectSystemDomainsProductionStructureAuthorization,
  resolveSystemDomainsProductionStructureAuthorization,
} from "./system-domains-command-authorization.mjs";

const now = new Date("2026-07-22T08:00:00.000Z");
const env = {
  DATABASE_URL: "postgres://system-domains-auth-qa/not-used",
  MES_PUBLIC_AUTH_HOSTS: "mes.local",
  MES_PUBLIC_AUTH_USERNAME: "user",
  MES_PUBLIC_AUTH_SESSION_SECRET: "system-domains-public-qa-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "mes.local",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "system-domains-employee-qa-secret",
  MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: "3600",
};

assert.deepEqual(SYSTEM_DOMAINS_PRODUCTION_STRUCTURE_AUTHORIZATION_CONTRACT, {
  moduleId: "productionStructureMatrix",
  resourceId: "production-structure",
  action: "edit",
});

function publicCookie(username = "user") {
  const issuedAt = Math.floor(Date.now() / 1000) - 1;
  const body = Buffer.from(JSON.stringify({ user: username, scope: "public", iat: issuedAt, exp: issuedAt + 3600 }), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.MES_PUBLIC_AUTH_SESSION_SECRET).update(body).digest("base64url");
  return `mes_user_session=${encodeURIComponent(`${body}.${signature}`)}`;
}

function employeeCookie({ publicPrincipalId = "public:user", issuedAt = now } = {}) {
  return createEmployeeSessionCookie({ employeeId: "employee-admin", authVersion: 7, publicPrincipalId }, env, issuedAt).split(";", 1)[0];
}

function request({ includeEmployee = true, publicPrincipalId = "public:user", issuedAt = now } = {}) {
  const cookies = [publicCookie()];
  if (includeEmployee) cookies.push(employeeCookie({ publicPrincipalId, issuedAt }));
  return { headers: { host: "mes.local", cookie: cookies.join("; ") } };
}

let employeeMode = "valid";
function employeeAuthRepositoryFactory() {
  return {
    async inspectSession({ employeeId, authVersion }) {
      if (employeeMode === "throw") throw new Error("employee owner unavailable");
      if (employeeMode === "revoked") return { valid: false, reason: "revoked-session" };
      if (employeeId !== "employee-admin" || authVersion !== 7) return { valid: false, reason: "employee-session-rejected" };
      return { valid: true, employeeId, authVersion, displayName: "Structure Admin QA", personnelNumber: "QA-001" };
    },
    async close() {},
  };
}

let roleId = "structure-admin";
let domainsMode = "ready";
function domainsRepositoryFactory() {
  return {
    async get() {
      if (domainsMode === "throw") throw new Error("System Domains owner unavailable");
      return {
        revision: 41,
        item: {
          registries: {
            employees: [{ id: "employee-admin", displayName: "Structure Admin QA", isActive: true }],
            employmentAssignments: [],
            accessRoles: [
              { id: "structure-admin", label: "Structure Admin", scope: "factory", isActive: true },
              { id: "viewer", label: "Viewer", scope: "factory", isActive: true },
            ],
            grants: [
              { id: "admin-view", roleId: "structure-admin", resourceId: "productionStructureMatrix", actionId: "view", effect: "allow" },
              { id: "admin-edit", roleId: "structure-admin", resourceId: "productionStructureMatrix", actionId: "edit", effect: "allow" },
              { id: "viewer-view", roleId: "viewer", resourceId: "productionStructureMatrix", actionId: "view", effect: "allow" },
            ],
            roleAssignments: [{ id: "assignment", employeeId: "employee-admin", roleId }],
          },
        },
      };
    },
    async close() {},
  };
}

const options = { env, employeeAuthRepositoryFactory, domainsRepositoryFactory, now: () => now };
const allowed = await resolveSystemDomainsProductionStructureAuthorization(request(), options);
assert.equal(allowed.allowed, true);
assert.equal(allowed.principal.id, "employee:employee-admin");
assert.equal(allowed.revision, 41);
const projected = projectSystemDomainsProductionStructureAuthorization(allowed);
assert.deepEqual(projected.actor, {
  id: "employee:employee-admin",
  employeeId: "employee-admin",
  displayName: "Structure Admin QA",
  personnelNumber: "QA-001",
  scope: "employee",
});
assert.equal(projected.authorized, true);
assert.equal(projected.canEdit, true);
assert.equal(Object.hasOwn(projected, "decision"), false, "capabilities must not expose the internal RBAC decision graph");

assert.equal((await resolveSystemDomainsProductionStructureAuthorization(request({ includeEmployee: false }), options)).reason, "employee-session-missing");
const unauthenticatedProjection = projectSystemDomainsProductionStructureAuthorization({ allowed: false, reason: "employee-session-missing" });
assert.equal(unauthenticatedProjection.authenticated, false);
assert.equal(unauthenticatedProjection.canEdit, false);
assert.equal(unauthenticatedProjection.actor, null);
assert.equal((await resolveSystemDomainsProductionStructureAuthorization(request({ publicPrincipalId: "public:other" }), options)).reason, "public-principal-mismatch");
assert.equal((await resolveSystemDomainsProductionStructureAuthorization(request({ issuedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) }), options)).reason, "employee-session-expired");

employeeMode = "revoked";
assert.equal((await resolveSystemDomainsProductionStructureAuthorization(request(), options)).reason, "revoked-session");
employeeMode = "valid";

roleId = "viewer";
const revokedRbac = await resolveSystemDomainsProductionStructureAuthorization(request(), options);
assert.equal(revokedRbac.allowed, false);
assert.equal(revokedRbac.reason, "action-not-granted");
assert.equal(revokedRbac.revision, 41);
roleId = "structure-admin";

domainsMode = "throw";
const ownerOutage = await resolveSystemDomainsProductionStructureAuthorization(request(), options);
assert.equal(ownerOutage.allowed, false);
assert.equal(ownerOutage.infrastructureUnavailable, true);
assert.equal(ownerOutage.reason, "system-domains-storage-unavailable");
domainsMode = "ready";

employeeMode = "throw";
const employeeOwnerOutage = await resolveSystemDomainsProductionStructureAuthorization(request(), options);
assert.equal(employeeOwnerOutage.infrastructureUnavailable, true);
assert.equal(employeeOwnerOutage.reason, "employee-auth-storage-unavailable");

assert.equal(projectSystemDomainsProductionStructureAuthorization({
  allowed: true,
  principal: { id: "employee:other", employeeId: "employee-admin", scope: "employee" },
}).canEdit, false, "an actor mismatch must never become an enabled capability");

console.log("System Domains production-structure command authorization QA: OK");
console.log("- signed employee session, current PostgreSQL RBAC and revision-bound actor: pass");
console.log("- expiry, actor mismatch, revocation, stale grant and owner outage fail closed: pass");
