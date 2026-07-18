import postgres from "postgres";
import { buildSpecifications2WorkOrderCommand } from "../src/domain/specifications2_work_order.js";
import { buildSpecifications2ReleaseFingerprint, inspectSpecifications2Publication } from "../src/modules/specifications2/publication.js";
import { exportSpecifications2Entry } from "./domain-specifications2-export.mjs";
import { importSpecifications2ExportRows, lockSpecifications2SourceEntries, validateSpecifications2Export } from "./domain-specifications2-import.mjs";

// Revision reads happen on module selection and publication refresh. Reusing a
// small client pool avoids a TCP/TLS/PostgreSQL handshake for every one of
// those requests; explicit process shutdown remains available for tests and
// controlled service restarts.
const READ_CLIENTS_BY_URL = new Map();

function getReadClient(databaseUrl) {
  const existing = READ_CLIENTS_BY_URL.get(databaseUrl);
  if (existing) return existing;
  const client = postgres(databaseUrl, { max: 3, idle_timeout: 10, connect_timeout: 5, prepare: false });
  READ_CLIENTS_BY_URL.set(databaseUrl, client);
  return client;
}

export async function closeSpecifications2ReadClients() {
  await Promise.all([...READ_CLIENTS_BY_URL.values()].map((client) => client.end({ timeout: 5 })));
  READ_CLIENTS_BY_URL.clear();
}

const number = (value = 0) => Number(value || 0);
const iso = (value) => value?.toISOString?.() || "";

// A server publication may be retried after a browser reload. Keep the
// compatibility projection compact and transport-neutral in the PostgreSQL
// outbox; binary file data belongs to the separate attachment storage.
function withoutInlineAttachmentContent(entry = {}) {
  return {
    ...entry,
    routeDrafts: (Array.isArray(entry.routeDrafts) ? entry.routeDrafts : []).map((draft) => ({
      ...draft,
      operations: (Array.isArray(draft.operations) ? draft.operations : []).map((operation) => ({
        ...operation,
        productionFiles: Object.fromEntries(Object.entries(operation?.productionFiles || {}).map(([kind, raw]) => {
          if (!raw || typeof raw !== "object") return [kind, raw];
          const { inlineDataUrl, dataUrl, content, ...metadata } = raw;
          return [kind, metadata];
        })),
      })),
    })),
  };
}

function compatibilityTreeRows(entry = {}) {
  const rows = Array.isArray(entry.treeRows) && entry.treeRows.length
    ? entry.treeRows
    : Array.isArray(entry.editorRows) ? entry.editorRows : [];
  return rows.map((row = {}) => ({
    id: String(row.id || ""),
    selectionKey: String(row.selectionKey || ""),
    nodeKey: String(row.nodeKey || ""),
    parentId: String(row.parentId || ""),
    parentKey: String(row.parentKey || ""),
    level: Number(row.level || 0),
    label: String(row.label || ""),
    designation: String(row.designation || ""),
    type: String(row.type || ""),
    quantity: Number(row.quantity || 0),
    unit: String(row.unit || ""),
    unitOfMeasure: String(row.unitOfMeasure || ""),
    status: String(row.status || ""),
  }));
}

function compatibilityRouteDrafts(entry = {}) {
  return (Array.isArray(entry.routeDrafts) ? entry.routeDrafts : []).map((draft = {}) => ({
    id: String(draft.id || ""),
    productKey: String(draft.productKey || ""),
    designation: String(draft.designation || ""),
    productLabel: String(draft.productLabel || draft.title || ""),
    status: String(draft.status || "draft"),
    operations: (Array.isArray(draft.operations) ? draft.operations : []).map((operation = {}) => ({
      id: String(operation.id || ""),
      operationId: String(operation.operationId || ""),
      name: String(operation.name || operation.operationName || ""),
      workCenterId: String(operation.workCenterId || ""),
      nextWorkCenterId: String(operation.nextWorkCenterId || ""),
      nextOperationId: String(operation.nextOperationId || ""),
      changesProperty: operation.changesProperty !== false,
      inputState: String(operation.inputState || ""),
      outputState: String(operation.outputState || ""),
      instructionRequired: operation.instructionRequired === true,
      laborNorm: operation.laborNorm && typeof operation.laborNorm === "object" ? operation.laborNorm : {},
      productionFiles: withoutInlineAttachmentContent({ routeDrafts: [{ operations: [operation] }] }).routeDrafts[0].operations[0].productionFiles,
    })),
  }));
}

