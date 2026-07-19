type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => value instanceof Set ? [...value].map((item) => text(item)).filter(Boolean) : list(value).map((item) => text(item)).filter(Boolean);
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const meaningfulText = (...values: unknown[]): string => values.map((value) => text(value)).find((value) => value && value.toLocaleLowerCase("ru-RU") !== "объект не выбран") || "";
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const tone = (value: unknown): "success" | "warning" | "neutral" => ["ok", "success", "active", "primary"].includes(text(value)) ? "success" : text(value) === "warning" ? "warning" : "neutral";
const personName = (value: unknown, fallback = "Исполнитель") => { const parts = text(value).split(/\s+/).filter(Boolean); if (parts.length < 3 || !/^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/.test(parts[0]) || !/(вич|ич|вна|чна|инич|инична|оглы|кызы)$/i.test(parts[2])) return parts.join(" ") || fallback; return `${parts[0]} ${parts[1]}`; };

export interface ShiftWorkOrderExecutor { id: string; name: string; quantity: number; note: string }
export interface ShiftWorkOrderStatus { id: string; label: string; tone: "success" | "warning" | "neutral" }
export interface ShiftWorkOrderIssueReport { id: string; employeeName: string; text: string; createdAt: string; operationName: string; workCenterLabel: string; photoId: string; photoName: string; photoUrl: string; storageNote: string }
export interface ShiftWorkOrderRow {
  id: string; routeId: string; documentNumber: string; orderLabel: string; routePartLabel: string; operationName: string; workCenterLabel: string;
  resourceLabel: string; masterName: string; executors: ShiftWorkOrderExecutor[]; plannedQuantity: number; assignedQuantity: number;
  factQuantity: number; defectQuantity: number; remainingQuantity: number; unit: string; status: ShiftWorkOrderStatus; stageLabel: string;
  issuedAt: string; dateLabel: string; shiftDateKey: string; issueReportCount: number; issuePhotoCount: number;
  issueReports: ShiftWorkOrderIssueReport[];
  factEditable?: boolean; hasFact?: boolean; actualQuantity?: number; laborMinutes?: number; executorCount?: number; factComment?: string; deviationComment?: string;
  transfer: { fromOperationName: string; fromWorkCenterLabel: string; toOperationName: string; toWorkCenterLabel: string; targetLabel: string; remainingQuantity: number };
}
export interface WorkOrderPrintPackageOperation { id: string; index: number; taskLabel: string; operationName: string; workCenterLabel: string; durationLabel: string; plannedQuantity: number; assignedQuantity: number; factQuantity: number; remainingQuantity: number; documentCount: number; shiftCount: number; executorCount: number; statusLabel: string }
export interface WorkOrderPrintPackageExecutor { id: string; employeeName: string; quantity: number; unit: string; shifts: string[]; documents: string[]; operations: string[] }
export interface WorkOrderPrintPackage { title: string; objectLabel: string; routeName: string; statusLabel: string; documentDate: string; planningQuantity: number; unit: string; shiftCount: number; operationCount: number; finalFactQuantity: number; finalRemainingQuantity: number; journalRows: ShiftWorkOrderRow[]; operations: WorkOrderPrintPackageOperation[]; executors: WorkOrderPrintPackageExecutor[]; canActivate: boolean }
export interface ShiftWorkOrderOperationGroup {
  id: string; operationName: string; workCenterLabel: string; routePartLabel: string; plannedQuantity: number; assignedQuantity: number;
  factQuantity: number; remainingQuantity: number; unit: string; latestLabel: string; rows: ShiftWorkOrderRow[];
}
export interface ShiftWorkOrderDocumentGroup {
  id: string; label: string; meta: string; plannedQuantity: number; assignedQuantity: number; factQuantity: number; remainingQuantity: number;
  unit: string; latestLabel: string; rows: ShiftWorkOrderRow[]; operations: ShiftWorkOrderOperationGroup[];
}

function adaptExecutor(value: unknown, index: number): ShiftWorkOrderExecutor | null {
  const source = record(value); const name = text(source.employeeName || source.name); const id = text(source.employeeId || source.id, `executor-${index + 1}`);
  return name ? { id, name: personName(name), quantity: number(source.quantity), note: text(source.note) } : null;
}

