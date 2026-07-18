import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { exportShiftExecutionSnapshot } from "./domain-shift-execution-export.mjs";
import { importShiftExecutionRows, validateShiftExecutionExport } from "./domain-shift-execution-import.mjs";
import { compareShiftExecutionProjection, readShiftExecutionProjection } from "./domain-shift-execution-parity.mjs";
import { normalizeShiftExecutionRetirement, readSharedStateSnapshot, updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";
import { appendSharedStateAudit, backupSharedStateFile, getSharedStateServerPaths, withSharedStateFileLock } from "./shared-state-storage.mjs";

export const SHIFT_EXECUTION_AUTHORITY_KEY = "shared-ui-shift-execution-v1";
const SHIFT_EXECUTION_SHARED_UI_KEYS = [
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterBoardCarryovers",
];

function digestPayload(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function countsFor(payload) {
  return {
    assignments: payload.shiftAssignments.length,
    executors: payload.shiftAssignmentExecutors.length,
    facts: payload.shiftFacts.length,
    carryovers: payload.shiftCarryovers.length,
  };
}

function safeFileStamp(value = new Date()) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function projectSnapshot(snapshot = {}) {
  const payload = exportShiftExecutionSnapshot(snapshot);
  validateShiftExecutionExport(payload);
  return { payload, digest: digestPayload(payload), counts: countsFor(payload) };
}

function hasRetiredSharedUi(snapshot = {}) {
  const sharedUi = snapshot.sharedUi && typeof snapshot.sharedUi === "object" ? snapshot.sharedUi : {};
  return SHIFT_EXECUTION_SHARED_UI_KEYS.every((key) => !Object.prototype.hasOwnProperty.call(sharedUi, key));
}

function normalizeAuthorityRow(row = null) {
  if (!row) return null;
  return {
    mode: String(row.mode || ""),
    transitionId: String(row.transition_id || ""),
    sourceSnapshotVersion: Number(row.source_snapshot_version || 0),
    sourceDigest: String(row.source_digest || ""),
    sourceCounts: row.source_counts || {},
    sourceExportPath: String(row.source_export_path || ""),
    activatedAt: row.activated_at?.toISOString?.() || String(row.activated_at || ""),
  };
}

async function readAuthority(sql) {
  const rows = await sql`
    SELECT mode, transition_id, source_snapshot_version, source_digest,
           source_counts, source_export_path, activated_at
    FROM shift_execution_authority
    WHERE authority_key = ${SHIFT_EXECUTION_AUTHORITY_KEY}
    LIMIT 1
  `;
  return normalizeAuthorityRow(rows[0]);
}

export async function inspectShiftExecutionAuthority({ primary, env = process.env, filePath = "" } = {}) {
  if (!primary?.getAuthority) {
    return { ok: false, serverAuthoritative: false, reason: "authority-reader-unavailable", authority: null, compatibility: null };
  }
  const authority = await primary.getAuthority();
  const source = await readSharedStateSnapshot({ env, filePath });
  const retirement = normalizeShiftExecutionRetirement(source.snapshot?.shiftExecutionRetirement);
  const markerMatches = Boolean(authority && retirement)
    && authority.transitionId === retirement.transitionId
    && authority.sourceDigest === retirement.sourceDigest
    && authority.sourceSnapshotVersion === retirement.sourceSnapshotVersion;
  const snapshotRetired = hasRetiredSharedUi(source.snapshot);
  const serverAuthoritative = authority?.mode === "postgres-primary" && markerMatches && snapshotRetired;
  return {
    ok: true,
    serverAuthoritative,
    reason: serverAuthoritative ? "" : !authority
      ? "authority-marker-missing"
      : authority.mode !== "postgres-primary"
        ? "authority-transition-pending"
        : !retirement
          ? "compatibility-retirement-marker-missing"
          : !markerMatches
            ? "authority-marker-mismatch"
            : "compatibility-shared-ui-active",
    authority,
    compatibility: {
      configured: source.configured,
      kind: source.kind,
      snapshotVersion: Number(source.snapshot?.version || 0),
      retired: snapshotRetired,
      marker: retirement,
    },
  };
}

async function assertDatabaseEmpty(tx) {
  const [row] = await tx`
    SELECT
      (SELECT count(*) FROM shift_assignments)::int AS assignments,
      (SELECT count(*) FROM shift_assignment_executors)::int AS executors,
      (SELECT count(*) FROM shift_facts)::int AS facts,
      (SELECT count(*) FROM shift_carryovers)::int AS carryovers,
      (SELECT count(*) FROM shift_execution_command_requests)::int AS command_requests,
      (SELECT count(*) FROM shift_execution_mutation_requests)::int AS mutation_requests,
      (SELECT count(*) FROM shift_execution_fact_requests)::int AS fact_requests,
      (SELECT count(*) FROM shift_execution_carryover_requests)::int AS carryover_requests,
      (SELECT count(*) FROM shift_execution_carryover_cancellation_requests)::int AS carryover_cancellation_requests
  `;
  const counts = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)]));
  if (Object.values(counts).some((value) => value !== 0)) {
    throw new Error(`Shift Execution cutover requires an empty PostgreSQL target before the first import: ${JSON.stringify(counts)}`);
  }
}

