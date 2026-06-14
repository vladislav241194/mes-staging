import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

const [stylesVersion, appVersion, faviconVersion] = await Promise.all([
  fileHash(join(stagingDistDir, "styles.css")),
  fileHash(join(stagingDistDir, "src", "app.js")),
  pathExists(join(stagingDistDir, "favicon.svg")).then((exists) => exists ? fileHash(join(stagingDistDir, "favicon.svg")) : ""),
]);

let html = await readFile(join(stagingDistDir, "index.html"), "utf-8");
html = replaceRequired(
  html,
  /href="\.\/styles\.css(?:\?[^"]*)?"/,
  `href="./styles.css?v=${stylesVersion}"`,
  "styles.css link",
);
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
console.log(`- src/app.js?v=${appVersion}`);
if (faviconVersion) console.log(`- favicon.svg?v=${faviconVersion}`);
