import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const activationSource = await readFile(join(projectRoot, "scripts", "release-activate.mjs"), "utf8");
const startMarker = "const activationScript = String.raw`";
const endMarker = "\n`;\n\nasync function main()";
const start = activationSource.indexOf(startMarker);
const end = activationSource.indexOf(endMarker, start + startMarker.length);

assert(start >= 0 && end >= 0, "activation shell must remain extractable for transaction QA");

const activationShell = activationSource.slice(start + startMarker.length, end);
const directory = await realpath(await mkdtemp(join(tmpdir(), "mes-release-activation-transaction-")));

async function writeExecutable(path, source) {
  await writeFile(path, source, "utf8");
  await chmod(path, 0o755);
}

async function createRelease(releasesPath, releaseId) {
  const releasePath = join(releasesPath, releaseId);
  const appPath = join(releasePath, "app");
  await mkdir(join(appPath, "dist"), { recursive: true });
  await mkdir(join(appPath, "scripts"), { recursive: true });
  await writeFile(join(releasePath, "release-manifest.json"), "{}\n");
  await writeFile(join(appPath, "dist", "index.html"), "<!doctype html>\n");
  await writeFile(join(appPath, "package-lock.json"), "{}\n");
  await writeFile(join(appPath, "scripts", "release-verify.mjs"), "// replaced by the QA node shim\n");
  return { releasePath, appPath };
}

