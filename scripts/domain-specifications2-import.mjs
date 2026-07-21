import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertSpecifications2Quantity } from "../src/domain/specifications2_quantity.js";

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

const text = (value) => String(value ?? "");
const numeric = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};
const timestamp = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toISOString();
};
const jsonValue = (value, fallback = {}) => {
  const serialized = JSON.stringify(value ?? fallback);
  return JSON.parse(serialized === undefined ? JSON.stringify(fallback) : serialized);
};
const canonicalJsonValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJsonValue(value[key])]));
};
const compareText = (left, right) => text(left) < text(right) ? -1 : text(left) > text(right) ? 1 : 0;

export function resolveSpecifications2RevisionIdentity({ document = {}, revision = {}, revisionItems = [] } = {}) {
  const sourcePayload = revision?.source_payload && typeof revision.source_payload === "object" ? revision.source_payload : {};
  const root = [...revisionItems]
    .filter((row) => text(row?.parent_source_row_id) === "")
    .sort((left, right) => compareText(left?.source_row_id, right?.source_row_id))[0] || null;
  const storedTitle = text(revision.revision_title || sourcePayload.revisionTitle);
  const storedDesignation = text(revision.revision_designation || sourcePayload.revisionDesignation);
  const storedState = text(revision.revision_identity_state);
  if (storedTitle || storedDesignation || storedState === "authoritative") {
    return {
      title: storedTitle,
      designation: storedDesignation,
      state: storedState || "authoritative",
    };
  }
  const derivedTitle = text(root?.name);
  const derivedDesignation = text(root?.designation);
  if (derivedTitle || derivedDesignation) {
    return { title: derivedTitle, designation: derivedDesignation, state: storedState || "legacy-derived" };
  }
  return { title: "", designation: "", state: storedState || "legacy-unverified", documentFallbackTitle: text(document.title), documentFallbackDesignation: text(document.designation) };
}

export function buildSpecifications2RevisionRelationalProjection({
  document = {},
  revision = {},
  revisionItems = [],
  routeDocuments = [],
  routeOperations = [],
} = {}) {
  const revisionIdentity = resolveSpecifications2RevisionIdentity({ document, revision, revisionItems });
  return canonicalJsonValue({
    document: {
      id: text(document.id),
      sourceEntryId: text(document.source_entry_id),
    },
    revision: {
      id: text(revision.id),
      specificationId: text(revision.specification_id),
      revisionNo: numeric(revision.revision_no),
      fingerprint: text(revision.fingerprint),
      title: revisionIdentity.title,
      designation: revisionIdentity.designation,
      identityState: revisionIdentity.state,
      sourceUpdatedAt: timestamp(revision.source_updated_at),
      releasedAt: timestamp(revision.released_at),
      sourcePayload: jsonValue(revision.source_payload),
    },
    revisionItems: revisionItems.map((row = {}) => ({
      id: text(row.id),
      specificationRevisionId: text(row.specification_revision_id),
      sourceRowId: text(row.source_row_id),
      parentSourceRowId: text(row.parent_source_row_id),
      designation: text(row.designation),
      name: text(row.name),
      itemKind: text(row.item_kind || "item"),
      quantity: assertSpecifications2Quantity(row.quantity, `Specifications 2.0 item ${text(row.id) || "unknown"} quantity`),
      unit: text(row.unit || "шт."),
      sourcePayload: jsonValue(row.source_payload),
    })).sort((left, right) => compareText(left.id, right.id)),
    routeDocuments: routeDocuments.map((row = {}) => ({
      id: text(row.id),
      specificationRevisionId: text(row.specification_revision_id),
      sourceDraftId: text(row.source_draft_id),
      designation: text(row.designation),
      productLabel: text(row.product_label),
      status: text(row.status || "draft"),
      sourcePayload: jsonValue(row.source_payload),
    })).sort((left, right) => compareText(left.id, right.id)),
    routeOperations: routeOperations.map((row = {}) => ({
      id: text(row.id),
      routeDocumentId: text(row.route_document_id),
      sourceOperationId: text(row.source_operation_id),
      sequenceNo: numeric(row.sequence_no),
      operationId: text(row.operation_id),
      name: text(row.name),
      workCenterId: text(row.work_center_id),
      nextWorkCenterId: text(row.next_work_center_id),
      changesProperty: row.changes_property !== false,
      inputState: text(row.input_state),
      outputState: text(row.output_state),
      laborNorm: jsonValue(row.labor_norm),
      attachments: jsonValue(row.attachments),
      sourcePayload: jsonValue(row.source_payload),
    })).sort((left, right) => compareText(`${left.routeDocumentId}\u0000${String(left.sequenceNo).padStart(10, "0")}\u0000${left.id}`,
      `${right.routeDocumentId}\u0000${String(right.sequenceNo).padStart(10, "0")}\u0000${right.id}`)),
  });
}

