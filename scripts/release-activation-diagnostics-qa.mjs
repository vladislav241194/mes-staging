import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const source = await readFile(resolve(process.cwd(), "scripts/release-activate.mjs"), "utf8");

assert(source.includes('ACTIVATION_DIAGNOSTICS_BEGIN'), "failure diagnostics need a stable opening marker");
assert(source.includes('ACTIVATION_DIAGNOSTICS_END'), "failure diagnostics need a stable closing marker");
assert(source.includes('activation_phase="manifest-verification"'), "manifest verification failures must identify their phase");
assert(source.includes('activation_phase="restart-service"'), "restart failures must identify their phase");
assert(source.includes('activation_phase="local-healthcheck"'), "local health failures must identify their phase");
assert(source.includes('activation_phase="public-healthcheck"'), "public health failures must identify their phase");
assert(source.includes('activation_phase="record-activation"'), "activation-record failures must identify their phase");
assert(source.includes('MES_RELEASE_AUTHORITY_LOCK_HELD:-0')
  && source.includes('/proc/$$/fdinfo/9')
  && source.includes('$6 == owner_pid')
  && source.includes('identity[3] == lock_inode'),
"production activation must prove the inherited fd9 owner PID and canonical inode before mutation");
assert(source.includes('root_seal_helper="/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs"'), "activation must use the atomically selected root-owned seal verifier");
assert(source.indexOf('/usr/bin/node "$root_seal_helper" release') < source.indexOf('cd "$release_app_path"'), "candidate code must not execute before recursive root-seal verification");
assert(source.includes('emit_failure_diagnostics 1 "service_restart_failed"'), "restart failures must emit diagnostics before rollback");
assert(source.includes('emit_failure_diagnostics 1 "local_healthcheck_failed"'), "local health failures must emit diagnostics before rollback");
assert(source.includes('emit_failure_diagnostics 1 "public_healthcheck_failed"'), "public health failures must emit diagnostics before rollback");
assert(source.includes('systemctl status "$service" --no-pager --full --lines=12'), "diagnostics must include bounded service status");
assert(source.includes('journalctl -u "$service" --no-pager --output=short-iso --lines=30'), "diagnostics must include bounded service journal when readable");
assert(source.includes('redact_diagnostics()'), "service output must pass through a credential redactor");
assert(source.includes("trap 'failure_code=$?; emit_failure_diagnostics"), "unexpected shell failures must emit diagnostics");
assert(source.includes('if [ "$runtime_switched" = "1" ]; then rollback; fi'), "unexpected post-switch failures must restore the prior runtime");
const activeRecordCommit = source.indexOf('mv -f "$releases_path/active-release.json.next" "$releases_path/active-release.json"');
const rollbackGuardDisarm = source.indexOf("runtime_switched=0", activeRecordCommit);
const activationSuccess = source.indexOf("printf 'ACTIVATED", rollbackGuardDisarm);
assert(activeRecordCommit >= 0 && rollbackGuardDisarm > activeRecordCommit && activationSuccess > rollbackGuardDisarm, "the rollback guard must remain armed until the active release record is committed");

const startMarker = "const activationScript = String.raw`";
const endMarker = "\n`;\n\nasync function main()";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start + startMarker.length);
assert(start >= 0 && end >= 0, "activation shell must remain extractable for deterministic syntax and failure-path QA");

