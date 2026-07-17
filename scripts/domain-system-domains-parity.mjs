import { readFile } from "node:fs/promises";
import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { loadSystemDomains, serializeSystemDomains } from "../src/modules/system_domains/service.js";
import { createSystemDomainsRepository } from "./domain-system-domains-repository.mjs";

function arg(name) { return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || ""; }
function assert(value, message) { if (!value) throw new Error(message); }
const input = arg("--input");
assert(input, "Usage: node scripts/domain-system-domains-parity.mjs --input=/path/to/shared-state.json");
const snapshot = JSON.parse(await readFile(input, "utf8"));
const rawSource = snapshot?.values?.[SYSTEM_DOMAINS_STORAGE_KEY];
const snapshotRetired = rawSource === null
  && Object.prototype.hasOwnProperty.call(snapshot?.values || {}, SYSTEM_DOMAINS_STORAGE_KEY);
const source = snapshotRetired ? null : loadSystemDomains(rawSource || "", { strict: true }).domains;
const repository = createSystemDomainsRepository();
try {
  const target = await repository.get();
  assert(target.item, "System Domains PostgreSQL projection is not initialized");
  if (snapshotRetired) {
    const targetCounts = Object.fromEntries(Object.entries(target.item.registries).map(([name, items]) => [name, items.length]));
    console.log(JSON.stringify({
      ok: true,
      authority: "postgresql",
      snapshotState: "retired",
      revision: target.revision,
      sourceCounts: null,
      targetCounts,
      sourceBytes: 0,
      targetBytes: Buffer.byteLength(serializeSystemDomains(target.item)),
    }));
  } else {
    const sourceJson = serializeSystemDomains(source);
    const targetJson = serializeSystemDomains(target.item);
    const sourceCounts = Object.fromEntries(Object.entries(source.registries).map(([name, items]) => [name, items.length]));
    const targetCounts = Object.fromEntries(Object.entries(target.item.registries).map(([name, items]) => [name, items.length]));
    const matches = sourceJson === targetJson;
    console.log(JSON.stringify({ ok: matches, revision: target.revision, sourceCounts, targetCounts, sourceBytes: Buffer.byteLength(sourceJson), targetBytes: Buffer.byteLength(targetJson) }));
    if (!matches) process.exitCode = 1;
  }
} finally { await repository.close(); }
