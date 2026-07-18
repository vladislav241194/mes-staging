import { readdir, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL
  || process.env.MES_DOMAIN_DATABASE_URL
  || process.env.DATABASE_URL
  || "";
if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured");
const migrationsDir = resolve("db/migrations");
const migrationFiles = (await readdir(migrationsDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
if (!migrationFiles.length) throw new Error("No SQL migrations were found");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  for (const file of migrationFiles) {
    const source = await readFile(resolve(migrationsDir, file), "utf-8");
    await sql.begin(async (tx) => tx.unsafe(source));
    console.log(`Applied domain migration: ${file}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}

// A command-enabled contour must not report Shift Execution ready merely
// because its tables exist. Reconcile the compatibility projection through
// the resumable authority protocol while this named migration service owns
// the protected database environment.
if (String(process.env.MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS || "") === "1"
  && String(process.env.MES_SHARED_STATE_DIR || "").trim()) {
  const authorityModule = await import("./domain-shift-execution-authority.mjs");
  const rollbackTriggerPath = resolve(process.env.MES_SHARED_STATE_DIR, ".shift-execution-authority-rollback.json");
  let rollbackTrigger = null;
  try { rollbackTrigger = JSON.parse(await readFile(rollbackTriggerPath, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (rollbackTrigger) {
    if (rollbackTrigger.action !== "rollback"
      || !String(rollbackTrigger.transitionId || "")
      || !/^[a-f0-9]{64}$/.test(String(rollbackTrigger.sourceDigest || ""))) {
      throw new Error("Shift Execution rollback trigger is invalid");
    }
    const result = await authorityModule.rollbackShiftExecutionPostgresAuthority({
      transitionId: rollbackTrigger.transitionId,
      sourceDigest: rollbackTrigger.sourceDigest,
    });
    await unlink(rollbackTriggerPath);
    console.log(`Shift Execution authority rollback: ${result.transitionId}`);
  } else {
    const result = await authorityModule.reconcileShiftExecutionPostgresAuthority();
    console.log(`Shift Execution authority: ${result.authority.mode}`);
  }
}
