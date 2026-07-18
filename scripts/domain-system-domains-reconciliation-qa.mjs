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

const additivePostgres = structuredClone(base);
additivePostgres.metadata = {
  ...base.metadata,
  lastMutationKeys: ["attendanceEvents"],
  lastMutationRegistry: "attendanceEvents",
  migratedAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};
additivePostgres.registries.attendanceEvents.push({ id: "attendance-pg-only", employeeId: "employee-a" });
const additive = reconcileSystemDomains({ snapshotDomains: base, postgresDomains: additivePostgres, snapshotVersion: 5, postgresRevision: 9, stability: "verified" });
assert(!additive.matches && additive.promotion.snapshotPromotionEligible, "An additive PostgreSQL-only projection with allowlisted metadata must be eligible only for the explicit compatibility-snapshot promotion.");

const unsafeMetadata = structuredClone(additivePostgres);
unsafeMetadata.metadata.operatorNote = "must-not-promote";
const unsafeMetadataReport = reconcileSystemDomains({ snapshotDomains: base, postgresDomains: unsafeMetadata, snapshotVersion: 5, postgresRevision: 10, stability: "verified" });
assert(!unsafeMetadataReport.promotion.snapshotPromotionEligible && unsafeMetadataReport.promotion.snapshotPromotionReasonCodes.includes("metadata-diff-not-allowlisted"), "Unexpected metadata must block compatibility-snapshot promotion.");

const overflowSnapshot = structuredClone(base);
const overflowPostgres = structuredClone(base);
overflowSnapshot.metadata = { lastMutationKeys: Array.from({ length: 32 }, (_, index) => `snapshot-${index}`) };
overflowPostgres.metadata = {
  lastMutationKeys: Array.from({ length: 32 }, (_, index) => `postgres-${index}`),
  operatorNote: "must-block-even-after-truncation",
};
const overflowReport = reconcileSystemDomains({ snapshotDomains: overflowSnapshot, postgresDomains: overflowPostgres, snapshotVersion: 5, postgresRevision: 10, stability: "verified" });
assert(overflowReport.metadata.changedFieldPaths.length === 24 && overflowReport.metadata.hasUnallowlistedDifference, "Promotion metadata safety must inspect every changed path even when the public diagnostic is capped.");
assert(!overflowReport.promotion.snapshotPromotionEligible && overflowReport.promotion.snapshotPromotionReasonCodes.includes("metadata-diff-not-allowlisted"), "A non-allowlisted metadata field beyond the diagnostic cap must block promotion.");

const snapshotOnly = structuredClone(base);
snapshotOnly.registries.attendanceEvents.push({ id: "snapshot-only" });
const snapshotOnlyReport = reconcileSystemDomains({ snapshotDomains: snapshotOnly, postgresDomains: base, snapshotVersion: 5, postgresRevision: 11, stability: "verified" });
assert(!snapshotOnlyReport.promotion.snapshotPromotionEligible && snapshotOnlyReport.promotion.snapshotPromotionReasonCodes.includes("snapshot-has-entities-missing-in-postgres"), "A snapshot-only entity must never be discarded by promotion.");

const unstable = reconcileSystemDomains({ snapshotDomains: base, postgresDomains: base, snapshotState: "active", stability: "changed" });
assert(!unstable.matches && unstable.promotion.reasonCodes.includes("source-changed"), "An unstable double-read must block promotion even when values match.");
console.log("System Domains reconciliation QA: OK");
