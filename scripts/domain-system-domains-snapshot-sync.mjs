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
  snapshotState = "active",
  primaryAuthority = false,
  stability = "unverified",
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
      snapshotState,
      primaryAuthority,
      stability,
    }),
  };
}

function inspectSnapshotState(snapshot) {
  const values = snapshot?.values || {};
  const snapshotVersion = Number(snapshot?.version || 0);
  const hasSystemDomains = Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY);
  const raw = values[SYSTEM_DOMAINS_STORAGE_KEY];
  if (raw === null && hasSystemDomains) return { state: "retired", snapshotVersion, serialized: "", domains: null };
  if (!raw) return { state: "missing", snapshotVersion, serialized: "", domains: null };
  const loaded = loadSystemDomains(raw);
  if (!loaded?.domains || loaded.report?.valid === false) return { state: "invalid", snapshotVersion, serialized: "", domains: null };
  return {
    state: "active",
    snapshotVersion,
    domains: loaded.domains,
    serialized: serializeSystemDomains(loaded.domains),
  };
}

async function readConsistencyObservation({ primary, env, filePath, readSnapshot }) {
  const [projection, snapshotResult, authority] = await Promise.all([
    primary.get(),
    readSnapshot({ env, filePath }),
    primary.getAuthority ? primary.getAuthority() : Promise.resolve({ mode: "compatibility-snapshot" }),
  ]);
  const item = projection?.item || null;
  return {
    primary: {
      item,
      revision: Number(projection?.revision || 0),
      fingerprint: String(projection?.fingerprint || ""),
      serialized: item ? serializeSystemDomains(item) : "",
    },
    snapshot: {
      ...inspectSnapshotState(snapshotResult?.snapshot || null),
      rawSnapshot: snapshotResult?.snapshot || null,
      storageKind: snapshotResult?.kind || "",
    },
    authority: authority && typeof authority === "object"
      ? {
        mode: String(authority.mode || "compatibility-snapshot"),
        transitionId: String(authority.transitionId || ""),
        proofPostgresRevision: Number(authority.proofPostgresRevision || 0),
        proofPostgresFingerprint: String(authority.proofPostgresFingerprint || ""),
        proofSnapshotVersion: Number(authority.proofSnapshotVersion || 0),
        proofSnapshotFingerprint: String(authority.proofSnapshotFingerprint || ""),
        activatedAt: String(authority.activatedAt || ""),
      }
      : { mode: "compatibility-snapshot", transitionId: "", proofPostgresRevision: 0, proofPostgresFingerprint: "", proofSnapshotVersion: 0, proofSnapshotFingerprint: "", activatedAt: "" },
  };
}

function hasStableObservations(first, second) {
  return first.primary.revision === second.primary.revision
    && first.primary.serialized === second.primary.serialized
    && first.snapshot.state === second.snapshot.state
    && first.snapshot.snapshotVersion === second.snapshot.snapshotVersion
    && first.snapshot.serialized === second.snapshot.serialized
    && first.authority.mode === second.authority.mode
    && first.authority.transitionId === second.authority.transitionId
    && first.authority.proofPostgresRevision === second.authority.proofPostgresRevision
    && first.authority.proofPostgresFingerprint === second.authority.proofPostgresFingerprint;
}

