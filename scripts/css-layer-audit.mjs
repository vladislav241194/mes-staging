import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const entryFiles = [
  "styles.css",
  "styles/mes-ui-core.css",
];
const expectedLayerImports = [
  "./styles/layers/00-foundation-base.css",
  "./styles/layers/10-shell-directory-gantt-base.css",
  "./styles/layers/20-technology-calculator-specifications.css",
  "./styles/layers/30-module-shell-ui-foundations.css",
  "./styles/layers/40-gantt-planning-routes.css",
  "./styles/layers/50-nomenclature-routes-directories.css",
  "./styles/layers/60-operational-modules.css",
  "./styles/layers/70-planning-table-and-matrix.css",
  "./styles/layers/80-visual-system-ui-states.css",
  "./styles/layers/90-shift-master-board.css",
  "./styles/layers/99-legacy-overrides-tail.css",
];
const budgets = {
  duplicateSelectorGroups: 470,
  maxDuplicateSelectorGroupSize: 12,
  exactDuplicateRuleGroups: 0,
  broadImportantRules: 0,
  broadImportantRulesByFile: {},
  legacySelectorRules: 0,
  removedProjectUiSelectorRules: 0,
  removedReportDebugSelectorRules: 0,
  removedDashboardSelectorRules: 0,
  removedStandaloneShellSelectorRules: 0,
  removedStandaloneBomLayoutSelectorRules: 0,
  insetlessPanelHeaderRules: 0,
};
const failures = [];
const removedProjectUiPattern = /project-(?:binding|list|card|row|panel|relation|route|main|name-line|meta|status|readiness|module-content|editor-panel)|projectBinding|projectList|director-project-|data-focus-project/;
const removedReportDebugModulePattern = /reports-page|report-sidebar|report-workspace|report-(?:app-shell|content|main|chart-grid|chart-card|table-card|insights|dashboard-workspace|header|kpi|kpi-grid)|debug-(?:action-menu|app-shell|check-list|chip-select|combobox|command-input|content|dense-row|drawer|drawer-backdrop|dropdown-menu|dropdown-panel|error-tip|index|inline-options|inline-select|menu-panel|metric-popover|mini-list|modal-grid|popover|popover-stage|segment-label|select-button|spec-grid|status-select|stepper-card|stepper-grid|steps|tree-select|usage-grid|validation|wizard-modal)|debug-page|debug-sidebar|debug-workspace|debug-card|debug-section|activeModule\s*={2,3}\s*["'](?:reports|debug)["']/;
const removedDashboardLayoutPattern = /dashboard-app-shell|dashboard-page|dashboard-control-room|dashboard-header|dashboard-time|dashboard-grid|dashboard-status-grid|dashboard-workspace|data-layout-page="dashboard"|activeModule\s*={2,3}\s*["']dashboard["']/;
const removedStandaloneShellPattern = /(?:calculator|project|specification)-app-shell/;
const removedStandaloneBomLayoutPattern = /data-layout-page="bomLists"|bom-list-app-shell/;

function fail(message) {
  failures.push(message);
}

function normalizeSelector(selector = "") {
  return selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
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
            line: getLineNumber(source, openIndex),
          });
        }
      }

      cursor = closeIndex + 1;
    }
    return rules;
  }

  return parseBlock(0, source.length);
}

function assertBalancedCssBlocks(source, file) {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) {
      fail(`${file}: CSS block closes before it opens at line ${getLineNumber(source, index)}`);
      return;
    }
  }
  if (depth !== 0) {
    fail(`${file}: CSS block balance is ${depth}; browser may ignore a large part of the stylesheet`);
  }
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

