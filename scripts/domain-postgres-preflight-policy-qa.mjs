import assert from "node:assert/strict";
import {
  EMPLOYEE_AUTH_MIGRATION,
  FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS,
  getRequiredDomainMigrations,
  requiresEmployeeAuthMigration,
} from "./domain-postgres-preflight-policy.mjs";

const foundation = getRequiredDomainMigrations({});
assert.deepEqual(foundation, [...FOUNDATION_REQUIRED_DOMAIN_MIGRATIONS]);
assert.equal(foundation.includes(EMPLOYEE_AUTH_MIGRATION), false);
assert.equal(requiresEmployeeAuthMigration({}), false);

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

console.log("Domain PostgreSQL preflight policy QA passed: foundation OFF is migration-027 independent; enabled auth/commands require it.");
