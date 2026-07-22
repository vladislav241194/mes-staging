import type {
  AuthPickerDepartment,
  AuthPickerElevationTarget,
  AuthPickerModel,
  AuthPickerPerson,
  AuthPickerUnit,
} from "./adapter";

type UnknownRecord = Record<string, unknown>;

interface ProjectedPerson extends AuthPickerPerson {
  centerId: string;
}

interface CenterRow {
  id: string;
  name: string;
  caption: string;
  parentId: string;
}

const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value)
  ? value as UnknownRecord
  : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = ""): string => String(value ?? fallback).trim();
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const firstText = (...values: unknown[]): string => values.map((value) => text(value)).find(Boolean) || "";

function normalizeLookup(value: unknown): string {
  return text(value).toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");
}

function isRussianNamePart(value: string): boolean {
  return /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/.test(value);
}

function isRussianPatronymic(value: string): boolean {
  return isRussianNamePart(value) && /(вич|ич|вна|чна|инич|инична|оглы|кызы)$/i.test(value);
}

function formatPersonName(value: unknown, fallback = "Сотрудник"): string {
  const parts = text(value).replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length < 3) return parts.join(" ");
  const [lastName, firstName, middleName] = parts;
  if (!isRussianNamePart(lastName) || !isRussianNamePart(firstName) || !isRussianPatronymic(middleName)) return parts.join(" ");
  return [lastName, firstName].join(" ");
}

function validDate(value: unknown): string {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate ? "" : candidate;
}

function effectiveOn(row: UnknownRecord, businessDate: string): boolean {
  const validFrom = validDate(row.validFrom ?? row.effectiveFrom);
  const validTo = validDate(row.validTo ?? row.effectiveTo);
  return (!validFrom || validFrom <= businessDate) && (!validTo || businessDate <= validTo);
}

function activeOn(row: UnknownRecord, businessDate: string): boolean {
  return row.isActive !== false && !text(row.archivedAt) && effectiveOn(row, businessDate);
}

function byId(rows: UnknownRecord[]): Map<string, UnknownRecord> {
  return new Map(rows.flatMap((row) => {
    const id = text(row.id);
    return id ? [[id, row] as const] : [];
  }));
}

function resolveRegistries(input: UnknownRecord): UnknownRecord {
  const domains = record(input.domains);
  const systemDomains = record(input.systemDomains);
  const item = record(input.item);
  const candidates = [
    record(input.registries),
    record(domains.registries),
    record(systemDomains.registries),
    record(item.registries),
  ];
  return candidates.find((candidate) => Object.keys(candidate).length > 0) || input;
}

function rows(registries: UnknownRecord, name: string): UnknownRecord[] {
  return list(registries[name]).map(record);
}

function chooseEffectiveRow(source: UnknownRecord[], businessDate: string, preferPrimary = false): UnknownRecord {
  return source
    .filter((row) => activeOn(row, businessDate))
    .sort((left, right) => (
      (preferPrimary ? Number(right.isPrimary === true) - Number(left.isPrimary === true) : 0)
      || text(right.validFrom ?? right.effectiveFrom).localeCompare(text(left.validFrom ?? left.effectiveFrom), "en")
      || text(left.id).localeCompare(text(right.id), "en")
    ))[0] || {};
}

function resolveElevationTarget(value: unknown): AuthPickerElevationTarget {
  const candidate = text(value);
  if (candidate === "productionStructureMatrix") return "production-structure";
  return candidate === "planning" || candidate === "production-structure" ? candidate : "nomenclature";
}

function resolveProductionState(input: UnknownRecord, capabilitiesValue: unknown, authStateValue: unknown) {
  const session = record(input.session);
  const nestedElevation = record(input.elevation);
  const sessionElevation = record(session.elevation);
  const elevation = Object.keys(nestedElevation).length ? nestedElevation : sessionElevation;
  const elevationActive = input.elevation === true || input.elevationActive === true || elevation.active === true || elevation.enabled === true || session.elevationActive === true;
  const actor = record(session.actor);
  const elevationPersonId = firstText(elevation.employeeId, elevation.forcedPersonId, session.elevationEmployeeId, session.employeeId, session.personId, actor.employeeId, input.forcedPersonId);
  const forcedPersonId = elevationActive ? elevationPersonId : "";
  const inputCapabilities = record(input.capabilities);
  const capabilities = { ...inputCapabilities, ...record(capabilitiesValue) };
  const authState = { ...record(session.authState), ...record(input.authState), ...record(authStateValue) };
  return {
    canEnterPin: capabilities.pinEntry === true,
    attemptsLeft: Math.max(0, number(authState.attemptsLeft ?? session.attemptsLeft)),
    result: text(authState.result ?? session.result),
    elevation: elevationActive,
    forcedPersonId,
    elevationTarget: resolveElevationTarget(firstText(elevation.target, elevation.elevationTarget, elevation.returnModule, input.elevationTarget)),
  };
}

