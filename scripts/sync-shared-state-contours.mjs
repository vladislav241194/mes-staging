import { execFile } from "node:child_process";
import { lstat, mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  appendSharedStateAudit,
  backupSharedStateFile,
  withSharedStateFileLock,
  writeSharedStateFileAtomic,
} from "./shared-state-storage.mjs";
import {
  beginPlanningSnapshotObservation,
  recordPlanningSnapshotObservation,
  resolvePlanningSnapshotObservationEnvironment,
} from "./planning-snapshot-observer.mjs";
import {
  DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY,
  NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY,
} from "./shared-state-endpoint.mjs";

const contourConfigs = {
  staging: {
    appEnv: "staging",
    label: "stage",
    sharedStateKey: "mes-dev-shared-state-v1",
    filePath: "/srv/mes/dev/shared-state/mes-dev-shared-state-v1.json",
    backupDir: "/srv/mes/dev/backups",
    auditLogPath: "/srv/mes/dev/audit/audit.log",
    service: "mes-dev.service",
  },
  pilot: {
    appEnv: "pilot",
    label: "pilot",
    sharedStateKey: "mes-pilot-shared-state-v1",
    filePath: "/srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json",
    backupDir: "/srv/mes/pilot/backups",
    auditLogPath: "/srv/mes/pilot/audit/audit.log",
    service: "mes-pilot.service",
  },
};
const execFileAsync = promisify(execFile);
const OWNER_FLAG_NAMES = Object.freeze([
  "MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS",
  "MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS",
  "MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS",
  "MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS",
  "MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS",
  "MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS",
]);
const SYSTEM_DOMAINS_STORAGE_KEY = "mes-planning-prototype-system-domains-v1";
const AUTHORITY_ROLLOUT_LOCK_PARENT = "/run/lock/mes";
const AUTHORITY_ROLLOUT_LOCK_FILE = `${AUTHORITY_ROLLOUT_LOCK_PARENT}/mes-authority-rollout.lock`;
const AUTHORITY_ROLLOUT_LOCK_HELD_ARG = "--authority-rollout-lock-held";

async function ensureRootAuthorityRolloutLockParent() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    const error = new Error("Stage-to-Pilot contour sync requires uid 0 for the global authority lock");
    error.code = "MES_AUTHORITY_LOCK_REQUIRES_ROOT";
    throw error;
  }
  await mkdir(AUTHORITY_ROLLOUT_LOCK_PARENT, { mode: 0o700 }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  const metadata = await lstat(AUTHORITY_ROLLOUT_LOCK_PARENT);
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== 0
    || metadata.gid !== 0
    || (metadata.mode & 0o777) !== 0o700
    || await realpath(AUTHORITY_ROLLOUT_LOCK_PARENT) !== AUTHORITY_ROLLOUT_LOCK_PARENT) {
    const error = new Error(`Global authority lock parent is not root-controlled: ${AUTHORITY_ROLLOUT_LOCK_PARENT}`);
    error.code = "MES_AUTHORITY_LOCK_PARENT_UNTRUSTED";
    throw error;
  }
}

