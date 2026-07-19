import { formatPersonDisplayName, formatPlanningOperationCount } from "../../ui/formatters.js";

export function createShiftMasterBoardModule(dependencies = {}) {
  const {
    addMs,
    app,
    attributes,
    bindGenericModalCloseEvents,
    bindShiftCalendarEvents,
    buildBacklogItems,
    buildMesDocumentContract,
    calculateProjectProgress,
    candidate,
    canSelectMaster,
    center,
    className,
    day,
    DAY_MS,
    defaultUiState,
    deviationComment,
    deviationNotes,
    employeeId,
    enrichShiftMasterEmployeesWithTimesheet,
    escapeAttribute,
    escapeHtml,
    fallback,
    field,
    formatDate,
    formatDateTimeShort,
    formatReportNumber,
    fromDateInput,
    getDispatchFact,
    getDispatchFactStatusConfig,
    getBatch = () => null,
    getEarliestPlannedSlotStart,
    getGanttSlotStatusView,
    getGanttSlotViewModel,
    getMesFlowTransitionView,
    getMesStatusView,
    getPlanningOrderObjectLabel,
    getPlanningRouteLaborReadiness,
    getPlanningRouteQuantity,
    getPlanningShiftSlotTimeLabelForWindow,
    getPlanningWorkCenters,
    getProject,
    getProjectDeadlineState,
    getProjectDisplayName,
    getRoutePlanningContext,
    getRouteStepPlanningTask,
    getRouteStepQuantityForBatch,
    getRouteStepSelectedPlanningWorkCenterId,
    getShiftMasterAssignableEmployees,
    getShiftMasterAssignment,
    getShiftMasterBoardAccessContext,
    getShiftMasterBoardRiskLabel = (riskReason = "") => String(riskReason || ""),
    getShiftMasterEmployee,
    getShiftMasterOwnerProfileForWorkCenter,
    getShiftMasterProfile,
    getShiftMasterProfiles,
    getShiftMasterResourceOptions,
    getShiftRowId,
    getShiftRowWorkCenterId,
    getShiftSlotPlannedQuantity,
    getSlotDurationHours,
    getSlotGanttWorkCenterId = () => "",
    getSlotPlanningOrderId,
    getSlotRoute = () => null,
    getSlotRouteId,
    getSlotWarnings,
    getTimesheetAvailabilityForShiftMasterEmployee,
    getWorkCenter,
    getWorkCenterCapacity,
    getWorkingDurationBetween = (_workCenterId, start, end) => Math.max(0, new Date(end).getTime() - new Date(start).getTime()),
    getWorkOrderPlanningStatusValue,
    icon,
    iconName,
    id,
    input,
    isActive,
    isGanttSlotActive,
    isGanttSlotCompleted,
    isGanttSlotProblemStatus,
    isGanttSlotStatus,
    isManufacturingOutputReceiptSlot,
    isSmtOperationWorkCenter,
    isSmtStep,
    isWorkOrderPlanningCanceled,
    item,
    kind,
    mapLegacyWorkCenterId,
    message,
    month,
    name,
    normalizeBoardsPerPanel,
    normalizeDispatchExecutorCount,
    normalizeDispatchLaborMinutes,
    normalizePlainRecord,
    normalizePlanningLaborPositiveNumber,
    normalizeQuantity,
    normalizeUiTone = (tone = "neutral") => String(tone || "neutral"),
    normalizeShiftMasterBoardFocus,
    normalizeShiftMasterBoardLane,
    normalizeShiftMasterBoardRiskReason,
    normalizeShiftMasterBoardSwimlane,
    normalizeShiftMasterExecutorQuantity,
    normalizeShiftMasterExecutors,
    normalizeShiftMasterFactQuantity,
    note,
    notifySaveSuccess,
    onShiftMasterBoardAssignmentSaved = () => {},
    onShiftMasterBoardFactSaved = () => {},
    onShiftMasterBoardCarryoverCreated = () => {},
    onShiftMasterBoardCarryoverRemoved = () => {},
    operationName,
    patch,
    persistUiState,
    profile,
    rawStatus,
    recoverPlanningStateFromStorageIfRuntimeEmpty,
    render,
    renderUiActionButton,
    renderUiEmptyState,
    renderUiModalFrame,
    renderUiModalShell,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiPanel,
    renderUiPanelBody,
    renderUiPanelHead,
    renderUiSystemState,
    renderUiStatusToken,
    resource,
    resourceId,
    resourceLabel,
    routeStepRequiresManualPlanningLine,
    rowId,
    SHIFT_MASTER_BOARD_LANES,
    SHIFT_WORKBENCH_WINDOW_DAYS,
    shiftMasterProfileOwnsWorkCenter,
    slackMs,
    source,
    sourceId,
    startOfDay,
    stepId,
    style,
    taskLabel,
    tasks,
    text,
    title,
    toDate,
    toDateInput,
    transferSummary,
    type,
    value,
    version,
    windowsOverlap,
  } = dependencies;

  const ui = new Proxy({}, {
    get(_target, property) { return dependencies.getUi?.()?.[property]; },
    set(_target, property, value) { const state = dependencies.getUi?.(); if (state) state[property] = value; return true; },
  });
  const planningState = new Proxy({}, {
    get(_target, property) { return dependencies.getPlanningState?.()?.[property]; },
    set(_target, property, value) { const state = dependencies.getPlanningState?.(); if (state) state[property] = value; return true; },
  });
  const directoryState = new Proxy({}, {
    get(_target, property) { return dependencies.getDirectoryState?.()?.[property]; },
    set(_target, property, value) { const state = dependencies.getDirectoryState?.(); if (state) state[property] = value; return true; },
  });
  const formatShiftMasterPersonName = (value = "", fallback = "Исполнитель") => formatPersonDisplayName(value, { fallback });
  const renderShiftMasterPersonNameLines = (value = "", fallback = "Исполнитель") => {
    const displayName = formatShiftMasterPersonName(value, fallback);
    const [surname = displayName, ...givenNameParts] = String(displayName || "").trim().split(/\s+/).filter(Boolean);
    if (!givenNameParts.length) return escapeHtml(surname);
    return `${escapeHtml(surname)}<br>${escapeHtml(givenNameParts.join(" "))}`;
  };
  const formatShiftMasterDepartmentName = (value = "", maxLength = 34) => {
    const department = String(value || "Отдел не указан").trim() || "Отдел не указан";
    if (department.length <= maxLength) return department;
    return `${department.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
  };

function getShiftWorkOrderRows(options = {}) {
  const window = options.window || getDispatchWindow();
  const masterProfile = options.masterProfile || null;
  const onlyIssued = Boolean(options.onlyIssued);
  const stepById = new Map((planningState.routeSteps || []).map((step) => [step.id, step]));
  const rows = (planningState.slots || [])
    .filter((slot) => isSlotInsideDispatchWindow(slot, window))
    .map((slot) => {
      const step = stepById.get(slot.routeStepId) || null;
      const route = getSlotRoute(slot);
      const routeId = route?.id || getSlotRouteId(slot, planningState);
      const workCenterId = getShiftRowWorkCenterId(slot, step);
      if (masterProfile && !shiftMasterProfileOwnsWorkCenter(masterProfile, workCenterId)) return null;
      const workCenter = getWorkCenter(workCenterId) || getWorkCenter(slot.workCenterId) || null;
      const task = route && step ? getRouteStepPlanningTask(route, step) : null;
      const dateKey = toDateInput(window.start || slot.plannedStart || slot.plannedEnd || new Date());
      const shiftRowId = getShiftRowId(slot, dateKey);
      const assignment = getShiftMasterAssignment(shiftRowId) || getShiftMasterAssignment(slot.id) || null;
      if (onlyIssued && assignment?.status !== "issued") return null;
      const plannedQuantity = getShiftSlotPlannedQuantity(slot, window);
      const assignmentExecutors = normalizeShiftMasterExecutors(assignment?.executors || [], {
        employeeId: assignment?.employeeId || "",
        quantity: plannedQuantity,
      });
      const resourceOptions = getShiftMasterResourceOptions(workCenterId, assignment?.resourceId || slot.resourceId || step?.resourceId || "");
      const defaultResource = resourceOptions.find((resource) => resource.id === (assignment?.resourceId || slot.resourceId || step?.resourceId))
        || resourceOptions[0]
        || null;
      const ownerProfile = getShiftMasterOwnerProfileForWorkCenter(workCenterId, assignment, masterProfile);
      const employees = enrichShiftMasterEmployeesWithTimesheet(getShiftMasterAssignableEmployees(ownerProfile, workCenterId), dateKey);
      const availableEmployees = employees.filter((employee) => employee.availability?.isAvailable);
      const unavailableEmployees = employees.filter((employee) => !employee.availability?.isAvailable);
      const timesheetAvailableHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.hours || 0), 0);
      const timesheetOvertimeHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.overtime || 0), 0);
      const defaultEmployeeId = assignment?.employeeId || assignmentExecutors[0]?.employeeId || "";
      const persistedEmployee = employees.find((employee) => employee.id === defaultEmployeeId)
        || (defaultEmployeeId ? getShiftMasterEmployee(defaultEmployeeId) : null)
        || null;
      const defaultEmployee = persistedEmployee
        || availableEmployees[0]
        || null;
      const executors = assignmentExecutors.map((executor, index) => {
        const person = getShiftMasterEmployee(executor.employeeId)
          || employees.find((employee) => employee.id === executor.employeeId)
          || null;
        const availability = person?.availability
          || (person ? getTimesheetAvailabilityForShiftMasterEmployee(person, dateKey, index) : null);
        return {
          ...executor,
          id: executor.id || `executor-${index + 1}`,
          employeeLabel: person?.name || executor.employeeId || "Исполнитель не выбран",
          employeeRole: person?.role || "",
          availability,
        };
      });
      const executorQuantity = executors.reduce((sum, executor) => sum + normalizeShiftMasterExecutorQuantity(executor.quantity), 0);
      const isAssigned = Boolean(assignment?.resourceId || executors.length || assignment?.note);
      const masterActualQuantity = normalizeShiftMasterFactQuantity(assignment?.actualQuantity);
      const masterDefectQuantity = normalizeShiftMasterFactQuantity(assignment?.defectQuantity);
      const masterLaborMinutes = normalizeDispatchLaborMinutes(assignment?.laborMinutes);
      const masterExecutorCount = normalizeDispatchExecutorCount(assignment?.executorCount)
        || executors.length
        || (masterLaborMinutes > 0 ? 1 : 0);
      const masterFactUpdatedAt = String(assignment?.factUpdatedAt || "");
      const masterFactComment = String(assignment?.factComment || "");
      const masterFactDelta = masterActualQuantity - plannedQuantity;
      const masterFactStatus = masterDefectQuantity > 0
        ? "problem"
        : masterFactUpdatedAt && masterActualQuantity >= plannedQuantity
          ? "accepted"
          : masterFactUpdatedAt && masterActualQuantity > 0
            ? "partial"
            : "not_reported";
      const boardsPerPanel = normalizeBoardsPerPanel(slot.boardsPerPanel || step?.boardsPerPanel || 1, 1);
      const masterPanelQuantity = masterActualQuantity > 0
        ? Math.max(1, Math.ceil(masterActualQuantity / boardsPerPanel))
        : 0;
      const masterMinutesPerUnit = masterActualQuantity > 0 && masterLaborMinutes > 0
        ? masterLaborMinutes / masterActualQuantity
        : 0;
      const masterMinutesPerPanel = masterPanelQuantity > 0 && masterLaborMinutes > 0
        ? masterLaborMinutes / masterPanelQuantity
        : 0;
      const fact = getDispatchFact(shiftRowId) || getDispatchFact(slot.id) || null;
      const dispatchArchived = Boolean(fact && (
        fact.updatedAt
        || normalizeShiftMasterFactQuantity(fact.actualQuantity) > 0
        || normalizeShiftMasterFactQuantity(fact.defectQuantity) > 0
        || normalizeDispatchLaborMinutes(fact.laborMinutes) > 0
        || normalizeDispatchExecutorCount(fact.executorCount) > 0
        || (fact.status && fact.status !== "not_reported")
      ));
      const actualQuantity = dispatchArchived
        ? normalizeShiftMasterFactQuantity(fact?.actualQuantity)
        : masterActualQuantity;
      const defectQuantity = dispatchArchived
        ? normalizeShiftMasterFactQuantity(fact?.defectQuantity)
        : masterDefectQuantity;
      const laborMinutes = dispatchArchived
        ? normalizeDispatchLaborMinutes(fact?.laborMinutes)
        : masterLaborMinutes;
      const factExecutorCount = dispatchArchived
        ? normalizeDispatchExecutorCount(fact?.executorCount)
        : masterExecutorCount;
      const deltaQuantity = actualQuantity - plannedQuantity;
      const factStatus = getDispatchFactStatusConfig(dispatchArchived
        ? fact?.status || "accepted"
        : masterFactStatus);
      const panelQuantity = actualQuantity > 0
        ? Math.max(1, Math.ceil(actualQuantity / boardsPerPanel))
        : 0;
      const minutesPerUnit = actualQuantity > 0 && laborMinutes > 0 ? laborMinutes / actualQuantity : 0;
      const minutesPerPanel = panelQuantity > 0 && laborMinutes > 0 ? laborMinutes / panelQuantity : 0;
      const shiftStatusView = getMesStatusView("shiftAssignment", assignment?.status || "draft", {
        label: assignment?.status === "issued" ? "Выпущен" : "План смены",
        tone: assignment?.status === "issued" ? "ok" : "neutral",
      });
      const factStatusView = getMesStatusView("dispatchFact", factStatus.value, {
        label: factStatus.label,
        tone: factStatus.tone,
      });
      const slotView = getGanttSlotViewModel(slot, step, route);
      const documentNumber = [
        "СЗН",
        dateKey.replaceAll("-", ""),
        workCenter?.code || workCenterId || "WC",
        String(slot.id || "").slice(-4).toUpperCase(),
      ].filter(Boolean).join("-");

      return {
        id: shiftRowId,
        slotId: slot.id,
        slotDocumentContract: slotView.document,
        documentContract: buildMesDocumentContract("shiftWorkOrder", {
          id: shiftRowId,
          routeId,
          planningOrderId: getSlotPlanningOrderId(slot, routeId),
          sourceId: slot.id,
        }),
        factDocumentContract: buildMesDocumentContract("dispatchFact", {
          id: shiftRowId,
          routeId,
          planningOrderId: getSlotPlanningOrderId(slot, routeId),
          sourceId: shiftRowId,
        }),
        transitionFromPlanning: getMesFlowTransitionView("ganttSlotToShiftWorkOrder"),
        transitionIssue: getMesFlowTransitionView("shiftWorkOrderIssue"),
        transitionToFact: getMesFlowTransitionView("shiftWorkOrderToDispatchFact"),
        slot,
        step,
        route,
        task,
        dateKey,
        documentNumber,
        routeName: route?.name || "Маршрутная карта не найдена",
        orderLabel: getPlanningOrderObjectLabel(route) || route?.name || "Заказ-наряд",
        taskLabel: task ? [task.number, task.title].filter(Boolean).join(" · ") : step?.specTaskName || "Объект маршрута",
        operationName: slot.operationName || step?.operationName || "Операция",
        workCenterId,
        workCenter,
        workCenterLabel: workCenter?.name || workCenterId || "Участок не задан",
        resourceOptions,
        resourceId: assignment?.resourceId || defaultResource?.id || "",
        resourceLabel: defaultResource?.name || "Ресурс не назначен",
        employees,
        availableEmployees,
        unavailableEmployees,
        timesheetDateKey: dateKey,
        timesheetAvailableCount: availableEmployees.length,
        timesheetUnavailableCount: unavailableEmployees.length,
        timesheetAvailableHours,
        timesheetOvertimeHours,
        executors,
        executorQuantity,
        executorCount: executors.length,
        isAssigned,
        employeeId: assignment?.employeeId || executors[0]?.employeeId || defaultEmployee?.id || "",
        employeeLabel: executors[0]?.employeeLabel || (defaultEmployee ? defaultEmployee.name : "Исполнитель не назначен"),
        masterProfile: ownerProfile,
        assignment,
        assignmentStatus: shiftStatusView,
        isIssued: assignment?.status === "issued",
        issuedAt: assignment?.issuedAt || "",
        note: assignment?.note || "",
        plannedQuantity,
        actualQuantity,
        defectQuantity,
        laborMinutes,
        factExecutorCount,
        boardsPerPanel,
        panelQuantity,
        minutesPerUnit,
        minutesPerPanel,
        dispatchArchived,
        deltaQuantity,
        completion: plannedQuantity > 0 ? Math.max(0, Math.min(140, Math.round(actualQuantity / plannedQuantity * 100))) : 0,
        fact,
        factStatus,
        factStatusView,
        masterActualQuantity,
        masterDefectQuantity,
        masterLaborMinutes,
        masterExecutorCount,
        masterMinutesPerUnit,
        masterMinutesPerPanel,
        masterPanelQuantity,
        masterFactDelta,
        masterFactUpdatedAt,
        masterFactComment,
        masterFactStatus,
        masterFactCompletion: plannedQuantity > 0 ? Math.max(0, Math.min(140, Math.round(masterActualQuantity / plannedQuantity * 100))) : 0,
        unit: slot.unit || task?.unit || "шт.",
        rawStatus: slotView.status.value || "planned",
        slotStatus: slotView.status,
        timeLabel: getPlanningShiftSlotTimeLabelForWindow(slot, window),
        startsAt: toDate(slot.plannedStart),
        endsAt: toDate(slot.plannedEnd),
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.startsAt - right.startsAt
      || String(left.workCenterLabel || "").localeCompare(String(right.workCenterLabel || ""), "ru")
      || String(left.operationName || "").localeCompare(String(right.operationName || ""), "ru")
    ));

  return rows;
}

function getShiftMasterBoardSlotRows(window = getShiftWorkbenchWindow(), masterProfile = null) {
  const startMs = toDate(window?.start || new Date()).getTime();
  const endMs = toDate(window?.end || addMs(window?.start || new Date(), DAY_MS)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const stepById = new Map((planningState.routeSteps || []).map((step) => [step.id, step]));
  return (planningState.slots || [])
    .filter((slot) => {
      const slotStart = toDate(slot?.plannedStart || "").getTime();
      const slotEnd = toDate(slot?.plannedEnd || "").getTime();
      return Number.isFinite(slotStart)
        && Number.isFinite(slotEnd)
        && slotStart < endMs
        && slotEnd > startMs;
    })
    .map((slot) => {
      const step = stepById.get(slot.routeStepId) || null;
      const route = getSlotRoute(slot);
      const routeId = route?.id || getSlotRouteId(slot, planningState);
      const workCenterId = getShiftRowWorkCenterId(slot, step) || mapLegacyWorkCenterId(slot.workCenterId || step?.workCenterId || "");
      if (masterProfile && !shiftMasterProfileOwnsWorkCenter(masterProfile, workCenterId)) return null;
      const workCenter = getWorkCenter(workCenterId) || getWorkCenter(slot.workCenterId) || null;
      const task = route && step ? getRouteStepPlanningTask(route, step) : null;
      const dateKey = toDateInput(window.start || slot.plannedStart || new Date());
      const shiftRowId = getShiftRowId(slot, dateKey);
      const plannedQuantity = getShiftSlotPlannedQuantity(slot, window);
      const resourceOptions = getShiftMasterResourceOptions(workCenterId, slot.resourceId || step?.resourceId || "");
      const defaultResource = resourceOptions.find((resource) => resource.id === (slot.resourceId || step?.resourceId))
        || resourceOptions[0]
        || null;
      const ownerProfile = getShiftMasterOwnerProfileForWorkCenter(workCenterId, null, masterProfile);
      const employees = enrichShiftMasterEmployeesWithTimesheet(getShiftMasterAssignableEmployees(ownerProfile, workCenterId), dateKey);
      const availableEmployees = employees.filter((employee) => employee.availability?.isAvailable);
      const unavailableEmployees = employees.filter((employee) => !employee.availability?.isAvailable);
      const timesheetAvailableHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.hours || 0), 0);
      const timesheetOvertimeHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.overtime || 0), 0);
      const boardsPerPanel = normalizeBoardsPerPanel(slot.boardsPerPanel || step?.boardsPerPanel || 1, 1);
      const slotView = getGanttSlotViewModel(slot, step, route);
      const documentNumber = [
        "СЗН",
        dateKey.replaceAll("-", ""),
        workCenter?.code || workCenterId || "WC",
        String(slot.id || "").slice(-4).toUpperCase(),
      ].filter(Boolean).join("-");

      return {
        id: shiftRowId,
        slotId: slot.id,
        slotDocumentContract: slotView.document,
        documentContract: buildMesDocumentContract("shiftWorkOrder", {
          id: shiftRowId,
          routeId,
          planningOrderId: getSlotPlanningOrderId(slot, routeId),
          sourceId: slot.id,
        }),
        factDocumentContract: buildMesDocumentContract("dispatchFact", {
          id: shiftRowId,
          routeId,
          planningOrderId: getSlotPlanningOrderId(slot, routeId),
          sourceId: shiftRowId,
        }),
        transitionFromPlanning: getMesFlowTransitionView("ganttSlotToShiftWorkOrder"),
        transitionIssue: getMesFlowTransitionView("shiftWorkOrderIssue"),
        transitionToFact: getMesFlowTransitionView("shiftWorkOrderToDispatchFact"),
        slot,
        step,
        route,
        task,
        dateKey,
        documentNumber,
        routeName: route?.name || "Маршрутная карта не найдена",
        orderLabel: getPlanningOrderObjectLabel(route) || route?.name || "Заказ-наряд",
        taskLabel: task ? [task.number, task.title].filter(Boolean).join(" · ") : step?.specTaskName || "Объект маршрута",
        operationName: slot.operationName || step?.operationName || "Операция",
        workCenterId,
        workCenter,
        workCenterLabel: workCenter?.name || workCenterId || "Участок не задан",
        resourceOptions,
        resourceId: defaultResource?.id || slot.resourceId || step?.resourceId || "",
        resourceLabel: defaultResource?.name || "Ресурс не назначен",
        employees,
        availableEmployees,
        unavailableEmployees,
        timesheetDateKey: dateKey,
        timesheetAvailableCount: availableEmployees.length,
        timesheetUnavailableCount: unavailableEmployees.length,
        timesheetAvailableHours,
        timesheetOvertimeHours,
        executors: [],
        executorQuantity: 0,
        executorCount: 0,
        isAssigned: false,
        employeeId: availableEmployees[0]?.id || employees[0]?.id || "",
        employeeLabel: availableEmployees[0]?.name || employees[0]?.name || "Исполнитель не назначен",
        masterProfile: ownerProfile,
        assignment: null,
        isIssued: false,
        issuedAt: "",
        note: "",
        plannedQuantity,
        actualQuantity: 0,
        defectQuantity: 0,
        laborMinutes: 0,
        factExecutorCount: 0,
        boardsPerPanel,
        panelQuantity: 0,
        minutesPerUnit: 0,
        minutesPerPanel: 0,
        dispatchArchived: false,
        deltaQuantity: -plannedQuantity,
        fact: null,
        factStatus: getDispatchFactStatusConfig("not_reported"),
        factStatusView: getMesStatusView("dispatchFact", "not_reported", { label: "Факт не внесен", tone: "neutral" }),
        masterActualQuantity: 0,
        masterDefectQuantity: 0,
        masterLaborMinutes: 0,
        masterExecutorCount: 0,
        masterMinutesPerUnit: 0,
        masterMinutesPerPanel: 0,
        masterPanelQuantity: 0,
        masterFactDelta: -plannedQuantity,
        masterFactUpdatedAt: "",
        masterFactComment: "",
        masterFactStatus: "not_reported",
        masterFactCompletion: 0,
        unit: slot.unit || task?.unit || "шт.",
        rawStatus: slotView.status.value || "planned",
        slotStatus: slotView.status,
        timeLabel: getPlanningShiftSlotTimeLabelForWindow(slot, window),
        startsAt: toDate(slot.plannedStart),
        endsAt: toDate(slot.plannedEnd),
        isBoardSlotSource: true,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.startsAt - right.startsAt
      || String(left.workCenterLabel || "").localeCompare(String(right.workCenterLabel || ""), "ru")
      || String(left.operationName || "").localeCompare(String(right.operationName || ""), "ru")
    ));
}

function groupShiftRowsByWorkCenter(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.workCenterId || "unknown";
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        workCenter: row.workCenter,
        label: row.workCenterLabel,
        rows: [],
        plannedQuantity: 0,
        actualQuantity: 0,
        issuedCount: 0,
      });
    }
    const group = groups.get(key);
    group.rows.push(row);
    group.plannedQuantity += row.plannedQuantity;
    group.actualQuantity += row.actualQuantity;
    if (row.isIssued) group.issuedCount += 1;
  });
  return [...groups.values()].sort((left, right) => (
    String(left.label || "").localeCompare(String(right.label || ""), "ru")
  ));
}

function groupShiftRowsByOrder(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.documentContract?.planningOrderId
      || row.route?.id
      || row.routeId
      || row.orderLabel
      || "unknown";
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: row.orderLabel || row.routeName || "Заказ-наряд",
        routeName: row.routeName || "",
        rows: [],
        workCenters: new Set(),
        masters: new Set(),
        plannedQuantity: 0,
        issuedCount: 0,
        assignedCount: 0,
      });
    }
    const group = groups.get(key);
    group.rows.push(row);
    if (row.workCenterLabel) group.workCenters.add(row.workCenterLabel);
    if (row.masterProfile?.name) group.masters.add(row.masterProfile.name);
    group.plannedQuantity += row.plannedQuantity;
    if (row.isIssued) group.issuedCount += 1;
    if (row.isAssigned) group.assignedCount += 1;
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      workCenterCount: group.workCenters.size,
      masterCount: group.masters.size,
    }))
    .sort((left, right) => (
      String(left.label || "").localeCompare(String(right.label || ""), "ru")
      || String(left.routeName || "").localeCompare(String(right.routeName || ""), "ru")
    ));
}

function getDispatchWindow() {
  const fallbackStart = getEarliestPlannedSlotStart() || ui.now || new Date();
  const anchor = fromDateInput(ui.windowStart || toDateInput(fallbackStart));
  let start = startOfDay(anchor);
  if (fallbackStart) {
    const defaultEnd = addMs(start, DAY_MS);
    const hasSlotsOnDefaultDate = (planningState.slots || []).some((slot) => (
      slot?.plannedStart && slot?.plannedEnd && windowsOverlap(start, defaultEnd, slot.plannedStart, slot.plannedEnd)
    ));
    const earliestPlannedDay = startOfDay(fallbackStart);
    // A preserved window from an older plan must not make a newly published
    // work order look absent. Keep a deliberate future date, but move an
    // outdated empty date forward to the first available planned operation.
    const isOutdatedEmptyWindow = start.getTime() < earliestPlannedDay.getTime();
    if (!hasSlotsOnDefaultDate && (ui.windowStart === defaultUiState.windowStart || isOutdatedEmptyWindow)) {
      start = earliestPlannedDay;
    }
  }
  const end = addMs(start, DAY_MS);
  return {
    start,
    end,
    label: `${formatDate(start)} · 1 смена`,
  };
}

function getShiftWorkbenchWindow(dayCount = SHIFT_WORKBENCH_WINDOW_DAYS) {
  const base = getDispatchWindow();
  const days = Math.max(1, Math.round(Number(dayCount) || 1));
  const end = addMs(base.start, DAY_MS * days);
  const lastDay = addMs(end, -DAY_MS);
  return {
    start: base.start,
    end,
    days,
    label: days > 1
      ? `${formatDate(base.start)}-${formatDate(lastDay)}`
      : base.label,
  };
}

function getShiftWindowDayCount(window) {
  if (Number.isFinite(window?.days)) return Math.max(1, Math.round(window.days));
  return Math.max(1, Math.round((window.end.getTime() - window.start.getTime()) / DAY_MS));
}

function renderShiftWindowRuler(window) {
  const days = getShiftWindowDayCount(window);
  const marks = Array.from({ length: days }, (_, index) => addMs(window.start, DAY_MS * index));
  return `
    <div class="dispatch-window-ruler is-days" style="--dispatch-ruler-days:${days};">
      ${marks.map((mark) => `
        <span>${mark.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</span>
      `).join("")}
    </div>
  `;
}

function normalizeDateInput(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = raw.includes("T") ? toDate(raw) : toDate(fromDateInput(raw));
  return Number.isNaN(date.getTime()) ? "" : toDateInput(date);
}

function setShiftWorkbenchDate(value = "", options = {}) {
  const nextDate = normalizeDateInput(value);
  if (!nextDate) return false;
  ui.windowStart = nextDate;
  ui.shiftMasterBoardSelectedSlotId = String(options.selectedSlotId || "").trim();
  ui.activeDispatchSlotId = "";
  persistUiState();
  render();
  return true;
}

function moveShiftWorkbenchDate(dayDelta = 0) {
  const delta = Math.round(Number(dayDelta) || 0);
  if (!delta) return false;
  const window = getShiftWorkbenchWindow();
  return setShiftWorkbenchDate(toDateInput(addMs(startOfDay(window.start), DAY_MS * delta)));
}

function setShiftWorkbenchToday() {
  return setShiftWorkbenchDate(toDateInput(startOfDay(ui.now || new Date())));
}

function renderShiftCalendarControl(window, options = {}) {
  const inputId = options.inputId || "shift-calendar-date";
  const label = options.label || "Дата смены";
  return `
    <div class="shift-calendar-control" data-shift-calendar-control data-ui-action-scope="domain:calendar">
      <button class="icon-button shift-calendar-step ui-action-button" data-shift-calendar-step="-1" type="button" title="Предыдущий день" aria-label="Предыдущий день">${icon("arrowLeft")}</button>
      <label class="shift-calendar-field" for="${escapeAttribute(inputId)}">
        <input id="${escapeAttribute(inputId)}" data-shift-calendar-date type="date" value="${escapeAttribute(toDateInput(window.start))}" aria-label="${escapeAttribute(label)}" />
      </label>
      <button class="icon-button shift-calendar-open ui-action-button" data-shift-calendar-open="${escapeAttribute(inputId)}" type="button" title="Открыть календарь" aria-label="Открыть календарь">${icon("calendar")}</button>
      <button class="icon-button shift-calendar-step ui-action-button" data-shift-calendar-step="1" type="button" title="Следующий день" aria-label="Следующий день">${icon("arrowRight")}</button>
      <button class="secondary-button shift-calendar-today ui-action-button" data-shift-calendar-today type="button">${icon("today")}<span>Сегодня</span></button>
      <span class="shift-calendar-range" title="Окно сменных заказ-нарядов">${escapeHtml(window.label)}</span>
    </div>
  `;
}

function isSlotInsideDispatchWindow(slot, window) {
  if (!slot?.plannedStart || !slot?.plannedEnd) return false;
  return windowsOverlap(window.start, window.end, slot.plannedStart, slot.plannedEnd);
}

function getDispatchSlotTone(slot = {}) {
  if (isGanttSlotCompleted(slot)) return "ok";
  if (isGanttSlotProblemStatus(slot)) return "critical";
  if (isGanttSlotActive(slot)) return "active";
  if (isGanttSlotStatus(slot, "paused")) return "warning";
  return "neutral";
}

function getDispatchSlotWindowStyle(slot, window) {
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  const totalMs = Math.max(1, endMs - startMs);
  const slotStart = Math.max(startMs, toDate(slot.plannedStart).getTime());
  const slotEnd = Math.min(endMs, toDate(slot.plannedEnd).getTime());
  const left = Math.max(0, Math.min(100, (slotStart - startMs) / totalMs * 100));
  const width = Math.max(2, Math.min(100 - left, (slotEnd - slotStart) / totalMs * 100));
  return `--slot-left:${Math.round(left * 10) / 10}%; --slot-width:${Math.round(width * 10) / 10}%;`;
}

function buildDispatchWorkCenterRows(window, slotWarningMap) {
  const shiftSlots = (planningState.slots || []).filter((slot) => isSlotInsideDispatchWindow(slot, window));
  const now = toDate(ui.now || new Date());

  return getPlanningWorkCenters().map((center) => {
    const slots = shiftSlots
      .filter((slot) => {
        const slotWorkCenterId = mapLegacyWorkCenterId(getSlotGanttWorkCenterId(slot) || slot.workCenterId || "");
        return slotWorkCenterId === center.id || slotMatchesRouteWorkCenterId(slot, center.id);
      })
      .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart));
    const activeSlots = slots.filter((slot) => (
      ["in_progress", "problem", "overdue"].includes(getGanttSlotStatusView(slot).value)
      || (toDate(slot.plannedStart) <= now && toDate(slot.plannedEnd) >= now && !isGanttSlotCompleted(slot))
    ));
    const warnings = slots.reduce((sum, slot) => sum + (slotWarningMap[slot.id]?.length || 0), 0);
    const hours = slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0);
    const capacity = Math.max(1, getWorkCenterCapacity(center.id));
    const utilization = Math.max(0, Math.min(100, Math.round(hours / Math.max(1, 12 * capacity) * 100)));

    return {
      center,
      slots,
      activeSlots,
      warnings,
      hours,
      capacity,
      utilization,
      tone: warnings ? "warning" : activeSlots.length ? "active" : slots.length ? "ok" : "neutral",
    };
  }).filter((row) => row.slots.length || row.center.id === "D1")
    .sort((left, right) => (
      right.warnings - left.warnings
      || right.activeSlots.length - left.activeSlots.length
      || right.hours - left.hours
      || String(left.center.name || "").localeCompare(String(right.center.name || ""), "ru")
    ));
}

function buildDispatchRouteRows(warnings, window) {
  return (planningState.routes || [])
    .filter((route) => !isWorkOrderPlanningCanceled(route))
    .map((route) => {
      const project = getRoutePlanningContext(route);
      const slots = getRouteSlots(route.id);
      const slotIds = new Set(slots.map((slot) => slot.id));
      const routeWarnings = warnings.filter((warning) => (
        getWarningProductionId(warning) === project?.id
        || (warning.slotIds || []).some((slotId) => slotIds.has(slotId))
      ));
      const critical = routeWarnings.filter((warning) => warning.severity === "critical").length;
      const progress = project
        ? calculateProjectProgress(project, planningState)
        : slots.length ? Math.round(slots.filter((slot) => isGanttSlotCompleted(slot)).length / slots.length * 100) : 0;
      const dueState = project ? getProjectDeadlineState(project) : { tone: "neutral", label: "срок не задан", slackMs: null };
      const nextSlot = slots
        .filter((slot) => toDate(slot.plannedEnd) >= window.start)
        .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0] || null;
      const shiftSlots = slots.filter((slot) => isSlotInsideDispatchWindow(slot, window));
      const tone = critical
        ? "critical"
        : routeWarnings.length || dueState.tone === "warning"
          ? "warning"
          : dueState.tone === "critical"
            ? "critical"
            : progress >= 80
              ? "ok"
              : shiftSlots.length
                ? "active"
                : "neutral";

      return {
        route,
        project,
        slots,
        shiftSlots,
        warnings: routeWarnings.length,
        critical,
        progress,
        dueState,
        nextSlot,
        tone,
        statusLabel: getWorkOrderPlanningStatusValue(route) === "scheduled" ? "На Ганте" : "В плане",
      };
    })
    .sort((left, right) => (
      right.critical - left.critical
      || right.warnings - left.warnings
      || Number(left.dueState.slackMs ?? Number.MAX_SAFE_INTEGER) - Number(right.dueState.slackMs ?? Number.MAX_SAFE_INTEGER)
      || toDate(left.nextSlot?.plannedStart || "9999-12-31") - toDate(right.nextSlot?.plannedStart || "9999-12-31")
    ));
}

function buildDispatchSignals(warnings, backlog, window) {
  const warningSignals = warnings
    .sort((left, right) => Number(right.severity === "critical") - Number(left.severity === "critical"))
    .slice(0, 5)
    .map((warning) => ({
      tone: warning.severity === "critical" ? "critical" : "warning",
      title: formatWarningType(warning.type),
      meta: getProjectDisplayName(getProject(getWarningProductionId(warning))) || "Производство",
      text: warning.message,
    }));

  const backlogSignals = backlog.slice(0, 4).map((item) => ({
    tone: item.requiresPlanningLine ? "warning" : "neutral",
    title: "Очередь",
    meta: getProjectDisplayName(item.project) || item.project?.name || "Изделие",
    text: `${item.routeStep?.operationName || "Операция"} · ${item.workCenter?.name || "отдел не выбран"}`,
  }));

  const receiptSignals = (planningState.slots || [])
    .filter((slot) => isManufacturingOutputReceiptSlot(slot))
    .filter((slot) => isSlotInsideDispatchWindow(slot, window) || toDate(slot.plannedEnd) >= window.start)
    .sort((left, right) => toDate(left.plannedEnd) - toDate(right.plannedEnd))
    .slice(0, 4)
    .map((slot) => ({
      tone: isGanttSlotCompleted(slot) ? "ok" : "active",
      title: "Выпуск",
      meta: formatDateTimeShort(slot.plannedEnd),
      text: `${slot.operationName || "Поступление из производства"} · ${Number(slot.quantity || 0).toLocaleString("ru-RU")} шт.`,
    }));

  return [...warningSignals, ...backlogSignals, ...receiptSignals].slice(0, 10);
}

function getDispatchCheckpointReferenceTime(window, shiftSlots = []) {
  const now = toDate(ui.now || new Date());
  if (now >= window.start && now <= window.end) return now;

  const nextPlannedStart = [...shiftSlots]
    .filter((slot) => !isGanttSlotCompleted(slot))
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0]?.plannedStart;

  return nextPlannedStart ? toDate(nextPlannedStart) : addMs(window.start, 8 * 60 * 60 * 1000);
}

function buildDispatchCheckpoints(data) {
  const hourMs = 60 * 60 * 1000;
  const shiftStart = addMs(data.window.start, 8 * hourMs);
  const shiftMiddle = addMs(data.window.start, 12 * hourMs);
  const riskTime = addMs(data.window.start, 16 * hourMs);
  const shiftClose = addMs(data.window.start, 19.5 * hourMs);
  const referenceTime = getDispatchCheckpointReferenceTime(data.window, data.shiftSlots);
  const referenceMs = referenceTime.getTime();
  const startedStatuses = new Set(["in_progress", "completed", "problem", "overdue"]);
  const startSlots = data.shiftSlots.filter((slot) => {
    const start = toDate(slot.plannedStart);
    return start >= shiftStart && start < addMs(shiftStart, 2 * hourMs);
  });
  const startedSlots = startSlots.filter((slot) => startedStatuses.has(getGanttSlotStatusView(slot).value));
  const flowSlots = data.shiftSlots.filter((slot) => (
    toDate(slot.plannedStart) <= shiftMiddle
    && toDate(slot.plannedEnd) >= shiftMiddle
    && !isGanttSlotCompleted(slot)
  ));
  const endRiskSlots = data.shiftSlots.filter((slot) => (
    toDate(slot.plannedEnd) >= riskTime
    && toDate(slot.plannedEnd) <= addMs(data.window.start, 20 * hourMs)
    && !isGanttSlotCompleted(slot)
  ));
  const openSlots = data.shiftSlots.filter((slot) => !isGanttSlotCompleted(slot));
  const outputSlotsInWindow = data.outputReceiptSlots.filter((slot) => isSlotInsideDispatchWindow(slot, data.window));
  const completedOutputSlots = outputSlotsInWindow.filter((slot) => isGanttSlotCompleted(slot));
  const checkpoints = [
    {
      id: "prepare",
      at: addMs(data.window.start, 7.75 * hourMs),
      time: "07:45",
      title: "Готовность",
      value: `${data.shiftSlots.length.toLocaleString("ru-RU")} оп.`,
      caption: `${data.routeRows.length.toLocaleString("ru-RU")} маршрут`,
      tone: data.criticalWarnings.length ? "critical" : data.warnings.length ? "warning" : "ok",
      checks: [
        { label: "План в окне", value: `${data.shiftSlots.length.toLocaleString("ru-RU")} операций` },
        { label: "Сигналы Ганта", value: `${data.warnings.length.toLocaleString("ru-RU")} всего` },
        { label: "Участки", value: `${data.workCenterRows.length.toLocaleString("ru-RU")} в срезе` },
      ],
    },
    {
      id: "start",
      at: shiftStart,
      time: "08:00",
      title: "Старт",
      value: `${startedSlots.length}/${startSlots.length || 0}`,
      caption: "запуски",
      tone: startSlots.length && startedSlots.length < startSlots.length ? "warning" : startSlots.length ? "ok" : "neutral",
      checks: [
        { label: "К старту", value: `${startSlots.length.toLocaleString("ru-RU")} операций` },
        { label: "Подтверждено", value: `${startedSlots.length.toLocaleString("ru-RU")} операций` },
        { label: "Без старта", value: `${Math.max(0, startSlots.length - startedSlots.length).toLocaleString("ru-RU")}` },
      ],
    },
    {
      id: "flow",
      at: shiftMiddle,
      time: "12:00",
      title: "Поток",
      value: `${flowSlots.length.toLocaleString("ru-RU")} в работе`,
      caption: `${data.backlog.length.toLocaleString("ru-RU")} очередь`,
      tone: data.backlog.length ? "warning" : flowSlots.length ? "active" : "neutral",
      checks: [
        { label: "Операции на полдень", value: `${flowSlots.length.toLocaleString("ru-RU")}` },
        { label: "Очередь размещения", value: `${data.backlog.length.toLocaleString("ru-RU")}` },
        { label: "Сигналы участков", value: `${data.workCenterRows.reduce((sum, row) => sum + row.warnings, 0).toLocaleString("ru-RU")}` },
      ],
    },
    {
      id: "risk",
      at: riskTime,
      time: "16:00",
      title: "Финиш",
      value: `${endRiskSlots.length.toLocaleString("ru-RU")} оп.`,
      caption: `${data.criticalWarnings.length.toLocaleString("ru-RU")} крит.`,
      tone: data.criticalWarnings.length ? "critical" : endRiskSlots.length || data.warnings.length ? "warning" : "ok",
      checks: [
        { label: "Финиш до вечера", value: `${endRiskSlots.length.toLocaleString("ru-RU")} операций` },
        { label: "Критичные сигналы", value: `${data.criticalWarnings.length.toLocaleString("ru-RU")}` },
        { label: "Маршруты с риском", value: `${data.routeRows.filter((row) => row.tone === "critical" || row.tone === "warning").length.toLocaleString("ru-RU")}` },
      ],
    },
    {
      id: "close",
      at: shiftClose,
      time: "19:30",
      title: "Закрытие",
      value: `${completedOutputSlots.length}/${outputSlotsInWindow.length || 0}`,
      caption: "приемка",
      tone: outputSlotsInWindow.length && completedOutputSlots.length < outputSlotsInWindow.length ? "warning" : outputSlotsInWindow.length ? "ok" : "neutral",
      checks: [
        { label: "Приемка выпуска", value: `${completedOutputSlots.length}/${outputSlotsInWindow.length || 0}` },
        { label: "Незавершенка", value: `${openSlots.length.toLocaleString("ru-RU")} операций` },
        { label: "Передача смены", value: `${data.signals.length.toLocaleString("ru-RU")} сигналов` },
      ],
    },
  ];
  const activeIndex = Math.max(0, checkpoints.findIndex((checkpoint, index) => {
    const next = checkpoints[index + 1];
    return referenceMs >= checkpoint.at.getTime() && (!next || referenceMs < next.at.getTime());
  }));

  return checkpoints.map((checkpoint, index) => ({
    ...checkpoint,
    isActive: index === activeIndex,
  }));
}

function buildDispatchBoardData() {
  const window = getDispatchWindow();
  const warningsContext = getSlotWarnings(planningState);
  const warnings = warningsContext.warnings || [];
  const criticalWarnings = warnings.filter((warning) => warning.severity === "critical");
  const shiftSlots = (planningState.slots || []).filter((slot) => isSlotInsideDispatchWindow(slot, window));
  const backlog = buildBacklogItems(80);
  const routeRows = buildDispatchRouteRows(warnings, window);
  const workCenterRows = buildDispatchWorkCenterRows(window, warningsContext.slotWarningMap || {});
  const outputReceiptSlots = (planningState.slots || []).filter((slot) => isManufacturingOutputReceiptSlot(slot));
  const completedOutputReceipt = outputReceiptSlots.filter((slot) => isGanttSlotCompleted(slot)).length;
  const plannedHours = shiftSlots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0);

  const data = {
    window,
    warnings,
    criticalWarnings,
    shiftSlots,
    backlog,
    routeRows,
    workCenterRows,
    signals: buildDispatchSignals(warnings, backlog, window),
    outputReceiptSlots,
    completedOutputReceipt,
    plannedHours,
  };
  data.checkpoints = buildDispatchCheckpoints(data);
  data.activeCheckpoint = data.checkpoints.find((checkpoint) => checkpoint.isActive) || data.checkpoints[0] || null;
  return data;
}

function normalizeShiftMasterBoardQuantity(value = 0) {
  const quantity = Math.round(Number(String(value ?? "").replace(",", ".")));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function getShiftMasterBoardAssignment(row = {}) {
  const storedMap = normalizePlainRecord(ui.shiftMasterBoardAssignments);
  const hasStored = Object.prototype.hasOwnProperty.call(storedMap, row.id);
  const stored = storedMap[row.id] || {};
  const sourceExecutors = Array.isArray(stored.executors) && stored.executors.length
    ? stored.executors
    : (row.executors || []).map((executor) => ({
      employeeId: executor.employeeId,
      quantity: executor.quantity,
      note: executor.note || "",
    }));
  return {
    isExplicit: hasStored || Boolean(row.isAssigned || row.isIssued || row.masterFactUpdatedAt),
    resourceId: stored.resourceId || row.resourceId || row.resourceOptions?.[0]?.id || "",
    masterId: stored.masterId || row.masterProfile?.id || ui.activeShiftMasterId || "",
    note: typeof stored.note === "string" ? stored.note : row.note || "",
    riskReason: normalizeShiftMasterBoardRiskReason(stored.riskReason || row.riskReason || ""),
    issued: typeof stored.issued === "boolean" ? stored.issued : Boolean(row.isIssued),
    createdAt: stored.createdAt || stored.issuedAt || stored.updatedAt || row.issuedAt || "",
    updatedAt: stored.updatedAt || row.issuedAt || "",
    issuedAt: stored.issuedAt || row.issuedAt || "",
    printRecords: normalizePlainRecord(stored.printRecords),
    status: stored.status || (stored.issued || row.isIssued ? "issued" : "draft"),
    sheetContract: stored.sheetContract || null,
    transferContract: stored.transferContract || stored.sheetContract?.transferContract || null,
    executors: sourceExecutors
      .map((executor, index) => ({
      id: executor.id || `board-executor-${index + 1}`,
      employeeId: executor.employeeId || "",
      quantity: normalizeShiftMasterBoardQuantity(executor.quantity || 0),
      note: executor.note || "",
      }))
      .filter((executor) => executor.employeeId || executor.quantity > 0 || executor.note),
  };
}

function getShiftMasterBoardFact(row = {}) {
  const stored = normalizePlainRecord(ui.shiftMasterBoardFacts)[row.id] || {};
  const actualQuantity = typeof stored.actualQuantity === "undefined"
    ? normalizeShiftMasterBoardQuantity(row.masterActualQuantity || 0)
    : normalizeShiftMasterBoardQuantity(stored.actualQuantity || 0);
  const defectQuantity = typeof stored.defectQuantity === "undefined"
    ? normalizeShiftMasterBoardQuantity(row.masterDefectQuantity || 0)
    : normalizeShiftMasterBoardQuantity(stored.defectQuantity || 0);
  const laborMinutes = typeof stored.laborMinutes === "undefined"
    ? normalizeDispatchLaborMinutes(row.masterLaborMinutes || 0)
    : normalizeDispatchLaborMinutes(stored.laborMinutes || 0);
  return {
    actualQuantity,
    defectQuantity,
    laborMinutes,
    executorCount: normalizeDispatchExecutorCount(stored.executorCount || row.masterExecutorCount || 0),
    comment: typeof stored.comment === "string" ? stored.comment : row.masterFactComment || "",
    updatedAt: stored.updatedAt || row.masterFactUpdatedAt || "",
    deviationComment: typeof stored.deviationComment === "string" ? stored.deviationComment : "",
    deviationNotes: Array.isArray(stored.deviationNotes) ? stored.deviationNotes : [],
    transferContract: stored.transferContract || null,
  };
}

function getShiftMasterBoardAssignmentQuantity(assignment = {}) {
  return (assignment.executors || []).reduce((sum, executor) => (
    sum + normalizeShiftMasterBoardQuantity(executor.quantity || 0)
  ), 0);
}

function getShiftMasterBoardRowById(slotId = "") {
  if (!slotId) return null;
  const model = getShiftMasterBoardModel();
  return model.allRows.find((item) => item.id === slotId || item.slotId === slotId)
    || model.rows.find((item) => item.id === slotId || item.slotId === slotId)
    || null;
}

function getShiftMasterBoardNextRouteStep(row = {}) {
  const currentStep = row.step || (planningState.routeSteps || []).find((step) => step.id === row.stepId) || null;
  const routeId = row.route?.id || row.routeId || currentStep?.routeId || "";
  if (!routeId || !currentStep) return null;
  const currentOrder = Number(currentStep.stepOrder || 0);
  const routeSteps = (planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId && step.id !== currentStep.id)
    .sort((left, right) => (
      Number(left.stepOrder || 0) - Number(right.stepOrder || 0)
      || String(left.operationName || "").localeCompare(String(right.operationName || ""), "ru")
    ));
  return routeSteps.find((step) => Number(step.stepOrder || 0) > currentOrder) || null;
}

function getShiftMasterBoardTransferTarget(row = {}, transferMode = "") {
  if (transferMode === "carryover") {
    return {
      kind: "carryover",
      stepId: row.step?.id || row.stepId || "",
      operationName: row.operationName || "Операция",
      workCenterId: row.workCenterId || "",
      workCenterLabel: row.workCenterLabel || "Участок не задан",
      label: "Остаток в следующую смену",
    };
  }
  const nextStep = getShiftMasterBoardNextRouteStep(row);
  if (!nextStep) {
    return {
      kind: "finish",
      stepId: "",
      operationName: "Завершение маршрута",
      workCenterId: "",
      workCenterLabel: "Выход маршрута",
      label: "Закрытие операции",
    };
  }
  const nextWorkCenterId = mapLegacyWorkCenterId(nextStep.planningWorkCenterId || nextStep.workCenterId || "");
  const nextWorkCenter = getWorkCenter(nextWorkCenterId) || getWorkCenter(nextStep.workCenterId) || null;
  return {
    kind: "next_operation",
    stepId: nextStep.id || "",
    operationName: nextStep.operationName || "Следующая операция",
    workCenterId: nextWorkCenterId,
    workCenterLabel: nextWorkCenter?.name || nextWorkCenterId || "Участок не задан",
    label: "Следующая операция",
  };
}

function getShiftMasterBoardCarryoverForSource(sourceRowId = "") {
  return Object.values(normalizePlainRecord(ui.shiftMasterBoardCarryovers))
    .find((item) => item && item.sourceRowId === sourceRowId) || null;
}

function buildShiftMasterBoardTransferContract(row = {}, assignment = row.boardAssignment || {}, fact = row.boardFact || {}, options = {}) {
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || assignment.plannedQuantity || fact.plannedQuantity || 0);
  const assignedQuantity = normalizeShiftMasterBoardQuantity(assignment.assignedQuantity || getShiftMasterBoardAssignmentQuantity(assignment) || row.boardAssignedQuantity || 0);
  const actualQuantity = normalizeShiftMasterBoardQuantity(fact.actualQuantity || 0);
  const defectQuantity = normalizeShiftMasterBoardQuantity(fact.defectQuantity || 0);
  const goodQuantity = Math.max(0, actualQuantity - defectQuantity);
  const remainingQuantity = fact.updatedAt ? Math.max(0, plannedQuantity - goodQuantity) : Math.max(0, plannedQuantity - assignedQuantity);
  const transferMode = fact.updatedAt && remainingQuantity > 0 ? "carryover" : "normal";
  const target = getShiftMasterBoardTransferTarget(row, transferMode);
  const carryover = options.carryover || getShiftMasterBoardCarryoverForSource(row.id) || null;
  const sourceSlotId = row.slotId || row.slot?.id || assignment.slotId || fact.slotId || row.id || "";
  const routeId = row.route?.id || row.routeId || assignment.routeId || fact.routeId || "";
  const planningOrderId = getSlotPlanningOrderId(row.slot || {}, routeId) || assignment.planningOrderId || fact.planningOrderId || routeId;
  const status = fact.updatedAt
    ? remainingQuantity > 0
      ? "partial_carryover_required"
      : "complete"
    : assignment.issued
      ? "issued_waiting_fact"
      : "draft";
  return {
    version: 1,
    source: "shiftMasterBoard",
    sourceRowId: row.id || assignment.sourceRowId || fact.sourceRowId || "",
    sourceSlotId,
    routeId,
    planningOrderId,
    sourceSpecifications2EntryId: row.slot?.sourceSpecifications2EntryId || assignment.sourceSpecifications2EntryId || fact.sourceSpecifications2EntryId || "",
    specificationRevision: Number(row.slot?.specificationRevision || assignment.specificationRevision || fact.specificationRevision || 0),
    routeRevision: Number(row.slot?.routeRevision || assignment.routeRevision || fact.routeRevision || 0),
    workOrderSnapshotId: row.slot?.workOrderSnapshotId || assignment.workOrderSnapshotId || fact.workOrderSnapshotId || "",
    stepId: row.step?.id || row.stepId || assignment.stepId || fact.stepId || "",
    fromWorkCenterId: row.workCenterId || assignment.workCenterId || fact.workCenterId || "",
    fromWorkCenterLabel: row.workCenterLabel || "Участок не задан",
    fromOperationName: row.operationName || "Операция",
    toKind: target.kind,
    toStepId: target.stepId,
    toWorkCenterId: target.workCenterId,
    toWorkCenterLabel: target.workCenterLabel,
    toOperationName: target.operationName,
    targetLabel: target.label,
    plannedQuantity,
    assignedQuantity,
    actualQuantity,
    defectQuantity,
    factQuantity: goodQuantity,
    remainingQuantity,
    remainingToAssignedQuantity: fact.updatedAt ? Math.max(0, assignedQuantity - goodQuantity) : 0,
    unit: row.unit || assignment.unit || fact.unit || "шт.",
    status,
    carryoverId: carryover?.id || "",
    carryoverDateKey: carryover?.dateKey || "",
    updatedAt: fact.updatedAt || assignment.updatedAt || "",
  };
}

function buildShiftMasterBoardSheetContract(row = {}, assignment = row.boardAssignment || {}, fact = row.boardFact || {}, options = {}) {
  const transferContract = buildShiftMasterBoardTransferContract(row, assignment, fact, options);
  const masterProfile = getShiftMasterProfile(assignment.masterId) || row.masterProfile || null;
  const executors = (assignment.executors || [])
    .filter((executor) => executor.employeeId || normalizeShiftMasterBoardQuantity(executor.quantity || 0) > 0)
    .map((executor) => {
      const employee = getShiftMasterEmployee(executor.employeeId);
      return {
        employeeId: executor.employeeId || "",
        employeeName: employee?.name || "Исполнитель не выбран",
        quantity: normalizeShiftMasterBoardQuantity(executor.quantity || 0),
        note: executor.note || "",
      };
    });
  return {
    version: 1,
    documentType: "shiftWorkOrderSheet",
    documentNumber: row.documentNumber || assignment.documentNumber || "",
    rowId: row.id || assignment.sourceRowId || "",
    sourceSlotId: transferContract.sourceSlotId,
    routeId: transferContract.routeId,
    planningOrderId: transferContract.planningOrderId,
    sourceSpecifications2EntryId: transferContract.sourceSpecifications2EntryId,
    specificationRevision: transferContract.specificationRevision,
    routeRevision: transferContract.routeRevision,
    workOrderSnapshotId: transferContract.workOrderSnapshotId,
    stepId: transferContract.stepId,
    shiftDateKey: row.dateKey || row.timesheetDateKey || assignment.dateKey || assignment.timesheetDateKey || "",
    orderLabel: getShiftMasterRowOrderLabel(row),
    routePartLabel: getShiftMasterRowRoutePartLabel(row),
    operationName: row.operationName || "Операция",
    workCenterId: transferContract.fromWorkCenterId,
    workCenterLabel: transferContract.fromWorkCenterLabel,
    resourceId: assignment.resourceId || row.resourceId || "",
    resourceLabel: row.resourceLabel || "",
    plannedQuantity: transferContract.plannedQuantity,
    assignedQuantity: transferContract.assignedQuantity,
    factQuantity: transferContract.factQuantity,
    unit: transferContract.unit,
    masterId: masterProfile?.id || assignment.masterId || "",
    masterName: masterProfile?.name || "Мастер не назначен",
    executors,
    transferContract,
    status: assignment.issued ? "issued" : "draft",
    issuedAt: assignment.issuedAt || "",
    updatedAt: assignment.updatedAt || fact.updatedAt || "",
  };
}

function getShiftMasterBoardLaborMinutesPerUnit(row = {}) {
  const slot = row.slot || {};
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || slot.quantity || 0);
  const explicitUnit = normalizePlanningLaborPositiveNumber(slot.planningLaborMinutesPerUnit || row.minutesPerUnit || row.masterMinutesPerUnit || 0);
  if (explicitUnit > 0) return explicitUnit;

  const panelMinutes = normalizePlanningLaborPositiveNumber(slot.planningLaborMinutesPerPanel || row.minutesPerPanel || row.masterMinutesPerPanel || 0);
  const boardsPerPanel = normalizeBoardsPerPanel(slot.planningLaborBoardsPerPanel || slot.boardsPerPanel || row.boardsPerPanel || 1, 1);
  if (panelMinutes > 0 && boardsPerPanel > 0) return panelMinutes / boardsPerPanel;

  const shiftQuantity = normalizePlanningLaborPositiveNumber(slot.planningLaborShiftQuantity || slot.planningLaborShiftCapacity || 0);
  const shiftMinutes = normalizePlanningLaborPositiveNumber(slot.planningLaborShiftMs || 0) / 60000;
  if (shiftQuantity > 0 && shiftMinutes > 0) return shiftMinutes / shiftQuantity;

  const durationMinutes = normalizePlanningLaborPositiveNumber(slot.planningLaborDurationMs || 0) / 60000;
  if (durationMinutes > 0 && plannedQuantity > 0) return durationMinutes / plannedQuantity;

  const fixedMinutes = normalizePlanningLaborPositiveNumber(slot.planningLaborFixedMinutes || 0);
  if (fixedMinutes > 0 && plannedQuantity > 0) return fixedMinutes / plannedQuantity;

  const start = row.startsAt || slot.plannedStart || "";
  const end = row.endsAt || slot.plannedEnd || "";
  const workCenterId = row.workCenterId || slot.workCenterId || slot.planningWorkCenterId || "";
  const workingDurationMs = start && end && workCenterId
    ? getWorkingDurationBetween(workCenterId, start, end, planningState)
    : 0;
  if (workingDurationMs > 0 && plannedQuantity > 0) return (workingDurationMs / 60000) / plannedQuantity;

  const startMs = start ? toDate(start).getTime() : NaN;
  const endMs = end ? toDate(end).getTime() : NaN;
  const rawDurationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? (endMs - startMs) / 60000
    : 0;
  if (rawDurationMinutes > 0 && plannedQuantity > 0) return rawDurationMinutes / plannedQuantity;

  return 0;
}

function getShiftMasterBoardTimesheetCapacity(row = {}) {
  const scopeEmployees = (row.employees || []).filter((employee) => employee?.id);
  const timesheetAvailableEmployees = (row.availableEmployees || []).filter((employee) => employee?.availability?.isAvailable);
  const laborMinutesPerUnit = getShiftMasterBoardLaborMinutesPerUnit(row);
  const totalMinutes = timesheetAvailableEmployees.reduce((sum, employee) => (
    sum + Math.max(0, Number(employee.availability?.hours || 0)) * 60
  ), 0);
  const quantity = laborMinutesPerUnit > 0
    ? normalizeShiftMasterBoardQuantity(Math.floor(totalMinutes / laborMinutesPerUnit))
    : 0;
  return {
    displayEmployees: scopeEmployees,
    timesheetAvailableEmployees,
    laborMinutesPerUnit,
    totalMinutes,
    quantity,
  };
}

function getShiftMasterBoardLaneId(row = {}, assignment = getShiftMasterBoardAssignment(row), fact = getShiftMasterBoardFact(row)) {
  const storedLane = normalizeShiftMasterBoardLane(normalizePlainRecord(ui.shiftMasterBoardLaneBySlot)[row.id]);
  if (fact.updatedAt || fact.actualQuantity > 0 || fact.defectQuantity > 0) return "fact";
  if (storedLane) return storedLane;
  if (assignment.issued || row.isIssued) return "assigned";
  if (assignment.isExplicit && (assignment.resourceId || assignment.executors?.length || assignment.note)) return "assigned";
  if (row.isBoardCarryover) return "intake";
  return "intake";
}

function getShiftMasterBoardRow(row = {}) {
  const assignment = getShiftMasterBoardAssignment(row);
  const fact = getShiftMasterBoardFact(row);
  const assignedQuantity = getShiftMasterBoardAssignmentQuantity(assignment);
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
  const goodQuantity = Math.max(0, fact.actualQuantity - fact.defectQuantity);
  const laneId = getShiftMasterBoardLaneId(row, assignment, fact);
  const completion = plannedQuantity > 0 ? Math.round(Math.min(140, goodQuantity / plannedQuantity * 100)) : 0;
  const allocation = plannedQuantity > 0 ? Math.round(Math.min(140, assignedQuantity / plannedQuantity * 100)) : 0;
  const boardTransferContract = row.isBoardCarryover
    ? null
    : buildShiftMasterBoardTransferContract(row, assignment, fact);
  const signal = fact.updatedAt
    ? goodQuantity >= plannedQuantity && fact.defectQuantity <= 0
      ? { tone: "ok", label: "факт закрыт" }
      : { tone: "warning", label: "есть отклонение" }
    : assignment.riskReason
      ? { tone: "warning", label: `риск: ${getShiftMasterBoardRiskLabel(assignment.riskReason).toLowerCase()}` }
    : assignedQuantity > 0
      ? assignedQuantity >= plannedQuantity
        ? { tone: "ok", label: "распределено" }
        : { tone: "warning", label: "частично" }
      : row.isBoardCarryover
        ? { tone: "warning", label: "остаток смены" }
      : { tone: "warning", label: "нужно распределить" };
  return {
    ...row,
    boardAssignment: assignment,
    boardFact: fact,
    boardLaneId: laneId,
    boardAssignedQuantity: assignedQuantity,
    boardGoodQuantity: goodQuantity,
    boardAllocation: allocation,
    boardCompletion: completion,
    boardSignal: signal,
    boardTransferContract,
  };
}

function getShiftMasterBoardGroupKey(row = {}, swimlane = normalizeShiftMasterBoardSwimlane(ui.shiftMasterBoardSwimlane)) {
  if (swimlane === "workCenter") return row.workCenterLabel || "Участок не задан";
  if (swimlane === "master") return row.masterProfile?.name || getShiftMasterProfile(row.boardAssignment?.masterId)?.name || "Мастер не назначен";
  return getShiftMasterRowOrderLabel(row);
}

function groupShiftMasterBoardRows(rows = [], swimlane = normalizeShiftMasterBoardSwimlane(ui.shiftMasterBoardSwimlane)) {
  const map = new Map();
  rows.forEach((row) => {
    const key = getShiftMasterBoardGroupKey(row, swimlane);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.entries()].map(([label, items]) => ({
    label,
    rows: items.sort((left, right) => (
      left.startsAt - right.startsAt
      || String(left.operationName || "").localeCompare(String(right.operationName || ""), "ru")
    )),
  }));
}

function getShiftMasterBoardWeek(window = getShiftWorkbenchWindow(), masterProfile = null) {
  const firstDay = addMs(startOfDay(window.start), -3 * DAY_MS);
  const currentKey = toDateInput(window.start);
  return Array.from({ length: 7 }, (_, index) => {
    const dayStart = addMs(firstDay, index * DAY_MS);
    const dateKey = toDateInput(dayStart);
    const dayWindow = {
      start: dayStart,
      end: addMs(dayStart, DAY_MS),
      days: 1,
      label: formatDate(dayStart),
    };
    const sourceRows = getShiftWorkOrderRows({ window: dayWindow, masterProfile });
    const fallbackRows = sourceRows.length || dateKey !== toDateInput(window.start) ? [] : getShiftMasterBoardFallbackRows(dayWindow, masterProfile);
    const rows = (sourceRows.length ? sourceRows : fallbackRows).map(getShiftMasterBoardRow);
    const planned = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0), 0);
    const assigned = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0), 0);
    const fact = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.boardGoodQuantity || 0), 0);
    const delta = fact - planned;
    return {
      id: dateKey,
      label: dayStart.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      isCurrent: dateKey === currentKey,
      rows,
      taskCount: rows.length,
      isDemoHistory: false,
      planned,
      assigned,
      fact,
      delta,
      tone: !rows.length ? "neutral" : delta < 0 ? "warning" : "ok",
    };
  });
}

function getShiftMasterBoardCarryoverRows(window = getShiftWorkbenchWindow(), masterProfile = null) {
  const dateKey = toDateInput(window.start);
  return Object.values(normalizePlainRecord(ui.shiftMasterBoardCarryovers))
    .filter((item) => item && item.dateKey === dateKey)
    .map((item) => {
      const step = (planningState.routeSteps || []).find((candidate) => candidate.id === item.stepId) || null;
      const route = (planningState.routes || []).find((candidate) => candidate.id === item.routeId) || null;
      const workCenterId = mapLegacyWorkCenterId(item.workCenterId || step?.planningWorkCenterId || step?.workCenterId || "");
      if (masterProfile && !shiftMasterProfileOwnsWorkCenter(masterProfile, workCenterId)) return null;
      const workCenter = getWorkCenter(workCenterId) || null;
      const resourceOptions = getShiftMasterResourceOptions(workCenterId, item.resourceId || step?.resourceId || "");
      const defaultResource = resourceOptions.find((resource) => resource.id === item.resourceId) || resourceOptions[0] || null;
      const ownerProfile = getShiftMasterOwnerProfileForWorkCenter(workCenterId, null, masterProfile);
      const employees = enrichShiftMasterEmployeesWithTimesheet(getShiftMasterAssignableEmployees(ownerProfile, workCenterId), dateKey);
      const availableEmployees = employees.filter((employee) => employee.availability?.isAvailable);
      const unavailableEmployees = employees.filter((employee) => !employee.availability?.isAvailable);
      const timesheetAvailableHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.hours || 0), 0);
      const timesheetOvertimeHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.overtime || 0), 0);
      const startsAt = addMs(window.start, 8 * 60 * 60 * 1000);
      const endsAt = addMs(startsAt, 90 * 60 * 1000);
      const plannedQuantity = normalizeShiftMasterBoardQuantity(item.plannedQuantity || item.remainingQuantity || 0);
      return {
        id: item.id,
        slotId: item.id,
        slot: null,
        step,
        route,
        task: route && step ? getRouteStepPlanningTask(route, step) : null,
        dateKey,
        documentNumber: item.documentNumber || [
          "ОСТ",
          dateKey.replaceAll("-", ""),
          workCenter?.code || workCenterId || "WC",
        ].filter(Boolean).join("-"),
        routeName: item.routeName || route?.name || "Маршрутная карта",
        orderLabel: item.orderLabel || route?.specificationName || route?.name || "Заказ-наряд",
        taskLabel: item.taskLabel || step?.specTaskName || "Остаток смены",
        operationName: item.operationName || step?.operationName || "Операция",
        workCenterId,
        workCenter,
        workCenterLabel: item.workCenterLabel || workCenter?.name || workCenterId || "Участок не задан",
        resourceOptions,
	        resourceId: defaultResource?.id || "",
	        resourceLabel: defaultResource?.name || "Ресурс не назначен",
	        employees,
	        availableEmployees,
	        unavailableEmployees,
	        timesheetDateKey: dateKey,
	        timesheetAvailableCount: availableEmployees.length,
	        timesheetUnavailableCount: unavailableEmployees.length,
	        timesheetAvailableHours,
	        timesheetOvertimeHours,
        executors: [],
        executorQuantity: 0,
        executorCount: 0,
	        isAssigned: false,
	        employeeId: availableEmployees[0]?.id || employees[0]?.id || "",
	        employeeLabel: availableEmployees[0]?.name || employees[0]?.name || "Исполнитель не назначен",
        masterProfile: ownerProfile,
        assignment: null,
        isIssued: false,
        issuedAt: "",
        note: item.reason || "Остаток после закрытия факта предыдущей смены",
        plannedQuantity,
        actualQuantity: 0,
        defectQuantity: 0,
        laborMinutes: 0,
        factExecutorCount: 0,
        boardsPerPanel: normalizeBoardsPerPanel(step?.boardsPerPanel || 1, 1),
        panelQuantity: 0,
        minutesPerUnit: 0,
        minutesPerPanel: 0,
        dispatchArchived: false,
        deltaQuantity: -plannedQuantity,
        fact: null,
        factStatus: getDispatchFactStatusConfig("not_reported"),
        factStatusView: getMesStatusView("dispatchFact", "not_reported", { label: "Факт не внесен", tone: "neutral" }),
        masterActualQuantity: 0,
        masterDefectQuantity: 0,
        masterLaborMinutes: 0,
        masterExecutorCount: 0,
        masterMinutesPerUnit: 0,
        masterMinutesPerPanel: 0,
        masterPanelQuantity: 0,
        masterFactDelta: -plannedQuantity,
        masterFactUpdatedAt: "",
        masterFactComment: "",
        masterFactStatus: "not_reported",
        masterFactCompletion: 0,
        unit: item.unit || "шт.",
        rawStatus: "carryover",
        slotStatus: getMesStatusView("ganttSlot", "planned", { label: "Остаток смены", tone: "warning" }),
        timeLabel: `${formatDateTimeShort(startsAt)}-${formatDateTimeShort(endsAt)}`,
        startsAt,
        endsAt,
        isBoardCarryover: true,
        sourceRowId: item.sourceRowId || "",
      };
    })
    .filter(Boolean);
}

function getShiftMasterBoardFallbackRows(window = getShiftWorkbenchWindow(), masterProfile = null) {
  const routes = (planningState.routes || []).filter((route) => !isWorkOrderPlanningCanceled(route));
  const preferredRoute = routes.find((route) => getWorkOrderPlanningStatusValue(route) === "scheduled") || routes[0] || null;
  if (!preferredRoute) return [];
  const routeSteps = (planningState.routeSteps || [])
    .filter((step) => step.routeId === preferredRoute.id)
    .sort((left, right) => (
      Number(left.stepOrder || 0) - Number(right.stepOrder || 0)
      || String(left.operationName || "").localeCompare(String(right.operationName || ""), "ru")
    ))
    .slice(0, 12);
  return routeSteps.map((step, index) => {
    const workCenterId = mapLegacyWorkCenterId(step.planningWorkCenterId || step.workCenterId || "");
    if (masterProfile && !shiftMasterProfileOwnsWorkCenter(masterProfile, workCenterId)) return null;
      const workCenter = getWorkCenter(workCenterId) || getWorkCenter(step.workCenterId) || null;
      const resourceOptions = getShiftMasterResourceOptions(workCenterId, step.resourceId || "");
    const defaultResource = resourceOptions.find((resource) => resource.id === step.resourceId) || resourceOptions[0] || null;
    const dateKey = toDateInput(window.start);
    const ownerProfile = getShiftMasterOwnerProfileForWorkCenter(workCenterId, null, masterProfile);
    const employees = enrichShiftMasterEmployeesWithTimesheet(getShiftMasterAssignableEmployees(ownerProfile, workCenterId), dateKey);
    const availableEmployees = employees.filter((employee) => employee.availability?.isAvailable);
    const unavailableEmployees = employees.filter((employee) => !employee.availability?.isAvailable);
    const timesheetAvailableHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.hours || 0), 0);
    const timesheetOvertimeHours = availableEmployees.reduce((sum, employee) => sum + Number(employee.availability?.overtime || 0), 0);
    const startsAt = addMs(window.start, (8 + index) * 60 * 60 * 1000);
    const endsAt = addMs(startsAt, 45 * 60 * 1000);
	    const plannedQuantity = normalizeShiftMasterBoardQuantity(preferredRoute.planningQuantity || step.specTaskQuantity || 0);
	    const fallbackId = getShiftRowId({ id: `board-fallback-${step.id}` }, dateKey);
    return {
      id: fallbackId,
      slotId: `board-fallback-${step.id}`,
      slot: null,
      step,
      route: preferredRoute,
	      task: getRouteStepPlanningTask(preferredRoute, step),
	      dateKey,
      documentNumber: [
	        "СЗН",
	        dateKey.replaceAll("-", ""),
        workCenter?.code || workCenterId || "WC",
        String(index + 1).padStart(2, "0"),
      ].filter(Boolean).join("-"),
      routeName: preferredRoute.name || "Маршрутная карта",
      orderLabel: getPlanningOrderObjectLabel(preferredRoute) || preferredRoute.specificationName || preferredRoute.name || "Заказ-наряд",
      taskLabel: step.specTaskName || "Объект маршрута",
      operationName: step.operationName || "Операция",
      workCenterId,
      workCenter,
      workCenterLabel: workCenter?.name || workCenterId || "Участок не задан",
      resourceOptions,
	      resourceId: defaultResource?.id || "",
	      resourceLabel: defaultResource?.name || "Ресурс не назначен",
	      employees,
	      availableEmployees,
	      unavailableEmployees,
	      timesheetDateKey: dateKey,
	      timesheetAvailableCount: availableEmployees.length,
	      timesheetUnavailableCount: unavailableEmployees.length,
	      timesheetAvailableHours,
	      timesheetOvertimeHours,
      executors: [],
      executorQuantity: 0,
      executorCount: 0,
	      isAssigned: false,
	      employeeId: availableEmployees[0]?.id || employees[0]?.id || "",
	      employeeLabel: availableEmployees[0]?.name || employees[0]?.name || "Исполнитель не назначен",
      masterProfile: ownerProfile,
      assignment: null,
      isIssued: false,
      issuedAt: "",
      note: "",
      plannedQuantity,
      actualQuantity: 0,
      defectQuantity: 0,
      laborMinutes: 0,
      factExecutorCount: 0,
      boardsPerPanel: normalizeBoardsPerPanel(step.boardsPerPanel || 1, 1),
      panelQuantity: 0,
      minutesPerUnit: 0,
      minutesPerPanel: 0,
      dispatchArchived: false,
      deltaQuantity: -plannedQuantity,
      fact: null,
      factStatus: getDispatchFactStatusConfig("not_reported"),
      factStatusView: getMesStatusView("dispatchFact", "not_reported", { label: "Факт не внесен", tone: "neutral" }),
      masterActualQuantity: 0,
      masterDefectQuantity: 0,
      masterLaborMinutes: 0,
      masterExecutorCount: 0,
      masterMinutesPerUnit: 0,
      masterMinutesPerPanel: 0,
      masterPanelQuantity: 0,
      masterFactDelta: -plannedQuantity,
      masterFactUpdatedAt: "",
      masterFactComment: "",
      masterFactStatus: "not_reported",
      masterFactCompletion: 0,
      unit: "шт.",
      rawStatus: "planned",
      slotStatus: getMesStatusView("ganttSlot", "planned", { label: "Запланировано", tone: "neutral" }),
      timeLabel: `${formatDateTimeShort(startsAt)}-${formatDateTimeShort(endsAt)}`,
      startsAt,
      endsAt,
      isBoardFallback: true,
    };
  }).filter(Boolean);
}

function getShiftMasterBoardModel() {
  recoverPlanningStateFromStorageIfRuntimeEmpty("shift-master-board-model");
  const window = getShiftWorkbenchWindow();
  const profiles = getShiftMasterProfiles();
  const access = getShiftMasterBoardAccessContext(profiles);
  const scopedMasterProfile = access.scopedMasterProfile || null;
  const sourceRows = getShiftWorkOrderRows({ window, masterProfile: scopedMasterProfile });
  const slotRows = sourceRows.length ? [] : getShiftMasterBoardSlotRows(window, scopedMasterProfile);
  const baseRows = sourceRows.length
    ? sourceRows
    : slotRows.length
      ? slotRows
      : getShiftMasterBoardFallbackRows(window, scopedMasterProfile);
  const allRows = [...baseRows, ...getShiftMasterBoardCarryoverRows(window, scopedMasterProfile)].map(getShiftMasterBoardRow);
  const focus = normalizeShiftMasterBoardFocus(ui.shiftMasterBoardFocus);
  let activeProfile = access.activeProfile;
  if (activeProfile?.id && ui.activeShiftMasterId !== activeProfile.id) ui.activeShiftMasterId = activeProfile.id;
  const rows = allRows.filter((row) => {
    if (scopedMasterProfile && !shiftMasterProfileOwnsWorkCenter(scopedMasterProfile, row.workCenterId)) return false;
    if (focus === "mine") {
      return row.boardAssignment.masterId === activeProfile?.id
        || shiftMasterProfileOwnsWorkCenter(activeProfile, row.workCenterId);
    }
    if (focus === "open") return row.boardLaneId !== "fact";
    if (focus === "attention") {
      const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
      const assignedQuantity = normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0);
      const factQuantity = normalizeShiftMasterBoardQuantity(row.boardGoodQuantity || 0);
      return row.boardLaneId !== "fact"
        || assignedQuantity <= 0
        || assignedQuantity < plannedQuantity
        || factQuantity < plannedQuantity
        || !row.boardAssignment.issued
        || Boolean(row.boardAssignment.riskReason);
    }
    return true;
  });
  const selectedRow = rows.find((row) => row.id === ui.shiftMasterBoardSelectedSlotId)
    || rows.find((row) => row.boardLaneId !== "fact")
    || rows[0]
    || null;
  if (selectedRow && ui.shiftMasterBoardSelectedSlotId !== selectedRow.id) ui.shiftMasterBoardSelectedSlotId = selectedRow.id;
  const plannedQuantity = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0), 0);
  const assignedQuantity = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0), 0);
  const factQuantity = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.boardGoodQuantity || 0), 0);
  const lanes = SHIFT_MASTER_BOARD_LANES.map((lane) => {
    const laneRows = rows.filter((row) => row.boardLaneId === lane.id);
    return {
      ...lane,
      rows: laneRows,
      groups: groupShiftMasterBoardRows(laneRows),
    };
  });
  const profileCountRows = allRows.length ? allRows : rows;
  const profileRowCounts = new Map(profiles.map((profile) => [
    profile.id,
    profileCountRows.filter((row) => shiftMasterProfileOwnsWorkCenter(profile, row.workCenterId)).length,
  ]));
  return {
    window,
    rows,
    allRows,
    lanes,
    profiles,
    activeProfile,
    access,
    authPerson: access.person,
    canSelectMaster: access.canSelectMaster,
    isScopedToMaster: access.isScopedToMaster,
    profileRowCounts,
    selectedRow,
    swimlane: normalizeShiftMasterBoardSwimlane(ui.shiftMasterBoardSwimlane),
    focus,
    plannedQuantity,
    assignedQuantity,
    factQuantity,
    openQuantity: Math.max(0, plannedQuantity - factQuantity),
    week: getShiftMasterBoardWeek(window, scopedMasterProfile),
  };
}

function getShiftMasterBoardExecutorLoadMap(rows = []) {
  const map = new Map();
  const rowIds = new Set();
  const activeSlotIds = new Set((planningState.slots || []).map((slot) => String(slot?.id || "")).filter(Boolean));
  const activeRouteIds = new Set((planningState.routes || []).map((route) => String(route?.id || "")).filter(Boolean));
  const isLinkedToActivePlanning = (assignment = {}) => {
    const slotId = String(assignment?.sourceSlotId || assignment?.slotId || "");
    const routeId = String(assignment?.routeId || assignment?.planningOrderId || "");
    return (slotId && activeSlotIds.has(slotId)) || (routeId && activeRouteIds.has(routeId));
  };
  const addLoad = (assignment = {}, laborMinutesPerUnit = 0, source = {}) => {
    (assignment.executors || []).forEach((executor) => {
      if (!executor.employeeId) return;
      const quantity = normalizeShiftMasterBoardQuantity(executor.quantity || 0);
      if (quantity <= 0) return;
      const person = getShiftMasterEmployee(executor.employeeId);
      const current = map.get(executor.employeeId) || {
        employeeId: executor.employeeId,
        name: person?.name || "Исполнитель",
        quantity: 0,
        minutes: 0,
        tasks: 0,
        details: [],
      };
      current.quantity += quantity;
      const minutes = laborMinutesPerUnit > 0 ? quantity * laborMinutesPerUnit : 0;
      current.minutes += minutes;
      current.tasks += 1;
      current.details.push({
        rowId: source.rowId || "",
        operationName: source.operationName || "Операция",
        objectLabel: source.objectLabel || "Объект не указан",
        quantity,
        minutes,
      });
      map.set(executor.employeeId, current);
    });
  };
  rows.forEach((row) => {
    if (row.id) rowIds.add(row.id);
    if (row.slotId) rowIds.add(row.slotId);
    const routePartLabel = getShiftMasterRowRoutePartLabel(row);
    const loadObjectLabel = routePartLabel && routePartLabel !== "Объект не выбран"
      ? routePartLabel
      : row.routeName || row.orderLabel || "Объект не указан";
    addLoad(row.boardAssignment || {}, getShiftMasterBoardLaborMinutesPerUnit(row), {
      rowId: row.id || row.slotId || "",
      operationName: row.operationName || "Операция",
      objectLabel: loadObjectLabel,
    });
  });
  Object.entries(normalizePlainRecord(ui.shiftMasterBoardAssignments)).forEach(([rowId, assignment]) => {
    if (!rowId || rowIds.has(rowId)) return;
    // A browser can retain UI data from a route that was explicitly deleted
    // from shared planning. Such an orphan must not reserve an employee's
    // capacity or render as a historical load in the current workshop.
    if (!isLinkedToActivePlanning(assignment)) return;
    const laborMinutesPerUnit = normalizePlanningLaborPositiveNumber(
      assignment?.laborMinutesPerUnit
        || assignment?.minutesPerUnit
        || assignment?.planningLaborMinutesPerUnit
        || 0,
    );
    addLoad(assignment, laborMinutesPerUnit, {
      rowId,
      operationName: assignment?.sheetContract?.operationName || assignment?.operationName || "Операция",
      objectLabel: assignment?.sheetContract?.orderLabel || assignment?.orderLabel || "Сохранённое назначение",
    });
  });
  return map;
}

function getShiftMasterBoardAssistCandidates(model = {}) {
  const currentStart = startOfDay(model.window?.start || getShiftWorkbenchWindow().start);
  const scopedMasterProfile = model.access?.scopedMasterProfile || model.activeProfile || null;
  const nextShiftCandidates = [];
  const seenRows = new Set();
  for (let dayOffset = 1; dayOffset <= 3; dayOffset += 1) {
    const dayStart = addMs(currentStart, dayOffset * DAY_MS);
    const dayWindow = { start: dayStart, end: addMs(dayStart, DAY_MS), days: 1, label: formatDate(dayStart) };
    getShiftWorkOrderRows({ window: dayWindow, masterProfile: scopedMasterProfile }).forEach((row) => {
      const sourceId = row.id || row.slotId || "";
      if (!sourceId || seenRows.has(sourceId)) return;
      seenRows.add(sourceId);
      nextShiftCandidates.push({
        id: `next:${sourceId}`,
        kind: "next",
        title: row.operationName || "Операция",
        objectLabel: getShiftMasterRowRoutePartLabel(row) || getShiftMasterRowOrderLabel(row),
        workCenterLabel: row.workCenterLabel || "Участок не задан",
        dateLabel: formatDate(dayStart),
        quantityLabel: `${normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0).toLocaleString("ru-RU")} ${row.unit || "шт."}`,
      });
    });
  }

  const internalCandidates = getPlanningWorkCenters({ includeWarehouse: false })
    .filter((workCenter) => !scopedMasterProfile || shiftMasterProfileOwnsWorkCenter(scopedMasterProfile, workCenter.id))
    .slice(0, 8)
    .map((workCenter) => ({
      id: `internal:${workCenter.id}`,
      kind: "internal",
      title: "Дополнительная загрузка",
      objectLabel: workCenter.name || workCenter.code || "Производственный участок",
      workCenterLabel: workCenter.name || "Участок не задан",
      dateLabel: "текущая смена",
      quantityLabel: "объём определяет мастер",
    }));

  return { next: nextShiftCandidates.slice(0, 12), internal: internalCandidates };
}

function getShiftMasterBoardAssistEmployees(model = {}) {
  const row = model.selectedRow || model.rows?.[0] || null;
  if (!row) return [];
  const loadMap = getShiftMasterBoardExecutorLoadMap(model.allRows || model.rows || []);
  return (row.employees || [])
    .filter((employee) => employee?.availability?.isAvailable)
    .map((employee) => {
      const totalMinutes = Math.max(0, Number(employee.availability?.hours || 0) * 60);
      const assignedMinutes = Math.max(0, Number(loadMap.get(employee.id)?.minutes || 0));
      const freeMinutes = Math.max(0, totalMinutes - assignedMinutes);
      return {
        ...employee,
        totalMinutes,
        assignedMinutes,
        freeMinutes,
        freeHoursLabel: `${formatReportNumber(freeMinutes / 60)} ч свободно`,
      };
    })
    .filter((employee) => employee.freeMinutes > 0)
    .sort((left, right) => right.freeMinutes - left.freeMinutes);
}

function renderShiftMasterBoardAssistModal(model = getShiftMasterBoardModel()) {
  if (!ui.shiftMasterBoardAssistOpen) return "";
  const candidates = getShiftMasterBoardAssistCandidates(model);
  const mode = ui.shiftMasterBoardAssistMode === "internal" ? "internal" : "next";
  const visibleCandidates = candidates[mode] || [];
  const selectedCandidate = visibleCandidates.find((item) => item.id === ui.shiftMasterBoardAssistCandidateId)
    || visibleCandidates[0]
    || null;
  const selectedEmployeeIds = new Set(Array.isArray(ui.shiftMasterBoardAssistEmployeeIds) ? ui.shiftMasterBoardAssistEmployeeIds : []);
  const employees = getShiftMasterBoardAssistEmployees(model);
  const selectedEmployees = employees.filter((employee) => selectedEmployeeIds.has(employee.id));
  const previewReady = Boolean(ui.shiftMasterBoardAssistPreview && selectedCandidate && selectedEmployees.length);
  return `
    <div class="modal-backdrop shift-master-board-assist-backdrop" data-modal-backdrop>
      ${renderUiModalFrame({
        className: "large-modal shift-master-board-assist-modal",
        size: "large",
        attributes: "aria-label=\"Дозагрузка свободных сотрудников\"",
        title: "Дозагрузка свободных сотрудников",
        meta: "Интерактивный прототип · без сохранения и создания задач",
        headActions: renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-shift-board-assist-close type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" }),
        body: `
          <div class="shift-master-board-assist">
            <div class="shift-master-board-assist-tabs" role="tablist" aria-label="Источник работы">
              <button class="${mode === "next" ? "is-active" : ""}" data-shift-board-assist-mode="next" type="button" role="tab" aria-selected="${mode === "next"}">Следующие смены <small>${candidates.next.length}</small></button>
              <button class="${mode === "internal" ? "is-active" : ""}" data-shift-board-assist-mode="internal" type="button" role="tab" aria-selected="${mode === "internal"}">Дополнительная загрузка <small>${candidates.internal.length}</small></button>
            </div>
            <div class="shift-master-board-assist-layout">
              <section class="shift-master-board-assist-source">
                <header><strong>${mode === "next" ? "Работы из ближайшего плана" : "Загрузка по доступным участкам"}</strong><span>${mode === "next" ? "Только существующие операции на ближайшие три дня" : "Тип работы будет уточняться мастером в будущем каталоге"}</span></header>
                <div class="shift-master-board-assist-candidates">
                  ${visibleCandidates.length ? visibleCandidates.map((candidate) => `
                    <button class="shift-master-board-assist-candidate ${candidate.id === selectedCandidate?.id ? "is-selected" : ""}" data-shift-board-assist-candidate="${escapeAttribute(candidate.id)}" type="button">
                      <span>${escapeHtml(candidate.dateLabel)}</span>
                      <strong>${escapeHtml(candidate.title)}</strong>
                      <small>${escapeHtml(candidate.objectLabel)}</small>
                      <em>${escapeHtml(candidate.workCenterLabel)} · ${escapeHtml(candidate.quantityLabel)}</em>
                    </button>
                  `).join("") : `<div class="shift-master-board-assist-empty"><strong>Подходящих работ пока нет</strong><span>Прототип показывает только сведения, уже имеющиеся в планировании.</span></div>`}
                </div>
              </section>
              <section class="shift-master-board-assist-people">
                <header><strong>Кого можно дозагрузить</strong><span>Сотрудники с незаполненным временем текущей смены</span></header>
                <div class="shift-master-board-assist-employees">
                  ${employees.length ? employees.map((employee) => `
                    <button class="shift-master-board-assist-employee ${selectedEmployeeIds.has(employee.id) ? "is-selected" : ""}" data-shift-board-assist-employee="${escapeAttribute(employee.id)}" type="button" aria-pressed="${selectedEmployeeIds.has(employee.id)}">
                      <span aria-hidden="true">${selectedEmployeeIds.has(employee.id) ? "✓" : ""}</span>
                      <strong>${escapeHtml(formatShiftMasterPersonName(employee.name))}</strong>
                      <small>${escapeHtml(employee.role || employee.position || "исполнитель")}</small>
                      <em>${escapeHtml(employee.freeHoursLabel)}</em>
                    </button>
                  `).join("") : `<div class="shift-master-board-assist-empty"><strong>Свободных сотрудников нет</strong><span>У доступных сотрудников смена уже заполнена назначениями.</span></div>`}
                </div>
              </section>
            </div>
            <section class="shift-master-board-assist-preview ${previewReady ? "is-ready" : ""}">
              <div><span>Предварительный состав</span><strong>${selectedCandidate ? escapeHtml(selectedCandidate.title) : "Выберите работу"}</strong><small>${selectedCandidate ? escapeHtml(`${selectedCandidate.objectLabel} · ${selectedCandidate.workCenterLabel}`) : "Источник работы не выбран"}</small></div>
              <div><span>Сотрудники</span><strong>${selectedEmployees.length ? `${selectedEmployees.length.toLocaleString("ru-RU")} выбрано` : "Не выбраны"}</strong><small>${selectedEmployees.length ? escapeHtml(selectedEmployees.map((employee) => formatShiftMasterPersonName(employee.name)).join(", ")) : "Можно выбрать несколько человек"}</small></div>
              <div class="shift-master-board-assist-readonly"><strong>${previewReady ? "Рекомендация сформирована" : "Только просмотр"}</strong><small>Назначение не записывается в доску и не изменяет планирование</small></div>
            </section>
          </div>
        `,
        actions: `
          ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-shift-board-assist-close type=\"button\"" })}
          ${renderUiActionButton({ label: previewReady ? "Рекомендация готова" : "Сформировать рекомендацию", iconName: "check", tone: "primary", attributes: `data-shift-board-assist-preview type="button" ${selectedCandidate && selectedEmployees.length ? "" : "disabled aria-disabled=\"true\""}` })}
        `,
      })}
    </div>
  `;
}

function renderShiftMasterBoardPage() {
  const model = getShiftMasterBoardModel();
  return renderUiModulePage({
    ariaLabel: "Мастерская",
    className: "shift-master-board-page",
    workspaceClassName: "shift-master-board-workspace",
    contentClassName: "shift-master-board-content",
    header: "",
    content: `
      ${renderShiftMasterBoardTopControls(model)}
      ${model.rows.length ? `
        <div class="shift-master-board-main-grid">
          ${renderShiftMasterBoardDetail(model.selectedRow, model)}
          <div class="shift-master-board-side-column">
            ${renderShiftMasterBoardLanes(model)}
            ${renderShiftMasterBoardDocumentNumberGuide(model.selectedRow)}
            ${renderShiftMasterBoardNormDeviationScaffold(model)}
          </div>
        </div>
      ` : renderUiPanel({
        title: "",
        className: "shift-master-board-panel shift-master-board-empty",
        component: "Canvas",
        surface: "empty-board",
        body: renderUiPanelBody({
          body: renderUiEmptyState({
            iconName: "calendar",
            title: "Доска пуста",
            text: "Выбери дату смены в верхней панели. Доска читает строки из текущего планирования.",
          }),
        }),
      })}
      ${renderShiftMasterBoardAssistModal(model)}
    `,
  });
}

function renderShiftMasterBoardTopControls(model) {
  const activeMasterName = formatShiftMasterPersonName(model.activeProfile?.name, "Мастер");
  const activeMasterDepartment = formatShiftMasterDepartmentName(model.activeProfile?.department);
  const activeMasterCount = model.profileRowCounts.get(model.activeProfile?.id) || 0;
  const masterSelector = model.canSelectMaster ? `
    <section class="shift-master-board-master-switch" aria-label="Выбор мастера">
      <label class="shift-master-board-master-native">
        <select
          data-shift-board-master-select
          aria-label="Мастер"
          tabindex="-1"
          title="${escapeAttribute([formatShiftMasterPersonName(model.activeProfile?.name, "Мастер"), model.activeProfile?.role].filter(Boolean).join(" · "))}"
        >
        ${model.profiles.map((profile) => `
          <option
            value="${escapeAttribute(profile.id)}"
            data-shift-board-master-count="${model.profileRowCounts.get(profile.id) || 0}"
            data-shift-board-master-name="${escapeAttribute(formatShiftMasterPersonName(profile.name, "Мастер"))}"
            data-shift-board-master-department="${escapeAttribute(profile.department || "Отдел не указан")}"
            ${profile.id === model.activeProfile?.id ? "selected" : ""}
          >
            ${escapeHtml([
              formatShiftMasterPersonName(profile.name, "Мастер"),
              formatShiftMasterDepartmentName(profile.department),
              (model.profileRowCounts.get(profile.id) || 0).toLocaleString("ru-RU"),
            ].join(" · "))}
          </option>
        `).join("")}
        </select>
      </label>
      <details class="shift-master-board-master-dropdown ui-dropdown" data-ui-component="Dropdown">
        <summary class="shift-master-board-master-trigger ui-dropdown-trigger" aria-label="Выбрать мастера">
          <span>
            <strong>${escapeHtml(activeMasterName)}</strong>
            <small>${escapeHtml(activeMasterDepartment)}</small>
          </span>
          <em>${activeMasterCount.toLocaleString("ru-RU")}</em>
        </summary>
        <div class="shift-master-board-master-menu ui-dropdown-menu" role="listbox" aria-label="Мастера">
          ${model.profiles.map((profile) => {
            const isActiveProfile = profile.id === model.activeProfile?.id;
            const profileCount = model.profileRowCounts.get(profile.id) || 0;
            return `
              <button
                type="button"
                class="shift-master-board-master-option${isActiveProfile ? " is-active" : ""}"
                data-shift-board-master-option="${escapeAttribute(profile.id)}"
                role="option"
                aria-selected="${isActiveProfile ? "true" : "false"}"
                title="${escapeAttribute(profile.department || "Отдел не указан")}"
              >
                <span>
                  <strong>${escapeHtml(formatShiftMasterPersonName(profile.name, "Мастер"))}</strong>
                  <small>${escapeHtml(formatShiftMasterDepartmentName(profile.department))}</small>
                </span>
                <em>${profileCount.toLocaleString("ru-RU")}</em>
              </button>
            `;
          }).join("")}
        </div>
      </details>
    </section>
  ` : `
    <section class="shift-master-board-master-context" aria-label="Контекст мастера">
      <strong>${escapeHtml(formatShiftMasterPersonName(model.activeProfile?.name || model.authPerson?.name, "Мастер"))}</strong>
      <span>${escapeHtml(model.activeProfile?.role || model.authPerson?.role || "задачи своего участка")}</span>
    </section>
  `;

  return `
    <section class="shift-master-board-top-controls" data-visual-qa-target="shift-master-board-top-controls">
      <div class="shift-master-board-top-row">
        ${renderShiftCalendarControl(model.window, { inputId: "shift-board-calendar-date" })}
        <div class="shift-master-board-kpis" aria-label="Сводка смены">
          ${renderShiftMasterBoardKpi("План", model.plannedQuantity, "шт.")}
          ${renderShiftMasterBoardKpi("Распределено", model.assignedQuantity, "шт.")}
          ${renderShiftMasterBoardKpi("Факт", model.factQuantity, "шт.")}
        </div>
        ${masterSelector}
      </div>
    </section>
  `;
}

function renderShiftMasterBoardKpi(label, value, unit = "") {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${normalizeShiftMasterBoardQuantity(value || 0).toLocaleString("ru-RU")}</strong>
      <small>${escapeHtml(unit)}</small>
    </article>
  `;
}

