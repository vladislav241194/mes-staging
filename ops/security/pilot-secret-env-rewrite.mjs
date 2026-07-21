import { constants } from "node:fs";
import { access, chmod, chown, lstat, open, readFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

function arg(name, fallback = "") {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
}

const mode = arg("--mode");
if (!["split-and-rotate", "rotate-sessions"].includes(mode)) {
  throw new Error("Usage: pilot-secret-env-rewrite.mjs --mode=split-and-rotate|rotate-sessions [--*-path=/absolute/path]");
}

const paths = {
  domain: arg("--domain-path", "/etc/mes/mes-pilot-domain.env"),
  migrator: arg("--migrator-path", "/etc/mes/mes-pilot-domain-migrator.env"),
  adminDropin: arg("--admin-dropin-path", "/etc/systemd/system/mes-pilot.service.d/20-admin-auth.conf"),
  admin: arg("--admin-path", "/etc/mes/mes-pilot-admin-auth.env"),
  public: arg("--public-path", "/etc/mes/mes-pilot-public-auth.env"),
  employee: arg("--employee-path", "/etc/mes/mes-pilot-employee-auth.env"),
};

for (const path of Object.values(paths)) {
  if (!path.startsWith("/")) throw new Error(`Secret path must be absolute: ${path}`);
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

function parseEnv(source, label) {
  const entries = new Map();
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${label}:${index + 1} is not a strict KEY=value entry`);
    if (entries.has(match[1])) throw new Error(`${label} contains duplicate key ${match[1]}`);
    if (match[2].includes("\0")) throw new Error(`${label} contains a NUL byte`);
    entries.set(match[1], match[2]);
  }
  return entries;
}

function parseInlineAdminDropin(source, label) {
  const entries = new Map();
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line.startsWith("Environment=")) continue;
    let assignment = line.slice("Environment=".length);
    if ((assignment.startsWith('"') && assignment.endsWith('"')) || (assignment.startsWith("'") && assignment.endsWith("'"))) {
      assignment = assignment.slice(1, -1);
    }
    const match = assignment.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${label}:${index + 1} has an unsupported Environment assignment`);
    if (entries.has(match[1])) throw new Error(`${label} contains duplicate key ${match[1]}`);
    entries.set(match[1], match[2]);
  }
  return entries;
}

function assertExactKeys(entries, allowed, label, { require = allowed } = {}) {
  const unexpected = [...entries.keys()].filter((key) => !allowed.includes(key));
  const missing = require.filter((key) => !entries.has(key) || !String(entries.get(key)).trim());
  if (unexpected.length || missing.length) {
    throw new Error(`${label} key contract failed; unexpected=[${unexpected.join(",")}], missing=[${missing.join(",")}]`);
  }
}

