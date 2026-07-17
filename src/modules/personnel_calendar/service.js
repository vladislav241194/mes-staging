const DAY_MS = 24 * 60 * 60 * 1000;

export const PERSONNEL_AVAILABILITY_STATES = Object.freeze({
  AVAILABLE: "available",
  ABSENT: "absent",
  UNKNOWN: "unknown",
});

export const PERSONNEL_ATTENDANCE_EVENT_KINDS = Object.freeze({
  WORK: "work",
  OVERTIME: "overtime",
  VACATION: "vacation",
  SICK: "sick",
  LEAVE: "leave",
  DAY_OFF: "day_off",
});

const ATTENDANCE_EVENT_KINDS = new Set(Object.values(PERSONNEL_ATTENDANCE_EVENT_KINDS));
const ABSENCE_EVENT_KINDS = new Set([
  PERSONNEL_ATTENDANCE_EVENT_KINDS.VACATION,
  PERSONNEL_ATTENDANCE_EVENT_KINDS.SICK,
  PERSONNEL_ATTENDANCE_EVENT_KINDS.LEAVE,
  PERSONNEL_ATTENDANCE_EVENT_KINDS.DAY_OFF,
]);

function freezeTemplate(template) {
  return Object.freeze({
    ...template,
    workPattern: Object.freeze([...template.workPattern]),
    sourceRefs: Object.freeze([...(template.sourceRefs || [])]),
  });
}

/**
 * Built-in templates preserve the two schedules supported by the legacy
 * timesheet. Cycle calculation is based on UTC calendar days and is therefore
 * independent of browser/server timezone and daylight-saving changes.
 */