function renderShiftMasterBoardLanes(model) {
  return renderUiPanel({
    title: "Доска сменных задач",
    meta: `${model.window.label} · ${model.rows.length.toLocaleString("ru-RU")} карточек`,
    className: "shift-master-board-panel shift-master-board-lanes-panel",
    body: renderUiPanelBody({
      body: `
        <div class="shift-master-board-lanes" data-shift-board-lanes>
          ${model.lanes.map((lane) => renderShiftMasterBoardLane(lane, model)).join("")}
        </div>
      `,
    }),
  });
}

function renderShiftMasterBoardNormDeviationScaffold(model) {
  const department = model.selectedRow?.workCenterLabel || model.selectedRow?.workCenter?.name || "Текущий отдел";
  return renderUiPanel({
    title: "Отклонения от норм",
    meta: "информационный отчёт отдела",
    className: "shift-master-board-panel shift-master-board-norm-report",
    body: renderUiPanelBody({
      body: `
        <div class="shift-master-board-norm-report-state">
          <header><span>${escapeHtml(department)}</span><em>Каркас · связь не настроена</em></header>
          <p>После связи с исполнением здесь появятся сравнение действующей ревизии нормы с устойчивым фактом и кандидаты на пересмотр.</p>
          <dl>
            <div><dt>Наблюдений</dt><dd>—</dd></div>
            <div><dt>Отклонений</dt><dd>—</dd></div>
            <div><dt>К пересмотру</dt><dd>—</dd></div>
          </dl>
        </div>
      `,
    }),
  });
}

