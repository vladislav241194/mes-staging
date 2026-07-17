export const ACCESS_CONTROL_ACTIONS = Object.freeze([
  "view",
  "edit",
  "print",
  "assign",
  "approve",
  "configure",
]);

export const ACCESS_CONTROL_SCOPE_TYPES = Object.freeze([
  "factory",
  "department",
  "workCenter",
  "self",
]);

const READ_ONLY_ACTIONS = new Set(["view", "print"]);
const ACTION_SET = new Set(ACCESS_CONTROL_ACTIONS);
const SCOPE_TYPE_SET = new Set(ACCESS_CONTROL_SCOPE_TYPES);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeId(value) {
  return String(value ?? "").trim();
}

function normalizeIdList(value) {
  const source = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  return [...new Set(source.map(normalizeId).filter(Boolean))];
}

function normalizeActionList(value) {
  const source = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  return [...new Set(source.map(normalizeId).filter((action) => ACTION_SET.has(action)))];
}

function readFirst(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function parseDateBoundary(value) {
  if (value == null || value === "") return { provided: false, valid: true, timestamp: null, iso: null };
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return { provided: true, valid: false, timestamp: null, iso: null };
  return { provided: true, valid: true, timestamp, iso: new Date(timestamp).toISOString() };
}

function normalizeEffectiveWindow(source = {}) {
  const from = parseDateBoundary(readFirst(source, ["effectiveFrom", "validFrom", "startsAt"]));
  const to = parseDateBoundary(readFirst(source, ["effectiveTo", "validTo", "endsAt"]));
  const valid = from.valid && to.valid && (from.timestamp == null || to.timestamp == null || from.timestamp < to.timestamp);
  return {
    valid,
    effectiveFrom: from.iso,
    effectiveTo: to.iso,
  };
}

function getDecisionTimestamp(value, fallback = Date.now()) {
  if (value == null || value === "") return fallback;
  const parsed = parseDateBoundary(value);
  return parsed.valid && parsed.timestamp != null ? parsed.timestamp : Number.NaN;
}

export function isEffectiveDatedRecord(record, at = new Date()) {
  if (!isRecord(record)) return false;
  const timestamp = getDecisionTimestamp(at);
  if (!Number.isFinite(timestamp)) return false;
  const from = parseDateBoundary(record.effectiveFrom);
  const to = parseDateBoundary(record.effectiveTo);
  if (!from.valid || !to.valid) return false;
  if (from.timestamp != null && timestamp < from.timestamp) return false;
  // End boundaries are exclusive so adjacent assignments cannot overlap accidentally.
  if (to.timestamp != null && timestamp >= to.timestamp) return false;
  return true;
}

function createEmptyActionRecord() {
  return Object.fromEntries(ACCESS_CONTROL_ACTIONS.map((action) => [action, false]));
}

function normalizeActionRecord(value, readOnly = false) {
  const result = createEmptyActionRecord();
  if (Array.isArray(value)) {
    normalizeActionList(value).forEach((action) => { result[action] = true; });
  } else if (typeof value === "string") {
    if (ACTION_SET.has(value)) result[value] = true;
  } else if (isRecord(value)) {
    ACCESS_CONTROL_ACTIONS.forEach((action) => {
      result[action] = Boolean(value[action]);
    });
  }

  if (ACCESS_CONTROL_ACTIONS.some((action) => action !== "view" && result[action])) result.view = true;
  if (readOnly) {
    ACCESS_CONTROL_ACTIONS.forEach((action) => {
      if (!READ_ONLY_ACTIONS.has(action)) result[action] = false;
    });
  }
  if (!result.view) {
    ACCESS_CONTROL_ACTIONS.forEach((action) => { result[action] = false; });
  }
  return result;
}

function mergeActionRecords(left, right, readOnly = false) {
  const result = createEmptyActionRecord();
  ACCESS_CONTROL_ACTIONS.forEach((action) => {
    result[action] = Boolean(left?.[action] || right?.[action]);
  });
  return normalizeActionRecord(result, readOnly);
}

export function normalizeAccessGrantMatrix(value = {}, options = {}) {
  const readOnly = Boolean(options.readOnly);
  const result = {};
  const addGrant = (moduleIdValue, actionsValue) => {
    const moduleId = normalizeId(moduleIdValue);
    if (!moduleId) return;
    const next = normalizeActionRecord(actionsValue, readOnly);
    result[moduleId] = result[moduleId]
      ? mergeActionRecords(result[moduleId], next, readOnly)
      : next;
  };

  if (Array.isArray(value)) {
    value.forEach((grant) => {
      if (!isRecord(grant)) return;
      const moduleId = grant.moduleId ?? grant.module ?? grant.resource;
      if (grant.action) {
        addGrant(moduleId, { [normalizeId(grant.action)]: grant.allowed !== false });
      } else {
        addGrant(moduleId, grant.actions ?? grant.permissions ?? grant.allow);
      }
    });
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([moduleId, actions]) => addGrant(moduleId, actions));
  }

  return result;
}

