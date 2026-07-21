const DEFAULT_COMMANDS_URL = "/api/v1/directory/nomenclature-types";
const DEFAULT_CAPABILITIES_URL = `${DEFAULT_COMMANDS_URL}/capabilities`;
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;
const MAX_ITEM_ID_LENGTH = 160;
const MAX_TYPE_NAME_LENGTH = 200;
const MAX_BOM_CELLS = 9;
const MAX_COMMAND_BYTES = 512 * 1024;
const MAX_REMEMBERED_COMMANDS = 512;
const REQUIRED_DIRECTORY_ARRAYS = Object.freeze([
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nonNegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function decimalHeaderInteger(value) {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function exactItemId(value) {
  const itemId = typeof value === "string" ? value.trim() : "";
  return itemId && itemId.length <= MAX_ITEM_ID_LENGTH && itemId === value ? itemId : "";
}

function utf8ByteLength(value) {
  const text = String(value ?? "");
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
  return unescape(encodeURIComponent(text)).length;
}

function normalizeSameOriginPath(value, label) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new TypeError(`${label} must be a same-origin absolute path`);
  }
  const parsed = new URL(path, "https://mes-client.invalid");
  if (parsed.origin !== "https://mes-client.invalid" || parsed.hash || parsed.search) {
    throw new TypeError(`${label} must be a same-origin path without query or fragment`);
  }
  return parsed.pathname.replace(/\/+$/, "") || "/";
}

function failure({
  status = 0,
  code,
  error,
  category,
  retryable = false,
  conflict = false,
  authenticationRequired = false,
  authorizationDenied = false,
  unavailable = false,
  ...metadata
}) {
  return {
    ok: false,
    failClosed: true,
    status: Number(status || 0),
    code: boundedText(code, 160) || "request-failed",
    error: boundedText(error, 500) || "The server request failed",
    category: boundedText(category, 80) || "http",
    retryable: retryable === true,
    conflict: conflict === true,
    authenticationRequired: authenticationRequired === true,
    authorizationDenied: authorizationDenied === true,
    unavailable: unavailable === true,
    ...metadata,
  };
}

function validationFailure(error, metadata = {}) {
  return failure({
    status: 0,
    code: "invalid-client-request",
    error,
    category: "validation",
    ...metadata,
  });
}

function protocolFailure(error, status = 0, metadata = {}) {
  return failure({
    status,
    code: "invalid-server-response",
    error,
    category: "protocol",
    retryable: status >= 500,
    unavailable: status >= 500,
    ...metadata,
  });
}

function getHeader(response, name) {
  if (typeof response?.headers?.get === "function") return String(response.headers.get(name) || "");
  const entry = Object.entries(response?.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return String(entry?.[1] || "");
}

function hasJsonContentType(response) {
  return /^application\/json(?:\s*;|$)/i.test(getHeader(response, "content-type").trim());
}

function parseStrongRevisionEtag(response) {
  const match = getHeader(response, "etag").trim().match(/^"(\d+)"$/);
  return match ? decimalHeaderInteger(match[1]) : null;
}

function stableJsonValue(value, state = { nodes: 0, depth: 0 }) {
  state.nodes += 1;
  if (state.nodes > 20_000 || state.depth > 64) throw new TypeError("JSON value is too complex");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite");
    return value;
  }
  if (Array.isArray(value)) {
    const nextState = { ...state, depth: state.depth + 1 };
    const result = value.map((entry) => stableJsonValue(entry, nextState));
    state.nodes = nextState.nodes;
    return result;
  }
  if (!isRecord(value)) throw new TypeError("Only JSON-compatible values are allowed");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Only plain JSON objects are allowed");
  const entries = [];
  const nextState = { ...state, depth: state.depth + 1 };
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
      throw new TypeError("Undefined and non-JSON properties are forbidden");
    }
    entries.push([key, stableJsonValue(entry, nextState)]);
  }
  state.nodes = nextState.nodes;
  return Object.fromEntries(entries);
}

function stableJsonStringify(value) {
  const serialized = JSON.stringify(stableJsonValue(value));
  if (typeof serialized !== "string" || utf8ByteLength(serialized) > MAX_COMMAND_BYTES) {
    throw new TypeError("Command JSON is too large");
  }
  return serialized;
}

function sameJsonValue(left, right) {
  try {
    return stableJsonStringify(left) === stableJsonStringify(right);
  } catch {
    return false;
  }
}

function normalizedTypeName(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
}

