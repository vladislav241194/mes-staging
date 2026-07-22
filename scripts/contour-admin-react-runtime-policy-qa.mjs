import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transform } from "esbuild";
import {
  CONTOUR_ADMIN_SERVER_ACTIONS,
  CONTOUR_ADMIN_SERVER_ACTION_IDS,
  createContourAdminDeployRequest,
  handleContourAdminActionRequest,
  inspectContourAdminMutationRequest,
} from "./contour-admin-endpoint.mjs";
import {
  CONTOUR_ADMIN_CLIENT_ACTION_IDS,
  CONTOUR_ADMIN_SCENARIO_ACTIONS,
} from "../src/modules/contour_admin/command_contract.js";
import { getPublicRuntimeConfig, renderRuntimeConfigScript } from "./shared-state-storage.mjs";
const disabled = getPublicRuntimeConfig({});
assert.equal(disabled.MES_REACT_CONTOUR_ADMIN, false);
assert.equal(disabled.MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION, false);
const enabled = getPublicRuntimeConfig({ MES_REACT_CONTOUR_ADMIN: "1", MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.equal(enabled.MES_REACT_CONTOUR_ADMIN, true);
assert.equal(enabled.MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION, true);
const script = renderRuntimeConfigScript({ MES_REACT_CONTOUR_ADMIN: "1", MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION: "1", ADMIN_PASSWORD: "must-not-leak" });
assert.match(script, /"MES_REACT_CONTOUR_ADMIN":true/);
assert.match(script, /"MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION":true/);
assert.doesNotMatch(script, /must-not-leak/);
const [app, host, owner, commandContract, productionModel, endpoint, scenario] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("src/modules/contour_admin/react_island_host.js", "utf8"),
  readFile("src/modules/contour_admin/server_owner_client.js", "utf8"),
  readFile("src/modules/contour_admin/command_contract.js", "utf8"),
  readFile("experiments/react-migration/src/modules/contour-admin/production-model.ts", "utf8"),
  readFile("scripts/contour-admin-endpoint.mjs", "utf8"),
  readFile("experiments/react-migration/src/modules/contour-admin/ContourAdminScenario.tsx", "utf8"),
]);
assert.match(app, /react-contour-admin-write/);
assert.match(app, /surfaceId: "contourAdmin"/);
assert.match(app, /return \{ capabilities: \{ executeOps: activation\.accessMode === "react" \|\| getContourAdminReactLocalQaOverrides\(\)\.writeEvaluation \} \}/);
assert.match(app, /command\.confirmed !== true/);
assert.match(app, /isContourAdminCommandAllowed\(scenarioId, actionId\)/);
assert.match(app, /if \(!permanentReact\) ensureContourAdminModule\(\)/);
assert.doesNotMatch(app, /getPayload:\s*\(\)\s*=>\s*\{[\s\S]{0,300}getContourAdminModel/);
assert.match(host, /write-evaluation/);
assert.match(host, /canFallbackToLegacy: \(activation\) => activation\.accessMode !== "react"/);
assert.match(host, /if \(activation\.accessMode === "react"\) return ""/);
assert.match(host, /executeCommand/);
assert.match(owner, /executeContourAdminServerAction/);
assert.match(owner, /fetchImpl\("\/api\/contour-admin\/action"/);
assert.match(owner, /credentials: "same-origin"/);
assert.match(commandContract, /"deploy-to-pilot": Object\.freeze\(\["request-deploy-to-pilot"\]\)/);
assert.match(productionModel, /buildContourAdminProductionModel/);
assert.match(productionModel, /actionId: "request-deploy-to-pilot"/);
assert.doesNotMatch(productionModel, /render\.js|src\/app\.js|localStorage|sessionStorage/);
assert.match(endpoint, /kind: "durable-request"/);
assert.match(endpoint, /principal\.role !== "contour-admin"/);
assert.match(endpoint, /deployExecuted: false/);
assert.match(endpoint, /await handle\.sync\(\)/);
assert.match(endpoint, /await directoryHandle\.sync\(\)/);
assert.doesNotMatch(scenario, /fetch\(|\/api\/contour-admin\/action|backup-shared-state\.mjs|promote-contour\.mjs/);
assert.doesNotMatch(scenario, /onRequestLegacy\?\./);
assert.match(scenario, /data-contour-admin-confirm-execute/);

const compiledProductionModel = await transform(productionModel, { loader: "ts", format: "esm", target: "es2022" });
const productionModelModule = await import(`data:text/javascript;base64,${Buffer.from(compiledProductionModel.code).toString("base64")}`);
const productionScenarioActions = Object.fromEntries(
  productionModelModule.buildContourAdminProductionModel().scenarios.map((item) => [
    item.id,
    [item.precheckActionId, item.actionId].filter(Boolean),
  ]),
);
assert.deepEqual(productionScenarioActions, CONTOUR_ADMIN_SCENARIO_ACTIONS,
  "every typed Contour Admin scenario/action pair must equal the host allowlist");
assert.deepEqual(CONTOUR_ADMIN_CLIENT_ACTION_IDS, CONTOUR_ADMIN_SERVER_ACTION_IDS,
  "every client action must exist in the frozen server whitelist, with no server-only action");
assert(Object.isFrozen(CONTOUR_ADMIN_SERVER_ACTIONS) && Object.isFrozen(CONTOUR_ADMIN_SERVER_ACTION_IDS));
assert(Object.values(CONTOUR_ADMIN_SERVER_ACTIONS).every((action) => Object.isFrozen(action)
  && (!action.args || Object.isFrozen(action.args))
  && (!action.env || Object.isFrozen(action.env))), "server whitelist entries must be deeply frozen at execution boundaries");

const adminEnv = {
  MES_ADMIN_HOSTS: "127.0.0.1",
  MES_ADMIN_USERNAME: "qa-admin",
  MES_ADMIN_SESSION_SECRET: "contour-admin-runtime-policy-secret",
};

function adminCookie() {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ user: "qa-admin", iat: now - 1, exp: now + 3600 })).toString("base64url");
  const signature = createHmac("sha256", adminEnv.MES_ADMIN_SESSION_SECRET).update(body).digest("base64url");
  return `mes_admin_session=${encodeURIComponent(`${body}.${signature}`)}`;
}

