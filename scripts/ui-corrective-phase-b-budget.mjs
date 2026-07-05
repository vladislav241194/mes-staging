import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg ? scopeArg.split("=")[1] : "all";
const writeReport = process.argv.includes("--write-report");

const budgetFiles = {
  duplicate: "scripts/css-duplicate-selector-budget.json",
  status: "scripts/ui-status-badge-budget.json",
  table: "scripts/ui-table-exception-budget.json",
};
const phaseBBaseline = {
  duplicateSelectorGroups: 349,
  largestDuplicateSelectorGroup: 12,
  legacyTailLines: 3961,
  importantUsages: 2905,
  rawHexUsages: 1875,
  borderRadiusPxDeclarations: 199,
  tableExceptions: 10,
  productionTableExceptions: 0,
  nonProductionTableExceptions: 0,
  printTableExceptions: 0,
  visualSampleTableExceptions: 0,
  renderUiStatusTokenCalls: 56,
};
const entryCssFiles = ["styles.css", "styles/mes-ui-core.css"];
const statusSelectorPattern = /(?:status-pill|deadline-badge|mes-signal|readonly-(?:badge|token)|state-token|group-status|role-marker|report-badge|module-menu-badge|supply-status-pill|shift-master-assignment-chip|director-order-chip|speki-section-icon-badge|route-type-icon-badge|route-step-order-badge|chip|badge)/i;
const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g;

function toPosixPath(value = "") {
  return value.split(path.sep).join("/");
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(rootDir, relativePath), "utf8"));
}

