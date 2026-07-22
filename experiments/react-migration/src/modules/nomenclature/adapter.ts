import {
  buildNomenclatureProductionModel,
  isNomenclatureProductionInput,
} from "./production-model";

export interface NomenclatureItemDto {
  [key: string]: unknown;
  id?: unknown;
  article?: unknown;
  articleValue?: unknown;
  name?: unknown;
  type?: unknown;
  unit?: unknown;
  package?: unknown;
  packageName?: unknown;
  packageValue?: unknown;
  manufacturer?: unknown;
  manufacturerValue?: unknown;
  description?: unknown;
  status?: unknown;
  statusLabel?: unknown;
  baseline?: unknown;
}

export interface NomenclatureTypeDto {
  id?: unknown;
  name?: unknown;
  label?: unknown;
  code?: unknown;
  description?: unknown;
  status?: unknown;
}

export interface NomenclatureItem {
  id: string;
  article: string;
  articleValue: string;
  name: string;
  type: string;
  unit: string;
  packageName: string;
  packageValue: string;
  manufacturer: string;
  manufacturerValue: string;
  description: string;
  statusLabel: string;
  statusTone: "success" | "neutral";
  baseline: Record<string, unknown>;
}

export interface NomenclatureTypeOption {
  id: string;
  label: string;
  code: string;
  description: string;
}

export interface NomenclatureReadModel {
  items: NomenclatureItem[];
  types: NomenclatureTypeOption[];
  boardCount: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canElevate: boolean;
  unavailableReason: string;
  createReason: string;
  editReason: string;
  deleteReason: string;
  deleteUsageById: Record<string, NomenclatureDeleteUsage>;
}

export interface NomenclatureDeleteUsage {
  specificationsCount: number;
  bomRowsCount: number;
}

const inactiveStatuses = new Set(["отключен", "удален", "архив"]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lookup(value: unknown): string {
  return text(value).toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function normalizeType(value: unknown): string {
  const valueText = text(value);
  const normalized = lookup(valueText);
  if (!normalized || ["компонент", "компоненты", "рэа", "rea", "радиоэлектронные компоненты"].includes(normalized)) {
    return "РЭА компоненты";
  }
  return valueText;
}

export function adaptNomenclatureItems(payload: unknown): NomenclatureItem[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry): NomenclatureItem[] => {
    const dto = (entry ?? {}) as NomenclatureItemDto;
    const id = text(dto.id);
    const name = text(dto.name);
    if (!id || !name) return [];
    const statusLabel = text(dto.statusLabel ?? dto.status) || "Активен";
    const articleValue = text(dto.articleValue ?? dto.article);
    const packageValue = text(dto.packageValue ?? dto.package);
    const manufacturerValue = text(dto.manufacturerValue ?? dto.manufacturer);
    const baseline = dto.baseline && typeof dto.baseline === "object" && !Array.isArray(dto.baseline)
      ? dto.baseline as Record<string, unknown>
      : { ...dto };

    return [{
      id,
      article: text(dto.article) || articleValue || "-",
      articleValue,
      name,
      type: normalizeType(dto.type),
      unit: text(dto.unit) || "шт.",
      packageName: text(dto.packageName ?? dto.package) || packageValue || "-",
      packageValue,
      manufacturer: text(dto.manufacturer) || manufacturerValue || "-",
      manufacturerValue,
      description: text(dto.description),
      statusLabel,
      statusTone: lookup(statusLabel).includes("актив") ? "success" : "neutral",
      baseline: { ...baseline },
    }];
  });
}

export function adaptNomenclatureTypes(payload: unknown): NomenclatureTypeOption[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  return payload.flatMap((entry): NomenclatureTypeOption[] => {
    const dto = (entry ?? {}) as NomenclatureTypeDto;
    const label = normalizeType(dto.name ?? dto.label);
    const key = lookup(label);
    if (!label || seen.has(key) || inactiveStatuses.has(lookup(dto.status))) return [];
    seen.add(key);
    return [{
      id: text(dto.id) || `type-${key.replace(/[^a-zа-я0-9]+/gi, "-")}`,
      label,
      code: text(dto.code),
      description: text(dto.description),
    }];
  });
}

export function adaptNomenclatureReadModel(payload: unknown): NomenclatureReadModel {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const productionModel = root.productionModel && typeof root.productionModel === "object" && !Array.isArray(root.productionModel)
    ? root.productionModel as Record<string, unknown>
    : {};
  if (Object.keys(productionModel).length || isNomenclatureProductionInput(root)) {
    return buildNomenclatureProductionModel(Object.keys(productionModel).length ? productionModel : root, root.capabilities);
  }
  const wrappedModel = root.model && typeof root.model === "object" && !Array.isArray(root.model)
    ? root.model as Record<string, unknown>
    : {};
  const record = Object.keys(wrappedModel).length ? wrappedModel : root;
  const items = adaptNomenclatureItems(Array.isArray(payload) ? payload : record.nomenclature ?? record.items);
  const declaredTypes = adaptNomenclatureTypes(record.nomenclatureTypes ?? record.types);
  const typeKeys = new Set(declaredTypes.map((entry) => lookup(entry.label)));
  const inferredTypes = items.flatMap((item): NomenclatureTypeOption[] => {
    const key = lookup(item.type);
    if (typeKeys.has(key)) return [];
    typeKeys.add(key);
    return [{ id: `inferred-${key.replace(/[^a-zа-я0-9]+/gi, "-")}`, label: item.type, code: "", description: "" }];
  });
  const boardCount = Array.isArray(record.bomLists) ? record.bomLists.length : 0;
  const capabilitySource = Object.keys(wrappedModel).length ? root.capabilities : record.capabilities;
  const capabilities = capabilitySource && typeof capabilitySource === "object" ? capabilitySource as Record<string, unknown> : {};
  const rawDeleteUsage = capabilities.deleteUsageById && typeof capabilities.deleteUsageById === "object"
    ? capabilities.deleteUsageById as Record<string, unknown>
    : {};
  const deleteUsageById = Object.fromEntries(items.map((item) => {
    const usage = rawDeleteUsage[item.id] && typeof rawDeleteUsage[item.id] === "object"
      ? rawDeleteUsage[item.id] as Record<string, unknown>
      : {};
    return [item.id, {
      specificationsCount: Math.max(0, Number(usage.specificationsCount) || 0),
      bomRowsCount: Math.max(0, Number(usage.bomRowsCount) || 0),
    }];
  }));
  return {
    items,
    types: [...declaredTypes, ...inferredTypes],
    boardCount,
    canCreate: capabilities.create === true || capabilities.createEdit === true,
    canEdit: capabilities.edit === true || capabilities.createEdit === true,
    canDelete: capabilities.delete === true,
    canElevate: capabilities.employeeElevation === true,
    unavailableReason: text(capabilities.writeUnavailableReason),
    createReason: text(capabilities.createUnavailableReason),
    editReason: text(capabilities.editUnavailableReason),
    deleteReason: text(capabilities.deleteUnavailableReason),
    deleteUsageById,
  };
}
