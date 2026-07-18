export function renderNomenclatureModulePage(deps) {
  const {
    BOARD_BOM_TERM,
    BOARD_SPEC_LIST_TERM,
    BOM_COMPONENT_FIELDS,
    BOM_IMPORT_COLUMN_COUNT,
    BOM_IMPORT_FALLBACK_HEADERS,
    NOMENCLATURE_REA_COMPONENT_TYPE,
    directoryState,
    escapeAttribute,
    escapeHtml,
    getActiveBomForModule,
    getActiveNomenclatureItem,
    getActiveNomenclaturePane,
    getBomComponentCounts,
    getBomComponentFieldCounts,
    getBomImportHeaders,
    getBomImportRows,
    getFilteredNomenclatureItems,
    getNomenclatureTypeCounts,
    getNomenclatureTypeFilterValue,
    getNomenclatureTypeOptions,
    getReaNomenclatureItems,
    icon,
    normalizeNomenclatureType,
    renderDenseInlineSelect,
    renderMesModulePatternPage,
    renderUiActionButton,
    renderUiActionFileLabel,
    renderUiEmptyState,
    renderUiFilterBar,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiModuleSidebar,
    renderUiPanel,
    renderUiPanelBody,
    renderUiSidebarItem,
    renderUiStatusToken,
    renderUiTableWrap,
    ui,
  } = deps;

  function renderNomenclatureSectionFilter({ activePane = getActiveNomenclaturePane(), activeFilter = "all", typeOptions = [], typeCounts = {}, allCount = 0 } = {}) {
    const boardCount = (directoryState.bomLists || []).length;
    const boardTypeValue = "Печатные платы";
    const hasBoardType = typeOptions.some((type) => type.value === boardTypeValue);
    const renderFilterItem = ({ title, count, active = false, attributes = "" }) => renderUiSidebarItem({
      title,
      badge: Number(count || 0).toLocaleString("ru-RU"),
      active,
      className: "nomenclature-filter-item",
      attributes: `${attributes} data-ui-variant="filter" type="button"`,
    });
    const renderBoardTypeButton = () => renderFilterItem({
      title: boardTypeValue,
      count: boardCount,
      active: activePane === "boards",
      attributes: "data-nomenclature-pane=\"boards\"",
    });
    return renderUiFilterBar({
      className: "nomenclature-type-filter",
      attributes: "aria-label=\"Разделы номенклатуры\"",
      body: `
        <div class="ui-sidebar-label">Разделы</div>
        ${renderFilterItem({
          title: "Вся номенклатура",
          count: allCount,
          active: activePane === "items" && activeFilter === "all",
          attributes: "data-nomenclature-type-filter=\"all\"",
        })}
        ${typeOptions.map((type) => type.value === boardTypeValue ? renderBoardTypeButton() : renderFilterItem({
          title: type.label,
          count: typeCounts[type.value],
          active: activePane === "items" && activeFilter === type.value,
          attributes: `data-nomenclature-type-filter="${escapeAttribute(type.value)}"`,
        })).join("")}
        ${hasBoardType ? "" : renderBoardTypeButton()}
      `,
    });
  }

  function renderBomImportButton() {
    return renderUiActionFileLabel({
      label: "Импортировать *.xlsx",
      iconName: "upload",
      className: "bom-file-import-button",
      inputAttributes: "data-bom-import-file type=\"file\" accept=\".xlsx,.xls\"",
    });
  }

  function renderBomComponentSummary(componentCounts, componentTotal) {
    const counts = getBomComponentFieldCounts(componentCounts);
    const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
    const activeTypes = Object.values(counts).filter((count) => Number(count || 0) > 0).length;
    return `
      <div class="bom-component-summary">
        <article>
          <span>Компонентов</span>
          <strong>${Number(total || componentTotal || 0).toLocaleString("ru-RU")}</strong>
          <small>на одну плату</small>
        </article>
        <article>
          <span>Типов</span>
          <strong>${activeTypes.toLocaleString("ru-RU")}</strong>
          <small>заполненных категорий</small>
        </article>
        ${BOM_COMPONENT_FIELDS.map((field) => `
          <article>
            <span>${escapeHtml(field.label)}</span>
            <strong>${Number(counts[field.key] || 0).toLocaleString("ru-RU")}</strong>
            <small>шт.</small>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderBomNomenclatureAddControl(bom, isNewBom = false) {
    const reaItems = getReaNomenclatureItems();
    if (isNewBom || !bom?.id) {
      return `
        <div class="bom-nomenclature-add is-disabled">
          ${icon("package")}
          <span>Сначала сохраните карточку платы, затем можно будет добавлять РЭА-компоненты из номенклатуры.</span>
        </div>
      `;
    }

    if (!reaItems.length) {
      return `
        <div class="bom-nomenclature-add is-disabled">
          ${icon("package")}
          <span>В номенклатуре пока нет позиций типа «${NOMENCLATURE_REA_COMPONENT_TYPE}». Импортируйте BOM или создайте компонент в модуле «Номенклатура».</span>
        </div>
      `;
    }

    const options = [
      { value: "", label: "Добавить РЭА компонент", meta: "выберите позицию номенклатуры" },
      ...reaItems.map((item) => ({
        value: item.id,
        label: item.name || "Компонент без названия",
        meta: `${item.article || "артикул не задан"} · ${item.package || "корпус не задан"}`,
      })),
    ];

    return `
      <div class="bom-nomenclature-add">
        <div>
          ${icon("package")}
          <span>Добавить строку из номенклатуры</span>
        </div>
        ${renderDenseInlineSelect("nomenclatureId", "", options, { type: "bomNomenclature", bomId: bom.id })}
      </div>
    `;
  }

  function renderBomImportCellInput(bomId, rowIndex, columnIndex, value) {
    const isQuantity = columnIndex === 6;
    return `
      <input
        class="bom-edit-input"
        data-bom-import-cell="${escapeAttribute(bomId)}"
        data-bom-row-index="${rowIndex}"
        data-bom-column-index="${columnIndex}"
        ${isQuantity ? "type=\"number\" min=\"0\" step=\"1\"" : "type=\"text\""}
        value="${escapeAttribute(value)}"
        aria-label="Поле BOM ${rowIndex + 1}.${columnIndex + 1}"
      />
    `;
  }

  function renderBomImportPreviewTable() {
    return `
      ${renderUiTableWrap({
        className: "bom-import-table-wrap bom-import-preview-wrap",
        body: `
        <div class="bom-import-preview-note" role="note">
          ${icon("info")}
          <div>
            <strong>Предпросмотр шаблона BOM</strong>
            <span>Данных пока нет. После импорта Excel здесь появятся реальные строки компонентного состава платы.</span>
          </div>
        </div>
        <table class="directory-table bom-import-table bom-import-preview-table">
          <thead>
            <tr>
              ${BOM_IMPORT_FALLBACK_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            <tr class="is-preview-row">
              <td class="bom-import-preview-empty-cell" colspan="${BOM_IMPORT_FALLBACK_HEADERS.length}">
                <span>Пока нет импортированных строк</span>
                <small>Это только структура колонок, а не сохраненные данные BOM.</small>
              </td>
            </tr>
          </tbody>
        </table>
        `,
      })}
    `;
  }

  function renderBomImportTable(bom, headers, rows, componentCounts, componentTotal, isNewBom = false) {
    if (!rows.length) return renderBomImportPreviewTable();

    return `
      ${renderUiTableWrap({
        className: "bom-import-table-wrap",
        body: `
        <table class="directory-table bom-import-table">
          <thead>
            <tr>
              ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
              <th class="actions-cell">Действия</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, rowIndex) => `
              <tr>
                ${row.values.map((value, columnIndex) => `
                  <td class="${columnIndex === 1 ? "primary-cell" : ""}">
                    ${renderBomImportCellInput(bom.id, rowIndex, columnIndex, value)}
                  </td>
                `).join("")}
                <td class="actions-cell bom-row-action-cell">
                  ${renderUiActionButton({ iconName: "trash", tone: "table-icon", className: "danger-soft", attributes: `data-bom-import-delete="${escapeAttribute(bom.id)}" data-bom-row-index="${rowIndex}" type="button" title="Удалить строку BOM" aria-label="Удалить строку BOM"` })}
                </td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="${BOM_IMPORT_COLUMN_COUNT + 1}">
                <div class="bom-import-table-footer">
                  ${renderBomNomenclatureAddControl(bom, isNewBom)}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
        `,
      })}
    `;
  }

  function renderBomListsPage(options = {}) {
    const embeddedInNomenclature = Boolean(options.embeddedInNomenclature);
    const activeBom = getActiveBomForModule();
    const isNewBom = ui.activeBomId === "__new__";
    const hasPreviewBom = isNewBom || Boolean(activeBom);
    const bom = activeBom || {
      id: "",
      name: "",
      projectId: "",
      boardCode: "",
      resultItem: "",
      status: "Черновик",
      ...Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0])),
    };
    const componentCounts = hasPreviewBom ? getBomComponentCounts(bom) : {};
    const componentTotal = Object.values(componentCounts).reduce((sum, count) => sum + Number(count || 0), 0);
    const importRows = hasPreviewBom ? getBomImportRows(bom) : [];
    const importHeaders = hasPreviewBom ? getBomImportHeaders(bom) : [];

    return renderUiModulePage({
      ariaLabel: embeddedInNomenclature ? "Номенклатура · Платы" : BOARD_SPEC_LIST_TERM,
      className: `bom-lists-page ${embeddedInNomenclature ? "nomenclature-page is-boards-pane" : ""}`,
      sidebar: renderUiModuleSidebar({
        eyebrow: embeddedInNomenclature ? "Материалы и компоненты" : "Печатные платы",
        title: embeddedInNomenclature ? "Номенклатура" : BOARD_SPEC_LIST_TERM,
        variant: embeddedInNomenclature ? "filters" : "list",
        actions: renderUiActionButton({
          label: "Новая плата",
          iconName: "plus",
          tone: "primary",
          attributes: "data-bom-create type=\"button\"",
        }),
        body: `
          ${embeddedInNomenclature ? renderNomenclatureSectionFilter({
            activePane: "boards",
            activeFilter: getNomenclatureTypeFilterValue(directoryState.nomenclature || []),
            typeOptions: getNomenclatureTypeOptions(directoryState.nomenclature || []),
            typeCounts: getNomenclatureTypeCounts(directoryState.nomenclature || []),
            allCount: (directoryState.nomenclature || []).length,
          }) : ""}
          <div class="ui-sidebar-list">
            <div class="ui-sidebar-label">${BOARD_SPEC_LIST_TERM}</div>
            ${isNewBom ? renderUiSidebarItem({
              title: "Новая плата",
              meta: "компонентный состав / BOM",
              badge: "new",
              active: true,
            }) : ""}
            ${(directoryState.bomLists || []).map((item) => {
              const hasImportRows = getBomImportRows(item).length > 0;
              const total = hasImportRows ? Object.values(getBomComponentCounts(item)).reduce((sum, count) => sum + Number(count || 0), 0) : 0;
              return renderUiSidebarItem({
                title: item.name,
                meta: `${item.boardCode || "децимальный номер не задан"} · ${item.resultItem || "результат платы не задан"}${hasImportRows ? "" : " · Черновик"}`,
                badge: String(total),
                active: item.id === activeBom?.id,
                attributes: `data-bom-open="${escapeAttribute(item.id)}" type="button"`,
              });
            }).join("")}
          </div>
        `,
      }),
      header: renderUiModuleHeader({
        eyebrow: BOARD_BOM_TERM,
        title: hasPreviewBom ? (isNewBom ? "Новая плата" : bom.name || "Плата без названия") : "Плата не выбрана",
        description: hasPreviewBom ? "Плата хранит код, результат производства и BOM с компонентным составом. В изделии и маршруте она используется как существующий объект." : "Выберите плату в левом перечне или создайте новую, чтобы открыть карточку и таблицу компонентов.",
      }),
      contentClassName: "bom-module-content",
      content: hasPreviewBom ? renderUiPanel({
        title: "Плата и BOM",
        meta: isNewBom ? "создание компонентного состава" : `${importRows.length ? `${importRows.length} строк` : "таблица пока пустая"} · покомпонентный расчет платы`,
        className: "bom-editor-panel bom-combined-panel",
        body: renderUiPanelBody({
          body: `
              <div class="bom-board-card-layout">
                <form id="bomModuleForm" class="module-form bom-board-form">
                  <input type="hidden" name="bomId" value="${escapeAttribute(bom.id)}" />
                  <input type="hidden" name="isNew" value="${isNewBom ? "yes" : "no"}" />
                  ${renderUiFormGrid({
                    columns: "3",
                    className: "bom-board-form-grid",
                    body: `
                      ${renderUiFormField({
                        label: "Название платы",
                        required: true,
                        className: "form-field",
                        control: `<input name="name" value="${escapeAttribute(bom.name)}" placeholder="Плата PCB" required />`,
                      })}
                      ${renderUiFormField({
                        label: "Децимальный номер",
                        className: "form-field",
                        control: `<input name="boardCode" value="${escapeAttribute(bom.boardCode)}" placeholder="Например АБВГ.123456.001" />`,
                      })}
                      ${renderUiFormField({
                        label: "Результат производства",
                        className: "form-field",
                        control: `<input name="resultItem" value="${escapeAttribute(bom.resultItem)}" placeholder="Смонтированная печатная плата" />`,
                      })}
                    `,
                  })}
                  ${renderUiFormActions({
                    className: "module-form-actions full",
                    actions: `
                    ${renderUiActionButton({ label: isNewBom ? "Создать плату" : "Сохранить плату", iconName: "save", tone: "primary", attributes: "type=\"submit\"" })}
                    ${isNewBom ? "" : renderUiActionButton({ label: "Удалить плату", iconName: "trash", className: "danger", attributes: `data-bom-delete="${escapeAttribute(bom.id)}" type="button"` })}
                    `,
                  })}
                </form>
              </div>
              <div class="bom-combined-table-block">
                <div class="bom-combined-table-head">
                  <strong>Таблица BOM</strong>
                  <span>${importRows.length ? `${escapeHtml(bom.sourceFileName || bom.name)} · ${importRows.length} строк` : "стандартные поля Excel A:I"}</span>
                </div>
                ${renderBomImportTable(bom, importHeaders, importRows, componentCounts, componentTotal, isNewBom)}
                <div class="bom-combined-table-actions">
                  ${renderBomImportButton()}
                </div>
              </div>
              ${importRows.length ? `
                <div class="bom-card-component-summary">
                  <div class="ui-sidebar-label">Подсчет импортированных компонентов</div>
                  ${renderBomComponentSummary(componentCounts, componentTotal)}
                </div>
              ` : ""}
            `,
        }),
      }) : "",
    });
  }
  const activePane = getActiveNomenclaturePane();
  if (activePane === "boards") return renderBomListsPage({ embeddedInNomenclature: true });

  const allItems = directoryState.nomenclature || [];
  const items = getFilteredNomenclatureItems(allItems);
  const typeOptions = getNomenclatureTypeOptions(allItems);
  const typeCounts = getNomenclatureTypeCounts(allItems);
  const activeFilter = getNomenclatureTypeFilterValue(allItems);
  const activeItem = getActiveNomenclatureItem();
  const isNewItem = ui.activeNomenclatureId === "__new__";
  const hasPreviewObject = isNewItem || Boolean(activeItem);
  const rawItemType = normalizeNomenclatureType(activeItem?.type || NOMENCLATURE_REA_COMPONENT_TYPE);
  const itemType = typeOptions.some((type) => type.value === rawItemType)
    ? rawItemType
    : typeOptions[0]?.value || rawItemType;
  const item = activeItem || {
    id: "",
    name: "",
    article: "",
    type: NOMENCLATURE_REA_COMPONENT_TYPE,
    package: "",
    unit: "шт.",
    manufacturer: "",
    description: "",
    status: "Активен",
  };

  const renderField = ({ label, control, className = "" }) => renderUiFormField({
    label,
    control,
    className: ["form-field", className].filter(Boolean).join(" "),
  });

  return renderMesModulePatternPage({
    moduleId: "nomenclature",
    sidebar: {
      eyebrow: "Материалы и компоненты",
      title: "Номенклатура",
      variant: "filters",
      actions: renderUiActionButton({
        label: "Новая позиция",
        iconName: "plus",
        tone: "primary",
        attributes: "data-nomenclature-create type=\"button\"",
      }),
      body: `
        ${renderNomenclatureSectionFilter({ activePane, activeFilter, typeOptions, typeCounts, allCount: allItems.length })}
      `,
    },
    header: {
      eyebrow: "Список компонентов",
      title: hasPreviewObject ? (isNewItem ? "Новая позиция номенклатуры" : item.name || "Позиция без названия") : "Объект не выбран",
      description: hasPreviewObject ? "Номенклатура разделяется по типам: РЭА для BOM, платы, механика, кабели, расходники и другие производственные позиции." : "Выберите позицию в таблице или создайте новую, чтобы открыть карточку редактирования.",
    },
    content: `
      ${hasPreviewObject ? renderUiPanel({
        title: "Предпросмотр позиции",
        meta: isNewItem ? "создание новой позиции" : "редактирование номенклатуры",
        className: "nomenclature-editor-panel",
        body: renderUiPanelBody({
          body: `
            <form id="nomenclatureForm" class="module-form">
              <input type="hidden" name="itemId" value="${escapeAttribute(item.id)}" />
              <input type="hidden" name="isNew" value="${isNewItem ? "yes" : "no"}" />
              <input type="hidden" name="type" value="${escapeAttribute(itemType)}" data-nomenclature-type-hidden />
              ${renderUiFormGrid({
                columns: "2",
                className: "nomenclature-form-grid full",
                body: `
                  ${renderField({ label: "Наименование", className: "full", control: `<input name="name" value="${escapeAttribute(item.name)}" placeholder="Например: Резистор 10 кОм 0603 1%" />` })}
                  ${renderField({ label: "Артикул", control: `<input name="article" value="${escapeAttribute(item.article)}" placeholder="PN / MPN / внутренний код" />` })}
                  ${renderField({ label: "Раздел", control: renderDenseInlineSelect("type", itemType, typeOptions, { type: "nomenclatureType" }) })}
                  ${renderField({ label: "Новый раздел", control: `<input name="customType" value="" placeholder="если нужен отдельный тип" />` })}
                  ${renderField({ label: "Корпус / размер", control: `<input name="package" value="${escapeAttribute(item.package)}" placeholder="0603, QFN-32, PCB" />` })}
                  ${renderField({ label: "Ед. изм.", control: `<input name="unit" value="${escapeAttribute(item.unit)}" placeholder="шт." />` })}
                  ${renderField({ label: "Производитель", control: `<input name="manufacturer" value="${escapeAttribute(item.manufacturer)}" placeholder="Yageo, Murata, TI..." />` })}
                  ${renderField({ label: "Статус", control: `<input name="status" value="${escapeAttribute(item.status)}" placeholder="Активен" />` })}
                  ${renderField({ label: "Описание", className: "full", control: `<textarea name="description" rows="3" placeholder="Параметры, допуски, замены, комментарии">${escapeHtml(item.description)}</textarea>` })}
                  ${renderUiFormActions({
                    className: "module-form-actions full",
                    actions: `
                      ${isNewItem ? "" : renderUiActionButton({
                        label: "Удалить",
                        iconName: "trash",
                        tone: "danger",
                        className: "danger",
                        attributes: `data-nomenclature-delete="${escapeAttribute(item.id)}" type="button"`,
                      })}
                      ${renderUiActionButton({
                        label: isNewItem ? "Создать позицию" : "Сохранить позицию",
                        iconName: "save",
                        tone: "primary",
                        attributes: "type=\"submit\"",
                      })}
                    `,
                  })}
                `,
              })}
            </form>
          `,
        }),
      }) : ""}

      ${renderUiPanel({
        title: `${hasPreviewObject ? "02" : "01"} · Список номенклатуры`,
        meta: items.length ? `${items.length} из ${allItems.length} позиций` : "список пуст",
        className: "nomenclature-list-panel",
        body: renderUiPanelBody({ body: renderNomenclatureTable(items, activeItem, {
          escapeAttribute,
          escapeHtml,
          icon,
          renderUiEmptyState,
          renderUiStatusToken,
          renderUiTableWrap,
        }) }),
      })}
    `,
  });
}

function renderNomenclatureTable(items, activeItem, deps) {
  const {
    escapeAttribute,
    escapeHtml,
    icon,
    renderUiEmptyState,
    renderUiStatusToken,
    renderUiTableWrap,
  } = deps;
  if (!items.length) {
    return renderUiEmptyState({
      iconName: "book",
      title: "Позиций пока нет",
      text: "Нажмите «Новая позиция», заполните карточку и сохраните номенклатуру.",
    });
  }

  return renderUiTableWrap({
    className: "directory-table-wrap nomenclature-table-wrap",
    body: `
      <table class="directory-table nomenclature-table ui-table">
        <thead>
          <tr class="ui-table-header">
            <th>Наименование</th>
            <th>Артикул</th>
            <th>Раздел</th>
            <th>Корпус</th>
            <th>Ед.</th>
            <th>Производитель</th>
            <th>Статус</th>
            <th class="actions-cell">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((entry) => `
            <tr class="ui-table-row ${entry.id === activeItem?.id ? "is-selected" : ""}" data-nomenclature-row-open="${escapeAttribute(entry.id)}">
              <td class="primary-cell" title="${escapeAttribute(entry.name || "Позиция без названия")}">${escapeHtml(entry.name || "Позиция без названия")}</td>
              <td title="${escapeAttribute(entry.article || "-")}">${escapeHtml(entry.article || "-")}</td>
              <td title="${escapeAttribute(entry.type || "-")}">${escapeHtml(entry.type || "-")}</td>
              <td title="${escapeAttribute(entry.package || "-")}">${escapeHtml(entry.package || "-")}</td>
              <td>${escapeHtml(entry.unit || "шт.")}</td>
              <td title="${escapeAttribute(entry.manufacturer || "-")}">${escapeHtml(entry.manufacturer || "-")}</td>
              <td>${renderUiStatusToken(entry.status || "Активен", String(entry.status || "Активен").toLowerCase().includes("актив") ? "ok" : "neutral")}</td>
              <td class="actions-cell ui-table-actions">
                <button class="table-icon-button danger-soft ui-action-button" data-nomenclature-row-delete="${escapeAttribute(entry.id)}" type="button" title="Удалить позицию">${icon("trash")}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `,
  });
}
