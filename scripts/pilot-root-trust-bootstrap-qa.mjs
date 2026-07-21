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
  "scripts/release-verify.mjs",
  "scripts/release-tree-sha.mjs",
  "scripts/react-runtime-policy.mjs",
  "scripts/release-activate.mjs",
  "scripts/release-rollback.mjs",
  "scripts/release-switch-journal.mjs",
  "ops/frontend/with-pilot-release-authority-lock.sh",
  "ops/frontend/recover-pilot-release-transitions.sh",
  "ops/frontend/mes-pilot-bootstrap-snapshot-bind.conf",
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

const recoveryPath = join(projectRoot, "ops", "frontend", "recover-pilot-release-transitions.sh");
const recoverySource = await readFile(recoveryPath, "utf8");
const recoverySyntax = spawnSync("bash", ["-n", recoveryPath], { encoding: "utf8" });
assert.equal(recoverySyntax.status, 0, recoverySyntax.stderr);
assert.match(recoverySource, /export MES_RELEASE_RECOVERY_CONSUMER="\$consumer"\nexec \/usr\/bin\/node "\$SWITCH_HELPER" recover --contour=pilot --prestart=true\s*$/,
  "release recovery must exec the final verifier so process.pid remains the exact fd9 flock owner");
assert.doesNotMatch(recoverySource, /\/usr\/bin\/node "\$SWITCH_HELPER" recover[^\n]*\n(?:printf|echo)/,
  "release recovery must not spawn the exact-owner verifier as a child and then continue in the shell");
const switchJournalSource = await readFile(join(projectRoot, "scripts", "release-switch-journal.mjs"), "utf8");
assert.match(switchJournalSource, /recoveryConsumer && !\["app", "writer"\]\.includes\(recoveryConsumer\)/);
assert.match(switchJournalSource, /PILOT_RELEASE_RECOVERY_OK consumer=\$\{recoveryConsumer\}/);

const hardenerPath = join(projectRoot, "ops", "frontend", "harden-pilot-release-root-trust.sh");
const hardenerSource = await readFile(hardenerPath, "utf8");
const hardenerSyntax = spawnSync("bash", ["-n", hardenerPath], { encoding: "utf8" });
assert.equal(hardenerSyntax.status, 0, hardenerSyntax.stderr);
assert.doesNotMatch(hardenerSource, /bash\s+-s/);
assert.match(hardenerSource, /"\$#" -ne 11/);
assert.match(hardenerSource, /lock_wrapper_source="\$\{9:-\}"/);
assert.match(hardenerSource, /-- \/bin\/bash "\$0" --locked "\$@"/);
const atomicInstallFunction = hardenerSource.match(/atomic_install_config\(\) \{\n[\s\S]*?\n\}/)?.[0];
assert(atomicInstallFunction, "hardener must define atomic_install_config");
assert.match(atomicInstallFunction, /local target="\$1"\n\s+local source="\$2"\n\s+local next="\$\{target\}\.next\.\$\{bundle_id\}\.\$\$"/);
const atomicInstallHarness = spawnSync("bash", ["-c", `
set -euo pipefail
bundle_id="qa-bundle"
install() { :; }
mv() { :; }
sync_path() { :; }
${atomicInstallFunction}
atomic_install_config /tmp/mes-qa-target /tmp/mes-qa-source
`], { encoding: "utf8" });
assert.equal(atomicInstallHarness.status, 0, atomicInstallHarness.stderr || "atomic_install_config must be nounset-safe");
for (const mapping of [
  "release-root-seal-verify.mjs",
  "release-root-reinode-active.mjs",
  "release-verify.mjs",
  "release-tree-sha.mjs",
  "react-runtime-policy.mjs",
  "release-activate-root.mjs",
  "release-rollback-root.mjs",
  "release-switch-journal.mjs",
  "with-pilot-release-authority-lock.sh",
  "recover-pilot-release-transitions.sh",
]) {
  assert(hardenerSource.includes(mapping), `hardener is missing ${mapping}`);
}
assert.match(hardenerSource, /active_bundle="\/usr\/local\/libexec\/mes\/active-bundle"/);
assert.match(hardenerSource, /bootstrap_bind_source="\$\{11:-\}"/);
assert.match(hardenerSource, /bootstrap_bind_target=\/etc\/systemd\/system\/mes-pilot\.service\.d\/06-bootstrap-snapshot-bind\.conf/);
assert.match(hardenerSource, /if \[\[ -f "\$sealed_bootstrap" && ! -L "\$sealed_bootstrap" \]\]; then[\s\S]*atomic_install_config "\$bootstrap_bind_target" "\$bootstrap_bind_source"/);
assert.match(hardenerSource, /elif \[\[ -e "\$bootstrap_bind_target" \|\| -L "\$bootstrap_bind_target" \]\]; then[\s\S]*sha256sum "\$bootstrap_bind_target"[\s\S]*rm -f -- "\$bootstrap_bind_target"/);
assert.equal((hardenerSource.match(/atomic_install_config "\$bootstrap_bind_target" "\$bootstrap_bind_source"/g) || []).length, 1,
  "the mandatory bind may be published only inside the sealed-mirror-ready branch");
