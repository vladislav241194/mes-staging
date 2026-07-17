function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Keep the transitional snapshot shape at this boundary.  The server read
// model remains the source of truth; this adapter only lets the existing
// board renderer consume its aggregate without duplicating that mapping in
// the application shell.
export function projectShiftExecutionServerProjection(items = []) {
  const assignments = {};
  const facts = {};
  const carryovers = {};
  if (!Array.isArray(items)) return { assignments, facts, carryovers };

  items.forEach((item = {}) => {
    const rowId = String(item.sourceRowId || "").trim();
    if (!rowId) return;
    const source = item.sourcePayload && typeof item.sourcePayload === "object" ? item.sourcePayload : {};
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
    const currentFact = Array.isArray(item.facts) ? item.facts[0] : null;
    if (currentFact) {
      const factSource = currentFact.sourcePayload && typeof currentFact.sourcePayload === "object" ? currentFact.sourcePayload : {};
      facts[rowId] = {
        ...factSource, id: currentFact.id, sourceRowId: rowId, slotId: item.sourceSlotId || "",
        routeId: source.routeId || item.workOrderId || "", stepId: source.stepId || item.operationId || "",
        workCenterId: item.workCenterId || "", actualQuantity: number(currentFact.actualQuantity),
        defectQuantity: number(currentFact.defectQuantity), laborMinutes: number(currentFact.laborMinutes),
        executorCount: number(currentFact.executorCount), comment: currentFact.comment || "",
        deviationComment: currentFact.deviationComment || "", updatedAt: currentFact.reportedAt || "",
      };
    }
    (Array.isArray(item.carryovers) ? item.carryovers : []).forEach((carryover) => {
      const carryoverSource = carryover.sourcePayload && typeof carryover.sourcePayload === "object" ? carryover.sourcePayload : {};
      const id = String(carryover.id || "").trim();
      if (!id) return;
      carryovers[id] = {
        ...carryoverSource, id, sourceRowId: rowId, sourceSlotId: carryover.sourceSlotId || item.sourceSlotId || "",
        routeId: carryoverSource.routeId || carryover.workOrderId || item.workOrderId || "",
        stepId: carryoverSource.stepId || carryover.operationId || item.operationId || "",
        workCenterId: carryover.workCenterId || item.workCenterId || "", dateKey: carryover.dateKey || "",
        remainingQuantity: number(carryover.remainingQuantity), reason: carryover.reason || "", createdAt: carryover.createdAt || "",
      };
    });
  });
  return { assignments, facts, carryovers };
}
