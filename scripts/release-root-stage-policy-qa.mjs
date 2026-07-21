#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PILOT_RELEASES_ROOT,
  PILOT_ROOT_STAGE_REMOTE,
  PILOT_ROOT_TRUST_CHAIN,
  assertCanonicalPilotReleasePath,
  assertRootOwnedDirectoryMetadata,
  buildPilotReleaseSealCommand,
  buildPilotReleaseTrustVerificationCommand,
  buildPilotRootTrustPreflightCommand,
  resolveReleaseStageRemote,
} from "./release-root-stage-policy.mjs";

const projectRoot = resolve(import.meta.dirname, "..");

assert.equal(resolveReleaseStageRemote("pilot"), PILOT_ROOT_STAGE_REMOTE);
assert.equal(resolveReleaseStageRemote("pilot", "mes-line-root"), PILOT_ROOT_STAGE_REMOTE);
assert.throws(() => resolveReleaseStageRemote("pilot", "mes-line"), /root-authenticated/);
assert.throws(() => resolveReleaseStageRemote("pilot", "root@194.58.115.217"), /mes-line-root/);
assert.equal(resolveReleaseStageRemote("staging"), "mes-line");
assert.equal(resolveReleaseStageRemote("staging", "mes-stage-custom"), "mes-stage-custom");

const releasePath = `${PILOT_RELEASES_ROOT}/v.1.500.qa-deadbee`;
assert.equal(assertCanonicalPilotReleasePath(releasePath), releasePath);
for (const invalid of [
  PILOT_RELEASES_ROOT,
  `${PILOT_RELEASES_ROOT}/../escape`,
  `${PILOT_RELEASES_ROOT}/nested/release`,
  `${PILOT_RELEASES_ROOT}/release/..`,
]) {
  assert.throws(() => assertCanonicalPilotReleasePath(invalid), /one direct child/);
}

assert.equal(assertRootOwnedDirectoryMetadata("/trusted", {
  uid: 0,
  gid: 0,
  mode: 0o755,
  isDirectory: true,
  isSymbolicLink: false,
}), true);
assert.throws(() => assertRootOwnedDirectoryMetadata("/deploy-owned", {
  uid: 1001,
  gid: 1001,
  mode: 0o755,
  isDirectory: true,
  isSymbolicLink: false,
}), /not root:root/);
assert.throws(() => assertRootOwnedDirectoryMetadata("/writable-parent", {
  uid: 0,
  gid: 0,
  mode: 0o775,
  isDirectory: true,
  isSymbolicLink: false,
}), /group\/other writable/);
assert.throws(() => assertRootOwnedDirectoryMetadata("/symlink", {
  uid: 0,
  gid: 0,
  mode: 0o755,
  isDirectory: true,
  isSymbolicLink: true,
}), /not a real directory/);

