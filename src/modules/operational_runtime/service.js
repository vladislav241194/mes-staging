import { formatPersonDisplayName } from "../../ui/formatters.js";

export function getRouteTaskTypeLabel(task = {}) {
  if (task?.isMain) return "маршрут";
  if (task?.isOrphan) return "проверить";
  if (task?.fulfillmentMode === "from_stock") return "склад";
  if (task?.type === "bom") return "плата";
  if (task?.type === "specification") return "состав изделия";
  if (task?.type === "assembly") return "изготавливаемая позиция";
  if (task?.type === "nomenclature" || task?.type === "part") return "позиция";
  return "задача";
}

export function createOperationalRuntimeServiceModule(dependencies = {}) {
  const {
    ACCESS_ROLE_ACTIONS,
    ACCESS_ROLE_IDS,
    ACCESS_ROLE_SCOPES,
    APP_VERSION,
    BOARD_BOM_TERM,
    BOARD_SPEC_TERM,
    DEFAULT_INTERFACE_ROLE_ID,
    DISPATCH_FACT_STATUS_OPTIONS,
    GANTT_SLOT_STATUS_LABELS,
    GANTT_SLOT_STATUS_VALUES,
    MAIN_ROUTE_TASK_ID,
    MES_MODULE_BLUEPRINT_REGISTRY = [],
    MES_MODULE_NAVIGATION_GROUPS = [],
    MES_MODULE_NAVIGATION_REGISTRY = [],
    WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY,
    WORK_ORDER_PLANNING_STATUS_VALUES,
    app,
    blockProtectedDestructiveAction,
    buildMesDocumentContract,
    buildMesFlowEvent,
    byId,
    defaultUiState,
    directorySectionGroups,
    directorySections,
    escapeAttribute,
    escapeHtml,
    findMesOperationReplacement,
    formatTimesheetHours = (value = 0) => String(Number(value || 0)),
    fromDateInput,
    getAuthGateSession,
    getBomList = () => null,
    getBomResultNomenclatureItem = () => null,
    getCalendarWorkCenterId = (value) => value,
    getDefaultOperationCalculationType,
    getDefaultSecondsPerPanel,
    getFulfillmentLabel,
    getFulfillmentMeta,
    getFulfillmentTone,
    getMainRouteDependencyReadiness,
    getMesFlowTransitionView,
    getMesModuleFlowContract,
    getMesStatusView,
    getOperationRouteWorkCenterId,
    getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
    getPlanningResourceForRouteStep,
    getPlanningRouteQuantity,
    getPlanningShiftSlotTimeLabel,
    getPlanningTasksForRoute,
    getPersonnelCalendarModel = () => null,
    getProductionResource,
    getProductionResourceWorkCenterId,
    getProductionResourcesForWorkCenter,
    getProductionStructureEmployees,
    getProductionStructureExecutorRows,
    getProductionStructureMatrixRuntimeOverrides = () => ({}),
    getProductionStructureMasterProfiles,
    getProductionStructureWorkCenters,
    getProjectDisplayName,
    getProjectDisplayOutput,
    getRouteConcreteTasksForPlanning,
    getRouteFlowLaunchSettings,
    getRouteInstructionWorkCenterId,
    getRouteInstructionWorkCenters,
    getRoutePlanningBatches,
    getRoutePlanningContext,
    getRouteSpecification = () => null,
    getRoutePlanningOrderAvailableKitCount,
    getRoutePlanningOrderWipBranchDetails,
    getRouteBomList = () => null,
    getRouteStepFlowModel,
    getRouteStepPlanningTask,
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteStepsForModule,
    getRouteStepsForPlanningTask,
    getRouteStepsForTask,
    getRouteTaskInputObjectLabel,
    getRouteTaskProducedObjectLabel,
    getShiftMasterBoardModel = () => ({ lanes: [] }),
    getSlotEffectiveOperationContext,
    getSlotOperationFlow,
    getSlotPlanningOrderId,
    getSlotProducedQuantityAt,
    getSlotGanttWorkCenterId = () => "",
    getSlotRoute = () => null,
    getSlotRouteId,
    getTimesheetCell = () => ({ value: "work", code: "work", hours: 8, overtime: 0 }),
    getTimesheetDayOption = (value = "work") => ({ value, label: value }),
    getTimesheetEmployeeSchedule = () => null,
    projectEmployeeAvailability = () => null,
    getSpecificationItemFulfillmentMode,
    getSpecificationItemBomId = () => "",
    getSpecificationStructureItems,
    getSpekiStructureItemLabel = (item = {}) => item?.name || item?.title || "",
    getSpekiStructureTableRows = () => [],
    getWorkCenter,
    getWorkCenterUnitsPerHour,
    icon,
    inferAccessRoleIdForPerson = () => DEFAULT_INTERFACE_ROLE_ID,
    isAdminRuntimeHost,
    isAuthGateQaBypassEnabled,
    isManufacturingOutputReceiptRouteStep,
    isManufacturingOutputReceiptSlot,
    isSchedulableFulfillmentMode,
    isSmtOperationWorkCenter,
    isWarehouseWorkCenterId,
    joinRouteStepFlowLabels,
    makeFallbackProductionResource,
    mapLegacyWorkCenterId,
    mergeMesOperationMap,
    normalizeDeepLinkModuleId,
    normalizeDateInput = (value = "") => String(value || ""),
    normalizeDirectoryRow,
    normalizeDirectoryState,
    normalizeLookupText = (value = "") => String(value || "").trim().toLowerCase(),
    normalizePlanningState,
    normalizeQuantity,
    normalizeRouteStepCalculationFields,
    normalizeShiftMasterAssignmentMatrix,
    normalizeShiftMasterFactQuantity,
    normalizeStructureFulfillmentMode,
    normalizeWarehouseQuantity,
    persistDirectoryState,
    persistState,
    recalculateSlotEndByQuantity,
    resolveWorkCenterIdFromName,
    routeStepRequiresManualPlanningLine,
    startOfDay,
    toDate,
    toDateInput,
  } = dependencies;

  let ui = dependencies.getUi?.() ?? {};
  let planningState = dependencies.getPlanningState?.() ?? {};
  let directoryState = dependencies.getDirectoryState?.() ?? {};
  let planningRouteStructureSidebarFrame = dependencies.getPlanningRouteStructureSidebarFrame?.() ?? 0;

  function syncRuntimeState() {
    ui = dependencies.getUi?.() ?? ui ?? {};
    planningState = dependencies.getPlanningState?.() ?? planningState ?? {};
    directoryState = dependencies.getDirectoryState?.() ?? directoryState ?? {};
    planningRouteStructureSidebarFrame = dependencies.getPlanningRouteStructureSidebarFrame?.() ?? planningRouteStructureSidebarFrame ?? 0;
  }

  function commitRuntimeState() {
    dependencies.setUi?.(ui);
    dependencies.setPlanningState?.(planningState);
    dependencies.setDirectoryState?.(directoryState);
    dependencies.setPlanningRouteStructureSidebarFrame?.(planningRouteStructureSidebarFrame);
  }

function getOperationMapRows({ includeInactive = true } = {}) {
  return [...(directoryState?.operationMap || [])]
    .filter((item) => item && item.id)
    .filter((item) => includeInactive || item.status !== "Отключен")
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru"));
}

function getOperationMapItem(operationId) {
  const item = getOperationMapRows().find((row) => row.id === operationId) || null;
  if (item?.legacyAliasOf && item.legacyAliasOf !== item.id) {
    return getOperationMapRows().find((row) => row.id === item.legacyAliasOf) || item;
  }
  return item;
}

function findOperationMapItemByNameAndWorkCenter(operationName = "", workCenterId = "") {
  const normalizedName = normalizeLookupText(operationName);
  const routeWorkCenterId = getRouteInstructionWorkCenterId(workCenterId);
  if (!normalizedName) return null;
  const rows = getOperationMapRows();
  const exact = rows.find((operation) => (
    normalizeLookupText(operation.name) === normalizedName
    && (!routeWorkCenterId || getOperationRouteWorkCenterId(operation) === routeWorkCenterId)
  ));
  if (exact) return exact;
  const nameMatches = rows.filter((operation) => normalizeLookupText(operation.name) === normalizedName);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

function getLegacyOperationWorkCenterId(source = {}) {
  const explicitWorkCenterId = String(source.workCenterId || "").trim();
  if (explicitWorkCenterId && getWorkCenter(explicitWorkCenterId)) return explicitWorkCenterId;
  return resolveWorkCenterIdFromName(source.departmentName || source.department || source.workCenter || "")
    || resolveWorkCenterIdFromName(source.operationName || source.name || "")
    || getRouteInstructionWorkCenters({ includeWarehouse: false })[0]?.id
    || "D5";
}

function ensureOperationMapItemFromLegacyOperation(source = {}, stamp = new Date().toISOString()) {
  const existingById = source.operationId ? getOperationMapItem(source.operationId) : null;
  if (existingById) return existingById;
  const mesReplacement = findMesOperationReplacement(source);
  if (mesReplacement) return getOperationMapItem(mesReplacement.id) || normalizeDirectoryRow("operations", mesReplacement);

  const operationName = String(source.name || source.operationName || "").trim();
  if (!operationName) return null;

  const workCenterId = getLegacyOperationWorkCenterId(source);
  const existingByName = findOperationMapItemByNameAndWorkCenter(operationName, workCenterId);
  if (existingByName) return existingByName;

  return null;
}

function applyOperationMapItemToRouteStep(step = {}, operation = {}, stamp = new Date().toISOString()) {
  const workCenterId = getOperationRouteWorkCenterId(operation) || step.workCenterId || getRouteInstructionWorkCenters({ includeWarehouse: false })[0]?.id || "D5";
  const planningCandidates = getPlanningCandidateWorkCenterIdsForRouteWorkCenter(workCenterId, operation, planningState);
  const singlePlanningWorkCenterId = planningCandidates.length === 1 ? planningCandidates[0] : "";
  const explicitPlanningWorkCenterId = mapLegacyWorkCenterId(step.planningWorkCenterId || "");
  const selectedPlanningWorkCenterId = explicitPlanningWorkCenterId && planningCandidates.includes(explicitPlanningWorkCenterId)
    ? explicitPlanningWorkCenterId
    : singlePlanningWorkCenterId;
  const resourceId = selectedPlanningWorkCenterId
    ? getPlanningResourceForRouteStep({ ...step, workCenterId }, selectedPlanningWorkCenterId, step.resourceId)
    : "";
  const resource = resourceId ? getProductionResource(resourceId) : null;
  const calculationType = step.calculationType || getDefaultOperationCalculationType(workCenterId, operation);
  return normalizeRouteStepCalculationFields({
    ...step,
    operationId: operation.id || "",
    operationName: operation.name || "",
    workCenterId,
    planningWorkCenterId: selectedPlanningWorkCenterId && planningCandidates.length > 1 ? selectedPlanningWorkCenterId : "",
    workCenterOverride: false,
    unitsPerHour: operation.unitsPerHour || step.unitsPerHour || getWorkCenterUnitsPerHour(workCenterId),
    resourceId,
    calculationType,
    secondsPerPanel: calculationType === "manual" || calculationType === "normative"
      ? Number(step.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, step.boardsPerPanel || 1))
      : Number(step.secondsPerPanel || 0),
    setupMin: Math.max(0, Number(step.setupMin ?? resource?.changeoverMin ?? 0)),
    requiresBatch: operation.requiresBatch,
    isWarehouseOperation: operation.isWarehouse,
    updatedAt: stamp,
  }, planningState);
}

function getDefaultOperationNameForWorkCenter(center = {}) {
  const normalizedName = normalizeLookupText(center.name || "");
  const normalizedCode = normalizeLookupText(center.code || "");

  if (center.id === "warehouse" || center.unitType === "warehouse" || normalizedName.includes("склад")) {
    return "Поступление из производства";
  }
  if (normalizedName.includes("smt") || normalizedCode.includes("smt")) return "SMT-монтаж компонентов";
  if (normalizedName.includes("aoi") || normalizedCode.includes("aoi")) return "AOI-контроль";
  if (normalizedName.includes("отмыв")) return "Отмывка плат";
  if (normalizedName.includes("ручн")) return "Ручной монтаж компонентов";
  if (normalizedName.includes("тест") || normalizedName.includes("испыт")) return "Функциональное тестирование";
  if (normalizedName.includes("лакир")) return "Лакировка";
  if (normalizedName.includes("слесар") || normalizedName.includes("механ")) return "Слесарная подготовка";
  if (normalizedName.includes("сбор")) return "Финальная сборка";
  if (normalizedName.includes("отк") || normalizedName.includes("контрол")) return "Контроль качества";
  if (normalizedName.includes("планир")) return "Планирование производства";
  if (normalizedName.includes("программ")) return "Программирование";
  if (normalizedName.includes("закуп") || normalizedName.includes("снабжен")) return "Закупка материалов";

  return `Работа отдела ${center.name || center.code || "без названия"}`;
}

function makeDefaultOperationCode(center = {}) {
  const source = String(center.code || center.id || "OP")
    .toUpperCase()
    .replace(/[^A-ZА-Я0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return `OP-${source || "UNIT"}`;
}

function ensureWorkCenterOperations() {
  const nextOperationMap = mergeMesOperationMap(directoryState.operationMap);
  if (JSON.stringify(nextOperationMap) !== JSON.stringify(directoryState.operationMap || [])) {
    directoryState.operationMap = nextOperationMap;
    directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
    persistDirectoryState();
  }

  localStorage.setItem(WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY, "1");
}

function migrateLegacyOperationsToDirectory() {
  const stamp = new Date().toISOString();
  const initialOperationCount = (directoryState.operationMap || []).length;
  let planningChanged = false;
  let directoryChanged = false;

  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    const operation = getOperationMapItem(step.operationId)
      || ensureOperationMapItemFromLegacyOperation(step, stamp);
    if (!operation) return step;
    const nextStep = applyOperationMapItemToRouteStep(step, operation, stamp);
    const changed = [
      "operationId",
      "operationName",
      "workCenterId",
      "unitsPerHour",
      "resourceId",
      "calculationType",
      "secondsPerPanel",
      "setupMin",
      "requiresBatch",
      "isWarehouseOperation",
    ].some((key) => String(step[key] ?? "") !== String(nextStep[key] ?? ""));
    if (changed) planningChanged = true;
    return changed ? nextStep : step;
  });

  const routeStepById = new Map((planningState.routeSteps || []).map((step) => [step.id, step]));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const step = routeStepById.get(slot.routeStepId);
    if (!step || !step.operationId) return slot;
    const nextSlot = recalculateSlotEndByQuantity({
      ...slot,
      operationId: step.operationId || slot.operationId || "",
      operationName: step.operationName || slot.operationName,
      workCenterId: step.workCenterId || slot.workCenterId,
      unitsPerHour: step.unitsPerHour || slot.unitsPerHour,
      resourceId: step.resourceId || slot.resourceId || "",
      calculationType: step.calculationType || slot.calculationType || "",
      secondsPerPanel: step.secondsPerPanel || slot.secondsPerPanel || 0,
      setupMin: step.setupMin || slot.setupMin || 0,
      bomListId: step.bomListId || slot.bomListId || "",
      updatedAt: stamp,
    }, planningState);
    const changed = ["operationId", "operationName", "workCenterId", "unitsPerHour", "resourceId", "calculationType", "secondsPerPanel", "setupMin", "bomListId"]
      .some((key) => String(slot[key] ?? "") !== String(nextSlot[key] ?? ""));
    if (changed) planningChanged = true;
    return changed ? nextSlot : slot;
  });

  directoryState.specifications = (directoryState.specifications || []).map((specification) => {
    if (!Array.isArray(specification.structureItems) || !specification.structureItems.length) return specification;
    let specificationChanged = false;
    const structureItems = specification.structureItems.map((item) => {
      if (!isSchedulableFulfillmentMode(item.fulfillmentMode || item.executionType || "")) return item;
      const operation = getOperationMapItem(item.operationId)
        || ensureOperationMapItemFromLegacyOperation({
          operationName: item.operationName,
          departmentName: item.departmentName,
        }, stamp);
      if (!operation) return item;
      const center = getWorkCenter(operation.workCenterId);
      const nextItem = {
        ...item,
        operationId: operation.id,
        operationName: operation.name || "",
        departmentName: center?.name || item.departmentName || "",
      };
      const changed = ["operationId", "operationName", "departmentName"]
        .some((key) => String(item[key] ?? "") !== String(nextItem[key] ?? ""));
      if (changed) specificationChanged = true;
      return changed ? nextItem : item;
    });
    if (!specificationChanged) return specification;
    directoryChanged = true;
    return { ...specification, structureItems, updatedAt: stamp };
  });

  directoryChanged = directoryChanged || initialOperationCount !== (directoryState.operationMap || []).length;

  if (directoryChanged) {
    directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
    persistDirectoryState();
  }
  if (planningChanged) {
    planningState = normalizePlanningState(planningState);
    persistState();
  }
}

