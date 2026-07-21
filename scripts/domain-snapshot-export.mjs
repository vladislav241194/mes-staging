import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANNING_STATE_KEY } from "./domain-work-orders-repository.mjs";
import { getProductionStructureResources } from "../src/production_structure_service.js";
import { toExactIsoCalendarDate } from "../src/domain/calendar_date.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parsePlanningState(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Error("Planning snapshot contains invalid JSON");
  }
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`Migration export: ${label} is required`);
  return text;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Migration export: ${label} must be positive`);
  return number;
}

function uniqueById(rows, label) {
  const ids = new Set();
  rows.forEach((row) => {
    const id = requiredText(row.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`Migration export: duplicate ${label} id ${id}`);
    ids.add(id);
  });
  return ids;
}

function toIsoOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const time = Date.parse(text);
  if (Number.isNaN(time)) throw new Error(`Migration export: invalid timestamp ${text}`);
  return new Date(time).toISOString();
}

function operationExecutionContext(step = {}) {
  return {
    calculationType: String(step.calculationType || ""),
    unitsPerHour: Number(step.unitsPerHour || 0),
    setupMin: Math.max(0, Number(step.setupMin || 0)),
    boardsPerPanel: Math.max(1, Math.round(Number(step.boardsPerPanel || 1) || 1)),
    secondsPerPanel: Math.max(0, Number(step.secondsPerPanel || 0)),
    resourceId: String(step.resourceId || ""),
    bomListId: String(step.bomListId || ""),
    isWarehouseOperation: Boolean(step.isWarehouseOperation),
  };
}

function workCenterCalendar(center = {}) {
  return {
    work_center_id: requiredText(center.id, "work center.id"),
    work_schedule: String(center.workSchedule || center.shift || "5/2"),
    work_mode: String(center.calendarShiftWindow || center.workMode || center.shift || "08:00-17:00"),
    timezone: "Europe/Moscow",
    is_active: center.isActive !== false,
  };
}

function productionResource(resource = {}) {
  return {
    id: requiredText(resource.id, "production resource.id"),
    work_center_id: requiredText(resource.workCenterId, "production resource.work_center_id"),
    name: requiredText(resource.name, "production resource.name"),
    resource_type: String(resource.type || "staff"),
    capacity_hours: Math.max(0, Number(resource.capacityHours || resource.availabilityHoursPerShift || 0)),
    units_per_hour: Math.max(0, Number(resource.unitsPerHour || 0)),
    participates_in_calculation: resource.participatesInCalculation !== "no",
    participates_in_planning: resource.participatesInPlanning !== "no",
    is_active: !["Отключен", "inactive"].includes(String(resource.status || "")),
    source_kind: String(resource.sourceKind || "matrixWorkCenter"),
  };
}

// A relational route requires one unambiguous order for every operation. Older
// snapshots can contain equal `stepOrder` values after route edits; preserve all
// operations and their visible order, but make the exported sequence dense and
// unique within its work order.
function normalizeOperationSequences(rows) {
  const byWorkOrder = new Map();
  rows.forEach((row) => {
    const group = byWorkOrder.get(row.work_order_id) || [];
    group.push(row);
    byWorkOrder.set(row.work_order_id, group);
  });
  for (const group of byWorkOrder.values()) {
    group.sort((left, right) => left.source_order - right.source_order || left.source_index - right.source_index || left.id.localeCompare(right.id));
    group.forEach((row, index) => {
      row.sequence_no = index + 1;
      delete row.source_order;
      delete row.source_index;
    });
  }
  return rows;
}

/**
 * Converts a published planning snapshot into rows matching the current domain schema.
 * It is intentionally read-only: this file is the repeatable data handoff for
 * a future PostgreSQL loader, not a new source of truth.
 */
export function exportPlanningSnapshot(snapshot = {}, { exportedAt = new Date().toISOString() } = {}) {
  const planning = parsePlanningState(snapshot.values?.[PLANNING_STATE_KEY]);
  const routes = asArray(planning.routes);
  const steps = asArray(planning.routeSteps);
  const slots = asArray(planning.slots);
  const workCenters = asArray(planning.workCenters);
  const routeIds = uniqueById(routes, "work order");
  const stepIds = uniqueById(steps, "operation");

  const workOrders = routes.map((route) => ({
    id: requiredText(route.id, "work order.id"),
    number: requiredText(route.workOrderSnapshot?.id || route.id, "work order.number"),
    name: requiredText(route.specificationName || route.name, "work order.name"),
    designation: String(route.designation || ""),
    unit: String(route.unit || "шт."),
    quantity: positiveNumber(route.planningQuantity ?? route.workOrderSnapshot?.quantity, "work order.quantity"),
    lifecycle_status: requiredText(route.lifecycleStatus || "draft", "work order.lifecycle_status"),
    planning_status: requiredText(route.planningStatus || "draft", "work order.planning_status"),
    source_kind: route.sourceSpecifications2EntryId ? "specifications2" : "legacy-route",
    source_revision: Math.max(1, Number(route.documentRevisionSnapshot?.routeRevision || route.revision || 1)),
    aggregate_revision: Math.max(1, Number(route.documentRevisionSnapshot?.routeRevision || route.revision || 1)),
    planning_start_date: toExactIsoCalendarDate(route.planningStartDate) || null,
    metadata: { ...route },
    created_at: toIsoOrNull(route.createdAt),
    updated_at: toIsoOrNull(route.updatedAt),
  }));

  const workOrderOperations = normalizeOperationSequences(steps.map((step, index) => {
    const workOrderId = requiredText(step.routeId, "operation.work_order_id");
    if (!routeIds.has(workOrderId)) throw new Error(`Migration export: operation ${step.id} references unknown work order ${workOrderId}`);
    const declaredOrder = Number(step.stepOrder);
    return {
      id: requiredText(step.id || step.routeStepId, "operation.id"),
      work_order_id: workOrderId,
      operation_id: requiredText(step.operationId, "operation.operation_id"),
      name: requiredText(step.operationName || step.name, "operation.name"),
      work_center_id: requiredText(step.workCenterId || step.routeWorkCenterId, "operation.work_center_id"),
      next_work_center_id: String(step.nextWorkCenterId || ""),
      quantity_multiplier: Math.max(1, Math.round(Number(step.quantityMultiplier ?? step.specTaskQuantity ?? 1) || 1)),
      execution_context: operationExecutionContext(step),
      // Removed by normalizeOperationSequences after ordering is established.
      source_order: Number.isFinite(declaredOrder) && declaredOrder > 0 ? declaredOrder : index + 1,
      source_index: index,
      labor: step.labor || step.planningLabor || {},
      metadata: { ...step },
    };
  }));

  const quantityByWorkOrderId = new Map(workOrders.map((row) => [row.id, row.quantity]));
  const workOrderIdByOperationId = new Map(workOrderOperations.map((row) => [row.id, row.work_order_id]));

  const planningSlots = slots.map((slot) => {
    const operationId = requiredText(slot.routeStepId, "planning slot.work_order_operation_id");
    if (!stepIds.has(operationId)) throw new Error(`Migration export: slot ${slot.id} references unknown operation ${operationId}`);
    const routeQuantity = quantityByWorkOrderId.get(workOrderIdByOperationId.get(operationId));
    return {
      id: requiredText(slot.id, "planning slot.id"),
      work_order_operation_id: operationId,
      planned_start: toIsoOrNull(slot.plannedStart),
      planned_end: toIsoOrNull(slot.plannedEnd),
      status: String(slot.status || "planned"),
      quantity: positiveNumber(slot.quantity ?? routeQuantity, "planning slot.quantity"),
      is_locked: Boolean(slot.locked),
      metadata: { ...slot },
    };
  });
  uniqueById(planningSlots, "planning slot");
  const workCenterCalendars = workCenters.map(workCenterCalendar);
  uniqueById(workCenterCalendars.map((row) => ({ ...row, id: row.work_center_id })), "work center calendar");
  // Resource overrides are stored next to the shared UI state. Export them as
  // part of the operational snapshot so a server-side recalculation uses the
  // same capacities the planner sees, rather than the unmodified matrix.
  const productionResources = getProductionStructureResources(snapshot.sharedUi?.productionStructureMatrixOverrides || {}).map(productionResource);
  uniqueById(productionResources, "production resource");

  return {
    schemaVersion: "006_production_resources",
    exportedAt,
    source: {
      kind: "shared-state-snapshot",
      revision: Number(snapshot.version || 0),
      updatedAt: String(snapshot.updatedAt || ""),
    },
    workOrders,
    workOrderOperations,
    planningSlots,
    workCenterCalendars,
    productionResources,
  };
}

export function compareDomainExports(left, right) {
  const compareRows = (key) => {
    const leftRows = asArray(left?.[key]).map((row) => JSON.stringify(row)).sort();
    const rightRows = asArray(right?.[key]).map((row) => JSON.stringify(row)).sort();
    return leftRows.length === rightRows.length && leftRows.every((row, index) => row === rightRows[index]);
  };
  return {
    equal: ["workOrders", "workOrderOperations", "planningSlots", "workCenterCalendars", "productionResources"].every(compareRows),
    workOrdersEqual: compareRows("workOrders"),
    operationsEqual: compareRows("workOrderOperations"),
    slotsEqual: compareRows("planningSlots"),
    workCenterCalendarsEqual: compareRows("workCenterCalendars"),
    productionResourcesEqual: compareRows("productionResources"),
  };
}

async function main() {
  const sourcePath = resolve(process.argv[2] || ".mes-shared-state.json");
  const targetPath = resolve(process.argv[3] || `domain-export-${basename(sourcePath)}.json`);
  const snapshot = JSON.parse(await readFile(sourcePath, "utf-8"));
  const exported = exportPlanningSnapshot(snapshot);
  await writeFile(targetPath, `${JSON.stringify(exported, null, 2)}\n`, "utf-8");
  console.log(`Domain snapshot export: ${targetPath}`);
  console.log(`- work orders: ${exported.workOrders.length}`);
  console.log(`- operations: ${exported.workOrderOperations.length}`);
  console.log(`- planning slots: ${exported.planningSlots.length}`);
  console.log(`- work-center calendars: ${exported.workCenterCalendars.length}`);
  console.log(`- production resources: ${exported.productionResources.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
