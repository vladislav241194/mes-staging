import { createHash } from "node:crypto";
import { basename } from "node:path";

import {
  DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY,
  readSharedStateSnapshot,
  updateSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";
import {
  appendSharedStateAudit,
  backupSharedStateFile,
} from "./shared-state-storage.mjs";
import {
  applyNomenclatureTypeCommand,
  normalizeNomenclatureTypeName,
} from "./directory-cluster-type-reducer.mjs";
import { applyBoardCommand } from "./directory-cluster-board-reducer.mjs";
import {
  appendReceipt,
  getRequestHeader,
  hasSameOriginRequestContext,
  inspectJsonShape,
  isRecord,
  normalizePrincipal,
  parseIfMatch,
  readBody,
  receiptKey,
  resultError,
  safeNonNegativeInteger,
  sendJson,
  stableJson,
  text,
} from "./domain-nomenclature-command.mjs";

const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const FEATURE_FLAG = "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS";
const MAX_COMMAND_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;
const MAX_RECEIPTS = 500;
const MAX_RECEIPTS_BYTES = 2 * 1024 * 1024;
const MAX_PROJECTION_DEPTH = 80;
const MAX_PROJECTION_NODES = 1_000_000;
const MAX_PROJECTION_KEYS = 500_000;
const MAX_COMMAND_NODES = 300_000;
const MAX_COMMAND_KEYS = 300_000;
const REQUIRED_BOARD_TYPE_NAMES = new Set(["печатные платы", "рэа компоненты"]);

const SURFACES = Object.freeze({
  "nomenclature-types": Object.freeze({
    resourceId: "nomenclatureTypes",
    entityIdField: "itemId",
    kinds: Object.freeze(["create", "update", "delete"]),
    destructiveKinds: Object.freeze(["delete"]),
    strictRevisionKinds: Object.freeze([]),
  }),
  boards: Object.freeze({
    resourceId: "boards",
    entityIdField: "boardId",
    kinds: Object.freeze([
      "board-create",
      "board-update",
      "board-delete",
      "bom-row-add",
      "bom-row-update",
      "bom-row-delete",
      "bom-import",
    ]),
    destructiveKinds: Object.freeze(["board-delete", "bom-row-delete"]),
    strictRevisionKinds: Object.freeze(["bom-import"]),
  }),
});

export const DIRECTORY_CLUSTER_SERVER_COMMAND_CONTRACT = Object.freeze({
  apiVersion: "v1",
  featureFlag: FEATURE_FLAG,
  receiptsStorageKey: DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY,
  routes: Object.freeze({
    nomenclatureTypes: Object.freeze({
      capabilities: "/api/v1/directory/nomenclature-types/capabilities",
      commands: "/api/v1/directory/nomenclature-types",
    }),
    boards: Object.freeze({
      capabilities: "/api/v1/directory/boards/capabilities",
      commands: "/api/v1/directory/boards",
    }),
  }),
  methods: Object.freeze({ capabilities: "GET", command: "POST" }),
  concurrency: Object.freeze({
    revisionHeader: "If-Match",
    idempotencyHeader: "Idempotency-Key",
    rebase: "exact reducer baselines only",
    bomImport: "no rebase; exact revision plus full Directory fingerprint",
  }),
  authorization: Object.freeze({
    source: "signed employee session plus current server-side System Domains RBAC",
    resources: Object.freeze({
      nomenclatureTypes: "nomenclatureTypes",
      boards: "boards",
    }),
  }),
  destructiveCommands: Object.freeze({
    nomenclatureTypes: Object.freeze(["delete"]),
    boards: Object.freeze(["board-delete", "bom-row-delete"]),
    recoveryArtifact: "required before file-store write",
    durableAudit: "atomic command receipt; external audit log is supplementary",
  }),
});

function enabled(env) {
  return String(env?.[FEATURE_FLAG] || "").trim() === "1";
}

function inspectCommandJson(value) {
  return inspectJsonShape(value, {
    maxDepth: MAX_PROJECTION_DEPTH,
    maxNodes: MAX_COMMAND_NODES,
    maxKeys: MAX_COMMAND_KEYS,
    statusCode: 413,
    codePrefix: "directory-command-json",
    subject: "Directory command",
  });
}

function inspectProjectionJson(value, subject) {
  return inspectJsonShape(value, {
    maxDepth: MAX_PROJECTION_DEPTH,
    maxNodes: MAX_PROJECTION_NODES,
    maxKeys: MAX_PROJECTION_KEYS,
    statusCode: 503,
    codePrefix: "directory-projection-json",
    subject,
  });
}

function cloneJson(value) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") throw new TypeError("JSON serialization failed");
    return { ok: true, value: JSON.parse(serialized) };
  } catch {
    return resultError(400, "directory-command-json-invalid", "Directory command must contain only valid JSON values");
  }
}

