import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const parsed = { apply: false, file: "" };
  for (const arg of argv) {
    if (arg === "--apply") parsed.apply = true;
    else if (!arg.startsWith("--") && !parsed.file) parsed.file = arg;
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!parsed.file) throw new Error("Usage: npm run domain:postgres:import-shifts -- <shift-export.json> [--apply]");
  return parsed;
}

function rows(payload, name) {
  if (!Array.isArray(payload?.[name])) throw new Error(`Shift import is missing ${name}`);
  return payload[name];
}

function required(value, label) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`Shift import: ${label} is required`);
  return result;
}

function quantity(value, label, { positive = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (positive && number === 0)) {
    throw new Error(`Shift import: ${label} must be ${positive ? "positive" : "non-negative"}`);
  }
  return number;
}

function unique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = required(item?.[key], `${label}.${key}`);
    if (seen.has(value)) throw new Error(`Shift import: duplicate ${label} ${value}`);
    seen.add(value);
  }
  return seen;
}

export function validateShiftExecutionExport(payload = {}) {
  if (payload.schemaVersion !== "008_shift_execution_read_model") throw new Error("Unsupported shift export schema");
  const assignments = rows(payload, "shiftAssignments");
  const executors = rows(payload, "shiftAssignmentExecutors");
  const facts = rows(payload, "shiftFacts");
  const carryovers = rows(payload, "shiftCarryovers");
  const assignmentIds = unique(assignments, "id", "assignment");
  const sourceRows = unique(assignments, "source_row_id", "assignment source row");
  for (const row of assignments) {
    required(row.source_slot_id, "assignment.source_slot_id");
    required(row.work_order_id, "assignment.work_order_id");
    required(row.work_order_operation_id, "assignment.work_order_operation_id");
    required(row.work_center_id, "assignment.work_center_id");
    required(row.unit, "assignment.unit");
    required(row.status, "assignment.status");
    required(row.created_at, "assignment.created_at");
    required(row.updated_at, "assignment.updated_at");
    quantity(row.planned_quantity, "assignment.planned_quantity");
    quantity(row.assigned_quantity, "assignment.assigned_quantity");
  }
  const executorKeys = new Set();
  for (const row of executors) {
    const assignmentId = required(row.shift_assignment_id, "executor.shift_assignment_id");
    if (!assignmentIds.has(assignmentId)) throw new Error(`Shift import: executor refers to unknown assignment ${assignmentId}`);
    const employeeId = required(row.employee_id, "executor.employee_id");
    const key = `${assignmentId}\u0000${employeeId}`;
    if (executorKeys.has(key)) throw new Error(`Shift import: duplicate executor ${employeeId} for assignment ${assignmentId}`);
    executorKeys.add(key);
    quantity(row.quantity, "executor.quantity");
  }
  unique(facts, "id", "fact");
  for (const row of facts) {
    const assignmentId = required(row.shift_assignment_id, "fact.shift_assignment_id");
    if (!assignmentIds.has(assignmentId)) throw new Error(`Shift import: fact refers to unknown assignment ${assignmentId}`);
    required(row.reported_at, "fact.reported_at");
    quantity(row.actual_quantity, "fact.actual_quantity");
    quantity(row.defect_quantity, "fact.defect_quantity");
    quantity(row.labor_minutes, "fact.labor_minutes");
    quantity(row.executor_count, "fact.executor_count");
  }
  unique(carryovers, "id", "carryover");
  for (const row of carryovers) {
    const assignmentId = required(row.source_assignment_id, "carryover.source_assignment_id");
    if (!assignmentIds.has(assignmentId)) throw new Error(`Shift import: carryover refers to unknown assignment ${assignmentId}`);
    required(row.source_slot_id, "carryover.source_slot_id");
    required(row.work_order_id, "carryover.work_order_id");
    required(row.work_order_operation_id, "carryover.work_order_operation_id");
    required(row.work_center_id, "carryover.work_center_id");
    required(row.date_key, "carryover.date_key");
    required(row.created_at, "carryover.created_at");
    quantity(row.remaining_quantity, "carryover.remaining_quantity", { positive: true });
  }
  return { assignments: assignments.length, executors: executors.length, facts: facts.length, carryovers: carryovers.length, sourceRows: sourceRows.size };
}

async function verifyWorkOrderReferences(tx, payload) {
  const references = [
    ...payload.shiftAssignments.map((row) => ({ workOrderId: row.work_order_id, operationId: row.work_order_operation_id })),
    ...payload.shiftCarryovers.map((row) => ({ workOrderId: row.work_order_id, operationId: row.work_order_operation_id })),
  ];
  const checked = new Set();
  for (const { workOrderId, operationId } of references) {
    const key = `${workOrderId}\u0000${operationId}`;
    if (checked.has(key)) continue;
    checked.add(key);
    const result = await tx`SELECT id FROM work_order_operations WHERE id = ${operationId} AND work_order_id = ${workOrderId}`;
    if (result.length !== 1) throw new Error(`Shift import: operation ${operationId} does not belong to existing work order ${workOrderId}`);
  }
}

