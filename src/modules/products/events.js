export function createProductsEventsModule(dependencies = {}) {
  const {
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
    getBomList,
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

  function replaceDirectoryState(nextState) {
    dependencies.setDirectoryState?.(nextState);
  }

  function replacePlanningState(nextState) {
    dependencies.setPlanningState?.(nextState);
  }

  function clearSpekiStaleItem(itemId = "") {
    if (!itemId || !Array.isArray(ui.spekiStaleItemIds) || !ui.spekiStaleItemIds.length) return;
    ui.spekiStaleItemIds = ui.spekiStaleItemIds.filter((id) => id !== itemId);
  }

  function normalizeSpekiLookupText(value = "") {
    return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  }

  function getSpekiStructureSectionOptions() {
    return (directoryState.nomenclatureTypes || [])
      .filter((item) => item?.status !== "Отключен")
      .map((item) => ({ value: normalizeNomenclatureType(item?.name || "") }))
      .filter((item) => item.value);
  }

  function getFallbackNomenclatureType() {
    return getSpekiStructureSectionOptions()[0]?.value || getDefaultStructureNomenclatureType("nomenclature");
  }

  function getSpekiStructureTableRows(specification) {
    const sourceItems = getSpecificationStructureItems(specification)
      .filter((item) => ["bom", "specification", "nomenclature", "part"].includes(item.type));
    const visibleIds = new Set(sourceItems.map((item) => item.id));
    const byParent = new Map();
    sourceItems.forEach((item) => {
      const parentId = item.parentId && visibleIds.has(item.parentId) ? item.parentId : "root";
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push(item);
    });
    const rows = [];
    const visited = new Set();
    const appendChildren = (parentId, path, level) => {
      const siblings = byParent.get(parentId) || [];
      siblings.forEach((item, index) => {
        if (visited.has(item.id)) return;
        const nextPath = [...path, index + 1];
        visited.add(item.id);
        rows.push({ item, number: nextPath.join("."), level });
        appendChildren(item.id, nextPath, level + 1);
      });
    };
    appendChildren("root", [], 0);
    sourceItems.forEach((item) => {
      if (!visited.has(item.id)) rows.push({ item, number: String(rows.length + 1), level: 0 });
    });
    return rows;
  }

function bindSpekiEvents() {
  app.querySelector("[data-speki-create-specification]")?.addEventListener("click", () => {
    createSpekiSpecification();
  });

  app.querySelectorAll("[data-speki-spec-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const specificationId = button.dataset.spekiSpecOpen || "";
      const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
      if (!specification) return;
      ui.activeSpecificationId = specification.id;
      ui.activeProjectId = specification.id;
      ui.spekiEditingId = "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-speki-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const specificationId = button.dataset.spekiEdit || "";
      if (!specificationId) return;
      ui.spekiEditingId = specificationId;
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-speki-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const specificationId = button.dataset.spekiSave || "";
      const nameInput = [...app.querySelectorAll("[data-speki-spec-name]")]
        .find((input) => input.dataset.spekiSpecName === specificationId);
      const outputInput = [...app.querySelectorAll("[data-speki-spec-output]")]
        .find((input) => input.dataset.spekiSpecOutput === specificationId);
      const revisionInput = [...app.querySelectorAll("[data-speki-spec-revision]")]
        .find((input) => input.dataset.spekiSpecRevision === specificationId);
      const statusInput = [...app.querySelectorAll("[data-speki-spec-status]")]
        .find((input) => input.dataset.spekiSpecStatus === specificationId);
      saveSpekiSpecification(specificationId, {
        name: nameInput?.value || "",
        outputNomenclatureId: outputInput?.value || "",
        revision: revisionInput?.value || "01",
        lifecycleStatus: statusInput?.value || "draft",
      });
    });
  });

  app.querySelectorAll("[data-speki-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("spekiDeleteSpecification", { specificationId: button.dataset.spekiDelete || "" });
    });
  });

  app.querySelectorAll("[data-speki-add-row]").forEach((button) => {
    button.addEventListener("click", () => {
      const activeSpecification = getActiveSpecificationForModule();
      if (activeSpecification?.id) {
        ui.spekiEditingId = activeSpecification.id;
      }
      addSpecificationStructureItem(button.dataset.spekiAddRow || "nomenclature");
    });
  });

  app.querySelectorAll("[data-speki-structure-input]").forEach((field) => {
    const commit = () => {
      updateSpecificationStructureItem(
        field.dataset.spekiStructureInput || "",
        field.dataset.spekiStructureField || "",
        field.value,
      );
    };
    field.addEventListener("change", commit);
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      field.blur();
      commit();
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-type] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-type]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureType || "", "type", button.dataset.denseValue || "nomenclature");
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-nomenclature-type] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-nomenclature-type]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureNomenclatureType || "", "nomenclatureType", button.dataset.denseValue || NOMENCLATURE_REA_COMPONENT_TYPE);
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-specification] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-specification]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureSpecification || "", "specificationId", button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-bom] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-bom]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureBom || "", "bomListId", button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-nomenclature] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-nomenclature]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureNomenclature || "", "nomenclatureId", button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-fulfillment] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-fulfillment]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureFulfillment || "", "fulfillmentMode", button.dataset.denseValue || "not_selected");
    });
  });

  app.querySelectorAll("[data-speki-structure-up]").forEach((button) => {
    button.addEventListener("click", () => moveSpecificationStructureItem(button.dataset.spekiStructureUp || "", -1));
  });

  app.querySelectorAll("[data-speki-structure-down]").forEach((button) => {
    button.addEventListener("click", () => moveSpecificationStructureItem(button.dataset.spekiStructureDown || "", 1));
  });

  app.querySelectorAll("[data-speki-structure-indent]").forEach((button) => {
    button.addEventListener("click", () => changeSpekiStructureLevel(button.dataset.spekiStructureIndent || "", 1));
  });

  app.querySelectorAll("[data-speki-structure-outdent]").forEach((button) => {
    button.addEventListener("click", () => changeSpekiStructureLevel(button.dataset.spekiStructureOutdent || "", -1));
  });

  app.querySelectorAll("[data-speki-structure-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteSpecificationStructureItem(button.dataset.spekiStructureDelete || ""));
  });

}

