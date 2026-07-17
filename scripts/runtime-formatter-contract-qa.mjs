import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatPlanningObjectCount,
  formatPlanningOperationCount,
  formatPlanningProblemCount,
  formatRussianCount,
} from "../src/ui/formatters.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  formatters: path.join(rootDir, "src", "ui", "formatters.js"),
  planningWorkbench: path.join(rootDir, "src", "modules", "planning_workbench", "render.js"),
  planningRoutes: path.join(rootDir, "src", "modules", "planning_routes", "service.js"),
  shiftMasterBoard: path.join(rootDir, "src", "modules", "shift_master_board", "render.js"),
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, file]) => [key, await fs.readFile(file, "utf8")]),
));
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(source.formatters.includes("export function formatRussianCount"), "formatRussianCount must be a shared export");
expect(source.formatters.includes("export function formatPlanningOperationCount"), "formatPlanningOperationCount must be a shared export");
expect(source.formatters.includes("export function formatPlanningProblemCount"), "formatPlanningProblemCount must be a shared export");
expect(source.formatters.includes("export function formatPlanningObjectCount"), "formatPlanningObjectCount must be a shared export");

expect(source.planningWorkbench.includes('from "../../ui/formatters.js"'), "planning_workbench must import shared planning count formatters");
expect(source.planningRoutes.includes('import { formatPlanningOperationCount } from "../../ui/formatters.js";'), "planning_routes must import the shared operation formatter");
expect(
  /import\s*\{[^}]*\bformatPlanningOperationCount\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/ui\/formatters\.js["'];/.test(source.shiftMasterBoard),
  "shift_master_board must import the shared operation formatter",
);

for (const [name, moduleSource] of Object.entries({
  planningWorkbench: source.planningWorkbench,
  planningRoutes: source.planningRoutes,
  shiftMasterBoard: source.shiftMasterBoard,
})) {
  expect(!new RegExp(`function\\s+formatPlanning(?:Object|Operation|Problem)Count\\s*\\(`).test(moduleSource), `${name} must not define a local planning count formatter`);
}

const formatterCases = [
  [formatPlanningOperationCount, 1, "1 операция"],
  [formatPlanningOperationCount, 2, "2 операции"],
  [formatPlanningOperationCount, 5, "5 операций"],
  [formatPlanningOperationCount, 11, "11 операций"],
  [formatPlanningProblemCount, 3, "3 проблемы"],
  [formatPlanningObjectCount, 21, "21 объект"],
  [formatRussianCount, 0, "0"],
];
formatterCases.forEach(([formatter, value, expected]) => {
  expect(formatter(value, formatter === formatRussianCount ? ["", "", ""] : undefined) === expected, `formatter output mismatch: ${value} -> ${expected}`);
});

console.log("MES Runtime Formatter Contract QA");
console.log("- shared formatter module: present");
console.log("- planning_workbench, planning_routes, shift_master_board: shared import ownership checked");
console.log(`- behavior cases: ${formatterCases.length}`);
if (failures.length) {
  console.error("Failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("OK: runtime formatter dependencies are explicit and guarded.");
