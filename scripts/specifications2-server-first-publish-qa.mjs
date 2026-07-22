import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import {
  buildSpecifications2ReleaseFingerprint,
  publishSpecifications2Entry,
} from "../src/modules/specifications2/publication.js";
import { createSpecifications2ProductionOwner } from "../src/modules/specifications2/production_owner.js";

const draftEntry = {
  id: "spec-1",
  title: "Контроллер КТ-7",
  updatedAt: "2026-07-22T08:00:00.000Z",
  editedAt: "2026-07-22T08:05:00.000Z",
  editorRows: [
    { id: "root", parentId: "", order: 0, label: "Контроллер КТ-7", designation: "АБВГ.469659.001", type: "Изделие", quantity: "1", unitOfMeasure: "шт." },
    { id: "part", parentId: "root", order: 0, label: "Корпус", designation: "АБВГ.301111.001", type: "Деталь", quantity: "1", unitOfMeasure: "шт." },
  ],
  routeDrafts: [
    {
      id: "route-root",
      productKey: "root",
      productLabel: "Контроллер КТ-7",
      designation: "АБВГ.469659.001",
      status: "draft",
      operations: [{
        id: "operation-assembly",
        operationId: "OP-ASSEMBLY",
        name: "Сборка",
        workCenterId: "D3",
        laborNorm: { calculationMode: "fixed", fixedMinutes: 10 },
        productionFiles: {},
      }],
    },
    {
      id: "route-part",
      productKey: "part",
      productLabel: "Корпус",
      designation: "АБВГ.301111.001",
      status: "draft",
      operations: [{
        id: "operation-machining",
        operationId: "OP-MACHINING",
        name: "Мехобработка",
        workCenterId: "D2",
        laborNorm: { calculationMode: "fixed", fixedMinutes: 15 },
        productionFiles: {},
      }],
    },
  ],
};
const previousFingerprint = buildSpecifications2ReleaseFingerprint({
  ...draftEntry,
  editorRows: draftEntry.editorRows.map((row) => row.id === "part" ? { ...row, label: "Корпус до изменения" } : row),
});
const entry = {
  ...draftEntry,
  publication: { revision: 7, fingerprint: previousFingerprint, releasedAt: "2026-07-22T07:00:00.000Z", status: "released" },
};
const currentFingerprint = buildSpecifications2ReleaseFingerprint(entry);
const revisionDigest = `sha256:${"8".repeat(64)}`;
assert.notEqual(currentFingerprint, previousFingerprint, "fixture must contain a changed draft");
assert.notEqual(currentFingerprint, revisionDigest, "canonical publication fingerprint and relational digest must remain distinct contracts");

function canonicalOwnerDependencies(overrides = {}) {
  return {
    getCurrentFingerprint: buildSpecifications2ReleaseFingerprint,
    preparePublication: publishSpecifications2Entry,
    now: () => "2026-07-22T09:00:00.000Z",
    ...overrides,
  };
}

let store = { selectedId: entry.id, registry: [entry] };
let revisionState = { item: { sourceEntryId: entry.id, revisionNo: 7, fingerprint: previousFingerprint } };
const publicationRequests = [];
const writes = [];
const sequence = [];
const owner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => store,
  writeStore: (next, options) => {
    sequence.push("ack-write");
    store = next;
    writes.push({ next, options });
    return true;
  },
  getPublishedRevisionState: () => revisionState,
  forcePublishedRevisionRead: async (entryId, options) => {
    sequence.push("force-read");
    assert.equal(entryId, entry.id);
    assert.deepEqual(options, { force: true });
    revisionState = { item: { id: "revision-8", sourceEntryId: entry.id, revisionNo: 8, fingerprint: revisionDigest } };
    return { ok: true, changed: true };
  },
  createPublicationIdempotencyKey: () => "specifications2-publish:server-first-qa",
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    refreshCapability: async () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async (request) => {
      sequence.push("publish");
      publicationRequests.push(request);
      return {
        ok: true,
        created: true,
        item: { id: "revision-8", sourceEntryId: entry.id, revisionNo: 8, fingerprint: revisionDigest },
        publication: {
          ...request.entry.publication,
          revision: 8,
          releasedAt: "2026-07-22T09:00:00.000Z",
          status: "released",
        },
        snapshotSync: { total: 1, applied: 1, conflicts: 0, failed: 0 },
      };
    },
  },
}));

