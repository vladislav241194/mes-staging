export function createAppEventsServiceModule(dependencies = {}) {
  const {
    AUTH_PIN_TEMPORARILY_DISABLED,
    BOARD_SPEC_TERM,
    BOM_COMPONENT_FIELDS,
    batchIds = [],
    GANTT_SLOT_STATUS_LABELS,
    GANTT_SLOT_STATUS_VALUES,
    MES_STATUS_CONTRACT_KEYS,
    NOMENCLATURE_REA_COMPONENT_TYPE,
    PRODUCT_COMPOSITION_TERM,
    WORK_MODE_OPTIONS,
    addMs,
    app,
    audit,
    applyOperationMapItemToRouteStep,
    bom = null,
    boardsPerPanel = 0,
    bomId = "",
    bomListId = "",
    buildDefaultSpecificationStructureItems,
    button = null,
    calculateProjectProgress,
    cancelPlanningRoute,
    canEditDirectorySection = () => false,
    cascadeBatchFromSlot,
    changePlanningRouteQuantity = async (routeId, quantity, options) => syncPlanningRouteQuantity(routeId, quantity, options),
    closeModals = () => {},
    center = null,
    chartColors,
    config = null,
    count = 0,
    createAppInteractionsModule,
    bindAuthPrototypeEvents: bindAuthPrototypeEventsDependency = () => {},
    bindAuthSessionEvents: bindAuthSessionEventsDependency = () => {},
    createProductsEventsModule,
    createSpekiSpecification,
    createRoutesEventsModule,
    cancelAuthPrototypePinFeedback,
    completeAuthPrototypeLogin,
    deleteRouteMapConfirmed,
    doesAuthSessionFactNeedDeviationComment,
    directorySections,
    ensureRouteTaskSeedSteps,
    ensurePlanningRuntimeProjection = async () => false,
    ensurePlanningSystemDomains = async () => false,
    element = null,
    employeeId = "",
    enabled = false,
    currentWorkCenterId = "",
    departmentName = "",
    entry = null,
    escapeAttribute,
    escapeHtml,
    executors = [],
    field = "",
    findOperationMapItemByNameAndWorkCenter,
    form = null,
    formatDate,
    formatShiftWorkOrderPersonName,
    fromDateInput,
    generateChildRouteCardsForActiveRoute,
    getActiveRouteForModule,
    getAuthPrototypeAttemptsLeft,
    getAuthPrototypePeople,
    getAuthPrototypePinPerson,
    getAuthSessionFactDeviationPercent,
    getAuthSessionFactDraft,
    getAuthSessionPrototypeModel,
    getAuthSessionTaskGoodQuantity,
    getAvailableModules,
    getDefaultOperationCalculationType,
    getDefaultSecondsPerPanel,
    getDefaultStructureFulfillmentMode,
    getDefaultStructureNomenclatureType,
    getExecutionTypeForFulfillmentMode,
    getActiveSpecificationForModule,
    getBomList,
    getGanttSlotStatusView,
    getManualPlanningAssignmentForRouteStep,
    getMesDocumentKind,
    getMesFlowTransitionsForStatus,
    getMesStatusView,
    getModuleDefinitions,
    getOperationMapItem,
    getOperationMapRows,
    getOperationRouteWorkCenterId,
    getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
    getPlanningResourceForRouteStep,
    getPlanningRouteQuantity,
    getPlanningRouteSlots,
    getPlanningWorkCenters,
    getSpecificationDeleteUsage = () => ({ routeIds: new Set(), routeStepIds: new Set(), routesCount: 0, slotsCount: 0 }),
    getWorkingDurationBetween = (_workCenterId, start, end) => Math.max(0, new Date(end).getTime() - new Date(start).getTime()),
    getProductionContexts,
    getProductionResource,
    getProject,
    getProjectDisplayName,
    getProjectRouteForModule,
    getRouteBindingContext,
    getRouteBindingModeForSelection,
    getRouteDeleteUsage,
    getRouteDocumentKind,
    getRouteForStep,
    getRouteInstructionWorkCenterId,
    getRouteInstructionWorkCenters,
    getRouteModuleSelectionValue,
    getRoutePlanningContext,
    getRouteProductionContext,
    getRouteProductionId,
    getRouteStepFlowModel,
    getRouteStepPlanningCandidateWorkCenterIds,
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteStepTaskId,
    getRouteStepsForModule,
    getRouteStepsForTask,
    getRouteTasksForModule,
    getShiftMasterBoardModel,
    getSlotPlanningOrderId,
    getSlotRouteId,
    getSlotWarnings,
    getSpecificationByProjectId,
    getSpecificationItemFulfillmentMode,
    getSpecificationRouteForModule,
    getSpecificationStructureItems,
    getStatusLifecycleModules,
    getStatusRegistryKindLabel,
    getWorkCenter,
    getWorkCenterUnitsPerHour,
    icon,
    id = "",
    importHeaders = [],
    importRows = [],
    importBomFromXlsxFile,
    input = null,
    isGanttSlotCompleted,
    isManufacturingOutputReceiptOperation,
    isManufacturingOutputReceiptRouteStep,
    isPlanningWorkCenterCompatibleWithRouteStep,
    isSchedulableFulfillmentMode,
    isWarehouseWorkCenterId,
    isAuthPrototypePinFeedbackLocked,
    item = null,
    items = [],
    joinUiClasses,
    key = "",
    label = "",
    lockAuthGate,
    makeId,
    makeManualRouteStepFlowItems,
    mapLegacyWorkCenterId,
    masterId = "",
    mergeFallback = null,
    message = "",
    mode = "",
    mountGlobalVisualSystem,
    name = "",
    note = "",
    normalizeBoardsPerPanel,
    normalizeDirectoryRow,
    normalizeDirectorySectionId,
    normalizeLookupText,
    normalizeDirectoryState,
    normalizeOptionalPositiveInteger,
    normalizeAuthSessionFactField,
    normalizePlainRecord,
    normalizePlanningLaborNoteByRow,
    normalizePlanningLaborPositiveNumber,
    normalizeShiftMasterBoardQuantity,
    normalizeShiftWorkOrderIssueReports,
    normalizePlanningState,
    normalizeNomenclatureType,
    normalizeRouteBindingValue,
    normalizeRouteStepCalculationFields,
    normalizeSpecificationStructureItem,
    normalizeStructureFulfillmentMode,
    notifySaveSuccess,
    option = null,
    options = null,
    operationName = "",
    parentId = "",
    parsePlanningOrderLaborKey,
    persistDirectoryState,
    persistState,
    persistUiState,
    pickDefaultBomForSpecificationItem,
    rawValue = "",
    recalculateSlotEndByQuantity,
    recordDirectoryEntityDeletion,
    render,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiModalFrame,
    renderPreservingModuleScroll,
    refreshPlanningWorkbench = () => renderPreservingModuleScroll(),
    resource = null,
    resolveRouteModuleProjectId,
    resolveWorkCenterIdFromName,
    routeWorkCenterId = "",
    rowId = "",
    resetAuthPrototypeAttempts,
    resetAuthPrototypePinEntry,
    saveAuthSessionTaskReport,
    saveShiftMasterBoardFact,
    schedulePlanningRouteToGantt,
    runLongTask = async (task) => task(),
    scheduleAuthPrototypePinValidation,
    setAuthSessionFactDraft,
    setAuthSessionReportDraft,
    setShiftWorkbenchDate = () => false,
    moveShiftWorkbenchDate = () => false,
    setShiftWorkbenchToday = () => false,
    sectionId = "",
    selected,
    secondsPerPanel = 0,
    saveShiftMasterBoardAssignment,
    setPlanningOrderLaborSetting,
    setupMin = 0,
    slot = null,
    slotMatchesProductionContext,
    specification = null,
    specificationId = "",
    status = "",
    structureItems = [],
    syncSpecificationDerivedFields,
    statusReportColors,
    syncPlanningManualLaborToStepSlots = () => 0,
    syncPlanningBoardsPerPanel,
    syncPlanningRouteQuantity,
    syncPlanningRouteStartDate,
    toDate,
    toDateInput,
    type = "",
    unitsPerHour = 0,
    updateModuleUrlParam,
    updatePlanningSupplyFulfillment,
    value = "",
    values = [],
    withDirectoryEntityRemovalAllowed,
    withPlanningEntityRemovalAllowed,
  } = dependencies;

  let ui = dependencies.getUi?.() ?? {};
  let planningState = dependencies.getPlanningState?.() ?? {};
  let directoryState = dependencies.getDirectoryState?.() ?? {};
  let denseInlineViewportListenersBound = dependencies.getDenseInlineViewportListenersBound?.() ?? false;
  let mobileModuleSwitcherBehaviorBound = dependencies.getMobileModuleSwitcherBehaviorBound?.() ?? false;
  let ganttScrollRestoreInProgress = dependencies.getGanttScrollRestoreInProgress?.() ?? false;
  let authPrototypePinDraft = dependencies.getAuthPrototypePinDraft?.() ?? "";
  let authPrototypePinFeedbackTimer = dependencies.getAuthPrototypePinFeedbackTimer?.() ?? null;
  let authPrototypePinFeedbackSequence = dependencies.getAuthPrototypePinFeedbackSequence?.() ?? 0;
  let authPrototypeKeypadDigits = dependencies.getAuthPrototypeKeypadDigits?.() ?? [];
  let focusFullscreenRestoreAttempted = dependencies.getFocusFullscreenRestoreAttempted?.() ?? false;

  function syncRuntimeState() {
    ui = dependencies.getUi?.() ?? ui ?? {};
    planningState = dependencies.getPlanningState?.() ?? planningState ?? {};
    directoryState = dependencies.getDirectoryState?.() ?? directoryState ?? {};
    denseInlineViewportListenersBound = dependencies.getDenseInlineViewportListenersBound?.() ?? denseInlineViewportListenersBound ?? false;
    mobileModuleSwitcherBehaviorBound = dependencies.getMobileModuleSwitcherBehaviorBound?.() ?? mobileModuleSwitcherBehaviorBound ?? false;
    ganttScrollRestoreInProgress = dependencies.getGanttScrollRestoreInProgress?.() ?? ganttScrollRestoreInProgress ?? false;
    authPrototypePinDraft = dependencies.getAuthPrototypePinDraft?.() ?? authPrototypePinDraft ?? "";
    authPrototypePinFeedbackTimer = dependencies.getAuthPrototypePinFeedbackTimer?.() ?? authPrototypePinFeedbackTimer ?? null;
    authPrototypePinFeedbackSequence = dependencies.getAuthPrototypePinFeedbackSequence?.() ?? authPrototypePinFeedbackSequence ?? 0;
    authPrototypeKeypadDigits = dependencies.getAuthPrototypeKeypadDigits?.() ?? authPrototypeKeypadDigits ?? [];
    focusFullscreenRestoreAttempted = dependencies.getFocusFullscreenRestoreAttempted?.() ?? focusFullscreenRestoreAttempted ?? false;
  }

  function commitRuntimeState() {
    dependencies.setUi?.(ui);
    dependencies.setPlanningState?.(planningState);
    dependencies.setDirectoryState?.(directoryState);
    dependencies.setDenseInlineViewportListenersBound?.(denseInlineViewportListenersBound);
    dependencies.setMobileModuleSwitcherBehaviorBound?.(mobileModuleSwitcherBehaviorBound);
    dependencies.setGanttScrollRestoreInProgress?.(ganttScrollRestoreInProgress);
    dependencies.setAuthPrototypePinDraft?.(authPrototypePinDraft);
    dependencies.setAuthPrototypePinFeedbackTimer?.(authPrototypePinFeedbackTimer);
    dependencies.setAuthPrototypePinFeedbackSequence?.(authPrototypePinFeedbackSequence);
    dependencies.setAuthPrototypeKeypadDigits?.(authPrototypeKeypadDigits);
    dependencies.setFocusFullscreenRestoreAttempted?.(focusFullscreenRestoreAttempted);
  }

function renderConfirmModal() {
  if (!ui.confirmDialog) return "";
  const config = getConfirmDialogConfig(ui.confirmDialog);

  return `
    <div class="modal-backdrop confirm-backdrop" data-confirm-cancel>
      ${renderUiModalFrame({
        title: config.title,
        className: "confirm-modal",
        attributes: `aria-label="${escapeAttribute(config.title)}"`,
        headActions: `<button class="icon-button ui-action-button" data-confirm-cancel type="button" title="Закрыть">${icon("close")}</button>`,
        body: `
        <div class="confirm-body ${config.tone || ""}">
          <div class="confirm-icon">${icon(config.icon || "alert")}</div>
          <div>
            <p>${escapeHtml(config.body)}</p>
            ${config.meta ? `<span>${escapeHtml(config.meta)}</span>` : ""}
          </div>
        </div>
      `,
        actions: renderUiFormActions({
          actions: `
            <button class="secondary-button ui-action-button" data-confirm-cancel type="button">Отмена</button>
            <button class="primary-button ui-action-button ${config.tone === "danger" ? "danger-primary" : ""}" data-confirm-approve type="button">${icon(config.confirmIcon || "check")}<span>${escapeHtml(config.confirmLabel)}</span></button>
          `,
        }),
      })}
    </div>
  `;
}

function getConfirmDialogConfig(dialog) {
  const payload = dialog?.payload || {};

  if (dialog?.action === "deleteSlot") {
    const slot = planningState.slots.find((item) => item.id === payload.slotId);
    return {
      title: "Удалить операцию?",
      body: `Слот "${slot?.operationName || "операция"}" будет удален из диаграммы планирования.`,
      meta: "Это изменит план состава изделия и пересчитает связанные данные.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "planningCancelRoute") {
    const route = (planningState.routes || []).find((item) => item.id === payload.routeId);
    const slotsCount = getPlanningRouteSlots(route).length;
    return {
      title: "Отменить заказ-наряд?",
      body: `Заказ-наряд "${route?.name || "без названия"}" будет отменен, а ${slotsCount} операций будут сняты из Ганта.`,
      meta: "Заказ-наряд останется в планировании, чтобы его можно было скорректировать и передать в Гант заново.",
      confirmLabel: "Отменить заказ-наряд",
      confirmIcon: "close",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "spekiDeleteSpecification") {
    const specification = (directoryState.specifications || []).find((item) => item.id === payload.specificationId);
    const usage = getSpecificationDeleteUsage(payload.specificationId);
    return {
      title: "Удалить состав изделия?",
      body: `Состав изделия "${specification?.name || "без названия"}" будет удален из перечня и больше не будет доступен в конструкторе.`,
      meta: `Ссылки в другом составе изделия будут очищены. Также будет удалено: ${usage.routesCount} маршрутных карт, ${usage.slotsCount} слотов Ганта.`,
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "bomDeleteList") {
    const bom = getBomList(payload.bomId);
    const linkedSpecifications = getBomLinkedSpecifications(payload.bomId);
    const rowsCount = getBomImportRows(bom).length;
    return {
      title: "Удалить плату?",
      body: `Плата "${bom?.name || "без названия"}" будет удалена вместе с импортированным BOM${rowsCount ? ` на ${rowsCount} строк` : ""}.`,
      meta: linkedSpecifications.length
        ? `Плата используется в ${linkedSpecifications.length} составах изделия. Ссылки на нее будут очищены.`
        : "Связанных составов изделия не найдено.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "directoryDeleteRow") {
    const directoryData = getDirectoryData(payload.sectionId || ui.activeDirectory);
    const row = directoryData.rows[Number(payload.rowIndex)];
    return {
      title: "Удалить запись справочника?",
      body: `Запись "${getDirectoryRowLabel(directoryData.sectionId, row) || "без названия"}" будет удалена из раздела "${getDirectorySectionLabel(directoryData.sectionId)}".`,
      meta: "Если запись используется в связанных данных, система очистит прямые ссылки или оставит предупреждения в рабочих модулях.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "nomenclatureDeleteItem") {
    const item = getNomenclatureItem(payload.itemId);
    const usage = getNomenclatureDeleteUsage(payload.itemId);
    return {
      title: "Удалить позицию номенклатуры?",
      body: `Позиция "${item?.name || "без названия"}" будет удалена из номенклатуры.`,
      meta: `Ссылки будут очищены: ${usage.specificationsCount} составов изделия, ${usage.bomRowsCount} строк BOM.`,
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "operationMapDelete") {
    const operation = getOperationMapItem(payload.operationId);
    const usageCount = planningState.routeSteps.filter((step) => step.operationId === payload.operationId).length;
    return {
      title: "Удалить операцию?",
      body: `Операция "${operation?.name || "без названия"}" будет удалена из справочника операций.`,
      meta: usageCount ? `В ${usageCount} шагах маршрутов связь будет очищена, текст операции останется.` : "Связанных маршрутных карт не найдено.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "cascadeSlot") {
    const slot = planningState.slots.find((item) => item.id === payload.slotId);
    return {
      title: "Пересчитать цепочку?",
      body: `Операции после "${slot?.operationName || "выбранного слота"}" будут сдвинуты по маршруту заказ-наряда.`,
      meta: "Действие влияет на Гант, предупреждения и отчеты.",
      confirmLabel: "Пересчитать",
      confirmIcon: "refresh",
      icon: "refresh",
      tone: "warning",
    };
  }

  if (dialog?.action === "fixAllWarnings") {
    const warnings = getSlotWarnings(planningState).warnings;
    const critical = warnings.filter((warning) => warning.severity === "critical").length;
    return {
      title: "Исправить конфликты плана?",
      body: `Система попробует автоматически исправить ${warnings.length} предупреждений, включая ${critical} критичных: сдвиги, пересечения, перегрузку отделов и количество.`,
      meta: "Зафиксированные и завершенные операции не будут изменены.",
      confirmLabel: "Исправить",
      confirmIcon: "refresh",
      icon: "alert",
      tone: critical ? "danger" : "warning",
    };
  }

  if (dialog?.action === "routeDeleteStep") {
    const step = planningState.routeSteps.find((item) => item.id === payload.stepId);
    const slotsCount = planningState.slots.filter((slot) => slot.routeStepId === payload.stepId).length;
    return {
      title: "Удалить шаг маршрута?",
      body: `Операция "${step?.operationName || "шаг маршрута"}" будет удалена из маршрутной карты.`,
      meta: slotsCount ? `Этот шаг используют ${slotsCount} операций Ганта. После удаления они получат предупреждение маршрута.` : "Действие изменит технологическую последовательность состава изделия.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "routeDeleteMap") {
    const route = (planningState.routes || []).find((item) => item.id === payload.routeId);
    const usage = getRouteDeleteUsage(payload.routeId);
    return {
      title: "Удалить маршрутную карту?",
      body: `Маршрутная карта "${route?.name || "без названия"}" будет удалена из модуля.`,
      meta: `Также будет удалено: ${usage.stepsCount} операций маршрута, ${usage.slotsCount} слотов Ганта.`,
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  return {
    title: "Подтвердить действие?",
    body: "Это действие изменит данные прототипа.",
    confirmLabel: "Подтвердить",
    confirmIcon: "check",
    icon: "info",
    tone: "info",
  };
}

function buildWorkloadRows() {
  const rows = getPlanningWorkCenters().map((center, index) => {
    const slots = planningState.slots.filter((slot) => slot.workCenterId === center.id);
    return {
      label: center.name,
      code: center.code,
      count: slots.length,
      hours: Math.round(slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0) * 10) / 10,
      quantity: slots.reduce((sum, slot) => sum + Number(slot.quantity || 0), 0),
      color: chartColors[index % chartColors.length],
    };
  }).filter((row) => row.count || row.label === "Склад")
    .sort((left, right) => right.hours - left.hours);
  const maxHours = Math.max(1, ...rows.map((row) => row.hours));
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({
    ...row,
    percentHours: Math.round(row.hours / maxHours * 100),
    percentCount: Math.round(row.count / maxCount * 100),
  }));
}

function buildDeadlineRows() {
  return getProductionContexts()
    .sort((left, right) => toDate(left.dueDate) - toDate(right.dueDate))
    .map((project, index) => {
      const progress = calculateProjectProgress(project, planningState);
      return {
        project: getProjectDisplayName(project) || project.name,
        order: getSpecificationProductionOrder(getSpecificationByProjectId(project.id)) || project.orderNumber,
        quantity: `${Number(project.totalQuantity || 0).toLocaleString("ru-RU")} шт.`,
        due: formatDate(project.dueDate),
        progress,
        color: progress >= 70 ? "#16a34a" : progress >= 35 ? "#2563eb" : chartColors[index % chartColors.length],
      };
    });
}

function buildSlotStatusItems(slots) {
  const counts = GANTT_SLOT_STATUS_VALUES.map((status) => ({
    label: GANTT_SLOT_STATUS_LABELS[status],
    value: slots.filter((slot) => getGanttSlotStatusView(slot).value === status).length,
    color: statusReportColors[status],
  })).filter((item) => item.value > 0);
  return counts.length ? counts : [{ label: "Нет данных", value: 1, color: "#cbd5e1" }];
}

function buildWarningTypeItems(warnings) {
  const types = [
    { type: "capacity", label: "Загрузка", color: "#dc2626" },
    { type: "route", label: "Маршрут", color: "#d97706" },
    { type: "quantity", label: "Количество", color: "#0284c7" },
    { type: "duration", label: "Длительность", color: "#7c3aed" },
  ];
  const items = types.map((item) => ({
    ...item,
    value: warnings.filter((warning) => warning.type === item.type).length,
  })).filter((item) => item.value > 0);
  return items.length ? items : [{ label: "Нет предупреждений", value: 1, color: "#16a34a" }];
}

function buildWarningProjectItems(warnings) {
  const counts = getProductionContexts().map((project, index) => {
    const value = warnings.filter((warning) => getWarningProductionId(warning) === project.id).length;
    return {
      label: getProjectDisplayName(project) || project.name,
      value: String(value),
      percent: 0,
      rawValue: value,
      color: value ? chartColors[index % chartColors.length] : "#cbd5e1",
    };
  });
  const maxValue = Math.max(1, ...counts.map((item) => item.rawValue));
  return counts.map((item) => ({ ...item, percent: Math.round(item.rawValue / maxValue * 100) }));
}

function buildWarningRows(warnings) {
  return warnings.slice(0, 10).map((warning) => [
    warning.type,
    warning.severity === "critical" ? "Критично" : "Предупреждение",
    getProjectDisplayName(getProject(getWarningProductionId(warning))) || "-",
    warning.message,
  ]);
}

function buildWorkloadInsights(workload, warnings) {
  const top = workload[0];
  return [
    { icon: "info", text: top ? `Самый загруженный отдел: ${top.label}, ${top.hours} ч.` : "Нет операций для анализа загрузки." },
    { icon: warnings.some((warning) => warning.type === "capacity") ? "alert" : "check", tone: warnings.some((warning) => warning.type === "capacity") ? "warning" : "ok", text: warnings.some((warning) => warning.type === "capacity") ? "Есть пересечения операций по емкости отделов." : "Пересечений по емкости не найдено." },
    { icon: "check", tone: "ok", text: "Приемка результата производства контролируется отдельно от прочих складских операций." },
  ];
}

function buildDeadlineInsights(deadlineRows) {
  const risky = deadlineRows.filter((row) => row.progress < 40);
  return [
    { icon: risky.length ? "alert" : "check", tone: risky.length ? "warning" : "ok", text: risky.length ? `${risky.length} состава изделия имеют низкую готовность.` : "Состав изделия выглядит устойчиво по готовности." },
    { icon: "info", text: deadlineRows[0] ? `Ближайший срок: ${deadlineRows[0].project}, ${deadlineRows[0].due}.` : "Нет состава изделия со сроками." },
  ];
}

function buildWarningInsights(warnings) {
  return [
    { icon: warnings.length ? "alert" : "check", tone: warnings.length ? "warning" : "ok", text: warnings.length ? `Всего найдено ${warnings.length} предупреждений.` : "Предупреждений нет." },
    { icon: "info", text: "Критичные сообщения подсвечивают конфликты, которые влияют на выполнимость плана." },
  ];
}

function buildDonutGradient(items) {
  const total = Math.max(1, items.reduce((sum, item) => sum + Number(item.value || 0), 0));
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += Number(item.value || 0) / total * 100;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function getSlotDurationHours(slot) {
  return Math.max(0, getWorkingDurationBetween(slot.workCenterId, slot.plannedStart, slot.plannedEnd, planningState) / (60 * 60 * 1000));
}

function getSlotWorkingDurationMs(slot) {
  if (!slot) return 0;
  return Math.max(0, getWorkingDurationBetween(slot.workCenterId, slot.plannedStart, slot.plannedEnd, planningState));
}

function getSlotCalendarDurationMs(slot) {
  if (!slot) return 0;
  return Math.max(0, toDate(slot.plannedEnd) - toDate(slot.plannedStart));
}

function formatReportNumber(value) {
  return String(Math.round(Number(value || 0) * 10) / 10);
}

function getDirectoryFieldClassKey(key) {
  return String(key || "field")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "field";
}

function getDirectoryTableCellClass(sectionId, key, index) {
  const longTextKeys = new Set(["name", "group", "owner", "description", "usage", "annotation", "impact", "scope", "workMode", "maintenance"]);
  const compactKeys = new Set([
    "code",
    "unitType",
    "planningStatus",
    "unitsPerHour",
    "capacity",
    "workSchedule",
    "status",
    "type",
    "participatesInPlanning",
    "participatesInCalculation",
    "baseCph",
    "efficiency",
    "changeoverMin",
    "coefficient",
    "placementsPerHour",
    "setupSeconds",
    "defaultCount",
  ]);
  return [
    index === 0 ? "primary-cell" : "",
    `is-key-${getDirectoryFieldClassKey(key)}`,
    longTextKeys.has(key) ? "is-long-text" : "",
    compactKeys.has(key) ? "is-compact-value" : "",
  ].filter(Boolean).join(" ");
}

function renderDirectoryTableHead(directoryData) {
  return `
    <thead>
      <tr>
        ${directoryData.columns.map((column, index) => {
          const key = directoryData.keys[index];
          const className = getDirectoryTableCellClass(directoryData.sectionId, key, index)
            .replace(/\bprimary-cell\b/g, "is-primary-field")
            .replace(/\s+/g, " ")
            .trim();
          return `<th class="${escapeAttribute(className)}">${renderDirectoryColumnFilter(directoryData, key, column)}</th>`;
        }).join("")}
        ${directoryData.readOnly ? "" : '<th class="actions-cell">Действия</th>'}
      </tr>
    </thead>
  `;
}

function renderDirectoryColumnFilter(directoryData, key, column) {
  const options = getDirectoryColumnFilterOptions(directoryData, key);
  const selectedValues = getDirectoryColumnFilterValues(directoryData.sectionId, key);
  const selectedSet = new Set(selectedValues);
  const isActive = selectedValues.length > 0;
  const selectedCount = isActive ? selectedValues.length : options.length;
  const fieldId = `${directoryData.sectionId}:${key}`;

  return `
    <details class="directory-column-filter ${isActive ? "is-active" : ""}" data-ui-component="Dropdown" data-directory-filter="${escapeAttribute(fieldId)}">
      <summary title="Фильтр по колонке ${escapeAttribute(column)}">
        ${icon("filter")}
        <span>${escapeHtml(column)}</span>
        <em>${isActive ? `${selectedCount}/${options.length}` : ""}</em>
      </summary>
      <div class="directory-filter-menu" role="group" aria-label="Фильтр по колонке ${escapeAttribute(column)}">
        <label class="directory-filter-option is-all">
          <input type="checkbox" data-directory-filter-all ${selectedCount === options.length ? "checked" : ""} />
          <span>Выбрать все</span>
          <em>${options.length}</em>
        </label>
        <div class="directory-filter-options">
          ${options.map((option) => {
            const checked = !isActive || selectedSet.has(option.value);
            return `
              <label class="directory-filter-option" data-directory-filter-option-row="${escapeAttribute(normalizeDirectoryFilterSearch(option.value))}">
                <input type="checkbox" data-directory-filter-option value="${escapeAttribute(option.value)}" ${checked ? "checked" : ""} />
                <span>${escapeHtml(option.value)}</span>
                <em>${option.count}</em>
              </label>
            `;
          }).join("")}
        </div>
        <div class="directory-filter-actions">
          <button type="button" data-directory-filter-reset data-directory-filter-section="${escapeAttribute(directoryData.sectionId)}" data-directory-filter-key="${escapeAttribute(key)}">Сбросить</button>
          <button type="button" data-directory-filter-apply data-directory-filter-section="${escapeAttribute(directoryData.sectionId)}" data-directory-filter-key="${escapeAttribute(key)}">Применить</button>
        </div>
      </div>
    </details>
  `;
}

function renderDirectoryTable(directoryData) {
  const tableClass = directoryData.sectionId === "statuses"
    ? "directory-table directory-status-table"
    : "directory-table";
  const wrapClass = directoryData.sectionId === "statuses"
    ? "directory-table-wrap directory-status-table-wrap"
    : "directory-table-wrap";
  const visibleCount = directoryData.visibleRows.length;
  const countLabel = directoryData.activeFilterCount
    ? `${visibleCount} из ${directoryData.rows.length} записей · ${directoryData.activeFilterCount} фильтр.`
    : `${directoryData.rows.length} записей`;

  return `
    <div class="directory-table-toolbar">
      <strong>${countLabel}</strong>
      <span>${escapeHtml(directoryData.caption)}</span>
    </div>
    <div class="${escapeAttribute(joinUiClasses(wrapClass, "ui-table-wrap"))}" data-layout="table" data-scroll-contract="horizontal-only" data-ui-component="TableWrap">
      <table class="${tableClass}">
        ${renderDirectoryTableHead(directoryData)}
        <tbody>
          ${directoryData.visibleRows.length ? directoryData.visibleRows.map(({ row, rowIndex }) => `
            <tr class="${escapeAttribute(getDirectoryTableRowClass(directoryData.sectionId, row, rowIndex, directoryData.rows))}" data-directory-row="${rowIndex}">
              ${directoryData.keys.map((key, index) => `
                <td class="${escapeAttribute(getDirectoryTableCellClass(directoryData.sectionId, key, index))}">${renderDirectoryCellContent(directoryData.sectionId, key, row[key], row)}</td>
              `).join("")}
              ${directoryData.readOnly ? "" : `
                <td class="actions-cell ui-table-actions">
                  <button class="table-icon-button ui-action-button" data-edit-directory-row="${rowIndex}" type="button" title="Редактировать запись">${icon("edit")}</button>
                  <button class="table-icon-button danger-soft ui-action-button" data-delete-directory-row="${rowIndex}" type="button" title="Удалить запись">${icon("trash")}</button>
                </td>
              `}
            </tr>
          `).join("") : `
            <tr>
              <td class="primary-cell directory-empty-filter-cell" colspan="${directoryData.keys.length + (directoryData.readOnly ? 0 : 1)}">
                <strong>Нет строк по текущим фильтрам</strong>
                <span>Сбросьте фильтры или выберите другие значения в заголовках колонок.</span>
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function getDirectoryTableRowClass(sectionId, row, rowIndex, rows = []) {
  return [
    getSelectedDirectoryRowIndex(sectionId, rows) === rowIndex ? "is-selected" : "",
    sectionId === "statuses" ? `is-status-audit-${getStatusAuditInfo(row).tone}` : "",
  ].filter(Boolean).join(" ");
}

function renderDirectoryCellContent(sectionId, key, value, row = {}) {
  if (sectionId === "statuses" && key === "audit") {
    const audit = getStatusAuditInfo(row);
    return `<span class="status-audit-token is-${escapeAttribute(audit.tone)}" title="${escapeAttribute(audit.meta)}">${escapeHtml(audit.label)}</span>`;
  }
  if (sectionId === "statuses" && key === "impactView") {
    return renderStatusImpactCell(row);
  }
  return escapeHtml(formatDirectoryCell(sectionId, key, value));
}

function getStatusUsedInText(row = {}) {
  return getStatusImpactMap(row).modules.join(" · ");
}

function getStatusImpactView(row = {}) {
  return getStatusImpactParts(row)
    .map((part) => `${part.label}: ${part.value}`)
    .join(" | ");
}

function renderStatusImpactCell(row = {}) {
  return `
    <div class="status-impact-cell">
      ${getStatusImpactParts(row).map((part) => `
        <span>
          <b>${escapeHtml(part.label)}</b>
          <em>${escapeHtml(part.value)}</em>
        </span>
      `).join("")}
    </div>
  `;
}

function getStatusImpactRoleDescription(decision = "") {
  return {
    "Ядро": "хранится как состояние объекта и участвует в жизненном цикле",
    "Расчетный": "вычисляется из данных, вручную хранить нежелательно",
    "Флаг": "работает как настройка/boolean, а не как производственный статус",
    "UI-индикатор": "показывает расчетную подпись интерфейса без отдельного бизнес-состояния",
    "Без влияния": "задает визуальный язык и не меняет данные или расчеты",
    "Проверить": "требует ручной ревизии перед удалением или переносом",
  }[decision] || "требует ручной ревизии перед удалением или переносом";
}

function getStatusImpactParts(row = {}) {
  const impact = getStatusImpactMap(row);
  const changes = String(row.impact || impact.changes || row.annotation || "визуальное состояние строки").trim();
  const blocks = String(impact.blocks || "не блокирует напрямую").trim();
  const deleteRule = String(impact.deleteRule || "можно удалить после проверки связей").trim();
  return [
    {
      label: "Роль",
      value: `${impact.decision}: ${getStatusImpactRoleDescription(impact.decision)}`,
    },
    {
      label: "Где применяется",
      value: impact.modules.join(" · "),
    },
    {
      label: "Что меняет",
      value: changes,
    },
    {
      label: "Что блокирует",
      value: blocks,
    },
    {
      label: "Удаление/перенос",
      value: deleteRule,
    },
  ];
}

function renderDirectoryDetail(activeSection, directoryData) {
  const firstRow = directoryData.rows[getSelectedDirectoryRowIndex(activeSection.id, directoryData.rows)];
  const health = getDirectoryHealth(activeSection.id);
  const detailKeys = activeSection.id === "statuses" ? directoryData.keys : directoryData.keys.slice(0, 5);

  return `
    <div class="detail-card-head">
      <span class="eyebrow">Контекст</span>
      <h3>${escapeHtml(firstRow?.[directoryData.keys[0]] || activeSection.label)}</h3>
    </div>
    <dl class="directory-detail-list">
      ${firstRow ? detailKeys.map((key) => {
        const columnIndex = directoryData.keys.indexOf(key);
        return `
        <div>
          <dt>${escapeHtml(directoryData.columns[columnIndex] || key)}</dt>
          <dd>${escapeHtml(formatDirectoryCell(activeSection.id, key, firstRow[key]))}</dd>
        </div>
      `;
      }).join("") : `
        <div><dt>Состояние</dt><dd>Нет записей</dd></div>
      `}
    </dl>
    ${activeSection.id === "statuses" && firstRow ? renderStatusImpactMap(firstRow) : ""}
    <div class="directory-health">
      <div>
        <strong>${health.ready}</strong>
        <span>готово к планированию</span>
      </div>
      <div>
        <strong>${health.review}</strong>
        <span>требует проверки</span>
      </div>
    </div>
  `;
}

function renderStatusImpactMap(row = {}) {
  const impact = getStatusImpactMap(row);
  const lifecycle = getStatusLifecycleModules(row);
  const transitionText = getStatusTransitionView(row);
  const nextDocumentText = getStatusNextDocumentView(row);
  return `
    <section class="status-impact-map" aria-label="Карта влияния статуса">
      <div class="status-impact-head">
        <span>Карта влияния</span>
        <strong>${escapeHtml(row.name || row.code || "Статус")}</strong>
        <em class="is-${escapeAttribute(impact.decisionTone)}">${escapeHtml(impact.decision)}</em>
      </div>
      <div class="status-impact-grid">
        <article>
          <span>Стартовый модуль</span>
          <strong>${escapeHtml(row.originModule || lifecycle.originModule)}</strong>
        </article>
        <article>
          <span>Где меняется</span>
          <strong>${escapeHtml(row.changeModule || lifecycle.changeModule)}</strong>
        </article>
        <article>
          <span>Переход</span>
          <strong>${escapeHtml(transitionText)}</strong>
        </article>
        <article>
          <span>Следующий документ</span>
          <strong>${escapeHtml(nextDocumentText)}</strong>
        </article>
        <article>
          <span>Где используется</span>
          <strong>${escapeHtml(impact.modules.join(" · "))}</strong>
        </article>
        <article>
          <span>Что блокирует</span>
          <strong>${escapeHtml(impact.blocks)}</strong>
        </article>
        <article>
          <span>Что меняет</span>
          <strong>${escapeHtml(impact.changes)}</strong>
        </article>
        <article>
          <span>Можно ли удалить</span>
          <strong>${escapeHtml(impact.deleteRule)}</strong>
        </article>
      </div>
      <p>${escapeHtml(impact.note)}</p>
    </section>
  `;
}

function getStatusContractKey(row = {}) {
  const scope = String(row.contractScope || "").trim();
  const code = String(row.code || "").trim();
  return scope && code ? `${scope}:${code}` : "";
}

function getStatusContractView(row = {}) {
  const key = getStatusContractKey(row);
  if (!key || !MES_STATUS_CONTRACT_KEYS.has(key)) return "вне contract-ядра";
  const contract = getMesStatusView(row.contractScope, row.code);
  return `${key} · ${contract.kind}`;
}

function getStatusFlowTransitions(row = {}) {
  const scope = String(row.contractScope || "").trim();
  const code = String(row.code || "").trim();
  if (!scope || !code) return [];
  return getMesFlowTransitionsForStatus(scope, code);
}

function getStatusTransitionView(row = {}) {
  const transitions = getStatusFlowTransitions(row);
  if (!transitions.length) {
    return getStatusContractKey(row) ? "не задается переходом" : "нет contract-перехода";
  }
  return transitions
    .map((transition) => `${transition.sourceModule} → ${transition.targetModule}: ${transition.actionLabel}`)
    .join(" · ");
}

function getStatusNextDocumentView(row = {}) {
  const transitions = getStatusFlowTransitions(row);
  if (!transitions.length) return "не задан";
  return [...new Set(transitions.map((transition) => getMesDocumentKind(transition.to).label))]
    .join(" · ");
}

function getStatusImpactMap(row = {}) {
  const id = String(row.id || "").trim();
  const code = String(row.code || "").trim();
  const contractScope = String(row.contractScope || "").trim();
  const group = normalizeLookupText(row.group || "");
  const type = normalizeLookupText(row.type || "");
  const name = normalizeLookupText(row.name || "");

  const makeImpact = (config = {}) => ({
    modules: config.modules || ["Справочники"],
    blocks: config.blocks || "не блокирует напрямую",
    changes: config.changes || row.impact || row.annotation || "визуальное состояние строки",
    deleteRule: config.deleteRule || "можно удалить после проверки связей",
    decision: config.decision || "Проверить",
    decisionTone: config.decisionTone || "warning",
    note: config.note || "Это предварительная карта влияния: она помогает понять, является ли статус бизнес-состоянием, сигналом или кандидатом на удаление.",
  });

  if (contractScope && code && MES_STATUS_CONTRACT_KEYS.has(`${contractScope}:${code}`)) {
    const contract = getMesStatusView(contractScope, code);
    if (contract?.modules?.length) {
      return makeImpact({
        modules: contract.modules,
        blocks: contract.blocks,
        changes: contract.changes,
        deleteRule: contract.deleteRule,
        decision: ["executionStatus", "planningStatus", "shiftStatus", "factStatus", "lifecycleStatus"].includes(contract.kind) ? "Ядро" : "Проверить",
        decisionTone: ["executionStatus", "planningStatus", "shiftStatus", "factStatus", "lifecycleStatus"].includes(contract.kind) ? "critical" : "warning",
        note: `Контракт ${contract.scope || contractScope}: ${contract.kind}. Это значение должно меняться через общий слой статусов, а не локально в UI.`,
      });
    }
  }

  if (id.startsWith("signal-")) {
    return makeImpact({
      modules: ["UI-состояния", "Визуальный язык"],
      blocks: "ничего не блокирует",
      changes: "только цвет, подпись и визуальную семантику интерфейса",
      deleteRule: "можно убрать из бизнес-статусов; оставить как дизайн-токен",
      decision: "Без влияния",
      decisionTone: "muted",
      note: "Это чистый визуальный сигнал. Он не хранит состояние объекта и не меняет расчет или процесс.",
    });
  }

  if (id.startsWith("planning-flow-") || id.startsWith("planning-passport-")) {
    return makeImpact({
      modules: ["Заказ-наряды", "UI"],
      blocks: "самостоятельно ничего не блокирует",
      changes: "подписи, плашки и подсказки, которые выводятся из других данных",
      deleteRule: "можно убрать из справочника статусов и оставить как расчетный UI-текст",
      decision: "UI-индикатор",
      decisionTone: "muted",
      note: "Это не состояние, которое пользователь должен вести руками. Его можно вычислять из маршрута, слотов, ERP-полей или состава.",
    });
  }

  if (id.startsWith("slot-") || type.includes("операция gantt")) {
    const isCompleted = code === "completed";
    const isProblem = code === "problem" || code === "overdue";
    return makeImpact({
      modules: ["Планирование", "Гант", "Заказ-наряды", "Мастерская", "Диспетчерская"],
      blocks: isCompleted
        ? "перетаскивание, пересчет и часть правок завершенной операции"
        : isProblem ? "не блокирует, но поднимает критический сигнал" : "не блокирует напрямую",
      changes: isCompleted
        ? "прогресс маршрута, доступность редактирования, пересчеты календаря"
        : "цвет колбаски, фильтры, отчеты, состояние сменных заданий",
      deleteRule: "нельзя удалять без замены в модели операций",
      decision: "Ядро",
      decisionTone: "critical",
      note: "Это состояние операции на Ганте. Его удаление меняет не только подпись, но и поведение слота.",
    });
  }

  if (id.startsWith("route-") || type.includes("заказ") || type.includes("маршрут")) {
    return makeImpact({
      modules: ["Заказ-наряды", "Маршрутные карты", "Планирование", "Гант"],
      blocks: code === "canceled" ? "активное размещение отмененного заказ-наряда" : "повторную трактовку очереди без явного состояния",
      changes: "очередь заказ-нарядов, передачу в Гант, отмену, признак частичного размещения",
      deleteRule: "оставить минимум: черновик / в планировании / отменен",
      decision: "Ядро",
      decisionTone: "critical",
      note: "Это состояние документа, а не декоративный бейдж. Его можно сокращать, но нельзя просто стереть.",
    });
  }

  if (id.startsWith("dispatch-")) {
    return makeImpact({
      modules: ["Диспетчерская", "Мастерская"],
      blocks: code === "not_reported" ? "различение пустого факта и факта с нулем" : "закрытие сменного факта без явного результата",
      changes: "план/факт смены, отклонения, проблемные сменные заказ-наряды",
      deleteRule: "нельзя удалять до замены расчетом факта",
      decision: "Ядро",
      decisionTone: "critical",
      note: "Фактический статус нужен, чтобы диспетчер видел, что именно произошло со сменным заданием.",
    });
  }

  if (id.startsWith("fulfillment-") || ["not_selected", "produce", "from_stock", "purchase", "external"].includes(code)) {
    return makeImpact({
      modules: ["Спецификации", "Маршрутные карты", "Заказ-наряды", "Складской контур", "Снабжение"],
      blocks: code === "not_selected" ? "передачу заказ-наряда в Гант до выбора обеспечения" : "ошибочную маршрутизацию состава",
      changes: "правила обеспечения состава: производить, взять со склада, купить или вынести наружу",
      deleteRule: "это не статус, а режим обеспечения; удалять нельзя",
      decision: "Ядро",
      decisionTone: "critical",
      note: "Эти строки лучше переименовать из статусов в режимы обеспечения, но бизнес-логику надо сохранить.",
    });
  }

  if (id.startsWith("planning-supply-")) {
    return makeImpact({
      modules: ["Заказ-наряды", "Маршрутные карты", "Спецификации"],
      blocks: name.includes("нуж") || name.includes("выберите") || name.includes("уберите")
        ? "передачу заказ-наряда в Гант до исправления состава/маршрута"
        : "не блокирует напрямую",
      changes: "готовность ветки состава, предупреждения, список причин блокировки",
      deleteRule: "перевести в расчетные сигналы, не хранить как ручные статусы",
      decision: "Расчетный",
      decisionTone: "ok",
      note: "Это хороший кандидат на автоматический сигнал: он должен вычисляться из состава и операций.",
    });
  }

  if (code === "active" || code === "inactive" || code === "Активен" || code === "Отключен" || name.includes("актив") || name.includes("отключ")) {
    return makeImpact({
      modules: ["Справочники", "Ресурсы", "Расчеты", "Гант"],
      blocks: "участие отключенных ресурсов и отделов в планировании",
      changes: "доступность отдела/ресурса, участие в расчетах и выбор в формах",
      deleteRule: "оставить как технический флаг активности, не как статусный шум",
      decision: "Флаг",
      decisionTone: "warning",
      note: "Это лучше воспринимать как boolean-флаг активности, а не как производственный статус.",
    });
  }

  if (code === "yes" || code === "no" || name === "да" || name === "нет") {
    return makeImpact({
      modules: ["Справочники", "Ресурсы"],
      blocks: "участие ресурса в планировании или расчете",
      changes: "попадание ресурса в варианты выбора и формулы",
      deleteRule: "перевести в отдельные флаги, из справочника статусов убрать",
      decision: "Флаг",
      decisionTone: "warning",
      note: "Это не статус. Это настройка участия, ее нужно держать отдельно от жизненных состояний.",
    });
  }

  if (group.includes("производство") || group.includes("планирование")) {
    return makeImpact({
      modules: ["Производственные модули"],
      blocks: "зависит от конкретного использования",
      changes: row.impact || "производственные фильтры и сигналы",
      deleteRule: "проверить вручную перед удалением",
      decision: "Проверить",
      decisionTone: "warning",
      note: "Статус похож на производственный, но требует ручной проверки связей.",
    });
  }

  return makeImpact();
}

function getStatusAuditInfo(row = {}) {
  const id = String(row.id || "").trim();
  const impact = getStatusImpactMap(row);

  if (impact.decision === "Без влияния") {
    return {
      label: "Без влияния",
      tone: "visual",
      meta: "Чистый визуальный сигнал: не хранит бизнес-состояние и не меняет расчеты.",
    };
  }

  if (impact.decision === "UI-индикатор") {
    return {
      label: "UI-индикатор",
      tone: "visual",
      meta: "Расчетная подпись экрана: можно убрать из справочника статусов и вычислять из данных.",
    };
  }

  if (impact.decision === "Расчетный") {
    return {
      label: "Расчетный",
      tone: "computed",
      meta: "Не должен храниться вручную, но отражает реальную проверку данных.",
    };
  }

  if (impact.decision === "Флаг") {
    return {
      label: "Флаг",
      tone: "flag",
      meta: "Лучше хранить как настройку/boolean, а не как статус жизненного цикла.",
    };
  }

  if (impact.decision === "Ядро") {
    return {
      label: "Ядро",
      tone: "core",
      meta: "Влияет на сценарии, расчеты, блокировки или жизненный цикл объекта.",
    };
  }

  return {
    label: "Проверить",
    tone: "review",
    meta: "Нужно проверить вручную перед удалением или переносом.",
  };
}

const {
  getDirectoryData,
  makeDirectoryData,
  normalizeDirectoryColumnFilters,
  getDirectorySectionFilters,
  getDirectoryColumnFilterValues,
  getDirectoryActiveFilterCount,
  getDirectoryFilterCellValue,
  getDirectoryFilterToken,
  normalizeDirectoryFilterSearch,
  directoryRowMatchesColumnFilters,
  getDirectoryColumnFilterOptions,
  setDirectoryColumnFilter,
  clearDirectoryColumnFilter,
  clearDirectorySectionFilters,
  getDirectoryFieldType,
  isDirectoryFieldReadonly,
  getSelectedDirectoryRowIndex,
  formatDirectoryCell,
  getDirectorySectionLabel,
  getDirectoryRowLabel,
  renderDirectoryEditorModal,
  renderDirectoryReaderModal,
  renderDirectoryField,
  createEmptyDirectoryRow,
  getDirectoryHealth,
  clearDenseInlineSelectPopover,
  closeDenseInlineSelects,
  positionDenseInlineSelectPopover,
  updateOpenDenseInlineSelectPopovers,
  bindDenseInlineSelectViewportEvents,
  bindGlobalNavigation,
  performAuthLogout,
  bindAuthLogoutNavigation,
  isElementVisibleForInteraction,
  getModuleMenuButtonFromEventTarget,
  openModuleFromMenuButton,
  bindModuleMenuNavigation,
  bindMobileModuleSwitcherBehavior,
  exposeMesRuntimeApi,
  navigateToModule,
  openConfirmDialog,
  bindConfirmEvents,
  performConfirmedAction,
  bindDirectoryEvents,
} = createAppInteractionsModule({
  addMs,
  app,
  audit,
  bindDirectoryForm,
  bom,
  BOM_COMPONENT_FIELDS,
  cancelAuthPrototypePinFeedback,
  cancelPlanningRoute,
  canEditDirectorySection,
  cascadeBatchFromSlot,
  center,
  config,
  count,
  deleteDirectoryRow,
  deleteOperationMapItem,
  deleteRouteMapConfirmed,
  denseInlineViewportListenersBound,
  directorySections,
  element,
  employeeId,
  enabled,
  escapeAttribute,
  escapeHtml,
  executors,
  field,
  form,
  getAvailableModules,
  getModuleDefinitions,
  getOperationMapRows,
  getPlanningWorkCenters,
  getRouteInstructionWorkCenterId,
  getRouteInstructionWorkCenters,
  getShiftMasterBoardModel,
  getStatusAuditInfo,
  getStatusContractView,
  getStatusImpactView,
  getStatusLifecycleModules,
  getStatusNextDocumentView,
  getStatusRegistryKindLabel,
  getStatusTransitionView,
  getStatusUsedInText,
  getWorkCenter,
  icon,
  id,
  item,
  key,
  label,
  lockAuthGate,
  makeId,
  masterId,
  mobileModuleSwitcherBehaviorBound,
  mode,
  mountGlobalVisualSystem,
  name,
  normalizeDirectorySectionId,
  normalizeLookupText,
  normalizeShiftMasterBoardQuantity,
  normalizeShiftWorkOrderIssueReports,
  option,
  persistState,
  persistUiState,
  runLongTask,
  render,
  renderUiFormActions,
  renderUiFormField,
  renderUiFormGrid,
  renderUiModalFrame,
  renderPreservingModuleScroll,
  resource,
  rowId,
  saveShiftMasterBoardAssignment,
  sectionId,
  selected,
  specification,
  toDateInput,
  type,
  updateModuleUrlParam,
  value,
  values,
  WORK_MODE_OPTIONS,
  getUi: () => ui,
  getPlanningState: () => planningState,
  getDirectoryState: () => directoryState,
});

function bindRouteStepDenseSelectEvents(root = app) {
  root.querySelectorAll("[data-dense-route-step-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (button.disabled) return;
      const root = button.closest("[data-dense-route-step-field]");
      if (!root) return;
      updateRouteStepField(root.dataset.routeStepId, root.dataset.denseRouteStepField, button.dataset.denseValue || "");
    });
  });
}

function bindGenericModalCloseEvents(root = app) {
  root.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      closeModals();
    });
  });
}

let planningWorkbenchRefreshSequence = 0;

function applyPlanningWorkItemSelection(itemId = "") {
  app.querySelectorAll("[data-planning-work-item]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.planningWorkItem === itemId);
  });
  app.querySelectorAll("[data-planning-order-row]").forEach((element) => {
    element.classList.toggle("is-selected", element.dataset.planningOrderRow === itemId);
  });
}

function applyPlanningRouteSelection(routeId = "") {
  app.querySelectorAll("[data-planning-route-open]").forEach((element) => {
    element.classList.toggle("is-active", element.dataset.planningRouteOpen === routeId);
  });
}

function schedulePlanningWorkbenchRefresh() {
  const sequence = ++planningWorkbenchRefreshSequence;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (sequence !== planningWorkbenchRefreshSequence) return;
      refreshPlanningWorkbench();
    });
  });
}

