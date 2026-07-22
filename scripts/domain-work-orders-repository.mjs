import { createHash } from "node:crypto";
import {
  readSharedStateSnapshot,
  updateSharedStateSnapshot,
  updateSpecifications2WorkOrderSharedStateSnapshot,
} from "./shared-state-endpoint.mjs";
import { buildPlanningGanttWindow, readPlanningGanttWindowBounds } from "./planning-gantt-window-projection.mjs";
import { isExactIsoCalendarDate, isExactIsoInstantWithOffset } from "../src/domain/calendar_date.js";

export const PLANNING_STATE_KEY = "mes-planning-prototype-state-v2";
const PLANNING_LIST_METADATA_FIELDS = [
  "id", "name", "revision", "createdAt", "updatedAt", "canceledAt", "isDefault",
  "projectId", "rootRouteId", "routeTaskId", "parentRouteId", "routeTaskName",
  "routeTaskSourceItemId", "planningStatus", "lifecycleStatus", "specificationId",
  "planningQuantity", "routeDocumentKind", "specificationName",
  "planningStartDate",
  "sourceSpecifications2EntryId", "sourceSpecifications2RouteDraftId",
];

// readSharedStateSnapshot already retains the parsed file by stat fingerprint.
// Retain the nested planning projection for that same immutable snapshot
// object, otherwise every domain GET reparses a multi-megabyte JSON string.
let cachedPlanningSnapshot = null;
let cachedPlanningModel = null;
let cachedPlanningFingerprintSnapshot = null;
let cachedPlanningFingerprint = "";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isSpecifications2WorkOrderOwnerActive(env = process.env) {
  return String(process.env?.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1"
    || String(env?.MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS || "") === "1";
}

function updateServerWorkOrderSnapshot(options, authorityProof) {
  return isSpecifications2WorkOrderOwnerActive(options?.env)
    ? updateSpecifications2WorkOrderSharedStateSnapshot({ ...options, authorityProof })
    : updateSharedStateSnapshot(options);
}

function parsePlanningState(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getRouteConcurrencyRevision(route = {}) {
  return Math.max(1, Number(
    route.domainConcurrencyRevision
    ?? route.documentRevisionSnapshot?.routeRevision
    ?? route.revision
    ?? 1,
  ));
}

function normalizeNullablePlanningStartDate(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return isExactIsoCalendarDate(normalized) ? normalized : undefined;
}

function applyPlanningStartDateToRoute(route = {}, planningStartDate) {
  const next = { ...route };
  if (planningStartDate === null) delete next.planningStartDate;
  else next.planningStartDate = planningStartDate;
  return next;
}

function orderProjection(route = {}, routeSteps = [], slots = [], { concurrencyRevision = 0 } = {}) {
  const routeId = String(route.id || "");
  const operations = routeSteps.filter((step) => String(step.routeId || "") === routeId);
  const planningSlots = slots.filter((slot) => String(slot.routeId || "") === routeId);
  return {
    id: routeId,
    number: String(route.workOrderSnapshot?.id || routeId),
    name: String(route.specificationName || route.name || "Заказ-наряд"),
    designation: String(route.designation || ""),
    quantity: Number(route.planningQuantity ?? route.workOrderSnapshot?.quantity ?? 0) || 0,
    unit: String(route.unit || "шт."),
    lifecycleStatus: String(route.lifecycleStatus || "draft"),
    planningStatus: String(route.planningStatus || "draft"),
    planningStartDate: isExactIsoCalendarDate(route.planningStartDate)
      ? String(route.planningStartDate)
      : null,
    revision: Number(route.documentRevisionSnapshot?.routeRevision || route.revision || 0),
    // Document revision is immutable publication history. This separate value
    // is the command ETag and may change for planning-only edits such as run
    // size, without rewriting the document revision.
    concurrencyRevision: getRouteConcurrencyRevision(route) || Number(concurrencyRevision || 1),
    source: route.sourceSpecifications2EntryId ? "specifications2" : "legacy-route",
    // Keep the temporary snapshot adapter structurally compatible with the
    // PostgreSQL read model. The planning workbench can therefore switch to
    // the server projection without a second, UI-specific data contract.
    metadata: { ...route },
    updatedAt: String(route.updatedAt || route.createdAt || ""),
    operationCount: operations.length,
    scheduledOperationCount: planningSlots.length,
  };
}

function orderListProjection(route = {}, routeSteps = [], slots = []) {
  const item = orderProjection(route, routeSteps, slots);
  item.metadata = Object.fromEntries(
    PLANNING_LIST_METADATA_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(item.metadata || {}, field))
      .map((field) => [field, item.metadata[field]]),
  );
  return item;
}

function orderDetailProjection(route = {}, routeSteps = [], slots = []) {
  const item = orderProjection(route, routeSteps, slots);
  const source = item.metadata || {};
  const revision = source.documentRevisionSnapshot && typeof source.documentRevisionSnapshot === "object"
    ? source.documentRevisionSnapshot : {};
  const workOrder = source.workOrderSnapshot && typeof source.workOrderSnapshot === "object"
    ? source.workOrderSnapshot : {};
  item.metadata = {
    ...Object.fromEntries(PLANNING_LIST_METADATA_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, source[field]])),
    planningLaborByStepId: source.planningLaborByStepId || {},
    documentRevisionSnapshot: {
      specificationRevision: Number(revision.specificationRevision || 0),
      routeRevision: Number(revision.routeRevision || 0),
      product: revision.product?.name ? { name: String(revision.product.name) } : undefined,
    },
    workOrderSnapshot: { id: String(workOrder.id || item.number), quantity: Number(workOrder.quantity ?? item.quantity) },
  };
  return item;
}

