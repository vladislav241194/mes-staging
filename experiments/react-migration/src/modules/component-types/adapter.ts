export interface ComponentTypeDto {
  id?: unknown;
  name?: unknown;
  package?: unknown;
  family?: unknown;
  coefficient?: unknown;
  placementsPerHour?: unknown;
  setupSeconds?: unknown;
  defaultCount?: unknown;
  status?: unknown;
}

export interface ComponentTypeItem {
  id: string;
  name: string;
  packageName: string;
  family: string;
  coefficient: number;
  placementsPerHour: number;
  setupSeconds: number;
  defaultCount: number;
  statusLabel: string;
  statusTone: "success" | "neutral";
}

export interface ComponentTypesModel {
  items: ComponentTypeItem[];
  canCreateEdit: boolean;
  canDelete: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function adaptComponentTypes(payload: unknown): ComponentTypeItem[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).componentTypes
      : [];
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((entry): ComponentTypeItem[] => {
    const dto = (entry ?? {}) as ComponentTypeDto;
    const id = text(dto.id);
    const name = text(dto.name);
    if (!id || !name) return [];
    const statusLabel = text(dto.status) || "Активен";
    return [{
      id,
      name,
      packageName: text(dto.package) || "—",
      family: text(dto.family) || "Без семейства",
      coefficient: nonNegativeNumber(dto.coefficient),
      placementsPerHour: Math.trunc(nonNegativeNumber(dto.placementsPerHour)),
      setupSeconds: Math.trunc(nonNegativeNumber(dto.setupSeconds)),
      defaultCount: Math.trunc(nonNegativeNumber(dto.defaultCount)),
      statusLabel,
      statusTone: statusLabel.toLocaleLowerCase("ru-RU").includes("актив") ? "success" : "neutral",
    }];
  });
}

export function adaptComponentTypesModel(payload: unknown): ComponentTypesModel {
  const capabilities = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).capabilities
    : null;
  const capabilityRecord = capabilities && typeof capabilities === "object"
    ? capabilities as Record<string, unknown>
    : {};
  return {
    items: adaptComponentTypes(payload),
    canCreateEdit: capabilityRecord.createEdit === true,
    canDelete: capabilityRecord.delete === true,
  };
}
