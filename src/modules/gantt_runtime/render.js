import {
  addCalendarWorkingDuration,
  createWorkingCalendar,
  getCalendarWorkingIntervals,
  isCalendarWorkDay,
  snapToCalendarWorkingTime,
} from "../../domain/working_calendar.js";

export function createGanttRuntimeModule(dependencies = {}) {
  const {
    active,
    addMs,
    AGGREGATE_SLOT_HEIGHT,
    AGGREGATE_SLOT_TOP,
    app,
    applyRecalculatedSlotTiming,
    applyGanttRowToSlot = () => {},
    areAllVisibleProjectsExpanded,
    attributes,
    best,
    bomListId,
    buildBacklogItems,
    buildWorkloadRows,
    button,
    byId,
    calculatePlannedEndByQuantity,
    calculateProjectProgress,
    calculateQuantityByDuration,
    changePlanningSlotSchedule = async () => ({ applied: false, kind: "local" }),
    calculationType,
    candidate,
    capacity,
    cascadeIfEnabled,
    cleanDateTime,
    cleanOptionalDateTime,
    cloneGanttDependencyRouteStore,
    code,
    compactVisibleGanttChains,
    currentWorkCenterId,
    dateToX,
    DAY_MS,
    days,
    DEPENDENCY_CROSSING_GAP_RADIUS,
    DEPENDENCY_HORIZONTAL_TRACK_GAP,
    deviationComment,
    deviationNotes,
    draft,
    escapeHtml,
    extendTimelineIfNeeded,
    field,
    findFreeWindow,
    focus,
    formatDate,
    formatDateTime,
    formatDuration,
    formatShortDate,
    formatWorkShift,
    fulfillmentMode,
    GANTT_DEPENDENCY_ARROW_BASE_REF_X,
    GANTT_DEPENDENCY_ARROW_HEAD_ADVANCE,
    GANTT_DEPENDENCY_ROUTE_VERSION,
    GANTT_SLOT_STATUS_LABELS = {},
    GANTT_SLOT_STATUS_VALUES,
    ganttScrollRestoreInProgress,
    getAuthSessionTaskRowId = (taskId = "") => {
      const normalizedTaskId = String(taskId || "").trim();
      const separatorIndex = normalizedTaskId.lastIndexOf("::");
      return separatorIndex > 0 ? normalizedTaskId.slice(0, separatorIndex) : normalizedTaskId;
    },
    getBatch,
    getDefaultOperationCalculationType,
    getDefaultWorkMode,
    getDependencyPairs,
    getEarliestRouteStart,
    getGanttDependencyArrowLength,
    getGanttDependencyEntryWidth,
    getGanttOptimizationWorkOrders,
    getGanttSlotStatusClass,
    getGanttSlotStatusView,
    getGanttResourceForSlot = () => null,
    getGanttSnapMs,
    getGanttSnapWidth,
    getGanttZoomPercent = () => "100%",
    getWeekNumber,
    getMainRouteDependencyReadiness,
    getOperationMapItem,
    getPlanningResourceForRouteStep,
    getPlanningRouteOrderState,
    getPlanningWorkCenters,
    getProductionContexts,
    getProject,
    getProjectDeadlineState,
    getProjectDisplayName,
    getProjectRouteForModule,
    getProjectRouteSteps,
    getPlanningRouteQuantity = () => 0,
    getRouteBomList = () => null,
    getRouteBufferMs,
    getRouteFlowLaunchSettings,
    getRouteForStep,
    getRouteInstructionWorkCenterId,
    getRouteNeighbor,
    getRoutePlanningBatches,
    getRoutePlanningContext,
    getRoutePlanningOrderWipBranchDetails,
    getRouteProductionId,
    getRouteSpecification = () => null,
    getRouteStepFlowModel,
    getRouteStepPlanningAssignmentForSlot,
    getRouteStepPlanningLineOptions = () => [
      { value: "", label: "Линия не выбрана", meta: "нет кандидатов" },
      ...getPlanningWorkCenters().map((center) => ({
        value: center.id,
        label: center.name || center.id,
        meta: center.code || "участок",
      })),
    ],
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteStepsForModule,
    getRouteStepTaskId,
    getRuntimePlanningState,
    getResourceRowId = (...parts) => parts.filter(Boolean).join(":"),
    getSlotCalendarDurationMs,
    getSlotDurationHours,
    getSlotEffectiveOperationContext,
    getSlotGanttResourceId = (slot = {}) => slot?.resourceId || "",
    getSlotGanttWorkCenterId = (slot = {}) => slot?.workCenterId || "",
    getSlotOperationFlow,
    getSlotPlanningOrderId,
    getSlotPlanningLaborView = (slot = {}) => ({
      label: "Трудозатраты",
      value: `${normalizeQuantity(slot.quantity || 0).toLocaleString("ru-RU")} шт.`,
      title: "Расчет по данным слота",
    }),
    getSlotProductionContextId,
    getSlotRequiredDurationMs,
    getSlotRouteId,
    getSlotRouteTaskId,
    getSlotWarnings,
    getSlotWorkingDurationMs,
    getSpecificationByProjectId,
    getVisibleGanttRoutes,
    getWorkCalendarLabel,
    getWorkCenter,
    getSmtLineIdFromWorkCenterId = () => "",
    group,
    groups,
    icon,
    input,
    isGanttRouteExpanded,
    isGanttSlotActive = () => false,
    isGanttSlotCompleted,
    isManufacturingOutputReceiptRouteStep = () => false,
    isManufacturingOutputReceiptSlot,
    isoLocal,
    isPlanningUnit,
    isPlanningWorkCenter,
    isSmtLineWorkCenterId = () => false,
    isWarehouseWorkCenterId,
    isWorkOrderPlanningCanceled,
    item,
    laborMinutes,
    LEFT_WIDTH,
    MAIN_ROUTE_TASK_ID,
    makeId,
    mapLegacyWorkCenterId,
    MES_SMT_WORK_CENTER_IDS,
    name,
    normalizeBoardsPerPanel,
    normalizeDispatchExecutorCount,
    normalizeDispatchLaborMinutes,
    normalizeGanttDependencyRouteStore,
    normalizeGanttSlotContent,
    normalizeGanttZoom,
    normalizePlainRecord,
    normalizePlanningLaborPositiveNumber,
    normalizeQuantity,
    normalizeShiftMasterAssignment,
    normalizeShiftMasterBoardQuantity,
    normalizeShiftMasterExecutorQuantity,
    normalizeShiftMasterFactQuantity,
    normalizeWorkMode,
    normalizeWorkSchedule,
    notifySaveSuccess,
    offsets,
    openConfirmDialog,
    openPlanningForProject,
    order,
    overrides,
    persistState,
    persistUiState,
    prependTimelineIfNeeded,
    PRODUCT_COMPOSITION_TERM,
    PROJECT_ROW_HEIGHT,
    readonly,
    readyAt,
    record,
    render,
    renderOperationFlowMap = () => "",
    renderUiDrawerShell,
    renderUiModalShell,
    required,
    rescheduleAllGanttSlotsByCurrentCalendars,
    resourceParticipatesInCalculation,
    resourceParticipatesInPlanning,
    routeIndex,
    routeStepIds,
    routeStepRequiresManualPlanningLine,
    routeWorkCenterId,
    rowLayout,
    scaleConfig,
    scaleInfo,
    scrollTop,
    secondsPerPanel,
    selected = (left, right) => left === right ? "selected" : "",
    setGanttZoom,
    setupMin,
    sharedNonWorkingIntervals,
    slotEnd,
    slotMatchesPlanningOrder,
    slotMatchesProductionContext,
    slotPlacementMap,
    slotStart,
    snapDate,
    source,
    specificationId,
    specifications,
    STANDARD_SLOT_HEIGHT,
    STANDARD_SLOT_TOP,
    startOfDay,
    startOfWeek,
    stats,
    stepId,
    style,
    suffix,
    suppressedGanttSlotClick: initialSuppressedGanttSlotClick = null,
    taskId,
    text,
    TIMELINE_HEIGHT,
    toDate,
    toDateInput,
    toSlotDateTime,
    total,
    type,
    updateDependencyClip,
    value,
    version,
    warningsContext,
    WEEK_SLOT_GAP,
    WEEK_SLOT_HEIGHT,
    WEEK_SLOT_TOP,
    WORK_ROW_HEIGHT,
    workMode,
    workSchedule,
  } = dependencies;

  let suppressedGanttSlotClick = initialSuppressedGanttSlotClick;
  const escapeAttribute = dependencies.escapeAttribute || escapeHtml;

  const ui = new Proxy({}, {
    get(_target, property) {
      return dependencies.getUi?.()?.[property];
    },
    set(_target, property, value) {
      const state = dependencies.getUi?.();
      if (state) state[property] = value;
      return true;
    },
  });

  const planningState = new Proxy({}, {
    get(_target, property) {
      return dependencies.getPlanningState?.()?.[property];
    },
    set(_target, property, value) {
      const state = dependencies.getPlanningState?.();
      if (state) state[property] = value;
      return true;
    },
  });

  const directoryState = new Proxy({}, {
    get(_target, property) {
      return dependencies.getDirectoryState?.()?.[property];
    },
    set(_target, property, value) {
      const state = dependencies.getDirectoryState?.();
      if (state) state[property] = value;
      return true;
    },
  });

function renderToolbar() {
  const allRoutesExpanded = areAllVisibleProjectsExpanded();

  return `
    <header class="topbar" data-ui-component="GanttToolbar">
      <div class="brand-block">
        <div class="brand-title">Планирование</div>
        <div class="brand-subtitle">Маршрутная карта как производственное задание</div>
      </div>

      <div class="toolbar-grid">
        <label class="field compact">
          <span>Период</span>
          <input id="periodStart" type="date" value="${ui.windowStart}" />
        </label>

        <div class="segmented" role="group" aria-label="Масштаб времени">
          ${Object.keys(scaleConfig).map((scale) => `
            <button class="segment ${ui.scale === scale ? "is-active" : ""}" data-scale="${scale}" type="button">${scaleConfig[scale].label}</button>
          `).join("")}
        </div>

        <div class="gantt-zoom-control" role="group" aria-label="Масштаб Ганта">
          <button class="icon-button ui-action-button" data-gantt-zoom="out" type="button" title="Уменьшить масштаб Ганта">${icon("minus")}</button>
          <button class="gantt-zoom-value ui-action-button" data-gantt-zoom="reset" type="button" title="Сбросить масштаб">${getGanttZoomPercent()}</button>
          <button class="icon-button ui-action-button" data-gantt-zoom="in" type="button" title="Увеличить масштаб Ганта">${icon("plus")}</button>
        </div>

      </div>

      <div class="toolbar-actions">
        <button class="toggle-switch-button ${allRoutesExpanded ? "is-on" : ""}" data-toggle-all-projects type="button" aria-pressed="${allRoutesExpanded ? "true" : "false"}" title="${allRoutesExpanded ? "Свернуть все маршрутные карты" : "Развернуть все маршрутные карты"}">
          <span class="toggle-switch-knob"></span>
          <span>${allRoutesExpanded ? "Свернуть" : "Развернуть"}</span>
        </button>
        <button class="toggle-switch-button ${ui.ganttShowQuantity ? "is-on" : ""}" data-toggle-gantt-quantity type="button" aria-pressed="${ui.ganttShowQuantity ? "true" : "false"}" title="${ui.ganttShowQuantity ? "Скрыть количество на диаграмме" : "Показать количество на диаграмме"}">
          <span class="toggle-switch-knob"></span>
          <span>Кол-во</span>
        </button>
        <button class="icon-button ui-action-button" id="todayButton" type="button" title="Перейти к сегодняшнему дню">${icon("today")}</button>
        <button
          class="icon-button gantt-dependency-edit-button ui-action-button ${ui.ganttDependencyEditMode ? "is-active" : ""}"
          id="dependencyEditButton"
          type="button"
          aria-pressed="${ui.ganttDependencyEditMode ? "true" : "false"}"
          title="${ui.ganttDependencyEditMode ? "Сохранить маршруты стрелок" : "Редактировать маршруты стрелок"}"
        >${icon(ui.ganttDependencyEditMode ? "save" : "routeEdit")}</button>
        <button class="icon-button ui-action-button" id="refreshButton" type="button" title="Перестроить план">${icon("refresh")}</button>
        <button class="secondary-button gantt-optimize-button ui-action-button" id="optimizePlanButton" type="button" title="Выбрать заказ-наряды и подтянуть операции к ближайшим свободным окнам">
          ${icon("refresh")}<span>Оптимизировать</span>
        </button>
        <span class="clock gantt-toolbar-clock" data-gantt-toolbar-clock data-ui-component="GanttClock" aria-label="Текущее время">${icon("clock")}<span data-clock>${formatDateTime(ui.now)}</span></span>
      </div>
    </header>
  `;
}

function renderGanttOptimizationModal() {
  if (!ui.ganttOptimizationDialog) return "";
  const items = getGanttOptimizationWorkOrders();
  const selectedKeys = new Set(
    Array.isArray(ui.ganttOptimizationDialog.selectedKeys) && ui.ganttOptimizationDialog.selectedKeys.length
      ? ui.ganttOptimizationDialog.selectedKeys
      : items.map((item) => item.key),
  );

  return `
    <div class="modal-backdrop gantt-optimization-backdrop" data-modal-backdrop>
      ${renderUiModalShell({
        className: "large-modal gantt-optimization-modal",
        attributes: "aria-label=\"Оптимизация плана\" data-gantt-overlay=\"optimization\" data-gantt-overlay-component=\"GanttOptimizationModal\"",
        content: `
        <form id="ganttOptimizationForm" data-command-form>
          <div class="modal-header">
            <div>
              <h2>Оптимизировать план</h2>
              <p>Выберите заказ-наряды, для которых нужно полуавтоматически уплотнить цепочки операций.</p>
            </div>
            <button class="icon-button ui-action-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <div class="gantt-optimization-body">
            <div class="gantt-optimization-toolbar">
              <span>${items.length.toLocaleString("ru-RU")} заказ-нарядов в текущем представлении</span>
              <div>
                <button class="secondary-button ui-action-button" data-gantt-optimize-select="all" type="button">${icon("check")}<span>Все</span></button>
                <button class="secondary-button ui-action-button" data-gantt-optimize-select="none" type="button">${icon("close")}<span>Снять</span></button>
              </div>
            </div>

            ${items.length ? `
              <div class="gantt-optimization-list">
                ${items.map((item) => `
                  <label class="gantt-optimization-item">
                    <input name="workOrderKey" type="checkbox" value="${escapeAttribute(item.key)}" ${selectedKeys.has(item.key) ? "checked" : ""} ${item.movableCount ? "" : "disabled"} />
                    <span>
                      <strong>${escapeHtml(item.title)}</strong>
                      <small>${escapeHtml(item.objectLabel)} · ${item.quantity.toLocaleString("ru-RU")} шт.</small>
                    </span>
                    <em>${item.slotCount.toLocaleString("ru-RU")} оп. · ${item.chains.toLocaleString("ru-RU")} цеп.</em>
                    <b>${item.start && item.end ? `${formatDateTime(item.start)} - ${formatDateTime(item.end)}` : "нет окна"}</b>
                    <i>${item.movableCount ? `доступно ${item.movableCount}` : "нет доступных"}</i>
                  </label>
                `).join("")}
              </div>
            ` : `
              <div class="module-preview-empty">
                ${icon("info")}
                <strong>Нет заказ-нарядов для оптимизации</strong>
                <span>В текущем представлении Ганта нет размещенных операций.</span>
              </div>
            `}
          </div>

          <div class="modal-footer">
            <button class="secondary-button ui-action-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button ui-action-button" type="submit" ${items.some((item) => item.movableCount) ? "" : "disabled"}>${icon("refresh")}<span>Оптимизировать выбранные</span></button>
          </div>
        </form>
      `,
      })}
    </div>
  `;
}

function renderPlanningDirectorCommand(warningsContext, stats, scaleInfo) {
  const warnings = warningsContext.warnings || [];
  const backlog = buildBacklogItems(240);
  const critical = warnings.filter((warning) => warning.severity === "critical");
  const riskyProjects = getProductionContexts()
    .map((project) => ({
      project,
      dueState: getProjectDeadlineState(project),
      warnings: warnings.filter((warning) => getWarningProductionId(warning) === project.id).length,
      backlog: backlog.filter((item) => item.project.id === project.id).length,
      progress: calculateProjectProgress(project, planningState),
    }))
    .sort((left, right) => (
      Number(left.dueState.slackMs ?? Number.MAX_SAFE_INTEGER) - Number(right.dueState.slackMs ?? Number.MAX_SAFE_INTEGER)
      || right.warnings - left.warnings
      || right.backlog - left.backlog
    ));
  const outputReceiptSlots = planningState.slots.filter((slot) => isManufacturingOutputReceiptSlot(slot));
  const completedOutputReceipt = outputReceiptSlots.filter((slot) => isGanttSlotCompleted(slot)).length;
  const activeSlots = planningState.slots.filter((slot) => ["in_progress", "problem", "overdue"].includes(getGanttSlotStatusView(slot).value)).length;
  const plannedHours = planningState.slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0);
  const flowSteps = [
    {
      id: "queue",
      index: "01",
      title: "Очередь маршрута",
      value: backlog.length,
      caption: backlog.length ? "операций ждут размещения" : "все обязательные шаги размещены",
      tone: backlog.length ? "warning" : "ok",
    },
    {
      id: "schedule",
      index: "02",
      title: "Размещение",
      value: `${stats.slots}`,
      caption: `${formatDuration(plannedHours * 60 * 60 * 1000)} в плане · масштаб ${scaleConfig[ui.scale].label.toLowerCase()}`,
      tone: activeSlots ? "active" : "neutral",
    },
    {
      id: "control",
      index: "03",
      title: "Контроль плана",
      value: warnings.length,
      caption: critical.length ? `${critical.length} критичных конфликтов` : "критичных конфликтов нет",
      tone: critical.length ? "critical" : warnings.length ? "warning" : "ok",
    },
    {
      id: "warehouse",
      index: "04",
      title: "Приемка выпуска",
      value: `${completedOutputReceipt}/${outputReceiptSlots.length || 0}`,
      caption: "готовые изделия и полуфабрикаты",
      tone: outputReceiptSlots.length && completedOutputReceipt === outputReceiptSlots.length ? "ok" : "active",
    },
  ];

  return `
    <section class="director-command" aria-label="Линейный контур директора производства">
      <div class="director-command-head">
        <div>
          <span class="eyebrow">Контур директора производства</span>
          <strong>Портфель → очередь → Гант → контроль → выпуск</strong>
        </div>
        <div class="director-command-actions">
          <button class="secondary-button ui-action-button" data-open-planning-module type="button">${icon("calendar")}<span>Открыть заказ-наряды</span></button>
          <button class="secondary-button ui-action-button ${critical.length ? "danger" : ""}" data-fix-all-warnings type="button" ${warnings.length ? "" : "disabled"}>${icon("refresh")}<span>Исправить конфликты</span></button>
          <button class="secondary-button ui-action-button" data-save-plan-snapshot type="button">${icon("save")}<span>Снимок</span></button>
        </div>
      </div>

      <div class="director-flow-grid">
        ${flowSteps.map((step) => renderDirectorFlowStep(step)).join("")}
      </div>

      <div class="director-order-strip" aria-label="Приоритетные заказ-наряды">
        ${riskyProjects.slice(0, 5).map((item) => `
          <button class="director-order-chip ${item.dueState.tone}" data-focus-order="${item.project.id}" type="button">
            <strong>${escapeHtml(getProjectDisplayName(item.project))}</strong>
            <span>${escapeHtml(item.project.orderNumber)} · ${item.progress}% · ${escapeHtml(item.dueState.label)}</span>
            <em>${item.warnings ? `${item.warnings} сигн.` : item.backlog ? `${item.backlog} в очереди` : "маршрут закрыт"}</em>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDirectorFlowStep(step) {
  return `
    <article class="director-flow-step ${step.tone}">
      <b>${escapeHtml(step.index)}</b>
      <div>
        <strong>${escapeHtml(step.title)}</strong>
        <span>${escapeHtml(step.caption)}</span>
      </div>
      <em>${escapeHtml(step.value)}</em>
    </article>
  `;
}

function getTimelineWeekGroups(scaleInfo) {
  const groups = [];
  scaleInfo.ticks.forEach((tick, index) => {
    const weekStart = startOfWeek(tick.start);
    const key = toDateInput(weekStart);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) {
      groups.push({
        key,
        start: weekStart,
        startIndex: index,
        dayCount: 1,
      });
    } else {
      last.dayCount += 1;
    }
  });
  return groups;
}

