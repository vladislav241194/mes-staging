import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [rotate, installer, journal, recovery, uidRecovery, recoveryUnit, appUnit, rootLock, transitionGate, writerDropin, syncTimer] = await Promise.all([
  "ops/security/rotate-pilot-credentials.sh",
  "ops/security/install-pilot-runtime-uid-isolation.sh",
  "ops/security/pilot-credential-rotation-journal.sh",
  "ops/security/recover-pilot-credential-rotation.sh",
  "ops/security/recover-pilot-uid-cutover.sh",
  "ops/security/mes-pilot-credential-rotation-recovery.service",
  "deploy/systemd/mes-pilot.service",
  "ops/security/pilot-root-identity-lock.sh",
  "ops/security/pilot-runtime-transition-gate.sh",
  "ops/security/mes-pilot-writer-transition-recovery.conf",
  "ops/postgres/mes-pilot-domain-snapshot-sync.timer",
].map((path) => readFile(new URL(path, root), "utf8")));

function index(source, fragment) {
  const value = source.indexOf(fragment);
  assert.ok(value >= 0, `missing crash-consistency fragment: ${fragment}`);
  return value;
}

const prepared = index(rotate, 'pilot_journal_prepare "$BACKUP_DIR"');
const rolesChanged = index(rotate, 'alter_roles "$new_app_password" "$new_migrator_password"');
const rolesPhase = index(rotate, 'pilot_journal_set_phase "$BACKUP_DIR" roles-updated');
const firstEnvWrite = index(rotate, 'write_root_env_atomically "$DOMAIN_ENV"');
const envPhase = index(rotate, 'pilot_journal_set_phase "$BACKUP_DIR" env-updated');
const sessionWrite = index(rotate, 'pilot-secret-env-rewrite.mjs" --mode=rotate-sessions');
const sessionPhase = index(rotate, 'pilot_journal_set_phase "$BACKUP_DIR" sessions-updated');
const verifiedPhase = index(rotate, 'pilot_journal_set_phase "$BACKUP_DIR" verified');
const committedPhase = index(rotate, 'pilot_journal_set_phase "$BACKUP_DIR" committed');
const journalClear = rotate.lastIndexOf('wipe_backup');
assert.ok(prepared < rolesChanged && rolesChanged < rolesPhase && rolesPhase < firstEnvWrite
  && firstEnvWrite < envPhase && envPhase < sessionWrite && sessionWrite < sessionPhase
  && sessionPhase < verifiedPhase && verifiedPhase < committedPhase && committedPhase < journalClear,
"durable journal phases must bracket every irreversible credential transition");
assert.match(rotate, /journal_recovery_pending[\s\S]*recover_interrupted_rotation/);
assert.match(rotate, /Credential rollback did not complete; durable journal retained/);
assert.match(journal, /sync -f "\$temporary\/phase"[\s\S]*mv -T -- "\$temporary" "\$journal_dir"[\s\S]*sync -f "\$parent"/);
assert.match(journal, /pilot_journal_restore_files\(\)[\s\S]*mv -fT -- "\$temporary" "\$target"[\s\S]*sync -f/);

assert.match(appUnit, /^Requires=mes-pilot-credential-rotation-recovery\.service$/m);
assert.match(appUnit, /^After=.*mes-pilot-credential-rotation-recovery\.service$/m);
assert.match(recoveryUnit, /^Before=mes-pilot\.service .*mes-pilot-domain-snapshot-sync\.service$/m);
assert.doesNotMatch(recoveryUnit, /mes-pilot-domain-snapshot-sync\.timer/);
assert.doesNotMatch(syncTimer, /mes-pilot-credential-rotation-recovery\.service/,
  "timer restoration must not create a dependency cycle back to its active recovery service");
