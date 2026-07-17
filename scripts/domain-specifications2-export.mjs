import { buildSpecifications2ReleaseFingerprint } from "../src/modules/specifications2/publication.js";
import { createHash } from "node:crypto";

const STORAGE_KEY = "mes-specifications-2-registry-v1";

const clean = (value) => String(value ?? "").trim();
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const rowsFor = (entry) => Array.isArray(entry.treeRows) && entry.treeRows.length
  ? entry.treeRows
  : Array.isArray(entry.editorRows) ? entry.editorRows : [];

function stableId(prefix, seed) {
  let hash = 2166136261;
  for (const character of clean(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(clean(value)).digest("hex")}`;
}

function designation(row = {}) {
  return clean(row.designation) || clean(row.label).match(/[А-ЯA-Z]{2,}[А-ЯA-Z0-9.-]*\.\d{3,}(?:\.\d+)?/u)?.[0] || "";
}

function sourceRowId(row, index) {
  return clean(row.id || row.selectionKey || row.nodeKey) || `row-${index + 1}`;
}

// Files can be large inline base64 payloads in the browser snapshot. The
// relational read model stores file metadata only; upload storage is migrated
// separately and must never make a revision export unexpectedly huge.
function attachmentMetadata(value) {
  const files = record(value);
  return Object.fromEntries(Object.entries(files).map(([key, raw]) => {
    const file = record(raw);
    const { inlineDataUrl, dataUrl, content, ...metadata } = file;
    return [key, metadata];
  }));
}

function serializeOperation(operation = {}) {
  const source = record(operation);
  return {
    ...source,
    productionFiles: attachmentMetadata(source.productionFiles),
  };
}

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function validate(payload) {
  const documents = new Set(payload.documents.map((row) => row.id));
  const revisions = new Set(payload.revisions.map((row) => row.id));
  const routes = new Set(payload.routeDocuments.map((row) => row.id));
  const unique = (rows, key, label) => {
    const values = new Set();
    rows.forEach((row) => {
      const value = row[key];
      if (values.has(value)) throw new Error(`Specifications 2.0 export: duplicate ${label} ${value}`);
      values.add(value);
    });
  };
  unique(payload.documents, "id", "document id");
  unique(payload.revisions, "id", "revision id");
  unique(payload.revisionItems, "id", "item id");
  unique(payload.routeDocuments, "id", "route document id");
  unique(payload.routeOperations, "id", "route operation id");
  payload.revisions.forEach((row) => {
    if (!documents.has(row.specification_id)) throw new Error(`Specifications 2.0 export: revision ${row.id} has no document`);
    if (!(row.revision_no > 0) || !row.fingerprint) throw new Error(`Specifications 2.0 export: revision ${row.id} is incomplete`);
  });
  payload.revisionItems.forEach((row) => {
    if (!revisions.has(row.specification_revision_id)) throw new Error(`Specifications 2.0 export: item ${row.id} has no revision`);
  });
  payload.routeDocuments.forEach((row) => {
    if (!revisions.has(row.specification_revision_id)) throw new Error(`Specifications 2.0 export: route ${row.id} has no revision`);
  });
  payload.routeOperations.forEach((row) => {
    if (!routes.has(row.route_document_id)) throw new Error(`Specifications 2.0 export: operation ${row.id} has no route`);
    if (!(row.sequence_no > 0)) throw new Error(`Specifications 2.0 export: operation ${row.id} has an invalid sequence`);
  });
  return payload;
}

export function exportSpecifications2Snapshot(snapshot = {}) {
  const raw = record(snapshot).values?.[STORAGE_KEY];
  if (!raw) return validate({ schemaVersion: "009_specifications2_revision_read_model", documents: [], revisions: [], revisionItems: [], routeDocuments: [], routeOperations: [], skippedDrafts: 0 });
  let registry;
  try { registry = JSON.parse(raw); } catch { throw new Error("Specifications 2.0 export: registry JSON is invalid"); }
  const entries = Array.isArray(registry.registry) ? registry.registry : [];
  const payload = { schemaVersion: "009_specifications2_revision_read_model", documents: [], revisions: [], revisionItems: [], routeDocuments: [], routeOperations: [], skippedDrafts: 0 };
  entries.forEach((rawEntry, entryIndex) => {
    const entry = record(rawEntry);
    const revisionNo = Math.trunc(numeric(entry.publication?.revision));
    if (revisionNo < 1) { payload.skippedDrafts += 1; return; }
    const sourceEntryId = clean(entry.id) || `entry-${entryIndex + 1}`;
    const specificationId = stableId("spec2doc", sourceEntryId);
    const revisionId = stableId("spec2rev", `${sourceEntryId}:r${revisionNo}`);
    const treeRows = rowsFor(entry);
    const root = treeRows.find((row) => numeric(row.level) === 0) || treeRows[0] || {};
    const currentReleaseFingerprint = buildSpecifications2ReleaseFingerprint(entry);
    const publishedFingerprint = clean(entry.publication?.fingerprint);
    if (publishedFingerprint && publishedFingerprint !== currentReleaseFingerprint) {
      throw new Error(`Specifications 2.0 export: ${sourceEntryId} changed after published revision ${revisionNo}; publish a new revision before exporting`);
    }
    // The browser fingerprint intentionally contains the full route shape,
    // including inline attachment contents. Keep its immutable identity, but
    // persist a one-way digest so a database revision never duplicates files.
    const releaseFingerprint = fingerprint(publishedFingerprint || currentReleaseFingerprint);
    payload.documents.push({ id: specificationId, source_entry_id: sourceEntryId, title: clean(entry.title) || clean(root.label) || "Без названия", designation: designation(root), created_at: clean(entry.createdAt) || null, updated_at: clean(entry.updatedAt) || null });
    const publication = { ...record(entry.publication) };
    delete publication.fingerprint;
    payload.revisions.push({ id: revisionId, specification_id: specificationId, revision_no: revisionNo, fingerprint: releaseFingerprint, source_updated_at: clean(entry.updatedAt) || null, released_at: clean(entry.publication?.releasedAt || entry.publication?.publishedAt) || null, source_payload: { publication, selectedRouteDraftId: clean(entry.selectedRouteDraftId) } });
    treeRows.forEach((row, rowIndex) => {
      const sourceId = sourceRowId(row, rowIndex);
      payload.revisionItems.push({ id: stableId("spec2item", `${revisionId}:${sourceId}`), specification_revision_id: revisionId, source_row_id: sourceId, parent_source_row_id: clean(row.parentId || row.parentKey), designation: designation(row), name: clean(row.label) || designation(row) || `Строка ${rowIndex + 1}`, item_kind: clean(row.type) || "item", quantity: numeric(row.quantity, 0), unit: clean(row.unitOfMeasure || row.unit) || "шт.", source_payload: record(row) });
    });
    (Array.isArray(entry.routeDrafts) ? entry.routeDrafts : []).forEach((rawDraft, draftIndex) => {
      const draft = record(rawDraft);
      const sourceDraftId = clean(draft.id) || `route-${draftIndex + 1}`;
      const routeId = stableId("spec2route", `${revisionId}:${sourceDraftId}`);
      payload.routeDocuments.push({ id: routeId, specification_revision_id: revisionId, source_draft_id: sourceDraftId, designation: clean(draft.designation), product_label: clean(draft.productLabel || draft.title), status: clean(draft.status) || "draft", source_payload: { ...draft, operations: undefined } });
      (Array.isArray(draft.operations) ? draft.operations : []).forEach((rawOperation, operationIndex) => {
        const operation = record(rawOperation);
        const sourceOperationId = clean(operation.id) || `${clean(operation.operationId) || "operation"}-${operationIndex + 1}`;
        payload.routeOperations.push({ id: stableId("spec2op", `${routeId}:${sourceOperationId}`), route_document_id: routeId, source_operation_id: sourceOperationId, sequence_no: operationIndex + 1, operation_id: clean(operation.operationId), name: clean(operation.name || operation.operationName), work_center_id: clean(operation.workCenterId), next_work_center_id: clean(operation.nextWorkCenterId), changes_property: operation.changesProperty !== false, input_state: clean(operation.inputState), output_state: clean(operation.outputState), labor_norm: record(operation.laborNorm), attachments: attachmentMetadata(operation.productionFiles), source_payload: serializeOperation(operation) });
      });
    });
  });
  return validate(payload);
}

// Server publication receives one already validated editor entry, not the
// complete legacy shared-state envelope. Keep both paths on the exact same
// immutable projection contract so their fingerprints and relational ids
// cannot diverge during the migration.
export function exportSpecifications2Entry(entry = {}) {
  return exportSpecifications2Snapshot({
    values: {
      [STORAGE_KEY]: JSON.stringify({ registry: [entry] }),
    },
  });
}
