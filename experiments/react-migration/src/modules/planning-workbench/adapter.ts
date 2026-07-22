import {
  buildPlanningWorkbenchProductionModel,
  isPlanningWorkbenchProductionInput,
  type PlanningProductionCoverage,
} from "./production-model";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const tone = (value: unknown): "success" | "warning" | "neutral" => ["ok", "success"].includes(text(value)) ? "success" : text(value) === "warning" ? "warning" : "neutral";
const exactDate = (value: unknown): string => {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || candidate.startsWith("0000-")) return "";
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : "";
};

export interface PlanningQueueItem { id: string; title: string; meta: string; operationCount: number; statusLabel: string; statusTone: "success" | "warning" | "neutral"; active: boolean }
export interface PlanningMetric { id: string; label: string; value: string; meta: string; tone: "success" | "warning" | "neutral" }
export interface PlanningStructureRow { id: string; kind: "task" | "step"; routeId: string; operationId: string; slotId: string; plannedStart: string; plannedEnd: string; locked: boolean; level: number; title: string; meta: string; labor: string; laborMeta: string; context: string; contextMeta: string; quantity: number; unit: string; statusLabel: string; statusTone: "success" | "warning" | "neutral"; selected: boolean }
export interface PlanningStartDateReconciliation { routeId: string; planningStartDate: string | null; intent: "set" | "clear"; expectedRevision: number; idempotencyKey: string; status: "submitting" | "transport-unknown" | "readback-pending" | "rollback-pending"; message: string }

export const PLANNING_WORKBENCH_COMMAND_OWNER_BLOCKERS = Object.freeze({
  laborEdit: "Нет PostgreSQL owner/API/capability для изменения трудозатрат операции.",
  transferToGantt: "Нет PostgreSQL owner/API/capability для первичного размещения заказ-наряда в Ганте.",
  cancel: "Нет PostgreSQL owner/API/capability для отмены заказ-наряда и снятия его слотов.",
});

