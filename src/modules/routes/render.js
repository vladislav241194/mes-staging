import { createDirectoryPresentationModule } from "./directory_presentation.js";

export function createRoutesRenderModule(dependencies = {}) {
  const {
    MAIN_ROUTE_TASK_ID,
    distance,
    escapeHtml,
    escapeAttribute = escapeHtml,
    formatDateTimeShort,
    formatReportNumber,
    formatShiftWorkOrderPersonName,
    getActiveRouteForModule,
    getActiveSpecificationForModule,
    getDefaultOperationMapItemForRouteKind,
    getDirectoryColumnFilterOptions,
    getDirectoryColumnFilterValues,
    getDirectoryData,
    getDirectoryHealth,
    getOperationMapItem,
    getOperationMapRows,
    getOperationRouteWorkCenterId,
    getPlanningBoardsPerPanel,
    getPlanningOrderObjectLabel,
    getPlanningRouteQuantity,
    getPlanningRouteTransferSummary,
    getPlanningShiftDateLabel,
    getProductionResourceWorkCenterId,
    getProject,
    getProjectDisplayName,
    getResourceBaseCph,
    getRouteBindingContext,
    getRouteBindingModeForSelection,
    getRouteBindingOptions,
    getRouteBomList,
    getRouteCardViewModel,
    getRouteDocumentKind,
    getRouteDocumentKindLabel,
    getRouteDocumentKindShortLabel,
    getRouteGenerationRoot,
    getRouteInstructionWorkCenters,
    getRouteLineageSubjectName,
    getRouteLinkedChildDocuments,
    getRouteModuleSelectionName,
    getRouteModuleSelectionValue,
    getRouteModuleStats,
    getRouteParentRoute,
    getRouteProductionContext,
    getRouteProductionId,
    getRouteRootRoute,
    getRouteSpecification,
    getRoutesForModule = () => [],
    getRouteStepEffectiveQuantityMultiplier,
    getRouteStepLaborSnapshot,
    getRouteStepPlanningCandidateWorkCenterIds,
    getRouteStepPlanningTask,
    getRouteStepQuantityForBatch,
    getRouteStepTaskId,
    getRouteStepsForModule,
    getRouteStepsForTask,
    getRouteTasksForModule,
    getSelectedDirectoryRowIndex,
    getShiftMasterEmployee,
    getShiftWorkOrderJournalViewModel,
    getSmtLineConfigurations,
    getVisibleDirectoryGroups,
    getVisibleDirectorySections,
    getWorkCenter,
    getWorkCenterUnitsPerHour,
    getWorkOrderViewModel,
    getStatusAuditInfo,
    getStatusImpactMap,
    getStatusImpactParts,
    getStatusLifecycleModules,
    getStatusNextDocumentView,
    getStatusTransitionView,
    formatDirectoryCell,
    icon,
    isManufacturingOutputReceiptRouteStep,
    isSmtOperationWorkCenter,
    mapLegacyWorkCenterId,
    joinUiClasses,
    normalizeBoardsPerPanel,
    normalizeDirectoryFilterSearch,
    normalizeQuantity,
    normalizeRouteBindingValue,
    normalizeRouteStepCalculationFields,
    normalizeShiftMasterBoardQuantity,
    planningState,
    renderDenseInlineSelect,
    renderRouteStepFlowEditor,
    renderRouteStepFlowToggle,
    renderRouteStepFlowPanelRow,
    renderRouteStepLaborToggle,
    renderRouteStepLaborPanelRow,
    renderRouteTaskOutputHint,
    renderDirectoryEditorModal = () => "",
    renderDirectoryReaderModal = () => "",
    renderUiActionButton,
    renderUiFormActions,
    renderUiFormField,
    renderUiFormGrid,
    renderUiModalShell,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiModuleSidebar,
    renderUiSidebarItem,
    renderUiPanel,
    renderUiPanelHead,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
    selected = (left, right) => String(left) === String(right) ? "selected" : "",
    ui,
  } = dependencies;

  const directoryPresentation = createDirectoryPresentationModule({
    escapeAttribute,
    escapeHtml,
    formatDirectoryCell,
    getDirectoryColumnFilterOptions,
    getDirectoryColumnFilterValues,
    getDirectoryHealth,
    getSelectedDirectoryRowIndex,
    getStatusAuditInfo,
    getStatusImpactMap,
    getStatusImpactParts,
    getStatusLifecycleModules,
    getStatusNextDocumentView,
    getStatusTransitionView,
    icon,
    joinUiClasses,
    normalizeDirectoryFilterSearch,
  });
  const { renderDirectoryTable } = directoryPresentation;

  function renderRouteLineagePanel(route, options = {}) {
    if (!route?.id) {
      return `
        <div class="route-lineage-panel is-main">
          <div class="route-lineage-title">
            <span class="route-card-kind-pill is-main">Главная маршрутная карта</span>
            <strong>Новая карта</strong>
          </div>
          <div class="route-lineage-grid">
            <span><b>Принадлежность</b><em>будет задана после сохранения документа</em></span>
          </div>
        </div>
      `;
    }
  
    const kind = getRouteDocumentKind(route);
    const rootRoute = getRouteRootRoute(route);
    const parentRoute = getRouteParentRoute(route);
    const subjectName = getRouteLineageSubjectName(route);
    const targetName = options.targetName || getRouteModuleSelectionName(route) || "Объект не выбран";
    const childCount = kind === "main"
      ? (planningState.routes || []).filter((item) => (
          getRouteDocumentKind(item) === "child"
          && (item.rootRouteId === route.id || item.parentRouteId === route.id)
        )).length
      : 0;
    const linkedDocuments = getRouteLinkedChildDocuments(route);
    const rows = kind === "main"
      ? [
          ["Объект", targetName],
          ["Карта", route.name || "Маршрутная карта"],
          ["Дочерние карты", childCount ? String(childCount) : "пока не сформированы"],
        ]
      : [
          ["Ветка состава", `${route.routeTaskNumber ? `${route.routeTaskNumber} · ` : ""}${subjectName}`],
          ["Главная карта", rootRoute?.name || "не найдена"],
          ["Родитель", parentRoute?.name || rootRoute?.name || "не найден"],
          ["Объект", getRouteModuleSelectionName(rootRoute || route) || targetName],
        ];
  
    return `
      <div class="route-lineage-panel is-${escapeAttribute(kind)}">
        <div class="route-lineage-title">
          <span class="route-card-kind-pill is-${escapeAttribute(kind)}">${escapeHtml(getRouteDocumentKindLabel(route))}</span>
          <strong>${escapeHtml(subjectName)}</strong>
        </div>
        <div class="route-lineage-grid">
          ${rows.map(([label, value]) => `
            <span>
              <b>${escapeHtml(label)}</b>
              <em>${escapeHtml(value || "-")}</em>
            </span>
          `).join("")}
        </div>
        ${linkedDocuments.length ? `
          <div class="route-linked-cards">
            <b>Вложенные маршрутные карты</b>
            <div class="route-linked-card-list">
              ${linkedDocuments.map(({ task, route: linkedRoute }) => linkedRoute ? `
                <button class="route-linked-card" data-route-open="${escapeAttribute(linkedRoute.id)}" type="button">
                  <span>${escapeHtml([task.number, task.title].filter(Boolean).join(" · ") || linkedRoute.name || "Дочерняя карта")}</span>
                  <small>${escapeHtml(linkedRoute.name || getRouteDocumentKindLabel(linkedRoute))}</small>
                </button>
              ` : `
                <span class="route-linked-card is-missing">
                  <span>${escapeHtml([task.number, task.title].filter(Boolean).join(" · ") || "Дочерняя карта")}</span>
                  <small>не сформирована</small>
                </span>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }
  
  function renderRoutesPage() {
    const activeRoute = getActiveRouteForModule();
    const isNewRoute = ui.activeRouteId === "__new__";
    const hasPreviewRoute = isNewRoute || Boolean(activeRoute);
    const routeDraftBindingId = isNewRoute ? normalizeRouteBindingValue(ui.routeDraftBindingId || "") : "";
    const draftBinding = getRouteBindingContext(routeDraftBindingId);
    const draftSpecification = draftBinding.specification;
    const draftBom = draftBinding.bom;
    const activeSpecification = draftSpecification || getActiveSpecificationForModule();
    const defaultProductionId = activeRoute?.specificationId || activeRoute?.projectId || activeSpecification?.id || ui.activeProjectId || "";
    const route = activeRoute || {
      id: "",
      specificationId: draftBom ? "" : defaultProductionId,
      projectId: draftBom ? "" : defaultProductionId,
      bomListId: draftBom?.id || "",
      name: "Новая маршрутная карта",
      isDefault: Boolean(activeRoute?.isDefault),
    };
    const routeSelectionRawValue = hasPreviewRoute
      ? getRouteModuleSelectionValue(route) || (isNewRoute ? routeDraftBindingId || activeSpecification?.id || "" : "")
      : "";
    const routeSelectionValue = normalizeRouteBindingValue(routeSelectionRawValue);
    const inferredRouteBindingMode = getRouteBindingModeForSelection(routeSelectionValue, route);
    ui.routeBindingMode = inferredRouteBindingMode;
    const routeBinding = getRouteBindingContext(routeSelectionValue);
    const routeSpecification = hasPreviewRoute ? routeBinding.specification || getRouteSpecification(route) : null;
    const routeBom = hasPreviewRoute ? routeBinding.bom || getRouteBomList(route) : null;
    const project = hasPreviewRoute ? getProject(routeSelectionValue || getRouteProductionId(route)) : null;
    const routeView = getRouteCardViewModel(hasPreviewRoute ? route : null);
    const routePlanningQuantity = hasPreviewRoute ? getPlanningRouteQuantity(route) : 1;
    const routeTargetName = hasPreviewRoute
      ? routeBom?.name
        || routeSpecification?.name
        || getProjectDisplayName(project)
        || (activeRoute && getRouteStepsForModule(activeRoute.id).length ? "Самостоятельная маршрутная карта" : "выберите связь")
      : "выберите карту слева";
    const canOpenRouteTarget = Boolean(hasPreviewRoute && (routeBom || routeSpecification || project));
    const stats = getRouteModuleStats(activeRoute);
    const routeBindingOptions = getRouteBindingOptions();
    const hasRouteBindingOptions = routeBindingOptions.length > 1;
    const routeKindLabel = hasPreviewRoute ? getRouteDocumentKindLabel(route) : routeView.document.label;
    const routeGenerationRoot = activeRoute ? getRouteGenerationRoot(activeRoute) : null;
    const canGenerateChildRoutes = Boolean(activeRoute && getRouteSpecification(routeGenerationRoot));
    const routeHeaderDescription = hasPreviewRoute
      ? getRouteDocumentKind(route) === "child"
        ? `${getRouteLineageSubjectName(route)}: дочернее технологическое задание ветки состава изделия. Заказ-наряд собирается в модуле «Заказ-наряды».`
        : getRouteDocumentKind(route) === "shift"
          ? `${getRouteLineageSubjectName(route)}: маршрутная карта смены для частичной передачи объема.`
        : routeBom
            ? `${routeTargetName}: технологическое задание по плате/BOM.`
            : routeSpecification || project
              ? `${routeTargetName}: главное технологическое задание по составу изделия.`
              : "Маршрутная карта хранит технологическое задание независимо от конечного или промежуточного объекта."
      : "Выберите маршрутную карту в перечне или создайте новую.";
  
    return renderUiModulePage({
      ariaLabel: "Маршрутные карты",
      className: "routes-page",
      sidebar: renderUiModuleSidebar({
        eyebrow: "Технология",
        title: "Маршрутная карта",
        variant: "list",
        actions: renderUiActionButton({
          label: "Новая карта",
          iconName: "plus",
          tone: "primary",
          attributes: "data-route-create type=\"button\"",
        }),
        body: `
            <div class="ui-sidebar-list">
            <div class="ui-sidebar-label">Маршрутные карты</div>
            ${isNewRoute ? renderUiSidebarItem({
              title: routeTargetName,
              meta: "Новая маршрутная карта",
              badge: "new",
              active: true,
            }) : ""}
            ${getRoutesForModule().map((item) => {
              const routeProject = getRouteProductionContext(item);
              const itemSpecification = getRouteSpecification(item);
              const itemBom = getRouteBomList(item);
              const steps = getRouteStepsForModule(item.id);
              const itemTargetName = itemBom?.name
                || itemSpecification?.name
                || getProjectDisplayName(routeProject)
                || (steps.length ? "Самостоятельная карта" : "связь не выбрана");
              const itemKind = getRouteDocumentKind(item);
              const itemSubjectName = itemKind === "main" ? itemTargetName : getRouteLineageSubjectName(item);
              return renderUiSidebarItem({
                title: itemSubjectName,
                meta: `${getRouteDocumentKindShortLabel(item)} · ${item.name || "Маршрутная карта"} · ${steps.length} шагов`,
                badge: String(steps.length),
                active: item.id === activeRoute?.id,
                className: `route-card-list-item is-route-${itemKind}`,
                attributes: `data-route-open="${escapeAttribute(item.id)}" type="button"`,
              });
            }).join("")}
          </div>
        `,
      }),
      header: renderUiModuleHeader({
        eyebrow: routeKindLabel,
        title: hasPreviewRoute ? (isNewRoute ? "Новая маршрутная карта" : route.name || "Маршрутная карта") : "Карта не выбрана",
        description: routeHeaderDescription,
        actions: `
          ${renderUiActionButton({
            label: "Печатная форма",
            iconName: "document",
            attributes: `data-route-print-preview="${escapeAttribute(activeRoute?.id || "")}" type="button" ${activeRoute ? "" : "disabled"}`,
          })}
          ${renderUiActionButton({
            label: "Собрать заказ-наряд",
            iconName: "calendar",
            tone: "primary",
            attributes: `data-route-to-planning type="button" title="${escapeAttribute(routeView.transitionToWorkOrder?.description || "")}" ${canOpenRouteTarget ? "" : "disabled"}`,
          })}
        `,
      }),
      contentClassName: "route-module-content",
      content: hasPreviewRoute ? `
        ${renderUiPanel({
          className: "route-editor-panel",
          title: "Карточка маршрута",
          meta: isNewRoute ? "создание технологического задания" : "технологическое задание и основание для планирования",
          body: renderUiPanelBody({ body: `
  		            <form id="routeModuleForm" class="module-form route-module-form">
  		              <input type="hidden" name="routeId" value="${escapeAttribute(route.id)}" />
  		              <input type="hidden" name="isNew" value="${isNewRoute ? "yes" : "no"}" />
                    ${renderUiFormGrid({
                      columns: "4",
                      className: "route-module-form-grid full",
                      body: `
                        ${renderUiFormField({
                          label: "Название маршрутной карты",
                          required: true,
                          className: "form-field full",
                          control: `<input name="name" value="${escapeAttribute(route.name || "")}" placeholder="Основной маршрут" required />`,
                        })}
                        ${renderUiFormField({
                          label: "Связь маршрутной карты",
                          className: "form-field route-binding-field full",
                          disabled: !hasRouteBindingOptions,
                          control: `
                            <select name="routeBindingId" data-route-binding-select ${hasRouteBindingOptions ? "" : "disabled"}>
                              ${routeBindingOptions.map((item) => `
                                <option value="${escapeAttribute(item.value)}" ${selected(routeSelectionValue, item.value)}>
                                  ${escapeHtml(item.label)}${item.meta ? ` · ${escapeHtml(item.meta)}` : ""}
                                </option>
                              `).join("")}
                            </select>
                          `,
                        })}
                        ${renderUiFormField({
                          label: "Кол-во изделий",
                          className: "form-field route-planning-quantity-field",
                          disabled: !hasPreviewRoute,
                          control: `<input name="planningQuantity" data-route-planning-quantity="${escapeAttribute(route.id || "")}" type="number" min="1" step="1" value="${escapeAttribute(routePlanningQuantity)}" ${hasPreviewRoute ? "" : "disabled"} />`,
                        })}
                        ${renderUiFormActions({
                          className: "module-form-actions full",
                          actions: `
                            ${renderUiActionButton({ label: isNewRoute ? "Создать карту" : "Сохранить карту", iconName: "save", tone: "primary", attributes: "type=\"submit\"" })}
                            ${isNewRoute ? "" : renderUiActionButton({ label: "Удалить карту", iconName: "trash", className: "danger", attributes: `data-route-delete="${escapeAttribute(route.id)}" type="button"` })}
                          `,
                        })}
                      `,
                    })}
  	            </form>
                ${renderRouteLineagePanel(activeRoute || null, { targetName: routeTargetName })}
          ` }),
        })}
  
        ${renderUiPanel({
          className: "route-steps-panel",
          title: "Операции маршрута",
          actions: canOpenRouteTarget
            ? "<span>Выберите объект состава и добавьте операции внутри его строки.</span>"
            : "<span>Операции сохранённой самостоятельной маршрутной карты.</span>",
          actionsClassName: "route-steps-head-actions",
          body: renderUiPanelBody({ body: renderRouteStepsEditor(activeRoute, stats.steps) }),
        })}
            ` : "",
    });
  }
  
  function getRoutePrintTargetName(route) {
    if (!route) return "Маршрутная карта";
    const bom = getRouteBomList(route);
    const specification = getRouteSpecification(route);
    const production = getRouteProductionContext(route);
    return bom?.name
      || specification?.name
      || getProjectDisplayName(production)
      || "Самостоятельный документ";
  }
  
  function renderRoutePrintTreeLines(task = {}) {
    const level = Math.max(0, Number(task.level || 0));
    if (!level) return "";
    const continuationLevels = Array.isArray(task.continuationLevels) ? task.continuationLevels : [];
    const guides = continuationLevels
      .slice(1, level)
      .map((isActive, index) => isActive ? `<i class="route-print-tree-guide" style="--tree-line:${index}" aria-hidden="true"></i>` : "")
      .join("");
    return `${guides}<i class="route-print-tree-branch ${task.isLast ? "is-last" : ""}" style="--tree-line:${level - 1}" aria-hidden="true"></i>`;
  }
  
  function getQrFiniteFieldProduct(left, right) {
    let result = 0;
    for (let value = right; value > 0; value >>>= 1) {
      if (value & 1) result ^= left;
      left <<= 1;
      if (left & 0x100) left ^= 0x11d;
    }
    return result;
  }
  
  function getQrReedSolomonDivisor(degree) {
    const result = Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let index = 0; index < degree; index += 1) {
      for (let item = 0; item < degree; item += 1) {
        result[item] = getQrFiniteFieldProduct(result[item], root);
        if (item + 1 < degree) result[item] ^= result[item + 1];
      }
      root = getQrFiniteFieldProduct(root, 2);
    }
    return result;
  }
  
  function getQrReedSolomonRemainder(data, degree) {
    const divisor = getQrReedSolomonDivisor(degree);
    const result = Array(degree).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ result.shift();
      result.push(0);
      divisor.forEach((coefficient, index) => {
        result[index] ^= getQrFiniteFieldProduct(coefficient, factor);
      });
    });
    return result;
  }
  
  function appendQrBits(bits, value, length) {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push((value >>> index) & 1);
    }
  }
  
  function getRoutePrintQrPayload() {
    return "https://images.meme-arsenal.com/8e2a489b9edf3b50b3e2f195f3693d0b.jpg";
  }
  
  const ROUTE_PRINT_QR_SIZE = 37;
  const ROUTE_PRINT_QR_VARIANTS = [
    "1111111000001011000011110101101111111100000101110110001111011011110100000110111010000111011000101010011010111011011101000110111000100110011001011101101110101011011001010011001100101110110000010010101100011001110110010000011111111010101010101010101010101111111000000000101000010010111110010000000010101010001100000001101001110000100101010000100010001010111001110001101001101101110011100001111010100010011101100000100010110010100111001101000000101101111010001110110101011100111000011110011011111000011000000100001100000101100010001111100010010000100011001010101000110111011011010000110011010011100000100110111110110000111011100101110101000111010111111000010101110010010010111100111011101000001000010100011000100011100000011110100111110010101000000111001010110110111101000110010000110100101110110001001001100111101011100111111110111011000010111001110011111111100100001100001111001111110100101011111110100100000110101100001101011001011001000100101011010010000110001110100011110111100001110010000010011110101010111101011010011000111000101010101110111010101011111100011111111101100000000110110001110100011011000110111111111000000010001001000001101011011100000100111001101101001010010001100010111010111111111011000011101111110111011101000111111101101001010100111010101110101001111110100110100110001011110000010010011001101011101101101100101111111011100111011011001100111000011",
    "1111111011011110010110100000101111111100000100011100100101110001010100000110111010110010001101111111001010111011011101001100010010001100110001011101101110100110001100000110011000101110110000010100000110110011011100010000011111111010101010101010101010101111111000000000000010111000010100110000000010100011011001010100111100100001001011111010001000100000010011011011000011111000100110110100101111110111001000101010001000011000001101100111101010001000101111011011100000001001101101001100110001010010110010101110100110101100110111011010110111000101110110011110000010011101110001111010011001111001110101110011101011100101101110110000111111101101111101010010111111011000110111101001101110111101011101000001001010001001001010110100001101011000000001010010011111100011101000010011000100011110000100011011100011001101000001110010101011101110010111101100100110110101001110100110100101100101011110001110101011110001010011111001011000001011110011101110000001111000101100100111110110100010110100100111010111001010000000010111110000110010010010000000111011101111111110101001001011111000100000000100011011011110110001000100011111111011010111011100010100101010001100000100010011000111100000110001001010111010001010101110010110111111100011011101001101010111000011111110010000101110101100101011110011110011011110110000010000110011000001000111000110001111111010110010001110011001101101001",
    "1111111001101000100000010110001111111100000100111000000001010101110100000110111010111111100000010010100010111011011101010101011011000101111001011101101110101101010111011101000010101110110000010110010100100001001110010000011111111010101010101010101010101111111000000001100110011100110000010000000010111110010100111001010001001011111000110010000001101001011010010010001010100011111101101111110100101100010011111000001010001010011111110101111000011110011001101101010110111111011011111000010001110110010110001010000010001001011010110111011010101000011011110011001010010100111000110011010000110000101110101000110000111110110101101011101101101111101111000000101101001010100001011111011000001011101011110111111110101001101110010000101001111100100100111111110010001110000101111110101001010110001101010010101010000100001000101001110000110101001100110111111101100111001100110100110111110111001100011000011101000111100101001111101110111111010011001010100101011100001000000010011011001111011001001010111010100111001000011110111001111011011011001001100000110100100101110010010011111011100000000110001001001100100011000110001111111001100001101010100010101010111100000101110111100011000100010001101110111010100111000011111011011111101111011101010100011110001010110111011001101110101111110000101000101000000101110000010010100001010011010101010100011111111010000100111000101111011011111",
    "1111111011101000100000010110001111111100000101010101101100111000010100000110111010000100111011001001111010111011011101010101011011000101111001011101101110100000111010110000101110101110110000010001001111111010010101010000011111111010101010101010101010101111111000000001001011110001011101110000000010110111001111100010001010010010010110110010000001101001011010010010001010001110110000000010011001000001111110000011000001010001000100101110100011001110011001101101010110111111011011111101111000011011111011100111101111100110000011101100000001110011000000101001001010010100111000110011010000110000000011100101011101010011011000000110010110100100110100011011110110010001110001011111011000001011101011110111111011000000000011111101000100010001001011100110101001010101011110100101110011010110001101010010101010000100001000000100111101011000100001011010010000011100000111101111101100101100010111001000011101000111100101001111101110111010111010100111001000110001100101101101000010010100000010010001100001111101001000011110111001111011011011001001001101111001001000011111111111111110000000000101010010010111111001000101011111111011100001101010100010101010111100000101011010001110101001110001000010111010011100011000100000001111110101011101010100011110001010110111011001101110101010011101000101000101101000010000010001111010001000001110001111001111111010000100111000101111011011111",
    "1111111010101111100111010001001111111100000100011011100010110110010100000110111010010001101110011100101010111011011101010010011100000010111101011101101110101001001011000001011110101110110000010100011010101111000000010000011111111010101010101010101010101111111000000001111010000000101100000000000010001011100101001000100000111111110010001010111001010001100010101010110010000000111110001100010111001111110000001001101011111011101110000100001001101001011110101010010001111000011100111011110010010101110101101001100001101011010110111001010100100110010101111100001100010011111111110100010111110111110010110100101100100010101001110111100011100001100001001110100011000100101001101111100000110011010011001111000010110001110010001100110101100000111001001110000011111111110100001111011001101110110101101010010010111100110000001010110011010110101111010100011110010110101101000101000110000110111101101111011010000000100010001000101001111100110000101001000110111111101011100000010111000001010111000100110100101000001110011001111110111100011100001110111100101000111001101110001111111111100000000100000111000010101101000100001111111011011001010010011010101010000100000100101011111111011000010001110010111010110110110010001010101111111111011101001100100110110010001111100001101110100100010011001011001011100110010000010011010000100010100100100101101111111011000011111111101000011100111",
    "1111111001011110010110100000101111111100000101011000100001110101010100000110111010111111100000010010100010111011011101011001000111011001100101011101101110100101010111011101000010101110110000010000010110100011001100010000011111111010101010101010101010101111111000000001000110111100010000110000000010000010110100111001010001001110011100101110011101110101000110001110010110100011111101101111110100101100010011111010001000001000011101110111111010011000101111011011100000001001101101001000110001010110110110101010100010101001011010110111011010101000011011110011010110001000100100101111001100101100101110101000110000111110110101101011101111101101101101000010101111001000100111101001101110111101011101000001001110001001001110110000001001011100000100111111110010001110000101111110101001001010010001001110110110011000010100101001110000110101001100110111111101100101001110110110110101110101001110011110101011110001010011111001011000001111110011101010000101111100101000100010011011001111011001001010111010100111010100000010100101100111000111010101100000110100100101110010010011111011100000000100001011001110100001000100001111111001010111011100010100101010001100000100010111000011100100110001001110111010000111000011111011011111101111011101001000000010010110101011000101101110100111110000101000101000000101110000010000100011010001010111010110011111111010110010001110011001101101001",
    "1111111011011110010110100000101111111100000101011011100010110110010100000110111010110110101001011011101010111011011101001001000111011001100101011101101110101100011110010100001010101110110000010001110111000010101101010000011111111010101010101010101010101111111000000000000101111111010011110000000010011111111101110000011000000100101110101110011101110101000110001110010110101010110100100110111101100101011010111011101001101001111100010110011011111000101111011011100000001001101101001011110010010101110101101001100001101000010011111110010011100001010010111011010110001000100100101111001100101100100111100001111001110111111100100010101110001100001100100011001110101001000111101001101110111101011101000001001101001010001101110011001010011111000101110110111011000111001100110111100001001010010001001110110110011000010100100000111001111100000101111110110100100100101111010111010100010100101111111110101011110001010011111001011000001100110000101001000110111111101011100011010010000110010000000011110011101111010100000010100101100111000111010101101001111101101100111011011011111010100000000101101010101111000001000101101111111011010111011100010100101010001100000101010100000000100111110001001110111010101110001010110010011111100111011101011000000010010110101011000101101110100110111001100001100001001100110000010001000010110000110110110111111111111010110010001110011001101101001",
    "1111111000001011000011110101101111111100000100100100011101001001100100000110111010000011111100001110111010111011011101000110111000100110011001011101101110100001001011000001011110101110110000010110001000111101010010010000011111111010101010101010101010101111111000000000111010000000101100000000000010010110101000100101001101010101000001010000100010001010111001110001101001111111100001110011101000110000001111100100000110010110000011101001100100001101111010001110110101011100111000011100001001101010001010010110011110010101000110101011000110110100000111101110101000110111011011010000110011010011110010110100101100100010101001110111110001100011110011011100110001010110110010111100111011101000001000010100011010110001110010001100110101100000111000100011101110010010011001100010110100110100101110110001001001100111101011110101101100101001010000101011100001111011000000101000101011101011010000001011111110100100000110101100001101011011001011010110111001000000010100011110000111010011000101010110100110111010101010111101011010011000111000101010111100101000111001101110001111111111100000000110010101010000111111000110011111111000000010001001000001101011011100000101101011111111011000010001110010111010011011011111100111001111110011011101010111111101101001010100111010101110100011101100110100110100011001110000010010111101001111001001001000001111111011100111011011001100111000011",
  ];
  
  function createRoutePrintQrMatrix(payload) {
    const size = 21;
    const dataCodewordsCount = 19;
    const errorCodewordsCount = 7;
    const matrix = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    const setModule = (x, y, value, isReserved = true) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      matrix[y][x] = Boolean(value);
      if (isReserved) reserved[y][x] = true;
    };
    const addFinder = (left, top) => {
      for (let y = top - 1; y <= top + 7; y += 1) {
        for (let x = left - 1; x <= left + 7; x += 1) {
          setModule(x, y, false);
        }
      }
      for (let y = top; y < top + 7; y += 1) {
        for (let x = left; x < left + 7; x += 1) {
          const isOuter = x === left || x === left + 6 || y === top || y === top + 6;
          const isCore = x >= left + 2 && x <= left + 4 && y >= top + 2 && y <= top + 4;
          setModule(x, y, isOuter || isCore);
        }
      }
    };
    const addAlignment = (centerX, centerY) => {
      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
          const distance = Math.max(Math.abs(x), Math.abs(y));
          setModule(centerX + x, centerY + y, distance === 2 || distance === 0);
        }
      }
    };
    const reserveFormat = () => {
      for (let index = 0; index < 15; index += 1) {
        const first = index < 6 ? [8, index]
          : index === 6 ? [8, 7]
          : index === 7 ? [8, 8]
          : index === 8 ? [7, 8]
          : [14 - index, 8];
        const second = index < 8 ? [size - 1 - index, 8] : [8, size - 15 + index];
        setModule(first[0], first[1], false);
        setModule(second[0], second[1], false);
      }
    };
    addFinder(0, 0);
    addFinder(size - 7, 0);
    addFinder(0, size - 7);
    for (let index = 8; index < size - 8; index += 1) {
      const value = index % 2 === 0;
      setModule(index, 6, value);
      setModule(6, index, value);
    }
    setModule(8, size - 8, true);
    reserveFormat();
  
    const payloadBytes = Array.from(new TextEncoder().encode(payload));
    const dataBits = [];
    appendQrBits(dataBits, 0x4, 4);
    appendQrBits(dataBits, payloadBytes.length, 8);
    payloadBytes.forEach((byte) => appendQrBits(dataBits, byte, 8));
    const capacityBits = dataCodewordsCount * 8;
    const terminatorLength = Math.min(4, capacityBits - dataBits.length);
    appendQrBits(dataBits, 0, Math.max(0, terminatorLength));
    while (dataBits.length % 8) dataBits.push(0);
    const dataCodewords = [];
    for (let index = 0; index < dataBits.length; index += 8) {
      dataCodewords.push(dataBits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
    }
    for (let padIndex = 0; dataCodewords.length < dataCodewordsCount; padIndex += 1) {
      dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
    }
    const codewords = [...dataCodewords, ...getQrReedSolomonRemainder(dataCodewords, errorCodewordsCount)];
    const codewordBits = [];
    codewords.forEach((byte) => appendQrBits(codewordBits, byte, 8));
  
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical += 1) {
        const y = upward ? size - 1 - vertical : vertical;
        for (let column = 0; column < 2; column += 1) {
          const x = right - column;
          if (reserved[y][x]) continue;
          matrix[y][x] = Boolean(codewordBits[bitIndex] || 0);
          bitIndex += 1;
        }
      }
      upward = !upward;
    }
    const masks = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const maskIndex = Math.floor(Math.random() * masks.length);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!reserved[y][x] && masks[maskIndex](x, y)) matrix[y][x] = !matrix[y][x];
      }
    }
    const errorCorrectionBits = 1;
    let formatData = (errorCorrectionBits << 3) | maskIndex;
    let remainder = formatData;
    for (let index = 0; index < 10; index += 1) {
      remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
    }
    const formatBits = ((formatData << 10) | remainder) ^ 0x5412;
    for (let index = 0; index < 15; index += 1) {
      const value = ((formatBits >>> index) & 1) !== 0;
      const first = index < 6 ? [8, index]
        : index === 6 ? [8, 7]
        : index === 7 ? [8, 8]
        : index === 8 ? [7, 8]
        : [14 - index, 8];
      const second = index < 8 ? [size - 1 - index, 8] : [8, size - 15 + index];
      setModule(first[0], first[1], value);
      setModule(second[0], second[1], value);
    }
    return matrix;
  }
  
  function renderRoutePrintQrCode() {
    const payload = getRoutePrintQrPayload();
    const variant = ROUTE_PRINT_QR_VARIANTS[Math.floor(Math.random() * ROUTE_PRINT_QR_VARIANTS.length)] || ROUTE_PRINT_QR_VARIANTS[0];
    const quietZone = 4;
    const moduleSize = ROUTE_PRINT_QR_SIZE + quietZone * 2;
    const cells = [];
    for (let index = 0; index < variant.length; index += 1) {
      if (variant[index] !== "1") continue;
      cells.push([index % ROUTE_PRINT_QR_SIZE + quietZone, Math.floor(index / ROUTE_PRINT_QR_SIZE) + quietZone]);
    }
    return `
      <svg class="route-print-qr-placeholder" viewBox="0 0 ${moduleSize} ${moduleSize}" width="116" height="116" style="width:116px;height:116px;stroke:none;shape-rendering:crispEdges" role="img" aria-label="QR: ${escapeAttribute(payload)}" data-qr-payload="${escapeAttribute(payload)}">
        <title>${escapeHtml(payload)}</title>
        ${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#0f172a" />`).join("")}
      </svg>
    `;
  }
  
  function renderRoutePrintQrBox() {
    return `
      <div class="route-print-qr-box">
        ${renderRoutePrintQrCode()}
      </div>
    `;
  }
  
  function renderRoutePrintCompositionTree(route) {
    const tasks = getRouteTasksForModule(route).filter((task) => !task.isMain && !task.isOrphan);
    const routeQuantity = getPlanningRouteQuantity(route);
    if (!tasks.length) {
      return `
        <div class="route-print-empty">
          <strong>Дерево объектов маршрута не найдено</strong>
          <span>Сохраните связь с изделием или платой, чтобы маршрутная карта получила структуру для печати.</span>
        </div>
      `;
    }
  
    return `
      <table data-ui-component="PrintTable" class="route-print-table route-print-composition-table">
        <thead>
          <tr>
            <th>П/п</th>
            <th>Объект</th>
            <th>Ед. изм.</th>
            <th>Кол-во на изд.</th>
            <th>Кол-во партии</th>
            <th class="route-print-qr-head">Код</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((task, index) => `
            <tr>
              <td>${escapeHtml(task.number || String(index + 1))}</td>
              <td>
                <div class="route-print-tree-name" style="--level:${Math.max(0, Number(task.level || 0))}">
                  ${renderRoutePrintTreeLines(task)}
                  <strong>${escapeHtml(task.title || "Объект маршрута")}</strong>
                  <span>${escapeHtml(task.parentTitle || getRouteTaskTypeLabel(task))}</span>
                </div>
              </td>
              <td>${escapeHtml(task.unit || "шт.")}</td>
              <td>${escapeHtml(formatReportNumber(task.quantity || 1))}</td>
              <td>${escapeHtml(formatReportNumber((task.quantity || 1) * routeQuantity))}</td>
              ${index === 0 ? `<td class="route-print-qr-cell" rowspan="${tasks.length}">${renderRoutePrintQrBox()}</td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function getRoutePrintOperationQuantityView(snapshot = {}, step = {}, operationLabel = "") {
    const quantity = Math.max(1, normalizeQuantity(snapshot.quantity || 1));
    const boardsPerPanel = normalizeBoardsPerPanel(snapshot.boardsPerPanel || step.boardsPerPanel || 1, 1);
    const isSmtLike = snapshot.calculationType === "components"
      || isSmtOperationWorkCenter(snapshot.workCenterId || step.workCenterId || "", {
        ...step,
        operationName: operationLabel || step.operationName || "",
        resourceId: snapshot.resourceId || step.resourceId || "",
        boardsPerPanel,
      }, planningState);
    if (!isSmtLike) {
      return {
        unitLabel: "шт.",
        quantityLabel: formatReportNumber(quantity),
        extraParts: [],
      };
    }
    return {
      unitLabel: "мультипл.",
      quantityLabel: formatReportNumber(Math.max(1, Math.ceil(quantity / boardsPerPanel))),
      extraParts: [
        `${formatReportNumber(quantity)} шт.`,
        `${formatReportNumber(boardsPerPanel)} плат/мульт.`,
      ],
    };
  }
  
  function renderRoutePrintOperationsTable(route) {
    const steps = getRouteStepsForModule(route?.id || "");
    const tasks = getRouteTasksForModule(route);
    const routeQuantity = getPlanningRouteQuantity(route);
    const hasOperations = tasks.some((task) => getRouteStepsForTask(steps, task.id).length);
    if (!tasks.length) {
      return `
        <div class="route-print-empty">
          <strong>Объекты маршрута не найдены</strong>
          <span>Сохраните связь с изделием или платой, чтобы маршрутная карта получила структуру для операций.</span>
        </div>
      `;
    }
  
    return `
      <table data-ui-component="PrintTable" class="route-print-table route-print-operations-table">
        <thead>
          <tr>
            <th>П/п</th>
            <th>Операция</th>
            <th>Ресурс</th>
            <th>Дополнительно</th>
            <th>Ед. изм.</th>
            <th>Кол-во</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((task) => {
            const taskSteps = getRouteStepsForTask(steps, task.id);
            const taskNumber = task.number === "00" ? "1" : task.number || "1";
            return `
              <tr class="route-print-task-row">
                <td>${escapeHtml(taskNumber)}</td>
                <td colspan="5">
                  <strong>${escapeHtml(task.title || "Объект маршрута")}</strong>
                  <span>${escapeHtml(`${formatReportNumber(task.quantity || 1)} ${task.unit || "шт."}${task.parentTitle ? ` · ${task.parentTitle}` : ""}`)}</span>
                </td>
              </tr>
              ${taskSteps.length ? taskSteps.map((step, index) => {
                const snapshot = getRouteStepLaborSnapshot(route, step, { routeQuantity });
                const operation = getOperationMapItem(step.operationId);
                const operationLabel = step.operationName || operation?.name || "Операция не выбрана";
                const workCenterLabel = snapshot.workCenterLabel || getWorkCenter(step.workCenterId)?.name || step.workCenterId || "Отдел не выбран";
                const resourceLabel = snapshot.resourceLabel && snapshot.resourceLabel !== "авто" ? snapshot.resourceLabel : "ресурс не задан";
                const quantityView = getRoutePrintOperationQuantityView(snapshot, step, operationLabel);
                const extraLabel = [resourceLabel, ...quantityView.extraParts].filter(Boolean).join(" · ");
                return `
                  <tr>
  	                  <td>${escapeHtml(`оп. ${index + 1}`)}</td>
  	                  <td>
  	                    <span class="route-print-operation-main">${escapeHtml(operationLabel)}</span>
  		                  </td>
  	                  <td><span class="route-print-resource-main">${escapeHtml(workCenterLabel)}</span></td>
  	                  <td><span class="route-print-operation-extra">${escapeHtml(extraLabel)}</span></td>
  	                  <td>${escapeHtml(quantityView.unitLabel)}</td>
  	                  <td>${escapeHtml(quantityView.quantityLabel)}</td>
  	                </tr>
                `;
              }).join("") : `
                <tr class="route-print-muted-row">
                  <td></td>
                  <td colspan="5">Операции для этого объекта не заданы</td>
                </tr>
              `}
            `;
          }).join("")}
          ${hasOperations ? "" : `
            <tr class="route-print-muted-row">
              <td></td>
              <td colspan="5">В маршрутной карте пока нет заполненных операций.</td>
            </tr>
          `}
        </tbody>
      </table>
    `;
  }
  
  function renderRoutePrintSignatureGrid() {
    return `
      <div class="route-print-signatures">
        ${["Технолог", "Мастер участка", "Контроль качества", "Дата"].map((label) => `
          <article>
            <span>${escapeHtml(label)}</span>
            <i aria-hidden="true"></i>
          </article>
        `).join("")}
      </div>
    `;
  }
  
  function renderRoutePrintSheet(route) {
    const documentDate = formatDateTimeShort(new Date().toISOString());
    const targetName = getRoutePrintTargetName(route);
    const routeQuantity = getPlanningRouteQuantity(route);
    const targetSummary = [targetName, `${formatReportNumber(routeQuantity)} шт.`].filter(Boolean).join(" | ");
    return `
      <article class="route-print-sheet" aria-label="Печатная форма маршрутной карты">
        <section class="route-print-title-block">
          <div class="route-print-title-row">
            <h1>${escapeHtml(route?.name || "Маршрутная карта")}</h1>
            <time class="route-print-title-date">${escapeHtml(documentDate)}</time>
          </div>
          <p>${escapeHtml(targetSummary)}</p>
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Состав изделия</span>
              <h2>Дерево объектов маршрута</h2>
            </div>
          </header>
          ${renderRoutePrintCompositionTree(route)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Технология</span>
              <h2>Операции маршрута</h2>
            </div>
          </header>
          ${renderRoutePrintOperationsTable(route)}
        </section>
  
        <section class="route-print-section route-print-notes">
          <header class="route-print-section-head">
            <div>
              <span>Производство</span>
              <h2>Отметки</h2>
            </div>
          </header>
          <div>
          </div>
        </section>
  
        ${renderRoutePrintSignatureGrid()}
      </article>
    `;
  }
  
  function renderRoutePrintPreviewModal() {
    if (!ui.routePrintPreviewId) return "";
    const route = (planningState.routes || []).find((item) => item.id === ui.routePrintPreviewId) || getActiveRouteForModule();
    if (!route) return "";
    return `
      <div class="modal-backdrop route-print-backdrop" data-modal-backdrop>
        ${renderUiModalShell({
          className: "large-modal route-print-modal",
          attributes: "aria-label=\"Печатная форма маршрутной карты\"",
          content: `
          <div class="modal-header route-print-ui">
            <div>
              <span class="eyebrow">Печатная форма</span>
              <h2>${escapeHtml(route.name || "Маршрутная карта")}</h2>
            </div>
            ${renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-close-modal type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" })}
          </div>
          <div class="route-print-scroll">
            ${renderRoutePrintSheet(route)}
          </div>
          <div class="modal-footer route-print-ui">
            ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" })}
            ${renderUiActionButton({ label: "Печать / PDF", iconName: "download", tone: "primary", attributes: "data-route-print-run type=\"button\"" })}
          </div>
        `,
        })}
      </div>
    `;
  }
  
  function getWorkOrderPrintPackageRoute(routeId = "") {
    const normalizedRouteId = String(routeId || "").trim();
    return (planningState.routes || []).find((route) => route.id === normalizedRouteId)
      || getActiveRouteForModule()
      || null;
  }
  
  function getShiftWorkOrderJournalShiftLabel(row = {}) {
    const dateKey = String(row.shiftDateKey || row.sheetContract?.shiftDateKey || "").trim();
    if (dateKey) return getPlanningShiftDateLabel(dateKey);
    if (row.issuedAt) return formatDateTimeShort(row.issuedAt);
    if (row.updatedAt) return formatDateTimeShort(row.updatedAt);
    return row.dateLabel || "смена не задана";
  }
  
  function shiftWorkOrderJournalRowMatchesRoute(row = {}, route = null, workOrderView = null) {
    if (!row || !route?.id) return false;
    const routeIds = new Set([
      route.id,
      workOrderView?.document?.entityId,
      workOrderView?.document?.id,
    ].filter(Boolean).map(String));
    const rowRouteIds = [
      row.planningOrderId,
      row.routeId,
      row.sheetContract?.planningOrderId,
      row.sheetContract?.routeId,
      row.transfer?.planningOrderId,
      row.transfer?.routeId,
    ].filter(Boolean).map(String);
    if (rowRouteIds.some((id) => routeIds.has(id))) return true;
    const orderLabels = [
      workOrderView?.objectLabel,
      workOrderView?.queueTitle,
      getPlanningOrderObjectLabel(route),
      route.name,
    ].filter(Boolean).map((value) => String(value).trim());
    const rowLabel = String(row.orderLabel || "").trim();
    return Boolean(rowLabel && orderLabels.some((label) => label && rowLabel === label));
  }
  
  function shiftWorkOrderJournalRowMatchesStep(row = {}, step = {}, snapshot = {}) {
    const rowStepIds = [
      row.routeStepId,
      row.stepId,
      row.sheetContract?.stepId,
      row.transfer?.stepId,
      row.transfer?.fromStepId,
    ].filter(Boolean).map(String);
    if (step?.id && rowStepIds.includes(String(step.id))) return true;
    const rowOperation = String(row.operationName || "").trim();
    const stepOperation = String(step.operationName || "").trim();
    if (!rowOperation || !stepOperation || rowOperation !== stepOperation) return false;
    const rowWorkCenter = String(row.workCenterLabel || "").trim();
    const stepWorkCenter = String(snapshot.workCenterLabel || "").trim();
    return !rowWorkCenter || !stepWorkCenter || rowWorkCenter === stepWorkCenter;
  }
  
  function getWorkOrderPrintPackageOperationRows(route = null, routeSteps = [], journalRows = []) {
    const planningQuantity = getPlanningRouteQuantity(route);
    return (routeSteps || []).map((step, index) => {
      const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
      const snapshot = getRouteStepLaborSnapshot(route, step, { routeQuantity: planningQuantity, quantity });
      const task = getRouteStepPlanningTask(route, step, routeSteps);
      const rows = journalRows.filter((row) => shiftWorkOrderJournalRowMatchesStep(row, step, snapshot));
      const shiftLabels = new Set(rows.map(getShiftWorkOrderJournalShiftLabel).filter(Boolean));
      const executorIds = new Set();
      rows.forEach((row) => {
        (row.executors || []).forEach((executor) => {
          const key = executor.employeeId || executor.employeeName || "";
          if (key) executorIds.add(key);
        });
      });
      const assignedQuantity = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.assignedQuantity || 0), 0);
      const factQuantity = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.factQuantity || 0), 0);
      const defectQuantity = rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.defectQuantity || 0), 0);
      const remainingQuantity = Math.max(0, quantity - factQuantity);
      const statusLabel = factQuantity >= quantity
        ? "закрыта"
        : assignedQuantity >= quantity
          ? "распределена"
          : rows.length
            ? "частично"
            : "нет СЗН";
      return {
        id: step.id || `step-${index + 1}`,
        index: index + 1,
        taskLabel: task ? [task.number, task.title].filter(Boolean).join(" · ") : step.specTaskName || "Объект маршрута",
        operationName: step.operationName || "Операция",
        workCenterLabel: snapshot.workCenterLabel || "Участок не задан",
        durationLabel: snapshot.durationLabel || "не рассчитано",
        plannedQuantity: quantity,
        sznPlannedQuantity: rows.reduce((sum, row) => sum + normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0), 0),
        assignedQuantity,
        factQuantity,
        defectQuantity,
        remainingQuantity,
        documentCount: rows.length,
        shiftCount: shiftLabels.size,
        executorCount: executorIds.size,
        statusLabel,
        rows,
      };
    });
  }
  
  function getWorkOrderPrintPackageExecutorRows(journalRows = [], unit = "шт.") {
    const groups = new Map();
    journalRows.forEach((row) => {
      const shiftLabel = getShiftWorkOrderJournalShiftLabel(row);
      (row.executors || []).forEach((executor) => {
        const employeeName = executor.employeeName || getShiftMasterEmployee(executor.employeeId)?.name || "Исполнитель";
        const key = executor.employeeId || employeeName;
        if (!groups.has(key)) {
          groups.set(key, {
            id: key,
            employeeName,
            quantity: 0,
            documents: new Set(),
            shifts: new Set(),
            operations: new Set(),
            unit,
          });
        }
        const group = groups.get(key);
        group.quantity += normalizeShiftMasterBoardQuantity(executor.quantity || 0);
        if (row.documentNumber) group.documents.add(row.documentNumber);
        if (shiftLabel) group.shifts.add(shiftLabel);
        if (row.operationName) group.operations.add(row.operationName);
      });
    });
    return [...groups.values()].sort((left, right) => (
      String(left.employeeName).localeCompare(String(right.employeeName), "ru")
    ));
  }
  
  function getWorkOrderPrintPackageViewModel(routeId = "") {
    const route = getWorkOrderPrintPackageRoute(routeId);
    if (!route) return null;
    const routeSteps = getRouteStepsForModule(route.id);
    const transferSummary = getPlanningRouteTransferSummary(route);
    const workOrderView = getWorkOrderViewModel(route, { summary: transferSummary, routeSteps });
    const planningQuantity = workOrderView.quantity || getPlanningRouteQuantity(route);
    const journal = getShiftWorkOrderJournalViewModel();
    const journalRows = journal.rows
      .filter((row) => shiftWorkOrderJournalRowMatchesRoute(row, route, workOrderView))
      .sort((left, right) => (
        String(left.shiftDateKey || left.updatedAt || "").localeCompare(String(right.shiftDateKey || right.updatedAt || ""), "ru")
        || String(left.documentNumber || "").localeCompare(String(right.documentNumber || ""), "ru")
      ));
    const operations = getWorkOrderPrintPackageOperationRows(route, routeSteps, journalRows);
    const executorRows = getWorkOrderPrintPackageExecutorRows(journalRows, "шт.");
    const finalOperation = operations[operations.length - 1] || null;
    const shiftLabels = new Set(journalRows.map(getShiftWorkOrderJournalShiftLabel).filter(Boolean));
    return {
      route,
      workOrderView,
      transferSummary,
      routeSteps,
      journalRows,
      operations,
      executorRows,
      planningQuantity,
      unit: "шт.",
      documentDate: formatDateTimeShort(new Date().toISOString()),
      finalFactQuantity: finalOperation ? finalOperation.factQuantity : 0,
      finalRemainingQuantity: finalOperation ? Math.max(0, planningQuantity - finalOperation.factQuantity) : planningQuantity,
      shiftCount: shiftLabels.size,
      operationCount: routeSteps.length,
    };
  }
  
  function renderWorkOrderPrintPackageSummary(model) {
    return renderShiftWorkOrderPrintInfoTable([
      ["Заказ-наряд", model.workOrderView.title],
      ["Изделие", model.workOrderView.objectLabel],
      ["Основание", `${getRouteDocumentKindLabel(model.route)} · ${model.route.name || "Маршрутная карта"}`],
      ["План выпуска", formatShiftWorkOrderPrintQuantity(model.planningQuantity, model.unit)],
      ["Операций", model.operationCount.toLocaleString("ru-RU")],
      ["СЗН в пакете", model.journalRows.length.toLocaleString("ru-RU")],
      ["Смен", model.shiftCount.toLocaleString("ru-RU")],
      ["Исполнителей", model.executorRows.length.toLocaleString("ru-RU")],
      ["Факт последней операции", formatShiftWorkOrderPrintQuantity(model.finalFactQuantity, model.unit)],
      ["Остаток по заказу", formatShiftWorkOrderPrintQuantity(model.finalRemainingQuantity, model.unit)],
    ], "work-order-print-passport-table");
  }
  
  function renderWorkOrderPrintPackageOperationsTable(model) {
    if (!model.operations.length) {
      return `
        <div class="route-print-empty">
          <strong>Операции не найдены</strong>
          <span>Печатный пакет будет заполнен после формирования структуры заказ-наряда.</span>
        </div>
      `;
    }
    return `
      <table data-ui-component="PrintTable" class="route-print-table work-order-print-operations-table">
        <thead>
          <tr>
            <th>П/п</th>
            <th>Операция / маршрут</th>
            <th>Участок</th>
            <th>План</th>
            <th>СЗН</th>
            <th>Распред.</th>
            <th>Факт</th>
            <th>Ост.</th>
            <th>Смены / исп.</th>
            <th>Состояние</th>
          </tr>
        </thead>
        <tbody>
          ${model.operations.map((row) => `
            <tr>
              <td>${row.index}</td>
              <td><strong>${escapeHtml(row.operationName)}</strong><span>${escapeHtml(row.taskLabel)}</span></td>
              <td>${escapeHtml(row.workCenterLabel)}<span>${escapeHtml(row.durationLabel)}</span></td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.plannedQuantity, model.unit))}</td>
              <td>${row.documentCount.toLocaleString("ru-RU")}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.assignedQuantity, model.unit))}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.factQuantity, model.unit))}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.remainingQuantity, model.unit))}</td>
              <td>${row.shiftCount.toLocaleString("ru-RU")} / ${row.executorCount.toLocaleString("ru-RU")}</td>
              <td>${escapeHtml(row.statusLabel)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function renderWorkOrderPrintPackageRegistryTable(model) {
    if (!model.journalRows.length) {
      return `
        <div class="route-print-empty">
          <strong>Сменные заказ-наряды еще не появились</strong>
          <span>Они попадут в этот пакет после передачи заказ-наряда в планирование и распределения задач в мастерской.</span>
        </div>
      `;
    }
    return `
      <table data-ui-component="PrintTable" class="route-print-table work-order-print-registry-table">
        <thead>
          <tr>
            <th>СЗН</th>
            <th>Смена</th>
            <th>Операция / участок</th>
            <th>Мастер</th>
            <th>Исполнители</th>
            <th>План</th>
            <th>Распред.</th>
            <th>Факт</th>
            <th>Ост.</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${model.journalRows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.documentNumber)}</strong></td>
              <td>${escapeHtml(getShiftWorkOrderJournalShiftLabel(row))}</td>
              <td><strong>${escapeHtml(row.operationName)}</strong><span>${escapeHtml(row.workCenterLabel)}</span></td>
              <td>${escapeHtml(formatShiftWorkOrderPersonName(row.masterName))}</td>
              <td>${escapeHtml(row.executorLabel || "не назначены")}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.plannedQuantity, row.unit))}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.assignedQuantity, row.unit))}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.factQuantity, row.unit))}</td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.remainingQuantity, row.unit))}</td>
              <td>${escapeHtml(row.status?.label || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function renderWorkOrderPrintPackageExecutorsTable(model) {
    if (!model.executorRows.length) {
      return `
        <div class="route-print-empty">
          <strong>Назначения исполнителей не найдены</strong>
          <span>Блок заполнится после распределения сменных задач в мастерской.</span>
        </div>
      `;
    }
    return `
      <table data-ui-component="PrintTable" class="route-print-table work-order-print-executors-table">
        <thead>
          <tr>
            <th>Исполнитель</th>
            <th>Кол-во</th>
            <th>Смены</th>
            <th>СЗН</th>
            <th>Операции</th>
          </tr>
        </thead>
        <tbody>
          ${model.executorRows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(formatShiftWorkOrderPersonName(row.employeeName))}</strong></td>
              <td>${escapeHtml(formatShiftWorkOrderPrintQuantity(row.quantity, row.unit))}</td>
              <td>${[...row.shifts].length.toLocaleString("ru-RU")}</td>
              <td>${[...row.documents].length.toLocaleString("ru-RU")}</td>
              <td>${escapeHtml([...row.operations].join(", ") || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function renderWorkOrderPrintPackageTransferTable(model) {
    const rows = model.journalRows
      .map((row) => row.transfer ? [
        row.documentNumber,
        [row.transfer.fromWorkCenterLabel || row.workCenterLabel, row.transfer.fromOperationName || row.operationName].filter(Boolean).join(" · "),
        [row.transfer.toWorkCenterLabel || "не задано", row.transfer.toOperationName || row.transfer.targetLabel || "следующий шаг"].filter(Boolean).join(" · "),
        row.transfer.remainingQuantity ? formatShiftWorkOrderPrintQuantity(row.transfer.remainingQuantity, row.unit) : "без остатка",
      ] : null)
      .filter(Boolean);
    if (!rows.length) {
      return `
        <div class="route-print-empty">
          <strong>Передача еще не сформирована</strong>
          <span>Данные появятся после выдачи СЗН и закрытия факта.</span>
        </div>
      `;
    }
    return `
      <table data-ui-component="PrintTable" class="route-print-table work-order-print-transfer-table">
        <thead>
          <tr>
            <th>Документ</th>
            <th>Откуда</th>
            <th>Куда</th>
            <th>Остаток</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([documentNumber, fromLabel, toLabel, remainingLabel]) => `
            <tr>
              <td><strong>${escapeHtml(documentNumber)}</strong></td>
              <td>${escapeHtml(fromLabel)}</td>
              <td>${escapeHtml(toLabel)}</td>
              <td>${escapeHtml(remainingLabel)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  
  function renderWorkOrderPrintPackageSignatureGrid() {
    return `
      <div class="route-print-signatures work-order-print-signatures">
        ${["Начальник производства", "Планирование", "Мастер", "Контроль качества"].map((label) => `
          <article>
            <span>${escapeHtml(label)}</span>
            <i aria-hidden="true"></i>
          </article>
        `).join("")}
      </div>
    `;
  }
  
  function renderWorkOrderPrintPackageSheet(model) {
    const title = [model.workOrderView.title, model.workOrderView.objectLabel].filter(Boolean).join(" · ");
    return `
      <article class="route-print-sheet work-order-print-sheet" aria-label="Печатный пакет заказ-наряда">
        <section class="route-print-title-block">
          <div class="route-print-title-row">
            <h1>Печатный пакет заказ-наряда</h1>
            <time class="route-print-title-date">${escapeHtml(model.documentDate)}</time>
          </div>
          <p>${escapeHtml(title || "Заказ-наряд")}</p>
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Паспорт</span>
              <h2>Главный заказ-наряд</h2>
            </div>
            <strong>${escapeHtml(model.workOrderView.status?.label || "статус не задан")}</strong>
          </header>
          ${renderWorkOrderPrintPackageSummary(model)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Операции</span>
              <h2>Сводка по структуре заказ-наряда</h2>
            </div>
          </header>
          ${renderWorkOrderPrintPackageOperationsTable(model)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Сменные документы</span>
              <h2>Реестр СЗН внутри заказ-наряда</h2>
            </div>
          </header>
          ${renderWorkOrderPrintPackageRegistryTable(model)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Исполнители</span>
              <h2>Назначения по всем сменам</h2>
            </div>
          </header>
          ${renderWorkOrderPrintPackageExecutorsTable(model)}
        </section>
  
        <section class="route-print-section">
          <header class="route-print-section-head">
            <div>
              <span>Передача</span>
              <h2>Физическое движение по СЗН</h2>
            </div>
          </header>
          ${renderWorkOrderPrintPackageTransferTable(model)}
        </section>
  
        ${renderWorkOrderPrintPackageSignatureGrid()}
      </article>
    `;
  }
  
  function renderWorkOrderPrintPackageModal() {
    const routeId = String(ui.workOrderPrintPreviewId || "");
    if (!routeId) return "";
    const model = getWorkOrderPrintPackageViewModel(routeId);
    if (!model) return "";
    return `
      <div class="modal-backdrop route-print-backdrop work-order-print-backdrop" data-modal-backdrop>
        ${renderUiModalShell({
          className: "large-modal route-print-modal work-order-print-modal",
          attributes: "aria-label=\"Печатный пакет заказ-наряда\"",
          content: `
          <div class="modal-header route-print-ui">
            <div>
              <span class="eyebrow">Печатный пакет</span>
              <h2>${escapeHtml(model.workOrderView.objectLabel || model.workOrderView.title || "Заказ-наряд")}</h2>
            </div>
            ${renderUiActionButton({ iconName: "close", tone: "icon", attributes: "data-close-modal type=\"button\" title=\"Закрыть\" aria-label=\"Закрыть\"" })}
          </div>
          <div class="route-print-scroll">
            ${renderWorkOrderPrintPackageSheet(model)}
          </div>
          <div class="modal-footer route-print-ui">
            ${renderUiActionButton({ label: "Закрыть", iconName: "close", attributes: "data-close-modal type=\"button\"" })}
            ${renderUiActionButton({ label: "Печать / PDF", iconName: "download", tone: "primary", attributes: "data-work-order-print-run type=\"button\"" })}
          </div>
        `,
        })}
      </div>
    `;
  }
  
  function renderRouteModuleSequence(steps, route = null) {
    if (!steps.length) {
      return `
        <div class="route-module-empty">
          ${icon("split")}
          <strong>Маршрут пока пустой</strong>
          <span>Добавьте операции в нужной последовательности. Приемку результата можно оставить последней.</span>
        </div>
      `;
    }
  
    const tasks = getRouteTasksForModule(route);
    if (tasks.length > 1 || tasks.some((task) => !task.isMain)) {
      return `
        <div class="route-task-sequence" aria-label="Последовательность маршрутной карты по задачам">
          ${tasks.map((task) => {
            const taskSteps = getRouteStepsForTask(steps, task.id);
            return `
              <article class="route-task-sequence-card ${task.isMain ? "is-main-task" : ""} ${task.isOrphan ? "is-orphan-task" : ""}">
                <header>
                  <span>${escapeHtml(task.number)} · ${escapeHtml(getRouteTaskTypeLabel(task))}</span>
                  <strong>${escapeHtml(task.title)}</strong>
                  <small>${escapeHtml(task.quantity)} ${escapeHtml(task.unit)} · ${escapeHtml(task.departmentName)}</small>
                </header>
                ${taskSteps.length ? `
                  <div class="route-task-sequence-steps">
                    ${taskSteps.map((step) => {
                      const center = getWorkCenter(step.workCenterId);
                      return `<span class="${isManufacturingOutputReceiptRouteStep(step) ? "is-warehouse" : ""}"><b>${Number(step.stepOrder || 0)}</b>${escapeHtml(step.operationName || "Операция")}<small>${escapeHtml(center?.name || step.workCenterId || "отдел")}</small></span>`;
                    }).join("")}
                  </div>
                ` : `<div class="route-task-sequence-empty">Операции еще не заданы</div>`}
              </article>
            `;
          }).join("")}
        </div>
      `;
    }
  
    return `
      <div class="route-module-sequence" aria-label="Последовательность маршрутной карты">
        ${steps.map((step) => {
          const center = getWorkCenter(step.workCenterId);
          return `
            <article class="${isManufacturingOutputReceiptRouteStep(step) ? "is-warehouse" : ""}">
              <b>${Number(step.stepOrder || 0)}</b>
              <span><strong>${escapeHtml(step.operationName || "Операция")}</strong><small>${escapeHtml(center?.name || step.workCenterId || "отдел")}</small></span>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }
  
  function getRouteTaskTypeLabel(task) {
    if (task?.isMain) return "маршрут";
    if (task?.isOrphan) return "проверить";
    if (task?.fulfillmentMode === "from_stock") return "склад";
    if (task?.type === "bom") return "плата";
    if (task?.type === "specification") return "состав изделия";
    if (task?.type === "assembly") return "изготавливаемая позиция";
    if (task?.type === "nomenclature" || task?.type === "part") return "позиция";
    return "задача";
  }
  
  function getRouteTaskTypeVisual(task) {
    const label = getRouteTaskTypeLabel(task);
    if (task?.isOrphan) return { label, iconName: "alert", tone: "warning", tooltip: "Тип объекта: проверить связь" };
    if (task?.isMain) return { label, iconName: "routeEdit", tone: "neutral", tooltip: "Тип объекта: маршрут" };
    if (task?.fulfillmentMode === "from_stock") return { label, iconName: "warehouse", tone: "warehouse", tooltip: "Тип объекта: складской остаток" };
    if (task?.type === "bom") return { label, iconName: "bom", tone: "bom", tooltip: "Тип объекта: плата" };
    if (task?.type === "specification") return { label, iconName: "tree", tone: "spec", tooltip: "Тип объекта: состав изделия" };
    if (task?.type === "assembly") return { label, iconName: "split", tone: "assembly", tooltip: "Тип объекта: изготавливаемая позиция" };
    if (task?.type === "nomenclature" || task?.type === "part") return { label, iconName: "package", tone: "part", tooltip: "Тип объекта: позиция номенклатуры" };
    return { label, iconName: "info", tone: "neutral", tooltip: `Тип объекта: ${label}` };
  }
  
  function getRouteStepTypeVisual(step) {
    if (isManufacturingOutputReceiptRouteStep(step)) {
      return {
        label: "Приемка",
        iconName: "package",
        tone: "warehouse",
        tooltip: "Тип операции: приемка на склад",
      };
    }
  
    return {
      label: "Операция",
      iconName: "operation",
      tone: "operation",
      tooltip: "Тип операции: производственная операция",
    };
  }
  
  function renderRouteTypeIconBadge(visual) {
    const label = visual?.label || "Тип";
    const tooltip = visual?.tooltip || `Тип: ${label}`;
    return `
      <span
        class="route-type-icon-badge is-${escapeAttribute(visual?.tone || "neutral")}"
        role="img"
        aria-label="${escapeAttribute(tooltip)}"
        title="${escapeAttribute(tooltip)}"
        data-tooltip="${escapeAttribute(tooltip)}"
      >
        ${icon(visual?.iconName || "info")}
      </span>
    `;
  }

  function renderStructureTreeGuides(continuationLevels = []) {
    return (Array.isArray(continuationLevels) ? continuationLevels : [])
      .map((hasContinuation, guideLevel) => hasContinuation
        ? `<span class="speki-tree-guide" style="--speki-guide-level: ${guideLevel};" aria-hidden="true"></span>`
        : "")
      .join("");
  }
  
  function renderRouteTreeCell({
    level = 0,
    hasChildren = false,
    isLast = true,
    continuationLevels = [],
    treeNodeId = "",
    isExpanded = true,
    visual = {},
    content = "",
    className = "",
  } = {}) {
    const safeLevel = Math.min(5, Math.max(0, Number(level || 0)));
    const isPlanningOrderTree = String(className).includes("is-planning-order-");
    if (isPlanningOrderTree) {
      const guides = (Array.isArray(continuationLevels) ? continuationLevels : [])
        .map((continues, guideLevel) => continues ? `<span class="planning-order-tree-line is-ancestor" style="--tree-line-level:${guideLevel};" aria-hidden="true"></span>` : "")
        .join("");
      const incoming = safeLevel > 0 ? `<span class="planning-order-tree-line is-incoming ${isLast ? "is-last" : ""}" aria-hidden="true"></span>` : "";
      const stem = hasChildren && isExpanded ? `<span class="planning-order-tree-line is-child-stem" aria-hidden="true"></span>` : "";
      const toggle = hasChildren
        ? `<button class="planning-order-tree-toggle" type="button" data-planning-order-tree-toggle="${escapeAttribute(treeNodeId)}" aria-label="${isExpanded ? "Свернуть ветвь" : "Развернуть ветвь"}" aria-expanded="${isExpanded ? "true" : "false"}"><i class="planning-order-tree-toggle-mark"></i></button>`
        : "<i></i>";
      return `
        <div class="planning-order-tree-cell ${hasChildren ? "has-children" : ""} ${isLast ? "is-last" : ""} ${escapeAttribute(className)}" style="--planning-tree-level:${safeLevel};">
          <span class="planning-order-tree-gutter"><span class="planning-order-tree-lines" aria-hidden="true">${guides}${incoming}${stem}</span><span class="planning-order-tree-anchor">${toggle}</span></span>
          <div class="planning-order-tree-copy">${content}</div>
        </div>
      `;
    }
    return `
      <div class="speki-tree-cell route-tree-cell ui-tree-cell is-level-${safeLevel} ${hasChildren ? "has-children" : ""} ${isLast ? "is-last" : ""} ${escapeAttribute(className)}">
        ${renderStructureTreeGuides(continuationLevels)}
        <span class="speki-tree-branch" aria-hidden="true"></span>
        <span class="speki-tree-start-dot" aria-hidden="true"></span>
        <div class="speki-tree-object">${content}</div>
      </div>
    `;
  }
  
  function getRouteTaskOperationContinuationLevels(task = {}) {
    return [
      ...(Array.isArray(task.continuationLevels) ? task.continuationLevels : []),
      !task.isLast,
    ];
  }
  
  function getRouteStepTaskOptions(route = null) {
    if (!route?.id) return [];
    const tasks = getRouteTasksForModule(route)
      .filter((task) => !task.isOrphan);
    const concreteTasks = tasks.filter((task) => !task.isMain);
    return concreteTasks.map((task) => ({
        value: task.id,
        label: task.title || "Объект маршрута",
        meta: `${getRouteTaskTypeLabel(task)} · ${getFulfillmentLabel(task.fulfillmentMode || "produce")} · ${task.quantity || 1} ${task.unit || "шт."}`,
    }));
  }
  
  function getRouteStepTaskSelectValue(step = {}, route = null, options = getRouteStepTaskOptions(route)) {
    const currentTaskId = getRouteStepTaskId(step);
    if (options.some((item) => item.value === currentTaskId)) return currentTaskId;
    return options[0]?.value || "";
  }
  
  function getRouteTaskById(route = null, taskId = "") {
    return getRouteTasksForModule(route)
      .find((task) => task.id === taskId)
      || null;
  }
  
  function applyRouteTaskToStep(step = {}, route = null, taskId = "") {
    const task = getRouteTaskById(route, taskId);
    const isMainTask = !task || task.id === MAIN_ROUTE_TASK_ID || task.isMain;
    const nextTaskId = isMainTask ? "" : task.id;
    const quantity = Math.max(1, Number(task?.quantity || 1));
    return normalizeRouteStepCalculationFields({
      ...step,
      specTaskId: nextTaskId,
      specTaskSourceItemId: isMainTask ? "" : task.sourceItemId || "",
      specTaskName: isMainTask ? "" : task.title || "",
      specTaskQuantity: quantity,
      fulfillmentMode: isMainTask ? "produce" : task.fulfillmentMode || "produce",
      quantityMultiplier: quantity,
      bomListId: isMainTask ? "" : task.bomListId || "",
      boardsPerPanel: !isMainTask && task.type === "bom"
        ? getPlanningBoardsPerPanel(route, task.sourceItemId || task.id, task.boardsPerPanel || step.boardsPerPanel || 1)
        : 1,
    }, planningState);
  }
  
  function renderRouteStepsEditor(route, steps) {
    if (!route) {
      return `
        <div class="route-module-empty">
          ${icon("info")}
          <strong>Карта еще не сохранена</strong>
          <span>Сохраните карточку маршрута, чтобы открыть редактирование операций.</span>
        </div>
      `;
    }
  
    const orderedSteps = getRouteStepsForModule(route.id);
    const tasks = getRouteTasksForModule(route);
    const hasRows = tasks.length;
  
    return `
      <div class="route-step-editor-shell route-object-editor-shell">
        ${hasRows ? renderRouteObjectRows(route, tasks, orderedSteps) : `
          <div class="route-module-empty">
            ${icon("info")}
            <strong>Объекты маршрута не найдены</strong>
            <span>Сохраните связь с изделием или платой, чтобы добавить операции к объектам маршрута.</span>
          </div>
        `}
      </div>
    `;
  }
  
  function getRouteTaskEditorSteps(route, task, steps = []) {
    return getRouteStepsForTask(steps, task?.id || "");
  }
  
  function renderRouteObjectRows(route, tasks, steps = []) {
    const canAddOperation = getRouteInstructionWorkCenters({ includeWarehouse: false }).length > 0;
    const canAddWarehouse = Boolean(getDefaultOperationMapItemForRouteKind("warehouse"));
    const routeQuantity = normalizeQuantity(getPlanningRouteQuantity(route), 1);
    return renderUiTableWrap({
      className: "speki-structure-table-wrap route-object-table-wrap ui-document-tree-table-wrap",
      body: `
        <table class="directory-table speki-structure-table route-object-table ui-table ui-document-tree-table">
          <colgroup>
            <col class="route-object-col-index" />
            <col class="route-object-col-name" />
            <col class="route-object-col-ratio" />
            <col class="route-object-col-physical" />
            <col class="route-object-col-unit" />
            <col class="route-object-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>П/п</th>
              <th>Объект / операция</th>
              <th>Коэф.</th>
              <th>Физ. кол-во</th>
              <th>Ед. изм.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map((task) => {
              const taskSteps = getRouteTaskEditorSteps(route, task, steps);
              const taskTypeVisual = getRouteTaskTypeVisual(task);
              const taskDisplayNumber = task.number === "00" ? "1" : task.number || "1";
              const taskQuantity = Math.max(1, Number(task.quantity || 1));
              const taskPhysicalQuantity = Math.max(1, Math.round(routeQuantity * taskQuantity));
              const taskUnit = task.unit || (task.type === "bom" ? "плата" : "шт.");
              const taskObjectContent = `
                <div class="route-object-name-cell">
                  <strong title="${escapeAttribute(task.title || "Объект маршрута")}">${escapeHtml(task.title || "Объект маршрута")}</strong>
                  <small>${escapeHtml([task.parentTitle, task.departmentName].filter(Boolean).join(" · ") || task.operationName || "Маршрутная карта")}</small>
                  ${renderRouteTaskOutputHint(route, task)}
                </div>
              `;
              return `
                <tr class="ui-table-row route-object-row ${task.isMain ? "is-route-main" : ""} ${task.isOrphan ? "is-route-orphan" : ""}" data-route-task-row="${escapeAttribute(task.id)}" style="--speki-level: ${Number(task.level || 0)};">
                  <td><span class="speki-row-number">${escapeHtml(taskDisplayNumber)}</span></td>
                  <td>${renderRouteTreeCell({
                    level: Number(task.level || 0),
                    hasChildren: Boolean(task.hasChildren || taskSteps.length),
                    isLast: task.isLast !== false,
                    continuationLevels: task.continuationLevels || [],
                    visual: taskTypeVisual,
                    content: taskObjectContent,
                    className: "is-route-object",
                  })}</td>
                  <td><span class="speki-static-cell route-step-ratio-cell" title="Коэффициент объекта относительно одного изделия">x${escapeHtml(formatReportNumber(taskQuantity))}</span></td>
                  <td><span class="speki-static-cell route-step-physical-cell" title="Физическое количество = количество изделий маршрутной карты × коэффициент объекта">${escapeHtml(formatReportNumber(taskPhysicalQuantity))}</span></td>
                  <td><span class="speki-static-cell route-step-unit-cell" title="Единица измерения физического объекта">${escapeHtml(taskUnit)}</span></td>
                  <td>
                    <div class="route-object-actions">
                      ${renderUiActionButton({ label: "Операция", iconName: "plus", className: "route-object-add-button", attributes: `data-route-add-step-task="${escapeAttribute(task.id)}" data-route-add-step-kind="operation" type="button" ${canAddOperation && !task.isOrphan ? "" : "disabled"}` })}
                      ${renderUiActionButton({ label: "Приемка", iconName: "package", className: "route-object-add-button", attributes: `data-route-add-step-task="${escapeAttribute(task.id)}" data-route-add-step-kind="warehouse" type="button" ${canAddWarehouse && !task.isOrphan ? "" : "disabled"}` })}
                    </div>
                  </td>
                </tr>
                ${taskSteps.length ? taskSteps.map((step, index) => renderRouteStepTableRow(route, task, step, index, taskSteps, {
                  continuationLevels: getRouteTaskOperationContinuationLevels(task),
                  isLast: index === taskSteps.length - 1,
                })).join("") : `
                  <tr class="ui-table-row route-object-operation-row is-empty" style="--speki-level: ${Number(task.level || 0) + 1};">
                    <td colspan="6">
                      <div class="route-task-empty">${icon("info")}<span>Для этого объекта операции еще не заданы</span></div>
                    </td>
                  </tr>
                `}
              `;
            }).join("")}
          </tbody>
        </table>
      `,
    });
  }
  
  function renderRouteStepTableRow(route, task, step, index, taskSteps = [], treeOptions = {}) {
    const workCenterOptions = getRouteStepWorkCenterOptions(step);
    const workCenterValue = getRouteStepWorkCenterSelectValue(step, workCenterOptions);
    const operationOptions = getRouteStepOperationOptions(step);
    const operationValue = getRouteStepOperationSelectValue(step, operationOptions);
    const operation = getOperationMapItem(step.operationId);
    const hasWorkCenter = Boolean(getWorkCenter(workCenterValue));
    const hasValidOperation = Boolean(operation && getOperationRouteWorkCenterId(operation) === workCenterValue);
    const isWarehouse = isManufacturingOutputReceiptRouteStep(step);
    const multiplier = getRouteStepEffectiveQuantityMultiplier(step, route);
    const routeQuantity = normalizeQuantity(getPlanningRouteQuantity(route), 1);
    const physicalQuantity = Math.max(1, Math.round(routeQuantity * multiplier));
    const unit = task?.unit || (task?.type === "bom" ? "плата" : "шт.");
    const level = Number.isFinite(Number(treeOptions.level))
      ? Number(treeOptions.level)
      : Number(task?.level || 0) + 1;
    const stepTypeVisual = getRouteStepTypeVisual(step);
    const stepFieldsContent = `
      <div class="route-step-compact-fields">
        <label class="form-field route-step-center ui-form-field">
          <span>Отдел</span>
          ${renderDenseInlineSelect("workCenterId", workCenterValue, workCenterOptions, { type: "routeStep", stepId: step.id })}
        </label>
        <label class="form-field route-step-name ui-form-field">
          <span>Операция</span>
          ${renderDenseInlineSelect("operationId", operationValue, operationOptions, { type: "routeStep", stepId: step.id, disabled: !hasWorkCenter })}
        </label>
      </div>
    `;
  
    return `
      <tr class="ui-table-row route-step-compact-row ${isWarehouse ? "is-warehouse" : ""} ${hasWorkCenter && hasValidOperation ? "" : "is-incomplete"}" data-route-step-row="${escapeAttribute(step.id)}" style="--speki-level: ${level};">
        <td>
          <div class="route-step-compact-order">
            <span class="route-step-order-plain" title="Позиция операции в объекте маршрута" aria-label="Позиция операции в объекте маршрута">${index + 1}</span>
          </div>
        </td>
        <td>${renderRouteTreeCell({
          level,
          hasChildren: false,
          isLast: treeOptions.isLast !== false,
          continuationLevels: treeOptions.continuationLevels || [],
          visual: stepTypeVisual,
          content: stepFieldsContent,
          className: `is-route-step ${treeOptions.isRootStep ? "is-route-root-step" : ""}`,
        })}</td>
        <td><span class="speki-static-cell route-step-ratio-cell" title="Коэффициент операции относительно одного изделия">x${escapeHtml(formatReportNumber(multiplier))}</span></td>
        <td><span class="speki-static-cell route-step-physical-cell" title="Физическое количество = количество изделий маршрутной карты × коэффициент операции">${escapeHtml(formatReportNumber(physicalQuantity))}</span></td>
        <td><span class="speki-static-cell route-step-unit-cell" title="Единица измерения физического объекта">${escapeHtml(unit)}</span></td>
        <td>
          <div class="route-step-compact-actions">
            ${renderUiActionButton({ iconName: "chevronUp", tone: "table-icon", attributes: `data-route-step-up="${escapeAttribute(step.id)}" type="button" title="Поднять" aria-label="Поднять" ${index === 0 ? "disabled" : ""}` })}
            ${renderUiActionButton({ iconName: "chevronDown", tone: "table-icon", attributes: `data-route-step-down="${escapeAttribute(step.id)}" type="button" title="Опустить" aria-label="Опустить" ${index === taskSteps.length - 1 ? "disabled" : ""}` })}
            ${renderRouteStepLaborToggle(step)}
            ${renderRouteStepFlowToggle(step)}
            ${renderUiActionButton({ iconName: "trashSoft", tone: "table-icon", className: "danger-soft route-step-delete-button", attributes: `data-route-step-delete="${escapeAttribute(step.id)}" type="button" title="Удалить операцию" aria-label="Удалить операцию"` })}
          </div>
        </td>
      </tr>
      ${renderRouteStepLaborPanelRow(route, step, level)}
      ${renderRouteStepFlowPanelRow(route, step, level)}
    `;
  }
  
  function renderRouteStepRows(steps, options = {}) {
    return `
      <div class="route-step-editor-list">
        ${steps.map((step, index) => {
          const route = getRouteForStep(step);
          const taskOptions = getRouteStepTaskOptions(route);
          const showTaskSelect = !options.hideTaskSelect && taskOptions.length > 1;
          const taskValue = getRouteStepTaskSelectValue(step, route, taskOptions);
          const workCenterOptions = getRouteStepWorkCenterOptions(step);
          const workCenterValue = getRouteStepWorkCenterSelectValue(step, workCenterOptions);
          const operationOptions = getRouteStepOperationOptions(step);
          const operationValue = getRouteStepOperationSelectValue(step, operationOptions);
          const operation = getOperationMapItem(step.operationId);
          const hasWorkCenter = Boolean(getWorkCenter(workCenterValue));
          const hasValidOperation = Boolean(operation && getOperationRouteWorkCenterId(operation) === workCenterValue);
          return `
            <article class="route-step-editor-row ${showTaskSelect ? "has-task-target" : ""} ${isManufacturingOutputReceiptRouteStep(step) ? "is-warehouse" : ""} ${hasWorkCenter && hasValidOperation ? "" : "is-incomplete"}" data-route-step-row="${step.id}">
              <div class="route-step-index">
                ${renderUiActionButton({ iconName: "chevronUp", tone: "table-icon", attributes: `data-route-step-up="${escapeAttribute(step.id)}" type="button" title="Поднять" aria-label="Поднять" ${index === 0 ? "disabled" : ""}` })}
                <span class="route-step-order-badge" title="Позиция в общем списке операций" aria-label="Позиция в общем списке операций">${index + 1}</span>
                ${renderUiActionButton({ iconName: "chevronDown", tone: "table-icon", attributes: `data-route-step-down="${escapeAttribute(step.id)}" type="button" title="Опустить" aria-label="Опустить" ${index === steps.length - 1 ? "disabled" : ""}` })}
              </div>
              ${showTaskSelect ? `
              <label class="form-field route-step-task ui-form-field">
                <span>Объект</span>
                ${renderDenseInlineSelect("specTaskId", taskValue, taskOptions, { type: "routeStep", stepId: step.id })}
              </label>
              ` : ""}
              <label class="form-field route-step-center ui-form-field">
                <span>Отдел</span>
                ${renderDenseInlineSelect("workCenterId", workCenterValue, workCenterOptions, { type: "routeStep", stepId: step.id })}
              </label>
  	            <label class="form-field route-step-name ui-form-field">
  	              <span>Операция</span>
  	              ${renderDenseInlineSelect("operationId", operationValue, operationOptions, { type: "routeStep", stepId: step.id, disabled: !hasWorkCenter })}
  	            </label>
	            ${renderUiActionButton({ iconName: "trashSoft", tone: "table-icon", className: "danger-soft route-step-delete-button", attributes: `data-route-step-delete="${escapeAttribute(step.id)}" type="button" title="Удалить операцию" aria-label="Удалить операцию"` })}
  	            ${renderRouteStepFlowEditor(route, step)}
  	          </article>
  	        `;
        }).join("")}
      </div>
    `;
  }
  
  function getRouteStepOperationSelectValue(step, options = getRouteStepOperationOptions(step)) {
    if (step.operationId && options.some((item) => item.value === step.operationId)) return step.operationId;
    return "";
  }
  
  function getRouteStepWorkCenterOptions(step = {}) {
    const options = [
      { value: "", label: "Отдел не выбран" },
      ...getRouteInstructionWorkCenters().map((center) => ({
        value: center.id,
        label: center.name || "Отдел без названия",
      })),
    ];
    const hasCurrent = !step.workCenterId || options.some((item) => item.value === step.workCenterId);
    if (!hasCurrent) {
      options.push({
        value: step.workCenterId,
        label: getWorkCenter(step.workCenterId)?.name || "Отдел не найден",
      });
    }
    return options;
  }
  
  function getRouteStepWorkCenterSelectValue(step, options = getRouteStepWorkCenterOptions(step)) {
    if (step.workCenterId && options.some((item) => item.value === step.workCenterId)) return step.workCenterId;
    return "";
  }
  
  function getRouteStepOperationOptions(step = {}) {
    const workCenterId = getRouteStepWorkCenterSelectValue(step);
    if (!workCenterId) {
      return [{
        value: "",
        label: "Сначала выберите отдел",
        disabled: true,
      }];
    }
  
    const matchingOperations = getOperationMapRows({ includeInactive: false })
      .filter((operation) => !operation.legacyAliasOf)
      .filter((operation) => operation.coverage !== "blocked")
      .filter((operation) => getOperationRouteWorkCenterId(operation) === workCenterId)
      .map((operation) => {
      return {
        value: operation.id,
        label: operation.name || "Операция без названия",
      };
    });
  
    if (!matchingOperations.length) {
      return [{
        value: "",
        label: "Операция не выбрана",
        disabled: true,
      }];
    }
  
    const operations = [...matchingOperations];
    if (!step.operationId || !operations.some((item) => item.value === step.operationId)) {
      operations.unshift({
        value: "",
        label: "Операция не выбрана",
        disabled: true,
      });
    }
    return operations;
  }
  
  function getRouteStepPlanningLineOptions(step = {}) {
    const candidates = getRouteStepPlanningCandidateWorkCenterIds(step, planningState);
    const options = [
      { value: "", label: "SMT-участок не выбран", meta: candidates.length > 1 ? "выберите перед передачей в Гант" : "нет кандидатов" },
    ];
    candidates.forEach((workCenterId) => {
      const center = getWorkCenter(workCenterId);
      const line = getSmtLineConfigurationForPlanningWorkCenter(workCenterId);
      const rate = Number(getResourceBaseCph(line) || getWorkCenterUnitsPerHour(workCenterId, planningState) || 0);
      options.push({
        value: workCenterId,
        label: center?.name || line?.name || workCenterId,
        meta: rate ? `${rate.toLocaleString("ru-RU")} комп./ч` : center?.code || "линия",
      });
    });
    return options;
  }
  
  function getSmtLineConfigurationForPlanningWorkCenter(workCenterId = "") {
    const normalizedId = mapLegacyWorkCenterId(workCenterId);
    if (!normalizedId) return null;
    return getSmtLineConfigurations().find((line) => (
      line.id === normalizedId
      || line.workCenterId === normalizedId
      || getProductionResourceWorkCenterId(line) === normalizedId
    )) || null;
  }
  
  function renderDirectoryPage() {
    const visibleSections = getVisibleDirectorySections();
    const visibleGroups = getVisibleDirectoryGroups(visibleSections);
    const activeSection = visibleSections.find((section) => section.id === ui.activeDirectory) || visibleSections[0];
    if (activeSection && activeSection.id !== ui.activeDirectory) ui.activeDirectory = activeSection.id;
    const directoryData = getDirectoryData(activeSection.id);
    const isStatusDirectory = activeSection.id === "statuses";
    const pageClass = isStatusDirectory
      ? "directories-page directories-status-page"
      : "directories-page";
    const workspaceClass = isStatusDirectory
      ? "directory-status-workspace"
      : "";
    const contentClass = isStatusDirectory
      ? "directory-content directory-status-content"
      : "directory-content";
    const tableCardClass = isStatusDirectory
      ? "directory-table-card directory-status-table-card"
      : "directory-table-card";
  
    return `
      ${renderUiModulePage({
        ariaLabel: "Справочники и нормативы MES",
        className: pageClass,
        workspaceClassName: workspaceClass,
        contentClassName: contentClass,
        sidebar: renderUiModuleSidebar({
          eyebrow: "Мастер-данные",
          title: "Справочники",
          variant: "grouped",
          body: `
          <div class="ui-sidebar-list directory-nav">
            ${visibleGroups.map((group) => `
              <section class="directory-nav-group">
                <div class="ui-sidebar-label directory-nav-group-head">
                  <span>${escapeHtml(group.label)}</span>
                </div>
                <div class="directory-nav-group-items">
                  ${group.sections.map((section) => renderUiSidebarItem({
                    title: section.label,
                    badge: String(section.count()),
                    active: section.id === activeSection.id,
                    className: "directory-nav-item",
                    attributes: `data-directory-id="${escapeAttribute(section.id)}" type="button"`,
                  })).join("")}
                </div>
              </section>
            `).join("")}
          </div>
          `,
        }),
        header: renderUiModuleHeader({
          eyebrow: "Справочники и нормативы",
          title: activeSection.label,
          description: `${activeSection.description} Раздел общего контура справочников и нормативов MES.`,
          actions: `
            ${renderUiActionButton({ label: "Обновить", iconName: "refresh", attributes: "data-directory-refresh type=\"button\"" })}
            ${renderUiActionButton({ label: "Сбросить фильтры", iconName: "filter", attributes: `data-directory-clear-filters type="button" ${directoryData.activeFilterCount ? "" : "disabled"}` })}
            ${directoryData.readOnly ? renderUiStatusToken("Системный контракт · только чтение", "neutral") : `
              ${renderUiActionButton({ label: "Удалить выбранное", iconName: "trash", tone: "danger", attributes: `data-delete-directory-selected type="button" ${directoryData.rows.length ? "" : "disabled"}` })}
              ${renderUiActionButton({ label: "Добавить запись", iconName: "plus", tone: "primary", attributes: "data-add-directory type=\"button\"" })}
            `}
          `,
        }),
        content: `
            <section class="${tableCardClass}" data-ui-component="Panel">
              ${renderUiPanelBody({ body: `
              ${renderDirectoryTable(directoryData)}
              ` })}
            </section>
        `,
      })}
        ${renderDirectoryEditorModal(activeSection, directoryData)}
        ${renderDirectoryReaderModal(activeSection, directoryData)}
    `;
  }
  
  
  return {
    getRouteTaskTypeLabel,
    getWorkOrderPrintPackageViewModel,
    renderDirectoryTable,
    renderDirectoryPage,
    renderRoutePrintPreviewModal,
    renderRouteTreeCell,
    renderRoutesPage,
    renderWorkOrderPrintPackageModal,
  };
}
