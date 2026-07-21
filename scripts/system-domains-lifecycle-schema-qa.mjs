import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  SYSTEM_DOMAINS_LIFECYCLE_MIGRATION,
  projectSystemDomainsCommandReadiness,
} from "./domain-system-domains-repository.mjs";
import { normalizeSystemDomains } from "../src/modules/system_domains/service.js";

assert.equal(SYSTEM_DOMAINS_LIFECYCLE_MIGRATION, "033_system_domains_lifecycle_archived_at");
const readyRow = { archived_at_columns: 5, responsibility_policy_columns: 2, lifecycle_migration_applied: true, responsibility_migration_applied: true };
assert.equal(projectSystemDomainsCommandReadiness(readyRow).schemaReady, true);
assert.equal(projectSystemDomainsCommandReadiness({ ...readyRow, archived_at_columns: 4 }).schemaReady, false);
assert.equal(projectSystemDomainsCommandReadiness({ ...readyRow, responsibility_policy_columns: 1 }).schemaReady, false);
assert.equal(projectSystemDomainsCommandReadiness({ ...readyRow, lifecycle_migration_applied: false }).schemaReady, false);
assert.equal(projectSystemDomainsCommandReadiness({ ...readyRow, responsibility_migration_applied: false }).schemaReady, false);

const canonical = normalizeSystemDomains({
  metadata: {},
  registries: {
    orgUnits: [{ id: "org", archivedAt: "", updatedAt: "2026-07-22T00:00:00.000Z" }],
    workCenters: [{ id: "wc", archivedAt: "", updatedAt: "2026-07-22T00:00:00.000Z" }],
    positions: [{ id: "position", archivedAt: "", updatedAt: "2026-07-22T00:00:00.000Z" }],
    employees: [{ id: "employee", archivedAt: "", updatedAt: "2026-07-22T00:00:00.000Z" }],
    employmentAssignments: [{ id: "assignment", updatedAt: "2026-07-22T00:00:00.000Z" }],
    equipment: [{ id: "equipment", archivedAt: "", updatedAt: "2026-07-22T00:00:00.000Z" }],
  },
});
for (const registry of ["orgUnits", "workCenters", "positions", "employees", "equipment"]) {
  assert.equal(Object.hasOwn(canonical.registries[registry][0], "archivedAt"), false, `${registry} empty archivedAt must be canonicalized out`);
  assert.equal(Object.hasOwn(canonical.registries[registry][0], "updatedAt"), false, `${registry} nondurable updatedAt must be canonicalized out`);
}
assert.equal(Object.hasOwn(canonical.registries.employmentAssignments[0], "updatedAt"), false);
assert.deepEqual(normalizeSystemDomains(canonical), canonical, "canonical lifecycle projection must be idempotent across replace/get normalization");

const [migration, repository, api, recovery] = await Promise.all([
  readFile(new URL("../db/migrations/033_system_domains_lifecycle_archived_at.sql", import.meta.url), "utf8"),
  readFile(new URL("./domain-system-domains-repository.mjs", import.meta.url), "utf8"),
  readFile(new URL("./domain-api.mjs", import.meta.url), "utf8"),
  readFile(new URL("../ops/postgres/recover-system-domains-primary-command-surfaces.sh", import.meta.url), "utf8"),
]);

for (const [registry, table] of [
  ["orgUnits", "system_org_units"],
  ["workCenters", "system_work_centers"],
  ["positions", "system_positions"],
  ["employees", "system_employees"],
  ["equipment", "system_equipment"],
]) {
  assert.match(migration, new RegExp(`ALTER TABLE ${table}[\\s\\S]+ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`));
  const insertPattern = new RegExp(`INSERT INTO ${table} \\([^\\n]+archived_at[^\\n]+\\)[\\s\\S]+timestamp\\(item\\.archivedAt\\)`);
  assert.match(repository, insertPattern, `${registry} archivedAt must be persisted`);
  const hydratePattern = new RegExp(`${registry}: [^\\n]+r\\.archived_at \\? \\{ archivedAt:iso\\(r\\.archived_at\\) \\} : \\{\\}`);
  assert.match(repository, hydratePattern, `${registry} archivedAt must be hydrated`);
}
assert.doesNotMatch(migration, /DROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN)/i);

// Before migration 033, SELECT * rows simply have no archived_at property and
// the conditional projection omits the field exactly as the old release did.
// Command writes are separately gated by schemaReady, so candidate activation
// with owners OFF remains healthy until the root migration unit runs.
assert.match(repository, /\.\.\.\(r\.archived_at \? \{ archivedAt:iso\(r\.archived_at\) \} : \{\}\)/);
assert.match(repository, /data_type = 'timestamp with time zone'/, "a pre-existing wrong-type archived_at column must keep commands fail closed");
assert.match(repository, /column_name = 'is_active' AND data_type = 'boolean'/, "Responsibility Policy lifecycle type drift must keep commands fail closed");
assert.match(repository, /026_system_responsibility_policy_lifecycle/, "migration 026 must be proven alongside migration 033");
assert.match(api, /schemaReady: commandReadiness\.schemaReady === true/);
assert.match(api, /system-domains-command-schema-not-ready/);
assert.match(recovery, /Run mes-pilot-domain-migrate\.service and prove migration 033/);
assert.ok(recovery.indexOf("pre_capabilities=") < recovery.indexOf('install -m 0644 "${APP_DIR}/ops/postgres/mes-pilot-system-domains-production-structure.conf"'), "migration readiness must be proven before owner recovery changes systemd");

console.log("System Domains lifecycle schema QA: OK");
console.log("- pre-033 reads stay compatible while command writes fail closed: pass");
console.log("- five lifecycle registries persist/hydrate archivedAt after migration 033: pass");
