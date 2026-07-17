import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const parsed = { apply: false, file: "" };
  for (const arg of argv) {
    if (arg === "--apply") parsed.apply = true;
    else if (!arg.startsWith("--") && !parsed.file) parsed.file = arg;
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!parsed.file) throw new Error("Usage: npm run domain:postgres:import -- <export.json> [--apply]");
  return parsed;
}

export function validateDomainExport(payload = {}) {
  if (payload.schemaVersion !== "006_production_resources") throw new Error("Unsupported domain export schema");
  const arrays = ["workOrders", "workOrderOperations", "planningSlots", "workCenterCalendars", "productionResources"];
  arrays.forEach((key) => {
    if (!Array.isArray(payload[key])) throw new Error(`Domain export is missing ${key}`);
  });
  const orderIds = new Set(payload.workOrders.map((row) => String(row.id || "")));
  const operationIds = new Set(payload.workOrderOperations.map((row) => String(row.id || "")));
  if (orderIds.size !== payload.workOrders.length || orderIds.has("")) throw new Error("Domain export contains duplicate or empty work-order IDs");
  if (operationIds.size !== payload.workOrderOperations.length || operationIds.has("")) throw new Error("Domain export contains duplicate or empty operation IDs");
  payload.workOrderOperations.forEach((row) => {
    if (!orderIds.has(String(row.work_order_id || ""))) throw new Error(`Operation ${row.id} refers to an unknown work order`);
    if (!Number.isInteger(Number(row.quantity_multiplier)) || Number(row.quantity_multiplier) <= 0) throw new Error(`Operation ${row.id} must have a positive quantity multiplier`);
    if (!row.execution_context || typeof row.execution_context !== "object" || Array.isArray(row.execution_context)) throw new Error(`Operation ${row.id} must have an execution context`);
  });
  payload.planningSlots.forEach((row) => {
    if (!operationIds.has(String(row.work_order_operation_id || ""))) throw new Error(`Planning slot ${row.id} refers to an unknown operation`);
    if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0) throw new Error(`Planning slot ${row.id} must have a positive quantity`);
  });
  const workCenterIds = new Set(payload.workCenterCalendars.map((row) => String(row.work_center_id || "")));
  if (workCenterIds.size !== payload.workCenterCalendars.length || workCenterIds.has("")) throw new Error("Domain export contains duplicate or empty work-center calendar IDs");
  payload.workCenterCalendars.forEach((row) => {
    if (!String(row.work_schedule || "").trim() || !String(row.work_mode || "").trim() || !String(row.timezone || "").trim()) throw new Error(`Work-center calendar ${row.work_center_id} is incomplete`);
  });
  const resourceIds = new Set(payload.productionResources.map((row) => String(row.id || "")));
  if (resourceIds.size !== payload.productionResources.length || resourceIds.has("")) throw new Error("Domain export contains duplicate or empty production-resource IDs");
  payload.productionResources.forEach((row) => {
    if (!String(row.work_center_id || "").trim() || !String(row.name || "").trim() || !String(row.resource_type || "").trim()) throw new Error(`Production resource ${row.id} is incomplete`);
    if (Number(row.capacity_hours) < 0 || Number(row.units_per_hour) < 0) throw new Error(`Production resource ${row.id} has invalid capacity`);
  });
  return {
    workOrders: payload.workOrders.length,
    operations: payload.workOrderOperations.length,
    planningSlots: payload.planningSlots.length,
    workCenterCalendars: payload.workCenterCalendars.length,
    productionResources: payload.productionResources.length,
  };
}

