import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getAuthorizedAdminPrincipal } from "./admin-auth-guard.mjs";

const defaultProjectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const maxBodyBytes = 8 * 1024;
const maxOutputBytes = 64 * 1024;
const commandTimeoutMs = 120 * 1000;

function defineServerAction(action) {
  return Object.freeze({
    ...action,
    ...(action.args ? { args: Object.freeze([...action.args]) } : {}),
    ...(action.env ? { env: Object.freeze({ ...action.env }) } : {}),
  });
}

export const CONTOUR_ADMIN_SERVER_ACTIONS = Object.freeze({
  "backup-stage-shared-state": defineServerAction({
    label: "Сделать backup stage shared-state",
    args: ["scripts/backup-shared-state.mjs", "--reason=contour-admin-stage-backup", "--actor=contour-admin"],
    env: {
      APP_ENV: "staging",
      MES_SHARED_STATE_DIR: "/srv/mes/dev/shared-state",
      MES_SHARED_STATE_KEY: "mes-dev-shared-state-v1",
      MES_BACKUP_DIR: "/srv/mes/dev/backups",
      MES_AUDIT_LOG_PATH: "/srv/mes/dev/audit/audit.log",
    },
  }),
  "sync-stage-to-pilot": defineServerAction({
    label: "Забрать БД из stage в pilot",
    args: ["scripts/sync-shared-state-contours.mjs", "--from=staging", "--to=pilot", "--actor=contour-admin", "--reason=stage-to-pilot-sync"],
    confirm: "sync-stage-to-pilot",
  }),
  "request-deploy-to-pilot": defineServerAction({
    label: "Создать заявку на deploy в Pilot",
    kind: "durable-request",
  }),
  "dry-promote-pilot-to-stage": defineServerAction({
    label: "Проверить промоут pilot -> stage",
    args: ["scripts/promote-contour.mjs", "--action=promote", "--from=pilot", "--to=staging", "--module=contourAdmin", "--remote=local", "--dry-run"],
  }),
  "promote-pilot-to-stage": defineServerAction({
    label: "Перенести проверенный pilot в stage",
    args: ["scripts/promote-contour.mjs", "--action=promote", "--from=pilot", "--to=staging", "--module=contourAdmin", "--remote=local"],
    confirm: "promote-pilot-to-stage",
  }),
  "rollback-stage-dry-run": defineServerAction({
    label: "Проверить откат stage",
    args: ["scripts/promote-contour.mjs", "--action=rollback", "--to=staging", "--module=contourAdmin", "--remote=local", "--dry-run"],
  }),
});

export const CONTOUR_ADMIN_SERVER_ACTION_IDS = Object.freeze(
  Object.keys(CONTOUR_ADMIN_SERVER_ACTIONS).sort(),
);

