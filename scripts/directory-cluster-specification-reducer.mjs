import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const REQUIRED_DIRECTORY_ARRAYS = Object.freeze([
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);
const REQUIRED_PLANNING_ARRAYS = Object.freeze(["routes", "routeSteps", "slots"]);
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 300;
const MAX_TEXT_LENGTH = 4_000;
const MAX_STRUCTURE_ROWS = 20_000;
const MAX_JSON_DEPTH = 80;
const MAX_JSON_NODES = 250_000;
const MAX_JSON_KEYS = 250_000;
const ROOT_STRUCTURE_ID = "root";
const PCB_TYPE_NAME = "Печатные платы";
const STRUCTURE_TYPES = new Set(["assembly", "bom", "specification", "part", "nomenclature"]);
const FULFILLMENT_MODES = new Set(["not_selected", "produce", "from_stock", "purchase", "external"]);

const COMMAND_KINDS = new Set([
  "specification-create",
  "specification-metadata-update",
  "specification-structure-row-add",
  "specification-structure-row-update",
  "specification-structure-row-reparent",
  "specification-structure-row-reorder",
  "specification-structure-row-delete",
  "specification-bom-bindings-normalize",
  "specification-route-binding-normalize",
  "specification-delete",
]);

export const DIRECTORY_CLUSTER_SPECIFICATION_REDUCER_CONTRACT = Object.freeze({
  requiredDirectoryArrays: REQUIRED_DIRECTORY_ARRAYS,
  requiredPlanningArrays: REQUIRED_PLANNING_ARRAYS,
  commands: Object.freeze({
    create: Object.freeze(["kind", "specificationId", "row", "expectedPlanningFingerprint", "outputBinding?"]),
    metadataUpdate: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "row", "expectedPlanningFingerprint", "outputBinding?",
    ]),
    structureRowAdd: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "row", "insertAt?", "expectedPlanningFingerprint",
      "operationBinding?|operationMapEffect?",
    ]),
    structureRowUpdate: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "itemId", "expectedStructureRow", "row",
      "expectedPlanningFingerprint", "operationBinding?|operationMapEffect?",
    ]),
    structureRowReparent: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "itemId", "expectedStructureRow", "parentId",
      "expectedParentRow?", "expectedPlanningFingerprint",
    ]),
    structureRowReorder: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "itemId", "expectedStructureRow", "toIndex",
      "expectedPlanningFingerprint",
    ]),
    structureRowDelete: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "itemId", "expectedStructureRow",
      "expectedPlanningFingerprint",
    ]),
    bomBindingsNormalize: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "expectedPlanningFingerprint",
    ]),
    routeBindingNormalize: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "expectedPlanningFingerprint",
    ]),
    delete: Object.freeze([
      "kind", "specificationId", "expectedSpecification", "expectedPlanningFingerprint", "impactFingerprint",
    ]),
  }),
  concurrency: Object.freeze({
    specification: "exact whole expectedSpecification",
    structureRow: "exact expectedStructureRow and exact expectedParentRow when applicable",
    outputBinding: "sha256 impact plus exact target/detach Nomenclature rows",
    planning: "exact full Planning fingerprint plus exact affected row baselines",
    operationMap: "exact full operationMap fingerprint plus exact operation row baseline",
    deleteImpact: "sha256 Directory + Planning impactFingerprint",
  }),
  externalEffects: Object.freeze({
    planning: "declarative exact-baseline plan; reducer never mutates Planning",
    operationMap: "declarative exact-baseline upsert/assertion; reducer never mutates operationMap",
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

function normalizeStructureParentId(value, { allowOmitted = true } = {}) {
  if (value === undefined || value === null || value === "") {
    return allowOmitted ? ROOT_STRUCTURE_ID : "";
  }
  if (typeof value !== "string") return "";
  const parentId = value.trim();
  if (!parentId || parentId !== value || parentId.length > MAX_ID_LENGTH) return "";
  return parentId;
}

export function normalizeSpecificationName(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
}

function textKey(value) {
  return normalizeSpecificationName(value).toLocaleLowerCase("ru-RU");
}

function jsonShape(value, subject, statusCode = 400) {
  try {
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
      if (nodes > MAX_JSON_NODES) return resultError(statusCode, "json-node-limit", `${subject} contains too many JSON values`);
      if (current.depth > MAX_JSON_DEPTH) return resultError(statusCode, "json-depth-limit", `${subject} is nested too deeply`);
      if (current.value === null || typeof current.value === "string" || typeof current.value === "boolean") continue;
      if (typeof current.value === "number") {
        if (!Number.isFinite(current.value)) return resultError(statusCode, "json-invalid", `${subject} contains a non-finite number`);
        continue;
      }
      if (typeof current.value !== "object") return resultError(statusCode, "json-invalid", `${subject} contains a non-JSON value`);
      if (active.has(current.value)) return resultError(statusCode, "json-invalid", `${subject} contains a cyclic reference`);
      active.add(current.value);
      stack.push({ value: current.value, depth: current.depth, exit: true });
      const entries = Array.isArray(current.value)
        ? current.value.map((entry) => [null, entry])
        : Object.entries(current.value);
      keys += Array.isArray(current.value) ? 0 : entries.length;
      if (keys > MAX_JSON_KEYS) return resultError(statusCode, "json-key-limit", `${subject} contains too many object keys`);
      if (entries.length > MAX_JSON_NODES - nodes) {
        return resultError(statusCode, "json-node-limit", `${subject} contains too many JSON values`);
      }
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        stack.push({ value: entries[index][1], depth: current.depth + 1, exit: false });
      }
    }
    return { ok: true, nodes, keys };
  } catch {
    return resultError(statusCode, "json-invalid", `${subject} cannot be inspected as JSON`);
  }
}

function cloneJson(value, subject, statusCode = 400) {
  const shape = jsonShape(value, subject, statusCode);
  if (!shape.ok) return shape;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") throw new TypeError("not serializable");
    const clone = JSON.parse(serialized);
    if (!isDeepStrictEqual(value, clone)) throw new TypeError("lossy JSON value");
    return { ok: true, value: clone };
  } catch {
    return resultError(statusCode, "json-invalid", `${subject} must be exactly JSON-compatible`);
  }
}

function fingerprintJson(value, subject, statusCode = 503) {
  const shape = jsonShape(value, subject, statusCode);
  if (!shape.ok) return shape;
  try {
    return {
      ok: true,
      fingerprint: `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`,
    };
  } catch {
    return resultError(statusCode, "json-invalid", `${subject} cannot be fingerprinted as exact JSON`);
  }
}

