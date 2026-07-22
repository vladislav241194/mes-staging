export interface ShiftWorkOrderExecutor {
  id: string;
  name: string;
  quantity: number;
  note: string;
}

export interface ShiftWorkOrderStatus {
  id: string;
  label: string;
  tone: "success" | "warning" | "neutral";
}

export interface ShiftWorkOrderIssueReport {
  id: string;
  employeeName: string;
  text: string;
  createdAt: string;
  operationName: string;
  workCenterLabel: string;
  photoId: string;
  photoName: string;
  photoUrl: string;
  storageNote: string;
}

export interface ShiftWorkOrderRow {
  id: string;
  assignmentId?: string;
  sourceRowId: string;
  slotId?: string;
  routeId: string;
  routeStepId?: string;
  stepId?: string;
  documentNumber: string;
  orderLabel: string;
  routePartLabel: string;
  operationName: string;
  workCenterLabel: string;
  resourceLabel: string;
  masterName: string;
  executors: ShiftWorkOrderExecutor[];
  plannedQuantity: number;
  assignedQuantity: number;
  factQuantity: number;
  defectQuantity: number;
  remainingQuantity: number;
  unit: string;
  status: ShiftWorkOrderStatus;
  stageLabel: string;
  issuedAt: string;
  updatedAt?: string;
  dateLabel: string;
  shiftDateKey: string;
  issueReportCount: number;
  issuePhotoCount: number;
  issueReports: ShiftWorkOrderIssueReport[];
  factEditable?: boolean;
  hasFact?: boolean;
  actualQuantity?: number;
  laborMinutes?: number;
  executorCount?: number;
  factComment?: string;
  deviationComment?: string;
  transfer: {
    fromOperationName: string;
    fromWorkCenterLabel: string;
    toOperationName: string;
    toWorkCenterLabel: string;
    targetLabel: string;
    remainingQuantity: number;
  };
}

export interface ShiftWorkOrderOperationGroup {
  id: string;
  operationName: string;
  workCenterLabel: string;
  routePartLabel: string;
  plannedQuantity: number;
  assignedQuantity: number;
  factQuantity: number;
  remainingQuantity: number;
  unit: string;
  latestLabel: string;
  rows: ShiftWorkOrderRow[];
}

export interface ShiftWorkOrderDocumentGroup {
  id: string;
  label: string;
  meta: string;
  plannedQuantity: number;
  assignedQuantity: number;
  factQuantity: number;
  remainingQuantity: number;
  unit: string;
  latestLabel: string;
  rows: ShiftWorkOrderRow[];
  operations: ShiftWorkOrderOperationGroup[];
}

type UnknownRecord = Record<string, unknown>;

interface KeyedRecord {
  key: string;
  value: UnknownRecord;
}

interface ProductionIndexes {
  routes: Map<string, UnknownRecord>;
  steps: Map<string, UnknownRecord>;
  slots: Map<string, UnknownRecord>;
  employees: Map<string, UnknownRecord>;
  workCenters: Map<string, UnknownRecord>;
  facts: Map<string, UnknownRecord[]>;
  reports: Map<string, UnknownRecord[]>;
  printMetadata: Map<string, UnknownRecord>;
}

export interface ShiftWorkOrdersProductionCoverage {
  contract: "postgres-shift-work-orders-read-v1";
  supported: readonly string[];
  deferred: readonly string[];
}

export interface ShiftWorkOrdersProductionModel {
  rows: ShiftWorkOrderRow[];
  documentTree: ShiftWorkOrderDocumentGroup[];
  selectedRow: ShiftWorkOrderRow | null;
  sourceWindow: UnknownRecord;
  byStatus: Record<string, number>;
  totals: { planned: number; assigned: number; fact: number; remaining: number };
  readModelCoverage: ShiftWorkOrdersProductionCoverage;
}

export const SHIFT_WORK_ORDERS_PRODUCTION_MODEL_SUPPORTED = [
  "bounded PostgreSQL Shift Execution assignments and their latest facts",
  "active PostgreSQL carryovers for the requested shift date",
  "assignment issue reports and safe inline image metadata",
  "planning route, operation and slot labels without the Workshop renderer",
  "System Domains employee and work-center display names",
  "journal rows, document tree, selected row, totals and source-window label",
] as const;

export const SHIFT_WORK_ORDERS_PRODUCTION_MODEL_DEFERRED = [
  "historical pagination outside the bounded Shift Execution query window",
  "full work-order print package assembly and immutable print snapshots",
  "equipment/resource display names when they are absent from existing print metadata",
  "carryover provenance beyond the canonical active carryover fields",
  "write authorization and editor context, which remain command-owner concerns",
] as const;