function compatibilityPublicationEntry(entry = {}, revision = {}) {
  const publication = entry?.publication && typeof entry.publication === "object" ? entry.publication : {};
  const releasedAt = String(publication.releasedAt || publication.publishedAt || new Date().toISOString());
  return {
    id: String(entry.id || ""),
    title: String(entry.title || ""),
    createdAt: String(entry.createdAt || ""),
    updatedAt: String(entry.updatedAt || ""),
    selectedRouteDraftId: String(entry.selectedRouteDraftId || ""),
    treeRows: compatibilityTreeRows(entry),
    routeDrafts: compatibilityRouteDrafts(entry),
    publication: {
      ...publication,
      revision: Math.max(1, Number(revision.revision_no || publication.revision || 1)),
      fingerprint: String(publication.fingerprint || buildSpecifications2ReleaseFingerprint(entry)),
      releasedAt,
      status: String(publication.status || "released"),
    },
  };
}

export function normalizeExpectedPreviousRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}

function timestamp(value, fallback = new Date().toISOString()) {
  return String(value?.toISOString?.() || value || fallback);
}

// The browser may prepare a candidate revision for presentation, but it never
// owns the resulting number or timestamp. Rebuild that publication envelope
// from the editor content immediately before the server derives its immutable
// relational payload. This also rejects a forged/stale browser fingerprint.
export function buildAuthoritativePublicationEntry(entry = {}, { revisionNo, releasedAt } = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const priorPublication = source.publication && typeof source.publication === "object" ? source.publication : {};
  const fingerprint = buildSpecifications2ReleaseFingerprint(source);
  if (priorPublication.fingerprint && String(priorPublication.fingerprint) !== fingerprint) {
    throw new Error("Specifications 2.0 revision content changed after its client publication was prepared");
  }
  return {
    ...source,
    publication: {
      ...priorPublication,
      revision: revisionNo,
      fingerprint,
      releasedAt,
      publishedAt: releasedAt,
      status: "released",
    },
  };
}

function useExistingSpecificationId(payload, specificationId) {
  if (!specificationId || payload?.documents?.[0]?.id === specificationId) return payload;
  return {
    ...payload,
    documents: payload.documents.map((document) => ({ ...document, id: specificationId })),
    revisions: payload.revisions.map((revision) => ({ ...revision, specification_id: specificationId })),
  };
}

