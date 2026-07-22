import { buildTimesheetProductionModel } from "./production-model";

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
  start: string;
  end: string;
  comment: string;
  hasAttendanceEvent: boolean;
}

export interface TimesheetEmployee {
  id: string;
  name: string;
  role: string;
  personKind: string;
  scheduleCode: string;
  scheduleMode: string;
  scheduleAssignmentId: string;
  scheduleTemplateId: string;
  scheduleEffectiveFrom: string;
  schedulePatternOffset: number;
  cells: TimesheetCell[];
  totalHours: number;
  overtimeHours: number;
  canEditAttendance: boolean;
  canEditSchedule: boolean;
}

export interface TimesheetScheduleTemplate {
  id: string;
  code: string;
  label: string;
}

export interface TimesheetGroup {
  department: string;
  employees: TimesheetEmployee[];
}

export interface TimesheetModel {
  view: string;
  periodLabel: string;
  days: TimesheetDay[];
  groups: TimesheetGroup[];
  employees: TimesheetEmployee[];
  employeeCount: number;
  departmentCount: number;
  plannedHours: number;
  overtimeHours: number;
  unknownDayCount: number;
  calendarSource: string;
  canActivate: boolean;
  canEditAttendance: boolean;
  canEditSchedule: boolean;
  scheduleTemplates: TimesheetScheduleTemplate[];
}

function dateParts(value: unknown) {
  const date = value instanceof Date ? value : new Date(asText(value));
  if (!Number.isFinite(date.getTime())) return null;
  const id = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { id, day: String(date.getDate()), weekday: date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", ""), isWeekend: date.getDay() === 0 || date.getDay() === 6 };
}

function adaptCell(value: unknown, fallbackDate = "", attendanceEventKeys = new Set<string>(), employeeId = ""): TimesheetCell {
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
    start: asText(cell.start),
    end: asText(cell.end),
    comment: asText(cell.comment),
    hasAttendanceEvent: attendanceEventKeys.has(`${employeeId}|${asText(cell.dateKey, fallbackDate)}`),
  };
}

function adaptEmployee(value: unknown, days: TimesheetDay[], editableEmployeeIds: Set<string>, scheduleEditableEmployeeIds: Set<string>, attendanceEventKeys: Set<string>): TimesheetEmployee | null {
  const employee = asRecord(value);
  const id = asText(employee.timesheetId, asText(employee.id));
  const name = asText(employee.name);
  if (!id || !name) return null;
  const schedule = asRecord(employee.schedule);
  return {
    id,
    name: asText(employee.displayName, name),
    role: asText(employee.role, "Сотрудник"),
    personKind: asText(employee.personKind, "employee"),
    scheduleCode: asText(schedule.code, "—"),
    scheduleMode: asText(schedule.mode, "Не определён"),
    scheduleAssignmentId: asText(schedule.assignmentId),
    scheduleTemplateId: asText(schedule.templateId),
    scheduleEffectiveFrom: asText(schedule.effectiveFrom),
    schedulePatternOffset: Math.max(0, Math.round(asNumber(schedule.patternOffset))),
    cells: asArray(employee.cells).map((cell, cellIndex) => adaptCell(cell, days[cellIndex]?.id || "", attendanceEventKeys, id)),
    totalHours: asNumber(employee.totalHours),
    overtimeHours: asNumber(employee.overtimeHours),
    canEditAttendance: editableEmployeeIds.has(id),
    canEditSchedule: scheduleEditableEmployeeIds.has(id),
  };
}

export function adaptTimesheet(payload: unknown): TimesheetModel {
  const root = asRecord(payload);
  if (root.productionModel) return buildTimesheetProductionModel(root.productionModel, root.capabilities);
  const source = asRecord(root.model || payload);
  const capabilities = asRecord(root.capabilities);
  const editableEmployeeIds = new Set(asArray(capabilities.editableEmployeeIds).map((value) => asText(value)).filter(Boolean));
  const scheduleEditableEmployeeIds = new Set(asArray(capabilities.scheduleEditableEmployeeIds).map((value) => asText(value)).filter(Boolean));
  const attendanceEventKeys = new Set(asArray(capabilities.attendanceEventKeys).map((value) => asText(value)).filter(Boolean));
  const days = asArray(source.days).map(dateParts).filter(Boolean) as TimesheetDay[];
  const groups = asArray(source.groups).map((value): TimesheetGroup | null => {
    const group = asRecord(value);
    const department = asText(group.department, "Без отдела");
    const employees = asArray(group.employees).map((employee) => adaptEmployee(employee, days, editableEmployeeIds, scheduleEditableEmployeeIds, attendanceEventKeys)).filter(Boolean) as TimesheetEmployee[];
    return employees.length ? { department, employees } : null;
  }).filter(Boolean) as TimesheetGroup[];
  const employees = groups.flatMap((group) => group.employees);
  const scheduleTemplates = asArray(capabilities.scheduleTemplates).map((value): TimesheetScheduleTemplate | null => {
    const template = asRecord(value); const id = asText(template.id); const code = asText(template.code);
    if (!id || !code) return null;
    const window = [asText(template.start), asText(template.end)].filter(Boolean).join("–");
    return { id, code, label: [code, asText(template.caption), window].filter(Boolean).join(" · ") };
  }).filter(Boolean) as TimesheetScheduleTemplate[];
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
    canEditAttendance: capabilities.attendanceEdit === true && editableEmployeeIds.size > 0,
    canEditSchedule: capabilities.scheduleEdit === true && scheduleEditableEmployeeIds.size > 0 && scheduleTemplates.length > 0,
    scheduleTemplates,
  };
}

export const formatTimesheetHours = (value: number): string => Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
