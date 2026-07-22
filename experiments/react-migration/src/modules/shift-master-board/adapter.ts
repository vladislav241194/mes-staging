const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const tone = (value: unknown): "success" | "warning" | "neutral" => ["ok", "success", "active", "primary"].includes(text(value)) ? "success" : text(value) === "warning" ? "warning" : "neutral";
const personName = (value: unknown, fallback = "Не назначен") => { const parts = text(value).split(/\s+/).filter(Boolean); return parts.length > 2 ? `${parts[0]} ${parts[1]}` : parts.join(" ") || fallback; };

export interface ShiftMasterBoardExecutor { id: string; name: string; quantity: number; note: string }
export interface ShiftMasterBoardAssignableEmployee { id: string; name: string; quantity: number; available: boolean; availabilityLabel: string }
export interface ShiftMasterBoardMasterOption { id: string; name: string }
export interface ShiftMasterBoardTransfer {
  fromOperationName: string; fromWorkCenterLabel: string; toOperationName: string; toWorkCenterLabel: string;
  targetLabel: string; remainingQuantity: number;
}
export interface ShiftMasterBoardRow {
  id: string; documentNumber: string; operationName: string; orderLabel: string; routePartLabel: string;
  workCenterLabel: string; resourceLabel: string; timeLabel: string; issuedAt: string; plannedQuantity: number; assignedQuantity: number; factQuantity: number;
  remainingQuantity: number; unit: string; laneId: string; signal: { label: string; tone: "success" | "warning" | "neutral" };
  masterName: string; executors: ShiftMasterBoardExecutor[]; assignableEmployees: ShiftMasterBoardAssignableEmployee[]; factUpdatedAt: string; riskLabel: string;
  factReady: boolean; hasFact: boolean; actualQuantity: number; defectQuantity: number; laborMinutes: number; executorCount: number; factComment: string; deviationComment: string;
  isCarryover: boolean; sourceRowId: string; sourceDateKey: string; carryoverReason: string; transferStatus: string; carryoverId: string; carryoverDateKey: string; carryoverRemainingQuantity: number; transferTargetLabel: string;
  transfer: ShiftMasterBoardTransfer;
}
export interface ShiftMasterBoardLane { id: string; label: string; caption: string; tone: "success" | "warning" | "neutral"; rows: ShiftMasterBoardRow[] }
export interface ShiftMasterBoardModel {
  windowLabel: string; rows: ShiftMasterBoardRow[]; lanes: ShiftMasterBoardLane[]; selectedRow: ShiftMasterBoardRow | null;
  focus: "all" | "mine" | "open" | "attention";
  dateKey: string; masterId: string; masterLabel: string; masters: ShiftMasterBoardMasterOption[];
  plannedQuantity: number; assignedQuantity: number; factQuantity: number; openQuantity: number;
  canAssign: boolean; canRecordFact: boolean; canMoveLane: boolean;
}

const focus = (value: unknown): ShiftMasterBoardModel["focus"] => ["mine", "open", "attention"].includes(text(value)) ? text(value) as ShiftMasterBoardModel["focus"] : "all";

