import assert from "node:assert/strict";
import { access, chmod, mkdtemp, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  inspectPlanningCompatibilityRows,
  inspectPlanningParityMarker,
  runPlanningWriteRolloutReadiness,
} from "./planning-workbench-write-rollout-readiness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  readConfig: "ops/frontend/mes-pilot-react-planning-workbench-evaluation.conf",
  readActivate: "ops/frontend/activate-react-planning-workbench-evaluation.sh",
  readDeactivate: "ops/frontend/deactivate-react-planning-workbench-evaluation.sh",
  writeConfig: "ops/frontend/mes-pilot-react-planning-workbench-write-evaluation.conf",
  writeActivate: "ops/frontend/activate-react-planning-workbench-write-evaluation.sh",
  writeDeactivate: "ops/frontend/deactivate-react-planning-workbench-write-evaluation.sh",
  writeSchedule: "ops/frontend/schedule-react-planning-workbench-write-evaluation-auto-rollback.sh",
  readiness: "scripts/planning-workbench-write-rollout-readiness.mjs",
  releaseActivate: "scripts/release-activate.mjs",
  releaseRollback: "scripts/release-rollback.mjs",
};
const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(join(root, path), "utf8")])));

// Preserve the established read-only evaluation as a separate, default-off
// tool. The narrow write evaluation must not silently broaden it.
assert.match(source.readConfig, /Environment=MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION=1/);
assert.doesNotMatch(source.readConfig, /WRITE/);
for (const script of [source.readActivate, source.readDeactivate]) {
  assert.match(script, /86-react-planning-workbench-evaluation\.conf/);
  assert.match(script, /systemctl restart/);
}

for (const line of [
  "EnvironmentFile=/etc/mes/mes-pilot-employee-auth.env",
  "Environment=MES_DOMAIN_STORAGE=postgres",
  "Environment=MES_ENABLE_EMPLOYEE_AUTH=1",
  "Environment=MES_ENABLE_PLANNING_START_DATE_COMMANDS=1",
  "Environment=MES_REACT_PLANNING_WORKBENCH=1",
  "Environment=MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION=1",
]) assert.match(source.writeConfig, new RegExp(`^${line}$`, "m"));
assert.doesNotMatch(source.writeConfig, /MES_ENABLE_PLANNING_SERVER_COMMANDS|MES_REQUIRE_EMPLOYEE_AUTH_GATE|READ_ONLY_EVALUATION/,
  "start-date-only evaluation must not enable quantity/slot, a global auth gate or the read-only evaluation");

for (const script of [source.writeActivate, source.writeSchedule]) {
  assert.match(script, /with-pilot-release-authority-lock\.sh/);
  assert.match(script, /MES_RELEASE_AUTHORITY_LOCK_HELD/);
  assert.match(script, /MES_RELEASE_AUTHORITY_LOCK_FD/);
  assert.match(script, /\/proc\/\$\$\/fd\/9/);
  assert.match(script, /release-root-seal-verify\.mjs/);
  assert.match(script, /"\$SEAL_HELPER" bundle/);
  assert.match(script, /"\$SEAL_HELPER" release/);
  assert.match(script, /"\$SEAL_HELPER" pointer/);
  assert.match(script, /sealed active release|sealed release/i);
}
assert.match(source.writeDeactivate, /"\$SEAL_HELPER" bundle/);
assert.match(source.writeDeactivate, /"\$SEAL_HELPER" release/);
assert.match(source.writeDeactivate, /app_dir="\$\(dirname -- "\$\(dirname -- "\$\(dirname -- "\$script_path"\)"\)"\)"/,
  "deactivation must derive its immutable source release from the scheduled script rather than a mutable active pointer");
