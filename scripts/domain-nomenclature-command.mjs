import { createHash } from "node:crypto";

import {
  NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY,
  readSharedStateSnapshot,
  updateSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";
import {
  appendSharedStateAudit,
  backupSharedStateFile,
} from "./shared-state-storage.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const MAX_COMMAND_BODY_BYTES = 512 * 1024;
const MAX_COMMAND_ROW_BYTES = 128 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;
const MAX_RECEIPTS = 500;
const MAX_PROJECTION_JSON_DEPTH = 64;
const MAX_PROJECTION_JSON_NODES = 1_000_000;
const MAX_PROJECTION_JSON_KEYS = 500_000;
const REFERENCE_KEYS = new Set(["nomenclatureId", "outputNomenclatureId"]);
const DIRECTORY_CLUSTER_SERVER_COMMANDS_FLAG = "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS";

export const NOMENCLATURE_COMMAND_JSON_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 20_000,
  maxKeys: 10_000,
  maxRowBytes: MAX_COMMAND_ROW_BYTES,
});

export const NOMENCLATURE_SERVER_COMMAND_CONTRACT = Object.freeze({
  apiVersion: "v1",
  basePath: "/api/v1/nomenclature",
  featureFlag: "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS",
  methods: Object.freeze({ create: "POST", update: "PATCH", delete: "DELETE" }),
  authorization: Object.freeze({
    contextKey: "authorization",
    requiredDecision: "allowed === true",
    principalId: "employee:<employeeId>",
  }),
  concurrency: Object.freeze({ revisionHeader: "If-Match", idempotencyHeader: "Idempotency-Key" }),
  destructiveDelete: Object.freeze({ fileBackup: "required-before-write", auditActor: "authorization.principal" }),
});

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sameRow(left, right) {
  return stableJson(left) === stableJson(right);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function text(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function rawIdentifier(value) {
  return typeof value === "string" ? value.trim() : "";
}

function exactItemId(value) {
  const itemId = rawIdentifier(value);
  return itemId && itemId.length <= 160 ? itemId : "";
}

export function safeNonNegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function resultError(statusCode, code, error, details = {}) {
  return { ok: false, statusCode, code, error, ...details };
}

export function inspectJsonShape(value, {
  maxDepth,
  maxNodes,
  maxKeys,
  statusCode = 413,
  codePrefix = "json",
  subject = "JSON value",
} = {}) {
  const stack = [{ value, depth: 0, exit: false }];
  const active = new WeakSet();
  let nodes = 0;
  let keys = 0;

  while (stack.length) {
    const current = stack.pop();
    if (current.exit) {
      active.delete(current.value);
      continue;
    }
    nodes += 1;
    if (nodes > maxNodes) {
      return resultError(statusCode, `${codePrefix}-node-limit`, `${subject} contains too many JSON values`);
    }
    if (current.depth > maxDepth) {
      return resultError(statusCode, `${codePrefix}-depth-limit`, `${subject} is nested too deeply`);
    }
    if (current.value === null || ["string", "boolean"].includes(typeof current.value)) continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        return resultError(400, `${codePrefix}-invalid`, `${subject} contains a non-JSON number`);
      }
      continue;
    }
    if (typeof current.value !== "object") {
      return resultError(400, `${codePrefix}-invalid`, `${subject} contains a value that JSON cannot represent`);
    }
    if (active.has(current.value)) {
      return resultError(400, `${codePrefix}-invalid`, `${subject} contains a cyclic reference`);
    }
    active.add(current.value);
    stack.push({ value: current.value, depth: current.depth, exit: true });

    if (Array.isArray(current.value)) {
      if (current.value.length > maxNodes - nodes) {
        return resultError(statusCode, `${codePrefix}-node-limit`, `${subject} contains too many JSON values`);
      }
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], depth: current.depth + 1, exit: false });
      }
      continue;
    }

    const childValues = [];
    try {
      for (const key in current.value) {
        if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue;
        keys += 1;
        if (keys > maxKeys) {
          return resultError(statusCode, `${codePrefix}-key-limit`, `${subject} contains too many object keys`);
        }
        childValues.push(current.value[key]);
      }
    } catch {
      return resultError(400, `${codePrefix}-invalid`, `${subject} cannot be read as JSON`);
    }
    for (let index = childValues.length - 1; index >= 0; index -= 1) {
      stack.push({ value: childValues[index], depth: current.depth + 1, exit: false });
    }
  }

  return { ok: true, nodes, keys };
}

function inspectCommandJson(value, subject = "Nomenclature command") {
  return inspectJsonShape(value, {
    ...NOMENCLATURE_COMMAND_JSON_LIMITS,
    codePrefix: "command-json",
    subject,
  });
}

