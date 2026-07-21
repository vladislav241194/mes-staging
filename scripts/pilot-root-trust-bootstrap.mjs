#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectPublishedGitProvenance } from "./release-provenance.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const ROOT_REMOTE = "mes-line-root";
const BOOTSTRAP_FILES = Object.freeze([
  { sourceRelativePath: "ops/frontend/harden-pilot-release-root-trust.sh", remoteName: "harden-pilot-release-root-trust.sh" },
  { sourceRelativePath: "scripts/release-root-seal-verify.mjs", remoteName: "release-root-seal-verify.mjs" },
  { sourceRelativePath: "scripts/release-root-reinode-active.mjs", remoteName: "release-root-reinode-active.mjs" },
  { sourceRelativePath: "scripts/release-activate.mjs", remoteName: "release-activate.mjs" },
  { sourceRelativePath: "scripts/release-rollback.mjs", remoteName: "release-rollback.mjs" },
  { sourceRelativePath: "scripts/release-switch-journal.mjs", remoteName: "release-switch-journal.mjs" },
  { sourceRelativePath: "ops/frontend/with-pilot-release-authority-lock.sh", remoteName: "with-pilot-release-authority-lock.sh" },
  { sourceRelativePath: "ops/frontend/recover-pilot-release-transitions.sh", remoteName: "recover-pilot-release-transitions.sh" },
]);
const sshOptions = ["-o", "ControlMaster=auto", "-o", "ControlPersist=60"];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function run(command, args, { cwd = projectRoot, allowFailure = false } = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (code !== 0 && !allowFailure) {
        const error = new Error(`${command} ${args.join(" ")} failed with code ${code}`);
        error.result = result;
        reject(error);
      } else resolvePromise(result);
    });
  });
}

async function runGit(args) {
  return await run("git", args, { allowFailure: true });
}

function parseArgs(argv) {
  const args = { remote: ROOT_REMOTE, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--remote=")) args.remote = arg.slice("--remote=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.remote !== ROOT_REMOTE) throw new Error(`Pilot trust bootstrap requires the exact ${ROOT_REMOTE} root SSH alias`);
  return args;
}

export async function collectPublishedBootstrapBlobs({
  root = projectRoot,
  gitCommit,
  runGitCommand = async (args) => run("git", args, { cwd: root }),
} = {}) {
  if (!/^[a-f0-9]{40,64}$/i.test(String(gitCommit || ""))) throw new Error("Published Git commit is invalid");
  const blobs = [];
  for (const descriptor of BOOTSTRAP_FILES) {
    const committedSource = (await runGitCommand(["show", `${gitCommit}:${descriptor.sourceRelativePath}`])).stdout;
    const workingSource = await readFile(join(root, descriptor.sourceRelativePath), "utf8");
    if (committedSource !== workingSource) {
      throw new Error(`Bootstrap source differs from the published Git object: ${descriptor.sourceRelativePath}`);
    }
    blobs.push({ ...descriptor, source: committedSource, sha256: sha256(committedSource) });
  }
  return blobs;
}

