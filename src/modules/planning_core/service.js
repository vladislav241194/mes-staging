export function createPlanningCoreServiceModule(dependencies = {}) {
  const {
    APP_VERSION,
    AUTH_GATE_DEFAULT_MODULE,
    AUTH_GATE_MAX_ATTEMPTS,
    AUTH_GATE_SESSION_STORAGE_KEY,
    BOM_COMPONENT_FIELDS,
    DAY_MS,
    DEFAULT_COMPONENT_TYPES,
    DEFAULT_INTERFACE_ROLE_ID,
    DEFAULT_ROUTE_BUFFER_MS,
    DISPATCH_FACT_STATUS_OPTIONS,
    EMPLOYEE_DEPARTMENT_MIGRATION,
    GANTT_DEPENDENCY_ARROW_LENGTH_MS,
    GANTT_DEPENDENCY_ENTRY_MS,
    GANTT_DEPENDENCY_ROUTE_VERSION,
    GANTT_SLOT_CONTENT_MODES,
    GANTT_SNAP_MS,
    GANTT_ZOOM_LEVELS,
    LEFT_WIDTH,
    LEGACY_DEPARTMENT_TO_WORK_CENTER_ID,
    LEGACY_WORK_CENTER_NAME_MIGRATION,
    MAIN_ROUTE_TASK_ID,
    MES_ADMIN_RUNTIME_HOSTS,
    MES_LEGACY_WORK_CENTER_ID_MAP,
    MES_LEGACY_WORK_CENTER_NAME_MAP,
    MES_OBSOLETE_WORK_CENTER_IDS,
    MES_OPERATION_MAP,
    MES_SIGNAL_TYPES,
    MES_SMT_WORK_CENTER_IDS,
    MIN_OPERATION_DURATION_MS,
    PRODUCTION_RESOURCE_TYPE_LABELS,
    REMOVED_DIRECTORY_STATUS_ID_PREFIXES,
    SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES,
    SHIFT_MASTER_BOARD_FOCUS_MODES,
    SHIFT_MASTER_BOARD_LANES,
    SHIFT_MASTER_BOARD_RISK_REASONS,
    SHIFT_MASTER_BOARD_SWIMLANES,
    STARTUP_SLOT_COMPARE_FIELDS,
    TIMELINE_LOAD_CHUNK,
    TIMELINE_MAX_COUNT,
    UI_STORAGE_KEY,
    addMs,
    app,
    arraysHaveSameFields,
    buildTimeScale,
    byId,
    cancelAuthPrototypePinFeedback = () => {},
    createDefaultDirectoryState,
    defaultUiState,
    escapeHtml,
    formatDuration,
    fromDateInput,
    getAccessRoleById,
    getBatch,
    getBomList = () => null,
    getCalendarWorkCenterId = (workCenterId = "") => String(workCenterId || ""),
    getDefaultSecondsPerPanel,
    getDefaultStatusRegistryKind, getDefaultSmtLineConfigurations = () => [],
    getGanttSlotStatusView,
    getModuleDefinitions,
    getOperationMapItem,
    getPlanningOrderObjectLabel,
    getPlanningRouteQuantity,
    getProductionContexts,
    getProductionStructureResources,
    getProductionStructureMatrixRuntimeOverrides,
    getProductionStructureWorkCenters,
    getResourcesForWorkCenter = () => [],
    getProject,
    getProjectDisplayName,
    getRouteConcreteTasksForPlanning,
    getRouteForStep,
    getRoutePlanningBatches,
    getRoutePlanningContext,
    getRoutePlanningOrder,
    getRouteProductionId,
    getRouteStepEffectiveOperationContext,
    getRouteStepPlanningTask,
    getRouteStepQuantityForBatch,
    getRouteStepTaskId,
    getRouteStepsForModule,
    getRouteTaskInputObjectLabel,
    getRouteTaskProducedObjectLabel,
    getSchedulableRouteSteps,
    getSharedUiSignature,
    getSmtLineConfigurations = () => [],
    getSmtLineNumberFromText = (value = "") => {
      const match = String(value || "").match(/(?:линия|line|l)\s*([12])/i);
      return match ? Number(match[1]) : 0;
    },
    getShiftMasterEmployeeRows,
    getShiftMasterProfiles,
    getSlotGanttResourceId = (slot = {}) => slot?.resourceId || "",
    getSlotOperationFlow,
    getSlotRoute = (slot = {}, state = planningState) => (
      (state?.routes || []).find((route) => route.id === getSlotRouteId(slot, state)) || null
    ),
    getSpecificationStructureItems,
    getStatusLifecycleModules,
    getWorkCenter,
    getWorkOrderPlanningStatusValue,
    icon,
    isGanttSlotCompleted,
    isShiftExecutionServerAuthoritative = () => false,
    isSmtLineWorkCenterId = (workCenterId) => /^D3_L/i.test(String(workCenterId || "")),
    isWorkOrderPlanningCanceled,
    isoLocal,
    makeId,
    markSharedUiDirty,
    normalizeAccessRoleAssignments,
    normalizeAccessRoleProfiles,
    normalizeBomImportRow = (row = {}) => normalizePlainRecord(row),
    normalizeInterfaceRoleId,
    normalizeNomenclatureType = (value) => {
      const text = String(value || "").trim();
      const normalized = text.toLowerCase();
      return !normalized || ["компонент", "компоненты", "рэа", "rea", "радиоэлектронные компоненты"].includes(normalized)
        ? "РЭА компоненты"
        : text;
    },
    normalizeRouteStepFlowItems,
    normalizeSpecificationStructureItem,
    normalizeStatusApplicationArea,
    normalizeStatusImpactText,
    normalizeDateInput = (value = "") => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""),
    normalizeLookupText = (value = "") => String(value || "").trim().toLowerCase(),
    normalizeShiftWorkOrderIssueReports = (value = {}) => normalizePlainRecord(value),
    normalizeShiftWorkOrderCollapsedTreeIds = (value = []) => (Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))] : []),
    normalizeTimesheetView = (value = "") => (String(value || "").trim() === "week" ? "week" : "month"),
    normalizeDirectoryColumnFilters = (filters = {}) => (!filters || typeof filters !== "object" ? {} : Object.fromEntries(Object.entries(filters).map(([sectionId, sectionFilters]) => [sectionId, !sectionFilters || typeof sectionFilters !== "object" ? {} : Object.fromEntries(Object.entries(sectionFilters).map(([key, values]) => [key, Array.isArray(values) ? [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))] : []]).filter(([, values]) => values.length))]).filter(([, sectionFilters]) => Object.keys(sectionFilters).length))),
    parseJsonObject,
    pendingSaveFeedback: initialPendingSaveFeedback = null,
    persistDirectoryState,
    persistState,
    pruneRouteStepsOutsideCurrentRouteTasks,
    render,
    resetAuthPrototypePinEntry = () => {},
    routeMatchesGanttFilters = () => true,
    saveFeedbackTimer: initialSaveFeedbackTimer = null,
    saveUxRefreshTimer: initialSaveUxRefreshTimer = null,
    scaleConfig,
    scheduleSharedStatePush,
    syncSpecificationDerivedFields = (specification) => specification,
    sharedStateApplyingRemote,
    sharedStateStatus,
    snapDate,
    snapToWorkingTime = (_workCenterId, date) => date,
    startOfDay,
    startOfWeek,
    toDate,
    toDateInput,
    addWorkingDuration = (_workCenterId, start, durationMs) => addMs(start, durationMs),
    getWorkingDurationBetween = (_workCenterId, start, end) => Math.max(0, toDate(end).getTime() - toDate(start).getTime()),
  } = dependencies;

  let ui = dependencies.getUi?.() || {};
  let planningState = dependencies.getPlanningState?.() || {};
  let directoryState = dependencies.getDirectoryState?.() || {};
  let pendingSaveFeedback = initialPendingSaveFeedback;
  let saveFeedbackTimer = initialSaveFeedbackTimer;
  let saveUxRefreshTimer = initialSaveUxRefreshTimer;

  function syncRuntimeState() {
    ui = dependencies.getUi?.() || ui || {};
    planningState = dependencies.getPlanningState?.() || planningState || {};
    directoryState = dependencies.getDirectoryState?.() || directoryState || {};
  }

  function commitRuntimeState() {
    dependencies.setUi?.(ui);
    dependencies.setPlanningState?.(planningState);
    dependencies.setDirectoryState?.(directoryState);
  }

function resolveProductionResourceType(value = "") {
  const text = normalizeLookupText(value);
  if (Object.keys(PRODUCTION_RESOURCE_TYPE_LABELS).includes(text)) return text;
  if (text.includes("агрег")) return "aggregate";
  if (text.includes("линия")) return "line";
  if (text.includes("исполн") || text.includes("сотруд") || text.includes("персон")) return "staff";
  if (text.includes("стан") || text.includes("установ") || text.includes("печ")) return "machine";
  if (text.includes("рабоч") || text.includes("мест")) return "workplace";
  if (text.includes("пост") || text.includes("стенд") || text.includes("инспектор")) return "post";
  if (text.includes("оснаст")) return "tool";
  if (text.includes("норматив")) return "normative";
  return "equipment";
}

function mapLegacyWorkCenterId(workCenterId = "") {
  const id = String(workCenterId || "").trim();
  if (!id) return "";
  if (MES_LEGACY_WORK_CENTER_ID_MAP[id]) return MES_LEGACY_WORK_CENTER_ID_MAP[id];
  if (getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides()).some((center) => center.id === id)) return id;
  return resolveWorkCenterIdFromName(id) || id;
}

function isWarehouseWorkCenterId(workCenterId = "") {
  return mapLegacyWorkCenterId(workCenterId) === "D1";
}

function hasManufacturingOutputReceiptText(value = "") {
  const text = normalizeLookupText(value);
  if (!text) return false;
  const hasReceiptAction = text.includes("поступ") || text.includes("прием") || text.includes("приём");
  const hasManufacturingSource = text.includes("производ") || text.includes("готов") || text.includes("полуфаб") || text.includes("издел");
  return (
    (hasReceiptAction && hasManufacturingSource)
    || text.includes("выпуск")
    || text.includes("готовой продукции")
    || text.includes("готовых изделий")
    || text.includes("полуфаб")
  );
}

function hasNonOutputWarehouseText(value = "") {
  const text = normalizeLookupText(value);
  return [
    "поставщик",
    "выдач",
    "возврат",
    "перемещ",
    "списан",
    "инвентар",
    "комплектующ",
    "материал",
  ].some((token) => text.includes(token));
}

function isManufacturingOutputReceiptOperation(operation = {}) {
  if (!operation) return false;
  const text = `${operation.name || ""} ${operation.code || ""} ${operation.businessOutput || ""} ${operation.comment || ""}`;
  if (hasNonOutputWarehouseText(text)) return false;
  if (operation.isOutputReceipt || operation.warehouseFlow === "production_receipt") return true;
  if (!isWarehouseWorkCenterId(operation.workCenterId)) return false;
  return hasManufacturingOutputReceiptText(text) && !hasNonOutputWarehouseText(text);
}

function isManufacturingOutputReceiptRouteStep(step = {}) {
  if (!step) return false;
  const text = `${step.operationName || ""} ${step.comment || ""}`;
  if (hasNonOutputWarehouseText(text)) return false;
  const operation = getOperationMapItem(step.operationId);
  if (isManufacturingOutputReceiptOperation(operation)) return true;
  if (!isWarehouseWorkCenterId(step.workCenterId)) return false;
  return hasManufacturingOutputReceiptText(text) && !hasNonOutputWarehouseText(text);
}

function isManufacturingOutputReceiptSlot(slot = {}, state = null) {
  if (!slot) return false;
  const sourceState = state || getRuntimePlanningState();
  const step = (sourceState?.routeSteps || []).find((item) => item.id === slot.routeStepId);
  if (isManufacturingOutputReceiptRouteStep(step)) return true;
  const text = `${slot.operationName || ""} ${slot.comment || ""}`;
  if (hasNonOutputWarehouseText(text)) return false;
  const operation = getOperationMapItem(slot.operationId);
  if (isManufacturingOutputReceiptOperation(operation)) return true;
  if (!isWarehouseWorkCenterId(slot.workCenterId)) return false;
  return hasManufacturingOutputReceiptText(text) && !hasNonOutputWarehouseText(text);
}

function isSmtRouteInstructionWorkCenterId(workCenterId = "") {
  const raw = String(workCenterId || "").trim();
  if (!raw) return false;
  if (raw === "D3" || raw === "smt" || isSmtLineWorkCenterId(raw)) return true;
  const mapped = mapLegacyWorkCenterId(raw);
  return mapped === "D3" || MES_SMT_WORK_CENTER_IDS.includes(mapped);
}

function getRouteInstructionWorkCenterId(workCenterId = "") {
  const raw = String(workCenterId || "").trim();
  if (!raw) return "";
  if (isSmtRouteInstructionWorkCenterId(raw)) return "D3";
  return mapLegacyWorkCenterId(raw);
}

function getOperationRouteWorkCenterId(operation = {}) {
  return getRouteInstructionWorkCenterId(operation.routeWorkCenterId || operation.workCenterId || "");
}

function getPlanningCandidateWorkCenterIdsForRouteWorkCenter(workCenterId = "", operation = null, state = null) {
  const sourceState = state || getRuntimePlanningState();
  const activePlanningIds = new Set((sourceState?.workCenters || [])
    .filter((center) => isPlanningWorkCenter(center))
    .map((center) => center.id));
  const explicitIds = Array.isArray(operation?.planningWorkCenterIds)
    ? operation.planningWorkCenterIds
    : [];
  const normalizedExplicitIds = explicitIds
    .map((id) => mapLegacyWorkCenterId(id))
    .filter((id) => id && activePlanningIds.has(id));
  if (normalizedExplicitIds.length) return [...new Set(normalizedExplicitIds)];

  const routeWorkCenterId = getRouteInstructionWorkCenterId(workCenterId);
  if (!routeWorkCenterId) return [];
  if (routeWorkCenterId === "D3" || isSmtOperationWorkCenter(routeWorkCenterId, operation, sourceState)) {
    const smtIds = MES_SMT_WORK_CENTER_IDS.filter((id) => activePlanningIds.has(id));
    return smtIds.length ? smtIds : [...MES_SMT_WORK_CENTER_IDS];
  }

  const center = sourceState?.workCenters?.find((item) => item.id === routeWorkCenterId);
  if (center && !isPlanningWorkCenter(center)) {
    const children = (sourceState?.workCenters || [])
      .filter((item) => item.parentWorkCenterId === center.id && isPlanningWorkCenter(item))
      .map((item) => item.id);
    if (children.length) return children;
  }

  return activePlanningIds.has(routeWorkCenterId) || !sourceState?.workCenters?.length
    ? [routeWorkCenterId]
    : [];
}

function getRouteStepPlanningCandidateWorkCenterIds(step = {}, state = null) {
  const operation = getOperationMapItem(step.operationId);
  return getPlanningCandidateWorkCenterIdsForRouteWorkCenter(step.workCenterId, operation, state);
}

function getRouteStepExplicitPlanningWorkCenterId(step = {}) {
  return mapLegacyWorkCenterId(step.planningWorkCenterId || step.planningLineWorkCenterId || "");
}

function routeStepRequiresManualPlanningLine(step = {}, state = null) {
  return getRouteStepPlanningCandidateWorkCenterIds(step, state).length > 1;
}

function getRouteStepSelectedPlanningWorkCenterId(step = {}, state = null, options = {}) {
  const sourceState = state || getRuntimePlanningState();
  const candidates = getRouteStepPlanningCandidateWorkCenterIds(step, sourceState);
  if (!candidates.length) return mapLegacyWorkCenterId(step.workCenterId || "");
  const explicitWorkCenterId = getRouteStepExplicitPlanningWorkCenterId(step);
  if (explicitWorkCenterId && candidates.includes(explicitWorkCenterId)) return explicitWorkCenterId;
  const currentWorkCenterId = mapLegacyWorkCenterId(options.currentWorkCenterId || "");
  if (currentWorkCenterId && candidates.includes(currentWorkCenterId)) return currentWorkCenterId;
  return candidates.length === 1 ? candidates[0] : "";
}

function isPlanningWorkCenterCompatibleWithRouteStep(step = {}, planningWorkCenterId = "", state = null) {
  const normalizedId = mapLegacyWorkCenterId(planningWorkCenterId);
  return getRouteStepPlanningCandidateWorkCenterIds(step, state).includes(normalizedId);
}

function getPlanningResourceForRouteStep(step = {}, planningWorkCenterId = "", preferredResourceId = "") {
  const normalizedWorkCenterId = mapLegacyWorkCenterId(planningWorkCenterId);
  const normalizedPreferredResourceId = mapLegacyResourceId(preferredResourceId);
  const preferredResource = normalizedPreferredResourceId ? getProductionResource(normalizedPreferredResourceId) : null;
  if (
    preferredResource
    && getProductionResourceWorkCenterId(preferredResource) === normalizedWorkCenterId
    && (resourceParticipatesInPlanning(preferredResource) || resourceParticipatesInCalculation(preferredResource))
  ) {
    return preferredResource.id;
  }
  const resources = getResourcesForWorkCenter(normalizedWorkCenterId);
  return resources[0]?.id || "";
}

function getPlanningAssignmentForRouteStep(step = {}, quantity = 1, readyAt = null, options = {}) {
  const sourceState = options.state || getRuntimePlanningState();
  const candidates = getRouteStepPlanningCandidateWorkCenterIds(step, sourceState);
  const fallbackWorkCenterId = mapLegacyWorkCenterId(step.workCenterId || "");
  const candidateIds = candidates.length ? candidates : [fallbackWorkCenterId].filter(Boolean);
  let fallbackStart = new Date();
  try {
    fallbackStart = fromDateInput(ui?.windowStart || defaultUiState.windowStart);
  } catch {
    fallbackStart = new Date();
  }
  const earliestStart = readyAt || fallbackStart;
  const assignments = candidateIds.map((workCenterId) => {
    const resourceId = getPlanningResourceForRouteStep(step, workCenterId, options.preferredResourceId || step.resourceId || "");
    const route = getRouteForStep(step);
    const context = getRouteStepEffectiveOperationContext(route, step, workCenterId, resourceId);
    const laborPlan = getPlanningOrderLaborPlan(route, step, { quantity, workCenterId, state: sourceState });
    const durationMs = laborPlan?.durationMs > 0
      ? laborPlan.durationMs
      : calculateRequiredDurationMs(workCenterId, quantity, sourceState, null, context.boardsPerPanel || null, context);
    const window = findFreeWindow(workCenterId, durationMs, earliestStart, options.ignoreSlotId || null, resourceId || "");
    return {
      workCenterId,
      resourceId,
      durationMs,
      window,
      laborPlan,
    };
  });
  return assignments.sort((left, right) => (
    toDate(left.window.end) - toDate(right.window.end)
    || toDate(left.window.start) - toDate(right.window.start)
  ))[0] || {
    workCenterId: fallbackWorkCenterId,
    resourceId: step.resourceId || "",
    durationMs: 0,
    window: { start: earliestStart, end: earliestStart },
  };
}

function getManualPlanningAssignmentForRouteStep(step = {}, quantity = 1, readyAt = null, options = {}) {
  const sourceState = options.state || getRuntimePlanningState();
  const workCenterId = getRouteStepSelectedPlanningWorkCenterId(step, sourceState, {
    currentWorkCenterId: options.currentWorkCenterId || "",
  });
  if (!workCenterId) return null;
  let fallbackStart = new Date();
  try {
    fallbackStart = fromDateInput(ui?.windowStart || defaultUiState.windowStart);
  } catch {
    fallbackStart = new Date();
  }
  const earliestStart = readyAt || fallbackStart;
  const resourceId = getPlanningResourceForRouteStep(step, workCenterId, options.preferredResourceId || step.resourceId || "");
  const route = getRouteForStep(step);
  const context = getRouteStepEffectiveOperationContext(route, step, workCenterId, resourceId);
  const laborPlan = getPlanningOrderLaborPlan(route, step, { quantity, workCenterId, state: sourceState });
  const durationMs = laborPlan?.durationMs > 0
    ? laborPlan.durationMs
    : calculateRequiredDurationMs(workCenterId, quantity, sourceState, null, context.boardsPerPanel || null, context);
  const window = findFreeWindow(workCenterId, durationMs, earliestStart, options.ignoreSlotId || null, resourceId || "");
  return {
    workCenterId,
    resourceId,
    durationMs,
    window,
    laborPlan,
  };
}

function getRouteStepPlanningAssignmentForSlot(step = {}, slot = {}, options = {}) {
  const sourceState = options.state || getRuntimePlanningState();
  const quantity = normalizeQuantity(options.quantity ?? slot.quantity ?? 1, 1);
  const readyAt = options.readyAt || slot.plannedStart || null;
  const preferredResourceId = options.preferredResourceId ?? slot.resourceId ?? step.resourceId ?? "";
  const currentWorkCenterId = mapLegacyWorkCenterId(options.workCenterId || slot.workCenterId || "");
  if (currentWorkCenterId && isPlanningWorkCenterCompatibleWithRouteStep(step, currentWorkCenterId, sourceState)) {
    return {
      workCenterId: currentWorkCenterId,
      resourceId: getPlanningResourceForRouteStep(step, currentWorkCenterId, preferredResourceId),
      durationMs: 0,
      window: null,
    };
  }
  const manualAssignment = getManualPlanningAssignmentForRouteStep(step, quantity, readyAt, {
    state: sourceState,
    ignoreSlotId: options.ignoreSlotId ?? slot.id ?? null,
    preferredResourceId,
    currentWorkCenterId,
  });
  if (manualAssignment) return manualAssignment;
  if (routeStepRequiresManualPlanningLine(step, sourceState)) return null;
  return getPlanningAssignmentForRouteStep(step, quantity, readyAt, {
    state: sourceState,
    ignoreSlotId: options.ignoreSlotId ?? slot.id ?? null,
    preferredResourceId,
  });
}

function resolveWorkCenterIdFromName(value = "") {
  const normalized = normalizeLookupText(value);
  if (!normalized) return "";
  const direct = getWorkCenter(value);
  if (direct) return direct.id;
  const mappedById = MES_LEGACY_WORK_CENTER_ID_MAP[String(value || "")];
  if (mappedById) return mappedById;
  const mappedByName = Object.entries(MES_LEGACY_WORK_CENTER_NAME_MAP)
    .find(([name]) => normalizeLookupText(name) === normalized)?.[1];
  if (mappedByName) return mappedByName;
  const lineNumber = getSmtLineNumberFromText(value);
  if (lineNumber === 1) return "D3_L1";
  if (lineNumber === 2) return "D3_L2";
  if (normalized.includes("офлайн") && (normalized.includes("аои") || normalized.includes("aoi"))) return "D3_AOI";
  const exact = (getRuntimePlanningState()?.workCenters || []).find((center) => (
    normalizeLookupText(center.id) === normalized
    || normalizeLookupText(center.name) === normalized
    || normalizeLookupText(center.code) === normalized
    || (center.legacyDepartmentNames || []).some((name) => normalizeLookupText(name) === normalized)
  ));
  if (exact) return exact.id;
  if (normalized.includes("smt") || normalized.includes("смт") || normalized.includes("поверхност")) return "D3";
  if (normalized.includes("aoi") || normalized.includes("аои")) return "D3_AOI";
  if (normalized.includes("отмыв")) return "D3_UW";
  if (normalized.includes("руч") || normalized.includes("tht") || normalized.includes("вывод")) return "D5";
  if (normalized.includes("испыт") || normalized.includes("контрол") || normalized.includes("отк")) return "D4";
  if (normalized.includes("селектив") || normalized.includes("влагозащ")) return "D3_CC";
  if (normalized.includes("лак")) return "D3_CC";
  if (normalized.includes("программ") || normalized.includes("прошив")) return "D6";
  if (normalized.includes("слесар") || normalized.includes("механ") || normalized.includes("сбор")) return "D9";
  if (normalized.includes("маркиров") || normalized.includes("упаков")) return "D11";
  if (normalized.includes("склад")) return "D1";
  return "";
}

function getProductionResourceWorkCenterId(resource = {}) {
  return resource.workCenterId || resolveWorkCenterIdFromName(resource.workCenter || resource.line || resource.department || "");
}

function normalizeProductionResourceCapacity(value = "") {
  return String(value || "")
    .replace(/партия/gi, "операция")
    .replace(/партии/gi, "операции")
    .trim();
}

function normalizeProductionResource(row = {}) {
  const workCenterId = getProductionResourceWorkCenterId(row) || "D5";
  const center = getWorkCenter(workCenterId);
  const type = resolveProductionResourceType(row.type || row.resourceType || row.kind || "");
  const isLegacyEquipment = row.sourceKind === "equipment";
  const participatesInPlanning = row.participatesInPlanning ?? row.planningStatus ?? (isLegacyEquipment ? "no" : "yes");
  const participatesInCalculation = row.participatesInCalculation ?? row.calculationStatus ?? (isLegacyEquipment ? "no" : "yes");

  return {
    ...row,
    id: row.id || makeId("res"),
    name: String(row.name || "Производственный ресурс").trim(),
    type,
    workCenterId,
    workCenter: center?.name || row.workCenter || "",
    parentResourceId: row.parentResourceId || "",
    inventory: String(row.inventory || "").trim(),
    maintenance: String(row.maintenance || "").trim(),
    capacity: normalizeProductionResourceCapacity(row.capacity),
    baseCph: Math.max(0, Number(row.baseCph || 0)),
    efficiency: Math.max(0, Number(row.efficiency || 0)),
    changeoverMin: Math.max(0, Number(row.changeoverMin || 0)),
    participatesInPlanning: participatesInPlanning === true || participatesInPlanning === "yes" ? "yes" : "no",
    participatesInCalculation: participatesInCalculation === true || participatesInCalculation === "yes" ? "yes" : "no",
    sourceKind: row.sourceKind || "productionResource",
    status: String(row.status || "Доступен").trim(),
  };
}