function inspectProjectionJson(value, subject) {
  return inspectJsonShape(value, {
    maxDepth: MAX_PROJECTION_JSON_DEPTH,
    maxNodes: MAX_PROJECTION_JSON_NODES,
    maxKeys: MAX_PROJECTION_JSON_KEYS,
    statusCode: 503,
    codePrefix: "projection-json",
    subject,
  });
}

function scalarText(value, maxLength = 200) {
  return ["string", "number", "boolean"].includes(typeof value) ? text(value, maxLength) : "";
}

function normalizeAuthorizationDecision(value) {
  if (typeof value === "string") return text(value, 300);
  if (!isRecord(value)) return null;
  const allowedKeys = ["reason", "policy", "source", "roleId", "grantId", "action", "resource"];
  const decision = Object.fromEntries(allowedKeys.flatMap((key) => {
    const normalized = scalarText(value[key], 300);
    return normalized ? [[key, normalized]] : [];
  }));
  return Object.keys(decision).length ? decision : null;
}

export function normalizeOptionalRevision(value) {
  if (value === undefined || value === null) return null;
  return safeNonNegativeInteger(value);
}

function parseDirectory(snapshot) {
  const raw = snapshot?.values?.[DIRECTORY_STORAGE_KEY];
  if (typeof raw !== "string" || !raw) {
    return resultError(503, "directory-projection-unavailable", "Nomenclature directory projection is unavailable");
  }
  let directory;
  try { directory = JSON.parse(raw); }
  catch { return resultError(503, "invalid-directory-projection", "Nomenclature directory projection is not valid JSON"); }
  const shape = inspectProjectionJson(directory, "Nomenclature directory projection");
  if (!shape.ok) {
    return resultError(503, "invalid-directory-projection", "Nomenclature directory projection exceeds safe structural limits", {
      reason: shape.code,
    });
  }
  if (!isRecord(directory)
    || !Array.isArray(directory.nomenclature)
    || !Array.isArray(directory.nomenclatureTypes)
    || !Array.isArray(directory.bomLists)
    || !Array.isArray(directory.specifications)) {
    return resultError(503, "invalid-directory-projection", "Nomenclature command requires complete Nomenclature, type, BOM and Specifications arrays");
  }
  const ids = new Set();
  for (const row of directory.nomenclature) {
    const itemId = isRecord(row) ? exactItemId(row.id) : "";
    if (!itemId || ids.has(itemId)) {
      return resultError(503, "invalid-directory-projection", "Nomenclature projection contains a missing or duplicate item id");
    }
    ids.add(itemId);
  }
  return { ok: true, raw, directory, ids };
}

export function normalizePrincipal(authorization) {
  if (!authorization) {
    return resultError(401, "employee-principal-required", "A server-derived employee principal is required to edit Nomenclature");
  }
  if (authorization.allowed !== true) {
    return resultError(403, "nomenclature-write-forbidden", "Current employee is not authorized to edit Nomenclature");
  }
  const principal = authorization.principal;
  const employeeId = text(principal?.employeeId, 160);
  const actorId = text(principal?.id, 200);
  if (!employeeId || actorId !== `employee:${employeeId}` || String(principal?.scope || "") !== "employee") {
    return resultError(401, "employee-principal-required", "A server-derived employee principal is required to edit Nomenclature");
  }
  return {
    ok: true,
    actor: Object.freeze({
      id: actorId,
      employeeId,
      displayName: text(principal.displayName, 300),
      personnelNumber: text(principal.personnelNumber, 120),
      publicPrincipalId: text(principal.publicPrincipalId, 200),
      scope: "employee",
    }),
    authorizationRevision: normalizeOptionalRevision(authorization.revision),
    authorizationDecision: normalizeAuthorizationDecision(authorization.decision),
  };
}

function normalizeExpectedRevision(value) {
  return safeNonNegativeInteger(value);
}

