import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES,
  buildSpecifications2ReleaseFingerprint,
  publishSpecifications2Entry,
  specifications2ReleaseFingerprintByteLength,
} from "../src/modules/specifications2/publication.js";
import {
  buildSpecifications2CompatibilityPayloadDigest,
  buildSpecifications2RelationalReleaseFingerprint,
} from "./domain-specifications2-export.mjs";
import {
  DIRECTORY_STORAGE_KEY,
  PLANNING_STATE_KEY,
  SPECIFICATIONS2_STORAGE_KEY,
  createSpecifications2SnapshotRepository,
} from "./domain-specifications2-snapshot-repository.mjs";
import { createWorkOrdersRepository } from "./domain-work-orders-repository.mjs";
import { syncPendingSpecifications2PublicationChanges } from "./domain-specifications2-snapshot-sync.mjs";
import {
  handleSharedStateRequest,
  updateSharedStateSnapshot,
  updateSpecifications2WorkOrderSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";

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
const outboxProof = (jobId = "qa-direct") => ({
  jobId,
  aggregateType: "specifications2_revision",
  aggregateId: "revision-1",
  aggregateRevision: releaseEntry.publication.revision,
  commandType: "publish_revision",
  payloadFingerprint: releaseEntry.publication.fingerprint,
  relationalFingerprint: buildSpecifications2RelationalReleaseFingerprint(releaseEntry.publication.fingerprint),
  payloadDigest: buildSpecifications2CompatibilityPayloadDigest(releaseEntry),
  payloadDigestPersisted: true,
});
const outboxPayload = (entry = releaseEntry, { includeDigest = true } = {}) => ({
  sourceEntryId: String(entry.id || ""),
  fingerprint: buildSpecifications2RelationalReleaseFingerprint(entry?.publication?.fingerprint || ""),
  ...(includeDigest
    ? { compatibilityPayloadDigest: buildSpecifications2CompatibilityPayloadDigest(entry) }
    : {}),
  compatibilityEntry: entry,
});

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
  const beforeMissingProof = await readFile(filePath, "utf8");
  const missingProof = await snapshot.applyServerPublicationProjection(releaseEntry);
  assert(!missingProof.ok && missingProof.conflict,
    "a compatibility projection without the exact durable outbox proof must fail closed");
  assert((await readFile(filePath, "utf8")) === beforeMissingProof,
    "rejected Specifications 2.0 owner proof must leave the snapshot byte-identical");
  const v4FilePath = join(directory, "shared-state-adapter-v4.json");
  const v4SourceEntry = structuredClone(releaseBase);
  v4SourceEntry.routeDrafts[0].operations[0].productionFiles = {
    gerber: {
      name: "legacy-gerber.zip",
      size: 12,
      type: "application/zip",
      inlineDataUrl: "data:application/zip;base64,TEVHQUNZ",
    },
  };
  const v4Fingerprint = buildSpecifications2ReleaseFingerprint(v4SourceEntry, { adapterVersion: 4 });
  const v4Entry = {
    ...v4SourceEntry,
    routeDrafts: [{
      ...v4SourceEntry.routeDrafts[0],
      operations: [{
        ...v4SourceEntry.routeDrafts[0].operations[0],
        productionFiles: {
          gerber: { name: "legacy-gerber.zip", size: 12, type: "application/zip" },
        },
      }],
    }],
    publication: {
      revision: 1,
      fingerprint: v4Fingerprint,
      releasedAt: "2026-07-18T10:01:00.000Z",
      status: "released",
    },
  };
  await writeFile(v4FilePath, JSON.stringify({
    version: 1,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ registry: [{ ...releaseBase, publication: null }] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const v4Repository = createSpecifications2SnapshotRepository({ filePath: v4FilePath, env: {} });
  const v4Applied = await v4Repository.applyServerPublicationProjection(v4Entry, {
    jobId: "qa-adapter-v4",
    aggregateType: "specifications2_revision",
    aggregateId: "revision-v4",
    aggregateRevision: 1,
    commandType: "publish_revision",
    payloadFingerprint: v4Fingerprint,
    relationalFingerprint: buildSpecifications2RelationalReleaseFingerprint(v4Fingerprint),
    payloadDigest: buildSpecifications2CompatibilityPayloadDigest(v4Entry),
    payloadDigestPersisted: true,
  });
  assert(v4Applied.applied && !v4Applied.conflict,
    "a valid durable adapter-v4 publication with a persisted payload digest must remain projectable after the v6 rollout");
  const v4AfterApply = await readFile(v4FilePath, "utf8");
  for (const [label, tamper] of [
    ["operation id", (value) => { value.routeDrafts[0].operations[0].operationId = "FORGED-OP"; }],
    ["work center", (value) => { value.routeDrafts[0].operations[0].workCenterId = "FORGED-WC"; }],
    ["attachment metadata", (value) => { value.routeDrafts[0].operations[0].productionFiles.gerber.size = 999; }],
  ]) {
    const forgedV4Entry = structuredClone(v4Entry);
    tamper(forgedV4Entry);
    const forgedV4 = await v4Repository.applyServerPublicationProjection(forgedV4Entry, {
      jobId: `qa-adapter-v4-forged-${label}`,
      aggregateType: "specifications2_revision",
      aggregateId: "revision-v4",
      aggregateRevision: 1,
      commandType: "publish_revision",
      payloadFingerprint: v4Fingerprint,
      relationalFingerprint: buildSpecifications2RelationalReleaseFingerprint(v4Fingerprint),
      payloadDigest: buildSpecifications2CompatibilityPayloadDigest(forgedV4Entry),
      payloadDigestPersisted: true,
    });
    assert(forgedV4.conflict && await readFile(v4FilePath, "utf8") === v4AfterApply,
      `adapter-v4 ${label} tampering must fail closed before a shared-state write`);
  }

  const v5FilePath = join(directory, "shared-state-adapter-v5.json");
  const v5Fingerprint = buildSpecifications2ReleaseFingerprint(releaseBase, { adapterVersion: 5 });
  const v5Entry = {
    ...structuredClone(releaseBase),
    publication: {
      revision: 1,
      fingerprint: v5Fingerprint,
      releasedAt: "2026-07-18T10:01:00.000Z",
      status: "released",
    },
  };
  await writeFile(v5FilePath, JSON.stringify({
    version: 1,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ registry: [{ ...releaseBase, publication: null }] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const v5Applied = await createSpecifications2SnapshotRepository({ filePath: v5FilePath, env: {} })
    .applyServerPublicationProjection(v5Entry, {
      jobId: "qa-adapter-v5",
      aggregateType: "specifications2_revision",
      aggregateId: "revision-v5",
      aggregateRevision: 1,
      commandType: "publish_revision",
      payloadFingerprint: v5Fingerprint,
      relationalFingerprint: buildSpecifications2RelationalReleaseFingerprint(v5Fingerprint),
      payloadDigest: buildSpecifications2CompatibilityPayloadDigest(v5Entry),
      payloadDigestPersisted: true,
    });
  assert(v5Applied.applied && !v5Applied.conflict,
    "a valid durable adapter-v5 publication with a persisted payload digest must remain projectable after the v6 rollout");
  const applied = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-apply"));
  assert(applied.applied && applied.publication?.revision === 1, "server revision must atomically create its compatibility projection");
  const after = JSON.parse(await readFile(filePath, "utf8"));
  const registry = JSON.parse(after.values[SPECIFICATIONS2_STORAGE_KEY]);
  const directories = JSON.parse(after.values[DIRECTORY_STORAGE_KEY]);
  const planning = JSON.parse(after.values[PLANNING_STATE_KEY]);
  assert(after.version === 4, "one mirrored revision must use one shared-state version increment");
  assert(registry.registry[0]?.publication?.fingerprint === releaseEntry.publication.fingerprint, "compatibility registry must contain the acknowledged immutable publication");
  assert(directories.specifications?.length === 1 && planning.routes?.length === 1 && planning.routeSteps?.length === 1, "directory and planning compatibility projections must be written with the revision");
  const again = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-replay"));
  const afterAgain = JSON.parse(await readFile(filePath, "utf8"));
  assert(again.applied && again.alreadyApplied && afterAgain.version === 4, "outbox delivery must be idempotent without a second snapshot write");
  assert(afterAgain.specifications2PublicationAuthority?.publications?.[releaseEntry.id]?.fingerprint === releaseEntry.publication.fingerprint, "successful server projection must persist a browser-independent publication authority marker");

  const corruptAuthorityMarkerFile = join(directory, "shared-state-corrupt-publication-coordinates.json");
  const corruptAuthorityMarker = structuredClone(afterAgain);
  corruptAuthorityMarker.specifications2PublicationAuthority.publications[releaseEntry.id].specificationId = "forged-specification-coordinate";
  await writeFile(corruptAuthorityMarkerFile, JSON.stringify(corruptAuthorityMarker), "utf8");
  const corruptAuthorityBefore = await readFile(corruptAuthorityMarkerFile, "utf8");
  const corruptAuthorityReplay = await createSpecifications2SnapshotRepository({ filePath: corruptAuthorityMarkerFile, env: {} })
    .applyServerPublicationProjection(releaseEntry, outboxProof("qa-corrupt-authority-coordinate"));
  assert(corruptAuthorityReplay.conflict && !corruptAuthorityReplay.alreadyApplied
    && await readFile(corruptAuthorityMarkerFile, "utf8") === corruptAuthorityBefore,
  "same-revision authority with a corrupted specification/root coordinate must conflict instead of being reported already applied");

  const corruptedCompleteProjection = structuredClone(afterAgain);
  corruptedCompleteProjection.version = 5;
  const corruptedPlanning = JSON.parse(corruptedCompleteProjection.values[PLANNING_STATE_KEY]);
  corruptedPlanning.routeSteps[0].operationName = "CORRUPTED-BUT-SAME-ID";
  corruptedCompleteProjection.values[PLANNING_STATE_KEY] = JSON.stringify(corruptedPlanning);
  const corruptedDirectory = JSON.parse(corruptedCompleteProjection.values[DIRECTORY_STORAGE_KEY]);
  corruptedDirectory.nomenclature = corruptedDirectory.nomenclature
    .filter((row) => String(row?.sourceSpecifications2EntryId || "") !== releaseEntry.id);
  corruptedCompleteProjection.values[DIRECTORY_STORAGE_KEY] = JSON.stringify(corruptedDirectory);
  await writeFile(filePath, JSON.stringify(corruptedCompleteProjection), "utf8");
  const repairedCorruption = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-repair-corruption"));
  const afterCorruptionRepair = JSON.parse(await readFile(filePath, "utf8"));
  const repairedPlanning = JSON.parse(afterCorruptionRepair.values[PLANNING_STATE_KEY]);
  const repairedDirectory = JSON.parse(afterCorruptionRepair.values[DIRECTORY_STORAGE_KEY]);
  assert(repairedCorruption.applied && !repairedCorruption.alreadyApplied
    && repairedPlanning.routeSteps[0].operationName === "Монтаж"
    && repairedDirectory.nomenclature.some((row) => row.sourceSpecifications2EntryId === releaseEntry.id),
  "same-id immutable corruption and missing owned Nomenclature must be repaired instead of marked already applied");

  const partialProjection = structuredClone(afterAgain);
  partialProjection.version = 6;
  partialProjection.values[PLANNING_STATE_KEY] = JSON.stringify({
    ...JSON.parse(partialProjection.values[PLANNING_STATE_KEY]),
    routeSteps: [],
  });
  await writeFile(filePath, JSON.stringify(partialProjection), "utf8");
  const repairedPartial = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-repair"));
  const afterPartialRepair = JSON.parse(await readFile(filePath, "utf8"));
  assert(repairedPartial.applied && !repairedPartial.alreadyApplied, "a directory-plus-route fragment must not be accepted as a fully applied publication");
  assert(JSON.parse(afterPartialRepair.values[PLANNING_STATE_KEY]).routeSteps.length === 1, "retry must repair missing published route steps atomically");

  const completeLegacyProjection = structuredClone(afterPartialRepair);
  completeLegacyProjection.version = 9;
  delete completeLegacyProjection.specifications2PublicationAuthority;
  await writeFile(filePath, JSON.stringify(completeLegacyProjection), "utf8");
  const authorityBackfill = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-backfill"));
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
  const higherLocalResult = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-higher-local"));
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
  const changedResult = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-changed-draft"));
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
  const deletedResult = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-deleted-draft"));
  const deletedAfter = JSON.parse(await readFile(filePath, "utf8"));
  assert(deletedResult.applied && JSON.parse(deletedAfter.values[SPECIFICATIONS2_STORAGE_KEY]).registry.length === 0, "a deleted browser draft must not be resurrected by its outbox retry");
  assert(JSON.parse(deletedAfter.values[PLANNING_STATE_KEY]).routes.length === 1, "downstream compatibility projection must still be delivered when the draft was removed");

  // Exercise the real compatibility-owner chain across two immutable
  // revisions.  The publication root can acquire an operational Work Order
  // overlay, while a PostgreSQL-derived Work Order may share the same source
  // entry without becoming part of the publication-owned route document.
  await writeFile(filePath, JSON.stringify(afterAuthorityBackfill), "utf8");
  const workOrders = createWorkOrdersRepository({ filePath, env: {} });
  const revision1Planning = JSON.parse(afterAuthorityBackfill.values[PLANNING_STATE_KEY]);
  const revision1RootId = releaseEntry.publication.rootRouteId;
  const revision1RootStepId = revision1Planning.routeSteps.find((step) => step.routeId === revision1RootId)?.id || "";
  assert(revision1RootStepId, "revision 1 must expose its exact published root operation");

  const rootQuantity = await workOrders.changeQuantity(revision1RootId, { quantity: 9, expectedRevision: 1 });
  assert(!rootQuantity.conflict && rootQuantity.item?.quantity === 9 && rootQuantity.item?.concurrencyRevision === 2,
    "the published root operational overlay must accept an independently versioned quantity");
  let operationalSnapshot = JSON.parse(await readFile(filePath, "utf8"));
  const rootSlotStart = "2026-07-21T10:00:00.000Z";
  const rootSlotSeed = await updateSharedStateSnapshot({
    filePath,
    env: {},
    expectedVersion: operationalSnapshot.version,
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.routes = currentPlanning.routes.map((route) => route.id === revision1RootId
        ? {
          ...route,
          planningStatus: "scheduled",
          workOrderSnapshot: { id: "root-operational-work-order", source: "specifications2", quantity: 9 },
        }
        : route);
      currentPlanning.slots = [{
        id: "slot-root-r1",
        routeId: revision1RootId,
        planningOrderId: revision1RootId,
        routeStepId: revision1RootStepId,
        plannedStart: "2026-07-21T08:00:00.000Z",
        plannedEnd: "2026-07-21T09:00:00.000Z",
        status: "planned",
        quantity: 9,
      }];
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  assert(rootSlotSeed.ok, "the root operational overlay must accept its physical planning slot");
  const rootSchedule = await workOrders.changeSlotSchedule(revision1RootId, revision1RootStepId, {
    plannedStart: rootSlotStart,
    expectedRevision: 2,
  });
  assert(!rootSchedule.conflict && rootSchedule.item?.concurrencyRevision === 3,
    "the published root operational overlay must retain independent schedule concurrency");
  const beforeOperationalReplay = await readFile(filePath, "utf8");
  const operationalReplay = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-operational-replay"));
  assert(operationalReplay.applied && operationalReplay.alreadyApplied
    && await readFile(filePath, "utf8") === beforeOperationalReplay,
  "an outbox retry must recognize the current immutable revision while preserving its Work Order overlay and physical slot byte-identically");

  const derivedWorkOrderId = "work-order-derived";
  const derivedStepId = "work-order-derived-step";
  const serverWorkOrders = createWorkOrdersRepository({
    filePath,
    env: { MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" },
  });
  const derivedCreated = await serverWorkOrders.applyServerWorkOrderProjection(derivedWorkOrderId, {
    targetRevision: 1,
    source: {
      sourceEntryId: releaseEntry.id,
      sourceRevision: 1,
      routeSourceDraftId: releaseEntry.routeDrafts[0].id,
      specificationRevisionId: "revision-1",
      title: releaseEntry.title,
      designation: releaseEntry.treeRows[0].designation,
      quantity: 4,
    },
    operations: [{
      id: derivedStepId,
      operationId: "OP-1",
      name: "Монтаж",
      workCenterId: "D1",
      nextWorkCenterId: "D2",
      labor: { mode: "unit", minutesPerUnit: 1 },
      executionContext: {},
    }],
  });
  assert(derivedCreated.applied && !derivedCreated.conflict,
    "the explicit Work Order authority port must create a distinct server-derived route and steps");
  operationalSnapshot = JSON.parse(await readFile(filePath, "utf8"));
  const derivedSlotStart = "2026-07-22T11:00:00.000Z";
  const derivedSlotSeed = await updateSharedStateSnapshot({
    filePath,
    env: {},
    expectedVersion: operationalSnapshot.version,
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.slots.push({
        id: "slot-work-order-derived",
        routeId: derivedWorkOrderId,
        planningOrderId: derivedWorkOrderId,
        routeStepId: derivedStepId,
        plannedStart: "2026-07-22T08:00:00.000Z",
        plannedEnd: "2026-07-22T09:00:00.000Z",
        status: "planned",
        quantity: 4,
      });
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  assert(derivedSlotSeed.ok, "the derived Work Order must accept its own physical slot");
  const derivedQuantity = await serverWorkOrders.applyServerQuantityProjection(derivedWorkOrderId, {
    expectedRevision: 1,
    targetRevision: 2,
    quantity: 7,
    operations: [{
      slot: {
        id: "slot-work-order-derived",
        quantity: 7,
        plannedStart: "2026-07-22T08:00:00.000Z",
        plannedEnd: "2026-07-22T09:00:00.000Z",
      },
    }],
  });
  const derivedSchedule = await serverWorkOrders.applyServerSlotScheduleProjection(derivedWorkOrderId, {
    expectedRevision: 2,
    targetRevision: 3,
    slot: {
      id: "slot-work-order-derived",
      plannedStart: derivedSlotStart,
      plannedEnd: "2026-07-22T12:00:00.000Z",
    },
  });
  const derivedStartDate = await serverWorkOrders.applyServerStartDateProjection(derivedWorkOrderId, {
    expectedRevision: 3,
    targetRevision: 4,
    planningStartDate: "2026-07-24",
  });
  assert(derivedQuantity.applied && !derivedQuantity.conflict && derivedQuantity.item?.quantity === 7
    && derivedSchedule.applied && !derivedSchedule.conflict && derivedSchedule.item?.concurrencyRevision === 3
    && derivedStartDate.applied && !derivedStartDate.conflict
    && derivedStartDate.item?.planningStartDate === "2026-07-24"
    && derivedStartDate.item?.concurrencyRevision === 4,
  "the explicit Work Order authority port must apply quantity, slot and start-date outbox revisions");
  const startDateReadBack = await serverWorkOrders.get(derivedWorkOrderId);
  assert(startDateReadBack.item?.planningStartDate === "2026-07-24",
    "snapshot read-back must expose the exact owner-backed start-date anchor");
  assert(startDateReadBack.item?.operations?.[0]?.slot?.plannedStart === derivedSlotStart
    && startDateReadBack.item?.operations?.[0]?.slot?.plannedEnd === "2026-07-22T12:00:00.000Z",
  "start-date compatibility projection must not move the already scheduled Gantt slot");
  let invalidStartDateError = "";
  try {
    await serverWorkOrders.applyServerStartDateProjection(derivedWorkOrderId, {
      expectedRevision: 4,
      targetRevision: 5,
      planningStartDate: "2026-02-31",
    });
  } catch (error) {
    invalidStartDateError = String(error?.message || error || "");
  }
  assert(/ISO calendar date/.test(invalidStartDateError),
    "snapshot projection must reject an impossible calendar date before writing");

  operationalSnapshot = JSON.parse(await readFile(filePath, "utf8"));
  const staleBrowserRewrite = await updateSharedStateSnapshot({
    filePath,
    env: { MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" },
    expectedVersion: operationalSnapshot.version,
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.routes = currentPlanning.routes.map((route) => route.id === derivedWorkOrderId
        ? { ...route, planningQuantity: 999, domainConcurrencyRevision: 99, workOrderSnapshot: null }
        : route);
      currentPlanning.routeSteps = currentPlanning.routeSteps.filter((step) => step.routeId !== derivedWorkOrderId);
      currentPlanning.slots = currentPlanning.slots.filter((slot) => slot.routeId !== derivedWorkOrderId);
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  const protectedPlanning = JSON.parse(staleBrowserRewrite.snapshot.values[PLANNING_STATE_KEY]);
  const protectedRoute = protectedPlanning.routes.find((route) => route.id === derivedWorkOrderId);
  assert(staleBrowserRewrite.ok
    && protectedRoute?.planningQuantity === 7
    && protectedRoute?.domainConcurrencyRevision === 4
    && protectedRoute?.planningStartDate === "2026-07-24"
    && protectedRoute?.workOrderSnapshot?.id === derivedWorkOrderId
    && protectedPlanning.routeSteps.some((step) => step.id === derivedStepId && step.routeId === derivedWorkOrderId)
    && protectedPlanning.slots.some((slot) => slot.id === "slot-work-order-derived" && slot.routeId === derivedWorkOrderId),
  "a stale legacy writer must not null, rewrite or delete server-derived Work Order operational projection fields");

  const staleBrowserDelete = await updateSharedStateSnapshot({
    filePath,
    env: { MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" },
    expectedVersion: staleBrowserRewrite.snapshot.version,
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.routes = currentPlanning.routes.filter((route) => route.id !== derivedWorkOrderId);
      currentPlanning.routeSteps = currentPlanning.routeSteps.filter((step) => step.routeId !== derivedWorkOrderId);
      currentPlanning.slots = currentPlanning.slots.filter((slot) => slot.routeId !== derivedWorkOrderId);
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  const restoredAfterDelete = JSON.parse(staleBrowserDelete.snapshot.values[PLANNING_STATE_KEY]);
  assert(staleBrowserDelete.ok
    && restoredAfterDelete.routes.some((route) => route.id === derivedWorkOrderId)
    && restoredAfterDelete.routeSteps.some((step) => step.id === derivedStepId)
    && restoredAfterDelete.slots.some((slot) => slot.id === "slot-work-order-derived"),
  "a stale legacy full save must restore a removed server-derived Work Order route, step and slot");

  const beforeForgedOwnerBytes = await readFile(filePath, "utf8");
  const beforeForgedOwner = JSON.parse(beforeForgedOwnerBytes);
  const forgedOwner = await updateSpecifications2WorkOrderSharedStateSnapshot({
    filePath,
    env: { MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" },
    expectedVersion: beforeForgedOwner.version,
    authorityProof: {
      kind: "quantity",
      workOrderId: derivedWorkOrderId,
      routeId: derivedWorkOrderId,
      expectedRevision: 3,
      targetRevision: 4,
      quantity: 8,
      slotUpdates: [],
      stamp: new Date().toISOString(),
    },
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.routes = currentPlanning.routes.map((route) => route.id === revision1RootId
        ? { ...route, name: "FORGED unrelated route" }
        : route);
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  assert(!forgedOwner.ok
    && forgedOwner.code === "specifications2-work-order-delta-invalid"
    && await readFile(filePath, "utf8") === beforeForgedOwnerBytes,
  "an internal Work Order proof must be bound to the exact route delta and leave bytes unchanged on forgery");

  const releaseBaseRevision2 = structuredClone(releaseBase);
  releaseBaseRevision2.updatedAt = "2026-07-21T12:00:00.000Z";
  releaseBaseRevision2.treeRows[0].quantity = 2;
  const revision2Fingerprint = buildSpecifications2ReleaseFingerprint(releaseBaseRevision2);
  const releaseEntryRevision2 = {
    ...releaseBaseRevision2,
    publication: {
      revision: 2,
      fingerprint: revision2Fingerprint,
      releasedAt: "2026-07-21T12:01:00.000Z",
    },
  };
  const appliedRevision2 = await snapshot.applyServerPublicationProjection(releaseEntryRevision2, {
    jobId: "qa-apply-r2",
    aggregateType: "specifications2_revision",
    aggregateId: "revision-2",
    aggregateRevision: 2,
    commandType: "publish_revision",
    payloadFingerprint: revision2Fingerprint,
    relationalFingerprint: buildSpecifications2RelationalReleaseFingerprint(revision2Fingerprint),
    payloadDigest: buildSpecifications2CompatibilityPayloadDigest(releaseEntryRevision2),
    payloadDigestPersisted: true,
  });
  const afterRevision2 = JSON.parse(await readFile(filePath, "utf8"));
  const planningRevision2 = JSON.parse(afterRevision2.values[PLANNING_STATE_KEY]);
  const oldRoot = planningRevision2.routes.find((route) => route.id === revision1RootId);
  const derivedRoute = planningRevision2.routes.find((route) => route.id === derivedWorkOrderId);
  const newRoot = planningRevision2.routes.find((route) => route.id === appliedRevision2.publication?.rootRouteId);
  const routeIds = planningRevision2.routes.map((route) => route.id);
  const routeStepIds = planningRevision2.routeSteps.map((step) => step.id);
  assert(appliedRevision2.applied && appliedRevision2.publication?.revision === 2
    && afterRevision2.specifications2PublicationAuthority?.publications?.[releaseEntry.id]?.revision === 2,
  "the Specifications 2.0 owner must advance its authority monotonically from revision 1 to revision 2");
  assert(afterRevision2.specifications2PublicationAuthority.publications[releaseEntry.id].priorRoots
    ?.some((root) => root.revision === 1 && root.rootRouteId === revision1RootId),
  "revision 2 authority must retain a bounded durable identity for its prior published root");
  assert(oldRoot?.planningQuantity === 9 && oldRoot?.planningStatus === "scheduled"
    && oldRoot?.workOrderSnapshot?.id === "root-operational-work-order"
    && planningRevision2.slots.find((slot) => slot.routeId === revision1RootId)?.plannedStart === rootSlotStart,
  "republish must preserve the operational overlay and physical slot of the referenced revision 1 root");
  assert(derivedRoute?.planningQuantity === 7 && derivedRoute?.domainConcurrencyRevision === 4
    && derivedRoute?.planningStartDate === "2026-07-24"
    && planningRevision2.routeSteps.some((step) => step.id === derivedStepId && step.routeId === derivedWorkOrderId)
    && planningRevision2.slots.find((slot) => slot.routeId === derivedWorkOrderId)?.plannedStart === derivedSlotStart,
  "republish must preserve a distinct derived Work Order route, step, quantity and slot");
  assert(newRoot?.revision === 2 && newRoot.id !== revision1RootId,
    "revision 2 must add its new immutable publication root without replacing the operational revision 1 root");
  assert(new Set(routeIds).size === routeIds.length && new Set(routeStepIds).size === routeStepIds.length,
    "r1 to r2 publication must not duplicate route or route-step ids");
  const historicalAuthorityFile = join(directory, "shared-state-r2-history.json");
  await writeFile(historicalAuthorityFile, JSON.stringify(afterRevision2), "utf8");
  const historicalDelete = await updateSharedStateSnapshot({
    filePath: historicalAuthorityFile,
    env: {},
    expectedVersion: afterRevision2.version,
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.routes = currentPlanning.routes
        .filter((route) => route.id !== revision1RootId)
        .map((route) => route.id === derivedWorkOrderId ? { ...route, name: "Derived Work Order remains independent" } : route);
      currentPlanning.routeSteps = currentPlanning.routeSteps.filter((step) => step.routeId !== revision1RootId);
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  const afterHistoricalDelete = JSON.parse(historicalDelete.snapshot.values[PLANNING_STATE_KEY]);
  const restoredHistoricalRoot = afterHistoricalDelete.routes.find((route) => route.id === revision1RootId);
  assert(historicalDelete.ok && restoredHistoricalRoot?.workOrderSnapshot?.id === "root-operational-work-order"
    && afterHistoricalDelete.routeSteps.some((step) => step.id === revision1RootStepId && step.routeId === revision1RootId)
    && afterHistoricalDelete.slots.some((slot) => slot.routeId === revision1RootId)
    && afterHistoricalDelete.routes.find((route) => route.id === derivedWorkOrderId)?.name === "Derived Work Order remains independent",
  "a generic writer must restore the slotted historical published root and steps while leaving a distinct derived Work Order writable");
  const unslottedHistoricalAuthorityFile = join(directory, "shared-state-r2-unslotted-history.json");
  const unslottedHistory = structuredClone(afterRevision2);
  const unslottedPlanning = JSON.parse(unslottedHistory.values[PLANNING_STATE_KEY]);
  unslottedPlanning.slots = unslottedPlanning.slots.filter((slot) => slot.routeId !== revision1RootId);
  unslottedHistory.values[PLANNING_STATE_KEY] = JSON.stringify(unslottedPlanning);
  await writeFile(unslottedHistoricalAuthorityFile, JSON.stringify(unslottedHistory), "utf8");
  const unslottedHistoricalDelete = await updateSharedStateSnapshot({
    filePath: unslottedHistoricalAuthorityFile,
    env: {},
    expectedVersion: unslottedHistory.version,
    update: (current) => {
      const currentPlanning = JSON.parse(current.values[PLANNING_STATE_KEY]);
      currentPlanning.routes = currentPlanning.routes.filter((route) => route.id !== revision1RootId);
      currentPlanning.routeSteps = currentPlanning.routeSteps.filter((step) => step.routeId !== revision1RootId);
      return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(currentPlanning) } };
    },
  });
  const afterUnslottedHistoricalDelete = JSON.parse(unslottedHistoricalDelete.snapshot.values[PLANNING_STATE_KEY]);
  assert(unslottedHistoricalDelete.ok
    && afterUnslottedHistoricalDelete.routes.find((route) => route.id === revision1RootId)?.workOrderSnapshot?.id === "root-operational-work-order"
    && afterUnslottedHistoricalDelete.routeSteps.some((step) => step.id === revision1RootStepId && step.routeId === revision1RootId)
    && !afterUnslottedHistoricalDelete.slots.some((slot) => slot.routeId === revision1RootId),
  "a generic writer must restore an unslotted historical publication root while its Work Order overlay remains active");
  const beforeDowngrade = await readFile(filePath, "utf8");
  const staleRevision1 = await snapshot.applyServerPublicationProjection(releaseEntry, outboxProof("qa-stale-r1"));
  assert(staleRevision1.conflict && await readFile(filePath, "utf8") === beforeDowngrade,
    "the monotonic revision 2 authority must reject a stale revision 1 outbox delivery byte-identically");

  const digestlessV4Entry = structuredClone(v4Entry);
  digestlessV4Entry.title = "FORGED TITLE NOT COVERED BY ADAPTER V4";
  const digestlessV4Marks = [];
  let digestlessV4ProjectionCalls = 0;
  const digestlessV4Sync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() {
        return [{
          id: 68,
          aggregateType: "specifications2_revision",
          aggregateId: "revision-v4-digestless",
          aggregateRevision: 1,
          commandType: "publish_revision",
          payload: outboxPayload(digestlessV4Entry, { includeDigest: false }),
        }];
      },
      async markSnapshotSync(id, mark) { digestlessV4Marks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { digestlessV4ProjectionCalls += 1; return { applied: true }; } },
  });
  assert(digestlessV4Sync.conflicts === 1 && digestlessV4Sync.failed === 0
    && digestlessV4Marks[0]?.state === "conflict" && digestlessV4ProjectionCalls === 0,
  "a digestless adapter-v4 row must be terminally quarantined because its old fingerprint cannot attest every projection field");

  const persistedV4Marks = [];
  let persistedV4ProjectionCalls = 0;
  const persistedV4Sync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() {
        return [{
          id: 67,
          aggregateType: "specifications2_revision",
          aggregateId: "revision-v4-persisted-digest",
          aggregateRevision: 1,
          commandType: "publish_revision",
          payload: outboxPayload(v4Entry),
        }];
      },
      async markSnapshotSync(id, mark) { persistedV4Marks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection(_entry, proof) {
      persistedV4ProjectionCalls += 1;
      assert(proof.payloadDigestPersisted === true,
        "legacy replay proof must retain the fact that its full payload digest came from the durable outbox");
      return { applied: true };
    } },
  });
  assert(persistedV4Sync.applied === 1 && persistedV4Marks[0]?.state === "applied" && persistedV4ProjectionCalls === 1,
    "a bounded adapter-v4 row with its persisted full payload digest must remain replayable");

  const oversizedV4Source = structuredClone(v4SourceEntry);
  oversizedV4Source.routeDrafts[0].operations[0].productionFiles.gerber.inlineDataUrl =
    `data:application/zip;base64,${"A".repeat(SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES)}`;
  const oversizedV4Fingerprint = buildSpecifications2ReleaseFingerprint(oversizedV4Source, { adapterVersion: 4 });
  assert(specifications2ReleaseFingerprintByteLength(oversizedV4Fingerprint) > SPECIFICATIONS2_RELEASE_FINGERPRINT_MAX_BYTES,
    "oversized legacy QA fixture must exceed the compatibility fingerprint bound");
  const oversizedV4Entry = structuredClone(oversizedV4Source);
  delete oversizedV4Entry.routeDrafts[0].operations[0].productionFiles.gerber.inlineDataUrl;
  oversizedV4Entry.publication = {
    revision: 1,
    fingerprint: oversizedV4Fingerprint,
    releasedAt: "2026-07-18T10:01:00.000Z",
    status: "released",
  };
  const oversizedV4Marks = [];
  let oversizedV4ProjectionCalls = 0;
  const oversizedV4Sync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() {
        return [{
          id: 69,
          aggregateType: "specifications2_revision",
          aggregateId: "revision-v4-oversized",
          aggregateRevision: 1,
          commandType: "publish_revision",
          payload: outboxPayload(oversizedV4Entry),
        }];
      },
      async markSnapshotSync(id, mark) { oversizedV4Marks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { oversizedV4ProjectionCalls += 1; return { applied: true }; } },
  });
  assert(oversizedV4Sync.conflicts === 1 && oversizedV4Sync.failed === 0
    && oversizedV4Marks[0]?.state === "conflict" && oversizedV4ProjectionCalls === 0,
  "an oversized adapter-v4 fingerprint must become a terminal conflict before shared-state projection");

  const marks = [];
  const result = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs(limit, filter) {
        assert(limit === 20 && filter.aggregateType === "specifications2_revision", "Specs2 sync must query only its own outbox aggregate");
        return [{ id: 71, aggregateType: "specifications2_revision", aggregateId: "revision-1", aggregateRevision: 1, commandType: "publish_revision", payload: outboxPayload(releaseEntry) }];
      },
      async markSnapshotSync(id, mark) { marks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection(entry, proof) {
      assert(entry.id === releaseEntry.id, "outbox must deliver its immutable entry");
      assert(proof.jobId === "71" && proof.aggregateType === "specifications2_revision" && proof.commandType === "publish_revision",
        "snapshot authority must receive the exact durable outbox job proof");
      assert(proof.aggregateId === "revision-1" && proof.aggregateRevision === 1
        && proof.payloadFingerprint === releaseEntry.publication.fingerprint
        && proof.relationalFingerprint === buildSpecifications2RelationalReleaseFingerprint(releaseEntry.publication.fingerprint)
        && proof.payloadDigest === buildSpecifications2CompatibilityPayloadDigest(releaseEntry)
        && proof.payloadDigestPersisted === true,
      "snapshot authority must bind aggregate revision and the complete compatibility payload to the publication");
      return { applied: true };
    } },
  });
  assert(result.applied === 1 && marks[0]?.state === "applied", "successful Specs2 mirror must close the PostgreSQL outbox row");

  const deferredMarks = [];
  const deferred = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ id: 72, aggregateType: "specifications2_revision", aggregateId: "revision-2", aggregateRevision: 1, commandType: "publish_revision", payload: outboxPayload() }]; },
      async markSnapshotSync(id, mark) { deferredMarks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { return { applied: false, retryable: true, error: "temporary file lock" }; } },
  });
  assert(deferred.failed === 1 && deferredMarks[0]?.state === "pending", "temporary compatibility failure must remain retryable in the outbox");

  const invalidFingerprintEntry = {
    ...releaseEntry,
    publication: { ...releaseEntry.publication, fingerprint: "immutable-but-invalid-fingerprint" },
  };
  const invalidFingerprintMarks = [];
  const invalidFingerprintSync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() {
        return [{
          id: 77,
          aggregateType: "specifications2_revision",
          aggregateId: "revision-invalid-fingerprint",
          aggregateRevision: 1,
          commandType: "publish_revision",
          payload: outboxPayload(invalidFingerprintEntry),
        }];
      },
      async markSnapshotSync(id, mark) { invalidFingerprintMarks.push({ id, ...mark }); },
    },
    snapshot: createSpecifications2SnapshotRepository({ filePath, env: {} }),
  });
  assert(invalidFingerprintSync.conflicts === 1 && invalidFingerprintSync.failed === 0
    && invalidFingerprintMarks[0]?.state === "conflict",
  "an immutable payload whose release fingerprint is invalid must leave pending as a terminal conflict");

  const payloadTamperEntry = structuredClone(releaseEntry);
  payloadTamperEntry.updatedAt = "2026-07-18T10:00:01.000Z";
  assert(buildSpecifications2ReleaseFingerprint(payloadTamperEntry) === releaseEntry.publication.fingerprint
    && buildSpecifications2CompatibilityPayloadDigest(payloadTamperEntry) !== buildSpecifications2CompatibilityPayloadDigest(releaseEntry),
  "the complete payload digest must bind normalized transport metadata outside immutable v6 projection identity");
  const tamperedPayload = outboxPayload(releaseEntry);
  tamperedPayload.compatibilityEntry = payloadTamperEntry;
  const tamperMarks = [];
  const tamperSync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() {
        return [{ id: 78, aggregateType: "specifications2_revision", aggregateId: "revision-tampered", aggregateRevision: 1, commandType: "publish_revision", payload: tamperedPayload }];
      },
      async markSnapshotSync(id, mark) { tamperMarks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { throw new Error("tampered payload must not reach projection"); } },
  });
  assert(tamperSync.conflicts === 1 && tamperMarks[0]?.state === "conflict",
    "a compatibility entry changed after its canonical outbox digest must fail closed");

  const mixedCommandMarks = [];
  let validMixedProjectionCalls = 0;
  const mixedCommands = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() {
        return [
          { id: 79, aggregateType: "specifications2_revision", aggregateId: "poison", aggregateRevision: 1, commandType: "unexpected_command", payload: outboxPayload() },
          { id: 80, aggregateType: "specifications2_revision", aggregateId: "valid", aggregateRevision: 1, commandType: "publish_revision", payload: outboxPayload() },
        ];
      },
      async markSnapshotSync(id, mark) { mixedCommandMarks.push({ id, ...mark }); },
    },
    snapshot: { async applyServerPublicationProjection() { validMixedProjectionCalls += 1; return { applied: true }; } },
  });
  assert(mixedCommands.total === 2 && mixedCommands.conflicts === 1 && mixedCommands.applied === 1
    && mixedCommandMarks.find((mark) => mark.id === 79)?.state === "conflict"
    && mixedCommandMarks.find((mark) => mark.id === 80)?.state === "applied"
    && validMixedProjectionCalls === 1,
  "an unsupported pending command must be retired without starving a valid publication behind it");

  const livenessFilePath = join(directory, "shared-state-liveness.json");
  await writeFile(livenessFilePath, JSON.stringify({
    version: 1,
    values: {
      [SPECIFICATIONS2_STORAGE_KEY]: JSON.stringify({ selectedId: releaseBase.id, registry: [{ ...releaseBase, publication: null }] }),
      [DIRECTORY_STORAGE_KEY]: JSON.stringify({ nomenclature: [], specifications: [] }),
      [PLANNING_STATE_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
    },
  }), "utf8");
  const livenessJob = {
    id: 74,
    aggregateType: "specifications2_revision",
    aggregateId: "revision-1",
    aggregateRevision: 1,
    commandType: "publish_revision",
    payload: outboxPayload(),
  };
  const permanentRepository = createSpecifications2SnapshotRepository({
    filePath: livenessFilePath,
    env: {},
    updatePublicationSnapshot: async ({ authorityProof, update }) => {
      assert(authorityProof.jobId === "74" || authorityProof.jobId === "qa-permanent",
        "the injected publication writer must receive the exact outbox proof");
      assert(typeof update === "function", "the repository must supply its exact compatibility projection update");
      return {
        ok: false,
        forbidden: true,
        conflict: false,
        statusCode: 409,
        code: "specifications2-authority-delta-invalid",
        error: "permanent Specifications 2.0 authority denial",
      };
    },
  });
  const permanentProjection = await permanentRepository.applyServerPublicationProjection(
    releaseEntry,
    outboxProof("qa-permanent"),
  );
  assert(permanentProjection.conflict === true && permanentProjection.retryable === false
    && permanentProjection.code === "specifications2-authority-delta-invalid"
    && permanentProjection.statusCode === 409,
  "a permanent authority/policy rejection must retain its code and become a terminal projection conflict");
  const permanentMarks = [];
  const permanentSync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [livenessJob]; },
      async markSnapshotSync(id, mark) { permanentMarks.push({ id, ...mark }); },
    },
    snapshot: permanentRepository,
  });
  assert(permanentSync.conflicts === 1 && permanentSync.failed === 0
    && permanentMarks[0]?.state === "conflict",
  "a permanently rejected authority outbox row must exit pending state instead of retrying forever");

  const casRepository = createSpecifications2SnapshotRepository({
    filePath: livenessFilePath,
    env: {},
    updatePublicationSnapshot: async () => ({
      ok: false,
      configured: true,
      conflict: true,
      error: "shared-state version changed concurrently",
    }),
  });
  const casProjection = await casRepository.applyServerPublicationProjection(releaseEntry, outboxProof("qa-cas"));
  assert(casProjection.retryable === true && casProjection.conflict !== true,
    "an ordinary compare-and-set race must remain a retryable projection failure");
  const casMarks = [];
  const casSync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ ...livenessJob, id: 75 }]; },
      async markSnapshotSync(id, mark) { casMarks.push({ id, ...mark }); },
    },
    snapshot: casRepository,
  });
  assert(casSync.failed === 1 && casSync.conflicts === 0 && casMarks[0]?.state === "pending",
    "a compare-and-set race must leave its outbox row pending for a later retry");

  const storageRepository = createSpecifications2SnapshotRepository({
    filePath: livenessFilePath,
    env: {},
    updatePublicationSnapshot: async () => ({
      ok: false,
      configured: true,
      retryable: true,
      code: "kv-temporarily-unavailable",
      error: "temporary shared-state storage outage",
    }),
  });
  const storageProjection = await storageRepository.applyServerPublicationProjection(releaseEntry, outboxProof("qa-storage"));
  assert(storageProjection.retryable === true && storageProjection.conflict !== true
    && storageProjection.code === "kv-temporarily-unavailable",
  "an explicitly retryable storage outage must remain pending even when it has an operational error code");
  const storageMarks = [];
  const storageSync = await syncPendingSpecifications2PublicationChanges({
    primary: {
      async listPendingSnapshotSyncs() { return [{ ...livenessJob, id: 76 }]; },
      async markSnapshotSync(id, mark) { storageMarks.push({ id, ...mark }); },
    },
    snapshot: storageRepository,
  });
  assert(storageSync.failed === 1 && storageSync.conflicts === 0 && storageMarks[0]?.state === "pending",
    "a retryable storage outage must leave its outbox row pending for recovery");

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
