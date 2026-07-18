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

  const requiredMarkers = ["ModulePage", "ModuleHeader", "ModuleSidebar", "ModuleWorkspace", "Panel", "TableWrap", "EmptyState", "StatusToken"];
  const uiSource = await readFile(join(sourceRoot, "ui/components.tsx"), "utf8");
  for (const marker of requiredMarkers) {
    assert.match(uiSource, new RegExp(`data-ui-component=[{]?['\"]${marker}`), `missing ${marker} contract marker`);
  }

  const { stdout: blockedDiff } = await execFileAsync("git", ["diff", "--name-only", baseline, "--", ...blockedPaths], { cwd: repositoryRoot });
  assert.equal(blockedDiff.trim(), "", `migration branch changed blocked paths:\n${blockedDiff}`);

  await execFileAsync(process.execPath, [join(labRoot, "build.mjs")], { cwd: repositoryRoot });
  console.log(`React migration QA passed: ${sources.length} typed sources, adapter boundary, UI markers, stop-list, build.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
