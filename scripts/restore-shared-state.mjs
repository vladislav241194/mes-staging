import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendSharedStateAudit,
  backupSharedStateFile,
  getSharedStateServerPaths,
} from "./shared-state-storage.mjs";

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

  const beforeRestore = await backupSharedStateFile({
    filePath: paths.filePath,
    backupDir: paths.backupDir,
    reason: "before-restore",
    actor,
    env: process.env,
    allowMissing: true,
  });

  await mkdir(dirname(paths.filePath), { recursive: true });
  await copyFile(backupPath, paths.filePath);
  await appendSharedStateAudit({
    auditLogPath: paths.auditLogPath,
    event: {
      action: "restore-shared-state",
      status: "restored",
      actor,
      backupPath,
      beforeRestoreBackupPath: beforeRestore?.backupPath || "",
    },
  }).catch(() => {});

  console.log(`Shared state restored from: ${backupPath}`);
  if (beforeRestore) console.log(`Previous state backup: ${beforeRestore.backupPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