function bindPlanningEvents(root = app) {
  bindRouteStepDenseSelectEvents(root);
  bindGenericModalCloseEvents(root);

  root.querySelectorAll("[data-planning-order-tree-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nodeId = button.dataset.planningOrderTreeToggle || "";
      if (!nodeId) return;
      const collapsedTreeIds = new Set((planningState.planningOrderCollapsedTreeIds || []).map(String));
      if (collapsedTreeIds.has(nodeId)) collapsedTreeIds.delete(nodeId);
      else collapsedTreeIds.add(nodeId);
      planningState.planningOrderCollapsedTreeIds = [...collapsedTreeIds];
      persistState();
      schedulePlanningWorkbenchRefresh();
    });
  });

  root.querySelectorAll("[data-planning-work-item]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const itemId = event.currentTarget.dataset.planningWorkItem || "";
      ui.planningWorkItem = itemId;
      persistUiState();
      schedulePlanningWorkbenchRefresh();
    });
  });

  root.querySelectorAll("[data-planning-order-row]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, textarea, a, label")) return;
      const itemId = event.currentTarget.dataset.planningOrderRow || "";
      ui.planningWorkItem = itemId;
      persistUiState();
      schedulePlanningWorkbenchRefresh();
    });
  });

  root.querySelectorAll("[data-planning-start-date]").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
      syncPlanningRouteStartDate(input.dataset.planningStartDate || "", input.value);
    });

    input.addEventListener("change", () => {
      syncPlanningRouteStartDate(input.dataset.planningStartDate || "", input.value);
    });
  });

  root.querySelectorAll("[data-planning-route-quantity-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const routeId = form.dataset.planningRouteQuantityForm || "";
      const quantity = new FormData(form).get("quantity");
      if (!await changePlanningRouteQuantity(routeId, quantity, {
        updateSlots: true,
        message: "Тираж заказ-наряда и незавершённые операции пересчитаны",
      })) {
        alert("Укажите целое количество изделий больше нуля.");
      }
    });
  });

  root.querySelectorAll("[data-planning-boards-per-panel]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
      syncPlanningBoardsPerPanel(
        input.dataset.planningBppRoute || "",
        input.dataset.planningBoardsPerPanel || "",
        input.value,
      );
    });

    input.addEventListener("change", () => {
      syncPlanningBoardsPerPanel(
        input.dataset.planningBppRoute || "",
        input.dataset.planningBoardsPerPanel || "",
        input.value,
      );
    });
  });

  root.querySelectorAll("[data-planning-labor-note]").forEach((field) => {
    const commit = () => {
      const key = field.dataset.planningLaborNote || "";
      if (!key) return;
      ui.planningLaborNoteByRow = normalizePlanningLaborNoteByRow({
        ...(ui.planningLaborNoteByRow || {}),
        [key]: field.value,
      });
      persistUiState();
    };
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      field.blur();
      commit();
    });
    field.addEventListener("input", commit);
    field.addEventListener("change", commit);
  });

  root.querySelectorAll("[data-planning-order-labor]").forEach((field) => {
    const commit = (options = {}) => {
      const key = field.dataset.planningOrderLabor || "";
      const dataField = field.dataset.planningOrderLaborField || field.dataset.planningManualField || "";
      if (!key || !dataField) return;
      const { routeId, stepId } = parsePlanningOrderLaborKey(key);
      const updatedRoute = setPlanningOrderLaborSetting(routeId, stepId, dataField, field.value);
      if (!updatedRoute) return;
      const updatedSlots = options.sync === false ? 0 : syncPlanningManualLaborToStepSlots(key, { persist: false });
      persistState();
      if (updatedSlots && options.notify !== false) {
        notifySaveSuccess(`Трудозатраты обновлены в Ганте: ${updatedSlots.toLocaleString("ru-RU")} слотов`);
      }
      if (options.render) renderPreservingModuleScroll();
    };
    field.addEventListener("click", (event) => event.stopPropagation());
    field.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Enter") return;
      event.preventDefault();
      field.blur();
      commit({ render: true });
    });
    field.addEventListener("input", () => {
      if (field.value === "") return;
      commit({ notify: false });
    });
    field.addEventListener("change", () => commit({ render: true }));
    field.addEventListener("blur", () => commit({ render: true }));
  });

  root.querySelectorAll("[data-planning-supply-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      updatePlanningSupplyFulfillment(
        button.dataset.planningSupplyRoute || "",
        button.dataset.planningSupplyItem || "",
        button.dataset.planningSupplyMode || "not_selected",
      );
    });
  });

  root.querySelectorAll("[data-planning-route-to-gantt]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const routeId = event.currentTarget.dataset.planningRouteToGantt || "";
      await runLongTask(
        async () => {
          const projectionReady = await ensurePlanningRuntimeProjection();
          if (!projectionReady) throw new Error("Не удалось подготовить производственный план для размещения заказа-наряда");
          await ensurePlanningSystemDomains();
          return schedulePlanningRouteToGantt(routeId);
        },
        {
          title: "Размещаем заказ-наряд",
          detail: "Рассчитываем последовательность операций и доступность производственных участков",
        },
      );
    });
  });

  root.querySelector("[data-planning-route-cancel]")?.addEventListener("click", (event) => {
    const routeId = event.currentTarget.dataset.planningRouteCancel || "";
    if (!routeId) return;
    openConfirmDialog("planningCancelRoute", { routeId });
  });

  root.querySelectorAll("[data-planning-route-open]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const routeId = event.currentTarget.dataset.planningRouteOpen || "";
      const route = planningState.routes.find((item) => item.id === routeId);
      if (!route) return;
      ui.activeRouteId = route.id;
      ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || "";
      ui.planningWorkItem = "";
      persistUiState();
      applyPlanningRouteSelection(route.id);
      schedulePlanningWorkbenchRefresh();
    });
	  });
	}

