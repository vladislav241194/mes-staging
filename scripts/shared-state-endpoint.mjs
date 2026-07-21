import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { isExactIsoCalendarDate } from "../src/domain/calendar_date.js";
import {
  appendSharedStateAudit,
  backupSharedStateFile,
  isDestructiveActionsAllowed,
  isProtectedAppEnv,
  isSharedStateActionDestructive,
  resolveSharedStateBackupDir,
  withSharedStateFileLock,
  writeSharedStateFileAtomic,
} from "./shared-state-storage.mjs";
import {
  beginPlanningSnapshotObservation,
  recordPlanningSnapshotObservation,
} from "./planning-snapshot-observer.mjs";
import {
  applyNomenclatureTypeCommand,
  validateNomenclatureTypeBoardOwnerBoundary,
} from "./directory-cluster-type-reducer.mjs";
import { applyBoardCommand } from "./directory-cluster-board-reducer.mjs";
import {
  applyNomenclatureCommandReducer,
  buildNomenclatureCommandRequestFingerprint,
  buildNomenclatureDirectoryOutcomeFingerprint,
  validateNomenclatureDirectoryClusterBoundary,
} from "./domain-nomenclature-reducer.mjs";
import {
  buildSpecifications2CompatibilityPayloadDigest,
  buildSpecifications2RelationalReleaseFingerprint,
} from "./domain-specifications2-export.mjs";
import {
  matchesSpecifications2ReleaseFingerprint,
  publishSpecifications2Entry,
  specifications2ReleaseFingerprintAdapterVersion,
} from "../src/modules/specifications2/publication.js";

const MAX_SHARED_STATE_BODY_BYTES = 20 * 1024 * 1024;
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const COMPRESSIBLE_RESPONSE_BYTES = 1024;
const DEFAULT_SHARED_STATE_KEY = "mes:staging:shared-state:v1";
const SYSTEM_DOMAINS_STORAGE_KEY = "mes-planning-prototype-system-domains-v1";
const SPECIFICATIONS2_STORAGE_KEY = "mes-specifications-2-registry-v1";
const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
export const NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY = "mes-nomenclature-command-receipts-v1";
export const DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY = "mes-directory-cluster-command-receipts-v1";
const SHARED_STATE_AUTHORITY_OWNERS = new Set([
  "nomenclature-command",
  "directory-cluster-command",
  "specifications2-publication",
  "specifications2-work-order",
]);
const DIRECTORY_VALUE_KEYS = new Set([
  DIRECTORY_STORAGE_KEY,
  "mes-planning-prototype-directories-defaults-restored-v1",
  "mes-planning-prototype-directories-deleted-entities-v1",
]);
const PLANNING_STATE_KEY = "mes-planning-prototype-state-v2";
const SYSTEM_DOMAINS_COMPATIBILITY_HEADER = "x-mes-system-domains-compatibility";
const SPECIFICATIONS2_PUBLICATION_AUTHORITY_MAX = 500;
const SPECIFICATIONS2_PUBLICATION_ROOT_HISTORY_MAX = 64;
const SPECIFICATIONS2_PUBLICATION_FINGERPRINT_MAX_BYTES = 512 * 1024;
const SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_BYTES = 512 * 1024;
const SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_DEPTH = 24;
const SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_NODES = 50_000;
const SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_STRING_BYTES = 64 * 1024;
const NOMENCLATURE_COMMAND_RECEIPTS_MAX = 500;
const DIRECTORY_COMMAND_RECEIPTS_MAX = 500;
const DIRECTORY_COMMAND_RECEIPTS_MAX_BYTES = 2 * 1024 * 1024;
const SHIFT_EXECUTION_SHARED_UI_KEYS = new Set([
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
]);

function isExactEnabledFlag(value) {
  return String(value || "").trim() === "1";
}

// The bounded start-date evaluation gives PostgreSQL authority over one
// Planning command while legacy browser actions can still update several
// coupled domain values in one interaction.  Reject every browser-owned
// domain-value mutation during that window: otherwise an old tab can either
// overwrite the committed date or persist only one half of a coupled change
// (for example Directory without its Planning cleanup).  Compact shared-UI
// writes do not change `values` and remain available. Trusted server-side
// compatibility projections use updateSharedStateSnapshot directly and are
// therefore outside this browser CAS boundary.
export function isLegacyDomainWriteQuiesced(env = process.env) {
  return isExactEnabledFlag(env?.MES_ENABLE_PLANNING_START_DATE_COMMANDS)
    && String(env?.MES_DOMAIN_STORAGE || "").trim() === "postgres"
    && !isExactEnabledFlag(env?.MES_ENABLE_PLANNING_SERVER_COMMANDS);
}

export function inspectLegacyDomainSharedStateWrite(
  currentValues = {},
  nextValues = {},
  currentSharedUi = {},
  nextSharedUi = {},
  env = process.env,
) {
  if (!isLegacyDomainWriteQuiesced(env)) return { ok: true, quiesced: false, changedKeys: [] };
  const changedValueKeys = [...ALLOWED_VALUE_KEYS].filter((key) => (
    String(currentValues?.[key] ?? "") !== String(nextValues?.[key] ?? "")
  ));
  const changedSharedUiKeys = [...ALLOWED_SHARED_UI_KEYS]
    .filter((key) => !QUIESCE_ALLOWED_SHARED_UI_KEYS.has(key))
    .filter((key) => !sameJsonValue(currentSharedUi?.[key], nextSharedUi?.[key]));
  if (!changedValueKeys.length && !changedSharedUiKeys.length) {
    return { ok: true, quiesced: true };
  }
  return {
    ok: false,
    quiesced: true,
    changedKeys: [...changedValueKeys, ...changedSharedUiKeys.map((key) => `sharedUi.${key}`)],
    changedValueKeys,
    changedSharedUiKeys,
    code: "legacy-domain-writes-quiesced",
    error: "Legacy domain edits are temporarily paused during the start-date command evaluation",
  };
}

// Compatibility exports keep focused QA/importers stable while the public
// response marker moves to the truthful all-domain name.
export const isPlanningLegacyWriteQuiesced = isLegacyDomainWriteQuiesced;
export function inspectPlanningLegacySharedStateWrite(currentValues = {}, nextValues = {}, env = process.env) {
  return inspectLegacyDomainSharedStateWrite(currentValues, nextValues, {}, {}, env);
}
const ALLOWED_VALUE_KEYS = new Set([
  "mes-planning-prototype-state-v2",
  "mes-planning-prototype-directories-v2",
  "mes-planning-prototype-directories-defaults-restored-v1",
  "mes-planning-prototype-system-domains-v1",
  "mes-planning-prototype-directories-deleted-entities-v1",
  "mes-planning-prototype-work-center-operations-seeded-v2",
  "mes-specifications-2-registry-v1",
]);
const ALLOWED_SHARED_UI_KEYS = new Set([
  "ganttDependencyRoutes",
  "productionStructureMatrixOverrides",
  "timesheetCellOverrides",
  "timesheetScheduleOverrides",
  "shiftMasterBoardLaneBySlot",
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
  "shiftMasterAssignmentMatrix",
  "accessRoleProfiles",
  "accessRoleAssignments",
]);
const QUIESCE_ALLOWED_SHARED_UI_KEYS = new Set(["ganttDependencyRoutes"]);
const SHARED_UI_MAP_KEYS = new Set([
  "ganttDependencyRoutes",
  "productionStructureMatrixOverrides",
  "timesheetCellOverrides",
  "timesheetScheduleOverrides",
  "shiftMasterBoardLaneBySlot",
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
  "shiftMasterAssignmentMatrix",
  "accessRoleAssignments",
]);

// Revision-only browser polls are intentionally small on the wire, but a file
// store used to parse the complete multi-megabyte snapshot for every poll just
// to discover that its version had not changed. Keep a process-local parsed
// value keyed by the file's stat fingerprint; an external write invalidates it
// naturally on the next read without creating a second source of truth.
const FILE_SNAPSHOT_CACHE = new Map();

function normalizeSystemDomainsRetirement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const transitionId = String(value.transitionId || "").trim().slice(0, 160);
  const action = String(value.action || "").trim().slice(0, 120);
  if (!transitionId || !action) return null;
  return {
    transitionId,
    action,
    createdAt: typeof value.createdAt === "string" ? value.createdAt.slice(0, 80) : "",
  };
}

export function normalizeShiftExecutionRetirement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const transitionId = String(value.transitionId || "").trim().slice(0, 160);
  const sourceDigest = String(value.sourceDigest || "").trim().toLowerCase();
  const sourceSnapshotVersion = Number(value.sourceSnapshotVersion || 0);
  if (!transitionId || !/^[a-f0-9]{64}$/.test(sourceDigest)
    || !Number.isInteger(sourceSnapshotVersion) || sourceSnapshotVersion < 0) return null;
  return {
    transitionId,
    sourceDigest,
    sourceSnapshotVersion,
    retiredAt: typeof value.retiredAt === "string" ? value.retiredAt.slice(0, 80) : "",
  };
}

function retireShiftExecutionSharedUi(sharedUi, retirement) {
  const next = sharedUi && typeof sharedUi === "object" && !Array.isArray(sharedUi) ? { ...sharedUi } : {};
  if (!retirement) return next;
  SHIFT_EXECUTION_SHARED_UI_KEYS.forEach((key) => { delete next[key]; });
  return next;
}

function attemptsToRetireShiftExecutionSharedUi(payload = {}) {
  const full = payload.sharedUi && typeof payload.sharedUi === "object" ? payload.sharedUi : {};
  const replace = payload.sharedUiPatch?.replace && typeof payload.sharedUiPatch.replace === "object"
    ? payload.sharedUiPatch.replace : {};
  return [...SHIFT_EXECUTION_SHARED_UI_KEYS].some((key) => full[key] === null || replace[key] === null);
}

function attemptsToRestoreShiftExecutionSharedUi(payload = {}) {
  const full = payload.sharedUi && typeof payload.sharedUi === "object" ? payload.sharedUi : {};
  const maps = payload.sharedUiPatch?.maps && typeof payload.sharedUiPatch.maps === "object"
    ? payload.sharedUiPatch.maps : {};
  const replace = payload.sharedUiPatch?.replace && typeof payload.sharedUiPatch.replace === "object"
    ? payload.sharedUiPatch.replace : {};
  return [...SHIFT_EXECUTION_SHARED_UI_KEYS].some((key) => (
    (full[key] && typeof full[key] === "object")
    || (maps[key] && typeof maps[key] === "object")
    || (replace[key] && typeof replace[key] === "object")
  ));
}

function getFileFingerprint(fileStat) {
  // Size + mtime alone can survive an out-of-band restore.  Include the
  // platform file identity and ctime as well, so the process cache cannot
  // serve an older planning snapshot after an atomic replacement that keeps
  // the visible timestamp and byte size.
  return `${Number(fileStat?.dev || 0)}:${Number(fileStat?.ino || 0)}:${Number(fileStat?.size || 0)}:${Number(fileStat?.mtimeMs || 0)}:${Number(fileStat?.ctimeMs || 0)}`;
}

async function readFileSnapshot(filePath) {
  try {
    const fileStat = await stat(filePath);
    const fingerprint = getFileFingerprint(fileStat);
    const cached = FILE_SNAPSHOT_CACHE.get(filePath);
    if (cached?.fingerprint === fingerprint) return cloneSharedStateSnapshot(cached.snapshot);
    const raw = await readFile(filePath, "utf-8");
    const snapshot = parseSnapshot(raw) || createEmptySnapshot();
    FILE_SNAPSHOT_CACHE.set(filePath, { fingerprint, snapshot: cloneSharedStateSnapshot(snapshot) });
    return snapshot;
  } catch (error) {
    if (error?.code === "ENOENT") {
      FILE_SNAPSHOT_CACHE.delete(filePath);
      return createEmptySnapshot();
    }
    throw error;
  }
}

async function writeFileSnapshot(filePath, snapshot) {
  await writeSharedStateFileAtomic(filePath, snapshot);
  const fileStat = await stat(filePath);
  FILE_SNAPSHOT_CACHE.set(filePath, {
    fingerprint: getFileFingerprint(fileStat),
    snapshot: cloneSharedStateSnapshot(snapshot),
  });
}

function normalizeHeaders(headers, contentType = JSON_CONTENT_TYPE) {
  if (typeof headers === "function") return headers(contentType);
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

function sendJson(res, headers, statusCode, payload) {
  const responseHeaders = normalizeHeaders(headers);
  const serialized = Buffer.from(JSON.stringify(payload));
  const acceptsGzip = /\bgzip\b/i.test(String(res.__mesAcceptEncoding || ""));
  const useGzip = acceptsGzip && serialized.byteLength >= COMPRESSIBLE_RESPONSE_BYTES;
  const body = useGzip ? gzipSync(serialized) : serialized;
  const finalHeaders = useGzip
    ? {
      ...responseHeaders,
      "Content-Encoding": "gzip",
      "Vary": "Accept-Encoding",
      "Content-Length": String(body.byteLength),
    }
    : responseHeaders;
  if (typeof res.writeHead === "function") {
    res.writeHead(statusCode, finalHeaders);
    res.end(body);
    return;
  }

  Object.entries(finalHeaders).forEach(([key, value]) => res.setHeader?.(key, value));
  if (typeof res.status === "function" && typeof res.json === "function") {
    if (useGzip) {
      res.statusCode = statusCode;
      res.end?.(body);
      return;
    }
    res.status(statusCode).json(payload);
    return;
  }

  res.statusCode = statusCode;
  res.end?.(body);
}

function readStreamBody(req, limitBytes = MAX_SHARED_STATE_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body is too large"));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function readRequestBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return readStreamBody(req);
}

function getKvConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || "";
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  return {
    url,
    token,
    key: env.MES_SHARED_STATE_KEY || DEFAULT_SHARED_STATE_KEY,
  };
}

async function runKvCommand(config, command) {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `KV request failed with status ${response.status}`);
  }
  return data.result;
}

// GET + SET is not a compare-and-swap operation.  A browser save and an
// outbox projection can otherwise both read revision N and silently let the
// latter SET erase the former.  Keep the check and write in one Redis script.
// Upstash executes EVAL atomically as well, so this is valid for both of the
// supported KV REST configurations.
const KV_VERSIONED_COMPARE_AND_SET_SCRIPT = [
  "local raw = redis.call('GET', KEYS[1])",
  "local currentVersion = 0",
  "if raw then",
  "  local decodedOk, decoded = pcall(cjson.decode, raw)",
  "  if not decodedOk or type(decoded) ~= 'table' then return -1 end",
  "  currentVersion = tonumber(decoded.version) or 0",
  "end",
  "if currentVersion ~= tonumber(ARGV[1]) then return 0 end",
  "redis.call('SET', KEYS[1], ARGV[2])",
  "return 1",
].join("\n");

function normalizeKvCompareAndSetResult(result) {
  const status = Number(Array.isArray(result) ? result[0] : result);
  if (status === 1) return { ok: true };
  if (status === 0) return { ok: false, conflict: true };
  if (status === -1) return { ok: false, invalid: true, error: "KV shared state is not valid JSON and was not overwritten" };
  return { ok: false, error: "KV shared state did not confirm an atomic compare-and-set" };
}

function parseSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      updatedBy: parsed.updatedBy && typeof parsed.updatedBy === "object" ? parsed.updatedBy : null,
      values: parsed.values && typeof parsed.values === "object" ? parsed.values : null,
      sharedUi: parsed.sharedUi && typeof parsed.sharedUi === "object" ? parsed.sharedUi : {},
      events: Array.isArray(parsed.events) ? parsed.events.slice(0, 50) : [],
      // This compact proof survives the rolling event window. It is written
      // only by the root-controlled System Domains retirement path and lets a
      // pending authority transition resume safely after ordinary UI saves.
      systemDomainsRetirement: normalizeSystemDomainsRetirement(parsed.systemDomainsRetirement),
      // The server-side cutover owns this marker. Once present, legacy browser
      // saves cannot recreate the three Shift Execution compatibility maps.
      shiftExecutionRetirement: normalizeShiftExecutionRetirement(parsed.shiftExecutionRetirement),
      // Server-first Specifications 2.0 publications leave an authority
      // marker outside the browser-owned registry.  Old bundles normalise the
      // registry and would otherwise drop the marker on their next full save.
      specifications2PublicationAuthority: normalizeSpecifications2PublicationAuthority(parsed.specifications2PublicationAuthority),
    };
  } catch {
    return null;
  }
}

