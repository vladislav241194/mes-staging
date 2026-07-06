import { appendFile, copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

const PROTECTED_APP_ENVS = new Set(["pilot", "staging", "user-testing", "production"]);
const DESTRUCTIVE_ACTION_RE = /\b(reset|restore|seed|preset|wipe|clear|delete|destructive|initial-state|initial-preset)\b/i;

function normalizeEnvValue(value = "") {
  return String(value || "").trim();
}

function safeSlug(value = "default") {
  return normalizeEnvValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

function resolvePath(value, baseDir = process.cwd()) {
  if (!value) return "";
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function getAppEnv(env = process.env) {
  return normalizeEnvValue(env.APP_ENV || env.MES_APP_ENV || "local").toLowerCase() || "local";
}

export function isProtectedAppEnv(env = process.env) {
  return PROTECTED_APP_ENVS.has(getAppEnv(env));
}

export function isDestructiveActionsAllowed(env = process.env) {
  return normalizeEnvValue(env.MES_ALLOW_DESTRUCTIVE_ACTIONS).toLowerCase() === "true";
}

export function isWorkflowPresetRestoreEnabled(env = process.env) {
  const explicit = normalizeEnvValue(env.MES_ENABLE_WORKFLOW_PRESET_RESTORE).toLowerCase();
  if (explicit) return explicit === "true";
  return !isProtectedAppEnv(env);
}

export function getSharedStateKey(env = process.env) {
  return normalizeEnvValue(env.MES_SHARED_STATE_KEY) || `mes-${safeSlug(getAppEnv(env))}-shared-state-v1`;
}

export function isSharedStateActionDestructive(action = "") {
  return DESTRUCTIVE_ACTION_RE.test(String(action || ""));
}

export function resolveSharedStateFilePath({ projectRoot = process.cwd(), fallbackFile = "", env = process.env } = {}) {
  const explicitFile = normalizeEnvValue(env.MES_SHARED_STATE_FILE);
  if (explicitFile) return resolvePath(explicitFile, projectRoot);

  const stateDir = normalizeEnvValue(env.MES_SHARED_STATE_DIR);
  if (stateDir) {
    return join(resolvePath(stateDir, projectRoot), `${safeSlug(getSharedStateKey(env))}.json`);
  }

  return fallbackFile ? resolvePath(fallbackFile, projectRoot) : "";
}

export function resolveSharedStateBackupDir({ projectRoot = process.cwd(), sharedStateFile = "", env = process.env } = {}) {
  const explicitDir = normalizeEnvValue(env.MES_BACKUP_DIR);
  if (explicitDir) return resolvePath(explicitDir, projectRoot);

  const stateDir = normalizeEnvValue(env.MES_SHARED_STATE_DIR);
  if (stateDir) return join(resolvePath(stateDir, projectRoot), "_backups");

  if (sharedStateFile) return join(dirname(sharedStateFile), "_backups");
  return join(projectRoot, ".mes-backups");
}

export function resolveSharedStateAuditLogPath({ projectRoot = process.cwd(), sharedStateFile = "", env = process.env } = {}) {
  const explicitPath = normalizeEnvValue(env.MES_AUDIT_LOG_PATH);
  if (explicitPath) return resolvePath(explicitPath, projectRoot);

  if (sharedStateFile) return join(dirname(sharedStateFile), "audit.log");
  return join(projectRoot, ".mes-audit.log");
}

export function getSharedStateServerPaths({ projectRoot = process.cwd(), fallbackFile = "", env = process.env } = {}) {
  const filePath = resolveSharedStateFilePath({ projectRoot, fallbackFile, env });
  return {
    appEnv: getAppEnv(env),
    filePath,
    backupDir: resolveSharedStateBackupDir({ projectRoot, sharedStateFile: filePath, env }),
    auditLogPath: resolveSharedStateAuditLogPath({ projectRoot, sharedStateFile: filePath, env }),
    sharedStateKey: getSharedStateKey(env),
    workflowPresetRestoreEnabled: isWorkflowPresetRestoreEnabled(env),
    destructiveActionsAllowed: isDestructiveActionsAllowed(env),
  };
}

export function getPublicRuntimeConfig(env = process.env) {
  return {
    APP_ENV: getAppEnv(env),
    APP_BASE_URL: normalizeEnvValue(env.APP_BASE_URL),
    MES_SHARED_STATE_KEY: getSharedStateKey(env),
    MES_ENABLE_WORKFLOW_PRESET_RESTORE: isWorkflowPresetRestoreEnabled(env),
    MES_ALLOW_DESTRUCTIVE_ACTIONS: isDestructiveActionsAllowed(env),
  };
}

export function renderRuntimeConfigScript(env = process.env) {
  const json = JSON.stringify(getPublicRuntimeConfig(env)).replace(/</g, "\\u003c");
  return `<script>window.MES_APP_CONFIG=${json};</script>`;
}

export async function appendSharedStateAudit({ auditLogPath = "", event = {} } = {}) {
  if (!auditLogPath) return false;
  await mkdir(dirname(auditLogPath), { recursive: true });
  await appendFile(auditLogPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    ...event,
  })}\n`, "utf-8");
  return true;
}

export async function backupSharedStateFile({
  filePath = "",
  backupDir = "",
  reason = "manual",
  actor = "",
  env = process.env,
  allowMissing = true,
} = {}) {
  if (!filePath) throw new Error("Shared state file path is required");

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Shared state path is not a file");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw error;
  }

  const targetDir = backupDir || resolveSharedStateBackupDir({ sharedStateFile: filePath, env });
  await mkdir(targetDir, { recursive: true });

  const stamp = timestampForFile();
  const key = safeSlug(getSharedStateKey(env));
  const backupPath = join(targetDir, `${stamp}__${key}__${safeSlug(reason)}.json`);
  const metaPath = `${backupPath}.meta.json`;

  await copyFile(filePath, backupPath);
  await writeFile(metaPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    appEnv: getAppEnv(env),
    sharedStateKey: getSharedStateKey(env),
    sourcePath: filePath,
    backupPath,
    reason,
    actor,
  }, null, 2)}\n`, "utf-8");

  return { backupPath, metaPath };
}

