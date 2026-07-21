import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import {
  createNomenclatureTypesServerOwnerClient,
  prepareNomenclatureTypeDeleteContract,
} from "../src/modules/nomenclature_types/server_owner_client.js";
import { inspectNomenclatureTypeImpact } from "./directory-cluster-type-reducer.mjs";

const fingerprint = `sha256:${"a".repeat(64)}`;

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

const fallbackRow = {
  id: "type-rea",
  name: "РЭА компоненты",
  code: "REA",
  status: "Активен",
  hidden: { source: "legacy" },
};
const originalRow = {
  id: "type-mech",
  name: "Механика",
  code: "MECH",
  status: "Активен",
  hidden: { source: "legacy", revision: 4 },
};
const createdRow = {
  id: "type-cable",
  name: "Кабельные сборки",
  code: "CABLE",
  status: "Активен",
  hidden: { source: "react" },
};
const updatedRow = {
  ...originalRow,
  name: "Механические изделия",
  code: "MECH-2",
};

function directory(typeRows, { nomenclatureType = "Механика" } = {}) {
  return {
    topLevelUnknown: { preserve: true },
    nomenclatureTypes: typeRows,
    nomenclature: [{ id: "nom-a", name: "Корпус", type: nomenclatureType, hidden: { preserve: true } }],
    bomLists: [{ id: "bom-a", importRows: [], hidden: { preserve: true } }],
    specifications: [{
      id: "spec-a",
      structureItems: [{ id: "line-a", nomenclatureType, hidden: { preserve: true } }],
    }],
  };
}

function impactSnapshot(row, { nomenclatureRows = 0, specificationRows = 0, value = fingerprint } = {}) {
  return {
    itemId: row.id,
    typeName: row.name,
    fingerprint: value,
    counts: {
      nomenclatureRows,
      specificationRows,
      totalReferences: nomenclatureRows + specificationRows,
    },
    references: {
      nomenclature: Array.from({ length: nomenclatureRows }, (_entry, index) => ({ index, itemId: `nom-${index}` })),
      specifications: Array.from({ length: specificationRows }, (_entry, index) => ({
        specificationIndex: 0,
        specificationId: "spec-a",
        structureItemIndex: index,
        structureItemId: `line-${index}`,
      })),
    },
  };
}

function counts(kind, { nomenclatureRows = 0, specificationRows = 0 } = {}) {
  return {
    typeRowsCreated: kind === "create" ? 1 : 0,
    typeRowsUpdated: kind === "update" ? 1 : 0,
    typeRowsDeleted: kind === "delete" ? 1 : 0,
    nomenclatureRowsRetyped: nomenclatureRows,
    specificationRowsRetyped: specificationRows,
    totalReferencesRetyped: nomenclatureRows + specificationRows,
  };
}

function successPayload({
  kind,
  row,
  revision,
  currentDirectory,
  idempotentReplay = false,
  before = null,
  after = null,
  commandCounts = counts(kind),
  commandRevision = revision,
  baseRevision = commandRevision - 1,
  idempotencyKey,
  receiptSuffix = "1",
}) {
  return {
    ok: true,
    apiVersion: "v1",
    kind,
    itemId: row.id,
    revision,
    directory: currentDirectory,
    row,
    counts: commandCounts,
    impact: { before, after },
    receipt: {
      id: `receipt-${receiptSuffix}`,
      commandRevision,
      baseRevision,
      rebased: baseRevision < commandRevision - 1,
      actorId: "employee:employee-qa",
      kind,
      itemId: row.id,
      idempotencyKey,
    },
    idempotentReplay,
  };
}

const actor = {
  id: "employee:employee-qa",
  employeeId: "employee-qa",
  displayName: "Сотрудник QA",
  personnelNumber: "QA-1",
  secret: "must-not-escape",
};