function updateSpecificationStructure(updater) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification) {
    alert("Сначала сохраните карточку состава изделия.");
    return;
  }

  const currentItems = getSpecificationStructureItems(activeSpecification);
  const nextItems = updater(currentItems)
    .map((item, index) => normalizeSpecificationStructureItem({ ...item, position: index + 1 }, index));
  const nextSpecification = syncSpecificationDerivedFields({
    ...activeSpecification,
    structureManaged: true,
    structureItems: nextItems,
    updatedAt: new Date().toISOString(),
  });

  directoryState.specifications = (directoryState.specifications || []).map((specification) => (
    specification.id === activeSpecification.id ? nextSpecification : specification
  ));
  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("Структура состава изделия сохранена");
  render();
}

function addSpecificationStructureItem(type) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification) {
    alert("Сначала сохраните карточку состава изделия.");
    return;
  }

  const allowedTypes = new Set(["bom", "specification", "part", "nomenclature"]);
  const nextType = allowedTypes.has(type) ? type : "nomenclature";
  const currentItems = getSpecificationStructureItems(activeSpecification);
  const linkedSpecification = (directoryState.specifications || []).find((specification) => specification.id !== activeSpecification.id) || null;
  const defaultBom = pickDefaultBomForSpecificationItem(activeSpecification, currentItems);
  const nomenclatureItem = (directoryState.nomenclature || [])[0] || null;
  const executionType = nextType === "nomenclature" || nextType === "part" ? getDefaultNomenclatureExecutionType(nomenclatureItem) : "make";
  const fulfillmentMode = executionType === "make" ? "produce" : "purchase";
  const nomenclatureType = normalizeNomenclatureType(nomenclatureItem?.type || getDefaultStructureNomenclatureType(nextType));
  updateSpecificationStructure((items) => [
    ...items,
    normalizeSpecificationStructureItem({
      id: makeId("spi"),
      parentId: "root",
	      type: nextType,
	      bomListId: nextType === "bom" ? defaultBom?.id || "" : "",
	      specificationId: nextType === "specification" ? linkedSpecification?.id || "" : "",
	      nomenclatureId: nextType === "nomenclature" ? nomenclatureItem?.id || "" : "",
	      nomenclatureType,
	      executionType,
      fulfillmentMode,
      operationId: "",
      operationName: "",
      departmentName: "",
	      name: nextType === "specification"
	          ? linkedSpecification?.name || "Вложенный состав изделия"
	          : nextType === "bom"
	            ? defaultBom?.name || "Плата не выбрана"
	            : nomenclatureItem?.name || "Номенклатура не выбрана",
	      quantity: 1,
	      unit: nextType === "bom" ? "плата" : nextType === "specification" ? "изд." : nomenclatureItem?.unit || "шт.",
	      boardsPerPanel: 1,
	      resultItem: nextType === "specification"
	          ? linkedSpecification?.outputItem || ""
	          : nextType === "bom"
	            ? defaultBom?.resultItem || defaultBom?.boardCode || ""
	            : nomenclatureItem?.name || "",
	      note: nextType === "bom" ? BOARD_SPEC_TERM : nextType === "specification" ? PRODUCT_COMPOSITION_TERM : nextType === "nomenclature" ? "Номенклатура" : "",
      position: items.length + 1,
    }, items.length),
  ]);
}

