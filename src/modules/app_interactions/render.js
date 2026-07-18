import { formatDecimalNumber } from "../../ui/formatters.js";

export function createAppInteractionsModule(dependencies = {}) {
  const {
    addMs,
    app,
    audit,
    bindDirectoryForm,
    bom,
    BOM_COMPONENT_FIELDS,
    cancelAuthPrototypePinFeedback = () => {},
    cancelPlanningRoute,
    canEditDirectorySection = () => false,
    cascadeBatchFromSlot,
    center,
    config,
    count,
    deleteDirectoryRow,
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

function renderDirectoryEditorModal(activeSection, directoryData) {
  if (!ui.directoryEditor || directoryData.readOnly) return "";
  const isCreate = ui.directoryEditor.mode === "create";
  const rowIndex = isCreate ? -1 : ui.directoryEditor.rowIndex;
  const row = isCreate ? createEmptyDirectoryRow(directoryData) : directoryData.rows[rowIndex];
  if (!row) return "";

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      ${renderUiModalFrame({
        title: isCreate ? "Новая запись" : "Редактирование записи",
        meta: activeSection.label,
        className: "large-modal form-modal",
        size: "large",
        attributes: "aria-label=\"Редактирование справочника\"",
        headActions: `<button class="icon-button ui-action-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>`,
        body: `
        <form id="directoryForm">
          <input type="hidden" name="sectionId" value="${activeSection.id}" />
          <input type="hidden" name="rowIndex" value="${rowIndex}" />
          <input type="hidden" name="rowId" value="${escapeAttribute(row.id || "")}" />

          ${renderUiFormGrid({
            columns: "2",
            className: "directory-editor-form-grid",
            body: `
            ${directoryData.fields.map((field) => renderDirectoryField(field, row[field.key])).join("")}
          `,
          })}
        </form>
      `,
        actions: renderUiFormActions({
          actions: `
            ${isCreate ? "" : `<button class="secondary-button danger ui-action-button" data-delete-directory-current type="button">${icon("trash")}<span>Удалить</span></button>`}
            <button class="secondary-button ui-action-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button ui-action-button" form="directoryForm" type="submit">${icon("save")}<span>Сохранить</span></button>
          `,
        }),
      })}
    </div>
  `;
}

function renderDirectoryReaderModal(activeSection, directoryData) {
  if (!ui.directoryReader || ui.directoryReader.sectionId !== activeSection.id) return "";
  const rowIndex = Number(ui.directoryReader.rowIndex);
  const row = Number.isFinite(rowIndex) ? directoryData.rows[rowIndex] : null;
  if (!row) return "";
  const title = getDirectoryRowLabel(activeSection.id, row) || activeSection.label;
  const readerKeys = directoryData.readerKeys || directoryData.keys;
  const readerColumns = directoryData.readerColumns || directoryData.columns;

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      ${renderUiModalFrame({
        title,
        meta: "Запись справочника",
        className: "large-modal directory-reader-modal",
        size: "large",
        attributes: "aria-label=\"Просмотр записи справочника\"",
        headActions: `<button class="icon-button ui-action-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>`,
        body: renderUiFormGrid({
          columns: "1",
          className: "directory-reader-list",
          body: `
          ${readerKeys.map((key, index) => `
            <article>
              <span>${escapeHtml(readerColumns[index] || key)}</span>
              <strong>${escapeHtml(formatDirectoryCell(activeSection.id, key, row[key]))}</strong>
            </article>
          `).join("")}
        `,
        }),
        actions: renderUiFormActions({
          actions: `<button class="secondary-button ui-action-button" data-close-modal type="button">Закрыть</button>`,
        }),
      })}
    </div>
  `;
}

function renderDirectoryField(field, value) {
  const readonly = field.readonly ? "readonly" : "";
  const readonlyClass = field.readonly ? "readonly" : "";
  const escapedValue = escapeAttribute(value ?? "");

  const renderSelectField = (control) => renderUiFormField({
    label: field.label,
    control,
    className: "form-field command-field",
    disabled: Boolean(field.readonly),
    readOnly: Boolean(field.readonly),
  });

  if (field.type === "active-status") {
    return renderSelectField(`
        <select name="${field.key}">
          <option value="active" ${selected(value, "active")}>Активен</option>
          <option value="inactive" ${selected(value, "inactive")}>Отключен</option>
        </select>
    `);
  }

  if (field.type === "yes-no") {
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          <option value="yes" ${selected(value, "yes")}>Да</option>
          <option value="no" ${selected(value, "no")}>Нет</option>
        </select>
    `);
  }

  if (field.type === "unit-type") {
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${Object.entries(UNIT_TYPE_LABELS).map(([key, label]) => `<option value="${key}" ${selected(value, key)}>${escapeHtml(label)}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "production-resource-type") {
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${Object.entries(PRODUCTION_RESOURCE_TYPE_LABELS).map(([key, label]) => `<option value="${key}" ${selected(value, key)}>${escapeHtml(label)}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "work-center-link") {
    const centers = field.sectionId === "operations"
      ? getRouteInstructionWorkCenters()
      : getPlanningWorkCenters();
    const selectedValue = field.sectionId === "operations" ? getRouteInstructionWorkCenterId(value) : value;
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${centers.map((center) => `<option value="${escapeAttribute(center.id)}" ${selected(selectedValue, center.id)}>${escapeHtml(center.name)} · ${escapeHtml(center.code || "")}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "production-resource-parent-link") {
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          <option value="" ${selected(value, "")}>Нет родителя</option>
          ${getProductionResources({ includeInactive: true }).map((resource) => `<option value="${escapeAttribute(resource.id)}" ${selected(value, resource.id)}>${escapeHtml(resource.name)}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "work-schedule") {
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${WORK_SCHEDULE_OPTIONS.map((option) => `<option value="${escapeAttribute(option.value)}" ${selected(value, option.value)}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "work-mode") {
    const hasCustomValue = value && !WORK_MODE_OPTIONS.some((option) => option.value === value);
    return renderSelectField(`
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${hasCustomValue ? `<option value="${escapedValue}" selected>${escapeHtml(value)}</option>` : ""}
          ${WORK_MODE_OPTIONS.map((option) => `<option value="${escapeAttribute(option.value)}" ${selected(value, option.value)}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "project-link") {
    return renderSelectField(`
        <select name="${field.key}">
          ${(directoryState.specifications || []).map((specification) => `<option value="${escapeAttribute(specification.id)}" ${selected(value, specification.id)}>${escapeHtml(specification.name)}</option>`).join("")}
        </select>
    `);
  }

  if (field.type === "bom-link") {
    return renderSelectField(`
        <select name="${field.key}">
          <option value="" ${selected(value, "")}>Не выбран</option>
          ${(directoryState.bomLists || []).map((bom) => `<option value="${escapeAttribute(bom.id)}" ${selected(value, bom.id)}>${escapeHtml(bom.name)}</option>`).join("")}
        </select>
    `);
  }

  return renderUiFormField({
    label: field.label,
    control: `<input name="${field.key}" type="${field.type}" value="${escapedValue}" ${readonly} />`,
    className: `form-field ${readonlyClass}`,
    readOnly: Boolean(field.readonly),
  });
}

function createEmptyDirectoryRow(directoryData) {
  return directoryData.keys.reduce((row, key) => {
    row[key] = "";
    if (key === "status") row[key] = "Активен";
    if (directoryData.sectionId === "operations" && key === "workCenterId") row[key] = getRouteInstructionWorkCenters({ includeWarehouse: false })[0]?.id || getRouteInstructionWorkCenters()[0]?.id || "D3";
    if (key === "totalQuantity" || key === "steps") row[key] = 0;
    if (key === "unitsPerHour") row[key] = 40;
    if (key === "capacity") row[key] = "1 операция / смена";
    if (key === "baseCph") row[key] = 30000;
    if (key === "efficiency") row[key] = 85;
    if (key === "changeoverMin") row[key] = 15;
    if (key === "coefficient") row[key] = 1;
    if (key === "placementsPerHour") row[key] = 30000;
    if (key === "setupSeconds") row[key] = 15;
    if (key === "defaultCount") row[key] = 0;
    if (BOM_COMPONENT_FIELDS.some((field) => field.key === key)) row[key] = 0;
    if (key === "projectId") row[key] = "";
    if (key === "bomListA") row[key] = directoryState.bomLists?.[0]?.id || "";
    if (key === "bomListB") row[key] = "";
    if (key === "bomQtyA") row[key] = 1;
    if (key === "bomQtyB") row[key] = 0;
    if (key === "workSchedule") row[key] = "5/2";
    if (key === "workMode") row[key] = "08:00-20:00";
    if (key === "default") row[key] = "no";
    if (key === "dueDate") row[key] = toDateInput(addMs(new Date(), 14 * 24 * 60 * 60 * 1000));
    return row;
  }, { id: makeId(directoryData.sectionId === "operations" ? "op" : "dir") });
}

function getDirectoryHealth(sectionId) {
  const rows = getDirectoryData(sectionId).rows;
  const review = rows.filter((row) => Object.values(row).some((value) => String(value).match(/Проверка|Проблема|Отключен/))).length;
  return {
    ready: Math.max(0, rows.length - review),
    review,
  };
}

function clearDenseInlineSelectPopover(select) {
  const options = select?.querySelector?.(".dense-inline-options");
  if (!options) return;
  options.classList.remove("is-viewport-popover");
  [
    "--dense-popover-left",
    "--dense-popover-top",
    "--dense-popover-width",
    "--dense-popover-max-height",
  ].forEach((name) => options.style.removeProperty(name));
}

function closeDenseInlineSelects(except = null) {
  document.querySelectorAll(".dense-inline-select[open]").forEach((select) => {
    if (select === except) return;
    select.open = false;
    clearDenseInlineSelectPopover(select);
  });
}

function positionDenseInlineSelectPopover(select) {
  if (!select?.open) {
    clearDenseInlineSelectPopover(select);
    return;
  }

  const summary = select.querySelector("summary");
  const options = select.querySelector(".dense-inline-options");
  if (!summary || !options) return;

  options.classList.add("is-viewport-popover");

  const gap = 6;
  const edge = 8;
  const summaryRect = summary.getBoundingClientRect();
  const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  const availableWidth = Math.max(160, viewportWidth - edge * 2);
  const naturalWidth = Math.max(summaryRect.width, options.scrollWidth || 0, 220);
  const width = Math.min(availableWidth, naturalWidth);
  const left = Math.min(Math.max(edge, summaryRect.left), Math.max(edge, viewportWidth - width - edge));
  const spaceBelow = Math.max(0, viewportHeight - summaryRect.bottom - gap - edge);
  const spaceAbove = Math.max(0, summaryRect.top - gap - edge);
  const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
  const availableHeight = Math.max(96, openBelow ? spaceBelow : spaceAbove);
  const maxHeight = Math.min(Math.max(96, availableHeight), Math.max(96, viewportHeight - edge * 2));
  const optionsHeight = Math.min(options.scrollHeight || maxHeight, maxHeight);
  const top = openBelow
    ? Math.min(summaryRect.bottom + gap, viewportHeight - edge - optionsHeight)
    : Math.max(edge, summaryRect.top - gap - optionsHeight);

  options.style.setProperty("--dense-popover-left", `${Math.round(left)}px`);
  options.style.setProperty("--dense-popover-top", `${Math.round(top)}px`);
  options.style.setProperty("--dense-popover-width", `${Math.round(width)}px`);
  options.style.setProperty("--dense-popover-max-height", `${Math.round(maxHeight)}px`);
}

function updateOpenDenseInlineSelectPopovers() {
  document.querySelectorAll(".dense-inline-select[open]").forEach((select) => {
    positionDenseInlineSelectPopover(select);
  });
}

function bindDenseInlineSelectViewportEvents() {
  app.querySelectorAll(".dense-inline-select").forEach((select) => {
    if (select.dataset.denseViewportBound === "yes") return;
    select.dataset.denseViewportBound = "yes";
    select.addEventListener("toggle", () => {
      if (select.open) {
        closeDenseInlineSelects(select);
        window.requestAnimationFrame(() => positionDenseInlineSelectPopover(select));
        return;
      }
      clearDenseInlineSelectPopover(select);
    });
  });

  if (denseInlineViewportListenersBound) return;
  denseInlineViewportListenersBound = true;
  window.addEventListener("resize", updateOpenDenseInlineSelectPopovers, { passive: true });
  document.addEventListener("scroll", updateOpenDenseInlineSelectPopovers, { passive: true, capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeDenseInlineSelects();
  });
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
      if (!new URLSearchParams(window.location.search).has("qa")) {
        return { applied: false, reason: "qa parameter is required" };
      }
      ui.shiftWorkOrderIssueReports = normalizeShiftWorkOrderIssueReports(reportsByRow);
      persistUiState();
      renderPreservingModuleScroll();
      return {
        applied: true,
        rowCount: Object.keys(ui.shiftWorkOrderIssueReports || {}).length,
      };
    },
    seedShiftWorkOrderJournalAssignmentForTest() {
      if (!new URLSearchParams(window.location.search).has("qa")) {
        return { seeded: false, reason: "qa parameter is required" };
      }
      const model = getShiftMasterBoardModel();
      const row = (model.allRows || model.rows || []).find((item) => (
        item?.id
        && normalizeShiftMasterBoardQuantity(item.plannedQuantity || 0) > 0
        && ((item.availableEmployees || []).length || (item.employees || []).length)
      )) || (model.allRows || model.rows || [])[0] || null;
      if (!row?.id) return { seeded: false, reason: "shift row is missing" };
      const employee = (row.availableEmployees || []).find((item) => item?.id)
        || (row.employees || []).find((item) => item?.id)
        || null;
      if (!employee?.id) return { seeded: false, reason: "employee is missing", rowId: row.id };
      const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 1);
      const quantity = Math.max(1, Math.min(plannedQuantity || 1, Math.floor((plannedQuantity || 1) * 0.5) || 1));
      const assignment = saveShiftMasterBoardAssignment(row.id, {
        masterId: row.masterProfile?.id || ui.activeShiftMasterId || "",
        executors: [{
          employeeId: employee.id,
          quantity,
          note: "QA распределение для журнала",
        }],
        updatedAt: new Date().toISOString(),
      });
      renderPreservingModuleScroll();
      return {
        seeded: Boolean(assignment?.assignedQuantity),
        rowId: row.id,
        assignedQuantity: assignment?.assignedQuantity || 0,
        plannedQuantity,
      };
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
  ui.activeModule = moduleId;
  ui.selectedSlotId = null;
  ui.editor = null;
  ui.splitSlotId = null;
  ui.confirmDialog = null;
  if (moduleId === "nomenclature" && previousModule !== "nomenclature") {
    ui.activeNomenclatureId = "";
    ui.activeNomenclaturePane = requestedModuleId === "bomLists" ? "boards" : "items";
  }
  if (moduleId === "planning" && previousModule !== "planning") ui.activeRouteId = "";
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

  if (dialog.action === "bomDeleteList") {
    deleteBomList(payload.bomId);
    return;
  }

  if (dialog.action === "directoryDeleteRow") {
    deleteDirectoryRow(payload.sectionId, payload.rowIndex);
    return;
  }

  if (dialog.action === "nomenclatureDeleteItem") {
    deleteNomenclatureItem(payload.itemId);
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

function bindDirectoryEvents() {
  app.querySelectorAll("[data-directory-id]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeDirectory = button.dataset.directoryId;
      ui.directoryEditor = null;
      ui.directoryReader = null;
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-directory-row]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-edit-directory-row], [data-delete-directory-row]")) return;
      ui.selectedDirectoryRows[ui.activeDirectory] = Number(row.dataset.directoryRow);
      persistUiState();
      row.closest("tbody")?.querySelectorAll("[data-directory-row].is-selected").forEach((selectedRow) => {
        selectedRow.classList.remove("is-selected");
      });
      row.classList.add("is-selected");
    });
    row.addEventListener("dblclick", (event) => {
      if (event.target.closest("[data-edit-directory-row], [data-delete-directory-row]")) return;
      const rowIndex = Number(row.dataset.directoryRow);
      ui.selectedDirectoryRows[ui.activeDirectory] = rowIndex;
      ui.directoryReader = { sectionId: ui.activeDirectory, rowIndex };
      ui.directoryEditor = null;
      persistUiState();
      render();
    });
  });

  app.querySelector("[data-add-directory]")?.addEventListener("click", () => {
    if (getDirectoryData(ui.activeDirectory).readOnly) return;
    ui.directoryEditor = { mode: "create", sectionId: ui.activeDirectory };
    ui.directoryReader = null;
    render();
  });

  app.querySelectorAll("[data-edit-directory-row]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (getDirectoryData(ui.activeDirectory).readOnly) return;
      event.stopPropagation();
      const rowIndex = Number(button.dataset.editDirectoryRow);
      ui.selectedDirectoryRows[ui.activeDirectory] = rowIndex;
      ui.directoryEditor = { mode: "edit", sectionId: ui.activeDirectory, rowIndex };
      ui.directoryReader = null;
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-delete-directory-row]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (getDirectoryData(ui.activeDirectory).readOnly) return;
      event.stopPropagation();
      const rowIndex = Number(button.dataset.deleteDirectoryRow);
      ui.selectedDirectoryRows[ui.activeDirectory] = rowIndex;
      openConfirmDialog("directoryDeleteRow", { sectionId: ui.activeDirectory, rowIndex });
    });
  });

  app.querySelector("[data-delete-directory-selected]")?.addEventListener("click", () => {
    const directoryData = getDirectoryData(ui.activeDirectory);
    if (directoryData.readOnly) return;
    const rowIndex = getSelectedDirectoryRowIndex(ui.activeDirectory, directoryData.rows);
    if (!directoryData.rows.length) return;
    openConfirmDialog("directoryDeleteRow", { sectionId: ui.activeDirectory, rowIndex });
  });

  app.querySelector("[data-delete-directory-current]")?.addEventListener("click", () => {
    const editor = ui.directoryEditor;
    if (!editor || editor.mode !== "edit") return;
    if (getDirectoryData(editor.sectionId).readOnly) return;
    openConfirmDialog("directoryDeleteRow", { sectionId: editor.sectionId, rowIndex: editor.rowIndex });
  });

  app.querySelector("[data-directory-refresh]")?.addEventListener("click", () => {
    render();
  });

  app.querySelector("[data-directory-clear-filters]")?.addEventListener("click", () => {
    clearDirectorySectionFilters(ui.activeDirectory);
  });

  app.querySelectorAll("[data-directory-filter-all]").forEach((field) => {
    field.addEventListener("change", () => {
      const root = field.closest(".directory-filter-menu");
      root?.querySelectorAll("[data-directory-filter-option]").forEach((option) => {
        if (option.closest("[data-directory-filter-option-row]")?.hidden) return;
        option.checked = field.checked;
      });
    });
  });

  app.querySelectorAll("[data-directory-filter-option]").forEach((field) => {
    field.addEventListener("change", () => {
      const root = field.closest(".directory-filter-menu");
      const visibleOptions = [...(root?.querySelectorAll("[data-directory-filter-option]") || [])]
        .filter((option) => !option.closest("[data-directory-filter-option-row]")?.hidden);
      const allToggle = root?.querySelector("[data-directory-filter-all]");
      if (allToggle) allToggle.checked = visibleOptions.length > 0 && visibleOptions.every((option) => option.checked);
    });
  });

  app.querySelectorAll("[data-directory-filter-apply]").forEach((button) => {
    button.addEventListener("click", () => {
      const root = button.closest(".directory-filter-menu");
      const allOptions = [...(root?.querySelectorAll("[data-directory-filter-option]") || [])];
      const checkedValues = allOptions
        .filter((option) => option.checked)
        .map((option) => option.value);
      const nextValues = checkedValues.length === allOptions.length ? [] : checkedValues;
      setDirectoryColumnFilter(button.dataset.directoryFilterSection, button.dataset.directoryFilterKey, nextValues);
    });
  });

  app.querySelectorAll("[data-directory-filter-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      clearDirectoryColumnFilter(button.dataset.directoryFilterSection, button.dataset.directoryFilterKey);
    });
  });

  app.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      ui.directoryEditor = null;
      ui.directoryReader = null;
      render();
    });
  });

  bindDirectoryForm();
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
  };
}