function bindShiftCalendarEvents() {
  const dateField = app.querySelector("[data-shift-calendar-date]");
  dateField?.addEventListener("change", (event) => {
    setShiftWorkbenchDate(event.target.value);
  });

  app.querySelectorAll("[data-shift-calendar-step]").forEach((button) => {
    button.addEventListener("click", () => {
      moveShiftWorkbenchDate(button.dataset.shiftCalendarStep || 0);
    });
  });

  app.querySelector("[data-shift-calendar-today]")?.addEventListener("click", () => {
    setShiftWorkbenchToday();
  });

  app.querySelectorAll("[data-shift-calendar-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const inputId = button.dataset.shiftCalendarOpen || "";
      const field = inputId
        ? app.querySelector(`#${CSS.escape(inputId)}`)
        : dateField;
      if (!field) return;
      field.focus({ preventScroll: true });
      if (typeof field.showPicker === "function") {
        field.showPicker();
      }
    });
  });
}

function applyOperationMapChangesToRoutes(operation) {
  if (!operation?.id) return;
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    if (step.operationId !== operation.id) return step;
    const nextWorkCenterId = step.workCenterOverride ? step.workCenterId : getOperationRouteWorkCenterId(operation);
    return {
      ...step,
	      operationName: operation.name || step.operationName,
	      workCenterId: nextWorkCenterId,
	      unitsPerHour: operation.unitsPerHour || step.unitsPerHour || getWorkCenterUnitsPerHour(nextWorkCenterId),
	      calculationType: step.calculationType || getDefaultOperationCalculationType(nextWorkCenterId, operation),
	      secondsPerPanel: step.secondsPerPanel || getDefaultSecondsPerPanel(nextWorkCenterId, step.boardsPerPanel || 1),
	      requiresBatch: operation.requiresBatch,
	      isWarehouseOperation: operation.isWarehouse,
	      updatedAt: new Date().toISOString(),
	    };
  });
  const linkedStepById = new Map((planningState.routeSteps || [])
    .filter((step) => step.operationId === operation.id)
    .map((step) => [step.id, step]));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const step = linkedStepById.get(slot.routeStepId);
    if (!step || slot.locked || isGanttSlotCompleted(slot)) return slot;
    const keepSlotWorkCenter = isPlanningWorkCenterCompatibleWithRouteStep(step, slot.workCenterId, planningState);
    const assignment = keepSlotWorkCenter ? null : getManualPlanningAssignmentForRouteStep(step, slot.quantity || 1, slot.plannedStart || fromDateInput(ui.windowStart), {
      state: planningState,
      ignoreSlotId: slot.id,
      currentWorkCenterId: slot.workCenterId,
    });
    const planningWorkCenterId = keepSlotWorkCenter
      ? slot.workCenterId
      : assignment?.workCenterId || slot.workCenterId;
    const resourceId = getPlanningResourceForRouteStep(step, planningWorkCenterId, slot.resourceId || step.resourceId || "");
    const route = getRouteForStep(step);
    const nextSlot = applyPlanningOrderLaborToSlot({
      ...slot,
      operationId: step.operationId || slot.operationId || "",
      operationName: step.operationName || slot.operationName,
	      routeWorkCenterId: step.workCenterId || slot.routeWorkCenterId || "",
	      workCenterId: planningWorkCenterId || slot.workCenterId,
	      unitsPerHour: step.unitsPerHour || slot.unitsPerHour,
	      resourceId,
	      calculationType: step.calculationType || slot.calculationType || "",
	      secondsPerPanel: step.secondsPerPanel || slot.secondsPerPanel || 0,
	      setupMin: step.setupMin || slot.setupMin || 0,
	      bomListId: step.bomListId || slot.bomListId || "",
	      updatedAt: new Date().toISOString(),
	    }, route, step, slot.quantity || 1, { workCenterId: planningWorkCenterId });
    return recalculateSlotEndByQuantity(nextSlot, planningState);
	  });
	}

