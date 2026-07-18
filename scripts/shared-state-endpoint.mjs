import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import {
  appendSharedStateAudit,
  backupSharedStateFile,
  isDestructiveActionsAllowed,
  isProtectedAppEnv,
  isSharedStateActionDestructive,
  resolveSharedStateBackupDir,
  withSharedStateFileLock,
  writeSharedStateFileAtomic,
} from "./shared-state-storage.mjs";

const MAX_SHARED_STATE_BODY_BYTES = 20 * 1024 * 1024;
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const COMPRESSIBLE_RESPONSE_BYTES = 1024;
const DEFAULT_SHARED_STATE_KEY = "mes:staging:shared-state:v1";
const ALLOWED_VALUE_KEYS = new Set([
  "mes-planning-prototype-state-v2",
  "mes-planning-prototype-directories-v2",
  "mes-planning-prototype-directories-defaults-restored-v1",
  "mes-planning-prototype-system-domains-v1",
  "mes-planning-prototype-directories-deleted-entities-v1",
  "mes-planning-prototype-work-center-operations-seeded-v2",
  "mes-specifications-2-registry-v1",
]);
const ALLOWED_SHARED_UI_KEYS = new Set([
  "ganttDependencyRoutes",
  "productionStructureMatrixOverrides",
  "timesheetCellOverrides",
  "timesheetScheduleOverrides",
  "shiftMasterBoardLaneBySlot",
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
  "shiftMasterAssignmentMatrix",
  "accessRoleProfiles",
  "accessRoleAssignments",
]);

// Revision-only browser polls are intentionally small on the wire, but a file
// store used to parse the complete multi-megabyte snapshot for every poll just
// to discover that its version had not changed. Keep a process-local parsed
// value keyed by the file's stat fingerprint; an external write invalidates it
// naturally on the next read without creating a second source of truth.
const FILE_SNAPSHOT_CACHE = new Map();

function getFileFingerprint(fileStat) {
  // Size + mtime alone can survive an out-of-band restore.  Include the
  // platform file identity and ctime as well, so the process cache cannot
  // serve an older planning snapshot after an atomic replacement that keeps
  // the visible timestamp and byte size.
  return `${Number(fileStat?.dev || 0)}:${Number(fileStat?.ino || 0)}:${Number(fileStat?.size || 0)}:${Number(fileStat?.mtimeMs || 0)}:${Number(fileStat?.ctimeMs || 0)}`;
}

async function readFileSnapshot(filePath) {
  try {
    const fileStat = await stat(filePath);
    const fingerprint = getFileFingerprint(fileStat);
    const cached = FILE_SNAPSHOT_CACHE.get(filePath);
    if (cached?.fingerprint === fingerprint) return cached.snapshot;
    const raw = await readFile(filePath, "utf-8");
    const snapshot = parseSnapshot(raw) || createEmptySnapshot();
    FILE_SNAPSHOT_CACHE.set(filePath, { fingerprint, snapshot });
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT") {
      FILE_SNAPSHOT_CACHE.delete(filePath);
      return createEmptySnapshot();
    }
    throw error;
  }
}

async function writeFileSnapshot(filePath, snapshot) {
  await writeSharedStateFileAtomic(filePath, snapshot);
  const fileStat = await stat(filePath);
  FILE_SNAPSHOT_CACHE.set(filePath, {
    fingerprint: getFileFingerprint(fileStat),
    snapshot,
  });
}

function normalizeHeaders(headers, contentType = JSON_CONTENT_TYPE) {
  if (typeof headers === "function") return headers(contentType);
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

function sendJson(res, headers, statusCode, payload) {
  const responseHeaders = normalizeHeaders(headers);
  const serialized = Buffer.from(JSON.stringify(payload));
  const acceptsGzip = /\bgzip\b/i.test(String(res.__mesAcceptEncoding || ""));
  const useGzip = acceptsGzip && serialized.byteLength >= COMPRESSIBLE_RESPONSE_BYTES;
  const body = useGzip ? gzipSync(serialized) : serialized;
  const finalHeaders = useGzip
    ? {
      ...responseHeaders,
      "Content-Encoding": "gzip",
      "Vary": "Accept-Encoding",
      "Content-Length": String(body.byteLength),
    }
    : responseHeaders;
  if (typeof res.writeHead === "function") {
    res.writeHead(statusCode, finalHeaders);
    res.end(body);
    return;
  }

  Object.entries(finalHeaders).forEach(([key, value]) => res.setHeader?.(key, value));
  if (typeof res.status === "function" && typeof res.json === "function") {
    if (useGzip) {
      res.statusCode = statusCode;
      res.end?.(body);
      return;
    }
    res.status(statusCode).json(payload);
    return;
  }

  res.statusCode = statusCode;
  res.end?.(body);
}

function readStreamBody(req, limitBytes = MAX_SHARED_STATE_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body is too large"));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function readRequestBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return readStreamBody(req);
}

function getKvConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || "";
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  return {
    url,
    token,
    key: env.MES_SHARED_STATE_KEY || DEFAULT_SHARED_STATE_KEY,
  };
}

