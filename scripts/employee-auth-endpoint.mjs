import { createEmployeeAuthRepository } from "./domain-employee-auth-repository.mjs";
import {
  createClearEmployeeSessionCookie,
  createEmployeeSessionCookie,
  inspectEmployeeAuthSession,
  isEmployeeAuthHost,
} from "./employee-auth-guard.mjs";
import { getCurrentNomenclatureAuthorization } from "./nomenclature-command-authorization.mjs";
import { getPublicAuthPrincipal } from "./public-auth-guard.mjs";

const EMPLOYEE_SESSION_PATH = "/api/v1/auth/employee-session";
const NOMENCLATURE_CAPABILITIES_PATH = "/api/v1/nomenclature/capabilities";
const MAX_EMPLOYEE_LOGIN_BODY_BYTES = 8 * 1024;

function writeJson(res, statusCode, payload, headers, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...headers("application/json; charset=utf-8"),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function resolveNow(now) {
  const value = typeof now === "function" ? now() : now;
  const candidate = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(candidate.getTime()) ? candidate : new Date();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function databaseUrl(env) {
  return String(env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "").trim();
}

function commandsConfigured(env) {
  return String(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS || "").trim() === "1";
}

function employeeAuthConfigured(env) {
  const enabled = [env.MES_ENABLE_EMPLOYEE_AUTH, env.MES_EMPLOYEE_AUTH_ENABLED]
    .some((value) => String(value || "").trim() === "1");
  return enabled
    && Boolean(String(env.MES_EMPLOYEE_AUTH_SESSION_SECRET || "").trim())
    && Boolean(String(env.MES_EMPLOYEE_AUTH_HOSTS || env.MES_PUBLIC_AUTH_HOSTS || "").trim());
}

function isLoopbackAddress(value) {
  const address = String(value || "").trim().toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function isInternalOperatorReadinessRequest(req) {
  const host = String(req.headers?.host || "").trim().toLowerCase().split(":")[0];
  return host === "mes-internal" && isLoopbackAddress(req.socket?.remoteAddress);
}

function mutationOriginAllowed(req) {
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").trim().toLowerCase();
  if (fetchSite !== "same-origin") return false;
  const origin = String(req.headers?.origin || "").trim();
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === String(req.headers?.host || "").trim().toLowerCase();
  } catch {
    return false;
  }
}

function isEmployeeAuthInfrastructureReason(reason) {
  return [
    "employee-auth-not-configured",
    "employee-auth-storage-not-configured",
    "employee-auth-storage-unavailable",
  ].includes(String(reason || ""));
}

function isAuthorizationInfrastructureReason(reason) {
  return [
    "system-domains-storage-not-configured",
    "system-domains-unavailable",
    "system-domains-storage-unavailable",
  ].includes(String(reason || ""));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") {
    if (Buffer.byteLength(req.body, "utf-8") > MAX_EMPLOYEE_LOGIN_BODY_BYTES) throw new Error("body-too-large");
    return JSON.parse(req.body || "{}");
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_EMPLOYEE_LOGIN_BODY_BYTES) {
        reject(new Error("body-too-large"));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid-json-body");
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function unauthenticatedCapabilities(reason, configured = false) {
  return {
    ok: true,
    authenticated: false,
    actor: null,
    rbacRevision: 0,
    authorizationReason: reason,
    capabilities: {
      canViewNomenclature: false,
      canEditNomenclature: false,
      canCreateNomenclature: false,
      canDeleteNomenclature: false,
      serverCommandsConfigured: configured,
      serverCommandsEnabled: false,
    },
  };
}

export async function handleEmployeeAuthRequest(req, res, url, {
  headers,
  env = process.env,
  now = () => new Date(),
  employeeAuthRepositoryFactory = createEmployeeAuthRepository,
  domainsRepositoryFactory,
} = {}) {
  const isEmployeeSessionRoute = url.pathname === EMPLOYEE_SESSION_PATH;
  const isCapabilitiesRoute = url.pathname === NOMENCLATURE_CAPABILITIES_PATH;
  if (!isEmployeeSessionRoute && !isCapabilitiesRoute) return false;

  const internalOperatorReadiness = isCapabilitiesRoute && isInternalOperatorReadinessRequest(req);

  if (!isEmployeeAuthHost(req, env) && !internalOperatorReadiness) {
    writeJson(res, 404, { ok: false, error: "not-found" }, headers);
    return true;
  }

  if (internalOperatorReadiness) {
    if (req.method !== "GET") {
      writeJson(res, 405, { ok: false, error: "method-not-allowed" }, headers, { "Allow": "GET" });
      return true;
    }
    let repository;
    let schemaReady = false;
    let storageConfigured = Boolean(databaseUrl(env));
    try {
      if (storageConfigured) {
        repository = employeeAuthRepositoryFactory({ databaseUrl: databaseUrl(env) });
        schemaReady = (await repository.schemaStatus()).ready === true;
      }
    } catch {
      storageConfigured = false;
    } finally {
      await repository?.close?.();
    }
    const configured = commandsConfigured(env);
    writeJson(res, 200, {
      ...unauthenticatedCapabilities("employee-session-required", configured),
      operatorReadiness: true,
      employeeAuthConfigured: employeeAuthConfigured(env),
      employeeAuthStorageConfigured: storageConfigured,
      employeeAuthSchemaReady: schemaReady,
    }, headers);
    return true;
  }

  const publicPrincipal = getPublicAuthPrincipal(req, env);
  if (!publicPrincipal) {
    writeJson(res, 401, { ok: false, error: "public-session-required" }, headers);
    return true;
  }

  if (isCapabilitiesRoute) {
    if (req.method !== "GET") {
      writeJson(res, 405, { ok: false, error: "method-not-allowed" }, headers, { "Allow": "GET" });
      return true;
    }
    const configured = commandsConfigured(env);
    const session = await inspectEmployeeAuthSession(req, env, {
      repositoryFactory: employeeAuthRepositoryFactory,
      now,
    });
    if (!session.principal) {
      if (isEmployeeAuthInfrastructureReason(session.reason)) {
        writeJson(res, 503, { ok: false, error: session.reason }, headers);
        return true;
      }
      const shouldClear = !["employee-session-missing", "employee-auth-not-configured", "employee-auth-storage-not-configured"]
        .includes(session.reason);
      writeJson(
        res,
        200,
        unauthenticatedCapabilities(session.reason, configured),
        headers,
        shouldClear ? { "Set-Cookie": createClearEmployeeSessionCookie() } : {},
      );
      return true;
    }
    const authorization = await getCurrentNomenclatureAuthorization(session.principal, {
      databaseUrl: databaseUrl(env),
      ...(domainsRepositoryFactory ? { domainsRepositoryFactory } : {}),
      now,
    });
    if (isAuthorizationInfrastructureReason(authorization.reason)) {
      writeJson(res, 503, { ok: false, error: authorization.reason }, headers);
      return true;
    }
    const canView = Boolean(authorization.viewDecision?.allowed);
    const canEdit = Boolean(authorization.allowed);
    writeJson(res, 200, {
      ok: true,
      authenticated: true,
      actor: {
        id: session.principal.id,
        employeeId: session.principal.employeeId,
        displayName: session.principal.displayName,
        personnelNumber: session.principal.personnelNumber,
      },
      rbacRevision: authorization.revision,
      authorizationReason: authorization.reason,
      capabilities: {
        canViewNomenclature: canView,
        canEditNomenclature: canEdit,
        canCreateNomenclature: canEdit,
        canDeleteNomenclature: canEdit,
        serverCommandsConfigured: configured,
        serverCommandsEnabled: configured && canEdit,
      },
    }, headers);
    return true;
  }

  if (req.method === "GET") {
    const session = await inspectEmployeeAuthSession(req, env, {
      repositoryFactory: employeeAuthRepositoryFactory,
      now,
    });
    if (!session.principal && isEmployeeAuthInfrastructureReason(session.reason)) {
      writeJson(res, 503, { ok: false, error: session.reason }, headers);
      return true;
    }
    writeJson(res, 200, session.principal ? {
      ok: true,
      authenticated: true,
      actor: {
        id: session.principal.id,
        employeeId: session.principal.employeeId,
        displayName: session.principal.displayName,
        personnelNumber: session.principal.personnelNumber,
      },
    } : {
      ok: true,
      authenticated: false,
      reason: session.reason,
    }, headers, session.principal || session.reason === "employee-session-missing"
      ? {}
      : { "Set-Cookie": createClearEmployeeSessionCookie() });
    return true;
  }

  if (req.method === "DELETE") {
    if (!mutationOriginAllowed(req)) {
      writeJson(res, 403, { ok: false, error: "cross-site-request-rejected" }, headers);
      return true;
    }
    writeJson(res, 200, { ok: true, authenticated: false }, headers, {
      "Set-Cookie": createClearEmployeeSessionCookie(),
    });
    return true;
  }

  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "method-not-allowed" }, headers, { "Allow": "GET, POST, DELETE" });
    return true;
  }

  if (!mutationOriginAllowed(req)) {
    writeJson(res, 403, { ok: false, error: "cross-site-request-rejected" }, headers);
    return true;
  }
  if (!/^application\/json(?:\s*;|$)/.test(String(req.headers?.["content-type"] || "").trim().toLowerCase())) {
    writeJson(res, 415, { ok: false, error: "application-json-required" }, headers);
    return true;
  }
  const storageUrl = databaseUrl(env);
  if (!storageUrl || !String(env.MES_EMPLOYEE_AUTH_SESSION_SECRET || "").trim()) {
    writeJson(res, 503, { ok: false, error: "employee-auth-not-configured" }, headers);
    return true;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    writeJson(res, 400, { ok: false, error: "invalid-request" }, headers);
    return true;
  }
  const employeeId = String(payload.employeeId ?? "").trim();
  const pin = typeof payload.pin === "string" ? payload.pin : "";
  if (!employeeId || employeeId.length > 256 || !pin || Buffer.byteLength(pin, "utf-8") > 128) {
    writeJson(res, 401, { ok: false, error: "invalid-credentials" }, headers);
    return true;
  }

  let repository;
  try {
    repository = employeeAuthRepositoryFactory({ databaseUrl: storageUrl });
    const at = resolveNow(now);
    const result = await repository.authenticate({
      employeeId,
      pin,
      now: at,
      maxAttempts: positiveInteger(env.MES_EMPLOYEE_AUTH_MAX_ATTEMPTS, 5),
      lockSeconds: positiveInteger(env.MES_EMPLOYEE_AUTH_LOCK_SECONDS, 15 * 60),
    });
    if (!result?.ok) {
      const locked = result?.reason === "locked";
      const retrySeconds = result?.lockedUntil
        ? Math.max(1, Math.ceil((new Date(result.lockedUntil).getTime() - at.getTime()) / 1000))
        : positiveInteger(env.MES_EMPLOYEE_AUTH_LOCK_SECONDS, 15 * 60);
      writeJson(res, locked ? 429 : 401, {
        ok: false,
        error: locked ? "authentication-temporarily-locked" : "invalid-credentials",
      }, headers, locked ? { "Retry-After": String(retrySeconds) } : {});
      return true;
    }
    const cookie = createEmployeeSessionCookie({
      employeeId: result.employeeId,
      authVersion: result.authVersion,
      publicPrincipalId: publicPrincipal.id,
    }, env, at);
    writeJson(res, 200, {
      ok: true,
      authenticated: true,
      actor: {
        id: `employee:${result.employeeId}`,
        employeeId: result.employeeId,
        displayName: result.displayName || "",
        personnelNumber: result.personnelNumber || "",
      },
    }, headers, { "Set-Cookie": cookie });
    return true;
  } catch {
    writeJson(res, 503, { ok: false, error: "employee-auth-unavailable" }, headers);
    return true;
  } finally {
    await repository?.close?.();
  }
}
