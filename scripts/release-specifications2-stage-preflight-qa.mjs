import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SPECIFICATIONS2_COMMAND_MARKER_PATH,
  buildSpecifications2CommandManifestContract,
  decideSpecifications2StagePreflight,
  validateSpecifications2CandidateManifest,
} from "./release-specifications2-command-contract.mjs";

const markerSource = await readFile(new URL(`../${SPECIFICATIONS2_COMMAND_MARKER_PATH}`, import.meta.url), "utf8");
const marker = JSON.parse(markerSource);
const compatibility = buildSpecifications2CommandManifestContract(markerSource);
const manifest = {
  schemaVersion: 3,
  releaseId: "v.1.500.qa-candidate",
  runtimeIncludes: ["src", "scripts", "ops"],
  specifications2CommandCompatibility: compatibility,
};

assert.deepEqual(validateSpecifications2CandidateManifest(manifest, markerSource), compatibility);
assert.throws(
  () => validateSpecifications2CandidateManifest({ ...manifest, schemaVersion: 2 }, markerSource),
  /does not bind/,
  "schema-v2 release manifests must not claim the controlled command contract",
);
assert.throws(
  () => validateSpecifications2CandidateManifest({ ...manifest, runtimeIncludes: ["src", "scripts"] }, markerSource),
  /does not bind/,
  "a manifest whose source digest excludes Ops must not claim command compatibility",
);
assert.throws(
  () => validateSpecifications2CandidateManifest({
    ...manifest,
    specifications2CommandCompatibility: { ...compatibility, sha256: "0".repeat(64) },
  }, markerSource),
  /does not bind/,
  "the manifest must bind the exact marker bytes",
);
const legacyWorkOrderMarker = { ...marker };
delete legacyWorkOrderMarker.workOrderRequestFingerprintVersion;
assert.throws(
  () => buildSpecifications2CommandManifestContract(`${JSON.stringify(legacyWorkOrderMarker)}\n`),
  /marker is invalid/,
  "a candidate marker without the exact Work Order request fingerprint contract must be rejected",
);
const legacyAggregateIdentityMarker = { ...marker };
delete legacyAggregateIdentityMarker.workOrderAggregateIdentityVersion;
assert.throws(
  () => buildSpecifications2CommandManifestContract(`${JSON.stringify(legacyAggregateIdentityMarker)}\n`),
  /marker is invalid/,
  "a candidate marker without the actor-scoped global Work Order identity contract must be rejected",
);
const legacyAttachmentMarker = { ...marker };
delete legacyAttachmentMarker.attachmentCommandVersion;
assert.throws(
  () => buildSpecifications2CommandManifestContract(`${JSON.stringify(legacyAttachmentMarker)}\n`),
  /marker is invalid/,
  "a candidate marker without the attachment command contract must be rejected",
);
for (const field of ["authenticatedActorVersion", "rbacAuthorizationVersion", "requestSecurityVersion"]) {
  const insecureMarker = { ...marker };
  delete insecureMarker[field];
  assert.throws(
    () => buildSpecifications2CommandManifestContract(`${JSON.stringify(insecureMarker)}\n`),
    /marker is invalid/,
    `a candidate marker without ${field} must be rejected`,
  );
}

assert.deepEqual(decideSpecifications2StagePreflight({
  activeCompatible: false,
  configuredOn: true,
  effectiveOn: false,
  environmentObserved: true,
}), {
  stageAllowed: true,
  activationAllowed: false,
  activeCompatible: false,
  activeCommandState: "on",
  requiresControlledRootDeactivation: true,
}, "an incompatible active release with a configured command surface may be staged but not activated");
assert.equal(decideSpecifications2StagePreflight({
  activeCompatible: false,
  configuredOn: false,
  effectiveOn: false,
  environmentObserved: false,
}).activationAllowed, false, "an unobserved incompatible active runtime must fail closed for activation");
assert.equal(decideSpecifications2StagePreflight({
  activeCompatible: false,
  configuredOn: false,
  effectiveOn: false,
  environmentObserved: true,
}).activationAllowed, true, "an incompatible active runtime may advance only after exact command-OFF proof");
assert.equal(decideSpecifications2StagePreflight({
  activeCompatible: true,
  configuredOn: true,
  effectiveOn: true,
  environmentObserved: true,
}).activationAllowed, true, "compatible release-to-release staging may preserve the reviewed command surfaces");

