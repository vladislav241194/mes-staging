import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { promisify } from "node:util";
import { build, transform } from "esbuild";
import { syncGeneratedModuleBlueprintIndexes } from "./generate-module-blueprint-index.mjs";
import { syncProductionStructureBootstrapData } from "./generate-production-structure-bootstrap-data.mjs";
import { syncMesIconRuntimeRegistry } from "./generate-mes-icon-runtime-registry.mjs";
import { loadReactRuntimePolicy } from "./react-runtime-policy.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(projectRoot, "dist");
// Keep the staging path stable. esbuild includes absolute source paths in its
// chunk graph; a timestamped staging directory made identical source emit
// different chunk hashes on every build.
const stagingDistDir = join(projectRoot, ".dist-build");
const previousDistDir = join(projectRoot, ".dist-previous");
const appVersionPath = join(projectRoot, "app-version.json");
const appVersionPattern = /^v\.\d\.\d{3}\.\d{2}$/;
const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const DIST_EXCLUDED_SOURCE_PATHS = [
  "src/icons/mes-mixed/source",
];

function shouldSkipDistCopy(sourcePath) {
  const relativeSourcePath = toPosixPath(relative(projectRoot, sourcePath));
  return DIST_EXCLUDED_SOURCE_PATHS.some((excludedPath) => (
    relativeSourcePath === excludedPath || relativeSourcePath.startsWith(`${excludedPath}/`)
  ));
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (shouldSkipDistCopy(sourcePath)) continue;

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function fileHash(path) {
  const buffer = await readFile(path);
  return createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

function toPosixPath(path) {
  return path.split(sep).join("/");
}

async function collectJsFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(entryPath);
  }

  return files;
}

async function collectFilesByExtension(rootDir, extensions) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFilesByExtension(entryPath, extensions));
      continue;
    }
    if (entry.isFile() && extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(entryPath);
  }

  return files;
}

async function minifyJavaScriptFiles(rootDir) {
  const filePaths = await collectFilesByExtension(rootDir, new Set([".js"]));

  await Promise.all(filePaths.map(async (filePath) => {
    const source = await readFile(filePath, "utf-8");
    const result = await transform(source, {
      loader: "js",
      format: "esm",
      minify: true,
      charset: "utf8",
      legalComments: "none",
      target: "es2020",
    });
    await writeFile(filePath, result.code);
  }));
}

async function bundleApplication(entryPoint, outputFile) {
  await build({
    entryPoints: { app: entryPoint },
    outdir: dirname(outputFile),
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    allowOverwrite: true,
    bundle: true,
    splitting: true,
    format: "esm",
    minify: true,
    charset: "utf8",
    legalComments: "none",
    target: "es2020",
  });
}

async function bundleReactMigrationIsland(entryPoint, outputFile) {
  await mkdir(dirname(outputFile), { recursive: true });
  await build({
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    format: "esm",
    minify: true,
    charset: "utf8",
    legalComments: "none",
    target: "es2020",
    jsx: "automatic",
  });
}

// Keep the source stylesheet as an explicit cascade manifest, but flatten its
// imports for the browser. The former manifest generated a 21-request CSS
// waterfall before the first screen could paint. Bundling only the published
// dist copy retains the source-level layer order and makes rollback trivial.
async function bundleStylesheet(entryPoint, outputFile) {
  await build({
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    minify: true,
    charset: "utf8",
    legalComments: "none",
    target: "chrome100",
    loader: { ".woff2": "file" },
    assetNames: "assets/fonts/onest/[name]",
  });
}

async function precompressStaticAssets(rootDir) {
  const files = await collectFilesByExtension(rootDir, new Set([".css", ".html", ".js", ".json", ".svg"]));
  await Promise.all(files.map(async (filePath) => {
    const source = await readFile(filePath);
    if (source.byteLength < 1024) return;
    const [brotli, gzipped] = await Promise.all([
      brotliCompressAsync(source, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
      }),
      gzipAsync(source),
    ]);
    await Promise.all([
      writeFile(`${filePath}.br`, brotli),
      writeFile(`${filePath}.gz`, gzipped),
    ]);
  }));
}

async function minifyCssFiles(rootDir) {
  const filePaths = await collectFilesByExtension(rootDir, new Set([".css"]));

  await Promise.all(filePaths.map(async (filePath) => {
    const source = await readFile(filePath, "utf-8");
    const result = await transform(source, {
      loader: "css",
      minify: true,
      charset: "utf8",
      legalComments: "none",
      target: "chrome100",
    });
    await writeFile(filePath, result.code);
  }));
}

async function getJavaScriptReleaseToken(rootDir) {
  const filePaths = await collectJsFiles(rootDir);
  const digest = createHash("sha256");
  for (const filePath of filePaths) {
    digest.update(relative(rootDir, filePath).split(sep).join("/"));
    digest.update("\0");
    digest.update(await readFile(filePath));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 12);
}

function withReleaseVersion(prefix, specifier, suffix, releaseToken, deployCacheSuffix) {
  return `${prefix}${specifier}?v=${releaseToken}${deployCacheSuffix}${suffix}`;
}