const published = await owner.execute({
  type: "publish-draft",
  payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 },
});
assert.deepEqual(published, { ok: true, id: entry.id, revision: 8, created: true, recoveryPending: false });
assert.deepEqual(sequence, ["publish", "ack-write", "force-read"], "ACK must be written before the forced authoritative read-back");
assert.equal(publicationRequests.length, 1);
assert.equal(publicationRequests[0].expectedPreviousRevision, 7);
assert.equal(publicationRequests[0].idempotencyKey, "specifications2-publish:server-first-qa");
assert.equal(publicationRequests[0].entry.publication.revision, 8, "server request must carry exactly N+1");
assert.equal(publicationRequests[0].entry.publication.fingerprint, currentFingerprint, "server request must carry the canonical prepared fingerprint");
assert.equal(store.registry[0].publication.revision, 8);
assert.equal(writes.length, 1, "Only the server acknowledgement may update the compatibility snapshot");
assert.deepEqual(writes[0].options, { suppressSharedStatePush: true }, "server-primary ACK must not enqueue a competing shared-state push");

let unchangedPublishCalls = 0;
const unchangedEntry = { ...entry, publication: { ...entry.publication, fingerprint: currentFingerprint } };
const unchangedOwner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => ({ selectedId: unchangedEntry.id, registry: [unchangedEntry] }),
  writeStore: () => { throw new Error("unchanged draft reached ACK write"); },
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async () => { unchangedPublishCalls += 1; return { ok: true }; },
  },
}));
const unchanged = await unchangedOwner.execute({
  type: "publish-draft",
  payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 },
});
assert.equal(unchanged.ok, false);
assert.equal(unchanged.unchanged, true);
assert.equal(unchangedPublishCalls, 0, "an unchanged canonical fingerprint must fail before PostgreSQL mutation");

const previousV5Fingerprint = buildSpecifications2ReleaseFingerprint({
  ...draftEntry,
  editorRows: draftEntry.editorRows.map((row) => row.id === "part" ? { ...row, label: "Корпус v5 до изменения" } : row),
}, { adapterVersion: 5 });
const historicalV5Entry = {
  ...draftEntry,
  publication: { revision: 7, fingerprint: previousV5Fingerprint, releasedAt: "2026-07-21T07:00:00.000Z", status: "released" },
};
const currentV5Fingerprint = buildSpecifications2ReleaseFingerprint(historicalV5Entry);
assert.equal(JSON.parse(currentV5Fingerprint).adapterVersion, 5);
assert.notEqual(currentV5Fingerprint, previousV5Fingerprint, "historical v5 fixture must contain a changed row");
let historicalV5Store = { selectedId: historicalV5Entry.id, registry: [historicalV5Entry] };
let historicalV5RevisionState = { item: { id: "revision-7", sourceEntryId: historicalV5Entry.id, revisionNo: 7, fingerprint: `sha256:${"7".repeat(64)}` } };
let historicalV5Request = null;
const historicalV5Owner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => historicalV5Store,
  writeStore: (next, options) => { assert.deepEqual(options, { suppressSharedStatePush: true }); historicalV5Store = next; return true; },
  getPublishedRevisionState: () => historicalV5RevisionState,
  forcePublishedRevisionRead: async () => {
    historicalV5RevisionState = { item: { id: "revision-8-v5-upgrade", sourceEntryId: historicalV5Entry.id, revisionNo: 8, fingerprint: revisionDigest } };
  },
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async (request) => {
      historicalV5Request = request;
      return {
        ok: true,
        created: true,
        item: { id: "revision-8-v5-upgrade", sourceEntryId: historicalV5Entry.id, revisionNo: 8, fingerprint: revisionDigest },
        publication: { ...request.entry.publication, revision: 8, status: "released" },
        snapshotSync: { total: 1, applied: 1, conflicts: 0, failed: 0 },
      };
    },
  },
}));
const historicalV5Published = await historicalV5Owner.execute({
  type: "publish-draft",
  payload: { entryId: historicalV5Entry.id, confirmEntryId: historicalV5Entry.id, expectedPreviousRevision: 7 },
});
assert.equal(historicalV5Published.ok, true, "a changed historical v5 publication must upgrade through canonical v6");
assert.equal(historicalV5Request.entry.publication.revision, 8);
assert.equal(JSON.parse(historicalV5Request.entry.publication.fingerprint).adapterVersion, 6);
assert.notEqual(historicalV5Request.entry.publication.fingerprint, currentV5Fingerprint, "v5 current content and prepared v6 fingerprints are intentionally different formats");