function normalizeCommand(input = {}) {
  const kind = text(input.kind, 20).toLowerCase();
  if (!new Set(["create", "update", "delete"]).has(kind)) {
    return resultError(400, "invalid-command", "Nomenclature command kind must be create, update or delete");
  }
  const idempotencyKey = text(input.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH + 1);
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return resultError(400, "idempotency-key-required", "A bounded Idempotency-Key is required");
  }
  const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
  if (expectedRevision === null) {
    return resultError(400, "expected-revision-required", "A non-negative shared-state expected revision is required");
  }
  const inputRow = isRecord(input.row) ? input.row : null;
  const inputExpectedRow = isRecord(input.expectedRow) ? input.expectedRow : null;
  const shape = inspectCommandJson({ row: inputRow, expectedRow: inputExpectedRow }, "Nomenclature command rows");
  if (!shape.ok) return shape;
  let rawRow = null;
  let rawExpectedRow = null;
  try {
    rawRow = inputRow ? cloneJson(inputRow) : null;
    rawExpectedRow = inputExpectedRow ? cloneJson(inputExpectedRow) : null;
  } catch {
    return resultError(400, "command-json-invalid", "Nomenclature command rows must be valid JSON values");
  }
  const clonedShape = inspectCommandJson({ row: rawRow, expectedRow: rawExpectedRow }, "Nomenclature command rows");
  if (!clonedShape.ok) return clonedShape;
  const rawItemId = rawIdentifier(input.itemId || rawRow?.id);
  const itemId = exactItemId(rawItemId);
  if (!rawItemId) return resultError(400, "item-id-required", "Nomenclature item id is required");
  if (!itemId) return resultError(400, "item-id-invalid", "Nomenclature item id must be a string of at most 160 characters");
  try {
    if ([rawRow, rawExpectedRow].filter(Boolean).some((value) => Buffer.byteLength(JSON.stringify(value)) > MAX_COMMAND_ROW_BYTES)) {
      return resultError(413, "row-too-large", "Nomenclature row is too large");
    }
  } catch {
    return resultError(400, "command-json-invalid", "Nomenclature command rows must be valid JSON values");
  }
  if (["create", "update"].includes(kind) && (!rawRow || exactItemId(rawRow.id) !== itemId)) {
    return resultError(422, "invalid-row", "Create and update commands require a row with the exact target id");
  }
  if (["update", "delete"].includes(kind) && (!rawExpectedRow || exactItemId(rawExpectedRow.id) !== itemId)) {
    return resultError(422, "expected-row-required", "Update and delete commands require the exact previously read row");
  }
  const command = { kind, itemId, expectedRevision, idempotencyKey, row: rawRow, expectedRow: rawExpectedRow };
  return {
    ok: true,
    command,
    requestFingerprint: createHash("sha256").update(stableJson({
      kind,
      itemId,
      expectedRevision,
      row: rawRow,
      expectedRow: rawExpectedRow,
    })).digest("hex"),
  };
}

function findExistingType(directory, typeName) {
  const normalized = text(typeName, 300).toLocaleLowerCase("ru-RU");
  return normalized
    ? directory.nomenclatureTypes.find((row) => text(row?.name, 300).toLocaleLowerCase("ru-RU") === normalized) || null
    : null;
}

function validateAndBuildRow(directory, command, currentRow, now) {
  const source = command.kind === "create"
    ? command.row
    : { ...currentRow, ...command.row, id: command.itemId };
  const name = text(source?.name, 500);
  const type = text(source?.type, 300);
  if (!name) return resultError(422, "name-required", "Nomenclature name is required");
  if (!type) return resultError(422, "type-required", "Nomenclature type is required");
  const typeRow = findExistingType(directory, type);
  if (!typeRow) {
    return resultError(422, "nomenclature-type-not-found", "Nomenclature type must already exist in the Nomenclature Types directory");
  }
  return {
    ok: true,
    row: {
      ...cloneJson(source),
      id: command.itemId,
      name,
      type: text(typeRow.name, 300),
      updatedAt: now,
    },
  };
}

function rewriteNomenclatureReferences(value, itemId, stats, area) {
  if (Array.isArray(value)) return value.map((entry) => rewriteNomenclatureReferences(entry, itemId, stats, area));
  if (!isRecord(value)) return value;
  let changed = false;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (REFERENCE_KEYS.has(key) && rawIdentifier(entry) === itemId) {
      next[key] = "";
      stats[area] += 1;
      changed = true;
      continue;
    }
    const rewritten = rewriteNomenclatureReferences(entry, itemId, stats, area);
    next[key] = rewritten;
    if (rewritten !== entry) changed = true;
  }
  return changed ? next : value;
}

function collectDanglingReferences(value, validIds, path, result) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDanglingReferences(entry, validIds, `${path}[${index}]`, result));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([key, entry]) => {
    const entryPath = `${path}.${key}`;
    if (REFERENCE_KEYS.has(key)) {
      const itemId = rawIdentifier(entry);
      if (itemId && !validIds.has(itemId)) result.push({ path: entryPath, itemId });
      return;
    }
    collectDanglingReferences(entry, validIds, entryPath, result);
  });
}

function validateReferences(directory) {
  const validIds = new Set(directory.nomenclature.map((row) => exactItemId(row?.id)).filter(Boolean));
  const danglingReferences = [];
  collectDanglingReferences(directory.bomLists, validIds, "bomLists", danglingReferences);
  collectDanglingReferences(directory.specifications, validIds, "specifications", danglingReferences);
  return danglingReferences.length
    ? resultError(409, "dangling-nomenclature-reference", "Nomenclature command projection contains dangling BOM or Specifications references", { danglingReferences: danglingReferences.slice(0, 50) })
    : { ok: true };
}

