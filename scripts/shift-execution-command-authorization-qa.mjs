import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  SHIFT_EXECUTION_COMMAND_BODY_MAX_BYTES,
  handleDomainApiRequest,
} from "./domain-api.mjs";
import { createEmployeeSessionCookie } from "./employee-auth-guard.mjs";
import { createShiftExecutionCommandRepository } from "./domain-shift-execution-repository.mjs";
import {
  SHIFT_EXECUTION_COMMAND_AUTHORIZATION_CONTRACTS,
  getCurrentShiftExecutionAuthorization,
  inspectShiftExecutionCommandSession,
} from "./shift-execution-command-authorization.mjs";

const now = new Date("2026-07-21T09:00:00.000Z");
const env = {
  APP_ENV: "pilot",
  MES_DOMAIN_STORAGE: "postgres",
  DATABASE_URL: "postgres://shift-command-auth-qa/not-used",
  MES_PUBLIC_AUTH_HOSTS: "mes.local",
  MES_PUBLIC_AUTH_USERNAME: "user",
  MES_PUBLIC_AUTH_SESSION_SECRET: "shift-public-session-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "mes.local",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "shift-employee-session-secret",
  MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: "3600",
  MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "1",
};

assert.deepEqual(SHIFT_EXECUTION_COMMAND_AUTHORIZATION_CONTRACTS, {
  assignment: { moduleId: "shiftMasterBoard", resourceId: "shiftMasterBoard", action: "assign" },
  fact: { moduleId: "shiftMasterBoard", resourceId: "shiftMasterBoard", action: "edit" },
  carryover: { moduleId: "shiftMasterBoard", resourceId: "shiftMasterBoard", action: "edit" },
}, "Shift commands must use the established live Workshop grants");

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
  employeeId: "employee-master",
  authVersion: 4,
  publicPrincipalId: "public:user",
}, env, now).split(";", 1)[0];

function tamperCookie(cookie) {
  const separator = cookie.indexOf("=");
  const name = cookie.slice(0, separator);
  const token = decodeURIComponent(cookie.slice(separator + 1));
  const replacement = token.at(-1) === "A" ? "B" : "A";
  return `${name}=${encodeURIComponent(`${token.slice(0, -1)}${replacement}`)}`;
}

function requestHeaders({ publicSession = true, employeeSession = "valid", origin = "same", contentType = "application/json", forged = false } = {}) {
  const cookies = [];
  if (publicSession) cookies.push(publicCookie);
  if (employeeSession === "valid") cookies.push(employeeCookie);
  if (employeeSession === "tampered") cookies.push(tamperCookie(employeeCookie));
  return {
    host: "mes.local",
    origin: origin === "same" ? "http://mes.local" : "http://admin.mes.local",
    "sec-fetch-site": origin === "same" ? "same-origin" : "same-site",
    "content-type": contentType,
    ...(cookies.length ? { cookie: cookies.join("; ") } : {}),
    ...(forged ? {
      "x-employee-id": "employee-master",
      "x-mes-role": "admin",
      "x-shift-work-center": "WC-A",
    } : {}),
  };
}

let employeeRepositoryMode = "valid";
function employeeAuthRepositoryFactory() {
  return {
    async inspectSession({ employeeId, authVersion }) {
      if (employeeRepositoryMode === "throw") throw new Error("employee auth storage unavailable");
      if (employeeRepositoryMode === "revoked") return { valid: false, reason: "revoked-session" };
      if (employeeId !== "employee-master" || authVersion !== 4) return { valid: false, reason: "invalid-session" };
      return { valid: true, employeeId, authVersion, displayName: "Мастер QA", personnelNumber: "M-001" };
    },
    async close() {},
  };
}

