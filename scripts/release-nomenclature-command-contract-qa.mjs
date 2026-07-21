import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOMENCLATURE_COMMAND_MARKER_PATH,
  buildNomenclatureCommandManifestContract,
  validateNomenclatureCandidateManifest,
} from "./release-nomenclature-command-contract.mjs";

const projectRoot = new URL("../", import.meta.url);
const markerSource = await readFile(new URL(NOMENCLATURE_COMMAND_MARKER_PATH, projectRoot), "utf8");
const marker = JSON.parse(markerSource);
const compatibility = buildNomenclatureCommandManifestContract(markerSource);
const manifest = {
  schemaVersion: 3,
  releaseId: "v.1.500.qa-nomenclature-contract",
  runtimeIncludes: ["src", "scripts", "ops"],
  nomenclatureCommandCompatibility: compatibility,
};

assert.deepEqual(validateNomenclatureCandidateManifest(manifest, markerSource), compatibility);
assert.throws(
  () => validateNomenclatureCandidateManifest({ ...manifest, schemaVersion: 2 }, markerSource),
  /does not bind/,
);
assert.throws(
  () => validateNomenclatureCandidateManifest({
    ...manifest,
    nomenclatureCommandCompatibility: { ...compatibility, sha256: "0".repeat(64) },
  }, markerSource),
  /does not bind/,
  "the release manifest must bind the exact Nomenclature marker bytes",
);
const legacyMarker = { ...marker };
delete legacyMarker.idempotencyReceiptVersion;
assert.throws(
  () => buildNomenclatureCommandManifestContract(`${JSON.stringify(legacyMarker)}\n`),
  /marker is invalid/,
);

assert.deepEqual(marker, {
  schemaVersion: 1,
  contract: "nomenclature-server-commands",
  authorityTransitionVersion: 1,
  revisionConcurrencyVersion: 1,
  idempotencyReceiptVersion: 1,
  authenticatedRbacVersion: 1,
  controlledRootExclusivity: {
    required: true,
    lockName: "mes-authority-rollout.lock",
    incompatibleTargetRequiresDisabledFlags: ["MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS"],
  },
  requiredMigrations: ["027_employee_auth_credentials"],
});