function applyCommand(directory, command, now) {
  const index = directory.nomenclature.findIndex((row) => exactItemId(row?.id) === command.itemId);
  if (command.kind === "create") {
    if (index >= 0) return resultError(409, "same-row-conflict", "Nomenclature item already exists");
    const built = validateAndBuildRow(directory, command, null, now);
    if (!built.ok) return built;
    const nextDirectory = { ...directory, nomenclature: [...directory.nomenclature, built.row] };
    const references = validateReferences(nextDirectory);
    return references.ok ? { ok: true, directory: nextDirectory, item: built.row, unlinkedReferences: { bom: 0, specifications: 0 } } : references;
  }
  if (index < 0 || !sameRow(directory.nomenclature[index], command.expectedRow)) {
    return resultError(409, "same-row-conflict", "Nomenclature item changed after it was read");
  }
  if (command.kind === "update") {
    const built = validateAndBuildRow(directory, command, directory.nomenclature[index], now);
    if (!built.ok) return built;
    const nextDirectory = {
      ...directory,
      nomenclature: directory.nomenclature.map((row, rowIndex) => rowIndex === index ? built.row : row),
    };
    const references = validateReferences(nextDirectory);
    return references.ok ? { ok: true, directory: nextDirectory, item: built.row, unlinkedReferences: { bom: 0, specifications: 0 } } : references;
  }
  const stats = { bom: 0, specifications: 0 };
  const nextDirectory = {
    ...directory,
    nomenclature: directory.nomenclature.filter((_, rowIndex) => rowIndex !== index),
    bomLists: rewriteNomenclatureReferences(directory.bomLists, command.itemId, stats, "bom"),
    specifications: rewriteNomenclatureReferences(directory.specifications, command.itemId, stats, "specifications"),
  };
  const references = validateReferences(nextDirectory);
  return references.ok
    ? { ok: true, directory: nextDirectory, item: directory.nomenclature[index], unlinkedReferences: stats }
    : references;
}

function validateDirectoryClusterNomenclatureBoundary(directory, command, env) {
  if (String(env?.[DIRECTORY_CLUSTER_SERVER_COMMANDS_FLAG] || "") !== "1") return { ok: true };
  const current = directory.nomenclature.find((row) => exactItemId(row?.id) === command.itemId) || null;
  const candidate = command.kind === "create"
    ? command.row
    : command.kind === "update" && current
      ? { ...current, ...command.row, id: current.id }
      : current;
  const hasBoardOwner = Boolean(exactItemId(candidate?.sourceBomResultId))
    || (Array.isArray(candidate?.sourceBomIds) && candidate.sourceBomIds.some((boardId) => Boolean(exactItemId(boardId))))
    || Boolean(exactItemId(current?.sourceBomResultId))
    || (Array.isArray(current?.sourceBomIds) && current.sourceBomIds.some((boardId) => Boolean(exactItemId(boardId))))
    || directory.bomLists.some((board) => Array.isArray(board?.importRows)
      && board.importRows.some((row) => exactItemId(row?.nomenclatureId) === command.itemId));
  return hasBoardOwner
    ? resultError(409, "directory-cluster-command-required", "Board/BOM-owned Nomenclature rows can only be changed through the Directory cluster command owner", {
      conflict: true,
      itemId: command.itemId,
    })
    : { ok: true };
}

function isValidReceiptEntry(key, receipt) {
  const employeeId = text(receipt?.employeeId, 160);
  return /^[a-f0-9]{64}$/.test(key)
    && isRecord(receipt)
    && /^[a-f0-9]{64}$/.test(String(receipt.requestFingerprint || ""))
    && ["create", "update", "delete"].includes(receipt.kind)
    && Boolean(exactItemId(receipt.itemId))
    && isRecord(receipt.item)
    && Number.isSafeInteger(receipt.commandRevision)
    && receipt.commandRevision > 0
    && Number.isSafeInteger(receipt.baseRevision)
    && receipt.baseRevision >= 0
    && typeof receipt.rebased === "boolean"
    && Boolean(employeeId)
    && text(receipt.actorId, 200) === `employee:${employeeId}`
    && Boolean(text(receipt.createdAt, 100));
}

function parseReceipts(snapshot) {
  const raw = snapshot?.values?.[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY];
  if (raw === undefined || raw === null || raw === "") return { schemaVersion: 1, entries: {}, invalid: false };
  if (typeof raw !== "string") return { schemaVersion: 1, entries: {}, invalid: true };
  try {
    const parsed = JSON.parse(raw);
    if (!inspectProjectionJson(parsed, "Nomenclature command receipts").ok) {
      return { schemaVersion: 1, entries: {}, invalid: true };
    }
    if (!isRecord(parsed) || Number(parsed.schemaVersion || 0) !== 1 || !isRecord(parsed.entries)) {
      return { schemaVersion: 1, entries: {}, invalid: true };
    }
    const entries = Object.entries(parsed.entries);
    if (entries.length > MAX_RECEIPTS || entries.some(([key, receipt]) => !isValidReceiptEntry(key, receipt))) {
      return { schemaVersion: 1, entries: {}, invalid: true };
    }
    return { schemaVersion: 1, entries: parsed.entries, invalid: false };
  } catch {
    return { schemaVersion: 1, entries: {}, invalid: true };
  }
}

