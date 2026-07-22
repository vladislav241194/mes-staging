import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildAuthoritativePublicationEntry,
  buildSpecifications2PublicationRequestFingerprint,
  buildSpecifications2WorkOrderAggregateIdentity,
  buildSpecifications2WorkOrderRequestFingerprint,
  decideSpecifications2WorkOrderRequest,
  decideSpecifications2PublicationRequest,
  isSpecifications2RevisionIdentityReady,
  normalizeSpecifications2GuardTriggerDefinition,
  resolveSpecifications2CommandSchemaReadiness,
  resolveSpecifications2RevisionReadIdentity,
  SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256,
  SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS,
} from "./domain-specifications2-repository.mjs";
import { buildSpecifications2WorkOrderCommand } from "../src/domain/specifications2_work_order.js";
import { buildSpecifications2ReleaseFingerprint } from "../src/modules/specifications2/publication.js";
import { parseAndValidateSpecifications2CommandMarker } from "./release-specifications2-command-contract.mjs";

const source = await readFile(fileURLToPath(new URL("./domain-specifications2-repository.mjs", import.meta.url)), "utf-8");
const workOrderBuilderSource = await readFile(fileURLToPath(new URL("../src/domain/specifications2_work_order.js", import.meta.url)), "utf-8");
const migration = await readFile(fileURLToPath(new URL("../db/migrations/028_specifications2_publication_idempotency.sql", import.meta.url)), "utf-8");
const revisionIdentityMigration = await readFile(fileURLToPath(new URL("../db/migrations/029_specifications2_revision_identity_backfill.sql", import.meta.url)), "utf-8");
const legacyRevisionGuardMigration = await readFile(fileURLToPath(new URL("../db/migrations/030_specifications2_legacy_revision_identity_guard.sql", import.meta.url)), "utf-8");
const guardFunctionRepairMigration = await readFile(fileURLToPath(new URL("../db/migrations/031_specifications2_guard_function_repair.sql", import.meta.url)), "utf-8");
const migrationRunner = await readFile(fileURLToPath(new URL("./domain-postgres-migrate.mjs", import.meta.url)), "utf-8");
const preflightPolicy = await readFile(fileURLToPath(new URL("./domain-postgres-preflight-policy.mjs", import.meta.url)), "utf-8");
const commandCompatibilityMarkerSource = await readFile(fileURLToPath(new URL("../ops/postgres/specifications2-server-command-compatibility.json", import.meta.url)), "utf-8");
const commandCompatibilityMarker = parseAndValidateSpecifications2CommandMarker(commandCompatibilityMarkerSource);
assert.equal(commandCompatibilityMarker.workOrderAggregateIdentityVersion, 1,
  "the release marker must version-bind the server-derived Work Order aggregate identity contract");
assert.throws(() => parseAndValidateSpecifications2CommandMarker({
  ...commandCompatibilityMarker,
  workOrderAggregateIdentityVersion: undefined,
}), /marker is invalid/u, "a release that can still derive 32-bit Work Order ids must not be command-compatible");
if (!source.includes("const READ_CLIENTS_BY_URL = new Map()") || !source.includes("function getReadClient(databaseUrl)") || !source.includes("closeSpecifications2ReadClients()")) {
  throw new Error("Specifications 2.0 read repository must reuse a process-level PostgreSQL pool");
}
if (!source.includes("const sql = getReadClient(databaseUrl)") || !source.includes("async close() {}")) {
  throw new Error("Specifications 2.0 request facades must not close the shared PostgreSQL client");
}
if (!source.includes("importSpecifications2ExportRows") || !source.includes("await sql.begin(async (tx) =>") || !source.includes("snapshot_sync_state") || !source.includes("'pending'")) {
  throw new Error("Server-first publication must commit immutable revision and compatibility outbox in one PostgreSQL transaction");
}
if (!source.includes("async commandReadiness()") || !source.includes("specifications2_route_operations")
    || !source.includes("specifications2_publication_requests") || !source.includes("revision_identity_columns")
    || !source.includes("legacy_revision_identity_guard_applied")
    || !source.includes("guard_function_repair_applied")
    || !source.includes("legacy_revision_identity_function_exact")
    || !source.includes("work_order_revision_identity_function_exact")
    || !source.includes("publication_outbox_v6_function_exact")
    || !source.includes("pg_get_triggerdef")
    || !source.includes("to_regprocedure")
    || !source.includes("sha256(convert_to(function_definition.prosrc, 'UTF8'))")
    || !source.includes("tgenabled IN ('O', 'A')")
    || !source.includes("specifications2_capture_legacy_revision_identity_trigger")
    || !source.includes("specifications2_verify_work_order_revision_identity_trigger")
    || !source.includes("specifications2_verify_work_order_request_fingerprint_trigger")
    || !source.includes("specifications2_require_v6_publication_outbox_trigger")) {
  throw new Error("Publication command capability must check its own PostgreSQL schema before advertising readiness");
}
[
  "= ${SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256.legacyRevisionIdentity}::text",
  "= ${SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256.workOrderRevisionIdentity}::text",
  "= ${SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256.publicationOutboxV6}::text",
].forEach((fragment) => assert.ok(source.includes(fragment),
  `guard hash must be a typed postgres.js parameter instead of a quoted placeholder: ${fragment}`));
assert.doesNotMatch(source, /= '\$\{SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256\./u,
  "a postgres.js interpolation inside SQL quotes becomes an untyped $n placeholder at runtime");
if (!source.includes("lockSpecifications2SourceEntries(tx, [sourceEntryId])")
  || !source.includes("decideSpecifications2PublicationRequest({")
  || !source.includes("buildAuthoritativePublicationEntry(entry, { revisionNo, releasedAt })")
  || !source.includes("conflict: true")) {
  throw new Error("Server-first publication must allocate revisions under a per-source transaction lock and reject stale client revision collisions");
}
const publishMethodIndex = source.indexOf("async publish({ entry, expectedPreviousRevision, idempotencyKey, actorId = \"\" })");
const rawBoundIndex = source.indexOf("validateSpecifications2RawPublicationStructure(entry);", publishMethodIndex);
const publicationInspectionIndex = source.indexOf("inspectSpecifications2Publication(entry)", publishMethodIndex);
assert.ok(publishMethodIndex >= 0 && publishMethodIndex < rawBoundIndex && rawBoundIndex < publicationInspectionIndex,
  "raw structural limits must run before any publication inspection/fingerprint recursion");
if (source.includes("WHERE specification_id = ${specificationId} AND fingerprint = ${candidateRevision.fingerprint}")) {
  throw new Error("Publication must not deduplicate against a historical content fingerprint");
}
if (!source.includes("SELECT pg_advisory_xact_lock(hashtext(${`specifications2:publication-request:")
  || !source.includes("INSERT INTO specifications2_publication_requests")
  || !source.includes("request_fingerprint")
  || !source.includes("idempotencyConflict: true")
  || !source.includes("superseded: true")
  || !source.includes("const compatibilityEntry = buildSpecifications2CompatibilityPublicationEntry(authoritativeEntry, revision)")) {
  throw new Error("Publication retries must be bound to an exact request and only replay the current compatible revision");
}
const requestKeyLockIndex = source.indexOf("await tx`SELECT pg_advisory_xact_lock(hashtext(${`specifications2:publication-request:");
const sourceLockIndex = source.indexOf("await lockSpecifications2SourceEntries(tx, [sourceEntryId])", requestKeyLockIndex);
const priorRequestRowLockIndex = source.indexOf("const [priorRequest] = await tx`", requestKeyLockIndex);
const documentRowLockIndex = source.indexOf("const documents = await tx`", requestKeyLockIndex);
const latestRevisionRowLockIndex = source.indexOf("const [latest] = await tx`", requestKeyLockIndex);
assert.ok(requestKeyLockIndex >= 0
  && requestKeyLockIndex < sourceLockIndex
  && sourceLockIndex < priorRequestRowLockIndex
  && priorRequestRowLockIndex < documentRowLockIndex
  && documentRowLockIndex < latestRevisionRowLockIndex,
"publication lock order must be request-key advisory -> source advisory -> request/document/latest row locks");
assert.doesNotMatch(source.slice(requestKeyLockIndex, sourceLockIndex), /FOR UPDATE/u,
  "no PostgreSQL row lock may be taken before the source advisory lock");

