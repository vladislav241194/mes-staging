type UnknownRecord = Record<string, unknown>;

export type PlanningProductionTone = "ok" | "warning" | "neutral";

export interface PlanningProductionStatus {
  label: string;
  tone: PlanningProductionTone;
}

export interface PlanningProductionQueueItem {
  id: string;
  title: string;
  meta: string;
  operationCount: number;
  status: PlanningProductionStatus;
  active: boolean;
}

export interface PlanningProductionMetric {
  id: "supply" | "chain" | "duration" | "schedule" | "shifts";
  label: string;
  value: string | number;
  meta: string;
  tone: PlanningProductionTone;
}

export interface PlanningProductionStructureRow {
  id: string;
  kind: "task" | "step";
  level: number;
  title: string;
  meta: string;
  labor: string;
  laborMeta: string;
  context: string;
  contextMeta: string;
  quantity: number;
  unit: string;
  status: PlanningProductionStatus;
  selected: boolean;
  expanded?: boolean;
}

export interface PlanningProductionDecision {
  title: string;
  subtitle: string;
  tone: PlanningProductionTone;
  isReady: boolean;
  isPlanned: boolean;
  blockers: Array<{ id: string; label: string }>;
}

export interface PlanningProductionCoverage {
  contract: "postgres-runtime-read-v1";
  supported: readonly string[];
  deferred: readonly string[];
}

export interface PlanningWorkbenchProductionModel {
  activeRouteId: string;
  activeQuantity: number;
  headerDescription: string;
  projectionSource: "server" | "runtime-projection" | "unavailable";
  detailLoading: boolean;
  queue: PlanningProductionQueueItem[];
  overview: {
    planningQuantity: number;
    decision: PlanningProductionDecision;
    metrics: PlanningProductionMetric[];
    rows: PlanningProductionStructureRow[];
  } | null;
  concurrencyRevision: number;
  planningStartDate: string;
  planningStartDateSource: "server-owner" | "unavailable";
  serverScheduledStartDate: string;
  serverScheduledStartDateSource: "server-slot" | "server-unplanned" | "unavailable";
  readModelCoverage: PlanningProductionCoverage;
}

export const PLANNING_WORKBENCH_DEFERRED_READ_FIELDS = [
  "BOM/material availability blockers require a bounded supply owner projection",
  "manual planning-line selection requires typed work-center/resource registries",
  "legacy labor overrides require a canonical per-operation labor command owner",
  "shift-order readiness requires a bounded shift-execution summary projection",
] as const;

const SUPPORTED_READ_FIELDS = [
  "work-order queue and canonical selection",
  "work-order quantity, status, revision and canonical planning start date",
  "operation/task tree from PostgreSQL detail or runtime route steps",
  "operation placement and earliest scheduled start from planning slots",
  "bounded duration estimate from operation labor/execution context or slot duration",
] as const;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown, fallback = 0): number => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asNonNegative = (value: unknown): number => Math.max(0, asNumber(value));
const asPositiveQuantity = (value: unknown, fallback = 1): number => Math.max(1, asNumber(value, fallback));
const own = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function exactDate(value: unknown): string {
  const candidate = asText(value);
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() === Number(match[2]) - 1
    && parsed.getUTCDate() === Number(match[3])
    ? candidate
    : "";
}

