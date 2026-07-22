import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const app = await readFile(resolve(root, "src/app.js"), "utf8");
const host = await readFile(resolve(root, "src/modules/gantt_runtime/react_island_host.js"), "utf8");
const planningCore = await readFile(resolve(root, "src/modules/planning_core/service.js"), "utf8");
const planningRoutes = await readFile(resolve(root, "src/modules/planning_routes/service.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const expectMissing = async (path, message) => {
  try {
    await access(resolve(root, path), constants.F_OK);
    failures.push(message);
  } catch (error) {
    if (error?.code !== "ENOENT") failures.push(`${message}: ${error?.message || error}`);
  }
};

await expectMissing("src/modules/gantt_runtime/render.js", "Retired Gantt legacy renderer must be physically absent");
await expectMissing("src/modules/gantt_runtime/lazy_facade.js", "Retired Gantt lazy facade must be physically absent");

expect(!app.includes("createLazyGanttRuntimeModule"), "App must not assemble the retired Gantt facade");
expect(!app.includes("ganttRuntime"), "App must not retain the same-release legacy Gantt runtime");
expect(!app.includes("data-gantt-shell"), "App must not render the retired legacy Gantt shell");
expect(!app.includes("GANTT_LEGACY_MUTATION"), "App must not retain guards for deleted legacy Gantt controls");
expect(app.includes("function ensureGanttPlanningRuntimeProjection()"), "React Gantt must retain the PostgreSQL projection owner");
expect(app.includes("function hasGanttPlanningProjectionReady()"), "React Gantt must retain an explicit projection readiness gate");
expect(app.includes("async function ensureGanttPlanningSnapshotFallback()"), "Immutable-release rollback projection compatibility must remain available");
expect(app.includes("while (planningRuntimeProjectionForceRefreshRequested);"), "Forced projection refresh must remain coalesced");
expect(app.includes("getGanttReactProductionInput()"), "Gantt must build the typed React production payload");
expect(app.includes("ganttReactIslandHost.prepareRender();"), "Gantt route must prepare the React host");
expect(app.includes("void ganttReactIslandHost.mount();"), "Gantt route must mount the React island");
expect(host.includes("canFallbackToLegacy: () => false"), "React Gantt must fail closed without a same-release legacy fallback");
expect(!host.includes("requestLegacyRender"), "React host must not expose a deleted legacy callback");
expect(planningCore.includes("createPlanningWorkingCalendarOwner"), "Planning core must use the shared calendar owner");
expect(planningCore.includes("routeMatchesPlanningGanttFilters"), "Planning core must own Gantt route filtering without the retired renderer");
expect(!planningCore.includes("ganttRuntime"), "Planning core must not depend on a Gantt UI runtime");
expect(planningRoutes.includes("focusPlanningRoute"), "Planning routes must own route-to-Gantt navigation");
expect(!planningRoutes.includes("ganttRuntime"), "Planning routes must not depend on a Gantt UI runtime");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Gantt legacy runtime retirement QA passed");
