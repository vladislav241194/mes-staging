import postgres from "postgres";
import { calculateOperationDurationMs } from "../src/domain/operation_duration.js";
import { addCalendarWorkingDuration, createWorkingCalendar } from "../src/domain/working_calendar.js";
import { hasCurrentPlanningSnapshotObservationMarker } from "./planning-snapshot-observation-contract.mjs";
import { buildPlanningGanttWindow, readPlanningGanttWindowBounds } from "./planning-gantt-window-projection.mjs";
import { isExactIsoCalendarDate, isExactIsoInstantWithOffset, toExactIsoCalendarDate } from "../src/domain/calendar_date.js";
import { acquireProductionResourceDependencySharedLock } from "./production-resource-dependency-lock.mjs";

const CLIENTS_BY_URL = new Map();
const PLANNING_LIST_METADATA_FIELDS = [
  "id", "name", "revision", "createdAt", "updatedAt", "canceledAt", "isDefault",
  "projectId", "rootRouteId", "routeTaskId", "parentRouteId", "routeTaskName",
  "routeTaskSourceItemId", "planningStatus", "lifecycleStatus", "specificationId",
  "planningQuantity", "routeDocumentKind", "specificationName",
  "planningStartDate",
  "sourceSpecifications2EntryId", "sourceSpecifications2RouteDraftId",
];

function getClient(databaseUrl) {
  const existing = CLIENTS_BY_URL.get(databaseUrl);
  if (existing) return existing;
  const client = postgres(databaseUrl, { max: 4, idle_timeout: 10, prepare: false });
  CLIENTS_BY_URL.set(databaseUrl, client);
  return client;
}

export async function closePostgresDomainClients() {
  await Promise.all([...CLIENTS_BY_URL.values()].map((client) => client.end({ timeout: 5 })));
  CLIENTS_BY_URL.clear();
}

function mapOrder(row) {
  return {
    id: String(row.id),
    number: String(row.number),
    name: String(row.name),
    designation: String(row.designation || ""),
    quantity: Number(row.quantity),
    unit: String(row.unit),
    lifecycleStatus: String(row.lifecycle_status),
    planningStatus: String(row.planning_status),
    // The DATE column is the sole canonical owner after migration 032. In
    // particular, an explicit clear must not be resurrected by stale legacy
    // metadata while the compatibility snapshot is converging.
    planningStartDate: row.planning_start_date == null ? null : toIsoDateOnly(row.planning_start_date),
    revision: Number(row.source_revision),
    concurrencyRevision: Number(row.aggregate_revision),
    source: String(row.source_kind),
    metadata: row.metadata || {},
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ""),
    operationCount: Number(row.operation_count || 0),
    scheduledOperationCount: Number(row.scheduled_operation_count || 0),
  };
}

function toIsoDateOnly(value) {
  return toExactIsoCalendarDate(value);
}

function isExactIsoDateOnly(value) {
  return isExactIsoCalendarDate(value);
}

function mapOrderList(row) {
  const item = mapOrder(row);
  const fullMetadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  item.metadata = Object.fromEntries(
    PLANNING_LIST_METADATA_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(fullMetadata, field))
      .map((field) => [field, fullMetadata[field]]),
  );
  return item;
}

function mapOrderDetail(row) {
  const item = mapOrder(row);
  const source = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
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

function normalizeExecutionContext(value = {}) {
  const context = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  // The snapshot adapter has always exposed a complete calculation context.
  // PostgreSQL can legitimately store only the values supplied by a source
  // command, so normalise its read model at the boundary before comparing or
  // handing it to the existing planning runtime.
  return {
    calculationType: String(context.calculationType || ""),
    unitsPerHour: Number(context.unitsPerHour || 0),
    setupMin: Math.max(0, Number(context.setupMin || 0)),
    boardsPerPanel: Math.max(1, Math.round(Number(context.boardsPerPanel || 1) || 1)),
    secondsPerPanel: Math.max(0, Number(context.secondsPerPanel || 0)),
    resourceId: String(context.resourceId || ""),
    bomListId: String(context.bomListId || ""),
    isWarehouseOperation: Boolean(context.isWarehouseOperation),
  };
}

function normalizeResourceDependencyIds(value = []) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

function mapOperation(row, slot = null) {
  return {
    id: String(row.id),
    operationId: String(row.operation_id),
    name: String(row.name),
    workCenterId: String(row.work_center_id),
    nextWorkCenterId: String(row.next_work_center_id || ""),
    quantityMultiplier: Number(row.quantity_multiplier || 1),
    executionContext: normalizeExecutionContext(row.execution_context),
    labor: row.labor || {},
    metadata: row.metadata || {},
    slot: slot ? mapPlanningSlot(slot) : null,
  };
}

function mapPlanningSlot(slot) {
  return {
    id: String(slot.id),
    plannedStart: slot.planned_start instanceof Date ? slot.planned_start.toISOString() : String(slot.planned_start || ""),
    plannedEnd: slot.planned_end instanceof Date ? slot.planned_end.toISOString() : String(slot.planned_end || ""),
    status: String(slot.status || "planned"),
    quantity: Number(slot.quantity),
    isLocked: Boolean(slot.is_locked),
    metadata: slot.metadata || {},
  };
}

function mapPeriodOperation(row) {
  return mapOperation({
    id: row.period_operation_id,
    operation_id: row.period_operation_code,
    name: row.period_operation_name,
    work_center_id: row.period_operation_work_center_id,
    next_work_center_id: row.period_operation_next_work_center_id,
    quantity_multiplier: row.period_operation_quantity_multiplier,
    execution_context: row.period_operation_execution_context,
    labor: row.period_operation_labor,
    metadata: row.period_operation_metadata,
  }, {
    id: row.period_slot_id,
    planned_start: row.period_slot_planned_start,
    planned_end: row.period_slot_planned_end,
    status: row.period_slot_status,
    quantity: row.period_slot_quantity,
    is_locked: row.period_slot_is_locked,
    metadata: row.period_slot_metadata,
  });
}

function mapPeriodOrder(row) {
  const item = mapOrderDetail(row);
  // The period endpoint must retain the same route-compatible fields as a
  // detail projection, while omitting a potentially large labour map that
  // weekly control never reads. This mirrors buildPlanningPeriodProjection's
  // historical filtering when it receives an aggregate detail.
  const { planningLaborByStepId: _planningLaborByStepId, ...metadata } = item.metadata || {};
  return { ...item, metadata, operations: [] };
}

function isoDateTime(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

// The weekly control is a slot-level consumer.  Do not materialize an order
// aggregate, operation metadata, labour maps or a route-step graph merely to
// draw the seven visible days.  This shape is deliberately small enough to
// serve as both the PostgreSQL read model and the API transport contract.
function mapWeeklyPeriodRow(row = {}) {
  return {
    id: String(row.weekly_slot_id || ""),
    routeId: String(row.weekly_route_id || ""),
    routeStepId: String(row.weekly_route_step_id || ""),
    plannedStart: isoDateTime(row.weekly_planned_start),
    plannedEnd: isoDateTime(row.weekly_planned_end),
    quantity: Number(row.weekly_quantity || 0),
    unit: String(row.weekly_unit || "шт."),
    workCenterId: String(row.weekly_work_center_id || ""),
    resourceId: String(row.weekly_resource_id || ""),
    status: String(row.weekly_status || "planned"),
    locked: Boolean(row.weekly_locked),
    // Preserve only the scalar source fields needed to resolve the same SMT
    // line/resource and task unit that the established client resolver shows.
    // Full JSON metadata stays in PostgreSQL and never crosses this transport.
    sourceWorkCenterId: String(row.weekly_source_work_center_id || ""),
    sourceResourceId: String(row.weekly_source_resource_id || ""),
    sourceUnit: String(row.weekly_source_unit || ""),
    sourceComment: String(row.weekly_source_comment || ""),
    sourceOperationName: String(row.weekly_source_operation_name || ""),
    sourceSpecificationId: String(row.weekly_source_specification_id || ""),
    sourceProjectId: String(row.weekly_source_project_id || ""),
    sourcePlanningOrderId: String(row.weekly_source_planning_order_id || ""),
    sourceBatchId: String(row.weekly_source_batch_id || ""),
    sourceRouteId: String(row.weekly_source_route_id || ""),
  };
}

function mapGanttWindowEntry(row = {}) {
  return {
    route: {
      id: String(row.gantt_route_id || ""),
      number: String(row.gantt_route_number || row.gantt_route_id || ""),
      name: String(row.gantt_route_name || "Заказ-наряд"),
      designation: String(row.gantt_route_designation || ""),
      planningQuantity: Number(row.gantt_route_quantity || 0),
      unit: String(row.gantt_route_unit || "шт."),
      lifecycleStatus: String(row.gantt_route_lifecycle_status || "draft"),
      planningStatus: String(row.gantt_route_planning_status || "draft"),
      domainConcurrencyRevision: Number(row.gantt_route_aggregate_revision || 0),
    },
    routeStep: {
      id: String(row.gantt_route_step_id || ""),
      routeId: String(row.gantt_route_id || ""),
      operationId: String(row.gantt_operation_id || ""),
      operationName: String(row.gantt_operation_name || "Операция"),
      workCenterId: String(row.gantt_operation_work_center_id || ""),
      nextWorkCenterId: String(row.gantt_operation_next_work_center_id || ""),
      sequenceNo: Number(row.gantt_operation_sequence_no || 0),
      quantityMultiplier: Number(row.gantt_operation_quantity_multiplier || 1),
    },
    slot: {
      id: String(row.gantt_slot_id || ""),
      plannedStart: isoDateTime(row.gantt_slot_planned_start),
      plannedEnd: isoDateTime(row.gantt_slot_planned_end),
      status: String(row.gantt_slot_status || "planned"),
      quantity: Number(row.gantt_slot_quantity || 0),
      locked: Boolean(row.gantt_slot_is_locked),
      workCenterId: String(row.gantt_slot_work_center_id || row.gantt_operation_work_center_id || ""),
      resourceId: String(row.gantt_slot_resource_id || ""),
    },
  };
}

function groupPlanningPeriodRows(rows = []) {
  const byOrderId = new Map();
  for (const row of rows) {
    const orderId = String(row.id || "");
    if (!orderId) continue;
    let item = byOrderId.get(orderId);
    if (!item) {
      item = mapPeriodOrder(row);
      byOrderId.set(orderId, item);
    }
    item.operations.push(mapPeriodOperation(row));
  }
  return [...byOrderId.values()];
}

function readPeriodBounds({ fromAt, toAt } = {}) {
  const from = new Date(String(fromAt || ""));
  const to = new Date(String(toAt || ""));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new Error("Planning period bounds must be valid ordered ISO instants");
  }
  return { from, to };
}

function getTimingNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getElapsedTimingMs(startedAt, endedAt = getTimingNow()) {
  const elapsed = Number(endedAt) - Number(startedAt);
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
}

function mapPlanningProjectionParityStateRow(row = null, { observationAvailable = true } = {}) {
  return row ? {
    primaryRevision: Number(row.primary_revision || 0),
    primaryUpdatedAt: row.primary_updated_at?.toISOString?.() || String(row.primary_updated_at || ""),
    verifiedPrimaryRevision: row.verified_primary_revision === null || row.verified_primary_revision === undefined
      ? null : Number(row.verified_primary_revision),
    verifiedSnapshotFingerprint: String(row.verified_snapshot_fingerprint || ""),
    verifiedSnapshotGeneration: row.verified_snapshot_generation === null || row.verified_snapshot_generation === undefined
      ? null : Number(row.verified_snapshot_generation),
    verifiedContractVersion: Number(row.verified_contract_version || 0),
    verifiedAt: row.verified_at?.toISOString?.() || String(row.verified_at || ""),
    observationAvailable,
    snapshotGeneration: Number(row.snapshot_generation || 0),
    snapshotObservationState: String(row.snapshot_observation_state || "unknown"),
    observedSnapshotVersion: row.observed_snapshot_version === null || row.observed_snapshot_version === undefined
      ? null : Number(row.observed_snapshot_version),
    observedSnapshotFingerprint: String(row.observed_snapshot_fingerprint || ""),
    observedSnapshotSource: String(row.observed_snapshot_source || ""),
    observedSnapshotAt: row.observed_snapshot_at?.toISOString?.() || String(row.observed_snapshot_at || ""),
    observedSnapshotError: String(row.observed_snapshot_error || ""),
  } : null;
}

function listMetadata(rows = []) {
  const revision = rows.reduce((max, row) => Math.max(max, Number(row.aggregate_revision) || 0), 0);
  const updatedAt = rows.reduce((latest, row) => {
    const value = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || "");
    return value > latest ? value : latest;
  }, "");
  return { revision, updatedAt };
}

