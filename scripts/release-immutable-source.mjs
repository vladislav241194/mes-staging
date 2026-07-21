import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function capture(stream) {
  let value = "";
  stream?.on("data", (chunk) => { value += chunk.toString(); });
  return () => value.trim();
}

export async function materializePublishedGitSnapshot({ projectRoot, gitCommit }) {
  if (!/^[a-f0-9]{40,64}$/i.test(String(gitCommit || ""))) {
    throw new Error("Published Git snapshot requires an exact commit object id");
  }
  const root = resolve(await mkdtemp(join(tmpdir(), "mes-published-release-")));
  await chmod(root, 0o700);
  try {
    await new Promise((resolvePromise, reject) => {
      const archive = spawn("git", ["archive", "--format=tar", gitCommit], {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const extract = spawn("tar", ["-xf", "-", "-C", root], {
        cwd: projectRoot,
        stdio: ["pipe", "ignore", "pipe"],
      });
      const archiveError = capture(archive.stderr);
      const extractError = capture(extract.stderr);
      let archiveCode = null;
      let extractCode = null;
      let settled = false;
      const finish = () => {
        if (settled || archiveCode === null || extractCode === null) return;
        settled = true;
        if (archiveCode !== 0 || extractCode !== 0) {
          reject(new Error(`Unable to materialize published Git snapshot (git=${archiveCode}, tar=${extractCode}): ${archiveError() || extractError()}`));
          return;
        }
        resolvePromise();
      };
      archive.on("error", (error) => { if (!settled) { settled = true; reject(error); } });
      extract.on("error", (error) => { if (!settled) { settled = true; reject(error); } });
      archive.on("close", (code) => { archiveCode = code; finish(); });
      extract.on("close", (code) => { extractCode = code; finish(); });
      archive.stdout.pipe(extract.stdin);
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    gitCommit,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}
