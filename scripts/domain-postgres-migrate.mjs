import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const args = process.argv.slice(2);
if (args.some((value) => value !== "--schema-only")) {
  throw new Error("Domain migration accepts only --schema-only; Shift authority reconciliation is a separate explicit command");
}

const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL
  || process.env.MES_DOMAIN_DATABASE_URL
  || process.env.DATABASE_URL
  || "";
if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured");
const migrationsDir = resolve("db/migrations");
const migrationFiles = (await readdir(migrationsDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
if (!migrationFiles.length) throw new Error("No SQL migrations were found");
const repeatableRepairMigrations = new Set([
  "031_specifications2_guard_function_repair.sql",
]);
const missingRepeatableRepairs = [...repeatableRepairMigrations].filter((file) => !migrationFiles.includes(file));
if (missingRepeatableRepairs.length) {
  throw new Error(`Required repeatable repair migrations are missing: ${missingRepeatableRepairs.join(", ")}`);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  for (const file of migrationFiles) {
    const source = await readFile(resolve(migrationsDir, file), "utf-8");
    await sql.begin(async (tx) => tx.unsafe(source));
    console.log(`${repeatableRepairMigrations.has(file) ? "Reconciled repeatable domain migration" : "Applied domain migration"}: ${file}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
