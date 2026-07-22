import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createBoardsCommandOwner } from "../src/modules/nomenclature/boards_command_owner.js";

let sequence = 0;
let persisted = 0;
let directory = {
  bomLists: [],
  nomenclature: [
    { id: "nom-r1", name: "Резистор 10 кОм", article: "R-10K", type: "РЭА компоненты", package: "0402", manufacturer: "Yageo" },
    { id: "nom-mech", name: "Корпус", article: "CASE", type: "Механика", package: "" },
  ],
  specifications: [{
    id: "spec-1",
    bomListA: "",
    bomQtyA: 0,
    bomListB: "",
    bomQtyB: 0,
    structureItems: [],
  }],
};
const ui = { activeBomId: "", activeProjectId: "spec-1" };
const owner = createBoardsCommandOwner({
  getDirectoryState: () => directory,
  setDirectoryState: (next) => { directory = next; },
  getUi: () => ui,
  apply: (next) => next,
  persist: () => { persisted += 1; return true; },
  makeId: (prefix) => `${prefix}-${++sequence}`,
  now: () => "2026-07-22T12:00:00.000Z",
});

const created = owner.execute({
  type: "save",
  payload: { isNew: true, name: "Контроллер", boardCode: "PCB-001", resultItem: "Плата контроллера" },
});
assert.equal(created.ok, true);
assert.equal(created.isNew, true);
assert.equal(directory.bomLists.length, 1);
assert.equal(directory.nomenclature.at(-1).sourceBomResultId, created.id);
assert.equal(ui.activeBomId, created.id);
assert.equal(ui.activeProjectId, "");

directory.specifications[0] = {
  ...directory.specifications[0],
  bomListA: created.id,
  bomQtyA: 2,
  structureItems: [{ id: "line-1", bomListId: created.id }],
};

const initialRows = [];
const add = owner.execute({
  type: "add-bom-nomenclature-row",
  payload: { bomId: created.id, nomenclatureId: "nom-r1", expectedRows: initialRows },
});
assert.deepEqual([add.ok, add.rowCount], [true, 1]);
let board = directory.bomLists[0];
assert.deepEqual(board.importRows[0].values, [1, "Резистор 10 кОм", "", "R-10K", "Yageo", "0402", 1, "Добавлено из номенклатуры", ""]);
assert.equal(board.c0402, 1);

const staleAdd = owner.execute({
  type: "add-bom-nomenclature-row",
  payload: { bomId: created.id, nomenclatureId: "nom-r1", expectedRows: [] },
});
assert.equal(staleAdd.code, "same-row-conflict");
assert.equal(directory.bomLists[0].importRows.length, 1);

const invalidType = owner.execute({
  type: "add-bom-nomenclature-row",
  payload: { bomId: created.id, nomenclatureId: "nom-mech", expectedRows: board.importRows.map((row) => row.values) },
});
assert.equal(invalidType.code, "invalid-type");

const beforeCell = [...directory.bomLists[0].importRows[0].values];
const updatedCell = owner.execute({
  type: "update-bom-cell",
  payload: { bomId: created.id, rowIndex: 0, columnIndex: 2, value: "R1", expectedValues: beforeCell },
});
assert.equal(updatedCell.ok, true);
assert.equal(directory.bomLists[0].importRows[0].designator, "R1");

const beforeQuantity = [...directory.bomLists[0].importRows[0].values];
const updatedQuantity = owner.execute({
  type: "update-bom-quantity",
  payload: { bomId: created.id, rowIndex: 0, quantity: 7, expectedValues: beforeQuantity },
});
assert.deepEqual([updatedQuantity.ok, updatedQuantity.quantity, directory.bomLists[0].c0402], [true, 7, 7]);

const staleQuantity = owner.execute({
  type: "update-bom-quantity",
  payload: { bomId: created.id, rowIndex: 0, quantity: 8, expectedValues: beforeQuantity },
});
assert.equal(staleQuantity.code, "same-row-conflict");
assert.equal(directory.bomLists[0].importRows[0].quantity, 7);

const currentRows = directory.bomLists[0].importRows.map((row) => row.values);
const deletedRow = owner.execute({
  type: "delete-bom-row",
  payload: { bomId: created.id, rowIndex: 0, expectedRows: currentRows },
});
assert.deepEqual([deletedRow.ok, deletedRow.remainingRows, directory.bomLists[0].c0402], [true, 0, 0]);
assert.ok(directory.nomenclature.some((item) => item.id === "nom-r1"), "row deletion must not delete shared nomenclature");

const delegated = owner.execute({ type: "import-bom-xlsx", payload: {} });
assert.deepEqual([delegated.ok, delegated.code, delegated.delegated], [false, "delegated-import", true]);

const deletedBoard = owner.execute({ type: "delete", payload: { bomId: created.id } });
assert.equal(deletedBoard.ok, true);
assert.equal(deletedBoard.usage.specificationsCount, 1);
assert.equal(directory.bomLists.length, 0);
assert.deepEqual(
  [directory.specifications[0].bomListA, directory.specifications[0].bomQtyA, directory.specifications[0].structureItems[0].bomListId],
  ["", 0, ""],
);
assert.equal(ui.activeBomId, "");
assert.equal(persisted, 6);

const beforeRejected = directory;
const rejectingOwner = createBoardsCommandOwner({
  getDirectoryState: () => directory,
  setDirectoryState: (next) => { directory = next; },
  getUi: () => ui,
  apply: (next) => next,
  persist: () => false,
  makeId: () => "bom-rejected",
});
const rejected = rejectingOwner.execute({ type: "save", payload: { isNew: true, name: "Не сохранено" } });
assert.equal(rejected.code, "persist-rejected");
assert.equal(directory, beforeRejected, "failed persistence must restore the previous projection");

const source = await readFile(new URL("../src/modules/nomenclature/boards_command_owner.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /products\/render\.js|ensureNomenclatureRenderModule|saveBomCommand|deleteBomCommand/);
assert.doesNotMatch(source, /\bfetch\s*\(/);

console.log("Nomenclature Boards command owner QA: OK");
console.log("- board save/delete and specification unlink: pass");
console.log("- BOM row add/edit/quantity/delete with conflict checks: pass");
console.log("- XLSX delegation and Products compatibility-runtime isolation: pass");
