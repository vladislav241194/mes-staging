import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MES_MODULE_FEATURE_REGISTRY } from "../src/feature_registry.js";
import { GENERATED_MODULE_BLUEPRINTS } from "../src/generated/module_blueprint_index.js";
import { createGeneratedModuleRuntimeAdapters } from "../src/generated/module_runtime_index.js";
import { getMesCustomIconName } from "../src/icons/custom-mes/registry.js";
import {
  MES_MODULE_FLOW_CONTRACTS,
  MES_MODULE_FLOW_SEQUENCE,
} from "../src/mes_contracts.js";
import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  MES_MODULE_NAVIGATION_GROUPS,
  MES_MODULE_NAVIGATION_REGISTRY,
  MES_MODULE_NAVIGATION_SCOPES,
} from "../src/module_registry.js";
import {
  MES_MODULE_HEADER_MODES,
  MES_MODULE_RUNTIME_LIFECYCLES,
  MES_MODULE_RUNTIME_KINDS,
  MES_MODULE_SIDEBAR_MODES,
} from "../src/module_blueprint.js";
import { createMesModuleRuntime } from "../src/module_runtime.js";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";
import {
  HARD_UI_RUNTIME_MODULE_IDS,
  SPECIAL_UI_RUNTIME_MODULE_IDS,
} from "../src/ui/contracts/runtime-contracts.js";
import { UI_VISUAL_MODULE_WAVES } from "../src/ui/contracts/visual-unification-contracts.js";
import { UI_REGRESSION_MODULE_PROFILES } from "../src/ui_regression_exceptions.js";
import { syncGeneratedModuleBlueprintIndexes } from "./generate-module-blueprint-index.mjs";
import { scaffoldModule } from "./scaffold-module.mjs";

const [{ createUiRenderers }, { createMesModulePatternRenderer }] = await Promise.all([
  withBundledTypeScriptClient(
    new URL("../src/ui/components.ts", import.meta.url),
    async (module) => module,
    { prefix: "mes-ui-components-qa-" },
  ),
  withBundledTypeScriptClient(
    new URL("../src/ui/module_patterns.ts", import.meta.url),
    async (module) => module,
    { prefix: "mes-ui-module-patterns-qa-" },
  ),
]);

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(projectRoot, "reports", "module-factory-enrollment.json");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertThrows(callback, expectedPattern, message) {
  try {
    callback();
    failures.push(message);
  } catch (error) {
    assert(expectedPattern.test(String(error?.message || error)), `${message}: unexpected error ${error?.message || error}`);
  }
}

function sorted(values = []) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function sameSet(left = [], right = []) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