export function buildSpecifications2RevisionRelationalDigest(input = {}) {
  const projection = buildSpecifications2RevisionRelationalProjection(input);
  return `sha256:${createHash("sha256").update(JSON.stringify(projection)).digest("hex")}`;
}

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
    try { assertSpecifications2Quantity(row.quantity, `Specifications 2.0 import: item ${row.id} quantity`); }
    catch (error) { throw new Error(error?.message || `Specifications 2.0 import: item ${row.id} has invalid quantity`); }
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

// A revision number is allocated per editor source, not per HTTP request.
// The command path and the bulk-import path must take the same transaction
// lock; otherwise a direct import can race a server-first publish between its
// conflict check and INSERT. Sorting prevents a multi-document import from
// taking locks in a different order than another import.
export async function lockSpecifications2SourceEntries(tx, sourceEntryIds = []) {
  const ids = [...new Set(sourceEntryIds.map((value) => String(value || "").trim()).filter(Boolean))].sort();
  for (const sourceEntryId of ids) {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`specifications2:source:${sourceEntryId}`}))`;
  }
}

function incomingProjectionForRevision(payload, revision) {
  const document = (payload.documents || []).find((row) => row?.id === revision?.specification_id) || {};
  const revisionItems = (payload.revisionItems || []).filter((row) => row?.specification_revision_id === revision?.id);
  const routeDocuments = (payload.routeDocuments || []).filter((row) => row?.specification_revision_id === revision?.id);
  const routeIds = new Set(routeDocuments.map((row) => row?.id));
  const routeOperations = (payload.routeOperations || []).filter((row) => routeIds.has(row?.route_document_id));
  return { document, revision, revisionItems, routeDocuments, routeOperations };
}

async function assertExistingSpecifications2RevisionMatches(tx, payload, incomingRevision) {
  const [existing] = await tx`
    SELECT existing_revision.id,
           existing_revision.specification_id,
           existing_revision.revision_no,
           existing_revision.fingerprint,
           existing_revision.revision_title,
           existing_revision.revision_designation,
           existing_revision.revision_identity_state,
           existing_revision.source_updated_at,
           existing_revision.released_at,
           existing_revision.source_payload,
           existing_document.id AS document_id,
           existing_document.source_entry_id AS document_source_entry_id,
           existing_document.title AS document_title,
           existing_document.designation AS document_designation
    FROM specifications2_revisions existing_revision
    JOIN specifications2_documents existing_document ON existing_document.id = existing_revision.specification_id
    WHERE existing_revision.specification_id = ${incomingRevision.specification_id}
      AND existing_revision.revision_no = ${incomingRevision.revision_no}
    FOR UPDATE OF existing_revision, existing_document
  `;
  if (!existing) return false;

  const revisionItems = await tx`
    SELECT id, specification_revision_id, source_row_id, parent_source_row_id,
           designation, name, item_kind, quantity, unit, source_payload
    FROM specifications2_revision_items
    WHERE specification_revision_id = ${existing.id}
    ORDER BY id
    FOR UPDATE
  `;
  const routeDocuments = await tx`
    SELECT id, specification_revision_id, source_draft_id, designation,
           product_label, status, source_payload
    FROM specifications2_route_documents
    WHERE specification_revision_id = ${existing.id}
    ORDER BY id
    FOR UPDATE
  `;
  const routeIds = routeDocuments.map((row) => row.id);
  const routeOperations = routeIds.length ? await tx`
    SELECT id, route_document_id, source_operation_id, sequence_no, operation_id,
           name, work_center_id, next_work_center_id, changes_property,
           input_state, output_state, labor_norm, attachments, source_payload
    FROM specifications2_route_operations
    WHERE route_document_id = ANY(${routeIds})
    ORDER BY route_document_id, sequence_no, id
    FOR UPDATE
  ` : [];

  const incomingDigest = buildSpecifications2RevisionRelationalDigest(incomingProjectionForRevision(payload, incomingRevision));
  const persistedDigest = buildSpecifications2RevisionRelationalDigest({
    document: {
      id: existing.document_id,
      source_entry_id: existing.document_source_entry_id,
      title: existing.document_title,
      designation: existing.document_designation,
    },
    revision: existing,
    revisionItems,
    routeDocuments,
    routeOperations,
  });
  if (persistedDigest !== incomingDigest) {
    throw new Error(`Specifications 2.0 import: revision ${incomingRevision.specification_id}#${incomingRevision.revision_no} already exists with another relational projection`);
  }
  return true;
}

