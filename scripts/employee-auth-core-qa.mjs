import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import {
  createEmployeePinHash,
  verifyEmployeePin,
} from "./employee-auth-crypto.mjs";
import { getFailedEmployeeAuthenticationUpdate } from "./domain-employee-auth-repository.mjs";
import { handleEmployeeAuthRequest } from "./employee-auth-endpoint.mjs";

function publicSessionCookie(env) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    user: env.MES_PUBLIC_AUTH_USERNAME,
    scope: "public",
    iat: now,
    exp: now + 3600,
  }), "utf-8").toString("base64url");
  const signature = createHmac("sha256", env.MES_PUBLIC_AUTH_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `mes_user_session=${encodeURIComponent(`${body}.${signature}`)}`;
}

function responseHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  };
}

function extractSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, /__Host-mes_employee_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  return setCookie.split(";")[0];
}

function tamperCookie(cookie) {
  const index = cookie.indexOf("=");
  const name = cookie.slice(0, index);
  const token = decodeURIComponent(cookie.slice(index + 1));
  const replacement = token.at(-1) === "A" ? "B" : "A";
  return `${name}=${encodeURIComponent(`${token.slice(0, -1)}${replacement}`)}`;
}

const pinHash = await createEmployeePinHash("55555", "employee-auth-qa-salt");
const lockedPinHash = await createEmployeePinHash("24680", "employee-lockout-qa-salt");
assert.equal(await verifyEmployeePin("55555", pinHash), true);
assert.equal(await verifyEmployeePin("wrong", pinHash), false);

let clockMs = Date.now();
const credentials = new Map([
  ["employee-1", {
    employeeId: "employee-1",
    displayName: "Иван Иванов",
    personnelNumber: "0001",
    pinHash,
    authVersion: 1,
    failedAttempts: 0,
    lockedUntil: null,
    active: true,
  }],
  ["employee-lockout", {
    employeeId: "employee-lockout",
    displayName: "Пётр Петров",
    personnelNumber: "0002",
    pinHash: lockedPinHash,
    authVersion: 1,
    failedAttempts: 0,
    lockedUntil: null,
    active: true,
  }],
]);
let employeeAuthStorageUnavailable = false;

function employeeAuthRepositoryFactory() {
  return {
    async schemaStatus() { return { ready: true }; },
    async authenticate({ employeeId, pin, now, maxAttempts, lockSeconds }) {
      const row = credentials.get(employeeId);
      if (!row || !row.active) return { ok: false, reason: "invalid-credentials" };
      if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
        return { ok: false, reason: "locked", lockedUntil: row.lockedUntil.toISOString() };
      }
      if (!await verifyEmployeePin(pin, row.pinHash)) {
        const update = getFailedEmployeeAuthenticationUpdate({
          failed_attempts: row.failedAttempts,
          locked_until: row.lockedUntil,
        }, { now, maxAttempts, lockSeconds });
        row.failedAttempts = update.failedAttempts;
        row.lockedUntil = update.lockedUntil;
        return {
          ok: false,
          reason: update.locked ? "locked" : "invalid-credentials",
          lockedUntil: update.lockedUntil?.toISOString?.() || "",
        };
      }
      row.failedAttempts = 0;
      row.lockedUntil = null;
      return {
        ok: true,
        employeeId: row.employeeId,
        displayName: row.displayName,
        personnelNumber: row.personnelNumber,
        authVersion: row.authVersion,
      };
    },
    async inspectSession({ employeeId, authVersion }) {
      if (employeeAuthStorageUnavailable) throw new Error("employee auth storage unavailable");
      const row = credentials.get(employeeId);
      if (!row) return { valid: false, reason: "missing-credential" };
      if (!row.active) return { valid: false, reason: "inactive-employee" };
      if (row.authVersion !== authVersion) return { valid: false, reason: "revoked-session" };
      return {
        valid: true,
        employeeId: row.employeeId,
        displayName: row.displayName,
        personnelNumber: row.personnelNumber,
        authVersion: row.authVersion,
      };
    },
    async close() {},
  };
}

let roleAssignments = [{
  id: "assignment-1",
  employeeId: "employee-1",
  roleId: "nomenclature-editor",
}];
let domainsRepositoryMode = "ready";

