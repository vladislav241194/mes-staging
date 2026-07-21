import postgres from "postgres";
import {
  buildShiftAssignmentCommand,
  buildShiftAssignmentUpdateCommand,
  buildShiftFactCommand,
  buildShiftCarryoverCommand,
  buildShiftCarryoverCancelCommand,
} from "../src/domain/shift_execution_assignment.js";
import {
  acquireProductionResourceDependencySharedLock,
  assertProductionResourceDependenciesWritable,
} from "./production-resource-dependency-lock.mjs";

const READ_CLIENTS_BY_URL = new Map();

function getReadClient(databaseUrl) {
  const existing = READ_CLIENTS_BY_URL.get(databaseUrl);
  if (existing) return existing;
  const client = postgres(databaseUrl, { max: 3, idle_timeout: 10, connect_timeout: 5, prepare: false });
  READ_CLIENTS_BY_URL.set(databaseUrl, client);
  return client;
}

export async function closeShiftExecutionReadClients() {
  await Promise.all([...READ_CLIENTS_BY_URL.values()].map((client) => client.end({ timeout: 5 })));
  READ_CLIENTS_BY_URL.clear();
}

function number(value = 0) {
  return Number(value || 0);
}

function iso(value, { dateOnly = false } = {}) {
  const text = value?.toISOString?.() || String(value || "");
  return dateOnly ? text.slice(0, 10) : text;
}

function normalizeDispatchSourceRowIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) {
    throw new Error("sourceRowIds must contain from 1 to 200 entries");
  }
  const seen = new Set();
  const sourceRowIds = [];
  for (const rawId of value) {
    if (typeof rawId !== "string") throw new Error("sourceRowIds must contain nonempty strings");
    const sourceRowId = rawId.trim();
    if (!sourceRowId) throw new Error("sourceRowIds must contain nonempty strings");
    if (seen.has(sourceRowId)) continue;
    seen.add(sourceRowId);
    sourceRowIds.push(sourceRowId);
  }
  if (!sourceRowIds.length) throw new Error("sourceRowIds must contain at least one nonempty string");
  return sourceRowIds;
}

function normalizeDispatchWorkCenterIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("workCenterIds must contain from 1 to 100 entries");
  }
  const seen = new Set();
  const workCenterIds = [];
  for (const rawId of value) {
    if (typeof rawId !== "string") throw new Error("workCenterIds must contain nonempty strings");
    const workCenterId = rawId.trim();
    if (!workCenterId) throw new Error("workCenterIds must contain nonempty strings");
    if (seen.has(workCenterId)) continue;
    seen.add(workCenterId);
    workCenterIds.push(workCenterId);
  }
  if (!workCenterIds.length) throw new Error("workCenterIds must contain at least one nonempty string");
  return workCenterIds;
}

function normalizeDispatchDateKey(value) {
  if (typeof value !== "string") throw new Error("dateKey must be a strict YYYY-MM-DD string");
  const dateKey = value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("dateKey must be a strict YYYY-MM-DD string");
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey) {
    throw new Error("dateKey must be a valid calendar date");
  }
  return dateKey;
}

export async function assertShiftExecutionCommandAuthorityWritable(tx) {
  // Serialize the short compatibility cutover against every command. A
  // command that started first completes before the migration observes the
  // target; a command that starts after the pending marker fails closed.
  await tx`SELECT pg_advisory_xact_lock_shared(hashtext('mes:shift-execution-postgres-authority'))`;
  const rows = await tx`
    SELECT mode FROM shift_execution_authority
    WHERE authority_key = 'shared-ui-shift-execution-v1'
    LIMIT 1
  `;
  if (["transition-pending", "rollback-pending"].includes(rows[0]?.mode)) {
    const error = new Error("Shift Execution PostgreSQL authority transition is pending");
    error.code = "SHIFT_EXECUTION_AUTHORITY_TRANSITION_PENDING";
    throw error;
  }
}

function compactExecutor(row) {
  return { employeeId: row.employee_id, quantity: number(row.quantity), note: row.note || "" };
}

function compactFact(row) {
  return {
    id: row.id,
    assignmentId: row.shift_assignment_id,
    actualQuantity: number(row.actual_quantity),
    defectQuantity: number(row.defect_quantity),
    laborMinutes: number(row.labor_minutes),
    executorCount: number(row.executor_count),
    comment: row.comment || "",
    deviationComment: row.deviation_comment || "",
    reportedAt: iso(row.reported_at),
  };
}

function compactCarryover(row) {
  return {
    id: row.id,
    sourceAssignmentId: row.source_assignment_id,
    sourceRowId: row.source_row_id || "",
    sourceSlotId: row.source_slot_id,
    workOrderId: row.work_order_id,
    operationId: row.work_order_operation_id,
    dateKey: iso(row.date_key, { dateOnly: true }),
    remainingQuantity: number(row.remaining_quantity),
    reason: row.reason || "",
    workCenterId: row.work_center_id || "",
    createdAt: iso(row.created_at),
  };
}

