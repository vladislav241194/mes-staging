import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const REQUIRED_DIRECTORY_ARRAYS = Object.freeze([
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);
const BOM_CELL_COUNT = 9;
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 300;
const MAX_HEADER_LENGTH = 300;
const MAX_SOURCE_LABEL_LENGTH = 1_000;
const MAX_CELL_STRING_LENGTH = 4_000;
const MAX_IMPORT_ROWS = 20_000;
const MAX_JSON_DEPTH = 80;
const MAX_JSON_NODES = 250_000;
const MAX_JSON_KEYS = 250_000;
const RESULT_TYPE_NAME = "Печатные платы";
const CATALOG_COMPONENT_TYPE_NAME = "РЭА компоненты";
const COMPONENT_FIELDS = Object.freeze([
  "c0402",
  "c0603",
  "c0805",
  "csot23",
  "csoic",
  "cqfn",
  "cbga",
  "cconnector",
]);

export const DIRECTORY_CLUSTER_BOARD_REDUCER_CONTRACT = Object.freeze({
  requiredDirectoryArrays: REQUIRED_DIRECTORY_ARRAYS,
  bomCells: Object.freeze(["A", "B", "C", "D", "E", "F", "G", "H", "I"]),
  commands: Object.freeze({
    boardCreate: Object.freeze(["kind", "boardId", "row", "expectedResultRow", "resultItemId"]),
    boardUpdate: Object.freeze(["kind", "boardId", "expectedBoard", "row", "expectedResultRow", "resultItemId"]),
    boardDelete: Object.freeze(["kind", "boardId", "expectedBoard", "impactFingerprint"]),
    bomRowAdd: Object.freeze([
      "kind", "boardId", "expectedBoard", "sourceNomenclatureId", "expectedSourceNomenclature", "componentSync",
    ]),
    bomRowUpdate: Object.freeze(["kind", "boardId", "expectedBoard", "rowIndex", "columnIndex", "value", "componentSync"]),
    bomRowDelete: Object.freeze(["kind", "boardId", "expectedBoard", "rowIndex", "componentSync"]),
    bomImport: Object.freeze([
      "kind",
      "boardId",
      "row",
      "headers",
      "rows",
      "expectedResultRow",
      "resultItemId",
      "expectedDirectoryFingerprint",
      "allowRebase:false",
      "componentSync",
    ]),
  }),
  concurrency: Object.freeze({
    board: "exact whole expectedBoard",
    resultNomenclature: "exact expectedResultRow or explicit null",
    sourceNomenclature: "exact expectedSourceNomenclature",
    componentNomenclature: "exact componentSync upsert/detach baselines; stable ids for creates",
    import: "exact full Directory fingerprint; allowRebase must be false",
    deleteImpact: "sha256 impactFingerprint",
  }),
  deleteBehavior: Object.freeze({
    boards: "delete exact target board",
    specifications: "clear bomListA, bomListB and structureItems[].bomListId",
    nomenclature: "retain rows; detach sourceBomResultId/sourceBomIds references",
  }),
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resultError(statusCode, code, error, details = {}) {
  return { ok: false, statusCode, code, error, ...details };
}

function canonicalId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
}

function textKey(value) {
  return normalizeText(value).toLocaleLowerCase("ru-RU");
}

export function normalizeBoardName(value) {
  return normalizeText(value);
}

function jsonShape(value, subject, statusCode = 400) {
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
    if (nodes > MAX_JSON_NODES) {
      return resultError(statusCode, "json-node-limit", `${subject} contains too many JSON values`);
    }
    if (current.depth > MAX_JSON_DEPTH) {
      return resultError(statusCode, "json-depth-limit", `${subject} is nested too deeply`);
    }
    if (current.value === null || ["string", "boolean"].includes(typeof current.value)) continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return resultError(statusCode, "json-invalid", `${subject} contains a non-finite number`);
      continue;
    }
    if (typeof current.value !== "object") {
      return resultError(statusCode, "json-invalid", `${subject} contains a non-JSON value`);
    }
    if (active.has(current.value)) return resultError(statusCode, "json-invalid", `${subject} contains a cyclic reference`);
    active.add(current.value);
    stack.push({ value: current.value, depth: current.depth, exit: true });
    if (Array.isArray(current.value) && current.value.length > MAX_JSON_NODES - nodes) {
      return resultError(statusCode, "json-node-limit", `${subject} contains too many JSON values`);
    }
    let entries;
    try {
      entries = Array.isArray(current.value)
        ? current.value.map((entry) => [null, entry])
        : Object.entries(current.value);
    } catch {
      return resultError(statusCode, "json-invalid", `${subject} cannot be read as JSON`);
    }
    keys += Array.isArray(current.value) ? 0 : entries.length;
    if (keys > MAX_JSON_KEYS) return resultError(statusCode, "json-key-limit", `${subject} contains too many object keys`);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      stack.push({ value: entries[index][1], depth: current.depth + 1, exit: false });
    }
  }
  return { ok: true, nodes, keys };
}

function cloneJson(value, subject) {
  const shape = jsonShape(value, subject);
  if (!shape.ok) return shape;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") throw new TypeError("not serializable");
    const clone = JSON.parse(serialized);
    if (!isDeepStrictEqual(value, clone)) throw new TypeError("lossy JSON value");
    return { ok: true, value: clone };
  } catch {
    return resultError(400, "json-invalid", `${subject} must be exactly JSON-compatible`);
  }
}

function exactExpected(command, field, current, conflictCode, label, { nullable = false } = {}) {
  if (!Object.hasOwn(command, field)) {
    return resultError(400, `${field}-required`, `An exact ${field} baseline is required for ${label}`);
  }
  if (nullable && current === null) {
    return command[field] === null
      ? { ok: true }
      : resultError(409, conflictCode, `${label} mapping changed after it was read`);
  }
  if (nullable && command[field] === null) {
    return resultError(409, conflictCode, `${label} mapping changed after it was read`);
  }
  if (!isRecord(command[field])) {
    return resultError(400, `${field}-required`, `An exact object ${field} baseline is required for ${label}`);
  }
  return isDeepStrictEqual(command[field], current)
    ? { ok: true }
    : resultError(409, conflictCode, `${label} changed after it was read`);
}

function normalizeCell(value) {
  if (value === null || typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : resultError(400, "bom-cell-invalid", "A BOM cell number must be finite");
  }
  if (typeof value === "string") {
    return value.length <= MAX_CELL_STRING_LENGTH
      ? { ok: true, value }
      : resultError(413, "bom-cell-too-long", "A BOM cell exceeds the supported length");
  }
  return resultError(400, "bom-cell-invalid", "A BOM cell must be a JSON scalar");
}

function getRowValues(row) {
  const source = Array.isArray(row) ? row : row?.values;
  if (!Array.isArray(source)) return null;
  return Array.from({ length: BOM_CELL_COUNT }, (_unused, index) => (
    Object.hasOwn(source, index) ? source[index] : ""
  ));
}

function validateBomRow(row, label) {
  if (!Array.isArray(row) && !isRecord(row)) {
    return resultError(503, "invalid-bom-row", `${label} must be an array or object`);
  }
  const source = Array.isArray(row) ? row : row.values;
  if (!Array.isArray(source) || source.length > BOM_CELL_COUNT) {
    return resultError(503, "invalid-bom-row", `${label} must contain at most nine A:I cells`);
  }
  for (let columnIndex = 0; columnIndex < source.length; columnIndex += 1) {
    const cell = normalizeCell(source[columnIndex]);
    if (!cell.ok) return { ...cell, statusCode: 503, row: label, columnIndex };
  }
  const nomenclatureId = isRecord(row) ? canonicalId(row.nomenclatureId) : "";
  if (isRecord(row) && row.nomenclatureId !== undefined
    && (!nomenclatureId || nomenclatureId.length > MAX_ID_LENGTH || row.nomenclatureId !== nomenclatureId)) {
    return resultError(503, "invalid-bom-nomenclature-reference", `${label}.nomenclatureId must be a canonical bounded id`);
  }
  return { ok: true };
}

