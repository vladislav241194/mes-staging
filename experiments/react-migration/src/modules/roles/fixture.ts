export const rolesFixture = {
  moduleDefinitions: [
    { id: "roles", label: "Роли и доступ", group: "Система" },
    { id: "gantt", label: "Планирование", group: "Планирование" },
    { id: "shiftMasterBoard", label: "Мастерская", group: "Исполнение" },
    { id: "timesheet", label: "Табель", group: "Персонал" },
  ],
  item: {
    registries: {
      accessRoles: [
        { id: "admin", label: "Администратор", description: "Полная настройка системы", scope: "factory", defaultModuleId: "roles", isActive: true },
        { id: "master", label: "Мастер производства", description: "Распределение и исполнение смены", scope: "workCenter", defaultModuleId: "shiftMasterBoard", isActive: true },
        { id: "auditor", label: "Аудитор", description: "Контроль без изменения данных", scope: "factory", defaultModuleId: "roles", isActive: true, readOnly: true },
      ],
      grants: [
        ...["view", "edit", "print", "assign", "approve", "configure"].map((actionId) => ({ id: `admin-roles-${actionId}`, roleId: "admin", resourceId: "*", actionId, effect: "allow" })),
        { id: "master-workshop-view", roleId: "master", resourceId: "shiftMasterBoard", actionId: "view", effect: "allow" },
        { id: "master-workshop-edit", roleId: "master", resourceId: "shiftMasterBoard", actionId: "edit", effect: "allow" },
        { id: "master-workshop-assign", roleId: "master", resourceId: "shiftMasterBoard", actionId: "assign", effect: "allow" },
        { id: "master-timesheet-view", roleId: "master", resourceId: "timesheet", actionId: "view", effect: "allow" },
        { id: "auditor-roles-view", roleId: "auditor", resourceId: "roles", actionId: "view", effect: "allow" },
        { id: "auditor-roles-print", roleId: "auditor", resourceId: "roles", actionId: "print", effect: "allow" },
        { id: "auditor-gantt-view", roleId: "auditor", resourceId: "gantt", actionId: "view", effect: "allow" },
        { id: "auditor-gantt-print", roleId: "auditor", resourceId: "gantt", actionId: "print", effect: "allow" },
      ],
      roleAssignments: [
        { id: "assignment-admin", employeeId: "employee-admin", roleId: "admin" },
        { id: "assignment-master", employeeId: "employee-master", roleId: "master" },
        { id: "assignment-auditor", employeeId: "employee-auditor", roleId: "auditor" },
      ],
      employees: [
        { id: "employee-admin", displayName: "Смирнов Алексей", personnelNumber: "0001", isActive: true },
        { id: "employee-master", displayName: "Иванов Сергей", personnelNumber: "0105", isActive: true },
        { id: "employee-auditor", displayName: "Орлова Марина", personnelNumber: "0027", isActive: true },
      ],
      employmentAssignments: [
        { id: "employment-admin", employeeId: "employee-admin", positionId: "position-admin", orgUnitId: "org-admin", isPrimary: true },
        { id: "employment-master", employeeId: "employee-master", positionId: "position-master", orgUnitId: "org-production", isPrimary: true },
        { id: "employment-auditor", employeeId: "employee-auditor", positionId: "position-auditor", orgUnitId: "org-quality", isPrimary: true },
      ],
      positions: [
        { id: "position-admin", name: "Системный администратор" },
        { id: "position-master", name: "Мастер участка" },
        { id: "position-auditor", name: "Внутренний аудитор" },
      ],
      orgUnits: [
        { id: "org-admin", name: "Управление" },
        { id: "org-production", name: "Производство" },
        { id: "org-quality", name: "Контроль качества" },
      ],
    },
  },
};

export const rolesUpdateFixture = {
  ...rolesFixture,
  item: {
    registries: {
      ...rolesFixture.item.registries,
      accessRoles: rolesFixture.item.registries.accessRoles.map((role) => role.id === "admin" ? { ...role, description: "Полная настройка и аудит системы" } : role),
    },
  },
};
