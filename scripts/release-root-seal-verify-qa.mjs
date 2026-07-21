import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ROOT_RELEASE_TRUST_ATTESTATION,
  ROOT_RELEASE_BOOTSTRAP_STAGED_PATHS,
  ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS,
  ROOT_HELPER_BUNDLE_FILES,
  ROOT_SEAL_HELPER_PATH,
  assertTrustedPathChain,
  verifyReleaseRootSeal,
  verifyReleaseTrustAttestation,
  verifyInstalledHelperBundle,
  verifySealedArtifact,
  verifySealedPointer,
} from "./release-root-seal-verify.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function expectRejected(action, pattern, message) {
  let error = null;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  assert(error, message);
  if (pattern) assert(pattern.test(String(error?.message || error)), `${message}: ${error?.message || error}`);
}

const expectedUid = typeof process.getuid === "function" ? process.getuid() : 0;
const expectedGid = typeof process.getgid === "function" ? process.getgid() : 0;
const directory = await realpath(await mkdtemp(join(tmpdir(), "mes-release-root-seal-")));

async function createRelease(releasesRoot, releaseId) {
  const releasePath = join(releasesRoot, releaseId);
  const appPath = join(releasePath, "app");
  await mkdir(join(appPath, "scripts"), { recursive: true });
  await mkdir(join(appPath, "dist"), { recursive: true });
  await mkdir(join(appPath, "node_modules", ".bin"), { recursive: true });
  await mkdir(join(appPath, "node_modules", "demo"), { recursive: true });
  const digest = "a".repeat(64);
  const bootstrapSource = "sealed bootstrap fixture\n";
  const bootstrapGzipSource = "sealed gzip fixture\n";
  const bootstrapBrotliSource = "sealed Brotli fixture\n";
  const bootstrapDigest = createHash("sha256").update(bootstrapSource).digest("hex");
  const bootstrapGzipDigest = createHash("sha256").update(bootstrapGzipSource).digest("hex");
  const bootstrapBrotliDigest = createHash("sha256").update(bootstrapBrotliSource).digest("hex");
  const manifest = {
    schemaVersion: 3,
    releaseId,
    gitCommit: "b".repeat(40),
    sourceTreeSha256: digest,
    distTreeSha256: digest,
    packageLockSha256: digest,
    runtimePolicy: { sha256: digest },
    compatibilityArtifacts: [{
      id: "bootstrap-snapshot",
      sha256: bootstrapDigest,
      operationalPath: "/srv/mes/pilot/runtime/bootstrap-snapshot.json",
      stagedPaths: ROOT_RELEASE_BOOTSTRAP_STAGED_PATHS,
      generatedPaths: [
        { path: ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS[0], sha256: bootstrapGzipDigest },
        { path: ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS[1], sha256: bootstrapBrotliDigest },
      ],
    }],
  };
  const attestation = {
    schemaVersion: 1,
    releaseId,
    gitCommit: manifest.gitCommit,
    sourceTreeSha256: digest,
    distTreeSha256: digest,
    packageLockSha256: digest,
    runtimePolicySha256: digest,
    bootstrapSha256: bootstrapDigest,
    bootstrapGzipSha256: bootstrapGzipDigest,
    bootstrapBrotliSha256: bootstrapBrotliDigest,
    method: "fresh-root-stage",
    installedBy: "root-ssh-clean-published-commit-new-inodes",
  };
  await writeFile(join(releasePath, "release-manifest.json"), `${JSON.stringify(manifest)}\n`);
  await writeFile(join(releasePath, ROOT_RELEASE_TRUST_ATTESTATION), `${JSON.stringify(attestation)}\n`);
  await writeFile(join(appPath, "scripts", "release-verify.mjs"), "// verifier\n");
  await writeFile(join(appPath, "dist", "index.html"), "<!doctype html>\n");
  await writeFile(join(appPath, ROOT_RELEASE_BOOTSTRAP_STAGED_PATHS[0]), bootstrapSource);
  await writeFile(join(appPath, ROOT_RELEASE_BOOTSTRAP_STAGED_PATHS[1]), bootstrapSource);
  await writeFile(join(appPath, ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS[0]), bootstrapGzipSource);
  await writeFile(join(appPath, ROOT_RELEASE_BOOTSTRAP_GENERATED_PATHS[1]), bootstrapBrotliSource);
  await writeFile(join(appPath, "node_modules", "demo", "cli.js"), "// cli\n");
  await symlink("../demo/cli.js", join(appPath, "node_modules", ".bin", "demo"));
  return { releasePath, appPath };
}