const previewDirectory = directory([fallbackRow, originalRow]);
const previewBefore = JSON.stringify(previewDirectory);
const preparedDelete = await prepareNomenclatureTypeDeleteContract({
  directory: previewDirectory,
  itemId: originalRow.id,
  fallbackTypeId: fallbackRow.id,
  cryptoImpl: webcrypto,
});
const serverDeleteImpact = inspectNomenclatureTypeImpact(previewDirectory, originalRow.id);
assert(preparedDelete.ok && serverDeleteImpact.ok);
assert.equal(preparedDelete.impactFingerprint, serverDeleteImpact.fingerprint, "Browser preview SHA-256 must be byte-compatible with the server reducer");
assert.equal(preparedDelete.nomenclatureCount, serverDeleteImpact.counts.nomenclatureRows);
assert.equal(preparedDelete.specificationRowsCount, serverDeleteImpact.counts.specificationRows);
assert.deepEqual(preparedDelete.expectedRow, originalRow);
assert.deepEqual(preparedDelete.fallbackExpectedRow, fallbackRow);
assert.equal(JSON.stringify(previewDirectory), previewBefore, "Delete preview must not mutate the complete Directory projection");
const unavailableFingerprint = await prepareNomenclatureTypeDeleteContract({
  directory: previewDirectory,
  itemId: originalRow.id,
  fallbackTypeId: fallbackRow.id,
  cryptoImpl: {},
});
assert(!unavailableFingerprint.ok && unavailableFingerprint.code === "impact-fingerprint-unavailable" && unavailableFingerprint.failClosed);

const calls = [];
const replies = [
  response(200, {
    ok: true,
    apiVersion: "v1",
    authenticated: true,
    actor,
    rbacRevision: 41,
    directoryRevision: 7,
    authorizationReason: "allowed-by-role",
    capabilities: {
      canViewNomenclatureTypes: true,
      canEditNomenclatureTypes: true,
      canCreateNomenclatureTypes: true,
      canDeleteNomenclatureTypes: true,
      serverCommandsConfigured: true,
      serverCommandsEnabled: true,
    },
  }),
  response(201, successPayload({
    kind: "create",
    row: createdRow,
    revision: 8,
    currentDirectory: directory([fallbackRow, originalRow, createdRow]),
    after: impactSnapshot(createdRow),
    baseRevision: 7,
    idempotencyKey: "type-create-qa",
  }), { etag: '"8"' }),
  response(200, successPayload({
    kind: "update",
    row: updatedRow,
    revision: 9,
    currentDirectory: directory([fallbackRow, updatedRow, createdRow], { nomenclatureType: updatedRow.name }),
    before: impactSnapshot(originalRow, { nomenclatureRows: 1, specificationRows: 1 }),
    after: impactSnapshot(updatedRow, { nomenclatureRows: 1, specificationRows: 1, value: `sha256:${"b".repeat(64)}` }),
    commandCounts: counts("update", { nomenclatureRows: 1, specificationRows: 1 }),
    baseRevision: 8,
    idempotencyKey: "type-update-qa",
    receiptSuffix: "2",
  }), { etag: '"9"' }),
  response(200, successPayload({
    kind: "delete",
    row: updatedRow,
    revision: 10,
    currentDirectory: directory([fallbackRow, createdRow], { nomenclatureType: fallbackRow.name }),
    before: impactSnapshot(updatedRow, { nomenclatureRows: 1, specificationRows: 1 }),
    after: null,
    commandCounts: counts("delete", { nomenclatureRows: 1, specificationRows: 1 }),
    baseRevision: 9,
    idempotencyKey: "type-delete-qa",
    receiptSuffix: "3",
  }), { etag: '"10"' }),
];

const client = createNomenclatureTypesServerOwnerClient({
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const next = replies.shift();
    assert(next, `Unexpected ${options.method} ${url}`);
    return next;
  },
});

const capability = await client.getCapabilities();
assert(capability.ok && capability.enabled && capability.directoryRevision === 7 && capability.rbacRevision === 41);
assert.equal(capability.actor.secret, undefined, "Capability actor must be normalized through an explicit public whitelist");

const created = await client.createNomenclatureType({
  itemId: createdRow.id,
  row: createdRow,
  expectedRevision: 7,
  idempotencyKey: "type-create-qa",
  actor: "employee:forged",
  authorization: { admin: true },
});
assert(created.ok && created.revision === 8 && created.directory.nomenclatureTypes.at(-1).id === createdRow.id);

const updated = await client.updateNomenclatureType({
  itemId: originalRow.id,
  expectedRow: originalRow,
  row: updatedRow,
  expectedRevision: 8,
  idempotencyKey: "type-update-qa",
});
assert(updated.ok && updated.revision === 9 && updated.counts.totalReferencesRetyped === 2);

