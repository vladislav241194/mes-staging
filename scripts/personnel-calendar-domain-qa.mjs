import assert from "node:assert/strict";
import {
  DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  PERSONNEL_ATTENDANCE_EVENT_KINDS,
  createPersonnelCalendarService,
  migrateLegacyTimesheetState,
  migrateTimesheetCellOverrides,
  migrateTimesheetScheduleOverrides,
  projectEmployeeAvailability,
  projectEmployeeAvailabilityRange,
  resolveEffectiveScheduleAssignment,
  validatePersonnelCalendarModel,
} from "../src/modules/personnel_calendar/service.js";

const fiveTwoAssignment = {
  id: "assignment:employee-a:5-2",
  employeeId: "employee-a",
  scheduleTemplateId: "schedule-5-2",
  effectiveFrom: "2026-06-01",
  effectiveTo: null,
  patternOffset: 0,
  sourceRefs: ["qa:assignment:employee-a"],
};

const baseModel = {
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: [fiveTwoAssignment],
  attendanceEvents: [],
};

const baseValidation = validatePersonnelCalendarModel(baseModel);
assert.equal(baseValidation.valid, true, JSON.stringify(baseValidation.issues, null, 2));

const monday = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-01",
  ...baseModel,
});
assert.equal(monday.status, "available");
assert.equal(monday.reason, "scheduled_work");
assert.equal(monday.scheduledWorkday, true);
assert.equal(monday.plannedMinutes, 480);
assert.equal(monday.availableMinutes, 480);
assert(monday.sourceRefs.includes("qa:assignment:employee-a"));
assert(monday.sourceRefs.includes("personnel-calendar:built-in:5/2"));

const saturday = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-06",
  ...baseModel,
});
assert.equal(saturday.status, "absent");
assert.equal(saturday.reason, "scheduled_off");
assert.equal(saturday.scheduledWorkday, false);
assert.equal(saturday.plannedMinutes, 0);
assert.equal(saturday.availableMinutes, 0);

const twoTwoAssignment = {
  id: "assignment:employee-b:2-2",
  employeeId: "employee-b",
  scheduleTemplateId: "schedule-2-2",
  effectiveFrom: "1970-01-01",
  effectiveTo: null,
  patternOffset: 0,
  sourceRefs: ["qa:assignment:employee-b"],
};
const twoTwoInput = {
  employeeId: "employee-b",
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: [twoTwoAssignment],
  attendanceEvents: [],
};
const twoTwoDays = ["1970-01-01", "1970-01-02", "1970-01-03", "1970-01-04", "1970-01-05"]
  .map((date) => projectEmployeeAvailability({ ...twoTwoInput, date }));
assert.deepEqual(twoTwoDays.map((day) => day.status), ["available", "available", "absent", "absent", "available"]);
assert.deepEqual(twoTwoDays.map((day) => day.plannedMinutes), [720, 720, 0, 0, 720]);

const offsetTwoTwo = projectEmployeeAvailability({
  ...twoTwoInput,
  date: "1970-01-02",
  scheduleAssignments: [{ ...twoTwoAssignment, id: "assignment:employee-b:offset", patternOffset: 1 }],
});
assert.equal(offsetTwoTwo.status, "absent", "2/2 patternOffset must shift the deterministic cycle");

const datedAssignments = [
  {
    ...fiveTwoAssignment,
    id: "assignment:employee-a:old",
    effectiveTo: "2026-06-14",
  },
  {
    ...fiveTwoAssignment,
    id: "assignment:employee-a:new",
    scheduleTemplateId: "schedule-2-2",
    effectiveFrom: "2026-06-15",
    effectiveTo: null,
  },
];
assert.equal(resolveEffectiveScheduleAssignment({
  employeeId: "employee-a",
  date: "2026-06-14",
  scheduleAssignments: datedAssignments,
}).assignment?.id, "assignment:employee-a:old");
assert.equal(resolveEffectiveScheduleAssignment({
  employeeId: "employee-a",
  date: "2026-06-15",
  scheduleAssignments: datedAssignments,
}).assignment?.id, "assignment:employee-a:new");
assert.equal(resolveEffectiveScheduleAssignment({
  employeeId: "employee-a",
  date: "2026-05-31",
  scheduleAssignments: datedAssignments,
}).status, "missing");

const overlapAssignments = [
  fiveTwoAssignment,
  {
    ...fiveTwoAssignment,
    id: "assignment:employee-a:overlap",
    effectiveFrom: "2026-06-15",
  },
];
const overlapValidation = validatePersonnelCalendarModel({
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: overlapAssignments,
  attendanceEvents: [],
});
assert.equal(overlapValidation.valid, false);
assert(overlapValidation.issues.some((issue) => issue.code === "overlapping_schedule_assignments"));
const overlapProjection = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-16",
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: overlapAssignments,
  attendanceEvents: [],
});
assert.equal(overlapProjection.status, "unknown");
assert.equal(overlapProjection.availableMinutes, 0);