function adaptRow(value: unknown, factContexts = new Map<string, UnknownRecord>()): ShiftWorkOrderRow | null {
  const source = record(value); const status = record(source.status); const transfer = record(source.transfer); const issueSummary = record(source.issueSummary);
  const id = text(source.id || source.sourceRowId); const documentNumber = text(source.documentNumber);
  if (!id || !documentNumber) return null;
  const factContext = factContexts.get(id) || {};
  const issueReports = list(source.issueReports).map((value): ShiftWorkOrderIssueReport | null => { const report = record(value); const photo = record(report.photo); const reportId = text(report.id); return reportId ? { id: reportId, employeeName: personName(report.employeeName), text: text(report.text, "Описание не заполнено."), createdAt: text(report.createdAt, "без даты"), operationName: text(report.operationName), workCenterLabel: text(report.workCenterLabel), photoId: text(photo.id || reportId), photoName: text(photo.name, "Фото проблемы"), photoUrl: text(photo.dataUrl).startsWith("data:image/") ? text(photo.dataUrl) : "", storageNote: text(photo.storageNote) } : null; }).filter(Boolean) as ShiftWorkOrderIssueReport[];
  return {
    id, routeId: text(source.routeId || source.planningOrderId), documentNumber, orderLabel: text(source.orderLabel, "Заказ-наряд"), routePartLabel: text(source.routePartLabel),
    operationName: text(source.operationName, "Операция"), workCenterLabel: text(source.workCenterLabel, "Участок не задан"),
    resourceLabel: text(source.resourceLabel), masterName: personName(source.masterName, "Мастер не назначен"),
    executors: list(source.executors).map(adaptExecutor).filter(Boolean) as ShiftWorkOrderExecutor[],
    plannedQuantity: number(source.plannedQuantity), assignedQuantity: number(source.assignedQuantity), factQuantity: number(source.factQuantity),
    defectQuantity: number(source.defectQuantity), remainingQuantity: number(source.remainingQuantity), unit: text(source.unit, "шт."),
    status: { id: text(status.id, "planned"), label: text(status.label, "запланировано"), tone: tone(status.tone) },
    stageLabel: text(source.stageLabel, "сменное задание"), issuedAt: text(source.issuedAt), dateLabel: text(source.dateLabel, "дата не задана"), shiftDateKey: text(source.shiftDateKey),
    issueReportCount: number(issueSummary.reportCount || source.issueReportCount), issuePhotoCount: number(issueSummary.photoCount || source.issuePhotoCount),
    issueReports,
    factEditable: factContext.canEdit === true, hasFact: factContext.hasFact === true, actualQuantity: number(factContext.actualQuantity),
    laborMinutes: number(factContext.laborMinutes), executorCount: number(factContext.executorCount), factComment: text(factContext.comment), deviationComment: text(factContext.deviationComment),
    transfer: {
      fromOperationName: text(transfer.fromOperationName || source.operationName, "Операция"),
      fromWorkCenterLabel: text(transfer.fromWorkCenterLabel || source.workCenterLabel, "Участок не задан"),
      toOperationName: text(transfer.toOperationName || transfer.targetLabel, "следующий шаг"),
      toWorkCenterLabel: text(transfer.toWorkCenterLabel, "не задано"),
      targetLabel: text(transfer.targetLabel), remainingQuantity: number(transfer.remainingQuantity),
    },
  };
}

