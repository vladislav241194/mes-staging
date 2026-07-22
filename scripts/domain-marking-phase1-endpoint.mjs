import {
  MARKING_PHASE1_LIMITS,
  MarkingPhase1ValidationError,
  normalizeMarkingPhase1Id,
} from "../src/domain/marking_phase1.js";
import {
  MarkingPhase1RepositoryError,
  createMarkingPhase1Repository,
  getMarkingPhase1RepositoryHttpStatus,
} from "./domain-marking-phase1-repository.mjs";

const BASE_PATH = "/api/v1/marking";
const MAX_BODY_BYTES = 64 * 1024;

export const MARKING_PHASE1_API_CONTRACT = Object.freeze({
  apiVersion: "v1",
  phase: "phase1",
  stateScope: "test-state",
  basePath: BASE_PATH,
  routes: Object.freeze({
    tasks: "GET /api/v1/marking/tasks",
    detail: "GET /api/v1/marking/tasks/:taskId",
    action: "POST /api/v1/marking/tasks/:taskId/actions",
    code: "GET /api/v1/marking/codes/:code",
  }),
  authorization: Object.freeze({ view: "view", edit: "edit", print: "print", failClosedWithoutCallback: true }),
  mutationHeaders: Object.freeze({ contentType: "application/json", idempotency: "Idempotency-Key" }),
});

function header(req, name) {
  const normalized = String(name || "").toLowerCase();
  const direct = req?.headers?.[normalized];
  if (direct !== undefined) return direct;
  return Object.entries(req?.headers || {}).find(([key]) => String(key).toLowerCase() === normalized)?.[1];
}

