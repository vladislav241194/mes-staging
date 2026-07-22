import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";
import {
  applySpecifications2EditorAction,
  removeSpecifications2EditorBranch,
  buildSpecifications2EditorAnalysis,
  createSpecifications2EditorRows,
  getSpecifications2ManufacturedItems,
} from "../src/modules/specifications2/draft_structure_model.js";
import {
  applySpecifications2RouteDraftAction,
  applySpecifications2LaborNorm,
  applySpecifications2LaborNormRevision,
  createSpecifications2RouteDraft,
  getSpecifications2InstructionDebtCount,
  generateSpecifications2ProductionStages,
  inspectSpecifications2RouteDraft,
  calculateSpecifications2LaborOperation,
  calculateSpecifications2LaborPlan,
  isSpecifications2LaborNormComplete,
  getSpecifications2LaborNormAt,
} from "../src/modules/specifications2/route_model.js";
import {
  getSpecifications2AoiProductionFiles,
  isSpecifications2ProductionFileAccepted,
} from "../src/modules/specifications2/production_file_contract.js";

const { buildTreeTableVisualRows } = await withBundledTypeScriptClient(
  new URL("../src/ui/tree_table_visual.ts", import.meta.url),
  async (module) => module,
  { prefix: "mes-tree-table-visual-qa-" },
);

const row = (id, depth, label = id) => ({ id, level: depth, label });

const singleRoot = buildTreeTableVisualRows([row("root", 0)]);
assert.equal(singleRoot.length, 1);
assert.equal(singleRoot[0].treeVisualState.hasChildren, false);
assert.deepEqual(singleRoot[0].treeVisualState.ancestorContinuationMask, []);

const oneChild = buildTreeTableVisualRows([row("root", 0), row("child", 1)]);
assert.equal(oneChild[0].treeVisualState.hasVisibleChildren, true);
assert.equal(oneChild[1].treeVisualState.parentId, "root");
assert.equal(oneChild[1].treeVisualState.isLastVisibleSibling, true);

const branchingRows = [
  row("root", 0),
  row("a", 1),
  row("b", 1),
  row("b-1", 2),
  row("b-2", 2),
  row("c", 1),
];
const branching = buildTreeTableVisualRows(branchingRows);
const b1 = branching.find((item) => item.id === "b-1");
const b2 = branching.find((item) => item.id === "b-2");
assert.equal(b1.treeVisualState.ancestorContinuationMask[1], true);
assert.equal(b2.treeVisualState.ancestorContinuationMask[1], true);
assert.equal(b1.treeVisualState.isLastVisibleSibling, false);
assert.equal(b2.treeVisualState.isLastVisibleSibling, true);

const deepRows = Array.from({ length: 8 }, (_, depth) => row(`deep-${depth}`, depth));
const deep = buildTreeTableVisualRows(deepRows);
assert.equal(deep.at(-1).treeVisualState.depth, 7);
assert.equal(deep.at(-1).treeVisualState.ancestorContinuationMask.length, 7);

const roots = buildTreeTableVisualRows([row("r1", 0), row("r1-c", 1), row("r2", 0), row("r2-c", 1)]);
assert.equal(roots.find((item) => item.id === "r2").treeVisualState.parentId, null);
assert.equal(roots.find((item) => item.id === "r2-c").treeVisualState.ancestorContinuationMask[0], false);

const collapsed = buildTreeTableVisualRows(branchingRows, { collapsedIds: ["b"] });
assert.deepEqual(collapsed.map((item) => item.id), ["root", "a", "b", "c"]);
assert.equal(collapsed.find((item) => item.id === "b").treeVisualState.isExpanded, false);

const filtered = buildTreeTableVisualRows(branchingRows, { filter: (item) => item.id === "b-2" });
assert.deepEqual(filtered.map((item) => item.id), ["root", "b", "b-2"]);
assert.equal(filtered.find((item) => item.id === "root").treeVisualState.isContextRow, true);
assert.equal(filtered.find((item) => item.id === "b-2").treeVisualState.isLastVisibleSibling, true);
assert.equal(filtered.find((item) => item.id === "b-2").treeVisualState.ancestorContinuationMask[1], false);

