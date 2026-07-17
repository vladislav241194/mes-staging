import { createWorkOrdersRepository } from "./domain-repositories.mjs";
import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";

function readLimit(argv = []) {
  const index = argv.indexOf("--limit");
  const value = index >= 0 ? Number(argv[index + 1]) : 50;
  return Math.max(1, Math.min(100, Number.isInteger(value) ? value : 50));
}

export async function runDomainSnapshotSync({ env = process.env, limit = 50 } = {}) {
  const primary = await createWorkOrdersRepository({ env });
  const health = await primary.health();
  if (health.storageBackend !== "postgresql") {
    throw new Error("Snapshot outbox runner requires MES_DOMAIN_STORAGE=postgres");
  }
  const snapshot = await createWorkOrdersRepository({ env: { ...env, MES_DOMAIN_STORAGE: "snapshot" } });
  return syncPendingSnapshotChanges({ primary, snapshot, limit });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runDomainSnapshotSync({ limit: readLimit(process.argv.slice(2)) });
  console.log(`Domain snapshot sync: ${result.applied} applied, ${result.conflicts} conflicts, ${result.failed} deferred`);
  if (result.failed) process.exitCode = 1;
}