// Reproduce the old two-key/same-source wait graph. The replay held revision 1
// and waited for source S, while the new command held source S and waited for
// revision 1. With source acquired before rows, the replay owns S before it can
// own revision 1, so the second edge cannot be formed.
const hasTwoTransactionWaitCycle = ({ leftHeld, leftWait, rightHeld, rightWait }) => (
  rightHeld.has(leftWait) && leftHeld.has(rightWait)
);
assert.equal(hasTwoTransactionWaitCycle({
  leftHeld: new Set(["request-key:A", "revision:1"]),
  leftWait: "source:S",
  rightHeld: new Set(["request-key:B", "source:S"]),
  rightWait: "revision:1",
}), true, "QA reproduction must retain the historical deadlock interleaving");
assert.equal(hasTwoTransactionWaitCycle({
  leftHeld: new Set(["request-key:A", "source:S", "revision:1"]),
  leftWait: "",
  rightHeld: new Set(["request-key:B"]),
  rightWait: "source:S",
}), false, "canonical source-before-row ordering must eliminate the reproduced wait cycle");
if (!source.includes("buildSpecifications2CompatibilityPayloadDigest")
  || !source.includes("const compatibilityPayloadDigest = buildSpecifications2CompatibilityPayloadDigest(compatibilityEntry)")
  || !source.includes("compatibilityPayloadDigest,")) {
  throw new Error("Every new Specifications 2.0 outbox row must bind its complete normalized compatibility payload");
}
[
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL statement_timeout = '2min'",
  "DROP CONSTRAINT IF EXISTS specifications2_revisions_specification_id_fingerprint_key",
  "CREATE INDEX IF NOT EXISTS specifications2_revisions_document_fingerprint_idx",
  "CREATE TABLE IF NOT EXISTS specifications2_publication_requests",
  "idempotency_key TEXT PRIMARY KEY",
  "request_fingerprint TEXT NOT NULL",
  "expected_previous_revision INTEGER NOT NULL",
  "resulting_revision_id TEXT NOT NULL UNIQUE",
  "VALUES ('028_specifications2_publication_idempotency')",
].forEach((fragment) => assert.ok(migration.includes(fragment), `Specifications 2.0 publication-idempotency migration is missing: ${fragment}`));
const migrationLockTimeoutIndex = migration.indexOf("SET LOCAL lock_timeout = '5s'");
const migrationStatementTimeoutIndex = migration.indexOf("SET LOCAL statement_timeout = '2min'");
const replacementIndexIndex = migration.indexOf("CREATE INDEX IF NOT EXISTS specifications2_revisions_document_fingerprint_idx");
const requestLedgerIndex = migration.indexOf("CREATE TABLE IF NOT EXISTS specifications2_publication_requests");
const uniqueConstraintDropIndex = migration.indexOf("DROP CONSTRAINT IF EXISTS specifications2_revisions_specification_id_fingerprint_key");
const migrationMarkerIndex = migration.indexOf("INSERT INTO mes_schema_migrations(version)");
const migrationGuardIndex = migration.indexOf("IF NOT EXISTS (");
const migrationGuardEndIndex = migration.lastIndexOf("END IF;");
assert.ok(migrationLockTimeoutIndex >= 0
  && migrationLockTimeoutIndex < migrationStatementTimeoutIndex
  && migrationStatementTimeoutIndex < migrationGuardIndex
  && migrationGuardIndex < replacementIndexIndex
  && migrationStatementTimeoutIndex < replacementIndexIndex
  && replacementIndexIndex < requestLedgerIndex
  && requestLedgerIndex < uniqueConstraintDropIndex
  && uniqueConstraintDropIndex < migrationMarkerIndex
  && migrationMarkerIndex < migrationGuardEndIndex,
"migration 028 must guard an atomic first run, complete long index/table work first, and take ACCESS EXCLUSIVE only immediately before its marker");
assert.match(migration.slice(migrationGuardIndex, replacementIndexIndex), /mes_schema_migrations[\s\S]+028_specifications2_publication_idempotency/u,
  "migration 028 must check its committed marker before executing any DDL on every runner restart");
assert.doesNotMatch(migration, /DROP\s+(TABLE|DATABASE|SCHEMA)/iu, "publication-idempotency migration must preserve every data container");
assert.doesNotMatch(migration, /^\s*(?:BEGIN|COMMIT);/imu,
  "migration 028 must not nest transaction control inside the runner-owned transaction");
assert.match(migrationRunner, /await sql\.begin\(async \(tx\) => tx\.unsafe\(source\)\)/u,
  "the PostgreSQL migration runner must atomically own migration 028");
assert.match(preflightPolicy, /MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS/,
  "publication command preflight must require its idempotency migration only when that command surface is enabled");
[
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL statement_timeout = '2min'",
  "LEFT JOIN revision_roots",
  "revision.source_payload ->> 'revisionTitle'",
  "revision.source_payload ->> 'revisionDesignation'",
  "root.derived_title",
  "root.derived_designation",
  "'legacy-derived'",
  "'legacy-unverified'",
  "VALUES ('029_specifications2_revision_identity_backfill')",
].forEach((fragment) => assert.ok(revisionIdentityMigration.includes(fragment), `Specifications 2.0 revision-identity migration is missing: ${fragment}`));
const revisionIdentityGuardIndex = revisionIdentityMigration.indexOf("IF NOT EXISTS (");
const revisionIdentityUpdateIndex = revisionIdentityMigration.indexOf("UPDATE specifications2_revisions revision");
const revisionIdentityMarkerIndex = revisionIdentityMigration.indexOf("INSERT INTO mes_schema_migrations(version)");
const revisionIdentityGuardEndIndex = revisionIdentityMigration.lastIndexOf("END IF;");
assert.ok(revisionIdentityGuardIndex >= 0
  && revisionIdentityGuardIndex < revisionIdentityUpdateIndex
  && revisionIdentityUpdateIndex < revisionIdentityMarkerIndex
  && revisionIdentityMarkerIndex < revisionIdentityGuardEndIndex,
"migration 029 must skip its historical scan/update entirely after its marker is committed");
assert.match(revisionIdentityMigration.slice(revisionIdentityGuardIndex, revisionIdentityUpdateIndex), /mes_schema_migrations[\s\S]+029_specifications2_revision_identity_backfill/u,
  "migration 029 must check its committed marker before producing repeat-run MVCC updates");
assert.doesNotMatch(revisionIdentityMigration, /specifications2_documents/iu,
  "historical revision identity must never be copied from mutable current document metadata");
assert.doesNotMatch(revisionIdentityMigration, /^\s*(?:BEGIN|COMMIT);/imu,
  "migration 029 must not nest transaction control inside the runner-owned transaction");
assert.match(preflightPolicy, /SPECIFICATIONS2_REVISION_IDENTITY_BACKFILL_MIGRATION/u,
  "publication preflight must require revision identity backfill before enabling writes");

