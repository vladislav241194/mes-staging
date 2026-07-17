#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

async function assertCleanGitWorktree() {
  const status = await gitText(["status", "--porcelain"]);
  if (status) throw new Error("Refusing release staging from a dirty Git worktree");
}

async function treeSha(includes) {
  const args = ["scripts/release-tree-sha.mjs", ...includes.map((value) => `--include=${value}`)];
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);

  await assertCleanGitWorktree();
  const gitCommit = await gitText(["rev-parse", "HEAD"]);
  const gitCommitShort = await gitText(["rev-parse", "--short", "HEAD"]);
  const version = JSON.parse(await readFile(join(projectRoot, "app-version.json"), "utf8")).version;
  const releaseId = safeReleaseId(args.releaseId || `${version}-${gitCommitShort}`);
  const releasePath = `${contour.releasesPath}/${releaseId}`;
  const releaseAppPath = `${releasePath}/app`;
  const startedAt = performance.now();

  console.log(`MES staged release${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- release: ${releaseId}`);
  console.log(`- commit: ${gitCommit}`);

  const remoteExists = await run("ssh", sshArgs(args.remote, `test ! -e ${shellQuote(releasePath)}`), { allowFailure: true });
  if (remoteExists.code !== 0) throw new Error(`Release path already exists: ${releasePath}`);

  if (args.dryRun) {
    console.log(`- would build clean worktree and upload ${SOURCE_INCLUDES.join(", ")} plus dist/`);
    console.log(`- would stage into ${releaseAppPath} without changing ${contour.appPath}`);
    return;
  }

  await run("npm", ["ci"]);
  await run("npm", ["run", "build"]);
  const sourceTreeSha256 = await treeSha(SOURCE_INCLUDES);
  const distTreeSha256 = await treeSha(["dist"]);
  const packageLockSha256 = await sha256(join(projectRoot, "package-lock.json"));
  const manifest = {
    schemaVersion: 1,
    releaseId,
    createdAt: new Date().toISOString(),
    contour: args.contour,
    gitCommit,
    appVersion: version,
    runtimeIncludes: SOURCE_INCLUDES,
    sourceTreeSha256,
    distTreeSha256,
    packageLockSha256,
    verification: {
      localBuild: "npm ci && npm run build",
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

  const remotePreflight = [
    `cd ${shellQuote(releaseAppPath)}`,
    "npm ci --omit=dev",
    `env ${preflightEnvironment(contour)} npm run server:preflight`,
    `node scripts/release-tree-sha.mjs ${SOURCE_INCLUDES.map((value) => shellQuote(`--include=${value}`)).join(" ")}`,
    "node scripts/release-tree-sha.mjs --include=dist",
  ].join(" && ");
  const remoteResult = await run("ssh", sshArgs(args.remote, remotePreflight));
  const remoteDigests = remoteResult.stdout.trim().split(/\r?\n/).filter((line) => /^[a-f0-9]{64}$/i.test(line));
  const [remoteSourceTreeSha256, remoteDistTreeSha256] = remoteDigests.slice(-2);
  if (remoteSourceTreeSha256 !== sourceTreeSha256 || remoteDistTreeSha256 !== distTreeSha256) {
    throw new Error(`Staged artifact hash mismatch: source ${remoteSourceTreeSha256 || "missing"}, dist ${remoteDistTreeSha256 || "missing"}`);
  }

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