function dateTime(value: unknown): Date | null {
  const parsed = new Date(asText(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateLabel(value: unknown): string {
  const date = exactDate(value);
  if (!date) return "не задан";
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function formatCount(value: number, forms: [string, string, string]): string {
  const count = Math.max(0, Math.round(value));
  const lastTwo = count % 100;
  const last = count % 10;
  const form = lastTwo >= 11 && lastTwo <= 14 ? forms[2] : last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
  return `${count.toLocaleString("ru-RU")} ${form}`;
}

function formatDuration(totalSeconds: number): string {
  const roundedMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (!hours) return `${minutes} мин`;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function canonicalOrder(value: unknown): UnknownRecord {
  const source = asRecord(value);
  const metadata = asRecord(source.metadata);
  const workOrderSnapshot = asRecord(metadata.workOrderSnapshot);
  const hasCanonicalDate = own(source, "planningStartDate");
  return {
    ...metadata,
    ...source,
    id: asText(source.id, asText(metadata.id)),
    number: asText(source.number, asText(workOrderSnapshot.id)),
    name: asText(source.name, asText(metadata.specificationName || metadata.name, "Заказ-наряд")),
    designation: asText(source.designation, asText(metadata.designation)),
    quantity: asNonNegative(source.quantity ?? source.planningQuantity ?? metadata.planningQuantity ?? workOrderSnapshot.quantity),
    unit: asText(source.unit, asText(metadata.unit, "шт.")),
    lifecycleStatus: asText(source.lifecycleStatus, asText(metadata.lifecycleStatus, "draft")),
    planningStatus: asText(source.planningStatus, asText(metadata.planningStatus, "draft")),
    planningStartDate: hasCanonicalDate ? exactDate(source.planningStartDate) : exactDate(metadata.planningStartDate),
    concurrencyRevision: Math.max(0, asNumber(source.concurrencyRevision ?? source.domainConcurrencyRevision ?? metadata.domainConcurrencyRevision ?? metadata.revision)),
    revision: Math.max(0, asNumber(source.revision ?? metadata.revision)),
    operationCount: Math.max(0, Math.round(asNumber(source.operationCount))),
    scheduledOperationCount: Math.max(0, Math.round(asNumber(source.scheduledOperationCount))),
    metadata,
  };
}

function routeIdFor(value: UnknownRecord): string {
  return asText(value.routeId || value.workOrderId || value.planningOrderId || asRecord(value.metadata).routeId);
}

function normalizedSlot(value: unknown): UnknownRecord | null {
  const source = asRecord(value);
  const metadata = asRecord(source.metadata);
  const id = asText(source.id, asText(metadata.id));
  if (!id) return null;
  return {
    ...metadata,
    ...source,
    id,
    routeId: routeIdFor(source),
    routeStepId: asText(source.routeStepId || source.workOrderOperationId || metadata.routeStepId),
    plannedStart: asText(source.plannedStart || metadata.plannedStart),
    plannedEnd: asText(source.plannedEnd || metadata.plannedEnd),
    status: asText(source.status, asText(metadata.status, "planned")),
    quantity: asNonNegative(source.quantity ?? metadata.quantity),
    locked: source.isLocked === true || source.locked === true || metadata.locked === true,
    workCenterId: asText(source.workCenterId || source.planningWorkCenterId || metadata.workCenterId || metadata.planningWorkCenterId),
    resourceId: asText(source.resourceId || metadata.resourceId),
  };
}

function normalizedOperation(value: unknown, slotByStepId: Map<string, UnknownRecord>): UnknownRecord | null {
  const source = asRecord(value);
  const metadata = asRecord(source.metadata);
  const executionContext = { ...asRecord(metadata.executionContext), ...asRecord(source.executionContext) };
  const labor = { ...asRecord(metadata.labor), ...asRecord(source.labor) };
  const id = asText(source.id || source.routeStepId || metadata.id || metadata.routeStepId);
  if (!id) return null;
  const embeddedSlot = normalizedSlot(source.slot);
  return {
    ...metadata,
    ...source,
    id,
    routeId: routeIdFor(source) || routeIdFor(metadata),
    operationId: asText(source.operationId || metadata.operationId),
    operationName: asText(source.name || source.operationName || metadata.operationName, "Операция"),
    workCenterId: asText(source.workCenterId || source.routeWorkCenterId || metadata.workCenterId || metadata.routeWorkCenterId),
    nextWorkCenterId: asText(source.nextWorkCenterId || metadata.nextWorkCenterId),
    quantityMultiplier: asPositiveQuantity(source.quantityMultiplier ?? metadata.quantityMultiplier ?? metadata.specTaskQuantity),
    sequenceNo: asNumber(source.sequenceNo ?? source.stepOrder ?? metadata.sequenceNo ?? metadata.stepOrder, Number.MAX_SAFE_INTEGER),
    executionContext,
    labor,
    slot: embeddedSlot || slotByStepId.get(id) || null,
  };
}

function orderStatus(order: UnknownRecord): PlanningProductionStatus {
  const planningStatus = asText(order.planningStatus).toLocaleLowerCase("ru-RU");
  const lifecycleStatus = asText(order.lifecycleStatus).toLocaleLowerCase("ru-RU");
  if (["scheduled", "planned", "in_progress", "active"].includes(planningStatus)) return { label: "В плане", tone: "ok" };
  if (["completed", "done", "closed"].includes(planningStatus) || ["completed", "done", "closed"].includes(lifecycleStatus)) return { label: "Завершён", tone: "ok" };
  if (["canceled", "cancelled", "archived"].includes(planningStatus) || ["canceled", "cancelled", "archived"].includes(lifecycleStatus)) return { label: "Отменён", tone: "neutral" };
  if (["released", "approved"].includes(lifecycleStatus)) return { label: "Подготовка", tone: "warning" };
  return { label: "Черновик", tone: "neutral" };
}

function routeDocumentLabel(order: UnknownRecord): string {
  const kind = asText(order.routeDocumentKind || asRecord(order.metadata).routeDocumentKind).toLocaleLowerCase("ru-RU");
  if (["main", "primary", "root"].includes(kind)) return "Основной";
  if (["component", "child"].includes(kind)) return "Комплектующая";
  return asText(order.routeDocumentKind || asRecord(order.metadata).routeDocumentKind, "Заказ-наряд");
}

function durationSeconds(operation: UnknownRecord, quantity: number): number {
  const labor = asRecord(operation.labor);
  const context = asRecord(operation.executionContext);
  const direct = asNonNegative(labor.totalSeconds ?? labor.durationSeconds ?? context.totalSeconds ?? context.durationSeconds);
  if (direct > 0) return direct;
  const setupSeconds = asNonNegative(labor.setupSeconds ?? context.setupSeconds)
    || asNonNegative(labor.setupMin ?? context.setupMin) * 60;
  const fixedSeconds = asNonNegative(labor.fixedSeconds ?? context.fixedSeconds)
    || asNonNegative(labor.fixedMinutes ?? context.fixedMinutes) * 60;
  const secondsPerUnit = asNonNegative(labor.secondsPerUnit ?? context.secondsPerUnit)
    || asNonNegative(labor.minutesPerUnit ?? context.minutesPerUnit) * 60;
  if (secondsPerUnit > 0) return setupSeconds + fixedSeconds + quantity * secondsPerUnit;
  const unitsPerHour = asNonNegative(labor.unitsPerHour ?? context.unitsPerHour);
  if (unitsPerHour > 0) return setupSeconds + fixedSeconds + (quantity / unitsPerHour) * 60 * 60;
  const boardsPerPanel = asPositiveQuantity(labor.boardsPerPanel ?? context.boardsPerPanel, 1);
  const secondsPerPanel = asNonNegative(labor.secondsPerPanel ?? context.secondsPerPanel);
  if (secondsPerPanel > 0) return setupSeconds + fixedSeconds + Math.ceil(quantity / boardsPerPanel) * secondsPerPanel;
  const slot = asRecord(operation.slot);
  const start = dateTime(slot.plannedStart);
  const end = dateTime(slot.plannedEnd);
  return start && end && end > start ? (end.getTime() - start.getTime()) / 1000 : 0;
}

function operationContext(operation: UnknownRecord): { label: string; caption: string } {
  const context = asRecord(operation.executionContext);
  const lookup = [operation.operationName, operation.workCenterId, context.calculationType]
    .map((value) => asText(value).toLocaleLowerCase("ru-RU"))
    .join(" ");
  if (context.isWarehouseOperation === true || /склад|комплект|прием|приём/.test(lookup)) return { label: "склад", caption: "операция" };
  if (asText(context.resourceId) || /machine|equipment|components|smt|линия|станок/.test(lookup)) return { label: "станок", caption: "ресурс" };
  if (/manual|ручн|tht|выводн/.test(lookup)) return { label: "ручной", caption: "исполнители" };
  return { label: "маршрут", caption: "операция" };
}

function taskId(operation: UnknownRecord): string {
  return asText(operation.specTaskId || operation.routeTaskId || operation.sourceTaskId, "__main__");
}

function taskTitle(operation: UnknownRecord, order: UnknownRecord): string {
  return asText(operation.specTaskName || operation.routeTaskName || operation.taskName, asText(order.name, "Заказ-наряд"));
}

function lineLabel(operation: UnknownRecord, workCentersById: Map<string, UnknownRecord>): string {
  const id = asText(operation.workCenterId);
  const center = workCentersById.get(id);
  return asText(operation.workCenterName || operation.department || center?.name || center?.label, id || "ресурс не выбран");
}

function buildRows({
  order,
  operations,
  selectedItem,
  collapsedTreeIds,
  workCentersById,
}: {
  order: UnknownRecord;
  operations: UnknownRecord[];
  selectedItem: string;
  collapsedTreeIds: Set<string>;
  workCentersById: Map<string, UnknownRecord>;
}): { rows: PlanningProductionStructureRow[]; missingDuration: number; missingContext: number; taskCount: number } {
  const grouped = new Map<string, UnknownRecord[]>();
  operations.forEach((operation) => {
    const id = taskId(operation);
    const entries = grouped.get(id) || [];
    entries.push(operation);
    grouped.set(id, entries);
  });
  if (!grouped.size) grouped.set("__main__", []);
  const rows: PlanningProductionStructureRow[] = [];
  let missingDuration = 0;
  let missingContext = 0;
  [...grouped.entries()].forEach(([id, taskOperations], taskIndex) => {
    const sample = taskOperations[0] || {};
    const taskItemId = `task:${id}`;
    const expanded = !collapsedTreeIds.has(taskItemId);
    const operationDurations = taskOperations.map((operation) => {
      const operationQuantity = asPositiveQuantity(order.quantity) * asPositiveQuantity(operation.quantityMultiplier);
      return durationSeconds(operation, operationQuantity);
    });
    const taskMissingDuration = operationDurations.filter((value) => value <= 0).length;
    const taskMissingContext = taskOperations.filter((operation) => !asText(operation.workCenterId)).length;
    missingDuration += taskMissingDuration;
    missingContext += taskMissingContext;
    const totalDuration = operationDurations.reduce((sum, value) => sum + value, 0);
    const taskQuantity = asPositiveQuantity(sample.specTaskQuantity ?? sample.taskQuantity, 1);
    const taskReady = taskOperations.length > 0 && taskMissingDuration === 0 && taskMissingContext === 0;
    rows.push({
      id: taskItemId,
      kind: "task",
      level: Math.max(0, Math.round(asNumber(sample.specTaskLevel ?? sample.taskLevel))),
      title: taskTitle(sample, order),
      meta: asText(sample.parentTitle || sample.specTaskParentName, taskIndex === 0 ? "главное изделие" : "составная часть"),
      labor: expanded ? (totalDuration > 0 ? formatDuration(totalDuration) : `${taskOperations.length} операций`) : `${taskOperations.length} операций`,
      laborMeta: expanded ? formatCount(taskOperations.length, ["операция", "операции", "операций"]) : "откройте объект",
      context: "объект",
      contextMeta: id === "__main__" ? "основной" : "дочерний",
      quantity: asPositiveQuantity(order.quantity) * taskQuantity,
      unit: asText(sample.specTaskUnit || sample.taskUnit, asText(order.unit, "шт.")),
      status: taskReady ? { label: "готово", tone: "ok" } : { label: taskOperations.length ? "проверьте" : "нет операций", tone: "warning" },
      selected: taskItemId === selectedItem,
      expanded,
    });
    if (!expanded) return;
    taskOperations.forEach((operation, operationIndex) => {
      const id = asText(operation.id);
      const operationQuantity = asPositiveQuantity(order.quantity) * asPositiveQuantity(operation.quantityMultiplier);
      const seconds = operationDurations[operationIndex];
      const context = operationContext(operation);
      const hasContext = Boolean(asText(operation.workCenterId));
      const ready = seconds > 0 && hasContext;
      rows.push({
        id: `step:${id}`,
        kind: "step",
        level: Math.max(0, Math.round(asNumber(sample.specTaskLevel ?? sample.taskLevel))) + 1,
        title: asText(operation.operationName, "Операция"),
        meta: lineLabel(operation, workCentersById),
        labor: seconds > 0 ? formatDuration(seconds) : "нет оценки",
        laborMeta: seconds > 0 ? "PostgreSQL / runtime" : "нет расчета",
        context: context.label,
        contextMeta: context.caption,
        quantity: operationQuantity,
        unit: asText(order.unit, "шт."),
        status: ready ? { label: "готово", tone: "ok" } : { label: "проверьте", tone: "warning" },
        selected: `step:${id}` === selectedItem,
      });
    });
  });
  return { rows, missingDuration, missingContext, taskCount: grouped.size };
}

function readInput(value: unknown): {
  source: UnknownRecord;
  orders: UnknownRecord[];
  detail: UnknownRecord | null;
  activeRouteId: string;
  projectionSource: PlanningWorkbenchProductionModel["projectionSource"];
} {
  const source = asRecord(value);
  const bootstrap = asRecord(source.bootstrap || source.workOrders || source.workOrderBootstrap);
  const projection = asRecord(source.projection || source.runtimeProjection || source.planning);
  const listValues = asArray(bootstrap.items).length ? asArray(bootstrap.items)
    : asArray(source.items).length ? asArray(source.items)
      : asArray(projection.routes).length ? asArray(projection.routes)
        : asArray(source.routes);
  const listedOrders = listValues.map(canonicalOrder).filter((order) => asText(order.id));
  const requestedId = asText(source.activeRouteId || bootstrap.activeId || projection.activeRouteId || source.activeId);
  const rawDetail = Object.keys(asRecord(bootstrap.item)).length ? asRecord(bootstrap.item)
    : Object.keys(asRecord(source.item || source.activeRoute)).length ? asRecord(source.item || source.activeRoute)
      : null;
  const canonicalDetail = rawDetail ? canonicalOrder(rawDetail) : null;
  const orders = canonicalDetail && !listedOrders.some((order) => asText(order.id) === asText(canonicalDetail.id))
    ? [canonicalDetail, ...listedOrders]
    : listedOrders;
  const activeRouteId = asText(canonicalDetail?.id, requestedId || asText(orders[0]?.id));
  const detail = canonicalDetail || (projection.routes || source.routes
    ? orders.find((order) => asText(order.id) === activeRouteId) || null
    : null);
  const server = asText(bootstrap.storageMode || source.storageMode).toLocaleLowerCase("ru-RU") === "postgres"
    || asText(bootstrap.storageBackend || source.storageBackend).toLocaleLowerCase("ru-RU") === "postgresql"
    || asArray(bootstrap.items).length > 0
    || asArray(source.items).length > 0;
  return { source, orders, detail, activeRouteId, projectionSource: server ? "server" : orders.length ? "runtime-projection" : "unavailable" };
}

export function isPlanningWorkbenchProductionInput(value: unknown): boolean {
  const source = asRecord(value);
  const bootstrap = asRecord(source.bootstrap || source.workOrders || source.workOrderBootstrap);
  const projection = asRecord(source.projection || source.runtimeProjection || source.planning);
  return asArray(source.items).length > 0
    || asArray(source.routes).length > 0
    || asArray(bootstrap.items).length > 0
    || asArray(projection.routes).length > 0
    || Object.keys(asRecord(source.item || source.activeRoute || bootstrap.item)).length > 0;
}

export function buildPlanningWorkbenchProductionModel(value: unknown): PlanningWorkbenchProductionModel {
  const { source, orders, detail, activeRouteId, projectionSource } = readInput(value);
  const bootstrap = asRecord(source.bootstrap || source.workOrders || source.workOrderBootstrap);
  const projection = asRecord(source.projection || source.runtimeProjection || source.planning);
  const rawDetail = asRecord(bootstrap.item || source.item || source.activeRoute);
  const rawOperations = asArray(rawDetail.operations).length ? asArray(rawDetail.operations)
    : asArray(source.operations).length ? asArray(source.operations)
      : asArray(projection.routeSteps).length ? asArray(projection.routeSteps)
        : asArray(source.routeSteps);
  const rawSlots = [
    ...asArray(source.slots),
    ...asArray(projection.slots),
  ];
  const slotByStepId = new Map<string, UnknownRecord>();
  rawSlots.map(normalizedSlot).filter((slot): slot is UnknownRecord => Boolean(slot)).forEach((slot) => {
    const stepId = asText(slot.routeStepId);
    if (stepId && (!routeIdFor(slot) || routeIdFor(slot) === activeRouteId) && !slotByStepId.has(stepId)) slotByStepId.set(stepId, slot);
  });
  const operations = rawOperations
    .map((operation) => normalizedOperation(operation, slotByStepId))
    .filter((operation): operation is UnknownRecord => Boolean(operation))
    .filter((operation) => !routeIdFor(operation) || routeIdFor(operation) === activeRouteId)
    .sort((left, right) => asNumber(left.sequenceNo, Number.MAX_SAFE_INTEGER) - asNumber(right.sequenceNo, Number.MAX_SAFE_INTEGER)
      || asText(left.id).localeCompare(asText(right.id), "ru"));
  const workCentersById = new Map(asArray(source.workCenters || projection.workCenters)
    .map(asRecord)
    .map((center) => [asText(center.id), center] as const)
    .filter(([id]) => Boolean(id)));
  const selectedItem = asText(source.selectedItem || source.activeWorkItem, operations[0] ? `task:${taskId(operations[0])}` : "task:__main__");
  const collapsedTreeIds = new Set(asArray(source.collapsedTreeIds || source.planningOrderCollapsedTreeIds).map((value) => asText(value)).filter(Boolean));
  const detailLoading = Boolean(activeRouteId && projectionSource === "server" && !Object.keys(rawDetail).length);
  const activeOrder = detail && asText(detail.id) === activeRouteId ? detail : orders.find((order) => asText(order.id) === activeRouteId) || null;
  const queue = orders.map((order): PlanningProductionQueueItem => ({
    id: asText(order.id),
    title: [asText(order.number), asText(order.name)].filter(Boolean).join(" · ") || "Заказ-наряд",
    meta: `${routeDocumentLabel(order)} · ${asNonNegative(order.quantity).toLocaleString("ru-RU")} ${asText(order.unit, "шт.")}`,
    operationCount: Math.max(0, Math.round(asNumber(order.operationCount))),
    status: orderStatus(order),
    active: asText(order.id) === activeRouteId,
  }));
  const activeQuantity = activeOrder ? asNonNegative(activeOrder.quantity) : 0;
  const planningStartDate = activeOrder ? exactDate(activeOrder.planningStartDate) : "";
  const slots = operations.map((operation) => asRecord(operation.slot)).filter((slot) => asText(slot.id));
  const scheduledDates = slots.map((slot) => dateTime(slot.plannedStart)).filter((date): date is Date => Boolean(date)).sort((left, right) => left.getTime() - right.getTime());
  const serverScheduledStartDate = scheduledDates[0]?.toISOString().slice(0, 10) || "";
  const coverage: PlanningProductionCoverage = {
    contract: "postgres-runtime-read-v1",
    supported: SUPPORTED_READ_FIELDS,
    deferred: PLANNING_WORKBENCH_DEFERRED_READ_FIELDS,
  };
  if (!activeOrder || detailLoading) {
    return {
      activeRouteId,
      activeQuantity,
      headerDescription: activeRouteId ? "Загружаем выбранный заказ-наряд" : "Выберите заказ-наряд",
      projectionSource,
      detailLoading,
      queue,
      overview: null,
      concurrencyRevision: activeOrder ? Math.max(0, asNumber(activeOrder.concurrencyRevision)) : 0,
      planningStartDate,
      planningStartDateSource: projectionSource === "server" && activeOrder ? "server-owner" : "unavailable",
      serverScheduledStartDate,
      serverScheduledStartDateSource: projectionSource === "server" && activeOrder ? (serverScheduledStartDate ? "server-slot" : "server-unplanned") : "unavailable",
      readModelCoverage: coverage,
    };
  }
  const tree = buildRows({ order: activeOrder, operations, selectedItem, collapsedTreeIds, workCentersById });
  const explicitSupply = asRecord(source.supplySummary || activeOrder.supplySummary);
  const stockCount = Math.max(0, Math.round(asNumber(explicitSupply.stock)));
  const produceCount = Math.max(0, Math.round(asNumber(explicitSupply.produce, tree.taskCount - stockCount)));
  const supplyBlocking = Math.max(0, Math.round(asNumber(explicitSupply.blocking)));
  const expected = operations.length || Math.max(0, Math.round(asNumber(activeOrder.operationCount)));
  const planned = operations.filter((operation) => asText(asRecord(operation.slot).id)).length
    || Math.min(expected, Math.max(0, Math.round(asNumber(activeOrder.scheduledOperationCount))));
  const scheduleMissing = Math.max(0, expected - planned);
  const rawShiftOrders = asArray(source.shiftOrders || projection.shiftOrders || activeOrder.shiftOrders);
  const shiftOrders = rawShiftOrders.filter((order) => !routeIdFor(asRecord(order)) || routeIdFor(asRecord(order)) === activeRouteId);
  const revision = Math.max(0, asNumber(asRecord(activeOrder.documentRevisionSnapshot).specificationRevision ?? activeOrder.revision));
  const blockers: Array<{ id: string; label: string }> = [];
  if (!operations.length) blockers.push({ id: "schedule", label: "нет операций" });
  if (supplyBlocking) blockers.push({ id: "supply", label: `${formatCount(supplyBlocking, ["проблема", "проблемы", "проблем"])} в составе` });
  if (tree.missingContext) blockers.push({ id: "chain", label: `${formatCount(tree.missingContext, ["операция", "операции", "операций"])} без участка` });
  if (tree.missingDuration) blockers.push({ id: "duration", label: `${formatCount(tree.missingDuration, ["операция", "операции", "операций"])} без длительности` });
  const isPlanned = expected > 0 && scheduleMissing === 0;
  const isReady = blockers.length === 0;
  const decision: PlanningProductionDecision = {
    title: isReady ? (isPlanned ? "Заказ-наряд размещен в Ганте" : "Готов к передаче в план") : (isPlanned ? "Размещен, есть проблемы для проверки" : "Не готов к передаче в план"),
    subtitle: isReady
      ? `Старт первой операции: ${formatDateLabel(planningStartDate || serverScheduledStartDate)}`
      : blockers.slice(0, 3).map((blocker) => blocker.label).join(" · "),
    tone: isReady ? "ok" : "warning",
    isReady,
    isPlanned,
    blockers,
  };
  const metrics: PlanningProductionMetric[] = [
    { id: "supply", label: "Состав", value: supplyBlocking ? formatCount(supplyBlocking, ["проблема", "проблемы", "проблем"]) : "готово", meta: `${produceCount} произв. · ${stockCount} склад`, tone: supplyBlocking ? "warning" : "ok" },
    { id: "chain", label: "Передача", value: tree.missingContext ? formatCount(tree.missingContext, ["проблема", "проблемы", "проблем"]) : "готово", meta: formatCount(operations.length, ["операция", "операции", "операций"]), tone: tree.missingContext ? "warning" : "ok" },
    { id: "duration", label: "Ревизия", value: revision || "—", meta: asText(activeOrder.sourceSpecifications2EntryId) ? "Спецификация 2.0" : "маршрутная карта", tone: tree.missingDuration ? "warning" : operations.length ? "ok" : "neutral" },
    { id: "schedule", label: "Гант", value: expected ? `${planned}/${expected}` : "нет", meta: expected ? (scheduleMissing ? `${scheduleMissing} не размещено` : "размещено") : "после передачи", tone: expected && !scheduleMissing ? "ok" : expected ? "warning" : "neutral" },
    { id: "shifts", label: "Смены", value: shiftOrders.length ? shiftOrders.length.toLocaleString("ru-RU") : "нет", meta: shiftOrders.length ? "сформированы" : "после Ганта", tone: shiftOrders.length ? "ok" : "neutral" },
  ];
  return {
    activeRouteId,
    activeQuantity,
    headerDescription: `${routeDocumentLabel(activeOrder)} · ${activeQuantity.toLocaleString("ru-RU")} ${asText(activeOrder.unit, "шт.")} · ${formatCount(tree.taskCount, ["объект", "объекта", "объектов"])} · ${formatCount(operations.length, ["операция", "операции", "операций"])}`,
    projectionSource,
    detailLoading: false,
    queue,
    overview: { planningQuantity: activeQuantity, decision, metrics, rows: tree.rows },
    concurrencyRevision: Math.max(0, asNumber(activeOrder.concurrencyRevision)),
    planningStartDate,
    planningStartDateSource: projectionSource === "server" ? "server-owner" : "unavailable",
    serverScheduledStartDate,
    serverScheduledStartDateSource: projectionSource === "server" ? (serverScheduledStartDate ? "server-slot" : "server-unplanned") : "unavailable",
    readModelCoverage: coverage,
  };
}
