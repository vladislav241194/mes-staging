import { createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function assertRejects(run, message) {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error(message);
}

const calls = [];
const transactions = [];
const assignmentRows = [
  {
    id: "assignment-a", source_row_id: "row-a", source_slot_id: "slot-a", work_order_id: "WO-A",
    work_order_operation_id: "OP-A", work_center_id: "D1", resource_id: "resource-a", master_id: "master-a",
    planned_quantity: "12", assigned_quantity: "10", unit: "шт.", status: "issued", revision: "4",
    issued_at: new Date("2026-07-18T08:00:00.000Z"), created_at: new Date("2026-07-18T07:00:00.000Z"), updated_at: new Date("2026-07-18T09:00:00.000Z"),
  },
  {
    id: "assignment-b", source_row_id: "row-b", source_slot_id: "slot-b", work_order_id: "WO-B",
    work_order_operation_id: "OP-B", work_center_id: "D2", resource_id: "resource-b", master_id: "master-b",
    planned_quantity: "5", assigned_quantity: "5", unit: "шт.", status: "issued", revision: "2",
    issued_at: null, created_at: new Date("2026-07-18T07:30:00.000Z"), updated_at: new Date("2026-07-18T09:30:00.000Z"),
  },
];

const sql = (strings, ...values) => {
  const query = strings.join("?");
  calls.push({ query, values });
  if (/FROM work_order_operations\b/.test(query)) {
    return Promise.resolve([{ id: "OP-A", work_order_id: "WO-A", work_center_id: "D1" }]);
  }
  if (/FROM shift_assignments\b/.test(query)) return Promise.resolve(assignmentRows);
  if (/FROM shift_assignment_executors\b/.test(query)) {
    return Promise.resolve([
      { shift_assignment_id: "assignment-a", employee_id: "employee-a", quantity: "6", note: "Сборка" },
      { shift_assignment_id: "assignment-b", employee_id: "employee-b", quantity: "5", note: "Контроль" },
    ]);
  }
  if (/FROM shift_facts\b/.test(query)) {
    return Promise.resolve([
      { id: "fact-a-new", shift_assignment_id: "assignment-a", actual_quantity: "8", defect_quantity: "1", labor_minutes: "44", executor_count: "1", comment: "Готово", deviation_comment: "", reported_at: new Date("2026-07-18T12:00:00.000Z") },
      { id: "fact-b-new", shift_assignment_id: "assignment-b", actual_quantity: "5", defect_quantity: "0", labor_minutes: "20", executor_count: "1", comment: "", deviation_comment: "", reported_at: new Date("2026-07-18T12:10:00.000Z") },
    ]);
  }
  if (/FROM shift_carryovers\b/.test(query)) {
    return Promise.resolve([
      { id: "carryover-earlier-assignment", source_assignment_id: "assignment-history", source_row_id: "row-history", source_slot_id: "slot-history", work_order_id: "WO-H", work_order_operation_id: "OP-H", date_key: new Date("2026-07-18T00:00:00.000Z"), remaining_quantity: "3", reason: "Переходящий остаток", work_center_id: "D1", created_at: new Date("2026-07-18T06:00:00.000Z") },
    ]);
  }
  throw new Error(`Unexpected SQL: ${query}`);
};
sql.begin = async (options, callback) => {
  transactions.push(options);
  return callback(sql);
};

const repository = createShiftExecutionReadRepository({ sql });
const result = await repository.listDispatch({ sourceRowIds: [" row-b ", "row-a", "row-b"], workCenterIds: [" D2 ", "D1", "D2"], dateKey: "2026-07-18" });

assert(transactions.length === 1 && transactions[0] === "isolation level repeatable read read only", "dispatch reader must use one repeatable read-only PostgreSQL snapshot");
assert(calls.length === 4, "dispatch reader must issue one bounded assignment/executor/latest-fact/carryover query set");
assert(/FROM shift_assignments\b/.test(calls[0].query) && /source_row_id = ANY/.test(calls[0].query), "first query must use requested source rows only");
assert(/FROM shift_assignment_executors\b/.test(calls[1].query), "second query must read executors for actual assignment IDs");
assert(/SELECT DISTINCT ON \(shift_assignment_id\)/.test(calls[2].query) && /FROM shift_facts\b/.test(calls[2].query), "third query must return only the latest fact per actual assignment");
assert(/FROM shift_carryovers\b/.test(calls[3].query) && /date_key =/.test(calls[3].query) && /work_center_id = ANY/.test(calls[3].query), "fourth query must read active carryovers only for the selected date and visible work centers");
assert(/canceled_at IS NULL/.test(calls[3].query), "dispatch reader must never re-inject canceled carryovers");
assert(calls.every((call) => !/source_payload/.test(call.query)), "compact dispatch reader must not load replay payloads");
assert(calls.slice(1).every((call) => !/IN\s*\(\s*SELECT\s+id\s+FROM\s+shift_assignments/i.test(call.query)), "bounded dependent queries must use actual IDs, never reselect assignments");
assert(JSON.stringify(calls[0].values[0]) === JSON.stringify(["row-b", "row-a"]), "source row IDs must be trimmed and deduplicated in stable order");
assert(JSON.stringify(calls[1].values[0]) === JSON.stringify(["assignment-b", "assignment-a"]), "executor query must use only actual assignment IDs in board order");
assert(JSON.stringify(calls[2].values[0]) === JSON.stringify(["assignment-b", "assignment-a"]), "fact query must use only actual assignment IDs in board order");
assert(calls[3].values[0] === "2026-07-18", "carryover query must bind the exact requested date");
assert(JSON.stringify(calls[3].values[1]) === JSON.stringify(["D2", "D1"]), "carryover query must bind only trimmed, deduplicated visible work centers");

assert(result.storageMode === "postgres" && result.storageBackend === "postgresql" && result.configured === true, "dispatch reader must expose PostgreSQL metadata");
assert(JSON.stringify(result.scope) === JSON.stringify({ sourceRowIds: ["row-b", "row-a"], workCenterIds: ["D2", "D1"], dateKey: "2026-07-18" }), "dispatch reader must expose its normalized source-row/work-center scope");
assert(JSON.stringify(result.coveredSourceRowIds) === JSON.stringify(["row-b", "row-a"]) && result.coverageComplete === false, "dispatch response must identify its partial removable scope");
assert(result.items.map((item) => item.id).join(",") === "assignment-b,assignment-a", "items must preserve visible board source-row order");
assert(result.items[0]?.executors?.[0]?.employeeId === "employee-b", "compact items must retain matching executors");
assert(result.items[1]?.facts?.length === 1 && result.items[1]?.facts?.[0]?.id === "fact-a-new", "compact items must retain only the current fact");
assert(result.items.every((item) => !("sourcePayload" in item) && !("carryovers" in item)), "compact items must omit replay payloads and date-scoped carryovers");
assert(result.carryovers.length === 1 && result.carryovers[0]?.sourceAssignmentId === "assignment-history" && result.carryovers[0]?.sourceRowId === "row-history", "date-scoped carryovers must remain top-level and keep source-row identity even when their assignment is outside the current board rows");
assert(!("sourcePayload" in result.carryovers[0]), "compact carryovers must omit replay payloads");

const assignmentContext = await repository.getCommandTargetContext({ assignmentId: "assignment-a" });
assert(assignmentContext.item?.kind === "assignment" && assignmentContext.item?.id === "assignment-a" && assignmentContext.item?.workCenterId === "D1", "command target reader must return the canonical PostgreSQL assignment work center");
assert(/WHERE id =/.test(calls.at(-1)?.query || "") && /LIMIT 1/.test(calls.at(-1)?.query || ""), "assignment command target lookup must be one exact bounded read");
const operationContext = await repository.getCommandTargetContext({ workOrderId: "WO-A", operationId: "OP-A" });
assert(operationContext.item?.kind === "work-order-operation" && operationContext.item?.operationId === "OP-A" && operationContext.item?.workOrderId === "WO-A" && operationContext.item?.workCenterId === "D1", "assignment create target reader must return the canonical PostgreSQL operation work center");
assert(/FROM work_order_operations/.test(calls.at(-1)?.query || "") && /work_order_id =/.test(calls.at(-1)?.query || "") && /LIMIT 1/.test(calls.at(-1)?.query || ""), "assignment create target lookup must bind the exact Work Order and operation");
const carryoverContext = await repository.getCommandTargetContext({ carryoverId: "carryover-earlier-assignment" });
assert(carryoverContext.item?.kind === "carryover" && carryoverContext.item?.assignmentId === "assignment-history" && carryoverContext.item?.workCenterId === "D1", "cancellation target reader must return the canonical PostgreSQL carryover work center");
assert(/FROM shift_carryovers AS carryover/.test(calls.at(-1)?.query || "") && /WHERE carryover.id =/.test(calls.at(-1)?.query || ""), "carryover command target lookup must be one exact bounded read");
await assertRejects(() => repository.getCommandTargetContext({}), "command target lookup must fail closed without an id");
await assertRejects(() => repository.getCommandTargetContext({ assignmentId: "assignment-a", carryoverId: "carryover-a" }), "command target lookup must fail closed with ambiguous ids");
await assertRejects(() => repository.getCommandTargetContext({ workOrderId: "WO-A" }), "operation target lookup must fail closed without both Work Order and operation ids");

await assertRejects(() => repository.listDispatch({ sourceRowIds: [], dateKey: "2026-07-18" }), "dispatch reader must reject an empty source row scope");
await assertRejects(() => repository.listDispatch({ sourceRowIds: ["row-a"], workCenterIds: [], dateKey: "2026-07-18" }), "dispatch reader must reject an empty work-center scope");
await assertRejects(() => repository.listDispatch({ sourceRowIds: ["row-a"], workCenterIds: Array.from({ length: 101 }, (_, index) => `WC-${index}`), dateKey: "2026-07-18" }), "dispatch reader must reject work-center scopes above 100 rows");
await assertRejects(() => repository.listDispatch({ sourceRowIds: ["row-a"], workCenterIds: ["D1"], dateKey: "2026-02-30" }), "dispatch reader must reject non-calendar date keys");
await assertRejects(() => repository.listDispatch({ sourceRowIds: Array.from({ length: 201 }, (_, index) => `row-${index}`), workCenterIds: ["D1"], dateKey: "2026-07-18" }), "dispatch reader must reject scopes above 200 rows");

console.log("Shift execution dispatch repository QA: OK");
