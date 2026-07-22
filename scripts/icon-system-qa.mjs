import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MES_ICON_ENTRIES,
  MES_ICON_RUNTIME_ALIASES,
  MES_ICON_SOURCE_PACKAGE,
  MES_ICON_SVG_BY_SLUG,
  getMesIconEntry,
  getMesIconName,
  getMesIconSvg,
} from "../src/icons/registry.js";
import {
  getMesRuntimeIconName,
  getMesRuntimeIconSvg,
} from "../src/icons/runtime_registry.js";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf-8"));
const dependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};

assert(dependencies["lucide-react"], "lucide-react dependency is required by the mixed icon system");
assert(MES_ICON_SOURCE_PACKAGE.archive === "mes_mixed_custom_opensource_icon_pack.zip", "Unexpected icon source package");
assert(MES_ICON_ENTRIES.length === 129, `Expected 129 semantic entries, received ${MES_ICON_ENTRIES.length}`);
assert(MES_ICON_SOURCE_PACKAGE.customSvgCount === 47, "Expected 47 custom SVG entries");
assert(MES_ICON_SOURCE_PACKAGE.lucideReactCount === 81, "Expected 81 Lucide React entries");
assert(MES_ICON_SOURCE_PACKAGE.localFallbackCount === 1, "Expected 1 local fallback entry");

const counts = MES_ICON_ENTRIES.reduce((acc, entry) => {
  acc[entry.source] = (acc[entry.source] || 0) + 1;
  return acc;
}, {});

assert(counts["custom-svg"] === 47, `Expected 47 custom-svg entries, received ${counts["custom-svg"] || 0}`);
assert(counts["lucide-react"] === 79, `Expected 79 rendered lucide-react entries, received ${counts["lucide-react"] || 0}`);
assert(counts["brand-asset"] === 2, `Expected 2 MES brand assets, received ${counts["brand-asset"] || 0}`);
assert(counts["local-fallback-svg"] === 1, `Expected 1 local fallback entry, received ${counts["local-fallback-svg"] || 0}`);

for (const entry of MES_ICON_ENTRIES) {
  assert(entry.semanticSlug, "Icon entry is missing semanticSlug");
  assert(entry.source, `${entry.semanticSlug} is missing source`);
  assert(MES_ICON_SVG_BY_SLUG[entry.semanticSlug], `${entry.semanticSlug} is missing SVG markup`);
  assert(getMesIconSvg(entry.semanticSlug), `${entry.semanticSlug} is not resolvable through getMesIconSvg`);
}

assert(getMesIconEntry("production-floor-plan")?.source === "local-fallback-svg", "production-floor-plan must use local fallback SVG");
assert(getMesIconEntry("search")?.source === "lucide-react", "search must use Lucide React source");
assert(getMesIconEntry("department-smt")?.source === "custom-svg", "department-smt must use custom SVG source");
assert(getMesIconName("arrowLeft") === "arrow-left", "Legacy alias arrowLeft must resolve to arrow-left");
assert(getMesIconName("routeEdit") === "route-edit", "Legacy alias routeEdit must resolve to route-edit");
assert(getMesIconName("bom") === "pcb-bom", "Legacy alias bom must resolve to pcb-bom");
assert(getMesRuntimeIconName("trash") === "trash", "Runtime registry must retain the shared confirmation delete icon");
assert(getMesRuntimeIconSvg("trash"), "Runtime registry must retain SVG markup for the shared confirmation delete icon");
assert(getMesRuntimeIconName("save") === "save", "Runtime registry must retain the shared form save icon");
assert(getMesRuntimeIconSvg("save"), "Runtime registry must retain SVG markup for the shared form save icon");
assert(MES_ICON_RUNTIME_ALIASES.D3 === "department-smt", "Runtime alias D3 must resolve to department-smt");
assert(MES_ICON_RUNTIME_ALIASES.D5_L1 === "unit-tht-line-1", "Runtime alias D5_L1 must resolve to unit-tht-line-1");

const customMesFiles = await readdir(join(projectRoot, "src", "icons", "custom-mes"));
const legacySvgFiles = customMesFiles.filter((fileName) => fileName.endsWith(".svg") || fileName === "manifest.json");
assert(!legacySvgFiles.length, `Legacy custom-mes assets must not stay in runtime folder: ${legacySvgFiles.join(", ")}`);

const appSource = await readFile(join(projectRoot, "src", "app.js"), "utf-8");
assert(!/function icon\(name\)[\s\S]*?const icons\s*=/.test(appSource), "src/app.js icon() must not contain a local manual SVG dictionary");

console.log(JSON.stringify({
  status: "ok",
  total: MES_ICON_ENTRIES.length,
  counts,
  sourcePackage: MES_ICON_SOURCE_PACKAGE.archive,
}, null, 2));
