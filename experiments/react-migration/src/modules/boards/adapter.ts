export const BOM_IMPORT_HEADERS = [
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

export const BOM_COMPONENT_FIELDS = [
  { key: "c0402", label: "0402" },
  { key: "c0603", label: "0603" },
  { key: "c0805", label: "0805" },
  { key: "csot23", label: "SOT-23" },
  { key: "csoic", label: "SOIC" },
  { key: "cqfn", label: "QFN" },
  { key: "cbga", label: "BGA" },
  { key: "cconnector", label: "Разъемы" },
] as const;

export type BomComponentKey = typeof BOM_COMPONENT_FIELDS[number]["key"];

interface BomImportRowDto {
  values?: unknown;
  nomenclatureId?: unknown;
  [key: number]: unknown;
}

interface BoardDto {
  id?: unknown;
  name?: unknown;
  boardCode?: unknown;
  resultItem?: unknown;
  status?: unknown;
  sourceFileName?: unknown;
  importHeaders?: unknown;
  importRows?: unknown;
  c0402?: unknown;
  c0603?: unknown;
  c0805?: unknown;
  csot23?: unknown;
  csoic?: unknown;
  cqfn?: unknown;
  cbga?: unknown;
  cconnector?: unknown;
}

export interface BomImportRow {
  sequence: string;
  description: string;
  designator: string;
  manufacturerPart: string;
  manufacturer: string;
  packageName: string;
  quantity: number;
  note: string;
  extra: string;
  nomenclatureId: string;
  values: readonly (string | number)[];
}

export interface BoardItem {
  id: string;
  name: string;
  boardCode: string;
  resultItem: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  sourceFileName: string;
  headers: string[];
  rows: BomImportRow[];
  componentCounts: Record<BomComponentKey, number>;
  componentTotal: number;
  activeComponentTypes: number;
}

export interface BoardDeleteUsage { specificationsCount: number; bomRowsCount: number }
export interface BomNomenclatureOption { id: string; label: string; meta: string }
export interface BoardsModel {
  boards: BoardItem[];
  bomNomenclatureOptions: BomNomenclatureOption[];
  selectedBoardId: string;
  canCreateEdit: boolean;
  canDelete: boolean;
  canImportBom: boolean;
  canAddBomRows: boolean;
  canEditBomRows: boolean;
  canDeleteBomRows: boolean;
  deleteUsageById: Record<string, BoardDeleteUsage>;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lookup(value: unknown): string {
  return text(value).toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function normalizePackage(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const leadingZeroPackages: Record<string, string> = { "201": "0201", "402": "0402", "603": "0603", "805": "0805" };
  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && Number.isInteger(numeric) && leadingZeroPackages[String(numeric)]) {
    return leadingZeroPackages[String(numeric)];
  }
  return leadingZeroPackages[raw.replace(/[.,]/g, "").replace(/\s+/g, "")] || raw;
}

function normalizeQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const raw = text(value).replace(/\s+/g, "");
  if (!raw) return 0;
  const decimal = Number(raw.replace(",", "."));
  if (Number.isFinite(decimal)) return Math.max(0, Math.round(decimal));
  const digits = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(digits) ? Math.max(0, Math.round(digits)) : 0;
}

function normalizeHeader(value: unknown, fallback: string): string {
  const label = text(value) || fallback;
  return lookup(label).replace(/\s+/g, " ") === "аритикул производителя" ? "Артикул производителя" : label;
}

function classifyPackage(row: BomImportRow): BomComponentKey {
  const normalize = (value: string) => normalizePackage(value).toLocaleLowerCase("ru-RU").replace(/[.,]/g, "").replace(/\s+/g, "");
  const packageText = normalize(row.packageName);
  const combined = normalize(`${row.packageName} ${row.description}`);
  if (packageText === "0402" || combined.includes("0402")) return "c0402";
  if (packageText === "0603" || combined.includes("0603")) return "c0603";
  if (["0805", "2012"].includes(packageText) || combined.includes("0805") || combined.includes("2012")) return "c0805";
  if (["sot23", "sot-23", "sot223", "sot-223", "sod"].some((token) => combined.includes(token))) return "csot23";
  if (["soic", "tssop", "ssop", "so16", "hsop"].some((token) => combined.includes(token))) return "csoic";
  if (["qfn", "dfn", "lga"].some((token) => combined.includes(token))) return "cqfn";
  if (combined.includes("bga")) return "cbga";
  return "cconnector";
}

export function adaptBomImportRows(payload: unknown): BomImportRow[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((entry): BomImportRow => {
    const dto = (entry ?? {}) as BomImportRowDto;
    const source = Array.isArray(dto.values) ? dto.values : Array.isArray(entry) ? entry : [];
    const values = Array.from({ length: BOM_IMPORT_HEADERS.length }, (_, index) => source[index] ?? dto[index] ?? "");
    const packageName = normalizePackage(values[5]);
    const quantity = normalizeQuantity(values[6]);
    const normalizedValues = values.map((value, index) => index === 5 ? packageName : index === 6 ? quantity : text(value));
    return {
      sequence: text(values[0]),
      description: text(values[1]),
      designator: text(values[2]),
      manufacturerPart: text(values[3]),
      manufacturer: text(values[4]),
      packageName,
      quantity,
      note: text(values[7]),
      extra: text(values[8]),
      nomenclatureId: text(dto.nomenclatureId),
      values: normalizedValues,
    };
  });
}

export function summarizeBomRows(rows: BomImportRow[]): Record<BomComponentKey, number> {
  const counts = Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0])) as Record<BomComponentKey, number>;
  rows.forEach((row) => { counts[classifyPackage(row)] += row.quantity; });
  return counts;
}

