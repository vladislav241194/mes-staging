import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(resolve(process.cwd(), "src/app.js"), "utf8");
const retiredRenderer = resolve(process.cwd(), "src/modules/shift_master_board/render.js");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const retiredRendererIsAbsent = await access(retiredRenderer).then(() => false, () => true);

expect(retiredRendererIsAbsent,
  "retired renderer Мастерской должен быть физически удалён из current release");
expect(!source.includes("modules/shift_master_board/render.js"),
  "app.js не должен сохранять import retired renderer Мастерской");
expect(!source.includes("initializeShiftMasterBoardModule")
  && !source.includes("ensureShiftMasterBoardModule"),
"app.js не должен сохранять factory/loader retired renderer Мастерской");
expect(source.includes("createShiftMasterBoardCommandOwner")
  && source.includes("return shiftMasterBoardCommandOwner.getModel();"),
"общая production-модель Мастерской должна принадлежать command owner");
const shiftBoardRouteStart = source.indexOf("    shiftMasterBoard: {\n      render: () => {");
const shiftBoardRouteEnd = source.indexOf("    shiftWorkOrders: {", shiftBoardRouteStart);
const shiftBoardRoute = shiftBoardRouteStart >= 0 && shiftBoardRouteEnd > shiftBoardRouteStart
  ? source.slice(shiftBoardRouteStart, shiftBoardRouteEnd)
  : "";
expect(Boolean(shiftBoardRoute), "current route Мастерской должен иметь проверяемую границу");
expect(shiftBoardRoute.includes("shiftMasterBoardReactIslandHost.prepareRender();")
  && shiftBoardRoute.includes("return shiftMasterBoardReactIslandHost.renderTarget();"),
"current route Мастерской должен всегда возвращать fail-closed React target");
expect(!shiftBoardRoute.includes("renderShiftMasterBoardPage")
  && !shiftBoardRoute.includes("bindShiftMasterBoardEvents"),
"retired renderer Мастерской не должен быть same-release UI fallback текущего маршрута");
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