function responseHeaders(headers) {
  return typeof headers === "function"
    ? headers("application/json; charset=utf-8")
    : { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
}

function sendJson(res, statusCode, payload, headers = null) {
  const body = JSON.stringify(payload);
  if (typeof res.writeHead === "function") {
    res.writeHead(statusCode, responseHeaders(headers));
    res.end(body);
    return;
  }
  res.statusCode = statusCode;
  Object.entries(responseHeaders(headers)).forEach(([key, value]) => res.setHeader?.(key, value));
  res.end?.(body);
}

function sameOrigin(req, url) {
  const fetchSite = String(header(req, "sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = String(header(req, "origin") || "").trim();
  const host = String(header(req, "host") || "").trim().toLowerCase();
  if (!origin || !host) return false;
  // Pilot terminates HTTPS at the reverse proxy, while the Node preview
  // process receives an internal HTTP URL. The browser Host is therefore the
  // canonical same-origin boundary, matching the other MES command owners.
  try { return new URL(origin).host.toLowerCase() === host; }
  catch { return false; }
}

async function readJson(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new MarkingPhase1ValidationError("Marking command body is too large", "marking-body-too-large", 413);
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new MarkingPhase1ValidationError("Marking command body must contain valid JSON", "marking-json-invalid", 400); }
}

function decodePart(value, label) {
  try { return normalizeMarkingPhase1Id(decodeURIComponent(value), label); }
  catch (error) {
    if (error instanceof URIError) throw new MarkingPhase1ValidationError(`${label} is malformed`, "marking-path-invalid", 400);
    throw error;
  }
}

function matchRoute(method, pathname) {
  if (!String(pathname || "").startsWith(BASE_PATH)) return null;
  if (method === "GET" && pathname === `${BASE_PATH}/tasks`) return { kind: "tasks", authorizationAction: "view" };
  let match = pathname.match(/^\/api\/v1\/marking\/tasks\/([^/]+)$/);
  if (method === "GET" && match) return { kind: "task", taskId: decodePart(match[1], "taskId"), authorizationAction: "view" };
  match = pathname.match(/^\/api\/v1\/marking\/tasks\/([^/]+)\/actions$/);
  if (method === "POST" && match) return { kind: "action", taskId: decodePart(match[1], "taskId"), authorizationAction: "edit" };
  match = pathname.match(/^\/api\/v1\/marking\/codes\/([^/]+)$/);
  if (method === "GET" && match) return { kind: "code", codeValue: decodePart(match[1], "code"), authorizationAction: "view" };
  return { kind: "method-not-allowed", authorizationAction: "view" };
}

function normalizeAuthorization(result) {
  const principal = result?.principal && typeof result.principal === "object" ? result.principal : null;
  const principalId = String(principal?.id || "").trim();
  const employeeId = String(principal?.employeeId || (principalId.startsWith("employee:") ? principalId.slice(9) : "")).trim();
  if (result?.allowed !== true) {
    const statusCode = result?.infrastructureUnavailable === true ? 503 : principal ? 403 : 401;
    throw new MarkingPhase1RepositoryError("Current Marking authorization denied the request", result?.reason || "marking-authorization-denied", statusCode);
  }
  if (!principalId || !employeeId) {
    throw new MarkingPhase1RepositoryError("Authorized employee principal is incomplete", "marking-principal-invalid", 503);
  }
  return { actorId: principalId, actorEmployeeId: employeeId };
}

function actionAuthorization(action) {
  return new Set(["print", "print-batch", "create-print-batch", "print-remaining", "print-result", "confirm-print", "report-print-error", "print-error", "reprint"]).has(action)
    ? "print"
    : "edit";
}

async function executeAction(repository, route, payload, actor) {
  const action = String(payload?.action || "").trim().toLowerCase();
  const common = { ...payload, taskId: route.taskId, ...actor };
  if (action === "bootstrap") {
    return repository.bootstrapTask({ ...common, assignedEmployeeId: payload.assignedEmployeeId || actor.actorEmployeeId });
  }
  if (["configure", "configure-task"].includes(action)) {
    return repository.configureTask({ ...common, configuredKitCount: payload.configuredKitCount ?? payload.kitCount });
  }
  if (["add-kits", "create-kits"].includes(action)) return repository.addKits(common);
  if (["print", "print-batch", "create-print-batch", "print-remaining"].includes(action)) return repository.createPrintBatch(common);
  if (["print-result", "confirm-print", "report-print-error", "print-error"].includes(action)) {
    const result = action === "confirm-print" && payload.result === "error"
      ? "error"
      : action === "confirm-print" || payload.result === "success"
        ? "confirmed"
        : ["report-print-error", "print-error"].includes(action) ? "error" : payload.result;
    return repository.resolvePrintBatch({ ...common, result });
  }
  if (action === "reprint") return repository.reprint({
    ...common,
    scopeType: payload.scopeType || (payload.batchId ? "batch" : ""),
    targetId: payload.targetId || payload.batchId,
  });
  if (["complete", "complete-task"].includes(action)) return repository.completeTask(common);
  if (action === "transfer") return repository.transferTask({ ...common, nextWorkCenterId: payload.nextWorkCenterId || payload.nextArea });
  if (["cancel-transfer", "transfer-cancel"].includes(action)) return repository.cancelTransfer(common);
  throw new MarkingPhase1ValidationError("Unknown Marking Phase 1 action", "marking-action-unknown", 400);
}

function publicError(error) {
  const known = error instanceof MarkingPhase1ValidationError || error instanceof MarkingPhase1RepositoryError;
  return {
    statusCode: known ? getMarkingPhase1RepositoryHttpStatus(error) : 500,
    code: known ? String(error.code || "marking-command-failed") : "marking-internal-error",
    message: known ? String(error.message || "Marking request failed") : "Marking request failed safely",
    ...(Number.isInteger(error?.currentRevision) ? { currentRevision: error.currentRevision } : {}),
  };
}

export async function handleMarkingPhase1Request(req, res, url, {
  env = process.env,
  headers = null,
  getAuthorization = null,
  repositoryFactory = createMarkingPhase1Repository,
} = {}) {
  const route = matchRoute(String(req?.method || "GET").toUpperCase(), String(url?.pathname || ""));
  if (!route) return false;
  if (route.kind === "method-not-allowed") {
    sendJson(res, 405, { ok: false, apiVersion: "v1", phase: "phase1", stateScope: "test-state", code: "marking-method-not-allowed", error: "Method is not supported by Marking Phase 1" }, headers);
    return true;
  }
  if (typeof getAuthorization !== "function") {
    sendJson(res, 503, { ok: false, apiVersion: "v1", phase: "phase1", stateScope: "test-state", code: "marking-authorization-not-configured", error: "Marking authorization is not configured" }, headers);
    return true;
  }

  let payload = null;
  let authorizationAction = route.authorizationAction;
  try {
    if (route.kind === "action") {
      const contentType = String(header(req, "content-type") || "").toLowerCase();
      if (!/^application\/json(?:\s*;|$)/.test(contentType)) throw new MarkingPhase1ValidationError("Marking actions require application/json", "marking-json-content-type-required", 415);
      if (!sameOrigin(req, url)) throw new MarkingPhase1ValidationError("Marking actions require a same-origin browser request", "marking-same-origin-required", 403);
      payload = await readJson(req);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new MarkingPhase1ValidationError("Marking action body must be an object", "marking-json-object-required", 400);
      const requestId = String(payload.requestId || "").trim();
      const idempotencyKey = String(header(req, "idempotency-key") || "").trim();
      if (!idempotencyKey || idempotencyKey.length > MARKING_PHASE1_LIMITS.idempotencyKeyLength) throw new MarkingPhase1ValidationError("A bounded Idempotency-Key is required", "marking-idempotency-key-required", 400);
      if (requestId && requestId !== idempotencyKey) throw new MarkingPhase1ValidationError("requestId and Idempotency-Key must match", "marking-idempotency-key-mismatch", 400);
      payload = { ...payload, idempotencyKey };
      authorizationAction = actionAuthorization(String(payload.action || "").trim().toLowerCase());
    }
    const authorization = await getAuthorization({ req, url, action: authorizationAction, taskId: route.taskId || "", resource: "marking-phase1" });
    const actor = normalizeAuthorization(authorization);
    const repository = repositoryFactory({
      databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
    });
    try {
      const readiness = await repository.readiness();
      if (readiness?.ok !== true) throw new MarkingPhase1RepositoryError("Marking Phase 1 schema is not ready", "marking-schema-not-ready", 503);
      let result;
      if (route.kind === "tasks") {
        const rawLimit = url.searchParams.get("limit");
        result = await repository.listTasks({ ...actor, ...(rawLimit ? { limit: Number(rawLimit) } : {}) });
      } else if (route.kind === "task") {
        const rawLimit = url.searchParams.get("kitLimit");
        const rawOffset = url.searchParams.get("kitOffset");
        result = await repository.getTask({ ...actor, taskId: route.taskId, ...(rawLimit ? { kitLimit: Number(rawLimit) } : {}), ...(rawOffset ? { kitOffset: Number(rawOffset) } : {}) });
      } else if (route.kind === "code") {
        result = await repository.lookupCode({ ...actor, codeValue: route.codeValue });
      } else {
        result = await executeAction(repository, route, payload, actor);
      }
      sendJson(res, result?.created === true ? 201 : 200, { apiVersion: "v1", phase: "phase1", stateScope: "test-state", testData: true, ...result }, headers);
    } finally {
      await repository.close?.();
    }
  } catch (error) {
    const failure = publicError(error);
    sendJson(res, failure.statusCode, { ok: false, apiVersion: "v1", phase: "phase1", stateScope: "test-state", testData: true, code: failure.code, error: failure.message, ...(failure.currentRevision ? { currentRevision: failure.currentRevision } : {}) }, headers);
  }
  return true;
}
