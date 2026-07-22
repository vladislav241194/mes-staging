import { normalizeSpecifications2ProductionFiles } from "./production_file_contract.js";

export function normalizeSpecifications2ChangesProperty(value) {
  return value !== false && value !== "unchanged";
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shiftSpecifications2IsoDate(value, days = 0) {
  const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function normalizeSpecifications2RouteDrafts(drafts = []) {
  return (Array.isArray(drafts) ? drafts : []).filter(Boolean).map((draft, draftIndex) => ({
    id: cleanText(draft.id) || `route-draft-${draftIndex + 1}`,
    productKey: cleanText(draft.productKey),
    productLabel: cleanText(draft.productLabel),
    designation: cleanText(draft.designation),
    status: draft.status === "ready-for-norming" ? "ready-for-norming" : "draft",
    createdAt: cleanText(draft.createdAt),
    updatedAt: cleanText(draft.updatedAt),
    operations: (Array.isArray(draft.operations) ? draft.operations : []).filter(Boolean).map((operation, operationIndex) => ({
      id: cleanText(operation.id) || `operation-${operationIndex + 1}`,
      order: Number.isFinite(Number(operation.order)) ? Number(operation.order) : operationIndex,
      operationId: cleanText(operation.operationId),
      name: cleanText(operation.name),
      workCenterId: cleanText(operation.workCenterId),
      workCenter: cleanText(operation.workCenter),
      nextWorkCenterId: cleanText(operation.nextWorkCenterId),
      nextWorkCenter: cleanText(operation.nextWorkCenter),
      nextOperationId: cleanText(operation.nextOperationId),
      nextOperation: cleanText(operation.nextOperation),
      instructionRequired: operation.instructionRequired === true,
      changesProperty: normalizeSpecifications2ChangesProperty(operation.changesProperty),
      inputState: cleanText(operation.inputState),
      outputState: cleanText(operation.outputState),
      comment: cleanText(operation.comment),
      productionFiles: normalizeSpecifications2ProductionFiles(operation.productionFiles),
      laborNorm: normalizeSpecifications2LaborNorm(operation.laborNorm),
    })).sort((left, right) => left.order - right.order).map((operation, index) => ({ ...operation, order: index })),
  }));
}

export function createSpecifications2RouteDraft(item, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    id: cleanText(options.id) || `route-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    productKey: cleanText(item?.key),
    productLabel: cleanText(item?.label),
    designation: cleanText(item?.designation),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    operations: [],
  };
}

export function applySpecifications2RouteDraftAction(sourceDraft, action = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft) return null;
  const operations = draft.operations.map((operation) => ({ ...operation }));
  const index = operations.findIndex((operation) => operation.id === action.operationId);
  const now = action.now || new Date().toISOString();
  if (action.type === "add") {
    const value = sanitizeSpecifications2RouteOperation(action.value);
    operations.push({
      id: cleanText(action.newId) || `operation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      order: operations.length,
      ...value,
    });
  }
  if (action.type === "update" && index >= 0) {
    operations[index] = { ...operations[index], ...sanitizeSpecifications2RouteOperation(action.value) };
  }
  if (action.type === "remove" && index >= 0) operations.splice(index, 1);
  if ((action.type === "up" || action.type === "down") && index >= 0) {
    const targetIndex = index + (action.type === "up" ? -1 : 1);
    if (operations[targetIndex]) [operations[index], operations[targetIndex]] = [operations[targetIndex], operations[index]];
  }
  const normalizedOperations = operations.map((operation, operationIndex) => {
    const previousOperation = operationIndex > 0 ? operations[operationIndex - 1] : null;
    return {
      ...operation,
      ...(previousOperation?.nextWorkCenterId ? {
        workCenterId: previousOperation.nextWorkCenterId,
        workCenter: previousOperation.nextWorkCenter,
        operationId: previousOperation.nextOperationId,
        name: previousOperation.nextOperation,
      } : {}),
      order: operationIndex,
    };
  });
  const next = { ...draft, operations: normalizedOperations, updatedAt: now };
  if (action.type === "toggle-ready") {
    const readiness = inspectSpecifications2RouteDraft(next);
    next.status = next.status === "ready-for-norming" ? "draft" : readiness.ready ? "ready-for-norming" : "draft";
  } else if (draft.status === "ready-for-norming") {
    next.status = "draft";
  }
  return next;
}