let assignedRoleId = "master";
let domainsRepositoryMode = "ready";
function currentDomains() {
  const actions = ["view", "edit", "assign"];
  const grants = [];
  const add = (roleId, actionId, effect) => grants.push({
    id: `${roleId}:shiftMasterBoard:${actionId}`,
    roleId,
    resourceType: "module",
    resourceId: "shiftMasterBoard",
    actionId,
    effect,
  });
  actions.forEach((action) => add("master", action, "allow"));
  actions.forEach((action) => add("productionHead", action, "allow"));
  actions.forEach((action) => add("executor", action, "deny"));
  return {
    schemaId: "mes.system-domains",
    schemaVersion: 1,
    registries: {
      employees: [{ id: "employee-master", displayName: "Мастер QA", isActive: true }],
      employmentAssignments: [{
        id: "employment-master",
        employeeId: "employee-master",
        workCenterId: "WC-A",
        isPrimary: true,
      }],
      accessRoles: [
        { id: "master", label: "Мастер", scope: "workCenter", isActive: true },
        { id: "productionHead", label: "Начальник производства", scope: "factory", isActive: true },
        { id: "executor", label: "Исполнитель", scope: "self", isActive: true },
      ],
      grants,
      roleAssignments: [{ id: "role-master", employeeId: "employee-master", roleId: assignedRoleId }],
    },
  };
}

function domainsRepositoryFactory() {
  return {
    async get() {
      if (domainsRepositoryMode === "throw") throw new Error("system domains unavailable");
      if (domainsRepositoryMode === "empty") return { item: null, revision: 44701 };
      return { item: currentDomains(), revision: 44701 };
    },
    async close() {},
  };
}

const sessionResolver = (req, { env: requestEnv }) => inspectShiftExecutionCommandSession(req, {
  env: requestEnv,
  employeeAuthRepositoryFactory,
  now: () => now,
});
const authorizationResolver = (principal, { env: requestEnv, commandKind, workCenterId }) => getCurrentShiftExecutionAuthorization(principal, {
  databaseUrl: requestEnv.DATABASE_URL,
  domainsRepositoryFactory,
  now: () => now,
  commandKind,
  workCenterId,
});

const validSession = await sessionResolver({ headers: requestHeaders() }, { env });
assert.equal(validSession.principal?.id, "employee:employee-master");
for (const commandKind of ["assignment", "fact", "carryover"]) {
  const allowed = await authorizationResolver(validSession.principal, { env, commandKind, workCenterId: "WC-A" });
  assert.equal(allowed.allowed, true, `${commandKind} must be allowed in the master's canonical work center`);
  const foreign = await authorizationResolver(validSession.principal, { env, commandKind, workCenterId: "WC-B" });
  assert.equal(foreign.allowed, false, `${commandKind} must be denied in another work center`);
  assert.equal(foreign.reason, "outside-responsibility-scope");
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, responseHeaders) { this.statusCode = statusCode; this.headers = responseHeaders || {}; },
    end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); },
  };
}

const primaryWorkOrders = {
  async health() { return { configured: true, storageMode: "postgres", storageBackend: "postgresql", revision: 9 }; },
};
const workOrdersRepositoryFactory = async () => primaryWorkOrders;

let assignmentTargetWorkCenterId = "WC-A";
let carryoverTargetWorkCenterId = "WC-A";
let operationTargetWorkCenterId = "WC-A";
const targetReads = [];
const shiftExecutionReadRepositoryFactory = () => ({
  async commandReadiness() { return { schemaReady: true }; },
  async getCommandTargetContext({ assignmentId = "", carryoverId = "", workOrderId = "", operationId = "" } = {}) {
    targetReads.push({ assignmentId, carryoverId, workOrderId, operationId });
    if (workOrderId && operationId) return { item: { kind: "work-order-operation", id: operationId, operationId, workOrderId, workCenterId: operationTargetWorkCenterId } };
    if (assignmentId) return { item: {
      kind: "assignment",
      id: assignmentId,
      assignmentId,
      sourceRowId: "row-1",
      sourceSlotId: "slot-1",
      workOrderId: "WO-1",
      operationId: "OP-1",
      workCenterId: assignmentTargetWorkCenterId,
    } };
    if (carryoverId) return { item: { kind: "carryover", id: carryoverId, assignmentId: "assignment-qa", workCenterId: carryoverTargetWorkCenterId } };
    return { item: null };
  },
  async close() {},
});

