function isExactCalendarDate(value = "") {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function getLocalCalendarDate(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(value.getTime())) return "";
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isAssignmentActiveOnDate(assignment = null, calendarDate = getLocalCalendarDate()) {
  if (!assignment || assignment.isActive === false) return false;
  const validTo = String(assignment.validTo || "").trim();
  // Missing and malformed end dates fail closed as active dependencies. A
  // validTo date is inclusive: an assignment ending today is still active.
  if (!isExactCalendarDate(validTo) || !isExactCalendarDate(calendarDate)) return true;
  return validTo >= calendarDate;
}

export function endActivePrimaryEmploymentAssignments(assignments = [], {
  employeeId = "",
  archiveDate = getLocalCalendarDate(),
  updatedAt = new Date().toISOString(),
} = {}) {
  const targetEmployeeId = String(employeeId || "").trim();
  if (!Array.isArray(assignments) || !targetEmployeeId || !isExactCalendarDate(archiveDate)) return Array.isArray(assignments) ? [...assignments] : [];
  return assignments.map((assignment) => (
    assignment?.employeeId === targetEmployeeId
      && assignment.isPrimary !== false
      && isAssignmentActiveOnDate(assignment, archiveDate)
      ? { ...assignment, validTo: archiveDate, updatedAt: String(updatedAt || "") }
      : assignment
  ));
}