function getDefaultNomenclatureExecutionType(item) {
  const type = normalizeNomenclatureType(item?.type);
  if (item?.sourceBomResultId) return "make";
  return type === "Производимые изделия" || type === "Производимые узлы" ? "make" : "buy";
}

function getDefaultSpekiOperationForNomenclature(item, executionType) {
  return "";
}

function updateSpecificationStructureItem(itemId, field, value) {
  if (!itemId || !field) return;
  clearSpekiStaleItem(itemId);
  updateSpecificationStructure((items) => {
    const descendantIds = getSpecificationStructureDescendantIds(itemId, items);
    let shouldMoveChildrenToRoot = false;
    const nextItems = items.map((item) => {
      if (item.id !== itemId) return item;
      const nextItem = { ...item };

      if (field === "type") {
        nextItem.type = ["bom", "specification", "part", "nomenclature"].includes(value) ? value : "nomenclature";
        const selectedNomenclature = nextItem.type === "nomenclature"
          ? (directoryState.nomenclature || []).find((entry) => entry.id === nextItem.nomenclatureId) || (directoryState.nomenclature || [])[0]
          : null;
        nextItem.nomenclatureType = normalizeNomenclatureType(selectedNomenclature?.type || getDefaultStructureNomenclatureType(nextItem.type));
        nextItem.fulfillmentMode = getDefaultStructureFulfillmentMode(nextItem.type, selectedNomenclature, "");
        nextItem.executionType = getExecutionTypeForFulfillmentMode(nextItem.fulfillmentMode);
        nextItem.operationId = "";
        nextItem.operationName = "";
        nextItem.departmentName = "";
        shouldMoveChildrenToRoot = false;
        if (nextItem.type !== "bom") {
          nextItem.bomListId = "";
          nextItem.boardsPerPanel = 1;
        }
        if (nextItem.type !== "specification") {
          nextItem.specificationId = "";
        }
        if (nextItem.type !== "nomenclature") {
          nextItem.nomenclatureId = "";
        }
        if (nextItem.type === "bom" && !nextItem.bomListId) {
          const defaultBom = pickDefaultBomForSpecificationItem(getActiveSpecificationForModule(), items, itemId);
          nextItem.bomListId = defaultBom?.id || "";
          nextItem.boardsPerPanel = normalizeBoardsPerPanel(nextItem.boardsPerPanel, 1);
        }
        if (nextItem.type === "specification" && !nextItem.specificationId) {
          const activeSpecification = getActiveSpecificationForModule();
          const linkedSpecification = (directoryState.specifications || []).find((specification) => specification.id !== activeSpecification?.id);
          nextItem.specificationId = linkedSpecification?.id || "";
        }
        if (nextItem.type === "nomenclature" && !nextItem.nomenclatureId) {
          nextItem.nomenclatureId = (directoryState.nomenclature || [])[0]?.id || "";
        }
        const bom = nextItem.type === "bom" ? getBomList(nextItem.bomListId) : null;
        const linkedSpecification = nextItem.type === "specification"
          ? (directoryState.specifications || []).find((specification) => specification.id === nextItem.specificationId)
          : null;
        const nomenclatureItem = nextItem.type === "nomenclature"
          ? (directoryState.nomenclature || []).find((entry) => entry.id === nextItem.nomenclatureId)
          : null;
        nextItem.name = nextItem.type === "bom"
          ? bom?.name || nextItem.name
          : nextItem.type === "specification"
            ? linkedSpecification?.name || nextItem.name || "Вложенный состав изделия"
            : nextItem.type === "nomenclature"
              ? nomenclatureItem?.name || nextItem.name || "Номенклатура не выбрана"
              : nextItem.name || "Новая позиция";
        nextItem.unit = nextItem.type === "bom" ? "плата" : nextItem.type === "specification" ? "состав" : nextItem.type === "nomenclature" ? nomenclatureItem?.unit || nextItem.unit || "шт." : nextItem.unit || "шт.";
        nextItem.resultItem = nextItem.type === "bom"
          ? bom?.resultItem || bom?.boardCode || ""
          : nextItem.type === "specification"
            ? linkedSpecification?.outputItem || ""
            : nextItem.type === "nomenclature"
              ? nomenclatureItem?.name || nextItem.resultItem || ""
              : nextItem.resultItem;
        return nextItem;
      }

      if (field === "bomListId") {
        const bom = getBomList(value);
        nextItem.bomListId = bom?.id || "";
        nextItem.name = bom?.name || "";
        nextItem.resultItem = bom?.resultItem || bom?.boardCode || "";
        nextItem.boardsPerPanel = normalizeBoardsPerPanel(nextItem.boardsPerPanel, 1);
        if (!nextItem.note) nextItem.note = BOARD_SPEC_TERM;
        return nextItem;
      }

      if (field === "specificationId") {
        const activeSpecification = getActiveSpecificationForModule();
        const linkedSpecification = (directoryState.specifications || [])
          .find((specification) => specification.id === value && specification.id !== activeSpecification?.id);
        nextItem.specificationId = linkedSpecification?.id || "";
        nextItem.name = linkedSpecification?.name || "";
        nextItem.resultItem = linkedSpecification?.outputItem || "";
        if (!nextItem.note) nextItem.note = PRODUCT_COMPOSITION_TERM;
        return nextItem;
      }

      if (field === "nomenclatureId") {
        const nomenclatureItem = (directoryState.nomenclature || []).find((entry) => entry.id === value);
        nextItem.nomenclatureId = nomenclatureItem?.id || "";
        nextItem.nomenclatureType = normalizeNomenclatureType(nomenclatureItem?.type || nextItem.nomenclatureType || getDefaultStructureNomenclatureType(nextItem.type));
        nextItem.name = nomenclatureItem?.name || "";
        nextItem.resultItem = nomenclatureItem?.name || "";
        nextItem.unit = nomenclatureItem?.unit || nextItem.unit || "шт.";
        nextItem.fulfillmentMode = getDefaultStructureFulfillmentMode(nextItem.type, nomenclatureItem, "");
        nextItem.executionType = getExecutionTypeForFulfillmentMode(nextItem.fulfillmentMode);
        nextItem.operationId = "";
        nextItem.operationName = "";
        nextItem.departmentName = "";
        if (!nextItem.note) nextItem.note = "Номенклатура";
        return nextItem;
      }

      if (field === "nomenclatureType") {
        const nextType = normalizeNomenclatureType(value);
        const typeExists = getSpekiStructureSectionOptions()
          .some((option) => normalizeSpekiLookupText(option.value) === normalizeSpekiLookupText(nextType));
        const safeType = typeExists ? nextType : getFallbackNomenclatureType() || NOMENCLATURE_REA_COMPONENT_TYPE;
        nextItem.nomenclatureType = safeType;

        if (nextItem.type === "nomenclature" || nextItem.type === "part") {
          const currentItem = (directoryState.nomenclature || []).find((entry) => entry.id === nextItem.nomenclatureId);
          const currentMatches = currentItem && normalizeSpekiLookupText(normalizeNomenclatureType(currentItem.type)) === normalizeSpekiLookupText(safeType);
          const replacementItem = currentMatches
            ? currentItem
            : (directoryState.nomenclature || []).find((entry) => normalizeSpekiLookupText(normalizeNomenclatureType(entry.type)) === normalizeSpekiLookupText(safeType));

          nextItem.type = "nomenclature";
          nextItem.nomenclatureId = replacementItem?.id || "";
          nextItem.name = replacementItem?.name || "";
          nextItem.resultItem = replacementItem?.name || "";
          nextItem.unit = replacementItem?.unit || nextItem.unit || "шт.";
          nextItem.fulfillmentMode = getDefaultStructureFulfillmentMode(nextItem.type, replacementItem, "");
          nextItem.executionType = getExecutionTypeForFulfillmentMode(nextItem.fulfillmentMode);
          nextItem.operationId = "";
          nextItem.operationName = "";
          nextItem.departmentName = "";
          if (!nextItem.note) nextItem.note = "Номенклатура";
        }
        return nextItem;
      }

      if (field === "parentId") {
        const nextParent = value && value !== itemId && !descendantIds.has(value) ? value : "root";
        nextItem.parentId = nextParent || "root";
        return nextItem;
      }

      if (field === "executionType") {
        nextItem.executionType = value === "buy" ? "buy" : "make";
        nextItem.fulfillmentMode = nextItem.executionType === "make" ? "produce" : "purchase";
        if (nextItem.executionType === "buy") {
          nextItem.operationId = "";
          nextItem.operationName = "";
          nextItem.departmentName = "";
        }
        return nextItem;
      }

      if (field === "fulfillmentMode") {
        nextItem.fulfillmentMode = normalizeStructureFulfillmentMode(value, getSpecificationItemFulfillmentMode(nextItem));
        nextItem.executionType = getExecutionTypeForFulfillmentMode(nextItem.fulfillmentMode);
        if (!isSchedulableFulfillmentMode(nextItem.fulfillmentMode)) {
          nextItem.operationId = "";
          nextItem.operationName = "";
          nextItem.departmentName = "";
        }
        if (nextItem.fulfillmentMode === "from_stock") {
          nextItem.operationName = nextItem.operationName || "Выдача со склада";
          nextItem.departmentName = nextItem.departmentName || "Склад";
        }
        return nextItem;
      }

      if (field === "operationId") {
        const operation = getOperationMapItem(value);
        nextItem.operationId = operation?.id || "";
        nextItem.operationName = operation?.name || "";
        nextItem.departmentName = operation ? getWorkCenter(getOperationRouteWorkCenterId(operation))?.name || "" : "";
        return nextItem;
      }

      if (field === "operationName") {
        const operation = getOperationMapItem(value) || findOperationMapItemByNameAndWorkCenter(value, resolveWorkCenterIdFromName(nextItem.departmentName));
        nextItem.operationId = operation?.id || "";
        nextItem.operationName = operation?.name || "";
        nextItem.departmentName = operation ? getWorkCenter(getOperationRouteWorkCenterId(operation))?.name || "" : "";
        return nextItem;
      }

      if (field === "departmentName") {
        nextItem.departmentName = String(value || "").trim();
        return nextItem;
      }

      if (field === "quantity") {
        const quantity = Number(value || 0);
        nextItem.quantity = Number.isFinite(quantity) && quantity >= 0 ? Math.round(quantity) : 0;
        return nextItem;
      }

      if (field === "boardsPerPanel") {
        nextItem.boardsPerPanel = nextItem.type === "bom" ? normalizeBoardsPerPanel(value, 1) : 1;
        return nextItem;
      }

      if (["name", "unit", "note", "resultItem"].includes(field)) {
        nextItem[field] = String(value || "").trim();
      }
      return nextItem;
    });
    return shouldMoveChildrenToRoot
      ? nextItems.map((item) => item.parentId === itemId ? { ...item, parentId: "root" } : item)
      : nextItems;
  });
}

