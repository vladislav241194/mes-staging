import assert from "node:assert/strict";

import {
  SPECIFICATIONS2_COMPATIBILITY_LIMITS,
  buildAuthoritativePublicationEntry,
  buildSpecifications2CompatibilityPublicationEntry,
  validateSpecifications2CompatibilityEntryBounds,
} from "./domain-specifications2-repository.mjs";
import {
  analyzeSpecifications2EditorRowsHierarchy,
  buildSpecifications2ReleaseFingerprint,
  matchesSpecifications2ReleaseFingerprint,
} from "../src/modules/specifications2/publication.js";
import { exportSpecifications2Entry } from "./domain-specifications2-export.mjs";

const baseEntry = {
  id: "spec-compatibility-size-bound-qa",
  treeRows: [{ id: "root", parentId: "", level: 0, label: "АБВГ.000000 Изделие", designation: "АБВГ.000000", quantity: 1, unit: "шт." }],
  routeDrafts: [{
    id: "route-1",
    designation: "АБВГ.000000",
    productLabel: "Изделие",
    operations: [{
      id: "operation-1",
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "D1",
      laborNorm: { calculationMode: "unit", unitsPerHour: 60 },
    }],
  }],
  publication: { revision: 1 },
};

const historicalTreeRowsOnly = {
  treeRows: [
    { id: "root", parentId: "", level: 0, quantity: 1 },
    { id: "child", parentId: "root", level: 7, quantity: 1 },
  ],
};
assert.equal(JSON.parse(buildSpecifications2ReleaseFingerprint(historicalTreeRowsOnly, { adapterVersion: 5 })).rows[1].level, 7,
  "historical v4/v5 treeRows-only replay must retain its persisted client level");
assert.equal(JSON.parse(buildSpecifications2ReleaseFingerprint(historicalTreeRowsOnly, { adapterVersion: 6 })).rows[1].level, 1,
  "new v6 fingerprints must derive hierarchy depth instead of trusting a client level");

assert.doesNotThrow(() => buildAuthoritativePublicationEntry(baseEntry, {
  revisionNo: 2,
  releasedAt: "2026-07-18T00:00:00.000Z",
}));

const fiveMiBName = "x".repeat(5 * 1024 * 1024);
const oversizedEntry = {
  ...baseEntry,
  routeDrafts: [{
    ...baseEntry.routeDrafts[0],
    operations: [{ ...baseEntry.routeDrafts[0].operations[0], name: fiveMiBName }],
  }],
};
assert.throws(() => buildAuthoritativePublicationEntry(oversizedEntry, {
  revisionNo: 2,
  releasedAt: "2026-07-18T00:00:00.000Z",
}), /compatibility entry contains an oversized string/,
"a 5 MiB operation name omitted by the historical release fingerprint must still fail before a PostgreSQL transaction starts");

const chunk = "x".repeat(Math.floor(SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxStringBytes / 2));
assert.throws(() => validateSpecifications2CompatibilityEntryBounds({
  chunks: Array.from({ length: Math.ceil(SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxBytes / chunk.length) + 2 }, () => chunk),
}), /serialized-size limit/, "many individually valid strings must still respect the complete serialized compatibility bound");

let deep = { value: "leaf" };
for (let index = 0; index <= SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxDepth; index += 1) deep = { child: deep };
assert.throws(() => validateSpecifications2CompatibilityEntryBounds(deep), /depth limit/,
  "deep labor or attachment metadata must be bounded before canonicalization");

assert.throws(() => validateSpecifications2CompatibilityEntryBounds({
  nodes: Array.from({ length: SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxNodes }, () => null),
}), /node-count limit/, "wide payloads must be bounded independently of their byte size");

let deepLaborNorm = { unitsPerHour: 60 };
for (let index = 0; index <= SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxDepth; index += 1) deepLaborNorm = { child: deepLaborNorm };
assert.throws(() => buildAuthoritativePublicationEntry({
  ...baseEntry,
  routeDrafts: [{
    ...baseEntry.routeDrafts[0],
    operations: [{ ...baseEntry.routeDrafts[0].operations[0], laborNorm: deepLaborNorm }],
  }],
}, {
  revisionNo: 2,
  releasedAt: "2026-07-18T00:00:00.000Z",
}), /publication payload exceeds the depth limit/,
"raw nested labor metadata must fail iteratively before the recursive v6 fingerprint builder runs");

