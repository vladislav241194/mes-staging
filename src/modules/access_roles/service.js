import {
  ACCESS_CONTROL_ACTIONS,
  ACCESS_CONTROL_SCOPE_TYPES,
  grants,
  normalizeAccessRoles,
} from "../access_control/service.js";

const ACTION_LABELS = Object.freeze({
  view: { label: "Просмотр", shortLabel: "Видит" },
  edit: { label: "Редактирование", shortLabel: "Правит" },
  print: { label: "Печать", shortLabel: "Печать" },
  assign: { label: "Назначение", shortLabel: "Назн." },
  approve: { label: "Утверждение", shortLabel: "Утв." },
  configure: { label: "Настройка", shortLabel: "Настр." },
});

const SCOPE_LABELS = Object.freeze({
  factory: "Вся фабрика",
  department: "Свой отдел",
  workCenter: "Свои участки",
  self: "Только свои записи",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeId(value) {
  return String(value ?? "").trim();
}

function normalizeProvidedDefinitions(provided, ids, fallback) {
  const source = Array.isArray(provided) ? provided : [];
  const sourceById = new Map(source.map((item) => [normalizeId(item?.id), item]).filter(([id]) => id));
  return ids.map((id) => ({ id, ...fallback[id], ...(sourceById.get(id) || {}) }));
}

export function getAccessRoleActionDefinitions(provided = []) {
  return normalizeProvidedDefinitions(provided, ACCESS_CONTROL_ACTIONS, ACTION_LABELS);
}

export function getAccessRoleScopeDefinitions(provided = []) {
  return normalizeProvidedDefinitions(
    provided,
    ACCESS_CONTROL_SCOPE_TYPES,
    Object.fromEntries(ACCESS_CONTROL_SCOPE_TYPES.map((id) => [id, { label: SCOPE_LABELS[id] }])),
  );
}

export function isDomainAccessControlService(value) {
  return isRecord(value)
    && Array.isArray(value.accessRoles)
    && Array.isArray(value.subjectRoleAssignments)
    && Array.isArray(value.responsibilityScopes)
    && typeof value.grants === "function"
    && typeof value.getEffectiveSubjectRoleAssignments === "function"
    && typeof value.can === "function";
}

function normalizeLegacyRoles(profiles = []) {
  return normalizeAccessRoles((Array.isArray(profiles) ? profiles : []).map((role) => ({
    id: role?.id,
    label: role?.label,
    description: role?.description ?? role?.caption,
    active: role?.active,
    readOnly: role?.readOnly ?? role?.readonly,
    defaultModule: role?.defaultModule,
    scope: role?.scope,
    factoryIds: role?.factoryIds,
    departmentIds: role?.departmentIds,
    workCenterIds: role?.workCenterIds,
    grants: role?.grants ?? role?.modulePermissions,
  })));
}

function createLegacyEffectiveAssignment(person, legacyAssignments, getLegacyAccessRoleForEmployee) {
  const subjectId = normalizeId(person?.id);
  if (!subjectId) return [];
  const explicitRoleId = normalizeId(legacyAssignments?.[subjectId]);
  if (explicitRoleId) {
    return [{
      id: `legacy-explicit:${subjectId}:${explicitRoleId}`,
      subjectType: "employee",
      subjectId,
      roleId: explicitRoleId,
      source: "legacy-explicit",
      effectiveFrom: null,
      effectiveTo: null,
    }];
  }
  const legacy = typeof getLegacyAccessRoleForEmployee === "function"
    ? getLegacyAccessRoleForEmployee(person)
    : null;
  const roleId = normalizeId(legacy?.role?.id);
  if (!roleId) return [];
  return [{
    id: `legacy-position-inference:${subjectId}:${roleId}`,
    subjectType: "employee",
    subjectId,
    roleId,
    source: "legacy-position-inference",
    effectiveFrom: null,
    effectiveTo: null,
  }];
}

export function createAccessRolesReadAdapter(options = {}) {
  const domainRequested = Boolean(options.domainRequested);
  const domainService = options.domainService;
  const domainValid = domainRequested && isDomainAccessControlService(domainService);
  let accessRoles = [];
  let error = "";
  try {
    accessRoles = domainValid
      ? normalizeAccessRoles(domainService.accessRoles)
      : domainRequested
        ? []
        : normalizeLegacyRoles(options.legacyProfiles);
  } catch (caught) {
    accessRoles = [];
    error = String(caught?.message || caught || "Access role normalization failed");
  }
  if (domainRequested && !domainValid && !error) error = "Доменный сервис доступа не инициализирован или имеет неполный контракт.";
  if (!domainRequested && !accessRoles.length && !error) error = "Legacy-профили ролей отсутствуют.";
  const roleById = new Map(accessRoles.map((role) => [role.id, role]));
  const legacyAssignments = isRecord(options.legacyAssignments) ? options.legacyAssignments : {};
  const at = options.at ?? new Date();

  function roleGrants(roleOrId, moduleId, action = "view") {
    const role = typeof roleOrId === "string" ? roleById.get(roleOrId) : roleOrId;
    if (!role) return false;
    if (domainValid) {
      try {
        return Boolean(domainService.grants(role.id, moduleId, action));
      } catch {
        return false;
      }
    }
    return grants(role, moduleId, action);
  }

  function getEffectiveAssignments(person) {
    if (!normalizeId(person?.id)) return [];
    if (!domainValid) {
      if (domainRequested) return [];
      return createLegacyEffectiveAssignment(person, legacyAssignments, options.getLegacyAccessRoleForEmployee)
        .filter((assignment) => roleById.has(assignment.roleId));
    }
    try {
      return domainService.getEffectiveSubjectRoleAssignments(person, { at })
        .filter((assignment) => roleById.has(assignment.roleId));
    } catch {
      return [];
    }
  }

  function getResponsibilityScopesForRole(roleId, employees = []) {
    if (!domainValid) return [];
    const subjectIds = new Set();
    const assignmentIds = new Set();
    employees.forEach((person) => {
      getEffectiveAssignments(person).forEach((assignment) => {
        if (assignment.roleId !== roleId) return;
        subjectIds.add(assignment.subjectId);
        assignmentIds.add(assignment.id);
      });
    });
    return domainService.responsibilityScopes.filter((scope) => (
      scope.roleId === roleId
      || (scope.subjectId && subjectIds.has(scope.subjectId))
      || (scope.assignmentId && assignmentIds.has(scope.assignmentId))
    ));
  }

  function canConfigure(subject, resourceContext = {}) {
    if (!domainValid) return !domainRequested && Boolean(options.legacyWritable);
    try {
      return Boolean(domainService.can(subject, "roles", "configure", { ...resourceContext, at }));
    } catch {
      return false;
    }
  }

  return {
    mode: domainRequested ? domainValid && !error ? "domain" : "domain-invalid" : error ? "legacy-invalid" : "legacy",
    domainValid: domainValid && !error,
    error,
    accessRoles,
    subjectRoleAssignments: domainValid ? domainService.subjectRoleAssignments : [],
    responsibilityScopes: domainValid ? domainService.responsibilityScopes : [],
    getRole: (roleId) => roleById.get(normalizeId(roleId)) || null,
    grants: roleGrants,
    getEffectiveAssignments,
    getResponsibilityScopesForRole,
    canConfigure,
  };
}

export function formatAccessEffectiveWindow(record = {}, locale = "ru-RU") {
  const format = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale) : "";
  };
  const from = format(record.effectiveFrom);
  const to = format(record.effectiveTo);
  if (!from && !to) return "без ограничения";
  return `${from || "с начала"} — ${to || "без окончания"}`;
}

export function describeResponsibilityScope(scope = {}) {
  const targets = [
    ...(scope.factoryIds || []).map((id) => `фабрика: ${id}`),
    ...(scope.departmentIds || []).map((id) => `отдел: ${id}`),
    ...(scope.workCenterIds || []).map((id) => `участок: ${id}`),
  ];
  const filters = [
    (scope.moduleIds || []).length ? `модули: ${scope.moduleIds.join(", ")}` : "",
    (scope.actions || []).length ? `действия: ${scope.actions.join(", ")}` : "",
  ].filter(Boolean);
  return {
    targets: targets.join(" · ") || (scope.type === "self" ? "текущий сотрудник" : "по принадлежности субъекта"),
    filters: filters.join(" · ") || "все разрешённые модулем действия",
  };
}
