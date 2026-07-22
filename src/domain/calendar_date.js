/**
 * Accept only a real Gregorian calendar day in the transport shape used by
 * HTML date controls and PostgreSQL DATE columns.
 *
 * Date.parse alone is deliberately insufficient: JavaScript normalises some
 * impossible inputs (for example 2026-02-31) into a different valid day.
 */
export function isExactIsoCalendarDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith("0000-")) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

export function toExactIsoCalendarDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value || "").trim();
  return isExactIsoCalendarDate(text) ? text : "";
}

/**
 * Accept an exact ISO/RFC3339 instant only when the source carries an
 * explicit UTC offset. Date.parse alone also accepts local date-times and
 * normalises impossible calendar days, neither of which is safe for a
 * physical Planning slot command.
 */
export function isExactIsoInstantWithOffset(value) {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || match[1] === "0000") return false;
  const [, year, month, day, hour, minute, second, zone, , offsetHour, offsetMinute] = match;
  if (!isExactIsoCalendarDate(`${year}-${month}-${day}`)
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59) return false;
  if (zone !== "Z" && (Number(offsetHour) > 14 || Number(offsetMinute) > 59
    || (Number(offsetHour) === 14 && Number(offsetMinute) !== 0))) return false;
  return !Number.isNaN(Date.parse(value));
}
