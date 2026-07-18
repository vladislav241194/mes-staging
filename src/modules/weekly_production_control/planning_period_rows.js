function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeDate(value, toDate) {
  const date = toDate(value);
  return Number.isFinite(date?.getTime?.()) ? date : null;
}

function positiveQuantity(value, fallback = 1) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : fallback;
}

// Converts only the bounded planning transport projection into the small row
// shape that Weekly Control consumes. It deliberately has no dependency on
// the lazy Gantt runtime or on the full local planning collections.
export function buildWeeklyPlanningPeriodRows(projection = {}, {
  toDate = (value) => new Date(value),
  mapWorkCenterId = (value) => String(value || ""),
  getWorkCenter = () => null,
  getResource = () => null,
} = {}) {
  const stepsById = new Map(asArray(projection.routeSteps).map((step) => [String(step?.id || ""), step]));
  const routesById = new Map(asArray(projection.routes).map((route) => [String(route?.id || ""), route]));

  return asArray(projection.slots).map((slot) => {
    const step = stepsById.get(String(slot?.routeStepId || "")) || null;
    const routeId = String(slot?.routeId || step?.routeId || "");
    const route = routesById.get(routeId) || null;
    const workCenterId = mapWorkCenterId(
      slot?.planningWorkCenterId
      || slot?.workCenterId
      || step?.planningWorkCenterId
      || step?.workCenterId
      || "",
    );
    const workCenter = getWorkCenter(workCenterId) || getWorkCenter(slot?.workCenterId) || null;
    const resourceId = String(
      slot?.resourceId
      || step?.resourceId
      || step?.executionContext?.resourceId
      || "",
    );
    const resource = resourceId ? getResource(resourceId) : null;
    const plannedStart = safeDate(slot?.plannedStart, toDate);
    const plannedEnd = safeDate(slot?.plannedEnd, toDate);
    const routeName = String(route?.name || route?.specificationName || routeId || "Маршрутная карта не найдена");

    return {
      id: String(slot?.id || ""),
      slot: { ...slot },
      plannedStart,
      plannedEnd,
      quantity: positiveQuantity(slot?.quantity, positiveQuantity(route?.planningQuantity, 1)),
      unit: String(slot?.unit || step?.unit || route?.unit || "шт."),
      workCenterId,
      workCenterLabel: String(workCenter?.name || workCenterId || "Участок не задан"),
      resourceLabel: String(resource?.name || workCenter?.name || "Ресурс не назначен"),
      routeName,
      sourceKind: "planning-period-api",
    };
  }).filter((row) => row.id && row.plannedStart && row.plannedEnd)
    .sort((left, right) => left.plannedStart - right.plannedStart
      || left.workCenterLabel.localeCompare(right.workCenterLabel, "ru")
      || left.id.localeCompare(right.id));
}
