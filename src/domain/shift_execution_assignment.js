import { createHash } from "node:crypto";

function required(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function quantity(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be non-negative`);
  return normalized;
}

function executors(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Map();
  value.forEach((item = {}) => {
    const employeeId = String(item.employeeId || "").trim();
    if (!employeeId) return;
    const executor = {
      employeeId,
      quantity: quantity(item.quantity, `executors[${employeeId}].quantity`),
      note: String(item.note || "").trim(),
    };
    if (unique.has(employeeId)) throw new Error(`executors contains duplicate employee ${employeeId}`);
    unique.set(employeeId, executor);
  });
  return [...unique.values()].sort((left, right) => left.employeeId.localeCompare(right.employeeId));
}

function sourcePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  // The server keeps the original presentation contract only as an audit
  // payload. Domain fields above remain the canonical write model.
  return JSON.parse(JSON.stringify(value));
}

export function buildShiftAssignmentCommand(input = {}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const workOrderId = required(input.workOrderId, "workOrderId");
  const operationId = required(input.operationId, "operationId");
  const sourceRowId = required(input.sourceRowId, "sourceRowId");
  const sourceSlotId = required(input.sourceSlotId, "sourceSlotId");
  const workCenterId = required(input.workCenterId, "workCenterId");
  const plannedQuantity = quantity(input.plannedQuantity, "plannedQuantity");
  const assignedQuantity = quantity(input.assignedQuantity, "assignedQuantity");
  if (assignedQuantity > plannedQuantity) throw new Error("assignedQuantity must not exceed plannedQuantity");
  const unit = String(input.unit || "шт.").trim() || "шт.";
  const status = String(input.status || (input.issued ? "issued" : "draft")).trim() === "issued" ? "issued" : "draft";
  const issuedAt = status === "issued" ? (String(input.issuedAt || "").trim() || new Date().toISOString()) : "";
  const normalizedExecutors = executors(input.executors);
  const source = sourcePayload(input.sourcePayload);
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    workOrderId, operationId, sourceRowId, sourceSlotId, workCenterId, plannedQuantity, assignedQuantity, unit,
    resourceId: String(input.resourceId || "").trim(), masterId: String(input.masterId || "").trim(),
    executors: normalizedExecutors, status, issuedAt, sourcePayload: source,
  })).digest("hex");
  const id = `shift-${createHash("sha256").update(`${idempotencyKey}:${requestFingerprint}`).digest("hex").slice(0, 20)}`;
  return {
    assignment: {
      id, sourceRowId, sourceSlotId, workOrderId, operationId, workCenterId,
      resourceId: String(input.resourceId || "").trim(), masterId: String(input.masterId || "").trim(),
      plannedQuantity, assignedQuantity, unit, status, issuedAt, executors: normalizedExecutors, sourcePayload: source,
    },
    idempotencyKey,
    requestFingerprint,
  };
}

export function buildShiftAssignmentUpdateCommand(input = {}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const assignmentId = required(input.assignmentId, "assignmentId");
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("expectedRevision must be a positive integer");
  const base = buildShiftAssignmentCommand({ ...input, idempotencyKey: `${idempotencyKey}:payload` });
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    assignmentId, expectedRevision, request: base.requestFingerprint,
  })).digest("hex");
  return {
    ...base,
    idempotencyKey,
    requestFingerprint,
    assignmentId,
    expectedRevision,
  };
}

export function buildShiftFactCommand(input = {}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const assignmentId = required(input.assignmentId, "assignmentId");
  const actualQuantity = quantity(input.actualQuantity, "actualQuantity");
  const defectQuantity = quantity(input.defectQuantity, "defectQuantity");
  if (defectQuantity > actualQuantity) throw new Error("defectQuantity must not exceed actualQuantity");
  const fact = {
    assignmentId,
    actualQuantity,
    defectQuantity,
    laborMinutes: quantity(input.laborMinutes, "laborMinutes"),
    executorCount: Math.max(0, Math.trunc(quantity(input.executorCount, "executorCount"))),
    comment: String(input.comment || "").trim(),
    deviationComment: String(input.deviationComment || "").trim(),
    reportedAt: required(input.reportedAt, "reportedAt"),
  };
  const requestFingerprint = createHash("sha256").update(JSON.stringify(fact)).digest("hex");
  return { idempotencyKey, requestFingerprint, fact: { ...fact, id: `shift-fact-${createHash("sha256").update(`${idempotencyKey}:${requestFingerprint}`).digest("hex").slice(0, 20)}` } };
}

export function buildShiftCarryoverCommand(input = {}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const carryover = {
    sourceAssignmentId: required(input.sourceAssignmentId, "sourceAssignmentId"),
    sourceSlotId: required(input.sourceSlotId, "sourceSlotId"),
    workOrderId: required(input.workOrderId, "workOrderId"),
    operationId: required(input.operationId, "operationId"),
    workCenterId: required(input.workCenterId, "workCenterId"),
    dateKey: required(input.dateKey, "dateKey"),
    remainingQuantity: quantity(input.remainingQuantity, "remainingQuantity"),
    reason: String(input.reason || "").trim(),
  };
  if (carryover.remainingQuantity <= 0) throw new Error("remainingQuantity must be positive");
  const requestFingerprint = createHash("sha256").update(JSON.stringify(carryover)).digest("hex");
  return { idempotencyKey, requestFingerprint, carryover: { ...carryover, id: `shift-carryover-${createHash("sha256").update(`${idempotencyKey}:${requestFingerprint}`).digest("hex").slice(0, 20)}` } };
}

// Correcting a fact can make a previously created carryover obsolete.  Keep
// this separate from create so the server records the historical obligation
// and who closed it, rather than deleting the row from the audit trail.
export function buildShiftCarryoverCancelCommand(input = {}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const carryoverId = required(input.carryoverId, "carryoverId");
  const cancellationReason = String(input.reason || input.cancellationReason || "").trim();
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    carryoverId,
    cancellationReason,
  })).digest("hex");
  return { idempotencyKey, requestFingerprint, carryoverId, cancellationReason };
}

function issueReportPhoto(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("photo must be an object");
  }
  const type = String(value.type || "").trim().toLowerCase();
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (type && !allowedTypes.has(type)) throw new Error("photo.type must be a supported image type");
  const source = String(value.source || "file").trim().toLowerCase();
  if (!new Set(["file", "camera"]).has(source)) throw new Error("photo.source must be file or camera");
  const name = String(value.name || "").trim();
  if (name.length > 255) throw new Error("photo.name is too long");
  const size = Math.max(0, Math.trunc(quantity(value.size || 0, "photo.size")));
  if (size > 20 * 1024 * 1024) throw new Error("photo.size must not exceed 20 MB");
  const dataUrl = String(value.dataUrl || "").trim();
  if (dataUrl.length > 320_000) throw new Error("photo.dataUrl is too large");
  if (dataUrl && !/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(dataUrl)) {
    throw new Error("photo.dataUrl must contain an encoded supported image");
  }
  const storageNote = String(value.storageNote || "").trim();
  if (storageNote.length > 500) throw new Error("photo.storageNote is too long");
  if (!dataUrl && !storageNote) throw new Error("photo must contain dataUrl or storageNote");
  return { name, type, size, source, dataUrl, storageNote };
}

export function buildShiftIssueReportCommand(input = {}) {
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  const assignmentId = required(input.assignmentId, "assignmentId");
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("expectedRevision must be a positive integer");
  const text = String(input.text || "").trim();
  if (text.length > 1200) throw new Error("text must not exceed 1200 characters");
  const photo = issueReportPhoto(input.photo);
  if (!text && !photo) throw new Error("text or photo is required");
  const report = { assignmentId, expectedRevision, text, photo, status: "new" };
  const requestFingerprint = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  return {
    idempotencyKey,
    requestFingerprint,
    report: {
      ...report,
      id: `shift-report-${createHash("sha256").update(`${idempotencyKey}:${requestFingerprint}`).digest("hex").slice(0, 20)}`,
    },
  };
}