async function pathExists(relativePath) {
  try {
    await stat(join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

const blueprintIds = MES_MODULE_BLUEPRINT_REGISTRY.map((blueprint) => blueprint.id);
const navigationIds = MES_MODULE_NAVIGATION_REGISTRY.map((moduleItem) => moduleItem.id);
const runtimeIds = [...HARD_UI_RUNTIME_MODULE_IDS, ...SPECIAL_UI_RUNTIME_MODULE_IDS];
const featureIds = MES_MODULE_FEATURE_REGISTRY.map((feature) => feature.moduleId);
const regressionIds = Object.keys(UI_REGRESSION_MODULE_PROFILES);
const waveIds = UI_VISUAL_MODULE_WAVES.flatMap((wave) => wave.moduleIds);
const flowContractIds = Object.keys(MES_MODULE_FLOW_CONTRACTS);

[
  ["navigation", navigationIds],
  ["flow sequence", MES_MODULE_FLOW_SEQUENCE],
  ["flow contracts", flowContractIds],
  ["runtime coverage", runtimeIds],
  ["feature registry", featureIds],
  ["regression profiles", regressionIds],
  ["visual waves", waveIds],
].forEach(([label, ids]) => {
  assert(sameSet(blueprintIds, ids), `factory-registry-bijection failed for ${label}: expected=${sorted(blueprintIds)} actual=${sorted(ids)}`);
});

const blueprintById = new Map(MES_MODULE_BLUEPRINT_REGISTRY.map((blueprint) => [blueprint.id, blueprint]));
const patternRenderers = createUiRenderers({ icon: () => "" });
const renderPatternPage = createMesModulePatternRenderer({
  getBlueprint: (moduleId) => blueprintById.get(moduleId) || null,
  renderUiModuleHeader: patternRenderers.renderUiModuleHeader,
  renderUiModulePage: patternRenderers.renderUiModulePage,
  renderUiModuleSidebar: patternRenderers.renderUiModuleSidebar,
});
MES_MODULE_NAVIGATION_REGISTRY.forEach((navigation) => {
  const blueprint = blueprintById.get(navigation.id);
  assert(blueprint?.label === navigation.label, `${navigation.id}: navigation label drift`);
  assert(blueprint?.icon === navigation.icon, `${navigation.id}: navigation icon drift`);
  assert(blueprint?.navigation.groupId === navigation.groupId, `${navigation.id}: navigation group drift`);
  assert(blueprint?.navigation.scope === navigation.scope, `${navigation.id}: navigation scope drift`);
});

const navigationGroupIds = new Set(MES_MODULE_NAVIGATION_GROUPS.map((group) => group.id));
const enrollment = [];
for (const blueprint of MES_MODULE_BLUEPRINT_REGISTRY) {
  const contract = MES_MODULE_FLOW_CONTRACTS[blueprint.id];
  const feature = MES_MODULE_FEATURE_REGISTRY.find((item) => item.moduleId === blueprint.id);
  const publicModule = blueprint.navigation.scope !== MES_MODULE_NAVIGATION_SCOPES.ADMIN_ONLY;
  const userModule = blueprint.navigation.scope === MES_MODULE_NAVIGATION_SCOPES.USER;
  const protectedModule = blueprint.qa.visualWave === "protected";
  const roleIds = Object.keys(blueprint.access.defaultRoleActions || {});
  const ownedFiles = blueprint.ownership.files || [];

  assert(Boolean(contract), `${blueprint.id}: flow contract missing`);
  assert(contract?.id === blueprint.id, `${blueprint.id}: flow contract id drift`);
  assert(contract?.label === blueprint.label, `${blueprint.id}: flow label drift`);
  assert(Array.isArray(contract?.reads) && Array.isArray(contract?.writes), `${blueprint.id}: flow read/write arrays missing`);
  assert(!userModule || navigationGroupIds.has(blueprint.navigation.groupId), `${blueprint.id}: unknown navigation group`);
  assert(!userModule || roleIds.length > 0 || blueprint.access.nonAdminReachability === "documented-exception", `${blueprint.id}: factory-role-reachability failed`);
  assert(Boolean(getMesCustomIconName(blueprint.icon)), `${blueprint.id}: factory-icon-resolves failed for ${blueprint.icon}`);
  assert(Boolean(feature), `${blueprint.id}: feature ownership missing`);
  assert(Boolean(blueprint.runtime.instanceKey), `${blueprint.id}: runtime instanceKey is missing`);
  assert(Boolean(blueprint.runtime.lifecycle), `${blueprint.id}: runtime lifecycle is missing`);
  assert(ownedFiles.every((file) => feature?.files.includes(file)), `${blueprint.id}: factory-owned-files missing from feature registry`);
  assert(!blueprint.capabilities.table || blueprint.qa.regression.hasTable === true, `${blueprint.id}: table capability is not enrolled in regression`);
  assert(!blueprint.capabilities.tree || blueprint.qa.regression.hasTree === true || protectedModule, `${blueprint.id}: tree capability is not enrolled in regression`);
  assert(!blueprint.capabilities.actions || blueprint.qa.regression.hasActions === true || protectedModule, `${blueprint.id}: action capability is not enrolled in regression`);
  assert(!blueprint.capabilities.overlays.length || blueprint.qa.overlayProbeSelector || blueprint.qa.overlayProbeException, `${blueprint.id}: overlay capability has no probe or documented exception`);
  assert(!blueprint.qa.overlayProbeSelector || blueprint.qa.regression.hasOverlayProbe === true, `${blueprint.id}: overlay selector exists without hasOverlayProbe`);

  if (blueprint.runtime.kind === MES_MODULE_RUNTIME_KINDS.STANDARD) {
    const patternHtml = renderPatternPage({
      moduleId: blueprint.id,
      sidebar: blueprint.layout.sidebar === MES_MODULE_SIDEBAR_MODES.REQUIRED
        ? { title: blueprint.label, body: "<span>sidebar</span>" }
        : null,
      header: blueprint.layout.header === MES_MODULE_HEADER_MODES.REQUIRED
        ? { title: blueprint.label }
        : null,
      content: "<span>content</span>",
    });
    assert(patternHtml.includes(`data-module-blueprint="${blueprint.id}"`), `${blueprint.id}: factory-render-contract lost blueprint marker`);
    assert(patternHtml.includes(`data-ui-pattern="${blueprint.layout.pattern}"`), `${blueprint.id}: factory-render-contract lost pattern marker`);
    assert(patternHtml.includes('data-ui-runtime="hard-v1"'), `${blueprint.id}: factory-render-contract lost hard runtime marker`);
  }

  if (blueprint.prototypeNative) {
    const writes = contract?.writes || [];
    const featureCss = feature?.ui.filter((file) => file.endsWith(".css")) || [];
    assert(sameSet(featureCss, blueprint.ownership.css), `${blueprint.id}: prototype effective CSS ownership drift`);
    assert(sameSet(feature?.storage || [], blueprint.ownership.storage), `${blueprint.id}: prototype effective storage ownership drift`);
    assert(sameSet(feature?.api || [], blueprint.ownership.api), `${blueprint.id}: prototype effective API ownership drift`);
    if (!writes.length) {
      assert(blueprint.ownership.storage.length === 0, `${blueprint.id}: read-only prototype unexpectedly owns storage`);
      assert(blueprint.ownership.api.length === 0, `${blueprint.id}: read-only prototype unexpectedly owns API paths`);
      assert((feature?.storage || []).length === 0, `${blueprint.id}: read-only prototype unexpectedly receives effective storage`);
      assert((feature?.api || []).length === 0, `${blueprint.id}: read-only prototype unexpectedly receives an effective API path`);
    } else {
      assert(blueprint.ownership.qa.length > 0, `${blueprint.id}: write-capable prototype requires functional/data-safety QA`);
    }
  }

  for (const file of ownedFiles) {
    assert(await pathExists(file), `${blueprint.id}: owned file does not exist: ${file}`);
  }

  enrollment.push({
    moduleId: blueprint.id,
    scope: blueprint.navigation.scope,
    pattern: blueprint.layout.pattern,
    runtime: blueprint.runtime.contract,
    runtimeLifecycle: blueprint.runtime.lifecycle,
    runtimeInstanceKey: blueprint.runtime.instanceKey,
    prototypeNative: blueprint.prototypeNative,
    required: {
      syntax: true,
      boundaries: true,
      flow: true,
      features: true,
      runtimeCoverage: true,
      moduleSmoke: publicModule,
      regression: publicModule,
      parity: true,
      visualSnapshot: userModule,
      roleReachability: userModule,
      table: blueprint.capabilities.table,
      tree: blueprint.capabilities.tree,
      actions: blueprint.capabilities.actions,
      overlay: blueprint.capabilities.overlays.length > 0,
    },
    enrolled: {
      sourceFiles: ownedFiles,
      roles: roleIds,
      effectiveStorage: feature?.storage || [],
      effectiveApi: feature?.api || [],
      overlayProbe: blueprint.qa.overlayProbeSelector || blueprint.qa.overlayProbeException || "not-required",
    },
  });
}

await syncGeneratedModuleBlueprintIndexes({ check: true }).catch((error) => failures.push(error.message));
const generatedIds = GENERATED_MODULE_BLUEPRINTS.map((blueprint) => blueprint.id);
assert(sameSet(generatedIds, ["dispatch"]), `factory-blueprint-discovery failed: generated=${generatedIds}`);

const generatedAdapters = createGeneratedModuleRuntimeAdapters({
  renderMesModulePatternPage: () => "",
  renderUiPanel: () => "",
  renderUiPanelBody: () => "",
  renderUiSystemState: () => "",
});
assert(sameSet(Object.keys(generatedAdapters), generatedIds), `factory-runtime-handler failed: adapters=${Object.keys(generatedAdapters)} generated=${generatedIds}`);

const weeklyBlueprint = blueprintById.get("weeklyProductionControl");
const dispatchBlueprint = blueprintById.get("dispatch");
assert(weeklyBlueprint?.runtime.lifecycle === MES_MODULE_RUNTIME_LIFECYCLES.FACTORY_LAZY, "weekly lifecycle must remain factory-lazy");
assert(dispatchBlueprint?.prototypeNative === false, "production-backed Dispatch may not remain classified as a prototype-native module");
assert(dispatchBlueprint?.runtime.lifecycle === MES_MODULE_RUNTIME_LIFECYCLES.STANDARD_READY, "production-backed Dispatch must use the standard-ready lifecycle");
assertThrows(() => createMesModuleRuntime({
  blueprints: [weeklyBlueprint],
  adapters: { weeklyProductionControl: { render: () => "" } },
  renderAppShell: () => {},
}), /factory-lazy adapter requires initialize/, "factory-lazy lifecycle accepted an adapter without initialize()");
assertThrows(() => createMesModuleRuntime({
  blueprints: [dispatchBlueprint],
  adapters: { dispatch: { initialize: () => ({}), render: () => "" } },
  renderAppShell: () => {},
}), /standard-ready adapter cannot declare initialize/, "standard-ready lifecycle accepted an unexpected initializer");
const sharedLazyBlueprintA = {
  ...weeklyBlueprint,
  id: "factoryLazyA",
  runtime: { ...weeklyBlueprint.runtime, instanceKey: "factoryShared" },
};
const sharedLazyBlueprintB = {
  ...weeklyBlueprint,
  id: "factoryLazyB",
  runtime: { ...weeklyBlueprint.runtime, instanceKey: "factoryShared" },
};
assertThrows(() => createMesModuleRuntime({
  blueprints: [sharedLazyBlueprintA, sharedLazyBlueprintB],
  adapters: {
    factoryLazyA: { initialize: () => ({}), render: () => "" },
    factoryLazyB: { initialize: () => ({}), render: () => "" },
  },
  renderAppShell: () => {},
}), /incompatible initializer/, "shared lazy instanceKey accepted incompatible initializers");
let sharedInitializeCount = 0;
const sharedInitializer = () => {
  sharedInitializeCount += 1;
  return {};
};
const sharedRuntime = createMesModuleRuntime({
  blueprints: [sharedLazyBlueprintA, sharedLazyBlueprintB],
  adapters: {
    factoryLazyA: { initialize: sharedInitializer, render: () => "" },
    factoryLazyB: { initialize: sharedInitializer, render: () => "" },
  },
  renderAppShell: () => {},
});
sharedRuntime.renderModule("factoryLazyA");
sharedRuntime.renderModule("factoryLazyB");
assert(sharedInitializeCount === 1, `shared lazy instance initialized ${sharedInitializeCount} times instead of once`);

const scaffoldRoot = await mkdtemp(join(tmpdir(), "mes-module-scaffold-"));
try {
  const scaffold = await scaffoldModule({
    id: "factoryQaProbe",
    slug: "factory_probe",
    label: "Factory QA Probe",
    icon: "info",
    groupId: "operations",
    pattern: "dashboard",
    order: 990,
    flowOrder: 990,
    dryRun: false,
    targetRoot: scaffoldRoot,
    syncIndexes: false,
  });
  assert(scaffold.files.length === 3, `factory-scaffold expected 3 module-owned files, got ${scaffold.files.length}`);
  for (const file of scaffold.files) {
    const absolutePath = join(scaffoldRoot, file);
    const result = spawnSync(process.execPath, ["--check", absolutePath], { encoding: "utf8" });
    assert(result.status === 0, `factory-scaffold syntax failed for ${file}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  const scaffoldBlueprint = await readFile(join(scaffoldRoot, "src", "modules", "factory_probe", "blueprint.js"), "utf8");
  assert(scaffoldBlueprint.includes("writes: []"), "factory-scaffold safe default lost writes: []");
  assert(scaffoldBlueprint.includes("css: [], storage: [], api: [], qa: []"), "factory-scaffold safe ownership defaults drifted");
  const tableScaffold = await scaffoldModule({
    id: "factoryTableProbe",
    slug: "factory_table_probe",
    label: "Factory Table Probe",
    icon: "info",
    groupId: "operations",
    pattern: "registry-table",
    order: 991,
    flowOrder: 991,
    dryRun: false,
    targetRoot: scaffoldRoot,
    syncIndexes: false,
  });
  assert(tableScaffold.files.length === 3, `factory table scaffold expected 3 module-owned files, got ${tableScaffold.files.length}`);
  for (const file of tableScaffold.files) {
    const absolutePath = join(scaffoldRoot, file);
    const result = spawnSync(process.execPath, ["--check", absolutePath], { encoding: "utf8" });
    assert(result.status === 0, `factory table scaffold syntax failed for ${file}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  const tableBlueprint = await readFile(join(scaffoldRoot, "src", "modules", "factory_table_probe", "blueprint.js"), "utf8");
  assert(tableBlueprint.includes("hasTable: false"), "factory table scaffold prematurely enables regression table capability");
  assert(tableBlueprint.includes("capabilities: { table: false, tree: false"), "factory table scaffold prematurely enables domain capabilities");
  await syncGeneratedModuleBlueprintIndexes({ targetRoot: scaffoldRoot });
  await syncGeneratedModuleBlueprintIndexes({ targetRoot: scaffoldRoot, check: true });
  const generatedRuntimeSource = await readFile(join(scaffoldRoot, "src", "generated", "module_runtime_index.js"), "utf8");
  assert(generatedRuntimeSource.includes("[factoryProbeBlueprint.id]"), "factory generated runtime key is not derived from Blueprint id");
  assert(!generatedRuntimeSource.includes("    factoryProbe:"), "factory generated runtime key still derives from directory slug");
} finally {
  await rm(scaffoldRoot, { recursive: true, force: true });
}

const checkedSourceFiles = sorted(new Set(MES_MODULE_BLUEPRINT_REGISTRY.flatMap((blueprint) => blueprint.sourceFiles)));
const nodeCheckSourceFiles = checkedSourceFiles.filter((file) => /\.(?:c|m)?js$/u.test(file));
for (const file of nodeCheckSourceFiles) {
  const result = spawnSync(process.execPath, ["--check", join(projectRoot, file)], { encoding: "utf8" });
  assert(result.status === 0, `${file}: syntax check failed: ${(result.stderr || result.stdout || "").trim()}`);
}

const [appSource, paritySource, smokeSource, regressionSource, flowQaSource] = await Promise.all([
  readFile(join(projectRoot, "src", "app.js"), "utf8"),
  readFile(join(projectRoot, "scripts", "ui-module-visual-parity-qa.mjs"), "utf8"),
  readFile(join(projectRoot, "scripts", "module-smoke-qa.mjs"), "utf8"),
  readFile(join(projectRoot, "scripts", "ui-module-regression-smoke.mjs"), "utf8"),
  readFile(join(projectRoot, "scripts", "flow-contract-qa.mjs"), "utf8"),
]);
const renderBlock = appSource.match(/function render\(options = \{\}\) \{([\s\S]*?)\n\}\n\nfunction getModuleScrollSnapshot/)?.[1] || "";
assert((renderBlock.match(/if \(ui\.activeModule ===/g) || []).length === 0, "factory-runtime-handler: render() still contains manual standard module branches");
assert(renderBlock.includes('ui.activeModule !== "gantt"'), "factory-runtime-handler: special Gantt fallback must be explicit");
assert(!appSource.includes("initializeWeeklyProductionControlModule"), "weeklyProductionControl still has a manual initializer wrapper");
assert(appSource.includes("initialize: () => weeklyProductionControlProductionRuntimeInstance"), "weeklyProductionControl pure production lifecycle proof is missing");
assert(!appSource.includes("createWeeklyProductionControlRuntimeInstance"), "weeklyProductionControl current runtime still contains the removed renderer factory");
assert(!appSource.includes('modules/weekly_production_control/render.js'), "weeklyProductionControl current runtime still imports its removed renderer");
assert(appSource.includes('initialize: () => weeklyProductionControlProductionRuntimeInstance')
  && appSource.includes('"formatWeeklyProductionControlPercent"')
  && appSource.includes('"formatWeeklyProductionControlQuantity"'), "weeklyProductionControl public port declaration is not explicit");
assert(!/const moduleProfiles\s*=\s*\{/.test(paritySource), "parity QA still owns a literal module profile island");
assert(smokeSource.includes("getMesModuleNavigationDefinitions"), "module smoke is not registry-derived");
assert(regressionSource.includes("MES_MODULE_BLUEPRINT_REGISTRY"), "regression overlay/profile enrollment is not blueprint-derived");
assert(flowQaSource.includes("const requiredModuleFlow = [...MES_MODULE_FLOW_SEQUENCE]"), "flow QA still owns a literal required module list");

const report = {
  generatedAt: new Date().toISOString(),
  schema: "mes-module-factory-enrollment/v1",
  counts: {
    blueprints: blueprintIds.length,
    generatedBlueprints: generatedIds.length,
    standardRuntime: HARD_UI_RUNTIME_MODULE_IDS.length,
    specialRuntime: SPECIAL_UI_RUNTIME_MODULE_IDS.length,
    syntaxFiles: checkedSourceFiles.length,
    failures: failures.length,
  },
  invariants: {
    registryBijection: failures.filter((message) => message.includes("bijection")).length === 0,
    generatedIndex: failures.filter((message) => message.includes("index drift")).length === 0,
    runtimeHandlers: failures.filter((message) => message.includes("runtime-handler")).length === 0,
    lifecycleRuntime: failures.filter((message) => message.includes("lifecycle") || message.includes("lazy instance")).length === 0,
    profileCompleteness: regressionIds.length === blueprintIds.length,
    roleReachability: failures.filter((message) => message.includes("role-reachability")).length === 0,
    safePrototypeDefaults: failures.filter((message) => message.includes("prototype unexpectedly") || message.includes("prototype effective") || message.includes("write-capable prototype")).length === 0,
    ownedFiles: failures.filter((message) => message.includes("owned file")).length === 0,
  },
  enrollment,
  failures,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log("MES Module Blueprint Factory QA");
console.log(`Blueprints: ${blueprintIds.length}; generated: ${generatedIds.length}; syntax files: ${checkedSourceFiles.length}`);
console.log(`Enrollment rows: ${enrollment.length}; failures: ${failures.length}`);
if (failures.length) {
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("OK: registry, runtime, QA, RBAC and safe prototype defaults are blueprint-driven.");
}
