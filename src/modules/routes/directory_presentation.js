// Directory tables are rendered only after the routes/directories runtime has
// loaded. Keep the presentation layer here so the application bootstrap keeps
// only directory state and command handlers, not the large table templates.
export function createDirectoryPresentationModule(dependencies = {}) {
  const {
    escapeHtml = (value = "") => String(value ?? ""),
    escapeAttribute = escapeHtml,
    getDirectoryColumnFilterOptions = () => [],
    getDirectoryColumnFilterValues = () => [],
    getDirectoryHealth = () => ({ ready: 0, review: 0 }),
    getSelectedDirectoryRowIndex = () => 0,
    getStatusAuditInfo = () => ({ label: "Проверить", tone: "review", meta: "" }),
    getStatusImpactMap = () => ({ decision: "Проверить", decisionTone: "warning", modules: [], blocks: "", changes: "", deleteRule: "", note: "" }),
    getStatusImpactParts = () => [],
    getStatusLifecycleModules = () => ({ originModule: "", changeModule: "" }),
    getStatusNextDocumentView = () => "",
    getStatusTransitionView = () => "",
    formatDirectoryCell = (_sectionId, _key, value) => value ?? "",
    icon = () => "",
    joinUiClasses = (...values) => values.filter(Boolean).join(" "),
    normalizeDirectoryFilterSearch = (value = "") => String(value || "").trim().toLowerCase(),
  } = dependencies;

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
    if (sectionId === "statuses" && key === "impactView") return renderStatusImpactCell(row);
    return escapeHtml(formatDirectoryCell(sectionId, key, value));
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
          <article><span>Стартовый модуль</span><strong>${escapeHtml(row.originModule || lifecycle.originModule)}</strong></article>
          <article><span>Где меняется</span><strong>${escapeHtml(row.changeModule || lifecycle.changeModule)}</strong></article>
          <article><span>Переход</span><strong>${escapeHtml(transitionText)}</strong></article>
          <article><span>Следующий документ</span><strong>${escapeHtml(nextDocumentText)}</strong></article>
          <article><span>Где используется</span><strong>${escapeHtml(impact.modules.join(" · "))}</strong></article>
          <article><span>Что блокирует</span><strong>${escapeHtml(impact.blocks)}</strong></article>
          <article><span>Что меняет</span><strong>${escapeHtml(impact.changes)}</strong></article>
          <article><span>Можно ли удалить</span><strong>${escapeHtml(impact.deleteRule)}</strong></article>
        </div>
        <p>${escapeHtml(impact.note)}</p>
      </section>
    `;
  }

  return {
    getDirectoryFieldClassKey,
    getDirectoryTableCellClass,
    getDirectoryTableRowClass,
    renderDirectoryCellContent,
    renderDirectoryColumnFilter,
    renderDirectoryDetail,
    renderDirectoryTable,
    renderDirectoryTableHead,
    renderStatusImpactCell,
    renderStatusImpactMap,
  };
}
