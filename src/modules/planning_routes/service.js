import { formatPlanningOperationCount } from "../../ui/formatters.js";
import { calculateOperationPlannedQuantity } from "../../domain/planning_quantity.js";

export function createPlanningRoutesServiceModule(dependencies = {}) {
  const {
    DEFAULT_COMPONENT_TYPES,
    MAIN_ROUTE_TASK_ID,
    MES_SMT_WORK_CENTER_IDS,
    NOMENCLATURE_REA_COMPONENT_TYPE,
    PRODUCTION_RESOURCE_TYPE_LABELS,
    ROUTE_STEP_CALCULATION_TYPES,
    STRUCTURE_FULFILLMENT_LABELS,
    STRUCTURE_FULFILLMENT_META,
    STRUCTURE_FULFILLMENT_MODES,
    STRUCTURE_SCHEDULABLE_FULFILLMENT_MODES,
    addMs,
    alignRouteMainSlotsAfterBranches,
    buildMesDocumentContract,
    buildMesFlowEvent,
    byId,
    calculateRequiredDurationMs,
    escapeAttribute,
    escapeHtml,
    formatDateTimeShort,
    formatDuration,
    formatReportNumber,
    focusRoute = () => {},
    fromDateInput,
    getBatch, getBomList = () => null, getBomResultNomenclatureItem = () => null,
    getDefaultOperationCalculationType,
    getDurationBomList, getRouteBomList = () => [],
    getGanttSlotStatusView,
    getGanttSnapMs,
    getMainRouteDependencyReadyAt,
    getManualPlanningAssignmentForRouteStep,
    getMesDocumentKind,
    getMesFlowTransitionView,
    getMesStatusView,
    getOperationMapItem,
    getOperationMapRows,
    getOperationRouteWorkCenterId,
    getPlanningResourceForRouteStep,
    getPlanningOrderLaborSlotFields = () => ({}),
    getPlanningSupplyBlockingIssues,
    getPlanningWorkCenters,
    getProductionContextForSpecification,
    getProductionResource,
    getResourcesForWorkCenter = () => [],
    getProject,
    getProjectDisplayName,
    getProjectDisplayOutput,
    getResourceBaseCph = () => 0,
    getRouteBufferMs, getRouteDocumentKind = (route = {}) => route?.parentRouteId ? "child" : "main", getRouteDocumentKindLabel = () => "Маршрутная карта", getRouteDocumentKindShortLabel = () => "Карта", getRouteLineageSubjectName = () => "", getRouteModuleSelectionName = () => "", getRouteModuleSelectionValue = () => "", getRouteRootRoute = (route = null) => route, getRouteScopeRootTask = () => null, getRouteSpecification = () => null, getRoutesForModule = () => [],
    getRouteStepBoardsPerPanel,
    getRouteStepExplicitPlanningWorkCenterId,
    getRouteStepPlanningCandidateWorkCenterIds,
    getRouteStepSelectedPlanningWorkCenterId,
    getRuntimePlanningState,
    getSlotDurationHours,
    getSlotPlanningOrderId,
    getSlotProductionContextId,
    getSlotRouteId,
    getSlotWarnings,
    getWarningProductionId = (warning = {}) => warning?.productionId || warning?.projectId || "",
    getSpecificationItemBoardsPerPanel,
    getSpecificationBomEntries = () => [],
    getSpecificationById = () => null,
    getSpecificationItemBomId = () => "",
    getSpekiStructureItemDisplayName = (item = {}) => item?.name || item?.title || "",
    getSpekiStructureItemLabel = (item = {}) => item?.name || item?.title || "",
    getSpekiStructureTableRows = () => [],
    getWorkCenter,
    getWorkCenterManualCapacity,
    getWorkCenterUnitsPerHour,
    getWorkOrderPlanningStatus,
    getWorkOrderPlanningStatusValue,
    icon,
    isGanttSlotCompleted,
    isManufacturingOutputReceiptRouteStep,
    isPlanningWorkCenter,
    isSmtOperationWorkCenter,
    isWarehouseIssueRouteStep,
    isWarehouseWorkCenterId,
    isWorkOrderPlanningCanceled,
    makeId,
    mapLegacyWorkCenterId,
    normalizeBoardsPerPanel,
    normalizeDirectoryState,
    normalizeLookupText = (value = "") => String(value || "").trim().toLowerCase(),
    normalizeNomenclatureType = (value = "") => String(value || "").trim(),
    normalizeOptionalPositiveInteger,
    normalizePlanningState,
    normalizeQuantity,
    normalizeRouteStepCalculationFields,
    notifySaveSuccess,
    parseCapacityCount,
    persistDirectoryState,
    persistState,
    persistUiState,
    recalculateSlotEndByQuantity,
    render,
    renderDenseInlineSelect,
    resourceParticipatesInCalculation,
    resourceParticipatesInPlanning,
    routeStepRequiresManualPlanningLine,
    selected,
    scopeRouteTasks = (_route, tasks = []) => tasks,
    slotMatchesPlanningOrder,
    slotMatchesProductionContext,
    snapDate,
    snapToWorkingTime = (_workCenterId, value) => value,
    toDate,
    toDateInput,
    toSlotDateTime,
    withPlanningEntityRemovalAllowed,
  } = dependencies;

  let ui = dependencies.getUi?.() || {};
  let planningState = dependencies.getPlanningState?.() || {};
  let directoryState = dependencies.getDirectoryState?.() || {};

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

function makeRouteOperationId(step, entry, index) {
  if (step.id && entry?.bom?.id) return `op-${step.id}-${entry.bom.id}-${entry.slot || index}`;
  if (entry?.bom?.id) return `op-${step.workCenterId}-${entry.bom.id}-${entry.slot || index}`;
  return `op-${step.workCenterId}-${index}`;
}

function getDefaultSecondsPerPanel(workCenterId, boardsPerPanel = 1) {
  const defaults = {
    D3_AOI: 40,
    D3_UW: 180,
    D3_CC: 240,
    D4: 300,
    D5: 900,
    D6: 300,
    D9: 360,
    D11: 120,
    D1: 60,
  };
  const mappedWorkCenterId = mapLegacyWorkCenterId(workCenterId);
  if (MES_SMT_WORK_CENTER_IDS.includes(mappedWorkCenterId)) return 0;
  if (defaults[mappedWorkCenterId]) return defaults[mappedWorkCenterId];
  const rate = Math.max(1, getWorkCenterUnitsPerHour(mappedWorkCenterId));
  return Math.max(30, Math.round((Math.max(1, Number(boardsPerPanel || 1)) / rate) * 3600));
}

function getComponentTypes() {
  const source = directoryState?.componentTypes?.length ? directoryState.componentTypes : DEFAULT_COMPONENT_TYPES;
  return source.filter((type) => type.status !== "Отключен");
}

function getProjectSpecification(productionId) {
  if (!productionId) return null;
  return (directoryState.specifications || []).find((specification) => (
    specification.id === productionId || specification.projectId === productionId
  )) || null;
}

function normalizeStructureFulfillmentMode(value = "", fallback = "not_selected") {
  const normalized = String(value || "").trim();
  if (STRUCTURE_FULFILLMENT_MODES.includes(normalized)) return normalized;
  if (normalized === "make" || normalized === "produce_in_house") return "produce";
  if (normalized === "buy") return "purchase";
  if (normalized === "stock" || normalized === "warehouse") return "from_stock";
  return STRUCTURE_FULFILLMENT_MODES.includes(fallback) ? fallback : "not_selected";
}

function getDefaultNomenclatureExecutionType(item = null) {
  const type = normalizeNomenclatureType(item?.type);
  if (item?.sourceBomResultId) return "make";
  return type === "Производимые изделия" || type === "Производимые узлы" ? "make" : "buy";
}

function getDefaultStructureFulfillmentMode(type, nomenclatureItem = null, rawExecutionType = "") {
  const executionType = String(rawExecutionType || "").trim();
  if (executionType === "buy") return "purchase";
  if (executionType === "make") return "produce";
  if (type === "bom" || type === "specification" || type === "assembly") return "produce";
  return getDefaultNomenclatureExecutionType(nomenclatureItem) === "make" ? "produce" : "purchase";
}

function getExecutionTypeForFulfillmentMode(mode = "") {
  return normalizeStructureFulfillmentMode(mode) === "produce" ? "make" : "buy";
}

function getSpecificationItemFulfillmentMode(item = {}) {
  return normalizeStructureFulfillmentMode(
    item.fulfillmentMode || item.supplyMode || item.sourceMode || item.fulfillmentType || item.executionType || "",
    getDefaultStructureFulfillmentMode(item.type || "", null, item.executionType || ""),
  );
}

function isSchedulableFulfillmentMode(mode = "") {
  return STRUCTURE_SCHEDULABLE_FULFILLMENT_MODES.has(normalizeStructureFulfillmentMode(mode));
}

function getFulfillmentLabel(mode = "") {
  return STRUCTURE_FULFILLMENT_LABELS[normalizeStructureFulfillmentMode(mode)] || STRUCTURE_FULFILLMENT_LABELS.not_selected;
}

function getFulfillmentMeta(mode = "") {
  return STRUCTURE_FULFILLMENT_META[normalizeStructureFulfillmentMode(mode)] || STRUCTURE_FULFILLMENT_META.not_selected;
}

function getFulfillmentTone(mode = "") {
  const normalized = normalizeStructureFulfillmentMode(mode);
  if (normalized === "produce") return "produce";
  if (normalized === "from_stock") return "stock";
  if (normalized === "purchase" || normalized === "external") return "external";
  return "warning";
}

function getDefaultStructureNomenclatureType(type = "nomenclature") {
  if (type === "bom") return "Печатные платы";
  if (type === "assembly" || type === "specification") return "Производимые изделия";
  return NOMENCLATURE_REA_COMPONENT_TYPE;
}

function inferStructureNomenclatureType(item = {}, nomenclatureItem = null) {
  if (nomenclatureItem?.type) return normalizeNomenclatureType(nomenclatureItem.type);
  const lookup = normalizeLookupText([item.name, item.resultItem, item.note, item.unit].filter(Boolean).join(" "));
  if (item.type === "bom" || item.bomListId || lookup.includes("pcb") || lookup.includes("печатн") || lookup.includes("плата")) return "Печатные платы";
  if (lookup.includes("жгут") || lookup.includes("кабел") || lookup.includes("шлейф")) return "Кабели и жгуты";
  if (lookup.includes("корпус") || lookup.includes("крепеж") || lookup.includes("радиатор") || lookup.includes("механ")) return "Механика";
  if (lookup.includes("паста") || lookup.includes("флюс") || lookup.includes("лак") || lookup.includes("расход")) return "Расходные материалы";
  if (lookup.includes("упаков") || lookup.includes("этикет") || lookup.includes("маркир")) return "Упаковка и маркировка";
  return getDefaultStructureNomenclatureType(item.type);
}

function normalizeSpecificationStructureItem(item, index = 0) {
  const allowedTypes = new Set(["assembly", "bom", "specification", "part", "nomenclature"]);
  const type = allowedTypes.has(item?.type) ? item.type : item?.bomListId ? "bom" : "part";
  const rawQuantity = Number(item?.quantity ?? item?.qty ?? 1);
  const quantity = Number.isFinite(rawQuantity) && rawQuantity >= 0 ? Math.round(rawQuantity) : 1;
  const rawExecutionType = String(item?.executionType || item?.fulfillmentType || "");
  const nomenclatureItem = type === "nomenclature" || type === "part"
    ? (directoryState?.nomenclature || []).find((entry) => entry.id === String(item?.nomenclatureId || item?.itemId || ""))
    : null;
  const defaultFulfillmentMode = nomenclatureItem?.sourceBomResultId
    ? "produce"
    : getDefaultStructureFulfillmentMode(type, nomenclatureItem, rawExecutionType);
  const fulfillmentMode = normalizeStructureFulfillmentMode(item?.fulfillmentMode || item?.supplyMode || item?.sourceMode || rawExecutionType, defaultFulfillmentMode);
  const executionType = getExecutionTypeForFulfillmentMode(fulfillmentMode);
  const linkedOperation = !isSchedulableFulfillmentMode(fulfillmentMode) ? null : getOperationMapItem(item?.operationId);
  const operationName = !isSchedulableFulfillmentMode(fulfillmentMode)
    ? ""
    : String(linkedOperation?.name || item?.operationName || item?.operation || item?.routeOperation || "");
  const operationDepartment = linkedOperation ? getWorkCenter(linkedOperation.workCenterId)?.name || "" : "";
  const bomListId = type === "bom" ? String(item?.bomListId || item?.bomId || "") : "";
  const rawNomenclatureType = String(item?.nomenclatureType || item?.sectionType || nomenclatureItem?.type || "").trim();
  const nomenclatureType = rawNomenclatureType ? normalizeNomenclatureType(rawNomenclatureType) : "";
  return {
    id: String(item?.id || makeId("spi")),
    parentId: String(item?.parentId || "root"),
    type,
    executionType,
    fulfillmentMode,
    operationId: !isSchedulableFulfillmentMode(fulfillmentMode) ? "" : linkedOperation?.id || String(item?.operationId || ""),
    operationName,
    departmentName: !isSchedulableFulfillmentMode(fulfillmentMode) ? "" : String(operationDepartment || item?.departmentName || item?.department || ""),
    bomListId,
    specificationId: type === "specification" ? String(item?.specificationId || item?.linkedSpecificationId || "") : "",
    nomenclatureId: type === "nomenclature" ? String(item?.nomenclatureId || item?.itemId || "") : "",
    nomenclatureType,
    name: String(item?.name || ""),
    quantity,
    unit: String(item?.unit || (type === "assembly" ? "узел" : type === "bom" ? "плата" : type === "specification" ? "состав" : "шт.")),
    boardsPerPanel: type === "bom" ? normalizeBoardsPerPanel(item?.boardsPerPanel ?? item?.boardsInPanel ?? item?.panelSize ?? 1, 1) : 1,
    resultItem: String(item?.resultItem || ""),
    note: String(item?.note || ""),
    position: Math.max(1, Math.round(Number(item?.position || index + 1))),
  };
}

function buildDefaultSpecificationStructureItems(specification) {
  if (!specification) return [];
  const rows = [];
  const pushBom = (bomListId, quantity, slot) => {
    const bom = getBomList(bomListId);
    if (!bom || Number(quantity || 0) <= 0) return;
    const resultNomenclature = getBomResultNomenclatureItem(bom.id);
    rows.push(normalizeSpecificationStructureItem({
      id: `${specification.id || "spec"}-bom-${String(slot).toLowerCase()}`,
      type: resultNomenclature ? "nomenclature" : "bom",
      parentId: "root",
      bomListId: resultNomenclature ? "" : bom.id,
      nomenclatureId: resultNomenclature?.id || "",
      executionType: "make",
      fulfillmentMode: "produce",
      operationId: "",
      operationName: "",
      departmentName: "",
      name: resultNomenclature?.name || bom.name,
      quantity: Number(quantity || 1),
      unit: resultNomenclature?.unit || "шт.",
      boardsPerPanel: 1,
      resultItem: resultNomenclature?.name || bom.resultItem || bom.boardCode || "",
      note: resultNomenclature ? `Результат платы ${slot}` : `Плата ${slot}`,
      position: rows.length + 1,
    }, rows.length));
  };

  pushBom(specification.bomListA, specification.bomQtyA, "A");
  pushBom(specification.bomListB, specification.bomQtyB, "B");

  String(specification.extraItems || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((name) => {
      rows.push(normalizeSpecificationStructureItem({
        id: `${specification.id || "spec"}-part-${rows.length + 1}`,
        type: "nomenclature",
        parentId: "root",
        fulfillmentMode: "purchase",
        name,
        quantity: 1,
        unit: "шт.",
        resultItem: name,
        note: "Дополнительный состав",
        position: rows.length + 1,
      }, rows.length));
    });

  return rows;
}

function getSpecificationStructureItems(specification) {
  if (!specification) return [];
  const hasManagedStructure = Boolean(specification.structureManaged);
  const sourceItems = hasManagedStructure
    ? specification.structureItems || []
    : Array.isArray(specification.structureItems) && specification.structureItems.length
      ? specification.structureItems
      : buildDefaultSpecificationStructureItems(specification);
  return sourceItems
    .map((item, index) => normalizeSpecificationStructureItem(item, index))
    .sort((left, right) => left.position - right.position);
}

function getSpecificationBomCandidates(specification, items = []) {
  const candidates = [];
  const seenIds = new Set();
  const addBom = (bom) => {
    if (!bom?.id || seenIds.has(bom.id)) return;
    seenIds.add(bom.id);
    candidates.push(bom);
  };

  [specification?.bomListA, specification?.bomListB]
    .map((bomId) => getBomList(bomId))
    .forEach(addBom);
  items
    .map((item) => getBomList(item.bomListId))
    .forEach(addBom);
  (directoryState.bomLists || []).forEach(addBom);

  return candidates;
}

function pickDefaultBomForSpecificationItem(specification, items = [], currentItemId = "") {
  const usedBomIds = new Set(items
    .filter((item) => item.id !== currentItemId && item.type === "bom" && item.bomListId)
    .map((item) => item.bomListId));
  const candidates = getSpecificationBomCandidates(specification, items);
  return candidates.find((bom) => !usedBomIds.has(bom.id)) || candidates[0] || null;
}

function getDefaultSpekiOperationName(type, executionType = "make") {
  return "";
}

function getSpekiOperationOptions() {
  return [
    { value: "", label: "Операция не требуется", meta: "для покупных изделий" },
    ...getOperationMapRows({ includeInactive: false }).map((operation) => {
      const center = getWorkCenter(getOperationRouteWorkCenterId(operation));
      return {
        value: operation.id,
        label: operation.name || "Операция без названия",
        meta: center?.name || "отдел не выбран",
      };
    }),
  ];
}

function getSpekiDepartmentOptions() {
  return [
    { value: "", label: "Отдел не выбран", meta: "назначьте для операции" },
    ...getEmployeeDepartmentNames().map((name) => ({ value: name, label: name, meta: "модуль сотрудники" })),
  ];
}

function getDefaultSpekiDepartmentName(operationName) {
  const normalizedOperation = String(operationName || "").toLowerCase();
  if (!normalizedOperation) return "";
  const names = getEmployeeDepartmentNames();
  const rules = [
    { tokens: ["smt"], preferred: ["SMT-монтаж", "SMT отдел", "STM отдел"] },
    { tokens: ["aoi", "аои"], preferred: ["AOI-контроль", "ОТК / AOI-контроль", "ОТК"] },
    { tokens: ["контроль", "тест", "испыт"], preferred: ["Тестирование", "ОТК / Испытания", "ОТК"] },
    { tokens: ["отмыв"], preferred: ["Отмывка"] },
    { tokens: ["ручн", "tht"], preferred: ["Ручной монтаж", "THT отдел"] },
    { tokens: ["лакир"], preferred: ["Лакировка", "Отдел селективной лакировки", "Отдел ручной лакировки"] },
    { tokens: ["слесар", "механ"], preferred: ["Слесарное отдел", "Слесарный отдел"] },
    { tokens: ["сбор"], preferred: ["Сборка", "Сборочный отдел", "Слесарный отдел"] },
    { tokens: ["программ", "прошив"], preferred: ["Отдел программной подготовки изделий"] },
    { tokens: ["комплект"], preferred: ["Склад", "Склад компонентов"] },
    { tokens: ["закуп"], preferred: ["Закупки и снабжение"] },
    { tokens: ["склад", "упаков"], preferred: ["Склад", "Склад готовой продукции", "Склад компонентов"] },
  ];
  const rule = rules.find((item) => item.tokens.some((token) => normalizedOperation.includes(token)));
  if (!rule) return "";
  return rule.preferred
    .map((preferredName) => names.find((name) => name.toLowerCase() === preferredName.toLowerCase()))
    .find(Boolean)
    || names.find((name) => rule.preferred.some((preferredName) => name.toLowerCase().includes(preferredName.toLowerCase())))
    || "";
}

function getRouteStepsForModule(routeId) {
  return (planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId)
    .sort((left, right) => {
      const taskDelta = getRouteStepTaskId(left).localeCompare(getRouteStepTaskId(right), "ru");
      return taskDelta || Number(left.stepOrder || 0) - Number(right.stepOrder || 0);
    });
}

function getRouteStepTaskId(step) {
  return step?.specTaskId || MAIN_ROUTE_TASK_ID;
}

function getRouteStepsForTask(steps, taskId) {
  return (steps || [])
    .filter((step) => getRouteStepTaskId(step) === taskId)
    .sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
}

function getRouteBaseTasks(route) {
  return scopeRouteTasks(route, getRouteUnscopedBaseTasks(route));
}

function getRouteUnscopedBaseTasks(route) {
  const specification = getRouteSpecification(route);
  if (specification) return getSpecificationRouteTasks(specification);
  const bomTasks = getRouteBomTasks(route);
  if (bomTasks.length) return bomTasks;
  return getStandaloneRouteTasks(route);
}

function getStandaloneRouteTasks(route) {
  if (!route?.id) return [];
  const steps = getRouteStepsForModule(route.id);
  if (!steps.length) return [];

  const rootRouteId = route.rootRouteId || route.parentRouteId || route.id;
  const relatedRoutes = (planningState.routes || []).filter((item) => (
    item.id === route.id
    || item.rootRouteId === rootRouteId
    || item.parentRouteId === rootRouteId
  ));
  const taskIds = [...new Set(steps.map((step) => getRouteStepTaskId(step)))];

  return taskIds.map((taskId, index) => {
    const taskSteps = steps.filter((step) => getRouteStepTaskId(step) === taskId);
    const sample = taskSteps[0] || {};
    const linkedRoute = relatedRoutes.find((item) => String(item.routeTaskId || "") === taskId)
      || (String(route.routeTaskId || "") === taskId ? route : null);
    const number = String(linkedRoute?.routeTaskNumber || sample.specTaskNumber || index + 1);
    const title = linkedRoute?.routeTaskName
      || sample.specTaskName
      || (taskId === MAIN_ROUTE_TASK_ID ? route.name : "")
      || `Объект маршрута ${index + 1}`;
    const level = Math.max(0, number.split(".").length - 1);

    return {
      id: taskId,
      sourceItemId: linkedRoute?.routeTaskSourceItemId || sample.specTaskSourceItemId || "",
      sourceSpecificationId: linkedRoute?.routeTaskSourceSpecificationId || sample.specTaskSourceSpecificationId || "",
      parentTitle: "",
      number,
      level,
      type: "standalone",
      fulfillmentMode: sample.fulfillmentMode || "produce",
      title,
      hasChildren: false,
      isLast: index === taskIds.length - 1,
      continuationLevels: [],
      operationId: "",
      operationName: "Операции маршрутной карты",
      departmentName: "Маршрутная карта",
      quantity: Math.max(1, Number(sample.specTaskQuantity || sample.quantityMultiplier || 1)),
      unit: sample.specTaskUnit || "шт.",
      bomListId: sample.bomListId || "",
      boardsPerPanel: normalizeBoardsPerPanel(sample.boardsPerPanel, 1),
      workCenterId: sample.workCenterId || "",
      restoredFromRoute: true,
    };
  });
}

function getRouteBaseTaskIds(route) {
  return new Set(getRouteBaseTasks(route).map((task) => task.id));
}

function isRouteStepLinkedToCurrentRouteTask(route, step) {
  const taskId = String(step?.specTaskId || "").trim();
  if (!route?.id || !taskId || taskId === MAIN_ROUTE_TASK_ID) return false;
  return getRouteBaseTaskIds(route).has(taskId);
}

function pruneRouteStepsOutsideCurrentRouteTasks(state = planningState) {
  if (!state || !Array.isArray(state.routeSteps)) return new Set();
  const routesById = new Map((state.routes || []).map((route) => [route.id, route]));
  const taskIdsByRouteId = new Map();
  const removedStepIds = new Set();
  const stepsByRouteId = new Map();

  state.routeSteps.forEach((step) => {
    const routeId = step?.routeId || "";
    if (!stepsByRouteId.has(routeId)) stepsByRouteId.set(routeId, []);
    stepsByRouteId.get(routeId).push(step);
  });

  const nextSteps = [];
  stepsByRouteId.forEach((steps, routeId) => {
    const route = routesById.get(routeId);
    if (!route) {
      steps.forEach((step) => removedStepIds.add(step.id));
      return;
    }
    if (!taskIdsByRouteId.has(route.id)) {
      taskIdsByRouteId.set(route.id, getRouteBaseTaskIds(route));
    }
    const routeTaskIds = taskIdsByRouteId.get(route.id);
    const kept = [];
    const removed = [];
    steps.forEach((step) => {
      const taskId = String(step?.specTaskId || "").trim();
      if (taskId && taskId !== MAIN_ROUTE_TASK_ID && routeTaskIds.has(taskId)) {
        kept.push(step);
      } else {
        removed.push(step);
      }
    });

    if (!kept.length && steps.length) {
      nextSteps.push(...steps);
      return;
    }

    nextSteps.push(...kept);
    removed.forEach((step) => removedStepIds.add(step.id));
  });

  state.routeSteps = nextSteps;

  return removedStepIds;
}

function getRouteProductionId(route = null) {
  return route?.specificationId || route?.projectId || "";
}

function getRouteProductionContext(route = null) {
  const productionId = getRouteProductionId(route);
  return productionId ? getProject(productionId) : null;
}

function getRoutePlanningContext(route = null) {
  const production = getRouteProductionContext(route);
  if (production) return production;

  const bom = getRouteBomList(route);
  if (!bom) return null;
  const title = bom.resultItem || bom.boardCode || bom.name || "Печатная плата";
  return {
    id: `bom:${bom.id}`,
    name: title,
    productName: title,
    orderNumber: route?.name || bom.name || title,
    customer: "",
    totalQuantity: normalizeOptionalPositiveInteger(route?.planningQuantity) || 1,
    status: getWorkOrderPlanningStatusValue(route),
    dueDate: toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
    bomListId: bom.id,
    sourceType: "bom",
  };
}

function getRouteConcreteTasksForPlanning(route) {
  return getRouteTasksForModule(route)
    .filter((task) => !task.isMain && !task.isOrphan);
}

function getPlanningTasksForRoute(route, steps = null) {
  return getRouteTasksForModule(route);
}

function getRouteStepsForPlanningTask(route, task, steps = null) {
  const routeSteps = steps || getRouteStepsForModule(route?.id || "");
  return getRouteStepsForTask(routeSteps, task?.id || "");
}

function getRouteForStep(step = {}) {
  return (planningState.routes || []).find((route) => route.id === step?.routeId) || null;
}

function getRouteStepPlanningTask(route, step, steps = null) {
  if (!route?.id || !step?.id) return null;
  const taskId = getRouteStepTaskId(step);
  const tasks = getRouteTasksForModule(route);
  return tasks.find((task) => task.id === taskId) || null;
}

function getRouteStepEffectiveQuantityMultiplier(step = {}, route = null) {
  const explicitMultiplier = Math.max(1, Number(step.quantityMultiplier || step.specTaskQuantity || 1));
  const resolvedRoute = route || getRouteForStep(step);
  const task = getRouteStepPlanningTask(resolvedRoute, step);
  return Math.max(1, Number(task?.quantity || explicitMultiplier));
}

function getRouteStepEffectiveBoardsPerPanel(route, step = {}) {
  const task = getRouteStepPlanningTask(route, step);
  const sourceId = task?.sourceItemId || task?.id || step.specTaskSourceItemId || step.bomListId || "";
  const fallback = task?.boardsPerPanel || step.boardsPerPanel || 1;
  return sourceId && route
    ? getPlanningBoardsPerPanel(route, sourceId, fallback)
    : normalizeBoardsPerPanel(fallback, 1);
}

function getRouteStepEffectiveBomListId(route, step = {}) {
  return step.bomListId || getRouteStepPlanningTask(route, step)?.bomListId || "";
}

function getRouteStepEffectiveOperationContext(route, step = {}, planningWorkCenterId = "", resourceId = "") {
  const task = getRouteStepPlanningTask(route, step);
  return {
    ...step,
    specTaskId: step.specTaskId || task?.id || "",
    specTaskSourceItemId: step.specTaskSourceItemId || task?.sourceItemId || "",
    specTaskName: step.specTaskName || task?.title || "",
    specTaskQuantity: Math.max(1, Number(step.specTaskQuantity || task?.quantity || 1)),
    fulfillmentMode: task?.fulfillmentMode || step.fulfillmentMode || "produce",
    quantityMultiplier: getRouteStepEffectiveQuantityMultiplier(step, route),
    bomListId: getRouteStepEffectiveBomListId(route, step),
    boardsPerPanel: getRouteStepEffectiveBoardsPerPanel(route, step),
    routeWorkCenterId: step.workCenterId,
    workCenterId: planningWorkCenterId || step.workCenterId || "",
    resourceId: resourceId || step.resourceId || "",
  };
}

function normalizeRouteStepFlowItems(items, kind = "input") {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const label = String(item?.label || item?.name || item?.title || "").trim();
      if (!label) return null;
      return {
        id: String(item.id || `${kind}-${index + 1}`),
        kind,
        sourceType: String(item.sourceType || item.type || "manual"),
        sourceId: String(item.sourceId || ""),
        label,
        quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : null,
        unit: String(item.unit || "").trim(),
      };
    })
    .filter(Boolean);
}

