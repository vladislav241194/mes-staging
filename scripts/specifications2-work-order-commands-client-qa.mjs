import { createSpecifications2WorkOrderCommands } from "../src/modules/domain_api/specifications2_work_order_commands.js";
function assert(value, message) { if (!value) throw new Error(message); }
let calls = 0;
const client = createSpecifications2WorkOrderCommands({ fetchImpl: async (url, options) => {
  calls += 1;
  if (options?.method === "POST") return { ok: true, status: 201, json: async () => ({ ok: true, item: { id: "WO-1" }, snapshotSync: { applied: 1 } }) };
  assert(url.endsWith("/capabilities"), "client must read explicit command capabilities");
  return { ok: true, status: 200, json: async () => ({ ok: true, capabilities: { workOrderCreationEnabled: true, workOrderPrimaryPostgres: true } }) };
} });
const capability = await client.refreshCapability();
assert(capability.ok && capability.enabled && capability.primaryPostgres, "capability response must enable only a PostgreSQL-primary command");
await client.refreshCapability();
assert(calls === 1, "fresh capabilities must be cached");
const created = await client.createWorkOrder({ revisionId: "rev-1", routeSourceDraftId: "route-1", quantity: 2, idempotencyKey: "key-1" });
assert(created.item?.id === "WO-1" && created.snapshotSync?.applied === 1, "client must return server command and sync result");
console.log("Specifications 2.0 work-order command client QA: OK");