const sorted = buildTreeTableVisualRows(branchingRows, {
  siblingComparator: (left, right) => right.label.localeCompare(left.label),
});
assert.deepEqual(sorted.filter((item) => item.treeVisualState.depth === 1).map((item) => item.id), ["c", "b", "a"]);

const largeRows = [row("large-root", 0), ...Array.from({ length: 1000 }, (_, index) => row(`large-${index}`, 1))];
const startedAt = performance.now();
const large = buildTreeTableVisualRows(largeRows);
const elapsed = performance.now() - startedAt;
assert.equal(large.length, 1001);
assert.ok(elapsed < 250, `1000-row visual model is too slow: ${elapsed.toFixed(1)}ms`);

const editorSeed = createSpecifications2EditorRows([
  { id: "root", level: 0, label: "Изделие", type: "Изделие" },
  { id: "a", level: 1, label: "Узел А", type: "СЕ", quantity: 1, unitOfMeasure: "шт." },
  { id: "a-1", level: 2, label: "Деталь А1", type: "Деталь", quantity: 2, unitOfMeasure: "шт." },
  { id: "b", level: 1, label: "Узел Б", type: "СЕ", quantity: 1, unitOfMeasure: "шт." },
]);
assert.equal(editorSeed.find((item) => item.id === "a-1")?.parentId, "a");

let edited = applySpecifications2EditorAction(editorSeed, {
  type: "update",
  id: "a-1",
  value: { label: "Деталь А1 новая", type: "Деталь", quantity: "3", unitOfMeasure: "шт." },
});
assert.equal(edited.find((item) => item.id === "a-1")?.label, "Деталь А1 новая");

edited = applySpecifications2EditorAction(edited, {
  type: "add",
  mode: "child",
  id: "b",
  newId: "b-1",
  value: { label: "Деталь Б1", type: "Деталь", quantity: "4", unitOfMeasure: "шт." },
});
assert.equal(edited.find((item) => item.id === "b-1")?.parentId, "b");

edited = applySpecifications2EditorAction(edited, {
  type: "add",
  mode: "sibling",
  id: "b",
  newId: "c",
  value: { label: "Узел В", type: "СЕ", quantity: "1", unitOfMeasure: "шт." },
});
assert.equal(edited.find((item) => item.id === "c")?.parentId, "root");

edited = applySpecifications2EditorAction(edited, { type: "indent", id: "c" });
assert.equal(edited.find((item) => item.id === "c")?.parentId, "b");
edited = applySpecifications2EditorAction(edited, { type: "outdent", id: "c" });
assert.equal(edited.find((item) => item.id === "c")?.parentId, "root");

edited = applySpecifications2EditorAction(edited, { type: "reparent", id: "a-1", parentId: "b" });
assert.equal(edited.find((item) => item.id === "a-1")?.parentId, "b");
const cycleGuard = applySpecifications2EditorAction(edited, { type: "reparent", id: "b", parentId: "b-1" });
assert.equal(cycleGuard.find((item) => item.id === "b")?.parentId, "root");

const beforeRootDelete = edited.length;
edited = applySpecifications2EditorAction(edited, { type: "remove", id: "root" });
assert.equal(edited.length, beforeRootDelete, "root must not be removable");
edited = applySpecifications2EditorAction(edited, { type: "remove", id: "b" });
assert.equal(edited.some((item) => ["b", "b-1", "a-1"].includes(item.id)), false, "branch removal must include descendants");

const uiRemovalSeed = createSpecifications2EditorRows([
  { id: "root-ui", level: 0, label: "Изделие", type: "Изделие" },
  { id: "branch-ui", level: 1, label: "Ветка", type: "СЕ" },
  { id: "leaf-ui", level: 2, label: "Деталь", type: "Деталь" },
  { id: "sibling-ui", level: 1, label: "Сосед", type: "СЕ" },
]);
const uiRemovalResult = removeSpecifications2EditorBranch(uiRemovalSeed, "branch-ui::2");
assert.equal(uiRemovalResult.some((item) => ["branch-ui", "leaf-ui"].includes(item.id)), false, "UI removal must resolve visual occurrence suffixes and delete descendants");
assert.equal(uiRemovalResult.some((item) => item.id === "sibling-ui"), true, "UI removal must preserve sibling branches");

