import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  formatters: path.join(rootDir, "src", "ui", "formatters.ts"),
  appInteractions: path.join(rootDir, "src", "modules", "app_interactions", "render.js"),
  planningRoutes: path.join(rootDir, "src", "modules", "planning_routes", "service.js"),
  productsCompatibility: path.join(rootDir, "src", "modules", "products", "compatibility_runtime.js"),
  operationalRuntime: path.join(rootDir, "src", "modules", "operational_runtime", "service.js"),
  shiftWorkOrdersJournal: path.join(rootDir, "src", "modules", "shift_work_orders", "journal_owner.ts"),
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
));

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mes-runtime-formatters-"));
let formatters;
try {
  const output = path.join(temporaryRoot, "formatters.mjs");
  await build({
    entryPoints: [files.formatters],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });
  formatters = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

const {
  formatDecimalNumber,
  formatPersonDisplayName,
  formatPlanningObjectCount,
  formatPlanningOperationCount,
  formatPlanningProblemCount,
  formatRussianCount,
} = formatters;
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(source.formatters.includes("export function formatDecimalNumber"), "formatDecimalNumber must be a shared export");
expect(source.formatters.includes("export function formatRussianCount"), "formatRussianCount must be a shared export");
expect(source.formatters.includes("export function formatPlanningOperationCount"), "formatPlanningOperationCount must be a shared export");
expect(source.formatters.includes("export function formatPlanningProblemCount"), "formatPlanningProblemCount must be a shared export");
expect(source.formatters.includes("export function formatPlanningObjectCount"), "formatPlanningObjectCount must be a shared export");
expect(source.formatters.includes("export function formatPersonDisplayName"), "formatPersonDisplayName must be a shared export");

const consumerImports = {
  appInteractions: /import \{ formatDecimalNumber \} from "\.\.\/\.\.\/ui\/formatters\.ts";/,
  planningRoutes: /import \{ formatPlanningOperationCount \} from "\.\.\/\.\.\/ui\/formatters\.ts";/,
  productsCompatibility: /import \{ formatDecimalNumber \} from "\.\.\/\.\.\/ui\/formatters\.ts";/,
  operationalRuntime: /import \{ formatPersonDisplayName \} from "\.\.\/\.\.\/ui\/formatters\.ts";/,
  shiftWorkOrdersJournal: /import \{ formatPersonDisplayName \} from "\.\.\/\.\.\/ui\/formatters\.ts";/,
};
for (const [consumer, importPattern] of Object.entries(consumerImports)) {
  expect(importPattern.test(source[consumer]), `${consumer} must import the typed shared formatter runtime`);
  expect(!source[consumer].includes("ui/formatters.js"), `${consumer} must not retain the retired JavaScript formatter path`);
}

const formatterCases = [
  ["operation:1", formatPlanningOperationCount(1), "1 операция"],
  ["operation:2", formatPlanningOperationCount(2), "2 операции"],
  ["operation:5", formatPlanningOperationCount(5), "5 операций"],
  ["operation:11", formatPlanningOperationCount(11), "11 операций"],
  ["operation:21", formatPlanningOperationCount(21), "21 операция"],
  ["problem:3", formatPlanningProblemCount(3), "3 проблемы"],
  ["object:21", formatPlanningObjectCount(21), "21 объект"],
  ["count:null", formatRussianCount(null), "0"],
  ["count:negative", formatRussianCount(-3, ["item", "items", "items"]), "0 items"],
  ["count:decimal", formatRussianCount(2.9, ["item", "items", "items"]), "2 items"],
  ["decimal:null", formatDecimalNumber(null, 2), "0"],
  ["decimal:round", formatDecimalNumber(1.25, 1), "1,3"],
  ["person:full", formatPersonDisplayName("Иванов Иван Иванович"), "Иванов Иван"],
  ["person:fallback", formatPersonDisplayName(null, { fallback: "Исполнитель" }), "Исполнитель"],
  ["person:non-russian", formatPersonDisplayName("Smith John Junior"), "Smith John Junior"],
];
for (const [label, actual, expected] of formatterCases) {
  expect(actual === expected, `${label}: expected ${expected}, got ${actual}`);
}

console.log("MES Runtime Formatter Contract QA");
console.log("- shared TypeScript formatter module: present and bundled for Node 20");
console.log(`- active formatter consumers: ${Object.keys(consumerImports).length}`);
console.log(`- behavior cases: ${formatterCases.length}`);
if (failures.length) {
  console.error("Failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OK: runtime formatter dependencies and semantics are explicit and guarded.");
}
