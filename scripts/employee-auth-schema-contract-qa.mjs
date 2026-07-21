import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, repository, guard, endpoint, server, preflight, preflightPolicy] = await Promise.all([
  readFile(new URL("../db/migrations/027_employee_auth_credentials.sql", import.meta.url), "utf-8"),
  readFile(new URL("./domain-employee-auth-repository.mjs", import.meta.url), "utf-8"),
  readFile(new URL("./employee-auth-guard.mjs", import.meta.url), "utf-8"),
  readFile(new URL("./employee-auth-endpoint.mjs", import.meta.url), "utf-8"),
  readFile(new URL("../server.js", import.meta.url), "utf-8"),
  readFile(new URL("./domain-postgres-preflight.mjs", import.meta.url), "utf-8"),
  readFile(new URL("./domain-postgres-preflight-policy.mjs", import.meta.url), "utf-8"),
]);

assert.match(migration, /CREATE TABLE IF NOT EXISTS system_employee_auth_credentials/);
assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
assert.match(migration, /auth_version BIGINT NOT NULL DEFAULT 1/);
assert.match(migration, /failed_attempts INTEGER NOT NULL DEFAULT 0/);
assert.match(migration, /locked_until TIMESTAMPTZ/);
assert.doesNotMatch(migration, /\bpin\s+TEXT/i);

assert.match(repository, /FOR UPDATE OF credentials, employees/);
assert.match(repository, /verifyEmployeePin\(pin, row\.pin_hash\)/);
assert.match(repository, /DUMMY_EMPLOYEE_PIN_HASH/);
assert.match(repository, /SET failed_attempts = \$\{failed\.failedAttempts\}, locked_until = \$\{failed\.lockedUntil\}/);
assert.match(repository, /auth_version = system_employee_auth_credentials\.auth_version \+ 1/);
assert.match(repository, /SET auth_version = auth_version \+ 1/);

assert.match(guard, /publicPrincipalId/);
assert.match(guard, /public-principal-mismatch/);
assert.match(guard, /authVersion/);
assert.match(guard, /scope: "employee"/);
assert.match(guard, /HttpOnly; Secure; SameSite=Strict/);
assert.match(guard, /repository\.inspectSession\(\{ employeeId, authVersion \}\)/);
assert.doesNotMatch(guard, /payload\.(role|permissions|canEdit)/);

assert.match(endpoint, /getCurrentNomenclatureAuthorization\(session\.principal/);
assert.match(endpoint, /MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS/);
assert.match(endpoint, /cross-site-request-rejected/);
assert.match(endpoint, /isInternalOperatorReadinessRequest/);
assert.match(endpoint, /employeeAuthSchemaReady/);
assert.match(endpoint, /serverCommandsEnabled: false/);
assert.doesNotMatch(endpoint, /headers\?\.\["x-employee-id"\]/i);
assert.doesNotMatch(endpoint, /payload\.(role|permissions|canEditNomenclature)/);

const publicGuardIndex = server.indexOf("handlePublicAuthRequest(req");
const employeeGuardIndex = server.indexOf("handleEmployeeAuthRequest(req");
const domainApiIndex = server.indexOf("handleDomainApiRequest(req");
assert.ok(publicGuardIndex >= 0 && employeeGuardIndex > publicGuardIndex && domainApiIndex > employeeGuardIndex);
assert.match(preflight, /getRequiredDomainMigrations\(process\.env\)/);
assert.match(preflightPolicy, /MES_ENABLE_NOMENCLATURE_SERVER_COMMANDS/);
assert.match(preflightPolicy, /MES_ENABLE_EMPLOYEE_AUTH/);
assert.match(preflightPolicy, /MES_EMPLOYEE_AUTH_SESSION_SECRET/);
assert.match(preflightPolicy, /027_employee_auth_credentials/);

console.log("Employee auth schema/route contract QA passed.");
