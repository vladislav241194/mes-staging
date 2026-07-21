import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  DIRECTORY_CLUSTER_SPECIFICATION_REDUCER_CONTRACT,
  applySpecificationCommand,
  fingerprintSpecificationPlanningProjection,
  inspectSpecificationDeleteImpact,
  inspectSpecificationOutputBinding,
  normalizeSpecificationName,
} from "./directory-cluster-specification-reducer.mjs";

const NOW = "2026-07-21T06:07:08.000Z";
const clone = (value) => structuredClone(value);

function deepMarker(depth = 24) {
  const root = { marker: "legacy-hidden" };
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    cursor.child = { index, preserve: true };
    cursor = cursor.child;
  }
  return root;
}

function fixtureDirectory() {
  return {
    topLevelHidden: { owner: "legacy", deep: deepMarker() },
    nomenclatureTypes: [
      { id: "type-components", name: "РЭА компоненты", hidden: { order: 1 } },
      { id: "type-pcb", name: "Печатные платы", hidden: { order: 2 } },
      { id: "type-products", name: "Производимые изделия", hidden: { order: 3 } },
    ],
    nomenclature: [
      {
        id: "nom-output-a",
        name: "Изделие A",
        type: "Производимые изделия",
        unit: "шт.",
        producedBySpecificationId: "spec-a",
        hidden: { outputRevision: 7 },
      },
      {
        id: "nom-output-b",
        name: "Изделие B",
        type: "Производимые изделия",
        unit: "шт.",
        hidden: { outputRevision: 8 },
      },
      {
        id: "nom-board-a",
        name: "Печатная плата A",
        type: "Печатные платы",
        sourceBomResultId: "board-a",
        sourceBomIds: ["board-a"],
        unit: "шт.",
        hidden: { boardResult: true },
      },
      {
        id: "nom-component-a",
        name: "Резистор 10 кОм",
        type: "РЭА компоненты",
        unit: "шт.",
        sourceBomIds: ["board-a", "board-b"],
        hidden: { catalogRevision: 11 },
      },
    ],
    bomLists: [
      {
        id: "board-a",
        name: "Плата A",
        boardCode: "A-01",
        resultItem: "Печатная плата A",
        importRows: [{ nomenclatureId: "nom-component-a", values: [1, "Резистор"] }],
        hidden: { boardRevision: 4 },
      },
      {
        id: "board-b",
        name: "Плата B",
        boardCode: "B-02",
        resultItem: "Печатная плата B",
        importRows: [],
        hidden: { boardRevision: 5 },
      },
    ],
    operationMap: [
      { id: "op-existing", name: "Монтаж", workCenterId: "wc-smt", hidden: { operationRevision: 12 } },
    ],
    specifications: [
      {
        id: "spec-a",
        name: "Изделие A",
        projectId: "legacy-project-a",
        outputNomenclatureId: "nom-output-a",
        outputItem: "Изделие A",
        revision: "01",
        lifecycleStatus: "draft",
        structureManaged: true,
        structureItems: [
          {
            id: "row-board-a",
            parentId: "root",
            type: "bom",
            bomListId: "board-a",
            specificationId: "",
            nomenclatureId: "",
            nomenclatureType: "Печатные платы",
            name: "Плата A",
            quantity: 2,
            unit: "плата",
            boardsPerPanel: 1,
            fulfillmentMode: "produce",
            executionType: "make",
            operationId: "",
            position: 1,
            hidden: { structureRevision: 1 },
          },
          {
            id: "row-board-b",
            parentId: "root",
            type: "bom",
            bomListId: "board-b",
            specificationId: "",
            nomenclatureId: "",
            nomenclatureType: "Печатные платы",
            name: "Плата B",
            quantity: 3,
            unit: "плата",
            boardsPerPanel: 1,
            fulfillmentMode: "produce",
            executionType: "make",
            operationId: "",
            position: 2,
            hidden: { structureRevision: 2 },
          },
          {
            id: "row-component",
            parentId: "row-board-a",
            type: "nomenclature",
            bomListId: "",
            specificationId: "",
            nomenclatureId: "nom-component-a",
            nomenclatureType: "РЭА компоненты",
            name: "Резистор 10 кОм",
            quantity: 4,
            unit: "шт.",
            boardsPerPanel: 1,
            fulfillmentMode: "produce",
            executionType: "make",
            operationId: "op-existing",
            operationName: "Монтаж",
            position: 3,
            hidden: { structureRevision: 3 },
          },
        ],
        bomListA: "board-a",
        bomQtyA: 2,
        bomListB: "board-b",
        bomQtyB: 3,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        hidden: { specificationRevision: 17, deep: deepMarker(12) },
      },
      {
        id: "spec-b",
        name: "Изделие B",
        projectId: "",
        outputNomenclatureId: "",
        structureManaged: true,
        structureItems: [],
        bomListA: "",
        bomQtyA: 0,
        bomListB: "",
        bomQtyB: 0,
        hidden: { specificationRevision: 18 },
      },
      {
        id: "spec-holder",
        name: "Комплект",
        projectId: "",
        outputNomenclatureId: "",
        structureManaged: true,
        structureItems: [
          {
            id: "row-nested-a",
            parentId: "root",
            type: "specification",
            specificationId: "spec-a",
            bomListId: "",
            nomenclatureId: "",
            nomenclatureType: "Производимые изделия",
            name: "Изделие A",
            quantity: 1,
            position: 1,
            hidden: { nestedRevision: 2 },
          },
          {
            id: "row-nested-child",
            parentId: "row-nested-a",
            type: "part",
            specificationId: "",
            bomListId: "",
            nomenclatureId: "",
            nomenclatureType: "РЭА компоненты",
            name: "Сопроводительная позиция",
            quantity: 1,
            position: 2,
            hidden: { childRevision: 3 },
          },
        ],
        bomListA: "",
        bomQtyA: 0,
        bomListB: "",
        bomQtyB: 0,
        hidden: { specificationRevision: 19 },
      },
    ],
    statuses: [{ id: "status-hidden", marker: "untouched" }],
  };
}