const [stageSource, activateSource, rollbackSource, activateNomenclature, activatePublication, activateWorkOrders] = await Promise.all([
  readFile(new URL("./release-stage.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-activate.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8"),
  readFile(new URL("../ops/auth/activate-pilot-nomenclature-command-owner.sh", import.meta.url), "utf8"),
  readFile(new URL("../ops/postgres/activate-specifications2-publication.sh", import.meta.url), "utf8"),
  readFile(new URL("../ops/postgres/activate-specifications2-work-orders.sh", import.meta.url), "utf8"),
]);
assert(stageSource.includes("nomenclatureCommandCompatibility"));
assert(stageSource.includes("validateNomenclatureCandidateManifest(manifest"));
assert(stageSource.includes("release-server-command-contract-verify.mjs"));
for (const [label, source, contract] of [
  ["Nomenclature", activateNomenclature, "nomenclature"],
  ["Specifications publication", activatePublication, "specifications2"],
  ["Specifications Work Orders", activateWorkOrders, "specifications2"],
]) {
  assert(source.includes('[[ -L "$ACTIVE_APP_DIR" ]]'), `${label} root activation must require an immutable active pointer`);
  assert(source.includes('"${RELEASES_DIR}/${release_id}/app"'), `${label} root activation must bind the active target to the releases directory`);
  assert(source.includes("release-server-command-contract-verify.mjs"), `${label} root activation must verify the whole release artifact`);
  assert(source.includes(`--contract=${contract}`), `${label} root activation must verify its exact manifest-bound command contract`);
}
assert(activateSource.includes("nomenclatureCommandCompatibility"));
assert(rollbackSource.includes("nomenclatureCommandCompatibility"));
assert(activateSource.includes("no_universally_compatible_command_recovery_runtime"));
assert(activateSource.includes("previous_command_owners_safe_for_rollback") && activateSource.includes("not proved OFF"));
assert(rollbackSource.includes("neither the current nor selected runtime carries every manifest-bound server-command contract required for fail-safe recovery"));

const guardBegin = "# NOMENCLATURE_RELEASE_SWITCH_GUARD_BEGIN";
const guardEnd = "# NOMENCLATURE_RELEASE_SWITCH_GUARD_END";
const extractGuard = (source) => source.slice(
  source.indexOf(guardBegin),
  source.indexOf(guardEnd) + guardEnd.length,
);
const activateGuard = extractGuard(activateSource);
const rollbackGuard = extractGuard(rollbackSource);
assert(activateGuard.startsWith(guardBegin) && activateGuard.endsWith(guardEnd));
assert.equal(activateGuard, rollbackGuard, "activation and rollback must use the same Nomenclature command-OFF proof");

const root = await mkdtemp(join(tmpdir(), "mes-release-nomenclature-contract-"));
try {
  const app = join(root, "release", "app");
  const releaseManifest = join(root, "release", "release-manifest.json");
  await mkdir(join(app, "ops", "auth"), { recursive: true });
  await mkdir(join(app, "scripts"), { recursive: true });
  await writeFile(join(app, NOMENCLATURE_COMMAND_MARKER_PATH), markerSource);
  await writeFile(releaseManifest, `${JSON.stringify(manifest)}\n`);
  await writeFile(join(app, "scripts", "release-verify.mjs"), `
const args = process.argv.slice(2);
if (!args.some((arg) => arg.startsWith("--app-root="))
  || !args.includes("--expected-release-id=${manifest.releaseId}")
  || !args.includes("--public-only")) process.exit(41);
process.stdout.write("{}\\n");
`);
  const verifyCli = fileURLToPath(new URL("./release-server-command-contract-verify.mjs", import.meta.url));
  const verified = spawnSync(process.execPath, [
    verifyCli,
    `--app=${app}`,
    `--manifest=${releaseManifest}`,
    `--expected-release-id=${manifest.releaseId}`,
    "--contract=nomenclature",
  ], { encoding: "utf8", env: { ...process.env, MES_RELEASE_PUBLIC_VERIFIER_QA_PATH: join(app, "scripts", "release-verify.mjs") } });
  assert.equal(verified.status, 0, verified.stderr);
  await writeFile(join(app, NOMENCLATURE_COMMAND_MARKER_PATH), `${markerSource.trim()} `);
  const tampered = spawnSync(process.execPath, [
    verifyCli,
    `--app=${app}`,
    `--manifest=${releaseManifest}`,
    `--expected-release-id=${manifest.releaseId}`,
    "--contract=nomenclature",
  ], { encoding: "utf8", env: { ...process.env, MES_RELEASE_PUBLIC_VERIFIER_QA_PATH: join(app, "scripts", "release-verify.mjs") } });
  assert.notEqual(tampered.status, 0, "changed marker bytes must fail the manifest-bound verifier");

  const bin = join(root, "bin");
  const systemdRoot = join(root, "systemd");
  const procRoot = join(root, "proc");
  const service = "mes-qa.service";
  const dropinDir = join(systemdRoot, `${service}.d`);
  const mainPid = "4242";
  await mkdir(bin, { recursive: true });
  await mkdir(dropinDir, { recursive: true });
  await mkdir(join(procRoot, mainPid), { recursive: true });
  await writeFile(join(bin, "systemctl"), `#!/bin/sh\n[ "\${1:-}" = show ] && printf '%s\\n' "\${QA_MAIN_PID:-0}"\n`);
  await chmod(join(bin, "systemctl"), 0o755);
  const baseEnv = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    QA_MAIN_PID: mainPid,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: systemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: procRoot,
  };
  const runGuard = () => spawnSync("bash", ["-c", `${rollbackGuard}\nswitch_operation=qa\nservice=${service}\nassert_legacy_incompatible_nomenclature_commands_disabled\n`], { encoding: "utf8", env: baseEnv });
  await writeFile(join(procRoot, mainPid, "environ"), Buffer.from("MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=0\0", "utf8"));
  assert.equal(runGuard().status, 0, "exact observed Nomenclature command-OFF must pass");
  await writeFile(join(dropinDir, "99-unexpected-command-owner.conf"), "[Service]\nEnvironment=\"MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1\"\n");
  assert.notEqual(runGuard().status, 0, "any configured command-owner drop-in name must block an incompatible release");
  await rm(join(dropinDir, "99-unexpected-command-owner.conf"));
  await writeFile(join(procRoot, mainPid, "environ"), Buffer.from("MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=1\0", "utf8"));
  assert.notEqual(runGuard().status, 0, "effective Nomenclature command ownership must block an incompatible release");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Nomenclature release command contract QA: OK");
