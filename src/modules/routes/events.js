export function createRoutesEventsModule(dependencies = {}) {
  const {
    addMs,
    app,
    applyOperationMapItemToRouteStep,
    batchIds,
    bindGenericModalCloseEvents,
    bindRouteStepDenseSelectEvents,
    BOARD_SPEC_TERM,
    boardsPerPanel,
    BOM_COMPONENT_FIELDS,
    bomId,
    bomListId,
    buildDefaultSpecificationStructureItems,
    button,
    loadProductsEventsModule = () => Promise.reject(new Error("Products events runtime is unavailable")),
    createSpekiSpecification,
    currentWorkCenterId,
    deleteDirectoryStateRow,
    departmentName,
    element,
    ensureRouteTaskSeedSteps,
    ensureNomenclatureTypeExists,
    entry,
    field,
    findOperationMapItemByNameAndWorkCenter,
    form,
    fromDateInput,
    generateChildRouteCardsForActiveRoute,
    getActiveRouteForModule,
    getDefaultOperationCalculationType,
    getDefaultSecondsPerPanel,
    getDefaultStructureFulfillmentMode,
    getDefaultStructureNomenclatureType,
    getExecutionTypeForFulfillmentMode,
    getActiveSpecificationForModule,
    getBomImportRows,
    getBomList,
    getNomenclatureDeleteUsage,
    getNomenclatureItem,
    getManualPlanningAssignmentForRouteStep,
    getRouteBindingContext,
    getRouteBindingModeForSelection,
    getRouteDocumentKind,
    getRouteModuleSelectionValue,
    getOperationMapItem,
    getOperationMapRows,
    getOperationRouteWorkCenterId,
    getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
    getPlanningResourceForRouteStep,
    getPlanningRouteQuantity,
    getProductionResource,
    getRouteForStep,
    getRoutePlanningContext,
    getRouteProductionContext,
    getRouteProductionId,
    getRouteStepFlowModel,
    getRouteStepPlanningCandidateWorkCenterIds,
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteStepsForModule,
    getRouteStepsForTask,
    getRouteStepTaskId,
    getRouteTasksForModule,
    getSlotPlanningOrderId,
    getSlotRouteId,
    getSpecificationItemFulfillmentMode,
    getSpecificationStructureItems,
    getWorkCenter,
    getWorkCenterUnitsPerHour,
    id,
    importHeaders,
    importRows,
    importBomFromXlsxFile,
    input,
    isGanttSlotCompleted,
    isManufacturingOutputReceiptOperation,
    isManufacturingOutputReceiptRouteStep,
    isPlanningWorkCenterCompatibleWithRouteStep,
    isSchedulableFulfillmentMode,
    isWarehouseWorkCenterId,
    item,
    items,
    makeId,
    makeManualRouteStepFlowItems,
    mapLegacyWorkCenterId,
    mergeFallback,
    message,
    NOMENCLATURE_REA_COMPONENT_TYPE,
    normalizeBoardsPerPanel,
    normalizeDirectoryRow,
    normalizeDirectoryState,
    normalizeOptionalPositiveInteger,
    normalizePlanningState,
    normalizeNomenclatureType,
    normalizeRouteBindingValue,
    normalizeRouteStepCalculationFields,
    normalizeSpecificationStructureItem,
    normalizeStructureFulfillmentMode,
    note,
    notifySaveSuccess,
    openConfirmDialog,
    operationName,
    option,
    options,
    parentId,
    persistDirectoryState,
    persistDirectoryStateDurably,
    persistDirectoryStateWithRemoval,
    persistState,
    persistUiState,
    pickDefaultBomForSpecificationItem,
    PRODUCT_COMPOSITION_TERM,
    rawValue,
    recalculateSlotEndByQuantity,
    recordDirectoryEntityDeletion,
    render,
    renderPreservingModuleScroll,
    resolveRouteModuleProjectId,
    resolveWorkCenterIdFromName,
    route = null,
    routeId = "",
    routeWorkCenterId,
    secondsPerPanel,
    setupMin,
    slot,
    slotMatchesProductionContext,
    specificationId,
    status,
    step = null,
    structureItems,
    syncSpecificationDerivedFields,
    syncPlanningRouteQuantity,
    toDateInput,
    unit = null,
    unitsPerHour,
    upsertBomResultToNomenclature,
    withDirectoryEntityRemovalAllowed,
    withPlanningEntityRemovalAllowed,
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

function bindRoutesEvents() {
  app.querySelector("[data-route-create]")?.addEventListener("click", () => {
    ui.activeRouteId = "__new__";
    const defaultProductId = ui.activeSpecificationId || ui.activeProjectId || (directoryState.specifications || [])[0]?.id || "";
    const defaultBomId = ui.activeBomId || (directoryState.bomLists || [])[0]?.id || "";
    const defaultBindingId = defaultProductId ? `spec:${defaultProductId}` : defaultBomId ? `bom:${defaultBomId}` : "";
    ui.routeBindingMode = getRouteBindingModeForSelection(defaultBindingId);
    ui.routeDraftBindingId = normalizeRouteBindingValue(defaultBindingId);
    const binding = getRouteBindingContext(ui.routeDraftBindingId);
    ui.activeProjectId = binding.specification?.id || "";
    persistUiState();
    render();
  });

  app.querySelector("[data-route-generate-child-cards]")?.addEventListener("click", () => {
    generateChildRouteCardsForActiveRoute();
  });

  app.querySelectorAll("[data-route-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = planningState.routes.find((item) => item.id === button.dataset.routeOpen);
      if (!route) return;
      ui.activeRouteId = route.id;
      ui.routeDraftBindingId = "";
      ui.routeBindingMode = getRouteBindingModeForSelection(getRouteModuleSelectionValue(route), route);
      ui.activeProjectId = getRouteProductionId(route) || getRoutePlanningContext(route)?.id || "";
      persistUiState();
      render();
    });
  });

  app.querySelector("#routeModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRouteModuleForm(event.currentTarget);
  });

  app.querySelector("[data-route-binding-select]")?.addEventListener("change", (event) => {
    const selectionValue = String(event.target.value || "");
    const binding = getRouteBindingContext(selectionValue);
    const selectedSpecification = binding.specification;
    ui.routeBindingMode = binding.bom ? "bom" : "product";
    if (selectedSpecification) ui.activeSpecificationId = selectedSpecification.id;
    if (ui.activeRouteId === "__new__") {
      ui.routeDraftBindingId = binding.value || selectionValue || "";
      ui.activeProjectId = selectedSpecification?.id || "";
      persistUiState();
      return;
    }
    updateRouteProject(selectionValue);
  });

  app.querySelector("[data-route-planning-quantity]")?.addEventListener("change", (event) => {
    const routeId = event.currentTarget.dataset.routePlanningQuantity || getActiveRouteForModule()?.id || "";
    if (!routeId || routeId === "__new__") return;
    syncPlanningRouteQuantity(routeId, event.currentTarget.value, {
      updateSlots: true,
      message: "Количество изделий сохранено",
    });
  });

  app.querySelector("[data-route-delete]")?.addEventListener("click", (event) => {
    event.preventDefault();
    const routeId = event.currentTarget.dataset.routeDelete || "";
    if (!routeId) return;
    openConfirmDialog("routeDeleteMap", { routeId });
  });

  app.querySelector("[data-route-print-preview]")?.addEventListener("click", (event) => {
    const routeId = event.currentTarget.dataset.routePrintPreview || getActiveRouteForModule()?.id || "";
    if (!routeId) return;
    ui.routePrintPreviewId = routeId;
    render();
  });

  app.querySelector("[data-route-print-run]")?.addEventListener("click", () => {
    const previousTitle = document.title;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    document.title = "";
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.requestAnimationFrame(() => window.print());
  });

  app.querySelectorAll("[data-dense-route-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-route-field]");
      if (!root || !["projectId", "routeBindingId"].includes(root.dataset.denseRouteField)) return;
      updateRouteProject(button.dataset.denseValue || "");
    });
  });

  bindRouteStepDenseSelectEvents();

  app.querySelectorAll("[data-route-step-input]").forEach((field) => {
    field.addEventListener("change", () => {
      updateRouteStepField(field.dataset.routeStepInput, field.dataset.routeStepField, field.value);
    });
  });

  app.querySelectorAll("[data-route-step-flow-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const mainContent = app.querySelector("[data-layout=\"main-content\"]");
      const scrollTop = mainContent?.scrollTop || 0;
      const stepId = button.dataset.routeStepFlowToggle || "";
      ui.routeFlowStepId = ui.routeFlowStepId === stepId ? "" : stepId;
      if (ui.routeFlowStepId) ui.routeLaborStepId = "";
      persistUiState({ skipRememberScroll: true });
      render();
      window.requestAnimationFrame(() => {
        const nextMainContent = app.querySelector("[data-layout=\"main-content\"]");
        if (nextMainContent) nextMainContent.scrollTop = scrollTop;
      });
    });
  });

  app.querySelectorAll("[data-route-step-labor-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const mainContent = app.querySelector("[data-layout=\"main-content\"]");
      const scrollTop = mainContent?.scrollTop || 0;
      const stepId = button.dataset.routeStepLaborToggle || "";
      ui.routeLaborStepId = ui.routeLaborStepId === stepId ? "" : stepId;
      if (ui.routeLaborStepId) ui.routeFlowStepId = "";
      persistUiState({ skipRememberScroll: true });
      render();
      window.requestAnimationFrame(() => {
        const nextMainContent = app.querySelector("[data-layout=\"main-content\"]");
        if (nextMainContent) nextMainContent.scrollTop = scrollTop;
      });
    });
  });

  app.querySelectorAll("[data-route-add-step-task]").forEach((button) => {
    button.addEventListener("click", () => {
      addRouteModuleStep(button.dataset.routeAddStepKind || "operation", button.dataset.routeAddStepTask || "");
    });
  });

  app.querySelectorAll("[data-route-add-step]").forEach((button) => {
    button.addEventListener("click", () => {
      addRouteModuleStep(button.dataset.routeAddStep || "operation");
    });
  });

  app.querySelectorAll("[data-route-step-up]").forEach((button) => {
    button.addEventListener("click", () => moveRouteStep(button.dataset.routeStepUp, -1));
  });

  app.querySelectorAll("[data-route-step-down]").forEach((button) => {
    button.addEventListener("click", () => moveRouteStep(button.dataset.routeStepDown, 1));
  });

  app.querySelectorAll("[data-route-step-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("routeDeleteStep", { stepId: button.dataset.routeStepDelete });
    });
  });

	  app.querySelector("[data-route-to-planning]")?.addEventListener("click", () => {
	    const route = getActiveRouteForModule();
	    if (!route) {
	      alert("Сначала сохраните маршрутную карту, затем откройте заказ-наряд в планировании.");
	      return;
	    }
	    const specification = getRouteSpecification(route);
	    const bom = getRouteBomList(route);
	    const production = getRouteProductionContext(route);
	    if (!bom && !specification && !production) {
	      alert("Чтобы собрать заказ-наряд, выберите BOM или состав изделия в карточке маршрута и сохраните карту.");
	      return;
	    }
    if (specification && !production) {
      ensureRouteModuleProjectForSpecification(specification);
	    }
	    ui.activeModule = "planning";
	    ui.activeRouteId = route.id;
	    ui.activeProjectId = specification?.id || getRouteProductionId(route) || getRoutePlanningContext(route)?.id || "";
    persistUiState();
    render();
  });

  bindGenericModalCloseEvents();
}

function saveRouteModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const existingRoute = getActiveRouteForModule();
  const routeBindingId = String(data.get("routeBindingId") || data.get("projectId") || "");
  const binding = getRouteBindingContext(routeBindingId);
  const selectedSpecification = binding.specification;
  const selectedBom = binding.bom;
  ui.routeBindingMode = selectedBom ? "bom" : "product";
  const productionId = selectedSpecification ? resolveRouteModuleProjectId(selectedSpecification.id, { createPlanningUnit: true }) : "";
  const name = String(data.get("name") || "").trim();
  if (!name) {
    alert("Заполните название маршрутной карты.");
    return;
  }
  const planningQuantity = normalizeOptionalPositiveInteger(data.get("planningQuantity"));
  if (!planningQuantity) {
    alert("Количество изделий должно быть больше 0.");
    return;
  }

	  const stamp = new Date().toISOString();
	  const routeId = isNew ? makeId("r") : existingRoute?.id || String(data.get("routeId") || makeId("r"));
	  const existingRouteKind = getRouteDocumentKind(existingRoute);
    const previousQuantity = existingRoute ? getPlanningRouteQuantity(existingRoute) : planningQuantity;
	  const nextRoute = {
	    ...(existingRoute || {}),
	    id: routeId,
	    specificationId: selectedSpecification ? selectedSpecification.id || productionId : "",
	    specificationName: selectedSpecification ? selectedSpecification.name || "" : "",
	    projectId: selectedSpecification ? productionId || selectedSpecification.id : "",
	    bomListId: selectedBom ? selectedBom.id : "",
	    name,
      planningQuantity,
	    isDefault: Boolean(existingRoute?.isDefault),
	    routeDocumentKind: existingRoute?.routeDocumentKind || "main",
	    rootRouteId: existingRoute?.rootRouteId || (existingRouteKind === "main" ? routeId : ""),
	    updatedAt: stamp,
	  };

  planningState.routes = [
    ...planningState.routes
      .filter((route) => route.id !== routeId),
    nextRoute,
  ];
  Object.assign(
    dependencies.getPlanningState?.() || {},
    normalizePlanningState(planningState),
  );
  if (selectedSpecification) ensureRouteTaskSeedSteps(routeId, selectedSpecification);
  if (!isNew && planningQuantity !== previousQuantity) {
    syncPlanningRouteQuantity(routeId, planningQuantity, {
      updateSlots: true,
      persist: false,
      render: false,
      notify: false,
    });
  }
  ui.activeRouteId = routeId;
  ui.routeDraftBindingId = "";
  ui.activeProjectId = selectedSpecification ? productionId || selectedSpecification.id : existingRoute?.projectId || "";
  if (selectedSpecification) ui.activeSpecificationId = selectedSpecification.id;
  persistState();
  persistUiState();
  notifySaveSuccess(isNew ? "Маршрутная карта создана" : "Маршрутная карта сохранена");
  render();
}

