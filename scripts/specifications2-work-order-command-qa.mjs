import { buildSpecifications2WorkOrderCommand } from "../src/domain/specifications2_work_order.js";

function assert(value, message) { if (!value) throw new Error(message); }
const aggregateIdentity = `sha256:${"a".repeat(64)}`;

const command = buildSpecifications2WorkOrderCommand({
  revision: { id: "revision-6", revisionNo: 6, designation: "АБВГ.001" },
  route: { id: "route-main", designation: "АБВГ.001", productLabel: "Изделие" },
  operations: [
    { id: "op-2", sequenceNo: 2, operationId: "OP-2", name: "Контроль", workCenterId: "D2", laborNorm: { calculationMode: "fixed", fixedMinutes: 15 } },
    { id: "op-1", sequenceNo: 1, operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { unitsPerHour: 12, setupMinutes: 5 } },
  ],
  quantity: 24,
  idempotencyKey: "request-1",
  aggregateIdentity,
});
assert(command.workOrder.quantity === 24 && command.workOrder.sourceRevision === 6, "command must preserve requested quantity and immutable revision number");
assert(command.operations.map((item) => item.operationId).join(",") === "OP-1,OP-2", "command operations must be ordered by published sequence");
assert(command.operations[0].labor.minutesPerUnit === 5 && command.operations[0].executionContext.calculationType === "normative", "throughput norm must become a portable duration context");
assert(command.operations[1].labor.fixedMinutes === 15 && command.operations[1].executionContext.calculationType === "manual", "fixed norm must remain a fixed operation context");
assert(command.workOrder.id === `wo-spec2-${"a".repeat(64)}`, "command must project the complete server-derived SHA-256 aggregate identity");
assert(command.workOrder.number === `WO-S2-6-${"A".repeat(32)}`, "database-unique Work Order number must retain 128 bits of aggregate identity");
assert(command.operations[0].id === `${command.workOrder.id}-op-1` && command.operations[1].id === `${command.workOrder.id}-op-2`, "operation ids must inherit the aggregate identity and unique immutable sequence");
const retry = buildSpecifications2WorkOrderCommand({ revision: { id: "revision-6", revisionNo: 6 }, route: { id: "route-main" }, operations: [{ operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { unitsPerHour: 12 } }], quantity: 24, idempotencyKey: "request-1", aggregateIdentity });
assert(retry.workOrder.id === command.workOrder.id, "same idempotency key must derive the same aggregate id");
let invalidIdentity = "";
try { buildSpecifications2WorkOrderCommand({ revision: { id: "revision-6" }, route: { id: "route-main" }, operations: [{ operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { unitsPerHour: 12 } }], quantity: 24, idempotencyKey: "request-1" }); }
catch (error) { invalidIdentity = String(error?.message || error); }
assert(/SHA-256 Work Order aggregate identity/.test(invalidIdentity), "missing server aggregate identity must fail closed");
console.log("Specifications 2.0 work-order command QA: OK");
