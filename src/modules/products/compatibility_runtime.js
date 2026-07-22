import { formatDecimalNumber } from "../../ui/formatters.ts";

export function createProductsCompatibilityRuntime(dependencies = {}) {
  const {
    BOARD_SPEC_TERM,
    BOM_COMPONENT_FIELDS,
    BOM_IMPORT_COLUMN_COUNT,
    BOM_IMPORT_FALLBACK_HEADERS,
    DEFAULT_COMPONENT_TYPES,
    DEFAULT_NOMENCLATURE_TYPES,
    DEFAULT_RESOURCE_CPH,
    MES_SMT_WORK_CENTER_IDS,
    NOMENCLATURE_REA_COMPONENT_TYPE,
    PRODUCT_COMPOSITION_TERM,
    ROUTE_DOCUMENT_KIND_LABELS,
    ROUTE_DOCUMENT_KIND_ORDER,
    ROUTE_DOCUMENT_KIND_SHORT_LABELS,
    addMs,
    getAuthPrototypePinFeedbackSequence = () => 0,
    getAuthPrototypePinFeedbackTimer = () => null,
    getComponentTypes,
    getProductionResource,
    getProductionResourceWorkCenterId,
    getProductionResourcesForWorkCenter,
    getProductionStructureEmployees,
    getProductionStructureMatrixRuntimeOverrides,
    getProductionStructureWorkCenters,
    getProject,
    getProjectDisplayName,
    getRouteProductionContext,
    getRouteStepSelectedPlanningWorkCenterId,
    getRouteUnscopedBaseTasks,
    getSlotPlanningOrderId,
    getSlotProductionContextId,
    getSlotRouteId,
    getSpecificationByProjectId,
    getSpecificationItemBoardsPerPanel,
    getSpecificationStructureItems,
    getWorkCenter,
    isLegacyDirectoryWriteBlocked = () => false,
    loadBoardsXlsxImportAction = () => import("./boards_xlsx_import_action.js"),
    makeFallbackProductionResource,
    makeId,
    mapLegacyWorkCenterId,
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
    resolveProductionResourceType,
    resourceParticipatesInCalculation,
    resourceParticipatesInPlanning,
    setAuthPrototypePinFeedbackSequence = () => {},
    setAuthPrototypePinFeedbackTimer = () => {},
    toDateInput,
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

  function mergeBomSourceIds(existing, incoming) {
    return [...new Set([
      ...(Array.isArray(existing?.sourceBomIds) ? existing.sourceBomIds : []),
      ...(Array.isArray(incoming?.sourceBomIds) ? incoming.sourceBomIds : []),
    ].filter(Boolean))];
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
    // This bootstrap helper used to backfill the monolithic Directory blob.
    // Once Nomenclature has a command owner, even a harmless-looking type
    // backfill would be an unowned generic Directory write.
    if (options.persist && isLegacyDirectoryWriteBlocked()) return false;
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
  
  function getFallbackNomenclatureType(excludedName = "") {
    const excluded = normalizeLookupText(excludedName);
    return getNomenclatureTypeRows()
      .map((row) => row.name)
      .find((name) => normalizeLookupText(name) !== excluded) || "";
  }
  
  function migrateSpecificationBomRowsToNomenclature() {
    if (isLegacyDirectoryWriteBlocked()) return;
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
    if (isLegacyDirectoryWriteBlocked()) {
      throw new Error("BOM доступен только для чтения: серверная команда импорта ещё не подключена.");
    }
    const { importLegacyBoardsXlsxFile } = await loadBoardsXlsxImportAction();
    return importLegacyBoardsXlsxFile(file, productionId, {
      BOARD_SPEC_TERM,
      BOM_IMPORT_COLUMN_COUNT,
      BOM_IMPORT_FALLBACK_HEADERS,
      directoryState,
      getDirectoryState: dependencies.getDirectoryState,
      makeId,
      normalizeBomImportRow,
      normalizeDirectoryRow,
      normalizeDirectoryState,
      notifySaveSuccess,
      persistDirectoryState,
      persistUiState,
      summarizeBomComponentFields,
      ui,
      upsertBomImportRowsToNomenclature,
      upsertBomResultToNomenclature,
    });
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
  
  function getActiveSpecificationForModule() {
    if (ui.activeSpecificationId === "__new__") return null;
    if (!ui.activeSpecificationId) return null;
    return (directoryState.specifications || []).find((specification) => specification.id === ui.activeSpecificationId)
      || null;
  }
  
  function getSpecificationProductionName(specification) {
    return specification?.outputItem || specification?.name || PRODUCT_COMPOSITION_TERM;
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
  
  function cancelAuthPrototypePinFeedback() {
    const nextSequence = Number(getAuthPrototypePinFeedbackSequence()) + 1;
    setAuthPrototypePinFeedbackSequence(Number.isFinite(nextSequence) ? nextSequence : 1);
    const feedbackTimer = getAuthPrototypePinFeedbackTimer();
    if (feedbackTimer) {
      clearTimeout(feedbackTimer);
      setAuthPrototypePinFeedbackTimer(null);
    }
  }
  
  function isAuthPrototypePinFeedbackLocked(result = ui.authPrototypeResult) {
    return ["pin-checking", "pin-ok"].includes(String(result || ""));
  }
  
  function getAuthPrototypePinPerson(people = getAuthPrototypePeople()) {
    return getAuthPrototypeSelectedPerson(people)
      || people.executors.find((person) => person.id === ui.authPrototypePersonId)
      || people.executors[0]
      || null;
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
    if (isLegacyDirectoryWriteBlocked()) {
      alert("Составы изделий доступны только для чтения: серверная команда этого раздела ещё не подключена.");
      return false;
    }
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
    if (persistDirectoryState() === false) return false;
    persistUiState();
    notifySaveSuccess("Изделие создано");
    render();
    return true;
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
  
  function getRouteBindingModeForSelection(value = "", route = null) {
    const binding = getRouteBindingContext(value);
    if (binding.kind === "bom" || binding.bom || route?.bomListId) return "bom";
    return "product";
  }
  
  function ensureRouteModuleProjectForSpecification(specification) {
    if (!specification) return "";
    if (isLegacyDirectoryWriteBlocked()) {
      alert("Связь маршрута с составом изделия доступна только для чтения: серверная команда ещё не подключена.");
      return "";
    }
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
    if (persistDirectoryState() === false) return "";
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
    cancelAuthPrototypePinFeedback,
    createSpekiSpecification,
    ensureNomenclatureTypeExists,
    getActiveSpecificationForModule,
    getAuthPrototypePeople,
    getBomImportRows,
    getBomList,
    getBomResultNomenclatureItem,
    getDefaultSmtLineConfigurations,
    getDirectoryRows,
    getFallbackNomenclatureType,
    getNomenclatureDeleteUsage,
    getNomenclatureItem,
    getResourceBaseCph,
    getResourcesForWorkCenter,
    getRouteBindingContext,
    getRouteBindingModeForSelection,
    getRouteBomList,
    getRouteDocumentKind,
    getRouteDocumentKindLabel,
    getRouteDocumentKindShortLabel,
    getRouteLineageSubjectName,
    getRouteModuleSelectionName,
    getRouteModuleSelectionValue,
    getRouteRootRoute,
    getRouteScopeRootTask,
    getRouteSpecification,
    getRoutesForModule,
    getSlotGanttResourceId,
    getSlotGanttWorkCenterId,
    getSmtLineConfigurations,
    getSmtLineNumberFromText,
    getSpecificationBomEntries,
    getSpecificationById,
    getSpecificationItemBomId,
    getSpekiStructureItemDisplayName,
    getSpekiStructureItemLabel,
    getSpekiStructureTableRows,
    importBomFromXlsxFile,
    isAuthPrototypePinFeedbackLocked,
    migrateSpecificationBomRowsToNomenclature,
    normalizeBomImportRow,
    normalizeLookupText,
    normalizeNomenclatureType,
    normalizeRouteBindingValue,
    resolveRouteModuleProjectId,
    syncNomenclatureTypesFromItems,
    syncSpecificationDerivedFields,
    upsertBomResultToNomenclature,
  };
}