function updateRouteProject(selectionValue) {
  const activeRoute = getActiveRouteForModule();
  const binding = getRouteBindingContext(selectionValue);
  const selectedSpecification = binding.specification;
  const selectedBom = binding.bom;
  ui.routeBindingMode = selectedBom ? "bom" : "product";
  const productionId = selectedSpecification ? resolveRouteModuleProjectId(selectedSpecification.id, {
    createPlanningUnit: Boolean(activeRoute && ui.activeRouteId !== "__new__"),
  }) : "";
  if (selectedSpecification) ui.activeSpecificationId = selectedSpecification.id;
  if (!activeRoute || ui.activeRouteId === "__new__") {
    ui.routeDraftBindingId = binding.value || selectionValue || "";
    ui.activeProjectId = productionId || selectedSpecification?.id || "";
    persistUiState();
    render();
    return;
  }

  planningState.routes = planningState.routes.map((route) => (
    route.id === activeRoute.id
      ? {
          ...route,
          specificationId: selectedSpecification ? selectedSpecification.id || productionId : "",
          specificationName: selectedSpecification ? selectedSpecification.name || "" : "",
          projectId: selectedSpecification ? productionId || selectedSpecification.id : "",
          bomListId: selectedBom ? selectedBom.id : selectedSpecification ? "" : route.bomListId || "",
          updatedAt: new Date().toISOString(),
        }
      : route
  ));
  if (selectedSpecification) ensureRouteTaskSeedSteps(activeRoute.id, selectedSpecification);
  ui.activeProjectId = selectedSpecification ? productionId || selectedSpecification.id : "";
  persistState();
  persistUiState();
  notifySaveSuccess("Маршрутная карта сохранена");
  render();
}

