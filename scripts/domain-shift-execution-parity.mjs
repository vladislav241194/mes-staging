import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateShiftExecutionExport } from "./domain-shift-execution-import.mjs";

const TABLES = ["assignments", "executors", "facts", "carryovers"];

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

function normalizeRow(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row?.[field] instanceof Date ? row[field].toISOString() : row?.[field] ?? null]));
}

function compareRows(name, expectedRows, actualRows, key, fields) {
  const actualByKey = new Map(actualRows.map((row) => [String(row[key]), normalizeRow(row, fields)]));
  const mismatches = [];
  for (const row of expectedRows) {
    const id = String(row[key]);
    const actual = actualByKey.get(id);
    const expected = normalizeRow(row, fields);
    if (!actual) mismatches.push({ table: name, id, reason: "missing-in-postgres" });
    else if (stable(actual) !== stable(expected)) mismatches.push({ table: name, id, reason: "field-mismatch", expected, actual });
    actualByKey.delete(id);
  }
  for (const id of actualByKey.keys()) mismatches.push({ table: name, id, reason: "unexpected-in-postgres" });
  return mismatches;
}

export function compareShiftExecutionProjection(expected, actual) {
  const definitions = [
    ["assignments", expected.shiftAssignments, actual.assignments, "id", ["id", "source_row_id", "source_slot_id", "work_order_id", "work_order_operation_id", "work_center_id", "resource_id", "master_id", "planned_quantity", "assigned_quantity", "unit", "status", "issued_at", "created_at", "updated_at"]],
    ["executors", expected.shiftAssignmentExecutors, actual.executors, "employee_id", ["shift_assignment_id", "employee_id", "quantity", "note"]],
    ["facts", expected.shiftFacts, actual.facts, "id", ["id", "shift_assignment_id", "actual_quantity", "defect_quantity", "labor_minutes", "executor_count", "comment", "deviation_comment", "reported_at"]],
    ["carryovers", expected.shiftCarryovers, actual.carryovers, "id", ["id", "source_assignment_id", "source_slot_id", "work_order_id", "work_order_operation_id", "work_center_id", "date_key", "remaining_quantity", "reason", "created_at"]],
  ];
  const mismatches = definitions.flatMap(([name, expectedRows, actualRows, key, fields]) => {
    if (name === "executors") {
      const pairKey = (row) => `${row.shift_assignment_id}\u0000${row.employee_id}`;
      const actualByKey = new Map(actualRows.map((row) => [pairKey(row), normalizeRow(row, fields)]));
      const errors = [];
      for (const row of expectedRows) {
        const id = pairKey(row);
        const current = actualByKey.get(id);
        const source = normalizeRow(row, fields);
        if (!current) errors.push({ table: name, id, reason: "missing-in-postgres" });
        else if (stable(current) !== stable(source)) errors.push({ table: name, id, reason: "field-mismatch", expected: source, actual: current });
        actualByKey.delete(id);
      }
      for (const id of actualByKey.keys()) errors.push({ table: name, id, reason: "unexpected-in-postgres" });
      return errors;
    }
    return compareRows(name, expectedRows, actualRows, key, fields);
  });
  return { matches: mismatches.length === 0, mismatches: mismatches.slice(0, 50) };
}

export async function readShiftExecutionProjection(sql, expected) {
  const assignmentIds = expected.shiftAssignments.map((row) => row.id);
  if (!assignmentIds.length) return { assignments: [], executors: [], facts: [], carryovers: [] };
  const [assignments, executors, facts, carryovers] = await Promise.all([
    sql`SELECT * FROM shift_assignments WHERE id = ANY(${assignmentIds})`,
    sql`SELECT * FROM shift_assignment_executors WHERE shift_assignment_id = ANY(${assignmentIds})`,
    sql`SELECT * FROM shift_facts WHERE shift_assignment_id = ANY(${assignmentIds})`,
    sql`SELECT * FROM shift_carryovers WHERE source_assignment_id = ANY(${assignmentIds})`,
  ]);
  return { assignments, executors, facts, carryovers };
}

function parseArgs(argv) {
  if (argv.length !== 1 || argv[0].startsWith("--")) throw new Error("Usage: npm run domain:postgres:parity-shifts -- <shift-export.json>");
  return resolve(argv[0]);
}

async function main() {
  const file = parseArgs(process.argv.slice(2));
  const expected = JSON.parse(await readFile(file, "utf-8"));
  validateShiftExecutionExport(expected);
  const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured for parity check");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const actual = await readShiftExecutionProjection(sql, expected);
    const parity = compareShiftExecutionProjection(expected, actual);
    const expectedCounts = {
      assignments: expected.shiftAssignments.length,
      executors: expected.shiftAssignmentExecutors.length,
      facts: expected.shiftFacts.length,
      carryovers: expected.shiftCarryovers.length,
    };
    console.log(JSON.stringify({ ok: parity.matches, source: file, expected: expectedCounts, actual: Object.fromEntries(TABLES.map((name) => [name, actual[name].length])), parity }, null, 2));
    if (!parity.matches) process.exitCode = 2;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();
