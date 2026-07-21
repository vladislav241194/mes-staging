import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  buildSpecifications2RevisionRelationalDigest,
  importSpecifications2ExportRows,
  resolveSpecifications2RevisionIdentity,
  validateSpecifications2Export,
} from "./domain-specifications2-import.mjs";
import { SPECIFICATIONS2_QUANTITY_MAX, assertSpecifications2Quantity } from "../src/domain/specifications2_quantity.js";
import { exportSpecifications2Entry } from "./domain-specifications2-export.mjs";
import { buildSpecifications2ReleaseFingerprint } from "../src/modules/specifications2/publication.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const payload = { schemaVersion: "009_specifications2_revision_read_model", documents: [{ id: "doc-1", source_entry_id: "entry-1", title: "Изделие", designation: "АБВГ.001.001" }], revisions: [{ id: "rev-1", specification_id: "doc-1", revision_no: 1, fingerprint: JSON.stringify({ adapterVersion: 5, legacy: "same-incomplete-identity" }), revision_title: "Изделие", revision_designation: "АБВГ.001.001", revision_identity_state: "authoritative", source_payload: { revisionTitle: "Изделие", revisionDesignation: "АБВГ.001.001" } }], revisionItems: [{ id: "item-1", specification_revision_id: "rev-1", source_row_id: "row-1", parent_source_row_id: "", designation: "АБВГ.001.001", name: "Изделие", item_kind: "item", quantity: 1, unit: "шт.", source_payload: {} }], routeDocuments: [{ id: "route-1", specification_revision_id: "rev-1", source_draft_id: "draft-1", designation: "АБВГ.001.001", product_label: "Изделие", status: "released", source_payload: {} }], routeOperations: [{ id: "op-1", route_document_id: "route-1", source_operation_id: "source-op-1", sequence_no: 1, operation_id: "OP-1", name: "Монтаж", work_center_id: "D1", next_work_center_id: "", changes_property: true, input_state: "", output_state: "", labor_norm: { calculationMode: "unit", unitsPerHour: 60 }, attachments: {}, source_payload: {} }] };
const counts = validateSpecifications2Export(payload);
assert(counts.documents === 1 && counts.revisions === 1 && counts.operations === 1, "Validator must return a complete revision import plan");
assert(resolveSpecifications2RevisionIdentity({
  document: { title: "Mutable current title", designation: "CURRENT" },
  revision: {},
  revisionItems: payload.revisionItems,
}).state === "legacy-derived", "legacy revision identity must be derived from its immutable root row");
assert(resolveSpecifications2RevisionIdentity({
  document: { title: "Mutable current title", designation: "CURRENT" },
  revision: {},
  revisionItems: [],
}).state === "legacy-unverified", "missing legacy identity must remain unverified rather than borrowing current document metadata");
let orphan = "";
try { validateSpecifications2Export({ ...payload, revisionItems: [{ ...payload.revisionItems[0], specification_revision_id: "missing" }] }); } catch (error) { orphan = String(error.message); }
assert(/unknown revision/.test(orphan), "Validator must reject orphan revision items");
let duplicateSequence = "";
try { validateSpecifications2Export({ ...payload, routeOperations: [...payload.routeOperations, { ...payload.routeOperations[0], id: "op-2", source_operation_id: "source-op-2" }] }); } catch (error) { duplicateSequence = String(error.message); }
assert(/duplicate operation sequence/.test(duplicateSequence), "Validator must reject duplicate route sequences");

