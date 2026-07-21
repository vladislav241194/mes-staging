#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializePublishedGitSnapshot } from "./release-immutable-source.mjs";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const root = await mkdtemp(join(tmpdir(), "mes-immutable-source-qa-"));
try {
  const repository = join(root, "repository");
  await mkdir(repository);
  git(repository, ["init", "--quiet"]);
  git(repository, ["config", "user.email", "qa@mes-line.invalid"]);
  git(repository, ["config", "user.name", "MES QA"]);
  await writeFile(join(repository, "runtime.txt"), "published-bytes\n");
  await mkdir(join(repository, "scripts"));
  await writeFile(join(repository, "scripts", "runtime.mjs"), "export const value = 'published';\n");
  git(repository, ["add", "."]);
  git(repository, ["commit", "--quiet", "-m", "published fixture"]);
  const commit = git(repository, ["rev-parse", "HEAD"]);

  const snapshotPromise = materializePublishedGitSnapshot({ projectRoot: repository, gitCommit: commit });
  // Adversarial same-user writes race the archive operation. Git-object bytes,
  // not the mutable checkout, must remain the release source.
  for (let index = 0; index < 64; index += 1) {
    await writeFile(join(repository, "runtime.txt"), `attacker-${index}\n`);
    await writeFile(join(repository, "scripts", "runtime.mjs"), `throw new Error('attacker-${index}');\n`);
  }
  const snapshot = await snapshotPromise;
  try {
    assert.equal(await readFile(join(snapshot.root, "runtime.txt"), "utf8"), "published-bytes\n");
    assert.equal(await readFile(join(snapshot.root, "scripts", "runtime.mjs"), "utf8"), "export const value = 'published';\n");
    assert.match(git(repository, ["status", "--porcelain"]), /runtime\.txt/);
  } finally {
    await snapshot.cleanup();
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Immutable published release source QA: OK");
