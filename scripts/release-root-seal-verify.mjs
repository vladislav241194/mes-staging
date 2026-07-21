#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstat,
  readdir,
  readFile,
  readlink,
  realpath,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT_HELPER_INSTALL_ROOT = "/usr/local/libexec/mes";
export const ROOT_HELPER_ACTIVE_BUNDLE = `${ROOT_HELPER_INSTALL_ROOT}/active-bundle`;
export const ROOT_SEAL_HELPER_PATH = `${ROOT_HELPER_ACTIVE_BUNDLE}/release-root-seal-verify.mjs`;
export const ROOT_HELPER_BUNDLE_MANIFEST = `${ROOT_HELPER_ACTIVE_BUNDLE}/helper-bundle.manifest.json`;
export const ROOT_HELPER_BUNDLE_FILES = Object.freeze([
  "release-root-seal-verify.mjs",
  "release-root-reinode-active.mjs",
  "release-activate-root.mjs",
  "release-rollback-root.mjs",
  "release-switch-journal.mjs",
  "with-pilot-release-authority-lock.sh",
  "recover-pilot-release-transitions.sh",
]);
export const ROOT_RELEASE_TRUST_ATTESTATION = "root-release-trust-attestation.json";
export const ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS = Object.freeze([
  "dist/bootstrap-snapshot.json.gz",
  "dist/bootstrap-snapshot.json.br",
]);
const ROOT_RELEASE_TRUST_INSTALLER = "root-ssh-clean-published-commit-new-inodes";
const ROOT_RELEASE_TRUST_METHODS = new Set(["fresh-root-stage", "root-reinode-copy"]);

function fail(message) {
  throw new Error(`Root seal verification failed: ${message}`);
}

function assertSafeAbsolutePath(path, label) {
  const value = String(path || "");
  if (!value || !isAbsolute(value) || normalize(value) !== value || value.includes("\0")) {
    fail(`${label} is not a normalized absolute path`);
  }
  return value;
}

function assertSafeReleaseId(value) {
  const releaseId = String(value || "");
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(releaseId)) fail("release id is unsafe");
  return releaseId;
}

function isWithin(root, path) {
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function modeBits(stats) {
  return stats.mode & 0o7777;
}

function describeMode(stats) {
  return (modeBits(stats) & 0o7777).toString(8).padStart(4, "0");
}

function assertOwnerAndMode(path, stats, {
  expectedUid,
  expectedGid,
  allowSymlinkMode = false,
} = {}) {
  if (stats.uid !== expectedUid || stats.gid !== expectedGid) {
    fail(`${path} owner is ${stats.uid}:${stats.gid}, expected ${expectedUid}:${expectedGid}`);
  }
  // Linux symlink permission bits are always reported as 0777 and are not
  // used for access decisions. The owner and the sealed parent directory are
  // the meaningful controls for a symlink.
  if (!(allowSymlinkMode && stats.isSymbolicLink()) && (modeBits(stats) & 0o022) !== 0) {
    fail(`${path} mode ${describeMode(stats)} permits group/other writes`);
  }
}

function pathComponents(chainStart, target) {
  if (!isWithin(chainStart, target)) fail(`${target} escapes trusted chain root ${chainStart}`);
  const suffix = relative(chainStart, target);
  if (!suffix) return [chainStart];
  const components = [chainStart];
  let current = chainStart;
  for (const part of suffix.split(sep)) {
    current = join(current, part);
    components.push(current);
  }
  return components;
}

export async function assertTrustedPathChain(targetPath, {
  expectedUid = 0,
  expectedGid = 0,
  chainStart = "/",
} = {}) {
  const target = assertSafeAbsolutePath(resolve(targetPath), "trusted path");
  const start = assertSafeAbsolutePath(resolve(chainStart), "trusted chain root");
  for (const path of pathComponents(start, target)) {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) fail(`${path} is a symlink in the trusted path chain`);
    if (!stats.isDirectory()) fail(`${path} is not a directory in the trusted path chain`);
    assertOwnerAndMode(path, stats, { expectedUid, expectedGid });
  }
  const canonical = await realpath(target);
  if (canonical !== target) fail(`${target} does not resolve to itself`);
  return target;
}

