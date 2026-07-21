#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(join(tmpdir(), "mes-helper-symlink-cli-"));
try {
  const expectedErrors = new Map([
    ["scripts/release-root-seal-verify.mjs", "Root seal verification failed: production CLI must run as root"],
    ["scripts/release-root-reinode-active.mjs", "Pilot active release re-inode failed: uid 0 is required"],
    ["scripts/release-switch-journal.mjs", "Release-switch journal helper requires uid 0"],
  ]);
  for (const [relativePath, expectedError] of expectedErrors) {
    const target = resolve(projectRoot, relativePath);
    const link = join(directory, basename(relativePath));
    await symlink(target, link);
    const result = spawnSync(process.execPath, [
      "--import",
      "data:text/javascript,process.getuid%3D()%3D%3E65534",
      link,
      "__qa_invalid_cli_mode__",
    ], {
      encoding: "utf8",
      env: { ...process.env, MES_RELEASE_QA_FORCE_NODE20_ENTRYPOINT: "1" },
    });
    assert.equal(result.status, 1,
      `${relativePath} must execute (and fail closed), not silently no-op, when invoked through the active-bundle symlink`);
    assert.equal(result.stdout, "", `${relativePath} symlink CLI failure must not emit a false success payload`);
    assert.equal(result.stderr.trim(), expectedError,
      `${relativePath} symlink CLI invocation must produce its helper-specific main-path failure`);

    const collisionDirectory = join(directory, `${basename(relativePath)}-collision`);
    await import("node:fs/promises").then(({ mkdir }) => mkdir(collisionDirectory));
    const collision = join(collisionDirectory, basename(relativePath));
    await import("node:fs/promises").then(({ writeFile }) => writeFile(
      collision,
      `import ${JSON.stringify(new URL(`file://${target}`).href)};\n`,
    ));
    const collisionResult = spawnSync(process.execPath, [collision], {
      encoding: "utf8",
      env: { ...process.env, MES_RELEASE_QA_FORCE_NODE20_ENTRYPOINT: "1" },
    });
    assert.equal(collisionResult.status, 1,
      `${relativePath} must fail closed when the Node 20 fallback sees a same-basename path collision`);
    assert.match(collisionResult.stderr, /CLI entrypoint identity mismatch/,
      `${relativePath} path collision must report an explicit entrypoint identity mismatch`);
  }
  console.log("Release helper symlink CLI QA: OK");
} finally {
  await rm(directory, { recursive: true, force: true });
}