function exactExpected(command, field, current, conflictCode, label, { nullable = false } = {}) {
  if (!Object.hasOwn(command, field)) {
    return resultError(400, `${field}-required`, `An exact ${field} baseline is required for ${label}`);
  }
  if (nullable && current === null) {
    return command[field] === null
      ? { ok: true }
      : resultError(409, conflictCode, `${label} changed after it was read`);
  }
  if (nullable && command[field] === null) return resultError(409, conflictCode, `${label} changed after it was read`);
  if (!isRecord(command[field])) {
    return resultError(400, `${field}-required`, `An exact object ${field} baseline is required for ${label}`);
  }
  return isDeepStrictEqual(command[field], current)
    ? { ok: true }
    : resultError(409, conflictCode, `${label} changed after it was read`);
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
  if (directory.operationMap !== undefined && !Array.isArray(directory.operationMap)) {
    return resultError(503, "invalid-operation-map", "Directory.operationMap must be an array when present");
  }

  const typeById = new Map();
  const typeByName = new Map();
  for (let index = 0; index < directory.nomenclatureTypes.length; index += 1) {
    const row = directory.nomenclatureTypes[index];
    if (!isRecord(row)) return resultError(503, "invalid-type-row", "Every Nomenclature type must be an object", { index });
    const itemId = canonicalId(row.id);
    const name = normalizeSpecificationName(row.name);
    const nameKey = textKey(name);
    if (!itemId || itemId.length > MAX_ID_LENGTH || row.id !== itemId || typeById.has(itemId)) {
      return resultError(503, "invalid-type-id", "Nomenclature type ids must be canonical and unique", { index, itemId });
    }
    if (!name || name.length > MAX_NAME_LENGTH || typeByName.has(nameKey)) {
      return resultError(503, "invalid-type-name", "Nomenclature type names must be bounded and unique", { index, itemId });
    }
    const entry = { row, index, itemId, name, nameKey };
    typeById.set(itemId, entry);
    typeByName.set(nameKey, entry);
  }

  const nomenclatureById = new Map();
  for (let index = 0; index < directory.nomenclature.length; index += 1) {
    const row = directory.nomenclature[index];
    if (!isRecord(row)) return resultError(503, "invalid-nomenclature-row", "Every Nomenclature row must be an object", { index });
    const itemId = canonicalId(row.id);
    if (!itemId || itemId.length > MAX_ID_LENGTH || row.id !== itemId || nomenclatureById.has(itemId)) {
      return resultError(503, "invalid-nomenclature-id", "Nomenclature ids must be canonical and unique", { index, itemId });
    }
    if (row.sourceBomIds !== undefined && !Array.isArray(row.sourceBomIds)) {
      return resultError(503, "invalid-board-source-references", "Nomenclature.sourceBomIds must be an array when present", { index, itemId });
    }
    nomenclatureById.set(itemId, { row, index, itemId });
  }

  const boardById = new Map();
  for (let index = 0; index < directory.bomLists.length; index += 1) {
    const row = directory.bomLists[index];
    if (!isRecord(row)) return resultError(503, "invalid-board-row", "Every Board row must be an object", { index });
    const boardId = canonicalId(row.id);
    if (!boardId || boardId.length > MAX_ID_LENGTH || row.id !== boardId || boardById.has(boardId)) {
      return resultError(503, "invalid-board-id", "Board ids must be canonical and unique", { index, boardId });
    }
    if (row.importRows !== undefined && (!Array.isArray(row.importRows) || row.importRows.length > MAX_STRUCTURE_ROWS)) {
      return resultError(503, "invalid-bom-rows", "Board.importRows must be a bounded array", { index, boardId });
    }
    for (let rowIndex = 0; rowIndex < (row.importRows || []).length; rowIndex += 1) {
      const bomRow = row.importRows[rowIndex];
      if (!Array.isArray(bomRow) && !isRecord(bomRow)) {
        return resultError(503, "invalid-bom-row", "Every persisted BOM row must be an array or object", { boardId, rowIndex });
      }
    }
    boardById.set(boardId, { row, index, boardId });
  }

  const operationById = new Map();
  for (let index = 0; index < (directory.operationMap || []).length; index += 1) {
    const row = directory.operationMap[index];
    if (!isRecord(row)) return resultError(503, "invalid-operation-row", "Every operationMap row must be an object", { index });
    const operationId = canonicalId(row.id);
    if (!operationId || operationId.length > MAX_ID_LENGTH || row.id !== operationId || operationById.has(operationId)) {
      return resultError(503, "invalid-operation-id", "operationMap ids must be canonical and unique", { index, operationId });
    }
    operationById.set(operationId, { row, index, operationId });
  }

  const specificationById = new Map();
  const specificationByName = new Map();
  for (let index = 0; index < directory.specifications.length; index += 1) {
    const row = directory.specifications[index];
    if (!isRecord(row)) return resultError(503, "invalid-specification-row", "Every Specification row must be an object", { index });
    const specificationId = canonicalId(row.id);
    if (!specificationId || specificationId.length > MAX_ID_LENGTH || row.id !== specificationId || specificationById.has(specificationId)) {
      return resultError(503, "invalid-specification-id", "Specification ids must be canonical and unique", { index, specificationId });
    }
    if (row.structureItems !== undefined && (!Array.isArray(row.structureItems) || row.structureItems.length > MAX_STRUCTURE_ROWS)) {
      return resultError(503, "invalid-specification-structure", "Specification.structureItems must be a bounded array when present", {
        index,
        specificationId,
      });
    }
    const structureById = new Map();
    for (let structureIndex = 0; structureIndex < (row.structureItems || []).length; structureIndex += 1) {
      const structureRow = row.structureItems[structureIndex];
      if (!isRecord(structureRow)) {
        return resultError(503, "invalid-specification-structure-row", "Every Specification structure row must be an object", {
          specificationId,
          structureIndex,
        });
      }
      const itemId = canonicalId(structureRow.id);
      if (!itemId || itemId.length > MAX_ID_LENGTH || structureRow.id !== itemId || structureById.has(itemId)) {
        return resultError(503, "invalid-structure-item-id", "Structure item ids must be canonical and unique inside a Specification", {
          specificationId,
          structureIndex,
          itemId,
        });
      }
      structureById.set(itemId, { row: structureRow, index: structureIndex, itemId });
    }
    const entry = {
      row,
      index,
      specificationId,
      name: normalizeSpecificationName(row.name),
      structureById,
    };
    specificationById.set(specificationId, entry);
    const nameKey = textKey(entry.name);
    if (nameKey && !specificationByName.has(nameKey)) specificationByName.set(nameKey, entry);
  }

  return {
    ok: true,
    directory,
    typeById,
    typeByName,
    nomenclatureById,
    boardById,
    operationById,
    specificationById,
    specificationByName,
  };
}

function danglingReference(path, referenceType, itemId) {
  return { path, referenceType, itemId };
}

function validateStructureParents(specification) {
  const items = specification.row.structureItems || [];
  const byId = specification.structureById;
  const parentById = new Map();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const parentId = normalizeStructureParentId(item.parentId);
    if (!parentId || (parentId !== ROOT_STRUCTURE_ID && !byId.has(parentId)) || parentId === item.id) {
      return resultError(409, "invalid-structure-parent", "A Specification structure row has an absent or self parent", {
        specificationId: specification.specificationId,
        structureIndex: index,
        itemId: item.id,
        parentId,
      });
    }
    parentById.set(item.id, parentId);
  }

  const stateById = new Map();
  for (const item of items) {
    if (stateById.get(item.id) === 2) continue;
    const path = [];
    let cursor = item.id;
    while (cursor !== ROOT_STRUCTURE_ID) {
      const state = stateById.get(cursor) || 0;
      if (state === 2) break;
      if (state === 1) {
        return resultError(409, "structure-cycle", "Specification structure parent links contain a cycle", {
          specificationId: specification.specificationId,
          itemId: item.id,
          parentId: cursor,
        });
      }
      stateById.set(cursor, 1);
      path.push(cursor);
      cursor = parentById.get(cursor) || ROOT_STRUCTURE_ID;
    }
    for (const visitedId of path) stateById.set(visitedId, 2);
  }
  return { ok: true };
}

function validateSpecificationDependencyGraph(projection) {
  const dependencies = new Map();
  for (const specification of projection.specificationById.values()) {
    const linkedIds = [];
    for (const item of specification.structureById.values()) {
      const linkedId = canonicalId(item.row.specificationId);
      if (linkedId) linkedIds.push(linkedId);
    }
    dependencies.set(specification.specificationId, linkedIds);
  }

  const stateById = new Map();
  for (const specificationId of dependencies.keys()) {
    if (stateById.get(specificationId) === 2) continue;
    const stack = [{ specificationId, nextDependency: 0 }];
    stateById.set(specificationId, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const linkedIds = dependencies.get(frame.specificationId) || [];
      if (frame.nextDependency >= linkedIds.length) {
        stateById.set(frame.specificationId, 2);
        stack.pop();
        continue;
      }
      const linkedId = linkedIds[frame.nextDependency];
      frame.nextDependency += 1;
      const linkedState = stateById.get(linkedId) || 0;
      if (linkedState === 1) {
        return resultError(409, "specification-dependency-cycle", "Nested Specification links contain a cycle", {
          specificationId: frame.specificationId,
          linkedSpecificationId: linkedId,
        });
      }
      if (linkedState === 0) {
        stateById.set(linkedId, 1);
        stack.push({ specificationId: linkedId, nextDependency: 0 });
      }
    }
  }
  return { ok: true };
}