function formatWarehouseQuantity(value, unit = "шт.") {
  const quantity = Number(value || 0);
  const text = quantity.toLocaleString("ru-RU", {
    maximumFractionDigits: quantity % 1 ? 3 : 0,
  });
  return `${text} ${unit || "шт."}`;
}

function stripWarehouseReceiptLabel(label = "") {
  return String(label || "")
    .replace(/^Складской остаток:\s*/i, "")
    .replace(/^Готовый выпуск:\s*/i, "")
    .trim();
}

function normalizeWarehouseLookupText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getWarehouseNomenclatureIdByExactLabel(label = "") {
  const lookup = normalizeWarehouseLookupText(stripWarehouseReceiptLabel(label));
  if (!lookup) return "";
  const item = (directoryState.nomenclature || []).find((entry) => (
    normalizeWarehouseLookupText(entry.name) === lookup
    || normalizeWarehouseLookupText(entry.article) === lookup
  ));
  return item?.id || "";
}

function getWarehouseNomenclatureIdForRouteTask(task = {}) {
  if (!task) return "";
  if (task.nomenclatureItemId) return task.nomenclatureItemId;
  if (task.bomListId || task.type === "bom") {
    return getBomResultNomenclatureItem(task.bomListId || task.sourceItemId)?.id || "";
  }
  if ((task.type === "nomenclature" || task.type === "part") && task.sourceSpecificationId && task.sourceItemId) {
    const specification = getSpecificationById(task.sourceSpecificationId);
    const item = getSpecificationStructureItems(specification).find((entry) => entry.id === task.sourceItemId);
    return getWarehouseNomenclatureIdForSpecificationItem(item);
  }
  return "";
}

function getWarehouseNomenclatureIdForReceiptOutput(output = {}, route = null) {
  const sourceId = String(output?.sourceId || "");
  if (!sourceId) return "";

  if (output.sourceType === "bom-result" || output.sourceType === "bom" || sourceId.startsWith("bom")) {
    const directBom = getBomList(sourceId);
    if (directBom) return getBomResultNomenclatureItem(directBom.id)?.id || "";
  }

  const routeSpecification = getRouteSpecification(route);
  const structureItem = getSpecificationStructureItems(routeSpecification).find((item) => item.id === sourceId);
  if (structureItem) return getWarehouseNomenclatureIdForSpecificationItem(structureItem);

  return "";
}

function getWarehouseProductionReceiptNomenclatureId(slot = {}, route = null, step = null, task = null, flow = null) {
  const context = getSlotEffectiveOperationContext(slot);
  const contextBomId = context.bomListId || slot.bomListId || task?.bomListId || "";
  if (contextBomId) {
    const bomResultItem = getBomResultNomenclatureItem(contextBomId);
    if (bomResultItem) return bomResultItem.id;
  }

  const taskItemId = getWarehouseNomenclatureIdForRouteTask(task);
  if (taskItemId) return taskItemId;

  const receiptOutput = (flow?.outputs || []).find((output) => output.sourceType === "warehouse-receipt")
    || (flow?.outputs || [])[0];
  const outputItemId = getWarehouseNomenclatureIdForReceiptOutput(receiptOutput, route);
  if (outputItemId) return outputItemId;

  return getWarehouseNomenclatureIdByExactLabel(
    receiptOutput?.label || slot.operationOutputLabel || flow?.outputLabel || task?.title || "",
  );
}

function getWarehouseProductionReceiptRows() {
  return (planningState.slots || [])
    .filter((slot) => isManufacturingOutputReceiptSlot(slot))
    .map((slot) => {
      const route = getSlotRoute(slot);
      const step = (planningState.routeSteps || []).find((item) => item.id === slot.routeStepId) || null;
      const task = route && step ? getRouteStepPlanningTask(route, step) : null;
      const flow = getSlotOperationFlow(slot, route, step);
      const itemId = getWarehouseProductionReceiptNomenclatureId(slot, route, step, task, flow);
      const item = getNomenclatureItem(itemId);
      const operationOutput = stripWarehouseReceiptLabel(slot.operationOutputLabel || flow.outputLabel);
      const name = item?.name || operationOutput || task?.title || route?.name || "Результат производства";
      const quantity = normalizeWarehouseQuantity(slot.quantity || 0);
      const producedQuantity = Math.min(quantity, normalizeWarehouseQuantity(getSlotProducedQuantityAt(slot, ui.now)));
      return {
        id: slot.id,
        slotId: slot.id,
        routeId: route?.id || getSlotRouteId(slot, planningState),
        routeName: route?.name || "Заказ-наряд не выбран",
        operationName: slot.operationName || step?.operationName || "Поступление из производства",
        itemId,
        item,
        name,
        article: item?.article || "",
        type: item ? normalizeNomenclatureType(item.type) : "нет связи с номенклатурой",
        unit: item?.unit || task?.unit || "шт.",
        quantity,
        producedQuantity,
        status: getGanttSlotStatusView(slot).value || "planned",
        plannedStart: slot.plannedStart || "",
        plannedEnd: slot.plannedEnd || "",
        outputLabel: operationOutput,
      };
    })
    .filter((row) => row.quantity > 0)
    .sort((left, right) => (
      toDate(left.plannedEnd) - toDate(right.plannedEnd)
      || left.name.localeCompare(right.name, "ru")
    ));
}

function getWarehouseBalanceRows() {
  const itemById = new Map((directoryState.nomenclature || []).map((item) => [item.id, item]));
  const rowsByItem = new Map();

  const ensureRow = (itemId) => {
    const item = itemById.get(itemId);
    const existing = rowsByItem.get(itemId);
    if (existing) return existing;
    const row = {
      itemId,
      item,
      name: item?.name || "Номенклатура не выбрана",
      article: item?.article || "",
      type: item ? normalizeNomenclatureType(item.type) : "нет связи",
      unit: item?.unit || "шт.",
      incoming: 0,
      outgoing: 0,
      onHand: 0,
      reserved: 0,
      productionIncoming: 0,
      productionAcceptedNow: 0,
      available: 0,
      availableWithProduction: 0,
      shortage: 0,
    };
    rowsByItem.set(itemId, row);
    return row;
  };

  getWarehouseProductionReceiptRows().forEach((receipt) => {
    if (!receipt.itemId) return;
    const row = ensureRow(receipt.itemId);
    row.productionIncoming += normalizeWarehouseQuantity(receipt.quantity);
    row.productionAcceptedNow += normalizeWarehouseQuantity(receipt.producedQuantity);
  });

  return [...rowsByItem.values()]
    .map((row) => {
      const available = row.onHand - row.reserved;
      const productionIncoming = Math.max(0, row.productionIncoming);
      return {
        ...row,
        incoming: Math.max(0, row.incoming),
        outgoing: Math.max(0, row.outgoing),
        onHand: Math.max(0, row.onHand),
        productionIncoming,
        productionAcceptedNow: Math.max(0, row.productionAcceptedNow),
        available: Math.max(0, available),
        availableWithProduction: Math.max(0, available + productionIncoming),
        shortage: Math.max(0, -available),
      };
    })
    .sort((left, right) => (
      Number(right.shortage > 0) - Number(left.shortage > 0)
      || right.productionIncoming - left.productionIncoming
      || right.available - left.available
      || left.name.localeCompare(right.name, "ru")
    ));
}

function getWarehouseBalanceForNomenclature(nomenclatureItemId) {
  return getWarehouseBalanceRows().find((row) => row.itemId === nomenclatureItemId) || null;
}

function getShiftMasterProfiles() {
  return getProductionStructureMasterProfiles(getProductionStructureMatrixRuntimeOverrides());
}

function getShiftMasterEmployeeRows() {
  return getProductionStructureExecutorRows(getProductionStructureMatrixRuntimeOverrides()).map((employee, index) => ({
    ...employee,
    timesheetSourceIndex: index,
  }));
}

function getShiftMasterProfile(masterId = ui.activeShiftMasterId) {
  const profiles = getShiftMasterProfiles();
  return profiles.find((profile) => profile.id === masterId) || profiles[0] || null;
}

