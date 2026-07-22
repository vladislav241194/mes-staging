import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  PLANNING_COMMAND_BODY_MAX_BYTES,
  handleDomainApiRequest,
} from "./domain-api.mjs";
import { createEmployeeSessionCookie } from "./employee-auth-guard.mjs";
import {
  PLANNING_COMMAND_AUTHORIZATION_CONTRACT,
  resolvePlanningCommandAuthorization,
} from "./planning-command-authorization.mjs";

const now = new Date("2026-07-21T08:00:00.000Z");
const env = {
  APP_ENV: "pilot",
  MES_DOMAIN_STORAGE: "postgres",
  MES_ENABLE_PLANNING_SERVER_COMMANDS: "1",
  MES_ENABLE_PLANNING_START_DATE_COMMANDS: "1",
  DATABASE_URL: "postgres://planning-auth-qa/not-used",
  MES_PUBLIC_AUTH_HOSTS: "mes.local",
  MES_PUBLIC_AUTH_USERNAME: "user",
  MES_PUBLIC_AUTH_SESSION_SECRET: "planning-public-session-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "mes.local",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "planning-employee-session-secret",
  MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: "3600",
};

assert.deepEqual(PLANNING_COMMAND_AUTHORIZATION_CONTRACT, {
  moduleId: "planning",
  resourceId: "planning",
  action: "edit",
}, "Planning writes must use the exact existing System Domains planning:edit contract");
assert.equal(PLANNING_COMMAND_BODY_MAX_BYTES, 64 * 1024, "Planning JSON write envelopes must remain bounded to 64 KiB");

function publicSessionCookie() {
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
  employeeId: "employee-planner",
  authVersion: 7,
  publicPrincipalId: "public:user",
}, env, now).split(";", 1)[0];
const expiredEmployeeCookie = createEmployeeSessionCookie({
  employeeId: "employee-planner",
  authVersion: 7,
  publicPrincipalId: "public:user",
}, env, new Date(now.getTime() - (2 * 60 * 60 * 1000))).split(";", 1)[0];

function requestHeaders({
  publicSession = true,
  employeeSession = "valid",
  origin = "http://mes.local",
  fetchSite = "same-origin",
  contentType = "application/json",
  forged = false,
} = {}) {
  const cookies = [];
  if (publicSession) cookies.push(publicCookie);
  if (employeeSession === "valid") cookies.push(employeeCookie);
  if (employeeSession === "expired") cookies.push(expiredEmployeeCookie);
  return {
    host: "mes.local",
    origin,
    "sec-fetch-site": fetchSite,
    "content-type": contentType,
    ...(cookies.length ? { cookie: cookies.join("; ") } : {}),
    ...(forged ? {
      "x-employee-id": "employee-planner",
      "x-mes-role": "admin",
      "x-can-edit-planning": "true",
    } : {}),
  };
}

let employeeRepositoryMode = "valid";
function employeeAuthRepositoryFactory() {
  return {
    async inspectSession({ employeeId, authVersion }) {
      if (employeeRepositoryMode === "throw") throw new Error("employee auth storage unavailable");
      if (employeeRepositoryMode === "revoked") return { valid: false, reason: "revoked-session" };
      if (employeeId !== "employee-planner" || authVersion !== 7) return { valid: false, reason: "invalid-session" };
      return {
        valid: true,
        employeeId,
        authVersion,
        displayName: "Планировщик QA",
        personnelNumber: "P-001",
      };
    },
    async close() {},
  };
}