function getSmtLineParentResourceId(value = "", resources = []) {
  const lineNumber = getSmtLineNumberFromText(value);
  if (!lineNumber) return "";
  const line = findSmtLineByNumber(lineNumber, resources);
  return line?.id || "";
}

function migrateLegacyResourceRow(row = {}) {
  return normalizeProductionResource({
    ...row,
    sourceKind: "resource",
    workCenterId: resolveWorkCenterIdFromName(row.workCenter),
    participatesInPlanning: "yes",
    participatesInCalculation: "yes",
  });
}

function migrateLegacyEquipmentRow(row = {}, migratedResources = []) {
  const parentResourceId = getSmtLineParentResourceId(row.workCenter, migratedResources);
  return normalizeProductionResource({
    ...row,
    type: row.type || "equipment",
    sourceKind: "equipment",
    workCenterId: resolveWorkCenterIdFromName(row.workCenter),
    parentResourceId,
    capacity: "",
    baseCph: 0,
    efficiency: 0,
    changeoverMin: 0,
    participatesInPlanning: "no",
    participatesInCalculation: "no",
  });
}

function dedupeProductionResources(rows = []) {
  const result = [];
  const seen = new Set();
  rows.forEach((row) => {
    const normalized = normalizeProductionResource(row);
    const key = normalized.id || `${normalizeLookupText(normalized.name)}::${normalized.workCenterId}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function mapLegacyResourceId(resourceId = "") {
  const id = String(resourceId || "").trim();
  if (!id) return "";
  const directMap = {
    "res-smt-1": "D3_L1_MATRIX",
    "smt-line-1": "D3_L1_MATRIX",
    "res-smt-2": "D3_L2_MATRIX",
    "smt-line-2": "D3_L2_MATRIX",
    "res-aoi-offline": "EQ-S-AOI-PEMTRON-1",
    "res-manual-a": "D5_MATRIX",
    "res-test": "D4_MATRIX",
    "eq-smt1-hanwha-s2": "EQ-S-SMT-1-S2-L2-1",
    "eq-smt1-hanwha-l2": "EQ-S-SMT-1-S2-L2-1",
    "eq-smt1-oven": "EQ-S-SMT-1-S2-L2-1",
    "eq-smt2-hanwha-s2": "EQ-S-SMT-2-S2-1",
    "eq-smt2-oven": "EQ-S-SMT-2-S2-1",
    "eq-smt2-aoi": "EQ-S-AOI-PEMTRON-1",
    "eq-aoi-athena": "EQ-S-AOI-PEMTRON-1",
    "eq-cleaner": "EQ-S-WASH-UZ-3-1-1",
    "eq-ict": "D4_MATRIX",
    "eq-warehouse": "D1_MATRIX",
    D1_STAFF: "D1_MATRIX",
    D3_L1: "D3_L1_MATRIX",
    D3_UW_E1: "EQ-S-WASH-UZ-3-1-1",
    D4_STAFF: "D4_MATRIX",
    D5_STAFF: "D5_MATRIX",
    D6_STAFF: "D6_MATRIX",
    D9_STAFF: "D9_MATRIX",
    D11_STAFF: "D11_MATRIX",
  };
  return directMap[id] || id;
}

function isLegacyGeneratedOperation(operation = {}) {
  const id = String(operation.id || "");
  if (id.startsWith("op-default-")) return true;
  if (id.startsWith("op-") && MES_OBSOLETE_WORK_CENTER_IDS.has(operation.workCenterId)) return true;
  return false;
}

function findMesOperationReplacement(source = {}) {
  const mappedWorkCenterId = mapLegacyWorkCenterId(source.workCenterId || source.departmentName || source.workCenter || "");
  const normalizedName = normalizeLookupText(source.operationName || source.name || "");
  const byId = MES_OPERATION_MAP.find((operation) => operation.id === source.operationId || operation.id === source.id);
  if (byId?.legacyAliasOf) return MES_OPERATION_MAP.find((operation) => operation.id === byId.legacyAliasOf) || byId;
  if (byId) return byId;
  const exact = MES_OPERATION_MAP.find((operation) => (
    operation.workCenterId === mappedWorkCenterId
    && normalizeLookupText(operation.name) === normalizedName
  ));
  if (exact) return exact;
  if (
    (mappedWorkCenterId === "D1" || normalizedName.includes("склад") || normalizedName.includes("готов") || normalizedName.includes("полуфаб"))
    && hasManufacturingOutputReceiptText(normalizedName)
    && !hasNonOutputWarehouseText(normalizedName)
  ) {
    return MES_OPERATION_MAP.find((operation) => operation.id === "D1_OP2");
  }
  if (MES_SMT_WORK_CENTER_IDS.includes(mappedWorkCenterId) || normalizedName.includes("smt") || normalizedName.includes("смт")) {
    return MES_OPERATION_MAP.find((operation) => operation.id === "D3_L1_OP");
  }
  if (mappedWorkCenterId === "D3_AOI" || normalizedName.includes("aoi") || normalizedName.includes("аои")) return MES_OPERATION_MAP.find((operation) => operation.id === "D3_AOI_OP");
  if (mappedWorkCenterId === "D3_UW" || normalizedName.includes("отмыв")) return MES_OPERATION_MAP.find((operation) => operation.id === "D3_UW_OP");
  if (mappedWorkCenterId === "D5" || normalizedName.includes("руч") || normalizedName.includes("tht") || normalizedName.includes("пайк")) return MES_OPERATION_MAP.find((operation) => operation.id === "D5_OP1");
  if (mappedWorkCenterId === "D4" || normalizedName.includes("контрол") || normalizedName.includes("тест")) return MES_OPERATION_MAP.find((operation) => operation.id === "D4_OP2");
  if (mappedWorkCenterId === "D3_CC" || normalizedName.includes("влагозащ") || normalizedName.includes("селектив")) return MES_OPERATION_MAP.find((operation) => operation.id === "D3_CC_OP");
  if (normalizedName.includes("лакир")) return MES_OPERATION_MAP.find((operation) => operation.id === "D3_MANUAL_CC_OP");
  if (mappedWorkCenterId === "D6" || normalizedName.includes("прошив")) return MES_OPERATION_MAP.find((operation) => operation.id === "D6_OP1");
  if (mappedWorkCenterId === "D9" || normalizedName.includes("слесар") || normalizedName.includes("сбор")) return MES_OPERATION_MAP.find((operation) => operation.id === "D9_OP1");
  if (mappedWorkCenterId === "D11" || normalizedName.includes("маркир")) return MES_OPERATION_MAP.find((operation) => operation.id === "D11_OP1");
  if (mappedWorkCenterId === "D11" || normalizedName.includes("упаков")) return MES_OPERATION_MAP.find((operation) => operation.id === "D11_OP2");
  return null;
}

function mergeMesOperationMap(rows = []) {
  const mesIds = new Set(MES_OPERATION_MAP.map((operation) => operation.id));
  const normalizedDefaults = MES_OPERATION_MAP.map((operation) => normalizeDirectoryRow("operations", operation));
  const customRows = (Array.isArray(rows) ? rows : [])
    .filter((operation) => operation?.id && !mesIds.has(operation.id) && !isLegacyGeneratedOperation(operation))
    .map((operation) => {
      const replacement = findMesOperationReplacement(operation);
      if (replacement) return null;
      return normalizeDirectoryRow("operations", {
        ...operation,
        workCenterId: mapLegacyWorkCenterId(operation.workCenterId),
      });
    })
    .filter(Boolean);
  return [...normalizedDefaults, ...customRows];
}

function normalizeMesRouteEntity(entity = {}) {
  const replacementOperation = findMesOperationReplacement(entity);
  const nextWorkCenterId = replacementOperation
    ? getOperationRouteWorkCenterId(replacementOperation)
    : getRouteInstructionWorkCenterId(entity.workCenterId || "");
  const planningCandidates = getPlanningCandidateWorkCenterIdsForRouteWorkCenter(nextWorkCenterId, replacementOperation, planningState);
  const explicitPlanningWorkCenterId = mapLegacyWorkCenterId(entity.planningWorkCenterId || "");
  const selectedPlanningWorkCenterId = explicitPlanningWorkCenterId && planningCandidates.includes(explicitPlanningWorkCenterId)
    ? explicitPlanningWorkCenterId
    : planningCandidates.length === 1 ? planningCandidates[0] : "";
  return {
    ...entity,
    operationId: replacementOperation?.id || entity.operationId || "",
    operationName: replacementOperation?.name || entity.operationName || entity.name || "",
    workCenterId: nextWorkCenterId || entity.workCenterId || "",
    planningWorkCenterId: selectedPlanningWorkCenterId && planningCandidates.length > 1 ? selectedPlanningWorkCenterId : "",
    resourceId: selectedPlanningWorkCenterId
      ? getPlanningResourceForRouteStep({ ...entity, workCenterId: nextWorkCenterId }, selectedPlanningWorkCenterId, mapLegacyResourceId(entity.resourceId || ""))
      : "",
    unitsPerHour: replacementOperation?.unitsPerHour || entity.unitsPerHour || getWorkCenterUnitsPerHour(nextWorkCenterId) || 0,
    requiresBatch: replacementOperation?.requiresBatch ?? entity.requiresBatch,
    isWarehouseOperation: replacementOperation?.isWarehouse ?? entity.isWarehouseOperation,
  };
}

function replaceLegacyOrganizationTerms(value) {
  return String(value || "")
    .replace(/Все подразделения/g, "Все отделы")
    .replace(/все подразделения/g, "все отделы")
    .replace(/Подразделения,/g, "Отделы,")
    .replace(/подразделения,/g, "отделы,")
    .replace(/подразделениями/gi, "отделами")
    .replace(/подразделениях/gi, "отделах")
    .replace(/подразделениям/gi, "отделам")
    .replace(/подразделений/gi, "отделов")
    .replace(/подразделения/gi, "отдела")
    .replace(/подразделение/gi, "отдел");
}

function normalizeDirectoryOrganizationTerminology() {
  if (!directoryState) return false;
  let changed = false;
  const normalizeRowFields = (row, fields) => {
    let rowChanged = false;
    const nextRow = { ...row };
    fields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(nextRow, field)) return;
      const nextValue = replaceLegacyOrganizationTerms(nextRow[field]);
      if (nextValue === String(nextRow[field] || "")) return;
      nextRow[field] = nextValue;
      rowChanged = true;
    });
    if (rowChanged) changed = true;
    return rowChanged ? nextRow : row;
  };

  directoryState.statuses = (directoryState.statuses || []).map((row) => normalizeRowFields(row, ["group", "name", "type", "usage", "annotation", "impact", "originModule", "changeModule"]));
  return changed;
}

function applyMesOrgStructureDefaults() {
  let planningChanged = false;
  let directoryChanged = false;

  const previousWorkCenters = JSON.stringify(planningState.workCenters || []);
  planningState.workCenters = mergeMesWorkCenters(planningState.workCenters);
  planningChanged = planningChanged || previousWorkCenters !== JSON.stringify(planningState.workCenters || []);

  const nextRouteSteps = (planningState.routeSteps || []).map((step) => normalizeRouteStepCalculationFields(normalizeMesRouteEntity(step), planningState));
  if (JSON.stringify(nextRouteSteps) !== JSON.stringify(planningState.routeSteps || [])) {
    planningState.routeSteps = nextRouteSteps;
    planningChanged = true;
  }

  const routeStepById = new Map((planningState.routeSteps || []).map((step) => [step.id, step]));
  const nextSlots = (planningState.slots || []).map((slot) => {
    const step = routeStepById.get(slot.routeStepId);
    const currentWorkCenterId = mapLegacyWorkCenterId(slot.workCenterId || "");
    const planningWorkCenterId = step && isPlanningWorkCenterCompatibleWithRouteStep(step, currentWorkCenterId, planningState)
      ? currentWorkCenterId
      : step
        ? getManualPlanningAssignmentForRouteStep(step, slot.quantity || 1, slot.plannedStart || new Date(), {
          state: planningState,
          ignoreSlotId: slot.id,
          currentWorkCenterId,
        })?.workCenterId || currentWorkCenterId
        : currentWorkCenterId;
    const resourceId = step
      ? getPlanningResourceForRouteStep(step, planningWorkCenterId, slot.resourceId || step.resourceId || "")
      : mapLegacyResourceId(slot.resourceId || "");
    return recalculateSlotEndByQuantity({
      ...slot,
      routeWorkCenterId: step?.workCenterId || slot.routeWorkCenterId || "",
      workCenterId: planningWorkCenterId,
      routeStepId: slot.routeStepId,
      operationName: step?.operationName || slot.operationName || "",
      operationId: step?.operationId || slot.operationId || "",
      resourceId,
      unitsPerHour: step?.unitsPerHour || slot.unitsPerHour || 0,
      calculationType: step?.calculationType || slot.calculationType || "",
      secondsPerPanel: step?.secondsPerPanel || slot.secondsPerPanel || 0,
      setupMin: step?.setupMin || slot.setupMin || 0,
    }, planningState);
  });
  if (!arraysHaveSameFields(nextSlots, planningState.slots || [], STARTUP_SLOT_COMPARE_FIELDS)) {
    planningState.slots = nextSlots;
    planningChanged = true;
  }

  const nextOperationMap = mergeMesOperationMap(directoryState.operationMap);
  if (JSON.stringify(nextOperationMap) !== JSON.stringify(directoryState.operationMap || [])) {
    directoryState.operationMap = nextOperationMap;
    directoryChanged = true;
  }

  if (
    (directoryState.resources || []).length
    || (directoryState.equipment || []).length
    || (directoryState.departments || []).length
    || (directoryState.productionResources || []).length
    || (directoryState.norms || []).length
    || (directoryState.employees || []).length
  ) {
    // Legacy cleanup only: production organization now comes from the structure matrix.
    directoryState.resources = [];
    directoryState.equipment = [];
    directoryState.departments = [];
    directoryState.productionResources = [];
    directoryState.norms = [];
    directoryState.employees = [];
    directoryChanged = true;
  }

  if (normalizeDirectoryOrganizationTerminology()) {
    directoryChanged = true;
  }

  if (planningChanged) {
    planningState = normalizePlanningState(planningState);
    persistState();
  }
  if (directoryChanged) {
    directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
    persistDirectoryState();
  }
}

function buildDefaultProductionResources() {
  return dedupeProductionResources(getProductionStructureResources(getProductionStructureMatrixRuntimeOverrides()));
}

function getProductionResources({ includeInactive = false } = {}) {
  const rows = buildDefaultProductionResources();
  return dedupeProductionResources(rows)
    .filter((resource) => includeInactive || !["Отключен", "inactive"].includes(resource.status));
}

function getProductionResource(resourceId) {
  return getProductionResources({ includeInactive: true }).find((resource) => resource.id === resourceId) || null;
}

function resourceParticipatesInPlanning(resource = {}) {
  return resource.participatesInPlanning !== "no" && !["Отключен", "inactive"].includes(resource.status);
}

function resourceParticipatesInCalculation(resource = {}) {
  return resource.participatesInCalculation !== "no" && !["Отключен", "inactive"].includes(resource.status);
}

function getProductionResourcesForWorkCenter(workCenterId, { includeInactive = false, includePassive = false } = {}) {
  const resolvedId = getCalendarWorkCenterId(workCenterId);
  return getProductionResources({ includeInactive })
    .filter((resource) => getProductionResourceWorkCenterId(resource) === resolvedId)
    .filter((resource) => includePassive || resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource));
}

function makeFallbackProductionResource(workCenterId) {
  const center = getWorkCenter(workCenterId) || { id: workCenterId, name: "Отдел", code: workCenterId };
  return normalizeProductionResource({
    id: `resource-${center.id}-matrix-missing`,
    name: `${center.name} · ресурс не задан`,
    type: "staff",
    workCenterId: center.id,
    workCenter: center.name,
    capacity: "нет строки в матрице структуры",
    baseCph: 0,
    efficiency: 0,
    changeoverMin: 0,
    participatesInPlanning: "no",
    participatesInCalculation: "no",
    status: "Требует матрицу",
  });
}

function normalizeUnitType(value, row = {}) {
  const raw = String(value || row.unitType || row.type || "").trim().toLowerCase();
  if (["production", "administrative", "warehouse", "quality", "service"].includes(raw)) return raw;
  const text = `${row.id || ""} ${row.name || ""} ${row.code || ""}`.toLowerCase();
  if (text.includes("warehouse") || text.includes("склад")) return "warehouse";
  if (text.includes("отк") || text.includes("aoi") || text.includes("аои") || text.includes("контроль") || text.includes("test")) return "quality";
  if (text.includes("план") || text.includes("закуп") || text.includes("снаб") || text.includes("программ")) return "administrative";
  return "production";
}

function isPlanningWorkCenter(center) {
  return Boolean(center) && center.isActive !== false && center.isPlanningUnit !== false && center.showInGantt !== false;
}

function getPlanningWorkCenters({ includeWarehouse = true } = {}) {
  const sourceState = getRuntimePlanningState({ workCenters: getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides()) });
  return (sourceState?.workCenters || [])
    .filter((center) => isPlanningWorkCenter(center))
    .filter((center) => includeWarehouse || !isWarehouseWorkCenterId(center.id));
}

function isRouteInstructionWorkCenter(center) {
  if (!center || center.isActive === false) return false;
  if (center.id === "D3") return true;
  if (MES_SMT_WORK_CENTER_IDS.includes(center.id)) return false;
  return isPlanningWorkCenter(center);
}

function getRouteInstructionWorkCenters({ includeWarehouse = true } = {}) {
  const sourceState = getRuntimePlanningState({ workCenters: getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides()) });
  return (sourceState?.workCenters || [])
    .filter((center) => isRouteInstructionWorkCenter(center))
    .filter((center) => includeWarehouse || !isWarehouseWorkCenterId(center.id));
}

function normalizeWorkSchedule(value, fallback = "5/2") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback || "";
  if (text.includes("24/7") || text.includes("7/0")) return "24/7";
  if (text.includes("6/1")) return "6/1";
  if (text.includes("2/2")) return "2/2";
  if (text.includes("5/2")) return "5/2";
  return fallback || "";
}

function normalizeWorkMode(value, fallback = "08:00-20:00") {
  const match = String(value || "").trim().match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return fallback || "";
  const startHour = Math.max(0, Math.min(23, Number(match[1])));
  const startMinute = Math.max(0, Math.min(59, Number(match[2])));
  const endHour = Math.max(0, Math.min(24, Number(match[3])));
  const endMinute = Math.max(0, Math.min(59, Number(match[4])));
  return `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}-${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

function getDefaultWorkMode(workSchedule, isWarehouse = false) {
  if (workSchedule === "24/7" || isWarehouse) return "00:00-24:00";
  return "08:00-20:00";
}

function formatWorkShift(workSchedule, workMode) {
  if (!workSchedule) return "";
  if (workSchedule === "2/2") return `2/2 бригады · ежедневно${workMode ? ` ${workMode}` : ""}`.trim();
  return `${workSchedule}${workMode ? ` ${workMode}` : ""}`.trim();
}

function getWorkCalendarLabel(workCenter = {}) {
  const schedule = normalizeWorkSchedule(workCenter.workSchedule || workCenter.shift, isWarehouseWorkCenterId(workCenter.id) ? "24/7" : "5/2");
  const mode = normalizeWorkMode(workCenter.workMode || workCenter.shift, getDefaultWorkMode(schedule, isWarehouseWorkCenterId(workCenter.id) || workCenter.unitType === "warehouse"));
  return formatWorkShift(schedule, mode) || "график не задан";
}

function getPlanningLaborShiftMs(workCenterId = "") {
  const center = getWorkCenter(workCenterId) || {};
  const explicitHours = Number(center.shiftHours || center.equipmentHoursPerShift || center.humanHoursPerShift || 0);
  if (Number.isFinite(explicitHours) && explicitHours > 0) return explicitHours * 60 * 60 * 1000;
  const schedule = normalizeWorkSchedule(center.workSchedule || center.shift, isWarehouseWorkCenterId(workCenterId) ? "24/7" : "5/2");
  const mode = normalizeWorkMode(center.calendarShiftWindow || center.workMode || center.shift || "", getDefaultWorkMode(schedule, isWarehouseWorkCenterId(workCenterId)));
  const match = mode.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
  if (match) {
    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    const endMinutes = Number(match[3]) * 60 + Number(match[4]);
    const durationMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : (24 * 60 - startMinutes) + endMinutes;
    if (durationMinutes > 0) return durationMinutes * 60 * 1000;
  }
  return (isWarehouseWorkCenterId(workCenterId) ? 24 : 12) * 60 * 60 * 1000;
}

function normalizeWorkCenterUnit(center = {}) {
  const migratedName = LEGACY_WORK_CENTER_NAME_MIGRATION[center.name] || center.name;
  const unitType = normalizeUnitType(center.unitType, center);
  const isWarehouse = isWarehouseWorkCenterId(center.id) || unitType === "warehouse";
  const isAdministrative = unitType === "administrative";
  const isPlanningUnit = center.isPlanningUnit === undefined
    ? !isAdministrative
    : Boolean(center.isPlanningUnit);
  const showInGantt = center.showInGantt === undefined ? isPlanningUnit : Boolean(center.showInGantt);
  const unitsPerHour = isPlanningUnit
    ? Math.max(0, Number(center.unitsPerHour || 0))
    : Math.max(0, Number(center.unitsPerHour || 0));
  const capacity = isPlanningUnit
    ? Math.max(1, Number(center.capacity || 1))
    : Math.max(0, Number(center.capacity || 0));
  const defaultSchedule = isPlanningUnit ? (isWarehouse ? "24/7" : "5/2") : "";
  const workSchedule = normalizeWorkSchedule(center.workSchedule || center.shift, defaultSchedule);
  const workMode = normalizeWorkMode(center.workMode || center.shift, isPlanningUnit ? getDefaultWorkMode(workSchedule, isWarehouse) : "");

  return {
    ...center,
    name: migratedName,
    unitType,
    owner: String(center.owner || "").trim(),
    isPlanningUnit,
    showInGantt,
    unitsPerHour,
    capacity,
    workSchedule,
    workMode,
    shift: formatWorkShift(workSchedule, workMode),
    isActive: center.isActive !== false,
  };
}

function getLegacyDepartmentTargetCenterId(departmentName = "") {
  const direct = LEGACY_DEPARTMENT_TO_WORK_CENTER_ID[departmentName];
  if (direct) return direct;
  const normalized = normalizeLookupText(EMPLOYEE_DEPARTMENT_MIGRATION[departmentName] || departmentName);
  const sourceState = getRuntimePlanningState({ workCenters: getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides()) });
  const exact = (sourceState?.workCenters || []).find((center) => (
    normalizeLookupText(center.name) === normalized
    || normalizeLookupText(center.code) === normalized
  ));
  if (exact) return exact.id;
  return "";
}

function getUnifiedUnitName(name = "") {
  const migratedName = LEGACY_WORK_CENTER_NAME_MIGRATION[EMPLOYEE_DEPARTMENT_MIGRATION[name] || name] || EMPLOYEE_DEPARTMENT_MIGRATION[name] || name;
  const targetId = getLegacyDepartmentTargetCenterId(migratedName);
  const target = targetId ? getWorkCenter(targetId) : null;
  if (target?.name) return target.name;
  return migratedName;
}

function migrateSpecificationDepartmentNames(renameMap) {
  if (!renameMap.size) return false;
  let changed = false;
  directoryState.specifications = (directoryState.specifications || []).map((specification) => {
    let specificationChanged = false;
    const nextItems = getSpecificationStructureItems(specification).map((item) => {
      const nextDepartmentName = renameMap.get(item.departmentName) || item.departmentName;
      if (nextDepartmentName === item.departmentName) return item;
      specificationChanged = true;
      return { ...item, departmentName: nextDepartmentName };
    });
    if (!specificationChanged) return specification;
    changed = true;
    return { ...specification, structureItems: nextItems };
  });
  return changed;
}

function migrateDepartmentsToUnifiedWorkCenters() {
  if (!planningState || !directoryState) return;
  // Legacy cleanup only: old directory departments can rename existing matrix-derived centers, but cannot create new ones.
  const legacyDepartments = Array.isArray(directoryState.departments) ? directoryState.departments : [];
  const renameMap = new Map();
  let planningChanged = false;
  let directoryChanged = false;

  planningState.workCenters = (planningState.workCenters || []).map((center) => {
    const normalizedCenter = normalizeWorkCenterUnit(center);
    if (center.name && normalizedCenter.name !== center.name) {
      renameMap.set(center.name, normalizedCenter.name);
      planningChanged = true;
    }
    return normalizedCenter;
  });

  legacyDepartments.forEach((department) => {
    if (!department?.name) return;
    const targetId = getLegacyDepartmentTargetCenterId(department.name);
    const targetIndex = targetId
      ? planningState.workCenters.findIndex((center) => center.id === targetId)
      : -1;

    if (targetIndex >= 0) {
      const target = planningState.workCenters[targetIndex];
      renameMap.set(department.name, target.name);
      planningState.workCenters[targetIndex] = normalizeWorkCenterUnit({
        ...target,
        owner: target.owner || department.owner || "",
        legacyDepartmentNames: [...new Set([...(target.legacyDepartmentNames || []), department.name])],
      });
      planningChanged = true;
      return;
    }

    directoryChanged = true;
  });

  if ((directoryState.employees || []).length) {
    directoryState.employees = [];
    directoryChanged = true;
  }

  if (migrateSpecificationDepartmentNames(renameMap)) directoryChanged = true;

  if (legacyDepartments.length) {
    directoryState.departments = [];
    directoryChanged = true;
  }

  if (planningChanged) {
    planningState = normalizePlanningState(planningState);
    persistState();
  }
  if (directoryChanged) persistDirectoryState();
}

function migrateProjectEntityToSpecifications() {
  // Legacy migration only. "Project" is no longer a business entity; old
  // projectId fields are kept as aliases for specificationId in saved Gantt data.
  if (!planningState || !directoryState) return;

  const legacyProjects = Array.isArray(planningState.projects) ? planningState.projects : [];
  const legacyProjectById = byId(legacyProjects);
  const specifications = Array.isArray(directoryState.specifications) ? directoryState.specifications : [];
  const projectToSpecificationId = new Map();
  let changed = false;

  specifications.forEach((specification) => {
    if (specification.projectId) projectToSpecificationId.set(specification.projectId, specification.id);
    projectToSpecificationId.set(specification.id, specification.id);
  });

  const nextSpecifications = [...specifications];
  legacyProjects.forEach((project) => {
    let specificationId = projectToSpecificationId.get(project.id);
    const legacySuffix = String(project.id || "").replace(/^p-/, "");
    const derivedSpecificationId = legacySuffix ? `spec-${legacySuffix}` : "";
    if (!specificationId && nextSpecifications.some((specification) => specification.id === derivedSpecificationId)) {
      specificationId = derivedSpecificationId;
      projectToSpecificationId.set(project.id, specificationId);
      changed = true;
    }
    if (!specificationId) {
      specificationId = derivedSpecificationId || `spec-${makeId("legacy")}`;
      let uniqueId = specificationId;
      let suffix = 1;
      while (nextSpecifications.some((specification) => specification.id === uniqueId)) {
        suffix += 1;
        uniqueId = `${specificationId}-${suffix}`;
      }
      specificationId = uniqueId;
      nextSpecifications.push({
        id: specificationId,
        name: project.name || `Состав изделия ${project.orderNumber || project.id}`,
        outputItem: project.name || "",
        bomListA: "",
        bomQtyA: 0,
        bomListB: "",
        bomQtyB: 0,
        extraItems: "",
        status: "Активен",
        structureManaged: true,
        structureItems: [],
        createdAt: project.createdAt || new Date().toISOString(),
      });
      projectToSpecificationId.set(project.id, specificationId);
      changed = true;
    }
  });

  const stamp = new Date().toISOString();
  directoryState.specifications = nextSpecifications.map((specification) => {
    const legacyProject = specification.projectId ? legacyProjectById[specification.projectId] : null;
    const next = {
      ...specification,
      projectId: "",
      productionQuantity: normalizeOptionalPositiveInteger(specification.productionQuantity || legacyProject?.totalQuantity) || "",
      dueDate: specification.dueDate || legacyProject?.dueDate || "",
      orderNumber: specification.orderNumber || legacyProject?.orderNumber || "",
      customer: specification.customer || legacyProject?.customer || "",
      updatedAt: specification.updatedAt || legacyProject?.updatedAt || stamp,
    };
    if (specification.projectId || legacyProject) changed = true;
    const synced = syncSpecificationDerivedFields(next);
    if (JSON.stringify(synced) !== JSON.stringify(specification)) changed = true;
    return synced;
  });

  directoryState.bomLists = (directoryState.bomLists || []).map((bom) => {
    if (!bom.projectId) return bom;
    changed = true;
    return { ...bom, projectId: "" };
  });

  const routeByLegacyProjectId = new Map((planningState.routes || [])
    .filter((route) => route.projectId)
    .map((route) => [route.projectId, route]));
  const routeById = new Map();

  planningState.routes = (planningState.routes || []).map((route) => {
    const specificationId = route.specificationId
      || projectToSpecificationId.get(route.projectId)
      || (getSpecificationById(route.projectId) ? route.projectId : "");
    if (route.specificationId === specificationId && route.projectId === specificationId) {
      routeById.set(route.id, route);
      return route;
    }
    changed = true;
    const specification = getSpecificationById(specificationId);
    const nextRoute = {
      ...route,
      specificationId,
      specificationName: specification?.name || route.specificationName || "",
      projectId: specificationId || route.projectId || "",
      updatedAt: route.updatedAt || stamp,
    };
    routeById.set(nextRoute.id, nextRoute);
    return nextRoute;
  });

  const routeByLegacyAfterMigration = new Map((planningState.routes || [])
    .map((route) => [route.projectId, route]));

  const routeByStepId = new Map((planningState.routeSteps || []).map((step) => [step.id, routeById.get(step.routeId)]));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const route = routeByStepId.get(slot.routeStepId)
      || routeById.get(slot.routeId)
      || routeByLegacyProjectId.get(slot.projectId)
      || routeByLegacyAfterMigration.get(projectToSpecificationId.get(slot.projectId) || slot.projectId);
    const specificationId = slot.specificationId
      || route?.specificationId
      || projectToSpecificationId.get(slot.projectId)
      || (getSpecificationById(slot.projectId) ? slot.projectId : "");
    const currentRouteId = slot.routeId || "";
    const currentSpecificationId = slot.specificationId || "";
    const currentProductionId = slot.projectId || "";
    if (currentRouteId === (route?.id || "") && currentSpecificationId === specificationId && currentProductionId === specificationId) return slot;
    changed = true;
    return {
      ...slot,
      routeId: route?.id || slot.routeId || "",
      specificationId,
      projectId: specificationId || slot.projectId || "",
      updatedAt: slot.updatedAt || stamp,
    };
  });

  if (planningState.projects?.length) {
    planningState.projects = [];
    changed = true;
  } else {
    planningState.projects = [];
  }

  planningState = normalizePlanningState(planningState);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });

  if (changed) {
    persistState();
    persistDirectoryState();
  }
}

