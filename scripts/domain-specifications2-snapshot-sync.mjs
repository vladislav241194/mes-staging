import {
  buildSpecifications2CompatibilityPayloadDigest,
  buildSpecifications2RelationalReleaseFingerprint,
} from "./domain-specifications2-export.mjs";
import {
  SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES,
  matchesSpecifications2ReleaseFingerprint,
  specifications2ReleaseFingerprintByteLength,
} from "../src/modules/specifications2/publication.js";

const AGGREGATE_TYPE = "specifications2_revision";
const COMMAND_TYPE = "publish_revision";

// Delivers PostgreSQL-first publication commands to the legacy compatibility
// snapshot. Unlike work-order projection sync, the immutable source is held
// in the outbox payload so ordering and browser-release fingerprint cannot be
// reconstructed incorrectly from relational rows.
export async function syncPendingSpecifications2PublicationChanges({
  primary,
  snapshot,
  limit = 20,
  aggregateId = "",
} = {}) {
  if (!primary?.listPendingSnapshotSyncs || !primary?.markSnapshotSync || !snapshot?.applyServerPublicationProjection) {
    throw new Error("Specifications 2.0 snapshot sync requires primary and snapshot repositories");
  }
  const jobs = await primary.listPendingSnapshotSyncs(limit, {
    aggregateType: AGGREGATE_TYPE,
    aggregateId: String(aggregateId || ""),
  });
  const result = { total: jobs.length, applied: 0, conflicts: 0, failed: 0, jobs: [] };
  for (const job of jobs) {
    if (String(job?.aggregateType || "") !== AGGREGATE_TYPE
      || String(job?.commandType || "") !== COMMAND_TYPE) {
      await primary.markSnapshotSync(job?.id, { state: "conflict", error: "Specifications 2.0 outbox command is not supported by this immutable projection worker" });
      result.conflicts += 1;
      result.jobs.push({ id: job?.id, state: "conflict" });
      continue;
    }
    const entry = job?.payload?.compatibilityEntry;
    if (!entry || typeof entry !== "object") {
      await primary.markSnapshotSync(job.id, { state: "conflict", error: "Specifications 2.0 outbox entry is missing its immutable compatibility payload" });
      result.conflicts += 1;
      result.jobs.push({ id: job.id, state: "conflict" });
      continue;
    }
    const payloadDigest = buildSpecifications2CompatibilityPayloadDigest(entry);
    const hasPersistedPayloadDigest = Object.prototype.hasOwnProperty.call(job?.payload || {}, "compatibilityPayloadDigest");
    const persistedPayloadDigest = String(job?.payload?.compatibilityPayloadDigest || "");
    const releaseFingerprint = String(entry?.publication?.fingerprint || "");
    const relationalFingerprint = buildSpecifications2RelationalReleaseFingerprint(releaseFingerprint);
    if (!String(job.id || "").trim()
      || !String(job.aggregateId || "").trim()
      || !Number.isSafeInteger(Number(job.aggregateRevision))
      || Number(job.aggregateRevision) <= 0
      || Number(job.aggregateRevision) !== Number(entry?.publication?.revision || 0)
      || releaseFingerprint === ""
      || specifications2ReleaseFingerprintByteLength(releaseFingerprint) > SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES
      || String(job?.payload?.sourceEntryId || "") !== String(entry?.id || "")
      || String(job?.payload?.fingerprint || "") !== relationalFingerprint
      // A digestless v4 row cannot attest title, route/operation source ids,
      // labels and other projection-driving fields that its old fingerprint
      // never contained. It must be quarantined instead of being reconstructed
      // from self-asserted payload data. All newer rows always persist a digest.
      || !hasPersistedPayloadDigest
      || persistedPayloadDigest !== payloadDigest
      || !matchesSpecifications2ReleaseFingerprint(entry, releaseFingerprint, {
        allowTransportStrippedLegacyV4: true,
      })) {
      await primary.markSnapshotSync(job.id, { state: "conflict", error: "Specifications 2.0 outbox proof does not match its immutable compatibility payload" });
      result.conflicts += 1;
      result.jobs.push({ id: job.id, state: "conflict" });
      continue;
    }
    try {
      const mirrored = await snapshot.applyServerPublicationProjection(entry, {
        jobId: String(job.id || ""),
        aggregateType: String(job.aggregateType || ""),
        aggregateId: String(job.aggregateId || ""),
        aggregateRevision: Number(job.aggregateRevision || 0),
        commandType: String(job.commandType || ""),
        payloadFingerprint: String(entry?.publication?.fingerprint || ""),
        relationalFingerprint,
        payloadDigest,
        payloadDigestPersisted: true,
      });
      if (mirrored?.applied) {
        await primary.markSnapshotSync(job.id, { state: "applied" });
        result.applied += 1;
        result.jobs.push({ id: job.id, state: "applied", ...(mirrored.alreadyApplied ? { alreadyApplied: true } : {}), ...(mirrored.superseded ? { superseded: true } : {}) });
      } else if (mirrored?.conflict) {
        await primary.markSnapshotSync(job.id, { state: "conflict", error: mirrored.error || "Specifications 2.0 compatibility projection conflicts with shared state" });
        result.conflicts += 1;
        result.jobs.push({ id: job.id, state: "conflict" });
      } else {
        await primary.markSnapshotSync(job.id, { state: "pending", error: mirrored?.error || "Specifications 2.0 compatibility projection is temporarily unavailable" });
        result.failed += 1;
        result.jobs.push({ id: job.id, state: "pending" });
      }
    } catch (error) {
      await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Specifications 2.0 compatibility delivery failed" });
      result.failed += 1;
      result.jobs.push({ id: job.id, state: "pending" });
    }
  }
  return result;
}