export const DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES = Object.freeze([
  freezeTemplate({
    id: "schedule-5-2",
    code: "5/2",
    name: "Пятидневная рабочая неделя",
    cycleAnchorDate: "1970-01-05",
    workPattern: [true, true, true, true, true, false, false],
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: 60,
    sourceRefs: ["personnel-calendar:built-in:5/2"],
  }),
  freezeTemplate({
    id: "schedule-2-2",
    code: "2/2",
    name: "Два рабочих дня через два выходных",
    cycleAnchorDate: "1970-01-01",
    workPattern: [true, true, false, false],
    startTime: "08:00",
    endTime: "20:00",
    breakMinutes: 0,
    sourceRefs: ["personnel-calendar:built-in:2/2"],
  }),
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueSortedStrings(values = []) {
  return [...new Set(asArray(values).flat(Infinity).map(asTrimmedString).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function dedupeIssues(issues = []) {
  const seen = new Set();
  return asArray(issues).filter((issue) => {
    const key = JSON.stringify([
      issue?.code,
      issue?.path,
      issue?.message,
      uniqueSortedStrings([issue?.sourceRefs]),
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createIssue(code, path, message, sourceRefs = []) {
  return {
    code,
    path,
    message,
    sourceRefs: uniqueSortedStrings([sourceRefs]),
  };
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseDateKey(value) {
  const dateKey = asTrimmedString(value);
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epochMs = Date.UTC(year, month - 1, day);
  const parsed = new Date(epochMs);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { dateKey, epochDay: Math.floor(epochMs / DAY_MS) };
}

function parseTime(value, { allow24 = false } = {}) {
  const time = asTrimmedString(value);
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 24) return null;
  if (hours === 24 && (!allow24 || minutes !== 0)) return null;
  return { time, minutes: hours * 60 + minutes };
}

function calculateWindowMinutes(startTime, endTime) {
  const start = parseTime(startTime);
  const end = parseTime(endTime, { allow24: true });
  if (!start || !end) return null;
  let duration = end.minutes - start.minutes;
  if (duration <= 0) duration += 24 * 60;
  return duration > 0 && duration <= 24 * 60 ? duration : null;
}

function entitySourceRefs(entity, prefix) {
  const id = asTrimmedString(entity?.id);
  return uniqueSortedStrings([
    asArray(entity?.sourceRefs),
    id ? [`${prefix}:${id}`] : [],
  ]);
}

function validateSourceRefs(value, path) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !asTrimmedString(item))) {
    return [createIssue("invalid_source_refs", path, "sourceRefs must be an array of non-empty strings")];
  }
  return [];
}

export function validatePersonnelScheduleTemplate(template, path = "scheduleTemplate") {
  const source = asRecord(template);
  const sourceRefs = entitySourceRefs(source, "schedule-template");
  const issues = [];
  if (!asTrimmedString(source.id)) {
    issues.push(createIssue("missing_template_id", `${path}.id`, "Schedule template id is required", sourceRefs));
  }
  if (!asTrimmedString(source.code)) {
    issues.push(createIssue("missing_template_code", `${path}.code`, "Schedule template code is required", sourceRefs));
  }
  if (!parseDateKey(source.cycleAnchorDate)) {
    issues.push(createIssue("invalid_cycle_anchor_date", `${path}.cycleAnchorDate`, "cycleAnchorDate must be a real YYYY-MM-DD date", sourceRefs));
  }
  if (
    !Array.isArray(source.workPattern)
    || source.workPattern.length === 0
    || source.workPattern.some((value) => typeof value !== "boolean")
  ) {
    issues.push(createIssue("invalid_work_pattern", `${path}.workPattern`, "workPattern must be a non-empty boolean array", sourceRefs));
  }
  const windowMinutes = calculateWindowMinutes(source.startTime, source.endTime);
  if (windowMinutes === null) {
    issues.push(createIssue("invalid_schedule_window", path, "Schedule startTime/endTime must define a valid window", sourceRefs));
  }
  const breakMinutes = Number(source.breakMinutes);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || (windowMinutes !== null && breakMinutes >= windowMinutes)) {
    issues.push(createIssue("invalid_schedule_break", `${path}.breakMinutes`, "breakMinutes must be a non-negative integer shorter than the work window", sourceRefs));
  }
  issues.push(...validateSourceRefs(source.sourceRefs, `${path}.sourceRefs`));
  return issues;
}

export function validateEmployeeScheduleAssignment(assignment, path = "scheduleAssignment") {
  const source = asRecord(assignment);
  const sourceRefs = entitySourceRefs(source, "schedule-assignment");
  const issues = [];
  if (!asTrimmedString(source.id)) {
    issues.push(createIssue("missing_assignment_id", `${path}.id`, "Schedule assignment id is required", sourceRefs));
  }
  if (!asTrimmedString(source.employeeId)) {
    issues.push(createIssue("missing_assignment_employee", `${path}.employeeId`, "employeeId is required", sourceRefs));
  }
  if (!asTrimmedString(source.scheduleTemplateId)) {
    issues.push(createIssue("missing_assignment_template", `${path}.scheduleTemplateId`, "scheduleTemplateId is required", sourceRefs));
  }
  const effectiveFrom = parseDateKey(source.effectiveFrom);
  const effectiveTo = source.effectiveTo === null || source.effectiveTo === undefined || source.effectiveTo === ""
    ? null
    : parseDateKey(source.effectiveTo);
  if (!effectiveFrom) {
    issues.push(createIssue("invalid_effective_from", `${path}.effectiveFrom`, "effectiveFrom must be a real YYYY-MM-DD date", sourceRefs));
  }
  if (source.effectiveTo !== null && source.effectiveTo !== undefined && source.effectiveTo !== "" && !effectiveTo) {
    issues.push(createIssue("invalid_effective_to", `${path}.effectiveTo`, "effectiveTo must be null or a real YYYY-MM-DD date", sourceRefs));
  }
  if (effectiveFrom && effectiveTo && effectiveTo.epochDay < effectiveFrom.epochDay) {
    issues.push(createIssue("reversed_effective_range", path, "effectiveTo cannot precede effectiveFrom", sourceRefs));
  }
  const patternOffset = Number(source.patternOffset ?? 0);
  if (!Number.isInteger(patternOffset)) {
    issues.push(createIssue("invalid_pattern_offset", `${path}.patternOffset`, "patternOffset must be an integer", sourceRefs));
  }
  const hasStart = source.startTime !== undefined && source.startTime !== null && source.startTime !== "";
  const hasEnd = source.endTime !== undefined && source.endTime !== null && source.endTime !== "";
  if (hasStart !== hasEnd || (hasStart && calculateWindowMinutes(source.startTime, source.endTime) === null)) {
    issues.push(createIssue("invalid_assignment_window", path, "startTime and endTime overrides must be provided together and form a valid window", sourceRefs));
  }
  if (source.breakMinutes !== undefined && source.breakMinutes !== null && source.breakMinutes !== "") {
    const breakMinutes = Number(source.breakMinutes);
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
      issues.push(createIssue("invalid_assignment_break", `${path}.breakMinutes`, "breakMinutes override must be a non-negative integer", sourceRefs));
    } else if (hasStart && calculateWindowMinutes(source.startTime, source.endTime) !== null && breakMinutes >= calculateWindowMinutes(source.startTime, source.endTime)) {
      issues.push(createIssue("invalid_assignment_break", `${path}.breakMinutes`, "breakMinutes override must be shorter than the assignment work window", sourceRefs));
    }
  }
  issues.push(...validateSourceRefs(source.sourceRefs, `${path}.sourceRefs`));
  return issues;
}

export function validatePersonnelAttendanceEvent(event, path = "attendanceEvent") {
  const source = asRecord(event);
  const sourceRefs = entitySourceRefs(source, "attendance-event");
  const issues = [];
  if (!asTrimmedString(source.id)) {
    issues.push(createIssue("missing_attendance_event_id", `${path}.id`, "Attendance event id is required", sourceRefs));
  }
  if (!asTrimmedString(source.employeeId)) {
    issues.push(createIssue("missing_attendance_employee", `${path}.employeeId`, "employeeId is required", sourceRefs));
  }
  if (!parseDateKey(source.date)) {
    issues.push(createIssue("invalid_attendance_date", `${path}.date`, "Attendance event date must be a real YYYY-MM-DD date", sourceRefs));
  }
  const kind = asTrimmedString(source.kind);
  if (!ATTENDANCE_EVENT_KINDS.has(kind)) {
    issues.push(createIssue("invalid_attendance_kind", `${path}.kind`, "Attendance event kind is not supported", sourceRefs));
  }
  const hasStart = source.startTime !== undefined && source.startTime !== null && source.startTime !== "";
  const hasEnd = source.endTime !== undefined && source.endTime !== null && source.endTime !== "";
  if (kind === PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK) {
    if (hasStart !== hasEnd || (hasStart && calculateWindowMinutes(source.startTime, source.endTime) === null)) {
      issues.push(createIssue("invalid_work_event_window", path, "Work event startTime/endTime must be omitted together or define a valid window", sourceRefs));
    }
  } else if (hasStart || hasEnd) {
    issues.push(createIssue("unexpected_attendance_window", path, "Only work events may define startTime/endTime", sourceRefs));
  }
  if (kind === PERSONNEL_ATTENDANCE_EVENT_KINDS.OVERTIME) {
    const minutes = Number(source.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      issues.push(createIssue("invalid_overtime_minutes", `${path}.minutes`, "Overtime minutes must be a positive integer", sourceRefs));
    }
  } else if (source.minutes !== undefined && Number(source.minutes) !== 0) {
    issues.push(createIssue("unexpected_attendance_minutes", `${path}.minutes`, "Only overtime events may define minutes", sourceRefs));
  }
  issues.push(...validateSourceRefs(source.sourceRefs, `${path}.sourceRefs`));
  return issues;
}

function assignmentRangesOverlap(left, right) {
  const leftFrom = parseDateKey(left.effectiveFrom)?.epochDay;
  const rightFrom = parseDateKey(right.effectiveFrom)?.epochDay;
  const leftTo = parseDateKey(left.effectiveTo)?.epochDay ?? Number.POSITIVE_INFINITY;
  const rightTo = parseDateKey(right.effectiveTo)?.epochDay ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(leftFrom) || !Number.isFinite(rightFrom)) return false;
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

function validateAssignmentOverlaps(assignments) {
  const issues = [];
  const byEmployee = new Map();
  assignments.forEach((assignment, index) => {
    const employeeId = asTrimmedString(assignment?.employeeId);
    if (!employeeId) return;
    const list = byEmployee.get(employeeId) || [];
    list.push({ assignment, index });
    byEmployee.set(employeeId, list);
  });
  byEmployee.forEach((list, employeeId) => {
    for (let leftIndex = 0; leftIndex < list.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < list.length; rightIndex += 1) {
        const left = list[leftIndex];
        const right = list[rightIndex];
        if (!assignmentRangesOverlap(left.assignment, right.assignment)) continue;
        issues.push(createIssue(
          "overlapping_schedule_assignments",
          `scheduleAssignments[${left.index}]`,
          `Employee ${employeeId} has overlapping effective schedule assignments`,
          [
            entitySourceRefs(left.assignment, "schedule-assignment"),
            entitySourceRefs(right.assignment, "schedule-assignment"),
          ],
        ));
      }
    }
  });
  return issues;
}

function validateAttendanceDayConflicts(events) {
  const issues = [];
  const byEmployeeDay = new Map();
  events.forEach((event, index) => {
    const employeeId = asTrimmedString(event?.employeeId);
    const date = asTrimmedString(event?.date);
    if (!employeeId || !date) return;
    const key = `${employeeId}::${date}`;
    const list = byEmployeeDay.get(key) || [];
    list.push({ event, index });
    byEmployeeDay.set(key, list);
  });
  byEmployeeDay.forEach((list, key) => {
    const absenceEvents = list.filter(({ event }) => ABSENCE_EVENT_KINDS.has(event.kind));
    const workEvents = list.filter(({ event }) => event.kind === PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK);
    const overtimeEvents = list.filter(({ event }) => event.kind === PERSONNEL_ATTENDANCE_EVENT_KINDS.OVERTIME);
    const refs = list.map(({ event }) => entitySourceRefs(event, "attendance-event"));
    if (absenceEvents.length > 1) {
      issues.push(createIssue("multiple_absence_events", `attendanceEvents[${absenceEvents[0].index}]`, `${key} has more than one absence event`, refs));
    }
    if (workEvents.length > 1) {
      issues.push(createIssue("multiple_work_events", `attendanceEvents[${workEvents[0].index}]`, `${key} has more than one work event`, refs));
    }
    if (absenceEvents.length && (workEvents.length || overtimeEvents.length)) {
      issues.push(createIssue(
        "attendance_conflict_absence_work",
        `attendanceEvents[${absenceEvents[0].index}]`,
        `${key} cannot combine absence (including sick leave) with work or overtime`,
        refs,
      ));
    }
  });
  return issues;
}

function validateUniqueIds(items, entityName, path) {
  const issues = [];
  const seen = new Map();
  items.forEach((item, index) => {
    const id = asTrimmedString(item?.id);
    if (!id) return;
    if (seen.has(id)) {
      issues.push(createIssue(
        "duplicate_entity_id",
        `${path}[${index}].id`,
        `${entityName} id ${id} is duplicated`,
        [entitySourceRefs(item, entityName), entitySourceRefs(items[seen.get(id)], entityName)],
      ));
    } else {
      seen.set(id, index);
    }
  });
  return issues;
}

export function validatePersonnelCalendarModel(model = {}) {
  const source = asRecord(model);
  const scheduleTemplates = asArray(source.scheduleTemplates);
  const scheduleAssignments = asArray(source.scheduleAssignments);
  const attendanceEvents = asArray(source.attendanceEvents);
  const issues = [];
  scheduleTemplates.forEach((template, index) => {
    issues.push(...validatePersonnelScheduleTemplate(template, `scheduleTemplates[${index}]`));
  });
  scheduleAssignments.forEach((assignment, index) => {
    issues.push(...validateEmployeeScheduleAssignment(assignment, `scheduleAssignments[${index}]`));
  });
  attendanceEvents.forEach((event, index) => {
    issues.push(...validatePersonnelAttendanceEvent(event, `attendanceEvents[${index}]`));
  });
  issues.push(...validateUniqueIds(scheduleTemplates, "schedule-template", "scheduleTemplates"));
  issues.push(...validateUniqueIds(scheduleAssignments, "schedule-assignment", "scheduleAssignments"));
  issues.push(...validateUniqueIds(attendanceEvents, "attendance-event", "attendanceEvents"));
  issues.push(...validateAssignmentOverlaps(scheduleAssignments));
  issues.push(...validateAttendanceDayConflicts(attendanceEvents));
  const templateIds = new Set(scheduleTemplates.map((template) => asTrimmedString(template?.id)).filter(Boolean));
  scheduleAssignments.forEach((assignment, index) => {
    const templateId = asTrimmedString(assignment?.scheduleTemplateId);
    if (templateId && !templateIds.has(templateId)) {
      issues.push(createIssue(
        "unknown_schedule_template",
        `scheduleAssignments[${index}].scheduleTemplateId`,
        `Schedule template ${templateId} does not exist`,
        entitySourceRefs(assignment, "schedule-assignment"),
      ));
    }
  });
  return { valid: issues.length === 0, issues };
}

export function resolveEffectiveScheduleAssignment({
  employeeId,
  date,
  scheduleAssignments = [],
} = {}) {
  const normalizedEmployeeId = asTrimmedString(employeeId);
  const parsedDate = parseDateKey(date);
  if (!normalizedEmployeeId || !parsedDate) {
    return {
      status: "invalid",
      assignment: null,
      issues: [createIssue("invalid_assignment_query", "assignmentQuery", "employeeId and a real YYYY-MM-DD date are required")],
    };
  }
  const employeeAssignments = asArray(scheduleAssignments)
    .map((assignment, index) => ({ assignment, index }))
    .filter(({ assignment }) => asTrimmedString(assignment?.employeeId) === normalizedEmployeeId);
  const assignmentIssues = employeeAssignments.flatMap(({ assignment, index }) => (
    validateEmployeeScheduleAssignment(assignment, `scheduleAssignments[${index}]`)
  ));
  if (assignmentIssues.length) {
    return { status: "invalid", assignment: null, issues: assignmentIssues };
  }
  const effective = employeeAssignments.filter(({ assignment }) => {
    const from = parseDateKey(assignment.effectiveFrom).epochDay;
    const to = parseDateKey(assignment.effectiveTo)?.epochDay ?? Number.POSITIVE_INFINITY;
    return parsedDate.epochDay >= from && parsedDate.epochDay <= to;
  });
  if (effective.length === 0) {
    return {
      status: "missing",
      assignment: null,
      issues: [createIssue("missing_effective_schedule", "scheduleAssignments", `No effective schedule assignment for ${normalizedEmployeeId} on ${parsedDate.dateKey}`)],
    };
  }
  if (effective.length > 1) {
    return {
      status: "ambiguous",
      assignment: null,
      issues: [createIssue(
        "ambiguous_effective_schedule",
        "scheduleAssignments",
        `More than one schedule assignment is effective for ${normalizedEmployeeId} on ${parsedDate.dateKey}`,
        effective.map(({ assignment }) => entitySourceRefs(assignment, "schedule-assignment")),
      )],
    };
  }
  return { status: "resolved", assignment: effective[0].assignment, issues: [] };
}

function buildUnknownProjection({
  employeeId,
  date,
  reason,
  issues = [],
  plannedMinutes = 0,
  scheduleAssignmentId = null,
  scheduleTemplateId = null,
  attendanceEventIds = [],
  sourceRefs = [],
}) {
  return {
    employeeId: asTrimmedString(employeeId),
    date: asTrimmedString(date),
    status: PERSONNEL_AVAILABILITY_STATES.UNKNOWN,
    reason,
    scheduledWorkday: null,
    plannedMinutes: Number.isInteger(plannedMinutes) && plannedMinutes >= 0 ? plannedMinutes : 0,
    availableMinutes: 0,
    scheduleAssignmentId,
    scheduleTemplateId,
    attendanceEventIds: uniqueSortedStrings([attendanceEventIds]),
    sourceRefs: uniqueSortedStrings([sourceRefs]),
    issues,
  };
}

function resolveScheduleDay({ employeeId, date, scheduleTemplates, scheduleAssignments }) {
  const assignmentResult = resolveEffectiveScheduleAssignment({ employeeId, date, scheduleAssignments });
  if (assignmentResult.status !== "resolved") {
    return { ok: false, reason: assignmentResult.status, issues: assignmentResult.issues };
  }
  const assignment = assignmentResult.assignment;
  const templateMatches = asArray(scheduleTemplates).filter((template) => (
    asTrimmedString(template?.id) === asTrimmedString(assignment.scheduleTemplateId)
  ));
  if (templateMatches.length !== 1) {
    return {
      ok: false,
      reason: templateMatches.length ? "ambiguous_template" : "missing_template",
      assignment,
      issues: [createIssue(
        templateMatches.length ? "ambiguous_schedule_template" : "unknown_schedule_template",
        "scheduleTemplates",
        `Expected exactly one schedule template ${assignment.scheduleTemplateId}`,
        entitySourceRefs(assignment, "schedule-assignment"),
      )],
    };
  }
  const template = templateMatches[0];
  const templateIssues = validatePersonnelScheduleTemplate(template);
  if (templateIssues.length) {
    return { ok: false, reason: "invalid_template", assignment, template, issues: templateIssues };
  }
  const assignmentIssues = validateEmployeeScheduleAssignment(assignment);
  if (assignmentIssues.length) {
    return { ok: false, reason: "invalid_assignment", assignment, template, issues: assignmentIssues };
  }
  const targetDate = parseDateKey(date);
  const anchorDate = parseDateKey(template.cycleAnchorDate);
  const offset = Number(assignment.patternOffset ?? 0);
  const cycleLength = template.workPattern.length;
  const patternIndex = ((targetDate.epochDay - anchorDate.epochDay + offset) % cycleLength + cycleLength) % cycleLength;
  const scheduledWorkday = template.workPattern[patternIndex];
  const startTime = asTrimmedString(assignment.startTime) || template.startTime;
  const endTime = asTrimmedString(assignment.endTime) || template.endTime;
  const breakMinutes = assignment.breakMinutes === undefined || assignment.breakMinutes === null || assignment.breakMinutes === ""
    ? Number(template.breakMinutes)
    : Number(assignment.breakMinutes);
  const windowMinutes = calculateWindowMinutes(startTime, endTime);
  if (windowMinutes === null || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes >= windowMinutes) {
    return {
      ok: false,
      reason: "invalid_effective_window",
      assignment,
      template,
      issues: [createIssue(
        "invalid_effective_schedule_window",
        "scheduleAssignment",
        "Effective schedule window and break do not produce valid planned minutes",
        [entitySourceRefs(assignment, "schedule-assignment"), entitySourceRefs(template, "schedule-template")],
      )],
    };
  }
  return {
    ok: true,
    assignment,
    template,
    scheduledWorkday,
    plannedMinutes: scheduledWorkday ? windowMinutes - breakMinutes : 0,
    standardWorkMinutes: windowMinutes - breakMinutes,
    breakMinutes,
    sourceRefs: uniqueSortedStrings([
      entitySourceRefs(assignment, "schedule-assignment"),
      entitySourceRefs(template, "schedule-template"),
    ]),
  };
}

export function projectEmployeeAvailability({
  employeeId,
  date,
  scheduleTemplates = DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments = [],
  attendanceEvents = [],
} = {}) {
  const normalizedEmployeeId = asTrimmedString(employeeId);
  const parsedDate = parseDateKey(date);
  if (!normalizedEmployeeId || !parsedDate) {
    return buildUnknownProjection({
      employeeId,
      date,
      reason: "invalid_query",
      issues: [createIssue("invalid_availability_query", "availabilityQuery", "employeeId and a real YYYY-MM-DD date are required")],
    });
  }
  const scheduleDay = resolveScheduleDay({
    employeeId: normalizedEmployeeId,
    date: parsedDate.dateKey,
    scheduleTemplates,
    scheduleAssignments,
  });
  if (!scheduleDay.ok) {
    return buildUnknownProjection({
      employeeId: normalizedEmployeeId,
      date: parsedDate.dateKey,
      reason: scheduleDay.reason,
      issues: scheduleDay.issues,
      scheduleAssignmentId: asTrimmedString(scheduleDay.assignment?.id) || null,
      scheduleTemplateId: asTrimmedString(scheduleDay.template?.id) || null,
      sourceRefs: [
        entitySourceRefs(scheduleDay.assignment, "schedule-assignment"),
        entitySourceRefs(scheduleDay.template, "schedule-template"),
      ],
    });
  }
  const dayEvents = asArray(attendanceEvents).filter((event) => (
    asTrimmedString(event?.employeeId) === normalizedEmployeeId
    && asTrimmedString(event?.date) === parsedDate.dateKey
  ));
  const eventIssues = dayEvents.flatMap((event, index) => validatePersonnelAttendanceEvent(event, `attendanceEvents[${index}]`));
  eventIssues.push(...validateUniqueIds(dayEvents, "attendance-event", "attendanceEvents"));
  eventIssues.push(...validateAttendanceDayConflicts(dayEvents));
  const attendanceEventIds = dayEvents.map((event) => asTrimmedString(event?.id)).filter(Boolean);
  const sourceRefs = uniqueSortedStrings([
    scheduleDay.sourceRefs,
    dayEvents.map((event) => entitySourceRefs(event, "attendance-event")),
  ]);
  if (eventIssues.length) {
    return buildUnknownProjection({
      employeeId: normalizedEmployeeId,
      date: parsedDate.dateKey,
      reason: "invalid_attendance_events",
      issues: eventIssues,
      plannedMinutes: scheduleDay.plannedMinutes,
      scheduleAssignmentId: scheduleDay.assignment.id,
      scheduleTemplateId: scheduleDay.template.id,
      attendanceEventIds,
      sourceRefs,
    });
  }
  const absenceEvent = dayEvents.find((event) => ABSENCE_EVENT_KINDS.has(event.kind));
  if (absenceEvent) {
    return {
      employeeId: normalizedEmployeeId,
      date: parsedDate.dateKey,
      status: PERSONNEL_AVAILABILITY_STATES.ABSENT,
      reason: `attendance:${absenceEvent.kind}`,
      scheduledWorkday: scheduleDay.scheduledWorkday,
      plannedMinutes: scheduleDay.plannedMinutes,
      availableMinutes: 0,
      scheduleAssignmentId: scheduleDay.assignment.id,
      scheduleTemplateId: scheduleDay.template.id,
      attendanceEventIds: uniqueSortedStrings([attendanceEventIds]),
      sourceRefs,
      issues: [],
    };
  }
  const workEvent = dayEvents.find((event) => event.kind === PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK);
  const overtimeMinutes = dayEvents
    .filter((event) => event.kind === PERSONNEL_ATTENDANCE_EVENT_KINDS.OVERTIME)
    .reduce((sum, event) => sum + Number(event.minutes), 0);
  let baseAvailableMinutes = scheduleDay.plannedMinutes;
  if (workEvent?.startTime && workEvent?.endTime) {
    const workWindowMinutes = calculateWindowMinutes(workEvent.startTime, workEvent.endTime);
    if (workWindowMinutes <= scheduleDay.breakMinutes) {
      return buildUnknownProjection({
        employeeId: normalizedEmployeeId,
        date: parsedDate.dateKey,
        reason: "invalid_attendance_work_window",
        issues: [createIssue(
          "attendance_window_shorter_than_break",
          "attendanceEvents",
          "Work attendance window must be longer than the effective schedule break",
          entitySourceRefs(workEvent, "attendance-event"),
        )],
        plannedMinutes: scheduleDay.plannedMinutes,
        scheduleAssignmentId: scheduleDay.assignment.id,
        scheduleTemplateId: scheduleDay.template.id,
        attendanceEventIds,
        sourceRefs,
      });
    }
    baseAvailableMinutes = workWindowMinutes - scheduleDay.breakMinutes;
  } else if (workEvent) {
    baseAvailableMinutes = scheduleDay.standardWorkMinutes;
  }
  const availableMinutes = baseAvailableMinutes + overtimeMinutes;
  if (!scheduleDay.scheduledWorkday && !workEvent && overtimeMinutes === 0) {
    return {
      employeeId: normalizedEmployeeId,
      date: parsedDate.dateKey,
      status: PERSONNEL_AVAILABILITY_STATES.ABSENT,
      reason: "scheduled_off",
      scheduledWorkday: false,
      plannedMinutes: 0,
      availableMinutes: 0,
      scheduleAssignmentId: scheduleDay.assignment.id,
      scheduleTemplateId: scheduleDay.template.id,
      attendanceEventIds: uniqueSortedStrings([attendanceEventIds]),
      sourceRefs,
      issues: [],
    };
  }
  return {
    employeeId: normalizedEmployeeId,
    date: parsedDate.dateKey,
    status: PERSONNEL_AVAILABILITY_STATES.AVAILABLE,
    reason: workEvent || overtimeMinutes > 0 ? "attendance:work" : "scheduled_work",
    scheduledWorkday: scheduleDay.scheduledWorkday,
    plannedMinutes: scheduleDay.plannedMinutes,
    availableMinutes,
    scheduleAssignmentId: scheduleDay.assignment.id,
    scheduleTemplateId: scheduleDay.template.id,
    attendanceEventIds: uniqueSortedStrings([attendanceEventIds]),
    sourceRefs,
    issues: [],
  };
}

function formatDateKey(epochDay) {
  return new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
}

export function projectEmployeeAvailabilityRange({ from, to, ...input } = {}) {
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);
  if (!fromDate || !toDate || toDate.epochDay < fromDate.epochDay || toDate.epochDay - fromDate.epochDay > 3660) {
    return [buildUnknownProjection({
      employeeId: input.employeeId,
      date: asTrimmedString(from),
      reason: "invalid_range",
      issues: [createIssue("invalid_availability_range", "availabilityRange", "Range must be ordered, valid, and no longer than 3661 days")],
    })];
  }
  const projections = [];
  for (let epochDay = fromDate.epochDay; epochDay <= toDate.epochDay; epochDay += 1) {
    projections.push(projectEmployeeAvailability({ ...input, date: formatDateKey(epochDay) }));
  }
  return projections;
}

function stableLegacyIdPart(value) {
  return encodeURIComponent(asTrimmedString(value)).replace(/%/g, "_");
}

export function migrateTimesheetScheduleOverrides(overrides, {
  effectiveFrom,
  effectiveTo = null,
  sourceRefPrefix = "sharedUi.timesheetScheduleOverrides",
  templateIdByCode = { "5/2": "schedule-5-2", "2/2": "schedule-2-2" },
} = {}) {
  const source = asRecord(overrides);
  const assignments = [];
  const issues = [];
  const parsedEffectiveFrom = parseDateKey(effectiveFrom);
  const parsedEffectiveTo = effectiveTo === null || effectiveTo === undefined || effectiveTo === "" ? null : parseDateKey(effectiveTo);
  if (Object.keys(source).length && !parsedEffectiveFrom) {
    return {
      assignments,
      issues: [createIssue(
        "missing_migration_effective_from",
        "migration.effectiveFrom",
        "A real effectiveFrom date is required; legacy schedule overrides have no validity period",
      )],
    };
  }
  if (effectiveTo !== null && effectiveTo !== undefined && effectiveTo !== "" && !parsedEffectiveTo) {
    return {
      assignments,
      issues: [createIssue("invalid_migration_effective_to", "migration.effectiveTo", "effectiveTo must be null or a real YYYY-MM-DD date")],
    };
  }
  Object.entries(source).forEach(([rawEmployeeId, rawOverride]) => {
    const employeeId = asTrimmedString(rawEmployeeId);
    const override = asRecord(rawOverride);
    const sourceRef = `${sourceRefPrefix}.${rawEmployeeId}`;
    const code = asTrimmedString(override.code);
    const scheduleTemplateId = asTrimmedString(asRecord(templateIdByCode)[code]);
    if (!employeeId || !isPlainRecord(rawOverride) || !scheduleTemplateId) {
      issues.push(createIssue(
        "unmappable_schedule_override",
        sourceRef,
        "Schedule override requires an employee id, object value, and a known schedule code",
        [sourceRef],
      ));
      return;
    }
    const assignment = {
      id: `legacy-schedule:${stableLegacyIdPart(employeeId)}:${parsedEffectiveFrom.dateKey}`,
      employeeId,
      scheduleTemplateId,
      effectiveFrom: parsedEffectiveFrom.dateKey,
      effectiveTo: parsedEffectiveTo?.dateKey || null,
      patternOffset: Number(override.patternOffset ?? 0),
      startTime: asTrimmedString(override.start) || undefined,
      endTime: asTrimmedString(override.end) || undefined,
      sourceRefs: [sourceRef],
    };
    const assignmentIssues = validateEmployeeScheduleAssignment(assignment, sourceRef);
    if (assignmentIssues.length) {
      issues.push(...assignmentIssues);
      return;
    }
    assignments.push(assignment);
  });
  return { assignments, issues };
}

function splitLegacyCellKey(key) {
  const normalized = asTrimmedString(key);
  const delimiterIndex = normalized.lastIndexOf("::");
  if (delimiterIndex <= 0) return null;
  const employeeId = normalized.slice(0, delimiterIndex).trim();
  const date = normalized.slice(delimiterIndex + 2).trim();
  return employeeId && parseDateKey(date) ? { employeeId, date } : null;
}

export function migrateTimesheetCellOverrides(overrides, {
  sourceRefPrefix = "sharedUi.timesheetCellOverrides",
} = {}) {
  const source = asRecord(overrides);
  const attendanceEvents = [];
  const issues = [];
  const legacyKindMap = {
    vacation: PERSONNEL_ATTENDANCE_EVENT_KINDS.VACATION,
    sick: PERSONNEL_ATTENDANCE_EVENT_KINDS.SICK,
    leave: PERSONNEL_ATTENDANCE_EVENT_KINDS.LEAVE,
    off: PERSONNEL_ATTENDANCE_EVENT_KINDS.DAY_OFF,
  };
  Object.entries(source).forEach(([key, rawOverride]) => {
    const coordinates = splitLegacyCellKey(key);
    const override = asRecord(rawOverride);
    const sourceRef = `${sourceRefPrefix}.${key}`;
    if (!coordinates || !isPlainRecord(rawOverride)) {
      issues.push(createIssue("unmappable_cell_override", sourceRef, "Cell override key must be employeeId::YYYY-MM-DD and value must be an object", [sourceRef]));
      return;
    }
    const value = asTrimmedString(override.value);
    const idBase = `legacy-attendance:${stableLegacyIdPart(coordinates.employeeId)}:${coordinates.date}`;
    const common = {
      employeeId: coordinates.employeeId,
      date: coordinates.date,
      comment: asTrimmedString(override.comment),
      sourceRefs: [sourceRef],
    };
    if (value === "work" || value === "overtime") {
      attendanceEvents.push({
        ...common,
        id: `${idBase}:work`,
        kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.WORK,
        startTime: asTrimmedString(override.start) || undefined,
        endTime: asTrimmedString(override.end) || undefined,
      });
    } else if (legacyKindMap[value]) {
      attendanceEvents.push({
        ...common,
        id: `${idBase}:${legacyKindMap[value]}`,
        kind: legacyKindMap[value],
      });
    } else {
      issues.push(createIssue("unknown_cell_override_value", `${sourceRef}.value`, `Unsupported legacy timesheet value ${value || "<empty>"}`, [sourceRef]));
      return;
    }
    const rawOvertime = Number(override.overtime ?? (value === "overtime" ? 2 : 0));
    if (!Number.isFinite(rawOvertime) || rawOvertime < 0) {
      issues.push(createIssue("invalid_legacy_overtime", `${sourceRef}.overtime`, "Legacy overtime must be a non-negative number of hours", [sourceRef]));
      attendanceEvents.push({
        ...common,
        id: `${idBase}:overtime`,
        kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.OVERTIME,
        minutes: Number.isFinite(rawOvertime) ? Math.round(rawOvertime * 60) : null,
      });
    } else if (value === "overtime" || rawOvertime > 0) {
      attendanceEvents.push({
        ...common,
        id: `${idBase}:overtime`,
        kind: PERSONNEL_ATTENDANCE_EVENT_KINDS.OVERTIME,
        minutes: Math.round(rawOvertime * 60),
      });
    }
  });
  const validation = validatePersonnelCalendarModel({
    scheduleTemplates: [],
    scheduleAssignments: [],
    attendanceEvents,
  });
  issues.push(...validation.issues.filter((issue) => (
    issue.code !== "unknown_schedule_template"
    && !issue.code.startsWith("missing_")
  )));
  return { attendanceEvents, issues };
}

export function migrateLegacyTimesheetState({
  timesheetScheduleOverrides = {},
  timesheetCellOverrides = {},
} = {}, options = {}) {
  const scheduleMigration = migrateTimesheetScheduleOverrides(timesheetScheduleOverrides, options);
  const attendanceMigration = migrateTimesheetCellOverrides(timesheetCellOverrides, options);
  const model = {
    scheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
    scheduleAssignments: scheduleMigration.assignments,
    attendanceEvents: attendanceMigration.attendanceEvents,
  };
  const validation = validatePersonnelCalendarModel(model);
  return {
    ...model,
    issues: dedupeIssues([
      ...scheduleMigration.issues,
      ...attendanceMigration.issues,
      ...validation.issues,
    ]),
  };
}

function cloneDomainEntity(entity = {}) {
  return {
    ...entity,
    ...(Array.isArray(entity.workPattern) ? { workPattern: [...entity.workPattern] } : {}),
    ...(Array.isArray(entity.sourceRefs) ? { sourceRefs: [...entity.sourceRefs] } : {}),
  };
}

export function createPersonnelCalendarService({
  scheduleTemplates = DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  scheduleAssignments = [],
  attendanceEvents = [],
} = {}) {
  const model = {
    scheduleTemplates: asArray(scheduleTemplates).map(cloneDomainEntity),
    scheduleAssignments: asArray(scheduleAssignments).map(cloneDomainEntity),
    attendanceEvents: asArray(attendanceEvents).map(cloneDomainEntity),
  };
  return Object.freeze({
    getModel: () => ({
      scheduleTemplates: model.scheduleTemplates.map(cloneDomainEntity),
      scheduleAssignments: model.scheduleAssignments.map(cloneDomainEntity),
      attendanceEvents: model.attendanceEvents.map(cloneDomainEntity),
    }),
    validate: () => validatePersonnelCalendarModel(model),
    resolveEffectiveScheduleAssignment: (employeeId, date) => resolveEffectiveScheduleAssignment({
      employeeId,
      date,
      scheduleAssignments: model.scheduleAssignments,
    }),
    projectAvailability: (employeeId, date) => projectEmployeeAvailability({
      employeeId,
      date,
      ...model,
    }),
    projectAvailabilityRange: (employeeId, from, to) => projectEmployeeAvailabilityRange({
      employeeId,
      from,
      to,
      ...model,
    }),
  });
}