const stageSource = await readFile(new URL("./release-stage.mjs", import.meta.url), "utf8");
const preflightSource = await readFile(new URL("./release-specifications2-stage-preflight.mjs", import.meta.url), "utf8");
assert(stageSource.includes("specifications2CommandCompatibility"), "staged schema-v3 manifests must carry the Specifications 2.0 command contract");
assert(stageSource.includes("validateSpecifications2CandidateManifest(manifest"), "release staging must validate the marker-bound manifest before upload");
assert(stageSource.includes("release-specifications2-stage-preflight.mjs"), "remote staging must inspect the active command surface before activation handoff");
assert(stageSource.includes("remotePreflightResult.stderr.trim()") && stageSource.includes("console.warn"), "controlled-root deactivation warnings must be visible to the release operator");
assert(preflightSource.includes("`--app-root=${appPath}`"), "active release verification must hash the active app instead of the candidate working directory");

const root = await mkdtemp(join(tmpdir(), "mes-specifications2-stage-preflight-"));
try {
  const candidateApp = join(root, "candidate", "app");
  const candidateManifest = join(root, "candidate", "release-manifest.json");
  const activeApp = join(root, "active-app");
  const activeRelease = join(root, "active-release");
  const activeReleaseApp = join(activeRelease, "app");
  const systemdRoot = join(root, "systemd");
  const procRoot = join(root, "proc");
  const bin = join(root, "bin");
  const service = "mes-qa";
  const serviceDropins = join(systemdRoot, `${service}.service.d`);
  const mainPid = "4242";
  const processDir = join(procRoot, mainPid);
  const cli = fileURLToPath(new URL("./release-specifications2-stage-preflight.mjs", import.meta.url));

  for (const appPath of [candidateApp, activeReleaseApp]) {
    await mkdir(join(appPath, "ops", "postgres"), { recursive: true });
    await mkdir(join(appPath, "scripts"), { recursive: true });
    await writeFile(join(appPath, SPECIFICATIONS2_COMMAND_MARKER_PATH), markerSource);
  }
  await mkdir(serviceDropins, { recursive: true });
  await mkdir(processDir, { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(candidateManifest, `${JSON.stringify(manifest)}\n`);
  await writeFile(join(activeRelease, "release-manifest.json"), `${JSON.stringify({ ...manifest, releaseId: "v.1.500.qa-active" })}\n`);
  await writeFile(join(activeReleaseApp, "scripts", "release-verify.mjs"), "process.stdout.write('{}\\n');\n");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
if [ "\${1:-}" = "show" ]; then
  printf '%s\\n' "\${QA_MAIN_PID:-0}"
  exit "\${QA_SYSTEMCTL_STATUS:-0}"
fi
exit 0
`);
  await chmod(join(bin, "systemctl"), 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: systemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: procRoot,
    QA_MAIN_PID: mainPid,
  };
  const run = (env = baseEnv) => spawnSync(process.execPath, [
    cli,
    `--candidate-app=${candidateApp}`,
    `--manifest=${candidateManifest}`,
    `--active-app=${activeApp}`,
    `--service=${service}`,
  ], { encoding: "utf8", env });
  const decision = (result) => JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));

  await symlink(activeReleaseApp, activeApp);
  await writeFile(join(processDir, "environ"), Buffer.from("MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=1\0", "utf8"));
  await writeFile(join(serviceDropins, "50-specifications2-attachments.conf"), "[Service]\nEnvironment=MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=1\n");
  const compatibleOn = run();
  assert.equal(compatibleOn.status, 0, compatibleOn.stderr);
  assert.equal(decision(compatibleOn).activationAllowed, true, "a manifest-verified compatible active release may keep commands ON");

  await rm(activeApp);
  const incompatibleOn = run();
  assert.equal(incompatibleOn.status, 0, incompatibleOn.stderr);
  assert.equal(decision(incompatibleOn).activationAllowed, false, "an incompatible active release with commands ON must be marked non-activatable");
  assert.match(incompatibleOn.stderr, /controlled root operator/, "staging must emit an actionable controlled-root warning");

  await rm(join(serviceDropins, "50-specifications2-attachments.conf"));
  await writeFile(join(processDir, "environ"), Buffer.from("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=0\0", "utf8"));
  const incompatibleOff = run();
  assert.equal(incompatibleOff.status, 0, incompatibleOff.stderr);
  assert.equal(decision(incompatibleOff).activationAllowed, true, "exact observed command-OFF permits the later activation guard to re-check and switch");

  await writeFile(join(candidateApp, SPECIFICATIONS2_COMMAND_MARKER_PATH), `${markerSource.trim()} `);
  const tampered = run();
  assert.notEqual(tampered.status, 0, "marker bytes changed after manifest creation must fail candidate preflight");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Specifications 2.0 release-stage preflight QA: OK");