export function receiptKey(actorId, idempotencyKey) {
  return createHash("sha256").update(`${actorId}\0${idempotencyKey}`).digest("hex");
}

export function appendReceipt(receipts, key, receipt) {
  const entries = { ...receipts.entries, [key]: receipt };
  const sorted = Object.entries(entries).sort((left, right) => (
    String(right[1]?.createdAt || "").localeCompare(String(left[1]?.createdAt || ""))
  ));
  return { schemaVersion: 1, entries: Object.fromEntries(sorted.slice(0, MAX_RECEIPTS)) };
}

function projectionFromSnapshot(snapshot) {
  const parsed = parseDirectory(snapshot);
  return parsed.ok ? {
    revision: Number(snapshot.version || 0),
    updatedAt: String(snapshot.updatedAt || ""),
    directory: parsed.directory,
  } : null;
}

function isReceiptSuperseded(snapshot, receipt) {
  const parsed = parseDirectory(snapshot);
  if (!parsed.ok) return true;
  const currentItem = parsed.directory.nomenclature.find((row) => exactItemId(row?.id) === receipt.itemId) || null;
  return receipt.kind === "delete"
    ? currentItem !== null
    : !currentItem || !sameRow(currentItem, receipt.item);
}

function successFromReceipt(snapshot, receipt, replayed) {
  return {
    ok: true,
    statusCode: replayed ? 200 : receipt.kind === "create" ? 201 : 200,
    apiVersion: "v1",
    replayed,
    superseded: replayed ? isReceiptSuperseded(snapshot, receipt) : false,
    kind: receipt.kind,
    itemId: receipt.itemId,
    item: receipt.item,
    commandRevision: Number(receipt.commandRevision || 0),
    revision: Number(snapshot.version || 0),
    unlinkedReferences: receipt.unlinkedReferences || { bom: 0, specifications: 0 },
    rebased: receipt.rebased === true,
    baseRevision: Number(receipt.baseRevision ?? receipt.commandRevision - 1),
    actorId: receipt.actorId,
    projection: projectionFromSnapshot(snapshot),
  };
}

