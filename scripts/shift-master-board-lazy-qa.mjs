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
expect(source.includes('if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true });'),
  "после загрузки Мастерской должен выполняться повторный рендер активного экрана");
expect(!source.includes('import { createShiftExecutionReadModel } from "./modules/domain_api/shift_execution_read_model.js";'),
  "server read API Мастерской не должен оставаться статическим импортом стартового app.js");
expect(!source.includes('import { createShiftExecutionCommands } from "./modules/domain_api/shift_execution_commands.js";'),
  "server command API Мастерской не должен оставаться статическим импортом стартового app.js");
expect(source.includes('import("./modules/domain_api/shift_execution_read_model.js")'),
  "server read API Мастерской должен загружаться лениво");
expect(source.includes('import("./modules/domain_api/shift_execution_commands.js")'),
  "server command API Мастерской должен загружаться лениво");
expect(source.includes("function ensureShiftExecutionDomainApiModule()"),
  "server bridge Мастерской должен иметь single-flight ленивый загрузчик");

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}

console.log("Shift Master Board lazy-load QA passed");