const directory = await realpath(await mkdtemp(join(tmpdir(), "mes-release-activation-diagnostics-")));
try {
  const scriptPath = join(directory, "activation.sh");
  const binPath = join(directory, "bin");
  const rootSealHelperPath = join(directory, "trusted-root-seal-helper.mjs");
  const journalHelperPath = join(directory, "trusted-switch-journal-helper.mjs");
  const activationShell = source.slice(start + startMarker.length, end)
    .replace('if [ "$(id -u)" -ne 0 ]; then', 'if [ "0" -ne 0 ]; then')
    .replace("[ -x /usr/bin/node ]", "command -v node >/dev/null 2>&1")
    .replaceAll('/usr/bin/node "$root_seal_helper"', 'node "$root_seal_helper"')
    .replaceAll('/usr/bin/node "$journal_helper"', 'node "$journal_helper"')
    .replaceAll("/usr/local/libexec/mes/active-bundle/release-root-seal-verify.mjs", rootSealHelperPath)
    .replaceAll("/usr/local/libexec/mes/active-bundle/release-switch-journal.mjs", journalHelperPath)
    .replace(/case "\$app_path:\$releases_path:\$service" in[\s\S]*?\nesac/, 'contour_name="staging"')
    .replace(/activation_phase="authority-rollout-lock"[\s\S]*?authority_lock_held=1\n/,
      'activation_phase="authority-rollout-lock"\nmkdir -p "$authority_lock_parent"\n: > "$authority_lock_file"\nauthority_lock_held=1\n')
    .replaceAll("/run/lock/mes", join(directory, "root-lock"));
  await writeFile(scriptPath, activationShell, "utf8");
  await writeFile(rootSealHelperPath, "// fixed helper modeled by node shim\n", "utf8");
  await writeFile(journalHelperPath, "// fixed journal helper modeled by node shim\n", "utf8");

  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert(syntax.status === 0, `activation shell must parse: ${syntax.stderr || syntax.stdout}`);

  await spawnOrThrow("mkdir", ["-p", binPath]);
  await spawnOrThrow("mkdir", ["-p", join(directory, "shared-state")]);
  for (const command of ["node", "curl", "flock", "runuser", "sha256sum", "sudo"]) {
    await writeExecutable(binPath, command, "#!/usr/bin/env sh\nexit 0\n");
  }
  await writeExecutable(binPath, "chown", "#!/usr/bin/env sh\nexit 0\n");
  await writeExecutable(binPath, "sync", "#!/usr/bin/env sh\nexit 0\n");
  await writeExecutable(binPath, "stat", `#!/usr/bin/env sh
for value in "$@"; do last="$value"; done
case "$last" in *.lock) printf '%s\\n' '0:0:600' ;; *) printf '%s\\n' '0:0:700' ;; esac
`);
  await writeExecutable(binPath, "install", `#!/usr/bin/env sh
set -eu
while [ "$#" -gt 2 ]; do shift; done
: > "$2"
chmod 0600 "$2"
`);
  await writeExecutable(binPath, "systemctl", `#!/usr/bin/env sh
case "$1" in
  is-active) exit 3 ;;
  status)
    printf '%s\\n' 'service status safe-detail' 'password=must-not-leak'
    exit 3
    ;;
esac
exit 0
`);
  await writeExecutable(binPath, "journalctl", `#!/usr/bin/env sh
printf '%s\\n' 'journal safe-detail' 'token=must-not-leak' 'postgresql://test-user:s3ns1tive@db.internal/mes'
exit 0
`);

  const failure = spawnSync("bash", [scriptPath,
    join(directory, "active"),
    join(directory, "releases"),
    join(directory, "releases", "candidate"),
    join(directory, "releases", "candidate", "app"),
    "candidate",
    "mes-test.service",
    "4175",
    "https://example.invalid",
    "false",
    "false",
  ], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, PATH: `${binPath}:${process.env.PATH}` },
  });
  const output = `${failure.stdout}\n${failure.stderr}`;
  assert(failure.status !== 0, "missing candidate artifacts must fail activation");
  assert(output.includes("ACTIVATION_DIAGNOSTICS_BEGIN"), "unexpected activation failures must emit diagnostics");
  assert(output.includes("phase=release-artifact-validation"), `diagnostics must report the failing phase:\n${output}`);
  assert(output.includes("active_runtime=kind=missing"), "diagnostics must describe the current active runtime");
  assert(output.includes("systemctl_status_begin") && output.includes("service status safe-detail"), "diagnostics must include bounded status output");
  assert(output.includes("service_journal_begin") && output.includes("journal safe-detail"), "diagnostics must include readable journal output");
  assert(!output.includes("must-not-leak"), "credential-bearing diagnostic lines must be redacted");
  assert(!output.includes("s3ns1tive") && output.includes("postgresql://[REDACTED]@db.internal/mes"), "URL credentials must be redacted for non-HTTP service URLs");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Release activation diagnostics QA: OK");

async function writeExecutable(directory, name, contents) {
  const path = join(directory, name);
  await writeFile(path, contents, "utf8");
  await chmod(path, 0o755);
}

async function spawnOrThrow(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
}