const deleted = await client.deleteNomenclatureType({
  itemId: updatedRow.id,
  expectedRow: updatedRow,
  fallbackTypeId: fallbackRow.id,
  fallbackExpectedRow: fallbackRow,
  impactFingerprint: fingerprint,
  expectedRevision: 9,
  idempotencyKey: "type-delete-qa",
});
assert(deleted.ok && deleted.revision === 10 && deleted.directory.nomenclatureTypes.every((row) => row.id !== updatedRow.id));

assert.equal(calls.length, 4);
assert.deepEqual(calls.map(({ url }) => url), [
  "/api/v1/directory/nomenclature-types/capabilities",
  "/api/v1/directory/nomenclature-types",
  "/api/v1/directory/nomenclature-types",
  "/api/v1/directory/nomenclature-types",
]);
assert(calls.every(({ options }) => options.credentials === "same-origin" && options.cache === "no-store" && options.redirect === "error"));
assert(calls.every(({ options }) => options.headers.Accept === "application/json"));
assert.equal(calls[0].options.body, undefined);
const commandCalls = calls.slice(1);
assert(commandCalls.every(({ options }) => options.method === "POST" && options.headers["Content-Type"] === "application/json"));
assert.deepEqual(commandCalls.map(({ options }) => options.headers["If-Match"]), ['"7"', '"8"', '"9"']);
assert.deepEqual(commandCalls.map(({ options }) => options.headers["Idempotency-Key"]), ["type-create-qa", "type-update-qa", "type-delete-qa"]);
const bodies = commandCalls.map(({ options }) => JSON.parse(options.body));
assert.deepEqual(Object.keys(bodies[0]).sort(), ["expectedRevision", "itemId", "kind", "row"]);
assert.deepEqual(Object.keys(bodies[1]).sort(), ["expectedRevision", "expectedRow", "itemId", "kind", "row"]);
assert.deepEqual(Object.keys(bodies[2]).sort(), [
  "expectedRevision",
  "expectedRow",
  "fallbackExpectedRow",
  "fallbackTypeId",
  "impactFingerprint",
  "itemId",
  "kind",
]);
for (const body of bodies) {
  assert.equal(body.actor, undefined);
  assert.equal(body.authorization, undefined);
  assert.equal(body.employeeId, undefined);
  assert.equal(body.idempotencyKey, undefined, "Idempotency authority belongs only in the header");
}
assert.deepEqual(bodies[2].expectedRow, updatedRow);
assert.deepEqual(bodies[2].fallbackExpectedRow, fallbackRow);
assert.equal(bodies[2].impactFingerprint, fingerprint);

assert.throws(() => createNomenclatureTypesServerOwnerClient({ commandsUrl: "https://evil.example/api" }), /same-origin/);
assert.throws(() => createNomenclatureTypesServerOwnerClient({ capabilitiesUrl: "//evil.example/capabilities" }), /same-origin/);
assert.throws(() => createNomenclatureTypesServerOwnerClient({ commandsUrl: "/api/path?mode=unsafe" }), /without query/);

let invalidCalls = 0;
const invalidClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => { invalidCalls += 1; } });
const invalidInputs = await Promise.all([
  invalidClient.createNomenclatureType({ itemId: createdRow.id, row: createdRow, expectedRevision: "7", idempotencyKey: "invalid-revision" }),
  invalidClient.updateNomenclatureType({ itemId: originalRow.id, row: updatedRow, expectedRow: null, expectedRevision: 7, idempotencyKey: "missing-baseline" }),
  invalidClient.deleteNomenclatureType({ itemId: originalRow.id, expectedRow: originalRow, fallbackTypeId: fallbackRow.id, fallbackExpectedRow: fallbackRow, impactFingerprint: "stale", expectedRevision: 7, idempotencyKey: "bad-impact" }),
  invalidClient.deleteNomenclatureType({ itemId: originalRow.id, expectedRow: originalRow, fallbackTypeId: originalRow.id, fallbackExpectedRow: originalRow, impactFingerprint: fingerprint, expectedRevision: 7, idempotencyKey: "same-fallback" }),
  invalidClient.createNomenclatureType({ itemId: " padded ", row: { ...createdRow, id: " padded " }, expectedRevision: 7, idempotencyKey: "padded-id" }),
]);
assert(invalidInputs.every((result) => !result.ok && result.failClosed && result.category === "validation"));
assert.equal(invalidCalls, 0, "Invalid command contracts must never reach fetch");

