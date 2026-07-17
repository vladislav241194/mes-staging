import { createSpecifications2PublishCommands } from "../src/modules/domain_api/specifications2_publish_commands.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const calls = [];
const enabled = createSpecifications2PublishCommands({ fetchImpl: async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith("/capabilities")) return { ok: true, status: 200, json: async () => ({ revisionPublicationEnabled: true }) };
  return { ok: true, status: 201, json: async () => ({ ok: true, created: true, item: { id: "revision-1" } }) };
} });
const saved = await enabled.publishRevision({ entry: { id: "spec-1", publication: { revision: 1 } }, idempotencyKey: "publish-1" });
assert(saved.ok && saved.created && saved.item?.id === "revision-1", "client must return a published server revision");
assert(calls[0]?.url?.endsWith("/capabilities"), "client must check publication capability before sending a revision");
assert(calls[1]?.options?.headers?.["Idempotency-Key"] === "publish-1" && calls[1]?.options?.credentials === "same-origin", "client must send idempotency and same-origin credentials");
const sanitized = createSpecifications2PublishCommands({ fetchImpl: async (url, options) => {
  if (url.endsWith("/capabilities")) return { ok: true, status: 200, json: async () => ({ revisionPublicationEnabled: true }) };
  const entry = JSON.parse(options.body).entry;
  assert(!entry.routeDrafts[0].operations[0].productionFiles.pnp.inlineDataUrl, "client must never send inline attachment bytes with a revision");
  return { ok: true, status: 201, json: async () => ({ ok: true, created: true, item: { id: "revision-2" } }) };
} });
await sanitized.publishRevision({ entry: { id: "spec-2", routeDrafts: [{ operations: [{ productionFiles: { pnp: { name: "board.txt", inlineDataUrl: "data:text/plain;base64,Zm9v" } } }] }] } });
const disabledCalls = [];
const disabled = createSpecifications2PublishCommands({ fetchImpl: async (url) => {
  disabledCalls.push(url);
  return { ok: true, status: 200, json: async () => ({ revisionPublicationEnabled: false }) };
} });
const blocked = await disabled.publishRevision({ entry: { id: "spec-1" } });
assert(!blocked.ok && blocked.disabled, "disabled rollout must remain a recoverable compatibility state");
assert(disabledCalls.length === 1 && disabledCalls[0].endsWith("/capabilities"), "disabled rollout must not send the specification payload to the server");
console.log("Specifications 2.0 publish commands client QA: OK");
