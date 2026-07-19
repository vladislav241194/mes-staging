const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

export interface GanttSlotModel { id: string; rowId: string; routeId: string; operationId: string; title: string; meta: string; status: string; statusLabel: string; quantity: number; plannedStart: string; plannedEnd: string; x: number; width: number; top: number; height: number; aggregate: boolean; locked: boolean; canReschedule: boolean; }
export interface GanttRowModel { id: string; type: string; label: string; meta: string; top: number; height: number; slots: GanttSlotModel[]; }
export interface GanttDependencyModel { id: string; fromSlotId: string; toSlotId: string; fromTitle: string; toTitle: string; fromRowLabel: string; toRowLabel: string; fromEnd: string; toStart: string; gapMinutes: number; kind: "finish-start" | "transfer"; }

export function adaptGanttPayload(payload: unknown) {
  const root = record(payload);
  const source = record(root.model || payload);
  const capabilities = record(root.capabilities);
  const rows = list(source.rows).map((raw, rowIndex): GanttRowModel => {
    const row = record(raw);
    const id = text(row.id, `row-${rowIndex + 1}`);
    return {
      id,
      type: text(row.type, "resource"),
      label: text(row.label, "Ресурс"),
      meta: text(row.meta),
      top: number(row.top),
      height: Math.max(1, number(row.height)),
      slots: list(row.slots).map((slotRaw, slotIndex) => {
        const slot = record(slotRaw);
        const aggregate = Boolean(slot.aggregate); const locked = Boolean(slot.locked); const routeId = text(slot.routeId); const operationId = text(slot.operationId);
        return { id: text(slot.id, `${id}-slot-${slotIndex + 1}`), rowId: id, routeId, operationId, title: text(slot.title, "Операция"), meta: text(slot.meta), status: text(slot.status), statusLabel: text(slot.statusLabel, "—"), quantity: number(slot.quantity), plannedStart: text(slot.plannedStart), plannedEnd: text(slot.plannedEnd), x: number(slot.x), width: Math.max(1, number(slot.width)), top: number(slot.top), height: Math.max(1, number(slot.height)), aggregate, locked, canReschedule: capabilities.scheduleEdit === true && !aggregate && !locked && Boolean(routeId && operationId) };
      }),
    };
  });
  const dependencies = list(source.dependencies).flatMap((raw, index): GanttDependencyModel[] => { const dependency = record(raw); const fromSlotId = text(dependency.fromSlotId); const toSlotId = text(dependency.toSlotId); if (!fromSlotId || !toSlotId) return []; return [{ id: text(dependency.id, `${fromSlotId}__${toSlotId}__${index}`), fromSlotId, toSlotId, fromTitle: text(dependency.fromTitle, fromSlotId), toTitle: text(dependency.toTitle, toSlotId), fromRowLabel: text(dependency.fromRowLabel, "Ресурс не указан"), toRowLabel: text(dependency.toRowLabel, "Ресурс не указан"), fromEnd: text(dependency.fromEnd), toStart: text(dependency.toStart), gapMinutes: number(dependency.gapMinutes), kind: dependency.kind === "transfer" ? "transfer" : "finish-start" }]; });
  return {
    canEditSchedule: capabilities.scheduleEdit === true,
    projectionSource: text(source.projectionSource, "server"), scale: text(source.scale, "days"), windowStart: text(source.windowStart), windowEnd: text(source.windowEnd), leftWidth: number(source.leftWidth), timelineHeight: number(source.timelineHeight), timelineWidth: Math.max(1, number(source.timelineWidth)), totalHeight: Math.max(1, number(source.totalHeight)), dependencyCount: dependencies.length,
    ticks: list(source.ticks).map((raw, index) => { const tick = record(raw); return { id: text(tick.id, `tick-${index}`), label: text(tick.label), sublabel: text(tick.sublabel), left: number(tick.left), width: Math.max(1, number(tick.width)), weekend: Boolean(tick.weekend) }; }), rows,
    dependencies, slotCount: rows.reduce((total, row) => total + row.slots.length, 0), routeCount: rows.filter((row) => row.type === "route").length,
  };
}
