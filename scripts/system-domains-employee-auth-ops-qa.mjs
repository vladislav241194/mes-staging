import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertEmployeeAuthRuntimeMatches } from "./employee-auth-readiness-policy.mjs";

const paths = {
  readiness: new URL("../ops/auth/assert-pilot-employee-auth-readiness.sh", import.meta.url),
  deactivateAuth: new URL("../ops/auth/deactivate-pilot-employee-auth.sh", import.meta.url),
  activate: new URL("../ops/postgres/activate-system-domains-command-surfaces.sh", import.meta.url),
  suspend: new URL("../ops/postgres/deactivate-system-domains-command-surfaces.sh", import.meta.url),
  recover: new URL("../ops/postgres/recover-system-domains-primary-command-surfaces.sh", import.meta.url),
};
const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await readFile(path, "utf8")])));
for (const [name, path] of Object.entries(paths)) {
  execFileSync("bash", ["-n", fileURLToPath(path)], { stdio: "pipe" });
  assert.ok(((await stat(path)).mode & 0o111) !== 0, `${name} must remain executable`);
}

assert.match(source.readiness, /cmp -s "\$SOURCE_FILE" "\$DROPIN_FILE"/);
assert.match(source.readiness, /\/proc\/\$\{MAIN_PID\}\/environ/);
assert.match(source.readiness, /employeeAuthStorageConfigured/);
assert.match(source.readiness, /employeeAuthSchemaReady/);
assert.doesNotMatch(source.readiness, /Cookie:|mes_employee_session|MES_PUBLIC_AUTH_SESSION/);

for (const name of ["activate", "recover"]) {
  const occurrences = source[name].match(/assert_employee_auth_readiness/g) || [];
  assert.ok(occurrences.length >= 3, `${name} must define, preflight and post-restart prove employee-auth readiness`);
  assert.match(source[name], /assert-pilot-employee-auth-readiness\.sh/);
}
assert.match(source.activate, /compatibilityReady/);
assert.match(source.activate, /primaryReady/);
assert.match(source.activate, /retirementEligible/);
assert.match(source.activate, /capability\.schemaReady !== true/);
assert.match(source.activate, /Timesheet and Access Control server writes remain disabled/);

assert.match(source.suspend, /SCRIPT_APP_DIR/);
assert.match(source.suspend, /primarySuspendReady/);
assert.match(source.suspend, /target === "disabled"/);
assert.match(source.suspend, /retirementEligible/);
assert.match(source.suspend, /EXPECTED_AUTHORITY_MODE/);
assert.match(source.suspend, /snapshot\/tombstone state were preserved/);
assert.match(source.suspend, /release-root-seal-verify\.mjs/);
assert.match(source.suspend, /restore_on_failure/);

assert.match(source.recover, /mode !== "postgres-primary"/);
assert.match(source.recover, /retirementEligible !== true/);
assert.match(source.recover, /MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES !== process\.argv\[2\]/);
assert.match(source.recover, /retired compatibility snapshot remains untouched/);
assert.match(source.recover, /Run mes-pilot-domain-migrate\.service and prove migration 033/);
assert.match(source.recover, /EXPECTED_CSV="production-structure"/);
assert.match(source.recover, /mes-pilot-system-domains-production-structure\.conf/);

assert.match(source.deactivateAuth, /\/api\/v1\/system-domains\/capabilities/);
assert.match(source.deactivateAuth, /MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS/);
assert.match(source.deactivateAuth, /MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES/);
assert.match(source.deactivateAuth, /deactivate-system-domains-command-surfaces\.sh --to=disabled/);

assert.doesNotMatch(Object.values(source).join("\n"), /Blueprint/i);

const protectedSource = [
  "MES_EMPLOYEE_AUTH_HOSTS=pilot.mes-line.ru",
  "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS=28800",
  "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=5",
  "MES_EMPLOYEE_AUTH_LOCK_SECONDS=900",
  `MES_EMPLOYEE_AUTH_SESSION_SECRET=${"a".repeat(32)}`,
].join("\n");
const processSource = `MES_ENABLE_EMPLOYEE_AUTH=1\0${protectedSource.replaceAll("\n", "\0")}\0`;
assert.equal(assertEmployeeAuthRuntimeMatches({ protectedSource, processSource, requiredHost: "pilot.mes-line.ru" }), true);
for (const mismatch of [
  processSource.replace("a".repeat(32), "b".repeat(32)),
  processSource.replace("MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=5", "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=500"),
  processSource.replace("MES_EMPLOYEE_AUTH_LOCK_SECONDS=900", "MES_EMPLOYEE_AUTH_LOCK_SECONDS=0"),
]) {
  assert.throws(
    () => assertEmployeeAuthRuntimeMatches({ protectedSource, processSource: mismatch, requiredHost: "pilot.mes-line.ru" }),
    /differs from the protected environment/,
  );
}
for (const invalidProtectedSource of [
  protectedSource.replace("MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS=28800", "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS=999999999"),
  protectedSource.replace("MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=5", "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS=0"),
  protectedSource.replace("MES_EMPLOYEE_AUTH_LOCK_SECONDS=900", "MES_EMPLOYEE_AUTH_LOCK_SECONDS=invalid"),
]) {
  assert.throws(
    () => assertEmployeeAuthRuntimeMatches({
      protectedSource: invalidProtectedSource,
      processSource: `MES_ENABLE_EMPLOYEE_AUTH=1\0${invalidProtectedSource.replaceAll("\n", "\0")}\0`,
      requiredHost: "pilot.mes-line.ru",
    }),
    /must be between/,
  );
}
console.log("System Domains employee-auth/root Ops QA: OK");
console.log("- activation and PostgreSQL-primary recovery fail closed on employee-auth root readiness: pass");
console.log("- sealed staged suspend preserves primary tombstone and deactivation ordering: pass");
