import assert from "node:assert/strict";

import { buildShiftIssueReportCommand } from "../src/domain/shift_execution_assignment.js";
import { createShiftExecutionCommandRepository, createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";

const calls = [];
let executorPresent = true;
let replayRow = null;
let assignmentRevision = 4;

const sql = (strings, ...values) => {
  const query = strings.join("?").replace(/\s+/gu, " ").trim();
  calls.push({ query, values });
  if (/pg_advisory_xact_lock/u.test(query)) return Promise.resolve([]);
  if (/FROM shift_execution_report_requests AS request/u.test(query)) return Promise.resolve(replayRow ? [replayRow] : []);
  if (/FROM shift_assignments WHERE id = \? FOR SHARE/u.test(query)) return Promise.resolve([{ id: values[0], revision: assignmentRevision, work_order_id: "WO-1", work_order_operation_id: "OP-1", work_center_id: "WC-A" }]);
  if (/FROM shift_assignment_executors/u.test(query)) return Promise.resolve(executorPresent ? [{ employee_id: values[1] }] : []);
  if (/INSERT INTO shift_issue_reports/u.test(query)) return Promise.resolve([{
    id: values[0], shift_assignment_id: values[1], assignment_revision: values[2], work_order_id: values[3], work_order_operation_id: values[4], work_center_id: values[5],
    actor_employee_id: values[6], actor_display_name: values[7], description: values[8], photo_payload: values[9], status: values[10], created_at: new Date("2026-07-22T08:00:00.000Z"),
  }]);
  if (/INSERT INTO shift_execution_report_requests/u.test(query)) return Promise.resolve([]);
  throw new Error(`Unexpected SQL: ${query}`);
};
sql.json = (value) => value;
sql.begin = async (callback) => callback(sql);

const repository = createShiftExecutionCommandRepository({
  sql,
  authorityGuard: async () => {},
  resourceDependencyLock: async () => {},
  resourceDependencyGuard: async () => {},
});
const input = {
  idempotencyKey: "report-request-1",
  assignmentId: "assignment-1",
  expectedRevision: 4,
  expectedWorkOrderId: "WO-1",
  expectedOperationId: "OP-1",
  text: "Проверить пайку",
  photo: { name: "issue.jpg", type: "image/jpeg", size: 4, source: "camera", dataUrl: "data:image/jpeg;base64,QUJD", storageNote: "" },
  actorId: "employee:employee-1",
  actorEmployeeId: "employee-1",
  actorDisplayName: "Исполнитель QA",
  authorizedWorkCenterId: "WC-A",
};

const created = await repository.recordIssueReport(input);
assert.equal(created.created, true);
assert.equal(created.item?.assignmentId, "assignment-1");
assert.equal(created.item?.assignmentRevision, 4);
assert.equal(created.item?.workOrderId, "WO-1");
assert.equal(created.item?.employeeId, "employee-1");
assert.equal(created.item?.text, "Проверить пайку");
assert(calls.some(({ query }) => /FROM shift_assignment_executors/u.test(query)), "report owner must prove executor membership in PostgreSQL");
assert(calls.some(({ query }) => /INSERT INTO shift_execution_report_requests/u.test(query)), "report owner must commit an idempotency receipt");
const lockIndex = calls.findIndex(({ query }) => /pg_advisory_xact_lock/u.test(query));
const replayIndex = calls.findIndex(({ query }) => /FROM shift_execution_report_requests AS request/u.test(query));
assert(lockIndex >= 0 && replayIndex > lockIndex, "idempotency key must be transactionally serialized before replay inspection");

const canonical = buildShiftIssueReportCommand(input);
replayRow = {
  request_fingerprint: canonical.requestFingerprint,
  actor_id: input.actorId,
  id: canonical.report.id,
  shift_assignment_id: input.assignmentId,
  assignment_revision: input.expectedRevision,
  work_order_id: "WO-1",
  work_order_operation_id: "OP-1",
  work_center_id: "WC-A",
  actor_employee_id: input.actorEmployeeId,
  actor_display_name: input.actorDisplayName,
  description: input.text,
  photo_payload: input.photo,
  status: "new",
  created_at: new Date("2026-07-22T08:00:00.000Z"),
  current_work_center_id: "WC-A",
};
const replay = await repository.recordIssueReport(input);
assert.equal(replay.created, false);
assert.equal(replay.item?.id, created.item?.id, "same actor/key/payload must return the canonical report without another insert");

await assert.rejects(
  () => repository.recordIssueReport({ ...input, actorId: "employee:employee-2" }),
  /already used/u,
  "another actor must not replay the first actor's idempotency receipt",
);

replayRow = null;
assignmentRevision = 5;
const stale = await repository.recordIssueReport({ ...input, idempotencyKey: "report-request-stale" });
assert.equal(stale.conflict, true);
assert.equal(stale.current?.revision, 5, "stale Report command must return the current assignment revision without inserting");
assignmentRevision = 4;
executorPresent = false;
await assert.rejects(
  () => repository.recordIssueReport({ ...input, idempotencyKey: "report-request-2" }),
  (error) => error?.code === "SHIFT_EXECUTION_REPORT_ACTOR_NOT_EXECUTOR",
  "an authenticated employee outside the canonical assignment must fail closed",
);

console.log("Shift execution issue-report owner QA: OK");

let readMembership = true;
const readCalls = [];
const readSql = (strings, ...values) => {
  const query = strings.join("?").replace(/\s+/gu, " ").trim();
  readCalls.push({ query, values });
  if (/JOIN shift_assignment_executors AS executor/u.test(query)) {
    return Promise.resolve(readMembership ? [{ id: values[0], work_center_id: "WC-A" }] : []);
  }
  if (/FROM shift_issue_reports/u.test(query)) {
    return Promise.resolve([{
      id: "report-read-1", shift_assignment_id: values[0], assignment_revision: 4,
      work_order_id: "WO-1", work_order_operation_id: "OP-1", work_center_id: "WC-A", actor_employee_id: "employee-1",
      actor_display_name: "Исполнитель QA", description: "Проверить пайку", photo_payload: {},
      status: "new", created_at: new Date("2026-07-22T08:00:00.000Z"),
    }]);
  }
  throw new Error(`Unexpected report read SQL: ${query}`);
};
const readRepository = createShiftExecutionReadRepository({ sql: readSql });
const read = await readRepository.listIssueReports({
  assignmentId: "assignment-1",
  actorEmployeeId: "employee-1",
  authorizedWorkCenterId: "WC-A",
});
assert.equal(read.items?.[0]?.id, "report-read-1");
assert.equal(read.items?.[0]?.assignmentRevision, 4);
assert.equal(read.items?.[0]?.workOrderId, "WO-1");
assert.equal(read.items?.[0]?.operationId, "OP-1");
assert.equal(read.items?.[0]?.workCenterId, "WC-A");
assert.equal(readCalls.length, 2, "signed report read must prove assignment membership before loading content");
assert.match(readCalls[1].query, /ORDER BY created_at DESC, id DESC LIMIT/u);
assert.equal(readCalls[1].values.at(-1), 8, "report content read must remain bounded to eight records");
readMembership = false;
await assert.rejects(
  () => readRepository.listIssueReports({ assignmentId: "assignment-1", actorEmployeeId: "employee-2", authorizedWorkCenterId: "WC-A" }),
  (error) => error?.code === "SHIFT_EXECUTION_REPORT_ACTOR_NOT_EXECUTOR",
  "report content must remain unavailable to a signed non-executor",
);

console.log("Shift execution issue-report signed read QA: OK");
