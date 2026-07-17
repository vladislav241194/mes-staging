import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { isAuthorizedAdminRequest } from "./admin-auth-guard.mjs";

const defaultProjectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const maxBodyBytes = 8 * 1024;
const maxOutputBytes = 64 * 1024;
const commandTimeoutMs = 120 * 1000;

const ACTIONS = {
  "backup-stage-shared-state": {
    label: "Сделать backup stage shared-state",
    args: ["scripts/backup-shared-state.mjs", "--reason=contour-admin-stage-backup", "--actor=contour-admin"],
    env: {
      APP_ENV: "staging",
      MES_SHARED_STATE_DIR: "/srv/mes/dev/shared-state",
      MES_SHARED_STATE_KEY: "mes-dev-shared-state-v1",
      MES_BACKUP_DIR: "/srv/mes/dev/backups",
      MES_AUDIT_LOG_PATH: "/srv/mes/dev/audit/audit.log",
    },
  },
  "sync-stage-to-pilot": {
    label: "Забрать БД из stage в pilot",
    args: ["scripts/sync-shared-state-contours.mjs", "--from=staging", "--to=pilot", "--actor=contour-admin", "--reason=stage-to-pilot-sync"],
    confirm: "sync-stage-to-pilot",
  },
  "dry-promote-pilot-to-stage": {
    label: "Проверить промоут pilot -> stage",
    args: ["scripts/promote-contour.mjs", "--action=promote", "--from=pilot", "--to=staging", "--module=contourAdmin", "--remote=local", "--dry-run"],
  },
  "promote-pilot-to-stage": {
    label: "Перенести проверенный pilot в stage",
    args: ["scripts/promote-contour.mjs", "--action=promote", "--from=pilot", "--to=staging", "--module=contourAdmin", "--remote=local"],
    confirm: "promote-pilot-to-stage",
  },
  "rollback-stage-dry-run": {
    label: "Проверить откат stage",
    args: ["scripts/promote-contour.mjs", "--action=rollback", "--to=staging", "--module=contourAdmin", "--remote=local", "--dry-run"],
  },
};

function writeJson(res, status, payload, headers) {
  res.writeHead(status, headers("application/json; charset=utf-8"));
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
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
  if (!headers) throw new Error("headers callback is required");
  if (url.pathname !== "/api/contour-admin/action") return false;

  if (!isAuthorizedAdminRequest(req)) {
    writeJson(res, 404, { ok: false, error: "Not Found" }, headers);
    return true;
  }

  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "Method Not Allowed" }, headers);
    return true;
  }

  try {
    const payload = await readJsonBody(req);
    const actionId = String(payload.action || "").trim();
    const action = ACTIONS[actionId];
    if (!action) {
      writeJson(res, 400, { ok: false, error: "Unknown contour admin action" }, headers);
      return true;
    }
    if (action.confirm && payload.confirm !== action.confirm) {
      writeJson(res, 409, { ok: false, error: "Confirmation token is required" }, headers);
      return true;
    }

    const result = await runAdminCommand(action, projectRoot);
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
    writeJson(res, 400, {
      ok: false,
      error: error?.message || "Contour admin action failed",
    }, headers);
    return true;
  }
}
