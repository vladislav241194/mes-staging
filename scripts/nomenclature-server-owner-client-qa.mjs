import assert from "node:assert/strict";

import { createNomenclatureServerOwnerClient } from "../src/modules/nomenclature/server_owner_client.js";
import { handlePublicAuthRequest } from "./public-auth-guard.mjs";

function headers(values = {}) {
  const entries = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get: (name) => entries[String(name).toLowerCase()] || "" };
}

function response(status, payload, { etag = "", contentType = "application/json; charset=utf-8", retryAfter = "" } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: headers({ "content-type": contentType, etag, "retry-after": retryAfter }),
    json: async () => payload,
  };
}

function directory(rows) {
  return {
    nomenclature: rows,
    nomenclatureTypes: [{ id: "type-mech", name: "Механика" }],
    bomLists: [],
    specifications: [],
    statuses: [{ id: "active", name: "Активен" }],
  };
}

function commandPayload({
  kind,
  item,
  revision,
  commandRevision = revision,
  baseRevision = revision - 1,
  rows,
  replayed = false,
  superseded = false,
}) {
  return {
    apiVersion: "v1",
    ok: true,
    kind,
    itemId: item.id,
    item,
    revision,
    commandRevision,
    baseRevision,
    replayed,
    superseded,
    rebased: baseRevision < commandRevision - 1,
    unlinkedReferences: { bom: 0, specifications: 0 },
    actorId: "employee:employee-qa",
    projection: {
      revision,
      updatedAt: `2026-07-21T05:00:0${revision}.000Z`,
      directory: directory(rows),
    },
  };
}

const actorPayload = {
  id: "employee:employee-qa",
  employeeId: "employee-qa",
  displayName: "Сотрудник QA",
  personnelNumber: "QA-1",
  hiddenCredential: "must-not-escape",
};
const createdRow = { id: "nom-created", name: "Кронштейн", type: "Механика", updatedAt: "2026-07-21T05:00:08.000Z" };
const updatedRow = { ...createdRow, name: "Кронштейн 2", updatedAt: "2026-07-21T05:00:09.000Z" };
const calls = [];
const replies = [
  response(200, { ok: true, authenticated: true, actor: actorPayload }),
  response(200, { ok: true, authenticated: true, actor: actorPayload }),
  response(200, { ok: true, authenticated: false }),
  response(200, {
    ok: true,
    authenticated: true,
    actor: actorPayload,
    rbacRevision: 41,
    authorizationReason: "allowed-by-role",
    capabilities: {
      canViewNomenclature: true,
      canEditNomenclature: true,
      canCreateNomenclature: true,
      canDeleteNomenclature: true,
      serverCommandsConfigured: true,
      serverCommandsEnabled: true,
    },
  }),
  response(201, commandPayload({ kind: "create", item: createdRow, revision: 8, rows: [createdRow] }), { etag: '"8"' }),
  response(200, commandPayload({ kind: "update", item: updatedRow, revision: 9, rows: [updatedRow] }), { etag: '"9"' }),
  response(200, commandPayload({ kind: "delete", item: updatedRow, revision: 10, rows: [] }), { etag: '"10"' }),
];
const client = createNomenclatureServerOwnerClient({
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const next = replies.shift();
    assert(next, `unexpected request ${options.method} ${url}`);
    return next;
  },
});

const currentSession = await client.getEmployeeSession();
assert(currentSession.ok && currentSession.authenticated && currentSession.actor.id === "employee:employee-qa");
assert.equal(currentSession.actor.hiddenCredential, undefined, "session normalization must whitelist public actor fields");
const openedSession = await client.createEmployeeSession({ employeeId: "employee-qa", pin: "55555", actor: "forged", role: "admin" });
assert(openedSession.ok && openedSession.authenticated);
const closedSession = await client.deleteEmployeeSession();
assert(closedSession.ok && !closedSession.authenticated);
const capability = await client.getCapabilities();
assert(capability.ok && capability.enabled && capability.rbacRevision === 41 && capability.capabilities.serverCommandsEnabled);

const created = await client.createNomenclature({
  row: { id: "nom-created", name: "Кронштейн", type: "Механика" },
  expectedRevision: 7,
  idempotencyKey: "create-qa-1",
  actor: "employee:forged",
  role: "admin",
  authorization: { allowed: true },
});
assert(created.ok && created.revision === 8 && created.projection.directory.nomenclature[0].id === "nom-created");
assert.equal(created.superseded, false);
const updated = await client.updateNomenclature({
  itemId: "nom-created",
  row: { ...createdRow, name: "Кронштейн 2" },
  expectedRow: createdRow,
  expectedRevision: 8,
  idempotencyKey: "update-qa-1",
});
assert(updated.ok && updated.revision === 9 && updated.item.name === "Кронштейн 2");
const deleted = await client.deleteNomenclature({
  itemId: "nom-created",
  expectedRow: updatedRow,
  expectedRevision: 9,
  idempotencyKey: "delete-qa-1",
});
assert(deleted.ok && deleted.revision === 10 && !deleted.projection.directory.nomenclature.length);

