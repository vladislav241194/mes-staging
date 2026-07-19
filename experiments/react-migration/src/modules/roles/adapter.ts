export const ROLE_ACTIONS = [
  { id: "view", label: "Видит" },
  { id: "edit", label: "Правит" },
  { id: "print", label: "Печать" },
  { id: "assign", label: "Назн." },
  { id: "approve", label: "Утв." },
  { id: "configure", label: "Настр." },
] as const;

export type RoleActionId = typeof ROLE_ACTIONS[number]["id"];

interface EntityDto {
  id?: unknown;
  label?: unknown;
  name?: unknown;
  description?: unknown;
  scope?: unknown;
  defaultModuleId?: unknown;
  defaultModule?: unknown;
  isActive?: unknown;
  readOnly?: unknown;
  roleId?: unknown;
  resourceId?: unknown;
  moduleId?: unknown;
  actionId?: unknown;
  action?: unknown;
  effect?: unknown;
  employeeId?: unknown;
  subjectId?: unknown;
  displayName?: unknown;
  personnelNumber?: unknown;
  positionId?: unknown;
  orgUnitId?: unknown;
  isPrimary?: unknown;
}

export interface RolesModuleDefinition {
  id: string;
  label: string;
  group: string;
}

export interface RoleAssignedEmployee {
  id: string;
  name: string;
  personnelNumber: string;
  positionLabel: string;
  orgUnitLabel: string;
}

export interface AccessRoleReadItem {
  id: string;
  label: string;
  description: string;
  scope: string;
  defaultModuleId: string;
  defaultModuleLabel: string;
  active: boolean;
  readOnly: boolean;
  grants: Record<string, Partial<Record<RoleActionId, boolean>>>;
  allowedModuleCount: number;
  explicitGrantCount: number;
  assignedEmployees: RoleAssignedEmployee[];
}

export interface RolesReadModel {
  roles: AccessRoleReadItem[];
  modules: RolesModuleDefinition[];
  assignmentCount: number;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rows(value: unknown): EntityDto[] {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as EntityDto[] : [];
}

function getPayloadParts(payload: unknown): { registries: Record<string, unknown>; modules: RolesModuleDefinition[] } {
  const root = record(payload);
  const item = Object.keys(record(root.item)).length ? record(root.item) : root;
  const domains = Object.keys(record(item.domains)).length ? record(item.domains) : item;
  const registries = Object.keys(record(domains.registries)).length ? record(domains.registries) : domains;
  const rawModules = Array.isArray(root.moduleDefinitions)
    ? root.moduleDefinitions
    : Array.isArray(item.moduleDefinitions)
      ? item.moduleDefinitions
      : [];
  const modules = rawModules.flatMap((entry): RolesModuleDefinition[] => {
    const dto = record(entry);
    const id = text(dto.id);
    if (!id || id === "authPrototype") return [];
    return [{ id, label: text(dto.label) || id, group: text(dto.group) || "Система" }];
  });
  return { registries, modules };
}

function indexById(items: EntityDto[]): Map<string, EntityDto> {
  return new Map(items.flatMap((item) => text(item.id) ? [[text(item.id), item] as const] : []));
}

function actionId(value: unknown): RoleActionId | "" {
  const normalized = text(value);
  return ROLE_ACTIONS.some((action) => action.id === normalized) ? normalized as RoleActionId : "";
}

export function roleAllows(role: AccessRoleReadItem, moduleId: string, action: RoleActionId): boolean {
  if (!role.active) return false;
  const grants = role.grants[moduleId] || role.grants["*"] || {};
  if (grants.view !== true) return false;
  if (role.readOnly && !["view", "print"].includes(action)) return false;
  return grants[action] === true;
}

export function adaptRoles(payload: unknown): RolesReadModel {
  const { registries, modules } = getPayloadParts(payload);
  const roleRows = rows(registries.accessRoles);
  const grantRows = rows(registries.grants);
  const assignmentRows = rows(registries.roleAssignments);
  const employeeRows = rows(registries.employees);
  const employmentRows = rows(registries.employmentAssignments);
  const positions = indexById(rows(registries.positions));
  const orgUnits = indexById(rows(registries.orgUnits));
  const employees = indexById(employeeRows);
  const grantsByRole = new Map<string, Record<string, Partial<Record<RoleActionId, boolean>>>>();

  grantRows.forEach((grant) => {
    const roleId = text(grant.roleId);
    const moduleId = text(grant.resourceId || grant.moduleId);
    const action = actionId(grant.actionId || grant.action);
    if (!roleId || !moduleId || !action) return;
    if (!grantsByRole.has(roleId)) grantsByRole.set(roleId, {});
    const matrix = grantsByRole.get(roleId)!;
    matrix[moduleId] = { ...(matrix[moduleId] || {}), [action]: text(grant.effect) !== "deny" };
  });

  const roles = roleRows.flatMap((role): AccessRoleReadItem[] => {
    const id = text(role.id);
    const label = text(role.label || role.name);
    if (!id || !label) return [];
    const grants = grantsByRole.get(id) || {};
    const defaultModuleId = text(role.defaultModuleId || role.defaultModule);
    const assignedEmployees = assignmentRows.flatMap((assignment): RoleAssignedEmployee[] => {
      if (text(assignment.roleId) !== id) return [];
      const employeeId = text(assignment.employeeId || assignment.subjectId);
      const employee = employees.get(employeeId);
      if (!employeeId || !employee) return [];
      const employment = employmentRows.find((row) => text(row.employeeId) === employeeId && row.isPrimary !== false)
        || employmentRows.find((row) => text(row.employeeId) === employeeId);
      const position = positions.get(text(employment?.positionId));
      const orgUnit = orgUnits.get(text(employment?.orgUnitId));
      return [{
        id: employeeId,
        name: text(employee.displayName || employee.name) || employeeId,
        personnelNumber: text(employee.personnelNumber) || "—",
        positionLabel: text(position?.name || position?.label || position?.id) || "—",
        orgUnitLabel: text(orgUnit?.name || orgUnit?.label || orgUnit?.id) || "—",
      }];
    }).sort((left, right) => left.name.localeCompare(right.name, "ru") || left.id.localeCompare(right.id, "en"));
    const item: AccessRoleReadItem = {
      id,
      label,
      description: text(role.description),
      scope: text(role.scope) || "factory",
      defaultModuleId,
      defaultModuleLabel: modules.find((moduleItem) => moduleItem.id === defaultModuleId)?.label || defaultModuleId || "Не выбран",
      active: role.isActive !== false,
      readOnly: Boolean(role.readOnly),
      grants,
      allowedModuleCount: 0,
      explicitGrantCount: Object.values(grants).reduce((sum, moduleGrants) => sum + Object.keys(moduleGrants).length, 0),
      assignedEmployees,
    };
    item.allowedModuleCount = modules.filter((moduleItem) => roleAllows(item, moduleItem.id, "view")).length;
    return [item];
  });

  return { roles, modules, assignmentCount: assignmentRows.length };
}