const editorAnalysis = buildSpecifications2EditorAnalysis(edited);
assert.equal(editorAnalysis.treeRows[0]?.label, "Изделие");
assert.equal(editorAnalysis.graphEdges.length, editorAnalysis.treeRows.length - 1);
assert.ok(editorAnalysis.diagramLevels.length >= 2);

const manufactured = getSpecifications2ManufacturedItems([
  { nodeKey: "root", label: "Калоша", designation: "АБВГ.469659.001", type: "Изделие" },
  { nodeKey: "board", label: "АБВГ.468332.002 Плата", type: "СЕ" },
  { nodeKey: "resistor", label: "Резистор 10 кОм", type: "Покупное" },
  { nodeKey: "board-copy", label: "Плата", designation: "АБВГ.468332.002", type: "СЕ" },
]);
assert.deepEqual(manufactured.map((item) => item.designation), ["АБВГ.469659.001", "АБВГ.468332.002"]);
let routeDraft = createSpecifications2RouteDraft(manufactured[0], { id: "route-1", now: "2026-07-15T00:00:00.000Z" });
assert.equal(routeDraft.operations.length, 0);
assert.equal(inspectSpecifications2RouteDraft(routeDraft).ready, false);
const missingInputStateDraft = applySpecifications2RouteDraftAction(routeDraft, {
  type: "add",
  newId: "op-missing-input",
  value: { operationId: "D1_OP", name: "Подготовка", workCenterId: "D1", workCenter: "Отдел 1", nextWorkCenterId: "D2", nextWorkCenter: "Отдел 2", nextOperationId: "D2_OP", nextOperation: "Сборка", outputState: "Комплект подготовлен" },
});
assert.equal(inspectSpecifications2RouteDraft(missingInputStateDraft).ready, false, "a property-changing operation must require both input and output states");
routeDraft = applySpecifications2RouteDraftAction(routeDraft, {
  type: "add",
  newId: "op-1",
  now: "2026-07-15T00:01:00.000Z",
  value: { operationId: "D1_OP", name: "Подготовка", workCenterId: "D1", workCenter: "Отдел 1", nextWorkCenterId: "D2", nextWorkCenter: "Отдел 2", nextOperationId: "D2_OP", nextOperation: "Сборка", inputState: "Комплект на складе", outputState: "Комплект подготовлен", instructionRequired: true },
});
assert.equal(getSpecifications2InstructionDebtCount(routeDraft), 1);
routeDraft = applySpecifications2RouteDraftAction(routeDraft, {
  type: "add",
  newId: "op-2",
  now: "2026-07-15T00:02:00.000Z",
  value: { operationId: "D2_OP", name: "Сборка", workCenterId: "D2", workCenter: "Отдел 2", nextWorkCenterId: "D3", nextWorkCenter: "Склад готовой продукции", nextOperationId: "D3_OP", nextOperation: "Приёмка", inputState: "Комплект подготовлен", outputState: "Изделие собрано" },
});
assert.equal(routeDraft.operations[1].workCenterId, routeDraft.operations[0].nextWorkCenterId, "every subsequent operation must start in the previous destination");
assert.equal(inspectSpecifications2RouteDraft(routeDraft).ready, true);
routeDraft = applySpecifications2RouteDraftAction(routeDraft, { type: "up", operationId: "op-2" });
assert.equal(routeDraft.operations[0].id, "op-2");
routeDraft = applySpecifications2RouteDraftAction(routeDraft, { type: "update", operationId: "op-2", value: { operationId: "D2_FINAL", name: "Финальная сборка", workCenterId: "D2", workCenter: "Отдел 2", nextWorkCenterId: "D3", nextWorkCenter: "Склад готовой продукции", nextOperationId: "D3_OP", nextOperation: "Приёмка", inputState: "Комплект подготовлен", outputState: "Изделие собрано" } });
assert.equal(routeDraft.operations[0].name, "Финальная сборка");
routeDraft = applySpecifications2RouteDraftAction(routeDraft, { type: "toggle-ready" });
assert.equal(routeDraft.status, "ready-for-norming");
routeDraft = applySpecifications2RouteDraftAction(routeDraft, { type: "remove", operationId: "op-1" });
assert.equal(routeDraft.operations.length, 1);
assert.equal(getSpecifications2InstructionDebtCount(routeDraft), 0);
assert.equal(routeDraft.status, "draft", "editing a ready draft must return it to draft status");