function renderTimeline(scaleInfo) {
  const groupedDays = ui.scale === "days";
  return `
    <div class="timeline-row" data-ui-component="GanttTimeline" style="height:${TIMELINE_HEIGHT}px;">
      <div class="timeline-corner">
        <span>Маршрутные карты и операции</span>
        <div class="gantt-row-metric-head" aria-hidden="true">
          <b>План</b>
          <b>Факт</b>
        </div>
      </div>
      <div class="timeline-cells ${groupedDays ? "is-grouped-by-week" : ""}" style="width:${scaleInfo.width}px; left:${LEFT_WIDTH}px;">
        ${groupedDays ? `
          <div class="timeline-week-group-row">
            ${getTimelineWeekGroups(scaleInfo).map((group) => renderGanttTimelineWeekGroup(group, scaleInfo)).join("")}
          </div>
          <div class="timeline-day-cell-row">
            ${scaleInfo.ticks.map((tick, index) => renderGanttTimelineDayCell(tick, index, scaleInfo)).join("")}
          </div>
        ` : scaleInfo.ticks.map((tick, index) => `
          <div class="timeline-cell" style="left:${index * scaleInfo.cellWidth}px; width:${scaleInfo.cellWidth}px;">
            <strong>${escapeHtml(tick.label)}</strong>
            <small>${escapeHtml(tick.sublabel)}</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderGanttTimelineWeekGroup(group, scaleInfo) {
  const weekEnd = addMs(group.start, (group.dayCount - 1) * DAY_MS);
  return `
    <div class="timeline-week-group" style="left:${group.startIndex * scaleInfo.cellWidth}px; width:${group.dayCount * scaleInfo.cellWidth}px;">
      <strong>Неделя ${getWeekNumber(group.start)}</strong>
      <small>${escapeHtml(formatShortDate(group.start))}-${escapeHtml(formatShortDate(weekEnd))}</small>
    </div>
  `;
}

function renderGanttTimelineDayCell(tick, index, scaleInfo) {
  const isWeekend = tick.start.getDay() === 0 || tick.start.getDay() === 6;
  const isWeekStart = tick.start.getDay() === 1 || index === 0;
  return `
    <div class="timeline-cell ${isWeekend ? "is-weekend" : ""} ${isWeekStart ? "is-week-start" : ""}" style="left:${index * scaleInfo.cellWidth}px; width:${scaleInfo.cellWidth}px;">
      <strong>${escapeHtml(tick.label)}</strong>
      <small>${escapeHtml(tick.sublabel || formatShortDate(tick.start))}</small>
    </div>
  `;
}

function getGanttWeekBoundaries(scaleInfo) {
  const boundaries = [];
  let cursor = startOfWeek(scaleInfo.start);
  if (cursor <= scaleInfo.start) cursor = addMs(cursor, 7 * DAY_MS);

  while (cursor < scaleInfo.end) {
    const left = dateToX(cursor, scaleInfo);
    if (left > 0 && left < scaleInfo.width) {
      boundaries.push({ date: cursor, left });
    }
    cursor = addMs(cursor, 7 * DAY_MS);
  }

  return boundaries;
}

function renderGanttWeekBoundaryLayer(scaleInfo) {
  const boundaries = getGanttWeekBoundaries(scaleInfo);
  if (!boundaries.length) return "";

  return `
    <div class="gantt-week-boundary-layer" aria-hidden="true">
      ${boundaries.map((boundary) => `
        <span class="gantt-week-boundary" style="left:${round(boundary.left)}px;" title="Начало недели ${escapeAttribute(formatDate(boundary.date))}"></span>
      `).join("")}
    </div>
  `;
}

function renderRow(row, rowLayout, scaleInfo, slotWarningMap, slotPlacementMap, sharedNonWorkingIntervals = []) {
  const layout = rowLayout.map[row.id];
  const height = layout.height;
  const isAggregateRow = row.type === "route" || row.type === "project";
  const laneClass = isAggregateRow
    ? "production-lane route-lane"
    : row.type === "resource"
      ? "workcenter-lane resource-lane"
      : row.type === "operation"
        ? "workcenter-lane operation-lane"
        : "workcenter-lane department-lane";
  const rowSlots = getRowSlots(row);
  const rowPlacements = slotPlacementMap[row.id] || {};
  const isDropTarget = ui.drag?.targetRowId === row.id;

  return `
    <div class="gantt-row ${row.type}-row ${isDropTarget ? "is-drop-target" : ""}" data-row-id="${row.id}" style="height:${height}px; top:${layout.top}px;">
      ${renderRowLabel(row, slotWarningMap)}
      <div class="lane ${laneClass}" data-lane-row-id="${row.id}" style="left:${LEFT_WIDTH}px; width:${scaleInfo.width}px; height:${height}px; --cell-width:${scaleInfo.cellWidth}px;">
        ${renderGanttWeekBoundaryLayer(scaleInfo)}
        ${renderNonWorkingLayer(row, scaleInfo, height, sharedNonWorkingIntervals)}
        ${renderTodayMarker(scaleInfo, height)}
        ${rowSlots.map((slot) => renderSlot(slot, row, scaleInfo, slotWarningMap, rowPlacements[slot.id])).join("")}
      </div>
    </div>
  `;
}

function parseShiftMinutes(mode) {
  const match = String(mode || "").match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return { start: 8 * 60, end: 20 * 60 };

  const startHour = Math.max(0, Math.min(23, Number(match[1])));
  const startMinute = Math.max(0, Math.min(59, Number(match[2])));
  const endHour = Math.max(0, Math.min(24, Number(match[3])));
  const endMinute = Math.max(0, Math.min(59, Number(match[4])));

  return {
    start: Math.min(24 * 60, startHour * 60 + startMinute),
    end: Math.min(24 * 60, endHour * 60 + endMinute),
  };
}

function getWorkCenterCalendar(workCenter) {
  const fallbackSchedule = isWarehouseWorkCenterId(workCenter?.id) || workCenter?.unitType === "warehouse" ? "24/7" : "5/2";
  const scheduleType = normalizeWorkSchedule(workCenter?.workSchedule || workCenter?.shift, fallbackSchedule);
  const modeText = normalizeWorkMode(workCenter?.workMode || workCenter?.shift, getDefaultWorkMode(scheduleType, scheduleType === "24/7"));
  const calendar = createWorkingCalendar({ ...workCenter, workSchedule: scheduleType, workMode: modeText }, {
    isWarehouse: isWarehouseWorkCenterId(workCenter?.id) || workCenter?.unitType === "warehouse",
  });
  return {
    ...calendar,
    label: formatWorkShift(scheduleType, modeText),
  };
}

function isScheduleWorkDay(calendar, dayStart) {
  return isCalendarWorkDay(calendar, dayStart);
}

function getCalendarWorkCenterId(workCenterId) {
  const id = mapLegacyWorkCenterId(workCenterId);
  if (isSmtLineWorkCenterId(id)) return getSmtLineIdFromWorkCenterId(id) || "D3_L1";
  return id;
}

function getCalendarWorkCenter(workCenterId, state = null) {
  const sourceState = state || getRuntimePlanningState();
  const requestedId = String(workCenterId || "");
  const calendarWorkCenterId = getCalendarWorkCenterId(requestedId);
  return sourceState?.workCenters?.find((center) => center.id === calendarWorkCenterId)
    || getRuntimePlanningState()?.workCenters?.find((center) => center.id === calendarWorkCenterId)
    || {
      id: calendarWorkCenterId || requestedId,
      name: calendarWorkCenterId || requestedId || "Отдел",
      workSchedule: MES_SMT_WORK_CENTER_IDS.includes(calendarWorkCenterId) ? "2/2" : "24/7",
      workMode: MES_SMT_WORK_CENTER_IDS.includes(calendarWorkCenterId) ? "08:00-20:00" : "00:00-24:00",
      shift: MES_SMT_WORK_CENTER_IDS.includes(calendarWorkCenterId) ? "2/2 08:00-20:00" : "24/7 00:00-24:00",
      isPlanningUnit: true,
    };
}

function getGanttRowCalendar(row) {
  if (!["operation", "workCenter", "resource"].includes(row?.type)) return null;
  const calendarWorkCenterId = row.workCenter?.calendarWorkCenterId
    || getCalendarWorkCenterId(row.workCenterId || row.workCenter?.id)
    || row.workCenter?.parentWorkCenterId;
  return getWorkCenterCalendar(getCalendarWorkCenter(calendarWorkCenterId, planningState));
}

function getGanttRowCalendarWorkCenterId(row) {
  if (!["operation", "workCenter", "resource"].includes(row?.type)) return "";
  return row.workCenter?.calendarWorkCenterId
    || getCalendarWorkCenterId(row.workCenterId || row.workCenter?.id)
    || row.workCenter?.parentWorkCenterId;
}

function getWorkingIntervalsForCalendar(calendar, value) {
  return getCalendarWorkingIntervals(calendar, value);
}

function getWorkingIntervalsForDay(workCenterId, value, state = null) {
  return getWorkingIntervalsForCalendar(
    getWorkCenterCalendar(getCalendarWorkCenter(workCenterId, state)),
    value,
  );
}

function getWorkingIntervalsBetween(workCenterId, start, end, state = null) {
  const rangeStart = toDate(start);
  const rangeEnd = toDate(end);
  if (rangeEnd <= rangeStart) return [];

  const intervals = [];
  let cursor = startOfDay(rangeStart);
  let guard = 0;
  while (cursor < rangeEnd && guard < 370) {
    guard += 1;
    getWorkingIntervalsForDay(workCenterId, cursor, state).forEach((interval) => {
      const clippedStart = new Date(Math.max(interval.start.getTime(), rangeStart.getTime()));
      const clippedEnd = new Date(Math.min(interval.end.getTime(), rangeEnd.getTime()));
      if (clippedEnd > clippedStart) intervals.push({ start: clippedStart, end: clippedEnd });
    });
    cursor = addCalendarDays(cursor, 1);
  }

  return intervals;
}

function snapToWorkingTime(workCenterId, value, state = null) {
  return snapToCalendarWorkingTime(getWorkCenterCalendar(getCalendarWorkCenter(workCenterId, state)), value);
}

function addWorkingDuration(workCenterId, start, durationMs, state = null) {
  return addCalendarWorkingDuration(getWorkCenterCalendar(getCalendarWorkCenter(workCenterId, state)), start, durationMs);
}

function getWorkingDurationBetween(workCenterId, start, end, state = null) {
  return getWorkingIntervalsBetween(workCenterId, start, end, state)
    .reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
}

function minuteToDate(dayStart, minute) {
  return addMs(dayStart, minute * 60 * 1000);
}

function addCalendarDays(value, days = 1) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addNonWorkingSegment(segments, start, end, type, scaleInfo) {
  const segmentStart = toDate(start);
  const segmentEnd = toDate(end);
  const clippedStart = new Date(Math.max(segmentStart.getTime(), scaleInfo.start.getTime()));
  const clippedEnd = new Date(Math.min(segmentEnd.getTime(), scaleInfo.end.getTime()));
  if (clippedEnd <= clippedStart) return;

  const left = dateToX(clippedStart, scaleInfo);
  const right = dateToX(clippedEnd, scaleInfo);
  if (right <= 0 || left >= scaleInfo.width) return;

  segments.push({
    type,
    start: clippedStart,
    end: clippedEnd,
    left: Math.max(0, left),
    width: Math.max(1, Math.min(scaleInfo.width, right) - Math.max(0, left)),
  });
}

function buildVisibleSharedNonWorkingIntervals(rows, scaleInfo) {
  if (!ui.hideSharedNonWorkingZones) return [];

  const calendarWorkCenterIds = [...new Set(rows
    .map((row) => getGanttRowCalendarWorkCenterId(row))
    .filter(Boolean))]
    .filter((workCenterId) => {
      const calendar = getWorkCenterCalendar(getCalendarWorkCenter(workCenterId, planningState));
      return !calendar?.isAlwaysOn;
    });
  if (!calendarWorkCenterIds.length) return [];

  const sharedIntervals = [];
  let cursor = startOfDay(scaleInfo.start);

  while (cursor < scaleInfo.end) {
    const dayStart = cursor;
    const dayEnd = addCalendarDays(dayStart, 1);
    const rangeStart = new Date(Math.max(dayStart.getTime(), scaleInfo.start.getTime()));
    const rangeEnd = new Date(Math.min(dayEnd.getTime(), scaleInfo.end.getTime()));

    const workingUnion = calendarWorkCenterIds
      .flatMap((workCenterId) => getWorkingIntervalsForDay(workCenterId, dayStart, planningState))
      .map((interval) => ({
        start: new Date(Math.max(interval.start.getTime(), rangeStart.getTime())),
        end: new Date(Math.min(interval.end.getTime(), rangeEnd.getTime())),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((left, right) => left.start - right.start);

    const mergedWorking = [];
    workingUnion.forEach((interval) => {
      const previous = mergedWorking[mergedWorking.length - 1];
      if (!previous || interval.start > previous.end) {
        mergedWorking.push({ ...interval });
        return;
      }
      if (interval.end > previous.end) previous.end = interval.end;
    });

    let offCursor = rangeStart;
    mergedWorking.forEach((interval) => {
      if (interval.start > offCursor) {
        sharedIntervals.push({ start: offCursor, end: interval.start });
      }
      if (interval.end > offCursor) offCursor = interval.end;
    });

    if (offCursor < rangeEnd) sharedIntervals.push({ start: offCursor, end: rangeEnd });
    cursor = dayEnd;
  }

  return sharedIntervals;
}

function removeSharedNonWorkingIntervals(segments, sharedIntervals, scaleInfo) {
  if (!sharedIntervals.length || !segments.length) return segments;

  const visibleSegments = [];
  segments.forEach((segment) => {
    let pieces = [{ start: segment.start, end: segment.end }];

    sharedIntervals.forEach((sharedInterval) => {
      pieces = pieces.flatMap((piece) => {
        if (sharedInterval.end <= piece.start || sharedInterval.start >= piece.end) return [piece];
        const nextPieces = [];
        if (sharedInterval.start > piece.start) nextPieces.push({ start: piece.start, end: sharedInterval.start });
        if (sharedInterval.end < piece.end) nextPieces.push({ start: sharedInterval.end, end: piece.end });
        return nextPieces;
      });
    });

    pieces.forEach((piece) => addNonWorkingSegment(visibleSegments, piece.start, piece.end, segment.type, scaleInfo));
  });

  return visibleSegments;
}

function buildNonWorkingSegments(row, scaleInfo, sharedNonWorkingIntervals = []) {
  const segments = [];
  if (!["operation", "workCenter", "resource"].includes(row?.type)) return segments;

  const calendar = getGanttRowCalendar(row);
  if (calendar?.isAlwaysOn) return segments;

  let cursor = startOfDay(scaleInfo.start);
  while (cursor < scaleInfo.end) {
    const nextDay = addCalendarDays(cursor, 1);

    if (!row.workCenter?.id || calendar.start === calendar.end) {
      addNonWorkingSegment(segments, cursor, nextDay, "day-off", scaleInfo);
      cursor = nextDay;
      continue;
    }

    const workingIntervals = getWorkingIntervalsForCalendar(calendar, cursor)
      .map((interval) => ({
        start: new Date(Math.max(interval.start.getTime(), cursor.getTime())),
        end: new Date(Math.min(interval.end.getTime(), nextDay.getTime())),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((left, right) => left.start - right.start);

    if (!workingIntervals.length) {
      addNonWorkingSegment(segments, cursor, nextDay, "day-off", scaleInfo);
      cursor = nextDay;
      continue;
    }

    let offCursor = cursor;
    workingIntervals.forEach((interval) => {
      if (interval.start > offCursor) {
        addNonWorkingSegment(segments, offCursor, interval.start, "off-hours", scaleInfo);
      }
      if (interval.end > offCursor) offCursor = interval.end;
    });

    if (offCursor < nextDay) {
      addNonWorkingSegment(segments, offCursor, nextDay, "off-hours", scaleInfo);
    }

    cursor = nextDay;
  }

  return removeSharedNonWorkingIntervals(segments, sharedNonWorkingIntervals, scaleInfo);
}

function renderNonWorkingLayer(row, scaleInfo, height, sharedNonWorkingIntervals = []) {
  const segments = buildNonWorkingSegments(row, scaleInfo, sharedNonWorkingIntervals);
  if (!segments.length) return "";

  const label = `Нерабочее время по графику отдела: ${getWorkCalendarLabel(row.workCenter)}`;

  return `
    <div class="non-working-layer" data-ui-component="GanttNonWorkingLayer" style="height:${height}px;" aria-hidden="true">
      ${segments.map((segment) => `
        <span class="non-working-segment is-${segment.type}" data-ui-component="GanttNonWorkingZone" style="left:${round(segment.left)}px; width:${round(segment.width)}px;" title="${escapeAttribute(label)}"></span>
      `).join("")}
    </div>
  `;
}

function renderRowLabel(row, slotWarningMap = {}) {
  if (row.type === "route") {
    const route = row.route;
    const project = row.project || getRoutePlanningContext(route);
    const specification = getRouteSpecification(route);
    const bom = getRouteBomList(route);
    const progress = project ? calculateProjectProgress(project, planningState) : 0;
    const isExpanded = isGanttRouteExpanded(route);
    const dueState = project ? getProjectDeadlineState(project) : { tone: "neutral", label: "срок не задан" };
    const orderState = getPlanningRouteOrderState(route);

    return `
      <div class="row-label production-label route-label">
        <button class="chevron" data-toggle-project="${escapeAttribute(route.id)}" type="button" title="${isExpanded ? "Свернуть" : "Раскрыть"} маршрутную карту">
          ${icon(isExpanded ? "chevronDown" : "chevronRight")}
        </button>
        <div class="production-main">
          <div class="production-name-line">
            <strong>${escapeHtml(route.name || "Маршрутная карта")}</strong>
          </div>
          <div class="production-meta">${escapeHtml(bom?.name || specification?.name || getProjectDisplayName(project) || "BOM или состав изделия не выбран")} · ${Number(getPlanningRouteQuantity(route) || project?.totalQuantity || 0).toLocaleString("ru-RU")} шт.</div>
        </div>
        <div class="production-side">
          <span class="deadline-badge ${dueState.tone}" title="Запас до срока">${escapeHtml(dueState.label)}</span>
          <span class="production-status">${escapeHtml(orderState.label)}</span>
          <strong class="production-progress-value">${progress}%</strong>
          <div class="progress" title="Прогресс маршрутной карты"><span style="width:${progress}%"></span></div>
        </div>
        ${renderGanttRowMetricCells(row)}
      </div>
    `;
  }

  if (row.type === "project") {
    const project = row.project;
    const specification = getSpecificationByProjectId(project.id);
    const progress = calculateProjectProgress(project, planningState);
    const isExpanded = ui.expandedProjects.has(project.id);
    const dueState = getProjectDeadlineState(project);

    return `
      <div class="row-label production-label">
        <button class="chevron" data-toggle-project="${project.id}" type="button" title="${isExpanded ? "Свернуть" : "Раскрыть"} состав изделия">
          ${icon(isExpanded ? "chevronDown" : "chevronRight")}
        </button>
        <div class="production-main">
          <div class="production-name-line">
            <strong>${escapeHtml(getProjectDisplayName(project))}</strong>
          </div>
          <div class="production-meta">${escapeHtml(specification?.outputItem || project.orderNumber || "изделие не задано")} · ${project.totalQuantity} шт. · срок ${formatDate(project.dueDate)}</div>
          ${renderProjectRouteMini(project, slotWarningMap)}
        </div>
        <div class="production-side">
          <span class="deadline-badge ${dueState.tone}" title="Запас до срока">${escapeHtml(dueState.label)}</span>
          <strong class="production-progress-value">${progress}%</strong>
          <div class="progress" title="Прогресс заказ-наряда"><span style="width:${progress}%"></span></div>
        </div>
        ${renderGanttRowMetricCells(row)}
      </div>
    `;
  }

  if (row.type === "operation") {
    const step = row.routeStep || {};
    const workCenter = row.workCenter || getWorkCenter(step.workCenterId) || {};
    const operation = getOperationMapItem(step.operationId);
    const taskName = getRouteStepTaskId(step) !== MAIN_ROUTE_TASK_ID ? String(step.specTaskName || "").trim() : "";
    const operationName = step.operationName || operation?.name || "Операция";
    const orderLabel = Number(step.stepOrder || 0) > 0 ? String(step.stepOrder).padStart(2, "0") : "Оп";

    return `
      <div class="row-label workcenter-label operation-label">
        <span class="workcenter-code">${escapeHtml(orderLabel)}</span>
        <span class="workcenter-name">
          <strong>${escapeHtml(operationName)}</strong>
          <small>${escapeHtml([workCenter.name || "отдел не выбран", taskName].filter(Boolean).join(" · "))}</small>
        </span>
        ${renderGanttRowMetricCells(row)}
      </div>
    `;
  }

  if (row.type === "resource") {
    const resource = row.resource || {};
    const rowSlots = row.slots?.length ? row.slots : getRowSlots(row);
    const workCenter = row.workCenter || getWorkCenter(row.workCenterId) || null;
    const operationNames = [...new Set(rowSlots
      .map((slot) => slot.operationName || planningState.routeSteps.find((step) => step.id === slot.routeStepId)?.operationName || "")
      .map((name) => String(name || "").trim())
      .filter(Boolean))];
    const hiddenOperationCount = Math.max(0, operationNames.length - 2);
    const operationCaption = operationNames.length
      ? `${operationNames.slice(0, 2).join(", ")}${hiddenOperationCount ? ` и еще ${hiddenOperationCount}` : ""}`
      : "операции не размещены";
    const meta = [workCenter?.name || "", operationCaption, `${rowSlots.length} сл.`].filter(Boolean).join(" · ");
    const passiveClass = resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource) ? "" : "is-passive-resource";
    return `
      <div class="row-label workcenter-label resource-label ${passiveClass}">
        <span class="workcenter-name">
          <strong>${escapeHtml(resource.name || "Производственный ресурс")}</strong>
          <small>${escapeHtml(meta)}</small>
        </span>
        ${renderGanttRowMetricCells(row)}
      </div>
    `;
  }

  return `
    <div class="row-label workcenter-label department-label">
      <span class="workcenter-code">${escapeHtml(row.workCenter.code)}</span>
      <span class="workcenter-name">${escapeHtml(row.workCenter.name)}</span>
      ${row.isOutsideRoute ? `<span class="outside-route">вне маршрута</span>` : ""}
      ${renderGanttRowMetricCells(row)}
    </div>
  `;
}

function getGanttLinkedRecordEntries(source = {}, slotId = "") {
  if (!source || !slotId) return [];
  const prefix = `${slotId}::`;
  return Object.entries(source && typeof source === "object" ? source : {})
    .filter(([key, record]) => {
      const recordSlotId = String(record?.slotId || "");
      return key === slotId
        || key.startsWith(prefix)
        || recordSlotId === slotId
        || recordSlotId.startsWith(prefix);
    })
    .map(([key, record]) => [record?.slotId || key, record])
    .filter(([, record]) => Boolean(record));
}

function getGanttFactRecordEntries(source = {}, slotId = "") {
  return getGanttLinkedRecordEntries(source, slotId).map(([, record]) => record).filter(Boolean);
}

function isGanttFactRecordReported(record = {}) {
  const status = String(record.status || "").trim();
  return normalizeShiftMasterFactQuantity(record.actualQuantity || 0) > 0
    || normalizeShiftMasterFactQuantity(record.defectQuantity || 0) > 0
    || Boolean(String(record.updatedAt || record.factUpdatedAt || "").trim())
    || (status && status !== "not_reported");
}

function sumGanttFactRecords(records = []) {
  const reportedRecords = records.filter(isGanttFactRecordReported);
  if (!reportedRecords.length) return null;
  return reportedRecords.reduce((sum, record) => sum + normalizeShiftMasterFactQuantity(record.actualQuantity || 0), 0);
}

function getGanttSlotFactQuantity(slot = {}) {
  if (!slot?.id) return null;
  const masterEntries = getGanttLinkedRecordEntries(planningState.shiftMasterAssignments || {}, slot.id);
  const boardEntries = getShiftMasterBoardFactEntriesForGanttSlot(slot.id);
  const boardKeys = new Set(boardEntries.map(([key]) => key));
  const hasBoardEntries = boardEntries.length > 0;
  const authSessionEntries = hasBoardEntries ? [] : getAuthSessionFactEntriesForGanttSlot(slot.id);
  const records = [
    ...masterEntries
      .filter(([key]) => !boardKeys.has(key) && !(hasBoardEntries && key === slot.id))
      .map(([, record]) => record),
    ...boardEntries.map(([, record]) => record),
    ...authSessionEntries.map(([, record]) => record),
  ];
  return sumGanttFactRecords(records);
}

function getShiftMasterAssignmentQuantity(assignment = null) {
  if (!assignment) return 0;
  const executorQuantity = (assignment.executors || [])
    .reduce((sum, executor) => sum + normalizeShiftMasterExecutorQuantity(executor.quantity || 0), 0);
  if (executorQuantity > 0) return executorQuantity;
  if (assignment.hasAssignedQuantity) {
    return normalizeShiftMasterFactQuantity(assignment.assignedQuantity);
  }
  const assignedQuantity = normalizeShiftMasterFactQuantity(assignment.assignedQuantity);
  if (assignedQuantity > 0) return assignedQuantity;
  return normalizeQuantity(assignment.plannedQuantity || 0);
}

function getShiftMasterAssignmentsForGanttSlot(slotId = "") {
  const masterEntries = getGanttLinkedRecordEntries(planningState.shiftMasterAssignments || {}, slotId);
  const boardEntries = getShiftMasterBoardAssignmentEntriesForGanttSlot(slotId);
  const boardKeys = new Set(boardEntries.map(([key]) => key));
  const hasBoardEntries = boardEntries.length > 0;
  return [
    ...masterEntries
      .filter(([key]) => !boardKeys.has(key) && !(hasBoardEntries && key === slotId))
      .map(([, record]) => record),
    ...boardEntries.map(([, record]) => record),
  ].filter(Boolean);
}

function getShiftMasterBoardAssignmentEntriesForGanttSlot(slotId = "") {
  return getGanttLinkedRecordEntries(normalizePlainRecord(ui.shiftMasterBoardAssignments), slotId)
    .map(([key, record]) => {
      const linkedSlotId = String(record?.slotId || key || "").trim();
      const normalized = normalizeShiftMasterAssignment({
        ...record,
        slotId: linkedSlotId,
        status: record?.issued || record?.status === "issued" ? "issued" : "draft",
        issuedAt: record?.issued || record?.status === "issued" ? record?.issuedAt || record?.updatedAt || "" : "",
        plannedQuantity: record?.plannedQuantity || 0,
        assignedQuantity: record?.assignedQuantity || 0,
        actualQuantity: 0,
        defectQuantity: 0,
        laborMinutes: 0,
        executorCount: 0,
      });
      return normalized ? [key, normalized] : null;
    })
    .filter(Boolean);
}

function getShiftMasterBoardFactEntriesForGanttSlot(slotId = "") {
  return getGanttLinkedRecordEntries(normalizePlainRecord(ui.shiftMasterBoardFacts), slotId)
    .map(([key, record]) => {
      const actualQuantity = normalizeShiftMasterBoardQuantity(record?.actualQuantity || 0);
      const defectQuantity = normalizeShiftMasterBoardQuantity(record?.defectQuantity || 0);
      const goodQuantity = Math.max(0, actualQuantity - defectQuantity);
      const linkedSlotId = String(record?.slotId || key || "").trim();
      return [key, {
        slotId: linkedSlotId,
        actualQuantity: goodQuantity,
        defectQuantity,
        laborMinutes: normalizeDispatchLaborMinutes(record?.laborMinutes || 0),
        executorCount: normalizeDispatchExecutorCount(record?.executorCount || 0),
        status: goodQuantity > 0 ? "accepted" : "not_reported",
        comment: String(record?.comment || ""),
        deviationComment: String(record?.deviationComment || ""),
        deviationNotes: Array.isArray(record?.deviationNotes) ? record.deviationNotes : [],
        updatedAt: String(record?.updatedAt || ""),
      }];
    });
}

function getAuthSessionFactEntriesForGanttSlot(slotId = "") {
  if (!slotId) return [];
  const assignmentStore = normalizePlainRecord(ui.shiftMasterBoardAssignments);
  const drafts = normalizePlainRecord(ui.authSessionFactDrafts);
  const findAssignment = (rowId = "") => {
    if (!rowId) return {};
    const direct = normalizePlainRecord(assignmentStore[rowId]);
    if (Object.keys(direct).length) return direct;
    return Object.values(assignmentStore).find((assignment) => (
      assignment
      && (
        assignment.sourceRowId === rowId
        || assignment.slotId === rowId
        || assignment.sheetContract?.rowId === rowId
        || assignment.sheetContract?.sourceSlotId === rowId
      )
    )) || {};
  };

  return Object.entries(drafts).map(([taskId, draft]) => {
    const normalizedDraft = normalizePlainRecord(draft);
    if (!normalizedDraft.updatedAt) return null;
    const rowId = getAuthSessionTaskRowId(taskId);
    const assignment = findAssignment(rowId);
    const linkedSlotId = String(
      assignment.slotId
      || assignment.sheetContract?.sourceSlotId
      || assignment.transferContract?.sourceSlotId
      || rowId,
    ).trim();
    const matchesSlot = linkedSlotId === slotId
      || rowId === slotId
      || String(taskId || "").startsWith(`${slotId}::`);
    if (!matchesSlot) return null;
    const rawActualQuantity = normalizeShiftMasterBoardQuantity(normalizedDraft.actualQuantity || 0);
    const defectQuantity = normalizeShiftMasterBoardQuantity(normalizedDraft.defectQuantity || 0);
    const goodQuantity = Math.max(0, rawActualQuantity - defectQuantity);
    const laborMinutesPerUnit = normalizePlanningLaborPositiveNumber(
      assignment.laborMinutesPerUnit
      || assignment.minutesPerUnit
      || assignment.planningLaborMinutesPerUnit
      || 0,
    );
    return [taskId, {
      slotId: linkedSlotId || slotId,
      actualQuantity: goodQuantity,
      defectQuantity,
      laborMinutes: rawActualQuantity * laborMinutesPerUnit,
      executorCount: 1,
      status: "accepted",
      comment: "Факт внесен с рабочего стола исполнителя",
      deviationComment: String(normalizedDraft.deviationComment || ""),
      deviationNotes: String(normalizedDraft.deviationComment || "").trim() ? [{
        taskId,
        employeeName: "Исполнитель",
        text: String(normalizedDraft.deviationComment || "").trim(),
        createdAt: String(normalizedDraft.updatedAt || ""),
        deviationPercent: 0,
      }] : [],
      updatedAt: String(normalizedDraft.updatedAt || ""),
    }];
  }).filter(Boolean);
}

function getGanttSlotOperationalState(slot = {}, overrides = {}) {
  const plannedQuantity = normalizeGanttOperationalQuantity(overrides.plannedQuantity ?? slot.quantity ?? 0);
  if (!slot?.id || plannedQuantity <= 0) {
    return {
      plannedQuantity,
      assignedQuantity: 0,
      factQuantity: null,
      hasAssignment: false,
      hasFact: false,
      className: "",
      title: "",
      hoverTitle: getGanttSlotHoverSummaryText({ plannedQuantity, assignedQuantity: 0, factQuantity: 0 }),
    };
  }

  const assignments = getShiftMasterAssignmentsForGanttSlot(slot.id);
  const hasAssignment = assignments.length > 0;
  const sourceAssignedQuantity = assignments.reduce((sum, assignment) => sum + getShiftMasterAssignmentQuantity(assignment), 0);
  const isIssued = assignments.some((assignment) => assignment?.status === "issued" || assignment?.issuedAt);
  const assignedQuantity = normalizeGanttOperationalQuantity(overrides.assignedQuantity ?? sourceAssignedQuantity);
  const rawFactQuantity = typeof overrides.factQuantity === "undefined"
    ? getGanttSlotFactQuantity(slot)
    : overrides.factQuantity;
  const hasFact = rawFactQuantity !== null && typeof rawFactQuantity !== "undefined";
  const factQuantity = hasFact ? normalizeGanttOperationalQuantity(rawFactQuantity || 0) : null;
  const validationPercent = plannedQuantity > 0 ? Math.max(0, Math.min(100, assignedQuantity / plannedQuantity * 100)) : 0;
  const factPercent = plannedQuantity > 0 && hasFact ? Math.max(0, Math.min(100, factQuantity / plannedQuantity * 100)) : 0;
  const unassignedQuantity = hasAssignment ? Math.max(0, plannedQuantity - assignedQuantity) : 0;
  const unfinishedQuantity = hasFact ? Math.max(0, (hasAssignment ? assignedQuantity : plannedQuantity) - factQuantity) : 0;
  const remainingQuantity = hasFact ? Math.max(0, plannedQuantity - factQuantity) : unassignedQuantity;
  const hasValidation = hasAssignment;
  const validationMismatch = hasValidation && assignedQuantity !== plannedQuantity;
  const factMismatch = hasFact && ((hasValidation && factQuantity !== assignedQuantity) || (!hasValidation && factQuantity !== plannedQuantity));
  const overAssigned = hasValidation && assignedQuantity > plannedQuantity;
  const overFact = hasFact && factQuantity > (hasValidation ? assignedQuantity : plannedQuantity);
  const className = [
    hasValidation ? "is-master-validated" : "",
    isIssued ? "is-master-issued" : "",
    hasFact ? "has-master-fact" : "",
    validationMismatch ? "has-validation-mismatch" : "",
    factMismatch ? "has-fact-mismatch" : "",
    overAssigned ? "has-validation-overrun" : "",
    overFact ? "has-fact-overrun" : "",
  ].filter(Boolean).join(" ");
  const titleParts = [];
  if (hasValidation) {
    titleParts.push(`Распределено: ${assignedQuantity.toLocaleString("ru-RU")} из ${plannedQuantity.toLocaleString("ru-RU")} шт.`);
    if (unassignedQuantity > 0) titleParts.push(`Не распределено: ${unassignedQuantity.toLocaleString("ru-RU")} шт.`);
    if (overAssigned) titleParts.push(`Сверх плана: ${(assignedQuantity - plannedQuantity).toLocaleString("ru-RU")} шт.`);
  }
  if (hasFact) {
    titleParts.push(`Факт: ${factQuantity.toLocaleString("ru-RU")} шт.`);
    if (unfinishedQuantity > 0) titleParts.push(`Недовыполнено: ${unfinishedQuantity.toLocaleString("ru-RU")} шт.`);
    if (overFact) titleParts.push(`Факт сверх распределения: ${(factQuantity - (hasValidation ? assignedQuantity : plannedQuantity)).toLocaleString("ru-RU")} шт.`);
  }
  if (remainingQuantity > 0) titleParts.push(`Остаток операции: ${remainingQuantity.toLocaleString("ru-RU")} шт.`);

  return {
    plannedQuantity,
    assignedQuantity,
    factQuantity,
    hasAssignment,
    hasValidation,
    hasFact,
    validationPercent,
    factPercent,
    validationMismatch,
    factMismatch,
    overAssigned,
    overFact,
    unassignedQuantity,
    unfinishedQuantity,
    remainingQuantity,
    className,
    title: titleParts.join(" "),
    hoverTitle: getGanttSlotHoverSummaryText({
      plannedQuantity,
      assignedQuantity,
      factQuantity,
      hasValidation,
      hasFact,
    }),
  };
}

function getGanttSlotOperationalSegmentState(slot = {}, segmentPlannedQuantity = 0, fullState = null) {
  const state = fullState || getGanttSlotOperationalState(slot);
  if (!state.hasValidation && !state.hasFact) return state;
  const plannedQuantity = normalizeGanttOperationalQuantity(segmentPlannedQuantity || 0);
  if (plannedQuantity <= 0 || state.plannedQuantity <= 0) return {
    ...state,
    plannedQuantity,
    assignedQuantity: 0,
    factQuantity: state.hasFact ? 0 : null,
    validationPercent: 0,
    factPercent: 0,
    unassignedQuantity: 0,
    unfinishedQuantity: 0,
    remainingQuantity: 0,
    title: state.title,
  };
  const ratio = plannedQuantity / state.plannedQuantity;
  const assignedQuantity = Math.round(state.assignedQuantity * ratio);
  const factQuantity = state.hasFact ? Math.round((state.factQuantity || 0) * ratio) : null;
  return getGanttSlotOperationalState(slot, {
    plannedQuantity,
    assignedQuantity,
    factQuantity,
  });
}

function formatGanttRowMetricQuantity(value) {
  if (value === null || typeof value === "undefined") return "—";
  return normalizeGanttOperationalQuantity(value).toLocaleString("ru-RU");
}

function getGanttRowMetrics(row = {}) {
  const slotMap = new Map();
  getRowSlots(row).forEach((slot) => {
    if (slot?.id) slotMap.set(slot.id, slot);
  });
  const slots = [...slotMap.values()];
  const planQuantity = slots.reduce((sum, slot) => sum + normalizeQuantity(slot.quantity || 0), 0);
  let factQuantity = 0;
  let hasFact = false;

  slots.forEach((slot) => {
    const slotFactQuantity = getGanttSlotFactQuantity(slot);
    if (slotFactQuantity === null) return;
    hasFact = true;
    factQuantity += slotFactQuantity;
  });

  const tone = !hasFact
    ? "empty"
    : factQuantity === planQuantity
      ? "ok"
      : factQuantity > planQuantity
        ? "over"
        : "behind";

  return {
    factQuantity: hasFact ? factQuantity : null,
    planQuantity,
    tone,
  };
}

function renderGanttRowMetricCells(row = {}) {
  const metrics = getGanttRowMetrics(row);
  const planLabel = formatGanttRowMetricQuantity(metrics.planQuantity);
  const factLabel = formatGanttRowMetricQuantity(metrics.factQuantity);
  const title = metrics.factQuantity === null
    ? `План: ${planLabel} шт. Факт еще не снят.`
    : `План: ${planLabel} шт. Факт: ${factLabel} шт.`;

  return `
    <span class="gantt-row-metrics" title="${escapeAttribute(title)}" aria-label="${escapeAttribute(title)}">
      <b class="gantt-row-metric is-plan">${escapeHtml(planLabel)}</b>
      <b class="gantt-row-metric is-fact is-${metrics.tone}">${escapeHtml(factLabel)}</b>
    </span>
  `;
}

function renderRouteTaskMini(route, slotWarningMap = {}) {
  const steps = getRouteStepsForModule(route?.id || "");
  const slots = getRouteSlots(route?.id || "");
  if (!steps.length) return "";

  return `
    <div class="route-sequence-mini route-task-mini" aria-label="Маршрутная карта">
      ${steps.map((step) => {
        const stepSlots = slots.filter((slot) => slot.routeStepId === step.id);
        const hasIssue = stepSlots.some((slot) => (slotWarningMap[slot.id] || []).length);
        const isCompleted = stepSlots.length && stepSlots.every((slot) => isGanttSlotCompleted(slot));
        const isActive = stepSlots.some((slot) => isGanttSlotActive(slot));
        const isPlanned = stepSlots.length > 0;
        const className = [
          isCompleted ? "is-done" : "",
          isActive ? "is-active" : "",
          isPlanned ? "is-planned" : "is-empty",
          hasIssue ? "is-warning" : "",
          isManufacturingOutputReceiptRouteStep(step) ? "is-warehouse" : "",
        ].filter(Boolean).join(" ");
        const workCenter = getWorkCenter(step.workCenterId);
        return `<span class="${className}" title="${escapeAttribute(`${step.stepOrder}. ${step.operationName} · ${workCenter?.name || ""}`)}">${step.stepOrder}</span>`;
      }).join("")}
    </div>
  `;
}

function renderProjectRouteMini(project, slotWarningMap = {}) {
  const steps = getProjectRouteSteps(project.id, planningState);
  const slots = planningState.slots.filter((slot) => slotMatchesProductionContext(slot, project.id));
  if (!steps.length) return "";

  return `
    <div class="route-sequence-mini" aria-label="Маршрут изделия">
      ${steps.map((step) => {
        const stepSlots = slots.filter((slot) => slot.routeStepId === step.id);
        const hasIssue = stepSlots.some((slot) => (slotWarningMap[slot.id] || []).length);
        const isCompleted = stepSlots.length && stepSlots.every((slot) => isGanttSlotCompleted(slot));
        const isActive = stepSlots.some((slot) => isGanttSlotActive(slot));
        const isPlanned = stepSlots.length > 0;
        const className = [
          isCompleted ? "is-done" : "",
          isActive ? "is-active" : "",
          isPlanned ? "is-planned" : "is-empty",
          hasIssue ? "is-warning" : "",
          isManufacturingOutputReceiptRouteStep(step) ? "is-warehouse" : "",
        ].filter(Boolean).join(" ");
        const workCenter = getWorkCenter(step.workCenterId);
        return `<span class="${className}" title="${escapeAttribute(`${step.stepOrder}. ${step.operationName} · ${workCenter?.name || ""}`)}">${step.stepOrder}</span>`;
      }).join("")}
    </div>
  `;
}

function renderTodayMarker(scaleInfo, height) {
  const x = dateToX(ui.now, scaleInfo);
  if (x < 0 || x > scaleInfo.width) return "";
  return `<div class="today-marker" style="left:${x}px; height:${height}px;" title="Текущее время"></div>`;
}

function getSlotTransferBatchVisual(slot = null) {
  if (!slot?.id) return null;
  const route = getSlotRoute(slot);
  if (!route?.id) return null;
  const production = getRoutePlanningContext(route);
  const productionId = getSlotProductionContextId(slot) || production?.id || "";
  const planningOrderId = getSlotPlanningOrderId(slot, route.id);
  if (!planningOrderId) return null;
  const batch = getBatch(planningOrderId);
  const settings = getRouteFlowLaunchSettings(route, batch);
  if (settings.mode !== "transfer_batch") return null;

  const readiness = getMainRouteDependencyReadiness(route.id, productionId, planningOrderId);
  const branchDetails = readiness?.branchDetails?.length
    ? readiness.branchDetails
    : getRoutePlanningOrderWipBranchDetails(route.id, productionId, planningOrderId, ui.now);
  const branch = branchDetails.find((item) => item.id === slot.id || item.slot?.id === slot.id);
  if (!branch) return null;

  const totalQuantity = normalizeQuantity(slot.quantity);
  const transferQuantity = Math.min(totalQuantity, normalizeQuantity(branch.requiredQuantity || settings.transferBatchQuantity));
  if (!totalQuantity || transferQuantity <= 0 || transferQuantity >= totalQuantity) return null;

  const ratio = Math.max(0.01, Math.min(1, transferQuantity / totalQuantity));
  const percent = Math.max(1, Math.min(100, ratio * 100));
  const available = Math.max(0, Number(branch.availableQuantity || 0));
  return {
    available,
    percent,
    title: `Передача на следующий участок: ${transferQuantity.toLocaleString("ru-RU")} из ${totalQuantity.toLocaleString("ru-RU")} шт. (${Math.round(percent)}%). Доступно сейчас: ${available.toLocaleString("ru-RU")} шт.`,
    transferQuantity,
    totalQuantity,
  };
}

function renderSlotTransferBatchVisual(slot, options = {}) {
  if (options.isAggregate || options.isWeekSlot) return "";
  const visual = getSlotTransferBatchVisual(slot);
  if (!visual) return "";
  const hoverTitle = options.hoverTitle || visual.title;

  return `
    <span
      class="slot-transfer-batch-indicator"
      data-ui-component="GanttTransferBatch"
      data-transfer-batch-visual="true"
      style="--transfer-width:${round(visual.percent)}%;"
      title="${escapeAttribute(hoverTitle)}"
      aria-hidden="true"
    ></span>
  `;
}

function normalizeGanttOperationalQuantity(value = 0, fallback = 0) {
  const quantity = Math.round(Number(value));
  if (Number.isFinite(quantity) && quantity >= 0) return quantity;
  return Math.max(0, Math.round(Number(fallback) || 0));
}

function formatGanttOperationalQuantity(value = 0) {
  return normalizeGanttOperationalQuantity(value).toLocaleString("ru-RU");
}

function toGanttOperationalPercent(value = 0, scale = 1) {
  const normalizedScale = Math.max(1, Number(scale || 0));
  const normalizedValue = Math.max(0, Math.round(Number(value || 0) || 0));
  return Math.max(0, Math.min(100, normalizedValue / normalizedScale * 100));
}

function makeGanttOperationalSegment({ left = 0, width = 0, tone = "", text = "", title = "" } = {}) {
  const normalizedWidth = Math.max(0, Math.min(100, Number(width || 0)));
  if (normalizedWidth <= 0) return null;
  return {
    left: Math.max(0, Math.min(100, Number(left || 0))),
    width: normalizedWidth,
    tone,
    text,
    title,
  };
}

function getGanttAssignmentSegments(state = {}) {
  if (!state.hasValidation) return [];
  const planned = normalizeGanttOperationalQuantity(state.plannedQuantity || 0);
  const assigned = normalizeGanttOperationalQuantity(state.assignedQuantity || 0);
  const scale = Math.max(1, planned, assigned);
  const segments = [];

  if (assigned <= 0) {
    segments.push(makeGanttOperationalSegment({
      left: 0,
      width: toGanttOperationalPercent(planned, scale),
      tone: "is-assignment-rest is-full",
      text: planned ? `-${formatGanttOperationalQuantity(planned)}` : "0",
      title: `Распределение равно нулю. План: ${formatGanttOperationalQuantity(planned)} шт.`,
    }));
    return segments.filter(Boolean);
  }

  if (assigned >= planned) {
    const baseWidth = toGanttOperationalPercent(Math.min(planned, assigned), scale);
    segments.push(makeGanttOperationalSegment({
      left: 0,
      width: baseWidth,
      tone: "is-assigned",
      text: formatGanttOperationalQuantity(Math.min(planned, assigned)),
      title: `Распределено: ${formatGanttOperationalQuantity(assigned)} из ${formatGanttOperationalQuantity(planned)} шт.`,
    }));
    if (assigned > planned) {
      segments.push(makeGanttOperationalSegment({
        left: baseWidth,
        width: toGanttOperationalPercent(assigned - planned, scale),
        tone: "is-assignment-over",
        text: `+${formatGanttOperationalQuantity(assigned - planned)}`,
        title: `Распределено сверх плана: +${formatGanttOperationalQuantity(assigned - planned)} шт.`,
      }));
    }
    return segments.filter(Boolean);
  }

  const assignedWidth = toGanttOperationalPercent(assigned, scale);
  segments.push(makeGanttOperationalSegment({
    left: 0,
    width: assignedWidth,
    tone: "is-assigned",
    text: formatGanttOperationalQuantity(assigned),
    title: `Распределено: ${formatGanttOperationalQuantity(assigned)} из ${formatGanttOperationalQuantity(planned)} шт.`,
  }));
  segments.push(makeGanttOperationalSegment({
    left: assignedWidth,
    width: toGanttOperationalPercent(planned - assigned, scale),
    tone: "is-assignment-rest",
    text: `-${formatGanttOperationalQuantity(planned - assigned)}`,
    title: `Не распределено: ${formatGanttOperationalQuantity(planned - assigned)} шт.`,
  }));
  return segments.filter(Boolean);
}

function getGanttCompositeOperationalSegments(state = {}) {
  if (!state.hasFact) {
    return getGanttAssignmentSegments(state);
  }

  const planned = normalizeGanttOperationalQuantity(state.plannedQuantity || 0);
  const assigned = state.hasValidation ? normalizeGanttOperationalQuantity(state.assignedQuantity || 0) : planned;
  const fact = normalizeGanttOperationalQuantity(state.factQuantity || 0);
  const scale = Math.max(1, planned, assigned, fact);
  const segments = [];
  let cursorQuantity = 0;

  const pushQuantitySegment = (quantity, tone, text, title) => {
    const normalizedQuantity = normalizeGanttOperationalQuantity(quantity || 0);
    if (normalizedQuantity <= 0) return;
    const segment = makeGanttOperationalSegment({
      left: toGanttOperationalPercent(cursorQuantity, scale),
      width: toGanttOperationalPercent(normalizedQuantity, scale),
      tone,
      text,
      title,
    });
    if (segment) segments.push(segment);
    cursorQuantity += normalizedQuantity;
  };

  if (state.hasValidation && assigned <= 0) {
    pushQuantitySegment(
      planned,
      "is-assignment-rest is-full",
      planned ? `-${formatGanttOperationalQuantity(planned)}` : "0",
      `Ресурс не распределен. План: ${formatGanttOperationalQuantity(planned)} шт.`,
    );
    return segments.filter(Boolean);
  }

  const doneQuantity = Math.min(fact, assigned);
  pushQuantitySegment(
    doneQuantity,
    "is-fact-done",
    formatGanttOperationalQuantity(doneQuantity),
    `Факт: ${formatGanttOperationalQuantity(fact)} шт. Распределено: ${formatGanttOperationalQuantity(assigned)} шт.`,
  );

  if (fact > assigned) {
    pushQuantitySegment(
      fact - assigned,
      "is-fact-over",
      `+${formatGanttOperationalQuantity(fact - assigned)}`,
      `Факт выше распределения: +${formatGanttOperationalQuantity(fact - assigned)} шт.`,
    );
  } else if (assigned > fact) {
    pushQuantitySegment(
      assigned - fact,
      "is-fact-negative",
      `-${formatGanttOperationalQuantity(assigned - fact)}`,
      `Факт ниже распределения: -${formatGanttOperationalQuantity(assigned - fact)} шт.`,
    );
  }

  const planRestQuantity = Math.max(0, planned - cursorQuantity);
  if (planRestQuantity > 0) {
    const isAssignmentRest = state.hasValidation && assigned < planned && cursorQuantity >= assigned;
    pushQuantitySegment(
      planRestQuantity,
      isAssignmentRest ? "is-assignment-rest" : "is-fact-plan-rest",
      `-${formatGanttOperationalQuantity(planRestQuantity)}`,
      isAssignmentRest
        ? `Не распределено до плана: ${formatGanttOperationalQuantity(planRestQuantity)} шт.`
        : `Остаток до плана: ${formatGanttOperationalQuantity(planRestQuantity)} шт.`,
    );
  }

  return segments.filter(Boolean);
}

function formatGanttOperationalDelta(value = 0, suffix = "") {
  const normalized = Math.round(Number(value || 0));
  if (!Number.isFinite(normalized)) return "";
  if (!normalized) return "";
  return `${normalized > 0 ? "+" : "-"}${formatGanttOperationalQuantity(Math.abs(normalized))}${suffix ? ` ${suffix}` : ""}`;
}

function formatGanttOperationalSignedDelta(value = 0, suffix = "") {
  const normalized = Math.round(Number(value || 0));
  if (!Number.isFinite(normalized)) return "";
  const sign = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  return `${sign}${formatGanttOperationalQuantity(Math.abs(normalized))}${suffix ? ` ${suffix}` : ""}`;
}

function getGanttSlotHoverSummaryText(state = {}) {
  const planned = normalizeGanttOperationalQuantity(state.plannedQuantity || 0);
  const assigned = state.hasValidation
    ? normalizeGanttOperationalQuantity(state.assignedQuantity || 0)
    : 0;
  const fact = state.hasFact
    ? normalizeGanttOperationalQuantity(state.factQuantity || 0)
    : 0;
  const expectedQuantity = state.hasValidation ? assigned : planned;
  const factDelta = fact - expectedQuantity;

  return [
    `План ${formatGanttOperationalQuantity(planned)} шт.`,
    `Распределено ${formatGanttOperationalQuantity(assigned)} шт.`,
    `Факт ${formatGanttOperationalQuantity(fact)} шт.`,
    `${formatGanttOperationalSignedDelta(factDelta, "к распределению")}`,
  ].join(" · ");
}

function getGanttOperationalMetaText(state = {}) {
  const planned = normalizeGanttOperationalQuantity(state.plannedQuantity || 0);
  const assigned = normalizeGanttOperationalQuantity(state.assignedQuantity || 0);
  const fact = state.hasFact ? normalizeGanttOperationalQuantity(state.factQuantity || 0) : null;
  const parts = [`План ${formatGanttOperationalQuantity(planned)} шт.`];

  if (state.hasValidation) {
    parts.push(`Распределено ${formatGanttOperationalQuantity(assigned)} шт.`);
    const assignmentDelta = formatGanttOperationalDelta(assigned - planned, "к плану");
    if (assignmentDelta) parts.push(assignmentDelta);
  }

  if (state.hasFact) {
    parts.push(`Факт ${formatGanttOperationalQuantity(fact)} шт.`);
    const expected = state.hasValidation ? assigned : planned;
    const factDelta = formatGanttOperationalDelta(fact - expected, state.hasValidation ? "к распределению" : "к плану");
    if (factDelta) parts.push(factDelta);
  }

  return parts.join(" · ");
}

function renderGanttOperationalSegments(segments = [], visualWidth = 0, hoverTitle = "") {
  const slotWidth = Math.max(0, Number(visualWidth || 0));
  return segments.map((segment) => `
    <b
      class="slot-operational-segment ${escapeAttribute(segment.tone)}"
      data-ui-component="GanttOperationalSegment"
      style="--segment-left:${round(segment.left)}%; --segment-width:${round(segment.width)}%;"
      title="${escapeAttribute(hoverTitle || segment.title || segment.text || "")}"
    >${slotWidth * Number(segment.width || 0) / 100 >= 30 && segment.text ? `<span>${escapeHtml(segment.text)}</span>` : ""}</b>
  `).join("");
}

function renderGanttSlotOperationalLayer(slot, options = {}) {
  if (options.isAggregate || options.isWeekSlot) return "";
  const state = options.state || getGanttSlotOperationalState(slot);
  if (!state.hasValidation && !state.hasFact) return "";
  const visualWidth = Number(options.visualWidth || 0);
  const showMeta = options.showMeta !== false && visualWidth >= 220;
  const showLabel = !showMeta && visualWidth >= 124 && (state.validationMismatch || state.factMismatch || state.hasFact);
  const expectedQuantity = state.hasValidation ? state.assignedQuantity : state.plannedQuantity;
  const factDelta = state.hasFact ? (state.factQuantity || 0) - expectedQuantity : 0;
  const validationDelta = state.assignedQuantity - state.plannedQuantity;
  const label = state.hasFact && state.factMismatch
    ? factDelta < 0
      ? `ост. ${formatGanttOperationalQuantity(Math.abs(factDelta))}`
      : `+${formatGanttOperationalQuantity(factDelta)}`
    : state.validationMismatch
      ? validationDelta < 0
        ? `ост. ${formatGanttOperationalQuantity(Math.abs(validationDelta))}`
        : `+${formatGanttOperationalQuantity(validationDelta)}`
      : state.hasFact
        ? `${formatGanttOperationalQuantity(state.factQuantity || 0)}/${formatGanttOperationalQuantity(state.plannedQuantity)}`
        : "";
  const labelClass = state.factMismatch
    ? "is-fact-mismatch"
    : state.validationMismatch
      ? "is-validation-mismatch"
      : state.hasFact
        ? "is-fact"
        : "is-validation";
  const operationalSegments = getGanttCompositeOperationalSegments(state);
  const metaText = getGanttOperationalMetaText(state);
  const hoverTitle = options.hoverTitle || state.hoverTitle || state.title || metaText;

  return `
    <span
      class="slot-operational-layer has-single-level ${state.className}"
      data-ui-component="GanttOperationalLayer"
      style="--slot-validation-progress:${Math.round(state.validationPercent || 0)}%; --slot-fact-progress:${Math.round(state.factPercent || 0)}%;"
      title="${escapeAttribute(hoverTitle)}"
      aria-hidden="true"
    >
      ${showMeta && metaText ? `<span class="slot-operational-meta">${escapeHtml(metaText)}</span>` : ""}
      ${operationalSegments.length ? `<span class="slot-operational-track is-composite" data-ui-component="GanttOperationalTrack">${renderGanttOperationalSegments(operationalSegments, visualWidth, hoverTitle)}</span>` : ""}
      ${showLabel && label ? `<span class="slot-operational-label ${labelClass}">${escapeHtml(label)}</span>` : ""}
    </span>
  `;
}

function getGanttSlotGeometryRadius(height = STANDARD_SLOT_HEIGHT) {
  const slotHeight = Math.max(1, Number(height || STANDARD_SLOT_HEIGHT));
  return Math.max(4, Math.min(10, Math.round(slotHeight * 0.28)));
}

function getSlotSegmentEdgeClass(segment = {}, slotStart, slotEnd) {
  const startTime = toDate(segment.start).getTime();
  const endTime = toDate(segment.end).getTime();
  const slotStartTime = toDate(slotStart).getTime();
  const slotEndTime = toDate(slotEnd).getTime();
  const toleranceMs = 1000;
  return [
    Math.abs(startTime - slotStartTime) <= toleranceMs ? "is-slot-start" : "is-continuation-start",
    Math.abs(endTime - slotEndTime) <= toleranceMs ? "is-slot-end" : "is-continuation-end",
  ].join(" ");
}

function renderSlot(slot, row, scaleInfo, slotWarningMap, placement) {
  const slotRoute = getSlotRoute(slot);
  const routeId = slotRoute?.id || getSlotRouteId(slot, planningState);
  const productionId = getSlotProductionContextId(slot) || getRoutePlanningContext(slotRoute)?.id || "";
  const batch = getBatch(getSlotPlanningOrderId(slot, routeId));
  const project = getRoutePlanningContext(slotRoute) || getProject(productionId);
  const workCenter = getWorkCenter(slot.workCenterId);
  const warningList = slotWarningMap[slot.id] || [];
  const hasCritical = warningList.some((warning) => warning.severity === "critical");
  const isAggregate = row.type === "project" || row.type === "route";
  const isWeekSlot = ui.scale === "weeks";
  let visualRect = placement?.rect || getSlotVisualRect(slot, scaleInfo, isAggregate);
  const top = placement?.top ?? getSlotTop(isAggregate);
  const height = placement?.height ?? getSlotHeight(isAggregate);
  const selectedClass = ui.selectedSlotId === slot.id ? "is-selected" : "";
  const warningClass = warningList.length ? `has-warning ${hasCritical ? "critical" : "warning"}` : "";
  const dragClass = ui.drag?.slotId === slot.id ? "is-dragging" : "";
  const warehouseClass = isManufacturingOutputReceiptSlot(slot) ? "material-transfer-slot" : "";
  const isReadonlySlot = slot.locked || isGanttSlotCompleted(slot);
  const lockedClass = isReadonlySlot ? "is-locked" : "";
  const quantity = normalizeQuantity(slot.quantity);
  const routeMeta = getSlotRouteMeta(slot);
  const durationMs = Math.max(0, toDate(slot.plannedEnd) - toDate(slot.plannedStart));
  const workingDurationMs = getSlotWorkingDurationMs(slot);
  const calendarDurationMs = getSlotCalendarDurationMs(slot);
  const durationTitle = calendarDurationMs > workingDurationMs + 60 * 1000
    ? `рабочее время ${formatDuration(workingDurationMs)} · календарное окно ${formatDuration(calendarDurationMs)}`
    : formatDuration(workingDurationMs || durationMs);
  const operationLabel = String(slot.operationName || workCenter?.name || "Операция").trim();
  let workingSegments = getSlotWorkingVisualSegments(slot, scaleInfo, visualRect);
  const nonWorkingSegments = getSlotNonWorkingVisualSegments(slot, scaleInfo, visualRect, workingSegments);
  const segmentQuantities = distributeQuantityAcrossWorkingSegments(quantity, workingSegments);
  const compactClass = visualRect.width < (isWeekSlot ? 58 : 136) ? "is-compact" : "";
  const tinyClass = visualRect.width < (isWeekSlot ? 36 : 58) ? "is-tiny" : "";
  const segmentedClass = workingSegments.length > 1 || nonWorkingSegments.length ? "is-segmented" : "";
  const slotRadius = getGanttSlotGeometryRadius(height);
  const statusClass = getGanttSlotStatusClass(slot);
  const operationalState = getGanttSlotOperationalState(slot);
  const operationalClass = operationalState.className;
  const slotHoverTitle = operationalState.hoverTitle || getGanttSlotHoverSummaryText(operationalState);

  if (workingSegments.length > 1 || nonWorkingSegments.length) {
    const contentSegments = workingSegments.length ? workingSegments : nonWorkingSegments;
    const primaryIndex = contentSegments.reduce((bestIndex, segment, index, segments) => (
      segment.width > segments[bestIndex].width ? index : bestIndex
    ), 0);
    const renderWorkingSegment = (segment, index) => `
      <div class="slot-working-segment ${index === primaryIndex ? "is-primary" : ""} ${getSlotSegmentEdgeClass(segment, slot.plannedStart, slot.plannedEnd)}" data-ui-component="GanttWorkingSegment" style="left:${segment.offset}px; width:${segment.width}px;">
        <div class="slot-accent"></div>
        ${renderGanttSlotOperationalLayer(slot, {
          isAggregate,
          isWeekSlot,
          visualWidth: segment.width,
          showMeta: index === primaryIndex,
          state: getGanttSlotOperationalSegmentState(slot, segmentQuantities[index] ?? quantity, operationalState),
          hoverTitle: slotHoverTitle,
        })}
        ${renderGanttSlotLine({
          slot,
          batch,
          routeMeta,
          operationLabel,
          quantity: segmentQuantities[index] ?? quantity,
          isWeekSlot,
          isAggregate,
          warningList,
          visualWidth: segment.width,
          hoverTitle: slotHoverTitle,
        })}
        ${index === primaryIndex ? `<div class="slot-content"></div>` : ""}
        ${index === workingSegments.length - 1 && !isAggregate && !isWeekSlot && !isReadonlySlot ? `<button class="resize-handle" data-ui-component="GanttResizeHandle" data-resize-slot="${slot.id}" type="button" title="Изменить длительность"></button>` : ""}
      </div>
    `;
    const renderNonWorkingSlotSegment = (segment, index, includeContent = false) => `
      <div class="slot-non-working-segment ${includeContent && index === primaryIndex ? "is-primary" : ""} ${getSlotSegmentEdgeClass(segment, slot.plannedStart, slot.plannedEnd)}" data-ui-component="GanttNonWorkingSegment" style="left:${segment.offset}px; width:${segment.width}px;" title="${escapeAttribute(slotHoverTitle)}">
        ${includeContent ? renderGanttSlotLine({
          slot,
          batch,
          routeMeta,
          operationLabel,
          quantity,
          isWeekSlot,
          isAggregate,
          warningList,
          visualWidth: segment.width,
          hoverTitle: slotHoverTitle,
        }) : ""}
        ${includeContent && index === primaryIndex ? `
          <div class="slot-accent"></div>
          <div class="slot-content"></div>
          ${!isAggregate && !isWeekSlot && !isReadonlySlot ? `<button class="resize-handle" data-ui-component="GanttResizeHandle" data-resize-slot="${slot.id}" type="button" title="Изменить длительность"></button>` : ""}
        ` : ""}
      </div>
    `;

    return `
      <article
        class="operation-slot ${statusClass} ${warehouseClass} ${lockedClass} ${operationalClass} ${isAggregate ? "aggregate-slot" : ""} ${isWeekSlot ? "week-slot" : ""} ${compactClass} ${tinyClass} ${selectedClass} ${warningClass} ${dragClass} ${segmentedClass}"
        data-ui-component="GanttSlot"
        data-slot-id="${slot.id}"
        style="left:${visualRect.x}px; top:${top}px; width:${visualRect.width}px; height:${height}px; --slot-height:${height}px; --slot-radius:${slotRadius}px;"
        title="${escapeAttribute(slotHoverTitle)}"
        tabindex="0"
      >
        ${nonWorkingSegments.map((segment, index) => renderNonWorkingSlotSegment(segment, index, !workingSegments.length)).join("")}
        ${workingSegments.map((segment, index) => renderWorkingSegment(segment, index)).join("")}
        ${renderSlotTransferBatchVisual(slot, { isAggregate, isWeekSlot, hoverTitle: slotHoverTitle })}
      </article>
    `;
  }

  return `
      <article
      class="operation-slot ${statusClass} ${warehouseClass} ${lockedClass} ${operationalClass} ${isAggregate ? "aggregate-slot" : ""} ${isWeekSlot ? "week-slot" : ""} ${compactClass} ${tinyClass} ${selectedClass} ${warningClass} ${dragClass}"
      data-ui-component="GanttSlot"
      data-slot-id="${slot.id}"
      style="left:${visualRect.x}px; top:${top}px; width:${visualRect.width}px; height:${height}px; --slot-height:${height}px; --slot-radius:${slotRadius}px;"
      title="${escapeAttribute(slotHoverTitle)}"
      tabindex="0"
    >
      <div class="slot-accent"></div>
      ${renderGanttSlotOperationalLayer(slot, { isAggregate, isWeekSlot, visualWidth: visualRect.width, state: operationalState, hoverTitle: slotHoverTitle })}
      <div class="slot-content">
        ${renderGanttSlotLine({
          slot,
          batch,
          routeMeta,
          operationLabel,
          quantity,
          isWeekSlot,
          isAggregate,
          warningList,
          visualWidth: visualRect.width,
          hoverTitle: slotHoverTitle,
        })}
      </div>
      ${!isAggregate && !isWeekSlot && !isReadonlySlot ? `<button class="resize-handle" data-ui-component="GanttResizeHandle" data-resize-slot="${slot.id}" type="button" title="Изменить длительность"></button>` : ""}
      ${renderSlotTransferBatchVisual(slot, { isAggregate, isWeekSlot, hoverTitle: slotHoverTitle })}
    </article>
  `;
}

function renderGanttSlotLine({ slot, quantity, isWeekSlot, visualWidth = 0, hoverTitle = "" }) {
  if (!ui.ganttShowQuantity) return "";

  const lineClass = isWeekSlot ? "week-slot-line" : "slot-line";
  const quantityValue = Number(quantity || 0).toLocaleString("ru-RU", { useGrouping: false });
  const quantityText = `${quantityValue} шт.`;
  const labelMode = getGanttQuantityLabelMode(visualWidth, isWeekSlot);
  const labelText = labelMode === "full" ? quantityText : quantityValue;

  return `
    <div class="${lineClass} slot-content-quantity-only is-${labelMode}" title="${escapeAttribute(hoverTitle || quantityText)}">
      <span class="slot-quantity-badge is-${labelMode}">${escapeHtml(labelText)}</span>
    </div>
  `;
}

function getGanttQuantityLabelMode(visualWidth, isWeekSlot = false) {
  const width = Number(visualWidth || 0);
  if (!width) return "full";
  if (width < (isWeekSlot ? 44 : 48)) return "tiny";
  if (width < (isWeekSlot ? 74 : 92)) return "compact";
  return "full";
}

function getSlotRouteMeta(slot) {
  const route = getSlotRoute(slot);
  const productionId = getSlotProductionContextId(slot) || getRoutePlanningContext(route)?.id || "";
  const steps = route ? getRouteStepsForModule(route.id) : getProjectRouteSteps(productionId, planningState);
  const step = steps.find((item) => item.id === slot.routeStepId);
  const workCenter = getWorkCenter(slot.workCenterId);
  return {
    route,
    routeName: route?.name || "",
    step,
    total: steps.length,
    orderLabel: step ? `${step.stepOrder}/${steps.length || "?"}` : "?",
    centerCode: workCenter?.code || slot.workCenterId || "-",
  };
}

function getSlotVisualRect(slot, scaleInfo, isAggregate = false) {
  const x = dateToX(slot.plannedStart, scaleInfo);
  const timeWidth = dateToX(slot.plannedEnd, scaleInfo) - x;
  const zoom = Number(scaleInfo.zoom || 1);
  if (ui.scale === "weeks") {
    const width = Math.max(isAggregate ? 14 : 1, timeWidth);
    return { x, width, right: x + width };
  }

  const width = Math.max(isAggregate ? 18 * zoom : 1, timeWidth);

  return {
    x,
    width,
    right: x + width,
  };
}

function distributeQuantityAcrossWorkingSegments(quantity, segments = []) {
  const totalQuantity = normalizeQuantity(quantity);
  if (!segments.length) return [];
  if (segments.length === 1) return [totalQuantity];

  const durations = segments.map((segment) => Math.max(0, toDate(segment.end) - toDate(segment.start)));
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const weights = totalDuration > 0
    ? durations.map((duration) => duration / totalDuration)
    : segments.map(() => 1 / segments.length);
  const rawQuantities = weights.map((weight) => totalQuantity * weight);
  const allocations = rawQuantities.map((value) => Math.floor(value));
  let remainder = totalQuantity - allocations.reduce((sum, value) => sum + value, 0);

  rawQuantities
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value),
      duration: durations[index] || 0,
    }))
    .sort((left, right) => (
      right.fraction - left.fraction
      || right.duration - left.duration
      || left.index - right.index
    ))
    .forEach(({ index }) => {
      if (remainder <= 0) return;
      allocations[index] += 1;
      remainder -= 1;
    });

  return allocations;
}

function getSlotWorkingVisualSegments(slot, scaleInfo, visualRect) {
  const intervals = getWorkingIntervalsBetween(slot.workCenterId, slot.plannedStart, slot.plannedEnd, planningState);
  return intervals.map((interval) => {
    const left = Math.max(visualRect.x, dateToX(interval.start, scaleInfo));
    const right = Math.min(visualRect.right, dateToX(interval.end, scaleInfo));
    return {
      start: interval.start,
      end: interval.end,
      x: left,
      offset: Math.max(0, left - visualRect.x),
      width: Math.max(1, right - left),
      right,
    };
  }).filter((segment) => segment.right > segment.x);
}

function getSlotNonWorkingVisualSegments(slot, scaleInfo, visualRect, workingSegments = null) {
  const rangeStart = toDate(slot.plannedStart);
  const rangeEnd = toDate(slot.plannedEnd);
  if (rangeEnd <= rangeStart) return [];

  const workingRanges = (workingSegments || getSlotWorkingVisualSegments(slot, scaleInfo, visualRect))
    .map((segment) => ({
      start: new Date(Math.max(toDate(segment.start).getTime(), rangeStart.getTime())),
      end: new Date(Math.min(toDate(segment.end).getTime(), rangeEnd.getTime())),
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((left, right) => left.start - right.start);

  const ranges = [];
  let cursor = rangeStart;
  workingRanges.forEach((segment) => {
    if (segment.start > cursor) ranges.push({ start: cursor, end: segment.start });
    if (segment.end > cursor) cursor = segment.end;
  });
  if (cursor < rangeEnd) ranges.push({ start: cursor, end: rangeEnd });

  return ranges.map((range) => {
    const left = Math.max(visualRect.x, dateToX(range.start, scaleInfo));
    const right = Math.min(visualRect.right, dateToX(range.end, scaleInfo));
    return {
      start: range.start,
      end: range.end,
      x: left,
      offset: Math.max(0, left - visualRect.x),
      width: Math.max(1, right - left),
      right,
    };
  }).filter((segment) => segment.right > segment.x);
}

function isTransferBatchDependencyPair(fromSlot = null, toSlot = null) {
  if (!fromSlot || !toSlot) return false;
  if (getSlotRouteTaskId(fromSlot) === MAIN_ROUTE_TASK_ID || getSlotRouteTaskId(toSlot) !== MAIN_ROUTE_TASK_ID) return false;
  const route = getSlotRoute(toSlot) || getSlotRoute(fromSlot);
  if (!route?.id) return false;
  const readiness = getMainRouteDependencyReadiness(
    route.id,
    getSlotProductionContextId(toSlot),
    getSlotPlanningOrderId(toSlot, route.id),
  );
  return Boolean(readiness?.mode === "transfer_batch" && readiness.sourceSlotIds?.has(fromSlot.id));
}

function renderTransferGateMarkers() {
  return "";
}

function renderDependencies(rows, rowLayout, scaleInfo, slotWarningMap, slotPlacementMap) {
  const visibleRowIds = new Set(rows.map((row) => row.id));
  const slotById = byId(planningState.slots);
  const slotMaskRects = buildDependencySlotMaskRects(rows, rowLayout, scaleInfo, slotPlacementMap);
  const maskId = "dependencySlotReadabilityMask";
  const maskAttribute = slotMaskRects.length ? ` mask="url(#${maskId})"` : "";
  const dependencyPathItems = [];
  const dependencyRoutes = [];
  const transferGateBySlotId = new Map();

  for (const pair of getDependencyPairs(planningState)) {
    const from = slotById[pair.fromSlotId];
    const to = slotById[pair.toSlotId];
    if (!from || !to) continue;

    const fromRowId = getVisibleSlotRowId(from);
    const toRowId = getVisibleSlotRowId(to);
    if (!fromRowId || !toRowId || !visibleRowIds.has(fromRowId) || !visibleRowIds.has(toRowId)) continue;
    if (fromRowId.startsWith("project:") || toRowId.startsWith("project:") || fromRowId.startsWith("route:") || toRowId.startsWith("route:")) continue;

    const fromLayout = rowLayout.map[fromRowId];
    const toLayout = rowLayout.map[toRowId];
    if (!fromLayout || !toLayout) continue;

    const fromPlacement = slotPlacementMap[fromRowId]?.[from.id];
    const toPlacement = slotPlacementMap[toRowId]?.[to.id];
    const fromRect = fromPlacement?.rect || getSlotVisualRect(from, scaleInfo);
    const toRect = toPlacement?.rect || getSlotVisualRect(to, scaleInfo);
    const fromConnectionRect = getDependencyConnectionRect(fromLayout, fromPlacement, fromRect, false);
    const toConnectionRect = getDependencyConnectionRect(toLayout, toPlacement, toRect, false);
    const fromAnchorRect = getDependencyTimelineAnchorRect(fromConnectionRect, scaleInfo);
    const toAnchorRect = getDependencyTimelineAnchorRect(toConnectionRect, scaleInfo);
    if (!shouldRenderDependencyBetweenTimelineAnchors(fromAnchorRect, toAnchorRect)) continue;

    let x1 = fromAnchorRect.right;
    let y1 = fromAnchorRect.centerY;
    const x2 = toAnchorRect.x;
    const y2 = toAnchorRect.centerY;
    const dependencyArrowLength = Math.max(1, getGanttDependencyArrowLength(scaleInfo));
    const dependencyEntryWidth = Math.max(1, getGanttDependencyEntryWidth(scaleInfo));
    let startStubPoint = { x: x1 + dependencyArrowLength, y: y1 };
    const startObstacleRects = getDependencyObstacleRects(slotMaskRects, from.id, to.id);

    if (findDependencySegmentObstacle({ x: x1, y: y1 }, startStubPoint, startObstacleRects)) {
      x1 = fromConnectionRect.centerX;
      y1 = fromConnectionRect.bottom;
      startStubPoint = { x: x1, y: y1 + dependencyArrowLength };
    }

    const hasIssue = (slotWarningMap[from.id] || []).length || (slotWarningMap[to.id] || []).length;
    const isTransfer = isTransferBatchDependencyPair(from, to);
    const transferClass = isTransfer ? " is-transfer" : "";
    const className = `${hasIssue ? "dependency-path has-issue" : "dependency-path"}${transferClass}`;
    const underlayClassName = `${hasIssue ? "dependency-path-underlay has-issue" : "dependency-path-underlay"}${transferClass}`;
    const markerId = hasIssue ? "dependencyArrowIssue" : isTransfer ? "dependencyArrowTransfer" : "dependencyArrow";
    const mutedMarkerId = hasIssue ? "dependencyArrowIssueMuted" : isTransfer ? "dependencyArrowTransferMuted" : "dependencyArrowMuted";
    if (isTransfer && !transferGateBySlotId.has(to.id)) {
      const route = getSlotRoute(to) || getSlotRoute(from);
      const readiness = route
        ? getMainRouteDependencyReadiness(route.id, getSlotProductionContextId(to), getSlotPlanningOrderId(to, route.id))
        : null;
      if (readiness?.readyAt) {
        const gateX = Math.max(24, Math.min(scaleInfo.width - 24, dateToX(readiness.readyAt, scaleInfo)));
        const gateY = Math.max(32, Math.min(rowLayout.totalHeight - 12, toConnectionRect.y - 1));
        transferGateBySlotId.set(to.id, {
          x: gateX,
          y: gateY,
          availableKitsNow: readiness.availableKitsNow || 0,
          quantity: readiness.transferBatchQuantity,
          title: `Системная передача: старт следующей операции после окончания операции или конца смены. Доступно ${readiness.availableKitsNow || 0} компл. Ближайший старт: ${formatDateTimeShort(readiness.readyAt)}.`,
        });
      }
    }
    const pathData = buildDependencyPathAroundSlots(x1, y1, x2, y2, fromAnchorRect, toAnchorRect, {
      dependencyArrowLength,
      dependencyEntryWidth,
      fromSlotId: from.id,
      rowLayoutHeight: rowLayout.totalHeight,
      slotMaskRects,
      startStubPoint,
      toSlotId: to.id,
    });
    const routeKey = getGanttDependencyRouteKey(from.id, to.id);
    pathData.basePoints = pathData.points;
    pathData.points = applyGanttDependencyRouteOffsets(pathData.points, routeKey);
    dependencyRoutes.push({
      fromSlotId: from.id,
      isTransfer,
      points: pathData.points,
      sourceY: pathData.points[0]?.[1] ?? y1,
      toSlotId: to.id,
    });
    dependencyPathItems.push({
      className,
      markerId,
      mutedMarkerId,
      pathData,
      routeKey,
      underlayClassName,
    });
  }

  const dependencyRenderRoutes = getDependencyRenderRoutesWithSeparatedHorizontals(dependencyRoutes, rowLayout.totalHeight);
  dependencyRenderRoutes.forEach((route, index) => {
    if (dependencyPathItems[index]?.pathData) {
      dependencyPathItems[index].pathData.renderPoints = route.points;
    }
  });
  const dependencyCrossings = getDependencyRouteCrossings(dependencyRenderRoutes);
  const crossingJumpsByRoute = getDependencyCrossingJumpsByRoute(dependencyCrossings);
  const renderedPathItems = dependencyPathItems.map((item, routeIndex) => {
    const crossingJumps = crossingJumpsByRoute.get(routeIndex) || [];
    const renderPoints = getDependencyPathPointsBeforeArrow(item.pathData.renderPoints || item.pathData.points);
    const d = buildDependencyPathWithLineJumps(
      renderPoints,
      crossingJumps,
      item.pathData.cornerRadius,
      item.pathData.pathOptions,
    );
    const hasCrossingJumps = crossingJumps.length > 0;

    if (hasCrossingJumps) {
      return {
        d,
        hasCrossingJumps,
        markup: `
        <path class="${item.className}" data-ui-component="GanttDependencyPath" d="${d}" marker-end="url(#${item.markerId})"${maskAttribute} />
      `,
      };
    }

    return {
      d,
      hasCrossingJumps,
      markup: `
      <path class="${item.underlayClassName} dependency-path-muted" d="${d}" />
      <path class="${item.className} dependency-path-muted" d="${d}" marker-end="url(#${item.mutedMarkerId})" />
      <path class="${item.underlayClassName}" d="${d}"${maskAttribute} />
      <path class="${item.className}" data-ui-component="GanttDependencyPath" d="${d}" marker-end="url(#${item.markerId})"${maskAttribute} />
    `,
    };
  });
  const paths = [
    ...renderedPathItems.filter((item) => !item.hasCrossingJumps),
    ...renderedPathItems.filter((item) => item.hasCrossingJumps),
  ].filter((item, index, items) => {
    if (ui.ganttDependencyEditMode) return true;
    return items.findIndex((candidate) => candidate.d === item.d) === index;
  }).map((item) => item.markup);
  const dependencyEditControls = renderGanttDependencyEditControls(dependencyPathItems);
  const transferGateMarkers = renderTransferGateMarkers([...transferGateBySlotId.values()]);

  return `
    <svg class="dependencies-layer ${ui.scale === "weeks" ? "week-dependencies" : ""}" data-ui-component="GanttDependencyLayer" style="left:${LEFT_WIDTH}px; top:${TIMELINE_HEIGHT}px; width:${scaleInfo.width}px; height:${rowLayout.totalHeight}px; --dependency-clip-left:${ui.scrollLeft}px;" aria-hidden="true">
      <defs>
        <marker id="dependencyArrow" markerWidth="11" markerHeight="11" refX="${GANTT_DEPENDENCY_ARROW_BASE_REF_X}" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow" data-ui-component="GanttDependencyArrow" />
        </marker>
        <marker id="dependencyArrowIssue" markerWidth="11" markerHeight="11" refX="${GANTT_DEPENDENCY_ARROW_BASE_REF_X}" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow has-issue" data-ui-component="GanttDependencyArrow" />
        </marker>
        <marker id="dependencyArrowMuted" markerWidth="11" markerHeight="11" refX="${GANTT_DEPENDENCY_ARROW_BASE_REF_X}" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow is-muted" data-ui-component="GanttDependencyArrow" />
        </marker>
        <marker id="dependencyArrowIssueMuted" markerWidth="11" markerHeight="11" refX="${GANTT_DEPENDENCY_ARROW_BASE_REF_X}" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow has-issue is-muted" data-ui-component="GanttDependencyArrow" />
        </marker>
        <marker id="dependencyArrowTransfer" markerWidth="11" markerHeight="11" refX="${GANTT_DEPENDENCY_ARROW_BASE_REF_X}" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow is-transfer" data-ui-component="GanttDependencyArrow" />
        </marker>
        <marker id="dependencyArrowTransferMuted" markerWidth="11" markerHeight="11" refX="${GANTT_DEPENDENCY_ARROW_BASE_REF_X}" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow is-transfer is-muted" data-ui-component="GanttDependencyArrow" />
        </marker>
        ${slotMaskRects.length ? `
          <mask id="${maskId}" data-ui-component="GanttDependencySlotMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${round(scaleInfo.width)}" height="${round(rowLayout.totalHeight)}">
            <rect x="0" y="0" width="${round(scaleInfo.width)}" height="${round(rowLayout.totalHeight)}" fill="white" />
            ${slotMaskRects.map((rect) => `
              <rect data-ui-component="GanttDependencySlotMaskRect" x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.width)}" height="${round(rect.height)}" rx="${round(rect.radius)}" fill="black" />
            `).join("")}
          </mask>
        ` : ""}
      </defs>
      ${paths.join("")}
      ${dependencyEditControls}
      ${transferGateMarkers}
    </svg>
  `;
}

function getGanttDependencyRouteKey(fromSlotId, toSlotId) {
  return `${fromSlotId}__${toSlotId}`;
}

function getActiveGanttDependencyRouteStore() {
  return ui.ganttDependencyEditMode
    ? normalizeGanttDependencyRouteStore(ui.ganttDependencyRouteDrafts || ui.ganttDependencyRoutes)
    : normalizeGanttDependencyRouteStore(ui.ganttDependencyRoutes);
}

function applyGanttDependencyRouteOffsets(points, routeKey) {
  const route = getActiveGanttDependencyRouteStore()[routeKey];
  if (!route?.offsets) return points;

  return points.map((point, index) => {
    const offset = route.offsets[String(index)];
    if (!offset) return point;
    return [
      round(point[0] + offset.x),
      round(point[1] + offset.y),
    ];
  });
}

function renderGanttDependencyEditControls(dependencyPathItems) {
  if (!ui.ganttDependencyEditMode) return "";

  return dependencyPathItems.map((item) => {
    const points = item.pathData.points || [];
    const basePoints = item.pathData.basePoints || points;
    const segments = getDependencyRouteSegments(points)
      .filter((segment) => {
        const length = segment.horizontal
          ? Math.abs(segment.end.x - segment.start.x)
          : Math.abs(segment.end.y - segment.start.y);
        return segment.segmentIndex > 0
          && segment.segmentIndex < points.length - 2
          && length >= 14;
      });

    return segments.map((segment) => {
      const startIndex = segment.segmentIndex;
      const endIndex = segment.segmentIndex + 1;
      const startBase = basePoints[startIndex] || points[startIndex];
      const endBase = basePoints[endIndex] || points[endIndex];
      const startPoint = points[startIndex];
      const endPoint = points[endIndex];
      const centerX = (segment.start.x + segment.end.x) / 2;
      const centerY = (segment.start.y + segment.end.y) / 2;
      const orientation = segment.horizontal ? "horizontal" : "vertical";

      return `
        <g
          class="dependency-edit-segment ${orientation}"
          data-dependency-edit-route="${escapeAttribute(item.routeKey)}"
          data-dependency-segment-index="${segment.segmentIndex}"
          data-dependency-orientation="${orientation}"
          data-dependency-start-index="${startIndex}"
          data-dependency-end-index="${endIndex}"
          data-dependency-start-base-x="${round(startBase[0])}"
          data-dependency-start-base-y="${round(startBase[1])}"
          data-dependency-end-base-x="${round(endBase[0])}"
          data-dependency-end-base-y="${round(endBase[1])}"
          data-dependency-start-current-x="${round(startPoint[0])}"
          data-dependency-start-current-y="${round(startPoint[1])}"
          data-dependency-end-current-x="${round(endPoint[0])}"
          data-dependency-end-current-y="${round(endPoint[1])}"
        >
          <path class="dependency-edit-hit" d="M ${round(segment.start.x)} ${round(segment.start.y)} L ${round(segment.end.x)} ${round(segment.end.y)}" />
          <circle class="dependency-edit-handle" cx="${round(centerX)}" cy="${round(centerY)}" r="5" />
        </g>
      `;
    }).join("");
  }).join("");
}

function buildDependencySlotMaskRects(rows, rowLayout, scaleInfo, slotPlacementMap) {
  const padding = ui.scale === "weeks" ? 1 : 2;
  return rows.flatMap((row) => {
    const layout = rowLayout.map[row.id];
    if (!layout) return [];
    const isAggregate = row.type === "project" || row.type === "route";
    return getRowSlots(row).map((slot) => {
      const placement = slotPlacementMap[row.id]?.[slot.id];
      const rect = placement?.rect || getSlotVisualRect(slot, scaleInfo, isAggregate);
      const clippedRect = clipDependencyRectToTimeline(rect, scaleInfo.width);
      if (!clippedRect) return null;
      const top = placement?.top ?? getSlotTop(isAggregate);
      const height = placement?.height ?? getSlotHeight(isAggregate);
      return {
        slotId: slot.id,
        rowId: row.id,
        rawX: clippedRect.x,
        rawY: layout.top + top,
        rawWidth: clippedRect.width,
        rawHeight: height,
        x: Math.max(0, clippedRect.x - padding),
        y: Math.max(0, layout.top + top - padding),
        width: clippedRect.width + padding * 2,
        height: height + padding * 2,
        radius: getGanttSlotGeometryRadius(height),
      };
    }).filter(Boolean);
  });
}

function renderGanttSnapOverlay(rowLayout, scaleInfo, slotPlacementMap) {
  if (!ui.drag?.moved) return "";

  const slot = planningState.slots.find((item) => item.id === ui.drag.slotId);
  if (!slot) return "";

  let rowId = ui.drag.targetRowId || getVisibleSlotRowId(slot);
  let layout = rowLayout.map[rowId];
  if (!layout) {
    rowId = Object.keys(slotPlacementMap || {}).find((candidateRowId) => slotPlacementMap[candidateRowId]?.[slot.id]) || rowId;
    layout = rowLayout.map[rowId];
  }
  if (!layout) return "";

  const isProjectRow = rowId.startsWith("project:") || rowId.startsWith("route:");
  const placement = slotPlacementMap[rowId]?.[slot.id];
  const rect = placement?.rect || getSlotVisualRect(slot, scaleInfo, isProjectRow);
  const snapWidth = getGanttSnapWidth(scaleInfo);
  const guideX = ui.drag.mode === "resize" ? rect.right : rect.x;
  const columnWidth = Math.max(3, snapWidth);
  const columnLeft = Math.max(0, Math.min(scaleInfo.width - columnWidth, Math.floor(guideX / Math.max(snapWidth, 1)) * snapWidth));
  const top = layout.top + (placement?.top ?? getSlotTop(isProjectRow));
  const height = placement?.height ?? getSlotHeight(isProjectRow);
  const gridClass = snapWidth >= 6 ? "is-readable" : "is-dense";

  return `
    <div
      class="gantt-snap-overlay ${gridClass}"
      data-ui-component="GanttSnapOverlay"
      style="left:${LEFT_WIDTH}px; top:${TIMELINE_HEIGHT}px; width:${scaleInfo.width}px; height:${rowLayout.totalHeight}px; --cell-width:${scaleInfo.cellWidth}px; --snap-width:${round(snapWidth)}px; --dependency-clip-left:${ui.scrollLeft}px;"
      aria-hidden="true"
    >
      <div class="gantt-snap-grid" data-ui-component="GanttSnapGrid"></div>
      <div class="gantt-snap-column" data-ui-component="GanttSnapColumn" style="left:${round(columnLeft)}px; width:${round(columnWidth)}px;"></div>
      <div class="gantt-drag-ghost" data-ui-component="GanttDragGhost" style="left:${round(rect.x)}px; top:${round(top)}px; width:${round(rect.width)}px; height:${round(height)}px;"></div>
      <div class="gantt-snap-guide ${ui.drag.mode === "resize" ? "is-resize" : "is-move"}" data-ui-component="GanttSnapGuide" style="left:${round(guideX)}px;"></div>
    </div>
  `;
}

function getDependencyConnectionRect(rowLayout, placement, rect, isAggregate = false) {
  const top = placement?.top ?? getSlotTop(isAggregate);
  const height = placement?.height ?? getSlotHeight(isAggregate);
  const y = rowLayout.top + top;
  const width = rect.width ?? Math.max(0, rect.right - rect.x);
  const right = rect.right ?? rect.x + width;

  return {
    x: rect.x,
    y,
    width,
    height,
    right,
    bottom: y + height,
    centerX: rect.x + width / 2,
    centerY: y + height / 2,
  };
}

function clipDependencyRectToTimeline(rect, timelineWidth) {
  const left = Number(rect?.x || 0);
  const rawWidth = Number(rect?.width || 0);
  const right = Number.isFinite(rect?.right) ? Number(rect.right) : left + rawWidth;
  const clippedLeft = Math.max(0, left);
  const clippedRight = Math.min(Math.max(0, Number(timelineWidth || 0)), right);
  if (clippedRight <= clippedLeft) return null;
  return {
    ...rect,
    x: clippedLeft,
    width: clippedRight - clippedLeft,
    right: clippedRight,
  };
}

function getDependencyTimelineAnchorRect(connectionRect, scaleInfo) {
  const timelineWidth = Math.max(0, Number(scaleInfo?.width || 0));
  const left = Number(connectionRect?.x || 0);
  const right = Number.isFinite(connectionRect?.right)
    ? Number(connectionRect.right)
    : left + Number(connectionRect?.width || 0);
  const offLeft = right <= 0;
  const offRight = left >= timelineWidth;
  const clippedLeft = offLeft ? 0 : offRight ? timelineWidth : Math.max(0, left);
  const clippedRight = offLeft ? 0 : offRight ? timelineWidth : Math.min(timelineWidth, right);
  const width = Math.max(0, clippedRight - clippedLeft);

  return {
    ...connectionRect,
    x: clippedLeft,
    width,
    right: clippedRight,
    centerX: clippedLeft + width / 2,
    side: offLeft ? "left" : offRight ? "right" : "visible",
    isVisibleInTimeline: !offLeft && !offRight,
  };
}

function shouldRenderDependencyBetweenTimelineAnchors(fromAnchorRect, toAnchorRect) {
  if (!fromAnchorRect || !toAnchorRect) return false;
  if (fromAnchorRect.isVisibleInTimeline || toAnchorRect.isVisibleInTimeline) {
    return fromAnchorRect.side !== "right" && toAnchorRect.side !== "left";
  }
  return false;
}

function buildDependencyPathAroundSlots(x1, y1, x2, y2, fromRect, toRect, options = {}) {
  const cornerRadius = ui.scale === "weeks" ? 5 : 8;
  const dependencyEntryWidth = Number.isFinite(options.dependencyEntryWidth)
    ? options.dependencyEntryWidth
    : (ui.scale === "weeks" ? 10 : 18);
  const dependencyArrowLength = Number.isFinite(options.dependencyArrowLength)
    ? options.dependencyArrowLength
    : dependencyEntryWidth;
  const routePoints = buildGanttFinishStartDependencyPoints(x1, y1, x2, y2, fromRect, toRect, {
    dependencyArrowLength,
    dependencyEntryWidth,
    rowLayoutHeight: options.rowLayoutHeight,
    startStubPoint: options.startStubPoint,
  });
  const routedPoints = routePoints.map((point) => [point.x, point.y]);
  const pathOptions = {};

  return {
    cornerRadius,
    d: buildDependencyOrthogonalPath(routedPoints, cornerRadius, pathOptions),
    pathOptions,
    points: routedPoints,
  };
}

function buildGanttFinishStartDependencyPoints(x1, y1, x2, y2, fromRect = {}, toRect = {}, options = {}) {
  const entryWidth = Math.max(4, Number(options.dependencyEntryWidth || 0) || (ui.scale === "weeks" ? 10 : 18));
  const arrowLength = Math.max(4, Number(options.dependencyArrowLength || 0) || entryWidth);
  const shortStub = Math.max(6, Math.min(24, entryWidth));
  const rowHeight = Math.max(
    18,
    Number(fromRect.height || 0),
    Number(toRect.height || 0),
    Math.abs(y2 - y1) || 0,
  );
  const rowBend = Math.max(10, Math.min(36, Math.floor(rowHeight / 2)));
  const sameRow = Math.abs(y2 - y1) < 0.5;
  const targetIsAbove = y2 < y1;
  const rowDirection = targetIsAbove ? -1 : 1;
  const startStub = options.startStubPoint && Number.isFinite(options.startStubPoint.x) && Number.isFinite(options.startStubPoint.y)
    ? { x: options.startStubPoint.x, y: options.startStubPoint.y }
    : { x: x1 + shortStub, y: y1 };
  const targetLeadX = Math.max(2, x2 - shortStub * 2);
  const hasForwardSpace = x1 + arrowLength + shortStub < x2;

  if (sameRow) {
    if (hasForwardSpace) {
      return compactDependencyPointObjects([
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ]);
    }

    const preferredY = (Number(fromRect.y || 0) - rowBend) > 4
      ? Number(fromRect.y || y1) - rowBend
      : Number(fromRect.bottom || y1) + rowBend;
    const svgHeight = Number(options.rowLayoutHeight || 0);
    const corridorY = svgHeight
      ? Math.max(6, Math.min(svgHeight - 6, preferredY))
      : preferredY;
    return compactDependencyPointObjects([
      { x: x1, y: y1 },
      { x: x1 + shortStub, y: y1 },
      { x: x1 + shortStub, y: corridorY },
      { x: targetLeadX, y: corridorY },
      { x: targetLeadX, y: y2 },
      { x: x2, y: y2 },
    ]);
  }

  if (hasForwardSpace) {
    const corridorX = Math.min(x2 - shortStub, Math.max(x1 + shortStub, startStub.x));
    return compactDependencyPointObjects([
      { x: x1, y: y1 },
      { x: corridorX, y: y1 },
      { x: corridorX, y: y2 },
      { x: x2, y: y2 },
    ]);
  }

  const corridorY = y2 - rowDirection * rowBend;
  return compactDependencyPointObjects([
    { x: x1, y: y1 },
    { x: x1 + shortStub, y: y1 },
    { x: x1 + shortStub, y: corridorY },
    { x: targetLeadX, y: corridorY },
    { x: targetLeadX, y: y2 },
    { x: x2, y: y2 },
  ]);
}

function compactDependencyPointObjects(points) {
  return points.filter((point, index) => (
    index === 0
    || Math.abs(point.x - points[index - 1].x) > 0.1
    || Math.abs(point.y - points[index - 1].y) > 0.1
  ));
}

function dependencyRouteBacktracksOverStart(startPoint, startStubPoint, nextPoint, targetY) {
  const dx = startStubPoint.x - startPoint.x;
  const dy = startStubPoint.y - startPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return Math.abs(nextPoint.y - startStubPoint.y) < 0.1
      && (nextPoint.x - startStubPoint.x) * dx < -0.1;
  }

  return Math.abs(nextPoint.x - startStubPoint.x) < 0.1
    && (targetY - startStubPoint.y) * dy < -0.1;
}

function getDependencyStartDetourPoint(startPoint, startStubPoint, targetEntryLeadX, targetY, detourLength) {
  const dx = startStubPoint.x - startPoint.x;
  const dy = startStubPoint.y - startPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const directionY = targetY >= startStubPoint.y ? 1 : -1;
    return {
      x: startStubPoint.x,
      y: startStubPoint.y + directionY * detourLength,
    };
  }

  const directionX = targetEntryLeadX >= startStubPoint.x ? 1 : -1;
  return {
    x: startStubPoint.x + directionX * detourLength,
    y: startStubPoint.y,
  };
}

function getDependencyObstacleRects(slotMaskRects, fromSlotId, toSlotId) {
  return slotMaskRects
    .filter((rect) => rect.slotId !== fromSlotId && rect.slotId !== toSlotId)
    .map((rect) => ({
      ...rect,
      x: Number.isFinite(rect.rawX) ? rect.rawX : rect.x,
      y: Number.isFinite(rect.rawY) ? rect.rawY : rect.y,
      width: Number.isFinite(rect.rawWidth) ? rect.rawWidth : rect.width,
      height: Number.isFinite(rect.rawHeight) ? rect.rawHeight : rect.height,
      right: (Number.isFinite(rect.rawX) ? rect.rawX : rect.x) + (Number.isFinite(rect.rawWidth) ? rect.rawWidth : rect.width),
      bottom: (Number.isFinite(rect.rawY) ? rect.rawY : rect.y) + (Number.isFinite(rect.rawHeight) ? rect.rawHeight : rect.height),
    }));
}

function routeDependencyPointsAroundSlots(points, obstacleRects, clearance) {
  if (!obstacleRects.length || points.length < 2) return points;

  const basePoints = compactDependencyPoints(points.map(([x, y]) => ({ x, y })));
  if (!dependencyPathIntersectsObstacles(basePoints, obstacleRects)) {
    return basePoints.map((point) => [point.x, point.y]);
  }

  const blockingRects = getDependencyPathObstacleRects(basePoints, obstacleRects);
  const candidatePaths = [
    ...buildDependencyOuterCorridorCandidates(basePoints, blockingRects, clearance),
    ...buildDependencyOuterCorridorCandidates(basePoints, obstacleRects, clearance),
  ];
  const cleanCandidates = candidatePaths.filter((candidate) => (
    !dependencyPathBacktracksOverStart(candidate)
    && !dependencyPathIntersectsObstacles(candidate, obstacleRects)
  ));
  const selectedPath = getShortestDependencyPath(cleanCandidates)
    || getBestConstrainedDependencyPath(candidatePaths, obstacleRects)
    || basePoints;

  return compactDependencyPoints(selectedPath).map((point) => [point.x, point.y]);
}

function buildDependencyOuterCorridorCandidates(points, obstacleRects, clearance) {
  if (!obstacleRects.length || points.length < 4) return [];

  const start = points[0];
  const startStub = points[1];
  const entryLead = points[points.length - 3];
  const entryStart = points[points.length - 2];
  const end = points[points.length - 1];
  const extents = getDependencyObstacleExtents(obstacleRects);
  const rightCorridorX = extents.right + clearance;
  const leftCorridorX = extents.x - clearance;
  const bottomCorridorY = extents.bottom + clearance;
  const topCorridorY = extents.y - clearance;
  const firstDx = startStub.x - start.x;
  const firstDy = startStub.y - start.y;
  const preferRight = Math.abs(firstDx) >= Math.abs(firstDy)
    ? firstDx >= 0
    : entryLead.x >= startStub.x;
  const preferBottom = end.y >= startStub.y;
  const xCorridors = preferRight ? [rightCorridorX, leftCorridorX] : [leftCorridorX, rightCorridorX];
  const yCorridors = preferBottom ? [bottomCorridorY, topCorridorY] : [topCorridorY, bottomCorridorY];
  const candidates = [];

  xCorridors.forEach((corridorX) => {
    yCorridors.forEach((corridorY) => {
      candidates.push(compactDependencyPoints([
        start,
        startStub,
        { x: corridorX, y: startStub.y },
        { x: corridorX, y: corridorY },
        { x: entryLead.x, y: corridorY },
        entryLead,
        entryStart,
        end,
      ]));
      candidates.push(compactDependencyPoints([
        start,
        startStub,
        { x: startStub.x, y: corridorY },
        { x: entryLead.x, y: corridorY },
        entryLead,
        entryStart,
        end,
      ]));
    });
  });

  return candidates;
}

function getDependencyObstacleExtents(obstacleRects) {
  return obstacleRects.reduce((extents, rect) => ({
    x: Math.min(extents.x, rect.x),
    y: Math.min(extents.y, rect.y),
    right: Math.max(extents.right, rect.right),
    bottom: Math.max(extents.bottom, rect.bottom),
  }), {
    x: Infinity,
    y: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  });
}

function getDependencyPathObstacleRects(points, obstacleRects) {
  const rects = [];
  const seen = new Set();

  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    obstacleRects.forEach((rect) => {
      if (seen.has(rect.slotId)) return;
      if (!dependencySegmentIntersectsRect(start, end, rect)) return;
      seen.add(rect.slotId);
      rects.push(rect);
    });
  }

  return rects;
}

function getShortestDependencyPath(paths) {
  if (!paths.length) return null;
  return paths.reduce((best, candidate) => (
    compareDependencyPathLength(candidate, best) < 0 ? candidate : best
  ), paths[0]);
}

function getBestConstrainedDependencyPath(paths, obstacleRects) {
  if (!paths.length) return null;
  return paths.reduce((best, candidate) => (
    compareDependencyPathScore(candidate, best, obstacleRects) < 0 ? candidate : best
  ), paths[0]);
}

function compareDependencyPathScore(left, right, obstacleRects) {
  const leftBacktracking = dependencyPathBacktracksOverStart(left) ? 1 : 0;
  const rightBacktracking = dependencyPathBacktracksOverStart(right) ? 1 : 0;
  if (leftBacktracking !== rightBacktracking) return leftBacktracking - rightBacktracking;

  const leftHits = countDependencyPathObstacleHits(left, obstacleRects);
  const rightHits = countDependencyPathObstacleHits(right, obstacleRects);
  if (leftHits !== rightHits) return leftHits - rightHits;

  return compareDependencyPathLength(left, right);
}

function compareDependencyPathLength(left, right) {
  const leftLength = getDependencyPathLength(left);
  const rightLength = getDependencyPathLength(right);
  if (Math.abs(leftLength - rightLength) > 0.1) return leftLength - rightLength;
  return getDependencyPathBendCount(left) - getDependencyPathBendCount(right);
}

function getDependencyPathLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return length;
}

function getDependencyPathBendCount(points) {
  let bends = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const previousHorizontal = Math.abs(current.y - previous.y) < 0.1;
    const nextHorizontal = Math.abs(next.y - current.y) < 0.1;
    if (previousHorizontal !== nextHorizontal) bends += 1;
  }
  return bends;
}