function updateRouteStepField(stepId, field, rawValue, options = {}) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step || !field) return;
  const oldCenter = getWorkCenter(step.workCenterId);
  let value = rawValue;
  if (field === "operationId" && !step.workCenterId) {
    alert("Сначала выберите отдел.");
    return;
  }
  if (field === "operationId" && !getOperationMapItem(value)) {
    alert("Выберите операцию из справочника операций.");
    return;
  }
  if (field === "operationId") {
    const operation = getOperationMapItem(value);
    if (operation && getOperationRouteWorkCenterId(operation) !== step.workCenterId) {
      alert("Выберите операцию из выбранного отдела.");
      return;
    }
  }
  if (field === "workCenterId" && value && !getWorkCenter(value)) {
    alert("Выберите отдел из модуля сотрудники.");
    return;
  }
  if (field === "planningWorkCenterId") {
    const normalizedValue = mapLegacyWorkCenterId(value);
    const candidates = getRouteStepPlanningCandidateWorkCenterIds(step, planningState);
    if (normalizedValue && !candidates.includes(normalizedValue)) {
      alert("Выберите линию из доступных кандидатов для этой операции.");
      return;
    }
    value = normalizedValue;
  }
  if (field === "specTaskId") {
    const route = getRouteForStep(step);
    const taskOptions = getRouteStepTaskOptions(route);
    if (value && !taskOptions.some((item) => item.value === value)) {
      alert("Выберите объект маршрута из состава изделия.");
      return;
    }
    value = value || "";
  }
  if (["stepOrder", "setupMin", "secondsPerPanel"].includes(field)) {
    value = Math.max(field === "stepOrder" ? 1 : 0, Math.round(Number(rawValue || 0)));
  }
  if (field === "boardsPerPanel") {
    value = normalizeBoardsPerPanel(rawValue, 1);
  }
  if (field === "efficiency") {
    value = Math.min(150, Math.max(10, Math.round(Number(rawValue || 0) || 100)));
  }
	  if (field === "unitsPerHour") {
	    value = Math.max(0, Math.round(Number(rawValue || 0) * 10) / 10);
	  }
	  if (field === "operationInputs") {
	    value = makeManualRouteStepFlowItems("input", rawValue);
	  }
	  if (field === "operationOutputs") {
	    value = makeManualRouteStepFlowItems("output", rawValue);
	  }

  planningState.routeSteps = planningState.routeSteps.map((item) => {
    if (item.id !== stepId) return item;
    const next = { ...item, [field]: value, updatedAt: new Date().toISOString() };
    if (field === "specTaskId") {
      return applyRouteTaskToStep(next, getRouteForStep(item), value);
    }
    if (field === "operationId") {
      const operation = getOperationMapItem(value);
      if (operation) {
        return applyOperationMapItemToRouteStep(next, operation);
      }
    }
	    if (field === "workCenterId") {
	      const center = getWorkCenter(value);
        const currentOperation = item.operationId ? getOperationMapItem(item.operationId) : null;
	      const planningCandidates = value ? getPlanningCandidateWorkCenterIdsForRouteWorkCenter(value, currentOperation, planningState) : [];
	      const singlePlanningWorkCenterId = planningCandidates.length === 1 ? planningCandidates[0] : "";
        const explicitPlanningWorkCenterId = mapLegacyWorkCenterId(item.planningWorkCenterId || "");
        const selectedPlanningWorkCenterId = explicitPlanningWorkCenterId && planningCandidates.includes(explicitPlanningWorkCenterId)
          ? explicitPlanningWorkCenterId
          : singlePlanningWorkCenterId;
	      const resourceId = selectedPlanningWorkCenterId
	        ? getPlanningResourceForRouteStep(next, selectedPlanningWorkCenterId, next.resourceId)
	        : "";
	      const resource = resourceId ? getProductionResource(resourceId) : null;
	      const shouldRename = !item.operationName || item.operationName === oldCenter?.name || item.operationName === oldCenter?.code;
        const shouldClearOperation = !value || !currentOperation || getOperationRouteWorkCenterId(currentOperation) !== value;
        if (shouldClearOperation) {
          next.operationId = "";
          next.operationName = "";
          next.workCenterOverride = false;
          next.requiresBatch = value ? !isWarehouseWorkCenterId(value) : true;
          next.isWarehouseOperation = false;
        } else {
          next.operationName = shouldRename ? currentOperation.name || center?.name || "" : item.operationName;
          next.workCenterOverride = false;
          next.requiresBatch = currentOperation.requiresBatch;
          next.isWarehouseOperation = currentOperation.isWarehouse;
        }
	      if (!Number(next.unitsPerHour || 0) || shouldClearOperation) next.unitsPerHour = value ? getWorkCenterUnitsPerHour(value) : 0;
        next.planningWorkCenterId = selectedPlanningWorkCenterId && planningCandidates.length > 1 ? selectedPlanningWorkCenterId : "";
	      next.resourceId = resourceId;
	      next.calculationType = value ? getDefaultOperationCalculationType(value, next) : "manual";
	      next.secondsPerPanel = next.calculationType === "manual" || next.calculationType === "normative"
	        ? (value ? getDefaultSecondsPerPanel(value, next.boardsPerPanel || 1) : 0)
	        : 0;
	      next.setupMin = Number(resource?.changeoverMin || 0);
	    }
      if (field === "planningWorkCenterId") {
        next.resourceId = value ? getPlanningResourceForRouteStep(next, value, next.resourceId) : "";
        const resource = next.resourceId ? getProductionResource(next.resourceId) : null;
        if (resource) next.setupMin = Number(resource.changeoverMin || next.setupMin || 0);
      }
	    return next;
	  });

  if (field === "stepOrder") normalizeRouteStepOrders(step.routeId, getRouteStepTaskId(step));
  if (field === "specTaskId") normalizeRouteStepOrders(step.routeId);
		  if (["operationId", "workCenterId", "planningWorkCenterId", "unitsPerHour", "secondsPerPanel", "setupMin", "calculationType", "resourceId", "bomListId", "boardsPerPanel", "efficiency", "specTaskId", "operationInputs", "operationOutputs"].includes(field)) {
		    const updatedStep = planningState.routeSteps.find((item) => item.id === stepId);
		    planningState.slots = planningState.slots.map((slot) => {
	      if (slot.routeStepId !== stepId || slot.locked || isGanttSlotCompleted(slot) || !updatedStep) return slot;
        const selectedPlanningWorkCenterId = getRouteStepSelectedPlanningWorkCenterId(updatedStep, planningState);
        const shouldForceSelectedLine = field === "planningWorkCenterId" && selectedPlanningWorkCenterId;
        const keepSlotWorkCenter = !shouldForceSelectedLine && isPlanningWorkCenterCompatibleWithRouteStep(updatedStep, slot.workCenterId, planningState);
        const assignment = keepSlotWorkCenter ? null : getManualPlanningAssignmentForRouteStep(updatedStep, slot.quantity || 1, slot.plannedStart || fromDateInput(ui.windowStart), {
          state: planningState,
          ignoreSlotId: slot.id,
          currentWorkCenterId: slot.workCenterId,
        });
	        const planningWorkCenterId = shouldForceSelectedLine
	          ? selectedPlanningWorkCenterId
	          : keepSlotWorkCenter
	          ? slot.workCenterId
	          : assignment?.workCenterId || slot.workCenterId;
	        const resourceId = getPlanningResourceForRouteStep(updatedStep, planningWorkCenterId, slot.resourceId || updatedStep.resourceId || "");
        const route = (planningState.routes || []).find((item) => item.id === getSlotPlanningOrderId(slot, getSlotRouteId(slot, planningState)))
          || getRouteForStep(updatedStep);
	        const flow = getRouteStepFlowModel(route, updatedStep);
		      const nextSlot = applyPlanningOrderLaborToSlot({
	        ...slot,
	        routeWorkCenterId: updatedStep.workCenterId,
	        workCenterId: planningWorkCenterId,
	        operationId: updatedStep.operationId || slot.operationId || "",
	        operationName: updatedStep.operationName || "Операция не выбрана",
	        unitsPerHour: updatedStep.unitsPerHour || slot.unitsPerHour,
	        boardsPerPanel: updatedStep.boardsPerPanel || slot.boardsPerPanel || 1,
	        resourceId,
	        calculationType: updatedStep.calculationType || slot.calculationType || "",
	        secondsPerPanel: updatedStep.secondsPerPanel || slot.secondsPerPanel || 0,
	        setupMin: updatedStep.setupMin || slot.setupMin || 0,
		        bomListId: updatedStep.bomListId || slot.bomListId || "",
		        operationInputs: flow.inputs,
		        operationOutputs: flow.outputs,
		        operationInputLabel: flow.inputLabel,
		        operationOutputLabel: flow.outputLabel,
		        updatedAt: new Date().toISOString(),
		      }, route, updatedStep, slot.quantity || 1, { workCenterId: planningWorkCenterId });
        return recalculateSlotEndByQuantity(nextSlot, planningState);
	    });
	  }
  persistState();
  notifySaveSuccess("Операция маршрута сохранена");
  if (options.preserveScroll) {
    renderPreservingModuleScroll();
  } else {
    render();
  }
}

