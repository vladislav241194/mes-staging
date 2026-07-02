import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(projectRoot, "dist");
const stagingDistDir = join(projectRoot, `.dist-build-${Date.now()}`);
const previousDistDir = join(projectRoot, ".dist-previous");

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

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

async function getJsModuleHashes(rootDir, filePaths) {
  const hashes = new Map();
  await Promise.all(filePaths.map(async (filePath) => {
    hashes.set(toPosixPath(relative(rootDir, filePath)), await fileHash(filePath));
  }));
  return hashes;
}

function withVersionedLocalJsImport(rootDir, importerPath, hashes, prefix, specifier, suffix) {
  const targetPath = join(dirname(importerPath), specifier);
  const targetKey = toPosixPath(relative(rootDir, targetPath));
  const version = hashes.get(targetKey);
  if (!version) return `${prefix}${specifier}${suffix}`;
  return `${prefix}${specifier}?v=${version}${suffix}`;
}

async function versionLocalJsImports(rootDir) {
  const filePaths = await collectJsFiles(rootDir);
  let hashes = await getJsModuleHashes(rootDir, filePaths);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let sourceChanged = false;

    for (const filePath of filePaths) {
      const source = await readFile(filePath, "utf-8");
      const versioned = source
        .replace(/(from\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g, (match, prefix, specifier, suffix) => (
          withVersionedLocalJsImport(rootDir, filePath, hashes, prefix, specifier, suffix)
        ))
        .replace(/(\bimport\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g, (match, prefix, specifier, suffix) => (
          withVersionedLocalJsImport(rootDir, filePath, hashes, prefix, specifier, suffix)
        ))
        .replace(/(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["']\s*\))/g, (match, prefix, specifier, suffix) => (
          withVersionedLocalJsImport(rootDir, filePath, hashes, prefix, specifier, suffix)
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

async function versionCssImports(stylesheetPath) {
  const source = await readFile(stylesheetPath, "utf-8");
  const matches = [...source.matchAll(/(@import\s+(?:url\()?["'])(\.{1,2}\/[^"')]+?\.css)(?:\?[^"')]+)?(["']\)?\s*;)/g)];
  if (!matches.length) return source;

  let versioned = source;
  for (const match of matches) {
    const [fullMatch, prefix, specifier, suffix] = match;
    const targetPath = join(dirname(stylesheetPath), specifier);
    if (!(await pathExists(targetPath))) continue;
    const version = await fileHash(targetPath);
    versioned = versioned.replace(fullMatch, `${prefix}${specifier}?v=${version}${suffix}`);
  }

  if (versioned !== source) {
    await writeFile(stylesheetPath, versioned);
  }
  return versioned;
}

function replaceRequired(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Cannot find ${label} in staging index.html`);
  }

  return html.replace(pattern, replacement);
}

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

const workflowPresetPath = join(projectRoot, "workflow-preset.json");
if (await pathExists(workflowPresetPath)) {
  await copyFile(workflowPresetPath, join(stagingDistDir, "workflow-preset.json"));
}

const jsModuleHashes = await versionLocalJsImports(join(stagingDistDir, "src"));
await versionCssImports(join(stagingDistDir, "styles.css"));
const [stylesVersion, uiCoreStylesVersion, faviconVersion] = await Promise.all([
  fileHash(join(stagingDistDir, "styles.css")),
  pathExists(join(stagingDistDir, "styles", "mes-ui-core.css")).then((exists) => (
    exists ? fileHash(join(stagingDistDir, "styles", "mes-ui-core.css")) : ""
  )),
  pathExists(join(stagingDistDir, "favicon.svg")).then((exists) => exists ? fileHash(join(stagingDistDir, "favicon.svg")) : ""),
]);
const appVersion = jsModuleHashes.get("app.js") || await fileHash(join(stagingDistDir, "src", "app.js"));

let html = await readFile(join(stagingDistDir, "index.html"), "utf-8");
html = replaceRequired(
  html,
  /href="\.\/styles\.css(?:\?[^"]*)?"/,
  `href="./styles.css?v=${stylesVersion}"`,
  "styles.css link",
);
if (uiCoreStylesVersion) {
  html = replaceRequired(
    html,
    /href="\.\/styles\/mes-ui-core\.css(?:\?[^"]*)?"/,
    `href="./styles/mes-ui-core.css?v=${uiCoreStylesVersion}"`,
    "styles/mes-ui-core.css link",
  );
}
html = replaceRequired(
  html,
  /src="\.\/src\/app\.js(?:\?[^"]*)?"/,
  `src="./src/app.js?v=${appVersion}"`,
  "src/app.js script",
);
if (faviconVersion) {
  html = replaceRequired(
    html,
    /href="\.\/favicon\.svg(?:\?[^"]*)?"/,
    `href="./favicon.svg?v=${faviconVersion}"`,
    "favicon.svg link",
  );
}
await writeFile(join(stagingDistDir, "index.html"), html);

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
console.log(`- styles.css?v=${stylesVersion}`);
if (uiCoreStylesVersion) console.log(`- styles/mes-ui-core.css?v=${uiCoreStylesVersion}`);
console.log(`- src/app.js?v=${appVersion}`);
if (faviconVersion) console.log(`- favicon.svg?v=${faviconVersion}`);