function validateDirectoryReferences(projection, { plannedOperationIds = new Set() } = {}) {
  const dangling = [];
  for (const entry of projection.nomenclatureById.values()) {
    const typeName = normalizeSpecificationName(entry.row.type);
    if (typeName && !projection.typeByName.has(textKey(typeName))) {
      dangling.push(danglingReference(`nomenclature[${entry.index}].type`, "nomenclatureType", typeName));
    }
    const resultBoardId = canonicalId(entry.row.sourceBomResultId);
    if (resultBoardId && !projection.boardById.has(resultBoardId)) {
      dangling.push(danglingReference(`nomenclature[${entry.index}].sourceBomResultId`, "bomList", resultBoardId));
    }
    for (let sourceIndex = 0; sourceIndex < (entry.row.sourceBomIds || []).length; sourceIndex += 1) {
      const raw = entry.row.sourceBomIds[sourceIndex];
      const boardId = canonicalId(raw);
      if (!boardId || raw !== boardId || !projection.boardById.has(boardId)) {
        dangling.push(danglingReference(`nomenclature[${entry.index}].sourceBomIds[${sourceIndex}]`, "bomList", boardId));
      }
    }
    const producedBy = canonicalId(entry.row.producedBySpecificationId);
    if (producedBy && !projection.specificationById.has(producedBy)) {
      dangling.push(danglingReference(`nomenclature[${entry.index}].producedBySpecificationId`, "specification", producedBy));
    }
  }
  for (const board of projection.boardById.values()) {
    for (let rowIndex = 0; rowIndex < (board.row.importRows || []).length; rowIndex += 1) {
      const row = board.row.importRows[rowIndex];
      const itemId = isRecord(row) ? canonicalId(row.nomenclatureId) : "";
      if (itemId && !projection.nomenclatureById.has(itemId)) {
        dangling.push(danglingReference(`bomLists[${board.index}].importRows[${rowIndex}].nomenclatureId`, "nomenclature", itemId));
      }
    }
  }
  for (const specification of projection.specificationById.values()) {
    const parents = validateStructureParents(specification);
    if (!parents.ok) return parents;
    const outputId = canonicalId(specification.row.outputNomenclatureId);
    if (outputId && !projection.nomenclatureById.has(outputId)) {
      dangling.push(danglingReference(`specifications[${specification.index}].outputNomenclatureId`, "nomenclature", outputId));
    }
    for (const field of ["bomListA", "bomListB"]) {
      const boardId = canonicalId(specification.row[field]);
      if (boardId && !projection.boardById.has(boardId)) {
        dangling.push(danglingReference(`specifications[${specification.index}].${field}`, "bomList", boardId));
      }
    }
    for (const item of specification.structureById.values()) {
      const base = `specifications[${specification.index}].structureItems[${item.index}]`;
      const nomenclatureType = normalizeSpecificationName(item.row.nomenclatureType);
      if (nomenclatureType && !projection.typeByName.has(textKey(nomenclatureType))) {
        dangling.push(danglingReference(`${base}.nomenclatureType`, "nomenclatureType", nomenclatureType));
      }
      const nomenclatureId = canonicalId(item.row.nomenclatureId);
      if (nomenclatureId && !projection.nomenclatureById.has(nomenclatureId)) {
        dangling.push(danglingReference(`${base}.nomenclatureId`, "nomenclature", nomenclatureId));
      }
      const boardId = canonicalId(item.row.bomListId);
      if (boardId && !projection.boardById.has(boardId)) {
        dangling.push(danglingReference(`${base}.bomListId`, "bomList", boardId));
      }
      const linkedSpecificationId = canonicalId(item.row.specificationId);
      if (linkedSpecificationId && (!projection.specificationById.has(linkedSpecificationId)
        || linkedSpecificationId === specification.specificationId)) {
        dangling.push(danglingReference(`${base}.specificationId`, "specification", linkedSpecificationId));
      }
      const operationId = canonicalId(item.row.operationId);
      if (operationId && !projection.operationById.has(operationId) && !plannedOperationIds.has(operationId)) {
        dangling.push(danglingReference(`${base}.operationId`, "operationMap", operationId));
      }
    }
  }
  if (dangling.length) {
    return resultError(409, "dangling-directory-reference", "Directory contains dangling cross-section references", {
      danglingReferences: dangling.slice(0, 100),
    });
  }
  return validateSpecificationDependencyGraph(projection);
}

function inspectValidDirectory(directory, options = {}) {
  const projection = inspectDirectory(directory);
  if (!projection.ok) return projection;
  const references = validateDirectoryReferences(projection, options);
  return references.ok ? projection : references;
}

function inspectPlanning(planning) {
  const shape = jsonShape(planning, "Planning projection", 503);
  if (!shape.ok) return shape;
  if (!isRecord(planning)) return resultError(503, "invalid-planning-projection", "A complete Planning projection is required");
  for (const section of REQUIRED_PLANNING_ARRAYS) {
    if (!Array.isArray(planning[section])) {
      return resultError(503, "invalid-planning-projection", `Planning.${section} must be an array`, { section });
    }
  }
  const maps = {};
  for (const section of REQUIRED_PLANNING_ARRAYS) {
    const byId = new Map();
    for (let index = 0; index < planning[section].length; index += 1) {
      const row = planning[section][index];
      if (!isRecord(row)) return resultError(503, "invalid-planning-row", `Every Planning.${section} row must be an object`, { section, index });
      const itemId = canonicalId(row.id);
      if (!itemId || itemId.length > MAX_ID_LENGTH || row.id !== itemId || byId.has(itemId)) {
        return resultError(503, "invalid-planning-id", `Planning.${section} ids must be canonical and unique`, { section, index, itemId });
      }
      byId.set(itemId, { row, index, itemId });
    }
    maps[section] = byId;
  }
  const fingerprint = fingerprintJson(planning, "Planning projection");
  if (!fingerprint.ok) return fingerprint;
  return { ok: true, planning, ...maps, fingerprint: fingerprint.fingerprint };
}

export function fingerprintSpecificationPlanningProjection(planning) {
  try {
    const projection = inspectPlanning(planning);
    return projection.ok ? { ok: true, fingerprint: projection.fingerprint } : projection;
  } catch {
    return resultError(503, "invalid-planning-projection", "Planning projection cannot be inspected safely");
  }
}

function inspectPlanningImpact(projection, specificationId) {
  const routes = [];
  const routeIds = new Set();
  for (const entry of projection.routes.values()) {
    if (entry.itemId === specificationId
      || canonicalId(entry.row.specificationId) === specificationId
      || canonicalId(entry.row.projectId) === specificationId) {
      routes.push({ index: entry.index, itemId: entry.itemId, row: entry.row });
      routeIds.add(entry.itemId);
    }
  }
  const routeSteps = [];
  const routeStepIds = new Set();
  for (const entry of projection.routeSteps.values()) {
    if (routeIds.has(canonicalId(entry.row.routeId))) {
      routeSteps.push({ index: entry.index, itemId: entry.itemId, row: entry.row });
      routeStepIds.add(entry.itemId);
    }
  }
  const slots = [];
  for (const entry of projection.slots.values()) {
    const row = entry.row;
    if (routeIds.has(canonicalId(row.routeId))
      || routeIds.has(canonicalId(row.planningOrderId))
      || routeIds.has(canonicalId(row.batchId))
      || routeStepIds.has(canonicalId(row.routeStepId))
      || canonicalId(row.specificationId) === specificationId
      || canonicalId(row.projectId) === specificationId) {
      slots.push({ index: entry.index, itemId: entry.itemId, row });
    }
  }
  const exact = { routes, routeSteps, slots };
  const fingerprint = fingerprintJson(exact, "Planning Specification impact");
  if (!fingerprint.ok) return fingerprint;
  return {
    ok: true,
    routes,
    routeSteps,
    slots,
    routeIds,
    routeStepIds,
    fingerprint: fingerprint.fingerprint,
  };
}

function planningForCommand(command, options, specificationId) {
  const projection = inspectPlanning(options?.planning);
  if (!projection.ok) return projection;
  if (typeof command.expectedPlanningFingerprint !== "string" || !command.expectedPlanningFingerprint) {
    return resultError(400, "expected-planning-fingerprint-required", "An exact full Planning fingerprint is required");
  }
  if (command.expectedPlanningFingerprint !== projection.fingerprint) {
    return resultError(409, "planning-baseline-conflict", "Planning changed after the Specification command was prepared", {
      specificationId,
      currentPlanningFingerprint: projection.fingerprint,
    });
  }
  const impact = inspectPlanningImpact(projection, specificationId);
  return impact.ok ? { ok: true, projection, impact } : impact;
}

function publicPlanningBaselines(impact) {
  return {
    routes: impact.routes.map(({ index, itemId, row }) => ({ index, itemId, expectedRow: row })),
    routeSteps: impact.routeSteps.map(({ index, itemId, row }) => ({ index, itemId, expectedRow: row })),
    slots: impact.slots.map(({ index, itemId, row }) => ({ index, itemId, expectedRow: row })),
  };
}

function noPlanningMutationEffect(planning, impact, kind, specificationId, details = {}) {
  return {
    kind,
    required: impact.routes.length + impact.routeSteps.length + impact.slots.length > 0,
    mode: "executor-required",
    specificationId,
    expectedProjectionFingerprint: planning.fingerprint,
    impactFingerprint: impact.fingerprint,
    baselines: publicPlanningBaselines(impact),
    ...details,
  };
}

function routePatchEffect(planning, impact, specification, now, kind = "planning-route-bindings-normalize") {
  const replaceRoutes = impact.routes.map(({ index, itemId, row }) => ({
    index,
    itemId,
    expectedRow: row,
    row: {
      ...row,
      specificationId: specification.id,
      specificationName: specification.name || "",
      projectId: specification.id,
      bomListId: "",
      updatedAt: now,
    },
  }));
  return {
    kind,
    required: replaceRoutes.some((entry) => !isDeepStrictEqual(entry.expectedRow, entry.row)),
    mode: "replace-exact-rows",
    specificationId: specification.id,
    expectedProjectionFingerprint: planning.fingerprint,
    impactFingerprint: impact.fingerprint,
    baselines: publicPlanningBaselines(impact),
    operations: { replaceRoutes },
  };
}

function operationMapFingerprint(directory) {
  return fingerprintJson(directory.operationMap || [], "Directory operationMap");
}