async function assertRegularSealedFile(path, options) {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${path} is not a regular sealed file`);
  assertOwnerAndMode(path, stats, options);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

async function fileSha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function verifyInstalledHelperBundle({
  installedRoot = ROOT_HELPER_INSTALL_ROOT,
  activeBundlePath = join(installedRoot, "active-bundle"),
  expectedUid = 0,
  expectedGid = 0,
} = {}) {
  await assertTrustedPathChain(installedRoot, { expectedUid, expectedGid, chainStart: dirname(installedRoot) });
  await assertTrustedPathChain(join(installedRoot, "bundles"), { expectedUid, expectedGid, chainStart: dirname(installedRoot) });
  const activeStats = await lstat(activeBundlePath);
  if (!activeStats.isSymbolicLink()) fail("active helper bundle pointer is not a symlink");
  assertOwnerAndMode(activeBundlePath, activeStats, {
    expectedUid,
    expectedGid,
    allowSymlinkMode: true,
  });
  const activeTarget = await readlink(activeBundlePath);
  if (!/^bundles\/[a-f0-9]{64}$/.test(activeTarget)) {
    fail("active helper bundle pointer target is invalid");
  }
  const bundleRoot = join(installedRoot, activeTarget);
  if (await realpath(activeBundlePath) !== bundleRoot) {
    fail("active helper bundle pointer is non-canonical");
  }
  await assertTrustedPathChain(bundleRoot, { expectedUid, expectedGid, chainStart: dirname(installedRoot) });
  const manifestPath = join(bundleRoot, "helper-bundle.manifest.json");
  const entries = (await readdir(bundleRoot)).sort();
  const expectedEntries = [...ROOT_HELPER_BUNDLE_FILES, "helper-bundle.manifest.json"].sort();
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    fail("installed helper bundle membership is invalid");
  }
  await assertRegularSealedFile(manifestPath, { expectedUid, expectedGid });
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch { fail("installed helper bundle manifest is not valid JSON"); }
  if (manifest?.schemaVersion !== 1
    || !/^[a-f0-9]{64}$/.test(String(manifest?.bundleId || ""))
    || !exactObjectKeys(manifest?.files, ROOT_HELPER_BUNDLE_FILES)) {
    fail("installed helper bundle manifest schema is invalid");
  }
  if (bundleRoot !== join(installedRoot, "bundles", manifest.bundleId)) {
    fail("active helper bundle pointer and manifest identities differ");
  }
  const bundleIdentity = createHash("sha256").update(ROOT_HELPER_BUNDLE_FILES
    .map((name) => `${name} ${manifest.files[name]}\n`)
    .join(""))
    .digest("hex");
  if (bundleIdentity !== manifest.bundleId) fail("installed helper bundle identity is invalid");
  for (const name of ROOT_HELPER_BUNDLE_FILES) {
    const expected = manifest.files[name];
    if (!isSha256(expected)) fail(`installed helper bundle digest is invalid: ${name}`);
    const bundlePath = join(bundleRoot, name);
    await assertRegularSealedFile(bundlePath, { expectedUid, expectedGid });
    if (await fileSha256(bundlePath) !== expected) {
      fail(`installed helper bundle digest mismatch: ${name}`);
    }
  }
  return manifest;
}

function exactObjectKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export async function verifyReleaseTrustAttestation({
  releasePath,
  releaseId,
  expectedUid = 0,
  expectedGid = 0,
} = {}) {
  const id = assertSafeReleaseId(releaseId);
  const root = assertSafeAbsolutePath(resolve(releasePath), "attested release");
  const attestationPath = join(root, ROOT_RELEASE_TRUST_ATTESTATION);
  const manifestPath = join(root, "release-manifest.json");
  await assertRegularSealedFile(attestationPath, { expectedUid, expectedGid });
  await assertRegularSealedFile(manifestPath, { expectedUid, expectedGid });

  let attestation;
  let manifest;
  try {
    attestation = JSON.parse(await readFile(attestationPath, "utf8"));
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("release trust attestation or manifest is not valid JSON");
  }
  const keys = [
    "schemaVersion",
    "releaseId",
    "gitCommit",
    "sourceTreeSha256",
    "distTreeSha256",
    "packageLockSha256",
    "runtimePolicySha256",
    "bootstrapSha256",
    "bootstrapGzipSha256",
    "bootstrapBrotliSha256",
    "method",
    "installedBy",
  ];
  if (!exactObjectKeys(attestation, keys)) fail("release trust attestation has an unexpected schema");
  if (attestation.schemaVersion !== 1
    || attestation.releaseId !== id
    || !ROOT_RELEASE_TRUST_METHODS.has(attestation.method)
    || attestation.installedBy !== ROOT_RELEASE_TRUST_INSTALLER
    || !/^[a-f0-9]{40,64}$/i.test(String(attestation.gitCommit || ""))) {
    fail("release trust attestation identity is invalid");
  }
  for (const key of [
    "sourceTreeSha256",
    "distTreeSha256",
    "packageLockSha256",
    "runtimePolicySha256",
    "bootstrapSha256",
    "bootstrapGzipSha256",
    "bootstrapBrotliSha256",
  ]) {
    if (!isSha256(attestation[key])) fail(`release trust attestation ${key} is invalid`);
  }
  const bootstrap = (Array.isArray(manifest?.compatibilityArtifacts) ? manifest.compatibilityArtifacts : [])
    .find((artifact) => artifact?.id === "bootstrap-snapshot");
  const generatedPaths = bootstrap?.generatedPaths;
  if (!Array.isArray(generatedPaths) || generatedPaths.length !== ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS.length) {
    fail("sealed manifest must bind exactly the gzip and Brotli bootstrap sidecars");
  }
  for (const [index, expectedPath] of ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS.entries()) {
    const generated = generatedPaths[index];
    if (!exactObjectKeys(generated, ["path", "sha256"])
      || generated.path !== expectedPath
      || !isSha256(generated.sha256)) {
      fail(`sealed manifest bootstrap sidecar ${index} is not the exact trusted ${expectedPath} contract`);
    }
  }
  const manifestContract = {
    releaseId: manifest?.releaseId,
    gitCommit: manifest?.gitCommit,
    sourceTreeSha256: manifest?.sourceTreeSha256,
    distTreeSha256: manifest?.distTreeSha256,
    packageLockSha256: manifest?.packageLockSha256,
    runtimePolicySha256: manifest?.runtimePolicy?.sha256,
    bootstrapSha256: bootstrap?.sha256,
    bootstrapGzipSha256: generatedPaths[0].sha256,
    bootstrapBrotliSha256: generatedPaths[1].sha256,
  };
  for (const [key, value] of Object.entries(manifestContract)) {
    if (attestation[key] !== value) fail(`release trust attestation ${key} differs from the sealed manifest`);
  }
  return { path: attestationPath, ...attestation };
}

export async function assertSealedTree(treePath, {
  expectedUid = 0,
  expectedGid = 0,
  chainStart = "/",
  allowInternalSymlinks = true,
  allowedSymlinkRoots = null,
} = {}) {
  const tree = assertSafeAbsolutePath(resolve(treePath), "sealed tree");
  await assertTrustedPathChain(dirname(tree), { expectedUid, expectedGid, chainStart });
  const treeStats = await lstat(tree);
  if (!treeStats.isDirectory() || treeStats.isSymbolicLink()) {
    fail(`${tree} is not a real directory`);
  }
  assertOwnerAndMode(tree, treeStats, { expectedUid, expectedGid });
  if (await realpath(tree) !== tree) fail(`${tree} does not resolve to itself`);

  const pending = [tree];
  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      const stats = await lstat(path);
      assertOwnerAndMode(path, stats, {
        expectedUid,
        expectedGid,
        allowSymlinkMode: true,
      });
      if (stats.isSymbolicLink()) {
        if (!allowInternalSymlinks) fail(`${path} is a forbidden symlink`);
        const permittedRoot = Array.isArray(allowedSymlinkRoots)
          ? allowedSymlinkRoots.find((root) => isWithin(root, path) && path !== root)
          : tree;
        if (!permittedRoot) fail(`${path} is outside the permitted symlink subtree`);
        const rawTarget = await readlink(path);
        const lexicalTarget = resolve(dirname(path), rawTarget);
        if (!isWithin(permittedRoot, lexicalTarget)) {
          fail(`${path} symlink target escapes its permitted sealed subtree`);
        }
        let canonicalTarget;
        try {
          canonicalTarget = await realpath(path);
        } catch {
          fail(`${path} is a dangling or cyclic symlink`);
        }
        if (!isWithin(permittedRoot, canonicalTarget)) {
          fail(`${path} resolves outside its permitted sealed subtree`);
        }
      } else if (stats.isDirectory()) {
        pending.push(path);
      } else if (!stats.isFile()) {
        fail(`${path} is an unsupported special filesystem node`);
      }
    }
  }
  return tree;
}

export async function verifyReleaseRootSeal({
  releasesRoot,
  releaseId,
  appPath,
  expectedUid = 0,
  expectedGid = 0,
  chainStart = "/",
  requireOriginAttestation = true,
} = {}) {
  const root = assertSafeAbsolutePath(resolve(releasesRoot), "release store");
  const id = assertSafeReleaseId(releaseId);
  const releasePath = join(root, id);
  const expectedApp = join(releasePath, "app");
  const app = assertSafeAbsolutePath(resolve(appPath), "release app");
  if (app !== expectedApp || dirname(releasePath) !== root) {
    fail("release app is not the exact direct child selected by release id");
  }
  await assertTrustedPathChain(root, { expectedUid, expectedGid, chainStart });
  await assertSealedTree(releasePath, {
    expectedUid,
    expectedGid,
    chainStart: root,
    allowInternalSymlinks: true,
    // npm creates root-owned .bin links after `npm ci`. No tracked runtime,
    // dist, manifest or operations path is allowed to use a symlink.
    allowedSymlinkRoots: [join(app, "node_modules")],
  });
  const manifestPath = join(releasePath, "release-manifest.json");
  const verifierPath = join(app, "scripts", "release-verify.mjs");
  await assertRegularSealedFile(manifestPath, { expectedUid, expectedGid });
  await assertRegularSealedFile(verifierPath, { expectedUid, expectedGid });
  const appStats = await lstat(app);
  if (!appStats.isDirectory() || appStats.isSymbolicLink()) fail(`${app} is not a real app directory`);
  const trustAttestation = requireOriginAttestation
    ? await verifyReleaseTrustAttestation({
      releasePath,
      releaseId: id,
      expectedUid,
      expectedGid,
    })
    : null;
  return { releasePath, appPath: app, manifestPath, verifierPath, trustAttestation };
}

export async function verifySealedPointer({
  pointerPath,
  expectedTarget,
  expectedUid = 0,
  expectedGid = 0,
  chainStart = "/",
} = {}) {
  const pointer = assertSafeAbsolutePath(resolve(pointerPath), "release pointer");
  const target = assertSafeAbsolutePath(resolve(expectedTarget), "expected pointer target");
  await assertTrustedPathChain(dirname(pointer), { expectedUid, expectedGid, chainStart });
  const stats = await lstat(pointer);
  if (!stats.isSymbolicLink()) fail(`${pointer} is not a symbolic link`);
  assertOwnerAndMode(pointer, stats, { expectedUid, expectedGid, allowSymlinkMode: true });
  const canonicalTarget = await realpath(pointer);
  if (canonicalTarget !== target) fail(`${pointer} resolves to ${canonicalTarget}, expected ${target}`);
  return pointer;
}

export async function verifySealedArtifact({
  trustedRoot,
  artifactPath,
  expectedUid = 0,
  expectedGid = 0,
  chainStart = "/",
} = {}) {
  const root = assertSafeAbsolutePath(resolve(trustedRoot), "trusted artifact root");
  const artifact = assertSafeAbsolutePath(resolve(artifactPath), "trusted artifact");
  if (!isWithin(root, artifact) || artifact === root) fail(`${artifact} is outside trusted root ${root}`);
  await assertTrustedPathChain(root, { expectedUid, expectedGid, chainStart });
  await assertTrustedPathChain(dirname(artifact), { expectedUid, expectedGid, chainStart: root });
  await assertRegularSealedFile(artifact, { expectedUid, expectedGid });
  return artifact;
}

function parseCli(argv) {
  const [mode, ...values] = argv;
  const options = Object.fromEntries(values.map((value) => {
    if (!value.startsWith("--") || !value.includes("=")) fail(`unknown argument ${value}`);
    const [key, ...parts] = value.slice(2).split("=");
    return [key, parts.join("=")];
  }));
  return { mode, options };
}

async function assertInstalledHelperTrust() {
  const invokedPath = await realpath(process.argv[1]);
  const expectedPath = await realpath(ROOT_SEAL_HELPER_PATH);
  if (invokedPath !== expectedPath) {
    fail(`production CLI must run the fixed trusted helper ${ROOT_SEAL_HELPER_PATH}`);
  }
  await verifyInstalledHelperBundle();
}

async function main() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) fail("production CLI must run as root");
  await assertInstalledHelperTrust();
  const { mode, options } = parseCli(process.argv.slice(2));
  if (mode === "bundle") {
    await verifyInstalledHelperBundle();
  } else if (mode === "release") {
    await verifyReleaseRootSeal({
      releasesRoot: options["releases-root"],
      releaseId: options["release-id"],
      appPath: options.app,
      requireOriginAttestation: true,
    });
  } else if (mode === "pointer") {
    await verifySealedPointer({
      pointerPath: options.pointer,
      expectedTarget: options["expected-target"],
    });
  } else if (mode === "tree") {
    await assertSealedTree(options.tree, { chainStart: "/" });
  } else if (mode === "artifact") {
    await verifySealedArtifact({
      trustedRoot: options["trusted-root"],
      artifactPath: options.artifact,
    });
  } else {
    fail("mode must be bundle, release, pointer, tree or artifact");
  }
  process.stdout.write("ROOT_SEAL_OK\n");
}

const invokedAsCli = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsCli) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
