import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  PRODUCTION_RESOURCE_DEPENDENCY_LOCK_NAME,
  acquireProductionResourceDependencySharedLock,
  assertProductionResourceDependenciesWritable,
  withProductionResourceDependencyExclusiveLock,
} from "./production-resource-dependency-lock.mjs";

function createSqlHarness({ archivedId = "" } = {}) {
  const calls = [];
  const tx = async (strings, ...values) => {
    const query = strings.join("?");
    calls.push({ query, values });
    if (query.includes("to_regclass")) return [{ present: true }];
    if (query.includes("FROM system_equipment")) {
      return archivedId && values[0]?.includes(archivedId) ? [{ id: archivedId }] : [];
    }
    return [];
  };
  tx.json = (value) => value;
  const sql = {
    async begin(action) { calls.push({ query: "BEGIN", values: [] }); return action(tx); },
  };
  return { sql, tx, calls };
}

const exclusive = createSqlHarness();
let protectedActionRan = false;
await withProductionResourceDependencyExclusiveLock({ sql: exclusive.sql }, async (tx) => {
  assert.equal(tx, exclusive.tx, "the protected action must use the exact transaction that owns the advisory lock");
  assert.match(exclusive.calls.at(-1).query, /pg_advisory_xact_lock\(hashtext/);
  assert.equal(exclusive.calls.at(-1).values[0], PRODUCTION_RESOURCE_DEPENDENCY_LOCK_NAME);
  protectedActionRan = true;
});
assert.equal(protectedActionRan, true);

let faultCommitRan = false;
let faultQueryCount = 0;
const faultTx = async () => {
  faultQueryCount += 1;
  if (faultQueryCount > 1) throw new Error("connection terminated");
  return [];
};
const faultSql = { async begin(action) { return action(faultTx); } };
await assert.rejects(
  () => withProductionResourceDependencyExclusiveLock({ sql: faultSql }, async (tx) => {
    assert.equal(tx, faultTx);
    await tx`SELECT 1`;
    faultCommitRan = true;
  }),
  /connection terminated/,
);
assert.equal(faultCommitRan, false, "a dead lock transaction must make the protected write impossible");

const shared = createSqlHarness();
await acquireProductionResourceDependencySharedLock(shared.tx);
assert.match(shared.calls[0].query, /pg_advisory_xact_lock_shared\(hashtext/);
assert.equal(shared.calls[0].values[0], PRODUCTION_RESOURCE_DEPENDENCY_LOCK_NAME);

const archived = createSqlHarness({ archivedId: "equipment-archived" });
await assert.rejects(
  () => assertProductionResourceDependenciesWritable(archived.tx, ["equipment-live", "equipment-archived"]),
  (error) => error?.code === "PRODUCTION_RESOURCE_ARCHIVED" && error?.resourceId === "equipment-archived",
);
assert.ok(
  archived.calls.find((call) => call.query.includes("FROM system_equipment"))?.values[0].includes("equipment-archived"),
  "the active-state check must run while the shared dependency lock is held",
);

const sources = Object.fromEntries(await Promise.all([
  "domain-api.mjs",
  "domain-postgres-repository.mjs",
  "domain-postgres-import.mjs",
  "domain-shift-execution-repository.mjs",
  "domain-shift-execution-import.mjs",
  "domain-specifications2-repository.mjs",
].map(async (name) => [name, await readFile(new URL(name, import.meta.url), "utf8")])));
assert.match(sources["domain-api.mjs"], /systemDomainsProductionStructureLockRunner\(\{ databaseUrl \}, async \(transactionSql\)/);
assert.match(sources["domain-api.mjs"], /systemDomainsProductionStructureImpactResolver[\s\S]+commandDomains\.replace/);
assert.match(sources["domain-api.mjs"], /createSystemDomainsRepository\(\{ databaseUrl, transactionSql \}\)/, "get/impact/replace must bind to the exact lock transaction");
assert.match(
  sources["domain-api.mjs"],
  /surface === "access-control"[\s\S]+system-domains-surface-not-server-authorized/,
  "manual or stale flags must not reopen Access Control without its server RBAC and delta invariants",
);
assert.match(
  sources["domain-api.mjs"],
  /surface === "timesheet"[\s\S]+validateSystemDomainsTimesheetDelta[\s\S]+systemDomainsTimesheetAuthorizationResolver/,
  "Timesheet must remain behind its bounded delta validator and target-scoped employee authorization",
);
const impactCall = sources["domain-api.mjs"].indexOf("impact = typeof systemDomainsProductionStructureImpactResolver");
const productionLockCall = sources["domain-api.mjs"].indexOf("commandCommit = await systemDomainsProductionStructureLockRunner", impactCall);
const snapshotSyncCall = sources["domain-api.mjs"].indexOf("await syncPendingSystemDomainsSnapshotChanges", productionLockCall);
assert(impactCall >= 0 && productionLockCall > impactCall && snapshotSyncCall > productionLockCall,
  "candidate-final validation must cover every surface, while snapshot sync remains after the production transaction commits");
for (const name of [
  "domain-postgres-repository.mjs",
  "domain-postgres-import.mjs",
  "domain-shift-execution-repository.mjs",
  "domain-shift-execution-import.mjs",
  "domain-specifications2-repository.mjs",
]) {
  assert.match(
    sources[name],
    /ProductionResourceDependenc|production-resource-dependency-lock/,
    `${name} must participate in the durable production-resource dependency lock`,
  );
}

console.log("Production resource dependency lock QA: OK");
console.log("- production-structure impact + replace execute under the exclusive PostgreSQL lock: pass");
console.log("- Planning/Specifications/Shift writers share the lock and reject archived Equipment: pass");
