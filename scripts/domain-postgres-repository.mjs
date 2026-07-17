import postgres from "postgres";
import { calculateOperationDurationMs } from "../src/domain/operation_duration.js";
import { addCalendarWorkingDuration, createWorkingCalendar } from "../src/domain/working_calendar.js";

const CLIENTS_BY_URL = new Map();
const PLANNING_LIST_METADATA_FIELDS = [
  "id", "name", "revision", "createdAt", "updatedAt", "canceledAt", "isDefault",
  "projectId", "rootRouteId", "routeTaskId", "parentRouteId", "routeTaskName",
  "routeTaskSourceItemId", "planningStatus", "lifecycleStatus", "specificationId",
  "planningQuantity", "routeDocumentKind", "specificationName",
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
    revision: Number(row.source_revision),
    concurrencyRevision: Number(row.aggregate_revision),
    source: String(row.source_kind),
    metadata: row.metadata || {},
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ""),
    operationCount: Number(row.operation_count || 0),
    scheduledOperationCount: Number(row.scheduled_operation_count || 0),
  };
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
    slot: slot ? {
      id: String(slot.id),
      plannedStart: slot.planned_start instanceof Date ? slot.planned_start.toISOString() : String(slot.planned_start || ""),
      plannedEnd: slot.planned_end instanceof Date ? slot.planned_end.toISOString() : String(slot.planned_end || ""),
      status: String(slot.status || "planned"),
      quantity: Number(slot.quantity),
      isLocked: Boolean(slot.is_locked),
      metadata: slot.metadata || {},
    } : null,
  };
}

function listMetadata(rows = []) {
  const revision = rows.reduce((max, row) => Math.max(max, Number(row.aggregate_revision) || 0), 0);
  const updatedAt = rows.reduce((latest, row) => {
    const value = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || "");
    return value > latest ? value : latest;
  }, "");
  return { revision, updatedAt };
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

