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
