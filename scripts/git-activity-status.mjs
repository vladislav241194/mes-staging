import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(args, fallback = "—") {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: process.cwd() });
    return stdout.trim();
  } catch {
    return fallback;
  }
}

function parseAheadBehind(value = "") {
  const [ahead = "?", behind = "?"] = String(value).trim().split(/\s+/);
  return { behind, ahead };
}

const [root, branch, head, subject, status, originMain, divergence] = await Promise.all([
  git(["rev-parse", "--show-toplevel"]),
  git(["branch", "--show-current"]),
  git(["rev-parse", "--short=12", "HEAD"]),
  git(["log", "-1", "--format=%s"]),
  git(["status", "--porcelain=v1"]),
  git(["rev-parse", "--short=12", "origin/main"]),
  git(["rev-list", "--left-right", "--count", "HEAD...origin/main"], "? ?"),
]);
const { behind, ahead } = parseAheadBehind(divergence);
const changedEntries = status === "—" ? "?" : (status ? status.split("\n").length : 0);

console.log("MES Git activity");
console.log(`- worktree: ${root}`);
console.log(`- branch: ${branch}`);
console.log(`- HEAD: ${head} — ${subject}`);
console.log(`- origin/main: ${originMain}`);
console.log(`- relative to origin/main: ahead ${ahead}, behind ${behind}`);
console.log(`- local changes: ${changedEntries}`);
console.log("- GitHub history: https://github.com/vladislav241194/mes-staging/commits/main");

if (behind !== "0" || ahead !== "0" || changedEntries !== 0) {
  console.log("- Note: this command is read-only. Run `git fetch --prune origin` to refresh remote refs; do not pull a dirty worktree.");
}
