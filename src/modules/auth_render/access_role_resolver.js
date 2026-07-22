function normalizeAssignments(value = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function inferAccessRoleIdForPerson(person = null, options = {}) {
  const defaultRoleId = String(options.defaultRoleId || "admin").trim() || "admin";
  if (!person?.id) return defaultRoleId;

  const normalizeAccessRoleAssignments = typeof options.normalizeAccessRoleAssignments === "function"
    ? options.normalizeAccessRoleAssignments
    : normalizeAssignments;
  const normalizeLookupText = typeof options.normalizeLookupText === "function"
    ? options.normalizeLookupText
    : normalizeText;
  const assignments = normalizeAccessRoleAssignments(options.accessRoleAssignments);
  const assignedRoleId = String(assignments?.[person.id] || "").trim();
  if (assignedRoleId) return assignedRoleId;

  const lookup = normalizeLookupText(`${person.name || ""} ${person.role || ""} ${person.department || ""}`);
  if (/директор|начальник производства|руководитель производства/.test(lookup)) return "productionHead";
  if (/технолог|инженер|подготовк/.test(lookup)) return "technologist";
  if (/диспетчер|пдо|планиров/.test(lookup)) return "planner";
  if (person.personKind === "master" || person.canDistribute || /мастер|начальник участка|начальник отдела/.test(lookup)) return "master";
  if (person.canCloseFact && !person.canExecute) return "dispatcher";
  return "executor";
}
