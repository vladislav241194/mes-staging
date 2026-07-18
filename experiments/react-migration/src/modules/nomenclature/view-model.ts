import type { NomenclatureItem, NomenclatureReadModel } from "./adapter";
export { formatRecordCount } from "../../ui/format";

export type NomenclatureFilter = "all" | string;

export const NOMENCLATURE_READ_COLUMNS = ["Наименование", "Артикул", "Раздел", "Корпус", "Ед.", "Производитель", "Статус"] as const;

export function getNomenclatureReadCells(item: NomenclatureItem): string[] {
  return [item.name, item.article, item.type, item.packageName, item.unit, item.manufacturer, item.statusLabel];
}

export interface NomenclatureFilterOption {
  id: NomenclatureFilter;
  label: string;
  count: number;
  description: string;
  action: "filter" | "legacy";
}

export function buildNomenclatureFilters(model: NomenclatureReadModel): NomenclatureFilterOption[] {
  return [
    { id: "all", label: "Вся номенклатура", count: model.items.length, description: "Все производственные позиции", action: "filter" },
    ...model.types.map((type) => ({
      id: type.label === "Печатные платы" ? "__boards__" : type.label,
      label: type.label,
      count: type.label === "Печатные платы" ? model.boardCount : model.items.filter((item) => item.type === type.label).length,
      description: type.description,
      action: type.label === "Печатные платы" ? "legacy" as const : "filter" as const,
    })),
  ];
}

export function filterNomenclatureItems(items: NomenclatureItem[], filter: NomenclatureFilter): NomenclatureItem[] {
  return filter === "all" ? items : items.filter((item) => item.type === filter);
}

export function resolveVisibleSelection(items: NomenclatureItem[], selectedId: string): NomenclatureItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}
