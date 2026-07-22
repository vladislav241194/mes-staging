const BOM_COLUMN_COUNT = 9;
const EDITABLE_TEXT_COLUMNS = new Set([0, 1, 2, 3, 4, 5, 7, 8]);
const REA_COMPONENT_TYPE = "РЭА компоненты";
const PCB_TYPE = "Печатные платы";
const COMPONENT_KEYS = Object.freeze([
  "c0402",
  "c0603",
  "c0805",
  "csot23",
  "csoic",
  "cqfn",
  "cbga",
  "cconnector",
]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function lookup(value) {
  return text(value).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function normalizePackage(value) {
  const raw = text(value);
  if (!raw) return "";
  const leadingZeroPackages = { 201: "0201", 402: "0402", 603: "0603", 805: "0805" };
  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && Number.isInteger(numeric) && leadingZeroPackages[String(numeric)]) {
    return leadingZeroPackages[String(numeric)];
  }
  return leadingZeroPackages[raw.replace(/[.,]/g, "").replace(/\s+/g, "")] || raw;
}

function normalizeQuantity(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const raw = text(value);
  if (!raw) return 0;
  const compact = raw.replace(/\s+/g, "");
  const decimal = Number(compact.replace(",", "."));
  if (Number.isFinite(decimal)) return Math.max(0, Math.round(decimal));
  const digits = Number(compact.replace(/[^\d.-]/g, ""));
  return Number.isFinite(digits) ? Math.max(0, Math.round(digits)) : 0;
}

function normalizeBomRow(row) {
  const source = Array.isArray(row?.values) ? row.values : Array.isArray(row) ? row : [];
  const values = Array.from({ length: BOM_COLUMN_COUNT }, (_, index) => source[index] ?? row?.[index] ?? "");
  values[5] = normalizePackage(values[5]);
  values[6] = normalizeQuantity(values[6]);
  return {
    sequence: values[0] ?? "",
    description: values[1] ?? "",
    designator: values[2] ?? "",
    manufacturerPart: values[3] ?? "",
    manufacturer: values[4] ?? "",
    package: values[5],
    quantity: values[6],
    note: values[7] ?? "",
    extra: values[8] ?? "",
    nomenclatureId: text(row?.nomenclatureId),
    values,
  };
}

function rowSignature(values = []) {
  return normalizeBomRow({ values }).values.map((value, index) => (
    index === 6 ? Number(value || 0) : text(value)
  ));
}

function sameRows(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function classifyPackage(row) {
  const packageText = normalizePackage(row?.package).toLocaleLowerCase("ru-RU").replace(/[.,\s]/g, "");
  const combined = normalizePackage(`${row?.package || ""} ${row?.description || ""}`).toLocaleLowerCase("ru-RU").replace(/[.,\s]/g, "");
  if (packageText === "0402" || combined.includes("0402")) return "c0402";
  if (packageText === "0603" || combined.includes("0603")) return "c0603";
  if (["0805", "2012"].includes(packageText) || combined.includes("0805") || combined.includes("2012")) return "c0805";
  if (["sot23", "sot-23", "sot223", "sot-223", "sod"].some((token) => combined.includes(token))) return "csot23";
  if (["soic", "tssop", "ssop", "so16", "hsop"].some((token) => combined.includes(token))) return "csoic";
  if (["qfn", "dfn", "lga"].some((token) => combined.includes(token))) return "cqfn";
  if (combined.includes("bga")) return "cbga";
  return "cconnector";
}

function componentTotals(rows) {
  const totals = Object.fromEntries(COMPONENT_KEYS.map((key) => [key, 0]));
  rows.forEach((row) => {
    const normalized = normalizeBomRow(row);
    const key = classifyPackage(normalized);
    totals[key] += Math.max(0, Number(normalized.quantity || 0));
  });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)]));
}

function normalizeDirectory(source) {
  const directory = record(source);
  return {
    ...directory,
    bomLists: list(directory.bomLists),
    nomenclature: list(directory.nomenclature),
    specifications: list(directory.specifications),
  };
}

function normalizeBoard(row) {
  const source = record(row);
  const importRows = list(source.importRows).map(normalizeBomRow);
  return {
    ...source,
    id: text(source.id),
    name: text(source.name),
    projectId: text(source.projectId),
    boardCode: text(source.boardCode),
    resultItem: text(source.resultItem),
    status: text(source.status) || "Черновик",
    importHeaders: list(source.importHeaders),
    importRows,
    importedAt: text(source.importedAt),
    sourceFileName: text(source.sourceFileName),
    sourceSheetName: text(source.sourceSheetName),
    ...Object.fromEntries(COMPONENT_KEYS.map((key) => [key, Math.max(0, Math.round(Number(source[key] || 0)))])),
  };
}

