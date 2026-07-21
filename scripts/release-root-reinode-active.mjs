#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  lchown,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROOT_RELEASE_TRUST_ATTESTATION as FIXED_ROOT_RELEASE_TRUST_ATTESTATION,
  ROOT_SEAL_HELPER_PATH,
  assertTrustedPathChain,
  verifyReleaseRootSeal,
  verifySealedArtifact,
  verifySealedPointer,
} from "./release-root-seal-verify.mjs";

export const ROOT_REINODE_HELPER_PATH = "/usr/local/libexec/mes/active-bundle/release-root-reinode-active.mjs";
export const ROOT_RELEASE_AUTHORITY_WRAPPER = "/usr/local/libexec/mes/active-bundle/with-pilot-release-authority-lock.sh";
export const ROOT_RELEASE_APP_VERIFICATION_INTENT = "/run/lock/mes/mes-release-app-verification.intent";
export const PILOT_ROOT = "/srv/mes/pilot";
export const PILOT_RELEASES_ROOT = `${PILOT_ROOT}/releases`;
export const PILOT_APP_POINTER = `${PILOT_ROOT}/app`;
export const PILOT_ACTIVE_RECORD = `${PILOT_RELEASES_ROOT}/active-release.json`;
export const PILOT_SERVICE = "mes-pilot.service";
export const PILOT_PORT = 4175;
export const PILOT_PUBLIC_HEALTH_URL = "https://pilot.mes-line.ru/healthz";
export const ACTIVE_REINODE_CONFIRMATION = "REINODE_ACTIVE_PILOT_RELEASE";
export const INACTIVE_REINODE_CONFIRMATION = "REINODE_INACTIVE_PILOT_RELEASE";
export const VERIFY_STAGED_CONFIRMATION = "VERIFY_ROOT_STAGED_RELEASE";
export const RECOVER_REINODE_CONFIRMATION = "RECOVER_PILOT_REINODE_TRANSACTION";
export const PILOT_REINODE_TRANSACTION_ROOT = `${PILOT_ROOT}/reinode-transactions`;
export const ROOT_RELEASE_TRUST_ATTESTATION = FIXED_ROOT_RELEASE_TRUST_ATTESTATION;

const TRUSTED_BIN = Object.freeze({
  chown: "/usr/bin/chown",
  curl: "/usr/bin/curl",
  find: "/usr/bin/find",
  npm: "/usr/bin/npm",
  runuser: "/usr/sbin/runuser",
  systemctl: "/usr/bin/systemctl",
});
const TRUSTED_CHILD_ENV = Object.freeze({
  PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: "/root",
  LANG: "C.UTF-8",
});

const EXPECTED_RUNTIME_INCLUDES = Object.freeze([
  "src",
  "styles",
  "scripts",
  "assets",
  "ops",
  "db",
  "app-version.json",
  "index.html",
  "styles.css",
  "favicon.svg",
  "server.js",
  "package.json",
  "package-lock.json",
  "react-runtime-policy.json",
  "mes-planning-prototype.png",
  "vercel.json",
]);
const EXPECTED_BOOTSTRAP_GENERATED_PATHS = Object.freeze([
  "dist/bootstrap-snapshot.json.gz",
  "dist/bootstrap-snapshot.json.br",
]);

function fail(message) {
  throw new Error(`Pilot active release re-inode failed: ${message}`);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function parseArgs(argv) {
  const values = {};
  for (const arg of argv) {
    if (!arg.startsWith("--") || !arg.includes("=")) fail(`unknown argument: ${arg}`);
    const [key, ...parts] = arg.slice(2).split("=");
    if (Object.hasOwn(values, key)) fail(`duplicate argument: --${key}`);
    values[key] = parts.join("=");
  }
  const mode = String(values.mode || "");
  const allowedKeys = new Set(mode === "recover"
    ? ["mode", "transaction-id", "prestart", "confirm"]
    : [
      "mode", "release-id", "expected-git-commit", "expected-source-sha256",
      "expected-dist-sha256", "expected-package-lock-sha256",
      "expected-runtime-policy-sha256", "expected-bootstrap-sha256",
      "expected-bootstrap-gzip-sha256", "expected-bootstrap-brotli-sha256",
      "expected-previous-release-id", "expected-legacy-release-id", "confirm",
    ]);
  for (const key of Object.keys(values)) {
    if (!allowedKeys.has(key)) fail(`unknown argument: --${key}`);
  }
  const result = {
    mode,
    transactionId: String(values["transaction-id"] || ""),
    releaseId: String(values["release-id"] || ""),
    expectedGitCommit: String(values["expected-git-commit"] || ""),
    expectedSourceSha256: String(values["expected-source-sha256"] || ""),
    expectedDistSha256: String(values["expected-dist-sha256"] || ""),
    expectedPackageLockSha256: String(values["expected-package-lock-sha256"] || ""),
    expectedRuntimePolicySha256: String(values["expected-runtime-policy-sha256"] || ""),
    expectedBootstrapSha256: String(values["expected-bootstrap-sha256"] || ""),
    expectedBootstrapGzipSha256: String(values["expected-bootstrap-gzip-sha256"] || ""),
    expectedBootstrapBrotliSha256: String(values["expected-bootstrap-brotli-sha256"] || ""),
    expectedPreviousReleaseId: String(values["expected-previous-release-id"] || ""),
    expectedLegacyReleaseId: String(values["expected-legacy-release-id"] || ""),
    confirmation: String(values.confirm || ""),
    prestart: String(values.prestart || "false") === "true",
  };
  if (!["active", "inactive", "verify", "recover"].includes(result.mode)) {
    fail("--mode=active|inactive|verify|recover is required");
  }
  if (result.mode === "recover") {
    if (values.prestart && !["true", "false"].includes(String(values.prestart))) fail("prestart must be true or false");
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(result.transactionId)) fail("transaction id is unsafe");
    if (result.confirmation !== RECOVER_REINODE_CONFIRMATION) {
      fail(`--confirm=${RECOVER_REINODE_CONFIRMATION} is required`);
    }
    return result;
  }
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(result.releaseId)) fail("release id is unsafe");
  if (!/^[a-f0-9]{40,64}$/i.test(result.expectedGitCommit)) fail("expected Git commit is invalid");
  for (const [label, value] of Object.entries({
    source: result.expectedSourceSha256,
    dist: result.expectedDistSha256,
    packageLock: result.expectedPackageLockSha256,
    runtimePolicy: result.expectedRuntimePolicySha256,
    bootstrap: result.expectedBootstrapSha256,
    bootstrapGzip: result.expectedBootstrapGzipSha256,
    bootstrapBrotli: result.expectedBootstrapBrotliSha256,
  })) {
    if (!isSha256(value)) fail(`expected ${label} SHA-256 is invalid`);
  }
  const expectedConfirmation = result.mode === "active"
    ? ACTIVE_REINODE_CONFIRMATION
    : result.mode === "inactive"
      ? INACTIVE_REINODE_CONFIRMATION
      : VERIFY_STAGED_CONFIRMATION;
  if (result.confirmation !== expectedConfirmation) fail(`--confirm=${expectedConfirmation} is required`);
  if (result.mode === "active") {
    for (const [label, releaseId] of [
      ["previous", result.expectedPreviousReleaseId],
      ["legacy", result.expectedLegacyReleaseId],
    ]) {
      if (!/^[A-Za-z0-9._-]{1,96}$/.test(releaseId)) {
        fail(`--expected-${label}-release-id is required and must be safe in active mode`);
      }
      if (releaseId === result.releaseId) fail(`expected ${label} release must differ from the active release`);
    }
  } else if (result.expectedPreviousReleaseId || result.expectedLegacyReleaseId) {
    fail(`${result.mode} mode does not accept previous/legacy release identities`);
  }
  return result;
}