function shiftMasterProfileOwnsWorkCenter(profile = null, workCenterId = "") {
  if (!profile) return true;
  const normalizedId = mapLegacyWorkCenterId(getCalendarWorkCenterId(workCenterId) || workCenterId);
  const profileIds = new Set((profile.workCenterIds || [])
    .map((id) => mapLegacyWorkCenterId(getCalendarWorkCenterId(id) || id))
    .filter(Boolean));
  if (!normalizedId || !profileIds.size) return false;
  if (profileIds.has(normalizedId)) return true;

  const workCenterById = new Map((planningState.workCenters || []).map((center) => [center.id, center]));
  let current = workCenterById.get(normalizedId);
  const visited = new Set();
  while (current?.parentWorkCenterId && !visited.has(current.id)) {
    visited.add(current.id);
    const parentId = mapLegacyWorkCenterId(getCalendarWorkCenterId(current.parentWorkCenterId) || current.parentWorkCenterId);
    if (profileIds.has(parentId)) return true;
    current = workCenterById.get(parentId);
  }
  return false;
}

function getShiftMasterProfilesForWorkCenter(workCenterId = "") {
  return getShiftMasterProfiles().filter((profile) => shiftMasterProfileOwnsWorkCenter(profile, workCenterId));
}

function getShiftMasterProfileForPerson(person = null, profiles = getShiftMasterProfiles()) {
  if (!person?.id) return null;
  const normalizedName = normalizeLookupText(person.name || "");
  return profiles.find((profile) => profile.id === person.id)
    || profiles.find((profile) => profile.matrixId && profile.matrixId === person.matrixId)
    || profiles.find((profile) => normalizedName && normalizeLookupText(profile.name || "") === normalizedName)
    || null;
}

function getShiftMasterBoardAccessContext(profiles = getShiftMasterProfiles()) {
  const role = getActiveInterfaceRole();
  const person = getAuthenticatedAccessPerson();
  const canSelectMaster = ["admin", "productionHead"].includes(role?.id);
  const authenticatedMasterProfile = getShiftMasterProfileForPerson(person, profiles);
  const scopedMasterProfile = role?.id === "master"
    ? authenticatedMasterProfile || getShiftMasterProfile(ui.activeShiftMasterId)
    : null;
  const activeProfile = scopedMasterProfile || getShiftMasterProfile(ui.activeShiftMasterId);

  if (scopedMasterProfile?.id && ui.activeShiftMasterId !== scopedMasterProfile.id) {
    ui.activeShiftMasterId = scopedMasterProfile.id;
  }

  return {
    role,
    person,
    canSelectMaster,
    scopedMasterProfile,
    activeProfile,
    isScopedToMaster: Boolean(scopedMasterProfile?.id),
  };
}

function getShiftMasterEmployeesForWorkCenter(workCenterId = "") {
  const normalizedId = mapLegacyWorkCenterId(getCalendarWorkCenterId(workCenterId) || workCenterId);
  return getShiftMasterEmployeeRows().filter((employee) => (
    employee.workCenterIds || []
  ).some((id) => mapLegacyWorkCenterId(getCalendarWorkCenterId(id) || id) === normalizedId));
}

function getShiftMasterNormalizedWorkCenterId(workCenterId = "") {
  return mapLegacyWorkCenterId(getCalendarWorkCenterId(workCenterId) || workCenterId);
}

function getShiftMasterWorkCenterCatalog() {
  const byId = new Map();
  [
    ...(planningState.workCenters || []),
    ...getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides()),
  ].forEach((center) => {
    const id = getShiftMasterNormalizedWorkCenterId(center?.id || "");
    if (!id) return;
    byId.set(id, {
      ...center,
      id,
      parentWorkCenterId: getShiftMasterNormalizedWorkCenterId(center?.parentWorkCenterId || ""),
    });
  });
  return [...byId.values()];
}

function getShiftMasterDescendantWorkCenterIds(workCenterIds = []) {
  const result = new Set((Array.isArray(workCenterIds) ? workCenterIds : [workCenterIds])
    .map(getShiftMasterNormalizedWorkCenterId)
    .filter(Boolean));
  if (!result.size) return result;

  const centers = getShiftMasterWorkCenterCatalog();
  let changed = true;
  while (changed) {
    changed = false;
    centers.forEach((center) => {
      if (!center.id || result.has(center.id)) return;
      if (center.parentWorkCenterId && result.has(center.parentWorkCenterId)) {
        result.add(center.id);
        changed = true;
      }
    });
  }
  return result;
}

function shiftMasterEmployeeMatchesWorkCenterScope(employee = {}, scopeIds = new Set()) {
  if (!scopeIds?.size) return false;
  return (employee.workCenterIds || [])
    .map(getShiftMasterNormalizedWorkCenterId)
    .some((id) => id && scopeIds.has(id));
}

function sortShiftMasterAssignableEmployees(employees = []) {
  return [...employees].sort((left, right) => (
    String(left.department || "").localeCompare(String(right.department || ""), "ru")
    || String(left.role || "").localeCompare(String(right.role || ""), "ru")
    || String(left.name || "").localeCompare(String(right.name || ""), "ru")
  ));
}

function getShiftMasterAssignmentConfig(masterId = "") {
  const store = normalizeShiftMasterAssignmentMatrix(ui.shiftMasterAssignmentMatrix);
  return store[String(masterId || "").trim()] || { mode: "department", employeeIds: [], updatedAt: "" };
}

function getShiftMasterDefaultEmployeeScope(profile = null) {
  if (!profile) return [];
  const scopeIds = getShiftMasterDescendantWorkCenterIds(profile.workCenterIds || []);
  return sortShiftMasterAssignableEmployees(
    getShiftMasterEmployeeRows().filter((employee) => shiftMasterEmployeeMatchesWorkCenterScope(employee, scopeIds)),
  );
}

function getShiftMasterAssignableEmployees(masterProfile = null, workCenterId = "") {
  const allEmployees = sortShiftMasterAssignableEmployees(getShiftMasterEmployeeRows());
  if (!masterProfile?.id) {
    const exactRows = getShiftMasterEmployeesForWorkCenter(workCenterId);
    return exactRows.length ? sortShiftMasterAssignableEmployees(exactRows) : allEmployees;
  }

  const config = getShiftMasterAssignmentConfig(masterProfile.id);
  if (config.mode === "all") return allEmployees;

  if (config.mode === "manual") {
    const byId = new Map(allEmployees.map((employee) => [employee.id, employee]));
    const manualEmployees = sortShiftMasterAssignableEmployees(config.employeeIds.map((id) => byId.get(id)).filter(Boolean));
    return manualEmployees.length ? manualEmployees : getShiftMasterDefaultEmployeeScope(masterProfile);
  }

  if (config.mode === "workCenter") {
    const exactScopeIds = workCenterId
      ? getShiftMasterDescendantWorkCenterIds([workCenterId])
      : getShiftMasterDescendantWorkCenterIds(masterProfile.workCenterIds || []);
    const scopedEmployees = sortShiftMasterAssignableEmployees(
      allEmployees.filter((employee) => shiftMasterEmployeeMatchesWorkCenterScope(employee, exactScopeIds)),
    );
    return scopedEmployees.length ? scopedEmployees : getShiftMasterDefaultEmployeeScope(masterProfile);
  }

  return getShiftMasterDefaultEmployeeScope(masterProfile);
}

function getShiftMasterOwnerProfileForWorkCenter(workCenterId = "", assignment = null, preferredProfile = null) {
  if (assignment?.masterId) return getShiftMasterProfile(assignment.masterId);
  if (preferredProfile && shiftMasterProfileOwnsWorkCenter(preferredProfile, workCenterId)) return preferredProfile;
  return getShiftMasterProfilesForWorkCenter(workCenterId)[0] || getShiftMasterProfile(ui.activeShiftMasterId);
}