async function verifyImportedProjection(tx, payload) {
  const actual = await readShiftExecutionProjection(tx, payload);
  const parity = compareShiftExecutionProjection(payload, actual);
  if (!parity.matches) throw new Error(`Shift Execution parity failed: ${JSON.stringify(parity.mismatches.slice(0, 5))}`);
  const expectedCounts = countsFor(payload);
  const [globalCounts] = await tx`
    SELECT
      (SELECT count(*) FROM shift_assignments)::int AS assignments,
      (SELECT count(*) FROM shift_assignment_executors)::int AS executors,
      (SELECT count(*) FROM shift_facts)::int AS facts,
      (SELECT count(*) FROM shift_carryovers)::int AS carryovers,
      (SELECT count(*) FROM shift_execution_command_requests)::int AS command_requests,
      (SELECT count(*) FROM shift_execution_mutation_requests)::int AS mutation_requests,
      (SELECT count(*) FROM shift_execution_fact_requests)::int AS fact_requests,
      (SELECT count(*) FROM shift_execution_carryover_requests)::int AS carryover_requests,
      (SELECT count(*) FROM shift_execution_carryover_cancellation_requests)::int AS carryover_cancellation_requests
  `;
  const actualCounts = Object.fromEntries(Object.entries(globalCounts || {}).map(([key, value]) => [key, Number(value || 0)]));
  if (Object.entries(expectedCounts).some(([key, value]) => actualCounts[key] !== value)) {
    throw new Error(`Shift Execution global count parity failed: expected ${JSON.stringify(expectedCounts)}, actual ${JSON.stringify(actualCounts)}`);
  }
  const unexpectedRequests = Object.entries(actualCounts)
    .filter(([key, value]) => key.endsWith("_requests") && value !== 0);
  if (unexpectedRequests.length) {
    throw new Error(`Shift Execution rollback safety found post-import command history: ${JSON.stringify(Object.fromEntries(unexpectedRequests))}`);
  }
}

function restoreSharedUiFromExport(payload, currentSharedUi = {}) {
  const sourceRowByAssignment = new Map(payload.shiftAssignments.map((row) => [row.id, row.source_row_id]));
  return {
    ...currentSharedUi,
    shiftMasterBoardAssignments: Object.fromEntries(payload.shiftAssignments.map((row) => [row.source_row_id, row.source_payload || {}])),
    shiftMasterBoardFacts: Object.fromEntries(payload.shiftFacts.map((row) => [sourceRowByAssignment.get(row.shift_assignment_id), row.source_payload || {}]).filter(([rowId]) => rowId)),
    shiftMasterBoardCarryovers: Object.fromEntries(payload.shiftCarryovers.map((row) => [row.id, row.source_payload || {}])),
  };
}

