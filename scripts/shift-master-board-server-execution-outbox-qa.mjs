import { createShiftExecutionOutbox } from "../src/modules/shift_master_board/server_execution_outbox.js";

function assert(value, message) { if (!value) throw new Error(message); }

const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
let tick = 0;
const outbox = createShiftExecutionOutbox({ storage, now: () => `2026-07-17T12:00:0${++tick}.000Z` });
const write = { type: "create", payload: { idempotencyKey: "assignment-1", workOrderId: "WO-1" } };
outbox.enqueue(write, "temporary network failure");
outbox.enqueue(write, "retry failure");
assert(outbox.getPending().length === 1 && outbox.getPending()[0].attempts === 2, "outbox must deduplicate retries by command idempotency key");
const rejected = await outbox.flush(async () => ({ ok: false, error: "offline" }));
assert(rejected.attempted === 1 && rejected.delivered === 0 && rejected.pending === 1, "failed delivery must remain in the local outbox");
const delivered = await outbox.flush(async (entry) => ({ ok: true, id: entry.payload.idempotencyKey }));
assert(delivered.delivered === 1 && delivered.pending === 0, "accepted command must leave the outbox exactly once");
outbox.enqueue({ type: "update", assignmentId: "assignment-1", payload: { idempotencyKey: "assignment-conflict" } });
const conflicted = await outbox.flush(async () => ({ ok: false, conflict: true }));
assert(conflicted.conflicts === 1 && conflicted.pending === 0, "stale update must be discarded instead of being retried forever");
assert(outbox.enqueue({ type: "fact", payload: {} }) === null, "outbox must reject writes without an idempotency key");
console.log("Shift master board server execution outbox QA: OK");
