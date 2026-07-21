#!/usr/bin/env node
import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { SYSTEM_DOMAIN_REGISTRY_NAMES, validateSystemDomains } from "../src/modules/system_domains/service.js";

export const DISPOSABLE_STRUCTURE_TOKEN_PATTERN = /^MOCK-QA-PSM-[A-Za-z0-9][A-Za-z0-9._-]{5,79}$/;
export const DISPOSABLE_STRUCTURE_CLEANUP_ACTOR = "root:disposable-structure-cleanup";
export const DISPOSABLE_STRUCTURE_REGISTRIES = Object.freeze([
  "orgUnits",
  "workCenters",
  "positions",
  "equipment",
  "employees",
  "responsibilityPolicies",
]);

const TOKEN_FIELDS = Object.freeze({
  orgUnits: ["id", "code", "name"],
  workCenters: ["id", "code", "name"],
  positions: ["id", "code", "name"],
  equipment: ["id", "code", "name"],
  employees: ["id", "personnelNumber", "displayName"],
  responsibilityPolicies: ["id"],
});

const REQUIRED_EXTERNAL_TABLES = Object.freeze([
  "work_orders",
  "work_order_operations",
  "planning_slots",
  "production_resources",
  "work_center_calendars",
  "shift_assignments",
  "shift_assignment_executors",
  "shift_carryovers",
]);
const OPTIONAL_EXTERNAL_TABLES = Object.freeze(["employee_auth_credentials"]);