const commandCalls = [];
let commandRepositoryFailure = "";
const shiftExecutionCommandRepositoryFactory = () => ({
  async createAssignment(command) {
    if (commandRepositoryFailure) {
      const error = new Error(commandRepositoryFailure);
      error.code = "SHIFT_EXECUTION_COMMAND_INVALID";
      throw error;
    }
    commandCalls.push({ method: "createAssignment", command });
    return { created: true, item: { id: "assignment-created" } };
  },
  async updateAssignment(command) { commandCalls.push({ method: "updateAssignment", command }); return { created: false, item: { id: command.assignmentId } }; },
  async recordFact(command) { commandCalls.push({ method: "recordFact", command }); return { created: true, item: { id: "fact-created" } }; },
  async createCarryover(command) { commandCalls.push({ method: "createCarryover", command }); return { created: true, item: { id: "carryover-created" } }; },
  async cancelCarryover(command) { commandCalls.push({ method: "cancelCarryover", command }); return { created: true, item: { id: command.carryoverId } }; },
  async close() {},
});

function responseHeaders(contentType) {
  return { "Content-Type": contentType, "Cache-Control": "no-store" };
}

async function request(pathname, { method = "POST", body = {}, headers = requestHeaders() } = {}) {
  const res = makeResponse();
  const handled = await handleDomainApiRequest(
    { method, body, headers },
    res,
    new URL(`http://mes.local${pathname}`),
    {
      headers: responseHeaders,
      env,
      filePath: "/tmp/shift-command-authorization-qa.json",
      workOrdersRepositoryFactory,
      shiftExecutionReadRepositoryFactory,
      shiftExecutionCommandRepositoryFactory,
      shiftExecutionSessionResolver: sessionResolver,
      shiftExecutionAuthorizationResolver: authorizationResolver,
    },
  );
  let json = {};
  try { json = JSON.parse(res.body || "{}"); } catch {}
  return { handled, statusCode: res.statusCode, json };
}

const routes = [
  {
    name: "assignment-create",
    path: "/api/v1/workshop/shift-execution/assignments",
    method: "POST",
    body: { idempotencyKey: "assignment-create", workOrderId: "WO-1", operationId: "OP-1" },
  },
  {
    name: "assignment-update",
    path: "/api/v1/workshop/shift-execution/assignments/assignment-qa",
    method: "PATCH",
    body: { idempotencyKey: "assignment-update" },
  },
  {
    name: "fact",
    path: "/api/v1/workshop/shift-execution/assignments/assignment-qa/facts",
    method: "POST",
    body: { idempotencyKey: "fact-create" },
  },
  {
    name: "carryover-create",
    path: "/api/v1/workshop/shift-execution/carryovers",
    method: "POST",
    body: { idempotencyKey: "carryover-create", sourceAssignmentId: "assignment-qa" },
  },
  {
    name: "carryover-cancel",
    path: "/api/v1/workshop/shift-execution/carryovers/carryover-qa",
    method: "PATCH",
    body: { idempotencyKey: "carryover-cancel" },
  },
];

for (const scenario of [
  { name: "anonymous", headers: requestHeaders({ publicSession: false, employeeSession: "missing" }) },
  { name: "public-only", headers: requestHeaders({ employeeSession: "missing", forged: true }) },
  { name: "tampered", headers: requestHeaders({ employeeSession: "tampered" }) },
]) {
  for (const route of routes) {
    const result = await request(route.path, { method: route.method, body: route.body, headers: scenario.headers });
    assert.equal(result.statusCode, 401, `${scenario.name} ${route.name} must require a signed employee session`);
  }
}

employeeRepositoryMode = "revoked";
for (const route of routes) {
  assert.equal((await request(route.path, { method: route.method, body: route.body })).statusCode, 401, `revoked ${route.name} must fail closed`);
}
employeeRepositoryMode = "valid";

assignedRoleId = "executor";
for (const route of routes) {
  assert.equal((await request(route.path, { method: route.method, body: route.body })).statusCode, 403, `denied role ${route.name} must fail closed`);
}
assignedRoleId = "master";