export async function createContourAdminDeployRequest({
  auditLogPath = "",
  actor = "",
  now = new Date(),
  requestId = randomUUID(),
} = {}) {
  const normalizedPath = String(auditLogPath || "").trim();
  const normalizedActor = String(actor || "").trim();
  if (!normalizedPath || !normalizedActor) {
    const error = new Error("Contour Admin deploy request audit is unavailable");
    error.code = "MES_CONTOUR_ADMIN_AUDIT_UNAVAILABLE";
    throw error;
  }

  const event = {
    createdAt: now.toISOString(),
    action: "contour-admin:deploy-to-pilot-request",
    status: "requested",
    requestId: String(requestId),
    actor: normalizedActor,
    source: "git-main",
    target: "pilot",
    deployExecuted: false,
  };
  try {
    await mkdir(dirname(normalizedPath), { recursive: true, mode: 0o700 });
    let auditFileCreated = false;
    let handle;
    try {
      handle = await open(normalizedPath, "ax", 0o600);
      auditFileCreated = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      handle = await open(normalizedPath, "a", 0o600);
    }
    try {
      await handle.write(`${JSON.stringify(event)}\n`, null, "utf-8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (auditFileCreated) {
      const directoryHandle = await open(dirname(normalizedPath), "r");
      try { await directoryHandle.sync(); }
      finally { await directoryHandle.close(); }
    }
  } catch (cause) {
    const error = new Error("Contour Admin deploy request audit is unavailable", { cause });
    error.code = "MES_CONTOUR_ADMIN_AUDIT_UNAVAILABLE";
    throw error;
  }
  return event;
}

function writeJson(res, status, payload, headers) {
  res.writeHead(status, headers("application/json; charset=utf-8"));
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function getRequestHeader(req, name) {
  const normalized = String(name || "").toLowerCase();
  const direct = req?.headers?.[normalized];
  if (direct !== undefined) return direct;
  return Object.entries(req?.headers || {}).find(([key]) => String(key).toLowerCase() === normalized)?.[1];
}

function isLoopbackAddress(value) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(String(value || "").trim().toLowerCase());
}

function expectedContourAdminOrigin(req, { testOnlyExpectedOrigin = "" } = {}) {
  if (testOnlyExpectedOrigin) {
    if (!isLoopbackAddress(req?.socket?.remoteAddress)) return "";
    try {
      const expected = new URL(String(testOnlyExpectedOrigin));
      if (expected.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(expected.hostname.toLowerCase())) return "";
      return expected.origin;
    } catch {
      return "";
    }
  }

  const requestHost = String(getRequestHeader(req, "host") || "").trim().toLowerCase();
  if (!requestHost) return "";
  try {
    const expected = new URL(`https://${requestHost}`);
    return expected.username || expected.password ? "" : expected.origin;
  } catch {
    return "";
  }
}

export function inspectContourAdminMutationRequest(req, testOnlyOptions = {}) {
  const contentType = String(getRequestHeader(req, "content-type") || "").trim().toLowerCase();
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    return { ok: false, statusCode: 415, code: "json-content-type-required", error: "Contour Admin actions require application/json" };
  }
  if (String(getRequestHeader(req, "sec-fetch-site") || "").trim().toLowerCase() !== "same-origin") {
    return { ok: false, statusCode: 403, code: "same-origin-required", error: "Contour Admin actions require a same-origin browser request" };
  }
  const expectedOrigin = expectedContourAdminOrigin(req, testOnlyOptions);
  const requestOrigin = String(getRequestHeader(req, "origin") || "").trim();
  if (!expectedOrigin || requestOrigin !== expectedOrigin) {
    return { ok: false, statusCode: 403, code: "same-origin-required", error: "Contour Admin actions require the exact admin origin" };
  }
  try {
    if (new URL(requestOrigin).origin !== requestOrigin) throw new Error("non-canonical origin");
  } catch {
    return { ok: false, statusCode: 403, code: "same-origin-required", error: "Contour Admin actions require the exact admin origin" };
  }
  return { ok: true, expectedOrigin };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf-8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function clipOutput(value = "") {
  const text = String(value || "");
  if (Buffer.byteLength(text) <= maxOutputBytes) return text;
  return `${text.slice(0, maxOutputBytes)}\n[output clipped]`;
}

function runAdminCommand(action, projectRoot) {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, action.args, {
      cwd: projectRoot,
      env: { ...process.env, ...(action.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, commandTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      stdout = clipOutput(stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      stderr = clipOutput(stderr);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : code,
        timedOut,
        durationMs: performance.now() - startedAt,
        stdout: clipOutput(stdout),
        stderr: clipOutput(stderr),
      });
    });
  });
}

export async function handleContourAdminActionRequest(req, res, url, options = {}) {
  const headers = options.headers;
  const projectRoot = options.projectRoot || defaultProjectRoot;
  const env = options.env || process.env;
  const runCommand = options.runCommand || runAdminCommand;
  if (!headers) throw new Error("headers callback is required");
  if (url.pathname !== "/api/contour-admin/action") return false;

  const principal = getAuthorizedAdminPrincipal(req, env);
  if (!principal || principal.role !== "contour-admin") {
    writeJson(res, 404, { ok: false, error: "Not Found" }, headers);
    return true;
  }

  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "Method Not Allowed" }, headers);
    return true;
  }

  const mutationRequest = inspectContourAdminMutationRequest(req, options.testOnlyRequestSecurity);
  if (!mutationRequest.ok) {
    writeJson(res, mutationRequest.statusCode, {
      ok: false,
      code: mutationRequest.code,
      error: mutationRequest.error,
    }, headers);
    return true;
  }

  try {
    const payload = await readJsonBody(req);
    const actionId = String(payload.action || "").trim();
    const action = CONTOUR_ADMIN_SERVER_ACTIONS[actionId];
    if (!action) {
      writeJson(res, 400, { ok: false, error: "Unknown contour admin action" }, headers);
      return true;
    }
    if (action.confirm && payload.confirm !== action.confirm) {
      writeJson(res, 409, { ok: false, error: "Confirmation token is required" }, headers);
      return true;
    }

    if (action.kind === "durable-request") {
      const request = await createContourAdminDeployRequest({
        auditLogPath: options.auditLogPath,
        actor: principal.id,
      });
      writeJson(res, 202, {
        ok: true,
        action: actionId,
        label: action.label,
        status: request.status,
        requestId: request.requestId,
        message: `Заявка ${request.requestId} записана в audit. Deploy не запускался.`,
      }, headers);
      return true;
    }

    const result = await runCommand(action, projectRoot);
    writeJson(res, result.code === 0 ? 200 : 500, {
      ok: result.code === 0,
      action: actionId,
      label: action.label,
      code: result.code,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    }, headers);
    return true;
  } catch (error) {
    const auditUnavailable = error?.code === "MES_CONTOUR_ADMIN_AUDIT_UNAVAILABLE";
    writeJson(res, auditUnavailable ? 503 : 400, {
      ok: false,
      error: auditUnavailable ? "Deploy request audit is unavailable" : error?.message || "Contour admin action failed",
    }, headers);
    return true;
  }
}