assert.match(hardenerSource, /stat -Lc '%u:%g:%a:%h'.*operational_bootstrap[\s\S]*0:0:444:1/);
assert.match(hardenerSource, /runuser -u "\$runtime_reader" -- test -r "\$operational_bootstrap"/);
assert.match(hardenerSource, /runuser -u mes-stage -- test -r "\$operational_bootstrap"/);
assert.match(hardenerSource, /Active re-inode is[\s\S]*allowed to atomically seed manifest-bound mirror bytes/);
assert.doesNotMatch(hardenerSource, /(?:cp|install)[^\n]*"\$operational_bootstrap"[^\n]*"\$sealed_bootstrap/,
  "root trust bootstrap must never copy mutable runtime bytes into the sealed mirror");
assert.doesNotMatch(hardenerSource, /sealed_bootstrap_next=/,
  "root trust bootstrap must leave an absent mirror absent until active re-inode seeds it");
const bindReadyBranch = hardenerSource.indexOf('if [[ -f "$sealed_bootstrap" && ! -L "$sealed_bootstrap" ]]; then');
const bindPublication = hardenerSource.indexOf('atomic_install_config "$bootstrap_bind_target" "$bootstrap_bind_source"', bindReadyBranch);
const firstRunResidueBranch = hardenerSource.indexOf('elif [[ -e "$bootstrap_bind_target" || -L "$bootstrap_bind_target" ]]; then', bindPublication);
const firstRunResidueRemoval = hardenerSource.indexOf('rm -f -- "$bootstrap_bind_target"', firstRunResidueBranch);
const daemonReload = hardenerSource.indexOf("systemctl daemon-reload", firstRunResidueRemoval);
assert(bindReadyBranch >= 0 && bindPublication > bindReadyBranch
  && firstRunResidueBranch > bindPublication && firstRunResidueRemoval > firstRunResidueBranch
  && daemonReload > firstRunResidueRemoval,
"first-run bootstrap must either publish after a sealed mirror or remove only exact managed residue before daemon-reload");

// Adversarial first-run model bound to the exact production branches above:
// a missing mirror cannot expose the mandatory bind, including when recovering
// the exact residue from the older unsafe ordering. Unknown residue fails
// closed instead of being silently removed.
function firstRunBindDecision({ mirrorExists, bindExists, bindIsExactManaged }) {
  if (mirrorExists) return "publish";
  if (!bindExists) return "defer";
  if (!bindIsExactManaged) throw new Error("unsafe bootstrap bind residue");
  return "remove-managed-residue";
}
assert.equal(firstRunBindDecision({ mirrorExists: false, bindExists: false, bindIsExactManaged: false }), "defer");
assert.equal(firstRunBindDecision({ mirrorExists: false, bindExists: true, bindIsExactManaged: true }), "remove-managed-residue");
assert.throws(
  () => firstRunBindDecision({ mirrorExists: false, bindExists: true, bindIsExactManaged: false }),
  /unsafe bootstrap bind residue/,
);
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