const sickEvent = {
  id: "attendance:employee-a:2026-06-01:sick",
  employeeId: "employee-a",
  date: "2026-06-01",
  kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.SICK,
  sourceRefs: ["qa:timesheet:sick"],
};
const overtimeEvent = {
  id: "attendance:employee-a:2026-06-01:overtime",
  employeeId: "employee-a",
  date: "2026-06-01",
  kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.OVERTIME,
  minutes: 120,
  sourceRefs: ["qa:timesheet:overtime"],
};
const sickOvertimeModel = {
  ...baseModel,
  attendanceEvents: [sickEvent, overtimeEvent],
};
const sickOvertimeValidation = validatePersonnelCalendarModel(sickOvertimeModel);
assert.equal(sickOvertimeValidation.valid, false);
assert(sickOvertimeValidation.issues.some((issue) => issue.code === "attendance_conflict_absence_work"));
const sickOvertimeProjection = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-01",
  ...sickOvertimeModel,
});
assert.equal(sickOvertimeProjection.status, "unknown", "Sick leave plus overtime must fail closed");
assert.equal(sickOvertimeProjection.plannedMinutes, 480);
assert.equal(sickOvertimeProjection.availableMinutes, 0);
assert(sickOvertimeProjection.sourceRefs.includes("qa:timesheet:sick"));
assert(sickOvertimeProjection.sourceRefs.includes("qa:timesheet:overtime"));

const sickProjection = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-01",
  ...baseModel,
  attendanceEvents: [sickEvent],
});
assert.equal(sickProjection.status, "absent");
assert.equal(sickProjection.reason, "attendance:sick");
assert.equal(sickProjection.plannedMinutes, 480);
assert.equal(sickProjection.availableMinutes, 0);

const workedOvertimeProjection = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-01",
  ...baseModel,
  attendanceEvents: [
    {
      id: "attendance:employee-a:2026-06-01:work",
      employeeId: "employee-a",
      date: "2026-06-01",
      kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK,
      startTime: "09:00",
      endTime: "18:00",
      sourceRefs: ["qa:timesheet:work"],
    },
    overtimeEvent,
  ],
});
assert.equal(workedOvertimeProjection.status, "available");
assert.equal(workedOvertimeProjection.plannedMinutes, 480);
assert.equal(workedOvertimeProjection.availableMinutes, 600);

const tooShortWorkProjection = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-01",
  ...baseModel,
  attendanceEvents: [{
    id: "attendance:employee-a:2026-06-01:short-work",
    employeeId: "employee-a",
    date: "2026-06-01",
    kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK,
    startTime: "09:00",
    endTime: "09:30",
  }],
});
assert.equal(tooShortWorkProjection.status, "unknown");
assert.equal(tooShortWorkProjection.availableMinutes, 0);
assert(tooShortWorkProjection.issues.some((issue) => issue.code === "attendance_window_shorter_than_break"));

const explicitWeekendWork = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-06",
  ...baseModel,
  attendanceEvents: [{
    id: "attendance:employee-a:2026-06-06:work",
    employeeId: "employee-a",
    date: "2026-06-06",
    kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK,
    sourceRefs: ["qa:timesheet:weekend-work"],
  }],
});
assert.equal(explicitWeekendWork.status, "available");
assert.equal(explicitWeekendWork.plannedMinutes, 0);
assert.equal(explicitWeekendWork.availableMinutes, 480);

const missingAssignment = projectEmployeeAvailability({
  employeeId: "employee-without-schedule",
  date: "2026-06-01",
  ...baseModel,
});
assert.equal(missingAssignment.status, "unknown");
assert.equal(missingAssignment.availableMinutes, 0);

const missingTemplate = projectEmployeeAvailability({
  employeeId: "employee-a",
  date: "2026-06-01",
  scheduleTemplates: [],
  scheduleAssignments: [fiveTwoAssignment],
  attendanceEvents: [],
});
assert.equal(missingTemplate.status, "unknown");
assert.equal(missingTemplate.availableMinutes, 0);

const range = projectEmployeeAvailabilityRange({
  employeeId: "employee-a",
  from: "2026-06-01",
  to: "2026-06-07",
  ...baseModel,
});
assert.equal(range.length, 7);
assert.deepEqual(range.map((day) => day.status), ["available", "available", "available", "available", "available", "absent", "absent"]);

const noCutoverMigration = migrateTimesheetScheduleOverrides({
  "employee-a": { code: "5/2", start: "08:00", end: "17:00", patternOffset: 0 },
});
assert.equal(noCutoverMigration.assignments.length, 0);
assert(noCutoverMigration.issues.some((issue) => issue.code === "missing_migration_effective_from"));

