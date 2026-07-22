#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const [
  recoveryUnit,
  releaseAuthorityWrapper,
  sharedAuthorityWrapper,
  identityLock,
  credentialRecovery,
  uidRecovery,
  rootTrustInstaller,
  appUnit,
  migrationUnit,
  importUnit,
  snapshotSyncUnit,
  uidIsolationInstaller,
  releaseRecoveryAppDependency,
  releaseRecoveryWriterDependency,
] = await Promise.all([
  "ops/security/mes-pilot-credential-rotation-recovery.service",
  "ops/frontend/with-pilot-release-authority-lock.sh",
  "ops/shared-state/with-authority-rollout-lock.sh",
  "ops/security/pilot-root-identity-lock.sh",
  "ops/security/recover-pilot-credential-rotation.sh",
  "ops/security/recover-pilot-uid-cutover.sh",
  "ops/frontend/harden-pilot-release-root-trust.sh",
  "deploy/systemd/mes-pilot.service",
  "ops/postgres/mes-pilot-domain-migrate.service",
  "ops/postgres/mes-pilot-domain-import.service",
  "ops/postgres/mes-pilot-domain-snapshot-sync.service",
  "ops/security/install-pilot-runtime-uid-isolation.sh",
  "ops/security/mes-pilot-release-recovery-app-credential-recovery.conf",
  "ops/security/mes-pilot-release-recovery-writer-credential-recovery.conf",
].map((path) => readFile(join(projectRoot, path), "utf8")));

const aggregateCommand = String.raw`ExecStart=/bin/bash /usr/local/libexec/mes/active-bundle/with-pilot-release-authority-lock.sh --operation=runtime-security-recovery --busy-policy=app-intent -- /bin/bash -ceu '/usr/local/libexec/mes/pilot-runtime-security-dispatch recover-pilot-credential-rotation.sh; /usr/local/libexec/mes/pilot-runtime-security-dispatch recover-pilot-uid-cutover.sh'`;
assert(recoveryUnit.includes(aggregateCommand),
  "automatic recovery must enter the fixed active-bundle fd9 wrapper exactly once");
assert.equal((recoveryUnit.match(/^ExecStart=/gm) || []).length, 1,
  "credential and UID recovery may not leave an fd9 race between separate ExecStart processes");
assert.doesNotMatch(recoveryUnit, /^(?:Requires|After)=.*mes-pilot-release-recovery-/m,
  "credential recovery must not depend on release recovery");