function getSpecificationStructureDescendantIds(parentId, items) {
  const descendants = new Set();
  const collect = (id) => {
    items
      .filter((item) => item.parentId === id && !descendants.has(item.id))
      .forEach((item) => {
        descendants.add(item.id);
        collect(item.id);
      });
  };
  collect(parentId);
  return descendants;
}

function changeSpekiStructureLevel(itemId, direction) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification || !itemId || !direction) return;

  const rows = getSpekiStructureTableRows(activeSpecification);
  const rowIndex = rows.findIndex((row) => row.item.id === itemId);
  if (rowIndex < 0) return;

  if (direction > 0) {
    const previousRow = rows[rowIndex - 1];
    if (!previousRow) return;
    updateSpecificationStructureItem(itemId, "parentId", previousRow.item.id);
    return;
  }

  const currentItem = rows[rowIndex].item;
  const parentItem = getSpecificationStructureItems(activeSpecification)
    .find((item) => item.id === currentItem.parentId);
  updateSpecificationStructureItem(itemId, "parentId", parentItem?.parentId || "root");
}

function saveSpekiSpecification(specificationId, values = {}) {
  if (!specificationId) return;
  const name = String(values.name || "").trim() || "Изделие без названия";
  const outputNomenclatureId = String(values.outputNomenclatureId || "").trim();
  if (!outputNomenclatureId) {
    alert("Выберите единственное результирующее изделие спецификации.");
    return;
  }
  const outputNomenclature = (directoryState.nomenclature || []).find((item) => item.id === outputNomenclatureId);
  if (!outputNomenclature) {
    alert("Результирующая номенклатурная позиция не найдена.");
    return;
  }
  const revision = String(values.revision || "01").trim() || "01";
  const lifecycleStatus = ["draft", "agreed", "active", "archived", "superseded"].includes(values.lifecycleStatus)
    ? values.lifecycleStatus
    : "draft";
  directoryState.specifications = (directoryState.specifications || []).map((specification) => (
    specification.id === specificationId
      ? {
          ...specification,
          name,
          outputNomenclatureId,
          outputItem: outputNomenclature.name || specification.outputItem || name,
          revision,
          lifecycleStatus,
          updatedAt: new Date().toISOString(),
        }
      : specification
  ));
  directoryState.nomenclature = (directoryState.nomenclature || []).map((item) => (
    item.id === outputNomenclatureId
      ? { ...item, producedBySpecificationId: specificationId, updatedAt: new Date().toISOString() }
      : item
  ));
  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  ui.activeSpecificationId = specificationId;
  ui.spekiEditingId = "";
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("Изделие сохранено");
  render();
}

