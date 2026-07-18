import { createWorkOrdersRepository } from "./domain-repositories.mjs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createShiftExecutionCommandRepository, createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";
import { createSpecifications2PublishCommandRepository, createSpecifications2ReadRepository, createSpecifications2WorkOrderCommandRepository } from "./domain-specifications2-repository.mjs";
import { createSpecifications2AttachmentRepository } from "./domain-specifications2-attachment-repository.mjs";
import { createSpecifications2SnapshotRepository } from "./domain-specifications2-snapshot-repository.mjs";
import { syncPendingSpecifications2PublicationChanges } from "./domain-specifications2-snapshot-sync.mjs";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { inspectSystemDomainsSnapshotConsistency, syncPendingSystemDomainsSnapshotChanges } from "./domain-system-domains-snapshot-sync.mjs";
import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";
import { getPublicAuthPrincipal } from "./public-auth-guard.mjs";
import { SYSTEM_DOMAIN_REGISTRY_NAMES, loadSystemDomains } from "../src/modules/system_domains/service.js";

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
const PLANNING_POSTGRES_PARITY_CACHE_TTL_MS = 10_000;
// Bump this whenever fields included in planning parity change.  A durable
// marker from an earlier contract must never be used to skip a newer proof.
// v5 makes the formerly implicit one-slot-per-operation choice stable. Any
// v4 marker was proved against an unordered split-slot result and therefore
// must trigger a fresh full proof before this runtime projection is trusted.
const PLANNING_PROJECTION_PARITY_CONTRACT_VERSION = 5;
const PLANNING_POSTGRES_FALLBACK_REASON = "postgres-projection-stale";
let planningPostgresParityCache = null;