function parseDirectory(snapshot) {
  const raw = snapshot?.values?.[DIRECTORY_STORAGE_KEY];
  if (typeof raw !== "string" || !raw) {
    return resultError(503, "directory-projection-unavailable", "The authoritative Directory projection is unavailable");
  }
  let directory;
  try { directory = JSON.parse(raw); }
  catch {
    return resultError(503, "invalid-directory-projection", "The authoritative Directory projection is not valid JSON");
  }
  const shape = inspectProjectionJson(directory, "Authoritative Directory projection");
  if (!shape.ok) {
    return resultError(503, "invalid-directory-projection", "The authoritative Directory projection exceeds safe structural limits", {
      reason: shape.code,
    });
  }
  if (!isRecord(directory)
    || !Array.isArray(directory.nomenclatureTypes)
    || !Array.isArray(directory.nomenclature)
    || !Array.isArray(directory.bomLists)
    || !Array.isArray(directory.specifications)) {
    return resultError(503, "invalid-directory-projection", "Directory commands require complete type, Nomenclature, Board/BOM and Specifications arrays");
  }
  return { ok: true, directory };
}

function projectionFromSnapshot(snapshot) {
  const parsed = parseDirectory(snapshot);
  return parsed.ok ? {
    revision: Number(snapshot.version || 0),
    updatedAt: String(snapshot.updatedAt || ""),
    directory: parsed.directory,
  } : null;
}

function normalizeAuthorization(authorization) {
  const normalized = normalizePrincipal(authorization);
  if (normalized.ok) return normalized;
  if (normalized.statusCode === 403) {
    return resultError(403, "directory-write-forbidden", "Current employee is not authorized to edit this Directory surface");
  }
  return normalized;
}

function normalizeCommand(surface, input, expectedRevision, idempotencyKey) {
  const descriptor = SURFACES[surface];
  if (!descriptor) return resultError(404, "directory-surface-not-found", "Directory command surface does not exist");
  if (!isRecord(input)) return resultError(400, "invalid-command", "Directory command body must be a JSON object");
  const shape = inspectCommandJson(input);
  if (!shape.ok) return shape;
  const cloned = cloneJson(input);
  if (!cloned.ok) return cloned;
  const command = cloned.value;
  for (const forbidden of ["actor", "authorization", "employeeId", "idempotencyKey", "principal"]) {
    if (Object.prototype.hasOwnProperty.call(command, forbidden)) {
      return resultError(400, "server-owned-command-field", `${forbidden} is derived by the server and is not accepted in a Directory command body`);
    }
  }
  if (command.expectedRevision !== undefined && command.expectedRevision !== expectedRevision) {
    return resultError(400, "revision-mismatch", "If-Match and expectedRevision must match exactly");
  }
  const kind = typeof command.kind === "string" ? command.kind.trim().toLowerCase() : "";
  if (!descriptor.kinds.includes(kind)) {
    return resultError(400, "invalid-command", `Unsupported ${surface} command kind`, { kind });
  }
  const rawEntityId = typeof command[descriptor.entityIdField] === "string" ? command[descriptor.entityIdField] : "";
  const entityId = rawEntityId.trim();
  if (!entityId || entityId.length > 160 || rawEntityId !== entityId) {
    return resultError(400, "directory-entity-id-invalid", `A bounded ${descriptor.entityIdField} is required`);
  }
  command.kind = kind;
  command[descriptor.entityIdField] = entityId;
  delete command.expectedRevision;
  const fingerprint = createHash("sha256").update(stableJson({
    surface,
    expectedRevision,
    command,
  })).digest("hex");
  return {
    ok: true,
    command,
    kind,
    entityId,
    expectedRevision,
    idempotencyKey,
    requestFingerprint: fingerprint,
    destructive: descriptor.destructiveKinds.includes(kind),
    strictRevision: descriptor.strictRevisionKinds.includes(kind),
  };
}

function applyCommand(surface, directory, command, now) {
  try {
    return surface === "nomenclature-types"
      ? applyNomenclatureTypeCommand(directory, command)
      : applyBoardCommand(directory, command, { now });
  } catch {
    return resultError(500, "directory-command-reducer-failed", "Directory command reducer failed safely");
  }
}