function renderShiftMasterBoardDocumentNumberGuide(row) {
  if (!row) return "";
  const executors = (row.boardAssignment?.executors || [])
    .filter((executor) => executor.employeeId && normalizeShiftMasterBoardQuantity(executor.quantity || 0) > 0);
  if (!executors.length) return "";
  const requestedEmployeeId = String(ui.shiftMasterBoardPrintPreviewEmployeeId || "");
  const executorIndex = Math.max(0, executors.findIndex((executor) => executor.employeeId === requestedEmployeeId));
  const executor = executors[executorIndex] || executors[0];
  const employee = getShiftMasterEmployee(executor.employeeId);
  const employeeName = formatShiftMasterPersonName(employee?.name || executor.employeeName, "Исполнитель");
  const documentNumber = `${row.documentNumber}-${String(executorIndex + 1).padStart(2, "0")}`;
  const baseParts = String(row.documentNumber || "").split("-");
  const prefix = baseParts[0] || "СЗН";
  const dateCode = baseParts[1] || String(row.dateKey || "").replaceAll("-", "");
  const taskCode = baseParts.at(-1) || "—";
  const workCenterCode = baseParts.slice(2, -1).join("-") || row.workCenter?.code || row.workCenterId || "—";
  const employeeCode = String(executorIndex + 1).padStart(2, "0");
  const parts = [
    [prefix, "тип документа", "Сменный заказ-наряд"],
    [dateCode, "дата смены", row.dateKey ? formatDate(fromDateInput(row.dateKey)) : "Дата не задана"],
    [workCenterCode, "участок", row.workCenterLabel || "Участок не задан"],
    [taskCode, "задание", row.operationName || "Операция не задана"],
    [employeeCode, "лист сотрудника", employeeName],
  ];
  return `
    <section class="shift-master-board-number-guide" aria-label="Расшифровка ${escapeAttribute(documentNumber)}">
      <header>
        <div>
          <span>Расшифровка СЗН сотрудника</span>
          <strong>${escapeHtml(documentNumber)}</strong>
        </div>
        <small>${escapeHtml(`${employeeName} · ${normalizeShiftMasterBoardQuantity(executor.quantity || 0).toLocaleString("ru-RU")} ${row.unit || "шт."}`)}</small>
      </header>
      <div class="shift-master-board-number-guide-flow">
        ${parts.map(([code, label, value]) => `
          <article>
            <strong>${escapeHtml(code)}</strong>
            <span>${escapeHtml(label)}</span>
            <small>${escapeHtml(value)}</small>
          </article>
        `).join("")}
      </div>
      <footer>
        <span>Маршрутная карта</span>
        <strong>${escapeHtml(row.routeName || "Маршрутная карта не найдена")}</strong>
        <small>${escapeHtml(`${getShiftMasterRowOrderLabel(row)} → ${row.operationName || "Операция"} → ${row.workCenterLabel || "Участок"}`)}</small>
      </footer>
    </section>
  `;
}

