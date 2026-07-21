import assert from "node:assert/strict";
import {
  buildSpecifications2ReleaseFingerprint,
  inspectSpecifications2Publication,
  publishSpecifications2Entry,
} from "../src/modules/specifications2/publication.js";

const entry = {
  id: "spec2-qa",
  title: "АБВГ.100000.001 Тестовое изделие",
  treeRows: [
    { selectionKey: "root", nodeKey: "root-node", level: 0, label: "АБВГ.100000.001 Тестовое изделие", designation: "АБВГ.100000.001", type: "СЕ", quantity: 1, unitOfMeasure: "шт." },
    { selectionKey: "child", nodeKey: "child-node", parentKey: "root-node", level: 1, label: "АБВГ.100000.002 Плата", designation: "АБВГ.100000.002", type: "ПП", quantity: 2, unitOfMeasure: "шт." },
  ],
  editorRows: [
    { id: "root", label: "АБВГ.100000.001 Тестовое изделие", designation: "АБВГ.100000.001", type: "СЕ", quantity: 1, unitOfMeasure: "шт." },
    { id: "child", parentId: "root", label: "АБВГ.100000.002 Плата", designation: "АБВГ.100000.002", type: "ПП", quantity: 2, unitOfMeasure: "шт." },
  ],
  routeDrafts: [{
    id: "draft-root",
    productKey: "root",
    productLabel: "Тестовое изделие",
    designation: "АБВГ.100000.001",
    operations: [{
      id: "op-1",
      operationId: "D3_L1_OP",
      name: "SMT-монтаж",
      workCenterId: "D3",
      nextWorkCenterId: "D4",
      laborNorm: { calculationMode: "rate", setupMinutes: 10, unitsPerHour: 30, activeRevisionId: "norm-r1" },
    }],
  }, {
    id: "draft-child",
    productKey: "child",
    productLabel: "Плата",
    designation: "АБВГ.100000.002",
    operations: [{
      id: "op-2",
      operationId: "D4_OP",
      name: "Контроль",
      workCenterId: "D4",
      laborNorm: { calculationMode: "fixed", fixedMinutes: 15, activeRevisionId: "norm-r1" },
    }],
  }],
};

assert.equal(inspectSpecifications2Publication(entry).ready, true);
const releaseFingerprint = buildSpecifications2ReleaseFingerprint(entry);
assert.equal(JSON.parse(releaseFingerprint).adapterVersion, 6,
  "new Specifications 2.0 publications must use the complete canonical v6 fingerprint");
const expectFingerprintChange = (label, mutate) => {
  const changed = structuredClone(entry);
  mutate(changed);
  assert.notEqual(buildSpecifications2ReleaseFingerprint(changed), releaseFingerprint,
    `v6 release fingerprint must bind ${label}`);
};
[
  ["source entry id", (value) => { value.id = "spec2-qa-changed"; }],
  ["title", (value) => { value.title = "Другое название"; }],
  ["row source aliases", (value) => { value.editorRows[1].selectionKey = "child-alias"; }],
  ["route draft id", (value) => { value.routeDrafts[0].id = "draft-root-changed"; }],
  ["route product key", (value) => { value.routeDrafts[0].productKey = "changed-product-key"; }],
  ["route product label", (value) => { value.routeDrafts[0].productLabel = "Другое изделие"; }],
  ["operation source id", (value) => { value.routeDrafts[0].operations[0].id = "op-source-changed"; }],
  ["operation id", (value) => { value.routeDrafts[0].operations[0].operationId = "D3_L2_OP"; }],
  ["operation name", (value) => { value.routeDrafts[0].operations[0].name = "Другое имя"; }],
  ["next operation", (value) => { value.routeDrafts[0].operations[0].nextOperationId = "NEXT-OP"; }],
  ["instruction requirement", (value) => { value.routeDrafts[0].operations[0].instructionRequired = true; }],
  ["work center", (value) => { value.routeDrafts[0].operations[0].workCenterId = "D9"; }],
  ["next work center", (value) => { value.routeDrafts[0].operations[0].nextWorkCenterId = "D9"; }],
  ["input state", (value) => { value.routeDrafts[0].operations[0].inputState = "Новое входное состояние"; }],
  ["output state", (value) => { value.routeDrafts[0].operations[0].outputState = "Новое выходное состояние"; }],
  ["labor norm", (value) => { value.routeDrafts[0].operations[0].laborNorm.setupMinutes = 11; }],
].forEach(([label, mutate]) => expectFingerprintChange(label, mutate));

const reorderedNestedObjects = structuredClone(entry);
reorderedNestedObjects.routeDrafts[0].operations[0].laborNorm = {
  activeRevisionId: "norm-r1",
  unitsPerHour: 30,
  setupMinutes: 10,
  calculationMode: "rate",
};
entry.routeDrafts[0].operations[0].productionFiles = {
  instruction: { name: "work.pdf", size: 50, type: "application/pdf", serverAttachmentId: "attachment-work" },
  gerber: { name: "board.zip", size: 100, type: "application/zip", serverAttachmentId: "attachment-board" },
};
reorderedNestedObjects.routeDrafts[0].operations[0].productionFiles = {
  gerber: { serverAttachmentId: "attachment-board", type: "application/zip", size: 100, name: "board.zip" },
  instruction: { serverAttachmentId: "attachment-work", type: "application/pdf", size: 50, name: "work.pdf" },
};
const canonicalWithFiles = buildSpecifications2ReleaseFingerprint(entry);
assert.equal(buildSpecifications2ReleaseFingerprint(reorderedNestedObjects), canonicalWithFiles,
  "v6 fingerprint must ignore nested JSON object insertion order changed by JSONB");
