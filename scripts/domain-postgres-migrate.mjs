import { readdir, readFile } from "node:fs/promises";
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
