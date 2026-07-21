import {
  buildSpecifications2PublicationAuthority,
  readSharedStateSnapshot,
  updateSpecifications2PublicationSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";
import {
  SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES,
  buildSpecifications2ReleaseFingerprint,
  matchesSpecifications2ReleaseFingerprint,
  publishSpecifications2Entry,
  specifications2ReleaseFingerprintAdapterVersion,
  specifications2ReleaseFingerprintByteLength,
} from "../src/modules/specifications2/publication.js";
import { isDeepStrictEqual } from "node:util";
import {
  buildSpecifications2CompatibilityPayloadDigest,
  buildSpecifications2RelationalReleaseFingerprint,
} from "./domain-specifications2-export.mjs";

export const SPECIFICATIONS2_STORAGE_KEY = "mes-specifications-2-registry-v1";
export const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
export const PLANNING_STATE_KEY = "mes-planning-prototype-state-v2";

function parseRecord(raw, label, fallback = {}) {
  if (raw === undefined || raw === null || raw === "") return { ...fallback };
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { throw new Error(`${label} in shared state is not valid JSON`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} in shared state must be an object`);
  }
  return value;
}

function registryState(snapshot = {}) {
  const registry = parseRecord(snapshot?.values?.[SPECIFICATIONS2_STORAGE_KEY], "Specifications 2.0 registry", { registry: [] });
  return { ...registry, registry: Array.isArray(registry.registry) ? registry.registry : [] };
}

function publicationMatches(value = {}, publication = {}) {
  return Number(value?.revision || 0) === Number(publication?.revision || 0)
    && String(value?.fingerprint || "") === String(publication?.fingerprint || "")
    && String(value?.specificationId || "") === String(publication?.specificationId || "")
    && String(value?.rootRouteId || "") === String(publication?.rootRouteId || "")
    && String(value?.releasedAt || "") === String(publication?.releasedAt || "");
}

function getPublicationAuthority(snapshot = {}, entryId = "") {
  const publication = snapshot?.specifications2PublicationAuthority?.publications?.[String(entryId || "")];
  return publication && typeof publication === "object" ? publication : null;
}

const PUBLISHED_ROUTE_MUTABLE_FIELDS = new Set([
  "planningQuantity",
  "planningStatus",
  "workOrderSnapshot",
  "domainConcurrencyRevision",
  "updatedAt",
]);
const PUBLISHED_STEP_MUTABLE_FIELDS = new Set([
  "planningWorkCenterId",
  "resourceId",
  "updatedAt",
]);

function withoutFields(value = {}, ignored = new Set()) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !ignored.has(key)));
}

function recordsById(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id || "");
    if (!id || map.has(id)) return null;
    map.set(id, row);
  }
  return map;
}

function canonicalOwnedNomenclature(projection = {}, entryId = "") {
  return (projection?.directoryState?.nomenclature || [])
    .filter((row) => String(row?.sourceSpecifications2EntryId || "") === entryId);
}

function mergeCanonicalOwnedNomenclature(projection = {}, canonicalProjection = {}, entryId = "") {
  const canonical = canonicalOwnedNomenclature(canonicalProjection, entryId);
  const canonicalById = new Map(canonical.map((row) => [String(row?.id || ""), row]));
  const seen = new Set();
  const nomenclature = (projection?.directoryState?.nomenclature || []).map((row) => {
    const id = String(row?.id || "");
    const replacement = canonicalById.get(id);
    if (!replacement) return row;
    seen.add(id);
    return replacement;
  });
  canonical.forEach((row) => {
    const id = String(row?.id || "");
    if (!seen.has(id)) nomenclature.push(row);
  });
  return {
    ...projection,
    directoryState: { ...projection.directoryState, nomenclature },
  };
}

function mergeCurrentOperationalFields(projection = {}, currentPlanning = {}) {
  const currentRoutes = recordsById(currentPlanning.routes) || new Map();
  const currentSteps = recordsById(currentPlanning.routeSteps) || new Map();
  const copyFields = (next, current, fields) => {
    if (!current) return next;
    const merged = { ...next };
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(current, field)) merged[field] = current[field];
    });
    return merged;
  };
  return {
    ...projection,
    planningState: {
      ...projection.planningState,
      routes: (projection?.planningState?.routes || []).map((route) => copyFields(
        route,
        currentRoutes.get(String(route?.id || "")),
        PUBLISHED_ROUTE_MUTABLE_FIELDS,
      )),
      routeSteps: (projection?.planningState?.routeSteps || []).map((step) => copyFields(
        step,
        currentSteps.get(String(step?.id || "")),
        PUBLISHED_STEP_MUTABLE_FIELDS,
      )),
    },
  };
}

function hasCompletePublishedProjection({ directoryState = {}, planningState = {}, publication = {}, entry = {}, projection = {}, canonicalProjection = {} } = {}) {
  const specificationId = String(publication?.specificationId || "");
  const routeId = String(publication?.rootRouteId || "");
  if (!specificationId || !routeId) return false;
  const expectedSpecification = (projection?.directoryState?.specifications || []).find((item) => String(item?.id || "") === specificationId);
  const expectedRoute = (projection?.planningState?.routes || []).find((item) => String(item?.id || "") === routeId);
  const expectedSteps = (projection?.planningState?.routeSteps || []).filter((item) => String(item?.routeId || "") === routeId);
  const actualSpecification = (Array.isArray(directoryState.specifications) ? directoryState.specifications : [])
    .find((item) => String(item?.id || "") === specificationId);
  const actualRoute = (Array.isArray(planningState.routes) ? planningState.routes : [])
    .find((item) => String(item?.id || "") === routeId);
  const actualSteps = (Array.isArray(planningState.routeSteps) ? planningState.routeSteps : [])
    .filter((item) => String(item?.routeId || "") === routeId);
  if (!expectedSpecification || !expectedRoute || !actualSpecification || !actualRoute) return false;
  if (!isDeepStrictEqual(actualSpecification, expectedSpecification)
    || !isDeepStrictEqual(
      withoutFields(actualRoute, PUBLISHED_ROUTE_MUTABLE_FIELDS),
      withoutFields(expectedRoute, PUBLISHED_ROUTE_MUTABLE_FIELDS),
    )) return false;
  const expectedStepsById = recordsById(expectedSteps);
  const actualStepsById = recordsById(actualSteps);
  if (!expectedStepsById || !actualStepsById || expectedStepsById.size !== actualStepsById.size) return false;
  for (const [stepId, expectedStep] of expectedStepsById) {
    const actualStep = actualStepsById.get(stepId);
    if (!actualStep || !isDeepStrictEqual(
      withoutFields(actualStep, PUBLISHED_STEP_MUTABLE_FIELDS),
      withoutFields(expectedStep, PUBLISHED_STEP_MUTABLE_FIELDS),
    )) return false;
  }
  const expectedNomenclature = recordsById(canonicalOwnedNomenclature(canonicalProjection, String(entry.id || "")));
  const actualOwnedRows = (directoryState.nomenclature || [])
    .filter((row) => expectedNomenclature?.has(String(row?.id || "")));
  const actualNomenclature = recordsById(actualOwnedRows);
  return Boolean(expectedNomenclature && actualNomenclature
    && expectedNomenclature.size === actualNomenclature.size
    && [...expectedNomenclature].every(([id, row]) => isDeepStrictEqual(actualNomenclature.get(id), row)));
}

function validatePublicationEntry(entry = {}) {
  const publication = entry?.publication && typeof entry.publication === "object" ? entry.publication : null;
  const revision = Number(publication?.revision || 0);
  if (!entry?.id || !Number.isSafeInteger(revision) || revision <= 0
    || !publication?.fingerprint || !String(publication?.releasedAt || "").trim()) {
    return { ok: false, conflict: true, retryable: false, error: "Specifications 2.0 compatibility outbox payload is incomplete" };
  }
  const adapterVersion = specifications2ReleaseFingerprintAdapterVersion(publication.fingerprint);
  if (!adapterVersion
    || specifications2ReleaseFingerprintByteLength(publication.fingerprint) > SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES
    || !matchesSpecifications2ReleaseFingerprint(entry, publication.fingerprint, {
      allowTransportStrippedLegacyV4: true,
    })) {
    return { ok: false, conflict: true, retryable: false, error: "Specifications 2.0 compatibility outbox fingerprint does not match its immutable revision" };
  }
  return { ok: true, publication, adapterVersion };
}

function validateOutboxProof(entry = {}, proof = null) {
  const publication = entry?.publication || {};
  const fingerprint = String(publication.fingerprint || "");
  const revision = Number(publication.revision || 0);
  const payloadDigest = buildSpecifications2CompatibilityPayloadDigest(entry);
  const relationalFingerprint = buildSpecifications2RelationalReleaseFingerprint(fingerprint);
  if (!proof || String(proof.jobId || "").trim() === ""
    || String(proof.aggregateId || "").trim() === ""
    || proof.aggregateType !== "specifications2_revision"
    || proof.commandType !== "publish_revision"
    || Number(proof.aggregateRevision || 0) !== revision
    || String(proof.payloadFingerprint || "") !== fingerprint
    || String(proof.relationalFingerprint || "") !== relationalFingerprint
    || String(proof.payloadDigest || "") !== payloadDigest
    || proof.payloadDigestPersisted !== true) {
    return { ok: false, conflict: true, error: "Specifications 2.0 compatibility projection requires the exact durable outbox proof" };
  }
  return { ok: true };
}

function classifyProjectionWriteFailure(updated = {}) {
  const statusCode = Number(updated?.statusCode || 0);
  const clientFailure = Number.isSafeInteger(statusCode) && statusCode >= 400 && statusCode < 500;
  const authorityOrPolicyFailure = updated?.forbidden === true
    || clientFailure
    || (Boolean(String(updated?.code || "")) && updated?.retryable !== true);
  const compareAndSetConflict = updated?.conflict === true
    && updated?.forbidden !== true
    && !clientFailure
    && !String(updated?.code || "");
  const retryable = !authorityOrPolicyFailure
    && (updated?.retryable === true || compareAndSetConflict);
  const details = {
    ...(updated?.forbidden === true ? { forbidden: true } : {}),
    ...(String(updated?.code || "") ? { code: String(updated.code) } : {}),
    ...(statusCode > 0 ? { statusCode } : {}),
  };
  if (retryable) {
    return {
      ok: false,
      retryable: true,
      ...details,
      error: updated.error || (compareAndSetConflict
        ? "Shared-state compatibility projection changed concurrently"
        : "Shared-state compatibility projection was not saved"),
    };
  }
  // Authority, policy and otherwise unclassified non-CAS rejections cannot
  // become valid by replaying the same immutable outbox row. Surface them as
  // terminal conflicts so the worker does not leave a poisoned job pending.
  return {
    ok: false,
    conflict: true,
    retryable: false,
    ...details,
    error: updated.error || "Shared-state compatibility projection was permanently rejected",
  };
}

function attachPublicationToCurrentDraft(currentEntry, entry, publication) {
  if (!currentEntry) return null;
  const draftChanged = String(buildSpecifications2ReleaseFingerprint(currentEntry)) !== String(publication.fingerprint);
  return {
    ...currentEntry,
    publication,
    updatedAt: draftChanged
      ? currentEntry.updatedAt
      : (entry.updatedAt || currentEntry.updatedAt || publication.releasedAt || ""),
  };
}

// Snapshot is deliberately a compatibility projection. This adapter accepts
// only a validated immutable publication from the PostgreSQL outbox and
// changes all three legacy values in one file/KV CAS write.
export function createSpecifications2SnapshotRepository({
  env = process.env,
  filePath = "",
  updatePublicationSnapshot = updateSpecifications2PublicationSharedStateSnapshot,
} = {}) {
  async function inspect(entry) {
    const validation = validatePublicationEntry(entry);
    if (!validation.ok) return validation;
    const snapshotResult = await readSharedStateSnapshot({ env, filePath });
    if (!snapshotResult.configured) return { ok: false, retryable: true, error: "Shared-state compatibility storage is unavailable" };
    const registry = registryState(snapshotResult.snapshot);
    const directoryState = parseRecord(snapshotResult.snapshot?.values?.[DIRECTORY_STORAGE_KEY], "Directory state");
    const planningState = parseRecord(snapshotResult.snapshot?.values?.[PLANNING_STATE_KEY], "Planning state");
    let exactPublication;
    try {
      exactPublication = publishSpecifications2Entry(entry, {
        directoryState,
        planningState,
        acknowledgedPublication: validation.publication,
        now: String(validation.publication.releasedAt || ""),
        allowTransportStrippedLegacyFingerprint: validation.adapterVersion === 4,
      }).publication;
    } catch (error) {
      return { ok: false, conflict: true, retryable: false, error: error?.message || "Specifications 2.0 immutable publication coordinates cannot be derived" };
    }
    const currentEntry = registry.registry.find((item) => String(item?.id || "") === String(entry.id)) || null;
    const currentPublication = currentEntry?.publication || null;
    const authoritativePublication = getPublicationAuthority(snapshotResult.snapshot, entry.id);
    const currentRevision = Number(currentPublication?.revision || 0);
    const targetRevision = Number(exactPublication.revision || 0);
    const authoritativeRevision = Number(authoritativePublication?.revision || 0);
    if (authoritativeRevision > targetRevision
      || (authoritativeRevision === targetRevision
        && authoritativePublication
        && !publicationMatches(authoritativePublication, exactPublication))) {
      return { ok: false, conflict: true, error: "Shared-state authority already contains a newer or different immutable Specifications 2.0 revision" };
    }
    if (currentRevision > targetRevision) {
      // The browser registry is a compatibility projection, never a source of
      // truth.  Marking this outbox row applied would let a local legacy
      // revision silently supersede PostgreSQL.
      return { ok: false, conflict: true, error: "Shared-state draft claims a revision newer than the authoritative server publication" };
    }
    if (currentRevision === targetRevision && currentPublication && !publicationMatches(currentPublication, exactPublication)) {
      return { ok: false, conflict: true, error: "Shared-state draft contains another immutable revision with the same number" };
    }
    return {
      ok: true,
      validation: { ...validation, publication: exactPublication },
      snapshot: snapshotResult.snapshot,
      registry,
      directoryState,
      planningState,
      currentEntry,
      authoritativePublication,
    };
  }

  return {
    async applyServerPublicationProjection(entry, outboxProof = null) {
      const outbox = validateOutboxProof(entry, outboxProof);
      if (!outbox.ok) return outbox;
      const prepared = await inspect(entry);
      if (prepared.applied || !prepared.ok) return prepared;
      let projection;
      let canonicalProjection;
      try {
        const projectionNow = String(prepared.validation.publication.releasedAt || "");
        projection = publishSpecifications2Entry(entry, {
          directoryState: prepared.directoryState,
          planningState: prepared.planningState,
          acknowledgedPublication: prepared.validation.publication,
          now: projectionNow,
          allowTransportStrippedLegacyFingerprint: prepared.validation.adapterVersion === 4,
        });
        canonicalProjection = publishSpecifications2Entry(entry, {
          directoryState: {
            ...prepared.directoryState,
            nomenclature: (prepared.directoryState.nomenclature || [])
              .filter((row) => String(row?.sourceSpecifications2EntryId || "") !== String(entry.id || "")),
          },
          planningState: prepared.planningState,
          acknowledgedPublication: prepared.validation.publication,
          now: projectionNow,
          allowTransportStrippedLegacyFingerprint: prepared.validation.adapterVersion === 4,
        });
        projection = mergeCanonicalOwnedNomenclature(
          projection,
          canonicalProjection,
          String(entry.id || ""),
        );
        projection = mergeCurrentOperationalFields(projection, prepared.planningState);
      } catch (error) {
        return { ok: false, conflict: true, error: error?.message || "Immutable Specifications 2.0 revision cannot be projected" };
      }
      if (hasCompletePublishedProjection({
        directoryState: prepared.directoryState,
        planningState: prepared.planningState,
        publication: prepared.validation.publication,
        entry,
        projection,
        canonicalProjection,
      }) && publicationMatches(prepared.authoritativePublication, prepared.validation.publication)
        && (!prepared.currentEntry || publicationMatches(prepared.currentEntry.publication, prepared.validation.publication))) {
        return { ok: true, applied: true, alreadyApplied: true, snapshotVersion: Number(prepared.snapshot?.version || 0), publication: projection.publication };
      }
      const updated = await updatePublicationSnapshot({
        env,
        filePath,
        expectedVersion: Number(prepared.snapshot?.version || 0),
        authorityProof: {
          ...outboxProof,
          compatibilityEntry: JSON.parse(JSON.stringify(entry)),
          payloadDigestPersisted: outboxProof?.payloadDigestPersisted === true,
          entryId: String(entry.id || ""),
          revision: Number(projection.publication.revision || 0),
          fingerprint: String(projection.publication.fingerprint || ""),
          specificationId: String(projection.publication.specificationId || ""),
          rootRouteId: String(projection.publication.rootRouteId || ""),
        },
        update: (current) => {
          const currentRegistry = registryState(current);
          const currentEntry = currentRegistry.registry.find((item) => String(item?.id || "") === String(entry.id)) || null;
          const nextPublishedEntry = attachPublicationToCurrentDraft(currentEntry, entry, projection.publication);
          const nextRegistry = nextPublishedEntry
            ? currentRegistry.registry.map((item) => String(item?.id || "") === String(entry.id) ? nextPublishedEntry : item)
            // A user may delete a draft while its server publication is being
            // delivered. Do not resurrect the draft; the immutable revision
            // remains available from PostgreSQL and downstream projections.
            : currentRegistry.registry;
          return {
            ...current,
            specifications2PublicationAuthority: buildSpecifications2PublicationAuthority(
              current,
              String(entry.id || ""),
              projection.publication,
            ),
            values: {
              ...(current.values || {}),
              [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ ...currentRegistry, registry: nextRegistry }),
              [DIRECTORY_STORAGE_KEY]: JSON.stringify(projection.directoryState),
              [PLANNING_STATE_KEY]: JSON.stringify(projection.planningState),
            },
          };
        },
      });
      if (!updated.ok) {
        return classifyProjectionWriteFailure(updated);
      }
      return { ok: true, applied: true, snapshotVersion: Number(updated.snapshot?.version || 0), publication: projection.publication };
    },
  };
}
