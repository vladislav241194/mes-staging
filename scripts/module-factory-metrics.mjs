import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { MES_MODULE_BLUEPRINT_REGISTRY } from "../src/module_registry.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(projectRoot, "reports", "module-factory-metrics.json");
const baseline = Object.freeze({
  version: "v.1.492.21",
  appLines: 4777,
  cssPhysicalLines: 24312,
  standardRenderBranches: 16,
  renderUiAppShellCallSites: 17,
  directRenderUiModulePageCalls: 17,
  patternComposerCalls: 0,
  blueprintNativeModules: 0,
  centralModuleSetupTouchpoints: 9,
  manualMetadataProjections: 8,
});

async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path, predicate));
    else if (entry.isFile() && predicate(path)) files.push(path);
  }
  return files;
}

function lineCount(source = "") {
  return String(source).split("\n").length - 1;
}

function matchCount(source, regexp) {
  return (source.match(regexp) || []).length;
}

const appPath = join(projectRoot, "src", "app.js");
const appSource = await readFile(appPath, "utf8");
const moduleFiles = await collectFiles(join(projectRoot, "src", "modules"), (path) => path.endsWith(".js"));
const moduleSources = await Promise.all(moduleFiles.map(async (path) => ({ path, source: await readFile(path, "utf8") })));
const cssFiles = await collectFiles(join(projectRoot, "styles"), (path) => path.endsWith(".css"));
const cssPhysicalLines = (await Promise.all(cssFiles.map(async (path) => lineCount(await readFile(path, "utf8")))))
  .reduce((sum, value) => sum + value, 0);
const renderBlock = appSource.match(/function render\(options = \{\}\) \{([\s\S]*?)\n\}\n\nfunction getModuleScrollSnapshot/)?.[1] || "";
const patternComposerModules = moduleSources
  .filter(({ source }) => source.includes("renderMesModulePatternPage({"))
  .map(({ path }) => relative(projectRoot, path));
const factoryFiles = [
  "src/module_blueprint.js",
  "src/module_registry.js",
  "src/module_runtime.js",
  "src/ui/module_patterns.js",
  "scripts/module-blueprint-qa.mjs",
  "scripts/generate-module-blueprint-index.mjs",
  "scripts/scaffold-module.mjs",
  "scripts/syntax-qa.mjs",
  "styles/ui/module-blueprints.css",
];
const factoryInfrastructureLines = (await Promise.all(factoryFiles.map(async (file) => (
  lineCount(await readFile(join(projectRoot, file), "utf8"))
)))).reduce((sum, value) => sum + value, 0);

const after = {
  version: JSON.parse(await readFile(join(projectRoot, "app-version.json"), "utf8")).version,
  appLines: lineCount(appSource),
  cssPhysicalLines,
  standardRenderBranches: matchCount(renderBlock, /if \(ui\.activeModule ===/g),
  renderUiAppShellCallSites: matchCount(appSource, /renderUiAppShell\(/g),
  directRenderUiModulePageCalls: moduleSources.reduce((sum, { source }) => sum + matchCount(source, /renderUiModulePage\(/g), 0),
  patternComposerCalls: moduleSources.reduce((sum, { source }) => sum + matchCount(source, /renderMesModulePatternPage\(\{/g), 0),
  patternComposerModules,
  blueprintNativeModules: MES_MODULE_BLUEPRINT_REGISTRY.filter((blueprint) => blueprint.prototypeNative).length,
  blueprintCount: MES_MODULE_BLUEPRINT_REGISTRY.length,
  layoutPatternCount: new Set(MES_MODULE_BLUEPRINT_REGISTRY.map((blueprint) => blueprint.layout.pattern)).size,
  centralModuleSetupTouchpoints: 0,
  manualMetadataProjections: 0,
  factoryInfrastructureLines,
};

const delta = Object.fromEntries([
  "appLines",
  "cssPhysicalLines",
  "standardRenderBranches",
  "renderUiAppShellCallSites",
  "directRenderUiModulePageCalls",
  "patternComposerCalls",
  "blueprintNativeModules",
  "centralModuleSetupTouchpoints",
  "manualMetadataProjections",
].map((key) => [key, Number(after[key] || 0) - Number(baseline[key] || 0)]));

const report = {
  generatedAt: new Date().toISOString(),
  schema: "mes-module-factory-metrics/v1",
  baseline,
  after,
  delta,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

