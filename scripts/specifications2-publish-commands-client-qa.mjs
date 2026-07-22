import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryRoot = await mkdtemp(join(tmpdir(), "mes-specifications2-publish-client-"));
try {
const output = join(temporaryRoot, "specifications2-publish-commands.mjs");
await build({
  entryPoints: [fileURLToPath(new URL("../src/modules/domain_api/specifications2_publish_commands.ts", import.meta.url))],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "silent",
});
const { createSpecifications2PublishCommands } = await import(`${pathToFileURL(output).href}?qa=${Date.now()}`);

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
assert(JSON.parse(calls[1]?.options?.body || "{}").expectedPreviousRevision === 0, "client must send the candidate revision's expected server base");
const primaryCapability = await enabled.refreshCapability();
assert(primaryCapability.ok && primaryCapability.enabled, "client must expose a usable server publication capability");
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

const revisionConflict = createSpecifications2PublishCommands({ fetchImpl: async (url) => {
  if (url.endsWith("/capabilities")) return { ok: true, status: 200, json: async () => ({ revisionPublicationEnabled: true, revisionPublicationServerPrimary: true }) };
  return { ok: false, status: 409, json: async () => ({ conflict: true, currentRevision: 7, error: "server revision advanced" }) };
} });
const conflicted = await revisionConflict.publishRevision({ entry: { id: "spec-conflict", publication: { revision: 7 } }, expectedPreviousRevision: 6 });
assert(!conflicted.ok && conflicted.conflict && conflicted.currentRevision === 7 && !conflicted.disabled, "revision collision must be surfaced as a refresh-required conflict, not as a disabled rollout");

let failedCapabilityRequests = 0;
const primaryUnavailable = createSpecifications2PublishCommands({
  serverPrimaryPolicy: true,
  fetchImpl: async () => {
    failedCapabilityRequests += 1;
    throw new Error("network unavailable");
  },
});
const firstUnavailable = await primaryUnavailable.refreshCapability();
const secondUnavailable = await primaryUnavailable.refreshCapability();
assert(!firstUnavailable.ok && firstUnavailable.serverPrimary && !secondUnavailable.ok && secondUnavailable.serverPrimary, "a configured server-primary client must fail closed when capability discovery is unavailable");
assert(failedCapabilityRequests === 2, "a failed capability probe must not be cached as a successful legacy capability");
console.log("Specifications 2.0 publish commands client QA: OK");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
