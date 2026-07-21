import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY,
  NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY,
  buildSpecifications2PublicationAuthority,
  readSharedStateSnapshot,
  updateDirectoryClusterCommandSharedStateSnapshot,
  updateNomenclatureCommandSharedStateSnapshot,
  updateSharedStateSnapshot,
  updateSpecifications2PublicationSharedStateSnapshot,
  updateSpecifications2WorkOrderSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";
import {
  applyNomenclatureTypeCommand,
  inspectNomenclatureTypeImpact,
} from "./directory-cluster-type-reducer.mjs";
import {
  applyNomenclatureCommandReducer,
  buildNomenclatureCommandRequestFingerprint,
  buildNomenclatureDirectoryOutcomeFingerprint,
} from "./domain-nomenclature-reducer.mjs";
import {
  buildSpecifications2CompatibilityPayloadDigest,
  buildSpecifications2RelationalReleaseFingerprint,
} from "./domain-specifications2-export.mjs";
import {
  buildSpecifications2ReleaseFingerprint,
  publishSpecifications2Entry,
} from "../src/modules/specifications2/publication.js";

const DIRECTORY_KEY = "mes-planning-prototype-directories-v2";
const PLANNING_KEY = "mes-planning-prototype-state-v2";
const SPECIFICATIONS2_KEY = "mes-specifications-2-registry-v1";
const protectedEnv = {
  APP_ENV: "local",
  MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
  MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1",
};
const receiptKey = (actorId, idempotencyKey) => createHash("sha256")
  .update(`${actorId}\0${idempotencyKey}`)
  .digest("hex");
const stableJsonValue = (value) => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
};
const directoryFingerprint = (value) => createHash("sha256")
  .update(JSON.stringify(stableJsonValue(value)))
  .digest("hex");
const directoryRequestFingerprint = (surface, expectedRevision, command) => createHash("sha256")
  .update(JSON.stringify(stableJsonValue({ surface, expectedRevision, command })))
  .digest("hex");

async function attemptNomenclatureOwnerWrite({
  filePath,
  command,
  actorId,
  displayName,
  now,
  mutateDirectory = (value) => value,
  mutateSnapshot = (value) => value,
  receiptPatch = {},
}) {
  const employeeId = actorId.replace(/^employee:/u, "");
  const key = receiptKey(actorId, command.idempotencyKey);
  return updateNomenclatureCommandSharedStateSnapshot({
    env: {
      APP_ENV: "local",
      MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1",
      MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1",
    },
    filePath,
    expectedVersion: command.expectedRevision,
    authorityProof: {
      actorId,
      entityId: command.itemId,
      idempotencyKey: command.idempotencyKey,
      command,
      now,
      expectedRevision: command.expectedRevision,
      displayName,
    },
    update: (current) => {
      const currentDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
      const mutation = applyNomenclatureCommandReducer(currentDirectory, command, now);
      assert(mutation.ok, `Nomenclature authority fixture requires a valid reducer result: ${JSON.stringify(mutation)}`);
      const nextDirectory = mutateDirectory(structuredClone(mutation.directory));
      const destructiveAction = command.kind === "delete";
      const receipt = {
        requestFingerprint: buildNomenclatureCommandRequestFingerprint(command),
        outcomeFingerprint: buildNomenclatureDirectoryOutcomeFingerprint(nextDirectory),
        idempotencyKey: command.idempotencyKey,
        kind: command.kind,
        itemId: command.itemId,
        item: mutation.item,
        commandRevision: Number(current.version || 0) + 1,
        unlinkedReferences: mutation.unlinkedReferences,
        actorId,
        employeeId,
        authorizationRevision: null,
        authorizationDecision: null,
        baseRevision: command.expectedRevision,
        rebased: command.expectedRevision < Number(current.version || 0),
        statusCode: command.kind === "create" ? 201 : 200,
        destructiveAction,
        recoveryArtifact: destructiveAction
          ? { kind: "file-backup", status: "created", artifactName: "qa-backup.json", metadataName: "qa-backup.meta.json" }
          : null,
        createdAt: now,
        ...receiptPatch,
      };
      const currentLedger = current.values[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]
        ? JSON.parse(current.values[NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY])
        : { schemaVersion: 1, entries: {} };
      const candidate = {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify(nextDirectory),
          [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
            schemaVersion: 1,
            entries: { ...currentLedger.entries, [key]: receipt },
          }),
        },
        updatedBy: { actor: actorId, employeeId, displayName },
        events: [{
          action: `nomenclature-command:${command.kind}`,
          actor: actorId,
          employeeId,
          itemId: command.itemId,
          authorizationRevision: null,
          authorizationDecision: null,
          createdAt: now,
          version: Number(current.version || 0) + 1,
        }, ...(current.events || [])].slice(0, 50),
      };
      return mutateSnapshot(candidate);
    },
  });
}

function directory() {
  return {
    operationMap: [],
    componentTypes: [],
    nomenclatureTypes: [
      { id: "type-mech", name: "Механика" },
      { id: "type-rea", name: "РЭА компоненты" },
    ],
    nomenclature: [{ id: "nom-a", name: "Корпус", type: "Механика" }],
    bomLists: [],
    specifications: [],
    statuses: [],
  };
}

function snapshot(version = 1) {
  return {
    version,
    updatedAt: "2026-07-21T00:00:00.000Z",
    updatedBy: { actor: "qa-seed" },
    values: {
      [DIRECTORY_KEY]: JSON.stringify(directory()),
      [PLANNING_KEY]: JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
      [SPECIFICATIONS2_KEY]: JSON.stringify({ selectedId: "", registry: [] }),
    },
    sharedUi: {},
    events: [],
  };
}

function specifications2CompatibilityEntry() {
  const releasedAt = "2026-07-21T00:00:40.000Z";
  const draft = {
    id: "spec-authority-entry",
    title: "Authority replay fixture",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: releasedAt,
    selectedRouteDraftId: "route-authority",
    treeRows: [{
      id: "root-authority",
      parentId: "",
      level: 0,
      label: "AUTH.001 Authority fixture",
      designation: "AUTH.001",
      type: "Изделия",
      quantity: 1,
      unit: "шт.",
      status: "ready",
    }],
    routeDrafts: [{
      id: "route-authority",
      productKey: "root-authority",
      productLabel: "AUTH.001 Authority fixture",
      designation: "AUTH.001",
      status: "ready",
      operations: [{
        id: "operation-authority",
        operationId: "OP-AUTH",
        name: "Exact immutable operation",
        workCenterId: "WC-AUTH",
        nextWorkCenterId: "",
        nextOperationId: "",
        changesProperty: true,
        inputState: "raw",
        outputState: "ready",
        instructionRequired: true,
        laborNorm: { calculationMode: "fixed", fixedMinutes: 5 },
        productionFiles: {},
      }],
    }],
  };
  return {
    ...draft,
    publication: {
      revision: 1,
      fingerprint: buildSpecifications2ReleaseFingerprint(draft),
      releasedAt,
      status: "released",
    },
  };
}

