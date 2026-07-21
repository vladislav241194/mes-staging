const DEFAULT_EFFECTIVE_FROM = "1970-01-01";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function registry(domains, name) {
  return asArray(asRecord(domains?.registries)[name]);
}

function indexById(rows) {
  return new Map(asArray(rows).map((row) => [cleanText(row?.id), row]).filter(([id]) => id));
}

function calculateWindowHours(startValue, endValue, subtractLunch = false) {
  const parse = (value) => {
    const match = cleanText(value).match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = parse(startValue);
  const end = parse(endValue);
  if (start === null || end === null || start === end) return 0;
  const windowMinutes = end > start ? end - start : (24 * 60) - start + end;
  return Math.max(0, (windowMinutes - (subtractLunch ? 60 : 0)) / 60);
}

function makeLegacyWorkCenterIndexes(legacyRows) {
  const byRuntimeId = indexById(legacyRows);
  const byDomainId = new Map();
  asArray(legacyRows).forEach((row) => {
    [row?.matrixId, row?.sourceId, row?.id].map(cleanText).filter(Boolean).forEach((id) => {
      if (!byDomainId.has(id)) byDomainId.set(id, row);
    });
  });
  return { byRuntimeId, byDomainId };
}

export function createSystemDomainRuntimeIdMap(domains, legacyWorkCenters = []) {
  const { byDomainId } = makeLegacyWorkCenterIndexes(legacyWorkCenters);
  return new Map(registry(domains, "workCenters").map((center) => {
    const domainId = cleanText(center?.id);
    const legacy = byDomainId.get(domainId);
    return [domainId, cleanText(legacy?.id) || domainId];
  }).filter(([domainId]) => domainId));
}

// Planning transports still carry the stable runtime work-center IDs while
// System Domains owns the migrated matrix IDs.  Keep the reverse bridge next
// to the existing domain -> runtime projection so read-only consumers can
// canonicalize transport rows without importing a legacy renderer or copying
// the production-structure alias table.
export function createSystemDomainCanonicalWorkCenterIdMap(domains, legacyWorkCenters = []) {
  const runtimeIdByDomainId = createSystemDomainRuntimeIdMap(domains, legacyWorkCenters);
  const canonicalIdByRuntimeId = new Map();
  runtimeIdByDomainId.forEach((runtimeId, domainId) => {
    canonicalIdByRuntimeId.set(domainId, domainId);
    if (runtimeId) canonicalIdByRuntimeId.set(runtimeId, domainId);
  });
  return canonicalIdByRuntimeId;
}

export function projectSystemDomainWorkCenters(domains, legacyWorkCenters = []) {
  const centers = registry(domains, "workCenters");
  if (!centers.length) return asArray(legacyWorkCenters).map((row) => ({ ...row }));
  const { byDomainId } = makeLegacyWorkCenterIndexes(legacyWorkCenters);
  const runtimeIdByDomainId = createSystemDomainRuntimeIdMap(domains, legacyWorkCenters);
  return centers.map((center) => {
    const domainId = cleanText(center.id);
    const legacy = byDomainId.get(domainId) || {};
    const runtimeId = runtimeIdByDomainId.get(domainId) || domainId;
    const parentDomainId = cleanText(center.parentWorkCenterId);
    const hasDomainParent = Object.prototype.hasOwnProperty.call(center, "parentWorkCenterId");
    const participatesInPlanning = typeof center.participatesInPlanning === "boolean"
      ? center.participatesInPlanning
      : Boolean(legacy.isPlanningUnit);
    const showInGantt = typeof center.showInGantt === "boolean"
      ? center.showInGantt
      : legacy.showInGantt !== false;
    return {
      ...legacy,
      id: runtimeId,
      matrixId: domainId,
      domainId,
      code: cleanText(center.code) || runtimeId,
      name: cleanText(center.name) || cleanText(legacy.name) || runtimeId,
      description: cleanText(legacy.description) || "Источник: Структура и сотрудники",
      parentWorkCenterId: hasDomainParent
        ? (runtimeIdByDomainId.get(parentDomainId) || "")
        : cleanText(legacy.parentWorkCenterId),
      isActive: center.isActive !== false,
      participatesInPlanning,
      isPlanningUnit: participatesInPlanning || showInGantt,
      showInGantt,
      canPlanDirectly: Boolean(center.canPlanDirectly),
      availabilitySource: cleanText(center.availabilitySource) || cleanText(legacy.availabilitySource) || "Структура и сотрудники",
      source: "Структура и сотрудники",
    };
  });
}

export function projectSystemDomainResources(domains, legacyResources = [], legacyWorkCenters = []) {
  const equipment = registry(domains, "equipment");
  const domainCenters = registry(domains, "workCenters");
  if (!equipment.length && !domainCenters.length) return asArray(legacyResources).map((row) => ({ ...row }));
  const runtimeIdByDomainId = createSystemDomainRuntimeIdMap(domains, legacyWorkCenters);
  const centerByDomainId = indexById(domainCenters);
  const equipmentById = indexById(equipment);
  const matchedEquipmentIds = new Set();
  const projected = asArray(legacyResources).map((resource) => {
    const domainId = cleanText(resource?.matrixId || resource?.id);
    const domainEquipment = equipmentById.get(domainId);
    if (!domainEquipment) return { ...resource, source: "Структура и сотрудники" };
    matchedEquipmentIds.add(domainEquipment.id);
    const workCenterId = runtimeIdByDomainId.get(cleanText(domainEquipment.workCenterId)) || cleanText(resource.workCenterId);
    const center = centerByDomainId.get(cleanText(domainEquipment.workCenterId));
    return {
      ...resource,
      id: cleanText(resource.id) || domainEquipment.id,
      matrixId: domainEquipment.id,
      domainId: domainEquipment.id,
      name: cleanText(domainEquipment.name) || cleanText(resource.name) || domainEquipment.id,
      type: "equipment",
      workCenterId,
      workCenter: cleanText(center?.name) || cleanText(resource.workCenter) || workCenterId,
      capacity: cleanText(resource.capacity) || `${Math.max(1, Number(domainEquipment.quantity) || 1)} ед.`,
      participatesInPlanning: domainEquipment.participatesInPlanning === false ? "no" : "yes",
      status: domainEquipment.isActive === false ? "Недоступен" : "Доступен",
      sourceKind: "systemDomainEquipment",
      source: "Структура и сотрудники",
    };
  });
  equipment.forEach((item) => {
    if (matchedEquipmentIds.has(item.id)) return;
    const workCenterId = runtimeIdByDomainId.get(cleanText(item.workCenterId)) || cleanText(item.workCenterId);
    const center = centerByDomainId.get(cleanText(item.workCenterId));
    projected.push({
      id: item.id,
      matrixId: item.id,
      domainId: item.id,
      name: cleanText(item.name) || item.id,
      type: "equipment",
      workCenterId,
      workCenter: cleanText(center?.name) || workCenterId,
      capacity: `${Math.max(1, Number(item.quantity) || 1)} ед.`,
      participatesInPlanning: item.participatesInPlanning === false ? "no" : "yes",
      participatesInCalculation: "yes",
      status: item.isActive === false ? "Недоступен" : "Доступен",
      sourceKind: "systemDomainEquipment",
      source: "Структура и сотрудники",
    });
  });
  return projected;
}

export function projectSystemDomainEmployees(domains, legacyEmployees = [], legacyWorkCenters = []) {
  const employees = registry(domains, "employees");
  if (!employees.length) return asArray(legacyEmployees).map((row) => ({ ...row }));
  const assignments = registry(domains, "employmentAssignments");
  const positions = indexById(registry(domains, "positions"));
  const orgUnits = indexById(registry(domains, "orgUnits"));
  const scheduleAssignments = registry(domains, "scheduleAssignments");
  const scheduleTemplates = indexById(registry(domains, "scheduleTemplates"));
  const legacyById = indexById(legacyEmployees);
  const runtimeIdByDomainId = createSystemDomainRuntimeIdMap(domains, legacyWorkCenters);
  const primaryAssignmentByEmployeeId = new Map();
  assignments.forEach((assignment) => {
    const employeeId = cleanText(assignment.employeeId);
    if (!employeeId) return;
    const current = primaryAssignmentByEmployeeId.get(employeeId);
    if (!current || assignment.isPrimary === true) primaryAssignmentByEmployeeId.set(employeeId, assignment);
  });
  const scheduleAssignmentByEmployeeId = new Map();
  scheduleAssignments.forEach((assignment) => {
    const employeeId = cleanText(assignment.employeeId);
    if (employeeId && !scheduleAssignmentByEmployeeId.has(employeeId)) scheduleAssignmentByEmployeeId.set(employeeId, assignment);
  });
  return employees.map((employee) => {
    const legacy = legacyById.get(cleanText(employee.id)) || {};
    const assignment = primaryAssignmentByEmployeeId.get(cleanText(employee.id)) || {};
    const position = positions.get(cleanText(assignment.positionId)) || {};
    const orgUnit = orgUnits.get(cleanText(assignment.orgUnitId)) || {};
    const scheduleAssignment = scheduleAssignmentByEmployeeId.get(cleanText(employee.id)) || {};
    const scheduleTemplate = scheduleTemplates.get(cleanText(scheduleAssignment.scheduleTemplateId || position.defaultScheduleTemplateId)) || {};
    const workCenterDomainId = cleanText(assignment.workCenterId || position.workCenterId || assignment.orgUnitId);
    const runtimeWorkCenterId = runtimeIdByDomainId.get(workCenterDomainId) || workCenterDomainId;
    const scheduleCode = cleanText(scheduleTemplate.code) || cleanText(legacy.workSchedule || legacy.schedule);
    const capabilities = asRecord(position.capabilities);
    const canDistribute = Boolean(capabilities.canDistribute);
    const roleName = cleanText(position.name) || cleanText(legacy.role) || "Сотрудник";
    // A production director is a valid employee root in the legacy matrix: it
    // deliberately has no manufacturing department above it. Preserve that
    // semantic in the canonical projection instead of showing an empty
    // department in authentication and access surfaces.
    const fallbackDepartment = /директор|начальник производства|руководител/.test(
      `${roleName} ${cleanText(legacy.role)} ${cleanText(employee.displayName)}`.toLocaleLowerCase("ru-RU"),
    ) ? "Административный отдел" : "";
    const hours = calculateWindowHours(scheduleTemplate.start, scheduleTemplate.end, scheduleTemplate.subtractLunch);
    return {
      ...legacy,
      id: cleanText(employee.id),
      matrixId: cleanText(employee.id),
      personnelNumber: cleanText(employee.personnelNumber) || cleanText(employee.id),
      name: cleanText(employee.displayName) || cleanText(legacy.name) || cleanText(employee.id),
      role: roleName,
      positionId: cleanText(position.id),
      orgUnitId: cleanText(orgUnit.id),
      department: cleanText(orgUnit.name) || cleanText(legacy.department) || fallbackDepartment,
      personKind: canDistribute || position.kind === "manager" ? "master" : "employee",
      workCenterIds: runtimeWorkCenterId ? [runtimeWorkCenterId] : [],
      source: "Структура и сотрудники",
      schedule: scheduleCode,
      workSchedule: scheduleCode,
      workMode: scheduleTemplate.start && scheduleTemplate.end
        ? `${scheduleTemplate.start}-${scheduleTemplate.end}`
        : cleanText(legacy.workMode),
      calendarShiftWindow: scheduleTemplate.start && scheduleTemplate.end ? `${scheduleTemplate.start}–${scheduleTemplate.end}` : cleanText(legacy.calendarShiftWindow),
      humanHoursPerShift: hours || Number(legacy.humanHoursPerShift) || 0,
      availabilitySource: "Календарь персонала",
      subtractLunch: Boolean(scheduleTemplate.subtractLunch),
      canDistribute,
      canExecute: capabilities.canExecute !== false,
      canReceiveSheet: capabilities.canReceiveShiftSheet !== false,
      canCloseFact: Boolean(capabilities.canCloseFact),
      isActive: employee.isActive !== false,
    };
  });
}

export function getSystemDomainSummary(domains) {
  const orgUnits = registry(domains, "orgUnits");
  return {
    rows: Object.values(asRecord(domains?.registries)).reduce((total, rows) => total + asArray(rows).length, 0),
    fields: 13,
    departments: orgUnits.filter((row) => row?.kind === "department").length,
    sections: orgUnits.filter((row) => row?.kind === "section").length,
    roles: registry(domains, "positions").length,
    employees: registry(domains, "employees").length,
    equipment: registry(domains, "equipment").length,
  };
}

export function toPersonnelCalendarModel(domains) {
  const scheduleTemplates = registry(domains, "scheduleTemplates").map((template) => ({
    id: cleanText(template.id),
    code: cleanText(template.code),
    name: cleanText(template.label || template.name || template.code),
    cycleAnchorDate: template.code === "5/2" ? "1970-01-05" : "1970-01-01",
    workPattern: template.code === "5/2" ? [true, true, true, true, true, false, false] : [true, true, false, false],
    startTime: cleanText(template.start) || "08:00",
    endTime: cleanText(template.end) || (template.code === "5/2" ? "17:00" : "20:00"),
    breakMinutes: template.subtractLunch ? 60 : 0,
    sourceRefs: [`system-domains:schedule-template:${cleanText(template.id)}`],
  }));
  const scheduleAssignments = registry(domains, "scheduleAssignments").map((assignment) => ({
    id: cleanText(assignment.id),
    employeeId: cleanText(assignment.employeeId),
    scheduleTemplateId: cleanText(assignment.scheduleTemplateId),
    patternOffset: Number.isInteger(Number(assignment.patternOffset)) ? Number(assignment.patternOffset) : 0,
    effectiveFrom: cleanText(assignment.validFrom || assignment.effectiveFrom) || DEFAULT_EFFECTIVE_FROM,
    effectiveTo: cleanText(assignment.validTo || assignment.effectiveTo) || null,
    sourceRefs: [`system-domains:schedule-assignment:${cleanText(assignment.id)}`],
  }));
  const attendanceEvents = [];
  registry(domains, "attendanceEvents").forEach((event) => {
    const kind = cleanText(event.kind || event.type) || "work";
    const base = {
      id: cleanText(event.id),
      employeeId: cleanText(event.employeeId),
      date: cleanText(event.date),
      kind,
      sourceRefs: [`system-domains:attendance-event:${cleanText(event.id)}`],
    };
    if (kind === "work") {
      base.startTime = cleanText(event.startTime || event.start);
      base.endTime = cleanText(event.endTime || event.end);
    }
    if (kind === "overtime") base.minutes = Math.max(1, Math.round(Number(event.minutes || 0)));
    attendanceEvents.push(base);
    const overtimeMinutes = Math.max(0, Math.round(Number(event.overtimeHours || 0) * 60));
    if (kind !== "overtime" && overtimeMinutes > 0) {
      attendanceEvents.push({
        id: `${cleanText(event.id)}:overtime`,
        employeeId: cleanText(event.employeeId),
        date: cleanText(event.date),
        kind: "overtime",
        minutes: overtimeMinutes,
        sourceRefs: [`system-domains:attendance-event:${cleanText(event.id)}:overtime`],
      });
    }
  });
  return { scheduleTemplates, scheduleAssignments, attendanceEvents };
}

export function toAccessControlRoles(domains) {
  const grantsByRole = new Map();
  registry(domains, "grants").forEach((grant) => {
    const roleId = cleanText(grant.roleId);
    const moduleId = cleanText(grant.resourceId || grant.moduleId);
    const action = cleanText(grant.actionId || grant.action);
    if (!roleId || !moduleId || !action) return;
    if (!grantsByRole.has(roleId)) grantsByRole.set(roleId, {});
    const matrix = grantsByRole.get(roleId);
    matrix[moduleId] = { ...asRecord(matrix[moduleId]), [action]: grant.effect !== "deny" };
  });
  return registry(domains, "accessRoles").map((role) => ({
    id: cleanText(role.id),
    label: cleanText(role.label || role.name || role.id),
    description: cleanText(role.description),
    active: role.isActive !== false,
    readOnly: Boolean(role.readOnly),
    defaultModule: cleanText(role.defaultModuleId || role.defaultModule),
    scope: cleanText(role.scope) || "factory",
    grants: grantsByRole.get(cleanText(role.id)) || {},
  }));
}

export function toAccessControlAssignments(domains) {
  return registry(domains, "roleAssignments").map((assignment) => ({
    id: cleanText(assignment.id),
    subjectType: "employee",
    subjectId: cleanText(assignment.employeeId || assignment.subjectId),
    roleId: cleanText(assignment.roleId),
    source: cleanText(assignment.source) || "system-domains",
    effectiveFrom: cleanText(assignment.validFrom || assignment.effectiveFrom) || undefined,
    effectiveTo: cleanText(assignment.validTo || assignment.effectiveTo) || undefined,
  }));
}

export function getSystemDomainAccessSubject(domains, employeeId) {
  const normalizedEmployeeId = cleanText(employeeId);
  const employee = registry(domains, "employees").find((row) => row?.id === normalizedEmployeeId);
  const assignment = registry(domains, "employmentAssignments").find((row) => row?.employeeId === normalizedEmployeeId && row?.isPrimary !== false)
    || registry(domains, "employmentAssignments").find((row) => row?.employeeId === normalizedEmployeeId);
  return {
    id: normalizedEmployeeId,
    subjectType: "employee",
    active: Boolean(employee && employee.isActive !== false),
    positionId: cleanText(assignment?.positionId),
    departmentIds: cleanText(assignment?.orgUnitId) ? [cleanText(assignment.orgUnitId)] : [],
    workCenterIds: cleanText(assignment?.workCenterId) ? [cleanText(assignment.workCenterId)] : [],
  };
}