function inspectDirectory(directory) {
  const shape = jsonShape(directory, "Directory projection", 503);
  if (!shape.ok) return shape;
  if (!isRecord(directory)) return resultError(503, "invalid-directory-projection", "A complete legacy Directory object is required");
  for (const section of REQUIRED_DIRECTORY_ARRAYS) {
    if (!Array.isArray(directory[section])) {
      return resultError(503, "invalid-directory-projection", `Directory.${section} must be an array`, { section });
    }
  }

  const typeNames = new Set();
  for (let index = 0; index < directory.nomenclatureTypes.length; index += 1) {
    const row = directory.nomenclatureTypes[index];
    if (!isRecord(row)) return resultError(503, "invalid-type-row", "Every Nomenclature type must be an object", { index });
    const name = normalizeText(row.name);
    if (name) typeNames.add(textKey(name));
  }
  for (const requiredType of [RESULT_TYPE_NAME, CATALOG_COMPONENT_TYPE_NAME]) {
    if (!typeNames.has(textKey(requiredType))) {
      return resultError(503, "board-nomenclature-type-unavailable", `Nomenclature type «${requiredType}» is required`);
    }
  }

  const nomenclatureById = new Map();
  for (let index = 0; index < directory.nomenclature.length; index += 1) {
    const row = directory.nomenclature[index];
    if (!isRecord(row)) return resultError(503, "invalid-nomenclature-row", "Every Nomenclature row must be an object", { index });
    const itemId = canonicalId(row.id);
    if (!itemId || itemId.length > MAX_ID_LENGTH || row.id !== itemId) {
      return resultError(503, "invalid-nomenclature-id", "Every Nomenclature row needs a canonical bounded id", { index });
    }
    if (nomenclatureById.has(itemId)) return resultError(503, "duplicate-nomenclature-id", "Nomenclature ids must be unique", { itemId, index });
    if (row.sourceBomIds !== undefined && !Array.isArray(row.sourceBomIds)) {
      return resultError(503, "invalid-board-source-references", "Nomenclature.sourceBomIds must be an array when present", { itemId, index });
    }
    nomenclatureById.set(itemId, { row, index, itemId });
  }

  const boardById = new Map();
  const boardByName = new Map();
  for (let index = 0; index < directory.bomLists.length; index += 1) {
    const row = directory.bomLists[index];
    if (!isRecord(row)) return resultError(503, "invalid-board-row", "Every Board row must be an object", { index });
    const boardId = canonicalId(row.id);
    const name = normalizeBoardName(row.name);
    const nameKey = textKey(name);
    if (!boardId || boardId.length > MAX_ID_LENGTH || row.id !== boardId) {
      return resultError(503, "invalid-board-id", "Every Board needs a canonical bounded id", { index });
    }
    if (!name || name.length > MAX_NAME_LENGTH) return resultError(503, "invalid-board-name", "Every Board needs a bounded name", { index, boardId });
    if (boardById.has(boardId)) return resultError(503, "duplicate-board-id", "Board ids must be unique", { boardId, index });
    if (boardByName.has(nameKey)) {
      return resultError(503, "duplicate-board-name", "Board names must be unique after normalization", {
        boardId,
        conflictingBoardId: boardByName.get(nameKey).boardId,
        index,
      });
    }
    if (row.importHeaders !== undefined && (!Array.isArray(row.importHeaders) || row.importHeaders.length > BOM_CELL_COUNT)) {
      return resultError(503, "invalid-bom-headers", "Board.importHeaders must contain at most nine A:I labels", { boardId });
    }
    for (const [headerIndex, header] of (row.importHeaders || []).entries()) {
      if (typeof header !== "string" || header.length > MAX_HEADER_LENGTH) {
        return resultError(503, "invalid-bom-header", "Every persisted BOM header must be a bounded string", { boardId, headerIndex });
      }
    }
    if (row.importRows !== undefined && (!Array.isArray(row.importRows) || row.importRows.length > MAX_IMPORT_ROWS)) {
      return resultError(503, "invalid-bom-rows", "Board.importRows must be a bounded array", { boardId });
    }
    for (const field of ["importedAt", "sourceFileName", "sourceSheetName"]) {
      if (row[field] !== undefined && (typeof row[field] !== "string" || row[field].length > MAX_SOURCE_LABEL_LENGTH)) {
        return resultError(503, "invalid-bom-source-metadata", `Board.${field} must be a bounded string when present`, { boardId });
      }
    }
    for (let rowIndex = 0; rowIndex < (row.importRows || []).length; rowIndex += 1) {
      const validRow = validateBomRow(row.importRows[rowIndex], `Board ${boardId} BOM row ${rowIndex}`);
      if (!validRow.ok) return validRow;
    }
    const entry = { row, index, boardId, name, nameKey };
    boardById.set(boardId, entry);
    boardByName.set(nameKey, entry);
  }

  const specificationById = new Map();
  for (let index = 0; index < directory.specifications.length; index += 1) {
    const row = directory.specifications[index];
    if (!isRecord(row)) return resultError(503, "invalid-specification-row", "Every Specification row must be an object", { index });
    const itemId = canonicalId(row.id);
    if (!itemId || itemId.length > MAX_ID_LENGTH || row.id !== itemId || specificationById.has(itemId)) {
      return resultError(503, "invalid-specification-id", "Specification ids must be canonical and unique", { index, itemId });
    }
    if (row.structureItems !== undefined && !Array.isArray(row.structureItems)) {
      return resultError(503, "invalid-specification-structure", "Specification.structureItems must be an array when present", { itemId });
    }
    for (let structureIndex = 0; structureIndex < (row.structureItems || []).length; structureIndex += 1) {
      if (!isRecord(row.structureItems[structureIndex])) {
        return resultError(503, "invalid-specification-structure-row", "Every Specification structure row must be an object", { itemId, structureIndex });
      }
    }
    specificationById.set(itemId, { row, index, itemId });
  }

  return { ok: true, directory, typeNames, nomenclatureById, boardById, boardByName, specificationById };
}

function validateReferences(projection) {
  const danglingReferences = [];
  for (const entry of projection.boardById.values()) {
    for (let rowIndex = 0; rowIndex < (entry.row.importRows || []).length; rowIndex += 1) {
      const row = entry.row.importRows[rowIndex];
      const itemId = isRecord(row) ? canonicalId(row.nomenclatureId) : "";
      if (itemId && !projection.nomenclatureById.has(itemId)) {
        danglingReferences.push({ path: `bomLists[${entry.index}].importRows[${rowIndex}].nomenclatureId`, itemId });
      }
    }
  }
  for (const entry of projection.specificationById.values()) {
    for (const field of ["bomListA", "bomListB"]) {
      const rawBoardId = entry.row[field];
      const boardId = canonicalId(rawBoardId);
      if (rawBoardId !== undefined && rawBoardId !== null && rawBoardId !== ""
        && (boardId !== rawBoardId || !projection.boardById.has(boardId))) {
        danglingReferences.push({ path: `specifications[${entry.index}].${field}`, boardId });
      }
    }
    for (let structureIndex = 0; structureIndex < (entry.row.structureItems || []).length; structureIndex += 1) {
      const rawBoardId = entry.row.structureItems[structureIndex].bomListId;
      const boardId = canonicalId(rawBoardId);
      if (rawBoardId !== undefined && rawBoardId !== null && rawBoardId !== ""
        && (boardId !== rawBoardId || !projection.boardById.has(boardId))) {
        danglingReferences.push({ path: `specifications[${entry.index}].structureItems[${structureIndex}].bomListId`, boardId });
      }
    }
  }
  for (const entry of projection.nomenclatureById.values()) {
    const rawResultBoardId = entry.row.sourceBomResultId;
    const resultBoardId = canonicalId(rawResultBoardId);
    if (rawResultBoardId !== undefined && rawResultBoardId !== null && rawResultBoardId !== ""
      && (resultBoardId !== rawResultBoardId || !projection.boardById.has(resultBoardId))) {
      danglingReferences.push({ path: `nomenclature[${entry.index}].sourceBomResultId`, boardId: resultBoardId });
    }
    for (let sourceIndex = 0; sourceIndex < (entry.row.sourceBomIds || []).length; sourceIndex += 1) {
      const boardId = canonicalId(entry.row.sourceBomIds[sourceIndex]);
      if (!boardId || boardId !== entry.row.sourceBomIds[sourceIndex] || !projection.boardById.has(boardId)) {
        danglingReferences.push({ path: `nomenclature[${entry.index}].sourceBomIds[${sourceIndex}]`, boardId });
      }
    }
  }
  return danglingReferences.length
    ? resultError(409, "dangling-board-reference", "Directory contains dangling Board, BOM or Nomenclature references", {
      danglingReferences: danglingReferences.slice(0, 100),
    })
    : { ok: true };
}

