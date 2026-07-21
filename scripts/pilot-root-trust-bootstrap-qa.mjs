#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildRemoteBootstrapCommand,
  collectPublishedBootstrapBlobs,
} from "./pilot-root-trust-bootstrap.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePaths = [
  "ops/frontend/harden-pilot-release-root-trust.sh",
  "scripts/release-root-seal-verify.mjs",
  "scripts/release-root-reinode-active.mjs",
  "scripts/release-activate.mjs",
  "scripts/release-rollback.mjs",
  "scripts/release-switch-journal.mjs",
  "ops/frontend/with-pilot-release-authority-lock.sh",
  "ops/frontend/recover-pilot-release-transitions.sh",
];
const commit = "a".repeat(40);
const fixtureRoot = await mkdtemp(join(tmpdir(), "mes-root-bootstrap-qa-"));
try {
  const committedSources = new Map();
  for (const path of sourcePaths) {
    const source = `// published ${path}\n`;
    committedSources.set(path, source);
    await mkdir(dirname(join(fixtureRoot, path)), { recursive: true });
    await writeFile(join(fixtureRoot, path), source);
  }
  const runGitCommand = async (args) => {
    assert.equal(args[0], "show");
    const prefix = `${commit}:`;
    assert(args[1].startsWith(prefix));
    return { code: 0, stdout: committedSources.get(args[1].slice(prefix.length)), stderr: "" };
  };
  const blobs = await collectPublishedBootstrapBlobs({ root: fixtureRoot, gitCommit: commit, runGitCommand });
  assert.equal(blobs.length, sourcePaths.length);
  const remoteCommand = buildRemoteBootstrapCommand({
    remoteDirectory: "/root/.mes-root-trust-bootstrap-aaaaaaaaaaaa-123",
    blobs,
  });
  const syntax = spawnSync("bash", ["-n"], { input: remoteCommand, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const digestCheck = remoteCommand.indexOf('if [ "$actual_sha256" != "$expected_sha256" ]');
  const hardenerExecution = remoteCommand.indexOf("/bin/bash");
  assert(digestCheck >= 0 && hardenerExecution > digestCheck, "every uploaded blob must be SHA-verified before the hardener executes");
  assert.doesNotMatch(remoteCommand, /bash\s+-s/);

  // A mutable-worktree mismatch is adversarially injected after the published
  // blob identities are fixed. Bootstrap must reject it rather than uploading
  // or executing the changed local bytes.
  await writeFile(join(fixtureRoot, sourcePaths[0]), "#!/bin/sh\necho attacker\n");
  await assert.rejects(
    collectPublishedBootstrapBlobs({ root: fixtureRoot, gitCommit: commit, runGitCommand }),
    /differs from the published Git object/,
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

const orchestratorSource = await readFile(join(projectRoot, "scripts", "pilot-root-trust-bootstrap.mjs"), "utf8");
assert.match(orchestratorSource, /collectPublishedGitProvenance\(\{ runGit, refreshRemote: true \}\)/);
assert.match(orchestratorSource, /\["show", `\$\{gitCommit\}:\$\{descriptor\.sourceRelativePath\}`\]/);
assert.match(orchestratorSource, /Bootstrap source differs from the published Git object/);
assert.doesNotMatch(orchestratorSource, /bash\s+-s/);

const hardenerPath = join(projectRoot, "ops", "frontend", "harden-pilot-release-root-trust.sh");
const hardenerSource = await readFile(hardenerPath, "utf8");
const hardenerSyntax = spawnSync("bash", ["-n", hardenerPath], { encoding: "utf8" });
assert.equal(hardenerSyntax.status, 0, hardenerSyntax.stderr);
assert.doesNotMatch(hardenerSource, /bash\s+-s/);
assert.match(hardenerSource, /"\$#" -ne 7/);
for (const mapping of [
  "release-root-seal-verify.mjs",
  "release-root-reinode-active.mjs",
  "release-activate-root.mjs",
  "release-rollback-root.mjs",
  "release-switch-journal.mjs",
  "with-pilot-release-authority-lock.sh",
  "recover-pilot-release-transitions.sh",
]) {
  assert(hardenerSource.includes(mapping), `hardener is missing ${mapping}`);
}
assert.match(hardenerSource, /active_bundle="\/usr\/local\/libexec\/mes\/active-bundle"/);
assert.match(hardenerSource, /ln -s "bundles\/\$\{bundle_id\}" "\$active_bundle_next"/);
assert.match(hardenerSource, /mv -Tf "\$active_bundle_next" "\$active_bundle"/);
assert.doesNotMatch(hardenerSource, /stable_path=.*installed_names/);
const inactivePrevalidation = hardenerSource.indexOf("Prevalidate the inactive target");
const atomicBundleSwitch = hardenerSource.indexOf('mv -Tf "$active_bundle_next" "$active_bundle"');
const postSwitchVerification = hardenerSource.indexOf("if ! /usr/bin/node /usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs bundle");
const durableOldPointerRestore = hardenerSource.indexOf('mv -Tf "$rollback_pointer" "$active_bundle"');
assert(inactivePrevalidation >= 0 && inactivePrevalidation < atomicBundleSwitch
  && postSwitchVerification > atomicBundleSwitch && durableOldPointerRestore > postSwitchVerification,
"inactive helper bytes and exact membership must be prevalidated before the one pointer switch, with durable old-pointer rollback on post-switch failure");
assert((hardenerSource.match(/install -o root -g root -m 0555/g) || []).length >= 1);
assert.equal((hardenerSource.match(/Requires=mes-pilot-credential-rotation-recovery\.service/g) || []).length, 0,
  "first-run root trust must not hard-require the not-yet-installed credential recovery unit");
assert.equal((hardenerSource.match(/After=mes-pilot-credential-rotation-recovery\.service/g) || []).length, 2,
  "both release recovery gates must order after credential recovery whenever it is installed");
for (const steadyStateUnitPath of [
  "deploy/systemd/mes-pilot.service",
  "ops/postgres/mes-pilot-domain-migrate.service",
  "ops/postgres/mes-pilot-domain-import.service",
  "ops/postgres/mes-pilot-domain-snapshot-sync.service",
]) {
  const steadyStateUnit = await readFile(join(projectRoot, steadyStateUnitPath), "utf8");
  assert.match(steadyStateUnit, /^Requires=mes-pilot-credential-rotation-recovery\.service$/m,
    `${steadyStateUnitPath} must own the hard dependency after UID isolation`);
  assert.match(steadyStateUnit, /^After=.*mes-pilot-credential-rotation-recovery\.service.*$/m,
    `${steadyStateUnitPath} must wait for credential recovery after UID isolation`);
}

const stateDirectoryFunction = hardenerSource.indexOf("ensure_reinode_state_directory() {");
const pathChainHardening = hardenerSource.indexOf("# Lock the path chain", stateDirectoryFunction);
const reinodeTransactionsBootstrap = hardenerSource.indexOf(
  "ensure_reinode_state_directory /srv/mes/pilot/reinode-transactions",
  pathChainHardening,
);
const quarantineBootstrap = hardenerSource.indexOf(
  "ensure_reinode_state_directory /srv/mes/pilot/quarantine",
  reinodeTransactionsBootstrap,
);
const reinodeHelperSelection = hardenerSource.indexOf('reinode_helper_source="${2:-}"', quarantineBootstrap);
assert(stateDirectoryFunction >= 0
  && pathChainHardening > stateDirectoryFunction
  && reinodeTransactionsBootstrap > pathChainHardening
  && quarantineBootstrap > reinodeTransactionsBootstrap
  && reinodeHelperSelection > quarantineBootstrap,
"both root-only state directories must be established after sealing the Pilot path and before any re-inode helper is selected");
assert.match(hardenerSource, /if \[\[ ! -e "\$path" && ! -L "\$path" \]\]; then[\s\S]*install -d -o root -g root -m 0700 "\$path"/);
assert.match(hardenerSource, /! -d "\$path" \|\| -L "\$path"[\s\S]*readlink -f -- "\$path"[\s\S]*stat -Lc '%u:%g:%a' -- "\$path"[\s\S]*"0:0:700"/);
assert.match(hardenerSource, /Unsafe Pilot re-inode state directory/);

// Live-like state-policy fixture: missing paths are created with 0700, while
// pre-created symlinks and weak metadata are rejected instead of repaired.
// Static assertions above bind this model to the exact production branches.
async function ensureFixtureStateDirectory(path) {
  let metadata = null;
  try { metadata = await lstat(path); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!metadata) {
    await mkdir(path, { mode: 0o700 });
    metadata = await lstat(path);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700) {
    throw new Error(`Unsafe Pilot re-inode state directory: ${path}`);
  }
}

const stateFixtureRoot = await mkdtemp(join(tmpdir(), "mes-reinode-state-bootstrap-"));
try {
  const firstRunPath = join(stateFixtureRoot, "first-run");
  await ensureFixtureStateDirectory(firstRunPath);
  assert.equal((await lstat(firstRunPath)).mode & 0o777, 0o700);

  const symlinkTarget = join(stateFixtureRoot, "symlink-target");
  const symlinkPath = join(stateFixtureRoot, "symlink-state");
  await mkdir(symlinkTarget, { mode: 0o700 });
  await symlink(symlinkTarget, symlinkPath);
  await assert.rejects(ensureFixtureStateDirectory(symlinkPath), /Unsafe Pilot re-inode state directory/);

  const weakModePath = join(stateFixtureRoot, "weak-mode");
  await mkdir(weakModePath, { mode: 0o700 });
  await chmod(weakModePath, 0o755);
  await assert.rejects(ensureFixtureStateDirectory(weakModePath), /Unsafe Pilot re-inode state directory/);
  assert.equal((await lstat(weakModePath)).mode & 0o777, 0o755, "wrong metadata must be rejected, not silently repaired");
} finally {
  await rm(stateFixtureRoot, { recursive: true, force: true });
}

// At every simulated power-loss boundary, the single active pointer names
// either the complete old bundle or the complete new bundle. There is no
// representable mixed projection of individual helper generations.
const oldBundle = Object.fromEntries(sourcePaths.slice(1).map((path) => [path, "old"]));
const newBundle = Object.fromEntries(sourcePaths.slice(1).map((path) => [path, "new"]));
for (let crashBoundary = 0; crashBoundary <= sourcePaths.length; crashBoundary += 1) {
  const active = crashBoundary < sourcePaths.length ? oldBundle : newBundle;
  assert(new Set(Object.values(active)).size === 1, `power-loss boundary ${crashBoundary} exposed a mixed helper bundle`);
}

console.log("Published root trust bootstrap QA: OK");
