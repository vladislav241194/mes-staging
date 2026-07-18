/**
 * Delivers committed PostgreSQL commands to the temporary planning snapshot.
 *
 * PostgreSQL remains authoritative. The snapshot is only a compatibility read
 * model while older modules are migrated, so every delivery is idempotent and
 * guarded by the revision that existed before the server command.
 */
function asPositiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export async function syncPendingSnapshotChanges({ primary, snapshot, limit = 20 } = {}) {
  if (!primary?.listPendingSnapshotSyncs || !primary?.get || !primary?.markSnapshotSync || !snapshot) {
    throw new Error("Snapshot sync requires primary and snapshot repositories");
  }
  // Do not consume the first N entries of a mixed outbox and then silently
  // skip another aggregate type. Each compatibility worker owns its stream.
  const jobs = await primary.listPendingSnapshotSyncs(limit, { aggregateType: "work_order" });
  const result = { total: jobs.length, applied: 0, conflicts: 0, failed: 0, jobs: [] };
  for (const job of jobs) {
    if (!["change_quantity", "change_slot_schedule", "create_from_specifications2_revision"].includes(job.commandType)) continue;
    if (job.commandType === "create_from_specifications2_revision") {
      try {
        if (!snapshot.applyServerWorkOrderProjection) throw new Error("Snapshot repository does not support work-order creation projection");
        const detail = await primary.get(job.aggregateId);
        if (!detail?.item || Number(detail.item.concurrencyRevision) !== Number(job.aggregateRevision)) {
          await primary.markSnapshotSync(job.id, { state: "conflict", error: "Authoritative aggregate revision is unavailable" });
          result.conflicts += 1; result.jobs.push({ id: job.id, state: "conflict" }); continue;
        }
        const mirrored = await snapshot.applyServerWorkOrderProjection(job.aggregateId, { targetRevision: Number(job.aggregateRevision), source: { ...job.payload, quantity: detail.item.quantity }, operations: detail.item.operations || [] });
        if (mirrored.applied) {
          await primary.markSnapshotSync(job.id, { state: "applied" }); result.applied += 1; result.jobs.push({ id: job.id, state: "applied" });
        } else {
          await primary.markSnapshotSync(job.id, { state: "conflict", error: "Snapshot already contains a conflicting work order" }); result.conflicts += 1; result.jobs.push({ id: job.id, state: "conflict" });
        }
      } catch (error) {
        await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Snapshot delivery failed" }); result.failed += 1; result.jobs.push({ id: job.id, state: "pending" });
      }
      continue;
    }
    const expectedRevision = asPositiveInteger(job.payload?.expectedRevision);
    const quantity = asPositiveInteger(job.payload?.quantity);
    if (!expectedRevision || (job.commandType === "change_quantity" && !quantity)) {
      await primary.markSnapshotSync(job.id, { state: "conflict", error: "Invalid outbox payload" });
      result.conflicts += 1;
      result.jobs.push({ id: job.id, state: "conflict" });
      continue;
    }
    try {
      if (job.commandType === "change_quantity" && !snapshot.applyServerQuantityProjection) throw new Error("Snapshot repository does not support quantity projection");
      if (job.commandType === "change_slot_schedule" && !snapshot.applyServerSlotScheduleProjection) throw new Error("Snapshot repository does not support slot schedule projection");
      const detail = await primary.get(job.aggregateId);
      if (!detail?.item || Number(detail.item.concurrencyRevision) !== Number(job.aggregateRevision)) {
        await primary.markSnapshotSync(job.id, { state: "conflict", error: "Authoritative aggregate revision is unavailable" });
        result.conflicts += 1;
        result.jobs.push({ id: job.id, state: "conflict" });
        continue;
      }
      const mirrored = job.commandType === "change_quantity"
        ? await snapshot.applyServerQuantityProjection(job.aggregateId, {
          expectedRevision,
          targetRevision: Number(job.aggregateRevision),
          quantity,
          operations: detail.item.operations || [],
        })
        : await snapshot.applyServerSlotScheduleProjection(job.aggregateId, {
          expectedRevision,
          targetRevision: Number(job.aggregateRevision),
          slot: (detail.item.operations || []).find((operation) => String(operation.id) === String(job.payload?.operationId))?.slot || null,
        });
      if (mirrored.applied) {
        await primary.markSnapshotSync(job.id, { state: "applied" });
        result.applied += 1;
        result.jobs.push({ id: job.id, state: "applied" });
      } else {
        await primary.markSnapshotSync(job.id, { state: "conflict", error: "Snapshot revision changed independently" });
        result.conflicts += 1;
        result.jobs.push({ id: job.id, state: "conflict" });
      }
    } catch (error) {
      // Keep the row pending: a transient filesystem or database fault must
      // be retried by the next command/worker invocation, not discarded.
      await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Snapshot delivery failed" });
      result.failed += 1;
      result.jobs.push({ id: job.id, state: "pending" });
    }
  }
  return result;
}
