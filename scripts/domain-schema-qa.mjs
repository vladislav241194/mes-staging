import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migrationPath = fileURLToPath(new URL("../db/migrations/001_domain_core.sql", import.meta.url));
const sql = await readFile(migrationPath, "utf-8");
const slotStateMigrationPath = fileURLToPath(new URL("../db/migrations/002_planning_slot_execution_state.sql", import.meta.url));
const slotStateSql = await readFile(slotStateMigrationPath, "utf-8");
const multiplierMigrationPath = fileURLToPath(new URL("../db/migrations/003_operation_quantity_multiplier.sql", import.meta.url));
const multiplierSql = await readFile(multiplierMigrationPath, "utf-8");
const executionContextMigrationPath = fileURLToPath(new URL("../db/migrations/004_operation_execution_context.sql", import.meta.url));
const executionContextSql = await readFile(executionContextMigrationPath, "utf-8");
const calendarsMigrationPath = fileURLToPath(new URL("../db/migrations/005_work_center_calendars.sql", import.meta.url));
const calendarsSql = await readFile(calendarsMigrationPath, "utf-8");
const resourcesMigrationPath = fileURLToPath(new URL("../db/migrations/006_production_resources.sql", import.meta.url));
const resourcesSql = await readFile(resourcesMigrationPath, "utf-8");
const outboxMigrationPath = fileURLToPath(new URL("../db/migrations/007_snapshot_sync_outbox.sql", import.meta.url));
const outboxSql = await readFile(outboxMigrationPath, "utf-8");
const shiftExecutionMigrationPath = fileURLToPath(new URL("../db/migrations/008_shift_execution_read_model.sql", import.meta.url));
const shiftExecutionSql = await readFile(shiftExecutionMigrationPath, "utf-8");
const specifications2RevisionMigrationPath = fileURLToPath(new URL("../db/migrations/009_specifications2_revision_read_model.sql", import.meta.url));
const specifications2RevisionSql = await readFile(specifications2RevisionMigrationPath, "utf-8");
const shiftExecutionCommandMigrationPath = fileURLToPath(new URL("../db/migrations/014_shift_execution_command_idempotency.sql", import.meta.url));
const shiftExecutionCommandSql = await readFile(shiftExecutionCommandMigrationPath, "utf-8");
const shiftExecutionRevisionMigrationPath = fileURLToPath(new URL("../db/migrations/015_shift_execution_assignment_revisions.sql", import.meta.url));
const shiftExecutionRevisionSql = await readFile(shiftExecutionRevisionMigrationPath, "utf-8");
const shiftExecutionFactMigrationPath = fileURLToPath(new URL("../db/migrations/016_shift_execution_fact_idempotency.sql", import.meta.url));
const shiftExecutionFactSql = await readFile(shiftExecutionFactMigrationPath, "utf-8");
const shiftExecutionCarryoverMigrationPath = fileURLToPath(new URL("../db/migrations/017_shift_execution_carryover_idempotency.sql", import.meta.url));
const shiftExecutionCarryoverSql = await readFile(shiftExecutionCarryoverMigrationPath, "utf-8");
const planningProjectionMetadataMigrationPath = fileURLToPath(new URL("../db/migrations/018_planning_projection_metadata.sql", import.meta.url));
const planningProjectionMetadataSql = await readFile(planningProjectionMetadataMigrationPath, "utf-8");
const specifications2AttachmentsMigrationPath = fileURLToPath(new URL("../db/migrations/019_specifications2_attachment_blobs.sql", import.meta.url));
const specifications2AttachmentsSql = await readFile(specifications2AttachmentsMigrationPath, "utf-8");
const planningPeriodOverlapIndexMigrationPath = fileURLToPath(new URL("../db/migrations/020_planning_period_overlap_index.sql", import.meta.url));
const planningPeriodOverlapIndexSql = await readFile(planningPeriodOverlapIndexMigrationPath, "utf-8");
const planningParityWatermarkMigrationPath = fileURLToPath(new URL("../db/migrations/021_planning_projection_parity_watermark.sql", import.meta.url));
const planningParityWatermarkSql = await readFile(planningParityWatermarkMigrationPath, "utf-8");

