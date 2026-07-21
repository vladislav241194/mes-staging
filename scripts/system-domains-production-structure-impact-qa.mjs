import assert from "node:assert/strict";

import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";
import { createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";
import { validateSystemDomainsProductionStructureImpact } from "./system-domains-production-structure-impact.mjs";
import {
  isSystemDomainsAssignmentActiveOnDate,
  toSystemDomainsBusinessDate,
} from "../src/domain/system_domains_lifecycle.js";

assert.equal(toSystemDomainsBusinessDate(new Date("2026-07-22T21:30:00.000Z")), "2026-07-23", "Pilot business date must cross midnight in Europe/Moscow, not UTC");
assert.equal(isSystemDomainsAssignmentActiveOnDate({ validTo: "2026-02-31" }, "2026-02-28"), true, "an impossible Gregorian end date must fail closed as continuing");
assert.equal(isSystemDomainsAssignmentActiveOnDate({ isActive: false, validTo: "" }, "2026-07-22"), false, "an explicitly inactive assignment must not block lifecycle");

const current = {
  registries: {
    orgUnits: [
      { id: "org-active-assignment", isActive: true },
      { id: "org-direct-work-center", isActive: true },
      { id: "org-free", isActive: true },
      { id: "org-inactive", isActive: false },
    ],
    workCenters: [
      { id: "work-center-active-assignment", orgUnitId: "org-free", isActive: true },
      { id: "work-center-direct-equipment", orgUnitId: "org-free", isActive: true },
      { id: "work-center-child-parent", orgUnitId: "org-direct-work-center", isActive: true },
      { id: "work-center-free", orgUnitId: "org-free", isActive: true },
      { id: "work-center-inactive", orgUnitId: "org-free", isActive: false },
    ],
    positions: [
      { id: "position-active", isActive: true },
      { id: "position-future-end", isActive: true },
      { id: "position-past-end", isActive: true },
      { id: "position-free", isActive: true },
    ],
    employees: [
      { id: "employee-active", isActive: true },
      { id: "employee-archive-open", isActive: true },
      { id: "employee-archive-today", isActive: true },
      { id: "employee-archive-future-schedule", isActive: true },
      { id: "employee-archive-policy", isActive: true },
      { id: "employee-archive-role", isActive: true },
      { id: "employee-inactive", isActive: false },
    ],
    employmentAssignments: [
      { id: "employment-active", employeeId: "employee-active", positionId: "position-active", validTo: "" },
      { id: "employment-future-end", employeeId: "employee-active", positionId: "position-future-end", validTo: "2026-08-01" },
      { id: "employment-past-end", employeeId: "employee-active", positionId: "position-past-end", validTo: "2026-07-21" },
      { id: "employment-org-today", employeeId: "employee-active", orgUnitId: "org-active-assignment", validTo: "2026-07-22" },
      { id: "employment-work-center-today", employeeId: "employee-active", workCenterId: "work-center-active-assignment", validTo: "2026-07-22" },
      { id: "employment-employee-open", employeeId: "employee-archive-open", validTo: "" },
      { id: "employment-employee-today", employeeId: "employee-archive-today", validTo: "" },
    ],
    scheduleAssignments: [
      { id: "schedule-employee-today", employeeId: "employee-archive-today", validTo: "" },
      { id: "schedule-employee-future", employeeId: "employee-archive-future-schedule", validTo: "2026-08-01" },
    ],
    responsibilityPolicies: [
      { id: "policy-employee-active", subjectEmployeeId: "employee-archive-policy", targetEmployeeIds: [], isActive: true },
    ],
    accessRoles: [{ id: "role-active", isActive: true }],
    roleAssignments: [{ id: "role-assignment-active", employeeId: "employee-archive-role", roleId: "role-active" }],
    equipment: [
      { id: "equipment-planning", isActive: true },
      { id: "equipment-shift", isActive: true },
      { id: "equipment-free", isActive: true },
      { id: "equipment-work-center", workCenterId: "work-center-direct-equipment", orgUnitId: "org-free", isActive: true },
    ],
  },
};

function candidateWith(registryName, entityId) {
  return {
    registries: {
      ...current.registries,
      [registryName]: current.registries[registryName].map((item) => item.id === entityId ? { ...item, isActive: false, archivedAt: "2026-07-22T00:00:00.000Z" } : item),
    },
  };
}

let planningMode = "empty";
let shiftMode = "empty";
let shiftCloseCount = 0;
const workOrdersRepository = {
  async findActiveResourceDependencies(ids) {
    if (planningMode === "throw") throw new Error("Planning owner unavailable");
    return { items: planningMode === "dependency" ? [{ kind: "planning-slot", id: "slot-1", equipmentId: ids[0], workOrderId: "wo-1", operationId: "op-1", status: "planned" }] : [] };
  },
};
function shiftExecutionReadRepositoryFactory() {
  return {
    async findActiveResourceDependencies(ids) {
      if (shiftMode === "throw") throw new Error("Shift owner unavailable");
      return { items: shiftMode === "dependency" ? [{ kind: "shift-assignment", id: "assignment-1", equipmentId: ids[0], workOrderId: "wo-1", operationId: "op-1", status: "issued" }] : [] };
    },
    async close() { shiftCloseCount += 1; },
  };
}
const options = {
  current,
  workOrdersRepository,
  shiftExecutionReadRepositoryFactory,
  databaseUrl: "postgres://impact-qa/not-used",
  now: () => new Date("2026-07-22T08:00:00.000Z"),
};

const position = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("positions", "position-active") });
assert.equal(position.ok, false);
assert.equal(position.code, "position-active-assignment");
assert.equal(position.dependencies[0].id, "employment-active");
assert.equal(shiftCloseCount, 0, "position impact must reject before touching unrelated scheduling owners");

