import {
  PRODUCTION_STRUCTURE_MATRIX_ROWS,
} from "../src/production_structure_matrix_data.js";
import {
  SYSTEM_DOMAINS_SCHEMA_ID,
  SYSTEM_DOMAINS_SCHEMA_VERSION,
  loadSystemDomains,
  migrateLegacySystemDomains,
  serializeSystemDomains,
  validateSystemDomains,
} from "../src/modules/system_domains/service.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const sourceRowsSnapshot = JSON.stringify(PRODUCTION_STRUCTURE_MATRIX_ROWS);
const departmentRow = PRODUCTION_STRUCTURE_MATRIX_ROWS.find((row) => row.cells?.["Тип строки"] === "Отдел");
assert(departmentRow, "Production structure fixture must contain a department.");

const baseline = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const supervisorPosition = baseline.domains.registries.positions.find((position) => position.kind === "supervisor");
const supervisorAssignment = baseline.domains.registries.employmentAssignments.find((assignment) => assignment.positionId === supervisorPosition?.id);
const masterId = supervisorAssignment?.employeeId || "";
const executorId = baseline.domains.registries.employmentAssignments
  .find((assignment) => assignment.employeeId !== masterId && assignment.positionId && assignment.orgUnitId)?.employeeId || "";
assert(masterId && executorId, "Production structure fixture must contain a supervisor and another employee.");

const matrixOverrides = {
  [departmentRow.id]: {
    "Структура": "1. Отдел ручного монтажа — нормализован",
    updatedAt: "2026-07-10T12:00:00.000Z",
  },
};
const legacyUi = {
  timesheetScheduleOverrides: {
    [executorId]: { code: "2/2", start: "07:30", end: "19:30", patternOffset: 2 },
  },
  timesheetCellOverrides: {
    [`${executorId}::2026-07-10`]: {
      value: "work",
      start: "07:30",
      end: "19:30",
      overtime: 1.5,
      comment: "QA migration",
    },
    [`${masterId}::2026-07-11`]: {
      value: "vacation",
      start: "",
      end: "",
      overtime: 0,
      comment: "",
    },
  },
  accessRoleProfiles: [
    {
      id: "master",
      label: "Мастер производства",
      scope: "workCenter",
      defaultModule: "shiftMasterBoard",
      modulePermissions: {
        shiftMasterBoard: { view: true, edit: true, approve: false },
      },
    },
    {
      id: "executor",
      label: "Исполнитель",
      scope: "self",
      defaultModule: "authSessionPrototype",
      modulePermissions: {
        authSessionPrototype: { view: true, edit: true },
      },
    },
  ],
  accessRoleAssignments: {
    [masterId]: "master",
    [executorId]: "executor",
  },
  shiftMasterAssignmentMatrix: {
    [masterId]: {
      mode: "manual",
      employeeIds: [executorId, executorId],
      updatedAt: "2026-07-10T12:00:00.000Z",
    },
  },
};

const migrationInput = {
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  matrixOverrides,
  legacyUi,
  migratedAt: "2026-07-10T12:30:00.000Z",
};
const first = migrateLegacySystemDomains(migrationInput);
const second = migrateLegacySystemDomains(clone(migrationInput));
const { domains, report } = first;
const registries = domains.registries;

assert(domains.schemaId === SYSTEM_DOMAINS_SCHEMA_ID, "Schema id must be explicit.");
assert(domains.schemaVersion === SYSTEM_DOMAINS_SCHEMA_VERSION, "Schema version must be explicit.");
assert(JSON.stringify(first) === JSON.stringify(second), "Migration must be deterministic for equivalent input.");
assert(JSON.stringify(PRODUCTION_STRUCTURE_MATRIX_ROWS) === sourceRowsSnapshot, "Migration must not mutate matrix source rows.");

