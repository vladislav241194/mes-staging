#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourcePath = join(projectRoot, "ops", "frontend", "with-pilot-release-authority-lock.sh");
const sharedSourcePath = join(projectRoot, "ops", "shared-state", "with-authority-rollout-lock.sh");
const [source, sharedSource] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(sharedSourcePath, "utf8"),
]);

assert.match(source, /IDENTITY_LOCK="\$\{LOCK_PARENT\}\/pilot-runtime-uid-isolation\.lock"/);
assert.match(source, /INPUT_FD=7[\s\S]*eval "exec \$\{INPUT_FD\}<&0"[\s\S]*0<&"\$INPUT_FD" &[\s\S]*eval "exec \$\{INPUT_FD\}<&-"/,
  "the release authority owner must explicitly preserve streamed activation stdin across its asynchronous launcher");
assert.match(source, /pid="\$\(intent_value "\$RUNTIME_INTENT" PID\)"/);
assert.match(source, /start_ticks="\$\(intent_value "\$RUNTIME_INTENT" START_TICKS\)"/);
assert.match(source, /intent="\$\(intent_value "\$RUNTIME_INTENT" INTENT\)"/);
assert.match(source, /prove_fd_lock "\$pid" "\$IDENTITY_FD" "\$IDENTITY_LOCK"/);
assert.match(source, /prove_fd_lock "\$pid" "\$AUTHORITY_FD" "\$LOCK_FILE"/);
assert.match(source, /reinode-transactions[\s\S]*stat -Lc '%u:%g:%a'[\s\S]*return 2/);
assert.match(source, /journal_status=\$\?[\s\S]*"\$journal_status" -eq 1/);
for (const transitionPath of [
  "/var/lib/mes/pilot-credential-rotation",
  "/var/lib/mes/pilot-uid-cutover",
  "/run/lock/mes/pilot-runtime-writers-quiesced",
]) assert(source.includes(transitionPath), `release preflight must fail closed on ${transitionPath}`);
assert.match(source, /case "\$operation" in[\s\S]*bootstrap\|reinode\|reinode-recovery\|release-recovery-app\|release-recovery-writer[\s\S]*assert_no_pilot_runtime_transition_state/);
assert.match(source, /prove_release_app_verification_intent[\s\\]*\|\| prove_runtime_intent_without_release_journal[\s\\]*\|\| prove_shared_authority_app_verification_intent/);
assert.match(source, /prove_shared_authority_app_verification_intent\(\)[\s\S]*release-recovery-app[\s\S]*runtime-security-recovery[\s\S]*release_journal_pending[\s\S]*prove_fd_lock "\$pid" "\$AUTHORITY_FD" "\$LOCK_FILE"[\s\S]*prove_stable_active_pointer[\s\S]*assert_no_pilot_runtime_transition_state[\s\S]*release_journal_pending/);
assert.match(sharedSource, /publish_shared_app_verification_intent\(\)[\s\S]*prove_fd_lock "\$\$" "\$AUTHORITY_FD" "\$lock_file"/);
assert.match(sharedSource, /INTENT=shared-authority-app-verification[\s\S]*EXPECTED_TARGET[\s\S]*ACTIVE_RELEASE_ID/);
assert.match(sharedSource, /flock --exclusive --wait 2 --conflict-exit-code 75[\s\S]*mes-shared-app-intent-cleanup/);
assert.match(source, /JOURNAL_PHASE[\s\S]*pointer-switched/);
assert.doesNotMatch(source, /\n\s*none\)\n/);
assert.doesNotMatch(source.slice(source.indexOf('if ! flock -n "$AUTHORITY_FD"')), /prove_release_intent/);

if (process.platform !== "linux") {
  console.log("Release recovery lock gate QA: static contract OK; Linux kernel scenario skipped");
  process.exit(0);
}

const uid = process.getuid();
const gid = process.getgid();
const root = await mkdtemp(join(tmpdir(), "mes-release-gate-qa-"));
const lockParent = join(root, "run-lock-mes");
const authorityLock = join(lockParent, "mes-authority-rollout.lock");
const identityLock = join(lockParent, "pilot-runtime-uid-isolation.lock");
const runtimeIntent = join(lockParent, "pilot-app-verification.intent");
const releaseIntent = join(lockParent, "mes-release-operation.intent");
const releaseAppIntent = join(lockParent, "mes-release-app-verification.intent");
const sharedAppIntent = join(lockParent, "mes-shared-authority-app-verification.intent");
const switchJournal = join(root, "release-switch-pilot.json");
const pilotRoot = join(root, "pilot");
const reinodeRoot = join(pilotRoot, "reinode-transactions");
const releaseId = "v.1.500.qa";
const expectedTarget = join(pilotRoot, "releases", releaseId, "app");
const harnessPath = join(root, "gate.sh");
const python = process.env.PYTHON || "python3";

