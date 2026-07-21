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