function hasSameCarryoverIntent(row = {}, carryover = {}) {
  return String(row.source_assignment_id || "") === String(carryover.sourceAssignmentId || "")
    && String(row.source_slot_id || "") === String(carryover.sourceSlotId || "")
    && String(row.work_order_id || "") === String(carryover.workOrderId || "")
    && String(row.work_order_operation_id || "") === String(carryover.operationId || "")
    && String(row.work_center_id || "") === String(carryover.workCenterId || "")
    && iso(row.date_key, { dateOnly: true }) === String(carryover.dateKey || "")
    && number(row.remaining_quantity) === number(carryover.remainingQuantity)
    && String(row.reason || "") === String(carryover.reason || "");
}

// A compact, bounded overlay for one currently visible board scope. It is
// deliberately separate from the legacy full aggregate: the client already
// owns slot/source context, so JSONB replay payloads and historic activity do
// not need to cross the wire on every board refresh.
export function assembleShiftExecutionDispatchProjection(rows = [], executorRows = [], factRows = [], carryoverRows = []) {
  const executorsByAssignment = new Map();
  executorRows.forEach((row) => {
    const list = executorsByAssignment.get(row.shift_assignment_id) || [];
    list.push(compactExecutor(row));
    executorsByAssignment.set(row.shift_assignment_id, list);
  });
  const factByAssignment = new Map();
  factRows.forEach((row) => {
    // listDispatch selects DISTINCT ON (assignment), but retaining the first
    // row here makes the boundary deterministic if a fixture or adapter ever
    // returns a duplicate.
    if (!factByAssignment.has(row.shift_assignment_id)) factByAssignment.set(row.shift_assignment_id, compactFact(row));
  });
  return {
    items: rows.map((row) => ({
      id: row.id,
      sourceRowId: row.source_row_id,
      sourceSlotId: row.source_slot_id,
      workOrderId: row.work_order_id,
      operationId: row.work_order_operation_id,
      workCenterId: row.work_center_id,
      resourceId: row.resource_id,
      masterId: row.master_id,
      plannedQuantity: number(row.planned_quantity),
      assignedQuantity: number(row.assigned_quantity),
      unit: row.unit,
      status: row.status,
      revision: number(row.revision),
      issuedAt: iso(row.issued_at),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      executors: executorsByAssignment.get(row.id) || [],
      facts: factByAssignment.has(row.id) ? [factByAssignment.get(row.id)] : [],
    })),
    carryovers: carryoverRows.map(compactCarryover),
  };
}

// Pure projection boundary shared by API reads and regression QA. Tables stay
// private to PostgreSQL; callers receive stable assignment aggregates only.
export function assembleShiftExecutionAggregates(rows = [], executorRows = [], factRows = [], carryoverRows = []) {
  const executorsByAssignment = new Map();
  executorRows.forEach((row) => {
    const list = executorsByAssignment.get(row.shift_assignment_id) || [];
    list.push({ employeeId: row.employee_id, quantity: number(row.quantity), note: row.note || "" });
    executorsByAssignment.set(row.shift_assignment_id, list);
  });
  const factsByAssignment = new Map();
  factRows.forEach((row) => {
    const list = factsByAssignment.get(row.shift_assignment_id) || [];
    list.push({
      id: row.id, assignmentId: row.shift_assignment_id,
      actualQuantity: number(row.actual_quantity), defectQuantity: number(row.defect_quantity),
      laborMinutes: number(row.labor_minutes), executorCount: number(row.executor_count),
      comment: row.comment || "", deviationComment: row.deviation_comment || "",
      reportedAt: iso(row.reported_at), sourcePayload: row.source_payload || {},
    });
    factsByAssignment.set(row.shift_assignment_id, list);
  });
  const carryoversByAssignment = new Map();
  carryoverRows.forEach((row) => {
    const list = carryoversByAssignment.get(row.source_assignment_id) || [];
    list.push({
      id: row.id, sourceAssignmentId: row.source_assignment_id, sourceSlotId: row.source_slot_id,
      workOrderId: row.work_order_id, operationId: row.work_order_operation_id,
      dateKey: iso(row.date_key, { dateOnly: true }), remainingQuantity: number(row.remaining_quantity),
      reason: row.reason || "", workCenterId: row.work_center_id || "", createdAt: iso(row.created_at),
      sourcePayload: row.source_payload || {},
    });
    carryoversByAssignment.set(row.source_assignment_id, list);
  });
  return rows.map((row) => ({
    id: row.id, sourceRowId: row.source_row_id, sourceSlotId: row.source_slot_id,
    workOrderId: row.work_order_id, operationId: row.work_order_operation_id,
    workCenterId: row.work_center_id, resourceId: row.resource_id, masterId: row.master_id,
    plannedQuantity: number(row.planned_quantity), assignedQuantity: number(row.assigned_quantity),
    unit: row.unit, status: row.status, revision: number(row.revision), issuedAt: iso(row.issued_at),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), sourcePayload: row.source_payload || {},
    executors: executorsByAssignment.get(row.id) || [], facts: factsByAssignment.get(row.id) || [],
    carryovers: carryoversByAssignment.get(row.id) || [],
  }));
}

