import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import postgres from "postgres";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";
import { syncPendingSystemDomainsSnapshotChanges } from "./domain-system-domains-snapshot-sync.mjs";
import { handleDomainApiRequest } from "./domain-api.mjs";
import { createPublicPasswordHash, handlePublicAuthRequest } from "./public-auth-guard.mjs";
import { serializeSystemDomains } from "../src/modules/system_domains/service.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const baseUrl = process.env.MES_DOMAIN_E2E_DATABASE_URL || process.env.DATABASE_URL || "";
if (!baseUrl) throw new Error("MES_DOMAIN_E2E_DATABASE_URL is required");
const schema = `mes_system_domains_e2e_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const root = postgres(baseUrl, { max: 1, prepare: false });
const scoped = new URL(baseUrl);
scoped.searchParams.set("options", `-c search_path=${schema}`);
const scopedUrl = scoped.toString();
const migrationDir = resolve("db/migrations");
const scratch = await mkdtemp(join(tmpdir(), "mes-system-domains-e2e-"));
const snapshotFile = join(scratch, "shared-state.json");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = String(body); },
  };
}

function makeRequest({ method = "GET", headers = {}, body = "" } = {}) {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  request.method = method;
  request.headers = headers;
  return request;
}

async function loginForApi(env) {
  const request = makeRequest({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", host: "mes.e2e" },
    body: "username=e2e&password=e2e-password",
  });
  const response = makeResponse();
  const handled = await handlePublicAuthRequest(request, response, new URL("https://mes.e2e/api/login"), {}, env);
  assert(handled && response.statusCode === 302 && response.headers["Set-Cookie"], "public login must create a session cookie for the enabled command e2e");
  return String(response.headers["Set-Cookie"]).split(";")[0];
}

async function invokeApi({ pathname, method = "GET", headers = {}, payload = null, env }) {
  const request = makeRequest({
    method,
    headers: { host: "mes.e2e", ...headers },
    body: payload === null ? "" : JSON.stringify(payload),
  });
  const response = makeResponse();
  const handled = await handleDomainApiRequest(request, response, new URL(`https://mes.e2e${pathname}`), { filePath: snapshotFile, env });
  return { handled, statusCode: response.statusCode, headers: response.headers, json: JSON.parse(response.body || "{}") };
}