function normalizeCommand(command) {
  if (!isRecord(command)) return resultError(400, "invalid-command", "A Specification command object is required");
  const shape = jsonShape(command, "Specification command");
  if (!shape.ok) return shape;
  const kind = typeof command.kind === "string" ? command.kind.trim().toLowerCase() : "";
  if (!COMMAND_KINDS.has(kind)) return resultError(400, "invalid-command", "Unsupported Specification command kind", { kind });
  const specificationId = canonicalId(command.specificationId || command.row?.id);
  if (!specificationId || specificationId.length > MAX_ID_LENGTH) {
    return resultError(400, "specification-id-invalid", "A bounded Specification id is required");
  }
  return { ok: true, kind, specificationId };
}

function canonicalNow(options) {
  const now = typeof options?.now === "string" ? options.now : "";
  try {
    return now && new Date(now).toISOString() === now
      ? { ok: true, now }
      : resultError(500, "command-time-required", "Reducer requires an explicit canonical UTC ISO command time");
  } catch {
    return resultError(500, "command-time-required", "Reducer requires an explicit canonical UTC ISO command time");
  }
}

function exactSpecification(command, entry) {
  return exactExpected(command, "expectedSpecification", entry.row, "specification-row-conflict", "Specification");
}

function duplicateSpecificationName(projection, specificationId, name) {
  const existing = projection.specificationByName.get(textKey(name));
  return existing && existing.specificationId !== specificationId
    ? resultError(409, "duplicate-specification-name", "Another Specification already has this normalized name", {
      specificationId,
      conflictingSpecificationId: existing.specificationId,
      name,
    })
    : null;
}

function inspectOutputBindingFromProjection(projection, specificationId, targetNomenclatureId) {
  const target = targetNomenclatureId ? projection.nomenclatureById.get(targetNomenclatureId) || null : null;
  if (targetNomenclatureId && !target) {
    return resultError(409, "output-nomenclature-not-found", "Specification output Nomenclature row is absent", {
      specificationId,
      targetNomenclatureId,
    });
  }
  const targetOwner = canonicalId(target?.row?.producedBySpecificationId);
  if (targetOwner && targetOwner !== specificationId) {
    return resultError(409, "output-nomenclature-owned", "The selected output Nomenclature row belongs to another Specification", {
      specificationId,
      targetNomenclatureId,
      ownerSpecificationId: targetOwner,
    });
  }
  const detaches = [];
  for (const entry of projection.nomenclatureById.values()) {
    if (entry.itemId !== targetNomenclatureId && canonicalId(entry.row.producedBySpecificationId) === specificationId) {
      detaches.push(entry);
    }
  }
  const exact = {
    specificationId,
    target: target ? { index: target.index, itemId: target.itemId, row: target.row } : null,
    detaches: detaches.map((entry) => ({ index: entry.index, itemId: entry.itemId, row: entry.row })),
  };
  const fingerprint = fingerprintJson(exact, "Specification output binding impact");
  if (!fingerprint.ok) return fingerprint;
  return {
    ok: true,
    target,
    detaches,
    impact: {
      specificationId,
      targetNomenclatureId,
      fingerprint: fingerprint.fingerprint,
      counts: { targetRows: target ? 1 : 0, detachRows: detaches.length },
      target: target ? { index: target.index, itemId: target.itemId, expectedRow: target.row } : null,
      detaches: detaches.map((entry) => ({ index: entry.index, itemId: entry.itemId, expectedRow: entry.row })),
    },
  };
}

export function inspectSpecificationOutputBinding(directory, input = {}) {
  try {
    const projection = inspectValidDirectory(directory);
    if (!projection.ok) return projection;
    if (!isRecord(input)) return resultError(400, "output-binding-input-invalid", "Output binding input must be an object");
    const specificationId = canonicalId(input.specificationId);
    const targetNomenclatureId = canonicalId(input.targetNomenclatureId);
    if (!specificationId || specificationId.length > MAX_ID_LENGTH || targetNomenclatureId.length > MAX_ID_LENGTH) {
      return resultError(400, "output-binding-input-invalid", "Bounded Specification and output Nomenclature ids are required");
    }
    const inspected = inspectOutputBindingFromProjection(projection, specificationId, targetNomenclatureId);
    return inspected.ok ? { ok: true, ...inspected.impact } : inspected;
  } catch {
    return resultError(503, "invalid-directory-projection", "Output binding impact cannot be inspected safely");
  }
}

function outputBindingIsExact(projection, specificationId, targetNomenclatureId) {
  const inspected = inspectOutputBindingFromProjection(projection, specificationId, targetNomenclatureId);
  if (!inspected.ok) return inspected;
  const targetExact = targetNomenclatureId
    ? canonicalId(inspected.target?.row?.producedBySpecificationId) === specificationId
    : !inspected.target;
  return { ok: true, exact: targetExact && inspected.detaches.length === 0, inspected };
}

function applyOutputBinding(projection, specificationId, targetNomenclatureId, supplied, now) {
  const inspected = inspectOutputBindingFromProjection(projection, specificationId, targetNomenclatureId);
  if (!inspected.ok) return inspected;
  if (!isRecord(supplied)) return resultError(400, "output-binding-required", "An exact outputBinding plan is required");
  if (supplied.targetNomenclatureId !== targetNomenclatureId) {
    return resultError(409, "output-binding-target-conflict", "outputBinding does not identify the requested output Nomenclature row");
  }
  if (typeof supplied.impactFingerprint !== "string" || supplied.impactFingerprint !== inspected.impact.fingerprint) {
    return resultError(409, "output-binding-impact-changed", "Specification output binding changed after preparation", {
      currentImpact: inspected.impact,
    });
  }
  const expectedTarget = exactExpected(
    supplied,
    "expectedTargetRow",
    inspected.target?.row || null,
    "output-nomenclature-conflict",
    "Output Nomenclature row",
    { nullable: true },
  );
  if (!expectedTarget.ok) return expectedTarget;
  if (!Array.isArray(supplied.detaches) || supplied.detaches.length !== inspected.detaches.length) {
    return resultError(409, "output-binding-impact-changed", "Output detach rows changed after preparation", {
      currentImpact: inspected.impact,
    });
  }
  const suppliedDetaches = new Map();
  for (const detach of supplied.detaches) {
    const itemId = isRecord(detach) ? canonicalId(detach.itemId) : "";
    if (!itemId || suppliedDetaches.has(itemId)) return resultError(400, "output-binding-invalid", "Output detaches need unique canonical item ids");
    suppliedDetaches.set(itemId, detach);
  }
  for (const entry of inspected.detaches) {
    const suppliedDetach = suppliedDetaches.get(entry.itemId);
    if (!suppliedDetach) return resultError(409, "output-binding-impact-changed", "An output detach row is missing");
    const exact = exactExpected(suppliedDetach, "expectedRow", entry.row, "output-nomenclature-conflict", "Detached output Nomenclature row");
    if (!exact.ok) return exact;
  }
  const detachIds = new Set(inspected.detaches.map((entry) => entry.itemId));
  const nomenclature = projection.directory.nomenclature.map((row) => {
    if (row.id === targetNomenclatureId) return { ...row, producedBySpecificationId: specificationId, updatedAt: now };
    if (detachIds.has(row.id)) return { ...row, producedBySpecificationId: "", updatedAt: now };
    return row;
  });
  return { ok: true, nomenclature, impact: inspected.impact };
}

function normalizeMetadataRow(input, specificationId, current, now, { create = false } = {}) {
  if (!isRecord(input)) return resultError(400, "specification-row-required", "A Specification metadata row is required");
  const cloned = cloneJson(input, "Specification metadata row");
  if (!cloned.ok) return cloned;
  const rowInput = cloned.value;
  const rowId = rowInput.id === undefined ? specificationId : canonicalId(rowInput.id);
  if (rowId !== specificationId || (current && current.id !== specificationId)) {
    return resultError(400, "specification-id-mismatch", "Command specificationId and row.id must identify the same immutable Specification");
  }
  for (const field of ["projectId", "structureItems", "structureManaged", "bomListA", "bomQtyA", "bomListB", "bomQtyB"]) {
    if (Object.hasOwn(rowInput, field)) {
      return resultError(409, "specification-field-owned-separately", `Use the structure/BOM command owner to change ${field}`);
    }
  }
  const name = normalizeSpecificationName(rowInput.name === undefined ? current?.name : rowInput.name);
  if (!name) return resultError(400, "specification-name-required", "Specification name is required");
  if (name.length > MAX_NAME_LENGTH) return resultError(413, "specification-name-too-long", "Specification name exceeds the supported length");
  if (rowInput.outputNomenclatureId !== undefined && typeof rowInput.outputNomenclatureId !== "string") {
    return resultError(400, "output-nomenclature-id-invalid", "Output Nomenclature id must be a string");
  }
  const outputNomenclatureId = canonicalId(
    rowInput.outputNomenclatureId === undefined ? current?.outputNomenclatureId : rowInput.outputNomenclatureId,
  );
  if (outputNomenclatureId.length > MAX_ID_LENGTH) return resultError(400, "output-nomenclature-id-invalid", "Output Nomenclature id is too long");
  for (const field of ["outputItem", "revision", "orderNumber", "customer", "extraItems", "lifecycleStatus", "dueDate"]) {
    const value = rowInput[field] === undefined ? current?.[field] : rowInput[field];
    if (value !== undefined && (typeof value !== "string" || value.length > MAX_TEXT_LENGTH)) {
      return resultError(413, "specification-metadata-invalid", `Specification.${field} must be a bounded string`);
    }
  }
  if (rowInput.productionQuantity !== undefined) {
    const quantity = Number(rowInput.productionQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return resultError(400, "production-quantity-invalid", "Specification productionQuantity must be a finite non-negative number");
    }
  }
  const row = {
    ...(current || {}),
    ...rowInput,
    id: specificationId,
    name,
    outputNomenclatureId,
    updatedAt: now,
  };
  if (create) {
    Object.assign(row, {
      projectId: "",
      structureManaged: true,
      structureItems: [],
      bomListA: "",
      bomQtyA: 0,
      bomListB: "",
      bomQtyB: 0,
      createdAt: rowInput.createdAt || now,
    });
  }
  return { ok: true, row };
}