export function createShiftExecutionReadRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  sql: injectedSql = null,
} = {}) {
  if (!databaseUrl && !injectedSql) throw new Error("DATABASE_URL is required for shift execution read storage");
  const sql = injectedSql || getReadClient(databaseUrl);

  return {
    storageMode: "postgres",
    storageBackend: "postgresql",
    async summary() {
      const [row] = await sql`
        SELECT
          (SELECT count(*) FROM shift_assignments)::int AS assignment_count,
          (SELECT count(*) FROM shift_assignment_executors)::int AS executor_count,
          (SELECT count(*) FROM shift_facts)::int AS fact_count,
          (SELECT count(*) FROM shift_carryovers WHERE canceled_at IS NULL)::int AS carryover_count,
          COALESCE((SELECT max(updated_at) FROM shift_assignments), (SELECT max(reported_at) FROM shift_facts)) AS updated_at
      `;
      return {
        storageMode: "postgres",
        storageBackend: "postgresql",
        configured: true,
        updatedAt: row?.updated_at?.toISOString?.() || "",
        summary: {
          assignmentCount: number(row?.assignment_count),
          executorCount: number(row?.executor_count),
          factCount: number(row?.fact_count),
          carryoverCount: number(row?.carryover_count),
        },
      };
    },
    async findActiveResourceDependencies(resourceIds = []) {
      const normalizedIds = [...new Set((Array.isArray(resourceIds) ? resourceIds : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean))];
      if (!normalizedIds.length) return { storageMode: "postgres", storageBackend: "postgresql", configured: true, items: [] };
      const rows = await sql`
        SELECT id, work_order_id, work_order_operation_id, resource_id, status
        FROM shift_assignments
        WHERE resource_id = ANY(${normalizedIds})
          AND COALESCE(status, '') NOT IN ('completed', 'done', 'closed', 'canceled', 'cancelled', 'archived')
        ORDER BY updated_at DESC, id
        LIMIT 100
      `;
      return {
        storageMode: "postgres",
        storageBackend: "postgresql",
        configured: true,
        items: rows.map((row) => ({
          kind: "shift-assignment",
          id: String(row.id || ""),
          workOrderId: String(row.work_order_id || ""),
          operationId: String(row.work_order_operation_id || ""),
          equipmentId: String(row.resource_id || ""),
          status: String(row.status || ""),
        })),
      };
    },
    async list({ limit = 100 } = {}) {
      const boundedLimit = Math.max(1, Math.min(500, Math.trunc(number(limit) || 100)));
      const rows = await sql`
        SELECT id, source_row_id, source_slot_id, work_order_id, work_order_operation_id,
               work_center_id, resource_id, master_id, planned_quantity, assigned_quantity,
               unit, status, revision, issued_at, created_at, updated_at, source_payload
        FROM shift_assignments
        ORDER BY updated_at DESC, id
        LIMIT ${boundedLimit}
      `;
      // Read a complete aggregate projection rather than leaking a set of
      // unrelated tables to the browser. The source snapshot can therefore be
      // replaced one aggregate at a time without changing the workshop view.
      const [executorRows, factRows, carryoverRows] = await Promise.all([
        sql`SELECT shift_assignment_id, employee_id, quantity, note
            FROM shift_assignment_executors
            WHERE shift_assignment_id IN (
              SELECT id FROM shift_assignments ORDER BY updated_at DESC, id LIMIT ${boundedLimit}
            )
            ORDER BY shift_assignment_id, employee_id`,
        sql`SELECT id, shift_assignment_id, actual_quantity, defect_quantity, labor_minutes,
                   executor_count, comment, deviation_comment, reported_at, source_payload
            FROM shift_facts
            WHERE shift_assignment_id IN (
              SELECT id FROM shift_assignments ORDER BY updated_at DESC, id LIMIT ${boundedLimit}
            )
            ORDER BY shift_assignment_id, reported_at DESC, id DESC`,
        sql`SELECT id, source_assignment_id, source_slot_id, work_order_id,
                   work_order_operation_id, date_key, remaining_quantity, reason,
                   work_center_id, created_at, source_payload
            FROM shift_carryovers
            WHERE canceled_at IS NULL
              AND source_assignment_id IN (
              SELECT id FROM shift_assignments ORDER BY updated_at DESC, id LIMIT ${boundedLimit}
            )
            ORDER BY source_assignment_id, created_at DESC, id DESC`,
      ]);
      return {
        storageMode: "postgres",
        storageBackend: "postgresql",
        configured: true,
        items: assembleShiftExecutionAggregates(rows, executorRows, factRows, carryoverRows),
      };
    },
    async listDispatch({ sourceRowIds, workCenterIds, dateKey } = {}) {
      const scope = {
        sourceRowIds: normalizeDispatchSourceRowIds(sourceRowIds),
        workCenterIds: normalizeDispatchWorkCenterIds(workCenterIds),
        dateKey: normalizeDispatchDateKey(dateKey),
      };
      const { rows, executorRows, factRows, carryoverRows } = await sql.begin(
        "isolation level repeatable read read only",
        async (tx) => {
          // Never fall back to the globally most-recent assignment list here:
          // a master board owns its visible source rows and needs a snapshot
          // only for that bounded scope.
          const foundRows = await tx`
            SELECT id, source_row_id, source_slot_id, work_order_id, work_order_operation_id,
                   work_center_id, resource_id, master_id, planned_quantity, assigned_quantity,
                   unit, status, revision, issued_at, created_at, updated_at
            FROM shift_assignments
            WHERE source_row_id = ANY(${scope.sourceRowIds})
          `;
          const rowsBySourceRowId = new Map(foundRows.map((row) => [row.source_row_id, row]));
          const orderedRows = scope.sourceRowIds.map((sourceRowId) => rowsBySourceRowId.get(sourceRowId)).filter(Boolean);
          const assignmentIds = orderedRows.map((row) => row.id);
          // Run the same fixed four-query shape for an empty scope too. The
          // two child reads receive an empty actual-ID array and therefore do
          // no aggregate scan, while callers retain one predictable snapshot
          // contract and still receive date-scoped carryovers.
          const [executorRows, factRows, carryoverRows] = await Promise.all([
            tx`
              SELECT shift_assignment_id, employee_id, quantity, note
              FROM shift_assignment_executors
              WHERE shift_assignment_id = ANY(${assignmentIds})
              ORDER BY shift_assignment_id, employee_id
            `,
            tx`
              SELECT DISTINCT ON (shift_assignment_id)
                     id, shift_assignment_id, actual_quantity, defect_quantity, labor_minutes,
                     executor_count, comment, deviation_comment, reported_at
              FROM shift_facts
              WHERE shift_assignment_id = ANY(${assignmentIds})
              ORDER BY shift_assignment_id, reported_at DESC, id DESC
            `,
            tx`
              SELECT carryover.id, carryover.source_assignment_id, assignment.source_row_id,
                     carryover.source_slot_id, carryover.work_order_id,
                     carryover.work_order_operation_id, carryover.date_key, carryover.remaining_quantity,
                     carryover.reason, carryover.work_center_id, carryover.created_at
              FROM shift_carryovers AS carryover
              JOIN shift_assignments AS assignment ON assignment.id = carryover.source_assignment_id
              WHERE carryover.date_key = ${scope.dateKey}
                AND carryover.work_center_id = ANY(${scope.workCenterIds})
                AND carryover.canceled_at IS NULL
              ORDER BY carryover.work_center_id, carryover.source_slot_id, carryover.created_at DESC, carryover.id DESC
            `,
          ]);
          return { rows: orderedRows, executorRows, factRows, carryoverRows };
        },
      );
      const projection = assembleShiftExecutionDispatchProjection(rows, executorRows, factRows, carryoverRows);
      return {
        storageMode: "postgres",
        storageBackend: "postgresql",
        configured: true,
        scope,
        coveredSourceRowIds: scope.sourceRowIds,
        // The endpoint is intentionally a partial overlay, not a replacement
        // for the legacy global read model while the client migration rolls
        // out. A caller may only remove records in coveredSourceRowIds.
        coverageComplete: false,
        ...projection,
      };
    },
    async commandReadiness() {
      const rows = await sql`SELECT version FROM mes_schema_migrations WHERE version IN ('014_shift_execution_command_idempotency', '015_shift_execution_assignment_revisions', '016_shift_execution_fact_idempotency', '017_shift_execution_carryover_idempotency', '022_shift_execution_carryover_lifecycle', '025_shift_execution_postgres_authority')`;
      const versions = new Set(rows.map((row) => row.version));
      return { schemaReady: versions.has('014_shift_execution_command_idempotency') && versions.has('015_shift_execution_assignment_revisions') && versions.has('016_shift_execution_fact_idempotency') && versions.has('017_shift_execution_carryover_idempotency') && versions.has('022_shift_execution_carryover_lifecycle') && versions.has('025_shift_execution_postgres_authority') };
    },
    async getCommandTargetContext({ assignmentId = "", carryoverId = "", workOrderId = "", operationId = "" } = {}) {
      const normalizedAssignmentId = String(assignmentId || "").trim();
      const normalizedCarryoverId = String(carryoverId || "").trim();
      const normalizedWorkOrderId = String(workOrderId || "").trim();
      const normalizedOperationId = String(operationId || "").trim();
      const hasOperationTarget = Boolean(normalizedWorkOrderId && normalizedOperationId);
      const targetCount = Number(Boolean(normalizedAssignmentId)) + Number(Boolean(normalizedCarryoverId)) + Number(hasOperationTarget);
      if (targetCount !== 1 || Boolean(normalizedWorkOrderId) !== Boolean(normalizedOperationId)) {
        throw new Error("Exactly one Shift Execution command target id is required");
      }
      if (hasOperationTarget) {
        const rows = await sql`
          SELECT id, work_order_id, work_center_id
          FROM work_order_operations
          WHERE id = ${normalizedOperationId}
            AND work_order_id = ${normalizedWorkOrderId}
          LIMIT 1
        `;
        return {
          item: rows[0] ? {
            kind: "work-order-operation",
            id: String(rows[0].id || ""),
            operationId: String(rows[0].id || ""),
            workOrderId: String(rows[0].work_order_id || ""),
            workCenterId: String(rows[0].work_center_id || ""),
          } : null,
        };
      }
      if (normalizedAssignmentId) {
        const rows = await sql`
          SELECT id, source_row_id, source_slot_id, work_order_id, work_order_operation_id, work_center_id
          FROM shift_assignments
          WHERE id = ${normalizedAssignmentId}
          LIMIT 1
        `;
        return {
          item: rows[0] ? {
            kind: "assignment",
            id: String(rows[0].id || ""),
            assignmentId: String(rows[0].id || ""),
            sourceRowId: String(rows[0].source_row_id || ""),
            sourceSlotId: String(rows[0].source_slot_id || ""),
            workOrderId: String(rows[0].work_order_id || ""),
            operationId: String(rows[0].work_order_operation_id || ""),
            workCenterId: String(rows[0].work_center_id || ""),
          } : null,
        };
      }
      const rows = await sql`
        SELECT carryover.id, carryover.source_assignment_id, carryover.work_center_id
        FROM shift_carryovers AS carryover
        WHERE carryover.id = ${normalizedCarryoverId}
        LIMIT 1
      `;
      return {
        item: rows[0] ? {
          kind: "carryover",
          id: String(rows[0].id || ""),
          assignmentId: String(rows[0].source_assignment_id || ""),
          workCenterId: String(rows[0].work_center_id || ""),
        } : null,
      };
    },
    async getAuthority() {
      const rows = await sql`
        SELECT mode, transition_id, source_snapshot_version, source_digest,
               source_counts, source_export_path, activated_at
        FROM shift_execution_authority
        WHERE authority_key = 'shared-ui-shift-execution-v1'
        LIMIT 1
      `;
      const row = rows[0];
      return row ? {
        mode: String(row.mode || ""), transitionId: String(row.transition_id || ""),
        sourceSnapshotVersion: Number(row.source_snapshot_version || 0), sourceDigest: String(row.source_digest || ""),
        sourceCounts: row.source_counts || {}, sourceExportPath: String(row.source_export_path || ""),
        activatedAt: row.activated_at?.toISOString?.() || String(row.activated_at || ""),
      } : null;
    },
    async close() {},
  };
}