assert.equal(calls.length, 7);
assert(calls.every(({ options }) => options.credentials === "same-origin" && options.cache === "no-store" && options.redirect === "error"));
assert(calls.every(({ options }) => options.headers.Accept === "application/json"));
assert.deepEqual(JSON.parse(calls[1].options.body), { employeeId: "employee-qa", pin: "55555" }, "session login body must contain credentials only");
assert.equal(calls[1].options.headers["Content-Type"], "application/json");
assert.equal(calls[2].options.body, undefined, "session logout must not send a body");

const commandCalls = calls.slice(4);
assert.deepEqual(commandCalls.map(({ options }) => options.method), ["POST", "PATCH", "DELETE"]);
assert.deepEqual(commandCalls.map(({ options }) => options.headers["If-Match"]), ['"7"', '"8"', '"9"']);
assert.deepEqual(commandCalls.map(({ options }) => options.headers["Idempotency-Key"]), ["create-qa-1", "update-qa-1", "delete-qa-1"]);
assert(commandCalls.every(({ options }) => options.headers["Content-Type"] === "application/json"));
for (const { options } of commandCalls) {
  const body = JSON.parse(options.body);
  assert.equal(body.actor, undefined);
  assert.equal(body.role, undefined);
  assert.equal(body.authorization, undefined);
  assert.equal(body.employeeId, undefined);
  assert.equal(body.idempotencyKey, undefined, "idempotency authority belongs only in the header");
}
assert.deepEqual(Object.keys(JSON.parse(commandCalls[0].options.body)).sort(), ["expectedRevision", "row"]);
assert.deepEqual(Object.keys(JSON.parse(commandCalls[1].options.body)).sort(), ["expectedRevision", "expectedRow", "row"]);
assert.deepEqual(Object.keys(JSON.parse(commandCalls[2].options.body)).sort(), ["expectedRevision", "expectedRow"]);

assert.throws(() => createNomenclatureServerOwnerClient({ sessionUrl: "https://evil.example/session" }), /same-origin/);
assert.throws(() => createNomenclatureServerOwnerClient({ commandsUrl: "//evil.example/api" }), /same-origin/);

let invalidInputCalls = 0;
const invalidInputClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => { invalidInputCalls += 1; } });
const invalidRevision = await invalidInputClient.createNomenclature({ row: createdRow, expectedRevision: -1, idempotencyKey: "key" });
const invalidKey = await invalidInputClient.deleteNomenclature({ itemId: createdRow.id, expectedRow: createdRow, expectedRevision: 1, idempotencyKey: "contains space" });
const coercedRevisions = await Promise.all([null, "", false, "7"].map((expectedRevision) => invalidInputClient.createNomenclature({
  row: createdRow,
  expectedRevision,
  idempotencyKey: `coerced-${String(expectedRevision)}`,
})));
const overlongItemId = "x".repeat(161);
const invalidLongId = await invalidInputClient.createNomenclature({
  row: { ...createdRow, id: overlongItemId },
  expectedRevision: 7,
  idempotencyKey: "long-id",
});
assert(!invalidRevision.ok && invalidRevision.category === "validation" && invalidRevision.failClosed);
assert(!invalidKey.ok && invalidKey.category === "validation" && invalidInputCalls === 0, "invalid commands must never reach fetch");
assert(coercedRevisions.every((result) => !result.ok && result.category === "validation"), "JSON revision inputs must not coerce null, empty, boolean or string values");
assert(!invalidLongId.ok && invalidLongId.category === "validation" && invalidInputCalls === 0, "overlong raw ids must be rejected before fetch instead of truncated");

const malformedSuccess = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(
  201,
  commandPayload({ kind: "create", item: createdRow, revision: 8, rows: [createdRow] }),
  { etag: '"9"' },
) });
const malformed = await malformedSuccess.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "malformed-response" });
assert(!malformed.ok && malformed.category === "protocol" && malformed.code === "invalid-server-response", "mismatched ETag/projection metadata must fail closed");

const replayedCurrentClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(
  200,
  commandPayload({ kind: "create", item: createdRow, revision: 9, commandRevision: 8, baseRevision: 7, rows: [createdRow], replayed: true }),
  { etag: '"9"' },
) });
const replayedCurrent = await replayedCurrentClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "replay-current" });
assert(replayedCurrent.ok && replayedCurrent.replayed && !replayedCurrent.superseded && replayedCurrent.commandRevision === 8 && replayedCurrent.revision === 9);

const interveningRow = { ...createdRow, name: "Изменено после команды", updatedAt: "2026-07-21T05:00:09.000Z" };
const supersededReplayClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(
  200,
  commandPayload({ kind: "create", item: createdRow, revision: 9, commandRevision: 8, baseRevision: 7, rows: [interveningRow], replayed: true, superseded: true }),
  { etag: '"9"' },
) });
const supersededReplay = await supersededReplayClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "replay-superseded" });
assert(supersededReplay.ok && supersededReplay.replayed && supersededReplay.superseded && supersededReplay.projection.directory.nomenclature[0].name === interveningRow.name,
  "a replay may return the current projection after an intervening same-id change only when it is explicitly superseded");

const recreatedAfterDelete = { ...updatedRow, name: "Создано заново", updatedAt: "2026-07-21T05:00:11.000Z" };
const supersededDeleteClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(
  200,
  commandPayload({ kind: "delete", item: updatedRow, revision: 11, commandRevision: 10, baseRevision: 9, rows: [recreatedAfterDelete], replayed: true, superseded: true }),
  { etag: '"11"' },
) });
const supersededDelete = await supersededDeleteClient.deleteNomenclature({ itemId: updatedRow.id, expectedRow: updatedRow, expectedRevision: 9, idempotencyKey: "delete-replay-superseded" });
assert(supersededDelete.ok && supersededDelete.superseded && supersededDelete.projection.directory.nomenclature[0].name === "Создано заново");

for (const payload of [
  commandPayload({ kind: "create", item: createdRow, revision: 8, rows: [createdRow], superseded: true }),
  commandPayload({ kind: "create", item: createdRow, revision: 9, commandRevision: 8, baseRevision: 7, rows: [interveningRow], replayed: true, superseded: false }),
]) {
  const contradictoryReplayClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(payload.replayed ? 200 : 201, payload, { etag: `"${payload.revision}"` }) });
  const contradictoryReplay = await contradictoryReplayClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "contradictory-replay" });
  assert(!contradictoryReplay.ok && contradictoryReplay.category === "protocol", "superseded must agree with replay status and the current projection");
}

const longPrefix = "p".repeat(160);
const prefixCollisionProjectionClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(
  201,
  commandPayload({
    kind: "create",
    item: createdRow,
    revision: 8,
    rows: [createdRow, { ...createdRow, id: `${longPrefix}a` }, { ...createdRow, id: `${longPrefix}b` }],
  }),
  { etag: '"8"' },
) });
const prefixCollisionProjection = await prefixCollisionProjectionClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "prefix-collision" });
assert(!prefixCollisionProjection.ok && prefixCollisionProjection.category === "protocol", "overlong prefix-colliding projection ids must be rejected, never truncated into aliases");

for (const invalidRevisionPayload of [null, "8", false]) {
  const invalidNumericResponseClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => {
    const payload = commandPayload({ kind: "create", item: createdRow, revision: 8, rows: [createdRow] });
    payload.revision = invalidRevisionPayload;
    return response(201, payload, { etag: '"8"' });
  } });
  const invalidNumericResponse = await invalidNumericResponseClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "invalid-numeric-response" });
  assert(!invalidNumericResponse.ok && invalidNumericResponse.category === "protocol", "server JSON revisions must be explicit safe non-negative numbers");
}

const contradictoryCapability = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(200, {
  ok: true,
  authenticated: false,
  actor: null,
  rbacRevision: 0,
  authorizationReason: "employee-session-required",
  capabilities: {
    canViewNomenclature: false,
    canEditNomenclature: false,
    canCreateNomenclature: false,
    canDeleteNomenclature: false,
    serverCommandsConfigured: true,
    serverCommandsEnabled: true,
  },
}) });
const contradictory = await contradictoryCapability.getCapabilities();
assert(!contradictory.ok && contradictory.category === "protocol", "unauthenticated command capability must be rejected instead of trusted");