function cleanupError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function rows(domains, registry) {
  return Array.isArray(domains?.registries?.[registry]) ? domains.registries[registry] : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsExactToken(value, token) {
  const candidate = text(value);
  if (!candidate) return false;
  const pattern = new RegExp(`(^|[^A-Za-z0-9._-])${escapePattern(token)}($|[^A-Za-z0-9._-])`);
  return pattern.test(candidate);
}

function rowHasToken(row, registry, token) {
  return (TOKEN_FIELDS[registry] || []).some((field) => containsExactToken(row?.[field], token))
    || Object.values(row?.sourceRef && typeof row.sourceRef === "object" ? row.sourceRef : {})
      .some((value) => containsExactToken(value, token));
}

function assertExactlyOne(items, code, message, details = {}) {
  if (items.length !== 1) throw cleanupError(code, message, { ...details, count: items.length });
  return items[0];
}

function capturedKey(registry, id) {
  return `${registry}:${text(id)}`;
}

function reference(registry, row, field, targetRegistry, targetId, extra = {}) {
  const id = text(targetId);
  return id ? {
    registry,
    rowId: text(row?.id),
    field,
    targetRegistry,
    targetId: id,
    ...extra,
  } : null;
}

function collectSystemDomainReferences(domains) {
  const references = [];
  const add = (value) => { if (value) references.push(value); };
  for (const row of rows(domains, "orgUnits")) {
    add(reference("orgUnits", row, "parentOrgUnitId", "orgUnits", row.parentOrgUnitId));
  }
  for (const row of rows(domains, "workCenters")) {
    add(reference("workCenters", row, "orgUnitId", "orgUnits", row.orgUnitId));
    add(reference("workCenters", row, "parentWorkCenterId", "workCenters", row.parentWorkCenterId));
  }
  for (const row of rows(domains, "positions")) {
    add(reference("positions", row, "orgUnitId", "orgUnits", row.orgUnitId));
    add(reference("positions", row, "workCenterId", "workCenters", row.workCenterId));
  }
  for (const row of rows(domains, "employmentAssignments")) {
    add(reference("employmentAssignments", row, "employeeId", "employees", row.employeeId));
    add(reference("employmentAssignments", row, "positionId", "positions", row.positionId));
    add(reference("employmentAssignments", row, "orgUnitId", "orgUnits", row.orgUnitId));
    add(reference("employmentAssignments", row, "workCenterId", "workCenters", row.workCenterId));
  }
  for (const row of rows(domains, "equipment")) {
    add(reference("equipment", row, "orgUnitId", "orgUnits", row.orgUnitId));
    add(reference("equipment", row, "workCenterId", "workCenters", row.workCenterId));
  }
  for (const row of rows(domains, "scheduleAssignments")) {
    add(reference("scheduleAssignments", row, "employeeId", "employees", row.employeeId));
  }
  for (const row of rows(domains, "attendanceEvents")) {
    add(reference("attendanceEvents", row, "employeeId", "employees", row.employeeId));
  }
  for (const row of rows(domains, "roleAssignments")) {
    add(reference("roleAssignments", row, "employeeId", "employees", row.employeeId || row.subjectId));
  }
  for (const row of rows(domains, "responsibilityPolicies")) {
    add(reference("responsibilityPolicies", row, "subjectEmployeeId", "employees", row.subjectEmployeeId));
    for (const employeeId of Array.isArray(row.targetEmployeeIds) ? row.targetEmployeeIds : []) {
      add(reference("responsibilityPolicies", row, "targetEmployeeIds", "employees", employeeId));
    }
  }
  for (const row of rows(domains, "grants")) {
    const type = text(row.resourceType).toLowerCase();
    const targetRegistry = ["workcenter", "work-center"].includes(type)
      ? "workCenters"
      : ["department", "orgunit", "org-unit"].includes(type)
        ? "orgUnits"
        : ["employee", "subject"].includes(type)
          ? "employees"
          : "";
    if (targetRegistry) add(reference("grants", row, "resourceId", targetRegistry, row.resourceId));
  }
  return references;
}

export function captureDisposableStructure(domains, token) {
  if (!DISPOSABLE_STRUCTURE_TOKEN_PATTERN.test(text(token))) {
    throw cleanupError("invalid-token", "Cleanup token must match MOCK-QA-PSM-... exactly");
  }
  const captured = {};
  for (const registry of DISPOSABLE_STRUCTURE_REGISTRIES.filter((name) => name !== "responsibilityPolicies")) {
    const matches = rows(domains, registry).filter((row) => rowHasToken(row, registry, token));
    captured[registry] = assertExactlyOne(
      matches,
      "ambiguous-token-match",
      `Expected exactly one ${registry} row carrying the exact cleanup token`,
      { registry },
    );
  }

  const employeeId = text(captured.employees.id);
  const policyMatches = rows(domains, "responsibilityPolicies").filter((row) => (
    text(row.subjectEmployeeId) === employeeId || rowHasToken(row, "responsibilityPolicies", token)
  ));
  captured.responsibilityPolicies = assertExactlyOne(
    policyMatches,
    "ambiguous-responsibility-policy",
    "Expected exactly one Responsibility Policy owned by the disposable employee",
    { registry: "responsibilityPolicies", employeeId },
  );
  if (text(captured.responsibilityPolicies.subjectEmployeeId) !== employeeId) {
    throw cleanupError(
      "responsibility-policy-owner-mismatch",
      "The token-matched Responsibility Policy is not owned by the disposable employee",
      { policyId: text(captured.responsibilityPolicies.id), employeeId },
    );
  }

  const primaryAssignments = rows(domains, "employmentAssignments")
    .filter((row) => text(row.employeeId) === employeeId && row.isPrimary === true);
  captured.employmentAssignments = assertExactlyOne(
    primaryAssignments,
    "ambiguous-primary-assignment",
    "Expected exactly one primary Employment Assignment for the disposable employee",
    { registry: "employmentAssignments", employeeId },
  );

  const removalKeys = new Set([
    ...DISPOSABLE_STRUCTURE_REGISTRIES.map((registry) => capturedKey(registry, captured[registry].id)),
    capturedKey("employmentAssignments", captured.employmentAssignments.id),
  ]);
  const capturedTargetIds = new Map(DISPOSABLE_STRUCTURE_REGISTRIES
    .filter((registry) => registry !== "responsibilityPolicies")
    .map((registry) => [registry, text(captured[registry].id)]));

  const unexpectedReferences = collectSystemDomainReferences(domains).filter((item) => (
    capturedTargetIds.get(item.targetRegistry) === item.targetId
    && !removalKeys.has(capturedKey(item.registry, item.rowId))
  ));
  if (unexpectedReferences.length) {
    throw cleanupError(
      "unexpected-system-domain-reference",
      "Disposable rows are referenced outside the exact cleanup set",
      { references: unexpectedReferences.slice(0, 50) },
    );
  }

  const unexpectedTokenRows = SYSTEM_DOMAIN_REGISTRY_NAMES.flatMap((registry) => rows(domains, registry)
    .filter((row) => rowHasToken(row, registry, token))
    .filter((row) => !removalKeys.has(capturedKey(registry, row.id)))
    .map((row) => ({ registry, id: text(row.id) })));
  if (unexpectedTokenRows.length) {
    throw cleanupError(
      "unexpected-token-row",
      "The exact cleanup token is present on rows outside the supported disposable set",
      { rows: unexpectedTokenRows.slice(0, 50) },
    );
  }

  return Object.freeze({
    rows: captured,
    ids: Object.freeze(Object.fromEntries([
      ...DISPOSABLE_STRUCTURE_REGISTRIES.map((registry) => [registry, text(captured[registry].id)]),
      ["employmentAssignments", text(captured.employmentAssignments.id)],
    ])),
    removalKeys,
    unexpectedReferences: [],
  });
}

function registryCounts(domains) {
  return Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((registry) => [registry, rows(domains, registry).length]));
}