function normalizeSpecifications2PriorRoots(value, latestRootRouteId = "", latestRevision = 0) {
  const roots = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const rawRoot of roots) {
    const rootRouteId = typeof rawRoot?.rootRouteId === "string" ? rawRoot.rootRouteId.trim().slice(0, 200) : "";
    const revision = Number(rawRoot?.revision || 0);
    if (!rootRouteId || rootRouteId === latestRootRouteId || seen.has(rootRouteId)
      || !Number.isInteger(revision) || revision < 1 || (latestRevision > 0 && revision >= latestRevision)) continue;
    seen.add(rootRouteId);
    result.push({
      revision,
      specificationId: typeof rawRoot?.specificationId === "string" ? rawRoot.specificationId.slice(0, 200) : "",
      rootRouteId,
      releasedAt: typeof rawRoot?.releasedAt === "string" ? rawRoot.releasedAt.slice(0, 80) : "",
    });
    if (result.length >= SPECIFICATIONS2_PUBLICATION_ROOT_HISTORY_MAX) break;
  }
  return result;
}

function normalizeSpecifications2Publication(rawPublication) {
  const revision = Number(rawPublication?.revision || 0);
  const fingerprint = typeof rawPublication?.fingerprint === "string"
    && Buffer.byteLength(rawPublication.fingerprint) <= SPECIFICATIONS2_PUBLICATION_FINGERPRINT_MAX_BYTES
    ? rawPublication.fingerprint
    : "";
  const rootRouteId = typeof rawPublication?.rootRouteId === "string" ? rawPublication.rootRouteId.trim().slice(0, 200) : "";
  if (!Number.isInteger(revision) || revision < 1 || !fingerprint) return null;
  const publication = {
    revision,
    fingerprint,
    specificationId: typeof rawPublication?.specificationId === "string" ? rawPublication.specificationId.slice(0, 200) : "",
    rootRouteId,
    releasedAt: typeof rawPublication?.releasedAt === "string" ? rawPublication.releasedAt.slice(0, 80) : "",
  };
  const priorRoots = normalizeSpecifications2PriorRoots(rawPublication?.priorRoots, rootRouteId, revision);
  return priorRoots.length ? { ...publication, priorRoots } : publication;
}

function compactSpecifications2PublicationRoot(publication) {
  const revision = Number(publication?.revision || 0);
  const rootRouteId = String(publication?.rootRouteId || "").trim().slice(0, 200);
  if (!Number.isInteger(revision) || revision < 1 || !rootRouteId) return null;
  return {
    revision,
    specificationId: String(publication?.specificationId || "").slice(0, 200),
    rootRouteId,
    releasedAt: String(publication?.releasedAt || "").slice(0, 80),
  };
}

function specifications2PublicationRootIds(publication, { includePrior = true } = {}) {
  const result = new Set();
  const latest = String(publication?.rootRouteId || "").trim();
  if (latest) result.add(latest);
  if (includePrior) {
    for (const prior of (Array.isArray(publication?.priorRoots) ? publication.priorRoots : [])) {
      const rootRouteId = String(prior?.rootRouteId || "").trim();
      if (rootRouteId) result.add(rootRouteId);
    }
  }
  return result;
}

export function buildSpecifications2PublicationAuthority(snapshot = {}, entryId = "", publication = {}) {
  const normalizedEntryId = String(entryId || "").trim().slice(0, 200);
  const normalizedLatest = normalizeSpecifications2Publication(publication);
  if (!normalizedEntryId || !normalizedLatest || !normalizedLatest.rootRouteId) {
    throw new Error("Specifications 2.0 publication authority requires an exact entry and published root");
  }
  const { priorRoots: _untrustedPriorRoots, ...latest } = normalizedLatest;
  const currentPublications = snapshot?.specifications2PublicationAuthority?.publications;
  const publications = currentPublications && typeof currentPublications === "object" && !Array.isArray(currentPublications)
    ? currentPublications
    : {};
  const current = normalizeSpecifications2Publication(publications[normalizedEntryId]);
  const candidates = [];
  const currentLatest = compactSpecifications2PublicationRoot(current);
  if (currentLatest && currentLatest.rootRouteId !== latest.rootRouteId && currentLatest.revision < latest.revision) {
    candidates.push(currentLatest);
  }
  candidates.push(...normalizeSpecifications2PriorRoots(current?.priorRoots, latest.rootRouteId, latest.revision));
  const planning = parsePlanningState(snapshot?.values?.[PLANNING_STATE_KEY]);
  const referencedRootIds = new Set((Array.isArray(planning?.slots) ? planning.slots : [])
    .flatMap((slot) => [String(slot?.routeId || ""), String(slot?.planningOrderId || "")])
    .filter(Boolean));
  const operationalRootIds = new Set((Array.isArray(planning?.routes) ? planning.routes : [])
    .filter((route) => Boolean(String(route?.workOrderSnapshot?.id || "").trim()))
    .map((route) => String(route?.id || ""))
    .filter(Boolean));
  const activeRootIds = new Set([...referencedRootIds, ...operationalRootIds]);
  const activeCandidates = new Set(candidates
    .map((root) => String(root?.rootRouteId || ""))
    .filter((rootRouteId) => rootRouteId && activeRootIds.has(rootRouteId)));
  if (activeCandidates.size > SPECIFICATIONS2_PUBLICATION_ROOT_HISTORY_MAX) {
    throw new Error("Specifications 2.0 publication root history is full of active operational revisions");
  }
  candidates.sort((left, right) => (
    Number(activeRootIds.has(String(right?.rootRouteId || "")))
    - Number(activeRootIds.has(String(left?.rootRouteId || "")))
  ));
  const priorRoots = normalizeSpecifications2PriorRoots(candidates, latest.rootRouteId, latest.revision);
  const next = { ...publications };
  delete next[normalizedEntryId];
  next[normalizedEntryId] = priorRoots.length ? { ...latest, priorRoots } : latest;
  return {
    publications: Object.fromEntries(Object.entries(next).slice(-SPECIFICATIONS2_PUBLICATION_AUTHORITY_MAX)),
  };
}

function normalizeSpecifications2PublicationAuthority(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawPublications = value.publications;
  if (!rawPublications || typeof rawPublications !== "object" || Array.isArray(rawPublications)) return null;
  const publications = {};
  for (const [rawEntryId, rawPublication] of Object.entries(rawPublications).slice(0, SPECIFICATIONS2_PUBLICATION_AUTHORITY_MAX)) {
    const entryId = String(rawEntryId || "").trim().slice(0, 200);
    const publication = normalizeSpecifications2Publication(rawPublication);
    if (!entryId || !publication) continue;
    publications[entryId] = publication;
  }
  return Object.keys(publications).length ? { publications } : null;
}

function sanitizeValues(values, currentValues = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const entries = Object.entries(values)
    .filter(([key, value]) => ALLOWED_VALUE_KEYS.has(key) && (typeof value === "string" || value === null));
  const sanitized = Object.fromEntries(entries);
  ALLOWED_VALUE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) return;
    const currentValue = currentValues?.[key];
    if (typeof currentValue === "string" || currentValue === null) sanitized[key] = currentValue;
  });
  // Idempotency receipts are owned exclusively by the server-side
  // Nomenclature command handler. A legacy full-snapshot POST must preserve
  // them, but may neither create nor overwrite them from browser payload.
  const nomenclatureReceipts = currentValues?.[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY];
  if (typeof nomenclatureReceipts === "string") {
    sanitized[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY] = nomenclatureReceipts;
  }
  const directoryClusterReceipts = currentValues?.[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY];
  if (typeof directoryClusterReceipts === "string") {
    sanitized[DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY] = directoryClusterReceipts;
  }
  return sanitized;
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

function sameJsonValue(left, right) {
  return JSON.stringify(stableJsonValue(left)) === JSON.stringify(stableJsonValue(right));
}

function collectDanglingNomenclatureReferences(value, validIds, path = "", result = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDanglingNomenclatureReferences(entry, validIds, `${path}[${index}]`, result));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  Object.entries(value).forEach(([key, entry]) => {
    const entryPath = path ? `${path}.${key}` : key;
    if (["nomenclatureId", "outputNomenclatureId"].includes(key)) {
      const itemId = String(entry || "").trim();
      if (itemId && !validIds.has(itemId)) result.push({ path: entryPath, itemId });
      return;
    }
    collectDanglingNomenclatureReferences(entry, validIds, entryPath, result);
  });
  return result;
}

export function validateNomenclatureServerAuthorityWrite(current, next, env = process.env) {
  if (String(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS || "") !== "1") return { ok: true };
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const nextDirectory = parseJsonRecord(next?.values?.[DIRECTORY_STORAGE_KEY]);
  if (!currentDirectory || !nextDirectory
    || !Array.isArray(currentDirectory.nomenclature)
    || !Array.isArray(nextDirectory.nomenclature)
    || !Array.isArray(nextDirectory.bomLists)
    || !Array.isArray(nextDirectory.specifications)) {
    return {
      ok: false,
      code: "invalid-directory-projection",
      error: "Nomenclature server authority requires a complete directory projection",
    };
  }
  if (!sameJsonValue(currentDirectory.nomenclature, nextDirectory.nomenclature)) {
    return {
      ok: false,
      code: "nomenclature-command-required",
      error: "Nomenclature rows can only be changed through the server command endpoint",
    };
  }
  const validIds = new Set(nextDirectory.nomenclature.map((row) => String(row?.id || "").trim()).filter(Boolean));
  const danglingReferences = [
    ...collectDanglingNomenclatureReferences(nextDirectory.bomLists, validIds, "bomLists"),
    ...collectDanglingNomenclatureReferences(nextDirectory.specifications, validIds, "specifications"),
  ];
  if (danglingReferences.length) {
    return {
      ok: false,
      code: "dangling-nomenclature-reference",
      error: "BOM or Specifications contains a Nomenclature reference that does not exist",
      danglingReferences: danglingReferences.slice(0, 50),
    };
  }
  return { ok: true };
}

function directoryClusterOwnedProjection(directory) {
  const bomLinkedNomenclatureIds = new Set((directory.bomLists || []).flatMap((board) => (
    Array.isArray(board?.importRows) ? board.importRows.flatMap((row) => {
      const itemId = row && typeof row === "object" && !Array.isArray(row)
        ? String(row.nomenclatureId || "").trim()
        : "";
      return itemId ? [itemId] : [];
    }) : []
  )));
  const boardOwnedNomenclature = (directory.nomenclature || []).filter((row) => (
    String(row?.sourceBomResultId || "").trim()
    || (Array.isArray(row?.sourceBomIds) && row.sourceBomIds.length)
    || bomLinkedNomenclatureIds.has(String(row?.id || "").trim())
  ));
  return {
    nomenclatureTypes: directory.nomenclatureTypes,
    bomLists: directory.bomLists,
    nomenclatureTypeAssignments: (directory.nomenclature || []).map((row) => ({
      id: row?.id,
      type: row?.type,
    })),
    boardOwnedNomenclature,
    specificationDirectoryReferences: (directory.specifications || []).map((row) => ({
      id: row?.id,
      bomListA: row?.bomListA,
      bomListB: row?.bomListB,
      structureItems: Array.isArray(row?.structureItems) ? row.structureItems.map((item) => ({
        id: item?.id,
        bomListId: item?.bomListId,
        nomenclatureType: item?.nomenclatureType,
      })) : row?.structureItems,
    })),
  };
}

export function validateDirectoryClusterServerAuthorityWrite(current, next, env = process.env) {
  if (String(env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS || "") !== "1") return { ok: true };
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const nextDirectory = parseJsonRecord(next?.values?.[DIRECTORY_STORAGE_KEY]);
  if (!currentDirectory || !nextDirectory
    || !Array.isArray(currentDirectory.nomenclatureTypes)
    || !Array.isArray(currentDirectory.nomenclature)
    || !Array.isArray(currentDirectory.bomLists)
    || !Array.isArray(currentDirectory.specifications)
    || !Array.isArray(nextDirectory.nomenclatureTypes)
    || !Array.isArray(nextDirectory.nomenclature)
    || !Array.isArray(nextDirectory.bomLists)
    || !Array.isArray(nextDirectory.specifications)) {
    return {
      ok: false,
      code: "invalid-directory-projection",
      error: "Directory cluster server authority requires a complete Directory projection",
    };
  }
  if (!sameJsonValue(
    directoryClusterOwnedProjection(currentDirectory),
    directoryClusterOwnedProjection(nextDirectory),
  )) {
    return {
      ok: false,
      code: "directory-cluster-command-required",
      error: "Nomenclature Types, Boards/BOM and their cross-directory references can only be changed through the server command endpoints",
    };
  }
  return { ok: true };
}

function authorityFailure(code, error, { statusCode = 409 } = {}) {
  return { ok: false, forbidden: true, conflict: false, statusCode, code, error };
}

function resolveSharedStateAuthorityEnvironment(env = process.env) {
  const flag = (name) => (
    String(process.env?.[name] || "") === "1"
    || String(env?.[name] || "") === "1"
      ? "1"
      : "0"
  );
  return {
    MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: flag("MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS"),
    MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: flag("MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS"),
    MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: flag("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS"),
  };
}

function sameSnapshotValue(current, next, key) {
  return String(current?.values?.[key] ?? "") === String(next?.values?.[key] ?? "");
}

function parseReceiptLedger(snapshot, key) {
  const raw = snapshot?.values?.[key];
  if (raw === undefined || raw === null || raw === "") return { schemaVersion: 1, entries: {} };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && Number(parsed.schemaVersion || 0) === 1
      && parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
      ? { schemaVersion: 1, entries: parsed.entries }
      : null;
  } catch {
    return null;
  }
}

function commandReceiptKey(actorId, idempotencyKey) {
  return createHash("sha256").update(`${actorId}\0${idempotencyKey}`).digest("hex");
}

function normalizeCommandAuthorityProof(authority) {
  const proof = authority?.proof;
  const actorId = typeof proof?.actorId === "string" ? proof.actorId.trim() : "";
  const entityId = typeof proof?.entityId === "string" ? proof.entityId.trim() : "";
  const idempotencyKey = typeof proof?.idempotencyKey === "string" ? proof.idempotencyKey.trim() : "";
  if (!/^employee:[^\s]+$/u.test(actorId)
    || !entityId || entityId.length > 160
    || !idempotencyKey || idempotencyKey.length > 160 || !/^[\x21-\x7e]+$/u.test(idempotencyKey)) {
    return authorityFailure("shared-state-authority-proof-invalid", "Server command authority proof is incomplete");
  }
  return { ok: true, actorId, entityId, idempotencyKey, key: commandReceiptKey(actorId, idempotencyKey) };
}

function expectedReceiptLedger(currentLedger, key, receipt, { maxEntries, maxBytes = Infinity } = {}) {
  const sorted = Object.entries({ ...(currentLedger?.entries || {}), [key]: receipt }).sort((left, right) => (
    String(right[1]?.createdAt || "").localeCompare(String(left[1]?.createdAt || ""))
  ));
  let entries = sorted.slice(0, maxEntries);
  let ledger = { schemaVersion: 1, entries: Object.fromEntries(entries) };
  while (entries.length > 1 && Buffer.byteLength(JSON.stringify(ledger)) > maxBytes) {
    entries = entries.slice(0, -1);
    ledger = { schemaVersion: 1, entries: Object.fromEntries(entries) };
  }
  return Buffer.byteLength(JSON.stringify(ledger)) <= maxBytes ? ledger : null;
}

