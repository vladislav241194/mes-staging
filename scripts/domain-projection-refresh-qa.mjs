import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(fileURLToPath(new URL("../ops/postgres/refresh-domain-projections-from-snapshot.sh", import.meta.url)), "utf8");
const assertions = [
  ["mes-pilot-domain-import.service", "must refresh the work-order projection through the hardened import service"],
  ["domain:postgres:import-system-domains", "must refresh System Domains from the same snapshot"],
  ["system_domains_guard", "must read System Domains consistency before a reverse import"],
  ["Refusing reverse import", "must stop a stale snapshot before writing any projection"],
  ["/api/v1/planning/work-orders/parity", "must verify work-order parity"],
  ["/api/v1/system-domains/consistency", "must verify System Domains parity"],
  ["/api/v1/domain-readiness", "must verify final domain readiness"],
  ["Run as root", "must remain a root-only controlled operation"],
];
const failures = assertions.filter(([needle]) => !source.includes(needle)).map(([, message]) => message);
if (failures.length) throw new Error(`Domain projection refresh QA failed: ${failures.join("; ")}`);
console.log("Domain projection refresh QA: OK");
