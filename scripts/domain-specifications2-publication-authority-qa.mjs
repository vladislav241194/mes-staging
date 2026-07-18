import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildAuthoritativePublicationEntry,
  normalizeExpectedPreviousRevision,
} from "./domain-specifications2-repository.mjs";

const entry = {
  id: "spec-authority-qa",
  treeRows: [{ id: "root", level: 0, label: "АБВГ.001.001 Изделие", designation: "АБВГ.001.001", quantity: 1, unit: "шт." }],
  routeDrafts: [{
    id: "route-1",
    designation: "АБВГ.001.001",
    productLabel: "Изделие",
    operations: [{ id: "operation-1", operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { calculationMode: "unit", unitsPerHour: 60 } }],
  }],
  publication: { revision: 99 },
};

assert.equal(normalizeExpectedPreviousRevision(0), 0);
assert.equal(normalizeExpectedPreviousRevision("7"), 7);
assert.equal(normalizeExpectedPreviousRevision(-1), null);
assert.equal(normalizeExpectedPreviousRevision("3.5"), null);

const authoritative = buildAuthoritativePublicationEntry(entry, {
  revisionNo: 2,
  releasedAt: "2026-07-18T00:00:00.000Z",
});
assert.equal(authoritative.publication.revision, 2, "server must overwrite any client-supplied revision number");
assert.equal(authoritative.publication.releasedAt, "2026-07-18T00:00:00.000Z", "server release timestamp must be canonical");
assert.equal(authoritative.publication.status, "released", "server authority must create a released publication envelope");
assert.ok(authoritative.publication.fingerprint, "server must derive a canonical release fingerprint");
assert.equal(entry.publication.revision, 99, "server authority helper must not mutate the editor object");

let staleFingerprint = "";
try {
  buildAuthoritativePublicationEntry({ ...entry, publication: { revision: 2, fingerprint: "forged" } }, {
    revisionNo: 2,
    releasedAt: "2026-07-18T00:00:00.000Z",
  });
} catch (error) {
  staleFingerprint = String(error.message || "");
}
assert.match(staleFingerprint, /changed after its client publication was prepared/, "server must reject a client fingerprint that no longer matches editor content");

const renderSource = await readFile(fileURLToPath(new URL("../src/modules/specifications2/render.js", import.meta.url)), "utf-8");
assert.match(renderSource, /function writeStore\(store, \{ suppressSharedStatePush = false \} = \{\}\)/, "Specs2 editor storage must support an acknowledgement-only local write");
assert.match(renderSource, /writeStore\(\{ \.\.\.latestStore, registry, selectedId: entryId \}, \{ suppressSharedStatePush: true \}\)/, "server-primary acknowledgement must not enqueue a competing shared-state snapshot write");

console.log("Specifications 2.0 publication authority QA: OK");
