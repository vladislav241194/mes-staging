type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const tone = (value: unknown): "success" | "warning" | "neutral" => ["ok", "success", "active", "primary"].includes(text(value)) ? "success" : text(value) === "warning" ? "warning" : "neutral";
const personName = (value: unknown, fallback = "Исполнитель") => { const parts = text(value).split(/\s+/).filter(Boolean); if (parts.length < 3 || !/^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/.test(parts[0]) || !/(вич|ич|вна|чна|инич|инична|оглы|кызы)$/i.test(parts[2])) return parts.join(" ") || fallback; return `${parts[0]} ${parts[1]}`; };

export interface ShiftWorkOrderExecutor { id: string; name: string; quantity: number; note: string }
export interface ShiftWorkOrderStatus { id: string; label: string; tone: "success" | "warning" | "neutral" }
export interface ShiftWorkOrderIssueReport { id: string; employeeName: string; text: string; createdAt: string; operationName: string; workCenterLabel: string; photoId: string; photoName: string; photoUrl: string; storageNote: string }
export interface ShiftWorkOrderRow {
  id: string; documentNumber: string; orderLabel: string; routePartLabel: string; operationName: string; workCenterLabel: string;
  resourceLabel: string; masterName: string; executors: ShiftWorkOrderExecutor[]; plannedQuantity: number; assignedQuantity: number;
  factQuantity: number; defectQuantity: number; remainingQuantity: number; unit: string; status: ShiftWorkOrderStatus; stageLabel: string;
  dateLabel: string; shiftDateKey: string; issueReportCount: number; issuePhotoCount: number;
  issueReports: ShiftWorkOrderIssueReport[];
  transfer: { fromOperationName: string; fromWorkCenterLabel: string; toOperationName: string; toWorkCenterLabel: string };
}
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

function adaptRow(value: unknown): ShiftWorkOrderRow | null {
  const source = record(value); const status = record(source.status); const transfer = record(source.transfer); const issueSummary = record(source.issueSummary);
  const id = text(source.id || source.sourceRowId); const documentNumber = text(source.documentNumber);
  if (!id || !documentNumber) return null;
  const issueReports = list(source.issueReports).map((value): ShiftWorkOrderIssueReport | null => { const report = record(value); const photo = record(report.photo); const reportId = text(report.id); return reportId ? { id: reportId, employeeName: personName(report.employeeName), text: text(report.text, "Описание не заполнено."), createdAt: text(report.createdAt, "без даты"), operationName: text(report.operationName), workCenterLabel: text(report.workCenterLabel), photoId: text(photo.id || reportId), photoName: text(photo.name, "Фото проблемы"), photoUrl: text(photo.dataUrl).startsWith("data:image/") ? text(photo.dataUrl) : "", storageNote: text(photo.storageNote) } : null; }).filter(Boolean) as ShiftWorkOrderIssueReport[];
  return {
    id, documentNumber, orderLabel: text(source.orderLabel, "Заказ-наряд"), routePartLabel: text(source.routePartLabel),
    operationName: text(source.operationName, "Операция"), workCenterLabel: text(source.workCenterLabel, "Участок не задан"),
    resourceLabel: text(source.resourceLabel), masterName: personName(source.masterName, "Мастер не назначен"),
    executors: list(source.executors).map(adaptExecutor).filter(Boolean) as ShiftWorkOrderExecutor[],
    plannedQuantity: number(source.plannedQuantity), assignedQuantity: number(source.assignedQuantity), factQuantity: number(source.factQuantity),
    defectQuantity: number(source.defectQuantity), remainingQuantity: number(source.remainingQuantity), unit: text(source.unit, "шт."),
    status: { id: text(status.id, "planned"), label: text(status.label, "запланировано"), tone: tone(status.tone) },
    stageLabel: text(source.stageLabel, "сменное задание"), dateLabel: text(source.dateLabel, "дата не задана"), shiftDateKey: text(source.shiftDateKey),
    issueReportCount: number(issueSummary.reportCount || source.issueReportCount), issuePhotoCount: number(issueSummary.photoCount || source.issuePhotoCount),
    issueReports,
    transfer: {
      fromOperationName: text(transfer.fromOperationName || source.operationName, "Операция"),
      fromWorkCenterLabel: text(transfer.fromWorkCenterLabel || source.workCenterLabel, "Участок не задан"),
      toOperationName: text(transfer.toOperationName || transfer.targetLabel, "следующий шаг"),
      toWorkCenterLabel: text(transfer.toWorkCenterLabel, "не задано"),
    },
  };
}

function adaptOperation(value: unknown): ShiftWorkOrderOperationGroup | null {
  const source = record(value); const id = text(source.id); const operationName = text(source.operationName); const rows = list(source.rows).map(adaptRow).filter(Boolean) as ShiftWorkOrderRow[];
  if (!id || !operationName || !rows.length) return null;
  return { id, operationName, workCenterLabel: text(source.workCenterLabel, "Участок не задан"), routePartLabel: text(source.routePartLabel), plannedQuantity: number(source.plannedQuantity), assignedQuantity: number(source.assignedQuantity), factQuantity: number(source.factQuantity), remainingQuantity: number(source.remainingQuantity), unit: text(source.unit, "шт."), latestLabel: text(source.latestLabel, "дата не задана"), rows };
}

function adaptDocument(value: unknown): ShiftWorkOrderDocumentGroup | null {
  const source = record(value); const id = text(source.id); const label = text(source.label); const operations = list(source.operationGroups || source.operations).map(adaptOperation).filter(Boolean) as ShiftWorkOrderOperationGroup[];
  const rows = list(source.rows).map(adaptRow).filter(Boolean) as ShiftWorkOrderRow[];
  if (!id || !label || !operations.length) return null;
  return { id, label, meta: text(source.meta), plannedQuantity: number(source.plannedQuantity), assignedQuantity: number(source.assignedQuantity), factQuantity: number(source.factQuantity), remainingQuantity: number(source.remainingQuantity), unit: text(source.unit, "шт."), latestLabel: text(source.latestLabel, "дата не задана"), rows, operations };
}

export function adaptShiftWorkOrders(payload: unknown) {
  const source = record(record(payload).model || payload);
  const rows = list(source.rows).map(adaptRow).filter(Boolean) as ShiftWorkOrderRow[];
  const documents = list(source.documentTree).map(adaptDocument).filter(Boolean) as ShiftWorkOrderDocumentGroup[];
  const selectedId = text(record(source.selectedRow).id);
  const selectedRow = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const sourceWindow = record(source.sourceWindow);
  return {
    rows, documents, selectedRow,
    sourceWindowLabel: text(sourceWindow.label, "текущая смена"),
    operationCount: documents.reduce((sum, document) => sum + document.operations.length, 0),
    canActivate: Boolean(rows.length && documents.length && selectedRow),
  };
}