function typeNameKey(value) {
  return normalizedTypeName(value).toLocaleLowerCase("ru-RU");
}

const INACTIVE_TYPE_STATUSES = new Set([
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

function inactiveTypeRow(row) {
  return row?.active === false
    || row?.isActive === false
    || INACTIVE_TYPE_STATUSES.has(typeNameKey(typeof row?.status === "string" ? row.status : ""));
}

async function sha256Hex(value, cryptoImpl) {
  if (typeof TextEncoder !== "function" || typeof cryptoImpl?.subtle?.digest !== "function") return "";
  try {
    const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

export async function prepareNomenclatureTypeDeleteContract(input = {}) {
  if (!isRecord(input)) return validationFailure("Nomenclature type delete preview options are required");
  const {
    directory,
    itemId: rawItemId,
    fallbackTypeId: rawFallbackTypeId,
  } = input;
  const cryptoImpl = input.cryptoImpl === undefined ? globalThis.crypto : input.cryptoImpl;
  const projection = normalizeDirectoryProjection(directory, 0);
  const itemId = exactItemId(rawItemId);
  const fallbackTypeId = exactItemId(rawFallbackTypeId);
  if (!projection) return validationFailure("A complete authoritative Directory projection is required for delete preview");
  if (!itemId || !fallbackTypeId || itemId === fallbackTypeId) {
    return validationFailure("Delete preview requires different canonical target and fallback type ids");
  }
  const targetIndex = directory.nomenclatureTypes.findIndex((row) => row.id === itemId);
  const fallbackIndex = directory.nomenclatureTypes.findIndex((row) => row.id === fallbackTypeId);
  if (targetIndex < 0 || fallbackIndex < 0) {
    return validationFailure("Delete preview target and fallback rows must both exist in the same Directory projection");
  }
  if (directory.nomenclatureTypes.length <= 1 || inactiveTypeRow(directory.nomenclatureTypes[fallbackIndex])) {
    return validationFailure("Delete preview requires another active fallback Nomenclature type");
  }
  const expectedRow = directory.nomenclatureTypes[targetIndex];
  const fallbackExpectedRow = directory.nomenclatureTypes[fallbackIndex];
  const targetName = normalizedTypeName(expectedRow.name);
  const fallbackType = normalizedTypeName(fallbackExpectedRow.name);
  if (!targetName || !fallbackType) return validationFailure("Delete preview type names are invalid");
  const targetKey = typeNameKey(targetName);
  const nomenclatureReferences = [];
  for (let index = 0; index < directory.nomenclature.length; index += 1) {
    const row = directory.nomenclature[index];
    if (typeNameKey(row.type) === targetKey) nomenclatureReferences.push({ index, row });
  }
  const specificationReferences = [];
  for (let specificationIndex = 0; specificationIndex < directory.specifications.length; specificationIndex += 1) {
    const specification = directory.specifications[specificationIndex];
    if (specification.structureItems !== undefined && !Array.isArray(specification.structureItems)) {
      return validationFailure("Every Specification structureItems field must be an array for delete preview");
    }
    const structureItems = specification.structureItems || [];
    for (let structureItemIndex = 0; structureItemIndex < structureItems.length; structureItemIndex += 1) {
      const row = structureItems[structureItemIndex];
      if (!isRecord(row)) return validationFailure("Every Specification structure item must be an object for delete preview");
      if (typeNameKey(row.nomenclatureType) === targetKey) {
        specificationReferences.push({ specificationIndex, specification, structureItemIndex, row });
      }
    }
  }
  let fingerprintSource;
  try {
    fingerprintSource = JSON.stringify({
      target: { index: targetIndex, row: expectedRow },
      nomenclature: nomenclatureReferences.map(({ index, row }) => ({ index, row })),
      specifications: specificationReferences.map(({ specificationIndex, specification, structureItemIndex, row }) => ({
        specificationIndex,
        specificationId: specification.id,
        structureItemIndex,
        row,
      })),
    });
  } catch {
    return validationFailure("Delete impact cannot be represented as JSON");
  }
  const fingerprintHash = await sha256Hex(fingerprintSource, cryptoImpl);
  if (!fingerprintHash) {
    return failure({
      status: 0,
      code: "impact-fingerprint-unavailable",
      error: "SHA-256 is unavailable for the Nomenclature type delete preview",
      category: "unavailable",
      unavailable: true,
    });
  }
  return {
    ok: true,
    itemId,
    expectedRow,
    fallbackTypeId,
    fallbackExpectedRow,
    fallbackType,
    impactFingerprint: `sha256:${fingerprintHash}`,
    nomenclatureCount: nomenclatureReferences.length,
    specificationRowsCount: specificationReferences.length,
  };
}

function normalizeActor(value) {
  if (!isRecord(value)) return null;
  const employeeId = boundedText(value.employeeId, 160);
  const id = boundedText(value.id, 200);
  if (!employeeId || id !== `employee:${employeeId}`) return null;
  return {
    id,
    employeeId,
    displayName: boundedText(value.displayName, 300),
    personnelNumber: boundedText(value.personnelNumber, 120),
  };
}

const CAPABILITY_KEYS = Object.freeze([
  "canViewNomenclatureTypes",
  "canEditNomenclatureTypes",
  "canCreateNomenclatureTypes",
  "canDeleteNomenclatureTypes",
  "serverCommandsConfigured",
  "serverCommandsEnabled",
]);

function normalizeCapabilitiesPayload(payload) {
  if (!isRecord(payload)
    || payload.ok !== true
    || payload.apiVersion !== "v1"
    || typeof payload.authenticated !== "boolean"
    || !isRecord(payload.capabilities)
    || CAPABILITY_KEYS.some((key) => typeof payload.capabilities[key] !== "boolean")) return null;
  const rbacRevision = nonNegativeInteger(payload.rbacRevision);
  const directoryRevision = nonNegativeInteger(payload.directoryRevision);
  if (rbacRevision === null || directoryRevision === null) return null;
  const actor = payload.authenticated ? normalizeActor(payload.actor) : null;
  if (payload.authenticated && !actor) return null;
  const capabilities = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, payload.capabilities[key] === true]));
  const domainRights = [
    capabilities.canViewNomenclatureTypes,
    capabilities.canEditNomenclatureTypes,
    capabilities.canCreateNomenclatureTypes,
    capabilities.canDeleteNomenclatureTypes,
  ];
  if (!payload.authenticated && (payload.actor !== null || domainRights.some(Boolean) || capabilities.serverCommandsEnabled)) return null;
  if ((capabilities.canCreateNomenclatureTypes || capabilities.canDeleteNomenclatureTypes)
    && !capabilities.canEditNomenclatureTypes) return null;
  if ((capabilities.canEditNomenclatureTypes
    || capabilities.canCreateNomenclatureTypes
    || capabilities.canDeleteNomenclatureTypes)
    && !capabilities.canViewNomenclatureTypes) return null;
  if (capabilities.serverCommandsEnabled
    && (!payload.authenticated || !capabilities.serverCommandsConfigured || !capabilities.canEditNomenclatureTypes)) return null;
  return {
    ok: true,
    authenticated: payload.authenticated,
    actor,
    rbacRevision,
    directoryRevision,
    authorizationReason: boundedText(payload.authorizationReason, 300),
    capabilities,
    enabled: payload.authenticated && capabilities.serverCommandsEnabled,
  };
}

function normalizeDirectoryProjection(directory, revision) {
  if (!isRecord(directory) || nonNegativeInteger(revision) === null) return null;
  if (REQUIRED_DIRECTORY_ARRAYS.some((section) => !Array.isArray(directory[section]))) return null;
  const typeIds = new Set();
  const typeNames = new Set();
  for (const row of directory.nomenclatureTypes) {
    if (!isRecord(row)) return null;
    const id = exactItemId(row.id);
    const name = normalizedTypeName(row.name);
    const nameKey = typeNameKey(name);
    if (!id || typeIds.has(id) || !name || name.length > MAX_TYPE_NAME_LENGTH || typeNames.has(nameKey)) return null;
    typeIds.add(id);
    typeNames.add(nameKey);
  }
  const nomenclatureIds = new Set();
  for (const row of directory.nomenclature) {
    if (!isRecord(row)) return null;
    const id = exactItemId(row.id);
    if (!id || nomenclatureIds.has(id)) return null;
    if (row.sourceBomIds !== undefined && !Array.isArray(row.sourceBomIds)) return null;
    nomenclatureIds.add(id);
  }

  const boardIds = new Set();
  for (const board of directory.bomLists) {
    if (!isRecord(board)) return null;
    const boardId = exactItemId(board.id);
    if (!boardId || boardIds.has(boardId)) return null;
    boardIds.add(boardId);
    if (board.importRows !== undefined && !Array.isArray(board.importRows)) return null;
    const bomRowIds = new Set();
    for (const row of board.importRows || []) {
      if (!Array.isArray(row) && !isRecord(row)) return null;
      const values = Array.isArray(row) ? row : row.values;
      if (values !== undefined) {
        if (!Array.isArray(values) || values.length > MAX_BOM_CELLS) return null;
        if (values.some((value) => !(
          value === null
          || typeof value === "string"
          || typeof value === "boolean"
          || (typeof value === "number" && Number.isFinite(value))
        ))) return null;
      }
      if (isRecord(row) && row.id !== undefined) {
        const rowId = exactItemId(row.id);
        if (!rowId || bomRowIds.has(rowId)) return null;
        bomRowIds.add(rowId);
      }
      if (isRecord(row) && row.nomenclatureId !== undefined && row.nomenclatureId !== "") {
        const nomenclatureId = exactItemId(row.nomenclatureId);
        if (!nomenclatureId || !nomenclatureIds.has(nomenclatureId)) return null;
      }
    }
  }

  const specificationIds = new Set();
  const structureIdsBySpecification = new Map();
  for (const specification of directory.specifications) {
    if (!isRecord(specification)) return null;
    const specificationId = exactItemId(specification.id);
    if (!specificationId || specificationIds.has(specificationId)) return null;
    specificationIds.add(specificationId);
    if (specification.structureItems !== undefined && !Array.isArray(specification.structureItems)) return null;
    const structureIds = new Set();
    for (const row of specification.structureItems || []) {
      if (!isRecord(row)) return null;
      const rowId = exactItemId(row.id);
      if (!rowId || structureIds.has(rowId)) return null;
      structureIds.add(rowId);
    }
    structureIdsBySpecification.set(specificationId, structureIds);
  }

  const optionalReferenceId = (value) => {
    if (value === undefined || value === null || value === "") return "";
    return exactItemId(value) || null;
  };
  const knownReference = (value, ids) => {
    const id = optionalReferenceId(value);
    return id !== null && (!id || ids.has(id));
  };
  const knownTypeReference = (value) => {
    if (value === undefined || value === null || value === "") return true;
    const name = normalizedTypeName(value);
    return Boolean(name && typeNames.has(typeNameKey(name)));
  };

  for (const row of directory.nomenclature) {
    if (!knownTypeReference(row.type)
      || !knownReference(row.sourceBomResultId, boardIds)
      || !knownReference(row.producedBySpecificationId, specificationIds)) return null;
    const sourceIds = new Set();
    for (const sourceIdValue of row.sourceBomIds || []) {
      const sourceId = optionalReferenceId(sourceIdValue);
      if (!sourceId || !boardIds.has(sourceId) || sourceIds.has(sourceId)) return null;
      sourceIds.add(sourceId);
    }
  }

  const specificationDependencies = new Map();
  for (const specification of directory.specifications) {
    const specificationId = exactItemId(specification.id);
    const structureIds = structureIdsBySpecification.get(specificationId);
    if (!structureIds
      || !knownReference(specification.outputNomenclatureId, nomenclatureIds)
      || !knownReference(specification.bomListA, boardIds)
      || !knownReference(specification.bomListB, boardIds)) return null;
    const parentById = new Map();
    const dependencies = new Set();
    for (const row of specification.structureItems || []) {
      if (!knownTypeReference(row.nomenclatureType)
        || !knownReference(row.nomenclatureId, nomenclatureIds)
        || !knownReference(row.bomListId, boardIds)
        || !knownReference(row.bomId, boardIds)) return null;
      const linkedSpecificationId = optionalReferenceId(row.specificationId);
      if (linkedSpecificationId === null
        || (linkedSpecificationId && (linkedSpecificationId === specificationId || !specificationIds.has(linkedSpecificationId)))) return null;
      if (linkedSpecificationId) dependencies.add(linkedSpecificationId);
      const parentId = optionalReferenceId(row.parentId);
      if (parentId === null
        || (parentId && parentId !== "root" && (parentId === row.id || !structureIds.has(parentId)))) return null;
      parentById.set(row.id, parentId || "root");
    }
    for (const structureId of structureIds) {
      const visited = new Set();
      let cursor = structureId;
      while (cursor !== "root") {
        if (visited.has(cursor)) return null;
        visited.add(cursor);
        cursor = parentById.get(cursor) || "root";
      }
    }
    specificationDependencies.set(specificationId, dependencies);
  }
  const dependencyState = new Map();
  for (const rootSpecificationId of specificationIds) {
    if (dependencyState.get(rootSpecificationId) === 2) continue;
    dependencyState.set(rootSpecificationId, 1);
    const stack = [{ specificationId: rootSpecificationId, dependencies: [...(specificationDependencies.get(rootSpecificationId) || [])], index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.dependencies.length) {
        dependencyState.set(frame.specificationId, 2);
        stack.pop();
        continue;
      }
      const dependencyId = frame.dependencies[frame.index];
      frame.index += 1;
      const dependencyStatus = dependencyState.get(dependencyId) || 0;
      if (dependencyStatus === 1) return null;
      if (dependencyStatus === 2) continue;
      dependencyState.set(dependencyId, 1);
      stack.push({ specificationId: dependencyId, dependencies: [...(specificationDependencies.get(dependencyId) || [])], index: 0 });
    }
  }
  return { revision, directory };
}

function normalizeCounts(value, kind) {
  if (!isRecord(value)) return null;
  const keys = [
    "typeRowsCreated",
    "typeRowsUpdated",
    "typeRowsDeleted",
    "nomenclatureRowsRetyped",
    "specificationRowsRetyped",
    "totalReferencesRetyped",
  ];
  const counts = Object.fromEntries(keys.map((key) => [key, nonNegativeInteger(value[key])]));
  if (Object.values(counts).some((entry) => entry === null)
    || counts.totalReferencesRetyped !== counts.nomenclatureRowsRetyped + counts.specificationRowsRetyped
    || counts.typeRowsCreated !== (kind === "create" ? 1 : 0)
    || counts.typeRowsUpdated !== (kind === "update" ? 1 : 0)
    || counts.typeRowsDeleted !== (kind === "delete" ? 1 : 0)) return null;
  return counts;
}

function normalizeImpactSnapshot(value, itemId) {
  if (!isRecord(value)
    || exactItemId(value.itemId) !== itemId
    || !boundedText(value.typeName, 200)
    || !/^sha256:[a-f0-9]{64}$/.test(String(value.fingerprint || ""))
    || !isRecord(value.counts)
    || !isRecord(value.references)
    || !Array.isArray(value.references.nomenclature)
    || !Array.isArray(value.references.specifications)) return null;
  const nomenclatureRows = nonNegativeInteger(value.counts.nomenclatureRows);
  const specificationRows = nonNegativeInteger(value.counts.specificationRows);
  const totalReferences = nonNegativeInteger(value.counts.totalReferences);
  if (nomenclatureRows === null
    || specificationRows === null
    || totalReferences === null
    || totalReferences !== nomenclatureRows + specificationRows
    || value.references.nomenclature.length !== nomenclatureRows
    || value.references.specifications.length !== specificationRows
    || [...value.references.nomenclature, ...value.references.specifications].some((entry) => !isRecord(entry))) return null;
  return {
    itemId,
    typeName: boundedText(value.typeName, 200),
    fingerprint: String(value.fingerprint),
    counts: { nomenclatureRows, specificationRows, totalReferences },
    references: value.references,
  };
}

function normalizeImpact(value, kind, itemId, expectedFingerprint = "") {
  if (!isRecord(value)) return null;
  const before = value.before === null ? null : normalizeImpactSnapshot(value.before, itemId);
  const after = value.after === null ? null : normalizeImpactSnapshot(value.after, itemId);
  if ((value.before !== null && !before)
    || (value.after !== null && !after)
    || (kind === "create" && (before !== null || after === null))
    || (kind === "update" && (before === null || after === null))
    || (kind === "delete" && (before === null || after !== null))
    || (kind === "delete" && before.fingerprint !== expectedFingerprint)) return null;
  return { before, after };
}

function normalizeReceipt(value, command, revision) {
  if (!isRecord(value)) return null;
  const commandRevision = nonNegativeInteger(value.commandRevision);
  const baseRevision = nonNegativeInteger(value.baseRevision);
  const actorId = boundedText(value.actorId, 200);
  const expectedRebased = commandRevision !== null
    ? command.expectedRevision < commandRevision - 1
    : false;
  if (commandRevision === null
    || commandRevision < 1
    || commandRevision > revision
    || baseRevision !== command.expectedRevision
    || typeof value.rebased !== "boolean"
    || value.rebased !== expectedRebased
    || value.kind !== command.kind
    || exactItemId(value.itemId) !== command.itemId
    || value.idempotencyKey !== command.idempotencyKey
    || !/^employee:[^\s]+$/.test(actorId)) return null;
  return {
    actorId,
    commandRevision,
    baseRevision,
    rebased: value.rebased,
    kind: command.kind,
    itemId: command.itemId,
    idempotencyKey: command.idempotencyKey,
  };
}

function normalizeCommandSuccess(response, payload, command) {
  const { kind, itemId } = command;
  if (!isRecord(payload)
    || payload.ok !== true
    || payload.apiVersion !== "v1"
    || payload.kind !== kind
    || exactItemId(payload.itemId) !== itemId
    || !isRecord(payload.row)
    || exactItemId(payload.row.id) !== itemId
    || typeof payload.idempotentReplay !== "boolean") return null;
  const revision = nonNegativeInteger(payload.revision);
  const etagRevision = parseStrongRevisionEtag(response);
  const projection = revision === null ? null : normalizeDirectoryProjection(payload.directory, revision);
  const counts = normalizeCounts(payload.counts, kind);
  const impact = normalizeImpact(payload.impact, kind, itemId, command.impactFingerprint);
  const receipt = revision === null ? null : normalizeReceipt(payload.receipt, command, revision);
  const status = Number(response.status);
  const statusValid = kind === "create"
    ? (payload.idempotentReplay ? status === 200 : status === 201)
    : status === 200;
  if (revision === null || etagRevision !== revision || !projection || !counts || !impact || !receipt || !statusValid) return null;

  const projectedRow = projection.directory.nomenclatureTypes.find((row) => row.id === itemId) || null;
  const receiptStillCurrent = kind === "delete"
    ? projectedRow === null
    : Boolean(projectedRow) && sameJsonValue(projectedRow, payload.row);
  if (!receiptStillCurrent) {
    if (!payload.idempotentReplay) return null;
    return failure({
      status,
      code: "superseded-idempotent-replay",
      error: "The idempotent command receipt was superseded by a later Directory revision",
      category: "conflict",
      conflict: true,
      superseded: true,
      idempotentReplay: true,
      currentRevision: revision,
      projection,
      receipt,
      itemId,
      kind,
    });
  }
  return {
    ok: true,
    status,
    kind,
    itemId,
    row: payload.row,
    revision,
    directory: projection.directory,
    projection,
    counts,
    impact,
    receipt,
    idempotentReplay: payload.idempotentReplay,
    superseded: false,
  };
}

function serverFailureCode(payload, status) {
  const explicit = boundedText(payload?.code, 160);
  if (explicit) return explicit;
  const error = boundedText(payload?.error, 160);
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(error) ? error : `http-${status}`;
}

function normalizeFailureProjection(response, payload) {
  const revision = nonNegativeInteger(payload?.revision);
  if (revision === null || parseStrongRevisionEtag(response) !== revision) return null;
  return normalizeDirectoryProjection(payload?.directory, revision);
}

function normalizeSupersededReplayFailure(response, payload, command, operation) {
  const status = Number(response?.status || 0);
  const revision = nonNegativeInteger(payload?.revision);
  const projection = revision === null || parseStrongRevisionEtag(response) !== revision
    ? null
    : normalizeDirectoryProjection(payload.directory, revision);
  const row = isRecord(payload?.row) && exactItemId(payload.row.id) === command?.itemId
    ? payload.row
    : null;
  const counts = command ? normalizeCounts(payload?.counts, command.kind) : null;
  const impact = command ? normalizeImpact(
    payload?.impact,
    command.kind,
    command.itemId,
    command.impactFingerprint,
  ) : null;
  const receipt = command && revision !== null
    ? normalizeReceipt(payload?.receipt, command, revision)
    : null;
  if (status !== 409
    || !command
    || payload?.ok !== false
    || payload?.apiVersion !== "v1"
    || payload?.code !== "superseded-idempotent-replay"
    || payload?.conflict !== true
    || payload?.superseded !== true
    || payload?.idempotentReplay !== true
    || payload?.kind !== command.kind
    || exactItemId(payload?.itemId) !== command.itemId
    || !projection
    || !row
    || !counts
    || !impact
    || !receipt) {
    return protocolFailure(`${operation} returned an invalid superseded replay`, status);
  }
  return failure({
    status,
    code: "superseded-idempotent-replay",
    error: boundedText(payload.error, 500) || "The idempotent command receipt was superseded by a later Directory revision",
    category: "conflict",
    conflict: true,
    superseded: true,
    idempotentReplay: true,
    currentRevision: revision,
    projection,
    row,
    counts,
    impact,
    receipt,
    itemId: command.itemId,
    kind: command.kind,
  });
}

function mapHttpFailure(response, payload, operation, command = null) {
  const status = Number(response?.status || 0);
  const code = serverFailureCode(payload, status);
  const error = boundedText(payload?.error, 500) || `${operation} returned HTTP ${status}`;
  const common = { status, code, error };
  if (status === 401) return failure({ ...common, category: "authentication", authenticationRequired: true });
  if (status === 403 && ["same-origin-required", "cross-site-request-rejected"].includes(code)) {
    return failure({ ...common, category: "security" });
  }
  if (status === 403) return failure({ ...common, category: "authorization", authorizationDenied: true });
  if (status === 404) return failure({ ...common, category: "not-configured", unavailable: true });
  if ([409, 412].includes(status)) {
    if (code === "superseded-idempotent-replay" || payload?.superseded === true || payload?.idempotentReplay === true) {
      return normalizeSupersededReplayFailure(response, payload, command, operation);
    }
    if (/(?:disabled|not-configured)$/.test(code)) {
      return failure({ ...common, category: "not-configured", unavailable: true });
    }
    const projection = normalizeFailureProjection(response, payload);
    return failure({
      ...common,
      category: "conflict",
      conflict: true,
      currentRevision: projection?.revision ?? null,
      projection,
    });
  }
  if (status === 428) return failure({ ...common, category: "precondition" });
  if (status === 429) {
    const retryAfter = decimalHeaderInteger(getHeader(response, "retry-after"));
    return failure({ ...common, category: "rate-limit", retryable: true, retryAfter });
  }
  if ([400, 413, 422].includes(status)) return failure({ ...common, category: "validation" });
  if (status === 415) return failure({ ...common, category: "protocol" });
  if (status >= 500) return failure({ ...common, category: "unavailable", retryable: true, unavailable: true });
  return failure({ ...common, category: "http" });
}

function validateIdempotencyKey(value) {
  const key = String(value || "").trim();
  return /^[\x21-\x7e]+$/.test(key) && key.length <= MAX_IDEMPOTENCY_KEY_LENGTH ? key : "";
}

function validateCommandInput(kind, input) {
  if (!isRecord(input)) return validationFailure("Nomenclature type command options are required");
  const expectedRevision = nonNegativeInteger(input.expectedRevision);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const itemId = exactItemId(input.itemId);
  if (expectedRevision === null) return validationFailure("A non-negative expected Directory revision is required");
  if (!idempotencyKey) return validationFailure("A printable Idempotency-Key of at most 160 characters is required");
  if (!itemId) return validationFailure("A canonical Nomenclature type item id of at most 160 characters is required");

  const row = isRecord(input.row) ? input.row : null;
  const expectedRow = isRecord(input.expectedRow) ? input.expectedRow : null;
  if (["create", "update"].includes(kind) && (!row || exactItemId(row.id) !== itemId)) {
    return validationFailure("Create and update require a row with the exact item id");
  }
  if (["update", "delete"].includes(kind) && (!expectedRow || exactItemId(expectedRow.id) !== itemId)) {
    return validationFailure("Update and delete require the exact previously read row");
  }

  let body;
  let impactFingerprint = "";
  if (kind === "create") {
    body = { kind, itemId, expectedRevision, row };
  } else if (kind === "update") {
    body = { kind, itemId, expectedRevision, expectedRow, row };
  } else {
    const fallbackTypeId = exactItemId(input.fallbackTypeId);
    const fallbackExpectedRow = isRecord(input.fallbackExpectedRow) ? input.fallbackExpectedRow : null;
    impactFingerprint = typeof input.impactFingerprint === "string" ? input.impactFingerprint : "";
    if (!fallbackTypeId || fallbackTypeId === itemId) {
      return validationFailure("Delete requires a different canonical fallback Nomenclature type id");
    }
    if (!fallbackExpectedRow || exactItemId(fallbackExpectedRow.id) !== fallbackTypeId) {
      return validationFailure("Delete requires the exact previously read fallback row");
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(impactFingerprint)) {
      return validationFailure("Delete requires an exact sha256 impact fingerprint");
    }
    body = {
      kind,
      itemId,
      expectedRevision,
      expectedRow,
      fallbackTypeId,
      fallbackExpectedRow,
      impactFingerprint,
    };
  }

  let serializedBody;
  try {
    serializedBody = stableJsonStringify(body);
  } catch (error) {
    return validationFailure(boundedText(error?.message, 300) || "Command body must be bounded JSON");
  }
  return {
    ok: true,
    kind,
    itemId,
    expectedRevision,
    idempotencyKey,
    impactFingerprint,
    serializedBody,
  };
}

export function createNomenclatureTypesServerOwnerClient({
  fetchImpl = globalThis.fetch,
  commandsUrl = DEFAULT_COMMANDS_URL,
  capabilitiesUrl = DEFAULT_CAPABILITIES_URL,
} = {}) {
  const nomenclatureTypesCommandsUrl = normalizeSameOriginPath(commandsUrl, "commandsUrl");
  const nomenclatureTypesCapabilitiesUrl = normalizeSameOriginPath(capabilitiesUrl, "capabilitiesUrl");
  const rememberedCommandBodies = new Map();

  function rememberExactCommand(idempotencyKey, serializedBody) {
    const remembered = rememberedCommandBodies.get(idempotencyKey);
    if (remembered !== undefined && remembered !== serializedBody) {
      return failure({
        status: 0,
        code: "idempotency-key-reused",
        error: "Idempotency-Key was already used for a different exact command body",
        category: "validation",
      });
    }
    if (remembered === undefined) {
      rememberedCommandBodies.set(idempotencyKey, serializedBody);
      if (rememberedCommandBodies.size > MAX_REMEMBERED_COMMANDS) {
        rememberedCommandBodies.delete(rememberedCommandBodies.keys().next().value);
      }
    }
    return { ok: true, serializedBody: remembered ?? serializedBody };
  }

  async function requestJson({ url, method, serializedBody, headers = {}, signal, operation, failureContext = null }) {
    if (typeof fetchImpl !== "function") {
      return failure({ status: 0, code: "transport-unavailable", error: `${operation} transport is unavailable`, category: "unavailable", retryable: true, unavailable: true });
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: {
          "Accept": "application/json",
          ...(serializedBody === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return failure({ status: 0, code: "request-aborted", error: `${operation} was aborted`, category: "aborted" });
      }
      return failure({
        status: 0,
        code: "network-unavailable",
        error: boundedText(error?.message, 500) || `${operation} is unavailable`,
        category: "unavailable",
        retryable: true,
        unavailable: true,
      });
    }
    const status = Number(response?.status || 0);
    if (!Number.isInteger(status) || status < 100 || status > 599 || typeof response?.json !== "function") {
      return protocolFailure(`${operation} returned an invalid HTTP response`, status);
    }
    if (status === 401 && !hasJsonContentType(response)) {
      return mapHttpFailure(response, { ok: false, error: "public-session-required" }, operation, failureContext);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      return protocolFailure(`${operation} returned invalid JSON`, status);
    }
    if (!isRecord(payload)) return protocolFailure(`${operation} returned a non-object JSON payload`, status);
    if (status < 200 || status >= 300) return mapHttpFailure(response, payload, operation, failureContext);
    if (!hasJsonContentType(response)) return protocolFailure(`${operation} returned a non-JSON content type`, status);
    return { ok: true, response, payload };
  }

  async function getCapabilities({ signal } = {}) {
    const result = await requestJson({
      url: nomenclatureTypesCapabilitiesUrl,
      method: "GET",
      signal,
      operation: "Nomenclature types capability read",
    });
    if (!result.ok) return result;
    return normalizeCapabilitiesPayload(result.payload)
      || protocolFailure("Nomenclature types capability read returned an invalid payload", result.response.status);
  }

  async function command(kind, input = {}) {
    const validated = validateCommandInput(kind, input);
    if (!validated.ok) return validated;
    const remembered = rememberExactCommand(validated.idempotencyKey, validated.serializedBody);
    if (!remembered.ok) return remembered;
    const result = await requestJson({
      url: nomenclatureTypesCommandsUrl,
      method: "POST",
      serializedBody: remembered.serializedBody,
      headers: {
        "If-Match": `"${validated.expectedRevision}"`,
        "Idempotency-Key": validated.idempotencyKey,
      },
      signal: input.signal,
      operation: `Nomenclature type ${kind}`,
      failureContext: validated,
    });
    if (!result.ok) return result;
    const normalized = normalizeCommandSuccess(result.response, result.payload, validated);
    return normalized || protocolFailure(
      `Nomenclature type ${kind} returned an invalid authoritative Directory projection`,
      result.response.status,
    );
  }

  return Object.freeze({
    getCapabilities,
    createNomenclatureType: (input) => command("create", input),
    updateNomenclatureType: (input) => command("update", input),
    deleteNomenclatureType: (input) => command("delete", input),
  });
}