function buildCenters(registries: UnknownRecord, businessDate: string): CenterRow[] {
  const workCenters = rows(registries, "workCenters");
  const unitRows = workCenters.length ? workCenters : rows(registries, "units");
  const orgUnits = rows(registries, "orgUnits");
  const source = unitRows.length ? unitRows : orgUnits;
  return source
    .filter((row) => activeOn(row, businessDate))
    .flatMap((row): CenterRow[] => {
      const id = text(row.id);
      if (!id) return [];
      return [{
        id,
        name: firstText(row.name, row.label, row.code) || id,
        caption: firstText(row.operations, row.operationClasses, row.description),
        parentId: firstText(row.parentWorkCenterId, row.parentUnitId, row.parentOrgUnitId),
      }];
    });
}

function getRootCenterId(centerId: string, centerById: Map<string, CenterRow>): string {
  let current = centerById.get(centerId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) return "";
    visited.add(current.id);
    if (!current.parentId || !centerById.has(current.parentId)) return current.id;
    current = centerById.get(current.parentId);
  }
  return "";
}

function isInSubtree(centerId: string, rootId: string, centerById: Map<string, CenterRow>): boolean {
  let current = centerById.get(centerId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.id === rootId) return true;
    visited.add(current.id);
    current = centerById.get(current.parentId);
  }
  return false;
}

function getAssignedAccessRoleLabel({
  employeeId,
  businessDate,
  roleAssignments,
  accessRoleById,
  grants,
}: {
  employeeId: string;
  businessDate: string;
  roleAssignments: UnknownRecord[];
  accessRoleById: Map<string, UnknownRecord>;
  grants: UnknownRecord[];
}): string {
  const assignments = roleAssignments
    .filter((row) => text(row.employeeId ?? row.subjectId) === employeeId && activeOn(row, businessDate))
    .filter((row) => {
      const role = accessRoleById.get(text(row.roleId));
      return Boolean(role && activeOn(role, businessDate));
    })
    .sort((left, right) => {
      const score = (row: UnknownRecord): number => {
        const roleId = text(row.roleId);
        return grants.reduce((result, grant) => {
          if (text(grant.roleId) !== roleId || grant.effect === "deny") return result;
          const resourceId = text(grant.resourceId ?? grant.moduleId);
          const actionId = text(grant.actionId ?? grant.action);
          if (resourceId === "authSessionPrototype" && actionId === "view") return Math.max(result, 2);
          return Math.max(result, 1);
        }, 0);
      };
      return score(right) - score(left)
        || text(right.validFrom ?? right.effectiveFrom).localeCompare(text(left.validFrom ?? left.effectiveFrom), "en")
        || text(left.id).localeCompare(text(right.id), "en");
    });
  const role = accessRoleById.get(text(assignments[0]?.roleId));
  return firstText(role?.label, role?.name);
}

function buildPeople(registries: UnknownRecord, businessDate: string, centers: CenterRow[]): ProjectedPerson[] {
  const employees = rows(registries, "employees");
  const employmentAssignments = rows(registries, "employmentAssignments");
  const positionsById = byId(rows(registries, "positions"));
  const orgUnitsById = byId(rows(registries, "orgUnits"));
  const accessRoleById = byId(rows(registries, "accessRoles"));
  const roleAssignments = rows(registries, "roleAssignments");
  const grants = rows(registries, "grants");
  const centerById = new Map(centers.map((center) => [center.id, center] as const));
  const seen = new Set<string>();
  return employees.flatMap((employee): ProjectedPerson[] => {
    const id = text(employee.id);
    if (!id || seen.has(id) || !activeOn(employee, businessDate)) return [];
    seen.add(id);
    const assignment = chooseEffectiveRow(
      employmentAssignments.filter((row) => text(row.employeeId) === id),
      businessDate,
      true,
    );
    const position = positionsById.get(text(assignment.positionId)) || {};
    const orgUnit = orgUnitsById.get(text(assignment.orgUnitId)) || {};
    const capabilities = record(position.capabilities);
    const accessRoleLabel = getAssignedAccessRoleLabel({ employeeId: id, businessDate, roleAssignments, accessRoleById, grants });
    const role = firstText(position.name, employee.positionName, employee.role, accessRoleLabel) || "Роль не задана";
    const employeeName = firstText(employee.displayName, employee.name) || id;
    const fallbackDepartment = /директор|начальник производства|руководител/.test(normalizeLookup(`${role} ${employeeName}`))
      ? "Административный отдел"
      : "";
    const centerCandidate = firstText(assignment.workCenterId, position.workCenterId, assignment.orgUnitId, employee.workCenterId);
    const centerId = centerById.has(centerCandidate) && getRootCenterId(centerCandidate, centerById) ? centerCandidate : "";
    const canDistribute = capabilities.canDistribute === true;
    return [{
      id,
      name: formatPersonName(employeeName),
      role,
      department: firstText(orgUnit.name, employee.department, fallbackDepartment),
      personKind: canDistribute || text(position.kind) === "manager" ? "master" : "employee",
      canDistribute,
      canExecute: capabilities.canExecute !== false,
      centerId,
    }];
  }).sort((left, right) => left.department.localeCompare(right.department, "ru")
    || left.name.localeCompare(right.name, "ru")
    || left.id.localeCompare(right.id, "en"));
}

