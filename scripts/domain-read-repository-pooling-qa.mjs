import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = async (name) => readFile(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf-8");
const checks = [
  ["domain-system-domains-repository.mjs", "closeSystemDomainsClients", "System Domains"],
  ["domain-shift-execution-repository.mjs", "closeShiftExecutionReadClients", "Shift Execution"],
];
for (const [file, shutdown, label] of checks) {
  const source = await read(file);
  if (!source.includes("const READ_CLIENTS_BY_URL = new Map()") && !source.includes("const CLIENTS_BY_URL = new Map()")) throw new Error(`${label} must own a process-level read pool`);
  if (!source.includes("idle_timeout: 10") || !source.includes("async close() {}") || !source.includes(shutdown)) throw new Error(`${label} must borrow a bounded pool and expose process shutdown`);
}
const systemDomains = await read("domain-system-domains-repository.mjs");
if (!systemDomains.includes("single compact SQL roundtrip") || systemDomains.includes("const result = await this.get();\n      const counts")) {
  throw new Error("System Domains summary must use a compact count projection instead of loading every registry row");
}
console.log("Domain read repository pooling QA: OK");
