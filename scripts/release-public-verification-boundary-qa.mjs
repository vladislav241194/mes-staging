#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readProjectFile = (path) => readFile(resolve(projectRoot, path), "utf8");
const [
  verifier,
  commandVerifier,
  stage,
  activation,
  rollback,
  specifications2Preflight,
  uidInstaller,
  credentialRotation,
  rootSeal,
] = await Promise.all([
  readProjectFile("scripts/release-verify.mjs"),
  readProjectFile("scripts/release-server-command-contract-verify.mjs"),
  readProjectFile("scripts/release-stage.mjs"),
  readProjectFile("scripts/release-activate.mjs"),
  readProjectFile("scripts/release-rollback.mjs"),
  readProjectFile("scripts/release-specifications2-stage-preflight.mjs"),
  readProjectFile("ops/security/install-pilot-runtime-uid-isolation.sh"),
  readProjectFile("ops/security/rotate-pilot-credentials.sh"),
  readProjectFile("scripts/release-root-seal-verify.mjs"),
]);

assert.match(verifier, /key === "public-only"/);
assert.match(verifier, /privateCompatibilityArtifactsVerified: !args\.publicOnly/);
assert.match(verifier, /descriptorSchemaVerified: true/);
assert.match(verifier, /Manifest application version is invalid/);
assert.match(verifier, /appVersion,/);
assert.match(commandVerifier, /FIXED_PUBLIC_RELEASE_VERIFIER = "\/usr\/local\/libexec\/mes\/active-bundle\/release-verify\.mjs"/);
assert.match(commandVerifier, /"--public-only"/);
assert.doesNotMatch(commandVerifier, /join\(args\.app, "scripts", "release-verify\.mjs"\)/);
assert.match(commandVerifier, /process\.getuid\(\) === 0[\s\S]{0,220}?\/usr\/sbin\/runuser[\s\S]{0,220}?mes-stage/);

const firstFixedVerify = stage.indexOf('await run("ssh", sshArgs(args.remote, fixedContentVerificationCommand({');
const remotePreflight = stage.indexOf("const remotePreflight = [");
const secondFixedVerify = stage.indexOf('await run("ssh", sshArgs(args.remote, fixedContentVerificationCommand({', firstFixedVerify + 1);
assert(firstFixedVerify >= 0 && firstFixedVerify < remotePreflight,
  "fixed root content verification must complete before any candidate preflight code");
assert(secondFixedVerify > remotePreflight,
  "fixed root content verification must run again after candidate preflight and dependency installation");
assert.match(stage, /runuser -u mes-stage[^\n]*release-server-command-contract-verify\.mjs[^\n]*--public-only/);
assert.match(stage, /runuser -u mes-stage[^\n]*ROOT_PUBLIC_RELEASE_VERIFIER_PATH[^\n]*--public-only/);
const activeSeal = stage.indexOf("fixedActivePilotReleaseVerificationCommand()", firstFixedVerify);
assert(activeSeal > firstFixedVerify && activeSeal < remotePreflight,
  "Pilot active release, pointer and record must be fixed-root-sealed before Specifications preflight reads them");

for (const [label, source] of [
  ["activation", activation],
  ["rollback", rollback],
]) {
  assert.match(source, /public_release_verifier="\/usr\/local\/libexec\/mes\/active-bundle\/release-verify\.mjs"/);
  assert.match(source, /run_fixed_public_verifier\(\)[\s\S]{0,220}?runuser -u mes-stage[\s\S]{0,220}?"\$public_release_verifier"/);
  assert(source.indexOf('/usr/bin/node "$root_seal_helper" release') < source.indexOf("run_fixed_public_verifier"),
    `${label} must accept the fixed root seal before the fixed public verifier executes`);
  assert.doesNotMatch(source, /run_candidate_node|\$current_target\/scripts\/release-verify|\$previous_target\/scripts\/release-verify/);
}

assert.match(specifications2Preflight, /FIXED_PUBLIC_RELEASE_VERIFIER = "\/usr\/local\/libexec\/mes\/active-bundle\/release-verify\.mjs"/);
assert.match(specifications2Preflight, /"--public-only"/);
assert.match(activation, /run_fixed_public_verifier[\s\S]{0,180}?--app-root="\$previous_target"[\s\S]{0,180}?--public-only/);
assert.match(rollback, /run_fixed_public_verifier --app-root="\$previous_target"[\s\S]{0,180}?--public-only/);
for (const [label, source] of [
  ["runtime UID installer", uidInstaller],
  ["credential rotation", credentialRotation],
]) {
  const sealIndex = source.indexOf('"$ROOT_SEAL_HELPER" release');
  const runuserIndex = source.indexOf("/usr/sbin/runuser -u mes-stage");
  const verifierIndex = source.indexOf('"$PUBLIC_RELEASE_VERIFIER"', runuserIndex);
  const publicOnlyIndex = source.indexOf("--public-only", verifierIndex);
  assert(sealIndex >= 0 && sealIndex < runuserIndex && runuserIndex < verifierIndex && verifierIndex < publicOnlyIndex,
    `${label} must fixed-root-seal first, then drop to mes-stage for public-only candidate verification`);
}

assert.match(rootSeal, /fileSha256\(join\(appPath, stagedPath\)\)/);
assert.match(rootSeal, /fileSha256\(join\(appPath, generatedPath\)\)/);
assert.match(rootSeal, /sealed bootstrap bytes differ from the origin attestation/);
for (const fixedBundleFile of ["release-verify.mjs", "release-tree-sha.mjs", "react-runtime-policy.mjs"]) {
  assert(rootSeal.includes(`"${fixedBundleFile}"`), `fixed helper bundle must seal ${fixedBundleFile}`);
}

console.log("Release public verification boundary QA: OK");
