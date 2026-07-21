import { createWorkOrdersRepository } from "./domain-repositories.mjs";
import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";
import { createSpecifications2SnapshotRepository } from "./domain-specifications2-snapshot-repository.mjs";
import { syncPendingSpecifications2PublicationChanges } from "./domain-specifications2-snapshot-sync.mjs";

function readLimit(argv = []) {
  const index = argv.indexOf("--limit");
  const value = index >= 0 ? Number(argv[index + 1]) : 50;
  return Math.max(1, Math.min(100, Number.isInteger(value) ? value : 50));
}

export function inspectDomainSnapshotSyncOutcome(result = {}) {
  const workOrders = result.workOrders && typeof result.workOrders === "object" ? result.workOrders : {};
  const planningConflictIds = [...new Set((Array.isArray(workOrders.jobs) ? workOrders.jobs : [])
    .filter((job) => job?.state === "conflict")
    .map((job) => Number(job.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  const planningConflicts = Number(workOrders.conflicts || 0);
  const failed = Number(result.failed || 0);
  const planningConflictMessage = planningConflicts > 0
    ? `Planning snapshot conflicts (${planningConflicts}); outbox IDs: ${planningConflictIds.length ? planningConflictIds.join(",") : "unavailable"}`
    : "";
  return {
    serviceFailure: failed > 0 || planningConflicts > 0,
    planningConflicts,
    planningConflictIds,
    planningConflictMessage,
  };
}

export async function runDomainSnapshotSync({ env = process.env, limit = 50 } = {}) {
  const primary = await createWorkOrdersRepository({ env });
  const health = await primary.health();
  if (health.storageBackend !== "postgresql") {
    throw new Error("Snapshot outbox runner requires MES_DOMAIN_STORAGE=postgres");
  }
  const workOrderSnapshot = await createWorkOrdersRepository({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" } });
  const specifications2Snapshot = createSpecifications2SnapshotRepository({ env, filePath: env.MES_SHARED_STATE_FILE || "" });
  // Both projection adapters write the same shared snapshot. Keep delivery
  // serial so one outbox stream never causes avoidable CAS retries for the
  // other; the timer will retry genuine external contention.
  const workOrders = await syncPendingSnapshotChanges({ primary, snapshot: workOrderSnapshot, limit });
  const specifications2 = await syncPendingSpecifications2PublicationChanges({ primary, snapshot: specifications2Snapshot, limit });
  return {
    total: workOrders.total + specifications2.total,
    applied: workOrders.applied + specifications2.applied,
    conflicts: workOrders.conflicts + specifications2.conflicts,
    failed: workOrders.failed + specifications2.failed,
    workOrders,
    specifications2,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runDomainSnapshotSync({ limit: readLimit(process.argv.slice(2)) });
  const outcome = inspectDomainSnapshotSyncOutcome(result);
  console.log(`Domain snapshot sync: ${result.applied} applied, ${result.conflicts} conflicts, ${result.failed} deferred`);
  if (outcome.planningConflictMessage) console.error(outcome.planningConflictMessage);
  // A terminal Planning compatibility conflict blocks safe rollback and must
  // fail the systemd run. Specifications2 keeps its established conflict
  // semantics; its stream is reported above but is not reclassified here.
  if (outcome.serviceFailure) process.exitCode = 1;
}