function inspectValidDirectory(directory) {
  const projection = inspectDirectory(directory);
  if (!projection.ok) return projection;
  const references = validateReferences(projection);
  return references.ok ? projection : references;
}

export function fingerprintDirectoryBaseline(directory) {
  const projection = inspectValidDirectory(directory);
  if (!projection.ok) return projection;
  try {
    return {
      ok: true,
      fingerprint: `sha256:${createHash("sha256").update(JSON.stringify(directory)).digest("hex")}`,
    };
  } catch {
    return resultError(503, "invalid-directory-projection", "Directory cannot be fingerprinted as exact JSON");
  }
}

function resolveResultNomenclature(projection, board) {
  const boardId = canonicalId(board?.id);
  const articleKey = textKey(board?.boardCode);
  const nameKey = textKey(board?.resultItem || board?.boardCode || board?.name);
  const candidates = [];
  const candidateIds = new Set();
  for (const entry of projection.nomenclatureById.values()) {
    const direct = canonicalId(entry.row.sourceBomResultId) === boardId;
    const pcb = textKey(entry.row.type) === textKey(RESULT_TYPE_NAME);
    const fallback = pcb && (
      (articleKey && textKey(entry.row.article) === articleKey)
      || (nameKey && textKey(entry.row.name) === nameKey)
    );
    const existingOwnerBoardId = canonicalId(entry.row.sourceBomResultId);
    if (fallback && !direct && existingOwnerBoardId && existingOwnerBoardId !== boardId) {
      return resultError(409, "result-row-owned-by-another-board", "A matching Nomenclature result row already belongs to another Board", {
        boardId,
        itemId: entry.itemId,
        ownerBoardId: existingOwnerBoardId,
      });
    }
    if ((direct || fallback) && !candidateIds.has(entry.itemId)) {
      candidates.push({ ...entry, direct, fallback });
      candidateIds.add(entry.itemId);
    }
  }
  if (candidates.length > 1) {
    return resultError(409, "ambiguous-board-result", "More than one Nomenclature row can represent this Board result", {
      boardId,
      candidateItemIds: candidates.map((entry) => entry.itemId),
    });
  }
  return { ok: true, entry: candidates[0] || null };
}

function resultDescription(board) {
  return [
    board.name ? `Результат платы: ${board.name}` : "",
    board.boardCode ? `Децимальный номер: ${board.boardCode}` : "",
    "Тип позиции: печатная плата",
  ].filter(Boolean).join(". ");
}

function normalizeResultItemId(command, existing) {
  const requested = canonicalId(command.resultItemId);
  if (existing) {
    if (requested && requested !== existing.itemId) {
      return resultError(409, "result-item-id-conflict", "resultItemId does not identify the exact mapped result row", {
        requested,
        current: existing.itemId,
      });
    }
    return { ok: true, itemId: existing.itemId };
  }
  if (!requested || requested.length > MAX_ID_LENGTH) {
    return resultError(400, "result-item-id-required", "A canonical bounded resultItemId is required when no result row exists");
  }
  return { ok: true, itemId: requested };
}

function syncResultNomenclature(projection, board, command, now, mappingBoard = board) {
  const mapping = resolveResultNomenclature(projection, mappingBoard);
  if (!mapping.ok) return mapping;
  const current = mapping.entry?.row || null;
  const expected = exactExpected(command, "expectedResultRow", current, "result-row-conflict", "Board result Nomenclature", { nullable: true });
  if (!expected.ok) return expected;
  const resultId = normalizeResultItemId(command, mapping.entry);
  if (!resultId.ok) return resultId;
  const resultName = normalizeText(board.resultItem || board.boardCode || board.name);
  if (!resultName || resultName.length > MAX_NAME_LENGTH) {
    return resultError(400, "board-result-name-invalid", "Board result name must be a bounded non-empty string");
  }
  if (!mapping.entry && projection.nomenclatureById.has(resultId.itemId)) {
    return resultError(409, "duplicate-result-id", "resultItemId already belongs to another Nomenclature row", { itemId: resultId.itemId });
  }
  const nameConflict = [...projection.nomenclatureById.values()].find((entry) => (
    entry.itemId !== mapping.entry?.itemId && textKey(entry.row.name) === textKey(resultName)
  ));
  if (nameConflict) {
    return resultError(409, "duplicate-result-name", "Another Nomenclature row already has the Board result name", {
      itemId: resultId.itemId,
      conflictingItemId: nameConflict.itemId,
      name: resultName,
    });
  }
  const existingSourceIds = Array.isArray(current?.sourceBomIds) ? current.sourceBomIds : [];
  const sourceBomIds = [...new Set([...existingSourceIds, board.id])];
  const row = {
    ...(current || {}),
    id: resultId.itemId,
    name: resultName,
    article: normalizeText(board.boardCode) || current?.article || "",
    type: RESULT_TYPE_NAME,
    package: current?.package || "PCB",
    unit: current?.unit || "шт.",
    manufacturer: current?.manufacturer || "",
    description: resultDescription(board),
    status: current?.status || "Активен",
    sourceBomResultId: board.id,
    sourceBomIds,
    lastBomResultSyncAt: now,
    updatedAt: now,
  };
  const nomenclature = mapping.entry
    ? projection.directory.nomenclature.map((item, index) => index === mapping.entry.index ? row : item)
    : [...projection.directory.nomenclature, row];
  return {
    ok: true,
    row,
    nomenclature,
    created: mapping.entry ? 0 : 1,
    updated: mapping.entry ? 1 : 0,
    previous: current,
  };
}

function commandKind(command) {
  if (!isRecord(command)) return resultError(400, "invalid-command", "A Board/BOM command object is required");
  const shape = jsonShape(command, "Board/BOM command");
  if (!shape.ok) return shape;
  const kind = typeof command.kind === "string" ? command.kind.trim().toLowerCase() : "";
  const kinds = new Set([
    "board-create",
    "board-update",
    "board-delete",
    "bom-row-add",
    "bom-row-update",
    "bom-row-delete",
    "bom-import",
  ]);
  if (!kinds.has(kind)) return resultError(400, "invalid-command", "Unsupported Board/BOM command kind", { kind });
  const boardId = canonicalId(command.boardId || command.row?.id);
  if (!boardId || boardId.length > MAX_ID_LENGTH) return resultError(400, "board-id-invalid", "A bounded Board id is required");
  return { ok: true, kind, boardId };
}

