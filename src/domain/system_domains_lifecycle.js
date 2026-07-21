import { isExactIsoCalendarDate } from "./calendar_date.js";

export const SYSTEM_DOMAINS_BUSINESS_TIME_ZONE = "Europe/Moscow";

export function toSystemDomainsBusinessDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SYSTEM_DOMAINS_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const result = `${parts.year || ""}-${parts.month || ""}-${parts.day || ""}`;
  return isExactIsoCalendarDate(result) ? result : "";
}

function assignmentContinuesThrough(item, businessDate, inclusive) {
  if (!item || item.isActive === false) return false;
  const validTo = String(item.validTo || "").trim();
  // Missing and malformed dates cannot prove that a dependency ended. Treat
  // them as open-ended so lifecycle writes fail closed.
  if (!isExactIsoCalendarDate(validTo) || !isExactIsoCalendarDate(businessDate)) return true;
  return inclusive ? validTo >= businessDate : validTo > businessDate;
}

export function isSystemDomainsAssignmentActiveOnDate(item, businessDate) {
  return assignmentContinuesThrough(item, businessDate, true);
}

export function systemDomainsAssignmentContinuesAfterDate(item, businessDate) {
  return assignmentContinuesThrough(item, businessDate, false);
}
