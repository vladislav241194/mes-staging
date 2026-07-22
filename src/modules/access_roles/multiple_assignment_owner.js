function text(value) {
  return String(value ?? "").trim();
}

function sortedIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
}

export function prepareAdditionalRoleAssignment({
  assignments = [],
  confirmEmployeeId = "",
  employeeId = "",
  expectedAssignmentIds = [],
  roleId = "",
} = {}) {
  const normalizedEmployeeId = text(employeeId);
  const normalizedRoleId = text(roleId);
  if (!normalizedEmployeeId || text(confirmEmployeeId) !== normalizedEmployeeId) {
    return { ok: false, code: "employee-confirmation-mismatch", message: "Подтверждение относится к другому сотруднику." };
  }
  if (!normalizedRoleId) {
    return { ok: false, code: "role-required", message: "Выберите дополнительную роль." };
  }
  const rows = Array.isArray(assignments) ? assignments : [];
  const employeeAssignments = rows.filter((assignment) => text(assignment?.employeeId || assignment?.subjectId) === normalizedEmployeeId);
  const actualAssignmentIds = sortedIds(employeeAssignments.map((assignment) => assignment?.id));
  if (actualAssignmentIds.length !== employeeAssignments.length) {
    return { ok: false, code: "stable-assignment-id-required", message: "Одно из текущих назначений не имеет stable ID." };
  }
  const expectedIds = sortedIds(expectedAssignmentIds);
  if (expectedIds.length !== actualAssignmentIds.length || expectedIds.some((id, index) => id !== actualAssignmentIds[index])) {
    return { ok: false, code: "assignment-set-changed", message: "Набор назначений сотрудника изменился в другом сеансе." };
  }
  if (employeeAssignments.some((assignment) => text(assignment?.roleId) === normalizedRoleId)) {
    return { ok: false, code: "duplicate-role", message: "Эта роль уже назначена сотруднику." };
  }
  const assignmentId = `access-role-assignment:${normalizedEmployeeId}:${normalizedRoleId}`;
  if (rows.some((assignment) => text(assignment?.id) === assignmentId)) {
    return { ok: false, code: "assignment-id-conflict", message: "Stable ID нового назначения уже занят." };
  }
  return {
    ok: true,
    assignment: {
      id: assignmentId,
      employeeId: normalizedEmployeeId,
      roleId: normalizedRoleId,
      source: "access-control",
      sourceRef: { system: "access-control", command: "add-assignment" },
    },
  };
}
