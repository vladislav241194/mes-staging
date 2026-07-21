import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";

import {
  SPECIFICATIONS2_ATTACHMENT_BODY_MAX_BYTES,
  SPECIFICATIONS2_WORK_ORDER_BODY_MAX_BYTES,
  handleDomainApiRequest,
} from "./domain-api.mjs";
import { createEmployeeSessionCookie } from "./employee-auth-guard.mjs";
import {
  SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT,
  resolveSpecifications2CommandAuthorization,
} from "./specifications2-command-authorization.mjs";

const now = new Date("2026-07-21T08:00:00.000Z");
const env = {
  APP_ENV: "pilot",
  MES_DOMAIN_STORAGE: "postgres",
  DATABASE_URL: "postgres://specifications2-auth-qa/not-used",
  MES_PUBLIC_AUTH_HOSTS: "mes.local",
  MES_PUBLIC_AUTH_USERNAME: "user",
  MES_PUBLIC_AUTH_SESSION_SECRET: "specifications2-public-session-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "mes.local",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "specifications2-employee-session-secret",
  MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: "3600",
  MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1",
  MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1",
  MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS: "1",
};

assert.deepEqual(SPECIFICATIONS2_COMMAND_AUTHORIZATION_CONTRACT, {
  moduleId: "specifications2",
  resourceId: "specifications2",
  action: "edit",
}, "Specifications 2.0 server writes must use the exact existing System Domains edit grant");

