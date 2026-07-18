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
