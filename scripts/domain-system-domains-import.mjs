import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { loadSystemDomains } from "../src/modules/system_domains/service.js";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";

function arg(name) { return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ""; }
function assert(value, message) { if (!value) throw new Error(message); }

const input = arg("--input");
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
assert(input, "Usage: node scripts/domain-system-domains-import.mjs --input=/path/to/shared-state.json [--apply]");
const snapshot = JSON.parse(await readFile(input, "utf8"));
const stored = snapshot?.values?.[SYSTEM_DOMAINS_STORAGE_KEY];
assert(stored, `Shared state does not contain ${SYSTEM_DOMAINS_STORAGE_KEY}`);
const loaded = loadSystemDomains(stored, { strict: true });
const counts = Object.fromEntries(Object.entries(loaded.domains.registries).map(([name, items]) => [name, items.length]));

if (!apply) {
  console.log(JSON.stringify({ ok: true, mode: "dry-run", input: basename(input), schemaId: loaded.domains.schemaId, schemaVersion: loaded.domains.schemaVersion, counts }));
  process.exit(0);
}

const repository = createSystemDomainsRepository();
try {
  const result = await repository.replace(loaded.domains, { source: `shared-state:${basename(input)}`, force });
  console.log(JSON.stringify({ ok: true, mode: "apply", ...result, counts }));
} finally { await repository.close(); }
