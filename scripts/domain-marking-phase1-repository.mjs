import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

import {
  MARKING_PHASE1_SCOPE,
  MARKING_PHASE1_STATES,
  MarkingPhase1ValidationError,
  assertMarkingPhase1Completable,
  assertMarkingPhase1Configurable,
  assertMarkingPhase1TransferCancellable,
  assertMarkingPhase1Transferable,
  normalizeMarkingPhase1AddKits,
  normalizeMarkingPhase1Bootstrap,
  normalizeMarkingPhase1CodeLookup,
  normalizeMarkingPhase1Completion,
  normalizeMarkingPhase1Configuration,
  normalizeMarkingPhase1PrintRequest,
  normalizeMarkingPhase1PrintResult,
  normalizeMarkingPhase1Reprint,
  normalizeMarkingPhase1TaskDetailQuery,
  normalizeMarkingPhase1TaskListQuery,
  normalizeMarkingPhase1Transfer,
  normalizeMarkingPhase1TransferCancellation,
  stableMarkingPhase1Json,
} from "../src/domain/marking_phase1.js";

export const MARKING_PHASE1_DATABASE_CONTRACT = Object.freeze({
  migration: "035_marking_phase1_prototype",
  scope: MARKING_PHASE1_SCOPE,
  tables: Object.freeze([
    "marking_phase1_tasks",
    "marking_phase1_kits",
    "marking_phase1_codes",
    "marking_phase1_print_batches",
    "marking_phase1_print_items",
    "marking_phase1_audit_events",
    "marking_phase1_command_requests",
  ]),
});

