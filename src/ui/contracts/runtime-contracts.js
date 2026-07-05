export const HARD_UI_RUNTIME_MODULE_IDS = [
  "authPrototype",
  "authSessionPrototype",
  "planningTable",
  "roles",
  "productionStructureMatrix",
  "shiftMasterBoard",
  "supply",
  "shopMap",
  "directories",
  "products",
  "nomenclature",
  "routes",
  "planning",
  "weeklyProductionControl",
];

export const PARTIAL_UI_RUNTIME_MODULE_IDS = [
  "dispatch",
  "shiftWorkOrders",
  "employees",
  "timesheet",
];

export const PARTIAL_UI_RUNTIME_CONTRACTS = {
  dispatch: {
    status: "placeholder",
    reason: "Диспетчерская намеренно оставлена заглушкой после вывода старого функционала.",
    nextMigration: "Либо удалить модуль из продуктового контура, либо собрать новый Dispatcher runtime через ModuleHeader/Panel.",
  },
  shiftWorkOrders: {
    status: "partial-live",
    reason: "Живой журнал СЗН уже использует часть UI-kit, но browser coverage все еще фиксирует неполный hard-runtime contract.",
    nextMigration: "Довести TableWrap/StatusToken/detail-panel до единого MES table/detail contract без изменения логики СЗН.",
  },
  employees: {
    status: "legacy-compat",
    reason: "Экран сотрудников оставлен как совместимость рядом с модулем структуры и не является целевой точкой ввода прав.",
    nextMigration: "После финализации модуля структуры либо удалить экран, либо перевести на ModuleHeader/ActionBar/TableWrap.",
  },
  timesheet: {
    status: "data-dense-limited-mobile",
    reason: "Табель является data-dense таблицей с особым режимом плотности; текущее покрытие не равно обычной панельной странице.",
    nextMigration: "Выделить отдельный data-dense runtime contract или мигрировать header/action controls в hard-runtime без изменения таблицы.",
  },
};

export const SPECIAL_UI_RUNTIME_MODULE_IDS = [
  "gantt",
  "visualSystem",
];

export const SPECIAL_UI_RUNTIME_CONTRACTS = {
  gantt: {
    runtime: "gantt-v1",
    component: "GanttRuntime",
    protection: "special-runtime-protected",
    contract: "Gantt Phase 5 stabilization contract",
  },
  visualSystem: {
    runtime: "visual-system-v1",
    component: "VisualSystemRuntime",
  },
};

export const LEGACY_UI_RUNTIME_MODULE_IDS = [];

export const UI_RUNTIME_COVERAGE_NOTES = {
  hard: "Собран через renderUiModulePage и защищен hard-runtime геометрическими QA-gates.",
  special: "Имеет специализированный runtime-gate, потому что модуль не является обычной панельной страницей.",
  partial: "Использует UI-kit helpers/markers, но верхняя оболочка еще не переведена на renderUiModulePage.",
  legacy: "Живой модуль на историческом layout/CSS; требует отдельной миграции перед жесткими gates.",
};