const scheduleMigration = migrateTimesheetScheduleOverrides({
  "employee-a": { code: "5/2", start: "08:00", end: "17:00", patternOffset: 0 },
  "employee-b": { code: "2/2", start: "07:00", end: "19:00", patternOffset: 2 },
}, { effectiveFrom: "2026-07-01" });
assert.equal(scheduleMigration.issues.length, 0, JSON.stringify(scheduleMigration.issues, null, 2));
assert.equal(scheduleMigration.assignments.length, 2);
assert.equal(scheduleMigration.assignments[1].scheduleTemplateId, "schedule-2-2");
assert.equal(scheduleMigration.assignments[1].patternOffset, 2);
assert(scheduleMigration.assignments[0].sourceRefs.includes("sharedUi.timesheetScheduleOverrides.employee-a"));

const cellMigration = migrateTimesheetCellOverrides({
  "employee-a::2026-07-01": {
    value: "overtime",
    start: "08:00",
    end: "17:00",
    comment: "legacy overtime default",
  },
  "employee-b::2026-07-02": {
    value: "sick",
    start: "09:00",
    end: "18:00",
    overtime: 1.5,
    comment: "legacy conflict",
  },
});
assert.equal(cellMigration.attendanceEvents.length, 4);
assert.equal(
  cellMigration.attendanceEvents.find((event) => event.employeeId === "employee-a" && event.kind === "overtime")?.minutes,
  120,
  "Legacy overtime without an explicit value must preserve the current two-hour default",
);
assert(cellMigration.issues.some((issue) => issue.code === "attendance_conflict_absence_work"));

const invalidOvertimeMigration = migrateTimesheetCellOverrides({
  "employee-a::2026-07-03": { value: "work", start: "08:00", end: "17:00", overtime: -1 },
});
assert(invalidOvertimeMigration.issues.some((issue) => issue.code === "invalid_legacy_overtime"));
assert(invalidOvertimeMigration.issues.some((issue) => issue.code === "invalid_overtime_minutes"));
assert.equal(invalidOvertimeMigration.attendanceEvents.length, 2, "Invalid legacy overtime must be preserved for quarantine, not silently dropped");

const combinedMigration = migrateLegacyTimesheetState({
  timesheetScheduleOverrides: {
    "employee-a": { code: "5/2", start: "08:00", end: "17:00", patternOffset: 0 },
  },
  timesheetCellOverrides: {
    "employee-a::2026-07-01": { value: "work", start: "08:00", end: "17:00", overtime: 0 },
  },
}, { effectiveFrom: "2026-07-01" });
assert.equal(combinedMigration.issues.length, 0, JSON.stringify(combinedMigration.issues, null, 2));
assert.equal(combinedMigration.scheduleAssignments.length, 1);
assert.equal(combinedMigration.attendanceEvents.length, 1);

const mutableAssignments = [{ ...fiveTwoAssignment }];
const calendarService = createPersonnelCalendarService({
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: mutableAssignments,
  attendanceEvents: [],
});
mutableAssignments[0].effectiveFrom = "2099-01-01";
assert.equal(calendarService.projectAvailability("employee-a", "2026-06-01").status, "available", "Service must snapshot caller-owned data");
const returnedModel = calendarService.getModel();
returnedModel.scheduleAssignments[0].effectiveFrom = "2099-01-01";
assert.equal(calendarService.projectAvailability("employee-a", "2026-06-01").status, "available", "getModel must not expose mutable service state");
assert.equal(calendarService.validate().valid, true);

const employeeBMirror = projectEmployeeAvailability({
  employeeId: "employee-b",
  date: "2026-06-01",
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: [{ ...fiveTwoAssignment, id: "assignment:employee-b:mirror", employeeId: "employee-b" }],
  attendanceEvents: [],
});
assert.deepEqual(
  [employeeBMirror.status, employeeBMirror.reason, employeeBMirror.plannedMinutes, employeeBMirror.availableMinutes],
  [monday.status, monday.reason, monday.plannedMinutes, monday.availableMinutes],
  "Availability must depend on domain facts, never employee index or display name",
);

console.log("Personnel Calendar Domain QA OK");
console.log(JSON.stringify({
  templates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES.length,
  baseModelIssues: baseValidation.issues.length,
  fiveTwoWeek: range.map(({ date, status, plannedMinutes, availableMinutes }) => ({ date, status, plannedMinutes, availableMinutes })),
  twoTwoStates: twoTwoDays.map(({ date, status, plannedMinutes }) => ({ date, status, plannedMinutes })),
  sickOvertimeStatus: sickOvertimeProjection.status,
  migratedAssignments: scheduleMigration.assignments.length,
  migratedAttendanceEvents: cellMigration.attendanceEvents.length,
  migrationConflicts: cellMigration.issues.length,
}, null, 2));
