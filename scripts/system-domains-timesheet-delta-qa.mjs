import assert from "node:assert/strict";

import { validateSystemDomainsTimesheetDelta } from "./domain-api.mjs";
import { normalizeSystemDomains } from "../src/modules/system_domains/service.js";

const employeeA = "employee-a";
const employeeB = "employee-b";
const dateA = "2026-07-22";
const dateB = "2026-07-23";
const base = normalizeSystemDomains({
  metadata: { source: "timesheet-delta-qa" },
  registries: {
    employees: [
      { id: employeeA, displayName: "Employee A", isActive: true },
      { id: employeeB, displayName: "Employee B", isActive: true },
    ],
    scheduleTemplates: [{ id: "schedule-a", code: "5/2", caption: "5/2", isActive: true }],
    scheduleAssignments: [
      { id: "assignment-a-history", employeeId: employeeA, scheduleTemplateId: "schedule-a", validFrom: "2026-01-01", validTo: "2026-06-30", patternOffset: 0 },
      { id: "assignment-a", employeeId: employeeA, scheduleTemplateId: "schedule-a", validFrom: "2026-07-01", validTo: "2026-07-31", patternOffset: 0 },
      { id: "assignment-a-future", employeeId: employeeA, scheduleTemplateId: "schedule-a", validFrom: "2026-08-01", validTo: "", patternOffset: 0 },
    ],
    attendanceEvents: [{ id: "attendance-a", employeeId: employeeA, date: dateA, type: "work", start: "08:00", end: "17:00", overtimeHours: 0, comment: "" }],
  },
});

function candidate(registryName, rows, metadata = {}) {
  return normalizeSystemDomains({
    ...base,
    metadata: {
      ...base.metadata,
      updatedAt: "2026-07-22T09:00:00.000Z",
      lastMutationRegistry: registryName,
      lastMutationKeys: [],
      ...metadata,
    },
    registries: { ...base.registries, [registryName]: rows },
  });
}

const attendanceSave = candidate("attendanceEvents", [
  { ...base.registries.attendanceEvents[0], type: "sick", start: "", end: "", comment: "Approved sick day" },
]);
assert.deepEqual(validateSystemDomainsTimesheetDelta({ current: base, candidate: attendanceSave }), {
  ok: true,
  registryName: "attendanceEvents",
  targetEmployeeId: employeeA,
  date: dateA,
  mutationKey: `${employeeA}|${dateA}`,
  changedRows: [{ id: "attendance-a", before: base.registries.attendanceEvents[0], after: attendanceSave.registries.attendanceEvents[0] }],
});

const attendanceRemove = candidate("attendanceEvents", []);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: attendanceRemove }).ok, true);

const multipleDates = candidate("attendanceEvents", [
  { ...base.registries.attendanceEvents[0], type: "sick" },
  { id: "attendance-b", employeeId: employeeA, date: dateB, type: "work", start: "08:00", end: "17:00", overtimeHours: 0, comment: "" },
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: multipleDates }).code, "timesheet-attendance-coordinate-invalid");

const multipleEmployees = candidate("attendanceEvents", [
  { ...base.registries.attendanceEvents[0], type: "sick" },
  { id: "attendance-b", employeeId: employeeB, date: dateA, type: "work", start: "08:00", end: "17:00", overtimeHours: 0, comment: "" },
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: multipleEmployees }).code, "timesheet-target-scope-invalid");

const duplicateCoordinate = candidate("attendanceEvents", [
  { ...base.registries.attendanceEvents[0], type: "sick" },
  { id: "attendance-a-duplicate", employeeId: employeeA, date: dateA, type: "overtime", start: "", end: "", overtimeHours: 1, comment: "" },
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: duplicateCoordinate }).code, "timesheet-attendance-cardinality-invalid");

const scheduleSave = candidate("scheduleAssignments", [
  base.registries.scheduleAssignments[0],
  { ...base.registries.scheduleAssignments[1], patternOffset: 1 },
  base.registries.scheduleAssignments[2],
]);
const scheduleDecision = validateSystemDomainsTimesheetDelta({ current: base, candidate: scheduleSave });
assert.equal(scheduleDecision.ok, true);
assert.equal(scheduleDecision.targetEmployeeId, employeeA);
assert.equal(scheduleDecision.registryName, "scheduleAssignments");
assert.equal(scheduleDecision.changedRows.length, 1, "one schedule upsert must preserve unrelated effective intervals");

const scheduleRemove = candidate("scheduleAssignments", [
  base.registries.scheduleAssignments[0],
  base.registries.scheduleAssignments[2],
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: scheduleRemove }).ok, true, "one concrete schedule assignment may be removed");

const broadScheduleDeletion = candidate("scheduleAssignments", [
  { ...base.registries.scheduleAssignments[1], patternOffset: 1 },
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: broadScheduleDeletion }).code, "timesheet-schedule-delta-broad");

const overlappingSchedule = candidate("scheduleAssignments", [
  ...base.registries.scheduleAssignments,
  { id: "assignment-a-overlap", employeeId: employeeA, scheduleTemplateId: "schedule-a", validFrom: "2026-07-15", validTo: "2026-07-20", patternOffset: 0 },
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: overlappingSchedule }).code, "timesheet-schedule-overlap");

const invalidScheduleInterval = candidate("scheduleAssignments", [
  base.registries.scheduleAssignments[0],
  { ...base.registries.scheduleAssignments[1], validFrom: "2026-07-31", validTo: "2026-07-01" },
  base.registries.scheduleAssignments[2],
]);
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: invalidScheduleInterval }).code, "timesheet-schedule-interval-invalid");

const metadataEscape = candidate("attendanceEvents", attendanceSave.registries.attendanceEvents, { source: "forged-source" });
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: metadataEscape }).code, "timesheet-metadata-scope-invalid");

const crossRegistry = normalizeSystemDomains({
  ...attendanceSave,
  registries: {
    ...attendanceSave.registries,
    scheduleAssignments: base.registries.scheduleAssignments.map((row) => row.id === "assignment-a" ? { ...row, patternOffset: 2 } : row),
  },
});
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: crossRegistry }).code, "timesheet-delta-scope-invalid");
assert.equal(validateSystemDomainsTimesheetDelta({ current: base, candidate: base }).code, "timesheet-delta-scope-invalid");

console.log("System Domains Timesheet delta invariants QA: OK");
console.log("- one employee/day attendance and one concrete schedule assignment delta: pass");
console.log("- unrelated schedule history is preserved; broad deletion, overlap and invalid intervals fail closed: pass");