function setShiftMasterAssignmentMatrixConfig(masterId = "", patch = {}) {
  const normalizedMasterId = String(masterId || "").trim();
  if (!normalizedMasterId) return;
  const store = normalizeShiftMasterAssignmentMatrix(ui.shiftMasterAssignmentMatrix);
  const current = store[normalizedMasterId] || { mode: "department", employeeIds: [] };
  ui.shiftMasterAssignmentMatrix = {
    ...store,
    [normalizedMasterId]: normalizeShiftMasterAssignmentMatrix({
      [normalizedMasterId]: {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    })[normalizedMasterId],
  };
}

function resetShiftMasterAssignmentMatrixConfig(masterId = "") {
  const normalizedMasterId = String(masterId || "").trim();
  if (!normalizedMasterId) return;
  const store = normalizeShiftMasterAssignmentMatrix(ui.shiftMasterAssignmentMatrix);
  delete store[normalizedMasterId];
  ui.shiftMasterAssignmentMatrix = store;
}

function setShiftMasterAssignmentMatrixEmployee(masterId = "", employeeId = "", enabled = false) {
  const normalizedEmployeeId = String(employeeId || "").trim();
  if (!normalizedEmployeeId) return;
  const current = getShiftMasterAssignmentConfig(masterId);
  const ids = new Set(current.employeeIds || []);
  if (enabled) {
    ids.add(normalizedEmployeeId);
  } else {
    ids.delete(normalizedEmployeeId);
  }
  setShiftMasterAssignmentMatrixConfig(masterId, {
    mode: "manual",
    employeeIds: [...ids],
  });
}

function getShiftMasterEmployee(employeeId = "") {
  return getShiftMasterEmployeeRows().find((employee) => employee.id === employeeId) || null;
}

function getTimesheetAvailabilityForShiftMasterEmployee(employee = {}, dateKey = "", employeeIndex = 0) {
  const normalizedDateKey = normalizeDateInput(dateKey) || toDateInput(getShiftWorkbenchWindow().start);
  const date = startOfDay(fromDateInput(normalizedDateKey));
  const sourceIndex = Number.isFinite(Number(employee.timesheetSourceIndex))
    ? Number(employee.timesheetSourceIndex)
    : employeeIndex;
  // A newly imported/seeded employee may not have a resolved schedule yet.
  // The workshop must still render the assignment card, treating the missing
  // calendar as its normal working window instead of aborting the whole page.
  const schedule = getTimesheetEmployeeSchedule(employee, sourceIndex) || {
    code: "5/2",
    start: "08:00",
    end: "17:00",
  };
  const cell = getTimesheetCell(employee, date, sourceIndex, schedule) || {};
  const employeeId = String(employee.id || employee.employeeId || "").trim();
  let projection = null;
  try {
    projection = projectEmployeeAvailability({
      ...(getPersonnelCalendarModel() || {}),
      employeeId,
      date: normalizedDateKey,
    });
  } catch (_error) {
    projection = null;
  }
  const projectedValue = projection?.status === "available"
    ? "work"
    : projection?.reason === "attendance:vacation"
      ? "vacation"
      : projection?.reason === "attendance:sick"
        ? "sick"
        : projection?.reason === "attendance:leave"
          ? "leave"
          : projection?.status === "absent"
            ? "off"
            : "";
  const value = projectedValue || cell.value || (cell.code === "work-overtime" ? "overtime" : cell.code);
  const isAvailable = value === "work" || value === "overtime";
  const option = getTimesheetDayOption(value || "work");
  const hours = isAvailable
    ? Math.max(0, Number(projection?.availableMinutes ?? (Number(cell.hours || 0) * 60)) / 60)
    : 0;
  const overtime = isAvailable ? Number(cell.overtime || 0) : 0;
  const unavailableLabel = value === "vacation"
    ? "отпуск"
    : value === "sick"
      ? "больничный"
      : value === "leave"
        ? "отгул"
        : "выходной";
  return {
    dateKey: normalizedDateKey,
    value,
    isAvailable,
    hours,
    overtime,
    schedule,
    cell,
    tone: isAvailable ? (overtime > 0 ? "warning" : "ok") : "critical",
    label: isAvailable ? `${formatTimesheetHours(hours)} ч` : unavailableLabel,
    detail: isAvailable
      ? `${schedule.code} · ${cell.start || schedule.start}-${cell.end || schedule.end}`
      : option.title || option.label || unavailableLabel,
  };
}

function enrichShiftMasterEmployeesWithTimesheet(employees = [], dateKey = "") {
  return (employees || []).map((employee, employeeIndex) => ({
    ...employee,
    availability: getTimesheetAvailabilityForShiftMasterEmployee(employee, dateKey, employeeIndex),
  }));
}

function getShiftMasterAssignment(slotId = "") {
  return planningState.shiftMasterAssignments?.[slotId] || null;
}

function getDispatchFact(slotId = "") {
  return null;
}

function getRawGanttSlotStatusValue(slot = {}) {
  const rawStatus = String(slot?.status || "").trim();
  return GANTT_SLOT_STATUS_VALUES.includes(rawStatus) ? rawStatus : "planned";
}

function getGanttSlotStatusView(slot = {}) {
  const statusValue = getRawGanttSlotStatusValue(slot);
  return getMesStatusView("ganttSlot", statusValue, {
    label: GANTT_SLOT_STATUS_LABELS[statusValue] || statusValue || "запланирован",
  });
}

function getGanttSlotStatusClass(slot = {}) {
  return `status-${getGanttSlotStatusView(slot).value || "planned"}`;
}

function isGanttSlotStatus(slot = {}, statusValue = "") {
  return getGanttSlotStatusView(slot).value === statusValue;
}

function isGanttSlotCompleted(slot = {}) {
  return isGanttSlotStatus(slot, "completed");
}

function isGanttSlotActive(slot = {}) {
  return isGanttSlotStatus(slot, "in_progress");
}

function isGanttSlotRiskStatus(slot = {}) {
  return ["problem", "overdue", "paused"].includes(getGanttSlotStatusView(slot).value);
}

function isGanttSlotProblemStatus(slot = {}) {
  return ["problem", "overdue"].includes(getGanttSlotStatusView(slot).value);
}

function getWorkOrderPlanningStatusValue(route = {}) {
  const rawStatus = String(route?.planningStatus || "").trim();
  if (WORK_ORDER_PLANNING_STATUS_VALUES.has(rawStatus)) return rawStatus;
  if (rawStatus === "planned") return "queued";
  return "queued";
}

function getWorkOrderPlanningStatus(route = {}) {
  return getMesStatusView("workOrderPlanning", getWorkOrderPlanningStatusValue(route));
}

function isWorkOrderPlanningCanceled(route = {}) {
  return getWorkOrderPlanningStatusValue(route) === "canceled";
}

function getGanttSlotViewModel(slot = {}, step = null, route = null) {
  const status = getGanttSlotStatusView(slot);
  const routeId = route?.id || getSlotRouteId(slot);
  const planningOrderId = getSlotPlanningOrderId(slot, routeId);
  return {
    document: buildMesDocumentContract("ganttSlot", {
      id: slot.id,
      routeId,
      planningOrderId,
      sourceId: slot.routeStepId || "",
    }),
    transitionIn: getMesFlowTransitionView("workOrderToGanttSlot"),
    transitionToShift: getMesFlowTransitionView("ganttSlotToShiftWorkOrder"),
    slot,
    step,
    route,
    status,
    title: slot.operationName || step?.operationName || "Операция",
    quantity: normalizeQuantity(slot.quantity || 0),
    unit: slot.unit || "шт.",
  };
}

function getShiftWorkOrderViewModel(row = {}) {
  const status = getMesStatusView("shiftAssignment", row.assignment?.status || "draft", {
    label: row.assignment?.status === "issued" ? "Выпущен" : "План смены",
    tone: row.assignment?.status === "issued" ? "ok" : "neutral",
  });
  const routeId = row.route?.id || getSlotRouteId(row.slot);
  const planningOrderId = getSlotPlanningOrderId(row.slot, routeId);
  const document = row.documentContract || buildMesDocumentContract("shiftWorkOrder", {
    id: row.id,
    routeId,
    planningOrderId,
    sourceId: row.slot?.id || row.id,
  });
  const sourceSlotDocument = row.slotDocumentContract || buildMesDocumentContract("ganttSlot", {
    id: row.slot?.id || row.id,
    routeId,
    planningOrderId,
    sourceId: row.slot?.routeStepId || "",
  });
  const factDocument = row.factDocumentContract || buildMesDocumentContract("dispatchFact", {
    id: row.id,
    routeId,
    planningOrderId,
    sourceId: row.slot?.id || row.id,
  });
  return {
    document,
    transitionIn: row.transitionFromPlanning || getMesFlowTransitionView("ganttSlotToShiftWorkOrder"),
    transitionIssue: row.transitionIssue || getMesFlowTransitionView("shiftWorkOrderIssue"),
    transitionToFact: row.transitionToFact || getMesFlowTransitionView("shiftWorkOrderToDispatchFact"),
    flowIn: buildMesFlowEvent("ganttSlotToShiftWorkOrder", sourceSlotDocument, document, {
      plannedQuantity: normalizeQuantity(row.plannedQuantity || 0),
      unit: row.unit || "шт.",
    }),
    flowToFact: buildMesFlowEvent("shiftWorkOrderToDispatchFact", document, factDocument, {
      plannedQuantity: normalizeQuantity(row.plannedQuantity || 0),
      unit: row.unit || "шт.",
    }),
    status,
    title: row.documentNumber || "Сменный заказ-наряд",
    plannedQuantity: normalizeQuantity(row.plannedQuantity || 0),
    unit: row.unit || "шт.",
    row,
  };
}

function getDispatchFactViewModel(row = {}) {
  const factStatusValue = row.factStatus?.value || row.fact?.status || "not_reported";
  const status = getMesStatusView("dispatchFact", factStatusValue, {
    label: row.factStatus?.label || factStatusValue,
    tone: row.factStatus?.tone || "neutral",
  });
  const routeId = row.route?.id || getSlotRouteId(row.slot);
  const planningOrderId = getSlotPlanningOrderId(row.slot, routeId);
  const document = row.factDocumentContract || buildMesDocumentContract("dispatchFact", {
    id: row.id,
    routeId,
    planningOrderId,
    sourceId: row.slot?.id || row.id,
  });
  const shiftDocument = row.documentContract || buildMesDocumentContract("shiftWorkOrder", {
    id: row.id,
    routeId,
    planningOrderId,
    sourceId: row.slot?.id || row.id,
  });
  return {
    document,
    transitionIn: row.transitionToFact || getMesFlowTransitionView("shiftWorkOrderToDispatchFact"),
    flowIn: buildMesFlowEvent("shiftWorkOrderToDispatchFact", shiftDocument, document, {
      plannedQuantity: normalizeQuantity(row.plannedQuantity || 0),
      actualQuantity: normalizeShiftMasterFactQuantity(row.actualQuantity),
      defectQuantity: normalizeShiftMasterFactQuantity(row.defectQuantity),
      unit: row.unit || "шт.",
    }),
    status,
    plannedQuantity: normalizeQuantity(row.plannedQuantity || 0),
    actualQuantity: normalizeShiftMasterFactQuantity(row.actualQuantity),
    defectQuantity: normalizeShiftMasterFactQuantity(row.defectQuantity),
    unit: row.unit || "шт.",
    row,
  };
}

function getDispatchFactStatusConfig(status = "") {
  return DISPATCH_FACT_STATUS_OPTIONS.find((option) => option.value === status) || DISPATCH_FACT_STATUS_OPTIONS[0];
}

function getShiftWorkOrderPlannedQuantity(slot = {}, assignment = null) {
  const assignmentQuantity = normalizeQuantity(assignment?.plannedQuantity || 0);
  if (assignmentQuantity > 0) return assignmentQuantity;
  return normalizeQuantity(slot.quantity || 0);
}

function getShiftRowId(slot = {}, dateKey = "") {
  return [slot.id || "", dateKey || ""].filter(Boolean).join("::");
}

function getShiftSlotWindowSegment(slot = {}, window = getDispatchWindow()) {
  if (!slot?.plannedStart || !slot?.plannedEnd) return null;
  const slotStart = toDate(slot.plannedStart);
  const slotEnd = toDate(slot.plannedEnd);
  if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime()) || slotEnd <= slotStart) return null;
  const start = new Date(Math.max(slotStart.getTime(), window.start.getTime()));
  const end = new Date(Math.min(slotEnd.getTime(), window.end.getTime()));
  if (end <= start) return null;
  return {
    start,
    end,
    slotStart,
    slotEnd,
  };
}

function getShiftSlotPlannedQuantity(slot = {}, window = getDispatchWindow()) {
  const slotQuantity = normalizeQuantity(slot.quantity || 0);
  const segment = getShiftSlotWindowSegment(slot, window);
  if (!segment) return slotQuantity;
  const totalMs = Math.max(1, segment.slotEnd.getTime() - segment.slotStart.getTime());
  const segmentMs = Math.max(1, segment.end.getTime() - segment.start.getTime());
  if (segmentMs >= totalMs - 1) return slotQuantity;
  return Math.max(1, Math.min(slotQuantity, Math.round(slotQuantity * segmentMs / totalMs)));
}

function getPlanningShiftSlotTimeLabelForWindow(slot = {}, window = getDispatchWindow()) {
  const segment = getShiftSlotWindowSegment(slot, window);
  if (!segment) return getPlanningShiftSlotTimeLabel(slot);
  return `${formatDateTimeShort(segment.start)}-${formatDateTimeShort(segment.end)}`;
}

function getShiftMasterResourceOptions(workCenterId = "", preferredResourceId = "") {
  const resourceMap = new Map();
  getProductionResourcesForWorkCenter(workCenterId, { includeInactive: false, includePassive: true })
    .forEach((resource) => resourceMap.set(resource.id, resource));
  const preferred = preferredResourceId ? getProductionResource(preferredResourceId) : null;
  if (preferred?.id) resourceMap.set(preferred.id, preferred);
  if (!resourceMap.size && workCenterId) {
    const fallback = makeFallbackProductionResource(workCenterId);
    resourceMap.set(fallback.id, fallback);
  }
  return [...resourceMap.values()].sort((left, right) => (
    String(left.name || "").localeCompare(String(right.name || ""), "ru")
  ));
}

function getShiftRowWorkCenterId(slot = {}, step = null) {
  const resolveResourceWorkCenterId = (resourceId = "") => {
    const resource = resourceId ? getProductionResource(resourceId) : null;
    const resourceWorkCenterId = resource ? getProductionResourceWorkCenterId(resource) : "";
    const mappedResourceWorkCenterId = mapLegacyWorkCenterId(resourceWorkCenterId);
    if (mappedResourceWorkCenterId && getWorkCenter(mappedResourceWorkCenterId)) return mappedResourceWorkCenterId;

    const mappedResourceId = mapLegacyWorkCenterId(resourceId);
    return mappedResourceId && getWorkCenter(mappedResourceId) ? mappedResourceId : "";
  };
  const candidates = [
    slot.planningWorkCenterId,
    step?.planningWorkCenterId,
    resolveResourceWorkCenterId(slot.resourceId),
    resolveResourceWorkCenterId(step?.resourceId),
    getSlotGanttWorkCenterId(slot),
    slot.workCenterId,
    step?.workCenterId,
  ];
  for (const candidate of candidates) {
    const normalizedId = mapLegacyWorkCenterId(candidate || "");
    if (!normalizedId) continue;
    const calendarId = getCalendarWorkCenterId(normalizedId) || normalizedId;
    if (calendarId && getWorkCenter(calendarId)) return calendarId;
  }
  return "";
}

function getPlanningSupplyRows(route, transferSummary = null, routeSteps = null, tasks = null) {
  const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
  const specification = getRouteSpecification(route);
  const steps = routeSteps || getRouteStepsForModule(route?.id || "");
  const taskList = tasks || getPlanningTasksForRoute(route, steps);

  if (!specification) {
    const bom = getRouteBomList(route);
    if (!bom) return [];
    const task = taskList.find((item) => item.bomListId === bom.id) || null;
    const stats = task ? getPlanningTaskOperationStats(route, task, steps) : { stepsCount: steps.length, steps };
    const profile = getRouteStepFulfillmentProfile(stats);
    const mode = "produce";
    return [{
      id: `bom:${bom.id}`,
      number: "01",
      level: 0,
      title: bom.resultItem || bom.name || "Плата",
      typeLabel: BOARD_SPEC_TERM,
      sourceLabel: bom.boardCode || BOARD_BOM_TERM,
      nomenclatureItemId: getBomResultNomenclatureItem(bom.id)?.id || "",
      quantity: planningQuantity,
      unit: "шт.",
      mode,
      modeLabel: getFulfillmentLabel(mode),
      modeMeta: getFulfillmentMeta(mode),
      tone: getFulfillmentTone(mode),
      task,
      stats,
      profile,
      status: !stats.stepsCount ? "нужен маршрут" : profile.productionCount ? "операции заданы" : "нет производственной операции",
      statusTone: stats.stepsCount && profile.productionCount ? "ok" : "warning",
      editable: false,
    }];
  }

  return getSpekiStructureTableRows(specification).map(({ item, number, level }) => {
    const mode = getSpecificationItemFulfillmentMode(item);
    const task = taskList.find((candidate) => candidate.sourceItemId === item.id) || null;
    const stats = task ? getPlanningTaskOperationStats(route, task, steps) : { steps: [], stepsCount: 0, smtCount: 0, outputCount: 0 };
    const profile = getRouteStepFulfillmentProfile(stats);
    const requiredQuantity = Math.max(0, Math.round(planningQuantity * Number(item.quantity || 0)));
    const isSchedulable = isSchedulableFulfillmentMode(mode);
    let status = "вне маршрута";
    let statusTone = "neutral";

    if (mode === "not_selected") {
      status = "выберите обеспечение";
      statusTone = "critical";
    } else if (mode === "produce") {
      if (!stats.stepsCount) {
        status = "нужен маршрут";
        statusTone = "warning";
      } else if (!profile.productionCount) {
        status = "нет производственной операции";
        statusTone = "warning";
      } else {
        status = "производственная ветка";
        statusTone = "ok";
      }
    } else if (mode === "from_stock") {
      if (profile.productionCount) {
        status = "уберите производственные операции";
        statusTone = "warning";
      } else if (!profile.warehouseIssueCount) {
        status = "нужна складская выдача";
        statusTone = "warning";
      } else {
        status = "складская выдача";
        statusTone = "ok";
      }
    } else if (!isSchedulable) {
      status = mode === "purchase" ? "закупка вне Ганта" : "внешнее обеспечение";
      statusTone = "neutral";
    }

    return {
      id: item.id,
      number,
      level,
      title: getSpekiStructureItemLabel(item),
      typeLabel: getRouteTaskTypeLabel({ type: item.type, fulfillmentMode: mode }),
      sourceLabel: getPlanningSupplySourceLabel(item),
      nomenclatureItemId: getWarehouseNomenclatureIdForSpecificationItem(item),
      quantity: requiredQuantity,
      unit: item.unit || "шт.",
      mode,
      modeLabel: getFulfillmentLabel(mode),
      modeMeta: getFulfillmentMeta(mode),
      tone: getFulfillmentTone(mode),
      task,
      stats,
      profile,
      status,
      statusTone,
      editable: true,
    };
  });
}