const futurePosition = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("positions", "position-future-end") });
assert.equal(futurePosition.ok, false, "an employment assignment with a future inclusive end date is still active");
assert.equal(futurePosition.dependencies[0].id, "employment-future-end");

const pastPosition = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("positions", "position-past-end") });
assert.equal(pastPosition.ok, true, "an employment assignment whose inclusive end date has passed is no longer active");

const introducedPositionAssignmentCandidate = candidateWith("positions", "position-free");
introducedPositionAssignmentCandidate.registries.employmentAssignments = [
  ...introducedPositionAssignmentCandidate.registries.employmentAssignments,
  { id: "employment-new", employeeId: "employee-active", positionId: "position-free", validTo: "" },
];
const introducedPositionAssignment = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: introducedPositionAssignmentCandidate });
assert.equal(introducedPositionAssignment.code, "position-active-assignment", "candidate-final assignments must guard a newly archived Position");
assert.equal(introducedPositionAssignment.dependencies[0].id, "employment-new");

const endedPositionAssignmentCandidate = candidateWith("positions", "position-active");
endedPositionAssignmentCandidate.registries.employmentAssignments = endedPositionAssignmentCandidate.registries.employmentAssignments
  .map((item) => item.id === "employment-active" ? { ...item, validTo: "2026-07-21" } : item);
const endedPositionAssignment = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: endedPositionAssignmentCandidate });
assert.equal(endedPositionAssignment.ok, true, "candidate-final assignment closure must permit Position archive");

const orgAssignment = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("orgUnits", "org-active-assignment") });
assert.equal(orgAssignment.code, "org-unit-active-dependency");
assert.equal(orgAssignment.dependencies[0].id, "employment-org-today", "inclusive validTo=today still owns an Org Unit");

const orgDirect = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("orgUnits", "org-direct-work-center") });
assert.equal(orgDirect.code, "org-unit-active-dependency");
assert.equal(orgDirect.dependencies[0].kind, "active-work-center", "active direct structural children must block Org Unit archive");

const atomicOrgArchiveCandidate = candidateWith("orgUnits", "org-direct-work-center");
atomicOrgArchiveCandidate.registries.workCenters = atomicOrgArchiveCandidate.registries.workCenters
  .map((item) => item.id === "work-center-child-parent" ? { ...item, isActive: false, archivedAt: "2026-07-22T00:00:00.000Z" } : item);
const atomicOrgArchive = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: atomicOrgArchiveCandidate });
assert.equal(atomicOrgArchive.ok, true, "a parent and all of its direct children may be archived atomically without deleting stable IDs");

