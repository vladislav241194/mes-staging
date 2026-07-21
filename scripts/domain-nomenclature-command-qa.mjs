import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import {
  NOMENCLATURE_COMMAND_JSON_LIMITS,
  NOMENCLATURE_SERVER_COMMAND_CONTRACT,
  executeNomenclatureCommand,
  handleNomenclatureCommandRequest,
  matchNomenclatureCommandRoute,
} from "./domain-nomenclature-command.mjs";
import {
  NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY,
  handleSharedStateRequest,
  updateSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";

const DIRECTORY_KEY = "mes-planning-prototype-directories-v2";
const PLANNING_KEY = "mes-planning-prototype-state-v2";
const clone = (value) => JSON.parse(JSON.stringify(value));
const enabledEnv = { APP_ENV: "local", MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1" };
const authorization = {
  allowed: true,
  revision: 41,
  decision: { reason: "current-rbac-grant", policy: { mustNotStringify: true }, roleId: "technologist", source: "system-domains", ignoredSecret: "must-not-persist" },
  principal: {
    id: "employee:employee-tech-1",
    employeeId: "employee-tech-1",
    displayName: "Технолог QA",
    personnelNumber: "QA-001",
    publicPrincipalId: "public:qa",
    scope: "employee",
  },
};

function fixtureDirectory() {
  return {
    nomenclatureTypes: [
      { id: "type-mech", name: "Механика" },
      { id: "type-rea", name: "РЭА компоненты" },
    ],
    nomenclature: [
      { id: "nom-a", name: "Корпус", article: "CASE-A", type: "Механика", unit: "шт.", updatedAt: "2026-07-21T00:00:00.000Z" },
      { id: "nom-b", name: "Резистор", article: "R-10K", type: "РЭА компоненты", unit: "шт.", updatedAt: "2026-07-21T00:00:00.000Z" },
    ],
    bomLists: [{
      id: "bom-a",
      marker: "preserve-bom",
      importRows: [
        { id: "bom-row-a", nomenclatureId: "nom-a", quantity: 1 },
        { id: "bom-row-b", nomenclatureId: "nom-b", quantity: 2 },
      ],
    }],
    specifications: [{
      id: "spec-a",
      marker: "preserve-spec",
      outputNomenclatureId: "nom-a",
      structureItems: [
        { id: "spec-row-a", nomenclatureId: "nom-a", quantity: 1 },
        { id: "spec-row-b", nomenclatureId: "nom-b", quantity: 2 },
      ],
    }],
    operationMap: [],
    componentTypes: [],
    statuses: [{ id: "status-a", name: "Активен" }],
  };
}

function snapshot(version = 7, directory = fixtureDirectory(), extraValues = {}) {
  return {
    version,
    updatedAt: "2026-07-21T00:00:00.000Z",
    updatedBy: { actor: "qa-seed" },
    values: {
      [PLANNING_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [DIRECTORY_KEY]: JSON.stringify(directory),
      ...extraValues,
    },
    sharedUi: {},
    events: [],
  };
}

async function writeSnapshot(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

async function readSnapshot(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function makeRequest({ method = "POST", headers = {}, body = "" } = {}) {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  request.method = method;
  request.headers = headers;
  return request;
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); },
  };
}

async function callSharedState(filePath, payload, env = enabledEnv) {
  const req = makeRequest({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const res = makeResponse();
  await handleSharedStateRequest(req, res, { filePath, env });
  return { statusCode: res.statusCode, json: JSON.parse(res.body || "{}") };
}

async function callNomenclatureHttp(filePath, {
  method = "POST",
  pathname = "/api/v1/nomenclature",
  body = {},
  rawBody = null,
  headers = {},
  authorizationResult = authorization,
  internalOrigin = "http://localhost:4175",
  commandEnv = enabledEnv,
} = {}) {
  const url = new URL(`${internalOrigin}${pathname}`);
  const req = makeRequest({ method, headers, body: rawBody ?? JSON.stringify(body) });
  const res = makeResponse();
  let authorizationCalls = 0;
  const handled = await handleNomenclatureCommandRequest(req, res, url, {
    filePath,
    env: commandEnv,
    getAuthorization: async () => {
      authorizationCalls += 1;
      if (authorizationResult instanceof Error) throw authorizationResult;
      return authorizationResult;
    },
  });
  return { handled, statusCode: res.statusCode, headers: res.headers, json: JSON.parse(res.body || "{}"), authorizationCalls };
}

const root = await mkdtemp(join(tmpdir(), "mes-domain-nomenclature-command-"));
try {
  assert.equal(NOMENCLATURE_SERVER_COMMAND_CONTRACT.authorization.principalId, "employee:<employeeId>");
  assert.deepEqual(matchNomenclatureCommandRoute("POST", "/api/v1/nomenclature"), { kind: "create", itemId: "" });
  assert.deepEqual(matchNomenclatureCommandRoute("PATCH", "/api/v1/nomenclature/nom-a"), { kind: "update", itemId: "nom-a" });
  assert.deepEqual(matchNomenclatureCommandRoute("DELETE", "/api/v1/nomenclature/nom-a"), { kind: "delete", itemId: "nom-a" });
  assert.equal(matchNomenclatureCommandRoute("PATCH", "/api/v1/nomenclature/%E0%A4%A"), null, "malformed percent-encoded paths must fail closed without throwing");
  const overlongRouteId = "r".repeat(161);
  assert.equal(matchNomenclatureCommandRoute("PATCH", `/api/v1/nomenclature/${overlongRouteId}`).itemId, overlongRouteId,
    "route matching must preserve the raw id so command validation can reject it instead of truncating it");

  const commandFile = join(root, "commands.json");
  await writeSnapshot(commandFile, snapshot());
  const baseRow = clone(fixtureDirectory().nomenclature[0]);
  const validCreate = {
    kind: "create",
    itemId: "nom-created",
    expectedRevision: 7,
    idempotencyKey: "create-1",
    row: { id: "nom-created", name: "Кронштейн", article: "BRACKET-1", type: "Механика", unit: "шт." },
  };

  for (const expectedRevision of [null, "", false, "7"]) {
    const invalidRevision = await executeNomenclatureCommand({ ...validCreate, expectedRevision, idempotencyKey: `invalid-revision-${String(expectedRevision)}` }, {
      filePath: commandFile, env: enabledEnv, authorization,
    });
    assert.equal(invalidRevision.code, "expected-revision-required", "JSON revisions must not use Number coercion");
  }
  const overlongItemId = "x".repeat(161);
  const invalidLongId = await executeNomenclatureCommand({
    ...validCreate,
    itemId: overlongItemId,
    row: { ...validCreate.row, id: overlongItemId },
    idempotencyKey: "overlong-id",
  }, { filePath: commandFile, env: enabledEnv, authorization });
  assert.equal(invalidLongId.code, "item-id-invalid");
  assert.equal((await readSnapshot(commandFile)).version, 7, "invalid ids and revisions must not write");

  const prefixCollisionFile = join(root, "prefix-collision.json");
  const prefixCollisionDirectory = fixtureDirectory();
  const longPrefix = "p".repeat(160);
  prefixCollisionDirectory.nomenclature.push(
    { ...validCreate.row, id: `${longPrefix}a` },
    { ...validCreate.row, id: `${longPrefix}b` },
  );
  await writeSnapshot(prefixCollisionFile, snapshot(7, prefixCollisionDirectory));
  const prefixCollision = await executeNomenclatureCommand(validCreate, { filePath: prefixCollisionFile, env: enabledEnv, authorization });
  assert.equal(prefixCollision.code, "invalid-directory-projection", "raw overlong prefix-colliding ids must fail instead of aliasing after truncation");
  assert.equal((await readSnapshot(prefixCollisionFile)).version, 7);

  const deepProjectionFile = join(root, "deep-projection.json");
  const deepProjectionDirectory = fixtureDirectory();
  let projectionCursor = deepProjectionDirectory.bomLists[0];
  for (let depth = 0; depth < 70; depth += 1) {
    projectionCursor.metadata = {};
    projectionCursor = projectionCursor.metadata;
  }
  await writeSnapshot(deepProjectionFile, snapshot(7, deepProjectionDirectory));
  const deepProjection = await executeNomenclatureCommand(validCreate, { filePath: deepProjectionFile, env: enabledEnv, authorization });
  assert(deepProjection.statusCode === 503
    && deepProjection.code === "invalid-directory-projection"
    && deepProjection.reason === "projection-json-depth-limit",
  "persisted Directory depth must fail closed before recursive reference traversal");
  assert.equal((await readSnapshot(deepProjectionFile)).version, 7);

  const disabled = await executeNomenclatureCommand(validCreate, { filePath: commandFile, env: {}, authorization });
  assert.equal(disabled.code, "nomenclature-server-commands-disabled");
  const unauthenticated = await executeNomenclatureCommand(validCreate, { filePath: commandFile, env: enabledEnv });
  assert.equal(unauthenticated.statusCode, 401);
  const denied = await executeNomenclatureCommand(validCreate, { filePath: commandFile, env: enabledEnv, authorization: { ...authorization, allowed: false } });
  assert.equal(denied.statusCode, 403);
  const forgedPrincipal = await executeNomenclatureCommand(validCreate, {
    filePath: commandFile,
    env: enabledEnv,
    authorization: { ...authorization, principal: { ...authorization.principal, id: "public:qa" } },
  });
  assert.equal(forgedPrincipal.code, "employee-principal-required");

  const missingType = await executeNomenclatureCommand({
    ...validCreate,
    idempotencyKey: "missing-type",
    row: { ...validCreate.row, id: "nom-missing-type", type: "Несуществующий тип" },
    itemId: "nom-missing-type",
  }, { filePath: commandFile, env: enabledEnv, authorization });
  assert.equal(missingType.code, "nomenclature-type-not-found");
  assert.equal((await readSnapshot(commandFile)).version, 7, "validation failure must not advance the shared revision");

  const created = await executeNomenclatureCommand(validCreate, { filePath: commandFile, env: enabledEnv, authorization });
  assert(created.ok && created.statusCode === 201 && created.revision === 8 && created.commandRevision === 8 && !created.replayed && !created.superseded);
  assert.equal(created.projection.directory.nomenclature.at(-1).id, "nom-created");
  assert.match(created.item.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const afterCreate = await readSnapshot(commandFile);
  assert.equal(afterCreate.updatedBy.actor, "employee:employee-tech-1", "persisted actor must come from the server authorization context");
  const receiptsAfterCreate = JSON.parse(afterCreate.values[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]);
  const createReceipt = Object.values(receiptsAfterCreate.entries)[0];
  assert.equal(createReceipt.authorizationDecision.reason, "current-rbac-grant");
  assert.equal(createReceipt.authorizationDecision.policy, undefined, "nested decision evidence must not degrade into [object Object]");
  assert.equal(createReceipt.authorizationDecision.ignoredSecret, undefined, "authorization audit evidence must be allowlisted instead of stringifying arbitrary objects");
  assert.equal(afterCreate.events[0].authorizationDecision.reason, "current-rbac-grant");

  const replay = await executeNomenclatureCommand(validCreate, { filePath: commandFile, env: enabledEnv, authorization });
  assert(replay.ok && replay.replayed && !replay.superseded && replay.commandRevision === 8 && replay.revision === 8 && replay.statusCode === 200);
  assert.equal((await readSnapshot(commandFile)).version, 8, "idempotent replay must not create another shared-state revision");
  const reusedKey = await executeNomenclatureCommand({ ...validCreate, row: { ...validCreate.row, name: "Другое значение" } }, { filePath: commandFile, env: enabledEnv, authorization });
  assert.equal(reusedKey.code, "idempotency-conflict");

  const unrelated = await updateSharedStateSnapshot({
    filePath: commandFile,
    expectedVersion: 8,
    update: (current) => {
      const directory = JSON.parse(current.values[DIRECTORY_KEY]);
      return {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify({
            ...directory,
            statuses: [...directory.statuses, { id: "status-remote", name: "Удалённо" }],
            nomenclature: directory.nomenclature.map((row) => row.id === "nom-created"
              ? { ...row, name: "Изменено после исходной команды", updatedAt: "2026-07-21T04:00:00.000Z" }
              : row),
          }),
        },
      };
    },
  });
  assert(unrelated.ok && unrelated.snapshot.version === 9);
  const supersededCreateReplay = await executeNomenclatureCommand(validCreate, { filePath: commandFile, env: enabledEnv, authorization });
  assert(supersededCreateReplay.ok && supersededCreateReplay.replayed && supersededCreateReplay.superseded
    && supersededCreateReplay.commandRevision === 8 && supersededCreateReplay.revision === 9
    && supersededCreateReplay.projection.directory.nomenclature.find((row) => row.id === "nom-created").name === "Изменено после исходной команды",
  "replay after an intervening same-id change must return the current projection and declare the receipt superseded");
  const rebasedRow = { ...baseRow, name: "Корпус изменён", article: "CASE-A-EDIT" };
  const rebasedUpdate = await executeNomenclatureCommand({
    kind: "update",
    itemId: "nom-a",
    expectedRevision: 8,
    idempotencyKey: "update-rebased",
    expectedRow: baseRow,
    row: rebasedRow,
  }, { filePath: commandFile, env: enabledEnv, authorization });
  assert(rebasedUpdate.ok && rebasedUpdate.rebased && rebasedUpdate.baseRevision === 8 && rebasedUpdate.revision === 10, "an unrelated newer revision must rebase when the target row is still exact");
  assert(rebasedUpdate.projection.directory.statuses.some((row) => row.id === "status-remote"), "rebased command must preserve the disjoint concurrent write");

  const updatedRow = clone(rebasedUpdate.projection.directory.nomenclature.find((row) => row.id === "nom-a"));
  const remoteSameRow = { ...updatedRow, name: "Изменено другим пользователем", updatedAt: "2026-07-21T05:00:00.000Z" };
  const sameRowRemoteWrite = await updateSharedStateSnapshot({
    filePath: commandFile,
    expectedVersion: 10,
    update: (current) => {
      const directory = JSON.parse(current.values[DIRECTORY_KEY]);
      return {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify({
            ...directory,
            nomenclature: directory.nomenclature.map((row) => row.id === "nom-a" ? remoteSameRow : row),
          }),
        },
      };
    },
  });
  assert(sameRowRemoteWrite.ok && sameRowRemoteWrite.snapshot.version === 11);
  const sameRowConflict = await executeNomenclatureCommand({
    kind: "update",
    itemId: "nom-a",
    expectedRevision: 10,
    idempotencyKey: "update-same-row-conflict",
    expectedRow: updatedRow,
    row: { ...updatedRow, name: "Не должно сохраниться" },
  }, { filePath: commandFile, env: enabledEnv, authorization });
  assert.equal(sameRowConflict.code, "same-row-conflict");
  assert.equal((await readSnapshot(commandFile)).version, 11);

  const deleted = await executeNomenclatureCommand({
    kind: "delete",
    itemId: "nom-a",
    expectedRevision: 11,
    idempotencyKey: "delete-1",
    expectedRow: remoteSameRow,
  }, {
    filePath: commandFile,
    backupDir: join(root, "delete-backups"),
    auditLogPath: join(root, "delete-audit.log"),
    env: enabledEnv,
    authorization,
  });
  assert(deleted.ok && !deleted.superseded && deleted.revision === 12 && deleted.unlinkedReferences.bom === 1 && deleted.unlinkedReferences.specifications === 2);
  assert(!deleted.projection.directory.nomenclature.some((row) => row.id === "nom-a"));
  assert.equal(deleted.projection.directory.bomLists[0].importRows[0].nomenclatureId, "");
  assert.equal(deleted.projection.directory.specifications[0].outputNomenclatureId, "");
  assert.equal(deleted.projection.directory.specifications[0].structureItems[0].nomenclatureId, "");
  assert.equal(deleted.projection.directory.bomLists[0].marker, "preserve-bom");
  assert.equal(deleted.projection.directory.specifications[0].marker, "preserve-spec");
  const deleteBackupEntries = await readdir(join(root, "delete-backups"));
  assert.equal(deleteBackupEntries.filter((name) => name.endsWith(".json") && !name.endsWith(".meta.json")).length, 1, "file-store delete must create exactly one pre-write backup");
  assert.equal(deleteBackupEntries.filter((name) => name.endsWith(".meta.json")).length, 1);
  const deleteAudit = (await readFile(join(root, "delete-audit.log"), "utf8")).trim().split("\n").map(JSON.parse);
  assert(deleteAudit.some((event) => event.action === "nomenclature-command:delete"
    && event.status === "saved"
    && event.actor === "employee:employee-tech-1"
    && event.itemId === "nom-a"
    && event.backupPath), "delete audit must use the server-derived employee actor and name its backup");
  const deleteReplay = await executeNomenclatureCommand({
    kind: "delete",
    itemId: "nom-a",
    expectedRevision: 11,
    idempotencyKey: "delete-1",
    expectedRow: remoteSameRow,
  }, { filePath: commandFile, env: enabledEnv, authorization });
  assert(deleteReplay.ok && deleteReplay.replayed && !deleteReplay.superseded && deleteReplay.commandRevision === 12 && (await readSnapshot(commandFile)).version === 12);
  assert.equal((await readdir(join(root, "delete-backups"))).length, 2, "idempotent delete replay must not create another backup");
  const recreateAfterDelete = await updateSharedStateSnapshot({
    filePath: commandFile,
    expectedVersion: 12,
    update: (current) => {
      const directory = JSON.parse(current.values[DIRECTORY_KEY]);
      return {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify({
            ...directory,
            nomenclature: [...directory.nomenclature, { ...remoteSameRow, name: "Создано заново", updatedAt: "2026-07-21T06:00:00.000Z" }],
          }),
        },
      };
    },
  });
  assert(recreateAfterDelete.ok && recreateAfterDelete.snapshot.version === 13);
  const supersededDeleteReplay = await executeNomenclatureCommand({
    kind: "delete",
    itemId: "nom-a",
    expectedRevision: 11,
    idempotencyKey: "delete-1",
    expectedRow: remoteSameRow,
  }, { filePath: commandFile, env: enabledEnv, authorization });
  assert(supersededDeleteReplay.ok && supersededDeleteReplay.replayed && supersededDeleteReplay.superseded
    && supersededDeleteReplay.commandRevision === 12 && supersededDeleteReplay.revision === 13
    && supersededDeleteReplay.projection.directory.nomenclature.some((row) => row.id === "nom-a" && row.name === "Создано заново"),
  "delete replay after same-id recreation must expose the current row and declare the receipt superseded");

  const deniedDeleteFile = join(root, "delete-backup-denied.json");
  const deniedBackupTarget = join(root, "delete-backup-target-is-file");
  const deniedAuditPath = join(root, "delete-backup-denied-audit.log");
  await writeSnapshot(deniedDeleteFile, snapshot(4));
  await writeFile(deniedBackupTarget, "not-a-directory\n");
  const deniedDelete = await executeNomenclatureCommand({
    kind: "delete",
    itemId: "nom-a",
    expectedRevision: 4,
    idempotencyKey: "delete-backup-denied",
    expectedRow: clone(fixtureDirectory().nomenclature[0]),
  }, {
    filePath: deniedDeleteFile,
    backupDir: deniedBackupTarget,
    auditLogPath: deniedAuditPath,
    env: enabledEnv,
    authorization,
  });
  assert.equal(deniedDelete.code, "nomenclature-delete-backup-failed");
  assert.equal((await readSnapshot(deniedDeleteFile)).version, 4, "failed required backup must deny the delete before persistence");
  const deniedDeleteAudit = (await readFile(deniedAuditPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert(deniedDeleteAudit.some((event) => event.status === "denied"
    && event.reason === "backup-failed"
    && event.actor === "employee:employee-tech-1"), "backup failure must produce a denied audit event with the server actor");

  const originalFetch = globalThis.fetch;
  const kvCommands = [];
  const kvSnapshot = snapshot(7);
  const kvAuditPath = join(root, "kv-delete-denied-audit.log");
  globalThis.fetch = async (_url, options = {}) => {
    const command = JSON.parse(options.body || "[]");
    kvCommands.push(command);
    if (command[0] === "GET") return { ok: true, json: async () => ({ result: JSON.stringify(kvSnapshot) }) };
    throw new Error(`KV destructive write reached ${command[0] || "unknown"} without a recovery artifact`);
  };
  try {
    const kvDeleteDenied = await executeNomenclatureCommand({
      kind: "delete",
      itemId: "nom-a",
      expectedRevision: 7,
      idempotencyKey: "kv-delete-without-backup",
      expectedRow: clone(fixtureDirectory().nomenclature[0]),
    }, {
      env: {
        ...enabledEnv,
        KV_REST_API_URL: "https://kv.invalid",
        KV_REST_API_TOKEN: "qa-token",
        MES_SHARED_STATE_KEY: "qa:nomenclature-delete",
      },
      auditLogPath: kvAuditPath,
      authorization,
    });
    assert.equal(kvDeleteDenied.code, "nomenclature-delete-backup-failed");
    assert(kvCommands.every((command) => command[0] === "GET"), "KV delete must fail before compare-and-set when no durable recovery artifact exists");
    const kvDeniedAudit = (await readFile(kvAuditPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert(kvDeniedAudit.some((event) => event.status === "denied"
      && event.reason === "backup-storage-unsupported"
      && event.storageKind === "kv"
      && event.actor === "employee:employee-tech-1"), "unsupported KV delete must leave explicit denied audit evidence");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const malformedReceiptsFile = join(root, "malformed-receipts.json");
  await writeSnapshot(malformedReceiptsFile, snapshot(3, fixtureDirectory(), { [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: "{broken" }));
  const malformedReceipts = await executeNomenclatureCommand({ ...validCreate, expectedRevision: 3, idempotencyKey: "malformed-receipts" }, {
    filePath: malformedReceiptsFile, env: enabledEnv, authorization,
  });
  assert.equal(malformedReceipts.code, "invalid-idempotency-projection");
  assert.equal((await readSnapshot(malformedReceiptsFile)).version, 3, "malformed receipts must fail closed instead of being reset");

  const malformedReceiptEntryFile = join(root, "malformed-receipt-entry.json");
  await writeSnapshot(malformedReceiptEntryFile, snapshot(3, fixtureDirectory(), {
    [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: { invalid: { requestFingerprint: "also-invalid" } } }),
  }));
  const malformedReceiptEntry = await executeNomenclatureCommand({ ...validCreate, expectedRevision: 3, idempotencyKey: "malformed-receipt-entry" }, {
    filePath: malformedReceiptEntryFile, env: enabledEnv, authorization,
  });
  assert.equal(malformedReceiptEntry.code, "invalid-idempotency-projection", "a structurally corrupt receipt entry must fail closed");
  assert.equal((await readSnapshot(malformedReceiptEntryFile)).version, 3);

  const concurrentFile = join(root, "concurrent.json");
  await writeSnapshot(concurrentFile, snapshot());
  const concurrent = await Promise.all([
    executeNomenclatureCommand({ ...validCreate, itemId: "nom-concurrent-a", idempotencyKey: "concurrent-a", row: { ...validCreate.row, id: "nom-concurrent-a", article: "CONCURRENT-A" } }, { filePath: concurrentFile, env: enabledEnv, authorization }),
    executeNomenclatureCommand({ ...validCreate, itemId: "nom-concurrent-b", idempotencyKey: "concurrent-b", row: { ...validCreate.row, id: "nom-concurrent-b", article: "CONCURRENT-B" } }, { filePath: concurrentFile, env: enabledEnv, authorization }),
  ]);
  assert(concurrent.every((result) => result.ok), `disjoint concurrent commands must both succeed: ${JSON.stringify(concurrent)}`);
  assert(concurrent.some((result) => result.rebased), "the command that loses the first CAS must explicitly report a safe rebase");
  const concurrentSnapshot = await readSnapshot(concurrentFile);
  const concurrentDirectory = JSON.parse(concurrentSnapshot.values[DIRECTORY_KEY]);
  assert.equal(concurrentSnapshot.version, 9);
  assert(concurrentDirectory.nomenclature.some((row) => row.id === "nom-concurrent-a") && concurrentDirectory.nomenclature.some((row) => row.id === "nom-concurrent-b"), "latest-lock/CAS rebase must preserve both disjoint creates");

  const casExhaustedFile = join(root, "cas-exhausted.json");
  await writeSnapshot(casExhaustedFile, snapshot());
  const casExhaustedResults = await Promise.all([
    executeNomenclatureCommand({ ...validCreate, itemId: "nom-cas-a", idempotencyKey: "cas-a", row: { ...validCreate.row, id: "nom-cas-a" } }, { filePath: casExhaustedFile, env: enabledEnv, authorization, maxAttempts: 1 }),
    executeNomenclatureCommand({ ...validCreate, itemId: "nom-cas-b", idempotencyKey: "cas-b", row: { ...validCreate.row, id: "nom-cas-b" } }, { filePath: casExhaustedFile, env: enabledEnv, authorization, maxAttempts: 1 }),
  ]);
  const exhaustedConflict = casExhaustedResults.find((result) => !result.ok);
  assert(exhaustedConflict?.code === "revision-conflict" && exhaustedConflict.revision === 8 && exhaustedConflict.projection?.revision === 8,
    `CAS exhaustion must return the latest authoritative revision/projection: ${JSON.stringify(casExhaustedResults)}`);

  const genericFile = join(root, "generic-guard.json");
  const genericReceipt = JSON.stringify({ schemaVersion: 1, entries: { preserved: { requestFingerprint: "x" } } });
  await writeSnapshot(genericFile, snapshot(5, fixtureDirectory(), { [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: genericReceipt }));
  const genericBase = await readSnapshot(genericFile);
  const genericValues = clone(genericBase.values);
  delete genericValues[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY];
  const changedNomenclature = clone(fixtureDirectory());
  changedNomenclature.nomenclature[0].name = "Legacy overwrite";
  const blockedNomenclature = await callSharedState(genericFile, {
    baseVersion: 5, clientId: "legacy", actor: "spoofed", action: "nomenclature-save", values: { ...genericValues, [DIRECTORY_KEY]: JSON.stringify(changedNomenclature) }, sharedUi: {},
  });
  assert(blockedNomenclature.statusCode === 409 && blockedNomenclature.json.code === "nomenclature-command-required");
  const danglingDirectory = fixtureDirectory();
  danglingDirectory.bomLists[0].importRows.push({ id: "dangling", nomenclatureId: "missing-item" });
  const blockedDangling = await callSharedState(genericFile, {
    baseVersion: 5, clientId: "legacy", actor: "spoofed", action: "bom-save", values: { ...genericValues, [DIRECTORY_KEY]: JSON.stringify(danglingDirectory) }, sharedUi: {},
  });
  assert(blockedDangling.statusCode === 409 && blockedDangling.json.code === "dangling-nomenclature-reference");
  const unrelatedDirectory = fixtureDirectory();
  unrelatedDirectory.statuses.push({ id: "status-unrelated", name: "Unrelated" });
  const allowedUnrelated = await callSharedState(genericFile, {
    baseVersion: 5, clientId: "legacy", actor: "legacy-ui", action: "status-save", values: { ...genericValues, [DIRECTORY_KEY]: JSON.stringify(unrelatedDirectory) }, sharedUi: {},
  });
  assert(allowedUnrelated.statusCode === 200 && allowedUnrelated.json.version === 6, `unrelated exact-preserving legacy write was blocked: ${JSON.stringify(allowedUnrelated.json)}`);
  const afterUnrelated = await readSnapshot(genericFile);
  assert.equal(afterUnrelated.values[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY], genericReceipt, "generic POST must preserve server-owned idempotency receipts byte-for-byte");
  assert.deepEqual(JSON.parse(afterUnrelated.values[DIRECTORY_KEY]).nomenclature, fixtureDirectory().nomenclature);

  const httpFile = join(root, "http-handler.json");
  await writeSnapshot(httpFile, snapshot(2));
  const baseHttpHeaders = {
    "content-type": "application/json; charset=utf-8",
    host: "pilot.mes-line.ru",
    origin: "https://pilot.mes-line.ru",
    "sec-fetch-site": "same-origin",
    "idempotency-key": "http-create",
    "if-match": '"2"',
  };
  const wrongContentType = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "content-type": "text/plain" }, body: validCreate });
  assert(wrongContentType.handled && wrongContentType.statusCode === 415 && wrongContentType.authorizationCalls === 0);
  const jsonPrefixSpoof = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "content-type": "application/jsonp" }, body: validCreate });
  assert(jsonPrefixSpoof.statusCode === 415 && jsonPrefixSpoof.authorizationCalls === 0, "a JSON prefix must not bypass the exact media-type guard");
  const crossOrigin = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: validCreate });
  assert(crossOrigin.statusCode === 403 && crossOrigin.json.code === "same-origin-required" && crossOrigin.authorizationCalls === 0);
  const internalProxyOrigin = await callNomenclatureHttp(httpFile, { headers: baseHttpHeaders, body: validCreate, internalOrigin: "http://localhost:4175" });
  assert.notEqual(internalProxyOrigin.json.code, "same-origin-required", "Pilot Origin must be checked against the trusted Host header, not the server's internal URL base");
  const missingIdempotency = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "idempotency-key": "" }, body: validCreate });
  assert(missingIdempotency.statusCode === 400 && missingIdempotency.json.code === "idempotency-key-required");
  const missingIfMatch = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "if-match": "" }, body: validCreate });
  assert(missingIfMatch.statusCode === 428 && missingIfMatch.json.code === "if-match-required");
  const weakIfMatch = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "if-match": 'W/"2"' }, body: validCreate });
  assert(weakIfMatch.statusCode === 428 && weakIfMatch.json.code === "if-match-required", "write precondition must reject a weak ETag");
  const unquotedIfMatch = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "if-match": "2" }, body: validCreate });
  assert(unquotedIfMatch.statusCode === 428 && unquotedIfMatch.json.code === "if-match-required", "write precondition must require a strong quoted ETag");
  const malformedQuotedIfMatch = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "if-match": '"2' }, body: validCreate });
  assert(malformedQuotedIfMatch.statusCode === 428 && malformedQuotedIfMatch.json.code === "if-match-required", "write precondition must reject an unbalanced ETag quote");
  const oversizedIfMatch = await callNomenclatureHttp(httpFile, { headers: { ...baseHttpHeaders, "if-match": '"9007199254740992"' }, body: { ...validCreate, expectedRevision: 9007199254740992 } });
  assert(oversizedIfMatch.statusCode === 428 && oversizedIfMatch.json.code === "if-match-required", "If-Match must reject revisions outside the safe integer range");
  for (const expectedRevision of [null, "", false]) {
    const coercedHttpRevision = await callNomenclatureHttp(httpFile, { headers: baseHttpHeaders, body: { ...validCreate, expectedRevision } });
    assert(coercedHttpRevision.statusCode === 400 && coercedHttpRevision.json.code === "revision-mismatch", "HTTP JSON revisions must not coerce null, empty or boolean values");
  }
  const overlongHttpId = "z".repeat(161);
  const overlongHttp = await callNomenclatureHttp(httpFile, {
    method: "PATCH",
    pathname: `/api/v1/nomenclature/${overlongHttpId}`,
    headers: baseHttpHeaders,
    body: { expectedRevision: 2, row: { ...baseRow, id: overlongHttpId }, expectedRow: { ...baseRow, id: overlongHttpId } },
  });
  assert(overlongHttp.statusCode === 400 && overlongHttp.json.code === "item-id-invalid" && (await readSnapshot(httpFile)).version === 2,
    "overlong route ids must be rejected without truncation or write");
  const unavailableAuthorization = await callNomenclatureHttp(httpFile, { headers: baseHttpHeaders, body: validCreate, authorizationResult: new Error("RBAC projection unavailable") });
  assert(unavailableAuthorization.statusCode === 503 && unavailableAuthorization.json.code === "nomenclature-authorization-unavailable");
  const httpDenied = await callNomenclatureHttp(httpFile, { headers: baseHttpHeaders, body: validCreate, authorizationResult: { ...authorization, allowed: false } });
  assert(httpDenied.statusCode === 403 && httpDenied.authorizationCalls === 1);

  const nonObjectBody = await callNomenclatureHttp(httpFile, { headers: baseHttpHeaders, body: [] });
  assert(nonObjectBody.statusCode === 400 && nonObjectBody.json.code === "command-json-invalid",
    "a command body that is not a JSON object must fail deterministically");

  const deeplyNestedLevel = 12_000;
  const deeplyNestedRawBody = `{"expectedRevision":2,"row":{"id":"nom-http-depth","name":"Глубина","type":"Механика","metadata":${'{"next":'.repeat(deeplyNestedLevel)}{}${"}".repeat(deeplyNestedLevel)}}}`;
  assert(Buffer.byteLength(deeplyNestedRawBody) < 128 * 1024, "deep regression body must stay below the existing row byte limit");
  const deeplyNestedHttp = await callNomenclatureHttp(httpFile, {
    headers: { ...baseHttpHeaders, "idempotency-key": "http-depth-limit" },
    rawBody: deeplyNestedRawBody,
  });
  assert(deeplyNestedHttp.statusCode === 413 && deeplyNestedHttp.json.code === "command-json-depth-limit",
    `deep but bounded-size command input must fail closed: ${JSON.stringify(deeplyNestedHttp.json)}`);

  const tooManyKeys = Object.fromEntries(Array.from(
    { length: NOMENCLATURE_COMMAND_JSON_LIMITS.maxKeys + 1 },
    (_, index) => [`field${index}`, 0],
  ));
  const excessiveKeysHttp = await callNomenclatureHttp(httpFile, {
    headers: { ...baseHttpHeaders, "idempotency-key": "http-key-limit" },
    body: {
      expectedRevision: 2,
      row: { id: "nom-http-keys", name: "Ключи", type: "Механика", metadata: tooManyKeys },
    },
  });
  assert(excessiveKeysHttp.statusCode === 413 && excessiveKeysHttp.json.code === "command-json-key-limit",
    `command key count must be bounded before canonicalization: ${JSON.stringify(excessiveKeysHttp.json)}`);

  const excessiveNodesHttp = await callNomenclatureHttp(httpFile, {
    headers: { ...baseHttpHeaders, "idempotency-key": "http-node-limit" },
    body: {
      expectedRevision: 2,
      row: {
        id: "nom-http-nodes",
        name: "Узлы",
        type: "Механика",
        metadata: Array.from({ length: NOMENCLATURE_COMMAND_JSON_LIMITS.maxNodes + 1 }, () => 0),
      },
    },
  });
  assert(excessiveNodesHttp.statusCode === 413 && excessiveNodesHttp.json.code === "command-json-node-limit",
    `command node count must be bounded before cloning: ${JSON.stringify(excessiveNodesHttp.json)}`);

  const throwingEnv = new Proxy(enabledEnv, {
    get(target, key, receiver) {
      if (key === "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS") throw new Error("internal-secret-must-not-leak");
      return Reflect.get(target, key, receiver);
    },
  });
  const internalFailureHttp = await callNomenclatureHttp(httpFile, {
    headers: { ...baseHttpHeaders, "idempotency-key": "http-internal-boundary" },
    body: { expectedRevision: 2, row: { id: "nom-http-error", name: "Ошибка", type: "Механика" } },
    commandEnv: throwingEnv,
  });
  assert(internalFailureHttp.statusCode === 500
    && internalFailureHttp.json.code === "nomenclature-command-internal-error"
    && internalFailureHttp.json.error === "Nomenclature command failed safely"
    && !JSON.stringify(internalFailureHttp.json).includes("internal-secret"),
  `unexpected command errors must be contained without leaking details: ${JSON.stringify(internalFailureHttp.json)}`);
  assert.equal((await readSnapshot(httpFile)).version, 2, "400/413/500 command failures must not write or kill the handler");

  const httpCreated = await callNomenclatureHttp(httpFile, {
    headers: baseHttpHeaders,
    body: {
      expectedRevision: 2,
      idempotencyKey: "body-key-must-be-ignored",
      actor: "employee:forged",
      role: "admin",
      row: { id: "nom-http", name: "HTTP позиция", article: "HTTP-1", type: "Механика", unit: "шт." },
    },
  });
  assert(httpCreated.statusCode === 201 && httpCreated.json.ok && httpCreated.json.actorId === "employee:employee-tech-1" && httpCreated.headers.ETag === '"3"');
  assert.equal(httpCreated.json.projection.revision, 3);
  const persistedHttp = await readSnapshot(httpFile);
  assert.equal(persistedHttp.updatedBy.actor, "employee:employee-tech-1");
  assert.notEqual(persistedHttp.updatedBy.actor, "employee:forged", "body actor/role fields must never reach command audit authority");
  const futureConflict = await callNomenclatureHttp(httpFile, {
    headers: { ...baseHttpHeaders, "if-match": '"99"', "idempotency-key": "future-conflict" },
    body: { expectedRevision: 99, row: { id: "nom-future", name: "Будущее", type: "Механика" } },
  });
  assert(futureConflict.statusCode === 409 && futureConflict.json.revision === 3 && futureConflict.json.projection.revision === 3 && futureConflict.headers.ETag === '"3"',
    "conflict responses must carry the latest authoritative projection and strong revision ETag");

  const originalCasFetch = globalThis.fetch;
  const casKvCommands = [];
  let casKvRaw = JSON.stringify(snapshot(7));
  globalThis.fetch = async (_url, options = {}) => {
    const command = JSON.parse(options.body || "[]");
    casKvCommands.push(command);
    if (command[0] === "GET") return { ok: true, json: async () => ({ result: casKvRaw }) };
    if (command[0] === "EVAL") {
      const external = JSON.parse(casKvRaw);
      casKvRaw = JSON.stringify({
        ...external,
        version: Number(external.version || 0) + 1,
        updatedAt: new Date(Date.parse(external.updatedAt) + 1_000).toISOString(),
      });
      return { ok: true, json: async () => ({ result: 0 }) };
    }
    throw new Error(`Unexpected KV command ${command[0] || ""}`);
  };
  try {
    const exhaustedHttpConflict = await callNomenclatureHttp("", {
      headers: { ...baseHttpHeaders, "if-match": '"7"', "idempotency-key": "http-cas-exhausted" },
      body: { expectedRevision: 7, row: { id: "nom-http-cas", name: "CAS", type: "Механика" } },
      commandEnv: {
        ...enabledEnv,
        KV_REST_API_URL: "https://kv.invalid",
        KV_REST_API_TOKEN: "qa-token",
        MES_SHARED_STATE_KEY: "qa:nomenclature-http-cas",
      },
    });
    assert(exhaustedHttpConflict.statusCode === 409
      && exhaustedHttpConflict.json.code === "revision-conflict"
      && exhaustedHttpConflict.json.revision === 11
      && exhaustedHttpConflict.json.projection.revision === 11
      && exhaustedHttpConflict.headers.ETag === '"11"',
    `CAS-exhausted HTTP response must carry the latest projection and ETag: ${JSON.stringify(exhaustedHttpConflict)}`);
    assert.equal(casKvCommands.filter((command) => command[0] === "EVAL").length, 4, "the focused route test must exhaust all command CAS attempts");
  } finally {
    globalThis.fetch = originalCasFetch;
  }

  console.log("Domain Nomenclature command QA: OK");
  console.log("- server-derived employee authorization, same-origin JSON and mandatory command headers: pass");
  console.log("- bounded JSON depth/node/key limits and deterministic 400/413/500 handler containment: pass");
  console.log("- create/update/delete validation, existing type, exact projection/revision and same-row conflict: pass");
  console.log("- durable idempotent replay, malformed-receipt fail-closed and actor evidence: pass");
  console.log("- latest lock/CAS disjoint rebase and delete reference unlink: pass");
  console.log("- generic POST authority guard with unrelated exact-preserving legacy write: pass");
} finally {
  await rm(root, { recursive: true, force: true });
}