function renderShiftMasterBoardLane(lane, model) {
  const plannedQuantity = lane.rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0), 0);
  const assignedQuantity = lane.rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0), 0);
  const factQuantity = lane.rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.boardGoodQuantity || 0), 0);
  const laneQuantityLabel = lane.id === "fact"
    ? `${factQuantity.toLocaleString("ru-RU")} факт / ${plannedQuantity.toLocaleString("ru-RU")} план`
    : lane.id === "assigned"
      ? `${assignedQuantity.toLocaleString("ru-RU")} / ${plannedQuantity.toLocaleString("ru-RU")} шт.`
      : `${plannedQuantity.toLocaleString("ru-RU")} шт.`;
  const laneLimits = { assigned: 8 };
  const taskLimit = laneLimits[lane.id] || 0;
  const isLimitExceeded = taskLimit > 0 && lane.rows.length > taskLimit;
  return `
    <section class="shift-master-board-lane is-${escapeAttribute(normalizeUiTone(lane.tone))} is-lane-${escapeAttribute(lane.id)}" data-shift-board-lane="${escapeAttribute(lane.id)}" aria-label="${escapeAttribute(`Колонка доски: ${lane.label}`)}">
      <header>
        <strong>${escapeHtml(lane.label)}</strong>
        <span>${lane.rows.length.toLocaleString("ru-RU")} · ${escapeHtml(laneQuantityLabel)}</span>
        ${taskLimit ? `<em class="shift-master-board-lane-limit ${isLimitExceeded ? "is-warning" : ""}">${isLimitExceeded ? "перегруз" : "лимит задач"} ${lane.rows.length.toLocaleString("ru-RU")} / ${taskLimit.toLocaleString("ru-RU")}</em>` : ""}
        <small>${escapeHtml(lane.caption)}</small>
      </header>
      <div class="shift-master-board-lane-body">
        ${lane.groups.length ? lane.groups.map((group) => `
          <div class="shift-master-board-group">
            <span>${escapeHtml(group.label)}</span>
            ${group.rows.map((row) => renderShiftMasterBoardCard(row, model)).join("")}
          </div>
        `).join("") : `<div class="shift-master-board-lane-empty">нет карточек</div>`}
        ${lane.id === "intake" ? `
          <div class="shift-master-board-assist-trigger-row">
            ${renderUiActionButton({
              iconName: "plus",
              tone: "icon",
              className: "shift-master-board-assist-trigger",
              attributes: `data-shift-board-assist-open type="button" title="Добавить задание" aria-label="Добавить задание"`,
            })}
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function renderShiftMasterBoardCard(row, model) {
  const active = row.id === model.selectedRow?.id;
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
  const assignedQuantity = normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0);
  const allocationStyle = `--board-allocation:${Math.max(0, Math.min(100, row.boardAllocation || 0))}%;`;
  const cardFooter = row.boardSignal.label === "нужно распределить"
    ? ""
    : `
      <span class="shift-master-board-card-footer">
        <em>${escapeHtml(row.boardSignal.label)}</em>
      </span>
    `;
  return `
    <button class="shift-master-board-card is-${escapeAttribute(normalizeUiTone(row.boardSignal.tone))} is-lane-${escapeAttribute(row.boardLaneId || "intake")} ${active ? "is-active" : ""}" data-shift-board-card="${escapeAttribute(row.id)}" type="button" aria-label="${escapeAttribute(`${row.operationName}. ${plannedQuantity.toLocaleString("ru-RU")} ${row.unit || "шт."}. ${row.boardSignal.label}`)}">
      <span class="shift-master-board-card-title">
        <strong>${escapeHtml(row.operationName)}</strong>
        <small>${escapeHtml(getShiftMasterRowRoutePartLabel(row))}</small>
      </span>
      <span class="shift-master-board-card-meta">
        <em>${escapeHtml(row.workCenterLabel)}</em>
        <i>${escapeHtml(row.timeLabel)}</i>
      </span>
      <span class="shift-master-board-card-flow" style="${allocationStyle}">
        <b></b>
        <small>${assignedQuantity.toLocaleString("ru-RU")} / ${plannedQuantity.toLocaleString("ru-RU")} распределено</small>
      </span>
      ${cardFooter}
    </button>
  `;
}