function makeManualRouteStepFlowItems(kind, rawValue) {
  const label = String(rawValue || "").trim();
  return label ? [{
    id: `${kind}-manual`,
    kind,
    sourceType: "manual",
    sourceId: "",
    label,
    quantity: null,
    unit: "",
  }] : [];
}

function getRouteStepManualFlowLabel(step = {}, kind = "input") {
  const field = kind === "output" ? "operationOutputs" : "operationInputs";
  const items = normalizeRouteStepFlowItems(step[field], kind);
  return items.length === 1 && items[0].sourceType === "manual" ? items[0].label : "";
}

function makeRouteStepFlowItem(kind, label, sourceType = "derived", sourceId = "", extra = {}) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) return null;
  return {
    id: `${kind}-${sourceType}-${sourceId || cleanLabel}`.slice(0, 96),
    kind,
    sourceType,
    sourceId: String(sourceId || ""),
    label: cleanLabel,
    quantity: extra.quantity ?? null,
    unit: extra.unit || "",
  };
}

function getRouteTaskSourceSpecification(route = null, task = {}) {
  return getSpecificationById(task?.sourceSpecificationId || "")
    || getRouteSpecification(route)
    || null;
}

function getRouteTaskSourceStructureItem(route = null, task = {}) {
  const specification = getRouteTaskSourceSpecification(route, task);
  const sourceItemId = String(task?.sourceItemId || "").trim();
  if (!specification || !sourceItemId) return null;
  return getSpecificationStructureItems(specification).find((item) => item.id === sourceItemId) || null;
}

function getRouteTaskChildStructureItems(route = null, task = {}) {
  const specification = getRouteTaskSourceSpecification(route, task);
  const sourceItemId = String(task?.sourceItemId || "").trim();
  if (!specification || !sourceItemId) return [];
  return getSpecificationStructureItems(specification)
    .filter((item) => (item.parentId || "root") === sourceItemId);
}

function getRouteTaskProducedObjectLabel(route = null, task = null, bom = null, production = null) {
  if (task?.isMain) {
    return getProjectDisplayOutput(production)
      || getProjectDisplayName(production)
      || route?.name
      || "Готовое изделие";
  }

  const sourceItem = getRouteTaskSourceStructureItem(route, task);
  const sourceLabel = sourceItem ? getSpekiStructureItemDisplayName(sourceItem) : "";
  const taskTitle = String(task?.title || sourceLabel || "").trim();
  const sourceSpecification = getRouteTaskSourceSpecification(route, task);
  const isRootAssembly = task?.type === "assembly" && (sourceItem?.parentId || "root") === "root";

  if (isRootAssembly) {
    const technicalOutput = /^изделие\s*\d+$/i.test(String(sourceSpecification?.outputItem || "").trim());
    return technicalOutput
      ? sourceSpecification?.name || sourceSpecification?.outputItem || getProjectDisplayName(production) || getProjectDisplayOutput(production) || taskTitle || "Готовое изделие"
      : sourceSpecification?.outputItem || sourceSpecification?.name || getProjectDisplayOutput(production) || getProjectDisplayName(production) || taskTitle || "Готовое изделие";
  }
  if (task?.type === "assembly") return taskTitle || "Производимая позиция";
  if (task?.type === "bom") return bom?.resultItem || taskTitle || bom?.name || "Печатная плата";
  if (task?.type === "specification") {
    const specification = getSpecificationById(sourceItem?.specificationId || task?.sourceSpecificationId || "");
    return specification?.outputItem || taskTitle || specification?.name || "Состав изделия";
  }
  if (task?.type === "nomenclature" || task?.type === "part") {
    return taskTitle || "Производимая позиция";
  }

  return taskTitle || bom?.resultItem || bom?.name || getProjectDisplayOutput(production) || "Результат ветки";
}

