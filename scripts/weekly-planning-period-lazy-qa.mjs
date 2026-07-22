import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const app = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(app.includes('import("./modules/domain_api/planning_period_read_model.ts")'), "Weekly planning period read model must load lazily");
expect(app.includes('import("./modules/weekly_production_control/planning_period_rows.js")'), "Weekly period row adapter must load lazily");
expect(app.includes('createPlanningPeriodReadModel({ view: "weekly" })'), "Weekly Control must request the compact period contract explicitly");
expect(app.includes("buildWeeklyPlanningPeriodRowsFromCompact"), "Weekly Control must adapt direct compact rows without constructing a planning graph");
expect(app.includes("function resolveWeeklyCompactSlotPresentation"), "compact Weekly rows must reuse the established SMT/resource presentation resolver");
expect(app.includes("resolveSlotPresentation: resolveWeeklyCompactSlotPresentation"), "compact Weekly hydration must pass the source-slot presentation resolver");
expect(app.includes("function hydrateWeeklyPlanningPeriod()"), "Weekly Control needs a bounded period hydration path");
expect(app.includes("function getWeeklyPlanningLocalRows") && app.includes("return getPlanningTableSlotRows().filter"), "Weekly period API must retain the bounded local planning comparison fallback");
expect(app.includes("fromAt = weekStart.toISOString()"), "Weekly local calendar bounds must be transported as exact UTC instants");
expect(app.includes("scheduleWeeklyPlanningPeriodRefresh(bounds)"), "Weekly period cache must revalidate while the screen remains open");
expect(app.includes("function invalidateWeeklyPlanningPeriod()"), "planning changes must invalidate the Weekly period cache");
expect(app.includes("Array.isArray(weeklyPlanningPeriodState.rows)"), "a local planning write after a bounded read must keep the compatibility projection visible until the owner catches up");
expect(app.includes("weeklyPlanningRowsEquivalent(rows, getWeeklyPlanningLocalRows(bounds)"), "Weekly period refresh must prove a server response matches a locally changed week before using it");
expect(!app.includes('import("./modules/gantt_runtime/render.js")'), "Weekly period API must not load the Gantt runtime");
expect(!app.includes('import("./modules/weekly_production_control/render.js")'), "current Weekly runtime must not load the removed renderer");

const weeklyHydration = app.slice(app.indexOf("function hydrateWeeklyPlanningPeriod()"), app.indexOf("const PRODUCTION_STRUCTURE_REGISTRY_IDS"));
expect(!/planningState\s*=/.test(weeklyHydration), "Weekly period hydration must never replace the global planning state");
const localWeeklyRows = app.slice(app.indexOf("function getPlanningTableSlotRows()"), app.indexOf("function getWeeklyPlanningPeriodBounds()"));
expect(localWeeklyRows.includes("getPlanningTableSlotRoute(slot, step)"), "Weekly local fallback must reuse the already indexed route step for each slot");
expect(!localWeeklyRows.includes("getPlanningSlotRoute(slot, planningState)"), "Weekly local fallback must not rescan route steps for every slot");
const compactPresentation = app.slice(app.indexOf("function resolveWeeklyCompactSlotPresentation"), app.indexOf("function clearWeeklyPlanningPeriodRefreshTimer()"));
expect(!compactPresentation.includes("getGanttRuntime"), "compact Weekly presentation must not invoke the lazy Gantt runtime");
const weeklyInvalidation = app.slice(app.indexOf("function invalidateWeeklyPlanningPeriod()"), app.indexOf("function setPlanningStateAndInvalidate("));
expect(weeklyInvalidation.includes("weeklyPlanningPeriodState.loading"), "a planning write racing an in-flight bounded read must keep the local projection authoritative");
expect(weeklyInvalidation.includes("Array.isArray(weeklyPlanningPeriodState.rows)"), "startup hydration before the first bounded read must not be misclassified as a local write conflict");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Weekly planning period lazy QA: OK");