assert(registries.orgUnits.length === 19, `Expected 19 org units, got ${registries.orgUnits.length}.`);
assert(registries.workCenters.length === 19, `Expected 19 work centers, got ${registries.workCenters.length}.`);
assert(registries.positions.length === 49, `Expected 49 positions, got ${registries.positions.length}.`);
assert(registries.employees.length === 76, `Expected 76 employees, got ${registries.employees.length}.`);
assert(registries.employmentAssignments.length === 76, "Every employee must have one explicit employment assignment.");
assert(registries.equipment.length === 6, `Expected 6 equipment records, got ${registries.equipment.length}.`);
assert(registries.scheduleAssignments.length === 76, "Every employee must have one schedule assignment.");
assert(registries.scheduleTemplates.length >= 3, "Schedule assignments must reference normalized reusable templates.");
assert(registries.attendanceEvents.length === 2, "Timesheet cell overrides must become attendance events.");
assert(registries.accessRoles.length === 7, "Known access roles must exist even when legacy UI stores only overrides.");
assert(registries.roleAssignments.length === 2, "Explicit access assignments must be migrated without role inference.");
assert(registries.responsibilityPolicies.length === 1, "Master assignment matrix must become a responsibility policy.");

const changedDepartment = registries.orgUnits.find((unit) => unit.id === departmentRow.cells["ID / код"]);
assert(changedDepartment?.name.endsWith("нормализован"), "Matrix override must be applied before domain extraction.");
assert(changedDepartment?.sourceRef?.sourceId === departmentRow.cells["ID / код"], "Matrix source id must remain stable.");
assert(changedDepartment?.sourceRef?.rowId === departmentRow.id, "Matrix row id must remain auditable.");
assert(report.matchedMatrixOverrideKeys.includes(departmentRow.id), "Applied matrix override must be reported.");
assert(report.unmatchedMatrixOverrideKeys.length === 0, "Known matrix overrides must not be reported as unmatched.");

const employee = registries.employees.find((item) => item.id === executorId);
const employment = registries.employmentAssignments.find((item) => item.employeeId === executorId);
const roleAssignment = registries.roleAssignments.find((item) => item.employeeId === executorId);
assert(employee && !("role" in employee) && !("department" in employee), "Employee identity must not contain position or department UI fields.");
assert(employment?.positionId && employment?.orgUnitId, "Employment relation must own position and organization links.");
assert(roleAssignment?.roleId === "executor", "Access role must be an explicit relation, not inferred from position name.");

const scheduleAssignment = registries.scheduleAssignments.find((item) => item.employeeId === executorId);
const scheduleTemplate = registries.scheduleTemplates.find((item) => item.id === scheduleAssignment?.scheduleTemplateId);
assert(scheduleAssignment?.patternOffset === 2, "Legacy schedule pattern offset must be preserved.");
assert(scheduleTemplate?.code === "2/2" && scheduleTemplate?.start === "07:30" && scheduleTemplate?.end === "19:30", "Legacy schedule override must win over matrix defaults.");
assert(scheduleTemplate?.patternOffset === 2, "Schedule template offset must survive legacy migration.");

const attendance = registries.attendanceEvents.find((event) => event.employeeId === executorId);
assert(attendance?.date === "2026-07-10" && attendance?.overtimeHours === 1.5, "Attendance fact must preserve date and overtime.");
const responsibility = registries.responsibilityPolicies[0];
assert(responsibility.subjectEmployeeId === masterId, "Responsibility policy must retain its master subject.");
assert(JSON.stringify(responsibility.targetEmployeeIds) === JSON.stringify([executorId]), "Responsibility targets must be deterministic and deduplicated.");

const allowGrant = registries.grants.find((grant) => grant.roleId === "master" && grant.resourceId === "shiftMasterBoard" && grant.actionId === "edit");
const denyGrant = registries.grants.find((grant) => grant.roleId === "master" && grant.resourceId === "shiftMasterBoard" && grant.actionId === "approve");
assert(allowGrant?.effect === "allow" && denyGrant?.effect === "deny", "Permission booleans must become explicit allow/deny grants.");

assert(report.validation.valid, `Normalized migration must satisfy references: ${JSON.stringify(report.validation.errors)}`);
assert(report.orphans.length === 0, `Normalized migration must have no orphans: ${JSON.stringify(report.orphans)}`);
assert(report.duplicates.length === 0, `Normalized migration must have no duplicate source ids: ${JSON.stringify(report.duplicates)}`);
assert(report.canActivate, "A clean migration must be marked safe for compatibility activation.");