function validEmployeeReceiptIdentity(receipt, actorId) {
  const employeeId = String(receipt?.employeeId || "").trim();
  return Boolean(employeeId)
    && String(receipt?.actorId || "") === actorId
    && actorId === `employee:${employeeId}`;
}

function directoryProjectionFingerprint(directory) {
  try {
    return createHash("sha256").update(JSON.stringify(stableJsonValue(directory))).digest("hex");
  } catch {
    return "";
  }
}

function validateNomenclatureCommandAuthorityReceipt(current, next, authority, authorityEnv) {
  const proof = normalizeCommandAuthorityProof(authority);
  if (!proof.ok) return proof;
  const currentLedger = parseReceiptLedger(current, NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY);
  const nextLedger = parseReceiptLedger(next, NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY);
  const receipt = nextLedger?.entries?.[proof.key];
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const directory = parseJsonRecord(next?.values?.[DIRECTORY_STORAGE_KEY]);
  const proofCommand = authority?.proof?.command;
  const proofNow = String(authority?.proof?.now || "");
  const proofExpectedRevision = Number(authority?.proof?.expectedRevision);
  const currentRevision = Number(current?.version || 0);
  const kind = String(receipt?.kind || "");
  const expectedDestructive = kind === "delete";
  const expectedStatusCode = kind === "create" ? 201 : 200;
  const recoveryValid = receipt?.destructiveAction === false
    ? receipt.recoveryArtifact === null
    : receipt?.destructiveAction === true
      && receipt?.recoveryArtifact?.kind === "file-backup"
      && receipt?.recoveryArtifact?.status === "created"
      && Boolean(String(receipt?.recoveryArtifact?.artifactName || "").trim())
      && Boolean(String(receipt?.recoveryArtifact?.metadataName || "").trim());
  const expectedRequestFingerprint = isRecord(proofCommand)
    ? buildNomenclatureCommandRequestFingerprint(proofCommand)
    : "";
  const expectedMutation = currentDirectory && isRecord(proofCommand)
    && String(proofCommand.kind || "") === kind
    && String(proofCommand.itemId || "") === proof.entityId
    ? applyNomenclatureCommandReducer(currentDirectory, proofCommand, proofNow)
    : null;
  const clusterBoundary = currentDirectory && isRecord(proofCommand)
    ? validateNomenclatureDirectoryClusterBoundary(
      currentDirectory,
      proofCommand,
      authorityEnv?.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS === "1",
    )
    : null;
  if (clusterBoundary && !clusterBoundary.ok) {
    return authorityFailure(clusterBoundary.code || "directory-cluster-command-required", clusterBoundary.error || "Directory cluster owner rejected this Nomenclature transition");
  }
  const expectedLedger = receipt && currentLedger
    ? expectedReceiptLedger(currentLedger, proof.key, receipt, { maxEntries: NOMENCLATURE_COMMAND_RECEIPTS_MAX })
    : null;
  if (!currentLedger || !nextLedger || currentLedger.entries[proof.key] || !receipt || !directory
    || !isRecord(proofCommand) || !proofNow || proofNow !== String(receipt.createdAt || "")
    || !Number.isSafeInteger(proofExpectedRevision) || proofExpectedRevision < 0 || proofExpectedRevision > currentRevision
    || proofCommand.expectedRevision !== proofExpectedRevision
    || String(proofCommand.idempotencyKey || "") !== proof.idempotencyKey
    || !/^[a-f0-9]{64}$/u.test(String(receipt.requestFingerprint || ""))
    || receipt.requestFingerprint !== expectedRequestFingerprint
    || !/^[a-f0-9]{64}$/u.test(String(receipt.outcomeFingerprint || ""))
    || receipt.outcomeFingerprint !== buildNomenclatureDirectoryOutcomeFingerprint(directory)
    || !["create", "update", "delete"].includes(kind)
    || String(proofCommand.kind || "") !== kind
    || String(proofCommand.itemId || "") !== proof.entityId
    || String(receipt.itemId || "") !== proof.entityId
    || String(receipt.idempotencyKey || "") !== proof.idempotencyKey
    || !isRecord(receipt.item) || String(receipt.item.id || "") !== proof.entityId
    || Number(receipt.commandRevision || 0) !== Number(next?.version || 0)
    || receipt.baseRevision !== proofExpectedRevision
    || receipt.rebased !== (proofExpectedRevision < currentRevision)
    || receipt.statusCode !== expectedStatusCode
    || receipt.destructiveAction !== expectedDestructive
    || !recoveryValid
    || !validEmployeeReceiptIdentity(receipt, proof.actorId)
    || !expectedMutation?.ok
    || !sameJsonValue(expectedMutation.directory, directory)
    || !sameJsonValue(expectedMutation.item, receipt.item)
    || !sameJsonValue(expectedMutation.unlinkedReferences, receipt.unlinkedReferences)
    || !expectedLedger || !sameJsonValue(nextLedger, expectedLedger)) {
    return authorityFailure("shared-state-authority-receipt-invalid", "Server command receipt does not prove this exact shared-state transition");
  }
  return { ok: true, receipt, proof: { ...proof, expectedRevision: proofExpectedRevision, now: proofNow } };
}

function validateDirectoryCommandAuthorityReceipt(current, next, authority) {
  const proof = normalizeCommandAuthorityProof(authority);
  if (!proof.ok) return proof;
  const currentLedger = parseReceiptLedger(current, DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY);
  const nextLedger = parseReceiptLedger(next, DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY);
  const receipt = nextLedger?.entries?.[proof.key];
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const directory = parseJsonRecord(next?.values?.[DIRECTORY_STORAGE_KEY]);
  const proofSurface = String(authority?.proof?.surface || "");
  const proofCommand = authority?.proof?.command;
  const proofNow = String(authority?.proof?.now || "");
  const proofExpectedRevision = Number(authority?.proof?.expectedRevision);
  const currentRevision = Number(current?.version || 0);
  const validKinds = receipt?.surface === "nomenclature-types"
    ? new Set(["create", "update", "delete"])
    : receipt?.surface === "boards"
      ? new Set(["board-create", "board-update", "board-delete", "bom-row-add", "bom-row-update", "bom-row-delete", "bom-import"])
      : null;
  const expectedLedger = receipt && currentLedger
    ? expectedReceiptLedger(currentLedger, proof.key, receipt, {
      maxEntries: DIRECTORY_COMMAND_RECEIPTS_MAX,
      maxBytes: DIRECTORY_COMMAND_RECEIPTS_MAX_BYTES,
    })
    : null;
  const counts = receipt?.counts;
  const recoveryValid = receipt?.destructiveAction === false
    ? receipt.recoveryArtifact === null
    : receipt?.destructiveAction === true
      && receipt?.recoveryArtifact?.kind === "file-backup"
      && receipt?.recoveryArtifact?.status === "created"
      && Boolean(String(receipt?.recoveryArtifact?.artifactName || "").trim())
      && Boolean(String(receipt?.recoveryArtifact?.metadataName || "").trim());
  const expectedDestructive = proofSurface === "nomenclature-types"
    ? String(receipt?.kind || "") === "delete"
    : ["board-delete", "bom-row-delete"].includes(String(receipt?.kind || ""));
  const expectedStatusCode = (proofSurface === "nomenclature-types" && receipt?.kind === "create")
    || (proofSurface === "boards" && ["board-create", "bom-import"].includes(receipt?.kind))
    ? 201
    : 200;
  let expectedMutation = null;
  const ownerBoundary = proofSurface === "nomenclature-types" && currentDirectory && isRecord(proofCommand)
    ? validateNomenclatureTypeBoardOwnerBoundary(currentDirectory, proofCommand)
    : { ok: true };
  const expectedRequestFingerprint = isRecord(proofCommand)
    ? createHash("sha256").update(JSON.stringify(stableJsonValue({
      surface: proofSurface,
      expectedRevision: proofExpectedRevision,
      command: proofCommand,
    }))).digest("hex")
    : "";
  if (currentDirectory && isRecord(proofCommand)
    && ["nomenclature-types", "boards"].includes(proofSurface)
    && String(proofCommand.kind || "") === String(receipt?.kind || "")
    && String(proofCommand[proofSurface === "nomenclature-types" ? "itemId" : "boardId"] || "") === proof.entityId) {
    expectedMutation = proofSurface === "nomenclature-types"
      ? applyNomenclatureTypeCommand(currentDirectory, proofCommand)
      : applyBoardCommand(currentDirectory, proofCommand, { now: proofNow });
  }
  if (!currentLedger || !nextLedger || currentLedger.entries[proof.key] || !receipt || !directory
    || !validKinds?.has(String(receipt.kind || ""))
    || proofSurface !== String(receipt.surface || "")
    || !isRecord(proofCommand)
    || !proofNow || proofNow !== String(receipt.createdAt || "")
    || !Number.isSafeInteger(proofExpectedRevision) || proofExpectedRevision < 0 || proofExpectedRevision > currentRevision
    || String(receipt.entityId || "") !== proof.entityId
    || String(receipt.idempotencyKey || "") !== proof.idempotencyKey
    || !/^[a-f0-9]{64}$/u.test(String(receipt.requestFingerprint || ""))
    || receipt.requestFingerprint !== expectedRequestFingerprint
    || !/^[a-f0-9]{64}$/u.test(String(receipt.outcomeFingerprint || ""))
    || receipt.outcomeFingerprint !== directoryProjectionFingerprint(directory)
    || Number(receipt.commandRevision || 0) !== Number(next?.version || 0)
    || receipt.baseRevision !== proofExpectedRevision
    || receipt.rebased !== (proofExpectedRevision < currentRevision)
    || (receipt.kind === "bom-import" && proofExpectedRevision !== currentRevision)
    || receipt.statusCode !== expectedStatusCode
    || receipt.destructiveAction !== expectedDestructive
    || !isRecord(receipt.row) || (receipt.impact !== null && !isRecord(receipt.impact))
    || !isRecord(counts) || Object.values(counts).some((count) => !Number.isSafeInteger(count) || count < 0)
    || !validEmployeeReceiptIdentity(receipt, proof.actorId)
    || !String(receipt.createdAt || "").trim() || !recoveryValid
    || !ownerBoundary.ok
    || !expectedMutation?.ok
    || !sameJsonValue(expectedMutation.directory, directory)
    || !sameJsonValue(expectedMutation.row, receipt.row)
    || !sameJsonValue(expectedMutation.counts || {}, counts)
    || !sameJsonValue(isRecord(expectedMutation.impact) ? expectedMutation.impact : null, receipt.impact)
    || !expectedLedger || !sameJsonValue(nextLedger, expectedLedger)) {
    return authorityFailure("shared-state-authority-receipt-invalid", "Directory command receipt does not prove this exact shared-state transition");
  }
  return { ok: true, receipt, proof: { ...proof, surface: proofSurface, expectedRevision: proofExpectedRevision, now: proofNow } };
}

function validateCommandOwnerScope(current, next, {
  allowedValueKeys = [],
  updatedBy,
  event,
} = {}) {
  const allowed = new Set(allowedValueKeys);
  const otherValues = (snapshot) => Object.fromEntries(Object.entries(snapshot?.values || {})
    .filter(([key]) => !allowed.has(key)));
  const topLevel = (snapshot) => {
    const result = { ...snapshot };
    for (const key of ["version", "updatedAt", "updatedBy", "events", "values"]) delete result[key];
    return result;
  };
  const expectedEvents = [event, ...(Array.isArray(current?.events) ? current.events : [])].slice(0, 50);
  if (!sameJsonValue(otherValues(current), otherValues(next))
    || !sameJsonValue(current?.sharedUi || {}, next?.sharedUi || {})
    || !sameJsonValue(topLevel(current), topLevel(next))
    || !sameJsonValue(next?.updatedBy || null, updatedBy)
    || !sameJsonValue(next?.events || [], expectedEvents)) {
    return authorityFailure("shared-state-command-owner-delta-invalid", "Server command owner changed data outside its exact command projection");
  }
  return { ok: true };
}

function normalizeSpecifications2AuthorityCompatibilityEntry(value) {
  if (!isRecord(value)) return null;
  const stack = [{ value, depth: 0 }];
  const seen = new Set();
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_NODES
      || current.depth > SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_DEPTH) return null;
    if (typeof current.value === "string") {
      if (Buffer.byteLength(current.value, "utf8") > SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_STRING_BYTES) return null;
      continue;
    }
    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return null;
      continue;
    }
    if (!current.value || typeof current.value !== "object" || seen.has(current.value)) return null;
    seen.add(current.value);
    if (Array.isArray(current.value)) {
      if (Object.keys(current.value).length !== current.value.length) return null;
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        if (!Object.prototype.hasOwnProperty.call(current.value, index)) return null;
        stack.push({ value: current.value[index], depth: current.depth + 1 });
      }
      continue;
    }
    const prototype = Object.getPrototypeOf(current.value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const entries = Object.entries(current.value);
    if (Reflect.ownKeys(current.value).length !== entries.length) return null;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index];
      if (Buffer.byteLength(key, "utf8") > SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_STRING_BYTES
        || child === undefined || typeof child === "function" || typeof child === "symbol" || typeof child === "bigint") return null;
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > SPECIFICATIONS2_AUTHORITY_ENTRY_MAX_BYTES) return null;
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

function specifications2RecordsById(rows) {
  const result = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const id = String(row?.id || "").trim();
    if (!id || result.has(id)) return null;
    result.set(id, row);
  }
  return result;
}

function mergeSpecifications2CanonicalNomenclature(projection, canonicalProjection, entryId) {
  const canonicalRows = (canonicalProjection?.directoryState?.nomenclature || [])
    .filter((row) => String(row?.sourceSpecifications2EntryId || "") === entryId);
  const canonicalById = specifications2RecordsById(canonicalRows);
  if (!canonicalById) throw new Error("Specifications 2.0 replay produced duplicate authoritative Nomenclature ids");
  const seen = new Set();
  const nomenclature = (projection?.directoryState?.nomenclature || []).map((row) => {
    const id = String(row?.id || "");
    const canonical = canonicalById.get(id);
    if (!canonical) return row;
    seen.add(id);
    return canonical;
  });
  for (const [id, row] of canonicalById) {
    if (!seen.has(id)) nomenclature.push(row);
  }
  return {
    ...projection,
    directoryState: { ...projection.directoryState, nomenclature },
  };
}

function mergeSpecifications2CurrentOperationalFields(projection, currentPlanning) {
  const currentRoutes = specifications2RecordsById(currentPlanning?.routes);
  const currentSteps = specifications2RecordsById(currentPlanning?.routeSteps);
  if (!currentRoutes || !currentSteps) {
    throw new Error("Specifications 2.0 replay requires unique current Planning ids");
  }
  const copyFields = (candidate, current, fields) => {
    if (!current) return candidate;
    const merged = { ...candidate };
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(current, field)) merged[field] = current[field];
    }
    return merged;
  };
  return {
    ...projection,
    planningState: {
      ...projection.planningState,
      routes: (projection?.planningState?.routes || []).map((route) => copyFields(
        route,
        currentRoutes.get(String(route?.id || "")),
        SPECIFICATIONS2_PUBLISHED_ROUTE_MUTABLE_FIELDS,
      )),
      routeSteps: (projection?.planningState?.routeSteps || []).map((step) => copyFields(
        step,
        currentSteps.get(String(step?.id || "")),
        SPECIFICATIONS2_PUBLISHED_STEP_MUTABLE_FIELDS,
      )),
    },
  };
}

function replaySpecifications2AuthorityProjection(current, entry, publication, adapterVersion) {
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const currentPlanning = parsePlanningState(current?.values?.[PLANNING_STATE_KEY]);
  if (!currentDirectory || !currentPlanning) {
    throw new Error("Specifications 2.0 replay requires current Directory and Planning state");
  }
  const context = {
    planningState: currentPlanning,
    acknowledgedPublication: publication,
    now: String(publication.releasedAt || ""),
    allowTransportStrippedLegacyFingerprint: adapterVersion === 4,
  };
  let projection = publishSpecifications2Entry(entry, {
    ...context,
    directoryState: currentDirectory,
  });
  const canonicalProjection = publishSpecifications2Entry(entry, {
    ...context,
    directoryState: {
      ...currentDirectory,
      nomenclature: (currentDirectory.nomenclature || [])
        .filter((row) => String(row?.sourceSpecifications2EntryId || "") !== String(entry.id || "")),
    },
  });
  projection = mergeSpecifications2CanonicalNomenclature(projection, canonicalProjection, String(entry.id || ""));
  return mergeSpecifications2CurrentOperationalFields(projection, currentPlanning);
}