function renderRouteTaskOutputHint(route = null, task = null, options = {}) {
  if (!task || task.isOrphan) return "";
  const fulfillmentMode = normalizeStructureFulfillmentMode(task.fulfillmentMode || "", task.isMain ? "produce" : "not_selected");
  if (fulfillmentMode !== "produce") return "";
  const label = getRouteTaskProducedObjectLabel(
    route,
    task,
    getBomList(task.bomListId || ""),
    getRoutePlanningContext(route),
  );
  if (!label) return "";
  const prefix = options.prefix || "Выход";
  return `<small class="route-task-output-hint" title="${escapeAttribute(`${prefix}: ${label}`)}">${escapeHtml(prefix)}: ${escapeHtml(label)}</small>`;
}

function getRouteTaskInputObjectLabel(route = null, task = null, fallback = "") {
  if (task?.isMain) {
    const childLabels = getRouteConcreteTasksForPlanning(route)
      .filter((item) => normalizeStructureFulfillmentMode(item.fulfillmentMode || "", "produce") === "produce")
      .map((item) => getRouteTaskProducedObjectLabel(route, item, getBomList(item.bomListId || ""), getRoutePlanningContext(route)));
    return joinRouteStepFlowLabels(childLabels, fallback || "Полуфабрикаты состава изделия");
  }

  const childLabels = getRouteTaskChildStructureItems(route, task)
    .map((item) => getSpekiStructureItemDisplayName(item));
  if (childLabels.length) return joinRouteStepFlowLabels(childLabels, fallback || "Входы узла");
  return fallback;
}

function isLastProductionStepForRouteTask(route = null, step = {}, task = null) {
  if (!route?.id || !step?.id) return false;
  const taskId = task?.id || getRouteStepTaskId(step);
  const productionSteps = getRouteStepsForTask(getRouteStepsForModule(route.id), taskId)
    .filter((item) => !isWarehouseWorkCenterId(item.workCenterId));
  if (!productionSteps.length) return false;
  return productionSteps[productionSteps.length - 1]?.id === step.id;
}

function joinRouteStepFlowLabels(labels, fallback) {
  const clean = labels.map((label) => String(label || "").trim()).filter(Boolean);
  if (!clean.length) return fallback;
  if (clean.length <= 2) return clean.join(" + ");
  return `${clean.slice(0, 2).join(" + ")} + еще ${clean.length - 2}`;
}

function getRouteStepFlowTarget(route = null, step = {}) {
  const task = getRouteStepPlanningTask(route, step);
  const bom = getBomList(getRouteStepEffectiveBomListId(route, step) || route?.bomListId || "");
  const production = getRoutePlanningContext(route);
  const producedObjectLabel = getRouteTaskProducedObjectLabel(route, task, bom, production);
  return {
    task,
    bom,
    production,
    targetLabel: task?.title
      || bom?.resultItem
      || bom?.name
      || step.specTaskName
      || production?.name
      || "объект маршрута",
    outputLabel: producedObjectLabel
      || bom?.resultItem
      || task?.title
      || production?.name
      || step.specTaskName
      || "результат операции",
  };
}

function deriveRouteStepFlowItems(route = null, step = {}, kind = "input") {
  const { task, bom, production, targetLabel, outputLabel } = getRouteStepFlowTarget(route, step);
  const operation = getOperationMapItem(step.operationId);
  const taskId = getRouteStepTaskId(step);
  const isMainTask = taskId === MAIN_ROUTE_TASK_ID || task?.isMain;
  const isSmtStep = isSmtOperationWorkCenter(step.workCenterId, step, planningState) || routeStepRequiresManualPlanningLine(step, planningState);
  const isWarehouseOutput = isManufacturingOutputReceiptRouteStep(step);
  const isWarehouseIssue = isWarehouseIssueRouteStep(step) || task?.fulfillmentMode === "from_stock";
  const producedObjectLabel = getRouteTaskProducedObjectLabel(route, task, bom, production) || outputLabel;
  const taskInputLabel = getRouteTaskInputObjectLabel(route, task, `Полуфабрикат/материал: ${targetLabel}`);

  if (kind === "input") {
    if (isWarehouseOutput) {
      return [makeRouteStepFlowItem("input", `Готовый выпуск: ${producedObjectLabel}`, "operation-result", step.id)].filter(Boolean);
    }
    if (isWarehouseIssue) {
      return [makeRouteStepFlowItem("input", `Остаток склада: ${targetLabel}`, "warehouse-stock", task?.sourceItemId || step.id)].filter(Boolean);
    }
    if (isSmtStep && bom) {
      const boardLabel = bom.boardCode || bom.resultItem || bom.name || targetLabel;
      return [makeRouteStepFlowItem("input", `${boardLabel} + компоненты BOM`, "bom", bom.id)].filter(Boolean);
    }
    if (isMainTask) {
      return [makeRouteStepFlowItem("input", taskInputLabel, "composition", route?.id || "")].filter(Boolean);
    }
    return [makeRouteStepFlowItem("input", taskInputLabel, "route-task", task?.sourceItemId || step.id)].filter(Boolean);
  }

  if (isWarehouseOutput) {
    return [makeRouteStepFlowItem("output", `Принято: ${producedObjectLabel}`, "warehouse-receipt", task?.sourceItemId || step.id)].filter(Boolean);
  }
  if (isWarehouseIssue) {
    return [makeRouteStepFlowItem("output", `Выдано в производство: ${targetLabel}`, "warehouse-issue", task?.sourceItemId || step.id)].filter(Boolean);
  }
  if (isSmtStep && bom) {
    return [makeRouteStepFlowItem("output", bom.resultItem || `Смонтированная плата: ${targetLabel}`, "bom-result", bom.id)].filter(Boolean);
  }
  if (isMainTask) {
    const finalOutput = getProjectDisplayOutput(production) || production?.name || outputLabel;
    return [makeRouteStepFlowItem("output", finalOutput || "Готовое изделие", "production-output", production?.id || route?.id || "")].filter(Boolean);
  }
  const stepOutputLabel = isLastProductionStepForRouteTask(route, step, task)
    ? producedObjectLabel
    : operation?.businessOutput || `Состояние после операции: ${targetLabel}`;
  return [makeRouteStepFlowItem("output", stepOutputLabel, "operation-output", operation?.id || step.id)].filter(Boolean);
}

function getRouteStepFlowModel(route = null, step = {}) {
  const storedInputs = normalizeRouteStepFlowItems(step.operationInputs, "input");
  const storedOutputs = normalizeRouteStepFlowItems(step.operationOutputs, "output");
  const autoInputs = deriveRouteStepFlowItems(route, step, "input");
  const autoOutputs = deriveRouteStepFlowItems(route, step, "output");
  const inputs = storedInputs.length ? storedInputs : autoInputs;
  const outputs = storedOutputs.length ? storedOutputs : autoOutputs;
  return {
    inputs,
    outputs,
    autoInputs,
    autoOutputs,
    inputLabel: joinRouteStepFlowLabels(inputs.map((item) => item.label), "Вход не определен"),
    outputLabel: joinRouteStepFlowLabels(outputs.map((item) => item.label), "Выход не определен"),
    autoInputLabel: joinRouteStepFlowLabels(autoInputs.map((item) => item.label), "Вход будет определен после выбора объекта"),
    autoOutputLabel: joinRouteStepFlowLabels(autoOutputs.map((item) => item.label), "Выход будет определен после выбора операции"),
    inputMode: storedInputs.length ? "manual" : "auto",
    outputMode: storedOutputs.length ? "manual" : "auto",
  };
}

function getSlotOperationFlow(slot = {}, route = null, step = null) {
  const slotInputs = normalizeRouteStepFlowItems(slot.operationInputs, "input");
  const slotOutputs = normalizeRouteStepFlowItems(slot.operationOutputs, "output");
  if (slotInputs.length || slotOutputs.length) {
    return {
      inputs: slotInputs,
      outputs: slotOutputs,
      inputLabel: slot.operationInputLabel || joinRouteStepFlowLabels(slotInputs.map((item) => item.label), "Вход не определен"),
      outputLabel: slot.operationOutputLabel || joinRouteStepFlowLabels(slotOutputs.map((item) => item.label), "Выход не определен"),
      inputMode: "snapshot",
      outputMode: "snapshot",
    };
  }
  return getRouteStepFlowModel(route, step || {});
}

function renderOperationFlowMap(flow, options = {}) {
  const className = ["operation-flow-map", options.compact ? "is-compact" : "", options.editable ? "is-editable" : ""].filter(Boolean).join(" ");
  const qaPrefix = String(options.qaPrefix || "").trim();
  const rootQa = qaPrefix ? ` data-visual-qa-target="${escapeAttribute(`${qaPrefix}-flow-map`)}"` : "";
  const inputQa = qaPrefix ? ` data-visual-qa-target="${escapeAttribute(`${qaPrefix}-flow-input`)}"` : "";
  const outputQa = qaPrefix ? ` data-visual-qa-target="${escapeAttribute(`${qaPrefix}-flow-output`)}"` : "";
  return `
    <div class="${className}"${rootQa} aria-label="Входы и выходы операции">
      <span class="operation-flow-point"${inputQa}>
        <b>Вход</b>
        <strong>${escapeHtml(flow.inputLabel)}</strong>
      </span>
      <i aria-hidden="true">&rarr;</i>
      <span class="operation-flow-point"${outputQa}>
        <b>Выход</b>
        <strong>${escapeHtml(flow.outputLabel)}</strong>
      </span>
    </div>
  `;
}

function renderRouteStepFlowEditor(route, step) {
  const flow = getRouteStepFlowModel(route, step);
  const inputValue = getRouteStepManualFlowLabel(step, "input");
  const outputValue = getRouteStepManualFlowLabel(step, "output");
  return `
    <div class="route-step-flow-editor">
      ${renderOperationFlowMap(flow, { editable: true })}
      <details class="route-step-flow-override">
        <summary>Уточнить вход/выход</summary>
        <div>
          <label class="form-field ui-form-field">
            <span>Вход</span>
            <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="operationInputs" value="${escapeAttribute(inputValue)}" placeholder="${escapeAttribute(flow.autoInputLabel)}" />
          </label>
          <label class="form-field ui-form-field">
            <span>Выход</span>
            <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="operationOutputs" value="${escapeAttribute(outputValue)}" placeholder="${escapeAttribute(flow.autoOutputLabel)}" />
          </label>
        </div>
      </details>
    </div>
  `;
}

function renderRouteStepFlowSummary(route, step) {
  const flow = getRouteStepFlowModel(route, step);
  const title = `${flow.inputLabel} -> ${flow.outputLabel}`;
  return `
    <span class="route-step-flow-summary" title="${escapeAttribute(title)}">
      <b>Вход</b>
      <strong>${escapeHtml(flow.inputLabel)}</strong>
      <i aria-hidden="true">&rarr;</i>
      <b>Выход</b>
      <strong>${escapeHtml(flow.outputLabel)}</strong>
    </span>
  `;
}

function renderRouteStepFlowOverride(route, step) {
  const flow = getRouteStepFlowModel(route, step);
  const inputValue = getRouteStepManualFlowLabel(step, "input");
  const outputValue = getRouteStepManualFlowLabel(step, "output");
  return `
    <details class="route-step-flow-override route-step-flow-override-compact">
      <summary title="Уточнить вход и выход операции">${icon("info")}<span>Поток</span></summary>
      <div>
        ${renderOperationFlowMap(flow, { compact: true, editable: true })}
        <label class="form-field ui-form-field">
          <span>Вход</span>
          <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="operationInputs" value="${escapeAttribute(inputValue)}" placeholder="${escapeAttribute(flow.autoInputLabel)}" />
        </label>
        <label class="form-field ui-form-field">
          <span>Выход</span>
          <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="operationOutputs" value="${escapeAttribute(outputValue)}" placeholder="${escapeAttribute(flow.autoOutputLabel)}" />
        </label>
      </div>
    </details>
  `;
}

function renderRouteStepFlowToggle(step) {
  const isOpen = ui.routeFlowStepId === step.id;
  return `
    <button class="table-icon-button route-step-flow-toggle ui-action-button ${isOpen ? "is-active" : ""}" data-ui-component="ActionButton" data-ui-tone="table-icon" data-ui-size="table-icon" data-ui-variant="table-icon:table-icon" data-route-step-flow-toggle="${escapeAttribute(step.id)}" type="button" aria-expanded="${isOpen ? "true" : "false"}" title="${isOpen ? "Скрыть вход/выход операции" : "Уточнить вход/выход операции"}">
      ${icon("split")}
    </button>
  `;
}

function renderRouteStepFlowPanelRow(route, step, level) {
  if (ui.routeFlowStepId !== step.id) return "";
  const flow = getRouteStepFlowModel(route, step);
  const inputValue = getRouteStepManualFlowLabel(step, "input");
  const outputValue = getRouteStepManualFlowLabel(step, "output");
  return `
    <tr class="route-step-flow-panel-row" data-route-step-flow-panel="${escapeAttribute(step.id)}" style="--speki-level: ${level};">
      <td colspan="6">
        <div class="route-step-flow-panel">
          ${renderOperationFlowMap(flow, { compact: true, editable: true })}
          <label class="form-field ui-form-field">
            <span>Вход</span>
            <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="operationInputs" value="${escapeAttribute(inputValue)}" placeholder="${escapeAttribute(flow.autoInputLabel)}" />
          </label>
          <label class="form-field ui-form-field">
            <span>Выход</span>
            <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="operationOutputs" value="${escapeAttribute(outputValue)}" placeholder="${escapeAttribute(flow.autoOutputLabel)}" />
          </label>
        </div>
      </td>
    </tr>
  `;
}

function getRouteStepCalculationTypeView(value = "") {
  return ROUTE_STEP_CALCULATION_TYPES.find((item) => item.value === value)
    || ROUTE_STEP_CALCULATION_TYPES.find((item) => item.value === "manual");
}

function getRouteStepCalculationTypeOptions() {
  return ROUTE_STEP_CALCULATION_TYPES.map((item) => ({
    ...item,
    summaryMeta: "",
    tone: "labor-test",
    summaryTitle: `${item.label}: ${item.meta}`,
  }));
}

function getRouteStepLaborPlanningWorkCenterOptions(step = {}) {
  const candidates = getRouteStepPlanningCandidateWorkCenterIds(step, planningState);
  const selectedWorkCenterId = getRouteStepSelectedPlanningWorkCenterId(step, planningState);
  const options = [{
    value: "",
    label: candidates.length > 1 ? "Не выбран" : "Авто",
    meta: candidates.length > 1 ? "выберите ресурс плана" : "по отделу маршрута",
    summaryMeta: "",
    iconName: "settings",
    summaryTitle: "Ресурс планирования операции",
  }];

  candidates.forEach((workCenterId) => {
    const center = getWorkCenter(workCenterId);
    const resourceId = getPlanningResourceForRouteStep(step, workCenterId, step.resourceId || "");
    const resource = resourceId ? getProductionResource(resourceId) : null;
    const rate = Number(getResourceBaseCph(resource) || getWorkCenterUnitsPerHour(workCenterId, planningState) || 0);
    options.push({
      value: workCenterId,
      label: center?.name || resource?.name || workCenterId,
      meta: resource?.name || (rate ? `${formatReportNumber(rate)} ед/ч` : center?.code || "ресурс"),
      summaryMeta: "",
      iconName: "settings",
      summaryTitle: `${center?.name || workCenterId}${resource?.name ? ` · ${resource.name}` : ""}`,
    });
  });

  if (selectedWorkCenterId && !options.some((item) => item.value === selectedWorkCenterId)) {
    const center = getWorkCenter(selectedWorkCenterId);
    options.push({
      value: selectedWorkCenterId,
      label: center?.name || selectedWorkCenterId,
      meta: center?.code || "текущий ресурс",
      summaryMeta: "",
      iconName: "settings",
      summaryTitle: center?.name || selectedWorkCenterId,
    });
  }

  return options;
}