let unchangedDraft = createSpecifications2RouteDraft(manufactured[0], { id: "route-unchanged", now: "2026-07-15T00:00:00.000Z" });
unchangedDraft = applySpecifications2RouteDraftAction(unchangedDraft, {
  type: "add",
  newId: "warehouse-issue",
  value: {
    operationId: "WAREHOUSE_ISSUE",
    name: "Выдача комплектующих",
    workCenterId: "WAREHOUSE",
    workCenter: "Склад",
    nextWorkCenterId: "ASSEMBLY",
    nextWorkCenter: "Участок сборки",
    nextOperationId: "ASSEMBLY_OP",
    nextOperation: "Сборка",
    changesProperty: false,
  },
});
assert.equal(unchangedDraft.operations[0].changesProperty, false);
assert.equal(unchangedDraft.operations[0].outputState, "");
assert.equal(inspectSpecifications2RouteDraft(unchangedDraft).ready, true, "an unchanged property scenario must not require an additional result field");

let normalizedDraft = applySpecifications2LaborNorm(unchangedDraft, "warehouse-issue", {
  setupMinutes: "12,5",
  unitsPerHour: "20",
});
assert.equal(isSpecifications2LaborNormComplete(normalizedDraft.operations[0].laborNorm), true);
assert.deepEqual(calculateSpecifications2LaborOperation(normalizedDraft.operations[0].laborNorm, 10), {
  laborMinutes: 42.5,
  durationMinutes: 42.5,
});
assert.deepEqual(calculateSpecifications2LaborPlan(normalizedDraft, 10), {
  completedOperations: 1,
  laborMinutes: 42.5,
  durationMinutes: 42.5,
});
const fixedNormDraft = applySpecifications2LaborNorm(unchangedDraft, "warehouse-issue", {
  calculationMode: "fixed",
  fixedMinutes: "18.5",
});
assert.equal(isSpecifications2LaborNormComplete(fixedNormDraft.operations[0].laborNorm), true);
assert.deepEqual(calculateSpecifications2LaborOperation(fixedNormDraft.operations[0].laborNorm, 999), {
  laborMinutes: 18.5,
  durationMinutes: 18.5,
}, "fixed operation time must not depend on quantity");
let revisionDraft = applySpecifications2LaborNormRevision(unchangedDraft, "warehouse-issue", {
  calculationMode: "rate",
  setupMinutes: 10,
  unitsPerHour: 20,
}, { id: "norm-r1", effectiveFrom: "2026-07-01", reason: "Первичная оценка", createdAt: "2026-07-01T08:00:00.000Z" });
revisionDraft = applySpecifications2LaborNormRevision(revisionDraft, "warehouse-issue", {
  calculationMode: "rate",
  setupMinutes: 8,
  unitsPerHour: 25,
}, { id: "norm-r2", effectiveFrom: "2026-08-01", reason: "Результаты тестовой партии", createdAt: "2026-07-20T08:00:00.000Z" });
const revisionNorm = revisionDraft.operations[0].laborNorm;
assert.equal(revisionNorm.revisions.length, 2, "a changed norm must create a revision instead of overwriting history");
assert.equal(revisionNorm.revisions[0].effectiveTo, "2026-07-31", "the previous revision must close before the next one starts");
assert.equal(getSpecifications2LaborNormAt(revisionNorm, "2026-07-15").unitsPerHour, 20, "past periods must retain their revision");
assert.equal(getSpecifications2LaborNormAt(revisionNorm, "2026-08-05").unitsPerHour, 25, "new periods must use the new revision");
normalizedDraft = applySpecifications2RouteDraftAction(normalizedDraft, { type: "update", operationId: "warehouse-issue", value: { ...normalizedDraft.operations[0], name: "Выдача со склада" } });
assert.equal(normalizedDraft.operations[0].laborNorm.unitsPerHour, 20, "route editing must preserve the saved labor norm");

