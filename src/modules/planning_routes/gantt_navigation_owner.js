import { LEFT_WIDTH } from "../../app_constants.js";

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function focusPlanningRoute(options = {}) {
  const {
    route,
    routeSlots = [],
    ui,
    getRouteProductionId = (item = {}) => item?.specificationId || item?.projectId || "",
    getRoutePlanningContext = () => null,
    persistUiState = () => {},
    render = () => {},
    requestFrame = globalThis.requestAnimationFrame,
    root = globalThis.document,
  } = options;

  if (!route?.id || !ui) return false;
  if (!(ui.expandedProjects instanceof Set)) {
    ui.expandedProjects = new Set(ui.expandedProjects || []);
  }
  ui.expandedProjects.add(route.id);
  ui.activeRouteId = route.id;
  ui.activeProjectId = getRouteProductionId(route)
    || getRoutePlanningContext(route)?.id
    || ui.activeProjectId
    || "";
  const firstSlot = [...routeSlots]
    .sort((left, right) => toTimestamp(left?.plannedStart) - toTimestamp(right?.plannedStart))[0];
  ui.selectedSlotId = firstSlot?.id || null;
  if (Number.isFinite(toTimestamp(firstSlot?.plannedStart))) {
    ui.windowStart = new Date(firstSlot.plannedStart).toISOString().slice(0, 10);
  }
  persistUiState();
  render();

  if (typeof requestFrame === "function" && root?.querySelector) {
    const focusReactRouteRow = (attempt = 0) => {
      const rowId = `route:${route.id}`;
      const shell = root.querySelector(".gantt-react-scroll");
      const element = [...(shell?.querySelectorAll?.("[data-row-id]") || [])]
        .find((candidate) => candidate?.dataset?.rowId === rowId);
      if (!element || !shell) {
        if (attempt < 2) requestFrame(() => focusReactRouteRow(attempt + 1));
        return;
      }
      const focusKey = `${rowId}:${ui.windowStart || ""}`;
      if (shell.dataset?.ganttFocusedRouteRow === focusKey) return;
      element.scrollIntoView({ block: "center", inline: "nearest" });
      shell.scrollLeft = Math.max(0, Number(shell.scrollLeft || 0) - LEFT_WIDTH / 2);
      if (shell.dataset) shell.dataset.ganttFocusedRouteRow = focusKey;
    };
    requestFrame(() => focusReactRouteRow());
  }
  return true;
}
