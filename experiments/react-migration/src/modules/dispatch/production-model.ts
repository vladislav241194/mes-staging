type UnknownRecord = Record<string, unknown>;

export type DispatchStatusTone = "success" | "warning" | "neutral";

export interface DispatchExecutor {
  id: string;
  name: string;
  quantity: number;
}

export interface DispatchRow {
  id: string;
  sourceRowId: string;
  slotId: string;
  routeId: string;
  operationId: string;
  documentNumber: string;
  orderLabel: string;
  operationName: string;
  workCenterId: string;
  workCenterLabel: string;
  timeLabel: string;
  plannedQuantity: number;
  assignedQuantity: number;
  factQuantity: number;
  defectQuantity: number;
  remainingQuantity: number;
  unit: string;
  executors: DispatchExecutor[];
  status: { id: string; label: string; tone: DispatchStatusTone };
  assignmentId: string;
  carryoverId: string;
  carryoverReason: string;
  updatedAt: string;
}

export interface DispatchProductionModel {
  productionBacked: boolean;
  dateKey: string;
  windowLabel: string;
  rows: DispatchRow[];
  totals: {
    planned: number;
    assigned: number;
    fact: number;
    defects: number;
    remaining: number;
  };
  counts: {
    planned: number;
    assigned: number;
    withFact: number;
    carryovers: number;
  };
  readModelCoverage: {
    contract: "postgres-dispatch-read-v1";
    coverageComplete: boolean;
    serverAuthoritative: boolean;
    planningRevision: number;
    supported: readonly string[];
    deferred: readonly string[];
  };
}

export const DISPATCH_PRODUCTION_SUPPORTED = [
  "PostgreSQL Planning routes, operations and slots for the selected shift window",
  "bounded PostgreSQL Shift Execution assignments, executors and latest facts",
  "active PostgreSQL carryovers for the selected shift scope",
  "System Domains employee and work-center display names when available",
  "read-only operational totals and status rows without the legacy renderer",
] as const;

export const DISPATCH_PRODUCTION_DEFERRED = [
  "assignment and fact commands",
  "manual dispatch resequencing and resource balancing",
  "historical pagination outside the selected shift window",
  "Pilot browser acceptance for the permanent React route",
] as const;

const WORK_CENTER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  D1: "D-WAREHOUSE",
  D3: "D-SMT",
  D3_AOI: "S-AOI",
  D3_UW: "S-WASH",
  D4: "D-QC",
  D5: "D-MANUAL",
  D6: "D-PROGRAMMING",
  D9: "S-LOCKSMITH-1",
  D11: "S-PACKING",
});

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const firstText = (...values: unknown[]): string => values.map((value) => text(value)).find(Boolean) || "";
const number = (value: unknown): number => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

