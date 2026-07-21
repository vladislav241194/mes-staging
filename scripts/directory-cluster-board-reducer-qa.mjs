import assert from "node:assert/strict";

import {
  DIRECTORY_CLUSTER_BOARD_REDUCER_CONTRACT,
  applyBoardCommand,
  fingerprintDirectoryBaseline,
  inspectBoardDeleteImpact,
  inspectBomComponentSync,
  normalizeBoardName,
} from "./directory-cluster-board-reducer.mjs";

const NOW = "2026-07-21T03:04:05.000Z";
const clone = (value) => structuredClone(value);
const apply = (directory, command) => applyBoardCommand(directory, command, { now: NOW });

const HEADERS = [
  "Порядковый номер",
  "Описание",
  "Обозначение",
  "Артикул производителя",
  "Производитель",
  "Корпус",
  "Количество",
  "Примечание",
  "Дополнительно",
];

function deepMarker(depth = 24) {
  const root = { marker: "legacy-hidden" };
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    cursor.child = { index, preserved: true };
    cursor = cursor.child;
  }
  return root;
}

function fixture() {
  return {
    topLevelHidden: { owner: "legacy", deep: deepMarker() },
    operationMap: [{ id: "op-a", hidden: { byteStable: true } }],
    nomenclatureTypes: [
      { id: "type-rea", name: "РЭА компоненты", hidden: { preserve: true } },
      { id: "type-pcb", name: "Печатные платы", hidden: { preserve: true } },
    ],
    nomenclature: [
      {
        id: "nom-board-a",
        name: "Печатная плата A-01",
        article: "A-01",
        type: "Печатные платы",
        package: "PCB-special",
        unit: "шт.",
        status: "Активен",
        sourceBomResultId: "board-a",
        sourceBomIds: ["board-a"],
        hidden: { resultOwner: "legacy", revision: 7 },
      },
      {
        id: "nom-r1",
        name: "Резистор 10 кОм",
        article: "RC0603FR-0710KL",
        manufacturer: "Yageo",
        package: "0603",
        type: "РЭА компоненты",
        sourceBomIds: ["board-a"],
        hidden: { catalogRevision: 11 },
      },
      {
        id: "nom-c1",
        name: "Конденсатор 1 мкФ",
        article: "CL10A105KB8NNNC",
        manufacturer: "Samsung",
        package: "0603",
        type: "РЭА компоненты",
        sourceBomIds: ["board-a", "board-b"],
        hidden: { importedOnce: true },
      },
      {
        id: "nom-board-b",
        name: "Печатная плата B-02",
        article: "B-02",
        type: "Печатные платы",
        sourceBomResultId: "board-b",
        sourceBomIds: ["board-b"],
        hidden: { preserve: "board-b-result" },
      },
      {
        id: "nom-standalone",
        name: "Самостоятельная складская плата",
        article: "STANDALONE",
        type: "Печатные платы",
        hidden: { mustNeverDelete: true },
      },
    ],
    bomLists: [
      {
        id: "board-a",
        name: "Плата A",
        boardCode: "A-01",
        resultItem: "Печатная плата A-01",
        status: "Активен",
        importHeaders: [...HEADERS],
        importRows: [
          {
            nomenclatureId: "nom-r1",
            values: [1, "Резистор 10 кОм", "R1", "RC0603FR-0710KL", "Yageo", "0603", 1, "Первый", "A-hidden"],
            hidden: { rowOwner: "legacy", order: 1 },
          },
          [2, "Конденсатор 1 мкФ", "C1", "CL10A105KB8NNNC", "Samsung", "0603", 2, "Второй", "I-value"],
        ],
        importedAt: "2026-07-01T00:00:00.000Z",
        sourceFileName: "board-a.xlsx",
        sourceSheetName: "Лист1",
        updatedAt: "2026-07-01T00:00:00.000Z",
        c0402: 0,
        c0603: 3,
        c0805: 0,
        csot23: 0,
        csoic: 0,
        cqfn: 0,
        cbga: 0,
        cconnector: 0,
        hidden: { boardOwner: "legacy", deep: deepMarker(12) },
      },
      {
        id: "board-b",
        name: "Плата B",
        boardCode: "B-02",
        resultItem: "Печатная плата B-02",
        status: "Черновик",
        importHeaders: [],
        importRows: [],
        hidden: { preserve: "board-b" },
      },
    ],
    specifications: [
      {
        id: "spec-a",
        name: "Изделие A",
        bomListA: "board-a",
        bomListB: "board-b",
        structureItems: [
          { id: "structure-a", type: "bom", bomListId: "board-a", hidden: { keep: 1 } },
          { id: "structure-b", type: "bom", bomListId: "board-b", hidden: { keep: 2 } },
        ],
        hidden: { specOwner: "legacy-a" },
      },
      {
        id: "spec-b",
        name: "Изделие B",
        bomListA: "",
        bomListB: "board-a",
        hidden: { specOwner: "legacy-b" },
      },
      {
        id: "spec-c",
        name: "Изделие без платы",
        hidden: { structureMustStayMissing: true },
      },
    ],
    statuses: [{ id: "status-a", hidden: { untouched: true } }],
  };
}

function assertInputStable(directory, before, message) {
  assert.equal(JSON.stringify(directory), before, message);
}

function failStable(directory, command, expectedCode) {
  const before = JSON.stringify(directory);
  const result = apply(directory, command);
  assert.equal(result.ok, false, `${expectedCode} must fail`);
  assert.equal(result.code, expectedCode);
  assert.equal(Object.hasOwn(result, "directory"), false, "A failed reducer result must not expose a candidate Directory");
  assertInputStable(directory, before, `${expectedCode} must leave the complete input byte-stable`);
  return result;
}

