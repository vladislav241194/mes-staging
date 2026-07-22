import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MES_LEGACY_WORK_CENTER_ID_MAP, MES_SMT_WORK_CENTER_IDS } from "../src/mes_org_model.js";
import { routeMatchesPlanningGanttFilters } from "../src/modules/planning_core/gantt_route_filter.js";
import { createPlanningCoreServiceModule } from "../src/modules/planning_core/service.js";
import { createPlanningWorkingCalendarOwner } from "../src/modules/planning_core/working_calendar_owner.js";
import { focusPlanningRoute } from "../src/modules/planning_routes/gantt_navigation_owner.js";
import { isPlanningRoutePersistenceConfirmed } from "../src/modules/planning_routes/service.js";

const HOUR_MS = 60 * 60 * 1000;
const iso = (value) => value.toISOString();
const mapLegacyWorkCenterId = (value = "") => {
  const id = String(value || "").trim();
  return MES_LEGACY_WORK_CENTER_ID_MAP[id] || id;
};

const planningState = {
  workCenters: [
    { id: "D1", unitType: "warehouse", workSchedule: "24/7", workMode: "00:00-24:00" },
    { id: "D5", unitType: "production", workSchedule: "5/2", workMode: "08:00-17:00" },
    { id: "D3_L2", unitType: "production", workSchedule: "2/2", workMode: "08:00-20:00" },
    { id: "NIGHT", unitType: "production", workSchedule: "6/1", workMode: "20:00-08:00" },
  ],
};
const calendarOwner = createPlanningWorkingCalendarOwner({
  getPlanningState: () => planningState,
  getRuntimePlanningState: () => planningState,
  mapLegacyWorkCenterId,
  isWarehouseWorkCenterId: (workCenterId) => mapLegacyWorkCenterId(workCenterId) === "D1",
  smtWorkCenterIds: MES_SMT_WORK_CENTER_IDS,
});

assert.equal(
  calendarOwner.getCalendarWorkCenterId("smt-line:smt-line-2"),
  "D3_L2",
  "SMT ephemeral ids must resolve to their stable planning line",
);
assert.equal(
  iso(calendarOwner.snapToWorkingTime("D1", "2026-07-17T10:15:00+03:00")),
  "2026-07-17T07:15:00.000Z",
  "24/7 work centers must keep an already-working instant",
);
assert.equal(
  iso(calendarOwner.snapToWorkingTime("D5", "2026-07-17T18:00:00+03:00")),
  "2026-07-20T05:00:00.000Z",
  "5/2 work centers must skip the weekend",
);
assert.equal(
  iso(calendarOwner.snapToWorkingTime("NIGHT", "2026-07-15T02:00:00+03:00")),
  "2026-07-14T23:00:00.000Z",
  "An instant inside an overnight shift must remain unchanged",
);
assert.equal(
  iso(calendarOwner.snapToWorkingTime("NIGHT", "2026-07-15T12:00:00+03:00")),
  "2026-07-15T17:00:00.000Z",
  "An instant between overnight shifts must snap to the next shift start",
);
assert.equal(
  calendarOwner.getWorkingDurationBetween("D5", "2026-07-17T16:00:00+03:00", "2026-07-20T10:00:00+03:00"),
  3 * HOUR_MS,
  "Working duration must exclude the weekend and off-shift hours",
);

const planningCore = createPlanningCoreServiceModule({
  MES_LEGACY_WORK_CENTER_ID_MAP,
  MES_LEGACY_WORK_CENTER_NAME_MAP: {},
  MES_OBSOLETE_WORK_CENTER_IDS: new Set(),
  MES_SMT_WORK_CENTER_IDS,
  getPlanningState: () => planningState,
  setPlanningState: () => {},
  getUi: () => ({}),
  setUi: () => {},
  getDirectoryState: () => ({}),
  setDirectoryState: () => {},
  getProductionStructureWorkCenters: () => planningState.workCenters,
  getProductionStructureMatrixRuntimeOverrides: () => ({}),
});
assert.equal(
  iso(planningCore.snapToWorkingTime("D5", "2026-07-17T18:00:00+03:00")),
  "2026-07-20T05:00:00.000Z",
  "Planning core must expose and use the independent calendar owner",
);