export async function executeNomenclatureCommand(input = {}, {
  env = process.env,
  filePath = "",
  backupDir = "",
  auditLogPath = "",
  authorization = null,
  maxAttempts = 4,
} = {}) {
  if (String(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS || "") !== "1") {
    return resultError(409, "nomenclature-server-commands-disabled", "Nomenclature server commands are not enabled");
  }
  const authorized = normalizePrincipal(authorization);
  if (!authorized.ok) return authorized;
  const normalized = normalizeCommand(input);
  if (!normalized.ok) return normalized;
  const { actor } = authorized;
  const { command, requestFingerprint } = normalized;
  const key = receiptKey(actor.id, command.idempotencyKey);
  let latestConflictSnapshot = null;

  for (let attempt = 0; attempt < Math.max(1, Number(maxAttempts) || 1); attempt += 1) {
    let read;
    try { read = await readSharedStateSnapshot({ env, filePath }); }
    catch (error) {
      return resultError(503, "nomenclature-command-storage-unavailable", error?.message || "Nomenclature command storage is unavailable", { retryable: true });
    }
    if (!read.configured) return resultError(503, "shared-state-unconfigured", "Shared-state storage is not configured");
    const current = read.snapshot;
    const parsed = parseDirectory(current);
    if (!parsed.ok) return parsed;
    const receipts = parseReceipts(current);
    if (receipts.invalid) {
      return resultError(503, "invalid-idempotency-projection", "Nomenclature idempotency projection is invalid and was not overwritten");
    }
    const existingReceipt = receipts.entries[key];
    if (existingReceipt) {
      if (existingReceipt.requestFingerprint !== requestFingerprint) {
        return resultError(409, "idempotency-conflict", "Idempotency-Key was already used for a different Nomenclature command", {
          revision: Number(current.version || 0),
          projection: projectionFromSnapshot(current),
        });
      }
      return successFromReceipt(current, existingReceipt, true);
    }
    if (command.expectedRevision > Number(current.version || 0)) {
      return resultError(409, "revision-conflict", "Nomenclature command references a future shared-state revision", {
        conflict: true,
        revision: Number(current.version || 0),
        projection: projectionFromSnapshot(current),
      });
    }
    const now = new Date().toISOString();
    const clusterBoundary = validateDirectoryClusterNomenclatureBoundary(parsed.directory, command, env);
    if (!clusterBoundary.ok) {
      return { ...clusterBoundary, revision: Number(current.version || 0), projection: projectionFromSnapshot(current) };
    }
    const mutation = applyCommand(parsed.directory, command, now);
    if (!mutation.ok) {
      return { ...mutation, revision: Number(current.version || 0), projection: projectionFromSnapshot(current) };
    }
    const commandRevision = Number(current.version || 0) + 1;
    let receipt = null;
    let lockedFailure = null;
    let deleteBackup = null;
    let deleteBackupFailure = null;
    let update;
    try {
      update = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: Number(current.version || 0),
        planningObservationSource: `nomenclature-command:${command.kind}`,
        beforeWrite: async ({ store }) => {
          if (command.kind !== "delete") return;
          if (store.kind !== "file") {
            deleteBackupFailure = Object.assign(new Error(`Nomenclature delete recovery artifact is not supported for ${store.kind || "unknown"} storage`), {
              code: "NOMENCLATURE_DELETE_BACKUP_UNSUPPORTED",
            });
            await appendSharedStateAudit({
              auditLogPath,
              event: {
                action: "nomenclature-command:delete",
                status: "denied",
                reason: "backup-storage-unsupported",
                destructiveAction: true,
                actor: actor.id,
                employeeId: actor.employeeId,
                itemId: command.itemId,
                storageKind: text(store.kind, 80) || "unknown",
              },
            }).catch(() => {});
            throw deleteBackupFailure;
          }
          try {
            deleteBackup = await backupSharedStateFile({
              filePath: store.filePath || filePath,
              backupDir,
              reason: "before-nomenclature-command-delete",
              actor: actor.id,
              env,
              allowMissing: false,
            });
          } catch (error) {
            deleteBackupFailure = error;
            await appendSharedStateAudit({
              auditLogPath,
              event: {
                action: "nomenclature-command:delete",
                status: "denied",
                reason: "backup-failed",
                destructiveAction: true,
                actor: actor.id,
                employeeId: actor.employeeId,
                itemId: command.itemId,
                error: text(error?.message, 300),
              },
            }).catch(() => {});
            throw Object.assign(new Error(error?.message || "Nomenclature delete backup failed"), {
              code: "NOMENCLATURE_DELETE_BACKUP_FAILED",
            });
          }
        },
        update: (latest) => {
          const latestProjection = parseDirectory(latest);
          const latestReceipts = parseReceipts(latest);
          if (!latestProjection.ok || latestReceipts.invalid) {
            lockedFailure = latestProjection.ok
              ? resultError(503, "invalid-idempotency-projection", "Nomenclature idempotency projection is invalid and was not overwritten")
              : latestProjection;
            throw Object.assign(new Error(lockedFailure.error), { code: "NOMENCLATURE_COMMAND_REJECTED" });
          }
          const latestClusterBoundary = validateDirectoryClusterNomenclatureBoundary(latestProjection.directory, command, env);
          if (!latestClusterBoundary.ok) {
            lockedFailure = latestClusterBoundary;
            throw Object.assign(new Error(latestClusterBoundary.error), { code: "NOMENCLATURE_COMMAND_REJECTED" });
          }
          const latestMutation = applyCommand(latestProjection.directory, command, now);
          if (!latestMutation.ok) {
            lockedFailure = latestMutation;
            throw Object.assign(new Error(latestMutation.error), { code: "NOMENCLATURE_COMMAND_REJECTED" });
          }
          receipt = {
            requestFingerprint,
            kind: command.kind,
            itemId: command.itemId,
            item: latestMutation.item,
            commandRevision,
            unlinkedReferences: latestMutation.unlinkedReferences,
            actorId: actor.id,
            employeeId: actor.employeeId,
            authorizationRevision: authorized.authorizationRevision,
            authorizationDecision: authorized.authorizationDecision,
            baseRevision: command.expectedRevision,
            rebased: command.expectedRevision < Number(latest.version || 0),
            createdAt: now,
          };
          const nextReceipts = appendReceipt(latestReceipts, key, receipt);
          return {
            ...latest,
            values: {
              ...(latest.values || {}),
              [DIRECTORY_STORAGE_KEY]: JSON.stringify(latestMutation.directory),
              [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify(nextReceipts),
            },
            updatedBy: {
              actor: actor.id,
              employeeId: actor.employeeId,
              displayName: actor.displayName,
            },
            events: [{
              action: `nomenclature-command:${command.kind}`,
              actor: actor.id,
              employeeId: actor.employeeId,
              itemId: command.itemId,
              authorizationRevision: authorized.authorizationRevision,
              authorizationDecision: authorized.authorizationDecision,
              createdAt: now,
              version: commandRevision,
            }, ...(latest.events || [])].slice(0, 50),
          };
        },
      });
    } catch (error) {
      if (["NOMENCLATURE_DELETE_BACKUP_FAILED", "NOMENCLATURE_DELETE_BACKUP_UNSUPPORTED"].includes(error?.code) || deleteBackupFailure) {
        return resultError(503, "nomenclature-delete-backup-failed", "Nomenclature delete was denied because the required shared-state backup failed", {
          retryable: true,
        });
      }
      if (error?.code === "NOMENCLATURE_COMMAND_REJECTED" && lockedFailure) {
        return { ...lockedFailure, revision: Number(current.version || 0), projection: projectionFromSnapshot(current) };
      }
      return resultError(503, "nomenclature-command-persistence-failed", error?.message || "Nomenclature command storage is unavailable", { retryable: true });
    }
    if (update.ok && receipt) {
      if (command.kind === "delete") {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action: "nomenclature-command:delete",
            status: "saved",
            destructiveAction: true,
            version: Number(update.snapshot.version || 0),
            actor: actor.id,
            employeeId: actor.employeeId,
            itemId: command.itemId,
            backupPath: deleteBackup?.backupPath || "",
          },
        }).catch(() => {});
      }
      return successFromReceipt(update.snapshot, receipt, false);
    }
    if (!update.conflict) {
      return resultError(update.forbidden ? 403 : 503, "nomenclature-command-persistence-failed", update.error || "Nomenclature command was not durably persisted", {
        retryable: update.retryable === true,
      });
    }
    latestConflictSnapshot = update.snapshot || latestConflictSnapshot;
  }
  const latestRevision = safeNonNegativeInteger(latestConflictSnapshot?.version);
  const latestProjection = latestConflictSnapshot ? projectionFromSnapshot(latestConflictSnapshot) : null;
  if (latestRevision === null || !latestProjection) {
    return resultError(503, "nomenclature-command-storage-unavailable", "Latest shared-state projection is unavailable after a concurrent write", {
      retryable: true,
    });
  }
  return resultError(409, "revision-conflict", "Shared-state revision changed concurrently", {
    conflict: true,
    revision: latestRevision,
    projection: latestProjection,
  });
}

