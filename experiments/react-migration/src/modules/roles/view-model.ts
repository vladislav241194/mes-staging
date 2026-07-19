import type { AccessRoleReadItem } from "./adapter";

const SCOPE_LABELS: Record<string, string> = {
  factory: "Вся фабрика",
  department: "Свой отдел",
  workCenter: "Свои участки",
  self: "Только свои записи",
};

export function getRoleScopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope || "Неизвестная область";
}

export function resolveVisibleRole(roles: AccessRoleReadItem[], selectedId: string): AccessRoleReadItem | null {
  return roles.find((role) => role.id === selectedId) || roles[0] || null;
}

export function getAssignedEmployeeSummary(role: AccessRoleReadItem): string {
  return role.assignedEmployees.length
    ? role.assignedEmployees.map((employee) => employee.name).join(", ")
    : "Явных назначений нет";
}
