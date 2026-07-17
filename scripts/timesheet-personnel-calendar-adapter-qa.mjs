import assert from "node:assert/strict";
import { createTimesheetModule } from "../src/modules/timesheet/render.js";
import {
  DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  migrateLegacyTimesheetState,
  projectEmployeeAvailability,
  resolveEffectiveScheduleAssignment,
} from "../src/modules/personnel_calendar/service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMESHEET_DAY_OPTIONS = [
  { value: "work", code: "work", label: "8:00-17:00", display: ["8:00", "17:00"], title: "Рабочая смена", hours: 8, overtime: 0 },
  { value: "overtime", code: "work-overtime", label: "8:00-17:00 +2", display: ["8:00", "17:00"], title: "Рабочая смена со сверхурочными", hours: 10, overtime: 2 },
  { value: "vacation", code: "vacation", label: "Отп.", display: ["Отп."], title: "Плановый отпуск", hours: 0, overtime: 0 },
  { value: "sick", code: "sick", label: "Б/л", display: ["Б/л"], title: "Больничный", hours: 0, overtime: 0 },
  { value: "leave", code: "leave", label: "Отг.", display: ["Отг."], title: "Отгул", hours: 0, overtime: 0 },
  { value: "off", code: "off", label: "Вых", display: ["Вых"], title: "Выходной", hours: 0, overtime: 0 },
];
const TIMESHEET_SCHEDULE_OPTIONS = [
  { code: "5/2", label: "5/2", caption: "пятидневка", start: "08:00", end: "17:00", patternOffset: 0 },
  { code: "2/2", label: "2/2", caption: "сменный график", start: "08:00", end: "20:00", patternOffset: 0 },
];
const TIMESHEET_VIEW_OPTIONS = [
  { id: "month", label: "Месяц" },
  { id: "week", label: "Неделя" },
];

function normalizeDateInput(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && !Number.isNaN(Date.parse(`${normalized}T00:00:00Z`)) ? normalized : "";
}

function toDateInput(value) {
  if (typeof value === "string") return normalizeDateInput(value);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function createFormData(values) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, String(value)));
  return form;
}

const ui = {
  timesheetView: "month",
  timesheetPeriodAnchor: "2026-06-01",
  timesheetCellOverrides: {},
  timesheetScheduleOverrides: {},
  timesheetEditor: { employeeId: "employee-a", dateKey: "2026-06-01" },
};
let calendarModel = {
  scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments: [{
    id: "assignment:employee-a:5-2",
    employeeId: "employee-a",
    scheduleTemplateId: "schedule-5-2",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    patternOffset: 0,
    sourceRefs: ["qa:canonical-assignment"],
  }],
  attendanceEvents: [],
};
const savedAttendanceBatches = [];
const savedScheduleAssignments = [];
const removedAttendanceDays = [];
const removedSchedules = [];
let persistCount = 0;
let renderCount = 0;

const commonDependencies = {
  DAY_MS,
  TIMESHEET_DAY_OPTIONS,
  TIMESHEET_SCHEDULE_OPTIONS,
  TIMESHEET_VIEW_OPTIONS,
  addMs: (date, milliseconds) => new Date(date.getTime() + milliseconds),
  dedupeEmployeeOrgRows: (rows) => rows,
  fromDateInput: (value) => new Date(`${value}T00:00:00`),
  getDefaultUiState: () => ({ timesheetPeriodAnchor: "2026-06-01", timesheetView: "month" }),
  getEmployeeDepartmentLabelForWorkCenters: () => "QA",
  getProductionStructureEmployees: () => [],
  getProductionStructureMatrixRuntimeOverrides: () => ({}),
  getUi: () => ui,
  mapLegacyWorkCenterId: (value) => value,
  migrateLegacyTimesheetState,
  normalizeDateInput,
  normalizeLookupText: (value) => String(value || "").trim().toLowerCase(),
  normalizePlainRecord: (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
  normalizeWorkMode: (value, fallback = "") => String(value || fallback).trim(),
  personnelScheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  persistUiState: () => { persistCount += 1; },
  projectEmployeeAvailability,
  render: () => { renderCount += 1; },
  resolveEffectiveScheduleAssignment,
  saveAttendanceEvent: (events, options) => {
    savedAttendanceBatches.push({ events, options });
    return { ok: true };
  },
  saveScheduleAssignment: (assignment, options) => {
    savedScheduleAssignments.push({ assignment, options });
    return { ok: true };
  },
  removeAttendanceEvents: (coordinates) => {
    removedAttendanceDays.push(coordinates);
    return { ok: true };
  },
  removeScheduleAssignment: (coordinates) => {
    removedSchedules.push(coordinates);
    return { ok: true };
  },
  startOfDay: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()),
  startOfWeek: (date) => date,
  toDateInput,
};

