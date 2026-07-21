import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { verifyEmployeePin } from "./employee-auth-crypto.mjs";
import { runEmployeeAuthCredentialAdmin } from "./employee-auth-credential-admin.mjs";

const qaRoot = await mkdtemp(join(tmpdir(), "mes-employee-auth-admin-qa-"));
const ownerUid = process.getuid?.() ?? 0;
const databaseEnvFile = join(qaRoot, "domain.env");
const credentialFile = join(qaRoot, "employee.pin");
const unsafeCredentialFile = join(qaRoot, "unsafe.pin");
const credentialSymlink = join(qaRoot, "employee-pin-link");
const adminEntrypointSymlink = join(qaRoot, "employee-auth-credential-admin.mjs");
await writeFile(databaseEnvFile, "MES_DOMAIN_STORAGE=postgres\nMES_DOMAIN_DATABASE_URL=postgres://employee-auth-qa/not-used\n", { mode: 0o600 });
await writeFile(credentialFile, "86420\n", { mode: 0o600 });
await writeFile(unsafeCredentialFile, "97531\n", { mode: 0o644 });
await symlink(credentialFile, credentialSymlink);
await symlink(fileURLToPath(new URL("./employee-auth-credential-admin.mjs", import.meta.url)), adminEntrypointSymlink);

const symlinkInvocation = spawnSync(process.execPath, [adminEntrypointSymlink, "--help"], { encoding: "utf8" });
assert.equal(symlinkInvocation.status, 0, symlinkInvocation.stderr || "symlinked CLI invocation failed");
assert.match(symlinkInvocation.stdout, /Usage:/, "symlinked CLI entrypoint must execute instead of silently returning");

const employees = new Map([
  ["employee-active", { employeeId: "employee-active", displayName: "Активный", active: true }],
  ["employee-inactive", { employeeId: "employee-inactive", displayName: "Неактивный", active: false }],
]);
const credentials = new Map();
let closeCalls = 0;

function repositoryFactory({ databaseUrl }) {
  assert.equal(databaseUrl, "postgres://employee-auth-qa/not-used");
  return {
    async inspectEmployee(employeeId) {
      return employees.get(employeeId) || null;
    },
    async setPinHash({ employeeId, pinHash }) {
      const previous = credentials.get(employeeId);
      const authVersion = Number(previous?.authVersion || 0) + 1;
      credentials.set(employeeId, { pinHash, authVersion });
      return { employeeId, authVersion };
    },
    async revokeSessions(employeeId) {
      const current = credentials.get(employeeId);
      if (!current) return { revoked: false, authVersion: 0 };
      current.authVersion += 1;
      return { revoked: true, authVersion: current.authVersion };
    },
    async close() { closeCalls += 1; },
  };
}

function outputCapture() {
  let value = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      value += chunk.toString();
      callback();
    },
  });
  return { stream, value: () => value };
}

async function invoke(argv, pin = "") {
  const output = outputCapture();
  const result = await runEmployeeAuthCredentialAdmin({
    argv,
    env: {},
    stdin: Readable.from(pin ? [pin] : []),
    stdout: output.stream,
    getuid: () => 0,
    requiredOwnerUid: ownerUid,
    repositoryFactory,
  });
  return { result, output: output.value() };
}

try {
  const plaintextPin = "13579";
  const provisioned = await invoke([
    "set-pin",
    "--employee-id=employee-active",
    "--pin-stdin",
    `--database-env-file=${databaseEnvFile}`,
  ], `${plaintextPin}\n`);
  assert.equal(provisioned.result.ok, true);
  assert.equal(provisioned.result.authVersion, 1);
  assert.doesNotMatch(provisioned.output, new RegExp(plaintextPin));
  const stored = credentials.get("employee-active");
  assert.notEqual(stored.pinHash, plaintextPin);
  assert.match(stored.pinHash, /^scrypt:v1:/);
  assert.equal(await verifyEmployeePin(plaintextPin, stored.pinHash), true);

  const revoked = await invoke([
    "revoke-sessions",
    "--employee-id=employee-active",
    `--database-env-file=${databaseEnvFile}`,
  ]);
  assert.equal(revoked.result.authVersion, 2);
  assert.match(revoked.output, /sessions revoked/i);

  const fileProvisioned = await invoke([
    "set-pin",
    "--employee-id=employee-active",
    `--credential-file=${credentialFile}`,
    `--database-env-file=${databaseEnvFile}`,
  ]);
  assert.equal(fileProvisioned.result.authVersion, 3);
  assert.equal(await verifyEmployeePin("86420", credentials.get("employee-active").pinHash), true);
  assert.equal(await readFile(credentialFile, "utf-8"), "86420\n", "CLI must never rewrite plaintext credential input");

  await assert.rejects(() => invoke([
    "set-pin",
    "--employee-id=missing",
    "--pin-stdin",
    `--database-env-file=${databaseEnvFile}`,
  ], "11111\n"), /Employee does not exist/);

  await assert.rejects(() => invoke([
    "set-pin",
    "--employee-id=employee-inactive",
    "--pin-stdin",
    `--database-env-file=${databaseEnvFile}`,
  ], "11111\n"), /Employee is inactive/);

  await assert.rejects(() => invoke([
    "set-pin",
    "--employee-id=employee-active",
    `--credential-file=${unsafeCredentialFile}`,
    `--database-env-file=${databaseEnvFile}`,
  ]), /group\/other/);

  await assert.rejects(() => invoke([
    "set-pin",
    "--employee-id=employee-active",
    `--credential-file=${credentialSymlink}`,
    `--database-env-file=${databaseEnvFile}`,
  ]), /regular file|symbolic link/);

  await assert.rejects(() => invoke([
    "set-pin",
    "--employee-id=employee-active",
    "--pin=plaintext-must-not-be-accepted",
    `--database-env-file=${databaseEnvFile}`,
  ]), (error) => {
    assert.doesNotMatch(error.message, /plaintext-must-not-be-accepted/);
    return /unsafe argument: --pin/.test(error.message);
  });

  await assert.rejects(() => runEmployeeAuthCredentialAdmin({
    argv: ["revoke-sessions", "--employee-id=employee-active"],
    env: { MES_DOMAIN_DATABASE_URL: "postgres://qa/not-used" },
    stdin: Readable.from([]),
    stdout: outputCapture().stream,
    getuid: () => 1001,
    repositoryFactory,
  }), /must run as root/);

  await chmod(databaseEnvFile, 0o644);
  await assert.rejects(() => invoke([
    "revoke-sessions",
    "--employee-id=employee-active",
    `--database-env-file=${databaseEnvFile}`,
  ]), /group\/other/);

  assert.ok(closeCalls >= 5, "Every opened repository must close even after an operational error");
} finally {
  await rm(qaRoot, { recursive: true, force: true });
}

console.log("Employee credential admin QA passed: root gate, employee existence, stdin/private-file PIN, scrypt-only persistence and revocation.");