function mutationRequest({
  body = { action: "request-deploy-to-pilot" },
  contentType = "application/json",
  origin = "http://127.0.0.1:4443",
  fetchSite = "same-origin",
  remoteAddress = "127.0.0.1",
} = {}) {
  const serialized = JSON.stringify(body);
  return {
    method: "POST",
    headers: {
      host: "127.0.0.1:4443",
      cookie: adminCookie(),
      ...(contentType ? { "content-type": contentType } : {}),
      ...(origin ? { origin } : {}),
      ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
    },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() { yield Buffer.from(serialized); },
  };
}

function responseCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = String(body); },
  };
}

async function callHandler(request, { auditLogPath, runCommand } = {}) {
  const response = responseCapture();
  const handled = await handleContourAdminActionRequest(
    request,
    response,
    new URL("https://127.0.0.1:4443/api/contour-admin/action"),
    {
      env: adminEnv,
      auditLogPath,
      runCommand,
      headers: (contentType) => ({ "Content-Type": contentType, "Cache-Control": "no-store" }),
      testOnlyRequestSecurity: { testOnlyExpectedOrigin: "http://127.0.0.1:4443" },
    },
  );
  return { handled, statusCode: response.statusCode, json: JSON.parse(response.body || "{}") };
}

assert.equal(inspectContourAdminMutationRequest({
  headers: { host: "admin.mes-line.ru", origin: "https://admin.mes-line.ru", "sec-fetch-site": "same-origin", "content-type": "application/json" },
}).ok, true, "runtime security must accept only the exact HTTPS admin origin");
assert.equal(inspectContourAdminMutationRequest({
  headers: { host: "admin.mes-line.ru:443", origin: "https://admin.mes-line.ru", "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" },
}).ok, true, "runtime security must canonicalize the default HTTPS port without weakening exact-origin comparison");
assert.equal(inspectContourAdminMutationRequest({
  headers: { host: "admin.mes-line.ru", origin: "http://admin.mes-line.ru", "sec-fetch-site": "same-origin", "content-type": "application/json" },
}).ok, false, "runtime security must reject an HTTP downgrade");
assert.equal(inspectContourAdminMutationRequest(mutationRequest()).ok, false,
  "loopback HTTP must not be a runtime bypass without explicit injected test options");
