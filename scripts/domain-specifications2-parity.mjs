import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateSpecifications2Export } from "./domain-specifications2-import.mjs";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function parseArgs(argv) {
  const file = argv.find((arg) => !arg.startsWith("--"));
  if (!file) throw new Error("Usage: npm run domain:postgres:parity-specifications2 -- <specifications2-export.json>");
  return resolve(file);
}
function compare(expected, actual, key, fields, label) {
  const actualByKey = new Map(actual.map((row) => [row[key], row]));
  const mismatches = [];
  expected.forEach((row) => {
    const found = actualByKey.get(row[key]);
    if (!found) { mismatches.push({ key: row[key], reason: "missing" }); return; }
    const different = fields.filter((field) => stable(row[field]) !== stable(found[field]));
    if (different.length) mismatches.push({ key: row[key], fields: different });
    actualByKey.delete(row[key]);
  });
  actualByKey.forEach((_row, extraKey) => mismatches.push({ key: extraKey, reason: "unexpected" }));
  if (mismatches.length) throw new Error(`Specifications 2.0 parity: ${label} mismatch ${JSON.stringify(mismatches.slice(0, 10))}`);
}

async function main() {
  const file = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await readFile(file, "utf-8"));
  validateSpecifications2Export(payload);
  const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured for parity");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const revisionIds = payload.revisions.map((row) => row.id);
    const [documents, revisions, items, routes, operations] = await Promise.all([
      sql`SELECT id, source_entry_id, title, designation FROM specifications2_documents WHERE id = ANY(${payload.documents.map((row) => row.id)})`,
      sql`SELECT id, specification_id, revision_no, fingerprint FROM specifications2_revisions WHERE id = ANY(${revisionIds})`,
      sql`SELECT id, specification_revision_id, source_row_id, parent_source_row_id, designation, name, item_kind, quantity::float8 AS quantity, unit FROM specifications2_revision_items WHERE specification_revision_id = ANY(${revisionIds})`,
      sql`SELECT id, specification_revision_id, source_draft_id, designation, product_label, status FROM specifications2_route_documents WHERE specification_revision_id = ANY(${revisionIds})`,
      sql`SELECT ro.id, ro.route_document_id, ro.source_operation_id, ro.sequence_no, ro.operation_id, ro.name, ro.work_center_id, ro.next_work_center_id, ro.changes_property, ro.input_state, ro.output_state, ro.labor_norm, ro.attachments FROM specifications2_route_operations ro JOIN specifications2_route_documents rd ON rd.id = ro.route_document_id WHERE rd.specification_revision_id = ANY(${revisionIds})`,
    ]);
    compare(payload.documents, documents, "id", ["source_entry_id", "title", "designation"], "documents");
    compare(payload.revisions, revisions, "id", ["specification_id", "revision_no", "fingerprint"], "revisions");
    compare(payload.revisionItems, items, "id", ["specification_revision_id", "source_row_id", "parent_source_row_id", "designation", "name", "item_kind", "quantity", "unit"], "items");
    compare(payload.routeDocuments, routes, "id", ["specification_revision_id", "source_draft_id", "designation", "product_label", "status"], "routes");
    compare(payload.routeOperations, operations, "id", ["route_document_id", "source_operation_id", "sequence_no", "operation_id", "name", "work_center_id", "next_work_center_id", "changes_property", "input_state", "output_state", "labor_norm", "attachments"], "operations");
    console.log(`Specifications 2.0 parity: OK (${payload.documents.length} documents, ${payload.revisions.length} revisions, ${payload.revisionItems.length} items, ${payload.routeDocuments.length} routes, ${payload.routeOperations.length} operations)`);
  } finally { await sql.end({ timeout: 5 }); }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