for (const route of routes) {
  const textPlain = await request(route.path, {
    method: route.method,
    body: route.body,
    headers: requestHeaders({ contentType: "text/plain" }),
  });
  assert.equal(textPlain.statusCode, 415, `${route.name} must reject a safelisted text/plain body`);
  assert.equal(textPlain.json.code, "json-content-type-required");

  const crossOrigin = await request(route.path, {
    method: route.method,
    body: route.body,
    headers: requestHeaders({ origin: "sibling" }),
  });
  assert.equal(crossOrigin.statusCode, 403, `${route.name} must reject a credentialed sibling origin`);
  assert.equal(crossOrigin.json.code, "same-origin-required");

  const oversized = await request(route.path, {
    method: route.method,
    body: JSON.stringify({ ...route.body, padding: "x".repeat(SHIFT_EXECUTION_COMMAND_BODY_MAX_BYTES) }),
  });
  assert.equal(oversized.statusCode, 413, `${route.name} must reject an oversized command before mutation`);
}
assert.equal(commandCalls.length, 0, "all rejected Shift probes must remain non-mutating");

assignmentTargetWorkCenterId = "WC-B";
for (const route of routes.filter((item) => ["assignment-update", "fact", "carryover-create"].includes(item.name))) {
  const body = route.name === "assignment-update" || route.name === "carryover-create"
    ? { ...route.body, workCenterId: "WC-B" }
    : route.body;
  const result = await request(route.path, { method: route.method, body });
  assert.equal(result.statusCode, 403, `${route.name} must deny a canonical PostgreSQL target in another work center`);
}
assignmentTargetWorkCenterId = "WC-A";
operationTargetWorkCenterId = "WC-B";
assert.equal((await request(routes[0].path, { method: routes[0].method, body: routes[0].body })).statusCode, 403,
  "assignment creation must authorize the canonical PostgreSQL operation work center");
operationTargetWorkCenterId = "";
assert.equal((await request(routes[0].path, { method: routes[0].method, body: { ...routes[0].body, workCenterId: "WC-A" } })).statusCode, 503,
  "an incomplete canonical PostgreSQL operation target must fail closed instead of trusting the submitted work center");
operationTargetWorkCenterId = "WC-A";
carryoverTargetWorkCenterId = "WC-B";
assert.equal((await request(routes[4].path, { method: routes[4].method, body: routes[4].body })).statusCode, 403,
  "carryover cancellation must authorize the canonical PostgreSQL carryover work center");
carryoverTargetWorkCenterId = "WC-A";

for (const route of routes.filter((item) => ["assignment-create", "assignment-update", "carryover-create"].includes(item.name))) {
  const mismatch = await request(route.path, {
    method: route.method,
    body: { ...route.body, workCenterId: "WC-B" },
  });
  assert.equal(mismatch.statusCode, 409, `${route.name} must reject a body that disagrees with its PostgreSQL target`);
  assert.equal(mismatch.json.code, "shift-execution-target-context-mismatch");
}
for (const route of routes.filter((item) => ["assignment-update", "carryover-create"].includes(item.name))) {
  const mismatch = await request(route.path, {
    method: route.method,
    body: { ...route.body, operationId: "OP-FOREIGN" },
  });
  assert.equal(mismatch.statusCode, 409, `${route.name} must reject a body reference that disagrees with its PostgreSQL target`);
  assert.equal(mismatch.json.code, "shift-execution-target-context-mismatch");
}

