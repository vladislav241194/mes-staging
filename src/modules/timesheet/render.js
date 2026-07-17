import { formatPersonDisplayName } from "../../ui/formatters.js";

export function createTimesheetModule(dependencies = {}) {
  const {
    DAY_MS,
    TIMESHEET_DAY_OPTIONS,
    TIMESHEET_SCHEDULE_OPTIONS,
    TIMESHEET_VIEW_OPTIONS,
    addMs,
    bindGenericModalCloseEvents = () => {},
    blockProtectedDestructiveAction = () => false,
    canEditTimesheetEmployee = () => false,
    dedupeEmployeeOrgRows,
    escapeAttribute,
    escapeHtml,
    formatDate,
    fromDateInput,
    getEmployeeDepartmentLabelForWorkCenters,
    getProductionStructureEmployees,
    getProductionStructureMatrixRuntimeOverrides,
    icon,
    mapLegacyWorkCenterId,
    normalizeDateInput,
    normalizeLookupText,
    normalizePlainRecord,
    normalizeWorkMode,
    persistUiState,
    render,
    renderUiActionButton,
    renderUiFilterBar,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiFormSection,
    renderUiModalFrame,
    renderUiModulePage,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
    renderUiToolbar,
    startOfDay,
    startOfWeek,
    toDateInput,
  } = dependencies;
  const getApp = dependencies.getApp || (() => null);
  const getDefaultUiState = dependencies.getDefaultUiState || (() => ({}));
  const getUi = dependencies.getUi || (() => ({}));
  const readPersonnelCalendarModel = typeof dependencies.getPersonnelCalendarModel === "function"
    ? dependencies.getPersonnelCalendarModel
    : () => null;
  const projectPersonnelAvailability = typeof dependencies.projectEmployeeAvailability === "function"
    ? dependencies.projectEmployeeAvailability
    : null;
  const resolvePersonnelScheduleAssignment = typeof dependencies.resolveEffectiveScheduleAssignment === "function"
    ? dependencies.resolveEffectiveScheduleAssignment
    : null;
  const migrateLegacyTimesheetState = typeof dependencies.migrateLegacyTimesheetState === "function"
    ? dependencies.migrateLegacyTimesheetState
    : null;
  const personnelScheduleTemplates = Array.isArray(dependencies.personnelScheduleTemplates)
    ? dependencies.personnelScheduleTemplates
    : [];
  const saveAttendanceEvent = typeof dependencies.saveAttendanceEvent === "function"
    ? dependencies.saveAttendanceEvent
    : null;
  const saveScheduleAssignment = typeof dependencies.saveScheduleAssignment === "function"
    ? dependencies.saveScheduleAssignment
    : null;
  const removeAttendanceEvents = typeof dependencies.removeAttendanceEvents === "function"
    ? dependencies.removeAttendanceEvents
    : null;
  const removeScheduleAssignment = typeof dependencies.removeScheduleAssignment === "function"
    ? dependencies.removeScheduleAssignment
    : null;
  const app = {
    querySelector: (...args) => getApp()?.querySelector?.(...args) || null,
    querySelectorAll: (...args) => getApp()?.querySelectorAll?.(...args) || [],
  };
  const defaultUiState = new Proxy({}, {
    get(_target, property) {
      return getDefaultUiState()?.[property];
    },
  });
  const ui = new Proxy({}, {
    get(_target, property) {
      return getUi()?.[property];
    },
    set(_target, property, value) {
      const currentUi = getUi();
      if (currentUi && typeof currentUi === "object") currentUi[property] = value;
      return true;
    },
  });

  const UNKNOWN_TIMESHEET_DAY_OPTION = Object.freeze({
    value: "unknown",
    code: "unknown",
    label: "Не опр.",
    display: ["?"],
    title: "Доступность не определена",
    hours: 0,
    overtime: 0,
  });

  function getTimesheetDayOption(value = "work") {
    if (value === "unknown") return UNKNOWN_TIMESHEET_DAY_OPTION;
    return TIMESHEET_DAY_OPTIONS.find((option) => option.value === value || option.code === value) || UNKNOWN_TIMESHEET_DAY_OPTION;
  }
  
  function normalizeTimesheetView(value = "") {
    const candidate = String(value || "").trim();
    return TIMESHEET_VIEW_OPTIONS.some((option) => option.id === candidate) ? candidate : "month";
  }
  
  function normalizeTimesheetScheduleCode(value = "") {
    const candidate = String(value || "").trim();
    return TIMESHEET_SCHEDULE_OPTIONS.some((option) => option.code === candidate) ? candidate : "5/2";
  }
  
  function getDefaultTimesheetSchedule(code = "5/2") {
    const normalizedCode = normalizeTimesheetScheduleCode(code);
    return TIMESHEET_SCHEDULE_OPTIONS.find((option) => option.code === normalizedCode) || TIMESHEET_SCHEDULE_OPTIONS[0];
  }
  
  function normalizeTimeInput(value = "") {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return "";
    if (hours === 24 && minutes !== 0) return "";
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  
  function getTimesheetTimeMinutes(value = "") {
    const normalized = normalizeTimeInput(value);
    if (!normalized) return null;
    const [hours, minutes] = normalized.split(":").map(Number);
    return hours * 60 + minutes;
  }
  
  function getTimesheetScheduleHours(code = "5/2", start = "08:00", end = "17:00") {
    const startMinutes = getTimesheetTimeMinutes(start);
    const endMinutes = getTimesheetTimeMinutes(end);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
    let minutes = endMinutes - startMinutes;
    if (minutes <= 0) minutes += 24 * 60;
    let hours = minutes / 60;
    if (normalizeTimesheetScheduleCode(code) === "5/2" && hours >= 6) hours -= 1;
    return Math.max(0, Math.round(hours * 4) / 4);
  }
  
  function formatTimesheetHours(value = 0) {
    return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  }
  
  function getTimesheetPeriodAnchor() {
    const normalized = normalizeDateInput(ui.timesheetPeriodAnchor || defaultUiState.timesheetPeriodAnchor) || defaultUiState.timesheetPeriodAnchor;
    return startOfDay(fromDateInput(normalized));
  }
  
  function getTimesheetPeriodDays() {
    const view = normalizeTimesheetView(ui.timesheetView);
    const anchor = getTimesheetPeriodAnchor();
    if (view === "week") {
      const firstDay = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, index) => addMs(firstDay, index * DAY_MS));
    }
    const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1));
  }
  
  function getTimesheetPeriodLabel(days = [], view = "month") {
    if (!days.length) return "";
    if (view === "week") {
      const first = days[0];
      const last = days[days.length - 1];
      return `${formatDate(first)}-${formatDate(last)}`;
    }
    return days[0].toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  
  function getTimesheetEmployeeId(employee = {}, index = 0) {
    return String(employee.id || employee.employeeId || normalizeLookupText(employee.name || "") || `employee-${index}`);
  }
  
  function getTimesheetScheduleCodeFromEmployee(employee = {}, fallbackCode = "5/2") {
    const rawCode = String(employee.workSchedule || employee.schedule || employee.shiftSchedule || "").trim();
    if (TIMESHEET_SCHEDULE_OPTIONS.some((option) => option.code === rawCode)) return rawCode;
    return normalizeTimesheetScheduleCode(fallbackCode);
  }
  
  function getTimesheetWorkModeRange(value = "") {
    const normalizedMode = normalizeWorkMode(value, "");
    const match = normalizedMode.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) return null;
    return {
      start: normalizeTimeInput(match[1]),
      end: normalizeTimeInput(match[2]),
    };
  }

  function asCalendarArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getCalendarDateKey(value = null) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateInput(value);
    return normalizeDateInput(value) || toDateInput(getTimesheetPeriodAnchor());
  }

  function getCalendarTemplateByCode(code = "", templates = personnelScheduleTemplates) {
    return asCalendarArray(templates).find((template) => String(template?.code || "").trim() === String(code || "").trim()) || null;
  }

  function getCanonicalPersonnelCalendarContext() {
    let model = null;
    try {
      model = readPersonnelCalendarModel();
    } catch (_error) {
      model = null;
    }
    if (!model || typeof model !== "object" || Array.isArray(model)) return null;
    return {
      source: "canonical",
      model: {
        scheduleTemplates: asCalendarArray(model.scheduleTemplates),
        scheduleAssignments: asCalendarArray(model.scheduleAssignments),
        attendanceEvents: asCalendarArray(model.attendanceEvents),
      },
      issues: asCalendarArray(model.issues),
    };
  }

  function buildLegacyMatrixScheduleAssignment(employee = {}, index = 0, templates = personnelScheduleTemplates) {
    const employeeId = getTimesheetEmployeeId(employee, index);
    const workCenterIds = new Set((employee.workCenterIds || []).map((id) => mapLegacyWorkCenterId(id)));
    const isShift = workCenterIds.has("D1") || String(employee.role || "").toLowerCase().includes("кладов");
    const code = getTimesheetScheduleCodeFromEmployee(employee, isShift ? "2/2" : "5/2");
    const template = getCalendarTemplateByCode(code, templates);
    if (!template?.id) return null;
    const matrixMode = getTimesheetWorkModeRange(employee.workMode || employee.shiftWindow || employee.shift || employee.mode || "");
    return {
      id: `legacy-matrix-schedule:${encodeURIComponent(employeeId)}`,
      employeeId,
      scheduleTemplateId: template.id,
      effectiveFrom: "1970-01-01",
      effectiveTo: null,
      patternOffset: Math.max(0, Math.round(Number(employee.patternOffset || 0) || 0)),
      startTime: matrixMode?.start || undefined,
      endTime: matrixMode?.end || undefined,
      sourceRefs: [`productionStructureMatrix.employee:${employeeId}`],
    };
  }

  function buildLegacyPersonnelCalendarContext(employees = []) {
    const scheduleOverrides = normalizePlainRecord(ui.timesheetScheduleOverrides);
    const cellOverrides = normalizePlainRecord(ui.timesheetCellOverrides);
    if (!migrateLegacyTimesheetState) {
      return {
        source: "legacy-unavailable",
        model: { scheduleTemplates: personnelScheduleTemplates, scheduleAssignments: [], attendanceEvents: [] },
        issues: [{ code: "missing_legacy_migration_dependency", message: "Legacy timesheet data cannot be read without the migration adapter" }],
      };
    }
    let migration = null;
    try {
      migration = migrateLegacyTimesheetState({
        timesheetScheduleOverrides: scheduleOverrides,
        timesheetCellOverrides: cellOverrides,
      }, { effectiveFrom: "1970-01-01" });
    } catch (error) {
      return {
        source: "legacy-invalid",
        model: { scheduleTemplates: personnelScheduleTemplates, scheduleAssignments: [], attendanceEvents: [] },
        issues: [{ code: "legacy_migration_failed", message: error?.message || "Legacy timesheet migration failed" }],
      };
    }
    const scheduleTemplates = asCalendarArray(migration?.scheduleTemplates).length
      ? migration.scheduleTemplates
      : personnelScheduleTemplates;
    const migratedAssignments = asCalendarArray(migration?.scheduleAssignments);
    const assignedEmployeeIds = new Set(migratedAssignments.map((assignment) => String(assignment?.employeeId || "").trim()).filter(Boolean));
    const matrixAssignments = asCalendarArray(employees)
      .map((employee, index) => buildLegacyMatrixScheduleAssignment(employee, index, scheduleTemplates))
      .filter((assignment) => assignment && !assignedEmployeeIds.has(assignment.employeeId));
    return {
      source: "legacy-read-migration",
      model: {
        scheduleTemplates,
        scheduleAssignments: [...migratedAssignments, ...matrixAssignments],
        attendanceEvents: asCalendarArray(migration?.attendanceEvents),
      },
      issues: asCalendarArray(migration?.issues),
    };
  }

  function getPersonnelCalendarContext(employees = []) {
    return getCanonicalPersonnelCalendarContext() || buildLegacyPersonnelCalendarContext(employees);
  }

  function getUnknownTimesheetSchedule(dateKey = "", issues = [], source = "unknown") {
    return {
      availabilityStatus: "unknown",
      code: "—",
      start: "",
      end: "",
      mode: "Не определён",
      caption: "нет валидного назначения",
      patternOffset: 0,
      hours: 0,
      hoursSource: "Календарь не определён",
      assignmentId: "",
      templateId: "",
      effectiveFrom: "",
      effectiveTo: null,
      calendarDateKey: dateKey,
      calendarSource: source,
      sourceRefs: [],
      issues: asCalendarArray(issues),
    };
  }

  function getTimesheetEmployeeSchedule(employee = {}, index = 0, date = null, calendarContext = null) {
    const employeeId = getTimesheetEmployeeId(employee, index);
    const dateKey = getCalendarDateKey(date);
    const context = calendarContext || getPersonnelCalendarContext([employee]);
    if (!resolvePersonnelScheduleAssignment) {
      return getUnknownTimesheetSchedule(dateKey, [{ code: "missing_schedule_resolver", message: "Personnel schedule resolver is not connected" }], context.source);
    }
    let resolution = null;
    try {
      resolution = resolvePersonnelScheduleAssignment({
        employeeId,
        date: dateKey,
        scheduleAssignments: context.model.scheduleAssignments,
      });
    } catch (error) {
      return getUnknownTimesheetSchedule(dateKey, [{ code: "schedule_resolution_failed", message: error?.message || "Schedule resolution failed" }], context.source);
    }
    if (resolution?.status !== "resolved" || !resolution.assignment) {
      return getUnknownTimesheetSchedule(dateKey, resolution?.issues || context.issues, context.source);
    }
    const assignment = resolution.assignment;
    const matches = context.model.scheduleTemplates.filter((template) => template?.id === assignment.scheduleTemplateId);
    if (matches.length !== 1) {
      return getUnknownTimesheetSchedule(dateKey, [{ code: "invalid_schedule_template_reference", message: "Schedule assignment must reference exactly one template" }], context.source);
    }
    const template = matches[0];
    const code = String(template.code || "").trim();
    const defaults = TIMESHEET_SCHEDULE_OPTIONS.find((option) => option.code === code) || {};
    const start = normalizeTimeInput(assignment.startTime || template.startTime);
    const end = normalizeTimeInput(assignment.endTime || template.endTime);
    if (!code || !start || !end) {
      return getUnknownTimesheetSchedule(dateKey, [{ code: "invalid_effective_schedule", message: "Effective schedule has no valid code or time window" }], context.source);
    }
    const startMinutes = getTimesheetTimeMinutes(start);
    const endMinutes = getTimesheetTimeMinutes(end);
    let windowMinutes = endMinutes - startMinutes;
    if (windowMinutes <= 0) windowMinutes += 24 * 60;
    const breakMinutes = Math.max(0, Number(assignment.breakMinutes ?? template.breakMinutes ?? 0));
    if (!Number.isFinite(windowMinutes) || windowMinutes <= breakMinutes) {
      return getUnknownTimesheetSchedule(dateKey, [{ code: "invalid_effective_schedule_window", message: "Schedule window must be longer than its break" }], context.source);
    }
    const hours = (windowMinutes - breakMinutes) / 60;
    return {
      availabilityStatus: "known",
      code,
      start,
      end,
      mode: `${start}-${end}`,
      caption: String(template.name || defaults.caption || code),
      patternOffset: Number(assignment.patternOffset || 0),
      hours,
      hoursSource: context.source === "canonical" ? "Календарь персонала" : "Legacy · только чтение",
      assignmentId: String(assignment.id || ""),
      templateId: String(template.id || ""),
      effectiveFrom: String(assignment.effectiveFrom || ""),
      effectiveTo: assignment.effectiveTo || null,
      calendarDateKey: dateKey,
      calendarSource: context.source,
      sourceRefs: [...new Set([...(template.sourceRefs || []), ...(assignment.sourceRefs || [])])],
      issues: [],
    };
  }
  
  function getTimesheetDepartmentLabel(employee = {}) {
    const label = getEmployeeDepartmentLabelForWorkCenters(employee.workCenterIds || []);
    if (label) return label;
    return employee.department || "Без отдела";
  }
  
  function getLegacyTimesheetValueFromProjection(projection = {}) {
    if (projection.status === "unknown") return "unknown";
    if (projection.status === "available") return "work";
    if (projection.reason === "attendance:vacation") return "vacation";
    if (projection.reason === "attendance:sick") return "sick";
    if (projection.reason === "attendance:leave") return "leave";
    return "off";
  }

  function getTimesheetCell(employee = {}, date, employeeIndex = 0, schedule = null, calendarContext = null) {
    const employeeId = getTimesheetEmployeeId(employee, employeeIndex);
    const dateKey = getCalendarDateKey(date);
    const context = calendarContext || getPersonnelCalendarContext([employee]);
    const resolvedSchedule = getTimesheetEmployeeSchedule(employee, employeeIndex, date, context);
    if (!projectPersonnelAvailability) {
      const option = getTimesheetDayOption("unknown");
      return {
        ...option,
        availabilityStatus: "unknown",
        title: "Доступность не определена: personnel calendar projection не подключён",
        hours: 0,
        plannedHours: 0,
        overtime: 0,
        start: resolvedSchedule.start || schedule?.start || "",
        end: resolvedSchedule.end || schedule?.end || "",
        comment: "",
        dateKey,
        sourceRefs: [],
        issues: [{ code: "missing_availability_projection" }],
      };
    }
    let projection = null;
    try {
      projection = projectPersonnelAvailability({
        employeeId,
        date: dateKey,
        ...context.model,
      });
    } catch (error) {
      projection = {
        status: "unknown",
        reason: "projection_failed",
        plannedMinutes: 0,
        availableMinutes: 0,
        sourceRefs: [],
        issues: [{ code: "projection_failed", message: error?.message || "Availability projection failed" }],
      };
    }
    const validStatuses = new Set(["available", "absent", "unknown"]);
    if (!projection || !validStatuses.has(projection.status)) {
      projection = {
        status: "unknown",
        reason: "invalid_projection",
        plannedMinutes: 0,
        availableMinutes: 0,
        sourceRefs: [],
        issues: [{ code: "invalid_projection", message: "Availability projection returned an unsupported result" }],
      };
    }
    const dayEvents = context.model.attendanceEvents.filter((event) => (
      String(event?.employeeId || "").trim() === employeeId
      && String(event?.date || "").trim() === dateKey
    ));
    const workEvent = dayEvents.find((event) => event.kind === "work") || null;
    const overtimeMinutes = dayEvents
      .filter((event) => event.kind === "overtime")
      .reduce((sum, event) => sum + Math.max(0, Number(event.minutes || 0)), 0);
    const comments = [...new Set(dayEvents.map((event) => String(event?.comment || "").trim()).filter(Boolean))];
    let value = getLegacyTimesheetValueFromProjection(projection);
    if (value === "work" && overtimeMinutes > 0) value = "overtime";
    const option = getTimesheetDayOption(value);
    const isWork = value === "work" || value === "overtime";
    const start = normalizeTimeInput(workEvent?.startTime) || resolvedSchedule.start || schedule?.start || "";
    const end = normalizeTimeInput(workEvent?.endTime) || resolvedSchedule.end || schedule?.end || "";
    const plannedHours = Math.max(0, Number(projection.plannedMinutes || 0) / 60);
    const hours = projection.status === "available" ? Math.max(0, Number(projection.availableMinutes || 0) / 60) : 0;
    const overtime = Math.max(0, overtimeMinutes / 60);
    const issueText = asCalendarArray(projection.issues).map((issue) => issue?.message || issue?.code).filter(Boolean).join("; ");
    const titleParts = [
      option.title || option.label || "График дня",
      projection.status === "unknown" ? `не определено: ${projection.reason || "нет данных"}` : "",
      isWork ? `${formatTimesheetHours(hours)} ч доступно` : "",
      `${formatTimesheetHours(plannedHours)} ч по плану`,
      overtime ? `сверхурочно +${formatTimesheetHours(overtime)} ч` : "",
      comments.length ? `комментарий: ${comments.join("; ")}` : "",
      issueText,
    ].filter(Boolean);
    return {
      value,
      code: option.code,
      label: isWork && start && end ? `${start}-${end}` : option.label,
      display: isWork && start && end ? [start, end] : option.display,
      title: titleParts.join("; "),
      availabilityStatus: projection.status,
      availabilityReason: projection.reason || "",
      hours,
      plannedHours,
      overtime,
      start,
      end,
      comment: comments.join("; "),
      dateKey,
      sourceRefs: asCalendarArray(projection.sourceRefs),
      issues: asCalendarArray(projection.issues),
    };
  }
  
  function getTimesheetModel() {
    const view = normalizeTimesheetView(ui.timesheetView);
    const days = getTimesheetPeriodDays();
    const sourceRows = dedupeEmployeeOrgRows(getProductionStructureEmployees(getProductionStructureMatrixRuntimeOverrides()));
    const calendarContext = getPersonnelCalendarContext(sourceRows);
    const employees = sourceRows
      .filter((employee) => employee.name)
      .map((employee, index) => {
        const timesheetId = getTimesheetEmployeeId(employee, index);
        const schedule = getTimesheetEmployeeSchedule(employee, index, days[0] || getTimesheetPeriodAnchor(), calendarContext);
        const department = getTimesheetDepartmentLabel(employee);
        const cells = days.map((day) => getTimesheetCell(employee, day, index, schedule, calendarContext));
        return {
          ...employee,
          timesheetId,
          sourceIndex: index,
          department,
          schedule,
          cells,
          totalHours: cells.reduce((sum, cell) => sum + Number(cell.hours || 0), 0),
          plannedHours: cells.reduce((sum, cell) => sum + Number(cell.plannedHours || 0), 0),
          overtimeHours: cells.reduce((sum, cell) => sum + Number(cell.overtime || 0), 0),
          unknownDayCount: cells.filter((cell) => cell.availabilityStatus === "unknown").length,
        };
      })
      .sort((left, right) => (
        String(left.department || "").localeCompare(String(right.department || ""), "ru")
        || String(left.personKind || "").localeCompare(String(right.personKind || ""), "ru")
        || String(left.name || "").localeCompare(String(right.name || ""), "ru")
      ));
    const groups = employees.reduce((list, employee) => {
      let group = list.find((item) => item.department === employee.department);
      if (!group) {
        group = { department: employee.department, employees: [] };
        list.push(group);
      }
      group.employees.push(employee);
      return list;
    }, []);
    const totalHours = employees.reduce((sum, employee) => sum + employee.totalHours, 0);
    const plannedHours = employees.reduce((sum, employee) => sum + employee.plannedHours, 0);
    const overtimeHours = employees.reduce((sum, employee) => sum + employee.overtimeHours, 0);
    const unknownDayCount = employees.reduce((sum, employee) => sum + employee.unknownDayCount, 0);
    return {
      view,
      days,
      periodLabel: getTimesheetPeriodLabel(days, view),
      employees,
      groups,
      totalHours,
      plannedHours,
      overtimeHours,
      unknownDayCount,
      departmentCount: groups.length,
      calendarSource: calendarContext.source,
      calendarIssues: calendarContext.issues,
    };
  }
  
  function renderTimesheetCellContent(cell = {}) {
    const display = Array.isArray(cell.display) && cell.display.length ? cell.display : [cell.label || "—"];
    return display.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  }
  
  function renderTimesheetDayButtonContent(cell = {}) {
    return `
      ${renderTimesheetCellContent(cell)}
    `;
  }
  
  function renderTimesheetCell(cell = {}, employee = {}) {
    const value = cell.value || (cell.code === "work-overtime" ? "overtime" : cell.code);
    const isToday = normalizeDateInput(cell.dateKey || "") === toDateInput(startOfDay(new Date()));
    return `
      <td class="timesheet-day-cell is-${escapeAttribute(cell.code || "unknown")}${isToday ? " is-today" : ""}" title="${escapeAttribute(cell.title || cell.label || "")}" data-timesheet-cell data-timesheet-value="${escapeAttribute(value)}" data-timesheet-availability="${escapeAttribute(cell.availabilityStatus || "unknown")}" data-timesheet-date="${escapeAttribute(cell.dateKey || "")}" data-timesheet-employee-id="${escapeAttribute(employee.timesheetId || "")}" data-hours="${Number(cell.hours || 0)}" data-planned-hours="${Number(cell.plannedHours || 0)}" data-overtime="${Number(cell.overtime || 0)}">
        <button class="timesheet-day-button" type="button" aria-label="${escapeAttribute(cell.title || cell.label || "График дня")}" data-timesheet-day-button>
          ${renderTimesheetDayButtonContent(cell)}
        </button>
        ${cell.overtime ? `<span class="timesheet-overtime-layer">+${Number(cell.overtime).toLocaleString("ru-RU")}</span>` : ""}
      </td>
    `;
  }
  
  function renderTimesheetEditorModal() {
    const editor = ui.timesheetEditor || null;
    if (!editor?.employeeId) return "";
    const model = getTimesheetModel();
    const employee = model.employees.find((item) => item.timesheetId === editor.employeeId);
    if (!employee) return "";
    const dateKey = normalizeDateInput(editor.dateKey || toDateInput(model.days[0] || getTimesheetPeriodAnchor())) || toDateInput(model.days[0] || getTimesheetPeriodAnchor());
    const date = startOfDay(fromDateInput(dateKey));
    const cell = getTimesheetCell(employee, date, employee.sourceIndex || 0, employee.schedule);
    const value = cell.value || "work";
    const editable = canEditTimesheetEmployee(employee.timesheetId) === true;
    const employeeDisplayName = formatPersonDisplayName(employee.name, { fallback: "Сотрудник" });
  
    return `
      <div class="modal-backdrop timesheet-editor-backdrop" data-modal-backdrop>
        ${renderUiModalFrame({
          className: "large-modal form-modal timesheet-editor-modal",
          size: "large",
          attributes: "aria-label=\"Редактирование табеля\"",
          title: `${employeeDisplayName} · ${formatDate(date)}`,
          meta: "Табель · факт дня и назначение графика",
          headActions: renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-close-modal type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" }),
          body: `
          <div class="timesheet-editor-summary">
            <article>
              <span>Отдел</span>
              <strong>${escapeHtml(employee.department || "Без отдела")}</strong>
            </article>
            <article>
              <span>Должность</span>
              <strong>${escapeHtml(employee.role || "Сотрудник")}</strong>
            </article>
            <article>
              <span>Текущий график</span>
              <strong>${escapeHtml(employee.schedule.code)} · ${escapeHtml(employee.schedule.mode)}</strong>
            </article>
            <article>
              <span>План / доступно</span>
              <strong>${escapeHtml(formatTimesheetHours(cell.plannedHours))} / ${escapeHtml(formatTimesheetHours(cell.hours))} ч</strong>
            </article>
          </div>

          <form id="timesheetAttendanceForm" data-timesheet-editor-form data-timesheet-attendance-form>
            <input type="hidden" name="employeeId" value="${escapeAttribute(employee.timesheetId)}" />
            <input type="hidden" name="dateKey" value="${escapeAttribute(dateKey)}" />
            <fieldset class="timesheet-editor-fieldset" ${editable ? "" : "disabled"}>
            ${renderUiFormSection({
              title: "Факт выбранного дня",
              meta: editable
                ? "Изменяет только событие выбранной даты. Постоянный график сотрудника не затрагивается."
                : "Только просмотр: роль не разрешает изменять факт этого сотрудника.",
              className: "timesheet-editor-section",
              attributes: "aria-label=\"Факт выбранного дня\"",
              body: `
                ${renderUiFormGrid({
                  columns: "4",
                  className: "timesheet-editor-grid",
                  body: `
                    ${renderUiFormField({
                      label: "Состояние дня",
                      className: "form-field",
                      control: `
                        <select name="value">
                          ${value === "unknown" ? `<option value="unknown" selected disabled>Не определено — выберите факт</option>` : ""}
                          ${TIMESHEET_DAY_OPTIONS.map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.title || option.label)}</option>`).join("")}
                        </select>
                      `,
                    })}
                    ${renderUiFormField({
                      label: "Начало факта",
                      className: "form-field",
                      control: `<input type="time" name="start" value="${escapeAttribute(cell.start || employee.schedule.start)}" />`,
                    })}
                    ${renderUiFormField({
                      label: "Окончание факта",
                      className: "form-field",
                      control: `<input type="time" name="end" value="${escapeAttribute(cell.end || employee.schedule.end)}" />`,
                    })}
                    ${renderUiFormField({
                      label: "Сверхурочно, ч",
                      className: "form-field",
                      control: `<input type="number" name="overtime" min="0" step="0.25" value="${escapeAttribute(cell.overtime || 0)}" />`,
                    })}
                    ${renderUiFormField({
                      label: "Комментарий",
                      className: "form-field full",
                      control: `<textarea name="comment" rows="2" placeholder="Например: подмена смены, частичный день, согласованный отпуск">${escapeHtml(cell.comment || "")}</textarea>`,
                    })}
                  `,
                })}
                ${renderUiFormActions({
                  className: "timesheet-editor-form-actions",
                  actions: editable ? `
                    ${renderUiActionButton({ label: "Сбросить факт дня", iconName: "reset", attributes: "data-timesheet-reset-cell type=\"button\"" })}
                    ${renderUiActionButton({ label: "Сохранить факт дня", iconName: "save", tone: "primary", attributes: "type=\"submit\"" })}
                  ` : renderUiStatusToken("Факт дня · только просмотр", "neutral"),
                })}
              `,
            })}
            </fieldset>
          </form>

          <form id="timesheetScheduleForm" data-timesheet-schedule-form>
            <input type="hidden" name="employeeId" value="${escapeAttribute(employee.timesheetId)}" />
            <fieldset class="timesheet-editor-fieldset" ${editable ? "" : "disabled"}>
            ${renderUiFormSection({
              title: "Постоянный график сотрудника",
              meta: editable
                ? "Создаёт отдельное назначение графика с датой начала действия. Факт выбранного дня не меняется."
                : "Только просмотр: роль не разрешает менять график этого сотрудника.",
              className: "timesheet-editor-section",
              attributes: "aria-label=\"Постоянный график сотрудника\"",
              body: `
                ${renderUiFormGrid({
                  columns: "4",
                  className: "timesheet-editor-grid is-schedule",
                  body: `
                    ${renderUiFormField({
                      label: "Действует с",
                      className: "form-field",
                      control: `<input type="date" name="effectiveFrom" value="${escapeAttribute(dateKey)}" required />`,
                    })}
                    ${renderUiFormField({
                      label: "Тип графика",
                      className: "form-field",
                      control: `
                        <select name="scheduleCode">
                          ${TIMESHEET_SCHEDULE_OPTIONS.map((option) => `<option value="${escapeAttribute(option.code)}" ${option.code === employee.schedule.code ? "selected" : ""}>${escapeHtml(option.code)} · ${escapeHtml(option.caption)} · ${escapeHtml(option.start)}-${escapeHtml(option.end)}</option>`).join("")}
                        </select>
                      `,
                    })}
                    ${renderUiFormField({
                      label: "Смещение цикла",
                      className: "form-field",
                      control: `<input type="number" name="patternOffset" min="0" max="6" step="1" value="${Number(employee.schedule.patternOffset || 0)}" />`,
                    })}
                  `,
                })}
                ${renderUiFormActions({
                  className: "timesheet-editor-form-actions",
                  actions: editable ? `
                    ${renderUiActionButton({ label: "Сбросить назначение", iconName: "reset", attributes: "data-timesheet-reset-schedule type=\"button\"" })}
                    ${renderUiActionButton({ label: "Сохранить график", iconName: "save", tone: "primary", attributes: "type=\"submit\"" })}
                  ` : renderUiStatusToken("График · только просмотр", "neutral"),
                })}
              `,
            })}
            </fieldset>
          </form>
        `,
          actions: `
            ${renderUiActionButton({ label: "Закрыть", attributes: "data-close-modal type=\"button\"" })}
          `,
        })}
      </div>
    `;
  }
  
  function renderTimesheetPage() {
    const model = getTimesheetModel();
    const columnCount = 5 + model.days.length;
    const navLabel = model.view === "week" ? "неделю" : "месяц";
  
    return renderUiModulePage({
      ariaLabel: "Табель",
      className: `timesheet-page is-${escapeAttribute(model.view)}`,
      workspaceClassName: "timesheet-workspace",
      contentClassName: "timesheet-content",
      visualContract: "base-glass-reference-v1 headerless-module",
      content: `
        ${renderUiPanel({
          className: "timesheet-hero-panel",
          body: renderUiPanelBody({ body: `
  	            <div class="timesheet-title">
  	              ${renderUiStatusToken("Календарь и факты", "ready")}
  	              <div>
  	                <h2>Табель · ${escapeHtml(model.periodLabel)}</h2>
  	                <p>Плановый календарь сотрудников и факты рабочего времени хранятся раздельно: график задаёт ожидаемую смену, а явка, отсутствие и сверхурочные фиксируют произошедший день. Вычисляемая доступность используется Мастерской.</p>
                  ${renderUiToolbar({
                    className: "timesheet-controls",
                    attributes: "aria-label=\"Период табеля\"",
                    body: `
                      ${renderUiFilterBar({
                        className: "timesheet-view-switch",
                        attributes: "role=\"group\" aria-label=\"Режим отображения\"",
                        body: TIMESHEET_VIEW_OPTIONS.map((option) => `
                          <button class="${option.id === model.view ? "is-active" : ""}" type="button" data-timesheet-view="${escapeAttribute(option.id)}">${escapeHtml(option.label)}</button>
                        `).join(""),
                      })}
                      <div class="timesheet-period-nav">
	                        ${renderUiActionButton({ iconName: "arrowLeft", tone: "icon", attributes: `type="button" data-timesheet-period-nav="-1" title="Предыдущий ${escapeAttribute(navLabel)}" aria-label="Предыдущий ${escapeAttribute(navLabel)}"` })}
	                        <strong>${escapeHtml(model.periodLabel)}</strong>
	                        ${renderUiActionButton({ iconName: "arrowRight", tone: "icon", attributes: `type="button" data-timesheet-period-nav="1" title="Следующий ${escapeAttribute(navLabel)}" aria-label="Следующий ${escapeAttribute(navLabel)}"` })}
                      </div>
                    `,
                  })}
                </div>
              </div>
              <div class="timesheet-kpis" aria-label="Итоги табеля">
                <article><span>Сотрудников</span><strong>${model.employees.length.toLocaleString("ru-RU")}</strong></article>
                <article><span>Отделов</span><strong>${model.departmentCount.toLocaleString("ru-RU")}</strong></article>
		                <article><span>План часов</span><strong data-timesheet-total-hours>${model.plannedHours.toLocaleString("ru-RU")}</strong></article>
	                <article><span>Сверхурочно</span><strong data-timesheet-total-overtime>${model.overtimeHours.toLocaleString("ru-RU")}</strong></article>
	              </div>
          ` }),
        })}
  
        ${renderUiPanel({
          className: "timesheet-board-panel",
          attributes: "aria-label=\"Табличная форма табеля\"",
          body: renderUiPanelBody({ body: `
              <header class="timesheet-board-head">
                <div>
                  <strong>Календарь и факты рабочего времени</strong>
                  <span>Клик по дню открывает факт явки или отсутствия. Клик по графику сотрудника открывает отдельное плановое назначение 5/2 или 2/2 и времени смены.</span>
                </div>
                <div class="timesheet-legend">
                  <span class="is-work">Работа</span>
                  <span class="is-overtime">+ сверх</span>
                  <span class="is-vacation">Отп.</span>
                  <span class="is-sick">Б/л</span>
                  <span class="is-off">Вых</span>
                </div>
              </header>
              ${renderUiTableWrap({
                className: "timesheet-table-wrap",
                scrollContract: "viewport",
                body: `
                <table class="timesheet-table">
                  <colgroup>
                    <col class="timesheet-col-person" />
                    <col class="timesheet-col-role" />
                    <col class="timesheet-col-schedule" />
                    ${model.days.map(() => `<col class="timesheet-col-day" />`).join("")}
                    <col class="timesheet-col-total" />
                    <col class="timesheet-col-overtime" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Должность</th>
                      <th>График</th>
                      ${model.days.map((day) => {
                        const weekend = day.getDay() === 0 || day.getDay() === 6;
                        const today = toDateInput(day) === toDateInput(startOfDay(new Date()));
                        return `<th class="${[weekend ? "is-weekend" : "", today ? "is-today" : ""].filter(Boolean).join(" ")}"><b>${day.getDate()}</b><span>${formatShortWeekday(day)}</span></th>`;
                      }).join("")}
                      <th>Итого</th>
                      <th>Сверх</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${model.groups.map((group) => `
                      <tr class="timesheet-department-row">
                        <th colspan="${columnCount}">
                          <span>${escapeHtml(group.department)}</span>
                          <small>${group.employees.length.toLocaleString("ru-RU")} чел.</small>
                        </th>
                      </tr>
                      ${group.employees.map((employee) => {
                        const employeeDisplayName = formatPersonDisplayName(employee.name, { fallback: "Сотрудник" });
                        return `
                        <tr class="timesheet-employee-row">
                          <th class="timesheet-person-cell">
                            <strong>${escapeHtml(employeeDisplayName)}</strong>
                            <small>${escapeHtml(employee.personKind === "master" ? "мастер" : "исполнитель")}</small>
                          </th>
                          <td class="timesheet-role-cell"><span>${escapeHtml(employee.role || "Сотрудник")}</span></td>
                          <td class="timesheet-schedule-cell">
                            <button type="button" data-timesheet-schedule-button data-timesheet-employee-id="${escapeAttribute(employee.timesheetId)}" data-timesheet-date="${escapeAttribute(toDateInput(model.days[0] || getTimesheetPeriodAnchor()))}" title="Настроить график сотрудника">
                              <strong>${escapeHtml(employee.schedule.code)}</strong>
                              <small>${escapeHtml(employee.schedule.mode)}</small>
                            </button>
                          </td>
                          ${employee.cells.map((cell) => renderTimesheetCell(cell, employee)).join("")}
                          <td class="timesheet-total-cell"><strong data-timesheet-row-total>${escapeHtml(formatTimesheetHours(employee.totalHours))}</strong><small>ч</small></td>
                          <td class="timesheet-total-cell is-overtime"><strong data-timesheet-row-overtime>${escapeHtml(formatTimesheetHours(employee.overtimeHours))}</strong><small>ч</small></td>
                        </tr>
                      `;}).join("")}
                    `).join("")}
                  </tbody>
                </table>
                `,
              })}
              ` }),
        })}
      `,
    });
  }
  
  function formatShortWeekday(date) {
    return date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
  }
  
  function bindTimesheetEvents() {
    const page = app.querySelector(".timesheet-page");
    bindGenericModalCloseEvents();
    if (page) {
      page.addEventListener("click", (event) => {
        const viewButton = event.target.closest("[data-timesheet-view]");
        if (viewButton) {
          ui.timesheetView = normalizeTimesheetView(viewButton.dataset.timesheetView);
          persistUiState();
          render();
          return;
        }
        const navButton = event.target.closest("[data-timesheet-period-nav]");
        if (navButton) {
          moveTimesheetPeriod(Number(navButton.dataset.timesheetPeriodNav || 0));
          return;
        }
        const scheduleButton = event.target.closest("[data-timesheet-schedule-button]");
        if (scheduleButton) {
          openTimesheetEditor(scheduleButton.dataset.timesheetEmployeeId, scheduleButton.dataset.timesheetDate);
          return;
        }
        const dayButton = event.target.closest("[data-timesheet-day-button]");
        if (!dayButton) return;
        const cell = dayButton.closest("[data-timesheet-cell]");
        openTimesheetEditor(cell?.dataset.timesheetEmployeeId, cell?.dataset.timesheetDate);
      });
    }
  
    app.querySelector("[data-timesheet-attendance-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveTimesheetAttendance(event.currentTarget);
    });
    app.querySelector("[data-timesheet-schedule-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveTimesheetSchedule(event.currentTarget);
    });
    app.querySelector("[data-timesheet-reset-cell]")?.addEventListener("click", () => {
      void resetTimesheetEditorCell();
    });
    app.querySelector("[data-timesheet-reset-schedule]")?.addEventListener("click", () => {
      void resetTimesheetEditorSchedule();
    });
  }
  
  function moveTimesheetPeriod(direction = 0) {
    const delta = Math.sign(Number(direction) || 0);
    if (!delta) return;
    const anchor = getTimesheetPeriodAnchor();
    const view = normalizeTimesheetView(ui.timesheetView);
    const next = view === "week"
      ? addMs(anchor, delta * 7 * DAY_MS)
      : new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    ui.timesheetPeriodAnchor = toDateInput(next);
    persistUiState();
    render();
  }
  
  function openTimesheetEditor(employeeId = "", dateKey = "") {
    const normalizedEmployeeId = String(employeeId || "").trim();
    const normalizedDateKey = normalizeDateInput(dateKey);
    if (!normalizedEmployeeId || !normalizedDateKey) return;
    ui.timesheetEditor = {
      employeeId: normalizedEmployeeId,
      dateKey: normalizedDateKey,
    };
    render();
  }
  
  async function invokeDomainCallback(callback, payload, options = undefined) {
    if (typeof callback !== "function") return { ok: false, reason: "missing_callback" };
    try {
      const result = await callback(payload, options);
      if (result === false || result?.ok === false) {
        return { ok: false, reason: result?.reason || "callback_rejected", result };
      }
      return { ok: true, result };
    } catch (error) {
      return { ok: false, reason: "callback_failed", error };
    }
  }

  function createAttendanceEventId(employeeId = "", dateKey = "", kind = "") {
    return `attendance:${encodeURIComponent(employeeId)}:${dateKey}:${kind}`;
  }

  function buildAttendanceEventsFromFormData(data) {
    const employeeId = String(data.get("employeeId") || "").trim();
    const dateKey = normalizeDateInput(data.get("dateKey"));
    if (!employeeId || !dateKey) return { ok: false, reason: "invalid_coordinates", events: [] };
    const value = String(data.get("value") || "").trim();
    const option = getTimesheetDayOption(value);
    if (option.value === "unknown") return { ok: false, reason: "unknown_attendance_value", events: [] };
    const start = normalizeTimeInput(data.get("start"));
    const end = normalizeTimeInput(data.get("end"));
    const overtimeHours = Number(data.get("overtime") || 0);
    const comment = String(data.get("comment") || "").trim();
    if (!Number.isFinite(overtimeHours) || overtimeHours < 0) {
      return { ok: false, reason: "invalid_overtime", events: [] };
    }
    const isWork = value === "work" || value === "overtime";
    if (isWork && (!start || !end)) {
      return { ok: false, reason: "invalid_work_window", events: [] };
    }
    if (!isWork && overtimeHours > 0) {
      return { ok: false, reason: "absence_overtime_conflict", events: [] };
    }
    if (value === "overtime" && overtimeHours <= 0) {
      return { ok: false, reason: "missing_overtime_minutes", events: [] };
    }
    const sourceRefs = [`timesheet:editor:${employeeId}:${dateKey}`];
    const common = { employeeId, date: dateKey, comment, sourceRefs };
    const absenceKindByValue = {
      vacation: "vacation",
      sick: "sick",
      leave: "leave",
      off: "day_off",
    };
    const events = [];
    if (isWork) {
      events.push({
        ...common,
        id: createAttendanceEventId(employeeId, dateKey, "work"),
        kind: "work",
        startTime: start,
        endTime: end,
      });
      if (overtimeHours > 0) {
        events.push({
          ...common,
          id: createAttendanceEventId(employeeId, dateKey, "overtime"),
          kind: "overtime",
          minutes: Math.round(overtimeHours * 60),
        });
      }
    } else if (absenceKindByValue[value]) {
      const kind = absenceKindByValue[value];
      events.push({
        ...common,
        id: createAttendanceEventId(employeeId, dateKey, kind),
        kind,
      });
    } else {
      return { ok: false, reason: "unsupported_attendance_value", events: [] };
    }
    return { ok: true, employeeId, dateKey, events };
  }

  async function saveTimesheetAttendance(form) {
    const data = form instanceof FormData ? form : new FormData(form);
    const change = buildAttendanceEventsFromFormData(data);
    if (!change.ok) return change;
    if (!canEditTimesheetEmployee(change.employeeId)) return { ok: false, reason: "access_denied" };
    const saved = await invokeDomainCallback(saveAttendanceEvent, change.events, {
      mode: "replace-day",
      employeeId: change.employeeId,
      date: change.dateKey,
    });
    if (!saved.ok) return { ...saved, events: change.events };
    ui.timesheetEditor = null;
    persistUiState();
    render();
    return { ok: true, events: change.events };
  }

  async function saveTimesheetSchedule(form) {
    const data = form instanceof FormData ? form : new FormData(form);
    const employeeId = String(data.get("employeeId") || "").trim();
    const effectiveFrom = normalizeDateInput(data.get("effectiveFrom"));
    const scheduleCode = normalizeTimesheetScheduleCode(data.get("scheduleCode") || "5/2");
    const patternOffset = Math.max(0, Math.round(Number(data.get("patternOffset") || 0) || 0));
    const context = getCanonicalPersonnelCalendarContext() || { model: { scheduleTemplates: personnelScheduleTemplates } };
    const template = getCalendarTemplateByCode(scheduleCode, context.model.scheduleTemplates);
    if (!employeeId || !effectiveFrom || !template?.id) {
      return { ok: false, reason: "invalid_schedule_assignment" };
    }
    if (!canEditTimesheetEmployee(employeeId)) return { ok: false, reason: "access_denied" };
    const assignment = {
      id: `schedule-assignment:${encodeURIComponent(employeeId)}:${effectiveFrom}:${encodeURIComponent(scheduleCode)}`,
      employeeId,
      scheduleTemplateId: template.id,
      effectiveFrom,
      effectiveTo: null,
      patternOffset,
      sourceRefs: [`timesheet:schedule-editor:${employeeId}:${effectiveFrom}`],
    };
    const saved = await invokeDomainCallback(saveScheduleAssignment, assignment, { mode: "replace-effective" });
    if (!saved.ok) return { ...saved, assignment };
    ui.timesheetEditor = null;
    persistUiState();
    render();
    return { ok: true, assignment };
  }
  
  async function resetTimesheetEditorCell() {
    if (blockProtectedDestructiveAction(
      "resetTimesheetEditorCell",
      "Сброс ячейки табеля отключен в этом окружении для защиты данных пользователей",
    )) {
      return;
    }
    const editor = ui.timesheetEditor || {};
    const employeeId = String(editor.employeeId || "").trim();
    const dateKey = normalizeDateInput(editor.dateKey);
    if (!employeeId || !dateKey) return { ok: false, reason: "invalid_coordinates" };
    if (!canEditTimesheetEmployee(employeeId)) return { ok: false, reason: "access_denied" };
    const removed = await invokeDomainCallback(removeAttendanceEvents, { employeeId, date: dateKey });
    if (!removed.ok) return removed;
    persistUiState();
    render();
    return { ok: true };
  }
  
  async function resetTimesheetEditorSchedule() {
    if (blockProtectedDestructiveAction(
      "resetTimesheetEditorSchedule",
      "Сброс графика отключен в этом окружении для защиты данных пользователей",
    )) {
      return;
    }
    const employeeId = String(ui.timesheetEditor?.employeeId || "").trim();
    const dateKey = normalizeDateInput(ui.timesheetEditor?.dateKey);
    if (!employeeId || !dateKey) return { ok: false, reason: "invalid_coordinates" };
    if (!canEditTimesheetEmployee(employeeId)) return { ok: false, reason: "access_denied" };
    const removed = await invokeDomainCallback(removeScheduleAssignment, { employeeId, date: dateKey });
    if (!removed.ok) return removed;
    persistUiState();
    render();
    return { ok: true };
  }

  return {
    bindTimesheetEvents,
    formatTimesheetHours,
    getTimesheetCell,
    getTimesheetDayOption,
    getTimesheetEmployeeSchedule,
    getTimesheetModel,
    renderTimesheetEditorModal,
    renderTimesheetPage,
    resetTimesheetEditorCell,
    resetTimesheetEditorSchedule,
    saveTimesheetAttendance,
    saveTimesheetSchedule,
  };
}
