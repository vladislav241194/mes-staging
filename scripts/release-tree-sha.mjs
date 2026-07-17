#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

function parseArgs(argv) {
  const includes = [];
  for (const arg of argv) {
    if (arg.startsWith("--include=")) {
      const value = arg.slice("--include=".length).trim();
      if (value) includes.push(value);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!includes.length) throw new Error("At least one --include=path is required");
  return includes;
}

function normalizedRelativePath(path) {
  return String(path).split(sep).join("/").replace(/^\.\//, "");
}

async function collectFiles(root, relativePath, files) {
  const absolutePath = resolve(root, relativePath);
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed in release digest: ${relativePath}`);

  if (info.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await collectFiles(root, `${relativePath}/${entry.name}`, files);
    }
    return;
  }

  if (!info.isFile()) throw new Error(`Unsupported release entry: ${relativePath}`);
  files.push({ absolutePath, relativePath: normalizedRelativePath(relativePath) });
}

async function main() {
  const includes = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const files = [];
  for (const include of includes) {
    await collectFiles(root, include, files);
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file.relativePath);
    digest.update("\0");
    digest.update(await readFile(file.absolutePath));
    digest.update("\0");
  }

  process.stdout.write(`${digest.digest("hex")}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
