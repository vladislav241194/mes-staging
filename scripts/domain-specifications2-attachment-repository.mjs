import postgres from "postgres";
import { buildSpecifications2AttachmentCommand } from "../src/domain/specifications2_attachment.js";

function project(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.file_name,
    mediaType: row.media_type,
    byteSize: Number(row.byte_size || 0),
    contentDigest: row.content_digest,
    createdAt: row.created_at?.toISOString?.() || "",
  };
}

// Blob storage is intentionally isolated from a published revision.  The
// publish command can later verify referenced ids without ever accepting
// browser-local inline bytes in its JSON envelope.
export function createSpecifications2AttachmentRepository({
  databaseUrl = process.env.DATABASE_URL || process.env.MES_DOMAIN_DATABASE_URL || "",
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Specifications 2.0 attachment storage");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  const metadata = { storageMode: "postgres", storageBackend: "postgresql", configured: true };
  return {
    ...metadata,
    async commandReadiness() {
      const rows = await sql`SELECT version FROM mes_schema_migrations WHERE version = '019_specifications2_attachment_blobs'`;
      return { schemaReady: rows.some((row) => row.version === "019_specifications2_attachment_blobs") };
    },
    async put(input = {}, { actorId = "" } = {}) {
      const command = buildSpecifications2AttachmentCommand(input);
      return sql.begin(async (tx) => {
        const byDigest = await tx`
          SELECT id, file_name, media_type, byte_size, content_digest, created_at
          FROM specifications2_attachment_blobs WHERE content_digest = ${command.contentDigest} LIMIT 1
        `;
        if (byDigest[0]) return { ...metadata, created: false, item: project(byDigest[0]) };
        const byId = await tx`SELECT content_digest FROM specifications2_attachment_blobs WHERE id = ${command.id} LIMIT 1`;
        if (byId[0] && byId[0].content_digest !== command.contentDigest) throw new Error("Attachment id already points to another file");
        if (byId[0]) {
          const rows = await tx`SELECT id, file_name, media_type, byte_size, content_digest, created_at FROM specifications2_attachment_blobs WHERE id = ${command.id}`;
          return { ...metadata, created: false, item: project(rows[0]) };
        }
        const rows = await tx`
          INSERT INTO specifications2_attachment_blobs (id, content_digest, file_name, media_type, byte_size, content, created_by)
          VALUES (${command.id}, ${command.contentDigest}, ${command.fileName}, ${command.mediaType}, ${command.byteSize}, ${command.content}, ${String(actorId || "") || null})
          RETURNING id, file_name, media_type, byte_size, content_digest, created_at
        `;
        return { ...metadata, created: true, item: project(rows[0]) };
      });
    },
    async get(id = {}) {
      const rows = await sql`
        SELECT id, file_name, media_type, byte_size, content_digest, content, created_at
        FROM specifications2_attachment_blobs WHERE id = ${String(id || "")} LIMIT 1
      `;
      const row = rows[0];
      return row ? { ...metadata, item: { ...project(row), content: row.content } } : { ...metadata, item: null };
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