const lostCalls = [];
let lostAttempt = 0;
const lostClient = createNomenclatureTypesServerOwnerClient({
  fetchImpl: async (url, options) => {
    lostCalls.push({ url, options });
    lostAttempt += 1;
    if (lostAttempt === 1) throw new Error("response lost after commit");
    return response(200, successPayload({
      kind: "create",
      row: createdRow,
      revision: 8,
      currentDirectory: directory([fallbackRow, originalRow, createdRow]),
      idempotentReplay: true,
      after: impactSnapshot(createdRow),
      baseRevision: 7,
      idempotencyKey: "lost-create-qa",
      receiptSuffix: "lost",
    }), { etag: '"8"' });
  },
});
const stableCreateInput = {
  itemId: createdRow.id,
  row: { ...createdRow, hidden: { revision: 7, source: "react" } },
  expectedRevision: 7,
  idempotencyKey: "lost-create-qa",
};
const lost = await lostClient.createNomenclatureType(stableCreateInput);
assert(!lost.ok && lost.retryable && lost.code === "network-unavailable");
const recovered = await lostClient.createNomenclatureType({
  ...stableCreateInput,
  row: { id: createdRow.id, status: createdRow.status, code: createdRow.code, name: createdRow.name, hidden: { source: "react", revision: 7 } },
});
assert(recovered.ok && recovered.idempotentReplay && !recovered.superseded);
assert.equal(lostCalls.length, 2);
assert.equal(lostCalls[0].options.body, lostCalls[1].options.body, "Lost-response retry must preserve exact canonical JSON bytes");
assert.equal(lostCalls[0].options.headers["If-Match"], lostCalls[1].options.headers["If-Match"]);
assert.equal(lostCalls[0].options.headers["Idempotency-Key"], lostCalls[1].options.headers["Idempotency-Key"]);

const beforeReusedKeyCalls = lostCalls.length;
const reusedKey = await lostClient.createNomenclatureType({
  ...stableCreateInput,
  row: { ...stableCreateInput.row, name: "Different command" },
});
assert(!reusedKey.ok && reusedKey.code === "idempotency-key-reused" && reusedKey.category === "validation");
assert.equal(lostCalls.length, beforeReusedKeyCalls, "A reused key with different bytes must fail before fetch");

const laterRow = { ...updatedRow, name: "Изменено после потерянного ответа" };
const supersededPayload = successPayload({
  kind: "update",
  row: updatedRow,
  revision: 12,
  currentDirectory: directory([fallbackRow, laterRow], { nomenclatureType: laterRow.name }),
  idempotentReplay: true,
  before: impactSnapshot(originalRow, { nomenclatureRows: 1, specificationRows: 1 }),
  after: impactSnapshot(updatedRow, { nomenclatureRows: 1, specificationRows: 1, value: `sha256:${"b".repeat(64)}` }),
  commandCounts: counts("update", { nomenclatureRows: 1, specificationRows: 1 }),
  commandRevision: 9,
  baseRevision: 8,
  idempotencyKey: "superseded-update",
  receiptSuffix: "superseded",
});
Object.assign(supersededPayload, {
  ok: false,
  code: "superseded-idempotent-replay",
  error: "The idempotent Directory command receipt was superseded",
  conflict: true,
  superseded: true,
});
const supersededClient = createNomenclatureTypesServerOwnerClient({
  fetchImpl: async () => response(409, supersededPayload, { etag: '"12"' }),
});
const superseded = await supersededClient.updateNomenclatureType({
  itemId: originalRow.id,
  expectedRow: originalRow,
  row: updatedRow,
  expectedRevision: 8,
  idempotencyKey: "superseded-update",
});
assert(!superseded.ok && superseded.conflict && superseded.superseded && superseded.idempotentReplay);
assert.equal(superseded.projection.revision, 12);
assert.equal(superseded.projection.directory.nomenclatureTypes.find((row) => row.id === originalRow.id).name, laterRow.name);

const malformedClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => response(201, successPayload({
  kind: "create",
  row: createdRow,
  revision: 8,
  currentDirectory: directory([fallbackRow, originalRow, createdRow]),
  after: impactSnapshot(createdRow),
  baseRevision: 7,
  idempotencyKey: "weak-etag",
}), { etag: 'W/"8"' }) });
const malformed = await malformedClient.createNomenclatureType({
  itemId: createdRow.id,
  row: createdRow,
  expectedRevision: 7,
  idempotencyKey: "weak-etag",
});
assert(!malformed.ok && malformed.category === "protocol" && malformed.code === "invalid-server-response");

const invalidProjectionMutations = [
  (value) => { value.nomenclatureTypes[0].name = ""; },
  (value) => { value.nomenclatureTypes.push({ ...value.nomenclatureTypes[0] }); },
  (value) => { value.nomenclature[0].type = "Несуществующий тип"; },
  (value) => { value.nomenclature[0].sourceBomIds = ["missing-board"]; },
  (value) => { value.bomLists.push({ id: "bom-a", importRows: [] }); },
  (value) => { value.bomLists[0].importRows = [{ id: "bom-row-a", values: [], nomenclatureId: "missing-nomenclature" }]; },
  (value) => { value.specifications.push({ id: "spec-a", structureItems: [] }); },
  (value) => { value.specifications[0].structureItems.push({ id: "line-a", nomenclatureType: originalRow.name }); },
  (value) => { value.specifications[0].structureItems[0].bomListId = "missing-board"; },
  (value) => { value.specifications[0].structureItems[0].nomenclatureId = "missing-nomenclature"; },
  (value) => { value.specifications[0].structureItems = [{ id: "line-a", parentId: "line-b" }, { id: "line-b", parentId: "line-a" }]; },
  (value) => {
    value.specifications[0].structureItems[0].specificationId = "spec-b";
    value.specifications.push({ id: "spec-b", structureItems: [{ id: "line-b", specificationId: "spec-a" }] });
  },
];
for (const [index, mutateProjection] of invalidProjectionMutations.entries()) {
  const idempotencyKey = `invalid-directory-projection-${index}`;
  const invalidDirectory = structuredClone(directory([fallbackRow, originalRow, createdRow]));
  mutateProjection(invalidDirectory);
  const invalidProjectionClient = createNomenclatureTypesServerOwnerClient({
    fetchImpl: async () => response(201, successPayload({
      kind: "create",
      row: createdRow,
      revision: 8,
      currentDirectory: invalidDirectory,
      after: impactSnapshot(createdRow),
      baseRevision: 7,
      idempotencyKey,
    }), { etag: '"8"' }),
  });
  const invalidProjection = await invalidProjectionClient.createNomenclatureType({
    itemId: createdRow.id,
    row: createdRow,
    expectedRevision: 7,
    idempotencyKey,
  });
  assert(!invalidProjection.ok && invalidProjection.category === "protocol", `Invalid authoritative Directory mutation ${index} must fail closed`);
}

const invalidReceiptMutations = [
  (receipt) => { receipt.actorId = "forged-admin"; },
  (receipt) => { receipt.commandRevision = 9; },
  (receipt) => { receipt.baseRevision = 6; },
  (receipt) => { receipt.rebased = true; },
  (receipt) => { receipt.kind = "delete"; },
  (receipt) => { receipt.itemId = fallbackRow.id; },
  (receipt) => { receipt.idempotencyKey = "different-key"; },
];
for (const [index, mutateReceipt] of invalidReceiptMutations.entries()) {
  const idempotencyKey = `invalid-receipt-${index}`;
  const payload = successPayload({
    kind: "create",
    row: createdRow,
    revision: 8,
    currentDirectory: directory([fallbackRow, originalRow, createdRow]),
    after: impactSnapshot(createdRow),
    baseRevision: 7,
    idempotencyKey,
  });
  mutateReceipt(payload.receipt);
  const invalidReceiptClient = createNomenclatureTypesServerOwnerClient({
    fetchImpl: async () => response(201, payload, { etag: '"8"' }),
  });
  const invalidReceipt = await invalidReceiptClient.createNomenclatureType({
    itemId: createdRow.id,
    row: createdRow,
    expectedRevision: 7,
    idempotencyKey,
  });
  assert(!invalidReceipt.ok && invalidReceipt.category === "protocol", `Receipt mutation ${index} must fail closed`);
}

