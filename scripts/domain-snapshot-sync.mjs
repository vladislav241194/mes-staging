import { isExactIsoCalendarDate, isExactIsoInstantWithOffset } from "../src/domain/calendar_date.js";

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

function readNullablePlanningStartDate(payload) {
  if (!payload || typeof payload !== "object"
    || !Object.prototype.hasOwnProperty.call(payload, "planningStartDate")) {
    return { valid: false, value: undefined };
  }
  if (payload.planningStartDate === null) return { valid: true, value: null };
  if (typeof payload.planningStartDate !== "string") return { valid: false, value: undefined };
  const value = payload.planningStartDate.trim();
  return { valid: isExactIsoCalendarDate(value), value };
}

function isValidWorkOrderTransition(job = {}) {
  const expectedRevision = asPositiveInteger(job.payload?.expectedRevision);
  const targetRevision = asPositiveInteger(job.aggregateRevision);
  if (!expectedRevision || targetRevision !== expectedRevision + 1) return false;
  if (job.commandType === "change_quantity") return Boolean(asPositiveInteger(job.payload?.quantity));
  if (job.commandType === "change_start_date") return readNullablePlanningStartDate(job.payload).valid;
  if (job.commandType === "change_slot_schedule") {
    return Boolean(String(job.payload?.operationId || "").trim())
      && Boolean(String(job.payload?.slotId || "").trim())
      && isExactIsoInstantWithOffset(job.payload?.plannedStart)
      && isExactIsoInstantWithOffset(job.payload?.plannedEnd);
  }
  return false;
}