function publicSessionCookie() {
  // Public auth intentionally validates against the real process clock. Sign
  // this outer session at test execution time; the employee-session verifier
  // remains pinned to `now` through its explicit clock injection below.
  const issuedAt = Math.floor(Date.now() / 1000) - 1;
  const body = Buffer.from(JSON.stringify({
    user: env.MES_PUBLIC_AUTH_USERNAME,
    scope: "public",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.MES_PUBLIC_AUTH_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `mes_user_session=${encodeURIComponent(`${body}.${signature}`)}`;
}

const publicCookie = publicSessionCookie();
const employeeCookie = createEmployeeSessionCookie({
  employeeId: "employee-technologist",
  authVersion: 7,
  publicPrincipalId: "public:user",
}, env, now).split(";", 1)[0];

function tamperCookie(cookie) {
  const separator = cookie.indexOf("=");
  const name = cookie.slice(0, separator);
  const token = decodeURIComponent(cookie.slice(separator + 1));
  const replacement = token.at(-1) === "A" ? "B" : "A";
  return `${name}=${encodeURIComponent(`${token.slice(0, -1)}${replacement}`)}`;
}

function requestHeaders({ publicSession = true, employeeSession = "valid", forged = false } = {}) {
  const cookies = [];
  if (publicSession) cookies.push(publicCookie);
  if (employeeSession === "valid") cookies.push(employeeCookie);
  if (employeeSession === "tampered") cookies.push(tamperCookie(employeeCookie));
  return {
    host: "mes.local",
    origin: "http://mes.local",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    ...(cookies.length ? { cookie: cookies.join("; ") } : {}),
    ...(forged ? {
      "x-employee-id": "employee-technologist",
      "x-mes-role": "admin",
      "x-can-edit-specifications2": "true",
    } : {}),
  };
}

let employeeRepositoryMode = "valid";
function employeeAuthRepositoryFactory() {
  return {
    async inspectSession({ employeeId, authVersion }) {
      if (employeeRepositoryMode === "throw") throw new Error("employee auth storage unavailable");
      if (employeeRepositoryMode === "revoked") return { valid: false, reason: "revoked-session" };
      if (employeeId !== "employee-technologist" || authVersion !== 7) return { valid: false, reason: "invalid-session" };
      return {
        valid: true,
        employeeId,
        authVersion,
        displayName: "Технолог QA",
        personnelNumber: "T-001",
      };
    },
    async close() {},
  };
}

let assignedRoleId = "technologist";
let domainsRepositoryMode = "ready";
function pilotCompatibleDomains() {
  const roles = [
    { id: "technologist", label: "Технолог", scope: "factory", isActive: true },
    { id: "productionHead", label: "Начальник производства", scope: "factory", isActive: true },
    { id: "planner", label: "Планировщик", scope: "factory", isActive: true },
  ];
  const grants = [];
  const addGrant = (roleId, resourceId, actionId, effect) => grants.push({
    id: `${roleId}:${resourceId}:${actionId}`,
    roleId,
    resourceId,
    actionId,
    effect,
  });
  for (const action of ["view", "edit", "print"]) addGrant("technologist", "specifications2", action, "allow");
  addGrant("technologist", "specifications2", "approve", "deny");
  addGrant("technologist", "planning", "edit", "deny");
  addGrant("productionHead", "specifications2", "view", "allow");
  addGrant("productionHead", "specifications2", "edit", "deny");
  addGrant("productionHead", "planning", "edit", "allow");
  addGrant("planner", "specifications2", "view", "deny");
  addGrant("planner", "specifications2", "edit", "deny");
  addGrant("planner", "planning", "edit", "allow");
  return {
    schemaId: "mes.system-domains",
    schemaVersion: 1,
    registries: {
      employees: [{ id: "employee-technologist", displayName: "Технолог QA", isActive: true }],
      employmentAssignments: [],
      accessRoles: roles,
      grants,
      roleAssignments: [{ id: "role-assignment-qa", employeeId: "employee-technologist", roleId: assignedRoleId }],
    },
  };
}

function domainsRepositoryFactory() {
  return {
    async get() {
      if (domainsRepositoryMode === "throw") throw new Error("system domains storage unavailable");
      if (domainsRepositoryMode === "empty") return { item: null, revision: 44701 };
      return { item: pilotCompatibleDomains(), revision: 44701 };
    },
    async close() {},
  };
}

const authorizationResolver = (req, { env: requestEnv }) => resolveSpecifications2CommandAuthorization(req, {
  env: requestEnv,
  employeeAuthRepositoryFactory,
  domainsRepositoryFactory,
  now: () => now,
});

async function resolveCore(headers) {
  return authorizationResolver({ headers }, { env });
}

const anonymousCore = await resolveCore(requestHeaders({ publicSession: false, employeeSession: "missing" }));
assert.equal(anonymousCore.allowed, false);
assert.equal(anonymousCore.reason, "public-session-required");
const publicOnlyCore = await resolveCore(requestHeaders({ employeeSession: "missing", forged: true }));
assert.equal(publicOnlyCore.allowed, false);
assert.equal(publicOnlyCore.reason, "employee-session-missing");
const tamperedCore = await resolveCore(requestHeaders({ employeeSession: "tampered" }));
assert.equal(tamperedCore.allowed, false);
assert.equal(tamperedCore.reason, "employee-session-tampered");

employeeRepositoryMode = "revoked";
const revokedCore = await resolveCore(requestHeaders());
assert.equal(revokedCore.allowed, false);
assert.equal(revokedCore.reason, "revoked-session");
employeeRepositoryMode = "valid";

assignedRoleId = "productionHead";
const productionHeadCore = await resolveCore(requestHeaders());
assert.equal(productionHeadCore.allowed, false);
assert.equal(productionHeadCore.principal?.id, "employee:employee-technologist");
assert.equal(productionHeadCore.decision?.action, "edit");
assignedRoleId = "planner";
assert.equal((await resolveCore(requestHeaders())).allowed, false,
  "a Planning editor without Specifications 2.0 edit must remain denied");
assignedRoleId = "technologist";
const allowedCore = await resolveCore(requestHeaders());
assert.equal(allowedCore.allowed, true);
assert.equal(allowedCore.principal?.id, "employee:employee-technologist");
assert.equal(allowedCore.decision?.moduleId, "specifications2");
assert.equal(allowedCore.decision?.action, "edit");

employeeRepositoryMode = "throw";
const employeeStorageDownCore = await resolveCore(requestHeaders());
assert.equal(employeeStorageDownCore.allowed, false);
assert.equal(employeeStorageDownCore.infrastructureUnavailable, true);
assert.equal(employeeStorageDownCore.reason, "employee-auth-storage-unavailable");
employeeRepositoryMode = "valid";
domainsRepositoryMode = "throw";
const domainsStorageDownCore = await resolveCore(requestHeaders());
assert.equal(domainsStorageDownCore.allowed, false);
assert.equal(domainsStorageDownCore.infrastructureUnavailable, true);
assert.equal(domainsStorageDownCore.reason, "system-domains-storage-unavailable");
domainsRepositoryMode = "ready";

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, responseHeaders) {
      this.statusCode = statusCode;
      this.headers = responseHeaders || {};
    },
    end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); },
  };
}