assert.throws(() => buildAuthoritativePublicationEntry({
  ...baseEntry,
  routeDrafts: [{
    ...baseEntry.routeDrafts[0],
    operations: [{
      ...baseEntry.routeDrafts[0].operations[0],
      laborNorm: { values: Array.from({ length: SPECIFICATIONS2_COMPATIBILITY_LIMITS.maxNodes }, () => null) },
    }],
  }],
}, {
  revisionNo: 2,
  releasedAt: "2026-07-18T00:00:00.000Z",
}), /publication payload exceeds the node-count limit/,
"raw wide labor metadata must fail before canonical fingerprint allocation");

const reverseParentChain = Array.from({ length: 12_000 }, (_, index) => ({
  id: `row-${index}`,
  parentId: index === 11_999 ? "" : `row-${index + 1}`,
}));
const reverseHierarchy = analyzeSpecifications2EditorRowsHierarchy({ editorRows: reverseParentChain });
assert.equal(reverseHierarchy.maxDepth, 11_999,
  "reverse-ordered flat parent chains must be analyzed iteratively without recursive stack growth");
const reverseTreeHierarchy = analyzeSpecifications2EditorRowsHierarchy({ treeRows: reverseParentChain });
assert.equal(reverseTreeHierarchy.maxDepth, 11_999,
  "treeRows parent chains must use the same iterative hierarchy analysis as editorRows");
for (const shape of ["editorRows", "treeRows"]) {
  assert.throws(() => buildAuthoritativePublicationEntry({
    ...baseEntry,
    [shape]: reverseParentChain,
    ...(shape === "treeRows" ? { editorRows: [] } : {}),
  }, {
    revisionNo: 2,
    releasedAt: "2026-07-18T00:00:00.000Z",
  }), /parent hierarchy exceeds the depth limit/,
  `${shape} semantic parent depth must fail before fingerprint construction even when raw JSON nesting is shallow`);
}

for (const [label, invalidRows, expected] of [
  ["cycle", [{ id: "root", parentId: "" }, { id: "a", parentId: "b" }, { id: "b", parentId: "a" }], /parent cycle/],
  ["orphan", [{ id: "root", parentId: "" }, { id: "orphan", parentId: "missing" }], /unknown parent/],
  ["self-parent", [{ id: "root", parentId: "" }, { id: "self", parentId: "self" }], /self-parent/],
  ["duplicate id", [{ id: "root", parentId: "" }, { id: "same", parentId: "root" }, { id: "same", parentId: "root" }], /duplicate row ids/],
]) {
  for (const shape of ["editorRows", "treeRows"]) {
    assert.throws(() => buildAuthoritativePublicationEntry({
      ...baseEntry,
      [shape]: invalidRows,
      ...(shape === "treeRows" ? { editorRows: [] } : {}),
    }, {
      revisionNo: 2,
      releasedAt: "2026-07-18T00:00:00.000Z",
    }), expected, `${label} ${shape} structure must fail before immutable publication`);
  }
}

const dualShapeEntry = {
  ...baseEntry,
  title: "АБВГ.000000 Изделие из редактора",
  treeRows: [{ id: "stale-root", parentId: "", level: 0, label: "АБВГ.OLD Устаревшая строка", designation: "АБВГ.OLD", quantity: 1, unit: "шт." }],
  editorRows: [{ id: "root", parentId: "", label: "АБВГ.000000 Изделие из редактора", designation: "АБВГ.000000", quantity: 1, unit: "шт." }],
};
const authoritativeDualShape = buildAuthoritativePublicationEntry(dualShapeEntry, {
  revisionNo: 2,
  releasedAt: "2026-07-18T00:00:00.000Z",
});
const compatibilityDualShape = buildSpecifications2CompatibilityPublicationEntry(authoritativeDualShape, {
  revision_no: 2,
  released_at: "2026-07-18T00:00:00.000Z",
});
assert.equal(compatibilityDualShape.treeRows[0].id, "root",
  "compatibility outbox must materialize effective editorRows instead of stale treeRows");
assert.equal(matchesSpecifications2ReleaseFingerprint(
  compatibilityDualShape,
  authoritativeDualShape.publication.fingerprint,
), true, "normal dual-shape compatibility payload must validate against its stored v6 fingerprint");
const dualShapeExport = exportSpecifications2Entry(compatibilityDualShape);
assert.equal(dualShapeExport.revisionItems[0].source_row_id, "root",
  "relational export must persist the same effective row identity as the v6 fingerprint");
assert.match(dualShapeExport.revisionItems[0].name, /Изделие из редактора/u,
  "relational export must not resurrect stale treeRows content");

console.log("Specifications 2.0 compatibility entry bounds QA: OK");