function getSpecificationDeleteUsage(specificationId) {
  const routeIds = new Set((planningState.routes || [])
    .filter((route) => (
      route.id === specificationId
      || route.specificationId === specificationId
      || route.projectId === specificationId
    ))
    .map((route) => route.id));
  const routeStepIds = new Set((planningState.routeSteps || [])
    .filter((step) => routeIds.has(step.routeId))
    .map((step) => step.id));
  const slotsCount = (planningState.slots || []).filter((slot) => (
    routeIds.has(getSlotRouteId(slot, planningState))
    || routeStepIds.has(slot.routeStepId)
    || routeIds.has(getSlotPlanningOrderId(slot))
    || slotMatchesProductionContext(slot, specificationId)
  )).length;

  return {
    routeIds,
    routeStepIds,
    batchIds: new Set(),
    routesCount: routeIds.size,
    batchesCount: 0,
    slotsCount,
  };
}

function deleteSpekiSpecification(specificationId) {
  if (!specificationId) return;
  const usage = getSpecificationDeleteUsage(specificationId);
  recordDirectoryEntityDeletion("specifications", specificationId);
  directoryState.specifications = (directoryState.specifications || [])
    .filter((specification) => specification.id !== specificationId)
    .map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification)
        .filter((item) => item.specificationId !== specificationId),
    }));

  planningState.routes = (planningState.routes || []).filter((route) => !usage.routeIds.has(route.id));
  planningState.routeSteps = (planningState.routeSteps || []).filter((step) => !usage.routeIds.has(step.routeId));
  planningState.slots = (planningState.slots || []).filter((slot) => (
    !usage.routeIds.has(getSlotRouteId(slot, planningState))
    && !usage.routeStepIds.has(slot.routeStepId)
    && !usage.routeIds.has(getSlotPlanningOrderId(slot))
    && !slotMatchesProductionContext(slot, specificationId)
  ));

  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  replacePlanningState(normalizePlanningState(planningState));
  ui.activeSpecificationId = "";
  ui.activeProjectId = "";
  if (usage.routeIds.has(ui.activeRouteId)) ui.activeRouteId = "";
  if ((planningState.slots || []).every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
  ui.expandedProjects?.delete?.(specificationId);
  usage.routeIds.forEach((routeId) => ui.expandedProjects?.delete?.(routeId));
  ui.spekiEditingId = "";
  ui.spekiCheckedSpecificationId = "";
  ui.spekiStaleItemIds = [];
  withPlanningEntityRemovalAllowed(() => persistState());
  withDirectoryEntityRemovalAllowed(() => persistDirectoryState());
  persistUiState();
  render();
}