function normalizeBoardRow(command, boardId, current, kind, now) {
  if (!isRecord(command.row)) return resultError(400, "board-row-required", "A Board metadata row is required");
  const cloned = cloneJson(command.row, "Board metadata row");
  if (!cloned.ok) return cloned;
  const input = cloned.value;
  for (const field of ["importHeaders", "importRows"]) {
    if (Object.hasOwn(input, field) && !Array.isArray(input[field])) {
      return resultError(400, "board-bom-shape-invalid", `Board.${field} must be an array when provided`);
    }
  }
  for (const field of ["importedAt", "sourceFileName", "sourceSheetName"]) {
    if (Object.hasOwn(input, field)
      && (typeof input[field] !== "string" || input[field].length > MAX_SOURCE_LABEL_LENGTH)) {
      return resultError(400, "board-bom-shape-invalid", `Board.${field} must be a bounded string when provided`);
    }
  }
  const inputId = input.id === undefined ? boardId : canonicalId(input.id);
  if (inputId !== boardId || (current && current.id !== boardId)) {
    return resultError(400, "board-id-mismatch", "Command boardId and row.id must identify the same immutable Board");
  }
  if (kind === "board-update") {
    for (const field of ["importHeaders", "importRows", "importedAt", "sourceFileName", "sourceSheetName"]) {
      if (Object.hasOwn(input, field) && !isDeepStrictEqual(input[field], current[field])) {
        return resultError(409, "board-bom-owned-separately", `Board metadata save cannot change ${field}`);
      }
    }
  }
  if (kind === "board-create" && (
    (Array.isArray(input.importHeaders) && input.importHeaders.length)
    || (Array.isArray(input.importRows) && input.importRows.length)
    || normalizeText(input.importedAt)
    || normalizeText(input.sourceFileName)
    || normalizeText(input.sourceSheetName)
  )) {
    return resultError(409, "board-bom-owned-separately", "Use bom-import to create a Board with imported A:I data or source metadata");
  }
  const name = normalizeBoardName(input.name === undefined ? current?.name : input.name);
  if (!name) return resultError(400, "board-name-required", "Board name is required");
  if (name.length > MAX_NAME_LENGTH) return resultError(400, "board-name-too-long", "Board name exceeds the supported length");
  const boardCode = normalizeText(input.boardCode === undefined ? current?.boardCode : input.boardCode);
  const resultItem = normalizeText(input.resultItem === undefined ? current?.resultItem : input.resultItem)
    || `Печатная плата ${boardCode || name}`;
  if (boardCode.length > MAX_NAME_LENGTH || resultItem.length > MAX_NAME_LENGTH) {
    return resultError(400, "board-metadata-too-long", "Board code or result name exceeds the supported length");
  }
  const row = {
    ...(current || {}),
    ...input,
    id: boardId,
    name,
    boardCode,
    resultItem,
    status: normalizeText(input.status === undefined ? current?.status : input.status) || "Черновик",
    importHeaders: current?.importHeaders || input.importHeaders || [],
    importRows: current?.importRows || input.importRows || [],
    importedAt: current ? current.importedAt || "" : normalizeText(input.importedAt),
    sourceFileName: current ? current.sourceFileName || "" : normalizeText(input.sourceFileName),
    sourceSheetName: current ? current.sourceSheetName || "" : normalizeText(input.sourceSheetName),
    updatedAt: now,
  };
  Object.assign(row, componentCounts(row.importRows));
  return { ok: true, row };
}

function duplicateBoardName(projection, boardId, name) {
  const existing = projection.boardByName.get(textKey(name));
  return existing && existing.boardId !== boardId
    ? resultError(409, "duplicate-board-name", "Another Board already has this normalized name", {
      boardId,
      conflictingBoardId: existing.boardId,
      name,
    })
    : null;
}

function counts(overrides = {}) {
  const value = {
    boardRowsCreated: 0,
    boardRowsUpdated: 0,
    boardRowsDeleted: 0,
    bomRowsAdded: 0,
    bomRowsUpdated: 0,
    bomRowsDeleted: 0,
    bomRowsImported: 0,
    resultRowsCreated: 0,
    resultRowsUpdated: 0,
    resultRowsDetached: 0,
    componentRowsCreated: 0,
    componentRowsUpdated: 0,
    componentRowsDetached: 0,
    componentSourceRefsAdded: 0,
    componentSourceRefsRemoved: 0,
    specificationFieldsCleared: 0,
    specificationStructureRefsCleared: 0,
    nomenclatureBoardRefsCleared: 0,
    ...overrides,
  };
  return { ...value, totalChanges: Object.values(value).reduce((sum, count) => sum + count, 0) };
}

function finalize(directory) {
  const projection = inspectValidDirectory(directory);
  return projection.ok ? { ok: true, projection } : projection;
}

function validateExactResultMapping(projection, board, resultItemId) {
  const mapping = resolveResultNomenclature(projection, board);
  if (!mapping.ok) return mapping;
  return mapping.entry?.itemId === resultItemId
    ? { ok: true }
    : resultError(409, "board-result-mapping-conflict", "Board result mapping is not exact after the atomic command", {
      boardId: board.id,
      expectedResultItemId: resultItemId,
      currentResultItemId: mapping.entry?.itemId || "",
    });
}

function boardMetadataCommand(projection, command, kind, boardId, now) {
  const current = projection.boardById.get(boardId) || null;
  if (kind === "board-create" && current) return resultError(409, "duplicate-board-id", "A Board with this id already exists", { boardId });
  if (kind === "board-update" && !current) return resultError(404, "board-not-found", "Board is absent", { boardId });
  if (current) {
    const expected = exactExpected(command, "expectedBoard", current.row, "board-row-conflict", "Board");
    if (!expected.ok) return expected;
  }
  const normalized = normalizeBoardRow(command, boardId, current?.row || null, kind, now);
  if (!normalized.ok) return normalized;
  const nameConflict = duplicateBoardName(projection, boardId, normalized.row.name);
  if (nameConflict) return nameConflict;
  const resultSync = syncResultNomenclature(projection, normalized.row, command, now, current?.row || normalized.row);
  if (!resultSync.ok) return resultSync;
  // Resolve against the old Board identity, then atomically write the new metadata.
  const syncedRow = resultSync.row;
  const nomenclature = resultSync.created
    ? [...projection.directory.nomenclature, syncedRow]
    : resultSync.nomenclature.map((row) => row.id === syncedRow.id ? syncedRow : row);
  const bomLists = kind === "board-create"
    ? [...projection.directory.bomLists, normalized.row]
    : projection.directory.bomLists.map((row, index) => index === current.index ? normalized.row : row);
  const nextDirectory = { ...projection.directory, nomenclature, bomLists };
  const valid = finalize(nextDirectory);
  if (!valid.ok) return valid;
  const exactResult = validateExactResultMapping(valid.projection, normalized.row, syncedRow.id);
  if (!exactResult.ok) return exactResult;
  return {
    ok: true,
    kind,
    boardId,
    row: normalized.row,
    resultRow: syncedRow,
    directory: nextDirectory,
    counts: counts({
      boardRowsCreated: kind === "board-create" ? 1 : 0,
      boardRowsUpdated: kind === "board-update" ? 1 : 0,
      resultRowsCreated: resultSync.created,
      resultRowsUpdated: resultSync.updated,
    }),
    impact: {
      before: current ? { board: current.row, resultRow: resultSync.previous } : null,
      after: { board: normalized.row, resultRow: syncedRow },
    },
  };
}

function publicDeleteImpact(entry, specificationRefs, structureRefs, nomenclatureRefs, resultEntry, fingerprint) {
  return {
    boardId: entry.boardId,
    boardName: entry.name,
    fingerprint,
    counts: {
      bomRows: (entry.row.importRows || []).length,
      specificationRows: new Set([...specificationRefs, ...structureRefs].map((ref) => ref.specificationId)).size,
      specificationFields: specificationRefs.length,
      specificationStructureRefs: structureRefs.length,
      nomenclatureRows: new Set(nomenclatureRefs.map((ref) => ref.itemId)).size,
      nomenclatureSourceRefs: nomenclatureRefs.reduce((sum, ref) => sum + ref.referenceCount, 0),
      mappedResultRows: resultEntry ? 1 : 0,
    },
    references: {
      specifications: specificationRefs.map(({ specificationIndex, specificationId, field }) => ({ specificationIndex, specificationId, field })),
      specificationStructure: structureRefs.map(({ specificationIndex, specificationId, structureIndex, structureItemId }) => ({
        specificationIndex,
        specificationId,
        structureIndex,
        structureItemId,
      })),
      nomenclature: nomenclatureRefs.map(({ index, itemId, directResult, sourceIndexes }) => ({ index, itemId, directResult, sourceIndexes })),
    },
    resultItemId: resultEntry?.itemId || "",
  };
}

