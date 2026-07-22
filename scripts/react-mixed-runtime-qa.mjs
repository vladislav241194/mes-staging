import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ledger = JSON.parse(await readFile(join(repositoryRoot, "experiments", "react-migration", "cutover-ledger.json"), "utf8"));
const runtimePolicy = JSON.parse(await readFile(join(repositoryRoot, "react-runtime-policy.json"), "utf8"));
const indexHtml = await readFile(join(repositoryRoot, "index.html"), "utf8");
const appSource = await readFile(join(repositoryRoot, "src", "app.js"), "utf8");
const weeklyHostSource = await readFile(join(repositoryRoot, "src", "modules", "weekly_production_control", "react_island_host.js"), "utf8");
const weeklyAdapterSource = await readFile(join(repositoryRoot, "experiments", "react-migration", "src", "modules", "weekly-production-control", "adapter.ts"), "utf8");

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }))).flat();
}

const sourceFiles = await listFiles(join(repositoryRoot, "src"));
const activeJavaScriptFiles = sourceFiles.filter((path) => extname(path) === ".js");
const activeTypeScriptFiles = sourceFiles.filter((path) => [".ts", ".tsx"].includes(extname(path)));
const activeTypeScriptRelativePaths = activeTypeScriptFiles.map((path) => path.slice(repositoryRoot.length + 1)).sort();
const activeJavaScriptLines = (await Promise.all(activeJavaScriptFiles.map(async (path) => (
  (await readFile(path, "utf8")).split("\n").length - 1
)))).reduce((sum, lines) => sum + lines, 0);
const requestLegacyRenderDefinitions = (appSource.match(/requestLegacyRender\s*:/g) || []).length;

assert.match(indexHtml, /<script type="module" src="\.\/src\/app\.js[^"\n]*"><\/script>/,
  "the mixed-runtime audit must track the actual active frontend boot entry");
assert.deepEqual(activeTypeScriptRelativePaths, [
  "src/data.ts",
  "src/modules/contour_admin/command_contract.ts",
  "src/modules/contour_admin/server_owner_client.ts",
  "src/modules/domain_api/planning_period_read_model.ts",
  "src/modules/domain_api/planning_runtime_projection_read_model.ts",
  "src/modules/domain_api/shift_execution_commands.ts",
  "src/modules/domain_api/shift_execution_dispatch_read_model.ts",
  "src/modules/domain_api/specifications2_publish_commands.ts",
  "src/modules/domain_api/specifications2_revisions_read_model.ts",
  "src/modules/domain_api/specifications2_work_order_commands.ts",
  "src/modules/domain_api/system_domains_commands.ts",
  "src/modules/domain_api/system_domains_read_model.ts",
  "src/modules/domain_api/work_orders_read_model.ts",
  "src/modules/marking/api_client.ts",
  "src/modules/react_runtime_policy.ts",
  "src/modules/shift_work_orders/journal_owner.ts",
  "src/modules/shift_work_orders/production_model.ts",
  "src/modules/specifications2/production_owner.ts",
  "src/types.ts",
  "src/ui/formatters.ts",
  "src/ui/html.ts",
  "src/ui/long_task_overlay.ts",
], "active src TypeScript must grow only through explicitly audited production boundaries");
assert(activeJavaScriptLines < 80_000, "active JavaScript inventory regrew above the audited post-retirement ceiling");
assert.equal(requestLegacyRenderDefinitions, 0, "the app shell must not retain any same-release legacy-render callback");

for (const module of ledger.modules) {
  assert.equal(typeof module.visibleLegacyRendererPath, "boolean", `${module.id}: visibleLegacyRendererPath is required`);
  assert.equal(typeof module.runtimeLegacyModelDependency, "boolean", `${module.id}: runtimeLegacyModelDependency is required`);
  assert.equal(module.normalLegacyPath, module.visibleLegacyRendererPath || module.runtimeLegacyModelDependency,
    `${module.id}: normalLegacyPath must be the aggregate mixed-runtime state`);
  if (module.productionReady) {
    assert.equal(module.visibleLegacyRendererPath, false, `${module.id}: production-ready renderer must be React-only`);
    assert.equal(module.runtimeLegacyModelDependency, false, `${module.id}: production-ready model must be legacy-independent`);
  }
}

