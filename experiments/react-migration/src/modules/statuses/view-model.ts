import type { StatusReadItem } from "./adapter";

export type StatusFilter = "all" | string;

export function buildStatusFilters(items: StatusReadItem[]) {
  const groups = [...new Set(items.map((item) => item.group))];
  return [
    { id: "all", label: "Все статусы", count: items.length },
    ...groups.map((group) => ({ id: group, label: group, count: items.filter((item) => item.group === group).length })),
  ];
}

export function filterStatuses(items: StatusReadItem[], filter: StatusFilter) {
  return filter === "all" ? items : items.filter((item) => item.group === filter);
}

export function resolveVisibleStatus(items: StatusReadItem[], selectedId: string) {
  return items.find((item) => item.id === selectedId) || items[0] || null;
}