function deleteOperationMapItem(operationId) {
  const operation = getOperationMapItem(operationId);
  if (!operation) return;
  directoryState.operationMap = (directoryState.operationMap || []).filter((item) => item.id !== operationId);
  const affectedStepIds = new Set((planningState.routeSteps || [])
    .filter((step) => step.operationId === operationId)
    .map((step) => step.id));
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => (
    step.operationId === operationId
      ? { ...step, operationId: "", operationName: "", updatedAt: new Date().toISOString() }
      : step
  ));
  planningState.slots = (planningState.slots || []).map((slot) => (
    affectedStepIds.has(slot.routeStepId)
      ? { ...slot, operationId: "", operationName: "", updatedAt: new Date().toISOString() }
      : slot
  ));
  directoryState.specifications = (directoryState.specifications || []).map((specification) => {
    if (!Array.isArray(specification.structureItems) || !specification.structureItems.some((item) => item.operationId === operationId)) return specification;
    return {
      ...specification,
      structureItems: specification.structureItems.map((item) => (
        item.operationId === operationId
          ? { ...item, operationId: "", operationName: "", departmentName: "" }
          : item
      )),
      updatedAt: new Date().toISOString(),
    };
  });
  if (ui.activeOperationId === operationId) ui.activeOperationId = "";
  persistDirectoryState();
  persistState();
  persistUiState();
  notifySaveSuccess("Операция удалена");
  render();
}