function validateCrossOwnerCommand(surface, directory, command) {
  if (surface !== "nomenclature-types" || !["update", "delete"].includes(command.kind)) return { ok: true };
  const current = directory.nomenclatureTypes.find((row) => row?.id === command.itemId) || null;
  if (!current) return { ok: true };
  const currentName = normalizeNomenclatureTypeName(current.name).toLocaleLowerCase("ru-RU");
  if (!REQUIRED_BOARD_TYPE_NAMES.has(currentName)) return { ok: true };
  if (command.kind === "delete") {
    return resultError(409, "board-required-type-delete-forbidden", "A Nomenclature type required by the Boards/BOM owner cannot be deleted");
  }
  const nextName = normalizeNomenclatureTypeName(command.row?.name === undefined ? current.name : command.row.name)
    .toLocaleLowerCase("ru-RU");
  return nextName === currentName
    ? { ok: true }
    : resultError(409, "board-required-type-rename-forbidden", "A Nomenclature type required by the Boards/BOM owner cannot be renamed");
}

function directoryFingerprint(directory) {
  try {
    return createHash("sha256").update(stableJson(directory)).digest("hex");
  } catch {
    return "";
  }
}

function normalizeAuthorizationDecision(value) {
  if (!isRecord(value)) return null;
  const keys = ["reason", "policy", "source", "roleId", "grantId", "action", "resource"];
  const result = {};
  for (const key of keys) {
    if (!["string", "number", "boolean"].includes(typeof value[key])) continue;
    const normalized = text(value[key], 300);
    if (normalized) result[key] = normalized;
  }
  return Object.keys(result).length ? result : null;
}

function isValidCounts(value) {
  return isRecord(value) && Object.values(value).every((count) => (
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0
  ));
}

function isValidReceiptEntry(key, receipt) {
  const surface = String(receipt?.surface || "");
  const descriptor = SURFACES[surface];
  const employeeId = text(receipt?.employeeId, 160);
  return /^[a-f0-9]{64}$/.test(key)
    && isRecord(receipt)
    && Boolean(descriptor)
    && descriptor.kinds.includes(String(receipt.kind || ""))
    && typeof receipt.entityId === "string"
    && Boolean(receipt.entityId.trim())
    && receipt.entityId.length <= 160
    && /^[a-f0-9]{64}$/.test(String(receipt.requestFingerprint || ""))
    && /^[a-f0-9]{64}$/.test(String(receipt.outcomeFingerprint || ""))
    && typeof receipt.idempotencyKey === "string"
    && /^[\x21-\x7e]+$/u.test(receipt.idempotencyKey)
    && receipt.idempotencyKey.length <= MAX_IDEMPOTENCY_KEY_LENGTH
    && Number.isSafeInteger(receipt.commandRevision)
    && receipt.commandRevision > 0
    && Number.isSafeInteger(receipt.baseRevision)
    && receipt.baseRevision >= 0
    && typeof receipt.rebased === "boolean"
    && [200, 201].includes(receipt.statusCode)
    && Boolean(employeeId)
    && text(receipt.actorId, 200) === `employee:${employeeId}`
    && Boolean(text(receipt.createdAt, 100))
    && isRecord(receipt.row)
    && (receipt.impact === null || isRecord(receipt.impact))
    && isValidCounts(receipt.counts || {})
    && typeof receipt.destructiveAction === "boolean"
    && (receipt.destructiveAction
      ? isRecord(receipt.recoveryArtifact)
        && receipt.recoveryArtifact.kind === "file-backup"
        && receipt.recoveryArtifact.status === "created"
        && Boolean(text(receipt.recoveryArtifact.artifactName, 300))
        && Boolean(text(receipt.recoveryArtifact.metadataName, 320))
      : receipt.recoveryArtifact === null);
}