function validateSpecifications2AuthorityProof(current, next, authority) {
  const proof = authority?.proof;
  const entryId = typeof proof?.entryId === "string" ? proof.entryId.trim() : "";
  const jobId = String(proof?.jobId || "").trim();
  const aggregateId = String(proof?.aggregateId || "").trim();
  const aggregateRevision = Number(proof?.aggregateRevision || 0);
  const payloadFingerprint = String(proof?.payloadFingerprint || "");
  const relationalFingerprint = String(proof?.relationalFingerprint || "");
  const payloadDigest = String(proof?.payloadDigest || "");
  const revision = Number(proof?.revision || 0);
  const fingerprint = String(proof?.fingerprint || "").trim();
  const expectedRelationalFingerprint = `sha256:${createHash("sha256").update(fingerprint).digest("hex")}`;
  const specificationId = String(proof?.specificationId || "").trim();
  const rootRouteId = String(proof?.rootRouteId || "").trim();
  const compatibilityEntry = normalizeSpecifications2AuthorityCompatibilityEntry(proof?.compatibilityEntry);
  const compatibilityPublication = compatibilityEntry?.publication;
  const adapterVersion = specifications2ReleaseFingerprintAdapterVersion(fingerprint);
  if (!jobId || jobId.length > 200 || !aggregateId || aggregateId.length > 200 || !entryId || entryId.length > 200
    || proof?.aggregateType !== "specifications2_revision"
    || proof?.commandType !== "publish_revision"
    || !Number.isSafeInteger(revision) || revision <= 0
    || aggregateRevision !== revision
    || payloadFingerprint !== fingerprint
    || relationalFingerprint !== expectedRelationalFingerprint
    || !/^sha256:[a-f0-9]{64}$/u.test(payloadDigest)
    || !fingerprint || Buffer.byteLength(fingerprint) > SPECIFICATIONS2_PUBLICATION_FINGERPRINT_MAX_BYTES
    || !specificationId || !rootRouteId
    || proof?.payloadDigestPersisted !== true
    || !compatibilityEntry || String(compatibilityEntry.id || "") !== entryId
    || !adapterVersion
    || Number(compatibilityPublication?.revision || 0) !== revision
    || String(compatibilityPublication?.fingerprint || "") !== fingerprint
    || !String(compatibilityPublication?.releasedAt || "").trim()) {
    return authorityFailure("specifications2-authority-proof-invalid", "Specifications 2.0 outbox authority proof is incomplete");
  }
  let replay;
  try {
    if (buildSpecifications2CompatibilityPayloadDigest(compatibilityEntry) !== payloadDigest
      || buildSpecifications2RelationalReleaseFingerprint(fingerprint) !== relationalFingerprint
      || !matchesSpecifications2ReleaseFingerprint(compatibilityEntry, fingerprint, {
        // Adapter v4 is tolerated only after the complete transport-neutral
        // payload above is digest-bound. This is not a blanket projection bypass.
        allowTransportStrippedLegacyV4: adapterVersion === 4,
      })) {
      return authorityFailure("specifications2-authority-proof-invalid", "Specifications 2.0 outbox proof does not match its compatibility payload");
    }
    replay = replaySpecifications2AuthorityProjection(
      current,
      compatibilityEntry,
      compatibilityPublication,
      adapterVersion,
    );
  } catch {
    return authorityFailure("specifications2-authority-proof-invalid", "Specifications 2.0 outbox payload cannot be replayed exactly");
  }
  if (Number(replay?.publication?.revision || 0) !== revision
    || String(replay?.publication?.fingerprint || "") !== fingerprint
    || String(replay?.publication?.specificationId || "") !== specificationId
    || String(replay?.publication?.rootRouteId || "") !== rootRouteId
    || String(replay?.publication?.releasedAt || "") !== String(compatibilityPublication.releasedAt || "")) {
    return authorityFailure("specifications2-authority-proof-invalid", "Specifications 2.0 outbox proof does not match its replayed publication coordinates");
  }
  const publication = next?.specifications2PublicationAuthority?.publications?.[entryId];
  if (Number(publication?.revision || 0) !== revision
    || String(publication?.fingerprint || "") !== fingerprint
    || String(publication?.specificationId || "") !== specificationId
    || String(publication?.rootRouteId || "") !== rootRouteId
    || String(publication?.releasedAt || "") !== String(replay.publication.releasedAt || "")) {
    return authorityFailure("specifications2-authority-marker-invalid", "Specifications 2.0 authority marker does not match the outbox proof");
  }
  const directory = parseJsonRecord(next?.values?.[DIRECTORY_STORAGE_KEY]);
  const planning = parseJsonRecord(next?.values?.[PLANNING_STATE_KEY]);
  if (!directory || !planning
    || !sameJsonValue(directory, replay.directoryState)
    || !sameJsonValue(planning, replay.planningState)) {
    return authorityFailure("specifications2-authority-projection-invalid", "Specifications 2.0 compatibility projection is not the exact replayed outbox transition");
  }
  const currentRegistry = parseSpecifications2RegistryValue(current?.values?.[SPECIFICATIONS2_STORAGE_KEY]);
  const nextRegistry = parseSpecifications2RegistryValue(next?.values?.[SPECIFICATIONS2_STORAGE_KEY]);
  const currentEntry = currentRegistry?.registry?.find((entry) => String(entry?.id || "") === entryId) || null;
  const nextEntry = nextRegistry?.registry?.find((entry) => String(entry?.id || "") === entryId) || null;
  if ((currentEntry && !nextEntry)
    || (!currentEntry && nextEntry)
    || (nextEntry && !sameJsonValue(nextEntry.publication || null, replay.publication))) {
    return authorityFailure("specifications2-authority-projection-invalid", "Specifications 2.0 registry publication is not the exact replayed outbox transition");
  }
  const specification = Array.isArray(directory?.specifications)
    ? directory.specifications.find((row) => String(row?.id || "") === specificationId)
    : null;
  const route = Array.isArray(planning?.routes)
    ? planning.routes.find((row) => String(row?.id || "") === rootRouteId)
    : null;
  if (String(specification?.sourceSpecifications2EntryId || "") !== entryId
    || Number(specification?.revision || 0) !== revision
    || String(specification?.sourceSpecifications2Fingerprint || "") !== fingerprint
    || String(route?.sourceSpecifications2EntryId || "") !== entryId
    || Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0) !== revision
    || String(route?.documentRevisionSnapshot?.releaseFingerprint || "") !== fingerprint) {
    return authorityFailure("specifications2-authority-projection-invalid", "Specifications 2.0 compatibility projection does not match the outbox proof");
  }
  return { ok: true, compatibilityEntry, replay };
}

function validateSpecifications2CrossOwnerInvariants(current, next) {
  const reconciled = reconcileSpecifications2PublicationAuthority(current, next);
  if (!reconciled.ok) {
    return authorityFailure(
      "specifications2-publication-authority-conflict",
      reconciled.error || "Specifications 2.0 immutable publication conflict",
    );
  }
  return sameJsonValue(reconciled.snapshot, next)
    ? { ok: true }
    : authorityFailure(
      "specifications2-publication-command-required",
      "Published Specifications 2.0 records can only be changed by their durable outbox owner",
    );
}

function withoutObjectKey(value, key) {
  const result = isRecord(value) ? { ...value } : {};
  delete result[key];
  return result;
}