export function matchNomenclatureCommandRoute(method = "", pathname = "") {
  const normalizedMethod = String(method || "").toUpperCase();
  const match = String(pathname || "").match(/^\/api\/v1\/nomenclature(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  let itemId = "";
  try { itemId = match[1] ? rawIdentifier(decodeURIComponent(match[1])) : ""; }
  catch { return null; }
  if (normalizedMethod === "POST" && !itemId) return { kind: "create", itemId: "" };
  if (normalizedMethod === "PATCH" && itemId) return { kind: "update", itemId };
  if (normalizedMethod === "DELETE" && itemId) return { kind: "delete", itemId };
  return null;
}

export function isNomenclatureCommandRequest(req, url) {
  return Boolean(matchNomenclatureCommandRoute(req?.method, url?.pathname));
}

export function readBody(req, limit = MAX_COMMAND_BODY_BYTES, inspect = inspectCommandJson) {
  if (isRecord(req?.body)) {
    const shape = inspect(req.body);
    if (!shape.ok) return Promise.reject(Object.assign(new Error(shape.error), { statusCode: shape.statusCode, code: shape.code }));
    let serializedBody;
    try { serializedBody = JSON.stringify(req.body); }
    catch { return Promise.reject(Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400, code: "command-json-invalid" })); }
    if (Buffer.byteLength(serializedBody) > limit) return Promise.reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
    try { return Promise.resolve(JSON.parse(serializedBody)); }
    catch { return Promise.reject(Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400, code: "command-json-invalid" })); }
  }
  if (typeof req?.body === "string") {
    if (Buffer.byteLength(req.body) > limit) return Promise.reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
    try { return Promise.resolve(JSON.parse(req.body || "{}")); }
    catch { return Promise.reject(Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400 })); }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
        req.destroy?.();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400 })); }
    });
    req.on("error", reject);
  });
}

export function parseIfMatch(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^"(\d+)"$/);
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export function getRequestHeader(req, name) {
  const normalized = String(name || "").toLowerCase();
  const direct = req?.headers?.[normalized];
  if (direct !== undefined) return direct;
  const entry = Object.entries(req?.headers || {}).find(([key]) => String(key).toLowerCase() === normalized);
  return entry?.[1];
}

export function hasSameOriginRequestContext(req, url) {
  if (String(getRequestHeader(req, "sec-fetch-site") || "").toLowerCase() !== "same-origin") return false;
  const requestOrigin = String(getRequestHeader(req, "origin") || "").trim();
  const requestHost = String(getRequestHeader(req, "host") || "").trim().toLowerCase();
  if (!requestOrigin || !requestHost) return false;
  try { return new URL(requestOrigin).host.toLowerCase() === requestHost; }
  catch { return false; }
}

