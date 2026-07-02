import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const MAX_SHARED_STATE_BODY_BYTES = 20 * 1024 * 1024;
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const DEFAULT_SHARED_STATE_KEY = "mes:staging:shared-state:v1";
const ALLOWED_VALUE_KEYS = new Set([
  "mes-planning-prototype-state-v2",
  "mes-planning-prototype-directories-v2",
  "mes-planning-prototype-directories-defaults-restored-v1",
  "mes-planning-prototype-directories-deleted-entities-v1",
  "mes-planning-prototype-supply-control-v1",
  "mes-planning-prototype-work-center-operations-seeded-v2",
]);
const ALLOWED_SHARED_UI_KEYS = new Set([
  "shopMapWidgetLayouts",
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
  if (typeof res.writeHead === "function") {
    res.writeHead(statusCode, responseHeaders);
    res.end(JSON.stringify(payload));
    return;
  }

  Object.entries(responseHeaders).forEach(([key, value]) => res.setHeader?.(key, value));
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(payload);
    return;
  }

  res.statusCode = statusCode;
  res.end?.(JSON.stringify(payload));
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
  const entries = Object.entries(sharedUi)
    .filter(([key, value]) => isAllowedSharedUiValue(key, value));
  const sanitized = Object.fromEntries(entries);
  ALLOWED_SHARED_UI_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) return;
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

function createFileStore(filePath) {
  return {
    configured: Boolean(filePath),
    async read() {
      if (!filePath) return createEmptySnapshot();
      try {
        const raw = await readFile(filePath, "utf-8");
        return parseSnapshot(raw) || createEmptySnapshot();
      } catch (error) {
        if (error?.code === "ENOENT") return createEmptySnapshot();
        throw error;
      }
    },
    async write(snapshot) {
      if (!filePath) throw new Error("Shared state file path is not configured");
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
    },
  };
}

function createKvStore(config) {
  return {
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

function normalizeActor(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

function normalizeAction(value) {
  if (typeof value !== "string") return "snapshot";
  return value.trim().slice(0, 80) || "snapshot";
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

export async function handleSharedStateRequest(req, res, { headers, filePath, env = process.env } = {}) {
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
    sendJson(res, headers, 200, { ok: true, configured: true, ...snapshot });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, headers, 405, { ok: false, configured: true, error: "Method is not allowed" });
    return;
  }

  try {
    const current = await store.read();
    const payload = JSON.parse(await readRequestBody(req) || "{}");
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

    const snapshot = buildClientSnapshot(current, payload);
    await store.write(snapshot);
    sendJson(res, headers, 200, { ok: true, configured: true, ...snapshot });
  } catch (error) {
    sendJson(res, headers, 500, {
      ok: false,
      configured: true,
      error: error?.message || "Cannot update shared state",
    });
  }
}