async function versionLocalJsImports(rootDir, releaseToken, deployCacheSuffix = "") {
  const filePaths = await collectJsFiles(rootDir);
  for (const filePath of filePaths) {
    const source = await readFile(filePath, "utf-8");
    const versioned = source
      .replace(/(from\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g, (match, prefix, specifier, suffix) => (
        withReleaseVersion(prefix, specifier, suffix, releaseToken, deployCacheSuffix)
      ))
      .replace(/(\bimport\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g, (match, prefix, specifier, suffix) => (
        withReleaseVersion(prefix, specifier, suffix, releaseToken, deployCacheSuffix)
      ))
      .replace(/(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["']\s*\))/g, (match, prefix, specifier, suffix) => (
        withReleaseVersion(prefix, specifier, suffix, releaseToken, deployCacheSuffix)
      ));
    if (versioned !== source) await writeFile(filePath, versioned);
  }
}

async function versionCssImports(stylesheetPath, deployCacheSuffix = "") {
  const source = await readFile(stylesheetPath, "utf-8");
  const matches = [...source.matchAll(/(@import\s*(?:url\()?["'])(\.{1,2}\/[^"')]+?\.css)(?:\?[^"')]+)?(["']\)?\s*;)/g)];
  if (!matches.length) return source;

  let versioned = source;
  for (const match of matches) {
    const [fullMatch, prefix, specifier, suffix] = match;
    const targetPath = join(dirname(stylesheetPath), specifier);
    if (!(await pathExists(targetPath))) continue;
    const version = await fileHash(targetPath);
    versioned = versioned.replace(fullMatch, `${prefix}${specifier}?v=${version}${deployCacheSuffix}${suffix}`);
  }

  if (versioned !== source) {
    await writeFile(stylesheetPath, versioned);
  }
  return versioned;
}

function getDeployCacheSuffix(html = "") {
  const match = html.match(/__MES_DEPLOY_VERSION__\s*=\s*["']([^"']+)["']/);
  const rawVersion = String(match?.[1] || "").trim();
  const normalized = rawVersion.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized ? `-${normalized}` : "";
}

async function readAppDisplayVersion() {
  const source = await readFile(appVersionPath, "utf-8");
  const parsed = JSON.parse(source);
  const version = String(parsed.version || "").trim();
  if (!appVersionPattern.test(version)) {
    throw new Error(`app-version.json version must match v.x.xxx.xx, got "${version}"`);
  }
  return version;
}

async function assertAppDisplayVersionContract(version) {
  const [indexSource, appSource] = await Promise.all([
    readFile(join(projectRoot, "index.html"), "utf-8"),
    readFile(join(projectRoot, "src", "app.js"), "utf-8"),
  ]);
  const indexVersion = String(indexSource.match(/window\.__MES_DEPLOY_VERSION__\s*=\s*["']([^"']+)["'];/)?.[1] || "");
  const fallbackVersion = String(appSource.match(/const APP_VERSION_FALLBACK\s*=\s*["']([^"']+)["'];/)?.[1] || "");
  if (indexVersion !== version || fallbackVersion !== version) {
    throw new Error(`App version contract mismatch: manifest=${version}, index=${indexVersion || "missing"}, fallback=${fallbackVersion || "missing"}`);
  }
}

function injectAppDisplayVersion(html, version) {
  return replaceRequired(
    html,
    /window\.__MES_DEPLOY_VERSION__\s*=\s*["'][^"']*["'];/,
    `window.__MES_DEPLOY_VERSION__ = "${version}";`,
    "window.__MES_DEPLOY_VERSION__",
  );
}

function replaceRequired(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Cannot find ${label} in staging index.html`);
  }

  return html.replace(pattern, replacement);
}

await syncProductionStructureBootstrapData();
await syncGeneratedModuleBlueprintIndexes();
await syncMesIconRuntimeRegistry();
await loadReactRuntimePolicy({ projectRoot, env: { APP_ENV: "production" } });
await rm(stagingDistDir, { recursive: true, force: true });
await rm(previousDistDir, { recursive: true, force: true });
await mkdir(stagingDistDir, { recursive: true });

await copyFile(join(projectRoot, "index.html"), join(stagingDistDir, "index.html"));
await copyFile(join(projectRoot, "styles.css"), join(stagingDistDir, "styles.css"));
const stylesDirPath = join(projectRoot, "styles");
if (await pathExists(stylesDirPath)) {
  await copyDirectory(stylesDirPath, join(stagingDistDir, "styles"));
}
await copyDirectory(join(projectRoot, "src"), join(stagingDistDir, "src"));

const assetsPath = join(projectRoot, "assets");
if (await pathExists(assetsPath)) {
  await copyDirectory(assetsPath, join(stagingDistDir, "assets"));
}

const faviconPath = join(projectRoot, "favicon.svg");
if (await pathExists(faviconPath)) {
  await copyFile(faviconPath, join(stagingDistDir, "favicon.svg"));
}

const imagePath = join(projectRoot, "mes-planning-prototype.png");
if (await pathExists(imagePath)) {
  await copyFile(imagePath, join(stagingDistDir, "mes-planning-prototype.png"));
}

const bootstrapSnapshotPath = join(projectRoot, "bootstrap-snapshot.json");
if (await pathExists(bootstrapSnapshotPath)) {
  await copyFile(bootstrapSnapshotPath, join(stagingDistDir, "bootstrap-snapshot.json"));
}

const appDisplayVersion = await readAppDisplayVersion();
await assertAppDisplayVersionContract(appDisplayVersion);
await copyFile(appVersionPath, join(stagingDistDir, "app-version.json"));
await copyFile(join(projectRoot, "react-runtime-policy.json"), join(stagingDistDir, "react-runtime-policy.json"));
let html = await readFile(join(stagingDistDir, "index.html"), "utf-8");
html = injectAppDisplayVersion(html, appDisplayVersion);
const deployCacheSuffix = getDeployCacheSuffix(html);

await Promise.all([
  minifyJavaScriptFiles(join(stagingDistDir, "src")),
  minifyCssFiles(join(stagingDistDir, "styles")),
]);

await bundleStylesheet(join(projectRoot, "styles.css"), join(stagingDistDir, "styles.css"));

const nomenclatureReactIslandOutput = join(stagingDistDir, "src", "react-islands", "nomenclature.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "nomenclature-island.tsx"),
  nomenclatureReactIslandOutput,
);
const nomenclatureReactIslandVersion = await fileHash(nomenclatureReactIslandOutput);
const nomenclatureReactIslandHostPath = join(stagingDistDir, "src", "modules", "nomenclature", "react_island_host.ts");
const nomenclatureReactIslandHostSource = await readFile(nomenclatureReactIslandHostPath, "utf8");
const nomenclatureReactIslandVersionMarker = "__MES_NOMENCLATURE_REACT_BUNDLE_VERSION__";
if (!nomenclatureReactIslandHostSource.includes(nomenclatureReactIslandVersionMarker)) {
  throw new Error("Cannot find Nomenclature React island bundle version marker");
}
await writeFile(
  nomenclatureReactIslandHostPath,
  nomenclatureReactIslandHostSource.replaceAll(nomenclatureReactIslandVersionMarker, nomenclatureReactIslandVersion),
);

const boardsReactIslandOutput = join(stagingDistDir, "src", "react-islands", "boards.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "boards-island.tsx"),
  boardsReactIslandOutput,
);
const boardsReactIslandVersion = await fileHash(boardsReactIslandOutput);
const boardsReactIslandHostPath = join(stagingDistDir, "src", "modules", "nomenclature", "boards_react_island_host.ts");
const boardsReactIslandHostSource = await readFile(boardsReactIslandHostPath, "utf8");
const boardsReactIslandVersionMarker = "__MES_BOARDS_REACT_BUNDLE_VERSION__";
if (!boardsReactIslandHostSource.includes(boardsReactIslandVersionMarker)) {
  throw new Error("Cannot find Boards React island bundle version marker");
}
await writeFile(
  boardsReactIslandHostPath,
  boardsReactIslandHostSource.replaceAll(boardsReactIslandVersionMarker, boardsReactIslandVersion),
);

const structureEmployeesReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-employees.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "structure-employees-island.tsx"),
  structureEmployeesReactIslandOutput,
);
const structureEmployeesReactIslandVersion = await fileHash(structureEmployeesReactIslandOutput);
const structureEmployeesReactIslandHostPath = join(stagingDistDir, "src", "modules", "production_structure_matrix", "react_island_host.js");
const structureEmployeesReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structureEmployeesReactIslandVersionMarker = "__MES_STRUCTURE_EMPLOYEES_REACT_BUNDLE_VERSION__";
if (!structureEmployeesReactIslandHostSource.includes(structureEmployeesReactIslandVersionMarker)) {
  throw new Error("Cannot find Structure Employees React island bundle version marker");
}
await writeFile(
  structureEmployeesReactIslandHostPath,
  structureEmployeesReactIslandHostSource.replaceAll(structureEmployeesReactIslandVersionMarker, structureEmployeesReactIslandVersion),
);

const structurePositionsReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-positions.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "structure-positions-island.tsx"), structurePositionsReactIslandOutput);
const structurePositionsReactIslandVersion = await fileHash(structurePositionsReactIslandOutput);
const structurePositionsReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structurePositionsReactIslandVersionMarker = "__MES_STRUCTURE_POSITIONS_REACT_BUNDLE_VERSION__";
if (!structurePositionsReactIslandHostSource.includes(structurePositionsReactIslandVersionMarker)) throw new Error("Cannot find Structure Positions React island bundle version marker");
await writeFile(structureEmployeesReactIslandHostPath, structurePositionsReactIslandHostSource.replaceAll(structurePositionsReactIslandVersionMarker, structurePositionsReactIslandVersion));

const structureOrgUnitsReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-org-units.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "structure-org-units-island.tsx"), structureOrgUnitsReactIslandOutput);
const structureOrgUnitsReactIslandVersion = await fileHash(structureOrgUnitsReactIslandOutput);
const structureOrgUnitsReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structureOrgUnitsReactIslandVersionMarker = "__MES_STRUCTURE_ORG_UNITS_REACT_BUNDLE_VERSION__";
if (!structureOrgUnitsReactIslandHostSource.includes(structureOrgUnitsReactIslandVersionMarker)) throw new Error("Cannot find Structure Org Units React island bundle version marker");
await writeFile(structureEmployeesReactIslandHostPath, structureOrgUnitsReactIslandHostSource.replaceAll(structureOrgUnitsReactIslandVersionMarker, structureOrgUnitsReactIslandVersion));

const structureWorkCentersReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-work-centers.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "structure-work-centers-island.tsx"), structureWorkCentersReactIslandOutput);
const structureWorkCentersReactIslandVersion = await fileHash(structureWorkCentersReactIslandOutput);
const structureWorkCentersReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structureWorkCentersReactIslandVersionMarker = "__MES_STRUCTURE_WORK_CENTERS_REACT_BUNDLE_VERSION__";
if (!structureWorkCentersReactIslandHostSource.includes(structureWorkCentersReactIslandVersionMarker)) throw new Error("Cannot find Structure Work Centers React island bundle version marker");
await writeFile(structureEmployeesReactIslandHostPath, structureWorkCentersReactIslandHostSource.replaceAll(structureWorkCentersReactIslandVersionMarker, structureWorkCentersReactIslandVersion));

const structureEquipmentReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-equipment.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "structure-equipment-island.tsx"), structureEquipmentReactIslandOutput);
const structureEquipmentReactIslandVersion = await fileHash(structureEquipmentReactIslandOutput);
const structureEquipmentReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structureEquipmentReactIslandVersionMarker = "__MES_STRUCTURE_EQUIPMENT_REACT_BUNDLE_VERSION__";
if (!structureEquipmentReactIslandHostSource.includes(structureEquipmentReactIslandVersionMarker)) throw new Error("Cannot find Structure Equipment React island bundle version marker");
await writeFile(structureEmployeesReactIslandHostPath, structureEquipmentReactIslandHostSource.replaceAll(structureEquipmentReactIslandVersionMarker, structureEquipmentReactIslandVersion));

const structureResponsibilityPoliciesReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-responsibility-policies.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "structure-responsibility-policies-island.tsx"), structureResponsibilityPoliciesReactIslandOutput);
const structureResponsibilityPoliciesReactIslandVersion = await fileHash(structureResponsibilityPoliciesReactIslandOutput);
const structureResponsibilityPoliciesReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structureResponsibilityPoliciesReactIslandVersionMarker = "__MES_STRUCTURE_RESPONSIBILITY_POLICIES_REACT_BUNDLE_VERSION__";
if (!structureResponsibilityPoliciesReactIslandHostSource.includes(structureResponsibilityPoliciesReactIslandVersionMarker)) throw new Error("Cannot find Structure Responsibility Policies React island bundle version marker");
await writeFile(structureEmployeesReactIslandHostPath, structureResponsibilityPoliciesReactIslandHostSource.replaceAll(structureResponsibilityPoliciesReactIslandVersionMarker, structureResponsibilityPoliciesReactIslandVersion));

const structureMigrationDiagnosticsReactIslandOutput = join(stagingDistDir, "src", "react-islands", "structure-migration-diagnostics.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "structure-migration-diagnostics-island.tsx"), structureMigrationDiagnosticsReactIslandOutput);
const structureMigrationDiagnosticsReactIslandVersion = await fileHash(structureMigrationDiagnosticsReactIslandOutput);
const structureMigrationDiagnosticsReactIslandHostSource = await readFile(structureEmployeesReactIslandHostPath, "utf8");
const structureMigrationDiagnosticsReactIslandVersionMarker = "__MES_STRUCTURE_MIGRATION_DIAGNOSTICS_REACT_BUNDLE_VERSION__";
if (!structureMigrationDiagnosticsReactIslandHostSource.includes(structureMigrationDiagnosticsReactIslandVersionMarker)) throw new Error("Cannot find Structure Migration Diagnostics React island bundle version marker");
await writeFile(structureEmployeesReactIslandHostPath, structureMigrationDiagnosticsReactIslandHostSource.replaceAll(structureMigrationDiagnosticsReactIslandVersionMarker, structureMigrationDiagnosticsReactIslandVersion));

const weeklyProductionControlReactIslandOutput = join(stagingDistDir, "src", "react-islands", "weekly-production-control.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "weekly-production-control-island.tsx"), weeklyProductionControlReactIslandOutput);
const weeklyProductionControlReactIslandVersion = await fileHash(weeklyProductionControlReactIslandOutput);
const weeklyProductionControlReactIslandHostPath = join(stagingDistDir, "src", "modules", "weekly_production_control", "react_island_host.ts");
const weeklyProductionControlReactIslandHostSource = await readFile(weeklyProductionControlReactIslandHostPath, "utf8");
const weeklyProductionControlReactIslandVersionMarker = "__MES_WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION__";
if (!weeklyProductionControlReactIslandHostSource.includes(weeklyProductionControlReactIslandVersionMarker)) throw new Error("Cannot find Weekly Production Control React island bundle version marker");
await writeFile(weeklyProductionControlReactIslandHostPath, weeklyProductionControlReactIslandHostSource.replaceAll(weeklyProductionControlReactIslandVersionMarker, weeklyProductionControlReactIslandVersion));

const timesheetReactIslandOutput = join(stagingDistDir, "src", "react-islands", "timesheet.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "timesheet-island.tsx"), timesheetReactIslandOutput);
const timesheetReactIslandVersion = await fileHash(timesheetReactIslandOutput);
const timesheetReactIslandHostPath = join(stagingDistDir, "src", "modules", "timesheet", "react_island_host.ts");
const timesheetReactIslandHostSource = await readFile(timesheetReactIslandHostPath, "utf8");
const timesheetReactIslandVersionMarker = "__MES_TIMESHEET_REACT_BUNDLE_VERSION__";
if (!timesheetReactIslandHostSource.includes(timesheetReactIslandVersionMarker)) throw new Error("Cannot find Timesheet React island bundle version marker");
await writeFile(timesheetReactIslandHostPath, timesheetReactIslandHostSource.replaceAll(timesheetReactIslandVersionMarker, timesheetReactIslandVersion));

const planningWorkbenchReactIslandOutput = join(stagingDistDir, "src", "react-islands", "planning-workbench.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "planning-workbench-island.tsx"), planningWorkbenchReactIslandOutput);
const planningWorkbenchReactIslandVersion = await fileHash(planningWorkbenchReactIslandOutput);
const planningWorkbenchReactIslandHostPath = join(stagingDistDir, "src", "modules", "planning_workbench", "react_island_host.ts");
const planningWorkbenchReactIslandHostSource = await readFile(planningWorkbenchReactIslandHostPath, "utf8");
const planningWorkbenchReactIslandVersionMarker = "__MES_PLANNING_WORKBENCH_REACT_BUNDLE_VERSION__";
if (!planningWorkbenchReactIslandHostSource.includes(planningWorkbenchReactIslandVersionMarker)) throw new Error("Cannot find Planning Workbench React island bundle version marker");
await writeFile(planningWorkbenchReactIslandHostPath, planningWorkbenchReactIslandHostSource.replaceAll(planningWorkbenchReactIslandVersionMarker, planningWorkbenchReactIslandVersion));

const shiftWorkOrdersReactIslandOutput = join(stagingDistDir, "src", "react-islands", "shift-work-orders.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "shift-work-orders-island.tsx"), shiftWorkOrdersReactIslandOutput);
const shiftWorkOrdersReactIslandVersion = await fileHash(shiftWorkOrdersReactIslandOutput);
const shiftWorkOrdersPrintOutput = join(stagingDistDir, "src", "react-islands", "shift-work-orders-print.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "modules", "shift-work-orders", "ShiftWorkOrderPrintPreviews.tsx"), shiftWorkOrdersPrintOutput);
const shiftWorkOrdersPrintVersion = await fileHash(shiftWorkOrdersPrintOutput);
const shiftWorkOrdersFactOutput = join(stagingDistDir, "src", "react-islands", "shift-work-orders-fact.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "modules", "shift-work-orders", "ShiftWorkOrderFactEditor.tsx"), shiftWorkOrdersFactOutput);
const shiftWorkOrdersFactVersion = await fileHash(shiftWorkOrdersFactOutput);
const shiftWorkOrdersReactIslandHostPath = join(stagingDistDir, "src", "modules", "shift_work_orders", "react_island_host.ts");
let shiftWorkOrdersReactIslandHostSource = await readFile(shiftWorkOrdersReactIslandHostPath, "utf8");
const shiftWorkOrdersReactIslandVersionMarker = "__MES_SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION__";
if (!shiftWorkOrdersReactIslandHostSource.includes(shiftWorkOrdersReactIslandVersionMarker)) throw new Error("Cannot find Shift Work Orders React island bundle version marker");
shiftWorkOrdersReactIslandHostSource = shiftWorkOrdersReactIslandHostSource.replaceAll(shiftWorkOrdersReactIslandVersionMarker, shiftWorkOrdersReactIslandVersion);
const shiftWorkOrdersPrintVersionMarker = "__MES_SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION__";
if (!shiftWorkOrdersReactIslandHostSource.includes(shiftWorkOrdersPrintVersionMarker)) throw new Error("Cannot find Shift Work Orders print bundle version marker");
shiftWorkOrdersReactIslandHostSource = shiftWorkOrdersReactIslandHostSource.replaceAll(shiftWorkOrdersPrintVersionMarker, shiftWorkOrdersPrintVersion);
const shiftWorkOrdersFactVersionMarker = "__MES_SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION__";
if (!shiftWorkOrdersReactIslandHostSource.includes(shiftWorkOrdersFactVersionMarker)) throw new Error("Cannot find Shift Work Orders fact bundle version marker");
await writeFile(shiftWorkOrdersReactIslandHostPath, shiftWorkOrdersReactIslandHostSource.replaceAll(shiftWorkOrdersFactVersionMarker, shiftWorkOrdersFactVersion));

const shiftMasterBoardReactIslandOutput = join(stagingDistDir, "src", "react-islands", "shift-master-board.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "shift-master-board-island.tsx"), shiftMasterBoardReactIslandOutput);
const shiftMasterBoardReactIslandVersion = await fileHash(shiftMasterBoardReactIslandOutput);
const shiftMasterBoardReactIslandHostPath = join(stagingDistDir, "src", "modules", "shift_master_board", "react_island_host.ts");
let shiftMasterBoardReactIslandHostSource = await readFile(shiftMasterBoardReactIslandHostPath, "utf8");
const shiftMasterBoardReactIslandVersionMarker = "__MES_SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION__";
if (!shiftMasterBoardReactIslandHostSource.includes(shiftMasterBoardReactIslandVersionMarker)) throw new Error("Cannot find Shift Master Board React island bundle version marker");
shiftMasterBoardReactIslandHostSource = shiftMasterBoardReactIslandHostSource.replaceAll(shiftMasterBoardReactIslandVersionMarker, shiftMasterBoardReactIslandVersion);
const shiftMasterBoardPrintVersionMarker = "__MES_SHIFT_MASTER_BOARD_PRINT_BUNDLE_VERSION__";
if (!shiftMasterBoardReactIslandHostSource.includes(shiftMasterBoardPrintVersionMarker)) throw new Error("Cannot find Shift Master Board print bundle version marker");
await writeFile(shiftMasterBoardReactIslandHostPath, shiftMasterBoardReactIslandHostSource.replaceAll(shiftMasterBoardPrintVersionMarker, shiftWorkOrdersPrintVersion));

const employeeDesktopReactIslandOutput = join(stagingDistDir, "src", "react-islands", "employee-desktop.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "employee-desktop-island.tsx"), employeeDesktopReactIslandOutput);
const employeeDesktopReactIslandVersion = await fileHash(employeeDesktopReactIslandOutput);
const employeeDesktopReactIslandHostPath = join(stagingDistDir, "src", "modules", "auth_render", "employee_desktop_react_island_host.ts");
const employeeDesktopReactIslandHostSource = await readFile(employeeDesktopReactIslandHostPath, "utf8");
const employeeDesktopReactIslandVersionMarker = "__MES_EMPLOYEE_DESKTOP_REACT_BUNDLE_VERSION__";
if (!employeeDesktopReactIslandHostSource.includes(employeeDesktopReactIslandVersionMarker)) throw new Error("Cannot find Employee Desktop React island bundle version marker");
await writeFile(employeeDesktopReactIslandHostPath, employeeDesktopReactIslandHostSource.replaceAll(employeeDesktopReactIslandVersionMarker, employeeDesktopReactIslandVersion));

const markingReactIslandOutput = join(stagingDistDir, "src", "react-islands", "marking.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "marking-island.tsx"), markingReactIslandOutput);
const markingReactIslandVersion = await fileHash(markingReactIslandOutput);
const markingReactIslandHostPath = join(stagingDistDir, "src", "modules", "marking", "react_island_host.ts");
const markingReactIslandHostSource = await readFile(markingReactIslandHostPath, "utf8");
const markingReactIslandVersionMarker = "__MES_MARKING_REACT_BUNDLE_VERSION__";
if (!markingReactIslandHostSource.includes(markingReactIslandVersionMarker)) throw new Error("Cannot find Marking React island bundle version marker");
await writeFile(markingReactIslandHostPath, markingReactIslandHostSource.replaceAll(markingReactIslandVersionMarker, markingReactIslandVersion));

const dispatchReactIslandOutput = join(stagingDistDir, "src", "react-islands", "dispatch.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "dispatch-island.tsx"), dispatchReactIslandOutput);
const dispatchReactIslandVersion = await fileHash(dispatchReactIslandOutput);
const dispatchReactIslandHostPath = join(stagingDistDir, "src", "modules", "dispatch", "react_island_host.ts");
const dispatchReactIslandHostSource = await readFile(dispatchReactIslandHostPath, "utf8");
const dispatchReactIslandVersionMarker = "__MES_DISPATCH_REACT_BUNDLE_VERSION__";
if (!dispatchReactIslandHostSource.includes(dispatchReactIslandVersionMarker)) throw new Error("Cannot find Dispatch React island bundle version marker");
await writeFile(dispatchReactIslandHostPath, dispatchReactIslandHostSource.replaceAll(dispatchReactIslandVersionMarker, dispatchReactIslandVersion));

const authPickerReactIslandOutput = join(stagingDistDir, "src", "react-islands", "auth-picker.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "auth-picker-island.tsx"), authPickerReactIslandOutput);
const authPickerReactIslandVersion = await fileHash(authPickerReactIslandOutput);
const authPickerReactIslandHostPath = join(stagingDistDir, "src", "modules", "auth_render", "auth_picker_react_island_host.ts");
const authPickerReactIslandHostSource = await readFile(authPickerReactIslandHostPath, "utf8");
const authPickerReactIslandVersionMarker = "__MES_AUTH_PICKER_REACT_BUNDLE_VERSION__";
if (!authPickerReactIslandHostSource.includes(authPickerReactIslandVersionMarker)) throw new Error("Cannot find Authorization picker React island bundle version marker");
await writeFile(authPickerReactIslandHostPath, authPickerReactIslandHostSource.replaceAll(authPickerReactIslandVersionMarker, authPickerReactIslandVersion));

const contourAdminReactIslandOutput = join(stagingDistDir, "src", "react-islands", "contour-admin.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "contour-admin-island.tsx"), contourAdminReactIslandOutput);
const contourAdminReactIslandVersion = await fileHash(contourAdminReactIslandOutput);
const contourAdminReactIslandHostPath = join(stagingDistDir, "src", "modules", "contour_admin", "react_island_host.ts");
const contourAdminReactIslandHostSource = await readFile(contourAdminReactIslandHostPath, "utf8");
const contourAdminReactIslandVersionMarker = "__MES_CONTOUR_ADMIN_REACT_BUNDLE_VERSION__";
if (!contourAdminReactIslandHostSource.includes(contourAdminReactIslandVersionMarker)) throw new Error("Cannot find Contour Admin React island bundle version marker");
await writeFile(contourAdminReactIslandHostPath, contourAdminReactIslandHostSource.replaceAll(contourAdminReactIslandVersionMarker, contourAdminReactIslandVersion));

const specifications2ReactIslandOutput = join(stagingDistDir, "src", "react-islands", "specifications2.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "specifications2-island.tsx"), specifications2ReactIslandOutput);
const specifications2ReactIslandVersion = await fileHash(specifications2ReactIslandOutput);
const specifications2ReactIslandHostPath = join(stagingDistDir, "src", "modules", "specifications2", "react_island_host.ts");
const specifications2ReactIslandHostSource = await readFile(specifications2ReactIslandHostPath, "utf8");
const specifications2ReactIslandVersionMarker = "__MES_SPECIFICATIONS2_REACT_BUNDLE_VERSION__";
if (!specifications2ReactIslandHostSource.includes(specifications2ReactIslandVersionMarker)) throw new Error("Cannot find Specifications 2.0 React island bundle version marker");
await writeFile(specifications2ReactIslandHostPath, specifications2ReactIslandHostSource.replaceAll(specifications2ReactIslandVersionMarker, specifications2ReactIslandVersion));

const ganttReactIslandOutput = join(stagingDistDir, "src", "react-islands", "gantt.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "gantt-island.tsx"), ganttReactIslandOutput);
const ganttReactIslandVersion = await fileHash(ganttReactIslandOutput);
const ganttReactIslandHostPath = join(stagingDistDir, "src", "modules", "gantt_runtime", "react_island_host.ts");
const ganttReactIslandHostSource = await readFile(ganttReactIslandHostPath, "utf8");
const ganttReactIslandVersionMarker = "__MES_GANTT_REACT_BUNDLE_VERSION__";
if (!ganttReactIslandHostSource.includes(ganttReactIslandVersionMarker)) throw new Error("Cannot find Gantt React island bundle version marker");
await writeFile(ganttReactIslandHostPath, ganttReactIslandHostSource.replaceAll(ganttReactIslandVersionMarker, ganttReactIslandVersion));

const rolesReactIslandOutput = join(stagingDistDir, "src", "react-islands", "roles.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "roles-island.tsx"),
  rolesReactIslandOutput,
);
const rolesReactIslandVersion = await fileHash(rolesReactIslandOutput);
const rolesReactIslandHostPath = join(stagingDistDir, "src", "modules", "access_roles", "react_island_host.ts");
const rolesReactIslandHostSource = await readFile(rolesReactIslandHostPath, "utf8");
const rolesReactIslandVersionMarker = "__MES_ROLES_REACT_BUNDLE_VERSION__";
if (!rolesReactIslandHostSource.includes(rolesReactIslandVersionMarker)) {
  throw new Error("Cannot find Roles React island bundle version marker");
}
await writeFile(
  rolesReactIslandHostPath,
  rolesReactIslandHostSource.replaceAll(rolesReactIslandVersionMarker, rolesReactIslandVersion),
);

const directoryComponentTypesReactIslandOutput = join(stagingDistDir, "src", "react-islands", "component-types.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "component-types-island.tsx"),
  directoryComponentTypesReactIslandOutput,
);
const directoryComponentTypesReactIslandVersion = await fileHash(directoryComponentTypesReactIslandOutput);
const directoryComponentTypesReactIslandHostPath = join(stagingDistDir, "src", "modules", "directories", "react_island_host.js");
const directoryComponentTypesReactIslandHostSource = await readFile(directoryComponentTypesReactIslandHostPath, "utf8");
const directoryComponentTypesReactIslandVersionMarker = "__MES_DIRECTORY_COMPONENT_TYPES_REACT_BUNDLE_VERSION__";
if (!directoryComponentTypesReactIslandHostSource.includes(directoryComponentTypesReactIslandVersionMarker)) {
  throw new Error("Cannot find Directory Component Types React island bundle version marker");
}
await writeFile(
  directoryComponentTypesReactIslandHostPath,
  directoryComponentTypesReactIslandHostSource.replaceAll(directoryComponentTypesReactIslandVersionMarker, directoryComponentTypesReactIslandVersion),
);

const directoryOperationsReactIslandOutput = join(stagingDistDir, "src", "react-islands", "operations.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "operations-island.tsx"),
  directoryOperationsReactIslandOutput,
);
const directoryOperationsReactIslandVersion = await fileHash(directoryOperationsReactIslandOutput);
const directoryOperationsReactIslandHostSource = await readFile(directoryComponentTypesReactIslandHostPath, "utf8");
const directoryOperationsReactIslandVersionMarker = "__MES_DIRECTORY_OPERATIONS_REACT_BUNDLE_VERSION__";
if (!directoryOperationsReactIslandHostSource.includes(directoryOperationsReactIslandVersionMarker)) {
  throw new Error("Cannot find Directory Operations React island bundle version marker");
}
await writeFile(
  directoryComponentTypesReactIslandHostPath,
  directoryOperationsReactIslandHostSource.replaceAll(directoryOperationsReactIslandVersionMarker, directoryOperationsReactIslandVersion),
);

const directoryNomenclatureTypesReactIslandOutput = join(stagingDistDir, "src", "react-islands", "nomenclature-types.js");
await bundleReactMigrationIsland(
  join(projectRoot, "experiments", "react-migration", "src", "nomenclature-types-island.tsx"),
  directoryNomenclatureTypesReactIslandOutput,
);
const directoryNomenclatureTypesReactIslandVersion = await fileHash(directoryNomenclatureTypesReactIslandOutput);
const directoryNomenclatureTypesReactIslandHostSource = await readFile(directoryComponentTypesReactIslandHostPath, "utf8");
const directoryNomenclatureTypesReactIslandVersionMarker = "__MES_DIRECTORY_NOMENCLATURE_TYPES_REACT_BUNDLE_VERSION__";
if (!directoryNomenclatureTypesReactIslandHostSource.includes(directoryNomenclatureTypesReactIslandVersionMarker)) {
  throw new Error("Cannot find Directory Nomenclature Types React island bundle version marker");
}
await writeFile(
  directoryComponentTypesReactIslandHostPath,
  directoryNomenclatureTypesReactIslandHostSource.replaceAll(directoryNomenclatureTypesReactIslandVersionMarker, directoryNomenclatureTypesReactIslandVersion),
);

const directoryStatusesReactIslandOutput = join(stagingDistDir, "src", "react-islands", "statuses.js");
await bundleReactMigrationIsland(join(projectRoot, "experiments", "react-migration", "src", "statuses-island.tsx"), directoryStatusesReactIslandOutput);
const directoryStatusesReactIslandVersion = await fileHash(directoryStatusesReactIslandOutput);
const directoryStatusesReactIslandHostSource = await readFile(directoryComponentTypesReactIslandHostPath, "utf8");
const directoryStatusesReactIslandVersionMarker = "__MES_DIRECTORY_STATUSES_REACT_BUNDLE_VERSION__";
if (!directoryStatusesReactIslandHostSource.includes(directoryStatusesReactIslandVersionMarker)) throw new Error("Cannot find Directory Statuses React island bundle version marker");
await writeFile(directoryComponentTypesReactIslandHostPath, directoryStatusesReactIslandHostSource.replaceAll(directoryStatusesReactIslandVersionMarker, directoryStatusesReactIslandVersion));

// The token is intentionally calculated before esbuild emits dynamic chunks.
// Deriving it from output chunk names creates a circular hash graph and makes
// identical source produce different cache URLs on consecutive builds.
const jsReleaseToken = await getJavaScriptReleaseToken(join(stagingDistDir, "src"));

// The application used to start through a deep static ESM graph.  On a real
// contour that produces dozens of round trips before the first screen can be
// rendered.  Keep source modules in dist for diagnostics, but publish a single
// minified entry file so startup has one script request instead of a waterfall.
await bundleApplication(join(stagingDistDir, "src", "app.js"), join(stagingDistDir, "src", "app.js"));

await versionLocalJsImports(join(stagingDistDir, "src"), jsReleaseToken, deployCacheSuffix);
await versionCssImports(join(stagingDistDir, "styles.css"), deployCacheSuffix);
const [stylesVersion, uiCoreStylesVersion, visualLiveStylesVersion, faviconVersion] = await Promise.all([
  fileHash(join(stagingDistDir, "styles.css")),
  pathExists(join(stagingDistDir, "styles", "mes-ui-core.css")).then((exists) => (
    exists ? fileHash(join(stagingDistDir, "styles", "mes-ui-core.css")) : ""
  )),
  pathExists(join(stagingDistDir, "styles", "visual-overrides.live.css")).then((exists) => (
    exists ? fileHash(join(stagingDistDir, "styles", "visual-overrides.live.css")) : ""
  )),
  pathExists(join(stagingDistDir, "favicon.svg")).then((exists) => exists ? fileHash(join(stagingDistDir, "favicon.svg")) : ""),
]);
const appVersion = await fileHash(join(stagingDistDir, "src", "app.js"));

html = replaceRequired(
  html,
  /href="\.\/styles\.css(?:\?[^"]*)?"/g,
  `href="./styles.css?v=${stylesVersion}${deployCacheSuffix}"`,
  "styles.css link",
);
if (uiCoreStylesVersion) {
  html = replaceRequired(
    html,
    /href="\.\/styles\/mes-ui-core\.css(?:\?[^"]*)?"/,
    `href="./styles/mes-ui-core.css?v=${uiCoreStylesVersion}${deployCacheSuffix}"`,
    "styles/mes-ui-core.css link",
  );
}
if (visualLiveStylesVersion) {
  html = replaceRequired(
    html,
    /href="\.\/styles\/visual-overrides\.live\.css(?:\?[^\"]*)?"/,
    `href="./styles/visual-overrides.live.css?v=${visualLiveStylesVersion}${deployCacheSuffix}"`,
    "styles/visual-overrides.live.css link",
  );
}
html = replaceRequired(
  html,
  /src="\.\/src\/app\.js(?:\?[^"]*)?"/,
  `src="./src/app.js?v=${appVersion}${deployCacheSuffix}"`,
  "src/app.js script",
);
if (faviconVersion) {
  html = replaceRequired(
    html,
    /href="\.\/favicon\.svg(?:\?[^"]*)?"/,
    `href="./favicon.svg?v=${faviconVersion}${deployCacheSuffix}"`,
    "favicon.svg link",
  );
}
await writeFile(join(stagingDistDir, "index.html"), html);
await precompressStaticAssets(stagingDistDir);

let previousMoved = false;
try {
  if (await pathExists(distDir)) {
    await rename(distDir, previousDistDir);
    previousMoved = true;
  }
  await rename(stagingDistDir, distDir);
  await rm(previousDistDir, { recursive: true, force: true });
} catch (error) {
  if (previousMoved && !(await pathExists(distDir)) && await pathExists(previousDistDir)) {
    await rename(previousDistDir, distDir);
  }
  throw error;
}

console.log("Static staging build created:");
console.log(`- ${distDir}`);
console.log(`- styles.css?v=${stylesVersion}${deployCacheSuffix}`);
if (uiCoreStylesVersion) console.log(`- styles/mes-ui-core.css?v=${uiCoreStylesVersion}${deployCacheSuffix}`);
console.log(`- src/app.js?v=${appVersion}${deployCacheSuffix}`);
console.log(`- src/react-islands/nomenclature.js?v=${nomenclatureReactIslandVersion}`);
console.log(`- src/react-islands/boards.js?v=${boardsReactIslandVersion}`);
console.log(`- src/react-islands/structure-employees.js?v=${structureEmployeesReactIslandVersion}`);
console.log(`- src/react-islands/structure-positions.js?v=${structurePositionsReactIslandVersion}`);
console.log(`- src/react-islands/structure-org-units.js?v=${structureOrgUnitsReactIslandVersion}`);
console.log(`- src/react-islands/structure-work-centers.js?v=${structureWorkCentersReactIslandVersion}`);
console.log(`- src/react-islands/structure-equipment.js?v=${structureEquipmentReactIslandVersion}`);
console.log(`- src/react-islands/structure-responsibility-policies.js?v=${structureResponsibilityPoliciesReactIslandVersion}`);
console.log(`- src/react-islands/structure-migration-diagnostics.js?v=${structureMigrationDiagnosticsReactIslandVersion}`);
console.log(`- src/react-islands/weekly-production-control.js?v=${weeklyProductionControlReactIslandVersion}`);
console.log(`- src/react-islands/timesheet.js?v=${timesheetReactIslandVersion}`);
console.log(`- src/react-islands/planning-workbench.js?v=${planningWorkbenchReactIslandVersion}`);
console.log(`- src/react-islands/shift-work-orders.js?v=${shiftWorkOrdersReactIslandVersion}`);
console.log(`- src/react-islands/shift-work-orders-print.js?v=${shiftWorkOrdersPrintVersion}`);
console.log(`- src/react-islands/shift-work-orders-fact.js?v=${shiftWorkOrdersFactVersion}`);
console.log(`- src/react-islands/shift-master-board.js?v=${shiftMasterBoardReactIslandVersion}`);
console.log(`- src/react-islands/employee-desktop.js?v=${employeeDesktopReactIslandVersion}`);
console.log(`- src/react-islands/marking.js?v=${markingReactIslandVersion}`);
console.log(`- src/react-islands/dispatch.js?v=${dispatchReactIslandVersion}`);
console.log(`- src/react-islands/auth-picker.js?v=${authPickerReactIslandVersion}`);
console.log(`- src/react-islands/contour-admin.js?v=${contourAdminReactIslandVersion}`);
console.log(`- src/react-islands/specifications2.js?v=${specifications2ReactIslandVersion}`);
console.log(`- src/react-islands/gantt.js?v=${ganttReactIslandVersion}`);
console.log(`- src/react-islands/roles.js?v=${rolesReactIslandVersion}`);
console.log(`- src/react-islands/component-types.js?v=${directoryComponentTypesReactIslandVersion}`);
console.log(`- src/react-islands/operations.js?v=${directoryOperationsReactIslandVersion}`);
console.log(`- src/react-islands/nomenclature-types.js?v=${directoryNomenclatureTypesReactIslandVersion}`);
console.log(`- src/react-islands/statuses.js?v=${directoryStatusesReactIslandVersion}`);
if (faviconVersion) console.log(`- favicon.svg?v=${faviconVersion}${deployCacheSuffix}`);
console.log(`- app version: ${appDisplayVersion}`);
