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
    INSERT INTO specifications2_revisions (id, specification_id, revision_no, fingerprint, released_at)
    VALUES ('e2e-revision', 'e2e-doc', 1, 'sha256:e2e', ${now})
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
  const first = await command.create({ revisionId: "e2e-revision", routeSourceDraftId: "e2e-route-draft", quantity: 7, idempotencyKey: "e2e-request", actorId: "public:e2e-operator" });
  const retry = await command.create({ revisionId: "e2e-revision", routeSourceDraftId: "e2e-route-draft", quantity: 7, idempotencyKey: "e2e-request", actorId: "public:e2e-operator" });
  await command.close();
  assert(first.created && first.item?.id, "first command must create one server work order");
  assert(!retry.created && retry.item?.id === first.item.id, "idempotent retry must return the existing order");

  const primary = createPostgresWorkOrdersRepository({ databaseUrl });
  const snapshot = createWorkOrdersRepository({ filePath: snapshotFile, env: {} });
  const synced = await syncPendingSnapshotChanges({ primary, snapshot });
  const mirrored = await snapshot.get(first.item.id);
  const [outbox] = await sql`SELECT snapshot_sync_state, actor_id FROM domain_change_log WHERE aggregate_id = ${first.item.id}`;
  assert(synced.applied === 1 && synced.conflicts === 0 && synced.failed === 0, "outbox must create a compatible snapshot projection");
  assert(mirrored.item?.source === "specifications2" && mirrored.item?.quantity === 7 && mirrored.item?.operations?.length === 1, "snapshot projection must retain source, quantity and operations");
  assert(outbox?.snapshot_sync_state === "applied", "outbox must close only after projection succeeds");
  assert(outbox?.actor_id === "public:e2e-operator", "server command audit must retain the server-derived actor");
  console.log(JSON.stringify({ ok: true, workOrderId: first.item.id, retryCreated: retry.created, synced, operations: mirrored.item.operations.length }));
} finally {
  await closePostgresDomainClients();
  await sql.end({ timeout: 5 });
  await rm(directory, { recursive: true, force: true });
}