assert.equal(inspectContourAdminMutationRequest(mutationRequest(), { testOnlyExpectedOrigin: "http://127.0.0.1:4443" }).ok, true,
  "explicit loopback test injection must keep handler QA possible");
assert.equal(inspectContourAdminMutationRequest(mutationRequest({ remoteAddress: "10.0.0.8" }), { testOnlyExpectedOrigin: "http://127.0.0.1:4443" }).ok, false,
  "test origin injection must remain loopback-only");

const auditRoot = await mkdtemp(join(tmpdir(), "mes-contour-admin-request-"));
try {
  const auditLogPath = join(auditRoot, "audit", "audit.log");
  const request = await createContourAdminDeployRequest({
    auditLogPath,
    actor: "admin:qa-admin",
    requestId: "deploy-request-qa",
    now: new Date("2026-07-22T00:00:00.000Z"),
  });
  const events = (await readFile(auditLogPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(request.requestId, "deploy-request-qa");
  assert.deepEqual(events, [{
    createdAt: "2026-07-22T00:00:00.000Z",
    action: "contour-admin:deploy-to-pilot-request",
    status: "requested",
    requestId: "deploy-request-qa",
    actor: "admin:qa-admin",
    source: "git-main",
    target: "pilot",
    deployExecuted: false,
  }]);
  await assert.rejects(() => createContourAdminDeployRequest({ actor: "admin:qa-admin" }), /audit is unavailable/);

  const handlerAuditLogPath = join(auditRoot, "handler-audit", "audit.log");
  let commandRuns = 0;
  const runCommand = async () => {
    commandRuns += 1;
    return { code: 0, timedOut: false, durationMs: 1, stdout: "qa", stderr: "" };
  };
  const missingContentType = await callHandler(mutationRequest({ contentType: "" }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(missingContentType.statusCode, 415);
  assert.equal(missingContentType.json.code, "json-content-type-required");
  const wrongContentType = await callHandler(mutationRequest({ contentType: "text/plain" }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(wrongContentType.statusCode, 415);
  const missingOrigin = await callHandler(mutationRequest({ origin: "" }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(missingOrigin.statusCode, 403);
  const siblingOrigin = await callHandler(mutationRequest({
    body: { action: "promote-pilot-to-stage", confirm: "promote-pilot-to-stage" },
    origin: "https://pilot.mes-line.ru",
    fetchSite: "same-site",
  }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(siblingOrigin.statusCode, 403);
  assert.equal(siblingOrigin.json.code, "same-origin-required");
  const forgedFetchSite = await callHandler(mutationRequest({ fetchSite: "same-site" }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(forgedFetchSite.statusCode, 403);
  const wrongExactOrigin = await callHandler(mutationRequest({ origin: "http://localhost:4443" }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(wrongExactOrigin.statusCode, 403);
  assert.equal(commandRuns, 0, "rejected CSRF requests must never reach an Ops command or audit write");

  const acceptedRequest = await callHandler(mutationRequest(), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(acceptedRequest.statusCode, 202);
  assert.equal(acceptedRequest.json.status, "requested");
  const acceptedCommand = await callHandler(mutationRequest({ body: { action: "backup-stage-shared-state" } }), { auditLogPath: handlerAuditLogPath, runCommand });
  assert.equal(acceptedCommand.statusCode, 200);
  assert.equal(commandRuns, 1, "one same-origin JSON Ops request must reach the injected command owner exactly once");
} finally {
  await rm(auditRoot, { recursive: true, force: true });
}
console.log("Contour Admin React runtime policy QA passed.");