function operationProjection(step = {}, slot = null) {
  return {
    id: String(step.id || step.routeStepId || ""),
    operationId: String(step.operationId || ""),
    name: String(step.operationName || step.name || "Операция"),
    workCenterId: String(step.workCenterId || step.routeWorkCenterId || ""),
    nextWorkCenterId: String(step.nextWorkCenterId || ""),
    quantityMultiplier: Math.max(1, Math.round(Number(step.quantityMultiplier ?? step.specTaskQuantity ?? 1) || 1)),
    executionContext: {
      calculationType: String(step.calculationType || ""),
      unitsPerHour: Number(step.unitsPerHour || 0),
      setupMin: Math.max(0, Number(step.setupMin || 0)),
      boardsPerPanel: Math.max(1, Math.round(Number(step.boardsPerPanel || 1) || 1)),
      secondsPerPanel: Math.max(0, Number(step.secondsPerPanel || 0)),
      resourceId: String(step.resourceId || ""),
      bomListId: String(step.bomListId || ""),
      isWarehouseOperation: Boolean(step.isWarehouseOperation),
    },
    labor: step.labor || step.planningLabor || {},
    metadata: { ...step },
    slot: slot ? {
      id: String(slot.id || ""),
      plannedStart: String(slot.plannedStart || ""),
      plannedEnd: String(slot.plannedEnd || ""),
      status: String(slot.status || "planned"),
      quantity: Number(slot.quantity || 0),
      isLocked: Boolean(slot.locked),
      metadata: { ...slot },
    } : null,
  };
}

function ganttWindowRouteProjection(route = {}) {
  return {
    id: String(route.id || ""),
    number: String(route.workOrderSnapshot?.id || route.id || ""),
    name: String(route.specificationName || route.name || "Заказ-наряд"),
    designation: String(route.designation || ""),
    planningQuantity: Number(route.planningQuantity ?? route.workOrderSnapshot?.quantity ?? 0) || 0,
    unit: String(route.unit || "шт."),
    lifecycleStatus: String(route.lifecycleStatus || "draft"),
    planningStatus: String(route.planningStatus || "draft"),
    domainConcurrencyRevision: getRouteConcurrencyRevision(route),
  };
}

function ganttWindowRouteStepProjection(step = {}) {
  return {
    id: String(step.id || step.routeStepId || ""),
    operationId: String(step.operationId || ""),
    operationName: String(step.operationName || step.name || "Операция"),
    workCenterId: String(step.workCenterId || step.routeWorkCenterId || ""),
    nextWorkCenterId: String(step.nextWorkCenterId || ""),
    sequenceNo: Number(step.stepOrder ?? step.sequenceNo ?? 0) || 0,
    quantityMultiplier: Math.max(1, Number(step.quantityMultiplier ?? step.specTaskQuantity ?? 1) || 1),
  };
}

function ganttWindowSlotProjection(slot = {}, step = {}) {
  return {
    id: String(slot.id || ""),
    plannedStart: String(slot.plannedStart || ""),
    plannedEnd: String(slot.plannedEnd || ""),
    status: String(slot.status || "planned"),
    quantity: Number(slot.quantity || 0),
    locked: Boolean(slot.locked),
    // Preserve the same scalar placement precedence as the existing compact
    // schedule read, without carrying the full route/operation/slot JSON.
    workCenterId: String(
      slot.planningWorkCenterId
      || slot.workCenterId
      || step.planningWorkCenterId
      || step.planningLineWorkCenterId
      || step.workCenterId
      || "",
    ),
    resourceId: String(slot.resourceId || step.resourceId || step.executionContext?.resourceId || ""),
  };
}

function readModel(snapshot = {}) {
  if (snapshot === cachedPlanningSnapshot && cachedPlanningModel) return cachedPlanningModel;
  const planning = parsePlanningState(snapshot.values?.[PLANNING_STATE_KEY]);
  const model = {
    routes: asArray(planning.routes),
    routeSteps: asArray(planning.routeSteps),
    slots: asArray(planning.slots),
  };
  cachedPlanningSnapshot = snapshot;
  cachedPlanningModel = model;
  return model;
}