export function adaptWorkOrderPrintPackage(value: unknown): WorkOrderPrintPackage {
  const source = record(value); const view = record(source.workOrderView); const route = record(source.route); const status = record(view.status);
  const journalRows = list(source.journalRows).map((row) => adaptRow(row)).filter(Boolean) as ShiftWorkOrderRow[];
  const operations = list(source.operations).map((value, index): WorkOrderPrintPackageOperation | null => { const row = record(value); const id = text(row.id, `operation-${index + 1}`); return id ? { id, index: number(row.index) || index + 1, taskLabel: text(row.taskLabel), operationName: text(row.operationName, "Операция"), workCenterLabel: text(row.workCenterLabel, "Участок не задан"), durationLabel: text(row.durationLabel, "не рассчитано"), plannedQuantity: number(row.plannedQuantity), assignedQuantity: number(row.assignedQuantity), factQuantity: number(row.factQuantity), remainingQuantity: number(row.remainingQuantity), documentCount: number(row.documentCount), shiftCount: number(row.shiftCount), executorCount: number(row.executorCount), statusLabel: text(row.statusLabel, "нет СЗН") } : null; }).filter(Boolean) as WorkOrderPrintPackageOperation[];
  const executors = list(source.executorRows).map((value, index): WorkOrderPrintPackageExecutor | null => { const row = record(value); const employeeName = personName(row.employeeName); return employeeName ? { id: text(row.id, `executor-${index + 1}`), employeeName, quantity: number(row.quantity), unit: text(row.unit, "шт."), shifts: strings(row.shifts), documents: strings(row.documents), operations: strings(row.operations) } : null; }).filter(Boolean) as WorkOrderPrintPackageExecutor[];
  const title = text(view.title, "Заказ-наряд"); const objectLabel = meaningfulText(view.objectLabel, route.name, journalRows[0]?.orderLabel, view.queueTitle, title);
  return { title, objectLabel, routeName: text(route.name || route.number, "Маршрутная карта"), statusLabel: text(status.label, "статус не задан"), documentDate: text(source.documentDate), planningQuantity: number(source.planningQuantity), unit: text(source.unit, "шт."), shiftCount: number(source.shiftCount), operationCount: number(source.operationCount), finalFactQuantity: number(source.finalFactQuantity), finalRemainingQuantity: number(source.finalRemainingQuantity), journalRows, operations, executors, canActivate: Boolean(objectLabel && operations.length) };
}

function adaptOperation(value: unknown, factContexts = new Map<string, UnknownRecord>()): ShiftWorkOrderOperationGroup | null {
  const source = record(value); const id = text(source.id); const operationName = text(source.operationName); const rows = list(source.rows).map((row) => adaptRow(row, factContexts)).filter(Boolean) as ShiftWorkOrderRow[];
  if (!id || !operationName || !rows.length) return null;
  return { id, operationName, workCenterLabel: text(source.workCenterLabel, "Участок не задан"), routePartLabel: text(source.routePartLabel), plannedQuantity: number(source.plannedQuantity), assignedQuantity: number(source.assignedQuantity), factQuantity: number(source.factQuantity), remainingQuantity: number(source.remainingQuantity), unit: text(source.unit, "шт."), latestLabel: text(source.latestLabel, "дата не задана"), rows };
}

function adaptDocument(value: unknown, factContexts = new Map<string, UnknownRecord>()): ShiftWorkOrderDocumentGroup | null {
  const source = record(value); const id = text(source.id); const label = text(source.label); const operations = list(source.operationGroups || source.operations).map((operation) => adaptOperation(operation, factContexts)).filter(Boolean) as ShiftWorkOrderOperationGroup[];
  const rows = list(source.rows).map((row) => adaptRow(row, factContexts)).filter(Boolean) as ShiftWorkOrderRow[];
  if (!id || !label || !operations.length) return null;
  return { id, label, meta: text(source.meta), plannedQuantity: number(source.plannedQuantity), assignedQuantity: number(source.assignedQuantity), factQuantity: number(source.factQuantity), remainingQuantity: number(source.remainingQuantity), unit: text(source.unit, "шт."), latestLabel: text(source.latestLabel, "дата не задана"), rows, operations };
}

export function adaptShiftWorkOrders(payload: unknown) {
  const root = record(payload); const source = record(root.model || payload); const capabilities = record(root.capabilities);
  const factContexts = new Map(list(root.factContexts).map((value) => { const context = record(value); return [text(context.rowId), context] as const; }).filter(([rowId]) => rowId));
  const rows = list(source.rows).map((row) => adaptRow(row, factContexts)).filter(Boolean) as ShiftWorkOrderRow[];
  const documents = list(source.documentTree).map((document) => adaptDocument(document, factContexts)).filter(Boolean) as ShiftWorkOrderDocumentGroup[];
  const selectedId = text(record(source.selectedRow).id);
  const selectedRow = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const sourceWindow = record(source.sourceWindow);
  return {
    rows, documents, selectedRow,
    sourceWindowLabel: text(sourceWindow.label, "текущая смена"),
    operationCount: documents.reduce((sum, document) => sum + document.operations.length, 0),
    canActivate: Boolean(rows.length && documents.length && selectedRow), canSaveFact: capabilities.factSave === true, canSaveAssignment: capabilities.assignmentSave === true,
  };
}
