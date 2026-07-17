import { createHash } from "node:crypto";

export const SPECIFICATIONS2_ATTACHMENT_MAX_BYTES = 1024 * 1024;

function clean(value) {
  return String(value ?? "").trim();
}

function contentBuffer(contentBase64) {
  const value = clean(contentBase64);
  if (!value) throw new Error("Attachment content is required");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Attachment content must be valid base64");
  const content = Buffer.from(value, "base64");
  if (!content.length) throw new Error("Attachment content is empty");
  if (content.length > SPECIFICATIONS2_ATTACHMENT_MAX_BYTES) throw new Error("Attachment exceeds the 1 MB pilot limit");
  return content;
}

export function buildSpecifications2AttachmentCommand(input = {}) {
  const fileName = clean(input.fileName);
  const mediaType = clean(input.mediaType) || "application/octet-stream";
  if (!fileName || fileName.length > 255) throw new Error("Attachment file name is required and must fit 255 characters");
  if (mediaType.length > 255) throw new Error("Attachment media type must fit 255 characters");
  const content = contentBuffer(input.contentBase64);
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const id = clean(input.id) || `spec2file-${digest.slice(7, 31)}`;
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(id)) throw new Error("Attachment id has an invalid format");
  return { id, fileName, mediaType, content, byteSize: content.length, contentDigest: digest };
}