function dependencyPathBacktracksOverStart(points) {
  if (points.length < 3) return false;

  const start = points[0];
  const startStub = points[1];
  const nextPoint = points[2];
  const dx = startStub.x - start.x;
  const dy = startStub.y - start.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return Math.abs(nextPoint.y - startStub.y) < 0.1
      && (nextPoint.x - startStub.x) * dx < -0.1;
  }

  return Math.abs(nextPoint.x - startStub.x) < 0.1
    && (nextPoint.y - startStub.y) * dy < -0.1;
}

function findDependencyPathObstacle(points, obstacleRects) {
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const rect = findDependencySegmentObstacle(start, end, obstacleRects);
    if (rect) return { rect, segmentIndex };
  }

  return null;
}

function dependencyPathIntersectsObstacles(points, obstacleRects) {
  return Boolean(findDependencyPathObstacle(points, obstacleRects));
}

function countDependencyPathObstacleHits(points, obstacleRects) {
  let hits = 0;
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    hits += obstacleRects.filter((rect) => dependencySegmentIntersectsRect(start, end, rect)).length;
  }
  return hits;
}

function findDependencySegmentObstacle(start, end, obstacleRects) {
  const horizontal = Math.abs(start.y - end.y) < 0.1;
  const vertical = Math.abs(start.x - end.x) < 0.1;
  if (!horizontal && !vertical) return null;

  return obstacleRects.find((rect) => dependencySegmentIntersectsRect(start, end, rect)) || null;
}