function normalizePositiveInteger(value, fallback, { allowZero = false } = {}) {
  const number = Number(value);
  const minimum = allowZero ? 0 : 1;
  return Number.isFinite(number) && number >= minimum ? Math.round(number) : fallback;
}

function operationEffectForRow(projection, command, row, currentRow) {
  const nextOperationId = canonicalId(row.operationId);
  const previousOperationId = canonicalId(currentRow?.operationId);
  if (!nextOperationId || nextOperationId === previousOperationId) return { ok: true, plannedOperationIds: new Set(), effect: null };
  const currentOperation = projection.operationById.get(nextOperationId) || null;
  const mapFingerprint = operationMapFingerprint(projection.directory);
  if (!mapFingerprint.ok) return mapFingerprint;
  if (currentOperation) {
    if (!isRecord(command.operationBinding) || command.operationBinding.operationId !== nextOperationId) {
      return resultError(400, "operation-binding-required", "An exact operationBinding baseline is required for a changed structure operation");
    }
    if (command.operationBinding.expectedOperationMapFingerprint !== mapFingerprint.fingerprint) {
      return resultError(409, "operation-map-baseline-conflict", "operationMap changed after the operation binding was prepared", {
        currentOperationMapFingerprint: mapFingerprint.fingerprint,
      });
    }
    const exact = exactExpected(
      command.operationBinding,
      "expectedRow",
      currentOperation.row,
      "operation-row-conflict",
      "operationMap row",
    );
    if (!exact.ok) return exact;
    return {
      ok: true,
      plannedOperationIds: new Set(),
      effect: {
        kind: "operation-map-binding-assertion",
        required: false,
        mode: "assert-exact-row",
        expectedProjectionFingerprint: mapFingerprint.fingerprint,
        operationId: nextOperationId,
        expectedRow: currentOperation.row,
      },
    };
  }
  const missingPlan = {
    kind: "operation-map-upsert-required",
    required: true,
    mode: "upsert-exact-row",
    expectedProjectionFingerprint: mapFingerprint.fingerprint,
    operationId: nextOperationId,
    expectedRow: null,
  };
  if (!isRecord(command.operationMapEffect)) {
    return resultError(409, "operation-map-transaction-required", "The selected operation is absent and must be created atomically by the operationMap owner", {
      externalEffects: { operationMap: missingPlan },
    });
  }
  const supplied = command.operationMapEffect;
  if (supplied.expectedOperationMapFingerprint !== mapFingerprint.fingerprint) {
    return resultError(409, "operation-map-baseline-conflict", "operationMap changed after the cross-owner command was prepared", {
      currentOperationMapFingerprint: mapFingerprint.fingerprint,
    });
  }
  if (supplied.operationId !== nextOperationId || supplied.expectedRow !== null || !isRecord(supplied.row)) {
    return resultError(400, "operation-map-effect-invalid", "operationMapEffect must describe an exact absent-row upsert for the selected operation");
  }
  const cloned = cloneJson(supplied.row, "Planned operationMap row");
  if (!cloned.ok) return cloned;
  if (canonicalId(cloned.value.id) !== nextOperationId || cloned.value.id !== nextOperationId) {
    return resultError(400, "operation-map-effect-invalid", "Planned operationMap row id must equal the structure operationId");
  }
  const operationName = normalizeSpecificationName(cloned.value.name);
  if (!operationName || operationName.length > MAX_NAME_LENGTH) {
    return resultError(400, "operation-map-effect-invalid", "Planned operationMap row needs a bounded name");
  }
  return {
    ok: true,
    plannedOperationIds: new Set([nextOperationId]),
    effect: {
      ...missingPlan,
      row: { ...cloned.value, id: nextOperationId, name: operationName },
    },
  };
}

function normalizeStructureRow(input, specificationId, projection, { current = null, index = 0 } = {}) {
  if (!isRecord(input)) return resultError(400, "structure-row-required", "A Specification structure row is required");
  const cloned = cloneJson(input, "Specification structure row");
  if (!cloned.ok) return cloned;
  const source = { ...(current || {}), ...cloned.value };
  const itemId = canonicalId(source.id);
  if (!itemId || itemId.length > MAX_ID_LENGTH || source.id !== itemId || (current && current.id !== itemId)) {
    return resultError(400, "structure-item-id-invalid", "A canonical bounded immutable structure item id is required");
  }
  const type = STRUCTURE_TYPES.has(source.type) ? source.type : source.bomListId ? "bom" : "part";
  let bomListId = canonicalId(source.bomListId);
  let linkedSpecificationId = canonicalId(source.specificationId);
  let nomenclatureId = canonicalId(source.nomenclatureId);
  if ([bomListId, linkedSpecificationId, nomenclatureId].some((id) => id.length > MAX_ID_LENGTH)) {
    return resultError(400, "structure-reference-invalid", "Structure references must be bounded ids");
  }
  if (type === "bom") {
    linkedSpecificationId = "";
    nomenclatureId = "";
  } else if (type === "specification") {
    bomListId = "";
    nomenclatureId = "";
  } else if (type === "nomenclature") {
    bomListId = "";
    linkedSpecificationId = "";
  } else {
    bomListId = "";
    linkedSpecificationId = "";
    nomenclatureId = "";
  }
  if (linkedSpecificationId === specificationId) {
    return resultError(409, "self-specification-reference", "A Specification cannot contain itself as a structure row");
  }
  const board = bomListId ? projection.boardById.get(bomListId)?.row || null : null;
  const linkedSpecification = linkedSpecificationId ? projection.specificationById.get(linkedSpecificationId)?.row || null : null;
  const nomenclature = nomenclatureId ? projection.nomenclatureById.get(nomenclatureId)?.row || null : null;
  if (bomListId && !board) return resultError(409, "structure-bom-not-found", "Selected Board is absent", { bomListId });
  if (linkedSpecificationId && !linkedSpecification) {
    return resultError(409, "structure-specification-not-found", "Selected nested Specification is absent", { linkedSpecificationId });
  }
  if (nomenclatureId && !nomenclature) {
    return resultError(409, "structure-nomenclature-not-found", "Selected Nomenclature row is absent", { nomenclatureId });
  }
  const parentId = normalizeStructureParentId(source.parentId);
  if (!parentId) {
    return resultError(400, "structure-parent-invalid", "Structure parentId must be a canonical bounded string or the root id");
  }
  const quantity = normalizePositiveInteger(source.quantity ?? source.qty ?? 1, 1, { allowZero: true });
  const fulfillmentMode = FULFILLMENT_MODES.has(source.fulfillmentMode)
    ? source.fulfillmentMode
    : source.executionType === "buy" ? "purchase" : "produce";
  const schedulable = ["produce", "from_stock"].includes(fulfillmentMode);
  const executionType = ["purchase", "external"].includes(fulfillmentMode) ? "buy" : "make";
  let operationId = schedulable ? canonicalId(source.operationId) : "";
  if (operationId.length > MAX_ID_LENGTH) return resultError(400, "operation-id-invalid", "Structure operationId is too long");
  let nomenclatureType = normalizeSpecificationName(source.nomenclatureType);
  if (nomenclature?.type) nomenclatureType = normalizeSpecificationName(nomenclature.type);
  if (board && projection.typeByName.has(textKey(PCB_TYPE_NAME))) nomenclatureType = PCB_TYPE_NAME;
  if (nomenclatureType.length > MAX_NAME_LENGTH) return resultError(413, "nomenclature-type-too-long", "Structure nomenclatureType is too long");
  const derivedName = board?.name || linkedSpecification?.name || nomenclature?.name;
  const derivedResult = board ? board.resultItem || board.boardCode : linkedSpecification?.outputItem || nomenclature?.name;
  const name = normalizeSpecificationName(derivedName || source.name || "");
  const resultItem = normalizeSpecificationName(derivedResult || source.resultItem || "");
  const unit = normalizeSpecificationName(
    board ? "плата" : linkedSpecification ? "состав" : nomenclature?.unit || source.unit || "шт.",
  );
  for (const [field, value] of [["name", name], ["resultItem", resultItem], ["unit", unit], ["note", source.note || ""]]) {
    if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) {
      return resultError(413, "structure-text-too-long", `Structure ${field} exceeds the supported length`);
    }
  }
  const operation = projection.operationById.get(operationId)?.row || null;
  return {
    ok: true,
    row: {
      ...source,
      id: itemId,
      parentId,
      type,
      executionType,
      fulfillmentMode,
      operationId,
      operationName: operation?.name || (schedulable ? normalizeSpecificationName(source.operationName) : ""),
      departmentName: schedulable ? normalizeSpecificationName(source.departmentName) : "",
      bomListId,
      specificationId: linkedSpecificationId,
      nomenclatureId,
      nomenclatureType,
      name,
      quantity,
      unit,
      boardsPerPanel: type === "bom" ? normalizePositiveInteger(source.boardsPerPanel, 1) : 1,
      resultItem,
      note: typeof source.note === "string" ? source.note.trim() : "",
      position: index + 1,
    },
  };
}

