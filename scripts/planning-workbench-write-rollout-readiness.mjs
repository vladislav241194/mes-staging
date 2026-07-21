import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createWorkOrdersRepository } from "./domain-repositories.mjs";
import { createEmployeeAuthRepository } from "./domain-employee-auth-repository.mjs";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { getCurrentPlanningAuthorization } from "./planning-command-authorization.mjs";

function exact(value, expected) {
  return String(value ?? "").trim() === expected;
}

export function inspectPlanningCompatibilityRows(rows = []) {
  const unresolved = (Array.isArray(rows) ? rows : []).filter((row) => ["pending", "conflict"].includes(String(row?.snapshot_sync_state || row?.state || "")));
  const pendingCount = unresolved.filter((row) => String(row?.snapshot_sync_state || row?.state || "") === "pending").length;
  const conflictCount = unresolved.filter((row) => String(row?.snapshot_sync_state || row?.state || "") === "conflict").length;
  const oldest = unresolved[0] || null;
  return Object.freeze({
    ready: unresolved.length === 0,
    pendingCount,
    conflictCount,
    oldest: oldest ? Object.freeze({
      id: Number(oldest.id),
      aggregateId: String(oldest.aggregate_id || oldest.aggregateId || ""),
      aggregateRevision: Number(oldest.aggregate_revision || oldest.aggregateRevision || 0),
      commandType: String(oldest.command_type || oldest.commandType || ""),
      state: String(oldest.snapshot_sync_state || oldest.state || ""),
    }) : null,
  });
}

export function inspectPlanningParityMarker(marker = null) {
  const primaryRevision = Number(marker?.primaryRevision);
  const snapshotGeneration = Number(marker?.snapshotGeneration);
  const observedFingerprint = String(marker?.observedSnapshotFingerprint || "");
  const ready = marker?.observationAvailable === true
    && Number.isSafeInteger(primaryRevision)
    && primaryRevision >= 0
    && Number(marker?.verifiedPrimaryRevision) === primaryRevision
    && Number(marker?.verifiedContractVersion) === 7
    && Number.isSafeInteger(snapshotGeneration)
    && snapshotGeneration > 0
    && String(marker?.snapshotObservationState || "") === "observed"
    && Number(marker?.verifiedSnapshotGeneration) === snapshotGeneration
    && Boolean(observedFingerprint)
    && String(marker?.verifiedSnapshotFingerprint || "") === observedFingerprint
    && Number(marker?.observedSnapshotVersion) > 0;
  return Object.freeze({
    ready,
    primaryRevision,
    snapshotGeneration,
    fingerprint: observedFingerprint,
    contractVersion: Number(marker?.verifiedContractVersion || 0),
  });
}