// Read-only repository for published Specifications 2.0 revisions.  It is
// intentionally independent from the browser snapshot: callers either see a
// complete PostgreSQL projection or an explicit storage error.
export function createSpecifications2ReadRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 read storage");
  const sql = getReadClient(databaseUrl);
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...metadata,
    async summary() {
      const [row] = await sql`
        SELECT
          (SELECT count(*) FROM specifications2_documents)::int AS document_count,
          (SELECT count(*) FROM specifications2_revisions)::int AS revision_count,
          (SELECT count(*) FROM specifications2_revision_items)::int AS item_count,
          (SELECT count(*) FROM specifications2_route_documents)::int AS route_count,
          (SELECT count(*) FROM specifications2_route_operations)::int AS operation_count,
          (SELECT max(released_at) FROM specifications2_revisions) AS updated_at
      `;
      return { ...metadata, updatedAt: iso(row?.updated_at), summary: { documentCount: number(row?.document_count), revisionCount: number(row?.revision_count), itemCount: number(row?.item_count), routeCount: number(row?.route_count), operationCount: number(row?.operation_count) } };
    },
    async list({ limit = 100 } = {}) {
      const rows = await sql`
        SELECT r.id, r.revision_no, r.fingerprint, r.released_at, r.source_updated_at,
               d.id AS specification_id, d.source_entry_id, d.title, d.designation,
               (SELECT count(*) FROM specifications2_revision_items i WHERE i.specification_revision_id = r.id)::int AS item_count,
               (SELECT count(*) FROM specifications2_route_documents rd WHERE rd.specification_revision_id = r.id)::int AS route_count,
               (SELECT count(*) FROM specifications2_route_operations ro JOIN specifications2_route_documents rd ON rd.id = ro.route_document_id WHERE rd.specification_revision_id = r.id)::int AS operation_count
        FROM specifications2_revisions r
        JOIN specifications2_documents d ON d.id = r.specification_id
        ORDER BY r.released_at DESC NULLS LAST, r.revision_no DESC, r.id
        LIMIT ${Math.max(1, Math.min(500, Math.trunc(number(limit) || 100)))}
      `;
      return { ...metadata, items: rows.map((row) => ({ id: row.id, specificationId: row.specification_id, sourceEntryId: row.source_entry_id, title: row.title, designation: row.designation, revisionNo: number(row.revision_no), fingerprint: row.fingerprint, releasedAt: iso(row.released_at), sourceUpdatedAt: iso(row.source_updated_at), itemCount: number(row.item_count), routeCount: number(row.route_count), operationCount: number(row.operation_count) })) };
    },
    async get(revisionId) {
      const revisions = await sql`
        SELECT r.id, r.revision_no, r.fingerprint, r.released_at, r.source_updated_at,
               d.id AS specification_id, d.source_entry_id, d.title, d.designation
        FROM specifications2_revisions r JOIN specifications2_documents d ON d.id = r.specification_id
        WHERE r.id = ${revisionId}
      `;
      const revision = revisions[0];
      if (!revision) return { ...metadata, item: null };
      const [items, routes] = await Promise.all([
        sql`SELECT source_row_id, parent_source_row_id, designation, name, item_kind, quantity, unit FROM specifications2_revision_items WHERE specification_revision_id = ${revisionId} ORDER BY source_row_id`,
        sql`SELECT id, source_draft_id, designation, product_label, status FROM specifications2_route_documents WHERE specification_revision_id = ${revisionId} ORDER BY source_draft_id`,
      ]);
      const routeIds = routes.map((route) => route.id);
      const operations = routeIds.length ? await sql`
        SELECT route_document_id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, changes_property, input_state, output_state, labor_norm, attachments
        FROM specifications2_route_operations WHERE route_document_id = ANY(${routeIds}) ORDER BY route_document_id, sequence_no
      ` : [];
      const operationsByRoute = new Map();
      operations.forEach((operation) => { const group = operationsByRoute.get(operation.route_document_id) || []; group.push({ sourceOperationId: operation.source_operation_id, sequenceNo: number(operation.sequence_no), operationId: operation.operation_id, name: operation.name, workCenterId: operation.work_center_id, nextWorkCenterId: operation.next_work_center_id, changesProperty: operation.changes_property, inputState: operation.input_state, outputState: operation.output_state, laborNorm: operation.labor_norm || {}, attachments: operation.attachments || {} }); operationsByRoute.set(operation.route_document_id, group); });
      return { ...metadata, item: { id: revision.id, specificationId: revision.specification_id, sourceEntryId: revision.source_entry_id, title: revision.title, designation: revision.designation, revisionNo: number(revision.revision_no), fingerprint: revision.fingerprint, releasedAt: iso(revision.released_at), sourceUpdatedAt: iso(revision.source_updated_at), treeItems: items.map((row) => ({ sourceRowId: row.source_row_id, parentSourceRowId: row.parent_source_row_id, designation: row.designation, name: row.name, kind: row.item_kind, quantity: number(row.quantity), unit: row.unit })), routes: routes.map((route) => ({ sourceDraftId: route.source_draft_id, designation: route.designation, productLabel: route.product_label, status: route.status, operations: operationsByRoute.get(route.id) || [] })) } };
    },
    async getLatestBySourceEntry(sourceEntryId) {
      const rows = await sql`
        SELECT r.id FROM specifications2_revisions r
        JOIN specifications2_documents d ON d.id = r.specification_id
        WHERE d.source_entry_id = ${sourceEntryId}
        ORDER BY r.revision_no DESC, r.released_at DESC NULLS LAST, r.id DESC LIMIT 1
      `;
      return rows[0]?.id ? this.get(rows[0].id) : { ...metadata, item: null };
    },
    // Read repositories borrow the process-level pool. Closing a request
    // facade must never tear down a client another concurrent request uses.
    async close() {},
  };
}

