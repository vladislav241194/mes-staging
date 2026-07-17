import assert from "node:assert/strict";
import { analyzeSpecifications2Workbook } from "../src/modules/specifications2/render.js";

const headers = [
  "№",
  "Спецификации (СЕ)",
  "Применяемость",
  "Тип компонента",
  "Наименование и обозначение",
  "Ед. изм",
  "Кол-во ",
];

const data = [
  [1, "АБВГ.100000.001 Локальная сборка", "АБВГ.200000.001 Головное изделие", "Деталь", "АБВГ.300000.001 Деталь", "шт.", 2],
  [2, "АБВГ.200000.001 Головное изделие", "нет", "СЕ", "АБВГ.100000.001 Локальная сборка", "шт.", 1],
];

function worksheetRow(index, values) {
  const cells = {};
  values.forEach((value, columnIndex) => {
    const column = String.fromCharCode(65 + columnIndex);
    cells[column] = { ref: `${column}${index}`, value, formula: "" };
  });
  return { index, outlineLevel: 0, cells };
}

const workbook = {
  sheets: [{
    name: "Перечень",
    formulas: [],
    rows: [worksheetRow(1, headers), ...data.map((row, index) => worksheetRow(index + 2, row))],
  }],
};

const analysis = analyzeSpecifications2Workbook(workbook);

assert.equal(analysis.title, "АБВГ.200000.001 Головное изделие");
assert.equal(analysis.rows.length, 2);
assert.equal(analysis.rows[0].product, "АБВГ.200000.001 Головное изделие");
assert.equal(analysis.rows[0].unit, "АБВГ.100000.001 Локальная сборка");
assert.equal(analysis.rows[1].product, "нет");
assert.equal(analysis.rows[1].unit, "АБВГ.200000.001 Головное изделие");
assert.equal(analysis.stats.sections, 2);
assert.equal(analysis.treeRows.find((row) => row.selectionKey === "row:2")?.levelLabel, "№ 1");
assert.equal(analysis.treeRows.filter((row) => row.level === 0).length, 1);
assert.equal(analysis.treeRows.filter((row) => row.nodeKey === "абвг.200000.001 головное изделие").length, 1);
assert.equal(analysis.treeRows.find((row) => row.nodeKey === "абвг.100000.001 локальная сборка")?.level, 1);
assert.equal(analysis.treeRows.find((row) => row.nodeKey === "абвг.100000.001 локальная сборка")?.quantity, 1);
assert.equal(analysis.treeRows.find((row) => row.nodeKey === "абвг.300000.001 деталь")?.level, 2);
assert.ok(analysis.graphEdges.some((edge) => edge.type === "Узел"));
assert.ok(analysis.graphEdges.some((edge) => edge.type === "Деталь"));

const siblingWorkbook = {
  sheets: [{
    name: "Перечень",
    formulas: [],
    rows: [
      worksheetRow(1, headers),
      worksheetRow(2, [0, "АБВГ.400000.001 Плата управления", "АБВГ.500000.001 Изделие", "ПП", "BAT_SW v.6.2.4", "шт.", 1]),
      worksheetRow(3, [1, "АБВГ.400000.001 Плата управления", "АБВГ.500000.001 Изделие", "РЭК", "Чип конденсатор 100нФ", "шт.", 7]),
      worksheetRow(4, [2, "АБВГ.500000.001 Изделие", "нет", "СЕ", "АБВГ.400000.001 Плата управления", "шт.", 1]),
    ],
  }],
};
const siblingAnalysis = analyzeSpecifications2Workbook(siblingWorkbook);
const boardRow = siblingAnalysis.treeRows.find((row) => row.label === "BAT_SW v.6.2.4");
const capacitorRow = siblingAnalysis.treeRows.find((row) => row.label === "Чип конденсатор 100нФ");
assert.equal(boardRow?.level, capacitorRow?.level, "Rows from the same specification must remain siblings regardless of component type.");
assert.equal(boardRow?.parentKey, capacitorRow?.parentKey, "Component type must not create an implicit parent-child edge.");
assert.equal(boardRow?.status, "ok", "A printed circuit board is a component and must not require a separate nested specification.");

const legacyWorkbook = {
  sheets: [{
    name: "Старый шаблон",
    formulas: [],
    rows: [worksheetRow(1, ["№", "Изделие", "Узел", "Тип изделия", "Наименование и обозначение", "Ед. изм", "Кол-во на изделие"])],
  }],
};

assert.throws(
  () => analyzeSpecifications2Workbook(legacyWorkbook),
  /не найдена строка заголовков шаблона/,
);

console.log("Specifications 2.0 new XLSX import contract: OK");
