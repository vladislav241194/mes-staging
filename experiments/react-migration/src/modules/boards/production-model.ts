import type {
  BoardDeleteUsage,
  BoardItem,
  BoardsModel,
  BomComponentKey,
  BomImportRow,
  BomNomenclatureOption,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;

export const BOARDS_SUPPORTED_READ_FIELDS = [
  "directory board cards, BOM headers and imported component rows",
  "component counters derived from BOM rows with legacy counter fallback",
  "selected board from the shared UI projection",
  "REA nomenclature options and board delete usage derived from the directory projection",
] as const;

export const BOARDS_DEFERRED_READ_FIELDS = [
  "XLSX parsing and import validation remain in the Boards command owner",
  "published specification revision lineage is not expanded by the current Boards scenario",
  "row mutation concurrency and owner read-back remain command-side contracts",
] as const;

const BOM_HEADERS = [
  "Порядковый номер",
  "Описание",
  "Обозначение в схеме",
  "Артикул производителя",
  "Производитель",
  "Корпус",
  "Кол-во",
  "Примечание",
  "Поле I",
] as const;
const COMPONENT_KEYS: readonly BomComponentKey[] = ["c0402", "c0603", "c0805", "csot23", "csoic", "cqfn", "cbga", "cconnector"];

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asCount = (value: unknown): number => {
  const raw = typeof value === "string" ? value.replace(/\s+/g, "").replace(",", ".") : value;
  const count = Math.round(Number(raw));
  return Number.isFinite(count) ? Math.max(0, count) : 0;
};
const lookup = (value: unknown): string => asText(value).toLocaleLowerCase("ru-RU").replace(/ё/g, "е");

function directoryFrom(input: UnknownRecord): UnknownRecord {
  const directory = asRecord(input.directory ?? input.directoryState);
  return Object.keys(directory).length ? directory : input;
}

function normalizePackage(value: unknown): string {
  const raw = asText(value);
  if (!raw) return "";
  const compact = raw.replace(/[.,]/g, "").replace(/\s+/g, "");
  const aliases: Record<string, string> = { "201": "0201", "402": "0402", "603": "0603", "805": "0805" };
  return aliases[compact] || raw;
}

function normalizeHeader(value: unknown, fallback: string): string {
  const label = asText(value, fallback) || fallback;
  return lookup(label).replace(/\s+/g, " ") === "аритикул производителя" ? "Артикул производителя" : label;
}

function rowFrom(value: unknown): BomImportRow {
  const source = asRecord(value);
  const rawValues = Array.isArray(source.values) ? source.values : Array.isArray(value) ? value : [];
  const values = Array.from({ length: BOM_HEADERS.length }, (_, index) => rawValues[index] ?? source[index] ?? "");
  const packageName = normalizePackage(values[5]);
  const quantity = asCount(values[6]);
  const normalizedValues = values.map((entry, index) => index === 5 ? packageName : index === 6 ? quantity : asText(entry));
  return {
    sequence: asText(values[0]),
    description: asText(values[1]),
    designator: asText(values[2]),
    manufacturerPart: asText(values[3]),
    manufacturer: asText(values[4]),
    packageName,
    quantity,
    note: asText(values[7]),
    extra: asText(values[8]),
    nomenclatureId: asText(source.nomenclatureId),
    values: normalizedValues,
  };
}

function classify(row: BomImportRow): BomComponentKey {
  const normalized = `${row.packageName} ${row.description}`.toLocaleLowerCase("ru-RU").replace(/[.,\s]/g, "").replace(/ё/g, "е");
  if (normalized.includes("0402")) return "c0402";
  if (normalized.includes("0603")) return "c0603";
  if (normalized.includes("0805") || normalized.includes("2012")) return "c0805";
  if (["sot23", "sot223", "sod"].some((token) => normalized.includes(token))) return "csot23";
  if (["soic", "tssop", "ssop", "so16", "hsop"].some((token) => normalized.includes(token))) return "csoic";
  if (["qfn", "dfn", "lga"].some((token) => normalized.includes(token))) return "cqfn";
  if (normalized.includes("bga")) return "cbga";
  return "cconnector";
}

function componentCounts(source: UnknownRecord, rows: BomImportRow[]): Record<BomComponentKey, number> {
  const counts = Object.fromEntries(COMPONENT_KEYS.map((key) => [key, 0])) as Record<BomComponentKey, number>;
  if (rows.length) rows.forEach((row) => { counts[classify(row)] += row.quantity; });
  else COMPONENT_KEYS.forEach((key) => { counts[key] = asCount(source[key]); });
  return counts;
}

function boardFrom(value: unknown): BoardItem | null {
  const source = asRecord(value);
  const id = asText(source.id);
  const name = asText(source.name);
  if (!id || !name) return null;
  const rows = asArray(source.importRows).map(rowFrom);
  const counts = componentCounts(source, rows);
  const statusLabel = asText(source.status, rows.length ? "Активен" : "Черновик");
  return {
    id,
    name,
    boardCode: asText(source.boardCode, "-") || "-",
    resultItem: asText(source.resultItem, "-") || "-",
    statusLabel,
    statusTone: lookup(statusLabel).includes("актив") ? "success" : lookup(statusLabel).includes("чернов") ? "warning" : "neutral",
    sourceFileName: asText(source.sourceFileName),
    headers: Array.from({ length: BOM_HEADERS.length }, (_, index) => normalizeHeader(asArray(source.importHeaders)[index], BOM_HEADERS[index])),
    rows,
    componentCounts: counts,
    componentTotal: Object.values(counts).reduce((total, count) => total + count, 0),
    activeComponentTypes: Object.values(counts).filter((count) => count > 0).length,
  };
}

function specificationItems(value: unknown): UnknownRecord[] {
  const source = asRecord(value);
  return asArray(source.structureItems ?? source.items).map(asRecord);
}

function derivedUsage(directory: UnknownRecord, board: BoardItem): BoardDeleteUsage {
  const specificationsCount = asArray(directory.specifications).map(asRecord).filter((specification) => (
    [specification.bomListA, specification.bomListB].some((value) => asText(value) === board.id)
    || specificationItems(specification).some((item) => asText(item.bomListId ?? item.bomId) === board.id)
  )).length;
  return { specificationsCount, bomRowsCount: board.rows.length };
}

function usageFor(directory: UnknownRecord, source: UnknownRecord, board: BoardItem): BoardDeleteUsage {
  const explicit = asRecord(asRecord(source.deleteUsageById)[board.id]);
  return Object.keys(explicit).length
    ? { specificationsCount: asCount(explicit.specificationsCount), bomRowsCount: asCount(explicit.bomRowsCount) }
    : derivedUsage(directory, board);
}

function optionFrom(value: unknown): BomNomenclatureOption | null {
  const source = asRecord(value);
  const id = asText(source.id);
  const label = asText(source.name ?? source.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    meta: asText(source.meta, [source.article, source.package].map((entry) => asText(entry)).filter(Boolean).join(" · ")),
  };
}

export function isBoardsProductionInput(value: unknown): boolean {
  const source = asRecord(value);
  return ["directory", "directoryState", "systemDomains", "ui"].some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

export function buildBoardsProductionModel(input: unknown, capabilityInput: unknown = {}): BoardsModel {
  const source = asRecord(input);
  const directory = directoryFrom(source);
  const ui = asRecord(source.ui);
  const rootCapabilities = asRecord(capabilityInput);
  const sourceCapabilities = asRecord(source.capabilities);
  const capabilities = Object.keys(rootCapabilities).length ? rootCapabilities : sourceCapabilities;
  const boards = asArray(directory.bomLists).map(boardFrom).filter(Boolean) as BoardItem[];
  const explicitOptions = asArray(source.bomNomenclatureOptions).map(optionFrom).filter(Boolean) as BomNomenclatureOption[];
  const derivedOptions = asArray(directory.nomenclature).map(asRecord)
    .filter((item) => ["рэа компоненты", "рэа", "rea", "компонент", "компоненты"].includes(lookup(item.type)))
    .sort((left, right) => asText(left.name).localeCompare(asText(right.name), "ru"))
    .map(optionFrom).filter(Boolean) as BomNomenclatureOption[];
  const selectedCandidate = asText(source.selectedBoardId, asText(ui.activeBomId));
  return {
    boards,
    bomNomenclatureOptions: explicitOptions.length ? explicitOptions : derivedOptions,
    selectedBoardId: boards.some((board) => board.id === selectedCandidate) ? selectedCandidate : boards[0]?.id || "",
    canCreateEdit: capabilities.createEdit === true,
    canDelete: capabilities.delete === true,
    canImportBom: capabilities.bomImport === true,
    canAddBomRows: capabilities.bomRowAdd === true,
    canEditBomRows: capabilities.bomRowEdit === true,
    canDeleteBomRows: capabilities.bomRowDelete === true,
    deleteUsageById: Object.fromEntries(boards.map((board) => [board.id, usageFor(directory, source, board)])),
  };
}
