import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { syncPendingSystemDomainsSnapshotChanges } from "./domain-system-domains-snapshot-sync.mjs";

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
  console.log("System Domains snapshot sync QA: OK");
} finally { await rm(directory, { recursive: true, force: true }); }