function renderShiftMasterBoardDetail(row, model) {
  if (!row) {
    return renderUiPanel({
    title: "Карточка не выбрана",
    meta: "рабочая область",
    className: "shift-master-board-panel shift-master-board-detail-panel",
    attributes: "data-visual-qa-target=\"shift-master-board-detail-panel\"",
    body: renderUiPanelBody({
      body: renderUiEmptyState({
          iconName: "worker",
          title: "Выбери задачу на доске",
          text: "После выбора появится распределение, сменный лист, факт и подсказки по прошлым периодам.",
        }),
    }),
  });
  }
  return renderUiPanel({
    title: "Рабочая карточка",
    meta: row.documentNumber,
    className: "shift-master-board-panel shift-master-board-detail-panel",
    attributes: "data-visual-qa-target=\"shift-master-board-detail-panel\"",
    body: renderUiPanelBody({
      body: `
        ${renderShiftMasterBoardTaskContext(row, model)}
        ${renderShiftMasterBoardAssignment(row, model)}
        ${renderShiftMasterBoardDocument(row, model)}
      `,
    }),
  });
}

function renderShiftMasterBoardTaskContext(row, model) {
  return `
    <section class="shift-master-board-task-context" data-visual-qa-target="shift-master-board-task-context" aria-label="Контекст выбранной сменной задачи">
      <header class="shift-master-board-task-context-head" data-visual-qa-target="shift-master-board-task-context-head">
        <div class="shift-master-board-task-context-object" aria-label="Изделие: ${escapeAttribute(getShiftMasterRowOrderLabel(row))}">
          <span>Изделие</span>
          <strong title="${escapeAttribute(getShiftMasterRowOrderLabel(row))}">${escapeHtml(getShiftMasterRowOrderLabel(row))}</strong>
        </div>
        <div class="shift-master-board-task-context-operation" aria-label="Операция: ${escapeAttribute(row.operationName || "Операция")}">
          <span>Операция</span>
          <small title="${escapeAttribute(getShiftMasterRowRoutePartLabel(row))}">${escapeHtml(getShiftMasterRowRoutePartLabel(row))}</small>
        </div>
        ${renderShiftMasterBoardCoverage(row)}
      </header>
    </section>
  `;
}

function renderShiftMasterBoardInlineSummary(row) {
  return `
    <section class="shift-master-board-inline-summary" data-visual-qa-target="shift-master-board-inline-summary" aria-label="Сводка выбранной сменной задачи">
      ${renderShiftMasterBoardCoverage(row)}
    </section>
  `;
}

function renderShiftMasterBoardSummaryCell(label, value, options = {}) {
  return `
    <article
      class="shift-master-board-summary-cell ${options.className ? escapeAttribute(options.className) : ""}"
      data-visual-qa-target="shift-master-board-summary-cell"
      data-shift-board-summary-label="${escapeAttribute(label)}"
      aria-label="${escapeAttribute(`${label}: ${value || "нет значения"}`)}"
    >
      <span>${escapeHtml(label)}</span>
      <strong title="${escapeAttribute(value || "")}">${escapeHtml(value || "—")}</strong>
      ${options.secondary ? `<small title="${escapeAttribute(options.secondary)}">${escapeHtml(options.secondary)}</small>` : ""}
    </article>
  `;
}

function getShiftMasterBoardRouteChain(row, model) {
  const currentRouteKey = row.route?.id || row.routeId || row.routeName || "";
  const getStepKey = (item) => item.step?.id
    || item.stepId
    || [item.operationName, item.workCenterId, item.taskLabel].filter(Boolean).join("|");
  const sameRouteRows = (model.allRows || model.rows || [])
    .filter((item) => (item.route?.id || item.routeId || item.routeName || "") === currentRouteKey)
    .sort((left, right) => {
      const leftStart = left.startsAt instanceof Date ? left.startsAt.getTime() : new Date(left.startsAt).getTime();
      const rightStart = right.startsAt instanceof Date ? right.startsAt.getTime() : new Date(right.startsAt).getTime();
      return leftStart - rightStart || String(left.id).localeCompare(String(right.id), "ru");
    });
  const index = sameRouteRows.findIndex((item) => item.id === row.id);
  const currentStepKey = getStepKey(row);
  const previous = index > 0
    ? [...sameRouteRows.slice(0, index)].reverse().find((item) => getStepKey(item) !== currentStepKey) || null
    : null;
  const next = index >= 0 && index < sameRouteRows.length - 1
    ? sameRouteRows.slice(index + 1).find((item) => getStepKey(item) !== currentStepKey) || null
    : null;
  return {
    previous,
    current: row,
    next,
  };
}

function renderShiftMasterBoardRouteChain(row, model) {
  const chain = getShiftMasterBoardRouteChain(row, model);
  const items = [
    ["До", chain.previous, "предыдущая операция в окне"],
    ["Сейчас", chain.current, "текущая карточка"],
    ["После", chain.next, "куда передать дальше"],
  ];
  return `
    <section class="shift-master-board-route-chain" data-visual-qa-target="shift-master-board-route-chain" aria-label="Маршрут передачи">
      <header data-visual-qa-target="shift-master-board-route-chain-header">
        <strong>Маршрут передачи</strong>
      </header>
      <div>
        ${items.map(([label, item, fallback]) => `
          <article
            class="${item?.id === row.id ? "is-current" : ""}"
            data-visual-qa-target="shift-master-board-route-chain-card"
            data-shift-board-route-chain-position="${escapeAttribute(label)}"
            aria-label="${escapeAttribute(`${label}: ${item?.operationName || fallback}`)}"
          >
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(item?.operationName || fallback)}</strong>
            <small>${escapeHtml(item ? `${item.workCenterLabel || "участок не задан"} · ${getShiftMasterRowRoutePartLabel(item)}` : "вне текущего окна")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderShiftMasterBoardCoverage(row) {
  const planned = Math.max(0, normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0));
  const assigned = Math.max(0, normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0));
  const fact = Math.max(0, normalizeShiftMasterBoardQuantity(row.boardGoodQuantity || 0));
  const unit = row.unit || "шт.";
  const allocationRatio = planned > 0 ? Math.min(1, assigned / planned) : 0;
  const factRatio = assigned > 0 ? Math.min(1, fact / assigned) : 0;
  const allocationTone = !assigned ? "neutral" : assigned >= planned ? "ok" : "warning";
  const factTone = !row.boardFact?.updatedAt ? "neutral" : fact >= assigned ? "ok" : "warning";
  const rows = [
    {
      label: "Покрытие плана",
      value: `${assigned.toLocaleString("ru-RU")} / ${planned.toLocaleString("ru-RU")} ${unit}`,
      ratio: allocationRatio,
      tone: allocationTone,
    },
    {
      label: "Факт к распределению",
      value: row.boardFact?.updatedAt ? `${fact.toLocaleString("ru-RU")} / ${assigned.toLocaleString("ru-RU")} ${unit}` : "не закрыт",
      ratio: factRatio,
      tone: factTone,
    },
  ];
  return `
    <section class="shift-master-board-coverage" data-visual-qa-target="shift-master-board-coverage" aria-label="Покрытие сменной задачи">
      <article class="shift-master-board-coverage-combined" data-visual-qa-target="shift-master-board-coverage-card" aria-label="Покрытие плана и факт к распределению">
        ${rows.map((item) => `
          <div class="shift-master-board-coverage-metric is-${escapeAttribute(normalizeUiTone(item.tone))}" data-shift-board-coverage-label="${escapeAttribute(item.label)}" aria-label="${escapeAttribute(`${item.label}: ${item.value}`)}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <i><b style="width: ${Math.round(item.ratio * 100)}%"></b></i>
          </div>
        `).join("")}
      </article>
    </section>
  `;
}