export function normalizeAccessRole(value = {}) {
  if (!isRecord(value)) return null;
  const id = normalizeId(value.id ?? value.roleId);
  if (!id) return null;
  const readOnly = Boolean(value.readOnly ?? value.readonly);
  const scopeSource = isRecord(value.scope) ? value.scope : {};
  const scopeValue = isRecord(value.scope) ? value.scope.type : value.scope;
  const scope = SCOPE_TYPE_SET.has(scopeValue) ? scopeValue : "factory";
  const rawGrants = value.grants ?? value.modulePermissions ?? value.permissions ?? {};
  return {
    id,
    label: normalizeId(value.label ?? value.name) || id,
    description: normalizeId(value.description ?? value.caption),
    active: value.active !== false && value.disabled !== true,
    readOnly,
    defaultModule: normalizeId(value.defaultModule),
    scope,
    factoryIds: normalizeIdList(value.factoryIds ?? scopeSource.factoryIds),
    departmentIds: normalizeIdList(value.departmentIds ?? scopeSource.departmentIds),
    workCenterIds: normalizeIdList(value.workCenterIds ?? scopeSource.workCenterIds),
    grants: normalizeAccessGrantMatrix(rawGrants, { readOnly }),
  };
}

export function normalizeAccessRoles(value = []) {
  const source = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  const roles = [];
  const seen = new Set();
  source.forEach((item) => {
    const role = normalizeAccessRole(item);
    if (!role) return;
    if (seen.has(role.id)) throw new TypeError(`Duplicate access role id: ${role.id}`);
    seen.add(role.id);
    roles.push(role);
  });
  return roles;
}

export function grants(role, moduleIdValue, actionValue = "view") {
  const moduleId = normalizeId(moduleIdValue);
  const action = normalizeId(actionValue);
  if (!moduleId || !ACTION_SET.has(action)) return false;
  const normalizedRole = normalizeAccessRole(role);
  if (!normalizedRole?.active) return false;
  const actionRecord = normalizedRole.grants[moduleId] ?? normalizedRole.grants["*"];
  if (!actionRecord?.view) return false;
  if (normalizedRole.readOnly && !READ_ONLY_ACTIONS.has(action)) return false;
  return Boolean(actionRecord[action]);
}

export function normalizeSubjectRoleAssignments(value = [], options = {}) {
  const knownRoleIds = new Set(normalizeIdList(options.roleIds));
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const subjectId = normalizeId(item.subjectId ?? item.employeeId ?? item.userId);
    const roleId = normalizeId(item.roleId ?? item.accessRoleId);
    const window = normalizeEffectiveWindow(item);
    if (!subjectId || !roleId || !window.valid || (knownRoleIds.size && !knownRoleIds.has(roleId))) return [];
    const id = normalizeId(item.id) || `role-assignment:${subjectId}:${roleId}:${window.effectiveFrom || "open"}:${index}`;
    if (seen.has(id)) throw new TypeError(`Duplicate subject role assignment id: ${id}`);
    seen.add(id);
    return [{
      id,
      subjectType: normalizeId(item.subjectType) || "employee",
      subjectId,
      roleId,
      source: normalizeId(item.source) || "explicit",
      effectiveFrom: window.effectiveFrom,
      effectiveTo: window.effectiveTo,
    }];
  });
}

