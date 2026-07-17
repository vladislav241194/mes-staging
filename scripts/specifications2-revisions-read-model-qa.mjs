import { createSpecifications2RevisionsReadModel } from "../src/modules/domain_api/specifications2_revisions_read_model.js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

let clock = 1_000;
let calls = 0;
let mode = "published";
const model = createSpecifications2RevisionsReadModel({
  now: () => clock,
  fetchImpl: async (url, options) => {
    calls += 1;
    assert(url.endsWith("/by-source/source-1"), "read model must request a projection by its source entry id");
    assert(options?.cache === "no-store" && options?.credentials === "same-origin", "read model must avoid stale cross-session projections");
    if (mode === "missing") return { status: 404, ok: false };
    if (mode === "offline") throw new Error("offline");
    return {
      status: 200,
      ok: true,
      json: async () => ({ ok: true, item: { id: "revision-6", sourceEntryId: "source-1", revisionNo: 6, treeItems: [{ sourceRowId: "1" }], routes: [] } }),
    };
  },
});

const first = await model.refreshBySource("source-1");
assert(first.ok && first.changed && model.getBySource("source-1").item?.revisionNo === 6, "first server response must populate the published revision projection");
await model.refreshBySource("source-1");
assert(calls === 1, "fresh published revision must not refetch during its TTL");
clock += 31_000;
mode = "offline";
const offline = await model.refreshBySource("source-1");
assert(!offline.ok && model.getBySource("source-1").item?.id === "revision-6", "unavailable API must retain the last confirmed published revision");
clock += 31_000;
mode = "missing";
const missing = await model.refreshBySource("source-1");
assert(missing.ok && missing.item === null && model.getBySource("source-1").error === "", "a missing server revision must be distinguishable from an API failure");
await model.refreshBySource("source-1");
assert(calls === 3, "a confirmed missing revision must be cached and must not refetch on each render");

console.log("Specifications 2.0 revisions read model QA: OK");
