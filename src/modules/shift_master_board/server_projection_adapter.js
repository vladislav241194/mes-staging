function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// Command writes retain their envelope for audit purposes while snapshot
// imports store the presentation shape directly.  The renderer must see the
// same source fields in both cases; this is a read compatibility concern, not
// a second source of truth.
function sourcePayload(value) {
  const payload = record(value);
  return payload.command && Object.keys(record(payload.source)).length
    ? record(payload.source)
    : payload;
}

// Keep the transitional snapshot shape at this boundary.  The server read
// model remains the source of truth; this adapter only lets the existing
// board renderer consume its aggregate without duplicating that mapping in
// the application shell.
export function projectShiftExecutionServerProjection(items = [], { carryovers: topLevelCarryovers = [] } = {}) {
  const assignments = {};
  const facts = {};
  const carryovers = {};
  if (!Array.isArray(items)) return { assignments, facts, carryovers };
  const sourceRowIdByAssignmentId = new Map();

  const appendCarryover = (carryover = {}, fallback = {}) => {
    const id = String(carryover.id || "").trim();
    if (!id) return;
    const carryoverSource = sourcePayload(carryover.sourcePayload);
    const sourceRowId = String(carryover.sourceRowId || fallback.sourceRowId || sourceRowIdByAssignmentId.get(carryover.sourceAssignmentId) || "").trim();
    carryovers[id] = {
      ...carryoverSource, id, sourceRowId, sourceSlotId: carryover.sourceSlotId || fallback.sourceSlotId || "",
      routeId: carryoverSource.routeId || carryover.workOrderId || fallback.workOrderId || "",
      stepId: carryoverSource.stepId || carryover.operationId || fallback.operationId || "",
      workCenterId: carryover.workCenterId || fallback.workCenterId || "", dateKey: carryover.dateKey || "",
      remainingQuantity: number(carryover.remainingQuantity), reason: carryover.reason || "", createdAt: carryover.createdAt || "",
    };
  };

  items.forEach((item = {}) => {
    const rowId = String(item.sourceRowId || "").trim();
    if (!rowId) return;
    const source = sourcePayload(item.sourcePayload);
    sourceRowIdByAssignmentId.set(String(item.id || "").trim(), rowId);
    assignments[rowId] = {
      ...source,
      id: item.id, sourceRowId: rowId, slotId: item.sourceSlotId || source.slotId || "",
      routeId: source.routeId || item.workOrderId || "", planningOrderId: source.planningOrderId || item.workOrderId || "",
      stepId: source.stepId || item.operationId || "", workCenterId: item.workCenterId || source.workCenterId || "",
      resourceId: item.resourceId || source.resourceId || "", masterId: item.masterId || source.masterId || "",
      plannedQuantity: number(item.plannedQuantity), assignedQuantity: number(item.assignedQuantity),
      unit: item.unit || source.unit || "шт.", status: item.status || source.status || "draft",
      issued: item.status === "issued" || source.issued === true, issuedAt: item.issuedAt || source.issuedAt || "",
      createdAt: item.createdAt || source.createdAt || "", updatedAt: item.updatedAt || source.updatedAt || "",
      revision: number(item.revision), executors: Array.isArray(item.executors) ? item.executors : [],
    };
    const currentFact = item.currentFact || (Array.isArray(item.facts) ? item.facts[0] : null);
    if (currentFact) {
      const factSource = sourcePayload(currentFact.sourcePayload);
      facts[rowId] = {
        ...factSource, id: currentFact.id, sourceRowId: rowId, slotId: item.sourceSlotId || "",
        routeId: source.routeId || item.workOrderId || "", stepId: source.stepId || item.operationId || "",
        workCenterId: item.workCenterId || "", actualQuantity: number(currentFact.actualQuantity),
        defectQuantity: number(currentFact.defectQuantity), laborMinutes: number(currentFact.laborMinutes),
        executorCount: number(currentFact.executorCount), comment: currentFact.comment || "",
        deviationComment: currentFact.deviationComment || "", updatedAt: currentFact.reportedAt || "",
      };
    }
    (Array.isArray(item.carryovers) ? item.carryovers : []).forEach((carryover) => appendCarryover(carryover, {
      sourceRowId: rowId, sourceSlotId: item.sourceSlotId || "", workOrderId: item.workOrderId || "",
      operationId: item.operationId || "", workCenterId: item.workCenterId || "",
    }));
  });
  (Array.isArray(topLevelCarryovers) ? topLevelCarryovers : []).forEach((carryover) => appendCarryover(carryover));
  return { assignments, facts, carryovers };
}

// Dispatch reads return carryovers independently because an item may belong
// to a previous shift and therefore be outside the requested row scope.
export function projectShiftExecutionDispatchProjection(projection = {}) {
  return projectShiftExecutionServerProjection(projection?.items, { carryovers: projection?.carryovers });
}
