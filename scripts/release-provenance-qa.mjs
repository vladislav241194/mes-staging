import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertNoIgnoredReleaseInputs, collectPublishedGitProvenance } from "./release-provenance.mjs";
import { computeTreeSha } from "./release-tree-sha.mjs";
import { REACT_RUNTIME_SURFACE_IDS } from "./react-runtime-policy.mjs";

const execFile = promisify(execFileCallback);
const commit = "a".repeat(40);
const cachedCommit = "b".repeat(40);
const fetchedCommit = "c".repeat(40);

function assert(value, message) {
  if (!value) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitResult(stdout = "", code = 0, stderr = "") {
  return { stdout, code, stderr };
}

function createGitRunner({ mergeBaseCode = 0, fetchCode = 0, ignoredInputs = "" } = {}) {
  const calls = [];
  const runGit = async (args) => {
    calls.push(args);
    const key = args.join(" ");
    if (key === "rev-parse HEAD") return gitResult(`${commit}\n`);
    if (key === "symbolic-ref --quiet --short HEAD") return gitResult("feat/release\n");
    if (key === "config --get branch.feat/release.remote") return gitResult("origin\n");
    if (key === "config --get branch.feat/release.merge") return gitResult("refs/heads/feat/release\n");
    if (key === "rev-parse --abbrev-ref --symbolic-full-name @{upstream}") return gitResult("origin/feat/release\n");
    if (key === "rev-parse origin/feat/release") return gitResult(`${cachedCommit}\n`);
    if (key === "fetch --quiet --no-tags origin refs/heads/feat/release") {
      return fetchCode === 0 ? gitResult() : gitResult("", fetchCode, "network unavailable");
    }
    if (key === "rev-parse FETCH_HEAD") return gitResult(`${fetchedCommit}\n`);
    if (args[0] === "merge-base") return gitResult("", mergeBaseCode);
    if (args[0] === "ls-files") return gitResult(ignoredInputs);
    return gitResult("", 1, `Unexpected Git command: ${key}`);
  };
  return { runGit, calls };
}

async function expectFailure(action, messagePart) {
  try {
    await action();
  } catch (error) {
    const details = [error?.message, error?.stderr, error?.stdout, error].filter(Boolean).join("\n");
    assert(details.includes(messagePart), `Expected ${messagePart}, got ${details}`);
    return;
  }
  throw new Error(`Expected failure containing: ${messagePart}`);
}

async function verifyManifestContract() {
  const appRoot = await mkdtemp(join(tmpdir(), "mes-release-provenance-qa-"));
  await mkdir(join(appRoot, "dist"));
  await writeFile(join(appRoot, "source.txt"), "source\n");
  await writeFile(join(appRoot, "dist", "index.js"), "dist\n");
  const packageLock = '{"lockfileVersion":3}\n';
  const runtimePolicy = `${JSON.stringify({
    schemaVersion: 1,
    policyId: "qa-runtime-policy",
    surfaces: Object.fromEntries(REACT_RUNTIME_SURFACE_IDS.map((id) => [id, "evaluation"])),
  }, null, 2)}\n`;
  await writeFile(join(appRoot, "package-lock.json"), packageLock);
  await writeFile(join(appRoot, "react-runtime-policy.json"), runtimePolicy);
  const bootstrapSnapshot = "{\"schemaVersion\":1}\n";
  const bootstrapSnapshotGzip = "gzip-fixture\n";
  const bootstrapSnapshotBrotli = "brotli-fixture\n";
  await writeFile(join(appRoot, "bootstrap-snapshot.json"), bootstrapSnapshot);
  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json"), bootstrapSnapshot);
  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json.gz"), bootstrapSnapshotGzip);
  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json.br"), bootstrapSnapshotBrotli);
  const runtimeIncludes = ["source.txt", "package-lock.json", "react-runtime-policy.json"];
  const bootstrapSnapshotArtifact = {
    id: "bootstrap-snapshot",
    sha256: sha256(bootstrapSnapshot),
    stagedPaths: ["bootstrap-snapshot.json", "dist/bootstrap-snapshot.json"],
    generatedPaths: [
      { path: "dist/bootstrap-snapshot.json.gz", sha256: sha256(bootstrapSnapshotGzip) },
      { path: "dist/bootstrap-snapshot.json.br", sha256: sha256(bootstrapSnapshotBrotli) },
    ],
  };
  const manifest = {
    schemaVersion: 3,
    releaseId: "qa-release",
    gitCommit: commit,
    gitProvenance: {
      schemaVersion: 1,
      gitCommit: commit,
      branch: "feat/release",
      remote: "origin",
      upstreamRef: "origin/feat/release",
      upstreamBranchRef: "refs/heads/feat/release",
      upstreamCommit: fetchedCommit,
      verification: "fresh-upstream-fetch",
      verifiedAt: "2026-07-18T00:00:00.000Z",
    },
    runtimeIncludes,
    sourceTreeSha256: await computeTreeSha({ root: appRoot, includes: runtimeIncludes }),
    distTreeSha256: await computeTreeSha({
      root: appRoot,
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
      policyId: "qa-runtime-policy",
      sha256: sha256(runtimePolicy),
    },
    compatibilityArtifacts: [bootstrapSnapshotArtifact],
  };
  const manifestPath = join(appRoot, "release-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const command = ["scripts/release-verify.mjs", `--manifest=${manifestPath}`, `--app-root=${appRoot}`, "--json"];
  const passing = await execFile("node", command, { cwd: process.cwd() });
  const parsed = JSON.parse(passing.stdout);
  assert(parsed.gitProvenanceVerification === "fresh-upstream-fetch", "Verifier must report fresh Git provenance");
  assert(parsed.compatibilityArtifactCount === 1, "Verifier must report the bootstrap compatibility artifact");
  assert(parsed.runtimePolicyId === "qa-runtime-policy", "Verifier must report the packaged React runtime policy");
  assert(parsed.runtimePolicySha256 === sha256(runtimePolicy), "Verifier must report the packaged policy digest");

  manifest.runtimePolicy.path = "../react-runtime-policy.json";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await expectFailure(
    () => execFile("node", command, { cwd: process.cwd() }),
    "Manifest React runtime policy path is unsafe",
  );
  manifest.runtimePolicy.path = "react-runtime-policy.json";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json"), "{\"corrupt\":true}\n");
  await expectFailure(
    () => execFile("node", command, { cwd: process.cwd() }),
    "Compatibility artifact bootstrap-snapshot hash mismatch at dist/bootstrap-snapshot.json",
  );
  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json"), bootstrapSnapshot);

  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json.gz"), "corrupt-generated\n");
  await expectFailure(
    () => execFile("node", command, { cwd: process.cwd() }),
    "Compatibility artifact bootstrap-snapshot generated hash mismatch at dist/bootstrap-snapshot.json.gz",
  );
  await writeFile(join(appRoot, "dist", "bootstrap-snapshot.json.gz"), bootstrapSnapshotGzip);

  await writeFile(join(appRoot, "react-runtime-policy.json"), runtimePolicy.replace('"evaluation"', '"legacy"'));
  await expectFailure(
    () => execFile("node", command, { cwd: process.cwd() }),
    "Release React runtime policy hash mismatch",
  );
  await writeFile(join(appRoot, "react-runtime-policy.json"), runtimePolicy);

  await writeFile(join(appRoot, "package-lock.json"), '{"corrupt":true}\n');
  await expectFailure(
    () => execFile("node", command, { cwd: process.cwd() }),
    "Release package-lock hash mismatch",
  );
  await writeFile(join(appRoot, "package-lock.json"), packageLock);

  manifest.gitProvenance.verification = "cached-upstream";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  await expectFailure(
    () => execFile("node", command, { cwd: process.cwd() }),
    "Manifest Git provenance was not verified against a fresh upstream fetch",
  );

  manifest.gitProvenance.verification = "fresh-upstream-fetch";
  manifest.schemaVersion = 2;
  delete manifest.runtimePolicy;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const schemaTwo = await execFile("node", command, { cwd: process.cwd() });
  assert(JSON.parse(schemaTwo.stdout).runtimePolicyId === "implicit-legacy", "Schema 2 manifests must remain implicit-legacy compatible");

  manifest.schemaVersion = 1;
  delete manifest.gitProvenance;
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const legacy = await execFile("node", command, { cwd: process.cwd() });
  assert(JSON.parse(legacy.stdout).gitProvenanceVerification === "legacy-unverified", "Legacy manifests must remain rollback-compatible");
}

const cached = createGitRunner();
const cachedProvenance = await collectPublishedGitProvenance({ runGit: cached.runGit, refreshRemote: false });
assert(cachedProvenance.verification === "cached-upstream", "Dry runs must use cached upstream provenance");
assert(!cached.calls.some((args) => args[0] === "fetch"), "Dry-run provenance must not require Git-network access");

const fresh = createGitRunner();
const freshProvenance = await collectPublishedGitProvenance({ runGit: fresh.runGit, refreshRemote: true });
assert(freshProvenance.verification === "fresh-upstream-fetch", "Staging must use freshly fetched upstream provenance");
assert(freshProvenance.upstreamCommit === fetchedCommit, "Staging must record the freshly fetched upstream commit");
assert(fresh.calls.some((args) => args[0] === "fetch"), "Staging must fetch the configured upstream branch");

await expectFailure(
  () => collectPublishedGitProvenance({ runGit: createGitRunner({ mergeBaseCode: 1 }).runGit, refreshRemote: false }),
  "not contained in cached upstream",
);
await expectFailure(
  () => collectPublishedGitProvenance({ runGit: createGitRunner({ fetchCode: 128 }).runGit, refreshRemote: true }),
  "Unable to refresh upstream",
);

await assertNoIgnoredReleaseInputs({ runGit: createGitRunner().runGit, sourceIncludes: ["src", "scripts"] });
await expectFailure(
  () => assertNoIgnoredReleaseInputs({
    runGit: createGitRunner({ ignoredInputs: "src/debug-local.js\n" }).runGit,
    sourceIncludes: ["src", "scripts"],
  }),
  "ignored source inputs: src/debug-local.js",
);

const stageSource = await readFile(resolve(process.cwd(), "scripts/release-stage.mjs"), "utf8");
assert(stageSource.includes("collectPublishedGitProvenance"), "Release staging must use the Git provenance guard");
assert(stageSource.includes("refreshRemote: !args.dryRun"), "Only real staging may require live Git remote verification");
assert(stageSource.includes("schemaVersion: 3"), "New staged manifests must carry the runtime-policy provenance schema");
assert(stageSource.includes("runtimePolicySha256") && stageSource.includes("REACT_RUNTIME_POLICY_FILE"), "Release staging must package and hash the React runtime policy");
assert(stageSource.includes("assertReleaseSourceStillMatchesProvenance(gitCommit)"), "Release staging must recheck source provenance after building");
assert(stageSource.includes("prepareLocalBootstrapSnapshotArtifact"), "Release staging must materialize the external bootstrap snapshot for clean local builds");
assert(stageSource.includes("await localBootstrapSnapshot.cleanup()"), "Release staging must remove the temporary local bootstrap snapshot before provenance is rechecked");
assert(stageSource.includes("assertLocalDistBootstrapSnapshotArtifact"), "Release staging must verify the built bootstrap artifact before digesting dist");
assert(stageSource.includes("BOOTSTRAP_SNAPSHOT_GENERATED_PATHS"), "Release staging must classify compressed bootstrap sidecars as compatibility artifacts");
assert(stageSource.includes("bootstrapSnapshotArtifact.generatedPaths = await collectGeneratedCompatibilityArtifacts"), "Release staging must record compressed bootstrap sidecar digests in the manifest");
assert(
  stageSource.indexOf("await localBootstrapSnapshot.cleanup()") < stageSource.indexOf("await assertReleaseSourceStillMatchesProvenance(gitCommit)"),
  "Release staging must clean the temporary bootstrap artifact before rechecking Git provenance",
);
assert(
  (stageSource.match(/treeSha\(\["dist"\], \{ excludes: distCompatibilityExcludes \}\)/g) || []).length === 2,
  "Both deterministic dist hashes must exclude the external bootstrap compatibility artifact",
);

await verifyManifestContract();
console.log("Release provenance QA: OK");