const root = await mkdtemp(join(tmpdir(), "mes-shared-state-authority-"));
const filePath = join(root, "shared-state.json");
try {
  await writeFile(filePath, `${JSON.stringify(snapshot())}\n`, { mode: 0o600 });
  const originalBytes = await readFile(filePath, "utf8");

  const specificationsAuthorityFilePath = join(root, "specifications-authority.json");
  const compatibilityEntry = specifications2CompatibilityEntry();
  const { publication: _publication, ...compatibilityDraft } = compatibilityEntry;
  const specificationsAuthoritySnapshot = {
    ...snapshot(),
    values: {
      ...snapshot().values,
      [SPECIFICATIONS2_KEY]: JSON.stringify({
        selectedId: compatibilityEntry.id,
        registry: [compatibilityDraft],
      }),
    },
  };
  await writeFile(specificationsAuthorityFilePath, `${JSON.stringify(specificationsAuthoritySnapshot)}\n`, { mode: 0o600 });
  const specificationsAuthorityBytes = await readFile(specificationsAuthorityFilePath, "utf8");
  const projectedPublication = publishSpecifications2Entry(compatibilityEntry, {
    directoryState: JSON.parse(specificationsAuthoritySnapshot.values[DIRECTORY_KEY]),
    planningState: JSON.parse(specificationsAuthoritySnapshot.values[PLANNING_KEY]),
    acknowledgedPublication: compatibilityEntry.publication,
    now: compatibilityEntry.publication.releasedAt,
  });
  const specificationsAuthorityProof = {
    jobId: "qa-specifications-authority-job",
    aggregateType: "specifications2_revision",
    aggregateId: "qa-specifications-authority-revision",
    aggregateRevision: compatibilityEntry.publication.revision,
    commandType: "publish_revision",
    payloadFingerprint: compatibilityEntry.publication.fingerprint,
    relationalFingerprint: buildSpecifications2RelationalReleaseFingerprint(compatibilityEntry.publication.fingerprint),
    payloadDigest: buildSpecifications2CompatibilityPayloadDigest(compatibilityEntry),
    payloadDigestPersisted: true,
    compatibilityEntry,
    entryId: compatibilityEntry.id,
    revision: projectedPublication.publication.revision,
    fingerprint: projectedPublication.publication.fingerprint,
    specificationId: projectedPublication.publication.specificationId,
    rootRouteId: projectedPublication.publication.rootRouteId,
  };
  const forgedSpecificationsStep = await updateSpecifications2PublicationSharedStateSnapshot({
    filePath: specificationsAuthorityFilePath,
    expectedVersion: 1,
    authorityProof: specificationsAuthorityProof,
    update: (current) => {
      const projection = publishSpecifications2Entry(compatibilityEntry, {
        directoryState: JSON.parse(current.values[DIRECTORY_KEY]),
        planningState: JSON.parse(current.values[PLANNING_KEY]),
        acknowledgedPublication: compatibilityEntry.publication,
        now: compatibilityEntry.publication.releasedAt,
      });
      projection.planningState.routeSteps[0].operationName = "FORGED self-asserted operation";
      const registry = JSON.parse(current.values[SPECIFICATIONS2_KEY]);
      return {
        ...current,
        specifications2PublicationAuthority: buildSpecifications2PublicationAuthority(
          current,
          compatibilityEntry.id,
          projection.publication,
        ),
        values: {
          ...current.values,
          [SPECIFICATIONS2_KEY]: JSON.stringify({
            ...registry,
            registry: registry.registry.map((entry) => entry.id === compatibilityEntry.id
              ? { ...entry, publication: projection.publication }
              : entry),
          }),
          [DIRECTORY_KEY]: JSON.stringify(projection.directoryState),
          [PLANNING_KEY]: JSON.stringify(projection.planningState),
        },
      };
    },
  });
  assert(!forgedSpecificationsStep.ok
    && forgedSpecificationsStep.code === "specifications2-authority-projection-invalid",
  "a self-asserted Specifications 2.0 proof must not authorize an immutable route-step mutation");
  assert.equal(await readFile(specificationsAuthorityFilePath, "utf8"), specificationsAuthorityBytes,
    "a rejected Specifications 2.0 owner projection must leave exact file bytes and revision unchanged");

  const exactSpecificationsProjection = await updateSpecifications2PublicationSharedStateSnapshot({
    filePath: specificationsAuthorityFilePath,
    expectedVersion: 1,
    authorityProof: specificationsAuthorityProof,
    update: (current) => {
      const projection = publishSpecifications2Entry(compatibilityEntry, {
        directoryState: JSON.parse(current.values[DIRECTORY_KEY]),
        planningState: JSON.parse(current.values[PLANNING_KEY]),
        acknowledgedPublication: compatibilityEntry.publication,
        now: compatibilityEntry.publication.releasedAt,
      });
      const registry = JSON.parse(current.values[SPECIFICATIONS2_KEY]);
      return {
        ...current,
        specifications2PublicationAuthority: buildSpecifications2PublicationAuthority(
          current,
          compatibilityEntry.id,
          projection.publication,
        ),
        values: {
          ...current.values,
          [SPECIFICATIONS2_KEY]: JSON.stringify({
            ...registry,
            registry: registry.registry.map((entry) => entry.id === compatibilityEntry.id
              ? { ...entry, publication: projection.publication }
              : entry),
          }),
          [DIRECTORY_KEY]: JSON.stringify(projection.directoryState),
          [PLANNING_KEY]: JSON.stringify(projection.planningState),
        },
      };
    },
  });
  assert(exactSpecificationsProjection.ok && exactSpecificationsProjection.snapshot.version === 2,
    "the exact digest-bound Specifications 2.0 replay must remain writable through its owner port");

  const blockedDirectoryBypass = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath,
    expectedVersion: 1,
    update: (current) => {
      const nextDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
      nextDirectory.nomenclatureTypes[0].name = "Подменено внутренним writer";
      return { ...current, values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(nextDirectory) } };
    },
  });
  assert(!blockedDirectoryBypass.ok && blockedDirectoryBypass.forbidden
    && blockedDirectoryBypass.code === "directory-cluster-command-required",
  `expected generic Directory bypass to fail closed, received ${JSON.stringify(blockedDirectoryBypass)}`);
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "rejected internal Directory bypass must leave version and file bytes unchanged");

  const inPlaceBaselineBypass = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath,
    expectedVersion: 1,
    update: (current) => {
      const nextDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
      nextDirectory.nomenclatureTypes[0].name = "In-place baseline bypass";
      current.values[DIRECTORY_KEY] = JSON.stringify(nextDirectory);
      return current;
    },
  });
  assert(!inPlaceBaselineBypass.ok && inPlaceBaselineBypass.code === "directory-cluster-command-required",
    "an in-place update callback must not mutate the authority baseline it is compared against");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "an in-place baseline bypass must leave version and file bytes unchanged");
  const afterInPlaceBypass = await readSharedStateSnapshot({ filePath });
  assert.equal(JSON.parse(afterInPlaceBypass.snapshot.values[DIRECTORY_KEY]).nomenclatureTypes[0].name, "Механика",
    "a rejected in-place update must not poison the process-local snapshot cache");

  const cacheAliasFilePath = join(root, "cache-alias-shared-state.json");
  await writeFile(cacheAliasFilePath, `${JSON.stringify(snapshot())}\n`, { mode: 0o600 });
  const exposedRead = await readSharedStateSnapshot({ filePath: cacheAliasFilePath });
  const exposedDirectory = JSON.parse(exposedRead.snapshot.values[DIRECTORY_KEY]);
  exposedDirectory.nomenclatureTypes[0].name = "Mutated public read alias";
  exposedRead.snapshot.values[DIRECTORY_KEY] = JSON.stringify(exposedDirectory);
  const afterExposedReadMutation = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath: cacheAliasFilePath,
    expectedVersion: 1,
    update: (current) => ({ ...current, sharedUi: { cacheAliasProof: true } }),
  });
  assert(afterExposedReadMutation.ok
    && JSON.parse(afterExposedReadMutation.snapshot.values[DIRECTORY_KEY]).nomenclatureTypes[0].name === "Механика",
  "mutating a public read result must not poison the cached authority baseline used by a later allowed write");
  const cacheAliasPersisted = JSON.parse(await readFile(cacheAliasFilePath, "utf8"));
  assert.equal(JSON.parse(cacheAliasPersisted.values[DIRECTORY_KEY]).nomenclatureTypes[0].name, "Механика",
    "the file cache must store and return detached snapshots only");

  const postValidationMutation = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath,
    expectedVersion: 1,
    update: (current) => ({ ...current, sharedUi: { harmless: true } }),
    beforeWrite: async ({ snapshot: candidate }) => {
      const nextDirectory = JSON.parse(candidate.values[DIRECTORY_KEY]);
      nextDirectory.nomenclatureTypes[0].name = "Подмена после проверки";
      candidate.values[DIRECTORY_KEY] = JSON.stringify(nextDirectory);
    },
  });
  assert(!postValidationMutation.ok && postValidationMutation.code === "directory-cluster-command-required",
    "the backup hook must not mutate protected data after authority validation");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "a rejected post-validation mutation must leave the snapshot byte-identical");

  let observedStoreContext = null;
  const capabilityIsolation = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath,
    expectedVersion: 1,
    update: (current) => ({ ...current, sharedUi: { capabilityIsolation: true } }),
    beforeWrite: async ({ store }) => {
      observedStoreContext = store;
      assert(Object.isFrozen(store), "the recovery hook store descriptor must be immutable");
      assert.equal(typeof store.write, "undefined", "the recovery hook must not receive raw write authority");
      assert.equal(typeof store.compareAndSet, "undefined", "the recovery hook must not receive raw CAS authority");
    },
  });
  assert(capabilityIsolation.ok && observedStoreContext?.kind === "file"
    && observedStoreContext.filePath === filePath,
  "a recovery hook must retain only the bounded storage identity needed to create a backup");
  await writeFile(filePath, originalBytes, { mode: 0o600 });

  const delayedMutationFilePath = join(root, "delayed-mutation-shared-state.json");
  await writeFile(delayedMutationFilePath, `${JSON.stringify(snapshot())}\n`, { mode: 0o600 });
  let retainedCandidate = null;
  const delayedPostValidationMutation = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath: delayedMutationFilePath,
    expectedVersion: 1,
    update: (current) => ({ ...current, sharedUi: { harmlessDelayedWrite: true } }),
    beforeWrite: async ({ snapshot: candidate }) => {
      retainedCandidate = candidate;
      queueMicrotask(() => queueMicrotask(() => {
        const nextDirectory = JSON.parse(retainedCandidate.values[DIRECTORY_KEY]);
        nextDirectory.nomenclatureTypes[0].name = "Отложенная подмена после проверки";
        retainedCandidate.values[DIRECTORY_KEY] = JSON.stringify(nextDirectory);
      }));
    },
  });
  assert(delayedPostValidationMutation.ok,
    "an unrelated write must remain available when the retained hook reference is mutated later");
  const delayedPersisted = JSON.parse(await readFile(delayedMutationFilePath, "utf8"));
  assert.equal(JSON.parse(retainedCandidate.values[DIRECTORY_KEY]).nomenclatureTypes[0].name,
    "Отложенная подмена после проверки",
    "the adversarial hook must actually mutate its retained candidate after validation");
  assert.equal(JSON.parse(delayedPersisted.values[DIRECTORY_KEY]).nomenclatureTypes[0].name, "Механика",
    "the persisted CAS candidate must be detached from every callback reference after validation");

  const previousProcessDirectoryFlag = process.env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS;
  try {
    process.env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS = "1";
    const callerOmittedPolicy = await updateSharedStateSnapshot({
      env: { APP_ENV: "local" },
      filePath,
      expectedVersion: 1,
      update: (current) => {
        const nextDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
        nextDirectory.nomenclatureTypes[0].name = "Caller omitted live policy";
        return { ...current, values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(nextDirectory) } };
      },
    });
    assert(!callerOmittedPolicy.ok && callerOmittedPolicy.code === "directory-cluster-command-required",
      "a caller-supplied env must not disable an active process-level owner policy");
  } finally {
    if (previousProcessDirectoryFlag === undefined) delete process.env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS;
    else process.env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS = previousProcessDirectoryFlag;
  }
  assert.equal(await readFile(filePath, "utf8"), originalBytes);

  const disabledOwner = await updateDirectoryClusterCommandSharedStateSnapshot({
    env: { APP_ENV: "local" },
    filePath,
    expectedVersion: 1,
    authorityProof: { actorId: "employee:qa", entityId: "type-mech", idempotencyKey: "qa-disabled-owner" },
    update: (current) => ({ ...current, sharedUi: { disabledOwnerAttempt: true } }),
  });
  assert(!disabledOwner.ok && disabledOwner.code === "directory-cluster-command-owner-disabled",
    "the explicit Directory owner port must be inert after rollout deactivation");

  const forgedActor = "employee:qa-forger";
  const forgedIdempotencyKey = "qa-forged-minimal-receipt";
  const forgedKey = receiptKey(forgedActor, forgedIdempotencyKey);
  const forgedOwnerReceipt = await updateNomenclatureCommandSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1" },
    filePath,
    expectedVersion: 1,
    authorityProof: { actorId: forgedActor, entityId: "nom-a", idempotencyKey: forgedIdempotencyKey },
    update: (current) => ({
      ...current,
      values: {
        ...current.values,
        [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 1,
          entries: { [forgedKey]: { actorId: forgedActor, itemId: "nom-a", commandRevision: 2 } },
        }),
      },
    }),
  });
  assert(!forgedOwnerReceipt.ok && forgedOwnerReceipt.code === "shared-state-authority-receipt-invalid",
    "a self-written minimal receipt must not grant shared-state owner authority");
  assert.equal(await readFile(filePath, "utf8"), originalBytes);

  const exactNomenclatureRow = directory().nomenclature[0];
  const ownerScopeCommand = {
    kind: "update",
    itemId: "nom-a",
    expectedRevision: 1,
    idempotencyKey: "qa-nomenclature-owner-scope",
    expectedRow: exactNomenclatureRow,
    row: { ...exactNomenclatureRow, name: "Точное серверное обновление" },
  };
  const nomenclatureOwnerScopeAttempt = await attemptNomenclatureOwnerWrite({
    filePath,
    command: ownerScopeCommand,
    actorId: "employee:qa-nomenclature-scope",
    displayName: "QA Nomenclature Scope",
    now: "2026-07-21T00:00:10.000Z",
    mutateSnapshot: (candidate) => ({
      ...candidate,
      values: {
        ...candidate.values,
        [PLANNING_KEY]: JSON.stringify({ routes: [{ id: "forged-route" }], routeSteps: [], slots: [] }),
      },
      sharedUi: { forgedPlanningControl: true },
    }),
  });
  assert(!nomenclatureOwnerScopeAttempt.ok && nomenclatureOwnerScopeAttempt.code === "shared-state-command-owner-delta-invalid",
    "an exact reducer-bound Nomenclature receipt must not authorize unrelated sharedUi or Planning changes");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "an out-of-scope Nomenclature owner delta must leave the snapshot byte-identical");

  const forgedReferenceCommand = {
    ...ownerScopeCommand,
    idempotencyKey: "qa-nomenclature-forged-references",
    row: { ...exactNomenclatureRow, name: "Подмена ссылок" },
  };
  const forgedReferenceAttempt = await attemptNomenclatureOwnerWrite({
    filePath,
    command: forgedReferenceCommand,
    actorId: "employee:qa-nomenclature-references",
    displayName: "QA Nomenclature References",
    now: "2026-07-21T00:00:20.000Z",
    mutateDirectory: (candidate) => ({
      ...candidate,
      bomLists: [{ id: "forged-bom", importRows: [{ id: "forged-bom-row", nomenclatureId: "ghost-item" }] }],
      specifications: [{ id: "forged-specification", outputNomenclatureId: "ghost-item" }],
    }),
  });
  assert(!forgedReferenceAttempt.ok && forgedReferenceAttempt.code === "shared-state-authority-receipt-invalid",
    "a matching receipt fingerprint must not authorize forged BOM or Specifications references outside the reducer result");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "forged Nomenclature reference deltas must leave the snapshot byte-identical");

  const falseRecoveryDelete = await attemptNomenclatureOwnerWrite({
    filePath,
    command: {
      kind: "delete",
      itemId: "nom-a",
      expectedRevision: 1,
      idempotencyKey: "qa-nomenclature-delete-without-recovery",
      expectedRow: exactNomenclatureRow,
      row: null,
    },
    actorId: "employee:qa-nomenclature-delete",
    displayName: "QA Nomenclature Delete",
    now: "2026-07-21T00:00:25.000Z",
    receiptPatch: { destructiveAction: false, recoveryArtifact: null },
  });
  assert(!falseRecoveryDelete.ok && falseRecoveryDelete.code === "shared-state-authority-receipt-invalid",
    "an exact delete reducer outcome must still be denied without destructive recovery evidence");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "a delete without recovery evidence must leave the snapshot byte-identical");

  const boardOwnedFilePath = join(root, "board-owned-nomenclature.json");
  const boardOwnedDirectory = directory();
  const boardOwnedRow = {
    ...boardOwnedDirectory.nomenclature[0],
    sourceBomResultId: "board-a",
    sourceBomIds: ["board-a"],
  };
  boardOwnedDirectory.nomenclature = [boardOwnedRow];
  boardOwnedDirectory.bomLists = [{
    id: "board-a",
    importRows: [{ id: "board-row-a", nomenclatureId: "nom-a" }],
  }];
  await writeFile(boardOwnedFilePath, `${JSON.stringify({
    ...snapshot(1),
    values: {
      ...snapshot(1).values,
      [DIRECTORY_KEY]: JSON.stringify(boardOwnedDirectory),
    },
  })}\n`, { mode: 0o600 });
  const boardOwnedBytes = await readFile(boardOwnedFilePath, "utf8");
  for (const [kind, idempotencyKey] of [["update", "qa-board-owned-update"], ["delete", "qa-board-owned-delete"]]) {
    const boardOwnedAttempt = await attemptNomenclatureOwnerWrite({
      filePath: boardOwnedFilePath,
      command: {
        kind,
        itemId: "nom-a",
        expectedRevision: 1,
        idempotencyKey,
        expectedRow: boardOwnedRow,
        row: kind === "update" ? { ...boardOwnedRow, name: "Запрещённое изменение Board/BOM строки" } : null,
      },
      actorId: `employee:${idempotencyKey}`,
      displayName: "QA Board Owner Boundary",
      now: kind === "update" ? "2026-07-21T00:00:27.000Z" : "2026-07-21T00:00:28.000Z",
    });
    assert(!boardOwnedAttempt.ok && boardOwnedAttempt.code === "directory-cluster-command-required",
      `an exact Nomenclature ${kind} receipt must not bypass Board/BOM ownership`);
    assert.equal(await readFile(boardOwnedFilePath, "utf8"), boardOwnedBytes,
      `a denied Board/BOM-owned Nomenclature ${kind} must leave the snapshot byte-identical`);
  }

  const forgedDirectoryActor = "employee:qa-directory-forger";
  const forgedDirectoryEmployee = "qa-directory-forger";
  const forgedDirectoryIdempotency = "qa-forged-directory-response";
  const forgedDirectoryKey = receiptKey(forgedDirectoryActor, forgedDirectoryIdempotency);
  const forgedDirectoryNow = "2026-07-21T00:00:30.000Z";
  const forgedDirectoryCommand = {
    kind: "update",
    itemId: "type-mech",
    expectedRow: { id: "type-mech", name: "Механика" },
    row: { name: "Механика обновлённая" },
  };
  const forgedDirectoryMutation = applyNomenclatureTypeCommand(directory(), forgedDirectoryCommand);
  assert(forgedDirectoryMutation.ok, "Directory receipt regression requires a valid deterministic reducer outcome");
  const forgedDirectoryReceipt = await updateDirectoryClusterCommandSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" },
    filePath,
    expectedVersion: 1,
    authorityProof: {
      actorId: forgedDirectoryActor,
      entityId: "type-mech",
      idempotencyKey: forgedDirectoryIdempotency,
      surface: "nomenclature-types",
      command: forgedDirectoryCommand,
      now: forgedDirectoryNow,
      expectedRevision: 1,
      displayName: "QA Directory Forger",
    },
    update: (current) => ({
      ...current,
      values: {
        ...current.values,
        [DIRECTORY_KEY]: JSON.stringify(forgedDirectoryMutation.directory),
        [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 1,
          entries: {
            [forgedDirectoryKey]: {
              surface: "nomenclature-types",
              requestFingerprint: directoryRequestFingerprint("nomenclature-types", 1, forgedDirectoryCommand),
              outcomeFingerprint: directoryFingerprint(forgedDirectoryMutation.directory),
              idempotencyKey: forgedDirectoryIdempotency,
              kind: "update",
              entityId: "type-mech",
              commandRevision: 2,
              baseRevision: 1,
              rebased: false,
              statusCode: 200,
              row: { id: "type-mech", name: "Поддельная строка ответа" },
              counts: forgedDirectoryMutation.counts,
              impact: forgedDirectoryMutation.impact,
              actorId: forgedDirectoryActor,
              employeeId: forgedDirectoryEmployee,
              destructiveAction: false,
              recoveryArtifact: null,
              createdAt: forgedDirectoryNow,
            },
          },
        }),
      },
    }),
  });
  assert(!forgedDirectoryReceipt.ok && forgedDirectoryReceipt.code === "shared-state-authority-receipt-invalid",
    "a Directory receipt row must be the exact reducer result for the persisted projection");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "a forged Directory response receipt must leave the snapshot byte-identical");

  const ownerScopeActor = "employee:qa-directory-owner-scope";
  const ownerScopeEmployee = "qa-directory-owner-scope";
  const ownerScopeIdempotency = "qa-directory-owner-scope";
  const ownerScopeKey = receiptKey(ownerScopeActor, ownerScopeIdempotency);
  const ownerScopeNow = "2026-07-21T00:00:31.000Z";
  const ownerScopeReceipt = {
    surface: "nomenclature-types",
    requestFingerprint: directoryRequestFingerprint("nomenclature-types", 1, forgedDirectoryCommand),
    outcomeFingerprint: directoryFingerprint(forgedDirectoryMutation.directory),
    idempotencyKey: ownerScopeIdempotency,
    kind: "update",
    entityId: "type-mech",
    commandRevision: 2,
    baseRevision: 1,
    rebased: false,
    statusCode: 200,
    row: forgedDirectoryMutation.row,
    counts: forgedDirectoryMutation.counts,
    impact: forgedDirectoryMutation.impact,
    actorId: ownerScopeActor,
    employeeId: ownerScopeEmployee,
    authorizationRevision: null,
    authorizationDecision: null,
    destructiveAction: false,
    recoveryArtifact: null,
    createdAt: ownerScopeNow,
  };
  const ownerScopeAttempt = await updateDirectoryClusterCommandSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" },
    filePath,
    expectedVersion: 1,
    authorityProof: {
      actorId: ownerScopeActor,
      entityId: "type-mech",
      idempotencyKey: ownerScopeIdempotency,
      surface: "nomenclature-types",
      command: forgedDirectoryCommand,
      now: ownerScopeNow,
      expectedRevision: 1,
      displayName: "QA Directory Owner Scope",
    },
    update: (current) => ({
      ...current,
      values: {
        ...current.values,
        [DIRECTORY_KEY]: JSON.stringify(forgedDirectoryMutation.directory),
        [PLANNING_KEY]: JSON.stringify({ routes: [{ id: "forged-planning-row" }], routeSteps: [], slots: [] }),
        [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 1,
          entries: { [ownerScopeKey]: ownerScopeReceipt },
        }),
      },
      sharedUi: { forgedOwnerScope: true },
      updatedBy: {
        actor: ownerScopeActor,
        employeeId: ownerScopeEmployee,
        displayName: "QA Directory Owner Scope",
      },
      events: [{
        action: "directory-cluster-command:nomenclature-types:update",
        actor: ownerScopeActor,
        employeeId: ownerScopeEmployee,
        entityId: "type-mech",
        authorizationRevision: null,
        authorizationDecision: null,
        createdAt: ownerScopeNow,
        version: 2,
      }, ...(current.events || [])].slice(0, 50),
    }),
  });
  assert(!ownerScopeAttempt.ok && ownerScopeAttempt.code === "shared-state-command-owner-delta-invalid",
    "an exact Directory reducer receipt must not authorize unrelated Planning or sharedUi changes");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "a Directory owner-scope violation must leave the snapshot byte-identical");

  const protectedTypeActor = "employee:qa-directory-protected-type";
  const protectedTypeEmployee = "qa-directory-protected-type";
  const protectedTypeIdempotency = "qa-directory-protected-type-rename";
  const protectedTypeKey = receiptKey(protectedTypeActor, protectedTypeIdempotency);
  const protectedTypeNow = "2026-07-21T00:00:31.500Z";
  const protectedTypeCommand = {
    kind: "update",
    itemId: "type-rea",
    expectedRow: { id: "type-rea", name: "РЭА компоненты" },
    row: { name: "Электронные компоненты" },
  };
  const protectedTypeMutation = applyNomenclatureTypeCommand(directory(), protectedTypeCommand);
  assert(protectedTypeMutation.ok, "protected Board/BOM type fixture requires a valid raw reducer outcome");
  const protectedTypeAttempt = await updateDirectoryClusterCommandSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" },
    filePath,
    expectedVersion: 1,
    authorityProof: {
      actorId: protectedTypeActor,
      entityId: "type-rea",
      idempotencyKey: protectedTypeIdempotency,
      surface: "nomenclature-types",
      command: protectedTypeCommand,
      now: protectedTypeNow,
      expectedRevision: 1,
      displayName: "QA Protected Type",
    },
    update: (current) => {
      const receipt = {
        surface: "nomenclature-types",
        requestFingerprint: directoryRequestFingerprint("nomenclature-types", 1, protectedTypeCommand),
        outcomeFingerprint: directoryFingerprint(protectedTypeMutation.directory),
        idempotencyKey: protectedTypeIdempotency,
        kind: "update",
        entityId: "type-rea",
        commandRevision: 2,
        baseRevision: 1,
        rebased: false,
        statusCode: 200,
        row: protectedTypeMutation.row,
        counts: protectedTypeMutation.counts,
        impact: protectedTypeMutation.impact,
        actorId: protectedTypeActor,
        employeeId: protectedTypeEmployee,
        authorizationRevision: null,
        authorizationDecision: null,
        destructiveAction: false,
        recoveryArtifact: null,
        createdAt: protectedTypeNow,
      };
      return {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify(protectedTypeMutation.directory),
          [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
            schemaVersion: 1,
            entries: { [protectedTypeKey]: receipt },
          }),
        },
        updatedBy: { actor: protectedTypeActor, employeeId: protectedTypeEmployee, displayName: "QA Protected Type" },
        events: [{
          action: "directory-cluster-command:nomenclature-types:update",
          actor: protectedTypeActor,
          employeeId: protectedTypeEmployee,
          entityId: "type-rea",
          authorizationRevision: null,
          authorizationDecision: null,
          createdAt: protectedTypeNow,
          version: 2,
        }, ...(current.events || [])].slice(0, 50),
      };
    },
  });
  assert(!protectedTypeAttempt.ok && protectedTypeAttempt.code === "shared-state-authority-receipt-invalid",
    "the explicit Directory owner port must repeat the Board/BOM required-type boundary");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "a direct-port protected type rename must leave the snapshot byte-identical");

  const deleteActor = "employee:qa-directory-delete-forger";
  const deleteEmployee = "qa-directory-delete-forger";
  const deleteIdempotency = "qa-directory-delete-metadata";
  const deleteKey = receiptKey(deleteActor, deleteIdempotency);
  const deleteNow = "2026-07-21T00:00:32.000Z";
  const deleteImpact = inspectNomenclatureTypeImpact(directory(), "type-rea");
  assert(deleteImpact.ok, "destructive receipt regression requires a deterministic type impact");
  const deleteCommand = {
    kind: "delete",
    itemId: "type-rea",
    expectedRow: directory().nomenclatureTypes.find((row) => row.id === "type-rea"),
    fallbackTypeId: "type-mech",
    fallbackExpectedRow: directory().nomenclatureTypes.find((row) => row.id === "type-mech"),
    impactFingerprint: deleteImpact.fingerprint,
  };
  const deleteMutation = applyNomenclatureTypeCommand(directory(), deleteCommand);
  assert(deleteMutation.ok, "destructive receipt regression requires a valid reducer outcome");
  const deleteReceiptAttempt = await updateDirectoryClusterCommandSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" },
    filePath,
    expectedVersion: 1,
    authorityProof: {
      actorId: deleteActor,
      entityId: "type-rea",
      idempotencyKey: deleteIdempotency,
      surface: "nomenclature-types",
      command: deleteCommand,
      now: deleteNow,
      expectedRevision: 1,
      displayName: "QA Directory Delete Forger",
    },
    update: (current) => ({
      ...current,
      values: {
        ...current.values,
        [DIRECTORY_KEY]: JSON.stringify(deleteMutation.directory),
        [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 1,
          entries: {
            [deleteKey]: {
              surface: "nomenclature-types",
              requestFingerprint: directoryRequestFingerprint("nomenclature-types", 1, deleteCommand),
              outcomeFingerprint: directoryFingerprint(deleteMutation.directory),
              idempotencyKey: deleteIdempotency,
              kind: "delete",
              entityId: "type-rea",
              commandRevision: 2,
              baseRevision: 1,
              rebased: false,
              statusCode: 200,
              row: deleteMutation.row,
              counts: deleteMutation.counts,
              impact: deleteMutation.impact,
              actorId: deleteActor,
              employeeId: deleteEmployee,
              authorizationRevision: null,
              authorizationDecision: null,
              destructiveAction: false,
              recoveryArtifact: null,
              createdAt: deleteNow,
            },
          },
        }),
      },
      updatedBy: { actor: deleteActor, employeeId: deleteEmployee, displayName: "QA Directory Delete Forger" },
      events: [{
        action: "directory-cluster-command:nomenclature-types:delete",
        actor: deleteActor,
        employeeId: deleteEmployee,
        entityId: "type-rea",
        authorizationRevision: null,
        authorizationDecision: null,
        createdAt: deleteNow,
        version: 2,
      }, ...(current.events || [])].slice(0, 50),
    }),
  });
  assert(!deleteReceiptAttempt.ok && deleteReceiptAttempt.code === "shared-state-authority-receipt-invalid",
    "a delete receipt cannot claim a non-destructive operation or omit its recovery artifact");
  assert.equal(await readFile(filePath, "utf8"), originalBytes,
    "forged destructive metadata must leave the snapshot byte-identical");

  const forgedReceipts = await updateSharedStateSnapshot({
    filePath,
    expectedVersion: 1,
    update: (current) => ({
      ...current,
      values: {
        ...current.values,
        [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: { forged: true } }),
      },
    }),
  });
  assert(!forgedReceipts.ok && forgedReceipts.code === "directory-cluster-command-receipts-protected",
    "generic internal writers must not forge command receipts even with rollout flags off");
  assert.equal(await readFile(filePath, "utf8"), originalBytes);

  const forgedNomenclatureReceipts = await updateSharedStateSnapshot({
    filePath,
    expectedVersion: 1,
    update: (current) => ({
      ...current,
      values: {
        ...current.values,
        [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, entries: { forged: true } }),
      },
    }),
  });
  assert(!forgedNomenclatureReceipts.ok && forgedNomenclatureReceipts.code === "nomenclature-command-receipts-protected");

  const forgedPublicationAuthority = await updateSharedStateSnapshot({
    filePath,
    expectedVersion: 1,
    update: (current) => ({
      ...current,
      specifications2PublicationAuthority: { publications: { forged: { revision: 99 } } },
    }),
  });
  assert(!forgedPublicationAuthority.ok
    && forgedPublicationAuthority.code === "specifications2-publication-authority-protected");

  const unrelatedSharedUi = await updateSharedStateSnapshot({
    env: protectedEnv,
    filePath,
    expectedVersion: 1,
    update: (current) => ({ ...current, sharedUi: { shiftFact: { preserved: true } } }),
  });
  assert(unrelatedSharedUi.ok && unrelatedSharedUi.snapshot.version === 2,
    "unrelated internal sharedUi writers must continue through the generic bridge");

  const rollbackWrite = await updateSharedStateSnapshot({
    env: { APP_ENV: "local" },
    filePath,
    expectedVersion: 2,
    update: (current) => {
      const nextDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
      nextDirectory.nomenclatureTypes[0].name = "Legacy rollback edit";
      return { ...current, values: { ...current.values, [DIRECTORY_KEY]: JSON.stringify(nextDirectory) } };
    },
  });
  assert(rollbackWrite.ok && rollbackWrite.snapshot.version === 3,
    "flags-off legacy rollback must retain its generic Directory write path");

  const largeFingerprint = `qa-large-${"x".repeat(25_000)}`;
  await writeFile(filePath, `${JSON.stringify({
    ...snapshot(4),
    specifications2PublicationAuthority: {
      publications: {
        "large-entry": {
          revision: 1,
          fingerprint: largeFingerprint,
          specificationId: "large-spec",
          rootRouteId: "large-route",
        },
      },
    },
  })}\n`, { mode: 0o600 });
  const coldRead = await readSharedStateSnapshot({ filePath });
  assert.equal(coldRead.snapshot.specifications2PublicationAuthority.publications["large-entry"].fingerprint, largeFingerprint,
    "accepted immutable publication fingerprints must survive a cold shared-state read without truncation");

  const publication = {
    revision: 1,
    fingerprint: "qa-release-fingerprint",
    specificationId: "spec-published",
    rootRouteId: "route-published",
    releasedAt: "2026-07-21T00:00:00.000Z",
  };
  const publishedDirectory = {
    ...directory(),
    nomenclature: directory().nomenclature.map((row) => row.id === "nom-a"
      ? { ...row, sourceSpecifications2EntryId: "spec2-entry" }
      : row),
    specifications: [{
      id: publication.specificationId,
      sourceSpecifications2EntryId: "spec2-entry",
      sourceSpecifications2Fingerprint: publication.fingerprint,
      revision: publication.revision,
      structureItems: [],
    }],
  };
  const publishedPlanning = {
    routes: [{
      id: publication.rootRouteId,
      rootRouteId: publication.rootRouteId,
      sourceSpecifications2EntryId: "spec2-entry",
      name: "Immutable published route",
      revision: publication.revision,
      documentRevisionSnapshot: {
        specificationRevision: publication.revision,
        releaseFingerprint: publication.fingerprint,
      },
    }],
    routeSteps: [{ id: "step-published", routeId: publication.rootRouteId }],
    slots: [],
  };
  await writeFile(filePath, `${JSON.stringify({
    ...snapshot(10),
    values: {
      ...snapshot(10).values,
      [DIRECTORY_KEY]: JSON.stringify(publishedDirectory),
      [PLANNING_KEY]: JSON.stringify(publishedPlanning),
      [SPECIFICATIONS2_KEY]: JSON.stringify({
        selectedId: "spec2-entry",
        registry: [{ id: "spec2-entry", publication }],
      }),
    },
    specifications2PublicationAuthority: { publications: { "spec2-entry": publication } },
  })}\n`, { mode: 0o600 });
  const publishedBytes = await readFile(filePath, "utf8");
  const duplicateRegistryWrite = await updateSharedStateSnapshot({
    filePath,
    expectedVersion: 10,
    update: (current) => {
      const registry = JSON.parse(current.values[SPECIFICATIONS2_KEY]);
      return {
        ...current,
        values: {
          ...current.values,
          [SPECIFICATIONS2_KEY]: JSON.stringify({
            ...registry,
            registry: [...registry.registry, { ...registry.registry[0], title: "Duplicate authoritative id" }],
          }),
        },
      };
    },
  });
  assert(!duplicateRegistryWrite.ok && duplicateRegistryWrite.code === "specifications2-publication-authority-conflict",
    "an authoritative Specifications 2.0 registry must reject duplicate non-empty entry ids");
  assert.equal(await readFile(filePath, "utf8"), publishedBytes,
    "duplicate Specifications 2.0 ids must leave bytes and revision unchanged");
  const ownerActorId = "employee:spec-cross-owner";
  const ownerIdempotencyKey = "qa-spec-cross-owner";
  const protectedNomenclatureRow = publishedDirectory.nomenclature.find((row) => row.id === "nom-a");
  const protectedOwnerWrite = await attemptNomenclatureOwnerWrite({
    filePath,
    actorId: ownerActorId,
    displayName: "Specifications Cross Owner",
    now: "2026-07-21T00:01:00.000Z",
    command: {
      kind: "update",
      itemId: "nom-a",
      expectedRevision: 10,
      idempotencyKey: ownerIdempotencyKey,
      expectedRow: protectedNomenclatureRow,
      row: { ...protectedNomenclatureRow, name: "Попытка изменить опубликованную строку" },
    },
  });
  assert(!protectedOwnerWrite.ok && protectedOwnerWrite.code === "specifications2-publication-command-required",
    "a valid Nomenclature receipt must not bypass immutable Specifications 2.0 ownership");
  assert.equal(await readFile(filePath, "utf8"), publishedBytes,
    "cross-owner denial must preserve exact bytes and revision");
  const derivedWorkOrderWrite = await updateSharedStateSnapshot({
    filePath,
    expectedVersion: 10,
    update: (current) => {
      const planning = JSON.parse(current.values[PLANNING_KEY]);
      return {
        ...current,
        values: {
          ...current.values,
          [PLANNING_KEY]: JSON.stringify({
            ...planning,
            routes: [...planning.routes, {
              id: "work-order-1",
              rootRouteId: "work-order-1",
              sourceSpecifications2EntryId: "spec2-entry",
              name: "Derived work order",
              workOrderSnapshot: { id: "work-order-1", source: "specifications2" },
            }],
            routeSteps: [...planning.routeSteps, { id: "step-work-order", routeId: "work-order-1" }],
          }),
        },
      };
    },
  });
  const derivedPlanning = JSON.parse(derivedWorkOrderWrite.snapshot.values[PLANNING_KEY]);
  assert(derivedWorkOrderWrite.ok
    && derivedPlanning.routes.some((route) => route.id === "work-order-1")
    && derivedPlanning.routeSteps.some((step) => step.routeId === "work-order-1"),
  "a server-derived work order may share the Specifications 2.0 source entry without becoming the immutable publication route");
  assert(derivedPlanning.routes.find((route) => route.id === publication.rootRouteId)?.name === "Immutable published route",
    "the exact published root route must remain immutable while derived work orders are projected");

  const collisionAttempt = await updateSharedStateSnapshot({
    filePath,
    expectedVersion: 11,
    update: (current) => {
      const nextDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
      nextDirectory.nomenclature = nextDirectory.nomenclature.map((row) => {
        if (row.id !== "nom-a") return row;
        const forged = { ...row, name: "FORGED identity", sourceSpecifications2EntryId: "" };
        return forged;
      });
      const planning = JSON.parse(current.values[PLANNING_KEY]);
      planning.routes = planning.routes.map((route) => route.id === publication.rootRouteId
        ? { ...route, planningStatus: "scheduled", workOrderSnapshot: { id: "wo-root", source: "specifications2" } }
        : route);
      planning.routeSteps = planning.routeSteps.map((step) => step.id === "step-published"
        ? { ...step, routeId: "forged-route" }
        : step);
      return {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify(nextDirectory),
          [PLANNING_KEY]: JSON.stringify(planning),
        },
      };
    },
  });
  const collisionDirectory = JSON.parse(collisionAttempt.snapshot.values[DIRECTORY_KEY]);
  const collisionPlanning = JSON.parse(collisionAttempt.snapshot.values[PLANNING_KEY]);
  assert(collisionAttempt.ok
    && collisionDirectory.nomenclature.filter((row) => row.id === "nom-a").length === 1
    && collisionDirectory.nomenclature.find((row) => row.id === "nom-a")?.name === "Корпус"
    && collisionDirectory.nomenclature.find((row) => row.id === "nom-a")?.sourceSpecifications2EntryId === "spec2-entry",
  "legacy reconciliation must restore a protected ID in place without persisting a forged duplicate");
  assert(collisionPlanning.routeSteps.filter((step) => step.id === "step-published").length === 1
    && collisionPlanning.routeSteps.find((step) => step.id === "step-published")?.routeId === publication.rootRouteId,
  "legacy reconciliation must restore a protected route step by exact ID without duplication");
  assert(collisionPlanning.routes.find((route) => route.id === publication.rootRouteId)?.planningStatus === "scheduled"
    && collisionPlanning.routes.find((route) => route.id === publication.rootRouteId)?.workOrderSnapshot?.id === "wo-root",
  "operational Planning fields must remain writable without weakening immutable publication fields");

  const directoryOwnerActor = "employee:directory-cross-owner";
  const directoryOwnerEmployee = "directory-cross-owner";
  const directoryOwnerIdempotency = "qa-directory-spec-cross-owner";
  const directoryOwnerKey = receiptKey(directoryOwnerActor, directoryOwnerIdempotency);
  const directoryOwnerNow = "2026-07-21T00:02:00.000Z";
  const directoryOwnerDisplayName = "Directory Cross Owner";
  const directoryOwnerCommand = {
    kind: "update",
    itemId: "type-mech",
    expectedRow: { id: "type-mech", name: "Механика" },
    row: { name: "Механика новая" },
  };
  const beforeDirectoryCrossOwner = await readFile(filePath, "utf8");
  const directoryCrossOwner = await updateDirectoryClusterCommandSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS: "1" },
    filePath,
    expectedVersion: 12,
    authorityProof: {
      actorId: directoryOwnerActor,
      entityId: "type-mech",
      idempotencyKey: directoryOwnerIdempotency,
      surface: "nomenclature-types",
      command: directoryOwnerCommand,
      now: directoryOwnerNow,
      expectedRevision: 12,
      displayName: directoryOwnerDisplayName,
    },
    update: (current) => {
      const currentDirectory = JSON.parse(current.values[DIRECTORY_KEY]);
      const mutation = applyNomenclatureTypeCommand(currentDirectory, directoryOwnerCommand);
      assert(mutation.ok, "cross-owner fixture requires a valid Directory reducer result");
      const nextDirectory = mutation.directory;
      const receipt = {
        surface: "nomenclature-types",
        requestFingerprint: directoryRequestFingerprint("nomenclature-types", 12, directoryOwnerCommand),
        outcomeFingerprint: directoryFingerprint(nextDirectory),
        idempotencyKey: directoryOwnerIdempotency,
        kind: "update",
        entityId: "type-mech",
        commandRevision: 13,
        baseRevision: 12,
        rebased: false,
        statusCode: 200,
        row: mutation.row,
        counts: mutation.counts,
        impact: mutation.impact,
        actorId: directoryOwnerActor,
        employeeId: directoryOwnerEmployee,
        authorizationRevision: null,
        authorizationDecision: null,
        destructiveAction: false,
        recoveryArtifact: null,
        createdAt: directoryOwnerNow,
      };
      return {
        ...current,
        values: {
          ...current.values,
          [DIRECTORY_KEY]: JSON.stringify(nextDirectory),
          [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY]: JSON.stringify({
            schemaVersion: 1,
            entries: { [directoryOwnerKey]: receipt },
          }),
        },
        updatedBy: {
          actor: directoryOwnerActor,
          employeeId: directoryOwnerEmployee,
          displayName: directoryOwnerDisplayName,
        },
        events: [{
          action: "directory-cluster-command:nomenclature-types:update",
          actor: directoryOwnerActor,
          employeeId: directoryOwnerEmployee,
          entityId: "type-mech",
          authorizationRevision: null,
          authorizationDecision: null,
          createdAt: directoryOwnerNow,
          version: 13,
        }, ...(current.events || [])].slice(0, 50),
      };
    },
  });
  assert(!directoryCrossOwner.ok && directoryCrossOwner.code === "specifications2-publication-command-required",
    "a valid Directory receipt must not rename a type used by an immutable Specifications 2.0 projection");
  assert.equal(await readFile(filePath, "utf8"), beforeDirectoryCrossOwner,
    "Directory cross-owner denial must preserve exact bytes and revision");

  const workOrderAuthorityFile = join(root, "work-order-start-date-authority.json");
  const workOrderRoute = {
    id: "work-order-clear",
    rootRouteId: "work-order-clear",
    sourceSpecifications2EntryId: "spec-clear",
    planningStartDate: "2026-07-21",
    domainConcurrencyRevision: 1,
    updatedAt: "2026-07-21T00:00:00.000Z",
    workOrderSnapshot: { id: "work-order-clear", source: "specifications2" },
  };
  const workOrderSlot = {
    id: "slot-clear",
    routeId: "work-order-clear",
    routeStepId: "step-clear",
    plannedStart: "2026-07-21T08:00:00.000Z",
    plannedEnd: "2026-07-21T09:00:00.000Z",
    quantity: 10,
  };
  await writeFile(workOrderAuthorityFile, `${JSON.stringify({
    version: 1,
    updatedAt: "2026-07-21T00:00:00.000Z",
    values: {
      [PLANNING_KEY]: JSON.stringify({
        routes: [workOrderRoute],
        routeSteps: [{ id: "step-clear", routeId: "work-order-clear" }],
        slots: [workOrderSlot],
      }),
    },
    sharedUi: {},
    events: [],
  })}\n`, "utf8");
  const updateStartDateAuthority = async ({ expectedRevision, targetRevision, planningStartDate, omitPlanningStartDate = false }) => {
    const authorityProof = {
      kind: "start-date",
      workOrderId: "work-order-clear",
      routeId: "work-order-clear",
      expectedRevision,
      targetRevision,
      planningStartDate,
      stamp: `2026-07-21T00:0${targetRevision}:00.000Z`,
    };
    if (omitPlanningStartDate) delete authorityProof.planningStartDate;
    return updateSpecifications2WorkOrderSharedStateSnapshot({
    env: { APP_ENV: "local", MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" },
    filePath: workOrderAuthorityFile,
    expectedVersion: expectedRevision,
    authorityProof,
    update: (current) => {
      const planning = JSON.parse(current.values[PLANNING_KEY]);
      const routes = planning.routes.map((route) => {
        if (route.id !== "work-order-clear") return route;
        const next = {
          ...route,
          domainConcurrencyRevision: targetRevision,
          updatedAt: `2026-07-21T00:0${targetRevision}:00.000Z`,
        };
        if (planningStartDate === null) delete next.planningStartDate;
        else next.planningStartDate = planningStartDate;
        return next;
      });
      return { ...current, values: { ...current.values, [PLANNING_KEY]: JSON.stringify({ ...planning, routes }) } };
    },
  });
  };
  const authoritySet = await updateStartDateAuthority({ expectedRevision: 1, targetRevision: 2, planningStartDate: "2026-07-22" });
  assert(authoritySet.ok, "work-order authority must accept an exact set transition");
  const authorityClear = await updateStartDateAuthority({ expectedRevision: 2, targetRevision: 3, planningStartDate: null });
  assert(authorityClear.ok, "work-order authority must accept an explicit nullable clear transition");
  const authorityClearPlanning = JSON.parse(authorityClear.snapshot.values[PLANNING_KEY]);
  assert(!Object.prototype.hasOwnProperty.call(authorityClearPlanning.routes[0], "planningStartDate"),
    "authority clear must require the compatibility route field to be removed");
  assert.deepEqual(authorityClearPlanning.routeSteps, [{ id: "step-clear", routeId: "work-order-clear" }]);
  assert.deepEqual(authorityClearPlanning.slots, [workOrderSlot],
    "authority clear must prove physical slots are byte-equivalent at the domain boundary");
  for (const invalidProof of [
    { missing: true },
    { planningStartDate: "" },
    { planningStartDate: 20260722 },
  ]) {
    const beforeInvalidProof = await readFile(workOrderAuthorityFile, "utf8");
    const planningStartDate = invalidProof.missing ? undefined : invalidProof.planningStartDate;
    const invalidResult = await updateStartDateAuthority({
      expectedRevision: 3,
      targetRevision: 4,
      planningStartDate,
      omitPlanningStartDate: invalidProof.missing,
    });
    assert(!invalidResult.ok && invalidResult.code === "specifications2-work-order-authority-invalid",
      "missing, empty and non-string authority values must not be interpreted as clear");
    assert.equal(await readFile(workOrderAuthorityFile, "utf8"), beforeInvalidProof,
      "invalid nullable authority proof must preserve exact snapshot bytes");
  }

  const [endpointSource, nomenclatureOwnerSource, directoryOwnerSource, specificationsOwnerSource, legacyCliSource] = await Promise.all([
    readFile(new URL("./shared-state-endpoint.mjs", import.meta.url), "utf8"),
    readFile(new URL("./domain-nomenclature-command.mjs", import.meta.url), "utf8"),
    readFile(new URL("./domain-directory-cluster-command.mjs", import.meta.url), "utf8"),
    readFile(new URL("./domain-specifications2-snapshot-repository.mjs", import.meta.url), "utf8"),
    readFile(new URL("./specifications2-publish-revision.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(endpointSource, /validateSharedStateAuthorityTransition\(current, snapshot, env, authority\)/,
    "every internal CAS write must pass the common authority transition before observation or persistence");
  assert.match(nomenclatureOwnerSource, /updateNomenclatureCommandSharedStateSnapshot/);
  assert.doesNotMatch(nomenclatureOwnerSource, /\bupdateSharedStateSnapshot\b/);
  assert.match(directoryOwnerSource, /updateDirectoryClusterCommandSharedStateSnapshot/);
  assert.doesNotMatch(directoryOwnerSource, /\bupdateSharedStateSnapshot\b/);
  assert.match(specificationsOwnerSource, /updateSpecifications2PublicationSharedStateSnapshot/);
  assert.doesNotMatch(specificationsOwnerSource, /\bupdateSharedStateSnapshot\b/);
  assert.doesNotMatch(legacyCliSource, /updateSharedStateSnapshot|backupSharedStateFile/,
    "retired Specifications 2.0 CLI apply must not retain a raw persistence route");
  assert.match(legacyCliSource, /--apply is retired/);

  console.log("Shared-state authority bridge QA: OK");
  console.log("- generic internal Directory/receipt/publication bypasses fail closed: pass");
  console.log("- unrelated writers and flags-off legacy rollback remain available: pass");
  console.log("- Nomenclature, Directory and Specifications2 use explicit owner ports: pass");
} finally {
  await rm(root, { recursive: true, force: true });
}