const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNonNegative = (value: unknown): number => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
const hasOwn = (value: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function metadataRecord(value: unknown): UnknownRecord {
  const source = asRecord(value);
  return { ...asRecord(source.metadata), ...source };
}

function sourcePayload(value: unknown): UnknownRecord {
  const payload = metadataRecord(value);
  const source = metadataRecord(payload.source);
  return payload.command && Object.keys(source).length ? source : payload;
}

function keyedRecords(value: unknown): KeyedRecord[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const record = metadataRecord(entry);
      return { key: asText(record.id, String(index)), value: record };
    });
  }
  return Object.entries(asRecord(value)).map(([key, entry]) => ({ key, value: metadataRecord(entry) }));
}

function indexedRecords(value: unknown, keys: string[]): Map<string, UnknownRecord> {
  const result = new Map<string, UnknownRecord>();
  keyedRecords(value).forEach(({ key, value }) => {
    const identifiers = [key, ...keys.map((name) => asText(value[name]))].filter(Boolean);
    identifiers.forEach((identifier) => result.set(identifier, value));
  });
  return result;
}

function readInput(root: UnknownRecord, nested: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (hasOwn(root, key)) return root[key];
    if (hasOwn(nested, key)) return nested[key];
  }
  return undefined;
}

function pickText(sources: UnknownRecord[], keys: string[], fallback = ""): string {
  for (const source of sources) {
    for (const key of keys) {
      const value = asText(source[key]);
      if (value) return value;
    }
  }
  return fallback;
}