function notifySaveSuccess(message = "Сохранено") {
  pendingSaveFeedback = {
    message: String(message || "Сохранено"),
    createdAt: Date.now(),
  };
  window.clearTimeout(saveFeedbackTimer);
  window.setTimeout(renderPendingSaveFeedback, 0);
}

function renderPendingSaveFeedback() {
  document.querySelectorAll(".global-save-toast").forEach((element) => element.remove());
  if (!pendingSaveFeedback) return;
  window.clearTimeout(saveFeedbackTimer);

  const toast = document.createElement("div");
  toast.className = "global-save-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `${icon("check")}<span>${escapeHtml(pendingSaveFeedback.message)}</span>`;
  document.body.appendChild(toast);

  saveFeedbackTimer = window.setTimeout(() => {
    toast.classList.add("is-hiding");
    window.setTimeout(() => toast.remove(), 180);
    pendingSaveFeedback = null;
  }, 2600);
}

function scheduleGlobalSaveUxRefresh() {
  window.clearTimeout(saveUxRefreshTimer);
  saveUxRefreshTimer = window.setTimeout(() => {
    bindGlobalFormDirtyTracking();
    renderPendingSaveFeedback();
  }, 0);
}

function getMesSignalMeta(signalType = "neutral") {
  return MES_SIGNAL_TYPES[signalType] || MES_SIGNAL_TYPES.neutral;
}

function mountGlobalVisualSystem() {
  const shell = app.querySelector(".app-shell");
  document.body.classList.toggle("is-mes-focus-mode", Boolean(ui.focusMode));
  if (shell) {
    shell.classList.toggle("is-focus-mode", Boolean(ui.focusMode));
  }
  mountVisualModeTray();
}

function mountVisualModeTray() {
  document.querySelectorAll(".mes-visual-mode-tray").forEach((element) => element.remove());
  const topbar = app.querySelector(".app-topbar");
  const topbarRect = topbar?.getBoundingClientRect();
  const topbarVisible = topbar
    && window.getComputedStyle(topbar).display !== "none"
    && topbarRect?.width > 0
    && topbarRect?.height > 0;
  if (ui.activeModule !== "gantt" || topbarVisible) return;

  const tray = document.createElement("div");
  tray.className = "mes-visual-mode-tray";
  tray.setAttribute("aria-label", "Режимы интерфейса");
  tray.innerHTML = `
    <button class="app-topbar-action ${ui.focusMode ? "is-active" : ""}" data-toggle-focus-mode type="button" aria-pressed="${ui.focusMode ? "true" : "false"}" title="${ui.focusMode ? "Выйти из режима фокуса" : "Режим фокуса: скрыть вторичные панели и открыть браузер во весь экран"}">
      ${icon("focus")}
      <span>${ui.focusMode ? "Выйти из фокуса" : "Фокус"}</span>
    </button>
  `;
  document.body.appendChild(tray);
}
function getFormControlSignatureEntry(control) {
  if (!control?.name || control.disabled) return null;
  const type = String(control.type || "").toLowerCase();
  if (["button", "submit", "reset", "file"].includes(type)) return null;
  if (type === "checkbox" || type === "radio") {
    return [control.name, control.checked ? String(control.value || "on") : ""];
  }
  if (control.tagName === "SELECT" && control.multiple) {
    return [control.name, [...control.selectedOptions].map((option) => option.value).join("|")];
  }
  return [control.name, String(control.value ?? "")];
}

function getFormSignature(form) {
  return JSON.stringify([...form.elements]
    .map((control) => getFormControlSignatureEntry(control))
    .filter(Boolean)
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
}

function isUnsavedCreateForm(form) {
  const isNewValue = form.querySelector('[name="isNew"]')?.value;
  const rowIndexValue = form.querySelector('[name="rowIndex"]')?.value;
  if (isNewValue === "yes" || rowIndexValue === "-1") return true;
  if (form.id === "slotForm" && !form.querySelector('[name="slotId"]')?.value) return true;
  return ["splitForm"].includes(form.id);
}

function setSaveButtonDisabled(button, disabled) {
  if (!button) return;
  if (!Object.prototype.hasOwnProperty.call(button.dataset, "saveOriginalTitle")) {
    button.dataset.saveOriginalTitle = button.getAttribute("title") || "";
  }
  button.toggleAttribute("disabled", Boolean(disabled));
  button.classList.toggle("is-save-disabled", Boolean(disabled));
  if (disabled) {
    button.setAttribute("title", "Измените данные, чтобы сохранить");
    return;
  }
  if (button.dataset.saveOriginalTitle) {
    button.setAttribute("title", button.dataset.saveOriginalTitle);
  } else {
    button.removeAttribute("title");
  }
}

function bindGlobalFormDirtyTracking() {
  app.querySelectorAll("form").forEach((form) => {
    if (form.matches("[data-command-form]")) return;
    const saveButtons = [...form.querySelectorAll('button[type="submit"], input[type="submit"]')];
    if (!saveButtons.length) return;
    form.dataset.initialSaveSignature = getFormSignature(form);

    const syncDirtyState = () => {
      const isDirty = isUnsavedCreateForm(form) || getFormSignature(form) !== form.dataset.initialSaveSignature;
      form.classList.toggle("is-dirty", isDirty);
      saveButtons.forEach((button) => setSaveButtonDisabled(button, !isDirty));
    };
    const guardCleanSubmit = (event) => {
      if (isUnsavedCreateForm(form)) return;
      if (getFormSignature(form) !== form.dataset.initialSaveSignature) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    if (!form.dataset.saveUxBound) {
      form.addEventListener("input", syncDirtyState);
      form.addEventListener("change", syncDirtyState);
      form.addEventListener("submit", guardCleanSubmit, true);
      form.dataset.saveUxBound = "yes";
    }
    syncDirtyState();
  });
}

function normalizeOptionalPositiveInteger(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) return "";
  return number;
}

function normalizeGanttDependencyRouteStore(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(Object.entries(value).flatMap(([routeKey, route]) => {
    if (Number(route?.version || 0) !== GANTT_DEPENDENCY_ROUTE_VERSION) return [];
    const offsets = route?.offsets && typeof route.offsets === "object" && !Array.isArray(route.offsets)
      ? route.offsets
      : {};
    const normalizedOffsets = Object.fromEntries(Object.entries(offsets).flatMap(([pointIndex, offset]) => {
      const index = Number(pointIndex);
      const x = Number(offset?.x || 0);
      const y = Number(offset?.y || 0);
      if (!Number.isInteger(index) || index < 0 || (!Number.isFinite(x) && !Number.isFinite(y))) return [];
      const normalized = {
        x: Number.isFinite(x) ? round(x) : 0,
        y: Number.isFinite(y) ? round(y) : 0,
      };
      if (Math.abs(normalized.x) < 0.1 && Math.abs(normalized.y) < 0.1) return [];
      return [[String(index), normalized]];
    }));

    return [[String(routeKey), { version: GANTT_DEPENDENCY_ROUTE_VERSION, offsets: normalizedOffsets }]];
  }).filter(([, route]) => Object.keys(route.offsets).length));
}

function cloneGanttDependencyRouteStore(value = {}) {
  return normalizeGanttDependencyRouteStore(JSON.parse(JSON.stringify(value || {})));
}

function normalizePlanningLaborNoteByRow(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, labor]) => {
    const normalizedKey = String(key || "").trim();
    const normalizedLabor = String(labor || "").trim().slice(0, 80);
    return normalizedKey && normalizedLabor ? [[normalizedKey, normalizedLabor]] : [];
  }));
}

function normalizePlanningOrderLaborByStepId(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, settings]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || !settings || typeof settings !== "object" || Array.isArray(settings)) return [];
    const next = {};
    const mode = String(settings.mode || "").trim();
    if (mode === "fixed" || mode === "unit" || mode === "panel" || mode === "shift") {
      next.mode = mode;
    }
    [
      ["minutesPerUnit", 0.001, 100000],
      ["minutesPerPanel", 0.001, 100000],
      ["fixedMinutes", 0.001, 1000000],
      ["shiftQuantity", 1, 100000000],
    ].forEach(([field, min, max]) => {
      const rawValue = settings[field];
      if (rawValue === "" || rawValue === null || rawValue === undefined) return;
      const number = Number(String(rawValue).trim().replace(",", "."));
      if (!Number.isFinite(number)) return;
      next[field] = Math.min(max, Math.max(min, number));
    });
    return Object.keys(next).length ? [[normalizedKey, next]] : [];
  }));
}

function normalizePlanningLegacyManualLaborByStep(value = {}) {
  return normalizePlanningOrderLaborByStepId(value);
}

function getPlanningOrderLaborSlotFields(route, step = {}, quantity = 1, options = {}) {
  const setting = normalizePlanningOrderLaborByStepId(route?.planningLaborByStepId)[step?.id] || null;
  if (!setting?.mode) return {};
  const normalizedQuantity = normalizeQuantity(quantity || 1, 1);
  const boardsPerPanel = normalizeBoardsPerPanel(setting.boardsPerPanel || step.boardsPerPanel || options.boardsPerPanel, 1);
  const shiftMs = Math.max(60 * 60 * 1000, Number(setting.shiftMs || 0) || getPlanningLaborShiftMs(options.workCenterId || step.workCenterId || ""));
  const context = {
    planningLaborSource: "work_order",
    planningLaborMode: setting.mode,
    planningLaborFixedMinutes: setting.fixedMinutes || 0,
    planningLaborMinutesPerUnit: setting.minutesPerUnit || 0,
    planningLaborMinutesPerPanel: setting.minutesPerPanel || 0,
    planningLaborShiftQuantity: setting.shiftQuantity || 0,
    planningLaborBoardsPerPanel: boardsPerPanel,
    planningLaborShiftMs: shiftMs,
    workCenterId: options.workCenterId || step.workCenterId || "",
  };
  const durationMs = calculatePlanningOrderLaborDurationMs(context, normalizedQuantity) || MIN_OPERATION_DURATION_MS;
  return {
    planningLaborSource: "work_order",
    planningLaborMode: setting.mode,
    planningLaborSourceLabel: "заказ-наряд",
    planningLaborDurationMs: durationMs,
    planningLaborDurationLabel: formatDuration(durationMs),
    planningLaborMinutesPerUnit: setting.mode === "unit" ? setting.minutesPerUnit || 0 : 0,
    planningLaborMinutesPerPanel: setting.mode === "panel" ? setting.minutesPerPanel || 0 : 0,
    planningLaborFixedMinutes: setting.mode === "fixed" ? setting.fixedMinutes || 0 : 0,
    planningLaborShiftQuantity: setting.mode === "shift" ? setting.shiftQuantity || 0 : 0,
    planningLaborBoardsPerPanel: boardsPerPanel,
    planningLaborShiftCapacity: setting.mode === "shift" ? setting.shiftQuantity || 0 : 0,
    planningLaborShiftCount: setting.mode === "shift" ? Math.max(1, Math.ceil(normalizedQuantity / Math.max(1, setting.shiftQuantity || normalizedQuantity))) : 0,
    planningLaborShiftMs: shiftMs,
    planningLaborUpdatedAt: options.stamp || new Date().toISOString(),
    planningLaborRevision: 1,
  };
}

function getPlanningOrderLaborPlan(route, step = {}, options = {}) {
  const fields = getPlanningOrderLaborSlotFields(route, step, options.quantity || 1, options);
  return fields.planningLaborDurationMs ? { ...fields, durationMs: fields.planningLaborDurationMs } : null;
}

function applyPlanningOrderLaborToSlot(slot = {}, route, step = {}, quantity = slot.quantity || 1, options = {}) {
  return {
    ...slot,
    ...getPlanningOrderLaborSlotFields(route, step, quantity, {
      ...options,
      workCenterId: options.workCenterId || slot.workCenterId || "",
    }),
  };
}

function isDeepLinkDirectorySectionId(sectionId = "") {
  return [
    "operations",
    "componentTypes",
    "nomenclatureTypes",
    "statuses",
  ].includes(String(sectionId || "").trim());
}

function normalizeDeepLinkModuleId(moduleId = "") {
  const candidate = String(moduleId || "").trim();
  const aliases = {
    bomLists: "nomenclature",
    products: "specifications2",
    specifications: "specifications2",
    speki: "specifications2",
    routes: "specifications2",
    planning2: "planning",
    planningWorkbench: "planning",
    warehouse: "gantt",
    shiftMaster: "shiftMasterBoard",
    shiftMasterContext: "shiftMasterBoard",
    shiftMasterV2: "shiftMasterBoard",
  };
  const normalized = aliases[candidate] || candidate;
  const availableDefinitions = getModuleDefinitions({ adminHost: isAdminRuntimeHost() });
  return availableDefinitions.some((moduleItem) => moduleItem.id === normalized) ? normalized : "";
}

function normalizeStoredModuleId(moduleId = "") {
  const normalized = normalizeDeepLinkModuleId(moduleId);
  return normalized || defaultUiState.activeModule;
}

function getAuthGateSessionDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAuthGateSessionExpiresAt(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function getAuthGateSession() {
  const session = parseJsonObject(localStorage.getItem(AUTH_GATE_SESSION_STORAGE_KEY));
  if (!session?.unlocked) {
    localStorage.removeItem(AUTH_GATE_SESSION_STORAGE_KEY);
    return null;
  }

  const todayKey = getAuthGateSessionDateKey();
  const expiresAtMs = Date.parse(session.expiresAt || "");
  const isExpired = session.dateKey !== todayKey || (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now());
  if (isExpired) {
    localStorage.removeItem(AUTH_GATE_SESSION_STORAGE_KEY);
    return null;
  }

  return {
    unlocked: true,
    userId: String(session.userId || ""),
    roleId: normalizeInterfaceRoleId(session.roleId || DEFAULT_INTERFACE_ROLE_ID),
    dateKey: todayKey,
    expiresAt: session.expiresAt || getAuthGateSessionExpiresAt().toISOString(),
  };
}

function getAuthGateSessionUnlocked() {
  return Boolean(getAuthGateSession());
}

function setAuthGateSessionUnlocked(value) {
  if (!value) {
    localStorage.removeItem(AUTH_GATE_SESSION_STORAGE_KEY);
    return;
  }

  const now = new Date();
  const roleId = normalizeInterfaceRoleId(ui?.activeRole || DEFAULT_INTERFACE_ROLE_ID);
  localStorage.setItem(AUTH_GATE_SESSION_STORAGE_KEY, JSON.stringify({
    unlocked: true,
    userId: String(ui?.authCurrentUserId || ""),
    roleId,
    dateKey: getAuthGateSessionDateKey(now),
    startedAt: now.toISOString(),
    expiresAt: getAuthGateSessionExpiresAt(now).toISOString(),
    version: APP_VERSION,
  }));
}

function applyAuthGateSession(state = {}) {
  const session = getAuthGateSession();
  if (!session) {
    return {
      ...state,
      authGateUnlocked: false,
      authCurrentUserId: "",
    };
  }

  return {
    ...state,
    authGateUnlocked: true,
    authCurrentUserId: session.userId,
    activeRole: session.roleId,
    authPrototypeAttemptsLeft: AUTH_GATE_MAX_ATTEMPTS,
  };
}

function isAuthGateQaBypassEnabled() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("qa-auth-bypass") === "1";
  } catch {
    return false;
  }
}

function isAdminRuntimeHost() {
  if (typeof window === "undefined") return false;
  return MES_ADMIN_RUNTIME_HOSTS.has(String(window.location.hostname || "").trim().toLowerCase());
}

function isAuthGateUnlocked() {
  return Boolean(ui?.authGateUnlocked) || getAuthGateSessionUnlocked() || isAuthGateQaBypassEnabled();
}

function lockAuthGate() {
  cancelAuthPrototypePinFeedback();
  ui.authGateUnlocked = false;
  ui.authPrototypeResult = "";
  ui.authPrototypeDepartment = "";
  ui.authPrototypeUnit = "";
  ui.authPrototypePersonId = "";
  ui.authCurrentUserId = "";
  ui.authPrototypeAttemptsLeft = AUTH_GATE_MAX_ATTEMPTS;
  resetAuthPrototypePinEntry();
  setAuthGateSessionUnlocked(false);
}

function unlockAuthGate(options = {}) {
  ui.authGateUnlocked = true;
  ui.authCurrentUserId = String(options.personId || ui.authCurrentUserId || "");
  ui.activeRole = normalizeInterfaceRoleId(options.roleId || ui.activeRole || DEFAULT_INTERFACE_ROLE_ID);
  ui.activeModule = getAccessRoleById(ui.activeRole).defaultModule || AUTH_GATE_DEFAULT_MODULE;
  ui.authPrototypeAttemptsLeft = AUTH_GATE_MAX_ATTEMPTS;
  resetAuthPrototypePinEntry();
  setAuthGateSessionUnlocked(true);
}

function ensureAuthGateModule() {
  if (isAdminRuntimeHost()) {
    ui.activeModule = "contourAdmin";
    return false;
  }
  if (isAuthGateUnlocked()) return false;
  ui.activeModule = "authPrototype";
  return true;
}

function getUrlUiOverrides() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search || "");
  const overrides = {};
  if (isAdminRuntimeHost()) {
    overrides.activeModule = "contourAdmin";
    return overrides;
  }
  const rawModuleId = String(params.get("module") || params.get("m") || "").trim();
  const moduleId = normalizeDeepLinkModuleId(rawModuleId);
  const directoryId = String(params.get("directory") || params.get("dir") || "").trim();
  if (moduleId) overrides.activeModule = moduleId;
  if (rawModuleId === "bomLists") overrides.activeNomenclaturePane = "boards";
  if (directoryId && isDeepLinkDirectorySectionId(directoryId)) {
    overrides.activeDirectory = directoryId;
    if (!overrides.activeModule) overrides.activeModule = "directories";
  }
  return overrides;
}

function applyUrlUiOverrides(state = {}) {
  return {
    ...state,
    ...getUrlUiOverrides(),
  };
}

function normalizeShiftMasterBoardSwimlane(value = "") {
  const candidate = String(value || "").trim();
  return SHIFT_MASTER_BOARD_SWIMLANES.some((item) => item.id === candidate) ? candidate : "order";
}

function normalizeShiftMasterBoardFocus(value = "") {
  const candidate = String(value || "").trim();
  return SHIFT_MASTER_BOARD_FOCUS_MODES.some((item) => item.id === candidate) ? candidate : "all";
}

function normalizeShiftMasterBoardLane(value = "") {
  const candidate = String(value || "").trim();
  if (candidate === "ready") return "intake";
  if (candidate === "issued") return "assigned";
  return SHIFT_MASTER_BOARD_LANES.some((item) => item.id === candidate) ? candidate : "";
}

function normalizePlainRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeShiftMasterAssignmentScopeMode(value = "") {
  const id = String(value || "").trim();
  return SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES.some((mode) => mode.id === id) ? id : "department";
}

