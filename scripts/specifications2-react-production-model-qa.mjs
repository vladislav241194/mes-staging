import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  createSpecifications2ProductionOwner,
  SPECIFICATIONS2_PRODUCTION_DEFERRED_COMMANDS,
} from "../src/modules/specifications2/production_owner.js";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-specifications2-production-model-"));
try {
  const output = join(temporaryRoot, "adapter.mjs");
  const adapterPath = new URL("../experiments/react-migration/src/modules/specifications2/adapter.ts", import.meta.url);
  const modelPath = new URL("../experiments/react-migration/src/modules/specifications2/production-model.ts", import.meta.url);
  const ownerPath = new URL("../src/modules/specifications2/production_owner.js", import.meta.url);
  await build({ entryPoints: [adapterPath.pathname], outfile: output, bundle: true, platform: "node", format: "esm", target: "node20" });
  const { adaptSpecifications2Payload } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

  const entry = {
    id: "spec-controller",
    title: "АБВГ.469659.001 Контроллер КТ-7",
    fileName: "Контроллер КТ-7.xlsx",
    importedAt: "2026-07-22T06:00:00.000Z",
    editedAt: "2026-07-22T06:10:00.000Z",
    stats: { rows: 3 },
    errors: [],
    editorRows: [
      { id: "root", parentId: "", order: 0, label: "Контроллер КТ-7", designation: "АБВГ.469659.001", type: "Изделие", quantity: "1", unitOfMeasure: "шт." },
      { id: "board", parentId: "root", order: 0, label: "Плата управления", designation: "АБВГ.468332.002", type: "Сборочная единица", quantity: "1", unitOfMeasure: "шт." },
      { id: "resistor", parentId: "board", order: 0, label: "Резистор 10 кОм", designation: "RC0603-10K", type: "Покупное", quantity: "8", unitOfMeasure: "шт." },
    ],
    publication: { revision: 7, fingerprint: "fingerprint-v6", releasedAt: "2026-07-22T07:00:00.000Z" },
  };
  const secondEntry = { id: "spec-sensor", title: "Датчик", importedAt: "2026-07-21T06:00:00.000Z", treeRows: [], errors: [] };
  const revision = {
    id: "revision-controller-7",
    sourceEntryId: entry.id,
    specificationId: "document-controller",
    title: "Контроллер КТ-7",
    designation: "АБВГ.469659.001",
    revisionNo: 7,
    fingerprint: `sha256:${"a".repeat(64)}`,
    releasedAt: "2026-07-22T07:00:00.000Z",
    sourceUpdatedAt: "2026-07-22T06:10:00.000Z",
    treeItems: [
      { sourceRowId: "root", parentSourceRowId: "", designation: "АБВГ.469659.001", name: "Контроллер КТ-7", kind: "Изделие", quantity: 1, unit: "шт." },
      { sourceRowId: "board", parentSourceRowId: "root", designation: "АБВГ.468332.002", name: "Плата управления", kind: "Сборочная единица", quantity: 1, unit: "шт." },
      { sourceRowId: "resistor", parentSourceRowId: "board", designation: "RC0603-10K", name: "Резистор 10 кОм", kind: "Покупное", quantity: 8, unit: "шт." },
    ],
    routes: [{ sourceDraftId: "route-controller", designation: "АБВГ.469659.001", productLabel: "Контроллер КТ-7", status: "released", operations: [{ sourceOperationId: "op-assembly" }, { sourceOperationId: "op-control" }] }],
  };

  let store = { selectedId: entry.id, registry: [entry, secondEntry] };
  const writes = [];
  const workOrderRequests = [];
  const owner = createSpecifications2ProductionOwner({
    getStore: () => store,
    writeStore: (next) => { store = next; writes.push(next); return true; },
    getPublishedRevisionState: (entryId) => entryId === entry.id ? { item: revision, loading: null, error: "" } : { item: null, loading: null, error: "" },
    getCurrentFingerprint: (current) => current.id === entry.id ? "fingerprint-v6" : "",
    getWorkOrderCapability: () => ({ enabled: true, primaryPostgres: true }),
    createIdempotencyKey: () => "specifications2-work-order:qa",
    createWorkOrder: async (request) => { workOrderRequests.push(request); return { ok: true, created: true, item: { id: "work-order-1" } }; },
  });

  const payload = owner.getPayload();
  const model = adaptSpecifications2Payload(payload);
  assert.equal(model.serverStatus, "ready");
  assert.equal(model.registry.length, 2);
  assert.equal(model.registry[0]?.selected, true);
  assert.equal(model.selectedEntry?.id, entry.id);
  assert.equal(model.selectedEntry?.publicationState, "released");
  assert.equal(model.selectedEntry?.serverRevision?.id, revision.id);
  assert.deepEqual(model.selectedEntry?.serverRevision?.treeItems.map((row) => [row.id, row.parentId, row.depth]), [
    ["root", "", 0],
    ["board", "root", 1],
    ["resistor", "board", 2],
  ]);
  assert.equal(model.selectedEntry?.serverRevision?.operationCount, 2);
  assert.equal(model.canCreateWorkOrder, true);
  assert.equal(model.canEditDraft, false);
  assert.equal(model.canPublish, false);
  assert.equal(model.readModelCoverage?.contract, "postgres-specifications2-read-v1");
  assert(model.readModelCoverage?.deferred.some((item) => item.includes("reparent")));
  assert(model.readModelCoverage?.deferred.some((item) => item.includes("attachment")));

  const workOrderResult = await owner.execute({ type: "create-work-order", payload: { entryId: entry.id, revisionId: revision.id, confirmRevisionId: revision.id, routeSourceDraftId: "route-controller", quantity: 25 } });
  assert.deepEqual(workOrderResult, { ok: true, id: "work-order-1", created: true });
  assert.deepEqual(workOrderRequests, [{ entryId: entry.id, revisionId: revision.id, routeSourceDraftId: "route-controller", quantity: 25, idempotencyKey: "specifications2-work-order:qa" }]);
  let staleWorkOrderCalls = 0;
  const staleOwner = createSpecifications2ProductionOwner({
    getStore: () => ({ selectedId: entry.id, registry: [entry] }),
    getPublishedRevisionState: () => ({ item: { ...revision, revisionNo: 8 } }),
    getWorkOrderCapability: () => ({ enabled: true, primaryPostgres: true }),
    createWorkOrder: async () => { staleWorkOrderCalls += 1; throw new Error("stale revision reached server command"); },
  });
  assert.equal((await staleOwner.execute({ type: "create-work-order", payload: { entryId: entry.id, revisionId: revision.id, confirmRevisionId: revision.id, routeSourceDraftId: "route-controller", quantity: 1 } })).ok, false);
  assert.equal(staleWorkOrderCalls, 0, "a stale PostgreSQL revision must fail before the server command");
  assert.equal((await owner.execute({ type: "save-draft-row", payload: {} })).deferred, true);
  assert(SPECIFICATIONS2_PRODUCTION_DEFERRED_COMMANDS.includes("edit-route"));

  assert.deepEqual(owner.selectEntry(secondEntry.id), { ok: true, id: secondEntry.id, changed: true });
  assert.equal(store.selectedId, secondEntry.id);
  assert.equal(writes.length, 1);
  assert.equal(owner.selectEntry("missing").ok, false);

  const changed = adaptSpecifications2Payload({
    productionModel: {
      specifications2Store: { selectedId: entry.id, registry: [entry] },
      publishedRevisionState: { item: revision },
      currentFingerprintByEntryId: { [entry.id]: "fingerprint-v6-changed" },
      workOrderCapability: { enabled: false, primaryPostgres: true },
    },
    capabilities: { draftEdit: false, publication: false, workOrder: false },
  });
  assert.equal(changed.selectedEntry?.publicationState, "changed");
  assert.equal(changed.serverStatus, "ready", "a changed draft must not invalidate the immutable published server revision");
  assert.equal(changed.canCreateWorkOrder, false);

  const mismatch = adaptSpecifications2Payload({
    productionModel: {
      specifications2Store: { selectedId: entry.id, registry: [entry] },
      publishedRevisionState: { item: { ...revision, revisionNo: 8 } },
      currentFingerprintByEntryId: { [entry.id]: "fingerprint-v6" },
    },
  });
  assert.equal(mismatch.serverStatus, "mismatch");

  const legacy = adaptSpecifications2Payload({
    model: {
      registry: [{ id: "legacy", title: "Legacy fixture", selected: true }],
      selectedEntry: { id: "legacy", title: "Legacy fixture", draftRows: [], serverRevision: null },
      serverStatus: "unpublished",
      serverError: "",
    },
    capabilities: { draftEdit: false, publication: false, workOrder: false },
  });
  assert.equal(legacy.selectedEntry?.id, "legacy", "existing {model} fixtures must remain compatible");
  assert.equal(legacy.readModelCoverage, null);

  const [adapterSource, productionSource, ownerSource] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(modelPath, "utf8"),
    readFile(ownerPath, "utf8"),
  ]);
  assert.doesNotMatch(
    `${adapterSource}\n${productionSource}\n${ownerSource}`,
    /getSpecifications2ReactModel\s*\(|from\s+["'][^"']*specifications2\/render|import\s*\(["'][^"']*specifications2\/render/,
    "production read/command foundation must not import or call the legacy renderer",
  );

  console.log("Specifications 2.0 React production foundation QA: OK");
  console.log("- raw registry + immutable PostgreSQL revision + typed tree/routes: pass");
  console.log("- selection + PostgreSQL work-order owner: pass");
  console.log("- draft structure/publication/routes/attachments are explicit deferred prototype scope");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
