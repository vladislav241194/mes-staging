import {
  ACCESS_CONTROL_ACTIONS,
  can,
  createAccessControlService,
  getEffectiveSubjectRoleAssignments,
  grants,
  migrateLegacyPositionDefaultRoles,
  normalizeAccessRoles,
  normalizePositionDefaultRoleRules,
  resolveDefaultRoleForPosition,
} from "../src/modules/access_control/service.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const allActions = [...ACCESS_CONTROL_ACTIONS];
const accessRoles = normalizeAccessRoles([
  {
    id: "admin",
    label: "Администратор",
    scope: "factory",
    grants: { "*": allActions },
  },
  {
    id: "planner",
    label: "Планировщик",
    scope: "factory",
    grants: { gantt: ["view", "edit", "print", "approve"] },
  },
  {
    id: "auditor",
    label: "Аудитор",
    readOnly: true,
    scope: "factory",
    grants: { gantt: allActions },
  },
  {
    id: "departmentHead",
    label: "Руководитель отдела",
    scope: "department",
    grants: { timesheet: ["view", "edit", "approve"] },
  },
  {
    id: "master",
    label: "Мастер",
    scope: "workCenter",
    grants: { shiftMasterBoard: ["view", "edit", "print", "assign"] },
  },
  {
    id: "executor",
    label: "Исполнитель",
    scope: "self",
    grants: { authSessionPrototype: ["view", "edit"] },
  },
  {
    id: "editImpliesView",
    scope: "factory",
    grants: { demo: { edit: true } },
  },
]);

const roleById = new Map(accessRoles.map((role) => [role.id, role]));
assert(grants(roleById.get("admin"), "unknownFutureModule", "configure"), "Wildcard admin grant must cover future modules.");
assert(grants(roleById.get("planner"), "gantt", "approve"), "Planner must be able to approve Gantt changes.");
assert(!grants(roleById.get("planner"), "gantt", "assign"), "Unlisted action must stay denied.");
assert(grants(roleById.get("editImpliesView"), "demo", "view"), "A mutating grant must imply view.");
assert(grants(roleById.get("auditor"), "gantt", "view"), "Read-only role must retain view.");
assert(grants(roleById.get("auditor"), "gantt", "print"), "Read-only role may retain print.");
["edit", "assign", "approve", "configure"].forEach((action) => {
  assert(!grants(roleById.get("auditor"), "gantt", action), `Read-only role leaked ${action}.`);
});
assert(!grants(roleById.get("planner"), "gantt", "delete"), "Unknown actions must fail closed.");

let duplicateRoleRejected = false;
try {
  normalizeAccessRoles([{ id: "duplicate" }, { id: "duplicate" }]);
} catch {
  duplicateRoleRejected = true;
}
assert(duplicateRoleRejected, "Duplicate role ids must not be normalized silently.");

const roleIds = accessRoles.map((role) => role.id);
const positionDefaultRoleRules = normalizePositionDefaultRoleRules([
  { id: "planner-default-v1", positionId: "position-planner", roleId: "planner", effectiveTo: "2026-07-01T00:00:00.000Z" },
  { id: "planner-default-v2", positionId: "position-planner", roleId: "planner", effectiveFrom: "2026-07-01T00:00:00.000Z" },
  { id: "executor-default", positionId: "position-operator", roleId: "executor" },
], { roleIds });

assert(
  resolveDefaultRoleForPosition("position-planner", positionDefaultRoleRules, { at: "2026-07-10T10:00:00.000Z", roleIds }) === "planner",
  "Exact position id must resolve the effective default role.",
);
assert(
  resolveDefaultRoleForPosition("Планировщик", positionDefaultRoleRules, { at: "2026-07-10T10:00:00.000Z", roleIds }) === "",
  "Runtime default-role resolution must never infer from a position label.",
);