function appendRouteTaskTemplateSteps(route, task) {
  return 0;
}

function seedRouteTaskTemplate(taskId = "") {
  const route = getActiveRouteForModule();
  if (!route || !taskId) return;
  const task = getRouteTasksForModule(route).find((item) => item.id === taskId);
  const addedCount = appendRouteTaskTemplateSteps(route, task);
  if (!addedCount) {
    alert("Типовые операции отключены. Добавьте операцию из справочника операций.");
    return;
  }
  persistState();
  notifySaveSuccess("Операции маршрута добавлены");
  render();
}

function seedAllRouteTaskTemplates() {
  const route = getActiveRouteForModule();
  if (!route) return;
  const tasks = getRouteTasksForModule(route).filter((task) => !task.isMain && !task.isOrphan);
  const addedCount = tasks.reduce((sum, task) => sum + appendRouteTaskTemplateSteps(route, task), 0);
  if (!addedCount) {
    alert("Типовые операции отключены. Добавляйте операции из справочника операций.");
    return;
  }
  persistState();
  render();
}

function getDefaultOperationMapItemForRouteKind(operationKind = "operation") {
  const operations = getOperationMapRows({ includeInactive: false })
    .filter((operation) => !operation.legacyAliasOf && operation.coverage !== "blocked");
  if (operationKind === "warehouse") {
    return operations.find((operation) => isManufacturingOutputReceiptOperation(operation)) || null;
  }
  return operations.find((operation) => !operation.isWarehouse && !isWarehouseWorkCenterId(getOperationRouteWorkCenterId(operation)) && operation.coverage !== "blocked")
    || operations.find((operation) => !operation.isWarehouse)
    || null;
}

