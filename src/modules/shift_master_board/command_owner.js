const DAY_MS = 24 * 60 * 60 * 1000;
const LANES = new Set(["intake", "assigned", "fact"]);
const MAX_QUANTITY = 9_999_999;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function firstText(...values) {
  return values.map((value) => text(value)).find(Boolean) || "";
}

function quantity(value) {
  const parsed = Math.round(Number(String(value ?? "").replace(",", ".")));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function safeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_QUANTITY ? parsed : null;
}

function sourcePayload(value) {
  const payload = record(value);
  return payload.command && Object.keys(record(payload.source)).length ? record(payload.source) : payload;
}

function keyed(value) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const item = record(entry);
      return { key: firstText(item.id, String(index)), value: item };
    });
  }
  return Object.entries(record(value)).map(([key, entry]) => ({ key, value: record(entry) }));
}

function indexById(value) {
  return new Map(list(value).map(record).flatMap((item) => {
    const id = text(item.id);
    return id ? [[id, item]] : [];
  }));
}

function unwrapPayload(payload) {
  const root = record(payload);
  const nested = record(root.productionModel);
  return Object.keys(nested).length ? nested : root;
}

function resolvePlanning(input) {
  const planning = record(input.planning);
  const projection = record(input.projection);
  return Object.keys(planning).length ? planning : Object.keys(projection).length ? projection : input;
}

function resolveShiftExecution(input) {
  const shiftExecution = record(input.shiftExecution);
  const projection = record(shiftExecution.projection);
  return Object.keys(projection).length ? { ...shiftExecution, ...projection } : shiftExecution;
}

function resolveRegistries(input) {
  const domains = record(input.domains);
  const systemDomains = record(input.systemDomains);
  const nested = [
    record(input.registries),
    record(domains.registries),
    record(systemDomains.registries),
    domains,
    systemDomains,
  ].find((candidate) => Object.keys(candidate).length) || {};
  const names = [
    "orgUnits", "workCenters", "positions", "employees", "employmentAssignments", "equipment",
    "scheduleTemplates", "scheduleAssignments", "attendanceEvents", "responsibilityPolicies", "responsibilities",
  ];
  return Object.fromEntries(names.flatMap((name) => {
    const value = Object.prototype.hasOwnProperty.call(nested, name) ? nested[name] : input[name];
    return typeof value === "undefined" ? [] : [[name, value]];
  }));
}

function validDateKey(value) {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : "";
}

function dateKeyFrom(value) {
  const raw = text(value);
  return validDateKey(raw) || validDateKey(raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]) || "";
}

