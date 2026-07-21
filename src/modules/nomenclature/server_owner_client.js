const DEFAULT_SESSION_URL = "/api/v1/auth/employee-session";
const DEFAULT_CAPABILITIES_URL = "/api/v1/nomenclature/capabilities";
const DEFAULT_COMMANDS_URL = "/api/v1/nomenclature";
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sameJsonValue(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
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
  return itemId && itemId.length <= 160 ? itemId : "";
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

function validationFailure(error) {
  return failure({ status: 0, code: "invalid-client-request", error, category: "validation" });
}

function protocolFailure(error, status = 0) {
  return failure({
    status,
    code: "invalid-server-response",
    error,
    category: "protocol",
    retryable: status >= 500,
    unavailable: status >= 500,
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

function normalizeSessionPayload(payload, { requireUnauthenticated = false } = {}) {
  if (!isRecord(payload) || payload.ok !== true || typeof payload.authenticated !== "boolean") return null;
  if (requireUnauthenticated && payload.authenticated !== false) return null;
  if (!payload.authenticated) {
    return {
      ok: true,
      authenticated: false,
      actor: null,
      reason: boundedText(payload.reason || payload.authorizationReason, 200),
    };
  }
  const actor = normalizeActor(payload.actor);
  return actor ? { ok: true, authenticated: true, actor, reason: "" } : null;
}

const CAPABILITY_KEYS = Object.freeze([
  "canViewNomenclature",
  "canEditNomenclature",
  "canCreateNomenclature",
  "canDeleteNomenclature",
  "serverCommandsConfigured",
  "serverCommandsEnabled",
]);

function normalizeCapabilitiesPayload(payload) {
  if (!isRecord(payload)
    || payload.ok !== true
    || typeof payload.authenticated !== "boolean"
    || !isRecord(payload.capabilities)
    || CAPABILITY_KEYS.some((key) => typeof payload.capabilities[key] !== "boolean")) return null;
  const actor = payload.authenticated ? normalizeActor(payload.actor) : null;
  if (payload.authenticated && !actor) return null;
  const capabilities = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, payload.capabilities[key] === true]));
  if (!payload.authenticated && (actor || capabilities.serverCommandsEnabled
    || capabilities.canViewNomenclature
    || capabilities.canEditNomenclature
    || capabilities.canCreateNomenclature
    || capabilities.canDeleteNomenclature)) return null;
  if (capabilities.serverCommandsEnabled
    && (!capabilities.serverCommandsConfigured || !capabilities.canEditNomenclature)) return null;
  const rbacRevision = nonNegativeInteger(payload.rbacRevision);
  if (rbacRevision === null) return null;
  return {
    ok: true,
    authenticated: payload.authenticated,
    actor,
    rbacRevision,
    authorizationReason: boundedText(payload.authorizationReason, 300),
    capabilities,
    enabled: payload.authenticated && capabilities.serverCommandsEnabled,
  };
}

function normalizeDirectoryProjection(value, expectedRevision = null) {
  if (!isRecord(value)) return null;
  const revision = nonNegativeInteger(value.revision);
  if (revision === null || (expectedRevision !== null && revision !== expectedRevision)) return null;
  const updatedAt = boundedText(value.updatedAt, 100);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(updatedAt)) return null;
  const directory = value.directory;
  if (!isRecord(directory)
    || !Array.isArray(directory.nomenclature)
    || !Array.isArray(directory.nomenclatureTypes)
    || !Array.isArray(directory.bomLists)
    || !Array.isArray(directory.specifications)) return null;
  const ids = new Set();
  for (const row of directory.nomenclature) {
    const id = isRecord(row) ? exactItemId(row.id) : "";
    if (!id || ids.has(id)) return null;
    ids.add(id);
  }
  return {
    revision,
    updatedAt,
    directory,
  };
}

function normalizeUnlinkedReferences(value) {
  if (!isRecord(value)) return null;
  const bom = nonNegativeInteger(value.bom);
  const specifications = nonNegativeInteger(value.specifications);
  return bom === null || specifications === null ? null : { bom, specifications };
}