async function ensureRootAuthorityRolloutLockFile() {
  await ensureRootAuthorityRolloutLockParent();
  let handle = null;
  try {
    handle = await open(AUTHORITY_ROLLOUT_LOCK_FILE, "wx", 0o600);
    await handle.sync();
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
  const metadata = await lstat(AUTHORITY_ROLLOUT_LOCK_FILE);
  if (!metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.uid !== 0
    || metadata.gid !== 0
    || (metadata.mode & 0o777) !== 0o600
    || await realpath(AUTHORITY_ROLLOUT_LOCK_FILE) !== AUTHORITY_ROLLOUT_LOCK_FILE) {
    const error = new Error(`Global authority lock file is not root-controlled: ${AUTHORITY_ROLLOUT_LOCK_FILE}`);
    error.code = "MES_AUTHORITY_LOCK_FILE_UNTRUSTED";
    throw error;
  }
}

export function isAuthorityFlockContention(error) {
  return Number(error?.code) === 75;
}

async function runUnderRootAuthorityRolloutFlock() {
  await ensureRootAuthorityRolloutLockFile();
  if (process.env.MES_SHARED_STATE_AUTHORITY_ROLLOUT_LOCK_HELD === "1"
    || process.argv.slice(2).includes(AUTHORITY_ROLLOUT_LOCK_HELD_ARG)) {
    return await main();
  }
  try {
    const { stdout, stderr } = await execFileAsync("/usr/bin/flock", [
      "--exclusive",
      "--nonblock",
      "--no-fork",
      "--conflict-exit-code=75",
      AUTHORITY_ROLLOUT_LOCK_FILE,
      "/usr/bin/node",
      fileURLToPath(import.meta.url),
      AUTHORITY_ROLLOUT_LOCK_HELD_ARG,
      ...process.argv.slice(2),
    ], { maxBuffer: 16 * 1024 * 1024 });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (error) {
    if (isAuthorityFlockContention(error)) {
      const busy = new Error(`Another shared-state authority rollout, contour sync, activation, or rollback is active: ${AUTHORITY_ROLLOUT_LOCK_FILE}`);
      busy.code = "MES_AUTHORITY_LOCK_BUSY";
      throw busy;
    }
    throw error;
  }
}

function getArgValue(name, fallback = "") {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!entry) return fallback;
  if (entry === name) return "true";
  return entry.slice(prefix.length);
}

function countObjectKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function summarizeSnapshot(snapshot = {}) {
  return {
    version: Number(snapshot.version || 0) || 0,
    updatedAt: snapshot.updatedAt || "",
    valueKeys: countObjectKeys(snapshot.values),
    sharedUiKeys: countObjectKeys(snapshot.sharedUi),
    eventCount: Array.isArray(snapshot.events) ? snapshot.events.length : 0,
    valuesBytes: Buffer.byteLength(JSON.stringify(snapshot.values || {})),
    sharedUiBytes: Buffer.byteLength(JSON.stringify(snapshot.sharedUi || {})),
  };
}

async function readSnapshot(filePath) {
  const raw = await readFile(filePath, "utf-8");
  const snapshot = JSON.parse(raw);
  if (!snapshot || typeof snapshot !== "object" || !snapshot.values || typeof snapshot.values !== "object") {
    throw new Error(`Shared-state snapshot is invalid: ${filePath}`);
  }
  return { raw, snapshot };
}

export function createTargetSnapshot({ sourceSnapshot, targetBeforeSnapshot = {}, sourceConfig, targetConfig, actor, reason }) {
  const sourceVersion = Number(sourceSnapshot.version || 0) || 0;
  const targetVersion = Number(targetBeforeSnapshot?.version || 0) || 0;
  const nextVersion = Math.max(sourceVersion + 1, targetVersion + 1, Date.now());
  const now = new Date().toISOString();
  const syncEvent = {
    version: nextVersion,
    createdAt: now,
    action: "sync-stage-to-pilot",
    clientId: "contour-admin",
    actor,
    reason,
    sourceContour: sourceConfig.label,
    sourceSharedStateKey: sourceConfig.sharedStateKey,
    sourceVersion,
    targetContour: targetConfig.label,
    targetSharedStateKey: targetConfig.sharedStateKey,
  };
  const events = Array.isArray(sourceSnapshot.events) ? sourceSnapshot.events : [];

  return {
    ...sourceSnapshot,
    version: nextVersion,
    updatedAt: now,
    updatedBy: {
      clientId: "contour-admin",
      actor,
      reason,
      sourceContour: sourceConfig.label,
      sourceVersion,
    },
    events: [syncEvent, ...events].slice(0, 50),
  };
}

function contourEnvironment(config, env = process.env) {
  return {
    ...env,
    APP_ENV: config.appEnv,
    MES_SHARED_STATE_KEY: config.sharedStateKey,
    MES_SHARED_STATE_FILE: config.filePath,
    MES_BACKUP_DIR: config.backupDir,
    MES_AUDIT_LOG_PATH: config.auditLogPath,
  };
}

export function extractEffectiveOwnerFlags(rawEnvironment = "") {
  const entries = String(rawEnvironment || "").split("\0").filter(Boolean);
  const values = Object.fromEntries(entries.flatMap((entry) => {
    const separator = entry.indexOf("=");
    return separator > 0 ? [[entry.slice(0, separator), entry.slice(separator + 1)]] : [];
  }));
  return Object.fromEntries(OWNER_FLAG_NAMES.map((name) => [name, values[name] || "0"]));
}

async function contourServiceEnvironment(config) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("systemctl", ["show", config.service, "--property=MainPID", "--value"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    }));
  } catch (error) {
    const failure = new Error(`Cannot inspect effective owner flags for ${config.service}: ${error?.message || "systemctl failed"}`);
    failure.code = "MES_SHARED_STATE_OWNER_PREFLIGHT_UNAVAILABLE";
    throw failure;
  }
  const mainPid = Number(String(stdout || "").trim());
  if (!Number.isSafeInteger(mainPid) || mainPid <= 0) {
    const failure = new Error(`Cannot inspect effective owner flags because ${config.service} is not running`);
    failure.code = "MES_SHARED_STATE_OWNER_PREFLIGHT_UNAVAILABLE";
    throw failure;
  }
  let effectiveEnvironment;
  try {
    effectiveEnvironment = await readFile(`/proc/${mainPid}/environ`, "utf8");
  } catch (error) {
    const failure = new Error(`Cannot read effective owner flags for ${config.service}: ${error?.message || "process environment unavailable"}`);
    failure.code = "MES_SHARED_STATE_OWNER_PREFLIGHT_UNAVAILABLE";
    throw failure;
  }
  return contourEnvironment(config, { ...process.env, ...extractEffectiveOwnerFlags(effectiveEnvironment) });
}

