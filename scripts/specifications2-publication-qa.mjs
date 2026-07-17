import assert from "node:assert/strict";
import {
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
    slots: [{ id: "historical-slot", routeId: first.publication.rootRouteId, planningOrderId: first.publication.rootRouteId }],
  },
});
assert.equal(second.publication.revision, 2);
assert.equal(second.directoryState.specifications.length, 2, "A new release must append instead of mutating history.");
assert.equal(second.planningState.routes.length, 2, "A revision referenced by a production slot must remain immutable.");
assert.equal(second.planningState.routeSteps.length, 4, "Historical and active aggregate routes must keep complete operation chains.");
assert.equal(first.planningState.routes[0].documentRevisionSnapshot.specificationRevision, 1, "Publishing a new revision must not mutate an old work-order source snapshot.");

console.log("Specifications 2.0 publication adapter: OK");
