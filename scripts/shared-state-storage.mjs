import { appendFile, chmod, chown, copyFile, mkdir, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { REACT_RUNTIME_EVALUATION_ENV } from "./react-runtime-policy.mjs";

const PROTECTED_APP_ENVS = new Set(["pilot", "staging", "user-testing", "production"]);
const DESTRUCTIVE_ACTION_RE = /\b(reset|restore|seed|snapshot|wipe|clear|delete|destructive|initial-state|initial-bootstrap-snapshot)\b/i;

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

function pause(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function withSharedStateFileLock(filePath, action, {
  timeoutMs = 12_000,
  retryDelayMs = 25,
  staleMs = 120_000,
} = {}) {
  if (!filePath) throw new Error("Shared state file path is required for a file lock");
  if (typeof action !== "function") throw new Error("Shared state file lock requires an action callback");
  const lockPath = `${filePath}.lock`;
  const startedAt = Date.now();
  await mkdir(dirname(lockPath), { recursive: true });

  while (true) {
    let acquired = false;
    try {
      await mkdir(lockPath);
      acquired = true;
      try {
        await writeFile(join(lockPath, "owner.json"), `${JSON.stringify({
          processId: process.pid,
          acquiredAt: new Date().toISOString(),
        })}\n`, "utf-8");
        return await action({ lockPath });
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (acquired) throw error;
      if (error?.code !== "EEXIST") throw error;
      const lockStat = await stat(lockPath).catch((statError) => statError?.code === "ENOENT" ? null : Promise.reject(statError));
      if (lockStat && Date.now() - Number(lockStat.mtimeMs || 0) > staleMs) {
        // Never steal a lock based on time alone: a slow backup or a stalled
        // filesystem must fail closed rather than allowing a second writer to
        // overwrite a still-running promotion. An operator can inspect and
        // clear a confirmed orphan lock under controlled conditions.
        const staleError = new Error(`Shared-state file lock appears stale and was not removed automatically: ${lockPath}`);
        staleError.code = "MES_SHARED_STATE_LOCK_STALE";
        throw staleError;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        const timeoutError = new Error(`Timed out waiting for shared-state file lock: ${lockPath}`);
        timeoutError.code = "MES_SHARED_STATE_LOCK_TIMEOUT";
        throw timeoutError;
      }
      await pause(retryDelayMs + Math.floor(Math.random() * retryDelayMs));
    }
  }
}

export async function writeSharedStateFileAtomic(filePath, payload) {
  if (!filePath) throw new Error("Shared state file path is required for an atomic write");
  const directory = dirname(filePath);
  const serialized = typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`;
  const tempPath = join(directory, `.${basename(filePath)}.tmp-${process.pid}-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const existing = await stat(filePath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  let handle = null;
  try {
    handle = await open(tempPath, "w", 0o600);
    await handle.writeFile(serialized, "utf-8");
    await handle.sync();
    await handle.close();
    handle = null;
    if (existing) {
      await chmod(tempPath, Number(existing.mode) & 0o777);
      // A root-controlled promotion must not convert deploy-owned shared
      // state into an unreadable root:root file after the atomic rename.
      if (typeof process.getuid === "function" && process.getuid() === 0) {
        await chown(tempPath, Number(existing.uid), Number(existing.gid));
      }
    }
    await rename(tempPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
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

export function isBootstrapSnapshotRestoreEnabled(env = process.env) {
  const explicit = normalizeEnvValue(env.MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE).toLowerCase();
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
    bootstrapSnapshotRestoreEnabled: isBootstrapSnapshotRestoreEnabled(env),
    destructiveActionsAllowed: isDestructiveActionsAllowed(env),
  };
}

export function getPublicRuntimeConfig(env = process.env, { reactRuntimePolicy = null } = {}) {
  const config = {
    APP_ENV: getAppEnv(env),
    APP_BASE_URL: normalizeEnvValue(env.APP_BASE_URL),
    MES_SHARED_STATE_KEY: getSharedStateKey(env),
    MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE: isBootstrapSnapshotRestoreEnabled(env),
    MES_ALLOW_DESTRUCTIVE_ACTIONS: isDestructiveActionsAllowed(env),
    MES_REACT_RUNTIME_POLICY: reactRuntimePolicy,
    MES_REACT_NOMENCLATURE: normalizeEnvValue(env.MES_REACT_NOMENCLATURE) === "1",
    MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION) === "1",
    MES_REACT_NOMENCLATURE_WRITE_EVALUATION: normalizeEnvValue(env.MES_REACT_NOMENCLATURE_WRITE_EVALUATION) === "1",
    MES_REACT_BOARDS: normalizeEnvValue(env.MES_REACT_BOARDS) === "1",
    MES_REACT_BOARDS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_BOARDS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_EMPLOYEES: normalizeEnvValue(env.MES_REACT_STRUCTURE_EMPLOYEES) === "1",
    MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_POSITIONS: normalizeEnvValue(env.MES_REACT_STRUCTURE_POSITIONS) === "1",
    MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_ORG_UNITS: normalizeEnvValue(env.MES_REACT_STRUCTURE_ORG_UNITS) === "1",
    MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_WORK_CENTERS: normalizeEnvValue(env.MES_REACT_STRUCTURE_WORK_CENTERS) === "1",
    MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_EQUIPMENT: normalizeEnvValue(env.MES_REACT_STRUCTURE_EQUIPMENT) === "1",
    MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES: normalizeEnvValue(env.MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES) === "1",
    MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION) === "1",
    MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS: normalizeEnvValue(env.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS) === "1",
    MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_WEEKLY_PRODUCTION_CONTROL: normalizeEnvValue(env.MES_REACT_WEEKLY_PRODUCTION_CONTROL) === "1",
    MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION) === "1",
    MES_REACT_TIMESHEET: normalizeEnvValue(env.MES_REACT_TIMESHEET) === "1",
    MES_REACT_TIMESHEET_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_TIMESHEET_READ_ONLY_EVALUATION) === "1",
    MES_REACT_PLANNING_WORKBENCH: normalizeEnvValue(env.MES_REACT_PLANNING_WORKBENCH) === "1",
    MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION) === "1",
    MES_REACT_SHIFT_WORK_ORDERS: normalizeEnvValue(env.MES_REACT_SHIFT_WORK_ORDERS) === "1",
    MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_SHIFT_MASTER_BOARD: normalizeEnvValue(env.MES_REACT_SHIFT_MASTER_BOARD) === "1",
    MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION) === "1",
    MES_REACT_EMPLOYEE_DESKTOP: normalizeEnvValue(env.MES_REACT_EMPLOYEE_DESKTOP) === "1",
    MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION) === "1",
    MES_REACT_AUTH_PICKER: normalizeEnvValue(env.MES_REACT_AUTH_PICKER) === "1",
    MES_REACT_AUTH_PICKER_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_AUTH_PICKER_READ_ONLY_EVALUATION) === "1",
    MES_REACT_CONTOUR_ADMIN: normalizeEnvValue(env.MES_REACT_CONTOUR_ADMIN) === "1",
    MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION) === "1",
    MES_REACT_SPECIFICATIONS2: normalizeEnvValue(env.MES_REACT_SPECIFICATIONS2) === "1",
    MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION) === "1",
    MES_REACT_GANTT: normalizeEnvValue(env.MES_REACT_GANTT) === "1",
    MES_REACT_GANTT_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_GANTT_READ_ONLY_EVALUATION) === "1",
    MES_REACT_ROLES: normalizeEnvValue(env.MES_REACT_ROLES) === "1",
    MES_REACT_ROLES_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_ROLES_READ_ONLY_EVALUATION) === "1",
    MES_REACT_DIRECTORY_COMPONENT_TYPES: normalizeEnvValue(env.MES_REACT_DIRECTORY_COMPONENT_TYPES) === "1",
    MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION) === "1",
    MES_REACT_DIRECTORY_OPERATIONS: normalizeEnvValue(env.MES_REACT_DIRECTORY_OPERATIONS) === "1",
    MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION) === "1",
    MES_REACT_DIRECTORY_NOMENCLATURE_TYPES: normalizeEnvValue(env.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES) === "1",
    MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION) === "1",
    MES_REACT_DIRECTORY_STATUSES: normalizeEnvValue(env.MES_REACT_DIRECTORY_STATUSES) === "1",
    MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION: normalizeEnvValue(env.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION) === "1",
    // These booleans publish rollout authority, never credentials or database
    // configuration. Clients use them to fail closed onto the authenticated
    // command path instead of attempting a legacy snapshot write.
    MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY: normalizeEnvValue(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS) === "1",
    MES_DIRECTORY_CLUSTER_SERVER_COMMANDS_PRIMARY: normalizeEnvValue(env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS) === "1",
    MES_EMPLOYEE_AUTH_AVAILABLE: [
      env.MES_ENABLE_EMPLOYEE_AUTH,
      env.MES_EMPLOYEE_AUTH_ENABLED,
    ].some((value) => normalizeEnvValue(value) === "1")
      && Boolean(normalizeEnvValue(env.MES_EMPLOYEE_AUTH_SESSION_SECRET))
      && Boolean(normalizeEnvValue(env.MES_EMPLOYEE_AUTH_HOSTS || env.MES_PUBLIC_AUTH_HOSTS)),
    // Employee auth may be available for a scoped command elevation without
    // replacing the normal MES login gate. A global gate is opt-in only.
    MES_EMPLOYEE_AUTH_REQUIRED: normalizeEnvValue(env.MES_REQUIRE_EMPLOYEE_AUTH_GATE) === "1",
    // Non-secret rollout policy.  A client must fail closed when publication
    // is configured as server-primary but cannot reach the capability API.
    MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY: normalizeEnvValue(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS) === "1",
  };
  if (!reactRuntimePolicy?.surfaces) return config;
  for (const [surfaceId, contract] of Object.entries(REACT_RUNTIME_EVALUATION_ENV)) {
    const evaluationAllowed = reactRuntimePolicy.surfaces[surfaceId] === "evaluation";
    config[contract.feature] = evaluationAllowed && config[contract.feature] === true;
    for (const permission of contract.permissions) {
      config[permission] = evaluationAllowed && config[permission] === true;
    }
  }
  return config;
}

export function renderRuntimeConfigScript(env = process.env, options = {}) {
  const json = JSON.stringify(getPublicRuntimeConfig(env, options)).replace(/</g, "\\u003c");
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

  // copyFile() creates a destination with permissions derived from the source.
  // Compatibility snapshots contain personnel and production data, so create
  // the target ourselves with a restrictive mode before copying any bytes.
  const backupHandle = await open(backupPath, "wx", 0o600);
  await backupHandle.close();
  try {
    await copyFile(filePath, backupPath);
    await chmod(backupPath, 0o600);
  } catch (error) {
    await rm(backupPath, { force: true }).catch(() => {});
    throw error;
  }
  await writeFile(metaPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    appEnv: getAppEnv(env),
    sharedStateKey: getSharedStateKey(env),
    sourcePath: filePath,
    backupPath,
    reason,
    actor,
  }, null, 2)}\n`, { encoding: "utf-8", flag: "wx", mode: 0o600 });

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
