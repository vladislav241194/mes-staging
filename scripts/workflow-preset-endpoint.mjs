import { writeFile } from "node:fs/promises";
import {
  isDestructiveActionsAllowed,
  isProtectedAppEnv,
} from "./shared-state-storage.mjs";

const MAX_PRESET_BODY_BYTES = 12 * 1024 * 1024;
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function readRequestBody(req, limitBytes = MAX_PRESET_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res, headers, statusCode, payload) {
  res.writeHead(statusCode, headers(JSON_CONTENT_TYPE));
  res.end(JSON.stringify(payload));
}

export async function saveWorkflowPreset(req, res, { targetPaths, headers, env = process.env }) {
  try {
    const raw = await readRequestBody(req);
    const preset = JSON.parse(raw || "{}");

    if (!preset?.values || typeof preset.values !== "object") {
      sendJson(res, headers, 400, { ok: false, error: "Invalid preset payload" });
      return;
    }

    if (preset.source !== "sidebar-button") {
      sendJson(res, headers, 403, { ok: false, error: "Manual preset save is required" });
      return;
    }

    if (isProtectedAppEnv(env) && !isDestructiveActionsAllowed(env)) {
      sendJson(res, headers, 403, {
        ok: false,
        error: "Workflow preset save is disabled for this environment",
      });
      return;
    }

    const body = `${JSON.stringify({
      ...preset,
      savedAt: new Date().toISOString(),
    }, null, 2)}\n`;

    await Promise.all(targetPaths.map((targetPath) => writeFile(targetPath, body, "utf-8")));
    sendJson(res, headers, 200, { ok: true });
  } catch (error) {
    sendJson(res, headers, 500, { ok: false, error: error?.message || "Cannot save preset" });
  }
}
