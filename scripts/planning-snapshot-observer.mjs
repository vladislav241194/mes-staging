import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

export const PLANNING_SNAPSHOT_STATE_KEY = "mes-planning-prototype-state-v2";

function normalizedStorageMode(env = process.env) {
  return String(env?.MES_DOMAIN_STORAGE || "").trim().toLowerCase();
}

function observerExplicitlyDisabled(env = process.env) {
  return ["0", "false", "off", "no"].includes(String(env?.MES_ENABLE_PLANNING_SNAPSHOT_OBSERVER || "").trim().toLowerCase());
}

// PostgreSQL mode opts into this additive guard automatically once migration
// 024 exists.  An explicit false remains an immediate operational rollback.
export function isPlanningSnapshotObservationEnabled(env = process.env) {
  return normalizedStorageMode(env) === "postgres" && !observerExplicitlyDisabled(env);
}

function planningValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

export function getPlanningSnapshotFingerprint(snapshot = {}) {
  const value = planningValue(snapshot?.values?.[PLANNING_SNAPSHOT_STATE_KEY]);
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function hasPlanningSnapshotChange(current = {}, next = {}) {
  return planningValue(current?.values?.[PLANNING_SNAPSHOT_STATE_KEY])
    !== planningValue(next?.values?.[PLANNING_SNAPSHOT_STATE_KEY]);
}

function observationError(error) {
  return {
    code: String(error?.code || ""),
    message: String(error?.message || "Planning snapshot observation is unavailable"),
  };
}

function isSchemaUnavailable(error = {}) {
  // PostgreSQL emits 42703 for a column that does not exist yet.  Retain the
  // previous snapshot-health verification while a rolling release waits for
  // the additive migration; do not mistake it for a healthy fast path.
  return error.code === "42703" || error.code === "42P01";
}

function databaseUrl(env = process.env) {
  return String(env?.DATABASE_URL || env?.MES_DOMAIN_DATABASE_URL || "").trim();
}

function normalizedAppEnv(env = process.env) {
  return String(env?.APP_ENV || env?.MES_APP_ENV || "").trim().toLowerCase();
}

function isPilotTarget({ targetAppEnv = "", targetSharedStateFile = "" } = {}) {
  return String(targetAppEnv || "").trim().toLowerCase() === "pilot"
    || /^\/srv\/mes\/pilot(?:\/|$)/.test(String(targetSharedStateFile || "").trim());
}

function parseDomainEnvironmentDatabaseUrl(raw = "") {
  for (const line of String(raw || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(?:DATABASE_URL|MES_DOMAIN_DATABASE_URL)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = String(match[1] || "").trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).trim();
    }
    return value;
  }
  return "";
}

async function readPilotDomainDatabaseUrl({ env = process.env, readEnvFile = readFile } = {}) {
  const envFile = String(env?.MES_PILOT_DOMAIN_ENV_FILE || "/etc/mes/mes-pilot-domain.env").trim();
  if (!envFile) return "";
  try {
    return parseDomainEnvironmentDatabaseUrl(await readEnvFile(envFile, "utf-8"));
  } catch {
    // A deploy-owned process often cannot read /etc/mes. Its own pilot
    // service environment remains the preferred source; a missing readable
    // file must simply leave the guarded writer fail-closed below.
    return "";
  }
}