export class MarkingPhase1RepositoryError extends Error {
  constructor(message, code = "marking-phase1-repository-error", statusCode = 500, details = {}) {
    super(message);
    this.name = "MarkingPhase1RepositoryError";
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

const number = (value = 0) => Number(value || 0);
const iso = (value) => value?.toISOString?.() || (value ? String(value) : "");
const actorId = (input = {}) => String(input.actorId || "").trim();
const actorEmployeeId = (input = {}) => String(input.actorEmployeeId || "").trim();

function assertActor(input = {}) {
  if (!actorId(input) || !actorEmployeeId(input)) {
    throw new MarkingPhase1RepositoryError("Authenticated employee actor is required", "marking-actor-required", 401);
  }
}

function taskView(row = {}, counts = {}) {
  return {
    id: String(row.id || ""),
    testData: true,
    scope: String(row.prototype_scope || MARKING_PHASE1_SCOPE),
    sourceAssignmentId: String(row.source_assignment_id || ""),
    sourceWorkOrderId: String(row.source_work_order_id || ""),
    sourceOperationId: String(row.source_operation_id || ""),
    sourceWorkCenterId: String(row.source_work_center_id || ""),
    assignedEmployeeId: String(row.assigned_employee_id || ""),
    productId: String(row.product_id || ""),
    productName: String(row.product_name || ""),
    workOrderNumber: String(row.work_order_number || ""),
    title: String(row.task_title || ""),
    plannedBoardQuantity: number(row.planned_board_quantity),
    sourceStarted: row.source_started === true,
    state: String(row.phase1_state || MARKING_PHASE1_STATES.draft),
    configuredKitCount: number(row.configured_kit_count),
    boardsPerKit: number(row.boards_per_kit),
    labels: {
      master: { widthMm: number(row.master_label_width_mm), heightMm: number(row.master_label_height_mm) },
      individual: { widthMm: number(row.individual_label_width_mm), heightMm: number(row.individual_label_height_mm) },
    },
    nextWorkCenterId: String(row.next_work_center_id || ""),
    revision: number(row.revision),
    metrics: {
      kitCount: number(counts.kit_count),
      confirmedKitCount: number(counts.confirmed_kit_count),
      boardCount: number(counts.board_count),
      printedBoardCount: number(counts.printed_board_count),
      labelCount: number(counts.label_count),
      printBatchCount: number(counts.print_batch_count),
      additionalKitCount: number(counts.additional_kit_count),
      overPlan: counts.over_plan === true,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: iso(row.completed_at),
    transferredAt: iso(row.transferred_at),
    transferCancelledAt: iso(row.transfer_cancelled_at),
  };
}

function testSeedIdentity(employeeId, sequence) {
  const digest = createHash("sha256").update(`marking-phase1-test:${employeeId}`).digest("hex").slice(0, 12).toUpperCase();
  return `MOK-MARKING-${digest}-${String(sequence).padStart(2, "0")}`;
}

async function ensureEmployeeTestTasks(tx, { employeeId, actor }) {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`mes:marking-phase1:test-seed:${employeeId}`}))`;
  const present = await tx`SELECT 1 FROM marking_phase1_tasks WHERE assigned_employee_id = ${employeeId} LIMIT 1`;
  if (present[0]) return;
  const seeds = [
    {
      id: testSeedIdentity(employeeId, 1),
      title: "MOK — Маркировка партии контроллеров",
      product: "MOK — Плата контроллера НУ70-2+2 F",
      order: "MOK-MARKING-SZN-018",
      plan: 2000,
      kits: 100,
      boards: 20,
      state: "configured",
    },
    {
      id: testSeedIdentity(employeeId, 2),
      title: "MOK — Маркировка модулей питания",
      product: "MOK — Модуль питания МП-24 rev.6",
      order: "MOK-MARKING-SZN-021",
      plan: 24000,
      kits: 1200,
      boards: 20,
      state: "draft",
    },
  ];
  for (const seed of seeds) {
    await tx`
      INSERT INTO marking_phase1_tasks (
        id, source_assignment_id, source_work_order_id, source_operation_id, source_work_center_id,
        assigned_employee_id, product_id, product_name, work_order_number, task_title,
        planned_board_quantity, phase1_state, configured_kit_count, boards_per_kit,
        next_work_center_id, created_by, updated_by
      ) VALUES (
        ${seed.id}, ${`${seed.id}-ASSIGNMENT`}, ${`${seed.id}-WORK-ORDER`}, ${`${seed.id}-OPERATION`}, 'MOK-MARKING-WORK-CENTER',
        ${employeeId}, ${`${seed.id}-PRODUCT`}, ${seed.product}, ${seed.order}, ${seed.title},
        ${seed.plan}, ${seed.state}, ${seed.kits}, ${seed.boards}, 'MOK-MARKING-NEXT-WORK-CENTER', ${actor}, ${actor}
      )
      ON CONFLICT DO NOTHING
    `;
    await writeAudit(tx, {
      taskId: seed.id,
      type: "test_task_seeded",
      actor,
      revision: 1,
      payload: { testData: true, scope: MARKING_PHASE1_SCOPE },
    });
  }
}

function kitView(row = {}, codes = []) {
  const master = codes.find((item) => item.code_type === "master");
  const individual = codes.filter((item) => item.code_type === "individual")
    .sort((left, right) => number(left.board_index) - number(right.board_index));
  return {
    id: String(row.id || ""),
    sequence: number(row.sequence_no),
    boardsPerKit: number(row.boards_per_kit),
    addedAfterStart: row.added_after_start === true,
    exceedsPlan: row.exceeds_plan === true,
    printState: String(row.print_state || "not_sent"),
    masterCode: String(master?.code_value || ""),
    individualCodes: individual.map((item) => String(item.code_value || "")),
    firstConfirmedAt: iso(row.first_confirmed_at),
    lastPrintedAt: iso(row.last_printed_at),
    createdAt: iso(row.created_at),
  };
}

function batchView(row = {}) {
  return {
    id: String(row.id || ""),
    taskId: String(row.task_id || ""),
    sourceBatchId: String(row.source_batch_id || ""),
    mode: String(row.print_mode || "initial"),
    scopeType: String(row.scope_type || "task"),
    scopeTargetId: String(row.scope_target_id || ""),
    state: String(row.print_state || "awaiting_confirmation"),
    kitCount: number(row.kit_count),
    labelCount: number(row.item_count),
    itemCount: number(row.item_count),
    requestedAt: iso(row.requested_at),
    resolvedAt: iso(row.resolved_at),
    errorMessage: String(row.error_message || ""),
  };
}

function auditView(row = {}) {
  return {
    id: String(row.id || ""),
    type: String(row.event_type || ""),
    taskRevision: number(row.task_revision),
    relatedEntityId: String(row.related_entity_id || ""),
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    createdAt: iso(row.created_at),
  };
}

function fingerprint(commandType, input, actor) {
  const payload = { ...input };
  delete payload.idempotencyKey;
  return createHash("sha256").update(stableMarkingPhase1Json({ commandType, actor, payload })).digest("hex");
}

function codeValue() {
  return randomBytes(18).toString("base64url").toUpperCase();
}

function assertRevision(task, expectedRevision) {
  const currentRevision = number(task?.revision);
  if (currentRevision !== expectedRevision) {
    throw new MarkingPhase1RepositoryError("Marking task revision changed", "marking-revision-conflict", 409, { currentRevision });
  }
}

async function selectTaskForUpdate(tx, taskId, employeeId) {
  const rows = await tx`
    SELECT * FROM marking_phase1_tasks
    WHERE id = ${taskId} AND assigned_employee_id = ${employeeId}
    FOR UPDATE
  `;
  if (!rows[0]) throw new MarkingPhase1RepositoryError("Marking task was not found for this employee", "marking-task-not-found", 404);
  return rows[0];
}

async function selectTaskCounts(tx, taskId) {
  const rows = await tx`
    SELECT
      count(*)::integer AS kit_count,
      count(*) FILTER (WHERE print_state IN ('confirmed', 'reprinted'))::integer AS confirmed_kit_count,
      coalesce(sum(boards_per_kit), 0)::integer AS board_count,
      coalesce(sum(boards_per_kit) FILTER (WHERE print_state IN ('confirmed', 'reprinted')), 0)::integer AS printed_board_count,
      (count(*) + coalesce(sum(boards_per_kit), 0))::integer AS label_count,
      count(*) FILTER (WHERE added_after_start)::integer AS additional_kit_count,
      coalesce(bool_or(exceeds_plan), FALSE) AS over_plan,
      (SELECT count(*)::integer FROM marking_phase1_print_batches WHERE task_id = ${taskId}) AS print_batch_count
    FROM marking_phase1_kits
    WHERE task_id = ${taskId}
  `;
  return rows[0] || {};
}

async function writeAudit(tx, { taskId, type, actor, revision, relatedEntityId = "", payload = {} }) {
  await tx`
    INSERT INTO marking_phase1_audit_events
      (id, task_id, event_type, actor_id, task_revision, related_entity_id, payload)
    VALUES
      (${randomUUID()}, ${taskId}, ${type}, ${actor}, ${revision}, ${relatedEntityId}, ${tx.json(payload)})
  `;
}

async function runCommand(sql, { commandType, input, execute }) {
  assertActor(input);
  const canonicalActor = actorId(input);
  const key = input.idempotencyKey;
  const requestFingerprint = fingerprint(commandType, input, canonicalActor);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`mes:marking-phase1:${canonicalActor}:${key}`}))`;
    const prior = await tx`
      SELECT command_type, request_fingerprint, result_payload
      FROM marking_phase1_command_requests
      WHERE actor_id = ${canonicalActor} AND idempotency_key = ${key}
      LIMIT 1
    `;
    if (prior[0]) {
      if (prior[0].command_type !== commandType || prior[0].request_fingerprint !== requestFingerprint) {
        throw new MarkingPhase1RepositoryError("Idempotency-Key was already used for another command", "marking-idempotency-conflict", 409);
      }
      return { ...prior[0].result_payload, replayed: true };
    }
    const result = await execute(tx);
    const receiptTaskId = String(result?.task?.id || result?.taskId || input.taskId || "");
    if (!receiptTaskId) throw new MarkingPhase1RepositoryError("Command did not produce a task identity", "marking-command-result-invalid", 500);
    await tx`
      INSERT INTO marking_phase1_command_requests
        (actor_id, idempotency_key, command_type, request_fingerprint, task_id, result_payload)
      VALUES
        (${canonicalActor}, ${key}, ${commandType}, ${requestFingerprint}, ${receiptTaskId}, ${tx.json(result)})
    `;
    return result;
  });
}

