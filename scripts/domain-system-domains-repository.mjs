import { createHash } from "node:crypto";
import postgres from "postgres";
import { SYSTEM_DOMAIN_REGISTRY_NAMES, loadSystemDomains } from "../src/modules/system_domains/service.js";
import { inspectSystemDomainsSnapshotImportGuard } from "../src/modules/system_domains/snapshot_import_guard.js";

const SET_ID = "primary";
const AUTHORITY_ID = "primary";
const CLIENTS_BY_URL = new Map();

function getClient(databaseUrl) {
  const existing = CLIENTS_BY_URL.get(databaseUrl);
  if (existing) return existing;
  const client = postgres(databaseUrl, { max: 3, idle_timeout: 10, connect_timeout: 5, prepare: false });
  CLIENTS_BY_URL.set(databaseUrl, client);
  return client;
}

export async function closeSystemDomainsClients() {
  await Promise.all([...CLIENTS_BY_URL.values()].map((client) => client.end({ timeout: 5 })));
  CLIENTS_BY_URL.clear();
}
const text = (value) => String(value ?? "").trim();
const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null;
const dateText = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : text(value);
const timestamp = (value) => text(value) && !Number.isNaN(Date.parse(text(value))) ? new Date(text(value)).toISOString() : null;
const integer = (value, fallback = 0) => Number.isInteger(Number(value)) ? Number(value) : fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const iso = (value) => value?.toISOString?.() || "";
const fingerprint = (domains) => `sha256:${createHash("sha256").update(JSON.stringify(domains)).digest("hex")}`;

function authorityState(row = null) {
  const mode = text(row?.mode);
  return {
    mode: mode === "postgres-primary" || mode === "transition-pending" ? mode : "compatibility-snapshot",
    transitionId: text(row?.transition_id),
    proofPostgresRevision: Number(row?.proof_postgres_revision || 0),
    proofPostgresFingerprint: text(row?.proof_postgres_fingerprint),
    proofSnapshotVersion: Number(row?.proof_snapshot_version || 0),
    proofSnapshotFingerprint: text(row?.proof_snapshot_fingerprint),
    actorId: text(row?.actor_id),
    startedAt: iso(row?.started_at),
    activatedAt: iso(row?.activated_at),
    updatedAt: iso(row?.updated_at),
  };
}

async function readAuthorityState(tx) {
  const [row] = await tx`
    SELECT mode, transition_id, proof_postgres_revision, proof_postgres_fingerprint,
      proof_snapshot_version, proof_snapshot_fingerprint, actor_id,
      started_at, activated_at, updated_at
    FROM system_domain_authority_state
    WHERE id = ${AUTHORITY_ID}`;
  return authorityState(row || null);
}

function rows(domains, name) { return Array.isArray(domains?.registries?.[name]) ? domains.registries[name] : []; }
function metadata(domains) { return domains?.metadata && typeof domains.metadata === "object" ? domains.metadata : {}; }

function normalizeInput(value) {
  const loaded = loadSystemDomains(typeof value === "string" ? value : JSON.stringify(value), { strict: true });
  if (!loaded.report.valid) throw new Error(`System Domains input is invalid: ${loaded.report.errors.map((item) => item.code).join(", ")}`);
  return loaded.domains;
}

function mapById(items) { return new Map(items.map((item) => [text(item.id), item]).filter(([id]) => id)); }

async function hasStoredDomainEntities(tx) {
  const [row] = await tx`
    SELECT
      EXISTS(SELECT 1 FROM system_org_units)
      OR EXISTS(SELECT 1 FROM system_work_centers)
      OR EXISTS(SELECT 1 FROM system_schedule_templates)
      OR EXISTS(SELECT 1 FROM system_positions)
      OR EXISTS(SELECT 1 FROM system_employees)
      OR EXISTS(SELECT 1 FROM system_employment_assignments)
      OR EXISTS(SELECT 1 FROM system_equipment)
      OR EXISTS(SELECT 1 FROM system_schedule_assignments)
      OR EXISTS(SELECT 1 FROM system_attendance_events)
      OR EXISTS(SELECT 1 FROM system_access_roles)
      OR EXISTS(SELECT 1 FROM system_access_grants)
      OR EXISTS(SELECT 1 FROM system_role_assignments)
      OR EXISTS(SELECT 1 FROM system_responsibility_policies)
      AS present`;
  return Boolean(row?.present);
}

