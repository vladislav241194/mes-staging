import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  appendSharedStateAudit,
  backupSharedStateFile,
  withSharedStateFileLock,
} from "./shared-state-storage.mjs";
import {
  beginPlanningSnapshotObservation,
  recordPlanningSnapshotObservation,
  resolvePlanningSnapshotObservationEnvironment,
} from "./planning-snapshot-observer.mjs";

const contourConfigs = {
  staging: {
    appEnv: "staging",
    label: "stage",
    sharedStateKey: "mes-dev-shared-state-v1",
    filePath: "/srv/mes/dev/shared-state/mes-dev-shared-state-v1.json",
    backupDir: "/srv/mes/dev/backups",
    auditLogPath: "/srv/mes/dev/audit/audit.log",
  },
  pilot: {
    appEnv: "pilot",
    label: "pilot",
    sharedStateKey: "mes-pilot-shared-state-v1",
    filePath: "/srv/mes/pilot/shared-state/mes-pilot-shared-state-v1.json",
    backupDir: "/srv/mes/pilot/backups",
    auditLogPath: "/srv/mes/pilot/audit/audit.log",
  },
};

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

async function writeJsonAtomic(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await rename(tempPath, filePath);
}

function createTargetSnapshot({ sourceSnapshot, sourceConfig, targetConfig, actor, reason }) {
  const sourceVersion = Number(sourceSnapshot.version || 0) || 0;
  const nextVersion = Math.max(sourceVersion + 1, Date.now());
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

async function targetEnvironment(targetConfig) {
  const observationEnv = await resolvePlanningSnapshotObservationEnvironment({
    env: process.env,
    targetAppEnv: targetConfig.appEnv,
    targetSharedStateFile: targetConfig.filePath,
  });
  return {
    ...observationEnv,
    APP_ENV: targetConfig.appEnv,
    MES_SHARED_STATE_KEY: targetConfig.sharedStateKey,
    MES_SHARED_STATE_FILE: targetConfig.filePath,
    MES_BACKUP_DIR: targetConfig.backupDir,
    MES_AUDIT_LOG_PATH: targetConfig.auditLogPath,
  };
}

function observationUnavailableError(observation) {
  const error = new Error(`Stage-to-pilot sync was blocked before writing Planning data: ${observation?.error || "Planning snapshot observation is unavailable"}`);
  error.code = "MES_PLANNING_SNAPSHOT_OBSERVATION_UNAVAILABLE";
  return error;
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
  };

  if (!dryRun) {
    const targetEnv = await targetEnvironment(targetConfig);
    await withSharedStateFileLock(targetConfig.filePath, async () => {
      // Re-read inside the shared writer lock. The initial read remains useful
      // for dry-run output, while this one is the only safe predecessor for a
      // real restore/sync write and its observation marker.
      const lockedTargetBefore = await readSnapshot(targetConfig.filePath).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
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

      const observation = await beginPlanningSnapshotObservation({
        env: targetEnv,
        current: lockedTargetBefore?.snapshot || {},
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
        allowMissing: true,
      });

      summary.backupPath = backup?.backupPath || "";
      await writeJsonAtomic(targetConfig.filePath, targetSnapshot);
      const recorded = await recordPlanningSnapshotObservation({
        observation,
        snapshot: targetSnapshot,
        source: "sync-stage-to-pilot",
      });
      summary.planningSnapshotObservation = recorded.attempted
        ? (recorded.recorded ? "recorded" : "pending")
        : "not-required";
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
