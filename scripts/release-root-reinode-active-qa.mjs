#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
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
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PILOT_BOOTSTRAP_BIND_CONTENT,
  assertBootstrapLineageInvariant,
  buildTrustedActiveRecord,
  copyAnchoredAppPayload,
  computeTrustedTreeSha,
  executeReinodeSwapTransaction,
  fdInfoProvesCanonicalFlock,
  normalizePublicReleasePayloadModes,
  refreshPilotBootstrapRecoveryMirror,
  recoverReinodeTransaction,
  verifyOutOfBandReleaseAnchors,
  writeDurableTransactionJournal,
} from "./release-root-reinode-active.mjs";

assert.equal(
  PILOT_BOOTSTRAP_BIND_CONTENT,
  await readFile(new URL("../ops/frontend/mes-pilot-bootstrap-snapshot-bind.conf", import.meta.url), "utf8"),
  "the fixed root helper must publish the exact reviewed bootstrap bind drop-in",
);

const helperSource = await readFile(new URL("./release-root-reinode-active.mjs", import.meta.url), "utf8");
const preparationStart = helperSource.indexOf("await writeReinodeAttestation(temporaryReleasePath, anchors)");
const journalStart = helperSource.indexOf("const journal = {", preparationStart);
assert(preparationStart >= 0 && journalStart > preparationStart,
  "production re-inode preparation must remain statically reviewable before the durable journal");
const preparation = helperSource.slice(preparationStart, journalStart);
let preparationCursor = -1;
for (const needle of [
  'run(TRUSTED_BIN.chown, ["-hR", "0:0", temporaryReleasePath])',
  "await normalizePublicReleasePayloadModes({ releasePath: temporaryReleasePath })",
  "await verifyReleaseRootSeal({",
  "ROOT_PUBLIC_RELEASE_VERIFIER_PATH",
  '"--public-only"',
]) {
  const index = preparation.indexOf(needle, preparationCursor + 1);
  assert(index > preparationCursor, `production re-inode preparation is missing or reorders: ${needle}`);
  preparationCursor = index;
}

const fixtureLockPid = 5151;
const fixtureLockInode = 9191n;
assert.equal(fdInfoProvesCanonicalFlock({
  fdInfo: `pos:\t0\nlock:\t1: FLOCK ADVISORY WRITE ${fixtureLockPid} 00:2a:${fixtureLockInode} 0 EOF\n`,
  ownerPid: fixtureLockPid,
  inode: fixtureLockInode,
}), true, "the re-inode helper must accept one exact owner/inode flock proof");
assert.equal(fdInfoProvesCanonicalFlock({
  fdInfo: `pos:\t0\nlock:\t1: FLOCK ADVISORY WRITE ${fixtureLockPid + 1} 00:2a:${fixtureLockInode} 0 EOF\n`,
  ownerPid: fixtureLockPid,
  inode: fixtureLockInode,
}), false, "a transient child's FLOCK WRITE must not prove the re-inode caller owns fd9");
assert.equal(fdInfoProvesCanonicalFlock({
  fdInfo: "pos:\t0\nflags:\t0100002\n",
  ownerPid: fixtureLockPid,
  inode: fixtureLockInode,
}), false, "an open fd9 without a kernel lock must fail closed");
assert.equal(fdInfoProvesCanonicalFlock({
  fdInfo: `lock:\t1: FLOCK ADVISORY WRITE ${fixtureLockPid} 00:2a:${fixtureLockInode + 1n} 0 EOF\n`,
  ownerPid: fixtureLockPid,
  inode: fixtureLockInode,
}), false, "a flock for a different inode must fail closed");

