export function renderNomenclatureModulePage(deps) {
  const {
    NOMENCLATURE_REA_COMPONENT_TYPE,
    directoryState,
    escapeAttribute,
    escapeHtml,
    getActiveNomenclatureItem,
    getActiveNomenclaturePane,
    getFilteredNomenclatureItems,
    getNomenclatureTypeCounts,
    getNomenclatureTypeFilterValue,
    getNomenclatureTypeOptions,
    icon,
    normalizeNomenclatureType,
    renderBomListsPage,
    renderDenseInlineSelect,
    renderMesModulePatternPage,
    renderNomenclatureSectionFilter,
    renderUiActionButton,
    renderUiEmptyState,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
    ui,
  } = deps;
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
