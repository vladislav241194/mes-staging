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

function comparableInstant(value, toDate) {
  const date = value instanceof Date ? value : toDate(value);
  return Number.isFinite(date?.getTime?.()) ? date.toISOString() : "";
}

function comparableQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
}

// A planning write can reach the local compatibility state before the
// bounded server projection has been refreshed.  Compare the small row shape
// rather than ever copying the server answer into planningState: only an
// equal projection may take over the Weekly screen again after such a write.
function comparableWeeklyPlanningRow(row = {}, { toDate } = {}) {
  const slot = row?.slot && typeof row.slot === "object" ? row.slot : {};
  const step = row?.step && typeof row.step === "object" ? row.step : {};
  const route = row?.route && typeof row.route === "object" ? row.route : {};
  const id = String(row?.id || slot.id || "").trim();
  const plannedStart = comparableInstant(row?.plannedStart || slot.plannedStart, toDate);
  const plannedEnd = comparableInstant(row?.plannedEnd || slot.plannedEnd, toDate);
  const quantity = comparableQuantity(row?.quantity ?? slot.quantity);
  if (!id || !plannedStart || !plannedEnd || quantity === null) return null;
  return {
    id,
    routeId: String(row?.routeId || slot.routeId || route.id || step.routeId || ""),
    routeStepId: String(row?.routeStepId || slot.routeStepId || step.id || ""),
    plannedStart,
    plannedEnd,
    quantity,
    unit: String(row?.unit || slot.unit || step.unit || route.unit || "шт."),
    workCenterId: String(row?.workCenterId || slot.planningWorkCenterId || slot.workCenterId || step.planningWorkCenterId || step.workCenterId || ""),
    resourceId: String(row?.resourceId || slot.resourceId || step.resourceId || step.executionContext?.resourceId || ""),
    status: String(slot.status || row?.status || "planned"),
    locked: Boolean(slot.isLocked ?? slot.locked ?? row?.locked),
  };
}

export function weeklyPlanningRowsEquivalent(leftRows = [], rightRows = [], {
  toDate = (value) => new Date(value),
} = {}) {
  const normalize = (rows) => {
    if (!Array.isArray(rows)) return null;
    const comparable = rows.map((row) => comparableWeeklyPlanningRow(row, { toDate }));
    if (comparable.some((row) => !row)) return null;
    return comparable.sort((left, right) => left.id.localeCompare(right.id, "ru"));
  };
  const left = normalize(leftRows);
  const right = normalize(rightRows);
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
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
      routeId,
      routeStepId: String(slot?.routeStepId || step?.id || ""),
      resourceId,
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
