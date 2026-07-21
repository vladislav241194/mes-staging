function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function projectServerPlanningRoute(item = {}) {
  const metadata = asObject(item.metadata);
  const ownsCanonicalStartDate = Object.prototype.hasOwnProperty.call(item, "planningStartDate");
  return {
    ...metadata,
    id: String(item.id || metadata.id || ""),
    workOrderSnapshot: {
      ...asObject(metadata.workOrderSnapshot),
      id: String(item.number || metadata.workOrderSnapshot?.id || item.id || ""),
      quantity: Number(item.quantity || 0),
    },
    planningQuantity: Number(item.quantity || 0),
    lifecycleStatus: String(item.lifecycleStatus || metadata.lifecycleStatus || "draft"),
    planningStatus: String(item.planningStatus || metadata.planningStatus || "draft"),
    planningStartDate: ownsCanonicalStartDate
      ? String(item.planningStartDate || "")
      : String(metadata.planningStartDate || ""),
    domainConcurrencyRevision: Number(item.concurrencyRevision || metadata.domainConcurrencyRevision || 0),
    updatedAt: String(item.updatedAt || metadata.updatedAt || ""),
    operationCount: Number(item.operationCount || 0),
    scheduledOperationCount: Number(item.scheduledOperationCount || 0),
  };
}

function hasServerMetadata(item = {}) {
  return Object.keys(asObject(item?.metadata)).length > 0;
}

export function projectServerPlanningRoutes(items = [], snapshotRoutes = [], { preferServer = false } = {}) {
  const source = Array.isArray(items) ? items : [];
  const fallback = Array.isArray(snapshotRoutes) ? snapshotRoutes : [];
  const sourceIsRenderable = source.length > 0 && source.every(hasServerMetadata);
  if (preferServer && sourceIsRenderable) {
    return { exact: true, source: "server", routes: source.map(projectServerPlanningRoute) };
  }
  const serverIds = new Set(source.map((item) => String(item?.id || "")).filter(Boolean));
  const fallbackIds = new Set(fallback.map((item) => String(item?.id || "")).filter(Boolean));
  const exact = source.length === fallback.length
    && source.length > 0
    && [...serverIds].every((id) => fallbackIds.has(id))
    && [...fallbackIds].every((id) => serverIds.has(id))
    && source.every((item) => Object.keys(asObject(item?.metadata)).length > 0);
  return {
    exact,
    source: exact ? "server" : "snapshot",
    routes: exact ? source.map(projectServerPlanningRoute) : fallback,
  };
}

