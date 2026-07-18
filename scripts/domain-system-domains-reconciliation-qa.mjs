import { reconcileSystemDomains } from "../src/modules/system_domains/reconciliation.js";

const assert = (value, message) => { if (!value) throw new Error(message); };

const base = {
  schemaId: "mes.system-domains",
  schemaVersion: 1,
  metadata: { source: "snapshot" },
  registries: {
    orgUnits: [{ id: "org-a", name: "A" }],
    workCenters: [], positions: [], employees: [], employmentAssignments: [], equipment: [],
    scheduleTemplates: [{ id: "shift-a", code: "2/2", patternOffset: 0 }],
    scheduleAssignments: [], attendanceEvents: [],
    accessRoles: [{ id: "role-a" }],
    grants: [{ id: "grant-a", roleId: "role-a", actionId: "view" }],
    roleAssignments: [],
    responsibilityPolicies: [{ id: "policy-a", targetEmployeeIds: ["employee-b", "employee-a"] }],
  },
};

const reordered = structuredClone(base);
reordered.registries.responsibilityPolicies[0].targetEmployeeIds.reverse();
const identical = reconcileSystemDomains({ snapshotDomains: base, postgresDomains: reordered, snapshotVersion: 5, postgresRevision: 7, stability: "verified" });
assert(identical.matches && identical.promotion.readEligible, "Equivalent sets must remain eligible despite target ID ordering.");

const divergent = structuredClone(reordered);
divergent.metadata = { source: "postgres", lastMutationKeys: ["attendance"] };
divergent.registries.attendanceEvents.push({ id: "attendance-a", employeeId: "employee-a", comment: "must not leak" });
divergent.registries.grants.push({ id: "grant-b", roleId: "role-a", actionId: "edit" });
divergent.registries.scheduleTemplates[0].patternOffset = 1;
const report = reconcileSystemDomains({ snapshotDomains: base, postgresDomains: divergent, snapshotVersion: 5, postgresRevision: 8, stability: "verified" });
assert(!report.matches && !report.promotion.readEligible, "Any projection difference must block authority promotion.");
assert(report.summary.addedInPostgres === 2 && report.summary.missingFromPostgres === 0, "PostgreSQL-only rows must be counted without exposing their data.");
assert(report.registries.scheduleTemplates.changedEntities === 1 && report.registries.scheduleTemplates.changedFieldPaths.includes("$.patternOffset"), "Nested differences must identify only schema paths.");
assert(report.metadata.changedFieldPaths.some((path) => path.startsWith("$.lastMutationKeys")) && !JSON.stringify(report).includes("must not leak"), "The report must never serialize changed values or comments.");
assert(report.promotion.reasonCodes.includes("projection-diff") && !report.promotion.writeEligible && !report.promotion.retirementEligible, "Read-only proof must not silently authorize writes or retirement.");

const unstable = reconcileSystemDomains({ snapshotDomains: base, postgresDomains: base, snapshotState: "active", stability: "changed" });
assert(!unstable.matches && unstable.promotion.reasonCodes.includes("source-changed"), "An unstable double-read must block promotion even when values match.");
console.log("System Domains reconciliation QA: OK");