function normalizedRelativePath(path) {
  return String(path).split(sep).join("/").replace(/^\.\//, "");
}

function isExcluded(path, excludes) {
  const normalized = normalizedRelativePath(path);
  return excludes.some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}

async function collectDigestFiles(root, relativePath, files, excludes) {
  if (isExcluded(relativePath, excludes)) return;
  const absolutePath = resolve(root, relativePath);
  const metadata = await lstat(absolutePath);
  if (metadata.isSymbolicLink()) fail(`symlink is forbidden in release digest: ${relativePath}`);
  if (metadata.isDirectory()) {
    const entries = await readdir(absolutePath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await collectDigestFiles(root, `${relativePath}/${entry.name}`, files, excludes);
    }
    return;
  }
  if (!metadata.isFile()) fail(`unsupported release digest entry: ${relativePath}`);
  files.push({ absolutePath, relativePath: normalizedRelativePath(relativePath) });
}

export async function computeTrustedTreeSha({ root, includes, excludes = [] }) {
  const files = [];
  const normalizedExcludes = excludes.map(normalizedRelativePath);
  for (const include of includes) await collectDigestFiles(root, include, files, normalizedExcludes);
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

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function exactStringArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export async function verifyOutOfBandReleaseAnchors({ releasePath, anchors }) {
  const appPath = join(releasePath, "app");
  const manifestPath = join(releasePath, "release-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.releaseId !== anchors.releaseId) fail("manifest release id does not match the explicit anchor");
  if (manifest.gitCommit !== anchors.expectedGitCommit) fail("manifest Git commit does not match the explicit anchor");
  if (!exactStringArray(manifest.runtimeIncludes, EXPECTED_RUNTIME_INCLUDES)) {
    fail("manifest runtime include allowlist differs from the trusted release contract");
  }
  if (manifest.sourceTreeSha256 !== anchors.expectedSourceSha256) fail("manifest source digest differs from the explicit anchor");
  if (manifest.distTreeSha256 !== anchors.expectedDistSha256) fail("manifest dist digest differs from the explicit anchor");
  if (manifest.packageLockSha256 !== anchors.expectedPackageLockSha256) fail("manifest package-lock digest differs from the explicit anchor");
  if (manifest.runtimePolicy?.path !== "react-runtime-policy.json"
    || manifest.runtimePolicy.sha256 !== anchors.expectedRuntimePolicySha256) {
    fail("manifest runtime policy differs from the explicit anchor");
  }

  const bootstrap = (Array.isArray(manifest.compatibilityArtifacts) ? manifest.compatibilityArtifacts : [])
    .find((artifact) => artifact?.id === "bootstrap-snapshot");
  if (!bootstrap || bootstrap.sha256 !== anchors.expectedBootstrapSha256) {
    fail("manifest bootstrap snapshot differs from the explicit anchor");
  }
  const requiredBootstrapPaths = ["bootstrap-snapshot.json", "dist/bootstrap-snapshot.json"];
  if (!exactStringArray(bootstrap.stagedPaths, requiredBootstrapPaths)) {
    fail("manifest bootstrap staged paths differ from the trusted contract");
  }
  for (const path of requiredBootstrapPaths) {
    if (await sha256(join(appPath, path)) !== anchors.expectedBootstrapSha256) {
      fail(`bootstrap snapshot bytes differ from the explicit anchor at ${path}`);
    }
  }
  if (await sha256(join(appPath, "package-lock.json")) !== anchors.expectedPackageLockSha256) {
    fail("package-lock bytes differ from the explicit anchor");
  }
  if (await sha256(join(appPath, "react-runtime-policy.json")) !== anchors.expectedRuntimePolicySha256) {
    fail("runtime policy bytes differ from the explicit anchor");
  }

  const expectedGenerated = [
    { path: EXPECTED_BOOTSTRAP_GENERATED_PATHS[0], sha256: anchors.expectedBootstrapGzipSha256 },
    { path: EXPECTED_BOOTSTRAP_GENERATED_PATHS[1], sha256: anchors.expectedBootstrapBrotliSha256 },
  ];
  const generatedPaths = Array.isArray(bootstrap.generatedPaths) ? bootstrap.generatedPaths : [];
  if (generatedPaths.length !== expectedGenerated.length) {
    fail("manifest generated bootstrap artifact set differs from the explicit anchors");
  }
  for (const [index, expected] of expectedGenerated.entries()) {
    const generated = generatedPaths[index];
    if (generated?.path !== expected.path || generated?.sha256 !== expected.sha256) {
      fail(`generated bootstrap artifact identity differs from the explicit anchor at ${expected.path}`);
    }
    if (await sha256(join(appPath, expected.path)) !== expected.sha256) {
      fail(`generated bootstrap artifact digest mismatch at ${expected.path}`);
    }
  }

  const sourceSha256 = await computeTrustedTreeSha({ root: appPath, includes: EXPECTED_RUNTIME_INCLUDES });
  const distSha256 = await computeTrustedTreeSha({
    root: appPath,
    includes: ["dist"],
    excludes: ["dist/bootstrap-snapshot.json", ...EXPECTED_BOOTSTRAP_GENERATED_PATHS],
  });
  if (sourceSha256 !== anchors.expectedSourceSha256) fail("copied source tree differs from the explicit anchor");
  if (distSha256 !== anchors.expectedDistSha256) fail("copied dist tree differs from the explicit anchor");
  return { manifest, appPath, manifestPath, sourceSha256, distSha256 };
}

function assertReleasePointerRecord(value, label) {
  if (value === null && label === "previous") return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} release pointer is invalid`);
  if (value.kind !== "release-pointer" || !/^[A-Za-z0-9._-]{1,96}$/.test(String(value.releaseId || ""))) {
    fail(`${label} release pointer identity is invalid`);
  }
  const expectedTarget = join(PILOT_RELEASES_ROOT, value.releaseId, "app");
  if (value.target !== expectedTarget || value.legacyPath !== null) fail(`${label} release pointer target is non-canonical`);
  const normalized = {
    ...(label === "legacyBaseline" ? { schemaVersion: 1 } : {}),
    kind: "release-pointer",
    releaseId: value.releaseId,
    target: expectedTarget,
    legacyPath: null,
  };
  if (label === "legacyBaseline") {
    if (!/^\d{8}T\d{6}Z-\d+$/.test(String(value.pinnedAt || ""))) fail("legacy baseline pin timestamp is invalid");
    normalized.pinnedAt = value.pinnedAt;
    if (!value.manifest || !/^[a-f0-9]{40,64}$/i.test(String(value.manifest.gitCommit || ""))) {
      fail("legacy baseline manifest identity is invalid");
    }
    for (const key of ["sourceTreeSha256", "distTreeSha256", "runtimePolicySha256"]) {
      if (!isSha256(value.manifest[key])) fail(`legacy baseline ${key} is invalid`);
    }
    normalized.manifest = {
      gitCommit: value.manifest.gitCommit,
      appVersion: String(value.manifest.appVersion || ""),
      sourceTreeSha256: value.manifest.sourceTreeSha256,
      distTreeSha256: value.manifest.distTreeSha256,
      runtimePolicySha256: value.manifest.runtimePolicySha256,
    };
  }
  if (value.runtimePolicy) {
    if (value.runtimePolicy.schemaVersion !== 1
      || typeof value.runtimePolicy.policyId !== "string"
      || !isSha256(value.runtimePolicy.sha256)
      || !Array.isArray(value.runtimePolicy.reactSurfaces)
      || value.runtimePolicy.reactSurfaces.some((surface) => typeof surface !== "string")) {
      fail(`${label} runtime policy record is invalid`);
    }
    normalized.runtimePolicy = {
      schemaVersion: 1,
      policyId: value.runtimePolicy.policyId,
      sha256: value.runtimePolicy.sha256,
      reactSurfaces: [...value.runtimePolicy.reactSurfaces],
    };
  }
  return normalized;
}

export async function buildTrustedActiveRecord({
  currentRecord,
  verifiedRelease,
  anchors,
  expectedPreviousReleaseId,
  expectedLegacyReleaseId,
}) {
  if (!currentRecord || currentRecord.schemaVersion !== 2 || currentRecord.releaseId !== anchors.releaseId) {
    fail("active release record does not select the explicitly anchored release");
  }
  if (!/^\d{8}T\d{6}Z-\d+$/.test(String(currentRecord.activatedAt || ""))) {
    fail("active release timestamp is invalid");
  }
  if (currentRecord.previous?.releaseId !== expectedPreviousReleaseId) {
    fail("active record previous release differs from the explicit operator anchor");
  }
  if (currentRecord.legacyBaseline?.releaseId !== expectedLegacyReleaseId) {
    fail("active record legacy baseline differs from the explicit operator anchor");
  }
  const runtimePolicySource = JSON.parse(await readFile(join(verifiedRelease.appPath, "react-runtime-policy.json"), "utf8"));
  if (runtimePolicySource.schemaVersion !== 1 || typeof runtimePolicySource.policyId !== "string") {
    fail("anchored runtime policy identity is invalid");
  }
  const reactSurfaces = Object.entries(runtimePolicySource.surfaces || {})
    .filter(([, mode]) => mode === "react")
    .map(([surface]) => surface);
  const manifest = verifiedRelease.manifest;
  return {
    schemaVersion: 2,
    releaseId: anchors.releaseId,
    activatedAt: currentRecord.activatedAt,
    previous: assertReleasePointerRecord(currentRecord.previous, "previous"),
    legacyBaseline: assertReleasePointerRecord(currentRecord.legacyBaseline, "legacyBaseline"),
    runtimePolicy: {
      schemaVersion: 1,
      policyId: runtimePolicySource.policyId,
      sha256: anchors.expectedRuntimePolicySha256,
      reactSurfaces,
    },
    manifest: {
      gitCommit: anchors.expectedGitCommit,
      appVersion: manifest.appVersion,
      sourceTreeSha256: anchors.expectedSourceSha256,
      distTreeSha256: anchors.expectedDistSha256,
      runtimePolicySha256: anchors.expectedRuntimePolicySha256,
    },
    health: { local: "ok", public: "ok" },
  };
}

function buildReinodeAttestation(anchors) {
  return {
    schemaVersion: 1,
    releaseId: anchors.releaseId,
    gitCommit: anchors.expectedGitCommit,
    sourceTreeSha256: anchors.expectedSourceSha256,
    distTreeSha256: anchors.expectedDistSha256,
    packageLockSha256: anchors.expectedPackageLockSha256,
    runtimePolicySha256: anchors.expectedRuntimePolicySha256,
    bootstrapSha256: anchors.expectedBootstrapSha256,
    bootstrapGzipSha256: anchors.expectedBootstrapGzipSha256,
    bootstrapBrotliSha256: anchors.expectedBootstrapBrotliSha256,
    method: "root-reinode-copy",
    installedBy: "root-ssh-clean-published-commit-new-inodes",
  };
}

async function writeReinodeAttestation(releasePath, anchors) {
  const path = join(releasePath, ROOT_RELEASE_TRUST_ATTESTATION);
  await writeFile(path, `${JSON.stringify(buildReinodeAttestation(anchors), null, 2)}\n`, { mode: 0o444, flag: "wx" });
  await chmod(path, 0o444);
  return path;
}

export async function copyAnchoredAppPayload({ sourceAppPath, targetAppPath }) {
  await mkdir(targetAppPath, { mode: 0o700 });
  for (const relativePath of EXPECTED_RUNTIME_INCLUDES) {
    await cp(join(sourceAppPath, relativePath), join(targetAppPath, relativePath), {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
  }
  // dist has its own full-tree digest (with only explicitly hashed bootstrap
  // compatibility artifacts excluded), while the root bootstrap copy is
  // independently SHA-256 anchored by the operator.
  for (const relativePath of ["dist", "bootstrap-snapshot.json"]) {
    await cp(join(sourceAppPath, relativePath), join(targetAppPath, relativePath), {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
  }
}

async function verifyPriorReinodeAttestation(pointerRecord, label) {
  if (!pointerRecord) return;
  const releasePath = join(PILOT_RELEASES_ROOT, pointerRecord.releaseId);
  const appPath = join(releasePath, "app");
  await verifyReleaseRootSeal({
    releasesRoot: PILOT_RELEASES_ROOT,
    releaseId: pointerRecord.releaseId,
    appPath,
    requireOriginAttestation: true,
  });
  const attestationPath = join(releasePath, ROOT_RELEASE_TRUST_ATTESTATION);
  await verifySealedArtifact({ trustedRoot: releasePath, artifactPath: attestationPath });
  const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
  if (attestation.schemaVersion !== 1
    || attestation.releaseId !== pointerRecord.releaseId
    || attestation.method !== "root-reinode-copy"
    || attestation.installedBy !== "root-ssh-clean-published-commit-new-inodes") {
    fail(`${label} root re-inode attestation is invalid`);
  }
  for (const key of [
    "sourceTreeSha256",
    "distTreeSha256",
    "packageLockSha256",
    "runtimePolicySha256",
    "bootstrapSha256",
  ]) {
    if (!isSha256(attestation[key])) fail(`${label} attestation ${key} is invalid`);
  }
  if (!/^[a-f0-9]{40,64}$/i.test(String(attestation.gitCommit || ""))) {
    fail(`${label} attestation Git commit is invalid`);
  }
  if (pointerRecord.runtimePolicy?.sha256
    && pointerRecord.runtimePolicy.sha256 !== attestation.runtimePolicySha256) {
    fail(`${label} runtime policy differs from its root re-inode attestation`);
  }
  if (label === "legacyBaseline") {
    for (const [recordKey, attestationKey] of [
      ["gitCommit", "gitCommit"],
      ["sourceTreeSha256", "sourceTreeSha256"],
      ["distTreeSha256", "distTreeSha256"],
      ["runtimePolicySha256", "runtimePolicySha256"],
    ]) {
      if (pointerRecord.manifest?.[recordKey] !== attestation[attestationKey]) {
        fail(`legacy baseline ${recordKey} differs from its root re-inode attestation`);
      }
    }
  }
}

function run(command, args, { cwd = "/", env = TRUSTED_CHILD_ENV, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    fail(`${command} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

async function assertFixedHelpersTrusted() {
  const invokedPath = await realpath(process.argv[1]);
  if (invokedPath !== await realpath(ROOT_REINODE_HELPER_PATH)) fail(`helper must execute from ${ROOT_REINODE_HELPER_PATH}`);
  run("/usr/bin/node", [ROOT_SEAL_HELPER_PATH, "bundle"]);
}

export function fdInfoProvesCanonicalFlock({ fdInfo, ownerPid, inode }) {
  const lockLines = String(fdInfo || "").split(/\r?\n/).filter((line) => /^\s*lock:\s/.test(line));
  if (lockLines.length !== 1) return false;
  const fields = lockLines[0].trim().split(/\s+/);
  if (fields[0] !== "lock:"
    || fields[2] !== "FLOCK"
    || fields[4] !== "WRITE"
    || fields[5] !== String(ownerPid)) return false;
  const deviceAndInode = fields[6] || "";
  const separator = deviceAndInode.lastIndexOf(":");
  if (separator < 0) return false;
  try {
    return BigInt(deviceAndInode.slice(separator + 1)) === BigInt(inode);
  } catch {
    return false;
  }
}

async function assertAuthorityLockInherited() {
  if (process.env.MES_RELEASE_AUTHORITY_LOCK_HELD !== "1"
    || process.env.MES_RELEASE_AUTHORITY_LOCK_FD !== "9") {
    fail("canonical release authority lock on fd9 is required");
  }
  const lockPath = "/run/lock/mes/mes-authority-rollout.lock";
  const [lockMetadata, fdMetadata, fdInfo] = await Promise.all([
    lstat(lockPath, { bigint: true }),
    stat("/proc/self/fd/9", { bigint: true }),
    readFile("/proc/self/fdinfo/9", "utf8"),
  ]);
  if (!lockMetadata.isFile() || lockMetadata.isSymbolicLink()
    || lockMetadata.uid !== 0n || lockMetadata.gid !== 0n
    || (lockMetadata.mode & 0o777n) !== 0o600n
    || lockMetadata.dev !== fdMetadata.dev || lockMetadata.ino !== fdMetadata.ino
    || !fdInfoProvesCanonicalFlock({ fdInfo, ownerPid: process.pid, inode: lockMetadata.ino })) {
    fail("canonical release authority flock on fd9 could not be proved");
  }
}

async function assertRootDirectory(path, mode = 0o755) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(path, { mode });
    await chmod(path, mode);
    metadata = await lstat(path);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== 0 || metadata.gid !== 0 || (metadata.mode & 0o022) !== 0) {
    fail(`unsafe root directory: ${path}`);
  }
  if (await realpath(path) !== path) fail(`non-canonical root directory: ${path}`);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForTrustedHealth(expectedVersion) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const localResponse = run(TRUSTED_BIN.curl, ["-fsS", "--max-time", "3", `http://127.0.0.1:${PILOT_PORT}/healthz`], { allowFailure: true });
    const publicResponse = run(TRUSTED_BIN.curl, ["-fsS", "--max-time", "5", PILOT_PUBLIC_HEALTH_URL], { allowFailure: true });
    if (localResponse.status === 0 && publicResponse.status === 0) {
      try {
        const localHealth = JSON.parse(localResponse.stdout);
        const publicHealth = JSON.parse(publicResponse.stdout);
        const isExpected = (health) => health.status === "ok"
          && health.sharedState === "ready"
          && health.version === expectedVersion;
        if (isExpected(localHealth) && isExpected(publicHealth)) return { ...localHealth, public: "ok" };
      } catch {
        // Retry a bounded number of times while the trusted release starts.
      }
    }
    await sleep(1000);
  }
  fail("trusted re-inoded release did not become healthy locally and publicly; rollback is required");
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncTree(path) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) await syncTree(join(path, entry.name));
    await syncDirectory(path);
    return;
  }
  if (!metadata.isFile()) fail(`cannot durably sync unsupported entry: ${path}`);
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDurableFile(path, payload, mode) {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, mode);
  await syncDirectory(dirname(path));
}