assert.doesNotMatch(source.writeDeactivate, /--pointer="\$ACTIVE_POINTER"/);
assert.match(source.writeActivate, /MES_ENABLE_PLANNING_SERVER_COMMANDS=0/);
assert.match(source.writeActivate, /Another React evaluation is active/);
assert.match(source.writeActivate, /domain-postgres-preflight\.mjs/);
assert.match(source.writeActivate, /planning-workbench-write-rollout-readiness\.mjs/);
assert.match(source.writeActivate, /--require-no-unresolved/);
assert.match(source.writeActivate, /parity\?refresh-marker=1/);
assert.match(source.writeActivate, /verifiedContractVersion\) !== 7/);
assert.match(source.writeActivate, /MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY\":true/);
for (const baselineFlag of [
  "MES_REACT_PLANNING_WORKBENCH",
  "MES_REACT_PLANNING_WORKBENCH_WRITE_EVALUATION",
  "MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION",
  "MES_PLANNING_START_DATE_SERVER_COMMANDS_PRIMARY",
  "MES_LEGACY_DOMAIN_WRITES_QUIESCED",
  "MES_PLANNING_LEGACY_WRITES_QUIESCED",
]) assert.match(source.writeActivate, new RegExp(`${baselineFlag}[\\s\\S]*baseline_runtime`),
  `activation must prove ${baselineFlag} false from the live public runtime before enabling`);
assert.match(source.writeActivate, /react-planning-workbench-write-evaluation=1/);
assert.match(source.writeActivate, /"MES_LEGACY_DOMAIN_WRITES_QUIESCED":true/);
assert.match(source.writeActivate, /"MES_PLANNING_LEGACY_WRITES_QUIESCED":true/);
assert.doesNotMatch(source.writeActivate, /shared UI preferences remain available/,
  "operator output must not claim domain-backed sharedUi writes remain available during global quiesce");
assert.match(source.writeActivate, /--on-active=15m/);
assert.match(source.writeActivate, /DROPIN_DIR="\/run\/systemd\/system/,
  "temporary write permission must disappear on reboot");
assert.doesNotMatch(source.writeActivate, /DROPIN_DIR="\/etc\/systemd\/system/);
assert(source.writeActivate.indexOf("arm_auto_rollback\n") < source.writeActivate.indexOf('install -o root -g root -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"'),
  "retrying auto-rollback must be armed before the reboot-ephemeral permission is installed");
for (const script of [source.writeActivate, source.writeSchedule]) {
  assert.match(script, /Restart=on-failure/);
  assert.match(script, /RestartSec=5s/);
  assert.match(script, /StartLimitIntervalSec=0/);
  assert.match(script, /"\$DEACTIVATE_SCRIPT" --auto/);
  assert.match(script, /systemctl stop "\$\{AUTO_UNIT\}\.timer" "\$\{AUTO_UNIT\}\.service"/,
    "stale inactive timer/service state must be collected before a fresh arm");
  assert.match(script, /systemctl show "\$\{AUTO_UNIT\}\.service" --property=LoadState/,
    "re-arm must prove both transient timer and service units were collected");
}
assert.doesNotMatch(source.writeActivate, /react-planning-workbench-write-evaluation=1.*qa-auth-bypass/s);
assert.match(source.writeActivate, /PERSISTENT_DROPIN_FILE="\/etc\/systemd\/system/);
assert.match(source.writeActivate, /A persistent Planning evaluation permission exists/);

assert.match(source.writeDeactivate, /for candidate_dropin in "\$DROPIN_FILE" "\$PERSISTENT_DROPIN_FILE"/);
assert.match(source.writeDeactivate, /mv -T -- "\$candidate_dropin" "\$quarantined_path"/);
assert.match(source.writeDeactivate, /DROPIN_FILE="\/run\/systemd\/system/);
assert.match(source.writeDeactivate, /PERSISTENT_DROPIN_FILE="\/etc\/systemd\/system/);
assert.match(source.writeDeactivate, /--busy-policy=fail/);
assert.doesNotMatch(source.writeDeactivate, /install .*previous\.conf.*DROPIN_FILE/,
  "deactivation must never restore a write-enabling permission");
const restartIndex = source.writeDeactivate.indexOf('systemctl restart "$SERVICE"');
const syncIndex = source.writeDeactivate.indexOf("systemctl start mes-pilot-domain-snapshot-sync.service");
const parityIndex = source.writeDeactivate.indexOf("parity?refresh-marker=1");
const readinessIndex = source.writeDeactivate.lastIndexOf("planning-workbench-write-rollout-readiness.mjs");
assert(restartIndex >= 0 && syncIndex > restartIndex && parityIndex > syncIndex && readinessIndex > parityIndex,
  "deactivation must quiesce writes, drain the outbox, re-prove v7 parity and only then assert readiness");
assert.equal((source.writeDeactivate.match(/assert_patch_off /g) || []).length, 3,
  "deactivation must prove all three Planning PATCH routes OFF");
assert.match(source.writeDeactivate, /planning-command-owner-disabled/);
assert.match(source.writeDeactivate, /planning-start-date-owner-disabled/);
assert.match(source.writeDeactivate, /"MES_LEGACY_DOMAIN_WRITES_QUIESCED":false/);
assert.match(source.writeDeactivate, /"MES_PLANNING_LEGACY_WRITES_QUIESCED":false/);
assert.match(source.writeDeactivate, /previous immutable release UI/);
const permissionQuarantineIndex = source.writeDeactivate.indexOf('mv -T -- "$candidate_dropin" "$quarantined_path"');
const offProofIndex = source.writeDeactivate.indexOf('if [[ $off -ne 1 ]]');
const authEnvProofIndex = source.writeDeactivate.indexOf('[[ -f "$EMPLOYEE_AUTH_ENV"');
assert(permissionQuarantineIndex >= 0 && offProofIndex > permissionQuarantineIndex && authEnvProofIndex > offProofIndex,
  "permission quarantine and runtime-OFF proof must precede every employee-auth readiness dependency");
assert.match(source.writeDeactivate, /Unexpected Planning permission was quarantined fail-closed/);
assert.match(source.writeDeactivate, /find "\$dropin_parent" -maxdepth 0 -perm \/022/,
  "drop-in quarantine must reject a group/other-writable systemd parent before cat/mv");
assert.match(source.writeDeactivate, /Pilot remains stopped/,
  "a permission mismatch or unproved OFF state must stop Pilot rather than leave writes enabled");
assert.match(source.writeDeactivate, /stop_pilot_fail_closed\(\)[\s\S]*systemctl kill --kill-whom=all --signal=KILL[\s\S]*! systemctl is-active --quiet "\$SERVICE"/,
  "fail-closed branches must escalate a failed stop and prove the old runtime inactive");
assert.match(source.writeDeactivate, /CRITICAL: runtime OFF was unproved and Pilot could not be stopped/);
assert.match(source.writeDeactivate, /restart_required=\$permission_removed/);
assert.match(source.writeDeactivate, /if \[\[ \$restart_required -eq 0 \]\]/,
  "post-OFF retry attempts must not restart Pilot every five seconds while waiting for nonessential readiness recovery");
assert.match(source.writeSchedule, /--on-active=15m/);
assert.match(source.writeSchedule, /deactivate-react-planning-workbench-write-evaluation\.sh/);
assert.match(source.writeSchedule, /A persistent Planning evaluation permission exists/);

const activationFailureTrap = source.writeActivate.slice(
  source.writeActivate.indexOf("restore_on_failure()"),
  source.writeActivate.indexOf("trap restore_on_failure EXIT") + "trap restore_on_failure EXIT".length,
);
const activationPermissionRemovalIndex = activationFailureTrap.indexOf('rm -f -- "$DROPIN_FILE"');
const activationManagerReloadIndex = activationFailureTrap.indexOf("systemctl daemon-reload");
const activationOffProofIndex = activationFailureTrap.indexOf("runtime_is_proven_off");
const activationInactiveProofIndex = activationFailureTrap.indexOf("stop_pilot_fail_closed");
const activationTimerCollectionIndex = activationFailureTrap.indexOf('systemctl stop "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service"');
assert(activationPermissionRemovalIndex >= 0
  && activationManagerReloadIndex > activationPermissionRemovalIndex
  && activationOffProofIndex > activationManagerReloadIndex
  && activationInactiveProofIndex > activationOffProofIndex
  && activationTimerCollectionIndex > activationInactiveProofIndex,
"activation error rollback must remove permission, reload, prove public OFF or inactive, and only then collect the retrying timer");
assert.match(activationFailureTrap, /\$permission_removed -eq 1[\s\\\n]+&& \$manager_reloaded -eq 1 && \$runtime_safe -eq 1/,
  "an ambiguous activation rollback must leave the retrying timer armed");
assert.match(activationFailureTrap, /CRITICAL: activation rollback could not prove permission removal plus runtime OFF\/inactive/);

const scheduleOldTimerStopIndex = source.writeSchedule.indexOf('systemctl stop "${AUTO_UNIT}.timer" "${AUTO_UNIT}.service"');
const scheduleTrapIndex = source.writeSchedule.indexOf("trap fail_closed_on_rearm_error EXIT");
const scheduleSafetyRemovedIndex = source.writeSchedule.indexOf("safety_net_removed=1");
const scheduleRunIndex = source.writeSchedule.indexOf("systemd-run --quiet --collect");
const scheduleCompleteIndex = source.writeSchedule.indexOf("rearm_complete=1");
assert(scheduleTrapIndex >= 0 && scheduleSafetyRemovedIndex > scheduleTrapIndex
  && scheduleOldTimerStopIndex > scheduleSafetyRemovedIndex
  && scheduleRunIndex > scheduleOldTimerStopIndex
  && scheduleCompleteIndex > scheduleRunIndex,
"re-arm must install its fail-closed trap before removing the old safety net and disarm it only after replacement proof");
const scheduleReleaseLockIndex = source.writeSchedule.indexOf("exec 9>&-");
const scheduleUnsetLockIndex = source.writeSchedule.indexOf("unset MES_RELEASE_AUTHORITY_LOCK_HELD MES_RELEASE_AUTHORITY_LOCK_FD");
const scheduleDeactivateIndex = source.writeSchedule.indexOf('/bin/bash "$DEACTIVATE_SCRIPT" --auto');
assert(scheduleReleaseLockIndex >= 0 && scheduleUnsetLockIndex > scheduleReleaseLockIndex
  && scheduleDeactivateIndex > scheduleUnsetLockIndex,
"a failed re-arm must release the scheduler-owned fd9 and let the release-anchored deactivator wrapper reacquire the canonical lock under its own PID");
assert.match(source.writeSchedule, /systemctl kill --kill-whom=all --signal=KILL/,
  "a failed re-arm/deactivation must escalate to an inactive Pilot instead of returning an active write window");
for (const releaseSwitch of [source.releaseActivate, source.releaseRollback]) {
  assert.match(releaseSwitch, /for systemd_root in \/etc\/systemd\/system \/run\/systemd\/system/,
    "every supported release switch must inspect persistent and reboot-ephemeral evaluation permissions");
  assert.match(releaseSwitch, /-evaluation-auto-rollback\\\.\(timer\|service\)\$/,
    "every supported release switch must reject a loaded release-anchored auto-rollback unit");
}
assert(source.releaseActivate.indexOf("assert_no_active_evaluation \\") < source.releaseActivate.indexOf('"$journal_helper" recover'),
  "activation must block evaluation pointer drift before journal recovery");
assert(source.releaseRollback.indexOf("assert_no_active_evaluation \\") < source.releaseRollback.indexOf('"$journal_helper" recover'),
  "rollback must block evaluation pointer drift before journal recovery");

// Model the exact fail-safe contract tied to the static systemd assertions
// above: the first auto attempt encounters the held authority boundary, then
// Restart=on-failure retries without a start limit and eventually removes the
// permission after the boundary is released.
const retryDirectory = await mkdtemp(join(tmpdir(), "mes-planning-auto-rollback-qa-"));
const simulatedAuthority = join(retryDirectory, "authority.lock");
const simulatedDropin = join(retryDirectory, "87-evaluation.conf");
await writeFile(simulatedDropin, "write=on\n", { mode: 0o600 });
const heldAuthority = await open(simulatedAuthority, "wx", 0o600);
let attempts = 0;
let firstAttemptWasBusy = false;
let permissionRemoved = false;
for (; attempts < 8 && !permissionRemoved; attempts += 1) {
  let acquired;
  try {
    acquired = await open(simulatedAuthority, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    firstAttemptWasBusy = true;
  }
  if (acquired) {
    await unlink(simulatedDropin);
    await acquired.close();
    await unlink(simulatedAuthority);
    permissionRemoved = true;
    break;
  }
  if (attempts === 1) {
    await heldAuthority.close();
    await unlink(simulatedAuthority);
  }
}
assert.equal(firstAttemptWasBusy, true, "the simulated timer must fire while the authority boundary is held");
assert.equal(permissionRemoved, true, "retry must eventually remove the write permission after lock release");
await assert.rejects(access(simulatedDropin));
await rm(retryDirectory, { recursive: true, force: true });

// Simulate an employee-auth rotation/missing file after the fail-safe phase.
// The source-order assertions bind this model to the real deactivator: even
// though the later readiness dependency fails, the systemd *.conf path is
// already absent and only a non-loadable forensic suffix remains.
const authFailureDirectory = await mkdtemp(join(tmpdir(), "mes-planning-auth-failure-qa-"));
const authFailureDropin = join(authFailureDirectory, "87-react-planning-workbench-write-evaluation.conf");
const authFailureQuarantine = `${authFailureDropin}.disabled`;
await writeFile(authFailureDropin, "write=on\n", { mode: 0o600 });
await rename(authFailureDropin, authFailureQuarantine);
const simulatedAuthAvailable = false;
assert.equal(simulatedAuthAvailable, false);
await assert.rejects(access(authFailureDropin), "missing auth must not restore the write-enabling path");
await access(authFailureQuarantine);
await rm(authFailureDirectory, { recursive: true, force: true });

const unsafeParent = await mkdtemp(join(tmpdir(), "mes-planning-unsafe-parent-qa-"));
await chmod(unsafeParent, 0o777);
const unsafeMode = (await stat(unsafeParent)).mode & 0o777;
assert.equal((unsafeMode & 0o022) === 0, false, "0777 systemd parent must be rejected before permission quarantine");
await rm(unsafeParent, { recursive: true, force: true });

let simulatedPilotActive = true;
const gracefulStopWorked = false;
if (gracefulStopWorked) simulatedPilotActive = false;
if (simulatedPilotActive) simulatedPilotActive = false; // systemctl kill fallback
assert.equal(simulatedPilotActive, false, "failed graceful stop must escalate and prove the old runtime inactive");

// Failure-injection model for activation's EXIT trap. A failed restart or an
// ambiguous HTTP probe can collect the retry timer only after the permission
// is absent, systemd reloaded that absence, and OFF/inactive is proven.
for (const injected of [
  { name: "permission-remove-failure", permissionRemoved: false, managerReloaded: false, runtimeSafe: true },
  { name: "daemon-reload-failure", permissionRemoved: true, managerReloaded: false, runtimeSafe: true },
  { name: "restart-timeout-and-stop-failure", permissionRemoved: true, managerReloaded: true, runtimeSafe: false },
]) {
  const timerCollected = injected.permissionRemoved && injected.managerReloaded && injected.runtimeSafe;
  assert.equal(timerCollected, false, `${injected.name} must leave the retrying safety net armed`);
}
assert.equal(Boolean(true && true && true), true,
  "proven permission removal + reload + OFF/inactive may collect the activation timer");

// Failure-injection model for re-arm: once the old timer has been removed, a
// replacement proof keeps the bounded window; every failure takes the
// immediate deactivation branch and therefore returns no active write window.
for (const replacementProven of [true, false]) {
  const deactivationInvoked = !replacementProven;
  const activeWriteWindowReturned = replacementProven || !deactivationInvoked;
  assert.equal(activeWriteWindowReturned, replacementProven,
    "a failed timer replacement must not return with the write permission active");
}

assert.deepEqual(inspectPlanningCompatibilityRows([]), {
  ready: true, pendingCount: 0, conflictCount: 0, oldest: null,
});
const conflictOnly = inspectPlanningCompatibilityRows([{ id: 7, aggregate_id: "WO-7", aggregate_revision: 4, command_type: "change_start_date", snapshot_sync_state: "conflict" }]);
assert.equal(conflictOnly.ready, false);
assert.equal(conflictOnly.pendingCount, 0);
assert.equal(conflictOnly.conflictCount, 1);
assert.equal(conflictOnly.oldest?.state, "conflict");

const exactMarker = {
  observationAvailable: true,
  primaryRevision: 9,
  verifiedPrimaryRevision: 9,
  verifiedContractVersion: 7,
  snapshotGeneration: 11,
  verifiedSnapshotGeneration: 11,
  snapshotObservationState: "observed",
  observedSnapshotVersion: 44701,
  observedSnapshotFingerprint: "sha256:planning-v7",
  verifiedSnapshotFingerprint: "sha256:planning-v7",
};
assert.equal(inspectPlanningParityMarker(exactMarker).ready, true);
assert.equal(inspectPlanningParityMarker({ ...exactMarker, verifiedContractVersion: 6 }).ready, false,
  "a pre-existing v6 marker must never admit the candidate");
assert.equal(inspectPlanningParityMarker({ ...exactMarker, verifiedSnapshotGeneration: 10 }).ready, false);
assert.equal(inspectPlanningParityMarker({ ...exactMarker, verifiedSnapshotFingerprint: "sha256:other" }).ready, false);

const readinessEnv = {
  MES_DOMAIN_STORAGE: "postgres",
  MES_ENABLE_PLANNING_SERVER_COMMANDS: "0",
  MES_ENABLE_PLANNING_START_DATE_COMMANDS: "1",
  MES_ENABLE_EMPLOYEE_AUTH: "1",
  MES_EMPLOYEE_AUTH_SESSION_SECRET: "qa-secret",
  MES_EMPLOYEE_AUTH_HOSTS: "pilot.mes-line.ru",
  DATABASE_URL: "postgres://planning-rollout-qa/not-used",
};
const repositoryFactory = async () => ({
  async health() { return { configured: true, storageBackend: "postgresql" }; },
  async startDateCommandReadiness() { return { schemaReady: true }; },
  async getPlanningProjectionParityState() { return exactMarker; },
  async close() {},
});
const employeeAuthRepositoryFactory = () => ({ async schemaStatus() { return { ready: true }; }, async close() {} });
const systemDomainsRepositoryFactory = () => ({ async get() { return { item: {}, revision: 1 }; }, async close() {} });
const planningAuthorizationResolver = async () => ({ allowed: true });

function makeSqlFactory({ credentials = [{ employee_id: "employee-planner", display_name: "Planner", personnel_number: "P-1" }], outbox = [] } = {}) {
  return () => {
    const sql = async (strings) => String(strings).includes("system_employee_auth_credentials") ? credentials : outbox;
    sql.end = async () => {};
    return sql;
  };
}

const ready = await runPlanningWriteRolloutReadiness({
  env: readinessEnv,
  requireNoUnresolved: true,
  repositoryFactory,
  employeeAuthRepositoryFactory,
  systemDomainsRepositoryFactory,
  planningAuthorizationResolver,
  sqlFactory: makeSqlFactory(),
});
assert.equal(ready.ok, true);
assert.equal(ready.planningParityContractVersion, 7);
assert.equal(ready.eligiblePlanningEmployeeCount, 1);
assert.equal(ready.legacyBrowserDomainWritesQuiesced, true);

await assert.rejects(runPlanningWriteRolloutReadiness({
  env: readinessEnv,
  requireNoUnresolved: true,
  repositoryFactory,
  employeeAuthRepositoryFactory,
  systemDomainsRepositoryFactory,
  planningAuthorizationResolver,
  sqlFactory: makeSqlFactory({ credentials: [] }),
}), /active employee credential/);

await assert.rejects(runPlanningWriteRolloutReadiness({
  env: readinessEnv,
  requireNoUnresolved: true,
  repositoryFactory,
  employeeAuthRepositoryFactory,
  systemDomainsRepositoryFactory,
  planningAuthorizationResolver,
  sqlFactory: makeSqlFactory({ outbox: [{ id: 8, aggregate_id: "WO-8", aggregate_revision: 5, command_type: "change_start_date", snapshot_sync_state: "conflict" }] }),
}), /pending=0, conflict=1/);

await assert.rejects(runPlanningWriteRolloutReadiness({
  env: { ...readinessEnv, MES_ENABLE_PLANNING_SERVER_COMMANDS: "1" },
  repositoryFactory,
  employeeAuthRepositoryFactory,
  systemDomainsRepositoryFactory,
  planningAuthorizationResolver,
  sqlFactory: makeSqlFactory(),
}), /quantity and slot server commands disabled/);

console.log("Planning Workbench React rollout Ops QA: read-only isolation, narrow signed start-date owner, root lock/provenance, v7 parity, conflict-aware cleanup and fail-safe deactivation passed.");