let disabledCalls = 0;
const disabledOwner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => ({ selectedId: entry.id, registry: [entry] }),
  writeStore: () => { throw new Error("disabled publication reached compatibility write"); },
  publishCommands: {
    getCapability: () => ({ enabled: false, serverPrimary: true, error: "disabled" }),
    refreshCapability: async () => ({ enabled: false, serverPrimary: true, error: "disabled" }),
    publishRevision: async () => { disabledCalls += 1; return { ok: true }; },
  },
}));
const disabled = await disabledOwner.execute({ type: "publish-draft", payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 } });
assert.equal(disabled.ok, false);
assert.equal(disabledCalls, 0, "A disabled primary capability must fail before mutation");

let rejectedWrites = 0;
const rejectedOwner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => ({ selectedId: entry.id, registry: [entry] }),
  writeStore: () => { rejectedWrites += 1; return true; },
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async () => ({ ok: false, conflict: true, error: "revision conflict" }),
  },
}));
const rejected = await rejectedOwner.execute({ type: "publish-draft", payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 } });
assert.equal(rejected.ok, false);
assert.equal(rejected.conflict, true);
assert.equal(rejectedWrites, 0, "A rejected PostgreSQL publication must not write compatibility state");

const throwingOwner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => ({ selectedId: entry.id, registry: [entry] }),
  writeStore: () => { throw new Error("server throw reached compatibility write"); },
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async () => { throw new Error("temporary database failure"); },
  },
}));
const thrown = await throwingOwner.execute({ type: "publish-draft", payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 } });
assert.equal(thrown.ok, false);
assert.match(thrown.message, /temporary database failure/);

const otherEntry = { id: "spec-other", title: "Другая спецификация", editorRows: [], routeDrafts: [] };
let concurrentStore = { selectedId: entry.id, registry: [entry, otherEntry] };
let concurrentRevisionState = { item: { sourceEntryId: entry.id, revisionNo: 7, fingerprint: previousFingerprint } };
let concurrentLatest = null;
const concurrentOwner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => concurrentStore,
  writeStore: (next, options) => {
    assert.deepEqual(options, { suppressSharedStatePush: true });
    concurrentStore = next;
    return true;
  },
  getPublishedRevisionState: () => concurrentRevisionState,
  forcePublishedRevisionRead: async () => {
    concurrentRevisionState = { item: { id: "revision-8", sourceEntryId: entry.id, revisionNo: 8, fingerprint: revisionDigest } };
  },
  createPublicationIdempotencyKey: () => "specifications2-publish:concurrent-qa",
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async (request) => {
      concurrentLatest = {
        ...entry,
        updatedAt: "2026-07-22T09:05:00.000Z",
        editedAt: "2026-07-22T09:04:00.000Z",
        editorRows: entry.editorRows.map((row) => row.id === "part" ? { ...row, label: "Concurrent edit" } : row),
        concurrentMarker: "keep",
      };
      concurrentStore = { selectedId: otherEntry.id, registry: [concurrentLatest, otherEntry] };
      return {
        ok: true,
        created: true,
        item: { id: "revision-8", sourceEntryId: entry.id, revisionNo: 8, fingerprint: revisionDigest },
        publication: { ...request.entry.publication, revision: 8, releasedAt: "2026-07-22T09:00:00.000Z", status: "released" },
        snapshotSync: { total: 1, applied: 1, conflicts: 0, failed: 0 },
      };
    },
  },
}));
assert.equal((await concurrentOwner.execute({ type: "publish-draft", payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 } })).ok, true);
assert.equal(concurrentStore.selectedId, otherEntry.id, "ACK must not overwrite a concurrent selection change");
const concurrentAfter = concurrentStore.registry.find((item) => item.id === entry.id);
const { publication: _beforePublication, ...concurrentBeforeEnvelope } = concurrentLatest;
const { publication: _afterPublication, ...concurrentAfterEnvelope } = concurrentAfter;
assert.deepEqual(concurrentAfterEnvelope, concurrentBeforeEnvelope, "ACK may change only the publication envelope of the latest draft");
assert.equal(concurrentAfter.updatedAt, "2026-07-22T09:05:00.000Z");
assert.equal(concurrentAfter.editedAt, "2026-07-22T09:04:00.000Z");
assert.equal(concurrentAfter.editorRows[1].label, "Concurrent edit", "Concurrent draft content must survive the server acknowledgement");

