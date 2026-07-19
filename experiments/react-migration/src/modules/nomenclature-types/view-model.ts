import type { NomenclatureTypeReadItem } from "./adapter";

export type NomenclatureTypeFilter = "all" | string;

export function buildNomenclatureTypeFilters(items: NomenclatureTypeReadItem[]) {
  const statuses = [...new Set(items.map((item) => item.statusLabel))];
  return [
    { id: "all", label: "Все типы", count: items.length },
    ...statuses.map((status) => ({ id: status, label: status, count: items.filter((item) => item.statusLabel === status).length })),
  ];
}

export function filterNomenclatureTypes(items: NomenclatureTypeReadItem[], filter: NomenclatureTypeFilter) {
  return filter === "all" ? items : items.filter((item) => item.statusLabel === filter);
}

export function resolveVisibleNomenclatureType(items: NomenclatureTypeReadItem[], selectedId: string) {
  return items.find((item) => item.id === selectedId) || items[0] || null;
}