function getRouteStepLaborSnapshot(route, step = {}, options = {}) {
  const routeQuantity = normalizeQuantity(options.routeQuantity || getPlanningRouteQuantity(route), 1);
  const quantity = normalizeQuantity(options.quantity || getRouteStepQuantityForBatch(step, { quantity: routeQuantity }), routeQuantity);
  const planningWorkCenterId = getRouteStepSelectedPlanningWorkCenterId(step, planningState);
  const workCenterId = planningWorkCenterId || step.workCenterId || "";
  const resourceId = getPlanningResourceForRouteStep(step, workCenterId, step.resourceId || "");
  const operationContext = getRouteStepEffectiveOperationContext(route, step, workCenterId, resourceId);
  const calculationType = getDefaultOperationCalculationType(workCenterId, operationContext);
  const durationMs = workCenterId
    ? calculateRequiredDurationMs(workCenterId, quantity, planningState, operationContext.unitsPerHour, operationContext.boardsPerPanel, operationContext)
    : 0;
  const workCenter = getWorkCenter(workCenterId) || getWorkCenter(step.workCenterId);
  const resource = resourceId
    ? getProductionResource(resourceId)
      || getResourcesForWorkCenter(workCenterId).find((item) => item.id === resourceId)
      || null
    : null;
  const bomList = getDurationBomList(operationContext);
  const calculation = getRouteStepCalculationTypeView(calculationType);
  const isSmtLike = calculationType === "components" || isSmtOperationWorkCenter(workCenterId, operationContext, planningState);
  const manualCapacity = getWorkCenterManualCapacity(workCenterId, planningState);
  const resourceCapacity = parseCapacityCount(resource?.capacity);
  const resourceBaseCph = isSmtLike || Number(resource?.baseCph || 0) > 0
    ? getResourceBaseCph(resource)
    : 0;
  const resourceEfficiency = Math.max(0, Number(resource?.efficiency || 0));
  const resourceChangeoverMin = Math.max(0, Number(resource?.changeoverMin || 0));

  return {
    routeQuantity,
    quantity,
    workCenterId,
    workCenterLabel: workCenter?.name || workCenterId || "отдел не выбран",
    resourceId,
    resourceLabel: resource?.name || resource?.code || "авто",
    resourceTypeLabel: PRODUCTION_RESOURCE_TYPE_LABELS[resource?.type] || resource?.type || "ресурс",
    resourceParticipatesInPlanning: resource ? resourceParticipatesInPlanning(resource) : false,
    resourceParticipatesInCalculation: resource ? resourceParticipatesInCalculation(resource) : false,
    resourceCapacity,
    manualCapacity,
    resourceCapacityLabel: resource?.capacity || (manualCapacity ? `${formatReportNumber(manualCapacity)} паралл.` : "-"),
    resourceBaseCph,
    resourceEfficiency,
    resourceChangeoverMin,
    calculationType,
    calculationLabel: calculation?.summaryLabel || calculationType || "расчет",
    calculationMeta: calculation?.meta || "",
    durationMs,
    durationLabel: durationMs ? formatDuration(durationMs) : "не рассчитано",
    secondsPerPanel: Math.max(0, Number(operationContext.secondsPerPanel || 0)),
    unitsPerHour: Math.max(0, Number(operationContext.unitsPerHour || 0)),
    setupMin: Math.max(0, Number(operationContext.setupMin || 0)),
    boardsPerPanel: normalizeBoardsPerPanel(operationContext.boardsPerPanel, 1),
    bomLabel: bomList?.name || bomList?.resultItem || "BOM не привязан",
  };
}

function renderRouteStepLaborReadout(route, step, options = {}) {
  const snapshot = options.snapshot || getRouteStepLaborSnapshot(route, step, options);
  const className = options.className ? ` ${escapeAttribute(options.className)}` : "";
  return `
    <div class="route-step-labor-readout${className}">
      <article>
        <span>Метод</span>
        <strong>${escapeHtml(snapshot.calculationLabel)}</strong>
        <small>${escapeHtml(snapshot.calculationMeta)}</small>
      </article>
      <article>
        <span>Объем операции</span>
        <strong>${escapeHtml(formatReportNumber(snapshot.quantity))} шт.</strong>
        <small>заказ-наряд ${escapeHtml(formatReportNumber(snapshot.routeQuantity))} шт.</small>
      </article>
      <article>
        <span>Расчетная длительность</span>
        <strong>${escapeHtml(snapshot.durationLabel)}</strong>
        <small>setup ${escapeHtml(formatReportNumber(snapshot.setupMin))} мин</small>
      </article>
      <article>
        <span>Ресурс</span>
        <strong>${escapeHtml(snapshot.workCenterLabel)}</strong>
        <small>${escapeHtml(snapshot.resourceLabel)}</small>
      </article>
      <article>
        <span>База операции</span>
        <strong>${escapeHtml(formatReportNumber(snapshot.secondsPerPanel))} сек</strong>
        <small>${escapeHtml(formatReportNumber(snapshot.unitsPerHour))} шт/ч fallback</small>
      </article>
      <article>
        <span>Панель / BOM</span>
        <strong>${escapeHtml(formatReportNumber(snapshot.boardsPerPanel))} шт.</strong>
        <small>${escapeHtml(snapshot.bomLabel)}</small>
      </article>
    </div>
    ${renderRouteStepResourceFactorReadout(snapshot, className)}
  `;
}

function renderRouteStepResourceFactorReadout(snapshot, className = "") {
  const planningLabel = snapshot.resourceParticipatesInPlanning ? "Да" : "Нет";
  const calculationLabel = snapshot.resourceParticipatesInCalculation ? "Да" : "Нет";
  const capacityLabel = snapshot.resourceCapacity
    ? `${formatReportNumber(snapshot.resourceCapacity)} ед.`
    : snapshot.resourceCapacityLabel || "-";
  const manualCapacityLabel = snapshot.manualCapacity
    ? `ручная формула: ${formatReportNumber(snapshot.manualCapacity)} паралл.`
    : "трудозатраты не заданы";
  const cphLabel = snapshot.resourceBaseCph
    ? `${Number(snapshot.resourceBaseCph || 0).toLocaleString("ru-RU")} комп./ч`
    : "-";
  const efficiencyLabel = snapshot.resourceEfficiency
    ? `${formatReportNumber(snapshot.resourceEfficiency)} %`
    : "-";

  return `
    <div class="route-step-resource-factors${className}">
      <article>
        <span>Участие</span>
        <strong>${escapeHtml(planningLabel)} / ${escapeHtml(calculationLabel)}</strong>
        <small>Гант / расчет</small>
      </article>
      <article>
        <span>Доступность</span>
        <strong>${escapeHtml(capacityLabel)}</strong>
        <small>${escapeHtml(manualCapacityLabel)}</small>
      </article>
      <article>
        <span>База SMT</span>
        <strong>${escapeHtml(cphLabel)}</strong>
        <small>baseCph ресурса</small>
      </article>
      <article>
        <span>Эффективность</span>
        <strong>${escapeHtml(efficiencyLabel)}</strong>
        <small>коэффициент линии</small>
      </article>
      <article>
        <span>Setup ресурса</span>
        <strong>${escapeHtml(formatReportNumber(snapshot.resourceChangeoverMin))} мин</strong>
        <small>дефолт для операции</small>
      </article>
      <article>
        <span>Тип ресурса</span>
        <strong>${escapeHtml(snapshot.resourceTypeLabel)}</strong>
        <small>${escapeHtml(snapshot.resourceLabel)}</small>
      </article>
    </div>
  `;
}

function renderRouteStepLaborToggle(step) {
  const isOpen = ui.routeLaborStepId === step.id;
  return `
    <button class="table-icon-button route-step-labor-toggle ui-action-button ${isOpen ? "is-active" : ""}" data-ui-component="ActionButton" data-ui-tone="warning" data-ui-size="table-icon" data-ui-variant="warning:table-icon" data-route-step-labor-toggle="${escapeAttribute(step.id)}" type="button" aria-expanded="${isOpen ? "true" : "false"}" title="${isOpen ? "Скрыть трудоемкость" : "Показать трудоемкость и расчет длительности"}">
      ${icon("clock")}
    </button>
  `;
}

