import type { TimesheetAttendanceDraft, TimesheetReactCommand } from "./TimesheetScenario";

export interface TimesheetAttendanceCommandEvent {
  id: string;
  employeeId: string;
  date: string;
  kind: "work" | "overtime" | "vacation" | "sick" | "leave" | "day_off";
  startTime?: string;
  endTime?: string;
  minutes?: number;
  comment?: string;
  sourceRefs: string[];
}

export type TimesheetPreparedCommand = Exclude<TimesheetReactCommand, { type: "save-attendance" }> | {
  type: "save-attendance";
  payload: TimesheetAttendanceDraft & { events: TimesheetAttendanceCommandEvent[] };
};

export type TimesheetAttendanceBuildResult =
  | { ok: true; events: TimesheetAttendanceCommandEvent[] }
  | { ok: false; message: string };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_VALUE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const VALUES = new Set(["work", "overtime", "vacation", "sick", "leave", "off"]);

export function buildTimesheetAttendanceCommand(draft: TimesheetAttendanceDraft): TimesheetAttendanceBuildResult {
  const employeeId = String(draft.employeeId || "").trim();
  const date = String(draft.dateKey || "").trim();
  const value = String(draft.value || "").trim();
  const start = String(draft.start || "").trim();
  const end = String(draft.end || "").trim();
  const comment = String(draft.comment || "").trim();
  const overtime = draft.overtime === "" ? 0 : Number(draft.overtime);
  if (!employeeId || !DATE_KEY.test(date)) return { ok: false, message: "Сотрудник или дата факта дня некорректны." };
  if (!VALUES.has(value)) return { ok: false, message: "Выберите состояние дня." };
  if (!Number.isFinite(overtime) || overtime < 0) return { ok: false, message: "Сверхурочные часы должны быть неотрицательным числом." };
  const isWork = value === "work" || value === "overtime";
  if (isWork && (!TIME_VALUE.test(start) || !TIME_VALUE.test(end) || start === end)) return { ok: false, message: "Для рабочего дня заполните корректные начало и окончание." };
  if (!isWork && overtime > 0) return { ok: false, message: "Для отсутствия нельзя указывать сверхурочные часы." };
  if (value === "overtime" && overtime <= 0) return { ok: false, message: "Для сверхурочной смены укажите часы сверхурочной работы." };

  const baseId = `attendance:${employeeId}:${date}`;
  const sourceRefs = [`react:timesheet:attendance:${employeeId}:${date}`];
  const kind: TimesheetAttendanceCommandEvent["kind"] = value === "off"
    ? "day_off"
    : value === "overtime"
      ? "work"
      : value as TimesheetAttendanceCommandEvent["kind"];
  const base: TimesheetAttendanceCommandEvent = {
    id: baseId,
    employeeId,
    date,
    kind,
    ...(isWork ? { startTime: start, endTime: end } : {}),
    ...(comment ? { comment } : {}),
    sourceRefs,
  };
  const events = [base];
  if (overtime > 0) {
    events.push({
      id: `${baseId}:overtime`,
      employeeId,
      date,
      kind: "overtime",
      minutes: Math.max(1, Math.round(overtime * 60)),
      ...(comment ? { comment } : {}),
      sourceRefs: [`${sourceRefs[0]}:overtime`],
    });
  }
  return { ok: true, events };
}

export function prepareTimesheetCommand(command: TimesheetReactCommand): { ok: true; command: TimesheetPreparedCommand } | { ok: false; message: string } {
  if (command.type !== "save-attendance") return { ok: true, command };
  const result = buildTimesheetAttendanceCommand(command.payload);
  if (!result.ok) return result;
  return { ok: true, command: { ...command, payload: { ...command.payload, events: result.events } } };
}
