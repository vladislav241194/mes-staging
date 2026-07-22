type AccessRoleAssignmentMap = Record<PropertyKey, unknown>;

export interface AccessRolePerson {
  id?: unknown;
  name?: unknown;
  role?: unknown;
  department?: unknown;
  personKind?: unknown;
  canDistribute?: unknown;
  canCloseFact?: unknown;
  canExecute?: unknown;
  [key: string]: unknown;
}

export interface AccessRoleResolverOptions {
  defaultRoleId?: unknown;
  accessRoleAssignments?: unknown;
  normalizeAccessRoleAssignments?: (value: unknown) => AccessRoleAssignmentMap;
  normalizeLookupText?: (value: unknown) => string;
}

function normalizeAssignments(value: unknown = {}): AccessRoleAssignmentMap {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AccessRoleAssignmentMap
    : {};
}

function normalizeText(value: unknown = ""): string {
  return String(value || "").trim().toLowerCase();
}

export function inferAccessRoleIdForPerson(
  person: AccessRolePerson | null = null,
  options: AccessRoleResolverOptions = {},
): string {
  const defaultRoleId = String(options.defaultRoleId || "admin").trim() || "admin";
  if (!person?.id) return defaultRoleId;

  const normalizeAccessRoleAssignments = typeof options.normalizeAccessRoleAssignments === "function"
    ? options.normalizeAccessRoleAssignments
    : normalizeAssignments;
  const normalizeLookupText = typeof options.normalizeLookupText === "function"
    ? options.normalizeLookupText
    : normalizeText;
  const assignments = normalizeAccessRoleAssignments(options.accessRoleAssignments);
  const assignedRoleId = String(assignments?.[person.id as PropertyKey] || "").trim();
  if (assignedRoleId) return assignedRoleId;

  const lookup = normalizeLookupText(`${person.name || ""} ${person.role || ""} ${person.department || ""}`);
  if (/директор|начальник производства|руководитель производства/.test(lookup)) return "productionHead";
  if (/технолог|инженер|подготовк/.test(lookup)) return "technologist";
  if (/диспетчер|пдо|планиров/.test(lookup)) return "planner";
  if (person.personKind === "master" || person.canDistribute || /мастер|начальник участка|начальник отдела/.test(lookup)) return "master";
  if (person.canCloseFact && !person.canExecute) return "dispatcher";
  return "executor";
}
