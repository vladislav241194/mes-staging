import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { loadSystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { reconcileSystemDomains } from "../src/modules/system_domains/reconciliation.js";
import { readSharedStateSnapshot, updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";

function registryCounts(domains) {
  return Object.fromEntries(Object.entries(domains?.registries || {}).map(([name, items]) => [name, Array.isArray(items) ? items.length : 0]));
}

function consistencyDetails(sourceJson, targetJson, source, target, {
  snapshotVersion = 0,
  postgresRevision = 0,
} = {}) {
  const sourceCounts = registryCounts(source);
  const targetCounts = registryCounts(target);
  const registryCountDifferences = Object.fromEntries(
    [...new Set([...Object.keys(sourceCounts), ...Object.keys(targetCounts)])]
      .sort()
      .filter((name) => sourceCounts[name] !== targetCounts[name])
      .map((name) => [name, { snapshot: sourceCounts[name] || 0, postgres: targetCounts[name] || 0 }]),
  );
  return {
    snapshotBytes: Buffer.byteLength(sourceJson),
    postgresBytes: Buffer.byteLength(targetJson),
    registryCountDifferences,
    reconciliation: reconcileSystemDomains({
      snapshotDomains: source,
      postgresDomains: target,
      snapshotVersion,
      postgresRevision,
      // This endpoint deliberately performs one observation. A controller
      // must prove a double-read before treating the result as promotable.
      stability: "unverified",
    }),
  };
}

// This is an observation-only guard for rollout. It never repairs either
// store: callers can distinguish an absent/invalid legacy projection from a
// real divergence before enabling a command writer.
export async function inspectSystemDomainsSnapshotConsistency({ primary, env = process.env, filePath = "" } = {}) {
  if (!primary?.get) throw new Error("System Domains consistency check requires a primary repository");
  const projection = await primary.get();
  if (!projection.item) return { ok: false, matches: false, error: "Authoritative System Domains projection is not initialized", revision: Number(projection.revision || 0) };
  const snapshotResult = await readSharedStateSnapshot({ env, filePath });
  const snapshot = snapshotResult?.snapshot || null;
  const raw = snapshot?.values?.[SYSTEM_DOMAINS_STORAGE_KEY];
  if (raw === null && Object.prototype.hasOwnProperty.call(snapshot?.values || {}, SYSTEM_DOMAINS_STORAGE_KEY)) {
    return { ok: true, matches: false, reason: "snapshot_retired", revision: Number(projection.revision || 0), snapshotVersion: Number(snapshot?.version || 0) };
  }
  if (!raw) return { ok: true, matches: false, reason: "snapshot_missing", revision: Number(projection.revision || 0), snapshotVersion: Number(snapshot?.version || 0) };
  const loaded = loadSystemDomains(raw);
  if (!loaded?.domains || loaded.report?.valid === false) {
    return { ok: true, matches: false, reason: "snapshot_invalid", revision: Number(projection.revision || 0), snapshotVersion: Number(snapshot?.version || 0) };
  }
  const sourceJson = serializeSystemDomains(loaded.domains);
  const targetJson = serializeSystemDomains(projection.item);
  const matches = targetJson === sourceJson;
  return {
    ok: true,
    matches,
    reason: matches ? "" : "projection_diff",
    ...(matches ? {} : { details: consistencyDetails(sourceJson, targetJson, loaded.domains, projection.item, {
      snapshotVersion: Number(snapshot?.version || 0),
      postgresRevision: Number(projection.revision || 0),
    }) }),
    revision: Number(projection.revision || 0),
    snapshotVersion: Number(snapshot?.version || 0),
  };
}

// PostgreSQL is authoritative for a committed System Domains command. The
// legacy snapshot is a derived compatibility projection and is updated from
// the server read model, never from the browser command payload.
export async function syncPendingSystemDomainsSnapshotChanges({ primary, env = process.env, filePath = "", limit = 20 } = {}) {
  if (!primary?.listPendingSnapshotSyncs || !primary?.get || !primary?.markSnapshotSync) {
    throw new Error("System Domains snapshot sync requires a primary repository");
  }
  const jobs = await primary.listPendingSnapshotSyncs(limit);
  const result = { total: jobs.length, applied: 0, conflicts: 0, failed: 0, jobs: [] };
  for (const job of jobs) {
    try {
      const projection = await primary.get();
      if (!projection.item || Number(projection.revision) !== Number(job.aggregateRevision)) {
        await primary.markSnapshotSync(job.id, { state: "conflict", error: "Authoritative System Domains revision is unavailable" });
        result.conflicts += 1; result.jobs.push({ id: job.id, state: "conflict" }); continue;
      }
      const currentSnapshot = await readSharedStateSnapshot({ env, filePath });
      const retired = currentSnapshot?.snapshot?.values?.[SYSTEM_DOMAINS_STORAGE_KEY] === null
        && Object.prototype.hasOwnProperty.call(currentSnapshot?.snapshot?.values || {}, SYSTEM_DOMAINS_STORAGE_KEY);
      // A null value is an explicit migration marker, not missing data. Once
      // PostgreSQL is authoritative we must not let a later outbox retry
      // revive a second cross-browser System Domains projection.
      if (retired) {
        await primary.markSnapshotSync(job.id, { state: "applied" });
        result.applied += 1;
        result.jobs.push({ id: job.id, state: "applied", snapshotRetired: true, snapshotVersion: Number(currentSnapshot?.snapshot?.version || 0) });
        continue;
      }
      const serialized = serializeSystemDomains(projection.item);
      const mirrored = await updateSharedStateSnapshot({
        env, filePath,
        update: (current) => ({
          ...current,
          values: { ...(current.values || {}), [SYSTEM_DOMAINS_STORAGE_KEY]: serialized },
        }),
      });
      if (!mirrored.ok) throw new Error(mirrored.conflict ? "Shared-state projection conflict" : "Shared-state storage is unavailable");
      await primary.markSnapshotSync(job.id, { state: "applied" });
      result.applied += 1; result.jobs.push({ id: job.id, state: "applied", snapshotVersion: Number(mirrored.snapshot?.version || 0) });
    } catch (error) {
      await primary.markSnapshotSync(job.id, { state: "pending", error: error?.message || "System Domains snapshot delivery failed" });
      result.failed += 1; result.jobs.push({ id: job.id, state: "pending" });
    }
  }
  return result;
}
