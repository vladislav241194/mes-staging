import { createWorkOrdersRepository } from "./domain-repositories.mjs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createShiftExecutionCommandRepository, createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";
import { inspectShiftExecutionAuthority } from "./domain-shift-execution-authority.mjs";
import { createSpecifications2PublishCommandRepository, createSpecifications2ReadRepository, createSpecifications2WorkOrderCommandRepository } from "./domain-specifications2-repository.mjs";
import { createSpecifications2AttachmentRepository } from "./domain-specifications2-attachment-repository.mjs";
import { SPECIFICATIONS2_ATTACHMENT_MAX_BYTES } from "../src/domain/specifications2_attachment.js";
import { createSpecifications2SnapshotRepository } from "./domain-specifications2-snapshot-repository.mjs";
import { syncPendingSpecifications2PublicationChanges } from "./domain-specifications2-snapshot-sync.mjs";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { inspectSystemDomainsSnapshotConsistency, syncPendingSystemDomainsSnapshotChanges } from "./domain-system-domains-snapshot-sync.mjs";
import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";
import { getPublicAuthPrincipal } from "./public-auth-guard.mjs";
import {
  isSpecifications2AuthorizationInfrastructureReason,
  resolveSpecifications2CommandAuthorization,
} from "./specifications2-command-authorization.mjs";
import {
  getCurrentShiftExecutionAuthorization,
  inspectShiftExecutionCommandSession,
  isShiftExecutionAuthorizationInfrastructureReason,
} from "./shift-execution-command-authorization.mjs";
import {
  isPlanningAuthorizationInfrastructureReason,
  resolvePlanningCommandAuthorization,
} from "./planning-command-authorization.mjs";
import {
  projectSystemDomainsProductionStructureAuthorization,
  resolveSystemDomainsProductionStructureAuthorization,
} from "./system-domains-command-authorization.mjs";
import { validateSystemDomainsProductionStructureImpact } from "./system-domains-production-structure-impact.mjs";
import { withProductionResourceDependencyExclusiveLock } from "./production-resource-dependency-lock.mjs";
import { isPlanningSnapshotObservationEnabled } from "./planning-snapshot-observer.mjs";
import { hasCurrentPlanningSnapshotObservationMarker } from "./planning-snapshot-observation-contract.mjs";
import { SYSTEM_DOMAIN_REGISTRY_NAMES, loadSystemDomains } from "../src/modules/system_domains/service.js";
import { isExactIsoCalendarDate } from "../src/domain/calendar_date.js";

const API_PREFIX = "/api/v1";
const SYSTEM_DOMAINS_COMMAND_SURFACES = new Set(["production-structure", "timesheet", "access-control"]);
const SYSTEM_DOMAINS_COMMAND_ACTOR_PATTERN = /^public:[^,\s]+$/;
const SYSTEM_DOMAINS_SURFACE_REGISTRIES = Object.freeze({
  "production-structure": new Set([
    "orgUnits", "workCenters", "positions", "employees", "employmentAssignments", "equipment", "scheduleTemplates", "responsibilityPolicies",
  ]),
  timesheet: new Set(["scheduleAssignments", "attendanceEvents"]),
  "access-control": new Set(["accessRoles", "grants", "roleAssignments"]),
});
const MAX_PLANNING_PERIOD_DAYS = 31;

export function getSpecifications2WorkOrderCommandHttpStatus(result = {}) {
  if (result.idempotencyConflict === true || result.conflict === true) return 409;
  if (!result.item) return 422;
  return result.created ? 201 : 200;
}
// Revision publication stores the complete compatibility command in the
// durable outbox. Bound the HTTP envelope before JSON parsing so a forged
// editor field cannot make the process buffer an arbitrarily large command.
const SPECIFICATIONS2_PUBLISH_BODY_MAX_BYTES = 2 * 1024 * 1024;
// The largest valid attachment is base64 encoded in JSON. Keep a small,
// explicit allowance for bounded metadata and JSON syntax, but never buffer an
// arbitrary request before the 1 MiB decoded-content validator runs.
export const SPECIFICATIONS2_ATTACHMENT_BODY_MAX_BYTES = Math.ceil(SPECIFICATIONS2_ATTACHMENT_MAX_BYTES / 3) * 4 + (4 * 1024);
export const SPECIFICATIONS2_WORK_ORDER_BODY_MAX_BYTES = 64 * 1024;
export const SHIFT_EXECUTION_COMMAND_BODY_MAX_BYTES = 64 * 1024;
export const PLANNING_COMMAND_BODY_MAX_BYTES = 64 * 1024;
const PLANNING_POSTGRES_PARITY_CACHE_TTL_MS = 10_000;
// Bump this whenever fields included in planning parity change.  A durable
// marker from an earlier contract must never be used to skip a newer proof.
// v5 makes the formerly implicit one-slot-per-operation choice stable. Any
// v4 marker was proved against an unordered split-slot result and therefore
// must trigger a fresh full proof before this runtime projection is trusted.
// v7 proves the canonical work-order planningStartDate field from the DATE
// owner itself. v6 exposed the field but did not include it in list parity,
// so a v6 marker must never admit this runtime or any Planning write.
const PLANNING_PROJECTION_PARITY_CONTRACT_VERSION = 7;
const PLANNING_POSTGRES_FALLBACK_REASON = "postgres-projection-stale";
// The established planning parity proof intentionally canonicalizes a route
// to one slot per operation. It cannot therefore authorize a physical-slot
// Gantt window: a PostgreSQL split slot could differ from the compatibility
// snapshot without changing that old proof. Keep snapshot authority for this
// new read model until a dedicated physical-slot parity marker is introduced.
const PLANNING_GANTT_WINDOW_FALLBACK_REASON = "postgres-gantt-window-physical-slots-unverified";
let planningPostgresParityCache = null;
// The complete Planning runtime graph is substantially more expensive than
// the compact list or detail reads.  Keep at most one verified PostgreSQL
// response in-process, but never treat it as a general HTTP cache: every use
// still checks the durable parity checkpoint before returning its bytes.  A
// compatibility-snapshot response is deliberately never admitted here.
let planningRuntimeProjectionCache = null;

function isSpecifications2RevisionPublicationPrimaryConfigured(env = process.env) {
  // This is rollout intent rather than a health probe. A primary-configured
  // client must fail closed while PostgreSQL or its schema is unavailable.
  return String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1";
}

function normalizeSpecifications2EmployeeActor(principal = null) {
  const employeeId = String(principal?.employeeId || "").trim();
  const id = String(principal?.id || "").trim();
  if (principal?.scope !== "employee" || !employeeId || id !== `employee:${employeeId}`) return null;
  return Object.freeze({
    id,
    employeeId,
    displayName: String(principal?.displayName || ""),
    personnelNumber: String(principal?.personnelNumber || ""),
    scope: "employee",
  });
}

function inspectSpecifications2CommandAuthorizationResult(authorization = null) {
  const reason = String(authorization?.reason || "specifications2-authorization-unavailable");
  const actor = normalizeSpecifications2EmployeeActor(authorization?.principal);
  const infrastructureUnavailable = authorization?.infrastructureUnavailable === true
    || isSpecifications2AuthorizationInfrastructureReason(reason)
    || (authorization?.allowed === true && !actor);
  return Object.freeze({
    allowed: authorization?.allowed === true && Boolean(actor) && !infrastructureUnavailable,
    actor,
    authenticated: Boolean(actor),
    reason: infrastructureUnavailable && authorization?.allowed === true
      ? "specifications2-authorization-invalid"
      : reason,
    revision: Number(authorization?.revision || 0),
    infrastructureUnavailable,
  });
}

function sendSpecifications2AuthorizationFailure(res, headers, authorization, actionLabel) {
  if (authorization.infrastructureUnavailable) {
    sendJson(res, headers, 503, {
      ok: false,
      apiVersion: "v1",
      code: "specifications2-authorization-unavailable",
      error: `Current Specifications 2.0 authorization is unavailable for ${actionLabel}`,
    });
    return;
  }
  if (!authorization.actor) {
    sendJson(res, headers, 401, {
      ok: false,
      apiVersion: "v1",
      code: "employee-session-required",
      error: `Authenticated employee session is required for ${actionLabel}`,
    });
    return;
  }
  sendJson(res, headers, 403, {
    ok: false,
    apiVersion: "v1",
    code: "specifications2-write-forbidden",
    error: `Current employee is not authorized for ${actionLabel}`,
  });
}

function normalizeShiftExecutionEmployeeActor(principal = null) {
  const employeeId = String(principal?.employeeId || "").trim();
  const id = String(principal?.id || "").trim();
  if (principal?.scope !== "employee" || !employeeId || id !== `employee:${employeeId}`) return null;
  return Object.freeze({
    id,
    employeeId,
    displayName: String(principal?.displayName || ""),
    personnelNumber: String(principal?.personnelNumber || ""),
    scope: "employee",
  });
}

function inspectShiftExecutionAuthorizationResult(authorization = null) {
  const reason = String(authorization?.reason || "shift-execution-authorization-unavailable");
  const actor = normalizeShiftExecutionEmployeeActor(authorization?.principal);
  const infrastructureUnavailable = authorization?.infrastructureUnavailable === true
    || isShiftExecutionAuthorizationInfrastructureReason(reason)
    || (authorization?.allowed === true && !actor);
  return Object.freeze({
    allowed: authorization?.allowed === true && Boolean(actor) && !infrastructureUnavailable,
    actor,
    authenticated: Boolean(actor),
    reason: infrastructureUnavailable && authorization?.allowed === true
      ? "shift-execution-authorization-invalid"
      : reason,
    revision: Number(authorization?.revision || 0),
    infrastructureUnavailable,
    decision: authorization?.decision || null,
    contract: authorization?.contract || null,
    workCenterId: String(authorization?.workCenterId || ""),
  });
}

function sendShiftExecutionAuthorizationFailure(res, headers, authorization, actionLabel) {
  if (authorization.infrastructureUnavailable) {
    sendJson(res, headers, 503, {
      ok: false,
      apiVersion: "v1",
      code: "shift-execution-authorization-unavailable",
      error: `Current Shift Execution authorization is unavailable for ${actionLabel}`,
    });
    return;
  }
  if (!authorization.actor) {
    sendJson(res, headers, 401, {
      ok: false,
      apiVersion: "v1",
      code: "employee-session-required",
      error: `Authenticated employee session is required for ${actionLabel}`,
    });
    return;
  }
  sendJson(res, headers, 403, {
    ok: false,
    apiVersion: "v1",
    code: "shift-execution-write-forbidden",
    error: `Current employee is not authorized for ${actionLabel}`,
  });
}

function normalizePlanningEmployeeActor(principal = null) {
  const employeeId = String(principal?.employeeId || "").trim();
  const id = String(principal?.id || "").trim();
  if (principal?.scope !== "employee" || !employeeId || id !== `employee:${employeeId}`) return null;
  return Object.freeze({
    id,
    employeeId,
    displayName: String(principal?.displayName || ""),
    personnelNumber: String(principal?.personnelNumber || ""),
    scope: "employee",
  });
}

function inspectPlanningCommandAuthorizationResult(authorization = null) {
  const reason = String(authorization?.reason || "planning-authorization-unavailable");
  const actor = normalizePlanningEmployeeActor(authorization?.principal);
  const infrastructureUnavailable = authorization?.infrastructureUnavailable === true
    || isPlanningAuthorizationInfrastructureReason(reason)
    || (authorization?.allowed === true && !actor);
  return Object.freeze({
    allowed: authorization?.allowed === true && Boolean(actor) && !infrastructureUnavailable,
    actor,
    authenticated: Boolean(actor),
    reason: infrastructureUnavailable && authorization?.allowed === true
      ? "planning-authorization-invalid"
      : reason,
    revision: Number(authorization?.revision || 0),
    infrastructureUnavailable,
  });
}

function sendPlanningAuthorizationFailure(res, headers, authorization, actionLabel) {
  if (authorization.infrastructureUnavailable) {
    sendJson(res, headers, 503, {
      ok: false,
      apiVersion: "v1",
      code: "planning-authorization-unavailable",
      error: `Current Planning authorization is unavailable for ${actionLabel}`,
    });
    return;
  }
  if (!authorization.actor) {
    sendJson(res, headers, 401, {
      ok: false,
      apiVersion: "v1",
      code: "employee-session-required",
      error: `Authenticated employee session is required for ${actionLabel}`,
    });
    return;
  }
  sendJson(res, headers, 403, {
    ok: false,
    apiVersion: "v1",
    code: "planning-write-forbidden",
    error: `Current employee is not authorized for ${actionLabel}`,
  });
}

function sendSystemDomainsProductionStructureAuthorizationFailure(res, headers, authorization) {
  if (authorization.infrastructureUnavailable) {
    sendJson(res, headers, 503, {
      ok: false,
      apiVersion: "v1",
      code: "production-structure-authorization-unavailable",
      error: "Current Production Structure authorization is unavailable",
    });
    return;
  }
  if (!authorization.actor) {
    sendJson(res, headers, 401, {
      ok: false,
      apiVersion: "v1",
      code: String(authorization.reason || "employee-session-required"),
      error: "Authenticated employee session is required to update Production Structure",
    });
    return;
  }
  sendJson(res, headers, 403, {
    ok: false,
    apiVersion: "v1",
    code: "production-structure-write-forbidden",
    error: "Current employee is not authorized to update Production Structure",
  });
}

function getEnabledSystemDomainsCommandSurfaces(env = process.env) {
  if (String(env.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS || "") !== "1") return [];
  return [...new Set(String(env.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => SYSTEM_DOMAINS_COMMAND_SURFACES.has(value)))];
}

