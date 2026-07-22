import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const reportPath = path.join(root, "reports", "ui-contract-global-impact.json");
const historyPath = path.join(root, "reports", "ui-contract-impact-history.jsonl");
const startedAt = performance.now();
const runLabel = process.argv.find((arg) => arg.startsWith("--label="))?.slice("--label=".length) || "";

const targetCssFiles = [
  "styles/ui/kit-polish.css",
  "styles/ui/actions.css",
  "styles/ui/status.css",
  "styles/ui/planning-order.css",
  "styles/layers/30-module-shell-ui-foundations.css",
  "styles/layers/60-operational-modules.css",
  "styles/layers/70-planning-table-and-matrix.css",
  "styles/layers/90-shift-master-board.css",
  "styles/layers/99-legacy-overrides-tail.css",
];
const runtimeUiStatesCssFile = "styles/layers/80-runtime-ui-states.css";
const safeTypographyImportantProperties = [
  "color",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "white-space",
  "text-overflow",
  "overflow-wrap",
  "word-break",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
];
const contractLayoutImportantProperties = [
  "align-content",
  "align-items",
  "align-self",
  "border",
  "border-block",
  "border-block-end",
  "border-block-start",
  "border-bottom",
  "border-color",
  "border-inline",
  "border-inline-end",
  "border-inline-start",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "box-sizing",
  "column-gap",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-wrap",
  "gap",
  "grid-area",
  "grid-column",
  "grid-row",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "margin-bottom",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "order",
  "overflow",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-bottom",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
  "row-gap",
  "table-layout",
  "width",
];