for (const route of routes) {
  const result = await request(route.path, { method: route.method, body: route.body });
  assert.equal(result.statusCode, route.name.includes("create") || route.name === "fact" ? 201 : 200, `${route.name} allowed status`);
}
assert.deepEqual(commandCalls.map((entry) => entry.method), [
  "createAssignment",
  "updateAssignment",
  "recordFact",
  "createCarryover",
  "cancelCarryover",
]);
for (const { command } of commandCalls) {
  assert.equal(command.actorId, "employee:employee-master", "audit actor must come from the signed employee session");
  assert.equal(command.authorizedWorkCenterId, "WC-A", "repository guard must receive the canonical authorized work center");
}
assert.equal(commandCalls.find((entry) => entry.method === "updateAssignment")?.command?.workCenterId, "WC-A", "assignment update must use the canonical work center when the body omits it");
assert.equal(commandCalls.find((entry) => entry.method === "createCarryover")?.command?.workCenterId, "WC-A", "carryover create must use the canonical work center when the body omits it");
assert.equal(commandCalls.find((entry) => entry.method === "createAssignment")?.command?.workCenterId, "WC-A", "assignment create must use the canonical operation work center when the body omits it");
for (const method of ["updateAssignment", "createCarryover"]) {
  const command = commandCalls.find((entry) => entry.method === method)?.command;
  assert.equal(command?.sourceSlotId, "slot-1", `${method} must use the canonical source slot when the body omits it`);
  assert.equal(command?.workOrderId, "WO-1", `${method} must use the canonical Work Order when the body omits it`);
  assert.equal(command?.operationId, "OP-1", `${method} must use the canonical operation when the body omits it`);
}
assert.equal(commandCalls.find((entry) => entry.method === "updateAssignment")?.command?.sourceRowId, "row-1", "assignment update must use the canonical source row when the body omits it");
assert(targetReads.some((entry) => entry.workOrderId === "WO-1" && entry.operationId === "OP-1"), "assignment creation must resolve its canonical PostgreSQL operation target");
assert(targetReads.some((entry) => entry.assignmentId === "assignment-qa"), "ID-only assignment/fact commands must resolve their PostgreSQL target");
assert(targetReads.some((entry) => entry.carryoverId === "carryover-qa"), "ID-only cancellation must resolve its PostgreSQL carryover target");

commandRepositoryFailure = "workOrderId is required";
const invalidCommand = await request(routes[0].path, { body: routes[0].body });
assert.equal(invalidCommand.statusCode, 422, "validated Shift command input must map to HTTP 422 rather than a storage outage");
assert.equal(invalidCommand.json.code, "shift-execution-command-invalid");
commandRepositoryFailure = "";

employeeRepositoryMode = "throw";
assert.equal((await request(routes[0].path, { body: routes[0].body })).statusCode, 503, "employee auth outage must fail closed");
employeeRepositoryMode = "valid";
domainsRepositoryMode = "throw";
assert.equal((await request(routes[0].path, { body: routes[0].body })).statusCode, 503, "System Domains outage must fail closed");
domainsRepositoryMode = "ready";

let guardedMutationWrites = 0;
const contextRaceSql = (strings, ...values) => {
  const query = strings.join("?").replace(/\s+/g, " ").trim();
  if (/SELECT assignment\.\* FROM shift_execution_command_requests/.test(query)) return Promise.resolve([]);
  if (/SELECT request_fingerprint, shift_assignment_id FROM shift_execution_mutation_requests/.test(query)) return Promise.resolve([]);
  if (/SELECT \* FROM shift_assignments WHERE id = \? FOR UPDATE/.test(query)) {
    return Promise.resolve([{
      id: values[0], source_row_id: "row-1", source_slot_id: "slot-1", work_order_id: "WO-1",
      work_order_operation_id: "OP-1", work_center_id: "WC-B", revision: 1,
    }]);
  }
  if (/SELECT id, work_center_id FROM work_order_operations WHERE id = \? AND work_order_id = \? FOR SHARE/.test(query)) {
    return Promise.resolve([{ id: values[0], work_center_id: "WC-B" }]);
  }
  if (/SELECT request_fingerprint, shift_fact_id FROM shift_execution_fact_requests/.test(query)) return Promise.resolve([]);
  if (/SELECT id, work_center_id FROM shift_assignments WHERE id = \? FOR SHARE/.test(query)) {
    return Promise.resolve([{ id: values[0], work_center_id: "WC-B" }]);
  }
  if (/SELECT id, source_slot_id, work_order_id, work_order_operation_id, work_center_id FROM shift_assignments WHERE id = \? FOR SHARE/.test(query)) {
    return Promise.resolve([{
      id: values[0], source_slot_id: "slot-1", work_order_id: "WO-1",
      work_order_operation_id: "OP-1", work_center_id: "WC-B",
    }]);
  }
  if (/SELECT request_fingerprint, shift_carryover_id FROM shift_execution_carryover_requests/.test(query)) return Promise.resolve([]);
  if (/SELECT request_fingerprint, shift_carryover_id FROM shift_execution_carryover_cancellation_requests/.test(query)) return Promise.resolve([]);
  if (/SELECT \* FROM shift_carryovers WHERE id = \? FOR UPDATE/.test(query)) {
    return Promise.resolve([{ id: values[0], work_center_id: "WC-B", canceled_at: null }]);
  }
  if (/^(?:UPDATE|INSERT|DELETE) /.test(query)) {
    guardedMutationWrites += 1;
    return Promise.resolve([]);
  }
  throw new Error(`Unexpected context-race SQL: ${query}`);
};
contextRaceSql.begin = async (callback) => callback(contextRaceSql);
contextRaceSql.json = (value) => value;
const guardedRepository = createShiftExecutionCommandRepository({ sql: contextRaceSql });