function removeCapturedRows(domains, capture) {
  const candidate = structuredClone(domains);
  for (const [registry, id] of Object.entries(capture.ids)) {
    candidate.registries[registry] = rows(candidate, registry).filter((row) => text(row.id) !== id);
  }
  const validation = validateSystemDomains(candidate);
  if (!validation.valid) {
    throw cleanupError(
      "cleanup-candidate-invalid",
      "Removing the exact disposable set would leave invalid System Domains",
      { errors: validation.errors.slice(0, 50) },
    );
  }
  return candidate;
}

function assertExactCountDelta(before, after) {
  const expected = new Set([...DISPOSABLE_STRUCTURE_REGISTRIES, "employmentAssignments"]);
  const deltas = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((registry) => [registry, before[registry] - after[registry]]));
  for (const [registry, delta] of Object.entries(deltas)) {
    const expectedDelta = expected.has(registry) ? 1 : 0;
    if (delta !== expectedDelta) {
      throw cleanupError(
        "unexpected-count-delta",
        "Cleanup changed a registry outside the exact disposable set",
        { registry, expectedDelta, actualDelta: delta },
      );
    }
  }
  return deltas;
}

function parseTablePresence(items = []) {
  return new Set(items.filter((item) => item?.present).map((item) => text(item.name)));
}

async function inspectExternalDependencies(tx, ids, tablePresence) {
  const workCenterId = ids.workCenters;
  const equipmentId = ids.equipment;
  const employeeId = ids.employees;
  const dependencies = [];

  const planning = await tx`
    SELECT 'planning-operation'::text AS kind, op.id, 'workCenterId'::text AS field
    FROM work_order_operations op
    WHERE op.work_center_id = ${workCenterId} OR op.next_work_center_id = ${workCenterId}
    UNION ALL
    SELECT 'planning-operation-resource'::text, op.id, 'resourceId'::text
    FROM work_order_operations op
    WHERE COALESCE(NULLIF(op.metadata ->> 'resourceId', ''), NULLIF(op.execution_context ->> 'resourceId', ''), '') = ${equipmentId}
    UNION ALL
    SELECT 'planning-slot-resource'::text, slot.id, 'resourceId'::text
    FROM planning_slots slot
    WHERE COALESCE(NULLIF(slot.metadata ->> 'resourceId', ''), '') = ${equipmentId}
    UNION ALL
    SELECT 'planning-resource'::text, resource.id, 'workCenterId/resourceId'::text
    FROM production_resources resource
    WHERE resource.id = ${equipmentId} OR resource.work_center_id = ${workCenterId}
    UNION ALL
    SELECT 'work-center-calendar'::text, calendar.work_center_id, 'workCenterId'::text
    FROM work_center_calendars calendar
    WHERE calendar.work_center_id = ${workCenterId}
    ORDER BY kind, id
    LIMIT 101`;
  planning.forEach((item) => dependencies.push({ owner: "planning", kind: text(item.kind), id: text(item.id), field: text(item.field) }));

  const shift = await tx`
    SELECT 'shift-assignment'::text AS kind, assignment.id, 'workCenterId/resourceId/masterId'::text AS field
    FROM shift_assignments assignment
    WHERE assignment.work_center_id = ${workCenterId}
      OR assignment.resource_id = ${equipmentId}
      OR assignment.master_id = ${employeeId}
    UNION ALL
    SELECT 'shift-executor'::text, executor.shift_assignment_id || ':' || executor.employee_id, 'employeeId'::text
    FROM shift_assignment_executors executor
    WHERE executor.employee_id = ${employeeId}
    UNION ALL
    SELECT 'shift-carryover'::text, carryover.id, 'workCenterId'::text
    FROM shift_carryovers carryover
    WHERE carryover.work_center_id = ${workCenterId}
    ORDER BY kind, id
    LIMIT 101`;
  shift.forEach((item) => dependencies.push({ owner: "shift-execution", kind: text(item.kind), id: text(item.id), field: text(item.field) }));

  if (tablePresence.has("employee_auth_credentials")) {
    const credentials = await tx`SELECT employee_id AS id FROM employee_auth_credentials WHERE employee_id = ${employeeId} LIMIT 2`;
    credentials.forEach((item) => dependencies.push({ owner: "employee-auth", kind: "credential", id: text(item.id), field: "employeeId" }));
  }
  return dependencies;
}

