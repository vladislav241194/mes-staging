const makeRow = (id: string, laneId: string, operationName: string, values: { planned: number; assigned: number; fact: number; signal: string; tone: string; executor?: string }) => ({
  id, sourceRowId: id, documentNumber: `СЗН-20260719-D5-${id.toUpperCase()}`, operationName, orderLabel: "ЗН-1042 · Контроллер КТ-7", routePartLabel: "Основной маршрут", taskLabel: "Контроллер КТ-7", workCenterLabel: "Отдел ручного монтажа", timeLabel: "08:00–20:00", unit: "шт.", boardLaneId: laneId,
  plannedQuantity: values.planned, boardAssignedQuantity: values.assigned, boardGoodQuantity: values.fact, boardSignal: { label: values.signal, tone: values.tone },
  boardAssignment: { masterName: "Смирнов Алексей Петрович", executors: values.executor ? [{ employeeId: `employee-${id}`, employeeName: values.executor, quantity: values.assigned }] : [], riskReason: laneId === "attention" ? "неполное распределение" : "" },
  boardFact: values.fact ? { updatedAt: "19.07.2026, 14:20" } : null,
});
const rows = [
  makeRow("intake", "intake", "Комплектация", { planned: 120, assigned: 0, fact: 0, signal: "нужно распределить", tone: "neutral" }),
  makeRow("assigned", "assigned", "Монтаж", { planned: 120, assigned: 80, fact: 0, signal: "распределено частично", tone: "warning", executor: "Иванов Иван Иванович" }),
  makeRow("attention", "assigned", "Контроль", { planned: 80, assigned: 80, fact: 50, signal: "требует внимания", tone: "warning", executor: "Петрова Анна Сергеевна" }),
  makeRow("fact", "fact", "Упаковка", { planned: 60, assigned: 60, fact: 60, signal: "факт внесён", tone: "ok", executor: "Сидоров Павел Олегович" }),
];
const lane = (id: string, label: string, caption: string, laneRows: typeof rows) => ({ id, label, caption, tone: id === "fact" ? "ok" : id === "attention" ? "warning" : "neutral", rows: laneRows });
const lanes = [lane("intake", "План", "ожидает распределения мастером", [rows[0]]), lane("assigned", "В работе", "есть ресурс, исполнители или лист", [rows[1], rows[2]]), lane("fact", "Закрытие смены", "смена вернула результат", [rows[3]])];
const model = { window: { label: "19.07.2026 · дневная смена" }, rows, lanes, selectedRow: rows[1], focus: "all", activeProfile: { name: "Смирнов Алексей Петрович", department: "Отдел ручного монтажа" }, plannedQuantity: 380, assignedQuantity: 220, factQuantity: 110, openQuantity: 270 };
export const shiftMasterBoardFixture = { model };
export function createShiftMasterBoardFocusFixture(focus: "all" | "mine" | "open" | "attention") {
  const focusedRows = focus === "open"
    ? rows.filter((row) => row.boardLaneId !== "fact")
    : focus === "attention"
      ? rows.filter((row) => row.boardLaneId !== "fact" || row.boardAssignedQuantity < row.plannedQuantity || row.boardGoodQuantity < row.plannedQuantity || Boolean(row.boardAssignment.riskReason))
      : rows;
  const plannedQuantity = focusedRows.reduce((sum, row) => sum + row.plannedQuantity, 0);
  const assignedQuantity = focusedRows.reduce((sum, row) => sum + row.boardAssignedQuantity, 0);
  const factQuantity = focusedRows.reduce((sum, row) => sum + row.boardGoodQuantity, 0);
  return { model: { ...model, focus, rows: focusedRows, lanes: lanes.map((item) => ({ ...item, rows: item.rows.filter((row) => focusedRows.includes(row)) })), selectedRow: focusedRows.find((row) => row.id === model.selectedRow.id) || focusedRows[0] || null, plannedQuantity, assignedQuantity, factQuantity, openQuantity: Math.max(0, plannedQuantity - factQuantity) } };
}
const updatedRows = rows.map((row) => row.id === "assigned" ? { ...row, boardAssignedQuantity: 120, boardSignal: { label: "распределено", tone: "active" }, boardAssignment: { ...row.boardAssignment, executors: [{ employeeId: "employee-assigned", employeeName: "Иванов Иван Иванович", quantity: 120 }] } } : row);
export const shiftMasterBoardUpdateFixture = { model: { ...model, rows: updatedRows, lanes: lanes.map((item) => ({ ...item, rows: item.rows.map((row) => updatedRows.find((entry) => entry.id === row.id) || row) })), selectedRow: updatedRows[1], assignedQuantity: 260 } };