function renderRouteStepLaborPanelRow(route, step, level) {
  if (ui.routeLaborStepId !== step.id) return "";
  const snapshot = getRouteStepLaborSnapshot(route, step);
  const calculationOptions = getRouteStepCalculationTypeOptions();
  const planningLineOptions = getRouteStepLaborPlanningWorkCenterOptions(step);
  const planningLineValue = getRouteStepExplicitPlanningWorkCenterId(step) || snapshot.workCenterId;
  const secondsLabel = snapshot.calculationType === "normative"
    ? "Сек/цикл"
    : snapshot.calculationType === "components"
      ? "Сек вруч."
      : "Сек/шт";

  return `
    <tr class="route-step-labor-panel-row" data-route-step-labor-panel="${escapeAttribute(step.id)}" style="--speki-level: ${level};">
      <td colspan="6">
        <div class="route-step-labor-strip">
          <header class="route-step-labor-strip-head">
            <strong>Трудоемкость</strong>
            <em>расчет заказ-наряда</em>
          </header>
          <div class="route-step-labor-controls route-step-labor-strip-controls">
            <div class="form-field route-step-labor-field ui-form-field">
              <span>Метод</span>
              ${renderDenseInlineSelect("calculationType", step.calculationType || snapshot.calculationType, calculationOptions, { type: "routeStep", stepId: step.id, tone: "labor-test" })}
            </div>
            <div class="form-field route-step-labor-field ui-form-field">
              <span>Ресурс</span>
              ${renderDenseInlineSelect("planningWorkCenterId", planningLineValue, planningLineOptions, { type: "routeStep", stepId: step.id, tone: "labor-test", disabled: planningLineOptions.length <= 1 && !planningLineValue })}
            </div>
            <label class="form-field route-step-labor-field ui-form-field">
              <span>${escapeHtml(secondsLabel)}</span>
              <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="secondsPerPanel" type="number" inputmode="decimal" min="0" step="1" value="${escapeAttribute(snapshot.secondsPerPanel)}" />
            </label>
            <label class="form-field route-step-labor-field ui-form-field">
              <span>Шт/ч</span>
              <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="unitsPerHour" type="number" inputmode="decimal" min="0" step="0.1" value="${escapeAttribute(snapshot.unitsPerHour)}" />
            </label>
            <label class="form-field route-step-labor-field ui-form-field">
              <span>Setup</span>
              <input data-route-step-input="${escapeAttribute(step.id)}" data-route-step-field="setupMin" type="number" inputmode="decimal" min="0" step="1" value="${escapeAttribute(snapshot.setupMin)}" />
            </label>
          </div>
          <div class="route-step-labor-strip-summary">
            <span><b>Длит.</b> ${escapeHtml(snapshot.durationLabel)}</span>
            <span><b>Ресурс</b> ${escapeHtml(snapshot.resourceLabel)}</span>
            <span><b>База</b> ${escapeHtml(formatReportNumber(snapshot.secondsPerPanel))} сек</span>
            <span><b>Панель</b> ${escapeHtml(formatReportNumber(snapshot.boardsPerPanel))} шт.</span>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function getWorkCenterIdForRouteTask(task) {
  const targetUnit = (planningState.workCenters || []).find((center) => (
    isPlanningWorkCenter(center)
    && normalizeLookupText(center.name) === normalizeLookupText(task?.departmentName)
  ));
  if (targetUnit) return targetUnit.id;

  const text = `${task?.operationName || ""} ${task?.departmentName || ""} ${task?.title || ""}`.toLowerCase();
  if (text.includes("smt") || text.includes("smd") || text.includes("паяль") || text.includes("оплав")) return "D3";
  if (text.includes("aoi") || text.includes("аои") || text.includes("инспек")) return "D3_AOI";
  if (text.includes("отмыв")) return "D3_UW";
  if (text.includes("tht") || text.includes("ручн") || text.includes("выводн")) return "D5";
  if (text.includes("тест") || text.includes("контрол") || text.includes("испыт")) return "D4";
  if (text.includes("селектив") || text.includes("влагозащ")) return "D3_CC";
  if (text.includes("лакир")) return "D3_CC";
  if (text.includes("прошив")) return "D6";
  if (text.includes("слесар") || text.includes("механ") || text.includes("сбор")) return "D9";
  if (text.includes("маркир") || text.includes("упаков")) return "D11";
  return getPlanningWorkCenters({ includeWarehouse: false })[0]?.id || "D5";
}

function getSpecificationRouteTasks(specification, context = {}) {
  if (!specification) return [];
  const visitedSpecificationIds = new Set(context.visitedSpecificationIds || []);
  if (visitedSpecificationIds.has(specification.id)) return [];
  visitedSpecificationIds.add(specification.id);

  const tasks = [];
  const hasDocumentRoot = !context.numberPrefix && specification.sourceSpecifications2EntryId;
  if (hasDocumentRoot) {
    tasks.push({
      id: `spec-root:${specification.id}`,
      sourceItemId: "root",
      sourceSpecificationId: specification.id,
      parentTitle: "",
      number: "00",
      level: 0,
      type: "nomenclature",
      fulfillmentMode: "produce",
      title: specification.outputItem || specification.name || "Результирующее изделие",
      hasChildren: true,
      isLast: false,
      continuationLevels: [],
      operationId: "",
      operationName: "Операции маршрутной карты",
      departmentName: "Маршрутная карта",
      quantity: Math.max(1, Number(specification.productionQuantity || 1)),
      unit: "шт.",
      bomListId: "",
      boardsPerPanel: 1,
      workCenterId: "",
      isMain: true,
    });
  }
  getSpekiStructureTableRows(specification).forEach(({ item, number, level, hasChildren, isLast, continuationLevels = [] }) => {
    const fulfillmentMode = getSpecificationItemFulfillmentMode(item);
    if (!isSchedulableFulfillmentMode(fulfillmentMode)) return;

    const nomenclatureItem = item.type === "nomenclature" || item.type === "part"
      ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)
      : null;
    const linkedSpecificationId = item.type === "specification"
      ? item.specificationId
      : nomenclatureItem?.producedBySpecificationId || "";
    if (linkedSpecificationId && linkedSpecificationId !== specification.id) {
      const linkedSpecification = getSpecificationById(linkedSpecificationId);
      const nestedTasks = getSpecificationRouteTasks(linkedSpecification, {
        visitedSpecificationIds,
        numberPrefix: context.numberPrefix ? `${context.numberPrefix}.${number}` : number,
        levelOffset: Number(context.levelOffset || 0) + level + 1,
        parentTitle: getSpekiStructureItemLabel(item),
      });
      if (nestedTasks.length) {
        tasks.push(...nestedTasks);
        return;
      }
    }

    const title = getSpekiStructureItemLabel(item);
    const bomId = getSpecificationItemBomId(item);
    const taskType = bomId ? "bom" : item.type;
    const operation = getOperationMapItem(item.operationId);
    const operationName = operation?.name || item.operationName || (fulfillmentMode === "from_stock" ? "Выдача со склада" : "");
    const departmentName = operation
      ? getWorkCenter(getOperationRouteWorkCenterId(operation))?.name || item.departmentName || ""
      : item.departmentName || (fulfillmentMode === "from_stock" ? "Склад" : "");
    const task = {
      id: context.numberPrefix ? `spec-item:${specification.id}:${item.id}` : `spec-item:${item.id}`,
      sourceItemId: item.id,
      sourceSpecificationId: specification.id,
      parentTitle: context.parentTitle || "",
      number: context.numberPrefix ? `${context.numberPrefix}.${number}` : number,
      // The synthetic document root is rendered as a real first level in a
      // planning order.  Every source row therefore starts one level below it;
      // otherwise the root and its children are visual siblings and collapsing
      // the root cannot hide the actual structure.
      level: Number(context.levelOffset || 0) + level + (hasDocumentRoot ? 1 : 0),
      type: taskType,
      fulfillmentMode,
      title,
      hasChildren,
      isLast,
      // The document root has no sibling.  Reserve its guide slot so deeper
      // source rows keep their original ancestor-line geometry.
      continuationLevels: hasDocumentRoot ? [false, ...continuationLevels] : continuationLevels,
      operationId: operation?.id || item.operationId || "",
      operationName,
      departmentName: departmentName || "Отдел не выбран",
      quantity: Math.max(1, Number(item.quantity || 1)),
      unit: item.unit || "шт.",
      bomListId: bomId,
      boardsPerPanel: getSpecificationItemBoardsPerPanel(item),
    };
    tasks.push({
      ...task,
      workCenterId: fulfillmentMode === "from_stock" && !operation ? "D1" : operation ? getOperationRouteWorkCenterId(operation) : getWorkCenterIdForRouteTask(task),
    });
  });

  return tasks;
}

function getRouteBomTasks(route) {
  const bom = getRouteBomList(route);
  if (!bom) return [];
  const resultNomenclature = getBomResultNomenclatureItem(bom.id);
  const title = resultNomenclature?.name || bom.resultItem || bom.boardCode || bom.name || "Печатная плата";
  const task = {
    id: `bom:${bom.id}`,
    sourceItemId: bom.id,
    sourceSpecificationId: "",
    parentTitle: "",
    number: "01",
    level: 0,
    type: "bom",
    title,
    operationId: "",
    operationName: "Операции маршрутной карты",
    departmentName: "Маршрутная карта",
    quantity: 1,
    unit: "шт.",
    bomListId: bom.id,
    boardsPerPanel: normalizeBoardsPerPanel(route?.boardsPerPanel, 1),
  };
  return [{
    ...task,
    workCenterId: getWorkCenterIdForRouteTask(task),
  }];
}

function getRouteTasksForModule(route) {
  return getRouteBaseTasks(route);
}

function getSchedulableRouteSteps(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId) || null;
  const steps = getRouteStepsForModule(routeId)
    .filter((step) => isRouteStepLinkedToCurrentRouteTask(route, step))
    .filter((step) => step.isRequired)
    .filter((step) => Boolean(getOperationMapItem(step.operationId)));
  return steps.sort(compareRouteStepsForScheduling);
}

function compareRouteStepsForScheduling(left, right) {
  const leftTaskId = getRouteStepTaskId(left);
  const rightTaskId = getRouteStepTaskId(right);
  const leftIsMain = leftTaskId === MAIN_ROUTE_TASK_ID;
  const rightIsMain = rightTaskId === MAIN_ROUTE_TASK_ID;
  if (leftIsMain !== rightIsMain) return leftIsMain ? 1 : -1;
  return leftTaskId.localeCompare(rightTaskId, "ru")
    || Number(left.stepOrder || 0) - Number(right.stepOrder || 0);
}

function getInvalidRouteOperationSteps(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId) || null;
  return getRouteStepsForModule(routeId)
    .filter((step) => isRouteStepLinkedToCurrentRouteTask(route, step))
    .filter((step) => step.isRequired && !getOperationMapItem(step.operationId));
}

function getSchedulableProjectRouteSteps(productionId) {
  const route = getProjectRouteForModule(productionId);
  return route ? getSchedulableRouteSteps(route.id) : [];
}

function ensureRouteTaskSeedSteps(routeId, specification) {
  if (!routeId || !specification) return false;
  const route = (planningState.routes || []).find((item) => item.id === routeId) || null;
  const tasks = route ? getRouteTasksForModule(route) : getSpecificationRouteTasks(specification);
  if (!tasks.length) return false;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  let changed = false;

  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    if (step.routeId !== routeId) return step;
    const task = taskById.get(getRouteStepTaskId(step));
    if (!task) return step;
	    const boardsPerPanel = task.type === "bom"
	      ? getPlanningBoardsPerPanel(route, task.sourceItemId || task.id, task.boardsPerPanel || step.boardsPerPanel || 1)
	      : 1;
	    const nextQuantity = Math.max(1, Number(task.quantity || 1));
	    const normalizedStep = normalizeRouteStepCalculationFields({
	      ...step,
	      boardsPerPanel,
	      bomListId: task.bomListId || step.bomListId || "",
	    }, planningState);
	    const patch = {
	      specTaskSourceItemId: task.sourceItemId || step.specTaskSourceItemId || "",
	      specTaskName: task.title || step.specTaskName || "",
	      specTaskQuantity: nextQuantity,
	      fulfillmentMode: task.fulfillmentMode || step.fulfillmentMode || "produce",
	      quantityMultiplier: nextQuantity,
	      bomListId: task.bomListId || step.bomListId || "",
	      boardsPerPanel,
	      resourceId: step.resourceId || normalizedStep.resourceId || "",
	      calculationType: normalizedStep.calculationType,
	      secondsPerPanel: Number(step.secondsPerPanel || normalizedStep.secondsPerPanel || 0),
	      setupMin: Number(step.setupMin ?? normalizedStep.setupMin ?? 0),
	      unitsPerHour: Number(step.unitsPerHour || normalizedStep.unitsPerHour || 0),
	    };
    const needsPatch = Object.entries(patch).some(([key, value]) => String(step[key] ?? "") !== String(value ?? ""));
    if (!needsPatch) return step;
    changed = true;
    return { ...step, ...patch, updatedAt: new Date().toISOString() };
  });
  return changed;
}

function getProjectRouteForModule(productionId) {
  return (planningState.routes || []).find((route) => (route.specificationId === productionId || route.projectId === productionId) && route.isDefault)
    || (planningState.routes || []).find((route) => route.specificationId === productionId || route.projectId === productionId)
    || null;
}

function getSpecificationRouteForModule(specificationId) {
  return (planningState.routes || []).find((route) => (route.specificationId === specificationId || route.projectId === specificationId) && route.isDefault)
    || (planningState.routes || []).find((route) => route.specificationId === specificationId || route.projectId === specificationId)
    || null;
}

function getActiveRouteForModule() {
  if (ui.activeRouteId === "__new__") return null;
  const routes = getRoutesForModule();
  return routes.find((route) => route.id === ui.activeRouteId)
    || routes[0]
    || null;
}

function getRouteModuleStats(route) {
  if (!route) {
    return { steps: [], required: 0, slots: [], warnings: [], hours: 0 };
  }
  const steps = getRouteStepsForModule(route.id);
  const stepIds = new Set(steps.map((step) => step.id));
  const slots = planningState.slots.filter((slot) => stepIds.has(slot.routeStepId));
  const productionId = getRouteProductionId(route);
  const warnings = getSlotWarnings(planningState).warnings.filter((warning) => getWarningProductionId(warning) === productionId);
  const hours = Math.round(slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0) * 10) / 10;
  return {
    steps,
    required: steps.filter((step) => step.isRequired).length,
    slots,
    warnings,
    hours,
  };
}

function getRouteChildGenerationTasks(rootRoute = null) {
  if (!rootRoute) return [];
  return getRouteUnscopedBaseTasks(rootRoute)
    .filter((task) => !task.isMain && !task.isOrphan)
    .filter((task) => isSchedulableFulfillmentMode(task.fulfillmentMode || "produce"));
}

function getRouteTaskSubtreeIds(rootRoute = null, rootTask = null) {
  if (!rootRoute || !rootTask) return new Set();
  const rootNumber = String(rootTask.number || "");
  const rootPrefix = rootNumber ? `${rootNumber}.` : "";
  return new Set(getRouteUnscopedBaseTasks(rootRoute)
    .filter((task) => task.id === rootTask.id || (rootPrefix && String(task.number || "").startsWith(rootPrefix)))
    .map((task) => task.id));
}

function isDirectRouteChildTask(parentTask = null, candidateTask = null) {
  if (!parentTask || !candidateTask || parentTask.id === candidateTask.id) return false;
  const parentNumber = String(parentTask.number || "").trim();
  const candidateNumber = String(candidateTask.number || "").trim();
  if (!parentNumber || !candidateNumber.startsWith(`${parentNumber}.`)) return false;
  const tail = candidateNumber.slice(parentNumber.length + 1);
  return Boolean(tail) && !tail.includes(".");
}

function getRouteLinkedChildTasks(route = null) {
  if (!route?.id) return [];
  const kind = getRouteDocumentKind(route);
  const rootRoute = getRouteGenerationRoot(route);
  if (!rootRoute) return [];
  const tasks = getRouteUnscopedBaseTasks(rootRoute)
    .filter((task) => !task.isMain && !task.isOrphan)
    .filter((task) => isSchedulableFulfillmentMode(task.fulfillmentMode || "produce"));

  if (kind === "main") {
    return tasks.filter((task) => Number(task.level || 0) === 0);
  }

  const scopeRootTask = getRouteScopeRootTask(route, tasks);
  if (!scopeRootTask) return [];
  return tasks.filter((task) => isDirectRouteChildTask(scopeRootTask, task));
}

function getRouteLinkedChildDocuments(route = null) {
  const rootRoute = getRouteGenerationRoot(route);
  if (!rootRoute) return [];
  return getRouteLinkedChildTasks(route).map((task) => ({
    task,
    route: findGeneratedChildRoute(rootRoute, task),
  }));
}

function findGeneratedChildRoute(rootRoute = null, rootTask = null) {
  if (!rootRoute || !rootTask) return null;
  return (planningState.routes || []).find((route) => (
    getRouteDocumentKind(route) === "child"
    && (route.rootRouteId === rootRoute.id || route.parentRouteId === rootRoute.id)
    && (
      route.routeTaskId === rootTask.id
      || (
        route.routeTaskSourceItemId === rootTask.sourceItemId
        && (!route.routeTaskSourceSpecificationId || route.routeTaskSourceSpecificationId === rootTask.sourceSpecificationId)
      )
    )
  )) || null;
}

function getGeneratedChildRouteName(task = {}) {
  return [task.number, task.title].filter(Boolean).join(" ") || "Дочерняя маршрутная карта";
}

function shouldRefreshGeneratedChildRouteName(route = null) {
  const name = String(route?.name || "").trim();
  return !name || name.startsWith("Дочерняя маршрутная карта · ");
}

function buildChildRouteCard(rootRoute, task, existingRoute = null, stamp = new Date().toISOString()) {
  return {
    ...(existingRoute || {}),
    id: existingRoute?.id || makeId("r"),
    specificationId: rootRoute.specificationId || task.sourceSpecificationId || "",
    specificationName: rootRoute.specificationName || getRouteSpecification(rootRoute)?.name || "",
    projectId: rootRoute.projectId || rootRoute.specificationId || task.sourceSpecificationId || "",
    bomListId: "",
    name: shouldRefreshGeneratedChildRouteName(existingRoute) ? getGeneratedChildRouteName(task) : existingRoute.name,
    isDefault: false,
    routeDocumentKind: "child",
    rootRouteId: rootRoute.rootRouteId || rootRoute.id,
    parentRouteId: rootRoute.id,
    routeTaskId: task.id,
    routeTaskSourceItemId: task.sourceItemId || "",
    routeTaskSourceSpecificationId: task.sourceSpecificationId || "",
    routeTaskName: task.title || "",
    routeTaskNumber: task.number || "",
    routeTaskBomListId: task.bomListId || "",
    routeScope: "own",
    planningQuantity: normalizeOptionalPositiveInteger(rootRoute.planningQuantity) || normalizeOptionalPositiveInteger(existingRoute?.planningQuantity) || 1,
    planningBoardsPerPanelBySource: {
      ...(rootRoute.planningBoardsPerPanelBySource || {}),
      ...(existingRoute?.planningBoardsPerPanelBySource || {}),
    },
    planningStatus: getWorkOrderPlanningStatusValue(existingRoute),
    createdAt: existingRoute?.createdAt || stamp,
    updatedAt: stamp,
  };
}

function cloneRouteStepForChildRoute(sourceStep, childRoute, stamp = new Date().toISOString()) {
  return normalizeRouteStepCalculationFields({
    ...sourceStep,
    id: makeId("rs"),
    routeId: childRoute.id,
    sourceRouteId: sourceStep.sourceRouteId || sourceStep.routeId || childRoute.parentRouteId || "",
    sourceRouteStepId: sourceStep.sourceRouteStepId || sourceStep.id,
    generatedFromRouteStepId: sourceStep.generatedFromRouteStepId || sourceStep.id,
    createdAt: stamp,
    updatedAt: stamp,
  }, planningState);
}

function syncGeneratedChildRouteSteps(rootRoute, childRoute, rootTask, stamp = new Date().toISOString()) {
  const taskId = String(rootTask?.id || "").trim();
  if (!taskId) return 0;
  const sourceSteps = getRouteStepsForModule(rootRoute.id)
    .filter((step) => getRouteStepTaskId(step) === taskId);
  if (!sourceSteps.length) return 0;

  const existingGeneratedSourceIds = new Set(getRouteStepsForModule(childRoute.id)
    .map((step) => step.sourceRouteStepId || step.generatedFromRouteStepId || "")
    .filter(Boolean));
  const missingSteps = sourceSteps
    .filter((step) => !existingGeneratedSourceIds.has(step.id))
    .map((step) => cloneRouteStepForChildRoute(step, childRoute, stamp));
  if (!missingSteps.length) return 0;

  planningState.routeSteps = [
    ...(planningState.routeSteps || []),
    ...missingSteps,
  ];
  getRouteBaseTasks(childRoute).forEach((task) => normalizeRouteStepOrders(childRoute.id, task.id));
  return missingSteps.length;
}

function getRouteGenerationRoot(route = null) {
  if (!route) return null;
  if (getRouteDocumentKind(route) === "main") return route;
  return getRouteRootRoute(route) || route;
}

function generateChildRouteCardsForActiveRoute() {
  const activeRoute = getActiveRouteForModule();
  const rootRoute = getRouteGenerationRoot(activeRoute);
  if (!rootRoute) {
    alert("Сначала выберите главную маршрутную карту.");
    return;
  }
  const specification = getRouteSpecification(rootRoute);
  if (!specification) {
    alert("Дочерние маршрутные карты можно сформировать только от карты, связанной с составом изделия.");
    return;
  }
  const tasks = getRouteChildGenerationTasks(rootRoute);
  if (!tasks.length) {
    alert("В составе изделия нет производственных веток для дочерних маршрутных карт.");
    return;
  }

  const stamp = new Date().toISOString();
  let createdCount = 0;
  let reusedCount = 0;
  let copiedSteps = 0;
  const nextRoutes = [];
  const generatedRouteIds = new Set();
  planningState.routes = (planningState.routes || []).map((route) => (
    route.id === rootRoute.id
      ? {
          ...route,
          routeDocumentKind: "main",
          rootRouteId: route.rootRouteId || route.id,
          updatedAt: stamp,
        }
      : route
  ));
  const normalizedRootRoute = (planningState.routes || []).find((route) => route.id === rootRoute.id) || rootRoute;

  tasks.forEach((task) => {
    const existingRoute = findGeneratedChildRoute(normalizedRootRoute, task);
    const childRoute = buildChildRouteCard(normalizedRootRoute, task, existingRoute, stamp);
    generatedRouteIds.add(childRoute.id);
    nextRoutes.push(childRoute);
    if (existingRoute) reusedCount += 1;
    else createdCount += 1;
  });

  planningState.routes = [
    ...(planningState.routes || []).filter((route) => !generatedRouteIds.has(route.id)),
    ...nextRoutes,
  ];

  nextRoutes.forEach((childRoute) => {
    const task = tasks.find((item) => (
      item.id === childRoute.routeTaskId
      || (
        item.sourceItemId === childRoute.routeTaskSourceItemId
        && item.sourceSpecificationId === childRoute.routeTaskSourceSpecificationId
      )
    ));
    copiedSteps += syncGeneratedChildRouteSteps(normalizedRootRoute, childRoute, task, stamp);
  });

  planningState = normalizePlanningState(planningState);
  ui.activeRouteId = nextRoutes[0]?.id || normalizedRootRoute.id;
  persistState();
  persistUiState();
  notifySaveSuccess(`Дочерние карты: создано ${createdCount}, обновлено ${reusedCount}, операций добавлено ${copiedSteps}`);
  render();
}

function getRouteDeleteUsage(routeId) {
  const steps = getRouteStepsForModule(routeId);
  const stepIds = new Set(steps.map((step) => step.id));
  const slots = (planningState.slots || []).filter((slot) => (
    getSlotRouteId(slot, planningState) === routeId
    || stepIds.has(slot.routeStepId)
    || slotMatchesPlanningOrder(slot, routeId)
  ));
  return {
    steps,
    stepIds,
    batches: [],
    batchIds: new Set(),
    slots,
    stepsCount: steps.length,
    batchesCount: 0,
    slotsCount: slots.length,
  };
}

function deleteRouteMapConfirmed(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) return;

  const usage = getRouteDeleteUsage(routeId);
  const routeTargetIds = new Set([route.specificationId, route.projectId].filter(Boolean));
  const wasDefault = Boolean(route.isDefault);

  planningState.routes = (planningState.routes || []).filter((item) => item.id !== routeId);
  planningState.routeSteps = (planningState.routeSteps || []).filter((step) => step.routeId !== routeId);
  planningState.slots = (planningState.slots || []).filter((slot) => (
    getSlotRouteId(slot, planningState) !== routeId
    && !usage.stepIds.has(slot.routeStepId)
    && !slotMatchesPlanningOrder(slot, routeId)
  ));
  if (wasDefault && routeTargetIds.size) {
    const sameTargetRoutes = planningState.routes.filter((item) => (
      routeTargetIds.has(item.specificationId) || routeTargetIds.has(item.projectId)
    ));
    if (sameTargetRoutes.length && !sameTargetRoutes.some((item) => item.isDefault)) {
      const fallbackRoute = sameTargetRoutes[0];
      planningState.routes = planningState.routes.map((item) => (
        item.id === fallbackRoute.id ? { ...item, isDefault: true, updatedAt: new Date().toISOString() } : item
      ));
    }
  }

  planningState = normalizePlanningState(planningState);
  const remainingRoutes = getRoutesForModule();
  ui.activeRouteId = remainingRoutes[0]?.id || "";
  if (planningState.slots.every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
  withPlanningEntityRemovalAllowed(() => persistState());
  persistDirectoryState();
  persistUiState();
  render();
}

function ensureProjectBatches(project) {
  if (!project) return [];
  const route = (planningState.routes || []).find((item) => item.specificationId === project.id || item.projectId === project.id);
  return route ? getRoutePlanningBatches(route, project) : [];
}

function ensureRouteBatches(route, production = null) {
  return getRoutePlanningBatches(route, production);
}

function comparePlanningBatches(left, right) {
  return String(left.batchNumber || left.id || "").localeCompare(String(right.batchNumber || right.id || ""), "ru", {
    numeric: true,
    sensitivity: "base",
  });
}

function getRoutePlanningOrder(route, production = null) {
  if (!route?.id) return null;
  const context = production || getRoutePlanningContext(route);
  const productionId = context?.id || getRouteProductionId(route);
  const storedStatus = getWorkOrderPlanningStatusValue(route);
  const statusView = getMesStatusView("workOrderPlanning", storedStatus);
  return {
    id: route.id,
    routeId: route.id,
    planningOrderId: route.id,
    documentContract: buildMesDocumentContract("workOrder", {
      ...route,
      sourceId: route.id,
      specificationId: productionId || route.specificationId || route.projectId || "",
    }),
    specificationId: productionId || route.specificationId || route.projectId || "",
    projectId: productionId || route.projectId || route.specificationId || "",
    batchNumber: "",
    quantity: getPlanningRouteQuantity(route),
    status: statusView.value || context?.status || "queued",
    statusLabel: statusView.label,
    statusTone: statusView.tone,
    createdAt: route.createdAt || "",
    updatedAt: route.updatedAt || "",
    isRouteOrder: true,
  };
}

function getRoutePlanningBatches(route, production = null) {
  const order = getRoutePlanningOrder(route, production);
  return order ? [order] : [];
}

function getPlanningBatchSlots(batch, route = null) {
  if (!batch?.id) return [];
  return (planningState.slots || []).filter((slot) => (
    slotMatchesPlanningOrder(slot, batch.id)
    && (!route || getSlotRouteId(slot, planningState) === route.id || slotMatchesProductionContext(slot, getRouteProductionId(route)))
  ));
}

function getPlanningRouteSlots(route) {
  if (!route?.id) return [];
  const stepIds = new Set(getRouteStepsForModule(route.id).map((step) => step.id));
  return (planningState.slots || []).filter((slot) => (
    getSlotRouteId(slot, planningState) === route.id
    || stepIds.has(slot.routeStepId)
    || slotMatchesPlanningOrder(slot, route.id)
  ));
}

function getPlanningRouteOrderState(route, summary = null) {
  if (!route) return { id: "empty", label: "Не выбран", tone: "neutral" };
  const transferSummary = summary || getPlanningRouteTransferSummary(route);
  const makeState = (value, fallback) => {
    const status = getMesStatusView("workOrderPlanning", value, fallback);
    return { id: value, label: status.label, tone: status.tone, signal: status.signal, status };
  };
  if (isWorkOrderPlanningCanceled(route) && !transferSummary.planned) {
    return makeState("canceled", { label: "Отменен", tone: "critical" });
  }
  if (transferSummary.expected && transferSummary.planned >= transferSummary.expected) {
    return makeState("scheduled", { label: "В планировании", tone: "ok" });
  }
  if (transferSummary.planned > 0) {
    return makeState("partial", { label: "Частично", tone: "warning" });
  }
  return makeState("queued", { label: "В очереди", tone: "neutral" });
}

function getRouteCardViewModel(route = null) {
  if (!route) {
    const document = buildMesDocumentContract("routeCard", {});
    const workOrderDocument = buildMesDocumentContract("workOrder", {});
    return {
      document,
      title: "Маршрутная карта",
      objectLabel: "Объект не выбран",
      status: getMesStatusView("workOrderPlanning", "queued", { label: "Не выбрана", tone: "neutral" }),
      transitionToWorkOrder: getMesFlowTransitionView("routeCardToWorkOrder"),
      flowToWorkOrder: buildMesFlowEvent("routeCardToWorkOrder", document, workOrderDocument),
    };
  }
  const document = buildMesDocumentContract("routeCard", {
    ...route,
    sourceId: route.specificationId || route.projectId || "",
  });
  const workOrderDocument = buildMesDocumentContract("workOrder", {
    ...route,
    sourceId: route.id || "",
    parentId: route.id || "",
  });
  return {
    document,
    title: route.name || getMesDocumentKind("routeCard").label,
    objectLabel: getPlanningOrderObjectLabel(route),
    sourceLabel: getPlanningOrderSourceLabel(route),
    documentKind: getRouteDocumentKind(route),
    transitionToWorkOrder: getMesFlowTransitionView("routeCardToWorkOrder"),
    flowToWorkOrder: buildMesFlowEvent("routeCardToWorkOrder", document, workOrderDocument, {
      routeId: route.id,
      quantity: normalizeQuantity(getPlanningRouteQuantity(route)),
    }),
    route,
  };
}

function getWorkOrderPlanningStatusView(route = null, summary = null) {
  if (!route) return getMesStatusView("workOrderPlanning", "queued", { label: "Не выбран", tone: "neutral" });
  return getPlanningRouteOrderState(route, summary).status
    || getWorkOrderPlanningStatus(route);
}

function getWorkOrderViewModel(route = null, options = {}) {
  const summary = options.summary || (route ? getPlanningRouteTransferSummary(route) : null);
  const routeSteps = options.routeSteps || (route ? getRouteStepsForModule(route.id) : []);
  const routeCard = getRouteCardViewModel(route);
  const status = getWorkOrderPlanningStatusView(route, summary);
  const quantity = route ? normalizeQuantity(summary?.planningQuantity || getPlanningRouteQuantity(route)) : 0;
  const document = buildMesDocumentContract("workOrder", {
    ...(route || {}),
    sourceId: route?.id || "",
    parentId: route?.id || "",
  });
  const ganttSlotDocument = buildMesDocumentContract("ganttSlot", {
    routeId: route?.id || "",
    planningOrderId: document.entityId || route?.id || "",
    sourceId: route?.id || "",
  });
  return {
    document,
    routeCard,
    route,
    status,
    transitionIn: getMesFlowTransitionView("routeCardToWorkOrder"),
    transitionToPlanning: getMesFlowTransitionView("workOrderToGanttSlot"),
    flowToPlanning: buildMesFlowEvent("workOrderToGanttSlot", document, ganttSlotDocument, {
      quantity,
      operationCount: routeSteps.length,
    }),
    title: getPlanningWorkOrderTitle(route),
    queueTitle: getPlanningWorkOrderQueueTitle(route),
    objectLabel: getPlanningOrderObjectLabel(route),
    subtitle: route
      ? `${getPlanningOrderObjectLabel(route)} · ${quantity.toLocaleString("ru-RU")} шт. · ${routeSteps.length.toLocaleString("ru-RU")} операций · основание: ${getRouteDocumentKindLabel(route)}`
      : "",
    quantity,
    operationCount: routeSteps.length,
  };
}

function getPlanningOrderSourceLabel(route = null) {
  if (!route) return "Маршрутное задание не выбрано";
  return `${getRouteDocumentKindLabel(route)} · ${route.name || "Маршрутная карта"}`;
}

function getPlanningOrderObjectLabel(route = null) {
  if (!route) return "Объект не выбран";
  const releasedProductLabel = String(
    route.documentRevisionSnapshot?.product?.name
    || route.name?.replace(/^.*?маршрутная карта\s*·\s*/iu, "")
    || route.specificationName
    || "",
  ).trim();
  const contextProductLabel = String(getProjectDisplayName(getRoutePlanningContext(route)) || "").trim();
  const selectedProductLabel = String(getRouteModuleSelectionName(route) || "").trim();
  if (getRouteDocumentKind(route) === "child") {
    const rootName = getRouteModuleSelectionName(getRouteRootRoute(route) || route);
    const subjectName = route.sourceSpecifications2EntryId
      ? releasedProductLabel
      : getRouteLineageSubjectName(route) || releasedProductLabel;
    return [subjectName, rootName].filter(Boolean).join(" / ") || "Объект не выбран";
  }
  return (selectedProductLabel !== "Объект не выбран" ? selectedProductLabel : "")
    || getRouteLineageSubjectName(route)
    || (contextProductLabel !== "Объект не выбран" ? contextProductLabel : "")
    || releasedProductLabel
    || "Объект не выбран";
}

function getPlanningWorkOrderTitle(route = null) {
  if (!route) return "Заказ-наряд";
  const production = getRoutePlanningContext(route);
  const productionOrder = String(production?.orderNumber || "").trim();
  if (productionOrder && productionOrder !== route.name) return `Заказ-наряд ${productionOrder}`;
  return "Заказ-наряд";
}

function getPlanningWorkOrderQueueTitle(route = null) {
  if (!route) return "Заказ-наряд";
  const objectLabel = getPlanningOrderObjectLabel(route);
  const kind = getRouteDocumentKind(route);
  if (kind === "child") return route.sourceSpecifications2EntryId ? objectLabel : getRouteLineageSubjectName(route);
  return objectLabel || route.name || "Заказ-наряд";
}

function getPlanningWorkOrderSubtitle(route = null, summary = null, routeSteps = null) {
  if (!route) return "";
  const quantity = normalizeQuantity(summary?.planningQuantity || getPlanningRouteQuantity(route));
  const steps = routeSteps || getRouteStepsForModule(route.id);
  return `${getPlanningOrderObjectLabel(route)} · ${quantity.toLocaleString("ru-RU")} шт. · ${steps.length.toLocaleString("ru-RU")} операций · основание: ${getRouteDocumentKindLabel(route)}`;
}

function getPlanningShiftDateLabel(value = "") {
  return toDate(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getPlanningShiftSlotTimeLabel(slot = {}) {
  if (!slot.plannedStart || !slot.plannedEnd) return "время не задано";
  return `${formatDateTimeShort(slot.plannedStart)}-${formatDateTimeShort(slot.plannedEnd)}`;
}

function getPlanningShiftOrderTone(rows = []) {
  if (rows.some((row) => ["problem", "overdue"].includes(row.rawStatus))) return "critical";
  if (rows.some((row) => ["in_progress", "paused"].includes(row.rawStatus))) return "warning";
  if (rows.length && rows.every((row) => row.rawStatus === "completed")) return "ok";
  return rows.length ? "neutral" : "neutral";
}

function getPlanningShiftOrderStatusLabel(rows = []) {
  if (!rows.length) return "пусто";
  if (rows.some((row) => ["problem", "overdue"].includes(row.rawStatus))) return "проблема";
  if (rows.some((row) => row.rawStatus === "in_progress")) return "в работе";
  if (rows.some((row) => row.rawStatus === "paused")) return "пауза";
  if (rows.every((row) => row.rawStatus === "completed")) return "закрыт";
  return "запланирован";
}

function getPlanningShiftOrdersForRoute(route = null, routeSteps = null) {
  if (!route?.id) return [];
  const steps = routeSteps || getRouteStepsForModule(route.id);
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const slots = getPlanningRouteSlots(route)
    .filter((slot) => stepById.has(slot.routeStepId))
    .sort((left, right) => (
      toDate(left.plannedStart) - toDate(right.plannedStart)
      || String(left.operationName || "").localeCompare(String(right.operationName || ""), "ru")
    ));
  const groups = new Map();

  slots.forEach((slot) => {
    const dateKey = toDateInput(slot.plannedStart || slot.plannedEnd || new Date());
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    const step = stepById.get(slot.routeStepId) || null;
    const task = step ? getRouteStepPlanningTask(route, step, steps) : null;
    const workCenter = getWorkCenter(slot.workCenterId || step?.workCenterId || "");
    const resource = getProductionResource(slot.resourceId || step?.resourceId || "");
    const taskLabel = task
      ? [task.number, task.title].filter(Boolean).join(" · ")
      : step?.specTaskName || getPlanningOrderObjectLabel(route);
    const resourceLabel = [
      workCenter?.name || slot.workCenterId || "Участок не задан",
      resource?.name || slot.resourceId || "",
    ].filter(Boolean).join(" · ");
    const statusView = getGanttSlotStatusView(slot);

    groups.get(dateKey).push({
      id: slot.id,
      documentContract: buildMesDocumentContract("shiftWorkOrder", {
        id: slot.id,
        routeId: route.id,
        planningOrderId: getSlotPlanningOrderId(slot, route.id),
        sourceId: slot.id,
      }),
      operationName: slot.operationName || step?.operationName || "Операция",
      taskLabel,
      resourceLabel,
      quantity: normalizeQuantity(slot.quantity || 0),
      unit: "шт.",
      rawStatus: statusView.value || "planned",
      statusView,
      statusLabel: statusView.label,
      timeLabel: getPlanningShiftSlotTimeLabel(slot),
    });
  });

  return [...groups.entries()].map(([dateKey, rows], index) => {
    const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const tone = getPlanningShiftOrderTone(rows);
    return {
      id: `${route.id}:${dateKey}`,
      dateKey,
	      title: `План смены ${index + 1}`,
      meta: `${getPlanningShiftDateLabel(dateKey)} · ${rows.length.toLocaleString("ru-RU")} строк · ${totalQuantity.toLocaleString("ru-RU")} шт.`,
      rows,
      tone,
      statusLabel: getPlanningShiftOrderStatusLabel(rows),
    };
  });
}

function getPlanningBatchQuantityTotal(batches) {
  return (batches || []).reduce((sum, batch) => sum + normalizeQuantity(batch.quantity || 0), 0);
}

function getPlanningRouteQuantity(route) {
  if (!route) return 1;
  const project = getRoutePlanningContext(route);
  const specification = getRouteSpecification(route);
  return normalizeOptionalPositiveInteger(route.planningQuantity)
    || normalizeOptionalPositiveInteger(specification?.productionQuantity)
    || normalizeOptionalPositiveInteger(project?.totalQuantity)
    || 1;
}

function getPlanningRouteStartDate(route) {
  const storedValue = String(route?.planningStartDate || "").trim();
  const storedDate = storedValue ? toDate(storedValue.includes("T") ? storedValue : fromDateInput(storedValue)) : null;
  if (storedDate && !Number.isNaN(storedDate.getTime())) return toDateInput(storedDate);
  return toDateInput(getPlanningScheduleAnchorStart());
}

function getPlanningRouteAnchorStart(route, routeSteps = null) {
  const date = fromDateInput(getPlanningRouteStartDate(route));
  const steps = Array.isArray(routeSteps) ? routeSteps : getSchedulableRouteSteps(route?.id || "");
  const firstStep = steps[0] || null;
  const firstWorkCenterId = firstStep
    ? getRouteStepSelectedPlanningWorkCenterId(firstStep, planningState) || firstStep.planningWorkCenterId || firstStep.workCenterId || ""
    : "";
  const snappedDate = snapDate(date, getGanttSnapMs());
  return firstWorkCenterId
    ? snapToWorkingTime(firstWorkCenterId, snappedDate, planningState)
    : snappedDate;
}

function syncPlanningRouteQuantity(routeId, value, options = {}) {
  const quantity = normalizeOptionalPositiveInteger(value);
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const production = getRoutePlanningContext(route);
  if (!route || !quantity) return false;

  const stamp = new Date().toISOString();
  const nextRoute = {
    ...route,
    planningQuantity: quantity,
    ...(Number.isInteger(Number(options.domainConcurrencyRevision)) ? { domainConcurrencyRevision: Number(options.domainConcurrencyRevision) } : {}),
    updatedAt: stamp,
  };
  planningState.routes = planningState.routes.map((item) => item.id === route.id ? {
    ...item,
    planningQuantity: quantity,
    ...(Number.isInteger(Number(options.domainConcurrencyRevision)) ? { domainConcurrencyRevision: Number(options.domainConcurrencyRevision) } : {}),
    updatedAt: stamp,
  } : item);

  if (options.updateSlots) {
    const routeSteps = getSchedulableRouteSteps(nextRoute.id);
    const stepById = byId(routeSteps);
    const routeOrder = getRoutePlanningOrder(nextRoute, production);
    planningState.slots = planningState.slots.map((slot) => {
      const step = stepById[slot.routeStepId];
      const slotRouteId = getSlotRouteId(slot, planningState);
      if ((slotRouteId && slotRouteId !== nextRoute.id) || !step || slot.locked || isGanttSlotCompleted(slot)) return slot;
      const nextQuantity = getRouteStepQuantityForBatch(step, routeOrder);
      const nextSlot = applyPlanningOrderLaborToSlot({
        ...slot,
        routeId: nextRoute.id,
        planningOrderId: nextRoute.id,
        specificationId: production?.id || nextRoute.specificationId || slot.specificationId || "",
        quantity: nextQuantity,
        updatedAt: stamp,
      }, nextRoute, step, nextQuantity, { stamp });
      return recalculateSlotEndByQuantity(nextSlot, planningState);
    });
  }

  if (options.persist !== false) {
    persistState();
  }
  if (options.notify !== false) {
    notifySaveSuccess(options.message || "Количество заказ-наряда сохранено");
  }
  if (options.render !== false) render();
  return true;
}

function syncPlanningRouteStartDate(routeId, value, options = {}) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) return false;
  const date = toDate(value ? fromDateInput(value) : getPlanningScheduleAnchorStart());
  if (Number.isNaN(date.getTime())) return false;

  const stamp = new Date().toISOString();
  const planningStartDate = toDateInput(date);
  planningState.routes = planningState.routes.map((item) => item.id === route.id ? {
    ...item,
    planningStartDate,
    updatedAt: stamp,
  } : item);

  if (options.persist !== false) {
    persistState();
  }
  if (options.notify !== false) {
    notifySaveSuccess(options.message || "Дата старта заказ-наряда сохранена");
  }
  if (options.render !== false) render();
  return true;
}

function recalculatePlanningBatchSlots(planningOrderId, routeId, stamp = new Date().toISOString()) {
  const route = (planningState.routes || []).find((item) => item.id === routeId)
    || (planningState.routes || []).find((item) => item.id === getBatch(planningOrderId)?.routeId);
  if (!route) return;
  const production = getRoutePlanningContext(route);
  const batch = getRoutePlanningOrder(route, production);
  const stepById = byId(getSchedulableRouteSteps(route.id));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const step = stepById[slot.routeStepId];
    if (!slotMatchesPlanningOrder(slot, route.id) || !step || slot.locked || isGanttSlotCompleted(slot)) return slot;
    const nextQuantity = getRouteStepQuantityForBatch(step, batch);
    const nextSlot = applyPlanningOrderLaborToSlot({
      ...slot,
      routeId: route.id,
      planningOrderId: route.id,
      specificationId: batch.specificationId || route.specificationId || getSlotProductionContextId(slot),
      quantity: nextQuantity,
      updatedAt: stamp,
    }, route, step, nextQuantity, { stamp });
    return recalculateSlotEndByQuantity(nextSlot, planningState);
  });
}

function getPlanningBoardsPerPanelOverrides(route) {
  return route?.planningBoardsPerPanelBySource && typeof route.planningBoardsPerPanelBySource === "object"
    ? route.planningBoardsPerPanelBySource
    : {};
}

function getPlanningBoardsPerPanel(route, sourceId, fallback = 1) {
  const key = String(sourceId || "");
  const overrides = getPlanningBoardsPerPanelOverrides(route);
  if (key && Object.prototype.hasOwnProperty.call(overrides, key)) {
    return normalizeBoardsPerPanel(overrides[key], fallback);
  }
  return normalizeBoardsPerPanel(fallback, 1);
}

function syncPlanningBoardsPerPanel(routeId, sourceId, value, options = {}) {
  const boardsPerPanel = normalizeOptionalPositiveInteger(value);
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const sourceKey = String(sourceId || "");
  if (!route || !sourceKey || !boardsPerPanel) return false;

  const stamp = new Date().toISOString();
  planningState.routes = (planningState.routes || []).map((item) => (
    item.id === route.id
      ? {
          ...item,
          planningBoardsPerPanelBySource: {
            ...getPlanningBoardsPerPanelOverrides(item),
            [sourceKey]: boardsPerPanel,
          },
          updatedAt: stamp,
        }
      : item
  ));

  const affectedStepIds = new Set();
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    if (step.routeId !== route.id) return step;
    const taskId = getRouteStepTaskId(step);
    const effectiveTask = getRouteStepPlanningTask(route, step);
    const compositeKey = `${taskId}:${step.bomListId || ""}`;
    const matchesSource = (
      step.specTaskSourceItemId === sourceKey
      || step.bomListId === sourceKey
      || taskId === sourceKey
      || compositeKey === sourceKey
      || effectiveTask?.sourceItemId === sourceKey
      || effectiveTask?.id === sourceKey
      || effectiveTask?.bomListId === sourceKey
    );
    if (!matchesSource) return step;
    affectedStepIds.add(step.id);
    return {
      ...step,
      boardsPerPanel,
      updatedAt: stamp,
    };
  });

  if (affectedStepIds.size) {
    planningState.slots = (planningState.slots || []).map((slot) => {
      if (!affectedStepIds.has(slot.routeStepId) || slot.locked || isGanttSlotCompleted(slot)) return slot;
      const step = (planningState.routeSteps || []).find((item) => item.id === slot.routeStepId);
      const routeForSlot = step
        ? (planningState.routes || []).find((item) => item.id === getSlotPlanningOrderId(slot, getSlotRouteId(slot, planningState)))
          || (planningState.routes || []).find((item) => item.id === step.routeId)
        : null;
      const nextSlot = step && routeForSlot
        ? applyPlanningOrderLaborToSlot({
            ...slot,
            boardsPerPanel,
            updatedAt: stamp,
          }, routeForSlot, step, slot.quantity || 1, { stamp })
        : {
            ...slot,
            boardsPerPanel,
            updatedAt: stamp,
          };
      return recalculateSlotEndByQuantity(nextSlot, planningState);
    });
  }

  if (options.persist !== false) persistState();
  if (options.notify !== false) {
    notifySaveSuccess("Платы в мультиплате сохранены");
  }
  if (options.render !== false) render();
  return true;
}

function updatePlanningSupplyFulfillment(routeId, structureItemId, mode) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const specification = getRouteSpecification(route);
  const nextMode = normalizeStructureFulfillmentMode(mode, "not_selected");
  if (!route || !specification || !structureItemId) return false;

  const stamp = new Date().toISOString();
  let changed = false;
  directoryState.specifications = (directoryState.specifications || []).map((item) => {
    if (item.id !== specification.id) return item;
    const structureItems = getSpecificationStructureItems(item).map((structureItem) => {
      if (structureItem.id !== structureItemId) return structureItem;
      changed = true;
      return normalizeSpecificationStructureItem({
        ...structureItem,
        fulfillmentMode: nextMode,
        executionType: getExecutionTypeForFulfillmentMode(nextMode),
        operationId: isSchedulableFulfillmentMode(nextMode) ? structureItem.operationId || "" : "",
        operationName: nextMode === "from_stock"
          ? structureItem.operationName || "Выдача со склада"
          : isSchedulableFulfillmentMode(nextMode) ? structureItem.operationName || "" : "",
        departmentName: nextMode === "from_stock"
          ? structureItem.departmentName || "Склад"
          : isSchedulableFulfillmentMode(nextMode) ? structureItem.departmentName || "" : "",
      });
    });
    return changed
      ? syncSpecificationDerivedFields({
          ...item,
          structureManaged: true,
          structureItems,
          updatedAt: stamp,
        })
      : item;
  });

  if (!changed) return false;
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ensureRouteTaskSeedSteps(route.id, getRouteSpecification(route) || specification);
  persistDirectoryState();
  persistState();
  notifySaveSuccess("Способ обеспечения сохранен");
  render();
  return true;
}

function getRouteStepQuantityForBatch(routeStep, batch) {
  const route = getRouteForStep(routeStep);
  const multiplier = getRouteStepEffectiveQuantityMultiplier(routeStep, route);
  return calculateOperationPlannedQuantity(normalizeQuantity(batch?.quantity), multiplier);
}

function getPlanningMultiplicationRows(route, steps = null, planningQuantity = null) {
  if (!route) return [];
  const quantity = normalizeQuantity(planningQuantity || getPlanningRouteQuantity(route));
  const specification = getRouteSpecification(route);
  const bomEntries = specification ? getSpecificationBomEntries(specification.id) : [];
  if (bomEntries.length) {
    return bomEntries.map((entry) => {
      const boards = Math.max(1, Math.round(quantity * Math.max(1, Number(entry.quantity || 1))));
      const sourceId = entry.structureItemId || entry.bom.id;
      const boardsPerPanel = getPlanningBoardsPerPanel(route, sourceId, entry.boardsPerPanel || 1);
      return {
        id: sourceId,
        sourceId,
        label: entry.bom.resultItem || entry.bom.name || "Печатная плата",
        boards,
        boardsPerPanel,
        panels: Math.max(1, Math.ceil(boards / boardsPerPanel)),
      };
    });
  }

  const routeSteps = steps || getSchedulableRouteSteps(route.id);
  const seen = new Set();
  return routeSteps
    .filter((step) => step.bomListId)
    .map((step) => {
      const key = `${getRouteStepTaskId(step)}:${step.bomListId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const bom = getBomList(step.bomListId);
      const boards = getRouteStepQuantityForBatch(step, { quantity });
      const boardsPerPanel = getPlanningBoardsPerPanel(route, key, getRouteStepBoardsPerPanel(step));
      return {
        id: key,
        sourceId: key,
        label: bom?.resultItem || bom?.name || step.specTaskName || step.operationName || "Печатная плата",
        boards,
        boardsPerPanel,
        panels: Math.max(1, Math.ceil(boards / boardsPerPanel)),
      };
    })
    .filter(Boolean);
}

