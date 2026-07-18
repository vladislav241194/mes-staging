import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSpecifications2ReleaseFingerprint, publishSpecifications2Entry } from "../src/modules/specifications2/publication.js";
import {
  DIRECTORY_STORAGE_KEY,
  PLANNING_STATE_KEY,
  SPECIFICATIONS2_STORAGE_KEY,
  createSpecifications2SnapshotRepository,
} from "./domain-specifications2-snapshot-repository.mjs";
import { syncPendingSpecifications2PublicationChanges } from "./domain-specifications2-snapshot-sync.mjs";
import { handleSharedStateRequest, updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };

function makeRequest(method, body = null) {
  const request = new EventEmitter();
  request.method = method;
  request.body = body;
  request.headers = {};
  request.destroy = () => {};
  return request;
}

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    setHeader(key, value) { this.headers[key] = value; },
    end(value = "") { this.body = Buffer.isBuffer(value) ? value.toString("utf8") : String(value); },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(payload) { this.body = JSON.stringify(payload); },
  };
}

async function postSharedState(filePath, payload) {
  const response = makeResponse();
  await handleSharedStateRequest(makeRequest("POST", payload), response, { filePath });
  return { statusCode: response.statusCode, body: JSON.parse(response.body || "{}") };
}
const releaseBase = {
  id: "spec-outbox-1",
  title: "Изделие для server-first",
  createdAt: "2026-07-18T10:00:00.000Z",
  updatedAt: "2026-07-18T10:00:00.000Z",
  treeRows: [{ id: "root", level: 0, label: "АБВГ.001.001 Изделие", designation: "АБВГ.001.001", type: "Изделия", quantity: 1, unit: "шт." }],
  routeDrafts: [{
    id: "route-1", productKey: "root", designation: "АБВГ.001.001", productLabel: "Изделие", status: "draft",
    operations: [{ id: "operation-1", operationId: "OP-1", name: "Монтаж", workCenterId: "D1", nextWorkCenterId: "D2", inputState: "До", outputState: "После", laborNorm: { calculationMode: "unit", unitsPerHour: 60 } }],
  }],
};
const preparedPublication = publishSpecifications2Entry(releaseBase, {
  now: "2026-07-18T10:01:00.000Z",
  directoryState: { nomenclature: [], specifications: [] },
  planningState: { routes: [], routeSteps: [], slots: [] },
});
const releaseEntry = {
  ...releaseBase,
  publication: {
    ...preparedPublication.publication,
    fingerprint: buildSpecifications2ReleaseFingerprint(releaseBase),
  },
};