const markerFingerprint = "sha256:specifications2-authorization-qa";
const markerState = {
  primaryRevision: 8,
  verifiedPrimaryRevision: 8,
  verifiedSnapshotFingerprint: markerFingerprint,
  verifiedContractVersion: 7,
};
const primaryWorkOrders = {
  async health() { return { configured: true, storageMode: "postgres", storageBackend: "postgresql", revision: 8 }; },
  async getPlanningProjectionParityState() { return { ...markerState }; },
  async markPlanningProjectionParity() { return true; },
  async listPendingSnapshotSyncs() { return []; },
  async markSnapshotSync() {},
  async get() { return { item: null }; },
};
const snapshotWorkOrders = {
  async health() {
    return {
      configured: true,
      storageMode: "snapshot-adapter",
      storageBackend: "shared-state",
      revision: 8,
      planningProjectionFingerprint: markerFingerprint,
    };
  },
};
const workOrdersRepositoryFactory = async ({ env: repositoryEnv }) => (
  String(repositoryEnv?.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot"
    ? snapshotWorkOrders
    : primaryWorkOrders
);

const publicationCalls = [];
const workOrderCalls = [];
const attachmentPutCalls = [];
const attachmentGetCalls = [];
const specifications2PublishCommandRepositoryFactory = () => ({
  async commandReadiness() { return { schemaReady: true }; },
  async publish(command) {
    publicationCalls.push(command);
    return { created: true, item: { id: "spec2-revision-qa", revisionNo: 1 } };
  },
  async close() {},
});
const specifications2WorkOrderCommandRepositoryFactory = () => ({
  async commandReadiness() { return { schemaReady: true }; },
  async create(command) {
    workOrderCalls.push(command);
    return { created: true, item: { id: "work-order-qa", quantity: command.quantity } };
  },
  async close() {},
});
const specifications2AttachmentRepositoryFactory = () => ({
  async commandReadiness() { return { schemaReady: true }; },
  async put(command, context) {
    attachmentPutCalls.push({ command, context });
    return {
      created: true,
      item: { id: "spec2file-auth-qa", fileName: command.fileName, mediaType: command.mediaType, byteSize: 3 },
    };
  },
  async get(id) {
    attachmentGetCalls.push(id);
    return {
      item: {
        id,
        fileName: "board.txt",
        mediaType: "text/plain",
        byteSize: 3,
        content: Buffer.from("foo"),
      },
    };
  },
  async close() {},
});

function responseHeaders(contentType) {
  return { "Content-Type": contentType, "Cache-Control": "no-store" };
}

async function request(pathname, {
  method = "GET",
  body = null,
  headers = requestHeaders(),
} = {}) {
  const res = makeResponse();
  const handled = await handleDomainApiRequest(
    { method, body, headers },
    res,
    new URL(`http://mes.local${pathname}`),
    {
      headers: responseHeaders,
      filePath: "/tmp/specifications2-command-authorization-qa.json",
      env,
      workOrdersRepositoryFactory,
      specifications2AuthorizationResolver: authorizationResolver,
      specifications2PublishCommandRepositoryFactory,
      specifications2WorkOrderCommandRepositoryFactory,
      specifications2AttachmentRepositoryFactory,
    },
  );
  let json = {};
  try { json = JSON.parse(res.body || "{}"); } catch {}
  return { handled, statusCode: res.statusCode, json, body: res.body };
}

async function streamRequest(pathname, chunks, headers = requestHeaders()) {
  const req = Readable.from(chunks);
  req.method = "POST";
  req.headers = headers;
  const res = makeResponse();
  await handleDomainApiRequest(req, res, new URL(`http://mes.local${pathname}`), {
    headers: responseHeaders,
    filePath: "/tmp/specifications2-command-authorization-qa.json",
    env,
    workOrdersRepositoryFactory,
    specifications2AuthorizationResolver: authorizationResolver,
    specifications2PublishCommandRepositoryFactory,
    specifications2WorkOrderCommandRepositoryFactory,
    specifications2AttachmentRepositoryFactory,
  });
  return { statusCode: res.statusCode, json: JSON.parse(res.body || "{}") };
}

const publishBody = {
  entry: { id: "specification-qa" },
  expectedPreviousRevision: 0,
  idempotencyKey: "publish-auth-qa",
};
const workOrderBody = {
  routeSourceDraftId: "route-qa",
  quantity: 10,
  idempotencyKey: "work-order-auth-qa",
};
const publishPath = "/api/v1/specifications2/revisions";
const workOrderPath = "/api/v1/specifications2/revisions/revision-qa/work-orders";
const attachmentPath = "/api/v1/specifications2/attachments";
const attachmentDownloadPath = `${attachmentPath}/spec2file-auth-qa`;
const attachmentBody = { fileName: "board.txt", mediaType: "text/plain", contentBase64: "Zm9v" };

for (const scenario of [
  { name: "anonymous", headers: requestHeaders({ publicSession: false, employeeSession: "missing" }), reason: "public-session-required" },
  { name: "public-only", headers: requestHeaders({ employeeSession: "missing", forged: true }), reason: "employee-session-missing" },
  { name: "tampered", headers: requestHeaders({ employeeSession: "tampered" }), reason: "employee-session-tampered" },
]) {
  const capabilities = await request("/api/v1/specifications2/capabilities", { headers: scenario.headers });
  assert.equal(capabilities.statusCode, 200, `${scenario.name} capability probe must remain a non-mutating denial`);
  assert.equal(capabilities.json.authenticated, false);
  assert.equal(capabilities.json.authorizationReason, scenario.reason);
  assert.equal(capabilities.json.capabilities.canEditSpecifications2, false);
  assert.equal(capabilities.json.capabilities.revisionPublicationEnabled, false);
  assert.equal(capabilities.json.capabilities.workOrderCreationEnabled, false);
  assert.equal(capabilities.json.capabilities.attachmentUploadEnabled, false);
  assert.equal((await request(publishPath, { method: "POST", body: publishBody, headers: scenario.headers })).statusCode, 401);
  assert.equal((await request(workOrderPath, { method: "POST", body: workOrderBody, headers: scenario.headers })).statusCode, 401);
  assert.equal((await request(attachmentPath, { method: "POST", body: attachmentBody, headers: scenario.headers })).statusCode, 401);
  assert.equal((await request(attachmentDownloadPath, { headers: scenario.headers })).statusCode, 401);
}

employeeRepositoryMode = "revoked";
const revokedCapabilities = await request("/api/v1/specifications2/capabilities");
assert.equal(revokedCapabilities.statusCode, 200);
assert.equal(revokedCapabilities.json.authorizationReason, "revoked-session");
assert.equal((await request(publishPath, { method: "POST", body: publishBody })).statusCode, 401);
assert.equal((await request(workOrderPath, { method: "POST", body: workOrderBody })).statusCode, 401);
assert.equal((await request(attachmentPath, { method: "POST", body: attachmentBody })).statusCode, 401);
assert.equal((await request(attachmentDownloadPath)).statusCode, 401);
employeeRepositoryMode = "valid";

assignedRoleId = "productionHead";
const deniedCapabilities = await request("/api/v1/specifications2/capabilities");
assert.equal(deniedCapabilities.statusCode, 200);
assert.equal(deniedCapabilities.json.authenticated, true);
assert.equal(deniedCapabilities.json.actor?.id, "employee:employee-technologist");
assert.equal(deniedCapabilities.json.capabilities.canEditSpecifications2, false);
assert.equal((await request(publishPath, { method: "POST", body: publishBody })).statusCode, 403);
assert.equal((await request(workOrderPath, { method: "POST", body: workOrderBody })).statusCode, 403);
assert.equal((await request(attachmentPath, { method: "POST", body: attachmentBody })).statusCode, 403);
assert.equal((await request(attachmentDownloadPath)).statusCode, 403);
assignedRoleId = "technologist";

employeeRepositoryMode = "throw";
assert.equal((await request("/api/v1/specifications2/capabilities")).statusCode, 503);
assert.equal((await request(publishPath, { method: "POST", body: publishBody })).statusCode, 503);
assert.equal((await request(workOrderPath, { method: "POST", body: workOrderBody })).statusCode, 503);
assert.equal((await request(attachmentPath, { method: "POST", body: attachmentBody })).statusCode, 503);
employeeRepositoryMode = "valid";
domainsRepositoryMode = "throw";
assert.equal((await request("/api/v1/specifications2/capabilities")).statusCode, 503);
assert.equal((await request(publishPath, { method: "POST", body: publishBody })).statusCode, 503);
assert.equal((await request(workOrderPath, { method: "POST", body: workOrderBody })).statusCode, 503);
assert.equal((await request(attachmentPath, { method: "POST", body: attachmentBody })).statusCode, 503);
domainsRepositoryMode = "ready";

const allowedCapabilities = await request("/api/v1/specifications2/capabilities");
assert.equal(allowedCapabilities.statusCode, 200);
assert.equal(allowedCapabilities.json.authenticated, true);
assert.equal(allowedCapabilities.json.actor?.id, "employee:employee-technologist");
assert.equal(allowedCapabilities.json.rbacRevision, 44701);
assert.equal(allowedCapabilities.json.capabilities.canEditSpecifications2, true);
assert.equal(allowedCapabilities.json.capabilities.revisionPublicationEnabled, true);
assert.equal(allowedCapabilities.json.capabilities.workOrderCreationEnabled, true);
assert.equal(allowedCapabilities.json.capabilities.attachmentUploadEnabled, true);

for (const path of [publishPath, workOrderPath, attachmentPath]) {
  const textPlain = await request(path, {
    method: "POST",
    body: path === publishPath ? publishBody : path === workOrderPath ? workOrderBody : attachmentBody,
    headers: { ...requestHeaders(), "content-type": "text/plain" },
  });
  assert.equal(textPlain.statusCode, 415, `${path} must reject safelisted text/plain mutation bodies`);
  assert.equal(textPlain.json.code, "json-content-type-required");

  const siblingOrigin = await request(path, {
    method: "POST",
    body: path === publishPath ? publishBody : path === workOrderPath ? workOrderBody : attachmentBody,
    headers: { ...requestHeaders(), origin: "http://admin.mes.local", "sec-fetch-site": "same-site" },
  });
  assert.equal(siblingOrigin.statusCode, 403, `${path} must reject a credentialed sibling-origin request`);
  assert.equal(siblingOrigin.json.code, "same-origin-required");

  const missingOrigin = { ...requestHeaders() };
  delete missingOrigin.origin;
  const noOrigin = await request(path, {
    method: "POST",
    body: path === publishPath ? publishBody : path === workOrderPath ? workOrderBody : attachmentBody,
    headers: missingOrigin,
  });
  assert.equal(noOrigin.statusCode, 403, `${path} must fail closed without an Origin proof`);
}
assert.equal(publicationCalls.length, 0, "rejected cross-origin/content-type probes must not publish");
assert.equal(workOrderCalls.length, 0, "rejected cross-origin/content-type probes must not create Work Orders");
assert.equal(attachmentPutCalls.length, 0, "rejected cross-origin/content-type probes must not upload attachments");

assert.equal((await request(publishPath, {
  method: "POST",
  body: " ".repeat((2 * 1024 * 1024) + 1),
})).statusCode, 413, "publication body must be bounded before JSON parsing");
assert.equal((await request(workOrderPath, {
  method: "POST",
  body: " ".repeat(SPECIFICATIONS2_WORK_ORDER_BODY_MAX_BYTES + 1),
})).statusCode, 413, "Work Order body must be bounded before JSON parsing");
assert.equal((await request(attachmentPath, {
  method: "POST",
  body: " ".repeat(SPECIFICATIONS2_ATTACHMENT_BODY_MAX_BYTES + 1),
})).statusCode, 413, "attachment body must be bounded before base64 decoding");
assert.equal((await streamRequest(attachmentPath, [], {
  ...requestHeaders(),
  "content-length": String(SPECIFICATIONS2_ATTACHMENT_BODY_MAX_BYTES + 1),
})).statusCode, 413, "attachment Content-Length must be rejected before reading its body");
assert.equal((await streamRequest(attachmentPath, [
  Buffer.alloc(SPECIFICATIONS2_ATTACHMENT_BODY_MAX_BYTES, 0x20),
  Buffer.from(" "),
])).statusCode, 413, "chunked attachment input must stop at the same exact envelope bound");

const published = await request(publishPath, { method: "POST", body: publishBody });
assert.equal(published.statusCode, 201);
assert.equal(publicationCalls.at(-1)?.actorId, "employee:employee-technologist",
  "publication audit actor must be the signed employee principal");
const createdWorkOrder = await request(workOrderPath, { method: "POST", body: workOrderBody });
assert.equal(createdWorkOrder.statusCode, 201);
assert.equal(workOrderCalls.at(-1)?.actorId, "employee:employee-technologist",
  "Work Order audit actor must be the signed employee principal");
const uploadedAttachment = await request(attachmentPath, { method: "POST", body: attachmentBody });
assert.equal(uploadedAttachment.statusCode, 201);
assert.equal(attachmentPutCalls.at(-1)?.context?.actorId, "employee:employee-technologist",
  "attachment audit actor must be the signed employee principal");
const downloadedAttachment = await request(attachmentDownloadPath);
assert.equal(downloadedAttachment.statusCode, 200);
assert.equal(downloadedAttachment.body, "foo");
assert.equal(attachmentGetCalls.at(-1), "spec2file-auth-qa");

console.log("Specifications 2.0 command authorization QA: signed employee/RBAC attachments, same-origin JSON boundary, bounded bodies, revocation and audit actors passed.");