export async function runPlanningWriteRolloutReadiness({
  env = process.env,
  requireNoUnresolved = false,
  repositoryFactory = createWorkOrdersRepository,
  employeeAuthRepositoryFactory = createEmployeeAuthRepository,
  systemDomainsRepositoryFactory = createSystemDomainsRepository,
  planningAuthorizationResolver = getCurrentPlanningAuthorization,
  sqlFactory = null,
} = {}) {
  if (!exact(env.MES_DOMAIN_STORAGE, "postgres")
    || !exact(env.MES_ENABLE_PLANNING_START_DATE_COMMANDS, "1")) {
    throw new Error("Planning start-date rollout readiness requires exact PostgreSQL and narrow owner flags");
  }
  if (exact(env.MES_ENABLE_PLANNING_SERVER_COMMANDS, "1")) {
    throw new Error("Planning start-date rollout must keep quantity and slot server commands disabled");
  }
  const legacyBrowserDomainWritesQuiesced = exact(env.MES_ENABLE_PLANNING_START_DATE_COMMANDS, "1")
    && !exact(env.MES_ENABLE_PLANNING_SERVER_COMMANDS, "1");
  if (!legacyBrowserDomainWritesQuiesced) {
    throw new Error("Planning start-date rollout requires the global legacy browser domain-write quiesce contract");
  }
  if (!exact(env.MES_ENABLE_EMPLOYEE_AUTH, "1")
    || !String(env.MES_EMPLOYEE_AUTH_SESSION_SECRET || "").trim()
    || !String(env.MES_EMPLOYEE_AUTH_HOSTS || env.MES_PUBLIC_AUTH_HOSTS || "").trim()) {
    throw new Error("Planning start-date rollout requires configured signed employee authentication");
  }
  const databaseUrl = env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || "";
  if (!databaseUrl) throw new Error("Planning rollout readiness requires a PostgreSQL database URL");
  const repository = await repositoryFactory({ env });
  const employeeAuth = employeeAuthRepositoryFactory({ databaseUrl });
  const makeSql = sqlFactory || (await import("postgres")).default;
  const sql = makeSql(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  try {
    const health = await repository.health();
    if (health.storageBackend !== "postgresql" || health.configured !== true) {
      throw new Error("Planning rollout readiness requires the configured PostgreSQL work-order owner");
    }
    if (typeof repository.startDateCommandReadiness !== "function") {
      throw new Error("Planning start-date readiness proof is unavailable");
    }
    const startDate = await repository.startDateCommandReadiness();
    if (startDate.schemaReady !== true) {
      throw new Error(`Planning start-date schema is not exact: ${startDate.error || "readiness proof failed"}`);
    }
    if (typeof repository.getPlanningProjectionParityState !== "function") {
      throw new Error("Planning v7 parity marker proof is unavailable");
    }
    const parityMarker = inspectPlanningParityMarker(await repository.getPlanningProjectionParityState());
    if (!parityMarker.ready) {
      throw new Error(`Planning v7 parity marker is not exact: contract=${parityMarker.contractVersion}, primary=${parityMarker.primaryRevision}, generation=${parityMarker.snapshotGeneration}`);
    }
    const employeeAuthSchema = await employeeAuth.schemaStatus();
    if (employeeAuthSchema.ready !== true) {
      throw new Error("Planning start-date rollout requires the signed employee-auth schema");
    }
    const credentialedEmployees = await sql`
      SELECT credentials.employee_id, employees.display_name, employees.personnel_number
      FROM system_employee_auth_credentials AS credentials
      JOIN system_employees AS employees ON employees.id = credentials.employee_id
      WHERE employees.is_active IS TRUE
      ORDER BY credentials.employee_id ASC
    `;
    if (!credentialedEmployees.length) {
      throw new Error("Planning start-date rollout requires at least one active employee credential");
    }
    const authorizationResults = await Promise.all(credentialedEmployees.map((employee) => planningAuthorizationResolver({
      id: `employee:${String(employee.employee_id || "")}`,
      employeeId: String(employee.employee_id || ""),
      displayName: String(employee.display_name || ""),
      personnelNumber: String(employee.personnel_number || ""),
      scope: "employee",
    }, {
      databaseUrl,
      domainsRepositoryFactory: systemDomainsRepositoryFactory,
    })));
    const eligiblePlanningEmployeeCount = authorizationResults.filter((authorization) => authorization.allowed === true).length;
    if (eligiblePlanningEmployeeCount === 0) {
      throw new Error("Planning start-date rollout requires a credentialed employee authorized by the exact planning:edit policy");
    }
    const rows = await sql`
      SELECT id, aggregate_id, aggregate_revision, command_type, snapshot_sync_state
      FROM domain_change_log
      WHERE aggregate_type = 'work_order'
        AND snapshot_sync_state IN ('pending', 'conflict')
      ORDER BY created_at ASC, id ASC
      LIMIT 100
    `;
    const compatibility = inspectPlanningCompatibilityRows(rows);
    if (requireNoUnresolved && !compatibility.ready) {
      const oldest = compatibility.oldest;
      throw new Error(`Planning compatibility outbox is unresolved: pending=${compatibility.pendingCount}, conflict=${compatibility.conflictCount}, oldest=${oldest.id}/${oldest.aggregateId}/r${oldest.aggregateRevision}/${oldest.commandType}`);
    }
    return Object.freeze({
      ok: true,
      storageBackend: health.storageBackend,
      startDateSchemaReady: true,
      planningParityContractVersion: parityMarker.contractVersion,
      planningParityPrimaryRevision: parityMarker.primaryRevision,
      planningParitySnapshotGeneration: parityMarker.snapshotGeneration,
      employeeAuthSchemaReady: true,
      planningEditAuthorizationReady: true,
      legacyBrowserDomainWritesQuiesced,
      eligiblePlanningEmployeeCount,
      pendingWorkOrderSnapshotSyncs: compatibility.pendingCount,
      conflictWorkOrderSnapshotSyncs: compatibility.conflictCount,
      oldestUnresolved: compatibility.oldest,
    });
  } finally {
    await sql.end({ timeout: 5 });
    await repository.close?.();
    await employeeAuth.close?.();
  }
}

const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsCli) {
  runPlanningWriteRolloutReadiness({
    requireNoUnresolved: process.argv.includes("--require-no-unresolved") || process.argv.includes("--require-no-pending"),
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
