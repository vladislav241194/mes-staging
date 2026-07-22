import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MarkingPhase1ValidationError,
  assertMarkingPhase1Completable,
  assertMarkingPhase1Configurable,
  normalizeMarkingPhase1AddKits,
  normalizeMarkingPhase1Bootstrap,
  normalizeMarkingPhase1CodeLookup,
  normalizeMarkingPhase1Configuration,
  stableMarkingPhase1Json,
} from "../src/domain/marking_phase1.js";
import { handleMarkingPhase1Request } from "./domain-marking-phase1-endpoint.mjs";

const bootstrap = normalizeMarkingPhase1Bootstrap({
  sourceAssignmentId: "MOK-MARKING-ASSIGNMENT",
  sourceWorkOrderId: "MOK-MARKING-WORK-ORDER",
  sourceOperationId: "MOK-MARKING-OPERATION",
  sourceWorkCenterId: "MOK-MARKING-WORK-CENTER",
  assignedEmployeeId: "employee-1",
  productName: "MOK — изделие",
  plannedBoardQuantity: 2000,
  sourceStarted: false,
  idempotencyKey: "bootstrap-1",
});
assert.equal(bootstrap.plannedBoardQuantity, 2000);
assert.equal(bootstrap.nextWorkCenterId, "MOK-MARKING-WORK-CENTER-NEXT-MOK");
assert.equal(normalizeMarkingPhase1CodeLookup({ codeValue: "ab-cd" }).codeValue, "AB-CD");
assert.deepEqual(
  stableMarkingPhase1Json({ z: 1, a: { y: 2, b: 3 } }),
  stableMarkingPhase1Json({ a: { b: 3, y: 2 }, z: 1 }),
);
assert.throws(
  () => normalizeMarkingPhase1AddKits({ taskId: "task", expectedRevision: 1, count: 201, idempotencyKey: "key" }),
  MarkingPhase1ValidationError,
);
assert.doesNotThrow(() => normalizeMarkingPhase1Configuration({
  taskId: "task", expectedRevision: 1, configuredKitCount: 10, boardsPerKit: 20, idempotencyKey: "key",
}));
assert.throws(
  () => assertMarkingPhase1Configurable({ phase1State: "in_progress", boardsPerKit: 20 }, { existingKitCount: 5, confirmedKitCount: 1, nextBoardsPerKit: 25, nextKitCount: 5 }),
  /cannot change after confirmed printing/,
);
assert.doesNotThrow(() => assertMarkingPhase1Completable({ phase1State: "in_progress", kitCount: 5, confirmedKitCount: 5 }));
assert.throws(() => assertMarkingPhase1Completable({ phase1State: "in_progress", kitCount: 5, confirmedKitCount: 4 }), /Every generated kit/);

function responseHarness() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = body; },
  };
}

const calls = [];
const repository = {
  readiness: async () => ({ ok: true }),
  listTasks: async (input) => { calls.push(["listTasks", input]); return { ok: true, tasks: [] }; },
  getTask: async (input) => { calls.push(["getTask", input]); return { ok: true, task: { id: input.taskId } }; },
  lookupCode: async (input) => { calls.push(["lookupCode", input]); return { ok: true, code: { value: input.codeValue } }; },
  bootstrapTask: async (input) => { calls.push(["bootstrapTask", input]); return { ok: true, task: { id: "MOK-MARKING-TASK" }, created: true }; },
  configureTask: async (input) => { calls.push(["configureTask", input]); return { ok: true, taskId: input.taskId }; },
  addKits: async (input) => { calls.push(["addKits", input]); return { ok: true, taskId: input.taskId }; },
  createPrintBatch: async (input) => { calls.push(["createPrintBatch", input]); return { ok: true, taskId: input.taskId }; },
  resolvePrintBatch: async (input) => { calls.push(["resolvePrintBatch", input]); return { ok: true, taskId: input.taskId }; },
  reprint: async (input) => { calls.push(["reprint", input]); return { ok: true, taskId: input.taskId }; },
  completeTask: async (input) => { calls.push(["completeTask", input]); return { ok: true, taskId: input.taskId }; },
  transferTask: async (input) => { calls.push(["transferTask", input]); return { ok: true, taskId: input.taskId }; },
  cancelTransfer: async (input) => { calls.push(["cancelTransfer", input]); return { ok: true, taskId: input.taskId }; },
  close: async () => { calls.push(["close"]); },
};
const authCalls = [];
const getAuthorization = async ({ action }) => {
  authCalls.push(action);
  return { allowed: true, principal: { id: "employee:employee-1", employeeId: "employee-1" } };
};