for (const invalidQuantity of [1.2345, 0.0004, 100_000_000_000]) {
  const invalidPayload = structuredClone(payload);
  invalidPayload.revisionItems[0].quantity = invalidQuantity;
  let quantityError = "";
  try { validateSpecifications2Export(invalidPayload); }
  catch (error) { quantityError = String(error?.message || error); }
  assert(/NUMERIC\(14,3\)/.test(quantityError), `quantity ${invalidQuantity} must fail before PostgreSQL can round it`);
  let digestError = "";
  try {
    buildSpecifications2RevisionRelationalDigest({
      document: invalidPayload.documents[0],
      revision: invalidPayload.revisions[0],
      revisionItems: invalidPayload.revisionItems,
      routeDocuments: invalidPayload.routeDocuments,
      routeOperations: invalidPayload.routeOperations,
    });
  } catch (error) { digestError = String(error?.message || error); }
  assert(/NUMERIC\(14,3\)/.test(digestError), `quantity ${invalidQuantity} must fail before immutable digest construction`);
}
for (const validQuantity of [1.235, SPECIFICATIONS2_QUANTITY_MAX]) {
  assert(assertSpecifications2Quantity(validQuantity) === validQuantity, `quantity ${validQuantity} must be exactly representable`);
  const validPayload = structuredClone(payload);
  validPayload.revisionItems[0].quantity = validQuantity;
  assert(validateSpecifications2Export(validPayload).items === 1, `quantity ${validQuantity} must pass import validation`);
}
const legacyExportEntry = {
  id: "legacy-quantity-export",
  treeRows: [{ id: "root", level: 0, label: "АБВГ.001.001 Изделие", designation: "АБВГ.001.001", quantity: 1.2345, unit: "шт." }],
  routeDrafts: [{ id: "route-1", designation: "АБВГ.001.001", operations: [] }],
  publication: { revision: 1 },
};
legacyExportEntry.publication.fingerprint = buildSpecifications2ReleaseFingerprint(legacyExportEntry, { adapterVersion: 5 });
let exportQuantityError = "";
try { exportSpecifications2Entry(legacyExportEntry); }
catch (error) { exportQuantityError = String(error?.message || error); }
assert(/NUMERIC\(14,3\)/.test(exportQuantityError), "legacy export must reject an unrepresentable quantity instead of relying on its incomplete fingerprint");

function makePersistedRevisionTx(sourcePayload = payload) {
  const writes = [];
  const persistedIdentity = resolveSpecifications2RevisionIdentity({
    document: sourcePayload.documents[0],
    revision: sourcePayload.revisions[0],
    revisionItems: sourcePayload.revisionItems,
  });
  const persisted = {
    revision: {
      id: "rev-1",
      specification_id: "doc-1",
      revision_no: 1,
      fingerprint: sourcePayload.revisions[0].fingerprint,
      revision_title: persistedIdentity.title || null,
      revision_designation: persistedIdentity.designation || null,
      revision_identity_state: persistedIdentity.state,
      source_updated_at: null,
      released_at: null,
      source_payload: structuredClone(sourcePayload.revisions[0].source_payload || {}),
      document_id: "doc-1",
      document_source_entry_id: "entry-1",
      document_title: "Изделие",
      document_designation: "АБВГ.001.001",
    },
    revisionItems: [{ ...sourcePayload.revisionItems[0], quantity: "1.000" }],
    routeDocuments: [{ ...sourcePayload.routeDocuments[0] }],
    routeOperations: [{ ...sourcePayload.routeOperations[0] }],
  };
  const tx = async (parts) => {
    const query = parts.join(" ").replace(/\s+/gu, " ").trim();
    if (query.includes("pg_advisory_xact_lock")) return [];
    if (query.includes("FROM specifications2_revisions existing_revision")) return [{ ...persisted.revision }];
    if (query.includes("FROM specifications2_revision_items")) return structuredClone(persisted.revisionItems);
    if (query.includes("FROM specifications2_route_documents")) return structuredClone(persisted.routeDocuments);
    if (query.includes("FROM specifications2_route_operations")) return structuredClone(persisted.routeOperations);
    if (/^(?:INSERT|UPDATE|DELETE)\b/u.test(query)) { writes.push(query); return []; }
    throw new Error(`Unexpected Specifications 2.0 import QA query: ${query}`);
  };
  tx.json = (value) => value;
  return { tx, writes, persisted };
}