const holderSource = String.raw`
import fcntl, os, sys, time
mode, authority, identity, runtime_intent, release_intent, shared_intent, expected_target, release_id = sys.argv[1:]
def fixed_fd(path, fd):
    opened = os.open(path, os.O_RDWR)
    if opened != fd:
        os.dup2(opened, fd)
        os.close(opened)
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
fixed_fd(authority, 9)
pid = os.getpid()
if mode == "runtime":
    fixed_fd(identity, 8)
    start = open(f"/proc/{pid}/stat", encoding="utf8").read().split()[21]
    with open(runtime_intent, "x", encoding="utf8") as handle:
        handle.write(f"PID={pid}\nSTART_TICKS={start}\nINTENT=app-verification\n")
    os.chmod(runtime_intent, 0o600)
elif mode == "shared":
    start = open(f"/proc/{pid}/stat", encoding="utf8").read().split()[21]
    with open(shared_intent, "x", encoding="utf8") as handle:
        handle.write(f"PID={pid}\nSTART_TICKS={start}\nINTENT=shared-authority-app-verification\nEXPECTED_TARGET={expected_target}\nACTIVE_RELEASE_ID={release_id}\n")
    os.chmod(shared_intent, 0o600)
else:
    metadata = os.stat(authority)
    with open(release_intent, "x", encoding="utf8") as handle:
        handle.write(f"schema=1\npid={pid}\nfd=9\noperation=activation\nlock_dev_inode={metadata.st_dev}:{metadata.st_ino}\n")
    os.chmod(release_intent, 0o600)
print("LOCKED", flush=True)
time.sleep(60)
`;

function gate(policy, operation = "release-recovery-app") {
  return spawnSync("/bin/bash", [
    harnessPath,
    `--operation=${operation}`,
    `--busy-policy=${policy}`,
    "--",
    "/usr/bin/true",
  ], { encoding: "utf8" });
}

async function startHolder(mode) {
  const child = spawn(python, [
    "-c", holderSource, mode, authorityLock, identityLock, runtimeIntent, releaseIntent,
    sharedAppIntent, expectedTarget, releaseId,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`lock holder timed out: ${stderr}`)), 5_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes("LOCKED")) {
        clearTimeout(timer);
        resolvePromise();
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("exit", (code) => {
      if (!stdout.includes("LOCKED")) {
        clearTimeout(timer);
        reject(new Error(`lock holder exited ${code}: ${stderr}`));
      }
    });
  });
  return child;
}

async function stopHolder(child) {
  child.kill("SIGKILL");
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolvePromise) => child.once("exit", resolvePromise));
  }
}