for (const wrapper of [sharedAuthorityWrapper, releaseAuthorityWrapper]) {
  assert.match(wrapper, /set -euo pipefail\n(?:#[^\n]*\n)*set \+m/,
    "fd9 wrappers must disable inherited monitor mode before an asynchronous setsid launcher");
  assert.match(wrapper, /flock --exclusive --nonblock[\s\S]*--no-fork[\s\S]*"\$(?:lock_file|LOCK_FILE)"/,
    "fd9 wrappers must use util-linux's supported file-path command form");
  assert.match(wrapper, /\/bin\/bash --noprofile --norc "\$\(readlink -f -- "\$0"\)"/,
    "same-PID re-entry must remain readable when the verified bootstrap wrapper is mode 0400");
  assert(wrapper.includes("adopt_flock_path_fd()")
    && wrapper.includes("for candidate in /proc/$$/fdinfo/[0-9]*")
    && wrapper.includes("[[ ${#candidates[@]} -eq 1 ]]")
    && wrapper.includes('prove_fd_lock "$$" "$target_fd" "$expected_file"'),
  "fd9 wrappers must uniquely locate, dup and re-prove the flock-owned OFD");
  assert(wrapper.includes("/usr/bin/setsid /usr/bin/env")
    && wrapper.includes("trap 'forward_signal INT 130 TERM' INT"),
    "fd9 lock owners must run in a separate session and translate ignored background SIGINT to TERM");
  assert.match(wrapper, /kill -s "\$child_signal" -- "-\$child_pid"[\s\S]*attempts[\s\S]*kill -KILL -- "-\$child_pid"/,
    "signal forwarding must terminate the lock-owner process group with a bounded escalation");
  assert.doesNotMatch(wrapper, /flock[^\n]*--no-fork[^\n]*(?:"?9"?|\$AUTHORITY_FD)\s+"?\$0"?/,
    "unsupported util-linux FD-number plus command syntax must never return");
}
assert.match(sharedAuthorityWrapper, /export MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD=1[\s\S]*exec "\$@"/,
  "the shared sentinel must be exported only by the proved same-PID owner re-entry");
assert.match(releaseAuthorityWrapper, /^AUTHORITY_FD=9$/m);
assert.match(releaseAuthorityWrapper, /^IDENTITY_FD=8$/m);
assert.match(releaseAuthorityWrapper, /MES_RELEASE_AUTHORITY_LOCK_HELD=1/);
assert.match(releaseAuthorityWrapper, /MES_RELEASE_AUTHORITY_LOCK_FD="\$AUTHORITY_FD"/);
assert.match(releaseAuthorityWrapper, /MES_RELEASE_AUTHORITY_LOCK_OWNER_PID="\$\$"/);
assert.match(releaseAuthorityWrapper, /owner_marker_matches_child[\s\S]*Preserve command exit codes verbatim/,
  "release wrapper must distinguish an acquisition conflict from protected status 75/200");
assert.match(releaseAuthorityWrapper, /flock --exclusive --wait 2 --conflict-exit-code 75/,
  "release intent cleanup must not wait forever behind a surviving descendant or successor");

assert.match(identityLock, /exec \/usr\/bin\/python3 -I -S -c/,
  "fd8 acquisition must use the isolated same-PID syscall bridge");
assert.match(identityLock, /fcntl\.flock\(fd, fcntl\.LOCK_EX \| fcntl\.LOCK_NB\)/);
assert.match(identityLock, /environment\[result_key\] = "busy"[\s\S]*os\.execve/,
  "fd8 EWOULDBLOCK must re-enter the caller in the same PID so busy policy executes");
assert.match(identityLock, /if fd == 8:[\s\S]*os\.set_inheritable\(fd, True\)[\s\S]*os\.dup2\(fd, 8, inheritable=True\)/,
  "fd8 acquisition must survive exec even when os.open returns fd 8 directly");
assert.match(identityLock, /environment\[result_key\] = "held"[\s\S]*os\.execve/);
assert.doesNotMatch(identityLock, /exec 9/,
  "identity acquisition must retain and never replace the authority fd9");
for (const recovery of [credentialRecovery, uidRecovery]) {
  assert.doesNotMatch(recovery, /flock -n 9/,
    "recovery preflight must not mutate the recorded owner of inherited fd9");
  assert(recovery.includes("/proc/$$/fdinfo/9")
    && recovery.includes('$3 == "FLOCK"')
    && recovery.includes('$5 == "WRITE"')
    && recovery.includes('$6 == owner_pid'),
  "recovery preflight must prove exact fd9 owner PID and inode through fdinfo");
}

for (const consumer of ["application start", "direct writers"]) {
  const start = rootTrustInstaller.indexOf(`Description=MES Pilot release recovery gate for ${consumer}`);
  assert(start >= 0, `missing ${consumer} release recovery unit`);
  const block = rootTrustInstaller.slice(start, start + 760);
  assert.doesNotMatch(block, /Requires=mes-pilot-credential-rotation-recovery\.service/,
    "first-run release recovery must not require a credential unit that UID isolation has not installed yet");
  assert.match(block, /After=mes-pilot-credential-rotation-recovery\.service/);
}
assert.match(rootTrustInstaller, /Requires=mes-pilot-release-recovery-app\.service[\s\S]*After=mes-pilot-release-recovery-app\.service/);
assert.match(rootTrustInstaller, /Requires=mes-pilot-release-recovery-writer\.service[\s\S]*After=mes-pilot-release-recovery-writer\.service/);

const releaseRecoveryCredentialDependency = `[Unit]
Requires=mes-pilot-credential-rotation-recovery.service
After=mes-pilot-credential-rotation-recovery.service
`;
assert.equal(releaseRecoveryAppDependency, releaseRecoveryCredentialDependency);
assert.equal(releaseRecoveryWriterDependency, releaseRecoveryCredentialDependency);

const credentialRecoveryUnitInstall = uidIsolationInstaller.indexOf(
  'install_root_file_atomically "${SCRIPT_DIR}/mes-pilot-credential-rotation-recovery.service"',
);
const releaseRecoveryAppDependencyInstall = uidIsolationInstaller.indexOf(
  'install_persistent_release_recovery_dependency \\\n  "${SCRIPT_DIR}/mes-pilot-release-recovery-app-credential-recovery.conf"',
);
const releaseRecoveryWriterDependencyInstall = uidIsolationInstaller.indexOf(
  'install_persistent_release_recovery_dependency \\\n  "${SCRIPT_DIR}/mes-pilot-release-recovery-writer-credential-recovery.conf"',
);
const firstDaemonReload = uidIsolationInstaller.indexOf("systemctl daemon-reload");
const identityCreation = uidIsolationInstaller.indexOf("getent group mes-pilot >/dev/null");
const firstJournalMutation = uidIsolationInstaller.indexOf("\nprepare_uid_cutover_journal\n", identityCreation);
assert(credentialRecoveryUnitInstall >= 0
  && credentialRecoveryUnitInstall < releaseRecoveryAppDependencyInstall
  && releaseRecoveryAppDependencyInstall < releaseRecoveryWriterDependencyInstall
  && releaseRecoveryWriterDependencyInstall < firstDaemonReload
  && firstDaemonReload < identityCreation
  && identityCreation < firstJournalMutation,
"UID isolation must publish the required unit and both persistent release-recovery hard edges before its first graph reload and before identity/journal mutation");
assert.match(uidIsolationInstaller, /install_persistent_release_recovery_dependency\(\)[\s\S]*Existing release-recovery dependency drop-in differs[\s\S]*install_root_file_atomically "\$source" "\$target" 0644[\s\S]*failed verification/,
  "persistent dependency bridges must fail closed on conflicting state and verify atomic first install");

// The bootstrap graph is startable before UID isolation (After-only). After
// UID isolation's first daemon-reload, both release-recovery services fail
// closed on the now-installed credential-recovery unit. Credential recovery
// itself must never depend on either release-recovery service.
assert.doesNotMatch(recoveryUnit, /^(?:Requires|After)=.*mes-pilot-release-recovery-/m);
for (const [name, dependency] of [
  ["application release recovery", releaseRecoveryAppDependency],
  ["writer release recovery", releaseRecoveryWriterDependency],
]) {
  assert.match(dependency, /^Requires=mes-pilot-credential-rotation-recovery\.service$/m,
    `${name} must fail closed after UID isolation`);
  assert.match(dependency, /^After=mes-pilot-credential-rotation-recovery\.service$/m,
    `${name} must start only after credential recovery`);
}

// Once UID isolation publishes the steady-state units, every actual consumer
// owns the hard credential-recovery dependency. The release recovery gate's
// unconditional After edge then serializes it behind credential/UID recovery,
// without creating the first-run missing-unit cycle or a reverse dependency.
for (const [name, unit] of [
  ["application", appUnit],
  ["migration", migrationUnit],
  ["import", importUnit],
  ["snapshot sync", snapshotSyncUnit],
]) {
  assert.match(unit, /^Requires=mes-pilot-credential-rotation-recovery\.service$/m,
    `${name} must fail closed when steady-state credential recovery fails`);
  assert.match(unit, /^After=.*mes-pilot-credential-rotation-recovery\.service.*$/m,
    `${name} must start only after steady-state credential recovery`);
}

if (process.platform !== "linux") {
  console.log("Pilot runtime recovery authority QA: static contract OK; Linux lock-owner topology skipped");
  process.exit(0);
}

const uid = process.getuid();
const gid = process.getgid();
const ownerPrefix = `${uid}:${gid}`;
const qaRoot = await mkdtemp(join(tmpdir(), "mes-runtime-lock-owner-"));
const lockParent = join(qaRoot, "run-lock-mes");
const authorityLock = join(lockParent, "mes-authority-rollout.lock");
const identityLockPath = join(lockParent, "pilot-runtime-uid-isolation.lock");
const runtimeIntent = join(lockParent, "pilot-app-verification.intent");
const releaseIntent = join(lockParent, "mes-release-operation.intent");
const sharedHarnessPath = join(qaRoot, "shared-authority.sh");
const releaseHarnessPath = join(qaRoot, "release-authority.sh");
const bootstrapHarnessPath = join(qaRoot, "release-authority-bootstrap.sh");
const identityHarnessPath = join(qaRoot, "pilot-root-identity-lock.sh");
const operationPath = join(qaRoot, "runtime-operation.sh");
const releaseOwnerCheckPath = join(qaRoot, "release-owner-check.sh");
const busyIdentityCheckPath = join(qaRoot, "busy-identity-check.sh");
const signalCommandPath = join(qaRoot, "signal-command.sh");
const escapedDescendantCommandPath = join(qaRoot, "escaped-descendant-command.sh");
const monitorCommandPath = join(qaRoot, "monitor-command.sh");
const readyPath = join(qaRoot, "ready");
const stopPath = join(qaRoot, "stop");
const ownerLogPath = join(qaRoot, "owners.log");
const identityHolderReadyPath = join(qaRoot, "identity-holder-ready");
const identityHolderStopPath = join(qaRoot, "identity-holder-stop");
const escapedDescendantReadyPath = join(qaRoot, "escaped-descendant-ready");
const escapedDescendantPidPath = join(qaRoot, "escaped-descendant.pid");
const monitorResultPath = join(qaRoot, "monitor-result");

function adaptRootOwnership(source) {
  return source
    .replaceAll('0:0:${mode}', `${ownerPrefix}:\${mode}`)
    .replaceAll("0:0:700", `${ownerPrefix}:700`)
    .replaceAll("0:0:600:1", `${ownerPrefix}:600:1`)
    .replaceAll("0:0:600", `${ownerPrefix}:600`)
    .replaceAll("chown root:root", `chown ${uid}:${gid}`)
    .replaceAll("chown root:root", `chown ${uid}:${gid}`);
}

function capture(child) {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
  return { get stdout() { return stdout; }, get stderr() { return stderr; } };
}

async function waitForPath(path, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolvePromise) => child.once("exit", (code, signal) => resolvePromise({ code, signal })));
}