function normalizeIdList(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

function normalizeShiftMasterAssignmentMatrix(value = {}) {
  return Object.fromEntries(Object.entries(normalizePlainRecord(value))
    .map(([masterId, config]) => {
      const normalizedMasterId = String(masterId || "").trim();
      if (!normalizedMasterId) return null;
      const record = normalizePlainRecord(config);
      return [normalizedMasterId, {
        mode: normalizeShiftMasterAssignmentScopeMode(record.mode),
        employeeIds: normalizeIdList(record.employeeIds),
        updatedAt: String(record.updatedAt || ""),
      }];
    })
    .filter(Boolean));
}

function normalizeShiftMasterBoardRiskReason(value = "") {
  const id = String(value || "").trim();
  return SHIFT_MASTER_BOARD_RISK_REASONS.some((item) => item.id === id) ? id : "";
}

function getShiftMasterBoardRiskLabel(value = "") {
  const id = normalizeShiftMasterBoardRiskReason(value);
  return SHIFT_MASTER_BOARD_RISK_REASONS.find((item) => item.id === id)?.label || "Нет риска";
}

function syncUiWithUrlParams() {
  const overrides = getUrlUiOverrides();
  if (overrides.activeModule) ui.activeModule = overrides.activeModule;
  if (overrides.activeDirectory) ui.activeDirectory = overrides.activeDirectory;
}

function updateModuleUrlParam(moduleId = "") {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (moduleId) {
    url.searchParams.set("module", moduleId);
  } else {
    url.searchParams.delete("module");
  }
  if (moduleId !== "productionStructureMatrix") url.searchParams.delete("structureRegistry");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function loadUiState() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return applyUrlUiOverrides(applyAuthGateSession({
      ...defaultUiState,
      expandedProjects: new Set(defaultUiState.expandedProjects),
    }));
    const parsed = JSON.parse(raw);
    const accessRoleProfiles = normalizeAccessRoleProfiles(parsed.accessRoleProfiles);
    const accessRoleAssignments = normalizeAccessRoleAssignments(parsed.accessRoleAssignments);
    const storedModule = normalizeStoredModuleId(parsed.activeModule);
    return applyUrlUiOverrides(applyAuthGateSession({
      ...defaultUiState,
      ...parsed,
      activeRole: normalizeInterfaceRoleId(parsed.activeRole, accessRoleProfiles),
      activeModule: storedModule,
      scale: parsed.scale === "weeks" ? "days" : scaleConfig[parsed.scale] ? parsed.scale : defaultUiState.scale,
      expandedProjects: new Set(parsed.expandedProjects || defaultUiState.expandedProjects),
      selectedDirectoryRows: parsed.selectedDirectoryRows || {},
      directoryColumnFilters: normalizeDirectoryColumnFilters(parsed.directoryColumnFilters),
      spekiStaleItemIds: Array.isArray(parsed.spekiStaleItemIds) ? parsed.spekiStaleItemIds : [],
      spekiCollapsedBomIds: Array.isArray(parsed.spekiCollapsedBomIds) ? parsed.spekiCollapsedBomIds : [],
      routeBindingMode: parsed.routeBindingMode === "bom" ? "bom" : "product",
      planningWorkItem: String(parsed.planningWorkItem || ""),
      weeklyProductionControlWeekAnchor: normalizeDateInput(parsed.weeklyProductionControlWeekAnchor || defaultUiState.weeklyProductionControlWeekAnchor) || defaultUiState.weeklyProductionControlWeekAnchor,
      planningLaborNoteByRow: normalizePlanningLaborNoteByRow({
        ...(parsed.planningDemoLaborByRow || {}),
        ...(parsed.planningLaborNoteByRow || {}),
      }),
      planningLegacyManualLaborByStep: normalizePlanningLegacyManualLaborByStep({
        ...(parsed.planningThtDemoByStep || {}),
        ...(parsed.planningManualDemoByStep || {}),
        ...(parsed.planningLegacyManualLaborByStep || {}),
      }),
      activeShiftMasterId: String(parsed.activeShiftMasterId || defaultUiState.activeShiftMasterId),
      shiftMasterScope: parsed.shiftMasterScope === "master" ? "master" : "all",
      shiftMasterBoardSelectedSlotId: String(parsed.shiftMasterBoardSelectedSlotId || ""),
      shiftMasterBoardSwimlane: normalizeShiftMasterBoardSwimlane(parsed.shiftMasterBoardSwimlane),
      shiftMasterBoardFocus: normalizeShiftMasterBoardFocus(parsed.shiftMasterBoardFocus),
      shiftMasterBoardLaneBySlot: normalizePlainRecord(parsed.shiftMasterBoardLaneBySlot),
      shiftMasterBoardAssignments: normalizePlainRecord(parsed.shiftMasterBoardAssignments),
      shiftMasterBoardFacts: normalizePlainRecord(parsed.shiftMasterBoardFacts),
      shiftMasterBoardCarryovers: normalizePlainRecord(parsed.shiftMasterBoardCarryovers),
      shiftMasterBoardPrintPreviewId: String(parsed.shiftMasterBoardPrintPreviewId || ""),
      shiftWorkOrderJournalSelectedId: String(parsed.shiftWorkOrderJournalSelectedId || ""),
      shiftWorkOrderPrintPreviewId: "",
      shiftWorkOrderIssuePhotoViewer: null,
      shiftWorkOrderIssueReports: normalizeShiftWorkOrderIssueReports(parsed.shiftWorkOrderIssueReports),
      shiftWorkOrderCollapsedTreeIds: normalizeShiftWorkOrderCollapsedTreeIds(parsed.shiftWorkOrderCollapsedTreeIds),
      shiftMasterAssignmentMatrix: normalizeShiftMasterAssignmentMatrix(parsed.shiftMasterAssignmentMatrix),
      timesheetView: normalizeTimesheetView(parsed.timesheetView),
      timesheetPeriodAnchor: normalizeDateInput(parsed.timesheetPeriodAnchor || defaultUiState.timesheetPeriodAnchor) || defaultUiState.timesheetPeriodAnchor,
      timesheetCellOverrides: normalizePlainRecord(parsed.timesheetCellOverrides),
      timesheetScheduleOverrides: normalizePlainRecord(parsed.timesheetScheduleOverrides),
      timesheetEditor: null,
      productionStructureMatrixOverrides: normalizePlainRecord(parsed.productionStructureMatrixOverrides),
      accessRoleProfiles,
      accessRoleAssignments,
      accessRolesSelectedRoleId: normalizeInterfaceRoleId(parsed.accessRolesSelectedRoleId || parsed.activeRole, accessRoleProfiles),
      accessRolesSelectedEmployeeId: String(parsed.accessRolesSelectedEmployeeId || ""),
      authCurrentUserId: String(parsed.authCurrentUserId || ""),
      authPrototypeDepartment: "",
      authPrototypeUnit: "",
      authPrototypeSearch: "",
      authPrototypePersonId: "",
      authPrototypeResult: "",
      authPrototypeAttemptsLeft: AUTH_GATE_MAX_ATTEMPTS,
      authSessionViewedPersonId: String(parsed.authSessionViewedPersonId || ""),
      authSessionSelectedTaskId: String(parsed.authSessionSelectedTaskId || ""),
      authSessionFactDrafts: normalizePlainRecord(parsed.authSessionFactDrafts),
      authSessionReportDrafts: {},
      authSessionActiveFactField: parsed.authSessionActiveFactField === "defect" ? "defect" : "actual",
      authSessionModal: null,
      activeNomenclaturePane: parsed.activeModule === "bomLists" || parsed.activeNomenclaturePane === "boards" ? "boards" : "items",
      ganttDependencyEditMode: false,
      ganttDependencyRoutes: normalizeGanttDependencyRouteStore(parsed.ganttDependencyRoutes),
      ganttDependencyRouteDrafts: null,
      ganttDependencyDrag: null,
      directoryEditor: null,
      directoryReader: null,
      confirmDialog: null,
      selectedSlotId: null,
      editor: null,
      splitSlotId: null,
      ganttOptimizationDialog: null,
      routePrintPreviewId: "",
      workOrderPrintPreviewId: "",
      drag: null,
      timelineCounts: {
        ...defaultUiState.timelineCounts,
        ...(parsed.timelineCounts || {}),
      },
      ganttZoom: normalizeGanttZoom(parsed.ganttZoom),
      ganttSlotContent: normalizeGanttSlotContent(parsed.ganttSlotContent),
      ganttShowQuantity: typeof parsed.ganttShowQuantity === "boolean" ? parsed.ganttShowQuantity : defaultUiState.ganttShowQuantity,
      hideSharedNonWorkingZones: Boolean(parsed.hideSharedNonWorkingZones),
      focusMode: Boolean(parsed.focusMode),
      now: new Date(),
    }));
  } catch {
    return applyUrlUiOverrides(applyAuthGateSession({
      ...defaultUiState,
      expandedProjects: new Set(defaultUiState.expandedProjects),
    }));
  }
}

function persistUiState(options = {}) {
  const shell = app.querySelector("[data-gantt-shell]");
  if (shell && !options.skipRememberScroll) {
    ui.scrollLeft = shell.scrollLeft;
    ui.scrollTop = shell.scrollTop;
  }

  const serverOwnsShiftExecution = Boolean(isShiftExecutionServerAuthoritative());
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
      activeRole: normalizeInterfaceRoleId(ui.activeRole),
      activeModule: ui.activeModule,
      activeDirectory: ui.activeDirectory,
      activeProjectId: ui.activeProjectId,
      activeSpecificationId: ui.activeSpecificationId,
      spekiEditingId: ui.spekiEditingId,
      spekiCheckedSpecificationId: ui.spekiCheckedSpecificationId,
      spekiStaleItemIds: ui.spekiStaleItemIds,
      spekiCollapsedBomIds: ui.spekiCollapsedBomIds,
      activeBomId: ui.activeBomId,
      activeNomenclatureId: ui.activeNomenclatureId,
      activeNomenclaturePane: ui.activeNomenclaturePane === "boards" ? "boards" : "items",
      activeOperationId: ui.activeOperationId,
	      activeRouteId: ui.activeRouteId,
	      routeFlowStepId: ui.routeFlowStepId,
	      routeLaborStepId: ui.routeLaborStepId,
      routeBindingMode: ui.routeBindingMode,
      planningWorkItem: ui.planningWorkItem,
      weeklyProductionControlWeekAnchor: normalizeDateInput(ui.weeklyProductionControlWeekAnchor || defaultUiState.weeklyProductionControlWeekAnchor) || defaultUiState.weeklyProductionControlWeekAnchor,
      planningLaborNoteByRow: normalizePlanningLaborNoteByRow(ui.planningLaborNoteByRow),
      planningLegacyManualLaborByStep: {},
      activeShiftMasterId: String(ui.activeShiftMasterId || defaultUiState.activeShiftMasterId),
      shiftMasterScope: ui.shiftMasterScope === "master" ? "master" : "all",
      shiftMasterBoardSelectedSlotId: String(ui.shiftMasterBoardSelectedSlotId || ""),
      shiftMasterBoardSwimlane: normalizeShiftMasterBoardSwimlane(ui.shiftMasterBoardSwimlane),
      shiftMasterBoardFocus: normalizeShiftMasterBoardFocus(ui.shiftMasterBoardFocus),
      shiftMasterBoardLaneBySlot: normalizePlainRecord(ui.shiftMasterBoardLaneBySlot),
      ...(serverOwnsShiftExecution ? {} : {
        shiftMasterBoardAssignments: normalizePlainRecord(ui.shiftMasterBoardAssignments),
        shiftMasterBoardFacts: normalizePlainRecord(ui.shiftMasterBoardFacts),
        shiftMasterBoardCarryovers: normalizePlainRecord(ui.shiftMasterBoardCarryovers),
      }),
      shiftMasterBoardPrintPreviewId: String(ui.shiftMasterBoardPrintPreviewId || ""),
      shiftWorkOrderJournalSelectedId: String(ui.shiftWorkOrderJournalSelectedId || ""),
      shiftWorkOrderIssueReports: normalizeShiftWorkOrderIssueReports(ui.shiftWorkOrderIssueReports),
      shiftWorkOrderCollapsedTreeIds: normalizeShiftWorkOrderCollapsedTreeIds(ui.shiftWorkOrderCollapsedTreeIds),
      shiftMasterAssignmentMatrix: normalizeShiftMasterAssignmentMatrix(ui.shiftMasterAssignmentMatrix),
      timesheetView: normalizeTimesheetView(ui.timesheetView),
      timesheetPeriodAnchor: normalizeDateInput(ui.timesheetPeriodAnchor || defaultUiState.timesheetPeriodAnchor) || defaultUiState.timesheetPeriodAnchor,
      timesheetCellOverrides: normalizePlainRecord(ui.timesheetCellOverrides),
      timesheetScheduleOverrides: normalizePlainRecord(ui.timesheetScheduleOverrides),
      productionStructureMatrixOverrides: normalizePlainRecord(ui.productionStructureMatrixOverrides),
      accessRoleProfiles: normalizeAccessRoleProfiles(ui.accessRoleProfiles),
      accessRoleAssignments: normalizeAccessRoleAssignments(ui.accessRoleAssignments),
      accessRolesSelectedRoleId: normalizeInterfaceRoleId(ui.accessRolesSelectedRoleId || ui.activeRole),
      accessRolesSelectedEmployeeId: String(ui.accessRolesSelectedEmployeeId || ""),
      authCurrentUserId: String(ui.authCurrentUserId || ""),
      authPrototypeDepartment: String(ui.authPrototypeDepartment || ""),
      authPrototypeUnit: String(ui.authPrototypeUnit || ""),
      authPrototypeSearch: String(ui.authPrototypeSearch || ""),
      authPrototypePersonId: String(ui.authPrototypePersonId || ""),
      authSessionViewedPersonId: String(ui.authSessionViewedPersonId || ""),
      authSessionSelectedTaskId: String(ui.authSessionSelectedTaskId || ""),
      authSessionFactDrafts: normalizePlainRecord(ui.authSessionFactDrafts),
      authSessionReportDrafts: {},
      authSessionActiveFactField: ui.authSessionActiveFactField === "defect" ? "defect" : "actual",
      selectedDirectoryRows: ui.selectedDirectoryRows,
      directoryColumnFilters: normalizeDirectoryColumnFilters(ui.directoryColumnFilters),
    scale: ui.scale,
    windowStart: ui.windowStart,
    workCenterFilter: ui.workCenterFilter,
    rowMode: ui.rowMode,
    autoCascade: ui.autoCascade,
    hideSharedNonWorkingZones: ui.hideSharedNonWorkingZones,
    focusMode: Boolean(ui.focusMode),
    ganttZoom: ui.ganttZoom,
    ganttSlotContent: ui.ganttSlotContent,
    ganttShowQuantity: Boolean(ui.ganttShowQuantity),
    ganttDependencyRoutes: normalizeGanttDependencyRouteStore(ui.ganttDependencyRoutes),
    timelineCounts: ui.timelineCounts,
    expandedProjects: [...ui.expandedProjects],
    scrollLeft: ui.scrollLeft,
    scrollTop: ui.scrollTop,
  }));

  if (!sharedStateApplyingRemote) {
    const signature = getSharedUiSignature();
    if (signature !== sharedStateStatus.lastSharedUiSignature) {
      sharedStateStatus.lastSharedUiSignature = signature;
      markSharedUiDirty(signature);
      if (sharedStateStatus.enabled) scheduleSharedStatePush("shared-ui");
    }
  }
}

function getPlanningOrderLaborKey(route, step) {
  return `${route?.id || "route"}::${step?.id || "step"}`;
}

function parsePlanningOrderLaborKey(laborKey = "") {
  const [routeId, stepId] = String(laborKey || "").split("::");
  return {
    routeId: String(routeId || "").trim(),
    stepId: String(stepId || "").trim(),
  };
}

function setPlanningOrderLaborSetting(routeId = "", stepId = "", field = "", value = "") {
  const normalizedRouteId = String(routeId || "").trim();
  const normalizedStepId = String(stepId || "").trim();
  const normalizedField = String(field || "").trim();
  if (!normalizedRouteId || !normalizedStepId || !normalizedField) return false;

  let updated = false;
  planningState.routes = (planningState.routes || []).map((route) => {
    if (route.id !== normalizedRouteId) return route;
    const currentStore = normalizePlanningOrderLaborByStepId(route.planningLaborByStepId);
    const current = currentStore[normalizedStepId] || {};
    const nextStore = normalizePlanningOrderLaborByStepId({
      ...currentStore,
      [normalizedStepId]: {
        ...current,
        [normalizedField]: value,
      },
    });
    updated = true;
    return {
      ...route,
      planningLaborByStepId: nextStore,
    };
  });

  return updated;
}

function migratePlanningManualLaborUiToRoutes() {
  const legacySettings = normalizePlanningLegacyManualLaborByStep(ui.planningLegacyManualLaborByStep);
  const entries = Object.entries(legacySettings);
  if (!entries.length) return 0;

  let migratedCount = 0;
  const routeIndexes = new Map((planningState.routes || []).map((route, index) => [route.id, index]));
  entries.forEach(([legacyKey, settings]) => {
    const { routeId, stepId } = parsePlanningOrderLaborKey(legacyKey);
    if (!routeId || !stepId || !routeIndexes.has(routeId)) return;
    const routeIndex = routeIndexes.get(routeId);
    const route = planningState.routes[routeIndex];
    const currentStore = normalizePlanningOrderLaborByStepId(route.planningLaborByStepId);
    if (currentStore[stepId]) return;
    planningState.routes[routeIndex] = {
      ...route,
      planningLaborByStepId: normalizePlanningOrderLaborByStepId({
        ...currentStore,
        [stepId]: settings,
      }),
    };
    migratedCount += 1;
  });

  ui.planningLegacyManualLaborByStep = {};
  persistUiState();
  if (migratedCount) persistState();
  return migratedCount;
}

function persistAuthState() {
  setAuthGateSessionUnlocked(Boolean(ui?.authGateUnlocked));
}

function normalizeDirectoryState(state, options = {}) {
  const fallback = createDefaultDirectoryState();
  const mergeFallback = options.mergeFallback !== false;
  const normalizedState = Object.fromEntries(Object.entries(fallback).map(([sectionId, fallbackRows]) => {
    const sourceRows = Array.isArray(state?.[sectionId]) ? state[sectionId] : fallbackRows;
    const sourceIds = new Set(sourceRows.map((row) => row?.id).filter(Boolean));
    const rows = [
      ...sourceRows,
      ...(mergeFallback ? fallbackRows.filter((row) => row?.id && !sourceIds.has(row.id)) : []),
    ];
    return [sectionId, rows
      .filter((row) => sectionId !== "statuses" || !REMOVED_DIRECTORY_STATUS_ID_PREFIXES.some((prefix) => String(row?.id || "").startsWith(prefix)))
      .filter((row) => shouldKeepDirectoryRow(sectionId, row))
      .map((row, index) => normalizeDirectoryRow(sectionId, {
        ...(fallbackRows.find((fallbackRow) => fallbackRow.id === row.id) || fallbackRows[index]),
        ...row,
        id: row.id || fallbackRows[index]?.id || `${sectionId}-${index + 1}`,
      }))];
  }));

  normalizedState.nomenclature = (normalizedState.nomenclature || []).map((item) => ({
    ...item,
    name: /^новый узел$/i.test(String(item.name || "").trim()) ? "Новая номенклатурная позиция" : item.name,
    type: normalizeNomenclatureType(item.type) === "Производимые узлы" ? "Производимые изделия" : item.type,
  }));
  normalizedState.nomenclatureTypes = (normalizedState.nomenclatureTypes || [])
    .map((item) => normalizeNomenclatureType(item.name) === "Производимые узлы"
      ? { ...item, name: "Производимые изделия", description: item.description || "Изготавливаемая номенклатура" }
      : item)
    .filter((item, index, rows) => rows.findIndex((candidate) => normalizeNomenclatureType(candidate.name) === normalizeNomenclatureType(item.name)) === index);
  const nomenclatureById = new Map(normalizedState.nomenclature.map((item) => [item.id, item]));
  if (!(normalizedState.nomenclatureTypes || []).some((item) => normalizeNomenclatureType(item.name) === "Производимые изделия")) {
    normalizedState.nomenclatureTypes = [
      ...(normalizedState.nomenclatureTypes || []),
      normalizeDirectoryRow("nomenclatureTypes", {
        id: "nt-manufactured-products",
        name: "Производимые изделия",
        code: "MAKE",
        description: "Номенклатурные позиции, изготавливаемые по собственной спецификации или маршруту",
        status: "Активен",
      }),
    ];
  }
  const ensureNomenclature = (item) => {
    if (!item?.id) return "";
    if (!nomenclatureById.has(item.id)) {
      const normalizedItem = normalizeDirectoryRow("nomenclature", item);
      normalizedState.nomenclature.push(normalizedItem);
      nomenclatureById.set(normalizedItem.id, normalizedItem);
    }
    return item.id;
  };

  normalizedState.specifications = (normalizedState.specifications || []).map((specification) => {
    const resultId = specification.outputNomenclatureId || `nom-result-${specification.id}`;
    ensureNomenclature({
      id: resultId,
      name: specification.outputItem || specification.name || "Результат спецификации",
      article: specification.outputArticle || "",
      type: "Производимые изделия",
      unit: "шт.",
      description: `Результат спецификации ${specification.name || specification.id}`,
      status: specification.lifecycleStatus === "archived" ? "Архив" : "Активен",
      producedBySpecificationId: specification.id,
      updatedAt: specification.updatedAt || "",
    });

    const structureItems = (specification.structureItems || []).map((item) => {
      if (item.type !== "assembly") return item;
      const nomenclatureId = item.nomenclatureId || `nom-legacy-${item.id}`;
      const migratedName = /^новый узел$/i.test(String(item.name || "").trim())
        ? "Новая номенклатурная позиция"
        : item.name || "Производимая позиция";
      ensureNomenclature({
        id: nomenclatureId,
        name: migratedName,
        article: "",
        type: "Производимые изделия",
        unit: item.unit === "узел" ? "шт." : item.unit || "шт.",
        description: "Перенесено из прежней строки типа «узел»",
        status: "Активен",
        updatedAt: specification.updatedAt || "",
      });
      return {
        ...item,
        type: "nomenclature",
        nomenclatureId,
        name: migratedName,
        nomenclatureType: "Производимые изделия",
        unit: item.unit === "узел" ? "шт." : item.unit || "шт.",
        legacyStructureType: "assembly",
      };
    });

    return {
      ...specification,
      outputNomenclatureId: resultId,
      revision: String(specification.revision || "01").trim() || "01",
      lifecycleStatus: ["draft", "agreed", "active", "archived", "superseded"].includes(specification.lifecycleStatus)
        ? specification.lifecycleStatus
        : "draft",
      structureManaged: true,
      structureItems,
    };
  });

  return normalizedState;
}

function normalizeDirectoryRow(sectionId, row) {
  if (sectionId === "bomLists") {
    const { revision, boardsPerPanel, ...rowWithoutRevision } = row || {};
    const importHeaders = Array.isArray(row.importHeaders) ? row.importHeaders : [];
    const importRows = Array.isArray(row.importRows) ? row.importRows : Array.isArray(row.items) ? row.items : [];
    return {
      ...rowWithoutRevision,
      projectId: row.projectId || "",
      importHeaders,
      importRows: importRows.map((item) => normalizeBomImportRow(item)),
      importedAt: row.importedAt || "",
      sourceFileName: row.sourceFileName || "",
      sourceSheetName: row.sourceSheetName || "",
      ...Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, Math.max(0, Math.round(Number(row[field.key] || 0)))])),
    };
  }

  if (sectionId === "nomenclature") {
    return {
      ...row,
      name: String(row.name || "").trim(),
      article: String(row.article || row.code || "").trim(),
      type: normalizeNomenclatureType(row.type),
      package: String(row.package || "").trim(),
      unit: String(row.unit || "шт.").trim(),
      manufacturer: String(row.manufacturer || "").trim(),
      description: String(row.description || "").trim(),
      status: String(row.status || "Активен").trim(),
    };
  }

  if (sectionId === "operationMap" || sectionId === "operations") {
    const { type: _legacyType, operationType: _legacyOperationType, ...rowWithoutType } = row || {};
    const legacyWarehouse = _legacyType === "warehouse" || Boolean(row.isWarehouse);
    const fallbackCenterId = legacyWarehouse ? "D1" : getRouteInstructionWorkCenters({ includeWarehouse: false })[0]?.id || "D5";
    const mappedWorkCenterId = mapLegacyWorkCenterId(row.workCenterId || fallbackCenterId);
    const workCenterId = getRouteInstructionWorkCenterId(mappedWorkCenterId || fallbackCenterId) || String(mappedWorkCenterId || fallbackCenterId);
    const isWarehouse = workCenterId === "D1" || legacyWarehouse;
    const isOutputReceipt = row.isOutputReceipt === true
      || row.isOutputReceipt === "true"
      || row.warehouseFlow === "production_receipt";
    return {
      ...rowWithoutType,
      name: String(row.name || row.operationName || "").trim(),
      code: String(row.code || "").trim(),
      workCenterId,
      routeWorkCenterId: getRouteInstructionWorkCenterId(row.routeWorkCenterId || workCenterId),
      planningWorkCenterIds: Array.isArray(row.planningWorkCenterIds) ? row.planningWorkCenterIds.map((id) => String(id || "").trim()).filter(Boolean) : [],
      unitsPerHour: Math.max(0, Math.round(Number(row.unitsPerHour || row.rate || 0) * 10) / 10),
      requiresBatch: row.requiresBatch === undefined ? !isWarehouse : Boolean(row.requiresBatch),
      isWarehouse,
      isOutputReceipt,
      warehouseFlow: String(row.warehouseFlow || (isOutputReceipt ? "production_receipt" : "")).trim(),
      legacyAliasOf: String(row.legacyAliasOf || "").trim(),
      status: String(row.status || "Активен").trim(),
      updatedAt: row.updatedAt || "",
    };
  }

  if (sectionId === "nomenclatureTypes") {
    const name = normalizeNomenclatureType(row.name || row.value || row.label);
    return {
      ...row,
      name,
      code: String(row.code || "").trim(),
      description: String(row.description || row.meta || "").trim(),
      status: String(row.status || "Активен").trim(),
    };
  }

  if (sectionId === "statuses") {
    const annotation = String(row.annotation || row.usage || "").trim();
    const { audit: _audit, ...statusRow } = row || {};
    const impact = normalizeStatusImpactText(row, row.impact || "");
    const baseRow = {
      ...statusRow,
      group: normalizeStatusApplicationArea(row.group || row.department || "Система / Справочники"),
      registryKind: ["status", "signal", "mode", "flag"].includes(row.registryKind)
        ? row.registryKind
        : getDefaultStatusRegistryKind(row),
      name: String(row.name || "").trim(),
      type: String(row.type || "Статус").trim(),
      code: String(row.code || "").trim(),
      usage: String(row.usage || annotation).trim(),
      annotation,
      impact,
    };
    const lifecycle = getStatusLifecycleModules(baseRow);
    return {
      ...baseRow,
      originModule: String(row.originModule || row.sourceModule || lifecycle.originModule).trim(),
      changeModule: String(row.changeModule || row.updateModule || lifecycle.changeModule).trim(),
    };
  }

  if (sectionId === "specifications") {
    const linkedProject = planningState?.projects?.find((project) => project.id === row.projectId);
    const productionQuantity = normalizeOptionalPositiveInteger(row.productionQuantity || row.totalQuantity || linkedProject?.totalQuantity);
    return {
      ...row,
      projectId: row.projectId || "",
      bomQtyA: Math.max(0, Number(row.bomQtyA || 0)),
      bomQtyB: Math.max(0, Number(row.bomQtyB || 0)),
      productionQuantity,
      dueDate: row.dueDate || linkedProject?.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
      orderNumber: row.orderNumber || linkedProject?.orderNumber || "",
      customer: row.customer || linkedProject?.customer || "",
      outputNomenclatureId: String(row.outputNomenclatureId || ""),
      revision: String(row.revision || "01").trim() || "01",
      lifecycleStatus: ["draft", "agreed", "active", "archived", "superseded"].includes(row.lifecycleStatus)
        ? row.lifecycleStatus
        : "draft",
      structureManaged: Boolean(row.structureManaged || (Array.isArray(row.structureItems) && row.structureItems.length)),
      structureItems: Array.isArray(row.structureItems)
        ? row.structureItems.map((item, index) => normalizeSpecificationStructureItem(item, index))
        : [],
    };
  }

  return row;
}

