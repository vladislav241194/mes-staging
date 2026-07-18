import { readSharedStateSnapshot, updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";
import {
  buildSpecifications2ReleaseFingerprint,
  publishSpecifications2Entry,
} from "../src/modules/specifications2/publication.js";

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
    && String(value?.fingerprint || "") === String(publication?.fingerprint || "");
}

function getPublicationAuthority(snapshot = {}, entryId = "") {
  const publication = snapshot?.specifications2PublicationAuthority?.publications?.[String(entryId || "")];
  return publication && typeof publication === "object" ? publication : null;
}

function withPublicationAuthority(snapshot = {}, entry = {}, publication = {}) {
  const current = snapshot?.specifications2PublicationAuthority?.publications;
  const publications = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const entryId = String(entry.id || "");
  const next = { ...publications };
  delete next[entryId];
  next[entryId] = {
    revision: Number(publication.revision || 0),
    fingerprint: String(publication.fingerprint || ""),
    specificationId: String(publication.specificationId || ""),
    rootRouteId: String(publication.rootRouteId || ""),
    releasedAt: String(publication.releasedAt || ""),
  };
  return {
    publications: Object.fromEntries(Object.entries(next).slice(-500)),
  };
}

function hasCompletePublishedProjection({ directoryState = {}, planningState = {}, publication = {}, entry = {}, projection = {} } = {}) {
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
  if (String(actualSpecification.sourceSpecifications2EntryId || "") !== String(entry.id || "")
    || Number(actualSpecification.revision || 0) !== Number(publication.revision || 0)
    || String(actualSpecification.sourceSpecifications2Fingerprint || "") !== String(publication.fingerprint || "")
    || !Array.isArray(actualSpecification.structureItems)
    || actualSpecification.structureItems.length !== (expectedSpecification.structureItems || []).length) return false;
  if (String(actualRoute.sourceSpecifications2EntryId || "") !== String(entry.id || "")
    || Number(actualRoute.documentRevisionSnapshot?.specificationRevision || actualRoute.revision || 0) !== Number(publication.revision || 0)
    || String(actualRoute.documentRevisionSnapshot?.releaseFingerprint || "") !== String(publication.fingerprint || "")) return false;
  const expectedStepIds = new Set(expectedSteps.map((step) => String(step?.id || "")).filter(Boolean));
  return actualSteps.length === expectedSteps.length
    && expectedStepIds.size === expectedSteps.length
    && actualSteps.every((step) => expectedStepIds.has(String(step?.id || "")));
}

function validatePublicationEntry(entry = {}) {
  const publication = entry?.publication && typeof entry.publication === "object" ? entry.publication : null;
  if (!entry?.id || !publication?.revision || !publication?.fingerprint) {
    return { ok: false, error: "Specifications 2.0 compatibility outbox payload is incomplete" };
  }
  if (String(buildSpecifications2ReleaseFingerprint(entry)) !== String(publication.fingerprint)) {
    return { ok: false, error: "Specifications 2.0 compatibility outbox fingerprint does not match its immutable revision" };
  }
  return { ok: true, publication };
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
export function createSpecifications2SnapshotRepository({ env = process.env, filePath = "" } = {}) {
  async function inspect(entry) {
    const validation = validatePublicationEntry(entry);
    if (!validation.ok) return validation;
    const snapshotResult = await readSharedStateSnapshot({ env, filePath });
    if (!snapshotResult.configured) return { ok: false, retryable: true, error: "Shared-state compatibility storage is unavailable" };
    const registry = registryState(snapshotResult.snapshot);
    const directoryState = parseRecord(snapshotResult.snapshot?.values?.[DIRECTORY_STORAGE_KEY], "Directory state");
    const planningState = parseRecord(snapshotResult.snapshot?.values?.[PLANNING_STATE_KEY], "Planning state");
    const currentEntry = registry.registry.find((item) => String(item?.id || "") === String(entry.id)) || null;
    const currentPublication = currentEntry?.publication || null;
    const authoritativePublication = getPublicationAuthority(snapshotResult.snapshot, entry.id);
    const currentRevision = Number(currentPublication?.revision || 0);
    const targetRevision = Number(validation.publication.revision || 0);
    if (authoritativePublication && !publicationMatches(authoritativePublication, validation.publication)) {
      return { ok: false, conflict: true, error: "Shared-state authority already contains another immutable Specifications 2.0 revision" };
    }
    if (currentRevision > targetRevision) {
      // The browser registry is a compatibility projection, never a source of
      // truth.  Marking this outbox row applied would let a local legacy
      // revision silently supersede PostgreSQL.
      return { ok: false, conflict: true, error: "Shared-state draft claims a revision newer than the authoritative server publication" };
    }
    if (currentRevision === targetRevision && currentPublication && !publicationMatches(currentPublication, validation.publication)) {
      return { ok: false, conflict: true, error: "Shared-state draft contains another immutable revision with the same number" };
    }
    return {
      ok: true,
      validation,
      snapshot: snapshotResult.snapshot,
      registry,
      directoryState,
      planningState,
      currentEntry,
      authoritativePublication,
    };
  }

  return {
    async applyServerPublicationProjection(entry) {
      const prepared = await inspect(entry);
      if (prepared.applied || !prepared.ok) return prepared;
      let projection;
      try {
        projection = publishSpecifications2Entry(entry, {
          directoryState: prepared.directoryState,
          planningState: prepared.planningState,
          acknowledgedPublication: prepared.validation.publication,
        });
      } catch (error) {
        return { ok: false, conflict: true, error: error?.message || "Immutable Specifications 2.0 revision cannot be projected" };
      }
      if (hasCompletePublishedProjection({
        directoryState: prepared.directoryState,
        planningState: prepared.planningState,
        publication: prepared.validation.publication,
        entry,
        projection,
      }) && publicationMatches(prepared.authoritativePublication, prepared.validation.publication)
        && (!prepared.currentEntry || publicationMatches(prepared.currentEntry.publication, prepared.validation.publication))) {
        return { ok: true, applied: true, alreadyApplied: true, snapshotVersion: Number(prepared.snapshot?.version || 0), publication: projection.publication };
      }
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: Number(prepared.snapshot?.version || 0),
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
            specifications2PublicationAuthority: withPublicationAuthority(current, entry, projection.publication),
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
        return {
          ok: false,
          retryable: true,
          error: updated.error || (updated.conflict ? "Shared-state compatibility projection changed concurrently" : "Shared-state compatibility projection was not saved"),
        };
      }
      return { ok: true, applied: true, snapshotVersion: Number(updated.snapshot?.version || 0), publication: projection.publication };
    },
  };
}