function moveSpecificationStructureItem(itemId, direction) {
  if (!itemId || !direction) return;
  updateSpecificationStructure((items) => {
    const index = items.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return items;
    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    return nextItems;
  });
}

function deleteSpecificationStructureItem(itemId) {
  if (!itemId) return;
  clearSpekiStaleItem(itemId);
  ui.spekiCollapsedBomIds = (ui.spekiCollapsedBomIds || []).filter((id) => id !== itemId);
  updateSpecificationStructure((items) => items
    .filter((item) => item.id !== itemId)
    .map((item) => item.parentId === itemId ? { ...item, parentId: "root" } : item));
}

function bindNomenclatureEvents() {
  app.querySelectorAll("[data-nomenclature-pane]").forEach((button) => {
    button.addEventListener("click", () => {
      const pane = button.dataset.nomenclaturePane === "boards" ? "boards" : "items";
      ui.activeNomenclaturePane = pane;
      if (pane === "items") {
        ui.activeBomId = "";
      } else {
        ui.activeNomenclatureId = "";
      }
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-nomenclature-create]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeNomenclaturePane = "items";
      ui.activeNomenclatureId = "__new__";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-nomenclature-type-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeNomenclaturePane = "items";
      ui.activeBomId = "";
      ui.nomenclatureTypeFilter = button.dataset.nomenclatureTypeFilter || "all";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-dense-nomenclature-type] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const value = button.dataset.denseValue || NOMENCLATURE_REA_COMPONENT_TYPE;
      const hidden = app.querySelector("[data-nomenclature-type-hidden]");
      const root = button.closest("[data-dense-nomenclature-type]");
      if (hidden) {
        hidden.value = value;
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
      root?.querySelector("summary strong")?.replaceChildren(document.createTextNode(button.querySelector("strong")?.textContent || value));
      root?.querySelector("summary small")?.replaceChildren(document.createTextNode(button.querySelector("small")?.textContent || ""));
      root?.removeAttribute("open");
    });
  });

  app.querySelectorAll("[data-nomenclature-open], [data-nomenclature-row-open]").forEach((element) => {
    element.addEventListener("click", () => {
      ui.activeNomenclatureId = element.dataset.nomenclatureOpen || element.dataset.nomenclatureRowOpen || "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-nomenclature-delete], [data-nomenclature-row-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const itemId = button.dataset.nomenclatureDelete || button.dataset.nomenclatureRowDelete || "";
      if (!itemId) return;
      openConfirmDialog("nomenclatureDeleteItem", { itemId });
    });
  });

  app.querySelector("#nomenclatureForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNomenclatureForm(event.currentTarget);
  });
}