// This is an observation-only guard for rollout. It never repairs either
// store: callers can distinguish an absent/invalid legacy projection from a
// real divergence before enabling a command writer.  A matching result is
// valid only after two equal observations, so a concurrent browser snapshot
// write or PostgreSQL command cannot be mistaken for a promotion proof.
function buildSystemDomainsSnapshotConsistency({ first, second }) {
  const stability = hasStableObservations(first, second) ? "verified" : "changed";
  const { primary: projection, snapshot, authority } = second;
  if (!projection.item) return { ok: false, matches: false, error: "Authoritative System Domains projection is not initialized", revision: projection.revision };
  const primaryAuthority = authority.mode === "postgres-primary";
  const details = consistencyDetails(
    snapshot.serialized,
    projection.serialized,
    snapshot.domains || {},
    projection.item,
    {
    snapshotVersion: snapshot.snapshotVersion,
    postgresRevision: projection.revision,
    snapshotState: snapshot.state,
    primaryAuthority,
    stability,
    },
  );
  const projectionMatches = projection.serialized === snapshot.serialized;
  const matches = stability === "verified" && projectionMatches && details.reconciliation.matches;
  const readEligible = details.reconciliation?.promotion?.readEligible === true;
  const reason = primaryAuthority
    ? (readEligible
      ? "postgres_primary_snapshot_retired"
      : `postgres_primary_snapshot_${snapshot.state || "missing"}_unexpected`)
    : (snapshot.state === "retired" ? "snapshot_retired"
      : snapshot.state === "missing" ? "snapshot_missing"
        : snapshot.state === "invalid" ? "snapshot_invalid"
          : matches ? "" : (projectionMatches ? "source_changed" : "projection_diff"));
  return {
    ok: true,
    matches,
    reason,
    details: {
      ...details,
      authority: {
        mode: authority.mode,
        transitionId: authority.transitionId,
        proofPostgresRevision: authority.proofPostgresRevision,
        activatedAt: authority.activatedAt,
      },
    },
    revision: projection.revision,
    snapshotVersion: snapshot.snapshotVersion,
  };
}

// This private candidate includes the authoritative values and is intended
// only for an explicit, root-controlled PostgreSQL -> snapshot promotion.
// Public API endpoints must use inspectSystemDomainsSnapshotConsistency()
// below, which never exposes it.
export async function inspectSystemDomainsSnapshotPromotionCandidate({
  primary,
  env = process.env,
  filePath = "",
  readSnapshot = readSharedStateSnapshot,
} = {}) {
  if (!primary?.get) throw new Error("System Domains consistency check requires a primary repository");
  const first = await readConsistencyObservation({ primary, env, filePath, readSnapshot });
  const second = await readConsistencyObservation({ primary, env, filePath, readSnapshot });
  return {
    consistency: buildSystemDomainsSnapshotConsistency({ first, second }),
    candidate: {
      postgres: second.primary,
      snapshot: second.snapshot,
      authority: second.authority,
    },
  };
}

export async function inspectSystemDomainsSnapshotConsistency(options = {}) {
  return (await inspectSystemDomainsSnapshotPromotionCandidate(options)).consistency;
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
      const authority = primary.getAuthority
        ? await primary.getAuthority()
        : { mode: "compatibility-snapshot" };
      // Once the root-controlled cutover is active, PostgreSQL is the sole
      // writer.  Do not let an outbox retry recreate or refresh the retired
      // browser snapshot.  During the short pending phase leave the job open:
      // the transition script either finalizes it or aborts back to the safe
      // compatibility mode.
      if (authority?.mode === "transition-pending") {
        await primary.markSnapshotSync(job.id, { state: "pending", error: "System Domains PostgreSQL-primary transition is pending" });
        result.jobs.push({ id: job.id, state: "pending", authorityTransition: true });
        continue;
      }
      if (authority?.mode === "postgres-primary") {
        const currentSnapshot = await readSharedStateSnapshot({ env, filePath });
        const retired = currentSnapshot?.snapshot?.values?.[SYSTEM_DOMAINS_STORAGE_KEY] === null
          && Object.prototype.hasOwnProperty.call(currentSnapshot?.snapshot?.values || {}, SYSTEM_DOMAINS_STORAGE_KEY);
        if (!retired) {
          await primary.markSnapshotSync(job.id, { state: "pending", error: "PostgreSQL-primary System Domains requires the retired compatibility snapshot tombstone" });
          result.failed += 1;
          result.jobs.push({ id: job.id, state: "pending", postgresPrimary: true, snapshotTombstoneMissing: true });
          continue;
        }
        await primary.markSnapshotSync(job.id, { state: "applied" });
        result.applied += 1;
        result.jobs.push({ id: job.id, state: "applied", postgresPrimary: true });
        continue;
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
