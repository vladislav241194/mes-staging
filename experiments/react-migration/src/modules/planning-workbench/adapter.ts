type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const tone = (value: unknown): "success" | "warning" | "neutral" => ["ok", "success"].includes(text(value)) ? "success" : text(value) === "warning" ? "warning" : "neutral";

export interface PlanningQueueItem { id: string; title: string; meta: string; operationCount: number; statusLabel: string; statusTone: "success" | "warning" | "neutral"; active: boolean }
export interface PlanningMetric { id: string; label: string; value: string; meta: string; tone: "success" | "warning" | "neutral" }
export interface PlanningStructureRow { id: string; kind: "task" | "step"; level: number; title: string; meta: string; labor: string; laborMeta: string; context: string; contextMeta: string; quantity: number; unit: string; statusLabel: string; statusTone: "success" | "warning" | "neutral"; selected: boolean }

export function adaptPlanningWorkbench(payload: unknown) {
  const source = record(record(payload).model || payload);
  const overview = record(source.overview);
  const decision = record(overview.decision);
  const queue = list(source.queue).map((value): PlanningQueueItem | null => {
    const item = record(value); const status = record(item.status); const id = text(item.id); const title = text(item.title);
    return id && title ? { id, title, meta: text(item.meta), operationCount: number(item.operationCount), statusLabel: text(status.label, "не определено"), statusTone: tone(status.tone), active: item.active === true } : null;
  }).filter(Boolean) as PlanningQueueItem[];
  const metrics = list(overview.metrics).map((value): PlanningMetric | null => {
    const item = record(value); const id = text(item.id); const label = text(item.label);
    return id && label ? { id, label, value: text(item.value, "—"), meta: text(item.meta), tone: tone(item.tone) } : null;
  }).filter(Boolean) as PlanningMetric[];
  const rows = list(overview.rows).map((value): PlanningStructureRow | null => {
    const item = record(value); const status = record(item.status); const id = text(item.id); const title = text(item.title); const kind = text(item.kind) === "step" ? "step" : "task";
    return id && title ? { id, kind, level: Math.max(0, number(item.level)), title, meta: text(item.meta), labor: text(item.labor, "—"), laborMeta: text(item.laborMeta), context: text(item.context, "—"), contextMeta: text(item.contextMeta), quantity: number(item.quantity), unit: text(item.unit, "шт."), statusLabel: text(status.label, "не определено"), statusTone: tone(status.tone), selected: item.selected === true } : null;
  }).filter(Boolean) as PlanningStructureRow[];
  const activeRouteId = text(source.activeRouteId);
  return {
    activeRouteId,
    headerDescription: text(source.headerDescription, "Выберите заказ-наряд"),
    projectionSource: text(source.projectionSource, "unknown"),
    detailLoading: source.detailLoading === true,
    queue,
    metrics,
    rows,
    quantity: number(overview.planningQuantity || source.activeQuantity),
    decision: { title: text(decision.title, "Заказ-наряд не выбран"), subtitle: text(decision.subtitle), tone: tone(decision.tone), isReady: decision.isReady === true },
    canActivate: Boolean(activeRouteId && queue.length && metrics.length === 5 && rows.length),
  };
}
