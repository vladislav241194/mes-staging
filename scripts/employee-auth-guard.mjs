import { createEmployeeAuthRepository } from "./domain-employee-auth-repository.mjs";
import { signEmployeeSessionPayload, verifyEmployeeSessionToken } from "./employee-auth-crypto.mjs";
import { getPublicAuthPrincipal } from "./public-auth-guard.mjs";

export const EMPLOYEE_AUTH_COOKIE = "__Host-mes_employee_session";
const DEFAULT_EMPLOYEE_SESSION_TTL_SECONDS = 8 * 60 * 60;

function normalizeHost(req) {
  const rawHost = String(req?.headers?.host || "").trim().toLowerCase();
  if (rawHost.startsWith("[")) {
    const endIndex = rawHost.indexOf("]");
    return endIndex >= 0 ? rawHost.slice(0, endIndex + 1) : rawHost;
  }
  return rawHost.split(":")[0];
}

function configuredHosts(env = process.env) {
  return new Set(
    String(env.MES_EMPLOYEE_AUTH_HOSTS || env.MES_PUBLIC_AUTH_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmployeeAuthHost(req, env = process.env) {
  return configuredHosts(env).has(normalizeHost(req));
}

function sessionSecret(env = process.env) {
  return String(env.MES_EMPLOYEE_AUTH_SESSION_SECRET || "").trim();
}

function sessionTtlSeconds(env = process.env) {
  const configured = Number(env.MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS || DEFAULT_EMPLOYEE_SESSION_TTL_SECONDS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_EMPLOYEE_SESSION_TTL_SECONDS;
}

function nowSeconds(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  return Math.floor(value.getTime() / 1000);
}

function parseCookies(req) {
  const entries = String(req?.headers?.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      const key = index < 0 ? part : part.slice(0, index);
      const rawValue = index < 0 ? "" : part.slice(index + 1);
      try {
        return [key, decodeURIComponent(rawValue)];
      } catch {
        return [key, ""];
      }
    });
  return Object.fromEntries(entries);
}

function resolveNow(now) {
  const value = typeof now === "function" ? now() : now;
  const candidate = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(candidate.getTime()) ? candidate : new Date();
}

function databaseUrl(env = process.env) {
  return String(env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "").trim();
}

export function createEmployeeSessionCookie({ employeeId, authVersion, publicPrincipalId }, env = process.env, now = new Date()) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("MES_EMPLOYEE_AUTH_SESSION_SECRET is required");
  const normalizedEmployeeId = String(employeeId ?? "").trim();
  const normalizedPublicPrincipalId = String(publicPrincipalId ?? "").trim();
  const normalizedAuthVersion = Number(authVersion);
  if (!normalizedEmployeeId || !normalizedPublicPrincipalId || !Number.isInteger(normalizedAuthVersion) || normalizedAuthVersion <= 0) {
    throw new TypeError("A valid employee id, public principal and auth version are required");
  }
  const issuedAt = nowSeconds(now);
  const ttl = sessionTtlSeconds(env);
  const token = signEmployeeSessionPayload({
    employeeId: normalizedEmployeeId,
    publicPrincipalId: normalizedPublicPrincipalId,
    authVersion: normalizedAuthVersion,
    scope: "employee",
    iat: issuedAt,
    exp: issuedAt + ttl,
  }, secret);
  return `${EMPLOYEE_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Strict`;
}

export function createClearEmployeeSessionCookie() {
  return `${EMPLOYEE_AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function inspectEmployeeAuthSession(req, env = process.env, {
  repositoryFactory = createEmployeeAuthRepository,
  now = () => new Date(),
} = {}) {
  if (!isEmployeeAuthHost(req, env)) return { principal: null, reason: "employee-auth-host-disabled" };
  const publicPrincipal = getPublicAuthPrincipal(req, env);
  if (!publicPrincipal) return { principal: null, reason: "public-session-required" };
  const secret = sessionSecret(env);
  if (!secret) return { principal: null, reason: "employee-auth-not-configured" };

  const token = parseCookies(req)[EMPLOYEE_AUTH_COOKIE];
  if (!token) return { principal: null, reason: "employee-session-missing", publicPrincipal };
  const payload = verifyEmployeeSessionToken(token, secret);
  if (!payload) return { principal: null, reason: "employee-session-tampered", publicPrincipal };

  const at = resolveNow(now);
  const currentSeconds = nowSeconds(at);
  const issuedAt = Number(payload.iat);
  const expiresAt = Number(payload.exp);
  const authVersion = Number(payload.authVersion);
  const employeeId = String(payload.employeeId ?? "").trim();
  if (
    payload.scope !== "employee"
    || !employeeId
    || !Number.isInteger(authVersion)
    || authVersion <= 0
    || !Number.isInteger(issuedAt)
    || !Number.isInteger(expiresAt)
    || issuedAt > currentSeconds + 60
    || expiresAt <= currentSeconds
    || expiresAt <= issuedAt
  ) {
    return { principal: null, reason: expiresAt <= currentSeconds ? "employee-session-expired" : "employee-session-invalid", publicPrincipal };
  }
  if (String(payload.publicPrincipalId ?? "") !== publicPrincipal.id) {
    return { principal: null, reason: "public-principal-mismatch", publicPrincipal };
  }

  const url = databaseUrl(env);
  if (!url) return { principal: null, reason: "employee-auth-storage-not-configured", publicPrincipal };
  let repository;
  try {
    repository = repositoryFactory({ databaseUrl: url });
    const inspected = await repository.inspectSession({ employeeId, authVersion });
    if (!inspected?.valid) {
      return { principal: null, reason: inspected?.reason || "employee-session-rejected", publicPrincipal };
    }
    const principal = Object.freeze({
      id: `employee:${inspected.employeeId}`,
      employeeId: inspected.employeeId,
      displayName: inspected.displayName || "",
      personnelNumber: inspected.personnelNumber || "",
      publicPrincipalId: publicPrincipal.id,
      scope: "employee",
    });
    return { principal, reason: "authenticated", publicPrincipal, authVersion };
  } catch {
    return { principal: null, reason: "employee-auth-storage-unavailable", publicPrincipal };
  } finally {
    await repository?.close?.();
  }
}

export async function getEmployeeAuthPrincipal(req, env = process.env, options = {}) {
  return (await inspectEmployeeAuthSession(req, env, options)).principal;
}