function normalizeSelector(selector = "") {
  return selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCssImports(source = "") {
  return [...source.matchAll(/@import\s+(?:url\()?["']([^"')]+?\.css)(?:\?[^"')]+)?["']\)?\s*;/g)]
    .map((match) => match[1]);
}

async function collectCssSources(file, seen = new Set()) {
  const normalizedFile = toPosixPath(file);
  if (seen.has(normalizedFile)) return [];
  seen.add(normalizedFile);

  const source = await fs.readFile(path.join(rootDir, normalizedFile), "utf8");
  const imports = getCssImports(source);
  const importedSources = [];
  for (const specifier of imports) {
    const importedFile = toPosixPath(path.normalize(path.join(path.dirname(normalizedFile), specifier)));
    importedSources.push(...await collectCssSources(importedFile, seen));
  }
  return [{ file: normalizedFile, source }, ...importedSources];
}

function collectRules(source, file) {
  function findMatchingClose(openIndex) {
    let depth = 0;
    for (let index = openIndex; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  }

  function parseBlock(startIndex, endIndex, contexts = []) {
    const rules = [];
    let cursor = startIndex;
    while (cursor < endIndex) {
      const openIndex = source.indexOf("{", cursor);
      if (openIndex < 0 || openIndex >= endIndex) break;

      const selector = normalizeSelector(source.slice(cursor, openIndex));
      const closeIndex = findMatchingClose(openIndex);
      if (closeIndex < 0 || closeIndex > endIndex) break;

      if (selector) {
        if (selector.startsWith("@")) {
          rules.push(...parseBlock(openIndex + 1, closeIndex, [...contexts, selector]));
        } else {
          rules.push({
            file,
            selector,
            body: source.slice(openIndex + 1, closeIndex).trim(),
            context: contexts.join(" | ") || "root",
          });
        }
      }

      cursor = closeIndex + 1;
    }
    return rules;
  }

  return parseBlock(0, source.length);
}

function countMatches(source = "", regexp) {
  return [...source.matchAll(regexp)].length;
}

function groupBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

async function collectCssMetrics() {
  const sourceMap = new Map();
  for (const file of entryCssFiles) {
    const sources = await collectCssSources(file);
    sources.forEach((item) => sourceMap.set(item.file, item));
  }
  const sources = [...sourceMap.values()];
  const rules = sources.flatMap(({ file, source }) => collectRules(source, file));
  const selectorGroups = groupBy(rules, (rule) => `${rule.context}\n${rule.selector}`);
  const exactRuleGroups = groupBy(rules, (rule) => `${rule.context}\n${rule.selector}\n${rule.body.trim().replace(/\s+/g, " ")}`);
  const duplicateSelectorGroups = [...selectorGroups.entries()].filter(([, items]) => items.length > 1);
  const exactDuplicateRuleGroups = [...exactRuleGroups.values()].filter((items) => items.length > 1);
  const maxDuplicateSelectorGroupSize = duplicateSelectorGroups.reduce((max, [, items]) => Math.max(max, items.length), 0);
  const statusRules = rules.filter((rule) => statusSelectorPattern.test(rule.selector));
  const rawLocalStatusColors = statusRules.reduce((sum, rule) => {
    if (rule.file === "styles/mes-ui-core.css" || rule.file === "styles/ui/status.css") return sum;
    return sum + countMatches(rule.body, rawColorPattern);
  }, 0);
  return {
    sources,
    rules,
    duplicateSelectorGroups,
    duplicateSelectorGroupCount: duplicateSelectorGroups.length,
    largestDuplicateSelectorGroup: maxDuplicateSelectorGroupSize,
    exactDuplicateRuleGroups: exactDuplicateRuleGroups.length,
    rawLocalStatusColors,
  };
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function getWindow(source, index, before = 1400, after = 700) {
  return source.slice(Math.max(0, index - before), Math.min(source.length, index + after));
}

function classifyTable(source, index) {
  const context = getWindow(source, index);
  if (/renderUiTableWrap\s*\(|data-ui-component=["']TableWrap["']/.test(context)) return { status: "contract", kind: "TableWrap" };
  if (/data-ui-component=["']PrintTable["']/.test(context)) return { status: "non-production-exception", kind: "PrintTable" };
  if (/data-ui-component=["']VisualSampleTable["']/.test(context)) return { status: "non-production-exception", kind: "VisualSampleTable" };
  if (/data-ui-component=["'](?:CustomGrid|WideMatrix|TimelineGrid)["']/.test(context)) {
    const kind = context.match(/data-ui-component=["'](CustomGrid|WideMatrix|TimelineGrid)["']/)?.[1] || "special";
    return { status: "special-runtime", kind };
  }
  if (/route-print-table|work-order-print|visual-selected-row-option|visual-snapshot-table/.test(context)) {
    return { status: "unclassified-exception", kind: "legacy-documented-exception" };
  }
  return { status: "violation", kind: "production-table-missing-contract" };
}

async function collectTableMetrics() {
  const source = await fs.readFile(path.join(rootDir, "src", "app.js"), "utf8");
  const tables = [...source.matchAll(/<table\b/g)].map((match) => {
    const index = match.index || 0;
    return {
      line: getLineNumber(source, index),
      ...classifyTable(source, index),
    };
  });
  return {
    tablesFound: tables.length,
    tablesUnderTableWrap: tables.filter((item) => item.status === "contract").length,
    productionTableExceptions: tables.filter((item) => item.status === "violation").length,
    nonProductionTableExceptions: tables.filter((item) => item.status === "non-production-exception").length,
    printTableExceptions: tables.filter((item) => item.kind === "PrintTable").length,
    visualSampleTableExceptions: tables.filter((item) => item.kind === "VisualSampleTable").length,
    unclassifiedTableExceptions: tables.filter((item) => item.status === "unclassified-exception").length,
    specialRuntimeTables: tables.filter((item) => item.status === "special-runtime").length,
    tableContractViolations: tables.filter((item) => item.status === "violation").length,
  };
}

async function collectStatusMetrics(cssMetrics) {
  const appSource = await fs.readFile(path.join(rootDir, "src", "app.js"), "utf8");
  const componentSource = await fs.readFile(path.join(rootDir, "src", "ui", "components.js"), "utf8");
  const fullSource = [
    appSource,
    componentSource,
    ...cssMetrics.sources.map((item) => item.source),
  ].join("\n");
  const statusBudget = await readJson(budgetFiles.status);
  const tokenizedPatterns = (statusBudget.tokenizedPatterns || [])
    .filter((item) => item?.pattern && fullSource.includes(item.pattern));
  return {
    statusPillOccurrences: countMatches(fullSource, /status-pill/g),
    deadlineBadgeOccurrences: countMatches(fullSource, /deadline-badge/g),
    mesSignalOccurrences: countMatches(fullSource, /mes-signal/g),
    statusStateTokenOccurrences: countMatches(fullSource, /(?:status-pill|deadline-badge|status-token|state-token|status-badge|status-chip)/g),
    renderUiStatusTokenCalls: countMatches(appSource, /renderUiStatusToken\s*\(/g),
    statusBadgeChipPatternsTracked: statusBudget.tokenizedPatterns?.length || 0,
    tokenizedStatusBadgeChipPatterns: tokenizedPatterns.length,
    rawLocalStatusColors: cssMetrics.rawLocalStatusColors,
  };
}

async function collectRawVisualMetrics(cssMetrics) {
  const appSource = await fs.readFile(path.join(rootDir, "src", "app.js"), "utf8");
  const layerDir = path.join(rootDir, "styles", "layers");
  const layerFiles = (await fs.readdir(layerDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => path.join(layerDir, entry.name))
    .sort();
  const rawAuditSources = [
    appSource,
    await fs.readFile(path.join(rootDir, "styles.css"), "utf8"),
    await fs.readFile(path.join(rootDir, "styles", "mes-ui-core.css"), "utf8"),
    ...await Promise.all(layerFiles.map((file) => fs.readFile(file, "utf8"))),
  ];
  const searchable = rawAuditSources
    .map((source) => source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " ")))
    .join("\n");
  const legacyTail = await fs.readFile(path.join(rootDir, "styles", "layers", "99-legacy-overrides-tail.css"), "utf8");
  return {
    legacyTailLines: legacyTail.trimEnd().split("\n").length,
    importantUsages: countMatches(searchable, /!important\b/g),
    rawHexUsages: countMatches(searchable, /#[0-9a-fA-F]{3,8}\b/g),
    borderRadiusPxDeclarations: countMatches(searchable, /border-radius\s*:\s*\d+(?:\.\d+)?px\b/g),
  };
}

function assertBudget(name, current, budget, failures) {
  if (budget === undefined || budget === null) return;
  if (current > budget) failures.push(`${name}: ${current} > ${budget}`);
}

function assertMinimum(name, current, minimum, failures) {
  if (minimum === undefined || minimum === null) return;
  if (current < minimum) failures.push(`${name}: ${current} < ${minimum}`);
}

function validateCollapsedFamilies(cssMetrics, duplicateBudget, failures) {
  const groups = duplicateBudget.collapsedSelectorFamilies || [];
  groups.forEach((family) => {
    const match = new RegExp(family.match);
    const exclude = family.exclude ? new RegExp(family.exclude) : null;
    const duplicateGroups = cssMetrics.duplicateSelectorGroups.filter(([key]) => (
      match.test(key) && !(exclude && exclude.test(key))
    ));
    if (duplicateGroups.length > (family.maxDuplicateGroups ?? 0)) {
      failures.push(`${family.id || family.match}: duplicate groups ${duplicateGroups.length} > ${family.maxDuplicateGroups ?? 0}`);
    }
  });
}

const cssMetrics = await collectCssMetrics();
const tableMetrics = await collectTableMetrics();
const statusMetrics = await collectStatusMetrics(cssMetrics);
const rawVisualMetrics = await collectRawVisualMetrics(cssMetrics);
const metrics = {
  duplicate: {
    duplicateSelectorGroups: cssMetrics.duplicateSelectorGroupCount,
    largestDuplicateSelectorGroup: cssMetrics.largestDuplicateSelectorGroup,
    exactDuplicateRuleGroups: cssMetrics.exactDuplicateRuleGroups,
  },
  table: tableMetrics,
  status: statusMetrics,
  visualDebt: rawVisualMetrics,
};

const failures = [];
if (scope === "all" || scope === "duplicate") {
  const budget = await readJson(budgetFiles.duplicate);
  assertBudget("duplicateSelectorGroups", metrics.duplicate.duplicateSelectorGroups, budget.maxDuplicateSelectorGroups, failures);
  assertBudget("largestDuplicateSelectorGroup", metrics.duplicate.largestDuplicateSelectorGroup, budget.maxLargestDuplicateSelectorGroup, failures);
  assertBudget("exactDuplicateRuleGroups", metrics.duplicate.exactDuplicateRuleGroups, budget.maxExactDuplicateRuleGroups, failures);
  validateCollapsedFamilies(cssMetrics, budget, failures);
}
if (scope === "all" || scope === "table") {
  const budget = await readJson(budgetFiles.table);
  assertBudget("productionTableExceptions", metrics.table.productionTableExceptions, budget.maxProductionTableExceptions, failures);
  assertBudget("unclassifiedTableExceptions", metrics.table.unclassifiedTableExceptions, budget.maxUnclassifiedTableExceptions, failures);
  assertBudget("tableContractViolations", metrics.table.tableContractViolations, budget.maxTableContractViolations, failures);
  assertMinimum("nonProductionTableExceptions", metrics.table.nonProductionTableExceptions, budget.minNonProductionTableExceptions, failures);
  assertMinimum("printTableExceptions", metrics.table.printTableExceptions, budget.minPrintTableExceptions, failures);
  assertMinimum("visualSampleTableExceptions", metrics.table.visualSampleTableExceptions, budget.minVisualSampleTableExceptions, failures);
}
if (scope === "all" || scope === "status") {
  const budget = await readJson(budgetFiles.status);
  assertBudget("rawLocalStatusColors", metrics.status.rawLocalStatusColors, budget.maxRawLocalStatusColors, failures);
  assertMinimum("renderUiStatusTokenCalls", metrics.status.renderUiStatusTokenCalls, budget.minRenderUiStatusTokenCalls, failures);
  assertMinimum("tokenizedStatusBadgeChipPatterns", metrics.status.tokenizedStatusBadgeChipPatterns, budget.minTokenizedStatusBadgeChipPatterns, failures);
}

if (writeReport) {
  const after = {
    duplicateSelectorGroups: metrics.duplicate.duplicateSelectorGroups,
    largestDuplicateSelectorGroup: metrics.duplicate.largestDuplicateSelectorGroup,
    legacyTailLines: metrics.visualDebt.legacyTailLines,
    importantUsages: metrics.visualDebt.importantUsages,
    rawHexUsages: metrics.visualDebt.rawHexUsages,
    borderRadiusPxDeclarations: metrics.visualDebt.borderRadiusPxDeclarations,
    tableExceptions: metrics.table.productionTableExceptions,
    productionTableExceptions: metrics.table.productionTableExceptions,
    nonProductionTableExceptions: metrics.table.nonProductionTableExceptions,
    printTableExceptions: metrics.table.printTableExceptions,
    visualSampleTableExceptions: metrics.table.visualSampleTableExceptions,
    renderUiStatusTokenCalls: metrics.status.renderUiStatusTokenCalls,
    tokenizedStatusBadgeChipPatterns: metrics.status.tokenizedStatusBadgeChipPatterns,
    rawLocalStatusColors: metrics.status.rawLocalStatusColors,
  };
  const reportPath = path.join(rootDir, "reports", "corrective-phase-b-metrics.json");
  await fs.writeFile(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope,
    before: phaseBBaseline,
    after,
    delta: Object.fromEntries(Object.entries(after).map(([key, value]) => [
      key,
      typeof value === "number" && typeof phaseBBaseline[key] === "number" ? value - phaseBBaseline[key] : null,
    ])),
    metrics,
  }, null, 2)}\n`);
}

console.log("MES Corrective Phase B Budget");
console.log(`Scope: ${scope}`);
console.log(`Duplicate selector groups: ${metrics.duplicate.duplicateSelectorGroups}`);
console.log(`Largest duplicate selector group: ${metrics.duplicate.largestDuplicateSelectorGroup}`);
console.log(`Exact duplicate rule groups: ${metrics.duplicate.exactDuplicateRuleGroups}`);
console.log(`Raw local status colors: ${metrics.status.rawLocalStatusColors}`);
console.log(`Tokenized status/badge/chip patterns: ${metrics.status.tokenizedStatusBadgeChipPatterns}/${metrics.status.statusBadgeChipPatternsTracked}`);
console.log(`renderUiStatusToken calls: ${metrics.status.renderUiStatusTokenCalls}`);
console.log(`Tables found: ${metrics.table.tablesFound}`);
console.log(`Tables under TableWrap: ${metrics.table.tablesUnderTableWrap}`);
console.log(`Production table exceptions: ${metrics.table.productionTableExceptions}`);
console.log(`Non-production table exceptions: ${metrics.table.nonProductionTableExceptions}`);
console.log(`PrintTable exceptions: ${metrics.table.printTableExceptions}`);
console.log(`VisualSampleTable exceptions: ${metrics.table.visualSampleTableExceptions}`);

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("\nOK: Corrective Phase B shrinking budgets are satisfied.");
