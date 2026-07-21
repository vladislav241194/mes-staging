import { createSpecifications2AttachmentCommands } from "../src/modules/domain_api/specifications2_attachment_commands.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const calls = [];
const enabled = createSpecifications2AttachmentCommands({ fetchImpl: async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith("/capabilities")) return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, capabilities: { attachmentUploadEnabled: true } }),
  };
  if (url.endsWith("/attachments/spec2file-123")) return { ok: true, status: 200, blob: async () => new Blob(["foo"], { type: "text/plain" }) };
  const body = JSON.parse(options.body);
  assert(body.contentBase64 === "Zm9v" && !Object.hasOwn(body, "inlineDataUrl"), "attachment client must transmit the compact base64 payload only to its dedicated endpoint");
  return { ok: true, status: 201, json: async () => ({ ok: true, created: true, item: { id: "spec2file-123", contentDigest: "sha256:x" } }) };
} });
const uploaded = await enabled.upload({ fileName: "program.txt", mediaType: "text/plain", inlineDataUrl: "data:text/plain;base64,Zm9v" });
assert(uploaded.ok && uploaded.item?.id === "spec2file-123" && calls.length === 2, "enabled attachment upload must check capability then send file to the dedicated endpoint");
const downloaded = await enabled.download({ id: "spec2file-123" });
assert(downloaded.ok && downloaded.blob instanceof Blob && calls[2]?.url.endsWith("/attachments/spec2file-123"), "enabled attachment download must use the dedicated binary endpoint");
const disabledCalls = [];
const disabled = createSpecifications2AttachmentCommands({ fetchImpl: async (url) => {
  disabledCalls.push(url);
  return { ok: true, status: 200, json: async () => ({ ok: true, capabilities: { attachmentUploadEnabled: false } }) };
} });
const blocked = await disabled.upload({ fileName: "program.txt", inlineDataUrl: "data:text/plain;base64,Zm9v" });
assert(!blocked.ok && blocked.disabled && disabledCalls.length === 1, "disabled attachment rollout must not transmit a file");
console.log("Specifications 2.0 attachment commands client QA: OK");