let smtFileDraft = createSpecifications2RouteDraft(manufactured[0], { id: "route-smt-files", now: "2026-07-15T00:00:00.000Z" });
smtFileDraft = applySpecifications2RouteDraftAction(smtFileDraft, {
  type: "add",
  newId: "smt-operation",
  value: {
    operationId: "D3_L1_OP",
    name: "SMT-монтаж",
    workCenterId: "D3",
    workCenter: "Отдел поверхностного монтажа",
    nextWorkCenterId: "D3_AOI",
    nextWorkCenter: "Оптическая инспекция",
    nextOperationId: "D3_AOI_OP",
    nextOperation: "Оптическая инспекция",
    changesProperty: true,
    inputState: "Плата и комплектующие",
    outputState: "Смонтированная плата",
    productionFiles: {
      pnp: { storageKey: "route-smt-files::smt-operation::pnp", name: "board-pnp.txt", size: 128, type: "text/plain" },
      gerber: { storageKey: "route-smt-files::smt-operation::gerber", name: "board-gerber.zip", size: 2048, type: "application/zip" },
    },
  },
});
assert.equal(smtFileDraft.operations[0].productionFiles.pnp.name, "board-pnp.txt");
assert.equal(smtFileDraft.operations[0].productionFiles.gerber.name, "board-gerber.zip");
assert.equal(isSpecifications2ProductionFileAccepted("pnp", "board-pnp.txt"), true);
assert.equal(isSpecifications2ProductionFileAccepted("pnp", "board-pnp.csv"), false);
assert.equal(isSpecifications2ProductionFileAccepted("gerber", "board-gerber.zip"), true);
assert.equal(isSpecifications2ProductionFileAccepted("gerber", "board-gerber.rar"), false);
assert.equal(isSpecifications2ProductionFileAccepted("instructionDoc", "assembly-instruction.doc"), true);
assert.equal(isSpecifications2ProductionFileAccepted("instructionDoc", "assembly-instruction.docx"), true);
assert.equal(isSpecifications2ProductionFileAccepted("instructionDoc", "assembly-instruction.pdf"), false);
assert.equal(isSpecifications2ProductionFileAccepted("instructionPdf", "assembly-instruction.pdf"), true);
assert.equal(isSpecifications2ProductionFileAccepted("instructionPdf", "assembly-instruction.docx"), false);
assert.deepEqual(getSpecifications2AoiProductionFiles(smtFileDraft).map((item) => item.kind), ["pnp", "gerber"], "AOI must inherit references to both SMT production files");
smtFileDraft = applySpecifications2RouteDraftAction(smtFileDraft, { type: "update", operationId: "smt-operation", value: { ...smtFileDraft.operations[0], outputState: "Плата после SMT", comment: "Проверить полярность компонентов" } });
assert.equal(smtFileDraft.operations[0].productionFiles.pnp.storageKey, "route-smt-files::smt-operation::pnp", "editing an SMT operation must preserve its PnP attachment");
assert.equal(smtFileDraft.operations[0].comment, "Проверить полярность компонентов", "operation comment must survive normalization and editing");

const generationCatalog = {
  departments: [
    { id: "D1", name: "Склад" },
    { id: "D4", name: "Отдел технического контроля" },
    { id: "D9", name: "Слесарный отдел" },
  ],
  operations: [
    { id: "D1_OP3", name: "Выдача в производство", workCenterId: "D1" },
    { id: "D9_OP1", name: "Слесарная операция", workCenterId: "D9" },
    { id: "D4_OP2", name: "Технический контроль готовой продукции", workCenterId: "D4" },
    { id: "D1_OP2", name: "Поступление из производства", workCenterId: "D1" },
  ],
};
const generatedPlateRoute = generateSpecifications2ProductionStages(createSpecifications2RouteDraft({ key: "plate", label: "Пластина к БЧ", designation: "АБВГ.469419.001" }, { id: "generated-plate" }), generationCatalog);
assert.deepEqual(generatedPlateRoute.operations.map((operation) => operation.operationId), ["D1_OP3", "D9_OP1", "D4_OP2"]);
assert.equal(generatedPlateRoute.operations[1].outputState, "Механически обработанная пластина");
assert.equal(generatedPlateRoute.operations[2].nextOperationId, "D1_OP2");
assert.equal(inspectSpecifications2RouteDraft(generatedPlateRoute).ready, true, "generated production stages must form a complete route chain");

console.log(`Specifications 2.0 tree visual/editor model: OK (${elapsed.toFixed(1)}ms for 1001 rows)`);
