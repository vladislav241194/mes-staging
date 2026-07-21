import {
  getRequiredDomainMigrations,
  requiresPlanningStartDateCommandMigration,
} from "./domain-postgres-preflight-policy.mjs";
import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

const requireDatabase = process.argv.includes("--require");
const databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "";

if (!databaseUrl) {
  const message = "PostgreSQL domain storage is not configured: DATABASE_URL is missing";
  if (requireDatabase) throw new Error(message);
  console.log(`SKIP ${message}`);
  process.exit(0);
}

const postgres = (await import("postgres")).default;
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
try {
  const version = await sql`SELECT current_setting('server_version_num') AS version`;
  const requiredMigrations = getRequiredDomainMigrations(process.env);
  const migrations = await sql`SELECT version FROM mes_schema_migrations WHERE version = ANY(${requiredMigrations})`;
  const applied = new Set(migrations.map((row) => row.version));
  const missing = requiredMigrations.filter((migration) => !applied.has(migration));
  if (missing.length) throw new Error(`PostgreSQL is reachable, but required domain migrations are missing: ${missing.join(", ")}`);
  if (requiresPlanningStartDateCommandMigration(process.env)) {
    const readiness = await createPostgresWorkOrdersRepository({ sql }).startDateCommandReadiness();
    if (readiness.schemaReady !== true) {
      throw new Error(`PostgreSQL Planning start-date owner schema is not exact: ${readiness.error || "readiness proof failed"}`);
    }
  }
  console.log(`PostgreSQL domain preflight: OK (server ${version[0]?.version || "unknown"}, migrations ${requiredMigrations.join(", ")})`);
} finally {
  await sql.end({ timeout: 5 });
}