async function insertAll(tx, domains) {
  for (const item of rows(domains, "orgUnits")) await tx`
    INSERT INTO system_org_units (id, code, name, kind, parent_org_unit_id, is_active, valid_from, valid_to, source_ref)
    VALUES (${text(item.id)}, ${text(item.code)}, ${text(item.name)}, ${text(item.kind)}, ${text(item.parentOrgUnitId) || null}, ${item.isActive !== false}, ${date(item.validFrom)}, ${date(item.validTo)}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "workCenters")) await tx`
    INSERT INTO system_work_centers (id, code, name, org_unit_id, parent_work_center_id, participates_in_planning, can_plan_directly, show_in_gantt, availability_source, is_active, source_ref)
    VALUES (${text(item.id)}, ${text(item.code)}, ${text(item.name)}, ${text(item.orgUnitId) || null}, ${text(item.parentWorkCenterId) || null}, ${Boolean(item.participatesInPlanning)}, ${Boolean(item.canPlanDirectly)}, ${item.showInGantt !== false}, ${text(item.availabilitySource)}, ${item.isActive !== false}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "scheduleTemplates")) await tx`
    INSERT INTO system_schedule_templates (id, code, label, start_time, end_time, subtract_lunch, pattern_offset, source)
    VALUES (${text(item.id)}, ${text(item.code)}, ${text(item.label || item.name)}, ${text(item.start)}, ${text(item.end)}, ${Boolean(item.subtractLunch)}, ${integer(item.patternOffset)}, ${text(item.source)})`;
  for (const item of rows(domains, "positions")) await tx`
    INSERT INTO system_positions (id, code, name, kind, org_unit_id, work_center_id, default_schedule_template_id, capabilities, operation_classes, is_active, source_ref)
    VALUES (${text(item.id)}, ${text(item.code)}, ${text(item.name)}, ${text(item.kind)}, ${text(item.orgUnitId) || null}, ${text(item.workCenterId) || null}, ${text(item.defaultScheduleTemplateId) || null}, ${tx.json(item.capabilities || {})}, ${text(item.operationClasses)}, ${item.isActive !== false}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "employees")) await tx`
    INSERT INTO system_employees (id, personnel_number, display_name, is_active, source_ref)
    VALUES (${text(item.id)}, ${text(item.personnelNumber)}, ${text(item.displayName)}, ${item.isActive !== false}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "employmentAssignments")) await tx`
    INSERT INTO system_employment_assignments (id, employee_id, position_id, org_unit_id, work_center_id, is_primary, valid_from, valid_to, source_ref)
    VALUES (${text(item.id)}, ${text(item.employeeId)}, ${text(item.positionId) || null}, ${text(item.orgUnitId) || null}, ${text(item.workCenterId) || null}, ${Boolean(item.isPrimary)}, ${date(item.validFrom)}, ${date(item.validTo)}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "equipment")) await tx`
    INSERT INTO system_equipment (id, code, name, org_unit_id, work_center_id, quantity, schedule_template_id, participates_in_planning, availability_source, is_active, source_ref)
    VALUES (${text(item.id)}, ${text(item.code)}, ${text(item.name)}, ${text(item.orgUnitId) || null}, ${text(item.workCenterId) || null}, ${Math.max(1, integer(item.quantity, 1))}, ${text(item.scheduleTemplateId) || null}, ${Boolean(item.participatesInPlanning)}, ${text(item.availabilitySource)}, ${item.isActive !== false}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "scheduleAssignments")) await tx`
    INSERT INTO system_schedule_assignments (id, employee_id, schedule_template_id, pattern_offset, valid_from, valid_to, source)
    VALUES (${text(item.id)}, ${text(item.employeeId)}, ${text(item.scheduleTemplateId)}, ${integer(item.patternOffset)}, ${date(item.validFrom)}, ${date(item.validTo)}, ${text(item.source)})`;
  for (const item of rows(domains, "attendanceEvents")) await tx`
    INSERT INTO system_attendance_events (id, employee_id, event_date, event_type, start_time, end_time, overtime_hours, comment, source_ref)
    VALUES (${text(item.id)}, ${text(item.employeeId)}, ${date(item.date)}, ${text(item.type || item.kind || "work")}, ${text(item.start || item.startTime)}, ${text(item.end || item.endTime)}, ${number(item.overtimeHours)}, ${text(item.comment)}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "accessRoles")) await tx`
    INSERT INTO system_access_roles (id, label, description, scope, default_module_id, icon, is_active, source_ref)
    VALUES (${text(item.id)}, ${text(item.label || item.name)}, ${text(item.description)}, ${text(item.scope || "factory")}, ${text(item.defaultModuleId || item.defaultModule)}, ${text(item.icon)}, ${item.isActive !== false}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "grants")) await tx`
    INSERT INTO system_access_grants (id, role_id, resource_type, resource_id, action_id, effect, source_ref)
    VALUES (${text(item.id)}, ${text(item.roleId)}, ${text(item.resourceType || "module")}, ${text(item.resourceId || item.moduleId)}, ${text(item.actionId || item.action)}, ${item.effect === "deny" ? "deny" : "allow"}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "roleAssignments")) await tx`
    INSERT INTO system_role_assignments (id, employee_id, role_id, source_ref)
    VALUES (${text(item.id)}, ${text(item.employeeId || item.subjectId)}, ${text(item.roleId)}, ${tx.json(item.sourceRef || {})})`;
  for (const item of rows(domains, "responsibilityPolicies")) {
    await tx`
      INSERT INTO system_responsibility_policies (id, subject_employee_id, mode, updated_at_source, is_active, archived_at, source_ref)
      VALUES (${text(item.id)}, ${text(item.subjectEmployeeId)}, ${text(item.mode)}, ${text(item.updatedAt)}, ${item.isActive !== false}, ${timestamp(item.archivedAt)}, ${tx.json(item.sourceRef || {})})`;
    for (const employeeId of [...new Set((item.targetEmployeeIds || []).map(text).filter(Boolean))].sort()) await tx`
      INSERT INTO system_responsibility_targets (policy_id, employee_id) VALUES (${text(item.id)}, ${employeeId})`;
  }
}

export function createSystemDomainsRepository({ databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "" } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for System Domains storage");
  const sql = getClient(databaseUrl);
  const storage = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...storage,
    async withExclusiveProjectionLock(action) {
      if (typeof action !== "function") throw new Error("System Domains projection lock requires an action callback");
      return sql.begin(async (tx) => {
        // Full projection commands use the same advisory lock in replace().
        // Promotion holds it while it obtains the final PostgreSQL reading and
        // swaps the compatibility snapshot, so a command cannot commit a new
        // revision between that proof and the snapshot write.
        await tx`SELECT pg_advisory_xact_lock(hashtext('mes-system-domains:primary'))`;
        return action();
      });
    },
    async replace(value, {
      source = "snapshot-import",
      force = false,
      expectedRevision = null,
      actorId = "",
      commandType = "replace_projection",
      idempotencyKey = "",
      snapshotImport = false,
      emergencySnapshotReplace = false,
    } = {}) {
      const domains = normalizeInput(value);
      const digest = fingerprint(domains);
      const result = await sql.begin(async (tx) => {
        // Every full-projection replacement acquires the same transaction lock.
        // This closes the empty-set gap where a row-level lock cannot exist yet,
        // and lets snapshot-import safety evaluate the exact state it will write.
        await tx`SELECT pg_advisory_xact_lock(hashtext('mes-system-domains:primary'))`;
        const normalizedIdempotencyKey = text(idempotencyKey);
        if (normalizedIdempotencyKey) {
          const prior = await tx`SELECT source_fingerprint, expected_revision, resulting_revision, actor_id FROM system_domain_command_requests WHERE idempotency_key = ${normalizedIdempotencyKey} FOR UPDATE`;
          if (prior[0]) {
            if (prior[0].source_fingerprint !== digest || Number(prior[0].expected_revision) !== Number(expectedRevision)
              || text(prior[0].actor_id) !== text(actorId)) {
              throw new Error("Idempotency key was already used for another System Domains command");
            }
            return { imported: false, replayed: true, conflict: false, revision: Number(prior[0].resulting_revision), fingerprint: digest };
          }
        }
        // A request may have passed HTTP preflight just before a root cutover
        // acquired the advisory lock. Re-read the durable authority *after*
        // taking that same lock, otherwise that admitted request can advance
        // the aggregate between the retirement proof and its tombstone write.
        const authority = await readAuthorityState(tx);
        if (authority.mode === "transition-pending") {
          const error = new Error("System Domains authority transition is pending; retry after it completes or is rolled back");
          error.code = "SYSTEM_DOMAINS_AUTHORITY_TRANSITION_PENDING";
          throw error;
        }
        // A legacy snapshot must never be allowed to repopulate a projection
        // once it is the durable primary. A separate disaster-recovery flow
        // would have to explicitly change authority first.
        if (snapshotImport && authority.mode === "postgres-primary") {
          const error = new Error("System Domains snapshot import is retired after PostgreSQL-primary cutover");
          error.code = "SYSTEM_DOMAINS_SNAPSHOT_IMPORT_RETIRED";
          throw error;
        }
        const current = await tx`SELECT source_fingerprint, revision FROM system_domain_sets WHERE id = ${SET_ID} FOR UPDATE`;
        const currentRevision = Number(current[0]?.revision || 0);
        if (expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
          return { imported: false, conflict: true, revision: currentRevision, fingerprint: current[0]?.source_fingerprint || "" };
        }
        let snapshotImportMode = "";
        if (snapshotImport) {
          const initialized = Boolean(current[0]) || await hasStoredDomainEntities(tx);
          const guard = inspectSystemDomainsSnapshotImportGuard({
            existingItem: initialized ? { id: SET_ID } : null,
            alreadyMatches: Boolean(current[0]) && current[0].source_fingerprint === digest,
            force,
            emergencyEnabled: emergencySnapshotReplace,
          });
          if (!guard.allowed) {
            const error = new Error(guard.reason);
            error.code = "SYSTEM_DOMAINS_SNAPSHOT_REPLACE_BLOCKED";
            throw error;
          }
          snapshotImportMode = guard.mode;
          if (guard.mode === "idempotent-import") {
            return { imported: false, replayed: false, conflict: false, revision: currentRevision, fingerprint: digest, mode: snapshotImportMode };
          }
        }
        if (!force && current[0]?.source_fingerprint === digest) return { imported: false, conflict: false, revision: currentRevision, fingerprint: digest };
        await tx`DELETE FROM system_responsibility_targets`;
        await tx`DELETE FROM system_responsibility_policies`;
        await tx`DELETE FROM system_role_assignments`;
        await tx`DELETE FROM system_access_grants`;
        await tx`DELETE FROM system_access_roles`;
        await tx`DELETE FROM system_attendance_events`;
        await tx`DELETE FROM system_schedule_assignments`;
        await tx`DELETE FROM system_equipment`;
        await tx`DELETE FROM system_employment_assignments`;
        await tx`DELETE FROM system_employees`;
        await tx`DELETE FROM system_positions`;
        await tx`DELETE FROM system_work_centers`;
        await tx`DELETE FROM system_org_units`;
        await tx`DELETE FROM system_schedule_templates`;
        await insertAll(tx, domains);
        const revision = Number(current[0]?.revision || 0) + 1;
        await tx`
          INSERT INTO system_domain_sets (id, schema_id, schema_version, source_fingerprint, source, metadata, migrated_at, revision, updated_at)
          VALUES (${SET_ID}, ${text(domains.schemaId)}, ${integer(domains.schemaVersion)}, ${digest}, ${text(source)}, ${tx.json(metadata(domains))}, ${timestamp(metadata(domains).migratedAt)}, ${revision}, now())
          ON CONFLICT (id) DO UPDATE SET schema_id = EXCLUDED.schema_id, schema_version = EXCLUDED.schema_version,
            source_fingerprint = EXCLUDED.source_fingerprint, source = EXCLUDED.source, metadata = EXCLUDED.metadata, migrated_at = EXCLUDED.migrated_at,
            revision = EXCLUDED.revision, updated_at = now()`;
        const [change] = await tx`
          INSERT INTO domain_change_log (aggregate_type, aggregate_id, aggregate_revision, command_type, payload, actor_id, snapshot_sync_state)
          VALUES ('system_domains', ${SET_ID}, ${revision}, ${text(commandType) || "replace_projection"}, ${tx.json({ fingerprint: digest, source: text(source) })}, ${text(actorId) || null}, 'pending')
          RETURNING id`;
        if (normalizedIdempotencyKey) await tx`
          INSERT INTO system_domain_command_requests (idempotency_key, source_fingerprint, expected_revision, resulting_revision, actor_id)
          VALUES (${normalizedIdempotencyKey}, ${digest}, ${Number(expectedRevision)}, ${revision}, ${text(actorId)})`;
        return { imported: true, replayed: false, conflict: false, revision, fingerprint: digest, changeId: Number(change.id), mode: snapshotImportMode || "apply" };
      });
      return { ...storage, ...result };
    },
    async get() {
      const [set] = await sql`SELECT schema_id, schema_version, source_fingerprint, source, metadata, migrated_at, revision, updated_at FROM system_domain_sets WHERE id = ${SET_ID}`;
      if (!set) return { ...storage, item: null, revision: 0, updatedAt: "" };
      const [orgUnits, workCenters, scheduleTemplates, positions, employees, employmentAssignments, equipment, scheduleAssignments, attendanceEvents, accessRoles, grants, roleAssignments, policies, targets] = await Promise.all([
        sql`SELECT * FROM system_org_units ORDER BY id`, sql`SELECT * FROM system_work_centers ORDER BY id`, sql`SELECT * FROM system_schedule_templates ORDER BY id`, sql`SELECT * FROM system_positions ORDER BY id`, sql`SELECT * FROM system_employees ORDER BY id`, sql`SELECT * FROM system_employment_assignments ORDER BY id`, sql`SELECT * FROM system_equipment ORDER BY id`, sql`SELECT * FROM system_schedule_assignments ORDER BY id`, sql`SELECT * FROM system_attendance_events ORDER BY id`, sql`SELECT * FROM system_access_roles ORDER BY id`, sql`SELECT * FROM system_access_grants ORDER BY id`, sql`SELECT * FROM system_role_assignments ORDER BY id`, sql`SELECT * FROM system_responsibility_policies ORDER BY id`, sql`SELECT * FROM system_responsibility_targets ORDER BY policy_id, employee_id`,
      ]);
      const targetIds = new Map(); targets.forEach((row) => targetIds.set(row.policy_id, [...(targetIds.get(row.policy_id) || []), row.employee_id]));
      const item = {
        schemaId: set.schema_id, schemaVersion: Number(set.schema_version), metadata: set.metadata || {},
        registries: {
          orgUnits: orgUnits.map((r) => ({ id:r.id, code:r.code, name:r.name, kind:r.kind, parentOrgUnitId:r.parent_org_unit_id || "", isActive:r.is_active, validFrom:dateText(r.valid_from), validTo:dateText(r.valid_to), sourceRef:r.source_ref || {} })),
          workCenters: workCenters.map((r) => ({ id:r.id, code:r.code, name:r.name, orgUnitId:r.org_unit_id || "", parentWorkCenterId:r.parent_work_center_id || "", participatesInPlanning:r.participates_in_planning, canPlanDirectly:r.can_plan_directly, showInGantt:r.show_in_gantt, availabilitySource:r.availability_source, isActive:r.is_active, sourceRef:r.source_ref || {} })),
          positions: positions.map((r) => ({ id:r.id, code:r.code, name:r.name, kind:r.kind, orgUnitId:r.org_unit_id || "", workCenterId:r.work_center_id || "", defaultScheduleTemplateId:r.default_schedule_template_id || "", capabilities:r.capabilities || {}, operationClasses:r.operation_classes, isActive:r.is_active, sourceRef:r.source_ref || {} })),
          employees: employees.map((r) => ({ id:r.id, personnelNumber:r.personnel_number, displayName:r.display_name, isActive:r.is_active, sourceRef:r.source_ref || {} })),
          employmentAssignments: employmentAssignments.map((r) => ({ id:r.id, employeeId:r.employee_id, positionId:r.position_id || "", orgUnitId:r.org_unit_id || "", workCenterId:r.work_center_id || "", isPrimary:r.is_primary, validFrom:dateText(r.valid_from), validTo:dateText(r.valid_to), sourceRef:r.source_ref || {} })),
          equipment: equipment.map((r) => ({ id:r.id, code:r.code, name:r.name, orgUnitId:r.org_unit_id || "", workCenterId:r.work_center_id || "", quantity:Number(r.quantity), scheduleTemplateId:r.schedule_template_id || "", participatesInPlanning:r.participates_in_planning, availabilitySource:r.availability_source, isActive:r.is_active, sourceRef:r.source_ref || {} })),
          // pattern_offset participates in the deterministic shift-cycle
          // calculation. It must survive the SQL round trip; omitting it
          // makes a healthy projection appear divergent from its snapshot
          // and changes the actual work calendar.
          scheduleTemplates: scheduleTemplates.map((r) => ({ id:r.id, code:r.code, label:r.label, start:r.start_time, end:r.end_time, subtractLunch:r.subtract_lunch, patternOffset:Number(r.pattern_offset), source:r.source })),
          scheduleAssignments: scheduleAssignments.map((r) => ({ id:r.id, employeeId:r.employee_id, scheduleTemplateId:r.schedule_template_id, patternOffset:Number(r.pattern_offset), validFrom:dateText(r.valid_from), validTo:dateText(r.valid_to), source:r.source })),
          attendanceEvents: attendanceEvents.map((r) => ({ id:r.id, employeeId:r.employee_id, date:dateText(r.event_date), type:r.event_type, start:r.start_time, end:r.end_time, overtimeHours:Number(r.overtime_hours), comment:r.comment, sourceRef:r.source_ref || {} })),
          accessRoles: accessRoles.map((r) => ({ id:r.id, label:r.label, description:r.description, scope:r.scope, defaultModuleId:r.default_module_id, icon:r.icon, isActive:r.is_active, sourceRef:r.source_ref || {} })),
          grants: grants.map((r) => ({ id:r.id, roleId:r.role_id, resourceType:r.resource_type, resourceId:r.resource_id, actionId:r.action_id, effect:r.effect, sourceRef:r.source_ref || {} })),
          roleAssignments: roleAssignments.map((r) => ({ id:r.id, employeeId:r.employee_id, roleId:r.role_id, sourceRef:r.source_ref || {} })),
          responsibilityPolicies: policies.map((r) => ({ id:r.id, subjectEmployeeId:r.subject_employee_id, mode:r.mode, targetEmployeeIds:targetIds.get(r.id) || [], updatedAt:r.updated_at_source, isActive:r.is_active, archivedAt:iso(r.archived_at), sourceRef:r.source_ref || {} })),
        },
      };
      return {
        ...storage,
        item: normalizeInput(item),
        revision: Number(set.revision),
        fingerprint: text(set.source_fingerprint),
        updatedAt: iso(set.updated_at),
      };
    },
    async summary() {
      // The readiness and navigation surfaces need counts, not all 1,000+
      // domain rows.  Keep the full projection in get(), but make its summary
      // a single compact SQL roundtrip.
      const [set, countRow] = await Promise.all([
        sql`SELECT revision, updated_at FROM system_domain_sets WHERE id = ${SET_ID}`.then((result) => result[0]),
        sql`
          SELECT
            (SELECT count(*) FROM system_org_units)::int AS org_units,
            (SELECT count(*) FROM system_work_centers)::int AS work_centers,
            (SELECT count(*) FROM system_schedule_templates)::int AS schedule_templates,
            (SELECT count(*) FROM system_positions)::int AS positions,
            (SELECT count(*) FROM system_employees)::int AS employees,
            (SELECT count(*) FROM system_employment_assignments)::int AS employment_assignments,
            (SELECT count(*) FROM system_equipment)::int AS equipment,
            (SELECT count(*) FROM system_schedule_assignments)::int AS schedule_assignments,
            (SELECT count(*) FROM system_attendance_events)::int AS attendance_events,
            (SELECT count(*) FROM system_access_roles)::int AS access_roles,
            (SELECT count(*) FROM system_access_grants)::int AS grants,
            (SELECT count(*) FROM system_role_assignments)::int AS role_assignments,
            (SELECT count(*) FROM system_responsibility_policies)::int AS responsibility_policies
        `.then((result) => result[0]),
      ]);
      if (!set) return { ...storage, revision: 0, updatedAt: "", configured: true, summary: { registryCounts: Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, 0])), totalRows: 0 } };
      const aliases = {
        orgUnits: "org_units", workCenters: "work_centers", scheduleTemplates: "schedule_templates", positions: "positions",
        employees: "employees", employmentAssignments: "employment_assignments", equipment: "equipment",
        scheduleAssignments: "schedule_assignments", attendanceEvents: "attendance_events", accessRoles: "access_roles",
        grants: "grants", roleAssignments: "role_assignments", responsibilityPolicies: "responsibility_policies",
      };
      const counts = Object.fromEntries(SYSTEM_DOMAIN_REGISTRY_NAMES.map((name) => [name, Number(countRow?.[aliases[name]] || 0)]));
      return { ...storage, revision: Number(set.revision), updatedAt: iso(set.updated_at), configured: true, summary: { registryCounts: counts, totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0) } };
    },
    async getAuthority() {
      return readAuthorityState(sql);
    },
    async inspectCommandReplay(value, { idempotencyKey = "", expectedRevision = null, actorId = "" } = {}) {
      const normalizedIdempotencyKey = text(idempotencyKey);
      if (!normalizedIdempotencyKey) return { found: false, matches: false };
      const domains = normalizeInput(value);
      const digest = fingerprint(domains);
      const [prior] = await sql`
        SELECT source_fingerprint, expected_revision, resulting_revision, actor_id
        FROM system_domain_command_requests
        WHERE idempotency_key = ${normalizedIdempotencyKey}`;
      if (!prior) return { found: false, matches: false };
      const matches = prior.source_fingerprint === digest
        && Number(prior.expected_revision) === Number(expectedRevision)
        && text(prior.actor_id) === text(actorId);
      return {
        found: true,
        matches,
        revision: Number(prior.resulting_revision || 0),
      };
    },
    async beginPostgresPrimaryTransition({
      transitionId = "",
      expectedRevision = 0,
      expectedFingerprint = "",
      proofSnapshotVersion = 0,
      proofSnapshotFingerprint = "",
      actorId = "",
    } = {}) {
      const normalizedTransitionId = text(transitionId);
      const normalizedFingerprint = text(expectedFingerprint);
      const normalizedSnapshotFingerprint = text(proofSnapshotFingerprint);
      if (!normalizedTransitionId || !Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) < 1
        || !normalizedFingerprint || !Number.isInteger(Number(proofSnapshotVersion)) || Number(proofSnapshotVersion) < 0
        || !normalizedSnapshotFingerprint) {
        throw new Error("A complete System Domains authority transition proof is required");
      }
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('mes-system-domains:primary'))`;
        const [set] = await tx`SELECT revision, source_fingerprint FROM system_domain_sets WHERE id = ${SET_ID} FOR UPDATE`;
        if (!set || Number(set.revision) !== Number(expectedRevision) || text(set.source_fingerprint) !== normalizedFingerprint) {
          throw new Error("PostgreSQL System Domains changed after the retirement proof; run a new dry run");
        }
        const current = await readAuthorityState(tx);
        if (current.mode === "postgres-primary") {
          if (current.proofPostgresRevision !== Number(expectedRevision)
            || current.proofPostgresFingerprint !== normalizedFingerprint) {
            throw new Error("System Domains is already PostgreSQL-primary under another transition proof");
          }
          return { ...current, started: false, alreadyActive: true };
        }
        if (current.mode === "transition-pending" && current.transitionId !== normalizedTransitionId) {
          throw new Error("Another System Domains authority transition is pending; resume or roll it back before starting a new one");
        }
        await tx`
          INSERT INTO system_domain_authority_state (
            id, mode, transition_id, proof_postgres_revision, proof_postgres_fingerprint,
            proof_snapshot_version, proof_snapshot_fingerprint, actor_id, started_at, activated_at, updated_at
          ) VALUES (
            ${AUTHORITY_ID}, 'transition-pending', ${normalizedTransitionId}, ${Number(expectedRevision)}, ${normalizedFingerprint},
            ${Number(proofSnapshotVersion)}, ${normalizedSnapshotFingerprint}, ${text(actorId) || null}, now(), null, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            mode = 'transition-pending', transition_id = EXCLUDED.transition_id,
            proof_postgres_revision = EXCLUDED.proof_postgres_revision,
            proof_postgres_fingerprint = EXCLUDED.proof_postgres_fingerprint,
            proof_snapshot_version = EXCLUDED.proof_snapshot_version,
            proof_snapshot_fingerprint = EXCLUDED.proof_snapshot_fingerprint,
            actor_id = EXCLUDED.actor_id, started_at = now(), activated_at = null, updated_at = now()`;
        const pending = await readAuthorityState(tx);
        return { ...pending, started: true, alreadyActive: false };
      });
    },
    async finalizePostgresPrimaryTransition({ transitionId = "", actorId = "" } = {}) {
      const normalizedTransitionId = text(transitionId);
      if (!normalizedTransitionId) throw new Error("System Domains authority transition ID is required");
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('mes-system-domains:primary'))`;
        const current = await readAuthorityState(tx);
        if (current.mode === "postgres-primary") {
          if (current.transitionId !== normalizedTransitionId) throw new Error("System Domains is PostgreSQL-primary under another transition proof");
          return { ...current, finalized: false, alreadyActive: true };
        }
        if (current.mode !== "transition-pending" || current.transitionId !== normalizedTransitionId) {
          throw new Error("System Domains authority transition is not pending for this proof");
        }
        const [set] = await tx`SELECT revision, source_fingerprint FROM system_domain_sets WHERE id = ${SET_ID} FOR UPDATE`;
        if (!set || Number(set.revision) !== current.proofPostgresRevision || text(set.source_fingerprint) !== current.proofPostgresFingerprint) {
          throw new Error("PostgreSQL System Domains changed while the authority transition was pending");
        }
        await tx`
          UPDATE system_domain_authority_state
          SET mode = 'postgres-primary', actor_id = ${text(actorId) || null}, activated_at = now(), updated_at = now()
          WHERE id = ${AUTHORITY_ID} AND transition_id = ${normalizedTransitionId}`;
        const active = await readAuthorityState(tx);
        return { ...active, finalized: true, alreadyActive: false };
      });
    },
    async abortPostgresPrimaryTransition({ transitionId = "" } = {}) {
      const normalizedTransitionId = text(transitionId);
      if (!normalizedTransitionId) throw new Error("System Domains authority transition ID is required");
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('mes-system-domains:primary'))`;
        const current = await readAuthorityState(tx);
        if (current.mode === "compatibility-snapshot") return { ...current, aborted: false, alreadyInactive: true };
        if (current.mode === "postgres-primary") throw new Error("A PostgreSQL-primary System Domains authority cannot be aborted by the transition rollback");
        if (current.transitionId !== normalizedTransitionId) throw new Error("Another System Domains authority transition is pending");
        await tx`DELETE FROM system_domain_authority_state WHERE id = ${AUTHORITY_ID} AND transition_id = ${normalizedTransitionId}`;
        return { ...authorityState(null), aborted: true, alreadyInactive: false };
      });
    },
    async listPendingSnapshotSyncs(limit = 20) {
      const rows = await sql`
        SELECT id, aggregate_revision, command_type, payload
        FROM domain_change_log
        WHERE aggregate_type = 'system_domains' AND aggregate_id = ${SET_ID} AND snapshot_sync_state = 'pending'
        ORDER BY id ASC LIMIT ${Math.max(1, Math.min(100, integer(limit, 20)))}`;
      return rows.map((row) => ({ id: Number(row.id), aggregateRevision: Number(row.aggregate_revision), commandType: row.command_type, payload: row.payload || {} }));
    },
    async markSnapshotSync(id, { state = "applied", error = "" } = {}) {
      const allowed = new Set(["pending", "applied", "conflict"]);
      if (!allowed.has(state)) throw new Error("Invalid System Domains snapshot sync state");
      await sql`
        UPDATE domain_change_log SET snapshot_sync_state = ${state}, snapshot_sync_error = ${text(error)}, snapshot_synced_at = ${state === "applied" ? new Date().toISOString() : null}
        WHERE id = ${Number(id)} AND aggregate_type = 'system_domains' AND aggregate_id = ${SET_ID}`;
    },
    async close() {},
  };
}