const conflictDirectory = directory([fallbackRow, updatedRow], { nomenclatureType: updatedRow.name });
const conflictClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => response(409, {
  ok: false,
  code: "type-row-conflict",
  error: "The type changed after it was read",
  revision: 11,
  directory: conflictDirectory,
}, { etag: '"11"' }) });
const conflict = await conflictClient.updateNomenclatureType({
  itemId: originalRow.id,
  expectedRow: originalRow,
  row: updatedRow,
  expectedRevision: 8,
  idempotencyKey: "row-conflict",
});
assert(!conflict.ok && conflict.conflict && conflict.currentRevision === 11 && conflict.projection.directory === conflictDirectory);

const unauthenticatedClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => response(200, {
  ok: true,
  apiVersion: "v1",
  authenticated: false,
  actor: null,
  rbacRevision: 41,
  directoryRevision: 11,
  authorizationReason: "employee-session-required",
  capabilities: {
    canViewNomenclatureTypes: false,
    canEditNomenclatureTypes: false,
    canCreateNomenclatureTypes: false,
    canDeleteNomenclatureTypes: false,
    serverCommandsConfigured: true,
    serverCommandsEnabled: false,
  },
}) });
const unauthenticated = await unauthenticatedClient.getCapabilities();
assert(unauthenticated.ok && !unauthenticated.authenticated && !unauthenticated.enabled && unauthenticated.capabilities.serverCommandsConfigured);

const contradictoryCapabilityClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => response(200, {
  ok: true,
  apiVersion: "v1",
  authenticated: false,
  actor: null,
  rbacRevision: 41,
  directoryRevision: 11,
  authorizationReason: "contradictory",
  capabilities: {
    canViewNomenclatureTypes: false,
    canEditNomenclatureTypes: true,
    canCreateNomenclatureTypes: true,
    canDeleteNomenclatureTypes: true,
    serverCommandsConfigured: true,
    serverCommandsEnabled: true,
  },
}) });
const contradictoryCapability = await contradictoryCapabilityClient.getCapabilities();
assert(!contradictoryCapability.ok && contradictoryCapability.category === "protocol");

for (const [status, payload, expected] of [
  [401, { ok: false, code: "employee-session-required", error: "Session required" }, "authenticationRequired"],
  [403, { ok: false, code: "nomenclature-types-write-forbidden", error: "Forbidden" }, "authorizationDenied"],
  [503, { ok: false, code: "directory-owner-unavailable", error: "Unavailable" }, "unavailable"],
]) {
  const mappingClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => response(status, payload) });
  const mapped = await mappingClient.getCapabilities();
  assert(!mapped.ok && mapped[expected] === true, `HTTP ${status} must set ${expected}`);
}

let parsedPlainText401 = false;
const perimeterClient = createNomenclatureTypesServerOwnerClient({ fetchImpl: async () => ({
  status: 401,
  ok: false,
  headers: headers({ "content-type": "text/plain; charset=utf-8" }),
  json: async () => { parsedPlainText401 = true; throw new Error("not json"); },
}) });
const perimeter = await perimeterClient.getCapabilities();
assert(!perimeter.ok && perimeter.authenticationRequired && !parsedPlainText401, "Outer auth text/plain 401 must map before JSON parsing");