function componentSyncFor(directory, { boardId, boardName, rows, idPrefix = "nom-component-qa" }) {
  const inspected = inspectBomComponentSync(directory, { boardId, boardName, rows });
  assert.equal(inspected.ok, true, `Component plan inspection failed: ${JSON.stringify(inspected)}`);
  return {
    upserts: inspected.upserts.map((entry, index) => ({
      identityKey: entry.identityKey,
      itemId: entry.itemId || `${idPrefix}-${index + 1}`,
      expectedRow: clone(entry.expectedRow),
    })),
    detaches: inspected.detaches.map((entry) => ({ itemId: entry.itemId, expectedRow: clone(entry.expectedRow) })),
  };
}

assert.deepEqual(DIRECTORY_CLUSTER_BOARD_REDUCER_CONTRACT.requiredDirectoryArrays, [
  "nomenclatureTypes",
  "nomenclature",
  "bomLists",
  "specifications",
]);
assert.deepEqual(DIRECTORY_CLUSTER_BOARD_REDUCER_CONTRACT.bomCells, ["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
assert.equal(DIRECTORY_CLUSTER_BOARD_REDUCER_CONTRACT.concurrency.import, "exact full Directory fingerprint; allowRebase must be false");
assert.equal(normalizeBoardName("  Плата\t управления  "), "Плата управления");

{
  const directory = fixture();
  const first = fingerprintDirectoryBaseline(directory);
  const second = fingerprintDirectoryBaseline(directory);
  assert.equal(first.ok, true);
  assert.match(first.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(first.fingerprint, second.fingerprint, "The exact Directory fingerprint must be deterministic");
  const changed = clone(directory);
  changed.topLevelHidden.owner = "concurrent";
  assert.notEqual(fingerprintDirectoryBaseline(changed).fingerprint, first.fingerprint, "Even unrelated exact baseline changes must invalidate import");
}

{
  const directory = fixture();
  const before = JSON.stringify(directory);
  const result = apply(directory, {
    kind: "board-create",
    boardId: "board-new",
    row: {
      id: "board-new",
      name: "  Плата управления  ",
      boardCode: "CTRL-03",
      resultItem: "Печатная плата CTRL-03",
      hidden: { createdBy: "qa", nested: deepMarker(8) },
    },
    expectedResultRow: null,
    resultItemId: "nom-board-new",
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.name, "Плата управления");
  assert.deepEqual(result.directory.bomLists.map((row) => row.id), ["board-a", "board-b", "board-new"]);
  assert.deepEqual(result.directory.nomenclature.map((row) => row.id), [
    "nom-board-a",
    "nom-r1",
    "nom-c1",
    "nom-board-b",
    "nom-standalone",
    "nom-board-new",
  ]);
  assert.equal(result.resultRow.sourceBomResultId, "board-new");
  assert.deepEqual(result.resultRow.sourceBomIds, ["board-new"]);
  assert.equal(result.resultRow.type, "Печатные платы");
  assert.equal(result.resultRow.updatedAt, NOW);
  assert.deepEqual(result.counts, {
    boardRowsCreated: 1,
    boardRowsUpdated: 0,
    boardRowsDeleted: 0,
    bomRowsAdded: 0,
    bomRowsUpdated: 0,
    bomRowsDeleted: 0,
    bomRowsImported: 0,
    resultRowsCreated: 1,
    resultRowsUpdated: 0,
    resultRowsDetached: 0,
    componentRowsCreated: 0,
    componentRowsUpdated: 0,
    componentRowsDetached: 0,
    componentSourceRefsAdded: 0,
    componentSourceRefsRemoved: 0,
    specificationFieldsCleared: 0,
    specificationStructureRefsCleared: 0,
    nomenclatureBoardRefsCleared: 0,
    totalChanges: 2,
  });
  assert.equal(JSON.stringify(result.directory.topLevelHidden), JSON.stringify(directory.topLevelHidden));
  assert.equal(JSON.stringify(result.directory.specifications), JSON.stringify(directory.specifications));
  assertInputStable(directory, before, "Board create must not mutate its Directory input");
}

{
  const directory = fixture();
  directory.nomenclature.push({
    id: "nom-preexisting-result",
    name: "Печатная плата PRE-01",
    article: "PRE-01",
    type: "Печатные платы",
    hidden: { standaloneBeforeBoardCreate: true },
  });
  const expectedResultRow = clone(directory.nomenclature.at(-1));
  const result = apply(directory, {
    kind: "board-create",
    boardId: "board-preexisting-result",
    row: {
      id: "board-preexisting-result",
      name: "Плата с готовой позицией",
      boardCode: "PRE-01",
      resultItem: "Печатная плата PRE-01",
    },
    expectedResultRow,
    resultItemId: "nom-preexisting-result",
  });
  assert.equal(result.ok, true);
  assert.equal(result.counts.resultRowsCreated, 0);
  assert.equal(result.counts.resultRowsUpdated, 1);
  assert.equal(result.directory.nomenclature.length, directory.nomenclature.length, "Exact fallback result sync must not create a duplicate row");
  assert.equal(result.resultRow.sourceBomResultId, "board-preexisting-result");
  assert.deepEqual(result.resultRow.hidden, expectedResultRow.hidden);
}

{
  const directory = fixture();
  failStable(directory, {
    kind: "board-create",
    boardId: "board-a",
    row: { id: "board-a", name: "Another" },
    expectedResultRow: null,
    resultItemId: "nom-new",
  }, "duplicate-board-id");
  failStable(directory, {
    kind: "board-create",
    boardId: "board-new",
    row: { id: "board-new", name: "  ПЛАТА   b  ", boardCode: "NEW" },
    expectedResultRow: null,
    resultItemId: "nom-new",
  }, "duplicate-board-name");
  failStable(directory, {
    kind: "board-create",
    boardId: "board-new",
    row: { id: "board-new", name: "New", boardCode: "NEW", importRows: [[1, "forbidden"]] },
    expectedResultRow: null,
    resultItemId: "nom-new",
  }, "board-bom-owned-separately");
  failStable(directory, {
    kind: "board-create",
    boardId: "board-source-spoof",
    row: { id: "board-source-spoof", name: "Source spoof", sourceFileName: "fake.xlsx" },
    expectedResultRow: null,
    resultItemId: "nom-source-spoof",
  }, "board-bom-owned-separately");
  for (const [field, invalidValue] of [
    ["importRows", {}],
    ["importRows", "not-an-array"],
    ["importRows", null],
    ["importHeaders", {}],
    ["importedAt", {}],
    ["sourceFileName", 123],
    ["sourceSheetName", []],
  ]) {
    const malformedCommand = {
      kind: "board-create",
      boardId: `board-malformed-${field}`,
      row: { id: `board-malformed-${field}`, name: `Malformed ${field}`, [field]: invalidValue },
      expectedResultRow: null,
      resultItemId: `nom-malformed-${field}`,
    };
    assert.doesNotThrow(() => apply(directory, malformedCommand), `${field} malformed JSON input must return a structured error, not throw`);
    failStable(directory, malformedCommand, "board-bom-shape-invalid");
  }
  failStable(directory, {
    kind: "board-create",
    boardId: "board-new",
    row: { id: "board-new", name: "New", boardCode: "NEW", resultItem: "Самостоятельная складская плата" },
    expectedResultRow: null,
    resultItemId: "nom-new",
  }, "result-row-conflict");
  failStable(directory, {
    kind: "board-create",
    boardId: "board-result-takeover",
    row: { id: "board-result-takeover", name: "Попытка перехвата", boardCode: "B-02", resultItem: "Печатная плата B-02" },
    expectedResultRow: clone(directory.nomenclature[3]),
    resultItemId: "nom-board-b",
  }, "result-row-owned-by-another-board");
}

{
  const directory = fixture();
  const expectedBoard = clone(directory.bomLists[0]);
  const expectedResultRow = clone(directory.nomenclature[0]);
  const before = JSON.stringify(directory);
  const result = apply(directory, {
    kind: "board-update",
    boardId: "board-a",
    expectedBoard,
    row: {
      id: "board-a",
      name: " Плата A rev.2 ",
      boardCode: "A-02",
      resultItem: "Печатная плата A-02",
      status: "Активен",
      c0603: 999,
    },
    expectedResultRow,
    resultItemId: "nom-board-a",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.directory.bomLists.map((row) => row.id), ["board-a", "board-b"], "Metadata update must preserve Board ordering");
  assert.deepEqual(result.directory.nomenclature.map((row) => row.id), directory.nomenclature.map((row) => row.id), "Result sync must preserve Nomenclature ordering");
  assert.equal(result.row.name, "Плата A rev.2");
  assert.equal(result.row.boardCode, "A-02");
  assert.equal(result.row.c0603, 3, "Metadata save must recompute derived component counts from the unchanged BOM");
  assert.deepEqual(result.row.hidden, expectedBoard.hidden, "Hidden Board fields must survive metadata save");
  assert.deepEqual(result.row.importRows, expectedBoard.importRows, "Metadata save must leave the complete BOM byte-equivalent");
  assert.deepEqual(result.resultRow.hidden, expectedResultRow.hidden, "Hidden result-row fields must survive sync");
  assert.equal(result.resultRow.name, "Печатная плата A-02");
  assert.equal(result.resultRow.article, "A-02");
  assert.equal(result.resultRow.package, "PCB-special");
  assert.equal(result.resultRow.sourceBomResultId, "board-a");
  assert.deepEqual(result.counts, {
    boardRowsCreated: 0,
    boardRowsUpdated: 1,
    boardRowsDeleted: 0,
    bomRowsAdded: 0,
    bomRowsUpdated: 0,
    bomRowsDeleted: 0,
    bomRowsImported: 0,
    resultRowsCreated: 0,
    resultRowsUpdated: 1,
    resultRowsDetached: 0,
    componentRowsCreated: 0,
    componentRowsUpdated: 0,
    componentRowsDetached: 0,
    componentSourceRefsAdded: 0,
    componentSourceRefsRemoved: 0,
    specificationFieldsCleared: 0,
    specificationStructureRefsCleared: 0,
    nomenclatureBoardRefsCleared: 0,
    totalChanges: 2,
  });
  assert.equal(JSON.stringify(result.directory.bomLists[1]), JSON.stringify(directory.bomLists[1]));
  assert.equal(JSON.stringify(result.directory.nomenclature[1]), JSON.stringify(directory.nomenclature[1]));
  assert.equal(JSON.stringify(result.directory.specifications), JSON.stringify(directory.specifications));
  assertInputStable(directory, before, "Atomic Board/result update must not mutate input");
}

{
  const directory = fixture();
  const result = apply(directory, {
    kind: "board-update",
    boardId: "board-b",
    expectedBoard: clone(directory.bomLists[1]),
    row: { id: "board-b", name: "Плата B", c0603: 999 },
    expectedResultRow: clone(directory.nomenclature[3]),
    resultItemId: "nom-board-b",
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.c0603, 0, "An empty BOM must derive every component counter as zero, never trust metadata input");
  assert.deepEqual(
    [result.row.c0402, result.row.c0603, result.row.c0805, result.row.csot23, result.row.csoic, result.row.cqfn, result.row.cbga, result.row.cconnector],
    [0, 0, 0, 0, 0, 0, 0, 0],
  );
  failStable(directory, {
    kind: "board-update",
    boardId: "board-b",
    expectedBoard: clone(directory.bomLists[1]),
    row: { id: "board-b", name: "Плата B", sourceFileName: "fake-import.xlsx" },
    expectedResultRow: clone(directory.nomenclature[3]),
    resultItemId: "nom-board-b",
  }, "board-bom-owned-separately");
}

{
  const directory = fixture();
  const base = {
    kind: "board-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    row: { id: "board-a", name: "Плата A2", boardCode: "A2", resultItem: "Печатная плата A2" },
    expectedResultRow: clone(directory.nomenclature[0]),
    resultItemId: "nom-board-a",
  };
  failStable(directory, { ...base, expectedBoard: { ...base.expectedBoard, hidden: { stale: true } } }, "board-row-conflict");
  failStable(directory, { ...base, expectedResultRow: { ...base.expectedResultRow, hidden: { stale: true } } }, "result-row-conflict");
  failStable(directory, { ...base, resultItemId: "nom-wrong" }, "result-item-id-conflict");
  failStable(directory, { ...base, row: { ...base.row, importRows: [] } }, "board-bom-owned-separately");
  failStable(directory, {
    ...base,
    row: { ...base.row, resultItem: "Самостоятельная складская плата" },
  }, "duplicate-result-name");

  const ambiguous = clone(directory);
  ambiguous.nomenclature.push({
    id: "nom-board-a-duplicate",
    name: "Печатная плата A-01",
    article: "A-01",
    type: "Печатные платы",
    hidden: { ambiguous: true },
  });
  failStable(ambiguous, base, "ambiguous-board-result");

  const becomesAmbiguous = clone(directory);
  becomesAmbiguous.nomenclature.push({
    id: "nom-pcb-same-future-article",
    name: "Другая печатная плата",
    article: "FUTURE-ARTICLE",
    type: "Печатные платы",
  });
  failStable(becomesAmbiguous, {
    ...base,
    expectedBoard: clone(becomesAmbiguous.bomLists[0]),
    expectedResultRow: clone(becomesAmbiguous.nomenclature[0]),
    row: {
      id: "board-a",
      name: "Плата после изменения",
      boardCode: "FUTURE-ARTICLE",
      resultItem: "Новый уникальный результат платы",
    },
  }, "ambiguous-board-result");
}

{
  const directory = fixture();
  const before = JSON.stringify(directory);
  const addedRow = {
    nomenclatureId: "nom-c1",
    values: [3, "Конденсатор 1 мкФ", "", "CL10A105KB8NNNC", "Samsung", "0603", 1, "Добавлено из номенклатуры", ""],
  };
  const nextRows = [...directory.bomLists[0].importRows, addedRow];
  const result = apply(directory, {
    kind: "bom-row-add",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    sourceNomenclatureId: "nom-c1",
    expectedSourceNomenclature: clone(directory.nomenclature[2]),
    componentSync: componentSyncFor(directory, {
      boardId: "board-a",
      boardName: "Плата A",
      rows: nextRows,
      idPrefix: "nom-add",
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.importRows.length, 3);
  assert.deepEqual(result.bomRow, addedRow);
  assert.equal(result.row.importRows[0].hidden.rowOwner, "legacy");
  assert.equal(result.row.c0603, 4);
  assert.deepEqual(result.directory.nomenclature.map((row) => row.id), directory.nomenclature.map((row) => row.id), "Catalog add must reuse exact component rows without duplicates");
  assert.equal(result.directory.nomenclature[1].updatedAt, NOW);
  assert.equal(result.directory.nomenclature[2].updatedAt, NOW);
  assert.deepEqual(result.directory.nomenclature[1].hidden, directory.nomenclature[1].hidden);
  assert.deepEqual(result.directory.nomenclature[2].hidden, directory.nomenclature[2].hidden);
  assert.equal(JSON.stringify(result.directory.bomLists[1]), JSON.stringify(directory.bomLists[1]));
  assert.equal(result.counts.bomRowsAdded, 1);
  assert.equal(result.counts.boardRowsUpdated, 1);
  assert.equal(result.counts.componentRowsUpdated, 2);
  assert.equal(result.counts.componentRowsCreated, 0);
  assertInputStable(directory, before, "Catalog add must be input-pure");
}

{
  const directory = fixture();
  const addedRow = {
    nomenclatureId: "nom-r1",
    values: [3, "Резистор 10 кОм", "", "RC0603FR-0710KL", "Yageo", "0603", 1, "Добавлено из номенклатуры", ""],
  };
  const base = {
    kind: "bom-row-add",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    sourceNomenclatureId: "nom-r1",
    expectedSourceNomenclature: clone(directory.nomenclature[1]),
    componentSync: componentSyncFor(directory, {
      boardId: "board-a",
      boardName: "Плата A",
      rows: [...directory.bomLists[0].importRows, addedRow],
      idPrefix: "nom-add-failure",
    }),
  };
  failStable(directory, { ...base, expectedBoard: { ...base.expectedBoard, status: "Concurrent" } }, "board-row-conflict");
  failStable(directory, { ...base, expectedSourceNomenclature: { ...base.expectedSourceNomenclature, article: "STALE" } }, "source-nomenclature-conflict");
  failStable(directory, {
    ...base,
    sourceNomenclatureId: "nom-standalone",
    expectedSourceNomenclature: clone(directory.nomenclature[4]),
  }, "source-nomenclature-type-invalid");
}

{
  const cellValues = ["A-new", "B-new", "C-new", "D-new", "E-new", "F-new", 17, "H-new", "I-new"];
  for (let columnIndex = 0; columnIndex < 9; columnIndex += 1) {
    const directory = fixture();
    const before = JSON.stringify(directory);
    const originalRow = clone(directory.bomLists[0].importRows[0]);
    const nextRows = clone(directory.bomLists[0].importRows);
    nextRows[0].values[columnIndex] = cellValues[columnIndex];
    const result = apply(directory, {
      kind: "bom-row-update",
      boardId: "board-a",
      expectedBoard: clone(directory.bomLists[0]),
      rowIndex: 0,
      columnIndex,
      value: cellValues[columnIndex],
      componentSync: componentSyncFor(directory, {
        boardId: "board-a",
        boardName: "Плата A",
        rows: nextRows,
        idPrefix: `nom-cell-${columnIndex}`,
      }),
    });
    assert.equal(result.ok, true, `A:I column ${columnIndex} update must succeed`);
    assert.equal(result.bomRow.values[columnIndex], cellValues[columnIndex]);
    assert.equal(result.bomRow.values.length, 9);
    assert.deepEqual(result.bomRow.hidden, originalRow.hidden, `A:I column ${columnIndex} must preserve hidden row fields`);
    const unchangedIndexes = [...Array(9).keys()].filter((index) => index !== columnIndex);
    for (const index of unchangedIndexes) {
      assert.equal(result.bomRow.values[index], originalRow.values[index], `A:I column ${columnIndex} must preserve cell ${index}`);
    }
    assert.equal(JSON.stringify(result.row.importRows[1]), JSON.stringify(directory.bomLists[0].importRows[1]), "Point edit must preserve row order and unrelated rows byte-for-byte");
    assert.equal(result.directory.nomenclature.some((row) => row.id === "nom-board-a"), true, "Point edit must retain the Board result row");
    assert.equal(result.directory.nomenclature.some((row) => row.id === "nom-standalone"), true, "Point edit must retain standalone Nomenclature");
    assert.equal(result.counts.componentRowsUpdated >= 1, true);
    if (columnIndex === 3) {
      assert.equal(result.counts.componentRowsCreated, 1, "Article identity change must create the command-planned component row");
      assert.equal(result.counts.componentRowsDetached, 1, "Article identity change must detach the old component source");
      assert.equal(result.row.importRows[0].nomenclatureId, "nom-cell-3-1");
      assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-r1").sourceBomIds.includes("board-a"), false);
    }
    assertInputStable(directory, before, `A:I column ${columnIndex} edit must not mutate input`);
  }
}

{
  const directory = fixture();
  const nextRows = clone(directory.bomLists[0].importRows);
  nextRows[1][8] = "array-row-I-updated";
  const result = apply(directory, {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    rowIndex: 1,
    columnIndex: 8,
    value: "array-row-I-updated",
    componentSync: componentSyncFor(directory, {
      boardId: "board-a",
      boardName: "Плата A",
      rows: nextRows,
      idPrefix: "nom-array-cell",
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.bomRow), true, "Legacy array BOM rows must retain their representation");
  assert.equal(result.bomRow[8], "array-row-I-updated");
  failStable(directory, {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    rowIndex: 0,
    columnIndex: 9,
    value: "out-of-range",
  }, "bom-column-invalid");
}

{
  const directory = fixture();
  directory.bomLists[0].importRows[0].values[7] = null;
  const nextRows = clone(directory.bomLists[0].importRows);
  nextRows[0].values[8] = "I-after-null-H";
  const result = apply(directory, {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    rowIndex: 0,
    columnIndex: 8,
    value: "I-after-null-H",
    componentSync: componentSyncFor(directory, {
      boardId: "board-a",
      boardName: "Плата A",
      rows: nextRows,
      idPrefix: "nom-null-cell",
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.importRows[0].values[7], null, "Point edit must preserve an untouched JSON null A:I cell exactly");
}

{
  const directory = fixture();
  const before = JSON.stringify(directory);
  const remainingRows = directory.bomLists[0].importRows.slice(1);
  const result = apply(directory, {
    kind: "bom-row-delete",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    rowIndex: 0,
    componentSync: componentSyncFor(directory, {
      boardId: "board-a",
      boardName: "Плата A",
      rows: remainingRows,
      idPrefix: "nom-delete-row",
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.importRows.length, 1);
  assert.equal(Array.isArray(result.row.importRows[0]), true);
  assert.equal(result.row.importRows[0][2], "C1");
  assert.equal(result.counts.bomRowsDeleted, 1);
  assert.equal(result.counts.boardRowsUpdated, 1);
  assert.deepEqual(result.directory.nomenclature.map((row) => row.id), directory.nomenclature.map((row) => row.id), "BOM row delete must never delete standalone Nomenclature");
  assert.deepEqual(result.directory.nomenclature.find((row) => row.id === "nom-r1").sourceBomIds, []);
  assert.deepEqual(result.directory.nomenclature.find((row) => row.id === "nom-r1").hidden, directory.nomenclature[1].hidden);
  assert.equal(result.counts.componentRowsDetached, 1);
  assert.equal(result.counts.componentSourceRefsRemoved, 1);
  assertInputStable(directory, before, "BOM row delete must not mutate input");
}

{
  const directory = fixture();
  const baseline = fingerprintDirectoryBaseline(directory).fingerprint;
  const before = JSON.stringify(directory);
  const rows = [
    { values: [1, "Imported R", "R10", "R-10", "Vendor", "0402", 3, null, "I-1"], hidden: { parser: "bounded" } },
    [2, "Imported IC", "U1", "IC-1", "Vendor", "QFN-32", 1, "H-2", "I-2"],
  ];
  const componentSync = componentSyncFor(directory, {
    boardId: "board-import",
    boardName: "Импортированная плата",
    rows,
    idPrefix: "nom-imported-component",
  });
  const result = apply(directory, {
    kind: "bom-import",
    boardId: "board-import",
    row: {
      id: "board-import",
      name: "Импортированная плата",
      boardCode: "IMP-01",
      resultItem: "Печатная плата IMP-01",
      sourceFileName: "import.xlsx",
      sourceSheetName: "BOM",
      hidden: { parserBoundary: "already parsed" },
    },
    headers: HEADERS,
    rows,
    expectedResultRow: null,
    resultItemId: "nom-board-import",
    expectedDirectoryFingerprint: baseline,
    allowRebase: false,
    componentSync,
  });
  assert.equal(result.ok, true);
  assert.equal(result.rebased, false);
  assert.equal(result.rebaseAllowed, false);
  assert.equal(result.baseDirectoryFingerprint, baseline);
  assert.deepEqual(result.row.importHeaders, HEADERS);
  assert.equal(result.row.importRows.length, 2);
  assert.deepEqual(result.row.importRows[0].values, rows[0].values, "All nine parsed object-row A:I cells must survive import");
  assert.deepEqual(result.row.importRows[0].hidden, rows[0].hidden);
  assert.deepEqual(result.row.importRows[1], rows[1], "All nine parsed array-row A:I cells must survive import");
  assert.equal(result.row.c0402, 3);
  assert.equal(result.row.cqfn, 1);
  assert.equal(result.counts.bomRowsImported, 2);
  assert.equal(result.counts.boardRowsCreated, 1);
  assert.equal(result.counts.resultRowsCreated, 1);
  assert.equal(result.counts.componentRowsCreated, 2);
  assert.equal(result.counts.componentSourceRefsAdded, 2);
  assert.equal(result.resultRow.sourceBomResultId, "board-import");
  assert.deepEqual(result.directory.nomenclature.slice(-3).map((row) => row.id), [
    "nom-imported-component-1",
    "nom-imported-component-2",
    "nom-board-import",
  ]);
  assert.deepEqual(result.directory.nomenclature.at(-3).sourceBomIds, ["board-import"]);
  assert.equal(result.directory.nomenclature.at(-3).hidden, undefined, "BOM parser-only hidden fields must stay on the BOM row, not leak into Nomenclature");
  assert.equal(JSON.stringify(result.directory.topLevelHidden), JSON.stringify(directory.topLevelHidden));
  assert.equal(JSON.stringify(result.directory.bomLists.slice(0, 2)), JSON.stringify(directory.bomLists));
  assertInputStable(directory, before, "Parsed import must not mutate its exact global baseline");
}

{
  const directory = fixture();
  const rows = [
    ["", "", "", "", "", "", "", "", ""],
    ["Раздел", "", "", "", "Vendor-only-is-not-identity", "0603", 100, "Разделитель", ""],
  ];
  const inspected = inspectBomComponentSync(directory, {
    boardId: "board-import-separators",
    boardName: "Импорт с разделителями",
    rows,
  });
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.upserts, []);
  assert.deepEqual(inspected.skippedRowIndexes, [0, 1], "Blank and separator rows must remain BOM-only rows, not create polluted Nomenclature cards");
  const result = apply(directory, {
    kind: "bom-import",
    boardId: "board-import-separators",
    row: {
      id: "board-import-separators",
      name: "Импорт с разделителями",
      boardCode: "SEP-01",
      resultItem: "Печатная плата SEP-01",
    },
    headers: HEADERS,
    rows,
    expectedResultRow: null,
    resultItemId: "nom-board-import-separators",
    expectedDirectoryFingerprint: fingerprintDirectoryBaseline(directory).fingerprint,
    allowRebase: false,
    componentSync: { upserts: [], detaches: [] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.counts.componentRowsCreated, 0);
  assert.equal(result.row.c0603, 0, "BOM-only separator quantities must not inflate derived component counters");
  assert.equal(result.directory.nomenclature.length, directory.nomenclature.length + 1, "Separator-only import may add only the Board result row");
  assert.deepEqual(result.row.importRows, rows, "BOM-only separator rows and all nine cells must stay intact");
}

{
  const directory = fixture();
  const baseline = fingerprintDirectoryBaseline(directory).fingerprint;
  const rows = [
    [1, "Display text may differ", "R20", "RC0603FR-0710KL", "Another display", "0805", 5, "Existing article wins", ""],
    [2, "Конденсатор 1 мкФ", "C20", "", "Samsung", "0603", 2, "Tuple fallback", ""],
  ];
  const componentSync = componentSyncFor(directory, {
    boardId: "board-import-existing",
    boardName: "Импорт существующих компонентов",
    rows,
    idPrefix: "must-not-be-used",
  });
  assert.deepEqual(componentSync.upserts.map((entry) => entry.itemId), ["nom-r1", "nom-c1"], "Component plan must use article first and name/package/manufacturer tuple second");
  const result = apply(directory, {
    kind: "bom-import",
    boardId: "board-import-existing",
    row: {
      id: "board-import-existing",
      name: "Импорт существующих компонентов",
      boardCode: "EXISTING-01",
      resultItem: "Печатная плата EXISTING-01",
    },
    headers: HEADERS,
    rows,
    expectedResultRow: null,
    resultItemId: "nom-board-import-existing",
    expectedDirectoryFingerprint: baseline,
    allowRebase: false,
    componentSync,
  });
  assert.equal(result.ok, true);
  assert.equal(result.counts.componentRowsCreated, 0);
  assert.equal(result.counts.componentRowsUpdated, 2);
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-r1").name, "Резистор 10 кОм", "Existing non-empty component metadata must win exactly as in legacy upsert");
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-r1").sourceBomIds.includes("board-import-existing"), true);
  assert.equal(result.directory.nomenclature.find((row) => row.id === "nom-c1").sourceBomIds.includes("board-import-existing"), true);
  assert.deepEqual(result.directory.nomenclature.find((row) => row.id === "nom-r1").hidden, directory.nomenclature[1].hidden);
}

{
  const directory = fixture();
  const nextRows = clone(directory.bomLists[0].importRows);
  nextRows[0].values[8] = "sync-required";
  const validSync = componentSyncFor(directory, {
    boardId: "board-a",
    boardName: "Плата A",
    rows: nextRows,
    idPrefix: "nom-sync-required",
  });
  const base = {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    rowIndex: 0,
    columnIndex: 8,
    value: "sync-required",
  };
  failStable(directory, base, "component-sync-required");
  const staleSync = clone(validSync);
  staleSync.upserts[0].expectedRow.hidden = { stale: true };
  failStable(directory, { ...base, componentSync: staleSync }, "component-row-conflict");
  failStable(directory, { ...base, componentSync: { ...validSync, upserts: validSync.upserts.slice(1) } }, "component-sync-plan-conflict");

  const identityChangedRows = clone(directory.bomLists[0].importRows);
  identityChangedRows[0].values[3] = "NEW-ARTICLE";
  const collisionSync = componentSyncFor(directory, {
    boardId: "board-a",
    boardName: "Плата A",
    rows: identityChangedRows,
    idPrefix: "nom-new-identity",
  });
  collisionSync.upserts.find((entry) => entry.expectedRow === null).itemId = "nom-board-b";
  failStable(directory, {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    rowIndex: 0,
    columnIndex: 3,
    value: "NEW-ARTICLE",
    componentSync: collisionSync,
  }, "duplicate-component-id");
}

{
  const ambiguous = fixture();
  ambiguous.nomenclature.push({
    id: "nom-r1-duplicate-article",
    name: "Другая карточка того же артикула",
    article: "RC0603FR-0710KL",
    manufacturer: "Other",
    package: "0603",
    type: "РЭА компоненты",
    hidden: { mustConflict: true },
  });
  failStable(ambiguous, {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(ambiguous.bomLists[0]),
    rowIndex: 0,
    columnIndex: 8,
    value: "ambiguous",
    componentSync: { upserts: [], detaches: [] },
  }, "ambiguous-component-mapping");

  const typeConflict = fixture();
  failStable(typeConflict, {
    kind: "bom-row-update",
    boardId: "board-a",
    expectedBoard: clone(typeConflict.bomLists[0]),
    rowIndex: 0,
    columnIndex: 3,
    value: "STANDALONE",
    componentSync: { upserts: [], detaches: [] },
  }, "component-nomenclature-type-conflict");
}

{
  const directory = fixture();
  const baseline = fingerprintDirectoryBaseline(directory).fingerprint;
  const command = {
    kind: "bom-import",
    boardId: "board-import",
    row: { id: "board-import", name: "Imported", boardCode: "IMP", resultItem: "Printed IMP" },
    headers: HEADERS,
    rows: [[1, "Part", "R1", "P1", "V", "0603", 1, "", ""]],
    expectedResultRow: null,
    resultItemId: "nom-board-import",
    expectedDirectoryFingerprint: baseline,
    allowRebase: false,
    componentSync: componentSyncFor(directory, {
      boardId: "board-import",
      boardName: "Imported",
      rows: [[1, "Part", "R1", "P1", "V", "0603", 1, "", ""]],
      idPrefix: "nom-import-failure",
    }),
  };
  failStable(directory, { ...command, allowRebase: true }, "bom-import-rebase-forbidden");
  failStable(directory, { ...command, expectedDirectoryFingerprint: "sha256:stale" }, "directory-baseline-conflict");
  failStable(directory, { ...command, headers: HEADERS.slice(0, 8) }, "bom-import-headers-invalid");
  failStable(directory, { ...command, rows: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]] }, "invalid-bom-row");

  const concurrent = clone(directory);
  concurrent.topLevelHidden.owner = "changed-after-parse";
  failStable(concurrent, command, "directory-baseline-conflict");
}

{
  const directory = fixture();
  const impact = inspectBoardDeleteImpact(directory, "board-a");
  assert.equal(impact.ok, true);
  assert.match(impact.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(impact.counts, {
    bomRows: 2,
    specificationRows: 2,
    specificationFields: 2,
    specificationStructureRefs: 1,
    nomenclatureRows: 3,
    nomenclatureSourceRefs: 4,
    mappedResultRows: 1,
  });
  assert.deepEqual(impact.references.specifications.map((row) => [row.specificationId, row.field]), [
    ["spec-a", "bomListA"],
    ["spec-b", "bomListB"],
  ]);
  const before = JSON.stringify(directory);
  const result = apply(directory, {
    kind: "board-delete",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    impactFingerprint: impact.fingerprint,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.directory.bomLists.map((row) => row.id), ["board-b"]);
  assert.deepEqual(result.directory.nomenclature.map((row) => row.id), directory.nomenclature.map((row) => row.id), "Board delete must retain every standalone Nomenclature row");
  assert.equal(result.directory.nomenclature[0].sourceBomResultId, "");
  assert.deepEqual(result.directory.nomenclature[0].sourceBomIds, []);
  assert.deepEqual(result.directory.nomenclature[0].hidden, directory.nomenclature[0].hidden);
  assert.deepEqual(result.directory.nomenclature[2].sourceBomIds, ["board-b"]);
  assert.equal(result.directory.specifications[0].bomListA, "");
  assert.equal(result.directory.specifications[0].bomListB, "board-b");
  assert.equal(result.directory.specifications[0].structureItems[0].bomListId, "");
  assert.equal(result.directory.specifications[0].structureItems[1].bomListId, "board-b");
  assert.equal(result.directory.specifications[1].bomListB, "");
  assert.equal(result.directory.specifications[2].structureItems, undefined, "Missing structureItems must remain missing");
  assert.deepEqual(result.retainedNomenclatureIds.sort(), ["nom-board-a", "nom-c1", "nom-r1"].sort());
  assert.deepEqual(result.counts, {
    boardRowsCreated: 0,
    boardRowsUpdated: 0,
    boardRowsDeleted: 1,
    bomRowsAdded: 0,
    bomRowsUpdated: 0,
    bomRowsDeleted: 2,
    bomRowsImported: 0,
    resultRowsCreated: 0,
    resultRowsUpdated: 0,
    resultRowsDetached: 1,
    componentRowsCreated: 0,
    componentRowsUpdated: 0,
    componentRowsDetached: 0,
    componentSourceRefsAdded: 0,
    componentSourceRefsRemoved: 0,
    specificationFieldsCleared: 2,
    specificationStructureRefsCleared: 1,
    nomenclatureBoardRefsCleared: 4,
    totalChanges: 11,
  });
  assert.equal(JSON.stringify(result.directory.bomLists[0]), JSON.stringify(directory.bomLists[1]));
  assert.equal(JSON.stringify(result.directory.statuses), JSON.stringify(directory.statuses));
  assertInputStable(directory, before, "Board delete cascade must not mutate input");
}

{
  const directory = fixture();
  const impact = inspectBoardDeleteImpact(directory, "board-a");
  const base = {
    kind: "board-delete",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    impactFingerprint: impact.fingerprint,
  };
  failStable(directory, { ...base, expectedBoard: { ...base.expectedBoard, hidden: { stale: true } } }, "board-row-conflict");
  failStable(directory, { ...base, impactFingerprint: "sha256:stale" }, "board-impact-changed");

  const changedImpact = clone(directory);
  changedImpact.specifications.push({ id: "spec-late", bomListA: "board-a", hidden: { concurrent: true } });
  failStable(changedImpact, base, "board-impact-changed");

  const changedHiddenImpact = clone(directory);
  changedHiddenImpact.specifications[0].hidden.specOwner = "concurrent-hidden-change";
  failStable(changedHiddenImpact, base, "board-impact-changed");
}

{
  const directory = fixture();
  directory.nomenclature.push({
    id: "nom-board-a-ambiguous",
    name: "Печатная плата A-01",
    article: "A-01",
    type: "Печатные платы",
    hidden: { conflict: true },
  });
  const impact = inspectBoardDeleteImpact(directory, "board-a");
  assert.equal(impact.ok, false);
  assert.equal(impact.code, "ambiguous-board-result");
}

{
  const danglingBom = fixture();
  danglingBom.bomLists[0].importRows[0].nomenclatureId = "nom-missing";
  failStable(danglingBom, {
    kind: "bom-row-delete",
    boardId: "board-a",
    expectedBoard: clone(danglingBom.bomLists[0]),
    rowIndex: 0,
  }, "dangling-board-reference");

  const danglingSpec = fixture();
  danglingSpec.specifications[0].bomListA = "board-missing";
  failStable(danglingSpec, {
    kind: "board-create",
    boardId: "new",
    row: { id: "new", name: "New", boardCode: "NEW" },
    expectedResultRow: null,
    resultItemId: "nom-new",
  }, "dangling-board-reference");

  const danglingNomenclature = fixture();
  danglingNomenclature.nomenclature[4].sourceBomIds = ["board-missing"];
  const inspected = inspectBoardDeleteImpact(danglingNomenclature, "board-a");
  assert.equal(inspected.ok, false);
  assert.equal(inspected.code, "dangling-board-reference");

  const malformedReference = fixture();
  malformedReference.specifications[0].bomListA = " board-a ";
  const malformed = inspectBoardDeleteImpact(malformedReference, "board-a");
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, "dangling-board-reference", "Non-canonical hidden references must not bypass dangling-reference validation");
}

{
  const directory = fixture();
  const result = applyBoardCommand(directory, {
    kind: "board-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    row: { id: "board-a", name: "No time" },
    expectedResultRow: clone(directory.nomenclature[0]),
    resultItemId: "nom-board-a",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "command-time-required", "Server owner must supply deterministic command time");
  const nonCanonical = applyBoardCommand(directory, {
    kind: "board-update",
    boardId: "board-a",
    expectedBoard: clone(directory.bomLists[0]),
    row: { id: "board-a", name: "Non-canonical time" },
    expectedResultRow: clone(directory.nomenclature[0]),
    resultItemId: "nom-board-a",
  }, { now: "1" });
  assert.equal(nonCanonical.ok, false);
  assert.equal(nonCanonical.code, "command-time-required", "Parseable non-ISO dates must never leak into persisted timestamps");
}

console.log("Directory Boards/BOM pure reducer QA passed");