const {
  bindRoutesEvents,
  saveRouteModuleForm,
  updateRouteProject,
  updateRouteStepField,
  appendRouteTaskTemplateSteps,
  seedRouteTaskTemplate,
  seedAllRouteTaskTemplates,
  getDefaultOperationMapItemForRouteKind,
  createRouteStepFromOperationMapItem,
  createEmptyRouteModuleStep,
  bindSpekiEvents,
  bindNomenclatureEvents,
  bindBomListsEvents,
  getRouteStepAddTargetTaskId,
  addRouteModuleStep,
  moveRouteStep,
  normalizeRouteStepOrders,
  deleteRouteStepConfirmed,
} = createRoutesEventsModule({
  addMs,
  app,
  applyOperationMapItemToRouteStep,
  batchIds,
  bindGenericModalCloseEvents,
  bindRouteStepDenseSelectEvents,
  BOARD_SPEC_TERM,
  boardsPerPanel,
  BOM_COMPONENT_FIELDS,
  bomId,
  bomListId,
  buildDefaultSpecificationStructureItems,
  button,
  createProductsEventsModule,
  createSpekiSpecification,
  currentWorkCenterId,
  deleteDirectoryStateRow,
  departmentName,
  element,
  ensureRouteTaskSeedSteps,
  entry,
  field,
  findOperationMapItemByNameAndWorkCenter,
  form,
  fromDateInput,
  generateChildRouteCardsForActiveRoute,
  getActiveRouteForModule,
  getDefaultOperationCalculationType,
  getDefaultSecondsPerPanel,
  getDefaultStructureFulfillmentMode,
  getDefaultStructureNomenclatureType,
  getExecutionTypeForFulfillmentMode,
  getActiveSpecificationForModule,
  getBomList,
  getManualPlanningAssignmentForRouteStep,
  getOperationMapItem,
  getOperationMapRows,
  getOperationRouteWorkCenterId,
  getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
  getPlanningResourceForRouteStep,
  getPlanningRouteQuantity,
  getProductionResource,
  getRouteBindingContext,
  getRouteBindingModeForSelection,
  getRouteDocumentKind,
  getRouteForStep,
  getRouteModuleSelectionValue,
  getRoutePlanningContext,
  getRouteProductionContext,
  getRouteProductionId,
  getRouteStepFlowModel,
  getRouteStepPlanningCandidateWorkCenterIds,
  getRouteStepSelectedPlanningWorkCenterId,
  getRouteStepsForModule,
  getRouteStepsForTask,
  getRouteStepTaskId,
  getRouteTasksForModule,
  getSlotPlanningOrderId,
  getSlotRouteId,
  getSpecificationItemFulfillmentMode,
  getSpecificationStructureItems,
  getWorkCenter,
  getWorkCenterUnitsPerHour,
  id,
  importHeaders,
  importRows,
  importBomFromXlsxFile,
  input,
  isGanttSlotCompleted,
  isManufacturingOutputReceiptOperation,
  isManufacturingOutputReceiptRouteStep,
  isPlanningWorkCenterCompatibleWithRouteStep,
  isSchedulableFulfillmentMode,
  isWarehouseWorkCenterId,
  item,
  items,
  makeId,
  makeManualRouteStepFlowItems,
  mapLegacyWorkCenterId,
  mergeFallback,
  message,
  NOMENCLATURE_REA_COMPONENT_TYPE,
  normalizeBoardsPerPanel,
  normalizeDirectoryRow,
  normalizeDirectoryState,
  normalizeOptionalPositiveInteger,
  normalizePlanningState,
  normalizeNomenclatureType,
  normalizeRouteBindingValue,
  normalizeRouteStepCalculationFields,
  normalizeSpecificationStructureItem,
  normalizeStructureFulfillmentMode,
  note,
  notifySaveSuccess,
  openConfirmDialog,
  operationName,
  option,
  options,
  parentId,
  persistDirectoryState,
  persistState,
  persistUiState,
  pickDefaultBomForSpecificationItem,
  PRODUCT_COMPOSITION_TERM,
  rawValue,
  recalculateSlotEndByQuantity,
  recordDirectoryEntityDeletion,
  render,
  renderPreservingModuleScroll,
  resolveRouteModuleProjectId,
  resolveWorkCenterIdFromName,
  routeWorkCenterId,
  secondsPerPanel,
  setupMin,
  slot,
  slotMatchesProductionContext,
  specificationId,
  status,
  structureItems,
  syncSpecificationDerivedFields,
  syncPlanningRouteQuantity,
  toDateInput,
  unitsPerHour,
  withDirectoryEntityRemovalAllowed,
  withPlanningEntityRemovalAllowed,
  getUi: () => ui,
  getPlanningState: () => planningState,
  getDirectoryState: () => directoryState,
  setPlanningState: (nextState) => {
    planningState = nextState;
    dependencies.setPlanningState?.(nextState);
  },
  setDirectoryState: (nextState) => {
    directoryState = nextState;
    dependencies.setDirectoryState?.(nextState);
  },
});