function currentSystemDomains() {
  return {
    schemaId: "mes.system-domains",
    schemaVersion: 1,
    registries: {
      employees: [
        { id: "employee-1", personnelNumber: "0001", displayName: "Иван Иванов", isActive: true },
        { id: "employee-lockout", personnelNumber: "0002", displayName: "Пётр Петров", isActive: true },
      ],
      employmentAssignments: [],
      accessRoles: [{
        id: "nomenclature-editor",
        label: "Редактор номенклатуры",
        scope: "factory",
        isActive: true,
      }],
      grants: [
        { id: "grant-view", roleId: "nomenclature-editor", resourceId: "nomenclature", actionId: "view", effect: "allow" },
        { id: "grant-edit", roleId: "nomenclature-editor", resourceId: "nomenclature", actionId: "edit", effect: "allow" },
      ],
      roleAssignments,
    },
  };
}

function domainsRepositoryFactory() {
  return {
    async get() {
      if (domainsRepositoryMode === "throw") throw new Error("system domains storage unavailable");
      if (domainsRepositoryMode === "empty") return { item: null, revision: 71 };
      return { item: currentSystemDomains(), revision: 71 };
    },
    async close() {},
  };
}

const env = {
  MES_PUBLIC_AUTH_HOSTS: "127.0.0.1",
  MES_PUBLIC_AUTH_USERNAME: "user",
  MES_PUBLIC_AUTH_SESSION_SECRET: "public-session-secret-for-employee-auth-qa",
  MES_EMPLOYEE_AUTH_HOSTS: "127.0.0.1",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "employee-session-secret-for-qa",
  MES_ENABLE_EMPLOYEE_AUTH: "1",
  MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: "60",
  MES_EMPLOYEE_AUTH_MAX_ATTEMPTS: "3",
  MES_EMPLOYEE_AUTH_LOCK_SECONDS: "30",
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  MES_DOMAIN_DATABASE_URL: "postgres://qa/not-used",
};
const outerCookie = publicSessionCookie(env);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const handled = await handleEmployeeAuthRequest(req, res, url, {
    headers: responseHeaders,
    env,
    now: () => new Date(clockMs),
    employeeAuthRepositoryFactory,
    domainsRepositoryFactory,
  });
  if (!handled) {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

async function requestInternalOperatorReadiness() {
  return await new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/api/v1/nomenclature/capabilities",
      method: "GET",
      headers: { "Host": "mes-internal" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, payload: JSON.parse(Buffer.concat(chunks).toString("utf-8")) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function invokeRejectedInternalReadiness(remoteAddress) {
  const req = {
    method: "GET",
    headers: { host: "mes-internal" },
    socket: remoteAddress === undefined ? {} : { remoteAddress },
  };
  const response = {
    statusCode: 0,
    body: "",
    writeHead(statusCode) { this.statusCode = statusCode; },
    end(body = "") { this.body = String(body); },
  };
  const handled = await handleEmployeeAuthRequest(
    req,
    response,
    new URL("http://mes-internal/api/v1/nomenclature/capabilities"),
    {
      headers: responseHeaders,
      env,
      now: () => new Date(clockMs),
      employeeAuthRepositoryFactory,
      domainsRepositoryFactory,
    },
  );
  return { handled, status: response.statusCode, payload: JSON.parse(response.body) };
}

async function request(path, {
  method = "GET",
  employeeCookie = "",
  outerSessionCookie = outerCookie,
  headers = {},
  body,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Cookie": [outerSessionCookie, employeeCookie].filter(Boolean).join("; "),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { response, payload };
}

async function login(employeeId = "employee-1", pin = "55555") {
  const result = await request("/api/v1/auth/employee-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": baseUrl,
      "Sec-Fetch-Site": "same-origin",
    },
    body: { employeeId, pin, role: "forged-admin" },
  });
  return { ...result, employeeCookie: result.response.status === 200 ? extractSessionCookie(result.response) : "" };
}

try {
  // Valid session and current server-side RBAC.
  const validLogin = await login();
  assert.equal(validLogin.response.status, 200);
  assert.equal(validLogin.payload.actor.employeeId, "employee-1");
  const validSession = await request("/api/v1/auth/employee-session", { employeeCookie: validLogin.employeeCookie });
  assert.equal(validSession.payload.authenticated, true);
  const allowedCapabilities = await request("/api/v1/nomenclature/capabilities", { employeeCookie: validLogin.employeeCookie });
  assert.equal(allowedCapabilities.payload.capabilities.canEditNomenclature, true);
  assert.equal(allowedCapabilities.payload.capabilities.serverCommandsEnabled, true);
  assert.equal(allowedCapabilities.payload.rbacRevision, 71);

  // Infrastructure failures are unavailable, not ordinary logged-out/denied
  // states, and a temporary outage must never erase a still-valid cookie.
  employeeAuthStorageUnavailable = true;
  for (const path of ["/api/v1/auth/employee-session", "/api/v1/nomenclature/capabilities"]) {
    const unavailableAuthStorage = await request(path, { employeeCookie: validLogin.employeeCookie });
    assert.equal(unavailableAuthStorage.response.status, 503);
    assert.equal(unavailableAuthStorage.payload.error, "employee-auth-storage-unavailable");
    assert.equal(unavailableAuthStorage.response.headers.get("set-cookie"), null);
  }
  employeeAuthStorageUnavailable = false;

  const savedEmployeeSecret = env.MES_EMPLOYEE_AUTH_SESSION_SECRET;
  env.MES_EMPLOYEE_AUTH_SESSION_SECRET = "";
  const unconfiguredEmployeeAuth = await request("/api/v1/auth/employee-session", { employeeCookie: validLogin.employeeCookie });
  assert.equal(unconfiguredEmployeeAuth.response.status, 503);
  assert.equal(unconfiguredEmployeeAuth.payload.error, "employee-auth-not-configured");
  assert.equal(unconfiguredEmployeeAuth.response.headers.get("set-cookie"), null);
  env.MES_EMPLOYEE_AUTH_SESSION_SECRET = savedEmployeeSecret;

  const savedDomainDatabaseUrl = env.MES_DOMAIN_DATABASE_URL;
  env.MES_DOMAIN_DATABASE_URL = "";
  const unconfiguredEmployeeStorage = await request("/api/v1/auth/employee-session", { employeeCookie: validLogin.employeeCookie });
  assert.equal(unconfiguredEmployeeStorage.response.status, 503);
  assert.equal(unconfiguredEmployeeStorage.payload.error, "employee-auth-storage-not-configured");
  assert.equal(unconfiguredEmployeeStorage.response.headers.get("set-cookie"), null);
  env.MES_DOMAIN_DATABASE_URL = savedDomainDatabaseUrl;

  for (const [mode, reason] of [["empty", "system-domains-unavailable"], ["throw", "system-domains-storage-unavailable"]]) {
    domainsRepositoryMode = mode;
    const unavailableDomains = await request("/api/v1/nomenclature/capabilities", { employeeCookie: validLogin.employeeCookie });
    assert.equal(unavailableDomains.response.status, 503);
    assert.equal(unavailableDomains.payload.error, reason);
    assert.equal(unavailableDomains.response.headers.get("set-cookie"), null);
  }
  domainsRepositoryMode = "ready";

  // Root rollout may inspect configuration/schema over loopback, but that
  // read-only probe never acquires an employee write capability.
  const operatorReadinessResult = await requestInternalOperatorReadiness();
  const operatorReadiness = operatorReadinessResult.payload;
  assert.equal(operatorReadinessResult.status, 200);
  assert.equal(operatorReadiness.operatorReadiness, true);
  assert.equal(operatorReadiness.employeeAuthConfigured, true);
  assert.equal(operatorReadiness.employeeAuthSchemaReady, true);
  assert.equal(operatorReadiness.capabilities.serverCommandsConfigured, true);
  assert.equal(operatorReadiness.capabilities.serverCommandsEnabled, false);
  for (const remoteAddress of ["10.0.0.2", undefined]) {
    const rejectedReadiness = await invokeRejectedInternalReadiness(remoteAddress);
    assert.equal(rejectedReadiness.handled, true);
    assert.equal(rejectedReadiness.status, 404);
    assert.equal(rejectedReadiness.payload.error, "not-found");
  }

  // A modified signature cannot become an employee principal.
  const tampered = await request("/api/v1/auth/employee-session", {
    employeeCookie: tamperCookie(validLogin.employeeCookie),
  });
  assert.equal(tampered.payload.authenticated, false);
  assert.equal(tampered.payload.reason, "employee-session-tampered");

  // The employee token is bound to the exact valid public perimeter principal.
  env.MES_PUBLIC_AUTH_USERNAME = "second-user";
  const secondOuterCookie = publicSessionCookie(env);
  const mismatchedPublicPrincipal = await request("/api/v1/auth/employee-session", {
    employeeCookie: validLogin.employeeCookie,
    outerSessionCookie: secondOuterCookie,
  });
  assert.equal(mismatchedPublicPrincipal.payload.authenticated, false);
  assert.equal(mismatchedPublicPrincipal.payload.reason, "public-principal-mismatch");
  assert.match(mismatchedPublicPrincipal.response.headers.get("set-cookie") || "", /Max-Age=0/);
  env.MES_PUBLIC_AUTH_USERNAME = "user";

  // Expiry is evaluated on every request, independently of browser state.
  env.MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS = "1";
  const expiringLogin = await login();
  assert.equal(expiringLogin.response.status, 200);
  clockMs += 2_000;
  const expired = await request("/api/v1/auth/employee-session", { employeeCookie: expiringLogin.employeeCookie });
  assert.equal(expired.payload.authenticated, false);
  assert.equal(expired.payload.reason, "employee-session-expired");
  env.MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS = "60";

  // auth_version invalidates an already signed token immediately.
  clockMs = Date.now();
  const revocableLogin = await login();
  credentials.get("employee-1").authVersion += 1;
  const revoked = await request("/api/v1/auth/employee-session", { employeeCookie: revocableLogin.employeeCookie });
  assert.equal(revoked.payload.authenticated, false);
  assert.equal(revoked.payload.reason, "revoked-session");

  // Employee activity is also re-read instead of being trusted from the token.
  const activeLogin = await login();
  credentials.get("employee-1").active = false;
  const inactive = await request("/api/v1/auth/employee-session", { employeeCookie: activeLogin.employeeCookie });
  assert.equal(inactive.payload.authenticated, false);
  assert.equal(inactive.payload.reason, "inactive-employee");
  credentials.get("employee-1").active = true;

  // Failed PIN attempts cause a server-side lock; expiry starts a clean window.
  clockMs = Date.now();
  assert.equal((await login("employee-lockout", "wrong")).response.status, 401);
  assert.equal((await login("employee-lockout", "wrong")).response.status, 401);
  const lockTriggered = await login("employee-lockout", "wrong");
  assert.equal(lockTriggered.response.status, 429);
  assert.equal(lockTriggered.payload.error, "authentication-temporarily-locked");
  assert.equal((await login("employee-lockout", "24680")).response.status, 429);
  clockMs += 31_000;
  assert.equal((await login("employee-lockout", "24680")).response.status, 200);

  // A public perimeter session alone never grants employee write capability.
  const publicOnly = await request("/api/v1/nomenclature/capabilities");
  assert.equal(publicOnly.response.status, 200);
  assert.equal(publicOnly.payload.authenticated, false);
  assert.equal(publicOnly.payload.capabilities.canEditNomenclature, false);
  assert.equal(publicOnly.payload.authorizationReason, "employee-session-missing");

  // Browser-supplied identity/role fields are ignored without a signed cookie.
  const forged = await request("/api/v1/nomenclature/capabilities?employeeId=employee-1&role=admin", {
    headers: {
      "X-Employee-Id": "employee-1",
      "X-MES-Role": "admin",
      "X-Can-Edit-Nomenclature": "true",
    },
  });
  assert.equal(forged.payload.authenticated, false);
  assert.equal(forged.payload.capabilities.serverCommandsEnabled, false);

  // Removing the current role assignment takes effect without reissuing token.
  clockMs = Date.now();
  const rbacLogin = await login();
  roleAssignments = [];
  const deniedCapabilities = await request("/api/v1/nomenclature/capabilities", { employeeCookie: rbacLogin.employeeCookie });
  assert.equal(deniedCapabilities.payload.authenticated, true);
  assert.equal(deniedCapabilities.payload.capabilities.canEditNomenclature, false);
  assert.equal(deniedCapabilities.payload.authorizationReason, "no-effective-role");

  // Cross-site mutation attempts are rejected before PIN validation.
  const crossSite = await request("/api/v1/auth/employee-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://attacker.invalid",
      "Sec-Fetch-Site": "cross-site",
    },
    body: { employeeId: "employee-1", pin: "55555" },
  });
  assert.equal(crossSite.response.status, 403);
  const missingBrowserOrigin = await request("/api/v1/auth/employee-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { employeeId: "employee-1", pin: "55555" },
  });
  assert.equal(missingBrowserOrigin.response.status, 403);
  const jsonpLogin = await request("/api/v1/auth/employee-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/jsonp",
      "Origin": baseUrl,
      "Sec-Fetch-Site": "same-origin",
    },
    body: { employeeId: "employee-1", pin: "55555" },
  });
  assert.equal(jsonpLogin.response.status, 415, "employee login must require the exact application/json media type, not a prefix");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("Employee auth core QA passed: signed sessions, revocation, inactivity, lockout, current RBAC, and forged identity rejection.");