function shouldKeepDirectoryRow(sectionId, row) {
  if (!row || typeof row !== "object") return false;
  if (sectionId === "statuses") {
    const rowId = String(row.id || "");
    if (rowId.startsWith("supply-")) return false;
  }
  if ((sectionId === "bomLists" || sectionId === "specifications") && row.id) return true;
  return !isBlankDirectoryRow(row);
}

function isBlankDirectoryRow(row) {
  if (!row || typeof row !== "object") return true;
  const meaningfulValues = Object.entries(row)
    .filter(([key]) => key !== "id" && key !== "status")
    .map(([, value]) => String(value ?? "").trim());
  return meaningfulValues.every((value) => !value);
}

function mergeMesWorkCenters(rows = []) {
  const existingById = new Map((Array.isArray(rows) ? rows : [])
    .filter((center) => center?.id && !MES_OBSOLETE_WORK_CENTER_IDS.has(center.id))
    .map((center) => [center.id, center]));
  const matrixWorkCenters = getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides());
  return matrixWorkCenters.map((center) => normalizeWorkCenterUnit({
    ...(existingById.get(center.id) || {}),
    ...center,
    id: center.id,
    name: center.name,
    code: center.code || center.id,
    description: center.description || existingById.get(center.id)?.description || "Источник: Структура и сотрудники",
    parentWorkCenterId: center.parentWorkCenterId || "",
    source: "Структура и сотрудники",
  }));
}

function syncProductionStructureMatrixToPlanningState({ persist = false } = {}) {
  if (!planningState) return false;
  const previousWorkCenters = JSON.stringify(planningState.workCenters || []);
  planningState.workCenters = mergeMesWorkCenters(planningState.workCenters);
  const changed = previousWorkCenters !== JSON.stringify(planningState.workCenters || []);
  if (changed && persist) persistState();
  return changed;
}

function buildLegacyBatchRouteIdMap(state = {}) {
  const routeIds = new Set((state.routes || []).map((route) => route.id).filter(Boolean));
  return new Map((Array.isArray(state.batches) ? state.batches : [])
    .filter((batch) => batch?.id)
    .map((batch) => {
      const routeId = routeIds.has(batch.routeId) ? batch.routeId : "";
      return [batch.id, routeId];
    })
    .filter(([, routeId]) => routeId));
}

function getSlotRouteId(slot = {}, state = planningState, legacyBatchRouteIdById = new Map()) {
  if (!slot) return "";
  const routeByStepId = new Map((state?.routeSteps || []).map((step) => [step.id, step.routeId]));
  return slot.routeId
    || slot.planningOrderId
    || legacyBatchRouteIdById.get(slot.batchId)
    || routeByStepId.get(slot.routeStepId)
    || "";
}

function getSlotPlanningOrderId(slot = {}, fallbackRouteId = "") {
  if (!slot) return fallbackRouteId || "";
  return slot.planningOrderId || slot.routeId || fallbackRouteId || slot.batchId || "";
}

function getSlotProductionContextId(slot = {}) {
  return slot?.specificationId || slot?.projectId || "";
}

function slotMatchesProductionContext(slot = {}, productionId = "") {
  if (!productionId) return true;
  return slot?.specificationId === productionId || slot?.projectId === productionId;
}

function slotMatchesPlanningOrder(slot = {}, planningOrderId = "") {
  if (!planningOrderId) return true;
  return slot?.planningOrderId === planningOrderId
    || slot?.routeId === planningOrderId
    || slot?.batchId === planningOrderId;
}

function normalizeSlotOrderLink(slot = {}, state = {}, legacyBatchRouteIdById = new Map()) {
  const routeId = getSlotRouteId(slot, state, legacyBatchRouteIdById);
  if (!routeId) return slot;
  const { batchId: _legacyBatchId, ...slotWithoutLegacyBatchId } = slot;
  return {
    ...slotWithoutLegacyBatchId,
    routeId,
    planningOrderId: routeId,
  };
}

function getRouteStepSlotDeduplicationScore(slot = {}) {
  const status = getGanttSlotStatusView(slot).value;
  const statusScore = status === "completed"
    ? 50
    : status === "in_progress"
      ? 40
      : ["problem", "overdue", "paused"].includes(status)
        ? 30
        : 0;
  const factScore = slot.actualStart || slot.actualEnd ? 20 : 0;
  const lockScore = slot.locked ? 10 : 0;
  return statusScore + factScore + lockScore;
}

function compareRouteStepSlotKeepPriority(left = {}, right = {}) {
  const scoreDelta = getRouteStepSlotDeduplicationScore(right) - getRouteStepSlotDeduplicationScore(left);
  if (scoreDelta) return scoreDelta;
  return toDate(left.createdAt || left.updatedAt || left.plannedStart) - toDate(right.createdAt || right.updatedAt || right.plannedStart)
    || toDate(left.plannedStart) - toDate(right.plannedStart)
    || String(left.id || "").localeCompare(String(right.id || ""), "ru");
}

function dedupeRouteStepSlots(slots = [], state = {}) {
  const routeByStepId = new Map((state.routeSteps || []).map((step) => [step.id, step.routeId]));
  const selectedByKey = new Map();
  const passthrough = [];

  slots.forEach((slot) => {
    const routeId = getSlotRouteId(slot, state);
    const planningOrderId = getSlotPlanningOrderId(slot, routeId);
    if (!routeId || !planningOrderId || !slot.routeStepId) {
      passthrough.push(slot);
      return;
    }

    const key = `${routeId}::${planningOrderId}::${slot.routeStepId}`;
    const current = selectedByKey.get(key);
    if (!current || compareRouteStepSlotKeepPriority(slot, current) < 0) {
      selectedByKey.set(key, slot);
    }
  });

  return [...passthrough, ...selectedByKey.values()].sort((left, right) => (
    String(getSlotRouteId(left, state)).localeCompare(String(getSlotRouteId(right, state)), "ru")
    || String(getSlotPlanningOrderId(left, getSlotRouteId(left, state))).localeCompare(String(getSlotPlanningOrderId(right, getSlotRouteId(right, state))), "ru")
    || toDate(left.plannedStart) - toDate(right.plannedStart)
    || String(left.id || "").localeCompare(String(right.id || ""), "ru")
  ));
}

function normalizePlanningState(state) {
  const previousRuntimeState = planningState;
  planningState = state;

  try {
    state.projects = [];
    state.routes = Array.isArray(state.routes) ? state.routes : [];
    // Legacy route cards and their local snapshots were retired with the
    // transition to Specifications 2.0.  A valid production route now always
    // carries the immutable source entry identifier created on publication.
    // Applying this at normalization prevents an older browser cache from
    // putting removed legacy cards back into an otherwise current pilot state.
    state.routes = state.routes.filter((route) => String(route?.sourceSpecifications2EntryId || "").trim());
    const activeRouteIds = new Set(state.routes.map((route) => route.id).filter(Boolean));
    state.routes = state.routes.map((route) => {
      const { planningManualDemoByStepId, ...cleanRoute } = route || {};
      return {
        ...cleanRoute,
        planningStatus: getWorkOrderPlanningStatusValue(cleanRoute),
        planningLaborByStepId: normalizePlanningOrderLaborByStepId({
          ...(planningManualDemoByStepId || {}),
          ...(cleanRoute?.planningLaborByStepId || {}),
        }),
      };
    });
    const legacyBatchRouteIdById = buildLegacyBatchRouteIdMap(state);
    state.routeSteps = (Array.isArray(state.routeSteps) ? state.routeSteps : [])
      .filter((step) => activeRouteIds.has(step?.routeId));
    state.slots = (Array.isArray(state.slots) ? state.slots : [])
      .filter((slot) => activeRouteIds.has(slot?.routeId || slot?.planningOrderId));
    delete state.warehouseMovements;
    delete state.warehouseReservations;
	    state.shiftMasterAssignments = normalizeShiftMasterRecordMap(state.shiftMasterAssignments, normalizeShiftMasterAssignment);
	    state.dispatchFacts = {};
    state.planningCorrections = normalizeShiftMasterRecordMap(state.planningCorrections, normalizePlanningCorrection);
    state.workCenters = Array.isArray(state.workCenters) ? state.workCenters : [];
    state.workCenters = mergeMesWorkCenters(state.workCenters);
    state.routeSteps = state.routeSteps.map((step) => normalizeRouteStepCalculationFields(normalizeMesRouteEntity(step), state));
    const removedRouteStepIds = pruneRouteStepsOutsideCurrentRouteTasks(state);
    if (removedRouteStepIds.size) {
      state.slots = state.slots.filter((slot) => !removedRouteStepIds.has(slot.routeStepId));
    }
    const validRouteStepIds = new Set(state.routeSteps.map((step) => step.id).filter(Boolean));
    state.routes = state.routes.map((route) => ({
      ...route,
      planningLaborByStepId: Object.fromEntries(
        Object.entries(normalizePlanningOrderLaborByStepId(route.planningLaborByStepId))
          .filter(([stepId]) => validRouteStepIds.has(stepId)),
      ),
    }));
    state.slots = state.slots.filter((slot) => slot.routeStepId && validRouteStepIds.has(slot.routeStepId));
    const stepById = new Map((state.routeSteps || []).map((step) => [step.id, step]));
    state.slots = state.slots
      .map((slot) => normalizeSlotOrderLink(slot, state, legacyBatchRouteIdById))
      .map((slot) => normalizePlanningSlotResourceLink(slot, state, stepById));
    state.slots = dedupeRouteStepSlots(state.slots, state);
    const validSlotIds = new Set(state.slots.map((slot) => slot.id).filter(Boolean));
    state.shiftMasterAssignments = pruneSlotLinkedRecordMap(state.shiftMasterAssignments, validSlotIds);
    state.planningCorrections = pruneSlotLinkedRecordMap(state.planningCorrections, validSlotIds);
    const routeById = new Map((state.routes || []).map((route) => [route.id, route]));
    state.slots = state.slots.map((slot) => migrateLegacySlotToPlanningOrderLabor(slot, state));
    repairPlanningOrderLaborStoresFromSlots(state, routeById, stepById);
    state.slots = state.slots.map((slot) => {
      if (slot.locked || isGanttSlotCompleted(slot)) return slot;
      const step = stepById.get(slot.routeStepId);
      const routeId = getSlotPlanningOrderId(slot, getSlotRouteId(slot, state));
      const route = routeById.get(routeId) || (step ? routeById.get(step.routeId) : null);
      const laborStore = normalizePlanningOrderLaborByStepId(route?.planningLaborByStepId);
      if (!route || !step || !laborStore[step.id]) return slot;
      return applyPlanningOrderLaborToSlot(slot, route, step, slot.quantity || 1, {
        stamp: slot.planningLaborUpdatedAt || new Date().toISOString(),
        workCenterId: slot.workCenterId || "",
      });
    });
    delete state.batches;

    removeCanceledRouteGanttSlots(state);
    state.slots = state.slots.map((slot) => recalculateSlotEndByQuantity(slot, state));
    return state;
  } finally {
    planningState = previousRuntimeState;
  }
}

function isCompletePlanningLaborSetting(setting = {}) {
  if (!setting?.mode) return false;
  if (setting.mode === "fixed") return Number(setting.fixedMinutes || 0) > 0;
  if (setting.mode === "unit") return Number(setting.minutesPerUnit || 0) > 0;
  if (setting.mode === "panel") return Number(setting.minutesPerPanel || 0) > 0;
  if (setting.mode === "shift") return Number(setting.shiftQuantity || 0) > 0;
  return false;
}

function buildPlanningLaborSettingFromSlot(slot = {}) {
  const mode = String(slot.planningLaborMode || "").trim();
  const quantity = normalizeQuantity(slot.quantity || 0, 0);
  const durationMinutes = normalizeDispatchLaborMinutes(Number(slot.planningLaborDurationMs || 0) / 60000);
  const boardsPerPanel = normalizeBoardsPerPanel(slot.planningLaborBoardsPerPanel || slot.boardsPerPanel || 1, 1);
  const panelQuantity = quantity > 0 ? Math.max(1, Math.ceil(quantity / boardsPerPanel)) : 0;
  const effectiveMode = mode;
  const candidate = { mode: effectiveMode };

  if (effectiveMode === "fixed") {
    candidate.fixedMinutes = normalizeDispatchLaborMinutes(slot.planningLaborFixedMinutes || durationMinutes);
  } else if (effectiveMode === "unit") {
    candidate.minutesPerUnit = normalizePlanningLaborPositiveNumber(slot.planningLaborMinutesPerUnit)
      || (quantity > 0 && durationMinutes > 0 ? durationMinutes / quantity : 0);
  } else if (effectiveMode === "panel") {
    candidate.minutesPerPanel = normalizePlanningLaborPositiveNumber(slot.planningLaborMinutesPerPanel)
      || (panelQuantity > 0 && durationMinutes > 0 ? durationMinutes / panelQuantity : 0);
  } else if (effectiveMode === "shift") {
    candidate.shiftQuantity = normalizePlanningLaborPositiveNumber(slot.planningLaborShiftQuantity || slot.planningLaborShiftCapacity || quantity);
  } else {
    return null;
  }

  const normalized = normalizePlanningOrderLaborByStepId({ [slot.routeStepId]: candidate })[slot.routeStepId] || null;
  return isCompletePlanningLaborSetting(normalized) ? normalized : null;
}

function getLegacySlotPlanningLaborDurationMs(slot = {}, state = {}) {
  const storedDurationMs = Number(slot.planningLaborDurationMs || 0);
  if (Number.isFinite(storedDurationMs) && storedDurationMs > 0) return storedDurationMs;
  const workingDurationMs = getWorkingDurationBetween(slot.workCenterId || "", slot.plannedStart || "", slot.plannedEnd || "", state);
  if (Number.isFinite(workingDurationMs) && workingDurationMs > 0) return workingDurationMs;
  const start = Date.parse(slot.plannedStart || "");
  const end = Date.parse(slot.plannedEnd || "");
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
}

function migrateLegacySlotToPlanningOrderLabor(slot = {}, state = {}) {
  if (!slot?.routeStepId || slot.planningLaborSource === "work_order" || slot.locked || isGanttSlotCompleted(slot)) return slot;
  const quantity = normalizeQuantity(slot.quantity || 0, 0);
  const durationMs = getLegacySlotPlanningLaborDurationMs(slot, state);
  if (quantity <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) return slot;
  const minutesPerUnit = Math.max(0.001, Math.round((durationMs / 60000 / quantity) * 1000) / 1000);
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
  const boardsPerPanel = normalizeBoardsPerPanel(slot.boardsPerPanel || slot.planningLaborBoardsPerPanel, 1);
  const shiftMs = Math.max(60 * 60 * 1000, getPlanningLaborShiftMs(slot.workCenterId || ""));

  return {
    ...slot,
    planningLaborSource: "work_order",
    planningLaborMode: "unit",
    planningLaborSourceLabel: "миграция слота",
    planningLaborDurationMs: durationMinutes * 60 * 1000,
    planningLaborDurationLabel: formatDuration(durationMinutes * 60 * 1000),
    planningLaborMinutesPerUnit: minutesPerUnit,
    planningLaborMinutesPerPanel: 0,
    planningLaborFixedMinutes: 0,
    planningLaborShiftQuantity: 0,
    planningLaborBoardsPerPanel: boardsPerPanel,
    planningLaborShiftCapacity: Math.max(1, Math.floor(shiftMs / Math.max(60 * 1000, minutesPerUnit * 60 * 1000))),
    planningLaborShiftCount: Math.max(1, Math.ceil((durationMinutes * 60 * 1000) / shiftMs)),
    planningLaborShiftMs: shiftMs,
    planningLaborUpdatedAt: slot.updatedAt || new Date().toISOString(),
    planningLaborRevision: Number(slot.planningLaborRevision || 0) || 1,
  };
}

function repairPlanningOrderLaborStoresFromSlots(state = {}, routeById = new Map(), stepById = new Map()) {
  const storesByRouteId = new Map((state.routes || []).map((route) => [
    route.id,
    normalizePlanningOrderLaborByStepId(route.planningLaborByStepId),
  ]));

  (state.slots || []).forEach((slot) => {
    if (slot?.planningLaborSource !== "work_order" || !slot.routeStepId) return;
    const step = stepById.get(slot.routeStepId) || null;
    const routeId = getSlotPlanningOrderId(slot, getSlotRouteId(slot, state)) || step?.routeId || "";
    const route = routeById.get(routeId);
    if (!route) return;
    const setting = buildPlanningLaborSettingFromSlot(slot);
    if (!setting) return;
    const store = storesByRouteId.get(route.id) || {};
    if (!isCompletePlanningLaborSetting(store[slot.routeStepId])) {
      store[slot.routeStepId] = setting;
      storesByRouteId.set(route.id, store);
    }
  });

  state.routes = (state.routes || []).map((route) => ({
    ...route,
    planningLaborByStepId: Object.fromEntries(
      Object.entries(storesByRouteId.get(route.id) || {})
        .filter(([, setting]) => isCompletePlanningLaborSetting(setting)),
    ),
  }));
}

function normalizePlanningSlotResourceLink(slot = {}, state = {}, stepById = new Map()) {
  const step = stepById.get(slot.routeStepId) || null;
  const workCenterId = mapLegacyWorkCenterId(slot.workCenterId || step?.planningWorkCenterId || step?.workCenterId || "");
  const preferredResourceId = mapLegacyResourceId(slot.resourceId || step?.resourceId || "");
  const resourceId = step
    ? getPlanningResourceForRouteStep(step, workCenterId, preferredResourceId)
    : preferredResourceId;
  return {
    ...slot,
    workCenterId: workCenterId || slot.workCenterId || "",
    resourceId: resourceId && getProductionResource(resourceId) ? resourceId : "",
  };
}

function normalizeShiftMasterRecordMap(source, normalizeFn) {
  const result = {};
  const entries = Array.isArray(source)
    ? source.map((value) => [value?.slotId || value?.id || "", value])
    : Object.entries(source && typeof source === "object" ? source : {});
  entries.forEach(([key, value]) => {
    const normalized = normalizeFn({ ...(value || {}), slotId: value?.slotId || key });
    if (normalized?.slotId) result[normalized.slotId] = normalized;
  });
  return result;
}

function pruneSlotLinkedRecordMap(source = {}, validSlotIds = new Set()) {
  if (!validSlotIds.size) return {};
  return Object.fromEntries(Object.entries(source && typeof source === "object" ? source : {})
    .filter(([, value]) => {
      const slotId = String(value?.slotId || "");
      const baseSlotId = slotId.split("::")[0] || slotId;
      return slotId && (validSlotIds.has(slotId) || validSlotIds.has(baseSlotId));
    }));
}

function normalizeShiftMasterExecutorQuantity(value) {
  const quantity = Math.round(Number(value));
  if (Number.isFinite(quantity) && quantity > 0) return quantity;
  return 0;
}

function normalizeShiftMasterFactQuantity(value) {
  const quantity = Math.round(Number(String(value ?? "").replace(",", ".")));
  if (Number.isFinite(quantity) && quantity >= 0) return quantity;
  return 0;
}

function normalizeShiftMasterExecutors(source = [], fallback = {}) {
  const rows = Array.isArray(source) ? source : [];
  const normalized = rows
    .map((row, index) => ({
      id: String(row?.id || `executor-${index + 1}`).trim() || `executor-${index + 1}`,
      employeeId: String(row?.employeeId || "").trim(),
      quantity: normalizeShiftMasterExecutorQuantity(row?.quantity),
      note: String(row?.note || "").trim(),
    }))
    .filter((row) => row.employeeId || row.quantity > 0 || row.note);

  if (!normalized.length && fallback.employeeId) {
    normalized.push({
      id: "executor-1",
      employeeId: String(fallback.employeeId || "").trim(),
      quantity: normalizeShiftMasterExecutorQuantity(fallback.quantity),
      note: String(fallback.note || "").trim(),
    });
  }

  const merged = [];
  const byEmployee = new Map();
  normalized.forEach((row) => {
    if (!row.employeeId) {
      merged.push(row);
      return;
    }
    const existing = byEmployee.get(row.employeeId);
    if (existing) {
      existing.quantity = normalizeShiftMasterExecutorQuantity(existing.quantity) + normalizeShiftMasterExecutorQuantity(row.quantity);
      if (row.note && !String(existing.note || "").split("; ").includes(row.note)) {
        existing.note = [existing.note, row.note].filter(Boolean).join("; ");
      }
      return;
    }
    const next = { ...row };
    byEmployee.set(row.employeeId, next);
    merged.push(next);
  });

  return merged.map((row, index) => ({
    ...row,
    id: row.id || `executor-${index + 1}`,
  }));
}

function normalizeShiftMasterAssignment(row = {}) {
  const slotId = String(row.slotId || row.id || "").trim();
  if (!slotId) return null;
  const masterId = getShiftMasterProfiles().some((profile) => profile.id === row.masterId)
    ? row.masterId
    : "";
  const resourceId = String(row.resourceId || "").trim();
  const normalizedResourceId = resourceId && getProductionResource(resourceId) ? resourceId : "";
  const matrixEmployeeIds = new Set(getShiftMasterEmployeeRows().map((employee) => employee.id));
  const executors = normalizeShiftMasterExecutors(row.executors, {
    employeeId: row.employeeId,
    quantity: row.plannedQuantity,
  }).filter((executor) => !executor.employeeId || matrixEmployeeIds.has(executor.employeeId));
  const employeeId = String(row.employeeId || executors[0]?.employeeId || "").trim();
  const normalizedEmployeeId = matrixEmployeeIds.has(employeeId) ? employeeId : executors[0]?.employeeId || "";
  return {
    slotId,
    hasAssignedQuantity: Object.prototype.hasOwnProperty.call(row, "assignedQuantity"),
    masterId,
    workCenterId: String(row.workCenterId || ""),
    resourceId: normalizedResourceId,
    employeeId: normalizedEmployeeId,
    executors,
    riskReason: normalizeShiftMasterBoardRiskReason(row.riskReason || ""),
    status: row.status === "issued" ? "issued" : "draft",
    issuedAt: String(row.issuedAt || ""),
    note: String(row.note || ""),
    plannedQuantity: normalizeQuantity(row.plannedQuantity || 0),
    assignedQuantity: normalizeShiftMasterFactQuantity(row.assignedQuantity),
    actualQuantity: normalizeShiftMasterFactQuantity(row.actualQuantity),
    defectQuantity: normalizeShiftMasterFactQuantity(row.defectQuantity),
    laborMinutes: normalizeDispatchLaborMinutes(row.laborMinutes),
    executorCount: normalizeDispatchExecutorCount(row.executorCount),
    factComment: String(row.factComment || row.actualComment || "").trim(),
    factUpdatedAt: String(row.factUpdatedAt || ""),
    updatedAt: String(row.updatedAt || ""),
  };
}

function normalizeDispatchFact(row = {}) {
  const slotId = String(row.slotId || row.id || "").trim();
  if (!slotId) return null;
  const status = DISPATCH_FACT_STATUS_OPTIONS.some((option) => option.value === row.status)
    ? row.status
    : "not_reported";
  return {
    slotId,
    actualQuantity: normalizeShiftMasterFactQuantity(row.actualQuantity),
    defectQuantity: normalizeShiftMasterFactQuantity(row.defectQuantity),
    laborMinutes: normalizeDispatchLaborMinutes(row.laborMinutes),
    executorCount: normalizeDispatchExecutorCount(row.executorCount),
    status,
    comment: String(row.comment || ""),
    laborSource: normalizeDispatchLaborSource(row.laborSource),
    updatedAt: String(row.updatedAt || ""),
  };
}