function structureBoardBinding(projection, item) {
  const type = typeof item.type === "string" ? item.type : "";
  const direct = type === "bom" ? canonicalId(item.bomListId) : "";
  if (direct) return direct;
  if (type !== "nomenclature") return "";
  const nomenclatureId = canonicalId(item.nomenclatureId);
  if (!nomenclatureId) return "";
  const nomenclature = projection.nomenclatureById.get(nomenclatureId)?.row;
  if (!nomenclature) return "";
  const result = canonicalId(nomenclature.sourceBomResultId);
  if (result) return result;
  if (textKey(nomenclature.type) !== textKey(PCB_TYPE_NAME)) return "";
  return canonicalId((nomenclature.sourceBomIds || [])[0]);
}

function normalizeBomBindings(specification, projection) {
  const bindings = [];
  for (const item of specification.structureItems || []) {
    const boardId = structureBoardBinding(projection, item);
    if (!boardId) continue;
    bindings.push({ boardId, quantity: Number(item.quantity || 0) });
  }
  return {
    ...specification,
    bomListA: bindings[0]?.boardId || "",
    bomQtyA: bindings[0] ? Math.max(0, Number(bindings[0].quantity || 0)) : 0,
    bomListB: bindings[1]?.boardId || "",
    bomQtyB: bindings[1] ? Math.max(0, Number(bindings[1].quantity || 0)) : 0,
  };
}

function withCanonicalPositions(items) {
  return items.map((row, index) => row.position === index + 1 ? row : { ...row, position: index + 1 });
}

function replaceSpecification(directory, entry, row) {
  return {
    ...directory,
    specifications: directory.specifications.map((item, index) => index === entry.index ? row : item),
  };
}

function structureCounts(overrides = {}) {
  return {
    specificationRowsCreated: 0,
    specificationRowsUpdated: 0,
    specificationRowsDeleted: 0,
    structureRowsAdded: 0,
    structureRowsUpdated: 0,
    structureRowsReparented: 0,
    structureRowsReordered: 0,
    structureRowsDeleted: 0,
    nestedStructureReferencesDeleted: 0,
    nomenclatureOutputRowsLinked: 0,
    nomenclatureOutputRowsDetached: 0,
    bomBindingFieldsChanged: 0,
    ...overrides,
  };
}

function countBomBindingChanges(before, after) {
  return ["bomListA", "bomQtyA", "bomListB", "bomQtyB"]
    .filter((field) => !isDeepStrictEqual(before?.[field], after?.[field])).length;
}

function finalizeDirectory(directory, options = {}) {
  const projection = inspectValidDirectory(directory, options);
  return projection.ok ? { ok: true, projection } : projection;
}

function createCommand(projection, command, specificationId, planning, now) {
  if (projection.specificationById.has(specificationId)) {
    return resultError(409, "duplicate-specification-id", "A Specification with this id already exists", { specificationId });
  }
  if (planning.impact.routes.length || planning.impact.routeSteps.length || planning.impact.slots.length) {
    return resultError(409, "planning-id-preclaimed", "Planning already contains rows bound to the new Specification id", {
      specificationId,
      planningImpact: publicPlanningBaselines(planning.impact),
    });
  }
  const normalized = normalizeMetadataRow(command.row, specificationId, null, now, { create: true });
  if (!normalized.ok) return normalized;
  const nameConflict = duplicateSpecificationName(projection, specificationId, normalized.row.name);
  if (nameConflict) return nameConflict;
  let nomenclature = projection.directory.nomenclature;
  let outputImpact = null;
  if (normalized.row.outputNomenclatureId) {
    const binding = applyOutputBinding(
      projection,
      specificationId,
      normalized.row.outputNomenclatureId,
      command.outputBinding,
      now,
    );
    if (!binding.ok) return binding;
    nomenclature = binding.nomenclature;
    outputImpact = binding.impact;
    const output = nomenclature.find((row) => row.id === normalized.row.outputNomenclatureId);
    normalized.row.outputItem = output?.name || normalized.row.outputItem || normalized.row.name;
  }
  const nextDirectory = {
    ...projection.directory,
    nomenclature,
    specifications: [...projection.directory.specifications, normalized.row],
  };
  const valid = finalizeDirectory(nextDirectory);
  if (!valid.ok) return valid;
  return {
    ok: true,
    kind: "specification-create",
    specificationId,
    row: normalized.row,
    directory: nextDirectory,
    externalEffects: {
      planning: noPlanningMutationEffect(planning.projection, planning.impact, "planning-specification-create-assertion", specificationId),
      operationMap: null,
    },
    requiresAtomicCommit: false,
    counts: structureCounts({
      specificationRowsCreated: 1,
      nomenclatureOutputRowsLinked: outputImpact?.counts.targetRows || 0,
      nomenclatureOutputRowsDetached: outputImpact?.counts.detachRows || 0,
    }),
  };
}

function metadataCommand(projection, command, entry, planning, now) {
  const expected = exactSpecification(command, entry);
  if (!expected.ok) return expected;
  const normalized = normalizeMetadataRow(command.row, entry.specificationId, entry.row, now);
  if (!normalized.ok) return normalized;
  const nameConflict = duplicateSpecificationName(projection, entry.specificationId, normalized.row.name);
  if (nameConflict) return nameConflict;
  const exactBinding = outputBindingIsExact(projection, entry.specificationId, normalized.row.outputNomenclatureId);
  if (!exactBinding.ok) return exactBinding;
  let nomenclature = projection.directory.nomenclature;
  let outputImpact = null;
  if (!exactBinding.exact || Object.hasOwn(command, "outputBinding")) {
    const binding = applyOutputBinding(
      projection,
      entry.specificationId,
      normalized.row.outputNomenclatureId,
      command.outputBinding,
      now,
    );
    if (!binding.ok) return binding;
    nomenclature = binding.nomenclature;
    outputImpact = binding.impact;
  }
  if (normalized.row.outputNomenclatureId) {
    const output = nomenclature.find((row) => row.id === normalized.row.outputNomenclatureId);
    normalized.row.outputItem = output?.name || normalized.row.outputItem || normalized.row.name;
  }
  const nextDirectory = {
    ...replaceSpecification(projection.directory, entry, normalized.row),
    nomenclature,
  };
  const valid = finalizeDirectory(nextDirectory);
  if (!valid.ok) return valid;
  const planningEffect = routePatchEffect(
    planning.projection,
    planning.impact,
    normalized.row,
    now,
    "planning-specification-metadata-reconcile",
  );
  return {
    ok: true,
    kind: "specification-metadata-update",
    specificationId: entry.specificationId,
    row: normalized.row,
    directory: nextDirectory,
    externalEffects: { planning: planningEffect, operationMap: null },
    requiresAtomicCommit: planningEffect.required,
    counts: structureCounts({
      specificationRowsUpdated: 1,
      nomenclatureOutputRowsLinked: outputImpact?.counts.targetRows || 0,
      nomenclatureOutputRowsDetached: outputImpact?.counts.detachRows || 0,
    }),
  };
}

function exactStructureRow(command, entry, itemId) {
  const target = entry.structureById.get(itemId);
  if (!target) return resultError(404, "structure-row-not-found", "Specification structure row is absent", { itemId });
  const exact = exactExpected(command, "expectedStructureRow", target.row, "structure-row-conflict", "Specification structure row");
  return exact.ok ? { ok: true, target } : exact;
}

