/**
 * Runtime data shape reference for the MES planning prototype.
 *
 * Project: id, name, orderNumber, customer, totalQuantity, dueDate, status, createdAt, updatedAt
 * Batch: id, projectId, batchNumber, quantity, parentBatchId, status, createdAt, updatedAt
 * WorkCenter: id, name, code, description, isActive
 * Route: id, projectId, name, isDefault
 * RouteStep: id, routeId, workCenterId, operationName, stepOrder, isRequired
 * OperationSlot: id, projectId, batchId, workCenterId, routeStepId, operationName, quantity,
 * plannedStart, plannedEnd, actualStart, actualEnd, status, comment, createdAt, updatedAt
 */

export const SLOT_STATUSES = [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "overdue",
  "problem",
];

export const PROJECT_STATUSES = [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "problem",
];

export const STATUS_LABELS = {
  planned: "Запланировано",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Завершено",
  overdue: "Просрочено",
  problem: "Проблема",
};

export const PROJECT_STATUS_LABELS = {
  planned: "Запланирован",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Завершен",
  problem: "Проблема",
};
