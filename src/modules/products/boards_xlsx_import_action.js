export async function importLegacyBoardsXlsxFile(file, productionId = "", dependencies = {}) {
  const {
    BOARD_SPEC_TERM,
    BOM_IMPORT_COLUMN_COUNT,
    BOM_IMPORT_FALLBACK_HEADERS,
    directoryState,
    getDirectoryState,
    makeId,
    normalizeBomImportRow,
    normalizeDirectoryRow,
    normalizeDirectoryState,
    notifySaveSuccess,
    persistDirectoryState,
    persistUiState,
    summarizeBomComponentFields,
    ui,
    upsertBomImportRowsToNomenclature,
    upsertBomResultToNomenclature,
  } = dependencies;

  const parsed = await parseXlsxBomFile(file, {
    columnCount: BOM_IMPORT_COLUMN_COUNT,
    fallbackHeaders: BOM_IMPORT_FALLBACK_HEADERS,
  });
  const name = getFileBaseName(file.name, BOARD_SPEC_TERM);
  const id = makeId("bom");
  const importRows = parsed.rows.map((row) => normalizeBomImportRow(row));
  const componentTotals = summarizeBomComponentFields(importRows);
  const stamp = new Date().toISOString();
  const row = normalizeDirectoryRow("bomLists", {
    id,
    name,
    projectId: productionId || "",
    boardCode: name,
    resultItem: `Печатная плата ${name}`,
    status: "Активен",
    importHeaders: parsed.headers,
    importRows,
    importedAt: stamp,
    sourceFileName: file.name,
    sourceSheetName: parsed.sheetName,
    updatedAt: stamp,
    ...componentTotals,
  });

  directoryState.bomLists = [
    ...(directoryState.bomLists || []).filter((item) => item.name !== row.name || item.projectId !== row.projectId),
    row,
  ];
  upsertBomResultToNomenclature(row, stamp);
  upsertBomImportRowsToNomenclature(row, stamp);
  Object.assign(getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
  ui.activeBomId = id;
  ui.activeProjectId = productionId || "";
  if (persistDirectoryState() === false) {
    throw new Error("BOM не импортирован: для этого раздела ещё не подключена серверная команда.");
  }
  persistUiState();
  notifySaveSuccess("BOM импортирован");
}

export async function parseXlsxBomFile(file, { columnCount, fallbackHeaders } = {}) {
  const entries = await readZipEntries(await file.arrayBuffer());
  const workbookXml = await getZipText(entries, "xl/workbook.xml");
  const sheetName = readFirstWorksheetName(workbookXml) || "Sheet1";
  const sheetEntryName = entries.has("xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : [...entries.keys()].find((name) => name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml"));
  if (!sheetEntryName) throw new Error("В файле не найден лист Excel.");

  const sharedStringsXml = entries.has("xl/sharedStrings.xml") ? await getZipText(entries, "xl/sharedStrings.xml") : "";
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const sheetXml = await getZipText(entries, sheetEntryName);
  const matrix = parseWorksheetMatrix(sheetXml, sharedStrings, columnCount);
  const headers = Array.from({ length: columnCount }, (_, index) => (
    String(matrix[0]?.[index] || "").trim() || fallbackHeaders[index] || `Поле ${index + 1}`
  ));
  const rows = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] || [];
    if (source[0] === undefined || source[0] === null || String(source[0]).trim() === "") break;
    rows.push(Array.from({ length: columnCount }, (_, columnIndex) => source[columnIndex] ?? ""));
  }

  if (!rows.length) throw new Error("BOM не содержит строк: первая пустая ячейка A найдена сразу после заголовка.");
  return { sheetName, headers, rows };
}

function getFileBaseName(fileName, fallback) {
  return String(fileName || fallback)
    .replace(/\.[^.]+$/, "")
    .trim() || fallback;
}

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const textDecoder = new TextDecoder("utf-8");
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 66000);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Файл не похож на XLSX: не найден ZIP-каталог.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = textDecoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, {
      name,
      text: null,
      bytes: compressedBytes,
      compressionMethod,
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function getZipText(entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`В XLSX не найден файл ${name}.`);
  if (entry.text !== null) return entry.text;

  let bytes = entry.bytes;
  if (entry.compressionMethod === 8) {
    if (!("DecompressionStream" in window)) {
      throw new Error("Браузер не поддерживает распаковку XLSX. Откройте систему в актуальном Chrome/Edge.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (entry.compressionMethod !== 0) {
    throw new Error(`Неподдерживаемый метод сжатия XLSX: ${entry.compressionMethod}.`);
  }

  entry.text = new TextDecoder("utf-8").decode(bytes);
  return entry.text;
}

function parseXml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Не удалось прочитать XML внутри XLSX.");
  return xml;
}

function readFirstWorksheetName(workbookXml) {
  const sheet = parseXml(workbookXml).querySelector("sheet");
  return sheet?.getAttribute("name") || "";
}

function parseSharedStrings(sharedStringsXml) {
  return [...parseXml(sharedStringsXml).querySelectorAll("si")].map((item) => (
    [...item.querySelectorAll("t")].map((node) => node.textContent || "").join("")
  ));
}

function parseWorksheetMatrix(sheetXml, sharedStrings, columnCount) {
  const matrix = [];
  const xml = parseXml(sheetXml);
  xml.querySelectorAll("sheetData row").forEach((rowNode) => {
    const rowIndex = Math.max(0, Number(rowNode.getAttribute("r") || matrix.length + 1) - 1);
    matrix[rowIndex] = matrix[rowIndex] || [];
    rowNode.querySelectorAll("c").forEach((cellNode) => {
      const ref = cellNode.getAttribute("r") || "";
      const columnIndex = columnLettersToIndex(ref.replace(/\d+/g, ""));
      if (columnIndex < 0 || columnIndex >= columnCount) return;
      matrix[rowIndex][columnIndex] = parseXlsxCellValue(cellNode, sharedStrings);
    });
  });
  return matrix;
}

function parseXlsxCellValue(cellNode, sharedStrings) {
  const type = cellNode.getAttribute("t");
  if (type === "inlineStr") return cellNode.querySelector("is t")?.textContent || "";
  const value = cellNode.querySelector("v")?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1";
  if (value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function columnLettersToIndex(letters) {
  if (!letters) return -1;
  return [...letters.toUpperCase()].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