function structureCommand(projection, command, kind, entry, planning, now) {
  const expected = exactSpecification(command, entry);
  if (!expected.ok) return expected;
  const originalItems = entry.row.structureItems || [];
  let nextItems;
  let affectedRow = null;
  let operationEffect = null;
  let plannedOperationIds = new Set();
  const countChanges = {};

  if (kind === "specification-structure-row-add") {
    const rawId = canonicalId(command.row?.id);
    if (entry.structureById.has(rawId)) return resultError(409, "duplicate-structure-item-id", "A structure row with this id already exists", { itemId: rawId });
    const insertAt = command.insertAt === undefined ? originalItems.length : command.insertAt;
    if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > originalItems.length) {
      return resultError(400, "structure-insert-index-invalid", "insertAt must address a position in the current structure array");
    }
    const normalized = normalizeStructureRow(command.row, entry.specificationId, projection, { index: insertAt });
    if (!normalized.ok) return normalized;
    const operation = operationEffectForRow(projection, command, normalized.row, null);
    if (!operation.ok) return operation;
    operationEffect = operation.effect;
    plannedOperationIds = operation.plannedOperationIds;
    if (operationEffect?.row) normalized.row.operationName = operationEffect.row.name;
    affectedRow = normalized.row;
    nextItems = [...originalItems.slice(0, insertAt), normalized.row, ...originalItems.slice(insertAt)];
    countChanges.structureRowsAdded = 1;
  } else {
    const itemId = canonicalId(command.itemId);
    if (!itemId || itemId.length > MAX_ID_LENGTH) return resultError(400, "structure-item-id-invalid", "A bounded structure item id is required");
    const exactRow = exactStructureRow(command, entry, itemId);
    if (!exactRow.ok) return exactRow;
    const target = exactRow.target;
    if (kind === "specification-structure-row-update") {
      if (!isRecord(command.row)) return resultError(400, "structure-row-required", "A partial structure row is required");
      if (Object.hasOwn(command.row, "parentId") && command.row.parentId !== target.row.parentId) {
        return resultError(409, "structure-parent-owned-separately", "Use the reparent command to change parentId");
      }
      if (Object.hasOwn(command.row, "position") && command.row.position !== target.row.position) {
        return resultError(409, "structure-order-owned-separately", "Use the reorder command to change position");
      }
      const normalized = normalizeStructureRow(command.row, entry.specificationId, projection, {
        current: target.row,
        index: target.index,
      });
      if (!normalized.ok) return normalized;
      const operation = operationEffectForRow(projection, command, normalized.row, target.row);
      if (!operation.ok) return operation;
      operationEffect = operation.effect;
      plannedOperationIds = operation.plannedOperationIds;
      if (operationEffect?.row) normalized.row.operationName = operationEffect.row.name;
      affectedRow = normalized.row;
      nextItems = originalItems.map((row, index) => index === target.index ? normalized.row : row);
      countChanges.structureRowsUpdated = 1;
    } else if (kind === "specification-structure-row-reparent") {
      const parentId = normalizeStructureParentId(command.parentId, { allowOmitted: false });
      if (!parentId) {
        return resultError(400, "structure-parent-invalid", "Reparent requires a canonical bounded parentId string");
      }
      if (parentId === itemId) return resultError(409, "structure-cycle", "A structure row cannot be its own parent");
      if (parentId !== ROOT_STRUCTURE_ID) {
        const parent = entry.structureById.get(parentId);
        if (!parent) return resultError(404, "structure-parent-not-found", "Target structure parent is absent", { parentId });
        const exactParent = exactExpected(command, "expectedParentRow", parent.row, "structure-parent-conflict", "Target structure parent");
        if (!exactParent.ok) return exactParent;
        const childrenByParent = new Map();
        for (const row of originalItems) {
          const rowParentId = normalizeStructureParentId(row.parentId);
          if (!childrenByParent.has(rowParentId)) childrenByParent.set(rowParentId, []);
          childrenByParent.get(rowParentId).push(row.id);
        }
        const descendants = new Set();
        const pending = [...(childrenByParent.get(itemId) || [])];
        while (pending.length) {
          const descendantId = pending.pop();
          if (descendants.has(descendantId)) continue;
          descendants.add(descendantId);
          pending.push(...(childrenByParent.get(descendantId) || []));
        }
        if (descendants.has(parentId)) return resultError(409, "structure-cycle", "A structure row cannot be moved under its descendant");
      }
      affectedRow = { ...target.row, parentId };
      nextItems = originalItems.map((row, index) => index === target.index ? affectedRow : row);
      countChanges.structureRowsReparented = 1;
    } else if (kind === "specification-structure-row-reorder") {
      if (!Number.isInteger(command.toIndex) || command.toIndex < 0 || command.toIndex >= originalItems.length) {
        return resultError(400, "structure-reorder-index-invalid", "toIndex must address the current structure array");
      }
      nextItems = [...originalItems];
      const [moved] = nextItems.splice(target.index, 1);
      nextItems.splice(command.toIndex, 0, moved);
      affectedRow = moved;
      countChanges.structureRowsReordered = target.index === command.toIndex ? 0 : 1;
    } else {
      affectedRow = target.row;
      nextItems = originalItems
        .filter((_row, index) => index !== target.index)
        .map((row) => canonicalId(row.parentId || ROOT_STRUCTURE_ID) === itemId ? { ...row, parentId: ROOT_STRUCTURE_ID } : row);
      countChanges.structureRowsDeleted = 1;
    }
  }

  nextItems = withCanonicalPositions(nextItems);
  let nextSpecification = {
    ...entry.row,
    structureManaged: true,
    structureItems: nextItems,
    updatedAt: now,
  };
  nextSpecification = normalizeBomBindings(nextSpecification, projection);
  const nextDirectory = replaceSpecification(projection.directory, entry, nextSpecification);
  const valid = finalizeDirectory(nextDirectory, { plannedOperationIds });
  if (!valid.ok) return valid;
  const planningEffect = noPlanningMutationEffect(
    planning.projection,
    planning.impact,
    "planning-specification-structure-reconcile",
    entry.specificationId,
    {
      trigger: kind,
      desiredSpecification: nextSpecification,
    },
  );
  return {
    ok: true,
    kind,
    specificationId: entry.specificationId,
    itemId: affectedRow?.id || "",
    row: nextSpecification,
    structureRow: affectedRow,
    directory: nextDirectory,
    externalEffects: { planning: planningEffect, operationMap: operationEffect },
    requiresAtomicCommit: planningEffect.required || Boolean(operationEffect?.required),
    counts: structureCounts({
      specificationRowsUpdated: 1,
      bomBindingFieldsChanged: countBomBindingChanges(entry.row, nextSpecification),
      ...countChanges,
    }),
  };
}

function bomNormalizeCommand(projection, command, entry, planning, now) {
  const expected = exactSpecification(command, entry);
  if (!expected.ok) return expected;
  const candidate = normalizeBomBindings(entry.row, projection);
  const changedFields = countBomBindingChanges(entry.row, candidate);
  const normalized = changedFields ? { ...candidate, updatedAt: now } : entry.row;
  const nextDirectory = replaceSpecification(projection.directory, entry, normalized);
  const valid = finalizeDirectory(nextDirectory);
  if (!valid.ok) return valid;
  const planningEffect = noPlanningMutationEffect(
    planning.projection,
    planning.impact,
    "planning-specification-bom-bindings-reconcile",
    entry.specificationId,
    { desiredSpecification: normalized },
  );
  return {
    ok: true,
    kind: "specification-bom-bindings-normalize",
    specificationId: entry.specificationId,
    row: normalized,
    directory: nextDirectory,
    externalEffects: { planning: planningEffect, operationMap: null },
    requiresAtomicCommit: planningEffect.required && changedFields > 0,
    counts: structureCounts({ specificationRowsUpdated: changedFields ? 1 : 0, bomBindingFieldsChanged: changedFields }),
  };
}

function routeBindingCommand(projection, command, entry, planning, now) {
  const expected = exactSpecification(command, entry);
  if (!expected.ok) return expected;
  const row = entry.row.projectId
    ? { ...entry.row, projectId: "", updatedAt: now }
    : entry.row;
  const nextDirectory = row === entry.row ? projection.directory : replaceSpecification(projection.directory, entry, row);
  const valid = finalizeDirectory(nextDirectory);
  if (!valid.ok) return valid;
  const planningEffect = routePatchEffect(planning.projection, planning.impact, row, now);
  return {
    ok: true,
    kind: "specification-route-binding-normalize",
    specificationId: entry.specificationId,
    row,
    directory: nextDirectory,
    externalEffects: { planning: planningEffect, operationMap: null },
    requiresAtomicCommit: planningEffect.required,
    counts: structureCounts({ specificationRowsUpdated: row === entry.row ? 0 : 1 }),
  };
}

