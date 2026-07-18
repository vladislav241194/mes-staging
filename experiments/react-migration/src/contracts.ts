export type NomenclatureKind = "Материал" | "РЭА" | "Печатная плата";

export interface NomenclatureItemDto {
  id?: unknown;
  article?: unknown;
  name?: unknown;
  kind?: unknown;
  unit?: unknown;
  package?: unknown;
  status?: unknown;
}

export interface NomenclatureItem {
  id: string;
  article: string;
  name: string;
  kind: NomenclatureKind;
  unit: string;
  packageName: string;
  status: "active" | "draft";
}

const kinds = new Set<NomenclatureKind>(["Материал", "РЭА", "Печатная плата"]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function adaptNomenclatureItems(payload: unknown): NomenclatureItem[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry): NomenclatureItem[] => {
    const dto = (entry ?? {}) as NomenclatureItemDto;
    const id = text(dto.id);
    const name = text(dto.name);
    const kind = text(dto.kind) as NomenclatureKind;
    if (!id || !name || !kinds.has(kind)) return [];

    return [{
      id,
      article: text(dto.article) || "—",
      name,
      kind,
      unit: text(dto.unit) || "шт.",
      packageName: text(dto.package) || "—",
      status: text(dto.status) === "draft" ? "draft" : "active",
    }];
  });
}
