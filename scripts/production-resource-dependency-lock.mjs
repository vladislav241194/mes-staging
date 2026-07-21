import postgres from "postgres";

export const PRODUCTION_RESOURCE_DEPENDENCY_LOCK_NAME = "mes:production-resource-dependencies";

function normalizeResourceIds(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

export async function acquireProductionResourceDependencySharedLock(tx) {
  await tx`SELECT pg_advisory_xact_lock_shared(hashtext(${PRODUCTION_RESOURCE_DEPENDENCY_LOCK_NAME}))`;
}

export async function assertProductionResourceDependenciesWritable(tx, resourceIds = []) {
  await acquireProductionResourceDependencySharedLock(tx);
  const normalizedIds = normalizeResourceIds(resourceIds);
  if (!normalizedIds.length) return;

  // Early migration and isolated QA databases may legitimately not have the
  // System Domains schema yet. Once the registry exists, a writer may refer to
  // a missing legacy resource, but it must never recreate a dependency on an
  // explicitly archived Equipment row.
  const [schema] = await tx`SELECT to_regclass('public.system_equipment') IS NOT NULL AS present`;
  if (schema?.present !== true) return;
  const archived = await tx`
    SELECT id
    FROM system_equipment
    WHERE id = ANY(${normalizedIds}) AND is_active IS FALSE
    ORDER BY id
    LIMIT 1
  `;
  if (!archived[0]) return;
  const error = new Error(`Production resource ${String(archived[0].id || "")} is archived`);
  error.code = "PRODUCTION_RESOURCE_ARCHIVED";
  error.resourceId = String(archived[0].id || "");
  throw error;
}

export async function withProductionResourceDependencyExclusiveLock({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  sql: injectedSql = null,
} = {}, action) {
  if (typeof action !== "function") throw new Error("Production resource dependency lock requires an action callback");
  if (!databaseUrl && !injectedSql) throw new Error("DATABASE_URL is required for the production resource dependency lock");
  const sql = injectedSql || postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  try {
    return await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${PRODUCTION_RESOURCE_DEPENDENCY_LOCK_NAME}))`;
      return action(tx);
    });
  } finally {
    if (!injectedSql) await sql.end({ timeout: 5 });
  }
}
