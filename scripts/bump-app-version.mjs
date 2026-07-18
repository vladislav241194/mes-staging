import { readFile, rename, writeFile } from "node:fs/promises";
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

function replaceInText(source, filePath, replacements) {
  let updated = source;
  for (const { label, pattern, replacement } of replacements) {
    if (!pattern.test(updated)) {
      throw new Error(`Cannot find ${label} in ${filePath}`);
    }
    updated = updated.replace(pattern, replacement);
  }
  return updated;
}

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileAtomically(filePath, source) {
  const temporaryPath = `${filePath}.mes-version-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, source);
  await rename(temporaryPath, filePath);
}

async function writeVersionChanges(changes) {
  const applied = [];
  try {
    for (const change of changes) {
      await writeFileAtomically(change.filePath, change.updated);
      applied.push(change);
    }
  } catch (error) {
    await Promise.allSettled(applied.reverse().map((change) => writeFileAtomically(change.filePath, change.source)));
    throw error;
  }
}

const manifestSource = await readFile(appVersionPath, "utf-8");
const manifest = JSON.parse(manifestSource);
const previousVersion = String(manifest.version || "").trim();
parseVersion(previousVersion);
const targetVersion = requestedVersion() || nextVersion(previousVersion);

manifest.version = targetVersion;
manifest.format = "v.x.xxx.xx";
const indexPath = join(projectRoot, "index.html");
const indexSource = await readFile(indexPath, "utf-8");
const indexUpdated = replaceInText(indexSource, indexPath, [
  {
    label: "window.__MES_DEPLOY_VERSION__",
    pattern: /window\.__MES_DEPLOY_VERSION__\s*=\s*["'][^"']*["'];/,
    replacement: `window.__MES_DEPLOY_VERSION__ = "${targetVersion}";`,
  },
]);

const appSourcePath = join(projectRoot, "src", "app.js");
const appSource = await readFile(appSourcePath, "utf-8");
const appSourceUpdated = replaceInText(appSource, appSourcePath, [
  {
    label: "APP_VERSION_FALLBACK",
    pattern: /const APP_VERSION_FALLBACK\s*=\s*["'][^"']*["'];/,
    replacement: `const APP_VERSION_FALLBACK = "${targetVersion}";`,
  },
]);

const changes = [
  { filePath: appVersionPath, source: manifestSource, updated: `${JSON.stringify(manifest, null, 2)}\n` },
  { filePath: indexPath, source: indexSource, updated: indexUpdated },
  { filePath: appSourcePath, source: appSource, updated: appSourceUpdated },
];

// The production bootstrap snapshot is an external operational artifact. A
// clean Git worktree deliberately does not contain it; release staging copies
// it from the server after the reproducible code build. Bump it only when a
// local snapshot is explicitly present (for example, a legacy local QA run).
const bootstrapSnapshotPath = join(projectRoot, "bootstrap-snapshot.json");
const bootstrapSnapshotSource = await readOptionalFile(bootstrapSnapshotPath);
if (bootstrapSnapshotSource !== null) {
  changes.push({
    filePath: bootstrapSnapshotPath,
    source: bootstrapSnapshotSource,
    updated: replaceInText(bootstrapSnapshotSource, bootstrapSnapshotPath, [
      {
        label: "bootstrap snapshot version",
        pattern: /"version"\s*:\s*"v\.\d\.\d{3}(?:\.\d{2})?"/,
        replacement: `"version": "${targetVersion}"`,
      },
    ]),
  });
}

await writeVersionChanges(changes);

console.log(`MES app version: ${previousVersion} -> ${targetVersion}`);