export function normalizePositionDefaultRoleRules(value = [], options = {}) {
  const knownRoleIds = new Set(normalizeIdList(options.roleIds));
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.entries(value).map(([positionId, roleId]) => ({ positionId, roleId }))
      : [];
  const seen = new Set();
  return source.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const positionId = normalizeId(item.positionId ?? item.position);
    const roleId = normalizeId(item.roleId ?? item.defaultRoleId);
    const window = normalizeEffectiveWindow(item);
    if (!positionId || !roleId || !window.valid || (knownRoleIds.size && !knownRoleIds.has(roleId))) return [];
    const id = normalizeId(item.id) || `position-role:${positionId}:${roleId}:${window.effectiveFrom || "open"}:${index}`;
    if (seen.has(id)) throw new TypeError(`Duplicate position default role rule id: ${id}`);
    seen.add(id);
    return [{
      id,
      positionId,
      roleId,
      source: normalizeId(item.source) || "explicit-position-rule",
      migrationReason: normalizeId(item.migrationReason),
      effectiveFrom: window.effectiveFrom,
      effectiveTo: window.effectiveTo,
    }];
  });
}

export function getEffectivePositionDefaultRoleRule(positionIdValue, rules = [], options = {}) {
  const positionId = normalizeId(positionIdValue);
  if (!positionId) return null;
  const at = options.at ?? new Date();
  return normalizePositionDefaultRoleRules(rules, { roleIds: options.roleIds })
    .filter((rule) => rule.positionId === positionId && isEffectiveDatedRecord(rule, at))
    .sort((left, right) => {
      const leftStart = parseDateBoundary(left.effectiveFrom).timestamp ?? Number.NEGATIVE_INFINITY;
      const rightStart = parseDateBoundary(right.effectiveFrom).timestamp ?? Number.NEGATIVE_INFINITY;
      return rightStart - leftStart || left.id.localeCompare(right.id);
    })[0] || null;
}

export function resolveDefaultRoleForPosition(positionId, rules = [], options = {}) {
  return getEffectivePositionDefaultRoleRule(positionId, rules, options)?.roleId || "";
}

export function normalizeResponsibilityScopes(value = [], options = {}) {
  const knownRoleIds = new Set(normalizeIdList(options.roleIds));
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const subjectId = normalizeId(item.subjectId ?? item.employeeId ?? item.userId);
    const roleId = normalizeId(item.roleId ?? item.accessRoleId);
    const assignmentId = normalizeId(item.assignmentId ?? item.subjectRoleAssignmentId);
    const scopeSource = isRecord(item.scope) ? item.scope : {};
    const scopeValue = isRecord(item.scope) ? item.scope.type : item.scope ?? item.type;
    const type = SCOPE_TYPE_SET.has(scopeValue) ? scopeValue : "";
    const window = normalizeEffectiveWindow(item);
    if (!type || !window.valid || (!subjectId && !roleId && !assignmentId)) return [];
    if (roleId && knownRoleIds.size && !knownRoleIds.has(roleId)) return [];
    const id = normalizeId(item.id) || `responsibility-scope:${subjectId || roleId || assignmentId}:${type}:${index}`;
    if (seen.has(id)) throw new TypeError(`Duplicate responsibility scope id: ${id}`);
    seen.add(id);
    return [{
      id,
      subjectId,
      roleId,
      assignmentId,
      type,
      factoryIds: normalizeIdList(item.factoryIds ?? scopeSource.factoryIds),
      departmentIds: normalizeIdList(item.departmentIds ?? scopeSource.departmentIds),
      workCenterIds: normalizeIdList(item.workCenterIds ?? scopeSource.workCenterIds),
      moduleIds: normalizeIdList(item.moduleIds ?? item.modules),
      actions: normalizeActionList(item.actions),
      effectiveFrom: window.effectiveFrom,
      effectiveTo: window.effectiveTo,
    }];
  });
}

function normalizeSubject(subject) {
  if (typeof subject === "string") return { id: normalizeId(subject), subjectType: "employee", active: true };
  if (!isRecord(subject)) return { id: "", subjectType: "employee", active: false };
  return {
    ...subject,
    id: normalizeId(subject.id ?? subject.subjectId ?? subject.employeeId ?? subject.userId),
    subjectType: normalizeId(subject.subjectType) || "employee",
    active: subject.active !== false && subject.disabled !== true,
    positionId: normalizeId(subject.positionId),
    factoryIds: normalizeIdList(subject.factoryIds ?? subject.factoryId),
    departmentIds: normalizeIdList(subject.departmentIds ?? subject.departmentId),
    workCenterIds: normalizeIdList(subject.workCenterIds ?? subject.workCenterId),
  };
}