export function projectServerPlanningSteps(detail = {}, snapshotSteps = [], { preferServer = false } = {}) {
  const operations = Array.isArray(detail?.operations) ? detail.operations : [];
  const fallback = Array.isArray(snapshotSteps) ? snapshotSteps : [];
  const sourceIsRenderable = operations.length > 0 && operations.every(hasServerMetadata);
  if (preferServer && sourceIsRenderable) {
    return {
      exact: true,
      source: "server",
      steps: operations.map((operation) => ({
        ...asObject(operation.metadata),
        id: String(operation.id || operation.metadata?.id || ""),
        routeStepId: String(operation.id || operation.metadata?.routeStepId || ""),
        operationId: String(operation.operationId || operation.metadata?.operationId || ""),
        operationName: String(operation.name || operation.metadata?.operationName || ""),
        workCenterId: String(operation.workCenterId || operation.metadata?.workCenterId || ""),
        nextWorkCenterId: String(operation.nextWorkCenterId || operation.metadata?.nextWorkCenterId || ""),
        quantityMultiplier: Number(operation.quantityMultiplier || operation.metadata?.quantityMultiplier || 1),
        executionContext: asObject(operation.executionContext),
        labor: asObject(operation.labor),
        planningSlot: operation.slot ? {
          ...asObject(operation.slot.metadata),
          id: String(operation.slot.id || operation.slot.metadata?.id || ""),
          routeStepId: String(operation.id || operation.slot.metadata?.routeStepId || ""),
          plannedStart: String(operation.slot.plannedStart || operation.slot.metadata?.plannedStart || ""),
          plannedEnd: String(operation.slot.plannedEnd || operation.slot.metadata?.plannedEnd || ""),
          status: String(operation.slot.status || operation.slot.metadata?.status || "planned"),
          quantity: Number(operation.slot.quantity || operation.slot.metadata?.quantity || 0),
          locked: Boolean(operation.slot.isLocked),
        } : null,
      })),
    };
  }
  const ids = new Set(fallback.map((step) => String(step?.id || step?.routeStepId || "")).filter(Boolean));
  const exact = operations.length === fallback.length
    && operations.length > 0
    && operations.every((operation) => ids.has(String(operation?.id || "")) && Object.keys(asObject(operation?.metadata)).length > 0);
  if (!exact) return { exact: false, source: "snapshot", steps: fallback };
  return {
    exact: true,
    source: "server",
    steps: operations.map((operation) => ({
      ...asObject(operation.metadata),
      id: String(operation.id || operation.metadata?.id || ""),
      routeStepId: String(operation.id || operation.metadata?.routeStepId || ""),
      operationId: String(operation.operationId || operation.metadata?.operationId || ""),
      operationName: String(operation.name || operation.metadata?.operationName || ""),
      workCenterId: String(operation.workCenterId || operation.metadata?.workCenterId || ""),
      nextWorkCenterId: String(operation.nextWorkCenterId || operation.metadata?.nextWorkCenterId || ""),
      quantityMultiplier: Number(operation.quantityMultiplier || operation.metadata?.quantityMultiplier || 1),
      labor: asObject(operation.labor),
      planningSlot: operation.slot ? {
        ...asObject(operation.slot.metadata),
        id: String(operation.slot.id || operation.slot.metadata?.id || ""),
        routeStepId: String(operation.id || operation.slot.metadata?.routeStepId || ""),
        plannedStart: String(operation.slot.plannedStart || operation.slot.metadata?.plannedStart || ""),
        plannedEnd: String(operation.slot.plannedEnd || operation.slot.metadata?.plannedEnd || ""),
        status: String(operation.slot.status || operation.slot.metadata?.status || "planned"),
        quantity: Number(operation.slot.quantity || operation.slot.metadata?.quantity || 0),
        locked: Boolean(operation.slot.isLocked),
      } : null,
    })),
  };
}

// A work-order API response does not need to carry the complete editable
// specification tree just to render the first planning screen.  Operations
// without an explicit source task belong to the document root; this mirrors
// the legacy planning service's MAIN_ROUTE_TASK_ID without importing its
// shared runtime state.
export function projectServerPlanningTasks(route = {}, steps = [], snapshotTasks = [], { preferServer = false } = {}) {
  const sourceSteps = Array.isArray(steps) ? steps : [];
  const fallback = Array.isArray(snapshotTasks) ? snapshotTasks : [];
  if (!preferServer || !sourceSteps.length) return fallback;

  const groups = new Map();
  sourceSteps.forEach((step) => {
    const taskId = String(step?.specTaskId || "__main__");
    if (groups.has(taskId)) return;
    groups.set(taskId, step);
  });
  return [...groups.entries()].map(([id, sample], index, entries) => ({
    id,
    sourceItemId: String(sample?.specTaskSourceItemId || ""),
    sourceSpecificationId: String(sample?.sourceSpecificationId || route?.specificationId || ""),
    parentTitle: "",
    number: String(sample?.specTaskNumber || index + 1).padStart(2, "0"),
    level: Math.max(0, Number(sample?.specTaskLevel || 0)),
    type: "standalone",
    fulfillmentMode: String(sample?.fulfillmentMode || "produce"),
    title: String(sample?.specTaskName || route?.specificationName || route?.name || "Заказ-наряд"),
    hasChildren: true,
    isLast: index === entries.length - 1,
    continuationLevels: [],
    operationId: "",
    operationName: "Операции заказ-наряда",
    departmentName: "Маршрутная карта",
    quantity: Math.max(1, Number(sample?.specTaskQuantity || 1)),
    unit: String(sample?.specTaskUnit || "шт."),
    bomListId: String(sample?.bomListId || ""),
    boardsPerPanel: Math.max(1, Number(sample?.boardsPerPanel || 1)),
    workCenterId: String(sample?.workCenterId || ""),
    isMain: id === "__main__",
    restoredFromServer: true,
  }));
}