// Reusable transactional import core. Command handlers may append a durable
// outbox row in the same PostgreSQL transaction; committing the relational
// revision first and the compatibility delivery later leaves an unrecoverable
// gap if the process dies between those two writes.
export async function importSpecifications2ExportRows(tx, payload) {
  await lockSpecifications2SourceEntries(tx, (payload.documents || []).map((row) => row?.source_entry_id));
  // Historical v4/v5 release fingerprints omitted fields that drive the
  // relational projection. Lock and compare every persisted row before the
  // first document/child write, so a same-fingerprint replay can never create
  // a hybrid immutable revision. The same exact-row contract also applies to
  // v6 and future adapter payloads.
  const existingRevisionIds = new Set();
  for (const row of payload.revisions) {
    if (await assertExistingSpecifications2RevisionMatches(tx, payload, row)) existingRevisionIds.add(row.id);
  }
  const revisionIdsByDocument = new Map();
  for (const row of payload.revisions) {
    const ids = revisionIdsByDocument.get(row.specification_id) || [];
    ids.push(row.id);
    revisionIdsByDocument.set(row.specification_id, ids);
  }
  const documentsToWrite = payload.documents.filter((row) => {
    const revisionIds = revisionIdsByDocument.get(row.id) || [];
    return revisionIds.length === 0 || revisionIds.some((revisionId) => !existingRevisionIds.has(revisionId));
  });
  const revisionsToWrite = payload.revisions.filter((row) => !existingRevisionIds.has(row.id));
  const revisionIdentityById = new Map(revisionsToWrite.map((row) => {
    const projection = incomingProjectionForRevision(payload, row);
    return [row.id, resolveSpecifications2RevisionIdentity(projection)];
  }));
  const revisionItemsToWrite = payload.revisionItems.filter((row) => !existingRevisionIds.has(row.specification_revision_id));
  const routeDocumentsToWrite = payload.routeDocuments.filter((row) => !existingRevisionIds.has(row.specification_revision_id));
  const routeIdsToWrite = new Set(routeDocumentsToWrite.map((row) => row.id));
  const routeOperationsToWrite = payload.routeOperations.filter((row) => routeIdsToWrite.has(row.route_document_id));

  for (const row of documentsToWrite) {
    await tx`
      INSERT INTO specifications2_documents (id, source_entry_id, title, designation, created_at, updated_at)
      VALUES (${row.id}, ${row.source_entry_id}, ${row.title}, ${row.designation || ""}, COALESCE(${row.created_at || null}, now()), COALESCE(${row.updated_at || null}, now()))
      ON CONFLICT (source_entry_id) DO UPDATE SET title = EXCLUDED.title, designation = EXCLUDED.designation, updated_at = EXCLUDED.updated_at
    `;
  }
  for (const row of revisionsToWrite) {
    const identity = revisionIdentityById.get(row.id) || { title: "", designation: "", state: "legacy-unverified" };
    await tx`
      INSERT INTO specifications2_revisions (id, specification_id, revision_no, fingerprint, revision_title, revision_designation, revision_identity_state, source_updated_at, released_at, source_payload)
      VALUES (${row.id}, ${row.specification_id}, ${row.revision_no}, ${row.fingerprint}, ${identity.title || null}, ${identity.designation || null}, ${identity.state}, ${row.source_updated_at || null}, ${row.released_at || null}, ${tx.json(row.source_payload || {})})
      ON CONFLICT (specification_id, revision_no) DO NOTHING
    `;
  }
  for (const row of revisionItemsToWrite) await tx`
    INSERT INTO specifications2_revision_items (id, specification_revision_id, source_row_id, parent_source_row_id, designation, name, item_kind, quantity, unit, source_payload)
    VALUES (${row.id}, ${row.specification_revision_id}, ${row.source_row_id}, ${row.parent_source_row_id || ""}, ${row.designation || ""}, ${row.name}, ${row.item_kind || "item"}, ${row.quantity}, ${row.unit || "шт."}, ${tx.json(row.source_payload || {})})
    ON CONFLICT (specification_revision_id, source_row_id) DO NOTHING
  `;
  for (const row of routeDocumentsToWrite) await tx`
    INSERT INTO specifications2_route_documents (id, specification_revision_id, source_draft_id, designation, product_label, status, source_payload)
    VALUES (${row.id}, ${row.specification_revision_id}, ${row.source_draft_id}, ${row.designation || ""}, ${row.product_label || ""}, ${row.status || "draft"}, ${tx.json(row.source_payload || {})})
    ON CONFLICT (specification_revision_id, source_draft_id) DO NOTHING
  `;
  for (const row of routeOperationsToWrite) await tx`
    INSERT INTO specifications2_route_operations (id, route_document_id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, changes_property, input_state, output_state, labor_norm, attachments, source_payload)
    VALUES (${row.id}, ${row.route_document_id}, ${row.source_operation_id}, ${row.sequence_no}, ${row.operation_id || ""}, ${row.name || ""}, ${row.work_center_id || ""}, ${row.next_work_center_id || ""}, ${row.changes_property !== false}, ${row.input_state || ""}, ${row.output_state || ""}, ${tx.json(row.labor_norm || {})}, ${tx.json(row.attachments || {})}, ${tx.json(row.source_payload || {})})
    ON CONFLICT (route_document_id, source_operation_id) DO NOTHING
  `;
}

export async function importSpecifications2Export(sql, payload) {
  await sql.begin(async (tx) => importSpecifications2ExportRows(tx, payload));
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
