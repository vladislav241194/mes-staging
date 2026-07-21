import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, authorization, postgresRepository, packageSource] = await Promise.all([
  readFile(new URL("./domain-api.mjs", import.meta.url), "utf8"),
  readFile(new URL("./planning-command-authorization.mjs", import.meta.url), "utf8"),
  readFile(new URL("./domain-postgres-repository.mjs", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

assert.match(api, /resolvePlanningCommandAuthorization/,
  "Domain API must wire the signed employee Planning authorization resolver");
assert.match(api, /const isPlanningMutation = isOrderPatch \|\| isStartDatePatch \|\| isSlotPatch;/,
  "Planning mutation boundary must cover all three active PATCH endpoints");
assert.match(api, /isShiftExecutionMutation \|\| isPlanningMutation/,
  "Planning writes must enter the shared JSON and same-origin command boundary");
assert.match(api, /PLANNING_COMMAND_BODY_MAX_BYTES = 64 \* 1024/,
  "Planning command envelope must have an explicit 64 KiB bound");
assert.equal((api.match(/readRequestBody\(req, \{ maxBytes: PLANNING_COMMAND_BODY_MAX_BYTES \}\)/g) || []).length, 3,
  "All active Planning PATCH handlers must use the bounded JSON reader");
const planningAuthorizationMatch = /if\s*\(isPlanningMutation\s*\|\|\s*isPlanningCommandCapabilities\)\s*\{/.exec(api);
const planningAuthorizationIndex = planningAuthorizationMatch?.index ?? -1;
const workOrdersRepositoryIndex = api.indexOf("let workOrders;");
assert(planningAuthorizationIndex >= 0 && workOrdersRepositoryIndex > planningAuthorizationIndex,
  "Planning mutation/capability authorization must complete before the work-order repository is constructed or health-checked");
assert.equal((api.match(/planningAuthorizationResolver\(req, \{ env \}\)/g) || []).length, 1,
  "Planning mutation authorization must resolve exactly once and be reused by its route handler");
assert.equal((api.match(/actorId: planningAuthorization\.actor\.id/g) || []).length, 4,
  "All three Planning commands and the exact start-date compatibility receipt must use the normalized signed employee actor");
assert.match(api, /startDateCommandReadiness/,
  "start-date PATCH must fail closed behind its exact migration/index readiness proof");
assert.match(api, /Idempotency-Key are required/,
  "start-date PATCH must require an explicit retry identity");

assert.match(authorization, /moduleId: "planning"/);
assert.match(authorization, /resourceId: "planning"/);
assert.match(authorization, /action: "edit"/);
assert.match(authorization, /inspectEmployeeAuthSession\(req, env/,
  "Planning authorization must inspect the signed employee cookie and current auth version");
assert.match(authorization, /getCurrentDirectoryAuthorization\(employeePrincipal/,
  "Planning authorization must re-read current System Domains RBAC");
assert.doesNotMatch(authorization, /(?:query|searchParams|localhost|localQa|x-employee-id)/i,
  "Planning server authorization must not contain a query/header/local QA bypass");

assert.match(postgresRepository, /changeQuantity\(id, \{ quantity, expectedRevision, actorId = "" \}\)/);
assert.match(postgresRepository, /changeStartDate\(id, command = \{\}\)[\s\S]*?idempotencyKey = ""/);
assert.match(postgresRepository, /hasPlanningStartDate[\s\S]*?planningStartDate must be an ISO calendar date or explicit null/,
  "PostgreSQL owner must distinguish an explicit nullable clear from a missing/invalid field");
assert.match(postgresRepository, /SET planning_start_date = NULL[\s\S]*?metadata = COALESCE\(metadata, '\{\}'::jsonb\) - 'planningStartDate'/,
  "nullable clear must remove compatibility metadata transactionally");
assert.match(postgresRepository, /changeSlotSchedule\(id, operationId, \{ plannedStart, expectedRevision, actorId = "" \}\)/);
assert.equal((postgresRepository.match(/tx\.json\(\{[^}]*actorId: String\(actorId \|\| ""\)[^}]*\}\)/g) || []).length, 2,
  "Both durable Planning change-log payloads must retain the server-derived employee actor");
assert.equal((postgresRepository.match(/payload, actor_id, snapshot_sync_state/g) || []).length, 2,
  "Both durable Planning change-log rows must store the employee actor in the canonical audit column");

const packageJson = JSON.parse(packageSource);
const domainApiQa = String(packageJson.scripts?.["qa:domain-api"] || "");
assert(domainApiQa.includes("planning-command-authorization-qa.mjs")
  && domainApiQa.includes("planning-command-server-wiring-qa.mjs")
  && domainApiQa.includes("planning-start-date-owner-qa.mjs"),
"Mandatory Domain API QA must include Planning authorization, owner behavior and static wiring checks");

console.log("Planning command server wiring QA: three active PATCH endpoints, fail-closed auth, same-origin JSON bounds and durable actor audit passed.");
