import { Readable } from "node:stream";

import { handleDomainApiRequest } from "./domain-api.mjs";
import { createEmployeeSessionCookie } from "./employee-auth-guard.mjs";
import { createPublicPasswordHash, handlePublicAuthRequest } from "./public-auth-guard.mjs";
import { inspectShiftExecutionCommandSession } from "./shift-execution-command-authorization.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = String(body); },
  };
}

function makeLoginRequest() {
  const request = Readable.from([Buffer.from("username=qa-master&password=qa-password")]);
  request.method = "POST";
  request.headers = { host: "mes.lifecycle", "content-type": "application/x-www-form-urlencoded" };
  return request;
}

async function sessionCookie(env) {
  const response = makeResponse();
  const handled = await handlePublicAuthRequest(makeLoginRequest(), response, new URL("https://mes.lifecycle/api/login"), {}, env);
  assert(handled && response.statusCode === 302 && response.headers["Set-Cookie"], "QA login must produce a signed public session");
  return String(response.headers["Set-Cookie"]).split(";")[0];
}

function createHarness({ schemaReady = true } = {}) {
  const cancellations = [];
  let commandFactoryCalls = 0;
  let commandCloseCalls = 0;
  let readFactoryCalls = 0;
  const env = {
    DATABASE_URL: "postgres://shift-execution-lifecycle-qa",
    MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "1",
    MES_PUBLIC_AUTH_HOSTS: "mes.lifecycle",
    MES_PUBLIC_AUTH_USERNAME: "qa-master",
    MES_PUBLIC_AUTH_PASSWORD_HASH: createPublicPasswordHash("qa-password", "0123456789abcdef0123456789abcdef"),
    MES_PUBLIC_AUTH_SESSION_SECRET: "shift-execution-lifecycle-api-qa-secret",
    MES_EMPLOYEE_AUTH_HOSTS: "mes.lifecycle",
    MES_EMPLOYEE_AUTH_SESSION_SECRET: "shift-execution-lifecycle-employee-secret",
  };
  const workOrdersRepositoryFactory = async () => ({ health: async () => ({ storageBackend: "postgresql", revision: 1 }) });
  const shiftExecutionReadRepositoryFactory = () => {
    readFactoryCalls += 1;
    return {
      async commandReadiness() { return { schemaReady }; },
      async getCommandTargetContext({ carryoverId = "" } = {}) {
        return { item: carryoverId ? { kind: "carryover", id: carryoverId, assignmentId: "assignment-1", workCenterId: "D5" } : null };
      },
      async close() {},
    };
  };
  const employeeAuthRepositoryFactory = () => ({
    async inspectSession({ employeeId, authVersion }) {
      return employeeId === "employee-master" && authVersion === 1
        ? { valid: true, employeeId, authVersion, displayName: "Мастер QA", personnelNumber: "M-001" }
        : { valid: false, reason: "employee-session-rejected" };
    },
    async close() {},
  });
  const shiftExecutionSessionResolver = (req, { env: requestEnv }) => inspectShiftExecutionCommandSession(req, {
    env: requestEnv,
    employeeAuthRepositoryFactory,
  });
  const shiftExecutionAuthorizationResolver = async (principal, { commandKind, workCenterId }) => ({
    allowed: principal?.id === "employee:employee-master" && commandKind === "carryover" && workCenterId === "D5",
    reason: "allowed",
    principal,
    revision: 1,
    workCenterId,
    contract: { moduleId: "shiftMasterBoard", resourceId: "shiftMasterBoard", action: "edit" },
  });
  const shiftExecutionCommandRepositoryFactory = () => {
    commandFactoryCalls += 1;
    return {
      async cancelCarryover(input) {
        cancellations.push(input);
        return {
          storageMode: "postgres",
          storageBackend: "postgresql",
          configured: true,
          created: true,
          item: {
            id: input.carryoverId,
            canceled_at: "2026-07-18T12:00:00.000Z",
            canceled_by: input.actorId,
            cancellation_reason: input.reason || "",
          },
        };
      },
      async close() { commandCloseCalls += 1; },
    };
  };
  return {
    env,
    cancellations,
    get commandFactoryCalls() { return commandFactoryCalls; },
    get commandCloseCalls() { return commandCloseCalls; },
    get readFactoryCalls() { return readFactoryCalls; },
    async invoke(pathname, { method = "GET", headers = {}, body = null } = {}) {
      const response = makeResponse();
      const request = { method, headers: { host: "mes.lifecycle", ...headers }, body };
      const handled = await handleDomainApiRequest(request, response, new URL(`https://mes.lifecycle${pathname}`), {
        env,
        filePath: "/tmp/shift-execution-lifecycle-api-qa.json",
        workOrdersRepositoryFactory,
        shiftExecutionReadRepositoryFactory,
        shiftExecutionCommandRepositoryFactory,
        shiftExecutionSessionResolver,
        shiftExecutionAuthorizationResolver,
      });
      return {
        handled,
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body,
        json: JSON.parse(response.body || "{}"),
      };
    },
  };
}