async function beginAuthorityTransition(sql, { transitionId, sourceVersion, digest, counts, exportPath, payload }) {
  await sql.begin("isolation level serializable", async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('mes:shift-execution-postgres-authority'))`;
    const existing = await readAuthority(tx);
    if (existing) {
      if (existing.transitionId !== transitionId || existing.sourceDigest !== digest) {
        throw new Error("Another Shift Execution authority transition already exists");
      }
      return;
    }
    await tx`LOCK TABLE shift_assignments, shift_assignment_executors, shift_facts, shift_carryovers IN ACCESS EXCLUSIVE MODE`;
    await assertDatabaseEmpty(tx);
    await importShiftExecutionRows(tx, payload);
    await verifyImportedProjection(tx, payload);
    await tx`
      INSERT INTO shift_execution_authority (
        authority_key, mode, transition_id, source_snapshot_version,
        source_digest, source_counts, source_export_path
      ) VALUES (
        ${SHIFT_EXECUTION_AUTHORITY_KEY}, 'transition-pending', ${transitionId}, ${sourceVersion},
        ${digest}, ${tx.json(counts)}, ${exportPath}
      )
    `;
  });
}

async function retireCompatibilitySnapshot({ authority, payload, env, paths }) {
  const observed = await readSharedStateSnapshot({ env, filePath: paths.filePath });
  const existingMarker = normalizeShiftExecutionRetirement(observed.snapshot?.shiftExecutionRetirement);
  if (existingMarker) {
    if (existingMarker.transitionId !== authority.transitionId
      || existingMarker.sourceDigest !== authority.sourceDigest
      || existingMarker.sourceSnapshotVersion !== authority.sourceSnapshotVersion
      || !hasRetiredSharedUi(observed.snapshot)) {
      throw new Error("Shift Execution compatibility retirement marker conflicts with the PostgreSQL transition");
    }
    return Number(observed.snapshot?.version || 0);
  }
  const currentProjection = projectSnapshot(observed.snapshot);
  if (currentProjection.digest !== authority.sourceDigest) {
    throw new Error("Shift Execution compatibility data changed after the PostgreSQL import; cutover remains pending");
  }
  if (digestPayload(payload) !== authority.sourceDigest) throw new Error("Shift Execution transition export digest is invalid");
  const retiredAt = new Date().toISOString();
  const result = await updateSharedStateSnapshot({
    env,
    filePath: paths.filePath,
    expectedVersion: Number(observed.snapshot?.version || 0),
    allowShiftExecutionCompatibilitySnapshotRetirement: true,
    fileLockHeld: true,
    planningObservationSource: "shift-execution-postgres-authority-cutover",
    update: (current) => {
      const sharedUi = { ...(current.sharedUi || {}) };
      SHIFT_EXECUTION_SHARED_UI_KEYS.forEach((key) => { delete sharedUi[key]; });
      return {
        ...current,
        sharedUi,
        shiftExecutionRetirement: {
          transitionId: authority.transitionId,
          sourceDigest: authority.sourceDigest,
          sourceSnapshotVersion: authority.sourceSnapshotVersion,
          retiredAt,
        },
      };
    },
  });
  if (!result.ok) throw new Error(result.error || "Shift Execution compatibility retirement was not persisted");
  return Number(result.snapshot?.version || 0);
}

async function finalizeAuthority(sql, authority) {
  const rows = await sql`
    UPDATE shift_execution_authority
    SET mode = 'postgres-primary', activated_at = COALESCE(activated_at, now()), updated_at = now()
    WHERE authority_key = ${SHIFT_EXECUTION_AUTHORITY_KEY}
      AND mode = 'transition-pending'
      AND transition_id = ${authority.transitionId}
      AND source_digest = ${authority.sourceDigest}
    RETURNING mode, transition_id, source_snapshot_version, source_digest,
              source_counts, source_export_path, activated_at
  `;
  const finalized = normalizeAuthorityRow(rows[0]) || await readAuthority(sql);
  if (finalized?.mode !== "postgres-primary" || finalized.transitionId !== authority.transitionId) {
    throw new Error("Shift Execution PostgreSQL authority was not finalized");
  }
  return finalized;
}

export async function reconcileShiftExecutionPostgresAuthority({ env = process.env } = {}) {
  const databaseUrl = env.MES_DOMAIN_MIGRATOR_DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured");
  const paths = getSharedStateServerPaths({ projectRoot: process.cwd(), env });
  if (!paths.filePath) throw new Error("Shift Execution cutover requires configured shared-state storage");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    return await withSharedStateFileLock(paths.filePath, async () => {
    let authority = await readAuthority(sql);
    let payload;
    if (!authority) {
      const source = await readSharedStateSnapshot({ env, filePath: paths.filePath });
      const projection = projectSnapshot(source.snapshot);
      const transitionId = `shift-postgres-${randomUUID()}`;
      const backup = await backupSharedStateFile({
        filePath: paths.filePath,
        backupDir: paths.backupDir,
        reason: "before-shift-execution-postgres-authority",
        actor: "domain-shift-execution-authority",
        env,
        allowMissing: false,
      });
      await mkdir(paths.backupDir, { recursive: true });
      const exportPath = join(paths.backupDir, `${safeFileStamp()}__shift-execution__${transitionId}.json`);
      await writeFile(exportPath, `${JSON.stringify(projection.payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await beginAuthorityTransition(sql, {
        transitionId,
        sourceVersion: Number(source.snapshot?.version || 0),
        digest: projection.digest,
        counts: projection.counts,
        exportPath,
        payload: projection.payload,
      });
      authority = await readAuthority(sql);
      payload = projection.payload;
      await appendSharedStateAudit({ auditLogPath: paths.auditLogPath, event: {
        action: "shift-execution-postgres-authority",
        status: "transition-pending",
        transitionId,
        sourceSnapshotVersion: Number(source.snapshot?.version || 0),
        sourceDigest: projection.digest,
        sourceCounts: projection.counts,
        backupPath: backup?.backupPath || "",
        exportPath,
      } });
    } else {
      payload = JSON.parse(await readFile(authority.sourceExportPath, "utf8"));
      validateShiftExecutionExport(payload);
      if (digestPayload(payload) !== authority.sourceDigest) throw new Error("Stored Shift Execution transition export digest does not match PostgreSQL authority");
    }

    const retiredSnapshotVersion = await retireCompatibilitySnapshot({ authority, payload, env, paths });
    const finalized = authority.mode === "postgres-primary" ? authority : await finalizeAuthority(sql, authority);
    await appendSharedStateAudit({ auditLogPath: paths.auditLogPath, event: {
      action: "shift-execution-postgres-authority",
      status: "postgres-primary",
      transitionId: finalized.transitionId,
      sourceSnapshotVersion: finalized.sourceSnapshotVersion,
      retiredSnapshotVersion,
      sourceDigest: finalized.sourceDigest,
      sourceCounts: finalized.sourceCounts,
    } });
    return { ok: true, authority: finalized, retiredSnapshotVersion };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function rollbackShiftExecutionPostgresAuthority({ transitionId = "", sourceDigest = "", env = process.env } = {}) {
  const databaseUrl = env.MES_DOMAIN_MIGRATOR_DATABASE_URL || env.MES_DOMAIN_DATABASE_URL || env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured");
  const paths = getSharedStateServerPaths({ projectRoot: process.cwd(), env });
  if (!paths.filePath) throw new Error("Shift Execution rollback requires configured shared-state storage");
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    return await withSharedStateFileLock(paths.filePath, async () => {
      let authority = await readAuthority(sql);
      if (!authority || !["postgres-primary", "rollback-pending"].includes(authority.mode)) {
        throw new Error("Shift Execution PostgreSQL authority is not rollback-eligible");
      }
      if (authority.transitionId !== String(transitionId || "") || authority.sourceDigest !== String(sourceDigest || "")) {
        throw new Error("Shift Execution rollback proof does not match the active authority marker");
      }
      const payload = JSON.parse(await readFile(authority.sourceExportPath, "utf8"));
      validateShiftExecutionExport(payload);
      if (digestPayload(payload) !== authority.sourceDigest) throw new Error("Stored Shift Execution rollback export digest is invalid");

      if (authority.mode === "postgres-primary") {
        await sql.begin("isolation level serializable", async (tx) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext('mes:shift-execution-postgres-authority'))`;
          await tx`LOCK TABLE shift_assignments, shift_assignment_executors, shift_facts, shift_carryovers IN ACCESS EXCLUSIVE MODE`;
          await verifyImportedProjection(tx, payload);
          await tx`
            UPDATE shift_execution_authority
            SET mode = 'rollback-pending', updated_at = now()
            WHERE authority_key = ${SHIFT_EXECUTION_AUTHORITY_KEY}
              AND mode = 'postgres-primary'
              AND transition_id = ${authority.transitionId}
          `;
        });
        authority = await readAuthority(sql);
      }

      const backup = await backupSharedStateFile({
        filePath: paths.filePath,
        backupDir: paths.backupDir,
        reason: "before-shift-execution-authority-rollback",
        actor: "domain-shift-execution-authority",
        env,
        allowMissing: false,
      });
      const observed = await readSharedStateSnapshot({ env, filePath: paths.filePath });
      const restored = await updateSharedStateSnapshot({
        env,
        filePath: paths.filePath,
        expectedVersion: Number(observed.snapshot?.version || 0),
        allowShiftExecutionCompatibilitySnapshotRestore: true,
        fileLockHeld: true,
        planningObservationSource: "shift-execution-postgres-authority-rollback",
        update: (current) => ({
          ...current,
          sharedUi: restoreSharedUiFromExport(payload, current.sharedUi),
          shiftExecutionRetirement: null,
        }),
      });
      if (!restored.ok) throw new Error(restored.error || "Shift Execution compatibility snapshot rollback was not persisted");

      const assignmentIds = payload.shiftAssignments.map((row) => row.id);
      await sql.begin("isolation level serializable", async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('mes:shift-execution-postgres-authority'))`;
        await tx`LOCK TABLE shift_assignments, shift_assignment_executors, shift_facts, shift_carryovers IN ACCESS EXCLUSIVE MODE`;
        await verifyImportedProjection(tx, payload);
        await tx`DELETE FROM shift_execution_carryover_cancellation_requests WHERE shift_carryover_id IN (SELECT id FROM shift_carryovers WHERE source_assignment_id = ANY(${assignmentIds}))`;
        await tx`DELETE FROM shift_execution_fact_requests WHERE shift_fact_id IN (SELECT id FROM shift_facts WHERE shift_assignment_id = ANY(${assignmentIds}))`;
        await tx`DELETE FROM shift_execution_carryover_requests WHERE shift_carryover_id IN (SELECT id FROM shift_carryovers WHERE source_assignment_id = ANY(${assignmentIds}))`;
        await tx`DELETE FROM shift_execution_mutation_requests WHERE shift_assignment_id = ANY(${assignmentIds})`;
        await tx`DELETE FROM shift_execution_command_requests WHERE shift_assignment_id = ANY(${assignmentIds})`;
        await tx`DELETE FROM shift_facts WHERE shift_assignment_id = ANY(${assignmentIds})`;
        await tx`DELETE FROM shift_carryovers WHERE source_assignment_id = ANY(${assignmentIds})`;
        await tx`DELETE FROM shift_assignment_executors WHERE shift_assignment_id = ANY(${assignmentIds})`;
        await tx`DELETE FROM shift_assignments WHERE id = ANY(${assignmentIds})`;
        await tx`
          DELETE FROM shift_execution_authority
          WHERE authority_key = ${SHIFT_EXECUTION_AUTHORITY_KEY}
            AND mode = 'rollback-pending'
            AND transition_id = ${authority.transitionId}
        `;
      });
      await appendSharedStateAudit({ auditLogPath: paths.auditLogPath, event: {
        action: "shift-execution-postgres-authority",
        status: "rolled-back-to-compatibility-snapshot",
        transitionId: authority.transitionId,
        sourceDigest: authority.sourceDigest,
        sourceCounts: authority.sourceCounts,
        backupPath: backup?.backupPath || "",
        restoredSnapshotVersion: Number(restored.snapshot?.version || 0),
      } });
      return { ok: true, transitionId: authority.transitionId, restoredSnapshotVersion: Number(restored.snapshot?.version || 0) };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const result = await reconcileShiftExecutionPostgresAuthority();
  console.log(JSON.stringify(result));
}
