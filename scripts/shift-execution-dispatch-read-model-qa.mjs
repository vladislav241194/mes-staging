import { readFile } from "node:fs/promises";
import { withBundledTypeScriptClient } from "./typescript-client-qa-loader.mjs";

await withBundledTypeScriptClient(new URL("../src/modules/domain_api/shift_execution_dispatch_read_model.ts", import.meta.url), async ({ createShiftExecutionDispatchReadModel }) => {

function assert(value, message) { if (!value) throw new Error(message); }

let clock = 1_000;
let calls = 0;
let mode = "initial";
const requests = [];
const scope = { dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D3", "D5"] };
const payloadFor = (item) => ({
  ok: true,
  items: [item],
  carryovers: [{ id: `carryover-${item.id}` }],
  coveredSourceRowIds: [...scope.sourceRowIds],
  coverageComplete: true,
  scope,
});
const model = createShiftExecutionDispatchReadModel({
  now: () => clock,
  fetchImpl: async (url, options) => {
    calls += 1;
    requests.push({ url, options });
    if (mode === "offline") throw new Error("offline");
    if (mode === "not-modified") {
      assert(options.headers?.["If-None-Match"] === '"dispatch-a-v1"', "a stale scope must revalidate with its own ETag");
      return { status: 304, ok: false, headers: { get: () => '"dispatch-a-v1"' } };
    }
    if (mode === "scope-b") {
      return {
        status: 200,
        ok: true,
        headers: { get: () => '"dispatch-b-v1"' },
        json: async () => ({ ...payloadFor({ id: "assignment-b", sourceRowId: "row-c", sourceSlotId: "slot-b" }), scope: { dateKey: "2026-07-19", sourceRowIds: ["row-c"], workCenterIds: ["D7"] }, coveredSourceRowIds: ["row-c"] }),
      };
    }
    if (mode === "scope-mismatch") {
      return {
        status: 200,
        ok: true,
        headers: { get: () => '"dispatch-mismatch-v1"' },
        json: async () => ({ ...payloadFor({ id: "assignment-mismatch", sourceRowId: "row-a", sourceSlotId: "slot-a" }), scope: { dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D9"] } }),
      };
    }
    if (mode === "same-etag") {
      return {
        status: 200,
        ok: true,
        headers: { get: () => '"dispatch-a-v1"' },
        json: async () => payloadFor({ id: "assignment-a-v2", sourceRowId: "row-a", sourceSlotId: "slot-a" }),
      };
    }
    return {
      status: 200,
      ok: true,
      headers: { get: () => '"dispatch-a-v1"' },
      json: async () => payloadFor({ id: "assignment-a", sourceRowId: "row-a", sourceSlotId: "slot-a" }),
    };
  },
});

const first = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-b", "row-a", "row-b"], workCenterIds: ["D5", "D3", "D5"] });
assert(first.ok && first.changed, "the first compact dispatch response must populate its cache");
assert(requests[0]?.url.endsWith("?dateKey=2026-07-18&sourceRowId=row-a&sourceRowId=row-b&workCenterId=D3&workCenterId=D5"), "dispatch query parameters must be canonical, sorted, and deduplicated");
assert(model.getBySourceRowId("row-a")?.id === "assignment-a" && model.getBySourceSlotId("slot-a")?.id === "assignment-a", "dispatch lookups must use the active scoped response");
assert(model.getState().carryovers.length === 1 && model.getState().coverageComplete, "compact metadata must remain available to the caller");

await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D3", "D5"] });
assert(calls === 1, "a canonical equivalent scope must reuse its own fresh cache");
mode = "scope-b";
await model.refresh({ dateKey: "2026-07-19", sourceRowIds: ["row-c"], workCenterIds: ["D7"] });
assert(calls === 2 && model.getItems()[0]?.id === "assignment-b", "another board scope must have an independent cache entry");
await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D3", "D5"] });
assert(calls === 2 && model.getItems()[0]?.id === "assignment-a", "returning to the first scope must retain its independent cache entry");

clock += 31_000;
mode = "not-modified";
const unchanged = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-b", "row-a"], workCenterIds: ["D5", "D3"] });
assert(unchanged.ok && !unchanged.changed && model.getItems()[0]?.id === "assignment-a", "304 must retain the scoped response and refresh its age");

const beforeInvalid = calls;
const invalidRows = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: [], workCenterIds: ["D5"] });
const invalidDate = await model.refresh({ dateKey: "2026-18-99", sourceRowIds: ["row-a"], workCenterIds: ["D5"] });
const invalidWorkCenters = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-a"], workCenterIds: [] });
assert(!invalidRows.ok && !invalidDate.ok && !invalidWorkCenters.ok && calls === beforeInvalid, "invalid dispatch scopes must fail locally without a network request");

mode = "scope-mismatch";
const mismatched = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D3", "D5"], force: true });
assert(!mismatched.ok && /another scope/.test(mismatched.error || "") && model.getItems()[0]?.id === "assignment-a", "a response for another work-center scope must not replace the active board cache");

mode = "offline";
const retained = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D3", "D5"], force: true });
assert(!retained.ok && retained.items[0]?.id === "assignment-a" && model.getItems()[0]?.id === "assignment-a", "a failed refresh must retain the last verified response for that scope");
assert(model.getState().available && model.getState().error === "offline", "a retained stale payload must remain readable but expose the refresh error to write guards");

mode = "same-etag";
const sameRevision = await model.refresh({ dateKey: "2026-07-18", sourceRowIds: ["row-a", "row-b"], workCenterIds: ["D3", "D5"], force: true });
assert(sameRevision.ok && !sameRevision.changed, "a 200 response with the same transport revision must not require a full payload comparison");
const source = await readFile(new URL("../src/modules/domain_api/shift_execution_dispatch_read_model.ts", import.meta.url), "utf8");
assert(!source.includes("JSON.stringify"), "compact dispatch change detection must not stringify full response payloads");

console.log("Shift execution dispatch read model QA: OK");
});