let staleStore = { selectedId: entry.id, registry: [entry] };
const staleRevisionState = { item: { sourceEntryId: entry.id, revisionNo: 7, fingerprint: previousFingerprint } };
let forcedStaleReads = 0;
const staleCachedOwner = createSpecifications2ProductionOwner(canonicalOwnerDependencies({
  getStore: () => staleStore,
  writeStore: (next, options) => { assert.deepEqual(options, { suppressSharedStatePush: true }); staleStore = next; return true; },
  getPublishedRevisionState: () => staleRevisionState,
  forcePublishedRevisionRead: async (_entryId, options) => { assert.deepEqual(options, { force: true }); forcedStaleReads += 1; return { ok: true, changed: false }; },
  publishCommands: {
    getCapability: () => ({ enabled: true, serverPrimary: true }),
    publishRevision: async (request) => ({
      ok: true,
      created: true,
      item: { id: "revision-8", sourceEntryId: entry.id, revisionNo: 8, fingerprint: revisionDigest },
      publication: { ...request.entry.publication, revision: 8, status: "released" },
      snapshotSync: { total: 1, applied: 1, conflicts: 0, failed: 0 },
    }),
  },
}));
const staleCached = await staleCachedOwner.execute({ type: "publish-draft", payload: { entryId: entry.id, confirmEntryId: entry.id, expectedPreviousRevision: 7 } });
assert.equal(forcedStaleReads, 1);
assert.equal(staleCached.ok, false, "a stale cached revision must not become plain success");
assert.equal(staleCached.published, true);
assert.equal(staleCached.recoveryPending, true);
assert.equal(staleCached.revision, 8);

const [appSource, ownerSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/specifications2/production_owner.js", import.meta.url), "utf8"),
]);
await assert.rejects(
  access(new URL("../src/modules/specifications2/publish_flow.js", import.meta.url)),
  "The retired browser compatibility publication flow must be physically absent",
);
assert.match(ownerSource, /preparePublication\(selected, \{ now: now\(\) \}\)/);
assert.match(ownerSource, /publicationOwner\.publishRevision\(\{ entry: requestEntry/);
assert.match(ownerSource, /writeStore\(nextStore, \{ suppressSharedStatePush: true \}\)/);
assert.match(ownerSource, /forcePublishedRevisionRead\(entryId, \{ force: true \}\)/);
assert.doesNotMatch(ownerSource, /publishLegacyEntry|commitPublication|publishSpecifications2EntryWithServerFirst/);
assert.doesNotMatch(appSource, /commitSpecifications2Publication|specifications2PublishCommands|publishSpecifications2EntryWithServerFirst/);

console.log("Specifications 2.0 server-first publication QA: OK");
console.log("- canonical N+1 request, prepared fingerprint, suppressed ACK write and forced PostgreSQL read-back: pass");
console.log("- unchanged draft, rejected/throwing commands and stale cached read-back fail closed: pass");
console.log("- concurrent draft content/timestamps/selection survive; ACK changes only publication envelope: pass");