const timesheet = createTimesheetModule({
  canEditTimesheetEmployee: () => true,
  ...commonDependencies,
  getPersonnelCalendarModel: () => calendarModel,
});
const employee = {
  id: "employee-a",
  name: "Сотрудник А",
  workCenterIds: ["D1"],
  role: "Кладовщик",
  workSchedule: "2/2",
};
const mondayDate = new Date(2026, 5, 1);

const canonicalSchedule = timesheet.getTimesheetEmployeeSchedule(employee, 47, mondayDate);
assert.equal(canonicalSchedule.availabilityStatus, "known");
assert.equal(canonicalSchedule.code, "5/2", "Canonical assignment must win over legacy employee fields and index heuristics");
assert.equal(canonicalSchedule.hours, 8);
assert.equal(canonicalSchedule.hoursSource, "Календарь персонала");

const canonicalWorkCell = timesheet.getTimesheetCell(employee, mondayDate, 47, canonicalSchedule);
assert.equal(canonicalWorkCell.availabilityStatus, "available");
assert.equal(canonicalWorkCell.value, "work");
assert.equal(canonicalWorkCell.plannedHours, 8);
assert.equal(canonicalWorkCell.hours, 8);
assert.equal(canonicalWorkCell.overtime, 0, "No overtime may be synthesized from employee index or calendar day");

const sameEmployeeDifferentIndex = timesheet.getTimesheetCell(employee, mondayDate, 2, canonicalSchedule);
assert.deepEqual(
  [sameEmployeeDifferentIndex.value, sameEmployeeDifferentIndex.hours, sameEmployeeDifferentIndex.overtime],
  [canonicalWorkCell.value, canonicalWorkCell.hours, canonicalWorkCell.overtime],
  "Availability must not depend on employee display index",
);

calendarModel = {
  ...calendarModel,
  attendanceEvents: [{
    id: "attendance:employee-a:2026-06-01:sick",
    employeeId: "employee-a",
    date: "2026-06-01",
    kind: "sick",
    comment: "QA больничный",
    sourceRefs: ["qa:canonical-sick"],
  }],
};
const sickCell = timesheet.getTimesheetCell(employee, mondayDate, 47);
assert.equal(sickCell.availabilityStatus, "absent");
assert.equal(sickCell.value, "sick");
assert.equal(sickCell.plannedHours, 8);
assert.equal(sickCell.hours, 0);
assert.equal(sickCell.comment, "QA больничный");

calendarModel = {
  ...calendarModel,
  attendanceEvents: [
    ...calendarModel.attendanceEvents,
    {
      id: "attendance:employee-a:2026-06-01:overtime",
      employeeId: "employee-a",
      date: "2026-06-01",
      kind: "overtime",
      minutes: 90,
      sourceRefs: ["qa:invalid-overtime"],
    },
  ],
};
const conflictedCell = timesheet.getTimesheetCell(employee, mondayDate, 47);
assert.equal(conflictedCell.availabilityStatus, "unknown", "Invalid sick plus overtime data must fail closed");
assert.equal(conflictedCell.value, "unknown");
assert.equal(conflictedCell.hours, 0);

calendarModel = { ...calendarModel, attendanceEvents: [] };
const legacyUiBeforeSave = JSON.stringify({
  timesheetCellOverrides: ui.timesheetCellOverrides,
  timesheetScheduleOverrides: ui.timesheetScheduleOverrides,
});
const sickSave = await timesheet.saveTimesheetAttendance(createFormData({
  employeeId: "employee-a",
  dateKey: "2026-06-01",
  value: "sick",
  start: "09:00",
  end: "18:00",
  overtime: 0,
  comment: "Сохранённый больничный",
}));
assert.equal(sickSave.ok, true);
assert.equal(savedAttendanceBatches.length, 1);
assert.equal(savedAttendanceBatches[0].options.mode, "replace-day");
assert.equal(savedAttendanceBatches[0].events.length, 1);
assert.equal(savedAttendanceBatches[0].events[0].kind, "sick");

const invalidSickOvertimeSave = await timesheet.saveTimesheetAttendance(createFormData({
  employeeId: "employee-a",
  dateKey: "2026-06-02",
  value: "sick",
  start: "09:00",
  end: "18:00",
  overtime: 1.5,
  comment: "Недопустимый конфликт",
}));
assert.equal(invalidSickOvertimeSave.ok, false);
assert.equal(invalidSickOvertimeSave.reason, "absence_overtime_conflict");
assert.equal(savedAttendanceBatches.length, 1, "Invalid fact must never reach the persistence callback");