function getWarehouseNomenclatureIdForSpecificationItem(item = {}) {
  if (item.type === "nomenclature" || item.type === "part") return item.nomenclatureId || "";
  if (item.type === "bom") return getBomResultNomenclatureItem(getSpecificationItemBomId(item))?.id || "";
  return "";
}

function getPlanningSupplySourceLabel(item = {}) {
  if (item.type === "bom") {
    const bom = getBomList(getSpecificationItemBomId(item));
    return bom?.boardCode || bom?.name || "плата не выбрана";
  }
  if (item.type === "specification") {
    const specification = getSpecificationById(item.specificationId);
    return specification?.outputItem || specification?.name || "изделие не выбрано";
  }
  if (item.type === "nomenclature" || item.type === "part") {
    const nomenclature = (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId);
    return [nomenclature?.article, nomenclature?.type].filter(Boolean).join(" · ") || "номенклатура";
  }
  return "внутренний узел";
}

function getPlanningSupplySummary(route, transferSummary = null, routeSteps = null) {
  const rows = getPlanningSupplyRows(route, transferSummary, routeSteps);
  return {
    rows,
    total: rows.length,
    produce: rows.filter((row) => row.mode === "produce").length,
    stock: rows.filter((row) => row.mode === "from_stock").length,
    external: rows.filter((row) => row.mode === "purchase" || row.mode === "external").length,
    blocking: rows.filter((row) => row.statusTone === "critical" || row.statusTone === "warning").length,
  };
}

function getPlanningSupplyBlockingIssues(route, transferSummary = null, routeSteps = null) {
  return getPlanningSupplyRows(route, transferSummary, routeSteps)
    .filter((row) => row.statusTone === "critical" || row.statusTone === "warning")
    .map((row) => {
      if (row.mode === "not_selected") return `${row.number}. ${row.title}: способ обеспечения не выбран.`;
      if (row.mode === "produce" && !row.stats.stepsCount) return `${row.number}. ${row.title}: нужна производственная операция в маршрутной карте.`;
      if (row.mode === "produce" && !row.profile?.productionCount) return `${row.number}. ${row.title}: нужна не складская производственная операция.`;
      if (row.mode === "from_stock" && row.profile?.productionCount) return `${row.number}. ${row.title}: выбрано «Со склада», но в маршруте остались производственные операции.`;
      if (row.mode === "from_stock" && !row.profile?.warehouseIssueCount) return `${row.number}. ${row.title}: нужна складская операция выдачи в маршрутной карте.`;
      return `${row.number}. ${row.title}: ${row.status}.`;
    });
}

function getProductionChainStepFlowLabel(route, steps = [], kind = "input") {
  const orderedSteps = [...(steps || [])].sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
  const candidates = kind === "output" ? orderedSteps.reverse() : orderedSteps;
  const step = candidates.find((item) => item?.id);
  if (!step) return "";
  const flow = getRouteStepFlowModel(route, step);
  return kind === "output" ? flow.outputLabel : flow.inputLabel;
}

function getProductionChainOperationRows(route, steps = []) {
  return [...(steps || [])]
    .sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0))
    .map((step) => ({
      id: step.id,
      order: Number(step.stepOrder || 0),
      name: step.operationName || "Операция",
      line: getPlanningStepLineLabel(step),
      tone: getPlanningStepTone(step),
      isSmt: routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState),
      isOutput: isManufacturingOutputReceiptRouteStep(step),
      missingLine: routeStepRequiresManualPlanningLine(step, planningState) && !getRouteStepSelectedPlanningWorkCenterId(step, planningState),
    }));
}

function getProductionChainSourceInputLabel(row, route) {
  const taskInputLabel = getRouteTaskInputObjectLabel(route, row.task, "");
  if (row.mode === "produce" && taskInputLabel) return taskInputLabel;
  const fromStep = getProductionChainStepFlowLabel(route, row.stats?.steps || [], "input");
  if (fromStep) return fromStep;
  if (row.mode === "from_stock") return `Остаток склада: ${row.title}`;
  if (row.mode === "purchase") return `Закупка: ${row.title}`;
  if (row.mode === "external") return `Внешнее обеспечение: ${row.title}`;
  if (row.mode === "not_selected") return "Способ обеспечения не выбран";
  return `Материалы: ${row.title}`;
}

function getProductionChainSourceOutputLabel(row, route) {
  const producedLabel = getRouteTaskProducedObjectLabel(route, row.task, getBomList(row.task?.bomListId || ""), getRoutePlanningContext(route));
  if (row.mode === "produce" && producedLabel) return producedLabel;
  const fromStep = getProductionChainStepFlowLabel(route, row.stats?.steps || [], "output");
  if (fromStep) return fromStep;
  if (row.mode === "from_stock") return `Выдано в производство: ${row.title}`;
  if (row.mode === "purchase") return `Поставка: ${row.title}`;
  if (row.mode === "external") return `Внешний результат: ${row.title}`;
  if (row.mode === "not_selected") return "Выход не определен";
  return row.title || "Результат составной части";
}

function buildPlanningProductionChain(route, transferSummary = null, tasks = null, routeSteps = null) {
  const steps = routeSteps || getRouteStepsForModule(route?.id || "");
  const taskList = tasks || getPlanningTasksForRoute(route, steps);
  const rows = getPlanningSupplyRows(route, transferSummary, steps, taskList);
  const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
  const production = getRoutePlanningContext(route);
  const supplyIssues = getPlanningSupplyBlockingIssues(route, transferSummary, steps);
  const sourceNodes = rows.map((row) => {
    const operations = getProductionChainOperationRows(route, row.stats?.steps || []);
    return {
      id: row.id,
      kind: "source",
      number: row.number,
      title: row.title || "Составная часть",
      typeLabel: row.typeLabel || "часть",
      sourceLabel: row.sourceLabel || "",
      mode: row.mode,
      modeLabel: row.modeLabel,
      quantity: row.quantity,
      unit: row.unit || "шт.",
      status: row.status,
      tone: row.statusTone || "neutral",
      inputLabel: getProductionChainSourceInputLabel(row, route),
      outputLabel: getProductionChainSourceOutputLabel(row, route),
      operations,
      smtCount: row.stats?.smtCount || 0,
      outputCount: row.stats?.outputCount || 0,
      missingLineCount: operations.filter((item) => item.missingLine).length,
      isSchedulable: isSchedulableFulfillmentMode(row.mode),
    };
  });

  const mainTask = taskList.find((task) => task.isMain) || null;
  const mainSteps = getRouteStepsForTask(steps, MAIN_ROUTE_TASK_ID);
  const mainStats = mainTask
    ? getPlanningTaskOperationStats(route, mainTask, steps)
    : {
      steps: mainSteps,
      stepsCount: mainSteps.length,
      smtCount: mainSteps.filter((step) => isSmtOperationWorkCenter(step.workCenterId, step, planningState) || routeStepRequiresManualPlanningLine(step, planningState)).length,
      outputCount: mainSteps.filter((step) => isManufacturingOutputReceiptRouteStep(step)).length,
    };
  const shouldShowFinalNode = sourceNodes.length > 1 || mainStats.stepsCount > 0;
  const finalInputNodes = sourceNodes.filter((node) => node.mode !== "not_selected");
  const finalOutputLabel = getProjectDisplayOutput(production)
    || getProjectDisplayName(production)
    || route?.name
    || getProductionChainStepFlowLabel(route, mainStats.steps || [], "output")
    || "Готовое изделие";
  const finalNode = shouldShowFinalNode ? {
    id: "final",
    kind: "final",
    number: "Финиш",
    title: mainTask?.title || "Финальные операции маршрута",
    typeLabel: "маршрут",
    sourceLabel: getProjectDisplayName(production) || route?.name || "",
    mode: "produce",
    modeLabel: "Произвести",
    quantity: planningQuantity,
    unit: "шт.",
    status: mainStats.stepsCount ? "операции заданы" : "нужна финальная операция",
    tone: mainStats.stepsCount ? "ok" : "warning",
    inputLabel: getProductionChainStepFlowLabel(route, mainStats.steps || [], "input")
      || joinRouteStepFlowLabels(finalInputNodes.map((node) => node.outputLabel), "Полуфабрикаты состава изделия"),
    outputLabel: finalOutputLabel,
    operations: getProductionChainOperationRows(route, mainStats.steps || []),
    smtCount: mainStats.smtCount || 0,
    outputCount: mainStats.outputCount || 0,
    missingLineCount: 0,
    isSchedulable: true,
  } : null;

  const links = finalNode
    ? sourceNodes
      .filter((node) => node.mode !== "not_selected")
      .map((node) => ({
        id: `${node.id}->${finalNode.id}`,
        from: node.title,
        to: finalNode.title,
        label: node.mode === "from_stock" ? "через склад" : node.isSchedulable ? "в производство" : "вне Ганта",
        tone: node.isSchedulable ? "ok" : "neutral",
      }))
    : [];
  const lineIssues = steps
    .filter((step) => routeStepRequiresManualPlanningLine(step, planningState) && !getRouteStepSelectedPlanningWorkCenterId(step, planningState))
    .map((step) => `${step.operationName || "SMT-операция"}: выберите конкретный SMT-участок.`);
  const finalIssues = sourceNodes.length > 1 && !mainStats.stepsCount
    ? ["Для нескольких составных частей нужна финальная операция сборки или приемки в маршрутной карте."]
    : [];
  const issues = [...new Set([...supplyIssues, ...lineIssues, ...finalIssues])];

  return {
    nodes: sourceNodes,
    finalNode,
    allNodes: finalNode ? [...sourceNodes, finalNode] : sourceNodes,
    links,
    issues,
    summary: {
      branches: sourceNodes.length,
      links: links.length,
      smt: steps.filter((step) => routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState)).length,
      issues: issues.length,
    },
  };
}

function renderPlanningProductionChainNode(node) {
  const visibleOperations = node.operations.slice(0, 4);
  const hiddenCount = Math.max(0, node.operations.length - visibleOperations.length);
  return `
    <article class="planning-chain-node is-${escapeAttribute(node.tone)} ${node.kind === "final" ? "is-final" : ""}">
      <header>
        <span>${escapeHtml(node.number)} · ${escapeHtml(node.typeLabel)}</span>
        <strong>${escapeHtml(node.title)}</strong>
        <em>${escapeHtml(node.status)}</em>
      </header>
      <div class="planning-chain-node-flow">
        <span>
          <b>Вход</b>
          <strong>${escapeHtml(node.inputLabel)}</strong>
        </span>
        <i aria-hidden="true">&rarr;</i>
        <span>
          <b>Выход</b>
          <strong>${escapeHtml(node.outputLabel)}</strong>
        </span>
      </div>
      <div class="planning-chain-node-facts">
        <span>${escapeHtml(node.modeLabel || "обеспечение")}</span>
        <span>${Number(node.quantity || 0).toLocaleString("ru-RU")} ${escapeHtml(node.unit || "шт.")}</span>
        <span>${node.operations.length ? `${node.operations.length} оп.` : "нет операций"}</span>
        ${node.smtCount ? `<span>SMT ${node.smtCount}</span>` : ""}
      </div>
      ${visibleOperations.length ? `
        <div class="planning-chain-steps">
          ${visibleOperations.map((operation) => `
            <button class="is-${escapeAttribute(operation.tone)}" data-planning-work-item="${escapeAttribute(getPlanningWorkItemId("step", operation.id))}" type="button">
              <b>${operation.order}</b>
              <span>${escapeHtml(operation.name)}</span>
              <em>${escapeHtml(operation.line)}</em>
            </button>
          `).join("")}
          ${hiddenCount ? `<small>+${hiddenCount} оп.</small>` : ""}
        </div>
      ` : ""}
    </article>
  `;
}

