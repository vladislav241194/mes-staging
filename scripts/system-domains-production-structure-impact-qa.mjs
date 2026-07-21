import assert from "node:assert/strict";

import { createPostgresWorkOrdersRepository } from "./domain-postgres-repository.mjs";
import { createShiftExecutionReadRepository } from "./domain-shift-execution-repository.mjs";
import { validateSystemDomainsProductionStructureImpact } from "./system-domains-production-structure-impact.mjs";

const current = {
  registries: {
    positions: [
      { id: "position-active", isActive: true },
      { id: "position-future-end", isActive: true },
      { id: "position-past-end", isActive: true },
      { id: "position-free", isActive: true },
    ],
    employees: [{ id: "employee-active", isActive: true }],
    employmentAssignments: [
      { id: "employment-active", employeeId: "employee-active", positionId: "position-active", validTo: "" },
      { id: "employment-future-end", employeeId: "employee-active", positionId: "position-future-end", validTo: "2026-08-01" },
      { id: "employment-past-end", employeeId: "employee-active", positionId: "position-past-end", validTo: "2026-07-21" },
    ],
    equipment: [{ id: "equipment-planning", isActive: true }, { id: "equipment-shift", isActive: true }, { id: "equipment-free", isActive: true }],
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

console.log("System Domains production-structure impact QA: OK");
console.log("- Position assignments and Planning/Shift Equipment dependencies reject before mutation: pass");
console.log("- PostgreSQL dependency readers, owner outage and reader cleanup: pass");
