import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  getSharedStateServerPaths,
  listSharedStateBackups,
} from "./shared-state-storage.mjs";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const asJson = process.argv.includes("--json");

async function main() {
  const paths = getSharedStateServerPaths({
    projectRoot,
    fallbackFile: join(projectRoot, ".mes-shared-state.json"),
  });
  const backups = await listSharedStateBackups({ backupDir: paths.backupDir, env: process.env });

  if (asJson) {
    console.log(JSON.stringify({ backupDir: paths.backupDir, backups }, null, 2));
    return;
  }

  console.log(`Backup directory: ${paths.backupDir}`);
  if (!backups.length) {
    console.log("No shared state backups found.");
    return;
  }

  backups.forEach((backup) => {
    console.log(`${backup.mtime} | ${backup.size} bytes | ${backup.reason || "-"} | ${backup.path}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
