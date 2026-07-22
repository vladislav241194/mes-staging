import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppEventsServiceModule } from "../src/modules/app_events/service.js";

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const appPath = join(root, "src", "app.js");
const appEventsPath = join(root, "src", "modules", "app_events", "service.js");
const appInteractionsPath = join(root, "src", "modules", "app_interactions", "render.js");
const directoryLegacyPath = join(root, "src", "modules", "app_interactions", "directory_legacy.js");
const appSource = await readFile(appPath, "utf8");
const appEventsSource = await readFile(appEventsPath, "utf8");
const appInteractionsSource = await readFile(appInteractionsPath, "utf8");
const directoryLegacySource = await readFile(directoryLegacyPath, "utf8");

assert(
  !appSource.includes('import { createRoutesEventsModule } from "./modules/routes/events.js";'),
  "Route events must not remain a static application import",
);
assert(
  appSource.includes('loadRoutesEventsModule: () => import("./modules/routes/events.js")'),
  "App must pass a dedicated dynamic loader for route event handlers",
);
assert(
  appSource.includes('import("./modules/routes/render.js"),\n    ensureRoutesEvents(),'),
  "Directories must wait for route event initialization before publishing their renderer",
);
assert(
  appEventsSource.includes("loadRoutesEventsModule ="),
  "App event service must accept the route event loader",
);
assert(
  appEventsSource.includes("function ensureRoutesEvents()"),
  "App event service must expose a single-flight route event loader",
);
assert(
  appEventsSource.includes("if (routesEventsApi) return Promise.resolve(routesEventsApi);"),
  "Route event runtime must reuse the initialized API",
);
assert(
  appEventsSource.includes("if (!routesEventsLoad)"),
  "Concurrent route event loads must coalesce",
);
assert(
  !appEventsSource.includes("} = createRoutesEventsModule({"),
  "Route event factory must not be constructed during application boot",
);
assert(
  appInteractionsSource.includes('import("./directory_legacy.js")')
    && appInteractionsSource.includes("directoryLegacyInteractionsApi.bindDenseInlineSelectViewportEvents?.();")
    && appEventsSource.includes("Promise.resolve().then(() => ensureDirectoryLegacyInteractions())"),
  "Legacy Directory modal/bind handlers must load through the existing routes single-flight boundary",
);
assert(
  !appInteractionsSource.includes("directory-editor-form-grid")
    && !appInteractionsSource.includes("[data-add-directory]")
    && !appInteractionsSource.includes('document.querySelectorAll(".dense-inline-select[open]")')
    && !appInteractionsSource.includes('options.style.setProperty("--dense-popover-left"'),
  "Legacy Directory markup, DOM bindings, and dense select positioning must not remain in the static interaction shell",
);
assert(
  directoryLegacySource.includes("createDirectoryLegacyInteractions")
    && directoryLegacySource.includes("directory-editor-form-grid")
    && directoryLegacySource.includes("[data-add-directory]")
    && directoryLegacySource.includes("function bindDirectoryForm()")
    && directoryLegacySource.includes("function deleteDirectoryRow(sectionId, rowIndex)")
    && directoryLegacySource.includes("function bindDenseInlineSelectViewportEvents()")
    && directoryLegacySource.includes('options.style.setProperty("--dense-popover-left"'),
  "The lazy Directory interaction chunk must retain rollback modal, binding, and dense select behavior",
);
assert(
  !appEventsSource.includes('const form = app.querySelector("#directoryForm")')
    && !appEventsSource.includes("function deleteDirectoryRow(sectionId, rowIndex)"),
  "Legacy Directory form and generic delete workflows must not remain in the static event service",
);
assert(
  appEventsSource.includes("function saveDirectoryRow(sectionId, rowIndex, row, options = {})")
    && appEventsSource.includes("function deleteDirectoryStateRow(sectionId, row)"),
  "The shared React Directory mutation core must remain available without loading the rollback UI",
);