function inspectDeleteFromProjections(directoryProjection, planningProjection, specificationId) {
  const entry = directoryProjection.specificationById.get(specificationId);
  if (!entry) return resultError(404, "specification-not-found", "Specification is absent", { specificationId });
  const nestedReferences = [];
  for (const specification of directoryProjection.specificationById.values()) {
    if (specification.specificationId === specificationId) continue;
    for (const item of specification.structureById.values()) {
      if (canonicalId(item.row.specificationId) === specificationId) {
        nestedReferences.push({
          specificationIndex: specification.index,
          specificationId: specification.specificationId,
          specificationRow: specification.row,
          structureIndex: item.index,
          itemId: item.itemId,
          row: item.row,
        });
      }
    }
  }
  const outputReferences = [];
  for (const nomenclature of directoryProjection.nomenclatureById.values()) {
    if (canonicalId(nomenclature.row.producedBySpecificationId) === specificationId) {
      outputReferences.push({ index: nomenclature.index, itemId: nomenclature.itemId, row: nomenclature.row });
    }
  }
  const planningImpact = inspectPlanningImpact(planningProjection, specificationId);
  if (!planningImpact.ok) return planningImpact;
  const exact = {
    target: { index: entry.index, row: entry.row },
    nestedSpecifications: [...new Map(nestedReferences.map((reference) => [
      reference.specificationId,
      { index: reference.specificationIndex, row: reference.specificationRow },
    ])).values()],
    outputNomenclature: outputReferences.map(({ index, row }) => ({ index, row })),
    planning: {
      fingerprint: planningProjection.fingerprint,
      routes: planningImpact.routes.map(({ index, row }) => ({ index, row })),
      routeSteps: planningImpact.routeSteps.map(({ index, row }) => ({ index, row })),
      slots: planningImpact.slots.map(({ index, row }) => ({ index, row })),
    },
  };
  const fingerprint = fingerprintJson(exact, "Specification delete impact");
  if (!fingerprint.ok) return fingerprint;
  return {
    ok: true,
    entry,
    nestedReferences,
    outputReferences,
    planningImpact,
    impact: {
      specificationId,
      specificationName: entry.name,
      fingerprint: fingerprint.fingerprint,
      planningFingerprint: planningProjection.fingerprint,
      counts: {
        structureRows: (entry.row.structureItems || []).length,
        nestedSpecificationRows: new Set(nestedReferences.map((reference) => reference.specificationId)).size,
        nestedStructureReferences: nestedReferences.length,
        outputNomenclatureRows: outputReferences.length,
        planningRoutes: planningImpact.routes.length,
        planningRouteSteps: planningImpact.routeSteps.length,
        planningSlots: planningImpact.slots.length,
      },
      references: {
        nestedStructure: nestedReferences.map((reference) => ({
          specificationIndex: reference.specificationIndex,
          specificationId: reference.specificationId,
          structureIndex: reference.structureIndex,
          itemId: reference.itemId,
        })),
        outputNomenclature: outputReferences.map(({ index, itemId }) => ({ index, itemId })),
        planning: publicPlanningBaselines(planningImpact),
      },
    },
  };
}

export function inspectSpecificationDeleteImpact(directory, specificationIdInput, options = {}) {
  try {
    const directoryProjection = inspectValidDirectory(directory);
    if (!directoryProjection.ok) return directoryProjection;
    const planningProjection = inspectPlanning(options.planning);
    if (!planningProjection.ok) return planningProjection;
    const specificationId = canonicalId(specificationIdInput);
    if (!specificationId || specificationId.length > MAX_ID_LENGTH) {
      return resultError(400, "specification-id-invalid", "A bounded Specification id is required");
    }
    const inspected = inspectDeleteFromProjections(directoryProjection, planningProjection, specificationId);
    return inspected.ok ? { ok: true, ...inspected.impact } : inspected;
  } catch {
    return resultError(503, "invalid-directory-projection", "Specification delete impact cannot be inspected safely");
  }
}

function deleteCommand(projection, command, entry, planning, now) {
  const expected = exactSpecification(command, entry);
  if (!expected.ok) return expected;
  const inspected = inspectDeleteFromProjections(projection, planning.projection, entry.specificationId);
  if (!inspected.ok) return inspected;
  if (typeof command.impactFingerprint !== "string" || !command.impactFingerprint) {
    return resultError(400, "impact-fingerprint-required", "A Specification delete impact fingerprint is required");
  }
  if (command.impactFingerprint !== inspected.impact.fingerprint) {
    return resultError(409, "specification-impact-changed", "Specification delete impact changed after confirmation", {
      currentImpact: inspected.impact,
    });
  }
  const outputIds = new Set(inspected.outputReferences.map((reference) => reference.itemId));
  const nomenclature = projection.directory.nomenclature.map((row) => (
    outputIds.has(row.id) ? { ...row, producedBySpecificationId: "", updatedAt: now } : row
  ));
  let nestedDeleted = 0;
  let bomBindingFieldsChanged = 0;
  const specifications = projection.directory.specifications
    .filter((_row, index) => index !== entry.index)
    .map((specification) => {
      const structureItems = specification.structureItems || [];
      const removedIds = new Set(structureItems
        .filter((item) => canonicalId(item.specificationId) === entry.specificationId)
        .map((item) => item.id));
      const retained = structureItems.filter((item) => {
        const remove = removedIds.has(item.id);
        if (remove) nestedDeleted += 1;
        return !remove;
      }).map((item) => removedIds.has(canonicalId(item.parentId)) ? { ...item, parentId: ROOT_STRUCTURE_ID } : item);
      if (retained.length === structureItems.length) return specification;
      const withStructure = {
        ...specification,
        structureItems: withCanonicalPositions(retained),
        updatedAt: now,
      };
      const normalized = normalizeBomBindings(withStructure, projection);
      bomBindingFieldsChanged += countBomBindingChanges(specification, normalized);
      return normalized;
    });
  const nextDirectory = { ...projection.directory, nomenclature, specifications };
  const valid = finalizeDirectory(nextDirectory);
  if (!valid.ok) return valid;
  const planningEffect = {
    kind: "planning-specification-delete",
    required: inspected.planningImpact.routes.length + inspected.planningImpact.routeSteps.length + inspected.planningImpact.slots.length > 0,
    mode: "delete-exact-rows",
    specificationId: entry.specificationId,
    expectedProjectionFingerprint: planning.projection.fingerprint,
    impactFingerprint: inspected.planningImpact.fingerprint,
    baselines: publicPlanningBaselines(inspected.planningImpact),
    operations: {
      deleteRouteIds: inspected.planningImpact.routes.map((item) => item.itemId),
      deleteRouteStepIds: inspected.planningImpact.routeSteps.map((item) => item.itemId),
      deleteSlotIds: inspected.planningImpact.slots.map((item) => item.itemId),
    },
  };
  return {
    ok: true,
    kind: "specification-delete",
    specificationId: entry.specificationId,
    row: entry.row,
    directory: nextDirectory,
    externalEffects: { planning: planningEffect, operationMap: null },
    requiresAtomicCommit: planningEffect.required,
    counts: structureCounts({
      specificationRowsDeleted: 1,
      nestedStructureReferencesDeleted: nestedDeleted,
      nomenclatureOutputRowsDetached: outputIds.size,
      bomBindingFieldsChanged,
    }),
    impact: { before: inspected.impact, after: null },
  };
}

function applySpecificationCommandInternal(directory, command, options) {
  const projection = inspectValidDirectory(directory);
  if (!projection.ok) return projection;
  const normalized = normalizeCommand(command);
  if (!normalized.ok) return normalized;
  const time = canonicalNow(options);
  if (!time.ok) return time;
  const planning = planningForCommand(command, options, normalized.specificationId);
  if (!planning.ok) return planning;
  const { kind, specificationId } = normalized;
  if (kind === "specification-create") return createCommand(projection, command, specificationId, planning, time.now);
  const entry = projection.specificationById.get(specificationId);
  if (!entry) return resultError(404, "specification-not-found", "Specification is absent", { specificationId });
  if (kind === "specification-metadata-update") return metadataCommand(projection, command, entry, planning, time.now);
  if (kind.startsWith("specification-structure-row-")) {
    return structureCommand(projection, command, kind, entry, planning, time.now);
  }
  if (kind === "specification-bom-bindings-normalize") {
    return bomNormalizeCommand(projection, command, entry, planning, time.now);
  }
  if (kind === "specification-route-binding-normalize") {
    return routeBindingCommand(projection, command, entry, planning, time.now);
  }
  return deleteCommand(projection, command, entry, planning, time.now);
}

export function applySpecificationCommand(directory, command, options = {}) {
  try {
    return applySpecificationCommandInternal(directory, command, options);
  } catch {
    return resultError(400, "specification-command-contained", "Specification command was rejected without throwing or mutating input");
  }
}