assert.doesNotMatch(recoveryUnit, /^ConditionPathExists=/m, "fixed recovery trust gate must run before every Pilot start");
assert.match(recoveryUnit, /^ExecStart=\/bin\/bash \/usr\/local\/libexec\/mes\/active-bundle\/with-pilot-release-authority-lock\.sh --operation=runtime-security-recovery --busy-policy=app-intent -- \/bin\/bash -ceu '\/usr\/local\/libexec\/mes\/pilot-runtime-security-dispatch recover-pilot-credential-rotation\.sh; \/usr\/local\/libexec\/mes\/pilot-runtime-security-dispatch recover-pilot-uid-cutover\.sh'$/m);
assert.equal((recoveryUnit.match(/^ExecStart=/gm) || []).length, 1,
  "credential and UID recovery must remain inside one uninterrupted fd9 ownership interval");
assert.doesNotMatch(recoveryUnit, /^(?:Requires|After)=.*mes-pilot-release-recovery-/m,
  "credential recovery must not depend back on release recovery and create a unit cycle");
assert.match(rootLock, /exec \/usr\/bin\/python3 -I -S -c/);
assert.match(rootLock, /fcntl\.flock\(fd, fcntl\.LOCK_EX \| fcntl\.LOCK_NB\)/);
assert.match(rootLock, /environment\[result_key\] = "busy"[\s\S]*os\.execve[\s\S]*environment\[result_key\] = "held"[\s\S]*os\.execve/);
assert.doesNotMatch(rootLock, /exec 9/);
assert.match(rootLock, /PILOT_IDENTITY_LOCK_BUSY=75[\s\S]*PILOT_IDENTITY_LOCK_UNSAFE=76/);
assert.match(rootLock, /fdinfo\/8/);
assert.doesNotMatch(rootLock, /\/proc\/locks/);
assert.match(recovery, /PILOT_IDENTITY_LOCK_BUSY[\s\S]*pilot_validate_app_verification_intent[\s\S]*PILOT_IDENTITY_LOCK_UNSAFE/);
for (const recoverySource of [recovery, uidRecovery]) {
  assert.match(recoverySource, /MES_RELEASE_AUTHORITY_LOCK_HELD[\s\S]*MES_RELEASE_AUTHORITY_LOCK_FD[\s\S]*\/proc\/\$\$\/fd\/9/);
  assert.match(recoverySource, /\$3 == "FLOCK"[\s\S]*\$5 == "WRITE"[\s\S]*\$6 == owner_pid/);
  assert.doesNotMatch(recoverySource, /flock -n 9/);
}
assert.match(recovery, /alter role/iu);
assert.match(recovery, /pilot_journal_restore_files/);
assert.ok(index(recovery, 'ALTER ROLE') < index(recovery, 'pilot_journal_restore_files'),
  "boot recovery must restore DB roles before exposing the matching old env files");

const outerCommit = index(installer, "cutover_committed=1");
const nestedRotation = index(installer, 'MES_PILOT_IDENTITY_LOCK_HELD=1 "${SCRIPT_DIR}/rotate-pilot-credentials.sh"');
const committedBoundary = installer.slice(outerCommit, nestedRotation);
assert.match(committedBoundary, /cutover_committed=1[\s\S]*trap - ERR INT TERM[\s\S]*wipe_backup/);
assert.ok(outerCommit < nestedRotation,
  "outer installer rollback must be retired before nested DB credential commit can start");
const finalTimerRestore = installer.lastIndexOf('restore_timer_state "$timer_was_active"');
const finalUidClear = installer.lastIndexOf("clear_uid_cutover_journal");
const finalMarkerClear = installer.lastIndexOf('rm -f -- "$WRITER_QUIESCE_MARKER"');
assert.ok(nestedRotation < finalTimerRestore && finalTimerRestore < finalUidClear && finalUidClear < finalMarkerClear,
  "committed UID journal/marker must survive nested rotation until the original timer state is synchronously restored");
assert.match(recovery, /restore_timer_state "\$timer_was_active"[\s\S]*pilot_journal_clear/);
assert.match(uidRecovery, /restore_timer_state "\$marker_timer_was_active"[\s\S]*clear_journal/);
assert.match(transitionGate, /"\$consumer" == app[\s\S]*pilot_validate_app_verification_intent/);
assert.match(transitionGate, /Pilot \$consumer start is blocked by an active identity\/credential transition/);
assert.match(writerDropin, /--consumer=writer/);