async function clearReleaseAppVerificationIntent() {
  if (!await pathExists(ROOT_RELEASE_APP_VERIFICATION_INTENT)) return;
  const metadata = await lstat(ROOT_RELEASE_APP_VERIFICATION_INTENT);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== 0 || metadata.gid !== 0
    || (metadata.mode & 0o777) !== 0o600) {
    fail("release app-verification intent is unsafe");
  }
  await rm(ROOT_RELEASE_APP_VERIFICATION_INTENT);
  await syncDirectory(dirname(ROOT_RELEASE_APP_VERIFICATION_INTENT));
}

async function writeReleaseAppVerificationIntent({ operation, expectedTarget, journalId, journalPhase }) {
  await clearReleaseAppVerificationIntent();
  const processStat = await readFile(`/proc/${process.pid}/stat`, "utf8");
  const startTicks = processStat.trim().split(/\s+/)[21];
  if (!/^[1-9][0-9]*$/.test(String(startTicks || ""))) fail("release app-verification process identity is invalid");
  const temporary = `${ROOT_RELEASE_APP_VERIFICATION_INTENT}.next.${process.pid}`;
  const payload = [
    `PID=${process.pid}`,
    `START_TICKS=${startTicks}`,
    "INTENT=release-app-verification",
    `OPERATION=${operation}`,
    `EXPECTED_TARGET=${expectedTarget}`,
    "JOURNAL_KIND=reinode",
    `JOURNAL_ID=${journalId}`,
    `JOURNAL_PHASE=${journalPhase}`,
    "",
  ].join("\n");
  await writeDurableFile(temporary, payload, 0o600);
  await durableRename(temporary, ROOT_RELEASE_APP_VERIFICATION_INTENT);
}

