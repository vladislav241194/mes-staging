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
  const candidates = jobs.filter((job) => job?.aggregateType === undefined || (
    String(job.aggregateType || "") === AGGREGATE_TYPE && String(job.commandType || "") === COMMAND_TYPE
  ));
  const result = { total: candidates.length, applied: 0, conflicts: 0, failed: 0, jobs: [] };
  for (const job of candidates) {
    const entry = job?.payload?.compatibilityEntry;
    if (!entry || typeof entry !== "object") {
      await primary.markSnapshotSync(job.id, { state: "conflict", error: "Specifications 2.0 outbox entry is missing its immutable compatibility payload" });
      result.conflicts += 1;
      result.jobs.push({ id: job.id, state: "conflict" });
      continue;
    }
    try {
      const mirrored = await snapshot.applyServerPublicationProjection(entry);
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
