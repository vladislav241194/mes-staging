import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const REQUIRED_DIRECTORY_ARRAYS = Object.freeze([
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);
const MAX_TYPE_ID_LENGTH = 160;
const MAX_TYPE_NAME_LENGTH = 200;
const INACTIVE_STATUS_KEYS = new Set([
  "inactive",
  "disabled",
  "deleted",
  "archived",
  "неактивен",
  "не активен",
  "отключен",
  "отключён",
  "удален",
  "удалён",
  "архив",
]);
const REQUIRED_BOARD_TYPE_NAMES = new Set(["печатные платы", "рэа компоненты"]);

export const DIRECTORY_CLUSTER_TYPE_REDUCER_CONTRACT = Object.freeze({
  requiredDirectoryArrays: REQUIRED_DIRECTORY_ARRAYS,
  commands: Object.freeze({
    create: Object.freeze(["kind", "itemId", "row"]),
    update: Object.freeze(["kind", "itemId", "expectedRow", "row"]),
    delete: Object.freeze([
      "kind",
      "itemId",
      "expectedRow",
      "fallbackTypeId",
      "fallbackExpectedRow",
      "impactFingerprint",
    ]),
  }),
  concurrency: Object.freeze({
    target: "exact expectedRow",
    fallback: "exact fallbackExpectedRow",
    deleteImpact: "sha256 impactFingerprint",
  }),
  cascades: Object.freeze([
    "nomenclature[].type",
    "specifications[].structureItems[].nomenclatureType",
  ]),
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resultError(statusCode, code, error, details = {}) {
  return { ok: false, statusCode, code, error, ...details };
}

function normalizeTypeId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNomenclatureTypeName(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

// Nomenclature Types and Boards/BOM share one Directory projection. These two
// semantic type names are part of the Board reducer contract and therefore
// cannot be renamed or removed by the adjacent type owner.
export function validateNomenclatureTypeBoardOwnerBoundary(directory, command) {
  if (!isRecord(directory) || !isRecord(command)
    || !["update", "delete"].includes(String(command.kind || ""))) return { ok: true };
  const current = Array.isArray(directory.nomenclatureTypes)
    ? directory.nomenclatureTypes.find((row) => row?.id === command.itemId) || null
    : null;
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

function typeNameKey(value) {
  return normalizeNomenclatureTypeName(value).toLocaleLowerCase("ru-RU");
}

function statusKey(value) {
  return normalizeNomenclatureTypeName(typeof value === "string" ? value : "").toLocaleLowerCase("ru-RU");
}

function isInactiveTypeRow(row) {
  return row?.active === false
    || row?.isActive === false
    || INACTIVE_STATUS_KEYS.has(statusKey(row?.status));
}

function cloneCommandRow(row) {
  try {
    const serialized = JSON.stringify(row);
    if (typeof serialized !== "string") throw new TypeError("Row is not JSON-compatible");
    const clone = JSON.parse(serialized);
    if (!isDeepStrictEqual(row, clone)) throw new TypeError("Row loses data during JSON serialization");
    return { ok: true, row: clone };
  } catch {
    return resultError(400, "type-row-invalid", "Nomenclature type row must be JSON-compatible");
  }
}

function inspectDirectory(directory) {
  if (!isRecord(directory)) {
    return resultError(503, "invalid-directory-projection", "A complete legacy Directory object is required");
  }
  for (const section of REQUIRED_DIRECTORY_ARRAYS) {
    if (!Array.isArray(directory[section])) {
      return resultError(503, "invalid-directory-projection", `Directory.${section} must be an array`, { section });
    }
  }

  const typeById = new Map();
  const typeByName = new Map();
  for (let index = 0; index < directory.nomenclatureTypes.length; index += 1) {
    const row = directory.nomenclatureTypes[index];
    if (!isRecord(row)) {
      return resultError(503, "invalid-type-row", "Every Nomenclature type must be an object", { index });
    }
    const itemId = normalizeTypeId(row.id);
    const name = normalizeNomenclatureTypeName(row.name);
    const nameKey = typeNameKey(name);
    if (!itemId || itemId.length > MAX_TYPE_ID_LENGTH || row.id !== itemId) {
      return resultError(503, "invalid-type-id", "Every persisted Nomenclature type needs a canonical bounded id", { index });
    }
    if (!name || name.length > MAX_TYPE_NAME_LENGTH) {
      return resultError(503, "invalid-type-name", "Every persisted Nomenclature type needs a bounded name", { index, itemId });
    }
    if (typeById.has(itemId)) {
      return resultError(503, "duplicate-type-id", "Nomenclature type ids must be unique", { itemId, index });
    }
    if (typeByName.has(nameKey)) {
      return resultError(503, "duplicate-type-name", "Nomenclature type names must be unique after normalization", {
        itemId,
        conflictingItemId: typeByName.get(nameKey).itemId,
        index,
      });
    }
    const entry = { row, index, itemId, name, nameKey };
    typeById.set(itemId, entry);
    typeByName.set(nameKey, entry);
  }

  for (let index = 0; index < directory.nomenclature.length; index += 1) {
    if (!isRecord(directory.nomenclature[index])) {
      return resultError(503, "invalid-nomenclature-row", "Every Nomenclature row must be an object", { index });
    }
  }
  for (let specificationIndex = 0; specificationIndex < directory.specifications.length; specificationIndex += 1) {
    const specification = directory.specifications[specificationIndex];
    if (!isRecord(specification)) {
      return resultError(503, "invalid-specification-row", "Every Specification row must be an object", { specificationIndex });
    }
    if (specification.structureItems !== undefined && !Array.isArray(specification.structureItems)) {
      return resultError(503, "invalid-specification-structure", "Specification.structureItems must be an array when present", {
        specificationIndex,
        specificationId: normalizeTypeId(specification.id),
      });
    }
    const structureItems = specification.structureItems || [];
    for (let structureItemIndex = 0; structureItemIndex < structureItems.length; structureItemIndex += 1) {
      if (!isRecord(structureItems[structureItemIndex])) {
        return resultError(503, "invalid-specification-structure-row", "Every Specification structure item must be an object", {
          specificationIndex,
          structureItemIndex,
        });
      }
    }
  }

  return { ok: true, directory, typeById, typeByName };
}

function validateTypeReferences(directory, typeByName) {
  for (let index = 0; index < directory.nomenclature.length; index += 1) {
    const referenceName = normalizeNomenclatureTypeName(directory.nomenclature[index].type);
    if (referenceName && !typeByName.has(typeNameKey(referenceName))) {
      return resultError(409, "dangling-type-reference", "Nomenclature references a type that is absent from the type directory", {
        section: "nomenclature",
        index,
        itemId: normalizeTypeId(directory.nomenclature[index].id),
        referenceName,
      });
    }
  }
  for (let specificationIndex = 0; specificationIndex < directory.specifications.length; specificationIndex += 1) {
    const specification = directory.specifications[specificationIndex];
    const structureItems = specification.structureItems || [];
    for (let structureItemIndex = 0; structureItemIndex < structureItems.length; structureItemIndex += 1) {
      const referenceName = normalizeNomenclatureTypeName(structureItems[structureItemIndex].nomenclatureType);
      if (referenceName && !typeByName.has(typeNameKey(referenceName))) {
        return resultError(409, "dangling-type-reference", "A Specification structure item references a type that is absent from the type directory", {
          section: "specifications.structureItems",
          specificationIndex,
          specificationId: normalizeTypeId(specification.id),
          structureItemIndex,
          structureItemId: normalizeTypeId(structureItems[structureItemIndex].id),
          referenceName,
        });
      }
    }
  }
  return { ok: true };
}

function publicImpact(entry, nomenclatureReferences, specificationReferences, fingerprint) {
  return {
    itemId: entry.itemId,
    typeName: entry.name,
    fingerprint,
    counts: {
      nomenclatureRows: nomenclatureReferences.length,
      specificationRows: specificationReferences.length,
      totalReferences: nomenclatureReferences.length + specificationReferences.length,
    },
    references: {
      nomenclature: nomenclatureReferences.map(({ index, row }) => ({
        index,
        itemId: normalizeTypeId(row.id),
      })),
      specifications: specificationReferences.map(({ specificationIndex, specification, structureItemIndex, row }) => ({
        specificationIndex,
        specificationId: normalizeTypeId(specification.id),
        structureItemIndex,
        structureItemId: normalizeTypeId(row.id),
      })),
    },
  };
}

function inspectImpactFromProjection(projection, itemId) {
  const entry = projection.typeById.get(itemId);
  if (!entry) {
    return resultError(404, "type-not-found", "Nomenclature type is absent", { itemId });
  }
  const nomenclatureReferences = [];
  for (let index = 0; index < projection.directory.nomenclature.length; index += 1) {
    const row = projection.directory.nomenclature[index];
    if (typeNameKey(row.type) === entry.nameKey) nomenclatureReferences.push({ index, row });
  }
  const specificationReferences = [];
  for (let specificationIndex = 0; specificationIndex < projection.directory.specifications.length; specificationIndex += 1) {
    const specification = projection.directory.specifications[specificationIndex];
    const structureItems = specification.structureItems || [];
    for (let structureItemIndex = 0; structureItemIndex < structureItems.length; structureItemIndex += 1) {
      const row = structureItems[structureItemIndex];
      if (typeNameKey(row.nomenclatureType) === entry.nameKey) {
        specificationReferences.push({ specificationIndex, specification, structureItemIndex, row });
      }
    }
  }

  let serialized;
  try {
    serialized = JSON.stringify({
      target: { index: entry.index, row: entry.row },
      nomenclature: nomenclatureReferences.map(({ index, row }) => ({ index, row })),
      specifications: specificationReferences.map(({ specificationIndex, specification, structureItemIndex, row }) => ({
        specificationIndex,
        specificationId: specification.id,
        structureItemIndex,
        row,
      })),
    });
  } catch {
    return resultError(503, "invalid-directory-projection", "Nomenclature type impact cannot be represented as JSON");
  }
  const fingerprint = `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
  return {
    ok: true,
    entry,
    nomenclatureReferences,
    specificationReferences,
    impact: publicImpact(entry, nomenclatureReferences, specificationReferences, fingerprint),
  };
}

export function inspectNomenclatureTypeImpact(directory, itemIdInput) {
  const projection = inspectDirectory(directory);
  if (!projection.ok) return projection;
  const itemId = normalizeTypeId(itemIdInput);
  if (!itemId || itemId.length > MAX_TYPE_ID_LENGTH) {
    return resultError(400, "type-id-invalid", "A bounded Nomenclature type id is required");
  }
  const result = inspectImpactFromProjection(projection, itemId);
  if (!result.ok) return result;
  return { ok: true, ...result.impact };
}

function normalizeCommand(command) {
  if (!isRecord(command)) return resultError(400, "invalid-command", "A Nomenclature type command object is required");
  const kind = typeof command.kind === "string" ? command.kind.trim().toLowerCase() : "";
  if (!new Set(["create", "update", "delete"]).has(kind)) {
    return resultError(400, "invalid-command", "Nomenclature type command kind must be create, update or delete");
  }
  const itemId = normalizeTypeId(command.itemId);
  if (!itemId || itemId.length > MAX_TYPE_ID_LENGTH) {
    return resultError(400, "type-id-invalid", "A bounded Nomenclature type id is required");
  }
  return { ok: true, kind, itemId };
}

function normalizeInputRow(command, itemId, { currentRow = null } = {}) {
  if (!isRecord(command.row)) {
    return resultError(400, "type-row-required", "A Nomenclature type row is required");
  }
  const cloned = cloneCommandRow(command.row);
  if (!cloned.ok) return cloned;
  const providedId = cloned.row.id === undefined ? itemId : normalizeTypeId(cloned.row.id);
  if (!providedId || providedId !== itemId || (currentRow && itemId !== currentRow.id)) {
    return resultError(400, "type-id-mismatch", "Command itemId and row.id must identify the same immutable type");
  }
  const name = normalizeNomenclatureTypeName(cloned.row.name === undefined ? currentRow?.name : cloned.row.name);
  if (!name) return resultError(400, "type-name-required", "Nomenclature type name is required");
  if (name.length > MAX_TYPE_NAME_LENGTH) {
    return resultError(400, "type-name-too-long", "Nomenclature type name exceeds the supported length");
  }
  return {
    ok: true,
    row: {
      ...(currentRow || {}),
      ...cloned.row,
      id: currentRow?.id || itemId,
      name,
    },
  };
}

function exactExpectedRow(command, field, currentRow, conflictCode, label) {
  if (!isRecord(command[field])) {
    return resultError(400, `${field}-required`, `An exact ${field} is required for ${label}`);
  }
  if (!isDeepStrictEqual(command[field], currentRow)) {
    return resultError(409, conflictCode, `${label} changed after it was read`);
  }
  return { ok: true };
}

function duplicateNameConflict(projection, itemId, name) {
  const existing = projection.typeByName.get(typeNameKey(name));
  if (existing && existing.itemId !== itemId) {
    return resultError(409, "duplicate-type-name", "Another Nomenclature type already has this normalized name", {
      itemId,
      conflictingItemId: existing.itemId,
      name,
    });
  }
  return null;
}

function cascadeTypeName(directory, previousName, nextName) {
  const previousKey = typeNameKey(previousName);
  let nomenclatureRows = 0;
  let specificationRows = 0;
  const nomenclature = directory.nomenclature.map((row) => {
    if (typeNameKey(row.type) !== previousKey) return row;
    nomenclatureRows += 1;
    return { ...row, type: nextName };
  });
  const specifications = directory.specifications.map((specification) => {
    const structureItems = specification.structureItems || [];
    let changed = false;
    const nextStructureItems = structureItems.map((row) => {
      if (typeNameKey(row.nomenclatureType) !== previousKey) return row;
      changed = true;
      specificationRows += 1;
      return { ...row, nomenclatureType: nextName };
    });
    return changed ? { ...specification, structureItems: nextStructureItems } : specification;
  });
  return { nomenclature, specifications, nomenclatureRows, specificationRows };
}

function changeCounts({ created = 0, updated = 0, deleted = 0, nomenclatureRows = 0, specificationRows = 0 } = {}) {
  return {
    typeRowsCreated: created,
    typeRowsUpdated: updated,
    typeRowsDeleted: deleted,
    nomenclatureRowsRetyped: nomenclatureRows,
    specificationRowsRetyped: specificationRows,
    totalReferencesRetyped: nomenclatureRows + specificationRows,
  };
}

function validateResultDirectory(directory) {
  const projection = inspectDirectory(directory);
  if (!projection.ok) return projection;
  const references = validateTypeReferences(directory, projection.typeByName);
  if (!references.ok) return references;
  return projection;
}

export function applyNomenclatureTypeCommand(directory, command) {
  const projection = inspectDirectory(directory);
  if (!projection.ok) return projection;
  const normalizedCommand = normalizeCommand(command);
  if (!normalizedCommand.ok) return normalizedCommand;
  const { kind, itemId } = normalizedCommand;

  if (kind === "create") {
    if (projection.typeById.has(itemId)) {
      return resultError(409, "duplicate-type-id", "A Nomenclature type with this id already exists", { itemId });
    }
    const normalizedRow = normalizeInputRow(command, itemId);
    if (!normalizedRow.ok) return normalizedRow;
    const nameConflict = duplicateNameConflict(projection, itemId, normalizedRow.row.name);
    if (nameConflict) return nameConflict;
    const nextDirectory = {
      ...directory,
      nomenclatureTypes: [...directory.nomenclatureTypes, normalizedRow.row],
    };
    const nextProjection = validateResultDirectory(nextDirectory);
    if (!nextProjection.ok) return nextProjection;
    const after = inspectImpactFromProjection(nextProjection, itemId);
    if (!after.ok) return after;
    return {
      ok: true,
      kind,
      itemId,
      row: normalizedRow.row,
      directory: nextDirectory,
      counts: changeCounts({ created: 1 }),
      impact: { before: null, after: after.impact },
    };
  }

  const current = projection.typeById.get(itemId);
  if (!current) return resultError(404, "type-not-found", "Nomenclature type is absent", { itemId });
  const expectedTarget = exactExpectedRow(command, "expectedRow", current.row, "type-row-conflict", "Nomenclature type");
  if (!expectedTarget.ok) return expectedTarget;

  if (kind === "update") {
    const normalizedRow = normalizeInputRow(command, itemId, { currentRow: current.row });
    if (!normalizedRow.ok) return normalizedRow;
    const nameConflict = duplicateNameConflict(projection, itemId, normalizedRow.row.name);
    if (nameConflict) return nameConflict;
    const before = inspectImpactFromProjection(projection, itemId);
    if (!before.ok) return before;
    const displayNameChanged = current.name !== normalizedRow.row.name;
    const cascade = displayNameChanged
      ? cascadeTypeName(directory, current.name, normalizedRow.row.name)
      : { nomenclature: directory.nomenclature, specifications: directory.specifications, nomenclatureRows: 0, specificationRows: 0 };
    const nextDirectory = {
      ...directory,
      nomenclatureTypes: directory.nomenclatureTypes.map((row, index) => index === current.index ? normalizedRow.row : row),
      nomenclature: cascade.nomenclature,
      specifications: cascade.specifications,
    };
    const nextProjection = validateResultDirectory(nextDirectory);
    if (!nextProjection.ok) return nextProjection;
    const after = inspectImpactFromProjection(nextProjection, itemId);
    if (!after.ok) return after;
    return {
      ok: true,
      kind,
      itemId,
      row: normalizedRow.row,
      directory: nextDirectory,
      counts: changeCounts({ updated: 1, ...cascade }),
      impact: { before: before.impact, after: after.impact },
    };
  }

  if (directory.nomenclatureTypes.length <= 1) {
    return resultError(409, "last-type-delete-forbidden", "The last Nomenclature type cannot be deleted", { itemId });
  }
  const fallbackTypeId = normalizeTypeId(command.fallbackTypeId);
  if (!fallbackTypeId || fallbackTypeId.length > MAX_TYPE_ID_LENGTH) {
    return resultError(400, "fallback-type-required", "A bounded fallback Nomenclature type id is required");
  }
  if (fallbackTypeId === itemId) {
    return resultError(409, "fallback-type-is-target", "The deleted type cannot be its own fallback", { itemId });
  }
  const fallback = projection.typeById.get(fallbackTypeId);
  if (!fallback) {
    return resultError(409, "fallback-type-invalid", "Fallback Nomenclature type is absent", { fallbackTypeId });
  }
  const expectedFallback = exactExpectedRow(
    command,
    "fallbackExpectedRow",
    fallback.row,
    "fallback-row-conflict",
    "Fallback Nomenclature type",
  );
  if (!expectedFallback.ok) return expectedFallback;
  if (isInactiveTypeRow(fallback.row)) {
    return resultError(409, "fallback-type-inactive", "Fallback Nomenclature type must be active", { fallbackTypeId });
  }
  if (typeof command.impactFingerprint !== "string" || !command.impactFingerprint) {
    return resultError(400, "impact-fingerprint-required", "A delete impact fingerprint is required");
  }
  const before = inspectImpactFromProjection(projection, itemId);
  if (!before.ok) return before;
  if (command.impactFingerprint !== before.impact.fingerprint) {
    return resultError(409, "type-impact-changed", "Nomenclature type delete impact changed after confirmation", {
      itemId,
      currentImpact: before.impact,
    });
  }
  const cascade = cascadeTypeName(directory, current.name, fallback.name);
  const nextDirectory = {
    ...directory,
    nomenclatureTypes: directory.nomenclatureTypes.filter((_row, index) => index !== current.index),
    nomenclature: cascade.nomenclature,
    specifications: cascade.specifications,
  };
  const nextProjection = validateResultDirectory(nextDirectory);
  if (!nextProjection.ok) return nextProjection;
  return {
    ok: true,
    kind,
    itemId,
    row: current.row,
    fallback: { itemId: fallback.itemId, name: fallback.name },
    directory: nextDirectory,
    counts: changeCounts({ deleted: 1, ...cascade }),
    impact: { before: before.impact, after: null },
  };
}