const subjectRoleAssignments = [
  {
    id: "planner-expired",
    subjectId: "employee-expired",
    roleId: "planner",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "planner-current",
    subjectId: "employee-planner",
    roleId: "planner",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    effectiveTo: "2027-01-01T00:00:00.000Z",
  },
  { id: "auditor-current", subjectId: "employee-auditor", roleId: "auditor" },
  { id: "department-current", subjectId: "employee-department-head", roleId: "departmentHead" },
  { id: "master-current", subjectId: "employee-master", roleId: "master" },
  { id: "master-scoped-current", subjectId: "employee-master-scoped", roleId: "master" },
  { id: "executor-current", subjectId: "employee-executor", roleId: "executor" },
];

const effectiveAtBoundary = getEffectiveSubjectRoleAssignments(
  { id: "employee-planner" },
  subjectRoleAssignments,
  { at: "2026-07-01T00:00:00.000Z", roleIds, positionDefaultRoleRules },
);
assert(effectiveAtBoundary.length === 1 && effectiveAtBoundary[0].id === "planner-current", "Assignment end must be exclusive and start inclusive.");
assert(
  getEffectiveSubjectRoleAssignments(
    { id: "employee-expired" },
    subjectRoleAssignments,
    { at: "2026-07-10T00:00:00.000Z", roleIds, positionDefaultRoleRules },
  ).length === 0,
  "Expired assignment must not authorize a subject.",
);
assert(
  getEffectiveSubjectRoleAssignments(
    { id: "employee-planner" },
    subjectRoleAssignments,
    { at: "not-a-date", roleIds, positionDefaultRoleRules },
  ).length === 0,
  "Invalid decision dates must fail closed.",
);

const responsibilityScopes = [
  {
    id: "master-personal-override",
    subjectId: "employee-master-scoped",
    roleId: "master",
    scope: "workCenter",
    workCenterIds: ["wc-2"],
  },
  {
    id: "planner-gantt-factory",
    roleId: "planner",
    scope: "factory",
    factoryIds: ["factory-1"],
    moduleIds: ["gantt"],
  },
];

const service = createAccessControlService({
  accessRoles,
  subjectRoleAssignments,
  responsibilityScopes,
  positionDefaultRoleRules,
  now: () => new Date("2026-07-10T10:00:00.000Z"),
});

const planner = { id: "employee-planner", factoryId: "factory-1" };
assert(service.can(planner, "gantt", "view"), "Context-free view must support module navigation.");
assert(service.can(planner, "gantt", "edit", { factoryId: "factory-1" }), "Factory scope must allow the subject factory.");
assert(!service.can(planner, "gantt", "edit", { factoryId: "factory-2" }), "Factory scope must reject a different factory.");
assert(!service.can(planner, "gantt", "configure", { factoryId: "factory-1" }), "Scope must not create an absent grant.");

const departmentHead = { id: "employee-department-head", departmentId: "department-1", factoryId: "factory-1" };
assert(service.can(departmentHead, "timesheet", "approve", { departmentId: "department-1" }), "Department scope must allow its department.");
assert(!service.can(departmentHead, "timesheet", "approve", { departmentId: "department-2" }), "Department scope must reject another department.");
assert(!service.can(departmentHead, "timesheet", "edit"), "Scoped mutation without a resource context must fail closed.");

const master = { id: "employee-master", workCenterIds: ["wc-1"], departmentId: "department-1" };
assert(service.can(master, "shiftMasterBoard", "assign", { workCenterId: "wc-1" }), "Work-center scope must allow its work center.");
assert(!service.can(master, "shiftMasterBoard", "assign", { workCenterId: "wc-2" }), "Work-center scope must reject another work center.");
const scopedMaster = { id: "employee-master-scoped", workCenterIds: ["wc-1"] };
assert(service.can(scopedMaster, "shiftMasterBoard", "assign", { workCenterId: "wc-2" }), "Subject responsibility must override the role default scope.");
assert(!service.can(scopedMaster, "shiftMasterBoard", "assign", { workCenterId: "wc-1" }), "A narrower subject scope must not be widened by the role default.");