[
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL statement_timeout = '2min'",
  "WHERE version = '030_specifications2_legacy_revision_identity_guard'",
  "specifications2_capture_legacy_revision_identity",
  "AFTER INSERT ON public.specifications2_revision_items",
  "WHEN (NEW.parent_source_row_id = '')",
  "revision.revision_identity_state = 'legacy-unverified'",
  "revision_identity_state = 'legacy-derived'",
  "specifications2_verify_work_order_revision_identity",
  "BEFORE INSERT ON public.specifications2_work_order_sources",
  "revision.revision_identity_state IN ('authoritative', 'legacy-derived')",
  "route_name_known",
  "route_designation_known",
  "NOT COALESCE(identity_verified, false)",
  "Specifications 2.0 work order identity differs from its immutable revision/route",
  "specifications2_require_v6_publication_outbox",
  "BEFORE INSERT OR UPDATE OF payload, aggregate_type, command_type",
  "NEW.aggregate_type = 'specifications2_revision'",
  "NEW.command_type = 'publish_revision'",
  "compatibilityPayloadDigest",
  "^sha256:[0-9a-f]{64}$",
  "adapterVersion",
  "<> 6",
  "VALUES ('030_specifications2_legacy_revision_identity_guard')",
  "ADD COLUMN IF NOT EXISTS request_fingerprint TEXT",
  "ADD COLUMN IF NOT EXISTS request_quantity NUMERIC(14, 3)",
  "ADD COLUMN IF NOT EXISTS request_actor_scope TEXT",
  "specifications2_work_order_request_contract_check",
  "DROP CONSTRAINT IF EXISTS specifications2_work_order_so_specification_revision_id_rou_key",
  "Specifications 2.0 route-only idempotency constraint remains after actor-scope migration",
  "specifications2_work_order_actor_idempotency_uidx",
  "ON public.specifications2_work_order_sources (request_actor_scope, idempotency_key)",
  "WHERE request_actor_scope IS NOT NULL",
  "specifications2_verify_work_order_request_fingerprint",
  "Specifications 2.0 Work Order requires an exact request fingerprint, quantity and actor scope",
  "Specifications 2.0 Work Order request quantity differs from the atomically persisted order",
  "CREATE TRIGGER specifications2_verify_work_order_request_fingerprint_trigger",
  "BEFORE INSERT OR UPDATE ON public.specifications2_work_order_sources",
].forEach((fragment) => assert.ok(legacyRevisionGuardMigration.includes(fragment), `Specifications 2.0 legacy-revision guard migration is missing: ${fragment}`));
assert.doesNotMatch(legacyRevisionGuardMigration, /specifications2_documents/iu,
  "legacy rollback identity capture must never consult mutable document metadata");
assert.doesNotMatch(legacyRevisionGuardMigration, /UPDATE OF[^\n]+snapshot_sync_state/iu,
  "ordinary snapshot-sync state updates must not revalidate historical outbox payloads");
assert.doesNotMatch(legacyRevisionGuardMigration, /^\s*(?:BEGIN|COMMIT);/imu,
  "migration 030 must remain inside the runner-owned transaction");
const legacyGuardMarkerCheckIndex = legacyRevisionGuardMigration.indexOf("WHERE version = '030_specifications2_legacy_revision_identity_guard'");
const legacyRootTriggerIndex = legacyRevisionGuardMigration.indexOf("CREATE TRIGGER specifications2_capture_legacy_revision_identity_trigger");
const legacyWorkOrderTriggerIndex = legacyRevisionGuardMigration.indexOf("CREATE TRIGGER specifications2_verify_work_order_revision_identity_trigger");
const legacyOutboxTriggerIndex = legacyRevisionGuardMigration.indexOf("CREATE TRIGGER specifications2_require_v6_publication_outbox_trigger");
const legacyGuardMarkerInsertIndex = legacyRevisionGuardMigration.indexOf("INSERT INTO mes_schema_migrations(version)");
const legacyGuardEndIndex = legacyRevisionGuardMigration.lastIndexOf("END IF;");
const workOrderFingerprintColumnsIndex = legacyRevisionGuardMigration.indexOf("ADD COLUMN IF NOT EXISTS request_fingerprint TEXT");
const workOrderLegacyRouteConstraintDropIndex = legacyRevisionGuardMigration.indexOf("DROP CONSTRAINT IF EXISTS specifications2_work_order_so_specification_revision_id_rou_key");
const workOrderActorIdempotencyIndex = legacyRevisionGuardMigration.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS specifications2_work_order_actor_idempotency_uidx");
const workOrderFingerprintTriggerIndex = legacyRevisionGuardMigration.indexOf("CREATE TRIGGER specifications2_verify_work_order_request_fingerprint_trigger");
assert.ok(legacyGuardMarkerCheckIndex >= 0
  && legacyGuardMarkerCheckIndex < legacyRootTriggerIndex
  && legacyRootTriggerIndex < legacyWorkOrderTriggerIndex
  && legacyWorkOrderTriggerIndex < legacyOutboxTriggerIndex
  && legacyOutboxTriggerIndex < legacyGuardMarkerInsertIndex
  && legacyGuardMarkerInsertIndex < legacyGuardEndIndex,
"migration 030 must marker-guard both triggers and commit its marker only after both defenses exist");
assert.ok(workOrderFingerprintColumnsIndex > legacyGuardMarkerInsertIndex
  && workOrderLegacyRouteConstraintDropIndex > workOrderFingerprintColumnsIndex
  && workOrderActorIdempotencyIndex > workOrderLegacyRouteConstraintDropIndex
  && workOrderFingerprintTriggerIndex > workOrderActorIdempotencyIndex,
"migration 030 repeat runs must repair the Work Order request contract even when an older 030 marker already exists");
assert.match(legacyRevisionGuardMigration.slice(workOrderFingerprintColumnsIndex), /request_fingerprint IS NULL[\s\S]+request_quantity IS NULL[\s\S]+request_actor_scope IS NULL/u,
  "legacy rows must remain explicitly unverifiable instead of receiving an unsafe inferred actor fingerprint");
assert.match(preflightPolicy, /SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION/u,
  "publication preflight must require migration 030 before enabling server publication");

[
  "SET LOCAL lock_timeout = '5s'",
  "SET LOCAL statement_timeout = '2min'",
  "CREATE OR REPLACE FUNCTION public.specifications2_capture_legacy_revision_identity()",
  "DROP TRIGGER IF EXISTS specifications2_capture_legacy_revision_identity_trigger",
  "CREATE TRIGGER specifications2_capture_legacy_revision_identity_trigger",
  "CREATE OR REPLACE FUNCTION public.specifications2_verify_work_order_revision_identity()",
  "DROP TRIGGER IF EXISTS specifications2_verify_work_order_revision_identity_trigger",
  "CREATE TRIGGER specifications2_verify_work_order_revision_identity_trigger",
  "CREATE OR REPLACE FUNCTION public.specifications2_require_v6_publication_outbox()",
  "DROP TRIGGER IF EXISTS specifications2_require_v6_publication_outbox_trigger",
  "CREATE TRIGGER specifications2_require_v6_publication_outbox_trigger",
  "VALUES ('031_specifications2_guard_function_repair')",
  "ON CONFLICT (version) DO NOTHING",
].forEach((fragment) => assert.ok(guardFunctionRepairMigration.includes(fragment),
  `Specifications 2.0 guard-function repair migration is missing: ${fragment}`));