function uniqueRecordIds(rows) {
  const ids = (Array.isArray(rows) ? rows : []).map((row) => String(row?.id || "").trim());
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function registryWithoutTargetPublication(registry, entryId) {
  if (!isRecord(registry) || !Array.isArray(registry.registry)) return null;
  return {
    ...registry,
    registry: registry.registry.map((entry) => {
      if (String(entry?.id || "") !== entryId) return entry;
      const normalized = { ...entry };
      delete normalized.publication;
      delete normalized.updatedAt;
      return normalized;
    }),
  };
}

function validateSpecifications2OwnerDelta(current, next, authority) {
  const proof = authority?.proof || {};
  const entryId = String(proof.entryId || "");
  const currentRegistry = parseSpecifications2RegistryValue(current?.values?.[SPECIFICATIONS2_STORAGE_KEY]);
  const nextRegistry = parseSpecifications2RegistryValue(next?.values?.[SPECIFICATIONS2_STORAGE_KEY]);
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const nextDirectory = parseJsonRecord(next?.values?.[DIRECTORY_STORAGE_KEY]);
  const currentPlanning = parsePlanningState(current?.values?.[PLANNING_STATE_KEY]);
  const nextPlanning = parsePlanningState(next?.values?.[PLANNING_STATE_KEY]);
  if (!currentRegistry || !nextRegistry || !currentDirectory || !nextDirectory || !currentPlanning || !nextPlanning) {
    return authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 owner requires complete compatibility projections");
  }
  const currentMarker = current?.specifications2PublicationAuthority?.publications || {};
  const nextMarker = next?.specifications2PublicationAuthority?.publications || {};
  let expectedMarker = null;
  try {
    expectedMarker = buildSpecifications2PublicationAuthority(current, entryId, nextMarker[entryId]);
  } catch {
    return authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 publication authority history is invalid");
  }
  if (!sameJsonValue(expectedMarker?.publications?.[entryId], nextMarker[entryId])
    || !sameJsonValue(withoutObjectKey(currentMarker, entryId), withoutObjectKey(nextMarker, entryId))
    || !sameJsonValue(
      registryWithoutTargetPublication(currentRegistry, entryId),
      registryWithoutTargetPublication(nextRegistry, entryId),
    )) {
    return authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 publication changed another registry entry or authority marker");
  }
  const ignoredValueKeys = new Set([SPECIFICATIONS2_STORAGE_KEY, DIRECTORY_STORAGE_KEY, PLANNING_STATE_KEY]);
  const otherValues = (snapshot) => Object.fromEntries(Object.entries(snapshot?.values || {})
    .filter(([key]) => !ignoredValueKeys.has(key)));
  if (!sameJsonValue(otherValues(current), otherValues(next))) {
    return authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 publication changed an unrelated shared-state value");
  }
  const currentDirectoryRest = { ...currentDirectory };
  const nextDirectoryRest = { ...nextDirectory };
  delete currentDirectoryRest.nomenclature;
  delete currentDirectoryRest.specifications;
  delete nextDirectoryRest.nomenclature;
  delete nextDirectoryRest.specifications;
  const ownsSpecification = (row) => String(row?.sourceSpecifications2EntryId || "") === entryId
    || String(row?.id || "") === String(proof.specificationId || "");
  const ownsNomenclature = (row) => String(row?.sourceSpecifications2EntryId || "") === entryId;
  if (!uniqueRecordIds(currentDirectory.nomenclature) || !uniqueRecordIds(nextDirectory.nomenclature)
    || !uniqueRecordIds(currentDirectory.specifications) || !uniqueRecordIds(nextDirectory.specifications)
    || !sameJsonValue(currentDirectoryRest, nextDirectoryRest)
    || !sameJsonValue(
      (currentDirectory.nomenclature || []).filter((row) => !ownsNomenclature(row)),
      (nextDirectory.nomenclature || []).filter((row) => !ownsNomenclature(row)),
    )
    || !sameJsonValue(
      (currentDirectory.specifications || []).filter((row) => !ownsSpecification(row)),
      (nextDirectory.specifications || []).filter((row) => !ownsSpecification(row)),
    )) {
    return authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 publication changed an unrelated Directory record");
  }
  const currentEntry = currentRegistry.registry.find((entry) => String(entry?.id || "") === entryId);
  const routeIds = new Set([
    ...specifications2PublicationRootIds(currentMarker?.[entryId]),
    ...specifications2PublicationRootIds(nextMarker?.[entryId]),
    String(currentEntry?.publication?.rootRouteId || ""),
    String(proof.rootRouteId || ""),
  ].filter(Boolean));
  const ownsRoute = (route) => routeIds.has(String(route?.id || ""))
    || routeIds.has(String(route?.rootRouteId || ""));
  const ownsStep = (step) => routeIds.has(String(step?.routeId || ""))
    || routeIds.has(String(step?.planningOrderId || ""));
  const currentPlanningRest = { ...currentPlanning };
  const nextPlanningRest = { ...nextPlanning };
  delete currentPlanningRest.routes;
  delete currentPlanningRest.routeSteps;
  delete nextPlanningRest.routes;
  delete nextPlanningRest.routeSteps;
  if (!uniqueRecordIds(currentPlanning.routes) || !uniqueRecordIds(nextPlanning.routes)
    || !uniqueRecordIds(currentPlanning.routeSteps) || !uniqueRecordIds(nextPlanning.routeSteps)
    || !sameJsonValue(currentPlanningRest, nextPlanningRest)
    || !sameJsonValue(
      (currentPlanning.routes || []).filter((route) => !ownsRoute(route)),
      (nextPlanning.routes || []).filter((route) => !ownsRoute(route)),
    )
    || !sameJsonValue(
      (currentPlanning.routeSteps || []).filter((step) => !ownsStep(step)),
      (nextPlanning.routeSteps || []).filter((step) => !ownsStep(step)),
    )) {
    return authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 publication changed an unrelated Planning or Work Order record");
  }
  const topLevel = (snapshot) => {
    const result = { ...snapshot };
    delete result.version;
    delete result.updatedAt;
    delete result.values;
    delete result.specifications2PublicationAuthority;
    return result;
  };
  return sameJsonValue(topLevel(current), topLevel(next))
    ? { ok: true }
    : authorityFailure("specifications2-authority-delta-invalid", "Specifications 2.0 publication changed unrelated snapshot metadata");
}

function isSpecifications2ServerWorkOrderRoute(route) {
  const routeId = String(route?.id || "").trim();
  const workOrderId = String(route?.workOrderSnapshot?.id || "").trim();
  return Boolean(
    routeId
    && workOrderId
    && String(route?.workOrderSnapshot?.source || "") === "specifications2"
    && String(route?.sourceSpecifications2EntryId || "").trim(),
  );
}

function specifications2WorkOrderRouteMatches(route, workOrderId) {
  const normalizedId = String(workOrderId || "");
  return String(route?.id || "") === normalizedId
    || String(route?.workOrderSnapshot?.id || "") === normalizedId;
}

function planningWithoutOperationalCollections(planning) {
  const result = { ...(planning || {}) };
  delete result.routes;
  delete result.routeSteps;
  delete result.slots;
  return result;
}

function normalizeSpecifications2WorkOrderAuthorityProof(authority) {
  const proof = authority?.proof;
  if (!isRecord(proof)) return null;
  const kind = String(proof.kind || "");
  const workOrderId = String(proof.workOrderId || "").trim();
  const routeId = String(proof.routeId || workOrderId).trim();
  const expectedRevision = Number(proof.expectedRevision || 0);
  const targetRevision = Number(proof.targetRevision || 0);
  const stamp = String(proof.stamp || "");
  if (!["create", "quantity", "start-date", "slot-schedule"].includes(kind)
    || !workOrderId || workOrderId.length > 200
    || !routeId || routeId.length > 200
    || !Number.isInteger(expectedRevision) || expectedRevision < 0
    || !Number.isInteger(targetRevision) || targetRevision < 1
    || Number.isNaN(Date.parse(stamp))) return null;
  if (kind === "start-date") {
    const ownsPlanningStartDate = Object.prototype.hasOwnProperty.call(proof, "planningStartDate");
    const planningStartDate = proof.planningStartDate === null
      ? null
      : typeof proof.planningStartDate === "string" ? proof.planningStartDate.trim() : undefined;
    if (!ownsPlanningStartDate
      || (planningStartDate !== null && !isExactIsoCalendarDate(planningStartDate))) return null;
    return { ...proof, kind, workOrderId, routeId, expectedRevision, targetRevision, stamp, planningStartDate };
  }
  return { ...proof, kind, workOrderId, routeId, expectedRevision, targetRevision, stamp };
}

function validateSpecifications2WorkOrderOwnerScope(current, next) {
  const otherValues = (snapshot) => Object.fromEntries(Object.entries(snapshot?.values || {})
    .filter(([key]) => key !== PLANNING_STATE_KEY));
  const topLevel = (snapshot) => {
    const result = { ...snapshot };
    for (const key of ["version", "updatedAt", "values"]) delete result[key];
    return result;
  };
  return Number(next?.version || 0) === Number(current?.version || 0) + 1
    && sameJsonValue(otherValues(current), otherValues(next))
    && sameJsonValue(topLevel(current), topLevel(next));
}

function validateSpecifications2WorkOrderCreateDelta(currentPlanning, nextPlanning, proof) {
  const route = proof.route;
  const steps = Array.isArray(proof.steps) ? proof.steps : null;
  const sourceEntryId = String(proof.sourceEntryId || "").trim();
  if (!isRecord(route) || !steps?.length || steps.length > 5_000 || !sourceEntryId
    || proof.expectedRevision !== 0
    || String(route.id || "") !== proof.workOrderId
    || String(route.rootRouteId || "") !== proof.workOrderId
    || String(route.sourceSpecifications2EntryId || "") !== sourceEntryId
    || String(route.workOrderSnapshot?.id || "") !== proof.workOrderId
    || String(route.workOrderSnapshot?.source || "") !== "specifications2"
    || String(route.documentRevisionSnapshot?.source || "") !== "specifications2"
    || Number(route.domainConcurrencyRevision || 0) !== proof.targetRevision
    || String(route.createdAt || "") !== proof.stamp
    || String(route.updatedAt || "") !== proof.stamp
    || (currentPlanning.routes || []).some((candidate) => specifications2WorkOrderRouteMatches(candidate, proof.workOrderId))) {
    return false;
  }
  const stepIds = new Set();
  for (const step of steps) {
    const stepId = String(step?.id || "").trim();
    if (!stepId || stepIds.has(stepId) || String(step?.routeId || "") !== proof.workOrderId
      || (currentPlanning.routeSteps || []).some((candidate) => String(candidate?.id || "") === stepId)) return false;
    stepIds.add(stepId);
  }
  return sameJsonValue(planningWithoutOperationalCollections(currentPlanning), planningWithoutOperationalCollections(nextPlanning))
    && sameJsonValue(nextPlanning.routes || [], [...(currentPlanning.routes || []), route])
    && sameJsonValue(nextPlanning.routeSteps || [], [...(currentPlanning.routeSteps || []), ...steps])
    && sameJsonValue(nextPlanning.slots || [], currentPlanning.slots || []);
}

function findExactSpecifications2WorkOrderRoute(planning, proof) {
  const matches = (planning.routes || []).filter((route) => (
    String(route?.id || "") === proof.routeId
    && specifications2WorkOrderRouteMatches(route, proof.workOrderId)
  ));
  return matches.length === 1 && isSpecifications2ServerWorkOrderRoute(matches[0]) ? matches[0] : null;
}

function validateSpecifications2WorkOrderQuantityDelta(currentPlanning, nextPlanning, proof) {
  const currentRoute = findExactSpecifications2WorkOrderRoute(currentPlanning, proof);
  const quantity = Number(proof.quantity);
  const slotUpdates = Array.isArray(proof.slotUpdates) ? proof.slotUpdates : null;
  if (!currentRoute || !Number.isFinite(quantity) || quantity <= 0 || !slotUpdates || slotUpdates.length > 5_000
    || proof.targetRevision !== proof.expectedRevision + 1
    || Number(currentRoute.domainConcurrencyRevision || currentRoute.documentRevisionSnapshot?.routeRevision || currentRoute.revision || 1) !== proof.expectedRevision) {
    return false;
  }
  const updatesById = new Map();
  for (const update of slotUpdates) {
    const slotId = String(update?.id || "").trim();
    const currentSlot = (currentPlanning.slots || []).find((slot) => String(slot?.id || "") === slotId);
    if (!slotId || updatesById.has(slotId) || !currentSlot
      || (String(currentSlot.routeId || "") !== proof.routeId && String(currentSlot.planningOrderId || "") !== proof.routeId)
      || !Number.isFinite(Number(update.quantity))
      || Number.isNaN(Date.parse(String(update.plannedStart || currentSlot.plannedStart || "")))
      || Number.isNaN(Date.parse(String(update.plannedEnd || currentSlot.plannedEnd || "")))) return false;
    updatesById.set(slotId, update);
  }
  const expectedRoutes = (currentPlanning.routes || []).map((route) => String(route?.id || "") === proof.routeId
    ? {
      ...route,
      planningQuantity: quantity,
      domainConcurrencyRevision: proof.targetRevision,
      updatedAt: proof.stamp,
      workOrderSnapshot: { ...route.workOrderSnapshot, quantity },
    }
    : route);
  const expectedSlots = (currentPlanning.slots || []).map((slot) => {
    const update = updatesById.get(String(slot?.id || ""));
    return update
      ? {
        ...slot,
        quantity: Number(update.quantity),
        plannedStart: String(update.plannedStart || slot.plannedStart || ""),
        plannedEnd: String(update.plannedEnd || slot.plannedEnd || ""),
        updatedAt: proof.stamp,
      }
      : slot;
  });
  return sameJsonValue(planningWithoutOperationalCollections(currentPlanning), planningWithoutOperationalCollections(nextPlanning))
    && sameJsonValue(nextPlanning.routes || [], expectedRoutes)
    && sameJsonValue(nextPlanning.routeSteps || [], currentPlanning.routeSteps || [])
    && sameJsonValue(nextPlanning.slots || [], expectedSlots);
}

function validateSpecifications2WorkOrderSlotDelta(currentPlanning, nextPlanning, proof) {
  const currentRoute = findExactSpecifications2WorkOrderRoute(currentPlanning, proof);
  const slotId = String(proof.slotId || "").trim();
  const currentSlot = (currentPlanning.slots || []).find((slot) => String(slot?.id || "") === slotId);
  const plannedStart = String(proof.plannedStart || "");
  const plannedEnd = String(proof.plannedEnd || "");
  if (!currentRoute || !slotId || !currentSlot
    || proof.targetRevision !== proof.expectedRevision + 1
    || Number(currentRoute.domainConcurrencyRevision || currentRoute.documentRevisionSnapshot?.routeRevision || currentRoute.revision || 1) !== proof.expectedRevision
    || (String(currentSlot.routeId || "") !== proof.routeId && String(currentSlot.planningOrderId || "") !== proof.routeId)
    || Number.isNaN(Date.parse(plannedStart)) || Number.isNaN(Date.parse(plannedEnd))
    || Date.parse(plannedEnd) < Date.parse(plannedStart)) return false;
  const expectedRoutes = (currentPlanning.routes || []).map((route) => String(route?.id || "") === proof.routeId
    ? { ...route, domainConcurrencyRevision: proof.targetRevision, updatedAt: proof.stamp }
    : route);
  const expectedSlots = (currentPlanning.slots || []).map((slot) => String(slot?.id || "") === slotId
    ? { ...slot, plannedStart, plannedEnd, updatedAt: proof.stamp }
    : slot);
  return sameJsonValue(planningWithoutOperationalCollections(currentPlanning), planningWithoutOperationalCollections(nextPlanning))
    && sameJsonValue(nextPlanning.routes || [], expectedRoutes)
    && sameJsonValue(nextPlanning.routeSteps || [], currentPlanning.routeSteps || [])
    && sameJsonValue(nextPlanning.slots || [], expectedSlots);
}

function validateSpecifications2WorkOrderStartDateDelta(currentPlanning, nextPlanning, proof) {
  const currentRoute = findExactSpecifications2WorkOrderRoute(currentPlanning, proof);
  const planningStartDate = proof.planningStartDate;
  if (!currentRoute
    || (planningStartDate !== null && !isExactIsoCalendarDate(planningStartDate))
    || proof.targetRevision !== proof.expectedRevision + 1
    || Number(currentRoute.domainConcurrencyRevision || currentRoute.documentRevisionSnapshot?.routeRevision || currentRoute.revision || 1) !== proof.expectedRevision) {
    return false;
  }
  const expectedRoutes = (currentPlanning.routes || []).map((route) => {
    if (String(route?.id || "") !== proof.routeId) return route;
    const next = {
      ...route,
      domainConcurrencyRevision: proof.targetRevision,
      updatedAt: proof.stamp,
    };
    if (planningStartDate === null) delete next.planningStartDate;
    else next.planningStartDate = planningStartDate;
    return next;
  });
  return sameJsonValue(planningWithoutOperationalCollections(currentPlanning), planningWithoutOperationalCollections(nextPlanning))
    && sameJsonValue(nextPlanning.routes || [], expectedRoutes)
    && sameJsonValue(nextPlanning.routeSteps || [], currentPlanning.routeSteps || [])
    && sameJsonValue(nextPlanning.slots || [], currentPlanning.slots || []);
}

function validateSpecifications2WorkOrderAuthority(current, next, authority) {
  const proof = normalizeSpecifications2WorkOrderAuthorityProof(authority);
  const currentPlanning = parsePlanningState(current?.values?.[PLANNING_STATE_KEY]);
  const nextPlanning = parsePlanningState(next?.values?.[PLANNING_STATE_KEY]);
  if (!proof || !currentPlanning || !nextPlanning || !validateSpecifications2WorkOrderOwnerScope(current, next)) {
    return authorityFailure("specifications2-work-order-authority-invalid", "Specifications 2.0 Work Order authority proof or snapshot scope is invalid");
  }
  const valid = proof.kind === "create"
    ? validateSpecifications2WorkOrderCreateDelta(currentPlanning, nextPlanning, proof)
    : proof.kind === "quantity"
      ? validateSpecifications2WorkOrderQuantityDelta(currentPlanning, nextPlanning, proof)
      : proof.kind === "start-date"
        ? validateSpecifications2WorkOrderStartDateDelta(currentPlanning, nextPlanning, proof)
        : validateSpecifications2WorkOrderSlotDelta(currentPlanning, nextPlanning, proof);
  return valid
    ? { ok: true }
    : authorityFailure("specifications2-work-order-delta-invalid", "Specifications 2.0 Work Order owner changed data outside its exact server projection");
}

export function validateSharedStateAuthorityTransition(current, next, env = process.env, authority = null) {
  const authorityEnv = resolveSharedStateAuthorityEnvironment(env);
  const owner = authority?.owner || "";
  if (owner && !SHARED_STATE_AUTHORITY_OWNERS.has(owner)) {
    return authorityFailure("shared-state-authority-owner-invalid", "Unknown shared-state authority owner");
  }
  if (owner !== "nomenclature-command"
    && !sameSnapshotValue(current, next, NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY)) {
    return authorityFailure("nomenclature-command-receipts-protected", "Nomenclature command receipts are server-owned");
  }
  if (owner !== "directory-cluster-command"
    && !sameSnapshotValue(current, next, DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY)) {
    return authorityFailure("directory-cluster-command-receipts-protected", "Directory cluster command receipts are server-owned");
  }
  if (owner !== "specifications2-publication"
    && !sameJsonValue(current?.specifications2PublicationAuthority || null, next?.specifications2PublicationAuthority || null)) {
    return authorityFailure("specifications2-publication-authority-protected", "Specifications 2.0 publication authority is server-owned");
  }
  if (owner === "nomenclature-command") {
    if (authorityEnv.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS !== "1") {
      return authorityFailure("nomenclature-command-owner-disabled", "Nomenclature server command ownership is not active", { statusCode: 503 });
    }
    const receipt = validateNomenclatureCommandAuthorityReceipt(current, next, authority, authorityEnv);
    if (!receipt.ok) return receipt;
    const scope = validateCommandOwnerScope(current, next, {
      allowedValueKeys: [DIRECTORY_STORAGE_KEY, NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY],
      updatedBy: {
        actor: receipt.proof.actorId,
        employeeId: String(receipt.receipt.employeeId || ""),
        displayName: String(authority?.proof?.displayName || ""),
      },
      event: {
        action: `nomenclature-command:${receipt.receipt.kind}`,
        actor: receipt.proof.actorId,
        employeeId: String(receipt.receipt.employeeId || ""),
        itemId: receipt.proof.entityId,
        authorizationRevision: receipt.receipt.authorizationRevision ?? null,
        authorizationDecision: receipt.receipt.authorizationDecision ?? null,
        createdAt: receipt.proof.now,
        version: Number(next?.version || 0),
      },
    });
    if (!scope.ok) return scope;
    const crossOwner = validateSpecifications2CrossOwnerInvariants(current, next);
    return crossOwner.ok ? { ok: true, snapshot: next } : crossOwner;
  }
  if (owner === "directory-cluster-command") {
    if (authorityEnv.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS !== "1") {
      return authorityFailure("directory-cluster-command-owner-disabled", "Directory cluster server command ownership is not active", { statusCode: 503 });
    }
    const receipt = validateDirectoryCommandAuthorityReceipt(current, next, authority);
    if (!receipt.ok) return receipt;
    const scope = validateCommandOwnerScope(current, next, {
      allowedValueKeys: [DIRECTORY_STORAGE_KEY, DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY],
      updatedBy: {
        actor: receipt.proof.actorId,
        employeeId: String(receipt.receipt.employeeId || ""),
        displayName: String(authority?.proof?.displayName || ""),
      },
      event: {
        action: `directory-cluster-command:${receipt.proof.surface}:${receipt.receipt.kind}`,
        actor: receipt.proof.actorId,
        employeeId: String(receipt.receipt.employeeId || ""),
        entityId: receipt.proof.entityId,
        authorizationRevision: receipt.receipt.authorizationRevision ?? null,
        authorizationDecision: receipt.receipt.authorizationDecision ?? null,
        createdAt: receipt.proof.now,
        version: Number(next?.version || 0),
      },
    });
    if (!scope.ok) return scope;
    const crossOwner = validateSpecifications2CrossOwnerInvariants(current, next);
    return crossOwner.ok ? { ok: true, snapshot: next } : crossOwner;
  }
  if (owner === "specifications2-publication") {
    const proof = validateSpecifications2AuthorityProof(current, next, authority);
    if (!proof.ok) return proof;
    const delta = validateSpecifications2OwnerDelta(current, next, authority);
    return delta.ok ? { ok: true, snapshot: next } : delta;
  }
  if (owner === "specifications2-work-order") {
    if (authorityEnv.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS !== "1") {
      return authorityFailure("specifications2-work-order-owner-disabled", "Specifications 2.0 Work Order command ownership is not active", { statusCode: 503 });
    }
    const workOrder = validateSpecifications2WorkOrderAuthority(current, next, authority);
    return workOrder.ok ? { ok: true, snapshot: next } : workOrder;
  }
  const nomenclatureAuthority = validateNomenclatureServerAuthorityWrite(current, next, authorityEnv);
  if (!nomenclatureAuthority.ok) {
    return {
      ...authorityFailure(nomenclatureAuthority.code || "nomenclature-command-required", nomenclatureAuthority.error || "Nomenclature server authority rejected this transition"),
      ...(nomenclatureAuthority.danglingReferences
        ? { danglingReferences: nomenclatureAuthority.danglingReferences }
        : {}),
    };
  }
  const directoryClusterAuthority = validateDirectoryClusterServerAuthorityWrite(current, next, authorityEnv);
  if (!directoryClusterAuthority.ok) {
    return authorityFailure(
      directoryClusterAuthority.code || "directory-cluster-command-required",
      directoryClusterAuthority.error || "Directory cluster server authority rejected this transition",
    );
  }
  const specifications2Authority = reconcileSpecifications2PublicationAuthority(current, next);
  if (!specifications2Authority.ok) {
    return authorityFailure("specifications2-publication-authority-conflict", specifications2Authority.error || "Specifications 2.0 publication authority conflict");
  }
  if (authorityEnv.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS !== "1") {
    return { ok: true, snapshot: specifications2Authority.snapshot };
  }
  const workOrderAuthority = preserveSpecifications2ServerWorkOrderProjection(current, specifications2Authority.snapshot);
  return workOrderAuthority.ok
    ? { ok: true, snapshot: workOrderAuthority.snapshot }
    : authorityFailure("specifications2-work-order-authority-conflict", workOrderAuthority.error || "Specifications 2.0 Work Order authority conflict");
}

function hasRetiredSystemDomainsSnapshot(values) {
  return Boolean(values)
    && Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY)
    && values[SYSTEM_DOMAINS_STORAGE_KEY] === null;
}

