import { createShiftExecutionCommands } from "../src/modules/domain_api/shift_execution_commands.js";

function assert(value, message) { if (!value) throw new Error(message); }

let calls = 0;
const client = createShiftExecutionCommands({ fetchImpl: async (url, options) => {
  calls += 1;
  if (options?.method === "POST" && url.endsWith("/facts")) {
    assert(options.headers["Idempotency-Key"] === "fact-key", "fact command must forward idempotency header");
    return { ok: true, status: 201, json: async () => ({ ok: true, item: { id: "fact-1" } }) };
  }
  if (options?.method === "POST" && url.endsWith("/reports")) {
    assert(url.endsWith("/assignments/shift-1/reports"), "issue report command must target the canonical assignment route");
    assert(options.headers["Idempotency-Key"] === "report-key", "issue report command must forward idempotency header");
    return { ok: true, status: 201, json: async () => ({ ok: true, item: { id: "report-1" } }) };
  }
  if (options?.method === "POST" && url.endsWith("/carryovers")) {
    assert(options.headers["Idempotency-Key"] === "carryover-key", "carryover command must forward idempotency header");
    return { ok: true, status: 201, json: async () => ({ ok: true, item: { id: "carryover-1" } }) };
  }
  if (options?.method === "POST") {
    assert(url.endsWith("/assignments"), "assignment command must target the canonical server route");
    assert(options.headers["Idempotency-Key"] === "assignment-key", "assignment command must forward idempotency header");
    return { ok: true, status: 201, json: async () => ({ ok: true, item: { id: "shift-1" } }) };
  }
  if (options?.method === "PATCH") {
    if (url.endsWith("/carryovers/carryover-1")) {
      assert(options.headers["Idempotency-Key"] === "carryover-cancel-key", "carryover cancellation must forward idempotency header");
      return { ok: true, status: 200, json: async () => ({ ok: true, item: { id: "carryover-1", canceledAt: "2026-07-18T12:00:00.000Z" } }) };
    }
    assert(url.endsWith("/assignments/shift-1"), "assignment update must target the canonical assignment route");
    assert(options.headers["Idempotency-Key"] === "assignment-update-key", "assignment update must forward idempotency header");
    return { ok: true, status: 200, json: async () => ({ ok: true, item: { id: "shift-1", revision: 2 } }) };
  }
  if (!options?.method && url.endsWith("/assignments/shift-1/reports")) {
    assert(options.credentials === "same-origin" && options.cache === "no-store", "issue report read must use the signed no-store browser session");
    return { ok: true, status: 200, json: async () => ({ ok: true, items: [{ id: "report-1" }] }) };
  }
  assert(url.endsWith("/capabilities"), "client must read explicit shift command capabilities");
  return { ok: true, status: 200, json: async () => ({ ok: true, capabilities: { assignmentCreationEnabled: true, issueReportCreationEnabled: true, primaryPostgres: true, schemaReady: true } }) };
} });

const capability = await client.refreshCapability();
assert(capability.ok && capability.enabled && capability.reportEnabled && capability.primaryPostgres && capability.schemaReady, "client must expose a fully ready server command capability");
await client.refreshCapability();
assert(calls === 1, "fresh shift command capability must be cached");
const created = await client.createAssignment({ idempotencyKey: "assignment-key", workOrderId: "WO-1" });
assert(created.item?.id === "shift-1", "client must return the server assignment result");
const updated = await client.updateAssignment("shift-1", { idempotencyKey: "assignment-update-key", expectedRevision: 1, workOrderId: "WO-1" });
assert(updated.ok && updated.item?.revision === 2, "client must expose a successful versioned assignment update");
const fact = await client.recordFact("shift-1", { idempotencyKey: "fact-key", actualQuantity: 1 });
assert(fact.item?.id === "fact-1", "client must return a recorded shift fact");
const report = await client.recordIssueReport("shift-1", { idempotencyKey: "report-key", expectedRevision: 2, text: "Проверить пайку" });
assert(report.item?.id === "report-1", "client must return the canonical owner-backed issue report");
const reportRead = await client.readIssueReports("shift-1");
assert(reportRead.items?.[0]?.id === "report-1", "client must return the signed on-demand Report read-back");
const carryover = await client.createCarryover({ idempotencyKey: "carryover-key", sourceAssignmentId: "shift-1", remainingQuantity: 1 });
assert(carryover.item?.id === "carryover-1", "client must return a created carryover");
const canceledCarryover = await client.cancelCarryover("carryover-1", { idempotencyKey: "carryover-cancel-key", reason: "Fact corrected" });
assert(canceledCarryover.item?.canceledAt, "client must return the canceled canonical carryover");
let missing = "";
try { await client.createAssignment({}); } catch (error) { missing = error.message; }
assert(/Idempotency/.test(missing), "client must reject an unsafe write without an idempotency key");
console.log("Shift execution command client QA: OK");