[
  "CREATE TABLE IF NOT EXISTS work_orders",
  "aggregate_revision BIGINT NOT NULL",
  "CREATE TABLE IF NOT EXISTS work_order_operations",
  "REFERENCES work_orders(id) ON DELETE CASCADE",
  "CREATE TABLE IF NOT EXISTS planning_slots",
  "CREATE TABLE IF NOT EXISTS domain_change_log",
  "UNIQUE (aggregate_type, aggregate_id, aggregate_revision)",
  "INSERT INTO mes_schema_migrations(version) VALUES ('001_domain_core')",
].forEach((fragment) => assert(sql.includes(fragment), `Domain schema is missing: ${fragment}`));

assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(sql), "Initial domain migration must not contain destructive statements");
[
  "ADD COLUMN IF NOT EXISTS quantity",
  "ADD COLUMN IF NOT EXISTS is_locked",
  "INSERT INTO mes_schema_migrations(version) VALUES ('002_planning_slot_execution_state')",
].forEach((fragment) => assert(slotStateSql.includes(fragment), `Planning slot execution-state migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(slotStateSql), "Planning slot execution-state migration must not contain destructive statements");
[
  "ADD COLUMN IF NOT EXISTS quantity_multiplier",
  "INSERT INTO mes_schema_migrations(version) VALUES ('003_operation_quantity_multiplier')",
].forEach((fragment) => assert(multiplierSql.includes(fragment), `Operation quantity-multiplier migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(multiplierSql), "Operation quantity-multiplier migration must not contain destructive statements");
[
  "ADD COLUMN IF NOT EXISTS execution_context JSONB",
  "INSERT INTO mes_schema_migrations(version) VALUES ('004_operation_execution_context')",
].forEach((fragment) => assert(executionContextSql.includes(fragment), `Operation execution-context migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(executionContextSql), "Operation execution-context migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS work_center_calendars",
  "timezone TEXT NOT NULL DEFAULT 'Europe/Moscow'",
  "INSERT INTO mes_schema_migrations(version) VALUES ('005_work_center_calendars')",
].forEach((fragment) => assert(calendarsSql.includes(fragment), `Work-center calendars migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(calendarsSql), "Work-center calendars migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS production_resources",
  "capacity_hours NUMERIC(14, 3)",
  "INSERT INTO mes_schema_migrations(version) VALUES ('006_production_resources')",
].forEach((fragment) => assert(resourcesSql.includes(fragment), `Production resources migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(resourcesSql), "Production resources migration must not contain destructive statements");
[
  "ADD COLUMN IF NOT EXISTS snapshot_sync_state",
  "CREATE INDEX IF NOT EXISTS domain_change_log_snapshot_sync_idx",
  "INSERT INTO mes_schema_migrations(version) VALUES ('007_snapshot_sync_outbox')",
].forEach((fragment) => assert(outboxSql.includes(fragment), `Snapshot-sync outbox migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(outboxSql), "Snapshot-sync outbox migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS shift_assignments",
  "CREATE TABLE IF NOT EXISTS shift_assignment_executors",
  "CREATE TABLE IF NOT EXISTS shift_facts",
  "CREATE TABLE IF NOT EXISTS shift_carryovers",
  "REFERENCES work_orders(id) ON DELETE RESTRICT",
  "REFERENCES work_order_operations(id) ON DELETE RESTRICT",
  "INSERT INTO mes_schema_migrations(version) VALUES ('008_shift_execution_read_model')",
].forEach((fragment) => assert(shiftExecutionSql.includes(fragment), `Shift-execution migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(shiftExecutionSql), "Shift-execution migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS specifications2_documents",
  "CREATE TABLE IF NOT EXISTS specifications2_revisions",
  "CREATE TABLE IF NOT EXISTS specifications2_revision_items",
  "CREATE TABLE IF NOT EXISTS specifications2_route_documents",
  "CREATE TABLE IF NOT EXISTS specifications2_route_operations",
  "UNIQUE (specification_id, revision_no)",
  "UNIQUE (route_document_id, sequence_no)",
  "INSERT INTO mes_schema_migrations(version) VALUES ('009_specifications2_revision_read_model')",
].forEach((fragment) => assert(specifications2RevisionSql.includes(fragment), `Specifications 2.0 revision migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(specifications2RevisionSql), "Specifications 2.0 revision migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS shift_execution_command_requests",
  "idempotency_key TEXT PRIMARY KEY",
  "shift_assignment_id TEXT NOT NULL REFERENCES shift_assignments(id)",
  "INSERT INTO mes_schema_migrations(version) VALUES ('014_shift_execution_command_idempotency')",
].forEach((fragment) => assert(shiftExecutionCommandSql.includes(fragment), `Shift-execution command migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(shiftExecutionCommandSql), "Shift-execution command migration must not contain destructive statements");
[
  "ADD COLUMN IF NOT EXISTS revision",
  "CREATE TABLE IF NOT EXISTS shift_execution_mutation_requests",
  "resulting_revision INTEGER NOT NULL",
  "INSERT INTO mes_schema_migrations(version) VALUES ('015_shift_execution_assignment_revisions')",
].forEach((fragment) => assert(shiftExecutionRevisionSql.includes(fragment), `Shift-execution revision migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(shiftExecutionRevisionSql), "Shift-execution revision migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS shift_execution_fact_requests",
  "shift_fact_id TEXT NOT NULL REFERENCES shift_facts(id)",
  "INSERT INTO mes_schema_migrations(version) VALUES ('016_shift_execution_fact_idempotency')",
].forEach((fragment) => assert(shiftExecutionFactSql.includes(fragment), `Shift-execution fact migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(shiftExecutionFactSql), "Shift-execution fact migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS shift_execution_carryover_requests",
  "shift_carryover_id TEXT NOT NULL REFERENCES shift_carryovers(id)",
  "INSERT INTO mes_schema_migrations(version) VALUES ('017_shift_execution_carryover_idempotency')",
].forEach((fragment) => assert(shiftExecutionCarryoverSql.includes(fragment), `Shift-execution carryover migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(shiftExecutionCarryoverSql), "Shift-execution carryover migration must not contain destructive statements");
[
  "ALTER TABLE work_orders",
  "ALTER TABLE work_order_operations",
  "ALTER TABLE planning_slots",
  "ADD COLUMN IF NOT EXISTS metadata JSONB",
  "INSERT INTO mes_schema_migrations(version) VALUES ('018_planning_projection_metadata')",
].forEach((fragment) => assert(planningProjectionMetadataSql.includes(fragment), `Planning projection metadata migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(planningProjectionMetadataSql), "Planning projection metadata migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS specifications2_attachment_blobs",
  "content_digest TEXT NOT NULL UNIQUE",
  "content BYTEA NOT NULL",
  "byte_size INTEGER NOT NULL CHECK",
  "INSERT INTO mes_schema_migrations(version) VALUES ('019_specifications2_attachment_blobs')",
].forEach((fragment) => assert(specifications2AttachmentsSql.includes(fragment), `Specifications 2.0 attachment migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(specifications2AttachmentsSql), "Specifications 2.0 attachment migration must not contain destructive statements");
[
  "CREATE INDEX IF NOT EXISTS planning_slots_period_overlap_idx",
  "USING GIST (tstzrange(planned_start, planned_end, '[)'))",
  "INSERT INTO mes_schema_migrations(version) VALUES ('020_planning_period_overlap_index')",
].forEach((fragment) => assert(planningPeriodOverlapIndexSql.includes(fragment), `Planning period overlap-index migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(planningPeriodOverlapIndexSql), "Planning period overlap-index migration must not contain destructive statements");
[
  "CREATE TABLE IF NOT EXISTS planning_projection_parity_state",
  "CREATE OR REPLACE FUNCTION mes_bump_planning_projection_parity_revision",
  "verified_contract_version INTEGER NOT NULL DEFAULT 0",
  "AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON work_orders",
  "AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON work_order_operations",
  "AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON planning_slots",
  "INSERT INTO mes_schema_migrations(version)\nVALUES ('021_planning_projection_parity_watermark')",
].forEach((fragment) => assert(planningParityWatermarkSql.includes(fragment), `Planning parity-watermark migration is missing: ${fragment}`));
assert(!/DROP\s+(TABLE|DATABASE|SCHEMA)/i.test(planningParityWatermarkSql), "Planning parity-watermark migration must not contain destructive statements");
console.log("Domain schema QA: OK");
