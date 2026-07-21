import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SYSTEM_DOMAINS_COMMAND_MARKER_PATH,
  buildSystemDomainsCommandManifestContract,
  validateSystemDomainsCandidateManifest,
} from "./release-system-domains-command-contract.mjs";

const markerSource = await readFile(new URL(`../${SYSTEM_DOMAINS_COMMAND_MARKER_PATH}`, import.meta.url), "utf8");
const marker = JSON.parse(markerSource);
const compatibility = buildSystemDomainsCommandManifestContract(markerSource);
assert.equal(marker.authorizationSnapshotVersion, 2, "production-structure commands must bind the signed employee/RBAC authorization contract");
assert.equal(marker.employeeAuthReadinessVersion, 1, "production-structure rollout must bind root employee-auth readiness");
assert.equal(marker.lifecycleGuardVersion, 1, "production-structure commands must bind final-state lifecycle invariants");
assert.equal(marker.resourceDependencyLockVersion, 1, "production-structure commands must bind the durable Planning/Shift dependency lock");
assert.deepEqual(marker.rolloutEligibleSurfaces, ["production-structure"], "the release marker must not advertise Timesheet or Access Control as rollout eligible");
assert(marker.requiredMigrations.includes("027_employee_auth_credentials"), "the System Domains command release must require durable employee-session storage");
assert(marker.requiredMigrations.includes("033_system_domains_lifecycle_archived_at"), "the System Domains command release must require durable lifecycle archive timestamps");
const manifest = {
  schemaVersion: 3,
  releaseId: "v.1.500.system-domains-qa",
  runtimeIncludes: ["ops", "scripts"],
  systemDomainsCommandCompatibility: compatibility,
};
assert.deepEqual(validateSystemDomainsCandidateManifest(manifest, markerSource), compatibility);
assert.throws(
  () => validateSystemDomainsCandidateManifest({ ...manifest, schemaVersion: 2 }, markerSource),
  /does not bind/,
  "schema-v2 manifests must not claim System Domains command compatibility",
);
assert.throws(
  () => validateSystemDomainsCandidateManifest({ ...manifest, runtimeIncludes: ["scripts"] }, markerSource),
  /does not bind/,
  "the release source digest must cover root-owned Ops",
);
assert.throws(
  () => validateSystemDomainsCandidateManifest({
    ...manifest,
    systemDomainsCommandCompatibility: { ...compatibility, sha256: "0".repeat(64) },
  }, markerSource),
  /does not bind/,
  "the manifest must bind the exact System Domains marker bytes",
);
for (const field of [
  "commandSurfaceVersion", "actorPolicyVersion", "authorizationSnapshotVersion", "authorityTransitionVersion",
  "employeeAuthReadinessVersion", "lifecycleGuardVersion", "resourceDependencyLockVersion",
]) {
  const incompatible = { ...marker };
  delete incompatible[field];
  assert.throws(
    () => buildSystemDomainsCommandManifestContract(`${JSON.stringify(incompatible)}\n`),
    /marker is invalid/,
    `missing ${field} must reject the release contract`,
  );
}

const [activateSource, rollbackSource, stageSource, verifierSource] = await Promise.all([
  readFile(new URL("./release-activate.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-stage.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-server-command-contract-verify.mjs", import.meta.url), "utf8"),
]);
const [apiSource, authorizationSource, impactSource, dependencyLockSource] = await Promise.all([
  readFile(new URL("./domain-api.mjs", import.meta.url), "utf8"),
  readFile(new URL("./system-domains-command-authorization.mjs", import.meta.url), "utf8"),
  readFile(new URL("./system-domains-production-structure-impact.mjs", import.meta.url), "utf8"),
  readFile(new URL("./production-resource-dependency-lock.mjs", import.meta.url), "utf8"),
]);
assert(apiSource.includes("resolveSystemDomainsProductionStructureAuthorization")
  && apiSource.includes("validateSystemDomainsProductionStructureImpact")
  && apiSource.includes("production-structure-authorization-stale")
  && apiSource.includes("productionStructureWriteEnabled"),
"the versioned server surface must enforce employee RBAC, impact validation and revision binding");
assert(authorizationSource.includes("inspectEmployeeAuthSession") && authorizationSource.includes('moduleId: "productionStructureMatrix"'), "authorization v2 must derive its actor from the signed employee session and current module grant");
assert(impactSource.includes("position-active-assignment") && impactSource.includes("equipment-active-resource-dependency"), "authorization v2 must retain the server-owned Position and Equipment impact guards");
assert(impactSource.includes("production-structure-hard-delete-forbidden")
  && impactSource.includes("duplicate-active-responsibility-policy")
  && impactSource.includes("candidateFinalStructureConflicts"),
"the lifecycle contract must reject hard delete, duplicate active policy and inactive-parent candidates");
assert(dependencyLockSource.includes("pg_advisory_xact_lock_shared") && dependencyLockSource.includes("pg_advisory_xact_lock(hashtext"), "the resource-dependency contract must bind shared Planning/Shift writers to exclusive Equipment impact+replace");
assert(stageSource.includes("systemDomainsCommandCompatibility") && stageSource.includes("validateSystemDomainsCandidateManifest(manifest"), "release staging must bind and validate the System Domains contract");
assert(verifierSource.includes('args.contract === "all" || args.contract === "system-domains"'), "the common immutable-release verifier must expose the System Domains contract");