function inspectDeleteFromProjection(projection, boardId) {
  const entry = projection.boardById.get(boardId);
  if (!entry) return resultError(404, "board-not-found", "Board is absent", { boardId });
  const result = resolveResultNomenclature(projection, entry.row);
  if (!result.ok) return result;
  const specificationRefs = [];
  const structureRefs = [];
  for (const specification of projection.specificationById.values()) {
    for (const field of ["bomListA", "bomListB"]) {
      if (canonicalId(specification.row[field]) === boardId) {
        specificationRefs.push({
          specificationIndex: specification.index,
          specificationId: specification.itemId,
          field,
          row: specification.row,
        });
      }
    }
    for (let structureIndex = 0; structureIndex < (specification.row.structureItems || []).length; structureIndex += 1) {
      const structureRow = specification.row.structureItems[structureIndex];
      if (canonicalId(structureRow.bomListId) === boardId) {
        structureRefs.push({
          specificationIndex: specification.index,
          specificationId: specification.itemId,
          structureIndex,
          structureItemId: canonicalId(structureRow.id),
          row: structureRow,
        });
      }
    }
  }
  const nomenclatureRefs = [];
  for (const nomenclature of projection.nomenclatureById.values()) {
    const directResult = canonicalId(nomenclature.row.sourceBomResultId) === boardId;
    const sourceIndexes = (nomenclature.row.sourceBomIds || []).flatMap((value, sourceIndex) => value === boardId ? [sourceIndex] : []);
    if (directResult || sourceIndexes.length) {
      nomenclatureRefs.push({
        index: nomenclature.index,
        itemId: nomenclature.itemId,
        directResult,
        sourceIndexes,
        referenceCount: Number(directResult) + sourceIndexes.length,
        row: nomenclature.row,
      });
    }
  }
  let serialized;
  try {
    const affectedSpecificationIndexes = new Set([
      ...specificationRefs.map((ref) => ref.specificationIndex),
      ...structureRefs.map((ref) => ref.specificationIndex),
    ]);
    serialized = JSON.stringify({
      target: { index: entry.index, row: entry.row },
      specifications: projection.directory.specifications.flatMap((row, index) => (
        affectedSpecificationIndexes.has(index) ? [{ index, row }] : []
      )),
      nomenclature: nomenclatureRefs.map((ref) => ({ index: ref.index, row: ref.row })),
      resultItemId: result.entry?.itemId || "",
    });
  } catch {
    return resultError(503, "invalid-directory-projection", "Board delete impact cannot be represented as JSON");
  }
  const fingerprint = `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
  return {
    ok: true,
    entry,
    resultEntry: result.entry,
    specificationRefs,
    structureRefs,
    nomenclatureRefs,
    impact: publicDeleteImpact(entry, specificationRefs, structureRefs, nomenclatureRefs, result.entry, fingerprint),
  };
}

export function inspectBoardDeleteImpact(directory, boardIdInput) {
  const projection = inspectValidDirectory(directory);
  if (!projection.ok) return projection;
  const boardId = canonicalId(boardIdInput);
  if (!boardId || boardId.length > MAX_ID_LENGTH) return resultError(400, "board-id-invalid", "A bounded Board id is required");
  const inspected = inspectDeleteFromProjection(projection, boardId);
  return inspected.ok ? { ok: true, ...inspected.impact } : inspected;
}

function boardDeleteCommand(projection, command, boardId) {
  const inspected = inspectDeleteFromProjection(projection, boardId);
  if (!inspected.ok) return inspected;
  const expected = exactExpected(command, "expectedBoard", inspected.entry.row, "board-row-conflict", "Board");
  if (!expected.ok) return expected;
  if (typeof command.impactFingerprint !== "string" || !command.impactFingerprint) {
    return resultError(400, "impact-fingerprint-required", "A Board delete impact fingerprint is required");
  }
  if (command.impactFingerprint !== inspected.impact.fingerprint) {
    return resultError(409, "board-impact-changed", "Board delete impact changed after confirmation", {
      boardId,
      currentImpact: inspected.impact,
    });
  }
  let specificationFieldsCleared = 0;
  let specificationStructureRefsCleared = 0;
  const specifications = projection.directory.specifications.map((specification) => {
    let changed = false;
    let next = specification;
    for (const field of ["bomListA", "bomListB"]) {
      if (canonicalId(next[field]) === boardId) {
        if (!changed) next = { ...next };
        next[field] = "";
        changed = true;
        specificationFieldsCleared += 1;
      }
    }
    if (Array.isArray(specification.structureItems)) {
      let structureChanged = false;
      const structureItems = specification.structureItems.map((row) => {
        if (canonicalId(row.bomListId) !== boardId) return row;
        structureChanged = true;
        specificationStructureRefsCleared += 1;
        return { ...row, bomListId: "" };
      });
      if (structureChanged) {
        if (!changed) next = { ...next };
        next.structureItems = structureItems;
        changed = true;
      }
    }
    return next;
  });
  let resultRowsDetached = 0;
  let nomenclatureBoardRefsCleared = 0;
  const retainedNomenclatureIds = [];
  const nomenclature = projection.directory.nomenclature.map((row) => {
    const direct = canonicalId(row.sourceBomResultId) === boardId;
    const sourceIds = Array.isArray(row.sourceBomIds) ? row.sourceBomIds : [];
    const nextSourceIds = sourceIds.filter((sourceId) => sourceId !== boardId);
    const removedSources = sourceIds.length - nextSourceIds.length;
    if (!direct && !removedSources) return row;
    nomenclatureBoardRefsCleared += Number(direct) + removedSources;
    if (direct) resultRowsDetached += 1;
    retainedNomenclatureIds.push(row.id);
    const next = { ...row };
    if (direct) next.sourceBomResultId = "";
    if (removedSources) next.sourceBomIds = nextSourceIds;
    return next;
  });
  const nextDirectory = {
    ...projection.directory,
    nomenclature,
    bomLists: projection.directory.bomLists.filter((_row, index) => index !== inspected.entry.index),
    specifications,
  };
  const valid = finalize(nextDirectory);
  if (!valid.ok) return valid;
  return {
    ok: true,
    kind: "board-delete",
    boardId,
    row: inspected.entry.row,
    directory: nextDirectory,
    retainedNomenclatureIds,
    counts: counts({
      boardRowsDeleted: 1,
      bomRowsDeleted: (inspected.entry.row.importRows || []).length,
      resultRowsDetached,
      specificationFieldsCleared,
      specificationStructureRefsCleared,
      nomenclatureBoardRefsCleared,
    }),
    impact: { before: inspected.impact, after: null },
  };
}

function normalizeRowIndex(value, length) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length ? value : null;
}

function replaceRowCell(row, columnIndex, value) {
  const values = getRowValues(row);
  values[columnIndex] = value;
  return Array.isArray(row) ? values : { ...row, values };
}

function packageField(values) {
  const compact = normalizeText(String(values[5] ?? "")).toLocaleLowerCase("ru-RU").replace(/[.,\s-]/gu, "");
  const description = `${values[1] ?? ""} ${values[5] ?? ""}`.toLocaleLowerCase("ru-RU");
  if (["0201", "201"].includes(compact)) return "c0402";
  if (["0402", "402"].includes(compact)) return "c0402";
  if (["0603", "603"].includes(compact)) return "c0603";
  if (["0805", "805", "2012"].includes(compact)) return "c0805";
  if (/sot|sod/u.test(description)) return "csot23";
  if (/soic|tssop|ssop|hsop/u.test(description)) return "csoic";
  if (/qfn|dfn|lga/u.test(description)) return "cqfn";
  if (/bga/u.test(description)) return "cbga";
  return "cconnector";
}

function componentCounts(rows) {
  const totals = Object.fromEntries(COMPONENT_FIELDS.map((field) => [field, 0]));
  for (const row of rows) {
    const values = getRowValues(row);
    if (!hasComponentIdentity(values)) continue;
    const raw = typeof values[6] === "number" ? values[6] : Number(String(values[6] ?? "").trim().replace(",", "."));
    const quantity = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
    const field = packageField(values);
    totals[field] += quantity;
  }
  return totals;
}

function hasComponentIdentity(values) {
  return [values[1], values[3], values[2]].some((value) => normalizeText(String(value ?? "")));
}

function componentPackageKey(value) {
  return normalizeText(String(value ?? ""))
    .toLocaleLowerCase("ru-RU")
    .replace(/[.,\s-]/gu, "");
}

function makeComponentPayload(row, board) {
  const values = getRowValues(row);
  const sequence = String(values[0] ?? "").trim();
  const description = normalizeText(String(values[1] ?? ""));
  const designator = normalizeText(String(values[2] ?? ""));
  const article = normalizeText(String(values[3] ?? ""));
  const manufacturer = normalizeText(String(values[4] ?? ""));
  const packageValue = normalizeText(String(values[5] ?? ""));
  const note = normalizeText(String(values[7] ?? ""));
  const name = description || article || designator || `Компонент ${sequence}`.trim();
  const identity = article
    ? { kind: "article", article: textKey(article) }
    : {
      kind: "tuple",
      name: textKey(name),
      package: componentPackageKey(packageValue),
      manufacturer: textKey(manufacturer),
    };
  const identityKey = `${identity.kind}:sha256:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
  const descriptionParts = [
    designator ? `Обозначение: ${designator}` : "",
    note ? `Примечание: ${note}` : "",
    board?.name ? `Источник BOM: ${board.name}` : "",
  ].filter(Boolean);
  return {
    eligible: hasComponentIdentity(values),
    identity,
    identityKey,
    directItemId: isRecord(row) ? canonicalId(row.nomenclatureId) : "",
    name,
    article,
    manufacturer,
    package: packageValue,
    description: descriptionParts.join(". "),
  };
}