export async function importShiftExecutionRows(tx, payload) {
    await verifyWorkOrderReferences(tx, payload);
    for (const row of payload.shiftAssignments) {
      await tx`
        INSERT INTO shift_assignments (id, source_row_id, source_slot_id, work_order_id, work_order_operation_id, work_center_id, resource_id, master_id, planned_quantity, assigned_quantity, unit, status, issued_at, created_at, updated_at, source_payload)
        VALUES (${row.id}, ${row.source_row_id}, ${row.source_slot_id}, ${row.work_order_id}, ${row.work_order_operation_id}, ${row.work_center_id}, ${row.resource_id || ""}, ${row.master_id || ""}, ${row.planned_quantity}, ${row.assigned_quantity}, ${row.unit}, ${row.status}, ${row.issued_at || null}, ${row.created_at}, ${row.updated_at}, ${tx.json(row.source_payload || {})})
        ON CONFLICT (id) DO UPDATE SET
          source_row_id = EXCLUDED.source_row_id, source_slot_id = EXCLUDED.source_slot_id, work_order_id = EXCLUDED.work_order_id,
          work_order_operation_id = EXCLUDED.work_order_operation_id, work_center_id = EXCLUDED.work_center_id, resource_id = EXCLUDED.resource_id,
          master_id = EXCLUDED.master_id, planned_quantity = EXCLUDED.planned_quantity, assigned_quantity = EXCLUDED.assigned_quantity,
          unit = EXCLUDED.unit, status = EXCLUDED.status, issued_at = EXCLUDED.issued_at, updated_at = EXCLUDED.updated_at,
          source_payload = EXCLUDED.source_payload
      `;
    }
    for (const row of payload.shiftAssignmentExecutors) {
      await tx`
        INSERT INTO shift_assignment_executors (shift_assignment_id, employee_id, quantity, note)
        VALUES (${row.shift_assignment_id}, ${row.employee_id}, ${row.quantity}, ${row.note || ""})
        ON CONFLICT (shift_assignment_id, employee_id) DO UPDATE SET quantity = EXCLUDED.quantity, note = EXCLUDED.note
      `;
    }
    for (const row of payload.shiftFacts) {
      await tx`
        INSERT INTO shift_facts (id, shift_assignment_id, actual_quantity, defect_quantity, labor_minutes, executor_count, comment, deviation_comment, reported_at, source_payload)
        VALUES (${row.id}, ${row.shift_assignment_id}, ${row.actual_quantity}, ${row.defect_quantity}, ${row.labor_minutes}, ${row.executor_count}, ${row.comment || ""}, ${row.deviation_comment || ""}, ${row.reported_at}, ${tx.json(row.source_payload || {})})
        ON CONFLICT (id) DO UPDATE SET shift_assignment_id = EXCLUDED.shift_assignment_id, actual_quantity = EXCLUDED.actual_quantity,
          defect_quantity = EXCLUDED.defect_quantity, labor_minutes = EXCLUDED.labor_minutes, executor_count = EXCLUDED.executor_count,
          comment = EXCLUDED.comment, deviation_comment = EXCLUDED.deviation_comment, reported_at = EXCLUDED.reported_at,
          source_payload = EXCLUDED.source_payload
      `;
    }
    for (const row of payload.shiftCarryovers) {
      await tx`
        INSERT INTO shift_carryovers (id, source_assignment_id, source_slot_id, work_order_id, work_order_operation_id, work_center_id, date_key, remaining_quantity, reason, created_at, source_payload)
        VALUES (${row.id}, ${row.source_assignment_id}, ${row.source_slot_id}, ${row.work_order_id}, ${row.work_order_operation_id}, ${row.work_center_id}, ${row.date_key}, ${row.remaining_quantity}, ${row.reason || ""}, ${row.created_at}, ${tx.json(row.source_payload || {})})
        ON CONFLICT (id) DO UPDATE SET source_assignment_id = EXCLUDED.source_assignment_id, source_slot_id = EXCLUDED.source_slot_id,
          work_order_id = EXCLUDED.work_order_id, work_order_operation_id = EXCLUDED.work_order_operation_id, work_center_id = EXCLUDED.work_center_id,
          date_key = EXCLUDED.date_key, remaining_quantity = EXCLUDED.remaining_quantity, reason = EXCLUDED.reason,
          created_at = EXCLUDED.created_at, source_payload = EXCLUDED.source_payload
      `;
    }
}

export async function importShiftExecutionExport(sql, payload) {
  await sql.begin(async (tx) => importShiftExecutionRows(tx, payload));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = resolve(args.file);
  const payload = JSON.parse(await readFile(file, "utf-8"));
  const counts = validateShiftExecutionExport(payload);
  console.log(`Shift execution import plan: ${file}`);
  console.log(`- assignments: ${counts.assignments}`);
  console.log(`- executors: ${counts.executors}`);
  console.log(`- facts: ${counts.facts}`);
  console.log(`- carryovers: ${counts.carryovers}`);
  if (!args.apply) {
    console.log("DRY RUN: no PostgreSQL changes made. Pass --apply only after migration 008 and parity check.");
    return;
  }
  const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured for --apply");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await importShiftExecutionExport(sql, payload);
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log("Shift execution import: OK");
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
