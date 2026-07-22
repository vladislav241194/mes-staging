export const MARKING_PHASE1_SCOPE = "isolated-test";

export const MARKING_PHASE1_STATES = Object.freeze({
  draft: "draft",
  configured: "configured",
  inProgress: "in_progress",
  completed: "completed",
  transferred: "transferred",
});

export const MARKING_PHASE1_LIMITS = Object.freeze({
  idLength: 160,
  textLength: 500,
  idempotencyKeyLength: 160,
  taskPage: 100,
  kitPage: 200,
  kitsPerCommand: 200,
  boardsPerKit: 200,
  selectedKits: 200,
  codeLength: 200,
});

export class MarkingPhase1ValidationError extends Error {
  constructor(message, code = "marking-phase1-validation-failed", statusCode = 400, details = {}) {
    super(message);
    this.name = "MarkingPhase1ValidationError";
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

function record(value, field = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MarkingPhase1ValidationError(`${field} must be an object`, "invalid-json-object");
  }
  return value;
}

function text(value, field, { required = true, max = MARKING_PHASE1_LIMITS.textLength } = {}) {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw new MarkingPhase1ValidationError(`${field} must be a string`, "invalid-text-field");
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new MarkingPhase1ValidationError(`${field} is required`, "required-field-missing");
  }
  if (normalized.length > max) {
    throw new MarkingPhase1ValidationError(`${field} is too long`, "field-too-long", 400, { field, maxLength: max });
  }
  return normalized;
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MarkingPhase1ValidationError(`${field} must be an integer from ${min} to ${max}`, "invalid-integer-field");
  }
  return value;
}

function decimal(value, field, { min = 0.01, max = 1000 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new MarkingPhase1ValidationError(`${field} must be a number from ${min} to ${max}`, "invalid-number-field");
  }
  return Math.round(value * 100) / 100;
}

function boolean(value, field, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new MarkingPhase1ValidationError(`${field} must be boolean`, "invalid-boolean-field");
  }
  return value;
}

function ids(value, field, { max = MARKING_PHASE1_LIMITS.selectedKits, required = false } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > max) {
    throw new MarkingPhase1ValidationError(`${field} must contain from ${required ? 1 : 0} to ${max} ids`, "invalid-id-list");
  }
  const unique = [];
  const seen = new Set();
  for (const raw of value) {
    const id = text(raw, field, { max: MARKING_PHASE1_LIMITS.idLength });
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  if (required && unique.length === 0) {
    throw new MarkingPhase1ValidationError(`${field} must not be empty`, "invalid-id-list");
  }
  return unique;
}

export function normalizeMarkingPhase1Id(value, field = "id") {
  return text(value, field, { max: MARKING_PHASE1_LIMITS.idLength });
}

export function normalizeMarkingPhase1IdempotencyKey(value) {
  return text(value, "idempotencyKey", { max: MARKING_PHASE1_LIMITS.idempotencyKeyLength });
}

export function normalizeMarkingPhase1ExpectedRevision(value) {
  return integer(value, "expectedRevision", { min: 1, max: 2_147_483_647 });
}

export function normalizeMarkingPhase1TaskListQuery(input = {}) {
  const source = record(input, "query");
  return Object.freeze({
    limit: source.limit === undefined ? 50 : integer(source.limit, "limit", { min: 1, max: MARKING_PHASE1_LIMITS.taskPage }),
  });
}

export function normalizeMarkingPhase1TaskDetailQuery(input = {}) {
  const source = record(input, "query");
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    kitLimit: source.kitLimit === undefined ? 100 : integer(source.kitLimit, "kitLimit", { min: 1, max: MARKING_PHASE1_LIMITS.kitPage }),
    kitOffset: source.kitOffset === undefined ? 0 : integer(source.kitOffset, "kitOffset", { min: 0, max: 1_000_000 }),
  });
}