export function createMarkingPhase1Repository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
  sql: injectedSql = null,
} = {}) {
  if (!injectedSql && !databaseUrl) {
    throw new MarkingPhase1RepositoryError("PostgreSQL is not configured", "marking-storage-not-configured", 503);
  }
  const ownsSql = !injectedSql;
  const sql = injectedSql || postgres(databaseUrl, { max: 3, idle_timeout: 10, connect_timeout: 5, prepare: false });

  const repository = {
    async readiness() {
      const rows = await sql`
        SELECT
          EXISTS (SELECT 1 FROM mes_schema_migrations WHERE version = ${MARKING_PHASE1_DATABASE_CONTRACT.migration}) AS migrated,
          to_regclass('public.marking_phase1_tasks') IS NOT NULL AS tasks_ready,
          to_regclass('public.marking_phase1_command_requests') IS NOT NULL AS receipts_ready
      `;
      const ready = rows[0]?.migrated === true && rows[0]?.tasks_ready === true && rows[0]?.receipts_ready === true;
      return { ok: ready, scope: MARKING_PHASE1_SCOPE, migration: MARKING_PHASE1_DATABASE_CONTRACT.migration };
    },

    async listTasks(input = {}) {
      assertActor(input);
      const query = normalizeMarkingPhase1TaskListQuery(input);
      return sql.begin(async (tx) => {
        await ensureEmployeeTestTasks(tx, { employeeId: actorEmployeeId(input), actor: actorId(input) });
        const rows = await tx`
          SELECT task.*,
            count(kit.id)::integer AS kit_count,
            count(kit.id) FILTER (WHERE kit.print_state IN ('confirmed', 'reprinted'))::integer AS confirmed_kit_count,
            coalesce(sum(kit.boards_per_kit), 0)::integer AS board_count,
            coalesce(sum(kit.boards_per_kit) FILTER (WHERE kit.print_state IN ('confirmed', 'reprinted')), 0)::integer AS printed_board_count,
            (count(kit.id) + coalesce(sum(kit.boards_per_kit), 0))::integer AS label_count,
            count(kit.id) FILTER (WHERE kit.added_after_start)::integer AS additional_kit_count,
            coalesce(bool_or(kit.exceeds_plan), FALSE) AS over_plan,
            (SELECT count(*)::integer FROM marking_phase1_print_batches batch WHERE batch.task_id = task.id) AS print_batch_count
          FROM marking_phase1_tasks task
          LEFT JOIN marking_phase1_kits kit ON kit.task_id = task.id
          WHERE task.assigned_employee_id = ${actorEmployeeId(input)}
          GROUP BY task.id
          ORDER BY task.updated_at DESC, task.id DESC
          LIMIT ${query.limit}
        `;
        return { ok: true, phase: "phase1", stateScope: "test-state", testData: true, tasks: rows.map((row) => taskView(row, row)) };
      });
    },

    async getTask(input = {}) {
      assertActor(input);
      const query = normalizeMarkingPhase1TaskDetailQuery(input);
      return sql.begin(async (tx) => {
        const taskRows = await tx`
          SELECT * FROM marking_phase1_tasks
          WHERE id = ${query.taskId} AND assigned_employee_id = ${actorEmployeeId(input)}
          LIMIT 1
        `;
        if (!taskRows[0]) throw new MarkingPhase1RepositoryError("Marking task was not found for this employee", "marking-task-not-found", 404);
        const [counts, kitRows, codeRows, batchRows, auditRows] = await Promise.all([
          selectTaskCounts(tx, query.taskId),
          tx`SELECT * FROM marking_phase1_kits WHERE task_id = ${query.taskId} ORDER BY sequence_no LIMIT ${query.kitLimit} OFFSET ${query.kitOffset}`,
          tx`
            SELECT code.* FROM marking_phase1_codes code
            JOIN marking_phase1_kits kit ON kit.id = code.kit_id
            WHERE code.task_id = ${query.taskId}
              AND kit.sequence_no > ${query.kitOffset}
              AND kit.sequence_no <= ${query.kitOffset + query.kitLimit}
            ORDER BY kit.sequence_no, code.code_type DESC, code.board_index
          `,
          tx`
            SELECT batch.*, count(DISTINCT item.kit_id)::integer AS kit_count
            FROM marking_phase1_print_batches batch
            LEFT JOIN marking_phase1_print_items item ON item.batch_id = batch.id
            WHERE batch.task_id = ${query.taskId}
            GROUP BY batch.id
            ORDER BY batch.requested_at DESC, batch.id DESC LIMIT 50
          `,
          tx`SELECT * FROM marking_phase1_audit_events WHERE task_id = ${query.taskId} ORDER BY created_at DESC, id DESC LIMIT 100`,
        ]);
        const codesByKit = new Map();
        codeRows.forEach((row) => {
          const items = codesByKit.get(row.kit_id) || [];
          items.push(row);
          codesByKit.set(row.kit_id, items);
        });
        return {
          ok: true,
          phase: "phase1",
          stateScope: "test-state",
          task: taskView(taskRows[0], counts),
          kits: kitRows.map((row) => kitView(row, codesByKit.get(row.id) || [])),
          batches: batchRows.map(batchView),
          history: auditRows.map(auditView),
          page: { limit: query.kitLimit, offset: query.kitOffset, total: number(counts.kit_count) },
        };
      });
    },

    async bootstrapTask(input = {}) {
      const command = normalizeMarkingPhase1Bootstrap(input);
      const context = { ...input, ...command };
      assertActor(context);
      if (command.assignedEmployeeId !== actorEmployeeId(context)) {
        throw new MarkingPhase1RepositoryError("Phase 1 bootstrap is limited to the authenticated assignee", "marking-assignee-mismatch", 403);
      }
      return runCommand(sql, {
        commandType: "bootstrap",
        input: context,
        execute: async (tx) => {
          const existingRows = await tx`SELECT * FROM marking_phase1_tasks WHERE source_assignment_id = ${command.sourceAssignmentId} FOR UPDATE`;
          if (existingRows[0]) {
            if (existingRows[0].assigned_employee_id !== command.assignedEmployeeId) {
              throw new MarkingPhase1RepositoryError("Source assignment already belongs to another Phase 1 assignee", "marking-source-assignment-conflict", 409);
            }
            return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(existingRows[0]), created: false };
          }
          const id = randomUUID();
          const rows = await tx`
            INSERT INTO marking_phase1_tasks (
              id, source_assignment_id, source_work_order_id, source_operation_id, source_work_center_id,
              assigned_employee_id, product_id, product_name, work_order_number, task_title,
              planned_board_quantity, source_started, next_work_center_id, created_by, updated_by
            ) VALUES (
              ${id}, ${command.sourceAssignmentId}, ${command.sourceWorkOrderId}, ${command.sourceOperationId}, ${command.sourceWorkCenterId},
              ${command.assignedEmployeeId}, ${command.productId}, ${command.productName}, ${command.workOrderNumber}, ${command.taskTitle},
              ${command.plannedBoardQuantity}, ${command.sourceStarted}, ${command.nextWorkCenterId}, ${actorId(context)}, ${actorId(context)}
            ) RETURNING *
          `;
          await writeAudit(tx, { taskId: id, type: "task_bootstrapped", actor: actorId(context), revision: 1, payload: { sourceAssignmentId: command.sourceAssignmentId, scope: MARKING_PHASE1_SCOPE } });
          return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(rows[0]), created: true };
        },
      });
    },

    async configureTask(input = {}) {
      const command = normalizeMarkingPhase1Configuration(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "configure",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          const counts = await selectTaskCounts(tx, command.taskId);
          assertMarkingPhase1Configurable({ phase1State: task.phase1_state, boardsPerKit: number(task.boards_per_kit) }, {
            existingKitCount: number(counts.kit_count),
            confirmedKitCount: number(counts.confirmed_kit_count),
            nextBoardsPerKit: command.boardsPerKit,
            nextKitCount: command.configuredKitCount,
          });
          const revision = number(task.revision) + 1;
          const rows = await tx`
            UPDATE marking_phase1_tasks SET
              phase1_state = CASE WHEN phase1_state = 'draft' THEN 'configured' ELSE phase1_state END,
              configured_kit_count = ${command.configuredKitCount}, boards_per_kit = ${command.boardsPerKit},
              master_label_width_mm = ${command.masterLabelWidthMm}, master_label_height_mm = ${command.masterLabelHeightMm},
              individual_label_width_mm = ${command.individualLabelWidthMm}, individual_label_height_mm = ${command.individualLabelHeightMm},
              revision = ${revision}, updated_by = ${actorId(context)}, updated_at = now()
            WHERE id = ${command.taskId}
            RETURNING *
          `;
          await writeAudit(tx, { taskId: command.taskId, type: "task_configured", actor: actorId(context), revision, payload: { configuredKitCount: command.configuredKitCount, boardsPerKit: command.boardsPerKit } });
          return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(rows[0], counts) };
        },
      });
    },

    async addKits(input = {}) {
      const command = normalizeMarkingPhase1AddKits(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "add-kits",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          if (!["configured", "in_progress"].includes(task.phase1_state) || number(task.boards_per_kit) < 1) {
            throw new MarkingPhase1RepositoryError("Configure the task before creating kits", "marking-task-not-configured", 409);
          }
          const counts = await selectTaskCounts(tx, command.taskId);
          const start = number(counts.kit_count);
          const boardsPerKit = number(task.boards_per_kit);
          const kitIds = Array.from({ length: command.count }, () => randomUUID());
          const taskIds = kitIds.map(() => command.taskId);
          const sequences = kitIds.map((_, index) => start + index + 1);
          const boards = kitIds.map(() => boardsPerKit);
          const afterStart = kitIds.map(() => task.source_started === true || start > 0);
          const exceeds = sequences.map((sequence) => task.planned_board_quantity > 0 && sequence * boardsPerKit > number(task.planned_board_quantity));
          await tx`
            INSERT INTO marking_phase1_kits (id, task_id, sequence_no, boards_per_kit, added_after_start, exceeds_plan)
            SELECT * FROM unnest(${kitIds}::text[], ${taskIds}::text[], ${sequences}::integer[], ${boards}::integer[], ${afterStart}::boolean[], ${exceeds}::boolean[])
          `;
          const codeIds = [];
          const codeTaskIds = [];
          const codeKitIds = [];
          const codeValues = [];
          const codeTypes = [];
          const boardIndexes = [];
          kitIds.forEach((kitId) => {
            codeIds.push(randomUUID()); codeTaskIds.push(command.taskId); codeKitIds.push(kitId); codeValues.push(codeValue()); codeTypes.push("master"); boardIndexes.push(null);
            for (let boardIndex = 1; boardIndex <= boardsPerKit; boardIndex += 1) {
              codeIds.push(randomUUID()); codeTaskIds.push(command.taskId); codeKitIds.push(kitId); codeValues.push(codeValue()); codeTypes.push("individual"); boardIndexes.push(boardIndex);
            }
          });
          await tx`
            INSERT INTO marking_phase1_codes (id, task_id, kit_id, code_value, code_type, board_index)
            SELECT * FROM unnest(${codeIds}::text[], ${codeTaskIds}::text[], ${codeKitIds}::text[], ${codeValues}::text[], ${codeTypes}::text[], ${boardIndexes}::integer[])
          `;
          const revision = number(task.revision) + 1;
          const updated = await tx`
            UPDATE marking_phase1_tasks SET phase1_state = 'in_progress', revision = ${revision}, updated_by = ${actorId(context)}, updated_at = now()
            WHERE id = ${command.taskId} RETURNING *
          `;
          await writeAudit(tx, { taskId: command.taskId, type: "kits_added", actor: actorId(context), revision, payload: { count: command.count, boardCount: command.count * boardsPerKit, addedAfterStart: afterStart[0], exceedsPlan: exceeds.some(Boolean) } });
          return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(updated[0], { ...counts, kit_count: start + command.count }), createdKitIds: kitIds, createdKitCount: command.count, createdCodeCount: codeIds.length, exceedsPlan: exceeds.some(Boolean) };
        },
      });
    },

    async createPrintBatch(input = {}) {
      const command = normalizeMarkingPhase1PrintRequest(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "print",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          if (!["configured", "in_progress"].includes(task.phase1_state)) throw new MarkingPhase1RepositoryError("Task is not printable", "marking-task-not-printable", 409);
          const kits = command.kitIds.length
            ? await tx`SELECT * FROM marking_phase1_kits WHERE task_id = ${command.taskId} AND id = ANY(${command.kitIds}::text[]) AND print_state NOT IN ('confirmed', 'reprinted') ORDER BY sequence_no FOR UPDATE`
            : await tx`SELECT * FROM marking_phase1_kits WHERE task_id = ${command.taskId} AND print_state NOT IN ('confirmed', 'reprinted') ORDER BY sequence_no FOR UPDATE`;
          if (!kits.length || (command.kitIds.length && kits.length !== command.kitIds.length)) {
            throw new MarkingPhase1RepositoryError("No unconfirmed kits match the print request", "marking-print-selection-empty", 409);
          }
          const selectedKitIds = kits.map((row) => row.id);
          const codes = await tx`SELECT * FROM marking_phase1_codes WHERE task_id = ${command.taskId} AND kit_id = ANY(${selectedKitIds}::text[]) ORDER BY kit_id, code_type DESC, board_index`;
          if (!codes.length) throw new MarkingPhase1RepositoryError("Selected kits have no codes", "marking-print-codes-missing", 409);
          const batchId = randomUUID();
          const batches = await tx`
            INSERT INTO marking_phase1_print_batches (id, task_id, print_mode, scope_type, scope_target_id, item_count, requested_by)
            VALUES (${batchId}, ${command.taskId}, 'initial', ${command.kitIds.length ? "selection" : "task"}, '', ${codes.length}, ${actorId(context)})
            RETURNING *
          `;
          const batchIds = codes.map(() => batchId);
          await tx`
            INSERT INTO marking_phase1_print_items (batch_id, code_id, kit_id, label_type)
            SELECT * FROM unnest(${batchIds}::text[], ${codes.map((row) => row.id)}::text[], ${codes.map((row) => row.kit_id)}::text[], ${codes.map((row) => row.code_type)}::text[])
          `;
          await tx`UPDATE marking_phase1_kits SET print_state = 'awaiting_confirmation' WHERE id = ANY(${selectedKitIds}::text[])`;
          const revision = number(task.revision) + 1;
          await tx`UPDATE marking_phase1_tasks SET revision = ${revision}, updated_by = ${actorId(context)}, updated_at = now() WHERE id = ${command.taskId}`;
          await writeAudit(tx, { taskId: command.taskId, type: "print_batch_requested", actor: actorId(context), revision, relatedEntityId: batchId, payload: { kitCount: kits.length, labelCount: codes.length } });
          return { ok: true, phase: "phase1", stateScope: "test-state", taskId: command.taskId, revision, batch: batchView({ ...batches[0], kit_count: kits.length }), kitCount: kits.length };
        },
      });
    },

    async resolvePrintBatch(input = {}) {
      const command = normalizeMarkingPhase1PrintResult(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: `print-${command.result}`,
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          const batches = await tx`SELECT * FROM marking_phase1_print_batches WHERE id = ${command.batchId} AND task_id = ${command.taskId} FOR UPDATE`;
          const batch = batches[0];
          if (!batch) throw new MarkingPhase1RepositoryError("Print batch was not found", "marking-print-batch-not-found", 404);
          if (batch.print_state !== "awaiting_confirmation") throw new MarkingPhase1RepositoryError("Print batch is already resolved", "marking-print-batch-resolved", 409);
          await tx`
            UPDATE marking_phase1_print_batches SET print_state = ${command.result}, resolved_by = ${actorId(context)}, resolved_at = now(), error_message = ${command.result === "error" ? command.errorMessage || "Print adapter error" : ""}
            WHERE id = ${command.batchId}
          `;
          if (command.result === "confirmed") {
            await tx`
              UPDATE marking_phase1_codes code SET ever_printed = TRUE, last_printed_at = now()
              FROM marking_phase1_print_items item
              WHERE item.batch_id = ${command.batchId} AND item.code_id = code.id
            `;
            await tx`
              UPDATE marking_phase1_kits kit SET
                print_state = CASE WHEN ${batch.print_mode} = 'reprint' THEN 'reprinted' ELSE 'confirmed' END,
                first_confirmed_at = coalesce(first_confirmed_at, now()), last_printed_at = now()
              WHERE kit.id IN (SELECT item.kit_id FROM marking_phase1_print_items item WHERE item.batch_id = ${command.batchId})
            `;
          } else {
            await tx`
              UPDATE marking_phase1_kits kit SET print_state = 'error'
              WHERE kit.id IN (SELECT item.kit_id FROM marking_phase1_print_items item WHERE item.batch_id = ${command.batchId})
                AND kit.print_state NOT IN ('confirmed', 'reprinted')
            `;
          }
          const revision = number(task.revision) + 1;
          await tx`UPDATE marking_phase1_tasks SET revision = ${revision}, updated_by = ${actorId(context)}, updated_at = now() WHERE id = ${command.taskId}`;
          await writeAudit(tx, { taskId: command.taskId, type: command.result === "confirmed" ? "print_batch_confirmed" : "print_batch_failed", actor: actorId(context), revision, relatedEntityId: command.batchId, payload: { errorMessage: command.errorMessage } });
          const batchKitCounts = await tx`SELECT count(DISTINCT kit_id)::integer AS kit_count FROM marking_phase1_print_items WHERE batch_id = ${command.batchId}`;
          return { ok: true, phase: "phase1", stateScope: "test-state", taskId: command.taskId, revision, batch: batchView({ ...batch, print_state: command.result, resolved_at: new Date(), error_message: command.errorMessage, kit_count: batchKitCounts[0]?.kit_count }) };
        },
      });
    },

    async reprint(input = {}) {
      const command = normalizeMarkingPhase1Reprint(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "reprint",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          let codes;
          let sourceBatchId = null;
          if (command.scopeType === "batch") {
            sourceBatchId = command.targetId;
            codes = await tx`
              SELECT code.* FROM marking_phase1_codes code
              JOIN marking_phase1_print_items item ON item.code_id = code.id
              WHERE item.batch_id = ${command.targetId} AND code.task_id = ${command.taskId} AND code.ever_printed = TRUE
              ORDER BY code.kit_id, code.code_type DESC, code.board_index
            `;
          } else if (command.scopeType === "kit") {
            codes = await tx`SELECT * FROM marking_phase1_codes WHERE task_id = ${command.taskId} AND kit_id = ${command.targetId} AND ever_printed = TRUE ORDER BY code_type DESC, board_index`;
          } else {
            codes = await tx`SELECT * FROM marking_phase1_codes WHERE task_id = ${command.taskId} AND id = ${command.targetId} AND code_type = ${command.scopeType} AND ever_printed = TRUE`;
          }
          if (!codes.length) throw new MarkingPhase1RepositoryError("Reprint target has no previously printed codes", "marking-reprint-target-empty", 409);
          const batchId = randomUUID();
          const rows = await tx`
            INSERT INTO marking_phase1_print_batches (id, task_id, source_batch_id, print_mode, scope_type, scope_target_id, item_count, requested_by)
            VALUES (${batchId}, ${command.taskId}, ${sourceBatchId}, 'reprint', ${command.scopeType}, ${command.targetId}, ${codes.length}, ${actorId(context)})
            RETURNING *
          `;
          await tx`
            INSERT INTO marking_phase1_print_items (batch_id, code_id, kit_id, label_type)
            SELECT * FROM unnest(${codes.map(() => batchId)}::text[], ${codes.map((row) => row.id)}::text[], ${codes.map((row) => row.kit_id)}::text[], ${codes.map((row) => row.code_type)}::text[])
          `;
          const revision = number(task.revision) + 1;
          await tx`UPDATE marking_phase1_tasks SET revision = ${revision}, updated_by = ${actorId(context)}, updated_at = now() WHERE id = ${command.taskId}`;
          await writeAudit(tx, { taskId: command.taskId, type: "reprint_requested", actor: actorId(context), revision, relatedEntityId: batchId, payload: { scopeType: command.scopeType, targetId: command.targetId, labelCount: codes.length } });
          return { ok: true, phase: "phase1", stateScope: "test-state", taskId: command.taskId, revision, batch: batchView({ ...rows[0], kit_count: new Set(codes.map((row) => row.kit_id)).size }) };
        },
      });
    },

    async completeTask(input = {}) {
      const command = normalizeMarkingPhase1Completion(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "complete",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          const counts = await selectTaskCounts(tx, command.taskId);
          assertMarkingPhase1Completable({ phase1State: task.phase1_state, kitCount: number(counts.kit_count), confirmedKitCount: number(counts.confirmed_kit_count) });
          const revision = number(task.revision) + 1;
          const rows = await tx`UPDATE marking_phase1_tasks SET phase1_state = 'completed', revision = ${revision}, completed_at = now(), updated_by = ${actorId(context)}, updated_at = now() WHERE id = ${command.taskId} RETURNING *`;
          await writeAudit(tx, { taskId: command.taskId, type: "task_completed", actor: actorId(context), revision, payload: { kitCount: number(counts.kit_count), boardCount: number(counts.board_count) } });
          return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(rows[0], counts) };
        },
      });
    },

    async transferTask(input = {}) {
      const command = normalizeMarkingPhase1Transfer(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "transfer",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          assertMarkingPhase1Transferable({ phase1State: task.phase1_state });
          const revision = number(task.revision) + 1;
          const rows = await tx`UPDATE marking_phase1_tasks SET phase1_state = 'transferred', next_work_center_id = ${command.nextWorkCenterId}, revision = ${revision}, transferred_at = now(), transfer_cancelled_at = NULL, updated_by = ${actorId(context)}, updated_at = now() WHERE id = ${command.taskId} RETURNING *`;
          await writeAudit(tx, { taskId: command.taskId, type: "task_transferred", actor: actorId(context), revision, payload: { nextWorkCenterId: command.nextWorkCenterId, productionStatusChanged: false } });
          return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(rows[0]) };
        },
      });
    },

    async cancelTransfer(input = {}) {
      const command = normalizeMarkingPhase1TransferCancellation(input);
      const context = { ...input, ...command };
      return runCommand(sql, {
        commandType: "cancel-transfer",
        input: context,
        execute: async (tx) => {
          const task = await selectTaskForUpdate(tx, command.taskId, actorEmployeeId(context));
          assertRevision(task, command.expectedRevision);
          assertMarkingPhase1TransferCancellable({ phase1State: task.phase1_state });
          const revision = number(task.revision) + 1;
          const rows = await tx`UPDATE marking_phase1_tasks SET phase1_state = 'completed', revision = ${revision}, transferred_at = NULL, transfer_cancelled_at = now(), updated_by = ${actorId(context)}, updated_at = now() WHERE id = ${command.taskId} RETURNING *`;
          await writeAudit(tx, { taskId: command.taskId, type: "transfer_cancelled", actor: actorId(context), revision, payload: { productionStatusChanged: false } });
          return { ok: true, phase: "phase1", stateScope: "test-state", task: taskView(rows[0]) };
        },
      });
    },

    async lookupCode(input = {}) {
      assertActor(input);
      const query = normalizeMarkingPhase1CodeLookup(input);
      const rows = await sql`
        SELECT code.*, kit.sequence_no, kit.print_state, kit.boards_per_kit,
          task.product_id, task.product_name, task.work_order_number, task.task_title,
          task.source_work_order_id, task.source_operation_id, task.source_work_center_id,
          task.phase1_state, task.revision
        FROM marking_phase1_codes code
        JOIN marking_phase1_kits kit ON kit.id = code.kit_id
        JOIN marking_phase1_tasks task ON task.id = code.task_id
        WHERE code.code_value = ${query.codeValue.toUpperCase()}
          AND task.assigned_employee_id = ${actorEmployeeId(input)}
        LIMIT 1
      `;
      if (!rows[0]) throw new MarkingPhase1RepositoryError("Code was not found for this employee", "marking-code-not-found", 404);
      const row = rows[0];
      const linked = await sql`SELECT id, code_value, code_type, board_index, ever_printed, last_printed_at FROM marking_phase1_codes WHERE kit_id = ${row.kit_id} ORDER BY code_type DESC, board_index LIMIT 500`;
      const history = await sql`
        SELECT batch.id, batch.print_mode, batch.print_state, batch.requested_at, batch.resolved_at
        FROM marking_phase1_print_items item
        JOIN marking_phase1_print_batches batch ON batch.id = item.batch_id
        WHERE item.code_id = ${row.id}
        ORDER BY batch.requested_at DESC, batch.id DESC LIMIT 50
      `;
      return {
        ok: true,
        phase: "phase1",
        stateScope: "test-state",
        code: { id: row.id, value: row.code_value, type: row.code_type, boardIndex: row.board_index, everPrinted: row.ever_printed === true, lastPrintedAt: iso(row.last_printed_at) },
        kit: { id: row.kit_id, sequence: number(row.sequence_no), state: row.print_state, boardsPerKit: number(row.boards_per_kit), codes: linked.map((item) => ({ id: item.id, value: item.code_value, type: item.code_type, boardIndex: item.board_index, everPrinted: item.ever_printed === true })) },
        task: { id: row.task_id, productId: row.product_id, productName: row.product_name, workOrderNumber: row.work_order_number, title: row.task_title, sourceWorkOrderId: row.source_work_order_id, sourceOperationId: row.source_operation_id, sourceWorkCenterId: row.source_work_center_id, state: row.phase1_state, revision: number(row.revision) },
        printHistory: history.map((item) => ({ id: item.id, mode: item.print_mode, state: item.print_state, requestedAt: iso(item.requested_at), resolvedAt: iso(item.resolved_at) })),
      };
    },

    async close() {
      if (ownsSql) await sql.end({ timeout: 5 });
    },
  };

  return Object.freeze(repository);
}

export function getMarkingPhase1RepositoryHttpStatus(error) {
  if (error instanceof MarkingPhase1ValidationError || error instanceof MarkingPhase1RepositoryError) return Number(error.statusCode || 500);
  return 500;
}
