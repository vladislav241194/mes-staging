import { createHash } from "node:crypto";
import { readSharedStateSnapshot, updateSharedStateSnapshot } from "./shared-state-endpoint.mjs";

export const PLANNING_STATE_KEY = "mes-planning-prototype-state-v2";
const PLANNING_LIST_METADATA_FIELDS = [
  "id", "name", "revision", "createdAt", "updatedAt", "canceledAt", "isDefault",
  "projectId", "rootRouteId", "routeTaskId", "parentRouteId", "routeTaskName",
  "routeTaskSourceItemId", "planningStatus", "lifecycleStatus", "specificationId",
  "planningQuantity", "routeDocumentKind", "specificationName",
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
    return model.routes.find((item) => String(item.id) === id || String(item.workOrderSnapshot?.id) === id);
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

    async get(id) {
      const state = await read();
      const model = readModel(state.snapshot);
      const route = findRoute(model, id);
      if (!route) return { ...metaFromSnapshot(state), item: null };
      const routeId = String(route.id || "");
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
        },
      };
    },

    async changeQuantity(id, { quantity, expectedRevision }) {
      const before = await read();
      const beforeModel = readModel(before.snapshot);
      const currentRoute = findRoute(beforeModel, id);
      if (!currentRoute) return { ...metaFromSnapshot(before), conflict: false, item: null };
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
            const matches = String(item.id) === id || String(item.workOrderSnapshot?.id) === id;
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
      const route = findRoute(model, id);
      return {
        ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }),
        conflict: false,
        item: route ? orderProjection(route, model.routeSteps, model.slots) : null,
      };
    },

    async changeSlotSchedule(id, operationId, { plannedStart, expectedRevision }) {
      const start = new Date(plannedStart);
      if (Number.isNaN(start.getTime())) throw new Error("plannedStart must be an ISO date-time");
      const before = await read();
      const model = readModel(before.snapshot);
      const route = findRoute(model, id);
      if (!route) return { ...metaFromSnapshot(before), conflict: false, item: null };
      const currentRevision = getRouteConcurrencyRevision(route);
      if (Number(expectedRevision) !== currentRevision) {
        return { ...metaFromSnapshot(before), conflict: true, item: orderProjection(route, model.routeSteps, model.slots) };
      }
      const routeId = String(route.id || "");
      const currentSlot = model.slots.find((slot) => String(slot.routeId || "") === routeId && String(slot.routeStepId || "") === String(operationId));
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
            const matches = String(item.id) === id || String(item.workOrderSnapshot?.id) === id;
            if (!matches) return item;
            found = true;
            return { ...item, domainConcurrencyRevision: currentRevision + 1, updatedAt: new Date().toISOString() };
          });
          if (!found) return current;
          nextPlanning.slots = asArray(nextPlanning.slots).map((slot) => (
            String(slot.id || "") === String(currentSlot.id)
              ? { ...slot, plannedStart: start.toISOString(), plannedEnd, updatedAt: new Date().toISOString() }
              : slot
          ));
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const nextRoute = findRoute(nextModel, id);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), conflict: false, item: nextRoute ? orderProjection(nextRoute, nextModel.routeSteps, nextModel.slots) : null };
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
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          let found = false;
          nextPlanning.routes = asArray(nextPlanning.routes).map((route) => {
            const matches = String(route.id) === id || String(route.workOrderSnapshot?.id) === id;
            if (!matches) return route;
            found = true;
            return {
              ...route,
              planningQuantity: Number(quantity),
              domainConcurrencyRevision: Number(targetRevision),
              updatedAt: new Date().toISOString(),
              workOrderSnapshot: { ...route.workOrderSnapshot, quantity: Number(quantity) },
            };
          });
          if (!found) return current;
          nextPlanning.slots = asArray(nextPlanning.slots).map((slot) => {
            const projected = slotProjection.get(String(slot.id));
            if (!projected) return slot;
            return {
              ...slot,
              quantity: Number(projected.quantity),
              plannedStart: String(projected.plannedStart || slot.plannedStart || ""),
              plannedEnd: String(projected.plannedEnd || slot.plannedEnd || ""),
              updatedAt: new Date().toISOString(),
            };
          });
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const model = readModel(updated.snapshot);
      const route = findRoute(model, id);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), applied: true, conflict: false, item: route ? orderProjection(route, model.routeSteps, model.slots) : null };
    },

    async applyServerSlotScheduleProjection(id, { expectedRevision, targetRevision, slot } = {}) {
      const before = await read();
      const model = readModel(before.snapshot);
      const route = findRoute(model, id);
      if (!route || !slot?.id) return { ...metaFromSnapshot(before), applied: false, conflict: false, item: null };
      const currentRevision = getRouteConcurrencyRevision(route);
      const currentSlot = model.slots.find((item) => String(item.id || "") === String(slot.id));
      const alreadyApplied = currentRevision === Number(targetRevision)
        && currentSlot
        && String(currentSlot.plannedStart || "") === String(slot.plannedStart || "")
        && String(currentSlot.plannedEnd || "") === String(slot.plannedEnd || "");
      if (alreadyApplied) return { ...metaFromSnapshot(before), applied: true, conflict: false, item: orderProjection(route, model.routeSteps, model.slots) };
      if (currentRevision !== Number(expectedRevision) || !currentSlot) {
        return { ...metaFromSnapshot(before), applied: false, conflict: true, item: orderProjection(route, model.routeSteps, model.slots) };
      }
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          nextPlanning.routes = asArray(nextPlanning.routes).map((item) => (
            String(item.id) === id || String(item.workOrderSnapshot?.id) === id
              ? { ...item, domainConcurrencyRevision: Number(targetRevision), updatedAt: new Date().toISOString() }
              : item
          ));
          nextPlanning.slots = asArray(nextPlanning.slots).map((item) => (
            String(item.id || "") === String(slot.id)
              ? { ...item, plannedStart: String(slot.plannedStart || item.plannedStart || ""), plannedEnd: String(slot.plannedEnd || item.plannedEnd || ""), updatedAt: new Date().toISOString() }
              : item
          ));
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify(nextPlanning) } };
        },
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const nextRoute = findRoute(nextModel, id);
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
      const updated = await updateSharedStateSnapshot({
        env,
        filePath,
        expectedVersion: before.snapshot.version,
        update: (current) => {
          const nextPlanning = parsePlanningState(current.values?.[PLANNING_STATE_KEY]);
          if (asArray(nextPlanning.routes).some((route) => String(route.id || "") === String(id))) return current;
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
          return { ...current, values: { ...current.values, [PLANNING_STATE_KEY]: JSON.stringify({ ...nextPlanning, routes: [...asArray(nextPlanning.routes), route], routeSteps: [...asArray(nextPlanning.routeSteps), ...steps] }) } };
        },
      });
      if (!updated.ok || updated.conflict) return { ...metaFromSnapshot({ configured: updated.configured, kind: "snapshot", snapshot: updated.snapshot }), applied: false, conflict: Boolean(updated.conflict), item: null };
      const nextModel = readModel(updated.snapshot);
      const route = findRoute(nextModel, id);
      return { ...metaFromSnapshot({ configured: true, kind: "snapshot", snapshot: updated.snapshot }), applied: Boolean(route), conflict: false, item: route ? orderProjection(route, nextModel.routeSteps, nextModel.slots) : null };
    },
  };
}