let routeRuntimeLoadCount = 0;
let interactionsDependencies = null;
let persistCount = 0;
let renderCount = 0;
const ui = {};
const planningState = {
  routes: [],
  routeSteps: [{ id: "route-step-1", routeId: "route-1", specTaskId: "task-1" }],
  slots: [],
};
const directoryState = {
  operationMap: [{
    id: "warehouse-receipt",
    name: "Приемка результата",
    workCenterId: "warehouse",
    isWarehouse: true,
    coverage: "ready",
  }],
};
const noopInteractions = new Proxy({}, { get: () => () => undefined });
const app = {
  firstElementChild: {},
  querySelector: () => null,
  querySelectorAll: () => [],
};

const service = createAppEventsServiceModule({
  app,
  createAppInteractionsModule: (dependencies) => {
    interactionsDependencies = dependencies;
    return noopInteractions;
  },
  loadRoutesEventsModule: async () => {
    routeRuntimeLoadCount += 1;
    return import(new URL("../src/modules/routes/events.js", import.meta.url));
  },
  getUi: () => ui,
  getPlanningState: () => planningState,
  getDirectoryState: () => directoryState,
  getOperationMapRows: () => directoryState.operationMap,
  getOperationRouteWorkCenterId: (operation = {}) => operation.workCenterId || "",
  isManufacturingOutputReceiptOperation: (operation = {}) => operation.id === "warehouse-receipt",
  isWarehouseWorkCenterId: (workCenterId = "") => workCenterId === "warehouse",
  getRouteStepsForModule: (routeId = "") => planningState.routeSteps.filter((step) => step.routeId === routeId),
  getRouteStepTaskId: (step = {}) => step.specTaskId || "",
  isManufacturingOutputReceiptRouteStep: () => false,
  withPlanningEntityRemovalAllowed: (callback) => callback(),
  persistState: () => { persistCount += 1; },
  notifySaveSuccess: () => {},
  render: () => { renderCount += 1; },
});

assert(
  service.getDefaultOperationMapItemForRouteKind("warehouse") === null,
  "Route helper must remain unavailable before the lazy runtime is admitted",
);
assert(routeRuntimeLoadCount === 0, "Cold boot must not load route event handlers");

const [firstApi, secondApi] = await Promise.all([
  service.ensureRoutesEvents(),
  service.ensureRoutesEvents(),
]);
assert(firstApi === secondApi, "Concurrent route event loads must resolve to one runtime API");
assert(routeRuntimeLoadCount === 1, "Route event runtime must load exactly once");

const warehouseReceipt = service.getDefaultOperationMapItemForRouteKind("warehouse");
assert(warehouseReceipt?.id === "warehouse-receipt", "Loaded route runtime must provide the synchronous renderer helper");
assert(typeof interactionsDependencies?.deleteRouteStepConfirmed === "function", "Route deletion must remain a synchronous interaction dependency");
interactionsDependencies.deleteRouteStepConfirmed("route-step-1");
assert(planningState.routeSteps.length === 0, "Loaded route deletion handler must mutate the active route state synchronously");
assert(persistCount === 1 && renderCount === 1, "Loaded route deletion handler must preserve persistence and render side effects");

// A build emits a separate dynamic chunk. Keep this optional so the narrow
// source-level check remains useful before the first build in a fresh clone.
try {
  const bundledApp = await readFile(join(root, "dist", "src", "app.js"), "utf8");
  const chunkDir = join(root, "dist", "src", "chunks");
  const chunkEntries = await readdir(chunkDir);
  const chunkSources = await Promise.all(chunkEntries
    .filter((entry) => entry.endsWith(".js"))
    .map(async (entry) => ({ entry, source: await readFile(join(chunkDir, entry), "utf8") })));
  const routesEventsChunk = chunkSources.find(({ source }) => source.includes("createRoutesEventsModule"));
  assert(routesEventsChunk, "A dynamic chunk must contain the route event factory");
  assert(
    bundledApp.includes(`./chunks/${routesEventsChunk.entry}`),
    "Boot bundle must reach route event handlers only through their dynamic chunk",
  );
  const directoryLegacyChunk = chunkSources.find(({ source }) => source.includes("createDirectoryLegacyInteractions"));
  assert(directoryLegacyChunk, "A dynamic chunk must contain the rollback-only Directory interactions");
  assert(!bundledApp.includes("data-add-directory"), "Boot bundle must not inline legacy Directory bindings");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Routes events lazy-load QA passed");
