import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const parsed = { apply: false, file: "" };
  for (const arg of argv) {
    if (arg === "--apply") parsed.apply = true;
    else if (!arg.startsWith("--") && !parsed.file) parsed.file = arg;
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!parsed.file) throw new Error("Usage: npm run domain:postgres:import-specifications2 -- <specifications2-export.json> [--apply]");
  return parsed;
}

const required = (value, label) => {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Specifications 2.0 import: ${label} is required`);
  return result;
};
const rows = (payload, name) => {
  if (!Array.isArray(payload?.[name])) throw new Error(`Specifications 2.0 import: ${name} is missing`);
  return payload[name];
};
const unique = (items, key, label) => {
  const seen = new Set();
  items.forEach((item) => {
    const value = required(item?.[key], `${label}.${key}`);
    if (seen.has(value)) throw new Error(`Specifications 2.0 import: duplicate ${label} ${value}`);
    seen.add(value);
  });
  return seen;
};

export function validateSpecifications2Export(payload = {}) {
  if (payload.schemaVersion !== "009_specifications2_revision_read_model") throw new Error("Unsupported Specifications 2.0 export schema");
  const documents = rows(payload, "documents");
  const revisions = rows(payload, "revisions");
  const items = rows(payload, "revisionItems");
  const routes = rows(payload, "routeDocuments");
  const operations = rows(payload, "routeOperations");
  const documentIds = unique(documents, "id", "document");
  unique(documents, "source_entry_id", "document source entry");
  const revisionIds = unique(revisions, "id", "revision");
  const revisionKeys = new Set();
  revisions.forEach((row) => {
    required(row.specification_id, "revision.specification_id");
    if (!documentIds.has(row.specification_id)) throw new Error(`Specifications 2.0 import: revision ${row.id} refers to an unknown document`);
    if (!Number.isInteger(Number(row.revision_no)) || Number(row.revision_no) < 1) throw new Error(`Specifications 2.0 import: revision ${row.id} has invalid revision_no`);
    required(row.fingerprint, "revision.fingerprint");
    const key = `${row.specification_id}\u0000${row.revision_no}`;
    if (revisionKeys.has(key)) throw new Error(`Specifications 2.0 import: duplicate document revision ${key}`);
    revisionKeys.add(key);
  });
  unique(items, "id", "item");
  const itemKeys = new Set();
  items.forEach((row) => {
    if (!revisionIds.has(required(row.specification_revision_id, "item.specification_revision_id"))) throw new Error(`Specifications 2.0 import: item ${row.id} refers to an unknown revision`);
    const key = `${row.specification_revision_id}\u0000${required(row.source_row_id, "item.source_row_id")}`;
    if (itemKeys.has(key)) throw new Error(`Specifications 2.0 import: duplicate source item ${key}`);
    itemKeys.add(key);
    if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0) throw new Error(`Specifications 2.0 import: item ${row.id} has invalid quantity`);
  });
  const routeIds = unique(routes, "id", "route document");
  const routeKeys = new Set();
  routes.forEach((row) => {
    if (!revisionIds.has(required(row.specification_revision_id, "route.specification_revision_id"))) throw new Error(`Specifications 2.0 import: route ${row.id} refers to an unknown revision`);
    const key = `${row.specification_revision_id}\u0000${required(row.source_draft_id, "route.source_draft_id")}`;
    if (routeKeys.has(key)) throw new Error(`Specifications 2.0 import: duplicate source route ${key}`);
    routeKeys.add(key);
  });
  unique(operations, "id", "route operation");
  const operationKeys = new Set();
  const sequences = new Set();
  operations.forEach((row) => {
    if (!routeIds.has(required(row.route_document_id, "operation.route_document_id"))) throw new Error(`Specifications 2.0 import: operation ${row.id} refers to an unknown route`);
    const key = `${row.route_document_id}\u0000${required(row.source_operation_id, "operation.source_operation_id")}`;
    if (operationKeys.has(key)) throw new Error(`Specifications 2.0 import: duplicate source operation ${key}`);
    operationKeys.add(key);
    const sequence = Number(row.sequence_no);
    if (!Number.isInteger(sequence) || sequence < 1) throw new Error(`Specifications 2.0 import: operation ${row.id} has invalid sequence_no`);
    const sequenceKey = `${row.route_document_id}\u0000${sequence}`;
    if (sequences.has(sequenceKey)) throw new Error(`Specifications 2.0 import: duplicate operation sequence ${sequenceKey}`);
    sequences.add(sequenceKey);
  });
  return { documents: documents.length, revisions: revisions.length, items: items.length, routes: routes.length, operations: operations.length };
}

export async function importSpecifications2Export(sql, payload) {
  await sql.begin(async (tx) => {
    // A source revision is immutable. Refuse an id/revision collision whose
    // digest differs rather than silently rewriting manufacturing history.
    for (const row of payload.revisions) {
      const existing = await tx`SELECT fingerprint FROM specifications2_revisions WHERE specification_id = ${row.specification_id} AND revision_no = ${row.revision_no}`;
      if (existing.length && existing[0].fingerprint !== row.fingerprint) {
        throw new Error(`Specifications 2.0 import: revision ${row.specification_id}#${row.revision_no} already exists with another fingerprint`);
      }
    }
    for (const row of payload.documents) {
      await tx`
        INSERT INTO specifications2_documents (id, source_entry_id, title, designation, created_at, updated_at)
        VALUES (${row.id}, ${row.source_entry_id}, ${row.title}, ${row.designation || ""}, COALESCE(${row.created_at || null}, now()), COALESCE(${row.updated_at || null}, now()))
        ON CONFLICT (source_entry_id) DO UPDATE SET title = EXCLUDED.title, designation = EXCLUDED.designation, updated_at = EXCLUDED.updated_at
      `;
    }
    for (const row of payload.revisions) {
      await tx`
        INSERT INTO specifications2_revisions (id, specification_id, revision_no, fingerprint, source_updated_at, released_at, source_payload)
        VALUES (${row.id}, ${row.specification_id}, ${row.revision_no}, ${row.fingerprint}, ${row.source_updated_at || null}, ${row.released_at || null}, ${tx.json(row.source_payload || {})})
        ON CONFLICT (specification_id, revision_no) DO NOTHING
      `;
    }
    for (const row of payload.revisionItems) await tx`
      INSERT INTO specifications2_revision_items (id, specification_revision_id, source_row_id, parent_source_row_id, designation, name, item_kind, quantity, unit, source_payload)
      VALUES (${row.id}, ${row.specification_revision_id}, ${row.source_row_id}, ${row.parent_source_row_id || ""}, ${row.designation || ""}, ${row.name}, ${row.item_kind || "item"}, ${row.quantity}, ${row.unit || "шт."}, ${tx.json(row.source_payload || {})})
      ON CONFLICT (specification_revision_id, source_row_id) DO NOTHING
    `;
    for (const row of payload.routeDocuments) await tx`
      INSERT INTO specifications2_route_documents (id, specification_revision_id, source_draft_id, designation, product_label, status, source_payload)
      VALUES (${row.id}, ${row.specification_revision_id}, ${row.source_draft_id}, ${row.designation || ""}, ${row.product_label || ""}, ${row.status || "draft"}, ${tx.json(row.source_payload || {})})
      ON CONFLICT (specification_revision_id, source_draft_id) DO NOTHING
    `;
    for (const row of payload.routeOperations) await tx`
      INSERT INTO specifications2_route_operations (id, route_document_id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, changes_property, input_state, output_state, labor_norm, attachments, source_payload)
      VALUES (${row.id}, ${row.route_document_id}, ${row.source_operation_id}, ${row.sequence_no}, ${row.operation_id || ""}, ${row.name || ""}, ${row.work_center_id || ""}, ${row.next_work_center_id || ""}, ${row.changes_property !== false}, ${row.input_state || ""}, ${row.output_state || ""}, ${tx.json(row.labor_norm || {})}, ${tx.json(row.attachments || {})}, ${tx.json(row.source_payload || {})})
      ON CONFLICT (route_document_id, source_operation_id) DO NOTHING
    `;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = resolve(args.file);
  const payload = JSON.parse(await readFile(file, "utf-8"));
  const counts = validateSpecifications2Export(payload);
  console.log(`Specifications 2.0 import plan: ${file}`);
  Object.entries(counts).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
  if (!args.apply) { console.log("DRY RUN: no PostgreSQL changes made. Pass --apply only after revision export is immutable."); return; }
  const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured for --apply");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try { await importSpecifications2Export(sql, payload); } finally { await sql.end({ timeout: 5 }); }
  console.log("Specifications 2.0 import: OK");
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
