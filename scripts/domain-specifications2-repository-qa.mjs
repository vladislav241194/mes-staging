import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(fileURLToPath(new URL("./domain-specifications2-repository.mjs", import.meta.url)), "utf-8");
if (!source.includes("const READ_CLIENTS_BY_URL = new Map()") || !source.includes("function getReadClient(databaseUrl)") || !source.includes("closeSpecifications2ReadClients()")) {
  throw new Error("Specifications 2.0 read repository must reuse a process-level PostgreSQL pool");
}
if (!source.includes("const sql = getReadClient(databaseUrl)") || !source.includes("async close() {}")) {
  throw new Error("Specifications 2.0 request facades must not close the shared PostgreSQL client");
}
console.log("Specifications 2.0 repository pooling QA: OK");