const route = { id: "route-1", specificationId: "project-1" };
const routeSlots = [{ id: "slot-1", workCenterId: "D3_L2" }];
const workCenters = [
  { id: "D3", isPlanningUnit: false },
  { id: "D3_L2", parentWorkCenterId: "D3", isPlanningUnit: true },
  { id: "D4", isPlanningUnit: true },
];
const filterContext = {
  getRoutePlanningContext: (item) => item?.id === route.id ? { id: "project-1" } : null,
  isWorkOrderPlanningCanceled: () => false,
  getRouteSlots: (routeId) => routeId === route.id ? routeSlots : [],
  getRouteStepsForModule: () => [{ workCenterId: "D3" }],
  mapLegacyWorkCenterId,
  getWorkCenter: (workCenterId) => workCenters.find((item) => item.id === workCenterId) || null,
  isPlanningWorkCenter: (workCenter) => workCenter?.isPlanningUnit === true,
};
assert.equal(routeMatchesPlanningGanttFilters(route, filterContext), true, "A planned route with slots must be visible");
assert.equal(routeMatchesPlanningGanttFilters(route, { ...filterContext, workCenterFilter: "D3" }), true, "A parent work-center filter must include child-line slots");
assert.equal(routeMatchesPlanningGanttFilters(route, { ...filterContext, workCenterFilter: "D4" }), false, "An unrelated planning-line filter must exclude the route");
assert.equal(routeMatchesPlanningGanttFilters(route, { ...filterContext, isWorkOrderPlanningCanceled: () => true }), false, "Canceled routes must stay hidden");
assert.equal(routeMatchesPlanningGanttFilters(route, { ...filterContext, getRouteSlots: () => [] }), false, "Routes without slots must stay hidden");

const ui = { expandedProjects: new Set(), activeProjectId: "", activeRouteId: "", selectedSlotId: null };
let persistCount = 0;
let renderCount = 0;
let windowStartAtRender = "";
let frameCount = 0;
const rowScrollCalls = [];
const routeRow = {
  dataset: { rowId: `route:${route.id}` },
  scrollIntoView: (options) => rowScrollCalls.push(options),
};
const reactScroll = {
  scrollLeft: 540,
  dataset: {},
  querySelectorAll: (selector) => {
    assert.equal(selector, "[data-row-id]", "Navigation owner must search typed React rows by data-row-id");
    return [{ dataset: { rowId: "route:other" }, scrollIntoView: () => {} }, routeRow];
  },
};
const root = {
  querySelector: (selector) => {
    assert.equal(selector, ".gantt-react-scroll", "Navigation owner must target the React scroll surface");
    return reactScroll;
  },
};
assert.equal(focusPlanningRoute({
  route,
  routeSlots: [
    { id: "slot-late", plannedStart: "2026-07-22T11:00:00+03:00" },
    { id: "slot-early", plannedStart: "2026-07-22T09:00:00+03:00" },
  ],
  ui,
  getRouteProductionId: () => "project-1",
  persistUiState: () => { persistCount += 1; },
  render: () => { renderCount += 1; windowStartAtRender = ui.windowStart; },
  requestFrame: (callback) => { frameCount += 1; callback(); },
  root,
}), true, "Route focus owner must accept an existing route");
assert.equal(ui.activeRouteId, route.id, "Route focus must preserve active-route selection");
assert.equal(ui.activeProjectId, "project-1", "Route focus must preserve production selection");
assert.equal(ui.selectedSlotId, "slot-early", "Route focus must select the earliest route slot");
assert.equal(ui.windowStart, "2026-07-22", "Route focus must move the React window to the earliest route slot date");
assert.equal(windowStartAtRender, "2026-07-22", "Route focus must move the window before rendering React rows");
assert.equal(ui.expandedProjects.has(route.id), true, "Route focus must expand the route");
assert.equal(persistCount, 1, "Route focus must persist UI state once");
assert.equal(renderCount, 1, "Route focus must request one render");
assert.equal(frameCount, 1, "Route focus must schedule React DOM focus after render");
assert.deepEqual(rowScrollCalls, [{ block: "center", inline: "nearest" }], "Route focus must center the exact React route row");
assert.equal(reactScroll.scrollLeft, 360, "Route focus must preserve room for the sticky React row labels");
assert.equal(reactScroll.dataset.ganttFocusedRouteRow, "route:route-1:2026-07-22", "Fast-path focus must mark the exact route and window only after finding its row");
assert.equal(isPlanningRoutePersistenceConfirmed({ changed: true }), true, "A changed durable snapshot may continue to projection refresh");
assert.equal(isPlanningRoutePersistenceConfirmed({ changed: false }), false, "An unchanged snapshot must fail closed");
assert.equal(isPlanningRoutePersistenceConfirmed({ changed: false, blocked: true }), false, "A blocked snapshot must fail closed");
assert.equal(isPlanningRoutePersistenceConfirmed(undefined), false, "A missing persistence receipt must fail closed");