function timestamp(value: unknown): number {
  const parsed = new Date(text(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function indexById(value: unknown): Map<string, UnknownRecord> {
  return new Map(asArray(value).flatMap((entry) => {
    const row = asRecord(entry);
    const id = text(row.id);
    return id ? [[id, row] as const] : [];
  }));
}

function resolveRegistries(input: UnknownRecord): UnknownRecord {
  const systemDomains = asRecord(input.systemDomains);
  return Object.keys(asRecord(systemDomains.registries)).length
    ? asRecord(systemDomains.registries)
    : asRecord(input.registries);
}

function resolveWindow(input: UnknownRecord, shiftExecution: UnknownRecord) {
  const source = { ...asRecord(shiftExecution.scope), ...asRecord(input.window) };
  const dateKey = firstText(source.dateKey, text(source.start).slice(0, 10));
  const start = new Date(firstText(source.start, dateKey ? `${dateKey}T00:00:00.000Z` : ""));
  const end = new Date(firstText(source.end, Number.isFinite(start.getTime()) ? new Date(start.getTime() + 86_400_000).toISOString() : ""));
  return {
    dateKey,
    start: Number.isFinite(start.getTime()) ? start : null,
    end: Number.isFinite(end.getTime()) ? end : null,
    label: firstText(source.label, dateKey ? `Смена ${dateKey.split("-").reverse().join(".")}` : "Текущая смена"),
  };
}

function overlapsWindow(slot: UnknownRecord, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return true;
  const slotStart = new Date(firstText(slot.plannedStart, slot.start));
  const slotEnd = new Date(firstText(slot.plannedEnd, slot.end));
  return Number.isFinite(slotStart.getTime())
    && Number.isFinite(slotEnd.getTime())
    && slotStart < end
    && slotEnd > start;
}

function formatTime(value: unknown): string {
  const raw = text(value);
  return raw.match(/T(\d{2}:\d{2})/)?.[1] || raw.match(/\b(\d{2}:\d{2})\b/)?.[1] || "";
}

function formatTimeRange(start: unknown, end: unknown): string {
  const from = formatTime(start);
  const to = formatTime(end);
  return from && to ? `${from}–${to}` : "время не задано";
}

function shortPersonName(value: unknown, fallback = "Исполнитель"): string {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return (parts.length > 2 ? parts.slice(0, 2) : parts).join(" ") || fallback;
}

function workCenterRecord(workCenterId: string, workCenters: Map<string, UnknownRecord>): UnknownRecord {
  const alias = WORK_CENTER_ALIASES[workCenterId] || "";
  const reverseAlias = Object.entries(WORK_CENTER_ALIASES).find(([, value]) => value === workCenterId)?.[0] || "";
  return workCenters.get(workCenterId) || workCenters.get(alias) || workCenters.get(reverseAlias) || {};
}

function latestFact(assignment: UnknownRecord): UnknownRecord {
  return asArray(assignment.facts).map(asRecord).sort((left, right) => (
    timestamp(right.reportedAt ?? right.updatedAt) - timestamp(left.reportedAt ?? left.updatedAt)
    || text(right.id).localeCompare(text(left.id), "ru")
  ))[0] || {};
}

function dispatchStatus({ assignment, fact, carryover, planned, assigned, good }: {
  assignment: UnknownRecord;
  fact: UnknownRecord;
  carryover: UnknownRecord;
  planned: number;
  assigned: number;
  good: number;
}): DispatchRow["status"] {
  if (text(carryover.id) || number(carryover.remainingQuantity) > 0) return { id: "carryover", label: "Перенос", tone: "warning" };
  if (Object.keys(fact).length) {
    return good >= planned && planned > 0
      ? { id: "closed", label: "Факт закрыт", tone: "success" }
      : { id: "fact-partial", label: "Частичный факт", tone: "warning" };
  }
  if (text(assignment.id) || assigned > 0) {
    return assigned >= planned && planned > 0
      ? { id: "assigned", label: "Назначено", tone: "success" }
      : { id: "assigned-partial", label: "Назначено частично", tone: "warning" };
  }
  return { id: "planned", label: "В плане", tone: "neutral" };
}

export function buildDispatchProductionModel(inputValue: unknown): DispatchProductionModel {
  const input = asRecord(inputValue);
  const planning = asRecord(input.planning);
  const shiftExecution = asRecord(input.shiftExecution);
  const readState = asRecord(input.readState);
  const registries = resolveRegistries(input);
  const window = resolveWindow(input, shiftExecution);
  const routes = indexById(planning.routes);
  const steps = indexById(planning.routeSteps);
  const employees = indexById(registries.employees);
  const workCenters = indexById(registries.workCenters);
  const assignments = asArray(shiftExecution.items).map(asRecord);
  const assignmentBySourceRowId = new Map(assignments.flatMap((assignment) => {
    const id = text(assignment.sourceRowId);
    return id ? [[id, assignment] as const] : [];
  }));
  const assignmentBySlotId = new Map(assignments.flatMap((assignment) => {
    const id = text(assignment.sourceSlotId);
    return id ? [[id, assignment] as const] : [];
  }));
  const carryovers = asArray(shiftExecution.carryovers).map(asRecord);
  const matchedCarryoverIds = new Set<string>();

  const planningRows = asArray(planning.slots).map(asRecord)
    .filter((slot) => overlapsWindow(slot, window.start, window.end))
    .flatMap((slot): DispatchRow[] => {
      const slotId = text(slot.id);
      if (!slotId) return [];
      const sourceRowId = `${slotId}::${window.dateKey}`;
      const assignment = assignmentBySourceRowId.get(sourceRowId) || assignmentBySlotId.get(slotId) || {};
      const operationId = firstText(assignment.operationId, slot.routeStepId, slot.operationId);
      const step = steps.get(operationId) || {};
      const routeId = firstText(assignment.workOrderId, slot.routeId, step.routeId);
      const route = routes.get(routeId) || {};
      const workCenterId = firstText(assignment.workCenterId, slot.workCenterId, slot.planningWorkCenterId, step.planningWorkCenterId, step.workCenterId);
      const workCenter = workCenterRecord(workCenterId, workCenters);
      const fact = latestFact(assignment);
      const carryover = carryovers.find((candidate) => (
        firstText(candidate.sourceAssignmentId) === text(assignment.id)
        || firstText(candidate.sourceRowId) === sourceRowId
        || (firstText(candidate.sourceSlotId) === slotId && firstText(candidate.dateKey, window.dateKey) === window.dateKey)
      )) || {};
      const carryoverId = text(carryover.id);
      if (carryoverId) matchedCarryoverIds.add(carryoverId);
      const executors = asArray(assignment.executors).map(asRecord).flatMap((executor, index): DispatchExecutor[] => {
        const id = firstText(executor.employeeId, executor.id, `executor-${index + 1}`);
        const employee = employees.get(id) || {};
        const name = shortPersonName(firstText(employee.displayName, employee.name, employee.fullName, executor.employeeName, executor.name));
        return id ? [{ id, name, quantity: number(executor.quantity) }] : [];
      });
      const plannedQuantity = number(assignment.plannedQuantity ?? slot.quantity ?? route.planningQuantity ?? route.quantity);
      const assignedQuantity = executors.length
        ? executors.reduce((sum, executor) => sum + executor.quantity, 0)
        : number(assignment.assignedQuantity);
      const actualQuantity = number(fact.actualQuantity);
      const defectQuantity = number(fact.defectQuantity);
      const factQuantity = Math.max(0, actualQuantity - defectQuantity);
      const remainingQuantity = number(carryover.remainingQuantity)
        || Math.max(0, plannedQuantity - (Object.keys(fact).length ? factQuantity : assignedQuantity));
      return [{
        id: sourceRowId,
        sourceRowId,
        slotId,
        routeId,
        operationId,
        documentNumber: firstText(route.number, route.orderNumber, route.code, assignment.workOrderId, routeId, "Заказ-наряд"),
        orderLabel: firstText(route.specificationName, route.name, route.designation, route.title, "Изделие не указано"),
        operationName: firstText(step.operationName, step.name, slot.operationName, "Операция"),
        workCenterId,
        workCenterLabel: firstText(workCenter.name, workCenter.label, workCenter.code, workCenterId, "Участок не задан"),
        timeLabel: formatTimeRange(slot.plannedStart ?? slot.start, slot.plannedEnd ?? slot.end),
        plannedQuantity,
        assignedQuantity,
        factQuantity,
        defectQuantity,
        remainingQuantity,
        unit: firstText(assignment.unit, slot.unit, route.unit, "шт."),
        executors,
        status: dispatchStatus({ assignment, fact, carryover, planned: plannedQuantity, assigned: assignedQuantity, good: factQuantity }),
        assignmentId: text(assignment.id),
        carryoverId,
        carryoverReason: text(carryover.reason),
        updatedAt: firstText(fact.reportedAt, assignment.updatedAt, assignment.issuedAt),
      }];
    });

  // The bounded Shift Execution API intentionally returns date-scoped
  // carryovers even when their source assignment is outside the current
  // Planning rows. Keep those operational leftovers visible instead of
  // silently dropping them from Dispatch totals.
  const standaloneCarryoverRows = carryovers.flatMap((carryover): DispatchRow[] => {
    const carryoverId = text(carryover.id);
    if (!carryoverId || matchedCarryoverIds.has(carryoverId)) return [];
    const remainingQuantity = number(carryover.remainingQuantity);
    const routeId = firstText(carryover.workOrderId);
    const operationId = firstText(carryover.operationId);
    const route = routes.get(routeId) || {};
    const step = steps.get(operationId) || {};
    const workCenterId = firstText(carryover.workCenterId, step.planningWorkCenterId, step.workCenterId);
    const workCenter = workCenterRecord(workCenterId, workCenters);
    const sourceRowId = firstText(carryover.sourceRowId, `carryover:${carryoverId}`);
    return [{
      id: `carryover:${carryoverId}`,
      sourceRowId,
      slotId: firstText(carryover.sourceSlotId),
      routeId,
      operationId,
      documentNumber: firstText(route.number, route.orderNumber, route.code, routeId, "Заказ-наряд"),
      orderLabel: firstText(route.specificationName, route.name, route.designation, route.title, "Переходящий остаток"),
      operationName: firstText(step.operationName, step.name, "Операция"),
      workCenterId,
      workCenterLabel: firstText(workCenter.name, workCenter.label, workCenter.code, workCenterId, "Участок не задан"),
      timeLabel: "Переходящий остаток",
      plannedQuantity: remainingQuantity,
      assignedQuantity: 0,
      factQuantity: 0,
      defectQuantity: 0,
      remainingQuantity,
      unit: firstText(carryover.unit, route.unit, "шт."),
      executors: [],
      status: { id: "carryover", label: "Перенос", tone: "warning" },
      assignmentId: "",
      carryoverId,
      carryoverReason: text(carryover.reason),
      updatedAt: "",
    }];
  });

  const rows = [...planningRows, ...standaloneCarryoverRows]
    .sort((left, right) => left.timeLabel.localeCompare(right.timeLabel, "ru") || left.documentNumber.localeCompare(right.documentNumber, "ru"));

  const totals = rows.reduce((result, row) => ({
    planned: result.planned + row.plannedQuantity,
    assigned: result.assigned + row.assignedQuantity,
    fact: result.fact + row.factQuantity,
    defects: result.defects + row.defectQuantity,
    remaining: result.remaining + row.remainingQuantity,
  }), { planned: 0, assigned: 0, fact: 0, defects: 0, remaining: 0 });

  const readStatus = text(readState.status);
  return {
    productionBacked: readStatus === "ready"
      && readState.productionBacked !== false
      && readState.coverageComplete === true
      && readState.serverAuthoritative === true,
    dateKey: window.dateKey,
    windowLabel: window.label,
    rows,
    totals,
    counts: {
      planned: rows.length,
      assigned: rows.filter((row) => Boolean(row.assignmentId)).length,
      withFact: rows.filter((row) => ["closed", "fact-partial", "carryover"].includes(row.status.id) && Boolean(row.updatedAt)).length,
      carryovers: rows.filter((row) => Boolean(row.carryoverId)).length,
    },
    readModelCoverage: {
      contract: "postgres-dispatch-read-v1",
      coverageComplete: readState.coverageComplete === true,
      serverAuthoritative: readState.serverAuthoritative === true,
      planningRevision: number(readState.planningRevision),
      supported: DISPATCH_PRODUCTION_SUPPORTED,
      deferred: DISPATCH_PRODUCTION_DEFERRED,
    },
  };
}
