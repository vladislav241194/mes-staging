import assert from "node:assert/strict";

import {
  endActivePrimaryEmploymentAssignments,
  isAssignmentActiveOnDate,
} from "../src/modules/production_structure_matrix/lifecycle.js";

const today = "2026-07-22";
assert.equal(isAssignmentActiveOnDate({ validTo: "" }, today), true, "missing validTo must fail closed as active");
assert.equal(isAssignmentActiveOnDate({ validTo: "not-a-date" }, today), true, "invalid validTo must fail closed as active");
assert.equal(isAssignmentActiveOnDate({ validTo: today }, today), true, "validTo is inclusive on its final day");
assert.equal(isAssignmentActiveOnDate({ validTo: "2026-07-23" }, today), true, "future validTo must remain active");
assert.equal(isAssignmentActiveOnDate({ validTo: "2026-07-21" }, today), false, "past validTo must be inactive");
assert.equal(isAssignmentActiveOnDate({ validTo: "2026-07-23", isActive: false }, today), false, "explicit inactive assignment must remain inactive");

const updatedAt = "2026-07-22T10:00:00.000Z";
const assignments = [
  { id: "primary-open", employeeId: "employee-1", isPrimary: true, validTo: "" },
  { id: "primary-today", employeeId: "employee-1", isPrimary: true, validTo: today },
  { id: "primary-future", employeeId: "employee-1", isPrimary: true, validTo: "2026-08-01" },
  { id: "primary-past", employeeId: "employee-1", isPrimary: true, validTo: "2026-07-21" },
  { id: "secondary-future", employeeId: "employee-1", isPrimary: false, validTo: "2026-08-01" },
  { id: "other", employeeId: "employee-2", isPrimary: true, validTo: "2026-08-01" },
];
const archived = endActivePrimaryEmploymentAssignments(assignments, { employeeId: "employee-1", archiveDate: today, updatedAt });
for (const id of ["primary-open", "primary-today", "primary-future"]) {
  const assignment = archived.find((row) => row.id === id);
  assert.equal(assignment.validTo, today, `${id}: employee archive must end every active primary assignment today`);
  assert.equal(assignment.updatedAt, updatedAt);
}
assert.equal(archived.find((row) => row.id === "primary-past").validTo, "2026-07-21");
assert.equal(archived.find((row) => row.id === "secondary-future").validTo, "2026-08-01");
assert.equal(archived.find((row) => row.id === "other").validTo, "2026-08-01");

console.log("Production Structure lifecycle QA passed: inclusive today/future dependency guards and employee primary-assignment closure.");
