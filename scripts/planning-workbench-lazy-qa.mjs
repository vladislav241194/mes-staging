import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const appEventsSource = await readFile(resolve(process.cwd(), "src/modules/app_events/service.js"), "utf8");
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
expect(source.includes('onPlanningBootstrap: () => hydratePlanningWorkbenchBootstrap()'), "Planning startup must use the compact bootstrap instead of the full runtime projection.");
expect(appEventsSource.includes('ensurePlanningRuntimeProjection = async () => false'), "Scheduling must declare the on-demand runtime-projection dependency.");
expect(appEventsSource.includes('const projectionReady = await ensurePlanningRuntimeProjection();'), "Scheduling must load the complete projection only immediately before placement.");
if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Planning Workbench lazy-load QA passed");