export function buildRemoteBootstrapCommand({ remoteDirectory, blobs }) {
  const lines = [
    "set -euo pipefail",
    "export PATH=/usr/sbin:/usr/bin:/sbin:/bin",
    'if [ "$(id -u)" != "0" ]; then echo "Pilot trust bootstrap requires uid 0" >&2; exit 73; fi',
    `bootstrap_dir=${shellQuote(remoteDirectory)}`,
    'if [ ! -d "$bootstrap_dir" ] || [ -L "$bootstrap_dir" ] || [ "$(readlink -f -- "$bootstrap_dir")" != "$bootstrap_dir" ]; then echo "Unsafe bootstrap directory" >&2; exit 74; fi',
    'if [ "$(stat -Lc \'%u:%g\' -- "$bootstrap_dir")" != "0:0" ] || find "$bootstrap_dir" -maxdepth 0 -perm /077 -print -quit | grep -q .; then echo "Bootstrap directory is not root-only" >&2; exit 74; fi',
  ];
  blobs.forEach((blob, index) => {
    lines.push(`blob_${index}=${shellQuote(join(remoteDirectory, blob.remoteName))}`);
    lines.push(`expected_${index}=${shellQuote(blob.sha256)}`);
  });
  lines.push(`for blob_index in $(seq 0 ${blobs.length - 1}); do`);
  lines.push('  eval "blob_path=\\$blob_${blob_index}"');
  lines.push('  eval "expected_sha256=\\$expected_${blob_index}"');
  lines.push('  if [ ! -f "$blob_path" ] || [ -L "$blob_path" ] || [ "$(stat -Lc \'%u:%g\' -- "$blob_path")" != "0:0" ]; then echo "Untrusted bootstrap blob: $blob_path" >&2; exit 76; fi');
  lines.push('  actual_sha256="$(sha256sum "$blob_path" | awk \'{print $1}\')"');
  lines.push('  if [ "$actual_sha256" != "$expected_sha256" ]; then echo "Bootstrap blob SHA-256 mismatch: $blob_path" >&2; exit 76; fi');
  lines.push('  chmod 0400 -- "$blob_path"');
  lines.push("done");
  const remotePaths = Object.fromEntries(blobs.map((blob) => [blob.sourceRelativePath, join(remoteDirectory, blob.remoteName)]));
  lines.push([
    "/bin/bash",
    shellQuote(remotePaths["ops/frontend/harden-pilot-release-root-trust.sh"]),
    shellQuote(remotePaths["scripts/release-root-seal-verify.mjs"]),
    shellQuote(remotePaths["scripts/release-root-reinode-active.mjs"]),
    shellQuote(remotePaths["scripts/release-activate.mjs"]),
    shellQuote(remotePaths["scripts/release-rollback.mjs"]),
    shellQuote(remotePaths["scripts/release-switch-journal.mjs"]),
    shellQuote(remotePaths["ops/frontend/with-pilot-release-authority-lock.sh"]),
    shellQuote(remotePaths["ops/frontend/recover-pilot-release-transitions.sh"]),
  ].join(" "));
  lines.push("/usr/bin/node /usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs bundle");
  lines.push('/usr/bin/rm -rf -- "$bootstrap_dir"');
  lines.push("printf '%s\\n' ROOT_TRUST_BOOTSTRAP_OK");
  return lines.join("\n");
}

export async function bootstrapPublishedPilotRootTrust({
  root = projectRoot,
  remote = ROOT_REMOTE,
  gitCommit,
  provenanceVerification,
} = {}) {
  if (remote !== ROOT_REMOTE) throw new Error(`Pilot trust bootstrap requires the exact ${ROOT_REMOTE} root SSH alias`);
  if (provenanceVerification !== "fresh-upstream-fetch") {
    throw new Error("Pilot trust bootstrap requires fresh published Git provenance");
  }
  const blobs = await collectPublishedBootstrapBlobs({ root, gitCommit });
  const localDirectory = await mkdtemp(join(tmpdir(), "mes-root-trust-bootstrap-"));
  const remoteDirectory = `/root/.mes-root-trust-bootstrap-${gitCommit.slice(0, 12)}-${process.pid}`;
  try {
    await run("ssh", [...sshOptions, remote, [
      "set -euo pipefail",
      "export PATH=/usr/sbin:/usr/bin:/sbin:/bin",
      'if [ "$(id -u)" != "0" ]; then exit 73; fi',
      `test ! -e ${shellQuote(remoteDirectory)}`,
      `install -d -o root -g root -m 0700 ${shellQuote(remoteDirectory)}`,
    ].join("\n")], { cwd: root });
    for (const blob of blobs) {
      const localPath = join(localDirectory, basename(blob.remoteName));
      await writeFile(localPath, blob.source, { mode: 0o400 });
      await run("scp", [...sshOptions, localPath, `${remote}:${join(remoteDirectory, blob.remoteName)}`], { cwd: root });
    }
    const command = buildRemoteBootstrapCommand({ remoteDirectory, blobs });
    return await run("ssh", [...sshOptions, remote, command], { cwd: root });
  } finally {
    await rm(localDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = (await run("git", ["status", "--porcelain"])).stdout.trim();
  if (status) throw new Error("Refusing root trust bootstrap from a dirty Git worktree");
  const provenance = await collectPublishedGitProvenance({ runGit, refreshRemote: true });
  if (provenance.verification !== "fresh-upstream-fetch") throw new Error("Root trust bootstrap requires fresh published Git provenance");
  const blobs = await collectPublishedBootstrapBlobs({ gitCommit: provenance.gitCommit });
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, gitCommit: provenance.gitCommit, blobs: blobs.map(({ source, ...blob }) => blob) }, null, 2)}\n`);
    return;
  }

  const result = await bootstrapPublishedPilotRootTrust({
    remote: args.remote,
    gitCommit: provenance.gitCommit,
    provenanceVerification: provenance.verification,
  });
  process.stdout.write(result.stdout);
}

const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsCli) {
  main().catch((error) => {
    console.error(error?.message || error);
    if (error.result?.stdout) console.error(error.result.stdout.trim());
    if (error.result?.stderr) console.error(error.result.stderr.trim());
    process.exitCode = 1;
  });
}