async function call(method, path, body = null, { authorization = getAuthorization, idempotencyKey = "request-1", internalBase = "https://pilot.mes-line.ru" } = {}) {
  const url = new URL(`${internalBase}${path}`);
  const req = {
    method,
    headers: method === "POST" ? {
      host: "pilot.mes-line.ru",
      origin: "https://pilot.mes-line.ru",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    } : {},
    ...(body ? { body } : {}),
  };
  const res = responseHarness();
  const handled = await handleMarkingPhase1Request(req, res, url, {
    getAuthorization: authorization,
    repositoryFactory: () => repository,
  });
  return { handled, statusCode: res.statusCode, json: JSON.parse(res.body) };
}

assert.equal((await call("GET", "/api/v1/marking/tasks")).statusCode, 200);
assert.equal((await call("GET", "/api/v1/marking/tasks/MOK-MARKING-TASK")).statusCode, 200);
assert.equal((await call("GET", "/api/v1/marking/codes/abc")).statusCode, 200);
assert.equal((await call("POST", "/api/v1/marking/tasks/MOK-MARKING-TASK/actions", { action: "complete", requestId: "proxy-request" }, { idempotencyKey: "proxy-request", internalBase: "http://127.0.0.1:4173" })).statusCode, 200, "reverse-proxy HTTPS Origin must be checked against the public Host, not the internal protocol");

const actionCases = [
  ["bootstrap", "bootstrapTask", "edit"],
  ["configure", "configureTask", "edit"],
  ["create-kits", "addKits", "edit"],
  ["create-print-batch", "createPrintBatch", "print"],
  ["confirm-print", "resolvePrintBatch", "print"],
  ["print-error", "resolvePrintBatch", "print"],
  ["reprint", "reprint", "print"],
  ["complete", "completeTask", "edit"],
  ["transfer", "transferTask", "edit"],
  ["cancel-transfer", "cancelTransfer", "edit"],
];
for (let index = 0; index < actionCases.length; index += 1) {
  const [action, expectedMethod, expectedAuthorization] = actionCases[index];
  const beforeCalls = calls.length;
  const beforeAuth = authCalls.length;
  const result = await call("POST", "/api/v1/marking/tasks/MOK-MARKING-TASK/actions", { action, requestId: `request-${index + 10}` }, { idempotencyKey: `request-${index + 10}` });
  assert.ok([200, 201].includes(result.statusCode), `${action} must be handled`);
  assert.equal(calls.slice(beforeCalls).find((item) => item[0] !== "close")?.[0], expectedMethod);
  assert.equal(authCalls[beforeAuth], expectedAuthorization);
  assert.equal(result.json.stateScope, "test-state");
  assert.equal(result.json.testData, true);
}

await call("POST", "/api/v1/marking/tasks/MOK-MARKING-TASK/actions", { action: "confirm-print", result: "error", requestId: "print-error-result" }, { idempotencyKey: "print-error-result" });
assert.equal(calls.filter((item) => item[0] === "resolvePrintBatch").at(-1)?.[1]?.result, "error", "confirm-print must preserve an explicit print error result");

const noAuthorization = await call("GET", "/api/v1/marking/tasks", null, { authorization: null });
assert.equal(noAuthorization.statusCode, 503);
assert.equal(noAuthorization.json.code, "marking-authorization-not-configured");
const mismatch = await call("POST", "/api/v1/marking/tasks/MOK-MARKING-TASK/actions", { action: "complete", requestId: "body-key" }, { idempotencyKey: "header-key" });
assert.equal(mismatch.statusCode, 400);
assert.equal(mismatch.json.code, "marking-idempotency-key-mismatch");

const [migration, repositorySource, endpointSource] = await Promise.all([
  readFile(new URL("../db/migrations/035_marking_phase1_prototype.sql", import.meta.url), "utf8"),
  readFile(new URL("./domain-marking-phase1-repository.mjs", import.meta.url), "utf8"),
  readFile(new URL("./domain-marking-phase1-endpoint.mjs", import.meta.url), "utf8"),
]);
assert.match(migration, /035_marking_phase1_prototype/);
assert.match(migration, /prototype_scope = 'isolated-test'/);
assert.doesNotMatch(migration, /REFERENCES\s+(?:shift_|work_orders|production_)/i);
assert.doesNotMatch(`${migration}\n${repositorySource}`, /UPDATE\s+(?:shift_|work_orders|production_)/i);
assert.match(repositorySource, /MOK-MARKING-/);
assert.match(repositorySource, /testData: true/);
assert.match(endpointSource, /const BASE_PATH = "\/api\/v1\/marking"/);
assert.match(endpointSource, /stateScope: "test-state"/);

console.log("Marking Phase 1 backend QA passed");
console.log("- isolated additive PostgreSQL schema: pass");
console.log("- tasks/detail/bootstrap/configure/kits/print/result/reprint/complete/transfer/cancel/code routes: pass");
console.log("- fail-closed authorization, same-origin and idempotency boundary: pass");
console.log("- MOK-MARKING durable first-login seed contract: pass");