function pickNumber(sources: UnknownRecord[], keys: string[], fallback = 0): number {
  for (const source of sources) {
    for (const key of keys) {
      if (!hasOwn(source, key)) continue;
      const parsed = Number(String(source[key] ?? "").replace(",", "."));
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }
  return fallback;
}

function timestamp(value: unknown): number {
  const parsed = new Date(asText(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: unknown): string {
  const date = new Date(asText(value));
  if (!Number.isFinite(date.getTime())) return "дата не задана";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  }).format(date);
}

function exactDate(value: unknown): string {
  const candidate = asText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : "";
}

function dateKey(value: unknown): string {
  const exact = exactDate(value);
  if (exact) return exact;
  const date = new Date(asText(value));
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Moscow",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shortPersonName(value: unknown, fallback = "Исполнитель"): string {
  const parts = asText(value).split(/\s+/).filter(Boolean);
  return (parts.length > 2 ? parts.slice(0, 2) : parts).join(" ") || fallback;
}

function displayName(value: UnknownRecord, fallback = "Исполнитель"): string {
  return pickText([value], ["displayName", "name", "fullName", "employeeName"], fallback);
}

function indexRelatedRecords(value: unknown, relationKeys: string[]): Map<string, UnknownRecord[]> {
  const result = new Map<string, UnknownRecord[]>();
  const append = (key: string, record: UnknownRecord) => {
    if (!key) return;
    const current = result.get(key) || [];
    if (!current.includes(record)) current.push(record);
    result.set(key, current);
  };
  if (Array.isArray(value)) {
    keyedRecords(value).forEach(({ key, value: record }) => {
      append(key, record);
      relationKeys.forEach((relationKey) => append(asText(record[relationKey]), record));
    });
    return result;
  }
  Object.entries(asRecord(value)).forEach(([containerKey, item]) => {
    const entries = Array.isArray(item) ? item : [item];
    entries.forEach((entry) => {
      const record = metadataRecord(entry);
      append(containerKey, record);
      relationKeys.forEach((relationKey) => append(asText(record[relationKey]), record));
    });
  });
  return result;
}

function relatedRecords(index: Map<string, UnknownRecord[]>, keys: string[]): UnknownRecord[] {
  const seen = new Set<string>();
  const result: UnknownRecord[] = [];
  keys.filter(Boolean).forEach((key) => {
    (index.get(key) || []).forEach((record) => {
      const identity = asText(record.id, `${key}:${asText(record.createdAt || record.reportedAt)}:${result.length}`);
      if (seen.has(identity)) return;
      seen.add(identity);
      result.push(record);
    });
  });
  return result;
}

function latestRecord(records: UnknownRecord[]): UnknownRecord {
  return [...records].sort((left, right) => (
    timestamp(right.reportedAt || right.updatedAt || right.createdAt) - timestamp(left.reportedAt || left.updatedAt || left.createdAt)
    || asText(right.id).localeCompare(asText(left.id), "ru")
  ))[0] || {};
}

function metadataFor(index: Map<string, UnknownRecord>, keys: string[]): UnknownRecord {
  for (const key of keys) {
    if (key && index.has(key)) return index.get(key) || {};
  }
  return {};
}

function stepOrder(value: UnknownRecord): number {
  const parsed = Number(value.stepOrder ?? value.sequenceNo ?? value.index ?? Number.MAX_SAFE_INTEGER);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function nextRouteStep(current: UnknownRecord, routeId: string, steps: Map<string, UnknownRecord>): UnknownRecord {
  const currentId = asText(current.id);
  const currentOrder = stepOrder(current);
  return [...new Set(steps.values())]
    .filter((step) => asText(step.routeId || step.workOrderId || asRecord(step.metadata).routeId) === routeId && asText(step.id) !== currentId)
    .sort((left, right) => stepOrder(left) - stepOrder(right) || asText(left.id).localeCompare(asText(right.id), "ru"))
    .find((step) => stepOrder(step) > currentOrder) || {};
}

function normalizePhoto(value: unknown): UnknownRecord {
  const photo = metadataRecord(value);
  const dataUrl = asText(photo.dataUrl || photo.url);
  return {
    id: asText(photo.id),
    name: asText(photo.name || photo.fileName, "Фото проблемы"),
    dataUrl: dataUrl.startsWith("data:image/") ? dataUrl : "",
    storageNote: asText(photo.storageNote || photo.storage),
  };
}

function adaptReports(records: UnknownRecord[], row: {
  operationName: string;
  workCenterLabel: string;
  sourceRowId: string;
}): ShiftWorkOrderIssueReport[] {
  const seen = new Set<string>();
  return records.flatMap((report, index): ShiftWorkOrderIssueReport[] => {
    const id = asText(report.id, `${row.sourceRowId}:report:${index + 1}`);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const photo = normalizePhoto(report.photo || report.photoPayload);
    return [{
      id,
      employeeName: shortPersonName(report.employeeName || report.actorDisplayName, "Исполнитель"),
      text: asText(report.text || report.description, "Описание не заполнено."),
      createdAt: asText(report.createdAt) ? formatDateTime(report.createdAt) : "без даты",
      operationName: asText(report.operationName, row.operationName),
      workCenterLabel: asText(report.workCenterLabel, row.workCenterLabel),
      photoId: asText(photo.id, id),
      photoName: asText(photo.name, "Фото проблемы"),
      photoUrl: asText(photo.dataUrl),
      storageNote: asText(photo.storageNote),
    }];
  });
}

function assignmentExecutors(
  assignment: UnknownRecord,
  source: UnknownRecord,
  sheet: UnknownRecord,
  employees: Map<string, UnknownRecord>,
): ShiftWorkOrderExecutor[] {
  const candidates = [assignment.executors, source.executors, sheet.executors]
    .find((value) => Array.isArray(value) && value.length) as unknown[] | undefined;
  return asArray(candidates).flatMap((value, index): ShiftWorkOrderExecutor[] => {
    const executor = metadataRecord(value);
    const employeeId = asText(executor.employeeId || executor.id);
    const employee = employees.get(employeeId) || {};
    const quantity = asNonNegative(executor.quantity);
    if (!employeeId && !asText(executor.employeeName || executor.name) && quantity <= 0) return [];
    return [{
      id: asText(executor.id, employeeId || `executor-${index + 1}`),
      name: shortPersonName(executor.employeeName || executor.name || displayName(employee)),
      quantity,
      note: asText(executor.note),
    }];
  });
}

function statusFor({
  assignment,
  assignedQuantity,
  fact,
  remainingQuantity,
}: {
  assignment: UnknownRecord;
  assignedQuantity: number;
  fact: UnknownRecord;
  remainingQuantity: number;
}): ShiftWorkOrderStatus {
  const assignmentStatus = asText(assignment.status).toLocaleLowerCase("ru-RU");
  const hasFact = Boolean(asText(fact.id || fact.reportedAt || fact.updatedAt));
  if (hasFact && remainingQuantity > 0) return { id: "carryover", label: "остаток", tone: "warning" };
  if (hasFact || ["completed", "complete", "closed", "done"].includes(assignmentStatus)) return { id: "closed", label: "факт внесен", tone: "success" };
  if (assignment.issued === true || asText(assignment.issuedAt) || ["issued", "in_progress", "active"].includes(assignmentStatus)) return { id: "issued", label: "в работе", tone: "success" };
  if (assignedQuantity > 0 || ["assigned", "distributed"].includes(assignmentStatus)) return { id: "assigned", label: "распределено", tone: "success" };
  return { id: "planned", label: "запланировано", tone: "neutral" };
}

function stageLabel(status: ShiftWorkOrderStatus): string {
  if (status.id === "issued") return "СЗН в работе";
  if (status.id === "closed") return "СЗН с фактом";
  if (status.id === "carryover") return "СЗН с остатком";
  if (status.id === "assigned") return "сменное задание";
  return "запланировано";
}

function buildTransfer({
  operationName,
  workCenterLabel,
  routeId,
  step,
  indexes,
  remainingQuantity,
  hasFact,
}: {
  operationName: string;
  workCenterLabel: string;
  routeId: string;
  step: UnknownRecord;
  indexes: ProductionIndexes;
  remainingQuantity: number;
  hasFact: boolean;
}): ShiftWorkOrderRow["transfer"] {
  if (hasFact && remainingQuantity > 0) {
    return {
      fromOperationName: operationName,
      fromWorkCenterLabel: workCenterLabel,
      toOperationName: operationName,
      toWorkCenterLabel: workCenterLabel,
      targetLabel: "Остаток в следующую смену",
      remainingQuantity,
    };
  }
  const next = nextRouteStep(step, routeId, indexes.steps);
  const nextWorkCenterId = pickText([next], ["planningWorkCenterId", "workCenterId"]);
  const nextWorkCenter = indexes.workCenters.get(nextWorkCenterId) || {};
  if (!Object.keys(next).length) {
    return {
      fromOperationName: operationName,
      fromWorkCenterLabel: workCenterLabel,
      toOperationName: "Завершение маршрута",
      toWorkCenterLabel: "Выход маршрута",
      targetLabel: "Закрытие операции",
      remainingQuantity,
    };
  }
  return {
    fromOperationName: operationName,
    fromWorkCenterLabel: workCenterLabel,
    toOperationName: pickText([next], ["operationName", "name"], "Следующая операция"),
    toWorkCenterLabel: pickText([next], ["workCenterLabel", "workCenterName"])
      || pickText([nextWorkCenter], ["name", "label"], nextWorkCenterId || "Участок не задан"),
    targetLabel: "Следующая операция",
    remainingQuantity,
  };
}

function rowDateKey(sources: UnknownRecord[], slot: UnknownRecord): string {
  const explicit = pickText(sources, ["shiftDateKey", "dateKey", "timesheetDateKey"]);
  return exactDate(explicit) || dateKey(slot.plannedStart || slot.startsAt || pickText(sources, ["issuedAt", "updatedAt", "createdAt"]));
}

function createAssignmentRow(
  entry: KeyedRecord,
  indexes: ProductionIndexes,
  capabilities: UnknownRecord,
): ShiftWorkOrderRow | null {
  const assignment = entry.value;
  const source = sourcePayload(assignment.sourcePayload || assignment);
  const sheet = metadataRecord(source.sheetContract || assignment.sheetContract);
  const assignmentId = asText(assignment.id, entry.key);
  const sourceRowId = pickText([assignment, source, sheet], ["sourceRowId", "rowId"], entry.key);
  const slotId = pickText([assignment, source, sheet], ["sourceSlotId", "slotId"]);
  const slot = indexes.slots.get(slotId) || {};
  const routeId = pickText([assignment, source, sheet, slot], ["workOrderId", "planningOrderId", "routeId"]);
  const route = indexes.routes.get(routeId) || {};
  const stepId = pickText([assignment, source, sheet, slot], ["operationId", "stepId", "routeStepId"]);
  const step = indexes.steps.get(stepId) || {};
  const workCenterId = pickText([assignment, source, sheet, step, slot], ["workCenterId", "planningWorkCenterId"]);
  const workCenter = indexes.workCenters.get(workCenterId) || {};
  const print = metadataFor(indexes.printMetadata, [sourceRowId, assignmentId, slotId, routeId]);
  const sources = [print, sheet, source, assignment, step, slot, route];
  const id = sourceRowId || slotId || assignmentId;
  if (!id || !routeId) return null;

  const nestedFacts = [assignment.currentFact, ...asArray(assignment.facts), source.currentFact, ...asArray(source.facts)]
    .map(metadataRecord)
    .filter((fact) => Object.keys(fact).length);
  const fact = latestRecord([
    ...nestedFacts,
    ...relatedRecords(indexes.facts, [assignmentId, sourceRowId, slotId, id]),
  ]);
  const executors = assignmentExecutors(assignment, source, sheet, indexes.employees);
  const assignedQuantity = pickNumber([assignment, source, sheet], ["assignedQuantity"], executors.reduce((sum, executor) => sum + executor.quantity, 0));
  const plannedQuantity = pickNumber(sources, ["plannedQuantity", "quantity"]);
  const actualQuantity = pickNumber([fact], ["actualQuantity"]);
  const defectQuantity = pickNumber([fact], ["defectQuantity"]);
  const factQuantity = Math.max(0, actualQuantity - defectQuantity);
  const hasFact = Boolean(asText(fact.id || fact.reportedAt || fact.updatedAt));
  const linkedCarryover = latestRecord(relatedRecords(indexes.facts, [`carryover:${assignmentId}`, `carryover:${sourceRowId}`]));
  const remainingQuantity = hasFact
    ? pickNumber([linkedCarryover], ["remainingQuantity"], Math.max(0, plannedQuantity - factQuantity))
    : Math.max(0, plannedQuantity - assignedQuantity);
  const status = statusFor({ assignment: { ...source, ...assignment }, assignedQuantity, fact, remainingQuantity });
  const operationName = pickText(sources, ["operationName", "name"], "Операция");
  const workCenterLabel = pickText([print, sheet, source, assignment, step, slot], ["workCenterLabel", "workCenterName"])
    || pickText([workCenter], ["name", "label"], workCenterId || "Участок не задан");
  const reportRecords = [
    ...asArray(assignment.issueReports).map(metadataRecord),
    ...asArray(source.issueReports).map(metadataRecord),
    ...relatedRecords(indexes.reports, [assignmentId, sourceRowId, slotId, id]),
  ];
  const issueReports = adaptReports(reportRecords, { operationName, workCenterLabel, sourceRowId: id });
  const updatedAt = pickText([fact, assignment, source, sheet, slot], ["reportedAt", "updatedAt", "issuedAt", "createdAt", "plannedStart"]);
  const shiftDateKey = rowDateKey(sources, slot);
  const masterId = pickText([assignment, source, sheet], ["masterId"]);
  const master = indexes.employees.get(masterId) || {};
  const routePartLabel = pickText(sources, ["routePartLabel", "specTaskName", "taskName"], operationName);
  return {
    id,
    assignmentId,
    sourceRowId: id,
    slotId,
    routeId,
    routeStepId: stepId,
    stepId,
    documentNumber: pickText(sources, ["documentNumber", "shiftDocumentNumber", "number"], `СЗН ${id.slice(0, 8)}`),
    orderLabel: pickText([print, sheet, source, assignment, route], ["orderLabel", "objectLabel", "specificationName", "designation", "name", "number"], routeId),
    routePartLabel,
    operationName,
    workCenterLabel,
    resourceLabel: pickText(sources, ["resourceLabel", "resourceName"]),
    masterName: shortPersonName(pickText(sources, ["masterName"], displayName(master, "Мастер не назначен")), "Мастер не назначен"),
    executors,
    plannedQuantity,
    assignedQuantity,
    factQuantity,
    defectQuantity,
    remainingQuantity,
    unit: pickText(sources, ["unit"], "шт."),
    status,
    stageLabel: stageLabel(status),
    issuedAt: pickText([assignment, source, sheet], ["issuedAt"]),
    updatedAt,
    dateLabel: pickText(sources, ["dateLabel", "updatedLabel"], formatDateTime(updatedAt)),
    shiftDateKey,
    issueReportCount: issueReports.length,
    issuePhotoCount: issueReports.filter((report) => Boolean(report.photoUrl)).length,
    issueReports,
    factEditable: capabilities.factSave === true && Boolean(assignmentId),
    hasFact,
    actualQuantity,
    laborMinutes: pickNumber([fact], ["laborMinutes"]),
    executorCount: pickNumber([fact], ["executorCount"], executors.length),
    factComment: pickText([fact], ["comment"]),
    deviationComment: pickText([fact], ["deviationComment"]),
    transfer: buildTransfer({ operationName, workCenterLabel, routeId, step, indexes, remainingQuantity, hasFact }),
  };
}

function createCarryoverRow(
  carryover: UnknownRecord,
  indexes: ProductionIndexes,
  assignmentById: Map<string, UnknownRecord>,
): ShiftWorkOrderRow | null {
  if (asText(carryover.canceledAt)) return null;
  const id = asText(carryover.id);
  const sourceAssignmentId = asText(carryover.sourceAssignmentId || carryover.assignmentId);
  if (!id || !sourceAssignmentId) return null;
  const sourceAssignment = assignmentById.get(sourceAssignmentId) || {};
  const source = sourcePayload(sourceAssignment.sourcePayload || sourceAssignment);
  const sheet = metadataRecord(source.sheetContract || sourceAssignment.sheetContract);
  const sourceRowId = pickText([carryover, sourceAssignment, source, sheet], ["sourceRowId", "rowId"]);
  const slotId = pickText([carryover, sourceAssignment, source, sheet], ["sourceSlotId", "slotId"]);
  const routeId = pickText([carryover, sourceAssignment, source, sheet], ["workOrderId", "planningOrderId", "routeId"]);
  const route = indexes.routes.get(routeId) || {};
  const stepId = pickText([carryover, sourceAssignment, source, sheet], ["operationId", "stepId", "routeStepId"]);
  const step = indexes.steps.get(stepId) || {};
  const workCenterId = pickText([carryover, sourceAssignment, source, sheet, step], ["workCenterId", "planningWorkCenterId"]);
  const workCenter = indexes.workCenters.get(workCenterId) || {};
  const print = metadataFor(indexes.printMetadata, [id]);
  const sources = [print, carryover, sheet, source, sourceAssignment, step, route];
  const operationName = pickText(sources, ["operationName", "name"], "Операция");
  const workCenterLabel = pickText([print, carryover, sheet, source, sourceAssignment, step], ["workCenterLabel", "workCenterName"])
    || pickText([workCenter], ["name", "label"], workCenterId || "Участок не задан");
  const remainingQuantity = pickNumber([carryover], ["remainingQuantity"]);
  if (!routeId || remainingQuantity <= 0) return null;
  const reportRecords = relatedRecords(indexes.reports, [id, sourceAssignmentId, sourceRowId, slotId]);
  const issueReports = adaptReports(reportRecords, { operationName, workCenterLabel, sourceRowId: id });
  const carryoverDate = exactDate(carryover.dateKey) || dateKey(carryover.createdAt);
  const workCenterCode = pickText([workCenter], ["code"], workCenterId || "WC");
  const masterId = pickText([sourceAssignment, source, sheet], ["masterId"]);
  const master = indexes.employees.get(masterId) || {};
  const status: ShiftWorkOrderStatus = { id: "carryover", label: "остаток", tone: "warning" };
  return {
    id,
    assignmentId: sourceAssignmentId,
    sourceRowId: sourceRowId || id,
    slotId,
    routeId,
    routeStepId: stepId,
    stepId,
    documentNumber: pickText(sources, ["documentNumber", "shiftDocumentNumber"], `ОСТ-${carryoverDate.replaceAll("-", "")}-${workCenterCode}`),
    orderLabel: pickText([print, carryover, sheet, source, sourceAssignment, route], ["orderLabel", "objectLabel", "specificationName", "designation", "name", "number"], routeId),
    routePartLabel: pickText(sources, ["routePartLabel", "specTaskName", "taskName"], "Остаток смены"),
    operationName,
    workCenterLabel,
    resourceLabel: pickText(sources, ["resourceLabel", "resourceName"]),
    masterName: shortPersonName(pickText(sources, ["masterName"], displayName(master, "Мастер не назначен")), "Мастер не назначен"),
    executors: [],
    plannedQuantity: remainingQuantity,
    assignedQuantity: 0,
    factQuantity: 0,
    defectQuantity: 0,
    remainingQuantity,
    unit: pickText(sources, ["unit"], "шт."),
    status,
    stageLabel: stageLabel(status),
    issuedAt: asText(carryover.createdAt),
    updatedAt: asText(carryover.createdAt),
    dateLabel: asText(carryover.createdAt) ? formatDateTime(carryover.createdAt) : "дата не задана",
    shiftDateKey: carryoverDate,
    issueReportCount: issueReports.length,
    issuePhotoCount: issueReports.filter((report) => Boolean(report.photoUrl)).length,
    issueReports,
    factEditable: false,
    hasFact: false,
    actualQuantity: 0,
    laborMinutes: 0,
    executorCount: 0,
    factComment: "",
    deviationComment: "",
    transfer: buildTransfer({ operationName, workCenterLabel, routeId, step, indexes, remainingQuantity, hasFact: false }),
  };
}

function shouldInclude(row: ShiftWorkOrderRow): boolean {
  return row.status.id !== "planned"
    || row.assignedQuantity > 0
    || row.factQuantity > 0
    || row.defectQuantity > 0
    || row.executors.length > 0
    || Boolean(row.issuedAt)
    || row.issueReportCount > 0;
}

function rowTime(row: ShiftWorkOrderRow): number {
  return timestamp(row.updatedAt || row.issuedAt || row.shiftDateKey);
}

function buildDocumentTree(rows: ShiftWorkOrderRow[]): ShiftWorkOrderDocumentGroup[] {
  const documents = new Map<string, { id: string; label: string; meta: string; rows: ShiftWorkOrderRow[]; operations: Map<string, ShiftWorkOrderRow[]> }>();
  rows.forEach((row) => {
    const documentId = row.routeId || row.orderLabel || "work-order";
    const document = documents.get(documentId) || {
      id: documentId,
      label: row.orderLabel || "Заказ-наряд",
      meta: row.routePartLabel || row.operationName,
      rows: [],
      operations: new Map<string, ShiftWorkOrderRow[]>(),
    };
    document.rows.push(row);
    const operationId = row.routeStepId || row.stepId || [row.routePartLabel, row.operationName, row.workCenterLabel].filter(Boolean).join("|") || "operation";
    const operationRows = document.operations.get(operationId) || [];
    operationRows.push(row);
    document.operations.set(operationId, operationRows);
    documents.set(documentId, document);
  });

  return [...documents.values()].map((document): ShiftWorkOrderDocumentGroup => {
    const operations = [...document.operations.entries()].map(([id, operationRows]): ShiftWorkOrderOperationGroup => {
      const sortedRows = [...operationRows].sort((left, right) => (
        rowTime(right) - rowTime(left)
        || left.documentNumber.localeCompare(right.documentNumber, "ru")
        || left.id.localeCompare(right.id, "ru")
      ));
      const first = sortedRows[0];
      const plannedQuantity = sortedRows.reduce((maximum, row) => Math.max(maximum, row.plannedQuantity), 0);
      const assignedQuantity = sortedRows.reduce((sum, row) => sum + row.assignedQuantity, 0);
      const factQuantity = sortedRows.reduce((sum, row) => sum + row.factQuantity, 0);
      return {
        id,
        operationName: first.operationName,
        workCenterLabel: first.workCenterLabel,
        routePartLabel: first.routePartLabel,
        plannedQuantity,
        assignedQuantity,
        factQuantity,
        remainingQuantity: Math.max(0, plannedQuantity - factQuantity),
        unit: first.unit,
        latestLabel: first.dateLabel,
        rows: sortedRows,
      };
    }).sort((left, right) => (
      rowTime(right.rows[0]) - rowTime(left.rows[0])
      || left.operationName.localeCompare(right.operationName, "ru")
      || left.id.localeCompare(right.id, "ru")
    ));
    const sortedRows = [...document.rows].sort((left, right) => rowTime(right) - rowTime(left) || left.id.localeCompare(right.id, "ru"));
    return {
      id: document.id,
      label: document.label,
      meta: document.meta,
      plannedQuantity: operations.reduce((sum, operation) => sum + operation.plannedQuantity, 0),
      assignedQuantity: operations.reduce((sum, operation) => sum + operation.assignedQuantity, 0),
      factQuantity: operations.reduce((sum, operation) => sum + operation.factQuantity, 0),
      remainingQuantity: operations.reduce((sum, operation) => sum + operation.remainingQuantity, 0),
      unit: operations[0]?.unit || sortedRows[0]?.unit || "шт.",
      latestLabel: sortedRows[0]?.dateLabel || "дата не задана",
      rows: sortedRows,
      operations,
    };
  }).sort((left, right) => (
    rowTime(right.rows[0]) - rowTime(left.rows[0])
    || left.label.localeCompare(right.label, "ru")
    || left.id.localeCompare(right.id, "ru")
  ));
}

function sourceWindowFor(input: UnknownRecord, shiftExecution: UnknownRecord, rows: ShiftWorkOrderRow[]): UnknownRecord {
  const presentation = asRecord(input.presentation || input.ui);
  const source = metadataRecord(input.sourceWindow || presentation.sourceWindow || presentation.window || shiftExecution.scope);
  const explicitDate = exactDate(source.dateKey || presentation.dateKey);
  const rowDates = [...new Set(rows.map((row) => row.shiftDateKey).filter(Boolean))];
  const resolvedDate = explicitDate || (rowDates.length === 1 ? rowDates[0] : "");
  const label = asText(source.label || presentation.sourceWindowLabel)
    || (resolvedDate ? `${resolvedDate.split("-").reverse().join(".")} · смена` : "текущая смена");
  return { ...source, dateKey: resolvedDate, label };
}

export function isShiftWorkOrdersProductionInput(value: unknown): boolean {
  const source = asRecord(value);
  return ["assignments", "facts", "carryovers", "reports", "issueReports", "shiftExecution", "planning"]
    .some((key) => hasOwn(source, key));
}

export function buildShiftWorkOrdersProductionModel(
  value: unknown,
  capabilitiesValue: unknown = {},
): ShiftWorkOrdersProductionModel {
  const input = asRecord(value);
  const shiftExecution = asRecord(input.shiftExecution);
  const planning = asRecord(input.planning);
  const planningProjection = asRecord(planning.projection || planning.runtimeProjection);
  const systemDomains = asRecord(input.systemDomains);
  const registries = asRecord(systemDomains.registries || input.registries || systemDomains);
  const explicitCapabilities = asRecord(capabilitiesValue);
  const capabilities = Object.keys(explicitCapabilities).length ? explicitCapabilities : asRecord(input.capabilities);
  const assignmentsValue = readInput(input, shiftExecution, "assignments", "items");
  const factsValue = readInput(input, shiftExecution, "facts");
  const carryoversValue = readInput(input, shiftExecution, "carryovers");
  const reportsValue = readInput(input, shiftExecution, "reports", "issueReports");
  const printMetadataValue = readInput(input, asRecord(input.presentation || input.ui), "printMetadata", "shiftWorkOrderPrintMetadata");
  const employeesValue = readInput(input, registries, "employees");
  const workCentersValue = readInput(input, registries, "workCenters");

  const facts = indexRelatedRecords(factsValue, ["assignmentId", "shiftAssignmentId", "sourceRowId", "rowId", "sourceSlotId", "slotId"]);
  const carryovers = keyedRecords(carryoversValue)
    .map(({ key, value: carryover }): UnknownRecord => ({ ...carryover, id: asText(carryover.id, key) }))
    .filter((carryover) => !asText(carryover.canceledAt));
  carryovers.forEach((carryover) => {
    const assignmentId = asText(carryover.sourceAssignmentId || carryover.assignmentId);
    const sourceRowId = asText(carryover.sourceRowId);
    const append = (key: string) => {
      if (!key) return;
      const indexedKey = `carryover:${key}`;
      const current = facts.get(indexedKey) || [];
      current.push(carryover);
      facts.set(indexedKey, current);
    };
    append(assignmentId);
    append(sourceRowId);
  });

  const indexes: ProductionIndexes = {
    routes: indexedRecords(planning.routes || planningProjection.routes || input.routes, ["id", "routeId", "workOrderId"]),
    steps: indexedRecords(planning.routeSteps || planning.steps || planningProjection.routeSteps || planningProjection.steps || input.routeSteps, ["id", "routeStepId", "operationId"]),
    slots: indexedRecords(planning.slots || planningProjection.slots || input.slots, ["id", "slotId", "sourceSlotId"]),
    employees: indexedRecords(employeesValue, ["id", "employeeId"]),
    workCenters: indexedRecords(workCentersValue, ["id", "workCenterId"]),
    facts,
    reports: indexRelatedRecords(reportsValue, ["assignmentId", "shiftAssignmentId", "sourceRowId", "rowId", "sourceSlotId", "slotId"]),
    printMetadata: indexedRecords(printMetadataValue, ["id", "assignmentId", "sourceRowId", "rowId", "sourceSlotId", "slotId", "workOrderId", "routeId"]),
  };

  const assignmentEntries = keyedRecords(assignmentsValue);
  const assignmentById = new Map<string, UnknownRecord>();
  assignmentEntries.forEach((entry) => assignmentById.set(asText(entry.value.id, entry.key), entry.value));
  const assignmentRows = assignmentEntries.map((entry) => createAssignmentRow(entry, indexes, capabilities)).filter(Boolean) as ShiftWorkOrderRow[];
  const sourceWindowBeforeCarryovers = sourceWindowFor(input, shiftExecution, assignmentRows);
  const windowDateKey = exactDate(sourceWindowBeforeCarryovers.dateKey);
  const carryoverRows = carryovers
    .filter((carryover) => !windowDateKey || exactDate(carryover.dateKey) === windowDateKey)
    .map((carryover) => createCarryoverRow(carryover, indexes, assignmentById))
    .filter(Boolean) as ShiftWorkOrderRow[];
  const rowsById = new Map<string, ShiftWorkOrderRow>();
  [...assignmentRows, ...carryoverRows].filter(shouldInclude).forEach((row) => {
    const previous = rowsById.get(row.id);
    if (!previous || rowTime(row) >= rowTime(previous)) rowsById.set(row.id, row);
  });
  const rows = [...rowsById.values()].sort((left, right) => (
    rowTime(right) - rowTime(left)
    || left.documentNumber.localeCompare(right.documentNumber, "ru")
    || left.id.localeCompare(right.id, "ru")
  ));
  const presentation = asRecord(input.presentation || input.ui);
  const selectedId = asText(input.selectedRowId || presentation.selectedRowId || presentation.shiftWorkOrderJournalSelectedId);
  const selectedRow = rows.find((row) => row.id === selectedId || row.sourceRowId === selectedId || row.assignmentId === selectedId)
    || rows.find((row) => row.status.id !== "planned")
    || rows[0]
    || null;
  const byStatus = rows.reduce<Record<string, number>>((result, row) => {
    result[row.status.id] = (result[row.status.id] || 0) + 1;
    return result;
  }, {});
  const totals = rows.reduce((result, row) => ({
    planned: result.planned + row.plannedQuantity,
    assigned: result.assigned + row.assignedQuantity,
    fact: result.fact + row.factQuantity,
    remaining: result.remaining + row.remainingQuantity,
  }), { planned: 0, assigned: 0, fact: 0, remaining: 0 });

  return {
    rows,
    documentTree: buildDocumentTree(rows),
    selectedRow,
    sourceWindow: sourceWindowFor(input, shiftExecution, rows),
    byStatus,
    totals,
    readModelCoverage: {
      contract: "postgres-shift-work-orders-read-v1",
      supported: SHIFT_WORK_ORDERS_PRODUCTION_MODEL_SUPPORTED,
      deferred: SHIFT_WORK_ORDERS_PRODUCTION_MODEL_DEFERRED,
    },
  };
}

