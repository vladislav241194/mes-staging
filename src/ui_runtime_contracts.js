export const HARD_UI_RUNTIME_MODULE_IDS = [
  "authPrototype",
  "authSessionPrototype",
  "planningTable",
  "matrix",
  "shiftWorkOrders",
  "timesheet",
  "roles",
  "productionStructureMatrix",
  "employees",
  "dispatch",
  "shiftMasterBoard",
  "supply",
  "shopMap",
  "directories",
  "products",
  "nomenclature",
  "routes",
  "planning",
];

export const PARTIAL_UI_RUNTIME_MODULE_IDS = [];

export const SPECIAL_UI_RUNTIME_MODULE_IDS = [
  "gantt",
  "visualSystem",
];

export const SPECIAL_UI_RUNTIME_CONTRACTS = {
  gantt: {
    runtime: "gantt-v1",
    component: "GanttRuntime",
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

export function getUiRuntimeCoverageStatus(moduleId = "") {
  const id = String(moduleId || "").trim();
  if (HARD_UI_RUNTIME_MODULE_IDS.includes(id)) return "hard";
  if (SPECIAL_UI_RUNTIME_MODULE_IDS.includes(id)) return "special";
  if (PARTIAL_UI_RUNTIME_MODULE_IDS.includes(id)) return "partial";
  if (LEGACY_UI_RUNTIME_MODULE_IDS.includes(id)) return "legacy";
  return "unknown";
}
