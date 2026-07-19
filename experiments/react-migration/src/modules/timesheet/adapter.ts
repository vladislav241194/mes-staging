type UnknownRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" ? value as UnknownRecord : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;

export interface TimesheetDay {
  id: string;
  day: string;
  weekday: string;
  isWeekend: boolean;
}

export interface TimesheetCell {
  dateKey: string;
  value: string;
  code: string;
  display: string[];
  title: string;
  availabilityStatus: string;
  hours: number;
  plannedHours: number;
  overtime: number;
}

export interface TimesheetEmployee {
  id: string;
  name: string;
  role: string;
  personKind: string;
  scheduleCode: string;
  scheduleMode: string;
  cells: TimesheetCell[];
  totalHours: number;
  overtimeHours: number;
}

export interface TimesheetGroup {
  department: string;
  employees: TimesheetEmployee[];
}

function dateParts(value: unknown) {
  const date = value instanceof Date ? value : new Date(asText(value));
  if (!Number.isFinite(date.getTime())) return null;
  const id = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { id, day: String(date.getDate()), weekday: date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", ""), isWeekend: date.getDay() === 0 || date.getDay() === 6 };
}

function adaptCell(value: unknown, fallbackDate = ""): TimesheetCell {
  const cell = asRecord(value);
  const display = asArray(cell.display).map((entry) => asText(entry)).filter(Boolean);
  return {
    dateKey: asText(cell.dateKey, fallbackDate),
    value: asText(cell.value, "unknown"),
    code: asText(cell.code, "unknown"),
    display: display.length ? display : [asText(cell.label, "—")],
    title: asText(cell.title, asText(cell.label, "График дня")),
    availabilityStatus: asText(cell.availabilityStatus, "unknown"),
    hours: asNumber(cell.hours),
    plannedHours: asNumber(cell.plannedHours),
    overtime: asNumber(cell.overtime),
  };
}

function adaptEmployee(value: unknown, days: TimesheetDay[], index: number): TimesheetEmployee | null {
  const employee = asRecord(value);
  const id = asText(employee.timesheetId, asText(employee.id));
  const name = asText(employee.name);
  if (!id || !name) return null;
  const schedule = asRecord(employee.schedule);
  return {
    id,
    name,
    role: asText(employee.role, "Сотрудник"),
    personKind: asText(employee.personKind, "employee"),
    scheduleCode: asText(schedule.code, "—"),
    scheduleMode: asText(schedule.mode, "Не определён"),
    cells: asArray(employee.cells).map((cell, cellIndex) => adaptCell(cell, days[cellIndex]?.id || "")),
    totalHours: asNumber(employee.totalHours),
    overtimeHours: asNumber(employee.overtimeHours),
  };
}

export function adaptTimesheet(payload: unknown) {
  const root = asRecord(payload);
  const source = asRecord(root.model || payload);
  const days = asArray(source.days).map(dateParts).filter(Boolean) as TimesheetDay[];
  const groups = asArray(source.groups).map((value): TimesheetGroup | null => {
    const group = asRecord(value);
    const department = asText(group.department, "Без отдела");
    const employees = asArray(group.employees).map((employee, index) => adaptEmployee(employee, days, index)).filter(Boolean) as TimesheetEmployee[];
    return employees.length ? { department, employees } : null;
  }).filter(Boolean) as TimesheetGroup[];
  const employees = groups.flatMap((group) => group.employees);
  return {
    view: asText(source.view, "month"),
    periodLabel: asText(source.periodLabel),
    days,
    groups,
    employees,
    employeeCount: employees.length,
    departmentCount: asNumber(source.departmentCount) || groups.length,
    plannedHours: asNumber(source.plannedHours),
    overtimeHours: asNumber(source.overtimeHours),
    unknownDayCount: asNumber(source.unknownDayCount),
    calendarSource: asText(source.calendarSource, "unknown"),
    canActivate: days.length > 0 && employees.every((employee) => employee.cells.length === days.length),
  };
}

export const formatTimesheetHours = (value: number): string => Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
