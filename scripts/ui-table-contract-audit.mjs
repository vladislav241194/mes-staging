import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const appPath = path.join(rootDir, "src", "app.js");

const source = await fs.readFile(appPath, "utf8");

function getLineNumber(index) {
  return source.slice(0, index).split("\n").length;
}

function getWindow(index, before = 1400, after = 700) {
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + after));
}

function normalizeSnippet(value = "") {
  return value.trim().replace(/\s+/g, " ").slice(0, 260);
}

const documentedExceptions = [
  {
    id: "print-table",
    reason: "Print forms use isolated route-print-table markup outside runtime TableWrap.",
    test: (context) => /route-print-table|print-(?:info|quantity|executors|composition|operations|registry|transfer)-table|work-order-print/.test(context),
  },
  {
    id: "visual-system-sample",
    reason: "UI states page contains tiny comparison sample tables, not production data tables.",
    test: (context) => /visual-selected-row-option|visual-snapshot-table|Вариант выделения строки/.test(context),
  },
];

function classifyTable(index) {
  const context = getWindow(index);
  const hasHelper = /renderUiTableWrap\s*\(/.test(context);
  const hasMarker = /data-ui-component=["']TableWrap["']/.test(context);
  if (hasHelper || hasMarker) return { status: "contract", reason: hasHelper ? "renderUiTableWrap" : "data-ui-component=TableWrap" };
  const exception = documentedExceptions.find((item) => item.test(context));
  if (exception) return { status: "exception", reason: exception.id };
  return { status: "violation", reason: "missing TableWrap contract" };
}

const tables = [...source.matchAll(/<table\b/g)].map((match) => {
  const index = match.index || 0;
  const context = getWindow(index, 120, 220);
  const classMatch = context.match(/class=["']([^"']+)/);
  const classification = classifyTable(index);
  return {
    line: getLineNumber(index),
    className: classMatch?.[1] || "",
    snippet: normalizeSnippet(context),
    ...classification,
  };
});

const tableLikeClassMatches = [...source.matchAll(/class(?:Name)?\s*[:=]\s*["'`]([^"'`]*(?:table|table-wrap|tree-table|matrix-table)[^"'`]*)["'`]/g)]
  .map((match) => {
    const index = match.index || 0;
    const context = getWindow(index);
    const hasHelper = /renderUiTableWrap\s*\(/.test(context);
    const hasMarker = /data-ui-component=["']TableWrap["']/.test(context);
    const exception = documentedExceptions.find((item) => item.test(context));
    const className = match[1];
    const isTableWrapClass = /(?:^|\s)(?:ui-table-wrap|[^"\s]+-table-wrap)(?:\s|$)/.test(className);
    const isPlainTableClass = /(?:^|\s)[^"\s]+-table(?:\s|$)|(?:^|\s)[^"\s]+-matrix(?:\s|$)/.test(className);
    const status = hasHelper || hasMarker
      ? "contract"
      : exception
        ? "exception"
        : isTableWrapClass || isPlainTableClass
          ? "violation"
          : "class-only";
    return {
      line: getLineNumber(index),
      className,
      status,
      reason: hasHelper ? "renderUiTableWrap" : hasMarker ? "data-ui-component=TableWrap" : exception?.id || "missing TableWrap contract",
    };
  });

const contractTables = tables.filter((item) => item.status === "contract");
const exceptionTables = tables.filter((item) => item.status === "exception");
const violatingTables = tables.filter((item) => item.status === "violation");
const violatingClassPatterns = tableLikeClassMatches.filter((item) => item.status === "violation");

console.log("MES UI Table Contract Audit");
console.log(`Tables found: ${tables.length}`);
console.log(`Tables under TableWrap: ${contractTables.length}`);
console.log(`Documented table exceptions: ${exceptionTables.length}`);
console.log(`Table contract violations: ${violatingTables.length}`);
console.log(`Table-like class patterns checked: ${tableLikeClassMatches.length}`);
console.log(`Table-like class violations: ${violatingClassPatterns.length}`);

if (exceptionTables.length) {
  console.log("\nDocumented exceptions:");
  exceptionTables.forEach((item) => {
    console.log(`- src/app.js:${item.line} ${item.reason} ${item.className || ""}`.trim());
  });
}

if (violatingTables.length || violatingClassPatterns.length) {
  console.error("\nTable contract failures:");
  violatingTables.forEach((item) => {
    console.error(`- table src/app.js:${item.line} ${item.reason}: ${item.snippet}`);
  });
  violatingClassPatterns.forEach((item) => {
    console.error(`- class src/app.js:${item.line} ${item.reason}: ${item.className}`);
  });
  process.exit(1);
}

console.log("\nOK: production table literals are wrapped by TableWrap or documented as print/visual exceptions.");