function addDays(dateKey, days) {
  const normalized = validDateKey(dateKey);
  if (!normalized) return "";
  return new Date(new Date(`${normalized}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function resolveDateKey(input) {
  const ui = record(input.ui);
  const scope = record(resolveShiftExecution(input).scope);
  const window = { ...record(resolvePlanning(input).window), ...record(input.window) };
  return firstText(
    validDateKey(ui.dateKey),
    validDateKey(ui.windowStart),
    validDateKey(input.dateKey),
    validDateKey(scope.dateKey),
    validDateKey(window.dateKey),
    dateKeyFrom(window.start),
  );
}

function assignmentRowId(entry) {
  const assignment = entry.value;
  const sheet = record(assignment.sheetContract);
  const transfer = record(assignment.transferContract || sheet.transferContract);
  return firstText(assignment.sourceRowId, sheet.rowId, transfer.sourceRowId, assignment.rowId, entry.key);
}

function assignmentSlotId(entry) {
  const assignment = entry.value;
  const sheet = record(assignment.sheetContract);
  const transfer = record(assignment.transferContract || sheet.transferContract);
  return firstText(assignment.sourceSlotId, assignment.slotId, sheet.sourceSlotId, transfer.sourceSlotId);
}

function collectShiftExecution(input) {
  const shift = resolveShiftExecution(input);
  const rawAssignments = Object.prototype.hasOwnProperty.call(shift, "items")
    ? shift.items
    : Object.prototype.hasOwnProperty.call(shift, "assignments")
      ? shift.assignments
      : input.assignments;
  const assignments = keyed(rawAssignments).map((entry) => ({
    ...entry,
    value: { ...sourcePayload(entry.value.sourcePayload), ...entry.value },
  }));
  const embeddedFacts = assignments.flatMap((entry) => {
    const candidates = list(entry.value.facts).length ? list(entry.value.facts) : entry.value.currentFact ? [entry.value.currentFact] : [];
    return candidates.map((fact, index) => {
      const value = record(fact);
      return {
        key: firstText(value.id, `${entry.key}:fact:${index}`),
        value: { ...sourcePayload(value.sourcePayload), ...value, assignmentId: firstText(value.assignmentId, entry.value.id, entry.key) },
      };
    });
  });
  const facts = [...keyed(shift.facts || input.facts), ...embeddedFacts];
  const embeddedCarryovers = assignments.flatMap((entry) => list(entry.value.carryovers).map((carryover, index) => {
    const value = record(carryover);
    return {
      key: firstText(value.id, `${entry.key}:carryover:${index}`),
      value: { ...sourcePayload(value.sourcePayload), ...value, sourceAssignmentId: firstText(value.sourceAssignmentId, entry.value.id, entry.key) },
    };
  }));
  const carryovers = [...keyed(shift.carryovers || input.carryovers), ...embeddedCarryovers];
  return { assignments, facts, carryovers, scope: record(shift.scope) };
}

function latestFact(assignmentEntry, facts) {
  if (!assignmentEntry) return {};
  const assignmentId = firstText(assignmentEntry.value.id, assignmentEntry.key);
  const rowId = assignmentRowId(assignmentEntry);
  return facts.filter((entry) => (
    firstText(entry.value.assignmentId, entry.value.shiftAssignmentId) === assignmentId
    || (text(entry.value.sourceRowId) && text(entry.value.sourceRowId) === rowId)
  )).sort((left, right) => firstText(right.value.reportedAt, right.value.updatedAt, right.value.createdAt)
    .localeCompare(firstText(left.value.reportedAt, left.value.updatedAt, left.value.createdAt), "en"))[0]?.value || {};
}

function workCenterIdFor(slot, assignment, step) {
  const sheet = record(assignment.sheetContract);
  const transfer = record(assignment.transferContract || sheet.transferContract);
  return firstText(
    assignment.workCenterId,
    sheet.workCenterId,
    transfer.fromWorkCenterId,
    step.planningWorkCenterId,
    step.workCenterId,
    slot.planningWorkCenterId,
    slot.workCenterId,
  );
}

function routeIdFor(slot, assignment, step) {
  const sheet = record(assignment.sheetContract);
  const transfer = record(assignment.transferContract || sheet.transferContract);
  return firstText(slot.routeId, assignment.workOrderId, assignment.routeId, assignment.planningOrderId, sheet.routeId, transfer.routeId, step.routeId);
}

function stepIdFor(slot, assignment) {
  const sheet = record(assignment.sheetContract);
  const transfer = record(assignment.transferContract || sheet.transferContract);
  return firstText(slot.routeStepId, assignment.operationId, assignment.stepId, sheet.stepId, transfer.stepId);
}

function executorList(value) {
  const seen = new Set();
  return list(value).map((raw) => {
    const executor = record(raw);
    const employeeId = firstText(executor.employeeId, executor.id);
    const normalizedQuantity = quantity(executor.quantity);
    if (!employeeId || !normalizedQuantity || seen.has(employeeId)) return null;
    seen.add(employeeId);
    return { employeeId, quantity: normalizedQuantity, note: text(executor.note) };
  }).filter(Boolean);
}

function resolveUiAssignment(rowId, ui, serverEntry) {
  const map = record(ui.shiftMasterBoardAssignments);
  const direct = record(map[rowId]);
  const related = direct && Object.keys(direct).length
    ? direct
    : record(Object.values(map).find((assignment) => text(assignment?.sourceRowId) === rowId));
  return { ...record(serverEntry?.value), ...related };
}

function resolveUiFact(rowId, ui, serverFact) {
  const map = record(ui.shiftMasterBoardFacts);
  const direct = record(map[rowId]);
  const related = direct && Object.keys(direct).length
    ? direct
    : record(Object.values(map).find((fact) => text(fact?.sourceRowId) === rowId));
  return { ...record(serverFact), ...related };
}

function nextStepFor(row, steps) {
  const currentOrder = Number(row.step?.stepOrder ?? row.step?.sequenceNo ?? 0);
  return [...steps.values()].filter((step) => text(step.routeId) === row.routeId && text(step.id) !== row.stepId)
    .sort((left, right) => Number(left.stepOrder ?? left.sequenceNo ?? 0) - Number(right.stepOrder ?? right.sequenceNo ?? 0))
    .find((step) => Number(step.stepOrder ?? step.sequenceNo ?? 0) > currentOrder) || null;
}

function buildTransferContract(row, assignment, fact, carryover = null, indexes = {}) {
  const plannedQuantity = quantity(row.plannedQuantity || assignment.plannedQuantity || fact.plannedQuantity);
  const assignedQuantity = executorList(assignment.executors).reduce((sum, executor) => sum + executor.quantity, 0)
    || quantity(assignment.assignedQuantity);
  const actualQuantity = quantity(fact.actualQuantity);
  const defectQuantity = quantity(fact.defectQuantity);
  const factQuantity = Math.max(0, actualQuantity - defectQuantity);
  const updatedAt = firstText(fact.updatedAt, fact.reportedAt);
  const remainingQuantity = updatedAt ? Math.max(0, plannedQuantity - factQuantity) : Math.max(0, plannedQuantity - assignedQuantity);
  const nextStep = updatedAt && remainingQuantity > 0 ? null : nextStepFor(row, indexes.steps || new Map());
  const nextWorkCenterId = firstText(nextStep?.planningWorkCenterId, nextStep?.workCenterId);
  const nextWorkCenter = indexes.workCenters?.get(nextWorkCenterId) || {};
  const partial = Boolean(updatedAt && remainingQuantity > 0);
  return {
    version: 1,
    source: "shiftMasterBoard",
    sourceRowId: row.id,
    sourceSlotId: row.slotId,
    routeId: row.routeId,
    planningOrderId: row.routeId,
    stepId: row.stepId,
    fromWorkCenterId: row.workCenterId,
    fromWorkCenterLabel: row.workCenterLabel,
    fromOperationName: row.operationName,
    toKind: partial ? "carryover" : nextStep ? "next_operation" : "finish",
    toStepId: firstText(nextStep?.id),
    toWorkCenterId: partial ? row.workCenterId : nextWorkCenterId,
    toWorkCenterLabel: partial ? row.workCenterLabel : nextStep ? firstText(nextWorkCenter.name, nextWorkCenterId, "Участок не задан") : "Выход маршрута",
    toOperationName: partial ? row.operationName : nextStep ? firstText(nextStep.operationName, nextStep.name, "Следующая операция") : "Завершение маршрута",
    targetLabel: partial ? "Остаток в следующую смену" : nextStep ? "Следующая операция" : "Закрытие операции",
    plannedQuantity,
    assignedQuantity,
    actualQuantity,
    defectQuantity,
    factQuantity,
    remainingQuantity,
    remainingToAssignedQuantity: updatedAt ? Math.max(0, assignedQuantity - factQuantity) : 0,
    unit: firstText(row.unit, assignment.unit, fact.unit, "шт."),
    status: updatedAt ? remainingQuantity > 0 ? "partial_carryover_required" : "complete" : assignment.issued === true || text(assignment.status) === "issued" ? "issued_waiting_fact" : "draft",
    carryoverId: firstText(carryover?.id),
    carryoverDateKey: validDateKey(carryover?.dateKey),
    updatedAt: firstText(fact.updatedAt, fact.reportedAt, assignment.updatedAt),
  };
}

function buildSheetContract(row, assignment, fact, transferContract) {
  return {
    version: 1,
    documentType: "shiftWorkOrderSheet",
    documentNumber: firstText(assignment.sheetContract?.documentNumber, row.documentNumber),
    rowId: row.id,
    sourceSlotId: row.slotId,
    routeId: row.routeId,
    planningOrderId: row.routeId,
    stepId: row.stepId,
    shiftDateKey: row.dateKey,
    orderLabel: row.orderLabel,
    routePartLabel: row.routePartLabel,
    operationName: row.operationName,
    workCenterId: row.workCenterId,
    workCenterLabel: row.workCenterLabel,
    resourceId: firstText(assignment.resourceId, row.resourceId),
    resourceLabel: row.resourceLabel,
    plannedQuantity: transferContract.plannedQuantity,
    assignedQuantity: transferContract.assignedQuantity,
    factQuantity: transferContract.factQuantity,
    unit: transferContract.unit,
    masterId: text(assignment.masterId),
    masterName: firstText(assignment.sheetContract?.masterName, assignment.masterName),
    executors: executorList(assignment.executors),
    transferContract,
    status: assignment.issued === true || text(assignment.status) === "issued" ? "issued" : "draft",
    issuedAt: text(assignment.issuedAt),
    updatedAt: firstText(assignment.updatedAt, fact.updatedAt),
  };
}

function createRow({ slot, rowId, serverEntry, planning, execution, ui, indexes, dateKey }) {
  const serverFact = latestFact(serverEntry, execution.facts);
  const assignment = resolveUiAssignment(rowId, ui, serverEntry);
  const fact = resolveUiFact(rowId, ui, serverFact);
  const stepId = stepIdFor(slot, assignment);
  const step = indexes.steps.get(stepId) || {};
  const routeId = routeIdFor(slot, assignment, step);
  const route = indexes.routes.get(routeId) || {};
  const workCenterId = workCenterIdFor(slot, assignment, step);
  const workCenter = indexes.workCenters.get(workCenterId) || {};
  const sheet = record(assignment.sheetContract);
  const transfer = record(assignment.transferContract || sheet.transferContract);
  const slotId = firstText(slot.id, serverEntry ? assignmentSlotId(serverEntry) : "", assignment.slotId);
  const executors = executorList(assignment.executors);
  const assignedQuantity = executors.reduce((sum, executor) => sum + executor.quantity, 0) || quantity(assignment.assignedQuantity);
  const actualQuantity = quantity(fact.actualQuantity);
  const defectQuantity = quantity(fact.defectQuantity);
  const factQuantity = Math.max(0, actualQuantity - defectQuantity);
  const updatedAt = firstText(fact.updatedAt, fact.reportedAt);
  const laneOverride = text(record(ui.shiftMasterBoardLaneBySlot)[rowId]);
  const laneId = updatedAt || actualQuantity > 0 || defectQuantity > 0
    ? "fact"
    : LANES.has(laneOverride)
      ? laneOverride
      : assignment.issued === true || text(assignment.status) === "issued" || assignedQuantity > 0
        ? "assigned"
        : "intake";
  const resourceId = firstText(assignment.resourceId, sheet.resourceId, slot.resourceId, step.resourceId);
  const resource = indexes.equipment.get(resourceId) || {};
  return {
    id: rowId,
    sourceRowId: rowId,
    slotId,
    sourceSlotId: slotId,
    routeId,
    workOrderId: routeId,
    stepId,
    operationId: stepId,
    workCenterId,
    resourceId,
    dateKey,
    plannedQuantity: quantity(assignment.plannedQuantity || sheet.plannedQuantity || transfer.plannedQuantity || slot.quantity || route.planningQuantity),
    assignedQuantity,
    factQuantity,
    actualQuantity,
    defectQuantity,
    unit: firstText(assignment.unit, sheet.unit, slot.unit, route.unit, "шт."),
    operationName: firstText(sheet.operationName, transfer.fromOperationName, slot.operationName, step.operationName, step.name, "Операция"),
    workCenterLabel: firstText(sheet.workCenterLabel, transfer.fromWorkCenterLabel, workCenter.name, workCenterId, "Участок не задан"),
    resourceLabel: firstText(sheet.resourceLabel, resource.name, resourceId),
    orderLabel: firstText(sheet.orderLabel, route.specificationName, route.name, routeId, "Заказ-наряд"),
    routePartLabel: firstText(sheet.routePartLabel, step.specTaskName, step.taskName, "Основной маршрут"),
    documentNumber: firstText(sheet.documentNumber, assignment.documentNumber),
    route,
    step,
    slot,
    workCenter,
    serverAssignment: serverEntry?.value || null,
    boardAssignment: assignment,
    boardFact: fact,
    boardAssignedQuantity: assignedQuantity,
    boardGoodQuantity: factQuantity,
    boardLaneId: laneId,
    isBoardCarryover: false,
  };
}

function createCarryoverRow(entry, context) {
  const carryover = entry.value;
  const id = firstText(carryover.id, entry.key);
  const dateKey = validDateKey(carryover.dateKey);
  if (!id || !dateKey || dateKey !== context.dateKey) return null;
  const serverEntry = context.execution.assignments.find((assignment) => firstText(assignment.value.id, assignment.key) === text(carryover.sourceAssignmentId)) || null;
  const sourceSlotId = firstText(carryover.sourceSlotId, serverEntry ? assignmentSlotId(serverEntry) : "");
  const slot = context.indexes.slots.get(sourceSlotId) || {};
  const stepId = firstText(carryover.operationId, serverEntry?.value.operationId, slot.routeStepId);
  const step = context.indexes.steps.get(stepId) || {};
  const routeId = firstText(carryover.workOrderId, serverEntry?.value.workOrderId, slot.routeId, step.routeId);
  const route = context.indexes.routes.get(routeId) || {};
  const workCenterId = firstText(carryover.workCenterId, serverEntry?.value.workCenterId, step.planningWorkCenterId, step.workCenterId, slot.workCenterId);
  const workCenter = context.indexes.workCenters.get(workCenterId) || {};
  const plannedQuantity = quantity(carryover.remainingQuantity);
  return {
    id,
    sourceRowId: id,
    slotId: sourceSlotId,
    sourceSlotId,
    routeId,
    workOrderId: routeId,
    stepId,
    operationId: stepId,
    workCenterId,
    resourceId: firstText(carryover.resourceId, serverEntry?.value.resourceId),
    dateKey,
    plannedQuantity,
    assignedQuantity: 0,
    factQuantity: 0,
    actualQuantity: 0,
    defectQuantity: 0,
    unit: firstText(carryover.unit, serverEntry?.value.unit, "шт."),
    operationName: firstText(carryover.operationName, step.operationName, slot.operationName, "Операция"),
    workCenterLabel: firstText(carryover.workCenterLabel, workCenter.name, workCenterId, "Участок не задан"),
    resourceLabel: "",
    orderLabel: firstText(carryover.orderLabel, route.specificationName, route.name, routeId, "Заказ-наряд"),
    routePartLabel: firstText(carryover.routePartLabel, step.specTaskName, "Остаток смены"),
    documentNumber: text(carryover.documentNumber),
    route,
    step,
    slot,
    workCenter,
    serverAssignment: null,
    boardAssignment: {},
    boardFact: {},
    boardAssignedQuantity: 0,
    boardGoodQuantity: 0,
    boardLaneId: text(record(context.ui.shiftMasterBoardLaneBySlot)[id], "intake"),
    isBoardCarryover: true,
    carryover,
  };
}

function isSlotInDate(slot, dateKey, scope) {
  const scopedRows = new Set(list(scope.sourceRowIds).map(text).filter(Boolean));
  const rowId = [text(slot.id), dateKey].filter(Boolean).join("::");
  if (scopedRows.size) return scopedRows.has(rowId) || scopedRows.has(text(slot.id));
  const slotDate = dateKeyFrom(slot.plannedStart || slot.startsAt);
  return !dateKey || !slotDate || slotDate === dateKey;
}

function buildContext(payload, uiState = {}) {
  const input = unwrapPayload(payload);
  const ui = { ...record(input.ui), ...record(uiState) };
  const planning = resolvePlanning(input);
  const execution = collectShiftExecution(input);
  const registries = resolveRegistries(input);
  const dateKey = resolveDateKey({ ...input, ui });
  const indexes = {
    routes: indexById(planning.routes),
    steps: indexById(planning.routeSteps || planning.steps),
    slots: indexById(planning.slots),
    workCenters: new Map(),
    equipment: indexById(registries.equipment),
  };
  [...list(planning.workCenters), ...list(registries.workCenters)].map(record).forEach((workCenter) => {
    const id = text(workCenter.id);
    if (id) indexes.workCenters.set(id, { ...record(indexes.workCenters.get(id)), ...workCenter });
  });
  return { input, ui, planning, execution, registries, dateKey, indexes };
}

export function buildShiftMasterBoardCommandModel(payload, uiState = {}) {
  const context = buildContext(payload, uiState);
  const rowsById = new Map();
  list(context.planning.slots).map(record).filter((slot) => isSlotInDate(slot, context.dateKey, context.execution.scope)).forEach((slot) => {
    const candidateRowId = [text(slot.id), context.dateKey].filter(Boolean).join("::");
    const serverEntry = context.execution.assignments.find((entry) => assignmentRowId(entry) === candidateRowId)
      || context.execution.assignments.find((entry) => assignmentSlotId(entry) === text(slot.id))
      || null;
    const rowId = serverEntry ? assignmentRowId(serverEntry) : candidateRowId;
    const row = createRow({ slot, rowId, serverEntry, planning: context.planning, execution: context.execution, ui: context.ui, indexes: context.indexes, dateKey: context.dateKey });
    if (row.id) rowsById.set(row.id, row);
  });
  context.execution.assignments.forEach((serverEntry) => {
    const rowId = assignmentRowId(serverEntry);
    const rowDateKey = dateKeyFrom(rowId.match(/::(\d{4}-\d{2}-\d{2})$/)?.[1]);
    if (rowDateKey && rowDateKey !== context.dateKey) return;
    if (rowsById.has(rowId)) return;
    const slotId = assignmentSlotId(serverEntry);
    const slot = context.indexes.slots.get(slotId) || {
      id: slotId,
      routeId: serverEntry.value.workOrderId,
      routeStepId: serverEntry.value.operationId,
      workCenterId: serverEntry.value.workCenterId,
      resourceId: serverEntry.value.resourceId,
      quantity: serverEntry.value.plannedQuantity,
      unit: serverEntry.value.unit,
    };
    const row = createRow({ slot, rowId, serverEntry, planning: context.planning, execution: context.execution, ui: context.ui, indexes: context.indexes, dateKey: context.dateKey });
    if (row.id) rowsById.set(row.id, row);
  });
  const uiCarryovers = keyed(context.ui.shiftMasterBoardCarryovers);
  const carryoverByLogicalKey = new Map();
  [...context.execution.carryovers, ...uiCarryovers].forEach((entry) => {
    const value = entry.value;
    const logicalKey = `${firstText(value.sourceRowId, value.sourceAssignmentId)}\u0000${validDateKey(value.dateKey)}`;
    if (logicalKey !== "\u0000") carryoverByLogicalKey.set(logicalKey, entry);
  });
  [...carryoverByLogicalKey.values()].forEach((entry) => {
    const row = createCarryoverRow(entry, context);
    if (row && !rowsById.has(row.id)) rowsById.set(row.id, row);
  });
  const rows = [...rowsById.values()];
  const selectedId = firstText(context.ui.selectedRowId, context.ui.selectedSlotId, context.ui.shiftMasterBoardSelectedSlotId);
  return {
    rows,
    allRows: rows,
    selectedRow: rows.find((row) => row.id === selectedId) || rows.find((row) => row.boardLaneId !== "fact") || rows[0] || null,
    dateKey: context.dateKey,
    focus: firstText(context.ui.focus, context.ui.shiftMasterBoardFocus, "all"),
    activeMasterId: firstText(context.ui.activeMasterId, context.ui.masterId, context.ui.activeShiftMasterId),
    context,
  };
}

function rowEffectiveOn(row, dateKey) {
  if (row.isActive === false || text(row.archivedAt)) return false;
  const from = validDateKey(row.validFrom || row.effectiveFrom);
  const to = validDateKey(row.validTo || row.effectiveTo);
  return (!from || from <= dateKey) && (!to || dateKey <= to);
}

function explicitAvailability(input, employeeId, dateKey) {
  const timesheet = record(input.timesheet);
  for (const sourceValue of [input.timesheetAvailability, timesheet.availability, timesheet.availabilityByEmployee]) {
    const source = record(sourceValue);
    const direct = record(source[`${employeeId}::${dateKey}`]);
    if (Object.keys(direct).length) return direct;
    const employee = record(source[employeeId]);
    const dated = record(employee[dateKey]);
    if (Object.keys(dated).length) return dated;
  }
  return null;
}

function isAvailableOn(input, registries, employeeId, dateKey) {
  const explicit = explicitAvailability(input, employeeId, dateKey);
  if (explicit) {
    const value = firstText(explicit.value, explicit.code, explicit.status, explicit.availabilityStatus).toLowerCase();
    return explicit.isAvailable === true || explicit.availabilityStatus === "available" || ["work", "overtime", "work-overtime", "available"].includes(value);
  }
  const events = list(registries.attendanceEvents).map(record).filter((event) => text(event.employeeId) === employeeId && dateKeyFrom(event.date || event.dateKey) === dateKey);
  const base = events.find((event) => !["overtime"].includes(firstText(event.kind, event.type))) || null;
  const kind = firstText(base?.kind, base?.type).toLowerCase();
  if (["vacation", "sick", "leave", "off", "day_off"].includes(kind)) return false;
  if (["work", "overtime"].includes(kind)) return true;
  const schedule = list(registries.scheduleAssignments).map(record)
    .filter((assignment) => text(assignment.employeeId) === employeeId && rowEffectiveOn(assignment, dateKey))
    .sort((left, right) => text(right.validFrom).localeCompare(text(left.validFrom), "en"))[0] || {};
  const template = indexById(registries.scheduleTemplates).get(text(schedule.scheduleTemplateId)) || {};
  const code = firstText(template.code, schedule.code);
  const match = code.match(/^(\d+)\/(\d+)$/);
  if (!match) return false;
  const workDays = Math.max(1, Math.min(31, Number(match[1])));
  const offDays = Math.max(1, Math.min(31, Number(match[2])));
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const anchor = new Date(`${code === "5/2" ? "1970-01-05" : "1970-01-01"}T00:00:00.000Z`);
  const offset = Math.max(0, Math.round(Number(schedule.patternOffset || template.patternOffset || 0)));
  const index = ((Math.floor((date.getTime() - anchor.getTime()) / DAY_MS) + offset) % (workDays + offDays) + workDays + offDays) % (workDays + offDays);
  return index < workDays;
}

function descendantOrSame(candidateId, rootId, workCenters) {
  let currentId = text(candidateId);
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    if (currentId === rootId) return true;
    visited.add(currentId);
    currentId = text(workCenters.get(currentId)?.parentWorkCenterId);
  }
  return false;
}

function allowedEmployeesFor(row, model, masterId) {
  const { registries, input, dateKey, indexes } = model.context;
  const positions = indexById(registries.positions);
  const employments = list(registries.employmentAssignments).map(record).filter((assignment) => rowEffectiveOn(assignment, dateKey));
  const employeeProfiles = list(registries.employees).map(record).filter((employee) => text(employee.id) && rowEffectiveOn(employee, dateKey)).map((employee) => {
    const employment = employments.filter((assignment) => text(assignment.employeeId) === text(employee.id))
      .sort((left, right) => Number(right.isPrimary === true) - Number(left.isPrimary === true))[0] || {};
    const position = positions.get(text(employment.positionId)) || {};
    const capabilities = record(position.capabilities);
    return {
      id: text(employee.id),
      name: firstText(employee.displayName, employee.name, employee.fullName, "Исполнитель"),
      workCenterIds: [...new Set([...list(employee.workCenterIds).map(text), text(employment.workCenterId), text(position.workCenterId)].filter(Boolean))],
      canExecute: capabilities.canExecute !== false && capabilities.canReceiveShiftSheet !== false && employee.canExecute !== false,
    };
  }).filter((employee) => employee.workCenterIds.length);
  const employees = employeeProfiles.filter((employee) => employee.canExecute);
  // A master is commonly backed by a non-executable position. Keep that
  // employment scope available while excluding the master from executors.
  const master = employeeProfiles.find((employee) => employee.id === masterId) || null;
  const policies = [...list(registries.responsibilityPolicies), ...list(registries.responsibilities)].map(record).filter((policy) => rowEffectiveOn(policy, dateKey));
  const policy = policies.find((candidate) => firstText(candidate.subjectEmployeeId, candidate.masterId) === masterId) || {};
  const mode = firstText(policy.mode, "department");
  const targetIds = new Set(list(policy.targetEmployeeIds || policy.employeeIds).map(text).filter(Boolean));
  let scoped = employees;
  if (mode === "manual") scoped = employees.filter((employee) => targetIds.has(employee.id));
  else if (mode !== "all") {
    const roots = mode === "workCenter" && row.workCenterId ? [row.workCenterId] : master?.workCenterIds || [];
    scoped = roots.length ? employees.filter((employee) => employee.workCenterIds.some((id) => roots.some((root) => descendantOrSame(id, root, indexes.workCenters)))) : [];
  }
  return new Map(scoped.map((employee) => {
    const available = isAvailableOn(input, registries, employee.id, dateKey);
    const explicit = explicitAvailability(input, employee.id, dateKey);
    return [employee.id, {
      ...employee,
      available,
      availability: {
        ...record(explicit),
        isAvailable: available,
        label: firstText(explicit?.label, available ? "доступен по Табелю" : "недоступен по Табелю"),
      },
    }];
  }));
}

function permissionsFor(options) {
  const permissions = { ...record(options.permissions), ...options };
  return {
    assign: permissions.assign === true || permissions.canAssign === true,
    edit: permissions.edit === true || permissions.canEdit === true || permissions.canRecordFact === true,
    moveLane: permissions.moveLane === true || permissions.canMoveLane === true,
  };
}

export function prepareShiftMasterBoardAssignment(payload, uiState, command, options = {}) {
  const model = buildShiftMasterBoardCommandModel(payload, uiState);
  const row = model.allRows.find((candidate) => candidate.id === text(command?.rowId)) || null;
  if (!row) return { ok: false, message: "Задание больше не доступно в текущем PostgreSQL-окне смены." };
  if (row.isBoardCarryover) return { ok: false, message: "Остаток предыдущей смены доступен только для просмотра до выпуска нового СЗН." };
  if (!permissionsFor(options).assign) return { ok: false, message: "Нет права распределять задания." };
  const requested = list(command?.executors).map((value) => {
    const executor = record(value);
    return { employeeId: text(executor.employeeId), quantity: safeInteger(executor.quantity), note: text(executor.note) };
  });
  if (!requested.length) return { ok: false, message: "Назначьте количество хотя бы одному исполнителю." };
  const seen = new Set();
  const masterId = firstText(row.boardAssignment.masterId, model.activeMasterId);
  const allowedEmployees = allowedEmployeesFor(row, model, masterId);
  const invalid = requested.some((executor) => {
    const employee = allowedEmployees.get(executor.employeeId);
    if (!executor.employeeId || seen.has(executor.employeeId) || executor.quantity === null || executor.quantity <= 0 || !employee || employee.available !== true) return true;
    seen.add(executor.employeeId);
    return false;
  });
  if (invalid) return { ok: false, message: "Исполнители или количества не прошли проверку матрицы доступа." };
  const assignedQuantity = requested.reduce((sum, executor) => sum + executor.quantity, 0);
  if (assignedQuantity > row.plannedQuantity) return { ok: false, message: "Распределённое количество не может превышать план сменной задачи." };
  const now = text(options.now) || new Date().toISOString();
  const previous = row.boardAssignment;
  const fact = row.boardFact;
  const assignment = {
    ...previous,
    slotId: row.slotId,
    sourceRowId: row.id,
    routeId: row.routeId,
    planningOrderId: row.routeId,
    stepId: row.stepId,
    workCenterId: row.workCenterId,
    resourceId: firstText(previous.resourceId, row.resourceId),
    masterId,
    plannedQuantity: row.plannedQuantity,
    assignedQuantity,
    executors: requested,
    riskReason: assignedQuantity > 0 && assignedQuantity < row.plannedQuantity ? "resource" : text(previous.riskReason),
    status: previous.issued === true || text(previous.status) === "issued" ? "issued" : "draft",
    issued: previous.issued === true || text(previous.status) === "issued",
    createdAt: firstText(previous.createdAt, previous.issuedAt, previous.updatedAt, now),
    issuedAt: text(previous.issuedAt),
    unit: row.unit,
    updatedAt: now,
  };
  const transferContract = buildTransferContract(row, assignment, fact, null, model.context.indexes);
  assignment.transferContract = transferContract;
  assignment.sheetContract = buildSheetContract(row, assignment, fact, transferContract);
  const uiPatch = {
    shiftMasterBoardAssignments: { ...record(uiState.shiftMasterBoardAssignments), [row.id]: assignment },
    shiftMasterBoardLaneBySlot: { ...record(uiState.shiftMasterBoardLaneBySlot), [row.id]: assignedQuantity > 0 || assignment.issued ? "assigned" : "intake" },
    shiftMasterBoardSelectedSlotId: row.id,
  };
  return { ok: true, id: row.id, row, serverAssignment: row.serverAssignment, assignment, assignedQuantity, uiPatch };
}

function mergedCarryoverStore(model, uiState) {
  const store = {};
  const upsert = (idValue, carryoverValue) => {
    const carryover = record(carryoverValue);
    const id = firstText(carryover.id, idValue);
    if (!id) return;
    const sourceRowId = text(carryover.sourceRowId);
    const dateKey = validDateKey(carryover.dateKey);
    if (sourceRowId && dateKey) {
      Object.entries(store).forEach(([currentId, current]) => {
        if (text(current?.sourceRowId) === sourceRowId && validDateKey(current?.dateKey) === dateKey && currentId !== id) delete store[currentId];
      });
    }
    store[id] = { ...record(store[id]), ...carryover, id };
  };
  model.context.execution.carryovers.forEach((entry) => {
    upsert(entry.key, entry.value);
  });
  Object.entries(record(uiState.shiftMasterBoardCarryovers)).forEach(([id, carryover]) => {
    upsert(id, carryover);
  });
  return store;
}

export function prepareShiftMasterBoardFact(payload, uiState, command, options = {}) {
  const model = buildShiftMasterBoardCommandModel(payload, uiState);
  const row = model.allRows.find((candidate) => candidate.id === text(command?.rowId)) || null;
  if (!row) return { ok: false, message: "Задание больше не доступно в текущем PostgreSQL-окне смены." };
  if (row.isBoardCarryover) return { ok: false, message: "Факт по остатку вносится после выпуска нового СЗН." };
  if (!permissionsFor(options).edit) return { ok: false, message: "Нет права вносить факт смены." };
  if (!row.serverAssignment?.id) return { ok: false, message: "Сначала выпустите сменное задание и дождитесь подтверждения PostgreSQL." };
  const values = [command.actualQuantity, command.defectQuantity, command.laborMinutes, command.executorCount].map(safeInteger);
  if (values.some((value) => value === null)) return { ok: false, message: "Количества факта должны быть целыми неотрицательными числами." };
  const [actualQuantity, defectQuantity, laborMinutes, executorCount] = values;
  if (defectQuantity > actualQuantity) return { ok: false, message: "Количество брака не может превышать выпуск." };
  const now = text(options.now) || new Date().toISOString();
  const previous = row.boardFact;
  const baseFact = {
    ...previous,
    slotId: row.slotId,
    sourceRowId: row.id,
    routeId: row.routeId,
    planningOrderId: row.routeId,
    stepId: row.stepId,
    workCenterId: row.workCenterId,
    resourceId: firstText(row.boardAssignment.resourceId, row.resourceId),
    plannedQuantity: row.plannedQuantity,
    unit: row.unit,
    actualQuantity,
    defectQuantity,
    laborMinutes,
    executorCount,
    comment: text(command.comment).slice(0, 500),
    deviationComment: text(command.deviationComment).slice(0, 500),
    updatedAt: now,
  };
  const goodQuantity = Math.max(0, actualQuantity - defectQuantity);
  const remainingQuantity = Math.max(0, row.plannedQuantity - goodQuantity);
  const nextDateKey = addDays(row.dateKey || model.dateKey, 1);
  const carryoverStore = mergedCarryoverStore(model, uiState);
  const existingEntry = Object.entries(carryoverStore).find(([, carryover]) => text(carryover?.sourceRowId) === row.id && validDateKey(carryover?.dateKey) === nextDateKey) || null;
  const existingId = existingEntry?.[0] || "";
  const existing = existingEntry?.[1] || null;
  let carryover = null;
  let carryoverChanged = false;
  let replacedCarryover = null;
  let removedCarryovers = [];
  if (remainingQuantity > 0 && nextDateKey) {
    const unchanged = Boolean(existing && quantity(existing.remainingQuantity) === remainingQuantity);
    const createdAt = unchanged ? firstText(existing.createdAt, now) : now;
    const id = unchanged && firstText(existing.id, existingId)
      ? firstText(existing.id, existingId)
      : `board-carryover-${row.id}-${createdAt}::${nextDateKey}`;
    carryover = {
      ...record(existing),
      id,
      sourceRowId: row.id,
      sourceDateKey: row.dateKey || model.dateKey,
      dateKey: nextDateKey,
      sourceSlotId: row.slotId,
      routeId: row.routeId,
      planningOrderId: row.routeId,
      stepId: row.stepId,
      documentNumber: `ОСТ-${nextDateKey.replaceAll("-", "")}-${firstText(row.workCenter?.code, row.workCenterId, "WC")}`,
      routeName: firstText(row.route?.name),
      orderLabel: row.orderLabel,
      taskLabel: row.routePartLabel,
      operationName: row.operationName,
      workCenterId: row.workCenterId,
      workCenterLabel: row.workCenterLabel,
      resourceId: firstText(row.boardAssignment.resourceId, row.resourceId),
      assignedQuantity: row.assignedQuantity,
      factQuantity: goodQuantity,
      remainingQuantity,
      plannedQuantity: remainingQuantity,
      unit: row.unit,
      reason: `Остаток ${remainingQuantity.toLocaleString("ru-RU")} ${row.unit} после факта ${goodQuantity.toLocaleString("ru-RU")} из ${row.plannedQuantity.toLocaleString("ru-RU")}`,
      createdAt,
    };
    carryoverChanged = !unchanged;
    replacedCarryover = carryoverChanged ? existing : null;
    if (existingId && existingId !== id) delete carryoverStore[existingId];
    carryoverStore[id] = carryover;
  } else {
    removedCarryovers = Object.values(carryoverStore).filter((carryoverValue) => text(carryoverValue?.sourceRowId) === row.id);
    Object.entries(carryoverStore).forEach(([id, carryoverValue]) => {
      if (text(carryoverValue?.sourceRowId) === row.id) delete carryoverStore[id];
    });
  }
  const transferContract = buildTransferContract(row, row.boardAssignment, baseFact, carryover, model.context.indexes);
  const fact = { ...baseFact, transferContract };
  if (carryover) carryover.transferContract = transferContract;
  const assignments = { ...record(uiState.shiftMasterBoardAssignments) };
  if (Object.keys(row.boardAssignment).length) {
    const assignment = { ...row.boardAssignment, transferContract };
    assignment.sheetContract = buildSheetContract(row, assignment, fact, transferContract);
    assignments[row.id] = assignment;
  }
  const uiPatch = {
    shiftMasterBoardAssignments: assignments,
    shiftMasterBoardFacts: { ...record(uiState.shiftMasterBoardFacts), [row.id]: fact },
    shiftMasterBoardCarryovers: carryoverStore,
    shiftMasterBoardLaneBySlot: { ...record(uiState.shiftMasterBoardLaneBySlot), [row.id]: "fact" },
    shiftMasterBoardSelectedSlotId: row.id,
  };
  return {
    ok: true,
    id: row.id,
    row,
    serverAssignment: row.serverAssignment,
    fact,
    carryover,
    carryoverChanged,
    replacedCarryover,
    removedCarryover: removedCarryovers[0] || null,
    removedCarryovers,
    uiPatch,
  };
}

export function prepareShiftMasterBoardLane(payload, uiState, command, options = {}) {
  const model = buildShiftMasterBoardCommandModel(payload, uiState);
  const row = model.allRows.find((candidate) => candidate.id === text(command?.rowId)) || null;
  const laneId = text(command?.laneId);
  if (!permissionsFor(options).moveLane) return { ok: false, message: "Перемещение карточки временно недоступно." };
  if (!row || !LANES.has(laneId)) return { ok: false, message: "Карточка или колонка не найдены." };
  if (row.isBoardCarryover) return { ok: false, message: "Остаток предыдущей смены доступен только для просмотра." };
  if (laneId === "assigned" && row.boardAssignedQuantity <= 0) return { ok: false, message: "Сначала сохрани распределение исполнителей и количества." };
  if (laneId === "fact" && !firstText(row.boardFact.updatedAt, row.boardFact.reportedAt)) return { ok: false, message: "Факт закрывается через форму конца смены." };
  const message = laneId === "intake"
    ? "Карточка возвращена в план смены."
    : "Карточка перемещена на доске.";
  return {
    ok: true,
    id: row.id,
    row,
    laneId,
    message,
    uiPatch: {
      shiftMasterBoardLaneBySlot: { ...record(uiState.shiftMasterBoardLaneBySlot), [row.id]: laneId },
      shiftMasterBoardSelectedSlotId: row.id,
    },
  };
}

export function createShiftMasterBoardCommandOwner({
  payload = {},
  uiState = {},
  getPayload = () => payload,
  getUiState = () => uiState,
  applyUiPatch = (patch) => Object.assign(getUiState(), patch),
  getPermissions = () => ({}),
  now = () => new Date().toISOString(),
} = {}) {
  const getModel = () => buildShiftMasterBoardCommandModel(getPayload(), getUiState());
  const getRow = (rowId = "") => getModel().allRows.find((row) => row.id === text(rowId)) || null;
  const getAssignmentContext = (rowId = "") => {
    const model = getModel();
    const row = model.allRows.find((candidate) => candidate.id === text(rowId)) || null;
    if (!row) return null;
    const masterId = firstText(row.boardAssignment.masterId, model.activeMasterId);
    return {
      row,
      rowId: row.id,
      operationName: row.operationName,
      plannedQuantity: row.plannedQuantity,
      unit: row.unit,
      executors: executorList(row.boardAssignment.executors),
      employees: [...allowedEmployeesFor(row, model, masterId).values()],
      assignment: row.boardAssignment,
      fact: row.boardFact,
      serverAssignment: row.serverAssignment,
    };
  };
  const execute = (command = {}, options = {}) => {
    const type = text(command.type);
    const permissions = { ...record(getPermissions()), ...record(options.permissions), ...options };
    const timestamp = text(options.now) || text(now());
    const result = type === "save-assignment"
      ? prepareShiftMasterBoardAssignment(getPayload(), getUiState(), command, { ...permissions, now: timestamp })
      : type === "save-fact"
        ? prepareShiftMasterBoardFact(getPayload(), getUiState(), command, { ...permissions, now: timestamp })
        : type === "move-lane"
          ? prepareShiftMasterBoardLane(getPayload(), getUiState(), command, permissions)
          : { ok: false, message: "Неизвестная команда доски мастера." };
    if (result.ok && result.uiPatch) applyUiPatch(result.uiPatch, result);
    return result;
  };
  return { getModel, getRow, getAssignmentContext, execute };
}
