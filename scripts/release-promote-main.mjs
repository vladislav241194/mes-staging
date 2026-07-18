#!/usr/bin/env node
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sshControlPath = join(process.env.HOME || "/tmp", ".ssh", "mes-codex-%C");
const sshOptions = [
  "-o", "ControlMaster=auto",
  "-o", "ControlPersist=60",
  "-o", `ControlPath=${sshControlPath}`,
];

const CONTOURS = {
  pilot: {
    appPath: "/srv/mes/pilot/app",
    releasesPath: "/srv/mes/pilot/releases",
  },
  staging: {
    appPath: "/srv/mes/dev/app",
    releasesPath: "/srv/mes/dev/releases",
  },
};

function assert(value, message) {
  if (!value) throw new Error(message);
}

function isGitObjectId(value) {
  return /^[a-f0-9]{40,64}$/i.test(String(value || ""));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function commandSummary(result) {
  return String(result?.stderr || result?.stdout || "unknown command failure")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

function safeReleaseId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) throw new Error("--release-id is required");
  return normalized;
}

function safeBranch(value) {
  const normalized = String(value || "").trim();
  assert(
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(normalized)
      && !normalized.includes("..")
      && !normalized.endsWith("/"),
    `Unsupported main branch name: ${normalized || "(empty)"}`,
  );
  return normalized;
}