function attemptsToRestoreRetiredSystemDomains(values) {
  return Boolean(values)
    && Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY)
    && values[SYSTEM_DOMAINS_STORAGE_KEY] !== null;
}

function attemptsToRetireSystemDomains(values) {
  return Boolean(values)
    && Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY)
    && values[SYSTEM_DOMAINS_STORAGE_KEY] === null;
}

// The PostgreSQL-primary cutover leaves a narrow, durable tombstone in the
// compatibility snapshot. A stale browser can still know the old full
// payload, so the tombstone must be enforced at every server-side write
// boundary rather than relying on the client to notice it first.
function preserveRetiredSystemDomainsTombstone(current, next) {
  if (!hasRetiredSystemDomainsSnapshot(current?.values)) return next;
  const nextValues = next?.values && typeof next.values === "object" && !Array.isArray(next.values)
    ? next.values
    : current.values || {};
  if (nextValues[SYSTEM_DOMAINS_STORAGE_KEY] === null
    && Object.prototype.hasOwnProperty.call(nextValues, SYSTEM_DOMAINS_STORAGE_KEY)) return next;
  return {
    ...next,
    values: {
      ...nextValues,
      [SYSTEM_DOMAINS_STORAGE_KEY]: null,
    },
  };
}

function isAllowedSharedUiValue(key, value) {
  if (!ALLOWED_SHARED_UI_KEYS.has(key) || !value || typeof value !== "object") return false;
  if (key === "accessRoleProfiles") return Array.isArray(value);
  return !Array.isArray(value);
}

function sanitizeSharedUi(sharedUi, currentSharedUi = {}) {
  if (!sharedUi || typeof sharedUi !== "object" || Array.isArray(sharedUi)) {
    sharedUi = {};
  }
  // A server-owned domain can explicitly retire its compatibility projection.
  // Missing fields are still preserved for older clients, while an allowed
  // null is a narrow tombstone for just that field.
  const deletedKeys = new Set(
    Object.entries(sharedUi)
      .filter(([key, value]) => ALLOWED_SHARED_UI_KEYS.has(key) && value === null)
      .map(([key]) => key),
  );
  const entries = Object.entries(sharedUi)
    .filter(([key, value]) => isAllowedSharedUiValue(key, value));
  const sanitized = Object.fromEntries(entries);
  ALLOWED_SHARED_UI_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sanitized, key) || deletedKeys.has(key)) return;
    const currentValue = currentSharedUi?.[key];
    if (isAllowedSharedUiValue(key, currentValue)) sanitized[key] = currentValue;
  });
  return sanitized;
}

// New compact UI writes carry an entry-level patch for map-valued fields.
// This is intentionally separate from the legacy `sharedUi` object: older
// clients keep replacement semantics, while separate tab edits to two
// slot/cell entries no longer erase each other during a conflict retry.
function mergeSharedUiPatch(currentSharedUi, patch) {
  if (!isRecord(patch)) return null;
  const maps = patch.maps === undefined ? {} : patch.maps;
  const profiles = patch.profiles === undefined ? null : patch.profiles;
  const replace = patch.replace === undefined ? {} : patch.replace;
  if (!isRecord(maps) || !isRecord(replace) || (profiles !== null && !isRecord(profiles))) return null;
  const merged = sanitizeSharedUi(currentSharedUi, {});

  for (const [key, value] of Object.entries(replace)) {
    if (!ALLOWED_SHARED_UI_KEYS.has(key)) return null;
    if (value === null) {
      merged[key] = null;
      continue;
    }
    if (!isAllowedSharedUiValue(key, value)) return null;
    merged[key] = value;
  }

  for (const [key, change] of Object.entries(maps)) {
    if (!SHARED_UI_MAP_KEYS.has(key) || !isRecord(change)) return null;
    const set = change.set === undefined ? {} : change.set;
    const remove = change.remove === undefined ? [] : change.remove;
    if (!isRecord(set) || !Array.isArray(remove) || remove.some((entryKey) => typeof entryKey !== "string")) return null;
    const nextMap = isRecord(merged[key]) ? { ...merged[key] } : {};
    remove.forEach((entryKey) => { delete nextMap[entryKey]; });
    Object.entries(set).forEach(([entryKey, value]) => { nextMap[entryKey] = value; });
    merged[key] = nextMap;
  }

  if (profiles) {
    const set = profiles.set === undefined ? {} : profiles.set;
    const remove = profiles.remove === undefined ? [] : profiles.remove;
    if (!isRecord(set) || !Array.isArray(remove) || remove.some((profileId) => typeof profileId !== "string")) return null;
    const nextProfiles = Array.isArray(merged.accessRoleProfiles)
      ? merged.accessRoleProfiles.filter((profile) => !remove.includes(String(profile?.id || "")))
      : [];
    const indexes = new Map(nextProfiles.map((profile, index) => [String(profile?.id || ""), index]).filter(([profileId]) => profileId));
    for (const [profileId, profile] of Object.entries(set)) {
      if (!isRecord(profile) || String(profile.id || "") !== profileId) return null;
      const index = indexes.get(profileId);
      if (index === undefined) {
        indexes.set(profileId, nextProfiles.length);
        nextProfiles.push(profile);
      } else nextProfiles[index] = profile;
    }
    merged.accessRoleProfiles = nextProfiles;
  }
  return merged;
}

function createEmptySnapshot() {
  return {
    version: 0,
    updatedAt: "",
    updatedBy: null,
    values: null,
    sharedUi: {},
    events: [],
    systemDomainsRetirement: null,
    shiftExecutionRetirement: null,
    specifications2PublicationAuthority: null,
  };
}

function cloneSharedStateSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRequestedValueKeys(headers = {}) {
  const raw = String(headers?.["x-mes-shared-state-keys"] || "").trim();
  if (!raw) return null;
  // A server-authoritative planning bootstrap still needs the shared revision
  // and UI metadata, but must not pull the legacy planning payload merely to
  // learn that revision.
  if (raw === "__none__") return [];
  const keys = [...new Set(raw.split(",").map((key) => key.trim()).filter((key) => ALLOWED_VALUE_KEYS.has(key)))];
  return keys.length ? keys : null;
}

function requestsSystemDomainsCompatibilityStatus(headers = {}) {
  return String(headers?.[SYSTEM_DOMAINS_COMPATIBILITY_HEADER] || "").trim().toLowerCase() === "status";
}

function getSystemDomainsCompatibilityStatus(snapshot) {
  const values = snapshot?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)
    || !Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY)) {
    return { state: "absent" };
  }
  return { state: values[SYSTEM_DOMAINS_STORAGE_KEY] === null ? "retired" : "active" };
}

function attachSystemDomainsCompatibilityStatus(payload, snapshot) {
  const compatibility = getSystemDomainsCompatibilityStatus(snapshot);
  const response = { ...payload, systemDomainsCompatibility: compatibility };
  // A retirement tombstone is authority, not ordinary payload. Include its
  // tiny null value even on metadata/unchanged responses so a browser that
  // missed the cutover cannot retain or resend a stale local matrix.
  if (compatibility.state === "retired") {
    response.values = {
      ...(response.values && typeof response.values === "object" ? response.values : {}),
      [SYSTEM_DOMAINS_STORAGE_KEY]: null,
    };
  }
  return response;
}

function projectSnapshotValues(snapshot, requestedValueKeys = null) {
  if (!requestedValueKeys || !snapshot?.values) return snapshot;
  const allowed = new Set(requestedValueKeys);
  return {
    ...snapshot,
    values: Object.fromEntries(Object.entries(snapshot.values).filter(([key]) => allowed.has(key))),
  };
}

function createFileStore(filePath) {
  return {
    kind: "file",
    filePath,
    configured: Boolean(filePath),
    async read() {
      if (!filePath) return createEmptySnapshot();
      return readFileSnapshot(filePath);
    },
    async write(snapshot) {
      if (!filePath) throw new Error("Shared state file path is not configured");
      await writeFileSnapshot(filePath, snapshot);
    },
  };
}

function createKvStore(config) {
  return {
    kind: "kv",
    configured: Boolean(config),
    async read() {
      if (!config) return createEmptySnapshot();
      const raw = await runKvCommand(config, ["GET", config.key]);
      return parseSnapshot(raw) || createEmptySnapshot();
    },
    async write(snapshot) {
      if (!config) throw new Error("KV shared state is not configured");
      // Every known KV caller has a version from its preceding read. Refuse a
      // future raw SET here rather than reintroducing a lost-update path.
      void snapshot;
      throw new Error("KV shared-state writes require compareAndSet");
    },
    async compareAndSet(expectedVersion, snapshot) {
      if (!config) throw new Error("KV shared state is not configured");
      const result = await runKvCommand(config, [
        "EVAL",
        KV_VERSIONED_COMPARE_AND_SET_SCRIPT,
        "1",
        config.key,
        String(Number(expectedVersion) || 0),
        JSON.stringify(snapshot),
      ]);
      return normalizeKvCompareAndSetResult(result);
    },
  };
}

function createStore({ env = process.env, filePath } = {}) {
  const kvConfig = getKvConfig(env);
  if (kvConfig) return createKvStore(kvConfig);
  return createFileStore(filePath);
}

// Transitional read port for domain APIs. New endpoints must consume this
// port instead of knowing whether the pilot currently uses a file or KV
// snapshot. A PostgreSQL repository can replace this implementation later
// without changing the HTTP contracts.
export async function readSharedStateSnapshot({ env = process.env, filePath = "" } = {}) {
  const store = createStore({ env, filePath });
  return {
    configured: store.configured,
    kind: store.kind,
    snapshot: cloneSharedStateSnapshot(await store.read()),
  };
}

async function updateSharedStateSnapshotCore({
  env = process.env,
  filePath = "",
  expectedVersion = null,
  update,
  beforeWrite = null,
  authority = null,
  planningObservationSource = "shared-state-domain-update",
  allowSystemDomainsCompatibilitySnapshotRetirement = false,
  allowShiftExecutionCompatibilitySnapshotRetirement = false,
  allowShiftExecutionCompatibilitySnapshotRestore = false,
  fileLockHeld = false,
} = {}) {
  const store = createStore({ env, filePath });
  if (!store.configured) return { ok: false, configured: false, snapshot: createEmptySnapshot() };
  const applyUpdate = async () => {
    // A file read may come from the process cache. Never expose that object,
    // or the authority baseline itself, to a caller-controlled update hook.
    const current = cloneSharedStateSnapshot(await store.read());
    if (expectedVersion !== null && Number(expectedVersion) !== Number(current.version || 0)) {
      return { ok: false, configured: true, conflict: true, snapshot: current };
    }
    const updateResult = typeof update === "function"
      ? await update(cloneSharedStateSnapshot(current))
      : null;
    if (!updateResult || typeof updateResult !== "object") throw new Error("Shared-state domain update must return a snapshot");
    // The hook may retain the returned reference. Detach it immediately so a
    // later microtask cannot mutate either validation input.
    const rawNext = cloneSharedStateSnapshot(updateResult);
    if (!hasRetiredSystemDomainsSnapshot(current.values)
      && attemptsToRetireSystemDomains(rawNext.values)
      && allowSystemDomainsCompatibilitySnapshotRetirement !== true) {
      return {
        ok: false,
        configured: true,
        forbidden: true,
        error: "System Domains compatibility snapshot retirement requires the root-controlled PostgreSQL-primary cutover",
        snapshot: current,
      };
    }
    const currentShiftRetirement = normalizeShiftExecutionRetirement(current.shiftExecutionRetirement);
    const requestedShiftRetirement = normalizeShiftExecutionRetirement(rawNext.shiftExecutionRetirement);
    if (!currentShiftRetirement && requestedShiftRetirement
      && allowShiftExecutionCompatibilitySnapshotRetirement !== true) {
      return {
        ok: false,
        configured: true,
        forbidden: true,
        error: "Shift Execution compatibility snapshot retirement requires the controlled PostgreSQL-primary cutover",
        snapshot: current,
      };
    }
    const explicitlyRestoresShiftExecution = currentShiftRetirement
      && Object.prototype.hasOwnProperty.call(rawNext, "shiftExecutionRetirement")
      && rawNext.shiftExecutionRetirement === null
      && allowShiftExecutionCompatibilitySnapshotRestore === true;
    const shiftExecutionRetirement = explicitlyRestoresShiftExecution
      ? null
      : currentShiftRetirement || requestedShiftRetirement;
    const next = preserveRetiredSystemDomainsTombstone(current, rawNext);
    const transitionVersion = Number(current.version || 0) + 1;
    const transitionUpdatedAt = new Date().toISOString();
    let snapshot = {
      ...current,
      ...next,
      sharedUi: retireShiftExecutionSharedUi(next.sharedUi, shiftExecutionRetirement),
      shiftExecutionRetirement,
      version: transitionVersion,
      updatedAt: transitionUpdatedAt,
    };
    const systemDomainsRetirement = snapshot.systemDomainsRetirement;
    // A destructive owner may attach recovery metadata after its backup is
    // created. Give that hook an isolated candidate, then normalize and run
    // every authority/Planning invariant against the final bytes. Nothing may
    // mutate the candidate after those checks and before CAS.
    snapshot = structuredClone(snapshot);
    if (typeof beforeWrite === "function") {
      // Recovery hooks need storage identity for backup creation, never the
      // persistence capability itself. Exposing `write`/`compareAndSet` here
      // would let a hook bypass the authority transition and CAS below.
      const storeContext = Object.freeze({
        configured: Boolean(store.configured),
        kind: String(store.kind || ""),
        filePath: String(store.filePath || filePath || ""),
      });
      await beforeWrite({ current: structuredClone(current), snapshot, store: storeContext });
    }
    if (!hasRetiredSystemDomainsSnapshot(current.values)
      && attemptsToRetireSystemDomains(snapshot.values)
      && allowSystemDomainsCompatibilitySnapshotRetirement !== true) {
      return {
        ok: false,
        configured: true,
        forbidden: true,
        error: "System Domains compatibility snapshot retirement requires the root-controlled PostgreSQL-primary cutover",
        snapshot: current,
      };
    }
    const finalized = preserveRetiredSystemDomainsTombstone(current, snapshot);
    snapshot = {
      ...current,
      ...finalized,
      systemDomainsRetirement,
      sharedUi: retireShiftExecutionSharedUi(finalized.sharedUi, shiftExecutionRetirement),
      shiftExecutionRetirement,
      version: transitionVersion,
      updatedAt: transitionUpdatedAt,
    };
    const authorityTransition = validateSharedStateAuthorityTransition(current, snapshot, env, authority);
    if (!authorityTransition.ok) {
      return {
        ...authorityTransition,
        configured: true,
        snapshot: current,
      };
    }
    // `beforeWrite` is allowed to attach recovery metadata, so it necessarily
    // receives a mutable candidate. Do not let a retained callback reference
    // mutate the object observed or persisted after authority validation.
    // JSON round-tripping also guarantees that the CAS candidate is exactly the
    // serializable value whose invariants were checked above.
    snapshot = JSON.parse(JSON.stringify(authorityTransition.snapshot));
    const planningObservation = await beginPlanningSnapshotObservation({
      env,
      current,
      next: snapshot,
      source: planningObservationSource,
    });
    if (!planningObservation.ok) {
      return {
        ok: false,
        configured: true,
        retryable: true,
        error: planningObservation.error || "Planning snapshot observation is unavailable",
        snapshot: current,
      };
    }
    if (store.kind === "kv") {
      let persisted;
      try {
        persisted = await store.compareAndSet(Number(current.version || 0), snapshot);
      } catch (error) {
        return {
          ok: false,
          configured: true,
          retryable: true,
          error: error?.message || "KV shared-state compare-and-set failed",
          snapshot: current,
        };
      }
      if (!persisted?.ok) {
        return {
          ok: false,
          configured: true,
          conflict: persisted?.conflict === true,
          retryable: persisted?.conflict !== true,
          error: persisted?.error || (persisted?.conflict ? "Shared-state version changed concurrently" : "KV shared-state write was not confirmed"),
          snapshot: cloneSharedStateSnapshot(await store.read()),
        };
      }
    } else {
      await store.write(snapshot);
    }
    const planningObservationResult = await recordPlanningSnapshotObservation({
      observation: planningObservation,
      snapshot,
      source: planningObservationSource,
    });
    return { ok: true, configured: true, snapshot, planningObservation: planningObservationResult };
  };
  return store.kind === "file" && fileLockHeld !== true
    ? withSharedStateFileLock(store.filePath, applyUpdate)
    : applyUpdate();
}