function getPlanningFlowReadinessSummary(route = null) {
  const production = getRoutePlanningContext(route);
  const batches = route && production ? getRoutePlanningBatches(route, production) : [];
  const settings = getRouteFlowLaunchSettings(route, batches[0] || null);
  const details = batches.map((batch) => {
    const readiness = getMainRouteDependencyReadiness(route.id, production.id, batch.id);
    const branchDetails = readiness?.branchDetails || getRoutePlanningOrderWipBranchDetails(route.id, production.id, batch.id, ui.now);
    return {
      batch,
      readiness,
      branchDetails,
      availableKitsNow: readiness?.availableKitsNow || getRoutePlanningOrderAvailableKitCount(route.id, production.id, batch.id, ui.now),
    };
  });
  const readyDates = details
    .map((detail) => detail.readiness?.readyAt)
    .filter(Boolean)
    .sort((left, right) => toDate(left) - toDate(right));
  const branchCount = details[0]?.readiness?.sourceSlots?.length || getRouteConcreteTasksForPlanning(route).length;

  return {
    settings,
    batches: details,
    branchDetails: details[0]?.branchDetails || [],
    branchCount,
    availableKitsNow: details.reduce((sum, detail) => sum + normalizeQuantity(detail.availableKitsNow), 0),
    nextReadyAt: readyDates[0] || null,
  };
}

function renderPlanningWipBranchCards(summary) {
  const branches = summary.branchDetails || [];
  if (!branches.length) {
    return `
      <div class="planning-flow-wip-empty">
        ${icon("info")}
        <span>WIP появится после передачи входных веток в Гант.</span>
      </div>
    `;
  }

  return `
    <div class="planning-flow-wip-list" aria-label="WIP по входным веткам сборки">
      ${branches.map((branch) => {
        const produced = Number(branch.producedQuantity || 0);
        const available = Number(branch.availableQuantity || 0);
        const required = Math.max(1, Number(branch.requiredQuantity || summary.settings.transferBatchQuantity || 1));
        const progress = Math.max(0, Math.min(100, Math.round((produced / required) * 100)));
        const tone = available >= required ? "ok" : progress > 0 ? "warning" : "neutral";
        return `
          <article class="planning-flow-wip-card is-${escapeAttribute(tone)}">
            <header>
              <span>${escapeHtml(branch.outputLabel || "Выход ветки")}</span>
              <strong>${available.toLocaleString("ru-RU")} свободно</strong>
            </header>
            <div class="planning-flow-wip-bar" style="--wip-progress:${progress}%;">
              <i></i>
            </div>
            <footer>
              <span>${produced.toLocaleString("ru-RU")} выпущено · передача ${required.toLocaleString("ru-RU")}</span>
              <em>${escapeHtml([branch.transferLabel, branch.readyAt ? formatDateTimeShort(branch.readyAt) : ""].filter(Boolean).join(" · ") || "нет даты")}</em>
            </footer>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderPlanningFlowRulePanel(route, chain) {
  const summary = getPlanningFlowReadinessSummary(route);
  const { settings } = summary;
  const canUseTransfer = summary.branchCount > 1 && chain.finalNode;
  const ruleHint = canUseTransfer
    ? "Ручного режима запуска больше нет: передача появляется по окончанию операции или по закрытию смены."
    : "Правило доступно для маршрута с несколькими входными ветками и общей сборкой.";

  return `
    <div class="planning-flow-rule ${canUseTransfer ? "" : "is-muted"}">
      <div class="planning-flow-rule-head">
        <div>
          <strong>Системная передача</strong>
          <span>${canUseTransfer
            ? "когда следующий участок может брать готовый объем из входных веток"
            : "передаточный объем доступен, когда есть несколько входных веток и общая сборка"}</span>
        </div>
        <em class="planning-section-tag is-calculated">
          ${escapeHtml(settings.modeLabel)}
        </em>
      </div>
      <div class="planning-flow-rule-body">
        <div class="planning-flow-system-events" aria-label="События передачи">
          <article>
            <strong>Конец смены</strong>
            <span>Передается фактически выполненный объем смены.</span>
          </article>
          <article>
            <strong>Окончание операции</strong>
            <span>Если операция закрылась раньше, следующий участок получает объем сразу.</span>
          </article>
        </div>
        <div class="planning-flow-live">
          <article>
            <span>Можно собрать сейчас</span>
            <strong>${summary.availableKitsNow.toLocaleString("ru-RU")} компл.</strong>
            <small>минимум по входным веткам</small>
          </article>
          <article>
            <span>Ближайший старт</span>
            <strong>${summary.nextReadyAt ? escapeHtml(formatDateTimeShort(summary.nextReadyAt)) : "после Ганта"}</strong>
            <small>по ближайшему событию передачи</small>
          </article>
        </div>
        ${renderPlanningWipBranchCards(summary)}
      </div>
      <p class="planning-flow-rule-note">${escapeHtml(ruleHint)}</p>
    </div>
  `;
}

function getPlanningTaskOperationStats(route, task, steps = null) {
  const routeSteps = steps || getRouteStepsForModule(route?.id || "");
  const taskSteps = getRouteStepsForPlanningTask(route, task, routeSteps);
  const smtSteps = taskSteps.filter((step) => (
    isSmtOperationWorkCenter(step.workCenterId, step, planningState)
    || routeStepRequiresManualPlanningLine(step, planningState)
  ));
  const outputSteps = taskSteps.filter((step) => isManufacturingOutputReceiptRouteStep(step));
  return {
    steps: taskSteps,
    smtSteps,
    outputSteps,
    stepsCount: taskSteps.length,
    smtCount: smtSteps.length,
    outputCount: outputSteps.length,
  };
}

function isWarehouseIssueRouteStep(step = {}) {
  return isWarehouseWorkCenterId(step.workCenterId) && !isManufacturingOutputReceiptRouteStep(step);
}

function getRouteStepFulfillmentProfile(stats = {}) {
  const steps = Array.isArray(stats.steps) ? stats.steps : [];
  const warehouseIssueSteps = steps.filter((step) => isWarehouseIssueRouteStep(step));
  const outputReceiptSteps = steps.filter((step) => isManufacturingOutputReceiptRouteStep(step));
  const productionSteps = steps.filter((step) => !isWarehouseWorkCenterId(step.workCenterId));
  return {
    warehouseIssueCount: warehouseIssueSteps.length,
    outputReceiptCount: outputReceiptSteps.length,
    productionCount: productionSteps.length,
  };
}

function getPlanningTaskBomLabel(task) {
  const fulfillmentMode = normalizeStructureFulfillmentMode(task?.fulfillmentMode || "", task?.isMain ? "produce" : "not_selected");
  if (task && !task.isMain) {
    const prefix = getFulfillmentLabel(fulfillmentMode);
    const bom = getBomList(task?.bomListId || "");
    if (bom) return `${prefix} · ${bom.resultItem || bom.name || "BOM"}`;
    if (task?.type === "bom") return `${prefix} · BOM не привязан`;
    if (task?.type === "assembly") return `${prefix} · Сборочная ветка`;
    if (task?.type === "specification") return `${prefix} · Вложенная спецификация`;
    if (task?.type === "nomenclature" || task?.type === "part") return `${prefix} · Производимая позиция`;
    return `${prefix} · Производимый объект`;
  }
  const bom = getBomList(task?.bomListId || "");
  if (bom) return bom.resultItem || bom.name || "BOM";
  if (task?.type === "bom") return "BOM не привязан";
  if (task?.isMain) return "маршрут";
  if (task?.type === "assembly") return "Сборочная ветка";
  if (task?.type === "specification") return "Вложенная спецификация";
  if (task?.type === "nomenclature" || task?.type === "part") return "Производимая позиция";
  return "Производимый объект";
}

function getPlanningTaskReadiness(task, stats) {
  if (task?.isOrphan) return { label: "проверьте связь", tone: "critical" };
  const fulfillmentMode = normalizeStructureFulfillmentMode(task?.fulfillmentMode || "", task?.isMain ? "produce" : "not_selected");
  if (!task?.isMain && fulfillmentMode === "not_selected") return { label: "обеспечение не выбрано", tone: "critical" };
  if (!task?.isMain && !isSchedulableFulfillmentMode(fulfillmentMode)) return { label: "вне маршрута", tone: "neutral" };
  if (!stats.stepsCount) return { label: "нет операций", tone: "warning" };
  const fulfillmentProfile = getRouteStepFulfillmentProfile(stats);
  if (!task?.isMain && fulfillmentMode === "produce" && !fulfillmentProfile.productionCount) {
    return { label: "нет производственной операции", tone: "warning" };
  }
  if (fulfillmentMode === "from_stock") {
    if (fulfillmentProfile.productionCount) return { label: "лишние производственные операции", tone: "warning" };
    if (!fulfillmentProfile.warehouseIssueCount) return { label: "нужна складская выдача", tone: "warning" };
  }
  if (stats.smtSteps.some((step) => routeStepRequiresManualPlanningLine(step, planningState) && !getRouteStepSelectedPlanningWorkCenterId(step, planningState))) {
    return { label: "выберите SMT-участок", tone: "warning" };
  }
  if (task?.type === "bom" && !task.bomListId) return { label: "BOM не привязан", tone: "warning" };
  return { label: "готово к плану", tone: "ok" };
}

function getPlanningStepTone(step) {
  if (!getOperationMapItem(step.operationId)) return "warning";
  if (routeStepRequiresManualPlanningLine(step, planningState) && !getRouteStepSelectedPlanningWorkCenterId(step, planningState)) return "warning";
  if (isManufacturingOutputReceiptRouteStep(step)) return "output";
  if (routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState)) return "smt";
  return "regular";
}

function getPlanningStepLineLabel(step) {
  const selectedLineId = getRouteStepSelectedPlanningWorkCenterId(step, planningState);
  if (selectedLineId) return getWorkCenter(selectedLineId)?.name || selectedLineId;
  if (routeStepRequiresManualPlanningLine(step, planningState)) return "SMT-участок не выбран";
  return getWorkCenter(step.workCenterId)?.name || step.workCenterId || "Отдел не выбран";
}

function schedulePlanningRouteStructureSidebarSync() {
  if (planningRouteStructureSidebarFrame) {
    window.cancelAnimationFrame(planningRouteStructureSidebarFrame);
  }
  planningRouteStructureSidebarFrame = window.requestAnimationFrame(() => {
    planningRouteStructureSidebarFrame = 0;
    syncPlanningRouteStructureSidebarHeight();
  });
}

function syncPlanningRouteStructureSidebarHeight() {
  const page = app.querySelector(".planning-order-page.is-route-structure");
  const sidebar = page?.querySelector(":scope > .planning-order-queue");
  if (!page || !sidebar) return;

  sidebar.style.removeProperty("min-height");
}

function getAccessRoleForEmployee(person = null) {
  const assignments = normalizeAccessRoleAssignments(ui.accessRoleAssignments);
  const explicitRoleId = person?.id ? assignments[person.id] : "";
  const roleId = explicitRoleId || inferAccessRoleIdForPerson(person);
  return {
    role: getAccessRoleById(roleId),
    explicit: Boolean(explicitRoleId),
  };
}

