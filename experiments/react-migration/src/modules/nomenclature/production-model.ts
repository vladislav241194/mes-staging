import type {
  NomenclatureDeleteUsage,
  NomenclatureItem,
  NomenclatureReadModel,
  NomenclatureTypeOption,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;

export const NOMENCLATURE_SUPPORTED_READ_FIELDS = [
  "directory nomenclature rows and active nomenclature types",
  "board count from the directory BOM list",
  "delete usage from explicit owner contracts or directory specifications and BOM rows",
  "strict capability booleans and owner-provided unavailable reasons",
] as const;

export const NOMENCLATURE_DEFERRED_READ_FIELDS = [
  "warehouse balances and supply reservations are owned by their operational domains",
  "published specification revision lineage is not rendered by the current Nomenclature scenario",
  "write concurrency and actor authorization remain in the Nomenclature command owner",
] as const;

const inactiveStatuses = new Set(["отключен", "удален", "архив"]);

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asCount = (value: unknown): number => {
  const count = Math.round(Number(value));
  return Number.isFinite(count) ? Math.max(0, count) : 0;
};
const lookup = (value: unknown): string => asText(value).toLocaleLowerCase("ru-RU").replace(/ё/g, "е");

function normalizeType(value: unknown): string {
  const source = asText(value);
  const normalized = lookup(source);
  if (!normalized || ["компонент", "компоненты", "рэа", "rea", "радиоэлектронные компоненты"].includes(normalized)) {
    return "РЭА компоненты";
  }
  return source;
}

function directoryFrom(input: UnknownRecord): UnknownRecord {
  const directory = asRecord(input.directory ?? input.directoryState);
  return Object.keys(directory).length ? directory : input;
}

function itemFrom(value: unknown): NomenclatureItem | null {
  const source = asRecord(value);
  const id = asText(source.id);
  const name = asText(source.name);
  if (!id || !name) return null;
  const statusLabel = asText(source.status, "Активен");
  return {
    id,
    article: asText(source.article, "-") || "-",
    articleValue: asText(source.article),
    name,
    type: normalizeType(source.type),
    unit: asText(source.unit, "шт.") || "шт.",
    packageName: asText(source.package, "-") || "-",
    packageValue: asText(source.package),
    manufacturer: asText(source.manufacturer, "-") || "-",
    manufacturerValue: asText(source.manufacturer),
    description: asText(source.description),
    statusLabel,
    statusTone: lookup(statusLabel).includes("актив") ? "success" : "neutral",
    baseline: { ...source },
  };
}

function typeFrom(value: unknown): NomenclatureTypeOption | null {
  const source = asRecord(value);
  const label = normalizeType(source.name);
  if (!label || inactiveStatuses.has(lookup(source.status))) return null;
  const key = lookup(label);
  return {
    id: asText(source.id, `type-${key.replace(/[^a-zа-я0-9]+/gi, "-")}`),
    label,
    code: asText(source.code),
    description: asText(source.description),
  };
}

function specificationItems(value: unknown): UnknownRecord[] {
  const source = asRecord(value);
  return asArray(source.structureItems ?? source.items).map(asRecord);
}

function derivedUsage(directory: UnknownRecord, itemId: string): NomenclatureDeleteUsage {
  const specificationsCount = asArray(directory.specifications).map(asRecord).filter((specification) => (
    specificationItems(specification).some((item) => asText(item.nomenclatureId) === itemId)
  )).length;
  const bomRowsCount = asArray(directory.bomLists).map(asRecord).reduce((total, board) => (
    total + asArray(board.importRows).map(asRecord).filter((row) => asText(row.nomenclatureId) === itemId).length
  ), 0);
  return { specificationsCount, bomRowsCount };
}

function usageFor(directory: UnknownRecord, capabilities: UnknownRecord, itemId: string): NomenclatureDeleteUsage {
  const source = asRecord(asRecord(capabilities.deleteUsageById)[itemId]);
  if (Object.keys(source).length) {
    return {
      specificationsCount: asCount(source.specificationsCount),
      bomRowsCount: asCount(source.bomRowsCount),
    };
  }
  return derivedUsage(directory, itemId);
}

export function isNomenclatureProductionInput(value: unknown): boolean {
  const source = asRecord(value);
  return ["directory", "directoryState", "systemDomains", "ui"].some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

export function buildNomenclatureProductionModel(input: unknown, capabilityInput: unknown = {}): NomenclatureReadModel {
  const source = asRecord(input);
  const directory = directoryFrom(source);
  const sourceCapabilities = asRecord(source.capabilities);
  const rootCapabilities = asRecord(capabilityInput);
  const capabilities = Object.keys(rootCapabilities).length ? rootCapabilities : sourceCapabilities;
  const items = asArray(directory.nomenclature ?? directory.items).map(itemFrom).filter(Boolean) as NomenclatureItem[];
  const declaredTypes = asArray(directory.nomenclatureTypes ?? directory.types).map(typeFrom).filter(Boolean) as NomenclatureTypeOption[];
  const seenTypes = new Set<string>();
  const types = [...declaredTypes, ...items.map((item): NomenclatureTypeOption => ({
    id: `inferred-${lookup(item.type).replace(/[^a-zа-я0-9]+/gi, "-")}`,
    label: item.type,
    code: "",
    description: "",
  }))].filter((item) => {
    const key = lookup(item.label);
    if (!key || seenTypes.has(key)) return false;
    seenTypes.add(key);
    return true;
  });
  return {
    items,
    types,
    boardCount: asArray(directory.bomLists).length,
    canCreate: capabilities.create === true || capabilities.createEdit === true,
    canEdit: capabilities.edit === true || capabilities.createEdit === true,
    canDelete: capabilities.delete === true,
    canElevate: capabilities.employeeElevation === true,
    unavailableReason: asText(capabilities.writeUnavailableReason),
    createReason: asText(capabilities.createUnavailableReason),
    editReason: asText(capabilities.editUnavailableReason),
    deleteReason: asText(capabilities.deleteUnavailableReason),
    deleteUsageById: Object.fromEntries(items.map((item) => [item.id, usageFor(directory, capabilities, item.id)])),
  };
}
