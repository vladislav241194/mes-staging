import { formatDecimalNumber } from "../../ui/formatters.js";

export function createAppInteractionsModule(dependencies = {}) {
  const {
    addMs,
    app,
    audit,
    bom,
    BOM_COMPONENT_FIELDS,
    cancelAuthPrototypePinFeedback = () => {},
    cancelPlanningRoute,
    canEditDirectorySection = () => false,
    cascadeBatchFromSlot,
    center,
    config,
    count,
    deleteEmployeeSession = async () => ({ ok: true, authenticated: false }),
    deleteOperationMapItem,
    deleteRouteMapConfirmed,
    deleteRouteStepConfirmed = () => {},
    denseInlineViewportListenersBound: initialDenseInlineViewportListenersBound = false,
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
    getPlanningStartDateReconciliation = () => null,
    getRouteInstructionWorkCenterId,
    getRouteInstructionWorkCenters,
    getShiftMasterBoardModel = () => ({ rows: [], allRows: [] }),
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
    mobileModuleSwitcherBehaviorBound: initialMobileModuleSwitcherBehaviorBound = false,
    mode,
    mountGlobalVisualSystem,
    name,
    normalizeDirectorySectionId,
    normalizeLookupText = (rawValue = "") => String(rawValue || "").trim().toLowerCase(),
    normalizeShiftMasterBoardQuantity = (rawValue = 0) => Number(rawValue) || 0,
    normalizeShiftWorkOrderIssueReports = (value = {}) => dependencies.normalizePlainRecord?.(value) || {},
    notifySaveSuccess = () => {},
    option,
    persistState,
    persistUiState,
    render,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiModalFrame,
    renderPreservingModuleScroll,
    resource,
    rowId,
    saveShiftMasterBoardAssignment = () => null,
    sectionId,
    selected,
    specification,
    toDateInput,
    type,
    updateModuleUrlParam,
    value,
    values,
    WORK_MODE_OPTIONS,
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
  let denseInlineViewportListenersBound = initialDenseInlineViewportListenersBound;
  let mobileModuleSwitcherBehaviorBound = initialMobileModuleSwitcherBehaviorBound;
  let directoryLegacyInteractionsApi = null;
  let directoryLegacyInteractionsLoad = null;
  let shiftWorkOrderQaLegacyApi = null;
  let shiftWorkOrderQaLegacyLoad = null;

function getDirectoryLegacyInteractionDependencies() {
  return {
    addMs,
    alertUser: dependencies.alertUser,
    app,
    BOM_COMPONENT_FIELDS,
    canEditDirectorySection,
    clearDirectoryColumnFilter,
    clearDirectorySectionFilters,
    deleteDirectoryStateRow: dependencies.deleteDirectoryStateRow,
    deleteOperationMapItem,
    denseInlineViewportListenersBound,
    escapeAttribute,
    escapeHtml,
    formatDirectoryCell,
    getDirectoryData,
    getDirectoryRowLabel,
    getOperationMapRows,
    getPlanningWorkCenters,
    getProductionResources: dependencies.getProductionResources,
    getRouteInstructionWorkCenterId,
    getRouteInstructionWorkCenters,
    getSelectedDirectoryRowIndex,
    icon,
    isLegacyDirectoryWriteBlocked: dependencies.isLegacyDirectoryWriteBlocked,
    makeId,
    normalizeDirectorySectionId,
    openConfirmDialog,
    persistDirectoryState: dependencies.persistDirectoryState,
    persistState,
    persistUiState,
    render,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiModalFrame,
    saveDirectoryRow: dependencies.saveDirectoryRow,
    selected,
    setDirectoryColumnFilter,
    toDateInput,
    withDirectoryEntityRemovalAllowed: dependencies.withDirectoryEntityRemovalAllowed,
    WORK_MODE_OPTIONS,
    getUi: dependencies.getUi,
    getDirectoryState: dependencies.getDirectoryState,
  };
}

function ensureDirectoryLegacyInteractions() {
  if (directoryLegacyInteractionsApi) return Promise.resolve(directoryLegacyInteractionsApi);
  if (!directoryLegacyInteractionsLoad) {
    directoryLegacyInteractionsLoad = import("./directory_legacy.js")
      .then(({ createDirectoryLegacyInteractions }) => {
        if (typeof createDirectoryLegacyInteractions !== "function") {
          throw new Error("Directory legacy interactions did not export their factory");
        }
        directoryLegacyInteractionsApi = createDirectoryLegacyInteractions(getDirectoryLegacyInteractionDependencies());
        directoryLegacyInteractionsApi.bindDenseInlineSelectViewportEvents?.();
        return directoryLegacyInteractionsApi;
      })
      .catch((error) => {
        directoryLegacyInteractionsLoad = null;
        throw error;
      });
  }
  return directoryLegacyInteractionsLoad;
}

function isShiftWorkOrderQaRuntimeRequest() {
  try {
    return new URLSearchParams(window.location.search).has("qa");
  } catch {
    return false;
  }
}

function getShiftWorkOrderQaLegacyDependencies() {
  return {
    getShiftMasterBoardModel,
    getUi: dependencies.getUi,
    isQaRuntimeRequest: isShiftWorkOrderQaRuntimeRequest,
    normalizeShiftMasterBoardQuantity,
    normalizeShiftWorkOrderIssueReports,
    persistUiState,
    renderPreservingModuleScroll,
    saveShiftMasterBoardAssignment,
  };
}

function ensureShiftWorkOrderQaLegacyApi() {
  if (shiftWorkOrderQaLegacyApi) return Promise.resolve(shiftWorkOrderQaLegacyApi);
  if (!shiftWorkOrderQaLegacyLoad) {
    shiftWorkOrderQaLegacyLoad = import("./shift_work_order_qa_legacy.js")
      .then(({ createShiftWorkOrderQaLegacyApi }) => {
        if (typeof createShiftWorkOrderQaLegacyApi !== "function") {
          throw new Error("Shift Work Orders QA legacy helper did not export its factory");
        }
        shiftWorkOrderQaLegacyApi = createShiftWorkOrderQaLegacyApi(getShiftWorkOrderQaLegacyDependencies());
        return shiftWorkOrderQaLegacyApi;
      })
      .catch((error) => {
        shiftWorkOrderQaLegacyLoad = null;
        throw error;
      });
  }
  return shiftWorkOrderQaLegacyLoad;
}

function invokeShiftWorkOrderQaLegacy(methodName, args, deniedResult, unavailableResult) {
  if (!isShiftWorkOrderQaRuntimeRequest()) return deniedResult;
  return ensureShiftWorkOrderQaLegacyApi()
    .then((api) => {
      const method = api?.[methodName];
      if (typeof method !== "function") return unavailableResult;
      return method(...args);
    })
    .catch(() => unavailableResult);
}

function getDirectoryData(sectionId) {
  sectionId = normalizeDirectorySectionId(sectionId);
  if (sectionId === "statuses") {
    return makeDirectoryData(sectionId, {
      readOnly: true,
      caption: "Единые статусы, режимы и системные сигналы MES. Область показывает контур применения, стартовый модуль показывает где статус появляется впервые, а поле изменения показывает где его меняют или пересчитывают.",
      columns: ["Область применения", "Стартовый модуль", "Где меняется", "Контракт", "Переход", "Статус", "Влияние"],
      keys: ["group", "originModule", "changeModule", "contractView", "transitionView", "name", "impactView"],
      readerColumns: ["Область применения", "Стартовый модуль", "Где меняется", "Где используется", "Контракт", "Переход", "Следующий документ", "Категория", "Статус", "Ревизия", "Объект", "Код", "Аннотация", "Влияние"],
      readerKeys: ["group", "originModule", "changeModule", "usedIn", "contractView", "transitionView", "nextDocumentView", "registryKind", "name", "audit", "type", "code", "annotation", "impactView"],
      rows: (directoryState.statuses || []).map((row) => {
        const lifecycle = getStatusLifecycleModules(row);
        const normalizedRow = {
          ...row,
          originModule: row.originModule || lifecycle.originModule,
          changeModule: row.changeModule || lifecycle.changeModule,
        };
        return {
          ...normalizedRow,
          usedIn: getStatusUsedInText(normalizedRow),
          contractView: getStatusContractView(normalizedRow),
          transitionView: getStatusTransitionView(normalizedRow),
          nextDocumentView: getStatusNextDocumentView(normalizedRow),
          impactView: getStatusImpactView(normalizedRow),
          registryKind: getStatusRegistryKindLabel(normalizedRow.registryKind),
          registryKindValue: normalizedRow.registryKind,
          audit: getStatusAuditInfo(normalizedRow).label,
        };
      }),
    });
  }

  if (sectionId === "operations") {
    return makeDirectoryData(sectionId, {
      caption: "Операции используются в маршрутных картах и привязаны к отделам.",
      columns: ["Операция", "Отдел", "Статус"],
      keys: ["name", "workCenterId", "status"],
      rows: getOperationMapRows(),
    });
  }

  const configs = {
    componentTypes: {
      caption: "Коэффициенты сложности и ограничения скорости для расчета SMT-монтажа.",
      columns: ["Тип", "Корпус", "Семейство", "Коэф.", "Комп./ч", "Setup, сек", "По умолч.", "Статус"],
      keys: ["name", "package", "family", "coefficient", "placementsPerHour", "setupSeconds", "defaultCount", "status"],
      rows: directoryState.componentTypes,
    },
    nomenclatureTypes: {
      caption: "Типы номенклатуры синхронизируются с модулем номенклатуры и используются как разделы списка.",
      columns: ["Тип номенклатуры", "Код", "Описание", "Статус"],
      keys: ["name", "code", "description", "status"],
      rows: directoryState.nomenclatureTypes,
    },
  };

  return makeDirectoryData(sectionId, configs[sectionId] || getDirectoryData("operations"));
}

function makeDirectoryData(sectionId, config) {
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const readOnly = Boolean(config.readOnly || !canEditDirectorySection(sectionId));
  const data = {
    sectionId,
    fields: config.keys.map((key, index) => ({
      key,
      label: config.columns[index],
      sectionId,
      type: getDirectoryFieldType(sectionId, key),
      readonly: Boolean(readOnly || isDirectoryFieldReadonly(sectionId, key)),
    })),
    ...config,
    readOnly,
    rows,
  };
  const visibleRows = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => directoryRowMatchesColumnFilters(data, row));
  return {
    ...data,
    visibleRows,
    activeFilterCount: getDirectoryActiveFilterCount(sectionId),
  };
}

function normalizeDirectoryColumnFilters(filters = {}) {
  if (!filters || typeof filters !== "object") return {};
  return Object.fromEntries(Object.entries(filters).map(([sectionId, sectionFilters]) => {
    if (!sectionFilters || typeof sectionFilters !== "object") return [sectionId, {}];
    const normalizedSection = Object.fromEntries(Object.entries(sectionFilters).map(([key, values]) => [
      key,
      Array.isArray(values)
        ? [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
        : [],
    ]).filter(([, values]) => values.length));
    return [sectionId, normalizedSection];
  }).filter(([, sectionFilters]) => Object.keys(sectionFilters).length));
}

function getDirectorySectionFilters(sectionId) {
  const normalized = normalizeDirectoryColumnFilters(ui.directoryColumnFilters);
  if (normalized !== ui.directoryColumnFilters) ui.directoryColumnFilters = normalized;
  return normalized[sectionId] || {};
}

function getDirectoryColumnFilterValues(sectionId, key) {
  return getDirectorySectionFilters(sectionId)[key] || [];
}

function getDirectoryActiveFilterCount(sectionId) {
  return Object.values(getDirectorySectionFilters(sectionId))
    .filter((values) => Array.isArray(values) && values.length)
    .length;
}

function getDirectoryFilterCellValue(sectionId, key, row = {}) {
  if (sectionId === "statuses" && key === "audit") return getStatusAuditInfo(row).label;
  return formatDirectoryCell(sectionId, key, row[key]);
}

function getDirectoryFilterToken(sectionId, key, row = {}) {
  return String(getDirectoryFilterCellValue(sectionId, key, row) ?? "").trim() || "-";
}

function normalizeDirectoryFilterSearch(value = "") {
  return normalizeLookupText(value).replace(/\s+/g, " ").trim();
}

function directoryRowMatchesColumnFilters(directoryData, row = {}) {
  const filters = getDirectorySectionFilters(directoryData.sectionId);
  return Object.entries(filters).every(([key, values]) => {
    if (!Array.isArray(values) || !values.length) return true;
    return values.includes(getDirectoryFilterToken(directoryData.sectionId, key, row));
  });
}

function getDirectoryColumnFilterOptions(directoryData, key) {
  const counts = new Map();
  directoryData.rows.forEach((row) => {
    const token = getDirectoryFilterToken(directoryData.sectionId, key, row);
    counts.set(token, (counts.get(token) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (left.value === "-") return 1;
      if (right.value === "-") return -1;
      return left.value.localeCompare(right.value, "ru", { numeric: true });
    });
}

function setDirectoryColumnFilter(sectionId, key, values = []) {
  const normalizedValues = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  const nextFilters = normalizeDirectoryColumnFilters(ui.directoryColumnFilters);
  const sectionFilters = { ...(nextFilters[sectionId] || {}) };
  if (normalizedValues.length) {
    sectionFilters[key] = normalizedValues;
  } else {
    delete sectionFilters[key];
  }
  if (Object.keys(sectionFilters).length) {
    nextFilters[sectionId] = sectionFilters;
  } else {
    delete nextFilters[sectionId];
  }
  ui.directoryColumnFilters = nextFilters;
  const nextData = getDirectoryData(sectionId);
  ui.selectedDirectoryRows[sectionId] = nextData.visibleRows[0]?.rowIndex ?? 0;
  persistUiState();
  render();
}

function clearDirectoryColumnFilter(sectionId, key) {
  setDirectoryColumnFilter(sectionId, key, []);
}

function clearDirectorySectionFilters(sectionId) {
  const nextFilters = normalizeDirectoryColumnFilters(ui.directoryColumnFilters);
  delete nextFilters[sectionId];
  ui.directoryColumnFilters = nextFilters;
  ui.selectedDirectoryRows[sectionId] = 0;
  persistUiState();
  render();
}

function getDirectoryFieldType(sectionId, key) {
  if (sectionId === "specifications" && (key === "bomListA" || key === "bomListB")) return "bom-link";
  if (sectionId === "operations" && key === "workCenterId") return "work-center-link";
  if (
    key === "totalQuantity"
    || key === "steps"
    || key === "unitsPerHour"
    || key === "baseCph"
    || key === "efficiency"
    || key === "changeoverMin"
    || key === "coefficient"
    || key === "placementsPerHour"
    || key === "setupSeconds"
    || key === "defaultCount"
    || key === "bomQtyA"
    || key === "bomQtyB"
    || BOM_COMPONENT_FIELDS.some((field) => field.key === key)
  ) return "number";
  if (key === "dueDate") return "date";
  if (key === "default") return "yes-no";
  return "text";
}

function isDirectoryFieldReadonly(sectionId, key) {
  if (sectionId === "statuses" && key === "audit") return true;
  if (sectionId === "statuses" && key === "registryKind") return true;
  if (sectionId === "statuses" && (key === "originModule" || key === "changeModule")) return true;
  if (sectionId === "statuses" && (key === "usedIn" || key === "impactView" || key === "contractView" || key === "transitionView" || key === "nextDocumentView")) return true;
  return false;
}

function getSelectedDirectoryRowIndex(sectionId, rows) {
  const index = Number(ui.selectedDirectoryRows?.[sectionId] || 0);
  if (!rows.length) return 0;
  return Math.max(0, Math.min(rows.length - 1, Number.isFinite(index) ? index : 0));
}

function formatDirectoryCell(sectionId, key, value) {
  if (sectionId === "specifications" && (key === "bomListA" || key === "bomListB")) return getBomList(value)?.name || "-";
  if (sectionId === "specifications" && (key === "bomQtyA" || key === "bomQtyB")) return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "bomLists" && BOM_COMPONENT_FIELDS.some((field) => field.key === key)) return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "operations" && key === "workCenterId") {
    const routeWorkCenterId = getRouteInstructionWorkCenterId(value);
    return getWorkCenter(routeWorkCenterId)?.name || routeWorkCenterId || value || "-";
  }
  if (sectionId === "componentTypes" && key === "coefficient") return formatDecimalNumber(value, 2);
  if (sectionId === "componentTypes" && key === "placementsPerHour") return `${Number(value || 0).toLocaleString("ru-RU")} комп./ч`;
  if (sectionId === "componentTypes" && key === "setupSeconds") return `${Number(value || 0).toLocaleString("ru-RU")} сек`;
  if (sectionId === "componentTypes" && key === "defaultCount") return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (key === "default") return value === "yes" ? "Да" : "Нет";
  return value ?? "";
}

function getDirectorySectionLabel(sectionId) {
  return directorySections.find((section) => section.id === sectionId)?.label
    || sectionId
    || "Справочник";
}

function getDirectoryRowLabel(sectionId, row) {
  if (!row) return "";
  if (sectionId === "statuses") return String(row.name || row.code || row.group || "").trim();
  const data = getDirectoryData(sectionId);
  const primaryKey = data.keys?.[0] || "name";
  return String(row[primaryKey] || row.name || row.operationName || row.code || row.id || "").trim();
}

function renderDirectoryEditorModal(...args) {
  return directoryLegacyInteractionsApi?.renderDirectoryEditorModal?.(...args) || "";
}

function renderDirectoryReaderModal(...args) {
  return directoryLegacyInteractionsApi?.renderDirectoryReaderModal?.(...args) || "";
}

function renderDirectoryField(...args) {
  return directoryLegacyInteractionsApi?.renderDirectoryField?.(...args) || "";
}

function createEmptyDirectoryRow(...args) {
  return directoryLegacyInteractionsApi?.createEmptyDirectoryRow?.(...args) || {};
}

function getDirectoryHealth(sectionId) {
  const rows = getDirectoryData(sectionId).rows;
  const review = rows.filter((row) => Object.values(row).some((value) => String(value).match(/Проверка|Проблема|Отключен/))).length;
  return {
    ready: Math.max(0, rows.length - review),
    review,
  };
}

function clearDenseInlineSelectPopover(...args) {
  return directoryLegacyInteractionsApi?.clearDenseInlineSelectPopover?.(...args);
}

function closeDenseInlineSelects(...args) {
  return directoryLegacyInteractionsApi?.closeDenseInlineSelects?.(...args);
}

function positionDenseInlineSelectPopover(...args) {
  return directoryLegacyInteractionsApi?.positionDenseInlineSelectPopover?.(...args);
}

function updateOpenDenseInlineSelectPopovers(...args) {
  return directoryLegacyInteractionsApi?.updateOpenDenseInlineSelectPopovers?.(...args);
}

function bindDenseInlineSelectViewportEvents(...args) {
  return directoryLegacyInteractionsApi?.bindDenseInlineSelectViewportEvents?.(...args);
}

function bindGlobalNavigation() {
  bindModuleMenuNavigation();
  bindAuthLogoutNavigation();
  bindMobileModuleSwitcherBehavior();
  bindDenseInlineSelectViewportEvents();
  exposeMesRuntimeApi();
  mountGlobalVisualSystem();
}

function performAuthLogout() {
  cancelAuthPrototypePinFeedback();
  // The global navigation owner binds before module-local auth events and
  // stops their duplicate click listener. Clear the signed employee session
  // here as part of the canonical logout so a locally locked screen cannot
  // leave Nomenclature command authority alive on the server.
  void Promise.resolve(deleteEmployeeSession()).catch(() => {});
  lockAuthGate();
  ui.activeModule = "authPrototype";
  updateModuleUrlParam(ui.activeModule);
  persistUiState();
  render();
}

function bindAuthLogoutNavigation() {
  app.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      performAuthLogout();
    });
  });
}

