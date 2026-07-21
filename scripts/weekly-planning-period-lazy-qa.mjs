import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const app = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const weekly = await readFile(resolve(process.cwd(), "src/modules/weekly_production_control/render.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(app.includes('import("./modules/domain_api/planning_period_read_model.js")'), "Weekly planning period read model must load lazily");
expect(app.includes('import("./modules/weekly_production_control/planning_period_rows.js")'), "Weekly period row adapter must load lazily");
expect(app.includes('createPlanningPeriodReadModel({ view: "weekly" })'), "Weekly Control must request the compact period contract explicitly");
expect(app.includes("buildWeeklyPlanningPeriodRowsFromCompact"), "Weekly Control must adapt direct compact rows without constructing a planning graph");
expect(app.includes("function resolveWeeklyCompactSlotPresentation"), "compact Weekly rows must reuse the established SMT/resource presentation resolver");
expect(app.includes("resolveSlotPresentation: resolveWeeklyCompactSlotPresentation"), "compact Weekly hydration must pass the source-slot presentation resolver");
expect(app.includes("function hydrateWeeklyPlanningPeriod()"), "Weekly Control needs a bounded period hydration path");
expect(app.includes("return getPlanningTableSlotRows();"), "Weekly period API must retain the local planning fallback");
expect(app.includes("fromAt = weekStart.toISOString()"), "Weekly local calendar bounds must be transported as exact UTC instants");
expect(app.includes("scheduleWeeklyPlanningPeriodRefresh(bounds)"), "Weekly period cache must revalidate while the screen remains open");
expect(app.includes("function invalidateWeeklyPlanningPeriod("), "planning changes must invalidate the Weekly period cache");
expect(app.includes("function invalidateWeeklyPlanningPeriod({ localMutation = true } = {})"), "an unannotated planning invalidation must default to a real local mutation");
expect(app.includes("weeklyPlanningRowsEquivalent(rows, getWeeklyPlanningLocalRows(bounds)"), "Weekly period refresh must prove a server response matches a locally changed week before using it");
expect(!app.includes('import("./modules/gantt_runtime/render.js")'), "Weekly period API must not load the Gantt runtime");
expect(weekly.includes("getPlanningTableSlotRows({ weekStart, weekEnd })"), "Weekly model must request only its visible date range");

const weeklyHydration = app.slice(app.indexOf("function hydrateWeeklyPlanningPeriod()"), app.indexOf("function getWeeklyProductionControlRuntimeInstance()"));
expect(!/planningState\s*=/.test(weeklyHydration), "Weekly period hydration must never replace the global planning state");
const localWeeklyRows = app.slice(app.indexOf("function getPlanningTableSlotRows()"), app.indexOf("function getWeeklyPlanningPeriodBounds()"));
expect(localWeeklyRows.includes("getPlanningTableSlotRoute(slot, step)"), "Weekly local fallback must reuse the already indexed route step for each slot");
expect(!localWeeklyRows.includes("getPlanningSlotRoute(slot, planningState)"), "Weekly local fallback must not rescan route steps for every slot");
const compactPresentation = app.slice(app.indexOf("function resolveWeeklyCompactSlotPresentation"), app.indexOf("function clearWeeklyPlanningPeriodRefreshTimer()"));
expect(!compactPresentation.includes("getGanttRuntime"), "compact Weekly presentation must not invoke the lazy Gantt runtime");
const preferenceResolverStart = app.indexOf("function resolveWeeklyPlanningPeriodPreferLocal(");
const preferenceResolverEnd = app.indexOf("\n}\n\nfunction invalidateWeeklyPlanningPeriod", preferenceResolverStart) + 2;
const resolveWeeklyPlanningPeriodPreferLocal = Function(`return (${app.slice(preferenceResolverStart, preferenceResolverEnd)})`)();
expect(resolveWeeklyPlanningPeriodPreferLocal({ currentPreference: false, localMutation: true }) === true,
  "a local planning write before the first Weekly read must keep the compatibility projection authoritative");
expect(resolveWeeklyPlanningPeriodPreferLocal({ currentPreference: false, localMutation: false }) === false,
  "startup owner hydration before the first Weekly read must not create a false compatibility conflict");
expect(resolveWeeklyPlanningPeriodPreferLocal({ currentPreference: true, localMutation: false }) === true,
  "owner hydration must not clear an already pending local planning mutation");
const weeklyInvalidation = app.slice(app.indexOf("function invalidateWeeklyPlanningPeriod("), app.indexOf("function setPlanningStateAndInvalidate("));
expect(weeklyInvalidation.includes("currentPreference: weeklyPlanningPeriodState.preferLocal"), "Weekly invalidation must preserve a pending local mutation");
const planningProjectionHydration = app.slice(app.indexOf("async function hydratePlanningRuntimeProjection"), app.indexOf("function getShiftExecutionDispatchScope"));
expect(planningProjectionHydration.includes("invalidateWeeklyPlanningPeriod({ localMutation: false })"), "PostgreSQL owner hydration must be explicitly non-local");
const runtimeStateInitialization = app.slice(app.indexOf("function initializeRuntimeStateServiceModule()"), app.indexOf("function updateClockOnly()"));
expect(runtimeStateInitialization.includes("setPlanningStateAndInvalidate(nextState, { localMutation: false })"), "bootstrap and remote snapshot hydration must be explicitly non-local");
const planningPersistence = app.slice(app.indexOf("function persistState(...args)"), app.indexOf("function recoverPlanningStateFromStorageIfRuntimeEmpty"));
expect(planningPersistence.includes("invalidateWeeklyPlanningPeriod();"), "a durable local planning write must use the fail-closed local-mutation default");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Weekly planning period lazy QA: OK");