const preflight = buildPilotRootTrustPreflightCommand();
const seal = buildPilotReleaseSealCommand(releasePath);
const verify = buildPilotReleaseTrustVerificationCommand(releasePath);
for (const command of [preflight, seal, verify]) {
  assert.match(command, /id -u/);
  assert.match(command, /0:0/);
  assert.match(command, /-perm \/022/);
  for (const path of PILOT_ROOT_TRUST_CHAIN) assert(command.includes(path), `missing trusted chain path ${path}`);
  const syntax = spawnSync("bash", ["-n"], { input: command, encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
}
assert.match(seal, /chown -hR 0:0/);
assert.match(seal, /chmod go-w/);
assert.match(verify, /symlink outside node_modules/);
assert.match(verify, /symlink escapes candidate node_modules/);

const stageSource = await readFile(join(projectRoot, "scripts", "release-stage.mjs"), "utf8");
assert.match(stageSource, /resolveReleaseStageRemote\(args\.contour, args\.remote\)/);
assert.match(stageSource, /assertNoTrackedRuntimeSymlinks/);
assert.match(stageSource, /assertLocalDistHasNoSymlinks/);
assert.match(stageSource, /buildPilotRootTrustPreflightCommand/);
assert.match(stageSource, /buildPilotReleaseSealCommand/);
assert.match(stageSource, /buildPilotReleaseTrustVerificationCommand/);
assert.match(stageSource, /materializePublishedGitSnapshot\(\{ projectRoot, gitCommit \}\)/);
assert.match(stageSource, /const sourceRoot = publishedSnapshot\.root/);
assert.match(stageSource, /cwd: sourceRoot/);
assert.match(stageSource, /downloadPinnedBootstrapSnapshot/);
assert.match(stageSource, /installPinnedBootstrapSnapshotArtifact/);
assert.match(stageSource, /Pinned bootstrap digest mismatch/);
assert.doesNotMatch(stageSource, /ensureBootstrapSnapshotArtifact/);
assert.doesNotMatch(stageSource, /prepareLocalBootstrapSnapshotArtifact/);
assert.doesNotMatch(stageSource, /installBootstrapSnapshotArtifact/);
const chainCall = stageSource.indexOf("sshArgs(args.remote, buildPilotRootTrustPreflightCommand())");
const nonexistenceCheck = stageSource.indexOf("test ! -e", chainCall);
const freshReleaseInstall = stageSource.indexOf("install -d -o root -g root -m 0755", nonexistenceCheck);
assert(chainCall >= 0 && nonexistenceCheck > chainCall && freshReleaseInstall > nonexistenceCheck, "Pilot chain and exact nonexistence must be proved before creating fresh root-owned release inodes");
assert.match(stageSource, /Release path already exists/);
assert.match(stageSource, /bootstrapPublishedPilotRootTrust\(\{/);
assert.doesNotMatch(stageSource, /installPublishedPilotRootTrustTools/);
assert.match(stageSource, /provenanceVerification: gitProvenance\.verification/);
assert.match(stageSource, /ROOT_SEAL_HELPER_PATH/);
assert.match(stageSource, /ROOT_RELEASE_TRUST_ATTESTATION/);
assert(stageSource.includes('sourceRelativePath: "scripts/release-activate.mjs"') && stageSource.includes("FIXED_ROOT_ACTIVATE_RUNNER"));
assert(stageSource.includes('sourceRelativePath: "scripts/release-rollback.mjs"') && stageSource.includes("FIXED_ROOT_ROLLBACK_RUNNER"));
assert.match(stageSource, /method: "fresh-root-stage"/);
assert.match(stageSource, /installedBy: "root-ssh-clean-published-commit-new-inodes"/);
assert.match(stageSource, /bootstrapGzipSha256/);
assert.match(stageSource, /bootstrapBrotliSha256/);
assert.match(stageSource, /dist\/bootstrap-snapshot\.json\.gz/);
assert.match(stageSource, /dist\/bootstrap-snapshot\.json\.br/);
assert.match(stageSource, /npm ci --omit=dev --ignore-scripts/);
assert.doesNotMatch(stageSource, /npm ci --omit=dev(?:"|`|\n)/);
assert((stageSource.match(/buildPilotReleaseSealCommand/g) || []).length >= 2, "Pilot release must be sealed before execution and after remote preflight");
assert.match(stageSource, /root SSH from a clean published commit/);
const firstFixedContentVerification = stageSource.indexOf('await run("ssh", sshArgs(args.remote, fixedContentVerificationCommand({');
const remoteCandidatePreflight = stageSource.indexOf("const remotePreflight = [");
assert(firstFixedContentVerification >= 0 && firstFixedContentVerification < remoteCandidatePreflight, "fixed root content verification must bind exact candidate bytes before npm or candidate scripts execute");
const remoteCandidatePreflightEnd = stageSource.indexOf('].join("\\n");', remoteCandidatePreflight);
const remoteCandidatePreflightSource = stageSource.slice(remoteCandidatePreflight, remoteCandidatePreflightEnd);
assert.match(remoteCandidatePreflightSource, /install -d -o mes-stage -g mes-stage -m 0700[^\n]*\$stage_scratch\/runtime\/shared-state[^\n]*\$stage_scratch\/runtime\/backups[^\n]*\$stage_scratch\/runtime\/audit/);
assert.match(remoteCandidatePreflightSource, /\/usr\/bin\/env -i [^\n]*MES_SHARED_STATE_DIR="\$stage_scratch\/runtime\/shared-state" MES_BACKUP_DIR="\$stage_scratch\/runtime\/backups" MES_AUDIT_LOG_PATH="\$stage_scratch\/runtime\/audit\/audit\.log" \/usr\/bin\/npm run server:preflight/);
for (const livePath of ["/srv/mes/pilot/shared-state", "/srv/mes/pilot/backups", "/srv/mes/pilot/audit", "/srv/mes/dev/shared-state", "/srv/mes/dev/backups", "/srv/mes/dev/audit"]) {
  assert(!remoteCandidatePreflightSource.includes(livePath), `mes-stage candidate preflight must not receive live write path ${livePath}`);
}
const stagePreflightRuntime = await mkdtemp(join(tmpdir(), "mes-stage-preflight-runtime-"));
try {
  const sharedStateDir = join(stagePreflightRuntime, "shared-state");
  const backupDir = join(stagePreflightRuntime, "backups");
  const auditDir = join(stagePreflightRuntime, "audit");
  await Promise.all([mkdir(sharedStateDir), mkdir(backupDir), mkdir(auditDir)]);
  const isolatedPreflight = spawnSync(process.execPath, [join(projectRoot, "scripts", "server-preflight.mjs"), "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      HOME: stagePreflightRuntime,
      PATH: process.env.PATH || "/usr/bin:/bin",
      APP_ENV: "pilot",
      PORT: "4175",
      APP_BASE_URL: "https://pilot.mes-line.ru",
      MES_SHARED_STATE_DIR: sharedStateDir,
      MES_BACKUP_DIR: backupDir,
      MES_AUDIT_LOG_PATH: join(auditDir, "audit.log"),
      MES_ALLOW_DESTRUCTIVE_ACTIONS: "false",
      MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE: "false",
    },
  });
  assert.equal(isolatedPreflight.status, 0, isolatedPreflight.stderr || isolatedPreflight.stdout);
  const isolatedResult = JSON.parse(isolatedPreflight.stdout);
  assert.equal(isolatedResult.appEnv, "pilot");
  assert.equal(isolatedResult.failures.length, 0);
  assert.equal(isolatedResult.checks.filter((item) => item.endsWith(": writable")).length, 3);
} finally {
  await rm(stagePreflightRuntime, { recursive: true, force: true });
}
assert.match(stageSource, /--mode=verify/);
assert.match(stageSource, /--confirm=VERIFY_ROOT_STAGED_RELEASE/);

const helperPath = join(projectRoot, "ops", "frontend", "harden-pilot-release-root-trust.sh");
const helperSource = await readFile(helperPath, "utf8");
const helperSyntax = spawnSync("bash", ["-n", helperPath], { encoding: "utf8" });
assert.equal(helperSyntax.status, 0, helperSyntax.stderr);
assert.doesNotMatch(helperSource, /bash\s+-s/);
assert.match(helperSource, /SHA-verified root-uploaded helper paths/);
assert.match(helperSource, /release-root-seal-verify\.mjs/);
assert.match(helperSource, /release-root-reinode-active\.mjs/);
assert.match(helperSource, /release-activate-root\.mjs/);
assert.match(helperSource, /release-rollback-root\.mjs/);
assert.match(helperSource, /release-switch-journal\.mjs/);
assert.match(helperSource, /with-pilot-release-authority-lock\.sh/);
assert.match(helperSource, /recover-pilot-release-transitions\.sh/);
assert.match(helperSource, /"\$#" -ne 7/);
assert.match(helperSource, /active_bundle="\/usr\/local\/libexec\/mes\/active-bundle"/);
assert.match(helperSource, /mv -Tf "\$active_bundle_next" "\$active_bundle"/);
assert.match(helperSource, /install -o root -g root -m 0555/);
const hardeningLoop = helperSource.slice(helperSource.indexOf("for path in /srv/mes"), helperSource.indexOf("seal_verifier_source="));
assert(hardeningLoop.indexOf("/srv/mes /srv/mes/pilot /srv/mes/pilot/releases") >= 0
  && hardeningLoop.indexOf('chown 0:0 -- "$path"') < hardeningLoop.indexOf('assert_root_sealed "$path"'),
"each ordered Pilot path component must become root-owned before it is accepted as sealed");

// Executable live-like fixture: the same 0775 parent metadata that exists on
// the old deploy-owned layout must be rejected before any release is trusted.
const fixtureRoot = await mkdtemp(join(tmpdir(), "mes-root-stage-policy-"));
try {
  const writableParent = join(fixtureRoot, "releases");
  await chmod(fixtureRoot, 0o755);
  await mkdir(writableParent);
  await chmod(writableParent, 0o775);
  const metadata = await lstat(writableParent);
  assert.throws(() => assertRootOwnedDirectoryMetadata(writableParent, {
    uid: 0,
    gid: 0,
    mode: metadata.mode,
    isDirectory: metadata.isDirectory(),
    isSymbolicLink: metadata.isSymbolicLink(),
  }), /group\/other writable/);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log("Root-owned release staging policy QA: OK");
