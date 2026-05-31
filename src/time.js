export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export const scaleConfig = {
  hours: { label: "Часы", unitMs: HOUR, count: 48, cellWidth: 84, snapMs: 30 * 60 * 1000 },
  days: { label: "Дни", unitMs: DAY, count: 21, cellWidth: 118, snapMs: HOUR },
  weeks: { label: "Недели", unitMs: WEEK, count: 10, cellWidth: 174, snapMs: DAY },
};

export function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

export function startOfDay(value) {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeek(value) {
  const date = startOfDay(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

export function addMs(value, ms) {
  return new Date(toDate(value).getTime() + ms);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function snapDate(value, snapMs) {
  return new Date(Math.round(toDate(value).getTime() / snapMs) * snapMs);
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(toDate(value));
}

export function formatShortDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(toDate(value));
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}

export function formatDuration(ms) {
  const sign = ms < 0 ? "-" : "";
  const absolute = Math.abs(ms);
  const days = Math.floor(absolute / DAY);
  const hours = Math.floor((absolute % DAY) / HOUR);
  const minutes = Math.round((absolute % HOUR) / 60000);

  if (days) return `${sign}${days} д ${hours} ч`;
  if (hours) return `${sign}${hours} ч ${minutes ? `${minutes} мин` : ""}`.trim();
  return `${sign}${minutes} мин`;
}

export function isoLocal(value) {
  const date = toDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function fromDateInput(value) {
  return `${value}T00:00:00`;
}

export function toDateInput(value) {
  const date = toDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildTimeScale(scale, startValue, countOverride = null) {
  const config = scaleConfig[scale];
  const tickCount = Math.max(config.count, Math.round(Number(countOverride || config.count)));
  let cursor = startValue ? toDate(startValue) : new Date();

  if (scale === "weeks") cursor = startOfWeek(cursor);
  if (scale === "days" || scale === "hours") cursor = startOfDay(cursor);

  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const start = addMs(cursor, index * config.unitMs);
    const end = addMs(start, config.unitMs);
    const weekNumber = getWeekNumber(start);

    if (scale === "weeks") {
      return {
        start,
        end,
        label: `Неделя ${weekNumber}`,
        sublabel: `${formatShortDate(start)} - ${formatShortDate(addMs(end, -DAY))}`,
      };
    }

    if (scale === "days") {
      return {
        start,
        end,
        label: `${dayNames[start.getDay()]} ${formatShortDate(start)}`,
        sublabel: index === 0 || start.getDate() === 1 ? String(start.getFullYear()) : "",
      };
    }

    return {
      start,
      end,
      label: formatTime(start),
      sublabel: start.getHours() === 0 ? formatShortDate(start) : "",
    };
  });

  return {
    ...config,
    start: cursor,
    count: tickCount,
    end: addMs(cursor, tickCount * config.unitMs),
    ticks,
    width: tickCount * config.cellWidth,
  };
}

export function getWeekNumber(value) {
  const date = startOfDay(value);
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const weekStart = startOfWeek(firstThursday);
  return Math.ceil(((date.getTime() - weekStart.getTime()) / DAY + 1) / 7);
}

export function xToDate(x, scaleInfo) {
  const ratio = x / scaleInfo.cellWidth;
  return snapDate(addMs(scaleInfo.start, ratio * scaleInfo.unitMs), scaleInfo.snapMs);
}

export function dateToX(value, scaleInfo) {
  return ((toDate(value).getTime() - scaleInfo.start.getTime()) / scaleInfo.unitMs) * scaleInfo.cellWidth;
}