let invalidRepositoryCode = "";
try { await guardedRepository.createAssignment({ workCenterId: "WC-A", authorizedWorkCenterId: "WC-A" }); }
catch (error) { invalidRepositoryCode = error?.code || ""; }
assert.equal(invalidRepositoryCode, "SHIFT_EXECUTION_COMMAND_INVALID", "repository builders must classify invalid command input separately from storage failures");

async function assertContextRaceRejected(run, label) {
  let code = "";
  try { await run(); } catch (error) { code = error?.code || ""; }
  assert.equal(code, "SHIFT_EXECUTION_AUTHORIZATION_CONTEXT_CHANGED", `${label} must recheck its canonical work center inside the command transaction`);
}

const assignmentPayload = {
  idempotencyKey: "context-update",
  assignmentId: "assignment-race",
  expectedRevision: 1,
  workOrderId: "WO-1",
  operationId: "OP-1",
  sourceRowId: "row-1",
  sourceSlotId: "slot-1",
  workCenterId: "WC-A",
  plannedQuantity: 1,
  assignedQuantity: 1,
  authorizedWorkCenterId: "WC-A",
  actorId: "employee:employee-master",
};
await assertContextRaceRejected(() => guardedRepository.createAssignment({
  ...assignmentPayload,
  idempotencyKey: "context-create",
}), "assignment create");
await assertContextRaceRejected(() => guardedRepository.updateAssignment(assignmentPayload), "assignment update");
await assertContextRaceRejected(() => guardedRepository.recordFact({
  idempotencyKey: "context-fact",
  assignmentId: "assignment-race",
  actualQuantity: 1,
  defectQuantity: 0,
  laborMinutes: 1,
  executorCount: 1,
  reportedAt: now.toISOString(),
  authorizedWorkCenterId: "WC-A",
  actorId: "employee:employee-master",
}), "fact write");
await assertContextRaceRejected(() => guardedRepository.createCarryover({
  idempotencyKey: "context-carryover",
  sourceAssignmentId: "assignment-race",
  sourceSlotId: "slot-1",
  workOrderId: "WO-1",
  operationId: "OP-1",
  workCenterId: "WC-A",
  dateKey: "2026-07-22",
  remainingQuantity: 1,
  authorizedWorkCenterId: "WC-A",
  actorId: "employee:employee-master",
}), "carryover create");
await assertContextRaceRejected(() => guardedRepository.cancelCarryover({
  idempotencyKey: "context-carryover-cancel",
  carryoverId: "carryover-race",
  reason: "QA",
  authorizedWorkCenterId: "WC-A",
  actorId: "employee:employee-master",
}), "carryover cancellation");
assert.equal(guardedMutationWrites, 0, "a target that changed work center after authorization must not reach a mutation statement");

console.log("Shift Execution command authorization QA: signed employee/RBAC, canonical work-center scope, JSON/same-origin, body bounds, revocation and employee audit actors passed.");