export async function withProductionDependencySnapshot({ databaseUrl }, action) {
  if (!databaseUrl) throw cleanupError("database-url-missing", "DATABASE_URL is required");
  if (typeof action !== "function") throw cleanupError("dependency-guard-invalid", "Dependency guard callback is required");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  try {
    return await sql.begin(async (tx) => {
      const tableNames = [...REQUIRED_EXTERNAL_TABLES, ...OPTIONAL_EXTERNAL_TABLES];
      const presenceRows = await tx`
        SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
        FROM unnest(${tableNames}::text[]) AS names(name)
        ORDER BY name`;
      const present = parseTablePresence(presenceRows);
      const missing = REQUIRED_EXTERNAL_TABLES.filter((name) => !present.has(name));
      if (missing.length) {
        throw cleanupError(
          "dependency-owner-unavailable",
          "Planning or Shift dependency tables are unavailable",
          { missingTables: missing },
        );
      }
      const lockTables = [...REQUIRED_EXTERNAL_TABLES, ...OPTIONAL_EXTERNAL_TABLES.filter((name) => present.has(name))];
      await tx.unsafe(`LOCK TABLE ${lockTables.map((name) => `\"${name}\"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
      return action({
        inspect: (ids) => inspectExternalDependencies(tx, ids, present),
        lockedTables: lockTables,
      });
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function buildIdempotencyKey(token) {
  const digest = createHash("sha256").update(token).digest("hex").slice(0, 32);
  return `root-psm-cleanup:${digest}`;
}

function assertEnvironment(env, uid) {
  if (uid !== 0) throw cleanupError("root-required", "Disposable Structure cleanup must run as root");
  if (text(env.APP_ENV).toLowerCase() !== "pilot") {
    throw cleanupError("pilot-required", "Disposable Structure cleanup is permitted only for the Pilot contour");
  }
  if (text(env.MES_DOMAIN_STORAGE).toLowerCase() !== "postgres") {
    throw cleanupError("postgres-storage-required", "MES_DOMAIN_STORAGE must be postgres");
  }
  if (!text(env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL)) {
    throw cleanupError("database-url-missing", "DATABASE_URL is required");
  }
}

export async function executeDisposableStructureCleanup({
  token,
  confirmToken,
  env = process.env,
  uid = typeof process.getuid === "function" ? process.getuid() : -1,
  repositoryFactory = createSystemDomainsRepository,
  dependencySnapshotRunner = withProductionDependencySnapshot,
} = {}) {
  const normalizedToken = text(token);
  if (!DISPOSABLE_STRUCTURE_TOKEN_PATTERN.test(normalizedToken)) {
    throw cleanupError("invalid-token", "Cleanup token must match MOCK-QA-PSM-... exactly");
  }
  if (text(confirmToken) !== normalizedToken) {
    throw cleanupError("confirmation-mismatch", "--confirm-token must exactly equal --token");
  }
  assertEnvironment(env, uid);
  const databaseUrl = text(env.DATABASE_URL || env.MES_DOMAIN_DATABASE_URL);
  const repository = repositoryFactory({ databaseUrl });
  if (!repository?.get || !repository?.getAuthority || !repository?.replace) {
    throw cleanupError("repository-unavailable", "System Domains PostgreSQL repository is unavailable");
  }
  const idempotencyKey = buildIdempotencyKey(normalizedToken);
  try {
    return await dependencySnapshotRunner({ databaseUrl }, async ({ inspect, lockedTables = [] } = {}) => {
      if (typeof inspect !== "function") {
        throw cleanupError("dependency-owner-unavailable", "Planning and Shift dependency inspector is unavailable");
      }
      const authority = await repository.getAuthority();
      if (authority?.mode !== "postgres-primary") {
        throw cleanupError(
          "postgres-primary-required",
          "System Domains must already be durable PostgreSQL-primary",
          { authorityMode: text(authority?.mode) },
        );
      }
      const current = await repository.get();
      if (!current?.item || !Number.isInteger(Number(current.revision)) || Number(current.revision) < 1 || !text(current.fingerprint)) {
        throw cleanupError("aggregate-unavailable", "Current System Domains aggregate revision/fingerprint is unavailable");
      }
      const capture = captureDisposableStructure(current.item, normalizedToken);
      const externalDependencies = await inspect(capture.ids);
      if (!Array.isArray(externalDependencies)) {
        throw cleanupError("dependency-owner-unavailable", "Dependency inspector returned an invalid result");
      }
      if (externalDependencies.length) {
        throw cleanupError(
          "unexpected-external-reference",
          "Disposable rows are still referenced by Planning, Shift or employee authentication",
          { dependencies: externalDependencies.slice(0, 100) },
        );
      }

      const fresh = await repository.get();
      if (Number(fresh?.revision) !== Number(current.revision) || text(fresh?.fingerprint) !== text(current.fingerprint)) {
        throw cleanupError(
          "aggregate-changed",
          "System Domains changed during cleanup preflight; inspect again from the new revision",
          { expectedRevision: Number(current.revision), actualRevision: Number(fresh?.revision || 0) },
        );
      }
      const freshCapture = captureDisposableStructure(fresh.item, normalizedToken);
      if (JSON.stringify(freshCapture.ids) !== JSON.stringify(capture.ids)) {
        throw cleanupError("capture-changed", "Disposable row identity changed during cleanup preflight");
      }
      const beforeCounts = registryCounts(fresh.item);
      const candidate = removeCapturedRows(fresh.item, freshCapture);
      const candidateCounts = registryCounts(candidate);
      const countDelta = assertExactCountDelta(beforeCounts, candidateCounts);
      const commitAuthority = await repository.getAuthority();
      if (commitAuthority?.mode !== "postgres-primary") {
        throw cleanupError(
          "postgres-primary-changed",
          "System Domains left PostgreSQL-primary during cleanup preflight",
          { authorityMode: text(commitAuthority?.mode) },
        );
      }
      const result = await repository.replace(candidate, {
        source: "root:disposable-production-structure-cleanup",
        expectedRevision: Number(fresh.revision),
        actorId: DISPOSABLE_STRUCTURE_CLEANUP_ACTOR,
        commandType: "cleanup_disposable_production_structure",
        idempotencyKey,
      });
      if (result?.conflict === true) {
        throw cleanupError(
          "aggregate-conflict",
          "System Domains revision changed before cleanup commit",
          { expectedRevision: Number(fresh.revision), actualRevision: Number(result.revision || 0) },
        );
      }
      if (result?.imported !== true || result?.replayed === true || Number(result.revision) !== Number(fresh.revision) + 1) {
        throw cleanupError(
          "commit-not-confirmed",
          "System Domains repository did not confirm exactly one fresh cleanup revision",
          { result },
        );
      }
      const after = await repository.get();
      if (Number(after?.revision) !== Number(result.revision)
        || !after?.item
        || !text(after.fingerprint)
        || text(after.fingerprint) !== text(result.fingerprint)) {
        throw cleanupError("readback-failed", "Cleanup revision was not confirmed by authoritative read-back");
      }
      for (const [registry, id] of Object.entries(freshCapture.ids)) {
        if (rows(after.item, registry).some((row) => text(row.id) === id)) {
          throw cleanupError("cleanup-residue", "An exact disposable row remains after cleanup", { registry, id });
        }
      }
      const afterCounts = registryCounts(after.item);
      assertExactCountDelta(beforeCounts, afterCounts);
      return Object.freeze({
        ok: true,
        operation: "system-domains-disposable-structure-cleanup",
        contour: "pilot",
        token: normalizedToken,
        authority: "postgres-primary",
        actorId: DISPOSABLE_STRUCTURE_CLEANUP_ACTOR,
        idempotencyKey,
        committed: true,
        revision: { before: Number(fresh.revision), after: Number(after.revision) },
        fingerprint: { before: text(fresh.fingerprint), after: text(after.fingerprint) },
        removed: Object.fromEntries(Object.entries(freshCapture.ids).map(([registry, id]) => [registry, { count: 1, id }])),
        counts: { before: beforeCounts, after: afterCounts, removed: countDelta },
        dependencyProof: {
          systemDomainReferences: 0,
          externalReferences: 0,
          lockedTables: [...lockedTables],
        },
      });
    });
  } finally {
    await repository.close?.();
  }
}

function parseCli(argv) {
  const options = {};
  for (const argument of argv) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw cleanupError("invalid-arguments", "Usage: --token=MOCK-QA-PSM-... --confirm-token=MOCK-QA-PSM-...");
    }
    const [key, ...parts] = argument.slice(2).split("=");
    if (!["token", "confirm-token"].includes(key) || Object.prototype.hasOwnProperty.call(options, key)) {
      throw cleanupError("invalid-arguments", `Unknown or repeated argument: --${key}`);
    }
    options[key] = parts.join("=");
  }
  if (Object.keys(options).length !== 2) {
    throw cleanupError("invalid-arguments", "Both --token and --confirm-token are required");
  }
  return { token: options.token, confirmToken: options["confirm-token"] };
}

async function assertSealedActiveEntrypoint(env = process.env) {
  const sealedApp = text(env.MES_DISPOSABLE_STRUCTURE_CLEANUP_SEALED_APP);
  const releaseId = text(env.MES_DISPOSABLE_STRUCTURE_CLEANUP_RELEASE_ID);
  if (!sealedApp || !/^[A-Za-z0-9._-]{1,96}$/.test(releaseId)) {
    throw cleanupError("sealed-release-required", "Use the sealed active-release cleanup wrapper");
  }
  const expectedScript = await realpath(join(resolve(sealedApp), "scripts", "system-domains-disposable-structure-cleanup.mjs"));
  const invokedScript = await realpath(process.argv[1]);
  if (expectedScript !== invokedScript) {
    throw cleanupError("sealed-release-required", "Cleanup CLI is not running from the verified active release");
  }
  const scriptStats = await stat(invokedScript);
  if (scriptStats.uid !== 0 || (scriptStats.mode & 0o022) !== 0) {
    throw cleanupError("sealed-release-required", "Cleanup CLI must be root-owned and not group/world-writable");
  }
}

function isEntrypoint() {
  const invoked = process.argv[1];
  return Boolean(invoked && resolve(invoked) === resolve(fileURLToPath(import.meta.url)));
}

if (isEntrypoint()) {
  try {
    if (typeof process.getuid !== "function" || process.getuid() !== 0) {
      throw cleanupError("root-required", "Disposable Structure cleanup must run as root");
    }
    await assertSealedActiveEntrypoint();
    const args = parseCli(process.argv.slice(2));
    const receipt = await executeDisposableStructureCleanup(args);
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: text(error?.code) || "cleanup-failed",
      error: text(error?.message) || "Disposable Structure cleanup failed",
      details: error?.details && typeof error.details === "object" ? error.details : {},
    })}\n`);
    process.exitCode = 1;
  }
}