const workCenterAssignment = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("workCenters", "work-center-active-assignment") });
assert.equal(workCenterAssignment.code, "work-center-active-dependency");
assert.equal(workCenterAssignment.dependencies[0].id, "employment-work-center-today", "inclusive validTo=today still owns a Work Center");

const workCenterEquipment = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("workCenters", "work-center-direct-equipment") });
assert.equal(workCenterEquipment.code, "work-center-active-dependency");
assert.equal(workCenterEquipment.dependencies[0].kind, "active-equipment", "active Equipment must block Work Center archive");

const employeeOpen = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("employees", "employee-archive-open") });
assert.equal(employeeOpen.code, "employee-active-lifecycle-dependency");
assert.equal(employeeOpen.dependencies[0].id, "employment-employee-open");

const employeeTodayCandidate = candidateWith("employees", "employee-archive-today");
employeeTodayCandidate.registries.employmentAssignments = employeeTodayCandidate.registries.employmentAssignments
  .map((item) => item.id === "employment-employee-today" ? { ...item, validTo: "2026-07-22" } : item);
employeeTodayCandidate.registries.scheduleAssignments = employeeTodayCandidate.registries.scheduleAssignments
  .map((item) => item.id === "schedule-employee-today" ? { ...item, validTo: "2026-07-21" } : item);
const employeeToday = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: employeeTodayCandidate });
assert.equal(employeeToday.ok, true, "employee archive may atomically cap its primary assignment at today after schedules have ended");

const employeeScheduleTodayCandidate = structuredClone(employeeTodayCandidate);
employeeScheduleTodayCandidate.registries.scheduleAssignments = employeeScheduleTodayCandidate.registries.scheduleAssignments
  .map((item) => item.id === "schedule-employee-today" ? { ...item, validTo: "2026-07-22" } : item);
const employeeScheduleToday = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: employeeScheduleTodayCandidate });
assert.equal(employeeScheduleToday.code, "employee-active-lifecycle-dependency", "a secondary schedule ending today remains active through the inclusive business day");

const employeeFutureSchedule = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("employees", "employee-archive-future-schedule") });
assert.equal(employeeFutureSchedule.code, "employee-active-lifecycle-dependency");
assert.equal(employeeFutureSchedule.dependencies[0].id, "schedule-employee-future");

const employeePolicy = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("employees", "employee-archive-policy") });
assert.equal(employeePolicy.code, "employee-active-lifecycle-dependency");
assert.equal(employeePolicy.dependencies[0].kind, "active-responsibility-policy");

const employeeRole = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("employees", "employee-archive-role") });
assert.equal(employeeRole.code, "employee-active-lifecycle-dependency");
assert.equal(employeeRole.dependencies[0].kind, "active-role-assignment", "role assignments must be removed before Employee archive");

const workCenterUnderInactiveOrg = structuredClone(current);
workCenterUnderInactiveOrg.registries.workCenters.push({ id: "work-center-reactivated", orgUnitId: "org-inactive", isActive: true });
const invalidWorkCenterParent = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: workCenterUnderInactiveOrg });
assert.equal(invalidWorkCenterParent.code, "org-unit-active-dependency", "direct PUT must not activate a Work Center under an inactive Org Unit");
assert.equal(invalidWorkCenterParent.dependencies[0].id, "work-center-reactivated");

const equipmentUnderInactiveWorkCenter = structuredClone(current);
equipmentUnderInactiveWorkCenter.registries.equipment.push({ id: "equipment-reactivated", workCenterId: "work-center-inactive", orgUnitId: "org-free", isActive: true });
const invalidEquipmentParent = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: equipmentUnderInactiveWorkCenter });
assert.equal(invalidEquipmentParent.code, "work-center-active-dependency", "direct PUT must not activate Equipment under an inactive Work Center");
assert.equal(invalidEquipmentParent.dependencies[0].id, "equipment-reactivated");

const policyUnderInactiveEmployee = structuredClone(current);
policyUnderInactiveEmployee.registries.responsibilityPolicies.push({
  id: "policy-reactivated", subjectEmployeeId: "employee-inactive", targetEmployeeIds: [], isActive: true,
});
const invalidPolicySubject = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: policyUnderInactiveEmployee });
assert.equal(invalidPolicySubject.code, "employee-active-lifecycle-dependency", "direct PUT must not activate a Responsibility Policy under an inactive Employee");
assert.equal(invalidPolicySubject.dependencies[0].id, "policy-reactivated");

