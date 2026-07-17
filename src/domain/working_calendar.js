// Pure work-calendar engine shared by planning UI and server-side commands.
// Both runtimes use Europe/Moscow, so native Date local fields describe the
// same production shift boundaries on the pilot.

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function startOfDay(value) {
  const date = toDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days = 1) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addMs(value, milliseconds) {
  return new Date(toDate(value).getTime() + milliseconds);
}

export function normalizeWorkSchedule(value, fallback = "5/2") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback || "";
  if (text.includes("24/7") || text.includes("7/0")) return "24/7";
  if (text.includes("6/1")) return "6/1";
  if (text.includes("2/2")) return "2/2";
  if (text.includes("5/2")) return "5/2";
  return fallback || "";
}

export function normalizeWorkMode(value, fallback = "08:00-20:00") {
  const match = String(value || "").trim().match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return fallback || "";
  const startHour = Math.max(0, Math.min(23, Number(match[1])));
  const startMinute = Math.max(0, Math.min(59, Number(match[2])));
  const endHour = Math.max(0, Math.min(24, Number(match[3])));
  const endMinute = Math.max(0, Math.min(59, Number(match[4])));
  return `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}-${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

export function createWorkingCalendar(workCenter = {}, { isWarehouse = false } = {}) {
  const fallbackSchedule = isWarehouse || workCenter?.unitType === "warehouse" ? "24/7" : "5/2";
  const scheduleType = normalizeWorkSchedule(workCenter?.workSchedule || workCenter?.shift, fallbackSchedule);
  const fallbackMode = scheduleType === "24/7" ? "00:00-24:00" : "08:00-20:00";
  const mode = normalizeWorkMode(workCenter?.workMode || workCenter?.shift, fallbackMode);
  const match = mode.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  const start = match ? Number(match[1]) * 60 + Number(match[2]) : 8 * 60;
  const end = match ? Number(match[3]) * 60 + Number(match[4]) : 20 * 60;
  const workDays = scheduleType === "24/7" || scheduleType === "2/2"
    ? new Set([0, 1, 2, 3, 4, 5, 6])
    : scheduleType === "6/1"
      ? new Set([1, 2, 3, 4, 5, 6])
      : new Set([1, 2, 3, 4, 5]);
  return { scheduleType, start, end, workDays, isAlwaysOn: scheduleType === "24/7" && start === 0 && end === 24 * 60 };
}

export function isCalendarWorkDay(calendar, value) {
  if (!calendar || calendar.isAlwaysOn || calendar.scheduleType === "2/2") return true;
  return calendar.workDays.has(startOfDay(value).getDay());
}

function minuteToDate(dayStart, minute) {
  return addMs(dayStart, minute * 60 * 1000);
}

export function getCalendarWorkingIntervals(calendar, value) {
  const dayStart = startOfDay(value);
  const nextDay = addDays(dayStart, 1);
  if (!calendar || calendar.isAlwaysOn) return [{ start: dayStart, end: nextDay }];
  if (calendar.start === calendar.end) return [];
  const intervals = [];
  const previousDayStart = addDays(dayStart, -1);
  if (calendar.start < calendar.end) {
    if (isCalendarWorkDay(calendar, dayStart)) intervals.push({ start: minuteToDate(dayStart, calendar.start), end: minuteToDate(dayStart, calendar.end) });
  } else {
    if (isCalendarWorkDay(calendar, previousDayStart)) intervals.push({ start: dayStart, end: minuteToDate(dayStart, calendar.end) });
    if (isCalendarWorkDay(calendar, dayStart)) intervals.push({ start: minuteToDate(dayStart, calendar.start), end: nextDay });
  }
  return intervals.filter((interval) => interval.end > interval.start).sort((left, right) => left.start - right.start);
}

export function snapToCalendarWorkingTime(calendar, value) {
  let probe = toDate(value);
  let dayCursor = startOfDay(probe);
  for (let guard = 0; guard < 370; guard += 1) {
    const intervals = getCalendarWorkingIntervals(calendar, dayCursor);
    for (const interval of intervals) {
      if (probe <= interval.start) return interval.start;
      if (probe >= interval.start && probe < interval.end) return probe;
    }
    dayCursor = addDays(dayCursor, 1);
    probe = dayCursor;
  }
  return toDate(value);
}

export function addCalendarWorkingDuration(calendar, start, durationMs) {
  let remainingMs = Math.max(0, Number(durationMs || 0));
  let cursor = snapToCalendarWorkingTime(calendar, start);
  if (remainingMs <= 0) return cursor;
  for (let guard = 0; guard < 10000; guard += 1) {
    const intervals = getCalendarWorkingIntervals(calendar, cursor);
    let advanced = false;
    for (const interval of intervals) {
      if (cursor < interval.start) cursor = interval.start;
      if (cursor >= interval.end) continue;
      const availableMs = interval.end.getTime() - cursor.getTime();
      if (remainingMs <= availableMs) return addMs(cursor, remainingMs);
      remainingMs -= availableMs;
      cursor = interval.end;
      advanced = true;
    }
    const nextDay = addDays(cursor, 1);
    cursor = snapToCalendarWorkingTime(calendar, advanced && nextDay <= cursor ? addMs(cursor, 1) : nextDay);
  }
  return addMs(cursor, remainingMs);
}

export const WORKING_CALENDAR_DAY_MS = DAY_MS;
