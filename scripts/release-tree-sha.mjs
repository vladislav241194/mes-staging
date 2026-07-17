#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

function parseArgs(argv) {
  const includes = [];
  const excludes = [];
  for (const arg of argv) {
    if (arg.startsWith("--include=")) {
      const value = arg.slice("--include=".length).trim();
      if (value) includes.push(value);
      continue;
    }
    if (arg.startsWith("--exclude=")) {
      const value = arg.slice("--exclude=".length).trim();
      if (value) excludes.push(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!includes.length) throw new Error("At least one --include=path is required");
  return { includes, excludes };
}

function normalizedRelativePath(path) {
  return String(path).split(sep).join("/").replace(/^\.\//, "");
}

function isExcluded(relativePath, excludedPaths) {
  const normalized = normalizedRelativePath(relativePath);
  return excludedPaths.some((excludedPath) => (
    normalized === excludedPath || normalized.startsWith(`${excludedPath}/`)
  ));
}

async function collectFiles(root, relativePath, files, excludedPaths) {
  if (isExcluded(relativePath, excludedPaths)) return;
  const absolutePath = resolve(root, relativePath);
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed in release digest: ${relativePath}`);

  if (info.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await collectFiles(root, `${relativePath}/${entry.name}`, files, excludedPaths);
    }
    return;
  }

  if (!info.isFile()) throw new Error(`Unsupported release entry: ${relativePath}`);
  files.push({ absolutePath, relativePath: normalizedRelativePath(relativePath) });
}

export async function computeTreeSha({ root = process.cwd(), includes, excludes = [] } = {}) {
  if (!Array.isArray(includes) || !includes.length) {
    throw new Error("At least one include path is required");
  }
  const normalizedExcludes = excludes.map(normalizedRelativePath);
  const files = [];
  for (const include of includes) {
    await collectFiles(root, include, files, normalizedExcludes);
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file.relativePath);
    digest.update("\0");
    digest.update(await readFile(file.absolutePath));
    digest.update("\0");
  }
  return digest.digest("hex");
}

async function main() {
  const { includes, excludes } = parseArgs(process.argv.slice(2));
  const digest = await computeTreeSha({ includes, excludes });
  process.stdout.write(`${digest}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
