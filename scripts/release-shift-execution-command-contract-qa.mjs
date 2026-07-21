import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SHIFT_EXECUTION_COMMAND_MARKER_PATH,
  buildShiftExecutionCommandManifestContract,
  validateShiftExecutionCandidateManifest,
} from "./release-shift-execution-command-contract.mjs";
import {
  stagedCommandSurfacesDisabled,
  systemDomainsPrimaryTombstoneReady,
} from "./release-staged-command-deactivation-policy.mjs";

const markerSource = await readFile(new URL(`../${SHIFT_EXECUTION_COMMAND_MARKER_PATH}`, import.meta.url), "utf8");
const marker = JSON.parse(markerSource);
const compatibility = buildShiftExecutionCommandManifestContract(markerSource);
const manifest = {
  schemaVersion: 3,
  releaseId: "v.1.500.shift-execution-qa",
  runtimeIncludes: ["ops", "scripts"],
  shiftExecutionCommandCompatibility: compatibility,
};
assert.deepEqual(validateShiftExecutionCandidateManifest(manifest, markerSource), compatibility);
assert.throws(() => validateShiftExecutionCandidateManifest({ ...manifest, schemaVersion: 2 }, markerSource), /does not bind/);
assert.throws(() => validateShiftExecutionCandidateManifest({ ...manifest, runtimeIncludes: ["scripts"] }, markerSource), /does not bind/);
assert.throws(() => validateShiftExecutionCandidateManifest({
  ...manifest,
  shiftExecutionCommandCompatibility: { ...compatibility, sha256: "0".repeat(64) },
}, markerSource), /does not bind/);
for (const field of [
  "commandSurfaceVersion",
  "authenticatedActorVersion",
  "revisionConcurrencyVersion",
  "idempotencyReceiptVersion",
  "authorityTransitionVersion",
]) {
  const incompatible = { ...marker };
  delete incompatible[field];
  assert.throws(() => buildShiftExecutionCommandManifestContract(`${JSON.stringify(incompatible)}\n`), /marker is invalid/);
}

const [activateSource, rollbackSource, stageSource, commonVerifierSource] = await Promise.all([
  readFile(new URL("./release-activate.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-stage.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-server-command-contract-verify.mjs", import.meta.url), "utf8"),
]);
assert(stageSource.includes("shiftExecutionCommandCompatibility") && stageSource.includes("validateShiftExecutionCandidateManifest(manifest"), "release staging must bind the Shift Execution contract");
assert(commonVerifierSource.includes('args.contract === "all" || args.contract === "shift-execution"'), "the common verifier must expose Shift Execution compatibility");

const beginMarker = "# SHIFT_EXECUTION_RELEASE_SWITCH_GUARD_BEGIN";
const endMarker = "# SHIFT_EXECUTION_RELEASE_SWITCH_GUARD_END";
const extractGuard = (source, label) => {
  const start = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker, start + beginMarker.length);
  assert(start >= 0 && end > start, `${label} Shift Execution guard must remain extractable`);
  return source.slice(start, end + endMarker.length);
};
const activateGuard = extractGuard(activateSource, "activation");
const rollbackGuard = extractGuard(rollbackSource, "rollback");
assert.equal(activateGuard, rollbackGuard, "activation and rollback must share the exact Shift Execution OFF proof");