function createRouteStepFromOperationMapItem(route, operation, insertOrder, stamp = new Date().toISOString()) {
  const workCenterId = getOperationRouteWorkCenterId(operation) || operation.workCenterId;
  const planningCandidates = getPlanningCandidateWorkCenterIdsForRouteWorkCenter(workCenterId, operation, planningState);
  const singlePlanningWorkCenterId = planningCandidates.length === 1 ? planningCandidates[0] : "";
  const resourceId = singlePlanningWorkCenterId
    ? getPlanningResourceForRouteStep({ workCenterId }, singlePlanningWorkCenterId, "")
    : "";
  const resource = resourceId ? getProductionResource(resourceId) : null;
  const calculationType = getDefaultOperationCalculationType(workCenterId, operation);
  return normalizeRouteStepCalculationFields({
    id: makeId("rs"),
    routeId: route.id,
    specTaskId: "",
    specTaskSourceItemId: "",
    specTaskName: "",
    specTaskQuantity: 1,
    bomListId: "",
    boardsPerPanel: 1,
    operationId: operation.id,
    workCenterId,
    workCenterOverride: false,
    operationName: operation.name || "",
    stepOrder: insertOrder,
    isRequired: true,
    quantityMultiplier: 1,
    unitsPerHour: operation.unitsPerHour || getWorkCenterUnitsPerHour(workCenterId),
    resourceId,
    calculationType,
    secondsPerPanel: calculationType === "manual" || calculationType === "normative"
      ? getDefaultSecondsPerPanel(workCenterId, 1)
      : 0,
    requiresBatch: operation.requiresBatch,
    isWarehouseOperation: operation.isWarehouse,
    setupMin: Number(resource?.changeoverMin || 0),
    updatedAt: stamp,
  }, planningState);
}

function createEmptyRouteModuleStep(route, insertOrder, stamp = new Date().toISOString()) {
  return normalizeRouteStepCalculationFields({
    id: makeId("rs"),
    routeId: route.id,
    specTaskId: "",
    specTaskSourceItemId: "",
    specTaskName: "",
    specTaskQuantity: 1,
    bomListId: "",
    boardsPerPanel: 1,
    operationId: "",
    workCenterId: "",
    workCenterOverride: false,
    operationName: "",
    stepOrder: insertOrder,
    isRequired: true,
    quantityMultiplier: 1,
    unitsPerHour: 0,
    resourceId: "",
    calculationType: "manual",
    secondsPerPanel: 0,
    requiresBatch: true,
    isWarehouseOperation: false,
    setupMin: 0,
    updatedAt: stamp,
  }, planningState);
}

function getRouteStepAddTargetTaskId(route, requestedTaskId = "") {
  const tasks = getRouteTasksForModule(route);
  const requestedTask = tasks.find((task) => task.id === requestedTaskId);
  if (requestedTask && !requestedTask.isOrphan) return requestedTask.id;
  const concreteTasks = tasks.filter((task) => !task.isMain && !task.isOrphan);
  return concreteTasks.length === 1 ? concreteTasks[0].id : "";
}

