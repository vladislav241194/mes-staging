import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
assert(source.includes('emit_failure_diagnostics 1 "service_restart_failed"'), "restart failures must emit diagnostics before rollback");
assert(source.includes('emit_failure_diagnostics 1 "local_healthcheck_failed"'), "local health failures must emit diagnostics before rollback");
assert(source.includes('emit_failure_diagnostics 1 "public_healthcheck_failed"'), "public health failures must emit diagnostics before rollback");
assert(source.includes('systemctl status "$service" --no-pager --full --lines=12'), "diagnostics must include bounded service status");
assert(source.includes('journalctl -u "$service" --no-pager --output=short-iso --lines=30'), "diagnostics must include bounded service journal when readable");
assert(source.includes('redact_diagnostics()'), "service output must pass through a credential redactor");
assert(source.includes("trap 'failure_code=$?; emit_failure_diagnostics"), "unexpected shell failures must emit diagnostics");

const startMarker = "const activationScript = String.raw`";
const endMarker = "\n`;\n\nasync function main()";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start + startMarker.length);
assert(start >= 0 && end >= 0, "activation shell must remain extractable for deterministic syntax and failure-path QA");

const directory = await mkdtemp(join(tmpdir(), "mes-release-activation-diagnostics-"));
try {
  const scriptPath = join(directory, "activation.sh");
  const binPath = join(directory, "bin");
  const activationShell = source.slice(start + startMarker.length, end);
  await writeFile(scriptPath, activationShell, "utf8");

  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert(syntax.status === 0, `activation shell must parse: ${syntax.stderr || syntax.stdout}`);

  await spawnOrThrow("mkdir", ["-p", binPath]);
  for (const command of ["node", "curl", "sha256sum", "sudo"]) {
    await writeExecutable(binPath, command, "#!/usr/bin/env sh\nexit 0\n");
  }
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
  assert(output.includes("phase=release-artifact-validation"), "diagnostics must report the failing phase");
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
