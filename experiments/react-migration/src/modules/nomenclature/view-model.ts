import type { NomenclatureItem, NomenclatureReadModel } from "./adapter";
export { formatRecordCount } from "../../ui/format";

export type NomenclatureFilter = "all" | string;

export interface NomenclatureFilterOption {
  id: NomenclatureFilter;
  label: string;
  count: number;
  description: string;
}

export function buildNomenclatureFilters(model: NomenclatureReadModel): NomenclatureFilterOption[] {
  return [
    { id: "all", label: "Вся номенклатура", count: model.items.length, description: "Все производственные позиции" },
    ...model.types.map((type) => ({
      id: type.label,
      label: type.label,
      count: model.items.filter((item) => item.type === type.label).length,
      description: type.description,
    })),
  ];
}

export function filterNomenclatureItems(items: NomenclatureItem[], filter: NomenclatureFilter): NomenclatureItem[] {
  return filter === "all" ? items : items.filter((item) => item.type === filter);
}

export function resolveVisibleSelection(items: NomenclatureItem[], selectedId: string): NomenclatureItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}