const root = await mkdtemp(join(tmpdir(), "mes-shift-execution-command-contract-"));
try {
  const app = join(root, "app");
  const releaseManifest = join(root, "release-manifest.json");
  await mkdir(join(app, "scripts"), { recursive: true });
  await mkdir(join(app, "ops", "postgres"), { recursive: true });
  await writeFile(join(app, SHIFT_EXECUTION_COMMAND_MARKER_PATH), markerSource);
  await writeFile(join(app, "scripts", "release-verify.mjs"), "if (!process.argv.includes('--public-only')) process.exit(41);\n");
  await writeFile(releaseManifest, `${JSON.stringify(manifest)}\n`);
  const commonVerifier = spawnSync(process.execPath, [
    new URL("./release-server-command-contract-verify.mjs", import.meta.url).pathname,
    `--app=${app}`,
    `--manifest=${releaseManifest}`,
    `--expected-release-id=${manifest.releaseId}`,
    "--contract=shift-execution",
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
assert_legacy_incompatible_shift_execution_commands_disabled
`], { encoding: "utf8", env });
  await writeFile(processEnvironment, Buffer.from("MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=0\0", "utf8"));
  assert.equal(runGuard().status, 0, "an exact Shift Execution OFF proof must pass");
  const unexpected = join(serviceDropins, "99-unexpected-shift-owner.conf");
  await writeFile(unexpected, "[Service]\nEnvironment=MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=1\n");
  assert.notEqual(runGuard().status, 0, "any configured Shift Execution owner must block an incompatible runtime");
  await rm(unexpected);
  await writeFile(processEnvironment, Buffer.from("MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=1\0", "utf8"));
  assert.notEqual(runGuard().status, 0, "the effective Shift Execution owner must block an incompatible runtime");
  assert.notEqual(runGuard({ ...baseEnv, QA_MAIN_PID: "0" }).status, 0, "invalid MainPID must fail closed");
  assert.notEqual(runGuard({ ...baseEnv, QA_MAIN_PID: "9999" }).status, 0, "missing process environment must fail closed");
  await writeFile(processEnvironment, Buffer.from("MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=0\0", "utf8"));
  assert.notEqual(runGuard({ ...baseEnv, QA_TR_FAIL: "1" }).status, 0, "a process-environment read race must fail closed");
} finally {
  await rm(root, { recursive: true, force: true });
}

for (const file of ["activate-shift-execution-commands.sh", "deactivate-shift-execution-commands.sh"]) {
  const source = await readFile(new URL(`../ops/postgres/${file}`, import.meta.url), "utf8");
  assert(source.includes("RELEASES_DIR") && source.includes("release-server-command-contract-verify.mjs"), `${file} must bind to the immutable active release`);
  assert(source.includes("--contract=shift-execution"), `${file} must require the exact Shift Execution contract`);
  assert(source.includes("with-authority-rollout-lock.sh"), `${file} must share the authority rollout lock`);
  assert(source.includes("/proc/${main_pid}/environ"), `${file} must prove effective process state`);
}

const primaryConsistency = {
  consistency: {
    ok: true,
    details: {
      authority: { mode: "postgres-primary" },
      reconciliation: { promotion: { readEligible: true, retirementEligible: true } },
    },
  },
};
assert.equal(systemDomainsPrimaryTombstoneReady(primaryConsistency), true);
assert.equal(systemDomainsPrimaryTombstoneReady({ consistency: { ...primaryConsistency.consistency, details: { ...primaryConsistency.consistency.details, authority: { mode: "compatibility-snapshot" } } } }), false);
const disabledProof = {
  readinessPayload: {
    ok: true,
    readiness: {
      specifications2: { ready: true, storageBackend: "postgresql" },
      shiftExecution: { ready: true, storageBackend: "postgresql", migrationState: "postgres-primary" },
      commands: {
        // Exact old-runtime bridge shape: new candidate migrations are not yet
        // applied, so OFF is authoritative while schemaReady may be absent or
        // false until after the candidate is activated and migrated.
        specifications2WorkOrderCreation: { enabled: false },
        specifications2RevisionPublication: { enabled: false, schemaReady: false },
        specifications2AttachmentUpload: { enabled: false, schemaReady: true },
        shiftExecutionAssignments: { enabled: false, schemaReady: true },
      },
    },
  },
  systemDomainsCapabilitiesPayload: {
    ok: true,
    capabilities: { primaryPostgres: true, serverCommandsConfigured: false, configuredServerCommandSurfaces: [] },
  },
  shiftCapabilitiesPayload: {
    ok: true,
    capabilities: {
      primaryPostgres: true,
      schemaReady: true,
      serverAuthoritative: true,
      assignmentCreationEnabled: false,
      carryoverCancellationEnabled: false,
    },
  },
  directoryNomenclatureTypesCapabilitiesPayload: {
    ok: true,
    capabilities: { serverCommandsConfigured: false },
  },
  directoryBoardsCapabilitiesPayload: {
    ok: true,
    capabilities: { serverCommandsConfigured: false },
  },
  processEnvironment: [
    "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0",
    "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=0",
    "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=0",
    "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=0",
    "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=0",
    "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=0",
    "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=0",
    "MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=",
    "MES_SYSTEM_DOMAINS_COMMAND_ACTORS=",
  ].join("\n"),
};
assert.equal(stagedCommandSurfacesDisabled(disabledProof), true);
for (const unsafeEnvironment of [
  "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=1",
  "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=1",
  "MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES=production-structure",
  "MES_SYSTEM_DOMAINS_COMMAND_ACTORS=public:user",
]) {
  assert.equal(stagedCommandSurfacesDisabled({ ...disabledProof, processEnvironment: unsafeEnvironment }), false);
}

const bridgeSource = await readFile(new URL("../ops/postgres/deactivate-staged-candidate-command-surfaces.sh", import.meta.url), "utf8");
assert(bridgeSource.includes('SCRIPT_PATH" == "$EXPECTED_SCRIPT') && bridgeSource.includes('ACTIVE_TARGET" != "$CANDIDATE_APP_DIR'), "the bridge must execute only from the exact non-active staged release path");
assert(bridgeSource.includes('ROOT_SEAL_HELPER="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"'), "the bridge must use only the atomically selected root-owned verifier as its initial trust anchor");
assert(bridgeSource.includes('--release-id="$ACTIVE_RELEASE_ID"') && bridgeSource.includes('--expected-target="$ACTIVE_TARGET"'), "the bridge must seal the complete active release and exact active pointer without executing active release code");
assert(bridgeSource.includes('--release-id="$RELEASE_ID"') && bridgeSource.includes('--app="$CANDIDATE_APP_DIR"'), "the bridge must recursively seal the candidate before executing candidate code");
assert(!bridgeSource.includes('${ACTIVE_TARGET}/scripts/release-verify.mjs'), "an untrusted active release verifier must never be a bridge trust anchor");
assert(bridgeSource.indexOf('/usr/bin/node "$ROOT_SEAL_HELPER" release') < bridgeSource.indexOf('"${CANDIDATE_APP_DIR}/scripts/release-server-command-contract-verify.mjs"'), "candidate code must execute only after the fixed root-owned verifier accepts its sealed tree");
assert(bridgeSource.includes("--expected-release-id=\"$RELEASE_ID\"") && bridgeSource.includes("--contract=all"), "the bridge must verify full staged provenance and every command contract before root mutation");
assert(bridgeSource.includes("with-authority-rollout-lock.sh") && bridgeSource.includes("restore_on_failure"), "the bridge must serialize and restore the entire command OFF transaction");
for (const dropin of [
  "49-system-domains-command-actors.conf",
  "62-system-domains-access-control.conf",
  "50-specifications2-attachments.conf",
  "63-specifications2-work-orders.conf",
  "64-specifications2-publication.conf",
  "50-shift-execution-commands.conf",
  "50-shift-execution-server-commands.conf",
  "50-directory-cluster-commands.conf",
]) assert(bridgeSource.includes(dropin), `the staged bridge must manage ${dropin}`);
assert(bridgeSource.includes('[[ "$configured" == "$expected" ]]'), "the staged bridge must accept only exact managed drop-in paths");
assert(!bridgeSource.includes('50-shift-execution-*.conf'), "the legacy Shift compatibility path must not broaden into a filename glob");

console.log("Shift Execution release command contract and staged deactivation bridge QA: OK");