function getPlanningRouteTransferSummary(route, options = {}) {
  if (!route) return { batches: [], steps: [], expected: 0, planned: 0, missing: 0, firstStart: null, multiplicationRows: [], totalPanels: 0, batchQuantityTotal: 0, quantityDelta: 0 };
  const project = getRoutePlanningContext(route);
  const planningQuantity = getPlanningRouteQuantity(route);
  const existingBatches = project ? getRoutePlanningBatches(route, project) : [];
  const batches = existingBatches.length ? existingBatches : project ? [{
    id: "__pending__",
    routeId: route.id,
    specificationId: project.id,
    batchNumber: "1",
    quantity: planningQuantity,
  }] : [];
  const realBatches = batches.filter((batch) => batch.id !== "__pending__");
  const batchQuantityTotal = realBatches.length ? getPlanningBatchQuantityTotal(realBatches) : planningQuantity;
  const steps = getSchedulableRouteSteps(route.id);
  const stepIds = new Set(steps.map((step) => step.id));
  const batchIds = new Set(batches.map((batch) => batch.id));
  const slots = planningState.slots.filter((slot) => (
    (getSlotRouteId(slot, planningState) === route.id || slotMatchesProductionContext(slot, project?.id))
    && batchIds.has(getSlotPlanningOrderId(slot, route.id))
    && stepIds.has(slot.routeStepId)
  ));
  const expected = batches.length * steps.length;
  const firstStart = slots
    .map((slot) => toDate(slot.plannedStart))
    .sort((left, right) => left - right)[0] || null;
  const includeMultiplicationRows = options.includeMultiplicationRows !== false;
  const multiplicationRows = includeMultiplicationRows
    ? getPlanningMultiplicationRows(route, steps, batchQuantityTotal || planningQuantity)
    : [];

  return {
    batches,
    steps,
    planningQuantity,
    batchQuantityTotal,
    quantityDelta: batchQuantityTotal - planningQuantity,
    multiplicationRows,
    totalPanels: multiplicationRows.reduce((sum, row) => sum + row.panels, 0),
    expected,
    planned: slots.length,
    missing: Math.max(0, expected - slots.length),
    firstStart,
  };
}