function dependencySegmentIntersectsRect(start, end, rect) {
  const horizontal = Math.abs(start.y - end.y) < 0.1;
  if (horizontal) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y > rect.y
      && start.y < rect.bottom
      && maxX > rect.x
      && minX < rect.right;
  }

  const vertical = Math.abs(start.x - end.x) < 0.1;
  if (vertical) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x > rect.x
      && start.x < rect.right
      && maxY > rect.y
      && minY < rect.bottom;
  }

  return false;
}

function compactDependencyPoints(points) {
  return points.filter((point, index) => (
    index === 0
    || Math.abs(point.x - points[index - 1].x) > 0.1
    || Math.abs(point.y - points[index - 1].y) > 0.1
  ));
}

function getDependencyPathPointsBeforeArrow(points = []) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const nextPoints = points.map((point) => [...point]);
  const endIndex = nextPoints.length - 1;
  const previous = nextPoints[endIndex - 1];
  const end = nextPoints[endIndex];
  const dx = end[0] - previous[0];
  const dy = end[1] - previous[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 1) return nextPoints;

  const trim = Math.min(GANTT_DEPENDENCY_ARROW_HEAD_ADVANCE, Math.max(0, length - 1));
  nextPoints[endIndex] = [
    end[0] - (dx / length) * trim,
    end[1] - (dy / length) * trim,
  ];

  return nextPoints.filter((point, index) => (
    index === 0
    || point[0] !== nextPoints[index - 1][0]
    || point[1] !== nextPoints[index - 1][1]
  ));
}

