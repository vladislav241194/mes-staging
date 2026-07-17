import { prepareSpecifications2Publication } from "./specifications2-publish-revision.mjs";

const assert = (value, message) => { if (!value) throw new Error(message); };
const entry = {
  id: "entry-1", title: "Изделие", treeRows: [{ id: "root", level: 0, label: "АБВГ.001.001 Изделие", quantity: 1, unit: "шт." }],
  routeDrafts: [{ id: "route-1", productKey: "root", designation: "АБВГ.001.001", productLabel: "Изделие", operations: [{ id: "operation-1", operationId: "OP-1", name: "Монтаж", workCenterId: "D1", nextWorkCenterId: "D2", inputState: "До", outputState: "После", laborNorm: { calculationMode: "unit", unitsPerHour: 60 } }] }],
  publication: { revision: 5 },
};
const snapshot = { version: 17, values: {
  "mes-specifications-2-registry-v1": JSON.stringify({ selectedId: "entry-1", registry: [entry] }),
  "mes-planning-prototype-directories-v2": JSON.stringify({ nomenclature: [], specifications: [] }),
  "mes-planning-prototype-state-v2": JSON.stringify({ routes: [], routeSteps: [], slots: [] }),
} };
const prepared = prepareSpecifications2Publication(snapshot, "entry-1");
assert(prepared.result.publication.revision === 6, "Publisher must increment the specification revision");
assert(prepared.result.planningState.routes.length === 1 && prepared.result.planningState.routeSteps.length === 1, "Publisher must create the released planning projection");
assert(prepared.nextRegistry.registry[0].publication.revision === 6, "Publisher must store the new immutable publication record");
let missing = "";
try { prepareSpecifications2Publication(snapshot, "missing"); } catch (error) { missing = String(error.message); }
assert(/was not found/.test(missing), "Publisher must refuse an unknown entry");
console.log("Specifications 2.0 publish revision QA: OK");