function componentIdentityMatches(row, identity) {
  if (identity.kind === "article") return textKey(row.article) === identity.article;
  return textKey(row.name) === identity.name
    && componentPackageKey(row.package) === identity.package
    && textKey(row.manufacturer) === identity.manufacturer;
}

function buildComponentSyncPlan(projection, board, rows) {
  const groups = new Map();
  const skippedRowIndexes = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const payload = makeComponentPayload(rows[rowIndex], board);
    if (!payload.eligible) {
      if (payload.directItemId) {
        return resultError(409, "component-row-identity-required", "A BOM row linked to Nomenclature must contain description, article or designator", {
          boardId: board.id,
          rowIndex,
          itemId: payload.directItemId,
        });
      }
      skippedRowIndexes.push(rowIndex);
      continue;
    }
    if (!payload.name || payload.name.length > MAX_NAME_LENGTH
      || payload.article.length > MAX_NAME_LENGTH
      || payload.manufacturer.length > MAX_NAME_LENGTH
      || payload.package.length > MAX_NAME_LENGTH
      || payload.description.length > MAX_CELL_STRING_LENGTH) {
      return resultError(413, "component-metadata-too-long", "A BOM row produces unsupported Nomenclature metadata", {
        boardId: board.id,
        rowIndex,
      });
    }
    const group = groups.get(payload.identityKey) || {
      identityKey: payload.identityKey,
      identity: payload.identity,
      payload,
      rowIndexes: [],
      directItemIds: new Set(),
    };
    group.rowIndexes.push(rowIndex);
    if (payload.directItemId) group.directItemIds.add(payload.directItemId);
    groups.set(payload.identityKey, group);
  }

  const upserts = [];
  const selectedItemIds = new Set();
  for (const group of groups.values()) {
    if (group.directItemIds.size > 1) {
      return resultError(409, "ambiguous-component-mapping", "Equivalent BOM rows point to different Nomenclature rows", {
        boardId: board.id,
        identityKey: group.identityKey,
        itemIds: [...group.directItemIds],
        rowIndexes: group.rowIndexes,
      });
    }
    const candidates = new Map();
    for (const itemId of group.directItemIds) {
      const direct = projection.nomenclatureById.get(itemId);
      if (!direct) {
        return resultError(409, "component-nomenclature-not-found", "A BOM row points to an absent Nomenclature item", {
          boardId: board.id,
          identityKey: group.identityKey,
          itemId,
        });
      }
    }
    for (const candidate of projection.nomenclatureById.values()) {
      if (componentIdentityMatches(candidate.row, group.identity)) candidates.set(candidate.itemId, candidate);
    }
    if (candidates.size > 1) {
      return resultError(409, "ambiguous-component-mapping", "More than one Nomenclature row matches a BOM component identity", {
        boardId: board.id,
        identityKey: group.identityKey,
        itemIds: [...candidates.keys()],
        rowIndexes: group.rowIndexes,
      });
    }
    const current = [...candidates.values()][0] || null;
    if (current && textKey(current.row.type) !== textKey(CATALOG_COMPONENT_TYPE_NAME)) {
      return resultError(409, "component-nomenclature-type-conflict", "A BOM component identity belongs to a non-component Nomenclature row", {
        boardId: board.id,
        identityKey: group.identityKey,
        itemId: current.itemId,
        currentType: normalizeText(current.row.type),
      });
    }
    if (current && selectedItemIds.has(current.itemId)) {
      return resultError(409, "ambiguous-component-mapping", "Different BOM component identities collapse onto one Nomenclature row", {
        boardId: board.id,
        identityKey: group.identityKey,
        itemId: current.itemId,
      });
    }
    if (current) selectedItemIds.add(current.itemId);
    upserts.push({
      identityKey: group.identityKey,
      identity: group.identity,
      rowIndexes: group.rowIndexes,
      occurrences: group.rowIndexes.length,
      payload: group.payload,
      current,
    });
  }

  const detaches = [];
  for (const entry of projection.nomenclatureById.values()) {
    if (canonicalId(entry.row.sourceBomResultId) === board.id) continue;
    if (!(entry.row.sourceBomIds || []).includes(board.id) || selectedItemIds.has(entry.itemId)) continue;
    detaches.push(entry);
  }
  return { ok: true, upserts, detaches, skippedRowIndexes };
}

function publicComponentPlan(plan) {
  return {
    upserts: plan.upserts.map((entry) => ({
      identityKey: entry.identityKey,
      identity: entry.identity,
      rowIndexes: entry.rowIndexes,
      occurrences: entry.occurrences,
      itemId: entry.current?.itemId || "",
      expectedRow: entry.current?.row || null,
      requiresStableItemId: !entry.current,
    })),
    detaches: plan.detaches.map((entry) => ({ itemId: entry.itemId, expectedRow: entry.row })),
    skippedRowIndexes: plan.skippedRowIndexes,
    counts: {
      uniqueComponents: plan.upserts.length,
      newComponents: plan.upserts.filter((entry) => !entry.current).length,
      existingComponents: plan.upserts.filter((entry) => entry.current).length,
      detachRows: plan.detaches.length,
      skippedRows: plan.skippedRowIndexes.length,
    },
  };
}

export function inspectBomComponentSync(directory, input = {}) {
  const projection = inspectValidDirectory(directory);
  if (!projection.ok) return projection;
  if (!isRecord(input)) return resultError(400, "component-sync-input-invalid", "A component sync input object is required");
  const boardId = canonicalId(input.boardId);
  const boardName = normalizeBoardName(input.boardName);
  if (!boardId || boardId.length > MAX_ID_LENGTH || !boardName || boardName.length > MAX_NAME_LENGTH) {
    return resultError(400, "component-sync-board-invalid", "A bounded boardId and boardName are required for component sync inspection");
  }
  if (!Array.isArray(input.rows) || input.rows.length > MAX_IMPORT_ROWS) {
    return resultError(400, "component-sync-rows-invalid", "A bounded parsed BOM row array is required");
  }
  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex += 1) {
    const valid = validateBomRow(input.rows[rowIndex], `Component sync row ${rowIndex}`);
    if (!valid.ok) return { ...valid, statusCode: 400 };
  }
  const plan = buildComponentSyncPlan(projection, { id: boardId, name: boardName }, input.rows);
  return plan.ok ? { ok: true, boardId, ...publicComponentPlan(plan) } : plan;
}

