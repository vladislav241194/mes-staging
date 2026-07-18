// Snapshot -> PostgreSQL replacement is only a bootstrap or an explicitly
// approved emergency operation.  Once PostgreSQL contains a distinct System
// Domains projection, a routine import could silently erase newer attendance
// and access-control facts.
export function inspectSystemDomainsSnapshotImportGuard({
  existingItem = null,
  alreadyMatches = false,
  force = false,
  emergencyEnabled = false,
} = {}) {
  if (!existingItem) return { allowed: true, mode: "initial-import", reason: "" };
  if (alreadyMatches) return { allowed: true, mode: "idempotent-import", reason: "" };
  if (!force) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "Refusing to replace an initialized PostgreSQL System Domains projection from the compatibility snapshot without --force.",
    };
  }
  if (!emergencyEnabled) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "Refusing destructive System Domains snapshot replacement without MES_ALLOW_SYSTEM_DOMAINS_SNAPSHOT_REPLACE=1.",
    };
  }
  return { allowed: true, mode: "emergency-replace", reason: "" };
}
