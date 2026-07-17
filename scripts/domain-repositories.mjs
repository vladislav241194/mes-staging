import { createWorkOrdersRepository as createSnapshotWorkOrdersRepository } from "./domain-work-orders-repository.mjs";

/**
 * Explicit storage switch. Snapshot remains the default until PostgreSQL has
 * passed a parallel migration check. This prevents an environment variable
 * accident from silently creating a second source of truth.
 */
export async function createWorkOrdersRepository({ env = process.env, filePath = "" } = {}) {
  const mode = String(env.MES_DOMAIN_STORAGE || "snapshot").trim().toLowerCase();
  if (mode === "snapshot") return createSnapshotWorkOrdersRepository({ env, filePath });
  if (mode === "postgres") {
    // Keep the pilot's snapshot mode independent of an optional database
    // driver. This module is only resolved after the storage mode is enabled.
    const { createPostgresWorkOrdersRepository } = await import("./domain-postgres-repository.mjs");
    return createPostgresWorkOrdersRepository({ databaseUrl: env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "" });
  }
  throw new Error(`Unsupported MES_DOMAIN_STORAGE: ${mode}`);
}
