import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendSharedStateAudit,
  backupSharedStateFile,
  getSharedStateServerPaths,
  withSharedStateFileLock,
} from "./shared-state-storage.mjs";
import {
  beginPlanningSnapshotObservation,
  isPlanningSnapshotObservationEnabled,
  recordPlanningSnapshotObservation,
  resolvePlanningSnapshotObservationEnvironment,
} from "./planning-snapshot-observer.mjs";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const RESTORE_CONFIRMATION = "RESTORE_SHARED_STATE";

function getArgValue(name, fallback = "") {
  const prefix = `${name}=`;
  const args = process.argv.slice(2);
  const entry = args.find((arg) => arg === name || arg.startsWith(prefix));
  if (!entry) return fallback;
  if (entry === name) return "true";
  return entry.slice(prefix.length);
}

function resolveBackupPath(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return isAbsolute(normalized) ? normalized : resolve(process.cwd(), normalized);
}

async function readSnapshotForObservation(filePath, { allowMissing = false } = {}) {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return {};
    throw error;
  }

  try {
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("Shared-state snapshot must be a JSON object");
    }
    return snapshot;
  } catch (error) {
    throw new Error(`Shared-state restore requires a valid JSON snapshot while Planning observation is enabled: ${error.message}`);
  }
}

function observationUnavailableError(observation) {
  const error = new Error(`Shared-state restore was blocked before writing Planning data: ${observation?.error || "Planning snapshot observation is unavailable"}`);
  error.code = "MES_PLANNING_SNAPSHOT_OBSERVATION_UNAVAILABLE";
  return error;
}

async function main() {
  const backupPath = resolveBackupPath(getArgValue("--backup", process.argv.slice(2).find((arg) => !arg.startsWith("--")) || ""));
  if (!backupPath) {
    throw new Error("Backup path is required. Use --backup=/path/to/backup.json");
  }
  if (process.env.MES_RESTORE_CONFIRM !== RESTORE_CONFIRMATION) {
    throw new Error(`Restore is blocked. Set MES_RESTORE_CONFIRM=${RESTORE_CONFIRMATION} to continue.`);
  }

  const backupStat = await stat(backupPath);
  if (!backupStat.isFile()) throw new Error("Backup path is not a file");

  const paths = getSharedStateServerPaths({
    projectRoot,
    fallbackFile: join(projectRoot, ".mes-shared-state.json"),
  });
  const actor = getArgValue("--actor", process.env.USER || "operator");
  const planningObservationEnv = await resolvePlanningSnapshotObservationEnvironment({
    env: process.env,
    targetAppEnv: paths.appEnv,
    targetSharedStateFile: paths.filePath,
  });
  const observationEnabled = isPlanningSnapshotObservationEnabled(planningObservationEnv);
  let beforeRestore = null;
  let planningObservation = null;

  await withSharedStateFileLock(paths.filePath, async () => {
    const [currentSnapshot, nextSnapshot] = observationEnabled
      ? await Promise.all([
        readSnapshotForObservation(paths.filePath, { allowMissing: true }),
        readSnapshotForObservation(backupPath),
      ])
      : [{}, {}];
    const observation = await beginPlanningSnapshotObservation({
      env: planningObservationEnv,
      current: currentSnapshot,
      next: nextSnapshot,
      source: "restore-shared-state",
    });
    if (!observation.ok) throw observationUnavailableError(observation);

    beforeRestore = await backupSharedStateFile({
      filePath: paths.filePath,
      backupDir: paths.backupDir,
      reason: "before-restore",
      actor,
      env: process.env,
      allowMissing: true,
    });

    await mkdir(dirname(paths.filePath), { recursive: true });
    await copyFile(backupPath, paths.filePath);
    planningObservation = await recordPlanningSnapshotObservation({
      observation,
      snapshot: nextSnapshot,
      source: "restore-shared-state",
    });
  });

  await appendSharedStateAudit({
    auditLogPath: paths.auditLogPath,
    event: {
      action: "restore-shared-state",
      status: "restored",
      actor,
      backupPath,
      beforeRestoreBackupPath: beforeRestore?.backupPath || "",
      planningSnapshotObservation: planningObservation?.attempted
        ? (planningObservation.recorded ? "recorded" : "pending")
        : "not-required",
    },
  }).catch(() => {});

  console.log(`Shared state restored from: ${backupPath}`);
  if (beforeRestore) console.log(`Previous state backup: ${beforeRestore.backupPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
