import { access, constants, mkdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getSharedStateServerPaths,
  isDestructiveActionsAllowed,
  isProtectedAppEnv,
  isBootstrapSnapshotRestoreEnabled,
} from "./shared-state-storage.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const createDirs = process.argv.includes("--create-dirs");
const asJson = process.argv.includes("--json");

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function envValue(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

async function ensureWritableDirectory(path, label, results) {
  if (!path) {
    results.failures.push(`${label} is not configured`);
    return;
  }

  if (createDirs) await mkdir(path, { recursive: true });

  try {
    const pathStat = await stat(path);
    if (!pathStat.isDirectory()) {
      results.failures.push(`${label} is not a directory: ${path}`);
      return;
    }
    await access(path, constants.R_OK | constants.W_OK);
    results.checks.push(`${label}: writable`);
  } catch (error) {
    results.failures.push(`${label} is not writable: ${path} (${error?.message || "unknown error"})`);
  }
}

async function main() {
  const paths = getSharedStateServerPaths({
    projectRoot,
    fallbackFile: resolve(projectRoot, ".mes-shared-state.json"),
  });
  const results = {
    appEnv: paths.appEnv,
    projectRoot,
    checks: [],
    warnings: [],
    failures: [],
  };

  const nodeMajor = Number(process.versions.node.split(".")[0] || 0);
  if (nodeMajor < 20) {
    results.failures.push(`Node.js 20+ is required, current is ${process.versions.node}`);
  } else {
    results.checks.push(`Node.js ${process.versions.node}`);
  }

  const port = Number(envValue("PORT"));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    results.failures.push("PORT must be a valid TCP port");
  } else {
    results.checks.push(`PORT ${port}`);
  }

  if (!envValue("APP_BASE_URL")) {
    results.warnings.push("APP_BASE_URL is not configured; server healthcheck will need --url");
  }

  if (isProtectedAppEnv(process.env)) {
    if (isDestructiveActionsAllowed(process.env)) {
      results.failures.push("MES_ALLOW_DESTRUCTIVE_ACTIONS=true is not allowed for protected contours by default");
    }
    if (isBootstrapSnapshotRestoreEnabled(process.env)) {
      results.failures.push("MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE=true is not allowed for protected contours by default");
    }
    if (isInside(projectRoot, paths.filePath)) {
      results.failures.push(`Shared-state file must be outside the git checkout: ${paths.filePath}`);
    }
  }

  await ensureWritableDirectory(dirname(paths.filePath), "shared-state directory", results);
  await ensureWritableDirectory(paths.backupDir, "backup directory", results);
  await ensureWritableDirectory(dirname(paths.auditLogPath), "audit directory", results);

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`MES server preflight: ${results.appEnv}`);
    results.checks.forEach((item) => console.log(`OK  ${item}`));
    results.warnings.forEach((item) => console.log(`WARN ${item}`));
    results.failures.forEach((item) => console.log(`FAIL ${item}`));
  }

  if (results.failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