async function runKvCommand(config, command) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `KV request failed with status ${response.status}`);
  }
  return data.result;
}

function parseSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      updatedBy: parsed.updatedBy && typeof parsed.updatedBy === "object" ? parsed.updatedBy : null,
      values: parsed.values && typeof parsed.values === "object" ? parsed.values : null,
      sharedUi: parsed.sharedUi && typeof parsed.sharedUi === "object" ? parsed.sharedUi : {},
      events: Array.isArray(parsed.events) ? parsed.events.slice(0, 50) : [],
    };
  } catch {
    return null;
  }
}

function sanitizeValues(values, currentValues = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const entries = Object.entries(values)
    .filter(([key, value]) => ALLOWED_VALUE_KEYS.has(key) && (typeof value === "string" || value === null));
  const sanitized = Object.fromEntries(entries);
  ALLOWED_VALUE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) return;
    const currentValue = currentValues?.[key];
    if (typeof currentValue === "string" || currentValue === null) sanitized[key] = currentValue;
  });
  return sanitized;
}

function isAllowedSharedUiValue(key, value) {
  if (!ALLOWED_SHARED_UI_KEYS.has(key) || !value || typeof value !== "object") return false;
  if (key === "accessRoleProfiles") return Array.isArray(value);
  return !Array.isArray(value);
}

function sanitizeSharedUi(sharedUi, currentSharedUi = {}) {
  if (!sharedUi || typeof sharedUi !== "object" || Array.isArray(sharedUi)) {
    sharedUi = {};
  }
  // A server-owned domain can explicitly retire its compatibility projection.
  // Missing fields are still preserved for older clients, while an allowed
  // null is a narrow tombstone for just that field.
  const deletedKeys = new Set(
    Object.entries(sharedUi)
      .filter(([key, value]) => ALLOWED_SHARED_UI_KEYS.has(key) && value === null)
      .map(([key]) => key),
  );
  const entries = Object.entries(sharedUi)
    .filter(([key, value]) => isAllowedSharedUiValue(key, value));
  const sanitized = Object.fromEntries(entries);
  ALLOWED_SHARED_UI_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sanitized, key) || deletedKeys.has(key)) return;
    const currentValue = currentSharedUi?.[key];
    if (isAllowedSharedUiValue(key, currentValue)) sanitized[key] = currentValue;
  });
  return sanitized;
}

function createEmptySnapshot() {
  return {
    version: 0,
    updatedAt: "",
    updatedBy: null,
    values: null,
    sharedUi: {},
    events: [],
  };
}

function getRequestedValueKeys(headers = {}) {
  const raw = String(headers?.["x-mes-shared-state-keys"] || "").trim();
  if (!raw) return null;
  // A server-authoritative planning bootstrap still needs the shared revision
  // and UI metadata, but must not pull the legacy planning payload merely to
  // learn that revision.
  if (raw === "__none__") return [];
  const keys = [...new Set(raw.split(",").map((key) => key.trim()).filter((key) => ALLOWED_VALUE_KEYS.has(key)))];
  return keys.length ? keys : null;
}

function projectSnapshotValues(snapshot, requestedValueKeys = null) {
  if (!requestedValueKeys || !snapshot?.values) return snapshot;
  const allowed = new Set(requestedValueKeys);
  return {
    ...snapshot,
    values: Object.fromEntries(Object.entries(snapshot.values).filter(([key]) => allowed.has(key))),
  };
}

function createFileStore(filePath) {
  return {
    kind: "file",
    filePath,
    configured: Boolean(filePath),
    async read() {
      if (!filePath) return createEmptySnapshot();
      return readFileSnapshot(filePath);
    },
    async write(snapshot) {
      if (!filePath) throw new Error("Shared state file path is not configured");
      await writeFileSnapshot(filePath, snapshot);
    },
  };
}