// Resolve an environment for a managed writer without ever carrying a source
// contour's DATABASE_URL into a pilot marker. Target-pilot writes are guarded
// even from a root shell that missed the service drop-in: a missing pilot URL
// makes beginPlanningSnapshotObservation fail before any planning write.
export async function resolvePlanningSnapshotObservationEnvironment({
  env = process.env,
  targetAppEnv = "",
  targetSharedStateFile = "",
  readEnvFile = readFile,
} = {}) {
  const resolved = { ...env };
  if (!isPilotTarget({ targetAppEnv, targetSharedStateFile })) {
    if (!normalizedStorageMode(resolved) && databaseUrl(resolved)) {
      resolved.MES_DOMAIN_STORAGE = "postgres";
    }
    return resolved;
  }

  const explicitPilotUrl = String(env?.MES_PILOT_DOMAIN_DATABASE_URL || "").trim();
  const inheritedPilotUrl = normalizedAppEnv(env) === "pilot" ? databaseUrl(env) : "";
  const filePilotUrl = explicitPilotUrl || inheritedPilotUrl
    ? ""
    : await readPilotDomainDatabaseUrl({ env, readEnvFile });
  const pilotDatabaseUrl = explicitPilotUrl || inheritedPilotUrl || filePilotUrl;

  delete resolved.DATABASE_URL;
  delete resolved.MES_DOMAIN_DATABASE_URL;
  if (pilotDatabaseUrl) resolved.DATABASE_URL = pilotDatabaseUrl;
  resolved.MES_DOMAIN_STORAGE = "postgres";
  return resolved;
}

export async function beginPlanningSnapshotObservation({
  env = process.env,
  current = {},
  next = {},
  source = "shared-state-write",
  repositoryFactory = createPostgresWorkOrdersRepository,
} = {}) {
  const changed = hasPlanningSnapshotChange(current, next);
  if (!changed || !isPlanningSnapshotObservationEnabled(env)) {
    return { enabled: false, changed, ok: true, snapshotFingerprint: changed ? getPlanningSnapshotFingerprint(next) : "" };
  }
  const url = databaseUrl(env);
  if (!url) {
    return { enabled: true, changed, ok: false, schemaUnavailable: false, error: "DATABASE_URL is required for Planning snapshot observation" };
  }
  try {
    const repository = repositoryFactory({ databaseUrl: url });
    const marker = await repository.beginPlanningSnapshotObservation({ source });
    if (!marker || !Number(marker.snapshotGeneration)) {
      return { enabled: true, changed, ok: false, schemaUnavailable: false, error: "Planning snapshot observation marker is unavailable" };
    }
    return {
      enabled: true,
      changed,
      ok: true,
      repository,
      snapshotGeneration: Number(marker.snapshotGeneration),
      primaryRevision: Number(marker.primaryRevision || 0),
      snapshotFingerprint: getPlanningSnapshotFingerprint(next),
      source: String(source || "shared-state-write"),
    };
  } catch (error) {
    const normalized = observationError(error);
    return {
      enabled: true,
      changed,
      ok: isSchemaUnavailable(normalized),
      schemaUnavailable: isSchemaUnavailable(normalized),
      error: normalized.message,
      errorCode: normalized.code,
    };
  }
}

// Recording happens only after the file/KV CAS has committed.  A failure must
// leave the generation pending: that sacrifices the fast path but never lets
// an unobserved snapshot be treated as parity-safe.
export async function recordPlanningSnapshotObservation({ observation = null, snapshot = {}, source = "" } = {}) {
  if (!observation?.enabled || !observation?.changed) {
    return { attempted: false, recorded: false, schemaUnavailable: Boolean(observation?.schemaUnavailable) };
  }
  if (observation?.schemaUnavailable) {
    return { attempted: false, recorded: false, schemaUnavailable: true };
  }
  if (!observation.ok || !observation.repository) {
    return { attempted: false, recorded: false, error: observation?.error || "Planning snapshot observation did not start" };
  }
  try {
    const recorded = await observation.repository.recordPlanningSnapshotObservation({
      snapshotGeneration: observation.snapshotGeneration,
      snapshotVersion: Number(snapshot?.version || 0),
      snapshotFingerprint: observation.snapshotFingerprint || getPlanningSnapshotFingerprint(snapshot),
      source: String(source || observation.source || "shared-state-write"),
    });
    return { attempted: true, recorded: recorded === true, snapshotGeneration: observation.snapshotGeneration };
  } catch (error) {
    return { attempted: true, recorded: false, error: observationError(error).message, snapshotGeneration: observation.snapshotGeneration };
  }
}
