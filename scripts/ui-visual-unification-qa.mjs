import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MES_MODULE_FLOW_SEQUENCE } from "../src/mes_contracts.js";
import {
  UI_RUNTIME_COMPONENT_CONTRACTS,
  UI_VISUAL_HARD_EXCEPTIONS,
  UI_VISUAL_MASTER_STAGES,
  UI_VISUAL_MODULE_WAVES,
  UI_VISUAL_STANDARD_COMPONENTS,
  UI_VISUAL_UNIFICATION_CONTRACT,
} from "../src/ui_runtime_contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const reportPath = path.join(rootDir, "reports", "ui-visual-unification.json");
const strict = process.argv.includes("--strict");

const adoptionTargets = {
  renderUiFormField: 20,
  renderUiFormGrid: 4,
  renderUiFormActions: 3,
  toolbarAndFilterBar: 3,
  renderUiModalFrame: 4,
  renderUiTableControlAttributes: 2,
};

async function collectFiles(relativeDir, extension) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(relativePath, extension));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) files.push(relativePath);
  }

  return files.sort();
}

function countMatches(source, regexp) {
  return (source.match(regexp) || []).length;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates].sort((left, right) => left.localeCompare(right));
}

const runtimeFiles = ["src/app.js", ...await collectFiles(path.join("src", "modules"), ".js")];
const cssFiles = ["styles.css", "styles/mes-ui-core.css", ...await collectFiles("styles", ".css")]
  .filter((file, index, files) => files.indexOf(file) === index);

const [runtimeSources, cssSources, uiComponentsSource] = await Promise.all([
  Promise.all(runtimeFiles.map(async (file) => ({ file, source: await fs.readFile(path.join(rootDir, file), "utf8") }))),
  Promise.all(cssFiles.map(async (file) => ({ file, source: await fs.readFile(path.join(rootDir, file), "utf8") }))),
  fs.readFile(path.join(rootDir, "src", "ui", "components.js"), "utf8"),
]);

const runtimeSource = runtimeSources.map(({ source }) => source).join("\n");
const cssSource = cssSources.map(({ source }) => source).join("\n");
const failures = [];
const warnings = [];

function assertContract(condition, message) {
  if (!condition) failures.push(message);
}

const stageIds = UI_VISUAL_MASTER_STAGES.map((stage) => stage.id);
const duplicateStageIds = findDuplicates(stageIds);
assertContract(UI_VISUAL_UNIFICATION_CONTRACT === "visual-unification-v1", "Unexpected visual unification contract id.");
assertContract(UI_VISUAL_MASTER_STAGES.length === 7, `Master plan must contain 7 stages, got ${UI_VISUAL_MASTER_STAGES.length}.`);
assertContract(!duplicateStageIds.length, `Duplicate master stage ids: ${duplicateStageIds.join(", ")}.`);
UI_VISUAL_MASTER_STAGES.forEach((stage) => {
  assertContract(Boolean(stage.id && stage.label), `Master stage requires id and label: ${JSON.stringify(stage)}.`);
});

const waveModuleIds = UI_VISUAL_MODULE_WAVES.flatMap((wave) => wave.moduleIds || []);
const duplicateWaveModuleIds = findDuplicates(waveModuleIds);
const missingWaveModules = MES_MODULE_FLOW_SEQUENCE.filter((moduleId) => !waveModuleIds.includes(moduleId));
const unknownWaveModules = waveModuleIds.filter((moduleId) => !MES_MODULE_FLOW_SEQUENCE.includes(moduleId));
assertContract(waveModuleIds.length === MES_MODULE_FLOW_SEQUENCE.length, `Module waves must cover ${MES_MODULE_FLOW_SEQUENCE.length} runtime modules, got ${waveModuleIds.length}.`);
assertContract(!duplicateWaveModuleIds.length, `Modules assigned to multiple waves: ${duplicateWaveModuleIds.join(", ")}.`);
assertContract(!missingWaveModules.length, `Runtime modules missing from visual waves: ${missingWaveModules.join(", ")}.`);
assertContract(!unknownWaveModules.length, `Visual waves reference unknown modules: ${unknownWaveModules.join(", ")}.`);
UI_VISUAL_MODULE_WAVES.forEach((wave) => {
  assertContract(Boolean(wave.id && wave.label && wave.contract), `Visual wave requires id, label and contract: ${JSON.stringify(wave)}.`);
  assertContract(Boolean(wave.moduleIds?.length), `Visual wave ${wave.id || "unknown"} has no modules.`);
});