function openProjectInPlanning(productionId, specificationId = "") {
  const specification = specificationId
    ? getSpecificationById(specificationId)
    : getSpecificationByProjectId(productionId);
  const route = getSpecificationRouteForModule(specification?.id || "")
    || getProjectRouteForModule(specification?.id || productionId)
    || getProjectRouteForModule(productionId);
  if (!route) {
    alert("Для планирования нужен существующий маршрут. Создайте маршрутную карту явным действием в модуле «Маршрутная карта».");
    return;
	  }
	  ui.activeModule = "planning";
	  ui.activeRouteId = route.id;
  ui.activeProjectId = getRouteProductionId(route) || specification?.id || productionId || "";
  if (specification?.id) ui.activeSpecificationId = specification.id;
  persistUiState();
  render();
}

function bindDirectoryForm() {
  const form = app.querySelector("#directoryForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const sectionId = String(data.get("sectionId"));
    const rowIndex = Number(data.get("rowIndex"));
    const rowId = String(data.get("rowId") || makeId("dir"));
    const directoryData = getDirectoryData(sectionId);
    if (directoryData.readOnly || !canEditDirectorySection(sectionId)) return;
    const currentRow = rowIndex >= 0 ? directoryData.rows[rowIndex] : {};
    const nextRow = {
      ...currentRow,
      id: currentRow.id || rowId,
    };

    for (const field of directoryData.fields) {
      if (field.readonly) continue;
      if (!data.has(field.key)) continue;
      const rawValue = data.get(field.key);
      nextRow[field.key] = field.type === "number" ? Number(rawValue || 0) : String(rawValue || "").trim();
    }

    const primaryKey = directoryData.keys[0];
    if (!String(nextRow[primaryKey] ?? "").trim()) {
      alert(`Заполните поле "${directoryData.columns[0]}".`);
      return;
    }

    saveDirectoryRow(sectionId, rowIndex, nextRow);
    const nextIndex = rowIndex >= 0 ? rowIndex : getDirectoryData(sectionId).rows.length - 1;
    ui.selectedDirectoryRows[sectionId] = Math.max(0, nextIndex);
    ui.directoryEditor = null;
    persistUiState();
    render();
  });
}

