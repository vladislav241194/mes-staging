import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import {
  DIRECTORY_CLUSTER_SERVER_COMMAND_CONTRACT,
  executeDirectoryClusterCommand,
  handleDirectoryClusterCommandRequest,
  matchDirectoryClusterCommandRoute,
} from "./domain-directory-cluster-command.mjs";
import { executeNomenclatureCommand } from "./domain-nomenclature-command.mjs";
import {
  DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY,
  handleSharedStateRequest,
  updateSharedStateSnapshot,
  validateDirectoryClusterServerAuthorityWrite,
} from "./shared-state-endpoint.mjs";
import { inspectNomenclatureTypeImpact } from "./directory-cluster-type-reducer.mjs";
import {
  fingerprintDirectoryBaseline,
  inspectBomComponentSync,
  inspectBoardDeleteImpact,
} from "./directory-cluster-board-reducer.mjs";

const DIRECTORY_KEY = "mes-planning-prototype-directories-v2";
const PLANNING_KEY = "mes-planning-prototype-state-v2";
const enabledEnv = { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" };
const clone = (value) => structuredClone(value);
const authorization = {
  allowed: true,
  reason: "allowed-by-role",
  revision: 41,
  decision: { reason: "allowed-by-role", roleId: "technologist", source: "system-domains", secret: "must-not-persist" },
  viewDecision: { allowed: true, reason: "allowed-by-role" },
  principal: {
    id: "employee:employee-qa",
    employeeId: "employee-qa",
    displayName: "Сотрудник QA",
    personnelNumber: "QA-1",
    publicPrincipalId: "public:qa",
    scope: "employee",
  },
};

const HEADERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

function fixtureDirectory() {
  return {
    hidden: { preserve: true },
    operationMap: [],
    componentTypes: [],
    nomenclatureTypes: [
      { id: "type-rea", name: "РЭА компоненты", status: "Активен" },
      { id: "type-pcb", name: "Печатные платы", status: "Активен" },
      { id: "type-mech", name: "Механика", status: "Активен" },
    ],
    nomenclature: [
      {
        id: "nom-board-a",
        name: "Печатная плата A-01",
        article: "A-01",
        type: "Печатные платы",
        sourceBomResultId: "board-a",
        sourceBomIds: ["board-a"],
      },
      {
        id: "nom-r1",
        name: "Резистор 10 кОм",
        article: "R-10K",
        type: "РЭА компоненты",
        package: "0603",
        sourceBomIds: ["board-a"],
      },
      { id: "nom-case", name: "Корпус", article: "CASE-1", type: "Механика" },
    ],
    bomLists: [{
      id: "board-a",
      name: "Плата A",
      boardCode: "A-01",
      resultItem: "Печатная плата A-01",
      status: "Активен",
      importHeaders: [...HEADERS],
      importRows: [{ nomenclatureId: "nom-r1", values: [1, "Резистор", "R1", "R-10K", "", "0603", 1, "", ""] }],
      importedAt: "2026-07-01T00:00:00.000Z",
      sourceFileName: "a.xlsx",
      sourceSheetName: "BOM",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }],
    specifications: [{
      id: "spec-a",
      bomListA: "board-a",
      bomListB: "",
      structureItems: [{ id: "structure-a", bomListId: "board-a", nomenclatureType: "Механика" }],
    }],
    statuses: [{ id: "status-active", name: "Активен" }],
  };
}

function snapshot(version = 7, directory = fixtureDirectory(), extraValues = {}) {
  return {
    version,
    updatedAt: "2026-07-21T00:00:00.000Z",
    updatedBy: { actor: "qa-seed" },
    values: {
      [DIRECTORY_KEY]: JSON.stringify(directory),
      [PLANNING_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
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

function directoryFromSnapshot(value) {
  return JSON.parse(value.values[DIRECTORY_KEY]);
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

async function callDirectoryHttp(filePath, {
  method = "POST",
  pathname = "/api/v1/directory/nomenclature-types",
  body = {},
  headers = {},
  authorizationResult = authorization,
  commandEnv = enabledEnv,
} = {}) {
  const req = makeRequest({ method, headers, body: JSON.stringify(body) });
  const res = makeResponse();
  let authorizationCalls = 0;
  const handled = await handleDirectoryClusterCommandRequest(req, res, new URL(`http://localhost:4175${pathname}`), {
    filePath,
    env: commandEnv,
    getAuthorization: async () => {
      authorizationCalls += 1;
      if (authorizationResult instanceof Error) throw authorizationResult;
      return authorizationResult;
    },
  });
  return {
    handled,
    statusCode: res.statusCode,
    headers: res.headers,
    json: JSON.parse(res.body || "{}"),
    authorizationCalls,
  };
}

async function callSharedState(filePath, payload, env = enabledEnv) {
  const req = makeRequest({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const res = makeResponse();
  await handleSharedStateRequest(req, res, { filePath, env });
  return { statusCode: res.statusCode, json: JSON.parse(res.body || "{}") };
}

const root = await mkdtemp(join(tmpdir(), "mes-directory-cluster-owner-"));
try {
  assert.equal(DIRECTORY_CLUSTER_SERVER_COMMAND_CONTRACT.featureFlag, "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS");
  assert.equal(DIRECTORY_CLUSTER_SERVER_COMMAND_CONTRACT.routes.nomenclatureTypes.capabilities, "/api/v1/directory/nomenclature-types/capabilities");
  assert.deepEqual(matchDirectoryClusterCommandRoute("GET", "/api/v1/directory/nomenclature-types/capabilities"), {
    surface: "nomenclature-types", method: "GET", capabilities: true, command: false, allowedMethod: "GET",
  });
  assert.deepEqual(matchDirectoryClusterCommandRoute("POST", "/api/v1/directory/boards"), {
    surface: "boards", method: "POST", capabilities: false, command: true, allowedMethod: "POST",
  });
  assert.equal(matchDirectoryClusterCommandRoute("GET", "/api/v1/directory/nomenclature-types").capabilities, false, "GET base is not a capabilities alias");

  const commandFile = join(root, "commands.json");
  await writeSnapshot(commandFile, snapshot());
  const createType = {
    kind: "create",
    itemId: "type-cable",
    expectedRevision: 7,
    row: { id: "type-cable", name: "Кабельные сборки", code: "CABLE", status: "Активен" },
  };

  const disabled = await executeDirectoryClusterCommand("nomenclature-types", createType, {
    filePath: commandFile,
    env: {},
    authorization,
    expectedRevision: 7,
    idempotencyKey: "type-create-disabled",
  });
  assert.equal(disabled.code, "directory-cluster-server-commands-disabled");
  const unauthenticated = await executeDirectoryClusterCommand("nomenclature-types", createType, {
    filePath: commandFile,
    env: enabledEnv,
    expectedRevision: 7,
    idempotencyKey: "type-create-unauthenticated",
  });
  assert.equal(unauthenticated.statusCode, 401);
  const denied = await executeDirectoryClusterCommand("nomenclature-types", createType, {
    filePath: commandFile,
    env: enabledEnv,
    authorization: { ...authorization, allowed: false },
    expectedRevision: 7,
    idempotencyKey: "type-create-denied",
  });
  assert.equal(denied.code, "directory-write-forbidden");
  assert.equal((await readSnapshot(commandFile)).version, 7);
  const paddedEntityId = await executeDirectoryClusterCommand("nomenclature-types", {
    ...createType,
    itemId: " type-cable ",
  }, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "padded-entity-id",
  });
  assert.equal(paddedEntityId.code, "directory-entity-id-invalid",
    "the HTTP owner must reject non-canonical entity ids instead of silently normalizing them");
  assert.equal((await readSnapshot(commandFile)).version, 7);

  const nomenclatureBoundaryFile = join(root, "nomenclature-boundary.json");
  const nomenclatureBoundaryDirectory = fixtureDirectory();
  await writeSnapshot(nomenclatureBoundaryFile, snapshot(7, nomenclatureBoundaryDirectory));
  const nomenclatureBoundaryEnv = {
    ...enabledEnv,
    MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  };
  const boardOwnedNomenclatureUpdate = await executeNomenclatureCommand({
    kind: "update",
    itemId: "nom-r1",
    expectedRevision: 7,
    idempotencyKey: "direct-board-owned-update",
    expectedRow: nomenclatureBoundaryDirectory.nomenclature.find((row) => row.id === "nom-r1"),
    row: { id: "nom-r1", name: "Legacy overwrite" },
  }, {
    filePath: nomenclatureBoundaryFile,
    env: nomenclatureBoundaryEnv,
    authorization,
  });
  assert.equal(boardOwnedNomenclatureUpdate.code, "directory-cluster-command-required",
    "the direct Nomenclature owner must not bypass the active Boards/BOM owner");
  assert.equal((await readSnapshot(nomenclatureBoundaryFile)).version, 7);
  const unownedNomenclatureRow = nomenclatureBoundaryDirectory.nomenclature.find((row) => row.id === "nom-case");
  const unownedNomenclatureUpdate = await executeNomenclatureCommand({
    kind: "update",
    itemId: "nom-case",
    expectedRevision: 7,
    idempotencyKey: "direct-unowned-update",
    expectedRow: unownedNomenclatureRow,
    row: { id: "nom-case", name: "Корпус обновлён" },
  }, {
    filePath: nomenclatureBoundaryFile,
    env: nomenclatureBoundaryEnv,
    authorization,
  });
  assert(unownedNomenclatureUpdate.ok && unownedNomenclatureUpdate.revision === 8,
    "the active Directory cluster boundary must preserve normal Nomenclature writes for unowned rows");
  const directBoardOwnershipUpdate = await executeNomenclatureCommand({
    kind: "update",
    itemId: "nom-case",
    expectedRevision: 8,
    idempotencyKey: "direct-board-ownership-update",
    expectedRow: unownedNomenclatureUpdate.item,
    row: { id: "nom-case", sourceBomResultId: "board-a" },
  }, {
    filePath: nomenclatureBoundaryFile,
    env: nomenclatureBoundaryEnv,
    authorization,
  });
  assert.equal(directBoardOwnershipUpdate.code, "directory-cluster-command-required",
    "the direct Nomenclature owner must not attach an existing row to a Board");
  const directBoardOwnershipCreate = await executeNomenclatureCommand({
    kind: "create",
    itemId: "nom-illegal-board-result",
    expectedRevision: 8,
    idempotencyKey: "direct-board-ownership-create",
    row: {
      id: "nom-illegal-board-result",
      name: "Нелегальный результат платы",
      type: "Печатные платы",
      sourceBomResultId: "board-a",
    },
  }, {
    filePath: nomenclatureBoundaryFile,
    env: nomenclatureBoundaryEnv,
    authorization,
  });
  assert.equal(directBoardOwnershipCreate.code, "directory-cluster-command-required",
    "the direct Nomenclature owner must not create a Board-owned row");
  assert.equal((await readSnapshot(nomenclatureBoundaryFile)).version, 8);

  const bomRowDeleteFile = join(root, "bom-row-delete.json");
  const bomRowDeleteDirectory = fixtureDirectory();
  await writeSnapshot(bomRowDeleteFile, snapshot(7, bomRowDeleteDirectory));
  const bomRowDeleteBoard = bomRowDeleteDirectory.bomLists[0];
  const bomRowDeleteSync = inspectBomComponentSync(bomRowDeleteDirectory, {
    boardId: bomRowDeleteBoard.id,
    boardName: bomRowDeleteBoard.name,
    rows: [],
  });
  assert(bomRowDeleteSync.ok);
  const bomRowDeleteBackups = join(root, "bom-row-delete-backups");
  const bomRowDeleteAudit = join(root, "bom-row-delete-audit.log");
  const deletedBomRow = await executeDirectoryClusterCommand("boards", {
    kind: "bom-row-delete",
    boardId: bomRowDeleteBoard.id,
    expectedRevision: 7,
    expectedBoard: bomRowDeleteBoard,
    rowIndex: 0,
    componentSync: {
      upserts: bomRowDeleteSync.upserts,
      detaches: bomRowDeleteSync.detaches,
    },
  }, {
    filePath: bomRowDeleteFile,
    backupDir: bomRowDeleteBackups,
    auditLogPath: bomRowDeleteAudit,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "bom-row-delete",
  });
  assert(deletedBomRow.ok && deletedBomRow.revision === 8 && deletedBomRow.counts.bomRowsDeleted === 1);
  assert.equal((await readdir(bomRowDeleteBackups)).length, 2,
    "destructive BOM-row delete must create data and metadata recovery artifacts");
  const bomRowDeleteAuditEvents = (await readFile(bomRowDeleteAudit, "utf8")).trim().split("\n").map(JSON.parse);
  assert(bomRowDeleteAuditEvents.some((event) => event.action === "directory-cluster-command:boards:bom-row-delete"
    && event.status === "saved" && event.actor === "employee:employee-qa" && event.backupPath));
  const reservedTypeDelete = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "delete",
    itemId: "type-pcb",
  }, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "reserved-type-delete",
  });
  assert.equal(reservedTypeDelete.code, "board-required-type-delete-forbidden",
    "the type owner must not delete a type required by the atomic Boards/BOM owner");
  assert.equal((await readSnapshot(commandFile)).version, 7);

  const created = await executeDirectoryClusterCommand("nomenclature-types", createType, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "type-create-1",
  });
  assert(created.ok && created.statusCode === 201 && created.revision === 8 && created.itemId === "type-cable");
  assert.equal(created.idempotentReplay, false);
  assert.equal(created.row.name, "Кабельные сборки");
  assert.equal(created.directory.nomenclatureTypes.at(-1).id, "type-cable");
  assert.deepEqual(created.receipt, {
    actorId: "employee:employee-qa",
    commandRevision: 8,
    baseRevision: 7,
    rebased: false,
    kind: "create",
    itemId: "type-cable",
    idempotencyKey: "type-create-1",
    destructiveAction: false,
    recoveryArtifact: null,
  });

  const replay = await executeDirectoryClusterCommand("nomenclature-types", createType, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "type-create-1",
  });
  assert(replay.ok && replay.statusCode === 200 && replay.idempotentReplay && replay.revision === 8);
  assert.equal((await readSnapshot(commandFile)).version, 8, "idempotent replay must not write");
  const reusedKey = await executeDirectoryClusterCommand("nomenclature-types", { ...createType, row: { ...createType.row, name: "Другое" } }, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "type-create-1",
  });
  assert.equal(reusedKey.code, "idempotency-conflict");

  const unrelated = await updateSharedStateSnapshot({
    filePath: commandFile,
    expectedVersion: 8,
    update: (current) => ({
      ...current,
      sharedUi: { ...current.sharedUi, unrelated: { preserved: true } },
    }),
  });
  assert(unrelated.ok && unrelated.snapshot.version === 9);
  const createdRow = directoryFromSnapshot(unrelated.snapshot).nomenclatureTypes.find((row) => row.id === "type-cable");
  const renamedRow = { ...createdRow, name: "Кабельные изделия", code: "CABLE-2" };
  const renamed = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "update",
    itemId: "type-cable",
    expectedRevision: 8,
    expectedRow: createdRow,
    row: renamedRow,
  }, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 8,
    idempotencyKey: "type-update-rebased",
  });
  assert(renamed.ok && renamed.rebased && renamed.receipt.baseRevision === 8 && renamed.revision === 10);

  const beforeDelete = clone(renamed.directory);
  const typeImpact = inspectNomenclatureTypeImpact(beforeDelete, "type-cable");
  assert(typeImpact.ok);
  const typeBackups = join(root, "type-backups");
  const auditLogPath = join(root, "directory-audit.log");
  const deletedType = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "delete",
    itemId: "type-cable",
    expectedRevision: 10,
    expectedRow: renamed.row,
    fallbackTypeId: "type-mech",
    fallbackExpectedRow: beforeDelete.nomenclatureTypes.find((row) => row.id === "type-mech"),
    impactFingerprint: typeImpact.fingerprint,
  }, {
    filePath: commandFile,
    backupDir: typeBackups,
    auditLogPath,
    env: enabledEnv,
    authorization,
    expectedRevision: 10,
    idempotencyKey: "type-delete-1",
  });
  assert(deletedType.ok && deletedType.revision === 11 && deletedType.row.id === "type-cable");
  assert.equal(deletedType.receipt.destructiveAction, true);
  assert.equal(deletedType.receipt.recoveryArtifact?.kind, "file-backup");
  assert.equal(deletedType.receipt.recoveryArtifact?.status, "created");
  assert.match(deletedType.receipt.recoveryArtifact?.artifactName || "", /before-directory-nomenclature-types-delete/u);
  assert.match(deletedType.receipt.recoveryArtifact?.metadataName || "", /\.meta\.json$/u);
  assert.equal((await readdir(typeBackups)).length, 2, "destructive type command must create data and metadata recovery artifacts");

  const boardCreate = {
    kind: "board-create",
    boardId: "board-new",
    expectedRevision: 11,
    row: { id: "board-new", name: "Плата New", boardCode: "NEW-01", resultItem: "Печатная плата NEW-01" },
    expectedResultRow: null,
    resultItemId: "nom-board-new",
  };
  const createdBoard = await executeDirectoryClusterCommand("boards", boardCreate, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 11,
    idempotencyKey: "board-create-1",
  });
  assert(createdBoard.ok && createdBoard.statusCode === 201 && createdBoard.revision === 12 && createdBoard.boardId === "board-new");
  assert(createdBoard.directory.nomenclature.some((row) => row.id === "nom-board-new" && row.sourceBomResultId === "board-new"));

  const changedDirectory = clone(createdBoard.directory);
  changedDirectory.statuses.push({ id: "status-remote", name: "Удалённо" });
  const changed = await updateSharedStateSnapshot({
    filePath: commandFile,
    expectedVersion: 12,
    update: (current) => ({
      ...current,
      values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(changedDirectory) },
    }),
  });
  assert(changed.ok && changed.snapshot.version === 13);
  const supersededReplay = await executeDirectoryClusterCommand("boards", boardCreate, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 11,
    idempotencyKey: "board-create-1",
  });
  assert(!supersededReplay.ok && supersededReplay.statusCode === 409 && supersededReplay.conflict
    && supersededReplay.superseded && supersededReplay.idempotentReplay && supersededReplay.revision === 13,
  "a superseded receipt must return the latest projection as an explicit conflict, never success");

  const importDirectory = directoryFromSnapshot(changed.snapshot);
  const importBaseline = fingerprintDirectoryBaseline(importDirectory);
  assert(importBaseline.ok);
  const bomImport = {
    kind: "bom-import",
    boardId: "board-import",
    expectedRevision: 13,
    row: { id: "board-import", name: "Плата Import", boardCode: "IMP-01", resultItem: "Печатная плата IMP-01" },
    headers: [...HEADERS],
    rows: [],
    expectedResultRow: null,
    resultItemId: "nom-board-import",
    expectedDirectoryFingerprint: importBaseline.fingerprint,
    allowRebase: false,
    componentSync: { upserts: [], detaches: [] },
  };
  const newerRevision = await updateSharedStateSnapshot({
    filePath: commandFile,
    expectedVersion: 13,
    update: (current) => ({ ...current, sharedUi: { ...current.sharedUi, otherWriter: true } }),
  });
  assert(newerRevision.ok && newerRevision.snapshot.version === 14);
  const importConflict = await executeDirectoryClusterCommand("boards", bomImport, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 13,
    idempotencyKey: "board-import-stale",
  });
  assert(!importConflict.ok && importConflict.code === "revision-conflict" && importConflict.revision === 14,
    "BOM import must not rebase even when only an unrelated shared-state field changed");
  const imported = await executeDirectoryClusterCommand("boards", { ...bomImport, expectedRevision: 14 }, {
    filePath: commandFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 14,
    idempotencyKey: "board-import-current",
  });
  assert(imported.ok && !imported.rebased && imported.revision === 15 && imported.row.id === "board-import");

  const beforeBoardDelete = imported.directory;
  const boardImpact = inspectBoardDeleteImpact(beforeBoardDelete, "board-new");
  assert(boardImpact.ok);
  const boardBackups = join(root, "board-backups");
  const boardRow = beforeBoardDelete.bomLists.find((row) => row.id === "board-new");
  const deletedBoard = await executeDirectoryClusterCommand("boards", {
    kind: "board-delete",
    boardId: "board-new",
    expectedRevision: 15,
    expectedBoard: boardRow,
    impactFingerprint: boardImpact.fingerprint,
  }, {
    filePath: commandFile,
    backupDir: boardBackups,
    auditLogPath,
    env: enabledEnv,
    authorization,
    expectedRevision: 15,
    idempotencyKey: "board-delete-1",
  });
  assert(deletedBoard.ok && deletedBoard.revision === 16 && !deletedBoard.directory.bomLists.some((row) => row.id === "board-new"));
  assert.equal((await readdir(boardBackups)).length, 2, "destructive Board command must create data and metadata recovery artifacts");
  const audit = (await readFile(auditLogPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert(audit.some((event) => event.action === "directory-cluster-command:nomenclature-types:delete"
    && event.status === "saved" && event.actor === "employee:employee-qa" && event.backupPath));
  assert(audit.some((event) => event.action === "directory-cluster-command:boards:board-delete"
    && event.status === "saved" && event.actor === "employee:employee-qa" && event.backupPath));

  const receipts = JSON.parse((await readSnapshot(commandFile)).values[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]);
  assert(Object.keys(receipts.entries).length >= 6);
  assert(Object.values(receipts.entries).every((receipt) => receipt.actorId === "employee:employee-qa"));
  assert(Object.values(receipts.entries).every((receipt) => receipt.authorizationDecision?.secret === undefined));
  assert(Object.values(receipts.entries).filter((receipt) => receipt.destructiveAction).every((receipt) => (
    receipt.recoveryArtifact?.kind === "file-backup"
      && receipt.recoveryArtifact?.status === "created"
      && receipt.recoveryArtifact?.artifactName
      && receipt.recoveryArtifact?.metadataName
  )), "every destructive success must preserve its recovery evidence in the atomic receipt");

  const auditFallbackFile = join(root, "audit-fallback.json");
  const auditFallbackDirectory = fixtureDirectory();
  auditFallbackDirectory.nomenclatureTypes.push({ id: "type-audit", name: "Audit fallback", status: "Активен" });
  await writeSnapshot(auditFallbackFile, snapshot(7, auditFallbackDirectory));
  const auditFallbackImpact = inspectNomenclatureTypeImpact(auditFallbackDirectory, "type-audit");
  assert(auditFallbackImpact.ok);
  const auditFallbackBackups = join(root, "audit-fallback-backups");
  const auditFallback = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "delete",
    itemId: "type-audit",
    expectedRevision: 7,
    expectedRow: auditFallbackDirectory.nomenclatureTypes.find((row) => row.id === "type-audit"),
    fallbackTypeId: "type-mech",
    fallbackExpectedRow: auditFallbackDirectory.nomenclatureTypes.find((row) => row.id === "type-mech"),
    impactFingerprint: auditFallbackImpact.fingerprint,
  }, {
    filePath: auditFallbackFile,
    backupDir: auditFallbackBackups,
    auditLogPath: root,
    env: enabledEnv,
    authorization,
    expectedRevision: 7,
    idempotencyKey: "type-delete-audit-fallback",
  });
  assert(auditFallback.ok && auditFallback.revision === 8,
    "supplementary audit failure must not erase an already durable command");
  const auditFallbackReceipts = JSON.parse((await readSnapshot(auditFallbackFile)).values[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]);
  const auditFallbackReceipt = Object.values(auditFallbackReceipts.entries).find((receipt) => receipt.idempotencyKey === "type-delete-audit-fallback");
  assert(auditFallbackReceipt?.destructiveAction
    && auditFallbackReceipt.recoveryArtifact?.status === "created"
    && auditFallbackReceipt.recoveryArtifact?.artifactName,
  "atomic receipt must remain the durable audit fallback when the supplementary log is unavailable");

  const current = await readSnapshot(commandFile);
  const legacyChangedTypes = clone(directoryFromSnapshot(current));
  legacyChangedTypes.nomenclatureTypes[0].name = "Legacy overwrite";
  const blockedTypes = validateDirectoryClusterServerAuthorityWrite(current, {
    ...current,
    values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(legacyChangedTypes) },
  }, enabledEnv);
  assert(!blockedTypes.ok && blockedTypes.code === "directory-cluster-command-required");
  const legacyChangedBoardRef = clone(directoryFromSnapshot(current));
  legacyChangedBoardRef.specifications[0].bomListA = "";
  const blockedBoardRef = validateDirectoryClusterServerAuthorityWrite(current, {
    ...current,
    values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(legacyChangedBoardRef) },
  }, enabledEnv);
  assert(!blockedBoardRef.ok && blockedBoardRef.code === "directory-cluster-command-required");

  const bomOnlyOwnedDirectory = clone(directoryFromSnapshot(current));
  bomOnlyOwnedDirectory.nomenclature.push({
    id: "nom-bom-only",
    name: "Компонент только из BOM",
    article: "BOM-ONLY",
    type: "РЭА компоненты",
  });
  bomOnlyOwnedDirectory.bomLists[0].importRows.push({
    nomenclatureId: "nom-bom-only",
    values: [2, "Компонент", "U1", "BOM-ONLY", "", "QFN", 1, "", ""],
  });
  const bomOnlyOwnedSnapshot = {
    ...current,
    values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(bomOnlyOwnedDirectory) },
  };
  const legacyChangedBomOnlyRow = clone(bomOnlyOwnedDirectory);
  legacyChangedBomOnlyRow.nomenclature.find((row) => row.id === "nom-bom-only").name = "Legacy overwrite";
  const blockedBomOnlyRow = validateDirectoryClusterServerAuthorityWrite(bomOnlyOwnedSnapshot, {
    ...bomOnlyOwnedSnapshot,
    values: { ...bomOnlyOwnedSnapshot.values, [DIRECTORY_KEY]: JSON.stringify(legacyChangedBomOnlyRow) },
  }, enabledEnv);
  assert(!blockedBomOnlyRow.ok && blockedBomOnlyRow.code === "directory-cluster-command-required",
    "a Nomenclature row referenced only by a BOM import row must remain under the Boards/BOM owner");

  const genericValues = clone(current.values);
  genericValues[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY] = JSON.stringify({ forged: true });
  const unrelatedDirectory = clone(directoryFromSnapshot(current));
  unrelatedDirectory.statuses.push({ id: "status-safe", name: "Безопасно" });
  genericValues[DIRECTORY_KEY] = JSON.stringify(unrelatedDirectory);
  const genericWrite = await callSharedState(commandFile, {
    baseVersion: current.version,
    clientId: "legacy",
    actor: "spoofed",
    action: "status-save",
    values: genericValues,
    sharedUi: current.sharedUi,
  });
  assert(genericWrite.statusCode === 200, `unrelated legacy write must remain available: ${JSON.stringify(genericWrite.json)}`);
  const afterGeneric = await readSnapshot(commandFile);
  assert.equal(afterGeneric.values[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY], current.values[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY],
    "generic browser POST must preserve server-owned Directory receipts byte-for-byte");

  const httpHeaders = {
    "content-type": "application/json; charset=utf-8",
    host: "pilot.mes-line.ru",
    origin: "https://pilot.mes-line.ru",
    "sec-fetch-site": "same-origin",
    "idempotency-key": "http-type-create",
    "if-match": `"${afterGeneric.version}"`,
  };
  const capabilities = await callDirectoryHttp(commandFile, {
    method: "GET",
    pathname: "/api/v1/directory/nomenclature-types/capabilities",
  });
  assert(capabilities.handled && capabilities.statusCode === 200 && capabilities.json.rbacRevision === 41
    && capabilities.json.directoryRevision === afterGeneric.version
    && capabilities.json.capabilities.canViewNomenclatureTypes
    && capabilities.json.capabilities.canEditNomenclatureTypes
    && capabilities.json.capabilities.serverCommandsEnabled);
  assert.equal(capabilities.json.actor.publicPrincipalId, undefined);
  const getBase = await callDirectoryHttp(commandFile, {
    method: "GET",
    pathname: "/api/v1/directory/nomenclature-types",
  });
  assert.equal(getBase.statusCode, 405, "GET base must not become a compatibility capabilities alias");
  const crossSite = await callDirectoryHttp(commandFile, {
    pathname: "/api/v1/directory/nomenclature-types",
    body: { kind: "create", itemId: "type-http", row: { id: "type-http", name: "HTTP" }, expectedRevision: afterGeneric.version },
    headers: { ...httpHeaders, origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });
  assert(crossSite.statusCode === 403 && crossSite.json.code === "same-origin-required" && crossSite.authorizationCalls === 0);
  const weakEtag = await callDirectoryHttp(commandFile, {
    pathname: "/api/v1/directory/nomenclature-types",
    body: { kind: "create", itemId: "type-http", row: { id: "type-http", name: "HTTP" }, expectedRevision: afterGeneric.version },
    headers: { ...httpHeaders, "if-match": `W/"${afterGeneric.version}"` },
  });
  assert(weakEtag.statusCode === 428 && weakEtag.json.code === "if-match-required" && weakEtag.authorizationCalls === 0);
  const httpCreated = await callDirectoryHttp(commandFile, {
    pathname: "/api/v1/directory/nomenclature-types",
    body: { kind: "create", itemId: "type-http", row: { id: "type-http", name: "HTTP" }, expectedRevision: afterGeneric.version },
    headers: httpHeaders,
  });
  assert(httpCreated.statusCode === 201 && httpCreated.json.ok && httpCreated.json.row.id === "type-http"
    && httpCreated.json.receipt.idempotencyKey === "http-type-create"
    && httpCreated.headers.ETag === `"${afterGeneric.version + 1}"`);
  assert.equal(httpCreated.authorizationCalls, 1);

  const concurrentFile = join(root, "concurrent.json");
  await writeSnapshot(concurrentFile, snapshot());
  const concurrent = await Promise.all([
    executeDirectoryClusterCommand("nomenclature-types", {
      kind: "create", itemId: "type-concurrent-a", row: { id: "type-concurrent-a", name: "Concurrent A" },
    }, {
      filePath: concurrentFile, env: enabledEnv, authorization, expectedRevision: 7, idempotencyKey: "concurrent-a",
    }),
    executeDirectoryClusterCommand("nomenclature-types", {
      kind: "create", itemId: "type-concurrent-b", row: { id: "type-concurrent-b", name: "Concurrent B" },
    }, {
      filePath: concurrentFile, env: enabledEnv, authorization, expectedRevision: 7, idempotencyKey: "concurrent-b",
    }),
  ]);
  assert(concurrent.every((result) => result.ok), `disjoint concurrent commands must both succeed: ${JSON.stringify(concurrent)}`);
  assert(concurrent.some((result) => result.rebased), "the command that loses the first CAS must report an exact-baseline rebase");
  assert.equal((await readSnapshot(concurrentFile)).version, 9);

  const actorScopedFile = join(root, "actor-scoped.json");
  await writeSnapshot(actorScopedFile, snapshot());
  const otherAuthorization = {
    ...authorization,
    principal: {
      ...authorization.principal,
      id: "employee:employee-other",
      employeeId: "employee-other",
      displayName: "Другой сотрудник",
    },
  };
  const firstActor = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "create", itemId: "type-actor-a", row: { id: "type-actor-a", name: "Actor A" },
  }, {
    filePath: actorScopedFile, env: enabledEnv, authorization, expectedRevision: 7, idempotencyKey: "same-key",
  });
  const secondActor = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "create", itemId: "type-actor-b", row: { id: "type-actor-b", name: "Actor B" },
  }, {
    filePath: actorScopedFile, env: enabledEnv, authorization: otherAuthorization, expectedRevision: 7, idempotencyKey: "same-key",
  });
  assert(firstActor.ok && secondActor.ok && secondActor.rebased, "the same Idempotency-Key must occupy independent actor scopes");
  const actorReceipts = JSON.parse((await readSnapshot(actorScopedFile)).values[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]);
  assert.equal(Object.keys(actorReceipts.entries).length, 2);
  assert.deepEqual(new Set(Object.values(actorReceipts.entries).map((receipt) => receipt.actorId)), new Set([
    "employee:employee-qa",
    "employee:employee-other",
  ]));

  const malformedReceiptFile = join(root, "malformed-receipts.json");
  await writeSnapshot(malformedReceiptFile, snapshot(3, fixtureDirectory(), {
    [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: "{broken",
  }));
  const malformedReceipt = await executeDirectoryClusterCommand("nomenclature-types", {
    kind: "create", itemId: "type-malformed", row: { id: "type-malformed", name: "Malformed" },
  }, {
    filePath: malformedReceiptFile,
    env: enabledEnv,
    authorization,
    expectedRevision: 3,
    idempotencyKey: "malformed-receipts",
  });
  assert.equal(malformedReceipt.code, "invalid-directory-idempotency-projection");
  assert.equal((await readSnapshot(malformedReceiptFile)).version, 3, "malformed receipts must fail closed without reset");

  console.log("Directory cluster server command owner QA: OK");
  console.log("- signed employee authority, exact CAS and actor-scoped idempotency: pass");
  console.log("- safe exact-baseline rebase and strict no-rebase BOM import: pass");
  console.log("- destructive type/Board/BOM-row backup plus audit and legacy/cross-owner guards: pass");
  console.log("- canonical capability/command routes, strong ETag and authoritative Directory response: pass");
} finally {
  await rm(root, { recursive: true, force: true });
}