const requiredExceptionIds = [
  "gantt-geometry",
  "specifications2-geometry",
  "auth-flow",
  "contour-admin",
  "print-geometry",
];
const exceptionIds = UI_VISUAL_HARD_EXCEPTIONS.map((exception) => exception.id);
const protectedModuleIds = sortedUnique(UI_VISUAL_HARD_EXCEPTIONS.flatMap((exception) => exception.moduleIds || []));
const unknownProtectedModules = protectedModuleIds.filter((moduleId) => !waveModuleIds.includes(moduleId));
assertContract(requiredExceptionIds.every((id) => exceptionIds.includes(id)), "Visual hard-exception registry is incomplete.");
assertContract(!unknownProtectedModules.length, `Hard exceptions reference modules outside visual waves: ${unknownProtectedModules.join(", ")}.`);
UI_VISUAL_HARD_EXCEPTIONS.forEach((exception) => {
  assertContract(Boolean(exception.id && exception.scope), `Hard exception requires id and scope: ${JSON.stringify(exception)}.`);
  assertContract(Boolean(exception.moduleIds?.length), `Hard exception ${exception.id || "unknown"} has no modules.`);
  assertContract(Boolean(exception.protectedAreas?.length), `Hard exception ${exception.id || "unknown"} has no protected areas.`);
});

const runtimeComponentRegistry = new Map(UI_RUNTIME_COMPONENT_CONTRACTS.map((contract) => [contract.component, contract]));
const componentCoverage = UI_VISUAL_STANDARD_COMPONENTS.map((component) => {
  const contract = runtimeComponentRegistry.get(component);
  const helperNames = contract?.helperNames || [];
  const cssSelectors = contract?.cssSelectors || [];
  const missingHelpers = helperNames.filter((helperName) => !new RegExp(`\\bfunction\\s+${helperName}\\b`).test(uiComponentsSource));
  const availableCssSelectors = cssSelectors.filter((selector) => cssSource.includes(selector));
  const markerAvailable = uiComponentsSource.includes(`data-ui-component="${component}"`);

  assertContract(Boolean(contract), `Standard component ${component} is missing from UI_RUNTIME_COMPONENT_CONTRACTS.`);
  assertContract(Boolean(helperNames.length), `Standard component ${component} has no registered helper.`);
  assertContract(!missingHelpers.length, `Standard component ${component} is missing helpers: ${missingHelpers.join(", ")}.`);
  assertContract(Boolean(cssSelectors.length && availableCssSelectors.length), `Standard component ${component} has no available registered CSS selector.`);
  assertContract(markerAvailable, `Standard component ${component} has no data-ui-component marker in components.js.`);

  return {
    component,
    registered: Boolean(contract),
    helperNames,
    missingHelpers,
    cssSelectors,
    availableCssSelectors,
    markerAvailable,
  };
});

