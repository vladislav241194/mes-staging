import assert from "node:assert/strict";
import {
  EMPLOYEE_AUTH_MIGRATION,
  FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS,
  PLANNING_START_DATE_COMMAND_MIGRATION,
  SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION,
  SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION,
  SPECIFICATIONS2_PUBLICATION_IDEMPOTENCY_MIGRATION,
  SPECIFICATIONS2_PUBLICATION_REQUIRED_MIGRATIONS,
  SPECIFICATIONS2_REVISION_IDENTITY_BACKFILL_MIGRATION,
  SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS,
  SPECIFICATIONS2_ATTACHMENT_MIGRATION,
  SHIFT_EXECUTION_SERVER_COMMAND_REQUIRED_MIGRATIONS,
  getRequiredDomainMigrations,
  requiresEmployeeAuthMigration,
  requiresSpecifications2PublicationIdempotencyMigration,
  requiresSpecifications2ServerCommandMigrations,
  requiresSpecifications2AttachmentMigration,
  requiresShiftExecutionServerCommandMigrations,
  requiresPlanningStartDateCommandMigration,
} from "./domain-postgres-preflight-policy.mjs";

const foundation = getRequiredDomainMigrations({});
assert.deepEqual(foundation, [...FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS]);
assert.equal(foundation.includes(EMPLOYEE_AUTH_MIGRATION), false);
assert.equal(foundation.includes(SPECIFICATIONS2_PUBLICATION_IDEMPOTENCY_MIGRATION), false);
assert.equal(foundation.includes(SPECIFICATIONS2_REVISION_IDENTITY_BACKFILL_MIGRATION), false);
assert.equal(foundation.includes(SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION), false);
assert.equal(foundation.includes(SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION), false);
assert.equal(requiresEmployeeAuthMigration({}), false);
assert.equal(requiresSpecifications2PublicationIdempotencyMigration({}), false);
assert.equal(requiresSpecifications2ServerCommandMigrations({}), false);
assert.equal(requiresSpecifications2AttachmentMigration({}), false);
assert.equal(requiresShiftExecutionServerCommandMigrations({}), false);
assert.equal(requiresPlanningStartDateCommandMigration({}), false);

for (const env of [
  { MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "1" },
  { MES_ENABLE_EMPLOYEE_AUTH: "1" },
  { MES_EMPLOYEE_AUTH_ENABLED: "1" },
  { MES_EMPLOYEE_AUTH_SESSION_SECRET: "configured-secret" },
]) {
  const required = getRequiredDomainMigrations(env);
  assert.equal(requiresEmployeeAuthMigration(env), true);
  assert.equal(required.at(-1), EMPLOYEE_AUTH_MIGRATION);
  assert.equal(required.filter((migration) => migration === EMPLOYEE_AUTH_MIGRATION).length, 1);
}

for (const env of [
  { MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS: "0" },
  { MES_ENABLE_EMPLOYEE_AUTH: "false" },
  { MES_EMPLOYEE_AUTH_ENABLED: "0" },
  { MES_EMPLOYEE_AUTH_SESSION_SECRET: "   " },
]) {
  assert.equal(requiresEmployeeAuthMigration(env), false);
  assert.equal(getRequiredDomainMigrations(env).includes(EMPLOYEE_AUTH_MIGRATION), false);
}