function formatDateTimeShort(value) {
  const date = toDate(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createAccessPermissionRecord(actionIds = []) {
  const allowed = new Set(actionIds);
  return Object.fromEntries(ACCESS_ROLE_ACTIONS.map((action) => [action.id, allowed.has(action.id)]));
}

function createAccessPermissionMap(moduleIds = [], actionIds = ["view"]) {
  return Object.fromEntries(moduleIds.map((moduleId) => [moduleId, createAccessPermissionRecord(actionIds)]));
}

function createBlueprintAccessPermissionMap(roleId = "") {
  return Object.fromEntries(MES_MODULE_BLUEPRINT_REGISTRY
    .map((blueprint) => [blueprint.id, blueprint.access?.defaultRoleActions?.[roleId] || []])
    .filter(([, actionIds]) => actionIds.length)
    .map(([moduleId, actionIds]) => [moduleId, createAccessPermissionRecord(actionIds)]));
}

function getDefaultAccessRoleProfiles() {
  const moduleIds = getAllModuleDefinitions().map((moduleItem) => moduleItem.id);
  const allActions = ACCESS_ROLE_ACTIONS.map((action) => action.id);
  return [
    {
      id: "admin",
      label: "Администратор",
      caption: "полный доступ ко всем модулям и настройкам",
      icon: "settings",
      scope: "factory",
      defaultModule: "gantt",
      modulePermissions: createAccessPermissionMap(moduleIds, allActions),
    },
    {
      id: "productionHead",
      label: "Начальник производства",
      caption: "контроль плана, структуры, табеля и оперативной загрузки",
      icon: "target",
      scope: "factory",
      defaultModule: "gantt",
      modulePermissions: createBlueprintAccessPermissionMap("productionHead"),
    },
    {
      id: "planner",
      label: "Планировщик",
      caption: "заказ-наряды, Гант, загрузка и переносы",
      icon: "gantt",
      scope: "factory",
      defaultModule: "planning",
      modulePermissions: createBlueprintAccessPermissionMap("planner"),
    },
    {
      id: "technologist",
      label: "Технолог",
      caption: "из чего и как делать: маршрут, состав, номенклатура",
      icon: "routeEdit",
      scope: "factory",
      defaultModule: "specifications2",
      modulePermissions: createBlueprintAccessPermissionMap("technologist"),
    },
    {
      id: "master",
      label: "Мастер",
      caption: "распределение смены, печать листов и факт по своему участку",
      icon: "worker",
      scope: "workCenter",
      defaultModule: "shiftMasterBoard",
      modulePermissions: createBlueprintAccessPermissionMap("master"),
    },
    {
      id: "dispatcher",
      label: "Диспетчер",
      caption: "аналитика плана, факта и отклонений без настройки структуры",
      icon: "chart",
      scope: "factory",
      defaultModule: "weeklyProductionControl",
      modulePermissions: createBlueprintAccessPermissionMap("dispatcher"),
    },
    {
      id: "executor",
      label: "Исполнитель",
      caption: "свои сменные листы и ввод результата на планшете",
      icon: "keyboard",
      scope: "self",
      defaultModule: "authSessionPrototype",
      modulePermissions: createBlueprintAccessPermissionMap("executor"),
    },
  ];
}

function normalizeAccessPermissionRecord(value = {}, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackSource = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  return Object.fromEntries(ACCESS_ROLE_ACTIONS.map((action) => [
    action.id,
    Boolean(action.id in source ? source[action.id] : fallbackSource[action.id]),
  ]));
}

function normalizeAccessModulePermissions(value = {}, fallback = {}, roleId = "") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackSource = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  return Object.fromEntries(getAllModuleDefinitions().map((moduleItem) => {
    if (moduleItem.scope === "admin-only" && roleId !== "admin") {
      return [moduleItem.id, createAccessPermissionRecord([])];
    }
    return [
      moduleItem.id,
      normalizeAccessPermissionRecord(source[moduleItem.id], fallbackSource[moduleItem.id]),
    ];
  }));
}

function normalizeAccessRoleProfiles(value = []) {
  const source = Array.isArray(value) ? value : [];
  const sourceById = new Map(source.map((role) => [String(role?.id || ""), role]).filter(([id]) => id));
  return getDefaultAccessRoleProfiles().map((fallbackRole) => {
    const sourceRole = sourceById.get(fallbackRole.id) || {};
    const scope = ACCESS_ROLE_SCOPES.some((item) => item.id === sourceRole.scope) ? sourceRole.scope : fallbackRole.scope;
    const defaultModule = getModuleDefinitions().some((moduleItem) => moduleItem.id === sourceRole.defaultModule)
      ? sourceRole.defaultModule
      : fallbackRole.defaultModule;
    return {
      ...fallbackRole,
      label: String(sourceRole.label || fallbackRole.label).trim() || fallbackRole.label,
      caption: String(sourceRole.caption || fallbackRole.caption).trim() || fallbackRole.caption,
      icon: fallbackRole.icon,
      scope,
      defaultModule,
      modulePermissions: normalizeAccessModulePermissions(sourceRole.modulePermissions, fallbackRole.modulePermissions, fallbackRole.id),
    };
  });
}

function normalizeAccessRoleAssignments(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source).flatMap(([employeeId, roleId]) => {
    const normalizedEmployeeId = String(employeeId || "").trim();
    const normalizedRoleId = String(roleId || "").trim();
    if (!normalizedEmployeeId || !ACCESS_ROLE_IDS.includes(normalizedRoleId)) return [];
    return [[normalizedEmployeeId, normalizedRoleId]];
  }));
}

function getAccessRoleProfiles() {
  return normalizeAccessRoleProfiles(ui?.accessRoleProfiles);
}

function normalizeInterfaceRoleId(roleId = "", profiles = null) {
  const candidate = String(roleId || "");
  const roles = Array.isArray(profiles) ? profiles : getAccessRoleProfiles();
  return roles.some((role) => role.id === candidate) ? candidate : DEFAULT_INTERFACE_ROLE_ID;
}

function getAccessRoleById(roleId = ui?.activeRole) {
  const roles = getAccessRoleProfiles();
  const normalizedRoleId = normalizeInterfaceRoleId(roleId, roles);
  return roles.find((role) => role.id === normalizedRoleId) || roles[0] || getDefaultAccessRoleProfiles()[0];
}

function getAuthenticatedAccessPerson() {
  const userId = String(ui?.authCurrentUserId || "");
  if (!userId) return null;
  return getProductionStructureEmployees(getProductionStructureMatrixRuntimeOverrides())
    .find((person) => person.id === userId) || null;
}

function getAuthorizationBoundRoleId() {
  if (isAdminRuntimeHost()) return "admin";
  const person = getAuthenticatedAccessPerson();
  if (person?.id) return getAccessRoleForEmployee(person).role.id;
  const session = getAuthGateSession();
  if (session?.roleId && !isAuthGateQaBypassEnabled()) return session.roleId;
  if (isAuthGateQaBypassEnabled()) return DEFAULT_INTERFACE_ROLE_ID;
  return normalizeInterfaceRoleId(ui?.activeRole || DEFAULT_INTERFACE_ROLE_ID);
}

function getActiveInterfaceRole() {
  return getAccessRoleById(getAuthorizationBoundRoleId());
}

function syncActiveRoleWithAuthorization() {
  if (!ui) return false;
  const nextRoleId = getAuthorizationBoundRoleId();
  if (!nextRoleId || ui.activeRole === nextRoleId) return false;
  ui.activeRole = nextRoleId;
  return true;
}

function getAccessRoleModulePermission(roleId = ui?.activeRole, moduleId = "", actionId = "view") {
  const role = getAccessRoleById(roleId);
  const modulePermissions = role.modulePermissions?.[moduleId] || {};
  return Boolean(modulePermissions[actionId]);
}

function isModuleAllowedForRole(moduleId = "", role = getActiveInterfaceRole()) {
  const runtimeDefinitions = getModuleDefinitions();
  if (!runtimeDefinitions.some((moduleItem) => moduleItem.id === moduleId)) return false;
  if (moduleId === "authPrototype") return true;
  if (isAuthGateQaBypassEnabled()) return true;
  const roleId = typeof role === "string" ? role : role?.id;
  return getAccessRoleModulePermission(roleId, moduleId, "view");
}

function getAllModuleDefinitions() {
  return [...MES_MODULE_NAVIGATION_REGISTRY];
}

function getModuleDefinitions(options = {}) {
  const adminHost = typeof options.adminHost === "boolean" ? options.adminHost : isAdminRuntimeHost();
  const includeStandalone = options.includeStandalone !== false;
  const allowedScopes = adminHost
    ? new Set(["admin-only"])
    : new Set(["user", ...(includeStandalone ? ["standalone"] : [])]);
  return getAllModuleDefinitions().filter((moduleItem) => allowedScopes.has(moduleItem.scope));
}

function getModuleAnnotation(moduleId = "") {
  if (moduleId === "contourAdmin") {
    return "Админ-панель контуров: pilot для Codex-работы, stage для пользовательского тестирования, prod будет добавлен после стабилизации.";
  }
  if (moduleId === "weeklyProductionControl") {
    return "Недельный план-факт по участкам и оборудованию: читает заказ-наряды, факт рабочего места и report, но не меняет систему.";
  }
  if (moduleId === "authSessionPrototype") {
    return "Рабочий стол исполнителя: назначенные сменные задания, инструкции, маршрут, ввод факта и брака с планшета.";
  }
  const flowContract = getMesModuleFlowContract(moduleId);
  if (flowContract?.role) return flowContract.role;
  return "Рабочий модуль MES-прототипа: показывает данные и действия текущего контура.";
}

function getModuleGroups(modules) {
  const definitions = Array.isArray(modules) ? modules : [];
  return [...MES_MODULE_NAVIGATION_GROUPS]
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      modules: definitions
        .filter((moduleItem) => moduleItem.scope === "user" && moduleItem.groupId === group.id)
        .sort((left, right) => left.order - right.order),
    }))
    .filter((group) => group.modules.length);
}

function getAvailableModules() {
  if (isAdminRuntimeHost()) {
    return getModuleDefinitions({ adminHost: true });
  }
  const role = getActiveInterfaceRole();
  return getModuleDefinitions({ adminHost: false }).filter((moduleItem) => isModuleAllowedForRole(moduleItem.id, role));
}

function ensureAuthorizedModule() {
  if (isAdminRuntimeHost()) {
    ui.activeRole = "admin";
    ui.activeModule = "contourAdmin";
    return;
  }
  ui.activeRole = normalizeInterfaceRoleId(ui.activeRole);
  syncActiveRoleWithAuthorization();
  ui.activeModule = normalizeDeepLinkModuleId(ui.activeModule || defaultUiState.activeModule);
  if (ui.activeModule === "operationMap" || ui.activeModule === "instruction") {
    ui.activeModule = "gantt";
  }
  if (ui.activeModule === "specifications" || ui.activeModule === "speki") {
    ui.activeModule = "specifications2";
  }
  if (ui.activeModule === "planning2" || ui.activeModule === "planningWorkbench") {
    ui.activeModule = "planning";
  }
  if (ui.activeModule === "warehouse") {
    ui.activeModule = "gantt";
  }
  const availableModules = getAvailableModules();
  if (!availableModules.some((moduleItem) => moduleItem.id === ui.activeModule)) {
    const role = getActiveInterfaceRole();
    ui.activeModule = role.defaultModule && availableModules.some((moduleItem) => moduleItem.id === role.defaultModule)
      ? role.defaultModule
      : availableModules[0]?.id || "gantt";
  }
}

function getVisibleDirectorySections() {
  return directorySections;
}

function getVisibleDirectoryGroups(visibleSections = getVisibleDirectorySections()) {
  const sectionById = new Map(visibleSections.map((section) => [section.id, section]));
  const groupedIds = new Set();
  const groups = directorySectionGroups
    .map((group) => {
      const sections = group.ids.map((id) => sectionById.get(id)).filter(Boolean);
      sections.forEach((section) => groupedIds.add(section.id));
      return { ...group, sections };
    })
    .filter((group) => group.sections.length);

  const otherSections = visibleSections.filter((section) => !groupedIds.has(section.id));
  if (otherSections.length) {
    groups.push({
      label: "Прочее",
      description: "служебные справочники",
      ids: otherSections.map((section) => section.id),
      sections: otherSections,
    });
  }

  return groups;
}

function getShiftMasterBoardUnassignedTaskCount() {
  try {
    const model = getShiftMasterBoardModel();
    const rows = Array.isArray(model?.allRows)
      ? model.allRows
      : Array.isArray(model?.rows)
        ? model.rows
        : [];
    return rows.filter((row) => row?.boardLaneId === "intake").length;
  } catch {
    return 0;
  }
}

function getModuleMenuBadges(modules = []) {
  if (!modules.some((moduleItem) => moduleItem.id === "shiftMasterBoard")) return {};
  const shiftMasterBoardUnassignedCount = getShiftMasterBoardUnassignedTaskCount();
  return {
    shiftMasterBoard: shiftMasterBoardUnassignedCount > 0
      ? {
        count: shiftMasterBoardUnassignedCount,
        label: "Нераспределенные задачи мастерской",
        tone: "danger",
      }
      : null,
  };
}

function renderModuleMenuBadge(badge = null) {
  if (!badge || Number(badge.count || 0) <= 0) return "";
  const count = Number(badge.count || 0);
  const text = count > 99 ? "99+" : count.toLocaleString("ru-RU");
  const label = badge.label || "Счетчик";
  const tone = badge.tone || "danger";
  return `
    <em
      class="module-menu-badge is-${escapeAttribute(tone)}"
      data-visual-qa-target="module-menu-badge"
      title="${escapeAttribute(`${label}: ${count.toLocaleString("ru-RU")}`)}"
      aria-label="${escapeAttribute(`${label}: ${count.toLocaleString("ru-RU")}`)}"
    >${escapeHtml(text)}</em>
  `;
}