async function durableRename(source, target) {
  await rename(source, target);
  const sourceParent = dirname(source);
  const targetParent = dirname(target);
  await syncDirectory(sourceParent);
  if (targetParent !== sourceParent) await syncDirectory(targetParent);
}

export async function writeDurableTransactionJournal({ journalPath, journal }) {
  const parent = dirname(journalPath);
  const temporaryPath = `${journalPath}.next-${process.pid}-${process.hrtime.bigint()}`;
  const payload = `${JSON.stringify(journal, null, 2)}\n`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, journalPath);
  await syncDirectory(parent);
  return journalPath;
}

function isDirectChild(root, path) {
  return dirname(path) === root && resolve(path) === path;
}

function validateRecoveryJournal(journal, transactionId) {
  const keys = [
    "schemaVersion", "transactionId", "mode", "releaseId", "sourceReleasePath",
    "temporaryReleasePath", "quarantinePath", "failedTrustedPath", "activeRecordPath",
    "activeRecordBackup", "nextActiveRecord", "failedActiveRecord", "pointerTarget",
    "serviceWasActive", "anchors", "phase", "createdAt", "updatedAt",
  ];
  if (!journal || typeof journal !== "object" || Array.isArray(journal)
    || Object.keys(journal).sort().join("\0") !== [...keys].sort().join("\0")) {
    fail("transaction journal schema is invalid");
  }
  if (journal.schemaVersion !== 1 || journal.transactionId !== transactionId) {
    fail("transaction journal identity is invalid");
  }
  if (!["active", "inactive"].includes(journal.mode)
    || !/^[A-Za-z0-9._-]{1,96}$/.test(journal.releaseId)
    || typeof journal.serviceWasActive !== "boolean"
    || typeof journal.phase !== "string") {
    fail("transaction journal state is invalid");
  }
  const anchorKeys = [
    "releaseId", "expectedGitCommit", "expectedSourceSha256", "expectedDistSha256",
    "expectedPackageLockSha256", "expectedRuntimePolicySha256", "expectedBootstrapSha256",
    "expectedBootstrapGzipSha256", "expectedBootstrapBrotliSha256",
  ];
  if (!journal.anchors || Object.keys(journal.anchors).sort().join("\0") !== [...anchorKeys].sort().join("\0")
    || journal.anchors.releaseId !== journal.releaseId
    || !/^[a-f0-9]{40,64}$/i.test(String(journal.anchors.expectedGitCommit || ""))) {
    fail("transaction journal anchors are invalid");
  }
  for (const key of anchorKeys.filter((key) => key !== "releaseId" && key !== "expectedGitCommit")) {
    if (!isSha256(journal.anchors[key])) fail(`transaction journal anchor ${key} is invalid`);
  }
  if (journal.sourceReleasePath !== join(PILOT_RELEASES_ROOT, journal.releaseId)
    || !isDirectChild(PILOT_RELEASES_ROOT, journal.sourceReleasePath)
    || !isDirectChild(PILOT_RELEASES_ROOT, journal.temporaryReleasePath)
    || !basename(journal.temporaryReleasePath).startsWith(`.root-reinode-${journal.releaseId}-`)) {
    fail("transaction journal release paths are not canonical");
  }
  const quarantineRoot = `${PILOT_ROOT}/quarantine`;
  if (!isDirectChild(quarantineRoot, journal.quarantinePath)
    || journal.failedTrustedPath !== `${journal.quarantinePath}-failed-trusted`) {
    fail("transaction journal quarantine paths are not canonical");
  }
  const activePaths = [
    ["activeRecordPath", PILOT_ACTIVE_RECORD],
    ["nextActiveRecord", `${PILOT_ACTIVE_RECORD}.root-reinode-next`],
  ];
  if (journal.mode === "active") {
    for (const [key, expected] of activePaths) {
      if (journal[key] !== expected) fail(`transaction journal ${key} is not canonical`);
    }
    if (journal.activeRecordBackup !== `${journal.quarantinePath}-untrusted-active-release.json`
      || journal.failedActiveRecord !== `${journal.quarantinePath}-failed-active-release.json`
      || journal.pointerTarget !== join(journal.sourceReleasePath, "app")) {
      fail("transaction journal active paths are not canonical");
    }
  } else if ([
    journal.activeRecordPath,
    journal.activeRecordBackup,
    journal.nextActiveRecord,
    journal.failedActiveRecord,
    journal.pointerTarget,
  ].some(Boolean)) {
    fail("inactive transaction journal contains active-only paths");
  }
  return journal;
}

