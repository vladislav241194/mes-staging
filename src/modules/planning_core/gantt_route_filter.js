function identity(value = "") {
  return String(value || "").trim();
}

export function routeMatchesPlanningGanttFilters(route, context = {}) {
  const {
    workCenterFilter = "all",
    getRoutePlanningContext = () => null,
    isWorkOrderPlanningCanceled = () => false,
    getRouteSlots = () => [],
    getRouteStepsForModule = () => [],
    mapLegacyWorkCenterId = identity,
    getWorkCenter = () => null,
    isPlanningWorkCenter = () => false,
  } = context;

  if (!route || !getRoutePlanningContext(route)) return false;
  if (isWorkOrderPlanningCanceled(route)) return false;
  const routeSlots = getRouteSlots(route.id);
  if (!routeSlots.length) return false;

  const filterId = String(workCenterFilter || "all").trim() || "all";
  if (filterId === "all") return true;

  const normalizedFilterId = mapLegacyWorkCenterId(filterId);
  const filteredCenter = getWorkCenter(normalizedFilterId);
  const filterIsPlanningCenter = Boolean(filteredCenter && isPlanningWorkCenter(filteredCenter));
  const hasRouteCenter = getRouteStepsForModule(route.id).some((step) => {
    const stepWorkCenterId = mapLegacyWorkCenterId(step?.workCenterId || "");
    return stepWorkCenterId === normalizedFilterId
      || (!filterIsPlanningCenter && getWorkCenter(stepWorkCenterId)?.parentWorkCenterId === normalizedFilterId);
  });
  const hasSlotCenter = routeSlots.some((slot) => {
    const slotWorkCenterId = mapLegacyWorkCenterId(slot?.workCenterId || "");
    if (slotWorkCenterId === normalizedFilterId) return true;
    if (filterIsPlanningCenter) return false;
    if (mapLegacyWorkCenterId(slot?.routeWorkCenterId || "") === normalizedFilterId) return true;
    return getWorkCenter(slotWorkCenterId)?.parentWorkCenterId === normalizedFilterId;
  });
  return hasRouteCenter || hasSlotCenter;
}
