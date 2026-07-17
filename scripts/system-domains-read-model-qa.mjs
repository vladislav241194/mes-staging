import { createSystemDomainsReadModel } from "../src/modules/domain_api/system_domains_read_model.js";

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
assert(first.ok && first.changed && calls === 1 && model.get().etag === '"1"', "first read must cache the server projection and ETag");
const cached = await model.refresh();
assert(cached.ok && cached.notModified && calls === 1, "fresh projection must not issue a duplicate request");
now = 31_000;
const revalidated = await model.refresh();
assert(revalidated.ok && revalidated.notModified && calls === 2, "expired projection must use conditional GET");
const unavailable = createSystemDomainsReadModel({ fetchImpl: async () => ({ status: 503, ok: false, headers: { get: () => "" } }) });
const failed = await unavailable.refresh();
assert(!failed.ok && /503/.test(failed.error), "unavailable server read must be explicit and non-destructive");
console.log("System Domains server read model QA: OK");
