import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const appEventsSource = await readFile(resolve(process.cwd(), "src/modules/app_events/service.js"), "utf8");
const readModelSource = await readFile(resolve(process.cwd(), "src/modules/domain_api/work_orders_read_model.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
expect(!source.includes('import { createPlanningWorkbenchModule } from "./modules/planning_workbench/render.js";'), "Planning Workbench must not remain a static app import");
expect(source.includes('import("./modules/planning_workbench/render.js")'), "Planning Workbench must load as a dynamic module");
expect(source.includes('title: "Загружаем заказ-наряды"'), "Planning Workbench needs a visible loading state");
expect(source.includes('function renderPlanningWorkbenchShellState'), "Planning Workbench loading and failure states must preserve the planning shell contract");
expect(source.includes('sidebar: renderUiModuleSidebar({'), "Planning Workbench loading state must provide its required ModuleSidebar slot");
expect(source.includes('header: renderUiModuleHeader({'), "Planning Workbench loading state must provide its required ModuleHeader slot");
expect(source.includes('if (ui.activeModule === "planning") render({ skipRememberScroll: true });'), "Planning Workbench must rerender the active screen after lazy load");
expect(source.includes('async function hydratePlanningWorkbenchBootstrap'), "Planning needs a compact server bootstrap for its list and selected order.");
expect(source.includes('workOrdersReadModel.refreshWorkbenchBootstrap(requestedActiveRouteId, { force })'), "Planning startup must request list and selected detail through one server bootstrap.");
expect(!source.includes('function hydratePlanningWorkOrderDetail('), "Planning must not race its compact bootstrap with the retired direct-detail loader.");
expect(source.includes('if (String(ui.activeRouteId || "") !== requestedActiveRouteId) return true;'), "A stale bootstrap response must not restore an earlier route selection.");
expect(source.includes('hydratePlanningWorkOrderReadModel();\n  const currentPage = app.querySelector'), "A route click must request the newly selected aggregate through the compact bootstrap.");
expect(source.includes("await restorePlanningWorkbenchSnapshotFallback();"), "A deferred Planning entry must retain the runtime-owned compatibility fallback.");
expect(!source.includes("if (restored && renderOnChange && ui.activeModule === \"planning\") render({ skipRememberScroll: true });"), "Planning fallback must not trigger a duplicate full render after runtime state already applied the snapshot.");
expect(readModelSource.includes('async function refreshWorkbenchBootstrap(activeId = "", { force = false } = {})'), "Work-order read model must expose the combined workbench bootstrap reader.");
expect(readModelSource.includes('`${url}/bootstrap${params}`'), "Workbench bootstrap must use the dedicated one-request endpoint.");
expect(readModelSource.includes('bootstrapEntries: new Map()') && readModelSource.includes('bootstrapLoading: new Map()'), "Independent selections must retain keyed bootstrap cache and in-flight requests.");
expect(source.includes('async function hydrateInitialPlanningServerBootstrap()'), "Initial Planning bootstrap must choose a server projection by the active module.");
expect(/if \(ui\?\.activeModule === "gantt"\) \{\s*const applied = await hydratePlanningRuntimeProjection\(\);/.test(source), "A direct Gantt boot must request the PostgreSQL runtime projection before the compatibility snapshot.");
expect(source.includes('return hydratePlanningWorkbenchBootstrap();'), "Planning startup must retain the compact workbench bootstrap outside Gantt.");
expect(source.includes('onPlanningBootstrap: () => hydrateInitialPlanningServerBootstrap()'), "Runtime-state startup must use the module-aware Planning server bootstrap.");
expect(source.includes('onPlanningSnapshotSynchronized: () => hydratePlanningAfterSharedSync()'), "A successful Gantt bootstrap must not immediately start a redundant workbench request.");
expect(appEventsSource.includes('ensurePlanningRuntimeProjection = async () => false'), "Scheduling must declare the on-demand runtime-projection dependency.");
expect(appEventsSource.includes('const projectionReady = await ensurePlanningRuntimeProjection();'), "Scheduling must load the complete projection only immediately before placement.");
if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Planning Workbench lazy-load QA passed");
