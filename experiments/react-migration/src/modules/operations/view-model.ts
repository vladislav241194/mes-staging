import type { OperationReadItem } from "./adapter";

export type OperationFilter = "all" | string;

export function buildOperationFilters(items: OperationReadItem[]) {
  const centers = [...new Set(items.map((item) => item.workCenterLabel))];
  return [
    { id: "all", label: "Все операции", count: items.length },
    ...centers.map((center) => ({ id: center, label: center, count: items.filter((item) => item.workCenterLabel === center).length })),
  ];
}

export function filterOperations(items: OperationReadItem[], filter: OperationFilter): OperationReadItem[] {
  return filter === "all" ? items : items.filter((item) => item.workCenterLabel === filter);
}

export function resolveVisibleOperation(items: OperationReadItem[], selectedId: string): OperationReadItem | null {
  return items.find((item) => item.id === selectedId) || items[0] || null;
}
