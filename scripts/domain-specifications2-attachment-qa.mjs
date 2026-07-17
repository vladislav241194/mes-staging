import { buildSpecifications2AttachmentCommand, SPECIFICATIONS2_ATTACHMENT_MAX_BYTES } from "../src/domain/specifications2_attachment.js";

const assert = (value, message) => { if (!value) throw new Error(message); };
const first = buildSpecifications2AttachmentCommand({ fileName: "program.txt", mediaType: "text/plain", contentBase64: "Zm9v" });
const second = buildSpecifications2AttachmentCommand({ fileName: "renamed.txt", mediaType: "text/plain", contentBase64: "Zm9v" });
assert(first.byteSize === 3 && first.contentDigest.startsWith("sha256:"), "attachment command must decode bytes and derive a content digest");
assert(first.id === second.id, "same attachment bytes must receive a stable deduplication id");
let oversized = false;
try { buildSpecifications2AttachmentCommand({ fileName: "large.bin", contentBase64: Buffer.alloc(SPECIFICATIONS2_ATTACHMENT_MAX_BYTES + 1).toString("base64") }); } catch (error) { oversized = /1 MB/.test(String(error.message)); }
assert(oversized, "attachment command must reject files over the pilot storage limit");
let malformed = false;
try { buildSpecifications2AttachmentCommand({ fileName: "bad.bin", contentBase64: "not-base64" }); } catch { malformed = true; }
assert(malformed, "attachment command must reject malformed base64");
console.log("Specifications 2.0 attachment command QA: OK");
