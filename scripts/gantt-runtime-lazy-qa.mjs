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

if (failures.length) {
  console.error(failures.map((message) => `FAIL: ${message}`).join("\n"));
  process.exit(1);
}
console.log("Gantt runtime lazy-load QA passed");