export function getEffectiveSubjectRoleAssignments(subjectValue, assignments = [], options = {}) {
  const subject = normalizeSubject(subjectValue);
  if (!subject.id || !subject.active) return [];
  const roleIds = normalizeIdList(options.roleIds);
  const explicit = normalizeSubjectRoleAssignments(assignments, { roleIds })
    .filter((assignment) => assignment.subjectId === subject.id
      && assignment.subjectType === subject.subjectType
      && isEffectiveDatedRecord(assignment, options.at ?? new Date()));

  if (explicit.length) {
    const latestByRole = new Map();
    explicit.forEach((assignment) => {
      const previous = latestByRole.get(assignment.roleId);
      const currentStart = parseDateBoundary(assignment.effectiveFrom).timestamp ?? Number.NEGATIVE_INFINITY;
      const previousStart = parseDateBoundary(previous?.effectiveFrom).timestamp ?? Number.NEGATIVE_INFINITY;
      if (!previous || currentStart >= previousStart) latestByRole.set(assignment.roleId, assignment);
    });
    return [...latestByRole.values()];
  }

  // Runtime fallback is deliberately exact-id only. Position labels are never inspected here.
  const rule = getEffectivePositionDefaultRoleRule(subject.positionId, options.positionDefaultRoleRules, {
    at: options.at,
    roleIds,
  });
  if (!rule) return [];
  return [{
    id: `position-default:${subject.id}:${rule.id}`,
    subjectType: subject.subjectType,
    subjectId: subject.id,
    roleId: rule.roleId,
    source: "position-default",
    positionDefaultRoleRuleId: rule.id,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  }];
}

function getScopeSpecificity(scope, subject, assignment, moduleId, action) {
  if (scope.assignmentId && scope.assignmentId !== assignment.id) return -1;
  if (scope.subjectId && scope.subjectId !== subject.id) return -1;
  if (scope.roleId && scope.roleId !== assignment.roleId) return -1;
  if (scope.moduleIds.length && !scope.moduleIds.includes(moduleId)) return -1;
  if (scope.actions.length && !scope.actions.includes(action)) return -1;
  let score = 0;
  if (scope.roleId) score += 20;
  if (scope.subjectId) score += 40;
  if (scope.assignmentId) score += 80;
  if (scope.moduleIds.length) score += 8;
  if (scope.actions.length) score += 4;
  return score;
}

function getDecisionScopes(subject, role, assignment, responsibilityScopes, moduleId, action, at) {
  const matches = responsibilityScopes
    .filter((scope) => isEffectiveDatedRecord(scope, at))
    .map((scope) => ({ scope, score: getScopeSpecificity(scope, subject, assignment, moduleId, action) }))
    .filter((item) => item.score >= 0);
  if (matches.length) {
    const maxScore = Math.max(...matches.map((item) => item.score));
    return matches.filter((item) => item.score === maxScore).map((item) => item.scope);
  }
  return [{
    id: `role-default-scope:${role.id}`,
    type: role.scope,
    factoryIds: role.factoryIds,
    departmentIds: role.departmentIds,
    workCenterIds: role.workCenterIds,
  }];
}