async function readRecoveryJournal(transactionId) {
  const journalPath = join(PILOT_REINODE_TRANSACTION_ROOT, `${transactionId}.json`);
  if (!isDirectChild(PILOT_REINODE_TRANSACTION_ROOT, journalPath)) fail("transaction journal path is unsafe");
  const metadata = await lstat(journalPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== 0 || metadata.gid !== 0 || (metadata.mode & 0o077) !== 0) {
    fail("transaction journal is not a root-only sealed regular file");
  }
  return { journalPath, journal: validateRecoveryJournal(JSON.parse(await readFile(journalPath, "utf8")), transactionId) };
}

export async function recoverReinodeTransaction({
  journal,
  pathExistsFn = pathExists,
  renameFn = rename,
  stopService = async () => {},
  startService = async () => {},
  installPointer = async () => {},
  verifyInstalled = async () => {},
  verifyHealth = async () => {},
  verifyRecovered = async () => {},
  onPhase = async () => {},
}) {
  if (["recovered", "committed"].includes(journal.phase)) {
    return { recovered: true, alreadyRecovered: true, completedForward: journal.phase === "committed" };
  }
  await onPhase("recovering");
  if (journal.mode === "active") await stopService();

  // Once the old active inode has moved to quarantine it is never executed
  // again: an outside writer may still hold it open. Recovery therefore
  // completes the already verified trusted swap forward. Before that boundary,
  // recovery aborts cleanly and leaves the original active release untouched.
  if (journal.mode === "active" && await pathExistsFn(journal.quarantinePath)) {
    if (!await pathExistsFn(journal.sourceReleasePath)) {
      if (!await pathExistsFn(journal.temporaryReleasePath)) {
        throw new Error("trusted recovery copy is missing after the old active release was quarantined");
      }
      await renameFn(journal.temporaryReleasePath, journal.sourceReleasePath);
    }
    await verifyInstalled();
    if (!await pathExistsFn(journal.activeRecordBackup)) {
      if (!await pathExistsFn(journal.activeRecordPath)) throw new Error("original active record is missing");
      await renameFn(journal.activeRecordPath, journal.activeRecordBackup);
    }
    await installPointer("recover-forward");
    if (await pathExistsFn(journal.nextActiveRecord)) {
      await renameFn(journal.nextActiveRecord, journal.activeRecordPath);
    } else if (!await pathExistsFn(journal.activeRecordPath)) {
      throw new Error("trusted active record is missing during forward recovery");
    }
    await verifyInstalled();
    if (journal.serviceWasActive) {
      await startService();
      await verifyHealth();
    }
    await onPhase("committed");
    return { recovered: true, alreadyRecovered: false, completedForward: true };
  }

  // Inactive swaps, and active transactions that never crossed the quarantine
  // boundary, can be rolled back without ever executing a quarantined inode.
  if (await pathExistsFn(journal.quarantinePath)) {
    if (await pathExistsFn(journal.sourceReleasePath)
      && !await pathExistsFn(journal.failedTrustedPath)) {
      await renameFn(journal.sourceReleasePath, journal.failedTrustedPath);
    }
    if (!await pathExistsFn(journal.sourceReleasePath)) {
      await renameFn(journal.quarantinePath, journal.sourceReleasePath);
    }
  }
  if (await pathExistsFn(journal.temporaryReleasePath)
    && !await pathExistsFn(journal.failedTrustedPath)) {
    await renameFn(journal.temporaryReleasePath, journal.failedTrustedPath);
  }

  if (journal.mode === "active") {
    if (await pathExistsFn(journal.activeRecordBackup)) {
      if (await pathExistsFn(journal.activeRecordPath)
        && !await pathExistsFn(journal.failedActiveRecord)) {
        await renameFn(journal.activeRecordPath, journal.failedActiveRecord);
      }
      if (!await pathExistsFn(journal.activeRecordPath)) {
        await renameFn(journal.activeRecordBackup, journal.activeRecordPath);
      }
    } else if (await pathExistsFn(journal.nextActiveRecord)
      && !await pathExistsFn(journal.failedActiveRecord)) {
      await renameFn(journal.nextActiveRecord, journal.failedActiveRecord);
    }
    await installPointer("recover-rollback");
    if (journal.serviceWasActive) await startService();
  }
  await verifyRecovered();
  await onPhase("recovered");
  return { recovered: true, alreadyRecovered: false, completedForward: false };
}

async function assertRealDirectory(path, label) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(path) !== path) {
    fail(`${label} is not a real canonical directory: ${path}`);
  }
}

async function installRootOwnedPointer(temporaryPointer, target) {
  if (await pathExists(temporaryPointer)) fail(`temporary pointer already exists: ${temporaryPointer}`);
  await symlink(target, temporaryPointer);
  await lchown(temporaryPointer, 0, 0);
  await durableRename(temporaryPointer, PILOT_APP_POINTER);
}