const omittedPosition = structuredClone(current);
omittedPosition.registries.positions = omittedPosition.registries.positions.filter((item) => item.id !== "position-free");
const hardDelete = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: omittedPosition });
assert.equal(hardDelete.code, "production-structure-hard-delete-forbidden", "whole-aggregate PUT must not hard-delete a stable lifecycle row by omission");
assert.equal(hardDelete.dependencies.find((item) => item.kind === "hard-delete-omission")?.id, "position-free");

const omittedAccessRole = structuredClone(current);
omittedAccessRole.registries.accessRoles = [];
omittedAccessRole.registries.roleAssignments = [];
const accessRoleHardDelete = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: omittedAccessRole });
assert.equal(accessRoleHardDelete.code, "production-structure-hard-delete-forbidden", "Access Control PUT must deactivate, not omit, a stable role ID");
assert.equal(accessRoleHardDelete.dependencies.find((item) => item.registry === "accessRoles")?.id, "role-active");

const missingArchiveMarker = candidateWith("orgUnits", "org-free");
delete missingArchiveMarker.registries.orgUnits.find((item) => item.id === "org-free").archivedAt;
const missingArchiveMarkerResult = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: missingArchiveMarker });
assert.equal(missingArchiveMarkerResult.code, "production-structure-lifecycle-marker-invalid", "active to inactive bypass without archivedAt must fail closed");

const retainedArchiveMarker = structuredClone(current);
retainedArchiveMarker.registries.orgUnits = retainedArchiveMarker.registries.orgUnits
  .map((item) => item.id === "org-inactive" ? { ...item, isActive: true, archivedAt: "2026-07-20T00:00:00.000Z" } : item);
const retainedArchiveMarkerResult = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: retainedArchiveMarker });
assert.equal(retainedArchiveMarkerResult.code, "production-structure-lifecycle-marker-invalid", "inactive to active bypass retaining archivedAt must fail closed");

const missingPolicyArchiveMarker = structuredClone(current);
missingPolicyArchiveMarker.registries.responsibilityPolicies = missingPolicyArchiveMarker.registries.responsibilityPolicies
  .map((item) => item.id === "policy-employee-active" ? { ...item, isActive: false, archivedAt: "" } : item);
const missingPolicyArchiveMarkerResult = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: missingPolicyArchiveMarker });
assert.equal(missingPolicyArchiveMarkerResult.code, "production-structure-lifecycle-marker-invalid", "Responsibility Policy archive requires the same durable marker contract");

const unchangedLegacyInactive = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: structuredClone(current) });
assert.equal(unchangedLegacyInactive.ok, true, "an unchanged pre-033 inactive row without archivedAt remains readable and writable around unrelated changes");

const duplicatePolicyCandidate = structuredClone(current);
duplicatePolicyCandidate.registries.responsibilityPolicies.push(
  { id: "policy-duplicate-a", subjectEmployeeId: "employee-active", targetEmployeeIds: [], isActive: true },
  { id: "policy-duplicate-b", subjectEmployeeId: "employee-active", targetEmployeeIds: [], isActive: true },
);
const duplicatePolicy = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: duplicatePolicyCandidate });
assert.equal(duplicatePolicy.code, "duplicate-active-responsibility-policy");
assert.equal(duplicatePolicy.dependencies.find((item) => item.kind === "duplicate-active-responsibility-policy")?.employeeId, "employee-active");

planningMode = "dependency";
const planning = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("equipment", "equipment-planning") });
assert.equal(planning.ok, false);
assert.equal(planning.code, "equipment-active-resource-dependency");
assert.equal(planning.dependencies[0].owner, "planning");

planningMode = "empty";
shiftMode = "dependency";
const shift = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("equipment", "equipment-shift") });
assert.equal(shift.ok, false);
assert.equal(shift.dependencies[0].owner, "shift-execution");

shiftMode = "empty";
const free = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("equipment", "equipment-free") });
assert.equal(free.ok, true);