// Publication is intentionally separate from the read model and work-order
// command. It accepts one editor entry, derives the immutable relational
// revision server-side and uses the stable revision id as its idempotency key.
export function createSpecifications2PublishCommandRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 publication storage");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...metadata,
    async commandReadiness() {
      try {
        const [row] = await sql`
          SELECT
            to_regclass('public.specifications2_documents') AS documents_table,
            to_regclass('public.specifications2_revisions') AS revisions_table,
            to_regclass('public.specifications2_revision_items') AS items_table,
            to_regclass('public.specifications2_route_documents') AS routes_table,
            to_regclass('public.specifications2_route_operations') AS operations_table,
            to_regclass('public.domain_change_log') AS outbox_table
        `;
        const schemaReady = Boolean(
          row?.documents_table
          && row?.revisions_table
          && row?.items_table
          && row?.routes_table
          && row?.operations_table
          && row?.outbox_table,
        );
        return { ...metadata, schemaReady, error: schemaReady ? "" : "Specifications 2.0 publication tables are missing" };
      } catch (error) {
        return { ...metadata, schemaReady: false, error: error?.message || "Specifications 2.0 publication schema is unavailable" };
      }
    },
    async publish({ entry, expectedPreviousRevision, idempotencyKey, actorId = "" }) {
      if (!idempotencyKey || String(idempotencyKey).length > 160) {
        return { ...metadata, created: false, item: null, error: "Idempotency key is required" };
      }
      const sourceEntryId = String(entry?.id || "").trim();
      if (!sourceEntryId) {
        return { ...metadata, created: false, item: null, error: "Specifications 2.0 source entry id is required" };
      }
      const expectedRevision = normalizeExpectedPreviousRevision(expectedPreviousRevision);
      if (expectedRevision === null) {
        return { ...metadata, created: false, item: null, error: "Expected previous revision is required" };
      }
      const clientRevision = entry?.publication?.revision;
      if (clientRevision !== undefined && clientRevision !== null && String(clientRevision).trim() !== "") {
        const normalizedClientRevision = normalizeExpectedPreviousRevision(clientRevision);
        if (normalizedClientRevision === null || normalizedClientRevision !== expectedRevision + 1) {
          return { ...metadata, created: false, item: null, error: "Client revision must be exactly one greater than its expected previous revision" };
        }
      }
      let candidateEntry;
      let candidatePayload;
      try {
        const inspection = inspectSpecifications2Publication(entry);
        if (!inspection.ready) throw new Error(inspection.issues[0] || "Specifications 2.0 entry is not ready to publish");
        // Revision number and release timestamp are overwritten inside the
        // transaction below. This first projection validates the exact
        // content/fingerprint and lets us validate server attachment ids
        // before opening a write transaction.
        candidateEntry = buildAuthoritativePublicationEntry(entry, {
          revisionNo: Math.max(1, expectedRevision + 1),
          releasedAt: timestamp(entry?.publication?.releasedAt || entry?.publication?.publishedAt),
        });
        candidatePayload = exportSpecifications2Entry(candidateEntry);
        validateSpecifications2Export(candidatePayload);
      } catch (error) {
        return { ...metadata, created: false, item: null, error: error?.message || "Specifications 2.0 entry cannot be published" };
      }
      if (candidatePayload.documents.length !== 1 || candidatePayload.revisions.length !== 1
        || candidatePayload.documents[0]?.source_entry_id !== sourceEntryId) {
        return { ...metadata, created: false, item: null, error: "Publication command accepts exactly one immutable revision" };
      }
      const candidateRevision = candidatePayload.revisions[0];
      const attachmentIds = [...new Set(candidatePayload.routeOperations.flatMap((operation) => Object.values(operation.attachments || {}))
        .filter((attachment) => attachment && typeof attachment === "object" && Object.keys(attachment).length > 0)
        .map((attachment) => String(attachment.serverAttachmentId || "").trim()))];
      if (attachmentIds.includes("")) {
        return { ...metadata, created: false, item: null, error: "Production attachment must be uploaded to server storage before publishing a revision" };
      }
      if (attachmentIds.length) {
        const found = await sql`SELECT id FROM specifications2_attachment_blobs WHERE id = ANY(${attachmentIds})`;
        if (found.length !== attachmentIds.length) return { ...metadata, created: false, item: null, error: "One or more production attachments are missing from server storage" };
      }
      let outcome = null;
      await sql.begin(async (tx) => {
        // This advisory lock is keyed by the editor source, rather than by a
        // client-supplied revision id. Two browser tabs therefore cannot both
        // observe the same next revision and silently publish different
        // content as one immutable release.
        await lockSpecifications2SourceEntries(tx, [sourceEntryId]);
        const documents = await tx`
          SELECT id FROM specifications2_documents
          WHERE source_entry_id = ${sourceEntryId}
          FOR UPDATE
        `;
        const existingDocument = documents[0] || null;
        const specificationId = existingDocument?.id || candidatePayload.documents[0].id;
        const [sameFingerprint] = await tx`
          SELECT id, revision_no, fingerprint, released_at
          FROM specifications2_revisions
          WHERE specification_id = ${specificationId} AND fingerprint = ${candidateRevision.fingerprint}
          FOR UPDATE
        `;
        let revision;
        let authoritativeEntry;
        let created = false;
        if (sameFingerprint) {
          revision = {
            id: sameFingerprint.id,
            revision_no: Number(sameFingerprint.revision_no),
            fingerprint: sameFingerprint.fingerprint,
            released_at: sameFingerprint.released_at,
          };
          authoritativeEntry = buildAuthoritativePublicationEntry(entry, {
            revisionNo: revision.revision_no,
            releasedAt: timestamp(revision.released_at),
          });
        } else {
          const [latest] = await tx`
            SELECT id, revision_no, fingerprint, released_at
            FROM specifications2_revisions
            WHERE specification_id = ${specificationId}
            ORDER BY revision_no DESC
            LIMIT 1
            FOR UPDATE
          `;
          const latestRevisionNo = Math.max(0, Number(latest?.revision_no || 0));
          if (latestRevisionNo !== expectedRevision) {
            outcome = {
              ...metadata,
              created: false,
              item: null,
              conflict: true,
              currentRevision: latestRevisionNo,
              error: `Specifications 2.0 revision changed on the server (current ${latestRevisionNo}, expected ${expectedRevision})`,
            };
            return;
          }
          const releasedAt = new Date().toISOString();
          const revisionNo = latestRevisionNo + 1;
          authoritativeEntry = buildAuthoritativePublicationEntry(entry, { revisionNo, releasedAt });
          const authoritativePayload = useExistingSpecificationId(
            exportSpecifications2Entry(authoritativeEntry),
            existingDocument?.id || "",
          );
          validateSpecifications2Export(authoritativePayload);
          revision = authoritativePayload.revisions[0];
          await importSpecifications2ExportRows(tx, authoritativePayload);
          created = true;
        }
        const compatibilityEntry = compatibilityPublicationEntry(authoritativeEntry, revision);
        // The PostgreSQL revision and its recoverable compatibility delivery
        // commit together. A retry can restore a missing outbox row without
        // creating another immutable revision.
        await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
          VALUES ('specifications2_revision', ${revision.id}, ${revision.revision_no}, 'publish_revision', ${tx.json({
            idempotencyKey: String(idempotencyKey),
            sourceEntryId,
            fingerprint: revision.fingerprint,
            compatibilityEntry,
          })}, ${String(actorId || "") || null}, 'pending')
          ON CONFLICT (aggregate_type, aggregate_id, aggregate_revision) DO NOTHING
        `;
        outcome = { created, revision, publication: compatibilityEntry.publication };
      });
      if (outcome?.conflict) return outcome;
      const read = createSpecifications2ReadRepository({ databaseUrl });
      try {
        const result = await read.get(outcome?.revision?.id || "");
        if (!result.item) return { ...metadata, created: false, item: null, error: "Published revision was not readable after save" };
        return {
          ...metadata,
          created: outcome.created,
          item: result.item,
          publication: outcome.publication,
          idempotencyKey: String(idempotencyKey),
          actorId: String(actorId || ""),
        };
      } finally { await read.close(); }
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}

// Command repository is intentionally separate from the read model.  It is
// enabled only after an explicit feature flag and a snapshot-outbox consumer
// are available, so merely deploying the schema cannot create pilot orders.
export function createSpecifications2WorkOrderCommandRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 command storage");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    async create({ revisionId, routeSourceDraftId, quantity, idempotencyKey, actorId = "" }) {
      return sql.begin(async (tx) => {
        const revisions = await tx`
          SELECT r.id, r.revision_no, d.title, d.designation, d.source_entry_id
          FROM specifications2_revisions r JOIN specifications2_documents d ON d.id = r.specification_id
          WHERE r.id = ${String(revisionId || "")} FOR SHARE
        `;
        const revision = revisions[0];
        if (!revision) return { ...metadata, created: false, item: null, error: "Published Specifications 2.0 revision was not found" };
        const routes = await tx`
          SELECT id, designation, product_label
          FROM specifications2_route_documents
          WHERE specification_revision_id = ${revision.id} AND source_draft_id = ${String(routeSourceDraftId || "")}
          FOR SHARE
        `;
        const route = routes[0];
        if (!route) return { ...metadata, created: false, item: null, error: "Published route was not found in this revision" };
        const existing = await tx`
          SELECT wo.id, wo.number, wo.name, wo.designation, wo.unit, wo.quantity, wo.lifecycle_status, wo.planning_status,
                 wo.source_kind, wo.source_revision, wo.aggregate_revision, wo.updated_at
          FROM specifications2_work_order_sources source
          JOIN work_orders wo ON wo.id = source.work_order_id
          WHERE source.specification_revision_id = ${revision.id}
            AND source.route_document_id = ${route.id}
            AND source.idempotency_key = ${String(idempotencyKey || "")}
          LIMIT 1
        `;
        if (existing[0]) {
          const row = existing[0];
          return { ...metadata, created: false, item: { id: row.id, number: row.number, name: row.name, designation: row.designation, unit: row.unit, quantity: Number(row.quantity), lifecycleStatus: row.lifecycle_status, planningStatus: row.planning_status, source: row.source_kind, revision: Number(row.source_revision), concurrencyRevision: Number(row.aggregate_revision), updatedAt: iso(row.updated_at) } };
        }
        const operations = await tx`
          SELECT id, source_operation_id, sequence_no, operation_id, name, work_center_id, next_work_center_id, labor_norm
          FROM specifications2_route_operations
          WHERE route_document_id = ${route.id}
          ORDER BY sequence_no
          FOR SHARE
        `;
        let command;
        try { command = buildSpecifications2WorkOrderCommand({ revision, route, operations, quantity, idempotencyKey }); }
        catch (error) { return { ...metadata, created: false, item: null, error: error?.message || "Published route cannot create a work order" }; }
        const order = command.workOrder;
        await tx`
          INSERT INTO work_orders (id, number, name, designation, unit, quantity, lifecycle_status, planning_status, source_kind, source_revision, aggregate_revision)
          VALUES (${order.id}, ${order.number}, ${order.name}, ${order.designation}, ${order.unit}, ${order.quantity}, ${order.lifecycleStatus}, ${order.planningStatus}, ${order.sourceKind}, ${order.sourceRevision}, ${order.aggregateRevision})
        `;
        for (const operation of command.operations) {
          await tx`
            INSERT INTO work_order_operations (id, work_order_id, operation_id, name, work_center_id, next_work_center_id, sequence_no, quantity_multiplier, execution_context, labor)
            VALUES (${operation.id}, ${order.id}, ${operation.operationId}, ${operation.name}, ${operation.workCenterId}, ${operation.nextWorkCenterId}, ${operation.sequenceNo}, ${operation.quantityMultiplier}, ${tx.json(operation.executionContext)}, ${tx.json(operation.labor)})
          `;
        }
        await tx`
          INSERT INTO specifications2_work_order_sources (work_order_id, specification_revision_id, route_document_id, idempotency_key)
          VALUES (${order.id}, ${revision.id}, ${route.id}, ${command.source.idempotencyKey})
        `;
        await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
          VALUES ('work_order', ${order.id}, 1, 'create_from_specifications2_revision', ${tx.json({ ...command.source, sourceEntryId: revision.source_entry_id, sourceRevision: order.sourceRevision, routeSourceDraftId, title: revision.title, designation: route.designation || revision.designation })}, ${String(actorId || "") || null}, 'pending')
        `;
        return { ...metadata, created: true, item: { ...order, revision: order.sourceRevision, concurrencyRevision: order.aggregateRevision, updatedAt: "" } };
      });
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
