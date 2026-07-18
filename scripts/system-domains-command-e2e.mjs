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
      MES_PUBLIC_AUTH_HOSTS: "mes.e2e",
      MES_PUBLIC_AUTH_USERNAME: "e2e",
      MES_PUBLIC_AUTH_PASSWORD_HASH: createPublicPasswordHash("e2e-password", "0123456789abcdef0123456789abcdef"),
      MES_PUBLIC_AUTH_SESSION_SECRET: "system-domains-e2e-session-secret",
    };
    const sessionCookie = await loginForApi(apiEnv);
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
    const consistency = await invokeApi({ pathname: "/api/v1/system-domains/consistency", env: apiEnv });
    assert(consistency.statusCode === 200 && consistency.json.consistency?.matches === true && consistency.json.consistency?.revision === 3, "HTTP consistency check must confirm that the server command mirrored its snapshot projection");
    const capabilities = await invokeApi({ pathname: "/api/v1/system-domains/capabilities", env: apiEnv });
    assert(capabilities.statusCode === 200 && capabilities.json.capabilities?.serverCommandsEnabled === true && capabilities.json.capabilities?.serverCommandSurfaces?.includes("production-structure") && capabilities.json.capabilities?.consistency?.matches === true, "command capability must require and expose a parity-safe compatible snapshot");
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
    console.log(JSON.stringify({ ok: true, schema, revisions: [first.revision, second.revision, apiFirst.json.revision], snapshotSync: synced.applied, httpCommand: true }));
  } finally { await primary.close(); }
} finally {
  await root.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await root.end({ timeout: 5 });
  await rm(scratch, { recursive: true, force: true });
}