function renderReactCompletionMarker(moduleItem = {}) {
  if (moduleItem.reactCompletionStatus !== "react-complete") return "";
  const accepted = moduleItem.reactVerificationStatus === "accepted";
  const verificationLabel = accepted ? "приёмка подтверждена" : "приёмка отложена";
  return `
    <em
      class="module-react-complete-marker is-${accepted ? "accepted" : "deferred"}"
      data-react-complete-marker
      data-react-verification-status="${accepted ? "accepted" : "deferred"}"
      title="UI-код переведён на React + TypeScript; ${verificationLabel}"
      aria-hidden="true"
    >React TS</em>
  `;
}

function getModuleAccessibleLabel(moduleItem = {}) {
  const label = String(moduleItem.label || "Модуль");
  const verificationLabel = moduleItem.reactVerificationStatus === "accepted"
    ? "приёмка подтверждена"
    : "приёмка отложена";
  return moduleItem.reactCompletionStatus === "react-complete"
    ? `${label}. UI-код полностью переведён на React и TypeScript; ${verificationLabel}`
    : label;
}

function renderModuleMenu() {
  const modules = getAvailableModules();
  const groups = getModuleGroups(modules);
  const activeModule = modules.find((moduleItem) => moduleItem.id === ui.activeModule) || modules[0];
  const activeModuleGroup = groups.find((group) => group.modules.some((moduleItem) => moduleItem.id === activeModule?.id));
  const menuBadges = getModuleMenuBadges(modules);

  return `
    <nav class="module-menu" data-layout="sidebar" aria-label="Основное меню">
      <div class="module-menu-brand">
        <img class="module-menu-brand-logo" src="./assets/brand/mes_logo_high_quality.svg" alt="" aria-hidden="true" />
        <strong>Pilot</strong>
        <span>${escapeHtml(APP_VERSION)}</span>
      </div>
      <details class="mobile-module-switcher" data-ui-component="Dropdown">
        <summary>
          <span class="mobile-module-current">
            ${activeModule ? icon(activeModule.icon) : ""}
            <span>
              <strong>${escapeHtml(activeModule?.label || "Модуль")}</strong>
              ${activeModuleGroup?.label ? `<small>${escapeHtml(activeModuleGroup.label)}</small>` : ""}
            </span>
          </span>
          <span class="mobile-module-menu-label">Модули ${icon("chevronDown")}</span>
        </summary>
        <div class="mobile-module-sheet">
          ${groups.map((group) => `
            <section class="mobile-module-group ${group.tone ? `is-${escapeAttribute(group.tone)}-group` : ""}" ${group.tone ? `data-module-group-tone="${escapeAttribute(group.tone)}"` : ""}>
              <span class="mobile-module-group-title">${escapeHtml(group.label)}</span>
              <div class="mobile-module-group-grid">
                ${group.modules.map((moduleItem) => `
                  <button class="mobile-module-tab ${ui.activeModule === moduleItem.id ? "is-active" : ""}" data-module="${moduleItem.id}" data-react-completion-status="${escapeAttribute(moduleItem.reactCompletionStatus)}" data-react-verification-status="${escapeAttribute(moduleItem.reactVerificationStatus)}" type="button" aria-label="${escapeAttribute(getModuleAccessibleLabel(moduleItem))}">
                    ${icon(moduleItem.icon)}<span>${escapeHtml(moduleItem.label)}</span>${renderModuleMenuBadge(menuBadges[moduleItem.id])}${renderReactCompletionMarker(moduleItem)}
                  </button>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </details>
      <div class="module-tabs" role="tablist">
        ${groups.map((group) => `
          <div class="module-group ${group.tone ? `is-${escapeAttribute(group.tone)}-group` : ""}" ${group.tone ? `data-module-group-tone="${escapeAttribute(group.tone)}"` : ""}>
            <span class="module-group-title">${escapeHtml(group.label)}</span>
            ${group.modules.map((moduleItem) => `
              <button class="module-tab ${ui.activeModule === moduleItem.id ? "is-active" : ""}" data-module="${moduleItem.id}" data-react-completion-status="${escapeAttribute(moduleItem.reactCompletionStatus)}" data-react-verification-status="${escapeAttribute(moduleItem.reactVerificationStatus)}" type="button" aria-label="${escapeAttribute(getModuleAccessibleLabel(moduleItem))}" title="${escapeAttribute(getModuleAccessibleLabel(moduleItem))}">
                ${icon(moduleItem.icon)}<span>${escapeHtml(moduleItem.label)}</span>${renderModuleMenuBadge(menuBadges[moduleItem.id])}${renderReactCompletionMarker(moduleItem)}
              </button>
            `).join("")}
          </div>
        `).join("")}
      </div>
    </nav>
  `;
}

function renderTopbarAuthenticatedAccessCard(activeRole = getActiveInterfaceRole()) {
  const person = getAuthenticatedAccessPerson();
  const isBypass = isAuthGateQaBypassEnabled();
  const title = formatPersonDisplayName(person?.name, { fallback: isBypass ? "QA-обход" : "Сеанс не выбран" });
  const departmentLabel = person?.department || (isBypass ? "сотрудник не выбран" : "отдел не выбран");

  return `
    <section class="app-auth-session-summary" data-visual-qa-target="app-auth-session-summary" aria-label="Текущая авторизация">
      <span class="app-auth-session-copy" data-visual-qa-target="app-auth-session-copy">
        <strong data-visual-qa-target="app-auth-session-name">${escapeHtml(title)}</strong>
        <small data-visual-qa-target="app-auth-session-department">${escapeHtml(departmentLabel)}</small>
      </span>
      <button class="app-auth-session-logout" data-auth-logout data-visual-qa-target="app-auth-session-logout" type="button" title="Выйти и вернуться на экран авторизации">
        ${icon("lock")}
      </button>
    </section>
  `;
}

function renderAppTopbar() {
  const activeRole = getActiveInterfaceRole();
  const availableModules = getAvailableModules();
  const activeModule = availableModules.find((moduleItem) => moduleItem.id === ui.activeModule)
    || getModuleDefinitions().find((moduleItem) => moduleItem.id === ui.activeModule)
    || availableModules[0]
    || getModuleDefinitions()[0];
  const activeModuleGroup = getModuleGroups(availableModules)
    .find((group) => group.modules.some((moduleItem) => moduleItem.id === activeModule.id));
  const activeContext = ui.activeModule === "directories"
      ? directorySections.find((section) => section.id === ui.activeDirectory)?.label || "Справочники"
      : activeModuleGroup?.label || "";
  return `
    <header class="app-topbar" data-layout="header" aria-label="Верхняя панель MES">
      <div class="app-topbar-title">
        <h1>${escapeHtml(activeModule.label)}</h1>
        ${activeContext ? `<p>${escapeHtml(activeContext)}</p>` : ""}
      </div>
      <div class="app-topbar-actions" aria-label="Режимы интерфейса">
        <button class="app-topbar-action ${ui.focusMode ? "is-active" : ""}" data-toggle-focus-mode type="button" aria-pressed="${ui.focusMode ? "true" : "false"}" title="${ui.focusMode ? "Выйти из режима фокуса" : "Режим фокуса: скрыть вторичные панели и открыть браузер во весь экран"}">
          ${icon("focus")}
          <span>${ui.focusMode ? "Выйти из фокуса" : "Фокус"}</span>
        </button>
        <button class="app-topbar-action" data-refresh-app type="button" title="Обновить страницу">
          ${icon("refresh")}
          <span>Обновить</span>
        </button>
        ${renderTopbarAuthenticatedAccessCard(activeRole)}
      </div>
    </header>
  `;
}

function refreshCurrentAppPage() {
  const url = new URL(window.location.href);
  url.searchParams.set("__mes_cache_refresh", APP_VERSION);
  const nextUrl = url.toString();
  if (nextUrl === window.location.href) {
    window.location.reload();
    return;
  }
  window.location.assign(nextUrl);
}

  const api = {
    getOperationMapRows,
    getOperationMapItem,
    findOperationMapItemByNameAndWorkCenter,
    getLegacyOperationWorkCenterId,
    ensureOperationMapItemFromLegacyOperation,
    applyOperationMapItemToRouteStep,
    getDefaultOperationNameForWorkCenter,
    makeDefaultOperationCode,
    ensureWorkCenterOperations,
    migrateLegacyOperationsToDirectory,
    formatWarehouseQuantity,
    stripWarehouseReceiptLabel,
    normalizeWarehouseLookupText,
    getWarehouseNomenclatureIdByExactLabel,
    getWarehouseNomenclatureIdForRouteTask,
    getWarehouseNomenclatureIdForReceiptOutput,
    getWarehouseProductionReceiptNomenclatureId,
    getWarehouseProductionReceiptRows,
    getWarehouseBalanceRows,
    getWarehouseBalanceForNomenclature,
    getShiftMasterProfiles,
    getShiftMasterEmployeeRows,
    getShiftMasterProfile,
    shiftMasterProfileOwnsWorkCenter,
    getShiftMasterProfilesForWorkCenter,
    getShiftMasterProfileForPerson,
    getShiftMasterBoardAccessContext,
    getShiftMasterEmployeesForWorkCenter,
    getShiftMasterNormalizedWorkCenterId,
    getShiftMasterWorkCenterCatalog,
    getShiftMasterDescendantWorkCenterIds,
    shiftMasterEmployeeMatchesWorkCenterScope,
    sortShiftMasterAssignableEmployees,
    getShiftMasterAssignmentConfig,
    getShiftMasterDefaultEmployeeScope,
    getShiftMasterAssignableEmployees,
    getShiftMasterOwnerProfileForWorkCenter,
    setShiftMasterAssignmentMatrixConfig,
    resetShiftMasterAssignmentMatrixConfig,
    setShiftMasterAssignmentMatrixEmployee,
    getShiftMasterEmployee,
    getTimesheetAvailabilityForShiftMasterEmployee,
    enrichShiftMasterEmployeesWithTimesheet,
    getShiftMasterAssignment,
    getDispatchFact,
    getRawGanttSlotStatusValue,
    getGanttSlotStatusView,
    getGanttSlotStatusClass,
    isGanttSlotStatus,
    isGanttSlotCompleted,
    isGanttSlotActive,
    isGanttSlotRiskStatus,
    isGanttSlotProblemStatus,
    getWorkOrderPlanningStatusValue,
    getWorkOrderPlanningStatus,
    isWorkOrderPlanningCanceled,
    getGanttSlotViewModel,
    getShiftWorkOrderViewModel,
    getDispatchFactViewModel,
    getDispatchFactStatusConfig,
    getShiftWorkOrderPlannedQuantity,
    getShiftRowId,
    getShiftSlotWindowSegment,
    getShiftSlotPlannedQuantity,
    getPlanningShiftSlotTimeLabelForWindow,
    getShiftMasterResourceOptions,
    getShiftRowWorkCenterId,
    getPlanningSupplyRows,
    getWarehouseNomenclatureIdForSpecificationItem,
    getPlanningSupplySourceLabel,
    getPlanningSupplySummary,
    getPlanningSupplyBlockingIssues,
    getProductionChainStepFlowLabel,
    getProductionChainOperationRows,
    getProductionChainSourceInputLabel,
    getProductionChainSourceOutputLabel,
    buildPlanningProductionChain,
    renderPlanningProductionChainNode,
    getPlanningFlowReadinessSummary,
    renderPlanningWipBranchCards,
    renderPlanningFlowRulePanel,
    getPlanningTaskOperationStats,
    isWarehouseIssueRouteStep,
    getRouteStepFulfillmentProfile,
    getPlanningTaskBomLabel,
    getPlanningTaskReadiness,
    getPlanningStepTone,
    getPlanningStepLineLabel,
    schedulePlanningRouteStructureSidebarSync,
    syncPlanningRouteStructureSidebarHeight,
    getAccessRoleForEmployee,
    formatDateTimeShort,
    createAccessPermissionRecord,
    createAccessPermissionMap,
    getDefaultAccessRoleProfiles,
    normalizeAccessPermissionRecord,
    normalizeAccessModulePermissions,
    normalizeAccessRoleProfiles,
    normalizeAccessRoleAssignments,
    getAccessRoleProfiles,
    normalizeInterfaceRoleId,
    getAccessRoleById,
    getAuthenticatedAccessPerson,
    getAuthorizationBoundRoleId,
    getActiveInterfaceRole,
    syncActiveRoleWithAuthorization,
    getAccessRoleModulePermission,
    isModuleAllowedForRole,
    getModuleDefinitions,
    getModuleAnnotation,
    getModuleGroups,
    getAvailableModules,
    ensureAuthorizedModule,
    getVisibleDirectorySections,
    getVisibleDirectoryGroups,
    getShiftMasterBoardUnassignedTaskCount,
    getModuleMenuBadges,
    renderModuleMenuBadge,
    renderModuleMenu,
    renderTopbarAuthenticatedAccessCard,
    renderAppTopbar,
    refreshCurrentAppPage,
  };

  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, function operationalRuntimeServiceEntry(...args) {
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
