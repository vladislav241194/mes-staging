const employees = [
  { id: "employee-assigned", name: "Иванов Иван Иванович", availability: { isAvailable: true, label: "дневная смена · 12 ч" } },
  { id: "employee-reserve", name: "Петрова Анна Сергеевна", availability: { isAvailable: true, label: "дневная смена · 12 ч" } },
];
const nextOperation = (operationName: string) => ({ "Комплектация": "Монтаж", "Монтаж": "Контроль", "Контроль": "Упаковка", "Упаковка": "Завершение маршрута" }[operationName] || "Завершение маршрута");
const masterOptions = [
  { id: "master-primary", name: "Смирнов Алексей Петрович", department: "Отдел ручного монтажа", role: "Мастер участка", taskCount: 4 },
  { id: "master-reserve", name: "Волкова Дарья Максимовна", department: "Отдел контроля качества", role: "Мастер ОТК", taskCount: 1 },
];
const makeRow = (id: string, laneId: string, operationName: string, values: { planned: number; assigned: number; fact: number; signal: string; tone: string; executor?: string }) => ({
  id, sourceRowId: id, documentNumber: `СЗН-20260719-D5-${id.toUpperCase()}`, operationName, orderLabel: "ЗН-1042 · Контроллер КТ-7", routePartLabel: "Основной маршрут", taskLabel: "Контроллер КТ-7", workCenterLabel: "Отдел ручного монтажа", resourceLabel: "Линия ручного монтажа 1", timeLabel: "08:00–20:00", unit: "шт.", boardLaneId: laneId,
  plannedQuantity: values.planned, boardAssignedQuantity: values.assigned, boardGoodQuantity: values.fact, boardSignal: { label: values.signal, tone: values.tone },
  boardAssignment: { masterId: "master-primary", masterName: "Смирнов Алексей Петрович", issued: values.assigned > 0, issuedAt: values.assigned > 0 ? "19.07.2026, 08:05" : "", status: values.assigned > 0 ? "issued" : "draft", executors: values.executor ? [{ employeeId: `employee-${id}`, employeeName: values.executor, quantity: values.assigned, note: "дневная смена" }] : [], riskReason: laneId === "attention" ? "неполное распределение" : "" },
  boardFact: values.fact ? { updatedAt: "19.07.2026, 14:20" } : null, employees,
  boardTransferContract: { status: values.fact >= values.planned ? "complete" : values.assigned > 0 ? "issued_waiting_fact" : "draft", fromOperationName: operationName, fromWorkCenterLabel: "Отдел ручного монтажа", toOperationName: nextOperation(operationName), toWorkCenterLabel: operationName === "Упаковка" ? "Выход маршрута" : "Следующий участок", targetLabel: operationName === "Упаковка" ? "Закрытие операции" : "Следующая операция", remainingQuantity: Math.max(0, values.planned - values.fact) },
});
const rows = [
  makeRow("intake", "intake", "Комплектация", { planned: 120, assigned: 0, fact: 0, signal: "нужно распределить", tone: "neutral" }),
  makeRow("assigned", "assigned", "Монтаж", { planned: 120, assigned: 80, fact: 0, signal: "распределено частично", tone: "warning", executor: "Иванов Иван Иванович" }),
  makeRow("attention", "assigned", "Контроль", { planned: 80, assigned: 80, fact: 50, signal: "требует внимания", tone: "warning", executor: "Петрова Анна Сергеевна" }),
  makeRow("fact", "fact", "Упаковка", { planned: 60, assigned: 60, fact: 60, signal: "факт внесён", tone: "ok", executor: "Сидоров Павел Олегович" }),
];
const lane = (id: string, label: string, caption: string, laneRows: typeof rows) => ({ id, label, caption, tone: id === "fact" ? "ok" : id === "attention" ? "warning" : "neutral", rows: laneRows });
const lanes = [lane("intake", "План", "ожидает распределения мастером", [rows[0]]), lane("assigned", "В работе", "есть ресурс, исполнители или лист", [rows[1], rows[2]]), lane("fact", "Закрытие смены", "смена вернула результат", [rows[3]])];
const model = { window: { label: "19.07.2026 · дневная смена" }, dateKey: "2026-07-19", rows, lanes, selectedRow: rows[1], focus: "all", activeProfile: { ...masterOptions[0] }, masterOptions, canSelectMaster: true, plannedQuantity: 380, assignedQuantity: 220, factQuantity: 110, openQuantity: 270 };
export const shiftMasterBoardFixture = { model, capabilities: { assignmentSave: true, factSave: true } };
export function createShiftMasterBoardFocusFixture(focus: "all" | "mine" | "open" | "attention") {
  const focusedRows = focus === "open"
    ? rows.filter((row) => row.boardLaneId !== "fact")
    : focus === "attention"
      ? rows.filter((row) => row.boardLaneId !== "fact" || row.boardAssignedQuantity < row.plannedQuantity || row.boardGoodQuantity < row.plannedQuantity || Boolean(row.boardAssignment.riskReason))
      : rows;
  const plannedQuantity = focusedRows.reduce((sum, row) => sum + row.plannedQuantity, 0);
  const assignedQuantity = focusedRows.reduce((sum, row) => sum + row.boardAssignedQuantity, 0);
  const factQuantity = focusedRows.reduce((sum, row) => sum + row.boardGoodQuantity, 0);
  return { model: { ...model, focus, rows: focusedRows, lanes: lanes.map((item) => ({ ...item, rows: item.rows.filter((row) => focusedRows.includes(row)) })), selectedRow: focusedRows.find((row) => row.id === model.selectedRow.id) || focusedRows[0] || null, plannedQuantity, assignedQuantity, factQuantity, openQuantity: Math.max(0, plannedQuantity - factQuantity) }, capabilities: { assignmentSave: true, factSave: true } };
}
const updatedRows = rows.map((row) => row.id === "assigned" ? { ...row, boardAssignedQuantity: 120, boardSignal: { label: "распределено", tone: "active" }, boardAssignment: { ...row.boardAssignment, executors: [{ employeeId: "employee-assigned", employeeName: "Иванов Иван Иванович", quantity: 120 }] } } : row);
export const shiftMasterBoardUpdateFixture = { model: { ...model, rows: updatedRows, lanes: lanes.map((item) => ({ ...item, rows: item.rows.map((row) => updatedRows.find((entry) => entry.id === row.id) || row) })), selectedRow: updatedRows[1], assignedQuantity: 260 }, capabilities: { assignmentSave: true, factSave: true } };
export function createShiftMasterBoardAssignmentFixture(rowId: string, executors: { employeeId: string; quantity: number }[]) {
  const nextRows = rows.map((row) => row.id === rowId ? { ...row, boardAssignedQuantity: executors.reduce((sum, executor) => sum + executor.quantity, 0), boardSignal: { label: "распределено", tone: "active" }, boardAssignment: { ...row.boardAssignment, executors: executors.map((executor) => ({ ...executor, employeeName: employees.find((employee) => employee.id === executor.employeeId)?.name || "Исполнитель" })) } } : row);
  return { model: { ...model, rows: nextRows, lanes: lanes.map((laneItem) => ({ ...laneItem, rows: laneItem.rows.map((row) => nextRows.find((entry) => entry.id === row.id) || row) })), selectedRow: nextRows.find((row) => row.id === rowId) || nextRows[0], assignedQuantity: nextRows.reduce((sum, row) => sum + row.boardAssignedQuantity, 0) }, capabilities: { assignmentSave: true, factSave: true } };
}
export function createShiftMasterBoardFactFixture(rowId: string, fact: { actualQuantity: number; defectQuantity: number; laborMinutes: number; executorCount: number; comment: string; deviationComment: string }) {
  const goodQuantity = Math.max(0, fact.actualQuantity - fact.defectQuantity);
  const nextRows = rows.map((row) => row.id === rowId ? { ...row, boardLaneId: "fact", boardGoodQuantity: goodQuantity, boardSignal: { label: goodQuantity >= row.plannedQuantity ? "факт внесён" : "остаток на следующую смену", tone: goodQuantity >= row.plannedQuantity ? "ok" : "warning" }, boardFact: { ...fact, updatedAt: "19.07.2026, 16:40" }, boardTransferContract: goodQuantity < row.plannedQuantity ? { ...row.boardTransferContract, status: "partial_carryover_required", carryoverId: `carryover-${rowId}`, carryoverDateKey: "2026-07-20", remainingQuantity: row.plannedQuantity - goodQuantity, targetLabel: "Остаток в следующую смену" } : { ...row.boardTransferContract, status: "complete", remainingQuantity: 0 } } : row);
  return { model: { ...model, rows: nextRows, lanes: lanes.map((laneItem) => ({ ...laneItem, rows: nextRows.filter((row) => row.boardLaneId === laneItem.id) })), selectedRow: nextRows.find((row) => row.id === rowId) || nextRows[0], factQuantity: nextRows.reduce((sum, row) => sum + row.boardGoodQuantity, 0), openQuantity: nextRows.reduce((sum, row) => sum + Math.max(0, row.plannedQuantity - row.boardGoodQuantity), 0) }, capabilities: { assignmentSave: true, factSave: true } };
}
export function createShiftMasterBoardCarryoverFixture(dateKey: string, carryoverId: string) {
  const source = rows.find((row) => row.id === "assigned") || rows[0];
  const carryover = { ...source, id: carryoverId, sourceRowId: source.id, sourceDateKey: "2026-07-19", dateKey, documentNumber: "ОСТ-20260720-D5", boardLaneId: "intake", plannedQuantity: 24, boardAssignedQuantity: 0, boardGoodQuantity: 0, boardSignal: { label: "остаток смены", tone: "warning" }, boardAssignment: { ...source.boardAssignment, issued: false, status: "draft", executors: [] }, boardFact: null, isBoardCarryover: true, note: "Остаток 24 шт. после факта 96 из 120", timeLabel: "08:00–09:30" };
  return { model: { ...model, window: { label: "20.07.2026 · дневная смена" }, dateKey, rows: [carryover], lanes: lanes.map((laneItem) => ({ ...laneItem, rows: laneItem.id === "intake" ? [carryover] : [] })), selectedRow: carryover, plannedQuantity: 24, assignedQuantity: 0, factQuantity: 0, openQuantity: 24 }, capabilities: { assignmentSave: true, factSave: true } };
}
export function createShiftMasterBoardDateFixture(dateKey: string) {
  const isBaseline = dateKey === "2026-07-19"; const date = new Date(`${dateKey}T12:00:00.000Z`); const label = Number.isNaN(date.getTime()) ? dateKey : new Intl.DateTimeFormat("ru-RU").format(date);
  const dateRows = isBaseline ? rows : [{ ...rows[0], id: `date-${dateKey}`, sourceRowId: `date-${dateKey}`, documentNumber: `СЗН-${dateKey.replaceAll("-", "")}-D5-01`, boardLaneId: "intake", boardAssignedQuantity: 0, boardGoodQuantity: 0 }];
  return { model: { ...model, window: { label: `${label} · дневная смена` }, dateKey, rows: dateRows, lanes: lanes.map((laneItem) => ({ ...laneItem, rows: dateRows.filter((row) => row.boardLaneId === laneItem.id) })), selectedRow: dateRows[0] || null, plannedQuantity: dateRows.reduce((sum, row) => sum + row.plannedQuantity, 0), assignedQuantity: dateRows.reduce((sum, row) => sum + row.boardAssignedQuantity, 0), factQuantity: dateRows.reduce((sum, row) => sum + row.boardGoodQuantity, 0), openQuantity: dateRows.reduce((sum, row) => sum + Math.max(0, row.plannedQuantity - row.boardGoodQuantity), 0) }, capabilities: { assignmentSave: true, factSave: true } };
}
export function createShiftMasterBoardMasterFixture(masterId: string) {
  const activeProfile = masterOptions.find((option) => option.id === masterId) || masterOptions[0]; const masterRows = activeProfile.id === "master-reserve" ? [rows[2]] : rows;
  return { model: { ...model, focus: "mine", activeProfile, rows: masterRows, lanes: lanes.map((laneItem) => ({ ...laneItem, rows: masterRows.filter((row) => row.boardLaneId === laneItem.id) })), selectedRow: masterRows[0] || null, plannedQuantity: masterRows.reduce((sum, row) => sum + row.plannedQuantity, 0), assignedQuantity: masterRows.reduce((sum, row) => sum + row.boardAssignedQuantity, 0), factQuantity: masterRows.reduce((sum, row) => sum + row.boardGoodQuantity, 0), openQuantity: masterRows.reduce((sum, row) => sum + Math.max(0, row.plannedQuantity - row.boardGoodQuantity), 0) }, capabilities: { assignmentSave: true, factSave: true } };
}
