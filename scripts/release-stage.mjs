#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertNoIgnoredReleaseInputs, collectPublishedGitProvenance } from "./release-provenance.mjs";
import {
  REACT_RUNTIME_POLICY_FILE,
  normalizeReactRuntimePolicy,
} from "./react-runtime-policy.mjs";
import {
  SPECIFICATIONS2_COMMAND_MARKER_PATH,
  buildSpecifications2CommandManifestContract,
  validateSpecifications2CandidateManifest,
} from "./release-specifications2-command-contract.mjs";
import {
  NOMENCLATURE_COMMAND_MARKER_PATH,
  buildNomenclatureCommandManifestContract,
  validateNomenclatureCandidateManifest,
} from "./release-nomenclature-command-contract.mjs";
import {
  SYSTEM_DOMAINS_COMMAND_MARKER_PATH,
  buildSystemDomainsCommandManifestContract,
  validateSystemDomainsCandidateManifest,
} from "./release-system-domains-command-contract.mjs";
import {
  SHIFT_EXECUTION_COMMAND_MARKER_PATH,
  buildShiftExecutionCommandManifestContract,
  validateShiftExecutionCandidateManifest,
} from "./release-shift-execution-command-contract.mjs";
import {
  DIRECTORY_CLUSTER_COMMAND_MARKER_PATH,
  buildDirectoryClusterCommandManifestContract,
  validateDirectoryClusterCandidateManifest,
} from "./release-directory-cluster-command-contract.mjs";
import {
  PILOT_RELEASES_ROOT,
  assertCanonicalPilotReleasePath,
  buildPilotReleaseSealCommand,
  buildPilotReleaseTrustVerificationCommand,
  buildPilotRootTrustPreflightCommand,
  resolveReleaseStageRemote,
} from "./release-root-stage-policy.mjs";
import {
  ROOT_PUBLIC_RELEASE_VERIFIER_PATH,
  ROOT_SEAL_HELPER_PATH,
} from "./release-root-seal-verify.mjs";
import {
  ROOT_REINODE_HELPER_PATH,
  ROOT_RELEASE_TRUST_ATTESTATION,
} from "./release-root-reinode-active.mjs";
import { materializePublishedGitSnapshot } from "./release-immutable-source.mjs";
import { bootstrapPublishedPilotRootTrust } from "./pilot-root-trust-bootstrap.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];

const CONTOURS = {
  pilot: {
    appEnv: "pilot",
    appPath: "/srv/mes/pilot/app",
    releasesPath: "/srv/mes/pilot/releases",
    service: "mes-pilot",
    url: "https://pilot.mes-line.ru",
    port: "4175",
    sharedStateDir: "/srv/mes/pilot/shared-state",
    backupDir: "/srv/mes/pilot/backups",
    auditLogPath: "/srv/mes/pilot/audit/audit.log",
    bootstrapSnapshotPath: "/srv/mes/pilot/bootstrap-recovery/bootstrap-snapshot.json",
    bootstrapOperationalPath: "/srv/mes/pilot/runtime/bootstrap-snapshot.json",
  },
  staging: {
    appEnv: "staging",
    appPath: "/srv/mes/dev/app",
    releasesPath: "/srv/mes/dev/releases",
    service: "mes-dev",
    url: "https://staging.mes-line.ru",
    port: "4174",
    sharedStateDir: "/srv/mes/dev/shared-state",
    backupDir: "/srv/mes/dev/backups",
    auditLogPath: "/srv/mes/dev/audit/audit.log",
    bootstrapSnapshotPath: "/srv/mes/dev/runtime/bootstrap-snapshot.json",
    bootstrapOperationalPath: "/srv/mes/dev/runtime/bootstrap-snapshot.json",
  },
};

// Runtime data is external to each release (MES_SHARED_STATE_DIR, backups,
// audit log, PostgreSQL). This allowlist is the reproducible code artifact.
const RUNTIME_DIRECTORIES = ["src", "styles", "scripts", "assets", "ops", "db"];
const RUNTIME_FILES = [
  "app-version.json",
  "index.html",
  "styles.css",
  "favicon.svg",
  "server.js",
  "package.json",
  "package-lock.json",
  REACT_RUNTIME_POLICY_FILE,
  "mes-planning-prototype.png",
  "vercel.json",
];
const SOURCE_INCLUDES = [...RUNTIME_DIRECTORIES, ...RUNTIME_FILES];
const BOOTSTRAP_SNAPSHOT_GENERATED_PATHS = [
  "dist/bootstrap-snapshot.json.gz",
  "dist/bootstrap-snapshot.json.br",
];
const FIXED_ROOT_ACTIVATE_RUNNER = "/usr/local/libexec/mes/active-bundle/release-activate-root.mjs";
const FIXED_ROOT_ROLLBACK_RUNNER = "/usr/local/libexec/mes/active-bundle/release-rollback-root.mjs";
const FIXED_ROOT_SWITCH_JOURNAL = "/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs";
const PILOT_FIXED_ROOT_RUNNER_MAPPINGS = Object.freeze([
  { sourceRelativePath: "scripts/release-activate.mjs", fixedPath: FIXED_ROOT_ACTIVATE_RUNNER },
  { sourceRelativePath: "scripts/release-rollback.mjs", fixedPath: FIXED_ROOT_ROLLBACK_RUNNER },
  { sourceRelativePath: "scripts/release-switch-journal.mjs", fixedPath: FIXED_ROOT_SWITCH_JOURNAL },
]);
const transientCleanups = [];