function normalizeCommandSuccess(response, payload, { kind, itemId }) {
  if (!isRecord(payload)
    || payload.ok !== true
    || payload.apiVersion !== "v1"
    || payload.kind !== kind
    || exactItemId(payload.itemId) !== itemId
    || !isRecord(payload.item)
    || exactItemId(payload.item.id) !== itemId
    || typeof payload.replayed !== "boolean"
    || typeof payload.superseded !== "boolean"
    || typeof payload.rebased !== "boolean") return null;
  const revision = nonNegativeInteger(payload.revision);
  const commandRevision = nonNegativeInteger(payload.commandRevision);
  const baseRevision = nonNegativeInteger(payload.baseRevision);
  const etagRevision = parseStrongRevisionEtag(response);
  const projection = normalizeDirectoryProjection(payload.projection, revision);
  const unlinkedReferences = normalizeUnlinkedReferences(payload.unlinkedReferences);
  const actorId = boundedText(payload.actorId, 200);
  const expectedRebased = baseRevision !== null && commandRevision !== null
    ? baseRevision < commandRevision - 1
    : false;
  const validSuccessStatus = kind === "create"
    ? Number(response.status) === 201 || (Number(response.status) === 200 && payload.replayed === true)
    : Number(response.status) === 200;
  if (revision === null
    || commandRevision === null
    || commandRevision < 1
    || commandRevision > revision
    || baseRevision === null
    || baseRevision >= commandRevision
    || payload.rebased !== expectedRebased
    || !validSuccessStatus
    || etagRevision !== revision
    || !projection
    || !unlinkedReferences
    || !/^employee:[^\s]+$/.test(actorId)) return null;
  const projectedItem = projection.directory.nomenclature.find((row) => exactItemId(row?.id) === itemId) || null;
  const receiptStillCurrent = kind === "delete"
    ? projectedItem === null
    : Boolean(projectedItem) && sameJsonValue(projectedItem, payload.item);
  if ((!payload.replayed && (!receiptStillCurrent || payload.superseded))
    || (payload.replayed && payload.superseded !== !receiptStillCurrent)) return null;
  return {
    ok: true,
    status: Number(response.status),
    kind,
    itemId,
    item: payload.item,
    revision,
    commandRevision,
    baseRevision,
    replayed: payload.replayed,
    superseded: payload.superseded,
    rebased: payload.rebased,
    unlinkedReferences,
    actorId,
    projection,
  };
}

function serverFailureCode(payload, status) {
  const explicit = boundedText(payload?.code, 160);
  if (explicit) return explicit;
  const error = boundedText(payload?.error, 160);
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(error) ? error : `http-${status}`;
}

function mapHttpFailure(response, payload, operation) {
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
  if (status === 409) {
    if (/(?:disabled|not-configured)$/.test(code)) return failure({ ...common, category: "not-configured", unavailable: true });
    const currentRevision = nonNegativeInteger(payload?.revision);
    const etagRevision = parseStrongRevisionEtag(response);
    const projection = currentRevision !== null && etagRevision === currentRevision
      ? normalizeDirectoryProjection(payload?.projection, currentRevision)
      : null;
    return failure({
      ...common,
      category: "conflict",
      conflict: true,
      currentRevision,
      projection,
    });
  }
  if (status === 428) return failure({ ...common, category: "precondition" });
  if (status === 429) {
    const retryAfter = decimalHeaderInteger(getHeader(response, "retry-after"));
    return failure({ ...common, category: "rate-limit", retryable: true, retryAfter });
  }
  if (status === 400 || status === 413 || status === 422) return failure({ ...common, category: "validation" });
  if (status === 415) return failure({ ...common, category: "protocol" });
  if (status >= 500) return failure({ ...common, category: "unavailable", retryable: true, unavailable: true });
  return failure({ ...common, category: "http" });
}

function validateIdempotencyKey(value) {
  const key = String(value || "").trim();
  return /^[\x21-\x7e]+$/.test(key) && key.length <= MAX_IDEMPOTENCY_KEY_LENGTH ? key : "";
}

function validateCommandInput(kind, input) {
  if (!isRecord(input)) return validationFailure("Nomenclature command options are required");
  const expectedRevision = nonNegativeInteger(input.expectedRevision);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const rawItemId = typeof (input.itemId || input.row?.id) === "string" ? (input.itemId || input.row?.id).trim() : "";
  const itemId = exactItemId(rawItemId);
  const row = isRecord(input.row) ? input.row : null;
  const expectedRow = isRecord(input.expectedRow) ? input.expectedRow : null;
  if (expectedRevision === null) return validationFailure("A non-negative expected revision is required");
  if (!idempotencyKey) return validationFailure("A printable Idempotency-Key of at most 160 characters is required");
  if (!rawItemId) return validationFailure("A Nomenclature item id is required");
  if (!itemId) return validationFailure("A Nomenclature item id of at most 160 characters is required");
  if (["create", "update"].includes(kind) && (!row || exactItemId(row.id) !== itemId)) {
    return validationFailure("Create and update require a row with the exact item id");
  }
  if (["update", "delete"].includes(kind) && (!expectedRow || exactItemId(expectedRow.id) !== itemId)) {
    return validationFailure("Update and delete require the exact previously read row");
  }
  return { ok: true, expectedRevision, idempotencyKey, itemId, row, expectedRow };
}