const [planningRoutesSource, planningCoreSource, productionModelSource, scenarioSource] = await Promise.all([
  readFile(new URL("../src/modules/planning_routes/service.js", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/planning_core/service.js", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/gantt/production-model.ts", import.meta.url), "utf8"),
  readFile(new URL("../experiments/react-migration/src/modules/gantt/GanttScenario.tsx", import.meta.url), "utf8"),
]);
assert.equal(planningRoutesSource.includes("ganttRuntime"), false, "Planning routes must not depend on the lazy Gantt runtime");
assert.equal(planningRoutesSource.includes("focusRoute ="), false, "Planning routes must not accept the legacy focus facade");
assert.equal(planningRoutesSource.includes("snapToWorkingTime ="), false, "Planning routes must not accept the legacy calendar facade");
assert.equal(planningCoreSource.includes("routeMatchesGanttFilters"), false, "Planning core must not accept the legacy Gantt filter facade");
assert.equal(planningRoutesSource.includes('activeModule = "routes"'), false, "Planning failures must not navigate to the retired Routes module");
assert.match(
  planningRoutesSource,
  /ui\.activeModule = route\.sourceSpecifications2EntryId \? "specifications2" : "planning";/,
  "A missing SMT planning line must stay in Planning or navigate to the owning Specifications 2.0 surface",
);
const scheduleStart = planningRoutesSource.indexOf("function schedulePlanningRouteToGantt(routeId) {");
const scheduleEnd = planningRoutesSource.indexOf("function cancelPlanningRoute(routeId)", scheduleStart);
const scheduleSource = scheduleStart >= 0 && scheduleEnd > scheduleStart
  ? planningRoutesSource.slice(scheduleStart, scheduleEnd)
  : "";
assert.ok(scheduleSource, "schedulePlanningRouteToGantt source must be available");
const finalPersistIndex = scheduleSource.indexOf("const persistResult = persistState();");
const routeNavigationIndex = scheduleSource.indexOf('ui.activeModule = "gantt";', finalPersistIndex);
const successIndex = scheduleSource.indexOf("notifySaveSuccess(", finalPersistIndex);
const focusIndex = scheduleSource.indexOf("focusPlanningRoute({", finalPersistIndex);
assert.ok(finalPersistIndex >= 0 && routeNavigationIndex > finalPersistIndex && successIndex > routeNavigationIndex && focusIndex > successIndex,
  "Gantt navigation, success and focus must happen only after a confirmed persistence receipt");
const failureBranch = scheduleSource.slice(
  scheduleSource.indexOf("if (!isPlanningRoutePersistenceConfirmed(persistResult))"),
  routeNavigationIndex,
);
assert.match(failureBranch, /syncRuntimeState\(\);[\s\S]*return false;/,
  "Blocked or unchanged persistence must restore runtime state and stop");
assert.doesNotMatch(failureBranch, /notifySaveSuccess|focusPlanningRoute|persistUiState/,
  "A failed persistence receipt must not emit success, persist navigation or focus React");
assert.match(productionModelSource, /activeRouteId: string;[\s\S]*selectedSlotId: string;/,
  "Typed Gantt production model must carry route and physical-slot focus");
assert.match(scenarioSource, /"activeRouteId" in model[\s\S]*"selectedSlotId" in model[\s\S]*preferredSelectedId[\s\S]*setSelectedId/,
  "React Gantt must reapply production focus after navigation and remount");
assert.match(scenarioSource, /data-active-route=.*data-row-id=\{row\.id\}/,
  "React Gantt must expose the active route on the typed row DOM");
assert.match(scenarioSource, /reactScrollRef = useRef<HTMLDivElement>\(null\)[\s\S]*ref=\{reactScrollRef\}/,
  "React Gantt must own its post-commit scroll surface with a ref");
assert.match(scenarioSource, /useEffect\(\(\) => \{[\s\S]*reactScrollRef\.current[\s\S]*querySelectorAll<HTMLElement>\("\[data-row-id\]"\)[\s\S]*candidate\.dataset\.rowId === activeRouteRowId[\s\S]*scrollIntoView[\s\S]*model\.leftWidth \/ 2[\s\S]*focusedRouteRowRef\.current = focusKey;[\s\S]*\}, \[activeRouteRowId, model\.leftWidth, model\.rows, model\.windowStart\]\);/,
  "React Gantt must retry route focus naturally after the async rows payload commits");

console.log("Planning/Gantt cross-consumer owners QA: OK");
