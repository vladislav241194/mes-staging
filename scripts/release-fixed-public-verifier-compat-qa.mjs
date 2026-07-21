#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { REACT_RUNTIME_SURFACE_IDS } from "./react-runtime-policy.mjs";
import { computeTreeSha } from "./release-tree-sha.mjs";

const execFile = promisify(execFileCallback);
const fixedVerifier = new URL("./release-verify.mjs", import.meta.url).pathname;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const root = await mkdtemp(join(tmpdir(), "mes-fixed-public-verifier-compat-"));

async function createRelease(releaseId, appVersion) {
  const releasePath = join(root, releaseId);
  const appPath = join(releasePath, "app");
  await mkdir(join(appPath, "dist"), { recursive: true });
  await mkdir(join(appPath, "scripts"), { recursive: true });
  const source = `${releaseId} source\n`;
  const packageLock = '{"lockfileVersion":3}\n';
  const runtimePolicy = `${JSON.stringify({
    schemaVersion: 1,
    policyId: `${releaseId}-policy`,
    surfaces: Object.fromEntries(REACT_RUNTIME_SURFACE_IDS.map((id) => [id, "evaluation"])),
  })}\n`;
  const bootstrap = `${releaseId} private bootstrap\n`;
  const bootstrapGzip = `${releaseId} private gzip\n`;
  const bootstrapBrotli = `${releaseId} private Brotli\n`;
  await writeFile(join(appPath, "source.txt"), source);
  await writeFile(join(appPath, "package-lock.json"), packageLock);
  await writeFile(join(appPath, "react-runtime-policy.json"), runtimePolicy);
  await writeFile(join(appPath, "dist", "index.js"), `${releaseId} dist\n`);
  for (const path of ["bootstrap-snapshot.json", "dist/bootstrap-snapshot.json"]) {
    await writeFile(join(appPath, path), bootstrap, { mode: 0o400 });
    await chmod(join(appPath, path), 0o400);
  }
  await writeFile(join(appPath, "dist/bootstrap-snapshot.json.gz"), bootstrapGzip, { mode: 0o400 });
  await writeFile(join(appPath, "dist/bootstrap-snapshot.json.br"), bootstrapBrotli, { mode: 0o400 });
  await chmod(join(appPath, "dist/bootstrap-snapshot.json.gz"), 0o400);
  await chmod(join(appPath, "dist/bootstrap-snapshot.json.br"), 0o400);
  await writeFile(join(appPath, "scripts/release-verify.mjs"), `
if (process.argv.includes("--public-only")) process.exit(88);
process.stdout.write("OLD_VERIFIER_RAN\\n");
`);
  const runtimeIncludes = ["source.txt", "package-lock.json", "react-runtime-policy.json"];
  const manifest = {
    schemaVersion: 3,
    releaseId,
    appVersion,
    gitCommit: "a".repeat(40),
    gitProvenance: {
      schemaVersion: 1,
      gitCommit: "a".repeat(40),
      branch: "qa/fixed-verifier",
      remote: "origin",
      upstreamRef: "origin/qa/fixed-verifier",
      upstreamBranchRef: "refs/heads/qa/fixed-verifier",
      upstreamCommit: "a".repeat(40),
      verification: "fresh-upstream-fetch",
      verifiedAt: "2026-07-21T00:00:00.000Z",
    },
    runtimeIncludes,
    sourceTreeSha256: await computeTreeSha({ root: appPath, includes: runtimeIncludes }),
    distTreeSha256: await computeTreeSha({
      root: appPath,
      includes: ["dist"],
      excludes: [
        "dist/bootstrap-snapshot.json",
        "dist/bootstrap-snapshot.json.gz",
        "dist/bootstrap-snapshot.json.br",
      ],
    }),
    packageLockSha256: sha256(packageLock),
    runtimePolicy: {
      schemaVersion: 1,
      path: "react-runtime-policy.json",
      policyId: `${releaseId}-policy`,
      sha256: sha256(runtimePolicy),
    },
    compatibilityArtifacts: [{
      id: "bootstrap-snapshot",
      sha256: sha256(bootstrap),
      operationalPath: "/srv/mes/pilot/runtime/bootstrap-snapshot.json",
      stagedPaths: ["bootstrap-snapshot.json", "dist/bootstrap-snapshot.json"],
      generatedPaths: [
        { path: "dist/bootstrap-snapshot.json.gz", sha256: sha256(bootstrapGzip) },
        { path: "dist/bootstrap-snapshot.json.br", sha256: sha256(bootstrapBrotli) },
      ],
    }],
  };
  const manifestPath = join(releasePath, "release-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { releaseId, appPath, manifestPath, manifest, oldVerifier: join(appPath, "scripts/release-verify.mjs") };
}

async function fixedPublicVerify(release) {
  const result = await execFile(process.execPath, [
    fixedVerifier,
    `--app-root=${release.appPath}`,
    `--manifest=${release.manifestPath}`,
    `--expected-release-id=${release.releaseId}`,
    "--json",
    "--public-only",
  ]);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.releaseId, release.releaseId);
  assert.equal(parsed.privateCompatibilityArtifactsVerified, false);
}