function parseReceipts(snapshot) {
  const raw = snapshot?.values?.[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY];
  if (raw === undefined || raw === null || raw === "") return { schemaVersion: 1, entries: {}, invalid: false };
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_RECEIPTS_BYTES) {
    return { schemaVersion: 1, entries: {}, invalid: true };
  }
  try {
    const parsed = JSON.parse(raw);
    const shape = inspectProjectionJson(parsed, "Directory command receipts");
    if (!shape.ok || !isRecord(parsed) || Number(parsed.schemaVersion || 0) !== 1 || !isRecord(parsed.entries)) {
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

function appendDirectoryReceipt(receipts, key, receipt) {
  let next = appendReceipt(receipts, key, receipt);
  let entries = Object.entries(next.entries);
  while (entries.length > 1 && Buffer.byteLength(JSON.stringify(next)) > MAX_RECEIPTS_BYTES) {
    entries = entries.slice(0, -1);
    next = { schemaVersion: 1, entries: Object.fromEntries(entries) };
  }
  return Buffer.byteLength(JSON.stringify(next)) <= MAX_RECEIPTS_BYTES
    ? { ok: true, receipts: next }
    : resultError(413, "directory-command-receipt-too-large", "Directory command receipt exceeds its server-owned storage budget");
}

function finalizeDestructiveReceiptRecovery(snapshot, key, receipt, backup) {
  const recoveryArtifact = {
    kind: "file-backup",
    status: "created",
    artifactName: basename(String(backup?.backupPath || "")),
    metadataName: basename(String(backup?.metaPath || "")),
  };
  receipt.recoveryArtifact = recoveryArtifact;
  if (!isValidReceiptEntry(key, receipt)) {
    throw Object.assign(new Error("Directory destructive recovery receipt is invalid"), {
      code: "DIRECTORY_COMMAND_RECEIPT_FAILED",
    });
  }
  let stored;
  try { stored = JSON.parse(snapshot?.values?.[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY] || ""); }
  catch {
    throw Object.assign(new Error("Directory command receipts could not be finalized"), {
      code: "DIRECTORY_COMMAND_RECEIPT_FAILED",
    });
  }
  if (!isRecord(stored) || !isRecord(stored.entries) || !Object.prototype.hasOwnProperty.call(stored.entries, key)) {
    throw Object.assign(new Error("Directory command receipt disappeared before persistence"), {
      code: "DIRECTORY_COMMAND_RECEIPT_FAILED",
    });
  }
  stored.entries[key] = receipt;
  const serialized = JSON.stringify(stored);
  if (Buffer.byteLength(serialized) > MAX_RECEIPTS_BYTES) {
    throw Object.assign(new Error("Directory destructive recovery receipt exceeds its storage budget"), {
      code: "DIRECTORY_COMMAND_RECEIPT_FAILED",
    });
  }
  snapshot.values[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY] = serialized;
}

function commandSummary(receipt) {
  return {
    surface: receipt.surface,
    kind: receipt.kind,
    entityId: receipt.entityId,
    itemId: receipt.entityId,
    ...(receipt.surface === "boards" ? { boardId: receipt.entityId } : {}),
    row: receipt.row,
    counts: receipt.counts || {},
    impact: receipt.impact,
    receipt: {
      actorId: receipt.actorId,
      commandRevision: receipt.commandRevision,
      baseRevision: receipt.baseRevision,
      rebased: receipt.rebased,
      kind: receipt.kind,
      itemId: receipt.entityId,
      idempotencyKey: receipt.idempotencyKey,
      destructiveAction: receipt.destructiveAction,
      recoveryArtifact: receipt.recoveryArtifact,
    },
  };
}

function responseFromReceipt(snapshot, receipt, idempotentReplay) {
  const projection = projectionFromSnapshot(snapshot);
  if (!projection) {
    return resultError(503, "directory-projection-unavailable", "The authoritative Directory projection is unavailable after the command");
  }
  const superseded = idempotentReplay && directoryFingerprint(projection.directory) !== receipt.outcomeFingerprint;
  if (superseded) {
    return resultError(409, "superseded-idempotent-replay", "The idempotent Directory command receipt was superseded by a later Directory revision", {
      conflict: true,
      superseded: true,
      idempotentReplay: true,
      ...commandSummary(receipt),
      commandRevision: receipt.commandRevision,
      revision: projection.revision,
      directory: projection.directory,
      projection,
    });
  }
  return {
    ok: true,
    statusCode: idempotentReplay ? 200 : receipt.statusCode,
    apiVersion: "v1",
    idempotentReplay,
    superseded: false,
    ...commandSummary(receipt),
    commandRevision: receipt.commandRevision,
    revision: projection.revision,
    baseRevision: receipt.baseRevision,
    rebased: receipt.rebased,
    actorId: receipt.actorId,
    directory: projection.directory,
    projection,
  };
}

function revisionConflict(snapshot, surface, error = "Shared-state revision changed concurrently") {
  const projection = projectionFromSnapshot(snapshot);
  return projection
    ? resultError(409, "revision-conflict", error, {
      conflict: true,
      surface,
      revision: projection.revision,
      directory: projection.directory,
      projection,
    })
    : resultError(503, "directory-command-storage-unavailable", "Latest authoritative Directory projection is unavailable", {
      retryable: true,
    });
}

function statusForCommand(surface, kind) {
  return (surface === "nomenclature-types" && kind === "create")
    || (surface === "boards" && ["board-create", "bom-import"].includes(kind))
    ? 201
    : 200;
}

export async function executeDirectoryClusterCommand(surface, input = {}, {
  env = process.env,
  filePath = "",
  backupDir = "",
  auditLogPath = "",
  authorization = null,
  expectedRevision = null,
  idempotencyKey = "",
  maxAttempts = 4,
} = {}) {
  if (!SURFACES[surface]) return resultError(404, "directory-surface-not-found", "Directory command surface does not exist");
  if (!enabled(env)) return resultError(409, "directory-cluster-server-commands-disabled", "Directory cluster server commands are not enabled");
  const authorized = normalizeAuthorization(authorization);
  if (!authorized.ok) return authorized;
  const normalizedRevision = safeNonNegativeInteger(expectedRevision);
  if (normalizedRevision === null) {
    return resultError(400, "expected-revision-required", "A non-negative shared-state expected revision is required");
  }
  const normalizedIdempotencyKey = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
  if (!normalizedIdempotencyKey
    || normalizedIdempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    || !/^[\x21-\x7e]+$/u.test(normalizedIdempotencyKey)) {
    return resultError(400, "idempotency-key-required", "A bounded Idempotency-Key is required");
  }
  const normalized = normalizeCommand(surface, input, normalizedRevision, normalizedIdempotencyKey);
  if (!normalized.ok) return normalized;
  const { actor } = authorized;
  const key = receiptKey(actor.id, normalizedIdempotencyKey);
  let latestConflictSnapshot = null;

  for (let attempt = 0; attempt < Math.max(1, Number(maxAttempts) || 1); attempt += 1) {
    let read;
    try { read = await readSharedStateSnapshot({ env, filePath }); }
    catch (error) {
      return resultError(503, "directory-command-storage-unavailable", error?.message || "Directory command storage is unavailable", { retryable: true });
    }
    if (!read.configured) return resultError(503, "shared-state-unconfigured", "Shared-state storage is not configured");
    const current = read.snapshot;
    const parsed = parseDirectory(current);
    if (!parsed.ok) return parsed;
    const receipts = parseReceipts(current);
    if (receipts.invalid) {
      return resultError(503, "invalid-directory-idempotency-projection", "Directory command receipts are invalid and were not overwritten");
    }
    const existingReceipt = receipts.entries[key];
    if (existingReceipt) {
      if (existingReceipt.requestFingerprint !== normalized.requestFingerprint) {
        return resultError(409, "idempotency-conflict", "Idempotency-Key was already used for a different Directory command", {
          revision: Number(current.version || 0),
          directory: parsed.directory,
          projection: projectionFromSnapshot(current),
        });
      }
      return responseFromReceipt(current, existingReceipt, true);
    }
    const currentRevision = Number(current.version || 0);
    if (normalized.expectedRevision > currentRevision) {
      return revisionConflict(current, surface, "Directory command references a future shared-state revision");
    }
    if (normalized.strictRevision && normalized.expectedRevision !== currentRevision) {
      return revisionConflict(current, surface, "BOM import cannot be rebased after the shared-state revision changed");
    }
    const now = new Date().toISOString();
    const crossOwner = validateCrossOwnerCommand(surface, parsed.directory, normalized.command);
    if (!crossOwner.ok) {
      return {
        ...crossOwner,
        revision: currentRevision,
        directory: parsed.directory,
        projection: projectionFromSnapshot(current),
      };
    }
    const mutation = applyCommand(surface, parsed.directory, normalized.command, now);
    if (!mutation.ok) {
      return {
        ...mutation,
        revision: currentRevision,
        directory: parsed.directory,
        projection: projectionFromSnapshot(current),
      };
    }
    let receipt = null;
    let lockedFailure = null;
    let backup = null;
    let backupFailure = null;
    let update;
    try {
      update = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: currentRevision,
        planningObservationSource: `directory-cluster-command:${surface}:${normalized.kind}`,
        beforeWrite: async ({ store, snapshot }) => {
          if (!normalized.destructive) return;
          if (store.kind !== "file") {
            backupFailure = Object.assign(new Error(`Directory destructive recovery artifact is not supported for ${store.kind || "unknown"} storage`), {
              code: "DIRECTORY_COMMAND_BACKUP_UNSUPPORTED",
            });
            await appendSharedStateAudit({
              auditLogPath,
              event: {
                action: `directory-cluster-command:${surface}:${normalized.kind}`,
                status: "denied",
                reason: "backup-storage-unsupported",
                destructiveAction: true,
                actor: actor.id,
                employeeId: actor.employeeId,
                entityId: normalized.entityId,
                storageKind: text(store.kind, 80) || "unknown",
              },
            }).catch(() => {});
            throw backupFailure;
          }
          try {
            backup = await backupSharedStateFile({
              filePath: store.filePath || filePath,
              backupDir,
              reason: `before-directory-${surface}-${normalized.kind}`,
              actor: actor.id,
              env,
              allowMissing: false,
            });
            finalizeDestructiveReceiptRecovery(snapshot, key, receipt, backup);
          } catch (error) {
            backupFailure = error;
            await appendSharedStateAudit({
              auditLogPath,
              event: {
                action: `directory-cluster-command:${surface}:${normalized.kind}`,
                status: "denied",
                reason: "backup-failed",
                destructiveAction: true,
                actor: actor.id,
                employeeId: actor.employeeId,
                entityId: normalized.entityId,
                error: text(error?.message, 300),
              },
            }).catch(() => {});
            throw Object.assign(new Error(error?.message || "Directory destructive backup failed"), {
              code: error?.code === "DIRECTORY_COMMAND_RECEIPT_FAILED"
                ? "DIRECTORY_COMMAND_RECEIPT_FAILED"
                : "DIRECTORY_COMMAND_BACKUP_FAILED",
            });
          }
        },
        update: (latest) => {
          const latestRevision = Number(latest.version || 0);
          if (normalized.strictRevision && normalized.expectedRevision !== latestRevision) {
            lockedFailure = revisionConflict(latest, surface, "BOM import cannot be rebased after the shared-state revision changed");
            throw Object.assign(new Error(lockedFailure.error), { code: "DIRECTORY_COMMAND_REJECTED" });
          }
          const latestProjection = parseDirectory(latest);
          const latestReceipts = parseReceipts(latest);
          if (!latestProjection.ok || latestReceipts.invalid) {
            lockedFailure = latestProjection.ok
              ? resultError(503, "invalid-directory-idempotency-projection", "Directory command receipts are invalid and were not overwritten")
              : latestProjection;
            throw Object.assign(new Error(lockedFailure.error), { code: "DIRECTORY_COMMAND_REJECTED" });
          }
          const latestCrossOwner = validateCrossOwnerCommand(surface, latestProjection.directory, normalized.command);
          if (!latestCrossOwner.ok) {
            lockedFailure = latestCrossOwner;
            throw Object.assign(new Error(latestCrossOwner.error), { code: "DIRECTORY_COMMAND_REJECTED" });
          }
          const latestMutation = applyCommand(surface, latestProjection.directory, normalized.command, now);
          if (!latestMutation.ok) {
            lockedFailure = latestMutation;
            throw Object.assign(new Error(latestMutation.error), { code: "DIRECTORY_COMMAND_REJECTED" });
          }
          const outcomeFingerprint = directoryFingerprint(latestMutation.directory);
          if (!/^[a-f0-9]{64}$/u.test(outcomeFingerprint)) {
            lockedFailure = resultError(503, "directory-command-fingerprint-failed", "Directory command outcome could not be fingerprinted safely");
            throw Object.assign(new Error(lockedFailure.error), { code: "DIRECTORY_COMMAND_REJECTED" });
          }
          const commandRevision = latestRevision + 1;
          receipt = {
            surface,
            requestFingerprint: normalized.requestFingerprint,
            outcomeFingerprint,
            idempotencyKey: normalizedIdempotencyKey,
            kind: normalized.kind,
            entityId: normalized.entityId,
            commandRevision,
            baseRevision: normalized.expectedRevision,
            rebased: normalized.expectedRevision < latestRevision,
            statusCode: statusForCommand(surface, normalized.kind),
            row: latestMutation.row,
            counts: isValidCounts(latestMutation.counts || {}) ? latestMutation.counts || {} : {},
            impact: isRecord(latestMutation.impact) ? latestMutation.impact : null,
            actorId: actor.id,
            employeeId: actor.employeeId,
            authorizationRevision: authorized.authorizationRevision,
            authorizationDecision: normalizeAuthorizationDecision(authorization?.decision),
            destructiveAction: normalized.destructive,
            recoveryArtifact: null,
            createdAt: now,
          };
          const appended = appendDirectoryReceipt(latestReceipts, key, receipt);
          if (!appended.ok) {
            lockedFailure = appended;
            throw Object.assign(new Error(appended.error), { code: "DIRECTORY_COMMAND_REJECTED" });
          }
          return {
            ...latest,
            values: {
              ...(latest.values || {}),
              [DIRECTORY_STORAGE_KEY]: JSON.stringify(latestMutation.directory),
              [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify(appended.receipts),
            },
            updatedBy: {
              actor: actor.id,
              employeeId: actor.employeeId,
              displayName: actor.displayName,
            },
            events: [{
              action: `directory-cluster-command:${surface}:${normalized.kind}`,
              actor: actor.id,
              employeeId: actor.employeeId,
              entityId: normalized.entityId,
              authorizationRevision: authorized.authorizationRevision,
              authorizationDecision: receipt.authorizationDecision,
              createdAt: now,
              version: commandRevision,
            }, ...(latest.events || [])].slice(0, 50),
          };
        },
      });
    } catch (error) {
      if (["DIRECTORY_COMMAND_BACKUP_FAILED", "DIRECTORY_COMMAND_BACKUP_UNSUPPORTED"].includes(error?.code) || backupFailure) {
        return resultError(503, "directory-command-backup-failed", "Directory command was denied because the required shared-state backup failed", {
          retryable: true,
        });
      }
      if (error?.code === "DIRECTORY_COMMAND_REJECTED" && lockedFailure) {
        return {
          ...lockedFailure,
          revision: currentRevision,
          directory: parsed.directory,
          projection: projectionFromSnapshot(current),
        };
      }
      return resultError(503, "directory-command-persistence-failed", error?.message || "Directory command storage is unavailable", {
        retryable: true,
      });
    }
    if (update.ok && receipt) {
      if (normalized.destructive) {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action: `directory-cluster-command:${surface}:${normalized.kind}`,
            status: "saved",
            destructiveAction: true,
            version: Number(update.snapshot.version || 0),
            actor: actor.id,
            employeeId: actor.employeeId,
            entityId: normalized.entityId,
            backupPath: backup?.backupPath || "",
          },
        }).catch(() => {});
      }
      return responseFromReceipt(update.snapshot, receipt, false);
    }
    if (!update.conflict) {
      return resultError(update.forbidden ? 403 : 503, "directory-command-persistence-failed", update.error || "Directory command was not durably persisted", {
        retryable: update.retryable === true,
      });
    }
    latestConflictSnapshot = update.snapshot || latestConflictSnapshot;
    if (normalized.strictRevision) break;
  }
  return latestConflictSnapshot
    ? revisionConflict(latestConflictSnapshot, surface)
    : resultError(503, "directory-command-storage-unavailable", "Latest shared-state projection is unavailable after a concurrent write", {
      retryable: true,
    });
}

