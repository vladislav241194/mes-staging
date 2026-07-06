import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  appendSharedStateAudit,
  backupSharedStateFile,
  getSharedStateServerPaths,
  pruneSharedStateBackups,
} from "./shared-state-storage.mjs";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));

function getArgValue(name, fallback = "") {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!entry) return fallback;
  if (entry === name) return "true";
  return entry.slice(prefix.length);
}

async function main() {
  const paths = getSharedStateServerPaths({
    projectRoot,
    fallbackFile: join(projectRoot, ".mes-shared-state.json"),
  });
  const reason = getArgValue("--reason", "manual-backup");
  const actor = getArgValue("--actor", process.env.USER || "operator");
  const allowMissing = getArgValue("--allow-missing", "true") !== "false";

  const backup = await backupSharedStateFile({
    filePath: paths.filePath,
    backupDir: paths.backupDir,
    reason,
    actor,
    env: process.env,
    allowMissing,
  });

  await appendSharedStateAudit({
    auditLogPath: paths.auditLogPath,
    event: {
      action: "backup-shared-state",
      status: backup ? "saved" : "skipped-missing-source",
      reason,
      actor,
      backupPath: backup?.backupPath || "",
    },
  }).catch(() => {});

  if (process.env.MES_PRUNE_BACKUPS === "true") {
    const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 0) || 0;
    const pruned = await pruneSharedStateBackups({
      backupDir: paths.backupDir,
      retentionDays,
      env: process.env,
      dryRun: false,
    });
    console.log(`Pruned ${pruned.deleted.length} expired backups.`);
  }

  if (!backup) {
    console.log(`No shared state file found at ${paths.filePath}. Backup skipped.`);
    return;
  }

  console.log(`Shared state backup created: ${backup.backupPath}`);
  console.log(`Metadata: ${backup.metaPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
