#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertNoIgnoredReleaseInputs, collectPublishedGitProvenance } from "./release-provenance.mjs";

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
    bootstrapSnapshotPath: "/srv/mes/pilot/runtime/bootstrap-snapshot.json",
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
  "mes-planning-prototype.png",
  "vercel.json",
];
const SOURCE_INCLUDES = [...RUNTIME_DIRECTORIES, ...RUNTIME_FILES];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseArgs(argv) {
  const args = { contour: "pilot", remote: "mes-line", releaseId: "", dryRun: false };
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
    MES_SHARED_STATE_DIR: contour.sharedStateDir,
    MES_BACKUP_DIR: contour.backupDir,
    MES_AUDIT_LOG_PATH: contour.auditLogPath,
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
  const currentCommit = await gitText(["rev-parse", "HEAD"]);
  if (currentCommit !== gitCommit) {
    throw new Error(`Refusing release staging: Git HEAD changed during the build (${gitCommit} -> ${currentCommit})`);
  }
}

async function treeSha(includes, { excludes = [] } = {}) {
  const args = [
    "scripts/release-tree-sha.mjs",
    ...includes.map((value) => `--include=${value}`),
    ...excludes.map((value) => `--exclude=${value}`),
  ];
  return (await run("node", args)).stdout.trim();
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function stagePath(remote, sourcePaths, target, { deleteTarget = false, dryRun = false } = {}) {
  const args = ["-azc", "-e", rsyncSshTransport(), "--itemize-changes"];
  if (deleteTarget) args.push("--delete");
  if (dryRun) args.push("--dry-run");
  args.push(...sourcePaths, target);
  return await run("rsync", args);
}

async function ensureBootstrapSnapshotArtifact({ contour, remote }) {
  const externalPath = contour.bootstrapSnapshotPath;
  const activePath = `${contour.appPath}/bootstrap-snapshot.json`;
  const activeDistPath = `${contour.appPath}/dist/bootstrap-snapshot.json`;
  const remoteCommand = [
    "set -euo pipefail",
    `artifact=${shellQuote(externalPath)}`,
    `active_artifact=${shellQuote(activePath)}`,
    `active_dist_artifact=${shellQuote(activeDistPath)}`,
    "if [ ! -f \"$artifact\" ]; then",
    `  mkdir -p ${shellQuote(dirname(externalPath))}`,
    "  if [ -f \"$active_artifact\" ]; then",
    "    cp -p \"$active_artifact\" \"$artifact\"",
    "  elif [ -f \"$active_dist_artifact\" ]; then",
    "    cp -p \"$active_dist_artifact\" \"$artifact\"",
    "  else",
    "    echo 'bootstrap snapshot is absent in both operational and active runtime paths' >&2",
    "    exit 1",
    "  fi",
    "fi",
    "node --input-type=module -e 'JSON.parse(await (await import(\"node:fs/promises\")).readFile(process.argv[1], \"utf8\"));' \"$artifact\"",
    "sha256sum \"$artifact\" | awk '{print $1}'",
  ].join("\n");
  const result = await run("ssh", sshArgs(remote, remoteCommand));
  const sha256 = result.stdout.trim().split(/\r?\n/).find((line) => /^[a-f0-9]{64}$/i.test(line));
  if (!sha256) throw new Error("Unable to calculate the operational bootstrap snapshot digest");
  return {
    id: "bootstrap-snapshot",
    sha256,
    operationalPath: externalPath,
    stagedPaths: ["bootstrap-snapshot.json", "dist/bootstrap-snapshot.json"],
  };
}

async function installBootstrapSnapshotArtifact({ contour, remote, releaseAppPath }) {
  const externalPath = contour.bootstrapSnapshotPath;
  const remoteCommand = [
    "set -euo pipefail",
    `artifact=${shellQuote(externalPath)}`,
    `release_app=${shellQuote(releaseAppPath)}`,
    "test -f \"$artifact\"",
    "cp -p \"$artifact\" \"$release_app/bootstrap-snapshot.json\"",
    "cp -p \"$artifact\" \"$release_app/dist/bootstrap-snapshot.json\"",
    "cmp -s \"$artifact\" \"$release_app/bootstrap-snapshot.json\"",
    "cmp -s \"$artifact\" \"$release_app/dist/bootstrap-snapshot.json\"",
  ].join("\n");
  await run("ssh", sshArgs(remote, remoteCommand));
}

async function assertLocalDistBootstrapSnapshotArtifact(artifact) {
  const distPath = join(projectRoot, "dist", "bootstrap-snapshot.json");
  if (await sha256(distPath) !== artifact.sha256) {
    throw new Error("Built dist bootstrap snapshot does not match the operational artifact");
  }
}

async function prepareLocalBootstrapSnapshotArtifact({ contour, remote, artifact }) {
  const localPath = join(projectRoot, "bootstrap-snapshot.json");
  try {
    await access(localPath);
    throw new Error("Refusing release staging with an unmanaged local bootstrap-snapshot.json");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  // The snapshot is an external operational artifact. A clean Git checkout
  // deliberately has no local copy, but the deterministic web build still
  // needs it. Materialize the exact remote artifact only for the build, then
  // remove it before re-validating the clean source provenance.
  const downloadDir = await mkdtemp(join(tmpdir(), "mes-release-bootstrap-"));
  const downloadPath = join(downloadDir, "bootstrap-snapshot.json");
  try {
    await run("scp", [...sshOptions, `${remote}:${contour.bootstrapSnapshotPath}`, downloadPath]);
    JSON.parse(await readFile(downloadPath, "utf8"));
    if (await sha256(downloadPath) !== artifact.sha256) {
      throw new Error("Local bootstrap snapshot digest does not match the operational artifact");
    }
    await copyFile(downloadPath, localPath);
  } catch (error) {
    await rm(downloadDir, { recursive: true, force: true });
    throw error;
  }

  return {
    cleanup: async () => {
      await rm(localPath, { force: true });
      await rm(downloadDir, { recursive: true, force: true });
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);

  await assertCleanGitWorktree();
  await assertNoIgnoredReleaseInputs({ runGit, sourceIncludes: SOURCE_INCLUDES });
  const gitProvenance = await collectPublishedGitProvenance({
    runGit,
    // A dry run remains useful without Git-network access. A real staged
    // release must verify that HEAD is on the freshly fetched upstream branch.
    refreshRemote: !args.dryRun,
  });
  const { gitCommit } = gitProvenance;
  const gitCommitShort = gitCommit.slice(0, 7);
  const version = JSON.parse(await readFile(join(projectRoot, "app-version.json"), "utf8")).version;
  const releaseId = safeReleaseId(args.releaseId || `${version}-${gitCommitShort}`);
  const releasePath = `${contour.releasesPath}/${releaseId}`;
  const releaseAppPath = `${releasePath}/app`;
  const startedAt = performance.now();

  console.log(`MES staged release${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- release: ${releaseId}`);
  console.log(`- commit: ${gitCommit}`);
  console.log(`- Git provenance: ${gitProvenance.verification} (${gitProvenance.upstreamRef} @ ${gitProvenance.upstreamCommit})`);

  if (args.dryRun) {
    console.log(`- would build tracked source inputs and upload ${SOURCE_INCLUDES.join(", ")} plus dist/`);
    console.log(`- would preserve the external bootstrap snapshot at ${contour.bootstrapSnapshotPath}`);
    console.log(`- would stage into ${releaseAppPath} without changing ${contour.appPath}`);
    return;
  }

  const remoteExists = await run("ssh", sshArgs(args.remote, `test ! -e ${shellQuote(releasePath)}`), { allowFailure: true });
  if (remoteExists.code !== 0) throw new Error(`Release path already exists: ${releasePath}`);

  const bootstrapSnapshotArtifact = await ensureBootstrapSnapshotArtifact({ contour, remote: args.remote });
  const localBootstrapSnapshot = await prepareLocalBootstrapSnapshotArtifact({
    contour,
    remote: args.remote,
    artifact: bootstrapSnapshotArtifact,
  });
  const distCompatibilityExcludes = bootstrapSnapshotArtifact.stagedPaths
    .filter((path) => path.startsWith("dist/"));
  let firstDistTreeSha256;
  let secondDistTreeSha256;
  try {
    await run("npm", ["ci"]);
    await run("npm", ["run", "qa:stabilize"]);
    await run("npm", ["run", "build"]);
    await assertLocalDistBootstrapSnapshotArtifact(bootstrapSnapshotArtifact);
    firstDistTreeSha256 = await treeSha(["dist"], { excludes: distCompatibilityExcludes });
    await run("npm", ["run", "build"]);
    await assertLocalDistBootstrapSnapshotArtifact(bootstrapSnapshotArtifact);
    secondDistTreeSha256 = await treeSha(["dist"], { excludes: distCompatibilityExcludes });
  } finally {
    await localBootstrapSnapshot.cleanup();
  }
  if (firstDistTreeSha256 !== secondDistTreeSha256) {
    throw new Error("Refusing non-deterministic build output; the two dist digests differ");
  }
  await assertReleaseSourceStillMatchesProvenance(gitCommit);
  const sourceTreeSha256 = await treeSha(SOURCE_INCLUDES);
  const distTreeSha256 = secondDistTreeSha256;
  const packageLockSha256 = await sha256(join(projectRoot, "package-lock.json"));
  const manifest = {
    schemaVersion: 2,
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
    compatibilityArtifacts: [bootstrapSnapshotArtifact],
    verification: {
      localBuild: "npm ci && npm run qa:stabilize && npm run build twice with matching dist digest",
      remotePreflight: "npm ci --omit=dev && npm run server:preflight",
      activation: "not activated by stage command",
    },
  };
  const manifestDir = await mkdtemp(join(tmpdir(), "mes-release-manifest-"));
  const manifestPath = join(manifestDir, "release-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await run("ssh", sshArgs(args.remote, [
    `mkdir -p ${shellQuote(releaseAppPath)}`,
    `test -d ${shellQuote(releaseAppPath)}`,
  ].join(" && ")));
  await stagePath(args.remote, SOURCE_INCLUDES, `${args.remote}:${releaseAppPath}/`, { deleteTarget: true });
  await stagePath(args.remote, ["dist/"], `${args.remote}:${releaseAppPath}/dist/`, { deleteTarget: true });
  await stagePath(args.remote, [manifestPath], `${args.remote}:${releasePath}/release-manifest.json`);
  await installBootstrapSnapshotArtifact({ contour, remote: args.remote, releaseAppPath });

  const remotePreflight = [
    `cd ${shellQuote(releaseAppPath)}`,
    "npm ci --omit=dev",
    `env ${preflightEnvironment(contour)} npm run server:preflight`,
    `node scripts/release-verify.mjs --manifest=${shellQuote(`${releasePath}/release-manifest.json`)} --expected-release-id=${shellQuote(releaseId)} --json`,
  ].join(" && ");
  await run("ssh", sshArgs(args.remote, remotePreflight));

  console.log(`- source sha256: ${sourceTreeSha256}`);
  console.log(`- dist sha256: ${distTreeSha256}`);
  console.log(`- staged path: ${releasePath}`);
  console.log(`- active app unchanged: ${contour.appPath}`);
  console.log(`- total: ${formatDuration(performance.now() - startedAt)}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.result?.stdout) console.error(error.result.stdout.trim());
  if (error.result?.stderr) console.error(error.result.stderr.trim());
  process.exit(1);
});