function addRouteModuleStep(operationKind = "operation", taskId = "") {
  const route = getActiveRouteForModule();
  if (!route) return;
  const steps = getRouteStepsForModule(route.id);
  const targetTaskId = getRouteStepAddTargetTaskId(route, taskId);
  if (!targetTaskId) {
    alert("Выберите раздел изделия в таблице операций маршрута и добавьте операцию внутри его строки.");
    return;
  }
  const taskSteps = getRouteStepsForTask(steps, targetTaskId);
  const outputReceiptStep = taskSteps.find((step) => isManufacturingOutputReceiptRouteStep(step));
  const isWarehouse = operationKind === "warehouse";
  const operation = isWarehouse ? getDefaultOperationMapItemForRouteKind(operationKind) : null;
  if (isWarehouse && !operation) {
    alert(isWarehouse
      ? "Создайте операцию приемки результата в справочнике операций, затем добавьте ее в маршрут."
      : "Создайте операцию в справочнике операций, затем добавьте ее в маршрут.");
    return;
  }
  const insertOrder = isWarehouse
    ? Math.max(0, ...taskSteps.map((step) => Number(step.stepOrder || 0))) + 1
    : outputReceiptStep?.stepOrder || Math.max(0, ...taskSteps.map((step) => Number(step.stepOrder || 0))) + 1;
  const stamp = new Date().toISOString();
  const nextStep = applyRouteTaskToStep(
    isWarehouse
      ? createRouteStepFromOperationMapItem(route, operation, insertOrder, stamp)
      : createEmptyRouteModuleStep(route, insertOrder, stamp),
    route,
    targetTaskId,
  );

  planningState.routeSteps = [
    ...planningState.routeSteps.map((step) => (
      step.routeId === route.id && getRouteStepTaskId(step) === targetTaskId && Number(step.stepOrder || 0) >= insertOrder
        ? { ...step, stepOrder: Number(step.stepOrder || 0) + 1 }
        : step
    )),
    nextStep,
  ];
  normalizeRouteStepOrders(route.id, targetTaskId);
  persistState();
  notifySaveSuccess(isWarehouse ? "Приемка результата добавлена" : "Строка операции добавлена");
  render();
}

function moveRouteStep(stepId, direction) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step) return;
  const taskId = getRouteStepTaskId(step);
  const steps = getRouteStepsForTask(getRouteStepsForModule(step.routeId), taskId);
  const index = steps.findIndex((item) => item.id === stepId);
  if (index < 0) return;
  const target = steps[index + direction];
  if (!target) return;
  const leftOrder = step.stepOrder;
  const rightOrder = target.stepOrder;
  planningState.routeSteps = planningState.routeSteps.map((item) => {
    if (item.id === step.id) return { ...item, stepOrder: rightOrder, updatedAt: new Date().toISOString() };
    if (item.id === target.id) return { ...item, stepOrder: leftOrder, updatedAt: new Date().toISOString() };
    return item;
  });
  normalizeRouteStepOrders(step.routeId, taskId);
  persistState();
  notifySaveSuccess("Порядок операций сохранен");
  render();
}

function normalizeRouteStepOrders(routeId, taskId = null) {
  const sourceSteps = getRouteStepsForModule(routeId)
    .filter((step) => !taskId || getRouteStepTaskId(step) === taskId);
  const orderedIds = sourceSteps.map((step) => step.id);
  planningState.routeSteps = planningState.routeSteps.map((step) => {
    const index = orderedIds.indexOf(step.id);
    return index >= 0 ? { ...step, stepOrder: index + 1 } : step;
  });
}