// The transitional planning runtime still has one visible slot per route
// step.  The physical schema permits split slots, but expanding that runtime
// contract would be a separate migration: today keep the earliest planned
// slot deterministically everywhere that returns a full aggregate.
function firstRuntimeSlotByOperation(rows = []) {
  const byOperation = new Map();
  for (const row of rows) {
    const operationId = String(row.work_order_operation_id || "");
    if (operationId && !byOperation.has(operationId)) byOperation.set(operationId, row);
  }
  return byOperation;
}

function groupOperationsByWorkOrder(rows = []) {
  const byOrder = new Map();
  for (const row of rows) {
    const orderId = String(row.work_order_id || "");
    if (!orderId) continue;
    const operations = byOrder.get(orderId) || [];
    operations.push(row);
    byOrder.set(orderId, operations);
  }
  return byOrder;
}

function runtimeProjectionItems({ orders = [], operations = [], slots = [] } = {}) {
  const operationsByOrder = groupOperationsByWorkOrder(operations);
  const slotsByOperation = firstRuntimeSlotByOperation(slots);
  const slotCountByOrder = new Map();
  const orderByOperation = new Map(operations.map((operation) => [String(operation.id || ""), String(operation.work_order_id || "")]));
  for (const slot of slots) {
    const orderId = orderByOperation.get(String(slot.work_order_operation_id || ""));
    if (orderId) slotCountByOrder.set(orderId, Number(slotCountByOrder.get(orderId) || 0) + 1);
  }
  return orders.map((order) => {
    const orderId = String(order.id || "");
    const orderOperations = operationsByOrder.get(orderId) || [];
    return {
      ...mapOrderDetail({
        ...order,
        operation_count: orderOperations.length,
        // Preserve the current list/get contract: this is a count of stored
        // planning-slot rows, not a count of unique operations.
        scheduled_operation_count: Number(slotCountByOrder.get(orderId) || 0),
      }),
      operations: orderOperations.map((operation) => mapOperation(
        operation,
        slotsByOperation.get(String(operation.id || "")) || null,
      )),
    };
  });
}

function calendarByWorkCenter(rows = []) {
  return new Map(rows.map((row) => [String(row.work_center_id), createWorkingCalendar({
    workSchedule: row.work_schedule,
    workMode: row.work_mode,
  })]));
}

function resourcesByWorkCenter(rows = []) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = String(row.work_center_id || "");
    const items = grouped.get(key) || [];
    items.push(row);
    grouped.set(key, items);
  });
  return grouped;
}

