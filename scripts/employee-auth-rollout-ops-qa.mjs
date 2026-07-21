import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const opsRoot = new URL("../ops/auth/", import.meta.url);
const paths = {
  installEnv: new URL("install-pilot-employee-auth-env.sh", opsRoot),
  provision: new URL("provision-pilot-employee-pin.sh", opsRoot),
  activateAuth: new URL("activate-pilot-employee-auth.sh", opsRoot),
  activateCommands: new URL("activate-pilot-nomenclature-command-owner.sh", opsRoot),
  deactivateCommands: new URL("deactivate-pilot-nomenclature-command-owner.sh", opsRoot),
  deactivateAuth: new URL("deactivate-pilot-employee-auth.sh", opsRoot),
  assertReadiness: new URL("assert-pilot-employee-auth-readiness.sh", opsRoot),
  deactivateStack: new URL("deactivate-pilot-nomenclature-evaluation-stack.sh", opsRoot),
  scheduleAutoRollback: new URL("schedule-pilot-nomenclature-evaluation-auto-rollback.sh", opsRoot),
  prepareRollback: new URL("prepare-pilot-nomenclature-release-rollback.sh", opsRoot),
  readinessPolicy: new URL("../../scripts/employee-auth-readiness-policy.mjs", opsRoot),
  authDropin: new URL("mes-pilot-employee-auth.conf", opsRoot),
  commandDropin: new URL("mes-pilot-nomenclature-command-owner.conf", opsRoot),
  envExample: new URL("mes-pilot-employee-auth.env.example", opsRoot),
  readme: new URL("README.md", opsRoot),
};

const entries = await Promise.all(Object.entries(paths).map(async ([name, path]) => [
  name,
  await readFile(path, "utf-8"),
]));
const source = Object.fromEntries(entries);
const readinessPolicy = await import(paths.readinessPolicy.href);