export function updateSharedStateSnapshot(options = {}) {
  return updateSharedStateSnapshotCore({ ...options, authority: null });
}

export function updateNomenclatureCommandSharedStateSnapshot({ authorityProof, ...options } = {}) {
  return updateSharedStateSnapshotCore({
    ...options,
    authority: { owner: "nomenclature-command", proof: authorityProof },
  });
}

export function updateDirectoryClusterCommandSharedStateSnapshot({ authorityProof, ...options } = {}) {
  return updateSharedStateSnapshotCore({
    ...options,
    authority: { owner: "directory-cluster-command", proof: authorityProof },
  });
}

export function updateSpecifications2PublicationSharedStateSnapshot({ authorityProof, ...options } = {}) {
  return updateSharedStateSnapshotCore({
    ...options,
    authority: { owner: "specifications2-publication", proof: authorityProof },
  });
}

export function updateSpecifications2WorkOrderSharedStateSnapshot({ authorityProof, ...options } = {}) {
  return updateSharedStateSnapshotCore({
    ...options,
    authority: { owner: "specifications2-work-order", proof: authorityProof },
  });
}

function normalizeActor(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

function normalizeAction(value) {
  if (typeof value !== "string") return "snapshot";
  return value.trim().slice(0, 80) || "snapshot";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Shared-UI changes and reviewed narrow directory writes are independent from
// the large planning/specification compatibility values. New clients can opt
// into a tiny acknowledgement; old clients and every other domain mutation
// retain the established full-snapshot response.
function isCompactSharedUiAcknowledgementRequest(payload, action) {
  if (payload?.responseMode !== "ack") return false;
  if (![
    "shared-ui",
    "local-shared-ui",
    "shared-ui:conflict-retry",
    "local-shared-ui:conflict-retry",
  ].includes(action)) return false;
  const values = payload?.values;
  return Boolean(values && isRecord(values) && Object.keys(values).length === 0 && isRecord(payload?.sharedUiPatch));
}

function isCompactDirectoryAcknowledgementRequest(payload) {
  if (payload?.responseMode !== "ack" || !isRecord(payload?.values)) return false;
  const keys = Object.keys(payload.values);
  return keys.includes(DIRECTORY_STORAGE_KEY)
    && keys.every((key) => DIRECTORY_VALUE_KEYS.has(key))
    && isRecord(payload.sharedUiPatch);
}

function parsePlanningState(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const state = JSON.parse(value);
    return state && typeof state === "object" ? state : null;
  } catch {
    return null;
  }
}

function hasMeaningfulPlanningState(value) {
  const state = parsePlanningState(value);
  return Boolean(state?.routes?.length || state?.routeSteps?.length || state?.slots?.length);
}

function getMaxSpecifications2PlanningRevision(value) {
  const state = parsePlanningState(value);
  if (!state) return 0;
  return (state.routes || []).reduce((maxRevision, route) => {
    if (!route?.sourceSpecifications2EntryId) return maxRevision;
    return Math.max(
      maxRevision,
      Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0),
    );
  }, 0);
}

function parseSpecifications2RegistryValue(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.registry)) return null;
    const entryIds = new Set();
    for (const entry of parsed.registry) {
      const entryId = String(entry?.id || "").trim();
      if (!isRecord(entry) || !entryId || entryIds.has(entryId)) return null;
      entryIds.add(entryId);
    }
    return parsed;
  } catch {
    return null;
  }
}

function specifications2PublicationMatchesAuthority(publication, authority) {
  return Number(publication?.revision || 0) === Number(authority?.revision || 0)
    && String(publication?.fingerprint || "") === String(authority?.fingerprint || "");
}

function parseJsonRecord(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const SPECIFICATIONS2_PUBLISHED_ROUTE_MUTABLE_FIELDS = new Set([
  "planningQuantity",
  "planningStatus",
  "workOrderSnapshot",
  "domainConcurrencyRevision",
  "updatedAt",
]);
const SPECIFICATIONS2_PUBLISHED_STEP_MUTABLE_FIELDS = new Set([
  "planningWorkCenterId",
  "resourceId",
  "updatedAt",
]);

function mergePublishedOperationalFields(current, next, mutableFields) {
  const merged = { ...current };
  for (const field of mutableFields) {
    if (Object.prototype.hasOwnProperty.call(next || {}, field)) merged[field] = next[field];
  }
  return merged;
}

function mergeProtectedRecords({ currentItems, nextItems, ownsCurrent, claimsOwnership, mergeRecord = (current) => current, subject }) {
  const currentProtected = (Array.isArray(currentItems) ? currentItems : []).filter(ownsCurrent);
  const protectedById = new Map();
  for (const item of currentProtected) {
    const id = String(item?.id || "").trim();
    if (!id || protectedById.has(id)) {
      return { ok: false, conflict: true, error: `${subject} contains an invalid or duplicate authoritative id` };
    }
    protectedById.set(id, item);
  }
  const seenProtected = new Set();
  const merged = [];
  for (const item of (Array.isArray(nextItems) ? nextItems : [])) {
    const id = String(item?.id || "").trim();
    const currentProtectedItem = protectedById.get(id);
    if (currentProtectedItem) {
      if (seenProtected.has(id)) {
        return { ok: false, conflict: true, error: `${subject} attempted to duplicate an authoritative id` };
      }
      seenProtected.add(id);
      merged.push(mergeRecord(currentProtectedItem, item));
      continue;
    }
    if (claimsOwnership(item)) {
      return { ok: false, conflict: true, error: `${subject} attempted to forge an authoritative record` };
    }
    merged.push(item);
  }
  for (const item of currentProtected) {
    const id = String(item?.id || "").trim();
    if (!seenProtected.has(id)) merged.push(item);
  }
  return { ok: true, items: merged, protectedIds: new Set(protectedById.keys()) };
}

function preserveSpecifications2ServerWorkOrderProjection(current, snapshot) {
  const currentPlanning = parsePlanningState(current?.values?.[PLANNING_STATE_KEY]);
  const nextPlanning = parsePlanningState(snapshot?.values?.[PLANNING_STATE_KEY]);
  if (!currentPlanning || !nextPlanning) {
    return { ok: false, conflict: true, error: "Specifications 2.0 server-owned Work Order projection is not valid" };
  }
  const routes = mergeProtectedRecords({
    currentItems: currentPlanning.routes,
    nextItems: nextPlanning.routes,
    ownsCurrent: isSpecifications2ServerWorkOrderRoute,
    claimsOwnership: isSpecifications2ServerWorkOrderRoute,
    subject: "Specifications 2.0 server-owned Work Order routes",
  });
  if (!routes.ok) return routes;
  const protectedRouteIds = routes.protectedIds;
  const ownsWorkOrderRecord = (record) => protectedRouteIds.has(String(record?.routeId || ""))
    || protectedRouteIds.has(String(record?.planningOrderId || ""));
  const routeSteps = mergeProtectedRecords({
    currentItems: currentPlanning.routeSteps,
    nextItems: nextPlanning.routeSteps,
    ownsCurrent: ownsWorkOrderRecord,
    claimsOwnership: ownsWorkOrderRecord,
    subject: "Specifications 2.0 server-owned Work Order route steps",
  });
  if (!routeSteps.ok) return routeSteps;
  const slots = mergeProtectedRecords({
    currentItems: currentPlanning.slots,
    nextItems: nextPlanning.slots,
    ownsCurrent: ownsWorkOrderRecord,
    claimsOwnership: ownsWorkOrderRecord,
    subject: "Specifications 2.0 server-owned Work Order slots",
  });
  if (!slots.ok) return slots;
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      values: {
        ...(snapshot.values || {}),
        [PLANNING_STATE_KEY]: JSON.stringify({
          ...nextPlanning,
          routes: routes.items,
          routeSteps: routeSteps.items,
          slots: slots.items,
        }),
      },
    },
  };
}

function preserveSpecifications2PublishedCompatibilityProjection(current, snapshot, authority) {
  const currentDirectory = parseJsonRecord(current?.values?.[DIRECTORY_STORAGE_KEY]);
  const nextDirectory = parseJsonRecord(snapshot?.values?.[DIRECTORY_STORAGE_KEY]);
  const currentPlanning = parsePlanningState(current?.values?.[PLANNING_STATE_KEY]);
  const nextPlanning = parsePlanningState(snapshot?.values?.[PLANNING_STATE_KEY]);
  if (!currentDirectory || !nextDirectory || !currentPlanning || !nextPlanning) {
    return { ok: false, conflict: true, error: "Specifications 2.0 server-owned compatibility projection is not valid" };
  }
  let directory = nextDirectory;
  let planning = nextPlanning;
  const referencedHistoricalRouteIds = new Set((Array.isArray(currentPlanning.slots) ? currentPlanning.slots : [])
    .flatMap((slot) => [String(slot?.routeId || ""), String(slot?.planningOrderId || "")])
    .filter(Boolean));
  const operationalHistoricalRouteIds = new Set((Array.isArray(currentPlanning.routes) ? currentPlanning.routes : [])
    .filter((route) => Boolean(String(route?.workOrderSnapshot?.id || "").trim()))
    .map((route) => String(route?.id || ""))
    .filter(Boolean));
  for (const [entryId, publication] of Object.entries(authority)) {
    const specificationId = String(publication?.specificationId || "");
    const rootRouteId = String(publication?.rootRouteId || "");
    const ownsSpecification = (item) => String(item?.sourceSpecifications2EntryId || "") === entryId
      || (specificationId && String(item?.id || "") === specificationId);
    const ownsNomenclature = (item) => String(item?.sourceSpecifications2EntryId || "") === entryId;
    const specifications = mergeProtectedRecords({
      currentItems: currentDirectory.specifications,
      nextItems: directory.specifications,
      ownsCurrent: ownsSpecification,
      claimsOwnership: ownsSpecification,
      subject: `Specifications 2.0 publication ${entryId} specification projection`,
    });
    if (!specifications.ok) return specifications;
    const nomenclature = mergeProtectedRecords({
      currentItems: currentDirectory.nomenclature,
      nextItems: directory.nomenclature,
      ownsCurrent: ownsNomenclature,
      claimsOwnership: ownsNomenclature,
      subject: `Specifications 2.0 publication ${entryId} Nomenclature projection`,
    });
    if (!nomenclature.ok) return nomenclature;
    directory = {
      ...directory,
      nomenclature: nomenclature.items,
      specifications: specifications.items,
    };
    const protectedRootRouteIds = specifications2PublicationRootIds(publication, { includePrior: false });
    for (const priorRootId of specifications2PublicationRootIds(publication)) {
      if (priorRootId !== rootRouteId
        && (referencedHistoricalRouteIds.has(priorRootId) || operationalHistoricalRouteIds.has(priorRootId))) {
        protectedRootRouteIds.add(priorRootId);
      }
    }
    const ownsRoute = (route) => protectedRootRouteIds.has(String(route?.id || ""))
      || protectedRootRouteIds.has(String(route?.rootRouteId || ""));
    const routes = mergeProtectedRecords({
      currentItems: currentPlanning.routes,
      nextItems: planning.routes,
      ownsCurrent: ownsRoute,
      claimsOwnership: ownsRoute,
      mergeRecord: (currentRoute, nextRoute) => mergePublishedOperationalFields(
        currentRoute,
        nextRoute,
        SPECIFICATIONS2_PUBLISHED_ROUTE_MUTABLE_FIELDS,
      ),
      subject: `Specifications 2.0 publication ${entryId} route projection`,
    });
    if (!routes.ok) return routes;
    const ownedRouteIds = routes.protectedIds;
    const ownsRouteRecord = (record) => ownedRouteIds.has(String(record?.routeId || ""))
      || ownedRouteIds.has(String(record?.planningOrderId || ""));
    const routeSteps = mergeProtectedRecords({
      currentItems: currentPlanning.routeSteps,
      nextItems: planning.routeSteps,
      ownsCurrent: ownsRouteRecord,
      claimsOwnership: ownsRouteRecord,
      mergeRecord: (currentStep, nextStep) => mergePublishedOperationalFields(
        currentStep,
        nextStep,
        SPECIFICATIONS2_PUBLISHED_STEP_MUTABLE_FIELDS,
      ),
      subject: `Specifications 2.0 publication ${entryId} route-step projection`,
    });
    if (!routeSteps.ok) return routeSteps;
    planning = {
      ...planning,
      routes: routes.items,
      routeSteps: routeSteps.items,
    };
  }
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      values: {
        ...(snapshot.values || {}),
        [DIRECTORY_STORAGE_KEY]: JSON.stringify(directory),
        [PLANNING_STATE_KEY]: JSON.stringify(planning),
      },
    },
  };
}

// Legacy bundles still send the full local registry.  The compact marker is
// written by the PostgreSQL-first projection and survives browser saves, so a
// stale published revision cannot win merely because a client happened to
// save after the server.  A normal draft with no publication metadata remains
// editable; it simply inherits the known immutable release marker.
function reconcileSpecifications2PublicationAuthority(current, snapshot) {
  const authority = current?.specifications2PublicationAuthority?.publications;
  if (!authority || typeof authority !== "object" || !Object.keys(authority).length) return { ok: true, snapshot };
  const nextRegistry = parseSpecifications2RegistryValue(snapshot?.values?.[SPECIFICATIONS2_STORAGE_KEY]);
  if (!nextRegistry) return { ok: false, conflict: true, error: "Specifications 2.0 registry is invalid while a server publication is authoritative" };
  const currentRegistry = parseSpecifications2RegistryValue(current?.values?.[SPECIFICATIONS2_STORAGE_KEY]);
  const currentEntries = Array.isArray(currentRegistry?.registry) ? currentRegistry.registry : [];
  let changed = false;
  let conflict = "";
  const registry = nextRegistry.registry.map((entry) => {
    const entryId = String(entry?.id || "");
    const immutablePublication = authority[entryId];
    if (!immutablePublication) return entry;
    const submittedPublication = entry?.publication;
    if (submittedPublication && !specifications2PublicationMatchesAuthority(submittedPublication, immutablePublication)) {
      conflict = `Specifications 2.0 immutable publication conflict for ${entryId}`;
      return entry;
    }
    const currentPublication = currentEntries.find((candidate) => String(candidate?.id || "") === entryId)?.publication;
    const publication = specifications2PublicationMatchesAuthority(currentPublication, immutablePublication)
      ? currentPublication
      : immutablePublication;
    if (!specifications2PublicationMatchesAuthority(submittedPublication, immutablePublication)
      || JSON.stringify(submittedPublication) !== JSON.stringify(publication)) changed = true;
    return { ...entry, publication };
  });
  if (conflict) return { ok: false, conflict: true, error: conflict };
  const registrySnapshot = changed
    ? {
      ...snapshot,
      values: {
        ...(snapshot.values || {}),
        [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ ...nextRegistry, registry }),
      },
    }
    : snapshot;
  return preserveSpecifications2PublishedCompatibilityProjection(current, registrySnapshot, authority);
}

