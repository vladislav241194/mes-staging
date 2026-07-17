import { buildSpecifications2WorkOrderCommand } from "../src/domain/specifications2_work_order.js";

function assert(value, message) { if (!value) throw new Error(message); }

const command = buildSpecifications2WorkOrderCommand({
  revision: { id: "revision-6", revisionNo: 6, designation: "АБВГ.001" },
  route: { id: "route-main", designation: "АБВГ.001", productLabel: "Изделие" },
  operations: [
    { id: "op-2", sequenceNo: 2, operationId: "OP-2", name: "Контроль", workCenterId: "D2", laborNorm: { calculationMode: "fixed", fixedMinutes: 15 } },
    { id: "op-1", sequenceNo: 1, operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { unitsPerHour: 12, setupMinutes: 5 } },
  ],
  quantity: 24,
  idempotencyKey: "request-1",
});
assert(command.workOrder.quantity === 24 && command.workOrder.sourceRevision === 6, "command must preserve requested quantity and immutable revision number");
assert(command.operations.map((item) => item.operationId).join(",") === "OP-1,OP-2", "command operations must be ordered by published sequence");
assert(command.operations[0].labor.minutesPerUnit === 5 && command.operations[0].executionContext.calculationType === "normative", "throughput norm must become a portable duration context");
assert(command.operations[1].labor.fixedMinutes === 15 && command.operations[1].executionContext.calculationType === "manual", "fixed norm must remain a fixed operation context");
const retry = buildSpecifications2WorkOrderCommand({ revision: { id: "revision-6", revisionNo: 6 }, route: { id: "route-main" }, operations: [{ operationId: "OP-1", name: "Монтаж", workCenterId: "D1", laborNorm: { unitsPerHour: 12 } }], quantity: 24, idempotencyKey: "request-1" });
assert(retry.workOrder.id === command.workOrder.id, "same idempotency key must derive the same aggregate id");
console.log("Specifications 2.0 work-order command QA: OK");
