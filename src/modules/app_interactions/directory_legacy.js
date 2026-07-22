import {
  PRODUCTION_RESOURCE_TYPE_LABELS,
  UNIT_TYPE_LABELS,
  WORK_SCHEDULE_OPTIONS,
} from "../../app_constants.js";

// Rollback-only Directory UI. The static interaction shell loads this factory
// through the existing routes boundary, so normal React modules do not parse
// modal markup or legacy DOM bindings during application boot.
export function createDirectoryLegacyInteractions(dependencies = {}) {
  const {
    addMs,
    alertUser = (message) => globalThis.alert?.(message),
    app,
    BOM_COMPONENT_FIELDS = [],
    canEditDirectorySection = () => false,
    clearDirectoryColumnFilter,
    clearDirectorySectionFilters,
    deleteDirectoryStateRow = () => null,
    deleteOperationMapItem = () => false,
    denseInlineViewportListenersBound: initialDenseInlineViewportListenersBound = false,
    escapeAttribute,
    escapeHtml,
    getDirectoryData,
    getDirectoryRowLabel,
    getOperationMapRows = () => [],
    getPlanningWorkCenters,
    getProductionResources = () => [],
    getRouteInstructionWorkCenterId,
    getRouteInstructionWorkCenters,
    getSelectedDirectoryRowIndex,
    icon,
    isLegacyDirectoryWriteBlocked = () => true,
    makeId,
    normalizeDirectorySectionId = (value) => value,
    openConfirmDialog,
    persistDirectoryState = () => false,
    persistState = () => {},
    persistUiState,
    render,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiModalFrame,
    selected,
    saveDirectoryRow = () => false,
    setDirectoryColumnFilter,
    toDateInput,
    withDirectoryEntityRemovalAllowed = (callback) => callback(),
    WORK_MODE_OPTIONS = [],
  } = dependencies;

  const ui = new Proxy({}, {
    get(_target, property) { return dependencies.getUi?.()?.[property]; },
    set(_target, property, value) { const state = dependencies.getUi?.(); if (state) state[property] = value; return true; },
  });
  const directoryState = new Proxy({}, {
    get(_target, property) { return dependencies.getDirectoryState?.()?.[property]; },
    set(_target, property, value) { const state = dependencies.getDirectoryState?.(); if (state) state[property] = value; return true; },
  });
  let denseInlineViewportListenersBound = initialDenseInlineViewportListenersBound;

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
                <strong>${escapeHtml(dependencies.formatDirectoryCell(activeSection.id, key, row[key]))}</strong>
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
        if (field.readonly || !data.has(field.key)) continue;
        const rawValue = data.get(field.key);
        nextRow[field.key] = field.type === "number" ? Number(rawValue || 0) : String(rawValue || "").trim();
      }

      const primaryKey = directoryData.keys[0];
      if (!String(nextRow[primaryKey] ?? "").trim()) {
        alertUser(`Заполните поле "${directoryData.columns[0]}".`);
        return;
      }

      if (saveDirectoryRow(sectionId, rowIndex, nextRow) === false) {
        alertUser("Справочник доступен только для чтения: серверная команда ещё не подключена.");
        return;
      }
      const nextIndex = rowIndex >= 0 ? rowIndex : getDirectoryData(sectionId).rows.length - 1;
      ui.selectedDirectoryRows[sectionId] = Math.max(0, nextIndex);
      ui.directoryEditor = null;
      persistUiState();
      render();
    });
  }

  function deleteDirectoryRow(sectionId, rowIndex) {
    sectionId = normalizeDirectorySectionId(sectionId);
    const directoryData = getDirectoryData(sectionId);
    if (directoryData.readOnly || !canEditDirectorySection(sectionId)) {
      if (isLegacyDirectoryWriteBlocked()) alertUser("Справочник доступен только для чтения: серверная команда ещё не подключена.");
      return false;
    }
    const index = Number(rowIndex);
    const row = Number.isFinite(index) ? directoryData.rows[index] : null;
    if (!row) return false;

    if (sectionId === "operations") {
      ui.directoryEditor = null;
      const nextCount = Math.max(0, getOperationMapRows().length - 1);
      ui.selectedDirectoryRows[sectionId] = nextCount ? Math.min(index, nextCount - 1) : 0;
      return deleteOperationMapItem(row.id);
    }
    if (!deleteDirectoryStateRow(sectionId, row)) return false;

    ui.directoryEditor = null;
    const nextRows = getDirectoryData(sectionId).rows;
    ui.selectedDirectoryRows[sectionId] = nextRows.length ? Math.min(index, nextRows.length - 1) : 0;
    if (sectionId === "bomLists" || sectionId === "specifications") {
      if (withDirectoryEntityRemovalAllowed(() => persistDirectoryState()) === false) return false;
    } else if (persistDirectoryState() === false) return false;
    persistState();
    persistUiState();
    render();
    return true;
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
    bindDirectoryForm,
    bindDirectoryEvents,
    bindDenseInlineSelectViewportEvents,
    clearDenseInlineSelectPopover,
    closeDenseInlineSelects,
    createEmptyDirectoryRow,
    deleteDirectoryRow,
    positionDenseInlineSelectPopover,
    renderDirectoryEditorModal,
    renderDirectoryField,
    renderDirectoryReaderModal,
    updateOpenDenseInlineSelectPopovers,
  };
}
