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

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(projectRoot, "dist");
const stagingDistDir = join(projectRoot, `.dist-build-${Date.now()}`);
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

async function getJsModuleHashes(rootDir, filePaths) {
  const hashes = new Map();
  await Promise.all(filePaths.map(async (filePath) => {
    hashes.set(toPosixPath(relative(rootDir, filePath)), await fileHash(filePath));
  }));
  return hashes;
}

function withVersionedLocalJsImport(rootDir, importerPath, hashes, deployCacheSuffix, prefix, specifier, suffix) {
  const targetPath = join(dirname(importerPath), specifier);
  const targetKey = toPosixPath(relative(rootDir, targetPath));
  const version = hashes.get(targetKey);
  if (!version) return `${prefix}${specifier}${suffix}`;
  return `${prefix}${specifier}?v=${version}${deployCacheSuffix}${suffix}`;
}

async function versionLocalJsImports(rootDir, deployCacheSuffix = "") {
  const filePaths = await collectJsFiles(rootDir);
  let hashes = await getJsModuleHashes(rootDir, filePaths);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let sourceChanged = false;

    for (const filePath of filePaths) {
      const source = await readFile(filePath, "utf-8");
      const versioned = source
        .replace(/(from\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g, (match, prefix, specifier, suffix) => (
          withVersionedLocalJsImport(rootDir, filePath, hashes, deployCacheSuffix, prefix, specifier, suffix)
        ))
        .replace(/(\bimport\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g, (match, prefix, specifier, suffix) => (
          withVersionedLocalJsImport(rootDir, filePath, hashes, deployCacheSuffix, prefix, specifier, suffix)
        ))
        .replace(/(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["']\s*\))/g, (match, prefix, specifier, suffix) => (
          withVersionedLocalJsImport(rootDir, filePath, hashes, deployCacheSuffix, prefix, specifier, suffix)
        ));

      if (versioned !== source) {
        sourceChanged = true;
        await writeFile(filePath, versioned);
      }
    }

    const nextHashes = await getJsModuleHashes(rootDir, filePaths);
    const hashChanged = filePaths.some((filePath) => {
      const key = toPosixPath(relative(rootDir, filePath));
      return nextHashes.get(key) !== hashes.get(key);
    });
    hashes = nextHashes;

    if (!sourceChanged && !hashChanged) break;
  }

  return hashes;
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
await syncMesIconRuntimeRegistry();
await syncGeneratedModuleBlueprintIndexes();
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
await copyFile(appVersionPath, join(stagingDistDir, "app-version.json"));
let html = await readFile(join(stagingDistDir, "index.html"), "utf-8");
html = injectAppDisplayVersion(html, appDisplayVersion);
const deployCacheSuffix = getDeployCacheSuffix(html);

await Promise.all([
  minifyJavaScriptFiles(join(stagingDistDir, "src")),
  minifyCssFiles(join(stagingDistDir, "styles")),
]);

await bundleStylesheet(join(projectRoot, "styles.css"), join(stagingDistDir, "styles.css"));

// The application used to start through a deep static ESM graph.  On a real
// contour that produces dozens of round trips before the first screen can be
// rendered.  Keep source modules in dist for diagnostics, but publish a single
// minified entry file so startup has one script request instead of a waterfall.
await bundleApplication(join(stagingDistDir, "src", "app.js"), join(stagingDistDir, "src", "app.js"));

const jsModuleHashes = await versionLocalJsImports(join(stagingDistDir, "src"), deployCacheSuffix);
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
const appVersion = jsModuleHashes.get("app.js") || await fileHash(join(stagingDistDir, "src", "app.js"));

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
if (faviconVersion) console.log(`- favicon.svg?v=${faviconVersion}${deployCacheSuffix}`);
console.log(`- app version: ${appDisplayVersion}`);