function adaptRow(value: unknown): ShiftMasterBoardRow | null {
  const source = record(value); const assignment = record(source.boardAssignment || source.assignment); const fact = record(source.boardFact || source.fact); const signal = record(source.boardSignal || source.signal); const transfer = record(source.boardTransferContract || fact.transferContract || assignment.transferContract);
  const id = text(source.id || source.sourceRowId); if (!id) return null;
  const plannedQuantity = number(source.plannedQuantity); const assignedQuantity = number(source.boardAssignedQuantity ?? source.assignedQuantity); const factQuantity = number(source.boardGoodQuantity ?? source.factQuantity);
  const executors = list(assignment.executors || source.executors).map((value, index) => { const executor = record(value); return { id: text(executor.employeeId || executor.id, `executor-${index + 1}`), name: personName(executor.employeeName || executor.name, "Исполнитель"), quantity: number(executor.quantity), note: text(executor.note) }; });
  const executorById = new Map(executors.map((executor) => [executor.id, executor]));
  const assignableEmployees = list(source.employees || source.availableEmployees).map((value, index) => { const employee = record(value); const availability = record(employee.availability); const employeeId = text(employee.id || employee.employeeId, `employee-${index + 1}`); const current = executorById.get(employeeId); return { id: employeeId, name: personName(employee.name || employee.employeeName || current?.name, "Исполнитель"), quantity: current?.quantity || 0, available: availability.isAvailable === true, availabilityLabel: text(availability.label, availability.isAvailable === true ? "доступен по Табелю" : "недоступен по Табелю") }; });
  executors.forEach((executor) => { if (!assignableEmployees.some((employee) => employee.id === executor.id)) assignableEmployees.push({ ...executor, available: false, availabilityLabel: "текущее назначение вне доступной смены" }); });
  return {
    id, documentNumber: text(source.documentNumber, "СЗН не сформирован"), operationName: text(source.operationName, "Операция"),
    orderLabel: text(source.orderLabel || source.routeName || source.taskLabel, "Заказ-наряд"), routePartLabel: text(source.routePartLabel || source.taskLabel, "Основной маршрут"),
    workCenterLabel: text(source.workCenterLabel, "Участок не задан"), resourceLabel: text(source.resourceLabel), timeLabel: text(source.timeLabel, "время не задано"), issuedAt: text(assignment.issuedAt),
    plannedQuantity, assignedQuantity, factQuantity, remainingQuantity: Math.max(0, plannedQuantity - factQuantity), unit: text(source.unit, "шт."),
    laneId: text(source.boardLaneId, "intake"), signal: { label: text(signal.label, "нужно распределить"), tone: tone(signal.tone) },
    masterName: personName(assignment.masterName || source.masterName, "Мастер не назначен"),
    executors, assignableEmployees,
    factUpdatedAt: text(fact.updatedAt || source.masterFactUpdatedAt, "факт не внесён"), riskLabel: text(assignment.riskLabel || assignment.riskReason || source.riskLabel),
    factReady: assignment.issued === true || text(assignment.status) === "issued" || source.isIssued === true,
    hasFact: Boolean(text(fact.updatedAt || source.masterFactUpdatedAt)), actualQuantity: number(fact.actualQuantity), defectQuantity: number(fact.defectQuantity), laborMinutes: number(fact.laborMinutes),
    executorCount: number(fact.executorCount), factComment: text(fact.comment), deviationComment: text(fact.deviationComment),
    isCarryover: source.isBoardCarryover === true, sourceRowId: text(source.sourceRowId), sourceDateKey: text(source.sourceDateKey), carryoverReason: text(source.note || source.reason),
    transferStatus: text(transfer.status), carryoverId: text(transfer.carryoverId || (source.isBoardCarryover ? id : "")), carryoverDateKey: text(transfer.carryoverDateKey || source.dateKey),
    carryoverRemainingQuantity: number(transfer.remainingQuantity || (source.isBoardCarryover ? plannedQuantity : 0)), transferTargetLabel: text(transfer.targetLabel, "Остаток в следующую смену"),
    transfer: {
      fromOperationName: text(transfer.fromOperationName || source.operationName, "Операция"),
      fromWorkCenterLabel: text(transfer.fromWorkCenterLabel || source.workCenterLabel, "Участок не задан"),
      toOperationName: text(transfer.toOperationName, "Завершение маршрута"),
      toWorkCenterLabel: text(transfer.toWorkCenterLabel, "Выход маршрута"),
      targetLabel: text(transfer.targetLabel, "Закрытие операции"),
      remainingQuantity: number(transfer.remainingQuantity),
    },
  };
}

export function adaptShiftMasterBoardPayload(payload: unknown): ShiftMasterBoardModel {
  const source = record(payload); const model = record(source.model); const capabilities = record(source.capabilities); const rows = list(model.rows).map(adaptRow).filter(Boolean) as ShiftMasterBoardRow[]; const rowsById = new Map(rows.map((row) => [row.id, row]));
  const lanes = list(model.lanes).map((value, index): ShiftMasterBoardLane => { const lane = record(value); const laneId = text(lane.id, `lane-${index + 1}`); const laneRows = list(lane.rows).map((row) => rowsById.get(text(record(row).id))).filter(Boolean) as ShiftMasterBoardRow[]; return { id: laneId, label: text(lane.label, "Этап"), caption: text(lane.caption), tone: tone(lane.tone), rows: laneRows.length ? laneRows : rows.filter((row) => row.laneId === laneId) }; });
  const selectedId = text(record(model.selectedRow).id); const activeProfile = record(model.activeProfile);
  const masters = list(model.masterOptions).map((value): ShiftMasterBoardMasterOption => { const option = record(value); return { id: text(option.id), name: personName(option.name, "Мастер") }; }).filter((option) => Boolean(option.id));
  return { windowLabel: text(record(model.window).label, "Текущая смена"), dateKey: text(model.dateKey), rows, lanes, selectedRow: rowsById.get(selectedId) || rows[0] || null, focus: focus(model.focus), masterId: text(activeProfile.id), masterLabel: `${personName(activeProfile.name, "Мастер")} · ${text(activeProfile.department, "Участок не указан")}`, masters, plannedQuantity: number(model.plannedQuantity), assignedQuantity: number(model.assignedQuantity), factQuantity: number(model.factQuantity), openQuantity: number(model.openQuantity), canAssign: capabilities.assignmentSave === true, canRecordFact: capabilities.factSave === true, canMoveLane: capabilities.laneMove === true };
}
