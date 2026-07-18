import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const authEventsSource = await readFile(resolve(process.cwd(), "src/modules/auth_render/events.js"), "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(!source.includes('import { createShiftMasterBoardModule } from "./modules/shift_master_board/render.js";'),
  "Мастерская не должна оставаться статическим импортом стартового app.js");
expect(source.includes('import("./modules/shift_master_board/render.js")'),
  "Мастерская должна загружаться отдельным динамическим модулем");
expect(source.includes('title: "Загружаем мастерскую"'),
  "до загрузки Мастерской должен быть понятный экран ожидания");
const shiftBoardShellStart = source.indexOf("function renderShiftMasterBoardShellState");
const shiftBoardShellEnd = source.indexOf("renderShiftMasterBoardSheetModal", shiftBoardShellStart);
const shiftBoardShell = shiftBoardShellStart >= 0 && shiftBoardShellEnd > shiftBoardShellStart
  ? source.slice(shiftBoardShellStart, shiftBoardShellEnd)
  : "";
expect(Boolean(shiftBoardShell),
  "Мастерская должна иметь единый shell для lazy loading и ошибки загрузки");
expect(shiftBoardShell.includes('header: renderUiModuleHeader({'),
  "loading/error shell Мастерской обязан содержать ModuleHeader по blueprint-контракту");
expect(source.includes('return renderShiftMasterBoardShellState({\n            title: "Не удалось загрузить мастерскую"'),
  "ошибка lazy загрузки Мастерской должна использовать тот же blueprint-valid shell");
expect(source.includes('if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true });'),
  "после загрузки Мастерской должен выполняться повторный рендер активного экрана");
expect(!source.includes('import { createShiftExecutionReadModel } from "./modules/domain_api/shift_execution_read_model.js";'),
  "server read API Мастерской не должен оставаться статическим импортом стартового app.js");
expect(!source.includes('import { createShiftExecutionCommands } from "./modules/domain_api/shift_execution_commands.js";'),
  "server command API Мастерской не должен оставаться статическим импортом стартового app.js");
expect(!source.includes('import("./modules/domain_api/shift_execution_read_model.js")'),
  "устаревший общий server read API Мастерской не должен загружаться из app.js");
expect(source.includes('import("./modules/domain_api/shift_execution_dispatch_read_model.js")'),
  "компактный server dispatch API Мастерской должен загружаться лениво");
expect(source.includes('import("./modules/domain_api/shift_execution_commands.js")'),
  "server command API Мастерской должен загружаться лениво");
expect(source.includes("function ensureShiftExecutionDomainApiModule()"),
  "server bridge Мастерской должен иметь single-flight ленивый загрузчик");

const authEventsInitializationStart = source.indexOf("function initializeAuthEventsModule");
const authEventsInitializationEnd = source.indexOf("function ensureAuthEventsModule", authEventsInitializationStart);
const authEventsInitialization = authEventsInitializationStart >= 0 && authEventsInitializationEnd > authEventsInitializationStart
  ? source.slice(authEventsInitializationStart, authEventsInitializationEnd)
  : "";
expect(Boolean(authEventsInitialization),
  "инициализация событий Рабочего стола должна существовать");
expect(authEventsInitialization.includes("saveShiftMasterBoardFact: async (...args) => {"),
  "Рабочий стол должен получать факт через ленивый resolver Мастерской, а не захватывать пустую ссылку при bootstrap");
expect(authEventsInitialization.includes("await ensureShiftMasterBoardModule()"),
  "ленивый resolver факта Рабочего стола должен загрузить Мастерскую до записи общего факта");
expect(authEventsSource.includes("async function saveAuthSessionTaskFact(taskId = \"\")"),
  "сохранение факта Рабочего стола должно ожидать ленивую запись общего слоя");
expect(authEventsSource.includes("await saveShiftMasterBoardFact(task.rowId, {"),
  "Рабочий стол должен завершать запись факта до повторного рендера");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("Shift Master Board lazy-load QA passed");