assert.doesNotMatch(guardFunctionRepairMigration,
  /IF\s+NOT\s+EXISTS\s*\([\s\S]*031_specifications2_guard_function_repair/iu,
  "migration 031 must reinstall the live function/trigger contract even after its own marker exists");
assert.doesNotMatch(guardFunctionRepairMigration, /030_specifications2_legacy_revision_identity_guard[\s\S]+IF/iu,
  "migration 031 must never use marker 030 as a repair guard");
assert.doesNotMatch(guardFunctionRepairMigration, /^\s*(?:BEGIN|COMMIT);/imu,
  "migration 031 must remain inside the runner-owned transaction");
assert.equal((guardFunctionRepairMigration.match(/CREATE OR REPLACE FUNCTION public\.specifications2_/gu) || []).length, 3,
  "migration 031 must replace exactly the three rollback guard functions");
assert.equal((guardFunctionRepairMigration.match(/^\s*DROP TRIGGER IF EXISTS specifications2_/gmu) || []).length, 3,
  "migration 031 must drop exactly the three historical named guard triggers before recreation");
assert.equal((guardFunctionRepairMigration.match(/^\s*CREATE TRIGGER specifications2_/gmu) || []).length, 3,
  "migration 031 must recreate exactly the three historical named guard triggers");
const repairMarkerIndex = guardFunctionRepairMigration.indexOf("VALUES ('031_specifications2_guard_function_repair')");
assert.ok(repairMarkerIndex > guardFunctionRepairMigration.lastIndexOf("CREATE TRIGGER specifications2_"),
  "migration 031 may write its marker only after all three exact trigger contracts are restored");
assert.match(migrationRunner, /repeatableRepairMigrations[\s\S]+031_specifications2_guard_function_repair\.sql[\s\S]+tx\.unsafe\(source\)/u,
  "the migration runner must require and re-execute migration 031 on every invocation");

function extractGuardBody(migrationSource, functionName) {
  const functionIndex = migrationSource.indexOf(`FUNCTION public.${functionName}()`);
  assert.ok(functionIndex >= 0, `${functionName} must exist in migration 031`);
  const bodyStart = migrationSource.indexOf("AS $function$", functionIndex) + "AS $function$".length;
  const bodyEnd = migrationSource.indexOf("$function$", bodyStart);
  assert.ok(bodyStart >= "AS $function$".length && bodyEnd > bodyStart, `${functionName} must have a bounded body`);
  return migrationSource.slice(bodyStart, bodyEnd);
}

for (const [contractName, functionName] of Object.entries({
  legacyRevisionIdentity: "specifications2_capture_legacy_revision_identity",
  workOrderRevisionIdentity: "specifications2_verify_work_order_revision_identity",
  publicationOutboxV6: "specifications2_require_v6_publication_outbox",
})) {
  const digest = createHash("sha256").update(extractGuardBody(guardFunctionRepairMigration, functionName)).digest("hex");
  assert.equal(digest, SPECIFICATIONS2_GUARD_FUNCTION_BODY_SHA256[contractName],
    `${functionName} readiness digest must be generated from the exact migration 031 body`);
}
assert.match(preflightPolicy, /SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION/u,
  "Specifications 2.0 write preflight must require migration 031");

assert.equal(normalizeSpecifications2GuardTriggerDefinition(
  "CREATE TRIGGER specifications2_capture_legacy_revision_identity_trigger  AFTER INSERT ON public.specifications2_revision_items FOR EACH ROW WHEN ((new.parent_source_row_id = ''::text)) EXECUTE FUNCTION public.specifications2_capture_legacy_revision_identity()",
), SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.legacyRevisionIdentity,
"pg_get_triggerdef normalization may remove only catalog formatting that preserves the exact trigger contract");

const simulateLegacyRootIdentityTrigger = (revision, item) => {
  const next = { ...revision };
  if (item.parent_source_row_id !== "" || next.revision_identity_state !== "legacy-unverified") return next;
  if (!String(item.name || "") && !String(item.designation || "")) return next;
  next.revision_title ||= String(item.name || "");
  next.revision_designation ||= String(item.designation || "");
  next.revision_identity_state = "legacy-derived";
  return next;
};
assert.deepEqual(simulateLegacyRootIdentityTrigger({
  revision_title: null,
  revision_designation: null,
  revision_identity_state: "legacy-unverified",
}, {
  parent_source_row_id: "",
  name: "Immutable root A",
  designation: "ROOT-A",
}), {
  revision_title: "Immutable root A",
  revision_designation: "ROOT-A",
  revision_identity_state: "legacy-derived",
}, "old-code root insert must derive revision identity without mutable document metadata");
assert.deepEqual(simulateLegacyRootIdentityTrigger({
  revision_title: "Authoritative A",
  revision_designation: "AUTH-A",
  revision_identity_state: "authoritative",
}, {
  parent_source_row_id: "",
  name: "Attempted overwrite",
  designation: "OVERWRITE",
}), {
  revision_title: "Authoritative A",
  revision_designation: "AUTH-A",
  revision_identity_state: "authoritative",
}, "rollback trigger must never rewrite authoritative identity");

const acceptsSpecifications2WorkOrderSource = ({ revision = {}, route = {}, workOrder = {} } = {}) => {
  const revisionVerified = ["authoritative", "legacy-derived"].includes(revision.revision_identity_state);
  const routeName = String(route.product_label || "").trim();
  const routeDesignation = String(route.designation || "").trim();
  if (!revisionVerified && (!routeName || !routeDesignation)) return false;
  const expectedName = routeName
    || (revisionVerified ? String(revision.revision_title || "").trim() : "")
    || "Изделие";
  const expectedDesignation = routeDesignation
    || (revisionVerified ? String(revision.revision_designation || "").trim() : "");
  return String(workOrder.name || "").trim() === expectedName
    && String(workOrder.designation || "").trim() === expectedDesignation;
};
assert.equal(acceptsSpecifications2WorkOrderSource({
  revision: { revision_identity_state: "legacy-unverified" },
  route: { product_label: "Immutable route product", designation: "ROUTE-A" },
  workOrder: { name: "Immutable route product", designation: "ROUTE-A" },
}), true, "old-code work order remains safe when the immutable route supplies complete identity");
assert.equal(acceptsSpecifications2WorkOrderSource({
  revision: { revision_title: "Revision A", revision_designation: "REV-A", revision_identity_state: "legacy-derived" },
  route: { product_label: "", designation: "" },
  workOrder: { name: "Revision A", designation: "REV-A" },
}), true, "root-derived revision identity may safely fill an incomplete route");
assert.equal(acceptsSpecifications2WorkOrderSource({
  revision: { revision_title: "Revision A", revision_designation: "REV-A", revision_identity_state: "legacy-derived" },
  route: { product_label: "", designation: "" },
  workOrder: { name: "Mutable document B", designation: "DOC-B" },
}), false, "rollback code must not create a work order from mutable latest-document identity");
assert.equal(acceptsSpecifications2WorkOrderSource({
  revision: { revision_identity_state: "legacy-unverified" },
  route: { product_label: "", designation: "" },
  workOrder: { name: "Изделие", designation: "" },
}), false, "unknown legacy identity must not be accepted through deterministic defaults alone");
assert.equal(acceptsSpecifications2WorkOrderSource({
  revision: { revision_title: "Verified title", revision_designation: "", revision_identity_state: "legacy-derived" },
  route: { product_label: "", designation: "" },
  workOrder: { name: "Verified title", designation: "" },
}), true, "a verified revision may intentionally carry an empty designation");
assert.equal(acceptsSpecifications2WorkOrderSource({
  revision: { revision_title: "", revision_designation: "REV-ONLY", revision_identity_state: "legacy-derived" },
  route: { product_label: "", designation: "" },
  workOrder: { name: "Изделие", designation: "REV-ONLY" },
}), true, "designation-only revisions must use the same deterministic name fallback as the command builder");
const durableWorkOrderRows = { workOrders: [], operations: [], sources: [] };
const simulateAtomicWorkOrder = (projection) => {
  const pending = structuredClone(durableWorkOrderRows);
  pending.workOrders.push(projection.workOrder);
  pending.operations.push({ id: "operation-pending" });
  if (!acceptsSpecifications2WorkOrderSource(projection)) throw new Error("work-order identity trigger rejected mutable identity");
  pending.sources.push({ revisionId: projection.revision.id });
  Object.assign(durableWorkOrderRows, pending);
};
assert.throws(() => simulateAtomicWorkOrder({
  revision: { id: "revision-a", revision_title: "Revision A", revision_designation: "REV-A", revision_identity_state: "legacy-derived" },
  route: { product_label: "", designation: "" },
  workOrder: { name: "Mutable document B", designation: "DOC-B" },
}), /rejected mutable identity/u,
"old work-order transaction must be rejected when it captured mutable document identity");
assert.deepEqual(durableWorkOrderRows, { workOrders: [], operations: [], sources: [] },
  "work-order source trigger rejection must roll back pending order and operations atomically");

const acceptsSpecifications2WorkOrderRequest = ({ source = {}, persistedQuantity = 0 } = {}) => (
  /^sha256:[0-9a-f]{64}$/u.test(String(source.request_fingerprint || ""))
  && Number(source.request_quantity) > 0
  && Number.isInteger(Number(source.request_quantity))
  && Number(source.request_quantity) === Number(persistedQuantity)
  && String(source.request_actor_scope || "").trim() === String(source.request_actor_scope || "")
  && Boolean(String(source.request_actor_scope || ""))
);
const durableLegacyWorkOrderRows = { workOrders: [], operations: [], sources: [] };
const simulateLegacyWorkOrderWithoutFingerprint = () => {
  const pending = structuredClone(durableLegacyWorkOrderRows);
  pending.workOrders.push({ id: "legacy-wo", quantity: 7 });
  pending.operations.push({ id: "legacy-op" });
  const legacySource = { work_order_id: "legacy-wo", request_fingerprint: null, request_quantity: null, request_actor_scope: null };
  if (!acceptsSpecifications2WorkOrderRequest({ source: legacySource, persistedQuantity: 7 })) {
    throw new Error("work-order request fingerprint trigger rejected legacy insert");
  }
  pending.sources.push(legacySource);
  Object.assign(durableLegacyWorkOrderRows, pending);
};
assert.throws(simulateLegacyWorkOrderWithoutFingerprint, /rejected legacy insert/u,
  "release .25 must fail closed when it attempts a source insert without the new request fingerprint");
assert.deepEqual(durableLegacyWorkOrderRows, { workOrders: [], operations: [], sources: [] },
  "the database trigger must atomically roll back the old release's pending order and operations");

const acceptsPublicationOutbox = ({ aggregateType = "specifications2_revision", commandType = "publish_revision", payload = {} } = {}) => {
  if (aggregateType !== "specifications2_revision" || commandType !== "publish_revision") return true;
  const digest = String(payload.compatibilityPayloadDigest || "");
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) return false;
  try {
    return Number(JSON.parse(payload.compatibilityEntry?.publication?.fingerprint || "{}").adapterVersion) === 6;
  } catch { return false; }
};
const durablePublishRows = { revisions: [], revisionItems: [], outbox: [] };
const simulateAtomicPublication = (payload) => {
  const pending = structuredClone(durablePublishRows);
  pending.revisions.push({ id: "revision-pending" });
  pending.revisionItems.push({ id: "root-pending" });
  if (!acceptsPublicationOutbox({ payload })) throw new Error("publication outbox trigger rejected incompatible payload");
  pending.outbox.push({ payload });
  Object.assign(durablePublishRows, pending);
};
assert.throws(() => simulateAtomicPublication({
  compatibilityEntry: { publication: { fingerprint: JSON.stringify({ adapterVersion: 5 }) } },
}), /rejected incompatible payload/u,
"old release publication without digest/v6 contract must be rejected by the final outbox insert");
assert.deepEqual(durablePublishRows, { revisions: [], revisionItems: [], outbox: [] },
  "outbox trigger rejection must roll back the pending revision and root item atomically");
