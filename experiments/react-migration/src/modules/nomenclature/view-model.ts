import type { NomenclatureItem, NomenclatureKind } from "./adapter";

export type NomenclatureFilter = "all" | NomenclatureKind;

export const nomenclatureFilters: Array<{ id: NomenclatureFilter; label: string }> = [
  { id: "all", label: "Вся номенклатура" },
  { id: "Материал", label: "Материалы" },
  { id: "РЭА", label: "РЭА" },
  { id: "Печатная плата", label: "Печатные платы" },
];

export function filterNomenclatureItems(items: NomenclatureItem[], filter: NomenclatureFilter): NomenclatureItem[] {
  return filter === "all" ? items : items.filter((item) => item.kind === filter);
}

export function resolveVisibleSelection(items: NomenclatureItem[], selectedId: string): NomenclatureItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}

export function formatRecordCount(count: number): string {
  const normalized = Math.max(0, Math.trunc(Number(count) || 0));
  const tens = normalized % 100;
  const ones = normalized % 10;
  const word = tens >= 11 && tens <= 14 ? "записей" : ones === 1 ? "запись" : ones >= 2 && ones <= 4 ? "записи" : "записей";
  return `${normalized} ${word}`;
}