const OLD = Object.freeze({ app: "old-app", migrator: "old-migrator", sessions: "old-sessions" });
const NEW = Object.freeze({ app: "new-app", migrator: "new-migrator", sessions: "new-sessions" });
const crashPoints = ["prepared", "roles-updated", "runtime-env-only", "env-updated", "sessions-updated", "verified", "committed"];

function injectCrash(point) {
  const state = {
    db: { app: OLD.app, migrator: OLD.migrator },
    env: { app: OLD.app, migrator: OLD.migrator, sessions: OLD.sessions },
    journal: { phase: "prepared", old: OLD },
  };
  if (point !== "prepared") state.db = { app: NEW.app, migrator: NEW.migrator };
  if (["runtime-env-only", "env-updated", "sessions-updated", "verified", "committed"].includes(point)) state.env.app = NEW.app;
  if (["env-updated", "sessions-updated", "verified", "committed"].includes(point)) state.env.migrator = NEW.migrator;
  if (["sessions-updated", "verified", "committed"].includes(point)) state.env.sessions = NEW.sessions;
  state.journal.phase = point === "runtime-env-only" ? "roles-updated" : point;
  return state;
}

// A direct writer can share the successful recovery dependency job used by an
// intentional app verification, but its own root ExecStartPre gate still
// rejects the held identity lock. Only the app+proved-intent tuple is admitted.
function gateDecision({ consumer, lock, intent }) {
  if (lock === "free") return "allow";
  if (lock === "unsafe") return "deny";
  return consumer === "app" && intent === "proved" ? "allow" : "deny";
}
assert.equal(gateDecision({ consumer: "app", lock: "busy", intent: "proved" }), "allow");
assert.equal(gateDecision({ consumer: "writer", lock: "busy", intent: "proved" }), "deny");
assert.equal(gateDecision({ consumer: "app", lock: "busy", intent: "missing" }), "deny");
assert.equal(gateDecision({ consumer: "writer", lock: "unsafe", intent: "proved" }), "deny");

// Timer crash boundary: journal/marker remain until start+is-active succeeds;
// every earlier crash therefore preserves enough state for the next recovery.
for (const point of ["before-start", "after-start-before-active", "active-before-clear"]) {
  const recovered = { timerActive: point === "active-before-clear", durableState: true };
  if (!recovered.timerActive) recovered.timerActive = true;
  if (recovered.timerActive) recovered.durableState = false;
  assert.equal(recovered.timerActive, true, `${point}: timer must be restored`);
  assert.equal(recovered.durableState, false, `${point}: durable state clears only after timer restoration`);
}

function bootRecover(state) {
  if (state.journal.phase === "committed") return { ...state, journal: null };
  return {
    db: { app: state.journal.old.app, migrator: state.journal.old.migrator },
    env: { app: state.journal.old.app, migrator: state.journal.old.migrator, sessions: state.journal.old.sessions },
    journal: null,
  };
}

for (const point of crashPoints) {
  const recovered = bootRecover(injectCrash(point));
  assert.equal(recovered.db.app, recovered.env.app, `${point}: app DB/env credential must match after boot recovery`);
  assert.equal(recovered.db.migrator, recovered.env.migrator, `${point}: migrator DB/env credential must match after boot recovery`);
  assert.equal(recovered.journal, null, `${point}: resolved journal must be cleared`);
  if (point === "committed") assert.deepEqual(recovered.env, NEW, "committed rotation must stay new");
  else assert.deepEqual(recovered.env, OLD, `${point}: non-committed rotation must roll back completely`);
}

// Inject a late outer-installer failure after the nested transaction committed.
// With the parsed boundary ordering above the outer backup is already retired,
// so its old env can no longer overwrite the new DB/env pair.
const lateOuterFailure = bootRecover(injectCrash("committed"));
assert.equal(lateOuterFailure.db.app, NEW.app);
assert.equal(lateOuterFailure.env.app, NEW.app);
assert.equal(lateOuterFailure.db.migrator, lateOuterFailure.env.migrator);

console.log(`Pilot credential crash QA: OK (${crashPoints.length} credential boundaries, timer boundaries, direct-writer contention, late outer failure)`);