const helperNames = [
  "renderUiModulePage",
  "renderUiModuleHeader",
  "renderUiPanel",
  "renderUiPanelBody",
  "renderUiTableWrap",
  "renderUiInfoGrid",
  "renderUiMetricGrid",
  "renderUiActionButton",
  "renderUiStatusToken",
  "renderUiFormField",
  "renderUiModalFrame",
  "renderUiDrawerFrame",
];
const selectedUiContractModules = [
  "weekly_production_control",
  "shift_work_orders",
  "products",
  "routes",
  "timesheet",
  "planning_workbench",
];

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function listFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath, predicate);
    return predicate(entryPath) ? [entryPath] : [];
  });
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function summarizeCssFile(relativePath) {
  const text = readText(path.join(root, relativePath));
  const moduleSurfaceRules = countMatches(
    text,
    /main\.app-shell\[data-layout-page=["'][^"']+["'][\s\S]{0,220}?(?:background|box-shadow|border-radius|border-color)\s*:/g,
  );
  return {
    file: relativePath,
    lines: text ? text.split(/\r?\n/).length : 0,
    localSurfaceDeclarations: countMatches(
      text,
      /(?:background|background-color|background-image|box-shadow)\s*:\s*(?!\s*var\()[^;]+;/g,
    ),
    tokenizedSurfaceDeclarations: countMatches(
      text,
      /(?:background|background-color|background-image|box-shadow)\s*:\s*var\([^;]+;/g,
    ),
    hardcodedColorSurfaceDeclarations: countMatches(
      text,
      /(?:background|background-color|background-image|border-color|box-shadow)\s*:\s*(?:#[0-9a-fA-F]{3,8}|rgba?\(|linear-gradient\(|radial-gradient\()/g,
    ),
    importantCount: countMatches(text, /!important/g),
    moduleSurfaceRules,
    dataUiComponentSelectors: countMatches(text, /\[data-ui-component=/g),
    dataUiContractSelectors: countMatches(text, /\[data-ui-contract/g),
  };
}

function countImportantByProperties(text, properties) {
  const allowed = new Set(properties);
  return text.split(/\r?\n/).reduce((sum, line) => {
    if (!line.includes("!important")) return sum;
    const property = line.match(/^\s*([\w-]+)\s*:/)?.[1] || "";
    return allowed.has(property) ? sum + countMatches(line, /!important/g) : sum;
  }, 0);
}

function countImportantByProperty(text) {
  return text.split(/\r?\n/).reduce((map, line) => {
    if (!line.includes("!important")) return map;
    const property = line.match(/^\s*([\w-]+)\s*:/)?.[1] || "(unknown)";
    map[property] = (map[property] || 0) + countMatches(line, /!important/g);
    return map;
  }, {});
}

const protectedSelectorPatterns = [
  /\bgantt\b/i,
  /\bplanning-gantt\b/i,
  /\bplanning-load\b/i,
  /\btimeline\b/i,
  /\bslot\b/i,
  /\bdependency\b/i,
  /\broute-print\b/i,
  /\bprint\b/i,
  /\bauth-prototype\b/i,
  /\bauthPrototype\b/i,
  /\bspecifications2-diagram\b/i,
  /\bmodal-backdrop\b/i,
  /\bui-modal\b/i,
  /\bdense-popover\b/i,
  /^body\s+\*$/i,
  /^main\.app-shell\[data-layout=["']app-shell["']\]\s+\*$/i,
];

const sharedContractSelectorPatterns = [
  /\bmodule-menu\b/i,
  /\bapp-topbar\b/i,
  /\bmodule-data-page\b/i,
  /\bmodule-data-content\b/i,
  /\bmodule-data-workspace\b/i,
  /\bmodule-panel\b/i,
  /\bui-panel\b/i,
  /\bdirectory-table\b/i,
  /\bui-table\b/i,
  /\btable-wrap\b/i,
  /\bui-action-button\b/i,
  /\bprimary-button\b/i,
  /\bsecondary-button\b/i,
  /\bicon-button\b/i,
  /\bstatus\b/i,
  /\bbadge\b/i,
  /\bchip\b/i,
];

const moduleSurfaceProperties = [
  "background",
  "background-color",
  "box-shadow",
  "border-radius",
  "border-color",
];

const semanticSurfaceSelectorPatterns = [
  /\bis-/i,
  /\bstatus\b/i,
  /\bwarning\b/i,
  /\bdanger\b/i,
  /\bsuccess\b/i,
  /\binfo\b/i,
  /\bcritical\b/i,
  /\bok\b/i,
  /\bbadge\b/i,
  /\bpill\b/i,
  /\btoken\b/i,
  /\btype\b/i,
  /\bkind\b/i,
  /\bslot\b/i,
  /\bgantt\b/i,
  /\bprint\b/i,
  /\bauth\b/i,
];

const structuralSurfaceSelectorPatterns = [
  /\bpage\b/i,
  /\bworkspace\b/i,
  /\bcontent\b/i,
  /\bpanel\b/i,
  /\bsection\b/i,
  /\btable\b/i,
  /\bwrap\b/i,
  /\bheader\b/i,
  /\bhead\b/i,
  /\bgrid\b/i,
  /\bsidebar\b/i,
  /\bcard\b/i,
  /\bcell\b/i,
  /\btoolbar\b/i,
  /\bcontrols\b/i,
];

function classifySelector(selector) {
  if (protectedSelectorPatterns.some((pattern) => pattern.test(selector))) return "protected";
  if (sharedContractSelectorPatterns.some((pattern) => pattern.test(selector))) return "candidate";
  return "other";
}

function classifyModuleSurfaceSelector(selector) {
  if (semanticSurfaceSelectorPatterns.some((pattern) => pattern.test(selector))) return "semantic";
  if (structuralSurfaceSelectorPatterns.some((pattern) => pattern.test(selector))) return "structural";
  return "other";
}

function countImportantByCssBlocks(relativePath) {
  const text = readText(path.join(root, relativePath));
  const counts = {
    candidate: 0,
    protected: 0,
    other: 0,
    byFile: {},
    byProperty: {
      candidate: {},
      protected: {},
      other: {},
    },
  };
  const normalized = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/}/g, "}\n")
    .replace(/{/g, "{\n");
  const blockRegex = /([^{}]+)\{\s*([^{}]*!important[^{}]*)\}/g;
  let match;
  while ((match = blockRegex.exec(normalized)) !== null) {
    const selector = match[1].trim();
    const body = match[2];
    const scope = classifySelector(selector);
    const importantCount = countMatches(body, /!important/g);
    counts[scope] += importantCount;
    counts.byFile[scope] = (counts.byFile[scope] || 0) + importantCount;
    body.split(/\r?\n/).forEach((line) => {
      if (!line.includes("!important")) return;
      const property = line.match(/^\s*([\w-]+)\s*:/)?.[1] || "(unknown)";
      counts.byProperty[scope][property] = (counts.byProperty[scope][property] || 0)
        + countMatches(line, /!important/g);
    });
  }
  return counts;
}

function countModuleSurfaceByCssBlocks(relativePath) {
  const text = readText(path.join(root, relativePath)).replace(/\/\*[\s\S]*?\*\//g, "");
  const counts = {
    structural: 0,
    semantic: 0,
    other: 0,
    byFile: {
      structural: {},
      semantic: {},
      other: {},
    },
  };
  const blockRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const selector = match[1].trim();
    if (!selector.includes("main.app-shell[data-layout-page=")) continue;
    const body = match[2];
    const surfaceCount = moduleSurfaceProperties.reduce(
      (sum, property) => sum + countMatches(body, new RegExp(`(?:^|\\n)\\s*${property}\\s*:`, "g")),
      0,
    );
    if (!surfaceCount) continue;
    const scope = classifyModuleSurfaceSelector(selector);
    counts[scope] += surfaceCount;
    counts.byFile[scope][relativePath] = (counts.byFile[scope][relativePath] || 0) + surfaceCount;
  }
  return counts;
}

function summarizeSelectedUiModule(moduleName) {
  const file = `src/modules/${moduleName}/render.js`;
  const text = readText(path.join(root, file));
  const manualAction = countMatches(text, /<button\b[^>]*\bui-action-button\b/g)
    + countMatches(text, /<label\b[^>]*\bui-action-button\b/g);
  const helperAction = countMatches(text, /\brenderUiActionButton\s*\(/g)
    + countMatches(text, /\brenderUiActionFileLabel\s*\(/g);
  const manualTableWrap = countMatches(text, /<div\b[^>]*\bui-table-wrap\b/g);
  const helperTableWrap = countMatches(text, /\brenderUiTableWrap\s*\(/g);
  const manualPanel = countMatches(text, /<section\b[^>]*\bmodule-panel\b/g);
  const helperPanel = countMatches(text, /\brenderUiPanel\s*\(/g);
  return {
    module: moduleName,
    file,
    manualAction,
    helperAction,
    manualTableWrap,
    helperTableWrap,
    manualPanel,
    helperPanel,
    manualTotal: manualAction + manualTableWrap + manualPanel,
    helperTotal: helperAction + helperTableWrap + helperPanel,
  };
}

function sumSelectedUiModules(items) {
  return items.reduce((total, item) => {
    [
      "manualAction",
      "helperAction",
      "manualTableWrap",
      "helperTableWrap",
      "manualPanel",
      "helperPanel",
      "manualTotal",
      "helperTotal",
    ].forEach((key) => {
      total[key] = (total[key] || 0) + Number(item[key] || 0);
    });
    return total;
  }, {});
}

function mergePropertyCounts(items) {
  const merged = {};
  items.forEach((item) => {
    Object.entries(item || {}).forEach(([property, count]) => {
      merged[property] = (merged[property] || 0) + count;
    });
  });
  return Object.fromEntries(Object.entries(merged).sort((a, b) => b[1] - a[1]));
}

const appJs = readText(path.join(root, "src", "app.js"));
const sourceJsFiles = listFiles(path.join(root, "src"), (filePath) => /\.(?:js|ts|tsx)$/.test(filePath));
const sourceJs = sourceJsFiles.map((filePath) => readText(filePath)).join("\n");
const componentsJs = readText(path.join(root, "src", "ui", "components.ts"));
const runtimeContractsJs = readText(path.join(root, "src", "ui_runtime_contracts.js"));
const cssSummaries = targetCssFiles.map(summarizeCssFile);
const runtimeUiStatesCss = readText(path.join(root, runtimeUiStatesCssFile));
const selectedModuleSummaries = selectedUiContractModules.map(summarizeSelectedUiModule);
const importantBlockSummaries = targetCssFiles.map((file) => ({
  file,
  ...countImportantByCssBlocks(file),
}));
const importantBlockTotals = importantBlockSummaries.reduce(
  (total, item) => {
    ["candidate", "protected", "other"].forEach((scope) => {
      total[scope] += item[scope] || 0;
      total.byFile[scope][item.file] = item[scope] || 0;
      Object.entries(item.byProperty?.[scope] || {}).forEach(([property, count]) => {
        total.byProperty[scope][property] = (total.byProperty[scope][property] || 0) + count;
      });
    });
    return total;
  },
  {
    candidate: 0,
    protected: 0,
    other: 0,
    byFile: {
      candidate: {},
      protected: {},
      other: {},
    },
    byProperty: {
      candidate: {},
      protected: {},
      other: {},
    },
  },
);
const moduleSurfaceBlockSummaries = targetCssFiles.map((file) => ({
  file,
  ...countModuleSurfaceByCssBlocks(file),
}));
const moduleSurfaceBlockTotals = moduleSurfaceBlockSummaries.reduce(
  (total, item) => {
    ["structural", "semantic", "other"].forEach((scope) => {
      total[scope] += item[scope] || 0;
      total.byFile[scope][item.file] = item[scope] || 0;
    });
    return total;
  },
  {
    structural: 0,
    semantic: 0,
    other: 0,
    byFile: {
      structural: {},
      semantic: {},
      other: {},
    },
  },
);
const previousReport = (() => {
  try {
    return JSON.parse(readText(reportPath));
  } catch {
    return null;
  }
})();

const report = {
  generatedAt: new Date().toISOString(),
  runLabel,
  purpose: "Fast non-visual measurement for the global UI contract optimization pass.",
  sourceOfTruth: {
    tokenFile: "styles/mes-ui-core.css",
    sharedCssEditPoint: "styles/ui/kit-polish.css",
    runtimeHelpers: "src/ui/components.ts",
    runtimeContractMap: "src/ui_runtime_contracts.js",
  },
  testAssignment: {
    name: "Fix once, affect many",
    description:
      "Change a shared surface/table/button variable or selector in the UI contract and verify that admin, weeklyProductionControl, planning and shiftWorkOrders inherit the same class of fix without local CSS edits.",
    evaluation:
      "Measure visual-contract adoption, helper usage and remaining local surface declarations before manual QA.",
  },
  contracts: {
    defaultModuleContractEnabled:
      /DEFAULT_UI_MODULE_CONTRACT\s*=\s*["']ops-soft-v1["']/.test(componentsJs)
      || /DEFAULT_UI_MODULE_CONTRACTS\s*=\s*\[[^\]]*["']ops-soft-v1["'][^\]]*["']visual-parity-v2["'][^\]]*\]/s.test(componentsJs),
    renderUiModulePageCallCount: countMatches(sourceJs, /\brenderUiModulePage\s*\(/g),
    contractModeOverrideOccurrences: countMatches(sourceJs, /contractMode\s*:/g),
    contractModeNoneOccurrences: countMatches(sourceJs, /contractMode\s*:\s*["']none["']/g),
    visualContractOccurrences: countMatches(sourceJs, /visualContract\s*:/g),
    opsSoftContractOccurrences: countMatches(sourceJs, /ops-soft-v1/g),
    dataUiContractSelectors: cssSummaries.reduce((sum, item) => sum + item.dataUiContractSelectors, 0),
    dataUiComponentSelectors: cssSummaries.reduce((sum, item) => sum + item.dataUiComponentSelectors, 0),
  },
  helperUsage: Object.fromEntries(
    helperNames.map((name) => [name, countMatches(sourceJs, new RegExp(`\\b${name}\\b`, "g"))]),
  ),
  helperAvailability: Object.fromEntries(
    helperNames.map((name) => [name, countMatches(componentsJs, new RegExp(`\\b${name}\\b`, "g")) > 0]),
  ),
  selectedModuleContractAdoption: {
    modules: selectedModuleSummaries,
    totals: sumSelectedUiModules(selectedModuleSummaries),
  },
  runtimeContractRegistry: {
    infoGridRegistered: runtimeContractsJs.includes("InfoGrid"),
    metricGridRegistered: runtimeContractsJs.includes("MetricGrid"),
    contractTokensRegistered: countMatches(runtimeContractsJs, /--mes-ui-contract-/g),
  },
  css: {
    totals: {
      localSurfaceDeclarations: cssSummaries.reduce((sum, item) => sum + item.localSurfaceDeclarations, 0),
      tokenizedSurfaceDeclarations: cssSummaries.reduce((sum, item) => sum + item.tokenizedSurfaceDeclarations, 0),
      hardcodedColorSurfaceDeclarations: cssSummaries.reduce((sum, item) => sum + item.hardcodedColorSurfaceDeclarations, 0),
      importantCount: cssSummaries.reduce((sum, item) => sum + item.importantCount, 0),
      moduleSurfaceRules: cssSummaries.reduce((sum, item) => sum + item.moduleSurfaceRules, 0),
      moduleSurfaceStructuralRules: moduleSurfaceBlockTotals.structural,
      moduleSurfaceSemanticRules: moduleSurfaceBlockTotals.semantic,
      moduleSurfaceOtherRules: moduleSurfaceBlockTotals.other,
      moduleSurfaceStructuralByFile: Object.fromEntries(
        Object.entries(moduleSurfaceBlockTotals.byFile.structural).sort((a, b) => b[1] - a[1]),
      ),
      moduleSurfaceSemanticByFile: Object.fromEntries(
        Object.entries(moduleSurfaceBlockTotals.byFile.semantic).sort((a, b) => b[1] - a[1]),
      ),
    },
    importantScope: {
      productionImportantCount: cssSummaries.reduce((sum, item) => sum + item.importantCount, 0),
      runtimeUiStatesImportantCount: countMatches(runtimeUiStatesCss, /!important/g),
      allKnownImportantCount:
        cssSummaries.reduce((sum, item) => sum + item.importantCount, 0) + countMatches(runtimeUiStatesCss, /!important/g),
      productionImportantCandidateCount: importantBlockTotals.candidate,
      productionImportantProtectedCount: importantBlockTotals.protected,
      productionImportantOtherCount: importantBlockTotals.other,
      productionImportantCandidateByFile: Object.fromEntries(
        Object.entries(importantBlockTotals.byFile.candidate).sort((a, b) => b[1] - a[1]),
      ),
      productionImportantProtectedByFile: Object.fromEntries(
        Object.entries(importantBlockTotals.byFile.protected).sort((a, b) => b[1] - a[1]),
      ),
      productionImportantOtherByFile: Object.fromEntries(
        Object.entries(importantBlockTotals.byFile.other).sort((a, b) => b[1] - a[1]),
      ),
      productionImportantCandidateByProperty: Object.fromEntries(
        Object.entries(importantBlockTotals.byProperty.candidate).sort((a, b) => b[1] - a[1]),
      ),
      productionTypographyImportantCount: cssSummaries.reduce(
        (sum, item) => sum + countImportantByProperties(readText(path.join(root, item.file)), safeTypographyImportantProperties),
        0,
      ),
      productionLayoutImportantCount: cssSummaries.reduce(
        (sum, item) => sum + countImportantByProperties(readText(path.join(root, item.file)), contractLayoutImportantProperties),
        0,
      ),
      productionImportantByProperty: mergePropertyCounts(
        cssSummaries.map((item) => countImportantByProperty(readText(path.join(root, item.file)))),
      ),
    },
    files: cssSummaries,
  },
  nextMeasurement:
    "After each migration pass, localSurfaceDeclarations/moduleSurfaceRules should fall while visualContractOccurrences/helperUsage should rise.",
};

report.durationMs = Math.round(performance.now() - startedAt);
report.previous = previousReport ? {
  generatedAt: previousReport.generatedAt || "",
  runLabel: previousReport.runLabel || "",
  visualContractOccurrences: previousReport.contracts?.visualContractOccurrences ?? null,
  opsSoftContractOccurrences: previousReport.contracts?.opsSoftContractOccurrences ?? null,
  defaultModuleContractEnabled: previousReport.contracts?.defaultModuleContractEnabled ?? null,
  renderUiModulePageCallCount: previousReport.contracts?.renderUiModulePageCallCount ?? null,
  contractModeOverrideOccurrences: previousReport.contracts?.contractModeOverrideOccurrences ?? null,
  contractModeNoneOccurrences: previousReport.contracts?.contractModeNoneOccurrences ?? null,
  localSurfaceDeclarations: previousReport.css?.totals?.localSurfaceDeclarations ?? null,
  tokenizedSurfaceDeclarations: previousReport.css?.totals?.tokenizedSurfaceDeclarations ?? null,
  hardcodedColorSurfaceDeclarations: previousReport.css?.totals?.hardcodedColorSurfaceDeclarations ?? null,
  importantCount: previousReport.css?.totals?.importantCount ?? null,
  productionImportantCount: previousReport.css?.importantScope?.productionImportantCount ?? null,
  productionImportantCandidateCount: previousReport.css?.importantScope?.productionImportantCandidateCount ?? null,
  productionImportantProtectedCount: previousReport.css?.importantScope?.productionImportantProtectedCount ?? null,
  productionImportantOtherCount: previousReport.css?.importantScope?.productionImportantOtherCount ?? null,
  runtimeUiStatesImportantCount: previousReport.css?.importantScope?.runtimeUiStatesImportantCount ?? null,
  productionTypographyImportantCount: previousReport.css?.importantScope?.productionTypographyImportantCount ?? null,
  productionLayoutImportantCount: previousReport.css?.importantScope?.productionLayoutImportantCount ?? null,
  moduleSurfaceRules: previousReport.css?.totals?.moduleSurfaceRules ?? null,
  moduleSurfaceStructuralRules: previousReport.css?.totals?.moduleSurfaceStructuralRules ?? null,
  moduleSurfaceSemanticRules: previousReport.css?.totals?.moduleSurfaceSemanticRules ?? null,
  moduleSurfaceOtherRules: previousReport.css?.totals?.moduleSurfaceOtherRules ?? null,
  selectedModuleManualTotal: previousReport.helperUsage?.selectedModuleContractAdoption?.totals?.manualTotal
    ?? previousReport.selectedModuleContractAdoption?.totals?.manualTotal
    ?? null,
  selectedModuleHelperTotal: previousReport.helperUsage?.selectedModuleContractAdoption?.totals?.helperTotal
    ?? previousReport.selectedModuleContractAdoption?.totals?.helperTotal
    ?? null,
  durationMs: previousReport.durationMs ?? null,
} : null;
report.delta = report.previous ? {
  visualContractOccurrences: report.contracts.visualContractOccurrences - report.previous.visualContractOccurrences,
  opsSoftContractOccurrences: report.contracts.opsSoftContractOccurrences - report.previous.opsSoftContractOccurrences,
  defaultModuleContractEnabled: report.previous.defaultModuleContractEnabled === null
    ? null
    : Number(report.contracts.defaultModuleContractEnabled) - Number(report.previous.defaultModuleContractEnabled),
  renderUiModulePageCallCount: report.previous.renderUiModulePageCallCount === null
    ? null
    : report.contracts.renderUiModulePageCallCount - report.previous.renderUiModulePageCallCount,
  contractModeOverrideOccurrences: report.previous.contractModeOverrideOccurrences === null
    ? null
    : report.contracts.contractModeOverrideOccurrences - report.previous.contractModeOverrideOccurrences,
  contractModeNoneOccurrences: report.previous.contractModeNoneOccurrences === null
    ? null
    : report.contracts.contractModeNoneOccurrences - report.previous.contractModeNoneOccurrences,
  localSurfaceDeclarations: report.css.totals.localSurfaceDeclarations - report.previous.localSurfaceDeclarations,
  tokenizedSurfaceDeclarations: report.previous.tokenizedSurfaceDeclarations === null
    ? null
    : report.css.totals.tokenizedSurfaceDeclarations - report.previous.tokenizedSurfaceDeclarations,
  hardcodedColorSurfaceDeclarations: report.css.totals.hardcodedColorSurfaceDeclarations - report.previous.hardcodedColorSurfaceDeclarations,
  importantCount: report.css.totals.importantCount - report.previous.importantCount,
  productionImportantCount: report.previous.productionImportantCount === null
    ? null
    : report.css.importantScope.productionImportantCount - report.previous.productionImportantCount,
  productionImportantCandidateCount: report.previous.productionImportantCandidateCount === null
    ? null
    : report.css.importantScope.productionImportantCandidateCount - report.previous.productionImportantCandidateCount,
  productionImportantProtectedCount: report.previous.productionImportantProtectedCount === null
    ? null
    : report.css.importantScope.productionImportantProtectedCount - report.previous.productionImportantProtectedCount,
  productionImportantOtherCount: report.previous.productionImportantOtherCount === null
    ? null
    : report.css.importantScope.productionImportantOtherCount - report.previous.productionImportantOtherCount,
  runtimeUiStatesImportantCount: report.previous.runtimeUiStatesImportantCount === null
    ? null
    : report.css.importantScope.runtimeUiStatesImportantCount - report.previous.runtimeUiStatesImportantCount,
  productionTypographyImportantCount: report.previous.productionTypographyImportantCount === null
    ? null
    : report.css.importantScope.productionTypographyImportantCount - report.previous.productionTypographyImportantCount,
  productionLayoutImportantCount: report.previous.productionLayoutImportantCount === null
    ? null
    : report.css.importantScope.productionLayoutImportantCount - report.previous.productionLayoutImportantCount,
  moduleSurfaceRules: report.css.totals.moduleSurfaceRules - report.previous.moduleSurfaceRules,
  moduleSurfaceStructuralRules: report.previous.moduleSurfaceStructuralRules === null
    ? null
    : report.css.totals.moduleSurfaceStructuralRules - report.previous.moduleSurfaceStructuralRules,
  moduleSurfaceSemanticRules: report.previous.moduleSurfaceSemanticRules === null
    ? null
    : report.css.totals.moduleSurfaceSemanticRules - report.previous.moduleSurfaceSemanticRules,
  moduleSurfaceOtherRules: report.previous.moduleSurfaceOtherRules === null
    ? null
    : report.css.totals.moduleSurfaceOtherRules - report.previous.moduleSurfaceOtherRules,
  selectedModuleManualTotal: report.previous.selectedModuleManualTotal === null
    ? null
    : report.selectedModuleContractAdoption.totals.manualTotal - report.previous.selectedModuleManualTotal,
  selectedModuleHelperTotal: report.previous.selectedModuleHelperTotal === null
    ? null
    : report.selectedModuleContractAdoption.totals.helperTotal - report.previous.selectedModuleHelperTotal,
  durationMs: report.previous.durationMs === null ? null : report.durationMs - report.previous.durationMs,
} : null;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.appendFileSync(historyPath, `${JSON.stringify({
  generatedAt: report.generatedAt,
  runLabel: report.runLabel,
  durationMs: report.durationMs,
  contracts: report.contracts,
	  cssTotals: report.css.totals,
  selectedModuleContractAdoption: report.selectedModuleContractAdoption,
  importantScope: report.css.importantScope,
  delta: report.delta,
})}\n`);

console.log(`UI contract impact report written: ${path.relative(root, reportPath)}`);
console.log(JSON.stringify({
  visualContractOccurrences: report.contracts.visualContractOccurrences,
  opsSoftContractOccurrences: report.contracts.opsSoftContractOccurrences,
  defaultModuleContractEnabled: report.contracts.defaultModuleContractEnabled,
  renderUiModulePageCallCount: report.contracts.renderUiModulePageCallCount,
  contractModeOverrideOccurrences: report.contracts.contractModeOverrideOccurrences,
  contractModeNoneOccurrences: report.contracts.contractModeNoneOccurrences,
  localSurfaceDeclarations: report.css.totals.localSurfaceDeclarations,
  tokenizedSurfaceDeclarations: report.css.totals.tokenizedSurfaceDeclarations,
  hardcodedColorSurfaceDeclarations: report.css.totals.hardcodedColorSurfaceDeclarations,
  importantCount: report.css.totals.importantCount,
  productionImportantCount: report.css.importantScope.productionImportantCount,
  runtimeUiStatesImportantCount: report.css.importantScope.runtimeUiStatesImportantCount,
  productionTypographyImportantCount: report.css.importantScope.productionTypographyImportantCount,
  productionLayoutImportantCount: report.css.importantScope.productionLayoutImportantCount,
  moduleSurfaceRules: report.css.totals.moduleSurfaceRules,
  selectedModuleManualTotal: report.selectedModuleContractAdoption.totals.manualTotal,
  selectedModuleHelperTotal: report.selectedModuleContractAdoption.totals.helperTotal,
  durationMs: report.durationMs,
  delta: report.delta,
}, null, 2));