const changedAttachmentIdentity = structuredClone(entry);
changedAttachmentIdentity.routeDrafts[0].operations[0].productionFiles.gerber.serverAttachmentId = "attachment-board-v2";
assert.notEqual(buildSpecifications2ReleaseFingerprint(changedAttachmentIdentity), canonicalWithFiles,
  "v6 fingerprint must bind every attachment metadata field persisted in the relational projection");
const withInlineAttachmentCopies = structuredClone(entry);
withInlineAttachmentCopies.routeDrafts[0].operations[0].productionFiles.gerber.inlineDataUrl = "data:application/zip;base64,VEVTVA==";
withInlineAttachmentCopies.routeDrafts[0].operations[0].productionFiles.instruction.content = "inline-copy";
assert.equal(buildSpecifications2ReleaseFingerprint(withInlineAttachmentCopies), canonicalWithFiles,
  "v6 fingerprint must exclude only inline binary copies omitted from the durable relational projection");
const extraUiMetadata = structuredClone(entry);
extraUiMetadata.temporaryEditorState = { expanded: true };
extraUiMetadata.editorRows[0].temporaryColor = "red";
extraUiMetadata.routeDrafts[0].temporaryPanelWidth = 720;
extraUiMetadata.routeDrafts[0].operations[0].temporarySelection = true;
assert.equal(buildSpecifications2ReleaseFingerprint(extraUiMetadata), canonicalWithFiles,
  "v6 fingerprint must exclude editor-only metadata that neither durable projection persists");
const invariantContext = {
  now: "2026-07-16T00:00:00.000Z",
  directoryState: { nomenclature: [], specifications: [] },
  planningState: { routes: [], routeSteps: [], slots: [] },
};
assert.deepEqual(
  publishSpecifications2Entry(extraUiMetadata, invariantContext),
  publishSpecifications2Entry(entry, invariantContext),
  "equal v6 fingerprints must produce the same immutable Directory/Planning compatibility projection",
);
assert.equal(JSON.parse(buildSpecifications2ReleaseFingerprint(entry, { adapterVersion: 5 })).adapterVersion, 5,
  "historical adapter-v5 fingerprints must remain constructible for durable replay");
const first = publishSpecifications2Entry(entry, {
  now: "2026-07-16T00:00:00.000Z",
  directoryState: { nomenclature: [], specifications: [] },
  planningState: { routes: [], routeSteps: [], slots: [] },
});

assert.equal(first.publication.revision, 1);
assert.equal(first.directoryState.specifications.length, 1);
assert.equal(first.directoryState.nomenclature.length, 2);
assert.equal(first.planningState.routes.length, 1, "Planning must receive one aggregate work-order route.");
assert.equal(first.planningState.routeSteps.length, 2, "The main work order route must aggregate root and nested manufactured operations.");
assert.equal(first.planningState.routes[0].planningLaborByStepId[first.planningState.routeSteps[0].id].minutesPerUnit, 2);
assert.equal(first.planningState.routeSteps[0].specTaskId, `spec-root:${first.publication.specificationId}`);
assert.equal(first.planningState.routeSteps[1].specTaskId, `spec-item:${first.directoryState.specifications[0].structureItems[0].id}`);
assert.equal(first.planningState.routes[0].documentRevisionSnapshot.specificationRevision, 1);
assert.equal(first.planningState.routes[0].documentRevisionSnapshot.routeRevision, 1);
assert.equal(first.planningState.routes[0].documentRevisionSnapshot.operations[0].normRevisionId, "norm-r1");
assert.deepEqual(first.planningState.routes[0].documentRevisionSnapshot.operations[0].labor, { mode: "unit", minutesPerUnit: 2 });
assert.equal(first.directoryState.specifications[0].structureItems[0].parentId, "root");

const second = publishSpecifications2Entry({ ...entry, publication: first.publication }, {
  now: "2026-07-17T00:00:00.000Z",
  directoryState: first.directoryState,
  planningState: {
    ...first.planningState,
    routes: [...first.planningState.routes, {
      id: "work-order-derived",
      rootRouteId: "work-order-derived",
      sourceSpecifications2EntryId: entry.id,
      workOrderSnapshot: { id: "work-order-derived", source: "specifications2" },
    }],
    routeSteps: [...first.planningState.routeSteps, {
      id: "work-order-derived-step",
      routeId: "work-order-derived",
      operationId: "D3_L1_OP",
    }],
    slots: [{ id: "historical-slot", routeId: first.publication.rootRouteId, planningOrderId: first.publication.rootRouteId }],
  },
});
assert.equal(second.publication.revision, 2);
assert.equal(second.directoryState.specifications.length, 2, "A new release must append instead of mutating history.");
assert.equal(second.planningState.routes.length, 3, "A referenced revision and a distinct derived Work Order must survive republish.");
assert.equal(second.planningState.routeSteps.length, 5, "Historical, active and Work Order routes must keep complete operation chains.");
assert(second.planningState.routes.some((route) => route.id === "work-order-derived"),
  "Specifications publication must not delete a server-owned Work Order that shares its source entry");
assert.equal(first.planningState.routes[0].documentRevisionSnapshot.specificationRevision, 1, "Publishing a new revision must not mutate an old work-order source snapshot.");

console.log("Specifications 2.0 publication adapter: OK");