export function createPostgresWorkOrdersRepository({ databaseUrl } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL domain storage");
  const sql = getClient(databaseUrl);
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  async function listRows() {
    return sql`
      SELECT wo.*,
        (SELECT count(*) FROM work_order_operations op WHERE op.work_order_id = wo.id) AS operation_count,
        (SELECT count(*) FROM planning_slots ps JOIN work_order_operations op ON op.id = ps.work_order_operation_id WHERE op.work_order_id = wo.id) AS scheduled_operation_count
      FROM work_orders wo
      ORDER BY wo.updated_at DESC, wo.number ASC
    `;
  }

  return {
    async health() {
      const [orders, migrations] = await Promise.all([
        sql`SELECT aggregate_revision, updated_at FROM work_orders`,
        sql`SELECT max(applied_at) AS updated_at FROM mes_schema_migrations`,
      ]);
      const current = listMetadata(orders);
      return { ...metadata, revision: current.revision, updatedAt: current.updatedAt || migrations[0]?.updated_at?.toISOString?.() || "" };
    },

    async list() {
      const rows = await listRows();
      // The sidebar needs order identity and compact labels only. Large
      // document revision snapshots and per-step labour maps belong to the
      // selected order detail; returning them for every order delayed the
      // first Planning render by hundreds of kilobytes.
      return { ...metadata, ...listMetadata(rows), items: rows.map(mapOrderList) };
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
        FROM work_orders wo WHERE wo.id = ${id} OR wo.number = ${id} LIMIT 1
      `;
      const order = orders[0];
      if (!order) return { ...metadata, revision: 0, updatedAt: "", item: null };
      const operations = await sql`SELECT * FROM work_order_operations WHERE work_order_id = ${order.id} ORDER BY sequence_no`;
      const slots = await sql`
        SELECT ps.* FROM planning_slots ps
        JOIN work_order_operations op ON op.id = ps.work_order_operation_id
        WHERE op.work_order_id = ${order.id}
      `;
      const slotsByOperation = new Map(slots.map((slot) => [String(slot.work_order_operation_id), slot]));
      return {
        ...metadata,
        revision: Number(order.aggregate_revision),
        updatedAt: order.updated_at?.toISOString?.() || "",
        item: { ...mapOrderDetail(order), operations: operations.map((operation) => mapOperation(operation, slotsByOperation.get(String(operation.id)) || null)) },
      };
    },

    async changeQuantity(id, { quantity, expectedRevision }) {
      const result = await sql.begin(async (tx) => {
        const updated = await tx`
          WITH current AS (
            SELECT id, aggregate_revision
            FROM work_orders
            WHERE id = ${id} OR number = ${id}
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
            INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, snapshot_sync_state)
            VALUES ('work_order', ${row.id}, ${row.aggregate_revision}, 'change_quantity', ${tx.json({ quantity, expectedRevision })}, 'pending')
          `;
          return { row, conflict: false };
        }
        const exists = await tx`SELECT aggregate_revision FROM work_orders WHERE id = ${id} OR number = ${id} LIMIT 1`;
        return { row: null, conflict: Boolean(exists[0]), exists: Boolean(exists[0]) };
      });
      if (!result.row) return { ...metadata, revision: 0, updatedAt: "", conflict: result.conflict, item: null };
      const item = mapOrder({ ...result.row, operation_count: 0, scheduled_operation_count: 0 });
      return { ...metadata, revision: item.concurrencyRevision, updatedAt: item.updatedAt, conflict: false, item };
    },

    async changeSlotSchedule(id, operationId, { plannedStart, expectedRevision }) {
      const nextStart = new Date(plannedStart);
      if (Number.isNaN(nextStart.getTime())) throw new Error("plannedStart must be an ISO date-time");
      const result = await sql.begin(async (tx) => {
        const current = await tx`
          SELECT wo.*, op.id AS operation_row_id, op.work_center_id, op.execution_context,
            ps.id AS slot_id, ps.quantity AS slot_quantity, ps.status AS slot_status, ps.is_locked
          FROM work_orders AS wo
          JOIN work_order_operations AS op ON op.work_order_id = wo.id
          JOIN planning_slots AS ps ON ps.work_order_operation_id = op.id
          WHERE (wo.id = ${id} OR wo.number = ${id})
            AND (op.id = ${operationId} OR op.operation_id = ${operationId})
          FOR UPDATE
        `;
        const slot = current[0];
        if (!slot) {
          const order = await tx`SELECT aggregate_revision FROM work_orders WHERE id = ${id} OR number = ${id} LIMIT 1`;
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
        await tx`
          UPDATE planning_slots
          SET planned_start = ${nextStart}, planned_end = ${nextEnd}
          WHERE id = ${slot.slot_id}
        `;
        await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, snapshot_sync_state)
          VALUES ('work_order', ${updated[0].id}, ${updated[0].aggregate_revision}, 'change_slot_schedule', ${tx.json({ operationId, plannedStart: nextStart.toISOString(), expectedRevision })}, 'pending')
        `;
        return { row: updated[0], conflict: false };
      });
      if (!result.row) return { ...metadata, revision: 0, updatedAt: "", conflict: result.conflict, item: null };
      const item = mapOrder({ ...result.row, operation_count: 0, scheduled_operation_count: 0 });
      return { ...metadata, revision: item.concurrencyRevision, updatedAt: item.updatedAt, conflict: false, item };
    },

    async listPendingSnapshotSyncs(limit = 20) {
      const rows = await sql`
        SELECT id, aggregate_id, aggregate_revision, command_type, payload, created_at
        FROM domain_change_log
        WHERE snapshot_sync_state = 'pending'
        ORDER BY created_at ASC, id ASC
        LIMIT ${Math.max(1, Math.min(100, Number(limit) || 20))}
      `;
      return rows.map((row) => ({
        id: Number(row.id),
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

    // The process-level pool is shared by HTTP requests. Shutdown code may
    // call closePostgresDomainClients() when a dedicated worker is added.
  };
}
