import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isExactIsoCalendarDate } from "../src/domain/calendar_date.js";
import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";

const migration = await readFile(new URL("../db/migrations/032_planning_work_order_start_date.sql", import.meta.url), "utf8");
const migrationRunner = await readFile(new URL("./domain-postgres-migrate.mjs", import.meta.url), "utf8");
const preflight = await readFile(new URL("./domain-postgres-preflight.mjs", import.meta.url), "utf8");
const preflightPolicy = await readFile(new URL("./domain-postgres-preflight-policy.mjs", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
assert.match(migration, /ADD COLUMN IF NOT EXISTS planning_start_date DATE/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS idempotency_key TEXT/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS domain_change_log_actor_idempotency_uidx/);
assert.match(migration, /WHERE actor_id IS NOT NULL AND idempotency_key IS NOT NULL/);
assert.match(migration, /WITH candidate AS MATERIALIZED/,
  "legacy date parsing must be isolated before any integer/date conversion");
assert.match(migration, /make_date\(year_value, month_value, 1\)/,
  "backfill must construct only a guaranteed-valid first day before adding the legacy offset");
assert.doesNotMatch(migration, /make_date\(year_value, month_value, day_value\)/,
  "invalid legacy day values must never be passed directly to make_date");
assert.match(migration, /to_char\(date_value, 'YYYY-MM-DD'\) = value/,
  "normalised legacy dates must round-trip exactly before backfill");
assert.doesNotMatch(migration, /DROP\s+(?:TABLE|DATABASE|SCHEMA|COLUMN)/i,
  "start-date migration must remain additive and rollback-compatible");
assert.match(migrationRunner, /readdir\(migrationsDir\).*sort\(\)/s,
  "the ordered migration runner must discover migration 032 without a separate unsafe path");
assert.match(preflightPolicy, /MES_ENABLE_PLANNING_START_DATE_COMMANDS/);
assert.match(preflightPolicy, /PLANNING_START_DATE_COMMAND_MIGRATION/);
assert.match(preflight, /startDateCommandReadiness\(\)/,
  "enabled production owner preflight must verify exact catalog readiness, not only a marker/file name");
assert.doesNotMatch(appSource, /initializePlanningWorkbenchModule|ensurePlanningWorkbenchModule|renderPlanningWorkbenchPage/,
  "the start-date owner must remain independent of the retired legacy Planning renderer");
assert.match(appSource, /function normalizeNullablePlanningStartDate\(value\)[\s\S]*?isExactIsoCalendarDate\(normalized\)/,
  "nullable Planning command normalization must remain bound to the shared exact calendar validator");
assert.match(appSource, /ownsPlanningStartDate[\s\S]*?normalizeNullablePlanningStartDate\(command\.planningStartDate\)[\s\S]*?planningStartDate === undefined/,
  "React Planning command host must distinguish explicit null from missing/invalid input");

assert.equal(isExactIsoCalendarDate("2028-02-29"), true, "a real leap day must be accepted");
for (const invalid of ["2026-02-29", "2026-02-31", "2026-13-01", "0000-01-01", "99-99-9999"]) {
  assert.equal(isExactIsoCalendarDate(invalid), false, `${invalid} must be rejected without normalisation`);
}

function readinessSql(fixture) {
  const calls = [];
  const sql = (strings, ...values) => {
    const query = strings.join("?");
    calls.push({ query, values });
    if (!/start_date_column_type/.test(query) || !/pg_get_indexdef/.test(query)) throw new Error(`Unexpected readiness SQL: ${query}`);
    return Promise.resolve([{ ...fixture }]);
  };
  return { sql, calls };
}

const validReadiness = {
  start_date_column_type: "date",
  idempotency_column_type: "text",
  idempotency_index_unique: true,
  idempotency_index_operational: true,
  idempotency_index_columns_exact: true,
  idempotency_index_predicate: "((actor_id IS NOT NULL) AND (idempotency_key IS NOT NULL))",
  idempotency_index_definition: "CREATE UNIQUE INDEX domain_change_log_actor_idempotency_uidx ON public.domain_change_log USING btree (actor_id, idempotency_key) WHERE ((actor_id IS NOT NULL) AND (idempotency_key IS NOT NULL))",
  migration_applied: true,
};
const readyHarness = readinessSql(validReadiness);
assert.equal((await createPostgresWorkOrdersRepository({ sql: readyHarness.sql }).startDateCommandReadiness()).schemaReady, true,
  "exact DATE/TEXT columns and exact unique partial actor/key index must admit the owner");
assert.match(readyHarness.calls[0].query, /pg_catalog\.pg_index/);
assert.match(readyHarness.calls[0].query, /pg_get_expr/);
assert.match(readyHarness.calls[0].query, /pg_get_indexdef/);

for (const wrong of [
  { start_date_column_type: "text" },
  { idempotency_column_type: "character varying" },
  { idempotency_index_unique: false },
  { idempotency_index_operational: false },
  { idempotency_index_columns_exact: false },
  { idempotency_index_predicate: "actor_id IS NOT NULL" },
  { idempotency_index_definition: "CREATE INDEX domain_change_log_actor_idempotency_uidx ON public.domain_change_log USING btree (actor_id)" },
  { migration_applied: false },
]) {
  const harness = readinessSql({ ...validReadiness, ...wrong });
  const result = await createPostgresWorkOrdersRepository({ sql: harness.sql }).startDateCommandReadiness();
  assert.equal(result.schemaReady, false, `wrong readiness fixture must fail closed: ${JSON.stringify(wrong)}`);
}

function createCommandHarness({ planningStartDate = "2026-07-21", revision = 7, collision = false } = {}) {
  const baseOrder = {
    id: "route-1",
    number: "WO-001",
    name: "Заказ QA",
    designation: "QA.001",
    quantity: 12,
    unit: "шт.",
    lifecycle_status: "released",
    planning_status: "scheduled",
    planning_start_date: planningStartDate,
    source_revision: 1,
    aggregate_revision: revision,
    source_kind: "specifications2",
    metadata: { planningStartDate },
    updated_at: new Date("2026-07-21T08:00:00.000Z"),
  };
  let orders = [baseOrder];
  if (collision) {
    orders.push({
      ...baseOrder,
      id: "WO-001",
      number: "WO-COLLISION",
      aggregate_revision: 11,
      planning_start_date: "2026-07-20",
      metadata: { planningStartDate: "2026-07-20" },
    });
  }
  const logs = [];
  const calls = [];
  const sql = (strings, ...values) => {
    const query = strings.join("?");
    calls.push({ query, values });
    if (/pg_advisory_xact_lock/.test(query)) return Promise.resolve([]);
    if (/SELECT \* FROM work_orders/.test(query) && /FOR UPDATE/.test(query)) {
      const matches = orders
        .filter((row) => String(row.id) === String(values[0]) || String(row.number) === String(values[1]))
        .sort((left, right) => Number(String(left.id) !== String(values[2])) - Number(String(right.id) !== String(values[2])) || String(left.id).localeCompare(String(right.id)));
      return Promise.resolve(matches.slice(0, 1).map((row) => ({ ...row, metadata: { ...row.metadata } })));
    }
    if (/SELECT aggregate_id, aggregate_revision, command_type, payload/.test(query)) {
      return Promise.resolve(logs.filter((row) => row.actor_id === values[0] && row.idempotency_key === values[1]).slice(0, 1));
    }
    if (/FROM domain_change_log AS receipt/.test(query)) {
      const receipt = logs.find((row) => row.actor_id === values[0] && row.idempotency_key === values[1]);
      if (!receipt) return Promise.resolve([]);
      const unresolvedCount = logs.filter((row) => row.aggregate_id === receipt.aggregate_id
        && ["pending", "conflict"].includes(row.snapshot_sync_state)).length;
      return Promise.resolve([{ ...receipt, unresolved_count: unresolvedCount }]);
    }
    if (/UPDATE work_orders/.test(query) && /SET planning_start_date = NULL/.test(query) && /RETURNING \*/.test(query)) {
      assert.match(query, /metadata = COALESCE\(metadata, '\{\}'::jsonb\) - 'planningStartDate'/,
        "clear must remove the compatibility metadata key instead of storing JSON null");
      const [id, expectedRevision] = values;
      const index = orders.findIndex((row) => String(row.id) === String(id) && Number(row.aggregate_revision) === Number(expectedRevision));
      if (index < 0) return Promise.resolve([]);
      const metadata = { ...orders[index].metadata };
      delete metadata.planningStartDate;
      orders[index] = {
        ...orders[index],
        planning_start_date: null,
        aggregate_revision: Number(orders[index].aggregate_revision) + 1,
        metadata,
        updated_at: new Date("2026-07-21T08:01:00.000Z"),
      };
      return Promise.resolve([{ ...orders[index], metadata: { ...orders[index].metadata } }]);
    }
    if (/UPDATE work_orders/.test(query) && /planning_start_date/.test(query) && /RETURNING \*/.test(query)) {
      const [nextDate, metadataDate, id, expectedRevision] = values;
      assert.equal(nextDate, metadataDate, "canonical column and compatibility metadata must receive the same exact date");
      const index = orders.findIndex((row) => String(row.id) === String(id) && Number(row.aggregate_revision) === Number(expectedRevision));
      if (index < 0) return Promise.resolve([]);
      orders[index] = {
        ...orders[index],
        planning_start_date: nextDate,
        aggregate_revision: Number(orders[index].aggregate_revision) + 1,
        metadata: { ...orders[index].metadata, planningStartDate: nextDate },
        updated_at: new Date("2026-07-21T08:01:00.000Z"),
      };
      return Promise.resolve([{ ...orders[index], metadata: { ...orders[index].metadata } }]);
    }
    if (/INSERT INTO domain_change_log/.test(query) && /change_start_date/.test(query)) {
      const [aggregateId, aggregateRevision, payload, actorId, idempotencyKey] = values;
      logs.push({
        id: logs.length + 1,
        aggregate_id: aggregateId,
        aggregate_revision: aggregateRevision,
        command_type: "change_start_date",
        payload,
        actor_id: actorId,
        idempotency_key: idempotencyKey,
        snapshot_sync_state: "pending",
        snapshot_sync_error: "",
        snapshot_synced_at: null,
      });
      return Promise.resolve([]);
    }
    throw new Error(`Unexpected command SQL: ${query}`);
  };
  sql.json = (value) => structuredClone(value);
  sql.begin = async (handler) => handler(sql);
  return {
    repository: createPostgresWorkOrdersRepository({ sql }),
    calls,
    logs,
    get order() { return { ...orders[0], metadata: { ...orders[0].metadata } }; },
    getOrder(id) { const row = orders.find((item) => item.id === id); return row ? { ...row, metadata: { ...row.metadata } } : null; },
    advanceOrderRevision(id) {
      const row = orders.find((item) => item.id === id);
      if (row) row.aggregate_revision += 1;
    },
    replaceStartDateByOtherActor(id, planningStartDate) {
      const row = orders.find((item) => item.id === id);
      if (!row) return;
      row.aggregate_revision += 1;
      row.planning_start_date = planningStartDate;
      row.metadata = { ...row.metadata };
      if (planningStartDate === null) delete row.metadata.planningStartDate;
      else row.metadata.planningStartDate = planningStartDate;
      row.updated_at = new Date("2026-07-21T08:03:00.000Z");
    },
  };
}

const invalidHarness = createCommandHarness();
for (const date of ["2026-02-29", "2026-02-31", "2026-13-01", "", "   ", 20260721, undefined]) {
  await assert.rejects(
    invalidHarness.repository.changeStartDate("WO-001", { planningStartDate: date, expectedRevision: 7, actorId: "employee:planner", idempotencyKey: `invalid:${date}` }),
    /ISO calendar date/,
  );
}
assert.equal(invalidHarness.calls.length, 0, "invalid calendar values must be rejected before PostgreSQL is opened");
await assert.rejects(
  invalidHarness.repository.changeStartDate("WO-001", { expectedRevision: 7, actorId: "employee:planner", idempotencyKey: "missing-date" }),
  /explicit null/,
  "a missing field must not be interpreted as clear",
);
assert.equal(invalidHarness.calls.length, 0, "a missing field must fail before PostgreSQL is opened");

const aliasHarness = createCommandHarness();
const first = await aliasHarness.repository.changeStartDate("WO-001", {
  planningStartDate: "2028-02-29",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:alias-retry",
});
assert.equal(first.conflict, false);
assert.equal(first.item?.id, "route-1");
assert.equal(first.item?.planningStartDate, "2028-02-29");
assert.equal(first.item?.concurrencyRevision, 8);
assert.equal(first.commandAggregateId, "route-1");
assert.equal(first.commandAggregateRevision, 8);
assert.equal(aliasHarness.logs.length, 1);

const collisionHarness = createCommandHarness({ collision: true });
const collisionResult = await collisionHarness.repository.changeStartDate("WO-001", {
  planningStartDate: "2026-07-25",
  expectedRevision: 11,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:id-number-collision",
});
assert.equal(collisionResult.item?.id, "WO-001",
  "an exact aggregate ID must win deterministically when another row uses that value as its number alias");
assert.equal(collisionHarness.getOrder("WO-001")?.planning_start_date, "2026-07-25");
assert.equal(collisionHarness.getOrder("route-1")?.planning_start_date, "2026-07-21",
  "the colliding number-alias row must remain untouched");
assert.match(collisionHarness.calls.find((call) => /SELECT \* FROM work_orders/.test(call.query))?.query || "", /ORDER BY CASE WHEN id = \? THEN 0 ELSE 1 END, id\s+LIMIT 1\s+FOR UPDATE/,
  "canonical lookup must encode exact-ID preference inside the locked PostgreSQL query");
assert.equal(aliasHarness.logs[0].aggregate_id, "route-1", "audit row must store the canonical aggregate ID, not the number alias");
assert.equal(aliasHarness.calls.some((call) => /planning_slots/.test(call.query)), false,
  "start-date anchor command must not move or query existing Gantt slots");

const pendingReceipt = await aliasHarness.repository.getStartDateSnapshotReceipt({
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:alias-retry",
  aggregateId: "route-1",
  aggregateRevision: 8,
  expectedRevision: 7,
  planningStartDate: "2028-02-29",
});
assert.equal(pendingReceipt.exact, true);
assert.equal(pendingReceipt.ready, false);
assert.equal(pendingReceipt.state, "pending",
  "a command-specific receipt must remain rollback-pending until its exact outbox row is applied");
aliasHarness.logs[0].snapshot_sync_state = "conflict";
const conflictedReceipt = await aliasHarness.repository.getStartDateSnapshotReceipt({
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:alias-retry",
  aggregateId: "route-1",
  aggregateRevision: 8,
  expectedRevision: 7,
  planningStartDate: "2028-02-29",
});
assert.equal(conflictedReceipt.ready, false);
assert.equal(conflictedReceipt.state, "conflict",
  "a same-key replay must never turn a terminal compatibility conflict into success");
aliasHarness.logs[0].snapshot_sync_state = "applied";
aliasHarness.logs[0].snapshot_synced_at = new Date("2026-07-21T08:02:00.000Z");
const appliedReceipt = await aliasHarness.repository.getStartDateSnapshotReceipt({
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:alias-retry",
  aggregateId: "route-1",
  aggregateRevision: 8,
  expectedRevision: 7,
  planningStartDate: "2028-02-29",
});
assert.equal(appliedReceipt.ready, true);
assert.equal(appliedReceipt.unresolvedCount, 0,
  "only an exact applied receipt with no unresolved aggregate row may prove rollback readiness");
aliasHarness.advanceOrderRevision("route-1");

const replay = await aliasHarness.repository.changeStartDate("route-1", {
  planningStartDate: "2028-02-29",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:alias-retry",
});
assert.equal(replay.idempotentReplay, true, "same actor/key/payload through the canonical ID must replay after a number-alias first call");
assert.equal(replay.item?.concurrencyRevision, 9,
  "an idempotent replay may read a later aggregate revision committed by an unrelated command");
assert.equal(replay.commandAggregateRevision, 8,
  "the replay must retain the original durable command revision for exact compatibility receipt lookup");
assert.equal(aliasHarness.logs.length, 1, "an accepted retry must not advance revision or duplicate its outbox row");

const supersededHarness = createCommandHarness();
const supersededFirst = await supersededHarness.repository.changeStartDate("WO-001", {
  planningStartDate: "2026-07-24",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:superseded-replay",
});
assert.equal(supersededFirst.item?.planningStartDate, "2026-07-24");
supersededHarness.replaceStartDateByOtherActor("route-1", "2026-07-25");
const supersededReplay = await supersededHarness.repository.changeStartDate("route-1", {
  planningStartDate: "2026-07-24",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:superseded-replay",
});
assert.equal(supersededReplay.idempotentReplay, true);
assert.equal(supersededReplay.superseded, true,
  "a same-key replay must explicitly resolve when another actor replaced the original date");
assert.equal(supersededReplay.item?.planningStartDate, "2026-07-25",
  "a superseded replay must return the canonical current date, never report the old intent as applied");
assert.equal(supersededReplay.commandAggregateRevision, 8,
  "a superseded replay must retain the original receipt revision for rollback evidence");
assert.equal(supersededHarness.logs.length, 1,
  "resolving a superseded replay must not duplicate the original command");
assert.match(appSource, /result\.kind === "superseded"[\s\S]*preserveRequest: false[\s\S]*canonicalPlanningStartDate/,
  "the React host must retire the old request and expose the canonical date so a new user intent gets a fresh key");

const differentPayload = await aliasHarness.repository.changeStartDate("WO-001", {
  planningStartDate: "2028-03-01",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:alias-retry",
});
assert.equal(differentPayload.idempotencyConflict, true, "same actor/key with a different payload must fail closed");
assert.equal(aliasHarness.order.aggregate_revision, 9);
assert.equal(aliasHarness.logs.length, 1);

const sameDateHarness = createCommandHarness({ planningStartDate: "2026-07-21" });
const sameDate = await sameDateHarness.repository.changeStartDate("WO-001", {
  planningStartDate: "2026-07-21",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:same-date-first-call",
});
assert.equal(sameDate.idempotentReplay, false);
assert.equal(sameDate.item?.concurrencyRevision, 8,
  "the first same-date command must reserve its key through the same revisioned audit path");
assert.equal(sameDateHarness.logs.length, 1);

const clearHarness = createCommandHarness({ planningStartDate: "2026-07-21" });
const cleared = await clearHarness.repository.changeStartDate("WO-001", {
  planningStartDate: null,
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:clear-lost-response",
});
assert.equal(cleared.item?.planningStartDate, null, "clear must expose the canonical nullable owner value");
assert.equal(cleared.item?.concurrencyRevision, 8);
assert.equal(clearHarness.order.planning_start_date, null);
assert.equal(Object.prototype.hasOwnProperty.call(clearHarness.order.metadata, "planningStartDate"), false,
  "clear must remove legacy metadata in the same PostgreSQL transaction");
assert.equal(clearHarness.logs.length, 1);
assert.equal(Object.prototype.hasOwnProperty.call(clearHarness.logs[0].payload, "planningStartDate"), true);
assert.equal(clearHarness.logs[0].payload.planningStartDate, null,
  "the immutable outbox payload must retain explicit null, not collapse it to missing/empty");
const clearedReplay = await clearHarness.repository.changeStartDate("route-1", {
  planningStartDate: null,
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:clear-lost-response",
});
assert.equal(clearedReplay.idempotentReplay, true, "a lost clear response must replay by the same exact key");
assert.equal(clearedReplay.superseded, false);
assert.equal(clearedReplay.item?.concurrencyRevision, 8, "exact clear replay must not advance the aggregate twice");
assert.equal(clearHarness.logs.length, 1, "exact clear replay must not duplicate its outbox receipt");
const clearReceipt = await clearHarness.repository.getStartDateSnapshotReceipt({
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:clear-lost-response",
  aggregateId: "route-1",
  aggregateRevision: 8,
  expectedRevision: 7,
  planningStartDate: null,
});
assert.equal(clearReceipt.exact, true, "receipt identity must compare explicit null without string coercion");
const clearDateCollision = await clearHarness.repository.changeStartDate("route-1", {
  planningStartDate: "2026-07-22",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:clear-lost-response",
});
assert.equal(clearDateCollision.idempotencyConflict, true, "the same key cannot change intent from clear to set");
assert.equal(clearHarness.logs.length, 1);

const clearSupersededHarness = createCommandHarness({ planningStartDate: "2026-07-21" });
await clearSupersededHarness.repository.changeStartDate("route-1", {
  planningStartDate: null,
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:clear-superseded",
});
clearSupersededHarness.replaceStartDateByOtherActor("route-1", "2026-07-23");
const clearSupersededReplay = await clearSupersededHarness.repository.changeStartDate("route-1", {
  planningStartDate: null,
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:clear-superseded",
});
assert.equal(clearSupersededReplay.idempotentReplay, true);
assert.equal(clearSupersededReplay.superseded, true, "a later set must supersede the original clear receipt");
assert.equal(clearSupersededReplay.item?.planningStartDate, "2026-07-23");

const setSupersededByClearHarness = createCommandHarness({ planningStartDate: "2026-07-21" });
await setSupersededByClearHarness.repository.changeStartDate("route-1", {
  planningStartDate: "2026-07-22",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:set-superseded-by-clear",
});
setSupersededByClearHarness.replaceStartDateByOtherActor("route-1", null);
const setSupersededByClearReplay = await setSupersededByClearHarness.repository.changeStartDate("route-1", {
  planningStartDate: "2026-07-22",
  expectedRevision: 7,
  actorId: "employee:planner",
  idempotencyKey: "planning-start-date:set-superseded-by-clear",
});
assert.equal(setSupersededByClearReplay.superseded, true, "a later clear must supersede the original set receipt");
assert.equal(setSupersededByClearReplay.item?.planningStartDate, null);
assert.equal(setSupersededByClearHarness.logs.length, 1);
assert.equal(clearHarness.calls.some((call) => /planning_slots/.test(call.query)), false,
  "clear remains an anchor-only command and must never inspect or move Gantt slots");

function createPlanningMutationCollisionHarness() {
  const orders = [
    {
      id: "route-alias", number: "WO-EXACT", name: "Alias", designation: "ALIAS", quantity: 5, unit: "шт.",
      lifecycle_status: "released", planning_status: "scheduled", planning_start_date: "2026-07-20",
      source_revision: 1, aggregate_revision: 11, source_kind: "qa", metadata: {}, updated_at: new Date("2026-07-21T08:00:00.000Z"),
    },
    {
      id: "WO-EXACT", number: "WO-CANONICAL", name: "Canonical", designation: "EXACT", quantity: 10, unit: "шт.",
      lifecycle_status: "released", planning_status: "scheduled", planning_start_date: "2026-07-21",
      source_revision: 1, aggregate_revision: 11, source_kind: "qa", metadata: {}, updated_at: new Date("2026-07-21T08:00:00.000Z"),
    },
  ];
  const operations = [
    { id: "op-alias", operation_id: "op-exact", work_order_id: "WO-EXACT", work_center_id: "D1", execution_context: { calculationType: "productivity", unitsPerHour: 10 } },
    { id: "op-exact", operation_id: "OP-CANONICAL", work_order_id: "WO-EXACT", work_center_id: "D1", execution_context: { calculationType: "productivity", unitsPerHour: 10 } },
  ];
  const slots = [
    { id: "slot-alias", work_order_operation_id: "op-alias", quantity: 10, status: "planned", is_locked: false, planned_start: new Date("2026-07-21T08:00:00.000Z"), planned_end: new Date("2026-07-21T09:00:00.000Z") },
    { id: "slot-exact", work_order_operation_id: "op-exact", quantity: 10, status: "planned", is_locked: false, planned_start: new Date("2026-07-21T08:00:00.000Z"), planned_end: new Date("2026-07-21T09:00:00.000Z") },
    { id: "slot-exact-neighbor", work_order_operation_id: "op-exact", quantity: 10, status: "planned", is_locked: false, planned_start: new Date("2026-07-21T10:00:00.000Z"), planned_end: new Date("2026-07-21T11:00:00.000Z") },
  ];
  const calls = [];
  const logs = [];
  const sql = (strings, ...values) => {
    const query = strings.join("?");
    calls.push({ query, values });
    if (/WITH current AS/.test(query) && /SET quantity = \?/.test(query)) {
      assert.match(query, /ORDER BY CASE WHEN id = \? THEN 0 ELSE 1 END, id\s+LIMIT 1\s+FOR UPDATE/,
        "quantity owner must lock only one exact-id-first aggregate");
      const requestedId = String(values[0]);
      const quantity = Number(values[3]);
      const expectedRevision = Number(values[4]);
      const row = orders.find((item) => String(item.id) === requestedId)
        || orders.find((item) => String(item.number) === requestedId);
      if (!row || Number(row.aggregate_revision) !== expectedRevision) return Promise.resolve([]);
      row.quantity = quantity;
      row.aggregate_revision += 1;
      return Promise.resolve([{ ...row }]);
    }
    if (/FROM planning_slots AS slot/.test(query)) return Promise.resolve([]);
    if (/INSERT INTO domain_change_log/.test(query) && /change_quantity/.test(query)) {
      logs.push({ type: "quantity", aggregateId: values[0] });
      return Promise.resolve([]);
    }
    if (/WITH canonical_order AS MATERIALIZED/.test(query)) {
      assert.match(query, /ORDER BY CASE WHEN id = \? THEN 0 ELSE 1 END, id\s+LIMIT 1/,
        "slot owner must resolve one exact-id-first aggregate before joining operations");
      assert.match(query, /WHERE ps\.id = \?\s+AND \(op\.id = \? OR op\.operation_id = \?\)\s+ORDER BY CASE WHEN op\.id = \? THEN 0 ELSE 1 END, op\.id\s+LIMIT 1\s+FOR UPDATE OF wo, op, ps/,
        "slot owner must bind an exact physical slot and operation inside the canonical aggregate");
      const requestedId = String(values[0]);
      const slotId = String(values[3]);
      const operationId = String(values[4]);
      const order = orders.find((item) => String(item.id) === requestedId)
        || orders.find((item) => String(item.number) === requestedId);
      const candidates = operations.filter((operation) => operation.work_order_id === order?.id
        && (operation.id === operationId || operation.operation_id === operationId));
      candidates.sort((left, right) => Number(left.id !== operationId) - Number(right.id !== operationId)
        || left.id.localeCompare(right.id));
      const operation = candidates[0];
      const slot = slots.find((item) => item.id === slotId && item.work_order_operation_id === operation?.id);
      return Promise.resolve(order && operation && slot ? [{
        ...order,
        operation_row_id: operation.id,
        work_center_id: operation.work_center_id,
        execution_context: operation.execution_context,
        slot_id: slot.id,
        slot_quantity: slot.quantity,
        slot_status: slot.status,
        is_locked: slot.is_locked,
      }] : []);
    }
    if (/FROM work_center_calendars/.test(query)) return Promise.resolve([{ work_center_id: "D1", work_schedule: "24/7", work_mode: "00:00-24:00" }]);
    if (/FROM production_resources/.test(query)) return Promise.resolve([]);
    if (/UPDATE work_orders/.test(query) && /SET aggregate_revision = aggregate_revision \+ 1/.test(query)) {
      const [id, expectedRevision] = values;
      const row = orders.find((item) => item.id === String(id) && Number(item.aggregate_revision) === Number(expectedRevision));
      if (!row) return Promise.resolve([]);
      row.aggregate_revision += 1;
      return Promise.resolve([{ ...row }]);
    }
    if (/UPDATE planning_slots AS ps/.test(query)) {
      const [plannedStart, plannedEnd, slotId, operationId, orderId] = values;
      const operation = operations.find((item) => item.id === String(operationId) && item.work_order_id === String(orderId));
      const slot = slots.find((item) => item.id === String(slotId) && item.work_order_operation_id === operation?.id);
      if (slot) { slot.planned_start = plannedStart; slot.planned_end = plannedEnd; }
      return Promise.resolve(slot ? [{ ...slot }] : []);
    }
    if (/INSERT INTO domain_change_log/.test(query) && /change_slot_schedule/.test(query)) {
      logs.push({ type: "slot", aggregateId: values[0], payload: values[2] });
      return Promise.resolve([]);
    }
    throw new Error(`Unexpected collision SQL: ${query}`);
  };
  sql.json = (value) => structuredClone(value);
  sql.begin = async (handler) => handler(sql);
  return { repository: createPostgresWorkOrdersRepository({ sql }), orders, slots, calls, logs };
}

const mutationCollision = createPlanningMutationCollisionHarness();
const quantityCollision = await mutationCollision.repository.changeQuantity("WO-EXACT", { quantity: 25, expectedRevision: 11, actorId: "employee:planner" });
assert.equal(quantityCollision.item?.id, "WO-EXACT");
assert.equal(mutationCollision.orders.find((row) => row.id === "WO-EXACT")?.quantity, 25);
assert.equal(mutationCollision.orders.find((row) => row.id === "route-alias")?.quantity, 5,
  "quantity mutation must not update a colliding number-alias aggregate");
assert.deepEqual(mutationCollision.logs[0], { type: "quantity", aggregateId: "WO-EXACT" });

const slotCollision = await mutationCollision.repository.changeSlotSchedule("WO-EXACT", "op-exact", {
  slotId: "slot-exact",
  plannedStart: "2026-07-22T10:00:00.000Z",
  expectedRevision: 12,
  actorId: "employee:planner",
});
assert.equal(slotCollision.item?.id, "WO-EXACT");
assert.equal(slotCollision.slot?.id, "slot-exact", "owner read-back must identify the same physical slot selected by the UI");
assert.equal(mutationCollision.orders.find((row) => row.id === "WO-EXACT")?.aggregate_revision, 13);
assert.equal(mutationCollision.orders.find((row) => row.id === "route-alias")?.aggregate_revision, 11,
  "slot mutation must not advance a colliding number-alias aggregate");
assert.equal(mutationCollision.slots.find((slot) => slot.id === "slot-exact")?.planned_start.toISOString(), "2026-07-22T10:00:00.000Z");
assert.equal(mutationCollision.slots.find((slot) => slot.id === "slot-exact-neighbor")?.planned_start.toISOString(), "2026-07-21T10:00:00.000Z",
  "rescheduling one split physical slot must leave its neighboring slot unchanged");
assert.equal(mutationCollision.slots.find((slot) => slot.id === "slot-alias")?.planned_start.toISOString(), "2026-07-21T08:00:00.000Z",
  "exact operation id must win over a colliding operation alias");
assert.equal(mutationCollision.logs[1]?.type, "slot");
assert.equal(mutationCollision.logs[1]?.aggregateId, "WO-EXACT");
assert.equal(mutationCollision.logs[1]?.payload?.slotId, "slot-exact", "snapshot compatibility payload must retain the exact physical slot id");
assert.equal(mutationCollision.logs[1]?.payload?.plannedStart, "2026-07-22T10:00:00.000Z");
assert.equal(mutationCollision.logs[1]?.payload?.plannedEnd, "2026-07-22T11:00:00.000Z", "snapshot compatibility payload must carry the authoritative recalculated end");

await assert.rejects(
  mutationCollision.repository.changeSlotSchedule("WO-EXACT", "op-exact", {
    slotId: "slot-exact-neighbor",
    plannedStart: "2026-07-22T11:00:00",
    expectedRevision: 13,
    actorId: "employee:planner",
  }),
  /exact ISO date-time with offset/,
  "repository must reject a local date-time without an explicit offset before SQL",
);

console.log("Planning owner QA: exact calendar/instant, split physical-slot identity, canonical collisions, idempotency and anchor-only semantics passed.");