async function importExport(sql, payload) {
  await sql.begin(async (tx) => {
    for (const row of payload.workOrders) {
      await tx`
        INSERT INTO work_orders (id, number, name, designation, unit, quantity, lifecycle_status, planning_status, source_kind, source_revision, aggregate_revision, metadata, created_at, updated_at)
        VALUES (${row.id}, ${row.number}, ${row.name}, ${row.designation}, ${row.unit}, ${row.quantity}, ${row.lifecycle_status}, ${row.planning_status}, ${row.source_kind}, ${row.source_revision}, ${row.aggregate_revision}, ${tx.json(row.metadata || {})}, COALESCE(${row.created_at}, now()), COALESCE(${row.updated_at}, now()))
        ON CONFLICT (id) DO UPDATE SET
          number = EXCLUDED.number, name = EXCLUDED.name, designation = EXCLUDED.designation, unit = EXCLUDED.unit,
          quantity = EXCLUDED.quantity, lifecycle_status = EXCLUDED.lifecycle_status, planning_status = EXCLUDED.planning_status,
          source_kind = EXCLUDED.source_kind, source_revision = EXCLUDED.source_revision,
          aggregate_revision = GREATEST(work_orders.aggregate_revision, EXCLUDED.aggregate_revision), metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at
      `;
    }
    for (const row of payload.workOrderOperations) {
      await tx`
        INSERT INTO work_order_operations (id, work_order_id, operation_id, name, work_center_id, next_work_center_id, sequence_no, quantity_multiplier, execution_context, labor, metadata)
        VALUES (${row.id}, ${row.work_order_id}, ${row.operation_id}, ${row.name}, ${row.work_center_id}, ${row.next_work_center_id}, ${row.sequence_no}, ${row.quantity_multiplier}, ${tx.json(row.execution_context)}, ${tx.json(row.labor || {})}, ${tx.json(row.metadata || {})})
        ON CONFLICT (id) DO UPDATE SET
          work_order_id = EXCLUDED.work_order_id, operation_id = EXCLUDED.operation_id, name = EXCLUDED.name,
          work_center_id = EXCLUDED.work_center_id, next_work_center_id = EXCLUDED.next_work_center_id,
          sequence_no = EXCLUDED.sequence_no, quantity_multiplier = EXCLUDED.quantity_multiplier,
          execution_context = EXCLUDED.execution_context, labor = EXCLUDED.labor, metadata = EXCLUDED.metadata
      `;
    }
    for (const row of payload.planningSlots) {
      await tx`
        INSERT INTO planning_slots (id, work_order_operation_id, planned_start, planned_end, status, quantity, is_locked, metadata)
        VALUES (${row.id}, ${row.work_order_operation_id}, ${row.planned_start}, ${row.planned_end}, ${row.status}, ${row.quantity}, ${Boolean(row.is_locked)}, ${tx.json(row.metadata || {})})
        ON CONFLICT (id) DO UPDATE SET
          work_order_operation_id = EXCLUDED.work_order_operation_id, planned_start = EXCLUDED.planned_start,
          planned_end = EXCLUDED.planned_end, status = EXCLUDED.status, quantity = EXCLUDED.quantity,
          is_locked = EXCLUDED.is_locked, metadata = EXCLUDED.metadata
      `;
    }
    for (const row of payload.workCenterCalendars) {
      await tx`
        INSERT INTO work_center_calendars (work_center_id, work_schedule, work_mode, timezone, is_active, updated_at)
        VALUES (${row.work_center_id}, ${row.work_schedule}, ${row.work_mode}, ${row.timezone}, ${Boolean(row.is_active)}, now())
        ON CONFLICT (work_center_id) DO UPDATE SET
          work_schedule = EXCLUDED.work_schedule, work_mode = EXCLUDED.work_mode, timezone = EXCLUDED.timezone,
          is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at
      `;
    }
    for (const row of payload.productionResources) {
      await tx`
        INSERT INTO production_resources (id, work_center_id, name, resource_type, capacity_hours, units_per_hour, participates_in_calculation, participates_in_planning, is_active, source_kind, updated_at)
        VALUES (${row.id}, ${row.work_center_id}, ${row.name}, ${row.resource_type}, ${row.capacity_hours}, ${row.units_per_hour}, ${Boolean(row.participates_in_calculation)}, ${Boolean(row.participates_in_planning)}, ${Boolean(row.is_active)}, ${row.source_kind}, now())
        ON CONFLICT (id) DO UPDATE SET
          work_center_id = EXCLUDED.work_center_id, name = EXCLUDED.name, resource_type = EXCLUDED.resource_type,
          capacity_hours = EXCLUDED.capacity_hours, units_per_hour = EXCLUDED.units_per_hour,
          participates_in_calculation = EXCLUDED.participates_in_calculation,
          participates_in_planning = EXCLUDED.participates_in_planning, is_active = EXCLUDED.is_active,
          source_kind = EXCLUDED.source_kind, updated_at = EXCLUDED.updated_at
      `;
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = resolve(args.file);
  const payload = JSON.parse(await readFile(file, "utf-8"));
  const counts = validateDomainExport(payload);
  console.log(`Domain import plan: ${file}`);
  console.log(`- work orders: ${counts.workOrders}`);
  console.log(`- operations: ${counts.operations}`);
  console.log(`- planning slots: ${counts.planningSlots}`);
  console.log(`- work-center calendars: ${counts.workCenterCalendars}`);
  console.log(`- production resources: ${counts.productionResources}`);
  if (!args.apply) {
    console.log("DRY RUN: no PostgreSQL changes made. Pass --apply only after preflight and parity check.");
    return;
  }
  const databaseUrl = process.env.MES_DOMAIN_MIGRATOR_DATABASE_URL
    || process.env.MES_DOMAIN_DATABASE_URL
    || process.env.DATABASE_URL
    || "";
  if (!databaseUrl) throw new Error("MES_DOMAIN_MIGRATOR_DATABASE_URL must be configured for --apply");
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await importExport(sql, payload);
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log("Domain import: OK");
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  await main();
}
