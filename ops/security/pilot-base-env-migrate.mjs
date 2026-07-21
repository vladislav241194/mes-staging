import { constants } from "node:fs";
import { access, chmod, chown, lstat, open, readFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, normalize } from "node:path";
import { pathToFileURL } from "node:url";

export const BASE_ENV_KEYS = [
  "NODE_ENV",
  "APP_ENV",
  "HOST",
  "PORT",
  "APP_BASE_URL",
  "MES_SHARED_STATE_DIR",
  "MES_BACKUP_DIR",
  "MES_AUDIT_LOG_PATH",
  "MES_ALLOW_DESTRUCTIVE_ACTIONS",
  "MES_ENABLE_WORKFLOW_PRESET_RESTORE",
  "MES_BACKUP_BEFORE_SHARED_STATE_WRITE",
  "BACKUP_RETENTION_DAYS",
];
const ALLOWED = new Set(BASE_ENV_KEYS);

function unquote(value) {
  const text = String(value || "");
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

export function parseStrictEnv(source, label = "env") {
  const entries = new Map();
  for (const [index, rawLine] of String(source || "").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${label}:${index + 1} is not strict KEY=value syntax`);
    if (!ALLOWED.has(match[1])) throw new Error(`${label} contains forbidden or unclassified key ${match[1]}`);
    if (entries.has(match[1])) throw new Error(`${label} contains duplicate key ${match[1]}`);
    entries.set(match[1], unquote(match[2]));
  }
  return entries;
}

export function parseSystemdEnvironment(source, label = "unit") {
  const entries = new Map();
  for (const [index, rawLine] of String(source || "").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line.startsWith("Environment=")) continue;
    const assignment = unquote(line.slice("Environment=".length));
    const match = assignment.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${label}:${index + 1} has unsupported Environment syntax`);
    if (!ALLOWED.has(match[1])) throw new Error(`${label} contains forbidden or unclassified key ${match[1]}`);
    entries.set(match[1], match[2]);
  }
  return entries;
}

function assertPilotPath(value, label) {
  if (!isAbsolute(value) || normalize(value) !== value || !value.startsWith("/srv/mes/pilot/")) {
    throw new Error(`${label} must be a normalized absolute Pilot path`);
  }
}

export function buildPilotBaseEnv({ defaults, unit, hardening = new Map(), existing = new Map() }) {
  const entries = new Map(defaults);
  for (const overlay of [unit, hardening, existing]) {
    for (const [key, value] of overlay) entries.set(key, value);
  }
  const missing = BASE_ENV_KEYS.filter((key) => !String(entries.get(key) || "").trim());
  if (missing.length) throw new Error(`Pilot base env is missing ${missing.join(",")}`);
  if (entries.get("NODE_ENV") !== "production" || entries.get("APP_ENV") !== "pilot") throw new Error("Pilot base identity must remain production/pilot");
  if (entries.get("HOST") !== "127.0.0.1") throw new Error("Pilot HOST must remain loopback-only");
  const port = Number(entries.get("PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Pilot PORT is invalid");
  const publicUrl = new URL(entries.get("APP_BASE_URL"));
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password) throw new Error("Pilot APP_BASE_URL must be credential-free HTTPS");
  assertPilotPath(entries.get("MES_SHARED_STATE_DIR"), "MES_SHARED_STATE_DIR");
  assertPilotPath(entries.get("MES_BACKUP_DIR"), "MES_BACKUP_DIR");
  assertPilotPath(entries.get("MES_AUDIT_LOG_PATH"), "MES_AUDIT_LOG_PATH");
  for (const key of ["MES_ALLOW_DESTRUCTIVE_ACTIONS", "MES_ENABLE_WORKFLOW_PRESET_RESTORE", "MES_BACKUP_BEFORE_SHARED_STATE_WRITE"]) {
    if (!/^(?:true|false)$/.test(entries.get(key))) throw new Error(`${key} must be a boolean`);
  }
  if (entries.get("MES_ALLOW_DESTRUCTIVE_ACTIONS") !== "false" || entries.get("MES_ENABLE_WORKFLOW_PRESET_RESTORE") !== "false") {
    throw new Error("Pilot destructive/restore gates must remain disabled during UID cutover");
  }
  if (!/^[1-9][0-9]{0,3}$/.test(entries.get("BACKUP_RETENTION_DAYS"))) throw new Error("BACKUP_RETENTION_DAYS is invalid");
  return new Map(BASE_ENV_KEYS.map((key) => [key, entries.get(key)]));
}

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }

async function assertRegular(path, { optional = false } = {}) {
  if (optional && !await exists(path)) return false;
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${path} must be a regular non-symlink file`);
  return true;
}

async function writeAtomicRoot(path, entries) {
  if (await exists(path)) await assertRegular(path);
  const temporary = `${path}.tmp.${process.pid}.${randomBytes(8).toString("hex")}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`# Root-owned Pilot base environment; secrets and command flags are forbidden.\n${[...entries].map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  await chown(temporary, 0, 0);
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

async function main() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) throw new Error("Pilot base env migration must run as root");
  const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
    const match = argument.match(/^--([a-z-]+)=(\/.*)$/);
    if (!match) throw new Error(`Unsupported argument ${argument.split("=")[0]}`);
    return [match[1], match[2]];
  }));
  for (const key of ["defaults", "unit", "hardening", "existing", "output"]) if (!options[key]) throw new Error(`--${key}=<absolute-path> is required`);
  await assertRegular(options.defaults);
  await assertRegular(options.unit);
  const hardeningSource = await assertRegular(options.hardening, { optional: true }) ? await readFile(options.hardening, "utf8") : "";
  const existingSource = await assertRegular(options.existing, { optional: true }) ? await readFile(options.existing, "utf8") : "";
  const entries = buildPilotBaseEnv({
    defaults: parseStrictEnv(await readFile(options.defaults, "utf8"), options.defaults),
    unit: parseSystemdEnvironment(await readFile(options.unit, "utf8"), options.unit),
    hardening: parseSystemdEnvironment(hardeningSource, options.hardening),
    existing: parseStrictEnv(existingSource, options.existing),
  });
  await writeAtomicRoot(options.output, entries);
  console.log(JSON.stringify({ ok: true, preservedKeys: [...entries.keys()] }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error?.message || error); process.exit(1); });
}