export function normalizeMarkingPhase1Bootstrap(input = {}) {
  const source = record(input);
  const sourceWorkCenterId = normalizeMarkingPhase1Id(source.sourceWorkCenterId, "sourceWorkCenterId");
  return Object.freeze({
    sourceAssignmentId: normalizeMarkingPhase1Id(source.sourceAssignmentId, "sourceAssignmentId"),
    sourceWorkOrderId: normalizeMarkingPhase1Id(source.sourceWorkOrderId, "sourceWorkOrderId"),
    sourceOperationId: normalizeMarkingPhase1Id(source.sourceOperationId, "sourceOperationId"),
    sourceWorkCenterId,
    nextWorkCenterId: normalizeMarkingPhase1Id(source.nextWorkCenterId || `${sourceWorkCenterId}-NEXT-MOK`, "nextWorkCenterId"),
    assignedEmployeeId: normalizeMarkingPhase1Id(source.assignedEmployeeId, "assignedEmployeeId"),
    productId: text(source.productId, "productId", { required: false, max: MARKING_PHASE1_LIMITS.idLength }),
    productName: text(source.productName, "productName", { required: false }),
    workOrderNumber: text(source.workOrderNumber, "workOrderNumber", { required: false, max: 200 }),
    taskTitle: text(source.taskTitle, "taskTitle", { required: false }),
    plannedBoardQuantity: source.plannedBoardQuantity === undefined ? 0 : integer(source.plannedBoardQuantity, "plannedBoardQuantity", { min: 0, max: 10_000_000 }),
    sourceStarted: boolean(source.sourceStarted, "sourceStarted", false),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1Configuration(input = {}) {
  const source = record(input);
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    configuredKitCount: integer(source.configuredKitCount, "configuredKitCount", { min: 1, max: 1_000_000 }),
    boardsPerKit: integer(source.boardsPerKit, "boardsPerKit", { min: 1, max: MARKING_PHASE1_LIMITS.boardsPerKit }),
    masterLabelWidthMm: decimal(source.masterLabelWidthMm ?? 100, "masterLabelWidthMm"),
    masterLabelHeightMm: decimal(source.masterLabelHeightMm ?? 60, "masterLabelHeightMm"),
    individualLabelWidthMm: decimal(source.individualLabelWidthMm ?? 30, "individualLabelWidthMm"),
    individualLabelHeightMm: decimal(source.individualLabelHeightMm ?? 20, "individualLabelHeightMm"),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1AddKits(input = {}) {
  const source = record(input);
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    count: integer(source.count, "count", { min: 1, max: MARKING_PHASE1_LIMITS.kitsPerCommand }),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1PrintRequest(input = {}) {
  const source = record(input);
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    kitIds: ids(source.kitIds, "kitIds"),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1PrintResult(input = {}) {
  const source = record(input);
  const result = text(source.result, "result", { max: 20 });
  if (!new Set(["confirmed", "error"]).has(result)) {
    throw new MarkingPhase1ValidationError("result must be confirmed or error", "invalid-print-result");
  }
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    batchId: normalizeMarkingPhase1Id(source.batchId, "batchId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    result,
    errorMessage: text(source.errorMessage, "errorMessage", { required: false, max: 1000 }),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1Reprint(input = {}) {
  const source = record(input);
  const scopeType = text(source.scopeType, "scopeType", { max: 20 });
  if (!new Set(["batch", "kit", "master", "individual"]).has(scopeType)) {
    throw new MarkingPhase1ValidationError("scopeType must be batch, kit, master or individual", "invalid-reprint-scope");
  }
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    scopeType,
    targetId: normalizeMarkingPhase1Id(source.targetId, "targetId"),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1Completion(input = {}) {
  const source = record(input);
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1Transfer(input = {}) {
  const source = record(input);
  return Object.freeze({
    taskId: normalizeMarkingPhase1Id(source.taskId, "taskId"),
    expectedRevision: normalizeMarkingPhase1ExpectedRevision(source.expectedRevision),
    nextWorkCenterId: normalizeMarkingPhase1Id(source.nextWorkCenterId, "nextWorkCenterId"),
    idempotencyKey: normalizeMarkingPhase1IdempotencyKey(source.idempotencyKey),
  });
}

export function normalizeMarkingPhase1TransferCancellation(input = {}) {
  return normalizeMarkingPhase1Completion(input);
}

export function normalizeMarkingPhase1CodeLookup(input = {}) {
  const source = record(input, "query");
  return Object.freeze({ codeValue: text(source.codeValue, "codeValue", { max: MARKING_PHASE1_LIMITS.codeLength }).toUpperCase() });
}

export function assertMarkingPhase1Configurable(task, { existingKitCount = 0, confirmedKitCount = 0, nextBoardsPerKit = 0, nextKitCount = 0 } = {}) {
  if (![MARKING_PHASE1_STATES.draft, MARKING_PHASE1_STATES.configured, MARKING_PHASE1_STATES.inProgress].includes(task?.phase1State)) {
    throw new MarkingPhase1ValidationError("Completed or transferred task cannot be reconfigured", "task-not-configurable", 409);
  }
  if (confirmedKitCount > 0 && Number(task?.boardsPerKit || 0) !== nextBoardsPerKit) {
    throw new MarkingPhase1ValidationError("boardsPerKit cannot change after confirmed printing", "printed-layout-immutable", 409);
  }
  if (nextKitCount < existingKitCount) {
    throw new MarkingPhase1ValidationError("configuredKitCount cannot be lower than generated kit count", "generated-kits-cannot-be-removed", 409);
  }
}

export function assertMarkingPhase1Completable({ phase1State, kitCount, confirmedKitCount } = {}) {
  if (![MARKING_PHASE1_STATES.configured, MARKING_PHASE1_STATES.inProgress].includes(phase1State)) {
    throw new MarkingPhase1ValidationError("Task is not ready for completion", "task-not-completable", 409);
  }
  if (!Number.isSafeInteger(kitCount) || kitCount < 1 || kitCount !== confirmedKitCount) {
    throw new MarkingPhase1ValidationError("Every generated kit must have confirmed printing", "unconfirmed-kits-remain", 409);
  }
}

export function assertMarkingPhase1Transferable(task) {
  if (task?.phase1State !== MARKING_PHASE1_STATES.completed) {
    throw new MarkingPhase1ValidationError("Only a completed Phase 1 task can be transferred", "task-not-transferable", 409);
  }
}

export function assertMarkingPhase1TransferCancellable(task) {
  if (task?.phase1State !== MARKING_PHASE1_STATES.transferred) {
    throw new MarkingPhase1ValidationError("Only a transferred Phase 1 task can be returned", "transfer-not-cancellable", 409);
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableMarkingPhase1Json(value) {
  return JSON.stringify(stableValue(value));
}