async function waitForExitWithin(child, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      waitForExit(child),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} did not exit within ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    await waitForExit(child);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function releaseGate(policy, command = ["/usr/bin/true"]) {
  return spawnSync("/bin/bash", [
    releaseHarnessPath,
    "--operation=release-recovery-app",
    `--busy-policy=${policy}`,
    "--",
    ...command,
  ], { encoding: "utf8", env: process.env });
}

try {
  await mkdir(lockParent, { mode: 0o700 });
  await writeFile(authorityLock, "", { mode: 0o600 });
  await writeFile(identityLockPath, "", { mode: 0o600 });

  let sharedHarness = sharedAuthorityWrapper
    .replace('lock_parent="/run/lock/mes"', `lock_parent=${JSON.stringify(lockParent)}`)
    .replace("if [[ ${EUID} -ne 0 ]]; then", "if false; then");
  sharedHarness = adaptRootOwnership(sharedHarness);

  let releaseHarness = releaseAuthorityWrapper
    .replace('LOCK_PARENT="/run/lock/mes"', `LOCK_PARENT=${JSON.stringify(lockParent)}`)
    .replace("[[ ${EUID} -eq 0 ]]", "true")
    .replace("assert_installed_bundle() {", "assert_installed_bundle() { return 0;")
    .replace("assert_no_pilot_runtime_transition_state() {", "assert_no_pilot_runtime_transition_state() { return 0;")
    .replace("release_journal_pending() {", "release_journal_pending() { return 1;");
  releaseHarness = adaptRootOwnership(releaseHarness);

  let bootstrapHarness = releaseAuthorityWrapper
    .replace('LOCK_PARENT="/run/lock/mes"', `LOCK_PARENT=${JSON.stringify(lockParent)}`)
    .replace("[[ ${EUID} -eq 0 ]]", "true")
    .replace('[[ "$invoked" == /root/* ]]', `[[ "$invoked" == ${JSON.stringify(qaRoot)}/* ]]`)
    .replace("assert_no_pilot_runtime_transition_state() {", "assert_no_pilot_runtime_transition_state() { return 0;")
    .replace("release_journal_pending() {", "release_journal_pending() { return 1;");
  bootstrapHarness = adaptRootOwnership(bootstrapHarness);

  let identityHarness = identityLock
    .replace('readonly PILOT_IDENTITY_LOCK_PARENT="/run/lock/mes"',
      `readonly PILOT_IDENTITY_LOCK_PARENT=${JSON.stringify(lockParent)}`)
    .replace('&& "$(stat -c %u "/proc/${owner_pid}")" == 0 ]]',
      `&& "$(stat -c %u "/proc/\${owner_pid}")" == ${uid} ]]`);
  identityHarness = adaptRootOwnership(identityHarness);

  await Promise.all([
    writeFile(sharedHarnessPath, sharedHarness, { mode: 0o700 }),
    writeFile(releaseHarnessPath, releaseHarness, { mode: 0o700 }),
    writeFile(bootstrapHarnessPath, bootstrapHarness, { mode: 0o400 }),
    writeFile(identityHarnessPath, identityHarness, { mode: 0o700 }),
  ]);
  await Promise.all([sharedHarnessPath, releaseHarnessPath, identityHarnessPath].map((path) => chmod(path, 0o700)));
  await chmod(bootstrapHarnessPath, 0o400);

  await writeFile(operationPath, `#!/usr/bin/env bash
set -euo pipefail
mode="\${1:-runtime}"
case "$mode" in
  status75) exit 75 ;;
  status200) exit 200 ;;
  runtime) ;;
  *) exit 2 ;;
esac
[[ "\${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0}" == 1 ]]
source "$QA_IDENTITY_LIBRARY"
set +e
pilot_open_root_identity_lock "$0" "$@"
lock_status=$?
set -e
[[ "$lock_status" -eq 0 ]]
pilot_assert_root_identity_lock_held
authority_inode="$(stat -Lc '%i' -- "$QA_AUTHORITY_LOCK")"
identity_inode="$(stat -Lc '%i' -- "$QA_IDENTITY_LOCK")"
fd9_owner="$(awk -v inode="$authority_inode" '$1=="lock:" && $3=="FLOCK" && $5=="WRITE" { split($7,i,":"); if (i[3]==inode) print $6 }' /proc/$$/fdinfo/9)"
fd8_owner="$(awk -v inode="$identity_inode" '$1=="lock:" && $3=="FLOCK" && $5=="WRITE" { split($7,i,":"); if (i[3]==inode) print $6 }' /proc/$$/fdinfo/8)"
[[ "$fd8_owner" == "$$" && "$fd9_owner" == "$$" ]]
pilot_write_app_verification_intent
"$QA_RELEASE_WRAPPER" --operation=release-recovery-app --busy-policy=app-intent -- /usr/bin/true
set +e
"$QA_RELEASE_WRAPPER" --operation=release-recovery-writer --busy-policy=fail -- /usr/bin/true
writer_status=$?
set -e
[[ "$writer_status" -eq 75 ]]
printf 'PID=%s FD8=%s FD9=%s\n' "$$" "$fd8_owner" "$fd9_owner" > "$QA_OWNER_LOG"
: > "$QA_READY"
while [[ ! -e "$QA_STOP" ]]; do sleep 0.02; done
pilot_clear_app_verification_intent
`, { mode: 0o700 });
  await chmod(operationPath, 0o700);

  await writeFile(releaseOwnerCheckPath, `#!/usr/bin/env bash
set -euo pipefail
[[ "\${MES_RELEASE_AUTHORITY_LOCK_HELD:-0}" == 1 && "\${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == 9 ]]
intent_pid="$(sed -n 's/^pid=//p' "$QA_RELEASE_INTENT")"
lock_inode="$(stat -Lc '%i' -- "$QA_AUTHORITY_LOCK")"
owner="$(awk -v inode="$lock_inode" '$1=="lock:" && $3=="FLOCK" && $5=="WRITE" { split($7,i,":"); if (i[3]==inode) print $6 }' /proc/$$/fdinfo/9)"
[[ "$intent_pid" == "$$" && "$owner" == "$$" ]]
`, { mode: 0o700 });
  await chmod(releaseOwnerCheckPath, 0o700);

  await writeFile(busyIdentityCheckPath, `#!/usr/bin/env bash
set -euo pipefail
[[ "\${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0}" == 1 ]]
source "$QA_IDENTITY_LIBRARY"
authority_inode="$(stat -Lc '%i' -- "$QA_AUTHORITY_LOCK")"
authority_owner="$(awk -v inode="$authority_inode" '$1=="lock:" && $3=="FLOCK" && $5=="WRITE" { split($7,i,":"); if (i[3]==inode) print $6 }' /proc/$$/fdinfo/9)"
if [[ -z "\${QA_BUSY_EXPECTED_PID:-}" ]]; then
  [[ "$authority_owner" == "$$" ]]
  export QA_BUSY_EXPECTED_PID="$$"
fi
[[ "$$" == "$QA_BUSY_EXPECTED_PID" && "$authority_owner" == "$QA_BUSY_EXPECTED_PID" ]]
set +e
pilot_open_root_identity_lock "$0" "$@"
lock_status=$?
set -e
[[ "$lock_status" -eq 75 && "$$" == "$QA_BUSY_EXPECTED_PID" ]]
authority_owner_after="$(awk -v inode="$authority_inode" '$1=="lock:" && $3=="FLOCK" && $5=="WRITE" { split($7,i,":"); if (i[3]==inode) print $6 }' /proc/$$/fdinfo/9)"
[[ "$authority_owner_after" == "$QA_BUSY_EXPECTED_PID" ]]
`, { mode: 0o700 });
  await chmod(busyIdentityCheckPath, 0o700);

  await writeFile(signalCommandPath, `#!/usr/bin/env bash
set -euo pipefail
: > "$QA_SIGNAL_READY"
exec /bin/sleep 60
`, { mode: 0o700 });
  await chmod(signalCommandPath, 0o700);

  await writeFile(escapedDescendantCommandPath, `#!/usr/bin/env bash
set -euo pipefail
/usr/bin/setsid /bin/bash --noprofile --norc -c '
  printf "%s\\n" "$$" > "$QA_ESCAPED_DESCENDANT_PID"
  : > "$QA_ESCAPED_DESCENDANT_READY"
  exec /bin/sleep 60
' &
while [[ ! -e "$QA_ESCAPED_DESCENDANT_READY" ]]; do /bin/sleep 0.01; done
: > "$QA_SIGNAL_READY"
exec /bin/sleep 60
`, { mode: 0o700 });
  await chmod(escapedDescendantCommandPath, 0o700);

  await writeFile(monitorCommandPath, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD:-0}" != 1 ]]; then
  [[ "\${MES_RELEASE_AUTHORITY_LOCK_HELD:-0}" == 1 && "\${MES_RELEASE_AUTHORITY_LOCK_FD:-}" == 9 ]]
fi
lock_inode="$(stat -Lc '%i' -- "$QA_AUTHORITY_LOCK")"
owner="$(awk -v inode="$lock_inode" '$1=="lock:" && $3=="FLOCK" && $5=="WRITE" { split($7,i,":"); if (i[3]==inode) print $6 }' /proc/$$/fdinfo/9)"
[[ "$owner" == "$$" ]]
printf 'PID=%s OWNER=%s\n' "$$" "$owner" > "$QA_MONITOR_RESULT"
exit 37
`, { mode: 0o700 });
  await chmod(monitorCommandPath, 0o700);

  const qaEnv = {
    ...process.env,
    QA_AUTHORITY_LOCK: authorityLock,
    QA_IDENTITY_LOCK: identityLockPath,
    QA_IDENTITY_LIBRARY: identityHarnessPath,
    QA_RELEASE_WRAPPER: releaseHarnessPath,
    QA_RELEASE_INTENT: releaseIntent,
    QA_OWNER_LOG: ownerLogPath,
    QA_READY: readyPath,
    QA_STOP: stopPath,
    QA_MONITOR_RESULT: monitorResultPath,
  };

  const monitorEnv = {
    ...qaEnv,
    SHELLOPTS: "braceexpand:hashall:interactive-comments:monitor",
  };
  for (const wrapperKind of ["shared", "release"]) {
    await rm(monitorResultPath, { force: true });
    const args = wrapperKind === "shared"
      ? [sharedHarnessPath, monitorCommandPath]
      : [releaseHarnessPath, "--operation=qa-monitor", "--busy-policy=fail", "--", monitorCommandPath];
    const result = spawnSync("/bin/bash", args, { encoding: "utf8", env: monitorEnv });
    assert.equal(result.status, 37,
      `${wrapperKind} must preserve the protected status under inherited monitor mode: ${result.stdout}${result.stderr}`);
    const monitorProof = await readFile(monitorResultPath, "utf8");
    const monitorMatch = /^PID=(\d+) OWNER=(\d+)$/m.exec(monitorProof);
    assert(monitorMatch && monitorMatch[1] === monitorMatch[2],
      `${wrapperKind} monitor-mode execution must retain one exact fd9 owner PID: ${monitorProof}`);
    assert.equal(spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status, 0,
      `${wrapperKind} monitor-mode completion must release fd9`);
    await assert.rejects(access(releaseIntent),
      `${wrapperKind} monitor-mode completion must clean the release intent`);
    const monitorResidue = (await readdir(lockParent)).filter((name) =>
      name.includes("authority-owner") || name.endsWith(".intent"));
    assert.deepEqual(monitorResidue, [],
      `${wrapperKind} monitor-mode completion must clean markers/intents: ${monitorResidue.join(", ")}`);
  }
  await rm(monitorResultPath, { force: true });

  const releaseSuccess = spawnSync("/bin/bash", [
    releaseHarnessPath, "--operation=qa", "--busy-policy=fail", "--", releaseOwnerCheckPath,
  ], { encoding: "utf8", env: qaEnv });
  assert.equal(releaseSuccess.status, 0, `release fd9 owner topology failed: ${releaseSuccess.stdout}${releaseSuccess.stderr}`);
  await assert.rejects(access(releaseIntent), "release operation intent must be cleaned after success");

  const bootstrapSuccess = spawnSync("/bin/bash", [
    bootstrapHarnessPath,
    "--bootstrap-source-verified",
    "--operation=bootstrap",
    "--busy-policy=fail",
    "--",
    releaseOwnerCheckPath,
  ], { encoding: "utf8", env: { ...qaEnv, QA_BOOTSTRAP_ROOT: qaRoot } });
  assert.equal(bootstrapSuccess.status, 0,
    `mode-0400 bootstrap wrapper must re-enter through bash in the exact fd9 owner PID: ${bootstrapSuccess.stdout}${bootstrapSuccess.stderr}`);
  await assert.rejects(access(releaseIntent), "bootstrap release intent must be cleaned after success");

  for (const status of [75, 200]) {
    const result = spawnSync("/bin/bash", [
      releaseHarnessPath, "--operation=qa", "--busy-policy=fail", "--",
      "/bin/bash", "--noprofile", "--norc", "-c", `exit ${status}`,
    ], { encoding: "utf8", env: qaEnv });
    assert.equal(result.status, status, `release protected status ${status} must be preserved`);
    assert.doesNotMatch(result.stderr, /Another authority rollout owns/,
      `release protected status ${status} must not be misclassified as initial lock conflict`);
    await assert.rejects(access(releaseIntent), `release intent must be cleaned after protected status ${status}`);
  }

  const occupiedFdLauncher = [
    "exec 3<>/dev/null", "exec 4<>/dev/null", "exec 5<>/dev/null", "exec 6<>/dev/null",
    "exec 7<>/dev/null", "exec 8<>/dev/null", "exec 9<>/dev/null", 'exec "$@"',
  ].join("; ");
  const runner = spawn("/bin/bash", [
    "--noprofile", "--norc", "-c", occupiedFdLauncher, "mes-lock-owner-qa",
    sharedHarnessPath, operationPath, "runtime",
  ], { env: qaEnv, stdio: ["ignore", "pipe", "pipe"] });
  const runnerOutput = capture(runner);
  await waitForPath(readyPath);

  const competingLock = spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"], { encoding: "utf8" });
  assert.notEqual(competingLock.status, 0,
    "a competitor must remain blocked throughout the same-PID fd9+fd8 operation");
  const blockedShared = spawnSync("/bin/bash", [sharedHarnessPath, "/usr/bin/true"], { encoding: "utf8", env: qaEnv });
  assert.equal(blockedShared.status, 75, "a second shared wrapper must return the public busy status");
  assert.match(blockedShared.stderr, /Another shared-state authority rollout/);

  const originalRuntimeIntent = await readFile(runtimeIntent, "utf8");
  await writeFile(runtimeIntent, "PID=1\nSTART_TICKS=1\nINTENT=app-verification\n", { mode: 0o600 });
  const staleDenied = releaseGate("app-intent");
  assert.equal(staleDenied.status, 75, "a forged or stale runtime intent must fail closed");

  await rm(runtimeIntent);
  const liveOwnerPid = /^PID=(\d+)$/m.exec(originalRuntimeIntent)?.[1];
  assert(liveOwnerPid, "valid runtime intent must expose its live owner PID");
  const authorityIdentity = await stat(authorityLock);
  await writeFile(releaseIntent, [
    "schema=1",
    `pid=${liveOwnerPid}`,
    "fd=9",
    "operation=activation",
    `lock_dev_inode=${authorityIdentity.dev}:${authorityIdentity.ino}`,
    "",
  ].join("\n"), { mode: 0o600 });
  const operationWideDenied = releaseGate("app-intent");
  assert.equal(operationWideDenied.status, 75,
    "an operation-wide release intent must never admit the app gate");
  await rm(releaseIntent);
  await writeFile(runtimeIntent, originalRuntimeIntent, { mode: 0o600 });

  const ownerLog = await readFile(ownerLogPath, "utf8");
  const ownerMatch = /^PID=(\d+) FD8=(\d+) FD9=(\d+)$/m.exec(ownerLog);
  assert(ownerMatch && ownerMatch[1] === ownerMatch[2] && ownerMatch[1] === ownerMatch[3],
    `fd8, fd9 and app intent must have one exact PID: ${ownerLog}`);

  await writeFile(stopPath, "stop\n");
  const runnerExit = await waitForExit(runner);
  assert.deepEqual(runnerExit, { code: 0, signal: null },
    `same-PID runtime operation failed: ${runnerOutput.stdout}${runnerOutput.stderr}`);
  assert.equal(spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status, 0,
    "fd9 must be released after the complete runtime operation");
  await assert.rejects(access(runtimeIntent), "runtime verification intent must be cleaned after success");

  const identityHolder = spawn("/usr/bin/python3", ["-I", "-S", "-c", `
import fcntl
import os
import time
import sys
path, ready, stop = sys.argv[1:]
fd = os.open(path, os.O_RDWR | os.O_CLOEXEC)
fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
if fd == 8:
    os.set_inheritable(fd, True)
else:
    os.dup2(fd, 8, inheritable=True)
    os.close(fd)
with open(ready, "w", encoding="utf8"):
    pass
while not os.path.exists(stop):
    time.sleep(0.01)
`, identityLockPath, identityHolderReadyPath, identityHolderStopPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const identityHolderOutput = capture(identityHolder);
  await waitForPath(identityHolderReadyPath);
  const busyIdentityResult = spawnSync("/bin/bash", [sharedHarnessPath, busyIdentityCheckPath], {
    encoding: "utf8",
    env: qaEnv,
  });
  assert.equal(busyIdentityResult.status, 0,
    `fd8 busy re-entry must preserve the exact fd9 owner PID/inode: ${busyIdentityResult.stdout}${busyIdentityResult.stderr}`);
  assert.equal(spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status, 0,
    "fd9 must be released after the fd8-busy policy returns");
  await writeFile(identityHolderStopPath, "stop\n");
  const identityHolderExit = await waitForExitWithin(identityHolder, 4_000, "external fd8 holder");
  assert.deepEqual(identityHolderExit, { code: 0, signal: null },
    `external fd8 holder failed: ${identityHolderOutput.stdout}${identityHolderOutput.stderr}`);
  await rm(identityHolderReadyPath, { force: true });
  await rm(identityHolderStopPath, { force: true });

  for (const [wrapperKind, signal, expectedStatus] of [
    ["shared", "SIGHUP", 129],
    ["shared", "SIGINT", 130],
    ["shared", "SIGTERM", 143],
    ["release", "SIGHUP", 129],
    ["release", "SIGINT", 130],
    ["release", "SIGTERM", 143],
  ]) {
    const signalReadyPath = join(qaRoot, `signal-ready-${wrapperKind}-${signal}`);
    const args = wrapperKind === "shared"
      ? [sharedHarnessPath, signalCommandPath]
      : [releaseHarnessPath, "--operation=qa-signal", "--busy-policy=fail", "--", signalCommandPath];
    const child = spawn("/bin/bash", args, {
      detached: true,
      env: { ...qaEnv, QA_SIGNAL_READY: signalReadyPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const childOutput = capture(child);
    await waitForPath(signalReadyPath);
    child.kill(signal);
    const childExit = await waitForExitWithin(child, 4_000, `${wrapperKind} ${signal}`);
    assert.deepEqual(childExit, { code: expectedStatus, signal: null },
      `${wrapperKind} ${signal} must exit ${expectedStatus}: ${childOutput.stdout}${childOutput.stderr}`);
    assert.equal(spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status, 0,
      `${wrapperKind} ${signal} must release fd9`);
    await assert.rejects(access(releaseIntent), `${wrapperKind} ${signal} must clean the release intent`);
    const signalResidue = (await readdir(lockParent)).filter((name) =>
      name.includes("authority-owner") || name.endsWith(".intent"));
    assert.deepEqual(signalResidue, [],
      `${wrapperKind} ${signal} must clean every owner marker/intent: ${signalResidue.join(", ")}`);
    await rm(signalReadyPath, { force: true });
  }

  const escapedSignalReadyPath = join(qaRoot, "signal-ready-release-escaped-descendant");
  const escapedRelease = spawn("/bin/bash", [
    releaseHarnessPath,
    "--operation=qa-signal-descendant",
    "--busy-policy=fail",
    "--",
    escapedDescendantCommandPath,
  ], {
    detached: true,
    env: {
      ...qaEnv,
      QA_SIGNAL_READY: escapedSignalReadyPath,
      QA_ESCAPED_DESCENDANT_READY: escapedDescendantReadyPath,
      QA_ESCAPED_DESCENDANT_PID: escapedDescendantPidPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const escapedReleaseOutput = capture(escapedRelease);
  await waitForPath(escapedSignalReadyPath);
  await waitForPath(escapedDescendantReadyPath);
  escapedRelease.kill("SIGINT");
  const escapedReleaseExit = await waitForExitWithin(escapedRelease, 5_000,
    "release SIGINT with an escaped fd9 descendant");
  assert.deepEqual(escapedReleaseExit, { code: 130, signal: null },
    `escaped descendant cancellation must remain bounded and return 130: ${escapedReleaseOutput.stdout}${escapedReleaseOutput.stderr}`);
  assert.match(escapedReleaseOutput.stderr, /Release authority intent cleanup did not complete safely/,
    "a surviving fd9 descendant must leave explicit fail-closed cleanup evidence");
  await access(releaseIntent);
  const escapedResidue = (await readdir(lockParent)).filter((name) => name.includes("authority-owner"));
  assert.deepEqual(escapedResidue, [], "the outer owner marker must still be removed after bounded cleanup failure");
  assert.notEqual(spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status, 0,
    "the escaped descendant fixture must really retain fd9 after the direct owner exits");
  const escapedDescendantPid = Number((await readFile(escapedDescendantPidPath, "utf8")).trim());
  assert(Number.isInteger(escapedDescendantPid) && escapedDescendantPid > 1);
  try { process.kill(escapedDescendantPid, "SIGTERM"); } catch {}
  const escapedDeadline = Date.now() + 4_000;
  while (Date.now() < escapedDeadline
    && spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status !== 0) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  assert.equal(spawnSync("/usr/bin/flock", ["-n", authorityLock, "/usr/bin/true"]).status, 0,
    "fd9 must become available after the escaped descendant is terminated");
  await rm(releaseIntent, { force: true });
  await rm(escapedSignalReadyPath, { force: true });
  await rm(escapedDescendantReadyPath, { force: true });
  await rm(escapedDescendantPidPath, { force: true });

  for (const status of [75, 200]) {
    const result = spawnSync("/bin/bash", [sharedHarnessPath, operationPath, `status${status}`], {
      encoding: "utf8",
      env: qaEnv,
    });
    assert.equal(result.status, status, `shared protected status ${status} must be preserved`);
    assert.doesNotMatch(result.stderr, /Another shared-state authority rollout/,
      `shared protected status ${status} must not be misclassified as initial lock conflict`);
  }

  const residue = (await readdir(lockParent)).filter((name) =>
    name.includes("authority-owner") || name.endsWith(".intent"));
  assert.deepEqual(residue, [], `authority owner markers/intents must be cleaned: ${residue.join(", ")}`);
} finally {
  await rm(qaRoot, { recursive: true, force: true });
}

console.log("Pilot runtime recovery authority QA: OK");
console.log("- shared and release wrappers keep one exact fd9 owner PID through command exec");
console.log("- inherited SHELLOPTS monitor cannot fork away the lock owner or falsify command status");
console.log("- fd8 acquisition preserves the same PID and returns real busy state to caller policy");
console.log("- nested app-intent succeeds; forged, stale and operation-wide intents fail closed");
console.log("- HUP/INT/TERM exit 129/130/143 without hangs and release locks, intents and markers");
console.log("- escaped fd9 descendants cannot hang release cleanup; intent evidence is retained fail-closed");
console.log("- protected status 75/200, lock continuity and marker/intent cleanup are proved");
