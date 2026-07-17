import { compareShiftExecutionProjection } from "./domain-shift-execution-parity.mjs";

function assert(value, message) { if (!value) throw new Error(message); }
const expected = {
  shiftAssignments: [{ id: "a-1", source_row_id: "row-1", source_slot_id: "slot-1", work_order_id: "wo-1", work_order_operation_id: "op-1", work_center_id: "D1", resource_id: "", master_id: "", planned_quantity: 2, assigned_quantity: 2, unit: "шт.", status: "draft", issued_at: null, created_at: "2026-07-17T08:00:00.000Z", updated_at: "2026-07-17T08:00:00.000Z" }],
  shiftAssignmentExecutors: [{ shift_assignment_id: "a-1", employee_id: "employee-1", quantity: 2, note: "" }],
  shiftFacts: [{ id: "f-1", shift_assignment_id: "a-1", actual_quantity: 2, defect_quantity: 0, labor_minutes: 20, executor_count: 1, comment: "", deviation_comment: "", reported_at: "2026-07-17T16:00:00.000Z" }],
  shiftCarryovers: [{ id: "c-1", source_assignment_id: "a-1", source_slot_id: "slot-1", work_order_id: "wo-1", work_order_operation_id: "op-1", work_center_id: "D1", date_key: "2026-07-18", remaining_quantity: 1, reason: "", created_at: "2026-07-17T16:00:00.000Z" }],
};
const actual = {
  assignments: expected.shiftAssignments.map((row) => ({ ...row })), executors: expected.shiftAssignmentExecutors.map((row) => ({ ...row })),
  facts: expected.shiftFacts.map((row) => ({ ...row })), carryovers: expected.shiftCarryovers.map((row) => ({ ...row })),
};
assert(compareShiftExecutionProjection(expected, actual).matches, "Equivalent rows must pass parity");
const changed = compareShiftExecutionProjection(expected, { ...actual, facts: [{ ...actual.facts[0], actual_quantity: 1 }] });
assert(!changed.matches && changed.mismatches[0]?.table === "facts", "Changed facts must fail parity");
const missing = compareShiftExecutionProjection(expected, { ...actual, executors: [] });
assert(!missing.matches && /missing-in-postgres/.test(missing.mismatches[0]?.reason || ""), "Missing executor must fail parity");
console.log("Shift execution parity QA: OK");
