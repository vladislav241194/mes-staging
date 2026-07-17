#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { computeTreeSha } from "./release-tree-sha.mjs";

function parseArgs(argv) {
  const args = { manifest: "", appRoot: process.cwd(), expectedReleaseId: "", json: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "manifest") args.manifest = String(value);
    else if (key === "app-root") args.appRoot = String(value);
    else if (key === "expected-release-id") args.expectedReleaseId = String(value);
    else if (key === "json") args.json = true;
    else throw new Error(`Unknown option: --${key}`);
  }
  if (!args.manifest) throw new Error("--manifest is required");
  return args;
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function isSafeRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  return Boolean(normalized)
    && !isAbsolute(normalized)
    && !normalized.split("/").includes("..")
    && !normalized.startsWith("./");
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function resolveAppFile(appRoot, relativePath) {
  assert(isSafeRelativePath(relativePath), `Unsafe release artifact path: ${relativePath}`);
  const absolutePath = resolve(appRoot, relativePath);
  assert(!relative(appRoot, absolutePath).startsWith(".."), `Artifact escapes app root: ${relativePath}`);
  return absolutePath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appRoot = resolve(args.appRoot);
  const manifestPath = resolve(args.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert(manifest?.schemaVersion === 1, "Unsupported release manifest schema");
  assert(typeof manifest.releaseId === "string" && manifest.releaseId, "Manifest release id is missing");
  if (args.expectedReleaseId) {
    assert(manifest.releaseId === args.expectedReleaseId, `Unexpected release id: ${manifest.releaseId}`);
  }
  assert(Array.isArray(manifest.runtimeIncludes) && manifest.runtimeIncludes.length, "Manifest runtime includes are missing");
  for (const include of manifest.runtimeIncludes) {
    assert(isSafeRelativePath(include), `Unsafe runtime include: ${include}`);
  }

  const compatibilityArtifacts = Array.isArray(manifest.compatibilityArtifacts)
    ? manifest.compatibilityArtifacts
    : [];
  const distExcludes = [];
  for (const artifact of compatibilityArtifacts) {
    assert(typeof artifact?.id === "string" && artifact.id, "Compatibility artifact id is missing");
    assert(typeof artifact?.sha256 === "string" && /^[a-f0-9]{64}$/i.test(artifact.sha256), `Compatibility artifact ${artifact.id} digest is invalid`);
    assert(Array.isArray(artifact.stagedPaths) && artifact.stagedPaths.length, `Compatibility artifact ${artifact.id} paths are missing`);
    for (const stagedPath of artifact.stagedPaths) {
      const actualDigest = await sha256(resolveAppFile(appRoot, stagedPath));
      assert(actualDigest === artifact.sha256, `Compatibility artifact ${artifact.id} hash mismatch at ${stagedPath}`);
      if (stagedPath.startsWith("dist/")) distExcludes.push(stagedPath);
    }
  }

  const sourceTreeSha256 = await computeTreeSha({ root: appRoot, includes: manifest.runtimeIncludes });
  const distTreeSha256 = await computeTreeSha({ root: appRoot, includes: ["dist"], excludes: distExcludes });
  assert(sourceTreeSha256 === manifest.sourceTreeSha256, "Release source tree hash mismatch");
  assert(distTreeSha256 === manifest.distTreeSha256, "Release dist tree hash mismatch");

  const result = {
    releaseId: manifest.releaseId,
    sourceTreeSha256,
    distTreeSha256,
    compatibilityArtifactCount: compatibilityArtifacts.length,
  };
  process.stdout.write(args.json ? `${JSON.stringify(result)}\n` : `${result.releaseId}\n`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