function withoutProjection(person: ProjectedPerson): AuthPickerPerson {
  const { centerId: _centerId, ...publicPerson } = person;
  return publicPerson;
}

function sortPeople(people: ProjectedPerson[]): ProjectedPerson[] {
  return [...people].sort((left, right) => left.role.localeCompare(right.role, "ru")
    || left.name.localeCompare(right.name, "ru")
    || left.id.localeCompare(right.id, "en"));
}

function buildDepartments(people: ProjectedPerson[], centers: CenterRow[]): AuthPickerDepartment[] {
  const centerById = new Map(centers.map((center) => [center.id, center] as const));
  const childrenByParent = new Map<string, CenterRow[]>();
  centers.forEach((center) => {
    if (!center.parentId || !centerById.has(center.parentId)) return;
    const children = childrenByParent.get(center.parentId) || [];
    children.push(center);
    childrenByParent.set(center.parentId, children);
  });
  childrenByParent.forEach((children) => children.sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en")));
  const roots = centers
    .filter((center) => !center.parentId || !centerById.has(center.parentId))
    .sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
  const departments = roots.flatMap((root): AuthPickerDepartment[] => {
    const departmentPeople = people.filter((person) => person.centerId && getRootCenterId(person.centerId, centerById) === root.id);
    if (!departmentPeople.length) return [];
    const directPeople = sortPeople(departmentPeople.filter((person) => person.centerId === root.id)).map(withoutProjection);
    const units = (childrenByParent.get(root.id) || []).flatMap((center): AuthPickerUnit[] => {
      const unitPeople = sortPeople(departmentPeople.filter((person) => isInSubtree(person.centerId, center.id, centerById))).map(withoutProjection);
      if (!unitPeople.length) return [];
      return [{
        id: center.id,
        name: center.name,
        caption: center.caption || "участок матрицы структуры",
        employeeCount: unitPeople.length,
        people: unitPeople,
      }];
    });
    return [{
      id: root.id,
      name: root.name,
      caption: root.caption || "отдел матрицы структуры",
      employeeCount: departmentPeople.length,
      directPeople,
      units,
    }];
  });

  const fallbackGroups = new Map<string, ProjectedPerson[]>();
  people.filter((person) => !person.centerId).forEach((person) => {
    const name = person.department || "Без отдела";
    const id = `fallback:${normalizeLookup(name) || "department"}`;
    const group = fallbackGroups.get(id) || [];
    group.push(person);
    fallbackGroups.set(id, group);
  });
  fallbackGroups.forEach((source, id) => {
    const first = source[0];
    const lookup = normalizeLookup(`${first?.role || ""} ${first?.department || ""} ${first?.name || ""}`);
    const name = /директор|начальник производства|руководител/.test(lookup)
      ? "Административный отдел"
      : first?.department || "Без отдела";
    const directPeople = sortPeople(source).map(withoutProjection);
    departments.push({
      id,
      name,
      caption: "нет привязки к участку матрицы",
      employeeCount: directPeople.length,
      directPeople,
      units: [],
    });
  });
  return departments.sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
}

function filterElevation(departments: AuthPickerDepartment[], forcedPersonId: string): AuthPickerDepartment[] {
  if (!forcedPersonId) return [];
  return departments.flatMap((department): AuthPickerDepartment[] => {
    const directPeople = department.directPeople.filter((person) => person.id === forcedPersonId);
    const units = department.units.flatMap((unit): AuthPickerUnit[] => {
      const people = unit.people.filter((person) => person.id === forcedPersonId);
      return people.length ? [{ ...unit, employeeCount: people.length, people }] : [];
    });
    const employeeCount = directPeople.length + units.reduce((total, unit) => total + unit.people.length, 0);
    return employeeCount ? [{ ...department, employeeCount, directPeople, units }] : [];
  });
}

export function isAuthPickerProductionInput(value: unknown): boolean {
  const input = record(value);
  const registries = resolveRegistries(input);
  return ["employees", "employmentAssignments", "orgUnits", "workCenters", "units", "positions", "accessRoles", "roleAssignments", "grants"]
    .some((name) => Array.isArray(registries[name]));
}

export function buildAuthPickerProductionModel(
  inputValue: unknown,
  capabilitiesValue: unknown = {},
  authStateValue: unknown = {},
): AuthPickerModel {
  const input = record(inputValue);
  const registries = resolveRegistries(input);
  const businessDate = validDate(input.businessDate) || validDate(record(input.session).businessDate) || new Date().toISOString().slice(0, 10);
  const state = resolveProductionState(input, capabilitiesValue, authStateValue);
  const centers = buildCenters(registries, businessDate);
  const people = buildPeople(registries, businessDate, centers);
  const allDepartments = buildDepartments(people, centers);
  const departments = state.elevation ? filterElevation(allDepartments, state.forcedPersonId) : allDepartments;
  const employeeCount = new Set(departments.flatMap((department) => [
    ...department.directPeople,
    ...department.units.flatMap((unit) => unit.people),
  ]).map((person) => person.id)).size;
  return { departments, employeeCount, ...state };
}