function isElementVisibleForInteraction(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0
    && rect.height > 0
    && style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity || 1) !== 0
    && style.pointerEvents !== "none";
}

function getModuleMenuButtonFromEventTarget(target) {
  const button = target?.closest?.(".module-tabs .module-tab[data-module], .mobile-module-switcher .mobile-module-tab[data-module]");
  if (!button || !app.contains(button) || !isElementVisibleForInteraction(button)) return null;
  return button;
}

function openModuleFromMenuButton(button) {
  const moduleId = button?.dataset?.module || "";
  if (!moduleId) return false;
  navigateToModule(moduleId);
  return true;
}

function bindModuleMenuNavigation() {
  app.querySelectorAll(".module-tabs .module-tab[data-module], .mobile-module-switcher .mobile-module-tab[data-module]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (!isElementVisibleForInteraction(button)) return;
      event.preventDefault();
      event.stopPropagation();
      openModuleFromMenuButton(button);
    });
  });
}

function bindMobileModuleSwitcherBehavior() {
  if (mobileModuleSwitcherBehaviorBound) return;
  mobileModuleSwitcherBehaviorBound = true;
  app.addEventListener("toggle", (event) => {
    const switcher = event.target?.closest?.(".mobile-module-switcher");
    if (!switcher || !app.contains(switcher) || !switcher.open) return;
    const sheet = switcher.querySelector(".mobile-module-sheet");
    const activeButton = switcher.querySelector(".mobile-module-tab.is-active[data-module]");
    if (!sheet || !activeButton) return;
    window.requestAnimationFrame(() => {
      activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, true);
}

function exposeMesRuntimeApi() {
  window.__mesRuntime = {
    navigateToModule(moduleId) {
      const target = String(moduleId || "");
      const normalizedTarget = target === "bomLists" ? "nomenclature" : target;
      if (!getAvailableModules().some((moduleItem) => moduleItem.id === normalizedTarget)) return ui.activeModule;
      navigateToModule(target);
      return ui.activeModule;
    },
    getActiveModule() {
      return ui.activeModule;
    },
    getActiveModuleLabel() {
      return getModuleDefinitions().find((moduleItem) => moduleItem.id === ui.activeModule)?.label || ui.activeModule || "unknown";
    },
    setFocusMode(enabled) {
      ui.focusMode = Boolean(enabled);
      persistUiState();
      render();
      return ui.focusMode;
    },
    getFocusMode() {
      return Boolean(ui.focusMode);
    },
    setShiftWorkOrderIssueReportsForTest(reportsByRow) {
      return invokeShiftWorkOrderQaLegacy(
        "setShiftWorkOrderIssueReportsForTest",
        [reportsByRow],
        { applied: false, reason: "qa parameter is required" },
        { applied: false, reason: "qa runtime is unavailable" },
      );
    },
    seedShiftWorkOrderJournalAssignmentForTest() {
      return invokeShiftWorkOrderQaLegacy(
        "seedShiftWorkOrderJournalAssignmentForTest",
        [],
        { seeded: false, reason: "qa parameter is required" },
        { seeded: false, reason: "qa runtime is unavailable" },
      );
    },
  };
}

async function navigateToModule(moduleId) {
  const requestedModuleId = moduleId;
  moduleId = moduleId === "bomLists" ? "nomenclature" : moduleId;
  const targetModule = getAvailableModules().find((moduleItem) => moduleItem.id === moduleId);
  if (!targetModule || ui.activeModule === moduleId) return;
  // Switching an already-loaded module is synchronous and normally takes less
  // time than the long-task overlay itself. Render it immediately; the overlay
  // remains reserved for XLSX, Word and planning calculations that can really
  // occupy the interface for a noticeable time.
  const previousModule = ui.activeModule;
  const startDateReconciliation = getPlanningStartDateReconciliation();
  if (previousModule === "planning" && moduleId !== "planning" && startDateReconciliation) {
    notifySaveSuccess("Сначала проверьте незавершённую команду даты старта.");
    return;
  }
  ui.activeModule = moduleId;
  ui.selectedSlotId = null;
  ui.editor = null;
  ui.splitSlotId = null;
  ui.confirmDialog = null;
  if (moduleId === "nomenclature" && previousModule !== "nomenclature") {
    ui.activeNomenclatureId = "";
    ui.activeNomenclaturePane = requestedModuleId === "bomLists" ? "boards" : "items";
  }
  if (moduleId === "planning" && previousModule !== "planning") {
    ui.activeRouteId = String(startDateReconciliation?.routeId || "");
  }
  updateModuleUrlParam(moduleId);
  persistUiState();
  render();
}

function openConfirmDialog(action, payload = {}) {
  ui.confirmDialog = { action, payload };
  render();
}

function bindConfirmEvents() {
  app.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-confirm-cancel]")) return;
      ui.confirmDialog = null;
      render();
    });
  });

  app.querySelector("[data-confirm-approve]")?.addEventListener("click", () => {
    const dialog = ui.confirmDialog;
    ui.confirmDialog = null;
    performConfirmedAction(dialog);
  });
}