const harness = createHarness();
const publicCookie = await sessionCookie(harness.env);
const employeeCookie = createEmployeeSessionCookie({
  employeeId: "employee-master",
  authVersion: 1,
  publicPrincipalId: "public:qa-master",
}, harness.env).split(";", 1)[0];
const cookie = `${publicCookie}; ${employeeCookie}`;
const mutationHeaders = {
  cookie,
  origin: "https://mes.lifecycle",
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};
const capability = await harness.invoke("/api/v1/workshop/shift-execution/capabilities");
assert(capability.statusCode === 200 && capability.json.capabilities?.assignmentCreationEnabled === true && capability.json.capabilities?.carryoverCancellationEnabled === true && capability.json.capabilities?.schemaReady === true, "capability must expose cancellation only after the lifecycle migration is ready");

const canceled = await harness.invoke("/api/v1/workshop/shift-execution/carryovers/carryover-1", {
  method: "PATCH",
  headers: { ...mutationHeaders, "idempotency-key": "cancel-api-1" },
  body: { reason: "Факт исправлен" },
});
assert(canceled.handled && canceled.statusCode === 200 && canceled.json.ok && canceled.json.item?.id === "carryover-1", "authenticated cancellation must use PATCH and return the canonical carryover row");
assert(harness.cancellations.length === 1 && harness.cancellations[0]?.idempotencyKey === "cancel-api-1" && harness.cancellations[0]?.actorId === "employee:employee-master" && harness.cancellations[0]?.authorizedWorkCenterId === "D5" && harness.cancellations[0]?.carryoverId === "carryover-1", "API must derive the actor from the signed employee session and forward the exact canonical work-center command");
assert(harness.commandFactoryCalls === 1 && harness.commandCloseCalls === 1, "cancellation must close its command repository after the state transition");

const unauthenticated = await harness.invoke("/api/v1/workshop/shift-execution/carryovers/carryover-1", {
  method: "PATCH",
  headers: {
    origin: "https://mes.lifecycle",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    "idempotency-key": "cancel-api-unauthenticated",
  },
  body: {},
});
assert(unauthenticated.statusCode === 401 && harness.commandFactoryCalls === 1, "cancellation must reject unauthenticated writes before opening command storage");

const wrongMethod = await harness.invoke("/api/v1/workshop/shift-execution/carryovers/carryover-1", { method: "POST" });
assert(wrongMethod.statusCode === 405, "carryover cancellation must not accept an unsafe create-like method on an existing row");

const migrationBlocked = createHarness({ schemaReady: false });
const blockedPublicCookie = await sessionCookie(migrationBlocked.env);
const blockedEmployeeCookie = createEmployeeSessionCookie({
  employeeId: "employee-master",
  authVersion: 1,
  publicPrincipalId: "public:qa-master",
}, migrationBlocked.env).split(";", 1)[0];
const blocked = await migrationBlocked.invoke("/api/v1/workshop/shift-execution/carryovers/carryover-1", {
  method: "PATCH",
  headers: {
    cookie: `${blockedPublicCookie}; ${blockedEmployeeCookie}`,
    origin: "https://mes.lifecycle",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    "idempotency-key": "cancel-api-blocked",
  },
  body: {},
});
assert(blocked.statusCode === 409 && /not enabled/.test(blocked.json.error || "") && migrationBlocked.commandFactoryCalls === 0, "cancellation must stay blocked until the lifecycle migration is confirmed by the read capability");

console.log("Shift execution carryover cancellation API QA: OK");
