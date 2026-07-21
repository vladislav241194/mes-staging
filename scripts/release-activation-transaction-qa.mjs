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
import { buildNomenclatureCommandManifestContract } from "./release-nomenclature-command-contract.mjs";
import { buildSpecifications2CommandManifestContract } from "./release-specifications2-command-contract.mjs";
import { buildSystemDomainsCommandManifestContract } from "./release-system-domains-command-contract.mjs";
import { buildShiftExecutionCommandManifestContract } from "./release-shift-execution-command-contract.mjs";
import { buildDirectoryClusterCommandManifestContract } from "./release-directory-cluster-command-contract.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const activationSource = await readFile(join(projectRoot, "scripts", "release-activate.mjs"), "utf8");
const specifications2CompatibilityMarker = await readFile(
  join(projectRoot, "ops", "postgres", "specifications2-server-command-compatibility.json"),
  "utf8",
);
const nomenclatureCompatibilityMarker = await readFile(
  join(projectRoot, "ops", "auth", "nomenclature-server-command-compatibility.json"),
  "utf8",
);
const systemDomainsCompatibilityMarker = await readFile(
  join(projectRoot, "ops", "postgres", "system-domains-server-command-compatibility.json"),
  "utf8",
);
const shiftExecutionCompatibilityMarker = await readFile(
  join(projectRoot, "ops", "postgres", "shift-execution-server-command-compatibility.json"),
  "utf8",
);
const directoryClusterCompatibilityMarker = await readFile(
  join(projectRoot, "ops", "shared-state", "directory-cluster-server-command-compatibility.json"),
  "utf8",
);
const compatibleManifest = {
  schemaVersion: 3,
  runtimeIncludes: ["ops"],
  specifications2CommandCompatibility: buildSpecifications2CommandManifestContract(specifications2CompatibilityMarker),
  nomenclatureCommandCompatibility: buildNomenclatureCommandManifestContract(nomenclatureCompatibilityMarker),
  systemDomainsCommandCompatibility: buildSystemDomainsCommandManifestContract(systemDomainsCompatibilityMarker),
  shiftExecutionCommandCompatibility: buildShiftExecutionCommandManifestContract(shiftExecutionCompatibilityMarker),
  directoryClusterCommandCompatibility: buildDirectoryClusterCommandManifestContract(directoryClusterCompatibilityMarker),
};
const startMarker = "const activationScript = String.raw`";
const endMarker = "\n`;\n\nasync function main()";
const start = activationSource.indexOf(startMarker);
const end = activationSource.indexOf(endMarker, start + startMarker.length);

assert(start >= 0 && end >= 0, "activation shell must remain extractable for transaction QA");

const activationShellTemplate = activationSource.slice(start + startMarker.length, end);
const directory = await realpath(await mkdtemp(join(tmpdir(), "mes-release-activation-transaction-")));
const rootSealHelperPath = join(directory, "trusted-root-seal-helper.mjs");
const journalHelperPath = join(directory, "trusted-switch-journal-helper.mjs");
const activationShell = activationShellTemplate
  .replace('if [ "$(id -u)" -ne 0 ]; then', 'if [ "0" -ne 0 ]; then')
  .replace("[ -x /usr/bin/node ]", "command -v node >/dev/null 2>&1")
  .replaceAll('/usr/bin/node "$root_seal_helper"', 'node "$root_seal_helper"')
  .replaceAll('/usr/bin/node "$journal_helper"', 'node "$journal_helper"')
  .replaceAll("/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs", rootSealHelperPath)
  .replaceAll("/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs", journalHelperPath)
  .replace(/case "\$app_path:\$releases_path:\$service" in[\s\S]*?\nesac/, 'contour_name="staging"')
  .replace(/activation_phase="authority-rollout-lock"[\s\S]*?authority_lock_held=1\n/,
    'activation_phase="authority-rollout-lock"\nmkdir -p "$authority_lock_parent"\n: > "$authority_lock_file"\nauthority_lock_held=1\n')
  .replace('start_ticks="$(awk \'{print $22}\' "/proc/$$/stat")"', 'start_ticks="1"')
  .replaceAll("/run/lock/mes", join(directory, "root-lock"));

async function writeExecutable(path, source) {
  await writeFile(path, source, "utf8");
  await chmod(path, 0o755);
}