try {
  const helperInstallRoot = join(directory, "libexec", "mes");
  const helperBundlesRoot = join(helperInstallRoot, "bundles");
  await mkdir(helperBundlesRoot, { recursive: true });
  const createHelperBundle = async (generation) => {
    const files = Object.fromEntries(ROOT_HELPER_BUNDLE_FILES.map((name) => [
      name,
      createHash("sha256").update(`${generation}:${name}\n`).digest("hex"),
    ]));
    const bundleId = createHash("sha256").update(ROOT_HELPER_BUNDLE_FILES
      .map((name) => `${name} ${files[name]}\n`).join(""))
      .digest("hex");
    const bundlePath = join(helperBundlesRoot, bundleId);
    await mkdir(bundlePath);
    for (const name of ROOT_HELPER_BUNDLE_FILES) {
      await writeFile(join(bundlePath, name), `${generation}:${name}\n`, { mode: 0o555 });
      await chmod(join(bundlePath, name), 0o555);
    }
    await writeFile(join(bundlePath, "helper-bundle.manifest.json"), `${JSON.stringify({
      schemaVersion: 1,
      bundleId,
      files,
    })}\n`, { mode: 0o444 });
    await chmod(join(bundlePath, "helper-bundle.manifest.json"), 0o444);
    return { bundleId, bundlePath };
  };
  const oldHelpers = await createHelperBundle("old");
  const newHelpers = await createHelperBundle("new");
  const helperPointer = join(helperInstallRoot, "active-bundle");
  await symlink(`bundles/${oldHelpers.bundleId}`, helperPointer);
  await verifyInstalledHelperBundle({
    installedRoot: helperInstallRoot,
    expectedUid,
    expectedGid,
  });
  await writeFile(join(oldHelpers.bundlePath, "unmanifested-helper"), "attacker\n", { mode: 0o555 });
  await expectRejected(
    () => verifyInstalledHelperBundle({ installedRoot: helperInstallRoot, expectedUid, expectedGid }),
    /bundle membership/,
    "an unmanifested helper must violate exact bundle membership",
  );
  await rm(join(oldHelpers.bundlePath, "unmanifested-helper"));
  // A fully or partly prepared inactive bundle cannot affect readers until the
  // one active pointer is atomically renamed.
  await rm(join(newHelpers.bundlePath, ROOT_HELPER_BUNDLE_FILES.at(-1)));
  await verifyInstalledHelperBundle({ installedRoot: helperInstallRoot, expectedUid, expectedGid });
  const helperPointerNext = `${helperPointer}.next`;
  await symlink(`bundles/${newHelpers.bundleId}`, helperPointerNext);
  await rename(helperPointerNext, helperPointer);
  await expectRejected(
    () => verifyInstalledHelperBundle({ installedRoot: helperInstallRoot, expectedUid, expectedGid }),
    /bundle membership|regular sealed file|ENOENT/,
    "an incomplete bundle must fail closed if an operator points at it",
  );
  await unlink(helperPointer);
  await symlink(`bundles/${oldHelpers.bundleId}`, helperPointer);

  const contourRoot = join(directory, "srv", "mes", "pilot");
  const releasesRoot = join(contourRoot, "releases");
  const releaseId = "v.1.500.26-sealed";
  await mkdir(releasesRoot, { recursive: true });
  const release = await createRelease(releasesRoot, releaseId);
  const options = {
    expectedUid,
    expectedGid,
    chainStart: directory,
    requireOriginAttestation: true,
  };

  await verifyReleaseRootSeal({
    releasesRoot,
    releaseId,
    appPath: release.appPath,
    ...options,
  });
  await verifyReleaseTrustAttestation({
    releasePath: release.releasePath,
    releaseId,
    expectedUid,
    expectedGid,
  });

  const sealedBootstrapPath = join(release.appPath, ROOT_RELEASE_BOOTSTRAP_STAGED_PATHS[1]);
  const sealedBootstrapSource = await readFile(sealedBootstrapPath);
  await writeFile(sealedBootstrapPath, "tampered private bootstrap bytes\n");
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /sealed bootstrap bytes differ from the origin attestation/,
    "the fixed root seal must hash the actual private bootstrap bytes before candidate code runs",
  );
  await writeFile(sealedBootstrapPath, sealedBootstrapSource);

  const attestationPath = join(release.releasePath, ROOT_RELEASE_TRUST_ATTESTATION);
  const validAttestation = JSON.parse(await readFile(attestationPath, "utf8"));
  await writeFile(attestationPath, `${JSON.stringify({ ...validAttestation, method: "in-place-chown" })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /attestation identity is invalid/,
    "an in-place-chown claim must not satisfy the new-inode origin contract",
  );
  await writeFile(attestationPath, `${JSON.stringify(validAttestation)}\n`);

  const manifestPath = join(release.releasePath, "release-manifest.json");
  const validManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bootstrapArtifact = validManifest.compatibilityArtifacts[0];
  const missingOperationalPath = structuredClone(validManifest);
  delete missingOperationalPath.compatibilityArtifacts[0].operationalPath;
  await writeFile(manifestPath, `${JSON.stringify(missingOperationalPath)}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /canonical bootstrap snapshot/,
    "the root seal must reject a missing bootstrap operationalPath",
  );
  await writeFile(manifestPath, `${JSON.stringify({
    ...validManifest,
    compatibilityArtifacts: [{
      ...bootstrapArtifact,
      operationalPath: "/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json",
    }],
  })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /canonical bootstrap snapshot/,
    "the root seal must reject a recovery implementation path as manifest operationalPath",
  );
  await writeFile(manifestPath, `${JSON.stringify({
    ...validManifest,
    compatibilityArtifacts: [{ ...bootstrapArtifact, unexpected: true }],
  })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /canonical bootstrap snapshot/,
    "the root seal must reject extra top-level bootstrap descriptor keys",
  );
  await writeFile(manifestPath, `${JSON.stringify(validManifest)}\n`);
  await writeFile(manifestPath, `${JSON.stringify({
    ...validManifest,
    compatibilityArtifacts: [bootstrapArtifact, { ...bootstrapArtifact, id: "extra-exclusion" }],
  })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /exactly one schema-v3 compatibility artifact/,
    "an extra compatibility artifact must never extend fixed-root dist exclusions",
  );
  await writeFile(manifestPath, `${JSON.stringify(validManifest)}\n`);

  await writeFile(manifestPath, `${JSON.stringify({
    ...validManifest,
    compatibilityArtifacts: [{
      ...bootstrapArtifact,
      generatedPaths: [...bootstrapArtifact.generatedPaths, {
        path: "dist/bootstrap-snapshot.json.attacker.js",
        sha256: "d".repeat(64),
      }],
    }],
  })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /exactly the gzip and Brotli bootstrap sidecars/,
    "a mutable manifest must not self-authorize an extra generated bootstrap path",
  );
  await writeFile(manifestPath, `${JSON.stringify(validManifest)}\n`);

  await writeFile(attestationPath, `${JSON.stringify({ ...validAttestation, bootstrapGzipSha256: "d".repeat(64) })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /bootstrapGzipSha256 differs from the sealed manifest/,
    "the gzip sidecar digest must be independently anchored in the origin attestation",
  );
  await writeFile(attestationPath, `${JSON.stringify(validAttestation)}\n`);

  await writeFile(attestationPath, `${JSON.stringify({ ...validAttestation, sourceTreeSha256: "c".repeat(64) })}\n`);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /differs from the sealed manifest/,
    "origin attestation digests must match the sealed manifest",
  );
  await writeFile(attestationPath, `${JSON.stringify(validAttestation)}\n`);

  const activePointer = join(contourRoot, "app");
  await symlink(release.appPath, activePointer);
  await verifySealedPointer({
    pointerPath: activePointer,
    expectedTarget: release.appPath,
    ...options,
  });

  const activeRecord = join(releasesRoot, "active-release.json");
  await writeFile(activeRecord, "{}\n");
  await verifySealedArtifact({
    trustedRoot: releasesRoot,
    artifactPath: activeRecord,
    ...options,
  });

  await chmod(join(directory, "srv", "mes"), 0o775);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /permits group\/other writes/,
    "a deploy-writable release-store parent must be rejected",
  );
  await chmod(join(directory, "srv", "mes"), 0o755);

  await expectRejected(
    () => assertTrustedPathChain(releasesRoot, {
      ...options,
      expectedUid: expectedUid + 10000,
    }),
    /owner is/,
    "a deploy-owned path chain must be rejected when root is required",
  );

  await chmod(manifestPath, 0o666);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /release-manifest\.json.*permits group\/other writes/,
    "a writable manifest must be rejected before it can become a trust anchor",
  );
  await chmod(manifestPath, 0o644);

  const verifierPath = join(release.appPath, "scripts", "release-verify.mjs");
  await chmod(verifierPath, 0o775);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /release-verify\.mjs.*permits group\/other writes/,
    "a writable candidate verifier must be rejected",
  );
  await chmod(verifierPath, 0o644);

  const runtimePath = join(release.appPath, "dist", "index.html");
  await chmod(runtimePath, 0o666);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /index\.html.*permits group\/other writes/,
    "a writable runtime leaf must invalidate the recursive seal",
  );
  await chmod(runtimePath, 0o644);

  const escapedLink = join(release.appPath, "node_modules", ".bin", "escape");
  await symlink(join(directory, "outside"), escapedLink);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /escapes its permitted sealed subtree/,
    "a node_modules symlink escape must be rejected",
  );
  await unlink(escapedLink);

  const trackedLink = join(release.appPath, "scripts", "linked-verifier.mjs");
  await symlink("release-verify.mjs", trackedLink);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /outside the permitted symlink subtree/,
    "tracked candidate paths must remain symlink-free",
  );
  await unlink(trackedLink);

  const realAppPath = join(release.releasePath, "app-real");
  await rename(release.appPath, realAppPath);
  await symlink(realAppPath, release.appPath);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: release.appPath, ...options }),
    /outside the permitted symlink subtree|not a real directory|does not resolve to itself/,
    "a candidate app symlink swap must be rejected",
  );
  await unlink(release.appPath);
  await rename(realAppPath, release.appPath);

  const attackerRelease = await createRelease(releasesRoot, "v.1.500.26-attacker");
  await unlink(activePointer);
  await symlink(attackerRelease.appPath, activePointer);
  await expectRejected(
    () => verifySealedPointer({
      pointerPath: activePointer,
      expectedTarget: release.appPath,
      ...options,
    }),
    /resolves to .* expected/,
    "an active pointer swap must be rejected",
  );

  const realReleasesRoot = join(contourRoot, "releases-real");
  await rename(releasesRoot, realReleasesRoot);
  await symlink(realReleasesRoot, releasesRoot);
  await expectRejected(
    () => verifyReleaseRootSeal({ releasesRoot, releaseId, appPath: join(releasesRoot, releaseId, "app"), ...options }),
    /symlink in the trusted path chain|does not resolve to itself/,
    "a symlinked canonical release store must be rejected",
  );

  assert(ROOT_SEAL_HELPER_PATH.startsWith("/usr/local/libexec/mes/"), "production helper must live below the fixed root-owned libexec path");
  console.log("Release root seal verifier QA: OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