const directory = await mkdtemp(join(tmpdir(), "mes-specifications2-outbox-"));
const filePath = join(directory, "shared-state.json");
try {
  const draft = { ...releaseBase, publication: null };
  await writeFile(filePath, JSON.stringify({
    version: 3,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ selectedId: draft.id, registry: [draft] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const snapshot = createSpecifications2SnapshotRepository({ filePath });
  const applied = await snapshot.applyServerPublicationProjection(releaseEntry);
  assert(applied.applied && applied.publication?.revision === 1, "server revision must atomically create its compatibility projection");
  const after = JSON.parse(await readFile(filePath, "utf8"));
  const registry = JSON.parse(after.values[SPECIFICATIONS2_STORAGE_KEY]);
  const directories = JSON.parse(after.values[DIRECTORY_STORAGE_KEY]);
  const planning = JSON.parse(after.values[PLANNING_STATE_KEY]);
  assert(after.version === 4, "one mirrored revision must use one shared-state version increment");
  assert(registry.registry[0]?.publication?.fingerprint === releaseEntry.publication.fingerprint, "compatibility registry must contain the acknowledged immutable publication");
  assert(directories.specifications?.length === 1 && planning.routes?.length === 1 && planning.routeSteps?.length === 1, "directory and planning compatibility projections must be written with the revision");
  const again = await snapshot.applyServerPublicationProjection(releaseEntry);
  const afterAgain = JSON.parse(await readFile(filePath, "utf8"));
  assert(again.applied && again.alreadyApplied && afterAgain.version === 4, "outbox delivery must be idempotent without a second snapshot write");
  assert(afterAgain.specifications2PublicationAuthority?.publications?.[releaseEntry.id]?.fingerprint === releaseEntry.publication.fingerprint, "successful server projection must persist a browser-independent publication authority marker");

  const partialProjection = structuredClone(afterAgain);
  partialProjection.version = 6;
  partialProjection.values[PLANNING_STATE_KEY] = JSON.stringify({
    ...JSON.parse(partialProjection.values[PLANNING_STATE_KEY]),
    routeSteps: [],
  });
  await writeFile(filePath, JSON.stringify(partialProjection), "utf8");
  const repairedPartial = await snapshot.applyServerPublicationProjection(releaseEntry);
  const afterPartialRepair = JSON.parse(await readFile(filePath, "utf8"));
  assert(repairedPartial.applied && !repairedPartial.alreadyApplied, "a directory-plus-route fragment must not be accepted as a fully applied publication");
  assert(JSON.parse(afterPartialRepair.values[PLANNING_STATE_KEY]).routeSteps.length === 1, "retry must repair missing published route steps atomically");

  const completeLegacyProjection = structuredClone(afterPartialRepair);
  completeLegacyProjection.version = 9;
  delete completeLegacyProjection.specifications2PublicationAuthority;
  await writeFile(filePath, JSON.stringify(completeLegacyProjection), "utf8");
  const authorityBackfill = await snapshot.applyServerPublicationProjection(releaseEntry);
  const afterAuthorityBackfill = JSON.parse(await readFile(filePath, "utf8"));
  assert(authorityBackfill.applied && !authorityBackfill.alreadyApplied, "a complete legacy projection must be rewritten once to establish server publication authority");
  assert(afterAuthorityBackfill.specifications2PublicationAuthority?.publications?.[releaseEntry.id]?.revision === 1, "legacy projection rewrite must persist the authority marker");

  const staleRegistry = JSON.parse(afterAuthorityBackfill.values[SPECIFICATIONS2_STORAGE_KEY]);
  const staleEntry = structuredClone(staleRegistry.registry[0]);
  staleEntry.publication = { ...releaseEntry.publication, revision: 99, fingerprint: "legacy-local-revision" };
  const stalePublicationWrite = await postSharedState(filePath, {
    baseVersion: afterAuthorityBackfill.version,
    action: "legacy-specifications2-full-save",
    values: {
      ...afterAuthorityBackfill.values,
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ ...staleRegistry, registry: [staleEntry] }),
    },
    sharedUi: afterAuthorityBackfill.sharedUi,
  });
  assert(stalePublicationWrite.statusCode === 409 && stalePublicationWrite.body.specifications2PublicationAuthority === true, "a stale browser must not overwrite a server-owned immutable publication");
  const normalDraft = structuredClone(staleRegistry.registry[0]);
  normalDraft.publication = null;
  normalDraft.title = "Черновик после серверной публикации";
  const staleCompatibilityValues = {
    ...afterAuthorityBackfill.values,
    [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
    [PLANNING_STATE_KEY]: JSON.stringify({ routes: [{ id: "unrelated-route" }], routeSteps: [], slots: [] }),
  };
  const normalDraftWrite = await postSharedState(filePath, {
    baseVersion: afterAuthorityBackfill.version,
    action: "specifications2-draft-save",
    values: {
      ...staleCompatibilityValues,
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ ...staleRegistry, registry: [normalDraft] }),
    },
    sharedUi: afterAuthorityBackfill.sharedUi,
  });
  assert(normalDraftWrite.statusCode === 200, "a current normal draft must remain editable after server-first publication");
  const normalDraftRegistry = JSON.parse(normalDraftWrite.body.values[SPECIFICATIONS2_STORAGE_KEY]);
  assert(normalDraftRegistry.registry[0]?.title === normalDraft.title && normalDraftRegistry.registry[0]?.publication?.fingerprint === releaseEntry.publication.fingerprint, "normal draft save must preserve the authoritative immutable release metadata");
  assert(JSON.parse(normalDraftWrite.body.values[DIRECTORY_STORAGE_KEY]).specifications.some((item) => item.id === releaseEntry.publication.specificationId), "a stale full save must retain the server-owned Specifications 2.0 directory projection");
  assert(JSON.parse(normalDraftWrite.body.values[PLANNING_STATE_KEY]).routeSteps.length === 1, "a stale full save must retain the server-owned Specifications 2.0 planning projection");

  const higherLocal = structuredClone(releaseBase);
  higherLocal.publication = { ...releaseEntry.publication, revision: 2, fingerprint: "legacy-local-revision" };
  await writeFile(filePath, JSON.stringify({
    version: 30,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ selectedId: higherLocal.id, registry: [higherLocal] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const higherLocalResult = await snapshot.applyServerPublicationProjection(releaseEntry);
  const afterHigherLocal = JSON.parse(await readFile(filePath, "utf8"));
  assert(higherLocalResult.conflict && afterHigherLocal.version === 30, "a higher local compatibility revision must never mark an older authoritative outbox job applied");

  const changedDraft = structuredClone(releaseBase);
  changedDraft.updatedAt = "2026-07-18T10:02:00.000Z";
  changedDraft.routeDrafts[0].operations[0].name = "Монтаж — уточнённый черновик";
  await writeFile(filePath, JSON.stringify({
    version: 10,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ selectedId: changedDraft.id, registry: [{ ...changedDraft, publication: null }] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const changedResult = await snapshot.applyServerPublicationProjection(releaseEntry);
  const changedAfter = JSON.parse(await readFile(filePath, "utf8"));
  const changedRegistry = JSON.parse(changedAfter.values[SPECIFICATIONS2_STORAGE_KEY]);
  assert(changedResult.applied && changedRegistry.registry[0]?.routeDrafts?.[0]?.operations?.[0]?.name.includes("уточнённый"), "newer browser draft fields must survive an acknowledged immutable publication");
  assert(changedRegistry.registry[0]?.publication?.revision === 1, "newer draft must retain the preceding immutable revision metadata");

  await writeFile(filePath, JSON.stringify({
    version: 20,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ selectedId: "", registry: [] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const deletedResult = await snapshot.applyServerPublicationProjection(releaseEntry);
  const deletedAfter = JSON.parse(await readFile(filePath, "utf8"));
  assert(deletedResult.applied && JSON.parse(deletedAfter.values[SPECIFICATIONS2_STORAGE_KEY]).registry.length === 0, "a deleted browser draft must not be resurrected by its outbox retry");
  assert(JSON.parse(deletedAfter.values[PLANNING_STATE_KEY]).routes.length === 1, "downstream compatibility projection must still be delivered when the draft was removed");

  const marks = [];
  const result = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs(limit, filter) {
        assert(limit === 20 && filter.aggregateType === "specifications2_revision", "Specs2 sync must query only its own outbox aggregate");
        return [{ id: 71, aggregateType: "specifications2_revision", aggregateId: "revision-1", aggregateRevision: 1, commandType: "publish_revision", payload: { compatibilityEntry: releaseEntry } }];
      },
      async markSnapshotSync(id, mark) { marks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection(entry) { assert(entry.id === releaseEntry.id, "outbox must deliver its immutable entry"); return { applied: true }; } },
  });
  assert(result.applied === 1 && marks[0]?.state === "applied", "successful Specs2 mirror must close the PostgreSQL outbox row");

  const deferredMarks = [];
  const deferred = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 72, aggregateType: "specifications2_revision", aggregateId: "revision-2", commandType: "publish_revision", payload: { compatibilityEntry: releaseEntry } }]; },
      async markSnapshotSync(id, mark) { deferredMarks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { return { applied: false, retryable: true, error: "temporary file lock" }; } },
  });
  assert(deferred.failed === 1 && deferredMarks[0]?.state === "pending", "temporary compatibility failure must remain retryable in the outbox");

  const invalidMarks = [];
  const invalid = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 73, aggregateType: "specifications2_revision", aggregateId: "revision-3", commandType: "publish_revision", payload: {} }]; },
      async markSnapshotSync(id, mark) { invalidMarks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { throw new Error("must not run"); } },
  });
  assert(invalid.conflicts === 1 && invalidMarks[0]?.state === "conflict", "malformed immutable outbox payload must fail closed instead of retrying forever");

  // The KV backend must not turn a read/version check plus SET into a stale
  // overwrite. Simulate another writer winning just before this adapter's
  // EVAL reaches Redis, then verify the original update is rejected.
  const originalFetch = globalThis.fetch;
  const kvCommands = [];
  let kvRaw = JSON.stringify({ version: 5, values: { current: "v5" }, sharedUi: {}, events: [] });
  let advanceBeforeFirstCompareAndSet = true;
  globalThis.fetch = async (_url, options = {}) => {
    const command = JSON.parse(options.body || "[]");
    kvCommands.push(command);
    if (command[0] === "GET") return { ok: true, json: async () => ({ result: kvRaw }) };
    if (command[0] === "EVAL") {
      assert(String(command[1]).includes("redis.call('SET', KEYS[1], ARGV[2])"), "KV writes must use an atomic EVAL compare-and-set script");
      if (advanceBeforeFirstCompareAndSet) {
        advanceBeforeFirstCompareAndSet = false;
        const external = JSON.parse(kvRaw);
        kvRaw = JSON.stringify({ ...external, version: 6, values: { ...external.values, concurrent: "won" } });
      }
      const actualVersion = Number(JSON.parse(kvRaw).version || 0);
      const expectedVersion = Number(command[4] || 0);
      if (actualVersion !== expectedVersion) return { ok: true, json: async () => ({ result: 0 }) };
      kvRaw = command[5];
      return { ok: true, json: async () => ({ result: 1 }) };
    }
    throw new Error(`Unexpected KV command ${command[0] || ""}`);
  };
  try {
    const kvEnv = {
      KV_REST_API_URL: "https://kv.invalid",
      KV_REST_API_TOKEN: "qa-token",
      MES_SHARED_STATE_KEY: "qa:specifications2-cas",
    };
    const staleKvProjection = await updateSharedStateSnapshot({
      env: kvEnv,
      expectedVersion: 5,
      update: (current) => ({ ...current, values: { ...current.values, staleProjection: "must-not-write" } }),
    });
    assert(staleKvProjection.ok !== true && staleKvProjection.conflict === true, "KV CAS must reject a stale server projection instead of overwriting a concurrent save");
    assert(JSON.parse(kvRaw).values.concurrent === "won" && !JSON.parse(kvRaw).values.staleProjection, "rejected KV projection must leave the concurrent snapshot intact");
    const acceptedKvProjection = await updateSharedStateSnapshot({
      env: kvEnv,
      expectedVersion: 6,
      update: (current) => ({ ...current, values: { ...current.values, serverProjection: "applied" } }),
    });
    assert(acceptedKvProjection.ok && JSON.parse(kvRaw).version === 7 && JSON.parse(kvRaw).values.serverProjection === "applied", "KV CAS must persist an uncontended projection exactly once");
    assert(kvCommands.some((command) => command[0] === "EVAL") && !kvCommands.some((command) => command[0] === "SET"), "versioned KV updates must not fall back to an unsafe raw SET");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("Specifications 2.0 server-first snapshot sync QA: OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