function getPlanningScheduleAnchorStart() {
  const now = snapDate(new Date(), getGanttSnapMs());
  const windowStart = toDate(fromDateInput(ui.windowStart));
  return now > windowStart ? now : windowStart;
}

function createSlotFromRouteStep(project, batch, routeStep, window, quantity, stamp, assignment = null) {
  const route = (planningState.routes || []).find((item) => item.id === routeStep.routeId);
  const specificationId = route?.specificationId || project.specificationId || project.id;
  const planningWorkCenterId = assignment?.workCenterId || getRouteStepSelectedPlanningWorkCenterId(routeStep, planningState) || routeStep.workCenterId;
  const resourceId = assignment?.resourceId || getPlanningResourceForRouteStep(routeStep, planningWorkCenterId, routeStep.resourceId || "");
  const operationContext = getRouteStepEffectiveOperationContext(route, routeStep, planningWorkCenterId, resourceId);
  const flow = getRouteStepFlowModel(route, routeStep);
  const planningLaborFields = assignment?.laborPlan
    ? getPlanningOrderLaborSlotFields(route, routeStep, quantity, {
        workCenterId: planningWorkCenterId,
        stamp,
      })
    : getEmptyPlanningOrderLaborSlotFields();
  return {
    id: makeId("s"),
    routeId: route?.id || routeStep.routeId || "",
    specificationId,
    planningOrderId: batch.id,
    routeWorkCenterId: routeStep.workCenterId,
    workCenterId: planningWorkCenterId,
    routeStepId: routeStep.id,
    sourceSpecifications2EntryId: route?.sourceSpecifications2EntryId || "",
    specificationRevision: Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0),
    routeRevision: Number(route?.documentRevisionSnapshot?.routeRevision || route?.revision || 0),
    normRevisionId: routeStep.normRevisionId || "",
    workOrderSnapshotId: route?.workOrderSnapshot?.id || "",
    operationId: routeStep.operationId || "",
    operationName: routeStep.operationName || getWorkCenter(routeStep.workCenterId)?.name || "Операция",
    quantity,
    unitsPerHour: Number(routeStep.unitsPerHour || 0) || undefined,
    boardsPerPanel: operationContext.boardsPerPanel,
    resourceId,
    calculationType: routeStep.calculationType || getDefaultOperationCalculationType(planningWorkCenterId, operationContext),
    fulfillmentMode: operationContext.fulfillmentMode || routeStep.fulfillmentMode || "produce",
    secondsPerPanel: Number(routeStep.secondsPerPanel || 0),
    setupMin: Number(routeStep.setupMin || 0),
    bomListId: operationContext.bomListId || "",
    operationInputs: flow.inputs,
    operationOutputs: flow.outputs,
    operationInputLabel: flow.inputLabel,
    operationOutputLabel: flow.outputLabel,
    ...planningLaborFields,
    plannedStart: toSlotDateTime(window.start),
    plannedEnd: toSlotDateTime(window.end),
    actualStart: "",
    actualEnd: "",
    status: "planned",
    comment: "Передано из модуля «Заказ-наряды».",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function scheduleRouteBatchOptimally(project, batch, routeSteps, anchorStart, stamp) {
  const groups = [...routeSteps.reduce((map, step) => {
    const taskId = getRouteStepTaskId(step);
    if (!map.has(taskId)) map.set(taskId, []);
    map.get(taskId).push(step);
    return map;
  }, new Map()).entries()].map(([taskId, steps]) => {
    const orderedSteps = [...steps].sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
    let readyAt = toDate(anchorStart);
    let foundMissing = false;
    const queue = [];

    orderedSteps.forEach((step) => {
      const existingSlot = planningState.slots.find((slot) => (
        slot.routeStepId === step.id
        && (
          getSlotRouteId(slot, planningState) === step.routeId
          || slotMatchesPlanningOrder(slot, step.routeId)
          || slotMatchesPlanningOrder(slot, batch.id)
          || slotMatchesProductionContext(slot, project.id)
        )
      ));
      if (!existingSlot) {
        foundMissing = true;
        queue.push(step);
        return;
      }
      if (!foundMissing) {
        readyAt = new Date(Math.max(readyAt.getTime(), addMs(existingSlot.plannedEnd, getRouteBufferMs()).getTime()));
      }
    });

    return { taskId, queue, readyAt };
  });

  const createdIds = [];
  let guard = 0;
  while (groups.some((group) => group.queue.length) && guard < 500) {
    guard += 1;
    const taskGroups = groups.filter((group) => group.taskId !== MAIN_ROUTE_TASK_ID);
    const candidates = groups
      .filter((group) => group.queue.length)
      .map((group) => {
        if (group.taskId === MAIN_ROUTE_TASK_ID && taskGroups.some((taskGroup) => taskGroup.queue.length)) return null;
        const readyAt = group.taskId === MAIN_ROUTE_TASK_ID
          ? getMainRouteDependencyReadyAt(routeSteps[0]?.routeId || "", project.id, batch.id)
            || taskGroups.reduce((latest, taskGroup) => (
              new Date(Math.max(toDate(latest).getTime(), toDate(taskGroup.readyAt).getTime()))
            ), group.readyAt)
          : group.readyAt;
        const step = group.queue[0];
        const quantity = getRouteStepQuantityForBatch(step, batch);
        const assignment = getManualPlanningAssignmentForRouteStep(step, quantity, readyAt, { state: planningState });
        if (!assignment) return null;
        return { group, step, quantity, window: assignment.window, assignment };
      })
      .filter(Boolean)
      .sort((left, right) => (
        toDate(left.window.start) - toDate(right.window.start)
        || toDate(left.window.end) - toDate(right.window.end)
      ));
    const selected = candidates[0];
    if (!selected) break;

    const slot = createSlotFromRouteStep(project, batch, selected.step, selected.window, selected.quantity, stamp, selected.assignment);
    planningState.slots = [...planningState.slots, slot];
    createdIds.push(slot.id);
    selected.group.queue.shift();
    selected.group.readyAt = addMs(slot.plannedEnd, getRouteBufferMs());
  }

  return createdIds;
}

function getRouteStepsMissingPlanningLine(routeSteps = [], state = null) {
  const sourceState = state || getRuntimePlanningState();
  return routeSteps.filter((step) => (
    routeStepRequiresManualPlanningLine(step, sourceState)
    && !getRouteStepSelectedPlanningWorkCenterId(step, sourceState)
  ));
}

function canRouteStepUsePlanningOrderLabor(route, step = {}) {
  return Boolean(route?.id && step?.id);
}

function getRouteStepsMissingPlanningLabor(route, routeSteps = []) {
  return (routeSteps || []).filter((step) => {
    if (!canRouteStepUsePlanningOrderLabor(route, step)) return false;
    const labor = route?.planningLaborByStepId?.[step.id] || {};
    return !labor.mode;
  });
}

function getPlanningRouteLaborReadiness(route, routeSteps = []) {
  const laborSteps = (routeSteps || []).filter((step) => canRouteStepUsePlanningOrderLabor(route, step));
  const missingSteps = getRouteStepsMissingPlanningLabor(route, laborSteps);
  const confirmed = Math.max(0, laborSteps.length - missingSteps.length);
  return {
    total: laborSteps.length,
    confirmed,
    missing: missingSteps.length,
    missingSteps,
    tone: missingSteps.length ? "warning" : laborSteps.length ? "ok" : "neutral",
    label: missingSteps.length
      ? `${formatPlanningOperationCount(missingSteps.length)} без оценки`
      : laborSteps.length
        ? "готово"
        : "нет операций",
  };
}

function schedulePlanningRouteToGantt(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const project = getRoutePlanningContext(route);
  if (!route || !project) {
    alert("Не удалось передать заказ-наряд в Гант: он не связан с изделием, платой или BOM.");
    return;
  }

  const specification = getRouteSpecification(route);
  // Seeded task metadata is required for preflight validation. If it changes
  // the route, make that preparation durable before any validation branch can
  // return; otherwise an unsuccessful handoff would leave invisible, in-place
  // changes that neither persistence nor the Weekly projection could observe.
  if (specification && ensureRouteTaskSeedSteps(route.id, specification)) {
    persistState();
  }
  const planningQuantity = getPlanningRouteQuantity(route);
  const invalidSteps = getInvalidRouteOperationSteps(route.id);
  if (invalidSteps.length) {
    alert(`Не удалось передать заказ-наряд в Гант: ${invalidSteps.length} операций не выбраны из справочника операций.`);
    return;
  }
  const routeSteps = getSchedulableRouteSteps(route.id);
  const supplyIssues = getPlanningSupplyBlockingIssues(route, getPlanningRouteTransferSummary(route), routeSteps);
  if (supplyIssues.length) {
    alert(`Не удалось передать заказ-наряд в Гант: проверьте обеспечение состава.\n${supplyIssues.slice(0, 6).join("\n")}`);
    ui.activeModule = "planning";
    ui.activeRouteId = route.id;
    ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || ui.activeProjectId || "";
    ui.planningWorkItem = "supply";
    persistUiState();
    render();
    return;
  }
  const batches = ensureRouteBatches(route, project);
  if (!routeSteps.length || !batches.length) {
    alert("Не удалось передать заказ-наряд в Гант: нет операций для размещения.");
    return;
  }
  const missingPlanningLines = getRouteStepsMissingPlanningLine(routeSteps, planningState);
  if (missingPlanningLines.length) {
    const names = missingPlanningLines
      .slice(0, 4)
      .map((step) => `${Number(step.stepOrder || 0)}. ${step.operationName || "SMT-операция"}`)
      .join("\n");
	    alert(`Не удалось передать заказ-наряд в Гант: выберите линию планирования для SMT-операций.\n${names}`);
	    if (ui.activeModule !== "planning") ui.activeModule = "routes";
	    ui.activeRouteId = route.id;
	    ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || ui.activeProjectId || "";
    persistUiState();
    render();
    return;
  }
  const missingPlanningLabor = getPlanningRouteLaborReadiness(route, routeSteps).missingSteps;
  if (missingPlanningLabor.length) {
    const names = missingPlanningLabor
      .slice(0, 6)
      .map((step) => `${Number(step.stepOrder || 0)}. ${step.operationName || "Операция"}`)
      .join("\n");
    alert(`Не удалось передать заказ-наряд в Гант: в опубликованной ревизии не рассчитана длительность операций. Исправьте нормирование в «Спецификации 2.0» и опубликуйте новую ревизию.\n${names}`);
    ui.activeModule = route.sourceSpecifications2EntryId ? "specifications2" : "planning";
    ui.activeRouteId = route.id;
    ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || ui.activeProjectId || "";
    persistUiState();
    render();
    return;
  }

  // Recalculate slot quantities only after the route has passed all
  // preflight checks. The final persistState() below publishes these changes
  // atomically with the scheduled work-order snapshot.
  syncPlanningRouteQuantity(route.id, planningQuantity, {
    updateSlots: true,
    persist: false,
    render: false,
    notify: false,
  });
  const stamp = new Date().toISOString();
  const workOrderSnapshot = route.workOrderSnapshot || {
    id: makeId("wo-snapshot"),
    createdAt: stamp,
    source: route.sourceSpecifications2EntryId ? "specifications2" : "planning",
    specificationId: route.specificationId || project.id,
    specificationRevision: Number(route.documentRevisionSnapshot?.specificationRevision || route.revision || 0),
    routeId: route.id,
    routeRevision: Number(route.documentRevisionSnapshot?.routeRevision || route.revision || 0),
    quantity: planningQuantity,
    releaseFingerprint: route.documentRevisionSnapshot?.releaseFingerprint || "",
    operationRevisions: routeSteps.map((step) => ({
      routeStepId: step.id,
      operationId: step.operationId || "",
      normRevisionId: step.normRevisionId || "",
      labor: { ...(route.planningLaborByStepId?.[step.id] || {}) },
    })),
  };
  planningState.routes = (planningState.routes || []).map((item) => (
    item.id === route.id ? { ...item, workOrderSnapshot } : item
  ));
  route.workOrderSnapshot = workOrderSnapshot;
  const anchorStart = getPlanningRouteAnchorStart(route, routeSteps);
  const createdIds = batches.flatMap((batch) => scheduleRouteBatchOptimally(project, batch, routeSteps, anchorStart, stamp));
  const alignedIds = alignRouteMainSlotsAfterBranches(route.id);
  planningState.routes = (planningState.routes || []).map((item) => (
    item.id === route.id
      ? { ...item, planningStatus: "scheduled", canceledAt: "", updatedAt: stamp }
      : item
  ));
  planningState = normalizePlanningState(planningState);
  ui.activeModule = "gantt";
  ui.activeProjectId = project.id;
  ui.activeRouteId = route.id;
  ui.expandedProjects.add(route.id);
  if (createdIds.length) ui.selectedSlotId = createdIds[0];
  else if (alignedIds.length) ui.selectedSlotId = alignedIds[0];
  persistState();
  persistUiState();
  notifySaveSuccess(createdIds.length
    ? "Заказ-наряд передан в Гант"
    : alignedIds.length
      ? "Зависимости заказ-наряда обновлены"
      : "Заказ-наряд уже был в Ганте");
  focusRoute(route.id);
  if (!createdIds.length && !alignedIds.length) {
    alert("Все операции этого заказ-наряда уже находятся в Ганте.");
  }
}

function cancelPlanningRoute(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) return;

  const routeSlots = getPlanningRouteSlots(route);
  const slotIds = new Set(routeSlots.map((slot) => slot.id));
  const stamp = new Date().toISOString();

  planningState.slots = (planningState.slots || []).filter((slot) => !slotIds.has(slot.id));
  planningState.routes = (planningState.routes || []).map((item) => (
    item.id === route.id
      ? { ...item, planningStatus: "canceled", canceledAt: stamp, updatedAt: stamp }
      : item
  ));
  if (slotIds.has(ui.selectedSlotId)) ui.selectedSlotId = null;
	  ui.activeModule = "planning";
	  ui.activeRouteId = route.id;
	  ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || ui.activeProjectId || "";
  planningState = normalizePlanningState(planningState);
  withPlanningEntityRemovalAllowed(() => persistState());
  persistUiState();
  notifySaveSuccess(routeSlots.length ? "Заказ отменен, операции сняты из Ганта" : "Заказ отменен");
  render();
}