async function createRelease(releasesPath, releaseId, {
  manifest = compatibleManifest,
} = {}) {
  const releasePath = join(releasesPath, releaseId);
  const appPath = join(releasePath, "app");
  await mkdir(join(appPath, "dist"), { recursive: true });
  await mkdir(join(appPath, "scripts"), { recursive: true });
  await mkdir(join(appPath, "ops", "postgres"), { recursive: true });
  await mkdir(join(appPath, "ops", "auth"), { recursive: true });
  await mkdir(join(appPath, "ops", "shared-state"), { recursive: true });
  await writeFile(join(releasePath, "release-manifest.json"), `${JSON.stringify(manifest)}\n`);
  await writeFile(join(appPath, "dist", "index.html"), "<!doctype html>\n");
  await writeFile(join(appPath, "package-lock.json"), "{}\n");
  await writeFile(join(appPath, "scripts", "release-verify.mjs"), "// replaced by the QA node shim\n");
  await writeFile(join(appPath, "ops", "postgres", "specifications2-server-command-compatibility.json"), specifications2CompatibilityMarker);
  await writeFile(join(appPath, "ops", "postgres", "system-domains-server-command-compatibility.json"), systemDomainsCompatibilityMarker);
  await writeFile(join(appPath, "ops", "postgres", "shift-execution-server-command-compatibility.json"), shiftExecutionCompatibilityMarker);
  await writeFile(join(appPath, "ops", "auth", "nomenclature-server-command-compatibility.json"), nomenclatureCompatibilityMarker);
  await writeFile(join(appPath, "ops", "shared-state", "directory-cluster-server-command-compatibility.json"), directoryClusterCompatibilityMarker);
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
  const guardSystemdRoot = join(directory, "guard-systemd");
  const guardProcRoot = join(directory, "guard-proc");
  const guardMainPid = "4242";
  const previousId = "v.1.500.19-previous";
  const candidateId = "v.1.500.20-candidate";

  await mkdir(binPath, { recursive: true });
  await mkdir(releasesPath, { recursive: true });
  await mkdir(join(directory, "shared-state"), { recursive: true });
  await mkdir(join(guardSystemdRoot, "mes-qa.service.d"), { recursive: true });
  await mkdir(join(guardProcRoot, guardMainPid), { recursive: true });
  await writeFile(
    join(guardProcRoot, guardMainPid, "environ"),
    Buffer.from("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=0\0MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=0\0MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=0\0MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=0\0MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=0\0", "utf8"),
  );
  await writeFile(rootSealHelperPath, "// fixed root-seal helper is modeled by the QA node shim\n");
  await writeFile(journalHelperPath, "// fixed switch journal helper is modeled as a successful transaction boundary\n");
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
if [ "\${1:-}" = "$QA_ROOT_SEAL_HELPER" ]; then
  if [ -n "\${QA_ROOT_SEAL_LOG:-}" ]; then
    printf '%s\n' "$*" >> "$QA_ROOT_SEAL_LOG"
    root_seal_count="$(wc -l < "$QA_ROOT_SEAL_LOG" | tr -d ' ')"
    if [ "\${QA_ROOT_SEAL_FAIL_AFTER:-0}" -gt 0 ] && [ "$root_seal_count" -ge "$QA_ROOT_SEAL_FAIL_AFTER" ]; then
      exit 73
    fi
  fi
  exit 0
fi
if [ "\${1:-}" = "scripts/release-verify.mjs" ]; then
  printf '{"appVersion":"v.1.500.qa","runtimePolicyId":"qa-permanent","runtimePolicySha256":"qa-policy-sha","reactSurfaces":%s}\\n' "$QA_REACT_SURFACES_JSON"
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
if [ "\${QA_HEALTH_FAIL:-0}" = "1" ]; then
  printf '%s\\n' '{"status":"failed","sharedState":"unavailable","version":"wrong"}' > "$output_path"
  printf '503'
  exit 0
fi
printf '%s\\n' '{"status":"ok","sharedState":"ready","version":"v.1.500.qa","reactRuntime":{"sha256":"qa-policy-sha","activeEvaluationSurfaces":[]}}' > "$output_path"
printf '200'
`);
  await writeExecutable(join(binPath, "sleep"), "#!/bin/sh\nexit 0\n");

  await writeExecutable(join(binPath, "systemctl"), `#!/bin/sh
case "\${1:-}" in
  is-active) exit 0 ;;
  status) printf '%s\\n' 'qa service active'; exit 0 ;;
  show) printf '%s\\n' "\${QA_MAIN_PID:-0}"; exit 0 ;;
