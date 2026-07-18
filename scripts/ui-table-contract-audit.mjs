import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findTableWrapHelperCall, getTableWrapHelperNames, runTableWrapAliasRegressionChecks } from "./table-wrap-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appPath = path.join(rootDir, "src", "app.js");
const modulesDir = path.join(rootDir, "src", "modules");

async function listRuntimeSources(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRuntimeSources(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  }));
  return nested.flat();
}

const runtimePaths = [appPath, ...(await listRuntimeSources(modulesDir))];
const runtimeSources = await Promise.all(runtimePaths.map(async (filePath) => ({
  filePath,
  relativePath: path.relative(rootDir, filePath),
  source: await fs.readFile(filePath, "utf8"),
})));

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function getWindow(source, index, before = 1400, after = 700) {
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + after));
}

function normalizeSnippet(value = "") {
  return value.trim().replace(/\s+/g, " ").slice(0, 260);
}

runTableWrapAliasRegressionChecks();

const documentedExceptions = [
  {
    id: "print-table",
    component: "PrintTable",
    kind: "print-table",
    reason: "Print forms use isolated route-print-table markup outside runtime TableWrap.",
    test: (context) => /data-ui-component=["']PrintTable["']|route-print-table|print-(?:info|quantity|executors|composition|operations|registry|transfer)-table|work-order-print/.test(context),
  },
  {
    id: "visual-system-sample",
    component: "VisualSampleTable",
    kind: "visual-sample-table",
    reason: "UI states page contains tiny comparison sample tables, not production data tables.",
    test: (context) => /data-ui-component=["']VisualSampleTable["']|visual-selected-row-option|visual-snapshot-table|Вариант выделения строки/.test(context),
  },
];

function classifyTable(source, index, helperNames) {
  const context = getWindow(source, index);
  const helperName = findTableWrapHelperCall(source, index, helperNames);
  const hasMarker = /data-ui-component=["']TableWrap["']/.test(context);
  if (helperName || hasMarker) return { status: "contract", reason: helperName || "data-ui-component=TableWrap" };
  const exception = documentedExceptions.find((item) => item.test(context));
  if (exception) return { status: "non-production-exception", reason: exception.id, component: exception.component, kind: exception.kind };
  return { status: "violation", reason: "missing TableWrap contract" };
}

const expectedAliasedRenderers = [
  "src/modules/planning_table/render.js",
  "src/modules/visual_system/render.js",
];

runtimeSources.forEach((runtimeSource) => {
  runtimeSource.tableWrapHelperNames = getTableWrapHelperNames(runtimeSource.source);
});

expectedAliasedRenderers.forEach((relativePath) => {
  const runtimeSource = runtimeSources.find((item) => item.relativePath === relativePath);
  if (!runtimeSource || runtimeSource.tableWrapHelperNames.size < 2) {
    throw new Error(`TableWrap alias regression failed: ${relativePath} must expose a destructured renderUiTableWrap alias`);
  }
  const tableIndex = runtimeSource.source.indexOf("<table");
  if (tableIndex < 0 || !findTableWrapHelperCall(runtimeSource.source, tableIndex, runtimeSource.tableWrapHelperNames)) {
    throw new Error(`TableWrap alias regression failed: ${relativePath} must use its destructured alias to wrap its first table`);
  }
});

const tables = runtimeSources.flatMap(({ relativePath, source, tableWrapHelperNames }) => (
  [...source.matchAll(/<table\b/g)].map((match) => {
    const index = match.index || 0;
    const context = getWindow(source, index, 120, 220);
    const classMatch = context.match(/class=["']([^"']+)/);
    const classification = classifyTable(source, index, tableWrapHelperNames);
    return {
      file: relativePath,
      line: getLineNumber(source, index),
      className: classMatch?.[1] || "",
      snippet: normalizeSnippet(context),
      ...classification,
    };
  })
));

const tableLikeClassMatches = runtimeSources.flatMap(({ relativePath, source, tableWrapHelperNames }) => (
  [...source.matchAll(/class(?:Name)?\s*[:=]\s*["'`]([^"'`]*(?:table|table-wrap|tree-table|matrix-table)[^"'`]*)["'`]/g)]
    .map((match) => {
      const index = match.index || 0;
      const context = getWindow(source, index);
      const helperName = findTableWrapHelperCall(source, index, tableWrapHelperNames);
      const hasMarker = /data-ui-component=["']TableWrap["']/.test(context);
      const exception = documentedExceptions.find((item) => item.test(context));
      const className = match[1];
      const isTableWrapClass = /(?:^|\s)(?:ui-table-wrap|[^"\s]+-table-wrap)(?:\s|$)/.test(className);
      const isPlainTableClass = /(?:^|\s)[^"\s]+-table(?:\s|$)|(?:^|\s)[^"\s]+-matrix(?:\s|$)/.test(className);
      const status = helperName || hasMarker
        ? "contract"
        : exception
          ? "non-production-exception"
          : isTableWrapClass || isPlainTableClass
            ? "violation"
            : "class-only";
      return {
        file: relativePath,
        line: getLineNumber(source, index),
        className,
        status,
        reason: helperName || hasMarker ? helperName || "data-ui-component=TableWrap" : exception?.id || "missing TableWrap contract",
        component: exception?.component || "",
        kind: exception?.kind || "",
      };
    })
));

const contractTables = tables.filter((item) => item.status === "contract");
const nonProductionExceptionTables = tables.filter((item) => item.status === "non-production-exception");
const violatingTables = tables.filter((item) => item.status === "violation");
const violatingClassPatterns = tableLikeClassMatches.filter((item) => item.status === "violation");
const exceptionsByKind = nonProductionExceptionTables.reduce((accumulator, item) => {
  const key = item.kind || item.reason || "unknown";
  accumulator[key] = (accumulator[key] || 0) + 1;
  return accumulator;
}, {});

console.log("MES UI Table Contract Audit");
console.log(`Runtime source files scanned: ${runtimeSources.length}`);
console.log(`Tables found: ${tables.length}`);
console.log(`Tables under TableWrap: ${contractTables.length}`);
console.log(`Production table exceptions: ${violatingTables.length}`);
console.log(`Documented non-production exceptions: ${nonProductionExceptionTables.length}`);
console.log(`PrintTable exceptions: ${exceptionsByKind["print-table"] || 0}`);
console.log(`VisualSampleTable exceptions: ${exceptionsByKind["visual-sample-table"] || 0}`);
console.log(`Table contract violations: ${violatingTables.length}`);
console.log(`Table-like class patterns checked: ${tableLikeClassMatches.length}`);
console.log(`Table-like class violations: ${violatingClassPatterns.length}`);

if (nonProductionExceptionTables.length) {
  console.log("\nDocumented non-production exceptions:");
  nonProductionExceptionTables.forEach((item) => {
    console.log(`- ${item.file}:${item.line} ${item.component || item.reason} ${item.className || ""}`.trim());
  });
}

if (violatingTables.length || violatingClassPatterns.length) {
  console.error("\nTable contract failures:");
  violatingTables.forEach((item) => {
    console.error(`- table ${item.file}:${item.line} ${item.reason}: ${item.snippet}`);
  });
  violatingClassPatterns.forEach((item) => {
    console.error(`- class ${item.file}:${item.line} ${item.reason}: ${item.className}`);
  });
  process.exit(1);
}

console.log("\nOK: production table literals are wrapped by TableWrap; print/visual tables are explicitly classified.");