function buildDependencyOrthogonalPath(points, cornerRadius, options = {}) {
  const sharpCornerIndexes = options.sharpCornerIndexes || [];
  return roundedOrthogonalPath(points, cornerRadius, { sharpCornerIndexes });
}

function buildDependencyPathWithLineJumps(points, jumps, radius, options = {}) {
  const compactPoints = points.filter((point, index) => (
    index === 0
    || point[0] !== points[index - 1][0]
    || point[1] !== points[index - 1][1]
  ));

  if (!jumps.length || compactPoints.length < 2) {
    return buildDependencyOrthogonalPath(compactPoints, radius, options);
  }

  const sharpCornerIndexes = options.sharpCornerIndexes || [];

  const cornerData = getDependencyRoundedCornerData(compactPoints, radius, sharpCornerIndexes);
  const jumpsBySegment = groupDependencyJumpsBySegment(jumps);
  const commands = [`M ${round(compactPoints[0][0])} ${round(compactPoints[0][1])}`];
  let cursor = toDependencyPoint(compactPoints[0]);

  for (let segmentIndex = 0; segmentIndex < compactPoints.length - 1; segmentIndex += 1) {
    const segmentStart = segmentIndex === 0
      ? toDependencyPoint(compactPoints[segmentIndex])
      : cornerData[segmentIndex]?.after || toDependencyPoint(compactPoints[segmentIndex]);
    const segmentEnd = segmentIndex === compactPoints.length - 2
      ? toDependencyPoint(compactPoints[segmentIndex + 1])
      : cornerData[segmentIndex + 1]?.before || toDependencyPoint(compactPoints[segmentIndex + 1]);

    if (getDependencyPointDistance(cursor, segmentStart) > 0.1) {
      commands.push(`L ${round(segmentStart.x)} ${round(segmentStart.y)}`);
      cursor = segmentStart;
    }

    cursor = appendDependencySegmentWithLineJumps(
      commands,
      cursor,
      segmentEnd,
      jumpsBySegment.get(segmentIndex) || [],
    );

    const nextCorner = cornerData[segmentIndex + 1];
    if (!nextCorner) continue;

    if (nextCorner.hasCurve) {
      commands.push(`Q ${round(nextCorner.point.x)} ${round(nextCorner.point.y)} ${round(nextCorner.after.x)} ${round(nextCorner.after.y)}`);
      cursor = nextCorner.after;
    } else if (getDependencyPointDistance(cursor, nextCorner.after) > 0.1) {
      commands.push(`L ${round(nextCorner.after.x)} ${round(nextCorner.after.y)}`);
      cursor = nextCorner.after;
    }
  }

  return commands.join(" ");
}

function getDependencyRoundedCornerData(points, radius, sharpCornerIndexes = []) {
  const cornerData = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const point = toDependencyPoint(current);
    const incoming = normalize([current[0] - previous[0], current[1] - previous[1]]);
    const outgoing = normalize([next[0] - current[0], next[1] - current[1]]);
    const incomingLength = distance(previous, current);
    const outgoingLength = distance(current, next);
    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const hasCurve = !sharpCornerIndexes.includes(index)
      && Boolean(cornerRadius)
      && !isSameDirection(incoming, outgoing);

    if (!hasCurve) {
      cornerData[index] = {
        after: point,
        before: point,
        hasCurve: false,
        point,
      };
      continue;
    }

    cornerData[index] = {
      after: {
        x: current[0] + outgoing[0] * cornerRadius,
        y: current[1] + outgoing[1] * cornerRadius,
      },
      before: {
        x: current[0] - incoming[0] * cornerRadius,
        y: current[1] - incoming[1] * cornerRadius,
      },
      hasCurve: true,
      point,
    };
  }

  return cornerData;
}

function groupDependencyJumpsBySegment(jumps) {
  return jumps.reduce((groups, jump) => {
    if (!Number.isFinite(jump.segmentIndex)) return groups;
    const current = groups.get(jump.segmentIndex) || [];
    current.push(jump);
    groups.set(jump.segmentIndex, current);
    return groups;
  }, new Map());
}

function appendDependencySegmentWithLineJumps(commands, start, end, jumps) {
  const horizontal = Math.abs(start.y - end.y) < 0.1;
  const vertical = Math.abs(start.x - end.x) < 0.1;

  if ((!horizontal && !vertical) || !jumps.length) {
    if (getDependencyPointDistance(start, end) > 0.1) {
      commands.push(`L ${round(end.x)} ${round(end.y)}`);
    }
    return end;
  }

  const direction = horizontal
    ? Math.sign(end.x - start.x) || 1
    : Math.sign(end.y - start.y) || 1;
  const sortedJumps = getRenderableDependencyJumps(start, end, jumps, horizontal, direction);
  let cursor = start;

  sortedJumps.forEach((jump) => {
    const before = getDependencyJumpPoint(jump, horizontal, -direction);
    const after = getDependencyJumpPoint(jump, horizontal, direction);

    if (getDependencyPointDistance(cursor, before) > 0.1) {
      commands.push(`L ${round(before.x)} ${round(before.y)}`);
    }

    commands.push(`M ${round(after.x)} ${round(after.y)}`);
    cursor = after;
  });

  if (getDependencyPointDistance(cursor, end) > 0.1) {
    commands.push(`L ${round(end.x)} ${round(end.y)}`);
  }

  return end;
}

function getRenderableDependencyJumps(start, end, jumps, horizontal, direction) {
  const axisStart = horizontal ? start.x : start.y;
  const axisEnd = horizontal ? end.x : end.y;
  const minAxis = Math.min(axisStart, axisEnd);
  const maxAxis = Math.max(axisStart, axisEnd);
  const radius = DEPENDENCY_CROSSING_GAP_RADIUS;

  return jumps
    .map((jump) => {
      const axis = horizontal ? jump.x : jump.y;
      const availableRadius = Math.min(axis - minAxis, maxAxis - axis) - 0.5;
      return {
        ...jump,
        radius: Math.min(radius, Math.max(0, availableRadius)),
      };
    })
    .filter((jump) => jump.radius >= 2)
    .sort((left, right) => (
      ((horizontal ? left.x : left.y) - (horizontal ? right.x : right.y)) * direction
    ));
}

function getDependencyJumpPoint(jump, horizontal, direction) {
  const offset = direction * (jump.radius || DEPENDENCY_CROSSING_GAP_RADIUS);
  return horizontal
    ? { x: jump.x + offset, y: jump.y }
    : { x: jump.x, y: jump.y + offset };
}

function toDependencyPoint(point) {
  return { x: point[0], y: point[1] };
}

function getDependencyPointDistance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function getDependencyCrossingJumpsByRoute(crossings) {
  return crossings.reduce((groups, crossing) => {
    const current = groups.get(crossing.routeIndex) || [];
    current.push(crossing);
    groups.set(crossing.routeIndex, current);
    return groups;
  }, new Map());
}

function getDependencyRenderRoutesWithSeparatedHorizontals(routes = [], rowLayoutHeight = 0) {
  if (ui.ganttDependencyEditMode || routes.length < 2) {
    return routes.map((route) => ({
      ...route,
      points: route.points.map((point) => [...point]),
    }));
  }

  const nextRoutes = routes.map((route) => ({
    ...route,
    points: route.points.map((point) => [...point]),
  }));
  const horizontalSegments = nextRoutes.flatMap((route, routeIndex) => (
    getDependencyRouteSegments(route.points)
      .filter((segment) => segment.horizontal && segment.maxX - segment.minX >= 4)
      .map((segment) => ({
        ...segment,
        routeIndex,
        yKey: Math.round(segment.start.y * 2) / 2,
      }))
  ));
  if (!horizontalSegments.length) return nextRoutes;

  const groupedSegments = horizontalSegments.reduce((groups, segment) => {
    const current = groups.get(segment.yKey) || [];
    current.push(segment);
    groups.set(segment.yKey, current);
    return groups;
  }, new Map());
  const offsetsByRoute = new Map();

  groupedSegments.forEach((segments) => {
    const lanes = [];
    segments
      .sort((left, right) => (
        left.minX - right.minX
        || left.maxX - right.maxX
        || left.routeIndex - right.routeIndex
        || left.segmentIndex - right.segmentIndex
      ))
      .forEach((segment) => {
        const laneIndex = lanes.findIndex((lane) => !lane.some((laneSegment) => dependencyHorizontalSegmentsOverlap(laneSegment, segment)));
        const resolvedLaneIndex = laneIndex >= 0 ? laneIndex : lanes.length;
        if (!lanes[resolvedLaneIndex]) lanes[resolvedLaneIndex] = [];
        lanes[resolvedLaneIndex].push(segment);

        if (resolvedLaneIndex <= 0) return;
        const routeOffsets = offsetsByRoute.get(segment.routeIndex) || new Map();
        routeOffsets.set(segment.segmentIndex, getDependencyHorizontalTrackY(segment.start.y, resolvedLaneIndex, rowLayoutHeight));
        offsetsByRoute.set(segment.routeIndex, routeOffsets);
      });
  });

  offsetsByRoute.forEach((segmentTargetYByIndex, routeIndex) => {
    nextRoutes[routeIndex].points = applyDependencyHorizontalTrackDetours(nextRoutes[routeIndex].points, segmentTargetYByIndex);
  });

  return nextRoutes;
}

function dependencyHorizontalSegmentsOverlap(left, right) {
  const minOverlap = 2;
  if (Math.abs(left.start.y - right.start.y) > 0.5) return false;
  return Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX) > minOverlap;
}

function getDependencyHorizontalTrackY(baseY, laneIndex, rowLayoutHeight = 0) {
  const track = Math.ceil(laneIndex / 2);
  const direction = laneIndex % 2 ? -1 : 1;
  const preferred = baseY + direction * track * DEPENDENCY_HORIZONTAL_TRACK_GAP;
  const fallback = baseY - direction * track * DEPENDENCY_HORIZONTAL_TRACK_GAP;
  const minY = 4;
  const maxY = rowLayoutHeight ? Math.max(minY, rowLayoutHeight - 4) : Infinity;
  if (preferred >= minY && preferred <= maxY) return round(preferred);
  return round(Math.max(minY, Math.min(maxY, fallback)));
}

function applyDependencyHorizontalTrackDetours(points = [], segmentTargetYByIndex = new Map()) {
  if (!segmentTargetYByIndex.size || points.length < 2) return points;
  const nextPoints = [];
  const pushPoint = (point) => {
    const last = nextPoints[nextPoints.length - 1];
    if (last && Math.abs(last[0] - point[0]) < 0.1 && Math.abs(last[1] - point[1]) < 0.1) return;
    nextPoints.push([round(point[0]), round(point[1])]);
  };

  pushPoint(points[0]);
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const targetY = segmentTargetYByIndex.get(index);
    const isHorizontal = Math.abs(start[1] - end[1]) < 0.1;

    if (isHorizontal && Number.isFinite(targetY) && Math.abs(targetY - start[1]) > 0.1) {
      pushPoint([start[0], targetY]);
      pushPoint([end[0], targetY]);
      pushPoint(end);
    } else {
      pushPoint(end);
    }
  }

  return nextPoints;
}

function getDependencyRouteCrossings(routes) {
  const routeSegments = routes.map((route, routeIndex) => ({
    ...route,
    routeIndex,
    segments: getDependencyRouteSegments(route.points),
  }));
  const crossings = [];
  const seen = new Set();

  for (let leftIndex = 0; leftIndex < routeSegments.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < routeSegments.length; rightIndex += 1) {
      const leftRoute = routeSegments[leftIndex];
      const rightRoute = routeSegments[rightIndex];

      leftRoute.segments.forEach((leftSegment) => {
        rightRoute.segments.forEach((rightSegment) => {
          const crossing = getDependencySegmentCrossing(leftSegment, rightSegment);
          if (!crossing) return;

          const jumpTarget = getDependencyCrossingJumpTarget(leftRoute, leftSegment, rightRoute, rightSegment);
          if (!jumpTarget) return;

          const key = [
            jumpTarget.routeIndex,
            jumpTarget.segmentIndex,
            Math.round(crossing.x * 10),
            Math.round(crossing.y * 10),
          ].join(":");
          if (seen.has(key)) return;
          seen.add(key);
          crossings.push({
            ...crossing,
            radius: getDependencyCrossingGapRadius(crossing, jumpTarget.segment),
            routeIndex: jumpTarget.routeIndex,
            segmentIndex: jumpTarget.segmentIndex,
          });
        });
      });
    }
  }

  return crossings;
}

function getDependencyCrossingJumpTarget(leftRoute, leftSegment, rightRoute, rightSegment) {
  const sourceDeltaY = (leftRoute.sourceY ?? 0) - (rightRoute.sourceY ?? 0);
  if (sourceDeltaY > 0.1) {
    return {
      route: leftRoute,
      routeIndex: leftRoute.routeIndex,
      segment: leftSegment,
      segmentIndex: leftSegment.segmentIndex,
    };
  }

  if (sourceDeltaY < -0.1) {
    return {
      route: rightRoute,
      routeIndex: rightRoute.routeIndex,
      segment: rightSegment,
      segmentIndex: rightSegment.segmentIndex,
    };
  }

  return null;
}

function getDependencyCrossingGapRadius(crossing, segment) {
  const axis = segment.horizontal ? crossing.x : crossing.y;
  const minAxis = segment.horizontal ? segment.minX : segment.minY;
  const maxAxis = segment.horizontal ? segment.maxX : segment.maxY;
  const availableRadius = Math.min(axis - minAxis, maxAxis - axis) - 0.5;
  return Math.min(DEPENDENCY_CROSSING_GAP_RADIUS, Math.max(0, availableRadius));
}

function getDependencyRouteSegments(points) {
  const normalizedPoints = compactDependencyPoints(points.map(([x, y]) => ({ x, y })));
  const segments = [];

  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const start = normalizedPoints[index];
    const end = normalizedPoints[index + 1];
    const horizontal = Math.abs(start.y - end.y) < 0.1;
    const vertical = Math.abs(start.x - end.x) < 0.1;
    if (!horizontal && !vertical) continue;

    segments.push({
      end,
      horizontal,
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      segmentIndex: index,
      start,
      vertical,
    });
  }

  return segments;
}

function getDependencySegmentCrossing(left, right) {
  if (left.horizontal && right.vertical) {
    return getDependencyOrthogonalSegmentCrossing(left, right);
  }

  if (left.vertical && right.horizontal) {
    return getDependencyOrthogonalSegmentCrossing(right, left);
  }

  return null;
}

function getDependencyOrthogonalSegmentCrossing(horizontalSegment, verticalSegment) {
  const epsilon = 0.8;
  const x = verticalSegment.start.x;
  const y = horizontalSegment.start.y;
  const crossesHorizontally = x > horizontalSegment.minX + epsilon && x < horizontalSegment.maxX - epsilon;
  const crossesVertically = y > verticalSegment.minY + epsilon && y < verticalSegment.maxY - epsilon;

  return crossesHorizontally && crossesVertically ? { x, y } : null;
}

function buildDependencyPath(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 1) {
    return roundedOrthogonalPath([[x1, y1], [x2, y2]], 8);
  }

  if (x2 > x1 + 64) {
    const turnX = x1 + (x2 - x1) / 2;
    return roundedOrthogonalPath([
      [x1, y1],
      [turnX, y1],
      [turnX, y2],
      [x2, y2],
    ], 8);
  }

  const startStubX = x1 + 34;
  const approachX = Math.max(x2 - 22, x1 + 34);
  const midY = y1 + (y2 - y1) / 2;

  return roundedOrthogonalPath([
    [x1, y1],
    [startStubX, y1],
    [startStubX, midY],
    [approachX, midY],
    [approachX, y2],
    [x2, y2],
  ], 8);
}