const helperAdoption = {
  renderUiFormSection: countMatches(runtimeSource, /\brenderUiFormSection\s*\(/g),
  renderUiFormGrid: countMatches(runtimeSource, /\brenderUiFormGrid\s*\(/g),
  renderUiFormRow: countMatches(runtimeSource, /\brenderUiFormRow\s*\(/g),
  renderUiFormField: countMatches(runtimeSource, /\brenderUiFormField\s*\(/g),
  renderUiFormActions: countMatches(runtimeSource, /\brenderUiFormActions\s*\(/g),
  renderUiToolbar: countMatches(runtimeSource, /\brenderUiToolbar\s*\(/g),
  renderUiFilterBar: countMatches(runtimeSource, /\brenderUiFilterBar\s*\(/g),
  renderUiModalFrame: countMatches(runtimeSource, /\brenderUiModalFrame\s*\(/g),
  renderUiModalShell: countMatches(runtimeSource, /\brenderUiModalShell\s*\(/g),
  renderUiDrawerFrame: countMatches(runtimeSource, /\brenderUiDrawerFrame\s*\(/g),
  renderUiDrawerShell: countMatches(runtimeSource, /\brenderUiDrawerShell\s*\(/g),
  renderUiSystemState: countMatches(runtimeSource, /\brenderUiSystemState\s*\(/g),
  renderUiTableControlAttributes: countMatches(runtimeSource, /\brenderUiTableControlAttributes\s*\(/g),
};
helperAdoption.toolbarAndFilterBar = helperAdoption.renderUiToolbar + helperAdoption.renderUiFilterBar;

const targetResults = Object.entries(adoptionTargets).map(([metric, minimum]) => {
  const actual = helperAdoption[metric] || 0;
  const passed = actual >= minimum;
  if (!passed) warnings.push(`${metric}: expected at least ${minimum} runtime call sites, got ${actual}.`);
  return { metric, actual, minimum, passed };
});

const rawSourceControls = {
  inputs: countMatches(runtimeSource, /<input\b/gi),
  selects: countMatches(runtimeSource, /<select\b/gi),
  textareas: countMatches(runtimeSource, /<textarea\b/gi),
  buttons: countMatches(runtimeSource, /<button\b/gi),
  forms: countMatches(runtimeSource, /<form\b/gi),
  tables: countMatches(runtimeSource, /<table\b/gi),
  inlineStyles: countMatches(runtimeSource, /\sstyle\s*=\s*["']/gi),
};
rawSourceControls.formControls = rawSourceControls.inputs + rawSourceControls.selects + rawSourceControls.textareas;

const effectiveFailures = strict ? [...failures, ...warnings] : [...failures];
const report = {
  version: 1,
  contract: UI_VISUAL_UNIFICATION_CONTRACT,
  generatedAt: new Date().toISOString(),
  strict,
  status: effectiveFailures.length ? "failed" : warnings.length ? "passed-with-warnings" : "passed",
  scan: {
    runtimeFiles: runtimeFiles.length,
    cssFiles: cssFiles.length,
  },
  masterPlan: {
    stageCount: UI_VISUAL_MASTER_STAGES.length,
    stageIds,
    duplicateStageIds,
  },
  moduleCoverage: {
    waveCount: UI_VISUAL_MODULE_WAVES.length,
    moduleCount: waveModuleIds.length,
    duplicateModuleIds: duplicateWaveModuleIds,
    missingModuleIds: missingWaveModules,
    unknownModuleIds: unknownWaveModules,
    waves: UI_VISUAL_MODULE_WAVES,
  },
  hardExceptions: {
    exceptionCount: UI_VISUAL_HARD_EXCEPTIONS.length,
    protectedModuleIds,
    entries: UI_VISUAL_HARD_EXCEPTIONS,
  },
  standardComponents: {
    expected: UI_VISUAL_STANDARD_COMPONENTS.length,
    covered: componentCoverage.filter((item) => item.registered && !item.missingHelpers.length && item.availableCssSelectors.length && item.markerAvailable).length,
    entries: componentCoverage,
  },
  adoption: {
    helpers: helperAdoption,
    targets: targetResults,
  },
  rawSourceControls,
  warnings,
  failures,
  effectiveFailures,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log("MES UI Visual Unification QA");
console.log(`Mode: ${strict ? "strict" : "non-strict"}`);
console.log(`Contract: ${UI_VISUAL_UNIFICATION_CONTRACT}`);
console.log(`Master stages: ${UI_VISUAL_MASTER_STAGES.length}/7`);
console.log(`Module wave coverage: ${waveModuleIds.length}/${MES_MODULE_FLOW_SEQUENCE.length} across ${UI_VISUAL_MODULE_WAVES.length} waves`);
console.log(`Standard components: ${report.standardComponents.covered}/${report.standardComponents.expected}`);
console.log(`Protected modules: ${protectedModuleIds.length} (${protectedModuleIds.join(", ")})`);
console.log(`Runtime files scanned: ${runtimeFiles.length}`);
console.log(`FormField/FormGrid/FormActions: ${helperAdoption.renderUiFormField}/${helperAdoption.renderUiFormGrid}/${helperAdoption.renderUiFormActions}`);
console.log(`Toolbar + FilterBar: ${helperAdoption.toolbarAndFilterBar}`);
console.log(`ModalFrame: ${helperAdoption.renderUiModalFrame}`);
console.log(`Raw form controls: ${rawSourceControls.formControls}; buttons: ${rawSourceControls.buttons}; tables: ${rawSourceControls.tables}; inline styles: ${rawSourceControls.inlineStyles}`);
console.log(`Report: ${path.relative(rootDir, reportPath)}`);

warnings.forEach((message) => console.warn(`WARN: ${message}`));
failures.forEach((message) => console.error(`FAIL: ${message}`));

if (effectiveFailures.length) {
  if (strict && warnings.length) console.error(`FAIL: strict mode promoted ${warnings.length} adoption warning(s).`);
  process.exitCode = 1;
} else {
  console.log(warnings.length ? `OK: contract is structurally valid with ${warnings.length} adoption warning(s).` : "OK: visual unification contract and adoption targets are valid.");
}