function sanitizeSpecifications2RouteOperation(value = {}) {
  const sanitized = {
    operationId: cleanText(value.operationId),
    name: cleanText(value.name),
    workCenterId: cleanText(value.workCenterId),
    workCenter: cleanText(value.workCenter),
    nextWorkCenterId: cleanText(value.nextWorkCenterId),
    nextWorkCenter: cleanText(value.nextWorkCenter),
    nextOperationId: cleanText(value.nextOperationId),
    nextOperation: cleanText(value.nextOperation),
    instructionRequired: value.instructionRequired === true,
    changesProperty: normalizeSpecifications2ChangesProperty(value.changesProperty),
    inputState: cleanText(value.inputState),
    outputState: cleanText(value.outputState),
    comment: cleanText(value.comment),
  };
  if (Object.prototype.hasOwnProperty.call(value, "productionFiles")) {
    sanitized.productionFiles = normalizeSpecifications2ProductionFiles(value.productionFiles);
  }
  if (Object.prototype.hasOwnProperty.call(value, "laborNorm")) {
    sanitized.laborNorm = normalizeSpecifications2LaborNorm(value.laborNorm);
  }
  return sanitized;
}

function normalizeSpecifications2LaborNormValues(value = {}) {
  const nonNegative = (input) => {
    const number = Number(String(input ?? "").replace(",", "."));
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
  };
  const legacyUnitMinutes = nonNegative(value.unitMinutes);
  const unitsPerHour = nonNegative(value.unitsPerHour) || (legacyUnitMinutes > 0 ? nonNegative(60 / legacyUnitMinutes) : 0);
  return {
    calculationMode: value.calculationMode === "fixed" ? "fixed" : "rate",
    setupMinutes: nonNegative(value.setupMinutes),
    unitsPerHour,
    fixedMinutes: nonNegative(value.fixedMinutes),
  };
}

function normalizeSpecifications2LaborRevision(value = {}, index = 0) {
  const values = normalizeSpecifications2LaborNormValues(value);
  const effectiveFrom = cleanText(value.effectiveFrom).slice(0, 10);
  const effectiveTo = cleanText(value.effectiveTo).slice(0, 10);
  return {
    id: cleanText(value.id) || `labor-revision-${index + 1}`,
    number: Math.max(1, Math.floor(Number(value.number) || index + 1)),
    ...values,
    effectiveFrom,
    effectiveTo,
    reason: cleanText(value.reason),
    source: cleanText(value.source) || "manual",
    createdAt: cleanText(value.createdAt),
  };
}

function getSpecifications2LaborRevisionAt(revisions = [], referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
  const dateKey = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  return [...revisions]
    .filter((revision) => (!revision.effectiveFrom || revision.effectiveFrom <= dateKey) && (!revision.effectiveTo || revision.effectiveTo >= dateKey))
    .sort((left, right) => String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)) || right.number - left.number)[0]
    || [...revisions].sort((left, right) => right.number - left.number)[0]
    || null;
}

export function normalizeSpecifications2LaborNorm(value = {}) {
  const legacyValues = normalizeSpecifications2LaborNormValues(value);
  let revisions = Array.isArray(value.revisions)
    ? value.revisions.filter(Boolean).map(normalizeSpecifications2LaborRevision)
    : [];
  const legacyComplete = legacyValues.calculationMode === "fixed" ? legacyValues.fixedMinutes > 0 : legacyValues.unitsPerHour > 0;
  if (!revisions.length && legacyComplete) {
    revisions = [normalizeSpecifications2LaborRevision({
      ...legacyValues,
      id: cleanText(value.revisionId) || "labor-revision-1",
      number: 1,
      effectiveFrom: cleanText(value.effectiveFrom) || cleanText(value.createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10),
      reason: cleanText(value.reason) || "Первичная плановая норма",
      source: cleanText(value.source) || "legacy",
      createdAt: cleanText(value.createdAt),
    }, 0)];
  }
  revisions = revisions
    .sort((left, right) => String(left.effectiveFrom).localeCompare(String(right.effectiveFrom)) || left.number - right.number)
    .map((revision, index, list) => ({
      ...revision,
      number: index + 1,
      effectiveTo: list[index + 1]?.effectiveFrom ? shiftSpecifications2IsoDate(list[index + 1].effectiveFrom, -1) : "",
    }));
  const activeRevision = getSpecifications2LaborRevisionAt(revisions);
  return {
    ...(activeRevision || legacyValues),
    revisions,
    activeRevisionId: activeRevision?.id || "",
  };
}