export async function listSharedStateBackups({ backupDir = "", env = process.env } = {}) {
  const dir = backupDir || resolveSharedStateBackupDir({ env });
  const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });

  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.endsWith(".meta.json")) continue;
    const backupPath = join(dir, entry.name);
    const fileStat = await stat(backupPath);
    const metaRaw = await readFile(`${backupPath}.meta.json`, "utf-8").catch(() => "");
    let meta = {};
    try {
      meta = metaRaw ? JSON.parse(metaRaw) : {};
    } catch {
      meta = {};
    }
    backups.push({
      name: entry.name,
      path: backupPath,
      size: fileStat.size,
      mtime: fileStat.mtime.toISOString(),
      reason: meta.reason || "",
      appEnv: meta.appEnv || "",
      sharedStateKey: meta.sharedStateKey || "",
    });
  }

  return backups.sort((left, right) => String(right.mtime).localeCompare(String(left.mtime)));
}

export async function pruneSharedStateBackups({ backupDir = "", retentionDays = 0, env = process.env, dryRun = true } = {}) {
  const days = Math.max(0, Number(retentionDays || env.BACKUP_RETENTION_DAYS || 0) || 0);
  if (!days) return { expired: [], deleted: [] };

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const backups = await listSharedStateBackups({ backupDir, env });
  const expired = backups.filter((backup) => Date.parse(backup.mtime) < cutoff);
  const deleted = [];

  if (!dryRun) {
    for (const backup of expired) {
      await unlink(backup.path);
      await unlink(`${backup.path}.meta.json`).catch(() => {});
      deleted.push(backup.path);
    }
  }

  return { expired, deleted };
}
