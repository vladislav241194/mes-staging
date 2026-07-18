import { readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

export const INTERNAL_SHIFT_EXECUTION_E2E_PATH = "/api/internal/qa/shift-execution-http-e2e";
export const INTERNAL_SHIFT_EXECUTION_E2E_ACTION = "verify-shift-execution-http-e2e";
const TRIGGER_FILE = ".shift-execution-http-e2e.json";
const RUNNING_FILE = ".shift-execution-http-e2e.running.json";
const MAX_BODY_BYTES = 4 * 1024;
const MAX_TRIGGER_LIFETIME_MS = 5 * 60 * 1000;
let e2eRunActive = false;

function normalizeHost(req) {
  const rawHost = String(req?.headers?.host || "").trim().toLowerCase();
  if (rawHost.startsWith("[")) {
    const endIndex = rawHost.indexOf("]");
    return endIndex >= 0 ? rawHost.slice(0, endIndex + 1) : rawHost;
  }
  return rawHost.split(":")[0];
}

function isLoopbackAddress(value = "") {
  const address = String(value || "").trim().toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function writeJson(res, statusCode, payload, headers) {
  res.writeHead(statusCode, headers("application/json; charset=utf-8"));
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.code = "MES_INTERNAL_QA_BODY_TOO_LARGE";
      throw error;
    }
  }
  return JSON.parse(body || "{}");
}

function isValidNonce(value) {
  return /^[a-f0-9]{32,128}$/i.test(String(value || ""));
}

function validateTrigger(trigger, requestNonce, nowMs) {
  if (!trigger || typeof trigger !== "object") return false;
  if (trigger.version !== 1 || trigger.action !== INTERNAL_SHIFT_EXECUTION_E2E_ACTION) return false;
  if (!isValidNonce(trigger.nonce) || trigger.nonce !== requestNonce) return false;
  const createdAt = Date.parse(String(trigger.createdAt || ""));
  const expiresAt = Date.parse(String(trigger.expiresAt || ""));
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return false;
  if (createdAt > nowMs + 30_000 || expiresAt <= nowMs) return false;
  if (expiresAt <= createdAt || expiresAt - createdAt > MAX_TRIGGER_LIFETIME_MS) return false;
  return true;
}

async function defaultRunVerification() {
  const { verifyShiftExecutionHttpE2e } = await import("../ops/postgres/verify-shift-execution-http-e2e.mjs");
  return verifyShiftExecutionHttpE2e({ env: process.env, allowEnvFileFallback: false });
}

export async function handleInternalShiftExecutionE2eRequest(req, res, url, {
  sharedStateFile,
  headers,
  now = () => Date.now(),
  runVerification = defaultRunVerification,
} = {}) {
  if (url.pathname !== INTERNAL_SHIFT_EXECUTION_E2E_PATH) return false;

  if (normalizeHost(req) !== "mes-internal" || !isLoopbackAddress(req?.socket?.remoteAddress)) {
    writeJson(res, 404, { error: "Not found" }, headers);
    return true;
  }
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "Method not allowed" }, headers);
    return true;
  }
  if (!sharedStateFile) {
    writeJson(res, 503, { ok: false, error: "Internal QA is unavailable" }, headers);
    return true;
  }

  let requestBody;
  try {
    requestBody = await readJsonBody(req);
  } catch {
    writeJson(res, 400, { ok: false, error: "Invalid request" }, headers);
    return true;
  }
  const requestNonce = String(requestBody?.nonce || "");
  if (!isValidNonce(requestNonce)) {
    writeJson(res, 400, { ok: false, error: "Invalid request" }, headers);
    return true;
  }

  const stateDir = dirname(sharedStateFile);
  const triggerPath = join(stateDir, TRIGGER_FILE);
  const runningPath = join(stateDir, RUNNING_FILE);
  let consumed = false;
  if (e2eRunActive) {
    writeJson(res, 409, { ok: false, error: "Internal QA is already running" }, headers);
    return true;
  }
  e2eRunActive = true;
  try {
    await rename(triggerPath, runningPath);
    consumed = true;
    const triggerStat = await stat(runningPath);
    if (!triggerStat.isFile() || (Number(triggerStat.mode) & 0o007) !== 0) {
      writeJson(res, 403, { ok: false, error: "Internal QA trigger rejected" }, headers);
      return true;
    }
    const trigger = JSON.parse(await readFile(runningPath, "utf8"));
    if (!validateTrigger(trigger, requestNonce, now())) {
      writeJson(res, 403, { ok: false, error: "Internal QA trigger rejected" }, headers);
      return true;
    }

    const result = await runVerification();
    writeJson(res, 200, {
      ok: result?.ok === true,
      httpBoundary: result?.httpBoundary === true,
      steps: result?.steps || {},
      cleanup: "completed",
    }, headers);
    return true;
  } catch (error) {
    const statusCode = error?.code === "ENOENT" ? 403 : error?.code === "EEXIST" ? 409 : 500;
    writeJson(res, statusCode, {
      ok: false,
      error: statusCode === 403
        ? "Internal QA trigger is absent"
        : statusCode === 409
          ? "Internal QA is already running"
          : "Shift execution HTTP E2E failed",
    }, headers);
    return true;
  } finally {
    if (consumed) await rm(runningPath, { force: true }).catch(() => {});
    e2eRunActive = false;
  }
}