function registerTransientCleanup(cleanup) {
  transientCleanups.push(cleanup);
}

async function cleanupTransientArtifacts() {
  const errors = [];
  for (const cleanup of transientCleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  if (errors.length > 0) throw new Error(`Unable to clean release staging artifacts: ${errors.join("; ")}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseArgs(argv) {
  const args = { contour: "pilot", remote: "", releaseId: "", dryRun: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "release-id") args.releaseId = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else throw new Error(`Unknown option: --${key}`);
  }
  return args;
}

function safeReleaseId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) throw new Error("release id is required");
  return normalized;
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function run(command, args, { cwd = projectRoot, allowFailure = false } = {}) {
  const startedAt = performance.now();
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { command: [command, ...args].join(" "), code, stdout, stderr, durationMs: performance.now() - startedAt };
      if (code !== 0 && !allowFailure) {
        const error = new Error(`${result.command} failed with code ${code}`);
        error.result = result;
        reject(error);
        return;
      }
      resolvePromise(result);
    });
  });
}

function sshArgs(remote, command) {
  return [...sshOptions, remote, command];
}

function rsyncSshTransport() {
  return ["ssh", ...sshOptions.map(shellQuote)].join(" ");
}

function preflightEnvironment(contour) {
  const values = {
    APP_ENV: contour.appEnv,
    PORT: contour.port,
    APP_BASE_URL: contour.url,
    MES_ALLOW_DESTRUCTIVE_ACTIONS: "false",
    MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE: "false",
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
}

async function gitText(args) {
  const result = await run("git", args);
  return result.stdout.trim();
}

async function runGit(args) {
  return await run("git", args, { allowFailure: true });
}

async function assertCleanGitWorktree() {
  const status = await gitText(["status", "--porcelain"]);
  if (status) throw new Error("Refusing release staging from a dirty Git worktree");
}

async function assertReleaseSourceStillMatchesProvenance(gitCommit) {
  await assertCleanGitWorktree();
  await assertNoIgnoredReleaseInputs({ runGit, sourceIncludes: SOURCE_INCLUDES });
  await assertNoTrackedRuntimeSymlinks();
  const currentCommit = await gitText(["rev-parse", "HEAD"]);
  if (currentCommit !== gitCommit) {
    throw new Error(`Refusing release staging: Git HEAD changed during the build (${gitCommit} -> ${currentCommit})`);
  }
}

async function assertNoTrackedRuntimeSymlinks() {
  const indexEntries = await gitText(["ls-files", "-s", "--", ...SOURCE_INCLUDES]);
  const symlinkPaths = indexEntries
    .split(/\r?\n/)
    .filter((line) => line.startsWith("120000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1))
    .filter(Boolean);
  if (symlinkPaths.length > 0) {
    throw new Error(`Refusing release staging with tracked runtime symlinks: ${symlinkPaths.join(", ")}`);
  }
}

async function assertLocalDistHasNoSymlinks(root = projectRoot) {
  const result = await run("find", ["dist", "-type", "l", "-print", "-quit"], { cwd: root });
  const symlinkPath = result.stdout.trim();
  if (symlinkPath) throw new Error(`Refusing release staging with a generated dist symlink: ${symlinkPath}`);
}

async function treeSha(includes, { excludes = [], cwd = projectRoot } = {}) {
  const args = [
    "scripts/release-tree-sha.mjs",
    ...includes.map((value) => `--include=${value}`),
    ...excludes.map((value) => `--exclude=${value}`),
  ];
  return (await run("node", args, { cwd })).stdout.trim();
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function stagePath(remote, sourcePaths, target, {
  deleteTarget = false,
  dryRun = false,
  cwd = projectRoot,
} = {}) {
  const args = ["-azc", "-e", rsyncSshTransport(), "--itemize-changes"];
  if (deleteTarget) args.push("--delete");
  if (dryRun) args.push("--dry-run");
  args.push(...sourcePaths, target);
  return await run("rsync", args, { cwd });
}

function pilotFixedReleaseSealVerificationCommand(releaseId, releasePath, releaseAppPath) {
  return [
    "set -euo pipefail",
    [
      `node ${shellQuote(ROOT_SEAL_HELPER_PATH)} release`,
      `--releases-root=${shellQuote(PILOT_RELEASES_ROOT)}`,
      `--release-id=${shellQuote(releaseId)}`,
      `--app=${shellQuote(releaseAppPath)}`,
    ].join(" "),
    `test ${shellQuote(releasePath)} = ${shellQuote(`${PILOT_RELEASES_ROOT}/${releaseId}`)}`,
  ].join("\n");
}

async function downloadPinnedBootstrapSnapshot({ contour, remote }) {
  const externalPath = contour.bootstrapSnapshotPath;
  const remoteCommand = [
    "set -euo pipefail",
    `artifact=${shellQuote(externalPath)}`,
    ...(externalPath === CONTOURS.pilot.bootstrapSnapshotPath ? [
      "bootstrap_bind=/etc/systemd/system/mes-pilot.service.d/06-bootstrap-snapshot-bind.conf",
      'if [ ! -e "$artifact" ] && [ ! -L "$artifact" ]; then',
      '  if [ -e "$bootstrap_bind" ] || [ -L "$bootstrap_bind" ]; then',
      '    echo "Pilot bootstrap mirror is absent but its mandatory systemd bind is still published; refusing an unsafe first-run state." >&2',
      "    exit 76",
      "  fi",
      '  echo "Pilot bootstrap mirror is not initialized. Root trust bootstrap intentionally left the bind unpublished, so Pilot remains restartable." >&2',
      '  echo "Run the documented active-release re-inode with explicit out-of-band anchors, then rerun release:stage." >&2',
      "  exit 78",
      "fi",
    ] : []),
    "test -f \"$artifact\" && test ! -L \"$artifact\"",
    "test \"$(readlink -f -- \"$artifact\")\" = \"$artifact\"",
    "node --input-type=module -e 'JSON.parse(await (await import(\"node:fs/promises\")).readFile(process.argv[1], \"utf8\"));' \"$artifact\"",
  ].join("\n");
  await run("ssh", sshArgs(remote, remoteCommand));

  // The root-sealed source is downloaded exactly once. Every build and both
  // candidate destinations use these pinned local bytes; a later release
  // switch cannot change the candidate under construction. The schema-v3
  // descriptor deliberately retains the legacy operational runtime path.
  const downloadDir = await mkdtemp(join(tmpdir(), "mes-release-bootstrap-pinned-"));
  const pinnedPath = join(downloadDir, "bootstrap-snapshot.json");
  registerTransientCleanup(async () => rm(downloadDir, { recursive: true, force: true }));
  await run("scp", [...sshOptions, `${remote}:${externalPath}`, pinnedPath]);
  JSON.parse(await readFile(pinnedPath, "utf8"));
  await chmod(pinnedPath, 0o400);
  const pinnedSha256 = await sha256(pinnedPath);
  return {
    id: "bootstrap-snapshot",
    sha256: pinnedSha256,
    operationalPath: contour.bootstrapOperationalPath,
    stagedPaths: ["bootstrap-snapshot.json", "dist/bootstrap-snapshot.json"],
    pinnedPath,
  };
}

async function installPinnedBootstrapSnapshotArtifact({ artifact, remote, releaseAppPath }) {
  await stagePath(remote, [artifact.pinnedPath], `${remote}:${releaseAppPath}/bootstrap-snapshot.json`);
  await stagePath(remote, [artifact.pinnedPath], `${remote}:${releaseAppPath}/dist/bootstrap-snapshot.json`);
  const remoteCommand = [
    "set -euo pipefail",
    `expected_sha256=${shellQuote(artifact.sha256)}`,
    `release_app=${shellQuote(releaseAppPath)}`,
    "for staged_path in \"$release_app/bootstrap-snapshot.json\" \"$release_app/dist/bootstrap-snapshot.json\"; do",
    "  test -f \"$staged_path\"",
    "  actual_sha256=\"$(sha256sum \"$staged_path\" | awk '{print $1}')\"",
    "  if [ \"$actual_sha256\" != \"$expected_sha256\" ]; then echo \"Pinned bootstrap digest mismatch at $staged_path\" >&2; exit 76; fi",
    "done",
    "for private_path in \"$release_app/bootstrap-snapshot.json\" \"$release_app/dist/bootstrap-snapshot.json\" \"$release_app/dist/bootstrap-snapshot.json.gz\" \"$release_app/dist/bootstrap-snapshot.json.br\"; do",
    "  test -f \"$private_path\" && test ! -L \"$private_path\"",
    "  chmod 0400 \"$private_path\"",
    "  test \"$(stat -c '%a' \"$private_path\")\" = 400",
    "done",
  ].join("\n");
  await run("ssh", sshArgs(remote, remoteCommand));
}

async function assertLocalDistBootstrapSnapshotArtifact(artifact, root = projectRoot) {
  const distPath = join(root, "dist", "bootstrap-snapshot.json");
  if (await sha256(distPath) !== artifact.sha256) {
    throw new Error("Built dist bootstrap snapshot does not match the pinned artifact");
  }
}

async function collectGeneratedCompatibilityArtifacts(paths, root = projectRoot) {
  return await Promise.all(paths.map(async (path) => ({
    path,
    sha256: await sha256(join(root, path)),
  })));
}

async function installPinnedBootstrapIntoSnapshot({ sourceRoot, artifact }) {
  const localPath = join(sourceRoot, "bootstrap-snapshot.json");
  try {
    await access(localPath);
    throw new Error("Refusing release staging when the published Git snapshot contains bootstrap-snapshot.json");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await copyFile(artifact.pinnedPath, localPath);
  if (await sha256(localPath) !== artifact.sha256) {
    throw new Error("Git snapshot bootstrap copy differs from the pinned artifact");
  }
}

async function installPinnedBootstrapIntoWorkspaceForQa(artifact) {
  const localPath = join(projectRoot, "bootstrap-snapshot.json");
  try {
    await access(localPath);
    throw new Error("Refusing release staging with a pre-existing workspace bootstrap-snapshot.json");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await copyFile(artifact.pinnedPath, localPath);
  if (await sha256(localPath) !== artifact.sha256) {
    throw new Error("Workspace QA bootstrap copy differs from the pinned artifact");
  }
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(localPath, { force: true });
  };
  registerTransientCleanup(cleanup);
  return cleanup;
}

function fixedContentVerificationCommand({ releaseId, anchors }) {
  return [
    `node ${shellQuote(ROOT_REINODE_HELPER_PATH)}`,
    "--mode=verify",
    `--release-id=${shellQuote(releaseId)}`,
    `--expected-git-commit=${shellQuote(anchors.expectedGitCommit)}`,
    `--expected-source-sha256=${shellQuote(anchors.expectedSourceSha256)}`,
    `--expected-dist-sha256=${shellQuote(anchors.expectedDistSha256)}`,
    `--expected-package-lock-sha256=${shellQuote(anchors.expectedPackageLockSha256)}`,
    `--expected-runtime-policy-sha256=${shellQuote(anchors.expectedRuntimePolicySha256)}`,
    `--expected-bootstrap-sha256=${shellQuote(anchors.expectedBootstrapSha256)}`,
    `--expected-bootstrap-gzip-sha256=${shellQuote(anchors.expectedBootstrapGzipSha256)}`,
    `--expected-bootstrap-brotli-sha256=${shellQuote(anchors.expectedBootstrapBrotliSha256)}`,
    "--confirm=VERIFY_ROOT_STAGED_RELEASE",
  ].join(" ");
}

function fixedActivePilotReleaseVerificationCommand() {
  return [
    "set -euo pipefail",
    `active_app=${shellQuote(CONTOURS.pilot.appPath)}`,
    `releases_root=${shellQuote(CONTOURS.pilot.releasesPath)}`,
    `root_seal_helper=${shellQuote(ROOT_SEAL_HELPER_PATH)}`,
    'test -L "$active_app"',
    'active_target="$(readlink -f -- "$active_app")"',
    'active_release_path="$(dirname -- "$active_target")"',
    'active_release_id="$(basename -- "$active_release_path")"',
    'test "$active_target" = "$releases_root/$active_release_id/app"',
    '/usr/bin/node "$root_seal_helper" bundle >/dev/null',
    '/usr/bin/node "$root_seal_helper" release --releases-root="$releases_root" --release-id="$active_release_id" --app="$active_target" >/dev/null',
    '/usr/bin/node "$root_seal_helper" pointer --pointer="$active_app" --expected-target="$active_target" >/dev/null',
    '/usr/bin/node "$root_seal_helper" artifact --trusted-root="$releases_root" --artifact="$releases_root/active-release.json" >/dev/null',
    '/usr/bin/node --input-type=module - "$releases_root/active-release.json" "$active_release_id" <<\'NODE\'',
    'import { readFile } from "node:fs/promises";',
    'const [recordPath, expectedReleaseId] = process.argv.slice(2);',
    'const record = JSON.parse(await readFile(recordPath, "utf8"));',
    'if (record?.releaseId !== expectedReleaseId) throw new Error("Active release record differs from the sealed pointer");',
    "NODE",
    "printf '%s\\n' ACTIVE_RELEASE_ROOT_SEAL_OK",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);
  args.remote = resolveReleaseStageRemote(args.contour, args.remote);

  await assertCleanGitWorktree();
  await assertNoIgnoredReleaseInputs({ runGit, sourceIncludes: SOURCE_INCLUDES });
  await assertNoTrackedRuntimeSymlinks();
  const gitProvenance = await collectPublishedGitProvenance({
    runGit,
    // A dry run remains useful without Git-network access. A real staged
    // release must verify that HEAD is on the freshly fetched upstream branch.
    refreshRemote: !args.dryRun,
  });
  const { gitCommit } = gitProvenance;
  const gitCommitShort = gitCommit.slice(0, 7);
  const publishedSnapshot = await materializePublishedGitSnapshot({ projectRoot, gitCommit });
  registerTransientCleanup(publishedSnapshot.cleanup);
  const sourceRoot = publishedSnapshot.root;
  const version = JSON.parse(await readFile(join(sourceRoot, "app-version.json"), "utf8")).version;
  const specifications2CommandMarkerSource = await readFile(
    join(sourceRoot, SPECIFICATIONS2_COMMAND_MARKER_PATH),
    "utf8",
  );
  const specifications2CommandCompatibility = buildSpecifications2CommandManifestContract(
    specifications2CommandMarkerSource,
  );
  const nomenclatureCommandMarkerSource = await readFile(
    join(sourceRoot, NOMENCLATURE_COMMAND_MARKER_PATH),
    "utf8",
  );
  const nomenclatureCommandCompatibility = buildNomenclatureCommandManifestContract(
    nomenclatureCommandMarkerSource,
  );
  const systemDomainsCommandMarkerSource = await readFile(
    join(sourceRoot, SYSTEM_DOMAINS_COMMAND_MARKER_PATH),
    "utf8",
  );
  const systemDomainsCommandCompatibility = buildSystemDomainsCommandManifestContract(
    systemDomainsCommandMarkerSource,
  );
  const shiftExecutionCommandMarkerSource = await readFile(
    join(sourceRoot, SHIFT_EXECUTION_COMMAND_MARKER_PATH),
    "utf8",
  );
  const shiftExecutionCommandCompatibility = buildShiftExecutionCommandManifestContract(
    shiftExecutionCommandMarkerSource,
  );
  const directoryClusterCommandMarkerSource = await readFile(
    join(sourceRoot, DIRECTORY_CLUSTER_COMMAND_MARKER_PATH),
    "utf8",
  );
  const directoryClusterCommandCompatibility = buildDirectoryClusterCommandManifestContract(
    directoryClusterCommandMarkerSource,
  );
  const releaseId = safeReleaseId(args.releaseId || `${version}-${gitCommitShort}`);
  const releasePath = `${contour.releasesPath}/${releaseId}`;
  const releaseAppPath = `${releasePath}/app`;
  if (args.contour === "pilot") assertCanonicalPilotReleasePath(releasePath);
  const startedAt = performance.now();

  console.log(`MES staged release${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- remote: ${args.remote}`);
  console.log(`- release: ${releaseId}`);
  console.log(`- commit: ${gitCommit}`);
  console.log(`- Git provenance: ${gitProvenance.verification} (${gitProvenance.upstreamRef} @ ${gitProvenance.upstreamCommit})`);

  if (args.dryRun) {
    console.log(`- would build immutable Git-object source inputs and upload ${SOURCE_INCLUDES.join(", ")} plus dist/`);
    console.log(`- would pin the root-sealed bootstrap source at ${contour.bootstrapSnapshotPath}`);
    console.log(`- would stage into ${releaseAppPath} without changing ${contour.appPath}`);
    return;
  }

  if (args.contour === "pilot") {
    if (PILOT_FIXED_ROOT_RUNNER_MAPPINGS.length !== 3) {
      throw new Error("Pilot fixed root runner mapping contract is incomplete");
    }
    await bootstrapPublishedPilotRootTrust({
      root: projectRoot,
      remote: args.remote,
      gitCommit,
      provenanceVerification: gitProvenance.verification,
    });
    await run("ssh", sshArgs(args.remote, buildPilotRootTrustPreflightCommand()));
  }
  const remoteExists = await run("ssh", sshArgs(args.remote, `test ! -e ${shellQuote(releasePath)}`), { allowFailure: true });
  if (remoteExists.code !== 0) throw new Error(`Release path already exists: ${releasePath}`);

  const bootstrapSnapshotArtifact = await downloadPinnedBootstrapSnapshot({ contour, remote: args.remote });
  await installPinnedBootstrapIntoSnapshot({ sourceRoot, artifact: bootstrapSnapshotArtifact });
  const distCompatibilityExcludes = bootstrapSnapshotArtifact.stagedPaths
    .filter((path) => path.startsWith("dist/"))
    .concat(BOOTSTRAP_SNAPSHOT_GENERATED_PATHS);
  const cleanupWorkspaceBootstrap = await installPinnedBootstrapIntoWorkspaceForQa(bootstrapSnapshotArtifact);
  try {
    await run("npm", ["ci"]);
    await run("npm", ["run", "qa:stabilize"]);
  } finally {
    await cleanupWorkspaceBootstrap();
  }
  await run("npm", ["ci", "--ignore-scripts"], { cwd: sourceRoot });
  const sourceTreeBeforeBuild = await treeSha(SOURCE_INCLUDES, { cwd: sourceRoot });
  await run("npm", ["run", "build"], { cwd: sourceRoot });
  await assertLocalDistBootstrapSnapshotArtifact(bootstrapSnapshotArtifact, sourceRoot);
  await assertLocalDistHasNoSymlinks(sourceRoot);
  const firstDistTreeSha256 = await treeSha(["dist"], {
    excludes: distCompatibilityExcludes,
    cwd: sourceRoot,
  });
  await run("npm", ["run", "build"], { cwd: sourceRoot });
  await assertLocalDistBootstrapSnapshotArtifact(bootstrapSnapshotArtifact, sourceRoot);
  await assertLocalDistHasNoSymlinks(sourceRoot);
  const secondDistTreeSha256 = await treeSha(["dist"], {
    excludes: distCompatibilityExcludes,
    cwd: sourceRoot,
  });
  if (firstDistTreeSha256 !== secondDistTreeSha256) {
    throw new Error("Refusing non-deterministic build output; the two dist digests differ");
  }
  bootstrapSnapshotArtifact.generatedPaths = await collectGeneratedCompatibilityArtifacts(
    BOOTSTRAP_SNAPSHOT_GENERATED_PATHS,
    sourceRoot,
  );
  await assertReleaseSourceStillMatchesProvenance(gitCommit);
  const sourceTreeSha256 = await treeSha(SOURCE_INCLUDES, { cwd: sourceRoot });
  if (sourceTreeSha256 !== sourceTreeBeforeBuild) {
    throw new Error("Refusing build tooling that changes the immutable published source payload");
  }
  const distTreeSha256 = secondDistTreeSha256;
  const packageLockSha256 = await sha256(join(sourceRoot, "package-lock.json"));
  const runtimePolicySource = await readFile(join(sourceRoot, REACT_RUNTIME_POLICY_FILE), "utf8");
  const runtimePolicySha256 = createHash("sha256").update(runtimePolicySource).digest("hex");
  const runtimePolicy = normalizeReactRuntimePolicy(JSON.parse(runtimePolicySource), {
    sha256Digest: runtimePolicySha256,
    source: REACT_RUNTIME_POLICY_FILE,
  });
  const manifest = {
    schemaVersion: 3,
    releaseId,
    createdAt: new Date().toISOString(),
    contour: args.contour,
    gitCommit,
    gitProvenance: {
      schemaVersion: 1,
      ...gitProvenance,
      verifiedAt: new Date().toISOString(),
    },
    appVersion: version,
    runtimeIncludes: SOURCE_INCLUDES,
    sourceTreeSha256,
    distTreeSha256,
    packageLockSha256,
    runtimePolicy: {
      schemaVersion: runtimePolicy.schemaVersion,
      path: REACT_RUNTIME_POLICY_FILE,
      policyId: runtimePolicy.policyId,
      sha256: runtimePolicySha256,
    },
    specifications2CommandCompatibility,
    nomenclatureCommandCompatibility,
    systemDomainsCommandCompatibility,
    shiftExecutionCommandCompatibility,
    directoryClusterCommandCompatibility,
    compatibilityArtifacts: [{
      id: bootstrapSnapshotArtifact.id,
      sha256: bootstrapSnapshotArtifact.sha256,
      operationalPath: bootstrapSnapshotArtifact.operationalPath,
      stagedPaths: bootstrapSnapshotArtifact.stagedPaths,
      generatedPaths: bootstrapSnapshotArtifact.generatedPaths,
    }],
    verification: {
      localBuild: "workspace QA plus immutable Git-object npm ci --ignore-scripts and two matching builds",
      remotePreflight: "fixed root helper verifies explicit digests before npm ci --omit=dev --ignore-scripts and server:preflight",
      activation: "not activated by stage command",
    },
  };
  validateSpecifications2CandidateManifest(manifest, specifications2CommandMarkerSource);
  validateNomenclatureCandidateManifest(manifest, nomenclatureCommandMarkerSource);
  validateSystemDomainsCandidateManifest(manifest, systemDomainsCommandMarkerSource);
  validateShiftExecutionCandidateManifest(manifest, shiftExecutionCommandMarkerSource);
  validateDirectoryClusterCandidateManifest(manifest, directoryClusterCommandMarkerSource);
  const manifestDir = await mkdtemp(join(tmpdir(), "mes-release-manifest-"));
  registerTransientCleanup(async () => rm(manifestDir, { recursive: true, force: true }));
  const manifestPath = join(manifestDir, "release-manifest.json");
  const rootTrustAttestationPath = join(manifestDir, ROOT_RELEASE_TRUST_ATTESTATION);
  const bootstrapGzipSha256 = bootstrapSnapshotArtifact.generatedPaths.find(
    (artifact) => artifact.path === "dist/bootstrap-snapshot.json.gz",
  )?.sha256;
  const bootstrapBrotliSha256 = bootstrapSnapshotArtifact.generatedPaths.find(
    (artifact) => artifact.path === "dist/bootstrap-snapshot.json.br",
  )?.sha256;
  if (!bootstrapGzipSha256 || !bootstrapBrotliSha256) {
    throw new Error("Root trust attestation requires exact gzip and Brotli bootstrap digests");
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(rootTrustAttestationPath, `${JSON.stringify({
    schemaVersion: 1,
    releaseId,
    gitCommit,
    sourceTreeSha256,
    distTreeSha256,
    packageLockSha256,
    runtimePolicySha256,
    bootstrapSha256: bootstrapSnapshotArtifact.sha256,
    bootstrapGzipSha256,
    bootstrapBrotliSha256,
    method: "fresh-root-stage",
    installedBy: "root-ssh-clean-published-commit-new-inodes",
  }, null, 2)}\n`);

  const fixedContentAnchors = {
    expectedGitCommit: gitCommit,
    expectedSourceSha256: sourceTreeSha256,
    expectedDistSha256: distTreeSha256,
    expectedPackageLockSha256: packageLockSha256,
    expectedRuntimePolicySha256: runtimePolicySha256,
    expectedBootstrapSha256: bootstrapSnapshotArtifact.sha256,
    expectedBootstrapGzipSha256: bootstrapGzipSha256,
    expectedBootstrapBrotliSha256: bootstrapBrotliSha256,
  };

  const createReleaseCommand = args.contour === "pilot"
    ? `install -d -o root -g root -m 0755 ${shellQuote(releaseAppPath)} && test -d ${shellQuote(releaseAppPath)}`
    : [`mkdir -p ${shellQuote(releaseAppPath)}`, `test -d ${shellQuote(releaseAppPath)}`].join(" && ");
  await run("ssh", sshArgs(args.remote, createReleaseCommand));

  // Pilot bytes arrive over root SSH from a clean published commit. The source
  // and manifest cross only that authenticated channel. A deploy-uploaded
  // manifest is never accepted as a trust anchor.
  await stagePath(args.remote, SOURCE_INCLUDES, `${args.remote}:${releaseAppPath}/`, {
    deleteTarget: true,
    cwd: sourceRoot,
  });
  await stagePath(args.remote, ["dist/"], `${args.remote}:${releaseAppPath}/dist/`, {
    deleteTarget: true,
    cwd: sourceRoot,
  });
  await stagePath(args.remote, [manifestPath], `${args.remote}:${releasePath}/release-manifest.json`);
  if (args.contour === "pilot") {
    await stagePath(args.remote, [rootTrustAttestationPath], `${args.remote}:${releasePath}/${ROOT_RELEASE_TRUST_ATTESTATION}`);
  }
  await installPinnedBootstrapSnapshotArtifact({
    artifact: bootstrapSnapshotArtifact,
    remote: args.remote,
    releaseAppPath,
  });

  if (args.contour === "pilot") {
    // Seal before executing any candidate-provided code. The clean published
    // local commit plus root-only transport is the out-of-band trust source.
    await run("ssh", sshArgs(args.remote, buildPilotReleaseSealCommand(releasePath)));
    await run("ssh", sshArgs(args.remote, buildPilotReleaseTrustVerificationCommand(releasePath)));
    await run("ssh", sshArgs(args.remote, pilotFixedReleaseSealVerificationCommand(releaseId, releasePath, releaseAppPath)));
    await run("ssh", sshArgs(args.remote, fixedContentVerificationCommand({
      releaseId,
      anchors: fixedContentAnchors,
    })));
    // Specifications preflight reads the active release with the fixed public
    // verifier. Seal its release, pointer and active record first so no
    // unprivileged verifier ever establishes its own trust boundary.
    await run("ssh", sshArgs(args.remote, fixedActivePilotReleaseVerificationCommand()));
  }

  const remotePreflight = [
    "set -euo pipefail",
    `candidate_app=${shellQuote(releaseAppPath)}`,
    `candidate_manifest=${shellQuote(`${releasePath}/release-manifest.json`)}`,
    'stage_scratch="$(mktemp -d /var/tmp/mes-stage-release.XXXXXX)"',
    'cleanup_stage_scratch() { rm -rf -- "$stage_scratch"; }',
    "trap cleanup_stage_scratch EXIT",
    'chown mes-stage:mes-stage "$stage_scratch"',
    'chmod 0700 "$stage_scratch"',
    'install -o mes-stage -g mes-stage -m 0644 "$candidate_app/package.json" "$stage_scratch/package.json"',
    'install -o mes-stage -g mes-stage -m 0644 "$candidate_app/package-lock.json" "$stage_scratch/package-lock.json"',
    // Candidate preflight proves the runtime path contract as mes-stage without
    // granting that build-only identity write access to any live contour data.
    'install -d -o mes-stage -g mes-stage -m 0700 "$stage_scratch/home" "$stage_scratch/npm-cache" "$stage_scratch/runtime" "$stage_scratch/runtime/shared-state" "$stage_scratch/runtime/backups" "$stage_scratch/runtime/audit"',
    'install -o mes-stage -g mes-stage -m 0600 "$candidate_app/bootstrap-snapshot.json" "$stage_scratch/runtime/bootstrap-snapshot.json"',
    '/usr/sbin/runuser -u mes-stage -- /usr/bin/env HOME="$stage_scratch/home" NPM_CONFIG_CACHE="$stage_scratch/npm-cache" PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/npm ci --prefix "$stage_scratch" --omit=dev --ignore-scripts',
    'rm -rf -- "$candidate_app/node_modules"',
    'mv "$stage_scratch/node_modules" "$candidate_app/node_modules"',
    'chown -hR root:root "$candidate_app/node_modules"',
    'find "$candidate_app/node_modules" -xdev ! -type l -perm /022 -exec chmod go-w -- {} +',
    `cd ${shellQuote(releaseAppPath)}`,
    `/usr/sbin/runuser -u mes-stage -- /usr/bin/env -i HOME="$stage_scratch/home" NPM_CONFIG_CACHE="$stage_scratch/npm-cache" PATH=/usr/sbin:/usr/bin:/sbin:/bin ${preflightEnvironment(contour)} MES_SHARED_STATE_DIR="$stage_scratch/runtime/shared-state" MES_BACKUP_DIR="$stage_scratch/runtime/backups" MES_AUDIT_LOG_PATH="$stage_scratch/runtime/audit/audit.log" MES_BOOTSTRAP_SNAPSHOT_PATH="$stage_scratch/runtime/bootstrap-snapshot.json" /usr/bin/npm run server:preflight`,
    `/usr/sbin/runuser -u mes-stage -- /usr/bin/env HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/node scripts/release-specifications2-stage-preflight.mjs --candidate-app=${shellQuote(releaseAppPath)} --manifest=${shellQuote(`${releasePath}/release-manifest.json`)} --active-app=${shellQuote(contour.appPath)} --service=${shellQuote(contour.service)}`,
    `/usr/sbin/runuser -u mes-stage -- /usr/bin/env HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/node scripts/release-server-command-contract-verify.mjs --app=${shellQuote(releaseAppPath)} --manifest=${shellQuote(`${releasePath}/release-manifest.json`)} --expected-release-id=${shellQuote(releaseId)} --contract=all --public-only`,
    `/usr/sbin/runuser -u mes-stage -- /usr/bin/env HOME=/nonexistent PATH=/usr/sbin:/usr/bin:/sbin:/bin /usr/bin/node ${shellQuote(ROOT_PUBLIC_RELEASE_VERIFIER_PATH)} --app-root=${shellQuote(releaseAppPath)} --manifest=${shellQuote(`${releasePath}/release-manifest.json`)} --expected-release-id=${shellQuote(releaseId)} --json --public-only`,
  ].join("\n");
  const remotePreflightResult = await run("ssh", sshArgs(args.remote, remotePreflight));
  if (remotePreflightResult.stdout.trim()) console.log(remotePreflightResult.stdout.trim());
  if (remotePreflightResult.stderr.trim()) console.warn(remotePreflightResult.stderr.trim());

  if (args.contour === "pilot") {
    // npm creates node_modules after the first seal. Re-seal the complete
    // release and verify that only internal node_modules symlinks exist.
    await run("ssh", sshArgs(args.remote, buildPilotReleaseSealCommand(releasePath)));
    await run("ssh", sshArgs(args.remote, buildPilotReleaseTrustVerificationCommand(releasePath)));
    await run("ssh", sshArgs(args.remote, pilotFixedReleaseSealVerificationCommand(releaseId, releasePath, releaseAppPath)));
    await run("ssh", sshArgs(args.remote, fixedContentVerificationCommand({
      releaseId,
      anchors: fixedContentAnchors,
    })));
  }

  console.log(`- source sha256: ${sourceTreeSha256}`);
  console.log(`- dist sha256: ${distTreeSha256}`);
  console.log(`- React runtime policy: ${runtimePolicy.policyId} (${runtimePolicySha256})`);
  console.log(`- staged path: ${releasePath}`);
  console.log(`- active app unchanged: ${contour.appPath}`);
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    if (error.result?.stdout) console.error(error.result.stdout.trim());
    if (error.result?.stderr) console.error(error.result.stderr.trim());
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupTransientArtifacts();
    } catch (error) {
      console.error(error?.message || error);
      process.exitCode = 1;
    }
  });