// The proof used by the PostgreSQL/snapshot parity guard must reflect exactly
// the compatibility planning payload, not the whole shared UI snapshot.  The
// file/KV adapter already retains an unchanged snapshot object, so the digest
// is calculated only after a real snapshot replacement instead of on every
// planning API request.
function planningProjectionFingerprint(snapshot = {}) {
  if (snapshot === cachedPlanningFingerprintSnapshot && cachedPlanningFingerprint) return cachedPlanningFingerprint;
  const planning = snapshot?.values?.[PLANNING_STATE_KEY];
  const serialized = typeof planning === "string" ? planning : JSON.stringify(planning ?? null);
  cachedPlanningFingerprint = `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
  cachedPlanningFingerprintSnapshot = snapshot;
  return cachedPlanningFingerprint;
}

function metaFromSnapshot({ configured, kind, snapshot }) {
  return {
    storageMode: "snapshot-adapter",
    storageBackend: kind || "unconfigured",
    revision: Number(snapshot.version || 0),
    updatedAt: String(snapshot.updatedAt || ""),
    configured,
  };
}

function summarizeModel(model = {}) {
  const routes = asArray(model.routes);
  const byPlanningStatus = {};
  const byLifecycleStatus = {};
  let totalQuantity = 0;
  routes.forEach((route) => {
    const planningStatus = String(route.planningStatus || "draft");
    const lifecycleStatus = String(route.lifecycleStatus || "draft");
    byPlanningStatus[planningStatus] = (byPlanningStatus[planningStatus] || 0) + 1;
    byLifecycleStatus[lifecycleStatus] = (byLifecycleStatus[lifecycleStatus] || 0) + 1;
    totalQuantity += Math.max(0, Number(route.planningQuantity ?? route.workOrderSnapshot?.quantity) || 0);
  });
  const operationCount = asArray(model.routeSteps).length;
  const scheduledOperationCount = asArray(model.slots).length;
  return {
    workOrderCount: routes.length,
    totalQuantity,
    operationCount,
    scheduledOperationCount,
    unscheduledOperationCount: Math.max(0, operationCount - scheduledOperationCount),
    byPlanningStatus,
    byLifecycleStatus,
  };
}

/**
 * Temporary repository implementation. Its public methods deliberately use
 * aggregate-shaped values so the HTTP API does not know about snapshot keys.
 * A PostgreSQL implementation will provide the same methods in the next stage.
 */
export function createWorkOrdersRepository({ env = process.env, filePath = "" } = {}) {
  async function read() {
    return readSharedStateSnapshot({ env, filePath });
  }

  function findRoute(model, id) {
    const key = String(id || "");
    // PostgreSQL outbox rows carry the canonical aggregate id. A legacy
    // work-order number may happen to equal another route id, so resolve the
    // exact route id first and use the historical number only as a fallback.
    return model.routes.find((item) => String(item.id || "") === key)
      || model.routes.find((item) => String(item.workOrderSnapshot?.id || "") === key);
  }

  return {
    async health() {
      const state = await read();
      return {
        ...metaFromSnapshot(state),
        // This is intentionally an internal repository capability.  Other
        // read methods keep the public snapshot contract unchanged.
        planningProjectionFingerprint: planningProjectionFingerprint(state.snapshot),
      };
    },

    async list() {
      const state = await read();
      const model = readModel(state.snapshot);
      return {
        ...metaFromSnapshot(state),
        items: model.routes.map((route) => orderListProjection(route, model.routeSteps, model.slots)),
      };
    },

    // The Planning workbench needs a compact list and exactly one selected
    // aggregate. Build both from one immutable shared-state snapshot so the
    // compatibility path cannot mix a sidebar from one revision with a
    // selected order from another.
    async listWorkbenchBootstrap(activeId = "") {
      const state = await read();
      const model = readModel(state.snapshot);
      const requestedId = String(activeId || "").trim();
      const route = (requestedId && findRoute(model, requestedId)) || model.routes[0] || null;
      const routeId = String(route?.id || "");
      const slotsByStepId = new Map(model.slots
        .filter((slot) => String(slot.routeId || "") === routeId)
        .map((slot) => [String(slot.routeStepId || ""), slot]));
      const item = route ? {
        ...orderDetailProjection(route, model.routeSteps, model.slots),
        operations: model.routeSteps
          .filter((step) => String(step.routeId || "") === routeId)
          .map((step) => operationProjection(step, slotsByStepId.get(String(step.id || step.routeStepId || "")) || null)),
      } : null;
      return {
        ...metaFromSnapshot(state),
        items: model.routes.map((candidate) => orderListProjection(candidate, model.routeSteps, model.slots)),
        activeId: item?.id || "",
        item,
      };
    },

    async summary() {
      const state = await read();
      return { ...metaFromSnapshot(state), summary: summarizeModel(readModel(state.snapshot)) };
    },

    // This is intentionally separate from the historical global runtime
    // projection. The old aggregate maps one route step to its first slot;
    // a Gantt window must retain every physical slot so split work remains
    // visible while the rest of the page continues to use its compatibility
    // state unchanged.
    async listGanttWindow(period = {}) {
      const bounds = readPlanningGanttWindowBounds(period);
      const state = await read();
      const model = readModel(state.snapshot);
      const routesById = new Map(model.routes.map((route) => [String(route.id || ""), route]));
      const stepsById = new Map(model.routeSteps.map((step) => [String(step.id || step.routeStepId || ""), step]));
      const entries = model.slots.map((slot) => {
        const routeId = String(slot.routeId || "");
        const routeStepId = String(slot.routeStepId || "");
        const route = routesById.get(routeId) || {};
        const step = stepsById.get(routeStepId) || {};
        return {
          route: ganttWindowRouteProjection(route),
          routeStep: { ...ganttWindowRouteStepProjection(step), routeId },
          slot: ganttWindowSlotProjection(slot, step),
        };
      });
      return {
        ...metaFromSnapshot(state),
        window: buildPlanningGanttWindow(entries, bounds),
      };
    },

    async get(id) {
      const state = await read();
      const model = readModel(state.snapshot);
      const route = findRoute(model, id);
      if (!route) return { ...metaFromSnapshot(state), item: null };
      const routeId = String(route.id || "");
      const operationCodeByStepId = new Map(model.routeSteps
        .filter((step) => String(step.routeId || "") === routeId)
        .map((step) => [String(step.id || step.routeStepId || ""), String(step.operationId || "")]));
      const slotsByStepId = new Map(model.slots
        .filter((slot) => String(slot.routeId || "") === routeId)
        .map((slot) => [String(slot.routeStepId || ""), slot]));
      return {
        ...metaFromSnapshot(state),
        item: {
          ...orderDetailProjection(route, model.routeSteps, model.slots),
          operations: model.routeSteps
            .filter((step) => String(step.routeId || "") === routeId)
            .map((step) => operationProjection(step, slotsByStepId.get(String(step.id || step.routeStepId || "")) || null)),
          physicalSlots: model.slots
            .filter((slot) => String(slot.routeId || "") === routeId)
            .map((slot) => ({
              id: String(slot.id || ""),
              routeId,
              routeStepId: String(slot.routeStepId || ""),
              operationId: operationCodeByStepId.get(String(slot.routeStepId || "")) || "",
              plannedStart: String(slot.plannedStart || ""),
              plannedEnd: String(slot.plannedEnd || ""),
              status: String(slot.status || "planned"),
              quantity: Number(slot.quantity || 0),
              isLocked: Boolean(slot.locked),
              metadata: slot.metadata || {},
            })),
        },
      };
    },

    async changeQuantity(id, { quantity, expectedRevision }) {
      const before = await read();
      const beforeModel = readModel(before.snapshot);
      const currentRoute = findRoute(beforeModel, id);
      if (!currentRoute) return { ...metaFromSnapshot(before), conflict: false, item: null };
      const resolvedRouteId = String(currentRoute.id || "");
      const currentConcurrencyRevision = getRouteConcurrencyRevision(currentRoute);
      if (Number(expectedRevision) !== currentConcurrencyRevision) {
        return {
          ...metaFromSnapshot(before),
          conflict: true,
          item: orderProjection(currentRoute, beforeModel.routeSteps, beforeModel.slots),
        };
      }
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          let found = false;
          nextPlanning.routes = asArray(nextPlanning.routes).map((item) => {
            const matches = String(item.id || "") === resolvedRouteId;
            if (!matches) return item;
            found = true;
            return {
              ...item,
              planningQuantity: quantity,
              domainConcurrencyRevision: currentConcurrencyRevision + 1,
              updatedAt: new Date().toISOString(),
              workOrderSnapshot: { ...item.workOrderSnapshot, quantity },
            };
          });
          if (!found) return current;
          return {
            ...current,
            values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) },
          };
        },
      });
      if (!updated.ok || updated.conflict) {
        return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), conflict: Boolean(updated.conflict), item: null };
      }
      const model = readModel(updated.snapshot);
      const route = findRoute(model, resolvedRouteId);
      return {
        ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }),
        conflict: false,
        item: route ? orderProjection(route, model.routeSteps, model.slots) : null,
      };
    },

    async changeStartDate(id, command = {}) {
      const { planningStartDate, expectedRevision } = command;
      const hasPlanningStartDate = Object.prototype.hasOwnProperty.call(command, "planningStartDate");
      const normalizedDate = normalizeNullablePlanningStartDate(planningStartDate);
      if (!hasPlanningStartDate || normalizedDate === undefined) {
        throw new Error("planningStartDate must be an ISO calendar date or explicit null");
      }
      const before = await read();
      const beforeModel = readModel(before.snapshot);
      const currentRoute = findRoute(beforeModel, id);
      if (!currentRoute) return { ...metaFromSnapshot(before), conflict: false, item: null };
      const resolvedRouteId = String(currentRoute.id || "");
      const currentRevision = getRouteConcurrencyRevision(currentRoute);
      if (Number(expectedRevision) !== currentRevision) {
        return { ...metaFromSnapshot(before), conflict: true, item: orderProjection(currentRoute, beforeModel.routeSteps, beforeModel.slots) };
      }
      const currentDate = isExactIsoCalendarDate(currentRoute.planningStartDate)
        ? String(currentRoute.planningStartDate)
        : null;
      if (currentDate === normalizedDate) {
        return { ...metaFromSnapshot(before), conflict: false, idempotentReplay: true, item: orderProjection(currentRoute, beforeModel.routeSteps, beforeModel.slots) };
      }
      const stamp = new Date().toISOString();
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          nextPlanning.routes = asArray(nextPlanning.routes).map((route) => {
            if (String(route.id || "") !== resolvedRouteId) return route;
            return applyPlanningStartDateToRoute({
              ...route,
              domainConcurrencyRevision: currentRevision + 1,
              updatedAt: stamp,
            }, normalizedDate);
          });
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), conflict: Boolean(updated.conflict), item: null };
      const model = readModel(updated.snapshot);
      const route = findRoute(model, resolvedRouteId);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), conflict: false, item: route ? orderProjection(route, model.routeSteps, model.slots) : null };
    },

    async changeSlotSchedule(id, operationId, { slotId, plannedStart, expectedRevision }) {
      const exactSlotId = String(slotId || "").trim();
      if (!exactSlotId) throw new Error("Exact planning slotId is required");
      if (!isExactIsoInstantWithOffset(plannedStart)) throw new Error("plannedStart must be an exact ISO date-time with offset");
      const start = new Date(plannedStart);
      const before = await read();
      const model = readModel(before.snapshot);
      const route = findRoute(model, id);
      if (!route) return { ...metaFromSnapshot(before), conflict: false, item: null };
      const routeId = String(route.id || "");
      const currentRevision = getRouteConcurrencyRevision(route);
      if (Number(expectedRevision) !== currentRevision) {
        return { ...metaFromSnapshot(before), conflict: true, item: orderProjection(route, model.routeSteps, model.slots) };
      }
      const currentSlot = model.slots.find((slot) => String(slot.id || "") === exactSlotId
        && String(slot.routeId || "") === routeId
        && String(slot.routeStepId || "") === String(operationId));
      if (!currentSlot) return { ...metaFromSnapshot(before), conflict: false, item: null };
      if (currentSlot.locked || ["completed", "done"].includes(String(currentSlot.status || "").toLowerCase())) {
        throw new Error("Completed or locked planning slot cannot be rescheduled");
      }
      const oldStart = new Date(currentSlot.plannedStart || start);
      const oldEnd = new Date(currentSlot.plannedEnd || oldStart);
      const durationMs = Math.max(0, oldEnd.getTime() - oldStart.getTime());
      const plannedEnd = new Date(start.getTime() + durationMs).toISOString();
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          let found = false;
          nextPlanning.routes = asArray(nextPlanning.routes).map((item) => {
            const matches = String(item.id || "") === routeId;
            if (!matches) return item;
            found = true;
            return { ...item, domainConcurrencyRevision: currentRevision + 1, updatedAt: new Date().toISOString() };
          });
          if (!found) return current;
          nextPlanning.slots = asArray(nextPlanning.slots).map((slot) => (
            String(slot.id || "") === exactSlotId
              ? { ...slot, plannedStart: start.toISOString(), plannedEnd, updatedAt: new Date().toISOString() }
              : slot
          ));
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const nextRoute = findRoute(nextModel, routeId);
      const authoritativeSlot = nextModel.slots.find((slot) => String(slot.id || "") === exactSlotId
        && String(slot.routeId || "") === routeId
        && String(slot.routeStepId || "") === String(operationId)) || null;
      if (!authoritativeSlot || String(authoritativeSlot.id) !== exactSlotId) throw new Error("Exact planning slot authoritative read-back failed");
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), conflict: false, item: nextRoute ? orderProjection(nextRoute, nextModel.routeSteps, nextModel.slots) : null, slot: authoritativeSlot };
    },

    async applyServerAggregateProjection(id, {
      expectedRevision,
      targetRevision,
      item = null,
    } = {}) {
      const before = await read();
      const model = readModel(before.snapshot);
      const route = findRoute(model, id);
      if (!route || !item?.id) return { ...metaFromSnapshot(before), applied: false, conflict: false, item: null };
      const routeId = String(route.id || "");
      const currentRevision = getRouteConcurrencyRevision(route);
      const quantity = Number(item.quantity);
      const hasPlanningStartDate = Object.prototype.hasOwnProperty.call(item, "planningStartDate");
      const planningStartDate = normalizeNullablePlanningStartDate(item.planningStartDate);
      if (!Number.isFinite(quantity) || quantity <= 0
        || !hasPlanningStartDate || planningStartDate === undefined) {
        throw new Error("Authoritative work-order aggregate projection is invalid");
      }
      const authoritativeSlots = Array.isArray(item.physicalSlots)
        ? item.physicalSlots
        : (item.operations || []).map((operation) => operation?.slot);
      const slotProjection = new Map(authoritativeSlots
        .filter((slot) => slot?.id)
        .map((slot) => [String(slot.id), slot]));
      const currentSlots = model.slots.filter((slot) => String(slot.routeId || "") === routeId);
      const slotsMatch = currentSlots.length === slotProjection.size
        && currentSlots.every((slot) => {
          const projected = slotProjection.get(String(slot.id || ""));
          return projected
            && Number(slot.quantity) === Number(projected.quantity)
            && String(slot.plannedStart || "") === String(projected.plannedStart || "")
            && String(slot.plannedEnd || "") === String(projected.plannedEnd || "")
            && String(slot.status || "planned") === String(projected.status || "planned")
            && Boolean(slot.locked) === Boolean(projected.isLocked);
        });
      const alreadyApplied = currentRevision === Number(targetRevision)
        && Number(route.planningQuantity ?? route.workOrderSnapshot?.quantity) === quantity
        && (isExactIsoCalendarDate(route.planningStartDate) ? String(route.planningStartDate) : null) === planningStartDate
        && slotsMatch;
      if (alreadyApplied) {
        return { ...metaFromSnapshot(before), applied: true, conflict: false, alreadyApplied: true, item: orderProjection(route, model.routeSteps, model.slots) };
      }
      // Planning commands covered by this outbox do not create/remove slots.
      // A different set indicates an independent compatibility writer and
      // must not be overwritten by a latest-state rebase.
      if (currentRevision !== Number(expectedRevision)
        || currentSlots.length !== slotProjection.size
        || currentSlots.some((slot) => !slotProjection.has(String(slot.id || "")))) {
        return { ...metaFromSnapshot(before), applied: false, conflict: true, item: orderProjection(route, model.routeSteps, model.slots) };
      }
      const stamp = new Date().toISOString();
      const slotUpdates = [...slotProjection.values()].map((slot) => ({
        id: String(slot.id || ""),
        quantity: Number(slot.quantity),
        plannedStart: String(slot.plannedStart || ""),
        plannedEnd: String(slot.plannedEnd || ""),
        status: String(slot.status || "planned"),
        locked: Boolean(slot.isLocked),
      }));
      const updated = await updateServerWorkOrderSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          nextPlanning.routes = asArray(nextPlanning.routes).map((candidate) => {
            if (String(candidate.id || "") !== routeId) return candidate;
            return applyPlanningStartDateToRoute({
              ...candidate,
              planningQuantity: quantity,
              domainConcurrencyRevision: Number(targetRevision),
              updatedAt: stamp,
              workOrderSnapshot: { ...candidate.workOrderSnapshot, quantity },
            }, planningStartDate);
          });
          nextPlanning.slots = asArray(nextPlanning.slots).map((slot) => {
            if (String(slot.routeId || "") !== routeId) return slot;
            const projected = slotProjection.get(String(slot.id || ""));
            if (!projected) return slot;
            return {
              ...slot,
              quantity: Number(projected.quantity),
              plannedStart: String(projected.plannedStart || ""),
              plannedEnd: String(projected.plannedEnd || ""),
              status: String(projected.status || "planned"),
              locked: Boolean(projected.isLocked),
              updatedAt: stamp,
            };
          });
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      }, {
        kind: "aggregate-rebase",
        workOrderId: String(id),
        routeId,
        expectedRevision: Number(expectedRevision),
        targetRevision: Number(targetRevision),
        quantity,
        planningStartDate,
        slotUpdates,
        stamp,
      });
      if (!updated.ok || updated.conflict) {
        return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      }
      const nextModel = readModel(updated.snapshot);
      const nextRoute = findRoute(nextModel, routeId);
      return {
        ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }),
        applied: true,
        conflict: false,
        item: nextRoute ? orderProjection(nextRoute, nextModel.routeSteps, nextModel.slots) : null,
      };
    },

    async applyServerQuantityProjection(id, {
      expectedRevision,
      targetRevision,
      quantity,
      operations = [],
    } = {}) {
      const before = await read();
      const beforeModel = readModel(before.snapshot);
      const currentRoute = findRoute(beforeModel, id);
      if (!currentRoute) return { ...metaFromSnapshot(before), applied: false, conflict: false, item: null };
      const currentRevision = getRouteConcurrencyRevision(currentRoute);
      const slotProjection = new Map((operations || [])
        .map((operation) => operation?.slot)
        .filter((slot) => slot?.id)
        .map((slot) => [String(slot.id), slot]));
      const routeId = String(currentRoute.id || "");
      const currentSlots = beforeModel.slots.filter((slot) => String(slot.routeId || "") === routeId);
      const alreadyApplied = currentRevision === Number(targetRevision)
        && Number(currentRoute.planningQuantity) === Number(quantity)
        && currentSlots.every((slot) => {
          const projected = slotProjection.get(String(slot.id));
          return !projected || (Number(slot.quantity) === Number(projected.quantity)
            && String(slot.plannedEnd || "") === String(projected.plannedEnd || ""));
        });
      if (alreadyApplied) return { ...metaFromSnapshot(before), applied: true, conflict: false, item: orderProjection(currentRoute, beforeModel.routeSteps, beforeModel.slots) };
      if (currentRevision !== Number(expectedRevision)) {
        return { ...metaFromSnapshot(before), applied: false, conflict: true, item: orderProjection(currentRoute, beforeModel.routeSteps, beforeModel.slots) };
      }
      const stamp = new Date().toISOString();
      const slotUpdates = [...slotProjection.values()].map((projected) => ({
        id: String(projected.id || ""),
        quantity: Number(projected.quantity),
        plannedStart: String(projected.plannedStart || ""),
        plannedEnd: String(projected.plannedEnd || ""),
      }));
      const updated = await updateServerWorkOrderSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          let found = false;
          nextPlanning.routes = asArray(nextPlanning.routes).map((route) => {
            const matches = String(route.id || "") === routeId;
            if (!matches) return route;
            found = true;
            return {
              ...route,
              planningQuantity: Number(quantity),
              domainConcurrencyRevision: Number(targetRevision),
              updatedAt: stamp,
              workOrderSnapshot: { ...route.workOrderSnapshot, quantity: Number(quantity) },
            };
          });
          if (!found) return current;
          nextPlanning.slots = asArray(nextPlanning.slots).map((slot) => {
            if (String(slot.routeId || "") !== routeId) return slot;
            const projected = slotProjection.get(String(slot.id));
            if (!projected) return slot;
            return {
              ...slot,
              quantity: Number(projected.quantity),
              plannedStart: String(projected.plannedStart || slot.plannedStart || ""),
              plannedEnd: String(projected.plannedEnd || slot.plannedEnd || ""),
              updatedAt: stamp,
            };
          });
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      }, {
        kind: "quantity",
        workOrderId: String(id),
        routeId,
        expectedRevision: Number(expectedRevision),
        targetRevision: Number(targetRevision),
        quantity: Number(quantity),
        slotUpdates,
        stamp,
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const model = readModel(updated.snapshot);
      const route = findRoute(model, routeId);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), applied: true, conflict: false, item: route ? orderProjection(route, model.routeSteps, model.slots) : null };
    },

    async applyServerSlotScheduleProjection(id, { expectedRevision, targetRevision, slot } = {}) {
      const before = await read();
      const model = readModel(before.snapshot);
      const route = findRoute(model, id);
      if (!route || !slot?.id) return { ...metaFromSnapshot(before), applied: false, conflict: false, item: null };
      const routeId = String(route.id || "");
      const currentRevision = getRouteConcurrencyRevision(route);
      const currentSlot = model.slots.find((item) => String(item.routeId || "") === routeId && String(item.id || "") === String(slot.id));
      const alreadyApplied = currentRevision === Number(targetRevision)
        && currentSlot
        && String(currentSlot.plannedStart || "") === String(slot.plannedStart || "")
        && String(currentSlot.plannedEnd || "") === String(slot.plannedEnd || "");
      if (alreadyApplied) return { ...metaFromSnapshot(before), applied: true, conflict: false, item: orderProjection(route, model.routeSteps, model.slots) };
      if (currentRevision !== Number(expectedRevision) || !currentSlot) {
        return { ...metaFromSnapshot(before), applied: false, conflict: true, item: orderProjection(route, model.routeSteps, model.slots) };
      }
      const stamp = new Date().toISOString();
      const plannedStart = String(slot.plannedStart || currentSlot.plannedStart || "");
      const plannedEnd = String(slot.plannedEnd || currentSlot.plannedEnd || "");
      const updated = await updateServerWorkOrderSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          nextPlanning.routes = asArray(nextPlanning.routes).map((item) => (
            String(item.id || "") === routeId
              ? { ...item, domainConcurrencyRevision: Number(targetRevision), updatedAt: stamp }
              : item
          ));
          nextPlanning.slots = asArray(nextPlanning.slots).map((item) => (
            String(item.routeId || "") === routeId && String(item.id || "") === String(slot.id)
              ? { ...item, plannedStart, plannedEnd, updatedAt: stamp }
              : item
          ));
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      }, {
        kind: "slot-schedule",
        workOrderId: String(id),
        routeId,
        slotId: String(slot.id),
        expectedRevision: Number(expectedRevision),
        targetRevision: Number(targetRevision),
        plannedStart,
        plannedEnd,
        stamp,
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const nextRoute = findRoute(nextModel, routeId);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), applied: true, conflict: false, item: nextRoute ? orderProjection(nextRoute, nextModel.routeSteps, nextModel.slots) : null };
    },

    async applyServerStartDateProjection(id, projection = {}) {
      const { expectedRevision, targetRevision, planningStartDate } = projection;
      const hasPlanningStartDate = Object.prototype.hasOwnProperty.call(projection, "planningStartDate");
      const normalizedDate = normalizeNullablePlanningStartDate(planningStartDate);
      if (!hasPlanningStartDate || normalizedDate === undefined) {
        throw new Error("planningStartDate must be an ISO calendar date or explicit null");
      }
      const before = await read();
      const beforeModel = readModel(before.snapshot);
      const route = findRoute(beforeModel, id);
      if (!route) return { ...metaFromSnapshot(before), applied: false, conflict: false, item: null };
      const routeId = String(route.id || "");
      const currentRevision = getRouteConcurrencyRevision(route);
      const alreadyApplied = currentRevision === Number(targetRevision)
        && (isExactIsoCalendarDate(route.planningStartDate) ? String(route.planningStartDate) : null) === normalizedDate;
      if (alreadyApplied) return { ...metaFromSnapshot(before), applied: true, conflict: false, item: orderProjection(route, beforeModel.routeSteps, beforeModel.slots) };
      if (currentRevision !== Number(expectedRevision)) {
        return { ...metaFromSnapshot(before), applied: false, conflict: true, item: orderProjection(route, beforeModel.routeSteps, beforeModel.slots) };
      }
      const stamp = new Date().toISOString();
      const updated = await updateServerWorkOrderSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          nextPlanning.routes = asArray(nextPlanning.routes).map((item) => {
            if (String(item.id || "") !== routeId) return item;
            return applyPlanningStartDateToRoute({
              ...item,
              domainConcurrencyRevision: Number(targetRevision),
              updatedAt: stamp,
            }, normalizedDate);
          });
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      }, {
        kind: "start-date",
        workOrderId: String(id),
        routeId,
        expectedRevision: Number(expectedRevision),
        targetRevision: Number(targetRevision),
        planningStartDate: normalizedDate,
        stamp,
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const nextRoute = findRoute(nextModel, routeId);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), applied: true, conflict: false, item: nextRoute ? orderProjection(nextRoute, nextModel.routeSteps, nextModel.slots) : null };
    },

    async applyServerWorkOrderProjection(id, { targetRevision, source = {}, operations = [] } = {}) {
      const before = await read();
      const beforeModel = readModel(before.snapshot);
      const existing = findRoute(beforeModel, id);
      if (existing) {
        const existingProjection = orderProjection(existing, beforeModel.routeSteps, beforeModel.slots);
        const alreadyApplied = Number(existingProjection.concurrencyRevision) === Number(targetRevision)
          && String(existingProjection.source) === "specifications2";
        return { ...metaFromSnapshot(before), applied: alreadyApplied, conflict: !alreadyApplied, item: existingProjection };
      }
      const sourceEntryId = String(source.sourceEntryId || "").trim();
      const sourceRevision = Math.max(1, Number(source.sourceRevision || 1));
      if (!sourceEntryId || !Array.isArray(operations) || !operations.length) {
        return { ...metaFromSnapshot(before), applied: false, conflict: true, item: null };
      }
      const stamp = new Date().toISOString();
      const route = {
        id: String(id),
        specificationId: `spec2-server-${source.specificationRevisionId || sourceEntryId}`,
        specificationName: String(source.title || "Спецификация 2.0"),
        projectId: `spec2-server-${source.specificationRevisionId || sourceEntryId}`,
        name: `Маршрутная карта · ${String(source.title || source.designation || "Изделие")}`,
        designation: String(source.designation || ""),
        isDefault: true,
        routeDocumentKind: "main",
        rootRouteId: String(id),
        planningQuantity: Number(source.quantity || 1),
        planningStatus: "draft",
        lifecycleStatus: "released",
        revision: sourceRevision,
        domainConcurrencyRevision: Number(targetRevision),
        sourceSpecifications2EntryId: sourceEntryId,
        sourceSpecifications2RouteDraftId: String(source.routeSourceDraftId || ""),
        planningLaborByStepId: Object.fromEntries((operations || []).map((operation) => [String(operation.id), operation.labor || {}])),
        documentRevisionSnapshot: {
          source: "specifications2",
          specificationEntryId: sourceEntryId,
          specificationRevision: sourceRevision,
          routeDraftId: String(source.routeSourceDraftId || ""),
          routeRevision: sourceRevision,
          releasedAt: stamp,
          product: { designation: String(source.designation || ""), name: String(source.title || "Изделие") },
          operations: (operations || []).map((operation) => ({ routeStepId: String(operation.id), operationId: String(operation.operationId || ""), operationName: String(operation.name || ""), workCenterId: String(operation.workCenterId || ""), nextWorkCenterId: String(operation.nextWorkCenterId || ""), labor: operation.labor || {} })),
        },
        workOrderSnapshot: { id: String(id), source: "specifications2", specificationRevision: sourceRevision, routeId: String(id), routeRevision: sourceRevision, quantity: Number(source.quantity || 1), operationRevisions: (operations || []).map((operation) => ({ routeStepId: String(operation.id), operationId: String(operation.operationId || ""), labor: operation.labor || {} })) },
        createdAt: stamp,
        updatedAt: stamp,
      };
      const steps = (operations || []).map((operation, index) => ({
        id: String(operation.id), routeId: String(id), stepOrder: index + 1,
        operationId: String(operation.operationId || ""), operationName: String(operation.name || "Операция"),
        workCenterId: String(operation.workCenterId || ""), routeWorkCenterId: String(operation.workCenterId || ""), nextWorkCenterId: String(operation.nextWorkCenterId || ""),
        isRequired: true, quantityMultiplier: Math.max(1, Number(operation.quantityMultiplier || 1)),
        calculationType: String(operation.executionContext?.calculationType || ""), unitsPerHour: Number(operation.executionContext?.unitsPerHour || 0), setupMin: Number(operation.executionContext?.setupMin || 0), boardsPerPanel: Number(operation.executionContext?.boardsPerPanel || 1), secondsPerPanel: Number(operation.executionContext?.secondsPerPanel || 0),
        labor: operation.labor || {}, sourceSpecifications2OperationId: String(operation.operationId || ""), updatedAt: stamp,
      }));
      const updated = await updateServerWorkOrderSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          if (asArray(nextPlanning.routes).some((route) => String(route.id || "") === String(id))) return current;
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify({ ...nextPlanning, routes: [...asArray(nextPlanning.routes), route], routeSteps: [...asArray(nextPlanning.routeSteps), ...steps] }) } };
        },
      }, {
        kind: "create",
        workOrderId: String(id),
        routeId: String(id),
        sourceEntryId,
        expectedRevision: 0,
        targetRevision: Number(targetRevision),
        route,
        steps,
        stamp,
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const projectedRoute = findRoute(nextModel, id);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), applied: Boolean(projectedRoute), conflict: false, item: projectedRoute ? orderProjection(projectedRoute, nextModel.routeSteps, nextModel.slots) : null };
    },
  };
}