function isSpecifications2RevisionPublicationPrimaryConfigured(env = process.env) {
  // This is rollout intent rather than a health probe. A primary-configured
  // client must fail closed while PostgreSQL or its schema is unavailable.
  return String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1";
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

function sendJson(res, headers, statusCode, payload, extraHeaders = {}) {
  const responseHeaders = typeof headers === "function"
    ? headers("application/json; charset=utf-8")
    : {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    };
  const serialized = Buffer.from(JSON.stringify(payload));
  const gzip = /\bgzip\b/i.test(String(res.__mesAcceptEncoding || "")) && serialized.byteLength >= 1024;
  const body = gzip ? gzipSync(serialized) : serialized;
  const compressionHeaders = gzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Length": String(body.byteLength) } : {};
  res.writeHead?.(statusCode, { ...responseHeaders, ...extraHeaders, ...compressionHeaders });
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

function createPlanningProjectionReadVerification(markerState = null, snapshotHealth = {}) {
  if (!hasMatchingPlanningProjectionMarker(markerState, snapshotHealth)) return null;
  return {
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
  if (!verification || !primary || !snapshot
    || typeof primary.getPlanningProjectionParityState !== "function") return false;
  try {
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

  const snapshot = await createRepository({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
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

  const markerSupported = typeof primary?.getPlanningProjectionParityState === "function"
    && typeof primary?.markPlanningProjectionParity === "function";
  let markerState = null;
  if (markerSupported && getSnapshotPlanningFingerprint(snapshotHealth)) {
    try {
      markerState = await primary.getPlanningProjectionParityState();
    } catch {
      // A release may reach the application before its optional migration.
      // Never trust an unavailable marker; the established full parity route
      // below remains the safe fallback until the schema is ready.
      markerState = null;
    }
  }

  if (!forceFullParity && hasMatchingPlanningProjectionMarker(markerState, snapshotHealth)) {
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
  if (!forceFullParity && cached?.cacheKey === cacheKey && now() - cached.checkedAt < PLANNING_POSTGRES_PARITY_CACHE_TTL_MS) {
    checked = cached.checked;
  } else {
    try {
      checked = await inspectWorkOrderProjectionParity({ primary, snapshot });
      // Persist a proof only if neither source changed while the expensive
      // comparison was running.  The PostgreSQL epoch is trigger-maintained
      // for every order/operation/slot write; the snapshot SHA covers the
      // planning value independently from unrelated UI state changes.
      if (checked.parity.matches && markerSupported && markerState && getSnapshotPlanningFingerprint(snapshotHealth)) {
        const [primaryAfter, snapshotAfter] = await Promise.all([
          primary.getPlanningProjectionParityState().catch(() => null),
          snapshot.health().catch(() => null),
        ]);
        if (!primaryAfter || !snapshotAfter
          || Number(primaryAfter.primaryRevision) !== Number(markerState.primaryRevision)
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
          const marked = await primary.markPlanningProjectionParity({
            primaryRevision: markerState.primaryRevision,
            snapshotFingerprint: getSnapshotPlanningFingerprint(snapshotHealth),
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
    planningPostgresParityCache = { cacheKey, checkedAt: now(), checked };
  }

  const fallbackReason = checked.parity.matches ? "" : PLANNING_POSTGRES_FALLBACK_REASON;
  let verifiedMarkerState = null;
  let verifiedSnapshotHealth = snapshotHealth;
  if (!fallbackReason) {
    [verifiedMarkerState, verifiedSnapshotHealth] = await Promise.all([
      Promise.resolve().then(() => primary.getPlanningProjectionParityState()).catch(() => null),
      snapshot.health().catch(() => null),
    ]);
  }
  // Re-read both sides after the CAS marker write.  A direct PostgreSQL or
  // legacy snapshot change that interleaves with the full proof must not be
  // promoted to a trusted primary read.
  const readVerification = fallbackReason
    ? null
    : createPlanningProjectionReadVerification(verifiedMarkerState, verifiedSnapshotHealth);
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

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export async function handleDomainApiRequest(req, res, url, {
  headers,
  filePath = "",
  env = process.env,
  // Injection keeps the parity guard independently testable without needing
  // a live PostgreSQL connection in HTTP-level QA.
  workOrdersRepositoryFactory = createWorkOrdersRepository,
  // The additive dispatch endpoint has its own focused HTTP contract. Keeping
  // its factory injectable lets that contract run without a live PostgreSQL
  // database and does not alter the existing global shift-execution route.
  shiftExecutionReadRepositoryFactory = createShiftExecutionReadRepository,
  shiftExecutionCommandRepositoryFactory = createShiftExecutionCommandRepository,
} = {}) {
  if (!url.pathname.startsWith(API_PREFIX)) return false;
  const isPlanningWorkbenchBootstrap = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/work-orders/bootstrap`;
  const planningBootstrapTiming = isPlanningWorkbenchBootstrap
    ? { startedAt: getRequestTimingNow(), planningSafetyMs: 0 }
    : null;
  const orderMatch = url.pathname.match(/^\/api\/v1\/planning\/work-orders\/([^/]+)$/);
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
  const isSlotPatch = req.method === "PATCH" && Boolean(slotMatch);
  const isPlanningPeriodRead = req.method === "GET" && url.pathname === `${API_PREFIX}/planning/period`;
  const isSpecifications2WorkOrderCommand = req.method === "POST" && Boolean(specifications2WorkOrderCommandMatch);
  if (req.method !== "GET" && !isOrderPatch && !isSlotPatch && !isSpecifications2WorkOrderCommand && !isSpecifications2PublishCommand && !isSpecifications2AttachmentCommand && !isSystemDomainsWrite && !isShiftExecutionAssignmentCommand && !isShiftExecutionAssignmentUpdate && !isShiftExecutionFactCommand && !isShiftExecutionCarryoverCommand && !isShiftExecutionCarryoverCancel) {
    sendJson(res, headers, 405, { ok: false, error: "Method is not allowed" });
    return true;
  }

  const planningPeriod = isPlanningPeriodRead ? readPlanningPeriod(url) : null;
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
      const payload = { ok: true, apiVersion: "v1", ...result };
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

  if (url.pathname === `${API_PREFIX}/specifications2/capabilities`) {
    let attachmentUploadEnabled = false;
    let revisionPublicationSchemaReady = false;
    const revisionPublicationPrimaryConfigured = isSpecifications2RevisionPublicationPrimaryConfigured(env);
    const workOrderCommandRequested = String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1"
      && health.storageBackend === "postgresql"
      && typeof workOrders.listPendingSnapshotSyncs === "function";
    const planningSafety = workOrderCommandRequested ? await getPlanningSafety() : null;
    if (String(env.MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS || "") === "1" && health.storageBackend === "postgresql") {
      let attachments;
      try {
        attachments = createSpecifications2AttachmentRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        attachmentUploadEnabled = (await attachments.commandReadiness()).schemaReady === true;
      } catch {
        attachmentUploadEnabled = false;
      } finally { await attachments?.close?.(); }
    }
    if (revisionPublicationPrimaryConfigured && health.storageBackend === "postgresql") {
      let publications;
      try {
        publications = createSpecifications2PublishCommandRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        revisionPublicationSchemaReady = (await publications.commandReadiness()).schemaReady === true;
      } catch {
        revisionPublicationSchemaReady = false;
      } finally { await publications?.close?.(); }
    }
    const revisionPublicationEnabled = revisionPublicationPrimaryConfigured
      && health.storageBackend === "postgresql"
      && revisionPublicationSchemaReady;
    sendJson(res, headers, 200, { ok: true, apiVersion: "v1", capabilities: {
      workOrderCreationEnabled: workOrderCommandRequested && !planningSafety?.fallbackReason,
      revisionPublicationEnabled,
      // When enabled the command is the durable first write.  Clients must
      // wait for its acknowledgement before producing the legacy-compatible
      // browser projection, otherwise a failed PostgreSQL command would look
      // like a successful production publication.
      revisionPublicationServerPrimary: revisionPublicationEnabled,
      revisionPublicationPrimaryConfigured,
      revisionPublicationSchemaReady,
      attachmentUploadEnabled,
      workOrderPrimaryPostgres: health.storageBackend === "postgresql",
      ...(planningSafety?.fallbackReason ? { workOrderFallbackReason: planningSafety.fallbackReason } : {}),
    } });
    return true;
  }

  if (url.pathname === `${API_PREFIX}/system-domains/capabilities`) {
    const enabledSurfaces = getEnabledSystemDomainsCommandSurfaces(env);
    const commandRequested = enabledSurfaces.length > 0 && health.storageBackend === "postgresql";
    const actorAuthorization = getSystemDomainsCommandActorAuthorization(getPublicAuthPrincipal(req, env), env);
    let consistency = null;
    if (commandRequested) {
      let domains;
      try {
        domains = createSystemDomainsRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
        consistency = await inspectSystemDomainsSnapshotConsistency({ primary: domains, env, filePath });
      } catch (error) {
        consistency = { ok: false, matches: false, error: error?.message || "System Domains consistency check is unavailable" };
      } finally { await domains?.close?.(); }
    }
    const serverAuthoritative = hasSystemDomainsServerAuthority(consistency, enabledSurfaces);
    const serverCommandsConfigured = commandRequested && serverAuthoritative && actorAuthorization.policyConfigured;
    const serverCommandsEnabled = serverCommandsConfigured && actorAuthorization.authorized;
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
      serverCommandSurfaces: serverCommandsEnabled ? enabledSurfaces : [],
      actorAuthorization,
      primaryPostgres: health.storageBackend === "postgresql",
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
          enabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1"
            && health.storageBackend === "postgresql"
            && typeof workOrders.listPendingSnapshotSyncs === "function"
            && !planningSafety.fallbackReason,
          reason: planningSafety.fallbackReason || commandReadinessReason({
            featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1",
            primaryReady: health.storageBackend === "postgresql",
            schemaReady: typeof workOrders.listPendingSnapshotSyncs === "function",
            featureName: "Specifications 2.0 work-order creation",
          }),
        },
        specifications2RevisionPublication: {
          enabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1" && health.storageBackend === "postgresql",
          reason: commandReadinessReason({
            featureEnabled: String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1",
            primaryReady: health.storageBackend === "postgresql",
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
      shifts = shiftExecutionReadRepositoryFactory({ databaseUrl });
      const summary = await shifts.summary();
      const commandReadiness = await shifts.commandReadiness();
      readiness.shiftExecution = {
        ready: summary.storageBackend === "postgresql",
        storageBackend: summary.storageBackend,
        summary: summary.summary,
        // A scheduled operation is not automatically a shift assignment:
        // the workshop creates assignments only when a master distributes
        // work. Therefore an empty source is a valid synchronized state, not
        // an incomplete migration.
        sourceSynchronized: true,
        migrationState: Number(summary.summary?.assignmentCount || 0) > 0 ? "synchronized" : "empty-source",
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
      const commandsEnabled = String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") === "1" && health.storageBackend === "postgresql" && commandReadiness.schemaReady === true;
      sendJson(res, headers, 200, { ok: true, apiVersion: "v1", capabilities: {
        assignmentCreationEnabled: commandsEnabled,
        carryoverCancellationEnabled: commandsEnabled,
        primaryPostgres: health.storageBackend === "postgresql",
        schemaReady: commandReadiness.schemaReady === true,
      } });
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution command storage is unavailable" });
    } finally { await shifts?.close?.(); }
    return true;
  }

  if (isShiftExecutionAssignmentCommand || isShiftExecutionAssignmentUpdate || isShiftExecutionFactCommand || isShiftExecutionCarryoverCommand || isShiftExecutionCarryoverCancel) {
    if (String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") !== "1" || health.storageBackend !== "postgresql") {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Shift execution server commands are not enabled during snapshot migration" });
      return true;
    }
    let commandReadiness;
    try {
      const readRepository = shiftExecutionReadRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      commandReadiness = await readRepository.commandReadiness();
      await readRepository.close();
    } catch (error) {
      sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution command storage is unavailable" });
      return true;
    }
    if (commandReadiness.schemaReady !== true) {
      sendJson(res, headers, 409, { ok: false, apiVersion: "v1", error: "Shift execution server commands are not enabled during snapshot migration" });
      return true;
    }
    const actor = getPublicAuthPrincipal(req, env);
    if (!actor) { sendJson(res, headers, 401, { ok: false, apiVersion: "v1", error: "Authenticated public session is required to modify shift execution" }); return true; }
    let payload;
    try { payload = await readRequestBody(req); }
    catch { sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Request body must be valid JSON" }); return true; }
    const idempotencyKey = String(req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"] || payload?.idempotencyKey || "").trim();
    if (!idempotencyKey || idempotencyKey.length > 160) { sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Idempotency key is required" }); return true; }
    let shifts;
    try {
      shifts = shiftExecutionCommandRepositoryFactory({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = isShiftExecutionCarryoverCancel
        ? await shifts.cancelCarryover({ ...payload, carryoverId: decodeURIComponent(shiftCarryoverMatch[1]), idempotencyKey, actorId: actor.id })
        : isShiftExecutionCarryoverCommand
        ? await shifts.createCarryover({ ...payload, idempotencyKey, actorId: actor.id })
        : isShiftExecutionFactCommand
        ? await shifts.recordFact({ ...payload, assignmentId: decodeURIComponent(shiftFactMatch[1]), idempotencyKey, actorId: actor.id })
        : isShiftExecutionAssignmentUpdate
        ? await shifts.updateAssignment({ ...payload, assignmentId: decodeURIComponent(shiftAssignmentMatch[1]), idempotencyKey, actorId: actor.id })
        : await shifts.createAssignment({ ...payload, idempotencyKey, actorId: actor.id });
      if (result.conflict) sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...result, error: result.error || "Shift execution command conflicts with the current server state" });
      else if (!result.item) sendJson(res, headers, 422, { ok: false, apiVersion: "v1", error: result.error || "Shift assignment cannot be saved" });
      else sendJson(res, headers, result.created && !isShiftExecutionCarryoverCancel ? 201 : 200, { ok: true, apiVersion: "v1", ...result });
    } catch (error) { sendJson(res, headers, 503, { ok: false, apiVersion: "v1", error: error?.message || "Shift execution command storage is unavailable" }); }
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
    let candidate;
    try { candidate = normalizeSystemDomainsCommandPayload(payload.domains); }
    catch (error) {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: error?.message || "System Domains payload is invalid" });
      return true;
    }
    let domains;
    try {
      domains = createSystemDomainsRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const preflightConsistency = await inspectSystemDomainsSnapshotConsistency({ primary: domains, env, filePath });
      if (!hasSystemDomainsServerAuthority(preflightConsistency, enabledSurfaces)) {
        sendJson(res, headers, 409, {
          ok: false,
          apiVersion: "v1",
          error: "System Domains command authority requires a stable compatibility proof",
          consistency: preflightConsistency,
        });
        return true;
      }
      const currentProjection = await domains.get();
      const currentRevisionMatches = Boolean(currentProjection.item) && Number(currentProjection.revision) === expected.value;
      if (!currentRevisionMatches) {
        const replay = await domains.inspectCommandReplay(candidate, {
          idempotencyKey,
          expectedRevision: expected.value,
          actorId: actor.id,
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
      }
      const result = await domains.replace(candidate, {
        source: `api-command:${surface}`, expectedRevision: expected.value, actorId: actor.id, commandType: `replace_projection:${surface}`, idempotencyKey,
      });
      if (result.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", conflict: true, error: "System Domains revision conflict", revision: result.revision });
      } else {
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
    const actor = getPublicAuthPrincipal(req, env);
    if (!actor) {
      sendJson(res, headers, 401, { ok: false, apiVersion: "v1", error: "Authenticated public session is required to publish a Specifications 2.0 revision" });
      return true;
    }
    let payload;
    try { payload = await readRequestBody(req); }
    catch { sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Request body must be valid JSON" }); return true; }
    const idempotencyKey = String(req.headers?.["idempotency-key"] || req.headers?.["Idempotency-Key"] || payload?.idempotencyKey || "").trim();
    const expectedPreviousRevision = Number(payload?.expectedPreviousRevision);
    if (!payload?.entry || !idempotencyKey || idempotencyKey.length > 160
      || !Number.isInteger(expectedPreviousRevision) || expectedPreviousRevision < 0) {
      sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Editor entry, idempotency key and expected previous revision are required" });
      return true;
    }
    let command;
    try {
      command = createSpecifications2PublishCommandRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
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
    let attachments;
    try {
      attachments = createSpecifications2AttachmentRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
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
    const actor = getPublicAuthPrincipal(req, env);
    if (!actor) {
      await attachments.close();
      sendJson(res, headers, 401, { ok: false, apiVersion: "v1", error: "Authenticated public session is required to upload a Specifications 2.0 attachment" });
      return true;
    }
    let payload;
    try { payload = await readRequestBody(req); }
    catch { await attachments.close(); sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Request body must be valid JSON" }); return true; }
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
    const actor = getPublicAuthPrincipal(req, env);
    if (!actor) {
      sendJson(res, headers, 401, { ok: false, apiVersion: "v1", error: "Authenticated public session is required to download a Specifications 2.0 attachment" });
      return true;
    }
    let attachments;
    try {
      attachments = createSpecifications2AttachmentRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
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

  if (specifications2WorkOrderCommandMatch) {
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
    let planningSafety = await getPlanningSafety();
    if (planningSafety.fallbackReason) {
      sendPlanningWriteParityConflict(res, headers, planningSafety);
      return true;
    }
    // Creation is a protected write: the actor is derived only from the
    // signed HttpOnly session.  Internal or anonymous requests must not gain
    // write access merely because the migration feature flag is enabled.
    const actor = getPublicAuthPrincipal(req, env);
    if (!actor) {
      sendJson(res, headers, 401, { ok: false, apiVersion: "v1", error: "Authenticated public session is required to create a work order" });
      return true;
    }
    let payload;
    try { payload = await readRequestBody(req); }
    catch { sendJson(res, headers, 400, { ok: false, apiVersion: "v1", error: "Request body must be valid JSON" }); return true; }
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
      command = createSpecifications2WorkOrderCommandRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
      const result = await command.create({ revisionId: decodeURIComponent(specifications2WorkOrderCommandMatch[1]), routeSourceDraftId, quantity, idempotencyKey, actorId: actor.id });
      if (!result.item) {
        sendJson(res, headers, 422, { ok: false, apiVersion: "v1", error: result.error || "Published revision cannot create a work order" });
      } else {
        let snapshotSync;
        try {
          const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
          snapshotSync = await syncPendingSnapshotChanges({ primary: workOrders, snapshot: snapshotRepository });
        } catch (error) {
          snapshotSync = { applied: 0, conflicts: 0, failed: 1, error: error?.message || "Snapshot creation sync deferred" };
        }
        sendJson(res, headers, result.created ? 201 : 200, { ok: true, apiVersion: "v1", ...result, snapshotSync });
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
    const snapshotRepository = await workOrdersRepositoryFactory({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" }, filePath });
    const { primary, snapshot, parity } = await inspectWorkOrderProjectionParity({ primary: workOrders, snapshot: snapshotRepository });
    sendJson(res, headers, 200, {
      ok: parity.matches,
      apiVersion: "v1",
      primary: { storageMode: primary.storageMode, count: primary.items.length },
      snapshot: { storageMode: snapshot.storageMode, count: snapshot.items.length },
      parity,
    });
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
    let planningSafety = await getPlanningSafety();
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
    const etag = getPlanningResponseEtag(listed.revision, planningSafety);
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
      payload = await readRequestBody(req);
    } catch {
      sendJson(res, headers, 400, { ok: false, ...meta, error: "Request body must be valid JSON" });
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
      const updated = await workOrders.changeSlotSchedule(id, operationId, { plannedStart, expectedRevision: expected.value });
      if (updated.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...updated, error: "Work order was changed by another client" }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
        return true;
      }
      if (!updated.item) {
        sendJson(res, headers, 404, { ok: false, ...meta, error: "Planning operation or slot was not found" });
        return true;
      }
      let snapshotSync = null;
      if (updated.storageBackend === "postgres" && workOrders.listPendingSnapshotSyncs) {
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
        payload = await readRequestBody(req);
      } catch {
        sendJson(res, headers, 400, { ok: false, ...meta, error: "Request body must be valid JSON" });
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
      const updated = await workOrders.changeQuantity(id, { quantity, expectedRevision: expected.value });
      if (updated.conflict) {
        sendJson(res, headers, 409, { ok: false, apiVersion: "v1", ...updated, error: "Work order was changed by another client" }, updated.item ? { ETag: getRevisionEtag(updated.item.concurrencyRevision) } : {});
        return true;
      }
      // During the staged migration PostgreSQL is the write authority, while
      // legacy modules still read the shared snapshot. Delivery is best-effort:
      // a pending outbox record is retained on a transient failure and retried
      // by the next write/worker invocation.
      let snapshotSync = null;
      if (updated.storageBackend === "postgres" && workOrders.listPendingSnapshotSyncs) {
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
