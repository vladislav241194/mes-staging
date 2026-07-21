import { createHash } from "node:crypto";

const REFERENCE_KEYS = new Set(["nomenclatureId", "outputNomenclatureId"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableJsonValue(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value, maxLength = 200) {
  return String(value || "").trim().slice(0, maxLength);
}

function rawIdentifier(value) {
  return typeof value === "string" ? value.trim() : "";
}

function exactItemId(value) {
  const itemId = rawIdentifier(value);
  return itemId && itemId.length <= 160 ? itemId : "";
}

function resultError(statusCode, code, error, details = {}) {
  return { ok: false, statusCode, code, error, ...details };
}

function sameRow(left, right) {
  return stableJson(left) === stableJson(right);
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

export function buildNomenclatureCommandRequestFingerprint(command) {
  try {
    return createHash("sha256").update(stableJson({
      kind: command?.kind,
      itemId: command?.itemId,
      expectedRevision: command?.expectedRevision,
      row: command?.row ?? null,
      expectedRow: command?.expectedRow ?? null,
    })).digest("hex");
  } catch {
    return "";
  }
}

export function buildNomenclatureDirectoryOutcomeFingerprint(directory) {
  try {
    return createHash("sha256").update(stableJson(directory)).digest("hex");
  } catch {
    return "";
  }
}

export function validateNomenclatureDirectoryClusterBoundary(directory, command, enabled = false) {
  if (enabled !== true) return { ok: true };
  if (!isRecord(directory) || !Array.isArray(directory.nomenclature) || !Array.isArray(directory.bomLists)) {
    return resultError(422, "invalid-nomenclature-command-proof", "Nomenclature Directory ownership input is incomplete");
  }
  const current = directory.nomenclature.find((row) => exactItemId(row?.id) === command?.itemId) || null;
  const candidate = command?.kind === "create"
    ? command.row
    : command?.kind === "update" && current
      ? { ...current, ...command.row, id: current.id }
      : current;
  const hasBoardOwner = Boolean(exactItemId(candidate?.sourceBomResultId))
    || (Array.isArray(candidate?.sourceBomIds) && candidate.sourceBomIds.some((boardId) => Boolean(exactItemId(boardId))))
    || Boolean(exactItemId(current?.sourceBomResultId))
    || (Array.isArray(current?.sourceBomIds) && current.sourceBomIds.some((boardId) => Boolean(exactItemId(boardId))))
    || directory.bomLists.some((board) => Array.isArray(board?.importRows)
      && board.importRows.some((row) => exactItemId(row?.nomenclatureId) === command?.itemId));
  return hasBoardOwner
    ? resultError(409, "directory-cluster-command-required", "Board/BOM-owned Nomenclature rows can only be changed through the Directory cluster command owner", {
      conflict: true,
      itemId: command?.itemId,
    })
    : { ok: true };
}

export function applyNomenclatureCommandReducer(directory, command, now) {
  const kind = String(command?.kind || "");
  const itemId = exactItemId(command?.itemId);
  const expectedRevision = command?.expectedRevision;
  const row = isRecord(command?.row) ? command.row : null;
  const expectedRow = isRecord(command?.expectedRow) ? command.expectedRow : null;
  if (!isRecord(directory)
    || !Array.isArray(directory.nomenclature)
    || !Array.isArray(directory.nomenclatureTypes)
    || !Array.isArray(directory.bomLists)
    || !Array.isArray(directory.specifications)
    || !isRecord(command)
    || !["create", "update", "delete"].includes(kind)
    || !itemId || itemId !== command.itemId
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0
    || (["create", "update"].includes(kind) && (!row || exactItemId(row.id) !== itemId))
    || (["update", "delete"].includes(kind) && (!expectedRow || exactItemId(expectedRow.id) !== itemId))
    || !String(now || "")) {
    return resultError(422, "invalid-nomenclature-command-proof", "Nomenclature command reducer input is incomplete");
  }
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
