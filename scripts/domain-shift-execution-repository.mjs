import postgres from "postgres";
import { buildShiftAssignmentCommand, buildShiftAssignmentUpdateCommand, buildShiftFactCommand, buildShiftCarryoverCommand } from "../src/domain/shift_execution_assignment.js";

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
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for shift execution read storage");
  const sql = getReadClient(databaseUrl);

  return {
    storageMode: "postgres",
    storageBackend: "postgresql",
    async summary() {
      const [row] = await sql`
        SELECT
          (SELECT count(*) FROM shift_assignments)::int AS assignment_count,
          (SELECT count(*) FROM shift_assignment_executors)::int AS executor_count,
          (SELECT count(*) FROM shift_facts)::int AS fact_count,
          (SELECT count(*) FROM shift_carryovers)::int AS carryover_count,
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
            WHERE source_assignment_id IN (
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
    async commandReadiness() {
      const rows = await sql`SELECT version FROM mes_schema_migrations WHERE version IN ('014_shift_execution_command_idempotency', '015_shift_execution_assignment_revisions', '016_shift_execution_fact_idempotency', '017_shift_execution_carryover_idempotency')`;
      const versions = new Set(rows.map((row) => row.version));
      return { schemaReady: versions.has('014_shift_execution_command_idempotency') && versions.has('015_shift_execution_assignment_revisions') && versions.has('016_shift_execution_fact_idempotency') && versions.has('017_shift_execution_carryover_idempotency') };
    },
    async close() {},
  };
}

// Command storage is separate from the read repository so it can be shipped
// with a disabled feature flag. The snapshot bridge must be enabled explicitly
// before a browser is allowed to create assignments through this path.
export function createShiftExecutionCommandRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for shift execution command storage");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  const project = (row) => ({
    id: row.id, sourceRowId: row.source_row_id, sourceSlotId: row.source_slot_id,
    workOrderId: row.work_order_id, operationId: row.work_order_operation_id,
    workCenterId: row.work_center_id, resourceId: row.resource_id, masterId: row.master_id,
    plannedQuantity: number(row.planned_quantity), assignedQuantity: number(row.assigned_quantity),
    unit: row.unit, status: row.status, revision: number(row.revision), issuedAt: row.issued_at?.toISOString?.() || "",
    createdAt: row.created_at?.toISOString?.() || "", updatedAt: row.updated_at?.toISOString?.() || "",
  });
  return {
    async createAssignment(input = {}) {
      const command = buildShiftAssignmentCommand(input);
      return sql.begin(async (tx) => {
        const existing = await tx`
          SELECT assignment.* FROM shift_execution_command_requests request
          JOIN shift_assignments assignment ON assignment.id = request.shift_assignment_id
          WHERE request.idempotency_key = ${command.idempotencyKey}
          LIMIT 1
        `;
        if (existing[0]) {
          const request = await tx`SELECT request_fingerprint FROM shift_execution_command_requests WHERE idempotency_key = ${command.idempotencyKey}`;
          if (request[0]?.request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another shift assignment");
          return { ...metadata, created: false, item: project(existing[0]) };
        }
        const operation = await tx`
          SELECT id FROM work_order_operations
          WHERE id = ${command.assignment.operationId} AND work_order_id = ${command.assignment.workOrderId}
          FOR SHARE
        `;
        if (!operation[0]) return { ...metadata, created: false, item: null, error: "Work-order operation was not found" };
        const duplicateSource = await tx`SELECT id FROM shift_assignments WHERE source_row_id = ${command.assignment.sourceRowId} LIMIT 1`;
        if (duplicateSource[0]) return { ...metadata, created: false, item: null, error: "Shift assignment already exists for this source row" };
        const row = command.assignment;
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
      const command = buildShiftAssignmentUpdateCommand(input);
      return sql.begin(async (tx) => {
        const replay = await tx`
          SELECT request_fingerprint, shift_assignment_id FROM shift_execution_mutation_requests
          WHERE idempotency_key = ${command.idempotencyKey} LIMIT 1
        `;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another shift assignment mutation");
          const existing = await tx`SELECT * FROM shift_assignments WHERE id = ${replay[0].shift_assignment_id} LIMIT 1`;
          return { ...metadata, created: false, conflict: false, item: existing[0] ? project(existing[0]) : null };
        }
        const current = await tx`SELECT * FROM shift_assignments WHERE id = ${command.assignmentId} FOR UPDATE`;
        if (!current[0]) return { ...metadata, created: false, conflict: false, item: null, error: "Shift assignment was not found" };
        if (number(current[0].revision) !== command.expectedRevision) {
          return { ...metadata, created: false, conflict: true, item: project(current[0]), error: "Shift assignment changed by another user" };
        }
        const row = command.assignment;
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
      const command = buildShiftFactCommand(input);
      return sql.begin(async (tx) => {
        const replay = await tx`SELECT request_fingerprint, shift_fact_id FROM shift_execution_fact_requests WHERE idempotency_key = ${command.idempotencyKey} LIMIT 1`;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another shift fact");
          const fact = await tx`SELECT * FROM shift_facts WHERE id = ${replay[0].shift_fact_id} LIMIT 1`;
          return { ...metadata, created: false, item: fact[0] || null };
        }
        const assignment = await tx`SELECT id FROM shift_assignments WHERE id = ${command.fact.assignmentId} FOR SHARE`;
        if (!assignment[0]) return { ...metadata, created: false, item: null, error: "Shift assignment was not found" };
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
      const command = buildShiftCarryoverCommand(input);
      return sql.begin(async (tx) => {
        const replay = await tx`SELECT request_fingerprint, shift_carryover_id FROM shift_execution_carryover_requests WHERE idempotency_key = ${command.idempotencyKey} LIMIT 1`;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== command.requestFingerprint) throw new Error("Idempotency key was already used for another carryover");
          const item = await tx`SELECT * FROM shift_carryovers WHERE id = ${replay[0].shift_carryover_id} LIMIT 1`;
          return { ...metadata, created: false, item: item[0] || null };
        }
        const item = command.carryover;
        const [created] = await tx`
          INSERT INTO shift_carryovers (id, source_assignment_id, source_slot_id, work_order_id, work_order_operation_id, date_key, remaining_quantity, reason, work_center_id, source_payload)
          VALUES (${item.id}, ${item.sourceAssignmentId}, ${item.sourceSlotId}, ${item.workOrderId}, ${item.operationId}, ${item.dateKey}, ${item.remainingQuantity}, ${item.reason}, ${item.workCenterId}, ${tx.json({ command: "create_carryover" })}) RETURNING *
        `;
        await tx`INSERT INTO shift_execution_carryover_requests (idempotency_key, request_fingerprint, shift_carryover_id, actor_id) VALUES (${command.idempotencyKey}, ${command.requestFingerprint}, ${item.id}, ${String(input.actorId || "")})`;
        return { ...metadata, created: true, item: created };
      });
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