esac
exit 0
`);
  await writeExecutable(join(binPath, "sudo"), `#!/bin/sh
printf '%s\\n' "$*" >> "$QA_RESTART_LOG"
if [ "\${QA_FLIP_GUARD_AFTER_RESTARTS:-0}" != "0" ]; then
  restart_count="$(wc -l < "$QA_RESTART_LOG" | tr -d ' ')"
  if [ "$restart_count" -ge "$QA_FLIP_GUARD_AFTER_RESTARTS" ]; then
    printf 'MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1\\000' > "$QA_GUARD_ENV_PATH"
  fi
fi
exit 0
`);
  await writeExecutable(join(binPath, "sha256sum"), "#!/bin/sh\nexit 0\n");
  await writeExecutable(join(binPath, "stat"), `#!/bin/sh
for value in "$@"; do last="$value"; done
case "$last" in *.lock) printf '%s\\n' '0:0:600' ;; *) printf '%s\\n' '0:0:700' ;; esac
`);
  await writeExecutable(join(binPath, "install"), `#!/bin/sh
set -eu
while [ "$#" -gt 2 ]; do shift; done
: > "$2"
chmod 0600 "$2"
`);
  await writeExecutable(join(binPath, "flock"), "#!/bin/sh\nexit 0\n");
  await writeExecutable(join(binPath, "runuser"), `#!/bin/sh
set -eu
while [ "$#" -gt 0 ]; do
  if [ "$1" = "/usr/bin/node" ]; then shift; exec node "$@"; fi
  shift