try {
  await mkdir(lockParent, { mode: 0o700 });
  await mkdir(reinodeRoot, { mode: 0o700, recursive: true });
  await writeFile(authorityLock, "", { mode: 0o600 });
  await writeFile(identityLock, "", { mode: 0o600 });
  await mkdir(expectedTarget, { recursive: true });
  await symlink(expectedTarget, join(pilotRoot, "app"));
  await writeFile(join(pilotRoot, "releases", "active-release.json"), `${JSON.stringify({
    schemaVersion: 2,
    releaseId,
  })}\n`, { mode: 0o644 });
  let harness = source
    .replace('LOCK_PARENT="/run/lock/mes"', `LOCK_PARENT=${JSON.stringify(lockParent)}`)
    .replace("[[ ${EUID} -eq 0 ]]", "true")
    .replace('== "0:0:${mode}"', `== "${uid}:${gid}:\${mode}"`)
    .replace('== "0:0:700"', `== "${uid}:${gid}:700"`)
    .replaceAll("== 0:0", `== ${uid}:${gid}`)
    .replace("assert_installed_bundle() {", "assert_installed_bundle() { return 0;")
    .replace("assert_no_pilot_runtime_transition_state() {", "assert_no_pilot_runtime_transition_state() { return 0;")
    .replaceAll("/var/lib/mes/release-switch/pilot.json", switchJournal)
    .replaceAll("/srv/mes/pilot", pilotRoot);
  await writeFile(harnessPath, harness, { mode: 0o700 });
  await chmod(harnessPath, 0o700);

  let holder = await startHolder("runtime");
  assert.equal(gate("app-intent").status, 0, "the app gate must admit the exact live fd8+fd9 runtime verification owner");
  assert.equal(gate("fail").status, 75, "a direct writer must remain blocked by the same runtime transition");
  await writeFile(switchJournal, "{}\n", { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a pending release journal must revoke the runtime app exception");
  await rm(switchJournal);
  await rm(reinodeRoot, { recursive: true });
  await symlink(expectedTarget, reinodeRoot);
  assert.equal(gate("app-intent").status, 75, "an unsafe re-inode journal directory must fail closed instead of being classified clean");
  await rm(reinodeRoot);
  await mkdir(reinodeRoot, { mode: 0o700 });
  await writeFile(runtimeIntent, "PID=1\nSTART_TICKS=1\nINTENT=app-verification\n", { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a forged or stale runtime PID/start identity must fail closed");
  await stopHolder(holder);
  await rm(runtimeIntent, { force: true });

  holder = await startHolder("shared");
  assert.equal(gate("app-intent").status, 0, "the app gate must admit the exact live shared fd9 owner on a stable active pointer");
  assert.equal(gate("app-intent", "runtime-security-recovery").status, 0, "the shared app intent may satisfy credential/UID recovery only after its empty-journal preflight");
  assert.equal(gate("fail").status, 75, "the same shared owner must never admit a direct writer");
  await writeFile(switchJournal, "{}\n", { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a pending release-switch journal must revoke the shared-owner app exception");
  await rm(switchJournal);
  await writeFile(join(reinodeRoot, "pending.json"), `${JSON.stringify({ phase: "prepared" })}\n`, { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a pending re-inode journal must revoke the shared-owner app exception");
  await rm(join(reinodeRoot, "pending.json"));
  const activeRecordPath = join(pilotRoot, "releases", "active-release.json");
  await writeFile(activeRecordPath, `${JSON.stringify({ schemaVersion: 2, releaseId: "v.1.500.other" })}\n`, { mode: 0o644 });
  assert.equal(gate("app-intent").status, 75, "an active record that disagrees with the pointer must fail closed");
  await writeFile(activeRecordPath, `${JSON.stringify({ schemaVersion: 2, releaseId })}\n`, { mode: 0o644 });
  const liveSharedIntent = await readFile(sharedAppIntent, "utf8");
  await writeFile(sharedAppIntent, liveSharedIntent.replace(/^START_TICKS=.*$/m, "START_TICKS=1"), { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a forged shared-owner process identity must fail closed");
  await stopHolder(holder);
  await rm(sharedAppIntent, { force: true });

  holder = await startHolder("release");
  const holderStart = (await readFile(`/proc/${holder.pid}/stat`, "utf8")).trim().split(/\s+/)[21];
  assert.equal(gate("app-intent").status, 75, "an operation-wide release intent must never admit an external app start");
  await writeFile(releaseAppIntent, [
    `PID=${holder.pid}`,
    `START_TICKS=${holderStart}`,
    "INTENT=release-app-verification",
    "OPERATION=activation",
    `EXPECTED_TARGET=${expectedTarget}`,
    "JOURNAL_KIND=none",
    "JOURNAL_ID=none",
    "JOURNAL_PHASE=absent",
    "",
  ].join("\n"), { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "journal-less release app intent must never be admitted");
  await rm(releaseAppIntent);
  await writeFile(switchJournal, `${JSON.stringify({
    schemaVersion: 1,
    contour: "pilot",
    operation: "activation",
    phase: "prepared",
    to: { target: expectedTarget },
  })}\n`, { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a prepared switch without a phase-scoped intent must deny an app start");
  await writeFile(switchJournal, `${JSON.stringify({
    schemaVersion: 1,
    contour: "pilot",
    operation: "activation",
    phase: "pointer-switched",
    to: { target: expectedTarget },
  })}\n`, { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "pointer-switched alone must not admit an external app start");
  const appIntent = (phase) => [
    `PID=${holder.pid}`,
    `START_TICKS=${holderStart}`,
    "INTENT=release-app-verification",
    "OPERATION=activation",
    `EXPECTED_TARGET=${expectedTarget}`,
    "JOURNAL_KIND=switch",
    "JOURNAL_ID=pilot",
    `JOURNAL_PHASE=${phase}`,
    "",
  ].join("\n");
  await writeFile(releaseAppIntent, appIntent("prepared"), { mode: 0o600 });
  assert.equal(gate("app-intent").status, 75, "a phase-mismatched release app intent must fail closed");
  await writeFile(releaseAppIntent, appIntent("pointer-switched"), { mode: 0o600 });
  assert.equal(gate("app-intent").status, 0, "only the exact phase-scoped release verification owner may start the selected target");
  assert.equal(gate("fail").status, 75, "a direct writer must remain blocked by a release operation");
  await stopHolder(holder);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Release recovery lock gate QA: OK");
console.log("- exact runtime fd8+fd9 owner admits app only when no release journal is pending");
console.log("- exact shared fd9 owner admits app only for the stable recorded pointer with no switch/re-inode journal");
console.log("- stale runtime intent and both writer paths fail closed");
console.log("- operation-wide and pre-verification release phases deny app; exact phase intent admits app only");
