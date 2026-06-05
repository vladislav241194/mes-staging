/**
 * Runtime data shape reference for the MES planning prototype.
 *
 * Specification: technical key for "Состав изделия" in directoryState.specifications.
 * BOMList: technical key for board "Спецификация" in directoryState.bomLists.
 * NomenclatureItem: material/component/PCB master data in directoryState.nomenclature.
 * OperationMapItem: operation directory row stored in directoryState.operationMap.
 * Route: route card for product composition in planningState.routes.
 * RouteStep: operation in a route card, linked to a work center and optionally OperationMapItem.
 * Batch: production lot in planningState.batches, created from a route before Gantt transfer.
 * OperationSlot: scheduled Gantt operation in planningState.slots.
 * WorkCenter: planning department row in planningState.workCenters with separate workSchedule and workMode fields.
 *
 * Compatibility note: projectId still appears in routes, batches and slots as
 * an alias for specificationId. There is no separate Project entity in the UI.
 *
 * Main fields:
 * Specification ("Состав изделия"): id, name, structureItems, productionQuantity, dueDate, orderNumber, customer, productionStatus
 * BOMList ("Спецификация"): id, name, boardCode, resultItem, importHeaders, importRows
 * Route: id, specificationId, projectId, name, planningQuantity, planningStatus, canceledAt, isDefault
 * RouteStep: id, routeId, operationId, workCenterId, operationName, stepOrder, isRequired
 * Batch: id, routeId, specificationId, projectId, batchNumber, quantity, parentBatchId, status, createdAt, updatedAt
 * OperationSlot: id, routeId, specificationId, projectId, batchId, workCenterId, routeStepId, operationName, quantity,
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