async function expectFixedPublicRejected(release, pattern, message) {
  const error = await execFile(process.execPath, [
    fixedVerifier,
    `--app-root=${release.appPath}`,
    `--manifest=${release.manifestPath}`,
    `--expected-release-id=${release.releaseId}`,
    "--json",
    "--public-only",
  ]).then(() => null, (caught) => caught);
  assert(error, message);
  assert.match(`${error.stderr || ""}${error.message || ""}`, pattern, message);
}

try {
  const release24 = await createRelease("v.1.500.24-old", "v.1.500.24");
  const release25 = await createRelease("v.1.500.25-old", "v.1.500.25");
  const release26 = await createRelease("v.1.500.26-new", "v.1.500.26");
  const oldAttempt = await execFile(process.execPath, [release25.oldVerifier, "--public-only"])
    .then(() => 0, (error) => error.code);
  assert.equal(oldAttempt, 88, "the matrix must model an old verifier that rejects --public-only");
  for (const [label, current, target] of [
    ["new-to-old", release26, release25],
    ["old-to-new", release25, release26],
    ["old-to-old", release25, release24],
  ]) {
    await fixedPublicVerify(current);
    await fixedPublicVerify(target);
    assert(label, "matrix label must remain observable");
  }
  const validManifest = structuredClone(release26.manifest);
  delete release26.manifest.compatibilityArtifacts[0].operationalPath;
  await writeFile(release26.manifestPath, `${JSON.stringify(release26.manifest)}\n`);
  await expectFixedPublicRejected(release26, /exact canonical bootstrap descriptor schema/,
    "the fixed public verifier must reject a missing bootstrap operationalPath");
  release26.manifest = structuredClone(validManifest);
  release26.manifest.compatibilityArtifacts[0].operationalPath = "/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json";
  await writeFile(release26.manifestPath, `${JSON.stringify(release26.manifest)}\n`);
  await expectFixedPublicRejected(release26, /canonical bootstrap operational path/,
    "the recovery mirror path must never replace the schema-v3 operationalPath");
  release26.manifest = structuredClone(validManifest);
  release26.manifest.compatibilityArtifacts[0].unexpected = true;
  await writeFile(release26.manifestPath, `${JSON.stringify(release26.manifest)}\n`);
  await expectFixedPublicRejected(release26, /exact canonical bootstrap descriptor schema/,
    "the fixed public verifier must reject extra bootstrap descriptor fields");
  await writeFile(release26.manifestPath, `${JSON.stringify(validManifest)}\n`);
  console.log("Fixed public verifier compatibility QA: .26<->.25 and old->old OK");
} finally {
  await rm(root, { recursive: true, force: true });
}