let assignedRoleId = "planner";
let domainsRepositoryMode = "ready";
function pilotCompatibleDomains() {
  const roles = [
    { id: "planner", label: "Планировщик", scope: "factory", isActive: true },
    { id: "viewer", label: "Наблюдатель", scope: "factory", isActive: true },
    { id: "workCenterPlanner", label: "Локальный планировщик", scope: "workCenter", isActive: true },
  ];
  const grants = [];
  const addGrant = (roleId, resourceId, actionId, effect) => grants.push({
    id: `${roleId}:${resourceId}:${actionId}`,
    roleId,
    resourceId,
    actionId,
    effect,
  });
  addGrant("planner", "planning", "view", "allow");
  addGrant("planner", "planning", "edit", "allow");
  addGrant("viewer", "planning", "view", "allow");
  addGrant("viewer", "planning", "edit", "deny");
  addGrant("workCenterPlanner", "planning", "view", "allow");
  addGrant("workCenterPlanner", "planning", "edit", "allow");
  return {
    schemaId: "mes.system-domains",
    schemaVersion: 1,
    registries: {
      employees: [{ id: "employee-planner", displayName: "Планировщик QA", isActive: true }],
      employmentAssignments: [{
        id: "employment-planner",
        employeeId: "employee-planner",
        workCenterId: "WC-A",
        isPrimary: true,
      }],
      accessRoles: roles,
      grants,
      roleAssignments: [{
        id: "role-assignment-planner",
        employeeId: "employee-planner",
        roleId: assignedRoleId,
      }],
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

let authorizationResolverCalls = 0;
const authorizationResolver = (req, { env: requestEnv }) => {
  authorizationResolverCalls += 1;
  return resolvePlanningCommandAuthorization(req, {
    env: requestEnv,
    employeeAuthRepositoryFactory,
    domainsRepositoryFactory,
    now: () => now,
  });
};

async function resolveCore(headers) {
  return resolvePlanningCommandAuthorization({ headers }, {
    env,
    employeeAuthRepositoryFactory,
    domainsRepositoryFactory,
    now: () => now,
  });
}

assert.equal((await resolveCore(requestHeaders({ publicSession: false, employeeSession: "missing" }))).reason, "public-session-required");
assert.equal((await resolveCore(requestHeaders({ employeeSession: "missing", forged: true }))).reason, "employee-session-missing",
  "forged actor/role headers must never replace the signed employee session");
assert.equal((await resolveCore(requestHeaders({ employeeSession: "expired" }))).reason, "employee-session-expired");

employeeRepositoryMode = "revoked";
assert.equal((await resolveCore(requestHeaders())).reason, "revoked-session");
employeeRepositoryMode = "valid";

assignedRoleId = "viewer";
const wrongRole = await resolveCore(requestHeaders());
assert.equal(wrongRole.allowed, false);
assert.equal(wrongRole.reason, "action-not-granted");
assignedRoleId = "workCenterPlanner";
const wrongScope = await resolveCore(requestHeaders());
assert.equal(wrongScope.allowed, false);
assert.equal(wrongScope.reason, "outside-responsibility-scope",
  "a work-center-scoped role must not gain aggregate Planning writes without an exact scoped command contract");
assignedRoleId = "planner";
const allowedCore = await resolveCore(requestHeaders());
assert.equal(allowedCore.allowed, true);
assert.equal(allowedCore.principal?.id, "employee:employee-planner");
assert.equal(allowedCore.decision?.moduleId, "planning");
assert.equal(allowedCore.decision?.action, "edit");
assert.equal(allowedCore.revision, 44701);

employeeRepositoryMode = "throw";
const employeeStorageDown = await resolveCore(requestHeaders());
assert.equal(employeeStorageDown.allowed, false);
assert.equal(employeeStorageDown.infrastructureUnavailable, true);
employeeRepositoryMode = "valid";
domainsRepositoryMode = "throw";
const domainsStorageDown = await resolveCore(requestHeaders());
assert.equal(domainsStorageDown.allowed, false);
assert.equal(domainsStorageDown.infrastructureUnavailable, true);
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

const markerFingerprint = "sha256:planning-command-authorization-qa";
const markerState = {
  primaryRevision: 8,
  verifiedPrimaryRevision: 8,
  verifiedSnapshotFingerprint: markerFingerprint,
  verifiedContractVersion: 7,
};
let currentRevision = 7;
let currentQuantity = 12;
let currentPlanningStartDate = "2026-07-21";
let currentPlannedStart = "2026-07-21T08:00:00.000Z";
const quantityCalls = [];
const startDateCalls = [];
const slotCalls = [];
const startDateReceipts = new Map();
let startDateReadinessMode = "ready";
let workOrdersFactoryCalls = 0;
let workOrdersHealthCalls = 0;

function currentItem() {
  const metadata = currentPlanningStartDate === null ? {} : { planningStartDate: currentPlanningStartDate };
  return {
    id: "WO-001",
    number: "WO-001",
    name: "Заказ QA",
    quantity: currentQuantity,
    planningStartDate: currentPlanningStartDate,
    concurrencyRevision: currentRevision,
    revision: 1,
    lifecycleStatus: "released",
    planningStatus: "scheduled",
    metadata,
    operations: [{
      id: "operation-row-1",
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "WC-A",
      nextWorkCenterId: "",
      quantityMultiplier: 1,
      executionContext: {},
      labor: {},
      metadata: {},
      slot: {
        id: "slot-1",
        plannedStart: currentPlannedStart,
        plannedEnd: "2026-07-21T09:00:00.000Z",
        status: "planned",
        quantity: currentQuantity,
        isLocked: false,
        metadata: {},
      },
    }],
  };
}

const primaryWorkOrders = {
  async health() {
    workOrdersHealthCalls += 1;
    return { configured: true, storageMode: "postgres", storageBackend: "postgresql", revision: 8 };
  },
  async getPlanningProjectionParityState() { return { ...markerState }; },
  async markPlanningProjectionParity() { return true; },
  async get(id) { return { item: id === "WO-001" ? currentItem() : null, storageBackend: "postgresql" }; },
  async changeQuantity(id, command) {
    quantityCalls.push({ id, command });
    currentQuantity = command.quantity;
    currentRevision += 1;
    return {
      storageBackend: "postgresql",
      revision: currentRevision,
      conflict: false,
      item: currentItem(),
    };
  },
  async startDateCommandReadiness() {
    if (startDateReadinessMode === "throw") throw new Error("start-date catalog unavailable");
    return startDateReadinessMode === "ready"
      ? { schemaReady: true, error: "" }
      : { schemaReady: false, error: "migration 032 mismatch" };
  },
  async changeStartDate(id, command) {
    startDateCalls.push({ id, command });
    const receiptKey = `${command.actorId}:${command.idempotencyKey}`;
    const prior = startDateReceipts.get(receiptKey);
    if (prior) {
      const same = prior.id === "WO-001"
        && prior.planningStartDate === command.planningStartDate
        && prior.expectedRevision === command.expectedRevision;
      return {
        storageBackend: "postgresql",
        revision: currentRevision,
        conflict: false,
        idempotentReplay: same,
        idempotencyConflict: !same,
        superseded: same && currentPlanningStartDate !== prior.planningStartDate,
        commandAggregateId: prior.id,
        commandAggregateRevision: prior.aggregateRevision,
        item: currentItem(),
      };
    }
    if (command.expectedRevision !== currentRevision) {
      return { storageBackend: "postgresql", revision: currentRevision, conflict: true, item: currentItem() };
    }
    currentPlanningStartDate = command.planningStartDate;
    currentRevision += 1;
    startDateReceipts.set(receiptKey, {
      id: "WO-001",
      planningStartDate: command.planningStartDate,
      expectedRevision: command.expectedRevision,
      aggregateRevision: currentRevision,
      snapshotSyncState: "pending",
    });
    return {
      storageBackend: "postgresql",
      revision: currentRevision,
      conflict: false,
      idempotentReplay: false,
      commandAggregateId: "WO-001",
      commandAggregateRevision: currentRevision,
      item: currentItem(),
    };
  },
  async getStartDateSnapshotReceipt({ actorId, idempotencyKey, aggregateId, aggregateRevision, expectedRevision, planningStartDate }) {
    const receipt = startDateReceipts.get(`${actorId}:${idempotencyKey}`);
    if (!receipt) return { found: false, exact: false, ready: false, state: "missing", unresolvedCount: 0 };
    const exact = receipt.id === aggregateId
      && receipt.aggregateRevision === aggregateRevision
      && receipt.expectedRevision === expectedRevision
      && receipt.planningStartDate === planningStartDate;
    const unresolvedCount = [...startDateReceipts.values()].filter((candidate) => candidate.id === receipt.id
      && ["pending", "conflict"].includes(candidate.snapshotSyncState)).length;
    return {
      found: true,
      exact,
      ready: exact && receipt.snapshotSyncState === "applied" && unresolvedCount === 0,
      state: receipt.snapshotSyncState,
      unresolvedCount,
    };
  },
  async getSlotScheduleSnapshotReceipt({ aggregateId, aggregateRevision, expectedRevision, operationId, slotId, plannedStart }) {
    const exact = aggregateId === "WO-001"
      && aggregateRevision === currentRevision
      && expectedRevision === currentRevision - 1
      && operationId === "OP-1"
      && slotId === "slot-1"
      && plannedStart === currentPlannedStart;
    return { found: true, exact, ready: exact, state: exact ? "applied" : "conflict", unresolvedCount: exact ? 0 : 1 };
  },
  async changeSlotSchedule(id, operationId, command) {
    slotCalls.push({ id, operationId, command });
    currentPlannedStart = command.plannedStart;
    currentRevision += 1;
    return {
      storageBackend: "postgresql",
      revision: currentRevision,
      conflict: false,
      item: currentItem(),
      slot: { ...currentItem().operations[0].slot, id: command.slotId },
    };
  },
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
const workOrdersRepositoryFactory = async ({ env: repositoryEnv }) => {
  workOrdersFactoryCalls += 1;
  return String(repositoryEnv?.MES_DOMAIN_STORAGE || "").toLowerCase() === "snapshot"
    ? snapshotWorkOrders
    : primaryWorkOrders;
};

function responseHeaders(contentType) {
  return { "Content-Type": contentType, "Cache-Control": "no-store" };
}

async function request(pathname, {
  method = "GET",
  body = null,
  headers = requestHeaders(),
  planningAuthorizationResolver = authorizationResolver,
} = {}) {
  const res = makeResponse();
  const handled = await handleDomainApiRequest(
    { method, body, headers },
    res,
    new URL(`http://mes.local${pathname}`),
    {
      headers: responseHeaders,
      filePath: "/tmp/planning-command-authorization-qa.json",
      env,
      workOrdersRepositoryFactory,
      planningAuthorizationResolver,
    },
  );
  let json = {};
  try { json = JSON.parse(res.body || "{}"); } catch {}
  return { handled, statusCode: res.statusCode, json, body: res.body };
}

const quantityPath = "/api/v1/planning/work-orders/WO-001";
const startDatePath = "/api/v1/planning/work-orders/WO-001/start-date";
const slotPath = "/api/v1/planning/work-orders/WO-001/operations/OP-1/slot";
const quantityBody = () => ({ quantity: 24, expectedRevision: currentRevision, actorId: "employee:forged" });
const startDateBody = () => ({ planningStartDate: "2026-07-23", expectedRevision: currentRevision, actorId: "employee:forged" });
const slotBody = () => ({ slotId: "slot-1", plannedStart: "2026-07-22T08:00:00.000Z", expectedRevision: currentRevision, actorId: "employee:forged" });
const startDateHeaders = (options = {}, key = "planning-start-date:authorization-qa") => ({
  ...requestHeaders(options),
  "idempotency-key": key,
});

function assertPlanningStorageUntouched(label) {
  assert.equal(workOrdersFactoryCalls, 0, `${label} must not construct the Planning repository`);
  assert.equal(workOrdersHealthCalls, 0, `${label} must not read Planning storage health`);
  assert.equal(quantityCalls.length, 0, `${label} must not invoke the quantity mutation`);
  assert.equal(startDateCalls.length, 0, `${label} must not invoke the start-date mutation`);
  assert.equal(slotCalls.length, 0, `${label} must not invoke the slot mutation`);
}

const ownerFlagMatrix = [
  { general: "0", startDate: "0", quantity: 503, slot: 503, startDateStatus: 503, label: "00" },
  { general: "0", startDate: "1", quantity: 503, slot: 503, startDateStatus: 401, label: "01" },
  // The general owner may expose quantity/slot only after authorization, but
  // the partial 10 state must still leave the start-date owner OFF.
  { general: "1", startDate: "0", quantity: 401, slot: 401, startDateStatus: 503, label: "10" },
  { general: "1", startDate: "1", quantity: 401, slot: 401, startDateStatus: 401, label: "11" },
];
for (const entry of ownerFlagMatrix) {
  env.MES_ENABLE_PLANNING_SERVER_COMMANDS = entry.general;
  env.MES_ENABLE_PLANNING_START_DATE_COMMANDS = entry.startDate;
  const anonymousHeaders = requestHeaders({ publicSession: false, employeeSession: "missing" });
  const quantity = await request(quantityPath, { method: "PATCH", body: quantityBody(), headers: anonymousHeaders });
  const slot = await request(slotPath, { method: "PATCH", body: slotBody(), headers: anonymousHeaders });
  const startDate = await request(startDatePath, {
    method: "PATCH",
    body: startDateBody(),
    headers: { ...anonymousHeaders, "idempotency-key": `planning-start-date:flags-${entry.label}` },
  });
  assert.equal(quantity.statusCode, entry.quantity, `owner flag matrix ${entry.label}: quantity`);
  assert.equal(slot.statusCode, entry.slot, `owner flag matrix ${entry.label}: slot`);
  assert.equal(startDate.statusCode, entry.startDateStatus, `owner flag matrix ${entry.label}: start date`);
  if (entry.general === "0") {
    assert.equal(quantity.json.code, "planning-command-owner-disabled");
    assert.equal(slot.json.code, "planning-command-owner-disabled");
    if (entry.startDate === "0") assert.equal(startDate.json.code, "planning-start-date-owner-disabled");
  } else if (entry.startDate === "0") {
    assert.equal(startDate.json.code, "planning-start-date-owner-disabled");
  }
  assertPlanningStorageUntouched(`owner flag matrix ${entry.label}`);
}
env.MES_ENABLE_PLANNING_SERVER_COMMANDS = "1";
env.MES_ENABLE_PLANNING_START_DATE_COMMANDS = "1";

for (const [path, bodyFactory, headersFactory] of [
  [quantityPath, quantityBody, requestHeaders],
  [startDatePath, startDateBody, startDateHeaders],
  [slotPath, slotBody, requestHeaders],
]) {
  const textPlain = await request(path, {
    method: "PATCH",
    body: bodyFactory(),
    headers: headersFactory({ contentType: "text/plain" }),
  });
  assert.equal(textPlain.statusCode, 415, `${path} must reject a safelisted non-JSON mutation body`);
  assert.equal(textPlain.json.code, "json-content-type-required");

  const crossOrigin = await request(path, {
    method: "PATCH",
    body: bodyFactory(),
    headers: headersFactory({ origin: "http://admin.mes.local", fetchSite: "same-site" }),
  });
  assert.equal(crossOrigin.statusCode, 403, `${path} must reject a credentialed sibling-origin mutation`);
  assert.equal(crossOrigin.json.code, "same-origin-required");

  const missingOriginHeaders = headersFactory();
  delete missingOriginHeaders.origin;
  const missingOrigin = await request(path, { method: "PATCH", body: bodyFactory(), headers: missingOriginHeaders });
  assert.equal(missingOrigin.statusCode, 403, `${path} must fail closed without Origin`);
}
assertPlanningStorageUntouched("cross-origin and non-JSON denials");

for (const [name, headers] of [
  ["anonymous", requestHeaders({ publicSession: false, employeeSession: "missing" })],
  ["public-only", requestHeaders({ employeeSession: "missing", forged: true })],
  ["expired", requestHeaders({ employeeSession: "expired" })],
]) {
  assert.equal((await request(quantityPath, { method: "PATCH", body: quantityBody(), headers })).statusCode, 401,
    `${name} quantity mutation must require a current signed employee session`);
  assert.equal((await request(slotPath, { method: "PATCH", body: slotBody(), headers })).statusCode, 401,
    `${name} slot mutation must require a current signed employee session`);
  assert.equal((await request(startDatePath, { method: "PATCH", body: startDateBody(), headers: { ...headers, "idempotency-key": "planning-start-date:denied" } })).statusCode, 401,
    `${name} start-date mutation must require a current signed employee session`);
  assertPlanningStorageUntouched(`${name} denial`);
}

employeeRepositoryMode = "revoked";
assert.equal((await request(quantityPath, { method: "PATCH", body: quantityBody() })).statusCode, 401);
assert.equal((await request(slotPath, { method: "PATCH", body: slotBody() })).statusCode, 401);
assert.equal((await request(startDatePath, { method: "PATCH", body: startDateBody(), headers: startDateHeaders() })).statusCode, 401);
assertPlanningStorageUntouched("revoked session denial");
employeeRepositoryMode = "valid";

assignedRoleId = "viewer";
assert.equal((await request(quantityPath, { method: "PATCH", body: quantityBody() })).statusCode, 403);
assert.equal((await request(slotPath, { method: "PATCH", body: slotBody() })).statusCode, 403);
assert.equal((await request(startDatePath, { method: "PATCH", body: startDateBody(), headers: startDateHeaders() })).statusCode, 403);
assertPlanningStorageUntouched("wrong role denial");
assignedRoleId = "workCenterPlanner";
assert.equal((await request(quantityPath, { method: "PATCH", body: quantityBody() })).statusCode, 403);
assert.equal((await request(slotPath, { method: "PATCH", body: slotBody() })).statusCode, 403);
assert.equal((await request(startDatePath, { method: "PATCH", body: startDateBody(), headers: startDateHeaders() })).statusCode, 403);
assertPlanningStorageUntouched("wrong scope denial");
assignedRoleId = "planner";

employeeRepositoryMode = "throw";
assert.equal((await request(quantityPath, { method: "PATCH", body: quantityBody() })).statusCode, 503);
assertPlanningStorageUntouched("employee authorization infrastructure denial");
employeeRepositoryMode = "valid";
domainsRepositoryMode = "throw";
assert.equal((await request(slotPath, { method: "PATCH", body: slotBody() })).statusCode, 503);
assertPlanningStorageUntouched("System Domains authorization infrastructure denial");
domainsRepositoryMode = "ready";

env.MES_ENABLE_PLANNING_START_DATE_COMMANDS = "0";
const disabledStartDateOwner = await request(startDatePath, {
  method: "PATCH",
  body: startDateBody(),
  headers: startDateHeaders({}, "planning-start-date:owner-disabled"),
});
assert.equal(disabledStartDateOwner.statusCode, 503, "the start-date owner must remain false by default");
assert.equal(disabledStartDateOwner.json.code, "planning-start-date-owner-disabled");
assert.equal(startDateCalls.length, 0, "a disabled owner must stop before the start-date mutation");
env.MES_ENABLE_PLANNING_START_DATE_COMMANDS = "1";

const hugeBody = { quantity: 24, expectedRevision: currentRevision, padding: "x".repeat(PLANNING_COMMAND_BODY_MAX_BYTES) };
const oversized = await request(quantityPath, { method: "PATCH", body: hugeBody });
assert.equal(oversized.statusCode, 413, "Planning must reject an oversized pre-parsed JSON envelope before mutation");
assert.equal(quantityCalls.length, 0);

const quantityResult = await request(quantityPath, { method: "PATCH", body: quantityBody() });
assert.equal(quantityResult.statusCode, 200);
assert.equal(quantityCalls.length, 1);
assert.equal(quantityCalls[0].command.actorId, "employee:employee-planner",
  "quantity audit actor must come from the signed employee session, not the request body");

for (const invalidSlotCommand of [
  { plannedStart: "2026-07-22T08:00:00.000Z", expectedRevision: currentRevision },
  { slotId: "slot-1", plannedStart: "2026-07-22T08:00:00", expectedRevision: currentRevision },
  { slotId: "slot-1", plannedStart: "2026-02-29T08:00:00.000Z", expectedRevision: currentRevision },
]) {
  const callsBeforeInvalidSlot = slotCalls.length;
  const invalidSlot = await request(slotPath, { method: "PATCH", body: invalidSlotCommand });
  assert.equal(invalidSlot.statusCode, 400, "slot owner must require an exact physical slot and ISO instant with offset");
  assert.equal(slotCalls.length, callsBeforeInvalidSlot, "invalid slot identity/time must stop before repository mutation");
}
const slotResult = await request(slotPath, { method: "PATCH", body: slotBody() });
assert.equal(slotResult.statusCode, 200);
assert.equal(slotCalls.length, 1);
assert.equal(slotCalls[0].command.slotId, "slot-1", "slot owner must receive the exact physical slot from the request body");
assert.equal(slotResult.json.slot?.id, "slot-1", "HTTP response must read back the same physical slot");
assert.equal(slotResult.json.compatibilityReceipt?.ready, true, "HTTP slot response must expose an exact applied rollback receipt");
assert.equal(slotCalls[0].command.actorId, "employee:employee-planner",
  "slot audit actor must come from the signed employee session, not the request body");

startDateReadinessMode = "mismatch";
const schemaMismatch = await request(startDatePath, { method: "PATCH", body: startDateBody(), headers: startDateHeaders() });
assert.equal(schemaMismatch.statusCode, 409);
assert.equal(schemaMismatch.json.code, "planning-start-date-schema-not-ready");
assert.equal(startDateCalls.length, 0, "wrong start-date schema/index definition must stop before mutation");
startDateReadinessMode = "throw";
const readinessUnavailable = await request(startDatePath, { method: "PATCH", body: startDateBody(), headers: startDateHeaders() });
assert.equal(readinessUnavailable.statusCode, 503);
assert.equal(readinessUnavailable.json.code, "planning-start-date-readiness-unavailable");
assert.equal(startDateCalls.length, 0);
startDateReadinessMode = "ready";

for (const invalidDate of ["2026-02-29", "0000-01-01", "", "   ", 20260721, true, undefined]) {
  const callsBeforeInvalid = startDateCalls.length;
  const invalidCalendarDate = await request(startDatePath, {
    method: "PATCH",
    body: { planningStartDate: invalidDate, expectedRevision: currentRevision },
    headers: startDateHeaders(),
  });
  assert.equal(invalidCalendarDate.statusCode, 400, `${invalidDate} must be rejected at the HTTP boundary`);
  assert.equal(startDateCalls.length, callsBeforeInvalid);
}
const callsBeforeMissingDate = startDateCalls.length;
const missingCalendarDate = await request(startDatePath, {
  method: "PATCH",
  body: { expectedRevision: currentRevision },
  headers: startDateHeaders({}, "planning-start-date:missing-http"),
});
assert.equal(missingCalendarDate.statusCode, 400, "missing planningStartDate must not be interpreted as clear");
assert.equal(startDateCalls.length, callsBeforeMissingDate, "invalid/missing requests must not invoke the owner");
for (const invalidBody of [null, [], 42, "not-a-command"]) {
  const callsBeforeInvalidBody = startDateCalls.length;
  const invalidEnvelope = await request(startDatePath, {
    method: "PATCH",
    body: invalidBody,
    headers: startDateHeaders({}, `planning-start-date:invalid-envelope-${typeof invalidBody}`),
  });
  assert.equal(invalidEnvelope.statusCode, 400, "null, array and scalar command envelopes must fail as client errors");
  assert.equal(startDateCalls.length, callsBeforeInvalidBody, "invalid command envelopes must not invoke the owner");
}

const startExpectedRevision = currentRevision;
const startKey = "planning-start-date:http-retry";
const startResult = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: "2026-07-23", expectedRevision: startExpectedRevision, actorId: "employee:forged" },
  headers: startDateHeaders({}, startKey),
});
assert.equal(startResult.statusCode, 200);
assert.equal(startResult.json.item?.planningStartDate, "2026-07-23");
assert.equal(startDateCalls.at(-1)?.command.actorId, "employee:employee-planner");
assert.equal(startDateCalls.at(-1)?.command.idempotencyKey, startKey);
assert.equal(startResult.json.compatibilityReceipt?.state, "pending");
assert.equal(startResult.json.compatibilityReceipt?.ready, false,
  "a just-committed command beyond a bounded sync page must remain rollback-pending by its exact receipt");
const revisionAfterStart = currentRevision;
startDateReceipts.get(`employee:employee-planner:${startKey}`).snapshotSyncState = "conflict";
currentQuantity += 1;
currentRevision += 1;
const revisionAfterUnrelatedCommand = currentRevision;
const replayResult = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: "2026-07-23", expectedRevision: startExpectedRevision },
  headers: startDateHeaders({}, startKey),
});
assert.equal(replayResult.statusCode, 200);
assert.equal(replayResult.json.idempotentReplay, true);
assert.equal(replayResult.json.item?.concurrencyRevision, revisionAfterUnrelatedCommand,
  "same-key replay may return the aggregate after a later unrelated command");
