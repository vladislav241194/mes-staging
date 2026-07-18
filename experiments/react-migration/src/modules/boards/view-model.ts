import type { BoardItem } from "./adapter";

export function resolveVisibleBoard(items: BoardItem[], selectedId: string): BoardItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}

export function formatComponentCount(count: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.max(0, count));
}

export function formatBomCell(value: string | number): string {
  return String(value ?? "");
}

export function getBoardSidebarMeta(board: BoardItem): string {
  return `${board.boardCode} · ${board.resultItem}${board.rows.length ? "" : " · Черновик"}`;
}

export function getVisibleComponentTotal(board: BoardItem): number {
  return board.rows.length ? board.componentTotal : 0;
}

export function getBoardReadCells(board: BoardItem): string[] {
  return [board.name, board.boardCode, board.resultItem, String(board.rows.length), String(board.componentTotal), board.statusLabel];
}
