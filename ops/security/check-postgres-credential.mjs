import { pathToFileURL } from "node:url";

// This helper is installed at a fixed root-owned libexec path before the
// staged candidate becomes active. Load the PostgreSQL client only from the
// already root-sealed active release selected by /srv/mes/pilot/app.
const postgresEntrypoint = "/srv/mes/pilot/app/node_modules/postgres/src/index.js";
const { default: postgres } = await import(pathToFileURL(postgresEntrypoint).href);

function argument(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

const variable = argument("--variable");
const expectedRole = argument("--expected-role");
if (!/^(?:DATABASE_URL|MES_DOMAIN_MIGRATOR_DATABASE_URL)$/.test(variable) || !/^[a-z_][a-z0-9_]*$/.test(expectedRole)) {
  throw new Error("Usage: check-postgres-credential.mjs --variable=DATABASE_URL|MES_DOMAIN_MIGRATOR_DATABASE_URL --expected-role=<role>");
}

const databaseUrl = String(process.env[variable] || "").trim();
if (!databaseUrl) throw new Error(`${variable} is missing`);

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 1 });
try {
  const rows = await sql`SELECT current_user AS role, current_database() AS database`;
  if (rows[0]?.role !== expectedRole) throw new Error(`Credential resolved to unexpected role ${rows[0]?.role || "unknown"}`);
  // Deliberately report only non-secret identity metadata.
  console.log(JSON.stringify({ ok: true, role: rows[0].role, database: rows[0].database }));
} finally {
  await sql.end({ timeout: 1 });
}