function saveDirectoryRow(sectionId, rowIndex, row) {
  sectionId = normalizeDirectorySectionId(sectionId);
  if (!canEditDirectorySection(sectionId)) return false;
  if (sectionId === "operations") {
    const normalizedOperation = normalizeDirectoryRow("operations", {
      ...row,
      id: row.id || makeId("op"),
      unitsPerHour: row.unitsPerHour || 0,
      requiresBatch: row.requiresBatch === undefined ? !isWarehouseWorkCenterId(row.workCenterId) : row.requiresBatch,
      updatedAt: new Date().toISOString(),
    });
    const operationExists = (directoryState.operationMap || []).some((item) => item.id === normalizedOperation.id);
    directoryState.operationMap = operationExists
      ? (directoryState.operationMap || []).map((item) => item.id === normalizedOperation.id ? normalizedOperation : item)
      : [...(directoryState.operationMap || []), normalizedOperation];
    applyOperationMapChangesToRoutes(normalizedOperation);
    persistDirectoryState();
    persistState();
    notifySaveSuccess(rowIndex >= 0 ? "Операция сохранена" : "Операция создана");
    return;
  }

  const rows = directoryState[sectionId] || [];
  const previousTypeName = sectionId === "nomenclatureTypes" && rowIndex >= 0
    ? rows[rowIndex]?.name || ""
    : "";
  const normalizedRow = normalizeDirectoryRow(sectionId, { ...row, id: row.id || makeId(sectionId.slice(0, 3) || "dir") });
  directoryState = {
    ...directoryState,
    [sectionId]: rowIndex >= 0
      ? rows.map((item, index) => index === rowIndex ? normalizedRow : item)
      : [...rows, normalizedRow],
  };

  if (sectionId === "nomenclatureTypes") {
    syncNomenclatureTypeRename(previousTypeName, normalizedRow.name);
    if (normalizeLookupText(ui.nomenclatureTypeFilter) === normalizeLookupText(previousTypeName)) {
      ui.nomenclatureTypeFilter = normalizedRow.name || "all";
    }
    directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  }

  persistDirectoryState();
  notifySaveSuccess(rowIndex >= 0 ? "Запись справочника сохранена" : "Запись справочника создана");
}

