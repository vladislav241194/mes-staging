import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appVersionPath = join(projectRoot, "app-version.json");
const appVersionPattern = /^v\.(\d)\.(\d{3})\.(\d{2})$/;

function parseVersion(version) {
  const match = String(version || "").trim().match(appVersionPattern);
  if (!match) {
    throw new Error(`Version must match v.x.xxx.xx, got "${version}"`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion({ major, minor, patch }) {
  if (major < 0 || major > 9) throw new Error(`Major version must stay in x range, got ${major}`);
  if (minor < 0 || minor > 999) throw new Error(`Minor version must stay in xxx range, got ${minor}`);
  if (patch < 0 || patch > 99) throw new Error(`Patch version must stay in xx range, got ${patch}`);
  return `v.${major}.${String(minor).padStart(3, "0")}.${String(patch).padStart(2, "0")}`;
}

function nextVersion(version) {
  const parsed = parseVersion(version);
  parsed.patch += 1;
  if (parsed.patch > 99) {
    parsed.patch = 0;
    parsed.minor += 1;
  }
  if (parsed.minor > 999) {
    parsed.minor = 0;
    parsed.major += 1;
  }
  return formatVersion(parsed);
}

function requestedVersion() {
  const setIndex = process.argv.indexOf("--set");
  if (setIndex === -1) return "";
  const value = process.argv[setIndex + 1];
  if (!value) throw new Error("Usage: npm run version:bump -- --set v.x.xxx.xx");
  parseVersion(value);
  return value;
}

async function replaceInFile(filePath, replacements) {
  let source = await readFile(filePath, "utf-8");
  let updated = source;
  for (const { label, pattern, replacement } of replacements) {
    if (!pattern.test(updated)) {
      throw new Error(`Cannot find ${label} in ${filePath}`);
    }
    updated = updated.replace(pattern, replacement);
  }
  if (updated !== source) {
    await writeFile(filePath, updated);
  }
}

const manifest = JSON.parse(await readFile(appVersionPath, "utf-8"));
const previousVersion = String(manifest.version || "").trim();
parseVersion(previousVersion);
const targetVersion = requestedVersion() || nextVersion(previousVersion);

manifest.version = targetVersion;
manifest.format = "v.x.xxx.xx";
await writeFile(appVersionPath, `${JSON.stringify(manifest, null, 2)}\n`);

await replaceInFile(join(projectRoot, "index.html"), [
  {
    label: "window.__MES_DEPLOY_VERSION__",
    pattern: /window\.__MES_DEPLOY_VERSION__\s*=\s*["'][^"']*["'];/,
    replacement: `window.__MES_DEPLOY_VERSION__ = "${targetVersion}";`,
  },
]);

await replaceInFile(join(projectRoot, "src", "app.js"), [
  {
    label: "APP_VERSION_FALLBACK",
    pattern: /const APP_VERSION_FALLBACK\s*=\s*["'][^"']*["'];/,
    replacement: `const APP_VERSION_FALLBACK = "${targetVersion}";`,
  },
]);

await replaceInFile(join(projectRoot, "bootstrap-snapshot.json"), [
  {
    label: "bootstrap snapshot version",
    pattern: /"version"\s*:\s*"v\.\d\.\d{3}(?:\.\d{2})?"/,
    replacement: `"version": "${targetVersion}"`,
  },
]);

console.log(`MES app version: ${previousVersion} -> ${targetVersion}`);