function normalizeDispatchLaborMinutes(value) {
  if (value === "" || value === null || typeof value === "undefined") return 0;
  const number = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeDispatchExecutorCount(value) {
  if (value === "" || value === null || typeof value === "undefined") return 0;
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(999, number) : 0;
}

function normalizeDispatchLaborSource(value = "") {
  const normalized = String(value || "").trim();
  return ["shift_sheet", "master_note", "time_tracking", "manual"].includes(normalized)
    ? normalized
    : "shift_sheet";
}

function normalizePlanningCorrection(row = {}) {
  const slotId = String(row.slotId || row.id || "").trim();
  if (!slotId) return null;
  const plannedQuantity = normalizeQuantity(row.plannedQuantity || 0);
  const actualQuantity = normalizeShiftMasterFactQuantity(row.actualQuantity);
  const defectQuantity = normalizeShiftMasterFactQuantity(row.defectQuantity);
  const deltaQuantity = actualQuantity - plannedQuantity;
  return {
    slotId,
    source: String(row.source || "dispatch").trim(),
    state: row.state === "resolved" ? "resolved" : "open",
    routeId: String(row.routeId || ""),
    planningOrderId: String(row.planningOrderId || row.batchId || row.routeId || ""),
    routeStepId: String(row.routeStepId || ""),
    workCenterId: String(row.workCenterId || ""),
    plannedQuantity,
    actualQuantity,
    defectQuantity,
    deltaQuantity,
    status: String(row.status || "not_reported"),
    reason: String(row.reason || "").trim(),
    updatedAt: String(row.updatedAt || ""),
  };
}

function normalizeWarehouseQuantity(value) {
  const quantity = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.round(quantity * 1000) / 1000;
}

function removeCanceledRouteGanttSlots(state) {
  const canceledRouteIds = new Set((state.routes || [])
    .filter((route) => isWorkOrderPlanningCanceled(route))
    .map((route) => route.id));
  if (!canceledRouteIds.size) return;

  const canceledStepIds = new Set((state.routeSteps || [])
    .filter((step) => canceledRouteIds.has(step.routeId))
    .map((step) => step.id));

  state.slots = (state.slots || []).filter((slot) => !(
    canceledRouteIds.has(getSlotRouteId(slot, state))
    || canceledStepIds.has(slot.routeStepId)
  ));
}

function getWorkCenterUnitsPerHour(workCenterId, state = null) {
  let sourceState = state;
  if (!sourceState) {
    try {
      sourceState = planningState;
    } catch {
      sourceState = null;
    }
  }
  const center = sourceState?.workCenters?.find((item) => item.id === workCenterId);
  if (center?.isPlanningUnit === false) return 0;
  const centerRate = Number(center?.unitsPerHour || 0);
  if (Number.isFinite(centerRate) && centerRate > 0) return centerRate;
  return 0;
}

function normalizeQuantity(value, fallback = 1) {
  const quantity = Math.round(Number(value));
  if (Number.isFinite(quantity) && quantity > 0) return quantity;
  return Math.max(1, Math.round(Number(fallback) || 1));
}

function normalizeBoardsPerPanel(value, fallback = 1) {
  const boardsPerPanel = Math.round(Number(value));
  if (Number.isFinite(boardsPerPanel) && boardsPerPanel > 0) return boardsPerPanel;
  return Math.max(1, Math.round(Number(fallback) || 1));
}

function workCenterUsesPanelBatching(workCenterId) {
  return ["D3", "D3_L1", "D3_L2", "D3_AOI", "D3_UW", "D3_CC"].includes(mapLegacyWorkCenterId(workCenterId));
}

function getSpecificationItemBoardsPerPanel(item) {
  return item?.type === "bom" ? normalizeBoardsPerPanel(item.boardsPerPanel, 1) : 1;
}

function getRouteStepBoardsPerPanel(step) {
  return normalizeBoardsPerPanel(step?.boardsPerPanel, 1);
}

function toSlotDateTime(value) {
  return `${isoLocal(value)}:00`;
}

function getRuntimePlanningState(fallback = null) {
  try {
    return planningState || fallback;
  } catch {
    return fallback;
  }
}

function getRuntimeDirectoryState(fallback = null) {
  try {
    return directoryState || fallback;
  } catch {
    return fallback;
  }
}

function getDurationWorkCenter(workCenterId, state = null) {
  const sourceState = state || getRuntimePlanningState();
  return sourceState?.workCenters?.find((center) => center.id === workCenterId) || null;
}

function getDurationResourcesForWorkCenter(workCenterId, state = null) {
  const center = getDurationWorkCenter(workCenterId, state);
  const matched = getProductionResourcesForWorkCenter(workCenterId)
    .filter((resource) => resourceParticipatesInCalculation(resource) || resourceParticipatesInPlanning(resource));
  if (matched.length) return matched;
  if (isSmtOperationWorkCenter(workCenterId, { workCenter: center }, state)) return getDefaultSmtLineConfigurations();
  if (!center) return [];
  return [makeFallbackProductionResource(center.id)];
}

function isSmtOperationWorkCenter(workCenterId, operationContext = null, state = null) {
  const id = mapLegacyWorkCenterId(workCenterId || operationContext?.workCenterId || "");
  if (MES_SMT_WORK_CENTER_IDS.includes(id) || isSmtLineWorkCenterId(id)) return true;
  const center = operationContext?.workCenter || getDurationWorkCenter(id, state);
  const text = normalizeLookupText([center?.id, center?.name, center?.code, operationContext?.operationName].filter(Boolean).join(" "));
  if (text.includes("smt") || text.includes("смт") || text.includes("поверхност")) return true;
  const resourceId = String(operationContext?.resourceId || "");
  if (resourceId && getSmtLineConfigurations().some((line) => line.id === resourceId)) return true;
  return false;
}

function getDefaultOperationCalculationType(workCenterId, operationContext = null) {
  const explicit = String(operationContext?.calculationType || "").trim();
  if (explicit === "components") return "manual";
  if (["manual", "normative", "rate"].includes(explicit)) return explicit;
  if (isSmtOperationWorkCenter(workCenterId, operationContext)) return "manual";
  if (mapLegacyWorkCenterId(workCenterId) === "D1") return "rate";
  return "manual";
}

function normalizeRouteStepCalculationFields(step = {}, state = null) {
  const { operationType: _legacyOperationType, ...stepWithoutOperationType } = step || {};
  const hasWorkCenterField = Object.prototype.hasOwnProperty.call(stepWithoutOperationType, "workCenterId");
  const rawWorkCenterId = String(stepWithoutOperationType.workCenterId || "").trim();
  const workCenterId = hasWorkCenterField && !rawWorkCenterId
    ? ""
    : mapLegacyWorkCenterId(rawWorkCenterId || "D5");
  const calculationType = getDefaultOperationCalculationType(workCenterId, stepWithoutOperationType);
  const boardsPerPanel = normalizeBoardsPerPanel(stepWithoutOperationType.boardsPerPanel, 1);
  const operation = stepWithoutOperationType.operationId ? getOperationMapItem(stepWithoutOperationType.operationId) : null;
  const planningCandidates = getPlanningCandidateWorkCenterIdsForRouteWorkCenter(workCenterId, operation, state);
  const singlePlanningWorkCenterId = planningCandidates.length === 1 ? planningCandidates[0] : "";
  const explicitPlanningWorkCenterId = mapLegacyWorkCenterId(stepWithoutOperationType.planningWorkCenterId || "");
  const selectedPlanningWorkCenterId = explicitPlanningWorkCenterId && planningCandidates.includes(explicitPlanningWorkCenterId)
    ? explicitPlanningWorkCenterId
    : singlePlanningWorkCenterId;
  const resources = selectedPlanningWorkCenterId ? getDurationResourcesForWorkCenter(selectedPlanningWorkCenterId, state) : getDurationResourcesForWorkCenter(workCenterId, state);
  const resource = selectedPlanningWorkCenterId
    ? resources.find((item) => item.id === stepWithoutOperationType.resourceId) || resources[0] || null
    : null;
  const secondsPerPanel = Number(stepWithoutOperationType.secondsPerPanel || 0) > 0
    ? Math.max(1, Number(stepWithoutOperationType.secondsPerPanel))
    : !workCenterId || calculationType === "components" || calculationType === "rate"
      ? 0
      : getDefaultSecondsPerPanel(workCenterId, boardsPerPanel);

	  return {
	    ...stepWithoutOperationType,
	    workCenterId,
	    planningWorkCenterId: selectedPlanningWorkCenterId && planningCandidates.length > 1 ? selectedPlanningWorkCenterId : "",
	    calculationType,
	    boardsPerPanel,
	    resourceId: selectedPlanningWorkCenterId ? stepWithoutOperationType.resourceId || resource?.id || "" : "",
	    secondsPerPanel,
	    unitsPerHour: Number(stepWithoutOperationType.unitsPerHour || (workCenterId ? getWorkCenterUnitsPerHour(workCenterId, state) : 0) || 0),
	    setupMin: Math.max(0, Number(stepWithoutOperationType.setupMin ?? resource?.changeoverMin ?? 0)),
	    operationInputs: normalizeRouteStepFlowItems(stepWithoutOperationType.operationInputs, "input"),
	    operationOutputs: normalizeRouteStepFlowItems(stepWithoutOperationType.operationOutputs, "output"),
	  };
	}

function getDurationOperationContext(operationContext, workCenterId, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null) {
  const sourceState = state || getRuntimePlanningState();
  const routeStep = operationContext?.routeStepId
    ? sourceState?.routeSteps?.find((step) => step.id === operationContext.routeStepId)
    : null;
  const route = routeStep
    ? (sourceState?.routes || []).find((item) => item.id === routeStep.routeId) || null
    : null;
  const effectiveContext = routeStep
    ? getRouteStepEffectiveOperationContext(route, routeStep, workCenterId || operationContext?.workCenterId || "", operationContext?.resourceId || "")
    : null;
  const context = {
    ...(effectiveContext || routeStep || {}),
    ...(operationContext || {}),
  };
  const resolvedWorkCenterId = workCenterId || context.workCenterId || routeStep?.workCenterId || "";
  const boardsPerPanel = normalizeBoardsPerPanel(effectiveContext?.boardsPerPanel || boardsPerPanelOverride || context.boardsPerPanel, 1);
  return {
    ...context,
    bomListId: effectiveContext?.bomListId || context.bomListId || "",
    workCenterId: resolvedWorkCenterId,
    unitsPerHour: unitsPerHourOverride || context.unitsPerHour || "",
    boardsPerPanel,
    calculationType: getDefaultOperationCalculationType(resolvedWorkCenterId, context),
  };
}

function getOperationSetupMs(operationContext = null, resource = null) {
  const setupMin = Number(operationContext?.setupMin ?? resource?.changeoverMin ?? 0);
  return Math.max(0, Number.isFinite(setupMin) ? setupMin * 60 * 1000 : 0);
}

function getDurationBomList(operationContext = null) {
  const bomId = operationContext?.bomListId || "";
  const directory = getRuntimeDirectoryState();
  if (!bomId || !directory?.bomLists) return null;
  return directory.bomLists.find((bom) => bom.id === bomId) || null;
}

function getDurationComponentTypes() {
  const directory = getRuntimeDirectoryState();
  const source = directory?.componentTypes?.length ? directory.componentTypes : DEFAULT_COMPONENT_TYPES;
  return source.filter((type) => type.status !== "Отключен");
}

function getDurationComponentCounts(bom) {
  if (!bom) return Object.fromEntries(getDurationComponentTypes().map((type) => [type.id, 0]));
  const importRows = Array.isArray(bom.importRows) ? bom.importRows.map((row) => normalizeBomImportRow(row)) : [];
  if (importRows.length) {
    const totals = summarizeBomComponentFields(importRows);
    return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
      field.componentId,
      Math.max(0, Math.round(Number(totals[field.key] || 0))),
    ]));
  }
  return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
    field.componentId,
    Math.max(0, Math.round(Number(bom[field.key] || 0))),
  ]));
}

function parseCapacityCount(value) {
  const match = String(value || "").match(/([\d.,]+)/);
  if (!match) return 0;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getWorkCenterManualCapacity(workCenterId, state = null) {
  const center = getDurationWorkCenter(workCenterId, state);
  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  const resourceCapacity = resources
    .filter((resource) => resourceParticipatesInCalculation(resource))
    .reduce((sum, resource) => sum + parseCapacityCount(resource.capacity), 0);
  if (resourceCapacity > 0) return Math.max(1, Math.round(resourceCapacity));

  return Math.max(1, Math.round(Number(center?.capacity || 1)));
}

function calculateManualLaborDurationMs(operationContext, quantity, state = null) {
  const workCenterId = operationContext?.workCenterId || "";
  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  const resource = resources.find((item) => item.id === operationContext?.resourceId) || resources[0] || null;
  const setupMs = getOperationSetupMs(operationContext, resource);
  const secondsPerUnit = Math.max(1, Number(operationContext?.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, 1)));
  const manualCapacity = getWorkCenterManualCapacity(workCenterId, state);
  return setupMs + (normalizeQuantity(quantity) * secondsPerUnit * 1000) / Math.max(1, manualCapacity);
}

function calculateNormativeSerialDurationMs(operationContext, quantity, state = null) {
  const workCenterId = operationContext?.workCenterId || "";
  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  const resource = resources.find((item) => item.id === operationContext?.resourceId) || resources[0] || null;
  const setupMs = getOperationSetupMs(operationContext, resource);
  const boardsPerPanel = normalizeBoardsPerPanel(operationContext?.boardsPerPanel, 1);
  const batchQuantity = workCenterUsesPanelBatching(workCenterId)
    ? Math.max(1, Math.ceil(normalizeQuantity(quantity) / boardsPerPanel))
    : normalizeQuantity(quantity);
  const secondsPerBatch = Math.max(1, Number(operationContext?.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, boardsPerPanel)));
  return setupMs + batchQuantity * secondsPerBatch * 1000;
}

function calculateRateDurationMs(workCenterId, quantity, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null) {
  const explicitRate = Number(unitsPerHourOverride || getWorkCenterUnitsPerHour(workCenterId, state));
  // Last-resort legacy fallback: active planning should use work-order labor fields.
  const rate = Number.isFinite(explicitRate) && explicitRate > 0 ? explicitRate : 40;
  const normalizedQuantity = normalizeQuantity(quantity);
  const boardsPerPanel = normalizeBoardsPerPanel(boardsPerPanelOverride, 1);
  if (boardsPerPanel > 1 && workCenterUsesPanelBatching(workCenterId)) {
    const panelCount = Math.max(1, Math.ceil(normalizedQuantity / boardsPerPanel));
    const panelRate = Math.max(1 / 60, rate / boardsPerPanel);
    return Math.max(MIN_OPERATION_DURATION_MS, panelCount / panelRate * 60 * 60 * 1000);
  }
  return Math.max(MIN_OPERATION_DURATION_MS, normalizedQuantity / rate * 60 * 60 * 1000);
}

function normalizePlanningLaborPositiveNumber(value) {
  const number = typeof value === "number"
    ? value
    : Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function calculatePlanningOrderLaborDurationMs(operationContext = null, quantity = 1) {
  if (operationContext?.planningLaborSource !== "work_order") return null;
  const mode = String(operationContext.planningLaborMode || "");
  if (!["fixed", "unit", "panel", "shift"].includes(mode)) return null;
  const normalizedQuantity = normalizeQuantity(quantity || operationContext.quantity || 1);
  const shiftMs = Math.max(
    60 * 60 * 1000,
    Number(operationContext.planningLaborShiftMs || 0) || getPlanningLaborShiftMs(operationContext.workCenterId || ""),
  );
  let durationMs = 0;

  if (mode === "fixed") {
    const fixedMinutes = normalizePlanningLaborPositiveNumber(operationContext.planningLaborFixedMinutes);
    durationMs = fixedMinutes * 60 * 1000;
  } else if (mode === "unit") {
    const minutesPerUnit = normalizePlanningLaborPositiveNumber(operationContext.planningLaborMinutesPerUnit);
    durationMs = minutesPerUnit * normalizedQuantity * 60 * 1000;
  } else if (mode === "panel") {
    const minutesPerPanel = normalizePlanningLaborPositiveNumber(operationContext.planningLaborMinutesPerPanel);
    const boardsPerPanel = normalizeBoardsPerPanel(
      operationContext.planningLaborBoardsPerPanel || operationContext.boardsPerPanel,
      1,
    );
    const panelCount = Math.max(1, Math.ceil(normalizedQuantity / boardsPerPanel));
    durationMs = minutesPerPanel * panelCount * 60 * 1000;
  } else if (mode === "shift") {
    const shiftQuantity = normalizePlanningLaborPositiveNumber(operationContext.planningLaborShiftQuantity);
    const shiftCount = Math.max(1, Math.ceil(normalizedQuantity / Math.max(1, shiftQuantity)));
    durationMs = shiftCount * shiftMs;
  }

  return Number.isFinite(durationMs) && durationMs > 0
    ? Math.max(MIN_OPERATION_DURATION_MS, Math.ceil(durationMs / 60000) * 60000)
    : null;
}

function calculateRequiredDurationMs(workCenterId, quantity, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null, operationContext = null) {
  const context = getDurationOperationContext(operationContext, workCenterId, state, unitsPerHourOverride, boardsPerPanelOverride);
  let durationMs = calculatePlanningOrderLaborDurationMs(context, quantity);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    durationMs = null;
  }

  if (durationMs === null && (context.calculationType === "components" || context.calculationType === "manual")) {
    durationMs = calculateManualLaborDurationMs(context, quantity, state);
  } else if (durationMs === null && context.calculationType === "normative") {
    durationMs = calculateNormativeSerialDurationMs(context, quantity, state);
  }

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    durationMs = calculateRateDurationMs(workCenterId, quantity, state, unitsPerHourOverride, boardsPerPanelOverride);
  }

  return Math.max(MIN_OPERATION_DURATION_MS, durationMs);
}

function calculatePlannedEndByQuantity(plannedStart, workCenterId, quantity, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null, operationContext = null) {
  const durationMs = calculateRequiredDurationMs(workCenterId, quantity, state, unitsPerHourOverride, boardsPerPanelOverride, operationContext);
  const workingStart = snapToWorkingTime(workCenterId, plannedStart, state);
  return addWorkingDuration(workCenterId, workingStart, durationMs, state);
}

function calculateQuantityByDuration(workCenterId, plannedStart, plannedEnd, operationContext = null) {
  const workingDurationMs = getWorkingDurationBetween(workCenterId, plannedStart, plannedEnd, planningState);
  const durationHours = workingDurationMs / (60 * 60 * 1000);
  const context = getDurationOperationContext(operationContext, workCenterId, planningState, operationContext?.unitsPerHour || null, operationContext?.boardsPerPanel || null);
  const durationMs = workingDurationMs;

  if (context.calculationType === "components" || context.calculationType === "manual" || isSmtOperationWorkCenter(workCenterId, context, planningState)) {
    const secondsPerUnit = Math.max(1, Number(context.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, 1)));
    const manualCapacity = getWorkCenterManualCapacity(workCenterId, planningState);
    const setupMs = getOperationSetupMs(context);
    return normalizeQuantity((Math.max(0, durationMs - setupMs) / 1000 / secondsPerUnit) * manualCapacity);
  }

  return normalizeQuantity(durationHours * getWorkCenterUnitsPerHour(workCenterId));
}

function getSlotEffectiveOperationContext(slot = {}, state = null) {
  const sourceState = state || planningState;
  const step = slot?.routeStepId
    ? (sourceState?.routeSteps || []).find((item) => item.id === slot.routeStepId)
    : null;
  if (!step) {
    return {
      ...(slot || {}),
      bomListId: slot?.bomListId || "",
      boardsPerPanel: normalizeBoardsPerPanel(slot?.boardsPerPanel, 1),
    };
  }
  const planningOrderId = getSlotPlanningOrderId(slot, getSlotRouteId(slot, sourceState));
  const route = (sourceState?.routes || []).find((item) => item.id === planningOrderId)
    || (sourceState?.routes || []).find((item) => item.id === step.routeId)
    || null;
  const baseContext = getRouteStepEffectiveOperationContext(
    route,
    step,
    slot.workCenterId || step.workCenterId || "",
    slot.resourceId || step.resourceId || "",
  );
  return {
    ...baseContext,
    ...(slot || {}),
    routeWorkCenterId: slot.routeWorkCenterId || baseContext.routeWorkCenterId || step.workCenterId || "",
    workCenterId: slot.workCenterId || baseContext.workCenterId || step.workCenterId || "",
    resourceId: slot.resourceId || baseContext.resourceId || "",
    bomListId: baseContext.bomListId || slot.bomListId || "",
    boardsPerPanel: normalizeBoardsPerPanel(baseContext.boardsPerPanel || slot.boardsPerPanel, 1),
  };
}

function getSlotRequiredDurationMs(slot = {}, state = null) {
  const sourceState = state || planningState;
  const context = getSlotEffectiveOperationContext(slot, sourceState);
  return calculateRequiredDurationMs(
    context.workCenterId || slot.workCenterId,
    slot.quantity,
    sourceState,
    slot.unitsPerHour || context.unitsPerHour || null,
    context.boardsPerPanel || null,
    context,
  );
}

function recalculateSlotEndByQuantity(slot, state = null) {
  const quantity = normalizeQuantity(slot.quantity);
  const plannedStart = toSlotDateTime(snapToWorkingTime(slot.workCenterId, slot.plannedStart, state));
  const sourceState = state || planningState;
  const effectiveContext = getSlotEffectiveOperationContext({
    ...slot,
    quantity,
    plannedStart,
  }, sourceState);
  const boardsPerPanel = normalizeBoardsPerPanel(effectiveContext.boardsPerPanel, 1);
  return {
    ...slot,
    quantity,
    bomListId: effectiveContext.bomListId || "",
    boardsPerPanel,
    resourceId: effectiveContext.resourceId || slot.resourceId || "",
    plannedStart,
    plannedEnd: toSlotDateTime(calculatePlannedEndByQuantity(plannedStart, slot.workCenterId, quantity, state, slot.unitsPerHour, boardsPerPanel, effectiveContext)),
  };
}

function applyRecalculatedSlotTiming(slot, state = null) {
  if (!slot) return slot;
  Object.assign(slot, recalculateSlotEndByQuantity(slot, state || planningState));
  return slot;
}

function rescheduleSlotsForWorkCenterCalendarChange(workCenterId) {
  const calendarWorkCenterId = getCalendarWorkCenterId(workCenterId);
  const affectedSlots = planningState.slots
    .filter((slot) => (
      getCalendarWorkCenterId(slot.workCenterId) === calendarWorkCenterId
      && !isGanttSlotCompleted(slot)
      && !slot.locked
    ))
    .sort((left, right) => (
      toDate(left.plannedStart) - toDate(right.plannedStart)
      || getSlotStepOrder(left) - getSlotStepOrder(right)
      || String(left.id || "").localeCompare(String(right.id || ""), "ru")
    ));

  if (!affectedSlots.length) return 0;

  const stamp = new Date().toISOString();
  const affectedIds = new Set(affectedSlots.map((slot) => slot.id));
  const preservedSlots = planningState.slots.filter((slot) => !affectedIds.has(slot.id));
  const rescheduledSlots = [];

  affectedSlots.forEach((slot) => {
    planningState.slots = [...preservedSlots, ...rescheduledSlots];
    const quantity = normalizeQuantity(slot.quantity);
    const effectiveContext = getSlotEffectiveOperationContext({ ...slot, quantity }, planningState);
    const durationMs = getSlotRequiredDurationMs({ ...slot, quantity }, planningState);
    const earliestStart = snapToWorkingTime(slot.workCenterId, slot.plannedStart, planningState);
    const resourceId = slot.resourceId || getSlotGanttResourceId(slot);
    const window = findFreeWindow(slot.workCenterId, durationMs, earliestStart, slot.id, resourceId);

    rescheduledSlots.push({
      ...slot,
      quantity,
      bomListId: effectiveContext.bomListId || slot.bomListId || "",
      boardsPerPanel: normalizeBoardsPerPanel(effectiveContext.boardsPerPanel, 1),
      plannedStart: toSlotDateTime(window.start),
      plannedEnd: toSlotDateTime(window.end),
      updatedAt: stamp,
    });
  });

  const rescheduledById = new Map(rescheduledSlots.map((slot) => [slot.id, slot]));
  planningState.slots = [...preservedSlots, ...rescheduledSlots]
    .sort((left, right) => (
      String(getSlotProductionContextId(left)).localeCompare(String(getSlotProductionContextId(right)), "ru")
      || String(getSlotPlanningOrderId(left, getSlotRouteId(left))).localeCompare(String(getSlotPlanningOrderId(right, getSlotRouteId(right))), "ru")
      || toDate(left.plannedStart) - toDate(right.plannedStart)
    ));

  affectedSlots.forEach((slot) => {
    if (rescheduledById.has(slot.id)) cascadeBatchFromSlot(slot.id);
  });

  return rescheduledSlots.length;
}

function rescheduleAllGanttSlotsByCurrentCalendars() {
  const calendarWorkCenterIds = new Set(
    planningState.slots.map((slot) => getCalendarWorkCenterId(slot.workCenterId)).filter(Boolean),
  );
  let rescheduledCount = 0;
  calendarWorkCenterIds.forEach((workCenterId) => {
    rescheduledCount += rescheduleSlotsForWorkCenterCalendarChange(workCenterId);
  });
  return rescheduledCount;
}

function getRouteBufferMs() {
  return DEFAULT_ROUTE_BUFFER_MS;
}

