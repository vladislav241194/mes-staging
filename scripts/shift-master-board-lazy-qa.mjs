import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
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

expect(!source.includes("function initializeAuthEventsModule"),
  "current runtime не должен сохранять инициализацию legacy Auth events");
expect(!source.includes("function ensureAuthEventsModule"),
  "current runtime не должен сохранять loader legacy Auth events");
expect(!source.includes('import("./modules/auth_render/events.js")'),
  "legacy Auth events chunk не должен загружаться current runtime");

const employeeDesktopOwnerStart = source.indexOf("function ensureEmployeeDesktopCommandOwner()");
const employeeDesktopOwnerEnd = source.indexOf("function getEmployeeDesktopReactActivation", employeeDesktopOwnerStart);
const employeeDesktopOwner = employeeDesktopOwnerStart >= 0 && employeeDesktopOwnerEnd > employeeDesktopOwnerStart
  ? source.slice(employeeDesktopOwnerStart, employeeDesktopOwnerEnd)
  : "";
expect(Boolean(employeeDesktopOwner),
  "Рабочий стол должен иметь отдельный ленивый command owner");
expect(employeeDesktopOwner.includes('import("./modules/employee_desktop/command_owner.js")'),
  "command owner Рабочего стола должен загружаться отдельным динамическим модулем");

const employeeDesktopHostStart = source.indexOf("const employeeDesktopReactIslandHost");
const employeeDesktopHostEnd = source.indexOf("const markingApiClient", employeeDesktopHostStart);
const employeeDesktopHost = employeeDesktopHostStart >= 0 && employeeDesktopHostEnd > employeeDesktopHostStart
  ? source.slice(employeeDesktopHostStart, employeeDesktopHostEnd)
  : "";
expect(employeeDesktopHost.includes("await ensureEmployeeDesktopCommandOwner()"),
  "React Рабочий стол должен ожидать отдельного command owner перед локальными командами");
expect(employeeDesktopHost.includes("shiftExecutionCommands.recordIssueReport"),
  "React Рабочий стол должен сохранять Report через server command owner");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("Shift Master Board lazy-load QA passed");