export function createNomenclatureServerOwnerClient({
  fetchImpl = globalThis.fetch,
  sessionUrl = DEFAULT_SESSION_URL,
  capabilitiesUrl = DEFAULT_CAPABILITIES_URL,
  commandsUrl = DEFAULT_COMMANDS_URL,
} = {}) {
  const employeeSessionUrl = normalizeSameOriginPath(sessionUrl, "sessionUrl");
  const nomenclatureCapabilitiesUrl = normalizeSameOriginPath(capabilitiesUrl, "capabilitiesUrl");
  const nomenclatureCommandsUrl = normalizeSameOriginPath(commandsUrl, "commandsUrl");

  async function requestJson({ url, method, body, headers = {}, signal, operation }) {
    if (typeof fetchImpl !== "function") {
      return failure({ status: 0, code: "transport-unavailable", error: `${operation} transport is unavailable`, category: "unavailable", retryable: true, unavailable: true });
    }
    let serializedBody;
    try {
      serializedBody = body === undefined ? undefined : JSON.stringify(body);
    } catch {
      return validationFailure(`${operation} payload is not JSON serializable`);
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
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
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
      return mapHttpFailure(response, { ok: false, error: "public-session-required" }, operation);
    }
    let payload;
    try { payload = await response.json(); }
    catch { return protocolFailure(`${operation} returned invalid JSON`, status); }
    if (!isRecord(payload)) return protocolFailure(`${operation} returned a non-object JSON payload`, status);
    if (status < 200 || status >= 300) return mapHttpFailure(response, payload, operation);
    if (!hasJsonContentType(response)) return protocolFailure(`${operation} returned a non-JSON content type`, status);
    return { ok: true, response, payload };
  }

  async function getEmployeeSession({ signal } = {}) {
    const result = await requestJson({ url: employeeSessionUrl, method: "GET", signal, operation: "Employee session read" });
    if (!result.ok) return result;
    const session = normalizeSessionPayload(result.payload);
    return session || protocolFailure("Employee session read returned an invalid payload", result.response.status);
  }

  async function createEmployeeSession({ employeeId, pin, signal } = {}) {
    const normalizedEmployeeId = boundedText(employeeId, 257);
    if (!normalizedEmployeeId || normalizedEmployeeId.length > 256 || typeof pin !== "string" || !pin || utf8ByteLength(pin) > 128) {
      return validationFailure("A valid employee id and PIN are required");
    }
    const result = await requestJson({
      url: employeeSessionUrl,
      method: "POST",
      body: { employeeId: normalizedEmployeeId, pin },
      signal,
      operation: "Employee session creation",
    });
    if (!result.ok) return result;
    const session = normalizeSessionPayload(result.payload);
    return session?.authenticated ? session : protocolFailure("Employee session creation returned an invalid payload", result.response.status);
  }

  async function deleteEmployeeSession({ signal } = {}) {
    const result = await requestJson({ url: employeeSessionUrl, method: "DELETE", signal, operation: "Employee session deletion" });
    if (!result.ok) return result;
    return normalizeSessionPayload(result.payload, { requireUnauthenticated: true })
      || protocolFailure("Employee session deletion returned an invalid payload", result.response.status);
  }

  async function getCapabilities({ signal } = {}) {
    const result = await requestJson({ url: nomenclatureCapabilitiesUrl, method: "GET", signal, operation: "Nomenclature capability read" });
    if (!result.ok) return result;
    return normalizeCapabilitiesPayload(result.payload)
      || protocolFailure("Nomenclature capability read returned an invalid payload", result.response.status);
  }

  async function command(kind, input = {}) {
    const validated = validateCommandInput(kind, input);
    if (!validated.ok) return validated;
    const path = kind === "create"
      ? nomenclatureCommandsUrl
      : `${nomenclatureCommandsUrl}/${encodeURIComponent(validated.itemId)}`;
    const body = kind === "create"
      ? { expectedRevision: validated.expectedRevision, row: validated.row }
      : kind === "update"
        ? { expectedRevision: validated.expectedRevision, row: validated.row, expectedRow: validated.expectedRow }
        : { expectedRevision: validated.expectedRevision, expectedRow: validated.expectedRow };
    const result = await requestJson({
      url: path,
      method: kind === "create" ? "POST" : kind === "update" ? "PATCH" : "DELETE",
      body,
      headers: {
        "If-Match": `"${validated.expectedRevision}"`,
        "Idempotency-Key": validated.idempotencyKey,
      },
      signal: input.signal,
      operation: `Nomenclature ${kind}`,
    });
    if (!result.ok) return result;
    const normalized = normalizeCommandSuccess(result.response, result.payload, { kind, itemId: validated.itemId });
    return normalized || protocolFailure(`Nomenclature ${kind} returned an invalid authoritative projection`, result.response.status);
  }

  return Object.freeze({
    getEmployeeSession,
    createEmployeeSession,
    deleteEmployeeSession,
    getCapabilities,
    createNomenclature: (input) => command("create", input),
    updateNomenclature: (input) => command("update", input),
    deleteNomenclature: (input) => command("delete", input),
  });
}