function deleteRouteStepConfirmed(stepId) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step) return;
  if (isManufacturingOutputReceiptRouteStep(step)) {
    alert("Приемка результата должна оставаться конечным этапом маршрута.");
    return;
  }
  const routeId = step.routeId;
  const taskId = getRouteStepTaskId(step);
  planningState.routeSteps = planningState.routeSteps.filter((item) => item.id !== stepId);
  normalizeRouteStepOrders(routeId, taskId);
  withPlanningEntityRemovalAllowed(() => persistState());
  notifySaveSuccess("Операция маршрута удалена");
  render();
}

  let productsEventsApi = null;
  let productsEventsLoad = null;

  function getProductsEventsDependencies() {
    return {
      addMs,
      app,
      batchIds,
      BOARD_SPEC_TERM,
      boardsPerPanel,
      BOM_COMPONENT_FIELDS,
      bomId,
      bomListId,
      buildDefaultSpecificationStructureItems,
      button,
      createSpekiSpecification,
      deleteDirectoryStateRow,
      departmentName,
      element,
      entry,
      ensureNomenclatureTypeExists,
      findOperationMapItemByNameAndWorkCenter,
      form,
      getDefaultStructureFulfillmentMode,
      getDefaultStructureNomenclatureType,
      getExecutionTypeForFulfillmentMode,
      getActiveSpecificationForModule,
      getBomImportRows,
      getBomList,
      getNomenclatureDeleteUsage,
      getNomenclatureItem,
      getOperationMapItem,
      getOperationRouteWorkCenterId,
      getSlotPlanningOrderId,
      getSlotRouteId,
      getSpecificationItemFulfillmentMode,
      getSpecificationStructureItems,
      getWorkCenter,
      importHeaders,
      importRows,
      importBomFromXlsxFile,
      input,
      isSchedulableFulfillmentMode,
      items,
      makeId,
      mergeFallback,
      NOMENCLATURE_REA_COMPONENT_TYPE,
      normalizeBoardsPerPanel,
      normalizeDirectoryRow,
      normalizeDirectoryState,
      normalizeOptionalPositiveInteger,
      normalizePlanningState,
      normalizeNomenclatureType,
      normalizeSpecificationStructureItem,
      normalizeStructureFulfillmentMode,
      note,
      notifySaveSuccess,
      openConfirmDialog,
      operationName,
      option,
      parentId,
      persistDirectoryState,
      persistDirectoryStateDurably,
      persistDirectoryStateWithRemoval,
      persistState,
      persistUiState,
      pickDefaultBomForSpecificationItem,
      PRODUCT_COMPOSITION_TERM,
      recordDirectoryEntityDeletion,
      render,
      resolveWorkCenterIdFromName,
      route,
      routeId,
      slot,
      slotMatchesProductionContext,
      status,
      step,
      structureItems,
      syncSpecificationDerivedFields,
      toDateInput,
      unit,
      upsertBomResultToNomenclature,
      withDirectoryEntityRemovalAllowed,
      withPlanningEntityRemovalAllowed,
      getUi: () => ui,
      getPlanningState: () => planningState,
      getDirectoryState: () => directoryState,
      setPlanningState: (nextState) => dependencies.setPlanningState?.(nextState),
      setDirectoryState: (nextState) => dependencies.setDirectoryState?.(nextState),
    };
  }

  async function ensureProductsEvents() {
    if (productsEventsApi) return productsEventsApi;
    if (!productsEventsLoad) {
      productsEventsLoad = Promise.resolve()
        .then(() => loadProductsEventsModule())
        .then((module) => {
          const createProductsEventsModule = module?.createProductsEventsModule;
          if (typeof createProductsEventsModule !== "function") {
            throw new Error("Products events runtime did not export its factory");
          }
          productsEventsApi = createProductsEventsModule(getProductsEventsDependencies());
          return productsEventsApi;
        })
        .catch((error) => {
          productsEventsLoad = null;
          throw error;
        });
    }
    return productsEventsLoad;
  }

  function bindProductsEvents(method, ...args) {
    const bind = (api) => api?.[method]?.(...args);
    if (productsEventsApi) {
      bind(productsEventsApi);
      return;
    }
    const renderRoot = app.firstElementChild;
    void ensureProductsEvents()
      .then((api) => {
        if (app.firstElementChild !== renderRoot) return;
        bind(api);
      })
      .catch((error) => console.error(`[MES routes] ${method} runtime failed to load`, error));
  }

  async function callProductsEvents(method, ...args) {
    const api = await ensureProductsEvents();
    const handler = api?.[method];
    if (typeof handler !== "function") throw new Error(`Products events command is unavailable: ${method}`);
    return handler(...args);
  }

  function bindSpekiEvents(...args) {
    bindProductsEvents("bindSpekiEvents", ...args);
  }

  function bindNomenclatureEvents(...args) {
    bindProductsEvents("bindNomenclatureEvents", ...args);
  }

  function saveNomenclatureCommand(...args) {
    return callProductsEvents("saveNomenclatureCommand", ...args);
  }

  function deleteNomenclatureCommand(...args) {
    return callProductsEvents("deleteNomenclatureCommand", ...args);
  }

  function bindBomListsEvents(...args) {
    bindProductsEvents("bindBomListsEvents", ...args);
  }

  function saveBomCommand(...args) {
    return callProductsEvents("saveBomCommand", ...args);
  }

  function deleteBomCommand(...args) {
    return callProductsEvents("deleteBomCommand", ...args);
  }


  return {
    bindRoutesEvents,
    bindSpekiEvents,
    saveRouteModuleForm,
    updateRouteProject,
    updateRouteStepField,
    appendRouteTaskTemplateSteps,
    seedRouteTaskTemplate,
    seedAllRouteTaskTemplates,
    getDefaultOperationMapItemForRouteKind,
    createRouteStepFromOperationMapItem,
    createEmptyRouteModuleStep,
    bindNomenclatureEvents,
    saveNomenclatureCommand,
    deleteNomenclatureCommand,
    bindBomListsEvents,
    saveBomCommand,
    deleteBomCommand,
    getRouteStepAddTargetTaskId,
    addRouteModuleStep,
    moveRouteStep,
    normalizeRouteStepOrders,
    deleteRouteStepConfirmed,
  };
}
