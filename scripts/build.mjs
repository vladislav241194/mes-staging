import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(projectRoot, "dist");

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
    throw new Error(`Cannot find ${label} in dist/index.html`);
  }

  return html.replace(pattern, replacement);
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await copyFile(join(projectRoot, "index.html"), join(distDir, "index.html"));
await copyFile(join(projectRoot, "styles.css"), join(distDir, "styles.css"));
await copyDirectory(join(projectRoot, "src"), join(distDir, "src"));

const faviconPath = join(projectRoot, "favicon.svg");
if (await pathExists(faviconPath)) {
  await copyFile(faviconPath, join(distDir, "favicon.svg"));
}

const imagePath = join(projectRoot, "mes-planning-prototype.png");
if (await pathExists(imagePath)) {
  await copyFile(imagePath, join(distDir, "mes-planning-prototype.png"));
}

const [stylesVersion, appVersion, faviconVersion] = await Promise.all([
  fileHash(join(distDir, "styles.css")),
  fileHash(join(distDir, "src", "app.js")),
  pathExists(join(distDir, "favicon.svg")).then((exists) => exists ? fileHash(join(distDir, "favicon.svg")) : ""),
]);

let html = await readFile(join(distDir, "index.html"), "utf-8");
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
await writeFile(join(distDir, "index.html"), html);

console.log("Static staging build created:");
console.log(`- ${distDir}`);
console.log(`- styles.css?v=${stylesVersion}`);
console.log(`- src/app.js?v=${appVersion}`);
if (faviconVersion) console.log(`- favicon.svg?v=${faviconVersion}`);