function getContextIds(context, pluralKey, singularKeys = []) {
  const values = [...normalizeIdList(context[pluralKey])];
  singularKeys.forEach((key) => values.push(...normalizeIdList(context[key])));
  return [...new Set(values)];
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function scopeAllows(scope, subject, action, resourceContext) {
  const context = isRecord(resourceContext) ? resourceContext : {};
  const factoryIds = scope.factoryIds.length ? scope.factoryIds : subject.factoryIds;
  const departmentIds = scope.departmentIds.length ? scope.departmentIds : subject.departmentIds;
  const workCenterIds = scope.workCenterIds.length ? scope.workCenterIds : subject.workCenterIds;
  const resourceFactoryIds = getContextIds(context, "factoryIds", ["factoryId"]);
  const resourceDepartmentIds = getContextIds(context, "departmentIds", ["departmentId"]);
  const resourceWorkCenterIds = getContextIds(context, "workCenterIds", ["workCenterId"]);
  const targetSubjectIds = getContextIds(context, "subjectIds", ["targetSubjectId", "ownerSubjectId", "employeeId", "subjectId"]);
  const hasResourceTarget = Boolean(
    resourceFactoryIds.length
    || resourceDepartmentIds.length
    || resourceWorkCenterIds.length
    || targetSubjectIds.length,
  );

  // A context-free view is a module-navigation decision. Scoped data reads still pass a context.
  if (!hasResourceTarget && action === "view") return true;
  if (scope.type === "factory") {
    if (!factoryIds.length) return true;
    if (!resourceFactoryIds.length) return !hasResourceTarget;
    return intersects(factoryIds, resourceFactoryIds);
  }
  if (scope.type === "department") {
    return Boolean(departmentIds.length && resourceDepartmentIds.length && intersects(departmentIds, resourceDepartmentIds));
  }
  if (scope.type === "workCenter") {
    return Boolean(workCenterIds.length && resourceWorkCenterIds.length && intersects(workCenterIds, resourceWorkCenterIds));
  }
  if (scope.type === "self") {
    return Boolean(subject.id && targetSubjectIds.includes(subject.id));
  }
  return false;
}

export function createAccessControlService(config = {}) {
  const accessRoles = normalizeAccessRoles(config.accessRoles ?? config.roles ?? []);
  const roleIds = accessRoles.map((role) => role.id);
  const roleById = new Map(accessRoles.map((role) => [role.id, role]));
  const subjectRoleAssignments = normalizeSubjectRoleAssignments(
    config.subjectRoleAssignments ?? config.assignments ?? [],
    { roleIds },
  );
  const responsibilityScopes = normalizeResponsibilityScopes(config.responsibilityScopes ?? [], { roleIds });
  const positionDefaultRoleRules = normalizePositionDefaultRoleRules(config.positionDefaultRoleRules ?? [], { roleIds });
  const now = typeof config.now === "function" ? config.now : () => new Date();

  function explainCan(subjectValue, moduleIdValue, actionValue = "view", resourceContext = {}) {
    const subject = normalizeSubject(subjectValue);
    const moduleId = normalizeId(moduleIdValue);
    const action = normalizeId(actionValue);
    const at = resourceContext?.at ?? now();
    const base = {
      allowed: false,
      reason: "denied",
      subjectId: subject.id,
      moduleId,
      action,
      effectiveAssignmentIds: [],
      effectiveRoleIds: [],
      matchedAssignmentId: "",
      matchedRoleId: "",
      matchedScopeIds: [],
    };
    if (!subject.id || !subject.active) return { ...base, reason: "inactive-or-missing-subject" };
    if (!moduleId) return { ...base, reason: "missing-module" };
    if (!ACTION_SET.has(action)) return { ...base, reason: "unknown-action" };

    const effectiveAssignments = getEffectiveSubjectRoleAssignments(subject, subjectRoleAssignments, {
      at,
      roleIds,
      positionDefaultRoleRules,
    });
    base.effectiveAssignmentIds = effectiveAssignments.map((assignment) => assignment.id);
    base.effectiveRoleIds = effectiveAssignments.map((assignment) => assignment.roleId);
    if (!effectiveAssignments.length) return { ...base, reason: "no-effective-role" };

    let hasGrant = false;
    for (const assignment of effectiveAssignments) {
      const role = roleById.get(assignment.roleId);
      if (!role || !grants(role, moduleId, action)) continue;
      hasGrant = true;
      const scopes = getDecisionScopes(
        subject,
        role,
        assignment,
        responsibilityScopes,
        moduleId,
        action,
        at,
      );
      const allowedScopes = scopes.filter((scope) => scopeAllows(scope, subject, action, resourceContext));
      if (!allowedScopes.length) continue;
      return {
        ...base,
        allowed: true,
        reason: "allowed",
        matchedAssignmentId: assignment.id,
        matchedRoleId: role.id,
        matchedScopeIds: allowedScopes.map((scope) => scope.id),
      };
    }
    return { ...base, reason: hasGrant ? "outside-responsibility-scope" : "action-not-granted" };
  }

  function canSubject(subject, moduleId, action = "view", resourceContext = {}) {
    return explainCan(subject, moduleId, action, resourceContext).allowed;
  }

  return {
    accessRoles,
    subjectRoleAssignments,
    responsibilityScopes,
    positionDefaultRoleRules,
    grants: (roleOrId, moduleId, action = "view") => grants(
      typeof roleOrId === "string" ? roleById.get(roleOrId) : roleOrId,
      moduleId,
      action,
    ),
    getEffectiveSubjectRoleAssignments: (subject, options = {}) => getEffectiveSubjectRoleAssignments(
      subject,
      subjectRoleAssignments,
      { at: options.at ?? now(), roleIds, positionDefaultRoleRules },
    ),
    explainCan,
    can: canSubject,
  };
}

export function can(subject, moduleId, action = "view", resourceContext = {}, config = {}) {
  return createAccessControlService(config).can(subject, moduleId, action, resourceContext);
}

function legacyMatcherMatches(matcher, label, position) {
  if (typeof matcher.match === "function") return Boolean(matcher.match(position));
  const pattern = matcher.pattern ?? matcher.match;
  if (pattern instanceof RegExp) {
    return new RegExp(pattern.source, pattern.flags).test(label);
  }
  if (typeof pattern === "string" && pattern) {
    try {
      return new RegExp(pattern, matcher.flags || "i").test(label);
    } catch {
      return false;
    }
  }
  return false;
}

// This helper is intentionally separate from runtime authorization. It may infer once,
// but emits exact positionId -> roleId rules and a complete audit report for review.
export function migrateLegacyPositionDefaultRoles(options = {}) {
  const positions = Array.isArray(options.positions) ? options.positions : [];
  const knownRoleIds = normalizeIdList(options.roleIds ?? options.knownRoleIds);
  const knownRoleSet = new Set(knownRoleIds);
  const explicitRules = normalizePositionDefaultRoleRules(options.explicitRules ?? [], { roleIds: knownRoleIds });
  const coveredPositionIds = new Set(explicitRules.map((rule) => rule.positionId));
  const matchers = (options.legacyLabelRules ?? options.legacyMatchers ?? [])
    .filter(isRecord)
    .map((matcher, index) => ({
      ...matcher,
      id: normalizeId(matcher.id) || `legacy-matcher-${index + 1}`,
      roleId: normalizeId(matcher.roleId),
    }))
    .filter((matcher) => matcher.roleId && (!knownRoleSet.size || knownRoleSet.has(matcher.roleId)));
  const inferredRules = [];
  const report = {
    explicit: [],
    inferred: [],
    conflicts: [],
    unmatched: [],
    skipped: [],
  };

  positions.forEach((position, index) => {
    if (!isRecord(position)) {
      report.skipped.push({ index, reason: "invalid-position-record" });
      return;
    }
    const positionId = normalizeId(position.id ?? position.positionId);
    const label = normalizeId(position.label ?? position.name ?? position.position);
    if (!positionId) {
      report.skipped.push({ index, label, reason: "missing-position-id" });
      return;
    }
    if (coveredPositionIds.has(positionId)) {
      report.explicit.push({
        positionId,
        roleIds: explicitRules.filter((rule) => rule.positionId === positionId).map((rule) => rule.roleId),
      });
      return;
    }
    const matches = matchers.filter((matcher) => legacyMatcherMatches(matcher, label, position));
    const matchedRoleIds = [...new Set(matches.map((matcher) => matcher.roleId))];
    if (!matchedRoleIds.length) {
      report.unmatched.push({ positionId, label });
      return;
    }
    if (matchedRoleIds.length > 1) {
      report.conflicts.push({
        positionId,
        label,
        roleIds: matchedRoleIds,
        matcherIds: matches.map((matcher) => matcher.id),
      });
      return;
    }
    const roleId = matchedRoleIds[0];
    const matcherIds = matches.map((matcher) => matcher.id);
    inferredRules.push({
      id: `migrated-position-role:${positionId}`,
      positionId,
      roleId,
      source: "legacy-label-migration",
      migrationReason: matcherIds.join(","),
      effectiveFrom: options.effectiveFrom,
      effectiveTo: options.effectiveTo,
    });
    report.inferred.push({ positionId, label, roleId, matcherIds });
  });

  const rules = normalizePositionDefaultRoleRules([...explicitRules, ...inferredRules], { roleIds: knownRoleIds });
  return {
    rules,
    report: {
      ...report,
      counts: Object.fromEntries(Object.entries(report).map(([key, rows]) => [key, rows.length])),
    },
  };
}