assert.equal(acceptsPublicationOutbox({
  aggregateType: "work_order",
  commandType: "create_from_specifications2_revision",
  payload: {},
}), true, "migration 030 outbox guard must leave unrelated domain commands untouched");
assert.doesNotThrow(() => simulateAtomicPublication({
  compatibilityPayloadDigest: `sha256:${"a".repeat(64)}`,
  compatibilityEntry: { publication: { fingerprint: JSON.stringify({ adapterVersion: 6 }) } },
}), "current v6 publication payload must pass the database rollback guard");
assert.deepEqual(Object.fromEntries(Object.entries(durablePublishRows).map(([key, rows]) => [key, rows.length])), {
  revisions: 1,
  revisionItems: 1,
  outbox: 1,
}, "accepted v6 publication must commit all three transaction projections together");

const revisionOneIdentity = resolveSpecifications2RevisionReadIdentity({
  revision_title: "Изделие A",
  revision_designation: "АБВГ.001-A",
  revision_identity_state: "authoritative",
  title: "Изделие B",
  designation: "АБВГ.001-B",
});
assert.deepEqual(revisionOneIdentity, {
  title: "Изделие A",
  designation: "АБВГ.001-A",
  state: "authoritative",
  authoritative: true,
  verified: true,
}, "revision 1 reads must ignore mutable revision 2 document metadata");
assert.deepEqual(resolveSpecifications2RevisionReadIdentity({
  revision_title: "Изделие B",
  revision_designation: "АБВГ.001-B",
  revision_identity_state: "authoritative",
}), {
  title: "Изделие B",
  designation: "АБВГ.001-B",
  state: "authoritative",
  authoritative: true,
  verified: true,
}, "revision 2 must retain its own immutable identity");
assert.deepEqual(resolveSpecifications2RevisionReadIdentity({
  revision_title: null,
  revision_designation: null,
  revision_identity_state: "legacy-unverified",
  title: "Current mutable title",
  designation: "CURRENT",
}), {
  title: "",
  designation: "",
  state: "legacy-unverified",
  authoritative: false,
  verified: false,
}, "unknown legacy identity must remain visibly unverified instead of borrowing current document metadata");
assert.equal(await isSpecifications2RevisionIdentityReady(async () => [{ identity_column_count: 3, revision_identity_backfill_applied: true }]), true,
  "rollout capability check must recognize a fully migrated revision schema");
assert.equal(await isSpecifications2RevisionIdentityReady(async () => [{ identity_column_count: 3, revision_identity_backfill_applied: false }]), false,
  "rollout capability check must keep the safe fallback between migrations 028 and 029");
assert.equal(await isSpecifications2RevisionIdentityReady(async () => [{ identity_column_count: 0, revision_identity_backfill_applied: false }]), false,
  "rollout capability check must preserve the pre-migration read path");

