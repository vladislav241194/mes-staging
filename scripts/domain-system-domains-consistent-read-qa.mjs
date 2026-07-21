import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(
  fileURLToPath(new URL("./domain-system-domains-repository.mjs", import.meta.url)),
  "utf8",
);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const section = (start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `missing repository section: ${start}`);
  return source.slice(startIndex, endIndex);
};

const getSource = section("    async get() {", "    async summary() {");
const summarySource = section("    async summary() {", "    async getAuthority() {");
const replaceSource = section("    async replace(value, {", "    async get() {");
const repeatableRead = "sql.begin(\"isolation level repeatable read read only\", async (tx) =>";

for (const [label, readSource] of [["get", getSource], ["summary", summarySource]]) {
  assert(
    readSource.includes(repeatableRead),
    `System Domains ${label} must hold one repeatable-read, read-only PostgreSQL snapshot`,
  );
  assert(
    !/\bsql`/.test(readSource),
    `System Domains ${label} must not borrow the pool outside its transaction snapshot`,
  );
  assert(
    /\btx`/.test(readSource),
    `System Domains ${label} must execute its projection through the transaction client`,
  );
}

assert(
  (getSource.match(/\btx`/g) || []).length >= 15,
  "System Domains get must read the revision row and all registries through one transaction client",
);
assert(
  replaceSource.includes("sql.begin(async (tx) =>")
    && replaceSource.includes("pg_advisory_xact_lock(hashtext('mes-system-domains:primary'))"),
  "System Domains replace must remain transactionally serialized while read snapshots are enforced",
);

console.log("System Domains consistent PostgreSQL read QA: OK");