const shellNames = [
  "installEnv",
  "provision",
  "activateAuth",
  "activateCommands",
  "deactivateCommands",
  "deactivateAuth",
  "assertReadiness",
  "deactivateStack",
  "scheduleAutoRollback",
  "prepareRollback",
];
for (const name of shellNames) {
  assert.match(source[name], /^#!\/usr\/bin\/env bash/);
  assert.match(source[name], /set -euo pipefail/);
  assert.match(source[name], /EUID/);
  const fileStat = await stat(paths[name]);
  assert.ok((fileStat.mode & 0o111) !== 0, `${name} must be executable`);
  execFileSync("bash", ["-n", fileURLToPath(paths[name])], { stdio: "pipe" });
}

assert.match(source.installEnv, /stat -c '%u'/);
assert.match(source.installEnv, /8#\$source_mode & 077/);
assert.match(source.installEnv, /install -o root -g root -m 0600/);
assert.match(source.installEnv, /cp -a "\$TARGET_FILE" "\$backup_dir\/previous\.env"/);
assert.match(source.installEnv, /cp -a "\$backup_dir\/previous\.env" "\$TARGET_FILE"/);
assert.match(source.installEnv, /restore_on_failure/);
assert.match(source.installEnv, /Secret source must stay outside the immutable application release/);
assert.match(source.installEnv, /\^\[A-Za-z0-9_-\]\{32,/);
assert.match(source.installEnv, /MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS: \[300, 86400\]/);
assert.match(source.installEnv, /MES_EMPLOYEE_AUTH_MAX_ATTEMPTS: \[1, 20\]/);
assert.match(source.installEnv, /MES_EMPLOYEE_AUTH_LOCK_SECONDS: \[1, 86400\]/);
assert.doesNotMatch(source.installEnv, /openssl rand|\/dev\/urandom/);

assert.match(source.envExample, /^MES_EMPLOYEE_AUTH_HOSTS=pilot\.mes-line\.ru$/m);
assert.match(source.envExample, /^# MES_EMPLOYEE_AUTH_SESSION_SECRET=$/m);
assert.doesNotMatch(source.envExample, /^MES_EMPLOYEE_AUTH_SESSION_SECRET=.+$/m);
assert.doesNotMatch(source.envExample, /MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS/);

assert.match(source.authDropin, /EnvironmentFile=\/etc\/mes\/mes-pilot-employee-auth\.env/);
assert.match(source.authDropin, /Environment=MES_ENABLE_EMPLOYEE_AUTH=1/);
assert.doesNotMatch(source.authDropin, /MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS/);
assert.doesNotMatch(source.authDropin, /MES_REQUIRE_EMPLOYEE_AUTH_GATE|MES_EMPLOYEE_AUTH_REQUIRED/);
assert.match(source.commandDropin, /Environment=MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1/);
assert.doesNotMatch(source.commandDropin, /SESSION_SECRET|EnvironmentFile/);

assert.match(source.provision, /read -r -s -p "Employee PIN:/);
assert.match(source.provision, /APP_DIR="\$\(readlink -f "\$APP_DIR_INPUT"/);
assert.match(source.provision, /--pin-stdin/);
assert.match(source.provision, /employee-auth-credential-admin\.mjs/);
assert.match(source.provision, /delete-credential/);
assert.match(source.provision, /employee-auth-credential-admin\.mjs" delete-credential/);
assert.doesNotMatch(source.provision, /--pin=|export employee_pin|MES_EMPLOYEE_AUTH_PIN/);

for (const name of ["activateAuth", "activateCommands"]) {
  assert.match(source[name], /cp -a "\$DROPIN_FILE" "\$backup_dir\/previous\.conf"/);
  assert.match(source[name], /cp -a "\$backup_dir\/previous\.conf" "\$DROPIN_FILE"/);
  assert.match(source[name], /restore_on_failure/);
  assert.match(source[name], /systemctl daemon-reload/);
  assert.match(source[name], /systemctl restart "\$SERVICE"/);
  assert.match(source[name], /request_health/);
  assert.match(source[name], /request_capabilities/);
  assert.match(source[name], /employeeAuthSchemaReady/);
}

assert.match(source.activateAuth, /serverCommandsConfigured === true/);
assert.match(source.activateAuth, /Nomenclature commands must remain off during Stage 1/);
assert.match(source.activateAuth, /67-employee-auth\.conf/);

const backupIndex = source.activateCommands.indexOf("backup-shared-state.mjs");
const commandInstallIndex = source.activateCommands.indexOf('install -m 0644 "$SOURCE_FILE" "$DROPIN_FILE"');
assert.ok(backupIndex >= 0 && commandInstallIndex > backupIndex, "Shared-state backup must complete before the command-owner drop-in is installed");
assert.match(source.activateCommands, /before-nomenclature-command-owner-enable/);
assert.match(source.activateCommands, /\/usr\/sbin\/runuser -u "\$SERVICE_USER"/);
assert.match(source.activateCommands, /MES_SHARED_STATE_DIR=\/srv\/mes\/pilot\/shared-state/);
assert.match(source.activateCommands, /68-nomenclature-command-owner\.conf/);
assert.match(source.activateCommands, /serverCommandsConfigured !== true/);
assert.match(source.activateCommands, /serverCommandsEnabled !== false/);
assert.match(source.activateCommands, /request_command_denial/);
assert.match(source.activateCommands, /root-readiness-denial-probe/);
assert.match(source.activateCommands, /nomenclature-write-forbidden/);
assert.match(source.activateCommands, /-H 'Host: mes-internal'/);
assert.match(source.activateCommands, /-H 'Origin: http:\/\/mes-internal'/);
assert.doesNotMatch(source.activateCommands, /Origin: http:\/\/127\.0\.0\.1/);

const removeCommandIndex = source.deactivateCommands.indexOf('rm -f "$DROPIN_FILE"');
const restartAfterRemoveIndex = source.deactivateCommands.indexOf('systemctl restart "$SERVICE"');
assert.ok(removeCommandIndex >= 0 && restartAfterRemoveIndex > removeCommandIndex, "Command drop-in must be removed before restart/readiness proof");
assert.match(source.deactivateCommands, /cp -a "\$DROPIN_FILE" "\$backup_dir\/previous\.conf"/);
assert.match(source.deactivateCommands, /cmp -s "\$SOURCE_FILE" "\$DROPIN_FILE"/);
assert.match(source.deactivateCommands, /operator-modified command-owner drop-in/);
assert.match(source.deactivateCommands, /Never automatically restore an enabling writer/);
assert.doesNotMatch(source.deactivateCommands, /install -m 0644 "\$backup_dir\/previous\.conf"/);
assert.match(source.deactivateCommands, /serverCommandsConfigured === true/);
assert.match(source.deactivateCommands, /value\.ok !== true/);
assert.match(source.deactivateCommands, /employeeAuthStorageConfigured !== true/);
assert.doesNotMatch(source.deactivateCommands, /employeeAuthConfigured !== true/);

assert.match(source.deactivateAuth, /Deactivate Nomenclature command owner before employee-auth/);
assert.match(source.deactivateAuth, /MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1/);
assert.match(source.deactivateAuth, /Deactivate System Domains command surfaces before employee-auth/);
assert.match(source.deactivateAuth, /MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1/);
assert.match(source.deactivateAuth, /MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES/);
assert.match(source.deactivateAuth, /deactivate-system-domains-command-surfaces\.sh --to=disabled/);
assert.match(source.deactivateAuth, /\/api\/v1\/system-domains\/capabilities/);
assert.match(source.deactivateAuth, /restore_on_failure/);
assert.match(source.deactivateAuth, /cp -a "\$backup_dir\/previous\.conf" "\$DROPIN_FILE"/);
assert.match(source.deactivateAuth, /cmp -s "\$SOURCE_FILE" "\$DROPIN_FILE"/);
assert.match(source.deactivateAuth, /operator-modified employee-auth drop-in/);

assert.match(source.assertReadiness, /cmp -s "\$SOURCE_FILE" "\$DROPIN_FILE"/);
assert.match(source.assertReadiness, /0:0:600/);
assert.match(source.assertReadiness, /READINESS_POLICY="\$\{APP_DIR\}\/scripts\/employee-auth-readiness-policy\.mjs"/);
assert.equal((source.assertReadiness.match(/\/usr\/bin\/node "\$READINESS_POLICY"/g) || []).length, 1, "Readiness shell must invoke the shared policy exactly once");
assert.ok(source.assertReadiness.includes('/usr/bin/node "$READINESS_POLICY" "$ENV_FILE" "/proc/${MAIN_PID}/environ" "$REQUIRED_HOST" \\\n'), "Readiness shell must pass the protected env, exact running process env and required host to the shared policy in order");
assert.match(source.assertReadiness, /\/proc\/\$\{MAIN_PID\}\/environ/);
assert.match(source.assertReadiness, /employeeAuthStorageConfigured/);
assert.match(source.assertReadiness, /employeeAuthSchemaReady/);
assert.doesNotMatch(source.assertReadiness, /Cookie:|mes_employee_session/);

assert.deepEqual(readinessPolicy.EMPLOYEE_AUTH_RUNTIME_KEYS, [
  "MES_EMPLOYEE_AUTH_HOSTS",
  "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS",
  "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS",
  "MES_EMPLOYEE_AUTH_LOCK_SECONDS",
  "MES_EMPLOYEE_AUTH_SESSION_SECRET",
]);
assert.match(source.readinessPolicy, /runtime\.MES_ENABLE_EMPLOYEE_AUTH !== "1"/);
assert.match(source.readinessPolicy, /Running employee-auth value differs from the protected environment/);
assert.match(source.readinessPolicy, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/);
const testSecret = "s".repeat(32);
const protectedEnvironment = [
  "MES_EMPLOYEE_AUTH_HOSTS=pilot.mes-line.ru",
  "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS=900",
  "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=5",
  "MES_EMPLOYEE_AUTH_LOCK_SECONDS=300",
  `MES_EMPLOYEE_AUTH_SESSION_SECRET=${testSecret}`,
].join("\n");
const runningEnvironment = [
  "MES_ENABLE_EMPLOYEE_AUTH=1",
  "MES_EMPLOYEE_AUTH_HOSTS=pilot.mes-line.ru",
  "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS=900",
  "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=5",
  "MES_EMPLOYEE_AUTH_LOCK_SECONDS=300",
  `MES_EMPLOYEE_AUTH_SESSION_SECRET=${testSecret}`,
].join("\0");
assert.equal(readinessPolicy.assertEmployeeAuthRuntimeMatches({ protectedSource: protectedEnvironment, processSource: runningEnvironment, requiredHost: "pilot.mes-line.ru" }), true);
assert.throws(() => readinessPolicy.parseProtectedEmployeeAuthEnvironment(`${protectedEnvironment}\nMES_EMPLOYEE_AUTH_HOSTS=pilot.mes-line.ru`), /unsupported or duplicate/);
assert.throws(() => readinessPolicy.parseProtectedEmployeeAuthEnvironment(`${protectedEnvironment}\nUNREVIEWED_SECRET=value`), /unsupported or duplicate/);
assert.throws(() => readinessPolicy.assertEmployeeAuthRuntimeMatches({ protectedSource: protectedEnvironment, processSource: runningEnvironment.replace("MES_ENABLE_EMPLOYEE_AUTH=1", "MES_ENABLE_EMPLOYEE_AUTH=0"), requiredHost: "pilot.mes-line.ru" }), /not enabled/);
assert.throws(() => readinessPolicy.assertEmployeeAuthRuntimeMatches({ protectedSource: protectedEnvironment, processSource: runningEnvironment, requiredHost: "stage.mes-line.ru" }), /Required employee-auth host is missing/);

const rollbackEvaluationIndex = source.prepareRollback.indexOf("deactivate-react-nomenclature-write-evaluation.sh");
const rollbackCommandsIndex = source.prepareRollback.indexOf("deactivate-pilot-nomenclature-command-owner.sh");
const rollbackAuthIndex = source.prepareRollback.indexOf("deactivate-pilot-employee-auth.sh");
assert.ok(rollbackEvaluationIndex >= 0 && rollbackCommandsIndex > rollbackEvaluationIndex && rollbackAuthIndex > rollbackCommandsIndex, "Release rollback must turn evaluation, commands and employee-auth OFF in order");
assert.match(source.prepareRollback, /if \[\[ -f "\$COMMAND_DROPIN" \]\] \|\| effective_flag_enabled MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS/);
assert.match(source.prepareRollback, /if \[\[ -f "\$AUTH_DROPIN" \]\] \|\| effective_flag_enabled MES_ENABLE_EMPLOYEE_AUTH/);
assert.match(source.prepareRollback, /MainPID/);
assert.match(source.prepareRollback, /another React evaluation remains active/);
assert.doesNotMatch(source.prepareRollback, /--property=Environment/);
assert.match(source.prepareRollback, /Refusing release rollback: Nomenclature command authority is still enabled/);
assert.match(source.prepareRollback, /Current release is healthy/);

const stackEvaluationIndex = source.deactivateStack.indexOf("deactivate-react-nomenclature-write-evaluation.sh");
const stackCommandsIndex = source.deactivateStack.indexOf("deactivate-pilot-nomenclature-command-owner.sh");
const stackAuthIndex = source.deactivateStack.indexOf("deactivate-pilot-employee-auth.sh");
assert.ok(stackEvaluationIndex >= 0 && stackCommandsIndex > stackEvaluationIndex && stackAuthIndex > stackCommandsIndex, "Fail-safe stack must turn evaluation, commands and employee-auth OFF in order");
assert.match(source.deactivateStack, /run_rollback_step/);
assert.match(source.deactivateStack, /BASH_SOURCE\[0\]/);
assert.match(source.deactivateStack, /MES_PILOT_APP_DIR="\$APP_DIR" "\$script"/);
assert.match(source.deactivateStack, /continuing toward the safer all-OFF state/);
assert.match(source.deactivateStack, /"status":"ok"/);
assert.match(source.deactivateStack, /serverCommandsConfigured === true/);
assert.match(source.deactivateStack, /MES_REACT_NOMENCLATURE_WRITE_EVALUATION/);
assert.match(source.deactivateStack, /MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS/);
assert.match(source.deactivateStack, /MES_ENABLE_EMPLOYEE_AUTH/);
assert.doesNotMatch(source.deactivateStack, /--property=Environment/);

assert.match(source.scheduleAutoRollback, /readlink -f/);
assert.match(source.scheduleAutoRollback, /\/usr\/bin\/systemd-run/);
assert.match(source.scheduleAutoRollback, /--on-active="\$delay"/);
assert.match(source.scheduleAutoRollback, /deactivate-pilot-nomenclature-evaluation-stack\.sh/);
assert.match(source.scheduleAutoRollback, /systemctl is-active --quiet "\$\{unit_name\}\.timer"/);
assert.doesNotMatch(source.scheduleAutoRollback, /EnvironmentFile|SESSION_SECRET|--setenv/);

assert.match(source.readme, /React write evaluation OFF first/);
assert.match(source.readme, /normal Pilot login remains unchanged/);
assert.match(source.readme, /single provisioned QA employee therefore does not block other Pilot users/);
assert.match(source.readme, /Only the currently selected employee with a valid credential and current RBAC/);
assert.match(source.readme, /schedule-pilot-nomenclature-evaluation-auto-rollback\.sh/);
assert.match(source.readme, /never restored\s+automatically/i);

const combined = Object.values(source).join("\n");
assert.doesNotMatch(combined, /Blueprint/i);
assert.doesNotMatch(combined, /MES_EMPLOYEE_AUTH_SESSION_SECRET=[A-Za-z0-9_-]{8,}/);

console.log("Employee-auth rollout ops QA passed: staged activation, private env, timed fail-safe and evaluation-to-auth ordered rollback.");