async function writeAtomicRootEnv(path, entries) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Refusing non-regular secret target ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const temporary = join(dirname(path), `.${path.split("/").pop()}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    const body = [
      "# Root-owned MES Pilot secret environment. Managed atomically; do not edit inline in systemd.",
      ...entries.map(([key, value]) => `${key}=${value}`),
      "",
    ].join("\n");
    await handle.writeFile(body, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chown(temporary, 0, 0);
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

const adminAllowed = ["MES_ADMIN_USERNAME", "MES_ADMIN_PASSWORD_HASH", "MES_ADMIN_SESSION_SECRET"];
const publicAllowed = [
  "MES_PUBLIC_AUTH_HOSTS",
  "MES_PUBLIC_AUTH_LABEL",
  "MES_PUBLIC_AUTH_DESCRIPTION",
  "MES_PUBLIC_AUTH_USERNAME",
  "MES_PUBLIC_AUTH_PASSWORD_HASH",
  "MES_PUBLIC_AUTH_SESSION_SECRET",
  "MES_PUBLIC_AUTH_SESSION_TTL_SECONDS",
];
const employeeAllowed = [
  "MES_EMPLOYEE_AUTH_HOSTS",
  "MES_EMPLOYEE_AUTH_SESSION_TTL_SECONDS",
  "MES_EMPLOYEE_AUTH_MAX_ATTEMPTS",
  "MES_EMPLOYEE_AUTH_LOCK_SECONDS",
  "MES_EMPLOYEE_AUTH_SESSION_SECRET",
];

if (mode === "split-and-rotate") {
  const domainEntries = parseEnv(await readFile(paths.domain, "utf8"), paths.domain);
  const allowedCombinedKeys = ["DATABASE_URL", "MES_DOMAIN_MIGRATOR_DATABASE_URL"];
  const ignoredCommandKeys = [...domainEntries.keys()].filter((key) => /^MES_ENABLE_.*COMMAND/.test(key));
  const unexpected = [...domainEntries.keys()].filter((key) => !allowedCombinedKeys.includes(key) && !ignoredCommandKeys.includes(key));
  if (unexpected.length) throw new Error(`Combined domain env has unclassified keys: ${unexpected.join(",")}`);
  const missing = allowedCombinedKeys.filter((key) => !String(domainEntries.get(key) || "").trim());
  if (missing.length) throw new Error(`Combined domain env is missing: ${missing.join(",")}`);
  await writeAtomicRootEnv(paths.domain, [["DATABASE_URL", domainEntries.get("DATABASE_URL")]]);
  await writeAtomicRootEnv(paths.migrator, [["MES_DOMAIN_MIGRATOR_DATABASE_URL", domainEntries.get("MES_DOMAIN_MIGRATOR_DATABASE_URL")]]);
}

const adminEntries = await exists(paths.admin)
  ? parseEnv(await readFile(paths.admin, "utf8"), paths.admin)
  : parseInlineAdminDropin(await readFile(paths.adminDropin, "utf8"), paths.adminDropin);
assertExactKeys(adminEntries, adminAllowed, "admin auth", { require: ["MES_ADMIN_USERNAME", "MES_ADMIN_PASSWORD_HASH", "MES_ADMIN_SESSION_SECRET"] });
adminEntries.set("MES_ADMIN_SESSION_SECRET", randomBytes(32).toString("base64url"));

const publicEntries = parseEnv(await readFile(paths.public, "utf8"), paths.public);
assertExactKeys(publicEntries, publicAllowed, "public auth", { require: ["MES_PUBLIC_AUTH_USERNAME", "MES_PUBLIC_AUTH_PASSWORD_HASH", "MES_PUBLIC_AUTH_SESSION_SECRET"] });
publicEntries.set("MES_PUBLIC_AUTH_SESSION_SECRET", randomBytes(32).toString("base64url"));

const employeeEntries = parseEnv(await readFile(paths.employee, "utf8"), paths.employee);
assertExactKeys(employeeEntries, employeeAllowed, "employee auth", { require: employeeAllowed });
employeeEntries.set("MES_EMPLOYEE_AUTH_SESSION_SECRET", randomBytes(32).toString("base64url"));

await writeAtomicRootEnv(paths.admin, adminAllowed.map((key) => [key, adminEntries.get(key)]));
await writeAtomicRootEnv(paths.public, publicAllowed.filter((key) => publicEntries.has(key)).map((key) => [key, publicEntries.get(key)]));
await writeAtomicRootEnv(paths.employee, employeeAllowed.map((key) => [key, employeeEntries.get(key)]));

console.log(JSON.stringify({
  ok: true,
  mode,
  domainCredentialSplit: mode === "split-and-rotate",
  droppedCommandKeys: mode === "split-and-rotate" ? true : undefined,
  rotated: ["MES_ADMIN_SESSION_SECRET", "MES_PUBLIC_AUTH_SESSION_SECRET", "MES_EMPLOYEE_AUTH_SESSION_SECRET"],
  preservedPasswordHashes: ["MES_ADMIN_PASSWORD_HASH", "MES_PUBLIC_AUTH_PASSWORD_HASH"],
}));