assert.equal(replayResult.json.commandAggregateRevision, revisionAfterStart,
  "same-key replay must expose the original durable start-date command revision");
assert.equal(replayResult.json.compatibilityReceipt?.exact, true,
  "compatibility lookup must bind the original command revision rather than the later aggregate row");
assert.equal(replayResult.json.compatibilityReceipt?.state, "conflict");
assert.equal(replayResult.json.compatibilityReceipt?.ready, false,
  "a terminal compatibility conflict must remain false on a same-key owner replay");
assert.equal(currentRevision, revisionAfterUnrelatedCommand, "same actor/key/payload retry must not advance the aggregate twice");
startDateReceipts.get(`employee:employee-planner:${startKey}`).snapshotSyncState = "applied";
const appliedReplayResult = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: "2026-07-23", expectedRevision: startExpectedRevision },
  headers: startDateHeaders({}, startKey),
});
assert.equal(appliedReplayResult.statusCode, 200);
assert.equal(appliedReplayResult.json.idempotentReplay, true);
assert.equal(appliedReplayResult.json.compatibilityReceipt?.state, "applied");
assert.equal(appliedReplayResult.json.compatibilityReceipt?.ready, true,
  "the exact applied command receipt with no unresolved aggregate row must prove rollback readiness");
const startDateCallsBeforeSupersededReplay = startDateCalls.length;
currentPlanningStartDate = "2026-07-25";
currentRevision += 1;
const supersededReplayResult = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: "2026-07-23", expectedRevision: startExpectedRevision },
  headers: startDateHeaders({}, startKey),
});
assert.equal(supersededReplayResult.statusCode, 409);
assert.equal(supersededReplayResult.json.ok, false);
assert.equal(supersededReplayResult.json.conflict, true);
assert.equal(supersededReplayResult.json.superseded, true);
assert.equal(supersededReplayResult.json.code, "superseded-idempotent-replay");
assert.equal(supersededReplayResult.json.item?.planningStartDate, "2026-07-25",
  "a lost-response replay must return the newer canonical start date instead of presenting the old receipt as current");