function renderShiftMasterBoardEmployeeOptions(row, selectedEmployeeId = "") {
  const employees = (row.employees || []).filter((person) => person?.id);
  const selectedPerson = selectedEmployeeId
    ? (row.employees || []).find((person) => person.id === selectedEmployeeId) || getShiftMasterEmployee(selectedEmployeeId)
    : null;
  const selectedWithAvailability = selectedPerson
    ? {
      ...selectedPerson,
      availability: selectedPerson.availability || getTimesheetAvailabilityForShiftMasterEmployee(selectedPerson, row.timesheetDateKey || row.dateKey),
    }
    : null;
  const options = selectedWithAvailability && !employees.some((person) => person.id === selectedWithAvailability.id)
    ? [selectedWithAvailability, ...employees]
    : employees;
  return options.length
    ? [`<option value="">Не выбран</option>`, ...options.map((person) => `
      <option value="${escapeAttribute(person.id)}" ${selected(selectedEmployeeId, person.id)} ${person.availability?.isAvailable || person.id === selectedEmployeeId ? "" : "disabled"}>${escapeHtml([formatShiftMasterPersonName(person.name), person.availability?.label].filter(Boolean).join(" · "))}</option>
    `)].join("")
    : `<option value="">Нет доступных по Табелю</option>`;
}

function renderShiftMasterBoardAvailableEmployeeLoadbar(row, model) {
  const capacity = getShiftMasterBoardTimesheetCapacity(row);
  const displayEmployees = capacity.displayEmployees;
  const loadMap = getShiftMasterBoardExecutorLoadMap(model?.allRows || model?.rows || []);
  const unit = row.unit || "шт.";
  const scopeCount = (row.employees || []).length;
  const displayCount = displayEmployees.length;
  const timesheetAvailableCount = capacity.timesheetAvailableEmployees.length;
  if (!displayCount) {
    return `
      <div class="shift-master-board-available-loadbar is-empty" data-visual-qa-target="shift-master-board-available-loadbar">
        <header data-visual-qa-target="shift-master-board-available-header">
          <div>
            <span>Доступные исполнители</span>
            <strong>нет доступных по Табелю</strong>
          </div>
          <small>матрица: ${scopeCount.toLocaleString("ru-RU")}</small>
        </header>
      </div>
    `;
  }

  const rowAssignmentMap = new Map();
  (row.boardAssignment?.executors || []).forEach((executor) => {
    if (!executor.employeeId) return;
    const quantity = normalizeShiftMasterBoardQuantity(executor.quantity || 0);
    const current = rowAssignmentMap.get(executor.employeeId) || { quantity: 0, note: "" };
    current.quantity += quantity;
    current.note = executor.note || current.note || "";
    rowAssignmentMap.set(executor.employeeId, current);
  });

  const cards = displayEmployees.map((employee) => {
    const hours = Math.max(0, Number(employee.availability?.hours || 0));
    const totalMinutes = hours * 60;
    const employeeCapacity = capacity.laborMinutesPerUnit > 0
      ? normalizeShiftMasterBoardQuantity(Math.floor(totalMinutes / capacity.laborMinutesPerUnit))
      : 0;
    const currentLoad = loadMap.get(employee.id) || { quantity: 0, tasks: 0 };
    const currentMinutes = Math.max(0, Number(currentLoad.minutes || 0));
    const assignedQuantity = normalizeShiftMasterBoardQuantity(currentLoad.quantity || 0);
    const rowAssignment = rowAssignmentMap.get(employee.id) || { quantity: 0, note: "" };
    const rowAssignmentQuantity = normalizeShiftMasterBoardQuantity(rowAssignment.quantity || 0);
    const rowAssignmentMinutes = capacity.laborMinutesPerUnit > 0
      ? rowAssignmentQuantity * capacity.laborMinutesPerUnit
      : 0;
    const rowAssignmentTaskCount = rowAssignmentQuantity > 0 ? 1 : 0;
    const baseMinutes = Math.max(0, currentMinutes - rowAssignmentMinutes);
    const baseQuantity = Math.max(0, assignedQuantity - rowAssignmentQuantity);
    const baseTaskCount = Math.max(0, Number(currentLoad.tasks || 0) - rowAssignmentTaskCount);
    const otherTaskDetails = (currentLoad.details || []).filter((detail) => (
      detail.rowId !== row.id && detail.rowId !== row.slotId
    ));
    const previewMinutes = baseMinutes + rowAssignmentMinutes;
    const previewQuantity = baseQuantity + rowAssignmentQuantity;
    const freeQuantity = Math.max(0, employeeCapacity - previewQuantity);
    const visualCapacityMinutes = totalMinutes > 0
      ? totalMinutes
      : Math.max(1, baseMinutes + rowAssignmentMinutes, currentMinutes, rowAssignmentMinutes);
    const ratio = visualCapacityMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((previewMinutes / visualCapacityMinutes) * 100)))
      : 0;
    const baseRatio = visualCapacityMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((baseMinutes / visualCapacityMinutes) * 100)))
      : 0;
    const reserveRatio = visualCapacityMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((rowAssignmentMinutes / visualCapacityMinutes) * 100)))
      : 0;
    const reserveLeft = Math.min(100, baseRatio);
    const reserveWidth = Math.max(0, Math.min(100 - reserveLeft, reserveRatio));
    const isUnavailable = totalMinutes <= 0;
    const tone = isUnavailable ? "neutral" : previewMinutes > totalMinutes ? "warning" : previewMinutes > 0 ? "primary" : "ok";
    const roleLabel = employee.role || employee.position || employee.kind || "исполнитель";
    const loadLabel = isUnavailable
      ? employee.availability?.label || "назначение недоступно"
      : `${formatReportNumber(previewMinutes / 60)} / ${formatReportNumber(totalMinutes / 60)} ч · ${ratio}%`;
    const reserveLabel = totalMinutes > 0
      ? `${freeQuantity.toLocaleString("ru-RU")} ${unit} можно назначить`
      : "ввод недоступен";
    const disabledQuantityAttributes = isUnavailable
      ? `disabled aria-disabled="true" data-shift-board-unavailable="true"`
      : "";
    const loadTooltip = otherTaskDetails.length
      ? `
        <div class="shift-master-board-load-tooltip" role="tooltip">
          <header><span>Ранее назначено</span><strong>${otherTaskDetails.length.toLocaleString("ru-RU")} ${otherTaskDetails.length === 1 ? "задача" : "задачи"}</strong></header>
          ${otherTaskDetails.map((detail) => `
            <article>
              <strong>${escapeHtml(detail.operationName)}</strong>
              <span>${escapeHtml(detail.objectLabel)}</span>
              <small>${detail.quantity.toLocaleString("ru-RU")} ${escapeHtml(unit)} · ${formatReportNumber(detail.minutes / 60)} ч</small>
            </article>
          `).join("")}
        </div>
      `
      : "";
    return `
      <article
        class="shift-master-board-available-person is-${escapeAttribute(normalizeUiTone(tone))}${isUnavailable ? " is-unavailable" : ""}"
        data-visual-qa-target="shift-master-board-available-person"
        data-shift-board-available-person
        data-shift-board-employee-id="${escapeAttribute(employee.id)}"
        ${isUnavailable ? "data-shift-board-unavailable-person=\"true\"" : ""}
        data-shift-board-base-minutes="${escapeAttribute(baseMinutes)}"
        data-shift-board-total-minutes="${escapeAttribute(totalMinutes)}"
        data-shift-board-base-quantity="${escapeAttribute(baseQuantity)}"
        data-shift-board-capacity-quantity="${escapeAttribute(employeeCapacity)}"
        data-shift-board-base-tasks="${escapeAttribute(baseTaskCount)}"
        data-shift-board-unit="${escapeAttribute(unit)}"
        ${isUnavailable ? `data-shift-board-unavailable-label="${escapeAttribute(employee.availability?.label || "Ввод недоступен")}"` : ""}
        style="--employee-load:${ratio}%; --employee-base-load:${baseRatio}%; --employee-reserve-left:${reserveLeft}%; --employee-reserve-load:${reserveWidth}%;"
      >
        <div class="shift-master-board-available-person-head">
          <div class="shift-master-board-available-person-copy">
            <strong title="${escapeAttribute(formatShiftMasterPersonName(employee.name))}">${renderShiftMasterPersonNameLines(employee.name)}</strong>
            <span title="${escapeAttribute(roleLabel)}">${escapeHtml(roleLabel)}</span>
          </div>
          <strong class="shift-master-board-available-load-value" data-shift-board-available-hours>${escapeHtml(loadLabel)}</strong>
        </div>
        <i tabindex="0" aria-label="${escapeAttribute(baseTaskCount > 0 ? `Ранее назначено: ${baseTaskCount} ${baseTaskCount === 1 ? "задача" : "задачи"}, ${formatReportNumber(baseMinutes / 60)} часов` : "Нет ранее назначенных задач")}">
          <b class="is-base"></b>
          <b class="is-reserve"></b>
        </i>
        ${loadTooltip}
        <label class="shift-master-board-available-quantity" data-visual-qa-target="shift-master-board-available-quantity" aria-label="${escapeAttribute(`Количество для распределения: ${formatShiftMasterPersonName(employee.name)}`)}">
          <span>Кол-во</span>
          <input
            data-shift-board-available-quantity
            data-shift-board-available-employee="${escapeAttribute(employee.id)}"
            data-shift-board-available-name="${escapeAttribute(employee.name || "Исполнитель")}"
            data-shift-board-available-minutes-per-unit="${escapeAttribute(capacity.laborMinutesPerUnit || 0)}"
            data-shift-board-empty-quantity="${rowAssignmentQuantity > 0 ? "false" : "true"}"
            ${disabledQuantityAttributes}
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            value="${escapeAttribute(rowAssignmentQuantity || 0)}"
            aria-label="${escapeAttribute(`Плановое количество: ${formatShiftMasterPersonName(employee.name)}`)}"
          />
        </label>
        <footer class="shift-master-board-available-meta" data-visual-qa-target="shift-master-board-available-capacity">
          <span>
            <em>Доступно</em>
            <strong data-shift-board-available-caption>${escapeHtml(reserveLabel)}</strong>
          </span>
        </footer>
      </article>
    `;
  }).join("");

  return `
    <div class="shift-master-board-available-loadbar" data-visual-qa-target="shift-master-board-available-loadbar">
      <header data-visual-qa-target="shift-master-board-available-header">
        <div>
          <span>Доступные исполнители</span>
          <strong>${timesheetAvailableCount.toLocaleString("ru-RU")} из ${scopeCount.toLocaleString("ru-RU")} доступны по Табелю</strong>
        </div>
        <small>${capacity.laborMinutesPerUnit ? `${formatReportNumber(capacity.laborMinutesPerUnit)} мин/ед.` : "нет нормы"}</small>
      </header>
      <div class="shift-master-board-available-list">
        ${cards}
      </div>
    </div>
  `;
}

function renderShiftMasterBoardAssignment(row, model) {
  return `
    <section
      class="shift-master-board-section"
      data-visual-qa-target="shift-master-board-assignment-panel"
      data-shift-board-assignment-panel="${escapeAttribute(row.id)}"
      data-shift-board-assignment-master-id="${escapeAttribute(row.masterProfile?.id || row.boardAssignment?.masterId || "")}"
      data-shift-board-assignment-scope-count="${(row.employees || []).length}"
      data-shift-board-assignment-available-count="${(row.availableEmployees || []).length}"
    >
      <header data-visual-qa-target="shift-master-board-assignment-header">
        <div>
          <strong>Распределение смены</strong>
          <span>матрица доступа: ${(row.employees || []).length.toLocaleString("ru-RU")} · доступно по Табелю: ${(row.availableEmployees || []).length.toLocaleString("ru-RU")}</span>
        </div>
        ${renderUiStatusToken(row.boardAssignedQuantity > 0 ? "есть назначение" : "черновик", row.boardAssignedQuantity > 0 ? "ok" : "neutral")}
      </header>
      ${renderShiftMasterBoardAvailableEmployeeLoadbar(row, model)}
      <div class="shift-master-board-actions">
        ${renderUiActionButton({
          label: "Сбросить доску",
          iconName: "trashSoft",
          attributes: `data-shift-board-reset type="button"`,
        })}
        ${renderUiActionButton({
          label: "Сохранить",
          iconName: "check",
          tone: "primary",
          attributes: `data-shift-board-save-assignment="${escapeAttribute(row.id)}" type="button"`,
        })}
      </div>
    </section>
  `;
}

function renderShiftMasterBoardDocument(row, model) {
  const assignedQuantity = normalizeShiftMasterBoardQuantity(
    row.boardAssignedQuantity || getShiftMasterBoardAssignmentQuantity(row.boardAssignment || {}),
  );
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
  const unit = row.unit || "шт.";
  const documentReady = Boolean(row.boardAssignment.issued || assignedQuantity > 0);
  const documentExecutors = (row.boardAssignment?.executors || [])
    .map((executor) => ({
      ...executor,
      quantity: normalizeShiftMasterBoardQuantity(executor.quantity || 0),
      employee: getShiftMasterEmployee(executor.employeeId),
    }))
    .filter((executor) => executor.employeeId && executor.quantity > 0);
  const assignmentCreatedAt = row.boardAssignment?.createdAt
    || row.boardAssignment?.issuedAt
    || row.boardAssignment?.updatedAt
    || "";
  const assignmentUpdatedAt = row.boardAssignment?.updatedAt || "";
  const assignmentWasModified = Boolean(
    assignmentCreatedAt
    && assignmentUpdatedAt
    && toDate(assignmentUpdatedAt).getTime() > toDate(assignmentCreatedAt).getTime(),
  );
  const createdAtLabel = assignmentCreatedAt ? formatDateTimeShort(assignmentCreatedAt) : "—";
  const updatedAtLabel = assignmentWasModified ? formatDateTimeShort(assignmentUpdatedAt) : "—";
  const printRecords = normalizePlainRecord(row.boardAssignment?.printRecords);
  const executorRows = documentExecutors.length
    ? documentExecutors.map((executor, index) => {
      const employeeName = formatShiftMasterPersonName(executor.employee?.name, "Исполнитель");
      const employeeDocumentNumber = `${row.documentNumber}-${String(index + 1).padStart(2, "0")}`;
      const printRecord = normalizePlainRecord(printRecords[executor.employeeId]);
      const currentRevisionAt = String(row.boardAssignment?.updatedAt || row.boardAssignment?.createdAt || "");
      const printedRevisionAt = String(printRecord.revisionAt || "");
      const wasPrinted = Boolean(printRecord.printedAt);
      const changedAfterPrint = Boolean(wasPrinted && currentRevisionAt && printedRevisionAt !== currentRevisionAt);
      const printStatus = changedAfterPrint
        ? { label: "изменён", tone: "warning" }
        : wasPrinted && printRecord.afterChange
          ? { label: "распечатан после изм.", tone: "ok" }
          : wasPrinted
            ? { label: "распечатан", tone: "ok" }
            : row.boardAssignment.issued
              ? { label: "готов к печати", tone: "neutral" }
              : { label: "сформирован", tone: "neutral" };
      return `
        <article class="shift-master-board-document-executor" data-shift-board-document-employee="${escapeAttribute(executor.employeeId)}">
          <span>${(index + 1).toLocaleString("ru-RU")}</span>
          <strong title="${escapeAttribute(employeeName)}">${escapeHtml(employeeName)}</strong>
          <small class="shift-master-board-document-executor-number" title="${escapeAttribute(employeeDocumentNumber)}">${escapeHtml(employeeDocumentNumber)}</small>
          <small>${escapeHtml(`${executor.quantity.toLocaleString("ru-RU")} ${unit}`)}</small>
          <small title="${escapeAttribute(assignmentCreatedAt || "Дата создания не зафиксирована")}">${escapeHtml(createdAtLabel)}</small>
          <small title="${escapeAttribute(assignmentWasModified ? assignmentUpdatedAt : "Изменений не было")}">${escapeHtml(updatedAtLabel)}</small>
          ${renderUiStatusToken(printStatus.label, printStatus.tone)}
          ${renderUiActionButton({
            label: "Печать",
            iconName: "download",
            attributes: `data-shift-board-print="${escapeAttribute(row.id)}" data-shift-board-print-employee="${escapeAttribute(executor.employeeId)}" type="button"`,
          })}
        </article>
      `;
    }).join("")
    : `<div class="shift-master-board-document-empty">Сначала распределите количество между сотрудниками</div>`;
  const sourceOrderNumber = getShiftMasterRowOrderSource(row);
  return `
    <section class="shift-master-board-section" data-visual-qa-target="shift-master-board-document-panel">
      <div class="shift-master-board-document" data-visual-qa-target="shift-master-board-document-card" aria-label="${escapeAttribute(`Сменный лист ${row.documentNumber}`)}">
        <div>
          <span>Сменный лист</span>
          <strong>${escapeHtml(row.documentNumber)}</strong>
          <small title="${escapeAttribute(sourceOrderNumber ? `Сформирован из заказ-наряда ${sourceOrderNumber}` : "Исходный заказ-наряд не найден")}">${documentReady
            ? escapeHtml(sourceOrderNumber ? `из заказ-наряда ${sourceOrderNumber}` : "исходный заказ-наряд не найден")
            : "сначала распределите количество"}</small>
        </div>
        <div class="shift-master-board-document-meta" aria-label="Контекст сменного листа">
          <div><span>Изделие</span><strong title="${escapeAttribute(getShiftMasterRowOrderLabel(row))}">${escapeHtml(getShiftMasterRowOrderLabel(row))}</strong></div>
          <div><span>Операция</span><strong title="${escapeAttribute(row.operationName || "Операция")}">${escapeHtml(row.operationName || "Операция")}</strong></div>
          <div><span>Участок</span><strong title="${escapeAttribute(row.workCenterLabel || "Участок не задан")}">${escapeHtml(row.workCenterLabel || "Участок не задан")}</strong></div>
          <div><span>Количество</span><strong>${escapeHtml(`${assignedQuantity.toLocaleString("ru-RU")} / ${plannedQuantity.toLocaleString("ru-RU")} ${unit}`)}</strong></div>
        </div>
        <div class="shift-master-board-document-route-cell">
          ${renderShiftMasterBoardRouteChain(row, model)}
        </div>
        <div class="shift-master-board-document-executors" aria-label="Сменные листы сотрудников">
          ${documentExecutors.length ? `
            <div class="shift-master-board-document-executor-head" aria-hidden="true">
              <span>№</span>
              <span>Сотрудник</span>
              <span>Сменный лист</span>
              <span>Количество</span>
              <span>Создан</span>
              <span>Изменён</span>
              <span>Статус</span>
              <span>Действие</span>
            </div>
          ` : ""}
          ${executorRows}
        </div>
      </div>
    </section>
  `;
}

function renderShiftMasterBoardSheetModal() {
  const slotId = String(ui.shiftMasterBoardPrintPreviewId || "");
  if (!slotId) return "";
  const model = getShiftMasterBoardModel();
  const row = model.allRows.find((item) => item.id === slotId) || model.rows.find((item) => item.id === slotId) || null;
  if (!row) return "";
  const sheetContract = row.boardAssignment.sheetContract
    || buildShiftMasterBoardSheetContract(row, row.boardAssignment, row.boardFact);
  const transfer = row.boardFact.transferContract
    || row.boardAssignment.transferContract
    || sheetContract.transferContract
    || buildShiftMasterBoardTransferContract(row, row.boardAssignment, row.boardFact);
  const plannedQuantity = normalizeShiftMasterBoardQuantity(sheetContract.plannedQuantity || 0);
  const assignedQuantity = normalizeShiftMasterBoardQuantity(sheetContract.assignedQuantity || 0);
  const factQuantity = normalizeShiftMasterBoardQuantity(transfer.factQuantity || sheetContract.factQuantity || 0);
  const previewEmployeeId = String(ui.shiftMasterBoardPrintPreviewEmployeeId || "");
  const previewEmployeeIndex = previewEmployeeId
    ? (sheetContract.executors || []).findIndex((executor) => executor.employeeId === previewEmployeeId)
    : -1;
  const previewDocumentNumber = previewEmployeeIndex >= 0
    ? `${sheetContract.documentNumber || row.documentNumber}-${String(previewEmployeeIndex + 1).padStart(2, "0")}`
    : (sheetContract.documentNumber || row.documentNumber);
  const visibleExecutors = previewEmployeeId
    ? (sheetContract.executors || []).filter((executor) => executor.employeeId === previewEmployeeId)
    : (sheetContract.executors || []);
  const executors = visibleExecutors
    .map((executor) => `${formatShiftMasterPersonName(executor.employeeName, "Исполнитель не выбран")} · ${normalizeShiftMasterBoardQuantity(executor.quantity || 0).toLocaleString("ru-RU")} ${sheetContract.unit || "шт."}`);
  const previewAssignedQuantity = visibleExecutors.length
    ? visibleExecutors.reduce((sum, executor) => sum + normalizeShiftMasterBoardQuantity(executor.quantity || 0), 0)
    : assignedQuantity;
  return `
    <div class="modal-backdrop shift-master-board-sheet-backdrop" data-modal-backdrop>
      ${renderUiModalFrame({
        className: "large-modal shift-master-board-sheet-modal",
        size: "large",
        attributes: "aria-label=\"Предпросмотр сменного листа\"",
        title: previewDocumentNumber,
        meta: "Предпросмотр сменного листа",
        headActions: renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-close-modal type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" }),
        body: `
        <div class="shift-master-board-sheet" data-shift-board-print-sheet>
          <header class="shift-master-board-sheet-print-head">
            <div><span>Сменный лист</span><strong>${escapeHtml(previewDocumentNumber)}</strong></div>
            <div><span>Дата и время работы</span><strong>${escapeHtml(row.timeLabel)}</strong></div>
            <div><span>Исполнитель</span><strong>${escapeHtml(executors.length ? executors[0] : "Не назначен")}</strong></div>
          </header>
          <section>
            <span>Заказ-наряд</span>
            <strong>${escapeHtml(sheetContract.orderLabel)}</strong>
            <small>${escapeHtml(sheetContract.routePartLabel)}</small>
          </section>
          <section>
            <span>Операция</span>
            <strong>${escapeHtml(sheetContract.operationName)}</strong>
            <small>${escapeHtml(sheetContract.workCenterLabel)} · ${escapeHtml(sheetContract.resourceLabel)}</small>
          </section>
          <section>
            <span>Ответственный</span>
            <strong>${escapeHtml(formatShiftMasterPersonName(sheetContract.masterName, "Мастер не назначен"))}</strong>
            <small>${escapeHtml(row.timeLabel)}</small>
          </section>
          <section class="is-wide">
            <span>Кол-во</span>
            <div class="shift-master-board-sheet-metrics">
              <article><small>План</small><strong>${plannedQuantity.toLocaleString("ru-RU")}</strong></article>
              <article><small>По листу</small><strong>${previewAssignedQuantity.toLocaleString("ru-RU")}</strong></article>
              <article><small>Факт</small><strong>${factQuantity.toLocaleString("ru-RU")}</strong></article>
            </div>
          </section>
          <section class="is-wide">
            <span>Исполнители</span>
            <strong>${executors.length ? executors.map(escapeHtml).join("<br>") : "Не назначены"}</strong>
          </section>
          <section class="is-wide">
            <span>Передача</span>
            <div class="shift-master-board-sheet-transfer">
              <article>
                <small>Откуда</small>
                <strong>${escapeHtml(transfer.fromWorkCenterLabel)}</strong>
                <small>${escapeHtml(transfer.fromOperationName)}</small>
              </article>
              <article>
                <small>Куда</small>
                <strong>${escapeHtml(transfer.toWorkCenterLabel)}</strong>
                <small>${escapeHtml(transfer.toOperationName)}</small>
              </article>
              <article>
                <small>Статус</small>
                <strong>${escapeHtml(transfer.targetLabel)}</strong>
                <small>${transfer.remainingQuantity > 0 ? `${transfer.remainingQuantity.toLocaleString("ru-RU")} ${escapeHtml(transfer.unit)} остаток` : "остатка нет"}</small>
              </article>
            </div>
          </section>
          <section class="is-wide">
            <span>Контроль передачи</span>
            <div class="shift-master-board-sheet-signatures">
              <i>Выдал мастер</i>
              <i>Принял участок</i>
	              <i>Факт смены зафиксирован</i>
            </div>
          </section>
          <footer class="shift-master-board-sheet-print-foot">
            <span>${escapeHtml(previewDocumentNumber)}</span>
            <span>Сформировано из распределения мастерской</span>
          </footer>
        </div>
      `,
        actions: `
          ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" })}
          ${renderUiActionButton({ label: "Печать / PDF", iconName: "print", tone: "primary", attributes: "data-shift-board-print-run type=\"button\"" })}
        `,
      })}
    </div>
  `;
}