const readyCommandSchema = {
  documents_table: "specifications2_documents",
  revisions_table: "specifications2_revisions",
  items_table: "specifications2_revision_items",
  routes_table: "specifications2_route_documents",
  operations_table: "specifications2_route_operations",
  publication_requests_table: "specifications2_publication_requests",
  revision_identity_columns: true,
  revision_identity_backfill_applied: true,
  legacy_revision_identity_guard_applied: true,
  guard_function_repair_applied: true,
  work_order_request_columns: true,
  work_order_request_contract_constraint: true,
  work_order_legacy_route_idempotency_absent: true,
  work_order_actor_idempotency_index: true,
  legacy_revision_identity_function_exact: true,
  work_order_revision_identity_function_exact: true,
  publication_outbox_v6_function_exact: true,
  legacy_revision_identity_trigger_exact: true,
  legacy_revision_identity_trigger_definition: SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.legacyRevisionIdentity,
  work_order_revision_identity_trigger_exact: true,
  work_order_revision_identity_trigger_definition: SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.workOrderRevisionIdentity,
  publication_outbox_v6_trigger_exact: true,
  publication_outbox_v6_trigger_definition: SPECIFICATIONS2_GUARD_TRIGGER_DEFINITIONS.publicationOutboxV6,
  work_order_request_fingerprint_trigger_exact: true,
  outbox_table: "domain_change_log",
};
assert.equal(resolveSpecifications2CommandSchemaReadiness(readyCommandSchema), true,
  "command readiness must accept the full schema only when all four rollback/idempotency guards are enabled");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  legacy_revision_identity_trigger_exact: false,
}), false, "command readiness must fail closed when one rollback trigger is missing, disabled, replica-only or bound to another tgfoid");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  legacy_revision_identity_trigger_definition: "CREATE TRIGGER specifications2_capture_legacy_revision_identity_trigger BEFORE INSERT ON specifications2_revision_items FOR EACH ROW EXECUTE FUNCTION specifications2_capture_legacy_revision_identity()",
}), false, "command readiness must reject a named trigger whose pg_get_triggerdef contract was altered");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  legacy_revision_identity_function_exact: false,
}), false, "marker 030 plus a no-op guard function must never satisfy write readiness");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  guard_function_repair_applied: false,
}), false, "command readiness must require marker 031 as well as the repaired live function bodies");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  work_order_request_columns: false,
}), false, "command readiness must fail closed when the fingerprint ledger columns are absent");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  work_order_request_contract_constraint: false,
}), false, "command readiness must fail closed when the fingerprint ledger constraint is absent or unvalidated");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  work_order_legacy_route_idempotency_absent: false,
}), false, "command readiness must fail closed while migration 010 still enforces a cross-employee route/key namespace");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  work_order_actor_idempotency_index: false,
}), false, "command readiness must fail closed without the actor-scoped global idempotency index");
assert.equal(resolveSpecifications2CommandSchemaReadiness({
  ...readyCommandSchema,
  legacy_revision_identity_guard_applied: false,
}), false, "command readiness must require the committed migration marker as well as live triggers");

const readRepositoryStart = source.indexOf("export function createSpecifications2ReadRepository");
const publishRepositoryStart = source.indexOf("export function createSpecifications2PublishCommandRepository");
const workOrderRepositoryStart = source.indexOf("export function createSpecifications2WorkOrderCommandRepository");
const readRepositorySource = source.slice(readRepositoryStart, publishRepositoryStart);
const workOrderRepositorySource = source.slice(workOrderRepositoryStart);
assert.match(readRepositorySource, /r\.revision_title, r\.revision_designation, r\.revision_identity_state/u,
  "revision reads must select revision-scoped identity columns");
assert.match(readRepositorySource, /isSpecifications2RevisionIdentityReady\(sql\)/u,
  "revision reads must detect migration 028 before referencing newly added columns");
assert.match(readRepositorySource, /d\.title AS revision_title, d\.designation AS revision_designation,[\s\S]+legacy-unverified/gu,
  "the pre-migration compatibility branch must label mutable document fallback as unverified");
assert.match(workOrderRepositorySource, /r\.revision_title, r\.revision_designation/u,
  "work-order creation must select revision-scoped identity");
assert.match(workOrderRepositorySource, /async commandReadiness\(\)[\s\S]+inspectSpecifications2CommandSchemaReadiness\(sql\)/u,
  "work-order capability must use the same live migration/trigger readiness proof as publication");
assert.match(workOrderRepositorySource, /async create[\s\S]+inspectSpecifications2CommandSchemaReadiness\(tx\)[\s\S]+if \(!commandReadiness\.schemaReady\)/u,
  "work-order creation must recheck rollback guards inside its own write transaction");
assert.match(workOrderRepositorySource, /isSpecifications2RevisionIdentityReady\(tx\)/u,
  "work-order creation must detect whether migration 028 has run before selecting revision identity");
assert.match(workOrderRepositorySource, /root\.name AS revision_title,[\s\S]+LEFT JOIN LATERAL[\s\S]+parent_source_row_id = ''/u,
  "the pre-migration work-order branch must derive identity from the immutable revision root item");
assert.match(workOrderRepositorySource, /LEFT JOIN LATERAL[\s\S]+FOR SHARE OF r, d/u,
  "the pre-migration root fallback must lock only non-nullable revision/document rows accepted by PostgreSQL");
assert.doesNotMatch(workOrderRepositorySource, /d\.title|d\.designation/u,
  "work-order writes must never inherit mutable current document identity in either schema state");
assert.match(workOrderRepositorySource, /if \(!identity\.verified\)/u,
  "work-order creation must fail closed whenever neither stored nor root-derived identity is verified");
