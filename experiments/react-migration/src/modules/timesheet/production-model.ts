import type {
  TimesheetCell,
  TimesheetDay,
  TimesheetEmployee,
  TimesheetGroup,
  TimesheetModel,
  TimesheetScheduleTemplate,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
const asRecord = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const asNumber = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const pad = (value: number): string => String(value).padStart(2, "0");

interface ParsedDate {
  key: string;
  epochDay: number;
  date: Date;
}

interface ResolvedSchedule {
  known: boolean;
  assignmentId: string;
  templateId: string;
  code: string;
  label: string;
  start: string;
  end: string;
  breakMinutes: number;
  plannedHours: number;
  scheduledWorkday: boolean;
  effectiveFrom: string;
  patternOffset: number;
}

const indexById = (rows: unknown[]): Map<string, UnknownRecord> => new Map(rows
  .map((value) => asRecord(value))
  .map((value) => [asText(value.id), value] as const)
  .filter(([id]) => Boolean(id)));

function parseDate(value: unknown): ParsedDate | null {
  const match = asText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epochMs = Date.UTC(year, month - 1, day);
  const date = new Date(epochMs);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { key: `${year}-${pad(month)}-${pad(day)}`, epochDay: Math.floor(epochMs / DAY_MS), date };
}

function fromEpochDay(epochDay: number): ParsedDate {
  const date = new Date(epochDay * DAY_MS);
  const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return { key, epochDay, date };
}

function getPeriodDates(viewValue: unknown, anchorValue: unknown): { view: "week" | "month"; dates: ParsedDate[] } {
  const view = viewValue === "week" ? "week" : "month";
  const anchor = parseDate(anchorValue) || parseDate(new Date().toISOString().slice(0, 10)) as ParsedDate;
  if (view === "week") {
    const weekday = anchor.date.getUTCDay();
    const firstEpochDay = anchor.epochDay - ((weekday + 6) % 7);
    return { view, dates: Array.from({ length: 7 }, (_, index) => fromEpochDay(firstEpochDay + index)) };
  }
  const firstEpochDay = Math.floor(Date.UTC(anchor.date.getUTCFullYear(), anchor.date.getUTCMonth(), 1) / DAY_MS);
  const count = new Date(Date.UTC(anchor.date.getUTCFullYear(), anchor.date.getUTCMonth() + 1, 0)).getUTCDate();
  return { view, dates: Array.from({ length: count }, (_, index) => fromEpochDay(firstEpochDay + index)) };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function getPeriodLabel(view: "week" | "month", dates: ParsedDate[]): string {
  if (!dates.length) return "";
  if (view === "week") return `${formatDate(dates[0].date)}-${formatDate(dates[dates.length - 1].date)}`;
  return dates[0].date.toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getTimeMinutes(value: unknown): number | null {
  const match = asText(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

function getWindowMinutes(start: unknown, end: unknown): number | null {
  const startMinutes = getTimeMinutes(start);
  const endMinutes = getTimeMinutes(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return null;
  return endMinutes > startMinutes ? endMinutes - startMinutes : (24 * 60) - startMinutes + endMinutes;
}

function rowEffectiveOn(row: UnknownRecord, date: ParsedDate): boolean {
  const from = parseDate(row.validFrom ?? row.effectiveFrom);
  const to = parseDate(row.validTo ?? row.effectiveTo);
  return (!from || from.epochDay <= date.epochDay) && (!to || date.epochDay <= to.epochDay);
}

function buildWorkPattern(codeValue: unknown): { anchor: ParsedDate; pattern: boolean[] } {
  const code = asText(codeValue);
  const match = code.match(/^(\d+)\/(\d+)$/);
  const workDays = Math.max(1, Math.min(31, Number(match?.[1] || 5)));
  const offDays = Math.max(1, Math.min(31, Number(match?.[2] || 2)));
  return {
    anchor: parseDate(code === "5/2" ? "1970-01-05" : "1970-01-01") as ParsedDate,
    pattern: [...Array<boolean>(workDays).fill(true), ...Array<boolean>(offDays).fill(false)],
  };
}

function resolveSchedule({
  employeeId,
  position,
  date,
  assignments,
  templatesById,
}: {
  employeeId: string;
  position: UnknownRecord;
  date: ParsedDate;
  assignments: UnknownRecord[];
  templatesById: Map<string, UnknownRecord>;
}): ResolvedSchedule {
  const assignment = assignments
    .filter((row) => asText(row.employeeId) === employeeId && rowEffectiveOn(row, date))
    .sort((left, right) => asText(right.validFrom ?? right.effectiveFrom).localeCompare(asText(left.validFrom ?? left.effectiveFrom), "en"))[0];
  const templateId = asText(assignment?.scheduleTemplateId, asText(position.defaultScheduleTemplateId));
  const template = templatesById.get(templateId);
  const code = asText(template?.code);
  const start = asText(assignment?.startTime, asText(template?.startTime ?? template?.start, "08:00"));
  const end = asText(assignment?.endTime, asText(template?.endTime ?? template?.end, code === "2/2" ? "20:00" : "17:00"));
  const windowMinutes = getWindowMinutes(start, end);
  const breakMinutes = Math.max(0, Math.round(asNumber(assignment?.breakMinutes ?? template?.breakMinutes ?? (template?.subtractLunch ? 60 : 0))));
  if (!templateId || !template || !code || windowMinutes === null || windowMinutes <= breakMinutes) {
    return { known: false, assignmentId: "", templateId: "", code: "—", label: "Не определён", start: "", end: "", breakMinutes: 0, plannedHours: 0, scheduledWorkday: false, effectiveFrom: "", patternOffset: 0 };
  }
  const { anchor, pattern } = buildWorkPattern(code);
  const patternOffset = Math.max(0, Math.round(asNumber(assignment?.patternOffset ?? template.patternOffset)));
  const patternIndex = ((date.epochDay - anchor.epochDay + patternOffset) % pattern.length + pattern.length) % pattern.length;
  const scheduledWorkday = pattern[patternIndex] === true;
  return {
    known: true,
    assignmentId: asText(assignment?.id),
    templateId,
    code,
    label: asText(template.label ?? template.caption ?? template.name, code),
    start,
    end,
    breakMinutes,
    plannedHours: scheduledWorkday ? (windowMinutes - breakMinutes) / 60 : 0,
    scheduledWorkday,
    effectiveFrom: asText(assignment?.validFrom ?? assignment?.effectiveFrom),
    patternOffset,
  };
}

const ABSENCE_LABELS: Record<string, { value: string; code: string; display: string[]; title: string }> = {
  vacation: { value: "vacation", code: "vacation", display: ["Отп"], title: "Плановый отпуск" },
  sick: { value: "sick", code: "sick", display: ["Б"], title: "Больничный" },
  leave: { value: "leave", code: "leave", display: ["Отг"], title: "Отгул" },
  off: { value: "off", code: "off", display: ["Вых"], title: "Выходной день" },
  day_off: { value: "off", code: "off", display: ["Вых"], title: "Выходной день" },
};

function buildCell(employeeId: string, date: ParsedDate, schedule: ResolvedSchedule, events: UnknownRecord[]): TimesheetCell {
  if (!schedule.known) {
    return { dateKey: date.key, value: "unknown", code: "unknown", display: ["?"], title: "График дня не определён", availabilityStatus: "unknown", hours: 0, plannedHours: 0, overtime: 0, start: "", end: "", comment: "", hasAttendanceEvent: false };
  }
  const dayEvents = events.filter((row) => asText(row.employeeId) === employeeId && asText(row.date) === date.key);
  const baseEvent = dayEvents.find((row) => !["overtime"].includes(asText(row.kind ?? row.type))) || dayEvents[0];
  const kind = asText(baseEvent?.kind ?? baseEvent?.type);
  const absence = ABSENCE_LABELS[kind];
  const overtime = dayEvents.reduce((total, row) => {
    const rowKind = asText(row.kind ?? row.type);
    if (rowKind === "overtime") return total + Math.max(0, asNumber(row.minutes) / 60);
    return total + Math.max(0, asNumber(row.overtimeHours));
  }, 0);
  const start = asText(baseEvent?.startTime ?? baseEvent?.start, schedule.start);
  const end = asText(baseEvent?.endTime ?? baseEvent?.end, schedule.end);
  const actualWindow = kind === "work" ? getWindowMinutes(start, end) : null;
  const baseHours = absence ? 0 : actualWindow !== null && actualWindow > schedule.breakMinutes
    ? (actualWindow - schedule.breakMinutes) / 60
    : schedule.plannedHours;
  const hours = baseHours + overtime;
  const comment = [...new Set(dayEvents.map((row) => asText(row.comment)).filter(Boolean))].join("; ");
  if (absence) {
    return { dateKey: date.key, ...absence, title: [absence.title, comment].filter(Boolean).join("; "), availabilityStatus: "absent", hours: 0, plannedHours: schedule.plannedHours, overtime: 0, start: "", end: "", comment, hasAttendanceEvent: true };
  }
  if (!schedule.scheduledWorkday && !dayEvents.length) {
    return { dateKey: date.key, value: "off", code: "off", display: ["Вых"], title: "Выходной день", availabilityStatus: "absent", hours: 0, plannedHours: 0, overtime: 0, start: schedule.start, end: schedule.end, comment: "", hasAttendanceEvent: false };
  }
  const value = overtime > 0 ? "overtime" : "work";
  return {
    dateKey: date.key,
    value,
    code: overtime > 0 ? "work-overtime" : "work",
    display: [start, end].filter(Boolean),
    title: [`Рабочий день · ${hours.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч`, overtime > 0 ? `сверхурочно +${overtime.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч` : "", comment].filter(Boolean).join("; "),
    availabilityStatus: "available",
    hours,
    plannedHours: schedule.plannedHours,
    overtime,
    start,
    end,
    comment,
    hasAttendanceEvent: dayEvents.length > 0,
  };
}

export function buildTimesheetProductionModel(inputValue: unknown, capabilitiesValue: unknown): TimesheetModel {
  const input = asRecord(inputValue);
  const domains = asRecord(input.domains);
  const registries = asRecord(domains.registries);
  const capabilities = asRecord(capabilitiesValue);
  const employees = asArray(registries.employees).map(asRecord).filter((row) => asText(row.id) && row.isActive !== false);
  const employmentAssignments = asArray(registries.employmentAssignments).map(asRecord);
  const positionsById = indexById(asArray(registries.positions));
  const orgUnitsById = indexById(asArray(registries.orgUnits));
  const templates = asArray(registries.scheduleTemplates).map(asRecord).filter((row) => asText(row.id) && row.isActive !== false);
  const templatesById = indexById(templates);
  const scheduleAssignments = asArray(registries.scheduleAssignments).map(asRecord);
  const attendanceEvents = asArray(registries.attendanceEvents).map(asRecord);
  const editableEmployeeIds = new Set(asArray(capabilities.editableEmployeeIds).map((value) => asText(value)).filter(Boolean));
  const scheduleEditableEmployeeIds = new Set(asArray(capabilities.scheduleEditableEmployeeIds).map((value) => asText(value)).filter(Boolean));
  const { view, dates } = getPeriodDates(input.view, input.periodAnchor);
  const days: TimesheetDay[] = dates.map((date) => ({
    id: date.key,
    day: String(date.date.getUTCDate()),
    weekday: date.date.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
    isWeekend: date.date.getUTCDay() === 0 || date.date.getUTCDay() === 6,
  }));

  const projectedEmployees = employees.map((employee): { department: string; employee: TimesheetEmployee; unknownDayCount: number; plannedHours: number } => {
    const employeeId = asText(employee.id);
    const employment = employmentAssignments.find((row) => asText(row.employeeId) === employeeId && row.isPrimary === true)
      || employmentAssignments.find((row) => asText(row.employeeId) === employeeId)
      || {};
    const position = positionsById.get(asText(employment.positionId)) || {};
    const orgUnit = orgUnitsById.get(asText(employment.orgUnitId)) || {};
    const schedules = dates.map((date) => resolveSchedule({ employeeId, position, date, assignments: scheduleAssignments, templatesById }));
    const cells = dates.map((date, index) => buildCell(employeeId, date, schedules[index], attendanceEvents));
    const firstSchedule = schedules[0] || resolveSchedule({ employeeId, position, date: parseDate("1970-01-01") as ParsedDate, assignments: scheduleAssignments, templatesById });
    const capabilitiesRecord = asRecord(position.capabilities);
    return {
      department: asText(orgUnit.name, "Без отдела"),
      unknownDayCount: cells.filter((cell) => cell.availabilityStatus === "unknown").length,
      plannedHours: cells.reduce((sum, cell) => sum + cell.plannedHours, 0),
      employee: {
        id: employeeId,
        name: asText(employee.displayName, employeeId),
        role: asText(position.name, "Сотрудник"),
        personKind: capabilitiesRecord.canDistribute === true || asText(position.kind) === "manager" ? "master" : "employee",
        scheduleCode: firstSchedule.code,
        scheduleMode: firstSchedule.known ? `${firstSchedule.start}-${firstSchedule.end}` : "Не определён",
        scheduleAssignmentId: firstSchedule.assignmentId,
        scheduleTemplateId: firstSchedule.templateId,
        scheduleEffectiveFrom: firstSchedule.effectiveFrom,
        schedulePatternOffset: firstSchedule.patternOffset,
        cells,
        totalHours: cells.reduce((sum, cell) => sum + cell.hours, 0),
        overtimeHours: cells.reduce((sum, cell) => sum + cell.overtime, 0),
        canEditAttendance: editableEmployeeIds.has(employeeId),
        canEditSchedule: scheduleEditableEmployeeIds.has(employeeId),
      },
    };
  }).sort((left, right) => left.department.localeCompare(right.department, "ru")
    || left.employee.personKind.localeCompare(right.employee.personKind, "ru")
    || left.employee.name.localeCompare(right.employee.name, "ru"));

  const groups = projectedEmployees.reduce<TimesheetGroup[]>((result, entry) => {
    const current = result[result.length - 1];
    if (current?.department === entry.department) current.employees.push(entry.employee);
    else result.push({ department: entry.department, employees: [entry.employee] });
    return result;
  }, []);
  const modelEmployees = projectedEmployees.map((entry) => entry.employee);
  const scheduleTemplates: TimesheetScheduleTemplate[] = templates.map((template) => {
    const id = asText(template.id);
    const code = asText(template.code, id);
    const start = asText(template.startTime ?? template.start);
    const end = asText(template.endTime ?? template.end);
    return { id, code, label: [code, asText(template.label ?? template.caption ?? template.name), start && end ? `${start}–${end}` : ""].filter(Boolean).join(" · ") };
  });
  return {
    view,
    periodLabel: getPeriodLabel(view, dates),
    days,
    groups,
    employees: modelEmployees,
    employeeCount: modelEmployees.length,
    departmentCount: groups.length,
    plannedHours: projectedEmployees.reduce((sum, entry) => sum + entry.plannedHours, 0),
    overtimeHours: modelEmployees.reduce((sum, employee) => sum + employee.overtimeHours, 0),
    unknownDayCount: projectedEmployees.reduce((sum, entry) => sum + entry.unknownDayCount, 0),
    calendarSource: "canonical",
    canActivate: dates.length > 0 && modelEmployees.every((employee) => employee.cells.length === dates.length),
    canEditAttendance: capabilities.attendanceEdit === true && editableEmployeeIds.size > 0,
    canEditSchedule: capabilities.scheduleEdit === true && scheduleEditableEmployeeIds.size > 0 && scheduleTemplates.length > 0,
    scheduleTemplates,
  };
}
