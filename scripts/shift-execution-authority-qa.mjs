import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectShiftExecutionAuthority, partitionResolvablePayload, writeShiftExecutionAuthorityExport } from "./domain-shift-execution-authority.mjs";
import { assertShiftExecutionCommandAuthorityWritable } from "./domain-shift-execution-repository.mjs";

function assert(value, message) { if (!value) throw new Error(message); }

const directory = await mkdtemp(join(tmpdir(), "mes-shift-authority-qa-"));
const filePath = join(directory, "shared-state.json");
const digest = "b".repeat(64);
const authority = {
  mode: "postgres-primary",
  transitionId: "shift-authority-qa",
  sourceSnapshotVersion: 12,
  sourceDigest: digest,
  sourceCounts: { assignments: 4, executors: 4, facts: 0, carryovers: 0 },
  sourceExportPath: "/srv/mes/pilot/backups/qa.json",
  activatedAt: "2026-07-18T00:00:00.000Z",
};
const primary = { getAuthority: async () => authority };

try {
  const secureExportPath = join(directory, "shift-execution-export.json");
  await writeShiftExecutionAuthorityExport(secureExportPath, {
    schemaVersion: "008_shift_execution_read_model",
    shiftAssignments: [],
    shiftAssignmentExecutors: [],
    shiftFacts: [],
    shiftCarryovers: [],
  });
  const secureExportStat = await stat(secureExportPath);
  assert((secureExportStat.mode & 0o777) === 0o600, "Shift Execution compatibility exports must be owner-readable only");

  await writeFile(filePath, JSON.stringify({
    version: 13,
    values: {},
    sharedUi: { shiftMasterBoardLaneBySlot: { row: "assigned" } },
    shiftExecutionRetirement: {
      transitionId: authority.transitionId,
      sourceDigest: digest,
      sourceSnapshotVersion: 12,
      retiredAt: "2026-07-18T00:00:01.000Z",
    },
  }));
  const ready = await inspectShiftExecutionAuthority({ primary, filePath, env: {} });
  assert(ready.serverAuthoritative === true && ready.compatibility?.retired === true, "matching PostgreSQL and shared-state markers must prove server authority");

  await writeFile(filePath, JSON.stringify({
    version: 14,
    values: {},
    sharedUi: { shiftMasterBoardAssignments: { row: {} } },
    shiftExecutionRetirement: {
      transitionId: authority.transitionId,
      sourceDigest: digest,
      sourceSnapshotVersion: 12,
    },
  }));
  const revived = await inspectShiftExecutionAuthority({ primary, filePath, env: {} });
  assert(revived.serverAuthoritative === false && revived.reason === "compatibility-shared-ui-active", "revived compatibility maps must fail the authority proof");

  const pending = await inspectShiftExecutionAuthority({ primary: { getAuthority: async () => ({ ...authority, mode: "transition-pending" }) }, filePath, env: {} });
  assert(pending.serverAuthoritative === false && pending.reason === "authority-transition-pending", "a pending database marker must fail closed");

  const guardCalls = [];
  const makeTx = (mode) => async (strings) => {
    const query = strings.join("");
    guardCalls.push(query);
    if (/SELECT mode FROM shift_execution_authority/.test(query)) return mode ? [{ mode }] : [];
    return [];
  };
  await assertShiftExecutionCommandAuthorityWritable(makeTx("postgres-primary"));
  let pendingError = null;
  try { await assertShiftExecutionCommandAuthorityWritable(makeTx("transition-pending")); }
  catch (error) { pendingError = error; }
  assert(pendingError?.code === "SHIFT_EXECUTION_AUTHORITY_TRANSITION_PENDING", "commands must stop while the authority transition is pending");
  assert(guardCalls.some((query) => /pg_advisory_xact_lock_shared/.test(query)), "commands must share the cutover advisory lock");

  const source = {
    schemaVersion: "008_shift_execution_read_model",
    shiftAssignments: [
      { id: "active", work_order_id: "wo", work_order_operation_id: "op" },
      { id: "legacy", work_order_id: "legacy-wo", work_order_operation_id: "legacy-op" },
    ],
    shiftAssignmentExecutors: [
      { shift_assignment_id: "active", employee_id: "a" },
      { shift_assignment_id: "legacy", employee_id: "b" },
    ],
    shiftFacts: [{ id: "legacy-fact", shift_assignment_id: "legacy" }],
    shiftCarryovers: [],
  };
  const referenceTx = async (strings, ...values) => (
    /FROM work_order_operations/.test(strings.join("")) && values[0] === "op" && values[1] === "wo" ? [{ id: "op" }] : []
  );
  const partition = await partitionResolvablePayload(referenceTx, source);
  assert(partition.active.shiftAssignments.map((row) => row.id).join() === "active", "resolvable assignments must stay in the active import");
  assert(partition.archived.shiftAssignments.map((row) => row.id).join() === "legacy" && partition.archived.shiftFacts.length === 1, "orphan legacy aggregates must be archived without losing dependent facts");

  const authoritySource = await readFile(new URL("./domain-shift-execution-authority.mjs", import.meta.url), "utf8");
  const authorityLockIndex = authoritySource.indexOf("mes:shift-execution-postgres-authority");
  const resourceLockIndex = authoritySource.indexOf("await acquireProductionResourceDependencySharedLock(tx)", authorityLockIndex);
  const tableLockIndex = authoritySource.indexOf("LOCK TABLE shift_assignments", resourceLockIndex);
  assert(authorityLockIndex >= 0 && resourceLockIndex > authorityLockIndex && tableLockIndex > resourceLockIndex,
    "Shift authority cutover must take authority -> production-resource -> table locks in the deadlock-safe order");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Shift execution PostgreSQL authority QA: OK");
