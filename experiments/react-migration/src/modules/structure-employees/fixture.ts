export const structureEmployeesFixture = {
  migrationDiagnosticsCount: 152,
  registries: {
    orgUnits: [
      { id: "D-COATING", code: "D-COATING", name: "Отдел нанесения влагозащитных покрытий", kind: "department", isActive: true },
      { id: "D-MANUAL", code: "D-MANUAL", name: "Отдел ручного монтажа", kind: "department", isActive: true },
    ],
    workCenters: [
      { id: "D-COATING", code: "D-COATING", name: "Влагозащита", orgUnitId: "D-COATING", isActive: true },
      { id: "D-MANUAL", code: "D-MANUAL", name: "Ручной монтаж", orgUnitId: "D-MANUAL", isActive: true },
    ],
    positions: [
      { id: "POS-MASTER", name: "Мастер отдела", kind: "supervisor", orgUnitId: "D-COATING", workCenterId: "D-COATING", isActive: true },
      { id: "POS-COATING", name: "Оператор линии влагозащиты", kind: "worker", orgUnitId: "D-COATING", workCenterId: "D-COATING", isActive: true },
      { id: "POS-MANUAL", name: "Монтажник РЭА", kind: "worker", orgUnitId: "D-MANUAL", workCenterId: "D-MANUAL", isActive: true },
    ],
    employees: [
      { id: "EMP-001", displayName: "Николаев Ирина Сергеевич", personnelNumber: "0001", isActive: true },
      { id: "EMP-002", displayName: "Степанов Ирина Максимович", personnelNumber: "0002", isActive: true },
      { id: "EMP-003", displayName: "Петров Алексей Иванович", personnelNumber: "0003", isActive: false },
    ],
    employmentAssignments: [
      { id: "employment:EMP-001", employeeId: "EMP-001", positionId: "POS-MASTER", orgUnitId: "D-COATING", workCenterId: "D-COATING", isPrimary: true, validFrom: "2026-01-01", validTo: "" },
      { id: "employment:EMP-002", employeeId: "EMP-002", positionId: "POS-COATING", orgUnitId: "D-COATING", workCenterId: "D-COATING", isPrimary: true, validFrom: "2026-02-01", validTo: "" },
      { id: "employment:EMP-003", employeeId: "EMP-003", positionId: "POS-MANUAL", orgUnitId: "D-MANUAL", workCenterId: "D-MANUAL", isPrimary: true, validFrom: "2025-05-10", validTo: "2026-06-30" },
    ],
    equipment: [{ id: "EQ-001", name: "Установка влагозащиты", workCenterId: "D-COATING", quantity: 1, isActive: true }],
    responsibilityPolicies: [{ id: "POLICY-001", subjectEmployeeId: "EMP-001", mode: "department", targetEmployeeIds: ["EMP-002"] }],
  },
};

export const structureEmployeesUpdateFixture = {
  migrationDiagnosticsCount: structureEmployeesFixture.migrationDiagnosticsCount,
  registries: {
    ...structureEmployeesFixture.registries,
    employees: [{ id: "EMP-004", displayName: "Сидоров Павел Андреевич", personnelNumber: "0004", isActive: true }],
    employmentAssignments: [{ id: "employment:EMP-004", employeeId: "EMP-004", positionId: "POS-MANUAL", orgUnitId: "D-MANUAL", workCenterId: "D-MANUAL", isPrimary: true, validFrom: "2026-07-01", validTo: "" }],
  },
};