async function rollbackReinodeTransaction({
  mode,
  sourceReleasePath,
  quarantinePath,
  failedTrustedPath,
  activeRecordPath,
  activeRecordBackup,
  failedActiveRecord,
  nextActiveRecord,
  oldMoved,
  newInstalled,
  oldRecordMoved,
  newRecordInstalled,
  serviceWasActive,
  pathExistsFn,
  renameFn,
  stopService,
  startService,
  installPointer,
}) {
  const errors = [];
  const attempt = async (label, operation) => {
    try {
      await operation();
    } catch (error) {
      errors.push(`${label}: ${error?.message || error}`);
    }
  };
  if (mode === "active") {
    await attempt("stop failed trusted runtime", stopService);
  }
  if (newInstalled && await pathExistsFn(sourceReleasePath)) {
    await attempt("quarantine failed trusted copy", async () => renameFn(sourceReleasePath, failedTrustedPath));
  }
  if (oldMoved && await pathExistsFn(quarantinePath)) {
    await attempt("restore original release", async () => renameFn(quarantinePath, sourceReleasePath));
  }
  if (mode === "active") {
    if (newRecordInstalled && await pathExistsFn(activeRecordPath)) {
      await attempt("quarantine failed active record", async () => renameFn(activeRecordPath, failedActiveRecord));
    } else if (await pathExistsFn(nextActiveRecord)) {
      await attempt("quarantine pending active record", async () => renameFn(nextActiveRecord, failedActiveRecord));
    }
    if (oldRecordMoved && await pathExistsFn(activeRecordBackup)) {
      await attempt("restore original active record", async () => renameFn(activeRecordBackup, activeRecordPath));
    }
    await attempt("restore active pointer", async () => installPointer("rollback"));
    if (serviceWasActive) {
      await attempt("restart original service", startService);
    }
  }
  return errors;
}

export async function executeReinodeSwapTransaction({
  mode,
  sourceReleasePath,
  temporaryReleasePath,
  quarantinePath,
  failedTrustedPath,
  activeRecordPath = "",
  activeRecordBackup = "",
  nextActiveRecord = "",
  failedActiveRecord = "",
  serviceWasActive = false,
  pathExistsFn = pathExists,
  renameFn = rename,
  stopService = async () => {},
  startService = async () => {},
  installPointer = async () => {},
  verifyInstalled = async () => null,
  verifyHealth = async () => null,
  onPhase = async () => {},
}) {
  let oldMoved = false;
  let newInstalled = false;
  let oldRecordMoved = false;
  let newRecordInstalled = false;
  try {
    await onPhase("prepared");
    if (mode === "active") {
      await stopService();
      await onPhase("service-stopped");
    }
    await renameFn(sourceReleasePath, quarantinePath);
    oldMoved = true;
    await onPhase("old-release-quarantined");
    await renameFn(temporaryReleasePath, sourceReleasePath);
    newInstalled = true;
    await onPhase("trusted-release-installed");
    if (mode === "active") {
      await renameFn(activeRecordPath, activeRecordBackup);
      oldRecordMoved = true;
      await onPhase("old-record-quarantined");
      await installPointer("forward");
      await onPhase("pointer-installed");
      await renameFn(nextActiveRecord, activeRecordPath);
      newRecordInstalled = true;
      await onPhase("trusted-record-installed");
    }
    const verification = await verifyInstalled();
    await onPhase("verified");
    let health = null;
    if (mode === "active") {
      await startService();
      await onPhase("service-started");
      health = await verifyHealth();
      await onPhase("healthy");
    }
    await onPhase("committed");
    return { verification, health };
  } catch (error) {
    if (mode === "active" && oldMoved) {
      const failClosedErrors = [];
      try {
        // Once the deploy-era inode has moved to quarantine it is never made
        // executable again. A retained writer fd could have changed it while
        // the trusted copy was being verified or health-checked.
        await stopService();
      } catch (stopError) {
        failClosedErrors.push(`stop failed runtime: ${stopError?.message || stopError}`);
      }
      try {
        await onPhase("recovery-required");
      } catch (journalError) {
        failClosedErrors.push(`journal recovery-required failed: ${journalError?.message || journalError}`);
      }
      throw new Error(
        `${error?.message || error}; fail_closed=old_release_quarantined_service_stopped`
        + `${failClosedErrors.length ? `; cleanup=${failClosedErrors.join(" | ")}` : ""}`,
      );
    }
    const journalErrors = [];
    try {
      await onPhase("rollback-started");
    } catch (journalError) {
      journalErrors.push(`journal rollback-started failed: ${journalError?.message || journalError}`);
    }
    const rollbackErrors = await rollbackReinodeTransaction({
      mode,
      sourceReleasePath,
      quarantinePath,
      failedTrustedPath,
      activeRecordPath,
      activeRecordBackup,
      failedActiveRecord,
      nextActiveRecord,
      oldMoved,
      newInstalled,
      oldRecordMoved,
      newRecordInstalled,
      serviceWasActive,
      pathExistsFn,
      renameFn,
      stopService,
      startService,
      installPointer,
    });
    try {
      await onPhase(rollbackErrors.length ? "rollback-incomplete" : "rolled-back");
    } catch (journalError) {
      journalErrors.push(`journal rollback result failed: ${journalError?.message || journalError}`);
    }
    throw new Error(
      `${error?.message || error}; rollback=${rollbackErrors.length ? rollbackErrors.join(" | ") : "restored"}`
      + `${journalErrors.length ? `; journal=${journalErrors.join(" | ")}` : ""}`,
    );
  }
}

