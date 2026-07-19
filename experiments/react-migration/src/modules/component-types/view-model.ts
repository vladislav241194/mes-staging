import type { ComponentTypeItem } from "./adapter";

export type ComponentTypeFilter = "all" | string;

export function buildComponentTypeFilters(items: ComponentTypeItem[]) {
  const families = [...new Set(items.map((item) => item.family))];
  return [
    { id: "all", label: "Все типы", count: items.length },
    ...families.map((family) => ({ id: family, label: family, count: items.filter((item) => item.family === family).length })),
  ];
}

export function filterComponentTypes(items: ComponentTypeItem[], filter: ComponentTypeFilter): ComponentTypeItem[] {
  return filter === "all" ? items : items.filter((item) => item.family === filter);
}

export function resolveVisibleComponentType(items: ComponentTypeItem[], selectedId: string): ComponentTypeItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number, digits = 2): string {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(rounded);
}
