import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { inspectSystemDomainsSnapshotConsistency, inspectSystemDomainsSnapshotPromotionCandidate, syncPendingSystemDomainsSnapshotChanges } from "./domain-system-domains-snapshot-sync.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const directory = await mkdtemp(join(tmpdir(), "mes-system-domains-sync-"));
const filePath = join(directory, "shared-state.json");
const domains = { schemaId: "mes.system-domains", schemaVersion: 1, metadata: {}, registries: { orgUnits: [], workCenters: [], positions: [], employees: [], employmentAssignments: [], equipment: [], scheduleTemplates: [], scheduleAssignments: [], attendanceEvents: [], accessRoles: [], grants: [], roleAssignments: [], responsibilityPolicies: [] } };
const marked = [];
try {
  await writeFile(filePath, JSON.stringify({ version: 4, values: { "mes-planning-prototype-state-v2": "{}", "mes-planning-prototype-directories-v2": "{}" } }), "utf8");
  const primary = {
    async listPendingSnapshotSyncs() { return [{ id: 11, aggregateRevision: 3 }]; },
    async get() { return { revision: 3, item: domains }; },
    async markSnapshotSync(id, value) { marked.push({ id, ...value }); },
  };
  const result = await syncPendingSystemDomainsSnapshotChanges({ primary, filePath });
  const snapshot = JSON.parse(await readFile(filePath, "utf8"));
  assert(result.applied === 1 && result.failed === 0, "authoritative projection must be delivered once");
  assert(marked[0]?.state === "applied", "outbox row must close after snapshot write");
  assert(snapshot.version === 5 && String(snapshot.values[SYSTEM_DOMAINS_STORAGE_KEY]).includes("mes.system-domains"), "snapshot must receive only the canonical System Domains projection");

  await writeFile(filePath, JSON.stringify({
    version: 6,
    values: {
      ...snapshot.values,
      [SYSTEM_DOMAINS_STORAGE_KEY]: null,
    },
  }), "utf8");
  const retiredMarks = [];
  const retiredResult = await syncPendingSystemDomainsSnapshotChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 12, aggregateRevision: 3 }]; },
      async get() { return { revision: 3, item: domains }; },
      async markSnapshotSync(id, value) { retiredMarks.push({ id, ...value }); },
    },
    filePath,
  });
  const retiredSnapshot = JSON.parse(await readFile(filePath, "utf8"));
  assert(retiredResult.applied === 1 && retiredResult.jobs[0]?.snapshotRetired === true, "a retired System Domains snapshot must close the outbox without being revived");
  assert(retiredMarks[0]?.state === "applied" && retiredSnapshot.version === 6 && retiredSnapshot.values[SYSTEM_DOMAINS_STORAGE_KEY] === null, "the explicit tombstone must survive a later server outbox retry");

  const primaryMarks = [];
  const primaryResult = await syncPendingSystemDomainsSnapshotChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 13, aggregateRevision: 3 }]; },
      async get() { return { revision: 3, item: domains }; },
      async getAuthority() { return { mode: "postgres-primary" }; },
      async markSnapshotSync(id, value) { primaryMarks.push({ id, ...value }); },
    },
    filePath,
  });
  assert(primaryResult.applied === 1 && primaryResult.jobs[0]?.postgresPrimary === true && primaryMarks[0]?.state === "applied", "a PostgreSQL-primary outbox may close only while its tombstone is still present");

  await writeFile(filePath, JSON.stringify({ version: 7, values: { ...retiredSnapshot.values, [SYSTEM_DOMAINS_STORAGE_KEY]: JSON.stringify(domains) } }), "utf8");
  const revivedMarks = [];
  const revivedResult = await syncPendingSystemDomainsSnapshotChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 14, aggregateRevision: 3 }]; },
      async get() { return { revision: 3, item: domains }; },
      async getAuthority() { return { mode: "postgres-primary" }; },
      async markSnapshotSync(id, value) { revivedMarks.push({ id, ...value }); },
    },
    filePath,
  });
  assert(revivedResult.failed === 1 && revivedResult.jobs[0]?.snapshotTombstoneMissing === true && revivedMarks[0]?.state === "pending", "a reappeared snapshot must block PostgreSQL-primary outbox completion rather than being silently accepted");
  await writeFile(filePath, JSON.stringify({ version: 8, values: { ...retiredSnapshot.values, [SYSTEM_DOMAINS_STORAGE_KEY]: null } }), "utf8");

  const makeSnapshot = (version, value = domains) => ({
    snapshot: { version, values: { [SYSTEM_DOMAINS_STORAGE_KEY]: JSON.stringify(value) } },
  });
  const stableConsistency = await inspectSystemDomainsSnapshotConsistency({
    primary: { async get() { return { revision: 3, item: domains }; } },
    readSnapshot: async () => makeSnapshot(7),
  });
  assert(stableConsistency.matches && stableConsistency.details?.reconciliation?.comparison?.stable === true, "only two identical System Domains reads may prove parity");
  assert(!Object.prototype.hasOwnProperty.call(stableConsistency, "candidate"), "Public consistency output must never expose the private promotion candidate");
  const privateCandidate = await inspectSystemDomainsSnapshotPromotionCandidate({
    primary: { async get() { return { revision: 3, item: domains }; } },
    readSnapshot: async () => makeSnapshot(7),
  });
  assert(privateCandidate.candidate?.snapshot?.rawSnapshot?.version === 7, "The root-only promotion path must receive the stable raw snapshot for CAS proof");

  let snapshotReads = 0;
  const changingSnapshotConsistency = await inspectSystemDomainsSnapshotConsistency({
    primary: { async get() { return { revision: 3, item: domains }; } },
    readSnapshot: async () => makeSnapshot(snapshotReads++ === 0 ? 8 : 9),
  });
  assert(!changingSnapshotConsistency.matches && changingSnapshotConsistency.reason === "source_changed" && changingSnapshotConsistency.details?.reconciliation?.promotion?.readEligible === false, "a compatibility snapshot change during proof must block command authority");

  let projectionReads = 0;
  const changingProjectionConsistency = await inspectSystemDomainsSnapshotConsistency({
    primary: { async get() { return { revision: projectionReads++ === 0 ? 3 : 4, item: domains }; } },
    readSnapshot: async () => makeSnapshot(10),
  });
  assert(!changingProjectionConsistency.matches && changingProjectionConsistency.reason === "source_changed", "a PostgreSQL revision change during proof must block command authority");

  const divergentDomains = structuredClone(domains);
  divergentDomains.registries.attendanceEvents.push({ id: "attendance-hidden", comment: "must-not-leak" });
  const divergentConsistency = await inspectSystemDomainsSnapshotConsistency({
    primary: { async get() { return { revision: 4, item: divergentDomains }; } },
    readSnapshot: async () => makeSnapshot(11),
  });
  assert(!divergentConsistency.matches && divergentConsistency.reason === "projection_diff" && !JSON.stringify(divergentConsistency.details).includes("must-not-leak"), "a reconciliation diagnostic must block mismatches without leaking domain values");
  console.log("System Domains snapshot sync QA: OK");
} finally { await rm(directory, { recursive: true, force: true }); }