// Command storage is separate from the read repository so it can be shipped
// with a disabled feature flag. The snapshot bridge must be enabled explicitly
// before a browser is allowed to create assignments through this path.
export function createShiftExecutionCommandRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  sql: injectedSql = null,
  authorityGuard = null,
  resourceDependencyLock = null,
  resourceDependencyGuard = null,
} = {}) {
  if (!databaseUrl && !injectedSql) throw new Error("DATABASE_URL is required for shift execution command storage");
  const sql = injectedSql || postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const ensureAuthorityWritable = authorityGuard
    || (injectedSql ? async () => {} : assertShiftExecutionCommandAuthorityWritable);
  const acquireResourceDependencyLock = resourceDependencyLock
    || (injectedSql ? async () => {} : acquireProductionResourceDependencySharedLock);
  const ensureResourceDependenciesWritable = resourceDependencyGuard
    || (injectedSql ? async () => {} : assertProductionResourceDependenciesWritable);
  const ensureCommandWritable = async (tx) => {
    await ensureAuthorityWritable(tx);
    await acquireResourceDependencyLock(tx);
  };
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  const project = (row) => ({
    id: row.id, sourceRowId: row.source_row_id, sourceSlotId: row.source_slot_id,
    workOrderId: row.work_order_id, operationId: row.work_order_operation_id,
    workCenterId: row.work_center_id, resourceId: row.resource_id, masterId: row.master_id,
    plannedQuantity: number(row.planned_quantity), assignedQuantity: number(row.assigned_quantity),
    unit: row.unit, status: row.status, revision: number(row.revision), issuedAt: row.issued_at?.toISOString?.() || "",
    createdAt: row.created_at?.toISOString?.() || "", updatedAt: row.updated_at?.toISOString?.() || "",
  });
  const requireAuthorizedWorkCenter = (input = {}) => {
    const workCenterId = String(input.authorizedWorkCenterId || "").trim();
    if (!workCenterId) {
      const error = new Error("Authorized Shift Execution work center is required");
      error.code = "SHIFT_EXECUTION_AUTHORIZATION_CONTEXT_REQUIRED";
      throw error;
    }
    return workCenterId;
  };
  const assertAuthorizedWorkCenter = (actualWorkCenterId, authorizedWorkCenterId) => {
    if (String(actualWorkCenterId || "").trim() !== String(authorizedWorkCenterId || "").trim()) {
      const error = new Error("Shift Execution command target changed after authorization");
      error.code = "SHIFT_EXECUTION_AUTHORIZATION_CONTEXT_CHANGED";
      throw error;
    }
  };
  const assertCanonicalReference = (actual, expected) => {
    if (String(actual || "").trim() !== String(expected || "").trim()) {
      const error = new Error("Shift Execution command reference changed after authorization");
      error.code = "SHIFT_EXECUTION_AUTHORIZATION_CONTEXT_CHANGED";
      throw error;
    }
  };
  const buildValidatedCommand = (builder, input) => {
    try { return builder(input); }
    catch (error) {
      error.code = "SHIFT_EXECUTION_COMMAND_INVALID";
      throw error;
    }
  };
  return {
    async createAssignment(input = {}) {
      const command = buildValidatedCommand(buildShiftAssignmentCommand, input);
      const authorizedWorkCenterId = requireAuthorizedWorkCenter(input);
      assertAuthorizedWorkCenter(command.assignment.workCenterId, authorizedWorkCenterId);
      return sql.begin(async (tx) => {
        await ensureCommandWritable(tx);
        const existing = await tx`
          SELECT assignment.* FROM shift_execution_command_requests request
          JOIN shift_assignments assignment ON assignment.id = request.shift_assignment_id
          WHERE request.idempotency_key = ${command.idempotencyKey}
          LIMIT 1
        `;
        if (existing[0]) {
          assertAuthorizedWorkCenter(existing[0].work_center_id, authorizedWorkCenterId);
          const request = await tx`SELECT request_fingerprint FROM shift_execution_command_requests WHERE idempotency_key = ${command.idempotencyKey}`;
          if (request[0]?.request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another shift assignment");
          return { ...metadata, created: false, item: project(existing[0]) };
        }
        const operation = await tx`
          SELECT id, work_center_id FROM work_order_operations
          WHERE id = ${command.assignment.operationId} AND work_order_id = ${command.assignment.workOrderId}
          FOR SHARE
        `;
        if (!operation[0]) return { ...metadata, created: false, item: null, error: "Work-order operation was not found" };
        assertAuthorizedWorkCenter(operation[0].work_center_id, authorizedWorkCenterId);
        const duplicateSource = await tx`SELECT id FROM shift_assignments WHERE source_row_id = ${command.assignment.sourceRowId} LIMIT 1`;
        if (duplicateSource[0]) return { ...metadata, created: false, item: null, error: "Shift assignment already exists for this source row" };
        const row = command.assignment;
        await ensureResourceDependenciesWritable(tx, [row.resourceId]);
        const inserted = await tx`
          INSERT INTO shift_assignments (id, source_row_id, source_slot_id, work_order_id, work_order_operation_id, work_center_id, resource_id, master_id, planned_quantity, assigned_quantity, unit, status, issued_at, source_payload)
          VALUES (${row.id}, ${row.sourceRowId}, ${row.sourceSlotId}, ${row.workOrderId}, ${row.operationId}, ${row.workCenterId}, ${row.resourceId}, ${row.masterId}, ${row.plannedQuantity}, ${row.assignedQuantity}, ${row.unit}, ${row.status}, ${row.issuedAt || null}, ${tx.json({ command: "create_assignment", source: row.sourcePayload })})
          RETURNING *
        `;
        if (row.executors.length) {
          for (const executor of row.executors) {
            await tx`
              INSERT INTO shift_assignment_executors (shift_assignment_id, employee_id, quantity, note)
              VALUES (${row.id}, ${executor.employeeId}, ${executor.quantity}, ${executor.note})
            `;
          }
        }
        await tx`
          INSERT INTO shift_execution_command_requests (idempotency_key, request_fingerprint, shift_assignment_id, actor_id)
          VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${row.id}, ${String(input.actorId || "")})
        `;
        return { ...metadata, created: true, item: project(inserted[0]) };
      });
    },
    async updateAssignment(input = {}) {
      const command = buildValidatedCommand(buildShiftAssignmentUpdateCommand, input);
      const authorizedWorkCenterId = requireAuthorizedWorkCenter(input);
      assertAuthorizedWorkCenter(command.assignment.workCenterId, authorizedWorkCenterId);
      return sql.begin(async (tx) => {
        await ensureCommandWritable(tx);
        const replay = await tx`
          SELECT request_fingerprint, shift_assignment_id FROM shift_execution_mutation_requests
          WHERE idempotency_key = ${command.idempotencyKey} LIMIT 1
        `;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another shift assignment mutation");
          const existing = await tx`SELECT * FROM shift_assignments WHERE id = ${replay[0].shift_assignment_id} LIMIT 1`;
          if (existing[0]) assertAuthorizedWorkCenter(existing[0].work_center_id, authorizedWorkCenterId);
          return { ...metadata, created: false, conflict: false, item: existing[0] ? project(existing[0]) : null };
        }
        const current = await tx`SELECT * FROM shift_assignments WHERE id = ${command.assignmentId} FOR UPDATE`;
        if (!current[0]) return { ...metadata, created: false, conflict: false, item: null, error: "Shift assignment was not found" };
        assertAuthorizedWorkCenter(current[0].work_center_id, authorizedWorkCenterId);
        assertCanonicalReference(current[0].source_row_id, command.assignment.sourceRowId);
        assertCanonicalReference(current[0].source_slot_id, command.assignment.sourceSlotId);
        assertCanonicalReference(current[0].work_order_id, command.assignment.workOrderId);
        assertCanonicalReference(current[0].work_order_operation_id, command.assignment.operationId);
        const operation = await tx`
          SELECT id, work_center_id FROM work_order_operations
          WHERE id = ${command.assignment.operationId} AND work_order_id = ${command.assignment.workOrderId}
          FOR SHARE
        `;
        if (!operation[0]) return { ...metadata, created: false, conflict: false, item: null, error: "Work-order operation was not found" };
        assertAuthorizedWorkCenter(operation[0].work_center_id, authorizedWorkCenterId);
        if (number(current[0].revision) !== command.expectedRevision) {
          return { ...metadata, created: false, conflict: true, item: project(current[0]), error: "Shift assignment changed by another user" };
        }
        const row = command.assignment;
        await ensureResourceDependenciesWritable(tx, [row.resourceId]);
        const [updated] = await tx`
          UPDATE shift_assignments
          SET source_slot_id = ${row.sourceSlotId}, work_order_id = ${row.workOrderId}, work_order_operation_id = ${row.operationId},
              work_center_id = ${row.workCenterId}, resource_id = ${row.resourceId}, master_id = ${row.masterId},
              planned_quantity = ${row.plannedQuantity}, assigned_quantity = ${row.assignedQuantity}, unit = ${row.unit}, status = ${row.status}, issued_at = ${row.issuedAt || null},
              source_payload = ${tx.json({ command: "update_assignment", source: row.sourcePayload })},
              revision = revision + 1, updated_at = now()
          WHERE id = ${command.assignmentId}
          RETURNING *
        `;
        await tx`DELETE FROM shift_assignment_executors WHERE shift_assignment_id = ${command.assignmentId}`;
        for (const executor of row.executors) {
          await tx`
            INSERT INTO shift_assignment_executors (shift_assignment_id, employee_id, quantity, note)
            VALUES (${command.assignmentId}, ${executor.employeeId}, ${executor.quantity}, ${executor.note})
          `;
        }
        await tx`
          INSERT INTO shift_execution_mutation_requests (idempotency_key, request_fingerprint, shift_assignment_id, resulting_revision, actor_id)
          VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${command.assignmentId}, ${number(updated.revision)}, ${String(input.actorId || "")})
        `;
        return { ...metadata, created: false, conflict: false, item: project(updated) };
      });
    },
    async recordFact(input = {}) {
      const command = buildValidatedCommand(buildShiftFactCommand, input);
      const authorizedWorkCenterId = requireAuthorizedWorkCenter(input);
      return sql.begin(async (tx) => {
        await ensureCommandWritable(tx);
        const replay = await tx`SELECT request_fingerprint, shift_fact_id FROM shift_execution_fact_requests WHERE idempotency_key = ${command.idempotencyKey} LIMIT 1`;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another shift fact");
          const fact = await tx`
            SELECT fact.*, assignment.work_center_id
            FROM shift_facts AS fact
            JOIN shift_assignments AS assignment ON assignment.id = fact.shift_assignment_id
            WHERE fact.id = ${replay[0].shift_fact_id}
            LIMIT 1
          `;
          if (fact[0]) assertAuthorizedWorkCenter(fact[0].work_center_id, authorizedWorkCenterId);
          return { ...metadata, created: false, item: fact[0] || null };
        }
        const assignment = await tx`SELECT id, work_center_id FROM shift_assignments WHERE id = ${command.fact.assignmentId} FOR SHARE`;
        if (!assignment[0]) return { ...metadata, created: false, item: null, error: "Shift assignment was not found" };
        assertAuthorizedWorkCenter(assignment[0].work_center_id, authorizedWorkCenterId);
        const fact = command.fact;
        const [inserted] = await tx`
          INSERT INTO shift_facts (id, shift_assignment_id, actual_quantity, defect_quantity, labor_minutes, executor_count, comment, deviation_comment, reported_at, source_payload)
          VALUES (${fact.id}, ${fact.assignmentId}, ${fact.actualQuantity}, ${fact.defectQuantity}, ${fact.laborMinutes}, ${fact.executorCount}, ${fact.comment}, ${fact.deviationComment}, ${fact.reportedAt}, ${tx.json({ command: "record_fact" })})
          RETURNING *
        `;
        await tx`INSERT INTO shift_execution_fact_requests (idempotency_key, request_fingerprint, shift_fact_id, actor_id) VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${fact.id}, ${String(input.actorId || "")})`;
        return { ...metadata, created: true, item: inserted };
      });
    },
    async createCarryover(input = {}) {
      const command = buildValidatedCommand(buildShiftCarryoverCommand, input);
      const authorizedWorkCenterId = requireAuthorizedWorkCenter(input);
      assertAuthorizedWorkCenter(command.carryover.workCenterId, authorizedWorkCenterId);
      return sql.begin(async (tx) => {
        await ensureCommandWritable(tx);
        const replay = await tx`SELECT request_fingerprint, shift_carryover_id FROM shift_execution_carryover_requests WHERE idempotency_key = ${command.idempotencyKey} LIMIT 1`;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another carryover");
          const item = await tx`SELECT * FROM shift_carryovers WHERE id = ${replay[0].shift_carryover_id} LIMIT 1`;
          if (item[0]) assertAuthorizedWorkCenter(item[0].work_center_id, authorizedWorkCenterId);
          return { ...metadata, created: false, item: item[0] || null };
        }
        const item = command.carryover;
        const assignment = await tx`
          SELECT id, source_slot_id, work_order_id, work_order_operation_id, work_center_id
          FROM shift_assignments
          WHERE id = ${item.sourceAssignmentId}
          FOR SHARE
        `;
        if (!assignment[0]) return { ...metadata, created: false, item: null, error: "Shift assignment was not found" };
        assertAuthorizedWorkCenter(assignment[0].work_center_id, authorizedWorkCenterId);
        assertCanonicalReference(assignment[0].source_slot_id, item.sourceSlotId);
        assertCanonicalReference(assignment[0].work_order_id, item.workOrderId);
        assertCanonicalReference(assignment[0].work_order_operation_id, item.operationId);
        // The partial unique index installed by the lifecycle migration makes
        // this atomic even when two browser retries race.  A semantic retry
        // with a fresh idempotency key gets the canonical active row; a
        // materially different carryover must explicitly cancel first so no
        // audit obligation is silently overwritten.
        const inserted = await tx`
          INSERT INTO shift_carryovers (id, source_assignment_id, source_slot_id, work_order_id, work_order_operation_id, date_key, remaining_quantity, reason, work_center_id, source_payload)
          VALUES (${item.id}, ${item.sourceAssignmentId}, ${item.sourceSlotId}, ${item.workOrderId}, ${item.operationId}, ${item.dateKey}, ${item.remainingQuantity}, ${item.reason}, ${item.workCenterId}, ${tx.json({ command: "create_carryover" })})
          ON CONFLICT (source_assignment_id, date_key) WHERE canceled_at IS NULL DO NOTHING
          RETURNING *
        `;
        if (inserted[0]) {
          await tx`INSERT INTO shift_execution_carryover_requests (idempotency_key, request_fingerprint, shift_carryover_id, actor_id) VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${item.id}, ${String(input.actorId || "")})`;
          return { ...metadata, created: true, item: inserted[0] };
        }
        const active = await tx`
          SELECT * FROM shift_carryovers
          WHERE source_assignment_id = ${item.sourceAssignmentId}
            AND date_key = ${item.dateKey}
            AND canceled_at IS NULL
          LIMIT 1
        `;
        const existing = active[0] || null;
        if (!existing) return { ...metadata, created: false, item: null, error: "Active shift carryover was not found after a concurrent create" };
        if (!hasSameCarryoverIntent(existing, item)) {
          return { ...metadata, created: false, conflict: true, item: existing, error: "Active shift carryover already exists for this assignment and date" };
        }
        await tx`INSERT INTO shift_execution_carryover_requests (idempotency_key, request_fingerprint, shift_carryover_id, actor_id) VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${existing.id}, ${String(input.actorId || "")})`;
        return { ...metadata, created: false, item: existing };
      });
    },
    async cancelCarryover(input = {}) {
      const command = buildValidatedCommand(buildShiftCarryoverCancelCommand, input);
      const authorizedWorkCenterId = requireAuthorizedWorkCenter(input);
      return sql.begin(async (tx) => {
        await ensureCommandWritable(tx);
        const replay = await tx`
          SELECT request_fingerprint, shift_carryover_id
          FROM shift_execution_carryover_cancellation_requests
          WHERE idempotency_key = ${command.idempotencyKey}
          LIMIT 1
        `;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) {
            throw new Error("Idempotency key was already used for another shift carryover cancellation");
          }
          const item = await tx`SELECT * FROM shift_carryovers WHERE id = ${replay[0].shift_carryover_id} LIMIT 1`;
          if (item[0]) assertAuthorizedWorkCenter(item[0].work_center_id, authorizedWorkCenterId);
          return { ...metadata, created: false, item: item[0] || null };
        }
        const current = await tx`SELECT * FROM shift_carryovers WHERE id = ${command.carryoverId} FOR UPDATE`;
        if (!current[0]) return { ...metadata, created: false, item: null, error: "Shift carryover was not found" };
        assertAuthorizedWorkCenter(current[0].work_center_id, authorizedWorkCenterId);
        let item = current[0];
        let canceled = false;
        if (!item.canceled_at) {
          const updated = await tx`
            UPDATE shift_carryovers
            SET canceled_at = now(),
                canceled_by = ${String(input.actorId || "")},
                cancellation_reason = ${command.cancellationReason}
            WHERE id = ${command.carryoverId}
              AND canceled_at IS NULL
            RETURNING *
          `;
          item = updated[0] || item;
          canceled = Boolean(updated[0]);
        }
        await tx`
          INSERT INTO shift_execution_carryover_cancellation_requests (idempotency_key, request_fingerprint, shift_carryover_id, actor_id)
          VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${command.carryoverId}, ${String(input.actorId || "")})
        `;
        return { ...metadata, created: canceled, item };
      });
    },
    async close() { if (!injectedSql) await sql.end({ timeout: 5 }); },
  };
}