assert.equal(startDateCalls.length, startDateCallsBeforeSupersededReplay + 1,
  "the superseded replay must cross the authenticated handler exactly once without a hidden retry");
const reusedKey = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: "2026-07-24", expectedRevision: startExpectedRevision },
  headers: startDateHeaders({}, startKey),
});
assert.equal(reusedKey.statusCode, 409);
assert.equal(reusedKey.json.idempotencyConflict, true);
assert.equal(currentPlanningStartDate, "2026-07-25");

const clearExpectedRevision = currentRevision;
const clearKey = "planning-start-date:http-clear-retry";
const clearResult = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: null, expectedRevision: clearExpectedRevision },
  headers: startDateHeaders({}, clearKey),
});
assert.equal(clearResult.statusCode, 200);
assert.equal(clearResult.json.item?.planningStartDate, null, "HTTP owner must preserve explicit null in its canonical response");
assert.equal(Object.prototype.hasOwnProperty.call(startDateCalls.at(-1)?.command || {}, "planningStartDate"), true);
assert.equal(startDateCalls.at(-1)?.command.planningStartDate, null);
const revisionAfterClear = currentRevision;
const clearReplay = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: null, expectedRevision: clearExpectedRevision },
  headers: startDateHeaders({}, clearKey),
});
assert.equal(clearReplay.statusCode, 200);
assert.equal(clearReplay.json.idempotentReplay, true, "lost clear response must replay through the authenticated HTTP boundary");
assert.equal(currentRevision, revisionAfterClear, "exact clear replay must not advance the aggregate twice");
assert.equal(clearReplay.json.compatibilityReceipt?.exact, true,
  "nullable command identity must remain exact in the compatibility receipt");