export function matchDirectoryClusterCommandRoute(method = "", pathname = "") {
  const path = String(pathname || "").replace(/\/$/u, "");
  const surface = path === "/api/v1/directory/nomenclature-types" || path === "/api/v1/directory/nomenclature-types/capabilities"
    ? "nomenclature-types"
    : path === "/api/v1/directory/boards" || path === "/api/v1/directory/boards/capabilities"
      ? "boards"
      : "";
  if (!surface) return null;
  const normalizedMethod = String(method || "").toUpperCase();
  const capabilitiesPath = path.endsWith("/capabilities");
  return {
    surface,
    method: normalizedMethod,
    capabilities: capabilitiesPath && normalizedMethod === "GET",
    command: !capabilitiesPath && normalizedMethod === "POST",
    allowedMethod: capabilitiesPath ? "GET" : "POST",
  };
}

function safeActor(authorization) {
  const principal = authorization?.principal;
  const employeeId = text(principal?.employeeId, 160);
  if (!employeeId || text(principal?.id, 200) !== `employee:${employeeId}` || principal?.scope !== "employee") return null;
  return {
    id: `employee:${employeeId}`,
    employeeId,
    displayName: text(principal.displayName, 300),
    personnelNumber: text(principal.personnelNumber, 120),
  };
}

