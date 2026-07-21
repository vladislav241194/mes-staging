import { normalizePlannedQuantity } from "./planning_quantity.js";

const clean = (value) => String(value ?? "").trim();
const SHA256_IDENTITY_PATTERN = /^sha256:([0-9a-f]{64})$/u;

function laborAndExecutionContext(norm = {}, workCenterId = "") {
  const mode = clean(norm.calculationMode || norm.calculation_mode).toLowerCase();
  if (mode === "fixed") {
    const fixedMinutes = Number(norm.fixedMinutes ?? norm.fixed_minutes) || 0;
    if (fixedMinutes <= 0) throw new Error("Fixed operation norm must be positive");
    return {
      labor: { mode: "fixed", fixedMinutes },
      executionContext: { calculationType: "manual", setupMin: 0, secondsPerPanel: fixedMinutes * 60, workCenterId },
    };
  }
  const unitsPerHour = Number(norm.unitsPerHour ?? norm.units_per_hour) || 0;
  if (unitsPerHour <= 0) throw new Error("Operation throughput norm must be positive");
  return {
    labor: { mode: "unit", minutesPerUnit: 60 / unitsPerHour },
    executionContext: { calculationType: "normative", setupMin: Number(norm.setupMinutes ?? norm.setup_minutes) || 0, secondsPerPanel: 3600 / unitsPerHour, unitsPerHour, boardsPerPanel: 1, workCenterId },
  };
}

// Pure deterministic mapping. The caller owns the transaction and provides an
// immutable revision plus one route document from PostgreSQL.
export function buildSpecifications2WorkOrderCommand({ revision = {}, route = {}, operations = [], quantity, idempotencyKey, aggregateIdentity = "" }) {
  const normalizedQuantity = normalizePlannedQuantity(quantity);
  const revisionId = clean(revision.id);
  const routeId = clean(route.id);
  const key = clean(idempotencyKey);
  const identityMatch = clean(aggregateIdentity).match(SHA256_IDENTITY_PATTERN);
  if (!revisionId || !routeId || !key) throw new Error("Revision, route and idempotency key are required");
  if (!identityMatch) throw new Error("A canonical SHA-256 Work Order aggregate identity is required");
  if (!Array.isArray(operations) || !operations.length) throw new Error("Published route must contain operations");
  if (normalizedQuantity <= 0) throw new Error("Work-order quantity must be positive");
  // The repository derives this digest server-side from the authenticated
  // actor scope plus Idempotency-Key. The pure builder only projects that
  // already canonical identity, avoiding async/browser crypto and the former
  // attacker-searchable 32-bit hash space.
  const aggregateDigest = identityMatch[1];
  const workOrderId = `wo-spec2-${aggregateDigest}`;
  const operationSequences = new Set();
  const operationRows = operations.map((operation, index) => {
    const operationId = clean(operation.operation_id || operation.operationId);
    const name = clean(operation.name);
    const workCenterId = clean(operation.work_center_id || operation.workCenterId);
    const sequenceNo = Number(operation.sequence_no ?? operation.sequenceNo ?? index + 1);
    if (!operationId || !name || !workCenterId) throw new Error(`Published operation ${index + 1} is incomplete`);
    if (!Number.isSafeInteger(sequenceNo) || sequenceNo <= 0 || operationSequences.has(sequenceNo)) {
      throw new Error(`Published operation ${index + 1} has an invalid or duplicate sequence`);
    }
    operationSequences.add(sequenceNo);
    const { labor, executionContext } = laborAndExecutionContext(operation.labor_norm || operation.laborNorm || {}, workCenterId);
    return {
      id: `${workOrderId}-op-${sequenceNo}`,
      workOrderId,
      operationId,
      name,
      workCenterId,
      nextWorkCenterId: clean(operation.next_work_center_id || operation.nextWorkCenterId),
      sequenceNo,
      quantityMultiplier: 1,
      executionContext,
      labor,
    };
  }).sort((left, right) => left.sequenceNo - right.sequenceNo);
  return {
    workOrder: {
      id: workOrderId,
      number: `WO-S2-${Number(revision.revision_no || revision.revisionNo || 1)}-${aggregateDigest.slice(0, 32).toUpperCase()}`,
      name: clean(route.product_label || route.productLabel) || clean(revision.title) || "Изделие",
      designation: clean(route.designation) || clean(revision.designation),
      unit: "шт.",
      quantity: normalizedQuantity,
      lifecycleStatus: "released",
      planningStatus: "draft",
      sourceKind: "specifications2",
      sourceRevision: Number(revision.revision_no || revision.revisionNo || 1),
      aggregateRevision: 1,
    },
    operations: operationRows,
    source: { specificationRevisionId: revisionId, routeDocumentId: routeId, idempotencyKey: key, aggregateIdentity: clean(aggregateIdentity) },
  };
}
