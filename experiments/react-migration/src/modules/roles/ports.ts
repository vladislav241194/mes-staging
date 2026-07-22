export const ROLE_RESPONSIBILITY_SCOPE_TYPES = ["factory", "department", "workCenter", "self"] as const;

export type RoleResponsibilityScopeType = typeof ROLE_RESPONSIBILITY_SCOPE_TYPES[number];

export interface RoleResponsibilityScopeDraft {
  type: RoleResponsibilityScopeType;
  targetId: string;
}

export interface RoleAssignmentDraft {
  employeeId: string;
  roleId: string;
  validFrom: string;
  validTo: string;
  responsibilityScope: RoleResponsibilityScopeDraft;
}

export type RolesDeferredCommand =
  | { type: "add-assignment"; payload: RoleAssignmentDraft & { confirmEmployeeId: string; expectedAssignmentIds: string[] } }
  | { type: "update-assignment-window"; payload: Pick<RoleAssignmentDraft, "employeeId" | "validFrom" | "validTo"> & { assignmentId: string } }
  | { type: "set-subject-responsibility-scope"; payload: { employeeId: string; responsibilityScope: RoleResponsibilityScopeDraft } }
  | { type: "set-assignment-responsibility-scope"; payload: { assignmentId: string; employeeId: string; responsibilityScope: RoleResponsibilityScopeDraft } }
  | { type: "set-role-read-only"; payload: { roleId: string; confirmRoleId: string; readOnly: boolean } };

export interface RolesDeferredCapabilities {
  canEditMultipleAssignments: boolean;
  canEditEffectiveWindow: boolean;
  canEditSubjectResponsibilityScope: boolean;
  canEditAssignmentResponsibilityScope: boolean;
  canEditReadOnlyRole: boolean;
}

export interface RolesCommandResult {
  ok?: boolean;
  message?: string;
}

export type RolesDeferredCommandPort = (command: RolesDeferredCommand) => Promise<RolesCommandResult | void>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function adaptRolesDeferredCapabilities(value: unknown): RolesDeferredCapabilities {
  const capabilities = record(value);
  return {
    canEditMultipleAssignments: capabilities.multipleAssignmentsEdit === true,
    canEditEffectiveWindow: capabilities.effectiveWindowEdit === true,
    canEditSubjectResponsibilityScope: capabilities.subjectResponsibilityScopeEdit === true,
    canEditAssignmentResponsibilityScope: capabilities.assignmentResponsibilityScopeEdit === true,
    canEditReadOnlyRole: capabilities.readOnlyRoleEdit === true,
  };
}

export function canExecuteRolesDeferredCommand(capabilities: RolesDeferredCapabilities, command: RolesDeferredCommand): boolean {
  switch (command.type) {
    case "add-assignment":
      return capabilities.canEditMultipleAssignments === true;
    case "update-assignment-window":
      return capabilities.canEditEffectiveWindow === true;
    case "set-subject-responsibility-scope":
      return capabilities.canEditSubjectResponsibilityScope === true;
    case "set-assignment-responsibility-scope":
      return capabilities.canEditAssignmentResponsibilityScope === true;
    case "set-role-read-only":
      return capabilities.canEditReadOnlyRole === true;
  }
}