function deleteDirectoryRow(sectionId, rowIndex) {
  sectionId = normalizeDirectorySectionId(sectionId);
  const directoryData = getDirectoryData(sectionId);
  if (directoryData.readOnly || !canEditDirectorySection(sectionId)) return false;
  const index = Number(rowIndex);
  const row = Number.isFinite(index) ? directoryData.rows[index] : null;
  if (!row) return;

  if (sectionId === "operations") {
    ui.directoryEditor = null;
    const nextCount = Math.max(0, getOperationMapRows().length - 1);
    ui.selectedDirectoryRows[sectionId] = nextCount ? Math.min(index, nextCount - 1) : 0;
    deleteOperationMapItem(row.id);
    return;
  }
  deleteDirectoryStateRow(sectionId, row);

  ui.directoryEditor = null;
  const nextRows = getDirectoryData(sectionId).rows;
  ui.selectedDirectoryRows[sectionId] = nextRows.length ? Math.min(index, nextRows.length - 1) : 0;
  if (sectionId === "bomLists" || sectionId === "specifications") {
    withDirectoryEntityRemovalAllowed(() => persistDirectoryState());
  } else {
    persistDirectoryState();
  }
  persistState();
  persistUiState();
  render();
}

function deleteDirectoryStateRow(sectionId, row) {
  const rowId = row.id;
  recordDirectoryEntityDeletion(sectionId, rowId);
  directoryState = {
    ...directoryState,
    [sectionId]: (directoryState[sectionId] || []).filter((item) => item.id !== rowId),
  };

  if (sectionId === "bomLists") {
    directoryState.specifications = (directoryState.specifications || []).map((specification) => syncSpecificationDerivedFields({
      ...specification,
      bomListA: specification.bomListA === rowId ? "" : specification.bomListA,
      bomQtyA: specification.bomListA === rowId ? 0 : specification.bomQtyA,
      bomListB: specification.bomListB === rowId ? "" : specification.bomListB,
      bomQtyB: specification.bomListB === rowId ? 0 : specification.bomQtyB,
      structureItems: getSpecificationStructureItems(specification).map((item) => (
        item.bomListId === rowId ? { ...item, bomListId: "" } : item
      )),
    }));
  }

  if (sectionId === "specifications") {
    const usage = getSpecificationDeleteUsage(rowId);
    directoryState.specifications = (directoryState.specifications || []).map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification)
        .filter((item) => item.specificationId !== rowId),
    }));
    planningState.routes = (planningState.routes || []).filter((route) => !usage.routeIds.has(route.id));
    planningState.routeSteps = (planningState.routeSteps || []).filter((step) => !usage.routeIds.has(step.routeId));
    planningState.slots = (planningState.slots || []).filter((slot) => (
      !usage.routeIds.has(getSlotRouteId(slot, planningState))
      && !usage.routeStepIds.has(slot.routeStepId)
      && !usage.routeIds.has(getSlotPlanningOrderId(slot))
      && !slotMatchesProductionContext(slot, rowId)
    ));
    if (ui.activeSpecificationId === rowId) ui.activeSpecificationId = "";
    if (usage.routeIds.has(ui.activeRouteId)) ui.activeRouteId = "";
    if ((planningState.slots || []).every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
    ui.expandedProjects?.delete?.(rowId);
    usage.routeIds.forEach((routeId) => ui.expandedProjects?.delete?.(routeId));
  }

  if (sectionId === "nomenclature") {
    if (ui.activeNomenclatureId === rowId) ui.activeNomenclatureId = "";
    directoryState.bomLists = (directoryState.bomLists || []).map((bom) => ({
      ...bom,
      importRows: getBomImportRows(bom).map((item) => (
        item.nomenclatureId === rowId ? { ...item, nomenclatureId: "" } : item
      )),
    }));
    directoryState.specifications = (directoryState.specifications || []).map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification).map((item) => (
        item.nomenclatureId === rowId ? { ...item, nomenclatureId: "" } : item
      )),
    }));
  }

  if (sectionId === "nomenclatureTypes") {
    const fallbackType = getFallbackNomenclatureType(row.name);
    directoryState.nomenclature = (directoryState.nomenclature || []).map((item) => (
      normalizeLookupText(item.type) === normalizeLookupText(row.name)
        ? { ...item, type: fallbackType, updatedAt: new Date().toISOString() }
        : item
    ));
    directoryState.specifications = (directoryState.specifications || []).map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification).map((item) => (
        normalizeLookupText(item.nomenclatureType) === normalizeLookupText(row.name)
          ? { ...item, nomenclatureType: fallbackType }
          : item
      )),
    }));
    if (normalizeLookupText(ui.nomenclatureTypeFilter) === normalizeLookupText(row.name)) {
      ui.nomenclatureTypeFilter = fallbackType || "all";
    }
  }

  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
}

function rememberScroll() {
  const shell = app.querySelector("[data-gantt-shell]");
  if (!shell) return;
  ui.scrollLeft = shell.scrollLeft;
  ui.scrollTop = shell.scrollTop;
}

function restoreScroll() {
  const shell = app.querySelector("[data-gantt-shell]");
  if (!shell) return;
  ganttScrollRestoreInProgress = true;
  const maxScrollLeft = Math.max(0, shell.scrollWidth - shell.clientWidth);
  const maxScrollTop = Math.max(0, shell.scrollHeight - shell.clientHeight);
  shell.scrollLeft = Math.min(Math.max(0, Number(ui.scrollLeft || 0)), maxScrollLeft);
  shell.scrollTop = Math.min(Math.max(0, Number(ui.scrollTop || 0)), maxScrollTop);
  updateDependencyClip(shell);
  window.requestAnimationFrame(() => {
    ganttScrollRestoreInProgress = false;
  });
  window.setTimeout(() => {
    ganttScrollRestoreInProgress = false;
  }, 80);
}

function updateDependencyClip(shell) {
  if (!shell) return;
  app.querySelectorAll(".dependencies-layer, .gantt-snap-overlay").forEach((layer) => {
    layer.style.setProperty("--dependency-clip-left", `${shell.scrollLeft}px`);
  });
}

  const api = {
    renderConfirmModal,
    getConfirmDialogConfig,
    getDirectoryData,
    openConfirmDialog,
    getDefaultOperationMapItemForRouteKind,
    createRouteStepFromOperationMapItem,
    createEmptyRouteModuleStep,
    buildWorkloadRows,
    buildDeadlineRows,
    buildSlotStatusItems,
    buildWarningTypeItems,
    buildWarningProjectItems,
    buildWarningRows,
    buildWorkloadInsights,
    buildDeadlineInsights,
    buildWarningInsights,
    buildDonutGradient,
    getSlotDurationHours,
    getSlotWorkingDurationMs,
    getSlotCalendarDurationMs,
    formatReportNumber,
    getDirectoryFieldClassKey,
    getDirectoryTableCellClass,
    renderDirectoryTableHead,
    renderDirectoryColumnFilter,
    renderDirectoryEditorModal,
    renderDirectoryReaderModal,
    renderDirectoryTable,
    getDirectoryTableRowClass,
    renderDirectoryCellContent,
    getStatusUsedInText,
    getStatusImpactView,
    renderStatusImpactCell,
    getStatusImpactRoleDescription,
    getStatusImpactParts,
    renderDirectoryDetail,
    renderStatusImpactMap,
    getStatusContractKey,
    getStatusContractView,
    getStatusFlowTransitions,
    getStatusTransitionView,
    getStatusNextDocumentView,
    getStatusImpactMap,
    getStatusAuditInfo,
    bindRouteStepDenseSelectEvents,
    bindDirectoryEvents,
    bindGenericModalCloseEvents,
    bindGlobalNavigation,
    getModuleMenuButtonFromEventTarget,
    openModuleFromMenuButton,
    bindConfirmEvents,
    bindAuthPrototypeEvents: bindAuthPrototypeEventsDependency,
    bindAuthSessionEvents: bindAuthSessionEventsDependency,
    bindRoutesEvents,
    bindSpekiEvents,
    bindNomenclatureEvents,
    bindBomListsEvents,
    bindPlanningEvents,
    bindShiftCalendarEvents,
    applyOperationMapChangesToRoutes,
    deleteOperationMapItem,
    openProjectInPlanning,
    bindDirectoryForm,
    saveDirectoryRow,
    deleteDirectoryRow,
    deleteDirectoryStateRow,
    rememberScroll,
    restoreScroll,
    updateDependencyClip,
  };

  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, function appEventsServiceEntry(...args) {
    syncRuntimeState();
    try {
      const result = fn(...args);
      commitRuntimeState();
      return result;
    } catch (error) {
      commitRuntimeState();
      throw error;
    }
  }]));
}
