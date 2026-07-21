import { lstat, readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createEmployeeAuthRepository } from "./domain-employee-auth-repository.mjs";
import { createEmployeePinHash } from "./employee-auth-crypto.mjs";

const MAX_PIN_BYTES = 128;
const ALLOWED_DATABASE_ENV_KEYS = new Set([
  "MES_DOMAIN_MIGRATOR_DATABASE_URL",
  "MES_DOMAIN_DATABASE_URL",
  "DATABASE_URL",
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/employee-auth-credential-admin.mjs set-pin --employee-id=<id> --pin-stdin [--database-env-file=/etc/mes/mes-pilot-domain.env]",
    "  node scripts/employee-auth-credential-admin.mjs set-pin --employee-id=<id> --credential-file=/run/credentials/mes_employee_pin [--database-env-file=...]",
    "  node scripts/employee-auth-credential-admin.mjs revoke-sessions --employee-id=<id> [--database-env-file=...]",
    "  node scripts/employee-auth-credential-admin.mjs delete-credential --employee-id=<id> [--database-env-file=...]",
    "",
    "PIN values are never accepted in argv or environment variables.",
  ].join("\n");
}

function parseArgs(argv = []) {
  const args = [...argv];
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const action = args.shift() || "";
  const parsed = {
    action,
    employeeId: "",
    pinStdin: false,
    credentialFile: "",
    databaseEnvFile: "",
  };
  for (const arg of args) {
    if (arg.startsWith("--employee-id=")) parsed.employeeId = arg.slice("--employee-id=".length).trim();
    else if (arg === "--pin-stdin") parsed.pinStdin = true;
    else if (arg.startsWith("--credential-file=")) parsed.credentialFile = arg.slice("--credential-file=".length).trim();
    else if (arg.startsWith("--database-env-file=")) parsed.databaseEnvFile = arg.slice("--database-env-file=".length).trim();
    else throw new Error(`Unknown or unsafe argument: ${arg.split("=")[0]}`);
  }
  if (!["set-pin", "revoke-sessions", "delete-credential"].includes(parsed.action)) {
    throw new Error("Action must be set-pin, revoke-sessions or delete-credential");
  }
  if (!parsed.employeeId || parsed.employeeId.length > 256) throw new Error("A bounded --employee-id is required");
  if (parsed.action === "set-pin" && Number(parsed.pinStdin) + Number(Boolean(parsed.credentialFile)) !== 1) {
    throw new Error("set-pin requires exactly one of --pin-stdin or --credential-file");
  }
  if (["revoke-sessions", "delete-credential"].includes(parsed.action) && (parsed.pinStdin || parsed.credentialFile)) {
    throw new Error(`${parsed.action} does not accept PIN input`);
  }
  return parsed;
}

