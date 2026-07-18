import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const labRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(labRoot, "..", "..");
const sourceRoot = join(labRoot, "src");
const baseline = "49d0e1eeecd7b653bdb09d61e73068bb12d22741";
const blockedPaths = [
  "src/app.js",
  "src/modules/runtime_state/service.js",
  "package.json",
  "package-lock.json",
  "index.html",
  "app-version.json",
];

async function collectSources(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await collectSources(path));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-react-migration-qa-"));
try {
  const adapterOutput = join(temporaryRoot, "adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/nomenclature/adapter.ts")],
    outfile: adapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { adaptNomenclatureItems, adaptNomenclatureReadModel } = await import(`${pathToFileURL(adapterOutput).href}?qa=${Date.now()}`);

  const adapted = adaptNomenclatureItems([
    { id: "ok", name: "Valid", type: "РЭА компоненты", article: "A-1" },
    { id: "", name: "Missing id", type: "РЭА компоненты" },
    null,
  ]);
  assert.equal(adapted.length, 1, "adapter must discard invalid records");
  assert.deepEqual(adapted[0], {
    id: "ok",
    article: "A-1",
    name: "Valid",
    type: "РЭА компоненты",
    unit: "шт.",
    packageName: "—",
    manufacturer: "—",
    description: "",
    statusLabel: "Активен",
    statusTone: "success",
  });
  assert.deepEqual(adaptNomenclatureItems({}), [], "non-array payload must fail closed");
  const readModel = adaptNomenclatureReadModel({
    nomenclature: [{ id: "ok", name: "Valid", type: "РЭА" }],
    nomenclatureTypes: [
      { id: "rea", name: "РЭА компоненты", status: "Активен" },
      { id: "old", name: "Архив", status: "Архив" },
    ],
  });
  assert.equal(readModel.items[0]?.type, "РЭА компоненты", "legacy REA alias must normalize");
  assert.deepEqual(readModel.types.map((entry) => entry.label), ["РЭА компоненты"], "inactive types must be hidden");

  const viewModelOutput = join(temporaryRoot, "view-model.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/nomenclature/view-model.ts")],
    outfile: viewModelOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const viewModel = await import(`${pathToFileURL(viewModelOutput).href}?qa=${Date.now()}`);
  assert.equal(viewModel.formatRecordCount(1), "1 запись");
  assert.equal(viewModel.formatRecordCount(2), "2 записи");
  assert.equal(viewModel.formatRecordCount(5), "5 записей");
  assert.equal(viewModel.formatRecordCount(11), "11 записей");
  assert.equal(viewModel.formatRecordCount(21), "21 запись");
  assert.equal(viewModel.filterNomenclatureItems(adapted, "Механика").length, 0);
  assert.equal(viewModel.filterNomenclatureItems(adapted, "РЭА компоненты").length, 1);
  assert.equal(viewModel.resolveVisibleSelection(adapted, "missing")?.id, "ok");
  assert.deepEqual(viewModel.buildNomenclatureFilters(readModel).map((entry) => [entry.label, entry.count]), [
    ["Вся номенклатура", 1],
    ["РЭА компоненты", 1],
  ]);
  const boardReadModel = adaptNomenclatureReadModel({
    nomenclature: [{ id: "pcb", name: "Плата", type: "Печатные платы" }],
    nomenclatureTypes: [{ id: "pcb-type", name: "Печатные платы", status: "Активен" }],
    bomLists: [{ id: "board-1" }, { id: "board-2" }],
  });
  const boardFilter = viewModel.buildNomenclatureFilters(boardReadModel).find((entry) => entry.label === "Печатные платы");
  assert.deepEqual(boardFilter, {
    id: "__boards__",
    label: "Печатные платы",
    count: 2,
    description: "",
    action: "legacy",
  }, "Boards sidebar entry must preserve the legacy BOM pane semantics");

  const componentTypesAdapterOutput = join(temporaryRoot, "component-types-adapter.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/component-types/adapter.ts")],
    outfile: componentTypesAdapterOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { adaptComponentTypes } = await import(`${pathToFileURL(componentTypesAdapterOutput).href}?qa=${Date.now()}`);
  const componentTypes = adaptComponentTypes({ componentTypes: [
    { id: "ct-valid", name: "QFN", package: "QFN", family: "Микросхемы", coefficient: 0.06, placementsPerHour: 5500.9, setupSeconds: 34.8, defaultCount: 1.7, status: "Активен" },
    { id: "", name: "Missing id" },
    null,
  ] });
  assert.deepEqual(componentTypes, [{
    id: "ct-valid",
    name: "QFN",
    packageName: "QFN",
    family: "Микросхемы",
    coefficient: 0.06,
    placementsPerHour: 5500,
    setupSeconds: 34,
    defaultCount: 1,
    statusLabel: "Активен",
    statusTone: "success",
  }]);
  assert.deepEqual(adaptComponentTypes({ componentTypes: {} }), [], "invalid component-types payload must fail closed");

  const componentTypesViewModelOutput = join(temporaryRoot, "component-types-view-model.mjs");
  await build({
    entryPoints: [join(sourceRoot, "modules/component-types/view-model.ts")],
    outfile: componentTypesViewModelOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const componentTypesViewModel = await import(`${pathToFileURL(componentTypesViewModelOutput).href}?qa=${Date.now()}`);
  assert.deepEqual(componentTypesViewModel.buildComponentTypeFilters(componentTypes).map((entry) => [entry.label, entry.count]), [["Все типы", 1], ["Микросхемы", 1]]);
  assert.equal(componentTypesViewModel.filterComponentTypes(componentTypes, "Дискреты").length, 0);
  assert.equal(componentTypesViewModel.resolveVisibleComponentType(componentTypes, "missing")?.id, "ct-valid");
  assert.match(componentTypesViewModel.formatInteger(64400), /64[^\d]?400/);

  const selectionOutput = join(temporaryRoot, "selection.mjs");
  await build({
    entryPoints: [join(sourceRoot, "ui/selection.ts")],
    outfile: selectionOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { resolveAvailableFilter } = await import(`${pathToFileURL(selectionOutput).href}?qa=${Date.now()}`);
  assert.equal(resolveAvailableFilter(["all", "Микросхемы"], "Микросхемы", "all"), "Микросхемы");
  assert.equal(resolveAvailableFilter(["all", "Крупные"], "Микросхемы", "all"), "all", "removed filter must fall back to all");

  const featureGateOutput = join(temporaryRoot, "feature-gate.mjs");
  await build({
    entryPoints: [join(sourceRoot, "feature-gate.ts")],
    outfile: featureGateOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  const { createReactIslandFeatureGate } = await import(`${pathToFileURL(featureGateOutput).href}?qa=${Date.now()}`);
  const scheduledFallbacks = [];
  const featureEvents = [];
  let reportIslandError = null;
  const featureGate = createReactIslandFeatureGate({
    enabled: true,
    target: { id: "target" },
    mount(_target, payload, onError) {
      featureEvents.push(["mount", payload]);
      reportIslandError = onError;
      return {
        update(nextPayload) { featureEvents.push(["update", nextPayload]); },
        unmount() { featureEvents.push(["unmount"]); },
      };
    },
    renderLegacy(context) { featureEvents.push(["legacy", context.reason, context.error?.message]); },
    schedule(task) { scheduledFallbacks.push(task); },
  });
  assert.equal(featureGate.activate("initial"), "react");
  assert.equal(featureGate.update("next"), true);
  reportIslandError(new Error("render failed"));
  reportIslandError(new Error("duplicate render failure"));
  assert.equal(scheduledFallbacks.length, 1, "duplicate render errors must schedule one fallback");
  scheduledFallbacks.shift()();
  assert.equal(featureGate.getState(), "legacy");
  assert.deepEqual(featureEvents, [
    ["mount", "initial"],
    ["update", "next"],
    ["unmount"],
    ["legacy", "render-error", "render failed"],
  ]);
  assert.equal(featureGate.update("ignored"), false, "legacy mode must reject React updates");

  const disabledEvents = [];
  const disabledGate = createReactIslandFeatureGate({
    enabled: false,
    target: {},
    mount() { throw new Error("disabled gate must not mount"); },
    renderLegacy(context) { disabledEvents.push(context.reason); },
  });
  assert.equal(disabledGate.activate("payload"), "legacy");
  assert.deepEqual(disabledEvents, ["disabled"]);

  const mountFailureEvents = [];
  const mountFailureGate = createReactIslandFeatureGate({
    enabled: true,
    target: {},
    mount() { throw new Error("mount failed"); },
    renderLegacy(context) { mountFailureEvents.push([context.reason, context.error?.message]); },
  });
  assert.equal(mountFailureGate.activate("payload"), "legacy");
  assert.deepEqual(mountFailureEvents, [["mount-error", "mount failed"]]);

  const unsupportedEvents = [];
  const unsupportedGate = createReactIslandFeatureGate({
    enabled: true,
    target: {},
    mount() {
      return {
        update() {},
        unmount() { unsupportedEvents.push("unmount"); },
      };
    },
    renderLegacy(context) { unsupportedEvents.push(context.reason); },
  });
  assert.equal(unsupportedGate.activate("payload"), "react");
  assert.equal(unsupportedGate.requestLegacy("unsupported-scope"), true);
  assert.equal(unsupportedGate.getState(), "legacy");
  assert.equal(unsupportedGate.requestLegacy("unsupported-scope"), false);
  assert.deepEqual(unsupportedEvents, ["unmount", "unsupported-scope"]);

  const updateFailureScheduled = [];
  const updateFailureEvents = [];
  const updateFailureGate = createReactIslandFeatureGate({
    enabled: true,
    target: {},
    mount() {
      return {
        update() { throw new Error("update failed"); },
        unmount() { updateFailureEvents.push("unmount"); },
      };
    },
    renderLegacy(context) { updateFailureEvents.push(`${context.reason}:${context.error?.message}`); },
    schedule(task) { updateFailureScheduled.push(task); },
  });
  assert.equal(updateFailureGate.activate("payload"), "react");
  assert.equal(updateFailureGate.update("next"), false);
  assert.equal(updateFailureScheduled.length, 1);
  updateFailureScheduled.shift()();
  assert.deepEqual(updateFailureEvents, ["unmount", "render-error:update failed"]);

  const sources = await collectSources(sourceRoot);
  const forbiddenPatterns = [
    ["legacy app import", /src\/app\.js/],
    ["runtime-state coupling", /runtime_state/],
    ["direct network call", /\bfetch\s*\(/],
    ["shared-state coupling", /shared-state|bootstrap_snapshot/],
    ["browser persistence", /\blocalStorage\b|\bsessionStorage\b/],
  ];
  for (const path of sources) {
    const source = await readFile(path, "utf8");
    for (const [label, pattern] of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `${label} is forbidden in ${path}`);
    }
  }

  const requiredMarkers = ["ModulePage", "ModuleHeader", "ModuleSidebar", "ModuleWorkspace", "Panel", "TableWrap", "ActionButton", "SelectableRow", "DetailPanel", "EmptyState", "SystemState", "StatusToken"];
  const uiSource = await readFile(join(sourceRoot, "ui/components.tsx"), "utf8");
  for (const marker of requiredMarkers) {
    assert.match(uiSource, new RegExp(`data-ui-component=[{]?['\"]${marker}`), `missing ${marker} contract marker`);
  }

  const mountSource = await readFile(join(sourceRoot, "mount.tsx"), "utf8");
  assert.match(mountSource, /export function mountReactMigrationIsland/);
  assert.doesNotMatch(mountSource, /document\.|querySelector|appendChild|replaceWith/, "island mount must not manipulate host DOM");

  const runtimeSource = await readFile(join(sourceRoot, "island-runtime.tsx"), "utf8");
  assert.match(runtimeSource, /update\(payload/);
  assert.match(runtimeSource, /unmount\(\)/);
  assert.match(runtimeSource, /onCaughtError/);
  assert.match(runtimeSource, /onUncaughtError/);
  assert.match(runtimeSource, /class IslandErrorBoundary/);
  assert.match(runtimeSource, /function CommitReporter/);
  assert.match(runtimeSource, /try\s*{\s*render\(initialPayload\)/);
  assert.match(runtimeSource, /root\.unmount\(\)/);
  assert.doesNotMatch(runtimeSource, /document\.|querySelector|appendChild|replaceWith/, "island runtime must not manipulate host DOM");

  const nomenclatureIslandSource = await readFile(join(sourceRoot, "nomenclature-island.tsx"), "utf8");
  assert.match(nomenclatureIslandSource, /export function mountNomenclatureReactIsland/);
  assert.match(nomenclatureIslandSource, /onRequestLegacy/);

  const mainSource = await readFile(join(sourceRoot, "main.tsx"), "utf8");
  assert.match(mainSource, /lifecycle_qa/);
  assert.match(mainSource, /scenario.*component-types/);
  assert.match(mainSource, /createReactIslandFeatureGate/);
  assert.match(mainSource, /featureGate\.update\(updatePayload\)/);
  assert.match(mainSource, /featureGate\.dispose\(\)/);
  assert.match(mainSource, /Legacy-интерфейс восстановлен/);
  assert.match(mainSource, /Lifecycle QA render failure/);
  assert.match(mainSource, /reactIslandCommitMs/);
  assert.match(mainSource, /featureGate\.requestLegacy\("unsupported-scope"\)/);

  const { stdout: blockedDiff } = await execFileAsync("git", ["diff", "--name-only", baseline, "--", ...blockedPaths], { cwd: repositoryRoot });
  assert.equal(blockedDiff.trim(), "", `migration branch changed blocked paths:\n${blockedDiff}`);

  const { stdout: performanceBudget } = await execFileAsync(process.execPath, [join(labRoot, "performance-budget.mjs")], { cwd: repositoryRoot });
  assert.match(performanceBudget, /"nomenclature"/);

  await execFileAsync(process.execPath, [join(labRoot, "build.mjs")], { cwd: repositoryRoot });
  console.log(`React migration QA passed: ${sources.length} typed sources, adapter boundary, UI markers, stop-list, build.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