function normalizeComponentSyncCommand(componentSync, plan, projection) {
  if (!isRecord(componentSync) || !Array.isArray(componentSync.upserts) || !Array.isArray(componentSync.detaches)) {
    return resultError(400, "component-sync-required", "An exact componentSync upsert/detach plan is required");
  }
  const suppliedUpserts = new Map();
  for (const entry of componentSync.upserts) {
    if (!isRecord(entry) || typeof entry.identityKey !== "string" || suppliedUpserts.has(entry.identityKey)) {
      return resultError(400, "component-sync-invalid", "componentSync.upserts must have unique identityKey values");
    }
    suppliedUpserts.set(entry.identityKey, entry);
  }
  if (suppliedUpserts.size !== plan.upserts.length) {
    return resultError(409, "component-sync-plan-conflict", "componentSync upsert identities changed after preparation", {
      currentPlan: publicComponentPlan(plan),
    });
  }
  const usedItemIds = new Set(projection.nomenclatureById.keys());
  const normalizedUpserts = [];
  for (const expected of plan.upserts) {
    const supplied = suppliedUpserts.get(expected.identityKey);
    if (!supplied) {
      return resultError(409, "component-sync-plan-conflict", "componentSync is missing a current component identity", {
        identityKey: expected.identityKey,
        currentPlan: publicComponentPlan(plan),
      });
    }
    const currentRow = expected.current?.row || null;
    const baseline = exactExpected(
      supplied,
      "expectedRow",
      currentRow,
      "component-row-conflict",
      "Component Nomenclature row",
      { nullable: true },
    );
    if (!baseline.ok) return baseline;
    const itemId = canonicalId(supplied.itemId);
    if (!itemId || itemId.length > MAX_ID_LENGTH || supplied.itemId !== itemId) {
      return resultError(400, "component-item-id-required", "Every component sync upsert needs a canonical bounded itemId", {
        identityKey: expected.identityKey,
      });
    }
    if (expected.current && itemId !== expected.current.itemId) {
      return resultError(409, "component-item-id-conflict", "Component itemId does not identify the exact mapped row", {
        identityKey: expected.identityKey,
        requested: itemId,
        current: expected.current.itemId,
      });
    }
    if (!expected.current && usedItemIds.has(itemId)) {
      return resultError(409, "duplicate-component-id", "A generated component itemId collides with an existing or planned Nomenclature row", {
        identityKey: expected.identityKey,
        itemId,
      });
    }
    usedItemIds.add(itemId);
    normalizedUpserts.push({ ...expected, itemId });
  }

  const suppliedDetaches = new Map();
  for (const entry of componentSync.detaches) {
    const itemId = isRecord(entry) ? canonicalId(entry.itemId) : "";
    if (!itemId || entry.itemId !== itemId || suppliedDetaches.has(itemId)) {
      return resultError(400, "component-sync-invalid", "componentSync.detaches must have unique canonical itemId values");
    }
    suppliedDetaches.set(itemId, entry);
  }
  if (suppliedDetaches.size !== plan.detaches.length) {
    return resultError(409, "component-sync-plan-conflict", "componentSync detach rows changed after preparation", {
      currentPlan: publicComponentPlan(plan),
    });
  }
  for (const expected of plan.detaches) {
    const supplied = suppliedDetaches.get(expected.itemId);
    if (!supplied) {
      return resultError(409, "component-sync-plan-conflict", "componentSync is missing a current detach row", {
        itemId: expected.itemId,
        currentPlan: publicComponentPlan(plan),
      });
    }
    const baseline = exactExpected(supplied, "expectedRow", expected.row, "component-row-conflict", "Detached component Nomenclature row");
    if (!baseline.ok) return baseline;
  }
  return { ok: true, upserts: normalizedUpserts, detaches: plan.detaches };
}

function reconcileBomComponents(projection, board, rows, componentSync, now) {
  const plan = buildComponentSyncPlan(projection, board, rows);
  if (!plan.ok) return plan;
  const normalized = normalizeComponentSyncCommand(componentSync, plan, projection);
  if (!normalized.ok) return normalized;
  const replacements = new Map();
  const created = [];
  const itemIdByIdentity = new Map();
  let componentRowsCreated = 0;
  let componentRowsUpdated = 0;
  let componentRowsDetached = 0;
  let componentSourceRefsAdded = 0;
  let componentSourceRefsRemoved = 0;
  for (const entry of normalized.upserts) {
    const current = entry.current?.row || null;
    const sourceBomIds = [...new Set(Array.isArray(current?.sourceBomIds) ? current.sourceBomIds : [])];
    const alreadyLinked = sourceBomIds.includes(board.id);
    const row = {
      ...(current || {}),
      id: entry.itemId,
      name: current?.name || entry.payload.name,
      article: current?.article || entry.payload.article,
      type: CATALOG_COMPONENT_TYPE_NAME,
      package: current?.package || entry.payload.package,
      unit: current?.unit || "шт.",
      manufacturer: current?.manufacturer || entry.payload.manufacturer,
      description: current?.description || entry.payload.description,
      status: current?.status || "Активен",
      sourceBomIds: alreadyLinked ? sourceBomIds : [...sourceBomIds, board.id],
      lastBomImportAt: now,
      updatedAt: now,
    };
    if (entry.current) {
      replacements.set(entry.itemId, row);
      componentRowsUpdated += 1;
    } else {
      created.push(row);
      componentRowsCreated += 1;
    }
    if (!alreadyLinked) componentSourceRefsAdded += 1;
    itemIdByIdentity.set(entry.identityKey, entry.itemId);
  }
  for (const entry of normalized.detaches) {
    const nextSourceIds = entry.row.sourceBomIds.filter((sourceId) => sourceId !== board.id);
    replacements.set(entry.itemId, { ...entry.row, sourceBomIds: nextSourceIds, updatedAt: now });
    componentRowsDetached += 1;
    componentSourceRefsRemoved += entry.row.sourceBomIds.length - nextSourceIds.length;
  }
  const nomenclature = [
    ...projection.directory.nomenclature.map((row) => replacements.get(row.id) || row),
    ...created,
  ];
  const linkedRows = rows.map((row) => {
    if (!isRecord(row)) return row;
    const identityKey = makeComponentPayload(row, board).identityKey;
    const itemId = itemIdByIdentity.get(identityKey);
    return itemId && row.nomenclatureId !== itemId ? { ...row, nomenclatureId: itemId } : row;
  });
  const inspectedPlan = publicComponentPlan(plan);
  const appliedItemIdByIdentity = new Map(normalized.upserts.map((entry) => [entry.identityKey, entry.itemId]));
  return {
    ok: true,
    nomenclature,
    rows: linkedRows,
    plan: {
      ...inspectedPlan,
      upserts: inspectedPlan.upserts.map((entry) => ({
        ...entry,
        itemId: appliedItemIdByIdentity.get(entry.identityKey) || entry.itemId,
      })),
    },
    counts: {
      componentRowsCreated,
      componentRowsUpdated,
      componentRowsDetached,
      componentSourceRefsAdded,
      componentSourceRefsRemoved,
    },
  };
}

function updateBoardBom(entry, rows, now, headers = entry.row.importHeaders) {
  return {
    ...entry.row,
    importHeaders: headers,
    importRows: rows,
    importedAt: entry.row.importedAt || now,
    updatedAt: now,
    ...componentCounts(rows),
  };
}

function exactBoardForBom(projection, command, boardId) {
  const entry = projection.boardById.get(boardId);
  if (!entry) return resultError(404, "board-not-found", "Board is absent", { boardId });
  const expected = exactExpected(command, "expectedBoard", entry.row, "board-row-conflict", "Board");
  return expected.ok ? { ok: true, entry } : expected;
}

