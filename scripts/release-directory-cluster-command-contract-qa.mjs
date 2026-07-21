import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DIRECTORY_CLUSTER_COMMAND_MARKER_PATH,
  buildDirectoryClusterCommandManifestContract,
  validateDirectoryClusterCandidateManifest,
} from "./release-directory-cluster-command-contract.mjs";

const markerSource = await readFile(new URL(`../${DIRECTORY_CLUSTER_COMMAND_MARKER_PATH}`, import.meta.url), "utf8");
const marker = JSON.parse(markerSource);
const compatibility = buildDirectoryClusterCommandManifestContract(markerSource);
const manifest = {
  schemaVersion: 3,
  releaseId: "v.1.500.directory-cluster-qa",
  runtimeIncludes: ["ops", "scripts"],
  directoryClusterCommandCompatibility: compatibility,
};
assert.deepEqual(validateDirectoryClusterCandidateManifest(manifest, markerSource), compatibility);
assert.throws(() => validateDirectoryClusterCandidateManifest({ ...manifest, schemaVersion: 2 }, markerSource), /does not bind/);
assert.throws(() => validateDirectoryClusterCandidateManifest({ ...manifest, runtimeIncludes: ["scripts"] }, markerSource), /does not bind/);
assert.throws(() => validateDirectoryClusterCandidateManifest({
  ...manifest,
  directoryClusterCommandCompatibility: { ...compatibility, sha256: "0".repeat(64) },
}, markerSource), /does not bind/);
for (const field of [
  "commandSurfaceVersion",
  "authenticatedActorVersion",
  "authorizationSnapshotVersion",
  "concurrencyVersion",
  "idempotencyReceiptVersion",
  "destructiveRecoveryVersion",
]) {
  const incompatible = { ...marker };
  delete incompatible[field];
  assert.throws(() => buildDirectoryClusterCommandManifestContract(`${JSON.stringify(incompatible)}\n`), /marker is invalid/);
}

const [activateSource, rollbackSource, stageSource, verifierSource] = await Promise.all([
  readFile(new URL("./release-activate.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-stage.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-server-command-contract-verify.mjs", import.meta.url), "utf8"),
]);
assert(stageSource.includes("directoryClusterCommandCompatibility") && stageSource.includes("validateDirectoryClusterCandidateManifest(manifest"));
assert(verifierSource.includes('args.contract === "all" || args.contract === "directory-cluster"'));
const beginMarker = "# DIRECTORY_CLUSTER_RELEASE_SWITCH_GUARD_BEGIN";
const endMarker = "# DIRECTORY_CLUSTER_RELEASE_SWITCH_GUARD_END";
const extractGuard = (source, label) => {
  const start = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker, start + beginMarker.length);
  assert(start >= 0 && end > start, `${label} Directory Cluster guard must remain extractable`);
  return source.slice(start, end + endMarker.length);
};
const activateGuard = extractGuard(activateSource, "activation");
const rollbackGuard = extractGuard(rollbackSource, "rollback");
assert.equal(activateGuard, rollbackGuard, "activation and rollback must share the exact Directory Cluster OFF proof");

const root = await mkdtemp(join(tmpdir(), "mes-directory-cluster-command-contract-"));
try {
  const app = join(root, "app");
  const releaseManifest = join(root, "release-manifest.json");
  await mkdir(join(app, "scripts"), { recursive: true });
  await mkdir(join(app, "ops", "shared-state"), { recursive: true });
  await writeFile(join(app, DIRECTORY_CLUSTER_COMMAND_MARKER_PATH), markerSource);
  await writeFile(join(app, "scripts", "release-verify.mjs"), "process.exit(0);\n");
  await writeFile(releaseManifest, `${JSON.stringify(manifest)}\n`);
  const verified = spawnSync(process.execPath, [
    new URL("./release-server-command-contract-verify.mjs", import.meta.url).pathname,
    `--app=${app}`,
    `--manifest=${releaseManifest}`,
    `--expected-release-id=${manifest.releaseId}`,
    "--contract=directory-cluster",
  ], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);

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
assert_legacy_incompatible_directory_cluster_commands_disabled
`], { encoding: "utf8", env });
  await writeFile(processEnvironment, Buffer.from("MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=0\0", "utf8"));
  assert.equal(runGuard().status, 0);
  const unexpected = join(serviceDropins, "99-unexpected-directory-owner.conf");
  await writeFile(unexpected, "[Service]\nEnvironment=MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=1\n");
  assert.notEqual(runGuard().status, 0);
  await rm(unexpected);
  await writeFile(processEnvironment, Buffer.from("MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=1\0", "utf8"));
  assert.notEqual(runGuard().status, 0);
  assert.notEqual(runGuard({ ...baseEnv, QA_MAIN_PID: "0" }).status, 0);
  assert.notEqual(runGuard({ ...baseEnv, QA_MAIN_PID: "9999" }).status, 0);
  await writeFile(processEnvironment, Buffer.from("MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=0\0", "utf8"));
  assert.notEqual(runGuard({ ...baseEnv, QA_TR_FAIL: "1" }).status, 0);
} finally {
  await rm(root, { recursive: true, force: true });
}

for (const file of ["activate-directory-cluster-commands.sh", "deactivate-directory-cluster-commands.sh"]) {
  const source = await readFile(new URL(`../ops/shared-state/${file}`, import.meta.url), "utf8");
  assert(source.includes("RELEASES_DIR") && source.includes("release-server-command-contract-verify.mjs"));
  assert(source.includes("--contract=directory-cluster"));
  assert(source.includes("with-authority-rollout-lock.sh"));
  assert(source.includes("MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=1"));
  assert(source.includes("serverCommandsConfigured"));
}
const bridge = await readFile(new URL("../ops/postgres/deactivate-staged-candidate-command-surfaces.sh", import.meta.url), "utf8");
assert(bridge.includes("50-directory-cluster-commands.conf") && bridge.includes("DIRECTORY_CLUSTER_SERVER_COMMANDS"));
console.log("Directory Cluster release command contract QA: OK");