done
exit 2
`);
  await writeExecutable(join(binPath, "chown"), "#!/bin/sh\nexit 0\n");
  await writeExecutable(join(binPath, "sync"), "#!/bin/sh\nexit 0\n");
  await writeExecutable(join(binPath, "journalctl"), "#!/bin/sh\nprintf '%s\\n' 'qa journal'\nexit 0\n");

  const env = {
    ...process.env,
    PATH: `${binPath}:/usr/bin:/bin:/usr/sbin:/sbin`,
    QA_REAL_NODE: process.execPath,
    QA_ROOT_SEAL_HELPER: rootSealHelperPath,
    QA_ROOT_SEAL_FAIL_AFTER: "0",
    QA_RESTART_LOG: restartLogPath,
    QA_REACT_SURFACES_JSON: '["structureMigrationDiagnostics"]',
    QA_RECORD_MODE: "fail-write",
    QA_FAIL_ACTIVE_RECORD_RENAME: "0",
    QA_MAIN_PID: guardMainPid,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: guardSystemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: guardProcRoot,
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
  assert.equal(restartLogBeforeSameRelease.trim().split(/\r?\n/).length, 2, "failed activation must restart once for verification and then stop the restored pointer fail-closed");

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
  await mkdir(join(finalRenameRoot, "shared-state"), { recursive: true });
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
    "second final rename failure must restart once for verification and then stop the restored pointer fail-closed",
  );

  const legacyRoot = join(directory, "legacy-directory");
  const legacyReleasesPath = join(legacyRoot, "releases");
  const legacyActiveAppPath = join(legacyRoot, "app");
  const legacyRestartLogPath = join(legacyRoot, "restart.log");
  const legacyCandidateId = "v.1.500.20-legacy-candidate";
  const legacyMarker = Buffer.from("legacy-runtime-marker\nwith-original-bytes\u0000", "utf8");
  await mkdir(legacyReleasesPath, { recursive: true });
  await mkdir(join(legacyRoot, "shared-state"), { recursive: true });
  await mkdir(legacyActiveAppPath, { recursive: true });
  await writeFile(join(legacyActiveAppPath, "legacy.marker"), legacyMarker);
  await mkdir(join(legacyActiveAppPath, "ops", "postgres"), { recursive: true });
  await writeFile(
    join(legacyActiveAppPath, "ops", "postgres", "specifications2-server-command-compatibility.json"),
    specifications2CompatibilityMarker,
  );
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

  assert.notEqual(legacyRecordFailure.status, 0, "an unattested legacy directory must fail activation");
  assert.match(legacyRecordFailureOutput, /phase=active-runtime-inspection/, "legacy-directory rejection must occur before candidate code or pointer switch");
  assert.match(legacyRecordFailureOutput, /reason=unattested_legacy_directory_ineligible/, "legacy-directory rejection must expose its stable new-inode trust reason");
  const restoredLegacyStat = await lstat(legacyActiveAppPath);
  assert(restoredLegacyStat.isDirectory(), "legacy-directory rejection must leave the original directory untouched");
  assert.deepEqual(await readFile(join(legacyActiveAppPath, "legacy.marker")), legacyMarker, "legacy-directory rejection must preserve original bytes");
  const preservedLegacyDirectories = (await readdir(legacyReleasesPath)).filter((name) => name.startsWith("legacy-app-pre-"));
  assert.equal(preservedLegacyDirectories.length, 0, "an ineligible legacy directory must not be moved into a misleading rollback artifact");
  await assertMissing(legacyActiveRecordPath, "legacy-directory failure must not create an active release record");
  await assertMissing(`${legacyActiveRecordPath}.next`, "legacy-directory failure must remove the pending active record");
  await assertMissing(
    join(legacyCandidate.releasePath, "activation.json.next"),
    "legacy-directory failure must remove the pending activation record",
  );
  await assertMissing(legacyRestartLogPath, "legacy-directory rejection must not restart either runtime");

  const aliasRoot = join(directory, "same-release-alias");
  const aliasReleasesPath = join(aliasRoot, "releases");
  const aliasActiveAppPath = join(aliasRoot, "app");
  const aliasRestartLogPath = join(aliasRoot, "restart.log");
  const aliasPreviousId = "v.1.500.19-alias-current";
  const aliasCandidateId = "v.1.500.20-alias-candidate";
  await mkdir(aliasReleasesPath, { recursive: true });
  await mkdir(join(aliasRoot, "shared-state"), { recursive: true });
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

  const incompatibleRoot = join(directory, "incompatible-previous-block");
  const incompatibleReleasesPath = join(incompatibleRoot, "releases");
  const incompatibleActiveAppPath = join(incompatibleRoot, "app");
  const incompatibleRestartLogPath = join(incompatibleRoot, "restart.log");
  const incompatibleSystemdRoot = join(incompatibleRoot, "systemd");
  const incompatibleProcRoot = join(incompatibleRoot, "proc");
  const incompatiblePid = "5151";
  const incompatiblePreviousId = "v.1.500.25-incompatible-previous";
  const incompatibleCandidateId = "v.1.500.26-compatible-candidate";
  await mkdir(incompatibleReleasesPath, { recursive: true });
  await mkdir(join(incompatibleRoot, "shared-state"), { recursive: true });
  await mkdir(join(incompatibleSystemdRoot, "mes-qa.service.d"), { recursive: true });
  await mkdir(join(incompatibleProcRoot, incompatiblePid), { recursive: true });
  await writeFile(
    join(incompatibleProcRoot, incompatiblePid, "environ"),
    Buffer.from("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1\0", "utf8"),
  );
  const incompatiblePrevious = await createRelease(incompatibleReleasesPath, incompatiblePreviousId, {
    manifest: { schemaVersion: 2, runtimeIncludes: ["ops"] },
  });
  const incompatibleCandidate = await createRelease(incompatibleReleasesPath, incompatibleCandidateId);
  await symlink(incompatiblePrevious.appPath, incompatibleActiveAppPath);
  const incompatibleActiveRecordPath = join(incompatibleReleasesPath, "active-release.json");
  const incompatibleActiveRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: incompatiblePreviousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: incompatiblePreviousId,
      target: incompatiblePrevious.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  await writeFile(incompatibleActiveRecordPath, incompatibleActiveRecordText, "utf8");
  const incompatibleBlocked = runActivation(activationScriptPath, [
    incompatibleActiveAppPath,
    incompatibleReleasesPath,
    incompatibleCandidate.releasePath,
    incompatibleCandidate.appPath,
    incompatibleCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: incompatibleRestartLogPath,
    QA_MAIN_PID: incompatiblePid,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: incompatibleSystemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: incompatibleProcRoot,
  });
  const incompatibleBlockedOutput = `${incompatibleBlocked.stdout}\n${incompatibleBlocked.stderr}`;
  assert.notEqual(incompatibleBlocked.status, 0, "an incompatible previous release with Work Orders ON must block activation before switch");
  assert.match(incompatibleBlockedOutput, /reason=legacy_incompatible_previous_specifications2_command_enabled/, "the blocked rollback direction must expose a stable reason");
  assert.equal(await readlink(incompatibleActiveAppPath), incompatiblePrevious.appPath, "a blocked rollback direction must preserve the previous pointer");
  await assertMissing(incompatibleRestartLogPath, "a blocked rollback direction must not restart the service");
  await assertMissing(join(incompatibleRoot, "app.next"), "a blocked rollback direction must not create a candidate pointer");

  const rollbackGuardRoot = join(directory, "automatic-rollback-off-proof");
  const rollbackGuardReleasesPath = join(rollbackGuardRoot, "releases");
  const rollbackGuardActiveAppPath = join(rollbackGuardRoot, "app");
  const rollbackGuardRestartLogPath = join(rollbackGuardRoot, "restart.log");
  const rollbackGuardSystemdRoot = join(rollbackGuardRoot, "systemd");
  const rollbackGuardProcRoot = join(rollbackGuardRoot, "proc");
  const rollbackGuardPid = "6161";
  const rollbackGuardPreviousId = "v.1.500.25-rollback-guard";
  const rollbackGuardCandidateId = "v.1.500.26-rollback-candidate";
  await mkdir(rollbackGuardReleasesPath, { recursive: true });
  await mkdir(join(rollbackGuardRoot, "shared-state"), { recursive: true });
  await mkdir(join(rollbackGuardSystemdRoot, "mes-qa.service.d"), { recursive: true });
  await mkdir(join(rollbackGuardProcRoot, rollbackGuardPid), { recursive: true });
  const rollbackGuardEnvironmentPath = join(rollbackGuardProcRoot, rollbackGuardPid, "environ");
  await writeFile(rollbackGuardEnvironmentPath, Buffer.from("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=0\0", "utf8"));
  const rollbackGuardPrevious = await createRelease(rollbackGuardReleasesPath, rollbackGuardPreviousId);
  const rollbackGuardCandidate = await createRelease(rollbackGuardReleasesPath, rollbackGuardCandidateId);
  await rm(join(rollbackGuardPrevious.appPath, "ops", "postgres", "specifications2-server-command-compatibility.json"));
  await symlink(rollbackGuardPrevious.appPath, rollbackGuardActiveAppPath);
  const rollbackGuardActiveRecordPath = join(rollbackGuardReleasesPath, "active-release.json");
  const rollbackGuardActiveRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: rollbackGuardPreviousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: rollbackGuardPreviousId,
      target: rollbackGuardPrevious.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  await writeFile(rollbackGuardActiveRecordPath, rollbackGuardActiveRecordText, "utf8");
  const automaticRollback = runActivation(activationScriptPath, [
    rollbackGuardActiveAppPath,
    rollbackGuardReleasesPath,
    rollbackGuardCandidate.releasePath,
    rollbackGuardCandidate.appPath,
    rollbackGuardCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: rollbackGuardRestartLogPath,
    QA_MAIN_PID: rollbackGuardPid,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: rollbackGuardSystemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: rollbackGuardProcRoot,
    QA_RECORD_MODE: "fail-write",
    QA_FLIP_GUARD_AFTER_RESTARTS: "1",
    QA_GUARD_ENV_PATH: rollbackGuardEnvironmentPath,
  });
  const automaticRollbackOutput = `${automaticRollback.stdout}\n${automaticRollback.stderr}`;
  assert.notEqual(automaticRollback.status, 0, "record failure must still fail after restoring an incompatible previous release");
  assert.match(automaticRollbackOutput, /refusing automatic rollback because a command owner required by the incompatible previous runtime is not proved OFF/, "automatic rollback must reject an incompatible direction whose owner became enabled before restart");
  assert.equal(await readlink(rollbackGuardActiveAppPath), rollbackGuardCandidate.appPath, "automatic rollback must never leave the incompatible previous runtime serving");
  assert.equal(await readFile(rollbackGuardActiveRecordPath, "utf8"), rollbackGuardActiveRecordText, "automatic rollback must preserve the previous active record");
  assert.equal((await readFile(rollbackGuardRestartLogPath, "utf8")).trim().split(/\r?\n/).length, 1, "automatic rollback guard scenario must never restart the incompatible previous runtime");
  const failClosedRetry = runActivation(activationScriptPath, [
    rollbackGuardActiveAppPath,
    rollbackGuardReleasesPath,
    rollbackGuardCandidate.releasePath,
    rollbackGuardCandidate.appPath,
    rollbackGuardCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: rollbackGuardRestartLogPath,
    QA_MAIN_PID: rollbackGuardPid,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: rollbackGuardSystemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: rollbackGuardProcRoot,
  });
  assert.notEqual(failClosedRetry.status, 0, "a fail-safe candidate pointer with the prior active record must block subsequent release commands");
  assert.match(`${failClosedRetry.stdout}\n${failClosedRetry.stderr}`, /phase=active-record-pointer-consistency/, "the fail-closed record mismatch must expose a stable diagnostic phase");
  assert.equal(await readlink(rollbackGuardActiveAppPath), rollbackGuardCandidate.appPath, "the fail-closed retry must not change the safety runtime");
  assert.equal((await readFile(rollbackGuardRestartLogPath, "utf8")).trim().split(/\r?\n/).length, 1, "the fail-closed retry must not restart either runtime");

  const offRollbackRoot = join(directory, "automatic-rollback-all-owners-off");
  const offRollbackReleasesPath = join(offRollbackRoot, "releases");
  const offRollbackActiveAppPath = join(offRollbackRoot, "app");
  const offRollbackRestartLogPath = join(offRollbackRoot, "restart.log");
  const offRollbackSystemdRoot = join(offRollbackRoot, "systemd");
  const offRollbackProcRoot = join(offRollbackRoot, "proc");
  const offRollbackPid = "7171";
  const offRollbackPreviousId = "v.1.500.25-all-contracts-missing";
  const offRollbackCandidateId = "v.1.500.26-health-failure";
  await mkdir(offRollbackReleasesPath, { recursive: true });
  await mkdir(join(offRollbackRoot, "shared-state"), { recursive: true });
  await mkdir(join(offRollbackSystemdRoot, "mes-qa.service.d"), { recursive: true });
  await mkdir(join(offRollbackProcRoot, offRollbackPid), { recursive: true });
  await writeFile(
    join(offRollbackProcRoot, offRollbackPid, "environ"),
    Buffer.from("MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=0\0MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=0\0MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS=0\0MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS=0\0MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS=0\0MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS=0\0", "utf8"),
  );
  const offRollbackPrevious = await createRelease(offRollbackReleasesPath, offRollbackPreviousId, {
    manifest: { schemaVersion: 2, runtimeIncludes: ["ops"] },
  });
  const offRollbackCandidate = await createRelease(offRollbackReleasesPath, offRollbackCandidateId);
  await symlink(offRollbackPrevious.appPath, offRollbackActiveAppPath);
  const offRollbackActiveRecordPath = join(offRollbackReleasesPath, "active-release.json");
  const offRollbackActiveRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: offRollbackPreviousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: offRollbackPreviousId,
      target: offRollbackPrevious.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  await writeFile(offRollbackActiveRecordPath, offRollbackActiveRecordText, "utf8");
  const offRollback = runActivation(activationScriptPath, [
    offRollbackActiveAppPath,
    offRollbackReleasesPath,
    offRollbackCandidate.releasePath,
    offRollbackCandidate.appPath,
    offRollbackCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: offRollbackRestartLogPath,
    QA_MAIN_PID: offRollbackPid,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: offRollbackSystemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: offRollbackProcRoot,
    QA_HEALTH_FAIL: "1",
  });
  assert.notEqual(offRollback.status, 0, "candidate health failure must remain a failed activation");
  assert.match(`${offRollback.stdout}\n${offRollback.stderr}`, /restoring previous runtime/, "all command owners OFF must permit rollback to the sealed previous release even when it lacks every new contract");
  assert.equal(await readlink(offRollbackActiveAppPath), offRollbackPrevious.appPath, "health failure must restore the sealed previous pointer when every incompatible owner is OFF");
  assert.equal(await readFile(offRollbackActiveRecordPath, "utf8"), offRollbackActiveRecordText, "failed activation must retain the previous active record");
  assert.equal((await readFile(offRollbackRestartLogPath, "utf8")).trim().split(/\r?\n/).length, 2, "health failure must restart the candidate once and the sealed OFF-compatible previous runtime once");

  const unsealedRollbackRoot = join(directory, "unsealed-automatic-rollback");
  const unsealedRollbackReleasesPath = join(unsealedRollbackRoot, "releases");
  const unsealedRollbackActiveAppPath = join(unsealedRollbackRoot, "app");
  const unsealedRollbackRestartLogPath = join(unsealedRollbackRoot, "restart.log");
  const unsealedRollbackSealLogPath = join(unsealedRollbackRoot, "root-seal.log");
  const unsealedRollbackPreviousId = "v.1.500.25-sealed-previous";
  const unsealedRollbackCandidateId = "v.1.500.26-seal-failure";
  await mkdir(unsealedRollbackReleasesPath, { recursive: true });
  await mkdir(join(unsealedRollbackRoot, "shared-state"), { recursive: true });
  const unsealedRollbackPrevious = await createRelease(unsealedRollbackReleasesPath, unsealedRollbackPreviousId);
  const unsealedRollbackCandidate = await createRelease(unsealedRollbackReleasesPath, unsealedRollbackCandidateId);
  await symlink(unsealedRollbackPrevious.appPath, unsealedRollbackActiveAppPath);
  const unsealedRollbackActiveRecordPath = join(unsealedRollbackReleasesPath, "active-release.json");
  const unsealedRollbackActiveRecordText = `${JSON.stringify({
    schemaVersion: 2,
    releaseId: unsealedRollbackPreviousId,
    previous: null,
    legacyBaseline: {
      schemaVersion: 1,
      kind: "release-pointer",
      releaseId: unsealedRollbackPreviousId,
      target: unsealedRollbackPrevious.appPath,
      legacyPath: null,
    },
  }, null, 2)}\n`;
  await writeFile(unsealedRollbackActiveRecordPath, unsealedRollbackActiveRecordText, "utf8");
  const unsealedAutomaticRollback = runActivation(activationScriptPath, [
    unsealedRollbackActiveAppPath,
    unsealedRollbackReleasesPath,
    unsealedRollbackCandidate.releasePath,
    unsealedRollbackCandidate.appPath,
    unsealedRollbackCandidateId,
    ...common,
  ], {
    ...env,
    QA_RESTART_LOG: unsealedRollbackRestartLogPath,
    QA_ROOT_SEAL_LOG: unsealedRollbackSealLogPath,
    QA_ROOT_SEAL_FAIL_AFTER: "7",
    QA_RECORD_MODE: "fail-write",
  });
  const unsealedAutomaticRollbackOutput = `${unsealedAutomaticRollback.stdout}\n${unsealedAutomaticRollback.stderr}`;
  assert.notEqual(unsealedAutomaticRollback.status, 0, "record failure must remain failed when the previous seal cannot be reproved");
  assert.match(unsealedAutomaticRollbackOutput, /refusing automatic rollback (?:to an unsealed previous release|because the active candidate seal or pointer cannot be reproved)/, "automatic rollback must expose its root-seal fail-closed reason");
  assert.equal(await readlink(unsealedRollbackActiveAppPath), unsealedRollbackCandidate.appPath, "an unsealed previous runtime must never replace the sealed candidate");
  assert.equal(await readFile(unsealedRollbackActiveRecordPath, "utf8"), unsealedRollbackActiveRecordText, "root-seal failure must preserve the prior active record for reconciliation");
  assert.equal((await readFile(unsealedRollbackRestartLogPath, "utf8")).trim().split(/\r?\n/).length, 1, "an unsealed automatic rollback target must never be restarted");

  console.log("Release activation transaction QA: OK");
  console.log("- record-write failure restored the previous pointer and removed partial records");
  console.log("- same-release activation was rejected before switch/restart");
  console.log("- second final rename failure restored the prior candidate activation record");
  console.log("- unattested legacy directories were rejected before candidate execution; rollback remains the attested immutable legacy release pointer");
  console.log("- canonical same-release alias was rejected before switch/restart");
  console.log("- schema-v2 previous marker was not trusted and command authority was rejected before switch");
  console.log("- automatic rollback restored a sealed contract-old previous runtime only while every incompatible command owner was proved OFF");
  console.log("- fail-safe pointer/record mismatch blocked every later release command before restart");
  console.log("- automatic rollback kept the sealed candidate when the previous root seal could not be reproved");
} finally {
  await rm(directory, { recursive: true, force: true });
}