const specifications2PublicationRequired = getRequiredDomainMigrations({ MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1" });
assert.equal(requiresSpecifications2PublicationIdempotencyMigration({ MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1" }), true);
assert.equal(requiresSpecifications2ServerCommandMigrations({ MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "1" }), true);
assert.deepEqual(SPECIFICATIONS2_PUBLICATION_REQUIRED_MIGRATIONS, SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS);
assert.deepEqual(specifications2PublicationRequired.slice(-SPECIFICATIONS2_PUBLICATION_REQUIRED_MIGRATIONS.length), [...SPECIFICATIONS2_PUBLICATION_REQUIRED_MIGRATIONS]);
assert.equal(specifications2PublicationRequired.filter((migration) => migration === SPECIFICATIONS2_PUBLICATION_IDEMPOTENCY_MIGRATION).length, 1);
assert.equal(specifications2PublicationRequired.filter((migration) => migration === SPECIFICATIONS2_REVISION_IDENTITY_BACKFILL_MIGRATION).length, 1);
assert.equal(specifications2PublicationRequired.filter((migration) => migration === SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION).length, 1);
assert.equal(specifications2PublicationRequired.filter((migration) => migration === SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION).length, 1);
assert.equal(requiresSpecifications2PublicationIdempotencyMigration({ MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "0" }), false);
assert.equal(getRequiredDomainMigrations({ MES_ENABLE_SPECIFICATIONS2_SERVER_PUBLISH_COMMANDS: "0" }).includes(SPECIFICATIONS2_PUBLICATION_IDEMPOTENCY_MIGRATION), false);

const specifications2WorkOrderRequired = getRequiredDomainMigrations({ MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" });
assert.equal(requiresSpecifications2ServerCommandMigrations({ MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" }), true);
assert.equal(requiresSpecifications2PublicationIdempotencyMigration({ MES_ENABLE_SPECIFICATIONS2_SERVER_COMMANDS: "1" }), true,
  "the compatibility alias must also gate the Work Order command surface");
assert.deepEqual(specifications2WorkOrderRequired.slice(-SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS.length), [...SPECIFICATIONS2_SERVER_COMMAND_REQUIRED_MIGRATIONS]);
assert.equal(specifications2WorkOrderRequired.filter((migration) => migration === SPECIFICATIONS2_LEGACY_REVISION_IDENTITY_GUARD_MIGRATION).length, 1);
assert.equal(specifications2WorkOrderRequired.filter((migration) => migration === SPECIFICATIONS2_GUARD_FUNCTION_REPAIR_MIGRATION).length, 1);

const specifications2AttachmentRequired = getRequiredDomainMigrations({ MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS: "1" });
assert.equal(requiresSpecifications2AttachmentMigration({ MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS: "1" }), true);
assert.equal(specifications2AttachmentRequired.at(-1), SPECIFICATIONS2_ATTACHMENT_MIGRATION);
assert.equal(specifications2AttachmentRequired.filter((migration) => migration === SPECIFICATIONS2_ATTACHMENT_MIGRATION).length, 1);
assert.equal(requiresSpecifications2AttachmentMigration({ MES_ENABLE_SPECIFICATIONS2_ATTACHMENT_COMMANDS: "0" }), false);

const shiftExecutionRequired = getRequiredDomainMigrations({ MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "1" });
assert.equal(requiresShiftExecutionServerCommandMigrations({ MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "1" }), true);
for (const migration of SHIFT_EXECUTION_SERVER_COMMAND_REQUIRED_MIGRATIONS) {
  assert.equal(shiftExecutionRequired.includes(migration), true, `Shift Execution commands must require ${migration}`);
  assert.equal(shiftExecutionRequired.filter((entry) => entry === migration).length, 1, `${migration} must not be duplicated`);
}
assert.equal(requiresShiftExecutionServerCommandMigrations({ MES_ENABLE_SHIFT_EXECUTION_SERVER_COMMANDS: "0" }), false);

const planningStartDateRequired = getRequiredDomainMigrations({ MES_ENABLE_PLANNING_START_DATE_COMMANDS: "1" });
assert.equal(requiresPlanningStartDateCommandMigration({ MES_ENABLE_PLANNING_START_DATE_COMMANDS: "1" }), true);
assert.equal(planningStartDateRequired.at(-1), PLANNING_START_DATE_COMMAND_MIGRATION);
assert.equal(planningStartDateRequired.filter((migration) => migration === PLANNING_START_DATE_COMMAND_MIGRATION).length, 1);
assert.equal(requiresPlanningStartDateCommandMigration({ MES_ENABLE_PLANNING_START_DATE_COMMANDS: "0" }), false);
assert.equal(getRequiredDomainMigrations({ MES_ENABLE_PLANNING_START_DATE_COMMANDS: "0" }).includes(PLANNING_START_DATE_COMMAND_MIGRATION), false);

console.log("Domain PostgreSQL preflight policy QA passed: optional command surfaces require their idempotency migrations.");
