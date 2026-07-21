import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

import { createSpecifications2WorkOrderCommandRepository } from "./domain-specifications2-repository.mjs";
import { createPostgresWorkOrdersRepository, closePostgresDomainClients } from "./domain-postgres-repository.mjs";
import { createWorkOrdersRepository } from "./domain-work-orders-repository.mjs";
import { syncPendingSnapshotChanges } from "./domain-snapshot-sync.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const databaseUrl = process.env.MES_DOMAIN_E2E_DATABASE_URL || process.env.DATABASE_URL || "";
if (!databaseUrl) throw new Error("MES_DOMAIN_E2E_DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const directory = await mkdtemp(join(tmpdir(), "mes-spec2-command-e2e-"));
const snapshotFile = join(directory, "shared-state.json");
try {
  const now = new Date().toISOString();
  await sql`
    INSERT INTO specifications2_documents (id, source_entry_id, title, designation)
    VALUES ('e2e-doc', 'e2e-source-entry', 'E2E изделие', 'E2E.001')
  `;
  await sql`
    INSERT INTO specifications2_revisions (
      id, specification_id, revision_no, fingerprint,
      revision_title, revision_designation, revision_identity_state, released_at
    )
    VALUES ('e2e-revision', 'e2e-doc', 1, 'sha256:e2e', 'E2E изделие', 'E2E.001', 'authoritative', ${now})
  `;
  await sql`
    INSERT INTO specifications2_route_documents (id, specification_revision_id, source_draft_id, designation, product_label, status)
    VALUES ('e2e-route', 'e2e-revision', 'e2e-route-draft', 'E2E.001', 'E2E изделие', 'released')
  `;
  await sql`
    INSERT INTO specifications2_route_operations (id, route_document_id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, labor_norm)
    VALUES ('e2e-op-1', 'e2e-route', 'e2e-source-op-1', 1, 'OP-E2E-1', 'E2E монтаж', 'D1', 'D2', ${sql.json({ unitsPerHour: 12, setupMinutes: 5 })})
  `;
  await writeFile(snapshotFile, JSON.stringify({ version: 1, updatedAt: now, values: { "mes-planning-prototype-state-v2": JSON.stringify({ routes: [], routeSteps: [], slots: [] }) } }), "utf8");

  const command = createSpecifications2WorkOrderCommandRepository({ databaseUrl });
  const first = await command.create({ revisionId: "e2e-revision", routeSourceDraftId: "e2e-route-draft", quantity: 7, idempotencyKey: "e2e-request", actorId: "employee:e2e-operator" });
  const retry = await command.create({ revisionId: "e2e-revision", routeSourceDraftId: "e2e-route-draft", quantity: 7, idempotencyKey: "e2e-request", actorId: "employee:e2e-operator" });
  const quantityConflict = await command.create({ revisionId: "e2e-revision", routeSourceDraftId: "e2e-route-draft", quantity: 8, idempotencyKey: "e2e-request", actorId: "employee:e2e-operator" });
  const otherActor = await command.create({ revisionId: "e2e-revision", routeSourceDraftId: "e2e-route-draft", quantity: 7, idempotencyKey: "e2e-request", actorId: "employee:other-operator" });
  await command.close();
  assert(first.created && first.item?.id, "first command must create one server work order");
  assert(!retry.created && retry.item?.id === first.item.id, "idempotent retry must return the existing order");
  assert(quantityConflict.idempotencyConflict && quantityConflict.conflict && !quantityConflict.item, "same key with a different normalized quantity must conflict");
  assert(otherActor.created && otherActor.item?.id && otherActor.item.id !== first.item.id, "the same key from another employee must create an independent actor-scoped order");

  const [receipt] = await sql`
    SELECT request_fingerprint, request_quantity, request_actor_scope
    FROM specifications2_work_order_sources
    WHERE work_order_id = ${first.item.id}
  `;
  assert(/^sha256:[0-9a-f]{64}$/.test(String(receipt?.request_fingerprint || "")), "Work Order receipt must persist the canonical request fingerprint");
  assert(Number(receipt?.request_quantity) === 7 && receipt?.request_actor_scope === "employee:e2e-operator", "Work Order receipt must bind persisted quantity and actor scope");

  let legacyInsertError = null;
  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO work_orders (id, number, name, designation, unit, quantity, lifecycle_status, planning_status, source_kind, source_revision, aggregate_revision)
        VALUES ('e2e-legacy-wo', 'WO-E2E-LEGACY', 'E2E изделие', 'E2E.001', 'шт.', 7, 'released', 'draft', 'specifications2', 1, 1)
      `;
      await tx`
        INSERT INTO specifications2_work_order_sources (work_order_id, specification_revision_id, route_document_id, idempotency_key)
        VALUES ('e2e-legacy-wo', 'e2e-revision', 'e2e-route', 'e2e-legacy-request')
      `;
    });
  } catch (error) {
    legacyInsertError = error;
  }
  assert(legacyInsertError, "release .25 source inserts without a fingerprint must fail closed after migration 030");
  const [legacyOrder] = await sql`SELECT id FROM work_orders WHERE id = 'e2e-legacy-wo'`;
  assert(!legacyOrder, "legacy Work Order and its preceding transaction writes must roll back atomically");

  const primary = createPostgresWorkOrdersRepository({ databaseUrl });
  const snapshot = createWorkOrdersRepository({ filePath: snapshotFile, env: {} });
  const synced = await syncPendingSnapshotChanges({ primary, snapshot });
  const mirrored = await snapshot.get(first.item.id);
  const [outbox] = await sql`SELECT snapshot_sync_state, actor_id FROM domain_change_log WHERE aggregate_id = ${first.item.id}`;
  assert(synced.applied === 2 && synced.conflicts === 0 && synced.failed === 0, "outbox must create both actor-scoped compatible snapshot projections");
  assert(mirrored.item?.source === "specifications2" && mirrored.item?.quantity === 7 && mirrored.item?.operations?.length === 1, "snapshot projection must retain source, quantity and operations");
  assert(outbox?.snapshot_sync_state === "applied", "outbox must close only after projection succeeds");
  assert(outbox?.actor_id === "employee:e2e-operator", "server command audit must retain the server-derived actor");
  console.log(JSON.stringify({ ok: true, workOrderId: first.item.id, otherActorWorkOrderId: otherActor.item.id, retryCreated: retry.created, conflicts: 1, legacyInsertRejected: true, synced, operations: mirrored.item.operations.length }));
} finally {
  await closePostgresDomainClients();
  await sql.end({ timeout: 5 });
  await rm(directory, { recursive: true, force: true });
}
