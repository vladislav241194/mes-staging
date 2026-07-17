import { createShiftExecutionReadModel } from "../src/modules/domain_api/shift_execution_read_model.js";

function assert(value, message) { if (!value) throw new Error(message); }

let clock = 1_000;
let calls = 0;
let response = [{ id: "shift-1", sourceRowId: "row-1", sourceSlotId: "slot-1", executors: [], facts: [], carryovers: [] }];
const model = createShiftExecutionReadModel({ now: () => clock, fetchImpl: async (url, options) => {
  calls += 1;
  assert(url.endsWith("?limit=250") && options?.credentials === "same-origin", "read model must use the bounded canonical endpoint");
  return { ok: true, status: 200, json: async () => ({ ok: true, items: response }) };
} });

const first = await model.refresh();
assert(first.ok && first.changed && model.getBySourceRowId("row-1")?.id === "shift-1", "first server projection must populate source-row lookup");
await model.refresh();
assert(calls === 1, "fresh server projection must be cached");
clock += 31_000;
response = [{ id: "shift-2", sourceRowId: "row-2", sourceSlotId: "slot-2", executors: [], facts: [], carryovers: [] }];
const changed = await model.refresh();
assert(changed.changed && model.getBySourceSlotId("slot-2")?.id === "shift-2", "stale projection must refresh and expose source-slot lookup");
let offline = false;
const resilient = createShiftExecutionReadModel({ fetchImpl: async () => { throw new Error("offline"); } });
const result = await resilient.refresh();
offline = !result.ok && /offline/.test(result.error || "");
assert(offline && resilient.getItems().length === 0, "unavailable server projection must fail explicitly without inventing data");
console.log("Shift execution read model QA: OK");