function saveNomenclatureCommand(command = {}) {
  const isNew = command.isNew === true;
  const id = isNew ? makeId("nom") : String(command.itemId || makeId("nom"));
  const name = String(command.name || "").trim();
  if (!name) return { ok: false, code: "name-required", message: "Заполните наименование позиции номенклатуры." };
  const customType = String(command.customType || "").trim();
  const type = normalizeNomenclatureType(customType || command.type);
  ensureNomenclatureTypeExists(type);

  const row = normalizeDirectoryRow("nomenclature", {
    id,
    name,
    article: String(command.article || "").trim(),
    type,
    package: String(command.package || "").trim(),
    unit: String(command.unit || "шт.").trim(),
    manufacturer: String(command.manufacturer || "").trim(),
    description: String(command.description || "").trim(),
    status: String(command.status || "Активен").trim(),
    updatedAt: new Date().toISOString(),
  });

  directoryState.nomenclature = isNew
    ? [...(directoryState.nomenclature || []), row]
    : (directoryState.nomenclature || []).map((item) => item.id === id ? { ...item, ...row } : item);
  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  ui.activeNomenclatureId = id;
  ui.nomenclatureTypeFilter = type;
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess(isNew ? "Позиция номенклатуры создана" : "Позиция номенклатуры сохранена");
  render();
  return { ok: true, id, isNew, row };
}

function saveNomenclatureForm(form) {
  const data = new FormData(form);
  const result = saveNomenclatureCommand({
    isNew: data.get("isNew") === "yes",
    itemId: String(data.get("itemId") || ""),
    name: data.get("name"),
    article: data.get("article"),
    type: data.get("type"),
    customType: data.get("customType"),
    package: data.get("package"),
    unit: data.get("unit"),
    manufacturer: data.get("manufacturer"),
    description: data.get("description"),
    status: data.get("status"),
  });
  if (!result.ok) alert(result.message);
  return result;
}

function deleteNomenclatureItem(itemId) {
  const item = getNomenclatureItem(itemId);
  if (!item) return;

  deleteDirectoryStateRow("nomenclature", item);
  persistDirectoryState();
  persistUiState();
  render();
}

function bindBomListsEvents() {
  app.querySelector("[data-bom-create]")?.addEventListener("click", () => {
    ui.activeNomenclaturePane = "boards";
    ui.activeBomId = "__new__";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-bom-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const bom = getBomList(button.dataset.bomOpen);
      if (!bom) return;
      ui.activeNomenclaturePane = "boards";
      ui.activeBomId = bom.id;
      ui.activeProjectId = bom.projectId || ui.activeProjectId || "";
      persistUiState();
      render();
    });
  });

  app.querySelector("#bomModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBomModuleForm(event.currentTarget);
  });

  app.querySelector("[data-bom-delete]")?.addEventListener("click", (event) => {
    openConfirmDialog("bomDeleteList", { bomId: event.currentTarget.dataset.bomDelete || "" });
  });

  app.querySelector("[data-bom-import-file]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await importBomFromXlsxFile(file);
      render();
    } catch (error) {
      alert(error?.message || "Не удалось импортировать BOM из Excel.");
    } finally {
      event.target.value = "";
    }
  });

  app.querySelectorAll("[data-bom-import-cell]").forEach((field) => {
    field.addEventListener("change", () => {
      updateBomImportCell(
        field.dataset.bomImportCell,
        Number(field.dataset.bomRowIndex),
        Number(field.dataset.bomColumnIndex),
        field.value,
      );
      render();
    });
  });

  app.querySelectorAll("[data-bom-import-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteBomImportRow(button.dataset.bomImportDelete, Number(button.dataset.bomRowIndex));
      render();
    });
  });

  app.querySelectorAll("[data-dense-bom-nomenclature] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-bom-nomenclature]");
      const nomenclatureId = button.dataset.denseValue || "";
      if (!root || !nomenclatureId) return;
      addNomenclatureToBom(root.dataset.denseBomNomenclature, nomenclatureId);
      render();
    });
  });

}

function saveSpecificationModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("spec") : String(data.get("specificationId") || makeId("spec"));
  const previousSpecification = (directoryState.specifications || []).find((item) => item.id === id);
  const name = String(data.get("name") || "").trim();
  const productionQuantity = normalizeOptionalPositiveInteger(data.get("productionQuantity"));
  if (!name || !productionQuantity) {
    alert("Заполните название состава изделия и количество к производству.");
    return;
  }

  let row = {
    id,
    name,
    projectId: "",
    outputItem: String(data.get("outputItem") || "").trim(),
    outputNomenclatureId: String(data.get("outputNomenclatureId") || previousSpecification?.outputNomenclatureId || "").trim(),
    revision: String(data.get("revision") || previousSpecification?.revision || "01").trim() || "01",
    lifecycleStatus: String(data.get("lifecycleStatus") || previousSpecification?.lifecycleStatus || "draft"),
    productionQuantity,
    dueDate: String(data.get("dueDate") || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000))),
    orderNumber: String(data.get("orderNumber") || "").trim(),
    customer: String(data.get("customer") || "").trim(),
    bomListA: String(data.get("bomListA") || ""),
    bomQtyA: Math.max(0, Number(data.get("bomQtyA") || 0)),
    bomListB: String(data.get("bomListB") || ""),
    bomQtyB: Math.max(0, Number(data.get("bomQtyB") || 0)),
    extraItems: String(data.get("extraItems") || "").trim(),
    structureManaged: Boolean(previousSpecification?.structureManaged),
    structureItems: previousSpecification?.structureManaged ? getSpecificationStructureItems(previousSpecification) : [],
    updatedAt: new Date().toISOString(),
  };
  if (!row.structureManaged) {
    row.structureItems = buildDefaultSpecificationStructureItems(row);
  }
  row = syncSpecificationDerivedFields(row);

  directoryState.specifications = isNew
    ? [...(directoryState.specifications || []), row]
    : (directoryState.specifications || []).map((item) => item.id === id ? { ...item, ...row } : item);
  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  ui.activeSpecificationId = id;
  ui.activeProjectId = row.id;
  if (row.bomListA) ui.activeBomId = row.bomListA;
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess(isNew ? "Состав изделия создан" : "Состав изделия сохранен");
  render();
}

function saveBomModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("bom") : String(data.get("bomId") || makeId("bom"));
  const previousBom = getBomList(id);
  const name = String(data.get("name") || "").trim();
  const boardCode = String(data.get("boardCode") || "").trim();
  const resultItem = String(data.get("resultItem") || "").trim() || `Печатная плата ${boardCode || name}`;
  if (!name) {
    alert("Заполните название платы.");
    return;
  }

  const row = {
    id,
    name,
    projectId: "",
    boardCode,
    resultItem,
    status: String(previousBom?.status || "Черновик").trim(),
    importHeaders: previousBom?.importHeaders || [],
    importRows: previousBom?.importRows || [],
    importedAt: previousBom?.importedAt || "",
    sourceFileName: previousBom?.sourceFileName || "",
    sourceSheetName: previousBom?.sourceSheetName || "",
    updatedAt: new Date().toISOString(),
  };
  for (const field of BOM_COMPONENT_FIELDS) {
    row[field.key] = data.has(field.key)
      ? Math.max(0, Number(data.get(field.key) || 0))
      : Math.max(0, Number(previousBom?.[field.key] || 0));
  }

  directoryState.bomLists = isNew
    ? [...(directoryState.bomLists || []), row]
    : (directoryState.bomLists || []).map((item) => item.id === id ? { ...item, ...row } : item);

  upsertBomResultToNomenclature(row, row.updatedAt);
  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  ui.activeBomId = id;
  ui.activeProjectId = "";
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess(isNew ? "Плата создана" : "Плата сохранена");
  render();
}

function deleteBomList(bomId) {
  const bom = getBomList(bomId);
  if (!bom) return;

  deleteDirectoryStateRow("bomLists", bom);
  replaceDirectoryState(normalizeDirectoryState(directoryState, { mergeFallback: false }));
  ui.activeBomId = "";

  withDirectoryEntityRemovalAllowed(() => persistDirectoryState());
  persistUiState();
  render();
}


  return {
    bindSpekiEvents,
    updateSpecificationStructure,
    addSpecificationStructureItem,
    getDefaultNomenclatureExecutionType,
    getDefaultSpekiOperationForNomenclature,
    updateSpecificationStructureItem,
    getSpecificationStructureDescendantIds,
    changeSpekiStructureLevel,
    saveSpekiSpecification,
    getSpecificationDeleteUsage,
    deleteSpekiSpecification,
    moveSpecificationStructureItem,
    deleteSpecificationStructureItem,
    bindNomenclatureEvents,
    saveNomenclatureCommand,
    saveNomenclatureForm,
    deleteNomenclatureItem,
    bindBomListsEvents,
    saveSpecificationModuleForm,
    saveBomModuleForm,
    deleteBomList,
  };
}