function getWorkCenterCapacity(workCenterId) {
  if (isSmtLineWorkCenterId(workCenterId)) return 1;
  const center = planningState.workCenters.find((item) => item.id === workCenterId);
  if (center?.isPlanningUnit === false) return 0;
  return Math.max(1, Number(center?.capacity || 1));
}

function getSlotStepOrder(slot) {
  return planningState.routeSteps.find((step) => step.id === slot.routeStepId)?.stepOrder ?? 9999;
}

function getSlotRouteTaskId(slot) {
  const step = planningState.routeSteps.find((item) => item.id === slot?.routeStepId);
  return getRouteStepTaskId(step);
}

function getOrderedPlanningOrderSlots(productionId, planningOrderId, taskId = null) {
  return planningState.slots
    .filter((slot) => (
      slotMatchesProductionContext(slot, productionId)
      && slotMatchesPlanningOrder(slot, planningOrderId)
      && (!taskId || getSlotRouteTaskId(slot) === taskId)
    ))
    .sort((left, right) => (
      getSlotRouteTaskId(left).localeCompare(getSlotRouteTaskId(right), "ru")
      || getSlotStepOrder(left) - getSlotStepOrder(right)
      || toDate(left.plannedStart) - toDate(right.plannedStart)
    ));
}

function getRouteNeighbor(slot, direction) {
  const orderedSlots = getOrderedPlanningOrderSlots(
    getSlotProductionContextId(slot),
    getSlotPlanningOrderId(slot, getSlotRouteId(slot)),
    getSlotRouteTaskId(slot),
  );
  const index = orderedSlots.findIndex((item) => item.id === slot.id);
  if (index === -1) return null;
  return orderedSlots[index + direction] || null;
}

function getRouteSlots(routeId = "") {
  return (planningState.slots || []).filter((slot) => getSlotRouteId(slot, planningState) === routeId);
}

function getRoutePlanningOrderSlots(routeId = "", productionId = "", planningOrderId = "") {
  if (!routeId || !planningOrderId) return [];
  return getRouteSlots(routeId).filter((slot) => (
    slotMatchesPlanningOrder(slot, planningOrderId)
    && slotMatchesProductionContext(slot, productionId)
  ));
}

function normalizeRouteFlowLaunchMode(value, route = null) {
  const concreteTasks = route ? getRouteConcreteTasksForPlanning(route) : [];
  const hasMainSteps = route ? getRouteStepsForModule(route.id).some((step) => getRouteStepTaskId(step) === MAIN_ROUTE_TASK_ID) : false;
  return concreteTasks.length > 1 && hasMainSteps ? "transfer_batch" : "complete";
}

function getPlanningTransferBatchQuantity(route = null, batch = null) {
  const explicitQuantity = normalizeOptionalPositiveInteger(route?.transferBatchQuantity);
  const batchQuantity = normalizeOptionalPositiveInteger(batch?.quantity) || getPlanningRouteQuantity(route);
  const fallbackQuantity = Math.min(50, Math.max(1, batchQuantity || 1));
  return Math.max(1, Math.min(explicitQuantity || fallbackQuantity, Math.max(1, batchQuantity || fallbackQuantity)));
}

function getRouteFlowLaunchSettings(route = null, batch = null) {
  const mode = normalizeRouteFlowLaunchMode(route?.flowLaunchMode, route);
  const transferBatchQuantity = getPlanningTransferBatchQuantity(route, batch);
  return {
    mode,
    transferBatchQuantity,
    modeLabel: mode === "transfer_batch" ? "системная передача" : "после окончания операции",
    ruleLabel: mode === "transfer_batch"
      ? "передача по окончанию операции или в конце смены"
      : "передача результата операции",
  };
}

function getRouteBranchCompletionSlots(routeId = "", productionId = "", planningOrderId = "") {
  const groups = new Map();
  getRoutePlanningOrderSlots(routeId, productionId, planningOrderId)
    .filter((slot) => getSlotRouteTaskId(slot) !== MAIN_ROUTE_TASK_ID)
    .forEach((slot) => {
      const taskId = getSlotRouteTaskId(slot);
      if (!groups.has(taskId)) groups.set(taskId, []);
      groups.get(taskId).push(slot);
    });

  return [...groups.values()].map((slots) => slots
    .filter((slot) => planningState.routeSteps.some((step) => step.id === slot.routeStepId))
    .sort((left, right) => (
      getSlotStepOrder(right) - getSlotStepOrder(left)
      || toDate(right.plannedEnd) - toDate(left.plannedEnd)
    ))[0])
    .filter(Boolean);
}

function getSlotReadyAtQuantity(slot = null, quantity = 1) {
  if (!slot) return null;
  const slotQuantity = Math.max(1, normalizeQuantity(slot.quantity));
  const requiredQuantity = Math.min(slotQuantity, Math.max(1, normalizeQuantity(quantity)));
  const durationMs = Math.max(0, getSlotRequiredDurationMs(slot, planningState));
  if (!durationMs) return toDate(slot.plannedStart);
  return addWorkingDuration(slot.workCenterId, slot.plannedStart, durationMs * (requiredQuantity / slotQuantity), planningState);
}

function getSlotProducedQuantityAt(slot = null, at = ui.now) {
  if (!slot) return 0;
  const quantity = normalizeQuantity(slot.quantity);
  if (!quantity) return 0;

  const start = toDate(slot.actualStart || slot.plannedStart);
  const end = toDate(slot.actualEnd || slot.plannedEnd);
  const reference = toDate(at);
  if (isGanttSlotCompleted(slot) || reference >= end) return quantity;
  if (reference <= start) return 0;

  const totalMs = Math.max(1, getWorkingDurationBetween(slot.workCenterId, start, end, planningState));
  const elapsedMs = Math.max(0, Math.min(totalMs, getWorkingDurationBetween(slot.workCenterId, start, reference, planningState)));
  return Math.max(0, Math.min(quantity, Math.floor(quantity * (elapsedMs / totalMs))));
}

function getSlotSystemTransferEvent(slot = null, state = null) {
  if (!slot) return null;
  const sourceState = state || planningState;
  const totalQuantity = normalizeQuantity(slot.quantity || 0);
  const operationStart = snapToWorkingTime(slot.workCenterId, slot.actualStart || slot.plannedStart, sourceState);
  const operationEnd = toDate(slot.actualEnd || slot.plannedEnd || operationStart);
  if (!totalQuantity || !operationStart || !operationEnd || operationEnd <= operationStart) {
    return {
      readyAt: operationEnd || operationStart || new Date(),
      quantity: totalQuantity,
      reason: "operation_complete",
      label: "операция завершена",
    };
  }

  const intervals = getWorkingIntervalsBetween(slot.workCenterId, operationStart, operationEnd, sourceState);
  const firstInterval = intervals.find((interval) => interval.end > operationStart) || null;
  if (!firstInterval || operationEnd <= firstInterval.end) {
    return {
      readyAt: operationEnd,
      quantity: totalQuantity,
      reason: "operation_complete",
      label: "операция завершена до конца смены",
    };
  }

  const producedAtShiftEnd = getSlotProducedQuantityAt(slot, firstInterval.end);
  const transferQuantity = Math.max(1, Math.min(totalQuantity, producedAtShiftEnd));
  return {
    readyAt: firstInterval.end,
    quantity: transferQuantity,
    reason: "shift_end",
    label: "передача в конце смены",
  };
}

function getRoutePlanningOrderWipBranchDetails(routeId = "", productionId = "", planningOrderId = "", at = ui.now) {
  const route = (planningState.routes || []).find((item) => item.id === routeId) || null;
  const planningOrder = getBatch(planningOrderId);
  const settings = getRouteFlowLaunchSettings(route, planningOrder);
  const consumedKits = getRoutePlanningOrderSlots(routeId, productionId, planningOrderId)
    .filter((slot) => getSlotRouteTaskId(slot) === MAIN_ROUTE_TASK_ID)
    .reduce((sum, slot) => sum + getSlotProducedQuantityAt(slot, at), 0);

  return getRouteBranchCompletionSlots(routeId, productionId, planningOrderId).map((slot) => {
    const step = (planningState.routeSteps || []).find((item) => item.id === slot.routeStepId) || null;
    const task = getRouteStepPlanningTask(route, step) || null;
    const flow = getSlotOperationFlow(slot, route, step);
    const producedObjectLabel = getRouteTaskProducedObjectLabel(route, task, getBomList(task?.bomListId || ""), getRoutePlanningContext(route));
    const inputObjectLabel = getRouteTaskInputObjectLabel(route, task, flow.inputLabel);
    const producedQuantity = getSlotProducedQuantityAt(slot, at);
    const availableQuantity = Math.max(0, producedQuantity - consumedKits);
    const transferEvent = settings.mode === "transfer_batch" ? getSlotSystemTransferEvent(slot) : null;
    const requiredQuantity = settings.mode === "transfer_batch"
      ? Math.min(normalizeQuantity(transferEvent?.quantity || settings.transferBatchQuantity), normalizeQuantity(slot.quantity))
      : normalizeQuantity(slot.quantity);
    const readyAt = transferEvent?.readyAt || toDate(slot.plannedEnd);

    return {
      id: slot.id,
      slot,
      step,
      task,
      title: task?.title || step?.specTaskName || producedObjectLabel || slot.operationName || "Ветка производства",
      inputLabel: inputObjectLabel || flow.inputLabel,
      outputLabel: producedObjectLabel || flow.outputLabel,
      producedQuantity,
      consumedKits,
      availableQuantity,
      requiredQuantity,
      readyAt,
      transferReason: transferEvent?.reason || "operation_complete",
      transferLabel: transferEvent?.label || "операция завершена",
      isReadyForStart: availableQuantity >= Math.max(1, requiredQuantity),
      progress: requiredQuantity ? Math.max(0, Math.min(1, producedQuantity / requiredQuantity)) : 0,
      unit: "шт.",
    };
  });
}

function getRoutePlanningOrderAvailableKitCount(routeId = "", productionId = "", planningOrderId = "", at = ui.now) {
  const branchDetails = getRoutePlanningOrderWipBranchDetails(routeId, productionId, planningOrderId, at);
  if (!branchDetails.length) return 0;
  return Math.max(0, Math.min(...branchDetails.map((branch) => branch.availableQuantity)));
}

function getMainRouteDependencyReadiness(routeId = "", productionId = "", planningOrderId = "") {
  const route = (planningState.routes || []).find((item) => item.id === routeId) || null;
  const planningOrder = getBatch(planningOrderId);
  const branchSlots = getRouteBranchCompletionSlots(routeId, productionId, planningOrderId);
  if (!branchSlots.length) return null;

  const settings = getRouteFlowLaunchSettings(route, planningOrder);
  const branchDetails = getRoutePlanningOrderWipBranchDetails(routeId, productionId, planningOrderId, ui.now);
  const sourceReadyDates = branchSlots.map((slot) => (
    settings.mode === "transfer_batch"
      ? getSlotSystemTransferEvent(slot)?.readyAt
      : toDate(slot.plannedEnd)
  )).filter(Boolean);
  if (!sourceReadyDates.length) return null;

  const latestReadyAt = sourceReadyDates.reduce((latest, date) => (
    new Date(Math.max(latest.getTime(), toDate(date).getTime()))
  ), sourceReadyDates[0]);

  return {
    ...settings,
    transferBatchQuantity: branchDetails.length
      ? Math.max(1, Math.min(...branchDetails.map((branch) => normalizeQuantity(branch.requiredQuantity || settings.transferBatchQuantity || 1))))
      : settings.transferBatchQuantity,
    readyAt: addMs(latestReadyAt, getRouteBufferMs()),
    sourceReadyAt: latestReadyAt,
    availableKitsNow: branchDetails.length
      ? Math.max(0, Math.min(...branchDetails.map((branch) => branch.availableQuantity)))
      : getRoutePlanningOrderAvailableKitCount(routeId, productionId, planningOrderId, ui.now),
    branchDetails,
    sourceSlotIds: new Set(branchSlots.map((slot) => slot.id)),
    sourceSlots: branchSlots,
  };
}

function getMainRouteDependencyReadyAt(routeId = "", productionId = "", planningOrderId = "") {
  return getMainRouteDependencyReadiness(routeId, productionId, planningOrderId)?.readyAt || null;
}

function alignMainRouteSlotsAfterBranches(routeId = "", productionId = "", planningOrderId = "") {
  const planningOrderSlots = getRoutePlanningOrderSlots(routeId, productionId, planningOrderId);
  const mainSlots = planningOrderSlots
    .filter((slot) => getSlotRouteTaskId(slot) === MAIN_ROUTE_TASK_ID)
    .sort((left, right) => (
      getSlotStepOrder(left) - getSlotStepOrder(right)
      || toDate(left.plannedStart) - toDate(right.plannedStart)
    ));
  const dependencyReadiness = getMainRouteDependencyReadiness(routeId, productionId, planningOrderId);
  const dependencyReadyAt = dependencyReadiness?.readyAt || null;
  if (!mainSlots.length || !dependencyReadyAt) return [];

  const changedSlotIds = [];
  let readyAt = dependencyReadyAt;
  mainSlots.forEach((slot) => {
    if (slot.locked || isGanttSlotCompleted(slot)) {
      readyAt = addMs(new Date(Math.max(toDate(readyAt).getTime(), toDate(slot.plannedEnd).getTime())), getRouteBufferMs());
      return;
    }

    const shouldPullForward = dependencyReadiness?.mode === "transfer_batch" && toDate(slot.plannedStart) > toDate(readyAt);
    if (toDate(slot.plannedStart) < toDate(readyAt) || shouldPullForward) {
      const durationMs = getSlotRequiredDurationMs(slot, planningState);
      const window = findFreeWindow(slot.workCenterId, durationMs, readyAt, slot.id, slot.resourceId || "");
      slot.plannedStart = toSlotDateTime(window.start);
      slot.plannedEnd = toSlotDateTime(window.end);
      const effectiveContext = getSlotEffectiveOperationContext(slot, planningState);
      slot.bomListId = effectiveContext.bomListId || slot.bomListId || "";
      slot.boardsPerPanel = effectiveContext.boardsPerPanel;
      slot.updatedAt = new Date().toISOString();
      changedSlotIds.push(slot.id);
    }

    readyAt = addMs(slot.plannedEnd, getRouteBufferMs());
  });

  return changedSlotIds;
}

function alignRouteMainSlotsAfterBranches(routeId = "") {
  const routeSlots = getRouteSlots(routeId);
  const batchKeys = [...new Set(routeSlots.map((slot) => {
    const productionId = getSlotProductionContextId(slot);
    const planningOrderId = getSlotPlanningOrderId(slot, routeId);
    return `${productionId}:${planningOrderId}`;
  }))];
  return batchKeys.flatMap((key) => {
    const [productionId, planningOrderId] = key.split(":");
    return alignMainRouteSlotsAfterBranches(routeId, productionId, planningOrderId);
  });
}

function getGanttChainKey(slot = {}) {
  const routeId = getSlotRouteId(slot, planningState);
  return [
    routeId,
    getSlotProductionContextId(slot),
    getSlotPlanningOrderId(slot, routeId),
    getSlotRouteTaskId(slot) || MAIN_ROUTE_TASK_ID,
  ].join("::");
}

function getGanttWorkOrderKey(slot = {}) {
  const routeId = getSlotRouteId(slot, planningState);
  return [
    routeId,
    getSlotProductionContextId(slot),
    getSlotPlanningOrderId(slot, routeId),
  ].join("::");
}

function buildGanttChainCompactionGroups(routeIds = [], workOrderKeys = []) {
  const routeIdSet = new Set(routeIds.filter(Boolean));
  const workOrderKeySet = new Set(workOrderKeys.filter(Boolean));
  const groups = new Map();

  (planningState.slots || []).forEach((slot) => {
    const routeId = getSlotRouteId(slot, planningState);
    if (!routeId || (routeIdSet.size && !routeIdSet.has(routeId))) return;
    const workOrderKey = getGanttWorkOrderKey(slot);
    if (workOrderKeySet.size && !workOrderKeySet.has(workOrderKey)) return;
    const productionId = getSlotProductionContextId(slot);
    const planningOrderId = getSlotPlanningOrderId(slot, routeId);
    const taskId = getSlotRouteTaskId(slot) || MAIN_ROUTE_TASK_ID;
    const key = getGanttChainKey(slot);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        routeId,
        productionId,
        planningOrderId,
        taskId,
        minStart: Number.POSITIVE_INFINITY,
        slots: [],
      });
    }
    const group = groups.get(key);
    group.slots.push(slot);
    group.minStart = Math.min(group.minStart, toDate(slot.plannedStart).getTime());
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      slots: group.slots.sort((left, right) => (
        getSlotStepOrder(left) - getSlotStepOrder(right)
        || toDate(left.plannedStart) - toDate(right.plannedStart)
        || String(left.id || "").localeCompare(String(right.id || ""), "ru")
      )),
    }))
    .sort((left, right) => {
      const sameOrder = left.routeId === right.routeId
        && left.productionId === right.productionId
        && left.planningOrderId === right.planningOrderId;
      if (sameOrder && left.taskId !== right.taskId) {
        if (left.taskId === MAIN_ROUTE_TASK_ID) return 1;
        if (right.taskId === MAIN_ROUTE_TASK_ID) return -1;
      }
      return left.minStart - right.minStart
        || String(left.routeId).localeCompare(String(right.routeId), "ru")
        || String(left.productionId).localeCompare(String(right.productionId), "ru")
        || String(left.planningOrderId).localeCompare(String(right.planningOrderId), "ru")
        || String(left.taskId).localeCompare(String(right.taskId), "ru");
    });
}

function compactVisibleGanttChains(options = {}) {
  const routeIds = getVisibleGanttRoutes().map((route) => route.id).filter(Boolean);
  const groups = buildGanttChainCompactionGroups(routeIds, options.workOrderKeys || []);
  const movableIds = new Set(groups
    .flatMap((group) => group.slots)
    .filter((slot) => !slot.locked && !isGanttSlotCompleted(slot))
    .map((slot) => slot.id));

  if (!groups.length || !movableIds.size) {
    return { changed: 0, considered: 0, skipped: groups.flatMap((group) => group.slots).length };
  }

  const preservedSlots = (planningState.slots || []).filter((slot) => !movableIds.has(slot.id));
  const rescheduledSlots = [];
  const rescheduledById = new Map();
  const stamp = new Date().toISOString();
  let changed = 0;
  let considered = 0;
  let skipped = 0;

  const restoreRuntimeSlots = () => {
    planningState.slots = [...preservedSlots, ...rescheduledSlots];
  };

  groups.forEach((group) => {
    let previous = null;

    group.slots.forEach((originalSlot) => {
      restoreRuntimeSlots();
      const slot = rescheduledById.get(originalSlot.id) || originalSlot;

      if (slot.locked || isGanttSlotCompleted(slot)) {
        skipped += 1;
        previous = slot;
        return;
      }

      considered += 1;
      const quantity = normalizeQuantity(slot.quantity);
      const slotContext = { ...slot, quantity };
      const durationMs = getSlotRequiredDurationMs(slotContext, planningState);
      const dependencyReadyAt = group.taskId === MAIN_ROUTE_TASK_ID && !previous
        ? getMainRouteDependencyReadyAt(group.routeId, group.productionId, group.planningOrderId)
        : null;
      const earliestStart = previous
        ? addMs(previous.plannedEnd, getRouteBufferMs())
        : toDate(dependencyReadyAt || slot.plannedStart);
      const window = findFreeWindow(
        slot.workCenterId,
        durationMs,
        earliestStart,
        slot.id,
        slot.resourceId || getSlotGanttResourceId(slot),
      );
      const effectiveContext = getSlotEffectiveOperationContext({
        ...slot,
        quantity,
        plannedStart: toSlotDateTime(window.start),
        plannedEnd: toSlotDateTime(window.end),
      }, planningState);
      const timingChanged = toDate(window.start).getTime() !== toDate(slot.plannedStart).getTime()
        || toDate(window.end).getTime() !== toDate(slot.plannedEnd).getTime();
      const nextSlot = {
        ...slot,
        quantity,
        bomListId: effectiveContext.bomListId || slot.bomListId || "",
        boardsPerPanel: normalizeBoardsPerPanel(effectiveContext.boardsPerPanel || slot.boardsPerPanel, 1),
        resourceId: effectiveContext.resourceId || slot.resourceId || "",
        plannedStart: toSlotDateTime(window.start),
        plannedEnd: toSlotDateTime(window.end),
        updatedAt: timingChanged ? stamp : slot.updatedAt,
      };

      if (timingChanged) {
        changed += 1;
      }

      rescheduledSlots.push(nextSlot);
      rescheduledById.set(nextSlot.id, nextSlot);
      previous = nextSlot;
    });
  });

  restoreRuntimeSlots();
  planningState.slots = planningState.slots.sort((left, right) => (
    String(getSlotProductionContextId(left)).localeCompare(String(getSlotProductionContextId(right)), "ru")
    || String(getSlotPlanningOrderId(left, getSlotRouteId(left))).localeCompare(String(getSlotPlanningOrderId(right, getSlotRouteId(right))), "ru")
    || getSlotStepOrder(left) - getSlotStepOrder(right)
    || toDate(left.plannedStart) - toDate(right.plannedStart)
    || String(left.id || "").localeCompare(String(right.id || ""), "ru")
  ));

  return { changed, considered, skipped };
}

function getGanttOptimizationWorkOrders() {
  const routeIds = getVisibleGanttRoutes().map((route) => route.id).filter(Boolean);
  const workOrders = new Map();

  buildGanttChainCompactionGroups(routeIds).forEach((group) => {
    const key = [group.routeId, group.productionId, group.planningOrderId].join("::");
    if (!workOrders.has(key)) {
      workOrders.set(key, {
        key,
        routeId: group.routeId,
        productionId: group.productionId,
        planningOrderId: group.planningOrderId,
        chains: 0,
        slots: [],
        minStart: Number.POSITIVE_INFINITY,
        maxEnd: 0,
      });
    }
    const item = workOrders.get(key);
    item.chains += 1;
    item.slots.push(...group.slots);
    group.slots.forEach((slot) => {
      item.minStart = Math.min(item.minStart, toDate(slot.plannedStart).getTime());
      item.maxEnd = Math.max(item.maxEnd, toDate(slot.plannedEnd).getTime());
    });
  });

  return [...workOrders.values()].map((item) => {
    const route = (planningState.routes || []).find((candidate) => candidate.id === item.routeId) || null;
    const production = getProject(item.productionId) || getRoutePlanningContext(route);
    const order = getBatch(item.planningOrderId) || getRoutePlanningOrder(route, production);
    const movableSlots = item.slots.filter((slot) => !slot.locked && !isGanttSlotCompleted(slot));
    const lockedSlots = item.slots.filter((slot) => slot.locked).length;
    const completedSlots = item.slots.filter((slot) => isGanttSlotCompleted(slot)).length;
    const quantity = normalizeQuantity(order?.quantity || getPlanningRouteQuantity(route), 1);

    return {
      ...item,
      route,
      production,
      order,
      title: route?.name || order?.documentContract?.title || "Заказ-наряд",
      objectLabel: getProjectDisplayName(production) || production?.name || getPlanningOrderObjectLabel(route) || "объект не выбран",
      quantity,
      movableCount: movableSlots.length,
      lockedCount: lockedSlots,
      completedCount: completedSlots,
      slotCount: item.slots.length,
      start: Number.isFinite(item.minStart) ? new Date(item.minStart) : null,
      end: item.maxEnd ? new Date(item.maxEnd) : null,
    };
  }).sort((left, right) => (
    toDate(left.start || new Date()).getTime() - toDate(right.start || new Date()).getTime()
    || String(left.title).localeCompare(String(right.title), "ru")
  ));
}

function getEarliestRouteStart(productionId, planningOrderId, routeStepId) {
  const step = planningState.routeSteps.find((item) => item.id === routeStepId);
  const taskId = getRouteStepTaskId(step);
  if (taskId === MAIN_ROUTE_TASK_ID) {
    const dependencyReadyAt = getMainRouteDependencyReadyAt(step?.routeId || "", productionId, planningOrderId);
    if (dependencyReadyAt) return dependencyReadyAt;
  }
  const previousSlots = getOrderedPlanningOrderSlots(productionId, planningOrderId, taskId)
    .filter((slot) => getSlotStepOrder(slot) < Number(step?.stepOrder || 0));
  const previous = previousSlots[previousSlots.length - 1];
  if (previous) return addMs(previous.plannedEnd, getRouteBufferMs());
  return fromDateInput(ui.windowStart);
}

function getPlannedStepIds(productionId, planningOrderId) {
  return new Set(planningState.slots
    .filter((slot) => (
      slotMatchesPlanningOrder(slot, planningOrderId)
      && (getSlotRouteId(slot, planningState) === productionId || slotMatchesProductionContext(slot, productionId))
    ))
    .map((slot) => slot.routeStepId));
}

function buildBacklogItems(limit = 14) {
  const items = [];
  const routes = getVisibleGanttRoutes();

  for (const route of routes) {
    const project = getRoutePlanningContext(route);
    if (!project) continue;
    const routeSteps = getSchedulableRouteSteps(route.id);
    const batches = getRoutePlanningBatches(route, project);

    for (const batch of batches) {
      const plannedStepIds = getPlannedStepIds(route.id, batch.id);
      const nextStep = routeSteps.find((step) => (
        !plannedStepIds.has(step.id)
        && (!isManufacturingOutputReceiptRouteStep(step) || plannedStepIds.size > 0)
      ));
      if (!nextStep) continue;

      const quantity = getRouteStepQuantityForBatch(nextStep, batch);
      const earliestStart = getEarliestRouteStart(project.id, batch.id, nextStep.id);
      const assignment = getManualPlanningAssignmentForRouteStep(nextStep, quantity, earliestStart, { state: planningState });
      const dueState = getProjectDeadlineState(project);

      items.push({
        project,
        batch,
        routeStep: nextStep,
        workCenter: getWorkCenter(assignment?.workCenterId) || getWorkCenter(nextStep.workCenterId),
        quantity,
        earliestStart,
        plannedStart: assignment?.window?.start || earliestStart,
        plannedEnd: assignment?.window?.end || earliestStart,
        requiresPlanningLine: !assignment && routeStepRequiresManualPlanningLine(nextStep, planningState),
        dueState,
      });
    }
  }

  return items
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))
    .slice(0, limit);
}