export function createPostgresWorkOrdersRepository({ databaseUrl, sql: sqlOverride, resourceDependencyLock = null } = {}) {
  if (!databaseUrl && !sqlOverride) throw new Error("DATABASE_URL is required for PostgreSQL domain storage");
  const sql = sqlOverride || getClient(databaseUrl);
  const acquireResourceDependencyLock = resourceDependencyLock
    || (sqlOverride ? async () => {} : acquireProductionResourceDependencySharedLock);
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  async function listRows(query = sql) {
    return query`
      SELECT wo.*,
        (SELECT count(*) FROM work_order_operations op WHERE op.work_order_id = wo.id) AS operation_count,
        (SELECT count(*) FROM planning_slots ps JOIN work_order_operations op ON op.id = ps.work_order_operation_id WHERE op.work_order_id = wo.id) AS scheduled_operation_count
      FROM work_orders wo
      ORDER BY wo.updated_at DESC, wo.number ASC
    `;
  }

  // The Planning workbench renders this list before the selected order detail.
  // Do not carry large route/document JSONB snapshots through that first query:
  // the list mapper has always exposed only these metadata keys.  Counts are
  // aggregated once per table instead of running two correlated subqueries for
  // every work order.
  async function listWorkbenchRows(query = sql) {
    return query`
      SELECT
        wo.id,
        wo.number,
        wo.name,
        wo.designation,
        wo.quantity,
        wo.unit,
        wo.lifecycle_status,
        wo.planning_status,
        wo.planning_start_date,
        wo.source_revision,
        wo.aggregate_revision,
        wo.source_kind,
        wo.updated_at,
        COALESCE((
          SELECT jsonb_object_agg(list_metadata_field.name, wo.metadata -> list_metadata_field.name)
          FROM unnest(ARRAY[
            'id', 'name', 'revision', 'createdAt', 'updatedAt', 'canceledAt', 'isDefault',
            'projectId', 'rootRouteId', 'routeTaskId', 'parentRouteId', 'routeTaskName',
            'routeTaskSourceItemId', 'planningStatus', 'lifecycleStatus', 'specificationId',
            'planningQuantity', 'routeDocumentKind', 'specificationName', 'planningStartDate',
            'sourceSpecifications2EntryId', 'sourceSpecifications2RouteDraftId'
          ]::text[]) AS list_metadata_field(name)
          WHERE jsonb_typeof(COALESCE(wo.metadata, '{}'::jsonb)) = 'object'
            AND COALESCE(wo.metadata, '{}'::jsonb) ? list_metadata_field.name
        ), '{}'::jsonb) AS metadata,
        COALESCE(operation_counts.operation_count, 0)::int AS operation_count,
        COALESCE(slot_counts.scheduled_operation_count, 0)::int AS scheduled_operation_count
      FROM work_orders wo
      LEFT JOIN (
        SELECT op.work_order_id, count(*)::int AS operation_count
        FROM work_order_operations op
        GROUP BY op.work_order_id
      ) operation_counts ON operation_counts.work_order_id = wo.id
      LEFT JOIN (
        SELECT op.work_order_id, count(*)::int AS scheduled_operation_count
        FROM planning_slots ps
        JOIN work_order_operations op ON op.id = ps.work_order_operation_id
        GROUP BY op.work_order_id
      ) slot_counts ON slot_counts.work_order_id = wo.id
      ORDER BY wo.updated_at DESC, wo.number ASC
    `;
  }

  async function getWorkbenchDetailRow(query = sql, id) {
    const rows = await query`
      SELECT wo.*
      FROM work_orders wo
      WHERE wo.id = ${id}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  async function readWorkbenchBootstrapRows(query = sql, activeId = "") {
    const requestedId = String(activeId || "").trim();
    const orderRows = await listWorkbenchRows(query);
    // Keep every Planning read path on the same canonical aggregate as the
    // command owner: an exact aggregate id always wins over a colliding
    // human-facing work-order number.
    const selectedOrder = orderRows.find((row) => String(row.id) === requestedId)
      || orderRows.find((row) => String(row.number) === requestedId)
      || orderRows[0]
      || null;
    if (!selectedOrder) return { orders: orderRows, selected: null, operations: [], slots: [] };
    const [selectedDetail, operationRows, slotRows] = await Promise.all([
      getWorkbenchDetailRow(query, selectedOrder.id),
      query`SELECT * FROM work_order_operations WHERE work_order_id = ${selectedOrder.id} ORDER BY sequence_no`,
      query`
        SELECT ps.* FROM planning_slots ps
        JOIN work_order_operations op ON op.id = ps.work_order_operation_id
        WHERE op.work_order_id = ${selectedOrder.id}
        ORDER BY ps.planned_start ASC NULLS LAST, ps.id ASC
      `,
    ]);
    // The compact row already has the aggregate counts, so the selected
    // full-metadata query stays a single narrow aggregate read.
    const selectedRow = selectedDetail ? {
      ...selectedDetail,
      operation_count: selectedOrder.operation_count,
      scheduled_operation_count: selectedOrder.scheduled_operation_count,
    } : null;
    return { orders: orderRows, selected: selectedRow, operations: operationRows, slots: slotRows };
  }

  function buildWorkbenchBootstrapResult({ orders = [], selected = null, operations = [], slots = [] } = {}) {
    const slotsByOperation = firstRuntimeSlotByOperation(slots);
    const item = selected ? {
      ...mapOrderDetail(selected),
      operations: operations.map((operation) => mapOperation(
        operation,
        slotsByOperation.get(String(operation.id || "")) || null,
      )),
    } : null;
    return {
      ...metadata,
      ...listMetadata(orders),
      items: orders.map(mapOrderList),
      activeId: item?.id || "",
      item,
    };
  }

  return {
    async health() {
      const [orders, migrations] = await Promise.all([
        sql`
          SELECT COALESCE(max(aggregate_revision), 0) AS revision,
            max(updated_at) AS updated_at
          FROM work_orders
        `,
        sql`SELECT max(applied_at) AS updated_at FROM mes_schema_migrations`,
      ]);
      const current = orders[0] || {};
      return {
        ...metadata,
        revision: Number(current.revision || 0),
        updatedAt: current.updated_at?.toISOString?.() || String(current.updated_at || migrations[0]?.updated_at?.toISOString?.() || ""),
      };
    },

    async findActiveResourceDependencies(resourceIds = []) {
      const normalizedIds = normalizeResourceDependencyIds(resourceIds);
      if (!normalizedIds.length) return { ...metadata, items: [] };
      const rows = await sql`
        WITH active_resource_dependencies AS (
          SELECT
            'work-order-operation'::text AS dependency_kind,
            op.id AS dependency_id,
            wo.id AS work_order_id,
            op.id AS operation_id,
            COALESCE(
              NULLIF(op.metadata ->> 'resourceId', ''),
              NULLIF(op.execution_context ->> 'resourceId', ''),
              ''
            ) AS resource_id,
            COALESCE(NULLIF(wo.lifecycle_status, ''), NULLIF(wo.planning_status, ''), 'active') AS dependency_status
          FROM work_order_operations AS op
          JOIN work_orders AS wo ON wo.id = op.work_order_id
          WHERE COALESCE(wo.lifecycle_status, '') NOT IN ('completed', 'done', 'closed', 'canceled', 'cancelled', 'archived')
            AND COALESCE(wo.planning_status, '') NOT IN ('completed', 'done', 'closed', 'canceled', 'cancelled', 'archived')
            AND COALESCE(NULLIF(op.metadata ->> 'resourceId', ''), NULLIF(op.execution_context ->> 'resourceId', ''), '') = ANY(${normalizedIds})
          UNION ALL
          SELECT
            'planning-slot'::text AS dependency_kind,
            ps.id AS dependency_id,
            wo.id AS work_order_id,
            op.id AS operation_id,
            COALESCE(NULLIF(ps.metadata ->> 'resourceId', ''), '') AS resource_id,
            COALESCE(NULLIF(ps.status, ''), 'planned') AS dependency_status
          FROM planning_slots AS ps
          JOIN work_order_operations AS op ON op.id = ps.work_order_operation_id
          JOIN work_orders AS wo ON wo.id = op.work_order_id
          WHERE COALESCE(wo.lifecycle_status, '') NOT IN ('completed', 'done', 'closed', 'canceled', 'cancelled', 'archived')
            AND COALESCE(wo.planning_status, '') NOT IN ('completed', 'done', 'closed', 'canceled', 'cancelled', 'archived')
            AND COALESCE(ps.status, '') NOT IN ('completed', 'done', 'closed', 'canceled', 'cancelled', 'archived')
            AND COALESCE(NULLIF(ps.metadata ->> 'resourceId', ''), '') = ANY(${normalizedIds})
        )
        SELECT dependency_kind, dependency_id, work_order_id, operation_id, resource_id, dependency_status
        FROM active_resource_dependencies
        ORDER BY dependency_kind, work_order_id, operation_id, dependency_id
        LIMIT 100
      `;
      return {
        ...metadata,
        items: rows.map((row) => ({
          kind: String(row.dependency_kind || "active-resource-reference"),
          id: String(row.dependency_id || ""),
          workOrderId: String(row.work_order_id || ""),
          operationId: String(row.operation_id || ""),
          equipmentId: String(row.resource_id || ""),
          status: String(row.dependency_status || ""),
        })),
      };
    },

    // A one-row, trigger-maintained parity watermark.  The API only trusts a
    // verified snapshot fingerprint when it matches this exact primary epoch;
    // any direct PostgreSQL edit to orders, operations or slots invalidates it
    // before the next read.
    async getPlanningProjectionParityState() {
      let rows;
      let observationAvailable = true;
      try {
        rows = await sql`
          SELECT primary_revision, primary_updated_at,
            verified_primary_revision, verified_snapshot_fingerprint,
            verified_snapshot_generation, verified_contract_version, verified_at,
            snapshot_generation, snapshot_observation_state,
            observed_snapshot_version, observed_snapshot_fingerprint,
            observed_snapshot_source, observed_snapshot_at, observed_snapshot_error
          FROM planning_projection_parity_state
          WHERE singleton = TRUE
          LIMIT 1
        `;
      } catch (error) {
        // A rolling release can start this application before the additive
        // observation migration has run.  Preserve the existing marker path
        // in that short window; the API will simply retain snapshot health
        // verification until the migration is present.
        if (String(error?.code || "") !== "42703") throw error;
        observationAvailable = false;
        rows = await sql`
          SELECT primary_revision, primary_updated_at,
            verified_primary_revision, verified_snapshot_fingerprint,
            verified_contract_version, verified_at
          FROM planning_projection_parity_state
          WHERE singleton = TRUE
          LIMIT 1
        `;
      }
      return mapPlanningProjectionParityStateRow(rows[0] || null, { observationAvailable });
    },

    async beginPlanningSnapshotObservation({ source = "planning-snapshot-write", rejectWhenPending = false } = {}) {
      const normalizedSource = String(source || "planning-snapshot-write").trim().slice(0, 160) || "planning-snapshot-write";
      // Managed writers take ownership of the next generation while holding
      // their snapshot-file lock, so they may supersede an earlier pending
      // attempt.  A *reader* proving parity must never do that: another
      // writer may already be between its durable invalidation and the file
      // write.  Let that reader fail closed to the compatibility snapshot.
      const rows = rejectWhenPending
        ? await sql`
          UPDATE planning_projection_parity_state
          SET snapshot_generation = snapshot_generation + 1,
              snapshot_observation_state = 'pending',
              observed_snapshot_version = NULL,
              observed_snapshot_fingerprint = '',
              observed_snapshot_source = ${normalizedSource},
              observed_snapshot_at = NULL,
              observed_snapshot_error = '',
              verified_primary_revision = NULL,
              verified_snapshot_fingerprint = '',
              verified_snapshot_generation = NULL,
              verified_contract_version = 0,
              verified_at = NULL
          WHERE singleton = TRUE
            AND snapshot_observation_state <> 'pending'
          RETURNING primary_revision, snapshot_generation
        `
        : await sql`
          UPDATE planning_projection_parity_state
          SET snapshot_generation = snapshot_generation + 1,
              snapshot_observation_state = 'pending',
              observed_snapshot_version = NULL,
              observed_snapshot_fingerprint = '',
              observed_snapshot_source = ${normalizedSource},
              observed_snapshot_at = NULL,
              observed_snapshot_error = '',
              verified_primary_revision = NULL,
              verified_snapshot_fingerprint = '',
              verified_contract_version = 0,
              verified_at = NULL
          WHERE singleton = TRUE
          RETURNING primary_revision, snapshot_generation
        `;
      const row = rows[0] || null;
      return row ? {
        primaryRevision: Number(row.primary_revision || 0),
        snapshotGeneration: Number(row.snapshot_generation || 0),
      } : null;
    },

    async recordPlanningSnapshotObservation({ snapshotGeneration, snapshotVersion, snapshotFingerprint, source = "planning-snapshot-write" } = {}) {
      const generation = Math.max(0, Number(snapshotGeneration) || 0);
      const version = Math.max(0, Number(snapshotVersion) || 0);
      const fingerprint = String(snapshotFingerprint || "").trim();
      const normalizedSource = String(source || "planning-snapshot-write").trim().slice(0, 160) || "planning-snapshot-write";
      if (!generation || !fingerprint) return false;
      const rows = await sql`
        UPDATE planning_projection_parity_state
        SET snapshot_observation_state = 'observed',
            observed_snapshot_version = ${version},
            observed_snapshot_fingerprint = ${fingerprint},
            observed_snapshot_source = ${normalizedSource},
            observed_snapshot_at = now(),
            observed_snapshot_error = ''
        WHERE singleton = TRUE
          AND snapshot_generation = ${generation}
          AND snapshot_observation_state = 'pending'
        RETURNING snapshot_generation
      `;
      return Boolean(rows[0]);
    },

    async markPlanningProjectionParity({ primaryRevision, snapshotFingerprint, snapshotGeneration = null, contractVersion } = {}) {
      const revision = Math.max(0, Number(primaryRevision) || 0);
      const fingerprint = String(snapshotFingerprint || "").trim();
      const generation = snapshotGeneration === null || snapshotGeneration === undefined
        ? null : Math.max(0, Number(snapshotGeneration) || 0);
      const parityContractVersion = Math.max(1, Number(contractVersion) || 0);
      if (!fingerprint) return false;
      if (generation !== null) {
        const rows = await sql`
          UPDATE planning_projection_parity_state
          SET verified_primary_revision = ${revision},
              verified_snapshot_fingerprint = ${fingerprint},
              verified_snapshot_generation = ${generation},
              verified_contract_version = ${parityContractVersion},
              verified_at = now()
          WHERE singleton = TRUE
            AND primary_revision = ${revision}
            AND snapshot_generation = ${generation}
            AND snapshot_observation_state = 'observed'
            AND observed_snapshot_fingerprint = ${fingerprint}
          RETURNING primary_revision
        `;
        return Boolean(rows[0]);
      }
      const rows = await sql`
        UPDATE planning_projection_parity_state
        SET verified_primary_revision = ${revision},
            verified_snapshot_fingerprint = ${fingerprint},
            verified_contract_version = ${parityContractVersion},
            verified_at = now()
        WHERE singleton = TRUE
          AND primary_revision = ${revision}
        RETURNING primary_revision
      `;
      return Boolean(rows[0]);
    },

    async list() {
      const rows = await listRows();
      // The sidebar needs order identity and compact labels only. Large
      // document revision snapshots and per-step labour maps belong to the
      // selected order detail; returning them for every order delayed the
      // first Planning render by hundreds of kilobytes.
      return { ...metadata, ...listMetadata(rows), items: rows.map(mapOrderList) };
    },

    // Read the Planning sidebar and selected aggregate in one repeatable
    // snapshot.  This is the compact bootstrap path: it removes a public
    // list->detail round trip while also preventing the first rendered tree
    // from combining two different aggregate revisions.
    async listWorkbenchBootstrap(activeId = "") {
      const raw = await sql.begin(
        "isolation level repeatable read read only",
        (tx) => readWorkbenchBootstrapRows(tx, activeId),
      );
      return buildWorkbenchBootstrapResult(raw);
    },

    // The generic Planning safety route needs a durable marker before and
    // after a PostgreSQL read because snapshot writes can race either side of
    // it.  The initial workbench has a tighter option: lock every source
    // table that the marker trigger covers, then lock that marker row and
    // read the compact aggregate inside the same transaction.  The ordering
    // matters: taking the source-table locks first prevents a TRUNCATE from
    // holding an exclusive table lock while waiting for the marker row.
    //
    // An unavailable, pending or mismatched marker never exposes these raw
    // primary bytes.  The API deliberately falls through to the established
    // snapshot-compatible guard in that case.
    async readObservedWorkbenchBootstrap(activeId = "", { contractVersion = 0 } = {}) {
      const startedAt = getTimingNow();
      try {
        const atomicRead = await sql.begin(async (tx) => {
          // A bootstrap is a latency optimization, never a reason to queue
          // behind a command/import.  `NOWAIT` releases any partial table
          // locks through the transaction rollback and lets the API use its
          // established generic snapshot-compatible guard immediately.
          await tx`LOCK TABLE work_orders, work_order_operations, planning_slots IN SHARE MODE NOWAIT`;
          const markerRows = await tx`
            SELECT primary_revision, primary_updated_at,
              verified_primary_revision, verified_snapshot_fingerprint,
              verified_snapshot_generation, verified_contract_version, verified_at,
              snapshot_generation, snapshot_observation_state,
              observed_snapshot_version, observed_snapshot_fingerprint,
              observed_snapshot_source, observed_snapshot_at, observed_snapshot_error
            FROM planning_projection_parity_state
            WHERE singleton = TRUE
            FOR SHARE NOWAIT
          `;
          const markerState = mapPlanningProjectionParityStateRow(markerRows[0] || null);
          const parityGuardMs = getElapsedTimingMs(startedAt);
          if (!hasCurrentPlanningSnapshotObservationMarker(markerState, { contractVersion })) {
            return {
              admitted: false,
              markerState,
              reason: "observed-marker-not-current",
              timing: { parityGuardMs, bootstrapReadMs: 0 },
            };
          }
          const bootstrapStartedAt = getTimingNow();
          const raw = await readWorkbenchBootstrapRows(tx, activeId);
          return {
            admitted: true,
            markerState,
            raw,
            timing: {
              parityGuardMs,
              bootstrapReadMs: getElapsedTimingMs(bootstrapStartedAt),
            },
          };
        });
        if (!atomicRead?.admitted) return atomicRead || { admitted: false, reason: "atomic-read-unavailable" };
        return {
          ...atomicRead,
          result: buildWorkbenchBootstrapResult(atomicRead.raw),
        };
      } catch (error) {
        // This path is only a latency optimization.  Any database contention,
        // old additive schema or transaction failure must make the API use the
        // existing proven guard instead of exposing an unverified primary view.
        return {
          admitted: false,
          reason: ["42703", "42P01", "40001", "55P03"].includes(String(error?.code || ""))
            ? "atomic-read-unavailable"
            : "atomic-read-failed",
          timing: { parityGuardMs: getElapsedTimingMs(startedAt), bootstrapReadMs: 0 },
        };
      }
    },

    // A normal planning/Gantt refresh needs the complete route graph, but
    // issuing get() for every order turned that into 1 + 3N database queries.
    // Read a single repeatable snapshot instead: the three fixed queries keep
    // full JSONB metadata at the existing mapper boundary without mixing data
    // from two concurrent planning revisions.
    async listRuntimeProjection() {
      const { orders, operations, slots } = await sql.begin(
        "isolation level repeatable read read only",
        async (tx) => {
          const [orderRows, operationRows, slotRows] = await Promise.all([
            tx`
              SELECT wo.*
              FROM work_orders AS wo
              ORDER BY wo.updated_at DESC, wo.number ASC
            `,
            tx`
              SELECT op.*
              FROM work_order_operations AS op
              JOIN work_orders AS wo ON wo.id = op.work_order_id
              ORDER BY wo.updated_at DESC, wo.number ASC, op.sequence_no ASC
            `,
            tx`
              SELECT ps.*
              FROM planning_slots AS ps
              JOIN work_order_operations AS op ON op.id = ps.work_order_operation_id
              JOIN work_orders AS wo ON wo.id = op.work_order_id
              ORDER BY wo.updated_at DESC, wo.number ASC, op.sequence_no ASC,
                ps.planned_start ASC NULLS LAST, ps.id ASC
            `,
          ]);
          return { orders: orderRows, operations: operationRows, slots: slotRows };
        },
      );
      return {
        ...metadata,
        ...listMetadata(orders),
        items: runtimeProjectionItems({ orders, operations, slots }),
      };
    },

    async summary() {
      const [totals, planningStatuses, lifecycleStatuses] = await Promise.all([
        sql`
          SELECT
            count(*)::int AS work_order_count,
            COALESCE(sum(quantity), 0) AS total_quantity,
            (SELECT count(*)::int FROM work_order_operations) AS operation_count,
            (SELECT count(*)::int FROM planning_slots) AS scheduled_operation_count,
            COALESCE(max(aggregate_revision), 0) AS revision,
            max(updated_at) AS updated_at
          FROM work_orders
        `,
        sql`SELECT planning_status, count(*)::int AS count FROM work_orders GROUP BY planning_status`,
        sql`SELECT lifecycle_status, count(*)::int AS count FROM work_orders GROUP BY lifecycle_status`,
      ]);
      const total = totals[0] || {};
      const operationCount = Number(total.operation_count || 0);
      const scheduledOperationCount = Number(total.scheduled_operation_count || 0);
      return {
        ...metadata,
        revision: Number(total.revision || 0),
        updatedAt: total.updated_at?.toISOString?.() || "",
        summary: {
          workOrderCount: Number(total.work_order_count || 0),
          totalQuantity: Number(total.total_quantity || 0),
          operationCount,
          scheduledOperationCount,
          unscheduledOperationCount: Math.max(0, operationCount - scheduledOperationCount),
          byPlanningStatus: Object.fromEntries(planningStatuses.map((row) => [String(row.planning_status || "draft"), Number(row.count || 0)])),
          byLifecycleStatus: Object.fromEntries(lifecycleStatuses.map((row) => [String(row.lifecycle_status || "draft"), Number(row.count || 0)])),
        },
      };
    },

    async get(id) {
      const orders = await sql`
        SELECT wo.*,
          (SELECT count(*) FROM work_order_operations op WHERE op.work_order_id = wo.id) AS operation_count,
          (SELECT count(*) FROM planning_slots ps JOIN work_order_operations op ON op.id = ps.work_order_operation_id WHERE op.work_order_id = wo.id) AS scheduled_operation_count
        FROM work_orders wo
        WHERE wo.id = ${id} OR wo.number = ${id}
        ORDER BY CASE WHEN wo.id = ${id} THEN 0 ELSE 1 END, wo.id
        LIMIT 1
      `;
      const order = orders[0];
      if (!order) return { ...metadata, revision: 0, updatedAt: "", item: null };
      const operations = await sql`SELECT * FROM work_order_operations WHERE work_order_id = ${order.id} ORDER BY sequence_no`;
      const slots = await sql`
        SELECT ps.*, op.operation_id AS operation_code FROM planning_slots ps
        JOIN work_order_operations op ON op.id = ps.work_order_operation_id
        WHERE op.work_order_id = ${order.id}
        ORDER BY ps.planned_start ASC NULLS LAST, ps.id ASC
      `;
      const slotsByOperation = firstRuntimeSlotByOperation(slots);
      return {
        ...metadata,
        revision: Number(order.aggregate_revision),
        updatedAt: order.updated_at?.toISOString?.() || "",
        item: {
          ...mapOrderDetail(order),
          operations: operations.map((operation) => mapOperation(operation, slotsByOperation.get(String(operation.id)) || null)),
          physicalSlots: slots.map((slot) => ({
            ...mapPlanningSlot(slot),
            routeId: String(order.id),
            routeStepId: String(slot.work_order_operation_id || ""),
            operationId: String(slot.operation_code || ""),
          })),
        },
      };
    },

    async listPeriod(period = {}) {
      const { from, to } = readPeriodBounds(period);
      // Each matching planning slot remains an independent record. This is
      // important for a future split-operation model: collapsing several
      // slots for one route step would silently hide scheduled work. The
      // range condition is half-open, matching the existing JavaScript
      // projection: start < to && end > from.
      const rows = await sql`
        SELECT
          wo.*,
          op.id AS period_operation_id,
          op.operation_id AS period_operation_code,
          op.name AS period_operation_name,
          op.work_center_id AS period_operation_work_center_id,
          op.next_work_center_id AS period_operation_next_work_center_id,
          op.sequence_no AS period_operation_sequence_no,
          op.quantity_multiplier AS period_operation_quantity_multiplier,
          op.execution_context AS period_operation_execution_context,
          op.labor AS period_operation_labor,
          op.metadata AS period_operation_metadata,
          ps.id AS period_slot_id,
          ps.planned_start AS period_slot_planned_start,
          ps.planned_end AS period_slot_planned_end,
          ps.status AS period_slot_status,
          ps.quantity AS period_slot_quantity,
          ps.is_locked AS period_slot_is_locked,
          ps.metadata AS period_slot_metadata
        FROM planning_slots AS ps
        JOIN work_order_operations AS op ON op.id = ps.work_order_operation_id
        JOIN work_orders AS wo ON wo.id = op.work_order_id
        WHERE ps.planned_start IS NOT NULL
          AND ps.planned_end IS NOT NULL
          AND tstzrange(ps.planned_start, ps.planned_end, '[)')
            && tstzrange(${from}, ${to}, '[)')
        ORDER BY period_slot_planned_start ASC, number ASC, id ASC,
          period_operation_sequence_no ASC, period_operation_id ASC, period_slot_id ASC
      `;
      return { ...metadata, ...listMetadata(rows), items: groupPlanningPeriodRows(rows) };
    },

    async listWeeklyPeriodRows(period = {}) {
      const { from, to } = readPeriodBounds(period);
      // Keep this query deliberately narrower than listPeriod(). Weekly
      // Control never reads or transfers the full order aggregate, operation
      // metadata, norms or slot metadata. A few JSONB scalar reads retain the
      // source values required by the existing SMT/task presentation resolver;
      // fetching the documents themselves would turn this into a heavyweight
      // planning projection again.
      const rows = await sql`
        SELECT
          ps.id AS weekly_slot_id,
          op.work_order_id AS weekly_route_id,
          op.id AS weekly_route_step_id,
          ps.planned_start AS weekly_planned_start,
          ps.planned_end AS weekly_planned_end,
          ps.quantity AS weekly_quantity,
          COALESCE(NULLIF(ps.metadata ->> 'unit', ''), NULLIF(wo.unit, ''), 'шт.') AS weekly_unit,
          COALESCE(
            NULLIF(ps.metadata ->> 'planningWorkCenterId', ''),
            NULLIF(ps.metadata ->> 'workCenterId', ''),
            NULLIF(op.metadata ->> 'planningWorkCenterId', ''),
            NULLIF(op.metadata ->> 'planningLineWorkCenterId', ''),
            NULLIF(op.work_center_id, ''),
            ''
          ) AS weekly_work_center_id,
          COALESCE(
            NULLIF(ps.metadata ->> 'resourceId', ''),
            NULLIF(op.metadata ->> 'resourceId', ''),
            NULLIF(op.execution_context ->> 'resourceId', ''),
            ''
          ) AS weekly_resource_id,
          ps.status AS weekly_status,
          ps.is_locked AS weekly_locked,
          COALESCE(ps.metadata ->> 'workCenterId', '') AS weekly_source_work_center_id,
          COALESCE(ps.metadata ->> 'resourceId', '') AS weekly_source_resource_id,
          COALESCE(ps.metadata ->> 'unit', '') AS weekly_source_unit,
          COALESCE(ps.metadata ->> 'comment', '') AS weekly_source_comment,
          COALESCE(ps.metadata ->> 'operationName', op.name, '') AS weekly_source_operation_name,
          COALESCE(ps.metadata ->> 'specificationId', '') AS weekly_source_specification_id,
          COALESCE(ps.metadata ->> 'projectId', '') AS weekly_source_project_id,
          COALESCE(ps.metadata ->> 'planningOrderId', '') AS weekly_source_planning_order_id,
          COALESCE(ps.metadata ->> 'batchId', '') AS weekly_source_batch_id,
          COALESCE(ps.metadata ->> 'routeId', '') AS weekly_source_route_id,
          wo.aggregate_revision,
          wo.updated_at
        FROM planning_slots AS ps
        JOIN work_order_operations AS op ON op.id = ps.work_order_operation_id
        JOIN work_orders AS wo ON wo.id = op.work_order_id
        WHERE ps.planned_start IS NOT NULL
          AND ps.planned_end IS NOT NULL
          AND tstzrange(ps.planned_start, ps.planned_end, '[)')
            && tstzrange(${from}, ${to}, '[)')
        ORDER BY ps.planned_start ASC, wo.number ASC, op.sequence_no ASC, op.id ASC, ps.id ASC
      `;
      return { ...metadata, ...listMetadata(rows), rows: rows.map(mapWeeklyPeriodRow) };
    },

    // A Gantt window intentionally reads physical slot rows, not the legacy
    // one-slot-per-operation runtime aggregate. The GiST range predicate
    // makes this proportional to the visible horizon and preserves split
    // work, while the compact scalar selection avoids transferring the full
    // order, operation and slot JSON documents.
    async listGanttWindow(period = {}) {
      const { fromAt, toAt } = readPlanningGanttWindowBounds(period);
      const from = new Date(fromAt);
      const to = new Date(toAt);
      const rows = await sql`
        SELECT
          wo.id AS gantt_route_id,
          wo.number AS gantt_route_number,
          wo.name AS gantt_route_name,
          wo.designation AS gantt_route_designation,
          wo.quantity AS gantt_route_quantity,
          wo.unit AS gantt_route_unit,
          wo.lifecycle_status AS gantt_route_lifecycle_status,
          wo.planning_status AS gantt_route_planning_status,
          wo.aggregate_revision AS gantt_route_aggregate_revision,
          wo.aggregate_revision,
          wo.updated_at,
          op.id AS gantt_route_step_id,
          op.operation_id AS gantt_operation_id,
          op.name AS gantt_operation_name,
          op.work_center_id AS gantt_operation_work_center_id,
          op.next_work_center_id AS gantt_operation_next_work_center_id,
          op.sequence_no AS gantt_operation_sequence_no,
          op.quantity_multiplier AS gantt_operation_quantity_multiplier,
          ps.id AS gantt_slot_id,
          ps.planned_start AS gantt_slot_planned_start,
          ps.planned_end AS gantt_slot_planned_end,
          ps.status AS gantt_slot_status,
          ps.quantity AS gantt_slot_quantity,
          ps.is_locked AS gantt_slot_is_locked,
          COALESCE(
            NULLIF(ps.metadata ->> 'planningWorkCenterId', ''),
            NULLIF(ps.metadata ->> 'workCenterId', ''),
            NULLIF(op.metadata ->> 'planningWorkCenterId', ''),
            NULLIF(op.metadata ->> 'planningLineWorkCenterId', ''),
            NULLIF(op.work_center_id, ''),
            ''
          ) AS gantt_slot_work_center_id,
          COALESCE(
            NULLIF(ps.metadata ->> 'resourceId', ''),
            NULLIF(op.metadata ->> 'resourceId', ''),
            NULLIF(op.execution_context ->> 'resourceId', ''),
            ''
          ) AS gantt_slot_resource_id
        FROM planning_slots AS ps
        JOIN work_order_operations AS op ON op.id = ps.work_order_operation_id
        JOIN work_orders AS wo ON wo.id = op.work_order_id
        WHERE ps.planned_start IS NOT NULL
          AND ps.planned_end IS NOT NULL
          AND tstzrange(ps.planned_start, ps.planned_end, '[)')
            && tstzrange(${from}, ${to}, '[)')
        ORDER BY ps.planned_start ASC, wo.number ASC, op.sequence_no ASC, op.id ASC, ps.id ASC
      `;
      return {
        ...metadata,
        ...listMetadata(rows),
        window: buildPlanningGanttWindow(rows.map(mapGanttWindowEntry), { fromAt, toAt }),
      };
    },

    async changeQuantity(id, { quantity, expectedRevision, actorId = "" }) {
      const result = await sql.begin(async (tx) => {
        await acquireResourceDependencyLock(tx);
        const updated = await tx`
          WITH current AS (
            SELECT id, aggregate_revision
            FROM work_orders
            WHERE id = ${id} OR number = ${id}
            ORDER BY CASE WHEN id = ${id} THEN 0 ELSE 1 END, id
            LIMIT 1
            FOR UPDATE
          )
          UPDATE work_orders AS work_order
          SET quantity = ${quantity}, aggregate_revision = work_order.aggregate_revision + 1, updated_at = now()
          FROM current
          WHERE work_order.id = current.id AND current.aggregate_revision = ${expectedRevision}
          RETURNING work_order.*
        `;
        if (updated[0]) {
          const row = updated[0];
          const slots = await tx`
            SELECT slot.*, operation.work_center_id, operation.quantity_multiplier, operation.execution_context
            FROM planning_slots AS slot
            JOIN work_order_operations AS operation ON operation.id = slot.work_order_operation_id
            WHERE operation.work_order_id = ${row.id}
              AND slot.is_locked = FALSE
              AND slot.status NOT IN ('completed', 'done')
          `;
          const workCenterIds = [...new Set(slots.map((slot) => String(slot.work_center_id || "")).filter(Boolean))];
          const [calendars, resources] = await Promise.all([
            workCenterIds.length ? tx`SELECT * FROM work_center_calendars WHERE work_center_id = ANY(${workCenterIds})` : [],
            workCenterIds.length ? tx`SELECT * FROM production_resources WHERE work_center_id = ANY(${workCenterIds}) AND is_active = TRUE` : [],
          ]);
          const calendarsByCenter = calendarByWorkCenter(calendars);
          const resourcesByCenter = resourcesByWorkCenter(resources);
          for (const slot of slots) {
            const workCenterId = String(slot.work_center_id || "");
            const nextQuantity = Number(slot.quantity_multiplier) * Number(quantity);
            const executionContext = { ...(slot.execution_context || {}), workCenterId };
            const durationMs = calculateOperationDurationMs(executionContext, nextQuantity, resourcesByCenter.get(workCenterId) || []);
            const calendar = calendarsByCenter.get(workCenterId);
            if (!calendar || !slot.planned_start) throw new Error(`Work-center calendar is missing for ${workCenterId || "operation"}`);
            const plannedEnd = addCalendarWorkingDuration(calendar, slot.planned_start, durationMs);
            await tx`
              UPDATE planning_slots
              SET quantity = ${nextQuantity}, planned_end = ${plannedEnd}
              WHERE id = ${slot.id}
            `;
          }
          await tx`
            INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
            VALUES ('work_order', ${row.id}, ${row.aggregate_revision}, 'change_quantity', ${tx.json({ quantity, expectedRevision, actorId: String(actorId || "") })}, ${String(actorId || "")}, 'pending')
          `;
          return { row, conflict: false };
        }
        const exists = await tx`
          SELECT aggregate_revision
          FROM work_orders
          WHERE id = ${id} OR number = ${id}
          ORDER BY CASE WHEN id = ${id} THEN 0 ELSE 1 END, id
          LIMIT 1
        `;
        return { row: null, conflict: Boolean(exists[0]), exists: Boolean(exists[0]) };
      });
      if (!result.row) return { ...metadata, revision: 0, updatedAt: "", conflict: result.conflict, item: null };
      const item = mapOrder({ ...result.row, operation_count: 0, scheduled_operation_count: 0 });
      return { ...metadata, revision: item.concurrencyRevision, updatedAt: item.updatedAt, conflict: false, item };
    },

    async startDateCommandReadiness() {
      const rows = await sql`
        SELECT
          (
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'planning_start_date'
          ) AS start_date_column_type,
          (
            SELECT data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'domain_change_log' AND column_name = 'idempotency_key'
          ) AS idempotency_column_type,
          COALESCE((
            SELECT index_row.indisunique
            FROM pg_catalog.pg_class AS index_class
            JOIN pg_catalog.pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
            JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_class.oid
            JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_row.indrelid
            JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
            WHERE index_namespace.nspname = 'public'
              AND index_class.relname = 'domain_change_log_actor_idempotency_uidx'
              AND table_namespace.nspname = 'public'
              AND table_class.relname = 'domain_change_log'
          ), FALSE) AS idempotency_index_unique,
          COALESCE((
            SELECT index_row.indisvalid AND index_row.indisready
            FROM pg_catalog.pg_class AS index_class
            JOIN pg_catalog.pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
            JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_class.oid
            JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_row.indrelid
            JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
            WHERE index_namespace.nspname = 'public'
              AND index_class.relname = 'domain_change_log_actor_idempotency_uidx'
              AND table_namespace.nspname = 'public'
              AND table_class.relname = 'domain_change_log'
          ), FALSE) AS idempotency_index_operational,
          COALESCE((
            SELECT ARRAY(
              SELECT attribute.attname
              FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, position)
              JOIN pg_catalog.pg_attribute AS attribute
                ON attribute.attrelid = index_row.indrelid AND attribute.attnum = key_column.attnum
              ORDER BY key_column.position
            ) = ARRAY['actor_id', 'idempotency_key']::name[]
              AND index_row.indnkeyatts = 2
            FROM pg_catalog.pg_class AS index_class
            JOIN pg_catalog.pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
            JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_class.oid
            JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_row.indrelid
            JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
            WHERE index_namespace.nspname = 'public'
              AND index_class.relname = 'domain_change_log_actor_idempotency_uidx'
              AND table_namespace.nspname = 'public'
              AND table_class.relname = 'domain_change_log'
          ), FALSE) AS idempotency_index_columns_exact,
          (
            SELECT pg_get_expr(index_row.indpred, index_row.indrelid)
            FROM pg_catalog.pg_class AS index_class
            JOIN pg_catalog.pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
            JOIN pg_catalog.pg_index AS index_row ON index_row.indexrelid = index_class.oid
            WHERE index_namespace.nspname = 'public'
              AND index_class.relname = 'domain_change_log_actor_idempotency_uidx'
          ) AS idempotency_index_predicate,
          (
            SELECT pg_get_indexdef(index_class.oid)
            FROM pg_catalog.pg_class AS index_class
            JOIN pg_catalog.pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
            WHERE index_namespace.nspname = 'public'
              AND index_class.relname = 'domain_change_log_actor_idempotency_uidx'
          ) AS idempotency_index_definition,
          EXISTS (
            SELECT 1 FROM mes_schema_migrations
            WHERE version = '032_planning_work_order_start_date'
          ) AS migration_applied
      `;
      const readiness = rows[0] || {};
      const normalizedPredicate = String(readiness.idempotency_index_predicate || "")
        .toLowerCase().replace(/[()\"]/g, "").replace(/\s+/g, " ").trim();
      const normalizedIndexDefinition = String(readiness.idempotency_index_definition || "")
        .toLowerCase().replace(/[\"]/g, "").replace(/\s+/g, " ").trim();
      const schemaReady = readiness.start_date_column_type === "date"
        && readiness.idempotency_column_type === "text"
        && readiness.idempotency_index_unique === true
        && readiness.idempotency_index_operational === true
        && readiness.idempotency_index_columns_exact === true
        && normalizedPredicate === "actor_id is not null and idempotency_key is not null"
        && normalizedIndexDefinition.includes("create unique index domain_change_log_actor_idempotency_uidx on public.domain_change_log using btree (actor_id, idempotency_key)")
        && readiness.migration_applied === true;
      return {
        schemaReady,
        error: schemaReady ? "" : "Planning start-date migration 032 is not ready",
      };
    },

    async changeStartDate(id, command = {}) {
      const {
        planningStartDate,
        expectedRevision,
        actorId = "",
        idempotencyKey = "",
      } = command;
      const hasPlanningStartDate = Object.prototype.hasOwnProperty.call(command, "planningStartDate");
      const normalizedDate = planningStartDate === null
        ? null
        : typeof planningStartDate === "string" ? planningStartDate.trim() : undefined;
      const normalizedActor = String(actorId || "").trim();
      const normalizedKey = String(idempotencyKey || "").trim();
      if (!hasPlanningStartDate || (normalizedDate !== null && !isExactIsoDateOnly(normalizedDate))) {
        throw new Error("planningStartDate must be an ISO calendar date or explicit null");
      }
      if (!normalizedActor || !normalizedKey || normalizedKey.length > 160) {
        throw new Error("Planning start-date actor and idempotency key are required");
      }
      const result = await sql.begin(async (tx) => {
        await acquireResourceDependencyLock(tx);
        // Same-actor retries serialize before inspecting the durable command
        // log. This closes the gap between the replay read and unique insert.
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${normalizedActor}:${normalizedKey}`}, 0))`;
        const currentRows = await tx`
          SELECT * FROM work_orders
          WHERE id = ${id} OR number = ${id}
          ORDER BY CASE WHEN id = ${id} THEN 0 ELSE 1 END, id
          LIMIT 1
          FOR UPDATE
        `;
        const current = currentRows[0] || null;
        if (!current) return { row: null, conflict: false, exists: false };
        const priorRows = await tx`
          SELECT aggregate_id, aggregate_revision, command_type, payload
          FROM domain_change_log
          WHERE actor_id = ${normalizedActor} AND idempotency_key = ${normalizedKey}
          LIMIT 1
        `;
        const prior = priorRows[0] || null;
        if (prior) {
          const priorOwnsStartDate = Object.prototype.hasOwnProperty.call(prior.payload || {}, "planningStartDate");
          const sameRequest = String(prior.aggregate_id) === String(current.id)
            && String(prior.command_type) === "change_start_date"
            && priorOwnsStartDate
            && prior.payload.planningStartDate === normalizedDate
            && Number(prior.payload?.expectedRevision) === Number(expectedRevision);
          const superseded = sameRequest
            && (current.planning_start_date == null ? null : toIsoDateOnly(current.planning_start_date)) !== normalizedDate;
          return {
            row: current,
            conflict: false,
            idempotentReplay: sameRequest,
            idempotencyConflict: !sameRequest,
            superseded,
            commandAggregateId: String(prior.aggregate_id || ""),
            commandAggregateRevision: Number(prior.aggregate_revision || 0),
          };
        }
        if (Number(current.aggregate_revision) !== Number(expectedRevision)) {
          return { row: current, conflict: true, exists: true };
        }
        const updated = normalizedDate === null
          ? await tx`
            UPDATE work_orders
            SET planning_start_date = NULL,
                metadata = COALESCE(metadata, '{}'::jsonb) - 'planningStartDate',
                aggregate_revision = aggregate_revision + 1,
                updated_at = now()
            WHERE id = ${current.id} AND aggregate_revision = ${expectedRevision}
            RETURNING *
          `
          : await tx`
            UPDATE work_orders
            SET planning_start_date = ${normalizedDate},
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{planningStartDate}', to_jsonb(${normalizedDate}::text), true),
                aggregate_revision = aggregate_revision + 1,
                updated_at = now()
            WHERE id = ${current.id} AND aggregate_revision = ${expectedRevision}
            RETURNING *
          `;
        if (!updated[0]) return { row: current, conflict: true, exists: true };
        const row = updated[0];
        await tx`
          INSERT INTO domain_change_log (
            aggregate_type, aggregate_id, aggregate_revision, command_type,
            payload, actor_id, idempotency_key, snapshot_sync_state
          )
          VALUES (
            'work_order', ${row.id}, ${row.aggregate_revision}, 'change_start_date',
            ${tx.json({ planningStartDate: normalizedDate, expectedRevision, actorId: normalizedActor })},
            ${normalizedActor}, ${normalizedKey}, 'pending'
          )
        `;
        return {
          row,
          conflict: false,
          idempotentReplay: false,
          commandAggregateId: String(row.id || ""),
          commandAggregateRevision: Number(row.aggregate_revision || 0),
        };
      });
      if (!result.row) return { ...metadata, revision: 0, updatedAt: "", conflict: result.conflict, idempotencyConflict: Boolean(result.idempotencyConflict), item: null };
      const item = mapOrder({ ...result.row, operation_count: 0, scheduled_operation_count: 0 });
      return {
        ...metadata,
        revision: item.concurrencyRevision,
        updatedAt: item.updatedAt,
        conflict: Boolean(result.conflict),
        idempotentReplay: Boolean(result.idempotentReplay),
        idempotencyConflict: Boolean(result.idempotencyConflict),
        superseded: Boolean(result.superseded),
        commandAggregateId: String(result.commandAggregateId || ""),
        commandAggregateRevision: Number(result.commandAggregateRevision || 0),
        item,
      };
    },

    async getStartDateSnapshotReceipt(receiptIdentity = {}) {
      const {
        actorId = "",
        idempotencyKey = "",
        aggregateId = "",
        aggregateRevision = 0,
        expectedRevision = 0,
        planningStartDate,
      } = receiptIdentity;
      const normalizedActor = String(actorId || "").trim();
      const normalizedKey = String(idempotencyKey || "").trim();
      const normalizedAggregateId = String(aggregateId || "").trim();
      const hasPlanningStartDate = Object.prototype.hasOwnProperty.call(receiptIdentity, "planningStartDate");
      const normalizedDate = planningStartDate === null
        ? null
        : typeof planningStartDate === "string" ? planningStartDate.trim() : undefined;
      const normalizedAggregateRevision = Number(aggregateRevision);
      const normalizedExpectedRevision = Number(expectedRevision);
      if (!normalizedActor || !normalizedKey || !normalizedAggregateId
        || !Number.isInteger(normalizedAggregateRevision) || normalizedAggregateRevision < 1
        || !Number.isInteger(normalizedExpectedRevision) || normalizedExpectedRevision < 1
        || !hasPlanningStartDate
        || (normalizedDate !== null && !isExactIsoDateOnly(normalizedDate))) {
        throw new Error("Exact Planning start-date receipt identity is required");
      }
      const rows = await sql`
        SELECT
          receipt.id,
          receipt.aggregate_id,
          receipt.aggregate_revision,
          receipt.command_type,
          receipt.payload,
          receipt.snapshot_sync_state,
          receipt.snapshot_sync_error,
          receipt.snapshot_synced_at,
          COALESCE((
            SELECT count(*)::int
            FROM domain_change_log AS unresolved
            WHERE unresolved.aggregate_type = 'work_order'
              AND unresolved.aggregate_id = receipt.aggregate_id
              AND unresolved.snapshot_sync_state IN ('pending', 'conflict')
          ), 0)::int AS unresolved_count
        FROM domain_change_log AS receipt
        WHERE receipt.actor_id = ${normalizedActor}
          AND receipt.idempotency_key = ${normalizedKey}
        LIMIT 1
      `;
      const receipt = rows[0] || null;
      if (!receipt) {
        return { found: false, exact: false, ready: false, state: "missing", unresolvedCount: 0 };
      }
      const exact = String(receipt.aggregate_id) === normalizedAggregateId
        && Number(receipt.aggregate_revision) === normalizedAggregateRevision
        && String(receipt.command_type) === "change_start_date"
        && Object.prototype.hasOwnProperty.call(receipt.payload || {}, "planningStartDate")
        && receipt.payload.planningStartDate === normalizedDate
        && Number(receipt.payload?.expectedRevision) === normalizedExpectedRevision;
      const state = String(receipt.snapshot_sync_state || "pending");
      const unresolvedCount = Math.max(0, Number(receipt.unresolved_count || 0));
      return {
        found: true,
        exact,
        ready: exact && state === "applied" && unresolvedCount === 0,
        receiptId: Number(receipt.id),
        aggregateId: String(receipt.aggregate_id || ""),
        aggregateRevision: Number(receipt.aggregate_revision || 0),
        state,
        unresolvedCount,
        error: String(receipt.snapshot_sync_error || ""),
        syncedAt: receipt.snapshot_synced_at?.toISOString?.() || "",
      };
    },

    async getSlotScheduleSnapshotReceipt(receiptIdentity = {}) {
      const {
        actorId = "",
        aggregateId = "",
        aggregateRevision = 0,
        expectedRevision = 0,
        operationId = "",
        slotId = "",
        plannedStart = "",
      } = receiptIdentity;
      const normalizedActor = String(actorId || "").trim();
      const normalizedAggregateId = String(aggregateId || "").trim();
      const normalizedOperationId = String(operationId || "").trim();
      const normalizedSlotId = String(slotId || "").trim();
      const normalizedAggregateRevision = Number(aggregateRevision);
      const normalizedExpectedRevision = Number(expectedRevision);
      if (!normalizedActor || !normalizedAggregateId || !normalizedOperationId || !normalizedSlotId
        || !Number.isInteger(normalizedAggregateRevision) || normalizedAggregateRevision < 1
        || !Number.isInteger(normalizedExpectedRevision) || normalizedExpectedRevision < 1
        || !isExactIsoInstantWithOffset(plannedStart)) {
        throw new Error("Exact Planning slot-schedule receipt identity is required");
      }
      const normalizedStart = new Date(plannedStart).toISOString();
      const rows = await sql`
        SELECT
          receipt.id,
          receipt.aggregate_id,
          receipt.aggregate_revision,
          receipt.command_type,
          receipt.payload,
          receipt.snapshot_sync_state,
          receipt.snapshot_sync_error,
          receipt.snapshot_synced_at,
          COALESCE((
            SELECT count(*)::int
            FROM domain_change_log AS unresolved
            WHERE unresolved.aggregate_type = 'work_order'
              AND unresolved.aggregate_id = receipt.aggregate_id
              AND unresolved.snapshot_sync_state IN ('pending', 'conflict')
          ), 0)::int AS unresolved_count
        FROM domain_change_log AS receipt
        WHERE receipt.aggregate_type = 'work_order'
          AND receipt.aggregate_id = ${normalizedAggregateId}
          AND receipt.aggregate_revision = ${normalizedAggregateRevision}
          AND receipt.actor_id = ${normalizedActor}
          AND receipt.command_type = 'change_slot_schedule'
        LIMIT 1
      `;
      const receipt = rows[0] || null;
      if (!receipt) return { found: false, exact: false, ready: false, state: "missing", unresolvedCount: 0 };
      const exact = String(receipt.aggregate_id) === normalizedAggregateId
        && Number(receipt.aggregate_revision) === normalizedAggregateRevision
        && String(receipt.command_type) === "change_slot_schedule"
        && String(receipt.payload?.operationId || "") === normalizedOperationId
        && String(receipt.payload?.slotId || "") === normalizedSlotId
        && String(receipt.payload?.plannedStart || "") === normalizedStart
        && Number(receipt.payload?.expectedRevision) === normalizedExpectedRevision;
      const state = String(receipt.snapshot_sync_state || "pending");
      const unresolvedCount = Math.max(0, Number(receipt.unresolved_count || 0));
      return {
        found: true,
        exact,
        ready: exact && state === "applied" && unresolvedCount === 0,
        receiptId: Number(receipt.id),
        aggregateId: String(receipt.aggregate_id || ""),
        aggregateRevision: Number(receipt.aggregate_revision || 0),
        state,
        unresolvedCount,
        error: String(receipt.snapshot_sync_error || ""),
        syncedAt: receipt.snapshot_synced_at?.toISOString?.() || "",
      };
    },

    async changeSlotSchedule(id, operationId, { slotId, plannedStart, expectedRevision, actorId = "" }) {
      const exactSlotId = String(slotId || "").trim();
      if (!exactSlotId) throw new Error("Exact planning slotId is required");
      if (!isExactIsoInstantWithOffset(plannedStart)) throw new Error("plannedStart must be an exact ISO date-time with offset");
      const nextStart = new Date(plannedStart);
      const result = await sql.begin(async (tx) => {
        await acquireResourceDependencyLock(tx);
        const current = await tx`
          WITH canonical_order AS MATERIALIZED (
            SELECT id
            FROM work_orders
            WHERE id = ${id} OR number = ${id}
            ORDER BY CASE WHEN id = ${id} THEN 0 ELSE 1 END, id
            LIMIT 1
          )
          SELECT wo.*, op.id AS operation_row_id, op.work_center_id, op.execution_context,
            ps.id AS slot_id, ps.quantity AS slot_quantity, ps.status AS slot_status, ps.is_locked
          FROM canonical_order AS target
          JOIN work_orders AS wo ON wo.id = target.id
          JOIN work_order_operations AS op ON op.work_order_id = wo.id
          JOIN planning_slots AS ps ON ps.work_order_operation_id = op.id
          WHERE ps.id = ${exactSlotId}
            AND (op.id = ${operationId} OR op.operation_id = ${operationId})
          ORDER BY CASE WHEN op.id = ${operationId} THEN 0 ELSE 1 END, op.id
          LIMIT 1
          FOR UPDATE OF wo, op, ps
        `;
        const slot = current[0];
        if (!slot) {
          const order = await tx`
            SELECT aggregate_revision
            FROM work_orders
            WHERE id = ${id} OR number = ${id}
            ORDER BY CASE WHEN id = ${id} THEN 0 ELSE 1 END, id
            LIMIT 1
          `;
          return { row: null, conflict: Boolean(order[0]), exists: Boolean(order[0]) };
        }
        if (Number(slot.aggregate_revision) !== Number(expectedRevision)) return { row: null, conflict: true, exists: true };
        if (slot.is_locked || ["completed", "done"].includes(String(slot.slot_status || "").toLowerCase())) {
          throw new Error("Completed or locked planning slot cannot be rescheduled");
        }
        const [calendarRows, resourceRows] = await Promise.all([
          tx`SELECT * FROM work_center_calendars WHERE work_center_id = ${String(slot.work_center_id || "")}`,
          tx`SELECT * FROM production_resources WHERE work_center_id = ${String(slot.work_center_id || "")} AND is_active = TRUE`,
        ]);
        const calendar = calendarByWorkCenter(calendarRows).get(String(slot.work_center_id || ""));
        if (!calendar) throw new Error(`Work-center calendar is missing for ${slot.work_center_id || "operation"}`);
        const executionContext = { ...(slot.execution_context || {}), workCenterId: String(slot.work_center_id || "") };
        const durationMs = calculateOperationDurationMs(executionContext, Number(slot.slot_quantity || 0), resourceRows);
        const nextEnd = addCalendarWorkingDuration(calendar, nextStart, durationMs);
        const updated = await tx`
          UPDATE work_orders
          SET aggregate_revision = aggregate_revision + 1, updated_at = now()
          WHERE id = ${slot.id} AND aggregate_revision = ${expectedRevision}
          RETURNING *
        `;
        if (!updated[0]) return { row: null, conflict: true, exists: true };
        const updatedSlots = await tx`
          UPDATE planning_slots AS ps
          SET planned_start = ${nextStart}, planned_end = ${nextEnd}
          FROM work_order_operations AS op, work_orders AS wo
          WHERE ps.id = ${exactSlotId}
            AND ps.work_order_operation_id = op.id
            AND op.id = ${slot.operation_row_id}
            AND op.work_order_id = wo.id
            AND wo.id = ${updated[0].id}
          RETURNING ps.*
        `;
        const authoritativeSlot = updatedSlots[0] || null;
        if (!authoritativeSlot || String(authoritativeSlot.id) !== exactSlotId) {
          throw new Error("Exact planning slot authoritative read-back failed");
        }
        await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
          VALUES ('work_order', ${updated[0].id}, ${updated[0].aggregate_revision}, 'change_slot_schedule', ${tx.json({ operationId, slotId: exactSlotId, plannedStart: nextStart.toISOString(), plannedEnd: nextEnd.toISOString(), quantity: Number(slot.slot_quantity || 0), status: String(slot.slot_status || "planned"), isLocked: Boolean(slot.is_locked), expectedRevision, actorId: String(actorId || "") })}, ${String(actorId || "")}, 'pending')
        `;
        return { row: updated[0], slot: authoritativeSlot, conflict: false };
      });
      if (!result.row) return { ...metadata, revision: 0, updatedAt: "", conflict: result.conflict, item: null };
      const item = mapOrder({ ...result.row, operation_count: 0, scheduled_operation_count: 0 });
      const authoritativeSlot = result.slot ? mapPlanningSlot(result.slot) : null;
      if (!authoritativeSlot || authoritativeSlot.id !== exactSlotId) throw new Error("Exact planning slot authoritative read-back failed");
      return { ...metadata, revision: item.concurrencyRevision, updatedAt: item.updatedAt, conflict: false, item, slot: authoritativeSlot };
    },

    async listPendingSnapshotSyncs(limit = 20, { aggregateType = "", aggregateId = "" } = {}) {
      const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      const normalizedType = String(aggregateType || "").trim();
      const normalizedId = String(aggregateId || "").trim();
      const rows = normalizedType && normalizedId
        ? await sql`
          SELECT id, aggregate_type, aggregate_id, aggregate_revision, command_type, payload, created_at
          FROM domain_change_log
          WHERE snapshot_sync_state = 'pending' AND aggregate_type = ${normalizedType} AND aggregate_id = ${normalizedId}
          ORDER BY created_at ASC, id ASC
          LIMIT ${boundedLimit}
        `
        : normalizedType
          ? await sql`
            SELECT id, aggregate_type, aggregate_id, aggregate_revision, command_type, payload, created_at
            FROM domain_change_log
            WHERE snapshot_sync_state = 'pending' AND aggregate_type = ${normalizedType}
            ORDER BY created_at ASC, id ASC
            LIMIT ${boundedLimit}
          `
          : await sql`
            SELECT id, aggregate_type, aggregate_id, aggregate_revision, command_type, payload, created_at
            FROM domain_change_log
            WHERE snapshot_sync_state = 'pending'
            ORDER BY created_at ASC, id ASC
            LIMIT ${boundedLimit}
          `;
      return rows.map((row) => ({
        id: Number(row.id),
        aggregateType: String(row.aggregate_type),
        aggregateId: String(row.aggregate_id),
        aggregateRevision: Number(row.aggregate_revision),
        commandType: String(row.command_type),
        payload: row.payload || {},
        createdAt: row.created_at?.toISOString?.() || "",
      }));
    },

    async listPendingSnapshotSyncsForAggregate(aggregateId, { limit = 10_000 } = {}) {
      const normalizedId = String(aggregateId || "").trim();
      const boundedLimit = Math.max(1, Math.min(10_000, Number(limit) || 10_000));
      if (!normalizedId) throw new Error("Work-order aggregate id is required");
      const rows = await sql`
        SELECT id, aggregate_type, aggregate_id, aggregate_revision, command_type, payload, created_at
        FROM domain_change_log
        WHERE snapshot_sync_state = 'pending'
          AND aggregate_type = 'work_order'
          AND aggregate_id = ${normalizedId}
        ORDER BY aggregate_revision ASC, id ASC
        LIMIT ${boundedLimit + 1}
      `;
      if (rows.length > boundedLimit) {
        throw new Error(`Planning snapshot chain exceeds the safe ${boundedLimit}-row recovery bound`);
      }
      return rows.map((row) => ({
        id: Number(row.id),
        aggregateType: String(row.aggregate_type),
        aggregateId: String(row.aggregate_id),
        aggregateRevision: Number(row.aggregate_revision),
        commandType: String(row.command_type),
        payload: row.payload || {},
        createdAt: row.created_at?.toISOString?.() || "",
      }));
    },

    async markSnapshotSync(id, { state = "applied", error = "" } = {}) {
      if (!["applied", "pending", "conflict"].includes(state)) throw new Error("Unsupported snapshot sync state");
      await sql`
        UPDATE domain_change_log
        SET snapshot_sync_state = ${state}, snapshot_sync_error = ${String(error || "").slice(0, 500)},
          snapshot_synced_at = CASE WHEN ${state} = 'applied' THEN now() ELSE NULL END
        WHERE id = ${Number(id)}
      `;
    },

    async markSnapshotSyncs(ids = [], { state = "applied", error = "" } = {}) {
      if (!["applied", "pending", "conflict"].includes(state)) throw new Error("Unsupported snapshot sync state");
      const normalizedIds = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
      if (!normalizedIds.length || normalizedIds.length !== ids.length) throw new Error("Snapshot sync ids must be unique positive integers");
      const rows = await sql`
        UPDATE domain_change_log
        SET snapshot_sync_state = ${state}, snapshot_sync_error = ${String(error || "").slice(0, 500)},
          snapshot_synced_at = CASE WHEN ${state} = 'applied' THEN now() ELSE NULL END
        WHERE id = ANY(${normalizedIds}::bigint[])
        RETURNING id
      `;
      if (rows.length !== normalizedIds.length) {
        throw new Error(`Snapshot sync bulk receipt mismatch: expected ${normalizedIds.length}, updated ${rows.length}`);
      }
    },

    // The process-level pool is shared by HTTP requests. Shutdown code may
    // call closePostgresDomainClients() when a dedicated worker is added.
  };
}