planningMode = "throw";
const outage = await validateSystemDomainsProductionStructureImpact({ ...options, candidate: candidateWith("equipment", "equipment-free") });
assert.equal(outage.ok, false);
assert.equal(outage.unavailable, true);
assert.equal(outage.code, "equipment-impact-owner-unavailable");
assert.equal(shiftCloseCount, 4, "every opened Shift dependency reader must close on success, conflict and outage");

const missingOwner = await validateSystemDomainsProductionStructureImpact({
  current,
  candidate: candidateWith("equipment", "equipment-free"),
  workOrdersRepository: {},
  shiftExecutionReadRepositoryFactory,
  databaseUrl: "postgres://impact-qa/not-used",
});
assert.equal(missingOwner.unavailable, true);

let planningDependencyQuery = "";
const planningRepository = createPostgresWorkOrdersRepository({
  sql: async (strings, ...values) => {
    planningDependencyQuery = strings.join("?");
    assert.deepEqual(values[0], ["equipment-planning"]);
    return [{
      dependency_kind: "work-order-operation",
      dependency_id: "operation-qa",
      work_order_id: "work-order-qa",
      operation_id: "operation-qa",
      resource_id: "equipment-planning",
      dependency_status: "released",
    }];
  },
});
const planningDependencies = await planningRepository.findActiveResourceDependencies(["equipment-planning", "equipment-planning"]);
assert.equal(planningDependencies.items[0].equipmentId, "equipment-planning");
assert.match(planningDependencyQuery, /work_order_operations/);
assert.match(planningDependencyQuery, /planning_slots/);
assert.match(planningDependencyQuery, /execution_context/);

const manyEquipmentIds = Array.from({ length: 101 }, (_, index) => `equipment-${index + 1}`);
let planningBatchIds = [];
const planningBatchRepository = createPostgresWorkOrdersRepository({
  sql: async (_strings, ...values) => {
    planningBatchIds = values[0];
    return [{
      dependency_kind: "planning-slot", dependency_id: "slot-last", work_order_id: "work-order-last",
      operation_id: "operation-last", resource_id: manyEquipmentIds[100], dependency_status: "planned",
    }];
  },
});
const planningBatch = await planningBatchRepository.findActiveResourceDependencies(manyEquipmentIds);
assert.equal(planningBatchIds.length, 101, "Planning impact lookup must not silently omit Equipment after item 100");
assert.equal(planningBatch.items[0].equipmentId, manyEquipmentIds[100]);

let shiftDependencyQuery = "";
const shiftRepository = createShiftExecutionReadRepository({
  sql: async (strings, ...values) => {
    shiftDependencyQuery = strings.join("?");
    assert.deepEqual(values[0], ["equipment-shift"]);
    return [{
      id: "shift-assignment-qa",
      work_order_id: "work-order-qa",
      work_order_operation_id: "operation-qa",
      resource_id: "equipment-shift",
      status: "issued",
    }];
  },
});
const shiftDependencies = await shiftRepository.findActiveResourceDependencies(["equipment-shift"]);
assert.equal(shiftDependencies.items[0].equipmentId, "equipment-shift");
assert.match(shiftDependencyQuery, /shift_assignments/);
assert.match(shiftDependencyQuery, /NOT IN/);

let shiftBatchIds = [];
const shiftBatchRepository = createShiftExecutionReadRepository({
  sql: async (_strings, ...values) => {
    shiftBatchIds = values[0];
    return [{
      id: "shift-last", work_order_id: "work-order-last", work_order_operation_id: "operation-last",
      resource_id: manyEquipmentIds[100], status: "issued",
    }];
  },
});
const shiftBatch = await shiftBatchRepository.findActiveResourceDependencies(manyEquipmentIds);
assert.equal(shiftBatchIds.length, 101, "Shift impact lookup must not silently omit Equipment after item 100");
assert.equal(shiftBatch.items[0].equipmentId, manyEquipmentIds[100]);

console.log("System Domains production-structure impact QA: OK");
console.log("- Employee, Org Unit, Work Center and Position final-state lifecycle dependencies reject before mutation: pass");
console.log("- Complete PostgreSQL Equipment dependency batches, owner outage and reader cleanup: pass");
