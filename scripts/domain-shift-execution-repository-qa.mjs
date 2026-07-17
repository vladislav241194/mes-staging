import { assembleShiftExecutionAggregates } from "./domain-shift-execution-repository.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const [assignment] = assembleShiftExecutionAggregates(
  [{
    id: "shift-1", source_row_id: "row-1", source_slot_id: "slot-1", work_order_id: "WO-1",
    work_order_operation_id: "OP-1", work_center_id: "D5", resource_id: "line-1", master_id: "master-1",
    planned_quantity: "12", assigned_quantity: "10", unit: "шт.", status: "issued", revision: "3",
    issued_at: new Date("2026-07-17T08:00:00.000Z"), created_at: new Date("2026-07-17T07:00:00.000Z"),
    updated_at: new Date("2026-07-17T09:00:00.000Z"), source_payload: { dateKey: "2026-07-17" },
  }],
  [{ shift_assignment_id: "shift-1", employee_id: "employee-1", quantity: "10", note: "Смена 1" }],
  [{ id: "fact-1", shift_assignment_id: "shift-1", actual_quantity: "9", defect_quantity: "1", labor_minutes: "80", executor_count: "1", comment: "", deviation_comment: "", reported_at: new Date("2026-07-17T16:00:00.000Z"), source_payload: {} }],
  [{ id: "carryover-1", source_assignment_id: "shift-1", source_slot_id: "slot-1", work_order_id: "WO-1", work_order_operation_id: "OP-1", date_key: new Date("2026-07-18T00:00:00.000Z"), remaining_quantity: "3", reason: "Остаток", work_center_id: "D5", created_at: new Date("2026-07-17T16:01:00.000Z"), source_payload: {} }],
);

assert(assignment?.revision === 3 && assignment?.sourcePayload?.dateKey === "2026-07-17", "aggregate must retain assignment revision and audit payload");
assert(assignment?.executors?.[0]?.employeeId === "employee-1" && assignment.executors[0]?.quantity === 10, "aggregate must join executors by assignment");
assert(assignment?.facts?.[0]?.actualQuantity === 9 && assignment.facts[0]?.reportedAt === "2026-07-17T16:00:00.000Z", "aggregate must join normalized execution facts");
assert(assignment?.carryovers?.[0]?.dateKey === "2026-07-18" && assignment.carryovers[0]?.remainingQuantity === 3, "aggregate must join next-shift carryovers");
const [empty] = assembleShiftExecutionAggregates([{ id: "shift-2", planned_quantity: 0, assigned_quantity: 0 }]);
assert(empty?.executors?.length === 0 && empty?.facts?.length === 0 && empty?.carryovers?.length === 0, "assignments without activity must stay valid empty aggregates");
console.log("Shift execution aggregate repository QA: OK");
