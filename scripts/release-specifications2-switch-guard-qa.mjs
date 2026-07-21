import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const beginMarker = "# SPECIFICATIONS2_RELEASE_SWITCH_GUARD_BEGIN";
const endMarker = "# SPECIFICATIONS2_RELEASE_SWITCH_GUARD_END";

function extractGuard(source, label) {
  const start = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker, start + beginMarker.length);
  assert(start >= 0 && end > start, `${label} Specifications 2.0 release-switch guard must remain extractable`);
  return source.slice(start, end + endMarker.length);
}

const [activateSource, rollbackSource] = await Promise.all([
  readFile(new URL("./release-activate.mjs", import.meta.url), "utf8"),
  readFile(new URL("./release-rollback.mjs", import.meta.url), "utf8"),
]);
const activateGuard = extractGuard(activateSource, "activation");
const rollbackGuard = extractGuard(rollbackSource, "rollback");
assert.equal(activateGuard, rollbackGuard, "activation and rollback must execute the exact same fail-closed command-OFF proof");

const root = await mkdtemp(join(tmpdir(), "mes-specifications2-release-guard-"));
try {
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
  const systemctlPath = join(bin, "systemctl");
  await writeFile(systemctlPath, `#!/bin/sh
if [ "\${1:-}" = "show" ]; then
  printf '%s\\n' "\${QA_MAIN_PID:-0}"
  exit 0
fi
exit 0
`);
  await chmod(systemctlPath, 0o755);
  const trPath = join(bin, "tr");
  await writeFile(trPath, `#!/bin/sh
if [ "\${QA_TR_FAIL:-0}" = "1" ]; then
  exit 74
fi
exec /usr/bin/tr "$@"
`);
  await chmod(trPath, 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    MES_RELEASE_GUARD_SYSTEMD_ROOT: systemdRoot,
    MES_RELEASE_GUARD_PROC_ROOT: procRoot,
    QA_MAIN_PID: mainPid,
  };
  const runGuard = ({ env = baseEnv, twice = false } = {}) => spawnSync("bash", ["-c", `${rollbackGuard}
switch_operation=qa
service=${service}
assert_legacy_incompatible_specifications2_commands_disabled
${twice ? "assert_legacy_incompatible_specifications2_commands_disabled" : ""}
`], { encoding: "utf8", env });
  const writeEnvironment = async (values) => writeFile(processEnvironment, Buffer.from(`${values.join("\0")}\0`, "utf8"));

  await writeEnvironment([
    "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0",
    "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=0",
    "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=0",
    "UNRELATED=1",
  ]);
  const beforeOffProof = await readFile(processEnvironment);
  const off = runGuard({ twice: true });
  assert.equal(off.status, 0, `an exact, repeatable command-OFF proof must pass: ${off.stderr}`);
  assert.deepEqual(await readFile(processEnvironment), beforeOffProof, "the repeated OFF proof must not mutate the running process environment");

  for (const dropin of ["50-specifications2-attachments.conf", "63-specifications2-work-orders.conf", "64-specifications2-publication.conf"]) {
    const path = join(serviceDropins, dropin);
    const flag = dropin.startsWith("50-")
      ? "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS"
      : dropin.startsWith("63-")
        ? "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS"
        : "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS";
    await writeFile(path, `[Service]\nEnvironment=\"${flag}=1\"\n`);
    const result = runGuard();
    assert.notEqual(result.status, 0, `${dropin} must block an incompatible release switch before any pointer action`);
    await rm(path);
  }
  const unexpectedDropin = join(serviceDropins, "99-unexpected-specifications-owner.conf");
  await writeFile(unexpectedDropin, "[Service]\nEnvironment=\"MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1\"\n");
  assert.notEqual(runGuard().status, 0, "an unexpected drop-in filename that enables Specifications 2.0 commands must fail closed");
  await rm(unexpectedDropin);

  for (const flag of [
    "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=1",
    "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS=1",
    "MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS=1",
  ]) {
    await writeEnvironment([flag]);
    const result = runGuard();
    assert.notEqual(result.status, 0, `${flag} in the effective process environment must block an incompatible release switch`);
  }

  const noPid = runGuard({ env: { ...baseEnv, QA_MAIN_PID: "0" } });
  assert.notEqual(noPid.status, 0, "an invalid MainPID must fail closed instead of treating an unobserved environment as OFF");

  const missingEnvironment = runGuard({ env: { ...baseEnv, QA_MAIN_PID: "9999" } });
  assert.notEqual(missingEnvironment.status, 0, "a missing process environment must fail closed");

  await writeEnvironment(["MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS=0"]);
  const disappearingEnvironment = runGuard({ env: { ...baseEnv, QA_TR_FAIL: "1" } });
  assert.notEqual(disappearingEnvironment.status, 0, "a process-environment read race must fail closed instead of being interpreted as OFF");

  await chmod(processEnvironment, 0o000);
  const unreadableEnvironment = runGuard();
  assert.notEqual(unreadableEnvironment.status, 0, "an unreadable process environment must fail closed");
  await chmod(processEnvironment, 0o600);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Specifications 2.0 release-switch guard QA: OK");