function getSystemDomainsCommandActorPolicy(env = process.env) {
  const actors = new Set(String(env.MES_SYSTEM_DOMAINS_COMMAND_ACTORS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
  const invalid = [...actors].some((actorId) => !SYSTEM_DOMAINS_COMMAND_ACTOR_PATTERN.test(actorId));
  const reason = !actors.size
    ? "actor-policy-missing"
    : invalid
      ? "actor-policy-invalid"
      : "";
  return { actors, configured: !reason, reason };
}

function getSystemDomainsCommandActorAuthorization(actor, env = process.env) {
  const policy = getSystemDomainsCommandActorPolicy(env);
  if (!policy.configured) return { policyConfigured: false, authorized: false, reason: policy.reason };
  if (!actor?.id) return { policyConfigured: true, authorized: false, reason: "authenticated-session-required" };
  return {
    policyConfigured: true,
    authorized: policy.actors.has(String(actor.id)),
    reason: policy.actors.has(String(actor.id)) ? "" : "actor-not-authorized",
  };
}

function isSystemDomainsCommandActorAuthorized(actor, env = process.env) {
  return getSystemDomainsCommandActorAuthorization(actor, env).authorized === true;
}

function normalizeSystemDomainsCommandPayload(value) {
  const loaded = loadSystemDomains(JSON.stringify(value || {}), { strict: true });
  if (!loaded?.report?.valid || !loaded?.domains) {
    throw new Error(`System Domains payload is invalid: ${(loaded?.report?.errors || []).map((entry) => entry.code).join(", ") || "validation failed"}`);
  }
  return loaded.domains;
}

function getChangedSystemDomainsRegistries(current = {}, candidate = {}) {
  return SYSTEM_DOMAIN_REGISTRY_NAMES.filter((registryName) => (
    stableJson(current?.registries?.[registryName] || []) !== stableJson(candidate?.registries?.[registryName] || [])
  ));
}

function validateSystemDomainsSurfaceChange({ current, candidate, surface = "" } = {}) {
  const allowed = SYSTEM_DOMAINS_SURFACE_REGISTRIES[surface];
  if (!allowed) return { ok: false, error: "Unknown System Domains command surface" };
  const changedRegistries = getChangedSystemDomainsRegistries(current, candidate);
  const forbiddenRegistries = changedRegistries.filter((registryName) => !allowed.has(registryName));
  return forbiddenRegistries.length
    ? { ok: false, error: "System Domains command attempted to modify registries outside its authorized surface", changedRegistries, forbiddenRegistries }
    : { ok: true, changedRegistries, forbiddenRegistries: [] };
}

function hasSystemDomainsServerAuthority(consistency = {}, enabledSurfaces = []) {
  // A retired snapshot is never sufficient evidence on its own.  The read-only
  // reconciliation report carries either the two-read compatibility proof or
  // the durable PostgreSQL-primary marker.  A persisted transition-pending
  // record deliberately fails closed while the root cutover switches stores.
  const authorityMode = consistency?.details?.authority?.mode || "compatibility-snapshot";
  // Partial rollout remains safe while the compatibility snapshot is still
  // present. Once PostgreSQL has become the durable primary, all visible
  // writers must be on the command path; otherwise fail closed rather than
  // letting a subset of the UI fall back to an obsolete local snapshot.
  const primarySurfaceCoverage = authorityMode !== "postgres-primary"
    || [...SYSTEM_DOMAINS_COMMAND_SURFACES].every((surface) => enabledSurfaces.includes(surface));
  return consistency?.ok === true
    && authorityMode !== "transition-pending"
    && primarySurfaceCoverage
    && consistency?.details?.reconciliation?.promotion?.readEligible === true;
}

function getJsonResponseHeaders(headers) {
  return typeof headers === "function"
    ? headers("application/json; charset=utf-8")
    : {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    };
}

function sendJson(res, headers, statusCode, payload, extraHeaders = {}) {
  const responseHeaders = getJsonResponseHeaders(headers);
  const serialized = Buffer.from(JSON.stringify(payload));
  const gzip = /\bgzip\b/i.test(String(res.__mesAcceptEncoding || "")) && serialized.byteLength >= 1024;
  const body = gzip ? gzipSync(serialized) : serialized;
  const compressionHeaders = gzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Length": String(body.byteLength) } : {};
  res.writeHead?.(statusCode, { ...responseHeaders, ...extraHeaders, ...compressionHeaders });
  res.end?.(body);
}

// A verified runtime-projection cache owns transport-ready bytes as well as
// its ETag.  The cache is process-local and still revalidates its durable
// marker for every request; retaining these immutable buffers only removes
// duplicate JSON.stringify/gzip work from an already admitted hot response.
function sendCachedPlanningRuntimeProjection(res, headers, cached, extraHeaders = {}) {
  const responseHeaders = getJsonResponseHeaders(headers);
  const requestedGzip = /\bgzip\b/i.test(String(res.__mesAcceptEncoding || ""))
    && Number(cached?.serialized?.byteLength || 0) >= 1024;
  // Build compressed bytes only when a client actually asks for them. The
  // first gzip response stores the result; all later gzip hits reuse it.
  // This keeps an uncompressed cold response from paying compression cost and
  // avoids a cold gzip response being compressed twice during cache setup.
  if (requestedGzip && !Buffer.isBuffer(cached?.gzipBody) && Buffer.isBuffer(cached?.serialized)) {
    cached.gzipBody = gzipSync(cached.serialized);
  }
  const gzip = requestedGzip && Buffer.isBuffer(cached?.gzipBody);
  const body = gzip ? cached.gzipBody : cached?.serialized;
  if (!Buffer.isBuffer(body)) {
    // This is intentionally not a fallback response path: an incomplete
    // cache entry is rejected by its reader before it can reach the wire.
    throw new Error("Planning runtime projection cache body is unavailable");
  }
  const compressionHeaders = gzip
    ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Length": String(body.byteLength) }
    : {};
  res.writeHead?.(200, { ...responseHeaders, ...extraHeaders, ...compressionHeaders });
  res.end?.(body);
}

function getPublicDomainHealth(health = {}) {
  // The planning fingerprint is an internal cross-store consistency token.
  // It must be available to the parity guard, but never become part of the
  // public health contract or a client cache key.
  const { planningProjectionFingerprint: _planningProjectionFingerprint, ...publicHealth } = health || {};
  return publicHealth;
}

function sendAttachment(res, headers, statusCode, item = null) {
  const responseHeaders = typeof headers === "function"
    ? headers(String(item?.mediaType || "application/octet-stream"))
    : { "Cache-Control": "private, no-store, max-age=0" };
  const fileName = String(item?.fileName || "production-file")
    .replace(/[\r\n"\\]/g, "_")
    .slice(0, 180) || "production-file";
  const body = Buffer.isBuffer(item?.content) ? item.content : Buffer.from(item?.content || "");
  res.writeHead?.(statusCode, {
    ...responseHeaders,
    "Content-Type": String(item?.mediaType || "application/octet-stream"),
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Content-Length": String(body.byteLength),
    "X-Content-Type-Options": "nosniff",
  });
  res.end?.(body);
}

function getRevisionEtag(revision) {
  return `"${Math.max(1, Number(revision) || 1)}"`;
}

function getPayloadEtag(payload) {
  return `"${createHash("sha256").update(stableJson(payload)).digest("base64url").slice(0, 24)}"`;
}

function getPlanningRuntimeProjectionCacheScope({ filePath = "", env = process.env } = {}) {
  // Do not retain a raw database URL (which can contain credentials) in the
  // process cache. The digest still keeps two independently configured
  // contours from sharing a response in a long-lived test or service process.
  // The configured storage mode is also part of the scope: an explicitly
  // snapshot-only request must never inherit a PostgreSQL-primary response.
  const databaseUrl = String(env?.DATABASE_URL || env?.MES_DOMAIN_DATABASE_URL || "");
  const databaseScope = createHash("sha256").update(databaseUrl).digest("base64url").slice(0, 16);
  const storageMode = String(env?.MES_DOMAIN_STORAGE || "").trim().toLowerCase();
  return `${String(filePath || "")}::${databaseScope}::${storageMode}`;
}

function getPlanningProjectionVerificationKey(verification = null) {
  if (!verification) return "";
  return stableJson({
    mode: String(verification.mode || ""),
    primaryRevision: Number(verification.primaryRevision || 0),
    snapshotGeneration: Number(verification.snapshotGeneration || 0),
    snapshotFingerprint: String(verification.snapshotFingerprint || ""),
    contractVersion: Number(verification.contractVersion || 0),
  });
}

function hasSafePlanningRuntimeProjectionAuthority(planningSafety = null) {
  return Boolean(
    planningSafety
    && !planningSafety.fallbackReason
    && planningSafety.repository === planningSafety.primary
    && String(planningSafety.primaryHealth?.storageBackend || "") === "postgresql"
    && planningSafety.readVerification
    && getPlanningProjectionVerificationKey(planningSafety.readVerification),
  );
}

function canCachePlanningRuntimeProjection({ planningSafety = null, listed = null } = {}) {
  return hasSafePlanningRuntimeProjectionAuthority(planningSafety)
    && String(listed?.storageBackend || "") === "postgresql";
}

function invalidatePlanningRuntimeProjectionCache({ filePath = "", env = process.env } = {}) {
  const scope = getPlanningRuntimeProjectionCacheScope({ filePath, env });
  if (planningRuntimeProjectionCache?.scope === scope) planningRuntimeProjectionCache = null;
}

// Exported for isolated HTTP-level QA. Production invalidation remains
// scope-bound so a work-order write cannot evict an unrelated contour.
export function resetPlanningRuntimeProjectionCache() {
  planningRuntimeProjectionCache = null;
}

function cachePlanningRuntimeProjection({ filePath = "", env = process.env, planningSafety = null, listed = null, payload = null, etag = "" } = {}) {
  if (!canCachePlanningRuntimeProjection({ planningSafety, listed }) || !payload || !etag) {
    invalidatePlanningRuntimeProjectionCache({ filePath, env });
    return null;
  }
  const serialized = Buffer.from(JSON.stringify(payload));
  planningRuntimeProjectionCache = {
    scope: getPlanningRuntimeProjectionCacheScope({ filePath, env }),
    primaryHealthRevision: Number(planningSafety.primaryHealth?.revision || 0),
    verification: planningSafety.readVerification,
    verificationKey: getPlanningProjectionVerificationKey(planningSafety.readVerification),
    etag,
    serialized,
    // Compression stays lazy. Most Planning polls accept the uncompressed
    // short response; the first gzip client materializes its own immutable
    // bytes in `sendCachedPlanningRuntimeProjection` for subsequent hot hits.
    gzipBody: null,
  };
  return planningRuntimeProjectionCache;
}

async function readObservedPlanningRuntimeProjectionCache({ filePath = "", env = process.env, primary = null } = {}) {
  const cached = planningRuntimeProjectionCache;
  const scope = getPlanningRuntimeProjectionCacheScope({ filePath, env });
  if (!cached || cached.scope !== scope || cached.verification?.mode !== "observed-snapshot-generation") return null;
  if (!Buffer.isBuffer(cached.serialized)) {
    invalidatePlanningRuntimeProjectionCache({ filePath, env });
    return null;
  }

  // This is the deliberately narrow hot path. An observed marker is a
  // durable, trigger-maintained proof for a specific primary revision and
  // compatibility-snapshot generation. One marker read is enough to prove
  // that the cached bytes are still that exact graph; do not repeat health or
  // full cross-store guards here. Any unavailable/moved marker fails closed,
  // clears the entry, and lets the established generic safety path run below.
  const markerCurrent = await isPlanningProjectionReadVerificationCurrent({
    primary,
    verification: cached.verification,
  });
  if (!markerCurrent) {
    invalidatePlanningRuntimeProjectionCache({ filePath, env });
    return null;
  }
  return cached;
}

async function readCachedPlanningRuntimeProjection({ filePath = "", env = process.env, planningSafety = null } = {}) {
  const cached = planningRuntimeProjectionCache;
  const scope = getPlanningRuntimeProjectionCacheScope({ filePath, env });
  if (!cached || cached.scope !== scope) return null;
  if (!Buffer.isBuffer(cached.serialized)) {
    invalidatePlanningRuntimeProjectionCache({ filePath, env });
    return null;
  }

  // A changed health revision or any fallback transition invalidates eagerly.
  // The marker verification below is repeated after the route's initial
  // safety probe, closing the same read-versus-write race as an uncached
  // projection read.
  if (!hasSafePlanningRuntimeProjectionAuthority(planningSafety)
    || Number(cached.primaryHealthRevision) !== Number(planningSafety.primaryHealth?.revision || 0)
    || cached.verificationKey !== getPlanningProjectionVerificationKey(planningSafety.readVerification)) {
    invalidatePlanningRuntimeProjectionCache({ filePath, env });
    return null;
  }

  const markerCurrent = await isPlanningProjectionReadVerificationCurrent({
    primary: planningSafety.primary,
    snapshot: planningSafety.snapshot,
    verification: cached.verification,
  });
  if (!markerCurrent) {
    invalidatePlanningRuntimeProjectionCache({ filePath, env });
    return null;
  }
  return cached;
}

function matchesEtag(req, etag) {
  return String(req.headers?.["if-none-match"] || req.headers?.["If-None-Match"] || "").trim() === etag;
}

function getRequestTimingNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getElapsedTimingMs(startedAt, endedAt = getRequestTimingNow()) {
  const elapsed = Number(endedAt) - Number(startedAt);
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
}

function formatServerTimingDuration(durationMs) {
  const duration = Number(durationMs);
  return (Number.isFinite(duration) && duration > 0 ? duration : 0).toFixed(2);
}

function getPlanningBootstrapServerTiming({
  planningSafetyMs = 0,
  parityGuardMs = 0,
  bootstrapReadMs = 0,
  startedAt = 0,
} = {}) {
  // Keep the header to timing names and numeric durations. In particular,
  // never expose a repository, fallback reason, selected ID, or payload data.
  return [
    `planning-safety;dur=${formatServerTimingDuration(planningSafetyMs)}`,
    `planning-parity;dur=${formatServerTimingDuration(parityGuardMs)}`,
    `planning-bootstrap;dur=${formatServerTimingDuration(bootstrapReadMs)}`,
    `total;dur=${formatServerTimingDuration(getElapsedTimingMs(startedAt))}`,
  ].join(", ");
}

function getPlanningRuntimeProjectionCacheServerTiming({ cache = "miss", startedAt = 0 } = {}) {
  // This marker is operational telemetry only: it identifies whether the
  // bounded runtime graph itself was reused, without exposing revisions,
  // source IDs, a repository name or the cache key.
  const normalizedCache = cache === "hit" ? "hit" : "miss";
  return `planning-projection-cache;cache=${normalizedCache};dur=${formatServerTimingDuration(getElapsedTimingMs(startedAt))}`;
}

function sendNotModified(res, headers, etag, extraHeaders = {}) {
  const responseHeaders = typeof headers === "function"
    ? headers("application/json; charset=utf-8")
    : { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
  res.writeHead?.(304, { ...responseHeaders, ...extraHeaders, ETag: etag });
  res.end?.();
}

function readExpectedRevision(req, payload = {}) {
  const header = String(req.headers?.["if-match"] || req.headers?.["If-Match"] || "").trim();
  const headerMatch = header.match(/^(?:W\/)?"(\d+)"$/);
  const fromHeader = headerMatch ? Number(headerMatch[1]) : NaN;
  const fromBody = Number(payload.expectedRevision);
  if (header && !headerMatch) return { value: NaN, error: "If-Match must contain a numeric ETag" };
  if (Number.isInteger(fromHeader) && Number.isInteger(fromBody) && fromHeader !== fromBody) {
    return { value: NaN, error: "If-Match and expectedRevision must match" };
  }
  return { value: Number.isInteger(fromHeader) ? fromHeader : fromBody, error: "" };
}

function compareWorkOrderProjections(primaryItems = [], snapshotItems = []) {
  const snapshotByKey = new Map(snapshotItems.map((item) => [String(item.id || item.number || ""), item]));
  const mismatches = [];
  for (const primary of primaryItems) {
    const key = String(primary.id || primary.number || "");
    const snapshot = snapshotByKey.get(key);
    if (!snapshot) {
      mismatches.push({ id: key, reason: "missing-in-snapshot" });
      continue;
    }
    const fields = ["quantity", "revision", "concurrencyRevision", "operationCount", "scheduledOperationCount"];
    const differing = fields.filter((field) => Number(primary[field]) !== Number(snapshot[field]));
    if (String(primary.planningStartDate || "") !== String(snapshot.planningStartDate || "")) {
      differing.push("planningStartDate");
    }
    if (differing.length) mismatches.push({ id: key, fields: differing });
    snapshotByKey.delete(key);
  }
  for (const key of snapshotByKey.keys()) mismatches.push({ id: key, reason: "missing-in-primary" });
  return { matches: mismatches.length === 0, mismatches: mismatches.slice(0, 20) };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function commandReadinessReason({ featureEnabled, primaryReady, schemaReady = true, featureName = "Command" } = {}) {
  if (!primaryReady) return "PostgreSQL is not the primary domain storage";
  if (!schemaReady) return "Required PostgreSQL migration is not applied";
  if (!featureEnabled) return `${featureName} feature flag is disabled during controlled rollout`;
  return "";
}

// A compact projection for planning dashboards and weekly control.  It is
// intentionally derived from the repository list contract, so snapshot and
// PostgreSQL return exactly the same semantic totals during the migration.
function buildWorkOrderSummary(items = []) {
  const byPlanningStatus = {};
  const byLifecycleStatus = {};
  let totalQuantity = 0;
  let operationCount = 0;
  let scheduledOperationCount = 0;
  for (const item of items) {
    const planningStatus = String(item?.planningStatus || "draft");
    const lifecycleStatus = String(item?.lifecycleStatus || "draft");
    byPlanningStatus[planningStatus] = (byPlanningStatus[planningStatus] || 0) + 1;
    byLifecycleStatus[lifecycleStatus] = (byLifecycleStatus[lifecycleStatus] || 0) + 1;
    totalQuantity += Math.max(0, Number(item?.quantity) || 0);
    operationCount += Math.max(0, Number(item?.operationCount) || 0);
    scheduledOperationCount += Math.max(0, Number(item?.scheduledOperationCount) || 0);
  }
  return {
    workOrderCount: items.length,
    totalQuantity,
    operationCount,
    scheduledOperationCount,
    unscheduledOperationCount: Math.max(0, operationCount - scheduledOperationCount),
    byPlanningStatus,
    byLifecycleStatus,
  };
}

function compareWorkOrderDetails(primary = {}, snapshot = {}) {
  const snapshotById = new Map((snapshot.operations || []).map((operation) => [String(operation.id || ""), operation]));
  const mismatches = [];
  for (const operation of primary.operations || []) {
    const key = String(operation.id || "");
    const snapshotOperation = snapshotById.get(key);
    if (!snapshotOperation) {
      mismatches.push({ operationId: key, reason: "missing-in-snapshot" });
      continue;
    }
    const fields = ["operationId", "workCenterId", "nextWorkCenterId", "quantityMultiplier"];
    const differing = fields.filter((field) => String(operation[field] || "") !== String(snapshotOperation[field] || ""));
    if (stableJson(operation.executionContext || {}) !== stableJson(snapshotOperation.executionContext || {})) differing.push("executionContext");
    const primarySlot = operation.slot || null;
    const snapshotSlot = snapshotOperation.slot || null;
    if (Boolean(primarySlot) !== Boolean(snapshotSlot)) differing.push("slot");
    if (primarySlot && snapshotSlot) {
      ["quantity"].forEach((field) => { if (Number(primarySlot[field]) !== Number(snapshotSlot[field])) differing.push(`slot.${field}`); });
      // A marker can remain valid longer than the previous short cache, so
      // every calendar-defining field must participate in its initial proof.
      // Omitting start/end would allow a moved operation to be treated as a
      // healthy PostgreSQL projection indefinitely.
      ["id", "plannedStart", "plannedEnd", "status", "isLocked"].forEach((field) => {
        const primaryValue = field === "plannedStart" || field === "plannedEnd"
          ? normalizePlanningParityInstant(primarySlot[field])
          : String(primarySlot[field] || "");
        const snapshotValue = field === "plannedStart" || field === "plannedEnd"
          ? normalizePlanningParityInstant(snapshotSlot[field])
          : String(snapshotSlot[field] || "");
        if (primaryValue !== snapshotValue) differing.push(`slot.${field}`);
      });
    }
    if (differing.length) mismatches.push({ operationId: key, fields: differing });
    snapshotById.delete(key);
  }
  for (const key of snapshotById.keys()) mismatches.push({ operationId: key, reason: "missing-in-primary" });
  return mismatches;
}

// Legacy planning writes wall-clock values without an explicit offset, while
// the PostgreSQL projection stores the same instant as TIMESTAMPTZ and returns
// canonical UTC ISO.  Parity must compare instants rather than their textual
// representation.  Invalid values intentionally stay textual: a malformed
// snapshot value can never silently become equal to a different value.
function normalizePlanningParityInstant(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? raw : new Date(timestamp).toISOString();
}

function getSnapshotPlanningFingerprint(snapshotHealth = {}) {
  return String(snapshotHealth?.planningProjectionFingerprint || "").trim();
}

function hasMatchingPlanningSnapshotObservationMarker(markerState = null) {
  return hasCurrentPlanningSnapshotObservationMarker(markerState, {
    contractVersion: PLANNING_PROJECTION_PARITY_CONTRACT_VERSION,
  });
}

function createPlanningProjectionReadVerification(markerState = null, snapshotHealth = {}, { allowObservedMarker = false } = {}) {
  if (allowObservedMarker && hasMatchingPlanningSnapshotObservationMarker(markerState)) {
    return {
      mode: "observed-snapshot-generation",
      primaryRevision: Number(markerState.primaryRevision || 0),
      snapshotGeneration: Number(markerState.snapshotGeneration || 0),
      snapshotFingerprint: String(markerState.observedSnapshotFingerprint || ""),
      contractVersion: PLANNING_PROJECTION_PARITY_CONTRACT_VERSION,
    };
  }
  if (!hasMatchingPlanningProjectionMarker(markerState, snapshotHealth)) return null;
  return {
    mode: "snapshot-health",
    primaryRevision: Number(markerState.primaryRevision || 0),
    snapshotFingerprint: getSnapshotPlanningFingerprint(snapshotHealth),
    contractVersion: PLANNING_PROJECTION_PARITY_CONTRACT_VERSION,
  };
}

function hasMatchingPlanningProjectionMarker(markerState = null, snapshotHealth = {}) {
  const fingerprint = getSnapshotPlanningFingerprint(snapshotHealth);
  return Boolean(
    markerState
    && fingerprint
    && Number(markerState.primaryRevision) >= 0
    && Number(markerState.verifiedPrimaryRevision) === Number(markerState.primaryRevision)
    && String(markerState.verifiedSnapshotFingerprint || "") === fingerprint
    && Number(markerState.verifiedContractVersion) === PLANNING_PROJECTION_PARITY_CONTRACT_VERSION,
  );
}

async function isPlanningProjectionReadVerificationCurrent({ primary, snapshot, verification } = {}) {
  if (!verification || !primary
    || typeof primary.getPlanningProjectionParityState !== "function") return false;
  try {
    if (verification.mode === "observed-snapshot-generation") {
      const markerState = await primary.getPlanningProjectionParityState();
      return Boolean(
        hasMatchingPlanningSnapshotObservationMarker(markerState)
        && Number(markerState.primaryRevision) === Number(verification.primaryRevision)
        && Number(markerState.snapshotGeneration) === Number(verification.snapshotGeneration)
        && String(markerState.observedSnapshotFingerprint || "") === String(verification.snapshotFingerprint || "")
        && Number(markerState.verifiedContractVersion) === Number(verification.contractVersion),
      );
    }
    if (!snapshot) return false;
    const [markerState, snapshotHealth] = await Promise.all([
      primary.getPlanningProjectionParityState(),
      snapshot.health(),
    ]);
    return Boolean(
      hasMatchingPlanningProjectionMarker(markerState, snapshotHealth)
      && Number(markerState.primaryRevision) === Number(verification.primaryRevision)
      && getSnapshotPlanningFingerprint(snapshotHealth) === String(verification.snapshotFingerprint || "")
      && Number(markerState.verifiedContractVersion) === Number(verification.contractVersion),
    );
  } catch {
    // A verification read must never make PostgreSQL more trusted.  The
    // caller falls back to the compatibility snapshot when it cannot prove
    // that the marker stayed current for the actual repository read.
    return false;
  }
}

function withPlanningSnapshotFallback(safety = {}, error = "Planning projection changed during read") {
  if (!safety?.snapshot) return safety;
  return {
    ...safety,
    repository: safety.snapshot,
    readVerification: null,
    parity: {
      ...(safety.parity || {}),
      matches: false,
      error,
    },
    fallbackReason: PLANNING_POSTGRES_FALLBACK_REASON,
  };
}

// A durable marker makes the expensive aggregate parity proof rare, but it
// must not be trusted only at route entry.  A PostgreSQL or compatibility
// snapshot change can otherwise land between marker inspection and the
// actual list/get read.  Recheck the same epoch/fingerprint after that read;
// if it moved, re-prove once and then fail closed to the snapshot on churn.
export async function readPlanningProjectionSafely({
  planningSafety,
  getPlanningSafety,
  read,
  maxAttempts = 2,
} = {}) {
  let safety = planningSafety;
  const attempts = Math.max(1, Math.min(3, Number(maxAttempts) || 2));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const repository = safety?.repository;
    if (!repository || typeof read !== "function") throw new Error("Planning projection read is unavailable");
    const verification = safety?.readVerification;
    if (!verification || repository !== safety.primary) {
      return { result: await read(repository), planningSafety: safety };
    }

    const result = await read(repository);
    if (await isPlanningProjectionReadVerificationCurrent({
      primary: safety.primary,
      snapshot: safety.snapshot,
      verification,
    })) {
      return { result, planningSafety: safety };
    }

    // Do not reuse a process cache after detecting movement during a real
    // read.  The next check must produce a fresh cross-store proof.
    planningPostgresParityCache = null;
    if (typeof getPlanningSafety !== "function") break;
    safety = await getPlanningSafety({ forceFullParity: true });
  }

  const fallbackSafety = withPlanningSnapshotFallback(
    safety,
    "Planning projection changed while its PostgreSQL read was verified",
  );
  return { result: await read(fallbackSafety.repository), planningSafety: fallbackSafety };
}

async function verifyPlanningProjectionBeforeWrite({ planningSafety, getPlanningSafety } = {}) {
  let safety = planningSafety;
  if (safety?.fallbackReason || safety?.repository !== safety?.primary || !safety?.readVerification) {
    return withPlanningSnapshotFallback(safety, "Planning projection parity checkpoint is unavailable before write");
  }
  if (await isPlanningProjectionReadVerificationCurrent({
    primary: safety.primary,
    snapshot: safety.snapshot,
    verification: safety.readVerification,
  })) return safety;

  planningPostgresParityCache = null;
  if (typeof getPlanningSafety !== "function") {
    return withPlanningSnapshotFallback(safety, "Planning projection changed before write");
  }
  safety = await getPlanningSafety({ forceFullParity: true });
  if (safety?.fallbackReason || safety?.repository !== safety?.primary || !safety?.readVerification) {
    return withPlanningSnapshotFallback(safety, "Planning projection changed before write");
  }
  return (await isPlanningProjectionReadVerificationCurrent({
    primary: safety.primary,
    snapshot: safety.snapshot,
    verification: safety.readVerification,
  }))
    ? safety
    : withPlanningSnapshotFallback(safety, "Planning projection changed before write");
}

function planningParityCacheKey({ filePath = "", primaryHealth = {}, snapshotHealth = {}, markerState = null } = {}) {
  const snapshotPlanningFingerprint = getSnapshotPlanningFingerprint(snapshotHealth);
  return JSON.stringify({
    filePath: String(filePath || ""),
    primaryRevision: Number(primaryHealth.revision || 0),
    primaryUpdatedAt: String(primaryHealth.updatedAt || ""),
    primaryProjectionRevision: Number(markerState?.primaryRevision || 0),
    snapshotRevision: Number(snapshotHealth.revision || 0),
    snapshotUpdatedAt: String(snapshotHealth.updatedAt || ""),
    snapshotPlanningFingerprint,
    snapshotObservationState: String(markerState?.snapshotObservationState || ""),
    snapshotGeneration: Number(markerState?.snapshotGeneration || 0),
    observedSnapshotFingerprint: String(markerState?.observedSnapshotFingerprint || ""),
  });
}

async function inspectWorkOrderProjectionParity({ primary, snapshot } = {}) {
  const [primaryList, snapshotList] = await Promise.all([primary.list(), snapshot.list()]);
  const parity = compareWorkOrderProjections(primaryList.items, snapshotList.items);
  if (parity.matches) {
    const details = await Promise.all(primaryList.items.map(async (item) => {
      const [primaryDetail, snapshotDetail] = await Promise.all([primary.get(item.id), snapshot.get(item.id)]);
      return {
        id: item.id,
        primary: primaryDetail.item,
        snapshot: snapshotDetail.item,
        mismatches: compareWorkOrderDetails(primaryDetail.item, snapshotDetail.item),
      };
    }));
    const missingDetails = details.filter((entry) => !entry.primary || !entry.snapshot);
    const operationMismatches = details.filter((entry) => entry.primary && entry.snapshot && entry.mismatches.length);
    if (missingDetails.length || operationMismatches.length) {
      parity.matches = false;
      parity.mismatches = [
        ...missingDetails.slice(0, 20).map((entry) => ({ id: entry.id, reason: "detail-missing" })),
        ...operationMismatches.slice(0, 20).map((entry) => ({ id: entry.id, operations: entry.mismatches.slice(0, 20) })),
      ].slice(0, 20);
    } else {
      // The persistent marker must protect the same projection that the
      // legacy planning runtime consumes.  Compare its canonical shape after
      // granular diagnostics have passed; this covers fields such as labels,
      // labour and rendering metadata without treating the independently
      // generated `updatedAt` timestamp as a data conflict.
      const primaryProjection = canonicalPlanningRuntimeProjection(details.map((entry) => entry.primary));
      const snapshotProjection = canonicalPlanningRuntimeProjection(details.map((entry) => entry.snapshot));
      if (stableJson(primaryProjection) !== stableJson(snapshotProjection)) {
        parity.matches = false;
        parity.mismatches = [{ reason: "runtime-projection" }];
      }
    }
  }
  return { primary: primaryList, snapshot: snapshotList, parity };
}

// PostgreSQL can become a temporary stale read model while an unmigrated
// planning UI still persists directly to the compatibility snapshot.  Keep a
// short, revision-keyed diagnostic cache so normal planning reads do not pay
// a full aggregate comparison on every request.  When the two projections
// differ, the snapshot remains the safer read source until reconciliation.
export async function inspectPlanningProjectionSafety({
  primary,
  primaryHealth,
  env = process.env,
  filePath = "",
  createRepository = createWorkOrdersRepository,
  now = () => Date.now(),
  forceFullParity = false,
} = {}) {
  if (primaryHealth?.storageBackend !== "postgresql") {
    return {
      repository: primary,
      primary,
      primaryHealth,
      snapshot: null,
      snapshotHealth: null,
      parity: { matches: true, skipped: "primary-not-postgresql", mismatches: [] },
      fallbackReason: "",
    };
  }

  // Constructing the compatibility adapter does not read its snapshot.  When
  // the durable observation marker is valid we retain it only as a fail-closed
  // fallback and avoid parsing/hash-reading the multi-megabyte file here.
  const snapshot = await createRepository({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
  const markerSupported = typeof primary?.getPlanningProjectionParityState === "function"
    && typeof primary?.markPlanningProjectionParity === "function";
  const observationSupported = markerSupported
    && typeof primary?.beginPlanningSnapshotObservation === "function"
    && typeof primary?.recordPlanningSnapshotObservation === "function";
  const observationConfigured = observationSupported && isPlanningSnapshotObservationEnabled(env);
  let markerState = null;
  if (markerSupported) {
    try {
      markerState = await primary.getPlanningProjectionParityState();
    } catch {
      // A release may reach the application before its optional migration.
      // Never trust an unavailable marker; the established full parity route
      // below remains the safe fallback until the schema is ready.
      markerState = null;
    }
  }

  // Migration 024 is additive and can land after the application package.
  // Do not repeatedly issue a failing `begin` against the older row shape:
  // its reader reports `observationAvailable: false`, so the proven
  // snapshot-health path remains active until the schema is actually ready.
  const observationRequested = observationConfigured && markerState?.observationAvailable === true;

  if (!forceFullParity && observationRequested && hasMatchingPlanningSnapshotObservationMarker(markerState)) {
    return {
      repository: primary,
      primary,
      primaryHealth,
      snapshot,
      snapshotHealth: null,
      readVerification: createPlanningProjectionReadVerification(markerState, {}, { allowObservedMarker: true }),
      parity: { matches: true, skipped: "verified-snapshot-observation-marker", mismatches: [] },
      fallbackReason: "",
    };
  }

  const snapshotHealth = await snapshot.health();
  // A PostgreSQL-only deployment has no compatibility state to protect.  It
  // is therefore safe to preserve the configured primary path unchanged.
  if (snapshotHealth.configured === false) {
    return {
      repository: primary,
      primary,
      primaryHealth,
      snapshot,
      snapshotHealth,
      parity: { matches: true, skipped: "snapshot-unconfigured", mismatches: [] },
      fallbackReason: "",
    };
  }

  // A managed writer invalidates the marker *before* changing the
  // compatibility snapshot.  It owns that pending generation until it has
  // either recorded the new file or left the marker pending on failure.  A
  // parity proof must never take over this generation: doing so could prove
  // the old file while the writer subsequently commits a new one.  Reading
  // the snapshot directly is safe in both states and preserves availability.
  // This check deliberately follows the PostgreSQL-only guard above: a
  // contour with no compatibility snapshot has no second source to protect.
  if (observationRequested && String(markerState?.snapshotObservationState || "") === "pending") {
    return {
      repository: snapshot,
      primary,
      primaryHealth,
      snapshot,
      snapshotHealth,
      parity: {
        matches: false,
        mismatches: [],
        error: "Planning snapshot observation is pending",
      },
      fallbackReason: PLANNING_POSTGRES_FALLBACK_REASON,
    };
  }

  let observation = null;
  let observationAdmissionFailed = false;
  if (observationRequested) {
    try {
      observation = await primary.beginPlanningSnapshotObservation({
        source: "planning-parity-proof",
        // The conditional marker update is the race boundary with a managed
        // snapshot writer.  Unlike a writer, a proof may not supersede a
        // pending generation it does not own.
        rejectWhenPending: true,
      });
      if (!observation?.snapshotGeneration) observationAdmissionFailed = true;
    } catch {
      observationAdmissionFailed = true;
    }
  }

  if (observationAdmissionFailed) {
    return {
      repository: snapshot,
      primary,
      primaryHealth,
      snapshot,
      snapshotHealth,
      parity: {
        matches: false,
        mismatches: [],
        error: "Planning snapshot observation could not be admitted",
      },
      fallbackReason: PLANNING_POSTGRES_FALLBACK_REASON,
    };
  }

  if (!forceFullParity && !observation && hasMatchingPlanningProjectionMarker(markerState, snapshotHealth)) {
    return {
      repository: primary,
      primary,
      primaryHealth,
      snapshot,
      snapshotHealth,
      readVerification: createPlanningProjectionReadVerification(markerState, snapshotHealth),
      parity: { matches: true, skipped: "verified-projection-marker", mismatches: [] },
      fallbackReason: "",
    };
  }

  const cacheKey = planningParityCacheKey({ filePath, primaryHealth, snapshotHealth, markerState });
  const cached = planningPostgresParityCache;
  let checked;
  if (!observation && !forceFullParity && cached?.cacheKey === cacheKey && now() - cached.checkedAt < PLANNING_POSTGRES_PARITY_CACHE_TTL_MS) {
    checked = cached.checked;
  } else {
    try {
      checked = await inspectWorkOrderProjectionParity({ primary, snapshot });
      // Persist a proof only if neither source changed while the expensive
      // comparison was running.  The PostgreSQL epoch is trigger-maintained
      // for every order/operation/slot write; the snapshot SHA covers the
      // planning value independently from unrelated UI state changes.
      if (checked.parity.matches && markerSupported && getSnapshotPlanningFingerprint(snapshotHealth)) {
        const [primaryAfter, snapshotAfter] = await Promise.all([
          primary.getPlanningProjectionParityState().catch(() => null),
          snapshot.health().catch(() => null),
        ]);
        const expectedPrimaryRevision = observation ? Number(observation.primaryRevision) : Number(markerState?.primaryRevision);
        if (!primaryAfter || !snapshotAfter || !Number.isFinite(expectedPrimaryRevision)
          || Number(primaryAfter.primaryRevision) !== expectedPrimaryRevision
          || getSnapshotPlanningFingerprint(snapshotAfter) !== getSnapshotPlanningFingerprint(snapshotHealth)) {
          checked.parity = {
            matches: false,
            mismatches: [],
            error: "Planning projection changed during parity verification",
          };
        } else {
          // A full comparison is not sufficient on its own: the endpoint
          // performs its eventual PostgreSQL read later.  Persist an atomic
          // checkpoint now so that the read can revalidate the exact source
          // pair afterwards.  If it cannot be written, select the safe
          // snapshot instead of silently returning an unguarded primary.
          const fingerprint = getSnapshotPlanningFingerprint(snapshotHealth);
          const observed = observation
            ? await primary.recordPlanningSnapshotObservation({
              snapshotGeneration: observation.snapshotGeneration,
              snapshotVersion: Number(snapshotAfter.version || 0),
              snapshotFingerprint: fingerprint,
              source: "planning-parity-proof",
            }).catch(() => false)
            : true;
          const marked = observed && await primary.markPlanningProjectionParity({
            primaryRevision: expectedPrimaryRevision,
            snapshotFingerprint: fingerprint,
            ...(observation ? { snapshotGeneration: observation.snapshotGeneration } : {}),
            contractVersion: PLANNING_PROJECTION_PARITY_CONTRACT_VERSION,
          }).catch(() => false);
          if (!marked) {
            checked.parity = {
              matches: false,
              mismatches: [],
              error: "Planning projection parity checkpoint could not be persisted",
            };
          }
        }
      } else if (checked.parity.matches) {
        checked.parity = {
          matches: false,
          mismatches: [],
          error: "Planning projection parity checkpoint is unavailable",
        };
      }
    } catch (error) {
      checked = {
        primary: null,
        snapshot: null,
        parity: {
          matches: false,
          mismatches: [],
          error: error?.message || "Planning projection parity is unavailable",
        },
      };
    }
    if (!observation) planningPostgresParityCache = { cacheKey, checkedAt: now(), checked };
  }

  const fallbackReason = checked.parity.matches ? "" : PLANNING_POSTGRES_FALLBACK_REASON;
  let verifiedMarkerState = null;
  let verifiedSnapshotHealth = snapshotHealth;
  if (!fallbackReason) {
    if (observation) {
      verifiedMarkerState = await Promise.resolve().then(() => primary.getPlanningProjectionParityState()).catch(() => null);
    } else {
      [verifiedMarkerState, verifiedSnapshotHealth] = await Promise.all([
        Promise.resolve().then(() => primary.getPlanningProjectionParityState()).catch(() => null),
        snapshot.health().catch(() => null),
      ]);
    }
  }
  // Re-read both sides after the CAS marker write.  A direct PostgreSQL or
  // legacy snapshot change that interleaves with the full proof must not be
  // promoted to a trusted primary read.
  const readVerification = fallbackReason
    ? null
    : createPlanningProjectionReadVerification(
      verifiedMarkerState,
      verifiedSnapshotHealth,
      { allowObservedMarker: Boolean(observation) },
    );
  if (!fallbackReason && !readVerification) {
    checked.parity = {
      matches: false,
      mismatches: [],
      error: "Planning projection parity checkpoint is unavailable",
    };
  }
  const finalFallbackReason = checked.parity.matches ? "" : PLANNING_POSTGRES_FALLBACK_REASON;
  return {
    repository: finalFallbackReason ? snapshot : primary,
    primary,
    primaryHealth,
    snapshot,
    snapshotHealth,
    readVerification: finalFallbackReason ? null : readVerification,
    parity: checked.parity,
    fallbackReason: finalFallbackReason,
  };
}

function withPlanningFallback(payload, safety = null) {
  if (!safety?.fallbackReason) return payload;
  return {
    ...payload,
    fallbackReason: safety.fallbackReason,
    primaryStorageBackend: safety.primaryHealth?.storageBackend || "postgresql",
  };
}

async function resolvePlanningGanttWindowReadSource({
  primary,
  primaryHealth,
  env = process.env,
  filePath = "",
  createRepository = createWorkOrdersRepository,
} = {}) {
  if (String(primaryHealth?.storageBackend || "") !== "postgresql") {
    return { repository: primary, primaryHealth, fallbackReason: "" };
  }

  // Do not reuse readPlanningProjectionSafely() here. Its durable marker is
  // correct for the legacy one-slot-per-operation graph but cannot prove a
  // complete split-slot sequence. When a compatibility snapshot exists it is
  // the only source that can safely retain the existing physical slot shape.
  let snapshot;
  let snapshotHealth;
  try {
    snapshot = await createRepository({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
    snapshotHealth = await snapshot.health();
  } catch (error) {
    throw new Error(`Gantt window snapshot authority is unavailable: ${error?.message || "unknown error"}`);
  }
  // A PostgreSQL-only contour has no second physical-slot source to protect,
  // so it may use its native bounded query directly.
  if (snapshotHealth?.configured === false) {
    return { repository: primary, primaryHealth, snapshot, snapshotHealth, fallbackReason: "" };
  }
  return {
    repository: snapshot,
    primary,
    primaryHealth,
    snapshot,
    snapshotHealth,
    fallbackReason: PLANNING_GANTT_WINDOW_FALLBACK_REASON,
  };
}

function getPlanningResponseEtag(revision, safety = null) {
  // Preserve the long-standing revision ETag on a healthy primary. During a
  // fallback, also vary on the primary revision and reason so a client cannot
  // receive a misleading 304 after the authority state has changed.
  if (!safety?.fallbackReason) return getRevisionEtag(revision);
  return getPayloadEtag({
    revision: Number(revision || 0),
    primaryRevision: Number(safety.primaryHealth?.revision || 0),
    primaryUpdatedAt: String(safety.primaryHealth?.updatedAt || ""),
    fallbackReason: safety.fallbackReason,
  });
}

function getPlanningRuntimeProjectionEtag({ listed = {}, payload = null, planningSafety = null } = {}) {
  // `listRuntimeProjection().revision` is intentionally the highest aggregate
  // revision for compact list compatibility. It is not a global change token:
  // a lower-revision order can change while that maximum stays the same. For
  // the safe PostgreSQL path use the trigger-maintained parity epoch instead.
  // It changes for every order, operation and slot write, and it is the same
  // proof revalidated before a cached response is returned.
  const verification = planningSafety?.readVerification;
  if (!planningSafety?.fallbackReason
    && planningSafety?.repository === planningSafety?.primary
    && String(planningSafety?.primaryHealth?.storageBackend || "") === "postgresql"
    && verification) {
    return getPayloadEtag({
      contract: "planning-runtime-projection-v1",
      primaryRevision: Number(verification.primaryRevision || 0),
      snapshotGeneration: Number(verification.snapshotGeneration || 0),
      snapshotFingerprint: String(verification.snapshotFingerprint || ""),
      parityContractVersion: Number(verification.contractVersion || 0),
    });
  }
  // Preserve the established fallback ETag, whose fallback marker prevents a
  // stale 304 during an authority transition. The snapshot adapter owns a
  // global file revision, so retain its long-standing numeric ETag. A
  // PostgreSQL primary without a durable marker uses the exact response
  // payload rather than an unsafe max aggregate revision.
  if (planningSafety?.fallbackReason) return getPlanningResponseEtag(listed.revision, planningSafety);
  if (String(planningSafety?.primaryHealth?.storageBackend || "") !== "postgresql") {
    return getPlanningResponseEtag(listed.revision, planningSafety);
  }
  return getPayloadEtag(payload || {});
}

function sendPlanningWriteParityConflict(res, headers, safety) {
  sendJson(res, headers, 409, {
    ok: false,
    apiVersion: "v1",
    fallbackReason: safety?.fallbackReason || PLANNING_POSTGRES_FALLBACK_REASON,
    error: "Planning write is temporarily unavailable while the PostgreSQL projection differs from the compatibility snapshot",
    parity: safety?.parity || { matches: false },
  });
}

// Transitional read model for the existing planning runtime. It deliberately
// keeps the legacy field names at the API boundary, so the client can replace
// its shared-state planning snapshot one projection at a time without a
// second in-browser migration of routes, operations and slots.
function buildPlanningRuntimeProjection(items = []) {
  const routes = [];
  const routeSteps = [];
  const slots = [];
  for (const item of items) {
    const route = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const routeId = String(item?.id || route.id || "");
    if (!routeId) continue;
    routes.push({
      ...route,
      id: routeId,
      name: String(item.name || route.name || "Заказ-наряд"),
      designation: String(item.designation || route.designation || ""),
      planningQuantity: Number(item.quantity ?? route.planningQuantity ?? 0),
      // The top-level field is mapped from work_orders.planning_start_date.
      // Never let stale compatibility metadata override that canonical owner.
      planningStartDate: isExactIsoCalendarDate(item.planningStartDate)
        ? String(item.planningStartDate)
        : "",
      lifecycleStatus: String(item.lifecycleStatus || route.lifecycleStatus || "draft"),
      planningStatus: String(item.planningStatus || route.planningStatus || "draft"),
      domainConcurrencyRevision: Number(item.concurrencyRevision || route.domainConcurrencyRevision || 0),
      updatedAt: String(item.updatedAt || route.updatedAt || ""),
      workOrderSnapshot: { ...route.workOrderSnapshot, id: String(item.number || route.workOrderSnapshot?.id || routeId), quantity: Number(item.quantity || 0) },
    });
    for (const operation of item.operations || []) {
      const step = operation?.metadata && typeof operation.metadata === "object" ? operation.metadata : {};
      const stepId = String(operation?.id || step.id || "");
      if (!stepId) continue;
      routeSteps.push({
        ...step,
        id: stepId,
        routeId,
        operationId: String(operation.operationId || step.operationId || ""),
        operationName: String(operation.name || step.operationName || "Операция"),
        workCenterId: String(operation.workCenterId || step.workCenterId || ""),
        nextWorkCenterId: String(operation.nextWorkCenterId || step.nextWorkCenterId || ""),
        quantityMultiplier: Number(operation.quantityMultiplier || step.quantityMultiplier || 1),
        executionContext: operation.executionContext || step.executionContext || {},
        labor: operation.labor || step.labor || step.planningLabor || {},
      });
      if (!operation.slot) continue;
      const slot = operation.slot.metadata && typeof operation.slot.metadata === "object" ? operation.slot.metadata : {};
      slots.push({
        ...slot,
        id: String(operation.slot.id || slot.id || ""),
        routeId,
        routeStepId: stepId,
        plannedStart: String(operation.slot.plannedStart || slot.plannedStart || ""),
        plannedEnd: String(operation.slot.plannedEnd || slot.plannedEnd || ""),
        status: String(operation.slot.status || slot.status || "planned"),
        quantity: Number(operation.slot.quantity || slot.quantity || 0),
        locked: Boolean(operation.slot.isLocked),
      });
    }
  }
  return { routes, routeSteps, slots };
}

function canonicalPlanningRuntimeProjection(items = []) {
  const projection = buildPlanningRuntimeProjection(items.filter(Boolean));
  const byId = (left, right) => compareStableText(left?.id, right?.id);
  return {
    // PostgreSQL owns a physical updated_at timestamp while the compatibility
    // snapshot preserves the client-side one.  It is not used to plan or
    // render a route, so remove it before a structural projection proof.
    routes: projection.routes
      .map(({ updatedAt: _updatedAt, ...route }) => route)
      .sort(byId),
    routeSteps: projection.routeSteps.slice().sort(byId),
    slots: projection.slots
      .map((slot) => ({
        ...slot,
        plannedStart: normalizePlanningParityInstant(slot.plannedStart),
        plannedEnd: normalizePlanningParityInstant(slot.plannedEnd),
      }))
      .sort(byId),
  };
}

function compareStableText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function parsePlanningPeriodDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const instant = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) return null;
  return { date, time: instant.getTime() };
}

function parsePlanningPeriodInstant(value) {
  const instantText = String(value || "").trim();
  // The weekly client sends canonical UTC instants for local calendar
  // boundaries. Requiring the canonical form keeps the transport
  // deterministic and avoids a server-local timezone interpretation.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instantText)) return null;
  const instant = new Date(instantText);
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== instantText) return null;
  return { instant: instantText, time: instant.getTime() };
}

function readPlanningPeriod(url) {
  const fromAtValue = url.searchParams.get("fromAt");
  const toAtValue = url.searchParams.get("toAt");
  if (fromAtValue || toAtValue) {
    const from = parsePlanningPeriodInstant(fromAtValue);
    const to = parsePlanningPeriodInstant(toAtValue);
    if (!from || !to) {
      return { error: "fromAt and toAt must be canonical UTC instants in YYYY-MM-DDTHH:mm:ss.sssZ format" };
    }
    if (to.time <= from.time) return { error: "toAt must be after fromAt" };
    if (to.time - from.time > MAX_PLANNING_PERIOD_DAYS * 24 * 60 * 60 * 1000) {
      return { error: `planning period must not exceed ${MAX_PLANNING_PERIOD_DAYS} days` };
    }
    return { from, to, boundsKind: "instant" };
  }
  const from = parsePlanningPeriodDate(url.searchParams.get("from"));
  const to = parsePlanningPeriodDate(url.searchParams.get("to"));
  if (!from || !to) {
    return { error: "from and to must be ISO calendar dates in YYYY-MM-DD format" };
  }
  if (to.time <= from.time) return { error: "to must be after from" };
  if (to.time - from.time > MAX_PLANNING_PERIOD_DAYS * 24 * 60 * 60 * 1000) {
    return { error: `planning period must not exceed ${MAX_PLANNING_PERIOD_DAYS} days` };
  }
  return { from, to, boundsKind: "date" };
}

function readPlanningPeriodView(url) {
  const value = String(url?.searchParams?.get("view") || "projection").trim().toLowerCase();
  return value === "projection" || value === "weekly" ? value : "";
}

function readShiftExecutionDispatchQuery(url) {
  const sourceRowIds = url.searchParams.getAll("sourceRowId");
  if (sourceRowIds.length < 1 || sourceRowIds.length > 200 || sourceRowIds.some((value) => !String(value || "").trim())) {
    return { error: "sourceRowId must be supplied from one to 200 times" };
  }
  const workCenterIds = url.searchParams.getAll("workCenterId");
  if (workCenterIds.length < 1 || workCenterIds.length > 100 || workCenterIds.some((value) => !String(value || "").trim())) {
    return { error: "workCenterId must be supplied from one to 100 times" };
  }
  const dateKeys = url.searchParams.getAll("dateKey");
  if (dateKeys.length !== 1) return { error: "dateKey must be supplied exactly once as YYYY-MM-DD" };
  const dateKey = String(dateKeys[0] || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { error: "dateKey must use YYYY-MM-DD" };
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== dateKey) {
    return { error: "dateKey must be a calendar date in YYYY-MM-DD" };
  }
  return { sourceRowIds, workCenterIds, dateKey };
}

function getPlanningSlotInterval(slot = {}) {
  const start = Date.parse(String(slot?.plannedStart || ""));
  const end = Date.parse(String(slot?.plannedEnd || ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function sortPlanningPeriodOperations(left, right) {
  const leftInterval = getPlanningSlotInterval(left?.slot) || { start: Number.MAX_SAFE_INTEGER };
  const rightInterval = getPlanningSlotInterval(right?.slot) || { start: Number.MAX_SAFE_INTEGER };
  return leftInterval.start - rightInterval.start
    || Number(left?.metadata?.stepOrder ?? left?.metadata?.sequenceNo ?? 0) - Number(right?.metadata?.stepOrder ?? right?.metadata?.sequenceNo ?? 0)
    || compareStableText(left?.id, right?.id);
}

// Weekly control needs only scheduled operations that overlap the requested
// calendar range.  Keep the established runtime projection field names so a
// consumer can replace its full shared-state projection incrementally, while
// making the network representation proportional to the displayed period.
function buildPlanningPeriodProjection(items = [], period = {}) {
  const selected = [];
  for (const item of items) {
    const operations = (item?.operations || [])
      .filter((operation) => {
        const interval = getPlanningSlotInterval(operation?.slot);
        return Boolean(interval && interval.start < period.to.time && interval.end > period.from.time);
      })
      .sort(sortPlanningPeriodOperations);
    if (!operations.length) continue;
    const firstInterval = getPlanningSlotInterval(operations[0]?.slot) || { start: Number.MAX_SAFE_INTEGER };
    // Labour norm maps belong to an order/workbench detail. They are not read
    // by weekly control and can be substantially larger than the period data,
    // so never copy them into this bounded transport projection.
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const { planningLaborByStepId: _planningLaborByStepId, ...periodMetadata } = metadata;
    selected.push({ item: { ...item, metadata: periodMetadata, operations }, firstStart: firstInterval.start });
  }
  selected.sort((left, right) => left.firstStart - right.firstStart
    || compareStableText(left.item?.number, right.item?.number)
    || compareStableText(left.item?.id, right.item?.id));
  return buildPlanningRuntimeProjection(selected.map((entry) => entry.item));
}

// The Planning workbench shows operation data and a compact schedule hint for
// one selected order. The full slot metadata is only consumed by the Gantt
// projection, where it is still returned through the dedicated endpoint.
function buildPlanningWorkbenchDetail(item = {}) {
  return {
    ...item,
    operations: (item.operations || []).map((operation) => ({
      ...operation,
      slot: operation.slot ? {
        id: String(operation.slot.id || ""),
        plannedStart: String(operation.slot.plannedStart || ""),
        plannedEnd: String(operation.slot.plannedEnd || ""),
        status: String(operation.slot.status || "planned"),
        quantity: Number(operation.slot.quantity || 0),
        isLocked: Boolean(operation.slot.isLocked),
      } : null,
    })),
  };
}

function requestBodyTooLargeError(maxBytes) {
  const error = new Error(`Request body exceeds the ${maxBytes}-byte limit`);
  error.code = "REQUEST_BODY_TOO_LARGE";
  return error;
}

export async function readRequestBody(req, { maxBytes = Number.POSITIVE_INFINITY } = {}) {
  const bounded = Number.isSafeInteger(maxBytes) && maxBytes > 0;
  const assertWithinBound = (value) => {
    if (bounded && Buffer.byteLength(value) > maxBytes) throw requestBodyTooLargeError(maxBytes);
  };
  if (req.body && typeof req.body === "object") {
    assertWithinBound(JSON.stringify(req.body));
    return req.body;
  }
  if (typeof req.body === "string") {
    assertWithinBound(req.body);
    return JSON.parse(req.body || "{}");
  }
  const contentLength = Number(req.headers?.["content-length"] || req.headers?.["Content-Length"] || 0);
  if (bounded && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw requestBodyTooLargeError(maxBytes);
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += bytes.length;
      if (bounded && receivedBytes > maxBytes) {
        settled = true;
        chunks.length = 0;
        reject(requestBodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(bytes);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function getRequestHeader(req, name) {
  const normalized = String(name || "").toLowerCase();
  const direct = req?.headers?.[normalized];
  if (direct !== undefined) return direct;
  return Object.entries(req?.headers || {}).find(([key]) => String(key).toLowerCase() === normalized)?.[1];
}

function hasSameOriginRequestContext(req) {
  if (String(getRequestHeader(req, "sec-fetch-site") || "").toLowerCase() !== "same-origin") return false;
  const requestOrigin = String(getRequestHeader(req, "origin") || "").trim();
  const requestHost = String(getRequestHeader(req, "host") || "").trim().toLowerCase();
  if (!requestOrigin || !requestHost) return false;
  try { return new URL(requestOrigin).host.toLowerCase() === requestHost; }
  catch { return false; }
}

export async function handleDomainApiRequest(req, res, url, {
  headers,
  filePath = "",
  env = process.env,
  // Injection keeps the parity guard independently testable without needing
  // a live PostgreSQL connection in HTTP-level QA.
  workOrdersRepositoryFactory = createWorkOrdersRepository,
  specifications2AuthorizationResolver = resolveSpecifications2CommandAuthorization,
  specifications2PublishCommandRepositoryFactory = createSpecifications2PublishCommandRepository,
  specifications2WorkOrderCommandRepositoryFactory = createSpecifications2WorkOrderCommandRepository,
  specifications2AttachmentRepositoryFactory = createSpecifications2AttachmentRepository,
  // The additive dispatch endpoint has its own focused HTTP contract. Keeping
  // its factory injectable lets that contract run without a live PostgreSQL
  // database and does not alter the existing global shift-execution route.
  shiftExecutionReadRepositoryFactory = createShiftExecutionReadRepository,
  shiftExecutionCommandRepositoryFactory = createShiftExecutionCommandRepository,
  shiftExecutionSessionResolver = inspectShiftExecutionCommandSession,
  shiftExecutionAuthorizationResolver = getCurrentShiftExecutionAuthorization,
  planningAuthorizationResolver = resolvePlanningCommandAuthorization,
  systemDomainsProductionStructureAuthorizationResolver = resolveSystemDomainsProductionStructureAuthorization,
  systemDomainsProductionStructureImpactResolver = validateSystemDomainsProductionStructureImpact,
  systemDomainsProductionStructureLockRunner = withProductionResourceDependencyExclusiveLock,
} = {}) {
  if (!url.pathname.startsWith(API_PREFIX)) return false;
  const isPlanningWorkbenchBootstrap = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/work-orders/bootstrap`;
  const isPlanningCommandCapabilities = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/work-orders/capabilities`;
  const isPlanningRuntimeProjectionRead = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/work-orders/projection`;
  const isPlanningGanttWindowRead = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/gantt-window`;
  const planningBootstrapTiming = isPlanningWorkbenchBootstrap
    ? { startedAt: getRequestTimingNow(), planningSafetyMs: 0 }
    : null;
  const orderMatch = url.pathname.match(/^\/api\/v1\/planning\/work-orders\/([^/]+)$/);
  const startDateMatch = url.pathname.match(/^\/api\/v1\/planning\/work-orders\/([^/]+)\/start-date$/);
  const slotMatch = url.pathname.match(/^\/api\/v1\/planning\/work-orders\/([^/]+)\/operations\/([^/]+)\/slot$/);
  const specifications2RevisionMatch = url.pathname.match(/^\/api\/v1\/specifications2\/revisions\/(?!summary$)([^/]+)$/);
  const specifications2SourceMatch = url.pathname.match(/^\/api\/v1\/specifications2\/revisions\/by-source\/([^/]+)$/);
  const specifications2WorkOrderCommandMatch = url.pathname.match(/^\/api\/v1\/specifications2\/revisions\/([^/]+)\/work-orders$/);
  const specifications2AttachmentMatch = url.pathname.match(/^\/api\/v1\/specifications2\/attachments\/([^/]+)$/);
  const isSpecifications2PublishCommand = req.method === "POST" && url.pathname === `${API_PREFIX}/specifications2/revisions`;
  const isSpecifications2AttachmentCommand = req.method === "POST" && url.pathname === `${API_PREFIX}/specifications2/attachments`;
  const isSpecifications2AttachmentRead = req.method === "GET" && Boolean(specifications2AttachmentMatch);
  const isSystemDomainsRead = req.method === "GET" && (url.pathname === `${API_PREFIX}/system-domains` || url.pathname === `${API_PREFIX}/system-domains/summary`);
  const isSystemDomainsConsistencyRead = req.method === "GET" && url.pathname === `${API_PREFIX}/system-domains/consistency`;
  const isDomainReadinessRead = req.method === "GET" && url.pathname === `${API_PREFIX}/domain-readiness`;
  const isSystemDomainsWrite = req.method === "PUT" && url.pathname === `${API_PREFIX}/system-domains`;
  const isShiftExecutionAssignmentCommand = req.method === "POST" && url.pathname === `${API_PREFIX}/workshop/shift-execution/assignments`;
  const shiftAssignmentMatch = url.pathname.match(/^\/api\/v1\/workshop\/shift-execution\/assignments\/([^/]+)$/);
  const shiftFactMatch = url.pathname.match(/^\/api\/v1\/workshop\/shift-execution\/assignments\/([^/]+)\/facts$/);
  const isShiftExecutionCarryoverCommand = req.method === "POST" && url.pathname === `${API_PREFIX}/workshop/shift-execution/carryovers`;
  const shiftCarryoverMatch = url.pathname.match(/^\/api\/v1\/workshop\/shift-execution\/carryovers\/([^/]+)$/);
  const isShiftExecutionCarryoverCancel = req.method === "PATCH" && Boolean(shiftCarryoverMatch);
  const isShiftExecutionAssignmentUpdate = req.method === "PATCH" && Boolean(shiftAssignmentMatch);
  const isShiftExecutionFactCommand = req.method === "POST" && Boolean(shiftFactMatch);
  const isShiftExecutionDispatchRead = req.method === "GET" && url.pathname === `${API_PREFIX}/workshop/shift-execution/dispatch`;
  const isOrderPatch = req.method === "PATCH" && Boolean(orderMatch);
  const isStartDatePatch = req.method === "PATCH" && Boolean(startDateMatch);
  const isSlotPatch = req.method === "PATCH" && Boolean(slotMatch);
  const isPlanningMutation = isOrderPatch || isStartDatePatch || isSlotPatch;
  const isPlanningPeriodRead = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/period`;
  const isSpecifications2WorkOrderCommand = req.method === "POST" && Boolean(specifications2WorkOrderCommandMatch);
  if (req.method !== "GET" && !isOrderPatch && !isStartDatePatch && !isSlotPatch && !isSpecifications2WorkOrderCommand && !isSpecifications2PublishCommand && !isSpecifications2AttachmentCommand && !isSystemDomainsWrite && !isShiftExecutionAssignmentCommand && !isShiftExecutionAssignmentUpdate && !isShiftExecutionFactCommand && !isShiftExecutionCarryoverCommand && !isShiftExecutionCarryoverCancel) {
    sendJson(res, headers, 405, { ok: false, error: "Method is not allowed" });
    return true;
  }
  const isShiftExecutionMutation = isShiftExecutionAssignmentCommand || isShiftExecutionAssignmentUpdate
    || isShiftExecutionFactCommand || isShiftExecutionCarryoverCommand || isShiftExecutionCarryoverCancel;
  if (isSpecifications2WorkOrderCommand || isSpecifications2PublishCommand || isSpecifications2AttachmentCommand || isShiftExecutionMutation || isPlanningMutation) {
    const contentType = String(getRequestHeader(req, "content-type") || "").trim().toLowerCase();
    if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
      const commandLabel = isPlanningMutation ? "Planning" : isShiftExecutionMutation ? "Shift Execution" : "Specifications 2.0";
      sendJson(res, headers, 415, {
        ok: false,
        apiVersion: "v1",
        code: "json-content-type-required",
        error: `${commandLabel} commands require application/json`,
      });
      return true;
    }
    if (!hasSameOriginRequestContext(req)) {
      const commandLabel = isPlanningMutation ? "Planning" : isShiftExecutionMutation ? "Shift Execution" : "Specifications 2.0";
      sendJson(res, headers, 403, {
        ok: false,
        apiVersion: "v1",
        code: "same-origin-required",
        error: `${commandLabel} commands require a same-origin browser request`,
      });
      return true;
    }
  }

  // This is the server-side owner switch, not a client capability hint.  It
  // must fail closed before signed-session/RBAC resolution and before the
  // Planning repository is constructed, so deactivation leaves legacy as the
  // only writer even while an old browser still holds valid cookies.
  if ((isOrderPatch || isSlotPatch) && String(env.MES_ENABLE_PLANNING_SERVER_COMMANDS || "").trim() !== "1") {
    sendJson(res, headers, 503, {
      ok: false,
      apiVersion: "v1",
      code: "planning-command-owner-disabled",
      error: "Planning command owner is disabled",
    });
    return true;
  }
  if (isStartDatePatch && String(env.MES_ENABLE_PLANNING_START_DATE_COMMANDS || "").trim() !== "1") {
    sendJson(res, headers, 503, {
      ok: false,
      apiVersion: "v1",
      code: "planning-start-date-owner-disabled",
      error: "Planning start-date owner is disabled",
    });
    return true;
  }

  // Planning authorization is deliberately resolved before constructing or
  // health-checking the work-order repository. An anonymous, expired, revoked
  // or unauthorized caller must not touch Planning storage or learn its health
  // merely by targeting a write endpoint.
  let planningAuthorization = null;
  if (isPlanningMutation || isPlanningCommandCapabilities) {
    try {
      const resolved = typeof planningAuthorizationResolver === "function"
        ? await planningAuthorizationResolver(req, { env })
        : { allowed: false, reason: "planning-authorization-unavailable", infrastructureUnavailable: true };
      planningAuthorization = inspectPlanningCommandAuthorizationResult(resolved);
    } catch {
      planningAuthorization = inspectPlanningCommandAuthorizationResult({
        allowed: false,
        reason: "planning-authorization-unavailable",
        infrastructureUnavailable: true,
      });
    }
    if (!planningAuthorization.allowed) {
      sendPlanningAuthorizationFailure(
        res,
        headers,
        planningAuthorization,
        isPlanningCommandCapabilities
          ? "Planning command capability evaluation"
          : isSlotPatch
          ? "rescheduling a Planning slot"
          : isStartDatePatch
            ? "changing a Planning work-order start date"
            : "changing a Planning work-order quantity",
      );
      return true;
    }
  }

  const planningPeriod = (isPlanningPeriodRead || isPlanningGanttWindowRead) ? readPlanningPeriod(url) : null;
  if (planningPeriod?.error) {
    sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: planningPeriod.error });
    return true;
  }
  const planningPeriodView = isPlanningPeriodRead ? readPlanningPeriodView(url) : "";
  if (isPlanningPeriodRead && !planningPeriodView) {
    sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "planning period view must be projection or weekly" });
    return true;
  }
  const shiftExecutionDispatchQuery = isShiftExecutionDispatchRead ? readShiftExecutionDispatchQuery(url) : null;
  if (shiftExecutionDispatchQuery?.error) {
    sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: shiftExecutionDispatchQuery.error });
    return true;
  }

  // This compact read belongs to the workshop alone.  It must not open the
  // broader work-order repository or run its health/parity aggregates before
  // reading one visible shift scope.
  if (isShiftExecutionDispatchRead) {
    let shifts;
    try {
      shifts = shiftExecutionReadRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = await shifts.listDispatch({
        sourceRowIds: shiftExecutionDispatchQuery.sourceRowIds,
        workCenterIds: shiftExecutionDispatchQuery.workCenterIds,
        dateKey: shiftExecutionDispatchQuery.dateKey,
      });
      const authority = await inspectShiftExecutionAuthority({ primary: shifts, env, filePath });
      const payload = {
        ok: true,
        apiVersion: "v1",
        ...result,
        // Complete means complete for the exact requested board scope and is
        // only promoted after the global compatibility snapshot was imported,
        // proved and durably retired.
        coverageComplete: authority.serverAuthoritative === true,
        authority: { serverAuthoritative: authority.serverAuthoritative === true, reason: authority.reason || "" },
      };
      const etag = getPayloadEtag(payload);
      if (matchesEtag(req, etag)) sendNotModified(res, headers, etag);
      else sendJson(res, headers, 200, payload, { ETag: etag });
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution dispatch storage is unavailable" });
    } finally {
      await shifts?.close?.();
    }
    return true;
  }

  let workOrders;
  try {
    workOrders = await workOrdersRepositoryFactory({ env, filePath });
  } catch (error) {
    sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Domain storage is unavailable" }, planningBootstrapTiming ? {
      "Server-Timing": getPlanningBootstrapServerTiming({ startedAt: planningBootstrapTiming.startedAt }),
    } : {});
    return true;
  }

  // A verified observed-marker cache must be checked before the broad
  // `workOrders.health()` gate.  On the ordinary path that gate triggers a
  // health aggregate plus compatibility checks even though the durable marker
  // already proves that this exact cached graph is still current. The cache
  // reader does one marker lookup and fails closed into the existing path on
  // every mismatch, missing migration, repository change, or read error.
  if (isPlanningRuntimeProjectionRead) {
    const projectionCacheTimingStartedAt = getRequestTimingNow();
    const cached = await readObservedPlanningRuntimeProjectionCache({ filePath, env, primary: workOrders });
    if (cached) {
      const serverTiming = getPlanningRuntimeProjectionCacheServerTiming({
        cache: "hit",
        startedAt: projectionCacheTimingStartedAt,
      });
      if (matchesEtag(req, cached.etag)) {
        sendNotModified(res, headers, cached.etag, { "Server-Timing": serverTiming });
        return true;
      }
      sendCachedPlanningRuntimeProjection(res, headers, cached, { ETag: cached.etag, "Server-Timing": serverTiming });
      return true;
    }
  }

  // The first Planning render is the only route that can take a bounded
  // atomic PostgreSQL snapshot under the observed snapshot-generation lock.
  // On a healthy marker this replaces the ordinary health + marker +
  // post-read-marker waves.  The repository locks all source tables before
  // the singleton marker, so a concurrent primary or snapshot writer is
  // ordered on one safe side of the returned aggregate.  If it cannot prove
  // that exact condition, do not reuse any partial result: the established
  // generic safety path below remains the compatibility fallback.
  if (isPlanningWorkbenchBootstrap
    && isPlanningSnapshotObservationEnabled(env)
    && typeof workOrders.readObservedWorkbenchBootstrap === "function") {
    const requestedId = String(url.searchParams.get("active") || "").trim();
    let atomicBootstrap = null;
    try {
      atomicBootstrap = await workOrders.readObservedWorkbenchBootstrap(requestedId, {
        contractVersion: PLANNING_PROJECTION_PARITY_CONTRACT_VERSION,
      });
    } catch {
      // A failed fast path is deliberately indistinguishable from an
      // unavailable additive migration here.  The route below rechecks the
      // full compatibility contract before choosing any source.
      atomicBootstrap = null;
    }
    if (atomicBootstrap?.admitted === true
      && atomicBootstrap?.result
      && String(atomicBootstrap.result.storageBackend || "") === "postgresql"
      && hasMatchingPlanningSnapshotObservationMarker(atomicBootstrap.markerState)) {
      const result = atomicBootstrap.result;
      const payload = {
        ok: true,
        apiVersion: "v1",
        ...result,
        item: result.item ? buildPlanningWorkbenchDetail(result.item) : null,
      };
      const etag = getPayloadEtag(payload);
      const serverTiming = getPlanningBootstrapServerTiming({
        // The atomic repository transaction is the safety proof for this
        // narrow route, so an independent health aggregate is intentionally
        // absent from the admitted fast path.
        planningSafetyMs: 0,
        parityGuardMs: atomicBootstrap.timing?.parityGuardMs,
        bootstrapReadMs: atomicBootstrap.timing?.bootstrapReadMs,
        startedAt: planningBootstrapTiming?.startedAt,
      });
      if (matchesEtag(req, etag)) {
        sendNotModified(res, headers, etag, { "Server-Timing": serverTiming });
        return true;
      }
      sendJson(res, headers, 200, payload, { ETag: etag, "Server-Timing": serverTiming });
      return true;
    }
  }

  const planningSafetyStartedAt = planningBootstrapTiming ? getRequestTimingNow() : 0;
  const health = await workOrders.health();
  if (planningBootstrapTiming) {
    // Primary health is the planning safety gate's precondition. Keep it
    // separate from the parity proof so a slow primary is visible on its own.
    planningBootstrapTiming.planningSafetyMs = getElapsedTimingMs(planningSafetyStartedAt);
  }
  const meta = { apiVersion: "v1", ...getPublicDomainHealth(health) };
  // Build the parity result only for a planning-sensitive route and reuse it
  // within that request. The shared helper additionally caches its bounded
  // diagnostic comparison across requests.
  let planningSafetyPromise = null;
  const getPlanningSafety = ({ forceFullParity = false } = {}) => {
    if (forceFullParity || !planningSafetyPromise) {
      planningSafetyPromise = inspectPlanningProjectionSafety({
        primary: workOrders,
        primaryHealth: health,
        env,
        filePath,
        createRepository: workOrdersRepositoryFactory,
        forceFullParity,
      });
    }
    return planningSafetyPromise;
  };

  if (isPlanningCommandCapabilities) {
    let startDateReadiness = { schemaReady: false, error: "Planning start-date readiness is unavailable" };
    try {
      if (typeof workOrders.startDateCommandReadiness === "function") {
        startDateReadiness = await workOrders.startDateCommandReadiness();
      }
    } catch (error) {
      startDateReadiness = { schemaReady: false, error: error?.message || "Planning start-date readiness is unavailable" };
    }
    const ownerConfigured = String(env.MES_ENABLE_PLANNING_START_DATE_COMMANDS || "").trim() === "1"
      && health.storageBackend === "postgresql";
    const planningSafety = ownerConfigured && startDateReadiness.schemaReady === true
      ? await getPlanningSafety()
      : null;
    sendJson(res, headers, 200, {
      ok: true,
      apiVersion: "v1",
      authenticated: true,
      actor: {
        id: planningAuthorization.actor.id,
        employeeId: planningAuthorization.actor.employeeId,
        displayName: planningAuthorization.actor.displayName,
        personnelNumber: planningAuthorization.actor.personnelNumber,
      },
      rbacRevision: planningAuthorization.revision,
      capabilities: {
        canEditPlanning: true,
        startDateOwnerConfigured: ownerConfigured,
        startDateSchemaReady: startDateReadiness.schemaReady === true,
        startDateEnabled: ownerConfigured
          && startDateReadiness.schemaReady === true
          && !planningSafety?.fallbackReason,
        quantityEnabled: String(env.MES_ENABLE_PLANNING_SERVER_COMMANDS || "").trim() === "1"
          && health.storageBackend === "postgresql"
          && !planningSafety?.fallbackReason,
        slotScheduleEnabled: String(env.MES_ENABLE_PLANNING_SERVER_COMMANDS || "").trim() === "1"
          && health.storageBackend === "postgresql"
          && !planningSafety?.fallbackReason,
        storageBackend: String(health.storageBackend || ""),
        ...(planningSafety?.fallbackReason ? { fallbackReason: planningSafety.fallbackReason } : {}),
        ...(startDateReadiness.error ? { startDateReadinessError: String(startDateReadiness.error) } : {}),
      },
    });
    return true;
  }
  let specifications2AuthorizationPromise = null;
  const getSpecifications2Authorization = () => {
    if (!specifications2AuthorizationPromise) {
      specifications2AuthorizationPromise = Promise.resolve()
        .then(() => {
          if (typeof specifications2AuthorizationResolver !== "function") {
            return { allowed: false, reason: "specifications2-authorization-unavailable", infrastructureUnavailable: true };
          }
          return specifications2AuthorizationResolver(req, { env });
        })
        .then(inspectSpecifications2CommandAuthorizationResult)
        .catch(() => inspectSpecifications2CommandAuthorizationResult({
          allowed: false,
          reason: "specifications2-authorization-unavailable",
          infrastructureUnavailable: true,
        }));
    }
    return specifications2AuthorizationPromise;
  };

  if (url.pathname === `${API_PREFIX}/specifications2/capabilities`) {
    let attachmentUploadEnabled = false;
    let revisionPublicationSchemaReady = false;
    let workOrderCommandSchemaReady = false;
    const revisionPublicationPrimaryConfigured = isSpecifications2RevisionPublicationPrimaryConfigured(env);
    const workOrderCommandConfigured = String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1";
    const attachmentCommandConfigured = String(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS || "") === "1";
    const workOrderCommandRequested = String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1"
      && health.storageBackend === "postgresql"
      && typeof workOrders.listPendingSnapshotSyncs === "function";
    const authorization = revisionPublicationPrimaryConfigured || workOrderCommandConfigured || attachmentCommandConfigured
      ? await getSpecifications2Authorization()
      : inspectSpecifications2CommandAuthorizationResult({ allowed: false, reason: "server-commands-not-configured" });
    if (authorization.infrastructureUnavailable) {
      sendSpecifications2AuthorizationFailure(res, headers, authorization, "command capability evaluation");
      return true;
    }
    const planningSafety = workOrderCommandRequested && authorization.allowed ? await getPlanningSafety() : null;
    if (attachmentCommandConfigured && health.storageBackend === "postgresql" && authorization.allowed) {
      let attachments;
      try {
        attachments = specifications2AttachmentRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        attachmentUploadEnabled = (await attachments.commandReadiness()).schemaReady === true;
      } catch {
        attachmentUploadEnabled = false;
      } finally { await attachments?.close?.(); }
    }
    // Schema readiness is observable before the rollout flag is enabled so a
    // root-only activation script can fail closed without first exposing the
    // browser command surface.
    if (health.storageBackend === "postgresql") {
      let publications;
      let workOrderCommands;
      try {
        publications = specifications2PublishCommandRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        revisionPublicationSchemaReady = (await publications.commandReadiness()).schemaReady === true;
      } catch {
        revisionPublicationSchemaReady = false;
      } finally { await publications?.close?.(); }
      try {
        workOrderCommands = specifications2WorkOrderCommandRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        workOrderCommandSchemaReady = (await workOrderCommands.commandReadiness()).schemaReady === true;
      } catch {
        workOrderCommandSchemaReady = false;
      } finally { await workOrderCommands?.close?.(); }
    }
    const revisionPublicationEnabled = revisionPublicationPrimaryConfigured
      && health.storageBackend === "postgresql"
      && revisionPublicationSchemaReady
      && authorization.allowed;
    sendJson(res, headers, 200, {
      ok: true,
      apiVersion: "v1",
      authenticated: authorization.authenticated,
      actor: authorization.actor ? {
        id: authorization.actor.id,
        employeeId: authorization.actor.employeeId,
        displayName: authorization.actor.displayName,
        personnelNumber: authorization.actor.personnelNumber,
      } : null,
      rbacRevision: authorization.revision,
      authorizationReason: authorization.reason,
      capabilities: {
        canEditSpecifications2: authorization.allowed,
        workOrderCreationEnabled: workOrderCommandRequested && workOrderCommandSchemaReady && !planningSafety?.fallbackReason && authorization.allowed,
        workOrderCreationSchemaReady: workOrderCommandSchemaReady,
        revisionPublicationEnabled,
        // When enabled the command is the durable first write.  Clients must
        // wait for its acknowledgement before producing the legacy-compatible
        // browser projection, otherwise a failed PostgreSQL command would look
        // like a successful production publication.
        revisionPublicationServerPrimary: revisionPublicationPrimaryConfigured,
        revisionPublicationPrimaryConfigured,
        revisionPublicationSchemaReady,
        attachmentUploadEnabled,
        workOrderPrimaryPostgres: health.storageBackend === "postgresql",
        ...(planningSafety?.fallbackReason ? { workOrderFallbackReason: planningSafety.fallbackReason } : {}),
      },
    });
    return true;
  }

  if (url.pathname === `${API_PREFIX}/system-domains/capabilities`) {
    const enabledSurfaces = getEnabledSystemDomainsCommandSurfaces(env);
    const commandRequested = enabledSurfaces.length > 0 && health.storageBackend === "postgresql";
    const actorAuthorization = getSystemDomainsCommandActorAuthorization(getPublicAuthPrincipal(req, env), env);
    let productionStructureAuthorization = projectSystemDomainsProductionStructureAuthorization({
      allowed: false,
      reason: actorAuthorization.authorized ? "employee-session-required" : actorAuthorization.reason,
    });
    if (commandRequested && enabledSurfaces.includes("production-structure") && actorAuthorization.authorized) {
      try {
        const resolved = typeof systemDomainsProductionStructureAuthorizationResolver === "function"
          ? await systemDomainsProductionStructureAuthorizationResolver(req, { env })
          : { allowed: false, reason: "production-structure-authorization-unavailable", infrastructureUnavailable: true };
        productionStructureAuthorization = projectSystemDomainsProductionStructureAuthorization(resolved);
      } catch {
        productionStructureAuthorization = projectSystemDomainsProductionStructureAuthorization({
          allowed: false,
          reason: "production-structure-authorization-unavailable",
          infrastructureUnavailable: true,
        });
      }
    }
    let consistency = null;
    let commandReadiness = { schemaReady: false, error: "System Domains PostgreSQL command schema is unavailable" };
    if (health.storageBackend === "postgresql") {
      let domains;
      try {
        domains = createSystemDomainsRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        commandReadiness = await domains.commandReadiness();
        if (commandRequested) {
        consistency = await inspectSystemDomainsSnapshotConsistency({ primary: domains, env, filePath });
        }
      } catch (error) {
        commandReadiness = { schemaReady: false, error: error?.message || "System Domains command schema readiness is unavailable" };
        if (commandRequested) consistency = { ok: false, matches: false, error: error?.message || "System Domains consistency check is unavailable" };
      } finally { await domains?.close?.(); }
    }
    const serverAuthoritative = hasSystemDomainsServerAuthority(consistency, enabledSurfaces);
    const serverCommandsConfigured = commandRequested && commandReadiness.schemaReady === true
      && serverAuthoritative && actorAuthorization.policyConfigured;
    const productionStructureWriteEnabled = serverCommandsConfigured
      && actorAuthorization.authorized
      && enabledSurfaces.includes("production-structure")
      && productionStructureAuthorization.canEdit
      && Number(productionStructureAuthorization.revision || 0) === Number(consistency?.revision || 0);
    const serverCommandSurfaces = serverCommandsConfigured && actorAuthorization.authorized
      ? enabledSurfaces.filter((surface) => surface !== "production-structure" || productionStructureWriteEnabled)
      : [];
    const serverCommandsEnabled = serverCommandSurfaces.length > 0;
    sendJson(res, headers, 200, { ok: true, apiVersion: "v1", capabilities: {
      // The rollout flag is deliberately insufficient by itself. A command
      // writer is exposed only when its compatibility projection matches the
      // current PostgreSQL aggregate exactly and the signed public principal
      // is explicitly present in a valid server-side actor policy.  The
      // configured signal remains available to the loopback rollout check,
      // which intentionally has no public browser session.
      serverCommandsConfigured,
      configuredServerCommandSurfaces: serverCommandsConfigured ? enabledSurfaces : [],
      serverCommandsEnabled,
      serverCommandSurfaces,
      actorAuthorization,
      productionStructureWriteEnabled,
      productionStructureAuthorization,
      primaryPostgres: health.storageBackend === "postgresql",
      schemaReady: commandReadiness.schemaReady === true,
      commandReadiness,
      consistency,
    } });
    return true;
  }

  if (url.pathname === `${API_PREFIX}/health`) {
    sendJson(res, headers, 200, { ok: true, ...meta });
    return true;
  }

  if (isDomainReadinessRead) {
    const databaseUrl = env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "";
    let planningSafety = await getPlanningSafety();
    const guardedSummary = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: (repository) => repository.summary(),
    });
    planningSafety = guardedSummary.planningSafety;
    const workOrderSummary = guardedSummary.result;
    const scheduledOperationCount = Number(workOrderSummary?.summary?.scheduledOperationCount || 0);
    const readiness = {
      workOrders: {
        ready: health.storageBackend === "postgresql" && !planningSafety.fallbackReason,
        storageBackend: health.storageBackend,
        revision: health.revision,
        sourceSynchronized: !planningSafety.fallbackReason,
        summary: workOrderSummary.summary || null,
        ...(planningSafety.fallbackReason ? {
          fallbackReason: planningSafety.fallbackReason,
          readStorageBackend: workOrderSummary.storageBackend,
        } : {}),
      },
      systemDomains: { ready: false, storageBackend: "unavailable", sourceSynchronized: false, consistency: null, error: "" },
      specifications2: { ready: false, storageBackend: "unavailable", sourceSynchronized: false, summary: null, error: "" },
      shiftExecution: { ready: false, storageBackend: "unavailable", sourceSynchronized: false, summary: null, migrationState: "unavailable", error: "" },
      commands: {
        specifications2WorkOrderCreation: {
          enabled: false,
          schemaReady: false,
          reason: planningSafety.fallbackReason || commandReadinessReason({
            featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1",
            primaryReady: health.storageBackend === "postgresql",
            schemaReady: false,
            featureName: "Specifications 2.0 work-order creation",
          }),
        },
        specifications2RevisionPublication: {
          enabled: false,
          schemaReady: false,
          reason: commandReadinessReason({
            featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1",
            primaryReady: health.storageBackend === "postgresql",
            schemaReady: false,
            featureName: "Specifications 2.0 revision publication",
          }),
        },
        specifications2AttachmentUpload: { enabled: false, schemaReady: false, reason: "Required PostgreSQL migration is not applied" },
        systemDomains: { enabled: false, surfaces: [], reason: "" },
        shiftExecutionAssignments: { enabled: false },
      },
    };
    let domains;
    let specifications;
    let shifts;
    let publications;
    let workOrderCommands;
    let attachments;
    try {
      domains = createSystemDomainsRepository({ databaseUrl });
      const [summary, consistency] = await Promise.all([
        domains.summary(),
        inspectSystemDomainsSnapshotConsistency({ primary: domains, env, filePath }),
      ]);
      const serverAuthoritative = hasSystemDomainsServerAuthority(consistency, getEnabledSystemDomainsCommandSurfaces(env));
      readiness.systemDomains = {
        ready: summary.storageBackend === "postgresql" && serverAuthoritative,
        storageBackend: summary.storageBackend,
        revision: summary.revision,
        summary: summary.summary,
        consistency,
        sourceSynchronized: serverAuthoritative,
        error: "",
      };
      const enabledSurfaces = getEnabledSystemDomainsCommandSurfaces(env);
      readiness.commands.systemDomains = {
        enabled: serverAuthoritative,
        surfaces: enabledSurfaces,
        reason: enabledSurfaces.length ? "" : "Feature flag is disabled during controlled rollout",
      };
    } catch (error) {
      readiness.systemDomains.error = error?.message || "System Domains readiness is unavailable";
    } finally { await domains?.close?.(); }
    try {
      specifications = createSpecifications2ReadRepository({ databaseUrl });
      const summary = await specifications.summary();
      readiness.specifications2 = {
        ready: summary.storageBackend === "postgresql",
        storageBackend: summary.storageBackend,
        summary: summary.summary,
        sourceSynchronized: true,
        error: "",
      };
    } catch (error) {
      readiness.specifications2.error = error?.message || "Specifications 2.0 readiness is unavailable";
    } finally { await specifications?.close?.(); }
    try {
      workOrderCommands = specifications2WorkOrderCommandRepositoryFactory({ databaseUrl });
      const commandReadiness = await workOrderCommands.commandReadiness();
      const workOrderPrimaryReady = health.storageBackend === "postgresql"
        && typeof workOrders.listPendingSnapshotSyncs === "function";
      readiness.commands.specifications2WorkOrderCreation = {
        enabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1"
          && workOrderPrimaryReady
          && commandReadiness.schemaReady === true
          && !planningSafety.fallbackReason,
        schemaReady: commandReadiness.schemaReady === true,
        reason: planningSafety.fallbackReason || commandReadinessReason({
          featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1",
          primaryReady: workOrderPrimaryReady,
          schemaReady: commandReadiness.schemaReady === true,
          featureName: "Specifications 2.0 work-order creation",
        }),
      };
    } catch (error) {
      readiness.commands.specifications2WorkOrderCreation = {
        enabled: false,
        schemaReady: false,
        reason: error?.message || "Specifications 2.0 work-order command storage is unavailable",
      };
    } finally { await workOrderCommands?.close?.(); }
    try {
      publications = specifications2PublishCommandRepositoryFactory({ databaseUrl });
      const commandReadiness = await publications.commandReadiness();
      readiness.commands.specifications2RevisionPublication = {
        enabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1"
          && health.storageBackend === "postgresql" && commandReadiness.schemaReady === true,
        schemaReady: commandReadiness.schemaReady === true,
        reason: commandReadinessReason({
          featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1",
          primaryReady: health.storageBackend === "postgresql",
          schemaReady: commandReadiness.schemaReady === true,
          featureName: "Specifications 2.0 revision publication",
        }),
      };
    } catch (error) {
      readiness.commands.specifications2RevisionPublication = {
        enabled: false,
        schemaReady: false,
        reason: error?.message || "Specifications 2.0 publication storage is unavailable",
      };
    } finally { await publications?.close?.(); }
    try {
      shifts = shiftExecutionReadRepositoryFactory({ databaseUrl });
      const summary = await shifts.summary();
      const commandReadiness = await shifts.commandReadiness();
      const authority = await inspectShiftExecutionAuthority({ primary: shifts, env, filePath });
      readiness.shiftExecution = {
        ready: summary.storageBackend === "postgresql" && authority.serverAuthoritative === true,
        storageBackend: summary.storageBackend,
        summary: summary.summary,
        sourceSynchronized: authority.serverAuthoritative === true,
        migrationState: authority.serverAuthoritative === true ? "postgres-primary" : authority.reason || "authority-unavailable",
        authority,
        plannedOperationCount: scheduledOperationCount,
        error: "",
      };
      readiness.commands.shiftExecutionAssignments = {
        enabled: String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") === "1"
          && health.storageBackend === "postgresql" && commandReadiness.schemaReady === true,
        schemaReady: commandReadiness.schemaReady === true,
        reason: commandReadinessReason({
          featureEnabled: String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") === "1",
          primaryReady: health.storageBackend === "postgresql",
          schemaReady: commandReadiness.schemaReady === true,
          featureName: "Shift execution assignments",
        }),
      };
    } catch (error) {
      readiness.shiftExecution.error = error?.message || "Shift execution readiness is unavailable";
    } finally { await shifts?.close?.(); }
    try {
      attachments = createSpecifications2AttachmentRepository({ databaseUrl });
      const commandReadiness = await attachments.commandReadiness();
      readiness.commands.specifications2AttachmentUpload = {
        enabled: String(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS || "") === "1"
          && health.storageBackend === "postgresql" && commandReadiness.schemaReady === true,
        schemaReady: commandReadiness.schemaReady === true,
        reason: commandReadinessReason({
          featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS || "") === "1",
          primaryReady: health.storageBackend === "postgresql",
          schemaReady: commandReadiness.schemaReady === true,
          featureName: "Specifications 2.0 attachment upload",
        }),
      };
    } catch (error) {
      readiness.commands.specifications2AttachmentUpload = {
        enabled: false,
        schemaReady: false,
        reason: error?.message || "Attachment command storage is unavailable",
      };
    } finally { await attachments?.close?.(); }
    const required = [readiness.workOrders, readiness.systemDomains, readiness.specifications2, readiness.shiftExecution];
    sendJson(res, headers, 200, {
      ok: true,
      apiVersion: "v1",
      status: required.every((item) => item.ready && item.sourceSynchronized !== false) ? "ready" : "attention",
      readiness,
    });
    return true;
  }

  if (url.pathname === `${API_PREFIX}/workshop/shift-execution/capabilities`) {
    if (health.storageBackend !== "postgresql") {
      sendJson(res, headers, 200, { ok: true, apiVersion: "v1", capabilities: {
        assignmentCreationEnabled: false, carryoverCancellationEnabled: false, primaryPostgres: false, schemaReady: false,
      } });
      return true;
    }
    let shifts;
    try {
      shifts = shiftExecutionReadRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const commandReadiness = await shifts.commandReadiness();
      const authority = await inspectShiftExecutionAuthority({ primary: shifts, env, filePath });
      const commandsEnabled = String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") === "1" && health.storageBackend === "postgresql" && commandReadiness.schemaReady === true;
      sendJson(res, headers, 200, { ok: true, apiVersion: "v1", capabilities: {
        assignmentCreationEnabled: commandsEnabled,
        carryoverCancellationEnabled: commandsEnabled,
        primaryPostgres: health.storageBackend === "postgresql",
        schemaReady: commandReadiness.schemaReady === true,
        serverAuthoritative: authority.serverAuthoritative === true,
        authority: { reason: authority.reason || "", compatibility: authority.compatibility || null },
      } });
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution command storage is unavailable" });
    } finally { await shifts?.close?.(); }
    return true;
  }

  if (isShiftExecutionMutation) {
    if (String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") !== "1" || health.storageBackend !== "postgresql") {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Shift execution server commands are not enabled during snapshot migration" });
      return true;
    }

    let session;
    try {
      session = typeof shiftExecutionSessionResolver === "function"
        ? await shiftExecutionSessionResolver(req, { env })
        : { principal: null, reason: "shift-execution-authorization-unavailable", infrastructureUnavailable: true };
    } catch {
      session = { principal: null, reason: "shift-execution-authorization-unavailable", infrastructureUnavailable: true };
    }
    const actor = normalizeShiftExecutionEmployeeActor(session?.principal);
    if (!actor) {
      sendShiftExecutionAuthorizationFailure(res, headers, {
        actor: null,
        infrastructureUnavailable: session?.infrastructureUnavailable === true
          || isShiftExecutionAuthorizationInfrastructureReason(session?.reason),
      }, "modifying Shift Execution");
      return true;
    }

    let payload;
    try { payload = await readRequestBody(req, { maxBytes: SHIFT_EXECUTION_COMMAND_BODY_MAX_BYTES }); }
    catch (error) {
      const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
      sendJson(res, headers, tooLarge ? 413 : 400, {
        ok: false,
        apiVersion: "v1",
        error: tooLarge ? "Shift Execution command request is too large" : "Request body must be valid JSON",
      });
      return true;
    }

    let assignmentId = "";
    let carryoverId = "";
    let workOrderId = "";
    let operationId = "";
    try {
      assignmentId = isShiftExecutionAssignmentUpdate
        ? decodeURIComponent(shiftAssignmentMatch[1])
        : isShiftExecutionFactCommand
          ? decodeURIComponent(shiftFactMatch[1])
          : isShiftExecutionCarryoverCommand
            ? String(payload?.sourceAssignmentId || "").trim()
            : "";
      carryoverId = isShiftExecutionCarryoverCancel ? decodeURIComponent(shiftCarryoverMatch[1]) : "";
      workOrderId = isShiftExecutionAssignmentCommand ? String(payload?.workOrderId || "").trim() : "";
      operationId = isShiftExecutionAssignmentCommand ? String(payload?.operationId || "").trim() : "";
    } catch {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Shift Execution command target id is invalid" });
      return true;
    }
    if (isShiftExecutionAssignmentCommand && (!workOrderId || !operationId)) {
      sendJson(res, headers, 422, {
        ok: false,
        apiVersion: "v1",
        code: "shift-execution-command-invalid",
        error: "Shift assignment workOrderId and operationId are required",
      });
      return true;
    }

    let commandReadiness;
    let targetContext = null;
    let readRepository;
    try {
      readRepository = shiftExecutionReadRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      commandReadiness = await readRepository.commandReadiness();
      const hasCanonicalTarget = Boolean(assignmentId || carryoverId || (workOrderId && operationId));
      if (commandReadiness.schemaReady === true && hasCanonicalTarget) {
        if (typeof readRepository.getCommandTargetContext !== "function") {
          throw new Error("Shift Execution canonical command target reader is unavailable");
        }
        targetContext = (await readRepository.getCommandTargetContext({ assignmentId, carryoverId, workOrderId, operationId })).item || null;
      }
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution command storage is unavailable" });
      return true;
    } finally {
      await readRepository?.close?.();
    }
    if (commandReadiness.schemaReady !== true) {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Shift execution server commands are not enabled during snapshot migration" });
      return true;
    }
    if ((assignmentId || carryoverId || (workOrderId && operationId)) && !targetContext) {
      sendJson(res, headers, 404, { ok: false, apiVersion: "v1", error: "Shift Execution command target was not found" });
      return true;
    }

    const submittedWorkCenterId = String(payload?.workCenterId || "").trim();
    const canonicalWorkCenterId = String(targetContext?.workCenterId || "").trim();
    const workCenterId = targetContext ? canonicalWorkCenterId : submittedWorkCenterId;
    if (!workCenterId) {
      sendJson(res, headers, targetContext ? 503 : 400, {
        ok: false,
        apiVersion: "v1",
        error: targetContext
          ? "Shift Execution canonical command target is incomplete"
          : "Shift Execution work center is required",
      });
      return true;
    }
    if (targetContext && submittedWorkCenterId && submittedWorkCenterId !== workCenterId) {
      sendJson(res, headers, 409, {
        ok: false,
        apiVersion: "v1",
        code: "shift-execution-target-context-mismatch",
        error: "Shift Execution command work center does not match the canonical PostgreSQL target",
      });
      return true;
    }

    const canonicalPayload = { ...payload, workCenterId };
    const canonicalReferenceKeys = isShiftExecutionAssignmentUpdate
      ? ["sourceRowId", "sourceSlotId", "workOrderId", "operationId"]
      : isShiftExecutionCarryoverCommand
        ? ["sourceSlotId", "workOrderId", "operationId"]
        : [];
    const missingCanonicalReference = canonicalReferenceKeys.find((key) => !String(targetContext?.[key] || "").trim());
    if (missingCanonicalReference) {
      sendJson(res, headers, 503, {
        ok: false,
        apiVersion: "v1",
        error: "Shift Execution canonical command target is incomplete",
      });
      return true;
    }
    const mismatchedCanonicalReference = canonicalReferenceKeys.find((key) => {
      const submitted = String(payload?.[key] || "").trim();
      return Boolean(submitted) && submitted !== String(targetContext?.[key] || "").trim();
    });
    if (mismatchedCanonicalReference) {
      sendJson(res, headers, 409, {
        ok: false,
        apiVersion: "v1",
        code: "shift-execution-target-context-mismatch",
        error: "Shift Execution command references do not match the canonical PostgreSQL target",
      });
      return true;
    }
    canonicalReferenceKeys.forEach((key) => { canonicalPayload[key] = String(targetContext[key] || "").trim(); });

    const commandKind = isShiftExecutionAssignmentCommand || isShiftExecutionAssignmentUpdate
      ? "assignment"
      : isShiftExecutionFactCommand
        ? "fact"
        : "carryover";
    const actionLabel = commandKind === "assignment"
      ? "assigning Shift Execution work"
      : commandKind === "fact"
        ? "recording a Shift Execution fact"
        : "maintaining a Shift Execution carryover";
    let authorization;
    try {
      authorization = typeof shiftExecutionAuthorizationResolver === "function"
        ? await shiftExecutionAuthorizationResolver(actor, { env, commandKind, workCenterId })
        : { allowed: false, principal: actor, reason: "shift-execution-authorization-unavailable", infrastructureUnavailable: true };
    } catch {
      authorization = { allowed: false, principal: actor, reason: "shift-execution-authorization-unavailable", infrastructureUnavailable: true };
    }
    const authorizationResult = inspectShiftExecutionAuthorizationResult(authorization);
    if (!authorizationResult.allowed) {
      sendShiftExecutionAuthorizationFailure(res, headers, authorizationResult, actionLabel);
      return true;
    }

    const idempotencyKey = String(req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"] || canonicalPayload?.idempotencyKey || "").trim();
    if (!idempotencyKey || idempotencyKey.length > 160) { sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Idempotency key is required" }); return true; }
    let shifts;
    try {
      shifts = shiftExecutionCommandRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = isShiftExecutionCarryoverCancel
        ? await shifts.cancelCarryover({ ...canonicalPayload, carryoverId, idempotencyKey, actorId: actor.id, authorizedWorkCenterId: workCenterId })
        : isShiftExecutionCarryoverCommand
        ? await shifts.createCarryover({ ...canonicalPayload, idempotencyKey, actorId: actor.id, authorizedWorkCenterId: workCenterId })
        : isShiftExecutionFactCommand
        ? await shifts.recordFact({ ...canonicalPayload, assignmentId, idempotencyKey, actorId: actor.id, authorizedWorkCenterId: workCenterId })
        : isShiftExecutionAssignmentUpdate
        ? await shifts.updateAssignment({ ...canonicalPayload, assignmentId, idempotencyKey, actorId: actor.id, authorizedWorkCenterId: workCenterId })
        : await shifts.createAssignment({ ...canonicalPayload, idempotencyKey, actorId: actor.id, authorizedWorkCenterId: workCenterId });
      if (result.conflict) sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...result, error: result.error || "Shift execution command conflicts with the current server state" });
      else if (!result.item) sendJson(res, headers, 422, { ok: false, apiVersion: "v1", error: result.error || "Shift assignment cannot be saved" });
      else sendJson(res, headers, result.created && !isShiftExecutionCarryoverCancel ? 201 : 200, { ok: true, apiVersion: "v1", ...result });
    } catch (error) {
      if (error?.code === "SHIFT_EXECUTION_AUTHORITY_TRANSITION_PENDING") {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", retryable: true, error: error.message });
      } else if (error?.code === "SHIFT_EXECUTION_AUTHORIZATION_CONTEXT_CHANGED") {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", retryable: true, code: "shift-execution-target-context-changed", error: error.message });
      } else if (error?.code === "SHIFT_EXECUTION_COMMAND_INVALID") {
        sendJson(res, headers, 422, { ok: false, apiVersion: "v1", code: "shift-execution-command-invalid", error: error.message });
      } else if (error?.code === "PRODUCTION_RESOURCE_ARCHIVED") {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", conflict: true, code: "production-resource-archived", resourceId: error.resourceId || "", error: error.message });
      } else sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution command storage is unavailable" });
    }
    finally { await shifts?.close?.(); }
    return true;
  }

  if (isSystemDomainsRead) {
    let domains;
    try {
      domains = createSystemDomainsRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = url.pathname.endsWith("/summary") ? await domains.summary() : await domains.get();
      if (!result.item && !url.pathname.endsWith("/summary")) {
        sendJson(res, headers, 404, { ok: false, apiVersion: "v1", error: "System Domains PostgreSQL projection is not initialized" });
      } else {
        const etag = getRevisionEtag(result.revision);
        if (matchesEtag(req, etag)) sendNotModified(res, headers, etag);
        else sendJson(res, headers, 200, { ok: true, apiVersion: "v1", ...result }, { ETag: etag });
      }
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "System Domains storage is unavailable" });
    } finally { await domains?.close?.(); }
    return true;
  }

  if (isSystemDomainsConsistencyRead) {
    let domains;
    try {
      domains = createSystemDomainsRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const consistency = await inspectSystemDomainsSnapshotConsistency({ primary: domains, env, filePath });
      sendJson(res, headers, consistency.ok ? 200 : 503, { ok: consistency.ok, apiVersion: "v1", consistency });
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "System Domains consistency check is unavailable" });
    } finally { await domains?.close?.(); }
    return true;
  }

  if (isSystemDomainsWrite) {
    const enabledSurfaces = getEnabledSystemDomainsCommandSurfaces(env);
    if (!enabledSurfaces.length) {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "System Domains server commands are not enabled during snapshot migration" });
      return true;
    }
    const actor = getPublicAuthPrincipal(req, env);
    if (!actor) {
      sendJson(res, headers, 401, { ok: false, apiVersion: "v1", error: "Authenticated public session is required to update System Domains" });
      return true;
    }
    if (!isSystemDomainsCommandActorAuthorized(actor, env)) {
      sendJson(res, headers, 403, { ok: false, apiVersion: "v1", error: "System Domains command is not authorized for this session" });
      return true;
    }
    let payload;
    try { payload = await readRequestBody(req); }
    catch { sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Request body must be valid JSON" }); return true; }
    const expected = readExpectedRevision(req, payload);
    const idempotencyKey = String(req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"] || "").trim();
    const surface = String(payload?.surface || "").trim();
    if (expected.error || !Number.isInteger(expected.value) || expected.value < 1 || !payload?.domains || !idempotencyKey || idempotencyKey.length > 160 || !surface) {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: expected.error || "System Domains payload, surface and current revision are required" });
      return true;
    }
    if (!enabledSurfaces.includes(surface)) {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "System Domains command surface is not enabled during snapshot migration", surface, enabledSurfaces });
      return true;
    }
    if (surface !== "production-structure") {
      sendJson(res, headers, 409, {
        ok: false,
        apiVersion: "v1",
        code: "system-domains-surface-not-server-authorized",
        error: "Timesheet and Access Control writes remain disabled until target-scoped employee RBAC and server delta invariants are implemented",
        surface,
      });
      return true;
    }
    let commandActor = actor;
    let productionStructureAuthorization = null;
    if (surface === "production-structure") {
      try {
        const resolved = typeof systemDomainsProductionStructureAuthorizationResolver === "function"
          ? await systemDomainsProductionStructureAuthorizationResolver(req, { env })
          : { allowed: false, reason: "production-structure-authorization-unavailable", infrastructureUnavailable: true };
        productionStructureAuthorization = projectSystemDomainsProductionStructureAuthorization(resolved);
      } catch {
        productionStructureAuthorization = projectSystemDomainsProductionStructureAuthorization({
          allowed: false,
          reason: "production-structure-authorization-unavailable",
          infrastructureUnavailable: true,
        });
      }
      if (!productionStructureAuthorization.authorized) {
        sendSystemDomainsProductionStructureAuthorizationFailure(res, headers, productionStructureAuthorization);
        return true;
      }
      commandActor = productionStructureAuthorization.actor;
    }
    let candidate;
    try { candidate = normalizeSystemDomainsCommandPayload(payload.domains); }
    catch (error) {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: error?.message || "System Domains payload is invalid" });
      return true;
    }
    let domains;
    try {
      const databaseUrl = env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "";
      domains = createSystemDomainsRepository({ databaseUrl });
      const executeCommand = async (commandDomains = domains) => {
      const commandReadiness = await commandDomains.commandReadiness();
      if (commandReadiness.schemaReady !== true) {
        sendJson(res, headers, 409, {
          ok: false,
          apiVersion: "v1",
          code: "system-domains-command-schema-not-ready",
          error: commandReadiness.error || "System Domains command schema is not ready",
          commandReadiness,
        });
        return true;
      }
      const preflightConsistency = await inspectSystemDomainsSnapshotConsistency({ primary: commandDomains, env, filePath });
      if (!hasSystemDomainsServerAuthority(preflightConsistency, enabledSurfaces)) {
        sendJson(res, headers, 409, {
          ok: false,
          apiVersion: "v1",
          error: "System Domains command authority requires a stable compatibility proof",
          consistency: preflightConsistency,
        });
        return true;
      }
      const currentProjection = await commandDomains.get();
      const currentRevisionMatches = Boolean(currentProjection.item) && Number(currentProjection.revision) === expected.value;
      if (!currentRevisionMatches) {
        const replay = await commandDomains.inspectCommandReplay(candidate, {
          idempotencyKey,
          expectedRevision: expected.value,
          actorId: commandActor.id,
        });
        if (replay.matches !== true) {
          sendJson(res, headers, 409, { ok: false, apiVersion: "v1", conflict: true, error: "System Domains revision conflict", revision: currentProjection.revision });
          return true;
        }
      }
      if (!currentProjection.item) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", conflict: true, error: "System Domains revision conflict", revision: currentProjection.revision });
        return true;
      }
      if (currentRevisionMatches) {
        if (surface === "production-structure"
          && Number(productionStructureAuthorization?.revision || 0) !== Number(currentProjection.revision)) {
          sendJson(res, headers, 409, {
            ok: false,
            apiVersion: "v1",
            conflict: true,
            code: "production-structure-authorization-stale",
            revision: currentProjection.revision,
            error: "Production Structure authorization changed before the command could be committed",
          });
          return true;
        }
        const surfaceValidation = validateSystemDomainsSurfaceChange({ current: currentProjection.item, candidate, surface });
        if (!surfaceValidation.ok) {
          sendJson(res, headers, 403, {
            ok: false,
            apiVersion: "v1",
            error: surfaceValidation.error,
            surface,
            forbiddenRegistries: surfaceValidation.forbiddenRegistries,
          });
          return true;
        }
        // Candidate-final parent/lifecycle invariants apply to the complete
        // aggregate on every surface. Otherwise a Timesheet or Access Control
        // PUT could create a schedule/role assignment under an inactive
        // Employee even though Production Structure itself was unchanged.
        // The resolver performs external Equipment checks only when Equipment
        // actually transitions to archived, which surface validation permits
        // solely for production-structure.
        let impact;
        try {
          impact = typeof systemDomainsProductionStructureImpactResolver === "function"
            ? await systemDomainsProductionStructureImpactResolver({
              current: currentProjection.item,
              candidate,
              workOrdersRepository: workOrders,
              shiftExecutionReadRepositoryFactory,
              databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "",
            })
            : { ok: false, unavailable: true, code: "production-structure-impact-unavailable", error: "System Domains final-state validation is unavailable" };
        } catch {
          impact = { ok: false, unavailable: true, code: "production-structure-impact-unavailable", error: "System Domains final-state validation is unavailable" };
        }
        if (impact?.ok !== true) {
          sendJson(res, headers, impact?.unavailable === true ? 503 : 409, {
            ok: false,
            apiVersion: "v1",
            conflict: impact?.unavailable !== true,
            retryable: impact?.unavailable === true,
            code: String(impact?.code || "production-structure-impact-conflict"),
            error: String(impact?.error || "System Domains final-state validation rejected the command"),
            dependencies: Array.isArray(impact?.dependencies) ? impact.dependencies : [],
          });
          return true;
        }
      }
      const result = await commandDomains.replace(candidate, {
        source: `api-command:${surface}`, expectedRevision: expected.value, actorId: commandActor.id, commandType: `replace_projection:${surface}`, idempotencyKey,
      });
      if (result.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", conflict: true, error: "System Domains revision conflict", revision: result.revision });
        return null;
      }
      return { result };
      };
      let commandCommit;
      if (surface === "production-structure") {
        if (typeof systemDomainsProductionStructureLockRunner !== "function") {
          throw new Error("Production Structure dependency lock is unavailable");
        }
        commandCommit = await systemDomainsProductionStructureLockRunner({ databaseUrl }, async (transactionSql) => {
          const transactionDomains = createSystemDomainsRepository({ databaseUrl, transactionSql });
          return executeCommand(transactionDomains);
        });
      } else {
        commandCommit = await executeCommand();
      }
      if (commandCommit?.result) {
        // Snapshot/file publication and the post-commit authority proof are
        // deliberately outside the dependency transaction. The protected
        // current-read/impact/replace unit has already committed atomically;
        // slow compatibility I/O cannot expire its advisory lock mid-write.
        const { result } = commandCommit;
        const projection = await domains.get();
        const snapshotSync = result.imported
          ? await syncPendingSystemDomainsSnapshotChanges({ primary: domains, env, filePath })
          : { total: 0, applied: 0, conflicts: 0, failed: 0, jobs: [] };
        const etag = getRevisionEtag(projection.revision);
        const postCommitConsistency = await inspectSystemDomainsSnapshotConsistency({ primary: domains, env, filePath });
        if (!hasSystemDomainsServerAuthority(postCommitConsistency, enabledSurfaces)) {
          sendJson(res, headers, 503, {
            ok: false,
            apiVersion: "v1",
            committed: result.imported === true,
            revision: projection.revision,
            snapshotSync,
            consistency: postCommitConsistency,
            error: "System Domains command was committed but compatibility proof was not restored",
          }, { ETag: etag });
          return true;
        }
        sendJson(res, headers, 200, {
          ok: true, apiVersion: "v1", ...result, item: projection.item, snapshotSync, consistency: postCommitConsistency,
        }, { ETag: etag });
      }
    } catch (error) {
      if (error?.code === "SYSTEM_DOMAINS_AUTHORITY_TRANSITION_PENDING") {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: error.message, retryable: true });
      } else if (error?.code === "SYSTEM_DOMAINS_SNAPSHOT_IMPORT_RETIRED") {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: error.message });
      } else {
        sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "System Domains command storage is unavailable" });
      }
    } finally { await domains?.close?.(); }
    return true;
  }

  if (url.pathname === `${API_PREFIX}/workshop/shift-execution/summary` || url.pathname === `${API_PREFIX}/workshop/shift-execution`) {
    if (req.method !== "GET") {
      sendJson(res, headers, 405, { ok: false, error: "Method is not allowed" });
      return true;
    }
    let shifts;
    try {
      shifts = shiftExecutionReadRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = url.pathname.endsWith("/summary")
        ? await shifts.summary()
        : await shifts.list({ limit: url.searchParams.get("limit") });
      const payload = { ok: true, apiVersion: "v1", ...result };
      const etag = getPayloadEtag(payload);
      if (matchesEtag(req, etag)) sendNotModified(res, headers, etag);
      else sendJson(res, headers, 200, payload, { ETag: etag });
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution storage is unavailable" });
    } finally {
      await shifts?.close?.();
    }
    return true;
  }

  if (!isSpecifications2PublishCommand && (url.pathname === `${API_PREFIX}/specifications2/revisions/summary` || url.pathname === `${API_PREFIX}/specifications2/revisions` || specifications2RevisionMatch || specifications2SourceMatch)) {
    if (req.method !== "GET") {
      sendJson(res, headers, 405, { ok: false, error: "Method is not allowed" });
      return true;
    }
    let specifications;
    try {
      specifications = createSpecifications2ReadRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = url.pathname.endsWith("/summary")
        ? await specifications.summary()
        : specifications2SourceMatch
          ? await specifications.getLatestBySourceEntry(decodeURIComponent(specifications2SourceMatch[1]))
          : specifications2RevisionMatch
          ? await specifications.get(decodeURIComponent(specifications2RevisionMatch[1]))
          : await specifications.list({ limit: url.searchParams.get("limit") });
      if ((specifications2RevisionMatch || specifications2SourceMatch) && !result.item) {
        sendJson(res, headers, 404, { ok: false, apiVersion: "v1", error: "Specifications 2.0 revision was not found" });
      } else {
        const payload = { ok: true, apiVersion: "v1", ...result };
        const etag = getPayloadEtag(payload);
        if (matchesEtag(req, etag)) sendNotModified(res, headers, etag);
        else sendJson(res, headers, 200, payload, { ETag: etag });
      }
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Specifications 2.0 storage is unavailable" });
    } finally { await specifications?.close?.(); }
    return true;
  }

  if (isSpecifications2PublishCommand) {
    if (!isSpecifications2RevisionPublicationPrimaryConfigured(env) || health.storageBackend !== "postgresql") {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 server publication is not enabled during snapshot migration" });
      return true;
    }
    const authorization = await getSpecifications2Authorization();
    if (!authorization.allowed) {
      sendSpecifications2AuthorizationFailure(res, headers, authorization, "publishing a Specifications 2.0 revision");
      return true;
    }
    const actor = authorization.actor;
    let payload;
    try { payload = await readRequestBody(req, { maxBytes: SPECIFICATIONS2_PUBLISH_BODY_MAX_BYTES }); }
    catch (error) {
      const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
      sendJson(res, headers, tooLarge ? 413 : 400, {
        ok: false,
        apiVersion: "v1",
        error: tooLarge ? "Specifications 2.0 publication request is too large" : "Request body must be valid JSON",
      });
      return true;
    }
    const idempotencyKey = String(req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"] || payload?.idempotencyKey || "").trim();
    const expectedPreviousRevision = Number(payload?.expectedPreviousRevision);
    if (!payload?.entry || !idempotencyKey || idempotencyKey.length > 160
      || !Number.isInteger(expectedPreviousRevision) || expectedPreviousRevision < 0) {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Editor entry, idempotency key and expected previous revision are required" });
      return true;
    }
    let command;
    try {
      command = specifications2PublishCommandRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const readiness = await command.commandReadiness();
      if (!readiness.schemaReady) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 server publication schema is not ready" });
        return true;
      }
      const result = await command.publish({ entry: payload.entry, expectedPreviousRevision, idempotencyKey, actorId: actor.id });
      if (!result.item) {
        const statusCode = result.conflict ? 409 : 422;
        sendJson(res, headers, statusCode, {
          ok: false,
          apiVersion: "v1",
          conflict: result.conflict === true,
          currentRevision: Number(result.currentRevision || 0),
          error: result.error || "Specifications 2.0 revision cannot be published",
        });
      }
      else {
        let snapshotSync;
        try {
          snapshotSync = await syncPendingSpecifications2PublicationChanges({
            primary: workOrders,
            snapshot: createSpecifications2SnapshotRepository({ env, filePath }),
            limit: 1,
            aggregateId: result.item.id,
          });
        } catch (error) {
          // PostgreSQL has already accepted the immutable revision. Preserve
          // its success and leave the durable outbox pending for the timer.
          snapshotSync = { total: 0, applied: 0, conflicts: 0, failed: 1, error: error?.message || "Specifications 2.0 compatibility delivery failed" };
        }
        sendJson(res, headers, result.created ? 201 : 200, { ok: true, apiVersion: "v1", ...result, snapshotSync });
      }
    } catch (error) { sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Specifications 2.0 publication storage is unavailable" }); }
    finally { await command?.close?.(); }
    return true;
  }

  if (isSpecifications2AttachmentCommand) {
    if (String(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS || "") !== "1" || health.storageBackend !== "postgresql") {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 attachment upload is not enabled during snapshot migration" });
      return true;
    }
    const authorization = await getSpecifications2Authorization();
    if (!authorization.allowed) {
      sendSpecifications2AuthorizationFailure(res, headers, authorization, "uploading a Specifications 2.0 attachment");
      return true;
    }
    const actor = authorization.actor;
    let attachments;
    try {
      attachments = specifications2AttachmentRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      if (!(await attachments.commandReadiness()).schemaReady) {
        await attachments.close();
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 attachment storage schema is not ready" });
        return true;
      }
    } catch (error) {
      await attachments?.close?.();
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Specifications 2.0 attachment storage is unavailable" });
      return true;
    }
    let payload;
    try { payload = await readRequestBody(req, { maxBytes: SPECIFICATIONS2_ATTACHMENT_BODY_MAX_BYTES }); }
    catch (error) {
      await attachments.close();
      const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
      sendJson(res, headers, tooLarge ? 413 : 400, {
        ok: false,
        apiVersion: "v1",
        error: tooLarge ? "Specifications 2.0 attachment request is too large" : "Request body must be valid JSON",
      });
      return true;
    }
    try {
      const result = await attachments.put(payload || {}, { actorId: actor.id });
      sendJson(res, headers, result.created ? 201 : 200, { ok: true, apiVersion: "v1", ...result });
    } catch (error) {
      sendJson(res, headers, 422, { ok: false, apiVersion: "v1", error: error?.message || "Specifications 2.0 attachment cannot be stored" });
    } finally { await attachments?.close?.(); }
    return true;
  }

  if (isSpecifications2AttachmentRead) {
    if (String(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS || "") !== "1" || health.storageBackend !== "postgresql") {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 attachment download is not enabled during snapshot migration" });
      return true;
    }
    const authorization = await getSpecifications2Authorization();
    if (!authorization.allowed) {
      sendSpecifications2AuthorizationFailure(res, headers, authorization, "downloading a Specifications 2.0 attachment");
      return true;
    }
    let attachments;
    try {
      attachments = specifications2AttachmentRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      if (!(await attachments.commandReadiness()).schemaReady) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 attachment storage schema is not ready" });
        return true;
      }
      const result = await attachments.get(decodeURIComponent(specifications2AttachmentMatch[1]));
      if (!result.item) {
        sendJson(res, headers, 404, { ok: false, apiVersion: "v1", error: "Specifications 2.0 attachment was not found" });
        return true;
      }
      sendAttachment(res, headers, 200, result.item);
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Specifications 2.0 attachment storage is unavailable" });
    } finally { await attachments?.close?.(); }
    return true;
  }

  if (isSpecifications2WorkOrderCommand) {
    // The schema and command code can be deployed safely before the legacy
    // snapshot has a create-order outbox consumer. Do not allow a browser to
    // create an invisible-to-legacy order until that consumer has passed
    // parity and an operator explicitly enables this flag.
    if (String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") !== "1") {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Server work-order creation from Specifications 2.0 is not enabled during snapshot migration" });
      return true;
    }
    // Use the normalized health contract here as well as in capabilities.
    // Repository internals may call this backend "postgres", while the API
    // contract intentionally exposes the stable public value "postgresql".
    if (health.storageBackend !== "postgresql" || !workOrders.listPendingSnapshotSyncs) {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Specifications 2.0 server command requires PostgreSQL as the primary work-order authority" });
      return true;
    }
    // Creation is a protected write: the actor comes from the signed employee
    // session and current System Domains RBAC, never from the shared perimeter
    // login or browser-supplied identity fields.
    const authorization = await getSpecifications2Authorization();
    if (!authorization.allowed) {
      sendSpecifications2AuthorizationFailure(res, headers, authorization, "creating a Work Order from Specifications 2.0");
      return true;
    }
    const actor = authorization.actor;
    let planningSafety = await getPlanningSafety();
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    let payload;
    try { payload = await readRequestBody(req, { maxBytes: SPECIFICATIONS2_WORK_ORDER_BODY_MAX_BYTES }); }
    catch (error) {
      const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
      sendJson(res, headers, tooLarge ? 413 : 400, {
        ok: false,
        apiVersion: "v1",
        error: tooLarge ? "Specifications 2.0 Work Order request is too large" : "Request body must be valid JSON",
      });
      return true;
    }
    const routeSourceDraftId = String(payload.routeSourceDraftId || "").trim();
    const idempotencyKey = String(req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"] || payload.idempotencyKey || "").trim();
    const quantity = Number(payload.quantity);
    if (!routeSourceDraftId || !idempotencyKey || idempotencyKey.length > 160 || !Number.isFinite(quantity) || quantity <= 0) {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "routeSourceDraftId, positive quantity and idempotency key are required" });
      return true;
    }
    planningSafety = await verifyPlanningProjectionBeforeWrite({ planningSafety, getPlanningSafety });
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    let command;
    try {
      command = specifications2WorkOrderCommandRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const commandReadiness = await command.commandReadiness();
      if (!commandReadiness.schemaReady) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: commandReadiness.error || "Specifications 2.0 work-order command schema is not ready" });
        return true;
      }
      const result = await command.create({ revisionId: decodeURIComponent(specifications2WorkOrderCommandMatch[1]), routeSourceDraftId, quantity, idempotencyKey, actorId: actor.id });
      const responseStatus = getSpecifications2WorkOrderCommandHttpStatus(result);
      if (responseStatus === 409) {
        sendJson(res, headers, 409, {
          ok: false,
          apiVersion: "v1",
          conflict: true,
          idempotencyConflict: true,
          error: result.error || "Idempotency key was already used for a different Work Order request",
        });
      } else if (responseStatus === 422) {
        sendJson(res, headers, 422, { ok: false, apiVersion: "v1", error: result.error || "Published revision cannot create a work order" });
      } else {
        // The create command changes the same runtime projection as quantity
        // and slot commands. An idempotent replay may invalidate harmlessly;
        // a newly created aggregate must never wait for marker polling.
        invalidatePlanningRuntimeProjectionCache({ filePath, env });
        let snapshotSync;
        try {
          const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
          snapshotSync = await syncPendingSnapshotChanges({ primary: workOrders, snapshot: snapshotRepository });
        } catch (error) {
          snapshotSync = { applied: 0, conflicts: 0, failed: 1, error: error?.message || "Snapshot creation sync deferred" };
        }
        sendJson(res, headers, responseStatus, { ok: true, apiVersion: "v1", ...result, snapshotSync });
      }
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Specifications 2.0 command storage is unavailable" });
    } finally { await command?.close?.(); }
    return true;
  }

  if (!health.configured) {
    sendJson(res, headers, 503, { ok: false, configured: false, ...meta, error: "Domain storage is not configured" }, planningBootstrapTiming ? {
      "Server-Timing": getPlanningBootstrapServerTiming({
        planningSafetyMs: planningBootstrapTiming.planningSafetyMs,
        startedAt: planningBootstrapTiming.startedAt,
      }),
    } : {});
    return true;
  }

  if (url.pathname === `${API_PREFIX}/planning/work-orders/parity`) {
    // This endpoint is an explicit diagnostic. Never route it through the
    // safety fallback: it must continue comparing the configured primary
    // against the snapshot rather than accidentally comparing the snapshot
    // with itself.
    let refreshedSafety = null;
    if (url.searchParams.get("refresh-marker") === "1") {
      refreshedSafety = await getPlanningSafety({ forceFullParity: true });
    }
    const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
    const { primary, snapshot, parity } = await inspectWorkOrderProjectionParity({ primary: workOrders, snapshot: snapshotRepository });
    const marker = typeof workOrders.getPlanningProjectionParityState === "function"
      ? await workOrders.getPlanningProjectionParityState()
      : null;
    sendJson(res, headers, 200, {
      ok: parity.matches && !refreshedSafety?.fallbackReason,
      apiVersion: "v1",
      primary: { storageMode: primary.storageMode, count: primary.items.length },
      snapshot: { storageMode: snapshot.storageMode, count: snapshot.items.length },
      parity,
      marker,
      ...(refreshedSafety?.fallbackReason ? { fallbackReason: refreshedSafety.fallbackReason } : {}),
    });
    await snapshotRepository.close?.();
    return true;
  }

  if (url.pathname === `${API_PREFIX}/planning/work-orders`) {
    let planningSafety = await getPlanningSafety();
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: (repository) => repository.list(),
    });
    planningSafety = guardedRead.planningSafety;
    const result = guardedRead.result;
    const payload = withPlanningFallback({ ok: true, apiVersion: "v1", ...result }, planningSafety);
    const etag = getPlanningResponseEtag(result.revision, planningSafety);
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag);
      return true;
    }
    sendJson(res, headers, 200, payload, { ETag: etag });
    return true;
  }

  // The Planning workbench's first render needs a compact sidebar and one
  // selected aggregate.  Serving them here avoids the former public
  // list->detail chain (and a second parity/safety gate) while preserving the
  // old endpoints for navigation and mixed-version rollout compatibility.
  if (url.pathname === `${API_PREFIX}/planning/work-orders/bootstrap`) {
    const requestedId = String(url.searchParams.get("active") || "").trim();
    const parityGuardStartedAt = getRequestTimingNow();
    let planningSafety = await getPlanningSafety();
    let parityGuardMs = getElapsedTimingMs(parityGuardStartedAt);
    let bootstrapReadMs = 0;
    const guardedReadStartedAt = getRequestTimingNow();
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: async (repository) => {
        const bootstrapReadStartedAt = getRequestTimingNow();
        try {
          if (typeof repository.listWorkbenchBootstrap === "function") {
            return repository.listWorkbenchBootstrap(requestedId);
          }
          // Additive fallback for a temporarily older repository during a
          // rolling deploy. It remains one HTTP response even if its internal
          // compatibility adapter has not yet learned the atomic read.
          const listed = await repository.list();
          const selected = listed.items.find((candidate) => String(candidate?.id || "") === requestedId || String(candidate?.number || "") === requestedId)
            || listed.items[0]
            || null;
          const detail = selected ? await repository.get(selected.id) : null;
          return {
            ...listed,
            activeId: detail?.item?.id || "",
            item: detail?.item || null,
          };
        } finally {
          bootstrapReadMs += getElapsedTimingMs(bootstrapReadStartedAt);
        }
      },
    });
    // The guarded-read wall time includes revalidation and a forced re-proof
    // on churn. Subtract repository reads so the parity metric stays useful
    // even when a fallback requires another bootstrap read.
    parityGuardMs += Math.max(0, getElapsedTimingMs(guardedReadStartedAt) - bootstrapReadMs);
    planningSafety = guardedRead.planningSafety;
    const result = guardedRead.result;
    const payload = withPlanningFallback({
      ok: true,
      apiVersion: "v1",
      ...result,
      item: result.item ? buildPlanningWorkbenchDetail(result.item) : null,
    }, planningSafety);
    // A list revision alone cannot describe a different selected aggregate.
    // Hash the exact combined response so a stale selection never receives a
    // misleading 304 after navigation or a concurrent detail update.
    const etag = getPayloadEtag(payload);
    const serverTiming = getPlanningBootstrapServerTiming({
      planningSafetyMs: planningBootstrapTiming?.planningSafetyMs,
      parityGuardMs,
      bootstrapReadMs,
      startedAt: planningBootstrapTiming?.startedAt,
    });
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag, { "Server-Timing": serverTiming });
      return true;
    }
    sendJson(res, headers, 200, payload, { ETag: etag, "Server-Timing": serverTiming });
    return true;
  }

  if (url.pathname === `${API_PREFIX}/planning/work-orders/summary`) {
    let planningSafety = await getPlanningSafety();
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: (repository) => typeof repository.summary === "function"
        ? repository.summary()
        : (() => { throw new Error("Work-order repository does not support summary projection"); })(),
    });
    planningSafety = guardedRead.planningSafety;
    const result = guardedRead.result;
    const payload = withPlanningFallback({
      ok: true,
      apiVersion: "v1",
      storageMode: result.storageMode,
      storageBackend: result.storageBackend,
      configured: result.configured,
      revision: result.revision,
      updatedAt: result.updatedAt,
      summary: result.summary || buildWorkOrderSummary(result.items),
    }, planningSafety);
    const etag = getPlanningResponseEtag(result.revision, planningSafety);
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag);
      return true;
    }
    sendJson(res, headers, 200, payload, { ETag: etag });
    return true;
  }

  if (url.pathname === `${API_PREFIX}/planning/work-orders/projection`) {
    const projectionCacheTimingStartedAt = getRequestTimingNow();
    let planningSafety = await getPlanningSafety();
    // Do not serve the cached graph until this request has independently
    // established PostgreSQL as the safe primary and rechecked the same
    // marker once more.  This keeps a conditional GET cheap without letting a
    // stale response bypass the snapshot/parity boundary.
    const cached = await readCachedPlanningRuntimeProjection({ filePath, env, planningSafety });
    if (cached) {
      const serverTiming = getPlanningRuntimeProjectionCacheServerTiming({
        cache: "hit",
        startedAt: projectionCacheTimingStartedAt,
      });
      if (matchesEtag(req, cached.etag)) {
        sendNotModified(res, headers, cached.etag, { "Server-Timing": serverTiming });
        return true;
      }
      sendCachedPlanningRuntimeProjection(res, headers, cached, { ETag: cached.etag, "Server-Timing": serverTiming });
      return true;
    }
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: async (repository) => {
        // PostgreSQL can materialize the complete runtime graph in one
        // repeatable read. Snapshot fallback intentionally keeps the proven
        // list + detail path until it gains an equivalent bounded capability.
        if (typeof repository.listRuntimeProjection === "function") {
          const listed = await repository.listRuntimeProjection();
          return { listed, details: listed.items || [] };
        }
        const listed = await repository.list();
        const details = await Promise.all(listed.items.map(async (item) => (await repository.get(item.id)).item));
        return { listed, details };
      },
    });
    planningSafety = guardedRead.planningSafety;
    const { listed, details } = guardedRead.result;
    const projection = buildPlanningRuntimeProjection(details.filter(Boolean));
    const payload = withPlanningFallback({ ok: true, apiVersion: "v1", storageMode: listed.storageMode, storageBackend: listed.storageBackend, revision: listed.revision, updatedAt: listed.updatedAt, projection }, planningSafety);
    const etag = getPlanningRuntimeProjectionEtag({ listed, payload, planningSafety });
    const cachedProjection = cachePlanningRuntimeProjection({ filePath, env, planningSafety, listed, payload, etag });
    const serverTiming = getPlanningRuntimeProjectionCacheServerTiming({
      cache: "miss",
      startedAt: projectionCacheTimingStartedAt,
    });
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag, { "Server-Timing": serverTiming });
      return true;
    }
    if (cachedProjection) {
      sendCachedPlanningRuntimeProjection(res, headers, cachedProjection, { ETag: etag, "Server-Timing": serverTiming });
      return true;
    }
    sendJson(res, headers, 200, payload, { ETag: etag, "Server-Timing": serverTiming });
    return true;
  }

  if (isPlanningGanttWindowRead) {
    // This contract is intentionally isolated from the historical global
    // planning projection. A future windowed Gantt can keep it in its own
    // read model without partially replacing planningState for editors and
    // other consumers that still require the complete graph.
    let ganttWindowSafety;
    let result;
    try {
      ganttWindowSafety = await resolvePlanningGanttWindowReadSource({
        primary: workOrders,
        primaryHealth: health,
        env,
        filePath,
        createRepository: workOrdersRepositoryFactory,
      });
      const repository = ganttWindowSafety.repository;
      if (typeof repository.listGanttWindow !== "function") {
        throw new Error("Work-order repository does not support a bounded Gantt window");
      }
      result = await repository.listGanttWindow({
        fromAt: new Date(planningPeriod.from.time).toISOString(),
        toAt: new Date(planningPeriod.to.time).toISOString(),
      });
    } catch (error) {
      sendJson(res, headers, 503, {
        ok: false,
        apiVersion: "v1",
        error: error?.message || "Gantt window storage is unavailable",
      });
      return true;
    }
    const payload = withPlanningFallback({
      ok: true,
      apiVersion: "v1",
      storageMode: result.storageMode,
      storageBackend: result.storageBackend,
      revision: result.revision,
      updatedAt: result.updatedAt,
      period: {
        fromAt: new Date(planningPeriod.from.time).toISOString(),
        toAt: new Date(planningPeriod.to.time).toISOString(),
      },
      ganttWindow: result.window,
    }, ganttWindowSafety);
    const etag = getPayloadEtag(payload);
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag);
      return true;
    }
    sendJson(res, headers, 200, payload, { ETag: etag });
    return true;
  }

  if (isPlanningPeriodRead) {
    let planningSafety = await getPlanningSafety();
    // PostgreSQL exposes two bounded representations. `projection` preserves
    // the transitional legacy graph; `weekly` returns only slot rows for the
    // seven-day dashboard. Snapshot fallback deliberately retains the proven
    // projection route until it implements the same optional capability.
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: async (repository) => {
        const bounds = {
          fromAt: new Date(planningPeriod.from.time).toISOString(),
          toAt: new Date(planningPeriod.to.time).toISOString(),
        };
        if (planningPeriodView === "weekly" && typeof repository.listWeeklyPeriodRows === "function") {
          const listed = await repository.listWeeklyPeriodRows(bounds);
          return { listed, details: [], rows: Array.isArray(listed.rows) ? listed.rows : [], compactWeeklyRows: true };
        }
        const periodResult = typeof repository.listPeriod === "function"
          ? await repository.listPeriod(bounds)
          : null;
        const listed = periodResult || await repository.list();
        const details = periodResult
          ? periodResult.items
          : await Promise.all(
            // List rows expose a scheduled-operation count, so do not fetch
            // an aggregate that cannot possibly contribute to this calendar
            // slice.
            listed.items
              .filter((item) => Number(item?.scheduledOperationCount || 0) > 0)
              .map(async (item) => (await repository.get(item.id)).item),
          );
        return { listed, details, rows: null, compactWeeklyRows: false };
      },
    });
    planningSafety = guardedRead.planningSafety;
    const { listed, details, rows, compactWeeklyRows } = guardedRead.result;
    const period = planningPeriod.boundsKind === "instant"
      ? { fromAt: planningPeriod.from.instant, toAt: planningPeriod.to.instant }
      : { from: planningPeriod.from.date, to: planningPeriod.to.date };
    const payload = compactWeeklyRows
      ? withPlanningFallback({
        ok: true,
        apiVersion: "v1",
        storageMode: listed.storageMode,
        storageBackend: listed.storageBackend,
        period,
        view: "weekly",
        rows,
      }, planningSafety)
      : withPlanningFallback({
        ok: true,
        apiVersion: "v1",
        storageMode: listed.storageMode,
        storageBackend: listed.storageBackend,
        period,
        projection: buildPlanningPeriodProjection(details.filter(Boolean), planningPeriod),
      }, planningSafety);
    const etag = getPayloadEtag(payload);
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag);
      return true;
    }
    sendJson(res, headers, 200, payload, { ETag: etag });
    return true;
  }

  if (startDateMatch && isStartDatePatch) {
    let planningSafety = await getPlanningSafety();
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    let commandReadiness = { schemaReady: false, error: "Planning start-date owner is unavailable" };
    try {
      if (typeof workOrders.startDateCommandReadiness === "function") {
        commandReadiness = await workOrders.startDateCommandReadiness();
      }
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, ...meta, code: "planning-start-date-readiness-unavailable", error: error?.message || "Planning start-date readiness is unavailable" });
      return true;
    }
    if (commandReadiness.schemaReady !== true) {
      sendJson(res, headers, 409, { ok: false, ...meta, code: "planning-start-date-schema-not-ready", error: commandReadiness.error || "Planning start-date owner is unavailable" });
      return true;
    }
    const id = decodeURIComponent(startDateMatch[1]);
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: (repository) => repository.get(id),
    });
    planningSafety = guardedRead.planningSafety;
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    if (!guardedRead.result.item) {
      sendJson(res, headers, 404, { ok: false, ...meta, error: "Work order was not found" });
      return true;
    }
    let payload;
    try {
      payload = await readRequestBody(req, { maxBytes: PLANNING_COMMAND_BODY_MAX_BYTES });
    } catch (error) {
      const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
      sendJson(res, headers, tooLarge ? 413 : 400, { ok: false, ...meta, error: tooLarge ? "Planning command request is too large" : "Request body must be valid JSON" });
      return true;
    }
    const expected = readExpectedRevision(req, payload);
    const hasPlanningStartDate = Object.prototype.hasOwnProperty.call(payload || {}, "planningStartDate");
    const planningStartDate = payload?.planningStartDate === null
      ? null
      : typeof payload?.planningStartDate === "string" ? payload.planningStartDate.trim() : undefined;
    const idempotencyKey = String(getRequestHeader(req, "idempotency-key") || "").trim();
    if (expected.error) {
      sendJson(res, headers, 400, { ok: false, ...meta, error: expected.error });
      return true;
    }
    if (!hasPlanningStartDate
      || (planningStartDate !== null && !isExactIsoCalendarDate(planningStartDate))
      || !Number.isInteger(expected.value)
      || !idempotencyKey || idempotencyKey.length > 160) {
      sendJson(res, headers, 400, { ok: false, ...meta, error: "planningStartDate must be an exact ISO date or explicit null; expectedRevision and Idempotency-Key are required" });
      return true;
    }
    planningSafety = await verifyPlanningProjectionBeforeWrite({ planningSafety, getPlanningSafety });
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    try {
      const updated = await workOrders.changeStartDate(id, {
        planningStartDate,
        expectedRevision: expected.value,
        actorId: planningAuthorization.actor.id,
        idempotencyKey,
      });
      if (updated.idempotencyConflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...updated, conflict: true, error: "Idempotency key was already used for a different Planning command" }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
        return true;
      }
      if (updated.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...updated, error: "Work order was changed by another client" }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
        return true;
      }
      if (!updated.item) {
        sendJson(res, headers, 404, { ok: false, ...meta, error: "Work order was not found" });
        return true;
      }
      invalidatePlanningRuntimeProjectionCache({ filePath, env });
      let snapshotSync = null;
      if ((updated.storageMode === "postgres" || updated.storageBackend === "postgresql") && workOrders.listPendingSnapshotSyncs) {
        try {
          const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
          snapshotSync = await syncPendingSnapshotChanges({ primary: workOrders, snapshot: snapshotRepository });
        } catch (error) {
          snapshotSync = { applied: 0, conflicts: 0, failed: 1, error: error?.message || "Snapshot sync deferred" };
        }
      }
      let compatibilityReceipt = {
        found: false,
        exact: false,
        ready: false,
        state: "unavailable",
        unresolvedCount: 0,
        error: "Planning start-date compatibility receipt is unavailable",
      };
      if (updated.storageMode === "postgres" || updated.storageBackend === "postgresql") {
        try {
          if (typeof workOrders.getStartDateSnapshotReceipt !== "function") {
            throw new Error("Planning start-date compatibility receipt is unsupported");
          }
          compatibilityReceipt = await workOrders.getStartDateSnapshotReceipt({
            actorId: planningAuthorization.actor.id,
            idempotencyKey,
            aggregateId: updated.commandAggregateId,
            aggregateRevision: updated.commandAggregateRevision,
            expectedRevision: expected.value,
            planningStartDate,
          });
        } catch (error) {
          compatibilityReceipt = {
            ...compatibilityReceipt,
            error: error?.message || compatibilityReceipt.error,
          };
        }
      }
      if (updated.superseded === true) {
        sendJson(res, headers, 409, {
          ok: false,
          apiVersion: "v1",
          ...updated,
          conflict: true,
          superseded: true,
          code: "superseded-idempotent-replay",
          error: "The original start-date command was applied but has since been superseded",
          ...(snapshotSync ? { snapshotSync } : {}),
          compatibilityReceipt,
        }, { ETag: getRevisionEtag(updated.item.concurrencyRevision) });
        return true;
      }
      sendJson(res, headers, 200, {
        ok: true,
        apiVersion: "v1",
        ...updated,
        ...(snapshotSync ? { snapshotSync } : {}),
        compatibilityReceipt,
      }, { ETag: getRevisionEtag(updated.item.concurrencyRevision) });
      return true;
    } catch (error) {
      sendJson(res, headers, 422, { ok: false, ...meta, error: error?.message || "Planning start date cannot be changed" });
      return true;
    }
  }

  if (slotMatch && isSlotPatch) {
    let planningSafety = await getPlanningSafety();
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    const id = decodeURIComponent(slotMatch[1]);
    const operationId = decodeURIComponent(slotMatch[2]);
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: (repository) => repository.get(id),
    });
    planningSafety = guardedRead.planningSafety;
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    const detail = guardedRead.result;
    if (!detail.item) {
      sendJson(res, headers, 404, { ok: false, ...meta, error: "Work order was not found" });
      return true;
    }
    let payload;
    try {
      payload = await readRequestBody(req, { maxBytes: PLANNING_COMMAND_BODY_MAX_BYTES });
    } catch (error) {
      const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
      sendJson(res, headers, tooLarge ? 413 : 400, { ok: false, ...meta, error: tooLarge ? "Planning command request is too large" : "Request body must be valid JSON" });
      return true;
    }
    const expected = readExpectedRevision(req, payload);
    const plannedStart = String(payload.plannedStart || "");
    if (expected.error) {
      sendJson(res, headers, 400, { ok: false, ...meta, error: expected.error });
      return true;
    }
    if (!plannedStart || Number.isNaN(new Date(plannedStart).getTime()) || !Number.isInteger(expected.value)) {
      sendJson(res, headers, 400, { ok: false, ...meta, error: "plannedStart and expectedRevision are required" });
      return true;
    }
    planningSafety = await verifyPlanningProjectionBeforeWrite({ planningSafety, getPlanningSafety });
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    try {
      const updated = await workOrders.changeSlotSchedule(id, operationId, {
        plannedStart,
        expectedRevision: expected.value,
        actorId: planningAuthorization.actor.id,
      });
      if (updated.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...updated, error: "Work order was changed by another client" }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
        return true;
      }
      if (!updated.item) {
        sendJson(res, headers, 404, { ok: false, ...meta, error: "Planning operation or slot was not found" });
        return true;
      }
      // A successful command owns a new aggregate epoch. Invalidate before
      // best-effort snapshot delivery so concurrent readers cannot retain a
      // same-process runtime graph while that delivery is still in flight.
      invalidatePlanningRuntimeProjectionCache({ filePath, env });
      let snapshotSync = null;
      if ((updated.storageMode === "postgres" || updated.storageBackend === "postgresql") && workOrders.listPendingSnapshotSyncs) {
        try {
          const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
          snapshotSync = await syncPendingSnapshotChanges({ primary: workOrders, snapshot: snapshotRepository });
        } catch (error) {
          snapshotSync = { applied: 0, conflicts: 0, failed: 1, error: error?.message || "Snapshot sync deferred" };
        }
      }
      sendJson(res, headers, 200, { ok: true, apiVersion: "v1", ...updated, ...(snapshotSync ? { snapshotSync } : {}) }, { ETag: getRevisionEtag(updated.item.concurrencyRevision) });
      return true;
    } catch (error) {
      sendJson(res, headers, 422, { ok: false, ...meta, error: error?.message || "Planning slot cannot be rescheduled" });
      return true;
    }
  }

  if (orderMatch) {
    let planningSafety = await getPlanningSafety();
    if (isOrderPatch && planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    const id = decodeURIComponent(orderMatch[1]);
    const guardedRead = await readPlanningProjectionSafely({
      planningSafety,
      getPlanningSafety,
      read: (repository) => repository.get(id),
    });
    planningSafety = guardedRead.planningSafety;
    if (isOrderPatch && planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    const detail = guardedRead.result;
    if (!detail.item) {
      sendJson(res, headers, 404, { ok: false, ...meta, error: "Work order was not found" });
      return true;
    }
    if (isOrderPatch) {
      let payload;
      try {
        payload = await readRequestBody(req, { maxBytes: PLANNING_COMMAND_BODY_MAX_BYTES });
      } catch (error) {
        const tooLarge = error?.code === "REQUEST_BODY_TOO_LARGE";
        sendJson(res, headers, tooLarge ? 413 : 400, { ok: false, ...meta, error: tooLarge ? "Planning command request is too large" : "Request body must be valid JSON" });
        return true;
      }
      const quantity = Number(payload.quantity);
      const expected = readExpectedRevision(req, payload);
      if (expected.error) {
        sendJson(res, headers, 400, { ok: false, ...meta, error: expected.error });
        return true;
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(expected.value)) {
        sendJson(res, headers, 400, { ok: false, ...meta, error: "quantity and expectedRevision are required" });
        return true;
      }
      planningSafety = await verifyPlanningProjectionBeforeWrite({ planningSafety, getPlanningSafety });
      if (planningSafety.fallbackReason) {
        sendPlanningWriteParityConflict(res, headers, planningSafety);
        return true;
      }
      const updated = await workOrders.changeQuantity(id, {
        quantity,
        expectedRevision: expected.value,
        actorId: planningAuthorization.actor.id,
      });
      if (updated.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...updated, error: "Work order was changed by another client" }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
        return true;
      }
      // See slot scheduling above: once the durable command is accepted, the
      // process-local projection must be rebuilt from its new marker/revision.
      invalidatePlanningRuntimeProjectionCache({ filePath, env });
      // During the staged migration PostgreSQL is the write authority, while
      // legacy modules still read the shared snapshot. Delivery is best-effort:
      // a pending outbox record is retained on a transient failure and retried
      // by the next write/worker invocation.
      let snapshotSync = null;
      if ((updated.storageMode === "postgres" || updated.storageBackend === "postgresql") && workOrders.listPendingSnapshotSyncs) {
        try {
          const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
          snapshotSync = await syncPendingSnapshotChanges({ primary: workOrders, snapshot: snapshotRepository });
        } catch (error) {
          snapshotSync = { applied: 0, conflicts: 0, failed: 1, error: error?.message || "Snapshot sync deferred" };
        }
      }
      sendJson(res, headers, 200, { ok: true, apiVersion: "v1", ...updated, ...(snapshotSync ? { snapshotSync } : {}) }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
      return true;
    }
    const etag = getPlanningResponseEtag(detail.item.concurrencyRevision, planningSafety);
    if (matchesEtag(req, etag)) {
      sendNotModified(res, headers, etag);
      return true;
    }
    const item = url.searchParams.get("view") === "workbench"
      ? buildPlanningWorkbenchDetail(detail.item)
      : detail.item;
    sendJson(res, headers, 200, withPlanningFallback({ ok: true, apiVersion: "v1", ...detail, item }, planningSafety), { ETag: etag });
    return true;
  }

  sendJson(res, headers, 404, { ok: false, ...meta, error: "Domain API route was not found" });
  return true;
}