function legacyComponentCounts(dto: BoardDto): Record<BomComponentKey, number> {
  return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, normalizeQuantity(dto[field.key])])) as Record<BomComponentKey, number>;
}

export function adaptBoards(payload: unknown): BoardItem[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).bomLists
      : [];
  if (!Array.isArray(source)) return [];

  return source.flatMap((entry): BoardItem[] => {
    const dto = (entry ?? {}) as BoardDto;
    const id = text(dto.id);
    const name = text(dto.name);
    if (!id || !name) return [];
    const rows = adaptBomImportRows(dto.importRows);
    const componentCounts = rows.length ? summarizeBomRows(rows) : legacyComponentCounts(dto);
    const statusLabel = text(dto.status) || (rows.length ? "Активен" : "Черновик");
    const statusLookup = lookup(statusLabel);
    return [{
      id,
      name,
      boardCode: text(dto.boardCode) || "-",
      resultItem: text(dto.resultItem) || "-",
      statusLabel,
      statusTone: statusLookup.includes("актив") ? "success" : statusLookup.includes("чернов") ? "warning" : "neutral",
      sourceFileName: text(dto.sourceFileName),
      headers: Array.from({ length: BOM_IMPORT_HEADERS.length }, (_, index) => normalizeHeader(Array.isArray(dto.importHeaders) ? dto.importHeaders[index] : "", BOM_IMPORT_HEADERS[index])),
      rows,
      componentCounts,
      componentTotal: Object.values(componentCounts).reduce((sum, count) => sum + count, 0),
      activeComponentTypes: Object.values(componentCounts).filter((count) => count > 0).length,
    }];
  });
}

export function adaptBoardsModel(payload: unknown): BoardsModel {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const capabilities = root.capabilities && typeof root.capabilities === "object" ? root.capabilities as Record<string, unknown> : {};
  const boards = adaptBoards(payload);
  const usageRoot = root.deleteUsageById && typeof root.deleteUsageById === "object" && !Array.isArray(root.deleteUsageById) ? root.deleteUsageById as Record<string, unknown> : {};
  const deleteUsageById = Object.fromEntries(boards.map((board) => {
    const entry = usageRoot[board.id] && typeof usageRoot[board.id] === "object" && !Array.isArray(usageRoot[board.id]) ? usageRoot[board.id] as Record<string, unknown> : {};
    return [board.id, {
      specificationsCount: normalizeQuantity(entry.specificationsCount),
      bomRowsCount: normalizeQuantity(entry.bomRowsCount),
    }];
  }));
  const optionSource = Array.isArray(root.bomNomenclatureOptions) ? root.bomNomenclatureOptions : [];
  const bomNomenclatureOptions = optionSource.flatMap((entry): BomNomenclatureOption[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const dto = entry as Record<string, unknown>;
    const id = text(dto.id);
    const label = text(dto.label);
    if (!id || !label) return [];
    return [{ id, label, meta: text(dto.meta) }];
  });
  return {
    boards,
    bomNomenclatureOptions,
    selectedBoardId: boards.some((board) => board.id === text(root.selectedBoardId)) ? text(root.selectedBoardId) : boards[0]?.id || "",
    canCreateEdit: capabilities.createEdit === true,
    canDelete: capabilities.delete === true,
    canImportBom: capabilities.bomImport === true,
    canAddBomRows: capabilities.bomRowAdd === true,
    canEditBomRows: capabilities.bomRowEdit === true,
    canDeleteBomRows: capabilities.bomRowDelete === true,
    deleteUsageById,
  };
}
