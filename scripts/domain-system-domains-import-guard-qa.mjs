import { inspectSystemDomainsSnapshotImportGuard } from "../src/modules/system_domains/snapshot_import_guard.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assert = (value, message) => { if (!value) throw new Error(message); };

assert(inspectSystemDomainsSnapshotImportGuard().mode === "initial-import", "An empty PostgreSQL projection must allow the initial bootstrap import.");
assert(inspectSystemDomainsSnapshotImportGuard({ existingItem: { id: "primary" }, alreadyMatches: true }).mode === "idempotent-import", "A matching projection must remain safely repeatable.");
assert(!inspectSystemDomainsSnapshotImportGuard({ existingItem: { id: "primary" } }).allowed, "A divergent initialized projection must never be replaced by default.");
assert(!inspectSystemDomainsSnapshotImportGuard({ existingItem: { id: "primary" }, force: true }).allowed, "--force alone must not authorize a destructive compatibility replacement.");
assert(inspectSystemDomainsSnapshotImportGuard({ existingItem: { id: "primary" }, force: true, emergencyEnabled: true }).mode === "emergency-replace", "The destructive path must require both explicit force and the emergency environment gate.");

const importerSource = await readFile(fileURLToPath(new URL("./domain-system-domains-import.mjs", import.meta.url)), "utf8");
const repositorySource = await readFile(fileURLToPath(new URL("./domain-system-domains-repository.mjs", import.meta.url)), "utf8");
assert(importerSource.includes("snapshotImport: true"), "The CLI importer must request the transactional snapshot-import guard.");
assert(importerSource.includes("emergencySnapshotReplace"), "The CLI importer must pass the explicit emergency environment gate.");
assert(repositorySource.includes("pg_advisory_xact_lock"), "Snapshot replacement must serialize with concurrent System Domains writes.");
assert(repositorySource.includes("SYSTEM_DOMAINS_SNAPSHOT_REPLACE_BLOCKED"), "A divergent persisted projection must fail before DELETE statements run.");
assert(repositorySource.indexOf("SYSTEM_DOMAINS_SNAPSHOT_REPLACE_BLOCKED") < repositorySource.indexOf("DELETE FROM system_responsibility_targets"), "The transactional snapshot guard must run before destructive deletes.");

console.log("System Domains snapshot import guard QA: OK");
