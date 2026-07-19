const clean = (value) => String(value ?? "").trim();
const LATEST_RELEASE_FINGERPRINT_ADAPTER_VERSION = 5;

function releaseFingerprintAdapterVersion(entry = {}) {
  try {
    const version = Number(JSON.parse(clean(entry?.publication?.fingerprint) || "{}").adapterVersion);
    return Number.isInteger(version) && version >= 4 && version <= LATEST_RELEASE_FINGERPRINT_ADAPTER_VERSION
      ? version
      : LATEST_RELEASE_FINGERPRINT_ADAPTER_VERSION;
  } catch {
    return LATEST_RELEASE_FINGERPRINT_ADAPTER_VERSION;
  }
}

function productionFilesForReleaseFingerprint(value = {}, adapterVersion) {
  if (adapterVersion < 5) return value || {};
  return Object.fromEntries(Object.entries(value || {}).flatMap(([kind, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    // Storage keys, remote ids and inline bytes are transport details.  A
    // released route is identified by its declared production file, not by a
    // browser-specific IndexedDB key or a base64 copy of that file.
    return [[kind, {
      name: clean(raw.name),
      size: Math.max(0, Number(raw.size) || 0),
      type: clean(raw.type),
    }]];
  }));
}

function makeId(prefix, seed = "") {
  let hash = 2166136261;
  for (const character of clean(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function getRows(entry = {}) {
  if (!Array.isArray(entry.editorRows) || !entry.editorRows.length) {
    return Array.isArray(entry.treeRows) ? entry.treeRows : [];
  }
  const byId = new Map(entry.editorRows.map((row) => [clean(row.id || row.selectionKey || row.nodeKey), row]));
  const depthById = new Map();
  const depthOf = (row, path = new Set()) => {
    const id = clean(row.id || row.selectionKey || row.nodeKey);
    if (depthById.has(id)) return depthById.get(id);
    const parentId = clean(row.parentId || row.parentKey);
    if (!parentId || !byId.has(parentId) || parentId === id || path.has(id)) return 0;
    const depth = depthOf(byId.get(parentId), new Set([...path, id])) + 1;
    depthById.set(id, depth);
    return depth;
  };
  return entry.editorRows.map((row) => ({
    ...row,
    parentKey: clean(row.parentKey || row.parentId),
    level: depthOf(row),
  }));
}

function getRootRow(entry = {}) {
  return getRows(entry).find((row) => Number(row.level || 0) === 0) || getRows(entry)[0] || null;
}

function getDesignation(row = {}) {
  return clean(row.designation) || clean(row.label).match(/[А-ЯA-Z]{2,}[А-ЯA-Z0-9.-]*\.\d{3,}(?:\.\d+)?/u)?.[0] || "";
}

function displayName(row = {}) {
  const designation = getDesignation(row);
  const label = clean(row.label);
  return designation && label.startsWith(designation) ? clean(label.slice(designation.length)) || designation : label || designation;
}

export function buildSpecifications2ReleaseFingerprint(entry = {}, {
  adapterVersion = releaseFingerprintAdapterVersion(entry),
} = {}) {
  return JSON.stringify({
    adapterVersion,
    rows: getRows(entry).map((row) => ({
      id: clean(row.id || row.selectionKey || row.nodeKey),
      parentId: clean(row.parentId || row.parentKey),
      level: Number(row.level || 0),
      label: clean(row.label),
      designation: getDesignation(row),
      type: clean(row.type),
      quantity: Number(row.quantity || 0),
      unit: clean(row.unitOfMeasure || row.unit),
    })),
    routes: (Array.isArray(entry.routeDrafts) ? entry.routeDrafts : []).map((draft) => ({
      productKey: clean(draft.productKey),
      designation: clean(draft.designation),
      operations: (Array.isArray(draft.operations) ? draft.operations : []).map((operation) => ({
        operationId: clean(operation.operationId),
        workCenterId: clean(operation.workCenterId),
        nextWorkCenterId: clean(operation.nextWorkCenterId),
        changesProperty: operation.changesProperty !== false,
        inputState: clean(operation.inputState),
        outputState: clean(operation.outputState),
        laborNorm: operation.laborNorm || {},
        productionFiles: productionFilesForReleaseFingerprint(operation.productionFiles, adapterVersion),
      })),
    })),
  });
}

export function inspectSpecifications2Publication(entry = {}) {
  const rows = getRows(entry);
  const roots = rows.filter((row) => Number(row.level || 0) === 0);
  const drafts = Array.isArray(entry.routeDrafts) ? entry.routeDrafts : [];
  const issues = [];
  if (!rows.length) issues.push("Структура спецификации пуста");
  if (roots.length !== 1) issues.push("Должно быть ровно одно результирующее изделие");
  if (rows.some((row) => row.status === "error")) issues.push("В структуре есть ошибки связей");
  if (!drafts.length) issues.push("Не создана ни одна маршрутная карта");
  const routeDesignations = new Set(drafts.map((draft) => clean(draft.designation).toLowerCase()).filter(Boolean));
  const manufacturedDesignations = [...new Set(rows.map(getDesignation).map((value) => value.toLowerCase()).filter(Boolean))];
  manufacturedDesignations.forEach((designation) => {
    if (!routeDesignations.has(designation)) issues.push(`Для ${designation.toUpperCase()} не создана маршрутная карта`);
  });
  drafts.forEach((draft) => {
    const label = clean(draft.productLabel || draft.designation) || "Изделие";
    if (!Array.isArray(draft.operations) || !draft.operations.length) issues.push(`${label}: маршрут не содержит операций`);
    (draft.operations || []).forEach((operation) => {
      if (!clean(operation.operationId) || !clean(operation.workCenterId)) issues.push(`${label}: операция заполнена не полностью`);
      const norm = operation.laborNorm || {};
      const hasNorm = norm.calculationMode === "fixed" ? Number(norm.fixedMinutes) > 0 : Number(norm.unitsPerHour) > 0;
      if (!hasNorm) issues.push(`${label}: для операции «${clean(operation.name) || "Без названия"}» не задана норма`);
    });
  });
  return { ready: issues.length === 0, issues: [...new Set(issues)], rows, roots, drafts };
}

function toLaborSetting(norm = {}) {
  if (norm.calculationMode === "fixed") return { mode: "fixed", fixedMinutes: Number(norm.fixedMinutes) || 0 };
  const unitsPerHour = Number(norm.unitsPerHour) || 0;
  return { mode: "unit", minutesPerUnit: unitsPerHour > 0 ? 60 / unitsPerHour : 0 };
}

export function publishSpecifications2Entry(entry = {}, context = {}) {
  const inspection = inspectSpecifications2Publication(entry);
  if (!inspection.ready) throw new Error(inspection.issues[0] || "Спецификация не готова к публикации");

  const now = clean(context.now) || new Date().toISOString();
  // A server-first publication prepares its immutable revision before the
  // compatibility projection is written locally.  In that case the local
  // mirror must use exactly the revision that PostgreSQL acknowledged, rather
  // than incrementing it a second time.
  const acknowledgedPublication = context.acknowledgedPublication && typeof context.acknowledgedPublication === "object"
    ? context.acknowledgedPublication
    : null;
  const currentFingerprint = buildSpecifications2ReleaseFingerprint(entry, { adapterVersion: LATEST_RELEASE_FINGERPRINT_ADAPTER_VERSION });
  if (acknowledgedPublication?.fingerprint && acknowledgedPublication.fingerprint !== currentFingerprint) {
    throw new Error("Нельзя создать локальную проекцию для изменённой после серверной публикации спецификации");
  }
  const revision = acknowledgedPublication
    ? Math.max(1, Number(acknowledgedPublication.revision || 0))
    : Math.max(1, Number(entry.publication?.revision || 0) + 1);
  const releaseKey = `${entry.id || entry.title || "specification"}:r${revision}`;
  const specificationId = makeId("spec2rel", releaseKey);
  const directoryState = context.directoryState || {};
  const planningState = context.planningState || {};
  const rows = inspection.rows;
  const root = inspection.roots[0];
  const rootDesignation = getDesignation(root);
  const rowId = (row) => clean(row.id || row.selectionKey || row.nodeKey);
  const sourceRowsById = new Map();
  const nodeIdBySourceId = new Map();
  rows.forEach((row) => {
    const canonicalId = rowId(row);
    const publishedNodeId = makeId("spec2item", `${releaseKey}:${canonicalId}`);
    [canonicalId, row.id, row.selectionKey, row.nodeKey].map(clean).filter(Boolean).forEach((alias) => {
      sourceRowsById.set(alias, row);
      nodeIdBySourceId.set(alias, publishedNodeId);
    });
  });
  const existingNomenclature = Array.isArray(directoryState.nomenclature) ? directoryState.nomenclature : [];
  const newNomenclature = [];
  const nomenclatureIdByDesignation = new Map();

  rows.forEach((row) => {
    const designation = getDesignation(row);
    if (!designation) return;
    const existing = [...existingNomenclature, ...newNomenclature].find((item) => clean(item.article).toLowerCase() === designation.toLowerCase());
    const id = existing?.id || makeId("nom2", designation.toLowerCase());
    nomenclatureIdByDesignation.set(designation.toLowerCase(), id);
    if (!existing) newNomenclature.push({
      id,
      name: displayName(row),
      article: designation,
      type: clean(row.type) || "Изделия",
      unit: clean(row.unitOfMeasure || row.unit) || "шт.",
      status: "Активен",
      description: `Опубликовано из Спецификации 2.0, ревизия ${revision}`,
      sourceSpecifications2EntryId: clean(entry.id),
      createdAt: now,
      updatedAt: now,
    });
  });

  const structureItems = rows.filter((row) => row !== root).map((row, index) => {
    const sourceId = rowId(row);
    const rawParentId = clean(row.parentId || row.parentKey);
    const parentRow = sourceRowsById.get(rawParentId);
    const parentId = !parentRow || parentRow === root ? "root" : nodeIdBySourceId.get(rowId(parentRow)) || "root";
    const designation = getDesignation(row);
    const nomenclatureId = nomenclatureIdByDesignation.get(designation.toLowerCase()) || "";
    return {
      id: nodeIdBySourceId.get(sourceId),
      parentId,
      type: nomenclatureId ? "nomenclature" : "assembly",
      executionType: designation ? "make" : "buy",
      fulfillmentMode: designation ? "produce" : "purchase",
      operationId: "",
      operationName: "",
      departmentName: "",
      bomListId: "",
      specificationId: "",
      nomenclatureId,
      nomenclatureType: clean(row.type),
      name: displayName(row),
      quantity: Math.max(0, Number(row.quantity || 1)),
      unit: clean(row.unitOfMeasure || row.unit) || "шт.",
      boardsPerPanel: 1,
      resultItem: displayName(row),
      note: `Спецификация 2.0 · ревизия ${revision}`,
      position: index + 1,
      sourceSpecifications2RowId: sourceId,
    };
  });

  const specification = {
    id: specificationId,
    name: clean(entry.title) || displayName(root),
    outputItem: displayName(root),
    outputNomenclatureId: nomenclatureIdByDesignation.get(rootDesignation.toLowerCase()) || "",
    productionQuantity: 1,
    bomListA: "",
    bomQtyA: 0,
    bomListB: "",
    bomQtyB: 0,
    extraItems: "",
    structureManaged: true,
    structureItems,
    lifecycleStatus: "released",
    revision,
    sourceSpecifications2EntryId: clean(entry.id),
    sourceSpecifications2Fingerprint: buildSpecifications2ReleaseFingerprint(entry, { adapterVersion: LATEST_RELEASE_FINGERPRINT_ADAPTER_VERSION }),
    releasedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const drafts = inspection.drafts;
  const mainDraft = drafts.find((draft) => clean(draft.designation).toLowerCase() === rootDesignation.toLowerCase()) || drafts[0];
  const mainRouteId = makeId("r2", `${releaseKey}:${mainDraft.id}`);
  const rootTaskId = `spec-root:${specificationId}`;
  const taskBindingsByDraftId = new Map(drafts.map((draft) => {
    if (draft === mainDraft) return [draft.id, [{ taskId: rootTaskId, sourceItemId: "root" }]];
    const sourceKey = clean(draft.productKey);
    const designation = clean(draft.designation).toLowerCase();
    const matchingRows = rows.filter((row) => row !== root && designation && getDesignation(row).toLowerCase() === designation);
    const sourceRows = matchingRows.length ? matchingRows : [sourceRowsById.get(sourceKey)].filter(Boolean);
    const bindings = sourceRows.map((sourceRow) => {
      const sourceId = rowId(sourceRow);
      const publishedNodeId = nodeIdBySourceId.get(sourceId) || "";
      return {
        taskId: publishedNodeId ? `spec-item:${publishedNodeId}` : `spec2:${sourceKey}`,
        sourceItemId: publishedNodeId || sourceKey,
      };
    });
    return [draft.id, bindings.length ? bindings : [{ taskId: `spec2:${sourceKey}`, sourceItemId: sourceKey }]];
  }));

  const buildRouteSteps = (draft, routeId, includeAllBindings = false) => {
    const availableBindings = taskBindingsByDraftId.get(draft.id) || [{ taskId: rootTaskId, sourceItemId: "root" }];
    const bindings = includeAllBindings ? availableBindings : availableBindings.slice(0, 1);
    return bindings.flatMap((binding) => (draft.operations || []).map((operation, index) => ({
      id: makeId("rs2", `${routeId}:${draft.id}:${binding.taskId}:${operation.id || index}`),
      routeId,
      specTaskId: binding.taskId,
      specTaskSourceItemId: binding.sourceItemId,
      specTaskName: clean(draft.productLabel || draft.designation),
      specTaskQuantity: 1,
      operationId: clean(operation.operationId),
      workCenterId: clean(operation.workCenterId),
      planningWorkCenterId: /^D3_L[12]_OP$/i.test(clean(operation.operationId)) && clean(operation.workCenterId) === "D3"
        ? "D3_L1"
        : clean(operation.workCenterId),
      operationName: clean(operation.name),
      stepOrder: index + 1,
      isRequired: true,
      quantityMultiplier: 1,
      calculationType: operation.laborNorm?.calculationMode === "fixed" ? "manual" : "normative",
      setupMin: Number(operation.laborNorm?.setupMinutes) || 0,
      unitsPerHour: Number(operation.laborNorm?.unitsPerHour) || 0,
      fulfillmentMode: "produce",
      operationInputs: operation.inputState ? [{ label: clean(operation.inputState) }] : [],
      operationOutputs: operation.outputState ? [{ label: clean(operation.outputState) }] : [],
      nextWorkCenterId: clean(operation.nextWorkCenterId),
      nextOperationId: clean(operation.nextOperationId),
      instructionRequired: operation.instructionRequired === true,
      sourceSpecifications2OperationId: clean(operation.id),
      normRevisionId: clean(operation.laborNorm?.activeRevisionId),
      updatedAt: now,
    })));
  };

  const routeEntries = drafts.map((draft) => {
    const routeId = makeId("r2", `${releaseKey}:${draft.id}`);
    const isMain = draft === mainDraft;
    const ownRouteSteps = buildRouteSteps(draft, routeId);
    const routeSteps = isMain
      ? drafts.flatMap((sourceDraft) => buildRouteSteps(sourceDraft, routeId, true))
      : ownRouteSteps;
    const planningLaborByStepId = Object.fromEntries(routeSteps.map((step, index) => [step.id, toLaborSetting(draft.operations[index]?.laborNorm)]));
    if (isMain) {
      routeSteps.forEach((step) => {
        const sourceDraft = drafts.find((candidate) => clean(candidate.productKey) === clean(step.specTaskSourceItemId)
          || taskBindingsByDraftId.get(candidate.id)?.some((binding) => binding.taskId === step.specTaskId));
        const operation = sourceDraft?.operations?.find((candidate) => clean(candidate.id) === clean(step.sourceSpecifications2OperationId));
        planningLaborByStepId[step.id] = toLaborSetting(operation?.laborNorm);
      });
    }
    const documentRevisionSnapshot = {
      source: "specifications2",
      specificationEntryId: clean(entry.id),
      specificationId,
      specificationRevision: revision,
      routeDraftId: clean(draft.id),
      routeRevision: revision,
      releaseFingerprint: specification.sourceSpecifications2Fingerprint,
      releasedAt: now,
      product: {
        designation: clean(draft.designation),
        name: clean(draft.productLabel || draft.designation),
      },
      operations: routeSteps.map((step) => ({
        routeStepId: step.id,
        operationId: step.operationId,
        operationName: step.operationName,
        workCenterId: step.workCenterId,
        nextWorkCenterId: step.nextWorkCenterId,
        nextOperationId: step.nextOperationId,
        normRevisionId: step.normRevisionId,
        labor: { ...(planningLaborByStepId[step.id] || {}) },
        inputState: clean(step.operationInputs?.[0]?.label),
        outputState: clean(step.operationOutputs?.[0]?.label),
        instructionRequired: step.instructionRequired === true,
      })),
    };
    return {
      route: {
        id: routeId,
        specificationId,
        specificationName: specification.name,
        projectId: specificationId,
        name: `${isMain ? "Маршрутная карта" : "Локальная маршрутная карта"} · ${clean(draft.productLabel || draft.designation)}`,
        isDefault: isMain,
        routeDocumentKind: isMain ? "main" : "child",
        rootRouteId: mainRouteId,
        parentRouteId: isMain ? "" : mainRouteId,
        planningQuantity: 1,
        planningStatus: "queued",
        lifecycleStatus: "released",
        revision,
        sourceSpecifications2EntryId: clean(entry.id),
        sourceSpecifications2RouteDraftId: clean(draft.id),
        routeTaskId: isMain ? "" : taskBindingsByDraftId.get(draft.id)?.[0]?.taskId || "",
        routeTaskSourceItemId: isMain ? "" : taskBindingsByDraftId.get(draft.id)?.[0]?.sourceItemId || "",
        routeTaskName: isMain ? "" : clean(draft.productLabel || draft.designation),
        planningLaborByStepId,
        documentRevisionSnapshot,
        createdAt: now,
        updatedAt: now,
      },
      routeSteps,
    };
  });

  // Specifications 2.0 remains the source of local route documents. The
  // planning contour receives one aggregate route for one work order; copying
  // every local card into planning multiplies the same operations and quickly
  // exhausts browser storage.
  const routes = routeEntries.filter((item) => item.route.id === mainRouteId);
  const existingRoutes = Array.isArray(planningState.routes) ? planningState.routes : [];
  const existingSteps = Array.isArray(planningState.routeSteps) ? planningState.routeSteps : [];
  const referencedHistoricalRouteIds = new Set((planningState.slots || []).flatMap((slot) => [
    clean(slot.routeId),
    clean(slot.planningOrderId),
  ]).filter(Boolean));
  const retainedRoutes = existingRoutes.filter((route) => (
    clean(route.sourceSpecifications2EntryId) !== clean(entry.id)
    || referencedHistoricalRouteIds.has(clean(route.id))
  ));
  const retainedRouteIds = new Set(retainedRoutes.map((route) => clean(route.id)));
  const retainedSteps = existingSteps.filter((step) => retainedRouteIds.has(clean(step.routeId)));
  const retainedSpecificationIds = new Set(retainedRoutes.map((route) => clean(route.specificationId)).filter(Boolean));
  const existingSpecifications = Array.isArray(directoryState.specifications) ? directoryState.specifications : [];
  const retainedSpecifications = existingSpecifications.filter((item) => (
    clean(item.sourceSpecifications2EntryId) !== clean(entry.id)
    || retainedSpecificationIds.has(clean(item.id))
  ));

  return {
    directoryState: {
      ...directoryState,
      nomenclature: [...existingNomenclature, ...newNomenclature],
      specifications: [...retainedSpecifications, specification],
    },
    planningState: {
      ...planningState,
      routes: [...retainedRoutes, ...routes.map((item) => item.route)],
      routeSteps: [...retainedSteps, ...routes.flatMap((item) => item.routeSteps)],
    },
    publication: {
      revision,
      specificationId,
      rootRouteId: mainRouteId,
      routeIds: routes.map((item) => item.route.id),
      fingerprint: acknowledgedPublication?.fingerprint || currentFingerprint,
      releasedAt: clean(acknowledgedPublication?.releasedAt) || now,
      status: "released",
    },
  };
}