const conflictProjection = {
  revision: 12,
  updatedAt: "2026-07-21T05:00:12.000Z",
  directory: directory([updatedRow]),
};
const conflictClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(409, {
  ok: false,
  code: "same-row-conflict",
  error: "Nomenclature item changed after it was read",
  revision: 12,
  projection: conflictProjection,
}, { etag: '"12"' }) });
const conflict = await conflictClient.updateNomenclature({
  itemId: createdRow.id,
  row: updatedRow,
  expectedRow: createdRow,
  expectedRevision: 8,
  idempotencyKey: "conflict-qa",
});
assert(!conflict.ok && conflict.conflict && conflict.category === "conflict" && conflict.currentRevision === 12 && conflict.projection.revision === 12);

const authenticationClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(401, { ok: false, error: "public-session-required" }) });
const authenticationFailure = await authenticationClient.getEmployeeSession();
assert(!authenticationFailure.ok && authenticationFailure.authenticationRequired && authenticationFailure.category === "authentication");
let plainText401Parsed = false;
const plainTextAuthenticationClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => ({
  status: 401,
  ok: false,
  headers: headers({ "content-type": "text/plain; charset=utf-8" }),
  json: async () => { plainText401Parsed = true; throw new Error("not JSON"); },
}) });
const plainTextAuthenticationFailure = await plainTextAuthenticationClient.getEmployeeSession();
assert(!plainTextAuthenticationFailure.ok && plainTextAuthenticationFailure.authenticationRequired && plainTextAuthenticationFailure.category === "authentication" && !plainText401Parsed,
  "outer public-auth text/plain 401 must map to authentication before attempting JSON parsing");

const perimeterClient = createNomenclatureServerOwnerClient({
  fetchImpl: async (url, options = {}) => {
    const request = {
      method: options.method || "GET",
      headers: { host: "pilot.mes-line.ru" },
    };
    const captured = { status: 0, headers: {}, body: "" };
    const response = {
      writeHead(status, responseHeaderValues = {}) { captured.status = status; captured.headers = responseHeaderValues; },
      end(body = "") { captured.body = String(body); },
    };
    const handled = await handlePublicAuthRequest(
      request,
      response,
      new URL(url, "https://pilot.mes-line.ru"),
      (contentType) => ({ "Content-Type": contentType, "Cache-Control": "no-store" }),
      {
        MES_PUBLIC_AUTH_HOSTS: "pilot.mes-line.ru",
        MES_PUBLIC_AUTH_PASSWORD_HASH: "configured-for-route-qa",
        MES_PUBLIC_AUTH_SESSION_SECRET: "public-route-secret",
      },
    );
    assert.equal(handled, true);
    return {
      status: captured.status,
      ok: captured.status >= 200 && captured.status < 300,
      headers: headers(captured.headers),
      json: async () => JSON.parse(captured.body),
    };
  },
});
const perimeterAuthenticationFailure = await perimeterClient.getCapabilities();
assert(!perimeterAuthenticationFailure.ok && perimeterAuthenticationFailure.status === 401
  && perimeterAuthenticationFailure.authenticationRequired && perimeterAuthenticationFailure.category === "authentication",
"the real outer public-auth route and server-owner client must agree on its text/plain 401 contract");
const authorizationClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(403, { ok: false, code: "nomenclature-write-forbidden", error: "Forbidden" }) });
const authorizationFailure = await authorizationClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: "forbidden-qa" });
assert(!authorizationFailure.ok && authorizationFailure.authorizationDenied && !authorizationFailure.retryable);
for (const code of ["same-origin-required", "cross-site-request-rejected"]) {
  const securityClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(403, { ok: false, code, error: "Rejected request context" }) });
  const securityFailure = await securityClient.createNomenclature({ row: createdRow, expectedRevision: 7, idempotencyKey: `security-${code}` });
  assert(!securityFailure.ok && securityFailure.category === "security" && !securityFailure.authorizationDenied, "request-context 403 must not be represented as an RBAC denial");
}
const unavailableClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => response(503, { ok: false, code: "nomenclature-authorization-unavailable", error: "RBAC unavailable" }) });
const unavailable = await unavailableClient.getCapabilities();
assert(!unavailable.ok && unavailable.unavailable && unavailable.retryable && unavailable.category === "unavailable");
const networkClient = createNomenclatureServerOwnerClient({ fetchImpl: async () => { throw new Error("offline"); } });
const network = await networkClient.getCapabilities();
assert(!network.ok && network.code === "network-unavailable" && network.retryable && network.failClosed);

console.log("Nomenclature server-owner client QA: OK");
console.log("- employee session lifecycle and capability normalization: pass");
console.log("- same-origin credentials, exact JSON and no body authority: pass");
console.log("- quoted If-Match, Idempotency-Key and authoritative projection validation: pass");
console.log("- validation, authentication, authorization, conflict, protocol and unavailable mapping: pass");