const adapterBuild = await build({
  entryPoints: [fileURLToPath(new URL("../experiments/react-migration/src/modules/nomenclature-types/adapter.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
});
const adapterSource = adapterBuild.outputFiles[0]?.text || "";
assert(adapterSource, "Focused Nomenclature Types adapter bundle must be available");
const { adaptNomenclatureTypes, adaptNomenclatureTypesModel } = await import(`data:text/javascript;base64,${Buffer.from(adapterSource).toString("base64")}`);
const mutableTypeRow = { id: "type-target", name: "Целевой тип", hidden: { nested: ["original"] } };
const exactFallbackRow = { id: "type-fallback", name: "Точный резервный тип", hidden: { nested: ["fallback"] } };
const adaptedType = adaptNomenclatureTypes({ nomenclatureTypes: [mutableTypeRow] })[0];
mutableTypeRow.hidden.nested[0] = "mutated-after-read";
assert.deepEqual(adaptedType.baseline.hidden, { nested: ["original"] }, "Typed baseline must be a detached deep JSON clone");
assert(Object.isFrozen(adaptedType.baseline) && Object.isFrozen(adaptedType.baseline.hidden) && Object.isFrozen(adaptedType.baseline.hidden.nested), "Typed baseline must be deeply immutable");

const exactPreviewPayload = {
  nomenclatureTypes: [
    { id: "type-target", name: "Целевой тип", hidden: { nested: ["original"] } },
    exactFallbackRow,
  ],
  nomenclature: [{ id: "nom-1", type: "Целевой тип" }, { id: "nom-2", type: "Целевой тип" }],
  specifications: [{ id: "spec-1", structureItems: [{ id: "line-1", nomenclatureType: "Целевой тип" }] }],
  directoryRevision: 12,
  capabilities: {
    serverCommandsEnabled: true,
    canEditNomenclatureTypes: true,
    canDeleteNomenclatureTypes: true,
  },
  deleteUsageById: {
    "type-target": {
      itemId: "type-target",
      expectedRow: { hidden: { nested: ["original"] }, name: "Целевой тип", id: "type-target" },
      fallbackTypeId: "type-fallback",
      fallbackExpectedRow: { hidden: { nested: ["fallback"] }, name: "Точный резервный тип", id: "type-fallback" },
      fallbackType: "Подменённая подпись",
      nomenclatureCount: 2,
      specificationRowsCount: 1,
      impactFingerprint: fingerprint,
    },
  },
};
const exactPreviewUsage = adaptNomenclatureTypesModel(exactPreviewPayload).deleteUsageById["type-target"];
assert(exactPreviewUsage.serverContractReady, "Exact target/fallback baselines and projection-derived counts must enable the server contract");
assert.equal(exactPreviewUsage.fallbackType, exactFallbackRow.name, "Confirmation label must come from the exact fallback row, never loose display text");
assert.deepEqual([exactPreviewUsage.nomenclatureCount, exactPreviewUsage.specificationRowsCount], [2, 1], "Confirmation counts must be derived from the current Directory projection");

const contradictoryPreviewPayload = structuredClone(exactPreviewPayload);
contradictoryPreviewPayload.deleteUsageById["type-target"].nomenclatureCount = 99;
const contradictoryPreviewUsage = adaptNomenclatureTypesModel(contradictoryPreviewPayload).deleteUsageById["type-target"];
assert(!contradictoryPreviewUsage.serverContractReady, "A loose count that contradicts the exact Directory preview must fail closed");
assert.deepEqual([contradictoryPreviewUsage.nomenclatureCount, contradictoryPreviewUsage.specificationRowsCount], [2, 1], "Contradictory loose counters must never reach confirmation display");

const legacyFallbackPayload = structuredClone(exactPreviewPayload);
legacyFallbackPayload.capabilities = { createEdit: true, delete: true };
legacyFallbackPayload.deleteUsageById["type-target"] = {
  fallbackType: exactFallbackRow.name,
  nomenclatureCount: 999,
  specificationRowsCount: 999,
};
const legacyFallbackModel = adaptNomenclatureTypesModel(legacyFallbackPayload);
const legacyFallbackUsage = legacyFallbackModel.deleteUsageById["type-target"];
assert(legacyFallbackModel.canDelete && !legacyFallbackModel.serverCommandsEnabled, "Explicit legacy rollback capability must remain available");
assert(!legacyFallbackUsage.serverContractReady, "Legacy fallback must not be mislabeled as an exact server command contract");
assert.equal(legacyFallbackUsage.fallbackType, exactFallbackRow.name, "Legacy fallback label must still resolve through a current exact type row");
assert.deepEqual([legacyFallbackUsage.nomenclatureCount, legacyFallbackUsage.specificationRowsCount], [2, 1], "Legacy confirmation must also ignore arbitrary loose counters");

console.log("Nomenclature Types server-owner client QA: OK");
console.log("- same-origin capability and POST-only exact command contract: pass");
console.log("- exact target/fallback baselines and delete impact fingerprint: pass");
console.log("- stable lost-response replay and Idempotency-Key collision containment: pass");
console.log("- authoritative Directory/ETag validation and superseded replay fail-closed refresh: pass");
console.log("- immutable typed baselines and exact delete confirmation projection: pass");
console.log("- authentication, RBAC, conflicts, protocol and unavailable mappings: pass");
