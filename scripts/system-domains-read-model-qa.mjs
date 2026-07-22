import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

await withBundledTypeScriptClient(new URL("../src/modules/domain_api/system_domains_read_model.ts", import.meta.url), async ({ createSystemDomainsReadModel }) => {

const assert = (value, message) => { if (!value) throw new Error(message); };
let now = 0;
let calls = 0;
let etag = "";
const item = { schemaId: "mes.system-domains", schemaVersion: 1, registries: { employees: [] } };
const model = createSystemDomainsReadModel({
  now: () => now,
  fetchImpl: async (_url, options) => {
    calls += 1;
    if (options.headers?.["If-None-Match"] === '"1"') return { status: 304, ok: false, headers: { get: () => '"1"' } };
    return { status: 200, ok: true, headers: { get: () => '"1"' }, json: async () => ({ ok: true, revision: 1, item }) };
  },
});
const first = await model.refresh();
assert(first.ok && first.changed && first.revision === 1 && calls === 1 && model.get().etag === '"1"' && model.get().revision === 1, "first read must cache the server projection, revision, and ETag");
const cached = await model.refresh();
assert(cached.ok && cached.notModified && cached.revision === 1 && calls === 1, "fresh projection must keep the cached revision without issuing a duplicate request");
const forced = await model.refresh({ force: true });
assert(forced.ok && forced.notModified && forced.revision === 1 && calls === 2, "a command preflight must be able to force an ETag revalidation and retain its revision on 304");
now = 31_000;
const revalidated = await model.refresh();
assert(revalidated.ok && revalidated.notModified && revalidated.revision === 1 && calls === 3, "expired projection must use conditional GET and preserve the revision");
const unavailable = createSystemDomainsReadModel({ fetchImpl: async () => ({ status: 503, ok: false, headers: { get: () => "" } }) });
const failed = await unavailable.refresh();
assert(!failed.ok && /503/.test(failed.error), "unavailable server read must be explicit and non-destructive");
console.log("System Domains server read model QA: OK");
});