function roundedOrthogonalPath(points, radius, options = {}) {
  const compactPoints = points.filter((point, index) => (
    index === 0
    || point[0] !== points[index - 1][0]
    || point[1] !== points[index - 1][1]
  ));

  if (compactPoints.length < 2) return "";

  const commands = [`M ${round(compactPoints[0][0])} ${round(compactPoints[0][1])}`];

  for (let index = 1; index < compactPoints.length - 1; index += 1) {
    const previous = compactPoints[index - 1];
    const current = compactPoints[index];
    const next = compactPoints[index + 1];
    const incoming = normalize([current[0] - previous[0], current[1] - previous[1]]);
    const outgoing = normalize([next[0] - current[0], next[1] - current[1]]);
    const incomingLength = distance(previous, current);
    const outgoingLength = distance(current, next);
    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const isSharpCorner = options.sharpCornerIndexes?.includes(index);

    if (isSharpCorner || !cornerRadius || isSameDirection(incoming, outgoing)) {
      commands.push(`L ${round(current[0])} ${round(current[1])}`);
      continue;
    }

    const before = [
      current[0] - incoming[0] * cornerRadius,
      current[1] - incoming[1] * cornerRadius,
    ];
    const after = [
      current[0] + outgoing[0] * cornerRadius,
      current[1] + outgoing[1] * cornerRadius,
    ];

    commands.push(`L ${round(before[0])} ${round(before[1])}`);
    commands.push(`Q ${round(current[0])} ${round(current[1])} ${round(after[0])} ${round(after[1])}`);
  }

  const last = compactPoints[compactPoints.length - 1];
  commands.push(`L ${round(last[0])} ${round(last[1])}`);
  return commands.join(" ");
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  return length ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function distance(left, right) {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function isSameDirection(left, right) {
  return Math.abs(left[0] - right[0]) < 0.001 && Math.abs(left[1] - right[1]) < 0.001;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function renderIssueDock(warnings) {
  const critical = warnings.filter((warning) => warning.severity === "critical");
  const regular = warnings.filter((warning) => warning.severity !== "critical");
  const sorted = [...critical, ...regular].slice(0, 7);

  return `
    <aside class="issue-dock">
      <div class="issue-header">
        <strong>Предупреждения плана</strong>
        <span>${warnings.length}</span>
      </div>
      <div class="issue-list">
        ${sorted.length ? sorted.map((warning) => `
          <button class="issue-item ${warning.severity}" data-focus-warning="${warning.slotIds?.[0] || ""}" type="button">
            ${icon(warning.severity === "critical" ? "alert" : "info")}
            <span>${escapeHtml(warning.message)}</span>
          </button>
        `).join("") : `
          <div class="empty-state">${icon("check")}<span>Конфликтов и нарушений маршрута нет</span></div>
        `}
      </div>
    </aside>
  `;
}

function renderPlanningAssistantDock(warnings) {
  const backlog = buildBacklogItems(8);
  const critical = warnings.filter((warning) => warning.severity === "critical");
  const regular = warnings.filter((warning) => warning.severity !== "critical");
  const sortedWarnings = [...critical, ...regular].slice(0, 5);
  const workload = buildWorkloadRows();
  const topWorkload = workload[0];
  const riskyProjects = getProductionContexts()
    .map((project) => ({ project, dueState: getProjectDeadlineState(project) }))
    .filter((item) => ["critical", "warning"].includes(item.dueState.tone));

  return `
    <aside class="planning-assistant-dock" aria-label="Помощник планирования">
      <div class="assistant-dock-head">
        <span class="eyebrow">Линейная работа с планом</span>
        <strong>Сначала очередь, затем исправления, затем контроль</strong>
      </div>
      <section class="assistant-panel backlog-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>Очередь из Планирования</strong>
            <span>${backlog.length ? "операции доступны только через модуль «Заказ-наряды»" : "очередь пуста"}</span>
          </div>
          <em>${backlog.length}</em>
        </div>
        <div class="assistant-list backlog-list">
          ${backlog.length ? backlog.map((item) => `
            <article class="assistant-item backlog-item">
              <button class="assistant-item-main" data-open-planning-for-project="${escapeAttribute(item.project.id)}" type="button">
                <strong>${escapeHtml(item.routeStep.operationName)}</strong>
                <span>${escapeHtml(getProjectDisplayName(item.project) || item.project.name)} · заказ-наряд · ${item.quantity} шт.</span>
              </button>
              <div class="assistant-item-meta">
                <span>${escapeHtml(item.workCenter?.code || "")}</span>
                <span>${item.requiresPlanningLine ? "выберите линию" : formatDateTime(item.plannedStart)}</span>
                <button class="secondary-button assistant-inline-action ui-action-button" data-open-planning-for-project="${escapeAttribute(item.project.id)}" type="button"><span>Открыть заказ-наряды</span></button>
              </div>
            </article>
          `).join("") : `
            <div class="assistant-empty">${icon("check")}<span>Нет обязательных шагов без слота</span></div>
          `}
        </div>
        <div class="assistant-panel-actions">
          <button class="secondary-button ui-action-button" data-open-planning-module type="button">${icon("calendar")}<span>Открыть заказ-наряды</span></button>
        </div>
      </section>

      <section class="assistant-panel conflict-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>Исправления</strong>
            <span>маршрут, перегрузка отдела, количество</span>
          </div>
          <em class="${critical.length ? "critical" : warnings.length ? "warning" : "ok"}">${warnings.length}</em>
        </div>
        <div class="assistant-list conflict-list">
          ${sortedWarnings.length ? sortedWarnings.map((warning) => `
            <article class="assistant-item conflict-item ${warning.severity}">
              <button class="assistant-item-main" data-focus-warning="${warning.slotIds?.[0] || ""}" type="button">
                <strong>${escapeHtml(formatWarningType(warning.type))}</strong>
                <span>${escapeHtml(warning.message)}</span>
              </button>
              <div class="assistant-item-meta">
                <span>${warning.severity === "critical" ? "Критично" : "Предупр."}</span>
                <button class="secondary-button assistant-inline-action ui-action-button" data-fix-warning="${escapeAttribute(warning.id)}" type="button"><span>Исправить</span></button>
              </div>
            </article>
          `).join("") : `
            <div class="assistant-empty">${icon("check")}<span>План без активных предупреждений</span></div>
          `}
        </div>
        <div class="assistant-panel-actions">
          <button class="secondary-button ui-action-button ${critical.length ? "danger" : ""}" data-fix-all-warnings type="button" ${warnings.length ? "" : "disabled"}>${icon("refresh")}<span>Исправить все доступное</span></button>
        </div>
      </section>

      <section class="assistant-panel intelligence-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>Контроль плана</strong>
            <span>автосдвиг, риски, буфер маршрута</span>
          </div>
          <em>${ui.autoCascade ? "ON" : "OFF"}</em>
        </div>
        <div class="planning-controls">
          <label class="assistant-toggle">
            <input type="checkbox" data-auto-cascade ${ui.autoCascade ? "checked" : ""} />
            <span>Автосдвиг цепочки заказ-наряда</span>
          </label>
          <button class="secondary-button assistant-panel-command ui-action-button" data-save-plan-snapshot type="button">${icon("save")}<span>Снимок плана</span></button>
        </div>
        <div class="assistant-metrics">
          <div><strong>${topWorkload?.label || "-"}</strong><span>самый загруженный отдел</span></div>
          <div><strong>${riskyProjects.length}</strong><span>заказ-нарядов у срока</span></div>
          <div><strong>${formatDuration(getRouteBufferMs())}</strong><span>буфер маршрута</span></div>
        </div>
      </section>
    </aside>
  `;
}

function formatWarningType(type) {
  const labels = {
    capacity: "Загрузка",
    route: "Маршрут",
    quantity: "Количество",
    duration: "Длительность",
  };
  return labels[type] || "План";
}

function getWarningProductionId(warning = {}) {
  return warning.productionId || warning.projectId || "";
}

function getWarningPlanningOrderId(warning = {}) {
  return warning.planningOrderId || warning.batchId || "";
}

function renderSlotDrawer(slotWarningMap) {
  const slot = ui.selectedSlotId ? planningState.slots.find((item) => item.id === ui.selectedSlotId) : null;
  if (!slot) return "";

  const slotRoute = getSlotRoute(slot);
  const productionId = getSlotProductionContextId(slot) || getRoutePlanningContext(slotRoute)?.id || "";
  const planningOrderId = getSlotPlanningOrderId(slot, getSlotRouteId(slot, planningState));
  const project = getProject(productionId);
  const batch = getBatch(planningOrderId);
  const workCenter = getWorkCenter(slot.workCenterId);
  const allRouteSteps = slotRoute ? getRouteStepsForModule(slotRoute.id) : getProjectRouteSteps(productionId, planningState);
  const currentStep = allRouteSteps.find((step) => step.id === slot.routeStepId);
  const currentTaskId = getRouteStepTaskId(currentStep);
  const routeSteps = allRouteSteps.filter((step) => getRouteStepTaskId(step) === currentTaskId);
  const orderedSlots = planningState.slots
    .filter((item) => (
      slotMatchesProductionContext(item, productionId)
      && slotMatchesPlanningOrder(item, planningOrderId)
      && getSlotRouteTaskId(item) === currentTaskId
    ))
    .sort((a, b) => {
      const left = routeSteps.find((step) => step.id === a.routeStepId)?.stepOrder ?? 999;
      const right = routeSteps.find((step) => step.id === b.routeStepId)?.stepOrder ?? 999;
      return left - right;
    });
  const currentIndex = orderedSlots.findIndex((item) => item.id === slot.id);
  const previous = orderedSlots[currentIndex - 1];
  const next = orderedSlots[currentIndex + 1];
  const planMs = getSlotWorkingDurationMs(slot);
  const calendarMs = getSlotCalendarDurationMs(slot);
  const calendarLabel = getWorkCalendarLabel(getCalendarWorkCenter(slot.workCenterId, planningState));
  const factMs = slot.actualStart && slot.actualEnd
    ? getWorkingDurationBetween(slot.workCenterId, slot.actualStart, slot.actualEnd, planningState)
    : null;
  const deviation = factMs === null ? "нет факта" : formatDuration(factMs - planMs);
  const warnings = slotWarningMap[slot.id] || [];
  const operationFlow = getSlotOperationFlow(slot, slotRoute, currentStep);
  const slotStatusView = getGanttSlotStatusView(slot);
  const slotStatusClass = getGanttSlotStatusClass(slot);
  const planningLaborView = getSlotPlanningLaborView(slot);

  return renderUiDrawerShell({
    className: "slot-drawer",
    attributes: "aria-label=\"Карточка операции\" data-gantt-overlay=\"drawer\" data-gantt-overlay-component=\"GanttDrawer\"",
    content: `
      <div class="drawer-header">
        <div>
          <h2>${escapeHtml(slot.operationName)}</h2>
        </div>
        <button class="icon-button ui-action-button" data-close-drawer type="button" title="Закрыть">${icon("close")}</button>
      </div>

      <div class="drawer-summary ${slotStatusClass}" data-visual-qa-target="gantt-slot-drawer-summary">
        <div>
          <strong>Заказ-наряд</strong>
          <span>${Number(slot.quantity || 0).toLocaleString("ru-RU")} шт.</span>
        </div>
        <span>${escapeHtml(slotStatusView.label || "статус")}</span>
      </div>

      <div class="drawer-signal-grid" data-visual-qa-target="gantt-slot-drawer-signal-grid">
        <article data-visual-qa-target="gantt-slot-drawer-working-duration">
          <span>Рабочая длительность</span>
          <strong>${formatDuration(planMs)}</strong>
        </article>
        <article data-visual-qa-target="gantt-slot-drawer-calendar-duration">
          <span>Календарное окно</span>
          <strong>${formatDuration(calendarMs)}</strong>
        </article>
        <article data-visual-qa-target="gantt-slot-drawer-resource-code">
          <span>Ресурс</span>
          <strong>${escapeHtml(workCenter?.code || "-")}</strong>
        </article>
        <article class="${warnings.length ? "warning" : "ok"}" data-visual-qa-target="gantt-slot-drawer-signal-count">
          <span>Сигналы</span>
          <strong>${warnings.length}</strong>
        </article>
      </div>

	      <dl class="detail-grid" data-visual-qa-target="gantt-slot-drawer-detail-grid">
        <div data-visual-qa-target="gantt-slot-drawer-detail-product"><dt>Состав изделия</dt><dd>${escapeHtml(getProjectDisplayName(project) || "")}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-order"><dt>Заказ</dt><dd>${escapeHtml(project?.orderNumber || "")}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-work-center"><dt>Отдел</dt><dd>${escapeHtml(workCenter?.name || "")}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-route-step"><dt>Шаг маршрута</dt><dd>${currentStep?.stepOrder || "-"} · ${escapeHtml(currentStep?.operationName || "")}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-labor" title="${escapeAttribute(planningLaborView.title)}"><dt>Расчет трудозатрат</dt><dd>${escapeHtml(planningLaborView.label)} · ${escapeHtml(planningLaborView.value)}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-calendar-window"><dt>Календарное окно</dt><dd>${formatDateTime(slot.plannedStart)} - ${formatDateTime(slot.plannedEnd)}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-calendar"><dt>График ресурса</dt><dd>${escapeHtml(calendarLabel)}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-fact"><dt>Факт</dt><dd>${slot.actualStart ? formatDateTime(slot.actualStart) : "-"} - ${slot.actualEnd ? formatDateTime(slot.actualEnd) : "-"}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-deviation"><dt>Отклонение</dt><dd>${escapeHtml(deviation)}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-lock"><dt>Фиксация</dt><dd>${slot.locked ? "Зафиксировано" : "Можно двигать"}</dd></div>
        <div data-visual-qa-target="gantt-slot-drawer-detail-comment"><dt>Комментарий</dt><dd>${escapeHtml(slot.comment || "Без комментария")}</dd></div>
	      </dl>

	      ${renderOperationFlowMap(operationFlow, { compact: true, qaPrefix: "gantt-slot-drawer" })}

	      ${renderDrawerRouteSequence(routeSteps, orderedSlots, slot, { qaPrefix: "gantt-slot-drawer" })}

      <div class="route-neighbors">
        <button class="secondary-button route-neighbor-button ui-action-button" data-focus-slot="${previous?.id || ""}" type="button" ${previous ? "" : "disabled"}>${icon("arrowLeft")}<span>${previous ? previous.operationName : "Предыдущей нет"}</span></button>
        <button class="secondary-button route-neighbor-button ui-action-button" data-focus-slot="${next?.id || ""}" type="button" ${next ? "" : "disabled"}><span>${next ? next.operationName : "Следующей нет"}</span>${icon("arrowRight")}</button>
      </div>

      ${warnings.length ? `
        <div class="drawer-warnings" data-visual-qa-target="gantt-slot-drawer-warnings">
          ${warnings.map((warning) => `<div class="${warning.severity}" data-visual-qa-target="gantt-slot-drawer-warning">${icon(warning.severity === "critical" ? "alert" : "info")}<span>${escapeHtml(warning.message)}</span></div>`).join("")}
        </div>
      ` : ""}

      <div class="drawer-actions" data-visual-qa-target="gantt-slot-drawer-actions">
        <button class="primary-button ui-action-button" data-edit-slot="${slot.id}" type="button">${icon("edit")}<span>Изменить</span></button>
        <button class="secondary-button ui-action-button" data-cycle-status="${slot.id}" type="button">${icon("play")}<span>Статус</span></button>
        <button class="secondary-button ui-action-button" data-find-window-slot="${slot.id}" type="button">${icon("search")}<span>Окно</span></button>
        <button class="secondary-button ui-action-button" data-cascade-slot="${slot.id}" type="button">${icon("refresh")}<span>Цепочка</span></button>
        <button class="secondary-button ui-action-button" data-toggle-lock-slot="${slot.id}" type="button">${icon(slot.locked ? "unlock" : "lock")}<span>${slot.locked ? "Снять фиксацию" : "Зафиксировать"}</span></button>
        <button class="secondary-button danger ui-action-button" data-delete-slot="${slot.id}" type="button">${icon("trash")}<span>Удалить</span></button>
      </div>
    `,
  });
}

function renderDrawerRouteSequence(routeSteps, orderedSlots, currentSlot, options = {}) {
  if (!routeSteps.length) return "";
  const actionAttribute = options.action === "edit" ? "data-edit-slot" : "data-focus-slot";
  const qaPrefix = String(options.qaPrefix || "").trim();
  const rootQa = qaPrefix ? ` data-visual-qa-target="${escapeAttribute(`${qaPrefix}-route-sequence`)}"` : "";
  return `
    <div class="drawer-route-sequence"${rootQa} aria-label="Последовательность заказ-наряда">
      <strong${qaPrefix ? ` data-visual-qa-target="${escapeAttribute(`${qaPrefix}-route-sequence-title`)}"` : ""}>Последовательность заказ-наряда</strong>
      <div>
        ${routeSteps.map((step) => {
          const stepSlot = orderedSlots.find((item) => item.routeStepId === step.id);
          const className = [
            stepSlot ? "is-planned" : "is-empty",
            stepSlot?.id === currentSlot.id ? "is-current" : "",
            stepSlot && isGanttSlotCompleted(stepSlot) ? "is-done" : "",
            stepSlot && isGanttSlotActive(stepSlot) ? "is-active" : "",
            isManufacturingOutputReceiptRouteStep(step) ? "is-warehouse" : "",
          ].filter(Boolean).join(" ");
          return `
            <button class="${className}" ${qaPrefix ? `data-visual-qa-target="${escapeAttribute(`${qaPrefix}-route-sequence-step`)}" data-route-step-id="${escapeAttribute(step.id || "")}"` : ""} ${actionAttribute}="${stepSlot?.id || ""}" type="button" ${stepSlot ? "" : "disabled"} title="${escapeAttribute(step.operationName)}">
              <b>${step.stepOrder}</b>
              <span>${escapeHtml(getWorkCenter(step.workCenterId)?.code || step.workCenterId)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderEditorModal() {
  if (!ui.editor) return "";

  const isEdit = ui.editor.mode === "edit";
  const slot = isEdit ? planningState.slots.find((item) => item.id === ui.editor.slotId) : ui.editor.defaults;
  if (!slot) return "";

  const slotRoute = getSlotRoute(slot);
  const productionId = getSlotProductionContextId(slot) || getRoutePlanningContext(slotRoute)?.id || "";
  const planningOrderId = getSlotPlanningOrderId(slot, slotRoute?.id || getSlotRouteId(slot, planningState));
  const project = getRoutePlanningContext(slotRoute) || getProject(productionId);
  const projectBatches = slotRoute
    ? getRoutePlanningBatches(slotRoute, project)
    : [];
  const routeSteps = (slotRoute ? getRouteStepsForModule(slotRoute.id) : getProjectRouteSteps(project?.id || productionId, planningState))
    .filter((step) => getOperationMapItem(step.operationId));
  const routeStep = routeSteps.find((step) => step.id === slot.routeStepId) || routeSteps.find((step) => step.workCenterId === slot.workCenterId) || routeSteps[0];
  const batch = getBatch(planningOrderId) || projectBatches[0];
  const routeStepWorkCenter = getWorkCenter(routeStep?.workCenterId || slot.workCenterId);
  const slotQuantity = Number(slot.quantity || batch?.quantity || 1);
  const initialAssignment = routeStep
    ? getRouteStepPlanningAssignmentForSlot(routeStep, slot, {
      state: planningState,
      quantity: slotQuantity,
      readyAt: slot.plannedStart || null,
      ignoreSlotId: isEdit ? slot.id : null,
    })
    : null;
  const planningLineOptions = routeStep ? getRouteStepPlanningLineOptions(routeStep) : [];
  const planningLineValue = initialAssignment?.workCenterId
    || getRouteStepSelectedPlanningWorkCenterId(routeStep, planningState, { currentWorkCenterId: slot.workCenterId })
    || "";
  const planningLineRequired = routeStep ? routeStepRequiresManualPlanningLine(routeStep, planningState) : false;
  const allRouteSteps = slotRoute ? getRouteStepsForModule(slotRoute.id) : getProjectRouteSteps(productionId, planningState);
  const currentStep = allRouteSteps.find((step) => step.id === slot.routeStepId) || routeStep;
  const currentTaskId = getRouteStepTaskId(currentStep);
  const sequenceSteps = allRouteSteps.filter((step) => getRouteStepTaskId(step) === currentTaskId);
  const orderedSlots = planningState.slots
    .filter((item) => (
      slotMatchesProductionContext(item, productionId)
      && slotMatchesPlanningOrder(item, planningOrderId)
      && getSlotRouteTaskId(item) === currentTaskId
    ))
    .sort((a, b) => {
      const left = sequenceSteps.find((step) => step.id === a.routeStepId)?.stepOrder ?? 999;
      const right = sequenceSteps.find((step) => step.id === b.routeStepId)?.stepOrder ?? 999;
      return left - right;
    });
  const currentIndex = orderedSlots.findIndex((item) => item.id === slot.id);
  const previous = orderedSlots[currentIndex - 1];
  const next = orderedSlots[currentIndex + 1];
  const workCenter = getWorkCenter(slot.workCenterId);
  const planMs = getSlotWorkingDurationMs(slot);
  const calendarMs = getSlotCalendarDurationMs(slot);
  const calendarLabel = getWorkCalendarLabel(getCalendarWorkCenter(slot.workCenterId, planningState));
  const factMs = slot.actualStart && slot.actualEnd
    ? getWorkingDurationBetween(slot.workCenterId, slot.actualStart, slot.actualEnd, planningState)
    : null;
  const deviation = factMs === null ? "нет факта" : formatDuration(factMs - planMs);
  const warnings = isEdit ? (getSlotWarnings(planningState).slotWarningMap?.[slot.id] || []) : [];
  const operationFlow = getSlotOperationFlow(slot, slotRoute, currentStep);
  const slotStatusView = getGanttSlotStatusView(slot);
  const slotStatusClass = getGanttSlotStatusClass(slot);
  const planningLaborView = getSlotPlanningLaborView(slot);

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      ${renderUiModalShell({
        className: "large-modal form-modal slot-form-modal",
        attributes: `aria-label="${isEdit ? "Редактирование слота" : "Создание слота"}" data-gantt-overlay="editor" data-gantt-overlay-component="GanttEditorModal"`,
        content: `
        <form id="slotForm">
          <div class="modal-header">
            <div>
              <h2>${escapeHtml(getProjectDisplayName(project) || PRODUCT_COMPOSITION_TERM)}</h2>
            </div>
            <div class="modal-header-actions">
              <button class="icon-button ui-action-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
            </div>
          </div>

          <input type="hidden" name="slotId" value="${isEdit ? slot.id : ""}" />
          <input type="hidden" name="productionId" value="${escapeAttribute(project?.id || productionId || "")}" />

          ${isEdit ? `
            <section class="slot-form-context" data-visual-qa-target="gantt-slot-editor-context" aria-label="Контекст операции">
              <div class="drawer-summary ${slotStatusClass}" data-visual-qa-target="gantt-slot-editor-summary">
                <div>
                  <strong>Заказ-наряд</strong>
                  <span>${Number(slot.quantity || 0).toLocaleString("ru-RU")} шт.</span>
                </div>
                <span>${escapeHtml(slotStatusView.label || "статус")}</span>
              </div>

              <div class="drawer-signal-grid" data-visual-qa-target="gantt-slot-editor-signal-grid">
                <article data-visual-qa-target="gantt-slot-editor-working-duration">
                  <span>Рабочая длительность</span>
                  <strong>${formatDuration(planMs)}</strong>
                </article>
                <article data-visual-qa-target="gantt-slot-editor-calendar-duration">
                  <span>Календарное окно</span>
                  <strong>${formatDuration(calendarMs)}</strong>
                </article>
                <article data-visual-qa-target="gantt-slot-editor-resource-code">
                  <span>Ресурс</span>
                  <strong>${escapeHtml(workCenter?.code || "-")}</strong>
                </article>
                <article class="${warnings.length ? "warning" : "ok"}" data-visual-qa-target="gantt-slot-editor-signal-count">
                  <span>Сигналы</span>
                  <strong>${warnings.length}</strong>
                </article>
              </div>

              <dl class="detail-grid" data-visual-qa-target="gantt-slot-editor-detail-grid">
                <div data-visual-qa-target="gantt-slot-editor-detail-product"><dt>Состав изделия</dt><dd>${escapeHtml(getProjectDisplayName(project) || "")}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-order"><dt>Заказ</dt><dd>${escapeHtml(project?.orderNumber || "")}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-work-center"><dt>Отдел</dt><dd>${escapeHtml(workCenter?.name || "")}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-route-step"><dt>Шаг маршрута</dt><dd>${currentStep?.stepOrder || "-"} · ${escapeHtml(currentStep?.operationName || "")}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-labor" title="${escapeAttribute(planningLaborView.title)}"><dt>Расчет трудозатрат</dt><dd>${escapeHtml(planningLaborView.label)} · ${escapeHtml(planningLaborView.value)}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-calendar-window"><dt>Календарное окно</dt><dd>${formatDateTime(slot.plannedStart)} - ${formatDateTime(slot.plannedEnd)}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-calendar"><dt>График ресурса</dt><dd>${escapeHtml(calendarLabel)}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-fact"><dt>Факт</dt><dd>${slot.actualStart ? formatDateTime(slot.actualStart) : "-"} - ${slot.actualEnd ? formatDateTime(slot.actualEnd) : "-"}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-deviation"><dt>Отклонение</dt><dd>${escapeHtml(deviation)}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-lock"><dt>Фиксация</dt><dd>${slot.locked ? "Зафиксировано" : "Можно двигать"}</dd></div>
                <div data-visual-qa-target="gantt-slot-editor-detail-comment"><dt>Комментарий</dt><dd>${escapeHtml(slot.comment || "Без комментария")}</dd></div>
              </dl>

              ${renderOperationFlowMap(operationFlow, { compact: true, qaPrefix: "gantt-slot-editor" })}

              ${renderDrawerRouteSequence(sequenceSteps, orderedSlots, slot, { action: "edit", qaPrefix: "gantt-slot-editor" })}

              <div class="route-neighbors">
                <button class="secondary-button route-neighbor-button ui-action-button" data-edit-slot="${previous?.id || ""}" type="button" ${previous ? "" : "disabled"}>${icon("arrowLeft")}<span>${previous ? previous.operationName : "Предыдущей нет"}</span></button>
                <button class="secondary-button route-neighbor-button ui-action-button" data-edit-slot="${next?.id || ""}" type="button" ${next ? "" : "disabled"}><span>${next ? next.operationName : "Следующей нет"}</span>${icon("arrowRight")}</button>
              </div>

              ${warnings.length ? `
                <div class="drawer-warnings" data-visual-qa-target="gantt-slot-editor-warnings">
                  ${warnings.map((warning) => `<div class="${warning.severity}" data-visual-qa-target="gantt-slot-editor-warning">${icon(warning.severity === "critical" ? "alert" : "info")}<span>${escapeHtml(warning.message)}</span></div>`).join("")}
                </div>
              ` : ""}

              <div class="drawer-actions slot-form-actions" data-visual-qa-target="gantt-slot-editor-actions">
                <button class="secondary-button ui-action-button" data-cycle-status="${slot.id}" type="button">${icon("play")}<span>Статус</span></button>
                <button class="secondary-button ui-action-button" data-find-window-slot="${slot.id}" type="button">${icon("search")}<span>Окно</span></button>
                <button class="secondary-button ui-action-button" data-cascade-slot="${slot.id}" type="button">${icon("refresh")}<span>Цепочка</span></button>
                <button class="secondary-button ui-action-button" data-toggle-lock-slot="${slot.id}" type="button">${icon(slot.locked ? "unlock" : "lock")}<span>${slot.locked ? "Снять фиксацию" : "Зафиксировать"}</span></button>
                <button class="secondary-button danger ui-action-button" data-delete-slot="${slot.id}" type="button">${icon("trash")}<span>Удалить</span></button>
              </div>
            </section>
          ` : ""}

          <div class="form-grid">
            <label class="form-field readonly ui-form-field">
              <span>Состав изделия</span>
              <input type="text" value="${escapeAttribute(getProjectDisplayName(project) || "")}" readonly />
            </label>

            <input type="hidden" name="planningOrderId" value="${escapeAttribute(slotRoute?.id || batch?.id || planningOrderId || "")}" />

            <label class="form-field command-field ui-form-field">
              <span>Операция маршрута</span>
              <select name="routeStepId" id="routeStepField" required>
                ${routeSteps.map((step) => `<option value="${step.id}" data-work-center="${step.workCenterId}" data-operation="${escapeAttribute(step.operationName)}" ${selected(routeStep?.id, step.id)}>${step.stepOrder}. ${escapeHtml(step.operationName)}</option>`).join("")}
              </select>
            </label>

            <label class="form-field readonly ui-form-field">
              <span>Отдел</span>
              <input id="workCenterField" name="workCenterId" type="hidden" value="${escapeAttribute(routeStep?.workCenterId || slot.workCenterId || "")}" />
              <input type="text" value="${escapeAttribute(routeStepWorkCenter?.name || "отдел не выбран")}" readonly />
            </label>

            <label class="form-field command-field ui-form-field">
              <span>Линия в плане</span>
              <select id="planningLineField" name="planningWorkCenterId" ${planningLineRequired ? "required" : ""} ${planningLineOptions.length > 1 ? "" : "disabled"}>
                ${planningLineOptions.map((option) => `<option value="${escapeAttribute(option.value)}" ${selected(planningLineValue, option.value)} ${option.disabled ? "disabled" : ""}>${escapeHtml(option.label)}${option.meta ? ` · ${escapeHtml(option.meta)}` : ""}</option>`).join("")}
              </select>
            </label>

            <label class="form-field readonly ui-form-field">
              <span>Название операции</span>
              <input name="operationName" id="operationField" type="text" value="${escapeAttribute(routeStep?.operationName || slot.operationName || "")}" readonly required />
            </label>

            <label class="form-field readonly ui-form-field">
              <span>Количество, шт.</span>
              <input type="text" value="${slotQuantity.toLocaleString("ru-RU")} шт. · редактируется прямо в колбаске" readonly />
            </label>

            <label class="form-field ui-form-field">
              <span>Плановое начало</span>
              <input name="plannedStart" type="datetime-local" value="${isoLocal(slot.plannedStart)}" required />
            </label>

            <label class="form-field ui-form-field">
              <span>Плановое окончание</span>
              <input name="plannedEnd" type="datetime-local" value="${isoLocal(slot.plannedEnd)}" readonly />
            </label>

            <label class="form-field ui-form-field">
              <span>Фактическое начало</span>
              <input name="actualStart" type="datetime-local" value="${slot.actualStart ? isoLocal(slot.actualStart) : ""}" />
            </label>

            <label class="form-field ui-form-field">
              <span>Фактическое окончание</span>
              <input name="actualEnd" type="datetime-local" value="${slot.actualEnd ? isoLocal(slot.actualEnd) : ""}" />
            </label>

            <label class="form-field command-field ui-form-field">
              <span>Статус</span>
              <select name="status" required>
                ${GANTT_SLOT_STATUS_VALUES.map((status) => `<option value="${status}" ${selected(getGanttSlotStatusView(slot).value || "planned", status)}>${GANTT_SLOT_STATUS_LABELS[status] || status}</option>`).join("")}
              </select>
            </label>

            <label class="form-field full ui-form-field">
              <span>Комментарий</span>
              <textarea name="comment" rows="3">${escapeHtml(slot.comment || "")}</textarea>
            </label>
          </div>

          <div class="modal-footer">
            <button class="secondary-button ui-action-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button ui-action-button" type="submit">${icon("save")}<span>${isEdit ? "Сохранить слот" : "Создать слот"}</span></button>
          </div>
        </form>
      `,
      })}
    </div>
  `;
}

function renderSplitModal() {
  return "";
}

function bindEvents(scaleInfo, rows, rowLayout) {
  const shell = app.querySelector("[data-gantt-shell]");
  let lastScrollLeft = shell?.scrollLeft || 0;
  const markUserScrollIntent = () => {
    if (shell) shell.dataset.ganttUserScrollIntent = "1";
  };
  shell?.addEventListener("pointerdown", markUserScrollIntent);
  shell?.addEventListener("touchstart", markUserScrollIntent, { passive: true });
  shell?.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) markUserScrollIntent();
  });
  shell?.addEventListener("scroll", () => {
    const horizontalChanged = Math.abs(shell.scrollLeft - lastScrollLeft) > 0.5;
    lastScrollLeft = shell.scrollLeft;
    ui.scrollLeft = shell.scrollLeft;
    ui.scrollTop = shell.scrollTop;
    updateDependencyClip(shell);
    if (ganttScrollRestoreInProgress || shell.dataset.ganttUserScrollIntent !== "1" || !horizontalChanged) return;
    if (prependTimelineIfNeeded(shell, scaleInfo)) return;
    extendTimelineIfNeeded(shell, scaleInfo);
  }, { passive: true });
  shell?.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) > 1 || (event.shiftKey && Math.abs(event.deltaY) > 1)) markUserScrollIntent();
    const horizontalBack = event.deltaX < -1;
    const shiftedVerticalBack = event.shiftKey && event.deltaY < -1;
    if (!horizontalBack && !shiftedVerticalBack) return;
    if (shell.scrollLeft > Math.max(4, scaleInfo.cellWidth * 0.2)) return;
    if (!prependTimelineIfNeeded(shell, scaleInfo, { force: true })) return;
    event.preventDefault();
  }, { passive: false });

  app.querySelector("#periodStart")?.addEventListener("change", (event) => {
    ui.windowStart = event.target.value;
    ui.scrollLeft = 0;
    ui.scrollTop = 0;
    render({ skipRememberScroll: true });
  });

  app.querySelectorAll("[data-scale]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.scale = button.dataset.scale;
      ui.ganttZoom = ui.scale === "hours" ? Math.max(normalizeGanttZoom(ui.ganttZoom), 1.5) : normalizeGanttZoom(ui.ganttZoom);
      render();
    });
  });

  app.querySelectorAll("[data-gantt-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      setGanttZoom(button.dataset.ganttZoom);
    });
  });

  app.querySelectorAll("[data-slot-content-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.ganttSlotContent = normalizeGanttSlotContent(button.dataset.slotContentMode);
      persistUiState();
      render();
    });
  });

  app.querySelector("#todayButton")?.addEventListener("click", () => {
    ui.windowStart = toDateInput(startOfDay(ui.now));
    ui.scrollLeft = 0;
    ui.scrollTop = 0;
    render({ skipRememberScroll: true });
  });

  app.querySelector("#dependencyEditButton")?.addEventListener("click", () => {
    toggleGanttDependencyEditMode();
  });

  app.querySelector("#refreshButton")?.addEventListener("click", () => {
    const rescheduledCount = rescheduleAllGanttSlotsByCurrentCalendars();
    if (rescheduledCount) {
      persistState();
      notifySaveSuccess(`Гант перестроен по графикам отделов: ${rescheduledCount}`);
    }
    render();
  });

  app.querySelector("#optimizePlanButton")?.addEventListener("click", () => {
    const items = getGanttOptimizationWorkOrders();
    ui.ganttOptimizationDialog = {
      selectedKeys: items.filter((item) => item.movableCount).map((item) => item.key),
    };
    render();
  });

  app.querySelectorAll("[data-gantt-optimize-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.ganttOptimizeSelect;
      const checkboxes = [...app.querySelectorAll("input[name='workOrderKey']")];
      checkboxes.forEach((checkbox) => {
        if (checkbox.disabled) return;
        checkbox.checked = mode === "all";
      });
    });
  });

  app.querySelector("#ganttOptimizationForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedKeys = [...event.currentTarget.querySelectorAll("input[name='workOrderKey']:checked")]
      .map((input) => input.value)
      .filter(Boolean);
    if (!selectedKeys.length) {
      notifySaveSuccess("Выберите хотя бы один заказ-наряд");
      return;
    }

    const result = compactVisibleGanttChains({ workOrderKeys: selectedKeys });
    ui.ganttOptimizationDialog = null;
    if (result.changed) {
      persistState();
      notifySaveSuccess(`Цепочки уплотнены: ${result.changed} из ${result.considered}`);
    } else {
      notifySaveSuccess(result.considered ? "Цепочки уже уплотнены" : "Нет доступных операций для уплотнения");
    }
    render();
  });

  app.querySelector("[data-toggle-all-projects]")?.addEventListener("click", () => {
    const routes = getVisibleGanttRoutes();
    const shouldExpand = !areAllVisibleProjectsExpanded();
    routes.forEach((route) => {
      const productionId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || "";
      if (shouldExpand) {
        ui.expandedProjects.add(route.id);
      } else {
        ui.expandedProjects.delete(route.id);
        ui.expandedProjects.delete(productionId);
      }
    });
    persistUiState();
    render();
  });

  app.querySelector("[data-toggle-gantt-quantity]")?.addEventListener("click", () => {
    ui.ganttShowQuantity = !ui.ganttShowQuantity;
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-toggle-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.toggleProject;
      const route = (planningState.routes || []).find((item) => item.id === id);
      if (route) {
        const productionId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || "";
        if (isGanttRouteExpanded(route)) {
          ui.expandedProjects.delete(route.id);
          ui.expandedProjects.delete(productionId);
        } else {
          ui.expandedProjects.add(route.id);
        }
      } else if (ui.expandedProjects.has(id)) {
        ui.expandedProjects.delete(id);
      } else {
        ui.expandedProjects.add(id);
      }
      render();
    });
  });

  app.querySelectorAll("[data-lane-row-id]").forEach((lane) => {
    lane.addEventListener("click", (event) => {
      if (event.target.closest(".operation-slot")) return;
      event.stopPropagation();
    });
  });

  app.querySelectorAll("[data-slot-quantity]").forEach((input) => {
    ["click", "dblclick", "pointerdown"].forEach((eventName) => {
      input.addEventListener(eventName, (event) => event.stopPropagation());
    });

    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Enter") return;
      event.preventDefault();
      updateSlotQuantity(input.dataset.slotQuantity, input.value);
    });

    input.addEventListener("change", () => {
      updateSlotQuantity(input.dataset.slotQuantity, input.value);
    });
  });

  app.querySelectorAll(".operation-slot").forEach((slotElement) => {
    const slotId = slotElement.dataset.slotId;

    slotElement.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    slotElement.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      if (shouldSuppressGanttSlotClick(slotId)) return;
      ui.selectedSlotId = null;
      ui.editor = { mode: "edit", slotId };
      render();
    });

    slotElement.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".resize-handle")) return;
      beginDrag(event, slotId, "move", rows, rowLayout, scaleInfo);
    });
  });

  app.querySelectorAll("[data-resize-slot]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      beginDrag(event, handle.dataset.resizeSlot, "resize", rows, rowLayout, scaleInfo);
    });
  });

  app.querySelectorAll("[data-dependency-edit-route]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      beginGanttDependencyRouteDrag(event, handle);
    });
  });

  app.querySelectorAll("[data-focus-warning]").forEach((button) => {
    button.addEventListener("click", () => focusSlot(button.dataset.focusWarning));
  });

  app.querySelectorAll("[data-focus-slot]").forEach((button) => {
    button.addEventListener("click", () => focusSlot(button.dataset.focusSlot));
  });

  app.querySelector("[data-close-drawer]")?.addEventListener("click", () => {
    ui.selectedSlotId = null;
    render();
  });

  app.querySelectorAll("[data-edit-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.selectedSlotId = null;
      ui.editor = { mode: "edit", slotId: button.dataset.editSlot };
      render();
    });
  });

  app.querySelectorAll("[data-cycle-status]").forEach((button) => {
    button.addEventListener("click", () => {
      cycleSlotStatus(button.dataset.cycleStatus);
    });
  });

  app.querySelectorAll("[data-delete-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("deleteSlot", { slotId: button.dataset.deleteSlot });
    });
  });

  app.querySelectorAll("[data-find-window-slot]").forEach((button) => {
    button.addEventListener("click", () => moveSlotToNearestWindow(button.dataset.findWindowSlot));
  });

  app.querySelectorAll("[data-cascade-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("cascadeSlot", { slotId: button.dataset.cascadeSlot });
    });
  });

  app.querySelectorAll("[data-toggle-lock-slot]").forEach((button) => {
    button.addEventListener("click", () => toggleSlotLock(button.dataset.toggleLockSlot));
  });

  app.querySelectorAll("[data-open-planning-for-project]").forEach((button) => {
    button.addEventListener("click", () => {
      openPlanningForProject(button.dataset.openPlanningForProject || "");
    });
  });

  app.querySelectorAll("[data-open-planning-module]").forEach((button) => {
    button.addEventListener("click", () => {
      openPlanningForProject(ui.activeProjectId || "");
    });
  });

  app.querySelectorAll("[data-fix-warning]").forEach((button) => {
    button.addEventListener("click", () => autoFixWarning(button.dataset.fixWarning));
  });

  app.querySelectorAll("[data-fix-all-warnings]").forEach((button) => {
    button.addEventListener("click", () => openConfirmDialog("fixAllWarnings"));
  });

  app.querySelectorAll("[data-focus-order]").forEach((button) => {
    button.addEventListener("click", () => focusProject(button.dataset.focusOrder));
  });

  app.querySelector("[data-auto-cascade]")?.addEventListener("change", (event) => {
    ui.autoCascade = event.target.checked;
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-save-plan-snapshot]").forEach((button) => {
    button.addEventListener("click", () => savePlanSnapshot());
  });

  app.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      closeModals();
    });
  });

  bindSlotForm();
  bindSplitForm();
}

function bindSlotForm() {
  const form = app.querySelector("#slotForm");
  if (!form) return;

  const routeStepField = form.querySelector("#routeStepField");
  const workCenterField = form.querySelector("#workCenterField");
  const planningLineField = form.querySelector("#planningLineField");
  const operationField = form.querySelector("#operationField");
  const quantityField = form.querySelector("[name='quantity']");
  const planningOrderField = form.querySelector("[name='planningOrderId']");
  const plannedStartField = form.querySelector("[name='plannedStart']");
  const plannedEndField = form.querySelector("[name='plannedEnd']");
  const editedSlot = ui.editor?.mode === "edit"
    ? planningState.slots.find((slot) => slot.id === ui.editor.slotId)
    : null;

  const getSelectedRouteStep = () => planningState.routeSteps.find((step) => step.id === routeStepField?.value) || null;
  const getSelectedQuantity = () => {
    const planningOrder = getBatch(planningOrderField?.value);
    return normalizeQuantity(quantityField?.value, editedSlot?.quantity || planningOrder?.quantity || 1);
  };

  const getSelectedPlanningAssignment = (selectedStep, quantity, readyAt) => {
    if (!selectedStep) return null;
    const selectedPlanningWorkCenterId = planningLineField?.value || "";
    return getRouteStepPlanningAssignmentForSlot(selectedStep, editedSlot || {}, {
      state: planningState,
      quantity,
      readyAt,
      ignoreSlotId: editedSlot?.id || null,
      workCenterId: selectedPlanningWorkCenterId || editedSlot?.workCenterId || "",
    });
  };

  const syncPlanningLineOptions = (selectedStep) => {
    if (!planningLineField || !selectedStep) return;
    const currentValue = planningLineField.value || "";
    const options = getRouteStepPlanningLineOptions(selectedStep);
    const fallbackValue = getRouteStepSelectedPlanningWorkCenterId(selectedStep, planningState, {
      currentWorkCenterId: editedSlot?.workCenterId || "",
    });
    planningLineField.innerHTML = options.map((option) => (
      `<option value="${escapeAttribute(option.value)}" ${option.disabled ? "disabled" : ""}>${escapeHtml(option.label)}${option.meta ? ` · ${escapeHtml(option.meta)}` : ""}</option>`
    )).join("");
    planningLineField.disabled = options.length <= 1;
    planningLineField.required = routeStepRequiresManualPlanningLine(selectedStep, planningState);
    planningLineField.value = options.some((option) => option.value === currentValue)
      ? currentValue
      : fallbackValue;
  };

  const syncPlannedEndField = () => {
    if (!plannedStartField?.value || !plannedEndField) return;
    const selectedStep = getSelectedRouteStep();
    if (!selectedStep) return;
    const planningOrder = getBatch(planningOrderField?.value);
    const planningOrderId = planningOrder?.id || editedSlot?.planningOrderId || editedSlot?.routeId || selectedStep.routeId || "";
    const quantity = getSelectedQuantity();
    const assignment = getSelectedPlanningAssignment(selectedStep, quantity, cleanDateTime(plannedStartField.value));
    const planningWorkCenterId = assignment?.workCenterId || planningLineField?.value || selectedStep.workCenterId || workCenterField?.value || "";
    const resourceId = assignment?.resourceId || getPlanningResourceForRouteStep(selectedStep, planningWorkCenterId, selectedStep.resourceId || editedSlot?.resourceId || "");
	    if (routeStepRequiresManualPlanningLine(selectedStep, planningState) && !planningLineField?.value) return;
	    const plannedStart = assignment?.window?.start || snapToWorkingTime(planningWorkCenterId, cleanDateTime(plannedStartField.value), planningState);
	    const slotContext = getSlotEffectiveOperationContext({
	      ...(editedSlot || {}),
	      routeId: planningOrderId,
	      planningOrderId,
	      routeStepId: selectedStep.id,
	      routeWorkCenterId: selectedStep.workCenterId,
	      workCenterId: planningWorkCenterId,
	      resourceId,
	    }, planningState);
	    const plannedEnd = calculatePlannedEndByQuantity(
	      plannedStart,
	      planningWorkCenterId,
	      quantity,
	      selectedStep.unitsPerHour || editedSlot?.unitsPerHour || null,
	      slotContext.boardsPerPanel || null,
	      slotContext,
	    );
    plannedEndField.value = isoLocal(plannedEnd);
  };

  routeStepField?.addEventListener("change", () => {
    const option = routeStepField.selectedOptions[0];
    if (option?.dataset.workCenter && workCenterField) {
      workCenterField.value = option.dataset.workCenter;
      const display = workCenterField.parentElement?.querySelector("input[type='text']");
      if (display) display.value = getWorkCenter(option.dataset.workCenter)?.name || "отдел не выбран";
    }
    if (option?.dataset.operation && operationField) operationField.value = option.dataset.operation;
    syncPlanningLineOptions(getSelectedRouteStep());
    syncPlannedEndField();
  });

  [workCenterField, planningLineField, quantityField, planningOrderField, plannedStartField].forEach((field) => {
    field?.addEventListener("change", syncPlannedEndField);
    field?.addEventListener("input", syncPlannedEndField);
  });
  syncPlanningLineOptions(getSelectedRouteStep());
  syncPlannedEndField();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const stamp = new Date().toISOString();
    const slotId = data.get("slotId");
    const currentSlot = slotId ? planningState.slots.find((slot) => slot.id === slotId) : null;
    const planningOrderFieldValue = String(data.get("planningOrderId") || "");
    const selectedPlanningOrder = getBatch(planningOrderFieldValue);
    const quantity = normalizeQuantity(
      data.has("quantity") ? data.get("quantity") : currentSlot?.quantity,
      currentSlot?.quantity || selectedPlanningOrder?.quantity || 1,
    );
    const selectedRouteStep = planningState.routeSteps.find((step) => step.id === data.get("routeStepId"));
    if (!selectedRouteStep || !getOperationMapItem(selectedRouteStep.operationId)) {
      alert("Выберите операцию маршрута из справочника операций.");
      return;
    }
    const selectedPlanningWorkCenterId = String(data.get("planningWorkCenterId") || planningLineField?.value || "").trim();
	    if (routeStepRequiresManualPlanningLine(selectedRouteStep, planningState) && !selectedPlanningWorkCenterId) {
	      alert("Выберите линию планирования для SMT-операции.");
	      return;
	    }
	    const selectedPlanningRouteId = selectedPlanningOrder?.routeId || selectedPlanningOrder?.id || planningOrderFieldValue;
	    const selectedRoute = (planningState.routes || []).find((route) => route.id === selectedPlanningRouteId)
        || getRouteForStep(selectedRouteStep);
		    const productionId = getRouteProductionId(selectedRoute) || getRoutePlanningContext(selectedRoute)?.id || String(data.get("productionId") || currentSlot?.specificationId || currentSlot?.projectId || "");
	    const assignment = getRouteStepPlanningAssignmentForSlot(selectedRouteStep, currentSlot || {}, {
	      state: planningState,
      quantity,
      readyAt: cleanDateTime(data.get("plannedStart")),
      ignoreSlotId: slotId || null,
      workCenterId: selectedPlanningWorkCenterId || currentSlot?.workCenterId || "",
    });
    const planningWorkCenterId = assignment?.workCenterId || selectedPlanningWorkCenterId || currentSlot?.workCenterId || selectedRouteStep.workCenterId;
    const resourceId = assignment?.resourceId || getPlanningResourceForRouteStep(
      selectedRouteStep,
      planningWorkCenterId,
      currentSlot?.resourceId || selectedRouteStep.resourceId || "",
	    );
	    const plannedStart = toSlotDateTime(assignment?.window?.start || snapToWorkingTime(planningWorkCenterId, cleanDateTime(data.get("plannedStart")), planningState));
	    const unitsPerHour = Number(selectedRouteStep?.unitsPerHour || currentSlot?.unitsPerHour || 0);
		    const slotContext = getSlotEffectiveOperationContext({
		      ...(currentSlot || {}),
		      routeId: selectedRoute?.id || currentSlot?.routeId || selectedRouteStep.routeId || "",
		      planningOrderId: selectedRoute?.id || currentSlot?.planningOrderId || currentSlot?.routeId || planningOrderFieldValue,
		      routeStepId: selectedRouteStep.id,
	      routeWorkCenterId: selectedRouteStep.workCenterId,
	      workCenterId: planningWorkCenterId,
	      resourceId,
	    }, planningState);
		    const boardsPerPanel = normalizeBoardsPerPanel(slotContext.boardsPerPanel, 1);
		    const plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(plannedStart, planningWorkCenterId, quantity, planningState, unitsPerHour || null, boardsPerPanel, slotContext));
		    const operationFlow = getRouteStepFlowModel(selectedRoute, selectedRouteStep);

			    const slotData = {
		      routeId: selectedRoute?.id || currentSlot?.routeId || selectedRouteStep.routeId || "",
		      specificationId: productionId,
		      planningOrderId: selectedRoute?.id || currentSlot?.planningOrderId || currentSlot?.routeId || planningOrderFieldValue,
	      routeWorkCenterId: selectedRouteStep.workCenterId,
      workCenterId: planningWorkCenterId,
      routeStepId: data.get("routeStepId"),
      operationId: selectedRouteStep.operationId || "",
      operationName: selectedRouteStep.operationName || "",
      quantity,
      unitsPerHour: unitsPerHour || undefined,
      boardsPerPanel,
	      resourceId,
	      calculationType: selectedRouteStep?.calculationType || getDefaultOperationCalculationType(planningWorkCenterId, slotContext) || currentSlot?.calculationType || "",
	      fulfillmentMode: slotContext.fulfillmentMode || selectedRouteStep.fulfillmentMode || currentSlot?.fulfillmentMode || "produce",
	      secondsPerPanel: selectedRouteStep?.secondsPerPanel || currentSlot?.secondsPerPanel || 0,
	      setupMin: selectedRouteStep?.setupMin || currentSlot?.setupMin || 0,
	      bomListId: slotContext.bomListId || currentSlot?.bomListId || "",
	      operationInputs: operationFlow.inputs,
	      operationOutputs: operationFlow.outputs,
	      operationInputLabel: operationFlow.inputLabel,
	      operationOutputLabel: operationFlow.outputLabel,
	      plannedStart,
      plannedEnd,
      actualStart: cleanOptionalDateTime(data.get("actualStart")),
      actualEnd: cleanOptionalDateTime(data.get("actualEnd")),
      status: data.get("status"),
      comment: String(data.get("comment") || "").trim(),
      updatedAt: stamp,
    };

    if (toDate(slotData.plannedEnd) <= toDate(slotData.plannedStart)) {
      alert("Плановое окончание должно быть позже начала.");
      return;
    }

    if (slotId && String(slotData.routeId || "") && String(slotData.routeStepId || "")) {
      const serverSchedule = await changePlanningSlotSchedule(slotData.routeId, slotData.routeStepId, slotData.plannedStart);
      if (serverSchedule.applied) {
        ui.selectedSlotId = slotId;
        ui.editor = null;
        notifySaveSuccess("Срок слота сохранён на сервере");
        render();
        return;
      }
      if (serverSchedule.kind === "conflict") return;
    }

    if (slotId) {
      planningState.slots = planningState.slots.map((slot) => (
        slot.id === slotId ? { ...slot, ...slotData } : slot
      ));
      ui.selectedSlotId = slotId;
      cascadeIfEnabled(slotId);
    } else {
      const newSlot = {
        id: makeId("s"),
        ...slotData,
        createdAt: stamp,
      };
      planningState.slots = [...planningState.slots, newSlot];
      ui.selectedSlotId = newSlot.id;
      cascadeIfEnabled(newSlot.id);
    }

    ui.editor = null;
    persistState();
    notifySaveSuccess(slotId ? "Слот сохранен" : "Слот создан");
    render();
  });
}

function bindSplitForm() {
  ui.splitSlotId = null;
}

function toggleGanttDependencyEditMode() {
  if (ui.ganttDependencyEditMode) {
    ui.ganttDependencyRoutes = normalizeGanttDependencyRouteStore(ui.ganttDependencyRouteDrafts || ui.ganttDependencyRoutes);
    ui.ganttDependencyRouteDrafts = null;
    ui.ganttDependencyEditMode = false;
    ui.ganttDependencyDrag = null;
    persistUiState();
    notifySaveSuccess("Маршруты стрелок сохранены");
    render();
    return;
  }

  ui.ganttDependencyRouteDrafts = cloneGanttDependencyRouteStore(ui.ganttDependencyRoutes);
  ui.ganttDependencyEditMode = true;
  ui.ganttDependencyDrag = null;
  render();
}

function beginGanttDependencyRouteDrag(event, element) {
  if (!ui.ganttDependencyEditMode || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const routeKey = element.dataset.dependencyEditRoute || "";
  const orientation = element.dataset.dependencyOrientation || "";
  const startIndex = Number(element.dataset.dependencyStartIndex);
  const endIndex = Number(element.dataset.dependencyEndIndex);
  if (!routeKey || !Number.isInteger(startIndex) || !Number.isInteger(endIndex)) return;

  ui.ganttDependencyRouteDrafts = cloneGanttDependencyRouteStore(ui.ganttDependencyRouteDrafts || ui.ganttDependencyRoutes);
  ui.ganttDependencyDrag = {
    endBaseX: Number(element.dataset.dependencyEndBaseX),
    endBaseY: Number(element.dataset.dependencyEndBaseY),
    endCurrentX: Number(element.dataset.dependencyEndCurrentX),
    endCurrentY: Number(element.dataset.dependencyEndCurrentY),
    endIndex,
    orientation,
    routeKey,
    startBaseX: Number(element.dataset.dependencyStartBaseX),
    startBaseY: Number(element.dataset.dependencyStartBaseY),
    startClientX: event.clientX,
    startClientY: event.clientY,
    startCurrentX: Number(element.dataset.dependencyStartCurrentX),
    startCurrentY: Number(element.dataset.dependencyStartCurrentY),
    startIndex,
  };

  document.body.classList.add("is-manipulating");

  const onMove = (moveEvent) => {
    if (!ui.ganttDependencyDrag) return;
    moveEvent.preventDefault();
    updateGanttDependencyRouteDraft(moveEvent);
    render();
  };

  const onUp = () => {
    document.body.classList.remove("is-manipulating");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    ui.ganttDependencyDrag = null;
    render();
  };

  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
}

function updateGanttDependencyRouteDraft(event) {
  const drag = ui.ganttDependencyDrag;
  if (!drag) return;

  const dx = event.clientX - drag.startClientX;
  const dy = event.clientY - drag.startClientY;
  const nextStart = {
    x: drag.startCurrentX,
    y: drag.startCurrentY,
  };
  const nextEnd = {
    x: drag.endCurrentX,
    y: drag.endCurrentY,
  };

  if (drag.orientation === "horizontal") {
    nextStart.y += dy;
    nextEnd.y += dy;
  } else {
    nextStart.x += dx;
    nextEnd.x += dx;
  }

  setGanttDependencyDraftOffset(drag.routeKey, drag.startIndex, {
    x: nextStart.x - drag.startBaseX,
    y: nextStart.y - drag.startBaseY,
  });
  setGanttDependencyDraftOffset(drag.routeKey, drag.endIndex, {
    x: nextEnd.x - drag.endBaseX,
    y: nextEnd.y - drag.endBaseY,
  });
}

function setGanttDependencyDraftOffset(routeKey, pointIndex, offset) {
  if (!ui.ganttDependencyRouteDrafts) ui.ganttDependencyRouteDrafts = {};
  const route = ui.ganttDependencyRouteDrafts[routeKey] || { version: GANTT_DEPENDENCY_ROUTE_VERSION, offsets: {} };
  route.version = GANTT_DEPENDENCY_ROUTE_VERSION;
  const normalizedOffset = {
    x: round(offset.x),
    y: round(offset.y),
  };

  if (Math.abs(normalizedOffset.x) < 0.1 && Math.abs(normalizedOffset.y) < 0.1) {
    delete route.offsets[String(pointIndex)];
  } else {
    route.offsets[String(pointIndex)] = normalizedOffset;
  }

  if (Object.keys(route.offsets).length) {
    ui.ganttDependencyRouteDrafts[routeKey] = route;
  } else {
    delete ui.ganttDependencyRouteDrafts[routeKey];
  }
}

function beginDrag(event, slotId, mode, rows, rowLayout, scaleInfo) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  if (slot.locked || isGanttSlotCompleted(slot)) {
    return;
  }

  const shell = app.querySelector("[data-gantt-shell]");
  const shellRect = shell.getBoundingClientRect();
  const route = getSlotRoute(slot);

  ui.drag = {
    mode,
    slotId,
    snapMs: getGanttSnapMs(),
    startClientX: event.clientX,
    startClientY: event.clientY,
    originalStart: toDate(slot.plannedStart),
    originalEnd: toDate(slot.plannedEnd),
    originalWorkCenterId: slot.workCenterId,
    productionId: getSlotProductionContextId(slot),
    routeId: route?.id || "",
    targetRowId: getVisibleSlotRowId(slot),
    moved: false,
    shellTop: shellRect.top,
    scrollTop: shell.scrollTop,
  };

  document.body.classList.add("is-manipulating");

  const onMove = (moveEvent) => {
    if (!ui.drag) return;
    moveEvent.preventDefault();
    ui.drag = {
      ...ui.drag,
      moved: true,
    };

    const dx = moveEvent.clientX - ui.drag.startClientX;
    const snapMs = ui.drag.snapMs || getGanttSnapMs();
    const msDelta = Math.round(dx / scaleInfo.cellWidth * scaleInfo.unitMs / snapMs) * snapMs;
    const targetSlot = planningState.slots.find((item) => item.id === slotId);
    if (!targetSlot) {
      return;
    }

    if (mode === "resize") {
      const minEnd = addMs(ui.drag.originalStart, snapMs);
      const rawEnd = new Date(ui.drag.originalEnd.getTime() + msDelta);
      const newEnd = new Date(Math.max(minEnd.getTime(), snapDate(rawEnd, snapMs).getTime()));
      const nextQuantity = calculateQuantityByDuration(targetSlot.workCenterId, targetSlot.plannedStart, newEnd, targetSlot);
      targetSlot.quantity = nextQuantity;
      applyRecalculatedSlotTiming(targetSlot, planningState);
      targetSlot.updatedAt = new Date().toISOString();
    } else {
      const rawStart = snapDate(addMs(ui.drag.originalStart, msDelta), snapMs);

      const targetRow = rowFromPointer(moveEvent, rows, rowLayout);
      if (["operation", "workCenter", "resource"].includes(targetRow?.type) && targetRow.routeId === ui.drag.routeId) {
        applyGanttRowToSlot(targetSlot, targetRow);
        ui.drag = {
          ...ui.drag,
          targetRowId: targetRow.id,
        };
      }

      const newStart = snapToWorkingTime(targetSlot.workCenterId, rawStart, planningState);
      targetSlot.plannedStart = toSlotDateTime(newStart);
      applyRecalculatedSlotTiming(targetSlot, planningState);
      targetSlot.updatedAt = new Date().toISOString();
    }

    render();
  };

  const onUp = () => {
    document.body.classList.remove("is-manipulating");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    const moved = ui.drag?.moved;
    ui.drag = null;
    if (moved) {
      suppressNextGanttSlotClick(slotId);
      cascadeIfEnabled(slotId);
      persistState();
      notifySaveSuccess("Операция Ганта сохранена");
      render();
    }
    setTimeout(() => {
      if (moved) ui.drag = null;
    }, 0);
  };

  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
}

function suppressNextGanttSlotClick(slotId) {
  suppressedGanttSlotClick = {
    slotId,
    expiresAt: Date.now() + 500,
  };
}

function shouldSuppressGanttSlotClick(slotId) {
  if (!suppressedGanttSlotClick) return false;
  if (Date.now() > suppressedGanttSlotClick.expiresAt) {
    suppressedGanttSlotClick = null;
    return false;
  }
  if (suppressedGanttSlotClick.slotId !== slotId) return false;
  suppressedGanttSlotClick = null;
  return true;
}

function rowFromPointer(event, rows, rowLayout) {
  const shell = app.querySelector("[data-gantt-shell]");
  if (!shell) return null;
  const rect = shell.getBoundingClientRect();
  const y = event.clientY - rect.top + shell.scrollTop - TIMELINE_HEIGHT;

  return rows.find((row) => {
    const layout = rowLayout.map[row.id];
    return y >= layout.top && y <= layout.top + layout.height;
  });
}

function placeSlotInNearestWindow(slot, earliestOverride = null) {
  if (!slot || slot.locked || isGanttSlotCompleted(slot)) return;

  const previous = getRouteNeighbor(slot, -1);
  const routeEarliest = previous ? addMs(previous.plannedEnd, getRouteBufferMs()) : toDate(slot.plannedStart);
  const dependencyEarliest = getEarliestRouteStart(
    getSlotProductionContextId(slot),
    getSlotPlanningOrderId(slot, getSlotRouteId(slot, planningState)),
    slot.routeStepId,
  );
  const earliestStart = new Date(Math.max(
    toDate(earliestOverride || slot.plannedStart).getTime(),
    toDate(routeEarliest).getTime(),
    toDate(dependencyEarliest).getTime(),
  ));
  const durationMs = getSlotRequiredDurationMs(slot, planningState);
  const window = findFreeWindow(slot.workCenterId, durationMs, earliestStart, slot.id, slot.resourceId || "");

  slot.plannedStart = toSlotDateTime(window.start);
  slot.plannedEnd = toSlotDateTime(window.end);
  const effectiveContext = getSlotEffectiveOperationContext(slot, planningState);
  slot.bomListId = effectiveContext.bomListId || slot.bomListId || "";
  slot.boardsPerPanel = effectiveContext.boardsPerPanel;
  slot.updatedAt = new Date().toISOString();
  cascadeIfEnabled(slot.id);
  return true;
}

function moveSlotToNearestWindow(slotId, earliestOverride = null) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!placeSlotInNearestWindow(slot, earliestOverride)) return;
  persistState();
  notifySaveSuccess("Операция перемещена в свободное окно");
  render();
}

function toggleSlotLock(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  slot.locked = !slot.locked;
  slot.updatedAt = new Date().toISOString();
  persistState();
  notifySaveSuccess(slot.locked ? "Операция заблокирована" : "Операция разблокирована");
  render();
}

function autoFixAllWarnings() {
  let fixed = 0;
  let guard = 0;

  while (guard < 120) {
    guard += 1;
    const warning = getSlotWarnings(planningState).warnings
      .sort((left, right) => (left.severity === "critical" ? -1 : 1) - (right.severity === "critical" ? -1 : 1))[0];
    if (!warning) break;
    if (!applyWarningFixInPlace(warning)) break;
    fixed += 1;
  }

  if (fixed) {
    persistState();
    notifySaveSuccess(`Исправления плана сохранены: ${fixed}`);
    render();
    return;
  }

  const firstWarning = getSlotWarnings(planningState).warnings[0];
  focusSlot(firstWarning?.slotIds?.[0] || "");
}

function applyWarningFixInPlace(warning) {
  if (!warning) return false;
  const slots = (warning.slotIds || [])
    .map((slotId) => planningState.slots.find((slot) => slot.id === slotId))
    .filter(Boolean);
  const stamp = new Date().toISOString();

  if (warning.type === "capacity" && slots.length >= 2) {
    const ordered = [...slots].sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart));
    const target = ordered[ordered.length - 1];
    const blocker = ordered[ordered.length - 2];
    if (!target || !blocker) return false;
    return Boolean(placeSlotInNearestWindow(target, addMs(blocker.plannedEnd, getRouteBufferMs())));
  }

  if (warning.type === "route" && warning.id.startsWith("sequence-") && slots.length >= 2) {
    const previous = slots[0];
    const current = slots[1];
    return Boolean(placeSlotInNearestWindow(current, addMs(previous.plannedEnd, getRouteBufferMs())));
  }

  if (warning.type === "route" && warning.id.startsWith("wrong-workcenter-") && slots[0]) {
    const slot = slots[0];
    if (slot.locked || isGanttSlotCompleted(slot)) return false;
    const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
    if (!step) return false;
    const assignment = getRouteStepPlanningAssignmentForSlot(step, slot, {
      state: planningState,
      quantity: slot.quantity || 1,
      readyAt: slot.plannedStart || null,
      ignoreSlotId: slot.id || null,
    });
	    slot.routeWorkCenterId = step.workCenterId;
	    if (!assignment && routeStepRequiresManualPlanningLine(step, planningState)) return false;
	    slot.workCenterId = assignment?.workCenterId || slot.workCenterId || step.workCenterId;
	    slot.resourceId = assignment?.resourceId || getPlanningResourceForRouteStep(step, slot.workCenterId, slot.resourceId || step.resourceId || "");
	    applyRecalculatedSlotTiming(slot, planningState);
	    slot.updatedAt = stamp;
	    return Boolean(placeSlotInNearestWindow(slot, slot.plannedStart));
  }

  if (warning.type === "quantity" && slots[0]) {
    const slot = slots[0];
    if (slot.locked || isGanttSlotCompleted(slot)) return false;
	    const previous = getRouteNeighbor(slot, -1);
	    if (!previous) return false;
	    slot.quantity = Math.min(normalizeQuantity(slot.quantity), normalizeQuantity(previous.quantity));
		    applyRecalculatedSlotTiming(slot, planningState);
	    slot.updatedAt = stamp;
	    cascadeIfEnabled(slot.id);
    return true;
  }

	  if (warning.type === "duration" && slots[0]) {
	    const slot = slots[0];
	    if (slot.locked || isGanttSlotCompleted(slot)) return false;
		    applyRecalculatedSlotTiming(slot, planningState);
	    slot.updatedAt = stamp;
	    cascadeIfEnabled(slot.id);
    return true;
  }

  if (warning.type === "route") {
    return false;
  }

  return false;
}

function autoFixWarning(warningId) {
  const warning = getSlotWarnings(planningState).warnings.find((item) => item.id === warningId);
  if (!warning) return;

  const slots = (warning.slotIds || [])
    .map((slotId) => planningState.slots.find((slot) => slot.id === slotId))
    .filter(Boolean);
  const stamp = new Date().toISOString();

  if (warning.type === "capacity" && slots.length >= 2) {
    const ordered = [...slots].sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart));
    const target = ordered[ordered.length - 1];
    const blocker = ordered[ordered.length - 2];
    moveSlotToNearestWindow(target.id, addMs(blocker.plannedEnd, getRouteBufferMs()));
    return;
  }

  if (warning.type === "route" && slots.length >= 2 && warning.id.startsWith("sequence-")) {
    const previous = slots[0];
    const current = slots[1];
    moveSlotToNearestWindow(current.id, addMs(previous.plannedEnd, getRouteBufferMs()));
    return;
  }

  if (warning.type === "route" && warning.id.startsWith("wrong-workcenter-") && slots[0]) {
    const slot = slots[0];
    if (slot.locked) return;
    const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
    if (!step) return;
    const assignment = getRouteStepPlanningAssignmentForSlot(step, slot, {
      state: planningState,
      quantity: slot.quantity || 1,
      readyAt: slot.plannedStart || null,
      ignoreSlotId: slot.id || null,
    });
	    slot.routeWorkCenterId = step.workCenterId;
    if (!assignment && routeStepRequiresManualPlanningLine(step, planningState)) {
	      openPlanningForProject(getSlotProductionContextId(slot));
	      return;
	    }
	    slot.workCenterId = assignment?.workCenterId || slot.workCenterId || step.workCenterId;
	    slot.resourceId = assignment?.resourceId || getPlanningResourceForRouteStep(step, slot.workCenterId, slot.resourceId || step.resourceId || "");
	    applyRecalculatedSlotTiming(slot, planningState);
	    slot.updatedAt = stamp;
	    moveSlotToNearestWindow(slot.id, slot.plannedStart);
    return;
  }

  if (warning.type === "quantity" && slots[0]) {
    const slot = slots[0];
    if (slot.locked) return;
	    const previous = getRouteNeighbor(slot, -1);
	    if (!previous) return;
	    slot.quantity = Math.min(normalizeQuantity(slot.quantity), normalizeQuantity(previous.quantity));
		    applyRecalculatedSlotTiming(slot, planningState);
	    slot.updatedAt = stamp;
	    cascadeIfEnabled(slot.id);
    persistState();
    render();
    return;
  }

	  if (warning.type === "duration" && slots[0]) {
	    const slot = slots[0];
	    if (slot.locked) return;
		    applyRecalculatedSlotTiming(slot, planningState);
	    slot.updatedAt = stamp;
	    cascadeIfEnabled(slot.id);
    persistState();
    render();
    return;
  }

  if (warning.type === "route" && slots[0]) {
    openPlanningForProject(getSlotProductionContextId(slots[0]));
    return;
  }

  focusSlot(slots[0]?.id || "");
}

function savePlanSnapshot() {
  const key = "mes-planning-prototype-plan-snapshots-v1";
  const snapshots = JSON.parse(localStorage.getItem(key) || "[]");
  snapshots.unshift({
    id: makeId("snap"),
    createdAt: new Date().toISOString(),
    specifications: (directoryState.specifications || []).length,
    routes: planningState.routes.length,
    slots: planningState.slots.length,
    state: planningState,
  });
  localStorage.setItem(key, JSON.stringify(snapshots.slice(0, 8)));
  notifySaveSuccess("Снимок плана сохранен");
}

function updateSlotQuantity(slotId, value) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  if (slot.locked) return;

	  const quantity = normalizeQuantity(value, slot.quantity);
	  slot.quantity = quantity;
		  applyRecalculatedSlotTiming(slot, planningState);
	  slot.updatedAt = new Date().toISOString();
  cascadeIfEnabled(slotId);
  persistState();
  notifySaveSuccess("Количество операции сохранено");
  render();
}

function cycleSlotStatus(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  const index = GANTT_SLOT_STATUS_VALUES.indexOf(getGanttSlotStatusView(slot).value);
  slot.status = GANTT_SLOT_STATUS_VALUES[(index + 1) % GANTT_SLOT_STATUS_VALUES.length];
  slot.updatedAt = new Date().toISOString();
  persistState();
  notifySaveSuccess("Статус операции сохранен");
  render();
}

function deleteSlotConfirmed(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  planningState.slots = planningState.slots.filter((item) => item.id !== slotId);
  if (ui.selectedSlotId === slotId) ui.selectedSlotId = null;
  persistState();
  render();
}

function focusSlot(slotId) {
  if (!slotId) return;
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  ui.selectedSlotId = slotId;
  const route = getSlotRoute(slot);
  if (route?.id) ui.expandedProjects.add(route.id);
  else ui.expandedProjects.add(getSlotProductionContextId(slot));
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-slot-id="${slotId}"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "center" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function focusRoute(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) return;
  ui.expandedProjects.add(route.id);
  ui.activeRouteId = route.id;
  ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || ui.activeProjectId || "";
  const firstSlot = getRouteSlots(route.id)
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0];
  ui.selectedSlotId = firstSlot?.id || null;
  persistUiState();
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-row-id="route:${route.id}"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function focusProject(productionId) {
  if (!productionId || !getProject(productionId)) return;
  const route = getProjectRouteForModule(productionId);
  if (route) {
    focusRoute(route.id);
    return;
  }
  ui.expandedProjects.add(productionId);
  const firstSlot = planningState.slots
    .filter((slot) => slotMatchesProductionContext(slot, productionId))
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0];
  ui.selectedSlotId = firstSlot?.id || null;
  persistUiState();
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-row-id="project:${productionId}"], [data-row-id^="route:"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function closeModals() {
  ui.selectedSlotId = null;
  ui.editor = null;
  ui.splitSlotId = null;
  ui.ganttOptimizationDialog = null;
  ui.routePrintPreviewId = "";
  ui.workOrderPrintPreviewId = "";
  ui.shiftMasterBoardPrintPreviewId = "";
  ui.shiftWorkOrderPrintPreviewId = "";
  ui.shiftWorkOrderIssuePhotoViewer = null;
  ui.timesheetEditor = null;
  ui.directoryEditor = null;
  ui.authSessionModal = null;
  ui.confirmDialog = null;
  render();
}

function buildRows(scaleInfo) {
  const filteredRoutes = getVisibleGanttRoutes();
  const rows = [];

  for (const route of filteredRoutes) {
    const project = getRoutePlanningContext(route);
    const productionId = project?.id || getRouteProductionId(route);
    const routeExpanded = isGanttRouteExpanded(route);
    const routeSlots = getRouteSummarySlots(route.id);
    rows.push({
      id: `route:${route.id}`,
      type: "route",
      route,
      project,
      routeId: route.id,
      projectId: productionId,
      height: getScaledRowHeight(PROJECT_ROW_HEIGHT, routeSlots, scaleInfo, true),
    });

    if (!routeExpanded) continue;

    rows.push(...getRouteGanttResourceRows(route, productionId, scaleInfo));
  }

  return rows;
}

function getRouteGanttResourceRows(route, productionId, scaleInfo) {
  const routeStepsById = new Map(getRouteStepsForModule(route.id).map((step) => [step.id, step]));
  const groupedRows = new Map();

  getRouteSlots(route.id)
    .filter((slot) => ganttSlotMatchesFilter(slot))
    .forEach((slot) => {
      const workCenterId = mapLegacyWorkCenterId(getSlotGanttWorkCenterId(slot) || slot.workCenterId || "") || "unknown";
      const resourceId = getSlotGanttResourceId(slot);
      const rowId = getResourceRowId(route.id, workCenterId, resourceId);
      const resource = getGanttResourceForSlot(slot, resourceId);
      const workCenter = getWorkCenter(workCenterId) || {
        id: workCenterId,
        name: "Отдел не выбран",
        code: "—",
        isActive: true,
      };

      if (!groupedRows.has(rowId)) {
        groupedRows.set(rowId, {
          id: rowId,
          type: "resource",
          routeId: route.id,
          projectId: productionId,
          workCenterId,
          workCenter,
          resourceId,
          resource,
          slots: [],
          routeStepIds: new Set(),
        });
      }

      const row = groupedRows.get(rowId);
      row.slots.push(slot);
      if (slot.routeStepId) row.routeStepIds.add(slot.routeStepId);
    });

  return [...groupedRows.values()]
    .map((row) => ({
      ...row,
      routeSteps: [...row.routeStepIds]
        .map((stepId) => routeStepsById.get(stepId))
        .filter(Boolean),
      height: getScaledRowHeight(WORK_ROW_HEIGHT, row.slots, scaleInfo, false),
    }))
    .sort((left, right) => (
      Math.min(...left.slots.map((slot) => toDate(slot.plannedStart).getTime()))
        - Math.min(...right.slots.map((slot) => toDate(slot.plannedStart).getTime()))
      || String(left.workCenter?.name || "").localeCompare(String(right.workCenter?.name || ""), "ru")
      || String(left.resource?.name || "").localeCompare(String(right.resource?.name || ""), "ru")
    ));
}

function buildRowLayout(rows) {
  let top = 0;
  const map = {};
  for (const row of rows) {
    map[row.id] = { top, height: row.height };
    top += row.height;
  }
  return { map, totalHeight: top };
}

function buildSlotPlacementMap(rows, scaleInfo) {
  return rows.reduce((map, row) => {
    map[row.id] = calculateSlotPlacements(getRowSlots(row), scaleInfo, row.type === "project" || row.type === "route").placements;
    return map;
  }, {});
}

function getScaledRowHeight(baseHeight, slots, scaleInfo, isAggregate) {
  if (slots.length < 2) return baseHeight;

  const { levelCount } = calculateSlotPlacements(slots, scaleInfo, isAggregate);
  const slotHeight = getSlotHeight(isAggregate);
  const slotTop = getSlotTop(isAggregate);
  const requiredHeight = slotTop * 2 + levelCount * slotHeight + Math.max(0, levelCount - 1) * WEEK_SLOT_GAP;
  return Math.max(baseHeight, Math.ceil(requiredHeight));
}

function calculateSlotPlacements(slots, scaleInfo, isAggregate = false) {
  const placements = {};
  const slotHeight = getSlotHeight(isAggregate);
  const slotTop = getSlotTop(isAggregate);
  const laneEnds = [];
  const sortedSlots = [...slots].sort((left, right) => (
    toDate(left.plannedStart) - toDate(right.plannedStart)
    || toDate(left.plannedEnd) - toDate(right.plannedEnd)
  ));

  for (const slot of sortedSlots) {
    const rect = getSlotVisualRect(slot, scaleInfo, isAggregate);
    let lane = laneEnds.findIndex((rightEdge) => rect.x >= rightEdge + WEEK_SLOT_GAP);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }

    laneEnds[lane] = rect.right;
    placements[slot.id] = {
      top: slotTop + lane * (slotHeight + WEEK_SLOT_GAP),
      height: slotHeight,
      level: lane,
      rect,
    };
  }

  return { placements, levelCount: laneEnds.length };
}

function getWeekSlotHeight(isAggregate) {
  return isAggregate ? 18 : WEEK_SLOT_HEIGHT;
}

function getSlotTop(isAggregate = false) {
  if (ui.scale === "weeks") return WEEK_SLOT_TOP;
  return isAggregate ? AGGREGATE_SLOT_TOP : STANDARD_SLOT_TOP;
}

function getSlotHeight(isAggregate = false) {
  if (ui.scale === "weeks") return getWeekSlotHeight(isAggregate);
  return isAggregate ? AGGREGATE_SLOT_HEIGHT : STANDARD_SLOT_HEIGHT;
}

function getProjectCenters(productionId) {
  const routeCenters = getProjectRouteSteps(productionId, planningState)
    .map((step) => getWorkCenter(step.workCenterId))
    .filter(Boolean);
  const slotCenters = planningState.slots
    .filter((slot) => slotMatchesProductionContext(slot, productionId))
    .map((slot) => getWorkCenter(slot.workCenterId))
    .filter(Boolean);
  const base = ui.rowMode === "all" ? getPlanningWorkCenters() : [...routeCenters, ...slotCenters];
  const seen = new Set();

  return base.filter((center) => {
    if (!center.isActive || seen.has(center.id)) return false;
    seen.add(center.id);
    return true;
  });
}

function getRouteCenters(routeId) {
  const routeSteps = getRouteStepsForModule(routeId);
  const routeCenters = routeSteps
    .map((step) => getWorkCenter(step.workCenterId))
    .filter(Boolean);
  const slotCenters = getRouteSlots(routeId)
    .map((slot) => getWorkCenter(slot.workCenterId))
    .filter(Boolean);
  const base = ui.rowMode === "all" ? getPlanningWorkCenters() : [...routeCenters, ...slotCenters];
  const seen = new Set();

  return base.filter((center) => {
    if (!center.isActive || seen.has(center.id)) return false;
    seen.add(center.id);
    return true;
  });
}

function getSlotsForProjectCenter(productionId, workCenterId) {
  return planningState.slots.filter((slot) => (
    slotMatchesProductionContext(slot, productionId)
    && slot.workCenterId === workCenterId
  ));
}

function getRouteStepIds(routeId) {
  return new Set((planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId)
    .map((step) => step.id));
}

function getSlotRoute(slot) {
  const step = (planningState.routeSteps || []).find((item) => item.id === slot?.routeStepId);
  if (step?.routeId) return (planningState.routes || []).find((route) => route.id === step.routeId) || null;
  const routeId = getSlotRouteId(slot, planningState);
  if (routeId) return (planningState.routes || []).find((route) => route.id === routeId) || null;
  return (planningState.routes || []).find((route) => (route.specificationId === slot?.specificationId || route.specificationId === slot?.projectId || route.projectId === slot?.projectId) && route.isDefault)
    || (planningState.routes || []).find((route) => route.specificationId === slot?.specificationId || route.specificationId === slot?.projectId || route.projectId === slot?.projectId)
    || null;
}

function getRouteSlots(routeId) {
  const stepIds = getRouteStepIds(routeId);
  return (planningState.slots || []).filter((slot) => (
    getSlotRouteId(slot, planningState) === routeId
    || stepIds.has(slot.routeStepId)
  ));
}

function slotMatchesRouteWorkCenterId(slot = {}, routeWorkCenterId = "") {
  const normalizedRouteWorkCenterId = getRouteInstructionWorkCenterId(routeWorkCenterId);
  const slotWorkCenterId = mapLegacyWorkCenterId(slot.workCenterId || "");
  if (!normalizedRouteWorkCenterId || !slotWorkCenterId) return false;
  if (slot.routeWorkCenterId === normalizedRouteWorkCenterId) return true;
  if (slotWorkCenterId === normalizedRouteWorkCenterId) return true;
  const slotWorkCenter = getWorkCenter(slotWorkCenterId);
  return slotWorkCenter?.parentWorkCenterId === normalizedRouteWorkCenterId;
}

function getSlotsForRouteCenter(routeId, workCenterId) {
  const normalizedWorkCenterId = mapLegacyWorkCenterId(workCenterId);
  const requestedCenter = getWorkCenter(normalizedWorkCenterId);
  const shouldIncludeRouteChildren = !requestedCenter || !isPlanningWorkCenter(requestedCenter);
  const routeSlots = getRouteSlots(routeId);
  return routeSlots.filter((slot) => (
    slot.workCenterId === normalizedWorkCenterId
    || (shouldIncludeRouteChildren && slotMatchesRouteWorkCenterId(slot, normalizedWorkCenterId))
  ));
}

function getSlotsForRouteStep(routeId, routeStepId) {
  const routeSlots = getRouteSlots(routeId);
  return routeSlots.filter((slot) => slot.routeStepId === routeStepId);
}

function getSlotsForRouteResource(routeId, workCenterId, resourceId) {
  const normalizedWorkCenterId = mapLegacyWorkCenterId(workCenterId);
  return getRouteSlots(routeId).filter((slot) => (
    mapLegacyWorkCenterId(getSlotGanttWorkCenterId(slot) || slot.workCenterId || "") === normalizedWorkCenterId
    && getSlotGanttResourceId(slot) === resourceId
  ));
}

function getGanttCenterRouteWorkCenterId(center) {
  return center?.parentWorkCenterId || mapLegacyWorkCenterId(center?.id);
}

function ganttCenterMatchesFilter(center) {
  if (ui.workCenterFilter === "all") return true;
  if (center.id === ui.workCenterFilter) return true;
  return getGanttCenterRouteWorkCenterId(center) === ui.workCenterFilter;
}

function ganttRouteStepMatchesFilter(step) {
  if (ui.workCenterFilter === "all") return true;
  const workCenterId = mapLegacyWorkCenterId(step?.workCenterId || "");
  if (workCenterId === ui.workCenterFilter) return true;
  const filteredCenter = getWorkCenter(ui.workCenterFilter);
  if (filteredCenter && isPlanningWorkCenter(filteredCenter)) {
    return getSlotsForRouteStep(step.routeId, step.id).some((slot) => (
      slot.workCenterId === ui.workCenterFilter
      || getSlotGanttWorkCenterId(slot) === ui.workCenterFilter
    ));
  }
  const center = getWorkCenter(workCenterId);
  if (center?.parentWorkCenterId === ui.workCenterFilter) return true;
  if (filteredCenter?.parentWorkCenterId === workCenterId) return true;
  return false;
}

function ganttSlotMatchesFilter(slot) {
  if (ui.workCenterFilter === "all") return true;
  const filteredCenter = getWorkCenter(ui.workCenterFilter);
  if (filteredCenter && isPlanningWorkCenter(filteredCenter)) {
    return slot.workCenterId === ui.workCenterFilter
      || getSlotGanttWorkCenterId(slot) === ui.workCenterFilter;
  }
  return slotMatchesRouteWorkCenterId(slot, ui.workCenterFilter);
}

function getProjectSummarySlots(productionId) {
  return planningState.slots.filter((slot) => (
    slotMatchesProductionContext(slot, productionId)
    && isManufacturingOutputReceiptSlot(slot)
  ));
}

function getRouteSummarySlots(routeId) {
  return getRouteSlots(routeId).filter((slot) => isManufacturingOutputReceiptSlot(slot));
}

function projectMatchesFilters(project) {
  if (ui.workCenterFilter !== "all") {
    const filteredCenter = getWorkCenter(ui.workCenterFilter);
    const filterIsPlanningCenter = Boolean(filteredCenter && isPlanningWorkCenter(filteredCenter));
    const hasRouteCenter = getProjectRouteSteps(project.id, planningState).some((step) => (
      mapLegacyWorkCenterId(step.workCenterId) === ui.workCenterFilter
      || (!filterIsPlanningCenter && getWorkCenter(mapLegacyWorkCenterId(step.workCenterId))?.parentWorkCenterId === ui.workCenterFilter)
    ));
    const hasSlotCenter = planningState.slots.some((slot) => (
      slotMatchesProductionContext(slot, project.id)
      && (slot.workCenterId === ui.workCenterFilter || getSlotGanttWorkCenterId(slot) === ui.workCenterFilter)
    ));
    if (!hasRouteCenter && !hasSlotCenter) return false;
  }

  return true;
}

function routeMatchesGanttFilters(route) {
  const project = getRoutePlanningContext(route);
  if (!route || !project) return false;
  if (isWorkOrderPlanningCanceled(route)) return false;
  if (!getRouteSlots(route.id).length) return false;

  if (ui.workCenterFilter !== "all") {
    const filteredCenter = getWorkCenter(ui.workCenterFilter);
    const filterIsPlanningCenter = Boolean(filteredCenter && isPlanningWorkCenter(filteredCenter));
    const hasRouteCenter = getRouteStepsForModule(route.id).some((step) => (
      mapLegacyWorkCenterId(step.workCenterId) === ui.workCenterFilter
      || (!filterIsPlanningCenter && getWorkCenter(mapLegacyWorkCenterId(step.workCenterId))?.parentWorkCenterId === ui.workCenterFilter)
    ));
    const hasSlotCenter = getSlotsForRouteCenter(route.id, ui.workCenterFilter).length > 0;
    if (!hasRouteCenter && !hasSlotCenter) return false;
  }

  return true;
}

function getRowSlots(row) {
  if (row.type === "route") {
    return getRouteSummarySlots(row.routeId);
  }

  if (row.type === "project") {
    return getProjectSummarySlots(row.projectId);
  }

  if (row.type === "operation") {
    const slots = getSlotsForRouteStep(row.routeId, row.routeStepId);
    if (ui.workCenterFilter === "all") return slots;
    const filteredCenter = getWorkCenter(ui.workCenterFilter);
    if (filteredCenter && isPlanningWorkCenter(filteredCenter)) {
      return slots.filter((slot) => (
        slot.workCenterId === ui.workCenterFilter
        || getSlotGanttWorkCenterId(slot) === ui.workCenterFilter
      ));
    }
    return slots.filter((slot) => slotMatchesRouteWorkCenterId(slot, ui.workCenterFilter));
  }

  if (row.type === "workCenter") {
    const workCenterId = getGanttCenterRouteWorkCenterId({
      id: row.workCenterId,
      parentWorkCenterId: row.parentWorkCenterId,
    });
    return getSlotsForRouteCenter(row.routeId, workCenterId);
  }

  if (row.type === "resource") {
    return getSlotsForRouteResource(row.routeId, row.workCenterId, row.resourceId);
  }

  return planningState.slots.filter((slot) => (
    (!row.routeId || getSlotRoute(slot)?.id === row.routeId)
    && slotMatchesProductionContext(slot, row.projectId)
    && getSlotGanttWorkCenterId(slot) === row.workCenterId
  ));
}

function getVisibleSlotRowId(slot) {
  const route = getSlotRoute(slot);
  if (!route) return null;
  if (!isGanttRouteExpanded(route)) {
    return isManufacturingOutputReceiptSlot(slot) ? `route:${route.id}` : null;
  }
  const workCenterId = mapLegacyWorkCenterId(getSlotGanttWorkCenterId(slot) || slot.workCenterId || "") || "unknown";
  return getResourceRowId(route.id, workCenterId, getSlotGanttResourceId(slot));
}

  return {
    renderToolbar,
    renderGanttOptimizationModal,
    renderPlanningDirectorCommand,
    renderDirectorFlowStep,
    renderTimeline,
    renderGanttTimelineWeekGroup,
    renderGanttTimelineDayCell,
    getGanttWeekBoundaries,
    renderGanttWeekBoundaryLayer,
    renderRow,
    parseShiftMinutes,
    getWorkCenterCalendar,
    isScheduleWorkDay,
    getCalendarWorkCenterId,
    getCalendarWorkCenter,
    getGanttRowCalendar,
    getGanttRowCalendarWorkCenterId,
    getWorkingIntervalsForCalendar,
    getWorkingIntervalsForDay,
    getWorkingIntervalsBetween,
    snapToWorkingTime,
    addWorkingDuration,
    getWorkingDurationBetween,
    minuteToDate,
    addCalendarDays,
    addNonWorkingSegment,
    buildVisibleSharedNonWorkingIntervals,
    removeSharedNonWorkingIntervals,
    buildNonWorkingSegments,
    renderNonWorkingLayer,
    renderRowLabel,
    getGanttLinkedRecordEntries,
    getGanttFactRecordEntries,
    isGanttFactRecordReported,
    sumGanttFactRecords,
    getGanttSlotFactQuantity,
    getShiftMasterAssignmentQuantity,
    getShiftMasterAssignmentsForGanttSlot,
    getShiftMasterBoardAssignmentEntriesForGanttSlot,
    getShiftMasterBoardFactEntriesForGanttSlot,
    getAuthSessionFactEntriesForGanttSlot,
    getGanttSlotOperationalState,
    getGanttSlotOperationalSegmentState,
    formatGanttRowMetricQuantity,
    getGanttRowMetrics,
    renderGanttRowMetricCells,
    renderRouteTaskMini,
    renderProjectRouteMini,
    renderTodayMarker,
    getSlotTransferBatchVisual,
    renderSlotTransferBatchVisual,
    normalizeGanttOperationalQuantity,
    formatGanttOperationalQuantity,
    toGanttOperationalPercent,
    makeGanttOperationalSegment,
    getGanttAssignmentSegments,
    getGanttCompositeOperationalSegments,
    formatGanttOperationalDelta,
    formatGanttOperationalSignedDelta,
    getGanttSlotHoverSummaryText,
    getGanttOperationalMetaText,
    renderGanttOperationalSegments,
    renderGanttSlotOperationalLayer,
    getGanttSlotGeometryRadius,
    getSlotSegmentEdgeClass,
    renderSlot,
    renderGanttSlotLine,
    getGanttQuantityLabelMode,
    getSlotRouteMeta,
    getSlotVisualRect,
    distributeQuantityAcrossWorkingSegments,
    getSlotWorkingVisualSegments,
    getSlotNonWorkingVisualSegments,
    isTransferBatchDependencyPair,
    renderTransferGateMarkers,
    renderDependencies,
    getGanttDependencyRouteKey,
    getActiveGanttDependencyRouteStore,
    applyGanttDependencyRouteOffsets,
    renderGanttDependencyEditControls,
    buildDependencySlotMaskRects,
    renderGanttSnapOverlay,
    getDependencyConnectionRect,
    clipDependencyRectToTimeline,
    getDependencyTimelineAnchorRect,
    shouldRenderDependencyBetweenTimelineAnchors,
    buildDependencyPathAroundSlots,
    buildGanttFinishStartDependencyPoints,
    compactDependencyPointObjects,
    dependencyRouteBacktracksOverStart,
    getDependencyStartDetourPoint,
    getDependencyObstacleRects,
    routeDependencyPointsAroundSlots,
    buildDependencyOuterCorridorCandidates,
    getDependencyObstacleExtents,
    getDependencyPathObstacleRects,
    getShortestDependencyPath,
    getBestConstrainedDependencyPath,
    compareDependencyPathScore,
    compareDependencyPathLength,
    getDependencyPathLength,
    getDependencyPathBendCount,
    dependencyPathBacktracksOverStart,
    findDependencyPathObstacle,
    dependencyPathIntersectsObstacles,
    countDependencyPathObstacleHits,
    findDependencySegmentObstacle,
    dependencySegmentIntersectsRect,
    compactDependencyPoints,
    getDependencyPathPointsBeforeArrow,
    buildDependencyOrthogonalPath,
    buildDependencyPathWithLineJumps,
    getDependencyRoundedCornerData,
    groupDependencyJumpsBySegment,
    appendDependencySegmentWithLineJumps,
    getRenderableDependencyJumps,
    getDependencyJumpPoint,
    toDependencyPoint,
    getDependencyPointDistance,
    getDependencyCrossingJumpsByRoute,
    getDependencyRenderRoutesWithSeparatedHorizontals,
    dependencyHorizontalSegmentsOverlap,
    getDependencyHorizontalTrackY,
    applyDependencyHorizontalTrackDetours,
    getDependencyRouteCrossings,
    getDependencyCrossingJumpTarget,
    getDependencyCrossingGapRadius,
    getDependencyRouteSegments,
    getDependencySegmentCrossing,
    getDependencyOrthogonalSegmentCrossing,
    buildDependencyPath,
    roundedOrthogonalPath,
    normalize,
    distance,
    isSameDirection,
    round,
    renderIssueDock,
    renderPlanningAssistantDock,
    formatWarningType,
    getWarningProductionId,
    getWarningPlanningOrderId,
    renderSlotDrawer,
    renderDrawerRouteSequence,
    renderEditorModal,
    renderSplitModal,
    bindEvents,
    bindSlotForm,
    bindSplitForm,
    toggleGanttDependencyEditMode,
    beginGanttDependencyRouteDrag,
    updateGanttDependencyRouteDraft,
    setGanttDependencyDraftOffset,
    beginDrag,
    suppressNextGanttSlotClick,
    shouldSuppressGanttSlotClick,
    rowFromPointer,
    placeSlotInNearestWindow,
    moveSlotToNearestWindow,
    toggleSlotLock,
    autoFixAllWarnings,
    applyWarningFixInPlace,
    autoFixWarning,
    savePlanSnapshot,
    updateSlotQuantity,
    cycleSlotStatus,
    deleteSlotConfirmed,
    focusSlot,
    focusRoute,
    focusProject,
    closeModals,
    buildRows,
    getRouteGanttResourceRows,
    buildRowLayout,
    buildSlotPlacementMap,
    getScaledRowHeight,
    calculateSlotPlacements,
    getWeekSlotHeight,
    getSlotTop,
    getSlotHeight,
    getProjectCenters,
    getRouteCenters,
    getSlotsForProjectCenter,
    getRouteStepIds,
    getSlotRoute,
    getRouteSlots,
    slotMatchesRouteWorkCenterId,
    getSlotsForRouteCenter,
    getSlotsForRouteStep,
    getSlotsForRouteResource,
    getGanttCenterRouteWorkCenterId,
    ganttCenterMatchesFilter,
    ganttRouteStepMatchesFilter,
    ganttSlotMatchesFilter,
    getProjectSummarySlots,
    getRouteSummarySlots,
    projectMatchesFilters,
    routeMatchesGanttFilters,
    getRowSlots,
    getVisibleSlotRowId,
  };
}
