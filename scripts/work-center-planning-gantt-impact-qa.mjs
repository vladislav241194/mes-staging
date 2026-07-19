import assert from "node:assert/strict";
import { PRODUCTION_STRUCTURE_MATRIX_ROWS } from "../src/production_structure_matrix_data.js";
import { getProductionStructureWorkCenters as getLegacyWorkCenters } from "../src/production_structure_service.js";
import { createPlanningCoreServiceModule } from "../src/modules/planning_core/service.js";
import { migrateLegacySystemDomains, validateSystemDomains } from "../src/modules/system_domains/service.js";
import { projectSystemDomainEmployees, projectSystemDomainWorkCenters } from "../src/modules/system_domains/runtime_adapter.js";

const legacyWorkCenters = getLegacyWorkCenters();
const { domains } = migrateLegacySystemDomains({ matrixRows: PRODUCTION_STRUCTURE_MATRIX_ROWS });
const baselineProjection = projectSystemDomainWorkCenters(domains, legacyWorkCenters);
const nested = domains.registries.workCenters.find((center) => baselineProjection.find((row) => row.domainId === center.id)?.parentWorkCenterId);
assert.ok(nested, "impact fixture requires a nested work center");

let planningState = { workCenters: baselineProjection };
const planning = createPlanningCoreServiceModule({
  MES_LEGACY_WORK_CENTER_ID_MAP: {}, MES_LEGACY_WORK_CENTER_NAME_MAP: {}, MES_OBSOLETE_WORK_CENTER_IDS: new Set(), MES_SMT_WORK_CENTER_IDS: [],
  getPlanningState: () => planningState, setPlanningState: (value) => { planningState = value; }, getUi: () => ({}), setUi: () => {}, getDirectoryState: () => ({}), setDirectoryState: () => {},
  getProductionStructureWorkCenters: () => planningState.workCenters, getProductionStructureMatrixRuntimeOverrides: () => ({}), getWorkCenter: (id) => planningState.workCenters.find((row) => row.id === id),
  normalizeLookupText: (value) => String(value || "").trim().toLowerCase(),
});

const editedDomains = structuredClone(domains);
const edited = editedDomains.registries.workCenters.find((center) => center.id === nested.id);
edited.name = `${edited.name} QA`;
edited.parentWorkCenterId = "";
edited.participatesInPlanning = false;
edited.showInGantt = false;
assert.equal(validateSystemDomains(editedDomains).valid, true, "bounded work-center edit must remain valid System Domains");
planningState = { workCenters: projectSystemDomainWorkCenters(editedDomains, legacyWorkCenters) };
const hidden = planningState.workCenters.find((row) => row.domainId === edited.id);
assert.equal(hidden.name, edited.name, "rename must reach the shared runtime catalog");
assert.equal(hidden.parentWorkCenterId, "", "cleared parent must reach the shared runtime catalog");
assert.equal(planning.isPlanningWorkCenter(hidden), false, "Planning must exclude a center opted out of Planning and Gantt");
assert.ok(!planning.getPlanningWorkCenters().some((row) => row.id === hidden.id), "Gantt all-row catalog must exclude the opted-out center");

edited.participatesInPlanning = true;
edited.showInGantt = true;
planningState = { workCenters: projectSystemDomainWorkCenters(editedDomains, legacyWorkCenters) };
const restored = planningState.workCenters.find((row) => row.domainId === edited.id);
assert.equal(planning.isPlanningWorkCenter(restored), true, "Planning must include an explicitly restored center");
assert.ok(planning.getPlanningWorkCenters().some((row) => row.id === restored.id), "Gantt all-row catalog must include an explicitly restored center");

edited.isActive = false;
edited.archivedAt = "2026-07-20T00:00:00.000Z";
planningState = { workCenters: projectSystemDomainWorkCenters(editedDomains, legacyWorkCenters) };
const archived = planningState.workCenters.find((row) => row.domainId === edited.id);
assert.equal(planning.isPlanningWorkCenter(archived), false, "Archived center must leave Planning/Gantt catalogs");

edited.isActive = true;
edited.archivedAt = "";
planningState = { workCenters: projectSystemDomainWorkCenters(editedDomains, legacyWorkCenters) };
const reactivated = planningState.workCenters.find((row) => row.domainId === edited.id);
assert.equal(planning.isPlanningWorkCenter(reactivated), true, "Reactivated opted-in center must return to Planning");
assert.ok(planning.getPlanningWorkCenters().some((row) => row.id === reactivated.id), "Reactivated opted-in center must return to Gantt catalog");

const newCenterId = "WC-REACT-IMPACT-QA";
editedDomains.registries.workCenters.push({ id: newCenterId, code: "QA-WC", name: "Рабочий центр QA", orgUnitId: editedDomains.registries.orgUnits[0].id, parentWorkCenterId: "", participatesInPlanning: true, showInGantt: true, isActive: true });
assert.equal(validateSystemDomains(editedDomains).valid, true, "new referenced work center must validate");
planningState = { workCenters: projectSystemDomainWorkCenters(editedDomains, legacyWorkCenters) };
const created = planningState.workCenters.find((row) => row.domainId === newCenterId);
assert.equal(created.id, newCenterId, "new work center must keep its stable id without a legacy row");
assert.equal(planning.isPlanningWorkCenter(created), true, "new opted-in center must reach Planning/Gantt catalogs");

const referencedAssignment = domains.registries.employmentAssignments.find((assignment) => assignment.workCenterId);
assert.ok(referencedAssignment, "impact fixture requires a work-center employee reference");
const beforeEmployee = projectSystemDomainEmployees(domains, [], legacyWorkCenters).find((employee) => employee.id === referencedAssignment.employeeId);
const renamedDomains = structuredClone(domains);
renamedDomains.registries.workCenters.find((center) => center.id === referencedAssignment.workCenterId).name += " QA rename";
const afterEmployee = projectSystemDomainEmployees(renamedDomains, [], legacyWorkCenters).find((employee) => employee.id === referencedAssignment.employeeId);
assert.deepEqual(afterEmployee.workCenterIds, beforeEmployee.workCenterIds, "rename must not rewrite employee/Shift work-center ids");

console.log("Work Center Planning/Gantt impact QA: OK");
console.log("- explicit parent clear and Planning/Gantt opt-out: pass");
console.log("- restore, archive, reactivation and new-center catalog behavior: pass");
console.log("- stable employee/Shift work-center reference across rename: pass");