export function adaptPlanningWorkbench(payload: unknown) {
  const root = record(payload);
  const productionInput = record(root.productionModel);
  const hasProductionInput = Object.keys(productionInput).length > 0
    ? isPlanningWorkbenchProductionInput(productionInput)
    : isPlanningWorkbenchProductionInput(root);
  const source = record(root.model || (hasProductionInput
    ? buildPlanningWorkbenchProductionModel(Object.keys(productionInput).length ? productionInput : root)
    : payload));
  const capabilities = record(root.capabilities || productionInput.capabilities);
  const employeeAuth = record(root.employeeAuth || productionInput.employeeAuth);
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
    return id && title ? { id, kind, routeId: text(item.routeId), operationId: text(item.operationId), slotId: text(item.slotId), plannedStart: text(item.plannedStart), plannedEnd: text(item.plannedEnd), locked: item.locked === true, level: Math.max(0, number(item.level)), title, meta: text(item.meta), labor: text(item.labor, "—"), laborMeta: text(item.laborMeta), context: text(item.context, "—"), contextMeta: text(item.contextMeta), quantity: number(item.quantity), unit: text(item.unit, "шт."), statusLabel: text(status.label, "не определено"), statusTone: tone(status.tone), selected: item.selected === true } : null;
  }).filter(Boolean) as PlanningStructureRow[];
  const activeRouteId = text(source.activeRouteId);
  const reconciliation = record(root.startDateReconciliation || productionInput.startDateReconciliation);
  const reconciliationRouteId = text(reconciliation.routeId);
  const reconciliationOwnsDate = Object.prototype.hasOwnProperty.call(reconciliation, "planningStartDate");
  const reconciliationDate = reconciliation.planningStartDate === null
    ? null
    : exactDate(reconciliation.planningStartDate);
  const reconciliationIntent = text(reconciliation.intent);
  const reconciliationRevision = number(reconciliation.expectedRevision);
  const reconciliationKey = text(reconciliation.idempotencyKey);
  const reconciliationStatus = text(reconciliation.status);
  const startDateReconciliation: PlanningStartDateReconciliation | null = reconciliationRouteId === activeRouteId
    && reconciliationOwnsDate
    && (reconciliationIntent === "clear" ? reconciliationDate === null : reconciliationIntent === "set" ? Boolean(reconciliationDate) : false)
    && Number.isInteger(reconciliationRevision)
    && reconciliationRevision > 0
    && reconciliationKey.startsWith("planning-start-date:")
    && reconciliationKey.length <= 160
    && ["submitting", "transport-unknown", "readback-pending", "rollback-pending"].includes(reconciliationStatus)
    ? {
        routeId: reconciliationRouteId,
        planningStartDate: reconciliationDate,
        intent: reconciliationIntent as PlanningStartDateReconciliation["intent"],
        expectedRevision: reconciliationRevision,
        idempotencyKey: reconciliationKey,
        status: reconciliationStatus as PlanningStartDateReconciliation["status"],
        message: text(reconciliation.message),
      }
    : null;
  const planningStartDate = exactDate(source.planningStartDate);
  const planningStartDateSource = text(source.planningStartDateSource) === "server-owner" ? "server-owner" as const : "unavailable" as const;
  const serverScheduledStartDate = exactDate(source.serverScheduledStartDate);
  const serverScheduledStartDateSource = ["server-slot", "server-unplanned"].includes(text(source.serverScheduledStartDateSource))
    ? text(source.serverScheduledStartDateSource) as "server-slot" | "server-unplanned"
    : "unavailable" as const;
  const coverage = record(source.readModelCoverage);
  const readModelCoverage: PlanningProductionCoverage | null = text(coverage.contract) === "postgres-runtime-read-v1"
    ? {
        contract: "postgres-runtime-read-v1",
        supported: list(coverage.supported).map((value) => text(value)).filter(Boolean),
        deferred: list(coverage.deferred).map((value) => text(value)).filter(Boolean),
      }
    : null;
  return {
    activeRouteId,
    headerDescription: text(source.headerDescription, "Выберите заказ-наряд"),
    projectionSource: text(source.projectionSource, "unknown"),
    detailLoading: source.detailLoading === true,
    queue,
    metrics,
    rows,
    quantity: number(overview.planningQuantity || source.activeQuantity),
    concurrencyRevision: number(source.concurrencyRevision),
    decision: { title: text(decision.title, "Заказ-наряд не выбран"), subtitle: text(decision.subtitle), tone: tone(decision.tone), isReady: decision.isReady === true, isPlanned: decision.isPlanned === true },
    canActivate: Boolean(activeRouteId && queue.length && metrics.length === 5 && rows.length),
    canEditQuantity: capabilities.quantityEdit === true,
    canEditStartDate: capabilities.startDateEdit === true,
    canEditSlotSchedule: capabilities.slotScheduleEdit === true,
    canEditLabor: capabilities.laborEdit === true,
    canTransferToGantt: capabilities.transferToGantt === true,
    canCancel: capabilities.cancel === true,
    commandOwnerBlockers: [
      ...(capabilities.laborEdit === true ? [] : [PLANNING_WORKBENCH_COMMAND_OWNER_BLOCKERS.laborEdit]),
      ...(capabilities.transferToGantt === true ? [] : [PLANNING_WORKBENCH_COMMAND_OWNER_BLOCKERS.transferToGantt]),
      ...(capabilities.cancel === true ? [] : [PLANNING_WORKBENCH_COMMAND_OWNER_BLOCKERS.cancel]),
    ],
    employeeElevationAvailable: capabilities.employeeElevation === true,
    employeeAuthStatus: text(employeeAuth.status, "idle"),
    employeeCapabilityStatus: text(employeeAuth.capabilityStatus, "idle"),
    employeeAuthMessage: text(employeeAuth.message),
    planningStartDate,
    startDateReconciliation,
    planningStartDateSource,
    serverScheduledStartDate,
    serverScheduledStartDateSource,
    readModelCoverage,
  };
}
