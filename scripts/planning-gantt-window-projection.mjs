function asText(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function asNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function asBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toInstant(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function compareText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareEntries(left, right) {
  return left.slotStart - right.slotStart
    || compareText(left.route.number, right.route.number)
    || asNumber(left.routeStep.sequenceNo) - asNumber(right.routeStep.sequenceNo)
    || compareText(left.routeStep.id, right.routeStep.id)
    || compareText(left.slot.id, right.slot.id);
}

/**
 * Parse the only supported Gantt-window bounds. Keeping this server-side
 * contract on canonical instants prevents a later windowed Gantt from
 * accidentally interpreting a browser-local timezone as the API range.
 */
export function readPlanningGanttWindowBounds({ fromAt, toAt } = {}) {
  const from = toInstant(fromAt);
  const to = toInstant(toAt);
  if (!from || !to) {
    throw new Error("Gantt window bounds must be valid ISO instants");
  }
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime <= fromTime) {
    throw new Error("Gantt window bounds must be valid ordered ISO instants");
  }
  return { fromAt: from, toAt: to, fromTime, toTime };
}

/**
 * Turn one physical-slot entry per row into the compact, read-only Gantt
 * window contract. Route steps are deliberately deduplicated by id, while
 * slots remain physical rows: split work stays visible instead of silently
 * collapsing to the first slot as the old global runtime projection does.
 */
export function buildPlanningGanttWindow(entries = [], bounds = {}) {
  const window = readPlanningGanttWindowBounds(bounds);
  const candidates = [];
  for (const entry of entries || []) {
    const sourceRoute = entry?.route && typeof entry.route === "object" ? entry.route : {};
    const sourceRouteStep = entry?.routeStep && typeof entry.routeStep === "object" ? entry.routeStep : {};
    const sourceSlot = entry?.slot && typeof entry.slot === "object" ? entry.slot : {};
    const routeId = asText(sourceRoute.id);
    const routeStepId = asText(sourceRouteStep.id);
    const slotId = asText(sourceSlot.id);
    const plannedStart = toInstant(sourceSlot.plannedStart);
    const plannedEnd = toInstant(sourceSlot.plannedEnd);
    const slotStart = Date.parse(plannedStart || "");
    const slotEnd = Date.parse(plannedEnd || "");
    if (!routeId || !routeStepId || !slotId
      || !Number.isFinite(slotStart) || !Number.isFinite(slotEnd) || slotEnd <= slotStart
      || slotStart >= window.toTime || slotEnd <= window.fromTime) continue;

    const route = {
      id: routeId,
      number: asText(sourceRoute.number, routeId),
      name: asText(sourceRoute.name, "Заказ-наряд"),
      designation: asText(sourceRoute.designation),
      planningQuantity: asNumber(sourceRoute.planningQuantity),
      unit: asText(sourceRoute.unit, "шт."),
      lifecycleStatus: asText(sourceRoute.lifecycleStatus, "draft"),
      planningStatus: asText(sourceRoute.planningStatus, "draft"),
      domainConcurrencyRevision: asNumber(sourceRoute.domainConcurrencyRevision),
    };
    const routeStep = {
      id: routeStepId,
      routeId,
      operationId: asText(sourceRouteStep.operationId),
      operationName: asText(sourceRouteStep.operationName, "Операция"),
      workCenterId: asText(sourceRouteStep.workCenterId),
      nextWorkCenterId: asText(sourceRouteStep.nextWorkCenterId),
      sequenceNo: asNumber(sourceRouteStep.sequenceNo),
      quantityMultiplier: asNumber(sourceRouteStep.quantityMultiplier, 1),
    };
    const continuesFromPrevious = slotStart < window.fromTime;
    const continuesAfterWindow = slotEnd > window.toTime;
    const slot = {
      id: slotId,
      routeId,
      routeStepId,
      plannedStart,
      plannedEnd,
      status: asText(sourceSlot.status, "planned"),
      quantity: asNumber(sourceSlot.quantity),
      locked: asBoolean(sourceSlot.locked),
      workCenterId: asText(sourceSlot.workCenterId, routeStep.workCenterId),
      resourceId: asText(sourceSlot.resourceId),
      continuesFromPrevious,
      continuesAfterWindow,
    };
    candidates.push({ route, routeStep, slot, slotStart });
  }

  candidates.sort(compareEntries);
  const routes = new Map();
  const routeSteps = new Map();
  const slots = new Map();
  for (const candidate of candidates) {
    if (!routes.has(candidate.route.id)) routes.set(candidate.route.id, candidate.route);
    if (!routeSteps.has(candidate.routeStep.id)) routeSteps.set(candidate.routeStep.id, candidate.routeStep);
    // A persisted planning slot is an independent visual record. De-duplicate
    // only a malformed duplicate id, never the same route step with another
    // physical slot.
    if (!slots.has(candidate.slot.id)) slots.set(candidate.slot.id, candidate.slot);
  }
  const physicalSlots = [...slots.values()];
  const boundarySlot = (slot) => ({ id: slot.id, routeId: slot.routeId, routeStepId: slot.routeStepId });
  return {
    routes: [...routes.values()],
    routeSteps: [...routeSteps.values()],
    slots: physicalSlots,
    boundaryContinuations: {
      entering: physicalSlots.filter((slot) => slot.continuesFromPrevious).map(boundarySlot),
      leaving: physicalSlots.filter((slot) => slot.continuesAfterWindow).map(boundarySlot),
    },
  };
}