function assertRootOwnedPrivateFile(fileStat, label, requiredOwnerUid = 0) {
  if (!fileStat.isFile()) throw new Error(`${label} must be a regular file`);
  if (fileStat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if (Number(fileStat.uid) !== Number(requiredOwnerUid)) throw new Error(`${label} must be owned by root`);
  if ((fileStat.mode & 0o077) !== 0) throw new Error(`${label} must not be readable or writable by group/other`);
}

function parseSimpleEnvironment(source, label) {
  const result = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${label} contains unsupported shell syntax`);
    if (!ALLOWED_DATABASE_ENV_KEYS.has(match[1])) continue;
    if (Object.prototype.hasOwnProperty.call(result, match[1])) throw new Error(`${label} contains a duplicate database entry`);
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value || /[\r\n\0]/.test(value)) throw new Error(`${label} contains an invalid empty value`);
    result[match[1]] = value;
  }
  return result;
}

async function readPrivateFile(filePath, {
  label,
  requiredOwnerUid = 0,
} = {}) {
  if (!String(filePath || "").startsWith("/")) throw new Error(`${label} path must be absolute`);
  const fileStat = await lstat(filePath);
  assertRootOwnedPrivateFile(fileStat, label, requiredOwnerUid);
  return readFile(filePath, "utf-8");
}

async function readBoundedStdin(stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PIN_BYTES + 2) throw new Error("PIN input is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function normalizePin(source) {
  const pin = String(source || "").replace(/\r?\n$/, "");
  if (!pin || /[\r\n\0]/.test(pin) || Buffer.byteLength(pin, "utf-8") > MAX_PIN_BYTES) {
    throw new Error("PIN must be one non-empty line no longer than 128 bytes");
  }
  return pin;
}

async function resolveDatabaseUrl(env, databaseEnvFile, requiredOwnerUid) {
  const fromProcess = String(
    env.MES_DOMAIN_MIGRATOR_DATABASE_URL
      || env.MES_DOMAIN_DATABASE_URL
      || env.DATABASE_URL
      || "",
  ).trim();
  if (fromProcess && !databaseEnvFile) return fromProcess;
  if (!databaseEnvFile) throw new Error("Database configuration is required through process env or --database-env-file");
  const source = await readPrivateFile(databaseEnvFile, {
    label: "Database environment file",
    requiredOwnerUid,
  });
  const entries = parseSimpleEnvironment(source, "Database environment file");
  const value = String(
    entries.MES_DOMAIN_MIGRATOR_DATABASE_URL
      || entries.MES_DOMAIN_DATABASE_URL
      || entries.DATABASE_URL
      || "",
  ).trim();
  if (!value) throw new Error("Database environment file does not configure a database URL");
  return value;
}

export async function runEmployeeAuthCredentialAdmin({
  argv = [],
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  getuid = () => process.getuid?.(),
  requiredOwnerUid = 0,
  repositoryFactory = createEmployeeAuthRepository,
  createPinHash = createEmployeePinHash,
} = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    stdout.write(`${usage()}\n`);
    return { ok: true, help: true };
  }
  if (Number(getuid()) !== 0) throw new Error("Employee credential administration must run as root");
  const databaseUrl = await resolveDatabaseUrl(env, parsed.databaseEnvFile, requiredOwnerUid);
  let repository;
  try {
    repository = repositoryFactory({ databaseUrl });
    const employee = await repository.inspectEmployee(parsed.employeeId);
    if (!employee) throw new Error(`Employee does not exist: ${parsed.employeeId}`);
    if (parsed.action === "revoke-sessions") {
      const result = await repository.revokeSessions(parsed.employeeId);
      if (!result?.revoked) throw new Error("Employee credential does not exist; there are no sessions to revoke");
      stdout.write(`Employee sessions revoked: ${parsed.employeeId}; auth version ${result.authVersion}.\n`);
      return { ok: true, action: parsed.action, employeeId: parsed.employeeId, authVersion: result.authVersion };
    }

    if (parsed.action === "delete-credential") {
      if (typeof repository.deleteCredential !== "function") {
        throw new Error("Employee credential deletion is unavailable");
      }
      const result = await repository.deleteCredential(parsed.employeeId);
      if (result?.employeeExists !== true) throw new Error(`Employee does not exist: ${parsed.employeeId}`);
      if (result.deleted === true) {
        stdout.write(`Employee credential deleted and sessions revoked: ${parsed.employeeId}; terminal auth version ${result.authVersion}.\n`);
      } else if (result.alreadyAbsent === true) {
        stdout.write(`Employee credential already absent: ${parsed.employeeId}; sessions are invalid.\n`);
      } else {
        throw new Error("Employee credential deletion did not reach a terminal state");
      }
      return {
        ok: true,
        action: parsed.action,
        employeeId: parsed.employeeId,
        deleted: result.deleted === true,
        alreadyAbsent: result.alreadyAbsent === true,
        sessionsRevoked: result.sessionsRevoked === true,
        authVersion: Number(result.authVersion || 0),
      };
    }

    if (employee.active !== true) throw new Error(`Employee is inactive: ${parsed.employeeId}`);

    const rawPin = parsed.pinStdin
      ? await readBoundedStdin(stdin)
      : await readPrivateFile(parsed.credentialFile, {
        label: "PIN credential file",
        requiredOwnerUid,
      });
    const pin = normalizePin(rawPin);
    const pinHash = await createPinHash(pin);
    const result = await repository.setPinHash({ employeeId: parsed.employeeId, pinHash });
    stdout.write(`Employee PIN hash provisioned: ${parsed.employeeId}; auth version ${result.authVersion}.\n`);
    return { ok: true, action: parsed.action, employeeId: parsed.employeeId, authVersion: result.authVersion };
  } finally {
    await repository?.close?.();
  }
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href;
if (invokedAsScript) {
  runEmployeeAuthCredentialAdmin({ argv: process.argv.slice(2) }).catch((error) => {
    console.error(`Employee credential administration failed: ${error?.message || "unknown error"}`);
    process.exitCode = 1;
  });
}