function buildClientSnapshot(current, payload) {
  const values = sanitizeValues(payload.values, current.values);
  if (!values || !values["mes-planning-prototype-state-v2"] || !values["mes-planning-prototype-directories-v2"]) {
    throw new Error("Invalid shared state payload");
  }
  const sharedUi = Object.prototype.hasOwnProperty.call(payload || {}, "sharedUiPatch")
    ? mergeSharedUiPatch(current.sharedUi, payload.sharedUiPatch)
    : payload.sharedUi;
  if (sharedUi === null) throw new Error("Invalid shared UI patch");

  const version = Number(current.version || 0) + 1;
  const updatedAt = new Date().toISOString();
  const updatedBy = {
    clientId: normalizeActor(payload.clientId),
    actor: normalizeActor(payload.actor),
  };
  const event = {
    version,
    createdAt: updatedAt,
    action: normalizeAction(payload.action),
    clientId: updatedBy.clientId,
    actor: updatedBy.actor,
  };

  return {
    version,
    updatedAt,
    updatedBy,
    values,
    sharedUi: retireShiftExecutionSharedUi(
      sanitizeSharedUi(sharedUi, current.sharedUi),
      normalizeShiftExecutionRetirement(current.shiftExecutionRetirement),
    ),
    events: [event, ...(current.events || [])].slice(0, 50),
    systemDomainsRetirement: current.systemDomainsRetirement || null,
    shiftExecutionRetirement: normalizeShiftExecutionRetirement(current.shiftExecutionRetirement),
    // Browser payloads intentionally do not own published-revision authority.
    // Preserve the server marker across every legacy full snapshot write.
    specifications2PublicationAuthority: current.specifications2PublicationAuthority || null,
  };
}

export async function handleSharedStateRequest(req, res, {
  headers,
  filePath,
  env = process.env,
  backupDir = "",
  auditLogPath = "",
} = {}) {
  // Keep the transport concern local to this endpoint: state semantics stay
  // byte-for-byte identical after the browser transparently decompresses it.
  res.__mesAcceptEncoding = String(req.headers?.["accept-encoding"] || "");
  const store = createStore({ env, filePath });

  if (!store.configured) {
    const emptySnapshot = createEmptySnapshot();
    const unconfigured = {
      ok: true,
      configured: false,
      message: "Shared state storage is not configured",
      ...emptySnapshot,
    };
    sendJson(res, headers, 200, req.method === "GET" && requestsSystemDomainsCompatibilityStatus(req.headers)
      ? attachSystemDomainsCompatibilityStatus(unconfigured, emptySnapshot)
      : unconfigured);
    return;
  }

  if (req.method === "GET") {
    const snapshot = await store.read();
    const knownVersion = Number(req.headers?.["x-mes-shared-state-version"] || 0);
    const requestedValueKeys = getRequestedValueKeys(req.headers);
    const includeSystemDomainsCompatibility = requestsSystemDomainsCompatibilityStatus(req.headers);
    if (!requestedValueKeys && knownVersion > 0 && knownVersion === Number(snapshot.version || 0)) {
      const unchanged = {
        ok: true,
        configured: true,
        unchanged: true,
        version: Number(snapshot.version || 0),
        updatedAt: snapshot.updatedAt || "",
      };
      sendJson(res, headers, 200, includeSystemDomainsCompatibility
        ? attachSystemDomainsCompatibilityStatus(unchanged, snapshot)
        : unchanged);
      return;
    }
    const projected = { ok: true, configured: true, ...projectSnapshotValues(snapshot, requestedValueKeys) };
    sendJson(res, headers, 200, includeSystemDomainsCompatibility
      ? attachSystemDomainsCompatibilityStatus(projected, snapshot)
      : projected);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, headers, 405, { ok: false, configured: true, error: "Method is not allowed" });
    return;
  }

  try {
    const payload = JSON.parse(await readRequestBody(req) || "{}");
    const action = normalizeAction(payload.action);
    const destructiveAction = isSharedStateActionDestructive(action);
    const compactSharedUiAcknowledgement = isCompactSharedUiAcknowledgementRequest(payload, action);
    const compactDirectoryAcknowledgement = isCompactDirectoryAcknowledgementRequest(payload);
    const compactAcknowledgement = compactSharedUiAcknowledgement || compactDirectoryAcknowledgement;

    if (isProtectedAppEnv(env) && destructiveAction && !isDestructiveActionsAllowed(env)) {
      await appendSharedStateAudit({
        auditLogPath,
        event: {
          action,
          status: "denied",
          reason: "destructive-action-disabled",
          appEnv: env.APP_ENV || env.MES_APP_ENV || "",
          clientId: normalizeActor(payload.clientId),
          actor: normalizeActor(payload.actor),
        },
      }).catch(() => {});
      sendJson(res, headers, 403, {
        ok: false,
        configured: true,
        destructiveAction: true,
        error: "Destructive shared-state action is disabled for this environment",
      });
      return;
    }

    const persistSharedState = async () => {
      const current = await store.read();
      const baseVersion = Number(payload.baseVersion);
      const currentVersion = Number(current.version || 0);

      if (!Number.isFinite(baseVersion) || baseVersion !== currentVersion) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          error: "Shared state version conflict",
          current: compactDirectoryAcknowledgement ? projectSnapshotValues(current, []) : current,
        });
        return;
      }

      const nextValues = sanitizeValues(payload.values, current.values);
      const nextSharedUiInput = Object.prototype.hasOwnProperty.call(payload || {}, "sharedUiPatch")
        ? mergeSharedUiPatch(current.sharedUi, payload.sharedUiPatch)
        : payload.sharedUi;
      const nextSharedUi = nextSharedUiInput === null
        ? null
        : sanitizeSharedUi(nextSharedUiInput, current.sharedUi);
      const legacyDomainWrite = inspectLegacyDomainSharedStateWrite(
        current.values,
        nextValues,
        current.sharedUi,
        nextSharedUi || {},
        env,
      );
      if (!legacyDomainWrite.ok) {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action,
            status: "denied",
            reason: legacyDomainWrite.code,
            changedKeys: legacyDomainWrite.changedKeys,
            appEnv: env.APP_ENV || env.MES_APP_ENV || "",
            clientId: normalizeActor(payload.clientId),
            actor: normalizeActor(payload.actor),
          },
        }).catch(() => {});
        sendJson(res, headers, 409, {
          ok: false,
          // Domain-backed sharedUi changes need a terminal response for old
          // bundles: without `current` they skip conflict reconciliation, and
          // configured=false disables their transport until a page refresh so
          // a 24h dirty marker cannot replay stale intent after evaluation OFF.
          // The new marker handler runs before configured handling, performs
          // an exact GET and keeps the transport enabled.
          configured: legacyDomainWrite.changedSharedUiKeys.length ? false : true,
          // New clients handle the distinct marker before generic conflict
          // retry. Old bundles still follow their bounded conflict path: both
          // attempts are rejected and the second response restores `current`.
          conflict: true,
          legacyDomainWritesQuiesced: true,
          // Transitional alias: an already-staged client still treats this as
          // a terminal authority marker instead of entering a retry loop.
          planningLegacyWritesQuiesced: true,
          code: legacyDomainWrite.code,
          error: legacyDomainWrite.error,
          changedKeys: legacyDomainWrite.changedKeys,
          changedValueKeys: legacyDomainWrite.changedValueKeys,
          changedSharedUiKeys: legacyDomainWrite.changedSharedUiKeys,
          currentVersion,
          // Old bundles preserve and requeue local sharedUi after a terminal
          // conflict that contains `current`. Omit that field for blocked
          // domain-backed sharedUi edits so the stale intent cannot sleep
          // until the evaluation ends and then persist without confirmation.
          // New bundles fetch and apply the full canonical snapshot on this
          // marker. Values-only old-tab writes still receive `current` for
          // their established second-conflict restore path.
          ...(legacyDomainWrite.changedSharedUiKeys.length ? {} : { current }),
        });
        return;
      }

      if (hasRetiredSystemDomainsSnapshot(current.values)
        && attemptsToRestoreRetiredSystemDomains(payload.values)) {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action,
            status: "denied",
            reason: "system-domains-compatibility-snapshot-retired",
            appEnv: env.APP_ENV || env.MES_APP_ENV || "",
            clientId: normalizeActor(payload.clientId),
            actor: normalizeActor(payload.actor),
          },
        }).catch(() => {});
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          systemDomainsSnapshotRetired: true,
          error: "System Domains compatibility snapshot is retired and cannot be restored",
          current,
        });
        return;
      }

      if (!hasRetiredSystemDomainsSnapshot(current.values)
        && attemptsToRetireSystemDomains(payload.values)) {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action,
            status: "denied",
            reason: "system-domains-compatibility-snapshot-retirement-requires-root-cutover",
            appEnv: env.APP_ENV || env.MES_APP_ENV || "",
            clientId: normalizeActor(payload.clientId),
            actor: normalizeActor(payload.actor),
          },
        }).catch(() => {});
        sendJson(res, headers, 403, {
          ok: false,
          configured: true,
          systemDomainsRetirementRequiresRootCutover: true,
          error: "System Domains compatibility snapshot retirement requires the root-controlled PostgreSQL-primary cutover",
          current,
        });
        return;
      }

      const shiftExecutionRetirement = normalizeShiftExecutionRetirement(current.shiftExecutionRetirement);
      if (!shiftExecutionRetirement && attemptsToRetireShiftExecutionSharedUi(payload)) {
        sendJson(res, headers, 403, {
          ok: false,
          configured: true,
          shiftExecutionRetirementRequiresControlledCutover: true,
          error: "Shift Execution compatibility snapshot retirement requires the controlled PostgreSQL-primary cutover",
          current,
        });
        return;
      }
      if (shiftExecutionRetirement && attemptsToRestoreShiftExecutionSharedUi(payload)) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          shiftExecutionSnapshotRetired: true,
          error: "Shift Execution compatibility snapshot is retired and cannot be restored",
          current,
        });
        return;
      }

      const planningKey = "mes-planning-prototype-state-v2";
      const directoriesKey = "mes-planning-prototype-directories-v2";
      // An acknowledgement-only request intentionally omits every domain
      // value. It is safe only after a normal snapshot has established the
      // required base values; signal the browser to retry the legacy full
      // write when this is a freshly configured empty store.
      if (compactSharedUiAcknowledgement
        && (!current.values?.[planningKey] || !current.values?.[directoriesKey])) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          compactAckUnavailable: true,
          error: "Compact shared-UI acknowledgement requires an existing domain snapshot",
          current,
        });
        return;
      }

      const incomingPlanning = payload.values?.[planningKey];
      if (!destructiveAction
        && hasMeaningfulPlanningState(current.values?.[planningKey])
        && typeof incomingPlanning === "string"
        && !hasMeaningfulPlanningState(incomingPlanning)) {
        await appendSharedStateAudit({
          auditLogPath,
          event: {
            action,
            status: "denied",
            reason: "nonempty-planning-state-cannot-be-cleared",
            appEnv: env.APP_ENV || env.MES_APP_ENV || "",
            clientId: normalizeActor(payload.clientId),
            actor: normalizeActor(payload.actor),
          },
        }).catch(() => {});
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          error: "Non-empty planning state cannot be replaced by an empty snapshot",
          current,
        });
        return;
      }
      const currentSpecifications2Revision = getMaxSpecifications2PlanningRevision(current.values?.[planningKey]);
      const incomingSpecifications2Revision = getMaxSpecifications2PlanningRevision(incomingPlanning);
      if (!destructiveAction
        && incomingSpecifications2Revision > 0
        && incomingSpecifications2Revision < currentSpecifications2Revision) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          error: "An older Specifications 2.0 planning revision cannot replace a newer revision",
          current,
        });
        return;
      }

      let snapshot = buildClientSnapshot(current, payload);
      const authorityTransition = validateSharedStateAuthorityTransition(current, snapshot, env, null);
      if (!authorityTransition.ok) {
        sendJson(res, headers, 409, {
          ok: false,
          configured: true,
          conflict: true,
          nomenclatureServerAuthority: ["nomenclature-command-required", "dangling-nomenclature-reference"].includes(authorityTransition.code),
          directoryClusterServerAuthority: authorityTransition.code === "directory-cluster-command-required",
          specifications2PublicationAuthority: String(authorityTransition.code || "").startsWith("specifications2-"),
          code: authorityTransition.code,
          error: authorityTransition.error,
          ...(authorityTransition.danglingReferences
            ? { danglingReferences: authorityTransition.danglingReferences }
            : {}),
          current: compactDirectoryAcknowledgement ? projectSnapshotValues(current, []) : current,
        });
        return;
      }
      snapshot = authorityTransition.snapshot;
      const planningObservationSource = `browser-shared-state:${action}`;
      const planningObservation = await beginPlanningSnapshotObservation({
        env,
        current,
        next: snapshot,
        source: planningObservationSource,
      });
      if (!planningObservation.ok) {
        sendJson(res, headers, 503, {
          ok: false,
          configured: true,
          retryable: true,
          error: planningObservation.error || "Planning snapshot observation is unavailable",
        });
        return;
      }
      if (store.kind === "file" && store.filePath && (destructiveAction || env.MES_BACKUP_BEFORE_SHARED_STATE_WRITE === "true")) {
        await backupSharedStateFile({
          filePath: store.filePath,
          backupDir: backupDir || resolveSharedStateBackupDir({ sharedStateFile: store.filePath, env }),
          reason: destructiveAction ? `before-${action}` : "before-shared-state-write",
          actor: normalizeActor(payload.actor),
          env,
          allowMissing: true,
        });
      }
      if (store.kind === "kv") {
        let persisted;
        try {
          persisted = await store.compareAndSet(currentVersion, snapshot);
        } catch (error) {
          sendJson(res, headers, 503, {
            ok: false,
            configured: true,
            retryable: true,
            error: error?.message || "KV shared-state compare-and-set failed",
          });
          return;
        }
        if (!persisted?.ok) {
          const latest = await store.read();
          sendJson(res, headers, persisted?.conflict ? 409 : 503, {
            ok: false,
            configured: true,
            ...(persisted?.conflict ? { conflict: true } : { retryable: true }),
            error: persisted?.error || (persisted?.conflict ? "Shared state version conflict" : "KV shared-state write was not confirmed"),
            current: compactDirectoryAcknowledgement ? projectSnapshotValues(latest, []) : latest,
          });
          return;
        }
      } else {
        await store.write(snapshot);
      }
      const planningObservationResult = await recordPlanningSnapshotObservation({
        observation: planningObservation,
        snapshot,
        source: planningObservationSource,
      });
      await appendSharedStateAudit({
        auditLogPath,
        event: {
          action,
          status: "saved",
          destructiveAction,
          version: snapshot.version,
          clientId: normalizeActor(payload.clientId),
          actor: normalizeActor(payload.actor),
          ...(planningObservationResult.attempted ? { planningSnapshotObservation: planningObservationResult.recorded ? "recorded" : "pending" } : {}),
        },
      }).catch(() => {});
      // The browser already owns the acknowledged UI/directory projection.
      // Avoid serialising the whole compatibility snapshot back to it. Compact
      // directory conflicts also return only revision metadata because that
      // client deliberately retries the same narrow values against current CAS.
      sendJson(res, headers, 200, compactAcknowledgement
        ? { ok: true, configured: true, version: snapshot.version, updatedAt: snapshot.updatedAt }
        : { ok: true, configured: true, ...snapshot });
    };
    if (store.kind === "file" && store.filePath) {
      await withSharedStateFileLock(store.filePath, persistSharedState);
    } else {
      await persistSharedState();
    }
  } catch (error) {
    sendJson(res, headers, 500, {
      ok: false,
      configured: true,
      error: error?.message || "Cannot update shared state",
    });
  }
}
