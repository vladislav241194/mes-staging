interface NomenclatureTypeDto {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  description?: unknown;
  status?: unknown;
}

export interface NomenclatureTypeReadItem {
  id: string;
  name: string;
  code: string;
  description: string;
  statusLabel: string;
  statusTone: "success" | "neutral";
}

export interface NomenclatureTypesModel {
  items: NomenclatureTypeReadItem[];
  canCreateEdit: boolean;
  canDelete: boolean;
  deleteUsageById: Record<string, { nomenclatureCount: number; specificationRowsCount: number; fallbackType: string }>;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function adaptNomenclatureTypes(payload: unknown): NomenclatureTypeReadItem[] {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : root.nomenclatureTypes;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((entry): NomenclatureTypeReadItem[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const dto = entry as NomenclatureTypeDto;
    const id = text(dto.id);
    const name = text(dto.name);
    if (!id || !name) return [];
    const statusLabel = text(dto.status) || "Активен";
    return [{
      id,
      name,
      code: text(dto.code) || "—",
      description: text(dto.description) || "—",
      statusLabel,
      statusTone: statusLabel.toLocaleLowerCase("ru-RU").includes("актив") ? "success" : "neutral",
    }];
  });
}

export function adaptNomenclatureTypesModel(payload: unknown): NomenclatureTypesModel {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const capabilities = root.capabilities && typeof root.capabilities === "object"
    ? root.capabilities as Record<string, unknown>
    : {};
  const items = adaptNomenclatureTypes(payload);
  const usageRoot = root.deleteUsageById && typeof root.deleteUsageById === "object" && !Array.isArray(root.deleteUsageById) ? root.deleteUsageById as Record<string, unknown> : {};
  const deleteUsageById = Object.fromEntries(items.map((item) => {
    const entry = usageRoot[item.id] && typeof usageRoot[item.id] === "object" && !Array.isArray(usageRoot[item.id]) ? usageRoot[item.id] as Record<string, unknown> : {};
    const count = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));
    return [item.id, { nomenclatureCount: count(entry.nomenclatureCount), specificationRowsCount: count(entry.specificationRowsCount), fallbackType: text(entry.fallbackType) }];
  }));
  return {
    items,
    canCreateEdit: capabilities.createEdit === true,
    canDelete: capabilities.delete === true,
    deleteUsageById,
  };
}