assert.match(workOrderRepositorySource, /buildSpecifications2WorkOrderRequestFingerprint\([\s\S]+pg_advisory_xact_lock\(hashtext/u,
  "Work Order creation must build the exact request fingerprint and serialize same-key retries before reading the ledger");
assert.match(workOrderRepositorySource, /work-order-request:\$\{JSON\.stringify\(\[request\.actorScope, requestIdempotencyKey\]\)\}/u,
  "Work Order retries must serialize the actor/key pair independently of revision and route");
assert.match(workOrderRepositorySource, /WHERE source\.idempotency_key = \$\{requestIdempotencyKey\}[\s\S]+source\.request_actor_scope = \$\{request\.actorScope\}[\s\S]+source\.request_actor_scope IS NULL/u,
  "Work Order receipt lookup must find the same actor/key globally and fail closed on legacy NULL-actor receipts");
assert.match(workOrderRepositorySource, /ORDER BY \(source\.request_actor_scope IS NULL\) DESC,[\s\S]+\(source\.request_actor_scope = \$\{request\.actorScope\}\) DESC/u,
  "any legacy NULL receipt must win lookup priority and force an unverifiable conflict even if an actor receipt also exists");
assert.doesNotMatch(workOrderRepositorySource, /WHERE source\.specification_revision_id = \$\{revision\.id\}[\s\S]+source\.idempotency_key = \$\{requestIdempotencyKey\}/u,
  "Work Order receipt lookup must not remain scoped to the requested revision and route");
assert.match(workOrderRepositorySource, /source\.request_fingerprint, source\.request_quantity, source\.request_actor_scope[\s\S]+decideSpecifications2WorkOrderRequest/u,
  "an existing Work Order may be replayed only after comparing fingerprint, persisted quantity and actor scope");
assert.match(workOrderRepositorySource, /idempotencyConflict: true[\s\S]+legacyUnverifiable/u,
  "different or legacy-unverifiable Work Order requests must produce an explicit idempotency conflict");
assert.match(workOrderRepositorySource, /INSERT INTO specifications2_work_order_sources[\s\S]+request_fingerprint, request_quantity, request_actor_scope/u,
  "new Work Order source receipts must persist the complete request contract atomically");
assert.match(workOrderRepositorySource, /buildSpecifications2WorkOrderAggregateIdentity\([\s\S]+aggregateIdentity: aggregateIdentity\.aggregateIdentity/u,
  "the server repository must pass a canonical actor/key SHA-256 identity into the pure Work Order builder");
assert.doesNotMatch(workOrderBuilderSource, /2166136261|Math\.imul|stableId/u,
  "Specifications 2.0 Work Order and operation ids must not use the former 32-bit FNV projection");

const workOrderRequest = buildSpecifications2WorkOrderRequestFingerprint({
  revisionId: " revision-a ",
  routeDocumentId: " route-a ",
  quantity: 7.4,
  actorId: " employee:employee-a ",
});
assert.equal(workOrderRequest.normalizedQuantity, 7, "fingerprinting must use the exact quantity that the Work Order builder persists");
assert.equal(workOrderRequest.actorScope, "employee:employee-a", "authenticated actor scope must be canonicalized before hashing and storage");
assert.equal(workOrderRequest.specificationRevisionId, "revision-a");
assert.equal(workOrderRequest.routeDocumentId, "route-a");
assert.match(workOrderRequest.requestFingerprint, /^sha256:[0-9a-f]{64}$/u);
assert.equal(workOrderRequest.requestFingerprint, buildSpecifications2WorkOrderRequestFingerprint({
  revisionId: "revision-a",
  routeDocumentId: "route-a",
  quantity: 7.49,
  actorId: "employee:employee-a",
}).requestFingerprint, "requests that persist the same normalized quantity and actor must replay exactly");
for (const changed of [
  { revisionId: "revision-b", routeDocumentId: "route-a", quantity: 7.4, actorId: "employee:employee-a" },
  { revisionId: "revision-a", routeDocumentId: "route-b", quantity: 7.4, actorId: "employee:employee-a" },
  { revisionId: "revision-a", routeDocumentId: "route-a", quantity: 7.5, actorId: "employee:employee-a" },
  { revisionId: "revision-a", routeDocumentId: "route-a", quantity: 7.4, actorId: "employee:employee-b" },
]) {
  assert.notEqual(workOrderRequest.requestFingerprint, buildSpecifications2WorkOrderRequestFingerprint(changed).requestFingerprint,
    "revision, resolved route, persisted quantity and authenticated actor must each participate in the fingerprint");
}
assert.deepEqual(decideSpecifications2WorkOrderRequest({ priorRequest: null, request: workOrderRequest }), { kind: "create" });
assert.deepEqual(decideSpecifications2WorkOrderRequest({
  priorRequest: {
    specification_revision_id: "revision-a",
    route_document_id: "route-a",
    request_fingerprint: workOrderRequest.requestFingerprint,
    request_quantity: "7.000",
    request_actor_scope: "employee:employee-a",
  },
  request: workOrderRequest,
}), { kind: "replay" }, "an exact canonical request must return the existing Work Order");
assert.equal(decideSpecifications2WorkOrderRequest({
  priorRequest: {
    specification_revision_id: "revision-a",
    route_document_id: "route-a",
    request_fingerprint: workOrderRequest.requestFingerprint,
    request_quantity: "8.000",
    request_actor_scope: "employee:employee-a",
  },
  request: workOrderRequest,
}).kind, "idempotency-conflict", "stored quantity disagreement must fail closed even if a fingerprint was copied incorrectly");
assert.equal(decideSpecifications2WorkOrderRequest({
  priorRequest: {
    specification_revision_id: "revision-a",
    route_document_id: "route-a",
    request_fingerprint: workOrderRequest.requestFingerprint,
    request_quantity: "7.000",
    request_actor_scope: "employee:employee-b",
  },
  request: workOrderRequest,
}).kind, "idempotency-conflict", "stored actor disagreement must fail closed even if a fingerprint was copied incorrectly");
const legacyWorkOrderReplay = decideSpecifications2WorkOrderRequest({
  priorRequest: { request_fingerprint: null, request_quantity: null, request_actor_scope: null },
  request: workOrderRequest,
});
assert.equal(legacyWorkOrderReplay.kind, "idempotency-conflict");
assert.equal(legacyWorkOrderReplay.legacyUnverifiable, true, "legacy NULL receipts must never be silently accepted as exact replays");

const changedRouteRequest = buildSpecifications2WorkOrderRequestFingerprint({
  revisionId: "revision-a",
  routeDocumentId: "route-b",
  quantity: 7,
  actorId: "employee:employee-a",
});
assert.equal(decideSpecifications2WorkOrderRequest({
  priorRequest: {
    specification_revision_id: "revision-a",
    route_document_id: "route-a",
    request_fingerprint: workOrderRequest.requestFingerprint,
    request_quantity: "7.000",
    request_actor_scope: "employee:employee-a",
  },
  request: changedRouteRequest,
}).kind, "idempotency-conflict", "one actor must not reuse a Work Order key on another route");

const otherActorRequest = buildSpecifications2WorkOrderRequestFingerprint({
  revisionId: "revision-a",
  routeDocumentId: "route-a",
  quantity: 7,
  actorId: "employee:employee-b",
});
const workOrderBuilderInput = {
  revision: { id: "revision-a", revision_no: 1, title: "Изделие" },
  route: { id: "route-a", designation: "QA.001", product_label: "Изделие" },
  operations: [{ id: "operation-a", operation_id: "OP-A", name: "Монтаж", work_center_id: "WC-A", labor_norm: { calculationMode: "unit", unitsPerHour: 60 } }],
  quantity: 7,
  idempotencyKey: "shared-key",
};
const actorAIdentity = buildSpecifications2WorkOrderAggregateIdentity({
  actorScope: workOrderRequest.actorScope,
  idempotencyKey: workOrderBuilderInput.idempotencyKey,
});
const actorBIdentity = buildSpecifications2WorkOrderAggregateIdentity({
  actorScope: otherActorRequest.actorScope,
  idempotencyKey: workOrderBuilderInput.idempotencyKey,
});
const actorASecondKeyIdentity = buildSpecifications2WorkOrderAggregateIdentity({
  actorScope: workOrderRequest.actorScope,
  idempotencyKey: "second-shared-request-key",
});
assert.match(actorAIdentity.aggregateIdentity, /^sha256:[0-9a-f]{64}$/u);
assert.equal(actorAIdentity.aggregateIdentity, buildSpecifications2WorkOrderAggregateIdentity({
  actorScope: " employee:employee-a ",
  idempotencyKey: " shared-key ",
}).aggregateIdentity, "exact actor/key retries must derive the same aggregate identity");
assert.notEqual(actorAIdentity.aggregateIdentity, actorBIdentity.aggregateIdentity,
  "different authenticated actors must have independent aggregate identities");
assert.notEqual(actorAIdentity.aggregateIdentity, actorASecondKeyIdentity.aggregateIdentity,
  "different Idempotency-Keys from one actor must have independent aggregate identities");
const actorAOrder = buildSpecifications2WorkOrderCommand({ ...workOrderBuilderInput, aggregateIdentity: actorAIdentity.aggregateIdentity });
const actorBOrder = buildSpecifications2WorkOrderCommand({ ...workOrderBuilderInput, aggregateIdentity: actorBIdentity.aggregateIdentity });
const actorASecondKeyOrder = buildSpecifications2WorkOrderCommand({
  ...workOrderBuilderInput,
  idempotencyKey: "second-shared-request-key",
  aggregateIdentity: actorASecondKeyIdentity.aggregateIdentity,
});
assert.match(actorAOrder.workOrder.id, /^wo-spec2-[0-9a-f]{64}$/u,
  "aggregate IDs must retain the full server-derived SHA-256 identity");
assert.match(actorAOrder.workOrder.number, /^WO-S2-1-[0-9A-F]{32}$/u,
  "the database-unique human Work Order number must retain at least 128 bits of aggregate identity");
assert.equal(actorAOrder.operations[0].id, `${actorAOrder.workOrder.id}-op-1`,
  "operation IDs must inherit the collision-resistant aggregate identity and immutable unique sequence");
assert.notEqual(actorAOrder.workOrder.id, actorBOrder.workOrder.id,
  "different employee key spaces must not collide on the deterministic Work Order id");
assert.notEqual(actorAOrder.workOrder.id, actorASecondKeyOrder.workOrder.id,
  "two distinct command keys from one employee must be able to create equivalent Work Orders");
assert.equal(actorAOrder.source.idempotencyKey, "shared-key",
  "actor-bound aggregate identity must not rewrite the caller-visible Idempotency-Key receipt");
assert.throws(() => buildSpecifications2WorkOrderCommand({ ...workOrderBuilderInput }), /SHA-256 Work Order aggregate identity/u,
  "the pure builder must fail closed when the server identity proof is absent");
assert.throws(() => buildSpecifications2WorkOrderCommand({ ...workOrderBuilderInput, aggregateIdentity: "sha256:not-a-digest" }), /SHA-256 Work Order aggregate identity/u,
  "the pure builder must fail closed when the server identity proof is malformed");

// These two keys collide under the removed 32-bit FNV projection for this
// exact request fingerprint. The server-derived SHA-256 actor/key identities
// must still create distinct aggregates.
const oldFNV32 = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const adversarialCollisionKeys = ["key-ekdil6-ipd", "key-1im7oy9-1042"];
assert.equal(
  oldFNV32(`${workOrderRequest.requestFingerprint}:${adversarialCollisionKeys[0]}`),
  oldFNV32(`${workOrderRequest.requestFingerprint}:${adversarialCollisionKeys[1]}`),
  "QA fixture must retain a real collision in the removed 32-bit identity projection",
);
const adversarialOrders = adversarialCollisionKeys.map((idempotencyKey) => buildSpecifications2WorkOrderCommand({
  ...workOrderBuilderInput,
  idempotencyKey,
  aggregateIdentity: buildSpecifications2WorkOrderAggregateIdentity({
    actorScope: workOrderRequest.actorScope,
    idempotencyKey,
  }).aggregateIdentity,
}));
assert.notEqual(adversarialOrders[0].workOrder.id, adversarialOrders[1].workOrder.id,
  "known 32-bit collision keys must remain distinct under the SHA-256 aggregate identity contract");
assert.notEqual(adversarialOrders[0].workOrder.number, adversarialOrders[1].workOrder.number,
  "known 32-bit collision keys must also remain distinct in the database-unique Work Order number");

const requestEntry = {
  id: "spec-request-qa",
  title: "Изделие A",
  treeRows: [{ id: "root", level: 0, label: "АБВГ.001.001 Изделие", designation: "АБВГ.001.001", quantity: 1, unit: "шт." }],
  routeDrafts: [{
    id: "route-1",
    designation: "АБВГ.001.001",
    productLabel: "Изделие",
    operations: [{ id: "operation-1", operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { calculationMode: "unit", unitsPerHour: 60 } }],
  }],
};
for (const invalidQuantity of [1.2345, 0.0004, 100_000_000_000]) {
  assert.throws(() => buildAuthoritativePublicationEntry({
    ...requestEntry,
    treeRows: [{ ...requestEntry.treeRows[0], quantity: invalidQuantity }],
  }, {
    revisionNo: 1,
    releasedAt: "2026-07-18T00:00:00.000Z",
  }), /NUMERIC\(14,3\)/,
  `v6 publication quantity ${invalidQuantity} must fail before fingerprint/export/transaction`);
}
const authoritativeV6 = buildAuthoritativePublicationEntry(requestEntry, {
  revisionNo: 1,
  releasedAt: "2026-07-18T00:00:00.000Z",
});
assert.equal(JSON.parse(authoritativeV6.publication.fingerprint).adapterVersion, 6,
  "every newly created server revision must use complete adapter v6 independently of client history");
assert.doesNotThrow(() => buildAuthoritativePublicationEntry({
  ...requestEntry,
  publication: { fingerprint: authoritativeV6.publication.fingerprint },
}, {
  revisionNo: 1,
  releasedAt: "2026-07-18T00:00:00.000Z",
}), "an exactly prepared v6 command must remain publishable");
for (const adapterVersion of [4, 5]) {
  const historicalFingerprint = buildSpecifications2ReleaseFingerprint(requestEntry, { adapterVersion });
  assert.throws(() => buildAuthoritativePublicationEntry({
    ...requestEntry,
    publication: { fingerprint: historicalFingerprint },
  }, {
    revisionNo: 1,
    releasedAt: "2026-07-18T00:00:00.000Z",
  }), /unsupported historical adapter/,
  `new server publications must reject adapter v${adapterVersion}; historical adapters remain replay-only`);
}
const requestFingerprint = buildSpecifications2PublicationRequestFingerprint({
  entry: requestEntry,
  expectedPreviousRevision: 0,
  actorId: "employee-1",
});
assert.notEqual(requestFingerprint, buildSpecifications2PublicationRequestFingerprint({
  entry: { ...requestEntry, title: "Изделие B" },
  expectedPreviousRevision: 0,
  actorId: "employee-1",
}), "request fingerprint must bind the complete command payload, not only its release fingerprint");
assert.notEqual(requestFingerprint, buildSpecifications2PublicationRequestFingerprint({
  entry: requestEntry,
  expectedPreviousRevision: 1,
  actorId: "employee-1",
}), "request fingerprint must bind expectedPreviousRevision");
assert.notEqual(requestFingerprint, buildSpecifications2PublicationRequestFingerprint({
  entry: requestEntry,
  expectedPreviousRevision: 0,
  actorId: "employee-2",
}), "request fingerprint must bind the authenticated actor");

assert.deepEqual(decideSpecifications2PublicationRequest({
  requestFingerprint,
  expectedPreviousRevision: 0,
  latestRevision: null,
}), { kind: "create", latestRevisionNo: 0, revisionNo: 1 });
assert.equal(decideSpecifications2PublicationRequest({
  requestFingerprint,
  expectedPreviousRevision: 0,
  latestRevision: { id: "revision-1", revision_no: 1 },
}).kind, "revision-conflict", "expected revision must reject a new command before any content dedupe");

const priorRequest = {
  request_fingerprint: requestFingerprint,
  expected_previous_revision: 0,
  resulting_revision_id: "revision-1",
  resulting_revision_no: 1,
};
assert.equal(decideSpecifications2PublicationRequest({
  priorRequest,
  requestFingerprint,
  expectedPreviousRevision: 0,
  latestRevision: { id: "revision-1", revision_no: 1 },
}).kind, "replay", "an exact retry may replay its still-current revision");
assert.equal(decideSpecifications2PublicationRequest({
  priorRequest,
  requestFingerprint: `${requestFingerprint}-different`,
  expectedPreviousRevision: 0,
  latestRevision: { id: "revision-1", revision_no: 1 },
}).kind, "idempotency-conflict", "reuse of a key for another command must conflict");
assert.equal(decideSpecifications2PublicationRequest({
  priorRequest,
  requestFingerprint,
  expectedPreviousRevision: 0,
  latestRevision: { id: "revision-2", revision_no: 2 },
}).kind, "superseded-conflict", "an old exact retry must not pretend its historical revision is current");
assert.deepEqual(decideSpecifications2PublicationRequest({
  requestFingerprint: "revert-to-a",
  expectedPreviousRevision: 2,
  latestRevision: { id: "revision-2", revision_no: 2 },
}), { kind: "create", latestRevisionNo: 2, revisionNo: 3 }, "A after B must allocate a new monotonic revision instead of deduplicating historical A");

console.log("Specifications 2.0 repository pooling QA: OK");