const beginMarker = "# SYSTEM_DOMAINS_RELEASE_SWITCH_GUARD_BEGIN";
const endMarker = "# SYSTEM_DOMAINS_RELEASE_SWITCH_GUARD_END";
const extractGuard = (source, label) => {
  const start = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker, start + beginMarker.length);
  assert(start >= 0 && end > start, `${label} System Domains guard must remain extractable`);
  return source.slice(start, end + endMarker.length);
};
const activateGuard = extractGuard(activateSource, "activation");
const rollbackGuard = extractGuard(rollbackSource, "rollback");
assert.equal(activateGuard, rollbackGuard, "activation and rollback must share the exact System Domains OFF proof");

const root = await mkdtemp(join(tmpdir(), "mes-system-domains-command-contract-"));
try {
  const app = join(root, "app");
  const releaseManifest = join(root, "release-manifest.json");
  await mkdir(join(app, "scripts"), { recursive: true });
  await mkdir(join(app, "ops", "postgres"), { recursive: true });
  await writeFile(join(app, SYSTEM_DOMAINS_COMMAND_MARKER_PATH), markerSource);
  await writeFile(join(app, "scripts", "release-verify.mjs"), "if (!process.argv.includes('--public-only')) process.exit(41);\n");
  await writeFile(releaseManifest, `${JSON.stringify(manifest)}\n`);
  const commonVerifier = spawnSync(process.execPath, [
    new URL("./release-server-command-contract-verify.mjs", import.meta.url).pathname,
    `--app=${app}`,
    `--manifest=${releaseManifest}`,
    `--expected-release-id=${manifest.releaseId}`,
    "--contract=system-domains",
  ], { encoding: "utf8", env: { ...process.env, MES_RELEASE_PUBLIC_VERIFIER_QA_PATH: join(app, "scripts", "release-verify.mjs") } });
  assert.equal(commonVerifier.status, 0, commonVerifier.stderr);

  const bin = join(root, "bin");
  const systemdRoot = join(root, "systemd");
  const procRoot = join(root, "proc");
  const service = "mes-qa.service";
  const serviceDropins = join(systemdRoot, `${service}.d`);
  const mainPid = "4242";
  const processDir = join(procRoot, mainPid);
  const processEnvironment = join(processDir, "environ");
  await mkdir(bin, { recursive: true });
  await mkdir(serviceDropins, { recursive: true });
  await mkdir(processDir, { recursive: true });
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
if [ "\${1:-}" = "show" ]; then printf '%s\\n' "\${QA_MAIN_PID:-0}"; fi
exit 0
`);
  await chmod(join(bin, "systemctl"), 0o755);
  await writeFile(join(bin, "tr"), `#!/bin/sh
if [ "\${QA_TR_FAIL:-0}" = "1" ]; then exit 74; fi
exec /usr/bin/tr "$@"
`);
  await chmod(join(bin, "tr"), 0o755);
  const baseEnv = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: systemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: procRoot,
    QA_MAIN_PID: mainPid,
  };
  const runGuard = (env = baseEnv) => spawnSync("bash", ["-c", `${rollbackGuard}
switch_operation=qa
service=${service}
assert_legacy_incompatible_system_domains_commands_disabled
`], { encoding: "utf8", env });
  const writeEnvironment = async (values) => writeFile(processEnvironment, Buffer.from(`${values.join("\0")}\0`, "utf8"));

  await writeEnvironment([
    "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=0",
    "MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=",
  ]);
  assert.equal(runGuard().status, 0, "an exact System Domains OFF proof must pass");

  for (const content of [
    "[Service]\nEnvironment=MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1\n",
    "[Service]\nEnvironment=MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=production-structure\n",
  ]) {
    const unexpected = join(serviceDropins, "99-unexpected-system-domains.conf");
    await writeFile(unexpected, content);
    assert.notEqual(runGuard().status, 0, "any configured System Domains writer or non-empty surface list must fail closed");
    await rm(unexpected);
  }
  for (const values of [
    ["MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=1"],
    ["MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=0", "MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=production-structure"],
  ]) {
    await writeEnvironment(values);
    assert.notEqual(runGuard().status, 0, "effective System Domains command state must block an incompatible runtime");
  }
  assert.notEqual(runGuard({ ...baseEnv, QA_MAIN_PID: "0" }).status, 0, "invalid MainPID must fail closed");
  assert.notEqual(runGuard({ ...baseEnv, QA_MAIN_PID: "9999" }).status, 0, "missing process environment must fail closed");
  await writeEnvironment(["MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=0"]);
  assert.notEqual(runGuard({ ...baseEnv, QA_TR_FAIL: "1" }).status, 0, "a process-environment read race must fail closed");
} finally {
  await rm(root, { recursive: true, force: true });
}

for (const file of [
  "activate-system-domains-command-surfaces.sh",
  "deactivate-system-domains-command-surfaces.sh",
  "recover-system-domains-primary-command-surfaces.sh",
  "retire-system-domains-snapshot.sh",
]) {
  const source = await readFile(new URL(`../ops/postgres/${file}`, import.meta.url), "utf8");
  assert(source.includes("RELEASES_DIR") && source.includes("release-server-command-contract-verify.mjs"), `${file} must bind root lifecycle to an immutable verified release`);
  assert(source.includes("--contract=system-domains"), `${file} must require the exact System Domains marker contract`);
}

console.log("System Domains release command contract QA: OK");
