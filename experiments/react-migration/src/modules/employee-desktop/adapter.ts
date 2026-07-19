const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const personName = (value: unknown, fallback = "Исполнитель") => { const parts = text(value).split(/\s+/).filter(Boolean); return parts.length > 2 ? `${parts[0]} ${parts[1]}` : parts.join(" ") || fallback; };

export interface EmployeeDesktopTask {
  id: string; rowId: string; employeeId: string; employeeName: string; operationName: string; workCenterLabel: string;
  orderLabel: string; routePartLabel: string; documentNumber: string; assignedQuantity: number; actualQuantity: number;
  defectQuantity: number; goodQuantity: number; unit: string; laborLabel: string; status: string; isStarted: boolean; isDone: boolean;
  previousOperation: string; nextOperation: string; reportCount: number; photoCount: number;
}
export interface EmployeeDesktopPerson { id: string; name: string; department: string }
export interface EmployeeDesktopModel {
  tasks: EmployeeDesktopTask[]; selectedTask: EmployeeDesktopTask | null; people: EmployeeDesktopPerson[]; viewedPersonId: string;
  personName: string; roleLabel: string; canViewAll: boolean; canStartTask: boolean; canSaveFact: boolean; canSaveReport: boolean; assignedQuantity: number; goodQuantity: number; activeCount: number; doneCount: number;
}

function adaptTask(value: unknown, reportSummaries: Record<string, any>): EmployeeDesktopTask | null {
  const source = record(value); const chain = record(source.chain); const previous = record(chain.previous); const next = record(chain.next); const id = text(source.id); if (!id) return null;
  const reportSummary = record(reportSummaries[id]);
  return { id, rowId: text(source.rowId), employeeId: text(source.employeeId), employeeName: personName(source.employeeName), operationName: text(source.operationName, "Операция"), workCenterLabel: text(source.workCenterLabel, "Участок не задан"), orderLabel: text(source.orderLabel, "Заказ-наряд"), routePartLabel: text(source.routePartLabel, "Основной маршрут"), documentNumber: text(source.documentNumber, "СЗН не сформирован"), assignedQuantity: number(source.assignedQuantity), actualQuantity: number(source.actualQuantity), defectQuantity: number(source.defectQuantity), goodQuantity: number(source.goodQuantity), unit: text(source.unit, "шт."), laborLabel: text(source.laborLabel, "трудозатраты не заданы"), status: text(source.status, "назначено"), isStarted: source.isStarted === true, isDone: source.isDone === true, previousOperation: text(previous.operationName, "старт"), nextOperation: text(next.operationName, "финиш"), reportCount: number(reportSummary.reportCount), photoCount: number(reportSummary.photoCount) };
}

export function adaptEmployeeDesktopPayload(payload: unknown): EmployeeDesktopModel {
  const source = record(payload); const model = record(source.model); const capabilities = record(source.capabilities); const reportSummaries = record(source.reportSummaries); const tasks = list(model.tasks).map((value) => adaptTask(value, reportSummaries)).filter(Boolean) as EmployeeDesktopTask[]; const selectedId = text(record(model.selectedTask).id); const person = record(model.person); const role = record(model.role);
  const people = list(model.taskPeople).map((value): EmployeeDesktopPerson | null => { const source = record(value); const id = text(source.id); return id ? { id, name: personName(source.name), department: text(source.department, "Участок не указан") } : null; }).filter(Boolean) as EmployeeDesktopPerson[];
  return { tasks, selectedTask: tasks.find((task) => task.id === selectedId) || tasks[0] || null, people, viewedPersonId: text(model.viewedPersonId, "__all"), personName: personName(person.name), roleLabel: text(role.label || role.name, "Исполнитель"), canViewAll: model.canViewAll === true, canStartTask: capabilities.taskStart === true, canSaveFact: capabilities.factSave === true, canSaveReport: capabilities.reportSave === true, assignedQuantity: number(model.assignedQuantity), goodQuantity: number(model.goodQuantity), activeCount: list(model.activeTasks).length, doneCount: list(model.doneTasks).length };
}
