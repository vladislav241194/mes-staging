import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SYSTEM_DOMAINS_STORAGE_KEY } from "../src/app_constants.js";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import {
  getProductionStructureEmployees as getLegacyEmployees,
  getProductionStructureResources as getLegacyResources,
  getProductionStructureWorkCenters as getLegacyWorkCenters,
} from "../src/production_structure_service.js";
import {
  loadSystemDomains,
  migrateLegacySystemDomains,
  serializeSystemDomains,
} from "../src/modules/system_domains/service.js";
import {
  projectSystemDomainEmployees,
  projectSystemDomainResources,
  projectSystemDomainWorkCenters,
  toAccessControlAssignments,
  toAccessControlRoles,
  toPersonnelCalendarModel,
} from "../src/modules/system_domains/runtime_adapter.js";
import { validatePersonnelCalendarModel } from "../src/modules/personnel_calendar/service.js";

const inputArg = process.argv.find((arg) => arg.startsWith("--input="))?.slice("--input=".length)
  || process.argv[process.argv.indexOf("--input") + 1];
assert(inputArg, "Usage: node scripts/system-domains-shared-state-migration-qa.mjs --input=/path/to/shared-state.json");

const inputPath = resolve(inputArg);
const source = await readFile(inputPath, "utf8");
const sourceHash = createHash("sha256").update(source).digest("hex");
const snapshot = JSON.parse(source);
const values = asRecord(snapshot.values);
const sharedUi = asRecord(snapshot.sharedUi);

assert(typeof values["mes-planning-prototype-state-v2"] === "string", "Shared-state snapshot is missing planning state.");
assert(typeof values["mes-planning-prototype-directories-v2"] === "string", "Shared-state snapshot is missing directories state.");

const legacyWorkCenters = getLegacyWorkCenters();
const legacyResources = getLegacyResources();
const legacyEmployees = getLegacyEmployees();
const explicitRoleAssignments = asRecord(sharedUi.accessRoleAssignments);
const inferredRoleAssignments = Object.fromEntries(legacyEmployees.map((employee) => [
  employee.id,
  explicitRoleAssignments[employee.id] || inferAccessRoleIdForPerson(employee),
]));

const storedDomains = typeof values[SYSTEM_DOMAINS_STORAGE_KEY] === "string"
  ? loadSystemDomains(values[SYSTEM_DOMAINS_STORAGE_KEY], { strict: true })
  : null;
const migration = storedDomains
  ? { domains: storedDomains.domains, report: { validation: storedDomains.report, canActivate: storedDomains.report.valid, orphans: [], duplicates: [], unmatchedMatrixOverrideKeys: [] } }
  : migrateLegacySystemDomains({
    matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS,
    matrixOverrides: asRecord(sharedUi.productionStructureMatrixOverrides),
    legacyUi: {
      ...sharedUi,
      accessRoleAssignments: inferredRoleAssignments,
    },
    migratedAt: String(snapshot.updatedAt || "1970-01-01T00:00:00.000Z"),
  });

const { domains, report } = migration;
assert.equal(report.validation?.valid, true, `System Domains validation failed: ${JSON.stringify(report.validation?.errors || [])}`);
assert.equal(report.canActivate, true, "System Domains snapshot is not safe to activate.");
assert.deepEqual(report.orphans || [], [], `System Domains migration produced orphans: ${JSON.stringify(report.orphans)}`);
assert.deepEqual(report.duplicates || [], [], `System Domains migration produced duplicate ids: ${JSON.stringify(report.duplicates)}`);
assert.deepEqual(report.unmatchedMatrixOverrideKeys || [], [], `System Domains migration left unmatched matrix overrides: ${JSON.stringify(report.unmatchedMatrixOverrideKeys)}`);

const workCenters = projectSystemDomainWorkCenters(domains, legacyWorkCenters);
const resources = projectSystemDomainResources(domains, legacyResources, legacyWorkCenters);
const employees = projectSystemDomainEmployees(domains, legacyEmployees, legacyWorkCenters);

assert.deepEqual(sortedIds(workCenters), sortedIds(legacyWorkCenters), "Work-center runtime ids changed during migration.");
assert.deepEqual(sortedIds(resources), sortedIds(legacyResources), "Planning resource runtime ids changed during migration.");
assert.deepEqual(sortedIds(employees), sortedIds(legacyEmployees), "Employee runtime ids changed during migration.");

const calendar = toPersonnelCalendarModel(domains);
const calendarValidation = validatePersonnelCalendarModel(calendar);
assert.equal(calendarValidation.valid, true, `Personnel calendar projection is invalid: ${JSON.stringify(calendarValidation.issues)}`);
assert.equal(calendar.scheduleAssignments.length, legacyEmployees.length, "Every employee must retain one effective schedule assignment.");

const roles = toAccessControlRoles(domains);
const assignments = toAccessControlAssignments(domains);
assert.equal(roles.length, 7, "Seven canonical access roles are required.");
assert.equal(assignments.length, legacyEmployees.length, "Every migrated employee must have an explicit access-role assignment.");

const serialized = serializeSystemDomains(domains);
const roundTrip = loadSystemDomains(serialized, { strict: true });
assert.equal(roundTrip.report.valid, true, "Serialized System Domains failed strict reload.");
assert.equal(serializeSystemDomains(roundTrip.domains), serialized, "System Domains serialization is not stable.");
assert.equal(createHash("sha256").update(await readFile(inputPath, "utf8")).digest("hex"), sourceHash, "Migration QA modified its source snapshot.");

const counts = Object.fromEntries(Object.entries(domains.registries).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0]));
console.log("System Domains Shared-State Migration QA");
console.log(`- input: ${inputPath}`);
console.log(`- source sha256: ${sourceHash}`);
console.log(`- snapshot version: ${snapshot.version}`);
console.log(`- mode: ${storedDomains ? "canonical-existing" : "legacy-migration"}`);
console.log(`- runtime parity: workCenters=${workCenters.length}, resources=${resources.length}, employees=${employees.length}`);
console.log(`- calendar: templates=${calendar.scheduleTemplates.length}, assignments=${calendar.scheduleAssignments.length}`);
console.log(`- access: roles=${roles.length}, grants=${counts.grants}, assignments=${assignments.length}`);
console.log("- source snapshot remained byte-identical");
console.log("OK: pilot shared-state copy can activate System Domains without runtime id loss.");

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeLookupText(value = "") {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function inferAccessRoleIdForPerson(person = {}) {
  const lookup = normalizeLookupText(`${person.name || ""} ${person.role || ""} ${person.department || ""}`);
  if (/директор|начальник производства|руководитель производства/.test(lookup)) return "productionHead";
  if (/технолог|инженер|подготовк/.test(lookup)) return "technologist";
  if (/диспетчер|пдо|планиров/.test(lookup)) return "planner";
  if (person.personKind === "master" || person.canDistribute || /мастер|начальник участка|начальник отдела/.test(lookup)) return "master";
  if (person.canCloseFact && !person.canExecute) return "dispatcher";
  return "executor";
}

function sortedIds(rows = []) {
  return rows.map((row) => String(row?.id || "")).filter(Boolean).sort();
}