const serialized = serializeSystemDomains(domains);
const loaded = loadSystemDomains(serialized, { strict: true });
assert(loaded.report.valid, "Serialized domains must load as a valid schema.");
assert(serializeSystemDomains(loaded.domains) === serialized, "Serialization must be stable across a load round trip.");
const omittedTemplateOffset = loadSystemDomains(JSON.stringify({
  ...domains,
  registries: {
    ...domains.registries,
    scheduleTemplates: domains.registries.scheduleTemplates.map(({ patternOffset, ...template }) => template),
  },
}), { strict: true });
assert(omittedTemplateOffset.domains.registries.scheduleTemplates.every((template) => template.patternOffset === 0), "A missing legacy template offset must normalize to a deterministic zero default.");

const orphanMigration = migrateLegacySystemDomains({
  matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
  matrixOverrides: { "missing-matrix-row": { "Структура": "orphan" } },
  legacyUi: {
    timesheetScheduleOverrides: { "missing-employee": { code: "5/2" } },
    timesheetCellOverrides: { "missing-employee::2026-07-10": { value: "work" } },
    accessRoleAssignments: { "missing-employee": "missing-role" },
    shiftMasterAssignmentMatrix: {
      [masterId]: { mode: "manual", employeeIds: ["missing-employee"] },
    },
  },
});
assert(orphanMigration.report.unmatchedMatrixOverrideKeys.includes("missing-matrix-row"), "Unmatched matrix override must be explicit.");
assert(orphanMigration.report.orphans.some((item) => item.registry === "timesheetScheduleOverrides"), "Orphan schedule owner must be reported.");
assert(orphanMigration.report.orphans.some((item) => item.registry === "attendanceEvents"), "Orphan attendance owner must be reported.");
assert(orphanMigration.report.orphans.some((item) => item.registry === "roleAssignments" && item.relation === "roleId"), "Unknown access role must be reported.");
assert(orphanMigration.report.orphans.some((item) => item.registry === "responsibilityPolicies" && item.relation === "targetEmployeeIds"), "Unknown responsibility target must be reported.");
assert(!orphanMigration.report.canActivate, "Migration with orphans must not be activatable.");

const duplicateStore = clone(domains);
duplicateStore.registries.employees.push(clone(duplicateStore.registries.employees[0]));
const duplicateValidation = validateSystemDomains(duplicateStore);
assert(duplicateValidation.errors.some((error) => error.code === "duplicate-id" && error.registry === "employees"), "Duplicate ids must fail validation.");

const cyclicStore = clone(domains);
cyclicStore.registries.orgUnits[0].parentOrgUnitId = cyclicStore.registries.orgUnits[1].id;
cyclicStore.registries.orgUnits[1].parentOrgUnitId = cyclicStore.registries.orgUnits[0].id;
const cyclicValidation = validateSystemDomains(cyclicStore);
assert(cyclicValidation.errors.some((error) => error.code === "hierarchy-cycle" && error.registry === "orgUnits"), "Organization hierarchy cycles must fail validation.");

const invalidJson = loadSystemDomains("{not-json");
assert(!invalidJson.report.valid && invalidJson.report.errors.some((error) => error.code === "invalid-json"), "Invalid serialized input must return an actionable load report.");

console.log("System Domains Domain QA");
console.log(`- schema: ${domains.schemaId}@${domains.schemaVersion}`);
console.log(`- source matrix: ${report.sourceCounts.matrixRows} rows`);
console.log(`- normalized: ${Object.entries(report.targetCounts).map(([name, count]) => `${name}=${count}`).join(", ")}`);
console.log("- stable source ids: pass");
console.log("- deterministic migration: pass");
console.log("- schedule and attendance separation: pass");
console.log("- position and access-role separation: pass");
console.log("- responsibility policy migration: pass");
console.log("- orphan, duplicate and hierarchy-cycle diagnostics: pass");
console.log("- stable serialization round trip: pass");
