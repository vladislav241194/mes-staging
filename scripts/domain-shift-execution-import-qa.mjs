import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { validateShiftExecutionExport } from "./domain-shift-execution-import.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const payload = {
  schemaVersion: "008_shift_execution_read_model",
  shiftAssignments: [{ id: "assignment-1", source_row_id: "row-1", source_slot_id: "slot-1", work_order_id: "wo-1", work_order_operation_id: "op-1", work_center_id: "D1", planned_quantity: 10, assigned_quantity: 10, unit: "шт.", status: "issued", created_at: "2026-07-17T08:00:00.000Z", updated_at: "2026-07-17T08:00:00.000Z" }],
  shiftAssignmentExecutors: [{ shift_assignment_id: "assignment-1", employee_id: "employee-1", quantity: 10 }],
  shiftFacts: [{ id: "fact-1", shift_assignment_id: "assignment-1", actual_quantity: 9, defect_quantity: 1, labor_minutes: 120, executor_count: 1, reported_at: "2026-07-17T16:00:00.000Z" }],
  shiftCarryovers: [{ id: "carryover-1", source_assignment_id: "assignment-1", source_slot_id: "slot-1", work_order_id: "wo-1", work_order_operation_id: "op-1", work_center_id: "D1", date_key: "2026-07-18", remaining_quantity: 1, created_at: "2026-07-17T16:00:00.000Z" }],
};
const counts = validateShiftExecutionExport(payload);
assert(counts.assignments === 1 && counts.executors === 1 && counts.facts === 1 && counts.carryovers === 1, "Validator must return a complete shift import plan");
let orphan = "";
try { validateShiftExecutionExport({ ...payload, shiftFacts: [{ ...payload.shiftFacts[0], shift_assignment_id: "missing" }] }); } catch (error) { orphan = String(error.message); }
assert(/unknown assignment/.test(orphan), "Validator must reject orphan facts");
let duplicate = "";
try { validateShiftExecutionExport({ ...payload, shiftAssignmentExecutors: [...payload.shiftAssignmentExecutors, { ...payload.shiftAssignmentExecutors[0] }] }); } catch (error) { duplicate = String(error.message); }
assert(/duplicate executor/.test(duplicate), "Validator must reject duplicate executors");
let invalidQuantity = "";
try { validateShiftExecutionExport({ ...payload, shiftCarryovers: [{ ...payload.shiftCarryovers[0], remaining_quantity: 0 }] }); } catch (error) { invalidQuantity = String(error.message); }
assert(/remaining_quantity must be positive/.test(invalidQuantity), "Validator must reject zero carryovers");

const directory = await mkdtemp(join(tmpdir(), "mes-shift-import-qa-"));
const file = join(directory, "shift-export.json");
try {
  await writeFile(file, JSON.stringify(payload), "utf-8");
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/domain-shift-execution-import.mjs", file], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let result = "";
    child.stdout.on("data", (chunk) => { result += chunk; });
    child.stderr.on("data", (chunk) => { result += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(result) : reject(new Error(result)));
  });
  assert(String(output).includes("DRY RUN"), "Default shift import must not mutate PostgreSQL");
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log("Shift execution import QA: OK");