const weekly = ledger.modules.find((module) => module.id === "weeklyProductionControl");
assert(weekly, "Weekly Production Control ledger row is missing");
assert.equal(runtimePolicy.surfaces?.weeklyProductionControl, "react", "Weekly permanent policy must remain default-on React");
assert.match(weeklyHostSource, /canFallbackToLegacy:\s*\(\)\s*=>\s*false/,
  "every current Weekly renderer failure must remain fail-closed inside React");
assert.equal(weekly.visibleLegacyRendererPath, false, "permanent Weekly has no visible legacy renderer path");

const legacyPayloadDependency = /getPayload:\s*\(\)\s*=>\s*\(\{\s*model:\s*getWeeklyProductionControlRuntimeInstance\(\)\.getWeeklyProductionControlModel\(\)\s*\}\)/.test(appSource);
const typedProductionPayload = /getPayload:\s*\(\)\s*=>\s*\(\{\s*productionInput:\s*getWeeklyProductionControlReadModelInput\(\)\s*\}\)/.test(appSource)
  && /production-read-model/.test(weeklyAdapterSource);
const currentWeeklyRuntimeHasNoLegacy = !/modules\/weekly_production_control\/render\.js|selectWeeklyProductionControlRuntime|getWeeklyProductionControlLegacyRuntimeInstance|getWeeklyProductionControlRuntimeInstance|weeklyProductionControlLoadingInstance/.test(appSource)
  && /initialize:\s*\(\)\s*=>\s*weeklyProductionControlProductionRuntimeInstance/.test(appSource)
  && /weeklyProductionControlReactIslandHost\.prepareRender\(\);\s*return weeklyProductionControlReactIslandHost\.renderTarget\(\)/.test(appSource);

const detectedWeeklyLegacyModelDependency = legacyPayloadDependency || !typedProductionPayload || !currentWeeklyRuntimeHasNoLegacy;
assert.equal(weekly.runtimeLegacyModelDependency, detectedWeeklyLegacyModelDependency,
  "accepted Weekly ledger evidence must fail closed when its import graph reaches the legacy model factory");
assert.equal(detectedWeeklyLegacyModelDependency, false,
  "accepted-live Weekly must retain its typed payload and exclude the renderer from current runtime");
assert.equal(weekly.acceptedRuntimeEvidence?.status, "accepted-live");
assert.equal(weekly.acceptedRuntimeEvidence?.release, "v.1.500.26-097d66c");
assert.equal(weekly.acceptedRuntimeEvidence?.freshRead, "verified");
assert.equal(weekly.acceptedRuntimeEvidence?.rollbackReactivationDrill, "verified");
assert.equal(Object.hasOwn(weekly, "candidateRuntimeLegacyModelDependency"), false);
assert.equal(Object.hasOwn(weekly, "candidateEvidence"), false);
const expectedProgress = weekly.runtimeLegacyModelDependency ? 48 : 50;
const computedProgress = ledger.criteria.reduce((sum, criterion) => sum + criterion.earned, 0);
assert.equal(ledger.currentProgress, expectedProgress, "accepted-live mixed-runtime evidence must determine the honest cutover progress");
assert.equal(computedProgress, expectedProgress, "criteria must match accepted-live evidence");

console.log(`React mixed-runtime QA: OK (${expectedProgress}% honest progress)`);
console.log(`- active src: ${activeJavaScriptFiles.length} JavaScript files, ${activeJavaScriptLines} lines, ${activeTypeScriptFiles.length} TypeScript files`);
console.log(`- requestLegacyRender definitions in app shell: ${requestLegacyRenderDefinitions}`);
console.log(`- Weekly accepted live: visible legacy renderer=${weekly.visibleLegacyRendererPath}, runtime legacy model=${weekly.runtimeLegacyModelDependency}`);
console.log(`- Weekly evidence: ${weekly.acceptedRuntimeEvidence?.status} on ${weekly.acceptedRuntimeEvidence?.release}`);