function fixturePlanning() {
  return {
    hidden: { planningOwner: "legacy", deep: deepMarker(10) },
    routes: [
      {
        id: "route-a",
        specificationId: "spec-a",
        specificationName: "Старое имя A",
        projectId: "spec-a",
        bomListId: "board-a",
        hidden: { routeRevision: 7 },
      },
      { id: "route-board", specificationId: "", projectId: "", bomListId: "board-b", hidden: { routeRevision: 8 } },
    ],
    routeSteps: [
      { id: "step-a", routeId: "route-a", operationId: "op-existing", hidden: { stepRevision: 3 } },
      { id: "step-board", routeId: "route-board", hidden: { stepRevision: 4 } },
    ],
    slots: [
      { id: "slot-a", routeId: "route-a", routeStepId: "step-a", specificationId: "spec-a", hidden: { slotRevision: 5 } },
      { id: "slot-context", planningOrderId: "route-a", projectId: "spec-a", hidden: { slotRevision: 6 } },
      { id: "slot-board", routeId: "route-board", routeStepId: "step-board", hidden: { slotRevision: 7 } },
    ],
    workCenters: [{ id: "wc-smt", hidden: { untouched: true } }],
  };
}

function planningFingerprint(planning) {
  const inspected = fingerprintSpecificationPlanningProjection(planning);
  assert.equal(inspected.ok, true, `Planning fingerprint failed: ${JSON.stringify(inspected)}`);
  return inspected.fingerprint;
}

function commandBase(planning) {
  return { expectedPlanningFingerprint: planningFingerprint(planning) };
}

function apply(directory, planning, command) {
  return applySpecificationCommand(directory, { ...commandBase(planning), ...command }, { now: NOW, planning });
}

function outputBinding(directory, specificationId, targetNomenclatureId) {
  const inspected = inspectSpecificationOutputBinding(directory, { specificationId, targetNomenclatureId });
  assert.equal(inspected.ok, true, `Output binding inspection failed: ${JSON.stringify(inspected)}`);
  return {
    targetNomenclatureId,
    impactFingerprint: inspected.fingerprint,
    expectedTargetRow: clone(inspected.target?.expectedRow ?? null),
    detaches: inspected.detaches.map((entry) => ({ itemId: entry.itemId, expectedRow: clone(entry.expectedRow) })),
  };
}

function operationMapFingerprint(directory) {
  return `sha256:${createHash("sha256").update(JSON.stringify(directory.operationMap || [])).digest("hex")}`;
}

function assertInputStable(directory, directoryBefore, planning, planningBefore, message) {
  assert.equal(JSON.stringify(directory), directoryBefore, `${message}: Directory input must remain byte-stable`);
  assert.equal(JSON.stringify(planning), planningBefore, `${message}: Planning input must remain byte-stable`);
}