try {
  await root.unsafe(`CREATE SCHEMA "${schema}"`);
  const db = postgres(scopedUrl, { max: 1, prepare: false });
  try {
    const migrations = (await readdir(migrationDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of migrations) await db.begin(async (tx) => tx.unsafe(await readFile(join(migrationDir, name), "utf8")));
  } finally { await db.end({ timeout: 5 }); }
  const domains = { schemaId: "mes.system-domains", schemaVersion: 1, metadata: { source: "e2e" }, registries: {
    orgUnits: [{ id: "D1", code: "D1", name: "Склад", kind: "department", parentOrgUnitId: "", isActive: true, validFrom: "", validTo: "", sourceRef: {} }],
    workCenters: [{ id: "D1", code: "D1", name: "Склад", orgUnitId: "D1", parentWorkCenterId: "", participatesInPlanning: true, canPlanDirectly: true, showInGantt: true, availabilitySource: "calendar", isActive: true, sourceRef: {} }],
    positions: [], employees: [], employmentAssignments: [], equipment: [], scheduleTemplates: [], scheduleAssignments: [], attendanceEvents: [],
    accessRoles: [], grants: [], roleAssignments: [], responsibilityPolicies: [],
  } };
  await writeFile(snapshotFile, JSON.stringify({ version: 5, values: { "mes-planning-prototype-state-v2": "{}", "mes-planning-prototype-directories-v2": "{}" } }), "utf8");
  const primary = createSystemDomainsRepository({ databaseUrl: scopedUrl });
  try {
    const first = await primary.replace(domains, { expectedRevision: 0, actorId: "public:e2e", idempotencyKey: "e2e-first", source: "e2e" });
    assert(first.imported && first.revision === 1 && first.changeId, "first command must create revision one and an outbox row");
    const retry = await primary.replace(domains, { expectedRevision: 0, actorId: "public:e2e", idempotencyKey: "e2e-first", source: "e2e" });
    assert(retry.replayed && retry.revision === 1, "retry must return the original revision without another write");
    const synced = await syncPendingSystemDomainsSnapshotChanges({ primary, filePath: snapshotFile });
    assert(synced.applied === 1 && synced.failed === 0, "outbox must project the authoritative revision into snapshot");
    const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
    assert(snapshot.version === 6 && snapshot.values["mes-planning-prototype-system-domains-v1"], "snapshot must contain the server domain projection");
    const changed = { ...domains, metadata: { source: "e2e", updatedAt: "2026-07-17T00:00:00.000Z" } };
    const second = await primary.replace(changed, { expectedRevision: 1, actorId: "public:e2e", idempotencyKey: "e2e-second", source: "e2e" });
    assert(second.imported && second.revision === 2, "new payload with current revision must create the next revision");
    const stale = await primary.replace(domains, { expectedRevision: 1, actorId: "public:e2e", idempotencyKey: "e2e-stale", source: "e2e" });
    assert(stale.conflict && stale.revision === 2, "stale optimistic revision must be rejected");
    const secondSync = await syncPendingSystemDomainsSnapshotChanges({ primary, filePath: snapshotFile });
    assert(secondSync.applied === 1 && secondSync.failed === 0, "the feature-flagged command fixture must begin with a synchronized compatibility projection");

    // The repository checks above are not sufficient by themselves: verify
    // the real HTTP boundary with an authenticated public session, the
    // feature flag, revision headers and idempotency delivery.
    const apiEnv = {
      DATABASE_URL: scopedUrl,
      MES_DOMAIN_STORAGE: "postgres",
      MES_ENABLE_SYSTEM_DOMAINS_SERVER_COMMANDS: "1",
      MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES: "production-structure",
      MES_SYSTEM_DOMAINS_COMMAND_ACTORS: "public:e2e",
      MES_PUBLIC_AUTH_HOSTS: "mes.e2e",
      MES_PUBLIC_AUTH_USERNAME: "e2e",
      MES_PUBLIC_AUTH_PASSWORD_HASH: createPublicPasswordHash("e2e-password", "0123456789abcdef0123456789abcdef"),
      MES_PUBLIC_AUTH_SESSION_SECRET: "system-domains-e2e-session-secret",
    };
    const sessionCookie = await loginForApi(apiEnv);
    const loopbackLikeCapabilities = await invokeApi({ pathname: "/api/v1/system-domains/capabilities", env: apiEnv });
    assert(loopbackLikeCapabilities.statusCode === 200
      && loopbackLikeCapabilities.json.capabilities?.serverCommandsConfigured === true
      && loopbackLikeCapabilities.json.capabilities?.configuredServerCommandSurfaces?.includes("production-structure")
      && loopbackLikeCapabilities.json.capabilities?.serverCommandsEnabled === false
      && loopbackLikeCapabilities.json.capabilities?.actorAuthorization?.reason === "authenticated-session-required",
    "an unauthenticated loopback capability check must prove configuration without pretending it has a browser session");
    const deniedActorCapabilities = await invokeApi({
      pathname: "/api/v1/system-domains/capabilities",
      headers: { cookie: sessionCookie },
      env: { ...apiEnv, MES_SYSTEM_DOMAINS_COMMAND_ACTORS: "public:other" },
    });
    assert(deniedActorCapabilities.statusCode === 200
      && deniedActorCapabilities.json.capabilities?.serverCommandsConfigured === true
      && deniedActorCapabilities.json.capabilities?.serverCommandsEnabled === false
      && deniedActorCapabilities.json.capabilities?.configuredServerCommandSurfaces?.includes("production-structure")
      && deniedActorCapabilities.json.capabilities?.serverCommandSurfaces?.length === 0
      && deniedActorCapabilities.json.capabilities?.actorAuthorization?.policyConfigured === true
      && deniedActorCapabilities.json.capabilities?.actorAuthorization?.reason === "actor-not-authorized",
    "a valid allowlist that excludes the session actor must not expose a command surface to that browser");
    const missingActorPolicyCapabilities = await invokeApi({
      pathname: "/api/v1/system-domains/capabilities",
      headers: { cookie: sessionCookie },
      env: { ...apiEnv, MES_SYSTEM_DOMAINS_COMMAND_ACTORS: "" },
    });
    assert(missingActorPolicyCapabilities.statusCode === 200
      && missingActorPolicyCapabilities.json.capabilities?.serverCommandsConfigured === false
      && missingActorPolicyCapabilities.json.capabilities?.configuredServerCommandSurfaces?.length === 0
      && missingActorPolicyCapabilities.json.capabilities?.serverCommandsEnabled === false
      && missingActorPolicyCapabilities.json.capabilities?.serverCommandSurfaces?.length === 0
      && missingActorPolicyCapabilities.json.capabilities?.actorAuthorization?.policyConfigured === false
      && missingActorPolicyCapabilities.json.capabilities?.actorAuthorization?.reason === "actor-policy-missing",
    "a missing actor policy must fail closed in the capabilities payload");
    const invalidActorPolicyCapabilities = await invokeApi({
      pathname: "/api/v1/system-domains/capabilities",
      headers: { cookie: sessionCookie },
      env: { ...apiEnv, MES_SYSTEM_DOMAINS_COMMAND_ACTORS: "not-a-public-actor" },
    });
    assert(invalidActorPolicyCapabilities.statusCode === 200
      && invalidActorPolicyCapabilities.json.capabilities?.serverCommandsConfigured === false
      && invalidActorPolicyCapabilities.json.capabilities?.configuredServerCommandSurfaces?.length === 0
      && invalidActorPolicyCapabilities.json.capabilities?.serverCommandsEnabled === false
      && invalidActorPolicyCapabilities.json.capabilities?.serverCommandSurfaces?.length === 0
      && invalidActorPolicyCapabilities.json.capabilities?.actorAuthorization?.policyConfigured === false
      && invalidActorPolicyCapabilities.json.capabilities?.actorAuthorization?.reason === "actor-policy-invalid",
    "an invalid actor policy must fail closed in the capabilities payload");
    const deniedActor = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"2"', "idempotency-key": "e2e-unauthorized-actor" },
      payload: { domains: changed, surface: "production-structure", expectedRevision: 2 },
      env: { ...apiEnv, MES_SYSTEM_DOMAINS_COMMAND_ACTORS: "public:other" },
    });
    assert(deniedActor.statusCode === 403 && /not authorized/.test(deniedActor.json.error || ""), "System Domains writes must require an explicit server-side actor authorization policy");
    const apiChanged = { ...changed, metadata: { source: "e2e-http", updatedAt: "2026-07-17T01:00:00.000Z" } };
    const apiFirst = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"2"', "idempotency-key": "e2e-http-first" },
      payload: { domains: apiChanged, surface: "production-structure", expectedRevision: 2 },
      env: apiEnv,
    });
    assert(apiFirst.handled && apiFirst.statusCode === 200 && apiFirst.json.ok && apiFirst.json.revision === 3, "enabled API command must persist the authoritative third revision");
    assert(apiFirst.json.snapshotSync?.applied === 1, "enabled API command must synchronously mirror the compatible snapshot");
    const apiReplay = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"2"', "idempotency-key": "e2e-http-first" },
      payload: { domains: apiChanged, surface: "production-structure", expectedRevision: 2 },
      env: apiEnv,
    });
    assert(apiReplay.statusCode === 200 && apiReplay.json.replayed && apiReplay.json.revision === 3, "HTTP retry must replay the original command without a second revision");
    const crossSurfaceRoleMutation = {
      ...apiChanged,
      registries: {
        ...apiChanged.registries,
        accessRoles: [{ id: "e2e-forbidden-role", label: "Forbidden", description: "", scope: "factory", defaultModuleId: "", icon: "", isActive: true, sourceRef: {} }],
      },
    };
    const blockedCrossSurface = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"3"', "idempotency-key": "e2e-cross-surface-role" },
      payload: { domains: crossSurfaceRoleMutation, surface: "production-structure", expectedRevision: 3 },
      env: apiEnv,
    });
    assert(blockedCrossSurface.statusCode === 403 && blockedCrossSurface.json.forbiddenRegistries?.includes("accessRoles"), "a production-structure command must not be able to rewrite access-control registries");
    const consistency = await invokeApi({ pathname: "/api/v1/system-domains/consistency", env: apiEnv });
    assert(consistency.statusCode === 200 && consistency.json.consistency?.matches === true && consistency.json.consistency?.revision === 3, "HTTP consistency check must confirm that the server command mirrored its snapshot projection");
    const capabilities = await invokeApi({ pathname: "/api/v1/system-domains/capabilities", headers: { cookie: sessionCookie }, env: apiEnv });
    assert(capabilities.statusCode === 200 && capabilities.json.capabilities?.serverCommandsConfigured === true && capabilities.json.capabilities?.serverCommandsEnabled === true && capabilities.json.capabilities?.serverCommandSurfaces?.includes("production-structure") && capabilities.json.capabilities?.actorAuthorization?.authorized === true && capabilities.json.capabilities?.consistency?.matches === true, "command capability must require and expose a parity-safe compatible snapshot to its authorized session");
    const apiStale = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"2"', "idempotency-key": "e2e-http-stale" },
      payload: { domains: changed, surface: "production-structure", expectedRevision: 2 },
      env: apiEnv,
    });
    assert(apiStale.statusCode === 409 && apiStale.json.conflict === true && apiStale.json.revision === 3, "HTTP command must reject stale revisions after a concurrent write");

    const staleSnapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
    staleSnapshot.version += 1;
    staleSnapshot.values["mes-planning-prototype-system-domains-v1"] = JSON.stringify(changed);
    await writeFile(snapshotFile, JSON.stringify(staleSnapshot), "utf8");
    const blockedByProof = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"3"', "idempotency-key": "e2e-http-proof-block" },
      payload: { domains: apiChanged, surface: "production-structure", expectedRevision: 3 },
      env: apiEnv,
    });
    assert(blockedByProof.statusCode === 409 && /stable compatibility proof/.test(blockedByProof.json.error || ""), "a stale snapshot must block a feature-flagged PostgreSQL command before it can mutate the projection");
    assert((await primary.get()).revision === 3, "a failed authority preflight must leave the PostgreSQL System Domains revision untouched");

    // A root-controlled cutover records the exact active projection, retires
    // only its compatibility value, and must keep the API command surface
    // alive afterwards.  This is the critical server-primary vertical path:
    // subsequent commands may not revive the cross-browser snapshot.
    const preRetirement = await primary.get();
    const synchronizedSnapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
    synchronizedSnapshot.version += 1;
    synchronizedSnapshot.values["mes-planning-prototype-system-domains-v1"] = serializeSystemDomains(preRetirement.item);
    await writeFile(snapshotFile, JSON.stringify(synchronizedSnapshot), "utf8");
    const transition = await primary.beginPostgresPrimaryTransition({
      transitionId: "e2e-postgres-primary",
      expectedRevision: preRetirement.revision,
      expectedFingerprint: preRetirement.fingerprint,
      proofSnapshotVersion: synchronizedSnapshot.version,
      proofSnapshotFingerprint: "sha256:e2e-snapshot-proof",
      actorId: "e2e",
    });
    assert(transition.mode === "transition-pending", "cutover must persist a fail-closed pending authority state before retiring the snapshot");
    const pendingCapabilities = await invokeApi({ pathname: "/api/v1/system-domains/capabilities", headers: { cookie: sessionCookie }, env: apiEnv });
    assert(pendingCapabilities.statusCode === 200 && pendingCapabilities.json.capabilities?.serverCommandsEnabled === false, "a pending authority transition must fail closed for public commands");
    // Simulate the only dangerous race: a browser command completed HTTP
    // preflight while compatibility parity was still valid, but it acquires
    // the repository lock after root has persisted transition-pending.
    const admittedBeforePending = { ...apiChanged, metadata: { source: "e2e-admitted-before-pending", updatedAt: "2026-07-18T00:30:00.000Z" } };
    await primary.replace(admittedBeforePending, {
      expectedRevision: 3, actorId: "public:e2e", idempotencyKey: "e2e-transition-pending-race", source: "e2e-race",
    }).then(() => { throw new Error("a command that reaches the repository after transition-pending must not commit"); }).catch((error) => {
      assert(error?.code === "SYSTEM_DOMAINS_AUTHORITY_TRANSITION_PENDING", "transition-pending must reject a previously admitted command under the projection lock");
    });
    assert((await primary.get()).revision === 3, "the transition-pending repository race must leave the retirement proof revision unchanged");
    synchronizedSnapshot.version += 1;
    synchronizedSnapshot.values["mes-planning-prototype-system-domains-v1"] = null;
    await writeFile(snapshotFile, JSON.stringify(synchronizedSnapshot), "utf8");
    const finalized = await primary.finalizePostgresPrimaryTransition({ transitionId: "e2e-postgres-primary", actorId: "e2e" });
    assert(finalized.mode === "postgres-primary", "cutover must finalize PostgreSQL authority only after the tombstone is durable");
    const partialPostgresPrimaryCapabilities = await invokeApi({ pathname: "/api/v1/system-domains/capabilities", headers: { cookie: sessionCookie }, env: apiEnv });
    assert(partialPostgresPrimaryCapabilities.statusCode === 200 && partialPostgresPrimaryCapabilities.json.capabilities?.serverCommandsEnabled === false, "a PostgreSQL-primary store must fail closed until every command surface is enabled");
    apiEnv.MES_SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES = "production-structure,timesheet,access-control";
    const retiredConsistency = await invokeApi({ pathname: "/api/v1/system-domains/consistency", env: apiEnv });
    assert(retiredConsistency.statusCode === 200
      && retiredConsistency.json.consistency?.details?.authority?.mode === "postgres-primary"
      && retiredConsistency.json.consistency?.details?.reconciliation?.promotion?.retirementEligible === true,
    "a retired compatibility snapshot must retain a PostgreSQL-primary readiness proof");
    const retiredCapabilities = await invokeApi({ pathname: "/api/v1/system-domains/capabilities", headers: { cookie: sessionCookie }, env: apiEnv });
    assert(retiredCapabilities.statusCode === 200 && retiredCapabilities.json.capabilities?.serverCommandsEnabled === true, "server commands must remain enabled after a safe snapshot retirement");
    const postgresPrimaryChanged = { ...apiChanged, metadata: { source: "e2e-postgres-primary", updatedAt: "2026-07-18T01:00:00.000Z" } };
    const postgresPrimaryCommand = await invokeApi({
      pathname: "/api/v1/system-domains",
      method: "PUT",
      headers: { cookie: sessionCookie, "content-type": "application/json", "if-match": '"3"', "idempotency-key": "e2e-postgres-primary-command" },
      payload: { domains: postgresPrimaryChanged, surface: "production-structure", expectedRevision: 3 },
      env: apiEnv,
    });
    assert(postgresPrimaryCommand.statusCode === 200 && postgresPrimaryCommand.json.revision === 4 && postgresPrimaryCommand.json.snapshotSync?.applied === 1, "a PostgreSQL-primary command must commit and close its obsolete snapshot outbox row");
    const retiredSnapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
    assert(retiredSnapshot.values["mes-planning-prototype-system-domains-v1"] === null, "a command after cutover must never revive the retired compatibility snapshot");
    console.log(JSON.stringify({ ok: true, schema, revisions: [first.revision, second.revision, apiFirst.json.revision, postgresPrimaryCommand.json.revision], snapshotSync: synced.applied, httpCommand: true, postgresPrimary: true }));
  } finally { await primary.close(); }
} finally {
  await root.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await root.end({ timeout: 5 });
  await rm(scratch, { recursive: true, force: true });
}
