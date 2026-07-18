import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(fileURLToPath(new URL("./domain-specifications2-repository.mjs", import.meta.url)), "utf-8");
if (!source.includes("const READ_CLIENTS_BY_URL = new Map()") || !source.includes("function getReadClient(databaseUrl)") || !source.includes("closeSpecifications2ReadClients()")) {
  throw new Error("Specifications 2.0 read repository must reuse a process-level PostgreSQL pool");
}
if (!source.includes("const sql = getReadClient(databaseUrl)") || !source.includes("async close() {}")) {
  throw new Error("Specifications 2.0 request facades must not close the shared PostgreSQL client");
}
if (!source.includes("importSpecifications2ExportRows") || !source.includes("await sql.begin(async (tx) =>") || !source.includes("snapshot_sync_state") || !source.includes("'pending'")) {
  throw new Error("Server-first publication must commit immutable revision and compatibility outbox in one PostgreSQL transaction");
}
if (!source.includes("async commandReadiness()") || !source.includes("specifications2_route_operations")) {
  throw new Error("Publication command capability must check its own PostgreSQL schema before advertising readiness");
}
if (!source.includes("lockSpecifications2SourceEntries(tx, [sourceEntryId])")
  || !source.includes("latestRevisionNo !== expectedRevision")
  || !source.includes("buildAuthoritativePublicationEntry(entry, { revisionNo, releasedAt })")
  || !source.includes("conflict: true")) {
  throw new Error("Server-first publication must allocate revisions under a per-source transaction lock and reject stale client revision collisions");
}
if (!source.includes("WHERE specification_id = ${specificationId} AND fingerprint = ${candidateRevision.fingerprint}")
  || !source.includes("const compatibilityEntry = compatibilityPublicationEntry(authoritativeEntry, revision)")) {
  throw new Error("Server-first publication retries must resolve the same immutable fingerprint without rewriting its compatibility projection");
}
console.log("Specifications 2.0 repository pooling QA: OK");