const executor = { id: "employee-executor", positionId: "position-operator" };
assert(service.can(executor, "authSessionPrototype", "edit", { targetSubjectId: "employee-executor" }), "Self scope must allow the current subject.");
assert(!service.can(executor, "authSessionPrototype", "edit", { targetSubjectId: "employee-other" }), "Self scope must reject another subject.");

const auditor = { id: "employee-auditor", factoryId: "factory-1" };
assert(service.can(auditor, "gantt", "print", { factoryId: "factory-1" }), "Read-only role must be able to print when granted.");
assert(!service.can(auditor, "gantt", "edit", { factoryId: "factory-1" }), "Read-only invariant must hold in can().");

const positionFallbackSubject = { id: "employee-position-default", positionId: "position-planner", factoryId: "factory-1" };
assert(service.can(positionFallbackSubject, "gantt", "view"), "Exact position default must provide a fallback role.");
const labelOnlySubject = { id: "employee-label-only", positionLabel: "Планировщик", factoryId: "factory-1" };
assert(!service.can(labelOnlySubject, "gantt", "view"), "Position label must not affect runtime authorization.");

const explicitOverridesPosition = createAccessControlService({
  accessRoles,
  subjectRoleAssignments: [{ id: "explicit-auditor", subjectId: "employee-explicit", roleId: "auditor" }],
  positionDefaultRoleRules,
  now: () => new Date("2026-07-10T10:00:00.000Z"),
});
const explicitSubject = { id: "employee-explicit", positionId: "position-planner", factoryId: "factory-1" };
assert(!explicitOverridesPosition.can(explicitSubject, "gantt", "edit", { factoryId: "factory-1" }), "Explicit role assignment must replace a position default, not union with it.");

const migration = migrateLegacyPositionDefaultRoles({
  positions: [
    { id: "position-director", label: "Директор производства" },
    { id: "position-technologist", label: "Ведущий технолог" },
    { id: "position-conflict", label: "Мастер-технолог" },
    { id: "position-unknown", label: "Новая должность" },
  ],
  roleIds,
  explicitRules: [{ id: "director-explicit", positionId: "position-director", roleId: "admin" }],
  legacyLabelRules: [
    { id: "legacy-technologist", roleId: "planner", pattern: /технолог/i },
    { id: "legacy-master", roleId: "master", pattern: /мастер/i },
  ],
  effectiveFrom: "2026-07-10T00:00:00.000Z",
});
assert(migration.report.counts.explicit === 1, "Migration report must retain explicit rules.");
assert(migration.report.counts.inferred === 1, "Migration must emit exactly one unambiguous inferred rule.");
assert(migration.report.counts.conflicts === 1, "Migration must report ambiguous legacy labels instead of choosing a role.");
assert(migration.report.counts.unmatched === 1, "Migration must report unmapped positions.");
assert(
  resolveDefaultRoleForPosition("position-technologist", migration.rules, { at: "2026-07-10T10:00:00.000Z", roleIds }) === "planner",
  "Migration output must be an exact runtime position rule.",
);

assert(
  can(
    planner,
    "gantt",
    "edit",
    { factoryId: "factory-1", at: "2026-07-10T10:00:00.000Z" },
    { accessRoles, subjectRoleAssignments, responsibilityScopes, positionDefaultRoleRules },
  ),
  "Standalone can() must enforce the same service contract.",
);

console.log(JSON.stringify({
  ok: true,
  roles: accessRoles.length,
  actions: ACCESS_CONTROL_ACTIONS.length,
  assignments: service.subjectRoleAssignments.length,
  scopes: service.responsibilityScopes.length,
  positionRules: service.positionDefaultRoleRules.length,
  migration: migration.report.counts,
}, null, 2));