async function capabilitiesPayload(surface, authorization, env, filePath) {
  const actor = safeActor(authorization);
  const configured = enabled(env);
  const canEdit = authorization?.allowed === true && Boolean(actor);
  const canView = Boolean(actor) && (authorization?.viewDecision?.allowed === true || canEdit);
  let read;
  try { read = await readSharedStateSnapshot({ env, filePath }); }
  catch (error) {
    return resultError(503, "directory-owner-unavailable", error?.message || "Directory projection storage is unavailable");
  }
  if (!read.configured) return resultError(503, "directory-owner-unavailable", "Directory projection storage is not configured");
  const parsed = parseDirectory(read.snapshot);
  if (!parsed.ok) return parsed;
  const rights = surface === "nomenclature-types" ? {
    canViewNomenclatureTypes: canView,
    canEditNomenclatureTypes: canEdit,
    canCreateNomenclatureTypes: canEdit,
    canDeleteNomenclatureTypes: canEdit,
  } : {
    canViewBoards: canView,
    canEditBoards: canEdit,
    canCreateBoards: canEdit,
    canDeleteBoards: canEdit,
    canEditBom: canEdit,
    canImportBom: canEdit,
  };
  return {
    ok: true,
    apiVersion: "v1",
    surface,
    authenticated: Boolean(actor),
    actor,
    rbacRevision: safeNonNegativeInteger(authorization?.revision) ?? 0,
    directoryRevision: Number(read.snapshot.version || 0),
    authorizationReason: String(authorization?.reason || (actor ? "directory-write-forbidden" : "employee-session-required")),
    capabilities: {
      ...rights,
      serverCommandsConfigured: configured,
      serverCommandsEnabled: configured && canEdit,
    },
  };
}

