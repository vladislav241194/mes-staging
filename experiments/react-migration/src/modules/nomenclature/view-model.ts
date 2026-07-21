import type { NomenclatureItem, NomenclatureReadModel } from "./adapter";
export { formatRecordCount } from "../../ui/format";

export type NomenclatureFilter = "all" | string;

export const NOMENCLATURE_READ_COLUMNS = ["Наименование", "Артикул", "Раздел", "Корпус", "Ед.", "Производитель", "Статус"] as const;
const BOARD_TYPE = "Печатные платы";

export function getNomenclatureReadCells(item: NomenclatureItem): string[] {
  return [item.name, item.article, item.type, item.packageName, item.unit, item.manufacturer, item.statusLabel];
}

export interface NomenclatureFilterOption {
  id: NomenclatureFilter;
  label: string;
  count: number;
  description: string;
  action: "filter" | "boards";
}

export function buildNomenclatureFilters(model: NomenclatureReadModel): NomenclatureFilterOption[] {
  const typeFilters: NomenclatureFilterOption[] = model.types.map((type) => ({
      id: type.label === BOARD_TYPE ? "__boards__" : type.label,
      label: type.label,
      count: type.label === BOARD_TYPE ? model.boardCount : model.items.filter((item) => item.type === type.label).length,
      description: type.description,
      action: type.label === BOARD_TYPE ? "boards" as const : "filter" as const,
    }));
  if (!typeFilters.some((entry) => entry.action === "boards")) {
    typeFilters.push({ id: "__boards__", label: BOARD_TYPE, count: model.boardCount, description: "", action: "boards" });
  }
  return [
    { id: "all", label: "Вся номенклатура", count: model.items.length, description: "", action: "filter" },
    ...typeFilters,
  ];
}

export function filterNomenclatureItems(items: NomenclatureItem[], filter: NomenclatureFilter): NomenclatureItem[] {
  return filter === "all" ? items : items.filter((item) => item.type === filter);
}

export function resolveVisibleSelection(items: NomenclatureItem[], selectedId: string): NomenclatureItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}