export function getSpecifications2LaborNormAt(value = {}, referenceDate = new Date()) {
  const normalized = normalizeSpecifications2LaborNorm(value);
  const revision = getSpecifications2LaborRevisionAt(normalized.revisions, referenceDate);
  return revision ? { ...revision, revisions: normalized.revisions, activeRevisionId: revision.id } : normalized;
}

export function isSpecifications2LaborNormComplete(value = {}) {
  const norm = normalizeSpecifications2LaborNorm(value);
  return norm.calculationMode === "fixed" ? norm.fixedMinutes > 0 : norm.unitsPerHour > 0;
}

export function calculateSpecifications2LaborOperation(value = {}, quantity = 1) {
  const norm = normalizeSpecifications2LaborNorm(value);
  const units = Math.max(1, Math.floor(Number(quantity) || 1));
  const productionMinutes = norm.unitsPerHour > 0 ? (60 * units) / norm.unitsPerHour : 0;
  const laborMinutes = norm.calculationMode === "fixed" ? norm.fixedMinutes : norm.setupMinutes + productionMinutes;
  const durationMinutes = laborMinutes;
  return {
    laborMinutes: Math.round(laborMinutes * 100) / 100,
    durationMinutes: Math.round(durationMinutes * 100) / 100,
  };
}

export function calculateSpecifications2LaborPlan(sourceDraft = {}, quantity = 1) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0] || { operations: [] };
  return draft.operations.reduce((result, operation) => {
    if (!isSpecifications2LaborNormComplete(operation.laborNorm)) return result;
    const calculation = calculateSpecifications2LaborOperation(operation.laborNorm, quantity);
    result.completedOperations += 1;
    result.laborMinutes += calculation.laborMinutes;
    result.durationMinutes += calculation.durationMinutes;
    return result;
  }, { completedOperations: 0, laborMinutes: 0, durationMinutes: 0 });
}

export function applySpecifications2LaborNorm(sourceDraft = {}, operationId = "", value = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft) return null;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    operations: draft.operations.map((operation) => operation.id === operationId
      ? { ...operation, laborNorm: normalizeSpecifications2LaborNorm(value) }
      : operation),
  };
}