function windowsOverlap(startA, endA, startB, endB) {
  return toDate(startA) < toDate(endB) && toDate(endA) > toDate(startB);
}

function isWindowAvailable(workCenterId, start, end, excludeSlotId = null, resourceId = "") {
  const capacity = resourceId ? 1 : getWorkCenterCapacity(workCenterId);
  const relevantSlots = planningState.slots.filter((slot) => (
    slot.workCenterId === workCenterId
    && (!resourceId || getSlotGanttResourceId(slot) === resourceId)
    && slot.id !== excludeSlotId
    && windowsOverlap(start, end, slot.plannedStart, slot.plannedEnd)
  ));
  if (relevantSlots.length < capacity) return true;

  const points = [toDate(start).getTime(), toDate(end).getTime()];
  for (const slot of relevantSlots) {
    points.push(toDate(slot.plannedStart).getTime(), toDate(slot.plannedEnd).getTime());
  }

  const sortedPoints = [...new Set(points)]
    .filter((point) => point >= toDate(start).getTime() && point <= toDate(end).getTime())
    .sort((left, right) => left - right);

  for (let index = 0; index < sortedPoints.length - 1; index += 1) {
    const probe = new Date((sortedPoints[index] + sortedPoints[index + 1]) / 2);
    const concurrent = relevantSlots.filter((slot) => (
      toDate(slot.plannedStart) <= probe && toDate(slot.plannedEnd) > probe
    )).length + 1;
    if (concurrent > capacity) return false;
  }

  return true;
}

function findFreeWindow(workCenterId, durationMs, earliestStart, excludeSlotId = null, resourceId = "") {
  const snapMs = getGanttSnapMs();
  let candidateStart = snapToWorkingTime(workCenterId, snapDate(earliestStart, snapMs), planningState);
  const maxIterations = 160;

  for (let index = 0; index < maxIterations; index += 1) {
    candidateStart = snapToWorkingTime(workCenterId, candidateStart, planningState);
    const candidateEnd = addWorkingDuration(workCenterId, candidateStart, durationMs, planningState);
    if (isWindowAvailable(workCenterId, candidateStart, candidateEnd, excludeSlotId, resourceId)) {
      return { start: candidateStart, end: candidateEnd };
    }

    const overlappingSlots = planningState.slots
      .filter((slot) => (
        slot.workCenterId === workCenterId
        && (!resourceId || getSlotGanttResourceId(slot) === resourceId)
        && slot.id !== excludeSlotId
        && windowsOverlap(candidateStart, candidateEnd, slot.plannedStart, slot.plannedEnd)
      ))
      .sort((left, right) => toDate(left.plannedEnd) - toDate(right.plannedEnd));

    candidateStart = snapToWorkingTime(workCenterId, snapDate(addMs(overlappingSlots[0]?.plannedEnd || candidateEnd, getRouteBufferMs()), snapMs), planningState);
  }

  return { start: candidateStart, end: addWorkingDuration(workCenterId, candidateStart, durationMs, planningState) };
}

function getGanttSnapMs() {
  return GANTT_SNAP_MS;
}

function normalizeGanttZoom(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultUiState.ganttZoom;
  return GANTT_ZOOM_LEVELS.reduce((closest, level) => (
    Math.abs(level - number) < Math.abs(closest - number) ? level : closest
  ), GANTT_ZOOM_LEVELS[1]);
}

function getGanttZoomIndex(value = ui.ganttZoom) {
  const normalized = normalizeGanttZoom(value);
  return Math.max(0, GANTT_ZOOM_LEVELS.indexOf(normalized));
}

function getGanttZoomPercent(value = ui.ganttZoom) {
  return `${Math.round(normalizeGanttZoom(value) * 100)}%`;
}

function setGanttZoom(action) {
  const index = getGanttZoomIndex();
  const nextIndex = action === "in"
    ? Math.min(GANTT_ZOOM_LEVELS.length - 1, index + 1)
    : action === "out"
      ? Math.max(0, index - 1)
      : GANTT_ZOOM_LEVELS.indexOf(1);
  ui.ganttZoom = GANTT_ZOOM_LEVELS[Math.max(0, nextIndex)];
  persistUiState();
  render();
}

function normalizeGanttSlotContent(value) {
  return GANTT_SLOT_CONTENT_MODES.some((mode) => mode.id === value) ? value : defaultUiState.ganttSlotContent;
}

function getGanttSlotContentMode() {
  return GANTT_SLOT_CONTENT_MODES.find((mode) => mode.id === normalizeGanttSlotContent(ui.ganttSlotContent))
    || GANTT_SLOT_CONTENT_MODES[0];
}

function buildGanttScaleInfo(scale, startValue, countOverride = null) {
  const base = buildTimeScale(scale, startValue, countOverride);
  const zoom = normalizeGanttZoom(ui.ganttZoom);
  const cellWidth = Math.round(base.cellWidth * zoom);
  return {
    ...base,
    cellWidth,
    width: base.count * cellWidth,
    zoom,
  };
}

function getGanttSnapScaleInfo(scaleInfo) {
  return {
    ...scaleInfo,
    snapMs: getGanttSnapMs(),
  };
}

function getGanttSnapWidth(scaleInfo) {
  return scaleInfo.cellWidth * (getGanttSnapMs() / scaleInfo.unitMs);
}

function getGanttDependencyArrowLength(scaleInfo) {
  return scaleInfo.cellWidth * (GANTT_DEPENDENCY_ARROW_LENGTH_MS / scaleInfo.unitMs);
}

function getGanttDependencyEntryWidth(scaleInfo) {
  return scaleInfo.cellWidth * (GANTT_DEPENDENCY_ENTRY_MS / scaleInfo.unitMs);
}

function getTimelineCount(scale, startValue = null) {
  const base = scaleConfig[scale]?.count || 1;
  const configuredCount = Math.max(base, Math.round(Number(ui.timelineCounts?.[scale] || base)));
  const unitMs = scaleConfig[scale]?.unitMs || 1;
  const start = startValue ? toDate(startValue) : toDate(fromDateInput(ui.windowStart));
  const maxSlotEnd = planningState.slots.reduce((max, slot) => Math.max(max, toDate(slot.plannedEnd).getTime()), start.getTime());
  const requiredCount = Math.ceil((maxSlotEnd - start.getTime()) / unitMs) + Math.max(2, Math.round((TIMELINE_LOAD_CHUNK[scale] || base) / 3));
  return Math.min(TIMELINE_MAX_COUNT[scale] || configuredCount, Math.max(base, configuredCount, requiredCount));
}

function getEarliestPlannedSlotStart(state = null) {
  const sourceState = state || planningState;
  const timestamps = (sourceState?.slots || [])
    .map((slot) => toDate(slot.plannedStart).getTime())
    .filter((time) => Number.isFinite(time));
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps));
}

function getGanttWindowAnchorForSlot(slotStart, scale = "days") {
  if (!slotStart) return null;
  if (scale === "weeks") return startOfWeek(slotStart);
  if (scale === "days") return startOfWeek(slotStart);
  return startOfDay(slotStart);
}

function alignGanttWindowToPlan(options = {}) {
  if (!ui || ui.activeModule !== "gantt") return false;
  const earliestStart = getEarliestPlannedSlotStart();
  const anchor = getGanttWindowAnchorForSlot(earliestStart, ui.scale);
  if (!anchor) return false;

  const currentStart = startOfDay(fromDateInput(ui.windowStart || defaultUiState.windowStart));
  const farThresholdMs = ui.scale === "hours" ? 36 * 60 * 60 * 1000 : ui.scale === "weeks" ? 4 * 7 * DAY_MS : 5 * DAY_MS;
  const isFarAhead = earliestStart.getTime() - currentStart.getTime() > farThresholdMs;
  if (!options.force && (!options.onlyWhenFar || !isFarAhead || Number(ui.scrollLeft || 0) > 0)) return false;

  ui.windowStart = toDateInput(anchor);
  ui.scrollLeft = 0;
  ui.scrollTop = 0;
  return true;
}

function getVisiblePlanningProjects() {
  return getProductionContexts().filter((project) => projectMatchesFilters(project));
}

function getVisibleGanttRoutes() {
  const filteredRoutes = (planningState.routes || [])
    .filter((route) => routeMatchesGanttFilters(route))
    .sort((left, right) => {
      const leftSpecification = getRouteSpecification(left);
      const rightSpecification = getRouteSpecification(right);
      const leftBom = getRouteBomList(left);
      const rightBom = getRouteBomList(right);
      const leftProject = getRoutePlanningContext(left);
      const rightProject = getRoutePlanningContext(right);
      return String(leftBom?.name || leftSpecification?.name || getProjectDisplayName(leftProject) || "").localeCompare(String(rightBom?.name || rightSpecification?.name || getProjectDisplayName(rightProject) || ""), "ru")
        || String(left.name || "").localeCompare(String(right.name || ""), "ru");
    });
  if (filteredRoutes.length || !(planningState.slots || []).length) return filteredRoutes;

  const routeIdsWithSlots = new Set((planningState.slots || [])
    .map((slot) => getSlotRouteId(slot, planningState))
    .filter(Boolean));
  return (planningState.routes || [])
    .filter((route) => route?.id && routeIdsWithSlots.has(route.id) && !isWorkOrderPlanningCanceled(route))
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru"));
}

function isGanttRouteExpanded(route) {
  const productionId = getRouteProductionId(route);
  return Boolean(route?.id && (ui.expandedProjects.has(route.id) || ui.expandedProjects.has(productionId)));
}

function areAllVisibleProjectsExpanded() {
  const routes = getVisibleGanttRoutes();
  return routes.length > 0 && routes.every((route) => isGanttRouteExpanded(route));
}

function extendTimelineIfNeeded(shell, scaleInfo) {
  if (!shell || !scaleInfo) return false;
  const remaining = shell.scrollWidth - shell.clientWidth - shell.scrollLeft;
  const threshold = Math.max(shell.clientWidth * 0.42, scaleInfo.cellWidth * 3);
  if (remaining > threshold) return false;

  const current = getTimelineCount(ui.scale, scaleInfo.start);
  const chunk = TIMELINE_LOAD_CHUNK[ui.scale] || 0;
  const maxCount = TIMELINE_MAX_COUNT[ui.scale] || current;
  const visibleTimelineRight = Math.max(0, shell.scrollLeft + shell.clientWidth - LEFT_WIDTH);
  const requiredByScroll = Math.ceil((visibleTimelineRight + threshold) / Math.max(scaleInfo.cellWidth, 1));
  const next = Math.min(maxCount, Math.max(current + chunk, requiredByScroll + chunk));
  if (next <= current) return false;

  ui.timelineCounts = {
    ...defaultUiState.timelineCounts,
    ...(ui.timelineCounts || {}),
    [ui.scale]: next,
  };
  ui.scrollLeft = shell.scrollLeft;
  ui.scrollTop = shell.scrollTop;
  persistUiState();
  render();
  return true;
}

function prependTimelineIfNeeded(shell, scaleInfo, options = {}) {
  if (!shell || !scaleInfo) return false;

  const threshold = Math.max(shell.clientWidth * 0.18, scaleInfo.cellWidth * 1.5);
  if (!options.force && shell.scrollLeft > threshold) return false;

  const current = getTimelineCount(ui.scale, scaleInfo.start);
  const chunk = TIMELINE_LOAD_CHUNK[ui.scale] || scaleConfig[ui.scale]?.count || 1;
  const maxCount = TIMELINE_MAX_COUNT[ui.scale] || current;
  const next = current < maxCount ? Math.min(maxCount, current + chunk) : current;
  const shiftedUnits = current < maxCount ? Math.max(1, next - current) : chunk;
  const shiftedWidth = shiftedUnits * scaleInfo.cellWidth;
  const nextStart = addMs(scaleInfo.start, -shiftedUnits * scaleInfo.unitMs);

  ui.windowStart = toDateInput(nextStart);
  ui.timelineCounts = {
    ...defaultUiState.timelineCounts,
    ...(ui.timelineCounts || {}),
    [ui.scale]: next,
  };
  ui.scrollLeft = Math.max(0, shell.scrollLeft + shiftedWidth);
  ui.scrollTop = shell.scrollTop;
  persistUiState({ skipRememberScroll: true });
  render({ skipRememberScroll: true });
  return true;
}

function cascadeBatchFromSlot(slotId) {
  const changedSlot = planningState.slots.find((slot) => slot.id === slotId);
  if (!changedSlot) return;
  const changedRoute = getSlotRoute(changedSlot);
  const changedTaskId = getSlotRouteTaskId(changedSlot);
  const changedRouteId = getSlotRouteId(changedSlot, planningState);
  const changedProductionId = getSlotProductionContextId(changedSlot);
  const changedPlanningOrderId = getSlotPlanningOrderId(changedSlot, changedRouteId);

  const orderedSlots = getOrderedPlanningOrderSlots(changedProductionId, changedPlanningOrderId, getSlotRouteTaskId(changedSlot));
  const startIndex = orderedSlots.findIndex((slot) => slot.id === slotId);
  if (startIndex === -1) return;

  let previous = orderedSlots[startIndex];
  for (let index = startIndex + 1; index < orderedSlots.length; index += 1) {
    const current = planningState.slots.find((slot) => slot.id === orderedSlots[index].id);
    if (!current || current.locked || current.status === "completed") {
      previous = current || previous;
      continue;
    }

	    const earliestStart = addMs(previous.plannedEnd, getRouteBufferMs());
	    if (toDate(current.plannedStart) < earliestStart) {
	      const durationMs = getSlotRequiredDurationMs(current, planningState);
	      const window = findFreeWindow(current.workCenterId, durationMs, earliestStart, current.id, current.resourceId || "");
	      current.plannedStart = toSlotDateTime(window.start);
	      current.plannedEnd = toSlotDateTime(window.end);
	      Object.assign(current, {
	        bomListId: getSlotEffectiveOperationContext(current, planningState).bomListId || current.bomListId || "",
	        boardsPerPanel: getSlotEffectiveOperationContext(current, planningState).boardsPerPanel,
	      });
	      current.updatedAt = new Date().toISOString();
	    }
    previous = current;
  }

  if (changedRoute?.id && changedTaskId !== MAIN_ROUTE_TASK_ID) {
    alignMainRouteSlotsAfterBranches(changedRoute.id, changedProductionId, changedPlanningOrderId);
  }
}

function cascadeIfEnabled(slotId) {
  if (ui.autoCascade) cascadeBatchFromSlot(slotId);
}

function getProjectDeadlineState(project) {
  const slots = planningState.slots.filter((slot) => slotMatchesProductionContext(slot, project.id));
  if (!slots.length) return { tone: "neutral", label: "нет плана", slackMs: null };

  const latestEnd = slots.reduce((latest, slot) => Math.max(latest, toDate(slot.plannedEnd).getTime()), 0);
  const dueEnd = addMs(`${project.dueDate}T00:00:00`, 24 * 60 * 60 * 1000 - 1).getTime();
  const slackMs = dueEnd - latestEnd;
  const days = Math.ceil(Math.abs(slackMs) / (24 * 60 * 60 * 1000));

  if (slackMs < 0) return { tone: "critical", label: `срыв ${days} д`, slackMs };
  if (slackMs < 2 * 24 * 60 * 60 * 1000) return { tone: "warning", label: `запас ${days} д`, slackMs };
  return { tone: "ok", label: `запас ${days} д`, slackMs };
}

function resetRemovedGanttFilters() {
  ui.workCenterFilter = "all";
  ui.rowMode = "route";
  ui.hideSharedNonWorkingZones = false;
}

  const api = {
    resolveProductionResourceType,
    mapLegacyWorkCenterId,
    isWarehouseWorkCenterId,
    hasManufacturingOutputReceiptText,
    hasNonOutputWarehouseText,
    isManufacturingOutputReceiptOperation,
    isManufacturingOutputReceiptRouteStep,
    isManufacturingOutputReceiptSlot,
    isSmtRouteInstructionWorkCenterId,
    getRouteInstructionWorkCenterId,
    getOperationRouteWorkCenterId,
    getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
    getRouteStepPlanningCandidateWorkCenterIds,
    getRouteStepExplicitPlanningWorkCenterId,
    routeStepRequiresManualPlanningLine,
    getRouteStepSelectedPlanningWorkCenterId,
    isPlanningWorkCenterCompatibleWithRouteStep,
    getPlanningResourceForRouteStep,
    getPlanningAssignmentForRouteStep,
    getManualPlanningAssignmentForRouteStep,
    getRouteStepPlanningAssignmentForSlot,
    resolveWorkCenterIdFromName,
    getProductionResourceWorkCenterId,
    normalizeProductionResourceCapacity,
    normalizeProductionResource,
    getSmtLineParentResourceId,
    migrateLegacyResourceRow,
    migrateLegacyEquipmentRow,
    dedupeProductionResources,
    mapLegacyResourceId,
    isLegacyGeneratedOperation,
    findMesOperationReplacement,
    mergeMesOperationMap,
    normalizeMesRouteEntity,
    replaceLegacyOrganizationTerms,
    normalizeDirectoryOrganizationTerminology,
    applyMesOrgStructureDefaults,
    buildDefaultProductionResources,
    getProductionResources,
    getProductionResource,
    resourceParticipatesInPlanning,
    resourceParticipatesInCalculation,
    getProductionResourcesForWorkCenter,
    makeFallbackProductionResource,
    normalizeUnitType,
    isPlanningWorkCenter,
    getPlanningWorkCenters,
    isRouteInstructionWorkCenter,
    getRouteInstructionWorkCenters,
    normalizeWorkSchedule,
    normalizeWorkMode,
    getDefaultWorkMode,
    formatWorkShift,
    getWorkCalendarLabel,
    normalizeWorkCenterUnit,
    getLegacyDepartmentTargetCenterId,
    getUnifiedUnitName,
    migrateSpecificationDepartmentNames,
    migrateDepartmentsToUnifiedWorkCenters,
    migrateProjectEntityToSpecifications,
    notifySaveSuccess,
    renderPendingSaveFeedback,
    scheduleGlobalSaveUxRefresh,
    getMesSignalMeta,
    mountGlobalVisualSystem,
    mountVisualModeTray,
    getFormControlSignatureEntry,
    getFormSignature,
    isUnsavedCreateForm,
    setSaveButtonDisabled,
    bindGlobalFormDirtyTracking,
    normalizeOptionalPositiveInteger,
    normalizeGanttDependencyRouteStore,
    cloneGanttDependencyRouteStore,
    normalizePlanningLaborNoteByRow,
    normalizePlanningOrderLaborByStepId,
    normalizePlanningLegacyManualLaborByStep,
    isDeepLinkDirectorySectionId,
    normalizeDeepLinkModuleId,
    normalizeStoredModuleId,
    getAuthGateSessionDateKey,
    getAuthGateSessionExpiresAt,
    getAuthGateSession,
    getAuthGateSessionUnlocked,
    setAuthGateSessionUnlocked,
    applyAuthGateSession,
    isAuthGateQaBypassEnabled,
    isAdminRuntimeHost,
    isAuthGateUnlocked,
    lockAuthGate,
    unlockAuthGate,
    ensureAuthGateModule,
    getUrlUiOverrides,
    applyUrlUiOverrides,
    normalizeShiftMasterBoardSwimlane,
    normalizeShiftMasterBoardFocus,
    normalizeShiftMasterBoardLane,
    normalizePlainRecord,
    normalizeShiftMasterAssignmentScopeMode,
    normalizeIdList,
    normalizeShiftMasterAssignmentMatrix,
    normalizeShiftMasterBoardRiskReason,
    getShiftMasterBoardRiskLabel,
    syncUiWithUrlParams,
    updateModuleUrlParam,
    loadUiState,
    persistUiState,
    getPlanningOrderLaborKey,
    getPlanningOrderLaborSlotFields,
    parsePlanningOrderLaborKey,
    setPlanningOrderLaborSetting,
    migratePlanningManualLaborUiToRoutes,
    persistAuthState,
    normalizeDirectoryState,
    normalizeDirectoryRow,
    shouldKeepDirectoryRow,
    isBlankDirectoryRow,
    mergeMesWorkCenters,
    syncProductionStructureMatrixToPlanningState,
    buildLegacyBatchRouteIdMap,
    getSlotRouteId,
    getSlotPlanningOrderId,
    getSlotProductionContextId,
    slotMatchesProductionContext,
    slotMatchesPlanningOrder,
    normalizeSlotOrderLink,
    getRouteStepSlotDeduplicationScore,
    compareRouteStepSlotKeepPriority,
    dedupeRouteStepSlots,
    normalizePlanningState,
    isCompletePlanningLaborSetting,
    buildPlanningLaborSettingFromSlot,
    getLegacySlotPlanningLaborDurationMs,
    migrateLegacySlotToPlanningOrderLabor,
    repairPlanningOrderLaborStoresFromSlots,
    normalizePlanningSlotResourceLink,
    normalizeShiftMasterRecordMap,
    pruneSlotLinkedRecordMap,
    normalizeShiftMasterExecutorQuantity,
    normalizeShiftMasterFactQuantity,
    normalizeShiftMasterExecutors,
    normalizeShiftMasterAssignment,
    normalizeDispatchFact,
    normalizeDispatchLaborMinutes,
    normalizeDispatchExecutorCount,
    normalizeDispatchLaborSource,
    normalizePlanningCorrection,
    normalizeWarehouseQuantity,
    removeCanceledRouteGanttSlots,
    getWorkCenterUnitsPerHour,
    normalizeQuantity,
    normalizeBoardsPerPanel,
    workCenterUsesPanelBatching,
    getSpecificationItemBoardsPerPanel,
    getRouteStepBoardsPerPanel,
    toSlotDateTime,
    getRuntimePlanningState,
    getRuntimeDirectoryState,
    getDurationWorkCenter,
    getDurationResourcesForWorkCenter,
    isSmtOperationWorkCenter,
    getDefaultOperationCalculationType,
    normalizeRouteStepCalculationFields,
    getDurationOperationContext,
    getOperationSetupMs,
    getDurationBomList,
    getDurationComponentTypes,
    getDurationComponentCounts,
    parseCapacityCount,
    getWorkCenterManualCapacity,
    calculateManualLaborDurationMs,
    calculateNormativeSerialDurationMs,
    calculateRateDurationMs,
    normalizePlanningLaborPositiveNumber,
    calculatePlanningOrderLaborDurationMs,
    calculateRequiredDurationMs,
    calculatePlannedEndByQuantity,
    calculateQuantityByDuration,
    getSlotEffectiveOperationContext,
    getSlotRequiredDurationMs,
    recalculateSlotEndByQuantity,
    applyPlanningOrderLaborToSlot,
    applyRecalculatedSlotTiming,
    rescheduleSlotsForWorkCenterCalendarChange,
    rescheduleAllGanttSlotsByCurrentCalendars,
    getRouteBufferMs,
    getWorkCenterCapacity,
    getSlotStepOrder,
    getSlotRouteTaskId,
    getOrderedPlanningOrderSlots,
    getRouteNeighbor,
    getRoutePlanningOrderSlots,
    normalizeRouteFlowLaunchMode,
    getPlanningTransferBatchQuantity,
    getRouteFlowLaunchSettings,
    getRouteBranchCompletionSlots,
    getSlotReadyAtQuantity,
    getSlotProducedQuantityAt,
    getSlotSystemTransferEvent,
    getRoutePlanningOrderWipBranchDetails,
    getRoutePlanningOrderAvailableKitCount,
    getMainRouteDependencyReadiness,
    getMainRouteDependencyReadyAt,
    alignMainRouteSlotsAfterBranches,
    alignRouteMainSlotsAfterBranches,
    getGanttChainKey,
    getGanttWorkOrderKey,
    buildGanttChainCompactionGroups,
    compactVisibleGanttChains,
    getGanttOptimizationWorkOrders,
    getEarliestRouteStart,
    getPlannedStepIds,
    buildBacklogItems,
    windowsOverlap,
    isWindowAvailable,
    findFreeWindow,
    getGanttSnapMs,
    normalizeGanttZoom,
    getGanttZoomIndex,
    getGanttZoomPercent,
    setGanttZoom,
    normalizeGanttSlotContent,
    getGanttSlotContentMode,
    buildGanttScaleInfo,
    getGanttSnapScaleInfo,
    getGanttSnapWidth,
    getGanttDependencyArrowLength,
    getGanttDependencyEntryWidth,
    getTimelineCount,
    getEarliestPlannedSlotStart,
    getGanttWindowAnchorForSlot,
    alignGanttWindowToPlan,
    getVisiblePlanningProjects,
    getVisibleGanttRoutes,
    isGanttRouteExpanded,
    areAllVisibleProjectsExpanded,
    extendTimelineIfNeeded,
    prependTimelineIfNeeded,
    cascadeBatchFromSlot,
    cascadeIfEnabled,
    getProjectDeadlineState,
    resetRemovedGanttFilters,
  };

  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, function planningCoreServiceEntry(...args) {
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