function renderShiftMasterBoardActionModal() {
  const pending = ui.shiftMasterBoardPendingAction || null;
  if (!pending?.type) return "";
  const isReset = pending.type === "reset";
  const title = isReset ? "Сбросить доску?" : "Сохранить распределение?";
  const description = isReset
    ? "Будет очищено текущее оперативное состояние доски для всех карточек: распределения по сотрудникам, перемещения между колонками, внесённый факт и переносы остатков."
    : "Текущее распределение выбранной сменной задачи будет сохранено, задача перейдёт в работу, а сменное задание станет доступно для печати.";
  const impactItems = isReset
    ? [
      "Удалятся сохранённые назначения сотрудников, включая устаревшие назначения по удалённым заказ-нарядам.",
      "Очистятся факты выполнения и созданные переносы остатков на этой доске.",
      "Плановые даты, заказ-наряды и операции в модуле Планирование не изменятся.",
    ]
    : [
      "За сотрудниками закрепятся указанные количества по выбранной операции.",
      "Загрузка сотрудников и состояние карточки на доске будут пересчитаны.",
      "Плановые даты и исходный заказ-наряд не изменятся.",
    ];
  return `
    <div class="modal-backdrop shift-master-board-action-backdrop" data-modal-backdrop>
      ${renderUiModalFrame({
        className: "shift-master-board-action-modal",
        size: "small",
        attributes: `aria-label="${escapeAttribute(title)}"`,
        title,
        meta: isReset ? "Необратимое действие для оперативной доски" : "Подтверждение сменного назначения",
        headActions: renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-shift-board-cancel-action type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" }),
        body: `
          <div class="shift-master-board-action-summary is-${isReset ? "warning" : "primary"}">
            <strong>${escapeHtml(description)}</strong>
            <span>На что повлияет:</span>
            <ul>${impactItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        `,
        actions: `
          ${renderUiActionButton({ label: "Отмена", iconName: "close", attributes: "data-shift-board-cancel-action type=\"button\"" })}
          ${renderUiActionButton({ label: isReset ? "Сбросить доску" : "Сохранить распределение", iconName: isReset ? "trashSoft" : "check", tone: isReset ? "warning" : "primary", attributes: `data-shift-board-confirm-action="${isReset ? "reset" : "save"}" type="button"` })}
        `,
      })}
    </div>
  `;
}

function getShiftMasterDemoLanes(rows = []) {
  const queueRows = rows.filter((row) => !row.isAssigned && !row.isIssued);
  const assignedRows = rows.filter((row) => row.isAssigned && !row.isIssued);
  const printRows = rows.filter((row) => row.isIssued);
  return [
    {
      id: "queue",
      title: "Очередь смены",
      caption: "плановые строки из Ганта",
      iconName: "calendar",
      tone: "neutral",
      rows: queueRows.length || assignedRows.length || printRows.length ? queueRows : rows,
    },
    {
      id: "assign",
      title: "Распределение",
      caption: "назначение ресурсов",
      iconName: "worker",
      tone: "warning",
      rows: assignedRows,
    },
    {
      id: "print",
      title: "Сменные листы",
      caption: "макеты документов мастера",
      iconName: "document",
      tone: "ok",
      rows: printRows,
    },
  ];
}

function getShiftMasterRowOrderLabel(row = {}) {
  return row.orderLabel || row.routeName || "Заказ-наряд";
}

function getShiftMasterRowOrderSource(row = {}) {
  const planningOrderId = row.documentContract?.planningOrderId
    || getSlotPlanningOrderId(row.slot || {}, row.route?.id || row.routeId || "")
    || row.route?.id
    || row.routeId
    || "";
  const order = planningOrderId ? getBatch(planningOrderId) : null;
  const number = order?.number
    || order?.orderNumber
    || order?.documentNumber
    || order?.documentContract?.number
    || order?.documentContract?.title
    || planningOrderId;
  return String(number || "").trim();
}

function getShiftMasterRowRouteLabel(row = {}) {
  return row.routeName || "Маршрутная карта";
}

function getShiftMasterRowRoutePartLabel(row = {}) {
  return row.taskLabel || row.operationName || "Часть маршрутной карты";
}

function readShiftMasterBoardAssignmentPanel(panel) {
  const quantityInputs = Array.from(panel?.querySelectorAll("[data-shift-board-available-quantity]") || []);
  const uniqueEmployees = new Set();
  const quantityExecutors = quantityInputs.map((input, index) => {
    const quantity = normalizeShiftMasterBoardQuantity(input.value || 0);
    const minutesPerUnit = normalizePlanningLaborPositiveNumber(input.dataset.shiftBoardAvailableMinutesPerUnit || 0);
    const hours = minutesPerUnit > 0 && quantity > 0 ? (quantity * minutesPerUnit) / 60 : 0;
    return {
      id: `quantity-${input.dataset.shiftBoardAvailableEmployee || index + 1}`,
      employeeId: input.dataset.shiftBoardAvailableEmployee || "",
      quantity,
      note: hours > 0 ? `${formatReportNumber(hours)} ч` : "",
    };
  }).filter((executor) => executor.employeeId && executor.quantity > 0);
  const executors = quantityExecutors.filter((executor) => {
    if (executor.employeeId && uniqueEmployees.has(executor.employeeId)) return false;
    if (executor.employeeId) uniqueEmployees.add(executor.employeeId);
    return true;
  });
  return {
    masterId: panel?.dataset.shiftBoardAssignmentMasterId || ui.activeShiftMasterId || "",
    resourceId: "",
    riskReason: "",
    note: "",
    executors,
    updatedAt: new Date().toISOString(),
  };
}

function readShiftMasterBoardCurrentAssignmentPatch(trigger = null, slotId = "") {
  const panelBySlot = slotId
    ? app?.querySelector(`[data-shift-board-assignment-panel="${CSS.escape(slotId)}"]`)
    : null;
  const detailPanel = trigger?.closest?.(".shift-master-board-detail-panel")
    || trigger?.closest?.("[data-visual-qa-target=\"shift-master-board-detail-panel\"]")
    || null;
  const panel = panelBySlot
    || detailPanel?.querySelector("[data-shift-board-assignment-panel]")
    || app?.querySelector("[data-shift-board-assignment-panel]")
    || null;
  return panel ? readShiftMasterBoardAssignmentPanel(panel) : {};
}

function mergeShiftMasterBoardIssueAssignment(previous = {}, panelPatch = {}) {
  const panelExecutors = Array.isArray(panelPatch.executors) ? panelPatch.executors : [];
  const previousExecutors = Array.isArray(previous.executors) ? previous.executors : [];
  return {
    ...previous,
    ...panelPatch,
    executors: panelExecutors.length ? panelExecutors : previousExecutors,
    resourceId: panelPatch.resourceId || previous.resourceId || "",
    riskReason: panelPatch.riskReason || previous.riskReason || "",
    note: typeof panelPatch.note === "string" && panelPatch.note
      ? panelPatch.note
      : previous.note || "",
  };
}

function persistShiftMasterBoardAssignmentInput(input = null) {
  const panel = input?.closest?.("[data-shift-board-assignment-panel]") || null;
  const slotId = panel?.dataset.shiftBoardAssignmentPanel || "";
  if (!slotId) return null;
  return saveShiftMasterBoardAssignment(slotId, readShiftMasterBoardAssignmentPanel(panel));
}

function syncShiftMasterBoardQuantityInputState(input = null) {
  if (!input) return;
  const quantity = normalizeShiftMasterBoardQuantity(input.value || 0);
  input.dataset.shiftBoardEmptyQuantity = quantity > 0 ? "false" : "true";
}

function normalizeShiftMasterBoardQuantityInputValue(input = null) {
  if (!input) return;
  const rawValue = String(input.value || "");
  const numericValue = rawValue.replace(/\D+/g, "").replace(/^0+(?=\d)/, "");
  if (numericValue !== rawValue) input.value = numericValue;
  syncShiftMasterBoardQuantityInputState(input);
}

function clearShiftMasterBoardZeroQuantityInput(input = null) {
  if (!input) return;
  if (normalizeShiftMasterBoardQuantity(input.value || 0) !== 0) return;
  input.value = "";
  input.dataset.shiftBoardEmptyQuantity = "editing";
}

function restoreShiftMasterBoardZeroQuantityInput(input = null) {
  if (!input) return;
  if (!String(input.value || "").trim()) input.value = "0";
  syncShiftMasterBoardQuantityInputState(input);
}

function updateShiftMasterBoardAvailableQuantityPreview(input) {
  const card = input?.closest("[data-shift-board-available-person]");
  if (!card) return;
  syncShiftMasterBoardQuantityInputState(input);
  const quantity = normalizeShiftMasterBoardQuantity(input.value || 0);
  const minutesPerUnit = normalizePlanningLaborPositiveNumber(input.dataset.shiftBoardAvailableMinutesPerUnit || 0);
  const baseMinutes = Math.max(0, Number(card.dataset.shiftBoardBaseMinutes || 0) || 0);
  const totalMinutes = Math.max(0, Number(card.dataset.shiftBoardTotalMinutes || 0) || 0);
  const baseQuantity = Math.max(0, Number(card.dataset.shiftBoardBaseQuantity || 0) || 0);
  const capacityQuantity = Math.max(0, Number(card.dataset.shiftBoardCapacityQuantity || 0) || 0);
  const baseTasks = Math.max(0, Number(card.dataset.shiftBoardBaseTasks || 0) || 0);
  const unit = card.dataset.shiftBoardUnit || "шт.";
  const reserveMinutes = minutesPerUnit > 0 ? quantity * minutesPerUnit : 0;
  const previewMinutes = baseMinutes + reserveMinutes;
  const previewQuantity = baseQuantity + quantity;
  const visualCapacityMinutes = totalMinutes > 0
    ? totalMinutes
    : Math.max(1, baseMinutes + reserveMinutes, reserveMinutes);
  const ratio = visualCapacityMinutes > 0
    ? Math.max(0, Math.min(100, Math.round((previewMinutes / visualCapacityMinutes) * 100)))
    : 0;
  const baseRatio = visualCapacityMinutes > 0
    ? Math.max(0, Math.min(100, Math.round((baseMinutes / visualCapacityMinutes) * 100)))
    : 0;
  const reserveRatio = visualCapacityMinutes > 0
    ? Math.max(0, Math.min(100, Math.round((reserveMinutes / visualCapacityMinutes) * 100)))
    : 0;
  const reserveLeft = Math.min(100, baseRatio);
  const reserveWidth = Math.max(0, Math.min(100 - reserveLeft, reserveRatio));
  const tone = totalMinutes <= 0
    ? "neutral"
    : previewMinutes > totalMinutes
      ? "warning"
      : previewMinutes > 0
        ? "primary"
        : "ok";
  card.style.setProperty("--employee-load", `${ratio}%`);
  card.style.setProperty("--employee-base-load", `${baseRatio}%`);
  card.style.setProperty("--employee-reserve-left", `${reserveLeft}%`);
  card.style.setProperty("--employee-reserve-load", `${reserveWidth}%`);
  card.classList.remove("is-neutral", "is-primary", "is-ok", "is-warning", "is-danger");
  card.classList.add(`is-${normalizeUiTone(tone)}`);

  const hoursNode = card.querySelector("[data-shift-board-available-hours]");
  const captionNode = card.querySelector("[data-shift-board-available-caption]");
  const totalHours = totalMinutes / 60;
  const freeQuantity = Math.max(0, capacityQuantity - previewQuantity);
  if (hoursNode) {
    hoursNode.textContent = totalMinutes <= 0
      ? "назначение недоступно"
      : `${formatReportNumber(previewMinutes / 60)} / ${formatReportNumber(totalHours)} ч · ${ratio}%`;
  }
  if (captionNode) {
    captionNode.textContent = totalMinutes > 0
      ? `${freeQuantity.toLocaleString("ru-RU")} ${unit} можно назначить`
      : "ввод недоступен";
  }
}

function updateShiftMasterBoardLane(slotId = "", laneId = "") {
  const normalizedLane = normalizeShiftMasterBoardLane(laneId);
  if (!slotId || !normalizedLane) return;
  ui.shiftMasterBoardLaneBySlot = {
    ...normalizePlainRecord(ui.shiftMasterBoardLaneBySlot),
    [slotId]: normalizedLane,
  };
  ui.shiftMasterBoardSelectedSlotId = slotId;
  persistUiState();
}

function canMoveShiftMasterBoardCardToLane(row, laneId = "") {
  const normalizedLane = normalizeShiftMasterBoardLane(laneId);
  if (!row || !normalizedLane) {
    return { ok: false, message: "Карточка или колонка не найдены." };
  }
  if (normalizedLane === "intake") {
    return { ok: true, message: "Карточка возвращена в план смены." };
  }
  if (normalizedLane === "assigned" && normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0) <= 0) {
    return { ok: false, message: "Сначала сохрани распределение исполнителей и количества." };
  }
  if (normalizedLane === "fact" && !row.boardFact?.updatedAt) {
    return { ok: false, message: "Факт закрывается через форму конца смены." };
  }
  return { ok: true, message: "Карточка перемещена на доске." };
}

function moveShiftMasterBoardCardToLane(slotId = "", laneId = "") {
  const model = getShiftMasterBoardModel();
  const row = model.allRows.find((item) => item.id === slotId) || model.rows.find((item) => item.id === slotId) || null;
  const result = canMoveShiftMasterBoardCardToLane(row, laneId);
  if (!result.ok) return result;
  updateShiftMasterBoardLane(slotId, laneId);
  return result;
}

function saveShiftMasterBoardAssignment(slotId = "", patch = {}, { notifyOwner = true } = {}) {
  if (!slotId) return null;
  const row = getShiftMasterBoardRowById(slotId);
  const previous = normalizePlainRecord(ui.shiftMasterBoardAssignments)[slotId] || {};
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row?.plannedQuantity || previous.plannedQuantity || 0);
  const workCenterId = row?.workCenterId || patch.workCenterId || previous.workCenterId || "";
  const requestedMasterId = patch.masterId || previous.masterId || row?.boardAssignment?.masterId || row?.masterProfile?.id || ui.activeShiftMasterId || "";
  const requestedMasterProfile = getShiftMasterProfile(requestedMasterId);
  const matrixEmployees = requestedMasterProfile?.id
    ? getShiftMasterAssignableEmployees(requestedMasterProfile, workCenterId)
    : [];
  const allowedEmployees = matrixEmployees.length ? matrixEmployees : row?.employees || [];
  const allowedEmployeeIds = new Set(allowedEmployees.map((employee) => employee.id).filter(Boolean));
  const executors = normalizeShiftMasterExecutors(patch.executors || previous.executors || [])
    .filter((executor) => !executor.employeeId || !allowedEmployeeIds.size || allowedEmployeeIds.has(executor.employeeId));
  const assignedQuantity = executors.reduce((sum, executor) => (
    sum + normalizeShiftMasterBoardQuantity(executor.quantity || 0)
  ), 0);
  const routeId = row?.route?.id || row?.routeId || previous.routeId || "";
  const sourceSlotId = row?.slotId || row?.slot?.id || previous.slotId || slotId;
  const savedAt = patch.updatedAt || new Date().toISOString();
  const baseNext = {
    ...previous,
    ...patch,
    slotId: sourceSlotId,
    sourceRowId: row?.id || previous.sourceRowId || slotId,
    routeId,
    planningOrderId: getSlotPlanningOrderId(row?.slot || {}, routeId),
    stepId: row?.step?.id || row?.stepId || previous.stepId || "",
    workCenterId,
    masterId: requestedMasterProfile?.id || requestedMasterId || previous.masterId || "",
    resourceId: patch.resourceId || previous.resourceId || row?.resourceId || "",
    plannedQuantity,
    laborMinutesPerUnit: row ? getShiftMasterBoardLaborMinutesPerUnit(row) : normalizePlanningLaborPositiveNumber(previous.laborMinutesPerUnit || 0),
    assignedQuantity,
    executors,
    riskReason: patch.riskReason || (assignedQuantity > 0 && assignedQuantity < plannedQuantity ? "resource" : previous.riskReason || ""),
    status: patch.issued || previous.issued ? "issued" : "draft",
    createdAt: previous.createdAt || patch.createdAt || previous.issuedAt || previous.updatedAt || savedAt,
    issuedAt: previous.issuedAt || patch.issuedAt || (patch.issued ? savedAt : ""),
    unit: row?.unit || previous.unit || "шт.",
    updatedAt: savedAt,
  };
  const sheetContract = row
    ? buildShiftMasterBoardSheetContract(row, baseNext, row.boardFact || {})
    : previous.sheetContract || null;
  const next = {
    ...baseNext,
    transferContract: sheetContract?.transferContract || previous.transferContract || null,
    sheetContract,
  };
  ui.shiftMasterBoardAssignments = {
    ...normalizePlainRecord(ui.shiftMasterBoardAssignments),
    [slotId]: next,
  };
  ui.shiftMasterBoardLaneBySlot = {
    ...normalizePlainRecord(ui.shiftMasterBoardLaneBySlot),
    [slotId]: assignedQuantity > 0 || next.issued ? "assigned" : "intake",
  };
  ui.shiftMasterBoardSelectedSlotId = slotId;
  persistUiState();
  if (notifyOwner) void onShiftMasterBoardAssignmentSaved(row, next);
  return next;
}

function markShiftMasterBoardSheetPrinted(slotId = "", employeeId = "") {
  if (!slotId || !employeeId) return null;
  const assignmentStore = normalizePlainRecord(ui.shiftMasterBoardAssignments);
  const previous = normalizePlainRecord(assignmentStore[slotId]);
  if (!Object.keys(previous).length) return null;
  const printRecords = normalizePlainRecord(previous.printRecords);
  const previousPrint = normalizePlainRecord(printRecords[employeeId]);
  const revisionAt = String(previous.updatedAt || previous.createdAt || "");
  const afterChange = Boolean(
    previousPrint.printedAt
    && previousPrint.revisionAt
    && String(previousPrint.revisionAt) !== revisionAt,
  );
  const printedAt = new Date().toISOString();
  const next = {
    ...previous,
    printRecords: {
      ...printRecords,
      [employeeId]: {
        printedAt,
        revisionAt,
        afterChange,
        count: Math.max(0, Number(previousPrint.count || 0)) + 1,
      },
    },
  };
  ui.shiftMasterBoardAssignments = {
    ...assignmentStore,
    [slotId]: next,
  };
  persistUiState();
  return next.printRecords[employeeId];
}