function printTopGroups(title, groups, limit = 12) {
  const rows = [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, limit);

  console.log(`\n${title}`);
  if (!rows.length) {
    console.log("- none");
    return;
  }

  rows.forEach(([, items]) => {
    const locations = items.slice(0, 5).map((item) => `${item.file}:${item.line}`).join(", ");
    const context = items[0]?.context && items[0].context !== "root" ? ` [${items[0].context}]` : "";
    console.log(`- ${items.length}x ${items[0]?.selector || "unknown selector"}${context}`);
    console.log(`  ${locations}${items.length > 5 ? ", ..." : ""}`);
  });
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function getCssImports(source = "") {
  return [...source.matchAll(/@import\s+(?:url\()?["']([^"')]+?\.css)(?:\?[^"')]+)?["']\)?\s*;/g)]
    .map((match) => match[1]);
}

function assertManifestOnlyStylesheet(source, file) {
  const imports = getCssImports(source);
  if (JSON.stringify(imports) !== JSON.stringify(expectedLayerImports)) {
    fail(`${file}: CSS layer manifest imports changed. Expected fixed cascade order: ${expectedLayerImports.join(", ")}`);
  }

  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import\s+(?:url\()?["'][^"')]+?\.css(?:\?[^"')]+)?["']\)?\s*;/g, "")
    .trim();
  if (stripped) {
    fail(`${file}: root stylesheet must stay a manifest only; move CSS rules to styles/layers/* or styles/mes-ui-core.css.`);
  }
}

async function collectCssSources(file, seen = new Set()) {
  const normalizedFile = toPosixPath(file);
  if (seen.has(normalizedFile)) return [];
  seen.add(normalizedFile);

  const absolutePath = path.join(rootDir, normalizedFile);
  const source = await fs.readFile(absolutePath, "utf8");
  const imports = getCssImports(source);
  const importedSources = [];
  for (const specifier of imports) {
    const importedFile = toPosixPath(path.normalize(path.join(path.dirname(normalizedFile), specifier)));
    importedSources.push(...await collectCssSources(importedFile, seen));
  }
  return [{ file: normalizedFile, source }, ...importedSources];
}

const cssSourceMap = new Map();
for (const file of entryFiles) {
  const collected = await collectCssSources(file);
  collected.forEach((item) => cssSourceMap.set(item.file, item));
}
const sources = [...cssSourceMap.values()];

assertManifestOnlyStylesheet((await fs.readFile(path.join(rootDir, "styles.css"), "utf8")), "styles.css");
sources.forEach(({ file, source }) => assertBalancedCssBlocks(source, file));

const rules = sources.flatMap(({ file, source }) => collectRules(source, file));
const selectorGroups = groupBy(rules, (rule) => `${rule.context}\n${rule.selector}`);
const exactRuleGroups = groupBy(rules, (rule) => `${rule.context}\n${rule.selector}\n${rule.body.trim().replace(/\s+/g, " ")}`);
const duplicateSelectorGroups = [...selectorGroups.values()].filter((items) => items.length > 1);
const exactDuplicateRuleGroups = [...exactRuleGroups.values()].filter((items) => items.length > 1);
const maxDuplicateSelectorGroupSize = duplicateSelectorGroups.reduce((max, items) => Math.max(max, items.length), 0);
const riskyOverflowRules = rules.filter((rule) => (
  /(?:^|[\s,.])module-panel(?:[\s,.#:>\[]|$)/.test(rule.selector)
  && /overflow(?:-y)?\s*:\s*(?:auto|scroll)\b/i.test(rule.body)
));
const broadImportantRules = rules.filter((rule) => (
  /!important/.test(rule.body)
  && /(?:^|[\s,.])(?:module-data-page|module-data-sidebar|module-panel|directory-sidebar|directory-table)(?:[\s,.#:>\[]|$)/.test(rule.selector)
));
const broadImportantRulesByFile = groupBy(broadImportantRules, (rule) => rule.file);
const legacySelectorRules = rules.filter((rule) => (
  /module-entity-(?:item|list|title)|module-list-label/.test(rule.selector)
));
const removedProjectUiSelectorRules = rules.filter((rule) => (
  removedProjectUiPattern.test(rule.selector)
));
const removedReportDebugSelectorRules = rules.filter((rule) => (
  removedReportDebugModulePattern.test(rule.selector)
));
const removedDashboardSelectorRules = rules.filter((rule) => (
  removedDashboardLayoutPattern.test(rule.selector)
));
const removedStandaloneShellSelectorRules = rules.filter((rule) => (
  removedStandaloneShellPattern.test(rule.selector)
));
const removedStandaloneBomLayoutSelectorRules = rules.filter((rule) => (
  removedStandaloneBomLayoutPattern.test(rule.selector)
));
const insetlessPanelHeaderRules = rules.filter((rule) => (
  /(?:report-card-head|assistant-panel-head|planning-panel-head|shop-map-panel-head|ui-panel-head|module-panel\s+h2|directory-sidebar-head|directory-table-toolbar|detail-card-head|planning-operation-group-head|route-smt-step-head|supply-header)/.test(rule.selector)
  && /padding\s*:\s*0\s+0\s+\d+(?:px|rem|em)/i.test(rule.body)
));

if (riskyOverflowRules.length) {
  fail(`Risky module-panel overflow rules: ${riskyOverflowRules.length}`);
}
if (duplicateSelectorGroups.length > budgets.duplicateSelectorGroups) {
  fail(`Duplicate selector groups grew above budget: ${duplicateSelectorGroups.length} > ${budgets.duplicateSelectorGroups}`);
}
if (maxDuplicateSelectorGroupSize > budgets.maxDuplicateSelectorGroupSize) {
  fail(`Largest duplicate selector group grew above budget: ${maxDuplicateSelectorGroupSize} > ${budgets.maxDuplicateSelectorGroupSize}`);
}
if (exactDuplicateRuleGroups.length > budgets.exactDuplicateRuleGroups) {
  fail(`Exact duplicate CSS rule groups grew above budget: ${exactDuplicateRuleGroups.length} > ${budgets.exactDuplicateRuleGroups}`);
}
if (broadImportantRules.length > budgets.broadImportantRules) {
  fail(`Broad !important layout rules grew above budget: ${broadImportantRules.length} > ${budgets.broadImportantRules}`);
}
Object.entries(budgets.broadImportantRulesByFile).forEach(([file, budget]) => {
  const count = broadImportantRulesByFile.get(file)?.length || 0;
  if (count > budget) {
    fail(`Broad !important layout rules grew in ${file}: ${count} > ${budget}`);
  }
});
for (const [file, items] of broadImportantRulesByFile.entries()) {
  if (!Object.prototype.hasOwnProperty.call(budgets.broadImportantRulesByFile, file)) {
    fail(`Broad !important layout rules appeared in unbudgeted CSS file ${file}: ${items.length}`);
  }
}
if (legacySelectorRules.length > budgets.legacySelectorRules) {
  fail(`Legacy selector pressure grew above budget: ${legacySelectorRules.length} > ${budgets.legacySelectorRules}`);
}
if (removedProjectUiSelectorRules.length > budgets.removedProjectUiSelectorRules) {
  fail(`Removed project UI selector pressure grew above budget: ${removedProjectUiSelectorRules.length} > ${budgets.removedProjectUiSelectorRules}`);
}
if (removedReportDebugSelectorRules.length > budgets.removedReportDebugSelectorRules) {
  fail(`Removed reports/debug selector pressure grew above budget: ${removedReportDebugSelectorRules.length} > ${budgets.removedReportDebugSelectorRules}`);
}
if (removedDashboardSelectorRules.length > budgets.removedDashboardSelectorRules) {
  fail(`Removed dashboard selector pressure grew above budget: ${removedDashboardSelectorRules.length} > ${budgets.removedDashboardSelectorRules}`);
}
if (removedStandaloneShellSelectorRules.length > budgets.removedStandaloneShellSelectorRules) {
  fail(`Removed standalone shell selector pressure grew above budget: ${removedStandaloneShellSelectorRules.length} > ${budgets.removedStandaloneShellSelectorRules}`);
}
if (removedStandaloneBomLayoutSelectorRules.length > budgets.removedStandaloneBomLayoutSelectorRules) {
  fail(`Removed standalone bomLists layout selector pressure grew above budget: ${removedStandaloneBomLayoutSelectorRules.length} > ${budgets.removedStandaloneBomLayoutSelectorRules}`);
}
if (insetlessPanelHeaderRules.length > budgets.insetlessPanelHeaderRules) {
  fail(`Insetless panel/header text rules returned: ${insetlessPanelHeaderRules.length}`);
}

console.log("MES CSS Layer Audit");
console.log(`Rules: ${rules.length}`);
console.log(`Files: ${sources.map((item) => item.file).join(", ")}`);
console.log(`Root manifest imports: ${expectedLayerImports.length}; styles.css is manifest-only`);
console.log(`Duplicate selector groups: ${duplicateSelectorGroups.length}`);
console.log(`Largest duplicate selector group: ${maxDuplicateSelectorGroupSize}`);
console.log(`Exact duplicate rule groups: ${exactDuplicateRuleGroups.length}`);

printTopGroups("Duplicate exact selector lists", selectorGroups);
printTopGroups("Exact duplicate CSS rules", exactRuleGroups, 8);

console.log("\nRisky module-panel overflow rules");
if (riskyOverflowRules.length) {
  riskyOverflowRules.slice(0, 20).forEach((rule) => console.log(`- ${rule.file}:${rule.line} ${rule.selector}`));
} else {
  console.log("- none");
}

console.log("\nBroad !important layout rules");
console.log(`- ${broadImportantRules.length}`);
broadImportantRules.slice(0, 12).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));
console.log("- by file:");
[...broadImportantRulesByFile.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .forEach(([file, items]) => console.log(`  ${file}: ${items.length}`));

console.log("\nLegacy selector pressure");
console.log(`- ${legacySelectorRules.length} rules mention module-entity legacy selectors`);
legacySelectorRules.slice(0, 12).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

console.log("\nRemoved project UI selector pressure");
console.log(`- ${removedProjectUiSelectorRules.length} rules mention removed project UI selectors`);
removedProjectUiSelectorRules.slice(0, 8).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

console.log("\nRemoved reports/debug selector pressure");
console.log(`- ${removedReportDebugSelectorRules.length} rules mention removed reports/debug module selectors`);
removedReportDebugSelectorRules.slice(0, 8).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

console.log("\nRemoved dashboard selector pressure");
console.log(`- ${removedDashboardSelectorRules.length} rules mention removed dashboard module selectors`);
removedDashboardSelectorRules.slice(0, 8).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

console.log("\nRemoved standalone shell selector pressure");
console.log(`- ${removedStandaloneShellSelectorRules.length} rules mention removed calculator/project/specification app shells`);
removedStandaloneShellSelectorRules.slice(0, 8).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

console.log("\nRemoved standalone bomLists layout selector pressure");
console.log(`- ${removedStandaloneBomLayoutSelectorRules.length} rules mention removed bomLists layout selectors`);
removedStandaloneBomLayoutSelectorRules.slice(0, 8).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

console.log("\nPotential insetless panel/header text");
console.log(`- ${insetlessPanelHeaderRules.length} rules set vertical-only padding on panel headers`);
insetlessPanelHeaderRules.slice(0, 12).forEach((rule) => console.log(`  ${rule.file}:${rule.line} ${rule.selector}`));

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nOK: CSS audit completed.");
