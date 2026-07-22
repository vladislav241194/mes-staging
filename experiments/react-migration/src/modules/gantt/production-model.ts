import type {
  GanttDependencyModel,
  GanttRowModel,
  GanttScale,
  GanttScaleOptionModel,
  GanttSlotModel,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;

export interface GanttProductionModel {
  canEditSchedule: boolean;
  canRefresh: boolean;
  canDrag: boolean;
  canResize: boolean;
  projectionSource: string;
  scale: GanttScale;
  scaleOptions: GanttScaleOptionModel[];
  zoom: number;
  zoomLabel: string;
  windowStart: string;
  windowEnd: string;
  windowStartDate: string;
  windowEndDate: string;
  activeRouteId: string;
  selectedSlotId: string;
  allRoutesExpanded: boolean;
  showQuantity: boolean;
  leftWidth: number;
  timelineHeight: number;
  timelineWidth: number;
  totalHeight: number;
  dependencyCount: number;
  ticks: Array<{ id: string; label: string; sublabel: string; left: number; width: number; weekend: boolean }>;
  rows: GanttRowModel[];
  dependencies: GanttDependencyModel[];
  slotCount: number;
  routeCount: number;
  readModelCoverage: {
    contract: "postgres-gantt-read-v1";
    supported: readonly string[];
    deferred: readonly string[];
  };
}

interface ScaleDefinition {
  id: GanttScale;
  label: string;
  unitMs: number;
  count: number;
  cellWidth: number;
  maxCount: number;
}

interface NormalizedSlot {
  source: UnknownRecord;
  id: string;
  routeId: string;
  routeStepId: string;
  workCenterId: string;
  resourceId: string;
  plannedStart: string;
  plannedEnd: string;
  startMs: number;
  endMs: number;
  status: string;
  quantity: number;
  locked: boolean;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const LEFT_WIDTH = 360;
const TIMELINE_HEIGHT = 48;
const ROUTE_ROW_HEIGHT = 88;
const RESOURCE_ROW_HEIGHT = 68;
const SCALE_DEFINITIONS: Record<GanttScale, ScaleDefinition> = {
  hours: { id: "hours", label: "Часы", unitMs: HOUR_MS, count: 48, cellWidth: 84, maxCount: 2880 },
  days: { id: "days", label: "Дни", unitMs: DAY_MS, count: 21, cellWidth: 118, maxCount: 540 },
  weeks: { id: "weeks", label: "Недели", unitMs: WEEK_MS, count: 10, cellWidth: 174, maxCount: 156 },
};
const SCALE_OPTIONS = Object.values(SCALE_DEFINITIONS).map(({ id, label }) => ({ id, label }));
const COMPLETED_STATUSES = new Set(["completed", "done", "closed", "cancelled", "canceled", "завершен", "завершён", "закрыт", "отменен", "отменён"]);
const STATUS_LABELS: Record<string, string> = {
  planned: "Запланировано",
  scheduled: "В плане",
  in_progress: "В работе",
  active: "В работе",
  completed: "Завершено",
  done: "Завершено",
  closed: "Закрыто",
  blocked: "Заблокировано",
  cancelled: "Отменено",
  canceled: "Отменено",
};

export const GANTT_SUPPORTED_READ_FIELDS = [
  "PostgreSQL work-order routes, route steps and scheduled slots",
  "route/resource rows and bounded timeline geometry built by strict TypeScript",
  "safe UI period, scale, zoom, expansion and quantity state",
  "adjacent operation dependency inspection and owner-backed form/drag start reschedule capability",
] as const;

export const GANTT_DEFERRED_READ_FIELDS = [
  "working-calendar gaps, non-working overlays and capacity lanes from the legacy runtime",
  "physical split slots beyond the current global runtime projection",
  "operational fact, warning, transfer-batch and optimization overlays",
  "legacy filters, dependency routing geometry, resize and dependency editing",
] as const;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown, fallback = 0): number => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asQuantity = (value: unknown): number => Math.max(0, asNumber(value));
const round = (value: number): number => Math.round(value * 100) / 100;

function exactDate(value: unknown): string {
  const candidate = asText(value).slice(0, 10);
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const instant = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return instant.getFullYear() === Number(match[1])
    && instant.getMonth() === Number(match[2]) - 1
    && instant.getDate() === Number(match[3])
    ? candidate
    : "";
}

function localDate(value: string): Date | null {
  const date = exactDate(value);
  if (!date) return null;
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateInput(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateTime(value: unknown): { iso: string; time: number } | null {
  const parsed = new Date(asText(value));
  return Number.isNaN(parsed.getTime()) ? null : { iso: parsed.toISOString(), time: parsed.getTime() };
}

function scaleFrom(value: unknown): GanttScale {
  const scale = asText(value) as GanttScale;
  return Object.prototype.hasOwnProperty.call(SCALE_DEFINITIONS, scale) ? scale : "days";
}

function zoomFrom(value: unknown): number {
  const zoom = asNumber(value, 1);
  return Math.min(8, Math.max(0.75, zoom));
}

function expandedIds(value: unknown): Set<string> {
  if (value instanceof Set) return new Set([...value].map((entry) => asText(entry)).filter(Boolean));
  return new Set(asArray(value).map((entry) => asText(entry)).filter(Boolean));
}

function projectionFrom(input: UnknownRecord): UnknownRecord {
  const projection = asRecord(input.projection);
  return Object.keys(projection).length ? projection : input;
}

function workCentersFrom(input: UnknownRecord): Map<string, UnknownRecord> {
  const registries = asRecord(asRecord(input.systemDomains).registries);
  const candidates = asArray(input.workCenters).length ? asArray(input.workCenters) : asArray(registries.workCenters);
  return new Map(candidates.flatMap((value) => {
    const item = asRecord(value);
    const id = asText(item.id);
    return id ? [[id, item] as const] : [];
  }));
}

function normalizeSlots(projection: UnknownRecord, stepsById: Map<string, UnknownRecord>): NormalizedSlot[] {
  return asArray(projection.slots).flatMap((value): NormalizedSlot[] => {
    const source = asRecord(value);
    const metadata = asRecord(source.metadata);
    const id = asText(source.id, asText(metadata.id));
    const routeStepId = asText(source.routeStepId || source.workOrderOperationId || metadata.routeStepId);
    const step = stepsById.get(routeStepId) || {};
    const routeId = asText(source.routeId || source.workOrderId || source.planningOrderId || metadata.routeId || step.routeId);
    const start = dateTime(source.plannedStart || metadata.plannedStart);
    const end = dateTime(source.plannedEnd || metadata.plannedEnd);
    if (!id || !routeId || !routeStepId || !start || !end || end.time <= start.time) return [];
    return [{
      source,
      id,
      routeId,
      routeStepId,
      workCenterId: asText(source.workCenterId || source.planningWorkCenterId || metadata.workCenterId || metadata.planningWorkCenterId || step.workCenterId || step.planningWorkCenterId),
      resourceId: asText(source.resourceId || metadata.resourceId || asRecord(step.executionContext).resourceId),
      plannedStart: start.iso,
      plannedEnd: end.iso,
      startMs: start.time,
      endMs: end.time,
      status: asText(source.status, asText(metadata.status, "planned")),
      quantity: asQuantity(source.quantity ?? metadata.quantity),
      locked: source.locked === true || source.isLocked === true || metadata.locked === true,
    }];
  });
}

function statusLabel(status: string): string {
  const key = status.toLocaleLowerCase("ru-RU");
  return STATUS_LABELS[key] || status || "—";
}

function operationOrder(step: UnknownRecord): number {
  return asNumber(step.sequenceNo ?? step.stepOrder, Number.MAX_SAFE_INTEGER);
}

function operationTitle(step: UnknownRecord, slot: NormalizedSlot): string {
  return asText(step.operationName || step.name || slot.source.operationName, "Операция");
}

function routeTitle(route: UnknownRecord): string {
  return asText(route.name || route.specificationName || route.designation || route.id, "Заказ-наряд");
}

function routeMeta(route: UnknownRecord): string {
  const snapshot = asRecord(route.workOrderSnapshot);
  return [asText(route.number || snapshot.id), asText(route.designation), `${asQuantity(route.planningQuantity ?? route.quantity).toLocaleString("ru-RU")} ${asText(route.unit, "шт.")}`]
    .filter(Boolean)
    .join(" · ");
}

function resourceLabel(slot: NormalizedSlot, step: UnknownRecord, workCentersById: Map<string, UnknownRecord>): { label: string; meta: string } {
  const workCenter = workCentersById.get(slot.workCenterId) || {};
  const workCenterLabel = asText(workCenter.name || workCenter.label || step.workCenterName, slot.workCenterId || "Ресурс не указан");
  const code = asText(workCenter.code);
  const resource = slot.resourceId;
  return {
    label: resource ? `${workCenterLabel} · ${resource}` : workCenterLabel,
    meta: [code, asText(step.operationName || step.name)].filter(Boolean).join(" · "),
  };
}

function weekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}

function ticksFor(scale: ScaleDefinition, start: Date, count: number, cellWidth: number): GanttProductionModel["ticks"] {
  const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return Array.from({ length: count }, (_, index) => {
    const tickDate = new Date(start.getTime() + index * scale.unitMs);
    const shortDate = `${String(tickDate.getDate()).padStart(2, "0")}.${String(tickDate.getMonth() + 1).padStart(2, "0")}`;
    const label = scale.id === "hours"
      ? `${String(tickDate.getHours()).padStart(2, "0")}:00`
      : scale.id === "days"
        ? weekdays[tickDate.getDay()] || ""
        : `Нед. ${weekNumber(tickDate)}`;
    return {
      id: `${scale.id}:${tickDate.toISOString()}`,
      label,
      sublabel: shortDate,
      left: round(index * cellWidth),
      width: round(cellWidth),
      weekend: [0, 6].includes(tickDate.getDay()),
    };
  });
}

function slotModel({
  slot,
  step,
  rowId,
  aggregate,
  startMs,
  endMs,
  cellWidth,
  unitMs,
}: {
  slot: NormalizedSlot;
  step: UnknownRecord;
  rowId: string;
  aggregate: boolean;
  startMs: number;
  endMs: number;
  cellWidth: number;
  unitMs: number;
}): GanttSlotModel | null {
  if (slot.endMs <= startMs || slot.startMs >= endMs) return null;
  const visibleStart = Math.max(startMs, slot.startMs);
  const visibleEnd = Math.min(endMs, slot.endMs);
  const complete = COMPLETED_STATUSES.has(slot.status.toLocaleLowerCase("ru-RU"));
  return {
    id: aggregate ? `aggregate:${slot.routeId}:${slot.id}` : slot.id,
    rowId,
    routeId: slot.routeId,
    operationId: slot.routeStepId,
    title: operationTitle(step, slot),
    meta: [slot.workCenterId, slot.resourceId].filter(Boolean).join(" · "),
    status: slot.status,
    statusLabel: statusLabel(slot.status),
    quantity: slot.quantity,
    plannedStart: slot.plannedStart,
    plannedEnd: slot.plannedEnd,
    x: round(((visibleStart - startMs) / unitMs) * cellWidth),
    width: Math.max(3, round(((visibleEnd - visibleStart) / unitMs) * cellWidth)),
    top: aggregate ? 31 : 21,
    height: 26,
    aggregate,
    locked: slot.locked || complete,
    canReschedule: false,
  };
}

export function isGanttProductionInput(value: unknown): boolean {
  const source = asRecord(value);
  const projection = projectionFrom(source);
  return Array.isArray(projection.routes) && Array.isArray(projection.routeSteps) && Array.isArray(projection.slots);
}

export function buildGanttProductionModel(input: unknown, capabilityInput: unknown = {}): GanttProductionModel {
  const source = asRecord(input);
  const projection = projectionFrom(source);
  const ui = asRecord(source.ui);
  const capabilities = asRecord(capabilityInput);
  const routes = asArray(projection.routes).map(asRecord).filter((route) => asText(route.id));
  const steps = asArray(projection.routeSteps).map(asRecord).filter((step) => asText(step.id));
  const stepsById = new Map(steps.map((step) => [asText(step.id), step] as const));
  const slots = normalizeSlots(projection, stepsById);
  const requestedActiveRouteId = asText(ui.activeRouteId ?? source.activeRouteId);
  const requestedSelectedSlotId = asText(ui.selectedSlotId ?? source.selectedSlotId);
  const activeRouteId = routes.some((route) => asText(route.id) === requestedActiveRouteId)
    ? requestedActiveRouteId
    : "";
  const selectedSlotId = slots.some((slot) => slot.id === requestedSelectedSlotId)
    ? requestedSelectedSlotId
    : "";
  const slotsByRouteId = new Map<string, NormalizedSlot[]>();
  slots.forEach((slot) => slotsByRouteId.set(slot.routeId, [...(slotsByRouteId.get(slot.routeId) || []), slot]));
  const workCentersById = workCentersFrom(source);
  const scaleId = scaleFrom(ui.scale ?? source.scale);
  const scale = SCALE_DEFINITIONS[scaleId];
  const zoom = zoomFrom(ui.zoom ?? ui.ganttZoom ?? source.zoom);
  const cellWidth = Math.round(scale.cellWidth * zoom);
  const firstSlotStart = slots.reduce((minimum, slot) => Math.min(minimum, slot.startMs), Number.POSITIVE_INFINITY);
  const fallbackStart = Number.isFinite(firstSlotStart) ? new Date(firstSlotStart) : new Date();
  const requestedStart = localDate(asText(ui.windowStart ?? source.windowStartDate)) || new Date(fallbackStart.getFullYear(), fallbackStart.getMonth(), fallbackStart.getDate());
  const maxSlotEnd = slots.reduce((maximum, slot) => Math.max(maximum, slot.endMs), requestedStart.getTime());
  const requiredCount = Math.ceil((maxSlotEnd - requestedStart.getTime()) / scale.unitMs) + 2;
  const count = Math.min(scale.maxCount, Math.max(scale.count, requiredCount));
  const end = new Date(requestedStart.getTime() + count * scale.unitMs);
  const startMs = requestedStart.getTime();
  const endMs = end.getTime();
  const expanded = expandedIds(ui.expandedRouteIds ?? ui.expandedProjects ?? source.expandedRouteIds);
  const visibleRoutes = routes.filter((route) => (slotsByRouteId.get(asText(route.id)) || []).some((slot) => slot.endMs > startMs && slot.startMs < endMs));
  const rowModels: GanttRowModel[] = [];
  const visibleSlotViews = new Map<string, { slot: GanttSlotModel; rowLabel: string }>();
  let top = 0;

  visibleRoutes.forEach((route) => {
    const routeId = asText(route.id);
    const routeSlots = (slotsByRouteId.get(routeId) || []).slice().sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id, "ru"));
    const routeRowId = `route:${routeId}`;
    const aggregateSlots = routeSlots.map((slot) => slotModel({ slot, step: stepsById.get(slot.routeStepId) || {}, rowId: routeRowId, aggregate: true, startMs, endMs, cellWidth, unitMs: scale.unitMs })).filter(Boolean) as GanttSlotModel[];
    rowModels.push({ id: routeRowId, type: "route", label: routeTitle(route), meta: routeMeta(route), top, height: ROUTE_ROW_HEIGHT, slots: aggregateSlots });
    top += ROUTE_ROW_HEIGHT;
    if (!expanded.has(routeId)) return;

    const groups = new Map<string, NormalizedSlot[]>();
    routeSlots.forEach((slot) => {
      const key = `${slot.workCenterId || "unassigned"}::${slot.resourceId || "default"}`;
      groups.set(key, [...(groups.get(key) || []), slot]);
    });
    [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "ru")).forEach(([groupId, groupSlots]) => {
      const first = groupSlots[0];
      if (!first) return;
      const firstStep = stepsById.get(first.routeStepId) || {};
      const labels = resourceLabel(first, firstStep, workCentersById);
      const rowId = `resource:${routeId}:${groupId}`;
      const projectedSlots = groupSlots.map((slot) => slotModel({ slot, step: stepsById.get(slot.routeStepId) || {}, rowId, aggregate: false, startMs, endMs, cellWidth, unitMs: scale.unitMs })).filter(Boolean) as GanttSlotModel[];
      rowModels.push({ id: rowId, type: "resource", label: labels.label, meta: labels.meta, top, height: RESOURCE_ROW_HEIGHT, slots: projectedSlots });
      projectedSlots.forEach((slot) => visibleSlotViews.set(slot.id, { slot, rowLabel: labels.label }));
      top += RESOURCE_ROW_HEIGHT;
    });
  });

  const dependencies: GanttDependencyModel[] = [];
  visibleRoutes.forEach((route) => {
    const routeId = asText(route.id);
    const routeSteps = steps.filter((step) => asText(step.routeId || asRecord(step.metadata).routeId) === routeId)
      .sort((left, right) => operationOrder(left) - operationOrder(right) || asText(left.id).localeCompare(asText(right.id), "ru"));
    const slotsByStepId = new Map((slotsByRouteId.get(routeId) || []).map((slot) => [slot.routeStepId, slot] as const));
    for (let index = 0; index < routeSteps.length - 1; index += 1) {
      const fromStep = routeSteps[index];
      const toStep = routeSteps[index + 1];
      if (!fromStep || !toStep) continue;
      const fromSlot = slotsByStepId.get(asText(fromStep.id));
      const toSlot = slotsByStepId.get(asText(toStep.id));
      const fromView = fromSlot ? visibleSlotViews.get(fromSlot.id) : null;
      const toView = toSlot ? visibleSlotViews.get(toSlot.id) : null;
      if (!fromSlot || !toSlot || !fromView || !toView) continue;
      dependencies.push({
        id: `${fromSlot.id}__${toSlot.id}`,
        fromSlotId: fromSlot.id,
        toSlotId: toSlot.id,
        fromTitle: fromView.slot.title,
        toTitle: toView.slot.title,
        fromRowLabel: fromView.rowLabel,
        toRowLabel: toView.rowLabel,
        fromEnd: fromSlot.plannedEnd,
        toStart: toSlot.plannedStart,
        gapMinutes: Math.round((toSlot.startMs - fromSlot.endMs) / 60_000),
        kind: "finish-start",
      });
    }
  });

  const canEditSchedule = capabilities.scheduleEdit === true;
  const canRefresh = capabilities.refresh === true;
  const canDrag = canEditSchedule && capabilities.slotDrag !== false;
  const canResize = capabilities.slotResize === true;
  rowModels.forEach((row) => row.slots.forEach((slot) => {
    slot.canReschedule = canEditSchedule && !slot.aggregate && !slot.locked && Boolean(slot.routeId && slot.operationId);
  }));

  return {
    canEditSchedule,
    canRefresh,
    canDrag,
    canResize,
    projectionSource: "server",
    scale: scaleId,
    scaleOptions: SCALE_OPTIONS,
    zoom,
    zoomLabel: `${Math.round(zoom * 100)}%`,
    windowStart: requestedStart.toISOString(),
    windowEnd: end.toISOString(),
    windowStartDate: dateInput(requestedStart),
    windowEndDate: dateInput(end),
    activeRouteId,
    selectedSlotId,
    allRoutesExpanded: visibleRoutes.length > 0 && visibleRoutes.every((route) => expanded.has(asText(route.id))),
    showQuantity: ui.showQuantity !== false && ui.ganttShowQuantity !== false,
    leftWidth: LEFT_WIDTH,
    timelineHeight: TIMELINE_HEIGHT,
    timelineWidth: count * cellWidth,
    totalHeight: Math.max(1, top),
    dependencyCount: dependencies.length,
    ticks: ticksFor(scale, requestedStart, count, cellWidth),
    rows: rowModels,
    dependencies,
    slotCount: rowModels.reduce((total, row) => total + row.slots.length, 0),
    routeCount: visibleRoutes.length,
    readModelCoverage: {
      contract: "postgres-gantt-read-v1",
      supported: GANTT_SUPPORTED_READ_FIELDS,
      deferred: GANTT_DEFERRED_READ_FIELDS,
    },
  };
}