const overtimeSave = await timesheet.saveTimesheetAttendance(createFormData({
  employeeId: "employee-a",
  dateKey: "2026-06-03",
  value: "overtime",
  start: "08:00",
  end: "17:00",
  overtime: 1.5,
  comment: "Сверхурочная смена",
}));
assert.equal(overtimeSave.ok, true);
assert.equal(savedAttendanceBatches.length, 2);
assert.deepEqual(savedAttendanceBatches[1].events.map((event) => event.kind), ["work", "overtime"]);
assert.equal(savedAttendanceBatches[1].events[1].minutes, 90);

const scheduleSave = await timesheet.saveTimesheetSchedule(createFormData({
  employeeId: "employee-a",
  effectiveFrom: "2026-07-01",
  scheduleCode: "2/2",
  patternOffset: 2,
}));
assert.equal(scheduleSave.ok, true);
assert.equal(savedScheduleAssignments.length, 1);
assert.equal(savedScheduleAssignments[0].assignment.scheduleTemplateId, "schedule-2-2");
assert.equal(savedScheduleAssignments[0].assignment.effectiveFrom, "2026-07-01");
assert.equal(savedScheduleAssignments[0].assignment.patternOffset, 2);
assert.equal(savedScheduleAssignments[0].assignment.startTime, undefined, "Assignment must reference a schedule template instead of duplicating its time window");
assert.equal(savedScheduleAssignments[0].options.mode, "replace-effective");

assert.equal(JSON.stringify({
  timesheetCellOverrides: ui.timesheetCellOverrides,
  timesheetScheduleOverrides: ui.timesheetScheduleOverrides,
}), legacyUiBeforeSave, "Domain writes must not mutate legacy UI overrides");

ui.timesheetEditor = { employeeId: "employee-a", dateKey: "2026-06-01" };
assert.equal((await timesheet.resetTimesheetEditorCell()).ok, true);
assert.deepEqual(removedAttendanceDays[0], { employeeId: "employee-a", date: "2026-06-01" });
assert.equal((await timesheet.resetTimesheetEditorSchedule()).ok, true);
assert.deepEqual(removedSchedules[0], { employeeId: "employee-a", date: "2026-06-01" });

const legacyUi = {
  timesheetView: "month",
  timesheetPeriodAnchor: "2026-06-01",
  timesheetScheduleOverrides: {
    "employee-a": { code: "5/2", start: "08:00", end: "17:00", patternOffset: 0 },
  },
  timesheetCellOverrides: {
    "employee-a::2026-06-01": { value: "vacation", start: "08:00", end: "17:00", overtime: 0, comment: "Legacy read only" },
  },
};
const legacyTimesheet = createTimesheetModule({
  ...commonDependencies,
  getUi: () => legacyUi,
  getPersonnelCalendarModel: () => null,
});
const legacyCell = legacyTimesheet.getTimesheetCell(employee, mondayDate, 99);
assert.equal(legacyCell.availabilityStatus, "absent");
assert.equal(legacyCell.value, "vacation");
assert.equal(legacyCell.comment, "Legacy read only");
assert.equal(legacyTimesheet.getTimesheetEmployeeSchedule(employee, 99, mondayDate).calendarSource, "legacy-read-migration");

const disconnectedTimesheet = createTimesheetModule({
  ...commonDependencies,
  getPersonnelCalendarModel: () => calendarModel,
  projectEmployeeAvailability: null,
  resolveEffectiveScheduleAssignment: null,
});
const disconnectedCell = disconnectedTimesheet.getTimesheetCell(employee, mondayDate, 0);
assert.equal(disconnectedCell.availabilityStatus, "unknown");
assert.equal(disconnectedCell.hours, 0);
assert.equal(disconnectedTimesheet.getTimesheetEmployeeSchedule(employee, 0, mondayDate).availabilityStatus, "unknown");

console.log("Timesheet Personnel Calendar Adapter QA OK");
console.log(JSON.stringify({
  canonicalSchedule: canonicalSchedule.code,
  canonicalHours: canonicalWorkCell.hours,
  sickStatus: sickCell.availabilityStatus,
  conflictStatus: conflictedCell.availabilityStatus,
  attendanceSaveBatches: savedAttendanceBatches.length,
  scheduleAssignmentsSaved: savedScheduleAssignments.length,
  legacyFallbackValue: legacyCell.value,
  persistCount,
  renderCount,
}, null, 2));
