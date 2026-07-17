import { formatDecimalNumber } from "../../ui/formatters.js";

export function createProductsRenderModule(dependencies = {}) {
  const {
    AUTH_GATE_MAX_ATTEMPTS,
    AUTH_GATE_PIN,
    BOARD_BOM_TERM,
    BOARD_SPEC_LIST_TERM,
    BOARD_SPEC_TERM,
    BOM_COMPONENT_FIELDS,
    BOM_IMPORT_COLUMN_COUNT,
    BOM_IMPORT_FALLBACK_HEADERS,
    DEFAULT_COMPONENT_TYPES,
    DEFAULT_INTERFACE_ROLE_ID,
    DEFAULT_NOMENCLATURE_TYPES,
    DEFAULT_RESOURCE_CPH,
    MES_SMT_WORK_CENTER_IDS,
    NOMENCLATURE_DEFAULT_TYPES,
    NOMENCLATURE_REA_COMPONENT_TYPE,
    PRODUCT_COMPOSITION_LIST_TERM,
    PRODUCT_COMPOSITION_TERM,
    PRODUCT_STRUCTURE_TERM,
    ROUTE_DOCUMENT_KIND_LABELS,
    ROUTE_DOCUMENT_KIND_ORDER,
    ROUTE_DOCUMENT_KIND_SHORT_LABELS,
    SMT_LINE_WORKCENTER_PREFIX,
    addMs,
    authPrototypePinFeedbackSequence,
    authPrototypePinFeedbackTimer,
    bindSpekiEvents,
    dedupeProductionResources,
    escapeAttribute,
    escapeHtml,
    formatReportNumber,
    getAccessRoleById = () => ({ label: "роль" }),
    getAuthPrototypePinFeedbackSequence = () => authPrototypePinFeedbackSequence,
    getAuthPrototypePinFeedbackTimer = () => authPrototypePinFeedbackTimer,
    getAuthPrototypeSelectedExecutor,
    getComponentTypes,
    getDefaultOperationCalculationType,
    getFulfillmentLabel,
    getOperationMapItem,
    getPlanningResourceForRouteStep,
    getProductionContextForSpecification,
    getProductionResource,
    getProductionResourceWorkCenterId,
    getProductionResourcesForWorkCenter,
    getProductionStructureEmployees,
    getProductionStructureMatrixRuntimeOverrides,
    getProductionStructureWorkCenters,
    getProject,
    getProjectDisplayName,
    getRouteForStep,
    getRouteProductionContext,
    getRouteStepEffectiveOperationContext,
    getRouteStepPlanningAssignmentForSlot,
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteUnscopedBaseTasks,
    getSpecificationByProjectId,
    getSpecificationItemBoardsPerPanel,
    getSpecificationItemFulfillmentMode,
    getSpecificationStructureItems,
    getWorkCenter,
    icon,
    inferStructureNomenclatureType,
    makeFallbackProductionResource,
    makeId,
    mapLegacyWorkCenterId,
    normalizeAccessRoleAssignments,
    normalizeDirectoryRow,
    normalizeDirectoryState,
    normalizeOptionalPositiveInteger,
    normalizePlanningState,
    normalizeSpecificationStructureItem,
    notifySaveSuccess,
    persistDirectoryState,
    persistState,
    persistUiState,
    render,
    renderDenseInlineSelect,
    renderNomenclatureModulePage,
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
    renderUiSidebarItem,
    renderUiPanel,
    renderUiPanelBody,
    renderUiStatusToken,
    renderUiTableWrap,
    resolveProductionResourceType,
    resourceParticipatesInCalculation,
    resourceParticipatesInPlanning,
    selected,
    setAuthPrototypePinFeedbackSequence = () => {},
    setAuthPrototypePinFeedbackTimer = () => {},
    toDateInput,
    unlockAuthGate,
    updateModuleUrlParam,
  } = dependencies;

  const planningState = new Proxy({}, {
    get(_target, property) {
      return dependencies.getPlanningState?.()?.[property];
    },
    set(_target, property, value) {
      const state = dependencies.getPlanningState?.();
      if (state) state[property] = value;
      return true;
    },
  });
  const directoryState = new Proxy({}, {
    get(_target, property) {
      return dependencies.getDirectoryState?.()?.[property];
    },
    set(_target, property, value) {
      const state = dependencies.getDirectoryState?.();
      if (state) state[property] = value;
      return true;
    },
  });
  const ui = new Proxy({}, {
    get(_target, property) {
      return dependencies.getUi?.()?.[property];
    },
    set(_target, property, value) {
      const state = dependencies.getUi?.();
      if (state) state[property] = value;
      return true;
    },
  });

  function getSpecificationStructureRows(specification) {
    if (!specification) return [];
    const rows = [{
      level: 0,
      position: "00",
      type: "Результат",
      name: specification.outputItem || specification.name || "Итоговое изделие",
      source: "Состав изделия",
      quantity: 1,
      unit: "изд.",
      fulfillment: "Итоговый выпуск",
      result: specification.outputItem || specification.name || "",
      note: "Состав изделия",
    }];
  
    const items = getSpecificationStructureItems(specification);
    const visited = new Set();
    const makeRow = (item, index, level) => {
      const bom = item.type === "bom" ? getBomList(item.bomListId) : null;
      const linkedSpecification = item.type === "specification"
        ? (directoryState.specifications || []).find((specification) => specification.id === item.specificationId)
        : null;
      const nomenclatureItem = item.type === "nomenclature"
        ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)
        : null;
      return {
        level,
        position: String(index + 1).padStart(2, "0"),
        type: item.type === "bom" ? BOARD_SPEC_TERM : item.type === "specification" ? PRODUCT_COMPOSITION_TERM : "Номенклатура",
        name: item.type === "bom"
          ? bom?.name || item.name || "Плата не выбрана"
          : item.type === "specification"
            ? linkedSpecification?.name || item.name || "Состав изделия не выбран"
            : item.type === "nomenclature"
              ? nomenclatureItem?.name || item.name || "Позиция не выбрана"
              : item.name || "Позиция не задана",
        source: item.type === "bom" ? bom?.boardCode || BOARD_SPEC_TERM : item.type === "specification" ? "Вложенный состав изделия" : item.type === "nomenclature" ? nomenclatureItem?.article || "Номенклатура" : PRODUCT_COMPOSITION_TERM,
        quantity: item.quantity,
        unit: item.unit,
        boardsPerPanel: getSpecificationItemBoardsPerPanel(item),
        fulfillment: getFulfillmentLabel(getSpecificationItemFulfillmentMode(item)),
        result: item.type === "bom"
          ? bom?.resultItem || item.resultItem || bom?.name || ""
          : item.type === "specification"
            ? linkedSpecification?.outputItem || item.resultItem || linkedSpecification?.name || ""
            : item.type === "nomenclature"
              ? nomenclatureItem?.name || item.resultItem || item.name || ""
              : item.resultItem || item.name || "",
        note: item.note || "",
      };
    };
    const appendChildren = (parentId, level) => {
      items
        .filter((item) => (item.parentId || "root") === parentId && !visited.has(item.id))
        .forEach((item) => {
          visited.add(item.id);
          rows.push(makeRow(item, rows.length, level));
          appendChildren(item.id, level + 1);
        });
    };
  
    appendChildren("root", 1);
    items
      .filter((item) => !visited.has(item.id))
      .forEach((item) => {
        visited.add(item.id);
        rows.push(makeRow(item, rows.length, 1));
      });
  
    return rows;
  }
  
  function getSpecificationBomResultNameKeys(specification) {
    const keys = new Set();
    [specification?.bomListA, specification?.bomListB]
      .map((bomId) => getBomList(bomId))
      .filter(Boolean)
      .forEach((bom) => {
        [
          bom.name,
          bom.resultItem,
          bom.boardCode,
          getBomResultNomenclatureItem(bom.id)?.name,
        ].filter(Boolean).forEach((name) => keys.add(normalizeLookupText(name)));
      });
    return keys;
  }
  
  function cleanSpecificationExtraItems(specification) {
    const blockedKeys = getSpecificationBomResultNameKeys(specification);
    const seenKeys = new Set();
    return String(specification?.extraItems || "")
      .split(";")
      .map((item) => item.trim())
      .filter((item) => {
        const key = normalizeLookupText(item);
        if (!key || seenKeys.has(key) || blockedKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .join("; ");
  }
  
  function syncSpecificationDerivedFields(specification) {
    const cleanedExtraItems = cleanSpecificationExtraItems(specification);
    const sourceSpecification = cleanedExtraItems === String(specification?.extraItems || "")
      ? specification
      : { ...specification, extraItems: cleanedExtraItems };
    const items = getSpecificationStructureItems(sourceSpecification);
    const bomItems = items
      .map((item) => ({ item, bomId: getSpecificationItemBomId(item) }))
      .filter((entry) => entry.bomId);
    const partItems = items.filter((item) => (
      (item.type === "part" || item.type === "nomenclature")
      && item.name
      && !getSpecificationItemBomId(item)
    ));
    const isManaged = Boolean(sourceSpecification.structureManaged || Array.isArray(sourceSpecification.structureItems));
    return {
      ...sourceSpecification,
      bomListA: bomItems[0]?.bomId || (isManaged ? "" : sourceSpecification.bomListA || ""),
      bomQtyA: bomItems[0] ? Number(bomItems[0].item.quantity || 0) : isManaged ? 0 : Number(sourceSpecification.bomQtyA || 0),
      bomListB: bomItems[1]?.bomId || "",
      bomQtyB: bomItems[1] ? Number(bomItems[1].item.quantity || 0) : 0,
      extraItems: isManaged
        ? sourceSpecification.extraItems || ""
        : partItems.map((item) => item.name).join("; ") || sourceSpecification.extraItems || "",
    };
  }
  
  function getSpecificationBomEntries(specificationId) {
    const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
    if (!specification) return [];
    return getSpecificationStructureItems(specification)
      .map((item) => ({ item, bomId: getSpecificationItemBomId(item) }))
      .filter(({ bomId, item }) => bomId && Number(item.quantity || 0) > 0)
      .map((item, index) => ({
        bom: getBomList(item.bomId),
        quantity: Math.max(0, Number(item.item.quantity || 0)),
        boardsPerPanel: getSpecificationItemBoardsPerPanel(item.item),
        slot: item.item.note || String(index + 1),
        structureItemId: item.item.id,
      }))
      .filter((entry) => entry.bom && entry.quantity > 0);
  }
  
  function buildSpecificationSummary(specification) {
    if (!specification) return "Выберите состав изделия к производству.";
    const bomText = getSpecificationBomEntries(specification.id)
      .map((entry) => `${entry.quantity}x ${entry.bom.resultItem || entry.bom.name}`)
      .join(" + ");
    const extras = specification.extraItems ? ` + ${specification.extraItems}` : "";
    return `${bomText || "плата не выбрана"}${extras}`;
  }
  
  function buildNoSpecificationSummary(calc) {
    if (!calc.specification) return "Выберите изделие, затем плату.";
    if (!calc.bomList) return "Для изделия без платы можно использовать маршрут ручных работ.";
    return `${calc.specification.name}: результат SMT считается как ${calc.bomList.resultItem || calc.bomList.name}.`;
  }
  
  function getBomList(bomId) {
    return getDirectoryRows("bomLists").find((bom) => bom.id === bomId) || null;
  }
  
  function getBomResultNomenclatureItem(bomId) {
    const bom = getBomList(bomId);
    if (!bom) return null;
  
    const items = directoryState.nomenclature || [];
    const direct = items.find((item) => String(item.sourceBomResultId || "") === String(bom.id));
    if (direct) return direct;
  
    const payload = makeBomResultNomenclaturePayload(bom);
    if (!payload) return null;
    const index = findBomResultNomenclatureIndex(items, bom, payload);
    return index >= 0 ? items[index] : null;
  }
  
  function getNomenclatureSourceBomId(nomenclatureId) {
    const item = (directoryState.nomenclature || []).find((entry) => entry.id === nomenclatureId);
    if (!item) return "";
    if (item.sourceBomResultId) return String(item.sourceBomResultId);
    if (normalizeNomenclatureType(item.type) !== "Печатные платы") return "";
    const sourceIds = Array.isArray(item.sourceBomIds) ? item.sourceBomIds : [];
    return String(sourceIds[0] || "");
  }
  
  function getSpecificationItemBomId(item) {
    if (!item) return "";
    if (item.type === "bom") return String(item.bomListId || "");
    if (item.type === "nomenclature") return getNomenclatureSourceBomId(item.nomenclatureId);
    return "";
  }
  
  function getSpecificationItemBom(item) {
    return getBomList(getSpecificationItemBomId(item));
  }
  
  function getBomComponentCounts(bom) {
    if (!bom) return getDefaultComponentCounts();
    const importRows = Array.isArray(bom.importRows) ? bom.importRows.map((row) => normalizeBomImportRow(row)) : [];
    if (importRows.length) {
      const totals = summarizeBomComponentFields(importRows);
      return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
        field.componentId,
        Math.max(0, Math.round(Number(totals[field.key] || 0))),
      ]));
    }
    return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
      field.componentId,
      Math.max(0, Math.round(Number(bom[field.key] || 0))),
    ]));
  }
  
  function getBomComponentFieldCounts(componentCounts = {}) {
    return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
      field.key,
      Math.max(0, Math.round(Number(componentCounts[field.key] ?? componentCounts[field.componentId] ?? 0))),
    ]));
  }
  
  function getBomComponentTypeForRow(row, componentTypes = getComponentTypes()) {
    const fieldKey = classifyBomPackage(row);
    const field = BOM_COMPONENT_FIELDS.find((item) => item.key === fieldKey) || BOM_COMPONENT_FIELDS[BOM_COMPONENT_FIELDS.length - 1];
    return componentTypes.find((type) => type.id === field.componentId)
      || DEFAULT_COMPONENT_TYPES.find((type) => type.id === field.componentId)
      || {
        id: field.componentId,
        name: field.label,
        package: row?.package || field.label,
        family: "",
        coefficient: 1,
        placementsPerHour: DEFAULT_RESOURCE_CPH,
      };
  }
  
  function normalizeSmtComponentKeyPart(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 96);
  }
  
  function makeSmtBomComponentRowId(bom, row, rowIndex, designator = "", index = 0) {
    const parts = [
      bom?.id || "bom",
      rowIndex + 1,
      normalizeSmtComponentKeyPart(row?.sequence),
      normalizeSmtComponentKeyPart(designator || row?.designator || row?.manufacturerPart || row?.description || row?.package),
      index + 1,
    ].filter((part) => part !== "");
    return `bom-component::${parts.join("::")}`;
  }
  
  function getBomImportRowNomenclatureItem(row, bom = null) {
    const directId = String(row?.nomenclatureId || "").trim();
    const items = directoryState?.nomenclature || [];
    if (directId) {
      const direct = items.find((item) => String(item.id || "") === directId);
      if (direct) return direct;
    }
  
    const payload = makeBomImportNomenclaturePayload(row, bom, new Date().toISOString());
    if (!payload) return null;
    const index = findImportedNomenclatureIndex(items, payload);
    return index >= 0 ? items[index] : null;
  }
  
  function getSmtBomNomenclatureGroupKey(bom, row, rowIndex, nomenclatureItem = null, type = null) {
    if (nomenclatureItem?.id) return `bom-nomenclature::${bom?.id || "bom"}::${nomenclatureItem.id}`;
    const identityParts = [
      normalizeSmtComponentKeyPart(row?.manufacturerPart),
      normalizeSmtComponentKeyPart(row?.description),
      normalizeSmtComponentKeyPart(row?.manufacturer),
      normalizeSmtComponentKeyPart(row?.package),
    ].filter(Boolean);
    return identityParts.length
      ? `bom-nomenclature::${[bom?.id || "bom", ...identityParts, type?.id || ""].filter(Boolean).join("::")}`
      : makeSmtBomComponentRowId(bom, row, rowIndex);
  }
  
  function formatSmtDesignatorSummary(designators = []) {
    const unique = [...new Set(designators.map((item) => String(item || "").trim()).filter(Boolean))];
    if (!unique.length) return "";
    if (unique.length <= 6) return unique.join(", ");
    return `${unique.slice(0, 6).join(", ")} и еще ${unique.length - 6}`;
  }
  
  function expandBomDesignatorToken(token) {
    const clean = String(token || "").trim();
    if (!clean) return [];
    const rangeMatch = clean.match(/^([A-Za-zА-Яа-я]+)(\d+)\s*[-–—]\s*([A-Za-zА-Яа-я]+)?(\d+)$/);
    if (rangeMatch) {
      const leftPrefix = rangeMatch[1];
      const rightPrefix = rangeMatch[3] || leftPrefix;
      const start = Number(rangeMatch[2]);
      const end = Number(rangeMatch[4]);
      if (leftPrefix === rightPrefix && Number.isInteger(start) && Number.isInteger(end) && end >= start && end - start <= 100) {
        return Array.from({ length: end - start + 1 }, (_, index) => `${leftPrefix}${start + index}`);
      }
    }
    return /[A-Za-zА-Яа-я]+\d+/u.test(clean) ? [clean] : [];
  }
  
  function splitBomDesignators(value, quantity = 0) {
    const raw = String(value || "").trim();
    if (!raw) return [];
    const tokens = raw
      .replace(/[()]/g, " ")
      .split(/[,;\n]+|\s+(?=[A-Za-zА-Яа-я]+\d)/u)
      .map((token) => token.trim())
      .filter(Boolean);
    const designators = tokens.flatMap(expandBomDesignatorToken);
    const expectedQuantity = Math.max(0, Math.round(Number(quantity || 0)));
    return expectedQuantity > 0 && designators.length === expectedQuantity ? designators : [];
  }
  
  function normalizeBomImportRow(row) {
    const source = Array.isArray(row?.values) ? row.values : Array.isArray(row) ? row : [];
    const values = Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => source[index] ?? row?.[index] ?? "");
    const packageValue = normalizeBomPackageValue(values[5]);
    const quantity = normalizeBomQuantityValue(values[6]);
    const normalizedValues = [...values];
    normalizedValues[5] = packageValue;
    normalizedValues[6] = quantity;
    return {
      sequence: values[0] ?? "",
      description: values[1] ?? "",
      designator: values[2] ?? "",
      manufacturerPart: values[3] ?? "",
      manufacturer: values[4] ?? "",
      package: packageValue,
      quantity,
      note: values[7] ?? "",
      extra: values[8] ?? "",
      nomenclatureId: row?.nomenclatureId || "",
      values: normalizedValues,
    };
  }
  
  function getBomImportRows(bom) {
    return Array.isArray(bom?.importRows) ? bom.importRows.map((row) => normalizeBomImportRow(row)) : [];
  }
  
  function normalizeBomImportHeaderLabel(value, fallback) {
    const label = String(value || fallback || "").trim();
    const normalized = label.toLowerCase().replace(/\s+/g, " ");
    if (normalized === "аритикул производителя") return "Артикул производителя";
    return label;
  }
  
  function getBomImportHeaders(bom) {
    const headers = Array.isArray(bom?.importHeaders) ? bom.importHeaders : [];
    return Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => {
      const value = String(headers[index] || "").trim();
      return normalizeBomImportHeaderLabel(value, BOM_IMPORT_FALLBACK_HEADERS[index] || `Поле ${index + 1}`);
    });
  }
  
  function getFileBaseName(fileName) {
    return String(fileName || BOARD_SPEC_TERM)
      .replace(/\.[^.]+$/, "")
      .trim() || BOARD_SPEC_TERM;
  }
  
  function classifyBomPackage(row) {
    const packageText = normalizePackageText(row.package || "");
    const combined = normalizePackageText(`${row.package || ""} ${row.description || ""}`);
  
    if (packageText === "0402") return "c0402";
    if (packageText === "0603") return "c0603";
    if (packageText === "0805") return "c0805";
    if (packageText === "2012") return "c0805";
    if (combined.includes("0402")) return "c0402";
    if (combined.includes("0603")) return "c0603";
    if (combined.includes("0805")) return "c0805";
    if (combined.includes("2012")) return "c0805";
    if (combined.includes("sot23") || combined.includes("sot-23") || combined.includes("sot223") || combined.includes("sot-223") || combined.includes("sod")) return "csot23";
    if (combined.includes("soic") || combined.includes("tssop") || combined.includes("ssop") || combined.includes("so16") || combined.includes("hsop")) return "csoic";
    if (combined.includes("qfn") || combined.includes("dfn") || combined.includes("lga")) return "cqfn";
    if (combined.includes("bga")) return "cbga";
    if (combined.includes("connector") || combined.includes("разъем") || combined.includes("разъём") || combined.includes("terminal")) return "cconnector";
    return "cconnector";
  }
  
  function normalizeBomPackageValue(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const leadingZeroPackages = {
      201: "0201",
      402: "0402",
      603: "0603",
      805: "0805",
    };
    const numeric = Number(raw.replace(",", "."));
    if (Number.isFinite(numeric) && Number.isInteger(numeric)) {
      const normalizedNumericPackage = leadingZeroPackages[String(numeric)];
      if (normalizedNumericPackage) return normalizedNumericPackage;
    }
  
    const compact = raw.replace(/[.,]/g, "").replace(/\s+/g, "");
    return leadingZeroPackages[compact] || raw;
  }
  
  function normalizeBomQuantityValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const compact = raw.replace(/\s+/g, "");
    const normalizedDecimal = compact.replace(",", ".");
    const decimalNumber = Number(normalizedDecimal);
    if (Number.isFinite(decimalNumber)) return Math.max(0, Math.round(decimalNumber));
    const digitNumber = Number(compact.replace(/[^\d.-]/g, ""));
    return Number.isFinite(digitNumber) ? Math.max(0, Math.round(digitNumber)) : 0;
  }
  
  function normalizePackageText(value) {
    return normalizeBomPackageValue(value)
      .trim()
      .toLowerCase()
      .replace(/[.,]/g, "")
      .replace(/\s+/g, "");
  }
  
  function summarizeBomComponentFields(importRows) {
    const totals = Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0]));
    for (const row of importRows) {
      const key = classifyBomPackage(row);
      totals[key] = (totals[key] || 0) + Math.max(0, Number(row.quantity || 0));
    }
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)]));
  }
  
  function makeBomImportNomenclaturePayload(row, bom, stamp) {
    const normalizedRow = normalizeBomImportRow(row);
    const name = String(normalizedRow.description || normalizedRow.manufacturerPart || normalizedRow.designator || `Компонент ${normalizedRow.sequence || ""}`).trim();
    const article = String(normalizedRow.manufacturerPart || "").trim();
    if (!name && !article) return null;
  
    const descriptionParts = [
      normalizedRow.designator ? `Обозначение: ${normalizedRow.designator}` : "",
      normalizedRow.note ? `Примечание: ${normalizedRow.note}` : "",
      bom?.name ? `Источник BOM: ${bom.name}` : "",
    ].filter(Boolean);
  
    return normalizeDirectoryRow("nomenclature", {
      id: makeId("nom"),
      name,
      article,
      type: NOMENCLATURE_REA_COMPONENT_TYPE,
      package: normalizedRow.package,
      unit: "шт.",
      manufacturer: normalizedRow.manufacturer,
      description: descriptionParts.join(". "),
      status: "Активен",
      sourceBomIds: bom?.id ? [bom.id] : [],
      lastBomImportAt: stamp,
      updatedAt: stamp,
    });
  }
  
  function makeBomResultNomenclaturePayload(bom, stamp = new Date().toISOString()) {
    const name = String(bom?.resultItem || bom?.boardCode || bom?.name || "").trim();
    if (!name) return null;
  
    const descriptionParts = [
      bom?.name ? `Результат платы: ${bom.name}` : "",
      bom?.boardCode ? `Децимальный номер: ${bom.boardCode}` : "",
      "Тип позиции: печатная плата",
    ].filter(Boolean);
  
    return normalizeDirectoryRow("nomenclature", {
      id: makeId("nom"),
      name,
      article: String(bom?.boardCode || "").trim(),
      type: "Печатные платы",
      package: "PCB",
      unit: "шт.",
      manufacturer: "",
      description: descriptionParts.join(". "),
      status: "Активен",
      sourceBomResultId: bom?.id || "",
      sourceBomIds: bom?.id ? [bom.id] : [],
      lastBomResultSyncAt: stamp,
      updatedAt: stamp,
    });
  }
  
  function findImportedNomenclatureIndex(items, payload) {
    const article = normalizeLookupText(payload.article);
    const name = normalizeLookupText(payload.name);
    const packageValue = normalizePackageText(payload.package);
    const manufacturer = normalizeLookupText(payload.manufacturer);
  
    if (article) {
      const articleIndex = items.findIndex((item) => normalizeLookupText(item.article) === article);
      if (articleIndex >= 0) return articleIndex;
    }
  
    return items.findIndex((item) => (
      name
      && normalizeLookupText(item.name) === name
      && normalizePackageText(item.package) === packageValue
      && normalizeLookupText(item.manufacturer) === manufacturer
    ));
  }
  
  function findBomResultNomenclatureIndex(items, bom, payload) {
    const bomId = String(bom?.id || "");
    const article = normalizeLookupText(payload?.article);
    const name = normalizeLookupText(payload?.name);
  
    if (bomId) {
      const directIndex = items.findIndex((item) => String(item.sourceBomResultId || "") === bomId);
      if (directIndex >= 0) return directIndex;
    }
  
    if (article) {
      const articleIndex = items.findIndex((item) => (
        normalizeNomenclatureType(item.type) === "Печатные платы"
        && normalizeLookupText(item.article) === article
      ));
      if (articleIndex >= 0) return articleIndex;
    }
  
    if (name) {
      return items.findIndex((item) => (
        normalizeNomenclatureType(item.type) === "Печатные платы"
        && normalizeLookupText(item.name) === name
      ));
    }
  
    return -1;
  }
  
  function mergeBomSourceIds(existing, incoming) {
    return [...new Set([
      ...(Array.isArray(existing?.sourceBomIds) ? existing.sourceBomIds : []),
      ...(Array.isArray(incoming?.sourceBomIds) ? incoming.sourceBomIds : []),
    ].filter(Boolean))];
  }
  
  function isReaNomenclatureItem(item) {
    return normalizeLookupText(item?.type) === normalizeLookupText(NOMENCLATURE_REA_COMPONENT_TYPE);
  }
  
  function normalizeNomenclatureType(value) {
    const text = String(value || "").trim();
    const normalized = normalizeLookupText(text);
    if (!normalized || ["компонент", "компоненты", "рэа", "rea", "радиоэлектронные компоненты"].includes(normalized)) {
      return NOMENCLATURE_REA_COMPONENT_TYPE;
    }
    return text;
  }
  
  function getNomenclatureTypeRows(options = {}) {
    const rows = Array.isArray(directoryState?.nomenclatureTypes) ? directoryState.nomenclatureTypes : [];
    const seen = new Set();
    return rows
      .map((row) => normalizeDirectoryRow("nomenclatureTypes", row))
      .filter((row) => row.name)
      .filter((row) => options.includeInactive || !["отключен", "удален", "архив"].includes(normalizeLookupText(row.status)))
      .filter((row) => {
        const key = normalizeLookupText(row.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  
  function makeNomenclatureTypeRow(typeName, meta = "Добавлено из модуля номенклатуры") {
    const name = normalizeNomenclatureType(typeName);
    const defaultRow = DEFAULT_NOMENCLATURE_TYPES.find((item) => normalizeLookupText(item.name) === normalizeLookupText(name));
    return normalizeDirectoryRow("nomenclatureTypes", {
      id: defaultRow?.id || makeId("nom-type"),
      name,
      code: defaultRow?.code || "",
      description: defaultRow?.description || meta,
      status: defaultRow?.status || "Активен",
    });
  }
  
  function ensureNomenclatureTypeExists(typeName, options = {}) {
    const name = normalizeNomenclatureType(typeName);
    if (!name) return "";
    const exists = getNomenclatureTypeRows({ includeInactive: true })
      .some((row) => normalizeLookupText(row.name) === normalizeLookupText(name));
    if (exists) return name;
  
    directoryState.nomenclatureTypes = [
      ...(directoryState.nomenclatureTypes || []),
      makeNomenclatureTypeRow(name, options.meta),
    ];
    return name;
  }
  
  function syncNomenclatureTypesFromItems(options = {}) {
    const existingKeys = new Set(getNomenclatureTypeRows({ includeInactive: true }).map((row) => normalizeLookupText(row.name)));
    const itemTypes = [...new Set((directoryState.nomenclature || [])
      .map((item) => normalizeNomenclatureType(item.type))
      .filter(Boolean))]
      .filter((type) => !existingKeys.has(normalizeLookupText(type)));
  
    if (!itemTypes.length) return false;
    directoryState.nomenclatureTypes = [
      ...(directoryState.nomenclatureTypes || []),
      ...itemTypes.map((type) => makeNomenclatureTypeRow(type, "Добавлено из существующей номенклатуры")),
    ];
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    if (options.persist) persistDirectoryState();
    return true;
  }
  
  function syncNomenclatureTypeRename(previousName, nextName) {
    const previous = normalizeNomenclatureType(previousName);
    const next = normalizeNomenclatureType(nextName);
    if (!previous || !next || normalizeLookupText(previous) === normalizeLookupText(next)) return;
    directoryState.nomenclature = (directoryState.nomenclature || []).map((item) => (
      normalizeLookupText(item.type) === normalizeLookupText(previous)
        ? { ...item, type: next, updatedAt: new Date().toISOString() }
        : item
    ));
    directoryState.specifications = (directoryState.specifications || []).map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification).map((item) => (
        normalizeLookupText(item.nomenclatureType) === normalizeLookupText(previous)
          ? { ...item, nomenclatureType: next }
          : item
      )),
    }));
    if (normalizeLookupText(ui.nomenclatureTypeFilter) === normalizeLookupText(previous)) {
      ui.nomenclatureTypeFilter = next;
    }
  }
  
  function getFallbackNomenclatureType(excludedName = "") {
    const excluded = normalizeLookupText(excludedName);
    return getNomenclatureTypeRows()
      .map((row) => row.name)
      .find((name) => normalizeLookupText(name) !== excluded) || "";
  }
  
  function getNomenclatureTypeOptions(items = directoryState.nomenclature || []) {
    return getNomenclatureTypeRows().map((type) => ({
      value: type.name,
      label: type.name,
      meta: type.description || type.code || "тип номенклатуры",
    }));
  }
  
  function getNomenclatureTypeTone(typeName = "") {
    const row = getNomenclatureTypeRows({ includeInactive: true })
      .find((type) => normalizeLookupText(type.name) === normalizeLookupText(typeName));
    const key = normalizeLookupText([row?.code, row?.name, typeName].filter(Boolean).join(" "));
    if (key.includes("pcb") || key.includes("печат")) return "section-blue";
    if (key.includes("cable") || key.includes("жгут") || key.includes("кабел")) return "section-violet";
    if (key.includes("mech") || key.includes("механ")) return "section-slate";
    if (key.includes("cons") || key.includes("расход")) return "section-amber";
    if (key.includes("pack") || key.includes("упаков") || key.includes("маркир")) return "section-cyan";
    if (key.includes("buy") || key.includes("покуп")) return "section-rose";
    if (key.includes("make") || key.includes("производ")) return "section-indigo";
    if (key.includes("tool") || key.includes("оснаст")) return "section-stone";
    if (key.includes("rea") || key.includes("рэа")) return "section-emerald";
    return "section-neutral";
  }
  
  function getNomenclatureTypeIconName(typeName = "") {
    const row = getNomenclatureTypeRows({ includeInactive: true })
      .find((type) => normalizeLookupText(type.name) === normalizeLookupText(typeName));
    const key = normalizeLookupText([row?.code, row?.name, typeName].filter(Boolean).join(" "));
    if (key.includes("pcb") || key.includes("печат")) return "bom";
    if (key.includes("cable") || key.includes("жгут") || key.includes("кабел")) return "split";
    if (key.includes("mech") || key.includes("механ")) return "settings";
    if (key.includes("cons") || key.includes("расход")) return "package";
    if (key.includes("pack") || key.includes("упаков") || key.includes("маркир")) return "package";
    if (key.includes("buy") || key.includes("покуп")) return "supply";
    if (key.includes("make") || key.includes("производ")) return "operation";
    if (key.includes("tool") || key.includes("оснаст")) return "settings";
    if (key.includes("rea") || key.includes("рэа")) return "directory";
    return "package";
  }
  
  function getNomenclatureTypeVisual(typeName = "", tone = "") {
    const label = normalizeNomenclatureType(typeName) || "Раздел не выбран";
    return {
      label,
      tone: tone || getNomenclatureTypeTone(label),
      iconName: getNomenclatureTypeIconName(label),
      tooltip: `Раздел: ${label}`,
    };
  }
  
  function getSpekiStructureSectionOptions() {
    const options = getNomenclatureTypeRows().map((type) => ({
      value: type.name,
      label: type.name,
      meta: type.description || type.code || "раздел номенклатуры",
      summaryMeta: "",
      tone: getNomenclatureTypeTone(type.name),
      iconName: getNomenclatureTypeIconName(type.name),
      summaryTitle: getNomenclatureTypeVisual(type.name).tooltip,
    }));
    return options.length ? options : NOMENCLATURE_DEFAULT_TYPES.map((type) => {
      const visual = getNomenclatureTypeVisual(type.value || type.label);
      return {
        ...type,
        summaryMeta: "",
        tone: visual.tone,
        iconName: visual.iconName,
        summaryTitle: visual.tooltip,
      };
    });
  }
  
  function getNomenclatureTypeCounts(items = directoryState.nomenclature || []) {
    return items.reduce((counts, item) => {
      const type = normalizeNomenclatureType(item.type);
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
  }
  
  function getNomenclatureTypeFilterValue(items = directoryState.nomenclature || []) {
    const selected = ui.nomenclatureTypeFilter || "all";
    if (selected === "all") return selected;
    if (selected === "Печатные платы") return "all";
    return getNomenclatureTypeOptions(items).some((item) => item.value === selected) ? selected : "all";
  }
  
  function getFilteredNomenclatureItems(items = directoryState.nomenclature || []) {
    const filterValue = getNomenclatureTypeFilterValue(items);
    if (filterValue === "all") return items;
    return items.filter((item) => normalizeNomenclatureType(item.type) === filterValue);
  }
  
  function getReaNomenclatureItems() {
    return (directoryState.nomenclature || [])
      .filter(isReaNomenclatureItem)
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru"));
  }
  
  function makeBomImportRowFromNomenclature(item, sequence) {
    return normalizeBomImportRow({
      nomenclatureId: item.id,
      values: [
        sequence,
        item.name || "",
        "",
        item.article || "",
        item.manufacturer || "",
        item.package || "",
        1,
        "Добавлено из номенклатуры",
        "",
      ],
    });
  }
  
  function getNextBomImportSequence(rows) {
    const maxSequence = rows.reduce((max, row, index) => {
      const number = Number(normalizeBomImportRow(row).sequence || index + 1);
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0);
    return maxSequence + 1;
  }
  
  function updateBomImportRows(bomId, rows, options = {}) {
    const currentBom = getBomList(bomId);
    if (!currentBom) return null;
  
    const stamp = new Date().toISOString();
    const importRows = rows.map((row) => normalizeBomImportRow(row));
    const componentTotals = summarizeBomComponentFields(importRows);
    let nextBom = null;
  
    directoryState.bomLists = (directoryState.bomLists || []).map((item) => {
      if (item.id !== bomId) return item;
      nextBom = normalizeDirectoryRow("bomLists", {
        ...item,
        importHeaders: item.importHeaders?.length ? item.importHeaders : BOM_IMPORT_FALLBACK_HEADERS,
        importRows,
        importedAt: item.importedAt || stamp,
        updatedAt: stamp,
        ...componentTotals,
      });
      return nextBom;
    });
  
    if (options.syncNomenclature !== false && nextBom) {
      upsertBomImportRowsToNomenclature(nextBom, stamp);
    }
  
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    persistDirectoryState();
    persistUiState();
    if (options.notify !== false) {
      notifySaveSuccess(options.message || "Таблица BOM сохранена");
    }
    return nextBom;
  }
  
  function updateBomImportCell(bomId, rowIndex, columnIndex, value) {
    const bom = getBomList(bomId);
    if (!bom) return;
    const rows = getBomImportRows(bom);
    const row = rows[rowIndex];
    if (!row || columnIndex < 0 || columnIndex >= BOM_IMPORT_COLUMN_COUNT) return;
  
    const nextValues = [...row.values];
    nextValues[columnIndex] = columnIndex === 6
      ? normalizeBomQuantityValue(value)
      : value;
    const nextRows = rows.map((item, index) => (
      index === rowIndex
        ? normalizeBomImportRow({ ...row, values: nextValues })
        : item
    ));
    updateBomImportRows(bomId, nextRows);
  }
  
  function deleteBomImportRow(bomId, rowIndex) {
    const bom = getBomList(bomId);
    if (!bom) return;
    const rows = getBomImportRows(bom).filter((_, index) => index !== rowIndex);
    updateBomImportRows(bomId, rows, { syncNomenclature: false });
  }
  
  function addNomenclatureToBom(bomId, nomenclatureId) {
    const bom = getBomList(bomId);
    const nomenclatureItem = (directoryState.nomenclature || []).find((item) => item.id === nomenclatureId);
    if (!bom || !nomenclatureItem) return;
    if (!isReaNomenclatureItem(nomenclatureItem)) {
      alert("В BOM можно добавить только номенклатуру из раздела «РЭА компоненты».");
      return;
    }
  
    const rows = getBomImportRows(bom);
    const nextRows = [
      ...rows,
      makeBomImportRowFromNomenclature(nomenclatureItem, getNextBomImportSequence(rows)),
    ];
    updateBomImportRows(bomId, nextRows);
  }
  
  function ensureBomResultsInNomenclature() {
    const bomLists = directoryState.bomLists || [];
    if (!bomLists.length) return;
  
    const stamp = new Date().toISOString();
    const nextItems = [...(directoryState.nomenclature || [])];
    let changed = false;
  
    bomLists.forEach((bom) => {
      const payload = makeBomResultNomenclaturePayload(bom, bom.updatedAt || bom.importedAt || stamp);
      if (!payload) return;
  
      const existingIndex = findBomResultNomenclatureIndex(nextItems, bom, payload);
      if (existingIndex >= 0) {
        const existing = nextItems[existingIndex];
        const nextItem = normalizeDirectoryRow("nomenclature", {
          ...existing,
          name: payload.name,
          article: payload.article || existing.article,
          type: "Печатные платы",
          package: existing.package || payload.package || "PCB",
          unit: existing.unit || "шт.",
          description: payload.description,
          status: existing.status || "Активен",
          sourceBomResultId: bom.id,
          sourceBomIds: mergeBomSourceIds(existing, payload),
          lastBomResultSyncAt: stamp,
          updatedAt: stamp,
        });
        if (JSON.stringify(existing) !== JSON.stringify(nextItem)) {
          nextItems[existingIndex] = nextItem;
          changed = true;
        }
        return;
      }
  
      nextItems.push(payload);
      changed = true;
    });
  
    if (!changed) return;
    directoryState.nomenclature = nextItems;
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    persistDirectoryState();
  }
  
  function migrateSpecificationBomRowsToNomenclature() {
    const specifications = directoryState.specifications || [];
    if (!specifications.length) return;
  
    let changed = false;
    const nextSpecifications = specifications.map((specification) => {
      const sourceItems = getSpecificationStructureItems(specification);
      if (!sourceItems.length) return specification;
  
      const nextItems = sourceItems.map((item) => {
        if (item.type !== "bom" || !item.bomListId) return item;
        const bom = getBomList(item.bomListId);
        const resultNomenclature = getBomResultNomenclatureItem(item.bomListId)
          || (bom ? upsertBomResultToNomenclature(bom, new Date().toISOString()) : null);
        if (!bom || !resultNomenclature) return item;
  
        changed = true;
        return normalizeSpecificationStructureItem({
          ...item,
          type: "nomenclature",
          bomListId: "",
          nomenclatureId: resultNomenclature.id,
          executionType: "make",
          operationId: item.operationId || "",
          operationName: item.operationName || "",
          departmentName: item.departmentName || "",
          name: resultNomenclature.name || bom.resultItem || item.name || bom.name || "",
          unit: resultNomenclature.unit || "шт.",
          boardsPerPanel: 1,
          resultItem: resultNomenclature.name || bom.resultItem || item.resultItem || "",
          note: item.note && !/^bom\b/i.test(item.note) ? item.note : "Результат платы",
        });
      });
  
      return syncSpecificationDerivedFields({
        ...specification,
        structureManaged: true,
        structureItems: nextItems,
      });
    });
  
    if (!changed) return;
    directoryState.specifications = nextSpecifications;
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    persistDirectoryState();
  }
  
  function ensureImportedBomRowsInNomenclature() {
    const bomLists = directoryState.bomLists || [];
    if (!bomLists.some((bom) => getBomImportRows(bom).length)) return;
  
    const stamp = new Date().toISOString();
    const nextItems = [...(directoryState.nomenclature || [])];
    let created = 0;
  
    bomLists.forEach((bom) => {
      getBomImportRows(bom).forEach((row) => {
        const payload = makeBomImportNomenclaturePayload(row, bom, bom.importedAt || bom.updatedAt || stamp);
        if (!payload) return;
        if (findImportedNomenclatureIndex(nextItems, payload) >= 0) return;
        nextItems.push(payload);
        created += 1;
      });
    });
  
    if (!created) return;
    directoryState.nomenclature = nextItems;
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    persistDirectoryState();
  }
  
  function upsertBomImportRowsToNomenclature(bom, stamp = new Date().toISOString()) {
    const rows = getBomImportRows(bom);
    if (!rows.length) return { created: 0, updated: 0 };
  
    const nextItems = [...(directoryState.nomenclature || [])];
    let created = 0;
    let updated = 0;
  
    rows.forEach((row) => {
      const payload = makeBomImportNomenclaturePayload(row, bom, stamp);
      if (!payload) return;
  
      const existingIndex = findImportedNomenclatureIndex(nextItems, payload);
      if (existingIndex >= 0) {
        const existing = nextItems[existingIndex];
        nextItems[existingIndex] = normalizeDirectoryRow("nomenclature", {
          ...existing,
          name: existing.name || payload.name,
          article: existing.article || payload.article,
          type: NOMENCLATURE_REA_COMPONENT_TYPE,
          package: existing.package || payload.package,
          unit: existing.unit || payload.unit || "шт.",
          manufacturer: existing.manufacturer || payload.manufacturer,
          description: existing.description || payload.description,
          status: existing.status || "Активен",
          sourceBomIds: mergeBomSourceIds(existing, payload),
          lastBomImportAt: stamp,
          updatedAt: stamp,
        });
        updated += 1;
        return;
      }
  
      nextItems.push(payload);
      created += 1;
    });
  
    directoryState.nomenclature = nextItems;
    return { created, updated };
  }
  
  function upsertBomResultToNomenclature(bom, stamp = new Date().toISOString()) {
    const payload = makeBomResultNomenclaturePayload(bom, stamp);
    if (!payload) return null;
  
    const nextItems = [...(directoryState.nomenclature || [])];
    const existingIndex = findBomResultNomenclatureIndex(nextItems, bom, payload);
  
    if (existingIndex >= 0) {
      const existing = nextItems[existingIndex];
      nextItems[existingIndex] = normalizeDirectoryRow("nomenclature", {
        ...existing,
        name: payload.name,
        article: payload.article || existing.article,
        type: "Печатные платы",
        package: existing.package || payload.package || "PCB",
        unit: existing.unit || "шт.",
        description: payload.description,
        status: existing.status || "Активен",
        sourceBomResultId: bom.id,
        sourceBomIds: mergeBomSourceIds(existing, payload),
        lastBomResultSyncAt: stamp,
        updatedAt: stamp,
      });
      directoryState.nomenclature = nextItems;
      return nextItems[existingIndex];
    }
  
    nextItems.push(payload);
    directoryState.nomenclature = nextItems;
    return payload;
  }
  
  async function importBomFromXlsxFile(file, productionId = "") {
    const parsed = await parseXlsxBomFile(file);
    const name = getFileBaseName(file.name);
    const id = makeId("bom");
    const importRows = parsed.rows.map((row) => normalizeBomImportRow(row));
    const componentTotals = summarizeBomComponentFields(importRows);
    const stamp = new Date().toISOString();
    const row = normalizeDirectoryRow("bomLists", {
      id,
      name,
      projectId: productionId || "",
      boardCode: name,
      resultItem: `Печатная плата ${name}`,
      status: "Активен",
      importHeaders: parsed.headers,
      importRows,
      importedAt: stamp,
      sourceFileName: file.name,
      sourceSheetName: parsed.sheetName,
      updatedAt: stamp,
      ...componentTotals,
    });
  
    directoryState.bomLists = [
      ...(directoryState.bomLists || []).filter((item) => item.name !== row.name || item.projectId !== row.projectId),
      row,
    ];
    upsertBomResultToNomenclature(row, stamp);
    upsertBomImportRowsToNomenclature(row, stamp);
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    ui.activeBomId = id;
    ui.activeProjectId = productionId || "";
    persistDirectoryState();
    persistUiState();
    notifySaveSuccess("BOM импортирован");
  }
  
  async function parseXlsxBomFile(file) {
    const entries = await readZipEntries(await file.arrayBuffer());
    const workbookXml = await getZipText(entries, "xl/workbook.xml");
    const sheetName = readFirstWorksheetName(workbookXml) || "Sheet1";
    const sheetEntryName = entries.has("xl/worksheets/sheet1.xml")
      ? "xl/worksheets/sheet1.xml"
      : [...entries.keys()].find((name) => name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml"));
    if (!sheetEntryName) throw new Error("В файле не найден лист Excel.");
  
    const sharedStringsXml = entries.has("xl/sharedStrings.xml") ? await getZipText(entries, "xl/sharedStrings.xml") : "";
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
    const sheetXml = await getZipText(entries, sheetEntryName);
    const matrix = parseWorksheetMatrix(sheetXml, sharedStrings);
    const headers = Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => (
      String(matrix[0]?.[index] || "").trim() || BOM_IMPORT_FALLBACK_HEADERS[index] || `Поле ${index + 1}`
    ));
    const rows = [];
  
    for (let index = 1; index < matrix.length; index += 1) {
      const source = matrix[index] || [];
      if (source[0] === undefined || source[0] === null || String(source[0]).trim() === "") break;
      rows.push(Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, columnIndex) => source[columnIndex] ?? ""));
    }
  
    if (!rows.length) throw new Error("BOM не содержит строк: первая пустая ячейка A найдена сразу после заголовка.");
    return { sheetName, headers, rows };
  }
  
  async function readZipEntries(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const textDecoder = new TextDecoder("utf-8");
    let eocdOffset = -1;
    const minOffset = Math.max(0, bytes.length - 66000);
  
    for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("Файл не похож на XLSX: не найден ZIP-каталог.");
  
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const entries = new Map();
    let cursor = centralDirectoryOffset;
  
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const compressionMethod = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const fileNameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localHeaderOffset = view.getUint32(cursor + 42, true);
      const name = textDecoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));
  
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
      entries.set(name, {
        name,
        text: null,
        bytes: compressedBytes,
        compressionMethod,
      });
  
      cursor += 46 + fileNameLength + extraLength + commentLength;
    }
  
    return entries;
  }
  
  async function getZipText(entries, name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`В XLSX не найден файл ${name}.`);
    if (entry.text !== null) return entry.text;
  
    let bytes = entry.bytes;
    if (entry.compressionMethod === 8) {
      if (!("DecompressionStream" in window)) {
        throw new Error("Браузер не поддерживает распаковку XLSX. Откройте систему в актуальном Chrome/Edge.");
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (entry.compressionMethod !== 0) {
      throw new Error(`Неподдерживаемый метод сжатия XLSX: ${entry.compressionMethod}.`);
    }
  
    entry.text = new TextDecoder("utf-8").decode(bytes);
    return entry.text;
  }
  
  function parseXml(text) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("Не удалось прочитать XML внутри XLSX.");
    return xml;
  }
  
  function readFirstWorksheetName(workbookXml) {
    const sheet = parseXml(workbookXml).querySelector("sheet");
    return sheet?.getAttribute("name") || "";
  }
  
  function parseSharedStrings(sharedStringsXml) {
    return [...parseXml(sharedStringsXml).querySelectorAll("si")].map((item) => (
      [...item.querySelectorAll("t")].map((node) => node.textContent || "").join("")
    ));
  }
  
  function parseWorksheetMatrix(sheetXml, sharedStrings) {
    const matrix = [];
    const xml = parseXml(sheetXml);
    xml.querySelectorAll("sheetData row").forEach((rowNode) => {
      const rowIndex = Math.max(0, Number(rowNode.getAttribute("r") || matrix.length + 1) - 1);
      matrix[rowIndex] = matrix[rowIndex] || [];
      rowNode.querySelectorAll("c").forEach((cellNode) => {
        const ref = cellNode.getAttribute("r") || "";
        const columnIndex = columnLettersToIndex(ref.replace(/\d+/g, ""));
        if (columnIndex < 0 || columnIndex >= BOM_IMPORT_COLUMN_COUNT) return;
        matrix[rowIndex][columnIndex] = parseXlsxCellValue(cellNode, sharedStrings);
      });
    });
    return matrix;
  }
  
  function parseXlsxCellValue(cellNode, sharedStrings) {
    const type = cellNode.getAttribute("t");
    if (type === "inlineStr") return cellNode.querySelector("is t")?.textContent || "";
    const value = cellNode.querySelector("v")?.textContent ?? "";
    if (type === "s") return sharedStrings[Number(value)] ?? "";
    if (type === "b") return value === "1";
    if (value === "") return "";
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  
  function columnLettersToIndex(letters) {
    if (!letters) return -1;
    return [...letters.toUpperCase()].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
  }
  
  function getDefaultComponentCounts() {
    const source = directoryState?.componentTypes?.length ? directoryState.componentTypes : DEFAULT_COMPONENT_TYPES;
    return Object.fromEntries(source.map((type) => [type.id, Math.max(0, Math.round(Number(type.defaultCount || 0)))]));
  }
  
  function getResourcesForWorkCenter(workCenterId) {
    const center = getWorkCenter(workCenterId);
    const matched = getProductionResourcesForWorkCenter(workCenterId)
      .filter((resource) => resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource));
    if (matched.length) return matched;
    if (!center) return [];
    return [makeFallbackProductionResource(center.id)];
  }
  
  function getDefaultSmtLineConfigurations() {
    return [
      {
        id: "D3_L1",
        name: "Участок поверхностного монтажа 1",
        type: "aggregate",
        workCenterId: "D3_L1",
        workCenter: "Участок поверхностного монтажа 1",
        capacity: "Принтер -> DECAN S2 -> DECAN L2 -> Печь",
        baseCph: 32000,
        efficiency: 88,
        changeoverMin: 18,
        status: "Готова",
      },
      {
        id: "D3_L2",
        name: "Участок поверхностного монтажа 2",
        type: "aggregate",
        workCenterId: "D3_L2",
        workCenter: "Участок поверхностного монтажа 2",
        capacity: "Принтер -> DECAN S2 -> Печь",
        baseCph: 28000,
        efficiency: 82,
        changeoverMin: 24,
        status: "Готова",
      },
    ];
  }
  
  function getSmtLineConfigurations() {
    const resources = MES_SMT_WORK_CENTER_IDS.flatMap((workCenterId) => getProductionResourcesForWorkCenter(workCenterId))
      .filter((resource) => resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource))
      .filter((resource) => resolveProductionResourceType(resource.type) === "aggregate" || getSmtLineNumberFromText(`${resource.name} ${resource.code} ${resource.id}`))
      .filter((resource) => resource.status !== "Отключен");
    return resources.length ? resources : getDefaultSmtLineConfigurations();
  }
  
  function getSmtLineWorkCenterId(lineId) {
    return `${SMT_LINE_WORKCENTER_PREFIX}${lineId}`;
  }
  
  function isSmtLineWorkCenterId(workCenterId) {
    return String(workCenterId || "").startsWith(SMT_LINE_WORKCENTER_PREFIX);
  }
  
  function getSmtLineIdFromWorkCenterId(workCenterId) {
    return isSmtLineWorkCenterId(workCenterId)
      ? String(workCenterId).slice(SMT_LINE_WORKCENTER_PREFIX.length)
      : "";
  }
  
  function getSmtLineNumberFromText(value) {
    const text = String(value || "").toLowerCase();
    const match = text.match(/(?:smt|смт|линия)\s*[-–—№#]?\s*(\d+)/i);
    return match ? Number(match[1]) : 0;
  }
  
  function getStableStringHash(value) {
    return [...String(value || "")].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
  }
  
  function findSmtLineByNumber(number, lines) {
    if (!number) return null;
    return lines.find((line, index) => (
      index + 1 === number
      || getSmtLineNumberFromText(`${line.name} ${line.code} ${line.id}`) === number
    )) || null;
  }
  
  function getSmtGanttLineCenters() {
    const smtCenter = getWorkCenter("D3") || {
      id: "D3",
      name: "SMT-монтаж",
      code: "SMT",
      unitsPerHour: 40,
      capacity: 1,
      workSchedule: "5/2",
      workMode: "08:00-20:00",
      shift: "5/2 08:00-20:00",
      isActive: true,
    };
  
    return getSmtLineConfigurations().map((line, index) => {
      const lineNumber = getSmtLineNumberFromText(`${line.name} ${line.code} ${line.id}`) || index + 1;
      return {
        ...smtCenter,
        id: getSmtLineWorkCenterId(line.id),
        name: line.name || `SMT участок ${lineNumber}`,
        code: `SMT-${lineNumber}`,
        description: line.capacity || smtCenter.description || "Производственная линия SMT",
        parentWorkCenterId: "smt",
        baseWorkCenterId: "smt",
        calendarWorkCenterId: "smt",
        smtLineId: line.id,
        resourceId: line.id,
        capacity: 1,
        isSmtLine: true,
      };
    });
  }
  
  function getSlotAssignedSmtLineId(slot) {
    const slotWorkCenterId = mapLegacyWorkCenterId(slot?.workCenterId || "");
    if (MES_SMT_WORK_CENTER_IDS.includes(slotWorkCenterId)) return slotWorkCenterId;
    if (slotWorkCenterId !== "smt" && slotWorkCenterId !== "D3") return "";
  
    const lines = getSmtLineConfigurations();
    if (!lines.length) return "";
  
    const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
    const selectedWorkCenterId = step ? getRouteStepSelectedPlanningWorkCenterId(step, planningState) : "";
    if (selectedWorkCenterId && lines.some((line) => line.id === selectedWorkCenterId || line.workCenterId === selectedWorkCenterId)) {
      return selectedWorkCenterId;
    }
  
    const explicitResourceId = slot.resourceId || step?.resourceId || "";
    if (explicitResourceId && lines.some((line) => line.id === explicitResourceId)) return explicitResourceId;
  
    const hintedLine = findSmtLineByNumber(
      getSmtLineNumberFromText(`${slot.comment || ""} ${slot.operationName || ""} ${explicitResourceId}`),
      lines,
    );
    if (hintedLine) return hintedLine.id;
  
    const hash = Math.abs(getStableStringHash(`${getSlotProductionContextId(slot)}:${getSlotPlanningOrderId(slot, getSlotRouteId(slot))}:${slot.routeStepId}:${slot.id}`));
    return lines[hash % lines.length]?.id || "";
  }
  
  function getSlotGanttWorkCenterId(slot) {
    const lineId = getSlotAssignedSmtLineId(slot);
    if (lineId) return lineId;
    return slot?.workCenterId || "";
  }
  
  function getSlotGanttResourceId(slot) {
    if (!slot) return "";
    const ganttWorkCenterId = mapLegacyWorkCenterId(getSlotGanttWorkCenterId(slot) || slot.workCenterId || "");
    if (MES_SMT_WORK_CENTER_IDS.includes(ganttWorkCenterId) && getProductionResource(ganttWorkCenterId)) {
      return ganttWorkCenterId;
    }
  
    const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
    const explicitResourceId = slot.resourceId || step?.resourceId || "";
    const explicitResource = explicitResourceId ? getProductionResource(explicitResourceId) : null;
    if (explicitResource && getProductionResourceWorkCenterId(explicitResource) === ganttWorkCenterId) {
      return explicitResource.id;
    }
  
    if (ganttWorkCenterId === "smt" || ganttWorkCenterId === "D3") {
      const lineId = getSlotAssignedSmtLineId(slot);
      if (lineId) return lineId;
    }
  
    const fallback = getResourcesForWorkCenter(ganttWorkCenterId || slot.workCenterId)[0] || makeFallbackProductionResource(ganttWorkCenterId || slot.workCenterId);
    return fallback.id;
  }
  
  function getGanttResourceForSlot(slot, resourceId = "") {
    if (!slot) return null;
    const resolvedResourceId = resourceId || getSlotGanttResourceId(slot);
    const ganttWorkCenterId = getSlotGanttWorkCenterId(slot) || slot.workCenterId;
    return getProductionResource(resolvedResourceId)
      || getResourcesForWorkCenter(ganttWorkCenterId).find((resource) => resource.id === resolvedResourceId)
      || makeFallbackProductionResource(ganttWorkCenterId);
  }
  
  function getResourceRowId(routeId, workCenterId, resourceId) {
    return `resource:${routeId}:${workCenterId}:${resourceId || "default"}`;
  }
  
  function getGanttResourcesForWorkCenter(workCenterId) {
    const resources = getProductionResourcesForWorkCenter(workCenterId, {
      includeInactive: false,
      includePassive: true,
    });
    const hasSchedulableResource = resources.some((resource) => (
      resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource)
    ));
    const rows = hasSchedulableResource ? resources : [...resources, makeFallbackProductionResource(workCenterId)];
    return dedupeProductionResources(rows).sort((left, right) => (
      Number(Boolean(right.participatesInPlanning === "yes" || right.participatesInCalculation === "yes"))
        - Number(Boolean(left.participatesInPlanning === "yes" || left.participatesInCalculation === "yes"))
      || String(left.parentResourceId || "").localeCompare(String(right.parentResourceId || ""), "ru")
      || String(left.name || "").localeCompare(String(right.name || ""), "ru")
    ));
  }
  
  function applyGanttRowToSlot(slot, row) {
    if (!slot || !["operation", "workCenter", "resource"].includes(row?.type)) return;
    if (row.type === "operation") {
      const step = row.routeStep || planningState.routeSteps.find((item) => item.id === row.routeStepId);
      if (!step) return;
      const assignment = getRouteStepPlanningAssignmentForSlot(step, slot, {
        state: planningState,
        quantity: slot.quantity || 1,
        readyAt: slot.plannedStart || null,
        ignoreSlotId: slot.id || null,
      });
      const planningWorkCenterId = assignment?.workCenterId || slot.workCenterId || step.workCenterId;
      const resourceId = assignment?.resourceId || getPlanningResourceForRouteStep(step, planningWorkCenterId, step.resourceId || slot.resourceId || "");
      const route = getRouteForStep(step);
      const operationContext = getRouteStepEffectiveOperationContext(route, step, planningWorkCenterId, resourceId);
      slot.routeStepId = step.id;
      slot.routeWorkCenterId = step.workCenterId;
      slot.workCenterId = planningWorkCenterId;
      slot.operationId = step.operationId || "";
      slot.operationName = step.operationName || getOperationMapItem(step.operationId)?.name || slot.operationName || "Операция";
      slot.unitsPerHour = Number(step.unitsPerHour || slot.unitsPerHour || 0) || undefined;
      slot.boardsPerPanel = operationContext.boardsPerPanel;
      slot.resourceId = resourceId;
      slot.calculationType = step.calculationType || getDefaultOperationCalculationType(planningWorkCenterId, operationContext) || slot.calculationType || "";
      slot.secondsPerPanel = Number(step.secondsPerPanel || slot.secondsPerPanel || 0);
      slot.setupMin = Number(step.setupMin || slot.setupMin || 0);
      slot.bomListId = operationContext.bomListId || slot.bomListId || "";
      return;
    }
  
    if (row.type === "resource") {
      slot.workCenterId = row.workCenterId;
      slot.resourceId = row.resourceId || "";
      return;
    }
  
    if (row.isSmtLine || isSmtLineWorkCenterId(row.workCenterId)) {
      slot.workCenterId = "smt";
      slot.resourceId = row.smtLineId || getSmtLineIdFromWorkCenterId(row.workCenterId);
      return;
    }
  
    slot.workCenterId = row.workCenterId;
    const resource = getResourcesForWorkCenter(row.workCenterId)[0] || null;
    slot.resourceId = resource?.id || "";
  }
  
  function normalizeLookupText(value) {
    return String(value || "").trim().toLowerCase();
  }
  
  function getResourceBaseCph(resource) {
    const explicit = Number(resource?.baseCph || 0);
    if (explicit > 0) return explicit;
    const capacityMatch = String(resource?.capacity || "").match(/([\d.,]+)/);
    if (capacityMatch) {
      const parsed = Number(capacityMatch[1].replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 100) return parsed;
    }
    return DEFAULT_RESOURCE_CPH;
  }
  
  function getActiveProjectForModule() {
    if (ui.activeProjectId === "__new__") return null;
    return getProject(ui.activeProjectId)
      || getProductionContextForSpecification(getActiveSpecificationForModule());
  }
  
  function getActiveSpecificationForModule() {
    if (ui.activeSpecificationId === "__new__") return null;
    if (!ui.activeSpecificationId) return null;
    return (directoryState.specifications || []).find((specification) => specification.id === ui.activeSpecificationId)
      || null;
  }
  
  function getSpecificationProductionProject(specification) {
    if (!specification) return null;
    return getProductionContextForSpecification(specification);
  }
  
  function getSpecificationProductionQuantity(specification) {
    const project = getSpecificationProductionProject(specification);
    return normalizeOptionalPositiveInteger(specification?.productionQuantity || project?.totalQuantity) || "";
  }
  
  function getSpecificationProductionDueDate(specification) {
    const project = getSpecificationProductionProject(specification);
    return specification?.dueDate || project?.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000));
  }
  
  function getSpecificationProductionName(specification) {
    return specification?.outputItem || specification?.name || PRODUCT_COMPOSITION_TERM;
  }
  
  function getSpecificationProductionOrder(specification) {
    const project = getSpecificationProductionProject(specification);
    return specification?.orderNumber || project?.orderNumber || "";
  }
  
  function getSpecificationProductionCustomer(specification) {
    const project = getSpecificationProductionProject(specification);
    return specification?.customer || project?.customer || "";
  }
  
  function ensureSpecificationPlanningUnit(specification) {
    const stamp = new Date().toISOString();
    const quantity = normalizeOptionalPositiveInteger(specification.productionQuantity) || 1;
    const name = getSpecificationProductionName(specification);
    const specificationId = specification.id || makeId("spec");
    const existingRoute = (planningState.routes || []).find((route) => route.specificationId === specificationId || route.projectId === specificationId);
  
    if (!existingRoute) return specificationId;
  
    planningState.routes = planningState.routes.map((route) => route.id === existingRoute.id ? {
      ...route,
      specificationId,
      specificationName: specification.name || name,
      projectId: specificationId,
      planningQuantity: quantity,
      updatedAt: stamp,
    } : route);
    planningState.projects = [];
    dependencies.setPlanningState?.(normalizePlanningState(planningState));
    persistState();
    return specificationId;
  }
  
  function getActiveBomForModule(activeSpecification = null) {
    if (ui.activeBomId === "__new__") return null;
    const specBom = activeSpecification ? getBomList(activeSpecification.bomListA) : null;
    if (ui.activeBomId) {
      return (directoryState.bomLists || []).find((bom) => bom.id === ui.activeBomId) || null;
    }
    return specBom || null;
  }
  
  function getBomLinkedSpecifications(bomId) {
    if (!bomId) return [];
    return (directoryState.specifications || []).filter((specification) => (
      specification.bomListA === bomId
      || specification.bomListB === bomId
      || getSpecificationStructureItems(specification).some((item) => item.bomListId === bomId)
    ));
  }
  
  function isAuthPrototypePinCorrect(pin = "") {
    return String(pin || "") === AUTH_GATE_PIN;
  }
  
  function getAuthPrototypeAttemptsLeft() {
    const value = Number(ui.authPrototypeAttemptsLeft);
    return Number.isFinite(value) ? Math.max(0, Math.min(AUTH_GATE_MAX_ATTEMPTS, Math.round(value))) : AUTH_GATE_MAX_ATTEMPTS;
  }
  
  function setAuthPrototypeAttemptsLeft(value = AUTH_GATE_MAX_ATTEMPTS) {
    ui.authPrototypeAttemptsLeft = Math.max(0, Math.min(AUTH_GATE_MAX_ATTEMPTS, Math.round(Number(value) || 0)));
  }
  
  function resetAuthPrototypeAttempts() {
    setAuthPrototypeAttemptsLeft(AUTH_GATE_MAX_ATTEMPTS);
  }
  
  function cancelAuthPrototypePinFeedback() {
    const nextSequence = Number(getAuthPrototypePinFeedbackSequence()) + 1;
    setAuthPrototypePinFeedbackSequence(Number.isFinite(nextSequence) ? nextSequence : 1);
    const feedbackTimer = getAuthPrototypePinFeedbackTimer();
    if (feedbackTimer) {
      clearTimeout(feedbackTimer);
      setAuthPrototypePinFeedbackTimer(null);
    }
  }
  
  function getAuthPrototypePinFeedbackTone(result = ui.authPrototypeResult) {
    const normalized = String(result || "");
    if (normalized === "pin-checking") return "checking";
    if (normalized === "pin-ok") return "success";
    if (normalized.startsWith("pin-error")) return "error";
    return "";
  }
  
  function isAuthPrototypePinFeedbackLocked(result = ui.authPrototypeResult) {
    return ["pin-checking", "pin-ok"].includes(String(result || ""));
  }
  
  function getAuthPrototypePinPerson(people = getAuthPrototypePeople()) {
    return getAuthPrototypeSelectedPerson(people) || getAuthPrototypeSelectedExecutor(people);
  }
  
  function inferAccessRoleIdForPerson(person = null) {
    if (!person?.id) return DEFAULT_INTERFACE_ROLE_ID;
    const assignedRoleId = normalizeAccessRoleAssignments(ui.accessRoleAssignments)[person.id];
    if (assignedRoleId) return assignedRoleId;
    const lookup = normalizeLookupText(`${person.name || ""} ${person.role || ""} ${person.department || ""}`);
    if (/директор|начальник производства|руководитель производства/.test(lookup)) return "productionHead";
    if (/технолог|инженер|подготовк/.test(lookup)) return "technologist";
    if (/диспетчер|пдо|планиров/.test(lookup)) return "planner";
    if (person.personKind === "master" || person.canDistribute || /мастер|начальник участка|начальник отдела/.test(lookup)) return "master";
    if (person.canCloseFact && !person.canExecute) return "dispatcher";
    return "executor";
  }
  
  function scheduleAuthPrototypePinValidation(pin = "", selectedPersonId = "") {
    cancelAuthPrototypePinFeedback();
    const successResult = "pin-ok";
    const errorResult = "pin-error";
    const people = getAuthPrototypePeople();
    const selectedPerson = getAuthPrototypePinPerson(people);
    const canLogin = Boolean(selectedPerson?.id && selectedPerson.id === selectedPersonId && isAuthPrototypePinCorrect(pin));
    if (canLogin) {
      completeAuthPrototypeLogin(successResult, { personId: selectedPerson.id });
      return;
    }
  
    setAuthPrototypeAttemptsLeft(getAuthPrototypeAttemptsLeft() - 1);
    const locked = getAuthPrototypeAttemptsLeft() <= 0;
    ui.authPrototypeResult = locked ? `${errorResult}-locked` : errorResult;
    resetAuthPrototypeKeypad();
    render();
  }
  
  function completeAuthPrototypeLogin(result = "pin-ok", options = {}) {
    cancelAuthPrototypePinFeedback();
    const people = getAuthPrototypePeople();
    const selectedPerson = options.personId
      ? (people.employees || []).find((person) => person.id === options.personId)
      : getAuthPrototypePinPerson(people);
    const roleId = inferAccessRoleIdForPerson(selectedPerson);
    ui.authPrototypeResult = result;
    unlockAuthGate({ personId: selectedPerson?.id || "", roleId });
    persistUiState();
    updateModuleUrlParam(ui.activeModule);
    notifySaveSuccess(`Вход выполнен: ${getAccessRoleById(roleId).label}`);
    render();
  }
  
  function getAuthPrototypePeople() {
    const employees = getProductionStructureEmployees(getProductionStructureMatrixRuntimeOverrides())
      .map((person) => ({
        ...person,
        normalized: normalizeLookupText(`${person.name || ""} ${person.role || ""} ${person.department || ""}`),
      }))
      .sort((left, right) => (
        String(left.department || "").localeCompare(String(right.department || ""), "ru")
        || String(left.name || "").localeCompare(String(right.name || ""), "ru")
      ));
    const executors = employees.filter((person) => person.canExecute !== false && person.personKind !== "master");
    const managers = employees.filter((person) => (
      person.personKind === "master"
      || person.canDistribute
      || person.canCloseFact
      || /мастер|начальник|руководитель|директор|технолог|диспетчер|инженер|админ/i.test(`${person.role || ""} ${person.name || ""}`)
    ));
    return { employees, executors: executors.length ? executors : employees, managers: managers.length ? managers : employees };
  }
  
  function getAuthPrototypeOrgModel(people = getAuthPrototypePeople()) {
    const workCenters = getProductionStructureWorkCenters(getProductionStructureMatrixRuntimeOverrides())
      .filter((center) => center.isActive !== false);
    const centerById = new Map(workCenters.map((center) => [center.id, center]));
    const childrenByParentId = new Map();
    workCenters.forEach((center) => {
      const parentId = String(center.parentWorkCenterId || "");
      if (!parentId || !centerById.has(parentId)) return;
      if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
      childrenByParentId.get(parentId).push(center);
    });
  
    const getRootCenterId = (centerId = "") => {
      let current = centerById.get(centerId);
      if (!current) return "";
      const visited = new Set();
      while (current?.parentWorkCenterId && centerById.has(current.parentWorkCenterId) && !visited.has(current.id)) {
        visited.add(current.id);
        current = centerById.get(current.parentWorkCenterId);
      }
      return current?.id || "";
    };
  
    const isInSubtree = (centerId = "", rootId = "") => {
      if (!centerId || !rootId) return false;
      let current = centerById.get(centerId);
      const visited = new Set();
      while (current && !visited.has(current.id)) {
        if (current.id === rootId) return true;
        visited.add(current.id);
        current = current.parentWorkCenterId ? centerById.get(current.parentWorkCenterId) : null;
      }
      return false;
    };
  
    const personOrg = new Map();
    (people.employees || []).forEach((person) => {
      const centerId = (person.workCenterIds || []).find((id) => centerById.has(id)) || "";
      const departmentId = centerId ? getRootCenterId(centerId) : "";
      const fallbackName = person.department || "Без отдела";
      const fallbackId = `fallback:${normalizeLookupText(fallbackName) || "department"}`;
      personOrg.set(person.id, {
        centerId,
        departmentId: departmentId || fallbackId,
        fallbackId,
        fallbackName,
      });
    });
  
    const countPeople = (source = []) => source.reduce((acc, person) => {
      acc.employees += 1;
      if (person.canExecute !== false && person.personKind !== "master") acc.executors += 1;
      if (person.personKind === "master" || person.canDistribute || person.canCloseFact) acc.staff += 1;
      if (person.role) acc.sampleRoles.add(person.role);
      return acc;
    }, {
      employees: 0,
      executors: 0,
      staff: 0,
      sampleRoles: new Set(),
    });
  
    const buildRow = (base, source = []) => {
      const count = countPeople(source);
      return {
        ...base,
        employees: count.employees,
        executors: count.executors,
        staff: count.staff,
        sampleRoles: [...count.sampleRoles].slice(0, 2),
      };
    };
  
    const roots = workCenters.filter((center) => !center.parentWorkCenterId || !centerById.has(center.parentWorkCenterId));
    const departmentRows = roots
      .map((center) => buildRow({
        id: center.id,
        name: center.name,
        caption: center.operations || center.description || "отдел матрицы структуры",
        isFallback: false,
      }, (people.employees || []).filter((person) => {
        const org = personOrg.get(person.id);
        return org?.centerId ? isInSubtree(org.centerId, center.id) : false;
      })))
      .filter((row) => row.employees > 0);
  
    const fallbackGroups = new Map();
    (people.employees || []).forEach((person) => {
      const org = personOrg.get(person.id);
      if (!org || centerById.has(org.departmentId)) return;
      if (!fallbackGroups.has(org.departmentId)) fallbackGroups.set(org.departmentId, []);
      fallbackGroups.get(org.departmentId).push(person);
    });
    fallbackGroups.forEach((source, id) => {
      const fallbackLookup = normalizeLookupText(`${source[0]?.role || ""} ${source[0]?.department || ""} ${source[0]?.name || ""}`);
      const fallbackName = /директор|начальник производства|руководител/.test(fallbackLookup)
        ? "Административный отдел"
        : source[0]?.department || "Без отдела";
      departmentRows.push(buildRow({
        id,
        name: fallbackName,
        caption: "нет привязки к участку матрицы",
        isFallback: true,
      }, source));
    });
  
    const sortedChildrenByParentId = new Map([...childrenByParentId.entries()].map(([parentId, children]) => [
      parentId,
      [...children].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru")),
    ]));
  
    return {
      workCenters,
      centerById,
      childrenByParentId: sortedChildrenByParentId,
      personOrg,
      getRootCenterId,
      isInSubtree,
      departmentRows: departmentRows.sort((left, right) => left.name.localeCompare(right.name, "ru")),
      buildRow,
    };
  }
  
  function getAuthPrototypeDepartmentRows(people = getAuthPrototypePeople()) {
    return getAuthPrototypeOrgModel(people).departmentRows;
  }
  
  function getAuthPrototypeDepartmentRow(value = "", people = getAuthPrototypePeople()) {
    const candidate = String(value || "").trim();
    if (!candidate) return null;
    return getAuthPrototypeDepartmentRows(people)
      .find((row) => row.id === candidate || row.name === candidate) || null;
  }
  
  function getAuthPrototypeSelectedDepartment(people = getAuthPrototypePeople()) {
    return getAuthPrototypeDepartmentRow(ui.authPrototypeDepartment, people);
  }
  
  function getAuthPrototypeUnitRows(people = getAuthPrototypePeople(), departmentRow = getAuthPrototypeSelectedDepartment(people)) {
    if (!departmentRow?.id) return [];
    const model = getAuthPrototypeOrgModel(people);
    const allPeople = people.employees || [];
    if (departmentRow.isFallback) return [];
  
    const root = model.centerById.get(departmentRow.id);
    if (!root) return [];
    const childRows = [];
    (model.childrenByParentId.get(root.id) || []).forEach((center) => {
      const source = allPeople.filter((person) => {
        const centerId = model.personOrg.get(person.id)?.centerId || "";
        return model.isInSubtree(centerId, center.id);
      });
      if (!source.length) return;
      childRows.push(model.buildRow({
        id: center.id,
        name: center.name,
        caption: center.operations || center.description || "участок матрицы структуры",
        rootId: root.id,
      }, source));
    });
  
    return childRows;
  }
  
  function getAuthPrototypeUnitRow(value = "", people = getAuthPrototypePeople(), departmentRow = getAuthPrototypeSelectedDepartment(people)) {
    const candidate = String(value || "").trim();
    if (!candidate) return null;
    return getAuthPrototypeUnitRows(people, departmentRow)
      .find((row) => row.id === candidate || row.name === candidate) || null;
  }
  
  function getAuthPrototypeSelectedUnit(people = getAuthPrototypePeople(), departmentRow = getAuthPrototypeSelectedDepartment(people)) {
    return getAuthPrototypeUnitRow(ui.authPrototypeUnit, people, departmentRow);
  }
  
  function getAuthPrototypeDirectDepartmentPeople(people, departmentRow = getAuthPrototypeSelectedDepartment(people)) {
    if (!departmentRow?.id) return [];
    const model = getAuthPrototypeOrgModel(people);
    return (people.employees || [])
      .filter((person) => {
        const org = model.personOrg.get(person.id);
        if (!org) return false;
        if (departmentRow.isFallback) return org.departmentId === departmentRow.id;
        return org.centerId === departmentRow.id;
      })
      .sort((left, right) => (
        String(left.role || "").localeCompare(String(right.role || ""), "ru")
        || String(left.name || "").localeCompare(String(right.name || ""), "ru")
      ));
  }
  
  function getAuthPrototypePeopleByUnit(people, departmentRow = getAuthPrototypeSelectedDepartment(people), unitRow = getAuthPrototypeSelectedUnit(people, departmentRow)) {
    if (!departmentRow?.id) return [];
    if (!unitRow?.id) return getAuthPrototypeDirectDepartmentPeople(people, departmentRow);
    const model = getAuthPrototypeOrgModel(people);
    return (people.employees || [])
      .filter((person) => {
        const org = model.personOrg.get(person.id);
        if (!org) return false;
        if (model.centerById.has(unitRow.id)) return model.isInSubtree(org.centerId, unitRow.id);
        return false;
      })
      .sort((left, right) => (
        String(left.role || "").localeCompare(String(right.role || ""), "ru")
        || String(left.name || "").localeCompare(String(right.name || ""), "ru")
      ));
  }
  
  function getAuthPrototypeSelectedPerson(people = getAuthPrototypePeople()) {
    const departmentRow = getAuthPrototypeSelectedDepartment(people);
    const unitRow = getAuthPrototypeSelectedUnit(people, departmentRow);
    if (!departmentRow?.id || !ui.authPrototypePersonId) return null;
    return getAuthPrototypePeopleByUnit(people, departmentRow, unitRow).find((person) => person.id === ui.authPrototypePersonId) || null;
  }
  
  function renderProductsPage() {
    return renderSpekiPage({
      ariaLabel: PRODUCT_COMPOSITION_LIST_TERM,
      sidebarEyebrow: "Технологии",
      sidebarTitle: PRODUCT_COMPOSITION_LIST_TERM,
      listLabel: "Реестр спецификаций",
      createLabel: "Новая спецификация",
    });
  }
  
  function bindProductsEvents() {
    bindSpekiEvents();
  }
  
  function renderSpekiPage(options = {}) {
    const ariaLabel = options.ariaLabel || PRODUCT_COMPOSITION_TERM;
    return renderSpekiWorkspace({ ...options, ariaLabel });
  }
  
  function renderSpekiWorkspace(options = {}) {
    const specifications = directoryState.specifications || [];
    const activeSpecification = specifications.find((specification) => specification.id === ui.activeSpecificationId) || null;
    const isEditing = Boolean(activeSpecification && ui.spekiEditingId === activeSpecification.id);
    const sidebarEyebrow = options.sidebarEyebrow || "Перечень";
    const sidebarTitle = options.sidebarTitle || PRODUCT_COMPOSITION_TERM;
    const listLabel = options.listLabel || PRODUCT_COMPOSITION_LIST_TERM;
    const createLabel = options.createLabel || "Новое изделие";
    const headerTitle = activeSpecification
      ? activeSpecification.name || "Состав изделия"
      : "Состав изделия не выбран";
    const headerDescription = activeSpecification
      ? `${getSpecificationStructureItems(activeSpecification).length.toLocaleString("ru-RU")} строк состава; структура используется маршрутами и заказ-нарядами.`
      : "Выберите состав изделия слева или создайте новый, чтобы открыть таблицу структуры.";
  
    const sidebar = renderUiModuleSidebar({
      eyebrow: sidebarEyebrow,
      title: sidebarTitle,
      variant: "list",
      className: "speki-sidebar",
      actions: renderUiActionButton({
        label: createLabel,
        iconName: "plus",
        tone: "primary",
        attributes: "data-speki-create-specification type=\"button\"",
      }),
      body: `
        <div class="ui-sidebar-list speki-spec-list">
          <div class="ui-sidebar-label">${escapeHtml(listLabel)}</div>
          ${specifications.length ? specifications.map((specification) => renderUiSidebarItem({
            title: specification.name || "Изделие без названия",
            meta: `${specification.outputItem || PRODUCT_STRUCTURE_TERM} · ${getSpecificationStructureItems(specification).length} строк`,
            active: specification.id === activeSpecification?.id,
            attributes: `data-speki-spec-open="${escapeAttribute(specification.id)}" type="button"`,
          })).join("") : `
            <article class="module-empty-note">
              <strong>Спецификации пока не созданы</strong>
              <span>Создайте спецификацию и соберите её из номенклатурных позиций и связанных составов.</span>
            </article>
          `}
        </div>
      `,
    });
  
    const content = activeSpecification
      ? renderUiPanel({
        title: PRODUCT_STRUCTURE_TERM,
        className: "speki-spec-table-panel",
        body: renderUiPanelBody({ body: renderSpekiStructureTable(activeSpecification, isEditing) }),
      })
      : renderUiPanel({
        className: "speki-spec-table-panel",
        body: renderUiPanelBody({
          body: renderUiEmptyState({
            iconName: "tree",
            title: "Изделие не выбрано",
            text: "Выберите изделие слева или создайте новое, чтобы объединить платы и номенклатуру в производственную структуру.",
          }),
        }),
      });
  
    return renderUiModulePage({
      ariaLabel: options.ariaLabel || PRODUCT_COMPOSITION_TERM,
      className: "speki-page",
      sidebar,
      header: renderUiModuleHeader({
        eyebrow: sidebarEyebrow,
        title: headerTitle,
        description: headerDescription,
      }),
      contentClassName: "speki-module-content",
      content,
    });
  }
  
  function getSpekiStructureTypeTone(type = "") {
    if (type === "assembly") return "assembly";
    if (type === "bom") return "bom";
    if (type === "specification") return "specification";
    return "nomenclature";
  }
  
  function renderSpekiStructureTypeChip(type, label) {
    const tone = getSpekiStructureTypeTone(type);
    return `<span class="speki-section-chip is-${escapeAttribute(tone)}">${escapeHtml(label)}</span>`;
  }
  
  function getSpekiStructureSectionValue(item = {}, nomenclatureItem = null) {
    const explicitType = String(item.nomenclatureType || "").trim();
    const actualType = nomenclatureItem?.type ? normalizeNomenclatureType(nomenclatureItem.type) : "";
    if (actualType) return actualType;
    const inferredType = inferStructureNomenclatureType(item, nomenclatureItem);
    if (
      explicitType
      && normalizeLookupText(explicitType) === normalizeLookupText(NOMENCLATURE_REA_COMPONENT_TYPE)
      && !item.nomenclatureId
      && normalizeLookupText(inferredType) !== normalizeLookupText(NOMENCLATURE_REA_COMPONENT_TYPE)
    ) {
      return inferredType;
    }
    return explicitType ? normalizeNomenclatureType(explicitType) : inferredType;
  }
  
  function renderSpekiStructureSectionChip(label, tone) {
    return `<span class="speki-section-chip is-${escapeAttribute(tone || getNomenclatureTypeTone(label))}">${escapeHtml(label || "Раздел не выбран")}</span>`;
  }
  
  function renderSpekiStructureSectionIcon(label, tone, options = {}) {
    const visual = options.visual || getNomenclatureTypeVisual(label, tone);
    const tooltip = options.tooltip || visual.tooltip;
    const iconName = options.iconName || visual.iconName;
    return `
      <span
        class="speki-section-icon-badge is-${escapeAttribute(visual.tone || "section-neutral")}"
        role="img"
        aria-label="${escapeAttribute(tooltip)}"
        title="${escapeAttribute(tooltip)}"
        data-tooltip="${escapeAttribute(tooltip)}"
      >
        ${icon(iconName || "package")}
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
  
  function getSpekiNomenclatureOptions(sectionName = "", currentId = "") {
    const normalizedSection = normalizeLookupText(sectionName);
    const allItems = directoryState.nomenclature || [];
    const currentItem = allItems.find((item) => item.id === currentId);
    const sectionItems = allItems.filter((item) => !normalizedSection || normalizeLookupText(normalizeNomenclatureType(item.type)) === normalizedSection);
    const options = sectionItems.map((item) => ({
      value: item.id,
      label: item.name || "Позиция без названия",
      meta: [item.article, item.package || item.type].filter(Boolean).join(" · ") || "номенклатура",
    }));
    if (currentItem && !options.some((option) => option.value === currentItem.id)) {
      options.unshift({
        value: currentItem.id,
        label: currentItem.name || "Позиция без названия",
        meta: [currentItem.article, currentItem.package || currentItem.type].filter(Boolean).join(" · ") || "текущая позиция",
      });
    }
    return [
      { value: "", label: "Выберите номенклатуру", meta: sectionName ? `раздел: ${sectionName}` : "позиция состава" },
      ...options,
    ];
  }
  
  function getSpekiStructureItemDisplayName(item = {}) {
    if (item.type === "bom") return getBomList(getSpecificationItemBomId(item))?.name || item.name || "Плата не выбрана";
    if (item.type === "specification") {
      return (directoryState.specifications || []).find((entry) => entry.id === item.specificationId)?.name
        || item.name
        || "Состав изделия не выбран";
    }
    if (item.type === "nomenclature" || item.type === "part") {
      return (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)?.name
        || item.name
        || "Номенклатура не выбрана";
    }
    return item.name || "Номенклатурная позиция";
  }
  
  function formatSpekiStructureQuantity(item = {}) {
    const quantity = Number(item.quantity || 0);
    const formattedQuantity = Number.isFinite(quantity) && quantity > 0 ? formatReportNumber(quantity) : "-";
    return [formattedQuantity, item.unit || ""].filter(Boolean).join(" ");
  }
  
  function renderSpekiStructureFlowInline(item = {}, allItems = []) {
    const childItems = allItems.filter((child) => (child.parentId || "root") === item.id);
    const bom = getSpecificationItemBom(item);
  
    if (childItems.length) {
      return `
        <small class="speki-flow-inline is-assembly-flow">
          Входы: ${childItems.map((child) => escapeHtml(getSpekiStructureItemDisplayName(child))).join(" + ")}
        </small>
      `;
    }
  
    if (bom) {
      const rowCount = getBomImportRows(bom).length;
      return `
        <small class="speki-flow-inline is-bom-flow">
          BOM: ${escapeHtml(bom.name || "BOM не выбран")} · ${rowCount.toLocaleString("ru-RU")} позиций
        </small>
      `;
    }
  
    return "";
  }
  
  function renderSpekiAssemblyFormula(specification, rows = []) {
    const items = rows.map((row) => row.item).filter(Boolean);
    const formulaRows = items
      .map((item) => ({
        item,
        children: items.filter((child) => (child.parentId || "root") === item.id),
      }))
      .filter(({ children }) => children.length);
  
    if (!formulaRows.length) return "";
  
    const rootItems = items.filter((item) => (item.parentId || "root") === "root");
    const rootOutput = specification.outputItem || specification.name || PRODUCT_COMPOSITION_TERM;
  
    return `
      <section class="speki-assembly-formula" aria-label="Логика сборки изделия">
        <div class="speki-assembly-formula-head">
          <strong>Логика сборки</strong>
          <span>входные позиции → результирующая позиция</span>
        </div>
        <div class="speki-assembly-formula-list">
          ${formulaRows.map(({ item, children }) => `
            <article>
              <span>${children.map((child) => escapeHtml(getSpekiStructureItemDisplayName(child))).join(" + ")}</span>
              <em aria-hidden="true">→</em>
              <strong>${escapeHtml(getSpekiStructureItemDisplayName(item))}</strong>
            </article>
          `).join("")}
          ${rootItems.length ? `
            <article class="is-root-output">
              <span>${rootItems.map((item) => escapeHtml(getSpekiStructureItemDisplayName(item))).join(" + ")}</span>
              <em aria-hidden="true">→</em>
              <strong>${escapeHtml(rootOutput)}</strong>
            </article>
          ` : ""}
        </div>
      </section>
    `;
  }
  
  function renderSpekiStructureTable(specification, isEditing = false) {
    if (!specification) {
      return renderUiEmptyState({
        iconName: "book",
        title: "Состав изделия не выбран",
        text: "Выберите состав изделия в левом перечне, чтобы управлять его структурой.",
      });
    }
  
    const rows = getSpekiStructureTableRows(specification);
    const structureItems = rows.map((row) => row.item).filter(Boolean);
    const bomOptions = [
      { value: "", label: "Выберите плату", meta: "BOM / компонентный состав" },
      ...(directoryState.bomLists || []).map((item) => ({
        value: item.id,
        label: item.name || "Плата без названия",
        meta: item.resultItem || item.boardCode || `${getBomImportRows(item).length} строк`,
      })),
    ];
    const specificationOptions = [
      { value: "", label: "Выберите изделие", meta: "вложенное изделие" },
      ...(directoryState.specifications || [])
        .filter((item) => item.id !== specification.id)
        .map((item) => ({
          value: item.id,
          label: item.name || "Изделие без названия",
          meta: `${getSpecificationStructureItems(item).length} строк состава`,
        })),
    ];
    const sectionOptions = getSpekiStructureSectionOptions()
      .map((option) => ({ ...option, iconName: "", summaryIconName: "" }));
    const outputOptions = (directoryState.nomenclature || []).map((item) => `
      <option value="${escapeAttribute(item.id)}" ${item.id === specification.outputNomenclatureId ? "selected" : ""}>
        ${escapeHtml(item.name || "Позиция без названия")}${item.article ? ` · ${escapeHtml(item.article)}` : ""}
      </option>
    `).join("");
    const miniCardMarkup = `
      <article class="speki-spec-mini-card">
        <label class="speki-spec-name-field">
          <span>Название состава изделия</span>
          <input data-speki-spec-name="${escapeAttribute(specification.id)}" value="${escapeAttribute(specification.name || "")}" placeholder="Введите название состава изделия" ${isEditing ? "" : "disabled"} />
        </label>
        <label class="speki-spec-name-field">
          <span>Результирующее изделие</span>
          <select data-speki-spec-output="${escapeAttribute(specification.id)}" ${isEditing ? "" : "disabled"} required>
            <option value="">Выберите одну позицию номенклатуры</option>
            ${outputOptions}
          </select>
        </label>
        <label class="speki-spec-name-field">
          <span>Ревизия</span>
          <input data-speki-spec-revision="${escapeAttribute(specification.id)}" value="${escapeAttribute(specification.revision || "01")}" ${isEditing ? "" : "disabled"} />
        </label>
        <label class="speki-spec-name-field">
          <span>Статус</span>
          <select data-speki-spec-status="${escapeAttribute(specification.id)}" ${isEditing ? "" : "disabled"}>
            <option value="draft" ${specification.lifecycleStatus === "draft" ? "selected" : ""}>Черновик</option>
            <option value="agreed" ${specification.lifecycleStatus === "agreed" ? "selected" : ""}>Согласована</option>
            <option value="active" ${specification.lifecycleStatus === "active" ? "selected" : ""}>Действует</option>
            <option value="archived" ${specification.lifecycleStatus === "archived" ? "selected" : ""}>Архив</option>
            <option value="superseded" ${specification.lifecycleStatus === "superseded" ? "selected" : ""}>Заменена новой ревизией</option>
          </select>
        </label>
        <div class="speki-spec-card-actions">
          ${isEditing
            ? renderUiActionButton({ label: "Сохранить", iconName: "save", tone: "primary", attributes: `data-speki-save="${escapeAttribute(specification.id)}" type="button"` })
            : renderUiActionButton({ label: "Редактировать", iconName: "edit", attributes: `data-speki-edit="${escapeAttribute(specification.id)}" type="button"` })}
          ${renderUiActionButton({ label: "Удалить", iconName: "trash", className: "danger", attributes: `data-speki-delete="${escapeAttribute(specification.id)}" type="button"` })}
        </div>
      </article>
    `;
  
    return `
      ${miniCardMarkup}
      ${renderSpekiAssemblyFormula(specification, rows)}
      ${renderUiTableWrap({
        className: "speki-structure-table-wrap ui-document-tree-table-wrap",
        body: `
        <table class="directory-table speki-structure-table ui-table ui-document-tree-table">
          <thead>
            <tr>
              <th>П/п</th>
              <th>Раздел</th>
              <th>Наименование</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(({ item, number, level, hasChildren, isLast, continuationLevels = [] }, index) => {
              const linkedSpecification = item.type === "specification"
                ? (directoryState.specifications || []).find((entry) => entry.id === item.specificationId)
                : null;
              const bom = item.type === "bom" ? getBomList(getSpecificationItemBomId(item)) : null;
              const bomResultItem = item.type === "bom" ? getBomResultNomenclatureItem(getSpecificationItemBomId(item)) : null;
              const nomenclatureItem = item.type === "nomenclature" || item.type === "part" || item.type === "bom"
                ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId) || bomResultItem
                : null;
              const rowType = item.type === "specification" || item.type === "bom" ? item.type : "nomenclature";
              const sectionValue = getSpekiStructureSectionValue(item, nomenclatureItem);
              const sectionTone = getNomenclatureTypeTone(sectionValue);
              const objectSelect = rowType === "specification"
                ? renderDenseInlineSelect("specificationId", item.specificationId, specificationOptions, { type: "spekiStructureSpecification", itemId: item.id })
                : rowType === "bom"
                    ? renderDenseInlineSelect("bomListId", item.bomListId, bomOptions, { type: "spekiStructureBom", itemId: item.id })
                    : renderDenseInlineSelect("nomenclatureId", item.nomenclatureId || nomenclatureItem?.id || "", getSpekiNomenclatureOptions(sectionValue, item.nomenclatureId || nomenclatureItem?.id || ""), { type: "spekiStructureNomenclature", itemId: item.id });
              const objectLabel = rowType === "specification"
                ? linkedSpecification?.name || item.name || "Изделие не выбрано"
                : rowType === "bom"
                    ? bom?.name || item.name || "Плата не выбрана"
                  : nomenclatureItem?.name || item.name || "Номенклатура не выбрана";
              const objectMissing = rowType === "specification"
                ? !linkedSpecification
                : rowType === "bom"
                    ? !bom
                  : !nomenclatureItem;
              const quantityMissing = Number(item.quantity || 0) <= 0;
              const unitMissing = !String(item.unit || "").trim();
              const objectContent = isEditing ? objectSelect : `<span class="speki-static-cell">${escapeHtml(objectLabel)}</span>`;
              const treeContent = `
                <div class="speki-tree-cell is-level-${Math.min(5, Math.max(0, Number(level || 0)))} ${hasChildren ? "has-children" : ""} ${isLast ? "is-last" : ""}">
                  ${renderStructureTreeGuides(continuationLevels)}
                  <span class="speki-tree-branch" aria-hidden="true"></span>
                  <div class="speki-tree-object">
                    ${objectContent}
                    ${renderSpekiStructureFlowInline(item, structureItems)}
                  </div>
                </div>
              `;
              const rowNumberContent = `<span class="speki-row-number">${escapeHtml(number)}</span>`;
              const sectionContent = isEditing
                  ? renderDenseInlineSelect("nomenclatureType", sectionValue, sectionOptions, { type: "spekiStructureNomenclatureType", itemId: item.id, tone: sectionTone })
                  : renderSpekiStructureSectionChip(sectionValue, sectionTone);
  
              return `
              <tr class="ui-table-row ${hasChildren ? "is-speki-tree-parent" : ""}" data-speki-structure-row="${escapeAttribute(item.id)}" style="--speki-level: ${level};">
                  <td>${rowNumberContent}</td>
                  <td>${sectionContent}</td>
                  <td class="${objectMissing ? "is-speki-field-missing" : ""}"><div class="speki-object-cell">${treeContent}</div></td>
                  <td class="${quantityMissing ? "is-speki-field-missing" : ""}">${isEditing ? `<input data-speki-structure-input="${escapeAttribute(item.id)}" data-speki-structure-field="quantity" type="number" inputmode="numeric" min="0" step="1" value="${Math.round(Number(item.quantity || 0))}" />` : `<span class="speki-static-cell">${escapeHtml(formatReportNumber(item.quantity || 0))}</span>`}</td>
                  <td class="${unitMissing ? "is-speki-field-missing" : ""}">${isEditing ? `<input data-speki-structure-input="${escapeAttribute(item.id)}" data-speki-structure-field="unit" value="${escapeAttribute(item.unit)}" />` : `<span class="speki-static-cell">${escapeHtml(item.unit || "шт.")}</span>`}</td>
	                  <td>
	                    <div class="speki-table-row-actions">
	                      ${renderUiActionButton({ iconName: "arrowLeft", tone: "icon", attributes: `data-speki-structure-outdent="${escapeAttribute(item.id)}" type="button" title="На уровень выше" aria-label="На уровень выше" ${!isEditing || level === 0 ? "disabled" : ""}` })}
	                      ${renderUiActionButton({ iconName: "arrowRight", tone: "icon", attributes: `data-speki-structure-indent="${escapeAttribute(item.id)}" type="button" title="На уровень ниже" aria-label="На уровень ниже" ${!isEditing || index === 0 ? "disabled" : ""}` })}
	                      ${renderUiActionButton({ iconName: "chevronUp", tone: "icon", attributes: `data-speki-structure-up="${escapeAttribute(item.id)}" type="button" title="Поднять" aria-label="Поднять" ${!isEditing || index === 0 ? "disabled" : ""}` })}
	                      ${renderUiActionButton({ iconName: "chevronDown", tone: "icon", attributes: `data-speki-structure-down="${escapeAttribute(item.id)}" type="button" title="Опустить" aria-label="Опустить" ${!isEditing || index === rows.length - 1 ? "disabled" : ""}` })}
	                      ${renderUiActionButton({ iconName: "trash", tone: "icon", className: "danger-soft", attributes: `data-speki-structure-delete="${escapeAttribute(item.id)}" type="button" title="Удалить строку" aria-label="Удалить строку" ${isEditing ? "" : "disabled"}` })}
	                    </div>
	                  </td>
                </tr>
              `;
            }).join("") : `
              <tr class="ui-table-row ui-table-empty">
                <td colspan="6" class="primary-cell">
                  <span class="component-name">Структура пока пустая</span>
                  <small>Добавьте позицию номенклатуры. Изготавливаемая позиция может ссылаться на собственную спецификацию.</small>
                </td>
              </tr>
            `}
          </tbody>
          <tfoot>
  	            <tr class="ui-table-row">
  	            <td colspan="6">
  	              <div class="speki-table-add-row">
	                ${renderUiActionButton({ label: "Добавить позицию", iconName: "plus", attributes: `data-speki-add-row="nomenclature" type="button"` })}
  	              </div>
              </td>
            </tr>
          </tfoot>
        </table>
        `,
      })}
    `;
  }
  
  function getSpekiStructureTableRows(specification) {
    const items = getSpecificationStructureItems(specification)
      .filter((item) => item.type === "bom" || item.type === "specification" || item.type === "nomenclature" || item.type === "part");
    const visibleIds = new Set(items.map((item) => item.id));
    const byParent = new Map();
  
    items.forEach((item) => {
      const parentId = item.parentId && visibleIds.has(item.parentId) ? item.parentId : "root";
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push(item);
    });
  
    const rows = [];
    const visited = new Set();
    const appendChildren = (parentId, path, level, continuationLevels = []) => {
      const siblings = byParent.get(parentId) || [];
      siblings.forEach((item, index) => {
        if (visited.has(item.id)) return;
        const nextPath = [...path, index + 1];
        const childItems = byParent.get(item.id) || [];
        const isLast = index === siblings.length - 1;
        visited.add(item.id);
        rows.push({
          item,
          number: nextPath.join("."),
          level,
          hasChildren: childItems.length > 0,
          isLast,
          continuationLevels,
        });
        appendChildren(item.id, nextPath, level + 1, [...continuationLevels, !isLast]);
      });
    };
  
    appendChildren("root", [], 0);
    items.forEach((item) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      rows.push({ item, number: String(rows.length + 1), level: 0, hasChildren: false, isLast: true, continuationLevels: [] });
    });
  
    return rows;
  }
  
  function isSpekiStructureItemReferenceStale(item, specificationId = "") {
    if (!item) return false;
    if (item.type === "bom") return Boolean(item.bomListId) && !getBomList(item.bomListId);
    if (item.type === "specification") {
      return Boolean(item.specificationId) && !(directoryState.specifications || [])
        .some((specification) => specification.id === item.specificationId && specification.id !== specificationId);
    }
    if (item.type === "nomenclature" || item.type === "part") {
      return Boolean(item.nomenclatureId) && !(directoryState.nomenclature || [])
        .some((entry) => entry.id === item.nomenclatureId);
    }
    return false;
  }
  
  function checkSpekiStructureReferences(specificationId) {
    const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
    if (!specification) return;
    const staleItemIds = getSpecificationStructureItems(specification)
      .filter((item) => isSpekiStructureItemReferenceStale(item, specification.id))
      .map((item) => item.id);
  
    ui.spekiCheckedSpecificationId = specification.id;
    ui.spekiStaleItemIds = staleItemIds;
    persistUiState();
    render();
    alert(staleItemIds.length
      ? `Проверка завершена: найдено ${staleItemIds.length} удаленных позиций. Они подсвечены желтым в колонке «Наименование».`
      : "Проверка завершена: удаленных позиций не найдено.");
  }
  
  function clearSpekiStaleItem(itemId = "") {
    if (!itemId || !Array.isArray(ui.spekiStaleItemIds) || !ui.spekiStaleItemIds.length) return;
    ui.spekiStaleItemIds = ui.spekiStaleItemIds.filter((id) => id !== itemId);
  }
  
  function isSpekiBomCollapsed(itemId = "") {
    return Boolean(itemId && (ui.spekiCollapsedBomIds || []).includes(itemId));
  }
  
  function toggleSpekiBomCollapse(itemId = "") {
    if (!itemId) return;
    const collapsedIds = new Set(ui.spekiCollapsedBomIds || []);
    if (collapsedIds.has(itemId)) {
      collapsedIds.delete(itemId);
    } else {
      collapsedIds.add(itemId);
    }
    ui.spekiCollapsedBomIds = [...collapsedIds];
    persistUiState();
    render();
  }
  
  function renderSpekiBomNomenclatureRows(item, bom, number, level, isCollapsed = false) {
    if (!getSpecificationItemBomId(item) || !bom) return "";
    const bomRows = getBomImportRows(bom);
    const childLevel = level + 1;
    const bomQuantity = Math.max(1, Math.round(Number(item.quantity || 1)));
  
    if (isCollapsed) return "";
  
    if (!bomRows.length) {
      return `
        <tr class="is-speki-bom-item is-empty" data-speki-bom-child="${escapeAttribute(item.id)}" style="--speki-level: ${childLevel};">
          <td><span class="speki-row-number">${escapeHtml(`${number}.0`)}</span></td>
          <td><span class="speki-static-cell">Номенклатура BOM</span></td>
          <td><span class="speki-static-cell">BOM импортирован без табличной номенклатуры</span></td>
          <td><span class="speki-static-cell">Покупное изделие</span></td>
          <td><span class="speki-static-cell">Операция не требуется</span></td>
          <td><span class="speki-static-cell">-</span></td>
          <td><span class="speki-static-cell">-</span></td>
          <td><span class="speki-static-cell">шт.</span></td>
          <td><span class="speki-bom-source-note">из BOM</span></td>
        </tr>
      `;
    }
  
    return bomRows.map((row, index) => {
      const quantity = Math.max(0, Number(row.quantity || 0)) * bomQuantity;
      const description = row.description || row.manufacturerPart || row.designator || "Позиция BOM";
      const details = [
        row.designator ? `Поз.: ${row.designator}` : "",
        row.manufacturerPart ? `PN: ${row.manufacturerPart}` : "",
        row.manufacturer ? row.manufacturer : "",
        row.package ? `Корпус: ${row.package}` : "",
      ].filter(Boolean).join(" · ");
  
      return `
        <tr class="is-speki-bom-item" data-speki-bom-child="${escapeAttribute(item.id)}" style="--speki-level: ${childLevel};">
          <td><span class="speki-row-number">${escapeHtml(`${number}.${index + 1}`)}</span></td>
          <td><span class="speki-static-cell">Номенклатура BOM</span></td>
          <td>
            <span class="speki-static-cell speki-bom-item-name" title="${escapeAttribute(details || description)}">${escapeHtml(description)}</span>
            ${details ? `<small class="speki-bom-item-meta">${escapeHtml(details)}</small>` : ""}
          </td>
          <td><span class="speki-static-cell">Покупное изделие</span></td>
          <td><span class="speki-static-cell">Операция не требуется</span></td>
          <td><span class="speki-static-cell">-</span></td>
          <td><span class="speki-static-cell">${Number.isFinite(quantity) && quantity > 0 ? escapeHtml(formatReportNumber(quantity)) : "-"}</span></td>
          <td><span class="speki-static-cell">шт.</span></td>
          <td><span class="speki-bom-source-note">из BOM</span></td>
        </tr>
      `;
    }).join("");
  }
  
  function compareStructureNumbers(left, right) {
    const leftParts = String(left || "").split(".").map((part) => Number(part || 0));
    const rightParts = String(right || "").split(".").map((part) => Number(part || 0));
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
      if (delta !== 0) return delta;
    }
    return 0;
  }
  
  function getSpekiStructureItemLabel(item) {
    if (!item) return "Позиция";
    if (item.type === "bom") return getBomList(item.bomListId)?.name || item.name || "Плата не выбрана";
    if (item.type === "specification") {
      return (directoryState.specifications || []).find((entry) => entry.id === item.specificationId)?.name
        || item.name
        || "Состав изделия не выбран";
    }
    if (item.type === "nomenclature" || item.type === "part") {
      return (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)?.name
        || item.name
        || "Номенклатура не выбрана";
    }
    return item.name || "Номенклатурная позиция";
  }
  
  function createSpekiSpecification() {
    const existingSpecifications = directoryState.specifications || [];
    const index = existingSpecifications.length + 1;
    const stamp = new Date().toISOString();
    const id = makeId("spec");
    const row = normalizeDirectoryRow("specifications", {
      id,
      name: `Новое изделие ${String(index).padStart(2, "0")}`,
      projectId: "",
      outputItem: `Изделие ${String(index).padStart(2, "0")}`,
      outputNomenclatureId: `nom-result-${id}`,
      revision: "01",
      lifecycleStatus: "draft",
      productionQuantity: 1,
      dueDate: toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
      orderNumber: "",
      customer: "",
      bomListA: "",
      bomQtyA: 0,
      bomListB: "",
      bomQtyB: 0,
      extraItems: "",
      structureManaged: true,
      structureItems: [],
      createdAt: stamp,
      updatedAt: stamp,
    });
  
    directoryState.specifications = [...existingSpecifications, syncSpecificationDerivedFields(row)];
    Object.assign(
      dependencies.getDirectoryState?.() || {},
      normalizeDirectoryState(directoryState, { mergeFallback: false }),
    );
    ui.activeSpecificationId = id;
    ui.spekiEditingId = id;
    ui.spekiCheckedSpecificationId = "";
    ui.spekiStaleItemIds = [];
    persistDirectoryState();
    persistUiState();
    notifySaveSuccess("Изделие создано");
    render();
  }
  
  function getActiveNomenclatureItem() {
    if (ui.activeNomenclatureId === "__new__") return null;
    if (!ui.activeNomenclatureId) return null;
    return getNomenclatureItem(ui.activeNomenclatureId);
  }
  
  function getActiveNomenclaturePane() {
    return ui.activeNomenclaturePane === "boards" ? "boards" : "items";
  }
  
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
  
  function getNomenclatureItem(itemId) {
    return (directoryState.nomenclature || []).find((item) => item.id === itemId) || null;
  }
  
  function getNomenclatureDeleteUsage(itemId) {
    const specifications = (directoryState.specifications || []).filter((specification) => (
      getSpecificationStructureItems(specification).some((item) => item.nomenclatureId === itemId)
    ));
    const bomRowsCount = (directoryState.bomLists || []).reduce((sum, bom) => (
      sum + getBomImportRows(bom).filter((row) => row.nomenclatureId === itemId).length
    ), 0);
  
    return {
      specificationsCount: specifications.length,
      bomRowsCount,
    };
  }
  
  
  function renderModulePreviewEmpty({ iconName = "info", title, text, action = "" }) {
    return renderUiEmptyState({ iconName, title, text, action });
  }
  
  function renderNomenclaturePage() {
    // CORRECTIVE-A-COMPAT: thin wrapper for render switch compatibility.
    return renderNomenclatureModulePage({
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
      renderNomenclatureSectionFilter,
      renderUiActionButton,
      renderUiEmptyState,
      renderUiFormField,
      renderUiModuleHeader,
      renderUiModulePage,
      renderUiModuleSidebar,
      renderUiPanel,
      renderUiPanelBody,
      renderUiStatusToken,
      renderUiTableWrap,
      ui,
    });
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
        ${isQuantity ? `type="number" min="0" step="1"` : `type="text"`}
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
    if (!rows.length) {
      return renderBomImportPreviewTable();
    }
  
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
  
  function getDirectoryRows(sectionId) {
    return Array.isArray(directoryState?.[sectionId]) ? directoryState[sectionId] : [];
  }
  
  function getSpecificationById(specificationId) {
    return getDirectoryRows("specifications")
      .find((specification) => specification.id === specificationId) || null;
  }
  
  function getRouteSpecification(route) {
    return getSpecificationById(route?.specificationId)
      || getSpecificationByProjectId(route?.projectId)
      || null;
  }
  
  function getRouteBomList(route) {
    return getBomList(route?.bomListId || "");
  }
  
  function getRouteBindingContext(value = "") {
    const rawValue = String(value || "").trim();
    if (!rawValue) return { kind: "", id: "", value: "", specification: null, bom: null };
  
    const [rawKind, ...rest] = rawValue.split(":");
    const hasKindPrefix = ["spec", "bom"].includes(rawKind);
    const kind = hasKindPrefix ? rawKind : "";
    const id = hasKindPrefix ? rest.join(":") : rawValue;
    const specification = kind !== "bom" ? getSpecificationById(id) || getSpecificationByProjectId(id) : null;
    if (specification) {
      return {
        kind: "spec",
        id: specification.id,
        value: `spec:${specification.id}`,
        specification,
        bom: null,
      };
    }
  
    const bom = kind !== "spec" ? getBomList(id) : null;
    if (bom) {
      return {
        kind: "bom",
        id: bom.id,
        value: `bom:${bom.id}`,
        specification: null,
        bom,
      };
    }
  
    return { kind, id, value: rawValue, specification: null, bom: null };
  }
  
  function normalizeRouteBindingValue(value = "") {
    return getRouteBindingContext(value).value || "";
  }
  
  function normalizeRouteBindingMode(value = "") {
    return value === "bom" ? "bom" : "product";
  }
  
  function getRouteBindingModeForSelection(value = "", route = null) {
    const binding = getRouteBindingContext(value);
    if (binding.kind === "bom" || binding.bom || route?.bomListId) return "bom";
    return "product";
  }
  
  function getRouteBindingOptions() {
    const productOptions = (directoryState.specifications || []).map((item) => ({
      value: `spec:${item.id}`,
      label: item.name || "Изделие без названия",
      meta: `${PRODUCT_COMPOSITION_TERM} · ${getSpecificationProductionOrder(item) || "заказ не задан"}`,
    }));
    const bomOptions = (directoryState.bomLists || []).map((item) => ({
      value: `bom:${item.id}`,
      label: item.name || "Плата без названия",
      meta: `${BOARD_BOM_TERM} · ${getBomImportRows(item).length || Object.values(getBomComponentCounts(item)).reduce((sum, count) => sum + Number(count || 0), 0)} поз.`,
    }));
  
    return [
      { value: "", label: "Связь не выбрана", meta: "маршрутная карта как самостоятельный документ" },
      ...productOptions,
      ...bomOptions,
    ];
  }
  
  function ensureRouteModuleProjectForSpecification(specification) {
    if (!specification) return "";
    const specificationId = ensureSpecificationPlanningUnit(specification);
    if (!specificationId) return "";
    if (!specification.projectId) return specificationId;
  
    const stamp = new Date().toISOString();
    directoryState.specifications = (directoryState.specifications || []).map((item) => (
      item.id === specification.id
        ? syncSpecificationDerivedFields({ ...item, projectId: "", updatedAt: stamp })
        : item
    ));
    Object.assign(dependencies.getDirectoryState?.() || {}, normalizeDirectoryState(directoryState, { mergeFallback: false }));
    persistDirectoryState();
    return specificationId;
  }
  
  function resolveRouteModuleProjectId(selectionValue, options = {}) {
    const binding = getRouteBindingContext(selectionValue);
    if (binding.bom) return "";
    const value = binding.specification?.id || String(selectionValue || "");
    if (!value) return "";
  
    const specification = binding.specification || getSpecificationById(value) || getSpecificationByProjectId(value);
    if (specification) {
      if (getProject(specification.id)) return specification.id;
      return options.createPlanningUnit === false
        ? ""
        : ensureRouteModuleProjectForSpecification(specification);
    }
  
    return getProject(value)?.id || value;
  }
  
  function getRouteModuleSelectionValue(route, fallbackSpecification = null) {
    const routeBom = getRouteBomList(route);
    if (routeBom) return `bom:${routeBom.id}`;
    if (route?.bomListId) return `bom:${route.bomListId}`;
    const routeSpecification = getRouteSpecification(route);
    if (routeSpecification) return `spec:${routeSpecification.id}`;
    if (route?.specificationId) return normalizeRouteBindingValue(route.specificationId) || `spec:${route.specificationId}`;
    if (route?.projectId) return normalizeRouteBindingValue(route.projectId) || `spec:${route.projectId}`;
    if (fallbackSpecification) return `spec:${fallbackSpecification.id}`;
    return "";
  }
  
  function getRouteModuleSelectionName(route, fallbackSpecification = null) {
    const bom = getRouteBomList(route);
    if (bom) return bom.name || "Плата без названия";
    const specification = getRouteSpecification(route) || fallbackSpecification;
    if (specification) return specification.name || "Состав изделия без названия";
    return getProjectDisplayName(getRouteProductionContext(route)) || "";
  }
  
  function getRouteDocumentKind(route = null) {
    const rawKind = String(route?.routeDocumentKind || route?.documentKind || "").trim();
    if (ROUTE_DOCUMENT_KIND_LABELS[rawKind]) return rawKind;
    if (route?.shiftParentRouteId || route?.shiftDate || route?.shiftRouteId) return "shift";
    if (route?.parentRouteId || route?.routeTaskId || route?.routeTaskSourceItemId) return "child";
    return "main";
  }
  
  function getRouteDocumentKindLabel(route = null) {
    return ROUTE_DOCUMENT_KIND_LABELS[getRouteDocumentKind(route)] || ROUTE_DOCUMENT_KIND_LABELS.main;
  }
  
  function getRouteDocumentKindShortLabel(route = null) {
    return ROUTE_DOCUMENT_KIND_SHORT_LABELS[getRouteDocumentKind(route)] || ROUTE_DOCUMENT_KIND_SHORT_LABELS.main;
  }
  
  function getRouteRootRoute(route = null) {
    if (!route) return null;
    const kind = getRouteDocumentKind(route);
    const rootRouteId = route.rootRouteId || (kind === "main" ? route.id : "");
    return (planningState.routes || []).find((item) => item.id === rootRouteId)
      || (kind === "main" ? route : null);
  }
  
  function getRouteParentRoute(route = null) {
    if (!route) return null;
    return (planningState.routes || []).find((item) => item.id === route.parentRouteId)
      || getRouteRootRoute(route)
      || null;
  }
  
  function getRouteSortRootId(route = null) {
    const kind = getRouteDocumentKind(route);
    return route?.rootRouteId || (kind === "main" ? route?.id : route?.parentRouteId) || route?.id || "";
  }
  
  function getRouteScopeSourceItemId(route = null) {
    return String(route?.routeTaskSourceItemId || route?.routeScopeSourceItemId || route?.specTaskSourceItemId || "").trim();
  }
  
  function getRouteScopeRootTask(route = null, tasks = getRouteUnscopedBaseTasks(route)) {
    const routeTaskId = String(route?.routeTaskId || "").trim();
    const sourceItemId = getRouteScopeSourceItemId(route);
    const sourceSpecificationId = String(route?.routeTaskSourceSpecificationId || "").trim();
    if (routeTaskId) {
      const task = tasks.find((item) => item.id === routeTaskId);
      if (task) return task;
    }
    if (!sourceItemId) return null;
    return tasks.find((item) => (
      item.sourceItemId === sourceItemId
      && (!sourceSpecificationId || item.sourceSpecificationId === sourceSpecificationId)
    )) || null;
  }
  
  function scopeRouteTasks(route = null, tasks = []) {
    const scopeRootTask = getRouteScopeRootTask(route, tasks);
    if (!scopeRootTask) return tasks;
    return [{
      ...scopeRootTask,
      level: 0,
      continuationLevels: [],
      routeScopeRoot: true,
      hasChildren: false,
      isLast: true,
      parentTitle: "",
    }];
  }
  
  function getRouteLineageSubjectName(route = null) {
    const taskName = String(route?.routeTaskName || "").trim();
    if (taskName) return taskName;
    const task = getRouteScopeRootTask(route);
    if (task?.title) return task.title;
    return getRouteModuleSelectionName(route) || "Объект не выбран";
  }
  
  function getRoutesForModule() {
    return [...(planningState.routes || [])].sort((left, right) => {
      const leftRoot = (planningState.routes || []).find((route) => route.id === getRouteSortRootId(left)) || left;
      const rightRoot = (planningState.routes || []).find((route) => route.id === getRouteSortRootId(right)) || right;
      const leftProject = getProjectDisplayName(getRouteProductionContext(leftRoot)) || getRouteModuleSelectionName(leftRoot) || "";
      const rightProject = getProjectDisplayName(getRouteProductionContext(rightRoot)) || getRouteModuleSelectionName(rightRoot) || "";
      const leftKind = getRouteDocumentKind(left);
      const rightKind = getRouteDocumentKind(right);
      return leftProject.localeCompare(rightProject, "ru")
        || String(leftRoot.name || "").localeCompare(String(rightRoot.name || ""), "ru")
        || (ROUTE_DOCUMENT_KIND_ORDER[leftKind] ?? 9) - (ROUTE_DOCUMENT_KIND_ORDER[rightKind] ?? 9)
        || String(left.routeTaskNumber || "").localeCompare(String(right.routeTaskNumber || ""), "ru", { numeric: true })
        || String(left.name || "").localeCompare(String(right.name || ""), "ru");
    });
  }
  
  
  return {
    addNomenclatureToBom,
    applyGanttRowToSlot,
    bindProductsEvents,
    cancelAuthPrototypePinFeedback,
    checkSpekiStructureReferences,
    clearSpekiStaleItem,
    completeAuthPrototypeLogin,
    createSpekiSpecification,
    deleteBomImportRow,
    ensureNomenclatureTypeExists,
    ensureRouteModuleProjectForSpecification,
    findSmtLineByNumber,
    getActiveSpecificationForModule,
    getAuthPrototypeAttemptsLeft,
    getAuthPrototypeDepartmentRows,
    getAuthPrototypeDirectDepartmentPeople,
    getAuthPrototypePeople,
    getAuthPrototypePeopleByUnit,
    getAuthPrototypePinFeedbackTone,
    getAuthPrototypePinPerson,
    getAuthPrototypeSelectedDepartment,
    getAuthPrototypeSelectedPerson,
    getAuthPrototypeSelectedUnit,
    getAuthPrototypeUnitRows,
    getBomImportRowNomenclatureItem,
    getBomImportRows,
    getBomLinkedSpecifications,
    getBomList,
    getBomResultNomenclatureItem,
    getDefaultSmtLineConfigurations,
    getDirectoryRows,
    getFallbackNomenclatureType,
    getGanttResourceForSlot,
    getNomenclatureDeleteUsage,
    getNomenclatureItem,
    getResourceBaseCph,
    getResourceRowId,
    getResourcesForWorkCenter,
    getRouteBindingContext,
    getRouteBindingModeForSelection,
    getRouteBindingOptions,
    getRouteBomList,
    getRouteDocumentKind,
    getRouteDocumentKindLabel,
    getRouteDocumentKindShortLabel,
    getRouteLineageSubjectName,
    getRouteModuleSelectionName,
    getRouteModuleSelectionValue,
    getRouteParentRoute,
    getRouteRootRoute,
    getRouteScopeRootTask,
    getRouteSpecification,
    getRoutesForModule,
    getSlotGanttResourceId,
    getSlotGanttWorkCenterId,
    getSmtLineConfigurations,
    getSmtLineIdFromWorkCenterId,
    getSmtLineNumberFromText,
    getSpecificationBomEntries,
    getSpecificationById,
    getSpecificationItemBomId,
    getSpecificationProductionOrder,
    getSpekiStructureItemDisplayName,
    getSpekiStructureItemLabel,
    getSpekiStructureSectionOptions,
    getSpekiStructureTableRows,
    inferAccessRoleIdForPerson,
    importBomFromXlsxFile,
    isAuthPrototypePinFeedbackLocked,
    isSmtLineWorkCenterId,
    migrateSpecificationBomRowsToNomenclature,
    normalizeBomImportRow,
    normalizeLookupText,
    normalizeSmtComponentKeyPart,
    normalizeNomenclatureType,
    normalizeRouteBindingValue,
    renderModulePreviewEmpty,
    renderNomenclaturePage,
    renderProductsPage,
    resetAuthPrototypeAttempts,
    resolveRouteModuleProjectId,
    scheduleAuthPrototypePinValidation,
    scopeRouteTasks,
    summarizeBomComponentFields,
    syncNomenclatureTypeRename,
    syncNomenclatureTypesFromItems,
    syncSpecificationDerivedFields,
    toggleSpekiBomCollapse,
    updateBomImportCell,
    upsertBomResultToNomenclature,
  };
}