function saveShiftMasterBoardFact(slotId = "", patch = {}, options = {}) {
  if (!slotId) return null;
  const notifyOwner = options.notifyOwner !== false;
  const row = getShiftMasterBoardRowById(slotId);
  const previous = normalizePlainRecord(ui.shiftMasterBoardFacts)[slotId] || {};
  const plannedQuantity = normalizeShiftMasterBoardQuantity(row?.plannedQuantity || previous.plannedQuantity || 0);
  const routeId = row?.route?.id || row?.routeId || previous.routeId || "";
  const sourceSlotId = row?.slotId || row?.slot?.id || previous.slotId || slotId;
  const assignmentStore = normalizePlainRecord(ui.shiftMasterBoardAssignments);
  const assignmentForContract = assignmentStore[slotId] || row?.boardAssignment || {};
  const baseNext = {
    ...previous,
    ...patch,
    slotId: sourceSlotId,
    sourceRowId: row?.id || previous.sourceRowId || slotId,
    routeId,
    planningOrderId: getSlotPlanningOrderId(row?.slot || {}, routeId),
    stepId: row?.step?.id || row?.stepId || previous.stepId || "",
    workCenterId: row?.workCenterId || previous.workCenterId || "",
    resourceId: row?.boardAssignment?.resourceId || row?.resourceId || previous.resourceId || "",
    plannedQuantity,
    unit: row?.unit || previous.unit || "шт.",
    updatedAt: patch.updatedAt || new Date().toISOString(),
  };
  const next = {
    ...baseNext,
    transferContract: row ? buildShiftMasterBoardTransferContract(row, assignmentForContract, baseNext) : previous.transferContract || null,
  };
  ui.shiftMasterBoardFacts = {
    ...normalizePlainRecord(ui.shiftMasterBoardFacts),
    [slotId]: next,
  };
  ui.shiftMasterBoardLaneBySlot = {
    ...normalizePlainRecord(ui.shiftMasterBoardLaneBySlot),
    [slotId]: "fact",
  };
  ui.shiftMasterBoardSelectedSlotId = slotId;
  persistUiState();
  const refreshedRow = getShiftMasterBoardRowById(slotId);
  const goodQuantity = Math.max(0, normalizeShiftMasterBoardQuantity(next.actualQuantity || 0) - normalizeShiftMasterBoardQuantity(next.defectQuantity || 0));
  const shouldCarryover = plannedQuantity > 0 && goodQuantity < plannedQuantity;
  const carryoverDateKey = toDateInput(addMs(startOfDay(getShiftWorkbenchWindow().start), DAY_MS));
  const existingCarryover = Object.values(normalizePlainRecord(ui.shiftMasterBoardCarryovers))
    .find((item) => item && item.sourceRowId === slotId && item.dateKey === carryoverDateKey)
    || null;
  const carryover = shouldCarryover ? createShiftMasterBoardCarryover(slotId, { notifyOwner }) : null;
  const carryoverChanged = Boolean(carryover && (!existingCarryover
    || normalizeShiftMasterBoardQuantity(existingCarryover.remainingQuantity || 0) !== normalizeShiftMasterBoardQuantity(carryover.remainingQuantity || 0)));
  const removedCarryovers = shouldCarryover ? [] : removeShiftMasterBoardCarryoverForSource(refreshedRow?.id || slotId);
  const finalRow = getShiftMasterBoardRowById(slotId) || refreshedRow || row;
  const finalAssignmentStore = normalizePlainRecord(ui.shiftMasterBoardAssignments);
  const finalAssignment = finalAssignmentStore[slotId] || assignmentForContract || {};
  const finalTransferContract = finalRow
    ? buildShiftMasterBoardTransferContract(finalRow, finalAssignment, next, { carryover })
    : next.transferContract;
  const finalFact = {
    ...next,
    transferContract: finalTransferContract,
  };
  ui.shiftMasterBoardFacts = {
    ...normalizePlainRecord(ui.shiftMasterBoardFacts),
    [slotId]: finalFact,
  };
  if (finalAssignmentStore[slotId] && finalRow) {
    const finalSheetContract = buildShiftMasterBoardSheetContract(finalRow, finalAssignment, finalFact, { carryover });
    ui.shiftMasterBoardAssignments = {
      ...finalAssignmentStore,
      [slotId]: {
        ...finalAssignment,
        transferContract: finalTransferContract,
        sheetContract: finalSheetContract,
      },
    };
  }
  persistUiState();
  // Carryover persistence is deliberately independent from fact persistence:
  // createShiftMasterBoardCarryover already owns its one automatic server
  // write. Passing it through this callback used to POST the same carryover
  // a second time.
  if (notifyOwner) {
    void onShiftMasterBoardFactSaved(finalRow, finalFact);
    removedCarryovers.forEach((removedCarryover) => {
      void onShiftMasterBoardCarryoverRemoved(finalRow, removedCarryover);
    });
  }
  return {
    fact: finalFact,
    carryover,
    carryoverChanged,
    replacedCarryover: carryoverChanged ? existingCarryover : null,
    removedCarryover: removedCarryovers[0] || null,
    removedCarryovers,
  };
}

function removeShiftMasterBoardCarryoverForSource(sourceRowId = "") {
  if (!sourceRowId) return [];
  const store = normalizePlainRecord(ui.shiftMasterBoardCarryovers);
  const removed = [];
  const nextStore = Object.fromEntries(Object.entries(store).filter(([, item]) => {
    const isMatch = item && item.sourceRowId === sourceRowId;
    if (isMatch) removed.push(item);
    return !isMatch;
  }));
  if (!removed.length) return [];
  ui.shiftMasterBoardCarryovers = nextStore;
  persistUiState();
  return removed;
}

function createShiftMasterBoardCarryover(slotId = "", options = {}) {
  if (!slotId) return null;
  const notifyOwner = options.notifyOwner !== false;
  const model = getShiftMasterBoardModel();
  const row = model.allRows.find((item) => item.id === slotId) || model.rows.find((item) => item.id === slotId) || null;
  if (!row) return null;
  const planned = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
  const fact = normalizeShiftMasterBoardQuantity(row.boardGoodQuantity || 0);
  const remaining = Math.max(0, planned - fact);
  if (!row.boardFact.updatedAt || remaining <= 0) return null;
  const nextDate = toDateInput(addMs(startOfDay(getShiftWorkbenchWindow().start), DAY_MS));
  const store = normalizePlainRecord(ui.shiftMasterBoardCarryovers);
  const existingEntry = Object.entries(store).find(([, item]) => item && item.sourceRowId === slotId && item.dateKey === nextDate) || null;
  const existingKey = existingEntry?.[0] || "";
  const existing = existingEntry?.[1] || null;
  const existingRemaining = normalizeShiftMasterBoardQuantity(existing?.remainingQuantity || 0);
  const isUnchanged = Boolean(existing && existingRemaining === remaining);
  const createdAt = isUnchanged && existing?.createdAt ? existing.createdAt : new Date().toISOString();
  const carryoverId = isUnchanged && (existing?.id || existingKey)
    ? (existing.id || existingKey)
    : getShiftRowId({ id: `board-carryover-${slotId}-${createdAt}` }, nextDate);
  const carryover = {
    id: carryoverId,
    sourceRowId: slotId,
    dateKey: nextDate,
    sourceSlotId: row.slotId || row.slot?.id || "",
    routeId: row.route?.id || row.routeId || "",
    planningOrderId: getSlotPlanningOrderId(row.slot || {}, row.route?.id || row.routeId || ""),
    stepId: row.step?.id || row.stepId || "",
    documentNumber: [
      "ОСТ",
      nextDate.replaceAll("-", ""),
      row.workCenter?.code || row.workCenterId || "WC",
    ].filter(Boolean).join("-"),
    routeName: row.routeName || "",
    orderLabel: getShiftMasterRowOrderLabel(row),
    taskLabel: row.taskLabel || "",
    operationName: row.operationName || "",
    workCenterId: row.workCenterId || "",
    workCenterLabel: row.workCenterLabel || "",
    resourceId: row.boardAssignment.resourceId || row.resourceId || "",
    assignedQuantity: normalizeShiftMasterBoardQuantity(row.boardAssignedQuantity || 0),
    factQuantity: fact,
    remainingQuantity: remaining,
    plannedQuantity: remaining,
    unit: row.unit || "шт.",
    reason: `Остаток ${remaining.toLocaleString("ru-RU")} ${row.unit || "шт."} после факта ${fact.toLocaleString("ru-RU")} из ${planned.toLocaleString("ru-RU")}`,
    createdAt,
  };
  carryover.transferContract = buildShiftMasterBoardTransferContract(row, row.boardAssignment, row.boardFact, { carryover });
  const nextStore = { ...store };
  if (existing && existingKey && existingKey !== carryoverId) delete nextStore[existingKey];
  ui.shiftMasterBoardCarryovers = { ...nextStore, [carryoverId]: carryover };
  ui.shiftMasterBoardSelectedSlotId = slotId;
  persistUiState();
  // The automatic write is emitted exactly once for a new carryover.  A
  // changed partial fact replaces the old server carryover before creating a
  // new one, which keeps the server's logical (source-row, date) key unique.
  if (!isUnchanged && notifyOwner) void onShiftMasterBoardCarryoverCreated(row, carryover, existing);
  return carryover;
}

function bindShiftMasterBoardEvents() {
  bindShiftCalendarEvents();
  bindGenericModalCloseEvents();

  app.querySelectorAll("[data-shift-board-move]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const slotId = button.getAttribute("data-shift-board-move") || "";
      const laneId = button.getAttribute("data-shift-board-target-lane") || "";
      const result = moveShiftMasterBoardCardToLane(slotId, laneId);
      notifySaveSuccess(result.message);
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-card]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.shiftMasterBoardSelectedSlotId = button.dataset.shiftBoardCard || "";
      render();
    });
    button.addEventListener("dragstart", (event) => {
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", button.dataset.shiftBoardCard || "");
        event.dataTransfer.setData("application/x-mes-shift-board-card", button.dataset.shiftBoardCard || "");
        event.dataTransfer.effectAllowed = "move";
      }
      button.classList.add("is-dragging");
    });
    button.addEventListener("dragend", () => {
      button.classList.remove("is-dragging");
      app.querySelectorAll(".shift-master-board-lane.is-drop-target").forEach((lane) => lane.classList.remove("is-drop-target"));
    });
  });

  app.querySelectorAll("[data-shift-board-lane]").forEach((lane) => {
    lane.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    lane.addEventListener("dragenter", () => lane.classList.add("is-drop-target"));
    lane.addEventListener("dragleave", (event) => {
      if (lane.contains(event.relatedTarget)) return;
      lane.classList.remove("is-drop-target");
    });
    lane.addEventListener("drop", (event) => {
      event.preventDefault();
      lane.classList.remove("is-drop-target");
      const slotId = event.dataTransfer?.getData("application/x-mes-shift-board-card")
        || event.dataTransfer?.getData("text/plain")
        || "";
      const result = moveShiftMasterBoardCardToLane(slotId, lane.dataset.shiftBoardLane || "");
      notifySaveSuccess(result.message);
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-master-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const masterId = select.value || "";
      if (!masterId) return;
      ui.activeShiftMasterId = masterId;
      ui.shiftMasterBoardFocus = "mine";
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-master-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const masterId = button.dataset.shiftBoardMasterOption || "";
      const select = app.querySelector("[data-shift-board-master-select]");
      if (!masterId || !select) return;
      select.value = masterId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  app.querySelectorAll("[data-shift-board-swimlane]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.shiftMasterBoardSwimlane = normalizeShiftMasterBoardSwimlane(button.dataset.shiftBoardSwimlane || "");
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.shiftMasterBoardFocus = normalizeShiftMasterBoardFocus(button.dataset.shiftBoardFocus || "");
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-gate]").forEach((button) => {
    button.addEventListener("click", () => {
      const focus = normalizeShiftMasterBoardFocus(button.dataset.shiftBoardGateFocus || "");
      const slotId = button.dataset.shiftBoardGateCard || "";
      if (focus) ui.shiftMasterBoardFocus = focus;
      if (slotId) ui.shiftMasterBoardSelectedSlotId = slotId;
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-date]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextDate = button.dataset.shiftBoardDate || "";
      if (!setShiftWorkbenchDate(nextDate)) return;
      notifySaveSuccess(`Открыта смена ${formatDate(fromDateInput(nextDate))}.`);
    });
  });

  app.querySelectorAll("[data-shift-calendar-date]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!setShiftWorkbenchDate(input.value || "")) return;
      notifySaveSuccess(`Открыта смена ${formatDate(fromDateInput(input.value))}.`);
    });
  });

  app.querySelector("[data-shift-board-reset]")?.addEventListener("click", () => {
    ui.shiftMasterBoardPendingAction = { type: "reset" };
    render();
  });

  app.querySelector("[data-shift-board-assist-open]")?.addEventListener("click", () => {
    const model = getShiftMasterBoardModel();
    const candidates = getShiftMasterBoardAssistCandidates(model);
    ui.shiftMasterBoardAssistOpen = true;
    ui.shiftMasterBoardAssistMode = candidates.next.length ? "next" : "internal";
    ui.shiftMasterBoardAssistCandidateId = (candidates[ui.shiftMasterBoardAssistMode] || [])[0]?.id || "";
    ui.shiftMasterBoardAssistEmployeeIds = [];
    ui.shiftMasterBoardAssistPreview = false;
    render();
  });

  app.querySelectorAll("[data-shift-board-assist-close]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.shiftMasterBoardAssistOpen = false;
      ui.shiftMasterBoardAssistPreview = false;
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-assist-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const model = getShiftMasterBoardModel();
      const candidates = getShiftMasterBoardAssistCandidates(model);
      const mode = button.dataset.shiftBoardAssistMode === "internal" ? "internal" : "next";
      ui.shiftMasterBoardAssistMode = mode;
      ui.shiftMasterBoardAssistCandidateId = (candidates[mode] || [])[0]?.id || "";
      ui.shiftMasterBoardAssistPreview = false;
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-assist-candidate]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.shiftMasterBoardAssistCandidateId = button.dataset.shiftBoardAssistCandidate || "";
      ui.shiftMasterBoardAssistPreview = false;
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-assist-employee]").forEach((button) => {
    button.addEventListener("click", () => {
      const employeeId = button.dataset.shiftBoardAssistEmployee || "";
      const selected = new Set(Array.isArray(ui.shiftMasterBoardAssistEmployeeIds) ? ui.shiftMasterBoardAssistEmployeeIds : []);
      if (selected.has(employeeId)) selected.delete(employeeId);
      else if (employeeId) selected.add(employeeId);
      ui.shiftMasterBoardAssistEmployeeIds = [...selected];
      ui.shiftMasterBoardAssistPreview = false;
      render();
    });
  });

  app.querySelector("[data-shift-board-assist-preview]")?.addEventListener("click", () => {
    ui.shiftMasterBoardAssistPreview = true;
    render();
    notifySaveSuccess("Рекомендация сформирована только в интерфейсе. Данные не сохранены.");
  });

  app.querySelectorAll("[data-shift-board-save-assignment]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotId = button.dataset.shiftBoardSaveAssignment || "";
      const panel = button.closest("[data-shift-board-assignment-panel]");
      const previous = normalizePlainRecord(ui.shiftMasterBoardAssignments)[slotId] || {};
      const panelPatch = readShiftMasterBoardAssignmentPanel(panel);
      ui.shiftMasterBoardPendingAction = {
        type: "save",
        slotId,
        patch: {
        ...mergeShiftMasterBoardIssueAssignment(previous, panelPatch),
        issued: true,
        updatedAt: new Date().toISOString(),
        },
      };
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-cancel-action]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.shiftMasterBoardPendingAction = null;
      render();
    });
  });

  app.querySelector("[data-shift-board-confirm-action]")?.addEventListener("click", (event) => {
    const pending = ui.shiftMasterBoardPendingAction || null;
    const action = event.currentTarget?.dataset?.shiftBoardConfirmAction || "";
    if (!pending || pending.type !== action) return;
    ui.shiftMasterBoardPendingAction = null;
    if (action === "reset") {
      ui.shiftMasterBoardSelectedSlotId = "";
      ui.shiftMasterBoardLaneBySlot = {};
      ui.shiftMasterBoardAssignments = {};
      ui.shiftMasterBoardFacts = {};
      ui.shiftMasterBoardCarryovers = {};
      persistUiState();
      notifySaveSuccess("Состояние доски очищено. Плановые даты и заказ-наряды не изменены.");
      render();
      return;
    }
    saveShiftMasterBoardAssignment(pending.slotId || "", pending.patch || {});
    notifySaveSuccess("Распределение сохранено. Сменное задание сформировано и готово к печати СЗН.");
    render();
  });

  app.querySelectorAll("[data-shift-board-available-quantity]").forEach((input) => {
    syncShiftMasterBoardQuantityInputState(input);
    input.addEventListener("pointerdown", () => {
      clearShiftMasterBoardZeroQuantityInput(input);
    });
    input.addEventListener("focus", () => {
      clearShiftMasterBoardZeroQuantityInput(input);
    });
    input.addEventListener("input", () => {
      normalizeShiftMasterBoardQuantityInputValue(input);
      updateShiftMasterBoardAvailableQuantityPreview(input);
      persistShiftMasterBoardAssignmentInput(input);
    });
    input.addEventListener("change", () => {
      normalizeShiftMasterBoardQuantityInputValue(input);
      restoreShiftMasterBoardZeroQuantityInput(input);
      updateShiftMasterBoardAvailableQuantityPreview(input);
      persistShiftMasterBoardAssignmentInput(input);
      // The assignment is already saved on change; redraw the dependent
      // shift-sheet section so its print action becomes available immediately.
      render();
    });
    input.addEventListener("blur", () => {
      restoreShiftMasterBoardZeroQuantityInput(input);
      updateShiftMasterBoardAvailableQuantityPreview(input);
      persistShiftMasterBoardAssignmentInput(input);
    });
  });

  app.querySelectorAll("[data-shift-board-print]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotId = button.dataset.shiftBoardPrint || "";
      if (!slotId) return;
      const previous = normalizePlainRecord(ui.shiftMasterBoardAssignments)[slotId] || {};
      const panelPatch = readShiftMasterBoardCurrentAssignmentPatch(button, slotId);
      if (!previous.issued) {
        const issuedAt = new Date().toISOString();
        saveShiftMasterBoardAssignment(slotId, {
          ...mergeShiftMasterBoardIssueAssignment(previous, panelPatch),
          issued: true,
          issuedAt,
          updatedAt: previous.updatedAt || issuedAt,
        });
      }
      ui.shiftMasterBoardPrintPreviewId = slotId;
      ui.shiftMasterBoardPrintPreviewEmployeeId = button.dataset.shiftBoardPrintEmployee || "";
      persistUiState();
      notifySaveSuccess("Открыт предпросмотр сменного листа.");
      render();
    });
  });

  app.querySelector("[data-shift-board-print-run]")?.addEventListener("click", () => {
    const printedEmployeeId = String(ui.shiftMasterBoardPrintPreviewEmployeeId || "");
    const printRecord = markShiftMasterBoardSheetPrinted(
      String(ui.shiftMasterBoardPrintPreviewId || ""),
      printedEmployeeId,
    );
    if (printRecord) {
      const executorRow = [...app.querySelectorAll("[data-shift-board-document-employee]")]
        .find((item) => item.dataset.shiftBoardDocumentEmployee === printedEmployeeId);
      const statusToken = executorRow?.querySelector(".ui-status-token");
      if (statusToken) {
        statusToken.textContent = printRecord.afterChange ? "распечатан после изм." : "распечатан";
        statusToken.classList.remove("is-neutral", "is-warning", "is-danger", "is-primary");
        statusToken.classList.add("is-ok");
      }
    }
    const previousTitle = document.title;
    const restorePrintState = () => {
      document.title = previousTitle;
      document.body.classList.remove("is-shift-master-board-printing");
      window.removeEventListener("afterprint", restorePrintState);
    };
    document.title = "";
    document.body.classList.add("is-shift-master-board-printing");
    window.addEventListener("afterprint", restorePrintState, { once: true });
    window.print();
  });

  app.querySelectorAll("[data-shift-board-create-carryover]").forEach((button) => {
    button.addEventListener("click", () => {
      const carryover = createShiftMasterBoardCarryover(button.dataset.shiftBoardCreateCarryover || "");
      if (!carryover) {
        notifySaveSuccess("Остаток не создан: факт закрыт без недовыпуска.");
        render();
        return;
      }
      notifySaveSuccess(`Остаток добавлен в очередь ${formatDate(fromDateInput(carryover.dateKey))}.`);
      render();
    });
  });

  app.querySelectorAll("[data-shift-board-open-date]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextDate = button.dataset.shiftBoardOpenDate || "";
      if (!setShiftWorkbenchDate(nextDate)) return;
      ui.shiftMasterBoardSelectedSlotId = button.dataset.shiftBoardOpenCard || "";
      persistUiState();
      render();
      notifySaveSuccess(`Открыта очередь остатков ${formatDate(fromDateInput(nextDate))}.`);
    });
  });

  app.querySelectorAll("[data-shift-board-assignment-panel] input, [data-shift-board-assignment-panel] select").forEach((field) => {
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const assignmentPanel = field.closest("[data-shift-board-assignment-panel]");
      const button = assignmentPanel?.querySelector("[data-shift-board-save-assignment]");
      button?.click();
    });
  });
}


  return {
    getShiftWorkOrderRows,
    getShiftMasterBoardSlotRows,
    groupShiftRowsByWorkCenter,
    groupShiftRowsByOrder,
    getDispatchWindow,
    getShiftWorkbenchWindow,
    getShiftWindowDayCount,
    renderShiftWindowRuler,
    normalizeDateInput,
    setShiftWorkbenchDate,
    moveShiftWorkbenchDate,
    setShiftWorkbenchToday,
    renderShiftCalendarControl,
    isSlotInsideDispatchWindow,
    getDispatchSlotTone,
    getDispatchSlotWindowStyle,
    buildDispatchWorkCenterRows,
    buildDispatchRouteRows,
    buildDispatchSignals,
    getDispatchCheckpointReferenceTime,
    buildDispatchCheckpoints,
    buildDispatchBoardData,
    normalizeShiftMasterBoardQuantity,
    getShiftMasterBoardAssignment,
    getShiftMasterBoardFact,
    getShiftMasterBoardAssignmentQuantity,
    getShiftMasterBoardRowById,
    getShiftMasterBoardNextRouteStep,
    getShiftMasterBoardTransferTarget,
    getShiftMasterBoardCarryoverForSource,
    buildShiftMasterBoardTransferContract,
    buildShiftMasterBoardSheetContract,
    getShiftMasterBoardLaborMinutesPerUnit,
    getShiftMasterBoardTimesheetCapacity,
    getShiftMasterBoardLaneId,
    getShiftMasterBoardRow,
    getShiftMasterBoardGroupKey,
    groupShiftMasterBoardRows,
    getShiftMasterBoardWeek,
    getShiftMasterBoardCarryoverRows,
    getShiftMasterBoardFallbackRows,
    getShiftMasterBoardModel,
    getShiftMasterBoardExecutorLoadMap,
    renderShiftMasterBoardPage,
    renderShiftMasterBoardTopControls,
    renderShiftMasterBoardKpi,
    renderShiftMasterBoardLanes,
    renderShiftMasterBoardLane,
    renderShiftMasterBoardCard,
    renderShiftMasterBoardDetail,
    renderShiftMasterBoardTaskContext,
    renderShiftMasterBoardInlineSummary,
    renderShiftMasterBoardSummaryCell,
    getShiftMasterBoardRouteChain,
    renderShiftMasterBoardRouteChain,
    renderShiftMasterBoardCoverage,
    renderShiftMasterBoardEmployeeOptions,
    renderShiftMasterBoardAvailableEmployeeLoadbar,
    renderShiftMasterBoardAssignment,
    renderShiftMasterBoardDocument,
    renderShiftMasterBoardSheetModal,
    renderShiftMasterBoardActionModal,
    getShiftMasterDemoLanes,
    getShiftMasterRowOrderLabel,
    getShiftMasterRowRouteLabel,
    getShiftMasterRowRoutePartLabel,
    readShiftMasterBoardAssignmentPanel,
    readShiftMasterBoardCurrentAssignmentPatch,
    mergeShiftMasterBoardIssueAssignment,
    persistShiftMasterBoardAssignmentInput,
    updateShiftMasterBoardAvailableQuantityPreview,
    updateShiftMasterBoardLane,
    canMoveShiftMasterBoardCardToLane,
    moveShiftMasterBoardCardToLane,
    saveShiftMasterBoardAssignment,
    saveShiftMasterBoardFact,
    removeShiftMasterBoardCarryoverForSource,
    createShiftMasterBoardCarryover,
    bindShiftMasterBoardEvents,
  };
}