function failStable(directory, planning, command, expectedCode) {
  const directoryBefore = JSON.stringify(directory);
  const planningBefore = JSON.stringify(planning);
  const result = apply(directory, planning, command);
  assert.equal(result.ok, false, `${expectedCode} must fail`);
  assert.equal(result.code, expectedCode, JSON.stringify(result));
  assert.equal(Object.hasOwn(result, "directory"), false, "Failed commands must not expose a candidate Directory");
  assertInputStable(directory, directoryBefore, planning, planningBefore, expectedCode);
  return result;
}

assert.deepEqual(DIRECTORY_CLUSTER_SPECIFICATION_REDUCER_CONTRACT.requiredDirectoryArrays, [
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);
assert.deepEqual(DIRECTORY_CLUSTER_SPECIFICATION_REDUCER_CONTRACT.requiredPlanningArrays, ["routes", "routeSteps", "slots"]);
assert.equal(DIRECTORY_CLUSTER_SPECIFICATION_REDUCER_CONTRACT.externalEffects.planning.includes("never mutates Planning"), true);
assert.equal(normalizeSpecificationName("  Изделие\t управления  "), "Изделие управления");

{
  const planning = fixturePlanning();
  const first = fingerprintSpecificationPlanningProjection(planning);
  const second = fingerprintSpecificationPlanningProjection(planning);
  assert.equal(first.ok, true);
  assert.match(first.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(first.fingerprint, second.fingerprint);
  const changed = clone(planning);
  changed.hidden.planningOwner = "concurrent";
  assert.notEqual(fingerprintSpecificationPlanningProjection(changed).fingerprint, first.fingerprint);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const directoryBefore = JSON.stringify(directory);
  const planningBefore = JSON.stringify(planning);
  const result = apply(directory, planning, {
    kind: "specification-create",
    specificationId: "spec-new",
    row: {
      id: "spec-new",
      name: "  Новое\t изделие  ",
      outputNomenclatureId: "nom-output-b",
      revision: "01",
      hidden: { createdBy: "qa", deep: deepMarker(8) },
    },
    outputBinding: outputBinding(directory, "spec-new", "nom-output-b"),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.name, "Новое изделие");
  assert.deepEqual(result.directory.specifications.map((row) => row.id), ["spec-a", "spec-b", "spec-holder", "spec-new"]);
  assert.deepEqual(result.directory.specifications.at(-1).structureItems, []);
  assert.equal(result.directory.specifications.at(-1).hidden.createdBy, "qa");
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-output-b").producedBySpecificationId, "spec-new");
  assert.equal(result.externalEffects.planning.required, false);
  assert.equal(result.requiresAtomicCommit, false);
  assert.equal(JSON.stringify(result.directory.topLevelHidden), JSON.stringify(directory.topLevelHidden));
  assert.equal(JSON.stringify(result.directory.statuses), JSON.stringify(directory.statuses));
  assertInputStable(directory, directoryBefore, planning, planningBefore, "create");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const expectedSpecification = clone(directory.specifications[0]);
  const directoryBefore = JSON.stringify(directory);
  const planningBefore = JSON.stringify(planning);
  const result = apply(directory, planning, {
    kind: "specification-metadata-update",
    specificationId: "spec-a",
    expectedSpecification,
    row: {
      id: "spec-a",
      name: "  Изделие A новое ",
      outputNomenclatureId: "nom-output-b",
      revision: "02",
      hiddenMetadata: { preserve: "new-extension" },
    },
    outputBinding: outputBinding(directory, "spec-a", "nom-output-b"),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.name, "Изделие A новое");
  assert.equal(result.row.hidden.specificationRevision, 17, "Unknown legacy metadata must survive partial update");
  assert.equal(result.row.hiddenMetadata.preserve, "new-extension");
  assert.deepEqual(result.row.structureItems, expectedSpecification.structureItems, "Metadata update must not rewrite structure rows");
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-output-a").producedBySpecificationId, "");
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-output-b").producedBySpecificationId, "spec-a");
  assert.equal(result.externalEffects.planning.mode, "replace-exact-rows");
  assert.equal(result.externalEffects.planning.operations.replaceRoutes.length, 1);
  const routePatch = result.externalEffects.planning.operations.replaceRoutes[0];
  assert.equal(routePatch.expectedRow.hidden.routeRevision, 7);
  assert.equal(routePatch.row.specificationName, "Изделие A новое");
  assert.equal(routePatch.row.bomListId, "");
  assert.equal(result.requiresAtomicCommit, true);
  assertInputStable(directory, directoryBefore, planning, planningBefore, "metadata update");

  const stale = outputBinding(directory, "spec-a", "nom-output-b");
  stale.detaches[0].expectedRow.hidden.outputRevision = 999;
  failStable(directory, planning, {
    kind: "specification-metadata-update",
    specificationId: "spec-a",
    expectedSpecification,
    row: { outputNomenclatureId: "nom-output-b", name: "Изделие A" },
    outputBinding: stale,
  }, "output-nomenclature-conflict");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const expectedSpecification = clone(directory.specifications[0]);
  const before = JSON.stringify(directory);
  const result = apply(directory, planning, {
    kind: "specification-structure-row-add",
    specificationId: "spec-a",
    expectedSpecification,
    insertAt: 2,
    row: {
      id: "row-new-component",
      parentId: "root",
      type: "nomenclature",
      nomenclatureId: "nom-component-a",
      fulfillmentMode: "purchase",
      quantity: 5,
      hidden: { imported: true },
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.row.structureItems.map((row) => row.id), [
    "row-board-a",
    "row-board-b",
    "row-new-component",
    "row-component",
  ]);
  assert.deepEqual(result.row.structureItems.map((row) => row.position), [1, 2, 3, 4]);
  assert.equal(result.row.structureItems[2].nomenclatureType, "РЭА компоненты");
  assert.equal(result.row.structureItems[2].hidden.imported, true);
  assert.equal(result.row.bomListA, "board-a");
  assert.equal(result.row.bomListB, "board-b");
  assert.equal(result.externalEffects.planning.kind, "planning-specification-structure-reconcile");
  assert.equal(result.externalEffects.planning.required, true);
  assert.equal(result.requiresAtomicCommit, true);
  assert.equal(JSON.stringify(directory), before, "Add must leave input Directory byte-stable");
}

for (const parentId of [42, { id: "root" }, " root "]) {
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  failStable(directory, planning, {
    kind: "specification-structure-row-add",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
    row: {
      id: `row-invalid-parent-${typeof parentId}`,
      parentId,
      type: "part",
      name: "Недопустимый родитель",
      quantity: 1,
    },
  }, "structure-parent-invalid");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  failStable(directory, planning, {
    kind: "specification-structure-row-add",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
    row: {
      id: "row-specification-cycle",
      parentId: "root",
      type: "specification",
      specificationId: "spec-holder",
      name: "Комплект",
      quantity: 1,
    },
  }, "specification-dependency-cycle");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const target = specification.structureItems.find((row) => row.id === "row-component");
  const missing = failStable(directory, planning, {
    kind: "specification-structure-row-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: target.id,
    expectedStructureRow: clone(target),
    row: { operationId: "op-new", operationName: "Новая операция", fulfillmentMode: "produce" },
  }, "operation-map-transaction-required");
  assert.equal(missing.externalEffects.operationMap.operationId, "op-new");
  assert.equal(missing.externalEffects.operationMap.expectedRow, null);

  const result = apply(directory, planning, {
    kind: "specification-structure-row-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: target.id,
    expectedStructureRow: clone(target),
    row: { operationId: "op-new", operationName: "Новая операция", fulfillmentMode: "produce", quantity: 6 },
    operationMapEffect: {
      expectedOperationMapFingerprint: operationMapFingerprint(directory),
      operationId: "op-new",
      expectedRow: null,
      row: { id: "op-new", name: "  Новая операция ", workCenterId: "wc-smt", hidden: { planned: true } },
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.structureRow.operationId, "op-new");
  assert.equal(result.structureRow.quantity, 6);
  assert.equal(result.structureRow.hidden.structureRevision, 3);
  assert.deepEqual(result.directory.operationMap, directory.operationMap, "Reducer must not fake the operationMap upsert");
  assert.equal(result.externalEffects.operationMap.required, true);
  assert.equal(result.externalEffects.operationMap.row.name, "Новая операция");
  assert.equal(result.requiresAtomicCommit, true);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const boardA = specification.structureItems[0];
  const result = apply(directory, planning, {
    kind: "specification-structure-row-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: boardA.id,
    expectedStructureRow: clone(boardA),
    row: { operationId: "op-existing", fulfillmentMode: "produce" },
    operationBinding: {
      operationId: "op-existing",
      expectedOperationMapFingerprint: operationMapFingerprint(directory),
      expectedRow: clone(directory.operationMap[0]),
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.structureRow.operationId, "op-existing");
  assert.equal(result.structureRow.operationName, "Монтаж");
  assert.equal(result.externalEffects.operationMap.mode, "assert-exact-row");
  assert.equal(result.externalEffects.operationMap.required, false);

  const staleBinding = {
    operationId: "op-existing",
    expectedOperationMapFingerprint: "sha256:stale",
    expectedRow: clone(directory.operationMap[0]),
  };
  failStable(directory, planning, {
    kind: "specification-structure-row-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: boardA.id,
    expectedStructureRow: clone(boardA),
    row: { operationId: "op-existing", fulfillmentMode: "produce" },
    operationBinding: staleBinding,
  }, "operation-map-baseline-conflict");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const component = specification.structureItems.find((row) => row.id === "row-component");
  const boardB = specification.structureItems.find((row) => row.id === "row-board-b");
  const result = apply(directory, planning, {
    kind: "specification-structure-row-reparent",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: component.id,
    expectedStructureRow: clone(component),
    parentId: boardB.id,
    expectedParentRow: clone(boardB),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.structureItems.find((row) => row.id === component.id).parentId, boardB.id);
  assert.deepEqual(result.row.structureItems.map((row) => row.id), specification.structureItems.map((row) => row.id), "Reparent must preserve source order");

  const boardA = specification.structureItems.find((row) => row.id === "row-board-a");
  failStable(directory, planning, {
    kind: "specification-structure-row-reparent",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: boardA.id,
    expectedStructureRow: clone(boardA),
    parentId: component.id,
    expectedParentRow: clone(component),
  }, "structure-cycle");

  failStable(directory, planning, {
    kind: "specification-structure-row-reparent",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: component.id,
    expectedStructureRow: clone(component),
    parentId: 42,
  }, "structure-parent-invalid");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const boardB = specification.structureItems[1];
  const result = apply(directory, planning, {
    kind: "specification-structure-row-reorder",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: boardB.id,
    expectedStructureRow: clone(boardB),
    toIndex: 0,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.row.structureItems.map((row) => row.id), ["row-board-b", "row-board-a", "row-component"]);
  assert.deepEqual(result.row.structureItems.map((row) => row.position), [1, 2, 3]);
  assert.equal(result.row.bomListA, "board-b");
  assert.equal(result.row.bomQtyA, 3);
  assert.equal(result.row.bomListB, "board-a");
  assert.equal(result.row.bomQtyB, 2);
  assert.equal(result.row.structureItems[1].hidden.structureRevision, 1);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const boardA = specification.structureItems[0];
  const result = apply(directory, planning, {
    kind: "specification-structure-row-delete",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: boardA.id,
    expectedStructureRow: clone(boardA),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.row.structureItems.map((row) => row.id), ["row-board-b", "row-component"]);
  assert.equal(result.row.structureItems.find((row) => row.id === "row-component").parentId, "root");
  assert.equal(result.row.bomListA, "board-b");
  assert.equal(result.row.bomListB, "");
  assert.equal(result.counts.structureRowsDeleted, 1);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const spec = directory.specifications[1];
  spec.structureItems = [{
    id: "row-board-result",
    parentId: "root",
    type: "nomenclature",
    nomenclatureId: "nom-board-a",
    nomenclatureType: "Печатные платы",
    quantity: 9,
    position: 1,
  }];
  spec.bomListA = "board-b";
  spec.bomQtyA = 99;
  const result = apply(directory, planning, {
    kind: "specification-bom-bindings-normalize",
    specificationId: "spec-b",
    expectedSpecification: clone(spec),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.bomListA, "board-a", "Nomenclature Board results must normalize to their authoritative Board id");
  assert.equal(result.row.bomQtyA, 9);
  assert.equal(result.row.bomListB, "");
  assert.equal(result.counts.bomBindingFieldsChanged, 2);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const result = apply(directory, planning, {
    kind: "specification-bom-bindings-normalize",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.row, specification, "Already canonical BOM bindings must be an exact no-op, including updatedAt");
  assert.equal(result.counts.specificationRowsUpdated, 0);
  assert.equal(result.counts.bomBindingFieldsChanged, 0);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const legacy = {
    id: "spec-legacy-shape",
    name: "Legacy без структуры",
    outputNomenclatureId: "",
    hidden: { missingFieldsMustStayMissing: true },
  };
  directory.specifications.push(legacy);
  const result = apply(directory, planning, {
    kind: "specification-metadata-update",
    specificationId: legacy.id,
    expectedSpecification: clone(legacy),
    row: { name: "Legacy обновлён" },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.name, "Legacy обновлён");
  assert.equal(Object.hasOwn(result.row, "structureItems"), false, "Metadata update must not invent a missing legacy structure array");
  assert.equal(Object.hasOwn(result.row, "structureManaged"), false, "Metadata update must not invent a missing legacy structure mode");
  assert.equal(Object.hasOwn(result.row, "bomListA"), false, "Metadata update must not invent missing BOM bindings");
  assert.equal(result.row.hidden.missingFieldsMustStayMissing, true);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const directoryBefore = JSON.stringify(directory);
  const planningBefore = JSON.stringify(planning);
  const result = apply(directory, planning, {
    kind: "specification-route-binding-normalize",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.projectId, "");
  assert.equal(result.externalEffects.planning.kind, "planning-route-bindings-normalize");
  assert.equal(result.externalEffects.planning.operations.replaceRoutes.length, 1);
  assert.equal(result.externalEffects.planning.operations.replaceRoutes[0].row.projectId, "spec-a");
  assert.equal(result.externalEffects.planning.operations.replaceRoutes[0].row.bomListId, "");
  assert.equal(result.requiresAtomicCommit, true);
  assertInputStable(directory, directoryBefore, planning, planningBefore, "route binding normalize");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const preview = inspectSpecificationDeleteImpact(directory, "spec-a", { planning });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.match(preview.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(preview.counts, {
    structureRows: 3,
    nestedSpecificationRows: 1,
    nestedStructureReferences: 1,
    outputNomenclatureRows: 1,
    planningRoutes: 1,
    planningRouteSteps: 1,
    planningSlots: 2,
  });
  const directoryBefore = JSON.stringify(directory);
  const planningBefore = JSON.stringify(planning);
  const result = apply(directory, planning, {
    kind: "specification-delete",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    impactFingerprint: preview.fingerprint,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.directory.specifications.map((row) => row.id), ["spec-b", "spec-holder"]);
  const holderItems = result.directory.specifications.find((row) => row.id === "spec-holder").structureItems;
  assert.deepEqual(holderItems.map((row) => row.id), ["row-nested-child"]);
  assert.equal(holderItems[0].parentId, "root", "Children of a removed nested Specification row must be reparented explicitly");
  assert.equal(holderItems[0].hidden.childRevision, 3);
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-output-a").producedBySpecificationId, "");
  assert.deepEqual(result.externalEffects.planning.operations.deleteRouteIds, ["route-a"]);
  assert.deepEqual(result.externalEffects.planning.operations.deleteRouteStepIds, ["step-a"]);
  assert.deepEqual(result.externalEffects.planning.operations.deleteSlotIds, ["slot-a", "slot-context"]);
  assert.deepEqual(planning.routes.map((row) => row.id), ["route-a", "route-board"], "Reducer must not fake Planning deletion");
  assert.equal(result.requiresAtomicCommit, true);
  assertInputStable(directory, directoryBefore, planning, planningBefore, "delete");

  const changedDirectory = fixtureDirectory();
  changedDirectory.specifications[2].structureItems.push({
    id: "row-nested-a-2",
    parentId: "root",
    type: "specification",
    specificationId: "spec-a",
    position: 2,
  });
  failStable(changedDirectory, planning, {
    kind: "specification-delete",
    specificationId: "spec-a",
    expectedSpecification: clone(changedDirectory.specifications[0]),
    impactFingerprint: preview.fingerprint,
  }, "specification-impact-changed");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const stale = clone(directory.specifications[0]);
  stale.hidden.specificationRevision = 999;
  failStable(directory, planning, {
    kind: "specification-bom-bindings-normalize",
    specificationId: "spec-a",
    expectedSpecification: stale,
  }, "specification-row-conflict");

  const changedPlanning = fixturePlanning();
  const oldFingerprint = planningFingerprint(changedPlanning);
  changedPlanning.hidden.planningOwner = "concurrent";
  const result = applySpecificationCommand(directory, {
    kind: "specification-route-binding-normalize",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
    expectedPlanningFingerprint: oldFingerprint,
  }, { now: NOW, planning: changedPlanning });
  assert.equal(result.ok, false);
  assert.equal(result.code, "planning-baseline-conflict");
}

for (const mutate of [
  (directory) => { directory.specifications[0].structureItems[2].nomenclatureId = "nom-missing"; },
  (directory) => { directory.specifications[0].structureItems[2].nomenclatureType = "Тип отсутствует"; },
  (directory) => { directory.specifications[0].structureItems[0].bomListId = "board-missing"; },
  (directory) => { directory.bomLists[0].importRows[0].nomenclatureId = "nom-missing"; },
]) {
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  mutate(directory);
  const before = JSON.stringify(directory);
  const result = apply(directory, planning, {
    kind: "specification-bom-bindings-normalize",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "dangling-directory-reference", JSON.stringify(result));
  assert.equal(JSON.stringify(directory), before);
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  directory.specifications[0].structureItems[0].parentId = "row-component";
  const result = apply(directory, planning, {
    kind: "specification-bom-bindings-normalize",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "structure-cycle");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const rowCount = 10_000;
  directory.specifications[0].structureItems = Array.from({ length: rowCount }, (_value, index) => ({
    id: `large-row-${index}`,
    parentId: index === 0 ? "root" : `large-row-${index - 1}`,
    type: "part",
    name: `Строка ${index}`,
    quantity: 1,
    position: index + 1,
  }));
  const result = apply(directory, planning, {
    kind: "specification-bom-bindings-normalize",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.row.structureItems.length, rowCount);
  assert.equal(result.row.structureItems.at(-1).parentId, `large-row-${rowCount - 2}`);

  const lastRow = directory.specifications[0].structureItems.at(-1);
  const reparented = apply(directory, planning, {
    kind: "specification-structure-row-reparent",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
    itemId: lastRow.id,
    expectedStructureRow: clone(lastRow),
    parentId: "root",
  });
  assert.equal(reparented.ok, true, JSON.stringify(reparented));
  assert.equal(reparented.row.structureItems.at(-1).parentId, "root");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const command = {
    kind: "specification-metadata-update",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
    row: { name: "Глубокая команда", hidden: {} },
  };
  let cursor = command.row.hidden;
  for (let index = 0; index < 100; index += 1) {
    cursor.child = {};
    cursor = cursor.child;
  }
  const deep = apply(directory, planning, command);
  assert.equal(deep.ok, false);
  assert.equal(deep.code, "json-depth-limit");

  const cyclic = fixtureDirectory();
  cyclic.topLevelHidden.self = cyclic;
  assert.doesNotThrow(() => applySpecificationCommand(cyclic, {}, { now: NOW, planning }));
  const cyclicResult = applySpecificationCommand(cyclic, {}, { now: NOW, planning });
  assert.equal(cyclicResult.ok, false);
  assert.equal(cyclicResult.code, "json-invalid");

  const invalidNumber = apply(directory, planning, {
    kind: "specification-metadata-update",
    specificationId: "spec-a",
    expectedSpecification: clone(directory.specifications[0]),
    row: { name: "NaN", productionQuantity: Number.NaN },
  });
  assert.equal(invalidNumber.ok, false);
  assert.equal(invalidNumber.code, "json-invalid");
}

{
  const directory = fixtureDirectory();
  const planning = fixturePlanning();
  const specification = directory.specifications[0];
  const component = specification.structureItems[2];
  failStable(directory, planning, {
    kind: "specification-structure-row-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: component.id,
    expectedStructureRow: clone(component),
    row: { parentId: "root" },
  }, "structure-parent-owned-separately");
  failStable(directory, planning, {
    kind: "specification-structure-row-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    itemId: component.id,
    expectedStructureRow: clone(component),
    row: { position: 1 },
  }, "structure-order-owned-separately");
  failStable(directory, planning, {
    kind: "specification-metadata-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    row: { name: "Нельзя", structureItems: [] },
  }, "specification-field-owned-separately");
  failStable(directory, planning, {
    kind: "specification-metadata-update",
    specificationId: "spec-a",
    expectedSpecification: clone(specification),
    row: { name: "Нельзя", projectId: "legacy-project-b" },
  }, "specification-field-owned-separately");
}

console.log("Directory cluster Specifications/Speki reducer QA passed.");
