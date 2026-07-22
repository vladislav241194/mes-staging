/**
 * Runtime data shape reference for the MES planning prototype.
 *
 * Specification: technical key for "Состав изделия" in directoryState.specifications.
 * BOMList: technical key for board "Плата" with BOM rows in directoryState.bomLists.
 * NomenclatureItem: material/component/PCB master data in directoryState.nomenclature.
 * OperationMapItem: operation directory row stored in directoryState.operationMap.
 * Route: route card and production order for product composition in planningState.routes.
 * RouteStep: operation in a route card, linked to a work center and optionally OperationMapItem.
 * OperationSlot: scheduled Gantt operation in planningState.slots.
 * WorkCenter: matrix-derived planning/resource row in planningState.workCenters with separate workSchedule and workMode fields.
 *
 * Compatibility note: projectId still appears in routes and slots as an alias
 * for specificationId. Legacy batchId may exist in older saved slots, but the
 * active planning model is route/order-centered and has no Batch entity.
 *
 * Main fields:
 * Specification ("Состав изделия"): id, name, structureItems, productionQuantity, dueDate, orderNumber, customer
 * Specification.structureItems: source refs plus fulfillmentMode ("not_selected", "produce", "from_stock", "purchase", "external")
 * BOMList ("Плата"): id, name, boardCode, resultItem, importHeaders, importRows
 * Route: id, specificationId, projectId, name, planningQuantity, planningStatus, flowLaunchMode,
 * transferBatchQuantity, canceledAt, isDefault
 * RouteStep: id, routeId, operationId, workCenterId, operationName, stepOrder, isRequired, specTaskId, fulfillmentMode,
 * operationInputs, operationOutputs
 * OperationSlot: id, routeId, specificationId, projectId, workCenterId, routeStepId, operationName, quantity,
 * plannedStart, plannedEnd, actualStart, actualEnd, status, comment, operationInputs, operationOutputs, createdAt, updatedAt
 */

export const SLOT_STATUSES = [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "overdue",
  "problem",
] as const;

export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const STATUS_LABELS: Readonly<Record<SlotStatus, string>> = {
  planned: "Запланировано",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Завершено",
  overdue: "Просрочено",
  problem: "Проблема",
};