const clearKeyReusedForDate = await request(startDatePath, {
  method: "PATCH",
  body: { planningStartDate: "2026-07-28", expectedRevision: clearExpectedRevision },
  headers: startDateHeaders({}, clearKey),
});
assert.equal(clearKeyReusedForDate.statusCode, 409);
assert.equal(clearKeyReusedForDate.json.idempotencyConflict, true,
  "the same HTTP idempotency key must distinguish clear from set");
assert.equal(currentPlanningStartDate, null);
assert(workOrdersFactoryCalls > 0 && workOrdersHealthCalls > 0,
  "an authorized exact-scope Planning mutation must proceed into the existing storage/parity path");

let readAuthorizationCalls = 0;
const readResult = await request(quantityPath, {
  method: "GET",
  headers: {},
  planningAuthorizationResolver: async () => {
    readAuthorizationCalls += 1;
    throw new Error("read route must not resolve write authorization");
  },
});
assert.equal(readResult.statusCode, 200, "Planning detail reads must remain available through the existing read contract");
assert.equal(readAuthorizationCalls, 0, "Planning GET must not enter the write authorization boundary");
assert(authorizationResolverCalls > 0, "focused HTTP QA must exercise the real Planning authorization resolver");

console.log("Planning command authorization QA: signed employee/RBAC, exact planning:edit scope, JSON/same-origin, 64 KiB bound, revocation, actor audit and read isolation passed.");