function runActivation(scriptPath, values, env) {
  return spawnSync("bash", [scriptPath, ...values], {
    cwd: directory,
    encoding: "utf8",
    env,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function assertMissing(path, message) {
  await assert.rejects(readFile(path), (error) => error?.code === "ENOENT", message);
}

try {
  const binPath = join(directory, "bin");
  const releasesPath = join(directory, "releases");
  const activeAppPath = join(directory, "app");
  const activationScriptPath = join(directory, "activation.sh");
  const restartLogPath = join(directory, "restart.log");
  const previousId = "v.1.500.19-previous";
  const candidateId = "v.1.500.20-candidate";

  await mkdir(binPath, { recursive: true });
  await mkdir(releasesPath, { recursive: true });
  await writeFile(activationScriptPath, activationShell, "utf8");

  const previous = await createRelease(releasesPath, previousId);
  const candidate = await createRelease(releasesPath, candidateId);
  await symlink(previous.appPath, activeAppPath);

  const activeRecordPath = join(releasesPath, "active-release.json");
  const activeRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: previousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: previousId,
      target: previous.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  await writeFile(activeRecordPath, activeRecordText, "utf8");

  await writeExecutable(join(binPath, "node"), `#!/bin/sh
set -eu
if [ "\${1:-}" = "scripts/release-verify.mjs" ]; then
  printf '{"runtimePolicyId":"qa-permanent","runtimePolicySha256":"qa-policy-sha","reactSurfaces":%s}\\n' "$QA_REACT_SURFACES_JSON"
  exit 0
fi
if [ "\${1:-}" = "--input-type=module" ] && [ "\${2:-}" = "-" ]; then
  case "\${3:-}" in
    *.next)
      printf '%s\\n' '{"partial":"active"}' > "$3"
      printf '%s\\n' '{"partial":"activation"}' > "$4"
      if [ "$QA_RECORD_MODE" = "fail-write" ]; then
        exit 47
      fi
      exit 0
      ;;
  esac
fi
exec "$QA_REAL_NODE" "$@"
`);

  // macOS mv has no GNU -T option. This shim preserves the release script's
  // atomic rename semantics without changing the production shell under test.
  await writeExecutable(join(binPath, "mv"), `#!/bin/sh
set -eu
while [ "$#" -gt 0 ]; do
  case "$1" in
    -*) shift ;;
    *) break ;;
  esac
done
[ "$#" -eq 2 ]
if [ "\${QA_FAIL_ACTIVE_RECORD_RENAME:-0}" = "1" ]; then
  case "$1:$2" in
    */active-release.json.next:*/active-release.json) exit 48 ;;
  esac
fi
exec "$QA_REAL_NODE" -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$1" "$2"
`);

  await writeExecutable(join(binPath, "curl"), `#!/bin/sh
set -eu
output_path=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output_path="$2"; shift 2 ;;
    -w|--max-time) shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$output_path" ]
printf '%s\\n' '{"status":"ok","sharedState":"ready","reactRuntime":{"sha256":"qa-policy-sha","activeEvaluationSurfaces":[]}}' > "$output_path"
printf '200'
`);

  await writeExecutable(join(binPath, "systemctl"), `#!/bin/sh
case "\${1:-}" in
  is-active) exit 0 ;;
  status) printf '%s\\n' 'qa service active'; exit 0 ;;
  show) printf '0\\n'; exit 0 ;;
esac
exit 0
`);
  await writeExecutable(join(binPath, "sudo"), `#!/bin/sh
printf '%s\\n' "$*" >> "$QA_RESTART_LOG"
exit 0
`);
  await writeExecutable(join(binPath, "sha256sum"), "#!/bin/sh\nexit 0\n");
  await writeExecutable(join(binPath, "journalctl"), "#!/bin/sh\nprintf '%s\\n' 'qa journal'\nexit 0\n");

  const env = {
    ...process.env,
    PATH: `${binPath}:/usr/bin:/bin:/usr/sbin:/sbin`,
    QA_REAL_NODE: process.execPath,
    QA_RESTART_LOG: restartLogPath,
    QA_REACT_SURFACES_JSON: '["structureMigrationDiagnostics"]',
    QA_RECORD_MODE: "fail-write",
    QA_FAIL_ACTIVE_RECORD_RENAME: "0",
  };
  const common = ["mes-qa.service", "4175", "https://example.invalid/healthz", "false", "false"];

  const recordFailure = runActivation(activationScriptPath, [
    activeAppPath,
    releasesPath,
    candidate.releasePath,
    candidate.appPath,
    candidateId,
    ...common,
  ], env);
  const recordFailureOutput = `${recordFailure.stdout}\n${recordFailure.stderr}`;

  assert.notEqual(recordFailure.status, 0, "record-writing failure must fail activation");
  assert.match(recordFailureOutput, /phase=record-activation/, "failure diagnostics must identify the record phase");
  assert.match(recordFailureOutput, /restoring previous runtime/, "record failure must execute transaction rollback");
  assert.equal(await readlink(activeAppPath), previous.appPath, "record failure must restore the previous active symlink");
  assert.equal(await readFile(activeRecordPath, "utf8"), activeRecordText, "record failure must retain the previous active release record");
  await assertMissing(`${activeRecordPath}.next`, "partial active release record must be removed");
  await assertMissing(join(candidate.releasePath, "activation.json.next"), "partial activation record must be removed");
  const failedPointers = (await readdir(candidate.releasePath)).filter((name) => name.startsWith("failed-active-pointer-"));
  assert.equal(failedPointers.length, 1, "transaction QA must prove that the candidate pointer was switched before failure");
  assert.equal(
    await readlink(join(candidate.releasePath, failedPointers[0])),
    candidate.appPath,
    "failed candidate pointer must remain available for diagnosis",
  );
  const restartLogBeforeSameRelease = await readFile(restartLogPath, "utf8");
  assert.equal(restartLogBeforeSameRelease.trim().split(/\r?\n/).length, 2, "failed activation must restart once for switch and once for rollback");

  const sameRelease = runActivation(activationScriptPath, [
    activeAppPath,
    releasesPath,
    previous.releasePath,
    previous.appPath,
    previousId,
    ...common,
  ], env);
  const sameReleaseOutput = `${sameRelease.stdout}\n${sameRelease.stderr}`;

  assert.notEqual(sameRelease.status, 0, "activating the current release must be rejected");
  assert.match(sameReleaseOutput, /reason=release_already_active/, "same-release rejection must have a stable diagnostic reason");
  assert.equal(await readlink(activeAppPath), previous.appPath, "same-release rejection must not switch the active symlink");
  assert.equal(await readFile(activeRecordPath, "utf8"), activeRecordText, "same-release rejection must not rewrite the active release record");
  assert.equal(await readFile(restartLogPath, "utf8"), restartLogBeforeSameRelease, "same-release rejection must not restart the service");
  await assertMissing(join(directory, "app.next"), "same-release rejection must not create a pending app pointer");
  await assertMissing(`${activeRecordPath}.next`, "same-release rejection must not create a pending active record");

  const finalRenameRoot = join(directory, "second-final-rename");
  const finalRenameReleasesPath = join(finalRenameRoot, "releases");
  const finalRenameActiveAppPath = join(finalRenameRoot, "app");
  const finalRenameRestartLogPath = join(finalRenameRoot, "restart.log");
  const finalRenamePreviousId = "v.1.500.19-final-rename-previous";
  const finalRenameCandidateId = "v.1.500.20-final-rename-candidate";
  await mkdir(finalRenameReleasesPath, { recursive: true });
  const finalRenamePrevious = await createRelease(finalRenameReleasesPath, finalRenamePreviousId);
  const finalRenameCandidate = await createRelease(finalRenameReleasesPath, finalRenameCandidateId);
  await symlink(finalRenamePrevious.appPath, finalRenameActiveAppPath);
  const finalRenameActiveRecordPath = join(finalRenameReleasesPath, "active-release.json");
  const finalRenameActiveRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: finalRenamePreviousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: finalRenamePreviousId,
      target: finalRenamePrevious.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  const previousCandidateActivationText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: finalRenameCandidateId,
    evidence: "pre-existing-candidate-activation",
  }, null, 2)}\n`;
  await writeFile(finalRenameActiveRecordPath, finalRenameActiveRecordText, "utf8");
  await writeFile(join(finalRenameCandidate.releasePath, "activation.json"), previousCandidateActivationText, "utf8");

  const finalRenameFailure = runActivation(activationScriptPath, [
    finalRenameActiveAppPath,
    finalRenameReleasesPath,
    finalRenameCandidate.releasePath,
    finalRenameCandidate.appPath,
    finalRenameCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: finalRenameRestartLogPath,
    QA_RECORD_MODE: "succeed-write",
    QA_FAIL_ACTIVE_RECORD_RENAME: "1",
  });
  const finalRenameFailureOutput = `${finalRenameFailure.stdout}\n${finalRenameFailure.stderr}`;

  assert.notEqual(finalRenameFailure.status, 0, "second final rename failure must fail activation");
  assert.match(finalRenameFailureOutput, /phase=record-activation/, "second final rename failure must identify the record phase");
  assert.match(finalRenameFailureOutput, /restoring previous runtime/, "second final rename failure must execute transaction rollback");
  assert.equal(
    await readlink(finalRenameActiveAppPath),
    finalRenamePrevious.appPath,
    "second final rename failure must restore the previous active pointer",
  );
  assert.equal(
    await readFile(finalRenameActiveRecordPath, "utf8"),
    finalRenameActiveRecordText,
    "second final rename failure must preserve the prior active record",
  );
  assert.equal(
    await readFile(join(finalRenameCandidate.releasePath, "activation.json"), "utf8"),
    previousCandidateActivationText,
    "second final rename failure must restore the pre-existing candidate activation record byte-identically",
  );
  await assertMissing(`${finalRenameActiveRecordPath}.next`, "second final rename failure must remove the pending active record");
  await assertMissing(
    join(finalRenameCandidate.releasePath, "activation.json.next"),
    "second final rename failure must remove the pending candidate activation record",
  );
  assert.equal(
    (await readdir(finalRenameCandidate.releasePath)).filter((name) => name.startsWith("activation.json.before-")).length,
    0,
    "candidate activation backup must not remain after rollback",
  );
  const finalRenameFailedPointers = (await readdir(finalRenameCandidate.releasePath))
    .filter((name) => name.startsWith("failed-active-pointer-"));
  assert.equal(finalRenameFailedPointers.length, 1, "second final rename failure must retain the failed candidate pointer");
  assert.equal(
    await readlink(join(finalRenameCandidate.releasePath, finalRenameFailedPointers[0])),
    finalRenameCandidate.appPath,
    "second final rename failure must retain the exact failed candidate target",
  );
  assert.equal(
    (await readFile(finalRenameRestartLogPath, "utf8")).trim().split(/\r?\n/).length,
    2,
    "second final rename failure must restart once for switch and once for rollback",
  );

  const legacyRoot = join(directory, "legacy-directory");
  const legacyReleasesPath = join(legacyRoot, "releases");
  const legacyActiveAppPath = join(legacyRoot, "app");
  const legacyRestartLogPath = join(legacyRoot, "restart.log");
  const legacyCandidateId = "v.1.500.20-legacy-candidate";
  const legacyMarker = Buffer.from("legacy-runtime-marker\nwith-original-bytes\u0000", "utf8");
  await mkdir(legacyReleasesPath, { recursive: true });
  await mkdir(legacyActiveAppPath, { recursive: true });
  await writeFile(join(legacyActiveAppPath, "legacy.marker"), legacyMarker);
  const legacyCandidate = await createRelease(legacyReleasesPath, legacyCandidateId);
  const legacyActiveRecordPath = join(legacyReleasesPath, "active-release.json");

  const legacyRecordFailure = runActivation(activationScriptPath, [
    legacyActiveAppPath,
    legacyReleasesPath,
    legacyCandidate.releasePath,
    legacyCandidate.appPath,
    legacyCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: legacyRestartLogPath,
    QA_REACT_SURFACES_JSON: "[]",
    QA_RECORD_MODE: "fail-write",
    QA_FAIL_ACTIVE_RECORD_RENAME: "0",
  });
  const legacyRecordFailureOutput = `${legacyRecordFailure.stdout}\n${legacyRecordFailure.stderr}`;

  assert.notEqual(legacyRecordFailure.status, 0, "legacy-directory record failure must fail activation");
  assert.match(legacyRecordFailureOutput, /phase=record-activation/, "legacy-directory failure must reach the post-switch record phase");
  assert.match(legacyRecordFailureOutput, /restoring previous runtime/, "legacy-directory failure must execute transaction rollback");
  const restoredLegacyStat = await lstat(legacyActiveAppPath);
  assert(restoredLegacyStat.isDirectory(), "legacy-directory rollback must restore the active app as a directory");
  assert.equal(restoredLegacyStat.isSymbolicLink(), false, "legacy-directory rollback must not leave the active app as a symlink");
  assert.deepEqual(
    await readFile(join(legacyActiveAppPath, "legacy.marker")),
    legacyMarker,
    "legacy-directory rollback must preserve the original marker byte-identically",
  );
  assert.deepEqual(await readdir(legacyActiveAppPath), ["legacy.marker"], "legacy-directory rollback must restore the original directory contents");
  await assertMissing(legacyActiveRecordPath, "legacy-directory failure must not create an active release record");
  await assertMissing(`${legacyActiveRecordPath}.next`, "legacy-directory failure must remove the pending active record");
  await assertMissing(
    join(legacyCandidate.releasePath, "activation.json.next"),
    "legacy-directory failure must remove the pending activation record",
  );
  const legacyFailedPointers = (await readdir(legacyCandidate.releasePath))
    .filter((name) => name.startsWith("failed-active-pointer-"));
  assert.equal(legacyFailedPointers.length, 1, "legacy-directory rollback must retain the failed candidate pointer");
  assert.equal(
    await readlink(join(legacyCandidate.releasePath, legacyFailedPointers[0])),
    legacyCandidate.appPath,
    "legacy-directory rollback must retain the exact failed candidate target",
  );
  assert.equal(
    (await readFile(legacyRestartLogPath, "utf8")).trim().split(/\r?\n/).length,
    2,
    "legacy-directory failure must restart once for switch and once for rollback",
  );

  const aliasRoot = join(directory, "same-release-alias");
  const aliasReleasesPath = join(aliasRoot, "releases");
  const aliasActiveAppPath = join(aliasRoot, "app");
  const aliasRestartLogPath = join(aliasRoot, "restart.log");
  const aliasPreviousId = "v.1.500.19-alias-current";
  const aliasCandidateId = "v.1.500.20-alias-candidate";
  await mkdir(aliasReleasesPath, { recursive: true });
  const aliasPrevious = await createRelease(aliasReleasesPath, aliasPreviousId);
  await symlink(aliasPrevious.appPath, aliasActiveAppPath);
  const aliasCandidateReleasePath = join(aliasReleasesPath, aliasCandidateId);
  const aliasCandidateAppPath = join(aliasCandidateReleasePath, "app");
  await mkdir(aliasCandidateReleasePath, { recursive: true });
  await writeFile(join(aliasCandidateReleasePath, "release-manifest.json"), "{}\n");
  await symlink(aliasPrevious.appPath, aliasCandidateAppPath);
  const aliasActiveRecordPath = join(aliasReleasesPath, "active-release.json");
  const aliasActiveRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: aliasPreviousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: aliasPreviousId,
      target: aliasPrevious.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  await writeFile(aliasActiveRecordPath, aliasActiveRecordText, "utf8");

  const aliasSameRelease = runActivation(activationScriptPath, [
    aliasActiveAppPath,
    aliasReleasesPath,
    aliasCandidateReleasePath,
    aliasCandidateAppPath,
    aliasCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: aliasRestartLogPath,
  });
  const aliasSameReleaseOutput = `${aliasSameRelease.stdout}\n${aliasSameRelease.stderr}`;

  assert.notEqual(aliasSameRelease.status, 0, "symlink-alias activation of the current release must be rejected");
  assert.match(aliasSameReleaseOutput, /reason=release_already_active/, "canonical same-release guard must report its stable reason");
  assert.equal(
    await readlink(aliasActiveAppPath),
    aliasPrevious.appPath,
    "symlink-alias same-release rejection must not switch the active pointer",
  );
  assert.equal(
    await readFile(aliasActiveRecordPath, "utf8"),
    aliasActiveRecordText,
    "symlink-alias same-release rejection must not rewrite the active record",
  );
  assert((await lstat(aliasCandidateAppPath)).isSymbolicLink(), "candidate path alias must remain a symlink for a meaningful canonical-path test");
  await assertMissing(aliasRestartLogPath, "symlink-alias same-release rejection must occur before service restart");
  await assertMissing(join(aliasRoot, "app.next"), "symlink-alias same-release rejection must occur before pointer creation");
  await assertMissing(`${aliasActiveRecordPath}.next`, "symlink-alias same-release rejection must not create a pending record");

  console.log("Release activation transaction QA: OK");
  console.log("- record-write failure restored the previous pointer and removed partial records");
  console.log("- same-release activation was rejected before switch/restart");
  console.log("- second final rename failure restored the prior candidate activation record");
  console.log("- legacy-directory rollback restored the original runtime byte-identically");
  console.log("- canonical same-release alias was rejected before switch/restart");
} finally {
  await rm(directory, { recursive: true, force: true });
}