export async function handleDirectoryClusterCommandRequest(req, res, url, {
  env = process.env,
  filePath = "",
  backupDir = "",
  auditLogPath = "",
  headers = null,
  authorization = null,
  getAuthorization = null,
} = {}) {
  const route = matchDirectoryClusterCommandRoute(req?.method, url?.pathname);
  if (!route) return false;
  if (!route.capabilities && !route.command) {
    const responseHeaders = typeof headers === "function" ? headers("application/json; charset=utf-8") : null;
    sendJson(res, 405, { ok: false, apiVersion: "v1", code: "method-not-allowed", error: `Directory route requires ${route.allowedMethod}` }, null, () => ({ ...responseHeaders, Allow: route.allowedMethod }));
    return true;
  }
  let headerIdempotencyKey = "";
  let headerRevision = null;
  if (route.command) {
    const contentType = String(getRequestHeader(req, "content-type") || "").trim().toLowerCase();
    if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
      sendJson(res, 415, { ok: false, apiVersion: "v1", code: "json-content-type-required", error: "Directory commands require application/json" }, null, headers);
      return true;
    }
    if (!hasSameOriginRequestContext(req, url)) {
      sendJson(res, 403, { ok: false, apiVersion: "v1", code: "same-origin-required", error: "Directory commands require a same-origin browser request" }, null, headers);
      return true;
    }
    headerIdempotencyKey = typeof getRequestHeader(req, "idempotency-key") === "string"
      ? getRequestHeader(req, "idempotency-key").trim()
      : "";
    if (!headerIdempotencyKey
      || headerIdempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
      || !/^[\x21-\x7e]+$/u.test(headerIdempotencyKey)) {
      sendJson(res, 400, { ok: false, apiVersion: "v1", code: "idempotency-key-required", error: "A bounded Idempotency-Key header is required" }, null, headers);
      return true;
    }
    const rawIfMatch = getRequestHeader(req, "if-match");
    headerRevision = parseIfMatch(rawIfMatch);
    if (rawIfMatch === undefined || headerRevision === null) {
      sendJson(res, 428, { ok: false, apiVersion: "v1", code: "if-match-required", error: "A valid strong If-Match shared-state revision is required" }, null, headers);
      return true;
    }
  }
  let resolvedAuthorization = authorization;
  if (typeof getAuthorization === "function") {
    try {
      resolvedAuthorization = await getAuthorization({
        req,
        url,
        action: route.capabilities ? "view" : "edit",
        resource: SURFACES[route.surface].resourceId,
        surface: route.surface,
      });
    } catch (error) {
      sendJson(res, 503, { ok: false, apiVersion: "v1", code: "directory-authorization-unavailable", error: error?.message || "Current Directory authorization is unavailable" }, null, headers);
      return true;
    }
  }
  if (route.capabilities) {
    const capability = await capabilitiesPayload(route.surface, resolvedAuthorization, env, filePath);
    const response = { apiVersion: "v1", ...capability };
    delete response.statusCode;
    sendJson(res, capability.statusCode || 200, response, null, headers);
    return true;
  }
  const authorized = normalizeAuthorization(resolvedAuthorization);
  if (!authorized.ok) {
    sendJson(res, authorized.statusCode, { ok: false, apiVersion: "v1", code: authorized.code, error: authorized.error }, null, headers);
    return true;
  }
  let payload;
  try { payload = await readBody(req, MAX_COMMAND_BODY_BYTES, inspectCommandJson); }
  catch (error) {
    sendJson(res, Number(error?.statusCode || 400), { ok: false, apiVersion: "v1", code: error?.code || "invalid-request-body", error: error?.message || "Request body is invalid" }, null, headers);
    return true;
  }
  if (!isRecord(payload)) {
    sendJson(res, 400, { ok: false, apiVersion: "v1", code: "directory-command-json-invalid", error: "Directory command body must be a JSON object" }, null, headers);
    return true;
  }
  const shape = inspectCommandJson(payload);
  if (!shape.ok) {
    sendJson(res, shape.statusCode, { ok: false, apiVersion: "v1", code: shape.code, error: shape.error }, null, headers);
    return true;
  }
  let result;
  try {
    result = await executeDirectoryClusterCommand(route.surface, payload, {
      env,
      filePath,
      backupDir,
      auditLogPath,
      authorization: resolvedAuthorization,
      expectedRevision: headerRevision,
      idempotencyKey: headerIdempotencyKey,
    });
  } catch {
    sendJson(res, 500, { ok: false, apiVersion: "v1", code: "directory-command-internal-error", error: "Directory command failed safely" }, null, headers);
    return true;
  }
  const response = { apiVersion: "v1", ...result };
  delete response.statusCode;
  sendJson(res, result.statusCode || 500, response, Number.isInteger(result.revision) ? result.revision : null, headers);
  return true;
}