async function main() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) fail("uid 0 is required");
  const anchors = parseArgs(process.argv.slice(2));
  if (process.env.MES_RELEASE_AUTHORITY_LOCK_HELD !== "1") {
    const operation = anchors.mode === "recover" ? "reinode-recovery" : "reinode";
    const result = spawnSync("/bin/bash", [
      ROOT_RELEASE_AUTHORITY_WRAPPER,
      `--operation=${operation}`,
      "--busy-policy=fail",
      "--",
      "/usr/bin/node",
      ROOT_REINODE_HELPER_PATH,
      ...process.argv.slice(2),
    ], { env: TRUSTED_CHILD_ENV, stdio: "inherit" });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
  await assertAuthorityLockInherited();
  await assertFixedHelpersTrusted();
  await clearReleaseAppVerificationIntent();
  await assertTrustedPathChain(PILOT_RELEASES_ROOT);
  await assertRootDirectory(PILOT_REINODE_TRANSACTION_ROOT, 0o700);
  const transactionRootMetadata = await lstat(PILOT_REINODE_TRANSACTION_ROOT);
  if ((transactionRootMetadata.mode & 0o077) !== 0) {
    fail(`transaction journal directory must be root-only: ${PILOT_REINODE_TRANSACTION_ROOT}`);
  }

  if (anchors.mode === "recover") {
    const { journalPath, journal } = await readRecoveryJournal(anchors.transactionId);
    const updateJournal = async (phase) => {
      journal.phase = phase;
      journal.updatedAt = new Date().toISOString();
      await writeDurableTransactionJournal({ journalPath, journal });
    };
    const serviceWasActiveNow = run(TRUSTED_BIN.systemctl, ["is-active", "--quiet", PILOT_SERVICE], { allowFailure: true }).status === 0;
    const stopService = async () => {
      if (!serviceWasActiveNow) return;
      if (anchors.prestart) {
        run(TRUSTED_BIN.systemctl, ["stop", "--no-block", PILOT_SERVICE], { allowFailure: true });
        fail("pre-start re-inode recovery found a live Pilot process; stop was queued");
      }
      const result = run(TRUSTED_BIN.systemctl, ["stop", PILOT_SERVICE], { allowFailure: true });
      if (result.status !== 0) fail(`unable to stop Pilot service for recovery: ${(result.stderr || result.stdout || "").trim()}`);
    };
    let appVerificationIntentActive = false;
    const startService = async () => {
      if (anchors.prestart) return;
      await writeReleaseAppVerificationIntent({
        operation: "reinode-recovery",
        expectedTarget: journal.pointerTarget || join(journal.sourceReleasePath, "app"),
        journalId: journal.transactionId,
        journalPhase: journal.phase,
      });
      appVerificationIntentActive = true;
      const result = run(TRUSTED_BIN.systemctl, ["start", PILOT_SERVICE], { allowFailure: true });
      if (result.status !== 0) {
        await clearReleaseAppVerificationIntent();
        appVerificationIntentActive = false;
        fail(`unable to start Pilot service after recovery: ${(result.stderr || result.stdout || "").trim()}`);
      }
    };
    const verifyInstalled = async () => {
      await verifyReleaseRootSeal({
        releasesRoot: PILOT_RELEASES_ROOT,
        releaseId: journal.releaseId,
        appPath: join(journal.sourceReleasePath, "app"),
        requireOriginAttestation: true,
      });
      await verifyOutOfBandReleaseAnchors({ releasePath: journal.sourceReleasePath, anchors: journal.anchors });
      if (await pathExists(journal.activeRecordBackup) && !await pathExists(journal.nextActiveRecord)) {
        await verifySealedPointer({ pointerPath: PILOT_APP_POINTER, expectedTarget: journal.pointerTarget });
        await verifySealedArtifact({ trustedRoot: PILOT_RELEASES_ROOT, artifactPath: PILOT_ACTIVE_RECORD });
      }
    };
    let result;
    try {
      result = await recoverReinodeTransaction({
        journal,
        renameFn: durableRename,
        stopService,
        startService,
        installPointer: async () => installRootOwnedPointer(
          `${PILOT_APP_POINTER}.root-reinode-recover-${process.pid}`,
          journal.pointerTarget || join(journal.sourceReleasePath, "app"),
        ),
        verifyInstalled,
        verifyHealth: async () => {
          if (anchors.prestart) return null;
          const health = await waitForTrustedHealth(
            JSON.parse(await readFile(join(journal.sourceReleasePath, "release-manifest.json"), "utf8")).appVersion,
          );
          await clearReleaseAppVerificationIntent();
          appVerificationIntentActive = false;
          return health;
        },
        verifyRecovered: async () => assertRealDirectory(journal.sourceReleasePath, "recovered original release"),
        onPhase: updateJournal,
      });
    } finally {
      if (appVerificationIntentActive) await clearReleaseAppVerificationIntent();
    }
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "recover", transactionId: anchors.transactionId, ...result })}\n`);
    return;
  }

  const sourceReleasePath = join(PILOT_RELEASES_ROOT, anchors.releaseId);
  const sourceAppPath = join(sourceReleasePath, "app");
  await assertRealDirectory(sourceReleasePath, "selected release");
  await assertRealDirectory(sourceAppPath, "selected release app");
  if (anchors.mode === "verify") {
    await verifyReleaseRootSeal({
      releasesRoot: PILOT_RELEASES_ROOT,
      releaseId: anchors.releaseId,
      appPath: sourceAppPath,
      requireOriginAttestation: true,
    });
    const verified = await verifyOutOfBandReleaseAnchors({ releasePath: sourceReleasePath, anchors });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: "verify",
      releaseId: anchors.releaseId,
      sourceSha256: verified.sourceSha256,
      distSha256: verified.distSha256,
    })}\n`);
    return;
  }
  const activeTarget = await realpath(PILOT_APP_POINTER);
  if (anchors.mode === "active" && activeTarget !== sourceAppPath) fail("active pointer does not select the requested release");
  if (anchors.mode === "inactive" && activeTarget === sourceAppPath) fail("inactive mode refuses the currently active release");
  const sourceVerified = await verifyOutOfBandReleaseAnchors({ releasePath: sourceReleasePath, anchors });
  let trustedActiveRecord = null;
  if (anchors.mode === "active") {
    const activeRecordMetadata = await lstat(PILOT_ACTIVE_RECORD);
    if (!activeRecordMetadata.isFile() || activeRecordMetadata.isSymbolicLink()) fail("active release record is not a regular file");
    const currentActiveRecord = JSON.parse(await readFile(PILOT_ACTIVE_RECORD, "utf8"));
    trustedActiveRecord = await buildTrustedActiveRecord({
      currentRecord: currentActiveRecord,
      verifiedRelease: sourceVerified,
      anchors,
      expectedPreviousReleaseId: anchors.expectedPreviousReleaseId,
      expectedLegacyReleaseId: anchors.expectedLegacyReleaseId,
    });
    await verifyPriorReinodeAttestation(trustedActiveRecord.previous, "previous");
    await verifyPriorReinodeAttestation(trustedActiveRecord.legacyBaseline, "legacyBaseline");
  }

  const temporaryReleaseId = `.root-reinode-${anchors.releaseId}-${process.pid}`;
  const temporaryReleasePath = join(PILOT_RELEASES_ROOT, temporaryReleaseId);
  try {
    await lstat(temporaryReleasePath);
    fail(`temporary release path already exists: ${temporaryReleasePath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(temporaryReleasePath, { mode: 0o700 });
  await chmod(temporaryReleasePath, 0o700);
  const temporaryAppPath = join(temporaryReleasePath, "app");

  // Only the manifest-anchored payload is promoted onto new trusted inodes.
  // Deploy-era activation/health/failed-pointer files are operational history,
  // not release inputs; they remain with the old tree in quarantine so a
  // future switch helper cannot accidentally treat them as trusted policy.
  await copyAnchoredAppPayload({ sourceAppPath, targetAppPath: temporaryAppPath });
  await writeFile(
    join(temporaryReleasePath, "release-manifest.json"),
    await readFile(sourceVerified.manifestPath),
    { mode: 0o600, flag: "wx" },
  );
  const verified = await verifyOutOfBandReleaseAnchors({ releasePath: temporaryReleasePath, anchors });

  const buildScratch = await mkdtemp("/var/tmp/mes-reinode-stage-");
  try {
    run(TRUSTED_BIN.chown, ["mes-stage:mes-stage", buildScratch]);
    await cp(join(verified.appPath, "package.json"), join(buildScratch, "package.json"), {
      force: false,
      errorOnExist: true,
    });
    await cp(join(verified.appPath, "package-lock.json"), join(buildScratch, "package-lock.json"), {
      force: false,
      errorOnExist: true,
    });
    run(TRUSTED_BIN.runuser, [
      "-u", "mes-stage", "--", "/usr/bin/env",
      "HOME=/nonexistent",
      `npm_config_cache=${buildScratch}/.npm-cache`,
      TRUSTED_BIN.npm, "ci", "--omit=dev", "--ignore-scripts",
    ], { cwd: buildScratch });
    await rename(join(buildScratch, "node_modules"), join(verified.appPath, "node_modules"));
  } finally {
    await rm(buildScratch, { recursive: true, force: true });
  }
  await verifyOutOfBandReleaseAnchors({ releasePath: temporaryReleasePath, anchors });
  await writeReinodeAttestation(temporaryReleasePath, anchors);
  run(TRUSTED_BIN.chown, ["-hR", "0:0", temporaryReleasePath]);
  run(TRUSTED_BIN.find, [temporaryReleasePath, "-xdev", "!", "-type", "l", "-perm", "/022", "-exec", "chmod", "go-w", "--", "{}", "+"]);
  await verifyReleaseRootSeal({
    releasesRoot: PILOT_RELEASES_ROOT,
    releaseId: temporaryReleaseId,
    appPath: join(temporaryReleasePath, "app"),
    requireOriginAttestation: false,
  });
  // The complete candidate tree must reach stable storage before the durable
  // journal can claim artifacts-prepared. Recovery may rely on this exact
  // ordering after sudden power loss, not only after a catchable exception.
  await syncTree(temporaryReleasePath);
  await syncDirectory(PILOT_RELEASES_ROOT);

  const quarantineRoot = `${PILOT_ROOT}/quarantine`;
  await assertRootDirectory(quarantineRoot, 0o700);
  const quarantinePath = join(quarantineRoot, `untrusted-${anchors.releaseId}-${Date.now()}`);
  const failedTrustedPath = `${quarantinePath}-failed-trusted`;
  const activeRecordBackup = `${quarantinePath}-untrusted-active-release.json`;
  const failedActiveRecord = `${quarantinePath}-failed-active-release.json`;
  for (const path of [quarantinePath, failedTrustedPath, failedActiveRecord]) {
    if (await pathExists(path)) fail(`quarantine transaction path already exists: ${path}`);
  }
  const nextPointer = `${PILOT_APP_POINTER}.root-reinode-next`;
  const nextActiveRecord = `${PILOT_ACTIVE_RECORD}.root-reinode-next`;
  if (await pathExists(nextPointer) || await pathExists(nextActiveRecord)) fail("a root re-inode transaction is already pending");

  const serviceWasActive = anchors.mode === "active"
    && run(TRUSTED_BIN.systemctl, ["is-active", "--quiet", PILOT_SERVICE], { allowFailure: true }).status === 0;
  if (anchors.mode === "active" && !serviceWasActive) fail("Pilot service must be active before root re-inode");
  const transactionId = `${anchors.releaseId}-${Date.now()}-${process.pid}`;
  const journalPath = join(PILOT_REINODE_TRANSACTION_ROOT, `${transactionId}.json`);
  const journal = {
    schemaVersion: 1,
    transactionId,
    mode: anchors.mode,
    releaseId: anchors.releaseId,
    sourceReleasePath,
    temporaryReleasePath,
    quarantinePath,
    failedTrustedPath,
    activeRecordPath: anchors.mode === "active" ? PILOT_ACTIVE_RECORD : "",
    activeRecordBackup: anchors.mode === "active" ? activeRecordBackup : "",
    nextActiveRecord: anchors.mode === "active" ? nextActiveRecord : "",
    failedActiveRecord: anchors.mode === "active" ? failedActiveRecord : "",
    pointerTarget: anchors.mode === "active" ? sourceAppPath : "",
    serviceWasActive,
    anchors: {
      releaseId: anchors.releaseId,
      expectedGitCommit: anchors.expectedGitCommit,
      expectedSourceSha256: anchors.expectedSourceSha256,
      expectedDistSha256: anchors.expectedDistSha256,
      expectedPackageLockSha256: anchors.expectedPackageLockSha256,
      expectedRuntimePolicySha256: anchors.expectedRuntimePolicySha256,
      expectedBootstrapSha256: anchors.expectedBootstrapSha256,
      expectedBootstrapGzipSha256: anchors.expectedBootstrapGzipSha256,
      expectedBootstrapBrotliSha256: anchors.expectedBootstrapBrotliSha256,
    },
    phase: "artifacts-prepared",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeDurableTransactionJournal({ journalPath, journal });
  const updateJournal = async (phase) => {
    journal.phase = phase;
    journal.updatedAt = new Date().toISOString();
    await writeDurableTransactionJournal({ journalPath, journal });
  };
  if (anchors.mode === "active") {
    await writeDurableFile(nextActiveRecord, `${JSON.stringify(trustedActiveRecord, null, 2)}\n`, 0o644);
    await updateJournal("active-record-prepared");
  }
  let appVerificationIntentActive = false;
  let transaction;
  try {
    transaction = await executeReinodeSwapTransaction({
    mode: anchors.mode,
    sourceReleasePath,
    temporaryReleasePath,
    quarantinePath,
    failedTrustedPath,
    activeRecordPath: PILOT_ACTIVE_RECORD,
    activeRecordBackup,
    nextActiveRecord,
    failedActiveRecord,
    serviceWasActive,
    renameFn: durableRename,
    stopService: async () => {
      const result = run(TRUSTED_BIN.systemctl, ["stop", PILOT_SERVICE], { allowFailure: true });
      if (result.status !== 0) fail(`unable to stop Pilot service: ${(result.stderr || result.stdout || "").trim()}`);
    },
    startService: async () => {
      await writeReleaseAppVerificationIntent({
        operation: "reinode",
        expectedTarget: sourceAppPath,
        journalId: transactionId,
        journalPhase: journal.phase,
      });
      appVerificationIntentActive = true;
      const result = run(TRUSTED_BIN.systemctl, ["start", PILOT_SERVICE], { allowFailure: true });
      if (result.status !== 0) {
        await clearReleaseAppVerificationIntent();
        appVerificationIntentActive = false;
        fail(`unable to start Pilot service: ${(result.stderr || result.stdout || "").trim()}`);
      }
    },
    installPointer: async (phase) => installRootOwnedPointer(
      phase === "rollback"
        ? `${PILOT_APP_POINTER}.root-reinode-rollback-${process.pid}`
        : nextPointer,
      sourceAppPath,
    ),
    verifyInstalled: async () => {
      await verifyReleaseRootSeal({
        releasesRoot: PILOT_RELEASES_ROOT,
        releaseId: anchors.releaseId,
        appPath: sourceAppPath,
        requireOriginAttestation: true,
      });
      await verifyOutOfBandReleaseAnchors({ releasePath: sourceReleasePath, anchors });
      await verifySealedArtifact({
        trustedRoot: sourceReleasePath,
        artifactPath: join(sourceReleasePath, ROOT_RELEASE_TRUST_ATTESTATION),
      });
      if (anchors.mode === "active") {
        await verifySealedPointer({ pointerPath: PILOT_APP_POINTER, expectedTarget: sourceAppPath });
        await verifySealedArtifact({ trustedRoot: PILOT_RELEASES_ROOT, artifactPath: PILOT_ACTIVE_RECORD });
      }
      return true;
    },
    verifyHealth: async () => {
      const health = await waitForTrustedHealth(verified.manifest.appVersion);
      await clearReleaseAppVerificationIntent();
      appVerificationIntentActive = false;
      return health;
    },
    onPhase: updateJournal,
    });
  } finally {
    if (appVerificationIntentActive) await clearReleaseAppVerificationIntent();
  }
  const health = transaction.health;

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: anchors.mode,
    releaseId: anchors.releaseId,
    sourceSha256: anchors.expectedSourceSha256,
    distSha256: anchors.expectedDistSha256,
    quarantinePath,
    transactionId,
    journalPath,
    health: health ? {
      status: health.status,
      sharedState: health.sharedState,
      version: health.version,
      public: health.public,
    } : null,
  })}\n`);
}

const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsCli) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