export async function syncPendingSnapshotChanges({ primary, snapshot, limit = 20 } = {}) {
  if (!primary?.listPendingSnapshotSyncs || !primary?.get || !primary?.markSnapshotSync || !snapshot) {
    throw new Error("Snapshot sync requires primary and snapshot repositories");
  }
  // Do not consume the first N entries of a mixed outbox and then silently
  // skip another aggregate type. Each compatibility worker owns its stream.
  const jobs = await primary.listPendingSnapshotSyncs(limit, { aggregateType: "work_order" });
  const result = { total: jobs.length, applied: 0, conflicts: 0, failed: 0, skipped: 0, jobs: [] };
  const blockedAggregates = new Set();
  const coalescedJobs = new Set();
  for (const job of jobs) {
    if (!["change_quantity", "change_start_date", "change_slot_schedule", "create_from_specifications2_revision"].includes(job.commandType)) continue;
    if (coalescedJobs.has(job.id)) continue;
    const aggregateKey = `${String(job.aggregateType || "work_order")}:${String(job.aggregateId || "")}`;
    // Preserve per-aggregate outbox order. If an earlier compatibility write
    // is retryable or conflicts, a later revision must remain pending instead
    // of being consumed against the older snapshot and becoming unrecoverable.
    if (blockedAggregates.has(aggregateKey)) {
      result.skipped += 1;
      result.jobs.push({ id: job.id, state: "blocked-by-earlier-revision" });
      continue;
    }
    if (job.commandType !== "create_from_specifications2_revision"
      && typeof snapshot.applyServerAggregateProjection === "function") {
      let aggregateJobs = jobs.filter((candidate) => (
        !coalescedJobs.has(candidate.id)
        && candidate.commandType !== "create_from_specifications2_revision"
        && `${String(candidate.aggregateType || "work_order")}:${String(candidate.aggregateId || "")}` === aggregateKey
      ));
      if (typeof primary.listPendingSnapshotSyncsForAggregate === "function") {
        try {
          const completeJobs = await primary.listPendingSnapshotSyncsForAggregate(job.aggregateId);
          aggregateJobs = completeJobs.filter((candidate) => (
            !coalescedJobs.has(candidate.id)
            && candidate.commandType !== "create_from_specifications2_revision"
            && `${String(candidate.aggregateType || "work_order")}:${String(candidate.aggregateId || "")}` === aggregateKey
          ));
          const initialIds = new Set(jobs.map((candidate) => candidate.id));
          result.total += aggregateJobs.filter((candidate) => !initialIds.has(candidate.id)).length;
        } catch (error) {
          await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Complete snapshot chain is unavailable" });
          result.failed += 1;
          result.jobs.push({ id: job.id, state: "pending" });
          blockedAggregates.add(aggregateKey);
          continue;
        }
      }
      aggregateJobs.sort((left, right) => Number(left.aggregateRevision) - Number(right.aggregateRevision) || Number(left.id) - Number(right.id));
      const chainValid = aggregateJobs.length > 0
        && aggregateJobs.every(isValidWorkOrderTransition)
        && aggregateJobs.every((candidate, index) => index === 0
          || Number(candidate.payload.expectedRevision) === Number(aggregateJobs[index - 1].aggregateRevision));
      const canCloseChainAtomically = aggregateJobs.length === 1
        || typeof primary.markSnapshotSyncs === "function";
      if (chainValid && canCloseChainAtomically) {
        const firstExpectedRevision = Number(aggregateJobs[0].payload.expectedRevision);
        let snapshotApplied = false;
        try {
          const detail = await primary.get(job.aggregateId);
          const authoritativeRevision = Number(detail?.item?.concurrencyRevision);
          if (!detail?.item || !Number.isInteger(authoritativeRevision)
            || authoritativeRevision !== Number(aggregateJobs.at(-1).aggregateRevision)) {
            await primary.markSnapshotSync(job.id, { state: "pending", error: "Complete authoritative aggregate chain is not visible yet" });
            result.failed += 1;
            result.jobs.push({ id: job.id, state: "pending" });
            blockedAggregates.add(aggregateKey);
            continue;
          }
          const slotJobs = aggregateJobs.filter((candidate) => candidate.commandType === "change_slot_schedule");
          const physicalSlots = Array.isArray(detail.item.physicalSlots) ? detail.item.physicalSlots : [];
          if (slotJobs.length && (!physicalSlots.length || slotJobs.some((candidate) => {
            const slotId = String(candidate.payload?.slotId || "");
            const operationId = String(candidate.payload?.operationId || "");
            return !physicalSlots.some((slot) => String(slot?.id || "") === slotId
              && (String(slot?.routeStepId || "") === operationId
                || String(slot?.operationId || "") === operationId));
          }))) {
            throw new Error("Complete authoritative physical-slot projection is unavailable");
          }
          const compatibilityItem = detail.item;
          const mirrored = await snapshot.applyServerAggregateProjection(job.aggregateId, {
            expectedRevision: firstExpectedRevision,
            targetRevision: authoritativeRevision,
            item: compatibilityItem,
          });
          if (!mirrored.applied) {
            await primary.markSnapshotSync(job.id, { state: "conflict", error: "Snapshot revision changed independently" });
            result.conflicts += 1;
            result.jobs.push({ id: job.id, state: "conflict" });
            blockedAggregates.add(aggregateKey);
            continue;
          }
          snapshotApplied = true;
          // PostgreSQL closes a coalesced page with one UPDATE. The snapshot
          // write and the outbox cannot share a transaction, so a crash after
          // the first write is recovered by applyServerAggregateProjection's
          // exact alreadyApplied comparison on the next invocation. Never
          // perform a partially visible sequence of individual applied marks.
          if (aggregateJobs.length > 1) {
            await primary.markSnapshotSyncs(aggregateJobs.map((delivered) => delivered.id), { state: "applied" });
          } else {
            await primary.markSnapshotSync(job.id, { state: "applied" });
          }
          for (const delivered of aggregateJobs) {
            coalescedJobs.add(delivered.id);
            result.applied += 1;
            result.jobs.push({ id: delivered.id, state: "applied", coalescedToRevision: authoritativeRevision });
          }
          continue;
        } catch (error) {
          // If the compatibility projection was already written, leave every
          // outbox state untouched. Exact aggregate read-back is the durable
          // receipt and allows the next page/retry to close safely, including
          // a historical partially-marked tail. Before the projection write,
          // retaining an error on the first pending row remains safe.
          if (!snapshotApplied) {
            await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Snapshot delivery failed" });
          }
          result.failed += 1;
          result.jobs.push({ id: job.id, state: snapshotApplied ? "receipt-pending" : "pending" });
          blockedAggregates.add(aggregateKey);
          continue;
        }
      }
    }
    if (job.commandType === "create_from_specifications2_revision") {
      try {
        if (!snapshot.applyServerWorkOrderProjection) throw new Error("Snapshot repository does not support work-order creation projection");
        const detail = await primary.get(job.aggregateId);
        if (!detail?.item || Number(detail.item.concurrencyRevision) !== Number(job.aggregateRevision)) {
          await primary.markSnapshotSync(job.id, { state: "conflict", error: "Authoritative aggregate revision is unavailable" });
          result.conflicts += 1; result.jobs.push({ id: job.id, state: "conflict" }); blockedAggregates.add(aggregateKey); continue;
        }
        const mirrored = await snapshot.applyServerWorkOrderProjection(job.aggregateId, { targetRevision: Number(job.aggregateRevision), source: { ...job.payload, quantity: detail.item.quantity }, operations: detail.item.operations || [] });
        if (mirrored.applied) {
          await primary.markSnapshotSync(job.id, { state: "applied" }); result.applied += 1; result.jobs.push({ id: job.id, state: "applied" });
        } else {
          await primary.markSnapshotSync(job.id, { state: "conflict", error: "Snapshot already contains a conflicting work order" }); result.conflicts += 1; result.jobs.push({ id: job.id, state: "conflict" });
          blockedAggregates.add(aggregateKey);
        }
      } catch (error) {
        await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Snapshot delivery failed" }); result.failed += 1; result.jobs.push({ id: job.id, state: "pending" });
        blockedAggregates.add(aggregateKey);
      }
      continue;
    }
    const expectedRevision = asPositiveInteger(job.payload?.expectedRevision);
    const targetRevision = asPositiveInteger(job.aggregateRevision);
    const quantity = asPositiveInteger(job.payload?.quantity);
    const planningStartDateCommand = readNullablePlanningStartDate(job.payload);
    const planningStartDate = planningStartDateCommand.value;
    if (!expectedRevision || targetRevision !== expectedRevision + 1
      || (job.commandType === "change_quantity" && !quantity)
      || (job.commandType === "change_start_date" && !planningStartDateCommand.valid)) {
      await primary.markSnapshotSync(job.id, { state: "conflict", error: "Invalid outbox payload" });
      result.conflicts += 1;
      result.jobs.push({ id: job.id, state: "conflict" });
      blockedAggregates.add(aggregateKey);
      continue;
    }
    try {
      if (job.commandType === "change_quantity" && !snapshot.applyServerQuantityProjection) throw new Error("Snapshot repository does not support quantity projection");
      if (job.commandType === "change_start_date" && !snapshot.applyServerStartDateProjection) throw new Error("Snapshot repository does not support start-date projection");
      if (job.commandType === "change_slot_schedule" && !snapshot.applyServerSlotScheduleProjection) throw new Error("Snapshot repository does not support slot schedule projection");
      const detail = await primary.get(job.aggregateId);
      const authoritativeRevision = Number(detail?.item?.concurrencyRevision);
      const authoritativeRevisionAvailable = job.commandType === "change_start_date"
        ? Number.isInteger(authoritativeRevision) && authoritativeRevision >= targetRevision
        : authoritativeRevision === targetRevision;
      if (!detail?.item || !authoritativeRevisionAvailable) {
        await primary.markSnapshotSync(job.id, { state: "conflict", error: "Authoritative aggregate revision is unavailable" });
        result.conflicts += 1;
        result.jobs.push({ id: job.id, state: "conflict" });
        blockedAggregates.add(aggregateKey);
        continue;
      }
      let mirrored;
      if (job.commandType === "change_quantity") {
        mirrored = await snapshot.applyServerQuantityProjection(job.aggregateId, {
          expectedRevision,
          targetRevision,
          quantity,
          operations: detail.item.operations || [],
        });
      } else if (job.commandType === "change_start_date") {
        mirrored = await snapshot.applyServerStartDateProjection(job.aggregateId, {
          expectedRevision,
          targetRevision,
          // Start-date jobs are complete immutable transitions. Using the
          // job value permits an ordered rev N -> N+1 backlog to recover even
          // when PostgreSQL has already committed later anchors.
          planningStartDate,
        });
      } else {
        const slotId = String(job.payload?.slotId || "").trim();
        const authoritativeSlot = {
          id: slotId,
          plannedStart: String(job.payload?.plannedStart || ""),
          plannedEnd: String(job.payload?.plannedEnd || ""),
          quantity: Number(job.payload?.quantity || 0),
          status: String(job.payload?.status || "planned"),
          isLocked: Boolean(job.payload?.isLocked),
        };
        if (!slotId
          || !isExactIsoInstantWithOffset(authoritativeSlot.plannedStart)
          || !isExactIsoInstantWithOffset(authoritativeSlot.plannedEnd)) {
          throw new Error("Exact authoritative planning slot is unavailable for compatibility sync");
        }
        mirrored = await snapshot.applyServerSlotScheduleProjection(job.aggregateId, {
          expectedRevision,
          targetRevision,
          slot: authoritativeSlot,
        });
      }
      if (mirrored.applied) {
        await primary.markSnapshotSync(job.id, { state: "applied" });
        result.applied += 1;
        result.jobs.push({ id: job.id, state: "applied" });
      } else {
        await primary.markSnapshotSync(job.id, { state: "conflict", error: "Snapshot revision changed independently" });
        result.conflicts += 1;
        result.jobs.push({ id: job.id, state: "conflict" });
        blockedAggregates.add(aggregateKey);
      }
    } catch (error) {
      // Keep the row pending: a transient filesystem or database fault must
      // be retried by the next command/worker invocation, not discarded.
      await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "Snapshot delivery failed" });
      result.failed += 1;
      result.jobs.push({ id: job.id, state: "pending" });
      blockedAggregates.add(aggregateKey);
    }
  }
  return result;
}
