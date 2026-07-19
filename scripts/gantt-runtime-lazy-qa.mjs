import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appSource = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const facadeSource = await readFile(resolve(process.cwd(), "src/modules/gantt_runtime/lazy_facade.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(!appSource.includes('import { createGanttRuntimeModule } from "./modules/gantt_runtime/render.js";'), "Gantt runtime must not remain a static app import");
expect(appSource.includes('createLazyGanttRuntimeModule'), "App must use the Gantt lazy facade");
expect(appSource.includes('title: "Загружаем график"'), "Gantt needs a visible loading state");
expect(appSource.includes('ganttRuntime.load()'), "Gantt must request its runtime when the module opens");
expect(appSource.includes('function ensureGanttPlanningRuntimeProjection()'), "Gantt must start its server runtime projection before the lazy renderer reads the legacy graph");
expect(/if \(\["gantt"[^\]]*\]\.includes\(ui\?\.activeModule\)\) \{\s*const applied = await hydratePlanningRuntimeProjection\(\);/.test(appSource), "A cold Gantt boot must prefer the PostgreSQL runtime projection");
expect(appSource.includes('if (planningRuntimeProjectionLoad) return planningRuntimeProjectionLoad;'), "The shared-state handshake and Gantt shell must coalesce one projection request");
expect(appSource.includes('function hasGanttPlanningProjectionReady()'), "Gantt must have an explicit projection-ready gate");
expect(appSource.includes('if (!hasGanttPlanningProjectionReady())'), "Gantt must show its loading shell before the runtime reads route, step, or slot collections");
expect(appSource.indexOf('if (!hasGanttPlanningProjectionReady())') < appSource.indexOf('if (!ganttRuntime.isReady())'), "The projection gate must run before Gantt runtime loading and row construction");
expect(appSource.includes('async function ensureGanttPlanningSnapshotFallback()'), "A Gantt server-read failure must promote the compatibility snapshot explicitly");
expect(appSource.includes('if (planningRuntimeProjectionState.status === "fallback")'), "Gantt must stay on its fallback path instead of starting a second projection read during recovery");
expect(appSource.includes('if (metadataOnly === false)'), "A cold-boot Gantt fallback must wait for runtime-state apply completion, not transport-mode changes");
expect(appSource.includes('ganttPlanningFallbackAwaitingInitialSharedSnapshot'), "A synchronous shared-state apply render must not start a second Gantt fallback while the required cold-boot snapshot is still completing");
expect(appSource.includes('ui?.activeModule === "planning" || ui?.activeModule === "gantt"'), "A deferred Gantt navigation must retry its fallback after shared-state metadata synchronizes");
expect(appSource.includes('while (planningRuntimeProjectionForceRefreshRequested);'), "A forced command refresh must run again after joining an in-flight non-forced projection");
expect(facadeSource.includes('import("./render.js")'), "Lazy facade must dynamically import the Gantt implementation");
expect(facadeSource.includes('Gantt runtime method ${key} was called before it loaded'), "Lazy facade must fail explicitly if a premature Gantt call escapes the loading guard");
expect(facadeSource.includes('key === "then" || key === "catch" || key === "finally"'), "Gantt lazy facade must not become an accidental thenable");

const weeklyCompactPresentationStart = appSource.indexOf("function resolveWeeklyCompactSlotPresentation");
const weeklyCompactPresentationEnd = appSource.indexOf("function clearWeeklyPlanningPeriodRefreshTimer", weeklyCompactPresentationStart);
const weeklyCompactPresentation = weeklyCompactPresentationStart >= 0 && weeklyCompactPresentationEnd > weeklyCompactPresentationStart
  ? appSource.slice(weeklyCompactPresentationStart, weeklyCompactPresentationEnd)
  : "";
expect(Boolean(weeklyCompactPresentation), "Weekly compact presentation resolver must exist");
expect(!weeklyCompactPresentation.includes("getSlotGanttWorkCenterId"), "Weekly compact presentation must not call the lazy Gantt runtime");
expect(!weeklyCompactPresentation.includes("getGanttResourceForSlot"), "Weekly compact presentation must not call the lazy Gantt runtime");

const shiftBoardInitializationStart = appSource.indexOf("function initializeShiftMasterBoardModule");
const shiftBoardInitializationEnd = appSource.indexOf("function ensureShiftMasterBoardModule", shiftBoardInitializationStart);
const shiftBoardInitialization = shiftBoardInitializationStart >= 0 && shiftBoardInitializationEnd > shiftBoardInitializationStart
  ? appSource.slice(shiftBoardInitializationStart, shiftBoardInitializationEnd)
  : "";
expect(Boolean(shiftBoardInitialization), "Shift-board initialization must exist");
expect(shiftBoardInitialization.includes("getSlotRoute: (slot) => getPlanningSlotRoute(slot)"), "Shift board must use the lightweight planning route resolver before Gantt loads");
expect(shiftBoardInitialization.includes("getSlotGanttWorkCenterId: (slot) => getPlanningSlotWorkCenterId(slot)"), "Shift board must use the lightweight planning work-center resolver before Gantt loads");

const operationalRuntimeInitializationStart = appSource.indexOf("operationalRuntimeService = createOperationalRuntimeServiceModule({");
const operationalRuntimeInitializationEnd = appSource.indexOf("appEventsService = createAppEventsServiceModule({", operationalRuntimeInitializationStart);
const operationalRuntimeInitialization = operationalRuntimeInitializationStart >= 0 && operationalRuntimeInitializationEnd > operationalRuntimeInitializationStart
  ? appSource.slice(operationalRuntimeInitializationStart, operationalRuntimeInitializationEnd)
  : "";
expect(Boolean(operationalRuntimeInitialization), "Operational-runtime initialization must exist");
expect(operationalRuntimeInitialization.includes("getSlotRoute: (slot) => getPlanningSlotRoute(slot)"), "Operational runtime must use the lightweight planning route resolver before Gantt loads");
expect(!operationalRuntimeInitialization.includes("getSlotRoute: (...args) => getSlotRoute(...args)"), "Operational runtime must not forward getSlotRoute through the lazy Gantt facade");

const planningRoutesInitializationStart = appSource.indexOf("planningRoutesService = createPlanningRoutesServiceModule({");
const planningRoutesInitializationEnd = appSource.indexOf("function updateModuleUrlParam", planningRoutesInitializationStart);
const planningRoutesInitialization = planningRoutesInitializationStart >= 0 && planningRoutesInitializationEnd > planningRoutesInitializationStart
  ? appSource.slice(planningRoutesInitializationStart, planningRoutesInitializationEnd)
  : "";
expect(Boolean(planningRoutesInitialization), "Planning-routes initialization must exist");
expect(planningRoutesInitialization.includes("focusRoute: (...args) => ganttRuntime?.isReady?.() ? focusRoute(...args) : render(),"), "Cold route-to-Gantt flow must render the loading shell instead of calling the lazy focus facade");
expect(planningRoutesInitialization.includes("snapToWorkingTime: (...args) => ganttRuntime?.isReady?.() ? snapToWorkingTime(...args) : args[1],"), "Cold route scheduling must not call the lazy calendar snap facade");
expect(appSource.includes("getWarningProductionId,\n} from \"./validation.js\";"), "App must import the startup-safe warning production resolver");
expect(planningRoutesInitialization.includes("getWarningProductionId,"), "Planning warnings must use the startup-safe production resolver before Gantt loads");
expect(!planningRoutesInitialization.includes("getWarningProductionId: (...args) => typeof getWarningProductionId"), "Planning warnings must not forward through the lazy Gantt facade");

const planningCoreInitializationStart = appSource.indexOf("planningCoreService = createPlanningCoreServiceModule({");
const planningCoreInitializationEnd = appSource.indexOf("function renderUiAppShell", planningCoreInitializationStart);
const planningCoreInitialization = planningCoreInitializationStart >= 0 && planningCoreInitializationEnd > planningCoreInitializationStart
  ? appSource.slice(planningCoreInitializationStart, planningCoreInitializationEnd)
  : "";
expect(Boolean(planningCoreInitialization), "Planning-core initialization must exist");
expect(planningCoreInitialization.includes("routeMatchesGanttFilters: (...args) => ganttRuntime?.isReady?.() ? routeMatchesGanttFilters(...args) : true,"), "Planning-core must not call Gantt filters before the lazy runtime loads");

const appEventsInitializationStart = appSource.indexOf("appEventsService = createAppEventsServiceModule({");
const appEventsInitializationEnd = appSource.indexOf("function updateClockOnly", appEventsInitializationStart);
const appEventsInitialization = appEventsInitializationStart >= 0 && appEventsInitializationEnd > appEventsInitializationStart
  ? appSource.slice(appEventsInitializationStart, appEventsInitializationEnd)
  : "";
expect(Boolean(appEventsInitialization), "App-events service initialization must exist");
expect(appEventsInitialization.includes("closeModals: () => closeAppModals(),"), "Generic app-events modal close must use the non-Gantt closer before the Gantt chunk loads");
expect(!appEventsInitialization.includes("closeModals: (...args) => closeModals(...args),"), "App-events must not receive the lazy Gantt closeModals facade");
expect(appSource.includes("function closeAppModals()"), "App must provide a shared non-Gantt modal closer");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Gantt runtime lazy-load QA passed");