function bomPointCommand(projection, command, kind, boardId, now) {
  const target = exactBoardForBom(projection, command, boardId);
  if (!target.ok) return target;
  const rows = target.entry.row.importRows || [];
  let nextRows;
  let resultCounts;
  let affectedRow;
  let affectedRowIndex = null;
  if (kind === "bom-row-add") {
    const sourceId = canonicalId(command.sourceNomenclatureId);
    if (!sourceId || sourceId.length > MAX_ID_LENGTH) {
      return resultError(400, "source-nomenclature-id-invalid", "A bounded sourceNomenclatureId is required");
    }
    const source = projection.nomenclatureById.get(sourceId);
    if (!source) return resultError(404, "source-nomenclature-not-found", "Source Nomenclature row is absent", { sourceId });
    const sourceExpected = exactExpected(
      command,
      "expectedSourceNomenclature",
      source.row,
      "source-nomenclature-conflict",
      "Source Nomenclature row",
    );
    if (!sourceExpected.ok) return sourceExpected;
    if (textKey(source.row.type) !== textKey(CATALOG_COMPONENT_TYPE_NAME)) {
      return resultError(422, "source-nomenclature-type-invalid", `Only «${CATALOG_COMPONENT_TYPE_NAME}» can be added to a Board BOM`, { sourceId });
    }
    const maxSequence = rows.reduce((max, row, index) => {
      const value = Number(getRowValues(row)[0] ?? index + 1);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
    affectedRow = {
      nomenclatureId: source.itemId,
      values: [
        maxSequence + 1,
        source.row.name || "",
        "",
        source.row.article || "",
        source.row.manufacturer || "",
        source.row.package || "",
        1,
        "Добавлено из номенклатуры",
        "",
      ],
    };
    affectedRowIndex = rows.length;
    nextRows = [...rows, affectedRow];
    resultCounts = { bomRowsAdded: 1 };
  } else {
    const rowIndex = normalizeRowIndex(command.rowIndex, rows.length);
    if (rowIndex === null) return resultError(409, "bom-row-not-found", "BOM row is absent at the expected index", { boardId, rowIndex: command.rowIndex });
    if (kind === "bom-row-update") {
      const columnIndex = typeof command.columnIndex === "number" && Number.isInteger(command.columnIndex)
        && command.columnIndex >= 0 && command.columnIndex < BOM_CELL_COUNT
        ? command.columnIndex
        : null;
      if (columnIndex === null) return resultError(400, "bom-column-invalid", "BOM columnIndex must address one A:I cell");
      const cell = normalizeCell(command.value);
      if (!cell.ok) return cell;
      affectedRow = replaceRowCell(rows[rowIndex], columnIndex, cell.value);
      affectedRowIndex = rowIndex;
      nextRows = rows.map((row, index) => index === rowIndex ? affectedRow : row);
      resultCounts = { bomRowsUpdated: 1 };
    } else {
      affectedRow = rows[rowIndex];
      nextRows = rows.filter((_row, index) => index !== rowIndex);
      resultCounts = { bomRowsDeleted: 1 };
    }
  }
  const proposedBoard = updateBoardBom(target.entry, nextRows, now);
  const componentSync = reconcileBomComponents(projection, proposedBoard, nextRows, command.componentSync, now);
  if (!componentSync.ok) return componentSync;
  const board = updateBoardBom(target.entry, componentSync.rows, now);
  const nextDirectory = {
    ...projection.directory,
    nomenclature: componentSync.nomenclature,
    bomLists: projection.directory.bomLists.map((row, index) => index === target.entry.index ? board : row),
  };
  const valid = finalize(nextDirectory);
  if (!valid.ok) return valid;
  return {
    ok: true,
    kind,
    boardId,
    row: board,
    bomRow: affectedRowIndex === null ? affectedRow : board.importRows[affectedRowIndex],
    rowCount: nextRows.length,
    directory: nextDirectory,
    componentSync: componentSync.plan,
    counts: counts({ boardRowsUpdated: 1, ...resultCounts, ...componentSync.counts }),
  };
}

function normalizeImportHeaders(headers) {
  if (!Array.isArray(headers) || headers.length !== BOM_CELL_COUNT) {
    return resultError(400, "bom-import-headers-invalid", "Parsed BOM import must provide exactly nine A:I headers");
  }
  const normalized = [];
  for (let index = 0; index < headers.length; index += 1) {
    if (typeof headers[index] !== "string") return resultError(400, "bom-import-header-invalid", "Every parsed BOM header must be a string", { index });
    const header = normalizeText(headers[index]);
    if (!header || header.length > MAX_HEADER_LENGTH) return resultError(400, "bom-import-header-invalid", "Every parsed BOM header must be bounded and non-empty", { index });
    normalized.push(header);
  }
  return { ok: true, headers: normalized };
}

function normalizeImportRows(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_IMPORT_ROWS) {
    return resultError(413, "bom-import-rows-invalid", "Parsed BOM rows must be a bounded array");
  }
  const normalized = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cloned = cloneJson(rows[rowIndex], `Parsed BOM row ${rowIndex}`);
    if (!cloned.ok) return cloned;
    const row = cloned.value;
    const valid = validateBomRow(row, `Parsed BOM row ${rowIndex}`);
    if (!valid.ok) return { ...valid, statusCode: valid.statusCode === 503 ? 400 : valid.statusCode };
    const values = getRowValues(row);
    normalized.push(Array.isArray(row) ? values : { ...row, values });
  }
  return { ok: true, rows: normalized };
}

function bomImportCommand(projection, command, boardId, now) {
  if (command.allowRebase !== false) {
    return resultError(400, "bom-import-rebase-forbidden", "BOM import must explicitly set allowRebase to false");
  }
  const baseline = fingerprintDirectoryBaseline(projection.directory);
  if (!baseline.ok) return baseline;
  if (typeof command.expectedDirectoryFingerprint !== "string" || !command.expectedDirectoryFingerprint) {
    return resultError(400, "directory-baseline-required", "BOM import requires an exact full Directory fingerprint");
  }
  if (command.expectedDirectoryFingerprint !== baseline.fingerprint) {
    return resultError(409, "directory-baseline-conflict", "Directory changed after the BOM import was prepared", {
      currentDirectoryFingerprint: baseline.fingerprint,
      rebaseAllowed: false,
    });
  }
  if (projection.boardById.has(boardId)) return resultError(409, "duplicate-board-id", "BOM import cannot overwrite an existing Board", { boardId });
  const headers = normalizeImportHeaders(command.headers);
  if (!headers.ok) return headers;
  const rows = normalizeImportRows(command.rows);
  if (!rows.ok) return rows;
  const normalized = normalizeBoardRow(command, boardId, null, "bom-import", now);
  if (!normalized.ok) return normalized;
  const nameConflict = duplicateBoardName(projection, boardId, normalized.row.name);
  if (nameConflict) return nameConflict;
  let board = {
    ...normalized.row,
    status: normalizeText(command.row.status) || "Активен",
    importHeaders: headers.headers,
    importRows: rows.rows,
    importedAt: now,
    updatedAt: now,
    ...componentCounts(rows.rows),
  };
  const componentSync = reconcileBomComponents(projection, board, rows.rows, command.componentSync, now);
  if (!componentSync.ok) return componentSync;
  board = { ...board, importRows: componentSync.rows, ...componentCounts(componentSync.rows) };
  const componentDirectory = {
    ...projection.directory,
    nomenclature: componentSync.nomenclature,
    bomLists: [...projection.directory.bomLists, board],
  };
  const componentProjection = inspectValidDirectory(componentDirectory);
  if (!componentProjection.ok) return componentProjection;
  const resultSync = syncResultNomenclature(componentProjection, board, command, now);
  if (!resultSync.ok) return resultSync;
  const nextDirectory = {
    ...componentDirectory,
    nomenclature: resultSync.nomenclature,
  };
  const valid = finalize(nextDirectory);
  if (!valid.ok) return valid;
  const exactResult = validateExactResultMapping(valid.projection, board, resultSync.row.id);
  if (!exactResult.ok) return exactResult;
  return {
    ok: true,
    kind: "bom-import",
    boardId,
    row: board,
    resultRow: resultSync.row,
    directory: nextDirectory,
    componentSync: componentSync.plan,
    rebased: false,
    rebaseAllowed: false,
    baseDirectoryFingerprint: baseline.fingerprint,
    counts: counts({
      boardRowsCreated: 1,
      bomRowsImported: rows.rows.length,
      resultRowsCreated: resultSync.created,
      resultRowsUpdated: resultSync.updated,
      ...componentSync.counts,
    }),
  };
}

export function applyBoardCommand(directory, command, options = {}) {
  const projection = inspectValidDirectory(directory);
  if (!projection.ok) return projection;
  const normalized = commandKind(command);
  if (!normalized.ok) return normalized;
  const now = typeof options.now === "string" ? options.now : "";
  let canonicalNow = "";
  try { canonicalNow = new Date(now).toISOString(); } catch { canonicalNow = ""; }
  if (!now || canonicalNow !== now) {
    return resultError(500, "command-time-required", "Reducer requires an explicit canonical UTC ISO command time");
  }
  const { kind, boardId } = normalized;
  if (["board-create", "board-update"].includes(kind)) {
    return boardMetadataCommand(projection, command, kind, boardId, now);
  }
  if (kind === "board-delete") return boardDeleteCommand(projection, command, boardId);
  if (["bom-row-add", "bom-row-update", "bom-row-delete"].includes(kind)) {
    return bomPointCommand(projection, command, kind, boardId, now);
  }
  return bomImportCommand(projection, command, boardId, now);
}
