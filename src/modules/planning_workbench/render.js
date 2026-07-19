import {
  formatPlanningObjectCount,
  formatPlanningOperationCount,
  formatPlanningProblemCount,
} from "../../ui/formatters.js";
import {
  projectServerPlanningRoute,
  projectServerPlanningRoutes,
  projectServerPlanningSteps,
  projectServerPlanningTasks,
} from "./server_projection_adapter.js";

export function createPlanningWorkbenchModule(dependencies = {}) {
  const {
    STRUCTURE_FULFILLMENT_LABELS,
    STRUCTURE_FULFILLMENT_MODES,
    HUMAN_LABOR_RESOURCE_TYPES = new Set(["staff", "workplace", "post"]),
    MACHINE_LABOR_RESOURCE_TYPES = new Set(["aggregate", "line", "machine", "equipment"]),
    WORK_ORDERS_MODULE_LABEL,
    buildPlanningProductionChain,
    escapeAttribute,
    escapeHtml,
    formatDateTimeShort,
    formatDuration,
    formatWarehouseQuantity,
    fromDateInput,
    getActiveRouteForModule,
    getDefaultOperationCalculationType = () => "manual",
    getDomainWorkOrderProjections = () => [],
    getDomainWorkOrderDetail = () => null,
    getFulfillmentMeta,
    getMesFlowTransitionView,
    getPlanningActiveWorkItem,
    getPlanningActiveRouteId = () => "",
    getPlanningFlowReadinessSummary,
    getPlanningOrderLaborKey = (route = {}, step = {}) => `${route?.id || ""}:${step?.id || ""}`,
    getPlanningResourceForRouteStep = () => "",
    getPlanningRouteLaborReadiness,
    getPlanningRouteQuantity,
    getPlanningRouteStartDate,
    getPlanningRouteTransferSummary,
    getPlanningShiftOrdersForRoute = () => [],
    getPlanningState,
    getPlanningStepLineLabel,
    getPlanningStepTone,
    getPlanningSupplyRows,
    getPlanningSupplySummary,
    getPlanningTaskBomLabel = () => "",
    getPlanningTaskOperationStats,
    getPlanningTaskReadiness,
    getPlanningTasksForRoute,
    getPlanningWorkItemId,
    getOperationMapItem = () => null,
    getProductionResource = () => null,
    getRouteDocumentKindLabel,
    getRouteDocumentKindShortLabel,
    getRouteStepLaborSnapshot,
    getRouteStepPlanningTask,
    getRouteStepQuantityForBatch,
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteStepsForModule,
    getRouteTaskTypeLabel,
    getRoutesForModule,
    getResourcesForWorkCenter = () => [],
    getWarehouseBalanceForNomenclature,
    getWorkOrderViewModel,
    getWorkCenter = () => null,
    icon,
    isManufacturingOutputReceiptRouteStep,
    isSmtOperationWorkCenter,
    isWarehouseWorkCenterId = (value = "") => String(value || "").startsWith("D1"),
    mapLegacyWorkCenterId = (value) => value,
    normalizeBoardsPerPanel = (value) => Math.max(1, Number(value || 1) || 1),
    normalizeLookupText = (value = "") => String(value || "").trim().toLowerCase(),
    normalizePlanningOrderLaborByStepId = () => ({}),
    normalizeQuantity,
    parsePlanningWorkItemId,
    renderModulePreviewEmpty,
    renderRouteTreeCell,
    renderRouteTaskOutputHint = () => "",
    renderUiActionButton,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiModuleSidebar,
    renderUiSidebarItem,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableControlAttributes,
    renderUiTableWrap,
    resolveProductionResourceType = (value = "") => String(value || ""),
    routeStepRequiresManualPlanningLine,
    toDate,
  } = dependencies;
  const planningState = new Proxy({}, {
    get(_target, property) {
      return getPlanningState()?.[property];
    },
    set(_target, property, value) {
      const state = getPlanningState();
      if (state) state[property] = value;
      return true;
    },
  });

  function getPlanningWorkbenchModel({ includeOverview = true } = {}) {
    const serverRoutes = getDomainWorkOrderProjections();
    const snapshotRoutes = serverRoutes.length ? [] : getRoutesForModule();
    const routeProjection = projectServerPlanningRoutes(
      serverRoutes,
      snapshotRoutes,
      { preferServer: serverRoutes.length > 0 },
    );
    const routes = routeProjection.routes;
    const activeRouteId = String(getPlanningActiveRouteId() || getActiveRouteForModule()?.id || "");
    const listedRoute = routes.find((route) => route.id === activeRouteId) || routes[0] || null;
    const detail = getDomainWorkOrderDetail(listedRoute?.id || "");
    const activeRoute = detail?.metadata ? projectServerPlanningRoute(detail) : listedRoute;
    const transferSummary = activeRoute && !(routeProjection.exact && !detail)
      ? getPlanningRouteTransferSummary(activeRoute, { includeMultiplicationRows: false })
      : null;
    // The order page needs its route steps, not the full Gantt statistics.
    // The latter also walks every slot and warning in the planning state, which
    // made a module switch needlessly expensive for large orders.
    const snapshotRouteSteps = routeProjection.exact ? [] : getRouteStepsForModule(activeRoute?.id || "");
    const detailProjection = projectServerPlanningSteps(
      detail,
      snapshotRouteSteps,
      { preferServer: routeProjection.exact },
    );
    const routeSteps = detailProjection.steps;
    const detailLoading = Boolean(activeRoute && routeProjection.exact && !detailProjection.exact);
    const projectionSource = routeProjection.exact
      ? (activeRoute ? (detailProjection.exact ? "server" : "server-list") : "server")
      : "snapshot-fallback";
    // When the detail response is complete, derive the small visible task tree
    // from that response too.  Calling the legacy task builder here would pull
    // the full shared planning snapshot back into the critical navigation path.
    const snapshotTasks = detailProjection.source === "server" ? [] : getPlanningTasksForRoute(activeRoute, routeSteps);
    const tasks = detailLoading
      ? []
      : projectServerPlanningTasks(activeRoute, routeSteps, snapshotTasks, {
        preferServer: detailProjection.source === "server",
      });
    const selectedItem = activeRoute ? getPlanningActiveWorkItem(activeRoute, tasks, routeSteps) : "";
    const activeQuantity = activeRoute ? normalizeQuantity(transferSummary?.planningQuantity || activeRoute.planningQuantity || getPlanningRouteQuantity(activeRoute)) : 0;
    const headerDescription = activeRoute
      ? `${getRouteDocumentKindShortLabel(activeRoute)} · ${activeQuantity.toLocaleString("ru-RU")} шт. · ${formatPlanningObjectCount(tasks.length)} · ${formatPlanningOperationCount(routeSteps.length)}`
      : "Выберите заказ-наряд в боковой панели.";
    const queue = routes.map((route) => {
      const workOrderView = getWorkOrderViewModel(route);
      const quantity = workOrderView.quantity || getPlanningRouteQuantity(route);
      return {
        id: String(route.id || ""),
        title: String(workOrderView.queueTitle || route.name || "Заказ-наряд"),
        meta: `${getRouteDocumentKindShortLabel(route)} · ${quantity.toLocaleString("ru-RU")} шт.`,
        operationCount: Math.max(0, Number(route.operationCount || 0)),
        status: { label: String(workOrderView.status?.label || ""), tone: String(workOrderView.status?.tone || "neutral") },
        active: route.id === activeRoute?.id,
      };
    });
    const overview = includeOverview && activeRoute && !detailLoading
      ? getPlanningWorkbenchOverview(activeRoute, transferSummary, tasks, routeSteps, selectedItem)
      : null;
    return {
      routes,
      queue,
      activeRoute,
      activeRouteId: String(activeRoute?.id || ""),
      transferSummary,
      tasks,
      routeSteps,
      selectedItem,
      activeQuantity,
      headerDescription,
      detailLoading,
      projectionSource,
      overview,
    };
  }

  function renderPlanningWorkbenchPage() {
    const model = getPlanningWorkbenchModel({ includeOverview: false });
    const { routes, activeRoute, transferSummary, tasks, routeSteps, selectedItem, activeQuantity, headerDescription, detailLoading, projectionSource } = model;
    if (!routes.length) {
      const emptyDescription = "Нет маршрутных заданий для сборки заказ-наряда.";
      return renderUiModulePage({
        ariaLabel: WORK_ORDERS_MODULE_LABEL,
        className: "planning-page planning-order-page planning-order-empty is-heroui is-flat-workbench is-route-structure",
        sidebar: renderPlanningWorkbenchQueue(routes, null),
        workspaceClassName: "planning-order-main",
        visualContract: "ops-soft-v1 workbench-sidebar",
        attributes: `data-planning-projection-source="${escapeAttribute(projectionSource)}"`,
        header: renderUiModuleHeader({
          eyebrow: "Планирование",
          title: WORK_ORDERS_MODULE_LABEL,
          description: emptyDescription,
          className: "planning-order-module-header is-compact",
          attributes: `data-visual-qa-target="planning-order-module-header"`,
        }),
        contentClassName: "planning-order-workspace is-empty",
        content: `
          <section class="planning-empty-page">
            <section class="planning-empty-panel" data-ui-component="Panel" data-ui-surface="empty">
              ${renderUiPanelBody({
                className: "planning-empty-panel-body",
                body: `
                  <div class="planning-empty-icon">${icon("calendar")}</div>
                  <div>
                    <h2>${WORK_ORDERS_MODULE_LABEL}</h2>
                    <p>${emptyDescription}</p>
                  </div>
                `,
              })}
            </section>
          </section>
        `,
      });
    }
  
    return renderUiModulePage({
      ariaLabel: WORK_ORDERS_MODULE_LABEL,
      className: "planning-page planning-order-page is-heroui is-flat-workbench is-route-structure",
      sidebar: renderPlanningWorkbenchQueue(routes, activeRoute),
      workspaceClassName: "planning-order-main",
      visualContract: "ops-soft-v1 workbench-sidebar",
      attributes: `data-planning-active-route-id="${escapeAttribute(activeRoute?.id || "")}" data-planning-projection-source="${escapeAttribute(projectionSource)}"`,
      header: renderUiModuleHeader({
        eyebrow: "Планирование",
        title: WORK_ORDERS_MODULE_LABEL,
        description: headerDescription,
        className: "planning-order-module-header is-compact",
        attributes: `data-visual-qa-target="planning-order-module-header"`,
      }),
      contentClassName: "planning-order-workspace",
      content: activeRoute ? `
            <section class="planning-order-main-grid" data-visual-qa-target="planning-order-main-grid">
              ${detailLoading ? renderModulePreviewEmpty({
                iconName: "calendar",
                title: "Загружаем состав заказ-наряда",
                text: "Список заказ-нарядов уже получен с сервера. Загружаем операции выбранного заказа.",
              }) : renderPlanningWorkbenchRouteMap(activeRoute, transferSummary, tasks, routeSteps, selectedItem)}
            </section>
          ` : `
            ${renderUiPanel({
              className: "planning-order-route-map",
              body: renderUiPanelBody({ body: `
              ${renderModulePreviewEmpty({
                iconName: "calendar",
                title: "Заказ-наряд не выбран",
                text: "Выберите заказ-наряд в сайдбаре слева.",
              })}
              ` }),
            })}
          `,
    });
  }
  
  function renderPlanningWorkbenchRouteStrip(routes, activeRoute) {
    return `
      <section class="planning-order-route-strip" data-visual-qa-target="planning-work-order-route-strip" aria-label="Заказ-наряды">
        ${routes.map((route) => {
          const workOrderView = getWorkOrderViewModel(route);
          const state = workOrderView.status;
          const quantity = workOrderView.quantity || getPlanningRouteQuantity(route);
          return `
            <button
              class="planning-order-route-chip ${route.id === activeRoute?.id ? "is-active" : ""}"
              data-ui-component="ActionButton"
              data-planning-route-open="${escapeAttribute(route.id)}"
              type="button"
            >
              <span>
                <strong>${escapeHtml(workOrderView.queueTitle)}</strong>
                <small>${escapeHtml(getRouteDocumentKindShortLabel(route))} · ${quantity.toLocaleString("ru-RU")} шт.</small>
              </span>
              ${renderUiStatusToken(state.label, state.tone)}
            </button>
          `;
        }).join("")}
      </section>
    `;
  }
  
  function renderPlanningWorkbenchQueue(routes, activeRoute) {
    return renderUiModuleSidebar({
      eyebrow: "Планирование",
      title: "Заказ-наряды",
      variant: "queue",
      className: "planning-order-queue",
      attributes: `data-visual-qa-target="planning-work-order-sidebar" aria-label="Список заказ-нарядов"`,
      body: `
        <div class="ui-sidebar-list planning-order-route-list">
          <div class="ui-sidebar-label">${routes.length.toLocaleString("ru-RU")} заказ-нарядов</div>
          ${routes.map((route) => {
            const workOrderView = getWorkOrderViewModel(route);
            const state = workOrderView.status;
            const quantity = workOrderView.quantity || getPlanningRouteQuantity(route);
            return renderUiSidebarItem({
              title: workOrderView.queueTitle,
              meta: `${getRouteDocumentKindShortLabel(route)} · ${quantity.toLocaleString("ru-RU")} шт.`,
              badge: state.label,
              badgeTone: state.tone,
              badgeFit: "content",
              active: route.id === activeRoute?.id,
              className: "planning-order-route-item",
              attributes: `data-planning-route-open="${escapeAttribute(route.id)}" type="button"`,
            });
          }).join("")}
        </div>
      `,
    });
  }
  
  function renderPlanningWorkbenchSelectedDetail(route, transferSummary, tasks, routeSteps, selectedItem) {
    const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
    const parsed = parsePlanningWorkItemId(selectedItem);
    if (parsed.type === "step") {
      const step = routeSteps.find((item) => item.id === parsed.id) || routeSteps[0];
      if (step) return renderPlanningOrderStepDetailPanel(route, step, routeSteps, planningQuantity);
    }
    if (parsed.type === "task") {
      const task = tasks.find((item) => item.id === parsed.id) || tasks.find((item) => item.isMain) || tasks[0];
      if (task) return renderPlanningOrderTaskDetailPanel(route, task, routeSteps, planningQuantity);
    }
    return renderPlanningOrderDecisionDetailPanel(route, transferSummary, tasks, routeSteps, selectedItem);
  }
  
  function renderPlanningOrderTaskDetailPanel(route, task, routeSteps, planningQuantity) {
    const stats = getPlanningTaskOperationStats(route, task, routeSteps);
    const readiness = getPlanningTaskReadiness(task, stats);
    const taskQuantity = normalizeQuantity(task.quantity || 1);
    const orderQuantity = normalizeQuantity(planningQuantity * taskQuantity);
    const taskUnit = /маршрут/i.test(task.unit || "") ? "шт." : task.unit || "шт.";
    const operationRows = stats.steps.slice(0, 6).map((step) => {
      const stepQuantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
      const calc = getPlanningManualStepCalculation(route, step, {
        routeQuantity: planningQuantity,
        quantity: stepQuantity,
      });
      return `
        <article>
          <strong>${escapeHtml(step.operationName || "Операция")}</strong>
          <span>${escapeHtml(getPlanningStepLineLabel(step) || "ресурс не задан")}</span>
          <small>${escapeHtml(calc.durationLabel || "нет оценки")}</small>
        </article>
      `;
    }).join("");
    return renderUiPanel({
      title: task.title || "Объект заказ-наряда",
      meta: "выбранный объект дерева",
      className: "planning-order-detail-panel",
      attributes: `data-visual-qa-target="planning-order-detail-panel"`,
      body: renderUiPanelBody({ body: `
        <section class="planning-order-detail-summary" data-visual-qa-target="planning-order-detail-summary">
          <article><span>Кол-во</span><strong>${orderQuantity.toLocaleString("ru-RU")} ${escapeHtml(taskUnit)}</strong></article>
          <article><span>Операции</span><strong>${stats.steps.length.toLocaleString("ru-RU")}</strong><small>${escapeHtml(readiness.label)}</small></article>
          <article><span>Состояние</span><strong>${escapeHtml(readiness.label)}</strong><small>${escapeHtml(getRouteTaskTypeLabel(task))}</small></article>
        </section>
        <section class="planning-order-detail-list" data-visual-qa-target="planning-order-detail-operations">
          <header><strong>Операции объекта</strong><span>${formatPlanningOperationCount(stats.steps.length)}</span></header>
          ${operationRows || `<p>Для объекта операции не заданы.</p>`}
        </section>
      ` }),
    });
  }
  
  function renderPlanningOrderStepDetailPanel(route, step, routeSteps, planningQuantity) {
    const stepQuantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
    const context = getPlanningOrderStepContext(step, {
      isSmtStep: routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState),
      isManualStep: isManualLaborRouteStep(step),
      isMachineStep: isMachineLaborRouteStep(step),
    });
    const calc = getPlanningManualStepCalculation(route, step, {
      routeQuantity: planningQuantity,
      quantity: stepQuantity,
    });
    const index = routeSteps.findIndex((item) => item.id === step.id);
    const previousStep = index > 0 ? routeSteps[index - 1] : null;
    const nextStep = index >= 0 && index < routeSteps.length - 1 ? routeSteps[index + 1] : null;
    const readinessTone = calc.isConfirmed ? "ok" : "warning";
    const readinessLabel = calc.isConfirmed ? "длительность рассчитана" : "нет расчета";
    const revision = Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0);
    return renderUiPanel({
      title: step.operationName || "Операция",
      meta: `${escapeHtml(getPlanningStepLineLabel(step) || "ресурс не задан")}`,
      className: "planning-order-detail-panel",
      attributes: `data-visual-qa-target="planning-order-detail-panel"`,
      actions: renderUiStatusToken(readinessLabel, readinessTone),
      body: renderUiPanelBody({ body: `
        <section class="planning-order-detail-summary" data-visual-qa-target="planning-order-detail-summary">
          <article><span>Кол-во</span><strong>${Number(stepQuantity || 0).toLocaleString("ru-RU")} шт.</strong></article>
          <article><span>Контекст</span><strong>${escapeHtml(context.label)}</strong><small>${escapeHtml(context.caption)}</small></article>
          <article><span>Длительность</span><strong>${escapeHtml(calc.durationLabel)}</strong><small>${escapeHtml(calc.sourceLabel)}</small></article>
        </section>
        <section class="planning-order-detail-labor" data-visual-qa-target="planning-order-detail-duration">
          <header><strong>Плановая длительность</strong><span>${revision ? `зафиксирована в ревизии ${revision}` : "рассчитана по маршрутной карте"}</span></header>
          <div class="planning-machine-labor-cell">
            <span>Расчет для заказ-наряда</span>
            <strong>${escapeHtml(calc.durationLabel)}</strong>
            <small>${escapeHtml(calc.sourceLabel)}</small>
          </div>
        </section>
        <section class="planning-order-detail-transfer" data-visual-qa-target="planning-order-detail-transfer">
          <article><span>До</span><strong>${escapeHtml(previousStep?.operationName || "старт")}</strong><small>${escapeHtml(previousStep ? getPlanningStepLineLabel(previousStep) : "начало маршрута")}</small></article>
          <span class="planning-order-detail-transfer-link" aria-hidden="true"></span>
          <article class="is-current"><span>Сейчас</span><strong>${escapeHtml(step.operationName || "Операция")}</strong><small>${escapeHtml(getPlanningStepLineLabel(step) || "текущий шаг")}</small></article>
          <span class="planning-order-detail-transfer-link" aria-hidden="true"></span>
          <article><span>После</span><strong>${escapeHtml(nextStep?.operationName || "финиш")}</strong><small>${escapeHtml(nextStep ? getPlanningStepLineLabel(nextStep) : "конец маршрута")}</small></article>
        </section>
      ` }),
    });
  }

  function renderPlanningLaborReadinessDetail(route, transferSummary, routeSteps) {
    const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route), 1);
    const readiness = getPlanningRouteLaborReadiness(route, routeSteps);
    const missingRows = readiness.missingSteps.map((step) => {
      const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
      const context = getPlanningOrderStepContext(step, {
        isSmtStep: routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState),
        isManualStep: isManualLaborRouteStep(step),
        isMachineStep: isMachineLaborRouteStep(step),
      });
      return `
        <div class="planning-order-register-row is-warning" role="row">
          <span>${escapeHtml(step.operationName || "Операция")}</span>
          <span>${escapeHtml(context.label)}</span>
          <span>${Number(quantity || 0).toLocaleString("ru-RU")} шт.</span>
          <span>нет оценки</span>
        </div>
      `;
    }).join("");

    return renderUiPanel({
      title: "Трудозатраты заказ-наряда",
      meta: "обязательный расчетный слой перед передачей в Гант",
      className: "planning-work-detail-panel",
      actions: renderUiStatusToken(readiness.label, readiness.tone, "planning-section-tag"),
      body: renderUiPanelBody({ body: `
        <div class="planning-work-detail-grid">
          <article class="planning-work-metric">
            <span>Подтверждено</span>
            <strong>${Number(readiness.confirmed || 0).toLocaleString("ru-RU")}</strong>
            <small>из ${formatPlanningOperationCount(readiness.total || 0)}</small>
          </article>
          <article class="planning-work-metric">
            <span>Не заполнено</span>
            <strong>${Number(readiness.missing || 0).toLocaleString("ru-RU")}</strong>
            <small>блокирует передачу в Гант</small>
          </article>
        </div>
        ${readiness.missing ? `
          <div class="planning-order-register-table ui-table-wrap" data-layout="table" data-scroll-contract="horizontal-only" data-ui-component="TableWrap" role="table" aria-label="Операции без оценки трудозатрат">
            <div class="planning-order-register-row is-head" role="row">
              <span>Операция</span>
              <span>Контекст</span>
              <span>Кол-во</span>
              <span>Состояние</span>
            </div>
            ${missingRows}
          </div>
        ` : `
          <div class="planning-muted-state">
            ${icon("check")}
            <span>Все операции заказ-наряда имеют подтвержденные трудозатраты.</span>
          </div>
        `}
      ` }),
    });
  }
  
  function renderPlanningOrderDecisionDetailPanel(route, transferSummary, tasks, routeSteps, selectedItem) {
    const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
    const supplySummary = getPlanningSupplySummary(route, transferSummary, routeSteps);
    const chain = buildPlanningProductionChain(route, transferSummary, tasks, routeSteps);
    const laborReadiness = getPlanningRouteLaborReadiness(route, routeSteps);
    const shiftOrders = getPlanningShiftOrdersForRoute(route, routeSteps);
    const expected = Number(transferSummary?.expected || 0);
    const planned = Number(transferSummary?.planned || 0);
    const missing = Math.max(0, expected - planned);
    const metrics = [
      ["Состав", supplySummary.blocking ? formatPlanningProblemCount(supplySummary.blocking) : "готово", `${supplySummary.produce} произв. · ${supplySummary.stock} склад`],
      ["Передача", chain.issues.length ? formatPlanningProblemCount(chain.issues.length) : "готово", formatPlanningOperationCount(routeSteps.length)],
      ["Ревизия", Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0) || "—", route?.sourceSpecifications2EntryId ? "Спецификация 2.0" : "маршрутная карта"],
      ["Гант", expected ? `${planned}/${expected}` : "нет", missing ? `${missing} не размещено` : expected ? "размещено" : "после передачи"],
      ["Смены", shiftOrders.length ? shiftOrders.length.toLocaleString("ru-RU") : "нет", shiftOrders.length ? "сформированы" : "после Ганта"],
    ];
    return renderUiPanel({
      title: "Готовность заказ-наряда",
      meta: `${planningQuantity.toLocaleString("ru-RU")} шт. · ${getRouteDocumentKindLabel(route)}`,
      className: "planning-order-detail-panel",
      attributes: `data-visual-qa-target="planning-order-detail-panel"`,
      body: renderUiPanelBody({ body: `
        <section class="planning-order-detail-summary is-decision" data-visual-qa-target="planning-order-detail-summary">
          ${metrics.map(([label, value, meta]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></article>`).join("")}
        </section>
        <section class="planning-order-detail-list" data-visual-qa-target="planning-order-detail-next-actions">
          <header><strong>Что проверить</strong><span>${escapeHtml(selectedItem || "сводка")}</span></header>
          ${laborReadiness.missing ? `<article><strong>Нет расчета длительности</strong><span>${formatPlanningOperationCount(laborReadiness.missing)}</span><small>выпустите новую ревизию в Спецификации 2.0</small></article>` : ""}
          ${chain.issues.length ? `<article><strong>Проверить передачу</strong><span>${formatPlanningProblemCount(chain.issues.length)}</span><small>есть разрыв между операциями</small></article>` : ""}
          ${!expected ? `<article><strong>Передать в планирование</strong><span>Гант еще не создан</span><small>по опубликованной ревизии документа</small></article>` : ""}
          ${!laborReadiness.missing && !chain.issues.length && expected ? `<p>Критичных действий по выбранному заказ-наряду нет.</p>` : ""}
        </section>
      ` }),
    });
  }
  
  function renderPlanningWorkbenchRouteMap(route, transferSummary, tasks, routeSteps, selectedItem) {
    const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
    const supplySummary = getPlanningSupplySummary(route, transferSummary, routeSteps);
    const chain = getPlanningOrderCompactChainStatus(route, tasks, routeSteps, supplySummary);
    const scheduleExpected = Number(transferSummary?.expected || 0);
    const schedulePlanned = Number(transferSummary?.planned || 0);
    const scheduleMissing = Math.max(0, scheduleExpected - schedulePlanned);
    const scheduleTone = scheduleExpected && !scheduleMissing ? "ok" : scheduleExpected ? "warning" : "neutral";
    const scheduleStatus = scheduleExpected && !scheduleMissing ? "готово" : scheduleMissing ? `${scheduleMissing} не размещено` : "подготовить";
    const shiftOrders = getPlanningShiftOrdersForRoute(route, routeSteps);
    const laborReadiness = getPlanningRouteLaborReadiness(route, routeSteps);
  
    return renderUiPanel({
      title: "Дерево заказ-наряда",
      meta: `${planningQuantity.toLocaleString("ru-RU")} шт. · ${formatPlanningObjectCount(tasks.length)} · ${formatPlanningOperationCount(routeSteps.length)} · ${getRouteDocumentKindLabel(route)}`,
      className: "planning-order-route-map planning-order-structure-panel",
      body: renderUiPanelBody({ body: `
        ${renderPlanningOrderDecisionStrip({
          route,
          selectedItem,
          supplySummary,
          transferSummary,
          chain,
          laborReadiness,
          scheduleExpected,
          schedulePlanned,
          scheduleMissing,
          shiftOrders,
          routeSteps,
        })}
  
        ${renderPlanningOrderStructureTable(route, tasks, routeSteps, selectedItem, planningQuantity)}
      ` }),
    });
  }

  function getPlanningOrderCompactChainStatus(route, tasks, routeSteps, supplySummary) {
    const missingLineCount = routeSteps.filter((step) => (
      routeStepRequiresManualPlanningLine(step, planningState)
      && !getRouteStepSelectedPlanningWorkCenterId(step, planningState)
    )).length;
    const mainTask = tasks.find((task) => task.isMain);
    const mainStats = mainTask
      ? getPlanningTaskOperationStats(route, mainTask, routeSteps)
      : { stepsCount: 0 };
    const finalOperationMissing = supplySummary.total > 1 && !mainStats.stepsCount ? 1 : 0;
    // The complete production-chain graph is only needed in its dedicated
    // detail view. The first screen needs only the number of blockers.
    const issueCount = Math.max(0, Number(supplySummary.blocking || 0))
      + missingLineCount
      + finalOperationMissing;
    return { issues: Array.from({ length: issueCount }) };
  }

  function getPlanningWorkbenchOverview(route, transferSummary, tasks, routeSteps, selectedItem) {
    const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
    const supplySummary = getPlanningSupplySummary(route, transferSummary, routeSteps);
    const chain = getPlanningOrderCompactChainStatus(route, tasks, routeSteps, supplySummary);
    const laborReadiness = getPlanningRouteLaborReadiness(route, routeSteps);
    const shiftOrders = getPlanningShiftOrdersForRoute(route, routeSteps);
    const scheduleExpected = Number(transferSummary?.expected || 0);
    const schedulePlanned = Number(transferSummary?.planned || 0);
    const scheduleMissing = Math.max(0, scheduleExpected - schedulePlanned);
    const collapsedTreeIds = new Set((planningState.planningOrderCollapsedTreeIds || []).map(String));
    const rows = [];
    getVisiblePlanningOrderTasks(tasks, collapsedTreeIds).forEach((task) => {
      const stats = getPlanningTaskOperationStats(route, task, routeSteps);
      const readiness = getPlanningTaskReadiness(task, stats);
      const taskItemId = getPlanningWorkItemId("task", task.id);
      const expanded = !collapsedTreeIds.has(String(taskItemId));
      const taskQuantity = normalizeQuantity(task.quantity || 1);
      const taskSteps = stats.steps || [];
      let confirmed = 0;
      let totalDuration = 0;
      if (expanded) taskSteps.forEach((step) => {
        const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
        const calc = getPlanningManualStepCalculation(route, step, { routeQuantity: planningQuantity, quantity });
        if (calc.isConfirmed) confirmed += 1;
        totalDuration += Math.max(0, Number(calc.totalSeconds || 0) * 1000);
      });
      rows.push({
        id: taskItemId,
        kind: "task",
        level: Number(task.level || 0),
        title: String(task.title || "Составная часть"),
        meta: [task.parentTitle, getPlanningTaskBomLabel(task)].filter(Boolean).join(" · ") || getRouteTaskTypeLabel(task),
        labor: expanded ? (totalDuration ? formatDuration(totalDuration) : `${confirmed}/${taskSteps.length}`) : `${taskSteps.length} операций`,
        laborMeta: expanded ? `${taskSteps.length} операций` : "откройте объект",
        context: "объект",
        contextMeta: getRouteTaskTypeLabel(task),
        quantity: normalizeQuantity(planningQuantity * taskQuantity),
        unit: /маршрут/i.test(task.unit || "") ? "шт." : task.unit || "шт.",
        status: { label: String(readiness.label || ""), tone: String(readiness.tone || "neutral") },
        selected: taskItemId === selectedItem,
        expanded,
      });
      if (!expanded) return;
      taskSteps.forEach((step) => {
        const itemId = getPlanningWorkItemId("step", step.id);
        const tone = getPlanningStepTone(step);
        const isSmtStep = routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState);
        const isManualStep = isManualLaborRouteStep(step);
        const context = getPlanningOrderStepContext(step, { isSmtStep, isManualStep, isMachineStep: !isManualStep && isMachineLaborRouteStep(step) });
        const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
        const calc = getPlanningManualStepCalculation(route, step, { routeQuantity: planningQuantity, quantity });
        rows.push({
          id: itemId,
          kind: "step",
          level: Number(task.level || 0) + 1,
          title: String(step.operationName || "Операция"),
          meta: String(getPlanningStepLineLabel(step) || "ресурс не выбран"),
          labor: String(calc.durationLabel || "нет оценки"),
          laborMeta: calc.isConfirmed ? (route?.sourceSpecifications2EntryId ? `ревизия ${Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0)}` : "маршрутная карта") : "нет расчета",
          context: context.label,
          contextMeta: context.caption,
          quantity: Number(quantity || 0),
          unit: "шт.",
          status: { label: tone === "warning" ? "проверьте" : calc.isConfirmed ? "готово" : "нет оценки", tone: tone === "warning" || !calc.isConfirmed ? "warning" : "ok" },
          selected: itemId === selectedItem,
        });
      });
    });
    return {
      planningQuantity,
      decision: getPlanningWorkbenchDecisionModel({ route, supplySummary, chain, laborReadiness, scheduleExpected, schedulePlanned, scheduleMissing, shiftOrders, routeSteps }),
      metrics: [
        { id: "supply", label: "Состав", value: supplySummary.blocking ? formatPlanningProblemCount(supplySummary.blocking) : "готово", meta: `${supplySummary.produce} произв. · ${supplySummary.stock} склад`, tone: supplySummary.blocking ? "warning" : "ok" },
        { id: "chain", label: "Передача", value: chain.issues.length ? formatPlanningProblemCount(chain.issues.length) : "готово", meta: formatPlanningOperationCount(routeSteps.length), tone: chain.issues.length ? "warning" : "ok" },
        { id: "duration", label: "Ревизия", value: Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0) || "—", meta: route?.sourceSpecifications2EntryId ? "Спецификация 2.0" : "маршрутная карта", tone: laborReadiness.tone },
        { id: "schedule", label: "Гант", value: scheduleExpected ? `${schedulePlanned}/${scheduleExpected}` : "нет", meta: scheduleExpected ? (scheduleMissing ? `${scheduleMissing} не размещено` : "размещено") : "после передачи", tone: scheduleExpected && !scheduleMissing ? "ok" : scheduleExpected ? "warning" : "neutral" },
        { id: "shifts", label: "Смены", value: shiftOrders.length ? shiftOrders.length.toLocaleString("ru-RU") : "нет", meta: shiftOrders.length ? "сформированы" : "после Ганта", tone: shiftOrders.length ? "ok" : "neutral" },
      ],
      rows,
    };
  }
  
  function getPlanningLaborNoteKey(route, itemId = "") {
    return `${route?.id || "route"}::${String(itemId || "").trim()}`;
  }
  
  function getPlanningLaborNoteValue(key = "") {
    return normalizePlanningLaborNoteByRow(ui.planningLaborNoteByRow)[key] || "";
  }
  
  function getPlanningLaborNotePlaceholder(durationMs = 0) {
    return durationMs > 0 ? `расчет: ${formatDuration(durationMs)}` : "оценка";
  }
  
  function getPlanningStepLaborNotePlaceholder(route, step, planningQuantity) {
    const snapshot = getRouteStepLaborSnapshot(route, step, { routeQuantity: planningQuantity });
    return getPlanningLaborNotePlaceholder(snapshot.durationMs);
  }
  
  function getPlanningTaskLaborNotePlaceholder(route, steps = [], planningQuantity) {
    const durationMs = steps.reduce((sum, step) => (
      sum + Math.max(0, Number(getRouteStepLaborSnapshot(route, step, { routeQuantity: planningQuantity }).durationMs || 0))
    ), 0);
    return getPlanningLaborNotePlaceholder(durationMs);
  }
  
  function renderPlanningLaborNoteField(key, placeholder) {
    const value = getPlanningLaborNoteValue(key);
    return `
      <label class="planning-labor-note-field" title="Сводная пометка по объекту. Расчетные значения задаются в строках операций.">
        <span>Сводка</span>
        <input
          data-planning-labor-note="${escapeAttribute(key)}"
          type="text"
          value="${escapeAttribute(value)}"
          placeholder="${escapeAttribute(placeholder)}"
          aria-label="Сводная пометка по трудозатратам"
        />
      </label>
    `;
  }
  
  function getProductionResourceType(resource = {}) {
    return resolveProductionResourceType(resource?.type || resource?.resourceType || resource?.kind || "");
  }
  
  function isHumanLaborResource(resource = {}) {
    return HUMAN_LABOR_RESOURCE_TYPES.has(getProductionResourceType(resource));
  }
  
  function isMachineLaborResource(resource = {}) {
    return MACHINE_LABOR_RESOURCE_TYPES.has(getProductionResourceType(resource));
  }
  
  function getRouteStepLaborWorkCenterId(step = {}) {
    return mapLegacyWorkCenterId(
      getRouteStepSelectedPlanningWorkCenterId(step, planningState)
      || step.planningWorkCenterId
      || step.workCenterId
      || ""
    );
  }
  
  function getRouteStepLaborResource(step = {}, workCenterId = "") {
    const resourceId = workCenterId
      ? getPlanningResourceForRouteStep(step, workCenterId, step.resourceId || "")
      : "";
    return resourceId
      ? getProductionResource(resourceId)
        || getResourcesForWorkCenter(workCenterId).find((resource) => resource.id === resourceId)
        || null
      : null;
  }
  
  function hasRouteStepManualLaborHint(step = {}) {
    const text = normalizeLookupText([
      step.operationName,
      step.workCenter,
      step.department,
      step.comment,
    ].filter(Boolean).join(" "));
    if (!text) return false;
    return text.includes("вывод")
      || text.includes("tht")
      || text.includes("ручной монтаж")
      || text.includes("монтаж рэа");
  }
  
  function getRouteStepLaborProfile(step = {}) {
    const workCenterId = getRouteStepLaborWorkCenterId(step);
    const operation = getOperationMapItem(step.operationId);
    const operationContext = {
      ...(operation || {}),
      ...(step || {}),
      workCenterId,
      operationName: step.operationName || operation?.name || "",
    };
    const resources = workCenterId ? getResourcesForWorkCenter(workCenterId) : [];
    const resource = getRouteStepLaborResource(step, workCenterId);
    const calculationType = getDefaultOperationCalculationType(workCenterId, operationContext);
    const isSmt = routeStepRequiresManualPlanningLine(step, planningState)
      || isSmtOperationWorkCenter(workCenterId || step.workCenterId, operationContext, planningState);
    const hasManualHint = hasRouteStepManualLaborHint(step);
    const hasHumanResource = resources.some((item) => isHumanLaborResource(item));
    const hasMachineResource = resources.some((item) => isMachineLaborResource(item));
    const resourceIsHuman = resource ? isHumanLaborResource(resource) : false;
    const resourceIsMachine = resource ? isMachineLaborResource(resource) : false;
    const operationHasEquipment = Array.isArray(operation?.equipmentIds)
      && operation.equipmentIds.length > 0
      && !["not_modeled", "not_required_for_business_operation", "missing", "not_applicable_until_operations_defined"].includes(String(operation?.equipmentStatus || ""));
    const isMachine = isSmt
      || calculationType === "components"
      || resourceIsMachine
      || (!resourceIsHuman && hasMachineResource && !hasHumanResource)
      || (!resourceIsHuman && operationHasEquipment && !hasManualHint);
    const isManual = !isMachine && (
      resourceIsHuman
      || (hasHumanResource && !resourceIsMachine)
      || hasManualHint
      || calculationType === "manual"
    );
  
    return {
      workCenterId,
      resource,
      resources,
      calculationType,
      isSmt,
      isManual,
      isMachine,
      isThroughHole: workCenterId === "D5" || hasManualHint,
    };
  }
  
  function isManualLaborRouteStep(step = {}) {
    return getRouteStepLaborProfile(step).isManual;
  }
  
  function isMachineLaborRouteStep(step = {}) {
    const profile = getRouteStepLaborProfile(step);
    return profile.isMachine && !profile.isManual;
  }
  
  function getPlanningManualLaborContext(step = {}) {
    const profile = getRouteStepLaborProfile(step);
    if (profile.isThroughHole) return { label: "выводной", caption: "ручной монтаж", tone: "tht" };
    return {
      label: "ручная",
      caption: "исполнители",
      tone: "manual",
    };
  }
  
  function getPlanningManualLaborSteps(routeSteps = []) {
    return (routeSteps || []).filter((step) => isManualLaborRouteStep(step));
  }
  
  function formatPlanningLaborInputNumber(value, decimals = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    const scale = 10 ** decimals;
    const rounded = String(Math.round(number * scale) / scale);
    return rounded.includes(".") ? rounded.replace(/0+$/, "").replace(/\.$/, "") : rounded;
  }
  
  function getPlanningLaborDefaultMode(step = {}) {
    const text = normalizeLookupText(`${step.operationName || ""} ${step.comment || ""}`);
    if (isWarehouseWorkCenterId(step.workCenterId)) return "fixed";
    if ([
      "выдач",
      "комплект",
      "прием",
      "приём",
      "поступ",
      "передач",
      "перемещ",
    ].some((token) => text.includes(token))) {
      return "fixed";
    }
    return "unit";
  }
  
  function getPlanningLaborShiftHours(workCenterId = "") {
    const center = getWorkCenter(workCenterId) || getDurationWorkCenter(workCenterId, planningState);
    const explicit = Number(
      center?.shiftHours
      || center?.equipmentHoursPerShift
      || center?.humanHoursPerShift
      || 0,
    );
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
  
    const schedule = normalizeWorkSchedule(center?.workSchedule || center?.shift, isWarehouseWorkCenterId(workCenterId) ? "24/7" : "5/2");
    const range = getTimesheetWorkModeRange(center?.calendarShiftWindow || center?.workMode || center?.shift || "");
    if (range?.start && range?.end) {
      const hours = getTimesheetScheduleHours(schedule, range.start, range.end);
      if (hours > 0) return hours;
    }
  
    return isWarehouseWorkCenterId(workCenterId) ? 24 : 12;
  }
  
  function getPlanningLaborShiftSeconds(workCenterId = "") {
    return Math.max(1, getPlanningLaborShiftHours(workCenterId)) * 60 * 60;
  }
  
  function getPlanningLaborShiftMs(workCenterId = "") {
    return getPlanningLaborShiftSeconds(workCenterId) * 1000;
  }
  
  function getPlanningOrderLaborSettings(route, step, quantity = 1, options = {}) {
    const snapshot = getRouteStepLaborSnapshot(route, step, { quantity });
    const stored = normalizePlanningOrderLaborByStepId(route?.planningLaborByStepId)[step?.id] || {};
    const defaultSeconds = Math.max(1, Math.round(snapshot.secondsPerPanel || (snapshot.unitsPerHour > 0 ? 3600 / snapshot.unitsPerHour : 60)));
    const defaultOperators = Math.max(1, Math.round(
      snapshot.manualCapacity
      || snapshot.resourceCapacity
      || getShiftMasterEmployeesForWorkCenter(snapshot.workCenterId).length
      || 1
    ));
    return {
      mode: stored.mode || getPlanningLaborDefaultMode(step),
      operatorCount: defaultOperators,
      secondsPerUnit: defaultSeconds,
      complexity: 1,
      setupMin: snapshot.setupMin,
      minutesPerUnit: stored.minutesPerUnit || "",
      minutesPerPanel: stored.minutesPerPanel || "",
      fixedMinutes: stored.fixedMinutes || "",
      shiftQuantity: stored.shiftQuantity || "",
    };
  }
  
  function getPlanningManualStepCalculation(route, step, options = {}) {
    const routeQuantity = normalizeQuantity(options.routeQuantity || getPlanningRouteQuantity(route), 1);
    const quantity = normalizeQuantity(options.quantity || getRouteStepQuantityForBatch(step, { quantity: routeQuantity }), routeQuantity);
    const workCenterId = getRouteStepLaborWorkCenterId(step);
    const snapshot = getRouteStepLaborSnapshot(route, step, { quantity });
    const settings = getPlanningOrderLaborSettings(route, step, quantity);
    const operatorCount = Math.max(1, Number(settings.operatorCount || 1));
    const secondsPerUnit = Math.max(1, Number(settings.secondsPerUnit || 1));
    const complexity = Math.max(0.1, Number(settings.complexity || 1));
    const setupSeconds = Math.max(0, Number(settings.setupMin || 0)) * 60;
    const baseProductiveSeconds = quantity * secondsPerUnit * complexity / operatorCount;
    const baseTotalSeconds = Math.max(1, snapshot.durationMs ? snapshot.durationMs / 1000 : setupSeconds + baseProductiveSeconds);
    const boardsPerPanel = normalizeBoardsPerPanel(snapshot.boardsPerPanel || step.boardsPerPanel || 1, 1);
    const panelCount = Math.max(1, Math.ceil(quantity / boardsPerPanel));
    const baseMinutesPerUnit = Math.max(0.001, baseTotalSeconds / Math.max(1, quantity) / 60);
    const baseMinutesPerPanel = Math.max(0.001, baseTotalSeconds / panelCount / 60);
    const baseFixedMinutes = Math.max(0.001, baseTotalSeconds / 60);
    const shiftSeconds = getPlanningLaborShiftSeconds(workCenterId);
    const baseShiftCapacity = Math.max(1, Math.floor(Math.max(1, shiftSeconds - setupSeconds) * operatorCount / (secondsPerUnit * complexity)));
    const mode = ["fixed", "unit", "panel", "shift"].includes(settings.mode)
        ? settings.mode
        : "unit";
    const manualMinutesPerUnit = Number(String(settings.minutesPerUnit ?? "").trim().replace(",", "."));
    const hasManualMinutesPerUnit = Number.isFinite(manualMinutesPerUnit) && manualMinutesPerUnit > 0;
    const manualMinutesPerPanel = Number(String(settings.minutesPerPanel ?? "").trim().replace(",", "."));
    const hasManualMinutesPerPanel = Number.isFinite(manualMinutesPerPanel) && manualMinutesPerPanel > 0;
    const manualFixedMinutes = Number(String(settings.fixedMinutes ?? "").trim().replace(",", "."));
    const hasManualFixedMinutes = Number.isFinite(manualFixedMinutes) && manualFixedMinutes > 0;
    const manualShiftQuantity = Number(String(settings.shiftQuantity ?? "").trim().replace(",", "."));
    const hasManualShiftQuantity = Number.isFinite(manualShiftQuantity) && manualShiftQuantity > 0;
    const plannedShiftQuantity = hasManualShiftQuantity ? Math.max(1, Math.floor(manualShiftQuantity)) : baseShiftCapacity;
    const plannedShiftCount = Math.max(1, Math.ceil(quantity / plannedShiftQuantity));
    const totalSeconds = mode === "fixed"
      ? (hasManualFixedMinutes ? manualFixedMinutes * 60 : baseTotalSeconds)
      : mode === "panel"
        ? (hasManualMinutesPerPanel ? manualMinutesPerPanel * 60 * panelCount : baseTotalSeconds)
        : mode === "shift"
          ? plannedShiftCount * shiftSeconds
        : (hasManualMinutesPerUnit ? manualMinutesPerUnit * 60 * quantity : baseTotalSeconds);
    const panelCapacity = mode === "panel" && hasManualMinutesPerPanel
      ? Math.max(1, Math.floor(shiftSeconds / Math.max(1, manualMinutesPerPanel * 60)))
      : Math.max(1, Math.floor(shiftSeconds / Math.max(1, baseMinutesPerPanel * 60)));
    const shiftCapacity = mode === "fixed"
      ? Math.max(1, quantity)
      : mode === "shift"
        ? plannedShiftQuantity
      : mode === "panel"
        ? Math.max(1, panelCapacity * boardsPerPanel)
        : hasManualMinutesPerUnit
          ? Math.max(1, Math.floor(shiftSeconds / Math.max(1, manualMinutesPerUnit * 60)))
          : baseShiftCapacity;
    const shiftCount = mode === "shift"
      ? plannedShiftCount
      : mode === "fixed" || mode === "panel"
      ? Math.max(1, Math.ceil(totalSeconds / shiftSeconds))
      : Math.max(1, Math.ceil(quantity / shiftCapacity));
    const resources = getResourcesForWorkCenter(workCenterId);
    const hasManualValue = (mode === "fixed" && hasManualFixedMinutes)
      || (mode === "panel" && hasManualMinutesPerPanel)
      || (mode === "shift" && hasManualShiftQuantity)
      || (mode === "unit" && hasManualMinutesPerUnit);
    return {
      quantity,
      workCenterId,
      workCenterLabel: getWorkCenter(workCenterId)?.name || snapshot.workCenterLabel || "ручная операция",
      resourceLabel: snapshot.resourceLabel,
      resources,
      settings,
      mode,
      secondsPerUnit,
      operatorCount,
      complexity,
      setupMin: Number(settings.setupMin || 0),
      shiftSeconds,
      shiftHours: Math.round((shiftSeconds / 3600) * 100) / 100,
      totalSeconds,
      durationLabel: formatDuration(totalSeconds * 1000),
      boardsPerPanel,
      panelCount,
      shiftCapacity,
      shiftCount,
      baseDurationLabel: snapshot.durationLabel || formatDuration(baseTotalSeconds * 1000),
      baseMinutesPerUnit,
      baseMinutesPerUnitLabel: formatPlanningLaborInputNumber(baseMinutesPerUnit, 3),
      baseMinutesPerPanel,
      baseMinutesPerPanelLabel: formatPlanningLaborInputNumber(baseMinutesPerPanel, 2),
      baseFixedMinutes,
      baseFixedMinutesLabel: formatPlanningLaborInputNumber(baseFixedMinutes, 2),
      baseShiftCapacity,
      baseShiftCapacityLabel: formatPlanningLaborInputNumber(baseShiftCapacity, 0),
      minutesPerUnitValue: hasManualMinutesPerUnit ? formatPlanningLaborInputNumber(manualMinutesPerUnit, 3) : "",
      minutesPerUnitPlaceholder: formatPlanningLaborInputNumber(baseMinutesPerUnit, 3),
      minutesPerPanelValue: hasManualMinutesPerPanel ? formatPlanningLaborInputNumber(manualMinutesPerPanel, 2) : "",
      minutesPerPanelPlaceholder: formatPlanningLaborInputNumber(baseMinutesPerPanel, 2),
      fixedMinutesValue: hasManualFixedMinutes ? formatPlanningLaborInputNumber(manualFixedMinutes, 2) : "",
      fixedMinutesPlaceholder: formatPlanningLaborInputNumber(baseFixedMinutes, 2),
      shiftQuantityValue: hasManualShiftQuantity ? formatPlanningLaborInputNumber(manualShiftQuantity, 0) : "",
      shiftQuantityPlaceholder: formatPlanningLaborInputNumber(baseShiftCapacity, 0),
      hasManualMinutesPerUnit,
      hasManualMinutesPerPanel,
      hasManualFixedMinutes,
      hasManualShiftQuantity,
      hasManualValue,
      isConfirmed: hasManualValue,
      panelModeAvailable: boardsPerPanel > 1,
      sourceLabel: mode === "fixed"
        ? "фикс."
        : mode === "panel"
          ? "мин/мульт"
        : mode === "shift"
          ? "смена"
        : hasManualMinutesPerUnit
          ? "мин/ед"
        : snapshot.secondsPerPanel
          ? "параметры операции"
          : snapshot.unitsPerHour
            ? "матрица / операция"
            : "черновой расчет",
    };
  }
  
  function canRouteStepUsePlanningOrderLabor(route, step = {}, options = {}) {
    if (!route?.id || !step?.id) return false;
    if (normalizePlanningOrderLaborByStepId(route.planningLaborByStepId)[step.id]) return true;
    return true;
  }
  
  function getPlanningOrderLaborPlan(route, step = {}, options = {}) {
    if (!canRouteStepUsePlanningOrderLabor(route, step, options)) return null;
    const routeQuantity = normalizeQuantity(options.routeQuantity || getPlanningRouteQuantity(route), 1);
    const quantity = normalizeQuantity(options.quantity || getRouteStepQuantityForBatch(step, { quantity: routeQuantity }), routeQuantity);
    const workCenterId = options.workCenterId || getRouteStepLaborWorkCenterId(step);
    const calc = getPlanningManualStepCalculation(route, step, { quantity, routeQuantity });
    const durationMs = Math.max(MIN_OPERATION_DURATION_MS, Math.ceil(Number(calc.totalSeconds || 0) / 60) * 60 * 1000);
    const mode = calc.mode || "unit";
    const minutesPerUnit = mode === "unit"
      ? normalizePlanningLaborPositiveNumber(calc.minutesPerUnitValue || calc.baseMinutesPerUnit)
      : 0;
    const minutesPerPanel = mode === "panel"
      ? normalizePlanningLaborPositiveNumber(calc.minutesPerPanelValue || calc.baseMinutesPerPanel)
      : 0;
    const fixedMinutes = mode === "fixed"
      ? normalizePlanningLaborPositiveNumber(calc.fixedMinutesValue || calc.baseFixedMinutes)
      : 0;
    const shiftQuantity = mode === "shift"
      ? normalizePlanningLaborPositiveNumber(calc.shiftQuantityValue || calc.baseShiftCapacity)
      : 0;
  
    return {
      source: "work_order",
      sourceLabel: calc.sourceLabel,
      mode,
      durationMs,
      durationLabel: formatDuration(durationMs),
      quantity,
      routeQuantity,
      workCenterId: calc.workCenterId || workCenterId || "",
      boardsPerPanel: normalizeBoardsPerPanel(calc.boardsPerPanel, 1),
      panelCount: Math.max(1, Number(calc.panelCount || 1)),
      shiftCapacity: Math.max(1, Number(calc.shiftCapacity || 1)),
      shiftCount: Math.max(1, Number(calc.shiftCount || 1)),
      shiftMs: Math.max(60 * 60 * 1000, Number(calc.shiftSeconds || 0) * 1000),
      minutesPerUnit,
      minutesPerPanel,
      fixedMinutes,
      shiftQuantity,
    };
  }
  
  function getEmptyPlanningOrderLaborSlotFields() {
    return {
      planningLaborSource: "",
      planningLaborMode: "",
      planningLaborSourceLabel: "",
      planningLaborDurationMs: 0,
      planningLaborDurationLabel: "",
      planningLaborMinutesPerUnit: 0,
      planningLaborMinutesPerPanel: 0,
      planningLaborFixedMinutes: 0,
      planningLaborShiftQuantity: 0,
      planningLaborBoardsPerPanel: 1,
      planningLaborShiftCapacity: 0,
      planningLaborShiftCount: 0,
      planningLaborShiftMs: 0,
    };
  }
  
  function getPlanningOrderLaborSlotFields(route, step = {}, quantity = 1, options = {}) {
    const plan = getPlanningOrderLaborPlan(route, step, {
      ...options,
      quantity,
    });
    if (!plan) return getEmptyPlanningOrderLaborSlotFields();
    const stamp = options.stamp || new Date().toISOString();
    return {
      planningLaborSource: "work_order",
      planningLaborMode: plan.mode,
      planningLaborSourceLabel: plan.sourceLabel || "",
      planningLaborDurationMs: plan.durationMs,
      planningLaborDurationLabel: plan.durationLabel || formatDuration(plan.durationMs),
      planningLaborMinutesPerUnit: plan.minutesPerUnit || 0,
      planningLaborMinutesPerPanel: plan.minutesPerPanel || 0,
      planningLaborFixedMinutes: plan.fixedMinutes || 0,
      planningLaborShiftQuantity: plan.shiftQuantity || 0,
      planningLaborBoardsPerPanel: plan.boardsPerPanel,
      planningLaborShiftCapacity: plan.shiftCapacity || 0,
      planningLaborShiftCount: plan.shiftCount || 0,
      planningLaborShiftMs: plan.shiftMs || 0,
      planningLaborUpdatedAt: stamp,
      planningLaborRevision: 1,
    };
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
  
  function syncPlanningManualLaborToStepSlots(laborKey = "", options = {}) {
    const [routeId, stepId] = String(laborKey || "").split("::");
    if (!routeId || !stepId) return 0;
    const route = (planningState.routes || []).find((item) => item.id === routeId);
    const step = (planningState.routeSteps || []).find((item) => item.id === stepId);
    if (!route || !step) return 0;
  
    const stamp = new Date().toISOString();
    let updatedCount = 0;
    planningState.slots = (planningState.slots || []).map((slot) => {
      if (
        slot.routeStepId !== stepId
        || !slotMatchesPlanningOrder(slot, routeId)
        || slot.locked
        || isGanttSlotCompleted(slot)
      ) {
        return slot;
      }
      const nextSlot = applyPlanningOrderLaborToSlot({
        ...slot,
        updatedAt: stamp,
      }, route, step, slot.quantity || 1, {
        stamp,
        workCenterId: slot.workCenterId || "",
      });
      updatedCount += 1;
      return recalculateSlotEndByQuantity(nextSlot, planningState);
    });
  
    if (updatedCount && options.persist !== false) persistState();
    return updatedCount;
  }
  
  const PLANNING_LABOR_MODE_LABELS = {
    fixed: "фикс.",
    unit: "мин/ед",
    panel: "мин/мульт.",
    shift: "смена",
  };
  
  function getSlotPlanningLaborView(slot = {}) {
    if (slot.planningLaborSource === "work_order") {
      const modeLabel = PLANNING_LABOR_MODE_LABELS[slot.planningLaborMode] || slot.planningLaborMode || "режим";
      const sourceLabel = slot.planningLaborSourceLabel || "заказ-наряд";
      const effectiveDurationMs = calculatePlanningOrderLaborDurationMs(slot, slot.quantity)
        || normalizePlanningLaborPositiveNumber(slot.planningLaborDurationMs);
      const durationLabel = effectiveDurationMs > 0 ? formatDuration(effectiveDurationMs) : slot.planningLaborDurationLabel || "";
      return {
        label: "Заказ-наряд",
        value: [modeLabel, durationLabel].filter(Boolean).join(" · "),
        title: `Плановая трудоемкость из заказ-наряда: ${sourceLabel}`,
      };
    }
  
    return {
      label: "Маршрут / ресурс",
      value: "черновой расчет",
      title: "В слоте нет рабочей трудоемкости заказ-наряда; используется технический fallback для старых данных.",
    };
  }
  
  function renderPlanningOrderLaborInputField(route, step, field, label, value, options = {}) {
    return `
      <label class="planning-manual-inline-field" data-planning-labor-field-shell data-visual-qa-target="planning-manual-labor-input" title="${escapeAttribute(`Настройка трудозатрат заказ-наряда: ${label}`)}">
        <span>${escapeHtml(label)}</span>
        <input
          ${renderUiTableControlAttributes({ variant: "planning-labor", density: "compact" })}
          data-visual-qa-target="planning-manual-labor-input-control"
          data-planning-order-labor="${escapeAttribute(getPlanningOrderLaborKey(route, step))}"
          data-planning-order-labor-field="${escapeAttribute(field)}"
          type="number"
          inputmode="decimal"
          min="${escapeAttribute(options.min ?? 0)}"
          step="${escapeAttribute(options.step ?? 1)}"
          value="${escapeAttribute(value)}"
          placeholder="${escapeAttribute(options.placeholder || "")}"
          aria-label="${escapeAttribute(`Настройка трудозатрат заказ-наряда: ${label}`)}"
        />
      </label>
    `;
  }
  
  function getPlanningManualBoardsPerPanelSourceId(route, step) {
    if (!route?.id || !step?.id) return "";
    const task = getRouteStepPlanningTask(route, step);
    return task?.sourceItemId
      || step.specTaskSourceItemId
      || task?.id
      || step.bomListId
      || "";
  }
  
  function renderPlanningManualInlineModeField(route, step, mode, options = {}) {
    const key = getPlanningOrderLaborKey(route, step);
    return `
      <label class="planning-manual-inline-mode" data-planning-labor-field-shell data-visual-qa-target="planning-manual-labor-mode" title="Режим расчета: фиксированно на операцию, минуты на единицу выпуска, минуты на мультипликацию или план на смену">
        <span>Режим</span>
        <select
          ${renderUiTableControlAttributes({ variant: "planning-labor-mode", density: "compact" })}
          data-visual-qa-target="planning-manual-labor-mode-control"
          data-planning-order-labor="${escapeAttribute(key)}"
          data-planning-order-labor-field="mode"
          aria-label="Режим расчета трудозатрат заказ-наряда"
        >
          <option value="fixed" ${mode === "fixed" ? "selected" : ""}>фикс.</option>
          <option value="unit" ${mode === "unit" ? "selected" : ""}>ед</option>
          <option value="panel" ${mode === "panel" ? "selected" : ""}>мульт.</option>
          <option value="shift" ${mode === "shift" ? "selected" : ""}>смена</option>
        </select>
      </label>
    `;
  }
  
  function renderPlanningManualInlineLaborCell(route, step, options = {}) {
    const routeQuantity = normalizeQuantity(options.routeQuantity || getPlanningRouteQuantity(route), 1);
    const quantity = normalizeQuantity(options.quantity || getRouteStepQuantityForBatch(step, { quantity: routeQuantity }), routeQuantity);
    const calc = getPlanningManualStepCalculation(route, step, { quantity, routeQuantity });
    const isFixedMode = calc.mode === "fixed";
    const isPanelMode = calc.mode === "panel";
    const isShiftMode = calc.mode === "shift";
    const inputLabel = isFixedMode ? "мин" : isPanelMode ? "мин/мульт." : isShiftMode ? "план/см" : "мин/ед";
    const inputField = isFixedMode ? "fixedMinutes" : isPanelMode ? "minutesPerPanel" : isShiftMode ? "shiftQuantity" : "minutesPerUnit";
    const inputValue = isFixedMode ? calc.fixedMinutesValue : isPanelMode ? calc.minutesPerPanelValue : isShiftMode ? calc.shiftQuantityValue : calc.minutesPerUnitValue;
    const inputPlaceholder = isFixedMode ? calc.fixedMinutesPlaceholder : isPanelMode ? calc.minutesPerPanelPlaceholder : isShiftMode ? calc.shiftQuantityPlaceholder : calc.minutesPerUnitPlaceholder;
    const normLabel = isFixedMode ? calc.baseFixedMinutesLabel : isPanelMode ? calc.baseMinutesPerPanelLabel : isShiftMode ? calc.baseShiftCapacityLabel : calc.baseMinutesPerUnitLabel;
    const referenceCaption = isPanelMode ? "Мульт." : "База";
    const referenceLabel = isPanelMode ? `${calc.boardsPerPanel.toLocaleString("ru-RU")} плат/мульт.` : normLabel;
    const boardsPerPanelSourceId = isPanelMode ? getPlanningManualBoardsPerPanelSourceId(route, step) : "";
    const normTitle = isFixedMode
      ? `Базовый расчет: ${calc.baseFixedMinutesLabel} мин на операцию; системная длительность: ${calc.baseDurationLabel}`
      : isPanelMode
        ? `Базовый расчет: ${calc.baseMinutesPerPanelLabel} мин/мультипликацию; мультипликаций: ${calc.panelCount}; плат в мультипликации: ${calc.boardsPerPanel}; системная длительность: ${calc.baseDurationLabel}`
        : isShiftMode
          ? `Базовый расчет: ${calc.baseShiftCapacityLabel} шт./смена; длительность смены ${formatPlanningLaborInputNumber(calc.shiftHours, 2)} ч; расчет от ${calc.quantity.toLocaleString("ru-RU")} шт.; системная длительность: ${calc.baseDurationLabel}`
        : `Базовый расчет: ${calc.baseMinutesPerUnitLabel} мин/ед; системная длительность: ${calc.baseDurationLabel}`;
    const inputMin = isShiftMode ? 1 : 0.001;
    const inputStep = isFixedMode || isShiftMode ? 1 : 0.01;
    const inputControl = renderPlanningOrderLaborInputField(route, step, inputField, inputLabel, inputValue, { min: inputMin, step: inputStep, placeholder: inputPlaceholder });
    const referenceControl = isPanelMode && boardsPerPanelSourceId
      ? `
          <label class="planning-manual-inline-reference is-panel-context is-editable" data-planning-labor-field-shell data-visual-qa-target="planning-manual-bpp" title="${escapeAttribute(normTitle)}">
            <span>${escapeHtml(referenceCaption)}</span>
            <span class="planning-manual-inline-reference-control">
              <input
                ${renderUiTableControlAttributes({ variant: "planning-boards-per-panel", density: "compact" })}
                data-visual-qa-target="planning-manual-bpp-control"
                data-planning-boards-per-panel="${escapeAttribute(boardsPerPanelSourceId)}"
                data-planning-bpp-route="${escapeAttribute(route?.id || "")}"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                value="${escapeAttribute(calc.boardsPerPanel)}"
                aria-label="Плат в мультипликации"
              />
              <strong>плат/мульт.</strong>
            </span>
          </label>
        `
      : `
          <span class="planning-manual-inline-reference ${isPanelMode ? "is-panel-context" : ""}" data-visual-qa-target="planning-manual-reference" title="${escapeAttribute(normTitle)}">
            <span>${escapeHtml(referenceCaption)}</span>
            <strong>${escapeHtml(referenceLabel)}</strong>
          </span>
        `;
    return `
      <div
        class="planning-manual-inline-labor ${options.detailMode ? "is-detail-mode" : ""}"
        data-visual-qa-target="planning-manual-labor"
        title="Трудозатраты заказ-наряда: влияют на плановую длительность Ганта, но не меняют маршрутную карту"
      >
        <div class="planning-manual-inline-head" data-visual-qa-target="planning-manual-labor-summary">
          <span>итого</span>
          <strong>${escapeHtml(calc.durationLabel)}</strong>
        </div>
        <div class="planning-manual-inline-grid" data-visual-qa-target="planning-manual-labor-controls">
          <div class="planning-manual-inline-fields" data-visual-qa-target="planning-manual-labor-fields">
            ${renderPlanningManualInlineModeField(route, step, calc.mode)}
            ${inputControl}
            ${referenceControl}
          </div>
          <div class="planning-manual-inline-result" data-visual-qa-target="planning-manual-labor-result">
            <span>${calc.shiftCapacity.toLocaleString("ru-RU")}/см</span>
            <strong>${calc.shiftCount.toLocaleString("ru-RU")} см</strong>
          </div>
        </div>
      </div>
    `;
  }
  
  function renderPlanningMachineLaborCell(route, step, options = {}) {
    const routeQuantity = normalizeQuantity(options.routeQuantity || getPlanningRouteQuantity(route), 1);
    const quantity = normalizeQuantity(options.quantity || getRouteStepQuantityForBatch(step, { quantity: routeQuantity }), routeQuantity);
    const snapshot = getRouteStepLaborSnapshot(route, step, { quantity, routeQuantity });
    const isSmtStep = options.isSmtStep || routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState);
    return `
      <div
        class="planning-machine-labor-cell"
        title="${escapeAttribute(isSmtStep ? "SMT считается по трудоемкости заказ-наряда, как остальные производственные операции" : "Станочная операция: расчет должен идти через ресурс, норму и производительность")}"
      >
        <span>${escapeHtml(isSmtStep ? "Трудоемкость SMT" : "Расчет ресурса")}</span>
        <strong>${escapeHtml(snapshot.durationLabel)}</strong>
        <small>${escapeHtml(snapshot.resourceLabel || snapshot.workCenterLabel || "ресурс")}</small>
      </div>
    `;
  }
  
  function renderPlanningOrderStructureTable(route, tasks, routeSteps, selectedItem, planningQuantity) {
    if (!tasks.length) {
      return `
        <div class="planning-muted-state">
          ${icon("info")}
          <span>Состав заказ-наряда не найден.</span>
        </div>
      `;
    }
  
    const collapsedTreeIds = new Set((planningState.planningOrderCollapsedTreeIds || []).map(String));
    const visibleTasks = getVisiblePlanningOrderTasks(tasks, collapsedTreeIds);
    return renderUiTableWrap({
      className: "speki-structure-table-wrap route-object-table-wrap planning-order-table-wrap ui-document-tree-table-wrap",
      body: `
        <table class="directory-table speki-structure-table route-object-table planning-order-table ui-table ui-document-tree-table">
          <colgroup>
            <col class="planning-order-col-name" />
            <col class="planning-order-col-labor" />
            <col class="planning-order-col-context" />
            <col class="planning-order-col-quantity" />
            <col class="planning-order-col-state" />
          </colgroup>
          <thead>
            <tr class="ui-table-header">
              <th>Объект / операция</th>
              <th>Плановая длительность</th>
              <th>Контекст</th>
              <th>Кол-во</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            ${visibleTasks.map((task) => renderPlanningOrderTaskRows(route, task, routeSteps, selectedItem, planningQuantity, collapsedTreeIds)).join("")}
          </tbody>
        </table>
      `,
    });
  }

  function getVisiblePlanningOrderTasks(tasks = [], collapsedTreeIds = new Set()) {
    const collapsedAncestors = [];
    return tasks.filter((task) => {
      const level = Math.max(0, Number(task?.level || 0));
      collapsedAncestors.length = level;
      const isHidden = collapsedAncestors.some(Boolean);
      collapsedAncestors[level] = collapsedTreeIds.has(String(getPlanningWorkItemId("task", task.id)));
      return !isHidden;
    });
  }
  
  function renderPlanningOrderTaskLaborSummary(route, task, steps = [], selectedItem, planningQuantity, isExpanded = false) {
    const itemId = getPlanningWorkItemId("task", task.id);
    // The initial work-order view deliberately shows only the object level.
    // Calculating every operation here made opening a large order depend on the
    // whole routing tree. Exact duration is calculated when its object is opened.
    if (!isExpanded) {
      return `<div class="planning-order-labor-summary is-neutral"><span>операции</span><strong>${steps.length}</strong><small>откройте объект</small></div>`;
    }
    const confirmed = steps.reduce((sum, step) => {
      const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
      const calc = getPlanningManualStepCalculation(route, step, { routeQuantity: planningQuantity, quantity });
      return sum + (calc.isConfirmed ? 1 : 0);
    }, 0);
    const tone = steps.length && confirmed === steps.length ? "ok" : steps.length ? "warning" : "neutral";
    const label = steps.length ? `${confirmed}/${steps.length}` : "нет";
    const totalDuration = steps.reduce((sum, step) => {
      const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
      return sum + Math.max(0, Number(getPlanningManualStepCalculation(route, step, { routeQuantity: planningQuantity, quantity }).totalSeconds || 0) * 1000);
    }, 0);
    return `<div class="planning-order-labor-summary is-${escapeAttribute(tone)}"><span>длительность</span><strong>${escapeHtml(totalDuration ? formatDuration(totalDuration) : label)}</strong><small>${escapeHtml(steps.length ? `${steps.length} операций` : "нет операций")}</small></div>`;
  }
  
  function getPlanningLaborModeShortLabel(mode = "") {
    if (mode === "fixed") return "фикс.";
    if (mode === "panel") return "мин/мульт.";
    if (mode === "shift") return "смена";
    if (mode === "unit") return "мин/ед";
    return mode || "режим";
  }
  
  function renderPlanningOrderStepLaborSummary(route, step, itemId, selectedItem, planningQuantity) {
    const quantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
    const calc = getPlanningManualStepCalculation(route, step, { routeQuantity: planningQuantity, quantity });
    const tone = calc.isConfirmed ? "ok" : "warning";
    return `
      <div class="planning-order-labor-summary is-${escapeAttribute(tone)}">
        <span>расчет</span>
        <strong>${escapeHtml(calc.durationLabel)}</strong>
        <small>${escapeHtml(calc.isConfirmed ? (route?.sourceSpecifications2EntryId ? `ревизия ${Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0)}` : "маршрутная карта") : "нет расчета")}</small>
      </div>
    `;
  }

  function getRouteTaskOperationContinuationLevels(task = {}) {
    return [
      ...(Array.isArray(task.continuationLevels) ? task.continuationLevels : []),
      !task.isLast,
    ];
  }

  function renderPlanningOrderTaskRows(route, task, routeSteps, selectedItem, planningQuantity, collapsedTreeIds = new Set()) {
    const stats = getPlanningTaskOperationStats(route, task, routeSteps);
    const readiness = getPlanningTaskReadiness(task, stats);
    const taskQuantity = normalizeQuantity(task.quantity || 1);
    const orderQuantity = normalizeQuantity(planningQuantity * taskQuantity);
    const taskUnit = /маршрут/i.test(task.unit || "") ? "шт." : task.unit || "шт.";
    const taskItemId = getPlanningWorkItemId("task", task.id);
    const isTreeExpanded = !collapsedTreeIds.has(String(taskItemId));
    const taskObjectContent = `
      <div class="route-object-name-cell planning-order-name-cell">
        <strong title="${escapeAttribute(task.title || "Составная часть")}">${escapeHtml(task.title || "Составная часть")}</strong>
        <small>${escapeHtml([task.parentTitle, getPlanningTaskBomLabel(task)].filter(Boolean).join(" · ") || getRouteTaskTypeLabel(task))}</small>
        ${renderRouteTaskOutputHint(route, task)}
      </div>
    `;
  
    return `
      <tr
        class="ui-table-row route-object-row planning-order-object-row ${taskItemId === selectedItem ? "is-selected" : ""} ${task.isMain ? "is-route-main" : ""} ${task.isOrphan ? "is-route-orphan" : ""}"
        data-planning-order-row="${escapeAttribute(taskItemId)}"
        style="--speki-level: ${Number(task.level || 0)};"
      >
        <td>${renderRouteTreeCell({
          level: Number(task.level || 0),
          hasChildren: Boolean(task.hasChildren || stats.steps.length),
          isLast: task.isLast !== false,
          continuationLevels: task.continuationLevels || [],
          treeNodeId: taskItemId,
          isExpanded: isTreeExpanded,
          content: taskObjectContent,
          className: "is-route-object is-planning-order-object",
        })}</td>
        <td>${renderPlanningOrderTaskLaborSummary(route, task, stats.steps, selectedItem, planningQuantity, isTreeExpanded)}</td>
        <td>${renderPlanningOrderContextCell("объект", getRouteTaskTypeLabel(task), "object")}</td>
        <td>
          <span class="speki-static-cell planning-order-quantity">
            <strong>${orderQuantity.toLocaleString("ru-RU")}</strong>
            <small>${escapeHtml(taskUnit)}</small>
          </span>
        </td>
        <td>
          <div class="planning-order-state-cell">
            ${renderUiStatusToken(readiness.label, readiness.tone, "planning-order-state-token")}
          </div>
        </td>
      </tr>
      ${isTreeExpanded && stats.steps.length ? stats.steps.map((step, index) => renderPlanningOrderStepRow(route, task, step, index, stats.steps, selectedItem, planningQuantity, {
        continuationLevels: getRouteTaskOperationContinuationLevels(task),
        isLast: index === stats.steps.length - 1,
      })).join("") : isTreeExpanded ? `
        <tr class="ui-table-row route-object-operation-row planning-order-operation-row is-empty" style="--speki-level: ${Number(task.level || 0) + 1};">
          <td colspan="5">
            <div class="route-task-empty ui-table-empty">${icon("info")}<span>Для этого объекта операции не заданы</span></div>
          </td>
        </tr>
      ` : ""}
    `;
  }
  
  function renderPlanningOrderStepRow(route, task, step, index, taskSteps = [], selectedItem, planningQuantity, treeOptions = {}) {
    const itemId = getPlanningWorkItemId("step", step.id);
    const tone = getPlanningStepTone(step);
    const isSmtStep = routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState);
    const isManualStep = isManualLaborRouteStep(step);
    const isMachineStep = !isManualStep && isMachineLaborRouteStep(step);
    const stepQuantity = getRouteStepQuantityForBatch(step, { quantity: planningQuantity });
    const stepContext = getPlanningOrderStepContext(step, { isSmtStep, isManualStep, isMachineStep });
    const laborCalc = getPlanningManualStepCalculation(route, step, {
      routeQuantity: planningQuantity,
      quantity: stepQuantity,
    });
    const laborCell = renderPlanningOrderStepLaborSummary(route, step, itemId, selectedItem, planningQuantity);
    const stepReadinessTone = tone === "warning" || !laborCalc.isConfirmed ? "warning" : "ok";
    const stepReadinessLabel = tone === "warning"
      ? "проверьте"
      : laborCalc.isConfirmed
        ? "готово"
        : "нет оценки";
    const stepMeta = [
      getPlanningStepLineLabel(step),
    ].filter(Boolean).join(" · ");
    const level = Number.isFinite(Number(treeOptions.level))
      ? Number(treeOptions.level)
      : Number(task?.level || 0) + 1;
    const stepContent = `
      <div class="route-object-name-cell planning-order-name-cell planning-order-step-name">
        <strong title="${escapeAttribute(step.operationName || "Операция")}">${escapeHtml(step.operationName || "Операция")}</strong>
        <small>${escapeHtml(stepMeta || "ресурс не выбран")}</small>
      </div>
    `;
  
    return `
      <tr
        class="ui-table-row route-step-compact-row planning-order-step-row ${itemId === selectedItem ? "is-selected" : ""} ${isManufacturingOutputReceiptRouteStep(step) ? "is-output" : ""} is-${escapeAttribute(tone)}"
        data-planning-order-row="${escapeAttribute(itemId)}"
        style="--speki-level: ${level};"
      >
        <td>${renderRouteTreeCell({
          level,
          hasChildren: false,
          isLast: treeOptions.isLast !== false,
          continuationLevels: treeOptions.continuationLevels || [],
          content: stepContent,
          className: "is-route-step is-planning-order-step",
        })}</td>
        <td>${laborCell}</td>
        <td>${renderPlanningOrderContextCell(stepContext.label, stepContext.caption, stepContext.tone)}</td>
        <td>
          <span class="speki-static-cell planning-order-quantity">
            <strong>${Number(stepQuantity || 0).toLocaleString("ru-RU")}</strong>
            <small>шт.</small>
          </span>
        </td>
        <td>
          <div class="planning-order-state-cell">
            ${renderUiStatusToken(stepReadinessLabel, stepReadinessTone, "planning-order-state-token")}
          </div>
        </td>
      </tr>
    `;
  }
  
  function getPlanningOrderStepContext(step, options = {}) {
    if (options.isSmtStep) return { label: "SMT", caption: "поверхностный", tone: "smt" };
    if (isManufacturingOutputReceiptRouteStep(step)) return { label: "приемка", caption: "склад", tone: "output" };
    if (isWarehouseWorkCenterId(step.workCenterId)) return { label: "склад", caption: "операция", tone: "output" };
    if (options.isManualStep) return getPlanningManualLaborContext(step);
    if (options.isMachineStep) return { label: "станок", caption: "ресурс", tone: "machine" };
    return { label: "маршрут", caption: "операция", tone: "route" };
  }
  
  function renderPlanningOrderContextCell(label, caption = "", tone = "route") {
    return `
      <span class="planning-order-context-cell is-${escapeAttribute(tone)}">
        <strong>${escapeHtml(label)}</strong>
        ${caption ? `<small>${escapeHtml(caption)}</small>` : ""}
      </span>
    `;
  }
  
  function renderPlanningWorkbenchPhase({ id, selectedItem, number, title, meta, status, tone = "neutral" }) {
    return `
      <button class="planning-order-phase is-${escapeAttribute(tone)} ${id === selectedItem ? "is-active" : ""}" data-planning-work-item="${escapeAttribute(id)}" type="button">
        ${number ? `<b>${escapeHtml(number)}</b>` : ""}
        <span>
          <strong>${escapeHtml(title)}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
        </span>
        <em>${escapeHtml(status || "")}</em>
      </button>
    `;
  }
  
  function formatPlanningOrderDateLabel(value = "") {
    const normalized = String(value || "").trim();
    if (!normalized) return "дата не задана";
    const date = toDate(fromDateInput(normalized));
    if (!date || Number.isNaN(date.getTime())) return "дата не задана";
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function getPlanningWorkbenchDecisionModel({ route, supplySummary, chain, laborReadiness, scheduleExpected, scheduleMissing, routeSteps }) {
    const blockers = [];
    if (!routeSteps.length) blockers.push({ id: "schedule", label: "нет операций" });
    if (supplySummary.blocking) blockers.push({ id: "supply", label: `${formatPlanningProblemCount(supplySummary.blocking)} в составе` });
    if (chain.issues.length) blockers.push({ id: "chain", label: `${formatPlanningProblemCount(chain.issues.length)} передачи` });
    if (laborReadiness.missing) blockers.push({ id: "duration", label: `${formatPlanningOperationCount(laborReadiness.missing)} без расчета длительности` });
    const isPlanned = Boolean(scheduleExpected && !scheduleMissing);
    const isReady = !blockers.length;
    return {
      title: isReady ? (isPlanned ? "Заказ-наряд размещен в Ганте" : "Готов к передаче в план") : (isPlanned ? "Размещен, есть проблемы для проверки" : "Не готов к передаче в план"),
      subtitle: isReady ? `Старт первой операции: ${formatPlanningOrderDateLabel(getPlanningRouteStartDate(route))}` : blockers.map((item) => item.label).slice(0, 3).join(" · "),
      tone: isReady ? "ok" : "warning",
      blockers,
      isReady,
      isPlanned,
    };
  }
  
  function renderPlanningOrderDecisionMetric({ id = "", selectedItem = "", label, value, meta = "", tone = "neutral" }) {
    const qaId = `planning-order-decision-${id || "metric"}`;
    const content = `
      <span data-visual-qa-target="${escapeAttribute(`${qaId}-label`)}">${escapeHtml(label || "")}</span>
      <strong data-visual-qa-target="${escapeAttribute(`${qaId}-value`)}">${escapeHtml(value || "")}</strong>
      ${meta ? `<small data-visual-qa-target="${escapeAttribute(`${qaId}-meta`)}">${escapeHtml(meta)}</small>` : ""}
    `;
    const className = `planning-order-decision-metric is-${escapeAttribute(tone)} ${id && id === selectedItem ? "is-active" : ""}`;
    if (!id) return `<span class="${className}" data-visual-qa-target="${escapeAttribute(qaId)}">${content}</span>`;
    return `
      <button class="${className}" data-ui-component="ActionButton" data-planning-work-item="${escapeAttribute(id)}" data-visual-qa-target="${escapeAttribute(qaId)}" type="button">
        ${content}
      </button>
    `;
  }
  
  function renderPlanningOrderDecisionStrip({
    route,
    selectedItem,
    supplySummary,
    transferSummary,
    chain,
    laborReadiness,
    scheduleExpected,
    schedulePlanned,
    scheduleMissing,
    shiftOrders,
    routeSteps,
  }) {
    const planningQuantity = normalizeQuantity(transferSummary?.planningQuantity || getPlanningRouteQuantity(route));
    const decision = getPlanningWorkbenchDecisionModel({ route, supplySummary, chain, laborReadiness, scheduleExpected, scheduleMissing, routeSteps });
    const startDateValue = getPlanningRouteStartDate(route);
    const workOrderView = getWorkOrderViewModel(route, { summary: transferSummary, routeSteps });
    const planningTransition = workOrderView.transitionToPlanning || getMesFlowTransitionView("workOrderToGanttSlot");
    const hasRoute = Boolean(route?.id);
    const canCancel = Boolean(hasRoute && Number(transferSummary?.planned || 0));
    const canSendToPlanning = Boolean(hasRoute && (transferSummary?.steps || []).length);
    const { tone, title, subtitle } = decision;
  
    return `
      <section class="planning-order-decision-strip is-${escapeAttribute(tone)}" data-visual-qa-target="planning-order-decision-strip" aria-label="Сводка готовности заказ-наряда">
        <div class="planning-order-decision-primary" data-visual-qa-target="planning-order-decision-primary">
          <span data-visual-qa-target="planning-order-decision-label">Решение</span>
          <strong data-visual-qa-target="planning-order-decision-title">${escapeHtml(title)}</strong>
          <small data-visual-qa-target="planning-order-decision-meta">${escapeHtml(subtitle || "Проверьте контрольные разделы ниже")}</small>
        </div>
        <div class="planning-order-decision-metrics" data-visual-qa-target="planning-order-decision-metrics">
          ${renderPlanningOrderDecisionMetric({
            id: "supply",
            selectedItem,
            label: "Состав",
            value: supplySummary.blocking ? formatPlanningProblemCount(supplySummary.blocking) : "готово",
            meta: `${supplySummary.produce} произв. · ${supplySummary.stock} склад`,
            tone: supplySummary.blocking ? "warning" : "ok",
          })}
          ${renderPlanningOrderDecisionMetric({
            id: "chain",
            selectedItem,
            label: "Передача",
            value: chain.issues.length ? formatPlanningProblemCount(chain.issues.length) : "готово",
            meta: formatPlanningOperationCount(routeSteps.length),
            tone: chain.issues.length ? "warning" : "ok",
          })}
          ${renderPlanningOrderDecisionMetric({
            id: "duration",
            selectedItem,
            label: "Ревизия",
            value: Number(route?.documentRevisionSnapshot?.specificationRevision || route?.revision || 0) || "—",
            meta: route?.sourceSpecifications2EntryId ? "Спецификация 2.0" : "маршрутная карта",
            tone: laborReadiness.tone,
          })}
          ${renderPlanningOrderDecisionMetric({
            id: "schedule",
            selectedItem,
            label: "Гант",
            value: scheduleExpected ? `${schedulePlanned}/${scheduleExpected}` : "нет",
            meta: scheduleExpected
              ? scheduleMissing
                ? `${scheduleMissing} не размещено`
                : "размещено"
              : "после передачи",
            tone: scheduleExpected && !scheduleMissing ? "ok" : scheduleExpected ? "warning" : "neutral",
          })}
          ${renderPlanningOrderDecisionMetric({
            id: "shifts",
            selectedItem,
            label: "Смены",
            value: shiftOrders.length ? shiftOrders.length.toLocaleString("ru-RU") : "нет",
            meta: shiftOrders.length ? "сформированы" : "после Ганта",
            tone: shiftOrders.length ? "ok" : "neutral",
          })}
        </div>
        <div class="planning-order-decision-actions" data-ui-component="ActionBar" data-visual-qa-target="planning-order-decision-actions">
          <label class="planning-order-start-date-control planning-order-decision-date" data-ui-component="FormField">
            <span>Старт первой операции</span>
            <input
              data-planning-start-date="${escapeAttribute(route?.id || "")}"
              type="date"
              value="${escapeAttribute(startDateValue)}"
              ${hasRoute ? "" : "disabled"}
            />
          </label>
          <form class="planning-order-decision-quantity" data-planning-route-quantity-form="${escapeAttribute(route?.id || "")}">
            <label data-ui-component="FormField">
              <span>Тираж, шт.</span>
              <input
                name="quantity"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                value="${escapeAttribute(String(planningQuantity))}"
                aria-label="Количество изделий в заказ-наряде"
                ${hasRoute ? "" : "disabled"}
              />
            </label>
            ${renderUiActionButton({
              label: "Сохранить",
              iconName: "check",
              size: "compact",
              tone: "secondary",
              attributes: "type=\"submit\"",
            })}
          </form>
          <div class="planning-order-decision-action-buttons">
            ${renderUiActionButton({
              label: planningTransition.actionLabel || "Передать в планирование",
              iconName: "gantt",
              size: "compact",
              tone: "primary",
              attributes: `data-planning-route-to-gantt="${escapeAttribute(route?.id || "")}" type="button" ${canSendToPlanning ? "" : "disabled"} title="${escapeAttribute(laborReadiness.missing ? `Передача остановится: ${laborReadiness.label}` : planningTransition.description || "")}"`,
            })}
            ${renderUiActionButton({
              label: "Отменить",
              iconName: "close",
              size: "compact",
              className: "danger",
              attributes: `data-planning-route-cancel="${escapeAttribute(route?.id || "")}" type="button" ${canCancel ? "" : "disabled"} title="Отменить заказ-наряд"`,
            })}
          </div>
        </div>
      </section>
    `;
  }
  
  function renderPlanningWorkbenchTaskLane(route, task, routeSteps, selectedItem, planningQuantity) {
    const stats = getPlanningTaskOperationStats(route, task, routeSteps);
    const taskQuantity = normalizeQuantity(task.quantity || 1);
    const orderQuantity = normalizeQuantity(planningQuantity * taskQuantity);
    const taskUnit = /маршрут/i.test(task.unit || "") ? "шт." : task.unit || "шт.";
  
    return `
      <article class="planning-order-lane ${task.isMain ? "is-main" : ""}">
        <button class="planning-order-lane-head ${getPlanningWorkItemId("task", task.id) === selectedItem ? "is-active" : ""}" data-planning-work-item="${escapeAttribute(getPlanningWorkItemId("task", task.id))}" type="button">
          <span>
            <strong>${escapeHtml(task.title || "Составная часть")}</strong>
          </span>
          <b>${orderQuantity.toLocaleString("ru-RU")} ${escapeHtml(taskUnit)}</b>
        </button>
  
        ${stats.steps.length ? `
          <div class="planning-order-flow-step-row">
            ${stats.steps.map((step) => renderPlanningWorkbenchStepPill(step, selectedItem)).join("")}
          </div>
        ` : `
          <div class="planning-order-lane-empty">операции для этой части не заданы</div>
        `}
      </article>
    `;
  }
  
  function renderPlanningWorkbenchStepPill(step, selectedItem) {
    const itemId = getPlanningWorkItemId("step", step.id);
    const tone = getPlanningStepTone(step);
    const isSmtStep = routeStepRequiresManualPlanningLine(step, planningState) || isSmtOperationWorkCenter(step.workCenterId, step, planningState);
    return `
      <button class="planning-order-step-pill is-${escapeAttribute(tone)} ${itemId === selectedItem ? "is-active" : ""}" data-planning-work-item="${escapeAttribute(itemId)}" type="button">
        <b>${Number(step.stepOrder || 0)}</b>
        <span>
          <strong>${escapeHtml(step.operationName || "Операция")}</strong>
          <small>${escapeHtml(getPlanningStepLineLabel(step))}</small>
        </span>
        ${isSmtStep ? `<em>SMT</em>` : isManufacturingOutputReceiptRouteStep(step) ? `<em>приемка</em>` : ""}
      </button>
    `;
  }
  
  function renderPlanningWorkbenchDetail(route, transferSummary, tasks, routeSteps, selectedItem) {
    const { type, id } = parsePlanningWorkItemId(selectedItem);
    if (type === "supply") return renderPlanningWorkbenchSupplyDetail(route, transferSummary, tasks, routeSteps);
    if (type === "chain") return renderPlanningWorkbenchChainDetail(route, transferSummary, tasks, routeSteps);
    if (type === "shifts") return renderPlanningWorkbenchShiftOrdersDetail(route, transferSummary, routeSteps);
    if (type === "schedule" || type === "batches") return renderPlanningWorkbenchScheduleDetail(route, transferSummary);
    if (type === "step") return renderPlanningWorkbenchStepDetail(route, routeSteps, id);
    if (type === "manualLabor") return renderPlanningLaborReadinessDetail(route, transferSummary, routeSteps);
    if (type === "task") return "";
    return "";
  }
  
  function renderPlanningWorkbenchStepDetail(route, routeSteps, stepId = "") {
    const step = routeSteps.find((item) => item.id === stepId);
    if (!step) return "";
    return "";
  }
  
  function renderPlanningWorkbenchRecord({ eyebrow, title, subtitle, status = "", tone = "neutral", body = "" }) {
    return renderUiPanel({
      className: `planning-order-record is-${escapeAttribute(tone)}`,
      body: `
        <header class="planning-order-record-head">
          <div>
            ${eyebrow ? `<span class="eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
            <h3>${escapeHtml(title || "Этап")}</h3>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          ${status ? `<em class="planning-order-record-status">${escapeHtml(status)}</em>` : ""}
        </header>
  
        ${renderUiPanelBody({ body })}
      `,
    });
  }
  
  function renderPlanningWorkbenchSection(title, subtitle, content, options = {}) {
    return `
      <section class="planning-order-record-section ${options.className ? escapeAttribute(options.className) : ""}">
        <header>
          <div>
            <strong>${escapeHtml(title || "")}</strong>
            ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
          </div>
          ${options.badge ? `<em>${escapeHtml(options.badge)}</em>` : ""}
        </header>
        ${content}
      </section>
    `;
  }
  
  function renderPlanningWorkbenchSupplyDetail(route, transferSummary, tasks, routeSteps) {
    const rows = getPlanningSupplyRows(route, transferSummary, routeSteps, tasks);
    const summary = getPlanningSupplySummary(route, transferSummary, routeSteps);
    const body = `
      ${renderPlanningWorkbenchSection("Обеспечение", "", `
        ${rows.length ? `
          ${renderUiTableWrap({
            className: "planning-order-register-table is-supply",
            attributes: "role=\"table\" aria-label=\"Табличная часть состава\"",
            body: `
            ${rows.map((row) => {
              const warehouseBalance = row.mode === "from_stock" && row.nomenclatureItemId
                ? getWarehouseBalanceForNomenclature(row.nomenclatureItemId)
                : null;
              const warehouseMeta = row.mode === "from_stock"
                ? warehouseBalance
                  ? `доступно ${formatWarehouseQuantity(warehouseBalance.available, warehouseBalance.unit)}${warehouseBalance.shortage ? `, дефицит ${formatWarehouseQuantity(warehouseBalance.shortage, warehouseBalance.unit)}` : ""}`
                  : "остаток не найден"
                : row.mode === "produce" ? "производственный маршрут" : "без автосоздания";
              return `
                <div class="planning-order-register-row is-${escapeAttribute(row.statusTone)}" role="row">
                  <div>
                    <small>${escapeHtml(row.number)} · ${escapeHtml(row.typeLabel)}</small>
                    <strong>${escapeHtml(row.title || "Составная часть")}</strong>
                  </div>
                  <div>
                    <strong>${Number(row.quantity || 0).toLocaleString("ru-RU")} ${escapeHtml(row.unit || "шт.")}</strong>
                  </div>
                  <div class="planning-order-segmented-actions" role="group" aria-label="Способ обеспечения">
                    ${STRUCTURE_FULFILLMENT_MODES.map((mode) => `
                      <button
                        class="${mode === row.mode ? "is-active" : ""}"
                        data-planning-supply-mode="${escapeAttribute(mode)}"
                        data-planning-supply-route="${escapeAttribute(route?.id || "")}"
                        data-planning-supply-item="${escapeAttribute(row.id)}"
                        type="button"
                        ${row.editable && route ? "" : "disabled"}
                        title="${escapeAttribute(getFulfillmentMeta(mode))}"
                      >${escapeHtml(STRUCTURE_FULFILLMENT_LABELS[mode])}</button>
                    `).join("")}
                  </div>
                  <div>
                    <strong>${row.stats.stepsCount ? `${row.stats.stepsCount} оп.` : row.mode === "purchase" || row.mode === "external" ? "не требуется" : "нет операций"}</strong>
                    <em>${escapeHtml(warehouseMeta)}</em>
                  </div>
                  ${renderUiStatusToken(row.status, row.statusTone, "planning-order-state-token")}
                </div>
              `;
            }).join("")}
            `,
          })}
        ` : `
          <div class="planning-muted-state">
            ${icon("info")}
            <span>Состав изделия не найден. Выберите изделие или плату в маршрутной карте.</span>
          </div>
        `}
      `)}
    `;
  
    return renderPlanningWorkbenchRecord({
      title: "Состав и обеспечение",
      status: summary.blocking ? formatPlanningProblemCount(summary.blocking) : "готово",
      tone: summary.blocking ? "warning" : "ok",
      body,
    });
  }
  
  function renderPlanningWorkbenchChainDetail(route, transferSummary, tasks, routeSteps) {
    const chain = buildPlanningProductionChain(route, transferSummary, tasks, routeSteps);
    const summary = getPlanningFlowReadinessSummary(route);
    const { settings } = summary;
    const canUseTransfer = summary.branchCount > 1 && chain.finalNode;
    const branchRows = summary.branchDetails || [];
    const body = `
      ${renderPlanningWorkbenchSection("Системная передача", "", `
        <div class="planning-order-rule-editor is-system-transfer">
          <article>
            <strong>1. Конец смены</strong>
            <span>Все выполненное за смену становится доступным следующему участку или буферу.</span>
          </article>
          <article>
            <strong>2. Окончание операции</strong>
            <span>Если операция завершилась до конца смены, передача формируется сразу по факту завершения.</span>
          </article>
          <em>${escapeHtml(canUseTransfer ? settings.ruleLabel : "для этой цепочки отдельная развилка не требуется")}</em>
        </div>
      `)}
      ${renderPlanningWorkbenchSection("WIP", "", `
        ${branchRows.length ? `
          ${renderUiTableWrap({
            className: "planning-order-register-table is-wip",
            attributes: "role=\"table\" aria-label=\"WIP по входным веткам\"",
            body: `
            <div class="planning-order-register-row is-head" role="row">
              <span>Ветка</span>
              <span>Выпущено</span>
              <span>Свободно</span>
              <span>Старт</span>
            </div>
            ${branchRows.map((branch) => `
              <div class="planning-order-register-row is-${branch.isReadyForStart ? "ok" : "warning"}" role="row">
                <div>
                  <strong>${escapeHtml(branch.outputLabel || branch.title || "Выход ветки")}</strong>
                  <em>${escapeHtml(branch.inputLabel || "вход не указан")}</em>
                </div>
                <strong>${Number(branch.producedQuantity || 0).toLocaleString("ru-RU")} шт.</strong>
                <strong>${Number(branch.availableQuantity || 0).toLocaleString("ru-RU")} шт.</strong>
                ${renderUiStatusToken(branch.readyAt ? formatDateTimeShort(branch.readyAt) : "нет даты", branch.isReadyForStart ? "ok" : "warning", "planning-order-state-token")}
              </div>
            `).join("")}
            `,
          })}
        ` : `
            <div class="planning-muted-state">
              ${icon("info")}
              <span>WIP появится после размещения в Ганте.</span>
            </div>
          `}
      `)}
    `;
  
    return renderPlanningWorkbenchRecord({
      title: "Системная передача",
      status: chain.issues.length ? formatPlanningProblemCount(chain.issues.length) : "готово",
      tone: chain.issues.length ? "warning" : "ok",
      body,
    });
  }
  
  function renderPlanningWorkbenchScheduleDetail(route, summary) {
    const expected = Number(summary?.expected || 0);
    const planned = Number(summary?.planned || 0);
    const missing = Math.max(0, expected - planned);
    const tone = expected && !missing ? "ok" : expected ? "warning" : "neutral";
    const body = `
      ${renderPlanningWorkbenchSection("Операции заказ-наряда", "размещение строится от общего количества заказ-наряда", `
        ${renderPlanningScheduleStatus(route, summary)}
      `)}
    `;
  
    return renderPlanningWorkbenchRecord({
      title: "Размещение в Ганте",
      status: expected && !missing ? "готово" : missing ? `${missing} не размещено` : "подготовить",
      tone,
      body,
    });
  }
  
  function renderPlanningWorkbenchShiftOrdersDetail(route, transferSummary, routeSteps) {
    const shiftOrders = getPlanningShiftOrdersForRoute(route, routeSteps);
    const body = `
  	    ${renderPlanningWorkbenchSection("Планы смены", "расчетные дневные фрагменты из размещенных слотов; мастер выпускает из них сменный заказ-наряд", `
  	      ${shiftOrders.length ? `
  	        <div class="planning-order-shift-list" role="table" aria-label="Планы смены">
            ${shiftOrders.map((shiftOrder) => `
              <article class="planning-order-shift-card is-${escapeAttribute(shiftOrder.tone)}">
                <header>
                  <div>
                    <strong>${escapeHtml(shiftOrder.title)}</strong>
                    <span>${escapeHtml(shiftOrder.meta)}</span>
                  </div>
                  <em>${escapeHtml(shiftOrder.statusLabel)}</em>
                </header>
                <div class="planning-order-shift-rows">
                  ${shiftOrder.rows.map((row) => `
                    <div class="planning-order-shift-row">
                      <span>
                        <strong>${escapeHtml(row.operationName)}</strong>
                        <small>${escapeHtml(row.taskLabel)}</small>
                      </span>
                      <span>${escapeHtml(row.resourceLabel)}</span>
                      <span>${row.quantity.toLocaleString("ru-RU")} ${escapeHtml(row.unit)}</span>
                      <span>${escapeHtml(row.timeLabel)}</span>
                    </div>
                  `).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        ` : `
          <div class="planning-muted-state">
            ${icon("info")}
  	          <span>Планы смены появятся после размещения заказ-наряда в Ганте. Это еще не печатный сменный заказ-наряд: мастер смены распределяет строки на реальные ресурсы отдельно.</span>
          </div>
        `}
      `)}
    `;
  
    return renderPlanningWorkbenchRecord({
  	    title: "Планы смен",
  	    subtitle: "заготовка для работы мастеров",
      status: shiftOrders.length ? `${shiftOrders.length} смен` : "после Ганта",
      tone: shiftOrders.length ? "ok" : "neutral",
      body,
    });
  }
  
  function renderPlanningScheduleStatus(route, summary) {
    const planningQuantity = normalizeQuantity(summary?.planningQuantity || getPlanningRouteQuantity(route));
    return `
      <div class="planning-order-batch-editor">
        <div class="planning-order-placement-summary">
          <article>
            <span>Количество</span>
            <strong>${planningQuantity.toLocaleString("ru-RU")} шт.</strong>
            <small>хранится в заказ-наряде</small>
          </article>
          <article>
            <span>Слоты</span>
            <strong>${summary?.planned || 0}/${summary?.expected || 0}</strong>
            <small>операций в Ганте</small>
          </article>
          <article>
            <span>Платы</span>
            <strong>${Number(summary?.totalPanels || 0).toLocaleString("ru-RU")}</strong>
            <small>по мультипликации</small>
          </article>
        </div>
        <form class="planning-order-quantity-form" data-planning-route-quantity-form="${escapeAttribute(route?.id || "")}">
          <label>
            <span>Количество в заказ-наряде</span>
            <input
              name="quantity"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              value="${escapeAttribute(String(planningQuantity))}"
              aria-describedby="planning-route-quantity-help-${escapeAttribute(route?.id || "")}" />
          </label>
          ${renderUiActionButton({
            label: "Пересчитать тираж",
            iconName: "refresh",
            size: "compact",
            tone: "primary",
            attributes: "type=\"submit\"",
          })}
          <small id="planning-route-quantity-help-${escapeAttribute(route?.id || "")}">Изменит количество изделия и пересчитает незавершённые операции в Ганте.</small>
        </form>
      </div>
    `;
  }

  return {
    getPlanningWorkbenchModel,
    renderPlanningWorkbenchPage,
    syncPlanningManualLaborToStepSlots,
  };
}