function parseArgs(argv) {
  const args = { contour: "pilot", remote: "mes-line", releaseId: "", mainBranch: "main", dryRun: false };
  for (const arg of argv) {
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    const [key, rawValue] = arg.slice(2).split("=");
    const value = rawValue ?? true;
    if (key === "contour") args.contour = String(value);
    else if (key === "remote") args.remote = String(value);
    else if (key === "release-id") args.releaseId = String(value);
    else if (key === "main-branch") args.mainBranch = String(value);
    else if (key === "dry-run") args.dryRun = true;
    else throw new Error(`Unknown option: --${key}`);
  }
  return args;
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

async function requireGitText(runGit, args, description) {
  const result = await runGit(args);
  if (result?.code !== 0) throw new Error(`${description}: ${commandSummary(result)}`);
  const value = String(result?.stdout || "").trim();
  if (!value) throw new Error(`${description}: Git returned no value`);
  return value;
}

async function assertCleanGitWorktree(runGit) {
  const result = await runGit(["status", "--porcelain"]);
  if (result?.code !== 0) throw new Error(`Unable to inspect Git worktree: ${commandSummary(result)}`);
  if (String(result.stdout || "").trim()) {
    throw new Error("Refusing Git main promotion from a dirty worktree; use a clean isolated release worktree");
  }
}

function assertReleasedArtifact({ releaseId, contour, active, manifest, activeAppPath }) {
  assert(active?.releaseId === releaseId, `Active release is ${active?.releaseId || "unknown"}, not ${releaseId}`);
  assert(manifest?.releaseId === releaseId, `Release manifest id does not match ${releaseId}`);
  assert(manifest?.schemaVersion >= 2, "Release manifest lacks verified Git provenance");
  assert(isGitObjectId(manifest?.gitCommit), "Release manifest Git commit is invalid");
  assert(active?.manifest?.gitCommit === manifest.gitCommit, "Active release record and manifest Git commits differ");
  assert(active?.health?.local === "ok" && active?.health?.public === "ok", "Active release does not have a passing local and public health record");
  assert(
    activeAppPath === `${contour.releasesPath}/${releaseId}/app`,
    `Active application pointer does not target ${releaseId}`,
  );
  const provenance = manifest.gitProvenance;
  assert(provenance?.schemaVersion === 1, "Release manifest Git provenance schema is unsupported");
  assert(provenance.gitCommit === manifest.gitCommit, "Release manifest Git provenance commit does not match release commit");
  assert(typeof provenance.remote === "string" && provenance.remote, "Release manifest Git remote is missing");
  assert(provenance.verification === "fresh-upstream-fetch", "Release manifest was not verified against a freshly fetched upstream");
  return { gitCommit: manifest.gitCommit, gitRemote: provenance.remote };
}

/**
 * Promote the exact commit of an already healthy active release to main.
 *
 * All Git calls are ref-level operations. The routine deliberately never
 * checks out, resets, merges, rebases, or force-pushes a branch, so it is safe
 * to run only from a clean isolated release worktree.
 */
export async function promoteActiveReleaseToMain({
  releaseId,
  contour,
  mainBranch = "main",
  dryRun = false,
  readActiveRelease,
  runGit,
}) {
  assert(typeof readActiveRelease === "function", "readActiveRelease is required");
  assert(typeof runGit === "function", "runGit is required");
  const normalizedReleaseId = safeReleaseId(releaseId);
  const normalizedMainBranch = safeBranch(mainBranch);

  await assertCleanGitWorktree(runGit);
  const released = await readActiveRelease({ releaseId: normalizedReleaseId, contour });
  const { gitCommit, gitRemote } = assertReleasedArtifact({
    releaseId: normalizedReleaseId,
    contour,
    ...released,
  });

  await requireGitText(
    runGit,
    ["rev-parse", "--verify", `${gitCommit}^{commit}`],
    `Release commit ${gitCommit} is unavailable in this worktree`,
  );
  await requireGitText(
    runGit,
    ["remote", "get-url", gitRemote],
    `Release Git remote ${gitRemote} is unavailable in this worktree`,
  );

  const mainRef = `refs/heads/${normalizedMainBranch}`;
  const fetchResult = await runGit(["fetch", "--quiet", "--no-tags", gitRemote, mainRef]);
  if (fetchResult?.code !== 0) {
    throw new Error(`Unable to refresh ${gitRemote}/${mainRef}: ${commandSummary(fetchResult)}`);
  }
  const remoteMainCommit = await requireGitText(
    runGit,
    ["rev-parse", "FETCH_HEAD"],
    `Unable to resolve freshly fetched ${gitRemote}/${mainRef}`,
  );
  assert(isGitObjectId(remoteMainCommit), `Fetched main commit is invalid: ${remoteMainCommit}`);

  if (remoteMainCommit === gitCommit) {
    return {
      state: "already-promoted",
      releaseId: normalizedReleaseId,
      gitCommit,
      gitRemote,
      mainBranch: normalizedMainBranch,
      remoteMainCommit,
      pushed: false,
    };
  }

  const ancestry = await runGit(["merge-base", "--is-ancestor", remoteMainCommit, gitCommit]);
  if (ancestry?.code !== 0) {
    throw new Error(
      `Refusing to move ${normalizedMainBranch}: ${remoteMainCommit} is not an ancestor of active release ${gitCommit}`,
    );
  }

  const refspec = `${gitCommit}:${mainRef}`;
  if (dryRun) {
    return {
      state: "would-promote",
      releaseId: normalizedReleaseId,
      gitCommit,
      gitRemote,
      mainBranch: normalizedMainBranch,
      remoteMainCommit,
      refspec,
      pushed: false,
    };
  }

  const pushResult = await runGit(["push", "--porcelain", gitRemote, refspec]);
  if (pushResult?.code !== 0) {
    throw new Error(
      `Pilot release ${normalizedReleaseId} remains active, but Git main promotion was rejected: ${commandSummary(pushResult)}`,
    );
  }

  return {
    state: "promoted",
    releaseId: normalizedReleaseId,
    gitCommit,
    gitRemote,
    mainBranch: normalizedMainBranch,
    remoteMainCommit,
    refspec,
    pushed: true,
  };
}

async function readRemoteActiveRelease({ releaseId, contour, remote }) {
  const releasePath = `${contour.releasesPath}/${releaseId}`;
  const activeRecordPath = `${contour.releasesPath}/active-release.json`;
  const manifestPath = `${releasePath}/release-manifest.json`;
  const source = [
    'import { readFile, realpath } from "node:fs/promises";',
    "const [activePath, manifestPath, appPath] = process.argv.slice(1);",
    "const [active, manifest, activeAppPath] = await Promise.all([",
    '  readFile(activePath, "utf8").then(JSON.parse),',
    '  readFile(manifestPath, "utf8").then(JSON.parse),',
    "  realpath(appPath),",
    "]);",
    "process.stdout.write(JSON.stringify({ active, manifest, activeAppPath }));",
  ].join("\n");
  const command = [
    "node --input-type=module -e",
    shellQuote(source),
    shellQuote(activeRecordPath),
    shellQuote(manifestPath),
    shellQuote(contour.appPath),
  ].join(" ");
  const result = await run("ssh", [...sshOptions, remote, command], { allowFailure: true });
  if (result.code !== 0) {
    throw new Error(`Unable to read active release ${releaseId}: ${commandSummary(result)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Active release response is invalid JSON: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const contour = CONTOURS[args.contour];
  if (!contour) throw new Error(`Unknown contour: ${args.contour}`);
  const releaseId = safeReleaseId(args.releaseId);
  const startedAt = performance.now();

  console.log(`MES Git main promotion${args.dryRun ? " (dry run)" : ""}`);
  console.log(`- contour: ${args.contour}`);
  console.log(`- release: ${releaseId}`);

  const result = await promoteActiveReleaseToMain({
    releaseId,
    contour,
    mainBranch: args.mainBranch,
    dryRun: args.dryRun,
    readActiveRelease: (input) => readRemoteActiveRelease({ ...input, remote: args.remote }),
    runGit: (gitArgs) => run("git", gitArgs, { allowFailure: true }),
  });

  console.log(`- commit: ${result.gitCommit}`);
  console.log(`- main: ${result.gitRemote}/${result.mainBranch}`);
  console.log(`- result: ${result.state}`);
  if (result.refspec) console.log(`- refspec: ${result.refspec}`);
  console.log(`- total: ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