function openPlanningForProject(productionId = "") {
  const project = getProject(productionId) || getProductionContextForSpecification(getActiveSpecificationForModule());
  const route = project ? getProjectRouteForModule(project.id) : null;
  ui.activeModule = "planning";
  ui.activeProjectId = project?.id || ui.activeProjectId || "";
  ui.activeRouteId = route?.id || ui.activeRouteId || "";
  ui.selectedSlotId = null;
  ui.editor = null;
  persistUiState();
  render();
}

function openPlanningForRoute(routeId = "") {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) {
    openPlanningForProject(ui.activeProjectId || "");
    return;
	  }
	  ui.activeModule = "planning";
	  ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || ui.activeProjectId || "";
	  ui.activeRouteId = route.id;
  ui.selectedSlotId = null;
  ui.editor = null;
	  persistUiState();
	  render();
}

  const api = {
    makeRouteOperationId,
    getDefaultSecondsPerPanel,
    getComponentTypes,
    getProjectSpecification,
    normalizeStructureFulfillmentMode,
    getDefaultStructureFulfillmentMode,
    getExecutionTypeForFulfillmentMode,
    getSpecificationItemFulfillmentMode,
    isSchedulableFulfillmentMode,
    getFulfillmentLabel,
    getFulfillmentMeta,
    getFulfillmentTone,
    getDefaultStructureNomenclatureType,
    inferStructureNomenclatureType,
    normalizeSpecificationStructureItem,
    buildDefaultSpecificationStructureItems,
    getSpecificationStructureItems,
    getSpecificationBomCandidates,
    pickDefaultBomForSpecificationItem,
    getDefaultSpekiOperationName,
    getSpekiOperationOptions,
    getSpekiDepartmentOptions,
    getDefaultSpekiDepartmentName,
    getRouteStepsForModule,
    getRouteStepTaskId,
    getRouteStepsForTask,
    getRouteBaseTasks,
    getRouteUnscopedBaseTasks,
    getRouteBaseTaskIds,
    isRouteStepLinkedToCurrentRouteTask,
    pruneRouteStepsOutsideCurrentRouteTasks,
    getRouteProductionId,
    getRouteProductionContext,
    getRoutePlanningContext,
    getRouteConcreteTasksForPlanning,
    getPlanningTasksForRoute,
    getRouteStepsForPlanningTask,
    getRouteForStep,
    getRouteStepPlanningTask,
    getRouteStepEffectiveQuantityMultiplier,
    getRouteStepEffectiveBoardsPerPanel,
    getRouteStepEffectiveBomListId,
    getRouteStepEffectiveOperationContext,
    normalizeRouteStepFlowItems,
    makeManualRouteStepFlowItems,
    getRouteStepManualFlowLabel,
    makeRouteStepFlowItem,
    getRouteTaskSourceSpecification,
    getRouteTaskSourceStructureItem,
    getRouteTaskChildStructureItems,
    getRouteTaskProducedObjectLabel,
    renderRouteTaskOutputHint,
    getRouteTaskInputObjectLabel,
    isLastProductionStepForRouteTask,
    joinRouteStepFlowLabels,
    getRouteStepFlowTarget,
    deriveRouteStepFlowItems,
    getRouteStepFlowModel,
    getSlotOperationFlow,
    renderOperationFlowMap,
    renderRouteStepFlowEditor,
    renderRouteStepFlowSummary,
    renderRouteStepFlowOverride,
    renderRouteStepFlowToggle,
    renderRouteStepFlowPanelRow,
    getRouteStepCalculationTypeView,
    getRouteStepCalculationTypeOptions,
    getRouteStepLaborPlanningWorkCenterOptions,
    getRouteStepLaborSnapshot,
    renderRouteStepLaborReadout,
    renderRouteStepResourceFactorReadout,
    renderRouteStepLaborToggle,
    renderRouteStepLaborPanelRow,
    getWorkCenterIdForRouteTask,
    getSpecificationRouteTasks,
    getRouteBomTasks,
    getRouteTasksForModule,
    getSchedulableRouteSteps,
    compareRouteStepsForScheduling,
    getInvalidRouteOperationSteps,
    getSchedulableProjectRouteSteps,
    ensureRouteTaskSeedSteps,
    getProjectRouteForModule,
    getSpecificationRouteForModule,
    getActiveRouteForModule,
    getRouteModuleStats,
    getRouteChildGenerationTasks,
    getRouteTaskSubtreeIds,
    isDirectRouteChildTask,
    getRouteLinkedChildTasks,
    getRouteLinkedChildDocuments,
    findGeneratedChildRoute,
    getGeneratedChildRouteName,
    shouldRefreshGeneratedChildRouteName,
    buildChildRouteCard,
    cloneRouteStepForChildRoute,
    syncGeneratedChildRouteSteps,
    getRouteGenerationRoot,
    generateChildRouteCardsForActiveRoute,
    getRouteDeleteUsage,
    deleteRouteMapConfirmed,
    ensureProjectBatches,
    ensureRouteBatches,
    comparePlanningBatches,
    getRoutePlanningOrder,
    getRoutePlanningBatches,
    getPlanningBatchSlots,
    getPlanningRouteSlots,
    getPlanningRouteOrderState,
    getRouteCardViewModel,
    getWorkOrderPlanningStatusView,
    getWorkOrderViewModel,
    getPlanningOrderSourceLabel,
    getPlanningOrderObjectLabel,
    getPlanningWorkOrderTitle,
    getPlanningWorkOrderQueueTitle,
    getPlanningWorkOrderSubtitle,
    getPlanningShiftDateLabel,
    getPlanningShiftSlotTimeLabel,
    getPlanningShiftOrderTone,
    getPlanningShiftOrderStatusLabel,
    getPlanningShiftOrdersForRoute,
    getPlanningBatchQuantityTotal,
    getPlanningRouteQuantity,
    getPlanningRouteStartDate,
    getPlanningRouteAnchorStart,
    syncPlanningRouteQuantity,
    syncPlanningRouteStartDate,
    recalculatePlanningBatchSlots,
    getPlanningBoardsPerPanelOverrides,
    getPlanningBoardsPerPanel,
    syncPlanningBoardsPerPanel,
    updatePlanningSupplyFulfillment,
    getRouteStepQuantityForBatch,
    getPlanningMultiplicationRows,
    getPlanningRouteTransferSummary,
    getPlanningScheduleAnchorStart,
    createSlotFromRouteStep,
    scheduleRouteBatchOptimally,
    getRouteStepsMissingPlanningLine,
    getRouteStepsMissingPlanningLabor,
    getPlanningRouteLaborReadiness,
    schedulePlanningRouteToGantt,
    cancelPlanningRoute,
    openPlanningForProject,
    openPlanningForRoute,
  };

  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, function planningRoutesServiceEntry(...args) {
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