function mergeSourceIds(existing, incoming) {
  return [...new Set([
    ...list(existing?.sourceBomIds),
    ...list(incoming?.sourceBomIds),
  ].map(text).filter(Boolean))];
}

function makeResultNomenclature(board, stamp, makeId) {
  const name = text(board.resultItem || board.boardCode || board.name);
  if (!name) return null;
  return {
    id: makeId("nom"),
    name,
    article: text(board.boardCode),
    type: PCB_TYPE,
    package: "PCB",
    unit: "шт.",
    manufacturer: "",
    description: [
      board.name ? `Результат платы: ${board.name}` : "",
      board.boardCode ? `Децимальный номер: ${board.boardCode}` : "",
      "Тип позиции: печатная плата",
    ].filter(Boolean).join(". "),
    status: "Активен",
    sourceBomResultId: board.id,
    sourceBomIds: board.id ? [board.id] : [],
    lastBomResultSyncAt: stamp,
    updatedAt: stamp,
  };
}

function upsertResultNomenclature(items, board, stamp, makeId) {
  const payload = makeResultNomenclature(board, stamp, makeId);
  if (!payload) return items;
  const article = lookup(payload.article);
  const name = lookup(payload.name);
  const index = items.findIndex((item) => (
    text(item?.sourceBomResultId) === board.id
    || (article && lookup(item?.type) === lookup(PCB_TYPE) && lookup(item?.article) === article)
    || (!article && name && lookup(item?.type) === lookup(PCB_TYPE) && lookup(item?.name) === name)
  ));
  if (index < 0) return [...items, payload];
  const existing = record(items[index]);
  const next = {
    ...existing,
    name: payload.name,
    article: payload.article || text(existing.article),
    type: PCB_TYPE,
    package: text(existing.package) || "PCB",
    unit: text(existing.unit) || "шт.",
    description: payload.description,
    status: text(existing.status) || "Активен",
    sourceBomResultId: board.id,
    sourceBomIds: mergeSourceIds(existing, payload),
    lastBomResultSyncAt: stamp,
    updatedAt: stamp,
  };
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

function makeImportNomenclature(row, board, stamp, makeId) {
  const normalized = normalizeBomRow(row);
  const name = text(normalized.description || normalized.manufacturerPart || normalized.designator || `Компонент ${normalized.sequence || ""}`);
  const article = text(normalized.manufacturerPart);
  if (!name && !article) return null;
  return {
    id: makeId("nom"),
    name,
    article,
    type: REA_COMPONENT_TYPE,
    package: normalized.package,
    unit: "шт.",
    manufacturer: text(normalized.manufacturer),
    description: [
      normalized.designator ? `Обозначение: ${normalized.designator}` : "",
      normalized.note ? `Примечание: ${normalized.note}` : "",
      board?.name ? `Источник BOM: ${board.name}` : "",
    ].filter(Boolean).join(". "),
    status: "Активен",
    sourceBomIds: board?.id ? [board.id] : [],
    lastBomImportAt: stamp,
    updatedAt: stamp,
  };
}

function upsertImportNomenclature(items, board, stamp, makeId) {
  let nextItems = [...items];
  list(board.importRows).map(normalizeBomRow).forEach((row) => {
    const payload = makeImportNomenclature(row, board, stamp, makeId);
    if (!payload) return;
    const article = lookup(payload.article);
    const index = nextItems.findIndex((item) => (
      (row.nomenclatureId && text(item?.id) === row.nomenclatureId)
      || (article && lookup(item?.article) === article)
      || (!article
        && lookup(item?.name) === lookup(payload.name)
        && lookup(normalizePackage(item?.package)) === lookup(normalizePackage(payload.package))
        && lookup(item?.manufacturer) === lookup(payload.manufacturer))
    ));
    if (index < 0) {
      nextItems.push(payload);
      return;
    }
    const existing = record(nextItems[index]);
    nextItems[index] = {
      ...existing,
      name: text(existing.name) || payload.name,
      article: text(existing.article) || payload.article,
      type: REA_COMPONENT_TYPE,
      package: text(existing.package) || payload.package,
      unit: text(existing.unit) || "шт.",
      manufacturer: text(existing.manufacturer) || payload.manufacturer,
      description: text(existing.description) || payload.description,
      status: text(existing.status) || "Активен",
      sourceBomIds: mergeSourceIds(existing, payload),
      lastBomImportAt: stamp,
      updatedAt: stamp,
    };
  });
  return nextItems;
}

function failure(code, message, metadata = {}) {
  return { ok: false, code, message, ...metadata };
}

/**
 * Local Boards/BOM command owner. `apply` may normalize the next directory and
 * return it; `persist`/`persistUi` may veto a mutation by returning false.
 */
export function createBoardsCommandOwner({
  getDirectoryState = () => ({}),
  setDirectoryState = () => {},
  getUi = () => ({}),
  apply = (directory) => directory,
  persist = () => true,
  persistUi = () => true,
  notify = () => {},
  recordRemoval = () => {},
  makeId = (prefix) => `${prefix}-${Date.now()}`,
  now = () => new Date().toISOString(),
} = {}) {
  const findBoard = (directory, boardId) => directory.bomLists.find((board) => text(board?.id) === boardId) || null;
  const boardRows = (board) => list(board?.importRows).map(normalizeBomRow);

  const commit = (nextDirectory, { type, uiPatch = {}, message = "", removal = null } = {}) => {
    const previousDirectory = getDirectoryState();
    const ui = record(getUi());
    const previousUi = Object.fromEntries(Object.keys(uiPatch).map((key) => [key, ui[key]]));
    try {
      const applied = apply(nextDirectory, { type });
      if (applied === false) return failure("apply-rejected", "Изменение BOM отклонено владельцем состояния.");
      const authoritative = normalizeDirectory(record(applied?.directory || applied).bomLists ? (applied?.directory || applied) : nextDirectory);
      setDirectoryState(authoritative);
      Object.assign(ui, uiPatch);
      if (removal?.sectionId && removal?.id) recordRemoval(removal.sectionId, removal.id);
      if (persist(authoritative, { type }) === false || persistUi(ui, { type }) === false) {
        setDirectoryState(previousDirectory);
        Object.assign(ui, previousUi);
        return failure("persist-rejected", "Изменение BOM не сохранено.");
      }
      if (message) notify(message, { type });
      return { ok: true, directory: authoritative };
    } catch (error) {
      setDirectoryState(previousDirectory);
      Object.assign(ui, previousUi);
      return failure("mutation-failed", error instanceof Error ? error.message : "Изменение BOM не выполнено.");
    }
  };

  const updateRows = (directory, board, rows, { syncNomenclature = true, type } = {}) => {
    const stamp = now();
    const importRows = rows.map(normalizeBomRow);
    const nextBoard = normalizeBoard({ ...board, importRows, updatedAt: stamp, ...componentTotals(importRows) });
    let nextDirectory = {
      ...directory,
      bomLists: directory.bomLists.map((item) => text(item?.id) === nextBoard.id ? nextBoard : item),
    };
    if (syncNomenclature) {
      nextDirectory = {
        ...nextDirectory,
        nomenclature: upsertImportNomenclature(nextDirectory.nomenclature, nextBoard, stamp, makeId),
      };
    }
    return { nextBoard, nextDirectory, committed: commit(nextDirectory, { type, message: "Таблица BOM сохранена" }) };
  };

  const saveBoard = (input = {}) => {
    const directory = normalizeDirectory(getDirectoryState());
    const isNew = input.isNew === true;
    const id = isNew ? text(input.bomId) || makeId("bom") : text(input.bomId);
    const previous = findBoard(directory, id);
    if (!id) return failure("invalid-id", "Команда платы не содержит идентификатор.");
    if (!isNew && !previous) return failure("not-found", "Плата не найдена.");
    if (isNew && previous) return failure("same-row-conflict", "Плата уже создана в другом сеансе.");
    const name = text(input.name);
    const boardCode = text(input.boardCode);
    if (!name) return failure("name-required", "Заполните название платы.");
    const stamp = now();
    const componentCounts = record(input.componentCounts);
    const board = normalizeBoard({
      ...record(previous),
      id,
      name,
      projectId: text(previous?.projectId),
      boardCode,
      resultItem: text(input.resultItem) || `Печатная плата ${boardCode || name}`,
      status: text(previous?.status) || "Черновик",
      importHeaders: list(previous?.importHeaders),
      importRows: list(previous?.importRows),
      importedAt: text(previous?.importedAt),
      sourceFileName: text(previous?.sourceFileName),
      sourceSheetName: text(previous?.sourceSheetName),
      updatedAt: stamp,
      ...Object.fromEntries(COMPONENT_KEYS.map((key) => [key,
        Object.prototype.hasOwnProperty.call(componentCounts, key)
          ? Math.max(0, Number(componentCounts[key] || 0))
          : Math.max(0, Number(previous?.[key] || 0)),
      ])),
    });
    const nextDirectory = {
      ...directory,
      bomLists: isNew
        ? [...directory.bomLists, board]
        : directory.bomLists.map((item) => text(item?.id) === id ? { ...item, ...board } : item),
      nomenclature: upsertResultNomenclature(directory.nomenclature, board, stamp, makeId),
    };
    const committed = commit(nextDirectory, {
      type: "save",
      uiPatch: { activeBomId: id, activeProjectId: "" },
      message: isNew ? "Плата создана" : "Плата сохранена",
    });
    return committed.ok ? { ok: true, id, isNew, row: board } : committed;
  };

  const deleteBoard = (input = {}) => {
    const directory = normalizeDirectory(getDirectoryState());
    const boardId = text(input.bomId);
    const board = findBoard(directory, boardId);
    if (!board) return failure("not-found", "Плата не найдена.");
    const specificationIds = directory.specifications.filter((specification) => (
      text(specification?.bomListA) === boardId
      || text(specification?.bomListB) === boardId
      || list(specification?.structureItems).some((item) => text(item?.bomListId) === boardId)
    )).map((specification) => text(specification?.id)).filter(Boolean);
    const specifications = directory.specifications.map((specification) => ({
      ...specification,
      bomListA: text(specification?.bomListA) === boardId ? "" : specification?.bomListA,
      bomQtyA: text(specification?.bomListA) === boardId ? 0 : specification?.bomQtyA,
      bomListB: text(specification?.bomListB) === boardId ? "" : specification?.bomListB,
      bomQtyB: text(specification?.bomListB) === boardId ? 0 : specification?.bomQtyB,
      structureItems: list(specification?.structureItems).map((item) => (
        text(item?.bomListId) === boardId ? { ...item, bomListId: "" } : item
      )),
    }));
    const nextDirectory = {
      ...directory,
      bomLists: directory.bomLists.filter((item) => text(item?.id) !== boardId),
      specifications,
    };
    const committed = commit(nextDirectory, {
      type: "delete",
      uiPatch: { activeBomId: "" },
      removal: { sectionId: "bomLists", id: boardId },
    });
    return committed.ok ? {
      ok: true,
      id: boardId,
      usage: { specificationIds, specificationsCount: specificationIds.length, bomRowsCount: boardRows(board).length },
    } : committed;
  };

  const addNomenclatureRow = (input = {}) => {
    const directory = normalizeDirectory(getDirectoryState());
    const boardId = text(input.bomId);
    const nomenclatureId = text(input.nomenclatureId);
    const board = findBoard(directory, boardId);
    const item = directory.nomenclature.find((row) => text(row?.id) === nomenclatureId);
    if (!board || !item) return failure("not-found", "Плата или позиция номенклатуры больше не существует.");
    if (lookup(item.type) !== lookup(REA_COMPONENT_TYPE)) return failure("invalid-type", "В BOM можно добавить только РЭА-компонент.");
    const rows = boardRows(board);
    const expected = Array.isArray(input.expectedRows) && input.expectedRows.every(Array.isArray)
      ? input.expectedRows.map(rowSignature)
      : null;
    if (!expected || !sameRows(rows.map((row) => rowSignature(row.values)), expected)) {
      return failure("same-row-conflict", "Таблица BOM изменилась в другом сеансе. Обновите экран и повторите.");
    }
    const sequence = rows.reduce((max, row, index) => {
      const value = Number(row.sequence || index + 1);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) + 1;
    const nextRow = normalizeBomRow({
      nomenclatureId,
      values: [sequence, item.name || "", "", item.article || "", item.manufacturer || "", item.package || "", 1, "Добавлено из номенклатуры", ""],
    });
    const result = updateRows(directory, board, [...rows, nextRow], { type: "add-bom-nomenclature-row" });
    return result.committed.ok ? { ok: true, id: `${boardId}:${rows.length}`, rowCount: rows.length + 1 } : result.committed;
  };

  const updateBomCell = (input = {}) => {
    const directory = normalizeDirectory(getDirectoryState());
    const boardId = text(input.bomId);
    const rowIndex = Number(input.rowIndex);
    const columnIndex = Number(input.columnIndex);
    const board = findBoard(directory, boardId);
    const rows = boardRows(board);
    if (!board || typeof input.rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
      return failure("not-found", "Строка BOM больше не существует.");
    }
    if (typeof input.columnIndex !== "number" || !EDITABLE_TEXT_COLUMNS.has(columnIndex) || typeof input.value !== "string") {
      return failure("invalid-field", "Поле BOM недоступно для этой команды.");
    }
    const expected = Array.isArray(input.expectedValues) ? rowSignature(input.expectedValues) : null;
    if (!expected || !sameRows(rowSignature(rows[rowIndex].values), expected)) {
      return failure("same-row-conflict", "Строка BOM изменилась в другом сеансе. Обновите экран и повторите.");
    }
    const nextValues = [...rows[rowIndex].values];
    nextValues[columnIndex] = input.value;
    const nextRows = rows.map((row, index) => index === rowIndex ? normalizeBomRow({ ...row, values: nextValues }) : row);
    const result = updateRows(directory, board, nextRows, { type: "update-bom-cell" });
    const authoritative = normalizeBomRow(nextRows[rowIndex]);
    return result.committed.ok ? { ok: true, id: `${boardId}:${rowIndex}:${columnIndex}`, value: authoritative.values[columnIndex] } : result.committed;
  };

  const updateBomQuantity = (input = {}) => {
    const directory = normalizeDirectory(getDirectoryState());
    const boardId = text(input.bomId);
    const rowIndex = Number(input.rowIndex);
    const rawQuantity = text(input.quantity);
    const quantity = Number(rawQuantity);
    const board = findBoard(directory, boardId);
    const rows = boardRows(board);
    if (!board || typeof input.rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
      return failure("not-found", "Строка BOM больше не существует.");
    }
    if (!rawQuantity || !Number.isInteger(quantity) || quantity < 0) {
      return failure("invalid-quantity", "Количество BOM должно быть целым неотрицательным числом.");
    }
    const expected = Array.isArray(input.expectedValues) ? rowSignature(input.expectedValues) : null;
    if (!expected || !sameRows(rowSignature(rows[rowIndex].values), expected)) {
      return failure("same-row-conflict", "Строка BOM изменилась в другом сеансе. Обновите экран и повторите.");
    }
    const nextValues = [...rows[rowIndex].values];
    nextValues[6] = quantity;
    const nextRows = rows.map((row, index) => index === rowIndex ? normalizeBomRow({ ...row, values: nextValues }) : row);
    const result = updateRows(directory, board, nextRows, { type: "update-bom-quantity" });
    return result.committed.ok ? { ok: true, id: `${boardId}:${rowIndex}:quantity`, quantity } : result.committed;
  };

  const deleteBomRow = (input = {}) => {
    const directory = normalizeDirectory(getDirectoryState());
    const boardId = text(input.bomId);
    const rowIndex = Number(input.rowIndex);
    const board = findBoard(directory, boardId);
    const rows = boardRows(board);
    if (!board || typeof input.rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
      return failure("not-found", "Строка BOM больше не существует.");
    }
    const expected = Array.isArray(input.expectedRows) && input.expectedRows.every(Array.isArray)
      ? input.expectedRows.map(rowSignature)
      : null;
    if (!expected || !sameRows(rows.map((row) => rowSignature(row.values)), expected)) {
      return failure("same-row-conflict", "Таблица BOM изменилась в другом сеансе. Обновите экран и повторите.");
    }
    const remaining = rows.filter((_, index) => index !== rowIndex);
    const result = updateRows(directory, board, remaining, { syncNomenclature: false, type: "delete-bom-row" });
    return result.committed.ok ? { ok: true, id: `${boardId}:${rowIndex}:deleted`, remainingRows: remaining.length } : result.committed;
  };

  const execute = (command = {}) => {
    const input = record(command.payload);
    if (command.type === "save") return saveBoard(input);
    if (command.type === "delete") return deleteBoard(input);
    if (command.type === "add-bom-nomenclature-row") return addNomenclatureRow(input);
    if (command.type === "update-bom-cell") return updateBomCell(input);
    if (command.type === "update-bom-quantity") return updateBomQuantity(input);
    if (command.type === "delete-bom-row") return deleteBomRow(input);
    if (command.type === "import-bom-xlsx") {
      return failure("delegated-import", "Импорт XLSX пока выполняется выделенным владельцем.", { delegated: true });
    }
    return failure("unsupported-command", "Команда Boards не поддерживается.");
  };

  return Object.freeze({
    execute,
    saveBoard,
    deleteBoard,
    addNomenclatureRow,
    updateBomCell,
    updateBomQuantity,
    deleteBomRow,
  });
}