export function applySpecifications2LaborNormRevision(sourceDraft = {}, operationId = "", value = {}, metadata = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft) return null;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    operations: draft.operations.map((operation) => {
      if (operation.id !== operationId) return operation;
      const current = normalizeSpecifications2LaborNorm(operation.laborNorm);
      const revision = normalizeSpecifications2LaborRevision({
        ...value,
        id: cleanText(metadata.id) || `labor-revision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        number: current.revisions.length + 1,
        effectiveFrom: cleanText(metadata.effectiveFrom) || new Date().toISOString().slice(0, 10),
        reason: cleanText(metadata.reason) || (current.revisions.length ? "Изменение нормы" : "Первичная плановая норма"),
        source: cleanText(metadata.source) || "manual",
        createdAt: cleanText(metadata.createdAt) || new Date().toISOString(),
      }, current.revisions.length);
      return { ...operation, laborNorm: normalizeSpecifications2LaborNorm({ revisions: [...current.revisions, revision] }) };
    }),
  };
}

export function generateSpecifications2ProductionStages(sourceDraft = {}, catalog = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0];
  if (!draft || draft.operations.length) return draft;
  const operations = (Array.isArray(catalog.operations) ? catalog.operations : []).filter((item) => item?.id && item?.name);
  const departments = (Array.isArray(catalog.departments) ? catalog.departments : []).filter((item) => item?.id && item?.name);
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const product = cleanText(`${draft.productLabel} ${draft.designation}`).toLowerCase();
  let sequence = ["D1_OP3", "D9_OP1", "D4_OP2", "D1_OP2"];
  if (product.includes("пластин") || product.includes("проклад") || product.includes("крюк") || product.includes("простав")) {
    sequence = ["D1_OP3", "D9_OP1", "D4_OP2", "D1_OP2"];
  } else if (product.includes("кабел")) {
    sequence = ["D1_OP3", "D5_OP1", "D4_OP2", "D1_OP2"];
  } else if (product.includes("плат")) {
    sequence = ["D1_OP3", "D3_L1_OP", "D3_AOI_OP", "D3_UW_OP", "D5_OP1", "D6_OP1", "D4_OP2", "D1_OP2"];
  }
  const resolved = sequence.map((id) => operationById.get(id)).filter(Boolean);
  if (resolved.length < 2) return draft;
  const stateByOperationId = {
    D3_L1_OP: ["Печатная плата и комплектующие", "Смонтированная печатная плата"],
    D3_UW_OP: ["Смонтированная печатная плата", "Отмытая печатная плата"],
    D5_OP1: [product.includes("кабел") ? "Комплект кабеля" : "Изделие после предыдущего этапа", product.includes("кабел") ? "Собранный кабель" : "Изделие после выводного монтажа"],
    D6_OP1: ["Собранное изделие", "Прошитое изделие"],
    D9_OP1: ["Заготовка", product.includes("пластин") ? "Механически обработанная пластина" : "Механически обработанная деталь"],
  };
  const generatedOperations = resolved.slice(0, -1).map((operation, index) => {
    const nextOperation = resolved[index + 1];
    const states = stateByOperationId[operation.id] || [];
    const changesProperty = states.length === 2;
    return {
      id: `generated-${draft.id}-${index + 1}`,
      order: index,
      operationId: operation.id,
      name: operation.name,
      workCenterId: operation.workCenterId,
      workCenter: departmentById.get(operation.workCenterId)?.name || operation.workCenterId,
      nextWorkCenterId: nextOperation.workCenterId,
      nextWorkCenter: departmentById.get(nextOperation.workCenterId)?.name || nextOperation.workCenterId,
      nextOperationId: nextOperation.id,
      nextOperation: nextOperation.name,
      instructionRequired: false,
      changesProperty,
      inputState: states[0] || "",
      outputState: states[1] || "",
      laborNorm: normalizeSpecifications2LaborNorm(),
    };
  });
  return {
    ...draft,
    status: "draft",
    updatedAt: new Date().toISOString(),
    operations: generatedOperations,
  };
}
export function inspectSpecifications2RouteDraft(sourceDraft = {}) {
  const draft = normalizeSpecifications2RouteDrafts([sourceDraft])[0] || { operations: [] };
  const operations = draft.operations || [];
  const checks = [
    { label: "Добавлена хотя бы одна операция", ok: operations.length > 0 },
    { label: "Операции выбраны из справочника", ok: operations.length > 0 && operations.every((item) => item.operationId && item.name) },
    { label: "У каждой операции указан отдел", ok: operations.length > 0 && operations.every((item) => item.workCenterId && item.workCenter) },
    { label: "Указано направление после операции", ok: operations.length > 0 && operations.every((item) => item.nextWorkCenterId && item.nextWorkCenter && item.nextOperationId && item.nextOperation) },
    { label: "Определён сценарий каждой операции", ok: operations.length > 0 && operations.every((item) => item.changesProperty === false || (item.inputState && item.outputState)) },
  ];
  const completed = checks.filter((check) => check.ok).length;
  return { checks, completed, total: checks.length, ready: completed === checks.length };
}

export function getSpecifications2InstructionDebtCount(sourceDrafts = []) {
  const drafts = Array.isArray(sourceDrafts) ? sourceDrafts : [sourceDrafts];
  return drafts.filter(Boolean).reduce((total, draft) => total + (Array.isArray(draft.operations) ? draft.operations : [])
    .filter((operation) => operation?.instructionRequired === true).length, 0);
}