export function sendJson(res, statusCode, payload, revision = null, headers = null) {
  const responseHeaders = { ...(typeof headers === "function" ? headers("application/json; charset=utf-8") : {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }) };
  if (revision !== null) responseHeaders.ETag = `"${revision}"`;
  const body = JSON.stringify(payload);
  if (typeof res.writeHead === "function") {
    res.writeHead(statusCode, responseHeaders);
    res.end(body);
    return;
  }
  res.statusCode = statusCode;
  Object.entries(responseHeaders).forEach(([key, value]) => res.setHeader?.(key, value));
  res.end?.(body);
}

export async function handleNomenclatureCommandRequest(req, res, url, {
  env = process.env,
  filePath = "",
  backupDir = "",
  auditLogPath = "",
  headers = null,
  authorization = null,
  getAuthorization = null,
} = {}) {
  const route = matchNomenclatureCommandRoute(req?.method, url?.pathname);
  if (!route) return false;
  const contentType = String(getRequestHeader(req, "content-type") || "").trim().toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    sendJson(res, 415, { ok: false, apiVersion: "v1", code: "json-content-type-required", error: "Nomenclature commands require application/json" }, null, headers);
    return true;
  }
  if (!hasSameOriginRequestContext(req, url)) {
    sendJson(res, 403, { ok: false, apiVersion: "v1", code: "same-origin-required", error: "Nomenclature commands require a same-origin browser request" }, null, headers);
    return true;
  }
  const headerIdempotencyKey = text(getRequestHeader(req, "idempotency-key"), MAX_IDEMPOTENCY_KEY_LENGTH + 1);
  if (!headerIdempotencyKey || headerIdempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    sendJson(res, 400, { ok: false, apiVersion: "v1", code: "idempotency-key-required", error: "A bounded Idempotency-Key header is required" }, null, headers);
    return true;
  }
  const rawIfMatch = getRequestHeader(req, "if-match");
  const headerRevision = parseIfMatch(rawIfMatch);
  if (rawIfMatch === undefined || headerRevision === null) {
    sendJson(res, 428, { ok: false, apiVersion: "v1", code: "if-match-required", error: "A valid If-Match shared-state revision is required" }, null, headers);
    return true;
  }
  let resolvedAuthorization = authorization;
  if (typeof getAuthorization === "function") {
    try {
      resolvedAuthorization = await getAuthorization({
        req,
        url,
        action: route.kind,
        itemId: route.itemId,
        resource: "nomenclature",
      });
    } catch (error) {
      sendJson(res, 503, { ok: false, apiVersion: "v1", code: "nomenclature-authorization-unavailable", error: error?.message || "Current Nomenclature authorization is unavailable" }, null, headers);
      return true;
    }
  }
  const authorized = normalizePrincipal(resolvedAuthorization);
  if (!authorized.ok) {
    sendJson(res, authorized.statusCode, { ok: false, apiVersion: "v1", code: authorized.code, error: authorized.error }, null, headers);
    return true;
  }
  let payload;
  try { payload = await readBody(req); }
  catch (error) {
    sendJson(res, Number(error?.statusCode || 400), { ok: false, apiVersion: "v1", code: error?.code || "invalid-request-body", error: error?.message || "Request body is invalid" }, null, headers);
    return true;
  }
  if (!isRecord(payload)) {
    sendJson(res, 400, { ok: false, apiVersion: "v1", code: "command-json-invalid", error: "Nomenclature command body must be a JSON object" }, null, headers);
    return true;
  }
  const payloadShape = inspectCommandJson(payload);
  if (!payloadShape.ok) {
    sendJson(res, payloadShape.statusCode, { ok: false, apiVersion: "v1", code: payloadShape.code, error: payloadShape.error }, null, headers);
    return true;
  }
  if (payload.expectedRevision !== undefined
    && headerRevision !== normalizeExpectedRevision(payload.expectedRevision)) {
    sendJson(res, 400, { ok: false, apiVersion: "v1", code: "revision-mismatch", error: "If-Match and expectedRevision must match" }, null, headers);
    return true;
  }
  let result;
  try {
    result = await executeNomenclatureCommand({
      ...payload,
      kind: route.kind,
      itemId: route.itemId || payload?.row?.id,
      idempotencyKey: headerIdempotencyKey,
      expectedRevision: headerRevision,
    }, { env, filePath, backupDir, auditLogPath, authorization: resolvedAuthorization });
  } catch {
    sendJson(res, 500, {
      ok: false,
      apiVersion: "v1",
      code: "nomenclature-command-internal-error",
      error: "Nomenclature command failed safely",
    }, null, headers);
    return true;
  }
  const response = { apiVersion: "v1", ...result };
  delete response.statusCode;
  sendJson(res, result.statusCode || 500, response, Number.isInteger(result.revision) ? result.revision : null, headers);
  return true;
}
