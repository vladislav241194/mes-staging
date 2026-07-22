import assert from "node:assert/strict";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "./fixtures/production_structure_matrix_data.js";
import {
  getProductionStructureEmployees as getLegacyEmployees,
  getProductionStructureResources as getLegacyResources,
  getProductionStructureWorkCenters as getLegacyWorkCenters,
} from "../src/production_structure_service.js";
import { migrateLegacySystemDomains } from "../src/modules/system_domains/service.js";
import {
  createSystemDomainCanonicalWorkCenterIdMap,
  getSystemDomainAccessSubject,
  getSystemDomainSummary,
  projectSystemDomainEmployees,
  projectSystemDomainResources,
  projectSystemDomainWorkCenters,
  toAccessControlAssignments,
  toAccessControlRoles,
  toPersonnelCalendarModel,
} from "../src/modules/system_domains/runtime_adapter.js";
import { validatePersonnelCalendarModel } from "../src/modules/personnel_calendar/service.js";

const legacyWorkCenters = getLegacyWorkCenters();
const legacyResources = getLegacyResources();
const legacyEmployees = getLegacyEmployees();
const { domains, report } = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
assert.equal(report.canActivate, true);

const workCenters = projectSystemDomainWorkCenters(domains, legacyWorkCenters);
const resources = projectSystemDomainResources(domains, legacyResources, legacyWorkCenters);
const employees = projectSystemDomainEmployees(domains, legacyEmployees, legacyWorkCenters);
const canonicalWorkCenterIdByRuntimeId = createSystemDomainCanonicalWorkCenterIdMap(domains, legacyWorkCenters);
assert.equal(workCenters.length, domains.registries.workCenters.length);
assert.equal(employees.length, domains.registries.employees.length);
assert.ok(resources.length >= domains.registries.equipment.length);
assert.ok(workCenters.every((row) => row.id && row.domainId));
assert.ok(employees.every((row) => row.id && row.positionId && Array.isArray(row.workCenterIds)));
assert.deepEqual(
  workCenters.map((row) => row.id).sort(),
  legacyWorkCenters.map((row) => row.id).sort(),
  "Runtime work-center ids must stay stable through the canonical projection",
);
assert.deepEqual(
  Object.fromEntries(["D5", "D9", "D3", "D3_AOI", "D3_UW", "D4"].map((runtimeId) => [
    runtimeId,
    canonicalWorkCenterIdByRuntimeId.get(runtimeId),
  ])),
  {
    D5: "D-MANUAL",
    D9: "S-LOCKSMITH-1",
    D3: "D-SMT",
    D3_AOI: "S-AOI",
    D3_UW: "S-WASH",
    D4: "D-QC",
  },
  "Bounded planning runtime IDs must resolve back to their canonical System Domain owners",
);
assert.deepEqual(
  employees.map((row) => row.id).sort(),
  legacyEmployees.map((row) => row.id).sort(),
  "Employee ids must stay stable through the canonical projection",
);
assert.deepEqual(
  resources.map((row) => row.id).sort(),
  legacyResources.map((row) => row.id).sort(),
  "Planning resource ids must stay stable through the canonical projection",
);
assert.ok(workCenters.filter((row) => row.isPlanningUnit).length >= legacyWorkCenters.filter((row) => row.isPlanningUnit).length);
const explicitRuntimeDomains = structuredClone(domains);
const explicitRuntimeCenter = explicitRuntimeDomains.registries.workCenters.find((center) => {
  const projected = workCenters.find((row) => row.domainId === center.id);
  return Boolean(projected?.parentWorkCenterId && projected?.isPlanningUnit);
});
assert.ok(explicitRuntimeCenter, "Fixture must contain a nested planning work center");
explicitRuntimeCenter.parentWorkCenterId = "";
explicitRuntimeCenter.participatesInPlanning = false;
explicitRuntimeCenter.showInGantt = false;
const explicitRuntimeProjection = projectSystemDomainWorkCenters(explicitRuntimeDomains, legacyWorkCenters).find((row) => row.domainId === explicitRuntimeCenter.id);
assert.equal(explicitRuntimeProjection.parentWorkCenterId, "", "Explicitly cleared parent must not return from the legacy projection");
assert.equal(explicitRuntimeProjection.participatesInPlanning, false, "Explicit planning opt-out must survive the runtime projection");
assert.equal(explicitRuntimeProjection.isPlanningUnit, false, "Planning and Gantt opt-out must not return through legacy isPlanningUnit fallback");
assert.equal(explicitRuntimeProjection.showInGantt, false, "Explicit Gantt opt-out must survive the runtime projection");
assert.equal(
  employees.find((row) => row.id === "MGMT-PROD-DIRECTOR-EMP-01")?.department,
  "Административный отдел",
  "A root-level production director must retain the virtual administrative department in runtime projection",
);

const calendar = toPersonnelCalendarModel(domains);
const calendarValidation = validatePersonnelCalendarModel(calendar);
assert.equal(calendarValidation.valid, true);
assert.deepEqual(calendarValidation.issues, []);
assert.equal(calendar.scheduleAssignments.length, employees.length);

const summary = getSystemDomainSummary(domains);
assert.equal(summary.employees, employees.length);
assert.equal(summary.equipment, domains.registries.equipment.length);

const roles = toAccessControlRoles(domains);
const assignments = toAccessControlAssignments(domains);
assert.equal(roles.length, 7);
assert.deepEqual(assignments, []);
const subject = getSystemDomainAccessSubject(domains, employees[0].id);
assert.equal(subject.id, employees[0].id);
assert.ok(subject.positionId);

console.log(JSON.stringify({
  status: "ok",
  workCenters: workCenters.length,
  resources: resources.length,
  employees: employees.length,
  scheduleTemplates: calendar.scheduleTemplates.length,
  roles: roles.length,
}, null, 2));