const RUNTIME_INCLUDES = [
  "src", "styles", "scripts", "assets", "ops", "db",
  "app-version.json", "index.html", "styles.css", "favicon.svg", "server.js",
  "package.json", "package-lock.json", "react-runtime-policy.json",
  "mes-planning-prototype.png", "vercel.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createRelease(root, releaseId) {
  const releasePath = join(root, releaseId);
  const appPath = join(releasePath, "app");
  for (const directory of ["src", "styles", "scripts", "assets", "ops", "db", "dist"]) {
    await mkdir(join(appPath, directory), { recursive: true });
    await writeFile(join(appPath, directory, "fixture.txt"), `${directory}-trusted\n`);
  }
  const packageLock = '{"lockfileVersion":3}\n';
  const runtimePolicy = await readFile(new URL("../react-runtime-policy.json", import.meta.url), "utf8");
  const bootstrap = '{"fixture":"bootstrap"}\n';
  const runtimeFiles = {
    "app-version.json": '{"version":"v.1.500.99"}\n',
    "index.html": "<!doctype html>\n",
    "styles.css": "/* trusted */\n",
    "favicon.svg": "<svg/>\n",
    "server.js": "// trusted\n",
    "package.json": '{"type":"module"}\n',
    "package-lock.json": packageLock,
    "react-runtime-policy.json": runtimePolicy,
    "mes-planning-prototype.png": "fixture-png\n",
    "vercel.json": "{}\n",
  };
  for (const [path, source] of Object.entries(runtimeFiles)) await writeFile(join(appPath, path), source);
  await writeFile(join(appPath, "scripts", "executable-fixture.sh"), "#!/bin/sh\nexit 0\n");
  await chmod(join(appPath, "scripts", "executable-fixture.sh"), 0o755);
  await writeFile(join(appPath, "bootstrap-snapshot.json"), bootstrap);
  await writeFile(join(appPath, "dist", "bootstrap-snapshot.json"), bootstrap);
  const bootstrapGzip = "fixture-gzip\n";
  const bootstrapBrotli = "fixture-brotli\n";
  await writeFile(join(appPath, "dist", "bootstrap-snapshot.json.gz"), bootstrapGzip);
  await writeFile(join(appPath, "dist", "bootstrap-snapshot.json.br"), bootstrapBrotli);

  const sourceTreeSha256 = await computeTrustedTreeSha({ root: appPath, includes: RUNTIME_INCLUDES });
  const distTreeSha256 = await computeTrustedTreeSha({
    root: appPath,
    includes: ["dist"],
    excludes: ["dist/bootstrap-snapshot.json", "dist/bootstrap-snapshot.json.gz", "dist/bootstrap-snapshot.json.br"],
  });
  const manifest = {
    schemaVersion: 3,
    releaseId,
    gitCommit: "1".repeat(40),
    appVersion: "v.1.500.99",
    gitProvenance: {
      schemaVersion: 1,
      gitCommit: "1".repeat(40),
      branch: "codex/frontend-react-migration",
      remote: "origin",
      upstreamRef: "origin/main",
      upstreamBranchRef: "refs/heads/main",
      upstreamCommit: "2".repeat(40),
      verification: "fresh-upstream-fetch",
      verifiedAt: "2026-07-21T00:00:00.000Z",
    },
    runtimeIncludes: RUNTIME_INCLUDES,
    sourceTreeSha256,
    distTreeSha256,
    packageLockSha256: sha256(packageLock),
    runtimePolicy: {
      schemaVersion: 1,
      path: "react-runtime-policy.json",
      policyId: "mes-react-runtime-v1",
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
  await writeFile(join(releasePath, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const anchors = {
    releaseId,
    expectedGitCommit: manifest.gitCommit,
    expectedSourceSha256: sourceTreeSha256,
    expectedDistSha256: distTreeSha256,
    expectedPackageLockSha256: manifest.packageLockSha256,
    expectedRuntimePolicySha256: manifest.runtimePolicy.sha256,
    expectedBootstrapSha256: manifest.compatibilityArtifacts[0].sha256,
    expectedBootstrapGzipSha256: manifest.compatibilityArtifacts[0].generatedPaths[0].sha256,
    expectedBootstrapBrotliSha256: manifest.compatibilityArtifacts[0].generatedPaths[1].sha256,
  };
  return { releasePath, appPath, manifest, anchors };
}

const root = await realpath(await mkdtemp(join(tmpdir(), "mes-root-reinode-qa-")));
try {
  const releaseId = "v.1.500.qa-active";
  const releasesRoot = join(root, "releases");
  const quarantineRoot = join(root, "quarantine");
  await mkdir(releasesRoot);
  await mkdir(quarantineRoot);
  const source = await createRelease(releasesRoot, releaseId);
  const externalBootstrapPath = join(root, "external-bootstrap.json");
  const sourceBootstrapPath = join(source.appPath, "bootstrap-snapshot.json");
  const sourceBootstrap = await readFile(sourceBootstrapPath);
  await writeFile(externalBootstrapPath, "external-do-not-touch\n", { mode: 0o600 });
  await rm(sourceBootstrapPath);
  await symlink(externalBootstrapPath, sourceBootstrapPath);
  const rejectedTarget = join(releasesRoot, ".symlink-rejected", "app");
  await assert.rejects(
    copyAnchoredAppPayload({ sourceAppPath: source.appPath, targetAppPath: rejectedTarget }),
    /source private bootstrap path is not a regular file/,
    "a source bootstrap symlink must be rejected before a trusted target is created or chmod is attempted",
  );
  await assert.rejects(lstat(rejectedTarget), /ENOENT/,
    "source validation must fail before creating the trusted target tree");
  assert.equal(await readFile(externalBootstrapPath, "utf8"), "external-do-not-touch\n");
  assert.equal((await stat(externalBootstrapPath)).mode & 0o777, 0o600,
    "rejecting a source bootstrap symlink must not chmod its external target");
  await rm(sourceBootstrapPath);
  await writeFile(sourceBootstrapPath, sourceBootstrap);
  const recoveryPath = join(root, "bootstrap-recovery", "bootstrap-snapshot.json");
  await refreshPilotBootstrapRecoveryMirror({
    sourcePath: sourceBootstrapPath,
    expectedSha256: source.anchors.expectedBootstrapSha256,
    recoveryPath,
    expectedUid: process.getuid(),
    expectedGid: process.getgid(),
  });
  assert.equal(await readFile(recoveryPath, "utf8"), sourceBootstrap.toString("utf8"));
  assert.equal((await stat(recoveryPath)).mode & 0o777, 0o444);
  const mismatchedBootstrap = join(root, "mismatched-bootstrap.json");
  await writeFile(mismatchedBootstrap, '{"fixture":"attacker"}\n');
  await assert.rejects(
    refreshPilotBootstrapRecoveryMirror({
      sourcePath: mismatchedBootstrap,
      expectedSha256: source.anchors.expectedBootstrapSha256,
      recoveryPath,
      expectedUid: process.getuid(),
      expectedGid: process.getgid(),
    }),
    /differs from the manifest-bound digest/,
    "a digest-mismatched release bootstrap must not replace the sealed recovery mirror",
  );
  assert.equal(await readFile(recoveryPath, "utf8"), sourceBootstrap.toString("utf8"),
    "a rejected bootstrap refresh must leave the previous sealed mirror unchanged");

  const lineagePointer = join(root, "lineage-pointer");
  const lineageMirror = join(root, "lineage-mirror");
  await writeFile(lineagePointer, "active-pointer-before\n");
  await writeFile(lineageMirror, "sealed-mirror-before\n");
  const commonBootstrapSha256 = source.anchors.expectedBootstrapSha256;
  assert.equal(assertBootstrapLineageInvariant({
    activeBootstrapSha256: commonBootstrapSha256,
    previousBootstrapSha256: commonBootstrapSha256,
    legacyBootstrapSha256: commonBootstrapSha256,
  }), commonBootstrapSha256);
  assert.throws(() => assertBootstrapLineageInvariant({
    activeBootstrapSha256: commonBootstrapSha256,
    previousBootstrapSha256: "f".repeat(64),
    legacyBootstrapSha256: commonBootstrapSha256,
  }), /active, immediate previous and pinned legacy bootstrap digests differ/);
  assert.equal(await readFile(lineagePointer, "utf8"), "active-pointer-before\n",
    "a lineage mismatch must leave the application pointer unchanged");
  assert.equal(await readFile(lineageMirror, "utf8"), "sealed-mirror-before\n",
    "a lineage mismatch must leave the sealed recovery mirror unchanged");
  await writeFile(join(source.appPath, ".npmrc"), "unsafe-root-script=true\n");
  await mkdir(join(source.appPath, "unmanifested-extra"));
  await writeFile(join(source.appPath, "unmanifested-extra", "payload"), "unsafe\n");
  await chmod(join(source.appPath, "src", "fixture.txt"), 0o600);
  await chmod(join(source.appPath, "src"), 0o700);
  const allowlistCopy = join(releasesRoot, ".allowlist-copy", "app");
  await mkdir(join(releasesRoot, ".allowlist-copy"));
  await copyAnchoredAppPayload({ sourceAppPath: source.appPath, targetAppPath: allowlistCopy });
  await assert.rejects(readFile(join(allowlistCopy, ".npmrc")), /ENOENT/);
  await assert.rejects(readFile(join(allowlistCopy, "unmanifested-extra", "payload")), /ENOENT/);
  for (const privatePath of [
    "bootstrap-snapshot.json",
    "dist/bootstrap-snapshot.json",
    "dist/bootstrap-snapshot.json.gz",
    "dist/bootstrap-snapshot.json.br",
  ]) {
    assert.equal((await stat(join(allowlistCopy, privatePath))).mode & 0o777, 0o400,
      `re-inode must normalize ${privatePath} to root-private mode 0400`);
  }
  const publicCopyRelease = join(releasesRoot, ".public-mode-copy");
  const publicCopyApp = join(publicCopyRelease, "app");
  await mkdir(publicCopyRelease);
  await copyAnchoredAppPayload({ sourceAppPath: source.appPath, targetAppPath: publicCopyApp });
  await writeFile(
    join(publicCopyRelease, "release-manifest.json"),
    await readFile(join(source.releasePath, "release-manifest.json")),
  );
  await normalizePublicReleasePayloadModes({ releasePath: publicCopyRelease });
  assert.equal((await stat(publicCopyRelease)).mode & 0o777, 0o755);
  assert.equal((await stat(publicCopyApp)).mode & 0o777, 0o755);
  assert.equal((await stat(join(publicCopyRelease, "release-manifest.json"))).mode & 0o777, 0o444);
  assert.equal((await stat(join(publicCopyApp, "src"))).mode & 0o777, 0o755);
  assert.equal((await stat(join(publicCopyApp, "src", "fixture.txt"))).mode & 0o777, 0o444);
  assert.equal((await stat(join(publicCopyApp, "scripts", "executable-fixture.sh"))).mode & 0o777, 0o555);
  const privatePaths = [
    "bootstrap-snapshot.json",
    "dist/bootstrap-snapshot.json",
    "dist/bootstrap-snapshot.json.gz",
    "dist/bootstrap-snapshot.json.br",
  ];
  for (const privatePath of privatePaths) {
    assert.equal((await stat(join(publicCopyApp, privatePath))).mode & 0o777, 0o400,
      `${privatePath} must stay root-private after public payload mode normalization`);
    await chmod(join(publicCopyApp, privatePath), 0o000);
  }
  const publicVerifier = spawnSync(process.execPath, [
    new URL("./release-verify.mjs", import.meta.url).pathname,
    `--app-root=${publicCopyApp}`,
    `--manifest=${join(publicCopyRelease, "release-manifest.json")}`,
    `--expected-release-id=${releaseId}`,
    "--json",
    "--public-only",
  ], { encoding: "utf8" });
  assert.equal(publicVerifier.status, 0,
    `the normalized public payload must be verifiable without reading private bootstrap bytes: ${publicVerifier.stderr}`);
  for (const privatePath of privatePaths) await chmod(join(publicCopyApp, privatePath), 0o400);
  const sourceRuntimePath = join(source.appPath, "src", "fixture.txt");
  const deployHandle = await open(sourceRuntimePath, "r+");
  const freshPath = join(releasesRoot, ".root-reinode-fixture");
  await cp(source.releasePath, freshPath, { recursive: true, preserveTimestamps: true });

  const sourceInode = (await stat(sourceRuntimePath)).ino;
  const freshRuntimePath = join(freshPath, "app", "src", "fixture.txt");
  const freshInode = (await stat(freshRuntimePath)).ino;
  assert.notEqual(freshInode, sourceInode, "trusted copy must use new inodes instead of chowning or hard-linking deploy inodes");
  await verifyOutOfBandReleaseAnchors({ releasePath: freshPath, anchors: source.anchors });

  const attackerGeneratedPath = join(source.releasePath, "release-manifest.json");
  const attackerManifest = JSON.parse(await readFile(attackerGeneratedPath, "utf8"));
  const canonicalOperationalPath = attackerManifest.compatibilityArtifacts[0].operationalPath;
  delete attackerManifest.compatibilityArtifacts[0].operationalPath;
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    /bootstrap snapshot differs/,
    "re-inode must reject a missing schema-v3 bootstrap operationalPath",
  );
  attackerManifest.compatibilityArtifacts[0].operationalPath = "/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json";
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    /bootstrap snapshot differs/,
    "the sealed recovery mirror must not replace the canonical legacy operationalPath descriptor",
  );
  attackerManifest.compatibilityArtifacts[0].operationalPath = canonicalOperationalPath;
  attackerManifest.compatibilityArtifacts[0].extraOperationalPath = canonicalOperationalPath;
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    /bootstrap snapshot differs/,
    "re-inode must reject extra top-level bootstrap descriptor keys",
  );
  delete attackerManifest.compatibilityArtifacts[0].extraOperationalPath;
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  const attackerPayload = "self-declared-untrusted-generated-artifact\n";
  await writeFile(join(source.appPath, "dist", "bootstrap-snapshot.json.attacker"), attackerPayload);
  attackerManifest.compatibilityArtifacts[0].generatedPaths.push({
    path: "dist/bootstrap-snapshot.json.attacker",
    sha256: sha256(attackerPayload),
  });
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    /generated bootstrap artifact set differs/,
    "a mutable manifest must not be able to self-declare another digest exclusion",
  );
  attackerManifest.compatibilityArtifacts[0].generatedPaths.pop();
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await rm(join(source.appPath, "dist", "bootstrap-snapshot.json.attacker"));

  attackerManifest.compatibilityArtifacts.push({
    id: "self-declared-extra",
    sha256: "0".repeat(64),
    stagedPaths: ["dist/self-declared-extra"],
    generatedPaths: [],
  });
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    /exactly one compatibility artifact/,
    "re-inode must reject an extra manifest compatibility descriptor before preparing a transaction",
  );
  attackerManifest.compatibilityArtifacts.pop();
  attackerManifest.schemaVersion = 2;
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);
  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    /schema must be exactly version 3/,
    "re-inode must reject schema drift before preparing a transaction",
  );
  attackerManifest.schemaVersion = 3;
  await writeFile(attackerGeneratedPath, `${JSON.stringify(attackerManifest, null, 2)}\n`);

  // The active name is atomically replaced with the fresh copy. A deploy
  // process retaining the old writable fd can only alter the quarantined inode.
  const quarantinePath = join(quarantineRoot, `untrusted-${releaseId}`);
  await rename(source.releasePath, quarantinePath);
  await rename(freshPath, source.releasePath);
  await deployHandle.truncate(0);
  await deployHandle.write("attacker-after-rename\n", 0, "utf8");
  await deployHandle.close();

  assert.equal(await readFile(join(quarantinePath, "app", "src", "fixture.txt"), "utf8"), "attacker-after-rename\n");
  assert.equal(await readFile(sourceRuntimePath, "utf8"), "src-trusted\n");
  await verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors });

  await assert.rejects(
    verifyOutOfBandReleaseAnchors({ releasePath: quarantinePath, anchors: source.anchors }),
    /copied source tree differs/,
    "a pre-open fd mutation must invalidate the quarantined tree",
  );

  const trustedActiveRecord = await buildTrustedActiveRecord({
    currentRecord: {
      schemaVersion: 2,
      releaseId,
      activatedAt: "20260721T043708Z-279884",
      previous: {
        kind: "release-pointer",
        releaseId: "v.1.500.previous",
        target: "/srv/mes/pilot/releases/v.1.500.previous/app",
        legacyPath: null,
      },
      legacyBaseline: {
        schemaVersion: 1,
        kind: "release-pointer",
        releaseId: "v.1.500.legacy",
        target: "/srv/mes/pilot/releases/v.1.500.legacy/app",
        legacyPath: null,
        pinnedAt: "20260720T225039Z-257107",
        manifest: {
          gitCommit: "2".repeat(40),
          appVersion: "v.1.500.legacy",
          sourceTreeSha256: "3".repeat(64),
          distTreeSha256: "4".repeat(64),
          runtimePolicySha256: "5".repeat(64),
        },
        runtimePolicy: {
          schemaVersion: 1,
          policyId: "mes-react-runtime-v1",
          sha256: "5".repeat(64),
          reactSurfaces: [],
        },
      },
    },
    verifiedRelease: await verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
    anchors: source.anchors,
    expectedPreviousReleaseId: "v.1.500.previous",
    expectedLegacyReleaseId: "v.1.500.legacy",
  });
  assert.equal(trustedActiveRecord.releaseId, releaseId);
  assert.equal(trustedActiveRecord.manifest.sourceTreeSha256, source.anchors.expectedSourceSha256);
  assert.deepEqual(trustedActiveRecord.runtimePolicy.reactSurfaces.sort(), ["structureMigrationDiagnostics", "weeklyProductionControl"]);

  const anchoredRecordInput = {
    schemaVersion: 2,
    releaseId,
    activatedAt: "20260721T043708Z-279884",
    previous: trustedActiveRecord.previous,
    legacyBaseline: trustedActiveRecord.legacyBaseline,
  };
  for (const [field, replacement] of [
    ["previous", { ...trustedActiveRecord.previous, releaseId: "v.1.500.attacker", target: "/srv/mes/pilot/releases/v.1.500.attacker/app" }],
    ["legacyBaseline", { ...trustedActiveRecord.legacyBaseline, releaseId: "v.1.500.attacker", target: "/srv/mes/pilot/releases/v.1.500.attacker/app" }],
  ]) {
    await assert.rejects(
      buildTrustedActiveRecord({
        currentRecord: { ...anchoredRecordInput, [field]: replacement },
        verifiedRelease: await verifyOutOfBandReleaseAnchors({ releasePath: source.releasePath, anchors: source.anchors }),
        anchors: source.anchors,
        expectedPreviousReleaseId: "v.1.500.previous",
        expectedLegacyReleaseId: "v.1.500.legacy",
      }),
      /explicit operator anchor/,
      `${field} must be bound to the out-of-band operator identity before any swap`,
    );
  }

  const helperSource = await readFile(new URL("./release-root-reinode-active.mjs", import.meta.url), "utf8");
  assert.match(helperSource, /copyAnchoredAppPayload\(\{ sourceAppPath, targetAppPath: temporaryAppPath \}\)/);
  assert.match(helperSource, /for \(const relativePath of EXPECTED_RUNTIME_INCLUDES\)/);
  assert.match(helperSource, /\["dist", "bootstrap-snapshot\.json"\]/);
  assert.match(helperSource, /join\(temporaryReleasePath, "release-manifest\.json"\)/);
  assert.doesNotMatch(helperSource, /TRUSTED_BIN\.rsync/);
  assert.doesNotMatch(helperSource, /chown[^\n]+sourceReleasePath/);
  assert(helperSource.indexOf("verifyOutOfBandReleaseAnchors({ releasePath: temporaryReleasePath") < helperSource.indexOf("run(TRUSTED_BIN.runuser"), "copied source must be anchored before any unprivileged candidate package action");
  assert.match(helperSource, /"-u", "mes-stage"[\s\S]*TRUSTED_BIN\.npm, "ci", "--omit=dev", "--ignore-scripts"/);
  assert.doesNotMatch(helperSource, /run\(TRUSTED_BIN\.npm/);
  assert.match(helperSource, /await syncTree\(temporaryReleasePath\)[\s\S]*await syncDirectory\(PILOT_RELEASES_ROOT\)[\s\S]*writeDurableTransactionJournal/);
  assert.match(helperSource, /writeDurableFile\(nextActiveRecord[\s\S]*updateJournal\("active-record-prepared"\)/);
  assert.match(helperSource, /ROOT_RELEASE_AUTHORITY_WRAPPER[\s\S]*--busy-policy=fail/);
  assert.match(helperSource, /assertAuthorityLockInherited/);
  assert.match(helperSource, /anchors\.prestart[\s\S]*stop", "--no-block"/);
  const transactionSource = helperSource.slice(
    helperSource.indexOf("export async function executeReinodeSwapTransaction"),
    helperSource.indexOf("async function main()"),
  );
  assert(transactionSource.indexOf("await stopService()") < transactionSource.indexOf("renameFn(sourceReleasePath, quarantinePath)"), "the process must close old file descriptors before the active inode swap");
  assert(transactionSource.indexOf("renameFn(sourceReleasePath, quarantinePath)") < transactionSource.indexOf("renameFn(temporaryReleasePath, sourceReleasePath)"), "untrusted inodes must move to quarantine before the trusted name is installed");
  assert(helperSource.includes("artifactPath: PILOT_ACTIVE_RECORD"));
  assert(helperSource.includes("ROOT_RELEASE_TRUST_ATTESTATION as FIXED_ROOT_RELEASE_TRUST_ATTESTATION"));
  assert(helperSource.includes("ROOT_RELEASE_TRUST_ATTESTATION = FIXED_ROOT_RELEASE_TRUST_ATTESTATION"));
  assert(helperSource.includes('mode === "verify"'));
  assert(helperSource.includes('mode === "recover"'));
  assert(helperSource.includes("VERIFY_ROOT_STAGED_RELEASE"));
  assert(helperSource.includes("RECOVER_PILOT_REINODE_TRANSACTION"));
  assert(helperSource.includes("requireOriginAttestation: true"));
  assert(helperSource.includes("writeDurableTransactionJournal"));
  const activeLineageStart = helperSource.indexOf("const previousAttestation = await verifyPriorReinodeAttestation");
  const activeLineageGate = helperSource.indexOf("assertBootstrapLineageInvariant({", activeLineageStart);
  const preJournalMirrorRefresh = helperSource.indexOf("await refreshPilotBootstrapRecoveryMirror({", activeLineageGate);
  const preJournalBindPublication = helperSource.indexOf("await publishPilotBootstrapBindContract", preJournalMirrorRefresh);
  const firstTemporaryRelease = helperSource.indexOf("const temporaryReleaseId", activeLineageStart);
  const productionJournal = helperSource.indexOf("const journal = {", firstTemporaryRelease);
  assert(activeLineageStart >= 0 && activeLineageGate > activeLineageStart
    && preJournalMirrorRefresh > activeLineageGate
    && preJournalBindPublication > preJournalMirrorRefresh
    && firstTemporaryRelease > preJournalBindPublication
    && productionJournal > firstTemporaryRelease,
  "active/previous/legacy bootstrap equality must fail closed before mirror publication, temporary release preparation and durable journal creation");

  async function runRollbackScenario(failurePhase) {
    const transactionRoot = join(root, `transaction-${failurePhase}`);
    const sourcePath = join(transactionRoot, "release");
    const temporaryPath = join(transactionRoot, "temporary");
    const quarantinePath = join(transactionRoot, "quarantine");
    const failedTrustedPath = join(transactionRoot, "failed-trusted");
    const activeRecordPath = join(transactionRoot, "active-release.json");
    const activeRecordBackup = join(transactionRoot, "active-release.backup.json");
    const nextActiveRecord = join(transactionRoot, "active-release.next.json");
    const failedActiveRecord = join(transactionRoot, "active-release.failed.json");
    const pointerPath = join(transactionRoot, "pointer.txt");
    await mkdir(sourcePath, { recursive: true });
    await mkdir(temporaryPath, { recursive: true });
    await writeFile(join(sourcePath, "identity.txt"), "original-untrusted\n");
    await writeFile(join(temporaryPath, "identity.txt"), "new-trusted\n");
    await writeFile(activeRecordPath, "original-record\n");
    await writeFile(nextActiveRecord, "new-record\n");
    await writeFile(pointerPath, "original-pointer\n");
    const retainedDeployHandle = await open(join(sourcePath, "identity.txt"), "r+");
    let stopCount = 0;
    let startCount = 0;
    await assert.rejects(executeReinodeSwapTransaction({
      mode: "active",
      sourceReleasePath: sourcePath,
      temporaryReleasePath: temporaryPath,
      quarantinePath,
      failedTrustedPath,
      activeRecordPath,
      activeRecordBackup,
      nextActiveRecord,
      failedActiveRecord,
      serviceWasActive: true,
      stopService: async () => { stopCount += 1; },
      startService: async () => {
        startCount += 1;
        if (failurePhase === "start" && startCount === 1) throw new Error("injected start failure");
      },
      installPointer: async (phase) => writeFile(pointerPath, `${phase}-pointer\n`),
      verifyInstalled: async () => {
        await retainedDeployHandle.truncate(0);
        await retainedDeployHandle.write("attacker-after-quarantine\n", 0, "utf8");
        if (failurePhase === "verify") throw new Error("injected verify failure");
      },
      verifyHealth: async () => {
        if (failurePhase === "health") throw new Error("injected health failure");
        return { status: "ok" };
      },
    }), /fail_closed=old_release_quarantined_service_stopped/);
    await retainedDeployHandle.close();
    assert.equal(await readFile(join(sourcePath, "identity.txt"), "utf8"), "new-trusted\n", `${failurePhase}: canonical path must never return to deploy-era inodes`);
    assert.equal(await readFile(join(quarantinePath, "identity.txt"), "utf8"), "attacker-after-quarantine\n", `${failurePhase}: retained fd must affect quarantine only`);
    assert.equal(await readFile(activeRecordPath, "utf8"), "new-record\n", `${failurePhase}: trusted replacement record remains for root recovery`);
    assert.equal(await readFile(pointerPath, "utf8"), "forward-pointer\n", `${failurePhase}: pointer must not return to the mutable old inode`);
    await assert.rejects(readFile(join(failedTrustedPath, "identity.txt")), /ENOENT/);
    await assert.rejects(readFile(failedActiveRecord), /ENOENT/);
    assert(stopCount >= 2, `${failurePhase}: fail-closed handling must stop the selected runtime`);
    assert(startCount <= 1, `${failurePhase}: the deploy-era release must never be restarted`);
  }

  for (const failurePhase of ["verify", "start", "health"]) {
    await runRollbackScenario(failurePhase);
  }

  const inactiveRoot = join(root, "transaction-inactive");
  const inactiveSource = join(inactiveRoot, "release");
  const inactiveTemporary = join(inactiveRoot, "temporary");
  const inactiveQuarantine = join(inactiveRoot, "quarantine");
  const inactiveFailed = join(inactiveRoot, "failed-trusted");
  await mkdir(inactiveSource, { recursive: true });
  await mkdir(inactiveTemporary, { recursive: true });
  await writeFile(join(inactiveSource, "identity.txt"), "inactive-original\n");
  await writeFile(join(inactiveTemporary, "identity.txt"), "inactive-new\n");
  await assert.rejects(executeReinodeSwapTransaction({
    mode: "inactive",
    sourceReleasePath: inactiveSource,
    temporaryReleasePath: inactiveTemporary,
    quarantinePath: inactiveQuarantine,
    failedTrustedPath: inactiveFailed,
    verifyInstalled: async () => { throw new Error("injected inactive verification failure"); },
  }), /rollback=restored/);
  assert.equal(await readFile(join(inactiveSource, "identity.txt"), "utf8"), "inactive-original\n");
  assert.equal(await readFile(join(inactiveFailed, "identity.txt"), "utf8"), "inactive-new\n");

  const journalDirectory = join(root, "journals");
  await mkdir(journalDirectory);
  const durableJournalPath = join(journalDirectory, "transaction.json");
  await writeDurableTransactionJournal({
    journalPath: durableJournalPath,
    journal: { schemaVersion: 1, transactionId: "qa", phase: "prepared" },
  });
  assert.deepEqual(JSON.parse(await readFile(durableJournalPath, "utf8")), {
    schemaVersion: 1,
    transactionId: "qa",
    phase: "prepared",
  });
  assert.equal((await stat(durableJournalPath)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(journalDirectory), ["transaction.json"], "atomic journal must not leave a .next file");

  async function runRecoveryBoundaryScenario(boundary) {
    const transactionRoot = join(root, `recovery-${boundary}`);
    const sourceReleasePath = join(transactionRoot, "release");
    const temporaryReleasePath = join(transactionRoot, "temporary");
    const quarantinePath = join(transactionRoot, "quarantine");
    const failedTrustedPath = join(transactionRoot, "failed-trusted");
    const activeRecordPath = join(transactionRoot, "active-release.json");
    const activeRecordBackup = join(transactionRoot, "active-release.backup.json");
    const nextActiveRecord = join(transactionRoot, "active-release.next.json");
    const failedActiveRecord = join(transactionRoot, "active-release.failed.json");
    const pointerPath = join(transactionRoot, "pointer.txt");
    await mkdir(transactionRoot, { recursive: true });
    const writeTree = async (path, identity) => {
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "identity.txt"), `${identity}\n`);
    };
    if (boundary === "before-old-rename") {
      await writeTree(sourceReleasePath, "old");
      await writeTree(temporaryReleasePath, "trusted");
    } else if (boundary === "after-old-rename") {
      await writeTree(quarantinePath, "old");
      await writeTree(temporaryReleasePath, "trusted");
    } else {
      await writeTree(quarantinePath, "old");
      await writeTree(sourceReleasePath, "trusted");
    }
    await writeFile(activeRecordPath, "old-record\n");
    await writeFile(nextActiveRecord, "trusted-record\n");
    await writeFile(pointerPath, "old-pointer\n");
    const journal = {
      mode: "active",
      phase: "prepared",
      sourceReleasePath,
      temporaryReleasePath,
      quarantinePath,
      failedTrustedPath,
      activeRecordPath,
      activeRecordBackup,
      nextActiveRecord,
      failedActiveRecord,
      serviceWasActive: true,
    };
    let startCount = 0;
    let verifyCount = 0;
    const result = await recoverReinodeTransaction({
      journal,
      stopService: async () => {},
      startService: async () => { startCount += 1; },
      installPointer: async (phase) => writeFile(pointerPath, `${phase}\n`),
      verifyInstalled: async () => {
        verifyCount += 1;
        assert.equal(await readFile(join(sourceReleasePath, "identity.txt"), "utf8"), "trusted\n");
      },
      verifyHealth: async () => {},
      verifyRecovered: async () => {
        assert.equal(await readFile(join(sourceReleasePath, "identity.txt"), "utf8"), "old\n");
      },
      onPhase: async (phase) => { journal.phase = phase; },
    });
    assert.equal(startCount, 1);
    if (boundary === "before-old-rename") {
      assert.equal(result.completedForward, false);
      assert.equal(journal.phase, "recovered");
      assert.equal(await readFile(join(sourceReleasePath, "identity.txt"), "utf8"), "old\n");
      assert.equal(await readFile(join(failedTrustedPath, "identity.txt"), "utf8"), "trusted\n");
      assert.equal(verifyCount, 0);
    } else {
      assert.equal(result.completedForward, true);
      assert.equal(journal.phase, "committed");
      assert.equal(await readFile(join(sourceReleasePath, "identity.txt"), "utf8"), "trusted\n");
      assert.equal(await readFile(activeRecordPath, "utf8"), "trusted-record\n");
      assert.equal(await readFile(join(quarantinePath, "identity.txt"), "utf8"), "old\n");
      assert.equal(verifyCount, 2);
    }
    const second = await recoverReinodeTransaction({ journal });
    assert.equal(second.alreadyRecovered, true, `${boundary}: recovery must be idempotent`);
  }

  for (const boundary of ["before-old-rename", "after-old-rename", "after-trusted-rename"]) {
    await runRecoveryBoundaryScenario(boundary);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Pilot active release root re-inode QA: OK");