function performConfirmedAction(dialog) {
  if (!dialog) return;
  const payload = dialog.payload || {};

  if (dialog.action === "deleteSlot") {
    deleteSlotConfirmed(payload.slotId);
    return;
  }

  if (dialog.action === "planningCancelRoute") {
    cancelPlanningRoute(payload.routeId);
    return;
  }

  if (dialog.action === "spekiDeleteSpecification") {
    deleteSpekiSpecification(payload.specificationId);
    return;
  }

  if (dialog.action === "directoryDeleteRow") {
    deleteDirectoryRow(payload.sectionId, payload.rowIndex);
    return;
  }

  if (dialog.action === "operationMapDelete") {
    deleteOperationMapItem(payload.operationId);
    return;
  }

  if (dialog.action === "cascadeSlot") {
    cascadeBatchFromSlot(payload.slotId);
    persistState();
    render();
    return;
  }

  if (dialog.action === "fixAllWarnings") {
    autoFixAllWarnings();
    return;
  }

  if (dialog.action === "routeDeleteStep") {
    deleteRouteStepConfirmed(payload.stepId);
    return;
  }

  if (dialog.action === "routeDeleteMap") {
    deleteRouteMapConfirmed(payload.routeId);
  }
}

function bindDirectoryForm(...args) {
  return directoryLegacyInteractionsApi?.bindDirectoryForm?.(...args);
}

function deleteDirectoryRow(...args) {
  return directoryLegacyInteractionsApi?.deleteDirectoryRow?.(...args) ?? false;
}

function bindDirectoryEvents(...args) {
  if (directoryLegacyInteractionsApi) {
    return directoryLegacyInteractionsApi.bindDirectoryEvents?.(...args);
  }
  const renderRoot = app.firstElementChild;
  void ensureDirectoryLegacyInteractions()
    .then((api) => {
      if (app.firstElementChild !== renderRoot) return;
      api.bindDirectoryEvents?.(...args);
    })
    .catch((error) => console.error("[MES directories] legacy interactions failed to load", error));
  return undefined;
}


  return {
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
    ensureDirectoryLegacyInteractions,
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
    bindDirectoryForm,
    bindDirectoryEvents,
    deleteDirectoryRow,
  };
}