async function requireExistingOperationalDirectory(path, label) {
  const info = await stat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (info?.isDirectory()) return;
  const failure = new Error(`Stage-to-pilot sync requires the existing ${label} directory so root cannot strand deploy-owned runtime paths`);
  failure.code = "MES_SHARED_STATE_OPERATIONAL_PATH_MISSING";
  throw failure;
}

async function requireExistingOperationalFile(path, label) {
  const info = await stat(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (info?.isFile()) return;
  const failure = new Error(`Stage-to-pilot sync requires the existing ${label} file so root cannot create a deploy runtime file as root-owned`);
  failure.code = "MES_SHARED_STATE_OPERATIONAL_PATH_MISSING";
  throw failure;
}

async function requireContourSyncOperationalDirectories(sourceConfig, targetConfig) {
  await Promise.all([
    requireExistingOperationalDirectory(sourceConfig.backupDir, "Stage backup"),
    requireExistingOperationalDirectory(targetConfig.backupDir, "Pilot backup"),
    requireExistingOperationalFile(sourceConfig.auditLogPath, "Stage audit"),
    requireExistingOperationalFile(targetConfig.auditLogPath, "Pilot audit"),
  ]);
}

async function targetEnvironment(targetConfig) {
  const observationEnv = await resolvePlanningSnapshotObservationEnvironment({
    env: process.env,
    targetAppEnv: targetConfig.appEnv,
    targetSharedStateFile: targetConfig.filePath,
  });
  return contourEnvironment(targetConfig, observationEnv);
}

function observationUnavailableError(observation) {
  const error = new Error(`Stage-to-pilot sync was blocked before writing Planning data: ${observation?.error || "Planning snapshot observation is unavailable"}`);
  error.code = "MES_PLANNING_SNAPSHOT_OBSERVATION_UNAVAILABLE";
  return error;
}

export function inspectContourSyncAuthorityBoundary(snapshot = {}, env = process.env) {
  const blockers = [];
  if (String(env.MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS || "") === "1") blockers.push("nomenclature-command-owner-active");
  if (String(env.MES_ENABLE_DIRECTORY_CLUSTER_SERVER_COMMANDS || "") === "1") blockers.push("directory-cluster-command-owner-active");
  if (String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1") blockers.push("specifications2-work-order-owner-active");
  if (String(env.MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS || "") === "1") blockers.push("specifications2-publication-owner-active");
  if (String(env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") === "1") blockers.push("shift-execution-command-owner-active");
  if (String(env.MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS || "") === "1") blockers.push("system-domains-command-owner-active");
  const values = snapshot?.values && typeof snapshot.values === "object" ? snapshot.values : {};
  for (const [key, blocker] of [
    [NOMENCLATURE_COMMAND_RECEIPTS_STORAGE_KEY, "nomenclature-command-receipts-present"],
    [DIRECTORY_CLUSTER_COMMAND_RECEIPTS_STORAGE_KEY, "directory-cluster-command-receipts-present"],
  ]) {
    if (values[key] !== undefined && values[key] !== null && String(values[key]).trim() !== "") blockers.push(blocker);
  }
  const publications = snapshot?.specifications2PublicationAuthority?.publications;
  if (publications && typeof publications === "object" && !Array.isArray(publications) && Object.keys(publications).length) {
    blockers.push("specifications2-publication-authority-present");
  }
  if (snapshot?.systemDomainsRetirement && typeof snapshot.systemDomainsRetirement === "object") {
    blockers.push("system-domains-retirement-present");
  }
  if (snapshot?.shiftExecutionRetirement && typeof snapshot.shiftExecutionRetirement === "object") {
    blockers.push("shift-execution-retirement-present");
  }
  if (Object.prototype.hasOwnProperty.call(values, SYSTEM_DOMAINS_STORAGE_KEY)
    && values[SYSTEM_DOMAINS_STORAGE_KEY] === null) {
    blockers.push("system-domains-retirement-tombstone-present");
  }
  return { ok: blockers.length === 0, blockers };
}

export function requireExistingContourSyncTarget(targetBefore) {
  if (targetBefore) return targetBefore;
  const error = new Error("Stage-to-pilot sync requires an existing target snapshot so uid/gid/mode ownership can be preserved");
  error.code = "MES_SHARED_STATE_TARGET_MISSING";
  throw error;
}

export function inspectContourSyncAuthorityBoundaries({
  sourceSnapshot = {},
  targetSnapshot = {},
  sourceEnv = process.env,
  targetEnv = process.env,
} = {}) {
  const source = inspectContourSyncAuthorityBoundary(sourceSnapshot, sourceEnv);
  const target = inspectContourSyncAuthorityBoundary(targetSnapshot, targetEnv);
  return {
    ok: source.ok && target.ok,
    blockers: [
      ...source.blockers.map((blocker) => `source:${blocker}`),
      ...target.blockers.map((blocker) => `target:${blocker}`),
    ],
    source,
    target,
  };
}

async function main() {
  const from = getArgValue("--from", "staging");
  const to = getArgValue("--to", "pilot");
  const dryRun = getArgValue("--dry-run", "false") === "true";
  const actor = getArgValue("--actor", process.env.USER || "contour-admin");
  const reason = getArgValue("--reason", "stage-to-pilot-sync");

  if (from !== "staging" || to !== "pilot") {
    throw new Error("Only staging -> pilot shared-state sync is allowed");
  }

  const sourceConfig = contourConfigs[from];
  const targetConfig = contourConfigs[to];
  const [sourceEnv, initialTargetEnv] = await Promise.all([
    contourServiceEnvironment(sourceConfig),
    contourServiceEnvironment(targetConfig),
  ]);
  const [{ raw: sourceRaw, snapshot: sourceSnapshot }, targetStat] = await Promise.all([
    readSnapshot(sourceConfig.filePath),
    stat(targetConfig.filePath).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    }),
  ]);

  const targetBefore = targetStat ? await readSnapshot(targetConfig.filePath) : null;
  const targetSnapshot = createTargetSnapshot({
    sourceSnapshot,
    targetBeforeSnapshot: targetBefore?.snapshot || {},
    sourceConfig,
    targetConfig,
    actor,
    reason,
  });

  const summary = {
    ok: true,
    dryRun,
    action: "sync-stage-to-pilot",
    source: {
      contour: sourceConfig.label,
      filePath: sourceConfig.filePath,
      bytes: Buffer.byteLength(sourceRaw),
      ...summarizeSnapshot(sourceSnapshot),
    },
    targetBefore: targetBefore ? {
      contour: targetConfig.label,
      filePath: targetConfig.filePath,
      bytes: Buffer.byteLength(targetBefore.raw),
      ...summarizeSnapshot(targetBefore.snapshot),
    } : {
      contour: targetConfig.label,
      filePath: targetConfig.filePath,
      bytes: 0,
      missing: true,
    },
    targetAfter: {
      contour: targetConfig.label,
      filePath: targetConfig.filePath,
      bytes: Buffer.byteLength(JSON.stringify(targetSnapshot, null, 2)) + 1,
      ...summarizeSnapshot(targetSnapshot),
    },
    backupPath: "",
    authorityBoundary: inspectContourSyncAuthorityBoundaries({
      sourceSnapshot,
      targetSnapshot: targetBefore?.snapshot || {},
      sourceEnv,
      targetEnv: initialTargetEnv,
    }),
  };

  if (!dryRun) {
    const targetEnv = await targetEnvironment(targetConfig);
    await requireContourSyncOperationalDirectories(sourceConfig, targetConfig);
    // Hold the source lock for the complete promotion. Otherwise Stage could
    // acquire server-owned authority after our first read while Pilot still
    // receives a stale full snapshot that bypassed the source-side guard.
    await withSharedStateFileLock(sourceConfig.filePath, async () => {
      const lockedSource = await readSnapshot(sourceConfig.filePath);
      summary.source = {
        contour: sourceConfig.label,
        filePath: sourceConfig.filePath,
        bytes: Buffer.byteLength(lockedSource.raw),
        ...summarizeSnapshot(lockedSource.snapshot),
      };

      await withSharedStateFileLock(targetConfig.filePath, async () => {
        // Re-read both snapshots under their shared writer locks. These are the
        // only safe inputs for the authority check and the actual promotion.
        const lockedTargetBefore = await readSnapshot(targetConfig.filePath).catch((error) => {
          if (error?.code === "ENOENT") return null;
          throw error;
        });
        requireExistingContourSyncTarget(lockedTargetBefore);
        const targetSnapshot = createTargetSnapshot({
          sourceSnapshot: lockedSource.snapshot,
          targetBeforeSnapshot: lockedTargetBefore.snapshot,
          sourceConfig,
          targetConfig,
          actor,
          reason,
        });
        summary.targetBefore = lockedTargetBefore ? {
          contour: targetConfig.label,
          filePath: targetConfig.filePath,
          bytes: Buffer.byteLength(lockedTargetBefore.raw),
          ...summarizeSnapshot(lockedTargetBefore.snapshot),
        } : {
          contour: targetConfig.label,
          filePath: targetConfig.filePath,
          bytes: 0,
          missing: true,
        };
        summary.targetAfter = {
          contour: targetConfig.label,
          filePath: targetConfig.filePath,
          bytes: Buffer.byteLength(JSON.stringify(targetSnapshot, null, 2)) + 1,
          ...summarizeSnapshot(targetSnapshot),
        };
        // Re-read the actual running service environments under both state
        // locks. A root shell does not inherit systemd drop-ins, so process.env
        // is not authority evidence for either contour.
        const [lockedSourceEnv, lockedTargetEnv] = await Promise.all([
          contourServiceEnvironment(sourceConfig),
          contourServiceEnvironment(targetConfig),
        ]);
        const authorityBoundary = inspectContourSyncAuthorityBoundaries({
          sourceSnapshot: lockedSource.snapshot,
          targetSnapshot: lockedTargetBefore?.snapshot || {},
          sourceEnv: lockedSourceEnv,
          targetEnv: lockedTargetEnv,
        });
        summary.authorityBoundary = authorityBoundary;
        if (!authorityBoundary.ok) {
          const error = new Error(`Stage-to-pilot full-snapshot sync is disabled after server-owned authority activation: ${authorityBoundary.blockers.join(", ")}`);
          error.code = "MES_SHARED_STATE_OWNER_PROTECTED";
          throw error;
        }

        const observation = await beginPlanningSnapshotObservation({
          env: targetEnv,
          current: lockedTargetBefore.snapshot,
          next: targetSnapshot,
          source: "sync-stage-to-pilot",
        });
        if (!observation.ok) throw observationUnavailableError(observation);

        const backup = await backupSharedStateFile({
          filePath: targetConfig.filePath,
          backupDir: targetConfig.backupDir,
          reason: `before-${reason}`,
          actor,
          env: targetEnv,
          allowMissing: false,
        });

        summary.backupPath = backup?.backupPath || "";
        // The promotion can be launched by root while the MES process runs as
        // deploy. Preserve the existing target uid/gid/mode across the atomic
        // rename so the application retains write authority after rollout.
        await writeSharedStateFileAtomic(targetConfig.filePath, targetSnapshot);
        const recorded = await recordPlanningSnapshotObservation({
          observation,
          snapshot: targetSnapshot,
          source: "sync-stage-to-pilot",
        });
        summary.planningSnapshotObservation = recorded.attempted
          ? (recorded.recorded ? "recorded" : "pending")
          : "not-required";
      });
    });

    await Promise.all([
      appendSharedStateAudit({
        auditLogPath: sourceConfig.auditLogPath,
        event: {
          action: "sync-stage-to-pilot-source-read",
          status: "read",
          actor,
          reason,
          sourceVersion: summary.source.version,
          targetVersion: summary.targetAfter.version,
        },
      }).catch(() => {}),
      appendSharedStateAudit({
        auditLogPath: targetConfig.auditLogPath,
        event: {
          action: "sync-stage-to-pilot",
          status: "written",
          actor,
          reason,
          sourcePath: sourceConfig.filePath,
          targetPath: targetConfig.filePath,
          sourceVersion: summary.source.version,
          previousTargetVersion: summary.targetBefore.version || 0,
          targetVersion: summary.targetAfter.version,
          backupPath: summary.backupPath,
          planningSnapshotObservation: summary.planningSnapshotObservation || "not-required",
        },
      }).catch(() => {}),
    ]);
  }

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runUnderRootAuthorityRolloutFlock().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
