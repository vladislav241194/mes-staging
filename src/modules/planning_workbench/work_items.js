// Shared selection helpers for the planning workbench. They intentionally do
// not depend on the shift-master UI, so operational screens can later be
// loaded independently of the order editor.
export function createPlanningWorkItemHelpers({
  getUi = () => ({}),
  getPlanningState = () => ({}),
  routeStepRequiresManualPlanningLine = () => false,
  isSmtOperationWorkCenter = () => false,
  getRouteStepSelectedPlanningWorkCenterId = () => "",
} = {}) {
  const getPlanningWorkItemId = (type, id = "") => id ? `${type}:${id}` : type;
  const parsePlanningWorkItemId = (value = "") => {
    const [type, ...rest] = String(value || "").split(":");
    return { type: type === "batches" ? "schedule" : type || "task", id: rest.join(":") };
  };
  const getPlanningWorkItemSet = (_route, tasks = [], routeSteps = []) => {
    const itemIds = new Set(["supply", "chain", "manualLabor", "schedule", "shifts"]);
    tasks.forEach((task) => itemIds.add(getPlanningWorkItemId("task", task.id)));
    routeSteps.forEach((step) => itemIds.add(getPlanningWorkItemId("step", step.id)));
    return itemIds;
  };
  const getDefaultPlanningWorkItem = (_route, tasks = [], routeSteps = []) => {
    const mainTask = tasks.find((task) => task.isMain) || tasks[0];
    if (mainTask?.id) return getPlanningWorkItemId("task", mainTask.id);
    const state = getPlanningState();
    const firstUnconfiguredSmtStep = routeSteps.find((step) => (
      (routeStepRequiresManualPlanningLine(step, state) || isSmtOperationWorkCenter(step.workCenterId, step, state))
      && !getRouteStepSelectedPlanningWorkCenterId(step, state)
    ));
    if (firstUnconfiguredSmtStep) return getPlanningWorkItemId("step", firstUnconfiguredSmtStep.id);
    const firstSmtStep = routeSteps.find((step) => (
      routeStepRequiresManualPlanningLine(step, state) || isSmtOperationWorkCenter(step.workCenterId, step, state)
    ));
    return firstSmtStep ? getPlanningWorkItemId("step", firstSmtStep.id) : "schedule";
  };
  const getPlanningActiveWorkItem = (route, tasks, routeSteps) => {
    const items = getPlanningWorkItemSet(route, tasks, routeSteps);
    const ui = getUi();
    if (items.has(String(ui.planningWorkItem || ""))) return ui.planningWorkItem;
    const nextItem = getDefaultPlanningWorkItem(route, tasks, routeSteps);
    ui.planningWorkItem = nextItem;
    return nextItem;
  };
  return { getPlanningWorkItemId, parsePlanningWorkItemId, getPlanningWorkItemSet, getDefaultPlanningWorkItem, getPlanningActiveWorkItem };
}