const exactTx = makePersistedRevisionTx();
assert(buildSpecifications2RevisionRelationalDigest({
  document: payload.documents[0],
  revision: payload.revisions[0],
  revisionItems: payload.revisionItems,
  routeDocuments: payload.routeDocuments,
  routeOperations: payload.routeOperations,
}) === buildSpecifications2RevisionRelationalDigest({
  document: {
    id: exactTx.persisted.revision.document_id,
    source_entry_id: exactTx.persisted.revision.document_source_entry_id,
    title: exactTx.persisted.revision.document_title,
    designation: exactTx.persisted.revision.document_designation,
  },
  revision: exactTx.persisted.revision,
  revisionItems: exactTx.persisted.revisionItems,
  routeDocuments: exactTx.persisted.routeDocuments,
  routeOperations: exactTx.persisted.routeOperations,
}), "exact relational digest must normalize PostgreSQL numeric/JSON representations without upgrading a v5 identity");
await importSpecifications2ExportRows(exactTx.tx, structuredClone(payload));
assert(exactTx.writes.length === 0, "an exact historical v5 relational replay must be a byte-preserving no-op");
const legacyPayload = structuredClone(payload);
delete legacyPayload.revisions[0].revision_title;
delete legacyPayload.revisions[0].revision_designation;
delete legacyPayload.revisions[0].revision_identity_state;
legacyPayload.revisions[0].source_payload = {};
const legacyTx = makePersistedRevisionTx(legacyPayload);
await importSpecifications2ExportRows(legacyTx.tx, legacyPayload);
assert(legacyTx.writes.length === 0, "an exact pre-identity revision replay must match its migration-derived immutable root identity");
for (const adapterVersion of [4, 6]) {
  const compatiblePayload = structuredClone(payload);
  compatiblePayload.revisions[0].fingerprint = JSON.stringify({ adapterVersion, identity: `exact-v${adapterVersion}` });
  const compatibleTx = makePersistedRevisionTx(compatiblePayload);
  await importSpecifications2ExportRows(compatibleTx.tx, compatiblePayload);
  assert(compatibleTx.writes.length === 0, `an exact adapter v${adapterVersion} relational replay must be a byte-preserving no-op`);
}

const adversarialMutations = [
  ["revision title", (value) => { value.revisions[0].revision_title = "Другое изделие"; value.revisions[0].source_payload.revisionTitle = "Другое изделие"; }],
  ["route productLabel", (value) => { value.routeDocuments[0].product_label = "Другая подпись"; }],
  ["operation id", (value) => { value.routeOperations[0].operation_id = "OP-FORGED"; }],
  ["operation name", (value) => { value.routeOperations[0].name = "Подменённая операция"; }],
];
for (const [label, mutate] of adversarialMutations) {
  const incoming = structuredClone(payload);
  mutate(incoming);
  const adversarialTx = makePersistedRevisionTx();
  let rejection = "";
  try { await importSpecifications2ExportRows(adversarialTx.tx, incoming); }
  catch (error) { rejection = String(error?.message || error); }
  assert(/another relational projection/.test(rejection), `same-fingerprint ${label} tampering must fail closed`);
  assert(adversarialTx.writes.length === 0, `same-fingerprint ${label} tampering must not execute any DB write`);
}

const directory = await mkdtemp(join(tmpdir(), "mes-specifications2-import-qa-"));
try {
  const file = join(directory, "specifications2-export.json"); await writeFile(file, JSON.stringify(payload), "utf-8");
  const output = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ["scripts/domain-specifications2-import.mjs", file], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }); let result = ""; child.stdout.on("data", (chunk) => result += chunk); child.stderr.on("data", (chunk) => result += chunk); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve(result) : reject(new Error(result))); });
  assert(String(output).includes("DRY RUN"), "Default revision import must not mutate PostgreSQL");
} finally { await rm(directory, { recursive: true, force: true }); }
console.log("Specifications 2.0 import QA: OK");
