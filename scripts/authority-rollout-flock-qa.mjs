import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdtemp, open, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const wrapperPath = join(projectRoot, "ops", "shared-state", "with-authority-rollout-lock.sh");
const directory = await mkdtemp(join(tmpdir(), "mes-authority-flock-qa-"));
const lockPath = join(directory, "mes-authority-rollout.lock");
const python = process.env.PYTHON || "python3";

const holderSource = [
  "import fcntl, sys, time",
  "handle = open(sys.argv[1], 'a+')",
  "fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)",
  "print('LOCKED', flush=True)",
  "time.sleep(60)",
].join("\n");
const contenderSource = [
  "import fcntl, sys",
  "handle = open(sys.argv[1], 'a+')",
  "try:",
  "    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)",
  "except BlockingIOError:",
  "    sys.exit(75)",
  "print('ACQUIRED')",
].join("\n");

try {
  const probe = spawnSync(python, ["--version"], { encoding: "utf8" });
  assert.equal(probe.status, 0, "kernel-flock QA requires python3 fcntl support");

  const handle = await open(lockPath, "wx", 0o600);
  await handle.close();
  await chmod(lockPath, 0o600);

  const holder = spawn(python, ["-c", holderSource, lockPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForLine(holder, "LOCKED");

  const blocked = spawnSync(python, ["-c", contenderSource, lockPath], { encoding: "utf8" });
  assert.equal(blocked.status, 75, "a concurrent authority mutation must fail while the kernel lock is held");

  holder.kill("SIGKILL");
  await waitForExit(holder);

  const staleTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  await utimes(lockPath, staleTime, staleTime);
  const recovered = spawnSync(python, ["-c", contenderSource, lockPath], { encoding: "utf8" });
  assert.equal(recovered.status, 0, `SIGKILL must release the kernel lock even when its root-owned inode remains: ${recovered.stderr}`);
  assert.match(recovered.stdout, /ACQUIRED/, "the persistent stale lock inode must be reusable without deletion");

  const nonRootOptions = { cwd: projectRoot, encoding: "utf8" };
  if (typeof process.getuid === "function" && process.getuid() === 0) nonRootOptions.uid = 65534;
  const nonRoot = spawnSync("/bin/bash", [wrapperPath, "/usr/bin/true"], nonRootOptions);
  assert.equal(nonRoot.status, 73, "a non-root caller must fail before it can create or open the authority lock");
  assert.match(nonRoot.stderr, /requires uid 0/, "non-root rejection must identify the root boundary");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Authority rollout kernel flock QA: OK");
console.log("- concurrent holder blocks a second writer");
console.log("- SIGKILL releases the lock while the root-owned lock inode remains reusable");
console.log("- non-root callers fail before lock-file access");

function waitForLine(child, expected) {
  return new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes(expected)) {
        clearTimeout(timeout);
        resolvePromise();
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("exit", (code) => {
      if (!stdout.includes(expected)) {
        clearTimeout(timeout);
        reject(new Error(`Lock holder exited before readiness (code ${code}): ${stderr}`));
      }
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => child.once("exit", resolvePromise));
}