function createKvStore(config) {
  return {
    kind: "kv",
    configured: Boolean(config),
    async read() {
      if (!config) return createEmptySnapshot();
      const raw = await runKvCommand(config, ["GET", config.key]);
      return parseSnapshot(raw) || createEmptySnapshot();
    },
    async write(snapshot) {
      if (!config) throw new Error("KV shared state is not configured");
      await runKvCommand(config, ["SET", config.key, JSON.stringify(snapshot)]);
    },
  };
}

function createStore({ env = process.env, filePath } = {}) {
  const kvConfig = getKvConfig(env);
  if (kvConfig) return createKvStore(kvConfig);
  return createFileStore(filePath);
}

// Transitional read port for domain APIs. New endpoints must consume this
// port instead of knowing whether the pilot currently uses a file or KV
// snapshot. A PostgreSQL repository can replace this implementation later
// without changing the HTTP contracts.
export async function readSharedStateSnapshot({ env = process.env, filePath = "" } = {}) {
  const store = createStore({ env, filePath });
  return {
    configured: store.configured,
    kind: store.kind,
    snapshot: await store.read(),
  };
}

export async function updateSharedStateSnapshot({ env = process.env, filePath = "", expectedVersion = null, update, beforeWrite = null } = {}) {
  const store = createStore({ env, filePath });
  if (!store.configured) return { ok: false, configured: false, snapshot: createEmptySnapshot() };
  const applyUpdate = async () => {
    const current = await store.read();
    if (expectedVersion !== null && Number(expectedVersion) !== Number(current.version || 0)) {
      return { ok: false, configured: true, conflict: true, snapshot: current };
    }
    const next = typeof update === "function" ? await update(current) : null;
    if (!next || typeof next !== "object") throw new Error("Shared-state domain update must return a snapshot");
    const snapshot = {
      ...current,
      ...next,
      version: Number(current.version || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    if (typeof beforeWrite === "function") await beforeWrite({ current, snapshot, store });
    await store.write(snapshot);
    return { ok: true, configured: true, snapshot };
  };
  return store.kind === "file"
    ? withSharedStateFileLock(store.filePath, applyUpdate)
    : applyUpdate();
}

function normalizeActor(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

function normalizeAction(value) {
  if (typeof value !== "string") return "snapshot";
  return value.trim().slice(0, 80) || "snapshot";
}

function parsePlanningState(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const state = JSON.parse(value);
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

function hasMeaningfulPlanningState(value) {
  const state = parsePlanningState(value);
  return Boolean(state?.routes?.length || state?.routeSteps?.length || state?.slots?.length);
}

function getMaxSpecifications2PlanningRevision(value) {
  const state = parsePlanningState(value);
  if (!state) return 0;
  return (state.routes || []).reduce((maxRevision, route) => {
    if (!route?.sourceSpecifications2EntryId) return maxRevision;
    return Math.max(
      maxRevision,
      Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0),
    );
  }, 0);
}

function buildClientSnapshot(current, payload) {
  const values = sanitizeValues(payload.values, current.values);
  if (!values || !values["mes-planning-prototype-state-v2"] || !values["mes-planning-prototype-directories-v2"]) {
    throw new Error("Invalid shared state payload");
  }

  const version = Number(current.version || 0) + 1;
  const updatedAt = new Date().toISOString();
  const updatedBy = {
    clientId: normalizeActor(payload.clientId),
    actor: normalizeActor(payload.actor),
  };
  const event = {
    version,
    createdAt: updatedAt,
    action: normalizeAction(payload.action),
    clientId: updatedBy.clientId,
    actor: updatedBy.actor,
  };

  return {
    version,
    updatedAt,
    updatedBy,
    values,
    sharedUi: sanitizeSharedUi(payload.sharedUi, current.sharedUi),
    events: [event, ...(current.events || [])].slice(0, 50),
  };
}

export async function handleSharedStateRequest(req, res, {
  headers,
  filePath,
  env = process.env,
  backupDir = "",
  auditLogPath = "",
} = {}) {
  // Keep the transport concern local to this endpoint: state semantics stay
  // byte-for-byte identical after the browser transparently decompresses it.
  // The marker is intentionally non-persistent and only used by sendJson.
  res.__mesAcceptEncoding = String(req.headers?.["accept-encoding"] || "");
  const store = createStore({ env, filePath });

  if (!store.configured) {
    sendJson(res, headers, 200, {
      ok: true,
      configured: false,
      message: "Shared state storage is not configured",
      ...createEmptySnapshot(),
    });
    return;
  }

  if (req.method === "GET") {
    const snapshot = await store.read();
    const knownVersion = Number(req.headers?.["x-mes-shared-state-version"] || 0);
    const requestedValueKeys = getRequestedValueKeys(req.headers);
    if (!requestedValueKeys && knownVersion > 0 && knownVersion === Number(snapshot.version || 0)) {
      sendJson(res, headers, 200, {
        ok: true,
        configured: true,
        unchanged: true,
        version: Number(snapshot.version || 0),
        updatedAt: snapshot.updatedAt || "",
      });
      return;
    }
    sendJson(res, headers, 200, { ok: true, configured: true, ...projectSnapshotValues(snapshot, requestedValueKeys) });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, headers, 405, { ok: false, configured: true, error: "Method is not allowed" });
    return;
  }

  try {
    const payload = JSON.parse(await readRequestBody(req) || "{}");
    const action = normalizeAction(payload.action);
    const destructiveAction = isSharedStateActionDestructive(action);

    if (isProtectedAppEnv(env) && destructiveAction && !isDestructiveActionsAllowed(env)) {
      await appendSharedStateAudit({
        auditLogPath,
        event: {
          action,
          status: "denied",
          reason: "destructive-action-disabled",
          appEnv: env.APP_ENV || env.MES_APP_ENV || "",
          clientId: normalizeActor(payload.clientId),
          actor: normalizeActor(payload.actor),
        },
      }).catch(() => {});
      sendJson(res, headers, 403, {
        ok: false,
        configured: true,
        destructiveAction: true,
        error: "Destructive shared-state action is disabled for this environment",
      });
      return;
    }

    const persistSharedState = async () => {
      const current = await store.read();
      const baseVersion = Number(payload.baseVersion);
      const currentVersion = Number(current.version || 0);

      if (!Number.isFinite(baseVersion) || baseVersion !== currentVersion) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          error: "Shared state version conflict",
          current,
        });
        return;
      }

      const planningKey = "mes-planning-prototype-state-v2";
      const incomingPlanning = payload.values?.[planningKey];
      if (!destructiveAction
        && hasMeaningfulPlanningState(current.values?.[planningKey])
        && typeof incomingPlanning === "string"
        && !hasMeaningfulPlanningState(incomingPlanning)) {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action,
            status: "denied",
            reason: "nonempty-planning-state-cannot-be-cleared",
            appEnv: env.APP_ENV || env.MES_APP_ENV || "",
            clientId: normalizeActor(payload.clientId),
            actor: normalizeActor(payload.actor),
          },
        }).catch(() => {});
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          error: "Non-empty planning state cannot be replaced by an empty snapshot",
          current,
        });
        return;
      }
      const currentSpecifications2Revision = getMaxSpecifications2PlanningRevision(current.values?.[planningKey]);
      const incomingSpecifications2Revision = getMaxSpecifications2PlanningRevision(incomingPlanning);
      if (!destructiveAction
        && incomingSpecifications2Revision > 0
        && incomingSpecifications2Revision < currentSpecifications2Revision) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          error: "An older Specifications 2.0 planning revision cannot replace a newer revision",
          current,
        });
        return;
      }

      const snapshot = buildClientSnapshot(current, payload);
      if (store.kind === "file" && store.filePath && (destructiveAction || env.MES_BACKUP_BEFORE_SHARED_STATE_WRITE === "true")) {
        await backupSharedStateFile({
          filePath: store.filePath,
          backupDir: backupDir || resolveSharedStateBackupDir({ sharedStateFile: store.filePath, env }),
          reason: destructiveAction ? `before-${action}` : "before-shared-state-write",
          actor: normalizeActor(payload.actor),
          env,
          allowMissing: true,
        });
      }
      await store.write(snapshot);
      await appendSharedStateAudit({
        auditLogPath,
        event: {
          action,
          status: "saved",
          destructiveAction,
          version: snapshot.version,
          clientId: normalizeActor(payload.clientId),
          actor: normalizeActor(payload.actor),
        },
      }).catch(() => {});
      sendJson(res, headers, 200, { ok: true, configured: true, ...snapshot });
    };
    if (store.kind === "file" && store.filePath) {
      await withSharedStateFileLock(store.filePath, persistSharedState);
    } else {
      await persistSharedState();
    }
  } catch (error) {
    sendJson(res, headers, 500, {
      ok: false,
      configured: true,
      error: error?.message || "Cannot update shared state",
    });
  }
}
